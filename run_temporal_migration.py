#!/usr/bin/env python3
"""
Script untuk menjalankan migration temporal_status secara otomatis.
Membaca file migration SQL dan execute via Supabase client.
"""

import os
import sys
from supabase import create_client

def load_env():
    """Load environment variables from .env file"""
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key.strip()] = value.strip()

def main():
    """Run temporal_status migration"""

    print("🔄 Loading environment variables...")
    load_env()

    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Missing SUPABASE_URL or SUPABASE_KEY in .env")
        sys.exit(1)

    print(f"✅ Using Supabase URL: {SUPABASE_URL[:50]}...")

    # Read migration SQL file
    migration_file = os.path.join(os.path.dirname(__file__), "supabase_migration_temporal_status.sql")

    if not os.path.exists(migration_file):
        print(f"❌ Migration file not found: {migration_file}")
        sys.exit(1)

    print(f"📖 Reading migration file: {migration_file}")
    with open(migration_file, "r") as f:
        sql_content = f.read()

    # Initialize Supabase client
    print("🔗 Connecting to Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Execute migration - split by semicolon to handle multiple statements
    # But we need to use the raw PostgREST API for custom SQL
    print("⏳ Executing migration SQL...")

    try:
        # Use the rpc or direct SQL execution
        # Since Supabase Python client doesn't directly support arbitrary SQL,
        # we'll use the HTTP client
        import requests

        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }

        # Note: Supabase doesn't expose raw SQL execution via REST API for security reasons
        # We need to use the SQL Editor endpoint which requires browser auth
        print("⚠️  NOTE: Direct SQL execution requires Supabase admin credentials")
        print("   Please use one of these methods:")
        print("   1. Supabase Dashboard > SQL Editor (recommended)")
        print("   2. psql command line tool")
        print("   3. Database management tool with admin credentials")
        print("")
        print("📋 Migration SQL is ready in: supabase_migration_temporal_status.sql")
        print("")
        print("For Supabase Dashboard:")
        print("   1. Go to https://app.supabase.com")
        print("   2. Select your project")
        print("   3. SQL Editor → New Query")
        print("   4. Paste the migration SQL")
        print("   5. Click Run")

        return False

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
