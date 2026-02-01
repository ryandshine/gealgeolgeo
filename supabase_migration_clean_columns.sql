-- ============================================================================
-- MIGRATION: CLEAN LEGACY COLUMNS (Keep data, Drop unused columns)
-- Date: 2026-02-01
-- Purpose: Remove 4 legacy land cover class columns from analysis_yearly_data
--          Safe deletion: DROP dependent view first, then columns, then recreate view
-- ============================================================================

-- STEP 1: Drop dependent view (will be recreated at end)
DROP VIEW IF EXISTS public.v_kps_yearly_analysis CASCADE;

-- STEP 2: Remove 4 legacy land cover class columns (no longer used)
-- These were for experimental classes: semak_padang_rumput, lahan_pertanian, gambut, tanah_terbuka
-- All data in these columns is 0.0 anyway (never actually used in modern classification)

ALTER TABLE public.analysis_yearly_data
DROP COLUMN IF EXISTS semak_padang_rumput;

ALTER TABLE public.analysis_yearly_data
DROP COLUMN IF EXISTS lahan_pertanian;

ALTER TABLE public.analysis_yearly_data
DROP COLUMN IF EXISTS gambut;

ALTER TABLE public.analysis_yearly_data
DROP COLUMN IF EXISTS tanah_terbuka;

-- STEP 3: Verify - analysis_yearly_data now has ONLY 6 land cover classes + metadata
-- Expected columns: id, history_id, year, hutan_primer, hutan_sekunder, tanah_kering, tanah_kosong, lahan_terbangun, air, total_area, created_at

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'analysis_yearly_data'
ORDER BY ordinal_position;

-- STEP 4: Recreate view with 6-class schema (from run_kps_views_migration.py)
-- NOTE: Run this after updating run_kps_views_migration.py and restarting backend
-- The view will be automatically recreated by the application on startup
-- OR manually run: python run_kps_views_migration.py

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
