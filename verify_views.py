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

print("🧪 Verifying Views Accessibility...\n")

# 1. Verify v_kps_yearly_analysis (Long View)
print("1️⃣  Checking 'v_kps_yearly_analysis' (Long)...")
try:
    res = supabase.table("v_kps_yearly_analysis").select("*").limit(1).execute()
    if res.data:
        print("   ✅ Success! Retrieved 1 row.")
        print(f"   Sample keys: {list(res.data[0].keys())[:5]}...")
    else:
        print("   ⚠️ View exists but returned no data (might be empty).")
except Exception as e:
    print(f"   ❌ Failed: {e}")

print("\n" + "-"*50 + "\n")

# 2. Verify v_rekap_paduserasi_wide (Wide View)
print("2️⃣  Checking 'v_rekap_paduserasi_wide' (Wide)...")
try:
    res = supabase.table("v_rekap_paduserasi_wide").select("*").limit(1).execute()
    if res.data:
        print("   ✅ Success! Retrieved 1 row.")
        row = res.data[0]
        print(f"   Sample keys: {list(row.keys())[:5]}...")
        
        # Check if JSONB column exists
        if 'yearly_metrics' in row:
            print("   ✅ 'yearly_metrics' JSONB column found!")
            print(f"   Content snippet: {str(row['yearly_metrics'])[:100]}...")
        else:
            print("   ❌ 'yearly_metrics' column MISSING!")
    else:
        print("   ⚠️ View exists but returned no data (might be empty).")
except Exception as e:
    print(f"   ❌ Failed: {e}")

print("\nDONE.")
