-- ============================================================================
-- MIGRATION V3: COMPLETE SCHEMA FOR GEALGEOLGEO SYSTEM
-- Date: 2026-01-31
-- Purpose: Fix missing tables and columns identified in code audit
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- 1. MASTER KPS TABLE (KPS Registry)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.master_kps (
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

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_master_kps_no_sk ON public.master_kps(no_sk);
CREATE INDEX IF NOT EXISTS idx_master_kps_type ON public.master_kps(kps_type);
CREATE INDEX IF NOT EXISTS idx_master_kps_provinsi ON public.master_kps(provinsi);

-- RLS Policy
ALTER TABLE public.master_kps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for master_kps"
ON public.master_kps FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.master_kps IS 'Master registry of KPS (Kesatuan Pengelolaan Sosial) from national PKPS APIs';

-- ============================================================================
-- 2. MASTER LAHAN TABLE (Geometry Normalization)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.master_lahan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    geom_hash TEXT UNIQUE NOT NULL, -- Hash of geometry for deduplication
    geom_geojson JSONB NOT NULL,    -- GeoJSON geometry
    geom_wkt TEXT,                  -- WKT representation (optional)
    centroid_lat NUMERIC,           -- Latitude of centroid
    centroid_lng NUMERIC,           -- Longitude of centroid
    area_ha NUMERIC,                -- Area in hectares
    perimeter_m NUMERIC,            -- Perimeter in meters

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_master_lahan_geom_hash ON public.master_lahan(geom_hash);
CREATE INDEX IF NOT EXISTS idx_master_lahan_centroid ON public.master_lahan(centroid_lat, centroid_lng);

-- RLS Policy
ALTER TABLE public.master_lahan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for master_lahan"
ON public.master_lahan FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.master_lahan IS 'Normalized geometry storage to avoid duplication of same land parcels';

-- ============================================================================
-- 3. ADD MISSING COLUMNS TO analysis_history
-- ============================================================================
ALTER TABLE public.analysis_history
    ADD COLUMN IF NOT EXISTS lahan_id UUID REFERENCES public.master_lahan(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS kps_id TEXT REFERENCES public.master_kps(id_kps_api) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS analysis_scope TEXT DEFAULT 'KPS' CHECK (analysis_scope IN ('KPS', 'NON_KPS')),
    ADD COLUMN IF NOT EXISTS link_method TEXT DEFAULT 'NONE' CHECK (link_method IN ('NO_SK_METADATA', 'MANUAL', 'NONE', 'AUTO')),
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETE' CHECK (status IN ('COMPLETE', 'INVALIDATED', 'PENDING', 'FAILED')),
    ADD COLUMN IF NOT EXISTS analysis_version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS linked_by_user TEXT,
    ADD COLUMN IF NOT EXISTS linked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS center_lat NUMERIC,
    ADD COLUMN IF NOT EXISTS center_lng NUMERIC,
    ADD COLUMN IF NOT EXISTS trend_type TEXT CHECK (trend_type IN ('INCREASING', 'DECREASING', 'STABLE', NULL)),
    ADD COLUMN IF NOT EXISTS hotspot_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deforestation_ha NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reforestation_ha NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS degradation_ha NUMERIC DEFAULT 0;

-- Indexes for filtering and joins
CREATE INDEX IF NOT EXISTS idx_analysis_history_lahan_id ON public.analysis_history(lahan_id);
CREATE INDEX IF NOT EXISTS idx_analysis_history_kps_id ON public.analysis_history(kps_id);
CREATE INDEX IF NOT EXISTS idx_analysis_history_scope ON public.analysis_history(analysis_scope);
CREATE INDEX IF NOT EXISTS idx_analysis_history_status ON public.analysis_history(status);
CREATE INDEX IF NOT EXISTS idx_analysis_history_version ON public.analysis_history(analysis_version);

COMMENT ON COLUMN public.analysis_history.lahan_id IS 'Foreign reference to master_lahan.id for geometry normalization';
COMMENT ON COLUMN public.analysis_history.kps_id IS 'Foreign reference to master_kps.id_kps_api';
COMMENT ON COLUMN public.analysis_history.analysis_scope IS 'KPS (counted in national recap) or NON_KPS (standalone analysis)';
COMMENT ON COLUMN public.analysis_history.link_method IS 'How the analysis was linked to KPS';
COMMENT ON COLUMN public.analysis_history.status IS 'COMPLETE (active), INVALIDATED (soft deleted), PENDING (processing), FAILED (error)';
COMMENT ON COLUMN public.analysis_history.analysis_version IS 'Version number for same entity (increments on re-analysis)';

-- ============================================================================
-- 4. ANALYSIS YEARLY DATA TABLE (8-Class Land Cover Breakdown)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analysis_yearly_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id UUID NOT NULL REFERENCES public.analysis_history(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,

    -- 8 Land Cover Classes (area in hectares)
    hutan_primer NUMERIC DEFAULT 0,
    hutan_sekunder NUMERIC DEFAULT 0,
    semak_padang_rumput NUMERIC DEFAULT 0,
    air NUMERIC DEFAULT 0,
    gambut NUMERIC DEFAULT 0,
    lahan_pertanian NUMERIC DEFAULT 0,
    tanah_terbuka NUMERIC DEFAULT 0,
    lahan_terbangun NUMERIC DEFAULT 0,

    -- Summary
    total_area NUMERIC DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

    UNIQUE(history_id, year)
);

-- Index for fast yearly queries
CREATE INDEX IF NOT EXISTS idx_yearly_data_history_id ON public.analysis_yearly_data(history_id);
CREATE INDEX IF NOT EXISTS idx_yearly_data_year ON public.analysis_yearly_data(year);

-- RLS Policy
ALTER TABLE public.analysis_yearly_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for yearly_data"
ON public.analysis_yearly_data FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.analysis_yearly_data IS 'Yearly breakdown of 8 land cover classes per analysis';

-- ============================================================================
-- 5. ANALYSIS SLOPE SUMMARY TABLE (Slope Classification)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analysis_slope_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id UUID NOT NULL REFERENCES public.analysis_history(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('INSIDE', 'OUTSIDE_2KM')),

    -- Average slope
    avg_slope NUMERIC,

    -- Slope classes (area in hectares)
    slope_0_8 NUMERIC DEFAULT 0,      -- Flat: 0-8%
    slope_8_15 NUMERIC DEFAULT 0,     -- Gentle: 8-15%
    slope_15_25 NUMERIC DEFAULT 0,    -- Moderate: 15-25%
    slope_25_40 NUMERIC DEFAULT 0,    -- Steep: 25-40%
    slope_above_40 NUMERIC DEFAULT 0, -- Very Steep: >40%

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

    UNIQUE(history_id, scope)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_slope_summary_history_id ON public.analysis_slope_summary(history_id);

-- RLS Policy
ALTER TABLE public.analysis_slope_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for slope_summary"
ON public.analysis_slope_summary FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.analysis_slope_summary IS 'Slope analysis results for INSIDE geometry and OUTSIDE 2km buffer';

-- ============================================================================
-- 6. ANALYSIS HOTSPOTS TABLE (Fire/Burn Detections)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analysis_hotspots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id UUID NOT NULL REFERENCES public.analysis_history(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,

    -- Location
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,

    -- Detection details
    acq_date DATE NOT NULL,
    confidence INTEGER, -- Confidence level (0-100)
    brightness NUMERIC, -- Temperature in Kelvin

    -- Source tracking
    source TEXT NOT NULL CHECK (source IN ('NASA_FIRMS', 'ARCGIS', 'BMKG')),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_hotspots_history_id ON public.analysis_hotspots(history_id);
CREATE INDEX IF NOT EXISTS idx_hotspots_year ON public.analysis_hotspots(year);
CREATE INDEX IF NOT EXISTS idx_hotspots_date ON public.analysis_hotspots(acq_date);
CREATE INDEX IF NOT EXISTS idx_hotspots_location ON public.analysis_hotspots(latitude, longitude);

-- RLS Policy
ALTER TABLE public.analysis_hotspots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for hotspots"
ON public.analysis_hotspots FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.analysis_hotspots IS 'Fire/burn hotspot detections from NASA FIRMS, ArcGIS, and BMKG';

-- ============================================================================
-- 7. ANALYSIS EROSION RISK TABLE (For Future Erosion Analysis)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analysis_erosion_risk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id UUID NOT NULL REFERENCES public.analysis_history(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('INSIDE', 'OUTSIDE_2KM')),

    -- Risk classes (area in hectares)
    risk_low_ha NUMERIC DEFAULT 0,
    risk_medium_ha NUMERIC DEFAULT 0,
    risk_high_ha NUMERIC DEFAULT 0,
    risk_very_high_ha NUMERIC DEFAULT 0,

    -- Contributing factors
    avg_rainfall_30d NUMERIC, -- mm in last 30 days
    avg_slope NUMERIC,        -- Average slope percentage

    -- Summary
    dominant_risk_class TEXT CHECK (dominant_risk_class IN ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH')),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

    UNIQUE(history_id, scope)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_erosion_risk_history_id ON public.analysis_erosion_risk(history_id);

-- RLS Policy
ALTER TABLE public.analysis_erosion_risk ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for erosion_risk"
ON public.analysis_erosion_risk FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.analysis_erosion_risk IS 'Erosion risk analysis combining slope, rainfall, and land cover';

-- ============================================================================
-- END OF MIGRATION V3
-- ============================================================================
