import os
import json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    print("❌ Missing Supabase credentials")
    exit(1)

supabase = create_client(url, key)

print("🔍 Inspecting 'master_kps' table columns...")
try:
    # Fetch 1 row to see columns
    response = supabase.table("master_kps").select("*").limit(1).execute()
    
    if response.data and len(response.data) > 0:
        columns = list(response.data[0].keys())
        print("\n✅ Found columns:")
        for col in sorted(columns):
            print(f"   - {col}")
    else:
        print("⚠️ Table is empty or not accessible.")
        
except Exception as e:
    print(f"❌ Error: {e}")
