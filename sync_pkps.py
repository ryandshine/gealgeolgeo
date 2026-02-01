import os
import requests
import json
import urllib3
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: SUPABASE_URL or SUPABASE_KEY not set.")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Configurations
APIS = {
    "PPHD": "https://pkps.hutsos.kehutanan.go.id/api-sitroom/api/Pphd",
    "PPHKm": "https://pkps.hutsos.kehutanan.go.id/api-sitroom/api/Pphkm", 
    "PPHTR": "https://pkps.hutsos.kehutanan.go.id/api-sitroom/api/Pphtr",
    "KK": "https://pkps.hutsos.kehutanan.go.id/api-sitroom/api/Pkk"
}

# Mapping known API fields to DB columns
# Note: These keys are hypothetical based on common patterns. 
# The script will log actual keys if mapping fails.
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
    print(f"⬇️ Fetching {name} from {url}...")
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json'
        }
        response = requests.get(url, headers=headers, verify=False, timeout=60)
        
        if response.status_code == 403:
            print(f"⚠️ Access Forbidden (403). Your IP might be blocked by the server.")
            return []
            
        response.raise_for_status()
        data = response.json()
        
        # Normalize response structure
        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            if 'data' in data and isinstance(data['data'], list):
                items = data['data']
            else:
                # Try to find any list in values
                for v in data.values():
                    if isinstance(v, list):
                        items = v
                        break
        
        print(f"✅ Fetched {len(items)} items for {name}")
        if len(items) > 0:
            print(f"   Sample keys: {list(items[0].keys())}")
            
        return items
        
    except Exception as e:
        print(f"❌ Error fetching {name}: {e}")
        return []

def map_item(item, kps_type):
    """Map API item to DB schema"""
    mapped = {
        "kps_type": kps_type,
        "source_api": "PKPS",
        "last_sync_at": datetime.utcnow().isoformat()
    }
    
    # Try different keys
    for db_col, api_keys in FIELD_MAPPING.items():
        for key in api_keys:
            # Case insensitive check
            found_key = next((k for k in item.keys() if k.lower() == key.lower()), None)
            if found_key:
                val = item[found_key]
                # specific cleanups
                if db_col == "luas_sk_ha":
                    try:
                        val = float(val) if val else 0
                    except:
                        val = 0
                mapped[db_col] = val
                break
    
    # Generate ID if missing
    if "id_kps_api" not in mapped or not mapped["id_kps_api"]:
        if "no_sk" in mapped and mapped["no_sk"]:
             mapped["id_kps_api"] = f"{kps_type}_{mapped['no_sk']}"
        else:
             # Skip if we can't identify it
             return None

    # Ensure nama_kps is present
    if "nama_kps" not in mapped:
        mapped["nama_kps"] = f"Unknown {kps_type}"

    return mapped

def sync_data():
    total_synced = 0
    total_errors = 0
    
    for name, url in APIS.items():
        items = fetch_data(name, url)
        if not items:
            continue
            
        print(f"🔄 Syncing {len(items)} records for {name}...")
        
        batch_upsert = []
        for item in items:
            mapped = map_item(item, name) # specific type map?
            # Adjust type if needed. name is PPHD, etc. which matches expected kps_type
            if mapped:
                batch_upsert.append(mapped)
                
        # Send to Supabase in batches
        BATCH_SIZE = 100
        for i in range(0, len(batch_upsert), BATCH_SIZE):
            batch = batch_upsert[i:i+BATCH_SIZE]
            try:
                # Upsert based on id_kps_api
                res = supabase.table("master_kps").upsert(batch, on_conflict="id_kps_api").execute()
                total_synced += len(batch)
                print(f"   Batch {i//BATCH_SIZE + 1} saved ({len(batch)} records)")
            except Exception as e:
                print(f"❌ Error saving batch: {e}")
                # Try fallback: maybe 'id_kps_api' unique constraint works, but what about 'no_sk'?
                # If no_sk duplicates exist across types, it might fail if no_sk is unique globally.
                # Schema says: no_sk TEXT UNIQUE.
                # If different KPS types share SK Number, this will fail.
                # We might need to handle that.
                total_errors += len(batch)

    print(f"\n📊 Sync Complete.")
    print(f"   Total Synced: {total_synced}")
    print(f"   Errors: {total_errors}")

if __name__ == "__main__":
    sync_data()
