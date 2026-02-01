import requests
import json
import urllib3
from datetime import datetime
import asyncio
import logging

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configurations
PKPS_APIS = {
    "PPHD": "https://pkps.hutsos.kehutanan.go.id/api-sitroom/api/Pphd",
    "PPHKm": "https://pkps.hutsos.kehutanan.go.id/api-sitroom/api/Pphkm", 
    "PPHTR": "https://pkps.hutsos.kehutanan.go.id/api-sitroom/api/Pphtr",
    "KK": "https://pkps.hutsos.kehutanan.go.id/api-sitroom/api/Pkk"
}

FIELD_MAPPING = {
    # Core identification
    "nama_kps": ["nama_kps"],
    "no_sk": ["no_sk_pphd", "no_sk_pphkm", "no_sk_pphtr", "no_sk_pkk"],
    "tgl_sk": ["tgl_sk_pphd", "tgl_sk_pphkm", "tgl_sk_pphtr", "tgl_sk_pkk"],
    
    # Location
    "id_prov": ["id_prov"],
    "id_kab": ["id_kab"],
    "nama_prov": ["nama_prov"],
    "nama_kab": ["nama_kab"],
    "kecamatan": ["nama_kec_hd", "nama_kec_hkm", "nama_kec_htr", "nama_kec_kk"],
    "desa": ["nama_desa_hd", "nama_desa_hkm", "nama_desa_htr", "nama_desa_kk"],
    
    # Area (luas)
    "luas_sk_ha": ["luas_sk_pphd", "luas_sk_pphkm", "luas_sk_pphtr", "luas_sk_pkk"],
    "luas_hl": ["luas_hl_pphd", "luas_hl_pphkm", "luas_hl_pkk"],
    "luas_hpt": ["luas_hpt_pphd", "luas_hpt_pphkm", "luas_hpt_pphtr", "luas_hpt_pkk"],
    "luas_hp": ["luas_hp_pphd", "luas_hp_pphkm", "luas_hp_pphtr", "luas_hp_pkk"],
    "luas_hpk": ["luas_hpk_pphd", "luas_hpk_pphkm", "luas_hpk_pphtr", "luas_hpk_pkk"],
    
    # Organization
    "nama_kph": ["nama_kph"],
    "nama_das": ["nama_das"],
    "nama_kontak_kps": ["nama_kontak_kps"],
    "no_kontak_kps": ["no_kontak_kps"],
    
    # Demographics
    "jml_kk_pria": ["jml_kk_pria"],
    "jml_kk_wanita": ["jml_kk_wanita"],
    "jml_kk_kps": ["jml_kk_kps"],
    "jenis_kps": ["jenis_kps"],
    
    # Activities
    "hhk": ["hhk"],
    "hhbk": ["hhbk"],
    "agroforestry": ["agroforestry"],
    "jasling": ["jasling"],
    "ekosistem": ["ekosistem"],
    "perikanan": ["perikanan"],
    "peternakan": ["peternakan"],
    
    # Environment
    "flora_endemik": ["flora_endemik"],
    "satwa_endemik": ["satwa_endemik"],
    "luas_gambut": ["luas_gambut"],
    "luas_mangrove": ["luas_mangrove"],
    "stok_karbon": ["stok_karbon"],
    
    # Files
    "file_sk": ["file_sk"],
    "file_peta": ["file_peta"],
    
    # Additional
    "id_usulan": ["id_usulan"],
    "nama_pemegang": ["nama_pemegang"],
    
    # No mapping for id_kps_api - will be auto-generated
}

def fetch_data(name, url):
    print(f"[PKPS Sync] Fetching {name} from {url}...")
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json'
        }
        # Timeout increased to 120s for slow government servers
        response = requests.get(url, headers=headers, verify=False, timeout=120)
        
        if response.status_code == 403:
            print(f"[PKPS Sync] ⚠️ Access Forbidden (403) for {name}")
            return []
            
        response.raise_for_status()
        data = response.json()
        
        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            if 'data' in data and isinstance(data['data'], list):
                items = data['data']
            else:
                for v in data.values():
                    if isinstance(v, list):
                        items = v
                        break
        
        print(f"[PKPS Sync] ✅ Fetched {len(items)} items for {name}")
        if len(items) > 0:
            print(f"[PKPS Sync] Sample keys for {name}: {list(items[0].keys())}")
            print(f"[PKPS Sync] Sample item for {name}: {json.dumps(items[0], default=str)[:200]}") # First 200 chars
        return items

        
    except Exception as e:
        print(f"[PKPS Sync] ❌ Error fetching {name}: {e}")
        return []

def map_item(item, kps_type):
    mapped = {
        "kps_type": kps_type,
        "source_api": "PKPS",
        "last_sync_at": datetime.utcnow().isoformat()
    }
    
    for db_col, api_keys in FIELD_MAPPING.items():
        found = False
        for key in api_keys:
            # Case insensitive search
            for item_key, item_val in item.items():
                if item_key.lower() == key.lower():
                    val = item_val
                    
                    # Numeric conversions for area fields
                    if db_col in ["luas_sk_ha", "luas_hl", "luas_hpt", "luas_hp", "luas_hpk", "luas_gambut", "luas_mangrove", "stok_karbon"]:
                        try:
                            val = float(val) if val and str(val).strip() else None
                        except:
                            val = None
                    
                    # Integer conversions for demographic fields
                    elif db_col in ["jml_kk_pria", "jml_kk_wanita", "jml_kk_kps"]:
                        try:
                            val = int(val) if val and str(val).strip() else None
                        except:
                            val = None
                            
                    mapped[db_col] = val
                    found = True
                    break
            if found: break
    
    # Generate ID using original API ID field
    # Map: PPHD -> id_pphd, PPHKm -> id_pphkm, PPHTR -> id_pphtr, KK -> id_pkk
    api_id_fields = {
        "PPHD": "id_pphd",
        "PPHKm": "id_pphkm", 
        "PPHTR": "id_pphtr",
        "KK": "id_pkk"
    }
    
    if "id_kps_api" not in mapped or not mapped["id_kps_api"]:
        # Try to get original API ID
        api_id_field = api_id_fields.get(kps_type)
        if api_id_field:
            for item_key, item_val in item.items():
                if item_key.lower() == api_id_field.lower():
                    mapped["id_kps_api"] = f"{kps_type}_{item_val}"
                    break
        
        # Fallback to no_sk if API ID not found
        if "id_kps_api" not in mapped or not mapped["id_kps_api"]:
            if "no_sk" in mapped and mapped["no_sk"]:
                mapped["id_kps_api"] = f"{kps_type}_{mapped['no_sk']}"
            else:
                return None # Cannot identify

    if "nama_kps" not in mapped or not mapped["nama_kps"]:
        mapped["nama_kps"] = f"Unknown {kps_type}"

    return mapped

async def run_sync_process(supabase_client):
    """
    Main entry point for syncing. 
    Can be run in background task.
    """
    print("[PKPS Sync] Starting synchronization process...")
    total_synced = 0
    total_errors = 0
    results = {}
    
    for name, url in PKPS_APIS.items():
        # Run blocking request in thread
        items = await asyncio.to_thread(fetch_data, name, url)
        
        if not items:
            results[name] = {"status": "failed_or_empty", "count": 0}
            continue
            
        all_mapped_items = []
        seen_ids = set()
        
        for item in items:
            mapped = map_item(item, name)
            if mapped and mapped.get("id_kps_api"):
                 if mapped["id_kps_api"] not in seen_ids:
                      all_mapped_items.append(mapped)
                      seen_ids.add(mapped["id_kps_api"])
        
        # Batch upload to Supabase
        BATCH_SIZE = 100
        synced_count = 0
        
        for i in range(0, len(all_mapped_items), BATCH_SIZE):
            batch = all_mapped_items[i:i+BATCH_SIZE]
            try:
                # Use asyncio.to_thread for Supabase blocking calls if needed, 
                # though supabase-py might be async compatible, usually it's blocking.
                await asyncio.to_thread(
                    lambda: supabase_client.table("master_kps").upsert(batch, on_conflict="id_kps_api").execute()
                )
                synced_count += len(batch)
            except Exception as e:
                print(f"[PKPS Sync] ❌ Error upserting batch for {name}: {e}")
                total_errors += len(batch)
        
        total_synced += synced_count
        results[name] = {"status": "success", "count": synced_count}
        print(f"[PKPS Sync] Finished {name}: {synced_count} records")

    summary = {
        "status": "completed", 
        "total_synced": total_synced, 
        "total_errors": total_errors,
        "details": results,
        "timestamp": datetime.utcnow().isoformat()
    }
    print(f"[PKPS Sync] DONE. Summary: {summary}")
    return summary
