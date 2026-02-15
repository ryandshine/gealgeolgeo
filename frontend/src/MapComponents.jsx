import React, { useEffect, useState, useRef } from 'react';
import { useMap, useMapEvents, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-side-by-side';
import { SIGAP_CONFIG, API_URL } from './constants';
import { resolveThumbUrl } from './utils/analysisUtils';

// Map Components
// Map Components
export const MapRecenter = ({ data, uniqueKey }) => {
    const map = useMap();
    const isFirstLoad = useRef(true);
    const lastKey = useRef(uniqueKey);
    const lastDataType = useRef(null);
    const hasInteracted = useRef(false);
    const isAutoZooming = useRef(false);

    useEffect(() => {
        const onInteraction = () => {
            if (!isFirstLoad.current && !hasInteracted.current && !isAutoZooming.current) {
                hasInteracted.current = true;
            }
        };

        map.on('movestart', onInteraction);
        map.on('zoomstart', onInteraction);

        return () => {
            map.off('movestart', onInteraction);
            map.off('zoomstart', onInteraction);
        };
    }, [map]);

    useEffect(() => {
        if (uniqueKey !== lastKey.current) {
            isFirstLoad.current = true;
            hasInteracted.current = false;
            lastDataType.current = null;
            lastKey.current = uniqueKey;
        }

        if (!data || hasInteracted.current) return;

        // Detect data type: Point (centroid) vs Polygon/MultiPolygon (full geometry)
        const currentType = data?.type === 'Point' ? 'point'
            : (data?.type === 'FeatureCollection' || data?.type === 'Polygon' || data?.type === 'MultiPolygon' || data?.features) ? 'polygon'
            : 'other';

        // Zoom jika: pertama kali ATAU upgrade dari Point ke Polygon (full geo loaded)
        const shouldZoom = isFirstLoad.current || (lastDataType.current === 'point' && currentType === 'polygon');

        if (shouldZoom) {
            try {
                const geojsonLayer = L.geoJSON(data);
                const bounds = geojsonLayer.getBounds();
                if (bounds.isValid()) {
                    isAutoZooming.current = true;
                    map.fitBounds(bounds, { padding: [100, 100], maxZoom: 16 });
                    setTimeout(() => { isAutoZooming.current = false; }, 500);
                    isFirstLoad.current = false;
                }
            } catch (err) { console.error('MapRecenter error:', err); }
        }

        lastDataType.current = currentType;
    }, [data, map, uniqueKey]);

    return null;
};

// ⚡ PERFORMANCE OPTIMIZATION: Add GPU acceleration styles for smooth zoom
// This injected CSS ensures Leaflet containers use hardware acceleration
const injectMapPerformanceStyles = () => {
    if (typeof document !== 'undefined' && !document.getElementById('leaflet-perf-styles')) {
        const style = document.createElement('style');
        style.id = 'leaflet-perf-styles';
        style.textContent = `
            .leaflet-container {
                will-change: transform;
                transform: translateZ(0);
                backface-visibility: hidden;
            }
            .leaflet-pane {
                will-change: transform;
                transform: translateZ(0);
            }
            .leaflet-tile-pane {
                will-change: transform;
            }
            .leaflet-tile {
                backface-visibility: hidden;
            }
        `;
        document.head.appendChild(style);
    }
};

// Dynamic TileLayer that responds to opacity changes
// Updated to strictly recreate layer on URL change to prevent "stacking" of old tiles
// Supports localTileUrl for cache-first tile serving with GEE fallback
export const DynamicTileLayer = ({ url, localTileUrl, opacity, show, pane = 'overlayPane', zIndex = 10 }) => {
    const map = useMap();
    const layerRef = useRef(null);

    // Inject performance styles once
    React.useEffect(() => {
        injectMapPerformanceStyles();
    }, []);

    // 1. Manage Layer Lifecycle (Create / Destroy)
    useEffect(() => {
        if (!show || (!url && !localTileUrl)) {
            return;
        }

        let layer;

        if (localTileUrl && url) {
            // Cache-first: use custom TileLayer that tries local first, falls back to GEE
            const CacheTileLayer = L.TileLayer.extend({
                createTile: function(coords, done) {
                    const tile = document.createElement('img');
                    tile.alt = '';
                    tile.setAttribute('role', 'presentation');

                    const localSrc = L.Util.template(localTileUrl, {
                        ...coords, z: coords.z, x: coords.x, y: coords.y
                    });
                    const geeSrc = L.Util.template(url, {
                        ...coords, z: coords.z, x: coords.x, y: coords.y
                    });

                    tile.onload = function() { done(null, tile); };
                    tile.onerror = function() {
                        // Local tile not found, fallback to GEE
                        tile.onerror = function() { done(new Error('Both tile sources failed'), tile); };
                        tile.src = geeSrc;
                    };
                    tile.src = localSrc;
                    return tile;
                }
            });

            layer = new CacheTileLayer(localTileUrl, {
                opacity: opacity,
                pane: pane,
                zIndex: zIndex,
                maxNativeZoom: MAX_ZOOM_TILES,
                maxZoom: 18,
                keepBuffer: 3,
                updateWhenZooming: false,
                updateWhenIdle: true,
            });
        } else {
            // Standard tile layer (GEE only or local only)
            layer = L.tileLayer(localTileUrl || url, {
                opacity: opacity,
                pane: pane,
                zIndex: zIndex,
                maxNativeZoom: 18,
                maxZoom: 18,
                keepBuffer: 3,
                updateWhenZooming: false,
                updateWhenIdle: true,
            });
        }

        layer.addTo(map);
        layerRef.current = layer;

        // Cleanup: Remove layer when URL changes or component unmounts
        return () => {
            if (map && layer) {
                map.removeLayer(layer);
            }
            layerRef.current = null;
        };
        // Dependencies: Re-run only when critical identity props change.
        // We exclude opacity/zIndex to prevent recreation (handled by 2nd effect)
    }, [url, localTileUrl, show, map, pane]);

    // 2. Handle Dynamic Updates (Opacity / ZIndex) without recreation
    useEffect(() => {
        if (layerRef.current) {
            layerRef.current.setOpacity(opacity);
            layerRef.current.setZIndex(zIndex);
        }
    }, [opacity, zIndex]);

    return null;
};

// Max zoom level for locally cached tiles
const MAX_ZOOM_TILES = 15;

// SideBySide Component
export const SwipeMapControl = ({ leftUrl, rightUrl, show }) => {
    const map = useMap();
    const [control, setControl] = useState(null);
    const [leftLayer, setLeftLayer] = useState(null);
    const [rightLayer, setRightLayer] = useState(null);

    useEffect(() => {
        if (!show || !leftUrl || !rightUrl) {
            if (control) {
                map.removeControl(control);
                setControl(null);
            }
            if (leftLayer) map.removeLayer(leftLayer);
            if (rightLayer) map.removeLayer(rightLayer);
            setLeftLayer(null);
            setRightLayer(null);
            return;
        }

        // Create layers
        const left = L.tileLayer(leftUrl, { maxNativeZoom: 18, maxZoom: 18 }).addTo(map);
        const right = L.tileLayer(rightUrl, { maxNativeZoom: 18, maxZoom: 18 }).addTo(map);

        // Create control
        const sbs = L.control.sideBySide(left, right);
        sbs.addTo(map);

        setLeftLayer(left);
        setRightLayer(right);
        setControl(sbs);

        return () => {
            if (sbs) map.removeControl(sbs);
            if (left) map.removeLayer(left);
            if (right) map.removeLayer(right);
        };
    }, [show, leftUrl, rightUrl, map]);

    return null;
};

// Draw Polygon Control
export const DrawPolygonControl = ({ active, points, onChange, onComplete }) => {
    const map = useMap();
    const [tempLayer, setTempLayer] = useState(null);

    // Initial setup: Change cursor
    useEffect(() => {
        if (active) {
            map.getContainer().style.cursor = 'crosshair';
            map.doubleClickZoom.disable();
        } else {
            map.getContainer().style.cursor = '';
            map.doubleClickZoom.enable();
            if (onChange) onChange([]); // Reset points on exit
            if (tempLayer) {
                map.removeLayer(tempLayer);
                setTempLayer(null);
            }
        }
    }, [active, map]);

    // Update visuals when points change
    useEffect(() => {
        if (!active) return;

        if (tempLayer) map.removeLayer(tempLayer);

        if (points && points.length > 0) {
            // Draw lines/polygon preview
            const layer = L.featureGroup();

            // Draw points
            points.forEach(p => {
                L.circleMarker(p, { color: '#f97316', radius: 4, fillOpacity: 1, fillColor: '#fff', weight: 2 }).addTo(layer);
            });

            // Draw line
            if (points.length > 1) {
                L.polyline(points, { color: '#f97316', weight: 2, dashArray: '5, 5' }).addTo(layer);
            }

            // Draw polygon preview if 3+ points
            if (points.length > 2) {
                L.polygon(points, { color: '#f97316', weight: 0, fillOpacity: 0.2 }).addTo(layer);
            }

            layer.addTo(map);
            setTempLayer(layer);
        }
    }, [points, active, map]);

    useMapEvents({
        click(e) {
            if (!active) return;
            const newPoints = [...(points || []), e.latlng];
            onChange(newPoints);
        },
        dblclick(e) {
            if (!active) return;
            if (points && points.length >= 3) {
                // GeoJSON expects [[lng, lat], [lng, lat], ...]
                const coordinates = points.map(p => [p.lng, p.lat]);
                coordinates.push(coordinates[0]); // Close ring

                const geoJson = {
                    type: "FeatureCollection",
                    features: [{
                        type: "Feature",
                        properties: { source: "manual_draw" },
                        geometry: {
                            type: "Polygon",
                            coordinates: [coordinates]
                        }
                    }]
                };
                onComplete(geoJson);
            }
        },
        contextmenu(e) {
            if (!active) return;
            e.originalEvent.preventDefault();
            if (points.length > 0) {
                onChange(points.slice(0, -1));
            }
        }
    });

    return null;
};

// Helper for JSONP requests to bypass CORS
const fetchJsonp = (url) => {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
        window[callbackName] = function (data) {
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(data);
        };

        const script = document.createElement('script');
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
        script.onerror = () => {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP request failed'));
        };
        document.body.appendChild(script);
    });
};

// Identify SIGAP Features Component
export const IdentifySigapFeatures = ({ activeLayers, onResult }) => {
    const map = useMapEvents({
        click: async (e) => {
            const size = map.getSize();
            const bounds = map.getBounds();
            const extent = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

            const params = new URLSearchParams({
                f: 'json',
                tolerance: 3,
                returnGeometry: false,
                imageDisplay: `${size.x},${size.y},96`,
                mapExtent: extent,
                geometry: `${e.latlng.lng},${e.latlng.lat}`,
                geometryType: 'esriGeometryPoint',
                sr: 4326,
                layers: 'all'
            });

            const results = [];

            // Helper to fetch identification
            const identify = async (baseUrl, titlePrefix, isSigap = true) => {
                const url = `${baseUrl}/identify?${params.toString()}`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) return [];

                    const json = await response.json();
                    if (json && json.results) {
                        return json.results.map(r => {
                            let displayName = r.value;
                            return {
                                ...r,
                                layerName: `${titlePrefix}: ${r.layerName}`,
                                value: displayName,
                                attributes: r.attributes
                            };
                        });
                    }
                } catch (err) { console.error(`Identify error (${titlePrefix}):`, err); }
                return [];
            };

            // 1. SIGAP Identification
            if (activeLayers.hutan) {
                const hutanRes = await identify(SIGAP_CONFIG.KAWASAN_HUTAN, 'Kawasan Hutan', true);
                results.push(...(hutanRes || []));
            }
            if (activeLayers.das) {
                const dasRes = await identify(SIGAP_CONFIG.DAS, 'DAS', true);
                results.push(...(dasRes || []));
            }

            if (results.length > 0) {
                onResult(e.latlng, results);
            }
        }
    });
    return null;
};



// History Pins Layer - Visualizes analyzed locations
export const HistoryPinsLayer = ({ historyData, onSelect }) => {
    // Deduplicate history items by geometry to avoid stacked pins
    // Choose the most recent one for metadata
    const uniqueLocations = React.useMemo(() => {
        if (!historyData || historyData.length === 0) {
            return [];
        }

        const locMap = new Map();

        historyData.forEach((item, idx) => {
            try {
                // ⚡ OPTIMIZATION: Use pre-calculated center from database
                // Eliminates need to parse GeoJSON polygon for every pin
                let center;

                if (item.center_lat != null && item.center_lng != null) {
                    // ✅ Use pre-calculated center from database (instant!)
                    center = { lat: item.center_lat, lng: item.center_lng };
                } else if (item.geo_data?.type === 'Point') {
                    // Fallback 1: Already a Point (optimized API response)
                    center = { lat: item.geo_data.coordinates[1], lng: item.geo_data.coordinates[0] };
                } else if (item.geo_data) {
                    // Fallback 2: Full polygon parsing (expensive, only for legacy data)
                    console.warn(`⚠️ Item ${item.filename} missing center_lat/center_lng, falling back to GeoJSON parsing`);
                    try {
                        // Normalize: if geo_data is raw geometry (no type=Feature/FeatureCollection), wrap it
                        let geoInput = item.geo_data;
                        const gType = geoInput?.type;
                        if (gType && gType !== 'Feature' && gType !== 'FeatureCollection') {
                            geoInput = { type: 'Feature', geometry: geoInput, properties: {} };
                        }
                        const layer = L.geoJSON(geoInput);
                        const bounds = layer.getBounds();
                        if (!bounds.isValid()) return;
                        center = bounds.getCenter();
                    } catch (geoErr) {
                        console.warn(`⚠️ GeoJSON parse failed for ${item.filename}:`, geoErr.message);
                        return;
                    }
                } else {
                    // No valid location data
                    console.warn(`⚠️ Item ${item.filename} has no location data (no center_lat/center_lng or geo_data)`);
                    return;
                }

                if (!center) return;
                center = { lat: Number(center.lat), lng: Number(center.lng) };
                if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;

                const key = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;

                // If not exists or this item is newer, update
                if (!locMap.has(key) || new Date(item.created_at) > new Date(locMap.get(key).created_at)) {
                    locMap.set(key, { ...item, center });
                }
            } catch (e) {
                console.error(`Error processing geometry for item ${idx}:`, e);
            }
        });

        return Array.from(locMap.values());
    }, [historyData]);

    const validLocations = React.useMemo(() => {
        return uniqueLocations.filter(item => {
            const lat = Number(item.center?.lat);
            const lng = Number(item.center?.lng);
            return Number.isFinite(lat) && Number.isFinite(lng);
        });
    }, [uniqueLocations]);

    const createHistoryIcon = (label, thumbUrl, color = '#10b981') => L.divIcon({
        className: 'history-pin-marker',
        html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
                <div style="background: ${color}; opacity: 0.9; backdrop-filter: blur(4px); border: 2px solid white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <div style="width: 2px; height: 10px; background: ${color}; opacity: 0.6;"></div>
                <div style="width: 8px; height: 4px; background: rgba(0,0,0,0.2); border-radius: 50%;"></div>

                ${label ? `
                <div style="position: absolute; left: 16px; top: 0px; background: white; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 800; white-space: nowrap; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); color: ${color}; border: 1px solid #E2E8F0; z-index: 50; display: flex; items-center; gap: 4px; transform: translateX(10px);">

                   <span>${label}</span>
                </div>
                ` : ''}
            </div>
        `,
        iconSize: [24, 40],
        iconAnchor: [12, 40],
        popupAnchor: [0, -40]
    });

    return (
        <>
            {validLocations.map((item, idx) => {
                // Find latest thumbnail from analysis_results
                let thumbUrl = null;
                if (item.analysis_results && Array.isArray(item.analysis_results)) {
                    // Sort by year desc and take the first one with a thumb_url
                    const latestResult = [...item.analysis_results]
                        .sort((a, b) => b.year - a.year)
                        .find(r => r.thumb_url);

                    if (latestResult) {
                        thumbUrl = resolveThumbUrl(latestResult.thumb_url, API_URL);
                    }
                }

                return (
                    <Marker
                        key={`hist-${item.id}-${idx}`}
                        position={item.center}
                        icon={createHistoryIcon(item.display_name || item.filename, thumbUrl, item.color)}
                    >
                        <Popup>
                            <div className="p-1 min-w-[200px]">
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                                    <div className="p-1 bg-emerald-50 text-emerald-600 rounded">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12l-18 0" /><path d="M3 12l6 -6" /><path d="M3 12l6 6" /></svg>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lokasi Teranalisis</div>
                                        <div className="text-xs font-bold text-slate-800 line-clamp-1" title={item.filename}>{item.display_name || item.filename}</div>
                                    </div>
                                </div>

                                <div className="space-y-1 mb-3 pt-1">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500 font-medium">Data Analisis:</span>
                                        <span className="font-bold text-slate-700">{item.metadata?.start_year} - {item.metadata?.end_year}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500 font-medium">Luas Wilayah:</span>
                                        <span className="font-bold text-slate-700">{item.metadata?.total_area_ha ? Number(item.metadata.total_area_ha).toLocaleString() + ' Ha' : '-'}</span>
                                    </div>
                                </div>

                                {item.metadata?.transition_summary && (
                                    <div className="grid grid-cols-2 gap-2 mb-3 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                        <div className="space-y-0.5">
                                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Deforestasi</div>
                                            <div className="text-[11px] font-bold text-red-600">-{Number(item.metadata.transition_summary.total_deforestation_ha || 0).toFixed(2)} Ha</div>
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Reforestasi</div>
                                            <div className="text-[11px] font-bold text-emerald-600">+{Number(item.metadata.transition_summary.total_reforestation_ha || 0).toFixed(2)} Ha</div>
                                        </div>

                                        {/* 📈 DATA SLOPE (NEW) */}
                                        {item.slope_summary && item.slope_summary.length > 0 && (
                                            <div className="col-span-2 pt-1 mt-1 border-t border-slate-200/60 flex justify-between items-center">
                                                <div className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Rata-rata Kelerengan</div>
                                                <div className="text-[11px] font-bold text-indigo-700">
                                                    {Number(item.slope_summary.find(s => s.scope === 'INSIDE')?.avg_slope || 0).toFixed(1)}%
                                                </div>
                                            </div>
                                        )}

                                        <div className="col-span-2 pt-1 mt-1 border-t border-slate-200/60 flex justify-between items-center">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Perubahan Tutupan</div>
                                            <div className={`text-[11px] font-extrabold ${item.metadata.transition_summary.net_forest_change_ha >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                {item.metadata.transition_summary.net_forest_change_ha >= 0 ? '+' : ''}{Number(item.metadata.transition_summary.net_forest_change_ha || 0).toFixed(2)} Ha
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => onSelect(item)}
                                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase rounded shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5"
                                >
                                    <span>Buka Analisis</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
                                </button>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </>
    );
};
