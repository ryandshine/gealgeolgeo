-- ============================================================================
-- MIGRATION: WIDE VIEW & RESTORE LONG VIEW
-- Purpose: 
-- 1. Restore 'v_kps_yearly_analysis' (Long Format) if missing
-- 2. Create 'v_rekap_paduserasi_wide' (Dynamic JSONB Format)
-- ============================================================================

-- STEP 1: RESTORE LONG VIEW (v_kps_yearly_analysis)
-- Corrected column names based on master_kps schema inspection

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
    k.jenis_kps as skema,  -- Mapped from k.jenis_kps
    k.kps_type,
    k.nama_prov as provinsi, -- Mapped from k.nama_prov
    k.nama_kab as kab_kota,  -- Mapped from k.nama_kab
    k.kecamatan,
    k.desa,
    -- Removed missing columns: hutan_desa
    k.tgl_sk,
    -- Removed missing columns: umur_sk
    k.luas_sk_ha,
    -- Removed missing columns: luas_indikatif, luas_definitif, luas_areal_kerja
    -- Removed missing columns: latitude, longitude (not in master_kps inspection)

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
ORDER BY k.nama_prov, k.nama_kab, k.nama_kps, y.year;

COMMENT ON VIEW public.v_kps_yearly_analysis IS 'LONG: Enriched yearly analysis view';


-- STEP 2: CREATE DYNAMIC WIDE VIEW (v_rekap_paduserasi_wide)
-- Uses JSONB to automatically handle ANY year (present or future) without schema changes

CREATE OR REPLACE VIEW public.v_rekap_paduserasi_wide AS
SELECT
    -- Grouping Keys (One row per History ID)
    h.id as history_id,
    k.id_kps_api,
    k.nama_kps,
    k.nama_prov as provinsi,  -- Fixed column
    k.nama_kab as kab_kota,   -- Fixed column
    k.kecamatan,
    k.desa,
    k.luas_sk_ha,
    
    -- Metadata
    h.status as status_analisis,
    MAX(h.created_at) as tgl_analisis,

    -- DYNAMIC YEARLY AGGREGATION (JSONB)
    jsonb_object_agg(
        y.year::text,
        jsonb_build_object(
            'hutan', (COALESCE(y.hutan_primer, 0) + COALESCE(y.hutan_sekunder, 0)),
            'hutan_primer', COALESCE(y.hutan_primer, 0),
            'hutan_sekunder', COALESCE(y.hutan_sekunder, 0),
            'tanah_kosong', COALESCE(y.tanah_kosong, 0),
            'lahan_terbangun', COALESCE(y.lahan_terbangun, 0),
            'air', COALESCE(y.air, 0),
            'tanah_kering', COALESCE(y.tanah_kering, 0),
            'hotspot_count', COALESCE(hs.hotspot_count, 0),
            'risk_level', (
                CASE 
                    WHEN COALESCE(hs.hotspot_count, 0) >= 10 THEN 'TINGGI'
                    WHEN COALESCE(hs.hotspot_count, 0) >= 5 THEN 'SEDANG'
                    WHEN COALESCE(hs.hotspot_count, 0) >= 1 THEN 'RENDAH'
                    ELSE 'AMAN'
                END
            )
        ) ORDER BY y.year
    ) as yearly_metrics,

    -- Totals / Changes (from History)
    MAX(h.deforestation_ha) as total_deforestasi,
    MAX(h.reforestation_ha) as total_reforestasi

FROM public.analysis_history h
JOIN public.master_kps k ON k.id_kps_api = h.kps_id
JOIN public.analysis_yearly_data y ON y.history_id = h.id
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) as hotspot_count
    FROM public.analysis_hotspots hs
    WHERE hs.history_id = y.history_id AND hs.year = y.year
) hs ON true

GROUP BY h.id, k.id_kps_api, k.nama_kps, k.nama_prov, k.nama_kab, k.kecamatan, k.desa, k.luas_sk_ha
ORDER BY k.nama_prov, k.nama_kps;

COMMENT ON VIEW public.v_rekap_paduserasi_wide IS 'WIDE: Dynamic JSONB rekap data (auto-updates for new years)';

-- Verification
SELECT 'v_rekap_paduserasi_wide' as view_name, COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'v_rekap_paduserasi_wide';
