-- ============================================================================
-- MIGRATION: NASA FIRMS Hotspot Cache Table
-- Date: 2026-01-31
-- Purpose: Store NASA FIRMS hotspot data in database for faster access
-- ============================================================================

-- Create hotspot cache table (independent from analysis_history)
CREATE TABLE IF NOT EXISTS public.nasa_firms_hotspot_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Location
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,

    -- Time info
    acq_date DATE NOT NULL,
    acq_time TEXT,  -- HHMM format
    year INTEGER NOT NULL,

    -- NASA FIRMS properties
    satellite TEXT,  -- N=Suomi NPP, J1=NOAA-20
    source TEXT NOT NULL DEFAULT 'VIIRS_SNPP_NRT',  -- VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, MODIS_NRT
    confidence TEXT,  -- low, nominal, high
    brightness NUMERIC,  -- bright_ti4 (Kelvin)
    bright_ti5 NUMERIC,
    frp NUMERIC,  -- Fire Radiative Power (MW)
    scan NUMERIC,
    track NUMERIC,
    daynight TEXT,  -- D=day, N=night
    version TEXT,

    -- Cache metadata
    bbox_key TEXT NOT NULL,  -- Hash of bounding box for cache lookup
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

    -- Unique constraint to prevent duplicates
    UNIQUE(latitude, longitude, acq_date, acq_time, source)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_hotspot_cache_year ON public.nasa_firms_hotspot_cache(year);
CREATE INDEX IF NOT EXISTS idx_hotspot_cache_date ON public.nasa_firms_hotspot_cache(acq_date);
CREATE INDEX IF NOT EXISTS idx_hotspot_cache_bbox ON public.nasa_firms_hotspot_cache(bbox_key);
CREATE INDEX IF NOT EXISTS idx_hotspot_cache_location ON public.nasa_firms_hotspot_cache(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_hotspot_cache_confidence ON public.nasa_firms_hotspot_cache(confidence);
CREATE INDEX IF NOT EXISTS idx_hotspot_cache_fetched ON public.nasa_firms_hotspot_cache(fetched_at);

-- Spatial index using PostGIS (optional, for geospatial queries)
-- CREATE INDEX IF NOT EXISTS idx_hotspot_cache_geom ON public.nasa_firms_hotspot_cache
--     USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- RLS Policy
ALTER TABLE public.nasa_firms_hotspot_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for hotspot_cache" ON public.nasa_firms_hotspot_cache
    FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.nasa_firms_hotspot_cache IS 'Cache for NASA FIRMS hotspot data to reduce API calls';

-- ============================================================================
-- Function to clean old cache entries (optional scheduled cleanup)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_hotspot_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete entries older than 30 days (for non-historical queries)
    DELETE FROM public.nasa_firms_hotspot_cache
    WHERE fetched_at < NOW() - INTERVAL '30 days'
    AND year = EXTRACT(YEAR FROM NOW());

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- View for hotspot statistics by year
-- ============================================================================
CREATE OR REPLACE VIEW public.hotspot_yearly_stats AS
SELECT
    year,
    COUNT(*) as total_hotspots,
    COUNT(CASE WHEN confidence = 'high' THEN 1 END) as high_confidence,
    COUNT(CASE WHEN confidence = 'nominal' THEN 1 END) as nominal_confidence,
    COUNT(CASE WHEN confidence = 'low' THEN 1 END) as low_confidence,
    AVG(brightness) as avg_brightness,
    AVG(frp) as avg_frp,
    MIN(acq_date) as first_detection,
    MAX(acq_date) as last_detection
FROM public.nasa_firms_hotspot_cache
GROUP BY year
ORDER BY year DESC;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name = 'nasa_firms_hotspot_cache';
