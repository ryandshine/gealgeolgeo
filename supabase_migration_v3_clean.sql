-- ============================================================================
-- MIGRATION V3 (ULTRA CLEAN): COMPLETE FRESH START
-- Date: 2026-01-31
-- Purpose: Complete clean slate - drops ALL data and recreates schema
-- WARNING: This will DELETE ALL existing analysis data!
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- STEP 1: DROP ALL EXISTING TABLES (CASCADE)
-- ============================================================================

-- Drop in reverse dependency order
DROP TABLE IF EXISTS public.analysis_erosion_risk CASCADE;
DROP TABLE IF EXISTS public.analysis_hotspots CASCADE;
DROP TABLE IF EXISTS public.analysis_slope_summary CASCADE;
DROP TABLE IF EXISTS public.analysis_yearly_data CASCADE;
DROP TABLE IF EXISTS public.analysis_history CASCADE;
DROP TABLE IF EXISTS public.master_lahan CASCADE;
DROP TABLE IF EXISTS public.master_kps CASCADE;

-- ============================================================================
-- STEP 2: CREATE MASTER TABLES
-- ============================================================================

-- 1. MASTER KPS TABLE
CREATE TABLE public.master_kps (
    id_master_kps UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_kps_api TEXT UNIQUE,
    nama_kps TEXT NOT NULL,
    no_sk TEXT UNIQUE,
    kps_type TEXT,
    skema TEXT,
    provinsi TEXT,
    kab_kota TEXT,
    kecamatan TEXT,
    desa TEXT,
    hutan_desa TEXT,
    tgl_sk DATE,
    umur_sk INTEGER,
    luas_sk_ha NUMERIC,
    luas_indikatif_ha NUMERIC,
    luas_definitif_ha NUMERIC,
    luas_areal_kerja_ha NUMERIC,
    latitude NUMERIC,
    longitude NUMERIC,
    source_api TEXT DEFAULT 'PKPS',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX idx_master_kps_no_sk ON public.master_kps(no_sk);
CREATE INDEX idx_master_kps_type ON public.master_kps(kps_type);
CREATE INDEX idx_master_kps_provinsi ON public.master_kps(provinsi);

ALTER TABLE public.master_kps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for master_kps" ON public.master_kps FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.master_kps IS 'Master registry of KPS from national PKPS APIs';

-- 2. MASTER LAHAN TABLE
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

CREATE INDEX idx_master_lahan_geom_hash ON public.master_lahan(geom_hash);
CREATE INDEX idx_master_lahan_centroid ON public.master_lahan(centroid_lat, centroid_lng);

ALTER TABLE public.master_lahan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for master_lahan" ON public.master_lahan FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.master_lahan IS 'Normalized geometry storage to avoid duplication';

-- ============================================================================
-- STEP 3: RECREATE ANALYSIS_HISTORY WITH NEW SCHEMA
-- ============================================================================

CREATE TABLE public.analysis_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- File info
    filename TEXT NOT NULL,
    file_size BIGINT,

    -- Foreign keys
    lahan_id UUID REFERENCES public.master_lahan(id) ON DELETE SET NULL,
    kps_id TEXT REFERENCES public.master_kps(id_kps_api) ON DELETE SET NULL,

    -- Analysis scope and linking
    analysis_scope TEXT DEFAULT 'KPS' CHECK (analysis_scope IN ('KPS', 'NON_KPS')),
    link_method TEXT DEFAULT 'NONE' CHECK (link_method IN ('NO_SK_METADATA', 'MANUAL', 'NONE', 'AUTO')),
    status TEXT DEFAULT 'COMPLETE' CHECK (status IN ('COMPLETE', 'INVALIDATED', 'PENDING', 'FAILED')),
    analysis_version INTEGER DEFAULT 1,

    -- Linking metadata
    linked_by_user TEXT,
    linked_at TIMESTAMP WITH TIME ZONE,

    -- Location
    center_lat NUMERIC,
    center_lng NUMERIC,

    -- Analysis data (JSONB for backward compatibility)
    geo_data JSONB,
    analysis_results JSONB,
    metadata JSONB,

    -- Metrics
    trend_type TEXT CHECK (trend_type IN ('INCREASING', 'DECREASING', 'STABLE') OR trend_type IS NULL),
    hotspot_count INTEGER DEFAULT 0,
    deforestation_ha NUMERIC DEFAULT 0,
    reforestation_ha NUMERIC DEFAULT 0,
    degradation_ha NUMERIC DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Indexes
CREATE INDEX idx_analysis_history_lahan_id ON public.analysis_history(lahan_id);
CREATE INDEX idx_analysis_history_kps_id ON public.analysis_history(kps_id);
CREATE INDEX idx_analysis_history_scope ON public.analysis_history(analysis_scope);
CREATE INDEX idx_analysis_history_status ON public.analysis_history(status);
CREATE INDEX idx_analysis_history_version ON public.analysis_history(analysis_version);
CREATE INDEX idx_analysis_history_created_at ON public.analysis_history(created_at DESC);

-- RLS
ALTER TABLE public.analysis_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for analysis_history" ON public.analysis_history FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.analysis_history IS 'Analysis history with KPS linking and versioning';

-- ============================================================================
-- STEP 4: CREATE RELATIONAL ANALYSIS TABLES
-- ============================================================================

-- 4. ANALYSIS YEARLY DATA
CREATE TABLE public.analysis_yearly_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id UUID NOT NULL REFERENCES public.analysis_history(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,

    -- 8 Land Cover Classes
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

CREATE INDEX idx_yearly_data_history_id ON public.analysis_yearly_data(history_id);
CREATE INDEX idx_yearly_data_year ON public.analysis_yearly_data(year);

ALTER TABLE public.analysis_yearly_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for yearly_data" ON public.analysis_yearly_data FOR ALL USING (true) WITH CHECK (true);

-- 5. ANALYSIS SLOPE SUMMARY
CREATE TABLE public.analysis_slope_summary (
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

CREATE INDEX idx_slope_summary_history_id ON public.analysis_slope_summary(history_id);

ALTER TABLE public.analysis_slope_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for slope_summary" ON public.analysis_slope_summary FOR ALL USING (true) WITH CHECK (true);

-- 6. ANALYSIS HOTSPOTS
CREATE TABLE public.analysis_hotspots (
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

CREATE INDEX idx_hotspots_history_id ON public.analysis_hotspots(history_id);
CREATE INDEX idx_hotspots_year ON public.analysis_hotspots(year);
CREATE INDEX idx_hotspots_date ON public.analysis_hotspots(acq_date);
CREATE INDEX idx_hotspots_location ON public.analysis_hotspots(latitude, longitude);

ALTER TABLE public.analysis_hotspots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for hotspots" ON public.analysis_hotspots FOR ALL USING (true) WITH CHECK (true);

-- 7. ANALYSIS EROSION RISK
CREATE TABLE public.analysis_erosion_risk (
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

CREATE INDEX idx_erosion_risk_history_id ON public.analysis_erosion_risk(history_id);

ALTER TABLE public.analysis_erosion_risk ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for erosion_risk" ON public.analysis_erosion_risk FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Show all created tables
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN (
    'master_kps',
    'master_lahan',
    'analysis_history',
    'analysis_yearly_data',
    'analysis_slope_summary',
    'analysis_hotspots',
    'analysis_erosion_risk'
)
ORDER BY table_name;

-- ============================================================================
-- END OF ULTRA CLEAN MIGRATION V3
-- ============================================================================
