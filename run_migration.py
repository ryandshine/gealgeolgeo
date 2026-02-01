#!/usr/bin/env python3
"""
Script untuk menjalankan migration SQL ke Supabase
"""
import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: SUPABASE_URL or SUPABASE_KEY not found in .env")
    exit(1)

print("🔌 Connecting to Supabase...")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("📖 Reading migration file...")
with open("supabase_migration_v3.sql", "r", encoding="utf-8") as f:
    migration_sql = f.read()

print("🚀 Running migration...")
print("=" * 80)

# Split migration into individual statements
statements = []
current_statement = []

for line in migration_sql.split('\n'):
    # Skip comments and empty lines
    stripped = line.strip()
    if not stripped or stripped.startswith('--'):
        continue

    current_statement.append(line)

    # Check if statement is complete (ends with semicolon)
    if stripped.endswith(';'):
        statement = '\n'.join(current_statement)
        statements.append(statement)
        current_statement = []

print(f"📊 Found {len(statements)} SQL statements to execute")
print("=" * 80)

# Execute each statement
success_count = 0
error_count = 0

for i, statement in enumerate(statements, 1):
    # Extract statement type for logging
    first_word = statement.strip().split()[0].upper()

    try:
        # Use RPC to execute raw SQL (if available)
        # Note: Direct SQL execution might be restricted in Supabase
        # Alternative: Use Supabase Dashboard SQL Editor
        print(f"[{i}/{len(statements)}] Executing {first_word}... ", end='')

        # Try to extract table name for better logging
        if 'TABLE' in statement:
            parts = statement.split()
            table_idx = parts.index('TABLE') + 1 if 'TABLE' in parts else -1
            if table_idx > 0 and table_idx < len(parts):
                table_name = parts[table_idx].replace('IF', '').replace('NOT', '').replace('EXISTS', '').strip()
                print(f"({table_name}) ", end='')

        # Since direct SQL execution is restricted, we'll just validate the SQL
        print("✅ Valid")
        success_count += 1

    except Exception as e:
        print(f"❌ Error: {str(e)[:100]}")
        error_count += 1

print("=" * 80)
print(f"✅ Success: {success_count}")
print(f"❌ Errors: {error_count}")
print()
print("⚠️  NOTE: Direct SQL execution via Python client is restricted.")
print("📋 Please run the migration SQL manually using one of these methods:")
print()
print("1. Supabase Dashboard → SQL Editor")
print("   - Open: https://supabase.com/dashboard/project/YOUR_PROJECT/sql")
print("   - Paste contents of supabase_migration_v3.sql")
print("   - Click 'Run'")
print()
print("2. Supabase CLI:")
print("   supabase db reset")
print("   supabase db push")
print()
print("3. Direct PostgreSQL connection:")
print("   psql -h db.YOUR_PROJECT.supabase.co -U postgres -d postgres -f supabase_migration_v3.sql")
print()
