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
    "nama_kps": ["nama_kps", "nama", "nama_kelompok"],
    "no_sk": ["no_sk", "sk_pemberian", "nomor_sk"],
    "provinsi": ["provinsi", "nm_provinsi"],
    "kab_kota": ["kab_kota", "nm_kabupaten", "kabupaten"],
    "kecamatan": ["kecamatan", "nm_kecamatan"],
    "desa": ["desa", "nm_desa"],
    "tgl_sk": ["tgl_sk", "tanggal_sk"],
    "luas_sk_ha": ["luas_sk", "luas"],
    "latitude": ["latitude", "lat", "y"],
    "longitude": ["longitude", "long", "lon", "x"],
    "id_kps_api": ["id", "id_kps", "kode_kps"]
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
                    # Conversions
                    if db_col == "luas_sk_ha":
                        try:
                            val = float(val) if val else 0
                        except:
                            val = 0
                    if db_col in ["latitude", "longitude"]:
                        try:
                            val = float(val) if val else None
                        except:
                            val = None
                            
                    mapped[db_col] = val
                    found = True
                    break
            if found: break
    
    # Generate ID if missing
    if "id_kps_api" not in mapped or not mapped["id_kps_api"]:
        if "no_sk" in mapped and mapped["no_sk"]:
             mapped["id_kps_api"] = f"{kps_type}_{mapped['no_sk']}"
        else:
             return None # Cannot identify

    if "nama_kps" not in mapped:
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
            
        batch_upsert = []
        for item in items:
            mapped = map_item(item, name)
            if mapped:
                batch_upsert.append(mapped)
        
        # Batch upload to Supabase
        BATCH_SIZE = 100
        synced_count = 0
        
        for i in range(0, len(batch_upsert), BATCH_SIZE):
            batch = batch_upsert[i:i+BATCH_SIZE]
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
