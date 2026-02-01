"""
Script untuk melihat daftar tabel di Supabase
"""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL atau SUPABASE_KEY tidak ditemukan di .env")
    exit(1)

try:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Query untuk mendapatkan daftar tabel
    result = supabase.rpc('exec_sql', {
        'query': """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        """
    }).execute()
    
    print("\n=== DAFTAR TABEL DI SCHEMA PUBLIC ===\n")
    
    if result.data:
        for i, row in enumerate(result.data, 1):
            print(f"{i}. {row.get('table_name', 'N/A')}")
    else:
        print("Tidak ada tabel ditemukan atau query gagal.")
        print("\nMenggunakan metode alternatif...")
        
        # Alternatif: coba query langsung ke tabel yang kita tahu ada
        known_tables = [
            'master_kps',
            'master_lahan', 
            'analysis_history',
            'analysis_yearly_data',
            'analysis_slope_summary',
            'analysis_hotspots',
            'analysis_erosion_risk',
            'audit_report'
        ]
        
        print("\nTabel yang diketahui ada:")
        for table in known_tables:
            try:
                test = supabase.table(table).select("*").limit(1).execute()
                print(f"  ✓ {table} (OK)")
            except Exception as e:
                print(f"  ✗ {table} (Error: {str(e)[:50]})")
    
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
