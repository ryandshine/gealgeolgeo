-- ============================================================================
-- MIGRATION V3 (SAFE VERSION): COMPLETE SCHEMA FOR GEALGEOLGEO SYSTEM
-- Date: 2026-01-31
-- Purpose: Fix missing tables and columns identified in code audit
-- This version drops existing objects first for clean installation
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- 1. MASTER KPS TABLE (KPS Registry)
-- ============================================================================

-- Drop existing if needed
DROP TABLE IF EXISTS public.master_kps CASCADE;

CREATE TABLE public.master_kps (
    id_master_kps UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_kps_api TEXT UNIQUE, -- ID from external PKPS API
    nama_kps TEXT NOT NULL,
    no_sk TEXT UNIQUE, -- SK number (for auto-detection)
    kps_type TEXT, -- 'PPHKm', 'PPHTR', 'PKK', 'PPHD'
    skema TEXT,

    -- Administrative boundaries
    provinsi TEXT,
    kab_kota TEXT,
    kecamatan TEXT,
    desa TEXT,
    hutan_desa TEXT,

    -- SK details
    tgl_sk DATE,
    umur_sk INTEGER, -- Age in years

    -- Area information (in hectares)
    luas_sk_ha NUMERIC,
    luas_indikatif_ha NUMERIC,
    luas_definitif_ha NUMERIC,
    luas_areal_kerja_ha NUMERIC,

    -- Coordinates
    latitude NUMERIC,
    longitude NUMERIC,

    -- Metadata
    source_api TEXT DEFAULT 'PKPS',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Indexes
CREATE INDEX idx_master_kps_no_sk ON public.master_kps(no_sk);
CREATE INDEX idx_master_kps_type ON public.master_kps(kps_type);
CREATE INDEX idx_master_kps_provinsi ON public.master_kps(provinsi);

-- RLS
ALTER TABLE public.master_kps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for master_kps" ON public.master_kps;
CREATE POLICY "Allow all operations for master_kps"
ON public.master_kps FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.master_kps IS 'Master registry of KPS (Kesatuan Pengelolaan Sosial) from national PKPS APIs';

-- ============================================================================
-- 2. MASTER LAHAN TABLE (Geometry Normalization)
-- ============================================================================

-- Drop existing if needed
DROP TABLE IF EXISTS public.master_lahan CASCADE;

CREATE TABLE public.master_lahan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    geom_hash TEXT UNIQUE NOT NULL,
    geom_geojson JSONB NOT NULL,
    geom_wkt TEXT,
    centroid_lat NUMERIC,
    centroid_lng NUMERIC,
    area_ha NUMERIC,
    perimeter_m NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Indexes
CREATE INDEX idx_master_lahan_geom_hash ON public.master_lahan(geom_hash);
CREATE INDEX idx_master_lahan_centroid ON public.master_lahan(centroid_lat, centroid_lng);

-- RLS
ALTER TABLE public.master_lahan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for master_lahan" ON public.master_lahan;
CREATE POLICY "Allow all operations for master_lahan"
ON public.master_lahan FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.master_lahan IS 'Normalized geometry storage to avoid duplication of same land parcels';

-- ============================================================================
-- 3. ADD MISSING COLUMNS TO analysis_history
-- ============================================================================

-- Add columns if not exists (safe for existing data)
ALTER TABLE public.analysis_history
    ADD COLUMN IF NOT EXISTS lahan_id UUID,
    ADD COLUMN IF NOT EXISTS kps_id TEXT,
    ADD COLUMN IF NOT EXISTS analysis_scope TEXT DEFAULT 'KPS',
    ADD COLUMN IF NOT EXISTS link_method TEXT DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETE',
    ADD COLUMN IF NOT EXISTS analysis_version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS linked_by_user TEXT,
    ADD COLUMN IF NOT EXISTS linked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS center_lat NUMERIC,
    ADD COLUMN IF NOT EXISTS center_lng NUMERIC,
    ADD COLUMN IF NOT EXISTS trend_type TEXT,
    ADD COLUMN IF NOT EXISTS hotspot_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deforestation_ha NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reforestation_ha NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS degradation_ha NUMERIC DEFAULT 0;

-- Add foreign keys (will fail silently if already exists)
DO $$
BEGIN
    ALTER TABLE public.analysis_history ADD CONSTRAINT fk_lahan_id
        FOREIGN KEY (lahan_id) REFERENCES public.master_lahan(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE public.analysis_history ADD CONSTRAINT fk_kps_id
        FOREIGN KEY (kps_id) REFERENCES public.master_kps(id_kps_api) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add constraints (will fail silently if already exists)
DO $$
BEGIN
    ALTER TABLE public.analysis_history ADD CONSTRAINT check_analysis_scope
        CHECK (analysis_scope IN ('KPS', 'NON_KPS'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE public.analysis_history ADD CONSTRAINT check_link_method
        CHECK (link_method IN ('NO_SK_METADATA', 'MANUAL', 'NONE', 'AUTO'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE public.analysis_history ADD CONSTRAINT check_status
        CHECK (status IN ('COMPLETE', 'INVALIDATED', 'PENDING', 'FAILED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE public.analysis_history ADD CONSTRAINT check_trend_type
        CHECK (trend_type IN ('INCREASING', 'DECREASING', 'STABLE') OR trend_type IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analysis_history_lahan_id ON public.analysis_history(lahan_id);
CREATE INDEX IF NOT EXISTS idx_analysis_history_kps_id ON public.analysis_history(kps_id);
CREATE INDEX IF NOT EXISTS idx_analysis_history_scope ON public.analysis_history(analysis_scope);
CREATE INDEX IF NOT EXISTS idx_analysis_history_status ON public.analysis_history(status);
CREATE INDEX IF NOT EXISTS idx_analysis_history_version ON public.analysis_history(analysis_version);

-- Comments
COMMENT ON COLUMN public.analysis_history.lahan_id IS 'Foreign reference to master_lahan.id';
COMMENT ON COLUMN public.analysis_history.kps_id IS 'Foreign reference to master_kps.id_kps_api';
COMMENT ON COLUMN public.analysis_history.analysis_scope IS 'KPS or NON_KPS';
COMMENT ON COLUMN public.analysis_history.link_method IS 'How KPS was linked';
COMMENT ON COLUMN public.analysis_history.status IS 'COMPLETE, INVALIDATED, PENDING, or FAILED';

-- ============================================================================
-- 4. ANALYSIS YEARLY DATA TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analysis_yearly_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id UUID NOT NULL REFERENCES public.analysis_history(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    hutan_primer NUMERIC DEFAULT 0,
    hutan_sekunder NUMERIC DEFAULT 0,
    semak_padang_rumput NUMERIC DEFAULT 0,
    air NUMERIC DEFAULT 0,
    gambut NUMERIC DEFAULT 0,
    lahan_pertanian NUMERIC DEFAULT 0,
    tanah_terbuka NUMERIC DEFAULT 0,
    lahan_terbangun NUMERIC DEFAULT 0,
    total_area NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(history_id, year)
);

CREATE INDEX IF NOT EXISTS idx_yearly_data_history_id ON public.analysis_yearly_data(history_id);
CREATE INDEX IF NOT EXISTS idx_yearly_data_year ON public.analysis_yearly_data(year);

ALTER TABLE public.analysis_yearly_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for yearly_data" ON public.analysis_yearly_data;
CREATE POLICY "Allow all operations for yearly_data"
ON public.analysis_yearly_data FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. ANALYSIS SLOPE SUMMARY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analysis_slope_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id UUID NOT NULL REFERENCES public.analysis_history(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('INSIDE', 'OUTSIDE_2KM')),
    avg_slope NUMERIC,
    slope_0_8 NUMERIC DEFAULT 0,
    slope_8_15 NUMERIC DEFAULT 0,
    slope_15_25 NUMERIC DEFAULT 0,
    slope_25_40 NUMERIC DEFAULT 0,
    slope_above_40 NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(history_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_slope_summary_history_id ON public.analysis_slope_summary(history_id);

ALTER TABLE public.analysis_slope_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for slope_summary" ON public.analysis_slope_summary;
CREATE POLICY "Allow all operations for slope_summary"
ON public.analysis_slope_summary FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 6. ANALYSIS HOTSPOTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analysis_hotspots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id UUID NOT NULL REFERENCES public.analysis_history(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,
    acq_date DATE NOT NULL,
    confidence INTEGER,
    brightness NUMERIC,
    source TEXT NOT NULL CHECK (source IN ('NASA_FIRMS', 'ARCGIS', 'BMKG')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hotspots_history_id ON public.analysis_hotspots(history_id);
CREATE INDEX IF NOT EXISTS idx_hotspots_year ON public.analysis_hotspots(year);
CREATE INDEX IF NOT EXISTS idx_hotspots_date ON public.analysis_hotspots(acq_date);
CREATE INDEX IF NOT EXISTS idx_hotspots_location ON public.analysis_hotspots(latitude, longitude);

ALTER TABLE public.analysis_hotspots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for hotspots" ON public.analysis_hotspots;
CREATE POLICY "Allow all operations for hotspots"
ON public.analysis_hotspots FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 7. ANALYSIS EROSION RISK TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analysis_erosion_risk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id UUID NOT NULL REFERENCES public.analysis_history(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('INSIDE', 'OUTSIDE_2KM')),
    risk_low_ha NUMERIC DEFAULT 0,
    risk_medium_ha NUMERIC DEFAULT 0,
    risk_high_ha NUMERIC DEFAULT 0,
    risk_very_high_ha NUMERIC DEFAULT 0,
    avg_rainfall_30d NUMERIC,
    avg_slope NUMERIC,
    dominant_risk_class TEXT CHECK (dominant_risk_class IN ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(history_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_erosion_risk_history_id ON public.analysis_erosion_risk(history_id);

ALTER TABLE public.analysis_erosion_risk ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for erosion_risk" ON public.analysis_erosion_risk;
CREATE POLICY "Allow all operations for erosion_risk"
ON public.analysis_erosion_risk FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- END OF MIGRATION V3 (SAFE VERSION)
-- ============================================================================
