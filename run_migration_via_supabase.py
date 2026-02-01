#!/usr/bin/env python3
"""
Run migration via Supabase Python SDK (safer, no DB password needed)
"""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ SUPABASE_URL or SUPABASE_KEY not found in .env")
    exit(1)

print(f"🔗 Connecting to Supabase: {SUPABASE_URL}")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Load SQL Migration File
migration_file = "supabase_migration_slope_url.sql"
if not os.path.exists(migration_file):
    print(f"❌ Migration file not found: {migration_file}")
    exit(1)

# Read migration SQL
with open(migration_file, "r") as f:
    full_sql = f.read()

print("\n📋 Executing migration steps...\n")

try:
    # Execute the raw SQL from file
    # Note: Requires 'exec_sql' RPC function to be enabled in Supabase
    result = supabase.rpc("exec_sql", {"sql": full_sql}).execute()
    
    print("✅ Migration executed successfully!")
    print(f"📄 Executed SQL from: {migration_file}")

    print("\n" + "="*70)
    print("✅ MIGRATION COMPLETED")
    print("="*70)
    print("\n📝 NEXT STEPS:")
    print("1. Deploy updated code (main.py, run_kps_views_migration.py)")
    print("2. Recreate view: python run_kps_views_migration.py")
    print("3. Restart backend")
    print("4. Test: GET /history → verify only 6 classes\n")

except Exception as e:
    print(f"❌ Error: {e}")
    print("\nℹ️  Alternative: Run migration manually in Supabase Dashboard:")
    print("   1. Go to: https://supabase.com/dashboard/project/omnshwtbzsxiqpdtonbo/sql")
    print(f"   2. Copy-paste content from: {migration_file}")
    print("   3. Click RUN")
    exit(1)
