"""
Pipeline Module: State Machine + Asset Manifest + Tile Download

Manages the lifecycle of analysis assets (tiles, thumbnails, vectors)
with a state machine approach for reliable asset persistence.
"""

import os
import math
import json
import hashlib
import asyncio
import logging
import time
from enum import Enum
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path

import aiohttp

logger = logging.getLogger(__name__)

# ==============================================================================
# CONSTANTS
# ==============================================================================

STORAGE_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage")
TILES_DIR = os.path.join(STORAGE_ROOT, "tiles")

# Zoom levels to download for local tile cache
MIN_ZOOM = 10
MAX_ZOOM = 15

# Download concurrency
MAX_CONCURRENT_TILE_DOWNLOADS = 20
TILE_DOWNLOAD_TIMEOUT = 15  # seconds per tile
MAX_RETRY_PER_TILE = 2

# ==============================================================================
# PIPELINE STATE ENUM
# ==============================================================================

class PipelineState(str, Enum):
    LEGACY = "LEGACY"
    QUEUED = "QUEUED"
    ANALYZING = "ANALYZING"
    SAVING_ASSETS = "SAVING_ASSETS"
    VALIDATING = "VALIDATING"
    COMPLETED = "COMPLETED"
    RECOVERING = "RECOVERING"
    FAILED = "FAILED"


# ==============================================================================
# TILE COORDINATE MATH
# ==============================================================================

def lng_to_tile_x(lng: float, zoom: int) -> int:
    """Convert longitude to tile X coordinate."""
    return int((lng + 180.0) / 360.0 * (1 << zoom))

def lat_to_tile_y(lat: float, zoom: int) -> int:
    """Convert latitude to tile Y coordinate."""
    lat_rad = math.radians(lat)
    n = 1 << zoom
    return int((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n)

def get_tile_coords_for_bbox(bbox: Dict[str, float], zoom: int) -> List[Tuple[int, int]]:
    """
    Get all tile (x, y) coordinates covering a bounding box at a given zoom level.
    bbox: {"west": float, "south": float, "east": float, "north": float}
    """
    x_min = lng_to_tile_x(bbox["west"], zoom)
    x_max = lng_to_tile_x(bbox["east"], zoom)
    y_min = lat_to_tile_y(bbox["north"], zoom)  # north has smaller y
    y_max = lat_to_tile_y(bbox["south"], zoom)   # south has larger y

    coords = []
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            coords.append((x, y))
    return coords

def calculate_bbox_from_geojson(geojson: dict) -> Dict[str, float]:
    """Extract bounding box from a GeoJSON geometry or feature collection."""
    coords = []

    def extract_coords(obj):
        if isinstance(obj, (list, tuple)):
            if len(obj) >= 2 and isinstance(obj[0], (int, float)):
                coords.append((obj[0], obj[1]))
            else:
                for item in obj:
                    extract_coords(item)
        elif isinstance(obj, dict):
            if "coordinates" in obj:
                extract_coords(obj["coordinates"])
            if "geometry" in obj:
                extract_coords(obj["geometry"])
            if "geometries" in obj:
                for g in obj["geometries"]:
                    extract_coords(g)
            if "features" in obj:
                for f in obj["features"]:
                    extract_coords(f)

    extract_coords(geojson)

    if not coords:
        raise ValueError("No coordinates found in GeoJSON")

    lngs = [c[0] for c in coords]
    lats = [c[1] for c in coords]

    return {
        "west": min(lngs),
        "east": max(lngs),
        "south": min(lats),
        "north": max(lats),
    }

def estimate_tile_count(bbox: Dict[str, float], min_zoom: int = MIN_ZOOM, max_zoom: int = MAX_ZOOM) -> int:
    """Estimate total tile count across all zoom levels for a bbox."""
    total = 0
    for z in range(min_zoom, max_zoom + 1):
        tiles = get_tile_coords_for_bbox(bbox, z)
        total += len(tiles)
    return total


# ==============================================================================
# ASSET MANIFEST
# ==============================================================================

class AssetManifest:
    """Manages the asset manifest for an analysis history item."""

    @staticmethod
    def generate(history_id: str, years: List[int], bbox: Dict[str, float],
                 has_slope: bool = False) -> dict:
        """Generate an initial asset manifest describing expected assets."""
        history_id_short = history_id[:8]
        manifest = {
            "version": 1,
            "created_at": datetime.now().isoformat(),
            "history_id": history_id,
            "history_id_short": history_id_short,
            "bbox": bbox,
            "zoom_range": [MIN_ZOOM, MAX_ZOOM],
            "years": sorted(years),
            "assets_per_year": {},
            "slope": {"status": "pending"} if has_slope else {"status": "skipped"},
            "hotspots": {"status": "pending"},
            "total_tiles_expected": 0,
            "total_tiles_downloaded": 0,
        }

        total_expected = 0
        for year in years:
            tiles_per_zoom = {}
            year_tile_count = 0
            for z in range(MIN_ZOOM, MAX_ZOOM + 1):
                tile_coords = get_tile_coords_for_bbox(bbox, z)
                tiles_per_zoom[str(z)] = len(tile_coords)
                year_tile_count += len(tile_coords)

            manifest["assets_per_year"][str(year)] = {
                "thumb_url": {"status": "pending", "local_path": None},
                "rgb_thumb_url": {"status": "pending", "local_path": None},
                "tile_archive": {
                    "status": "pending",
                    "local_dir": f"/storage/tiles/{history_id_short}/{year}/",
                    "tile_count": 0,
                    "expected_count": year_tile_count,
                    "tiles_per_zoom": tiles_per_zoom,
                },
                "rgb_tile_archive": {
                    "status": "pending",
                    "local_dir": f"/storage/tiles/{history_id_short}/{year}_rgb/",
                    "tile_count": 0,
                    "expected_count": year_tile_count,
                    "tiles_per_zoom": tiles_per_zoom,
                },
                "vector_geojson": {"status": "pending", "feature_count": 0},
            }
            # classified + rgb = 2x tiles
            total_expected += year_tile_count * 2

        manifest["total_tiles_expected"] = total_expected
        return manifest

    @staticmethod
    def update_asset_status(manifest: dict, year: str, asset_key: str,
                            status: str, **kwargs) -> dict:
        """Update status of a specific asset in the manifest."""
        if year and str(year) in manifest.get("assets_per_year", {}):
            asset = manifest["assets_per_year"][str(year)].get(asset_key, {})
            asset["status"] = status
            for k, v in kwargs.items():
                asset[k] = v
            manifest["assets_per_year"][str(year)][asset_key] = asset
        elif asset_key in ("slope", "hotspots"):
            manifest[asset_key]["status"] = status
            for k, v in kwargs.items():
                manifest[asset_key][k] = v
        return manifest

    @staticmethod
    def calculate_progress(manifest: dict) -> dict:
        """Calculate overall progress from manifest."""
        total_expected = manifest.get("total_tiles_expected", 0)
        total_downloaded = manifest.get("total_tiles_downloaded", 0)

        # Count asset statuses
        total_assets = 0
        valid_assets = 0
        for year_data in manifest.get("assets_per_year", {}).values():
            for key in ("thumb_url", "rgb_thumb_url", "tile_archive",
                        "rgb_tile_archive", "vector_geojson"):
                asset = year_data.get(key, {})
                total_assets += 1
                if asset.get("status") == "valid":
                    valid_assets += 1

        # Include slope/hotspots
        for key in ("slope", "hotspots"):
            info = manifest.get(key, {})
            if info.get("status") != "skipped":
                total_assets += 1
                if info.get("status") == "valid":
                    valid_assets += 1

        tile_pct = (total_downloaded / total_expected * 100) if total_expected > 0 else 0
        asset_pct = (valid_assets / total_assets * 100) if total_assets > 0 else 0

        return {
            "tile_progress_pct": round(tile_pct, 1),
            "asset_progress_pct": round(asset_pct, 1),
            "total_tiles_expected": total_expected,
            "total_tiles_downloaded": total_downloaded,
            "total_assets": total_assets,
            "valid_assets": valid_assets,
        }

    @staticmethod
    def find_missing_assets(manifest: dict) -> List[dict]:
        """Find assets that are not yet valid."""
        missing = []
        for year, year_data in manifest.get("assets_per_year", {}).items():
            for key in ("thumb_url", "rgb_thumb_url", "tile_archive",
                        "rgb_tile_archive", "vector_geojson"):
                asset = year_data.get(key, {})
                if asset.get("status") not in ("valid", "skipped"):
                    missing.append({"year": year, "asset": key, "current_status": asset.get("status")})
        for key in ("slope", "hotspots"):
            info = manifest.get(key, {})
            if info.get("status") not in ("valid", "skipped"):
                missing.append({"year": None, "asset": key, "current_status": info.get("status")})
        return missing


# ==============================================================================
# TILE DOWNLOADER
# ==============================================================================

class TileDownloader:
    """Downloads map tiles from GEE ephemeral URLs and saves them locally."""

    def __init__(self, storage_root: str = STORAGE_ROOT):
        self.storage_root = storage_root
        self.tiles_dir = os.path.join(storage_root, "tiles")

    def _tile_path(self, history_id_short: str, subdir: str, z: int, x: int, y: int) -> str:
        """Get filesystem path for a tile."""
        return os.path.join(self.tiles_dir, history_id_short, subdir, str(z), str(x), f"{y}.png")

    def _tile_exists(self, path: str) -> bool:
        """Check if a tile file exists and has content."""
        return os.path.isfile(path) and os.path.getsize(path) > 0

    async def download_tiles_for_url(
        self,
        tile_url_template: str,
        history_id_short: str,
        subdir: str,
        bbox: Dict[str, float],
        min_zoom: int = MIN_ZOOM,
        max_zoom: int = MAX_ZOOM,
        on_progress: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """
        Download all tiles for a GEE tile URL template across zoom levels.

        tile_url_template: GEE URL like https://earthengine.googleapis.com/.../tiles/{z}/{x}/{y}
        Returns: {"downloaded": int, "skipped": int, "failed": int, "total": int}
        """
        stats = {"downloaded": 0, "skipped": 0, "failed": 0, "total": 0}

        # Collect all tile jobs
        jobs = []
        for z in range(min_zoom, max_zoom + 1):
            tile_coords = get_tile_coords_for_bbox(bbox, z)
            for (x, y) in tile_coords:
                stats["total"] += 1
                dest_path = self._tile_path(history_id_short, subdir, z, x, y)
                if self._tile_exists(dest_path):
                    stats["skipped"] += 1
                    continue

                # Build GEE tile URL
                tile_url = tile_url_template.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))
                jobs.append((tile_url, dest_path, z, x, y))

        if not jobs:
            print(f"      All {stats['skipped']} tiles already cached for {subdir}")
            return stats

        print(f"      Downloading {len(jobs)} tiles for {history_id_short}/{subdir} "
              f"(skipping {stats['skipped']} cached)")

        # Download with concurrency limit
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_TILE_DOWNLOADS)
        connector = aiohttp.TCPConnector(limit=MAX_CONCURRENT_TILE_DOWNLOADS, force_close=True)
        timeout = aiohttp.ClientTimeout(total=TILE_DOWNLOAD_TIMEOUT)

        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            async def download_one(tile_url: str, dest_path: str):
                async with semaphore:
                    for attempt in range(MAX_RETRY_PER_TILE + 1):
                        try:
                            async with session.get(tile_url) as resp:
                                if resp.status == 200:
                                    data = await resp.read()
                                    if len(data) > 0:
                                        # Ensure directory exists
                                        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                                        # Write atomically
                                        tmp_path = dest_path + ".tmp"
                                        with open(tmp_path, "wb") as f:
                                            f.write(data)
                                        os.replace(tmp_path, dest_path)
                                        stats["downloaded"] += 1
                                        if on_progress:
                                            on_progress(stats["downloaded"] + stats["skipped"], stats["total"])
                                        return
                                    else:
                                        # Empty tile (transparent) — save a marker
                                        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                                        with open(dest_path, "wb") as f:
                                            f.write(data)
                                        stats["downloaded"] += 1
                                        return
                                elif resp.status == 404:
                                    # Tile doesn't exist at this coordinate — skip
                                    stats["skipped"] += 1
                                    return
                                else:
                                    if attempt < MAX_RETRY_PER_TILE:
                                        await asyncio.sleep(0.5 * (attempt + 1))
                                        continue
                                    stats["failed"] += 1
                                    return
                        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                            if attempt < MAX_RETRY_PER_TILE:
                                await asyncio.sleep(0.5 * (attempt + 1))
                                continue
                            logger.debug(f"Tile download failed after retries: {e}")
                            stats["failed"] += 1
                            return

            tasks = [download_one(url, path) for url, path, _, _, _ in jobs]
            await asyncio.gather(*tasks)

        print(f"      Tile download done for {subdir}: "
                     f"downloaded={stats['downloaded']}, skipped={stats['skipped']}, "
                     f"failed={stats['failed']}")
        return stats

    def count_existing_tiles(self, history_id_short: str, subdir: str) -> int:
        """Count existing tile files for a given asset directory."""
        tile_dir = os.path.join(self.tiles_dir, history_id_short, subdir)
        if not os.path.isdir(tile_dir):
            return 0
        count = 0
        for root, dirs, files in os.walk(tile_dir):
            count += sum(1 for f in files if f.endswith(".png"))
        return count

    def cleanup_tiles(self, history_id_short: str):
        """Remove all tiles for a history item."""
        tile_dir = os.path.join(self.tiles_dir, history_id_short)
        if os.path.isdir(tile_dir):
            import shutil
            shutil.rmtree(tile_dir, ignore_errors=True)


# ==============================================================================
# PIPELINE MANAGER
# ==============================================================================

class PipelineManager:
    """
    Orchestrates the pipeline: state transitions, asset download, validation.
    Works with Supabase for state persistence.
    """

    def __init__(self, supabase_client, storage_root: str = STORAGE_ROOT):
        self.supabase = supabase_client
        self.downloader = TileDownloader(storage_root)
        self.storage_root = storage_root

    async def _update_state(self, history_id: str, state: PipelineState,
                            manifest: Optional[dict] = None):
        """Update pipeline state (and optionally manifest) in the database."""
        update = {"pipeline_state": state.value}
        if manifest is not None:
            update["asset_manifest"] = manifest
        try:
            await asyncio.to_thread(
                lambda: self.supabase.table("analysis_history")
                .update(update)
                .eq("id", history_id)
                .execute()
            )
        except Exception as e:
            print(f"❌ Failed to update pipeline state for {history_id[:8]}: {e}")

    async def _get_history(self, history_id: str) -> Optional[dict]:
        """Fetch history record from DB."""
        try:
            res = await asyncio.to_thread(
                lambda: self.supabase.table("analysis_history")
                .select("id, analysis_results, metadata, pipeline_state, asset_manifest, lahan_id")
                .eq("id", history_id)
                .limit(1)
                .execute()
            )
            if res and res.data:
                return res.data[0]
        except Exception as e:
            logger.error(f"Failed to fetch history {history_id}: {e}")
        return None

    async def _get_geometry(self, lahan_id: str) -> Optional[dict]:
        """Fetch geometry from master_lahan."""
        try:
            res = await asyncio.to_thread(
                lambda: self.supabase.table("master_lahan")
                .select("geom_geojson")
                .eq("id", lahan_id)
                .limit(1)
                .execute()
            )
            if res and res.data:
                return res.data[0].get("geom_geojson")
        except Exception as e:
            logger.error(f"Failed to fetch geometry for lahan {lahan_id}: {e}")
        return None

    async def run_pipeline(
        self,
        history_id: str,
        analysis_results: List[dict],
        geo_data: dict,
        has_slope: bool = False,
    ):
        """
        Main pipeline execution: download tiles + validate assets.
        Called as a background task after save_history.

        analysis_results: list of year items with map_url, rgb_url, thumb_url, etc.
        geo_data: GeoJSON geometry for bbox calculation.
        """
        history_id_short = history_id[:8]
        print(f"🗺️ [Pipeline:{history_id_short}] Starting asset pipeline...")

        try:
            # Calculate bbox
            bbox = calculate_bbox_from_geojson(geo_data)
            print(f"   BBox: W={bbox['west']:.4f} S={bbox['south']:.4f} E={bbox['east']:.4f} N={bbox['north']:.4f}")

            # Extract years and URLs
            years = []
            url_map = {}  # {year: {"map_url": ..., "rgb_url": ...}}
            for item in analysis_results:
                year = item.get("year")
                if year:
                    years.append(year)
                    m_url = item.get("map_url")
                    r_url = item.get("rgb_url")
                    url_map[year] = {"map_url": m_url, "rgb_url": r_url}
                    has_map = bool(m_url and "earthengine" in str(m_url))
                    has_rgb = bool(r_url and "earthengine" in str(r_url))
                    print(f"   Year {year}: map_url={'YES' if has_map else 'NO'}, rgb_url={'YES' if has_rgb else 'NO'}")

            if not years:
                print(f"❌ [Pipeline:{history_id_short}] No years found, skipping")
                await self._update_state(history_id, PipelineState.FAILED)
                return

            total_tiles_estimate = estimate_tile_count(bbox) * len(years) * 2
            print(f"   Total years: {len(years)}, estimated tiles: {total_tiles_estimate}")

            # Generate manifest
            manifest = AssetManifest.generate(history_id, years, bbox, has_slope)
            await self._update_state(history_id, PipelineState.SAVING_ASSETS, manifest)

            total_downloaded = 0

            # Download tiles for each year
            for year in years:
                urls = url_map.get(year, {})
                map_url = urls.get("map_url")
                rgb_url = urls.get("rgb_url")

                # Download classified tiles
                if map_url and "earthengine.googleapis.com" in str(map_url):
                    print(f"   📥 [{history_id_short}] Downloading classified tiles for {year}...")
                    stats = await self.downloader.download_tiles_for_url(
                        tile_url_template=map_url,
                        history_id_short=history_id_short,
                        subdir=str(year),
                        bbox=bbox,
                    )
                    tile_count = stats["downloaded"] + stats["skipped"]
                    total_downloaded += tile_count
                    print(f"      ✅ Classified {year}: {stats['downloaded']} new, {stats['skipped']} cached, {stats['failed']} failed")
                    manifest = AssetManifest.update_asset_status(
                        manifest, str(year), "tile_archive",
                        "valid" if stats["failed"] == 0 else "partial",
                        tile_count=tile_count,
                        failed=stats["failed"],
                    )
                else:
                    print(f"   ⚠️ [{history_id_short}] No valid GEE map_url for {year}, skipping classified tiles")
                    manifest = AssetManifest.update_asset_status(
                        manifest, str(year), "tile_archive", "skipped")

                # Download RGB tiles
                if rgb_url and "earthengine.googleapis.com" in str(rgb_url):
                    print(f"   📥 [{history_id_short}] Downloading RGB tiles for {year}...")
                    stats = await self.downloader.download_tiles_for_url(
                        tile_url_template=rgb_url,
                        history_id_short=history_id_short,
                        subdir=f"{year}_rgb",
                        bbox=bbox,
                    )
                    tile_count = stats["downloaded"] + stats["skipped"]
                    total_downloaded += tile_count
                    print(f"      ✅ RGB {year}: {stats['downloaded']} new, {stats['skipped']} cached, {stats['failed']} failed")
                    manifest = AssetManifest.update_asset_status(
                        manifest, str(year), "rgb_tile_archive",
                        "valid" if stats["failed"] == 0 else "partial",
                        tile_count=tile_count,
                        failed=stats["failed"],
                    )
                else:
                    print(f"   ⚠️ [{history_id_short}] No valid GEE rgb_url for {year}, skipping RGB tiles")
                    manifest = AssetManifest.update_asset_status(
                        manifest, str(year), "rgb_tile_archive", "skipped")

                # Mark thumbnails as valid if they have local paths
                for item in analysis_results:
                    if item.get("year") == year:
                        thumb = item.get("thumb_url", "")
                        rgb_thumb = item.get("rgb_thumb_url", "")
                        if thumb and thumb.startswith("/storage/"):
                            manifest = AssetManifest.update_asset_status(
                                manifest, str(year), "thumb_url", "valid",
                                local_path=thumb)
                        if rgb_thumb and rgb_thumb.startswith("/storage/"):
                            manifest = AssetManifest.update_asset_status(
                                manifest, str(year), "rgb_thumb_url", "valid",
                                local_path=rgb_thumb)
                        if item.get("vector_geojson"):
                            fc = item["vector_geojson"]
                            feat_count = len(fc.get("features", [])) if isinstance(fc, dict) else 0
                            manifest = AssetManifest.update_asset_status(
                                manifest, str(year), "vector_geojson", "valid",
                                feature_count=feat_count)
                        break

                # Update progress periodically
                manifest["total_tiles_downloaded"] = total_downloaded
                await self._update_state(history_id, PipelineState.SAVING_ASSETS, manifest)

            # Validation phase
            await self._update_state(history_id, PipelineState.VALIDATING, manifest)

            missing = AssetManifest.find_missing_assets(manifest)
            # Filter out hotspots/slope which are handled by separate background tasks
            critical_missing = [m for m in missing
                                if m["asset"] not in ("slope", "hotspots")
                                and m["current_status"] not in ("skipped",)]

            if critical_missing:
                print(f"   ⚠️ [{history_id_short}] {len(critical_missing)} assets still missing after download")
                manifest["validation_result"] = {
                    "status": "incomplete",
                    "missing_count": len(critical_missing),
                    "missing": critical_missing[:10],
                }
                await self._update_state(history_id, PipelineState.COMPLETED, manifest)
            else:
                manifest["validation_result"] = {"status": "complete"}
                await self._update_state(history_id, PipelineState.COMPLETED, manifest)

            progress = AssetManifest.calculate_progress(manifest)
            print(f"✅ [Pipeline:{history_id_short}] COMPLETE! "
                  f"Tiles: {progress['total_tiles_downloaded']}/{progress['total_tiles_expected']}, "
                  f"Assets: {progress['valid_assets']}/{progress['total_assets']}")

        except Exception as e:
            print(f"❌ [Pipeline:{history_id_short}] Pipeline FAILED: {e}")
            import traceback
            traceback.print_exc()
            await self._update_state(history_id, PipelineState.FAILED, {
                "error": str(e),
                "failed_at": datetime.now().isoformat(),
            })

    async def recover_assets(self, history_id: str) -> dict:
        """
        Recovery: re-download missing assets for an existing history item.
        Uses regenerate-visuals to get fresh GEE URLs, then downloads tiles.
        """
        history = await self._get_history(history_id)
        if not history:
            return {"error": "History not found"}

        history_id_short = history_id[:8]
        manifest = history.get("asset_manifest") or {}
        analysis_results = history.get("analysis_results", [])
        lahan_id = history.get("lahan_id")

        if not lahan_id:
            return {"error": "No lahan_id found"}

        geo_data = await self._get_geometry(lahan_id)
        if not geo_data:
            return {"error": "Geometry not found"}

        await self._update_state(history_id, PipelineState.RECOVERING)

        # Check which tile URLs are still valid (non-expired GEE URLs)
        has_valid_urls = False
        for item in analysis_results:
            map_url = item.get("map_url", "")
            if map_url and "earthengine.googleapis.com" in map_url:
                has_valid_urls = True
                break

        if not has_valid_urls:
            print(f"⚠️ [Recovery:{history_id_short}] No valid GEE URLs found. "
                        "Need to call regenerate-visuals first.")
            return {
                "status": "needs_regeneration",
                "message": "GEE URLs expired. Call /history/{id}/regenerate-visuals first, then recover."
            }

        # Run the pipeline with existing URLs
        await self.run_pipeline(
            history_id=history_id,
            analysis_results=analysis_results,
            geo_data=geo_data,
        )

        # Fetch updated state
        updated = await self._get_history(history_id)
        return {
            "status": "completed",
            "pipeline_state": updated.get("pipeline_state") if updated else "UNKNOWN",
            "progress": AssetManifest.calculate_progress(
                updated.get("asset_manifest", {}) if updated else {}
            ),
        }

    async def get_pipeline_status(self, history_id: str) -> dict:
        """Get current pipeline status + progress for a history item."""
        history = await self._get_history(history_id)
        if not history:
            return {"error": "History not found"}

        state = history.get("pipeline_state", "LEGACY")
        manifest = history.get("asset_manifest") or {}

        result = {
            "history_id": history_id,
            "pipeline_state": state,
            "manifest": manifest,
        }

        if manifest:
            result["progress"] = AssetManifest.calculate_progress(manifest)
            result["missing_assets"] = AssetManifest.find_missing_assets(manifest)

        return result
