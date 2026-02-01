-- ============================================================================
-- MIGRATION: KPS Analysis View (Single Enriched View)
-- Date: 2026-01-31
-- Purpose: Create single view enriching analysis_yearly_data with KPS + Hotspot
-- ============================================================================

-- ============================================================================
-- STEP 1: UPDATE analysis_hotspots TABLE (Add confidence_level if not exists)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analysis_hotspots' AND column_name = 'confidence_level'
    ) THEN
        ALTER TABLE public.analysis_hotspots
        ADD COLUMN confidence_level TEXT CHECK (confidence_level IN ('low', 'nominal', 'high'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analysis_hotspots' AND column_name = 'frp'
    ) THEN
        ALTER TABLE public.analysis_hotspots ADD COLUMN frp NUMERIC;
    END IF;
END $$;

-- ============================================================================
-- STEP 2: CREATE SINGLE ENRICHED VIEW
-- Model: analysis_yearly_data + master_kps + hotspot aggregation
-- ============================================================================

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

    -- Land Cover Data (from analysis_yearly_data)
    COALESCE(y.hutan_primer, 0) as hutan_primer,
    COALESCE(y.hutan_sekunder, 0) as hutan_sekunder,
    COALESCE(y.hutan_primer, 0) + COALESCE(y.hutan_sekunder, 0) as total_hutan,
    COALESCE(y.semak_padang_rumput, 0) as semak_padang_rumput,
    COALESCE(y.lahan_pertanian, 0) as lahan_pertanian,
    COALESCE(y.tanah_terbuka, 0) as tanah_terbuka,
    COALESCE(y.lahan_terbangun, 0) as lahan_terbangun,
    COALESCE(y.air, 0) as air,
    COALESCE(y.gambut, 0) as gambut,
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
    COALESCE(sl.slope_0_8, 0) as slope_datar,           -- Datar: <8%
    COALESCE(sl.slope_8_15, 0) as slope_landai,         -- Landai: 8-15%
    COALESCE(sl.slope_15_25, 0) as slope_agak_curam,    -- Agak Curam: 15-25%
    COALESCE(sl.slope_25_40, 0) as slope_curam,         -- Curam: 25-40%
    COALESCE(sl.slope_above_40, 0) as slope_sangat_curam, -- Sangat Curam: >40%

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
        THEN ROUND((COALESCE(y.tanah_terbuka, 0) / y.total_area * 100)::numeric, 2)
        ELSE 0
    END as persen_terbuka,

    -- Risk Level (combined hotspot + slope for erosion risk)
    CASE
        WHEN COALESCE(hs.hotspot_count, 0) >= 10 THEN 'TINGGI'
        WHEN COALESCE(hs.hotspot_count, 0) >= 5 THEN 'SEDANG'
        WHEN COALESCE(hs.hotspot_count, 0) >= 1 THEN 'RENDAH'
        ELSE 'AMAN'
    END as risk_level,

    -- Erosion Risk Level (based on slope + bare land)
    CASE
        WHEN sl.avg_slope IS NULL THEN NULL
        WHEN sl.avg_slope >= 25 AND COALESCE(y.tanah_terbuka, 0) > 10 THEN 'TINGGI'
        WHEN sl.avg_slope >= 15 AND COALESCE(y.tanah_terbuka, 0) > 5 THEN 'SEDANG'
        WHEN sl.avg_slope >= 8 OR COALESCE(y.tanah_terbuka, 0) > 2 THEN 'RENDAH'
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

COMMENT ON VIEW public.v_kps_yearly_analysis IS
'Enriched yearly analysis view: analysis_yearly_data + master_kps + hotspot + slope data per year';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'v_kps_yearly_analysis' as view_name, COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'v_kps_yearly_analysis';

-- ============================================================================
-- SAMPLE QUERIES
-- ============================================================================

-- 1. Get all data for specific KPS
-- SELECT * FROM v_kps_yearly_analysis WHERE nama_kps ILIKE '%contoh%' ORDER BY tahun;

-- 2. Get high risk KPS per year
-- SELECT provinsi, nama_kps, tahun, hotspot_count, risk_level
-- FROM v_kps_yearly_analysis WHERE risk_level = 'TINGGI';

-- 3. Summary per province per year
-- SELECT provinsi, tahun, COUNT(*) as total_kps, SUM(hotspot_count) as total_hotspot
-- FROM v_kps_yearly_analysis GROUP BY provinsi, tahun ORDER BY provinsi, tahun;

-- 4. Get KPS with steep slopes (high erosion risk)
-- SELECT provinsi, nama_kps, avg_slope, kelas_lereng, erosion_risk
-- FROM v_kps_yearly_analysis
-- WHERE kelas_lereng IN ('CURAM', 'SANGAT_CURAM')
-- ORDER BY avg_slope DESC;

-- 5. Slope distribution summary per province
-- SELECT provinsi,
--        COUNT(*) as total_kps,
--        ROUND(AVG(avg_slope)::numeric, 2) as rata_rata_slope,
--        SUM(slope_datar) as total_datar_ha,
--        SUM(slope_landai) as total_landai_ha,
--        SUM(slope_agak_curam) as total_agak_curam_ha,
--        SUM(slope_curam) as total_curam_ha,
--        SUM(slope_sangat_curam) as total_sangat_curam_ha
-- FROM v_kps_yearly_analysis
-- WHERE avg_slope IS NOT NULL
-- GROUP BY provinsi ORDER BY provinsi;

-- 6. High erosion risk areas (steep slope + bare land)
-- SELECT provinsi, nama_kps, tahun, avg_slope, tanah_terbuka, erosion_risk
-- FROM v_kps_yearly_analysis
-- WHERE erosion_risk = 'TINGGI'
-- ORDER BY avg_slope DESC, tanah_terbuka DESC;

-- ============================================================================
-- STEP 3: CREATE SLOPE COMPARISON VIEW (INSIDE vs OUTSIDE 2KM)
-- ============================================================================

CREATE OR REPLACE VIEW public.v_kps_slope_comparison AS
SELECT
    h.id as history_id,
    h.filename,
    k.id_kps_api,
    k.nama_kps,
    k.provinsi,
    k.kab_kota,

    -- INSIDE Slope Data
    si.avg_slope as avg_slope_inside,
    COALESCE(si.slope_0_8, 0) as datar_inside,
    COALESCE(si.slope_8_15, 0) as landai_inside,
    COALESCE(si.slope_15_25, 0) as agak_curam_inside,
    COALESCE(si.slope_25_40, 0) as curam_inside,
    COALESCE(si.slope_above_40, 0) as sangat_curam_inside,

    -- OUTSIDE 2KM Slope Data
    so.avg_slope as avg_slope_outside,
    COALESCE(so.slope_0_8, 0) as datar_outside,
    COALESCE(so.slope_8_15, 0) as landai_outside,
    COALESCE(so.slope_15_25, 0) as agak_curam_outside,
    COALESCE(so.slope_25_40, 0) as curam_outside,
    COALESCE(so.slope_above_40, 0) as sangat_curam_outside,

    -- Slope Classification
    CASE
        WHEN si.avg_slope IS NULL THEN NULL
        WHEN si.avg_slope < 8 THEN 'DATAR'
        WHEN si.avg_slope < 15 THEN 'LANDAI'
        WHEN si.avg_slope < 25 THEN 'AGAK_CURAM'
        WHEN si.avg_slope < 40 THEN 'CURAM'
        ELSE 'SANGAT_CURAM'
    END as kelas_lereng_inside,

    CASE
        WHEN so.avg_slope IS NULL THEN NULL
        WHEN so.avg_slope < 8 THEN 'DATAR'
        WHEN so.avg_slope < 15 THEN 'LANDAI'
        WHEN so.avg_slope < 25 THEN 'AGAK_CURAM'
        WHEN so.avg_slope < 40 THEN 'CURAM'
        ELSE 'SANGAT_CURAM'
    END as kelas_lereng_outside,

    -- Comparison: Is inside steeper than outside?
    CASE
        WHEN si.avg_slope IS NULL OR so.avg_slope IS NULL THEN NULL
        WHEN si.avg_slope > so.avg_slope THEN 'INSIDE_LEBIH_CURAM'
        WHEN si.avg_slope < so.avg_slope THEN 'OUTSIDE_LEBIH_CURAM'
        ELSE 'SAMA'
    END as perbandingan_kemiringan,

    h.created_at as analysis_date

FROM public.analysis_history h
LEFT JOIN public.master_kps k ON k.id_kps_api = h.kps_id
LEFT JOIN public.analysis_slope_summary si ON si.history_id = h.id AND si.scope = 'INSIDE'
LEFT JOIN public.analysis_slope_summary so ON so.history_id = h.id AND so.scope = 'OUTSIDE_2KM'
WHERE si.avg_slope IS NOT NULL OR so.avg_slope IS NOT NULL
ORDER BY k.provinsi, k.kab_kota, k.nama_kps;

COMMENT ON VIEW public.v_kps_slope_comparison IS
'Slope comparison view: INSIDE vs OUTSIDE 2KM buffer for each analysis';

-- ============================================================================
-- END
-- ============================================================================
