#!/usr/bin/env python3
"""
Script untuk menjalankan migration KPS Views ke Supabase.
Menggunakan koneksi PostgreSQL langsung.

Cara 1: Set DATABASE_URL di .env
  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.omnshwtbzsxiqpdtonbo.supabase.co:5432/postgres

Cara 2: Jalankan script dengan password sebagai argument
  python run_kps_views_migration.py YOUR_DATABASE_PASSWORD

Cara 3: Jalankan manual di Supabase Dashboard
  - Buka https://supabase.com/dashboard/project/omnshwtbzsxiqpdtonbo/sql
  - Copy-paste isi file supabase_migration_kps_views.sql
  - Klik Run
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Migration SQL
MIGRATION_SQL = """
-- ============================================================================
-- MIGRATION: WIDE VIEW & RESTORE LONG VIEW
-- Purpose: 
-- 1. Restore 'v_kps_yearly_analysis' (Long Format) if missing
-- 2. Create 'v_rekap_paduserasi_wide' (Wide Format / Pivot) for 2017-2025
-- ============================================================================

-- STEP 1: RESTORE LONG VIEW (v_kps_yearly_analysis)
-- Copied from run_kps_views_migration.py with latest 6-class schema

CREATE OR REPLACE VIEW public.v_kps_yearly_analysis AS
SELECT
    -- Primary Keys
    y.id as yearly_data_id,
    y.history_id,
    y.year as tahun,

    -- KPS Master Data
    k.id_kps_api,
    k.nama_kps,
    k.no_sk,
    k.skema,
    k.kps_type,
    k.provinsi,
    k.kab_kota,
    k.kecamatan,
    k.desa,
    k.hutan_desa,
    k.tgl_sk,
    k.umur_sk,
    k.luas_sk_ha,
    k.luas_indikatif_ha,
    k.luas_definitif_ha,
    k.luas_areal_kerja_ha,
    k.latitude as kps_lat,
    k.longitude as kps_lng,

    -- Analysis History Info
    h.filename,
    h.analysis_scope,
    h.status as analysis_status,
    h.trend_type,
    h.deforestation_ha,
    h.reforestation_ha,
    h.created_at as analysis_date,

    -- Land Cover Data (from analysis_yearly_data) - IPSDH 6 Classes Final
    COALESCE(y.hutan_primer, 0) as hutan_primer,
    COALESCE(y.hutan_sekunder, 0) as hutan_sekunder,
    COALESCE(y.hutan_primer, 0) + COALESCE(y.hutan_sekunder, 0) as total_hutan,
    COALESCE(y.tanah_kering, 0) as tanah_kering,
    COALESCE(y.tanah_kosong, 0) as tanah_kosong,
    COALESCE(y.lahan_terbangun, 0) as lahan_terbangun,
    COALESCE(y.air, 0) as air,
    COALESCE(y.total_area, 0) as total_area,

    -- Hotspot Aggregation (per history + year)
    COALESCE(hs.hotspot_count, 0) as hotspot_count,
    COALESCE(hs.hotspot_high, 0) as hotspot_high,
    COALESCE(hs.hotspot_nominal, 0) as hotspot_nominal,
    COALESCE(hs.hotspot_low, 0) as hotspot_low,
    hs.avg_brightness,
    hs.avg_frp,
    hs.first_detection as hotspot_first_date,
    hs.last_detection as hotspot_last_date,

    -- Slope Analysis Data (INSIDE area)
    sl.avg_slope,
    COALESCE(sl.slope_0_8, 0) as slope_datar,
    COALESCE(sl.slope_8_15, 0) as slope_landai,
    COALESCE(sl.slope_15_25, 0) as slope_agak_curam,
    COALESCE(sl.slope_25_40, 0) as slope_curam,
    COALESCE(sl.slope_above_40, 0) as slope_sangat_curam,

    -- Slope Classification (dominant class)
    CASE
        WHEN sl.avg_slope IS NULL THEN NULL
        WHEN sl.avg_slope < 8 THEN 'DATAR'
        WHEN sl.avg_slope < 15 THEN 'LANDAI'
        WHEN sl.avg_slope < 25 THEN 'AGAK_CURAM'
        WHEN sl.avg_slope < 40 THEN 'CURAM'
        ELSE 'SANGAT_CURAM'
    END as kelas_lereng,

    -- Calculated Metrics
    CASE
        WHEN COALESCE(y.total_area, 0) > 0
        THEN ROUND(((COALESCE(y.hutan_primer, 0) + COALESCE(y.hutan_sekunder, 0)) / y.total_area * 100)::numeric, 2)
        ELSE 0
    END as persen_hutan,

    CASE
        WHEN COALESCE(y.total_area, 0) > 0
        THEN ROUND((COALESCE(y.tanah_kosong, 0) / y.total_area * 100)::numeric, 2)
        ELSE 0
    END as persen_terbuka,

    -- Risk Level
    CASE
        WHEN COALESCE(hs.hotspot_count, 0) >= 10 THEN 'TINGGI'
        WHEN COALESCE(hs.hotspot_count, 0) >= 5 THEN 'SEDANG'
        WHEN COALESCE(hs.hotspot_count, 0) >= 1 THEN 'RENDAH'
        ELSE 'AMAN'
    END as risk_level,

    -- Erosion Risk Level
    CASE
        WHEN sl.avg_slope IS NULL THEN NULL
        WHEN sl.avg_slope >= 25 AND COALESCE(y.tanah_kosong, 0) > 10 THEN 'TINGGI'
        WHEN sl.avg_slope >= 15 AND COALESCE(y.tanah_kosong, 0) > 5 THEN 'SEDANG'
        WHEN sl.avg_slope >= 8 OR COALESCE(y.tanah_kosong, 0) > 2 THEN 'RENDAH'
        ELSE 'AMAN'
    END as erosion_risk,

    y.created_at as data_created_at

FROM public.analysis_yearly_data y
LEFT JOIN public.analysis_history h ON h.id = y.history_id
LEFT JOIN public.master_kps k ON k.id_kps_api = h.kps_id
LEFT JOIN public.analysis_slope_summary sl ON sl.history_id = y.history_id AND sl.scope = 'INSIDE'
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) as hotspot_count,
        COUNT(CASE WHEN confidence_level = 'high' THEN 1 END) as hotspot_high,
        COUNT(CASE WHEN confidence_level = 'nominal' THEN 1 END) as hotspot_nominal,
        COUNT(CASE WHEN confidence_level = 'low' THEN 1 END) as hotspot_low,
        AVG(brightness) as avg_brightness,
        AVG(frp) as avg_frp,
        MIN(acq_date) as first_detection,
        MAX(acq_date) as last_detection
    FROM public.analysis_hotspots hs
    WHERE hs.history_id = y.history_id AND hs.year = y.year
) hs ON true
ORDER BY k.provinsi, k.kab_kota, k.nama_kps, y.year;

COMMENT ON VIEW public.v_kps_yearly_analysis IS 'LONG: Enriched yearly analysis view';


-- STEP 2: CREATE WIDE VIEW (v_rekap_paduserasi_wide)
-- Pivots key metrics for years 2017-2025

CREATE OR REPLACE VIEW public.v_rekap_paduserasi_wide AS
SELECT
    -- Grouping Keys (One row per History ID)
    h.id as history_id,
    k.id_kps_api,
    k.nama_kps,
    k.provinsi,
    k.kab_kota,
    k.luas_sk_ha,
    
    -- Metadata
    h.status as status_analisis,
    MAX(h.created_at) as tgl_analisis,
    
    -- === 2017 ===
    MAX(CASE WHEN y.year = 2017 THEN (COALESCE(y.hutan_primer,0) + COALESCE(y.hutan_sekunder,0)) ELSE 0 END) as hutan_2017,
    MAX(CASE WHEN y.year = 2017 THEN COALESCE(y.tanah_kosong,0) ELSE 0 END) as terbuka_2017,
    MAX(CASE WHEN y.year = 2017 THEN COALESCE(y.lahan_terbangun,0) ELSE 0 END) as terbangun_2017,
    
    -- === 2018 ===
    MAX(CASE WHEN y.year = 2018 THEN (COALESCE(y.hutan_primer,0) + COALESCE(y.hutan_sekunder,0)) ELSE 0 END) as hutan_2018,
    MAX(CASE WHEN y.year = 2018 THEN COALESCE(y.tanah_kosong,0) ELSE 0 END) as terbuka_2018,
    MAX(CASE WHEN y.year = 2018 THEN COALESCE(y.lahan_terbangun,0) ELSE 0 END) as terbangun_2018,
    
    -- === 2019 ===
    MAX(CASE WHEN y.year = 2019 THEN (COALESCE(y.hutan_primer,0) + COALESCE(y.hutan_sekunder,0)) ELSE 0 END) as hutan_2019,
    MAX(CASE WHEN y.year = 2019 THEN COALESCE(y.tanah_kosong,0) ELSE 0 END) as terbuka_2019,
    MAX(CASE WHEN y.year = 2019 THEN COALESCE(y.lahan_terbangun,0) ELSE 0 END) as terbangun_2019,
    
    -- === 2020 ===
    MAX(CASE WHEN y.year = 2020 THEN (COALESCE(y.hutan_primer,0) + COALESCE(y.hutan_sekunder,0)) ELSE 0 END) as hutan_2020,
    MAX(CASE WHEN y.year = 2020 THEN COALESCE(y.tanah_kosong,0) ELSE 0 END) as terbuka_2020,
    MAX(CASE WHEN y.year = 2020 THEN COALESCE(y.lahan_terbangun,0) ELSE 0 END) as terbangun_2020,
    
    -- === 2021 ===
    MAX(CASE WHEN y.year = 2021 THEN (COALESCE(y.hutan_primer,0) + COALESCE(y.hutan_sekunder,0)) ELSE 0 END) as hutan_2021,
    MAX(CASE WHEN y.year = 2021 THEN COALESCE(y.tanah_kosong,0) ELSE 0 END) as terbuka_2021,
    MAX(CASE WHEN y.year = 2021 THEN COALESCE(y.lahan_terbangun,0) ELSE 0 END) as terbangun_2021,
    
    -- === 2022 ===
    MAX(CASE WHEN y.year = 2022 THEN (COALESCE(y.hutan_primer,0) + COALESCE(y.hutan_sekunder,0)) ELSE 0 END) as hutan_2022,
    MAX(CASE WHEN y.year = 2022 THEN COALESCE(y.tanah_kosong,0) ELSE 0 END) as terbuka_2022,
    MAX(CASE WHEN y.year = 2022 THEN COALESCE(y.lahan_terbangun,0) ELSE 0 END) as terbangun_2022,
    
    -- === 2023 ===
    MAX(CASE WHEN y.year = 2023 THEN (COALESCE(y.hutan_primer,0) + COALESCE(y.hutan_sekunder,0)) ELSE 0 END) as hutan_2023,
    MAX(CASE WHEN y.year = 2023 THEN COALESCE(y.tanah_kosong,0) ELSE 0 END) as terbuka_2023,
    MAX(CASE WHEN y.year = 2023 THEN COALESCE(y.lahan_terbangun,0) ELSE 0 END) as terbangun_2023,
    
    -- === 2024 ===
    MAX(CASE WHEN y.year = 2024 THEN (COALESCE(y.hutan_primer,0) + COALESCE(y.hutan_sekunder,0)) ELSE 0 END) as hutan_2024,
    MAX(CASE WHEN y.year = 2024 THEN COALESCE(y.tanah_kosong,0) ELSE 0 END) as terbuka_2024,
    MAX(CASE WHEN y.year = 2024 THEN COALESCE(y.lahan_terbangun,0) ELSE 0 END) as terbangun_2024,
    
    -- === 2025 ===
    MAX(CASE WHEN y.year = 2025 THEN (COALESCE(y.hutan_primer,0) + COALESCE(y.hutan_sekunder,0)) ELSE 0 END) as hutan_2025,
    MAX(CASE WHEN y.year = 2025 THEN COALESCE(y.tanah_kosong,0) ELSE 0 END) as terbuka_2025,
    MAX(CASE WHEN y.year = 2025 THEN COALESCE(y.lahan_terbangun,0) ELSE 0 END) as terbangun_2025,

    -- Totals / Changes (from History)
    MAX(h.deforestation_ha) as total_deforestasi,
    MAX(h.reforestation_ha) as total_reforestasi

FROM public.analysis_history h
JOIN public.master_kps k ON k.id_kps_api = h.kps_id
JOIN public.analysis_yearly_data y ON y.history_id = h.id
GROUP BY h.id, k.id_kps_api, k.nama_kps, k.provinsi, k.kab_kota, k.luas_sk_ha
ORDER BY k.provinsi, k.nama_kps;

COMMENT ON VIEW public.v_rekap_paduserasi_wide IS 'WIDE: Rekap data tutupan lahan per tahun (Pivot 2017-2025)';

-- Verification
SELECT 'v_rekap_paduserasi_wide' as view_name, COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'v_rekap_paduserasi_wide';
"""


def run_migration_psycopg2(database_url):
    """Run migration using psycopg2."""
    try:
        import psycopg2
    except ImportError:
        print("❌ psycopg2 not installed. Installing...")
        os.system("pip install psycopg2-binary")
        import psycopg2

    print(f"🔌 Connecting to database...")
    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    cur = conn.cursor()

    print("🚀 Running migration...")
    try:
        cur.execute(MIGRATION_SQL)
        print("✅ Migration completed successfully!")

        # Verify
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'v_kps_yearly_analysis'
            ORDER BY ordinal_position
        """)
        columns = cur.fetchall()
        print(f"\n📊 v_kps_yearly_analysis now has {len(columns)} columns:")
        for col in columns:
            print(f"   - {col[0]}")

    except Exception as e:
        print(f"❌ Error: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def main():
    # Check for DATABASE_URL in environment
    database_url = os.getenv("DATABASE_URL")

    # Check for password as command line argument
    if not database_url and len(sys.argv) > 1:
        password = sys.argv[1]
        database_url = f"postgresql://postgres.omnshwtbzsxiqpdtonbo:{password}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"

    if not database_url:
        print("=" * 70)
        print("🔧 MIGRATION: KPS Views dengan Slope Data")
        print("=" * 70)
        print()
        print("Database URL tidak ditemukan. Pilih salah satu cara:")
        print()
        print("1️⃣  Jalankan dengan password sebagai argument:")
        print("    python run_kps_views_migration.py YOUR_DATABASE_PASSWORD")
        print()
        print("2️⃣  Set DATABASE_URL di .env:")
        print("    DATABASE_URL=postgresql://postgres.omnshwtbzsxiqpdtonbo:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres")
        print()
        print("3️⃣  Jalankan manual di Supabase Dashboard:")
        print("    - Buka: https://supabase.com/dashboard/project/omnshwtbzsxiqpdtonbo/sql")
        print("    - Copy-paste SQL dari file: supabase_migration_kps_views.sql")
        print("    - Klik Run")
        print()
        print("=" * 70)
        print()
        print("📋 Anda juga bisa copy SQL berikut ke Supabase Dashboard:")
        print("=" * 70)
        print(MIGRATION_SQL)
        return

    run_migration_psycopg2(database_url)


if __name__ == "__main__":
    main()
