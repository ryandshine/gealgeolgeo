import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client
from pkps_sync import run_sync_process

# Load env vars
load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL or SUPABASE_KEY missing in .env")
    exit(1)

print("Initializing Supabase client...")
supabase = create_client(url, key)

print("Starting manual sync on server...")
try:
    asyncio.run(run_sync_process(supabase))
except Exception as e:
    print(f"Error during sync: {e}")
