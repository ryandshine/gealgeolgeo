-- ============================================================================
-- MIGRATION: ADD MISSING 6-CLASS IPSDH COLUMNS
-- Date: 2026-02-01
-- Purpose: Add tanah_kering and tanah_kosong columns to analysis_yearly_data
--          These are IPSDH standard classes missing from original schema
-- ============================================================================

-- STEP 1: Add missing columns (if not exist)
ALTER TABLE public.analysis_yearly_data
ADD COLUMN IF NOT EXISTS tanah_kering NUMERIC DEFAULT 0;

ALTER TABLE public.analysis_yearly_data
ADD COLUMN IF NOT EXISTS tanah_kosong NUMERIC DEFAULT 0;

-- STEP 2: Verify final schema - should have exactly 6 land cover classes
-- Expected: id, history_id, year, hutan_primer, hutan_sekunder, tanah_kering, tanah_kosong, lahan_terbangun, air, total_area, created_at

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'analysis_yearly_data'
ORDER BY ordinal_position;

-- STEP 3: Verify land cover classes count (should be 6)
SELECT
    COUNT(*) as total_columns,
    COUNT(CASE WHEN column_name IN ('hutan_primer', 'hutan_sekunder', 'tanah_kering', 'tanah_kosong', 'lahan_terbangun', 'air') THEN 1 END) as ipsdh_classes
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'analysis_yearly_data';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
