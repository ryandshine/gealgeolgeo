#!/usr/bin/env python3
"""
Run migration: CLEAN LEGACY COLUMNS
Safely drops 4 unused land cover class columns from analysis_yearly_data
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2
from psycopg2.extensions import AUTOCOMMIT

load_dotenv()

# Get Supabase credentials from .env
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Extract DB credentials from Supabase URL
# Format: https://PROJECT_ID.supabase.co
if not SUPABASE_URL:
    print("❌ SUPABASE_URL not found in .env")
    sys.exit(1)

PROJECT_ID = SUPABASE_URL.split("//")[1].split(".")[0]

# Get password from argument or env
DB_PASSWORD = None
if len(sys.argv) > 1:
    DB_PASSWORD = sys.argv[1]
else:
    DB_PASSWORD = os.getenv("SUPABASE_PASSWORD")

if not DB_PASSWORD:
    print("❌ Database password required!")
    print("Usage: python run_migration_clean_columns.py YOUR_PASSWORD")
    sys.exit(1)

# PostgreSQL connection
DB_HOST = f"{PROJECT_ID}.supabase.co"
DB_PORT = 5432
DB_NAME = "postgres"
DB_USER = "postgres"

print(f"🔗 Connecting to {DB_HOST}...")

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    conn.set_isolation_level(AUTOCOMMIT)
    cursor = conn.cursor()
    print("✅ Connected to Supabase PostgreSQL")

    # Read migration SQL
    with open("supabase_migration_clean_columns.sql", "r") as f:
        sql = f.read()

    print("\n📋 Executing migration steps...\n")
    print("STEP 1: Dropping dependent view v_kps_yearly_analysis...")

    # Split by comment blocks for clearer execution
    statements = [
        "DROP VIEW IF EXISTS public.v_kps_yearly_analysis CASCADE;",

        "ALTER TABLE public.analysis_yearly_data DROP COLUMN IF EXISTS semak_padang_rumput;",
        "ALTER TABLE public.analysis_yearly_data DROP COLUMN IF EXISTS lahan_pertanian;",
        "ALTER TABLE public.analysis_yearly_data DROP COLUMN IF EXISTS gambut;",
        "ALTER TABLE public.analysis_yearly_data DROP COLUMN IF EXISTS tanah_terbuka;",

        """SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'analysis_yearly_data'
ORDER BY ordinal_position;"""
    ]

    for i, stmt in enumerate(statements, 1):
        try:
            cursor.execute(stmt)
            if i == 1:
                print("✅ View dropped successfully")
            elif i <= 4:
                print(f"✅ Column {i-1} dropped")
            else:
                # Verification query
                results = cursor.fetchall()
                columns = cursor.description
                print(f"\n✅ Verification - Remaining columns in analysis_yearly_data:")
                for row in results:
                    print(f"   - {row[0]} ({row[1]})")
        except Exception as e:
            print(f"❌ Error in step {i}: {e}")
            conn.close()
            sys.exit(1)

    print("\n" + "="*70)
    print("✅ MIGRATION COMPLETED SUCCESSFULLY")
    print("="*70)
    print("\n📝 NEXT STEPS:")
    print("1. Deploy updated code:")
    print("   - main.py (updated helper functions)")
    print("   - run_kps_views_migration.py (updated view definition)")
    print("2. Recreate view with 6-class schema:")
    print("   python run_kps_views_migration.py YOUR_PASSWORD")
    print("3. Restart backend service")
    print("4. Test: GET /history → verify only 6 classes\n")

    cursor.close()
    conn.close()

except psycopg2.Error as e:
    print(f"❌ Database error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
