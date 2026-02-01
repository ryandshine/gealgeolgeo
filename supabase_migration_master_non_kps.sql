-- ============================================================================
-- MIGRATION: Add master_non_kps Table
-- Date: 2026-02-01
-- Purpose: Lightweight registry for Non-KPS land parcels
-- Description: Creates master table for Non-KPS analyses with minimal metadata
-- ============================================================================

-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- STEP 1: CREATE MASTER_NON_KPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.master_non_kps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification (minimal)
    nama_areal TEXT NOT NULL,                  -- Auto from filename, user editable

    -- Geometry reference (normalized)
    lahan_id UUID NOT NULL REFERENCES public.master_lahan(id) ON DELETE RESTRICT,

    -- Computed fields (from linked geometry for quick access)
    area_ha NUMERIC,
    centroid_lat NUMERIC,
    centroid_lng NUMERIC,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ============================================================================
-- STEP 2: CREATE INDEXES
-- ============================================================================

-- Index for geometry lookups (deduplication)
CREATE INDEX IF NOT EXISTS idx_master_non_kps_lahan_id ON public.master_non_kps(lahan_id);

-- Full-text search index for nama_areal (future autocomplete)
CREATE INDEX IF NOT EXISTS idx_master_non_kps_nama
ON public.master_non_kps USING gin(to_tsvector('indonesian', nama_areal));

-- ============================================================================
-- STEP 3: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.master_non_kps ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists and recreate (idempotent)
DROP POLICY IF EXISTS "Allow all operations for master_non_kps" ON public.master_non_kps;

CREATE POLICY "Allow all operations for master_non_kps"
ON public.master_non_kps FOR ALL
USING (true) WITH CHECK (true);

-- ============================================================================
-- STEP 4: ADD COMMENT
-- ============================================================================

COMMENT ON TABLE public.master_non_kps IS
'Master registry of non-KPS land parcels (minimal metadata for archive tracking)';

-- ============================================================================
-- STEP 5: ADD FOREIGN KEY TO ANALYSIS_HISTORY
-- ============================================================================

-- Add non_kps_id column if not exists
ALTER TABLE public.analysis_history
    ADD COLUMN IF NOT EXISTS non_kps_id UUID;

-- Add foreign key constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'analysis_history_non_kps_id_fkey'
    ) THEN
        ALTER TABLE public.analysis_history
            ADD CONSTRAINT analysis_history_non_kps_id_fkey
            FOREIGN KEY (non_kps_id)
            REFERENCES public.master_non_kps(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for foreign key lookups
CREATE INDEX IF NOT EXISTS idx_analysis_history_non_kps_id
ON public.analysis_history(non_kps_id);

-- Add comment
COMMENT ON COLUMN public.analysis_history.non_kps_id IS
'Reference to master_non_kps for NON_KPS analyses (mutually exclusive with kps_id)';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check master_non_kps table exists
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'master_non_kps' AND table_schema = 'public') as column_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'master_non_kps';

-- Check analysis_history has new column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'analysis_history'
  AND column_name = 'non_kps_id';

-- Check foreign key constraint
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'analysis_history'
  AND kcu.column_name = 'non_kps_id';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
