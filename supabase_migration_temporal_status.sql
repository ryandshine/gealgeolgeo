-- ============================================================================
-- MIGRATION: ADD TEMPORAL STATUS & DOMINANT CLASS COLUMNS
-- Date: 2026-02-01
-- Purpose: Add grey area temporal tracking and 6-class dominant classification
-- Context: Implements IPSDH 6-class system with temporal change detection
-- ============================================================================

-- STEP 1: Add temporal_status column to track grey area status
-- This column stores the temporal change status for each year:
-- - stable: No change from previous year
-- - transition_unconfirmed: Changed once (grey area)
-- - transition_confirmed: Change persisted for 2+ years (confirmed)
-- - reverted_noise: Changed but reverted back (noise/seasonal)
ALTER TABLE public.analysis_yearly_data
ADD COLUMN IF NOT EXISTS temporal_status TEXT DEFAULT 'stable'
    CHECK (temporal_status IN ('stable', 'transition_unconfirmed', 'transition_confirmed', 'reverted_noise'));

-- STEP 2: Add dominant_class column to store the primary land cover class
-- Maps to IPSDH 6 standard classes only:
-- 1. hutan_primer
-- 2. hutan_sekunder
-- 3. tanah_kering
-- 4. tanah_kosong
-- 5. lahan_terbangun
-- 6. air
ALTER TABLE public.analysis_yearly_data
ADD COLUMN IF NOT EXISTS dominant_class TEXT
    CHECK (dominant_class IN ('hutan_primer', 'hutan_sekunder', 'tanah_kering', 'tanah_kosong', 'lahan_terbangun', 'air'));

-- STEP 3: Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_yearly_data_temporal_status
    ON public.analysis_yearly_data(temporal_status);

CREATE INDEX IF NOT EXISTS idx_yearly_data_dominant_class
    ON public.analysis_yearly_data(dominant_class);

-- Composite index for filtering by both status and class
CREATE INDEX IF NOT EXISTS idx_yearly_data_class_status
    ON public.analysis_yearly_data(dominant_class, temporal_status);

-- STEP 4: Add comment for documentation
COMMENT ON COLUMN public.analysis_yearly_data.temporal_status IS
    'Temporal change status: stable, transition_unconfirmed (grey area), transition_confirmed, reverted_noise';

COMMENT ON COLUMN public.analysis_yearly_data.dominant_class IS
    'Dominant land cover class from IPSDH 6-class system';

-- ============================================================================
-- STEP 5: Create helper function to determine dominant class
-- ============================================================================

CREATE OR REPLACE FUNCTION get_dominant_class(
    p_hutan_primer NUMERIC,
    p_hutan_sekunder NUMERIC,
    p_tanah_kering NUMERIC,
    p_tanah_kosong NUMERIC,
    p_lahan_terbangun NUMERIC,
    p_air NUMERIC
) RETURNS TEXT AS $$
DECLARE
    max_val NUMERIC;
    result TEXT;
BEGIN
    -- Find the maximum value among all classes
    max_val := GREATEST(
        COALESCE(p_hutan_primer, 0),
        COALESCE(p_hutan_sekunder, 0),
        COALESCE(p_tanah_kering, 0),
        COALESCE(p_tanah_kosong, 0),
        COALESCE(p_lahan_terbangun, 0),
        COALESCE(p_air, 0)
    );

    -- Return the class name with the maximum value
    CASE
        WHEN max_val = COALESCE(p_hutan_primer, 0) AND max_val > 0 THEN result := 'hutan_primer';
        WHEN max_val = COALESCE(p_hutan_sekunder, 0) AND max_val > 0 THEN result := 'hutan_sekunder';
        WHEN max_val = COALESCE(p_tanah_kering, 0) AND max_val > 0 THEN result := 'tanah_kering';
        WHEN max_val = COALESCE(p_tanah_kosong, 0) AND max_val > 0 THEN result := 'tanah_kosong';
        WHEN max_val = COALESCE(p_lahan_terbangun, 0) AND max_val > 0 THEN result := 'lahan_terbangun';
        WHEN max_val = COALESCE(p_air, 0) AND max_val > 0 THEN result := 'air';
        ELSE result := NULL;
    END CASE;

    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- STEP 6: Backfill dominant_class for existing data (if any)
-- ============================================================================

UPDATE public.analysis_yearly_data
SET dominant_class = get_dominant_class(
    hutan_primer,
    hutan_sekunder,
    tanah_kering,
    tanah_kosong,
    lahan_terbangun,
    air
)
WHERE dominant_class IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check new columns exist
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'analysis_yearly_data'
  AND column_name IN ('temporal_status', 'dominant_class')
ORDER BY column_name;

-- Check indexes created
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'analysis_yearly_data'
  AND indexname LIKE '%temporal%' OR indexname LIKE '%dominant%'
ORDER BY indexname;

-- Sample data check (if data exists)
SELECT
    year,
    dominant_class,
    temporal_status,
    hutan_primer,
    hutan_sekunder,
    tanah_kering,
    tanah_kosong
FROM public.analysis_yearly_data
LIMIT 5;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
