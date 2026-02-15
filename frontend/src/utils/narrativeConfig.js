/**
 * Smart Narrative Engine - Configuration
 * Threshold definitions, rule matrix, and bilingual phrase blocks
 */

// --- TREND THRESHOLDS ---
export const TREND_THRESHOLDS = {
    forestChangeMin: 0.5,       // Ha - minimum to classify as deforestation/recovery
    degradationDryMin: 1.0,     // Ha - minimum dry land increase for degradation
    magnitude: {
        minor: { maxHa: 5, maxPct: 5 },
        moderate: { maxHa: 50, maxPct: 15 },
        // significant: anything above moderate
    }
};

// --- HOTSPOT THRESHOLDS ---
export const HOTSPOT_THRESHOLDS = {
    concentration: {
        low: 0.01,      // hotspots/ha boundary (below = low)
        high: 0.05,     // above = high, between = medium
    },
    spikeFactor: 2,         // year-over-year multiplier for spike detection
    clusteringPct: 50,      // % in single year to count as clustered
    significantMinCount: 3, // minimum hotspots for meaningful analysis
};

// --- TERRAIN / SLOPE THRESHOLDS ---
export const TERRAIN_THRESHOLDS = {
    slopeCategories: [
        { key: 'datar_0_8', label: 'Datar', min: 0, max: 8 },
        { key: 'landai_8_15', label: 'Landai', min: 8, max: 15 },
        { key: 'agak_curam_15_25', label: 'Agak Curam', min: 15, max: 25 },
        { key: 'curam_25_45', label: 'Curam', min: 25, max: 45 },
        { key: 'sangat_curam_45_plus', label: 'Sangat Curam', min: 45, max: Infinity },
    ],
    dominantThreshold: 40,  // % - a single category must exceed this to be "dominant"
    vulnerability: {
        low: 10,        // below 10% steep+verySteep
        high: 30,       // above 30% steep+verySteep
        // medium: between
    },
    erosionRisk: {
        tinggi: { minSlope: 25, minBarePct: 10 },
        sedang: { minSlope: 15, minBarePct: 5 },
        rendah: { minSlope: 8, minBarePct: 2 },
        // aman: below rendah
    }
};

// --- BILINGUAL PHRASE BLOCKS ---
export const PHRASES = {
    id: {
        // Executive summary
        exec_period: (start, end) => `Berdasarkan analisis spasial periode ${start}-${end}`,
        exec_trend_deforestation: (ha, pct) => `terjadi penurunan tutupan hutan yang ${Math.abs(pct) > 15 ? 'sangat signifikan' : 'cukup signifikan'} sebesar ${Math.abs(ha).toFixed(1)} Ha (${Math.abs(pct).toFixed(1)}%)`,
        exec_trend_recovery: (ha, pct) => `teridentifikasi peningkatan tutupan hutan sebesar ${ha.toFixed(1)} Ha (${pct.toFixed(1)}%)`,
        exec_trend_degradation: (ha) => `terdeteksi degradasi lahan kering dengan peningkatan ${ha.toFixed(1)} Ha`,
        exec_trend_stable: () => `kondisi tutupan hutan relatif stabil tanpa perubahan signifikan`,
        exec_hotspot: (count, level) => {
            if (count === 0) return 'tidak terdeteksi titik panas selama periode pengamatan';
            const levelMap = { low: 'rendah', medium: 'sedang', high: 'tinggi' };
            return `terdeteksi ${count} titik panas dengan densitas ${levelMap[level] || level}`;
        },
        exec_terrain: (avgSlope, erosionRisk) => `karakteristik kelerengan rata-rata ${avgSlope.toFixed(1)}% dengan tingkat risiko erosi ${erosionRisk}`,
        exec_disclaimer: () => 'Laporan ini disiapkan secara otomatis sebagai pendukung kebijakan pengelolaan perhutanan sosial.',

        // Trend narrative
        trend_deforestation: (ha, pct, rate, period, startYear, endYear, detail) => 
            `Dalam kurun waktu ${period} tahun (${startYear}-${endYear}), wilayah ini mengalami kehilangan tutupan hutan sebesar ${Math.abs(ha).toFixed(1)} Ha, yang merepresentasikan penyusutan sebesar ${Math.abs(pct).toFixed(1)}% dari kondisi awal. ` +
            `Laju deforestasi tercatat rata-rata ${Math.abs(rate).toFixed(1)} Ha per tahun. ${detail || ''}`,
        trend_recovery: (ha, pct, rate, period, startYear, endYear, detail) => 
            `Analisis menunjukkan tren positif berupa pemulihan tutupan hutan seluas ${ha.toFixed(1)} Ha (${pct.toFixed(1)}%) selama periode ${startYear}-${endYear}. ` +
            `Wilayah ini menunjukkan kemampuan regenerasi atau keberhasilan rehabilitasi dengan laju penambahan vegetasi rata-rata ${rate.toFixed(1)} Ha per tahun. ${detail || ''}`,
        trend_degradation: (ha, detail) => 
            `Meskipun tutupan hutan inti mungkin terlihat stabil, terdeteksi indikasi degradasi lahan berupa peningkatan area semak belukar atau tanah kering sebesar ${ha.toFixed(1)} Ha. ` +
            `Hal ini seringkali menjadi indikator awal adanya gangguan manusia atau fragmentasi hutan. ${detail || ''}`,
        trend_stable: (detail) => `Secara keseluruhan, kondisi tutupan lahan di wilayah ini dikategorikan sangat stabil. Tidak ditemukan perubahan drastis pada fungsi utama hutan selama periode pengamatan. ${detail || ''}`,
        trend_detail_forest: (hutan_primer, hutan_sekunder) => 
            `Secara spesifik, komposisi perubahan terdiri dari ${Math.abs(hutan_primer).toFixed(1)} Ha hutan primer dan ${Math.abs(hutan_sekunder).toFixed(1)} Ha hutan sekunder.`,
        trend_conversion: (cls, ha) => {
            const names = {
                hutan_primer: 'Hutan Primer', hutan_sekunder: 'Hutan Sekunder',
                tanah_kering: 'Tanah Kering/Semak', tanah_kosong: 'Tanah Kosong',
                air: 'Badan Air', lahan_terbangun: 'Lahan Terbangun'
            };
            return `Konversi lahan paling dominan dialihkan menjadi ${names[cls] || cls} dengan akumulasi luasan mencapai ${ha.toFixed(1)} Ha.`;
        },
        trend_magnitude: (mag) => {
            const m = { 
                minor: 'skala kecil (minor) yang kemungkinan merupakan dinamika alami atau pembukaan lahan terbatas', 
                moderate: 'skala moderat yang memerlukan perhatian dari pengelola kawasan', 
                significant: 'skala signifikan yang mengindikasikan adanya aktivitas pembukaan lahan secara masif atau sistematis' 
            };
            return `Intensitas perubahan ini masuk dalam kategori ${m[mag] || mag}.`;
        },

        // Year-over-year trend narrative
        yoy_header: () => `\n\nRincian perubahan per periode tahun:`,
        yoy_forest_loss: (fromYear, toYear, ha) =>
            `Periode ${fromYear}-${toYear}: terjadi penurunan tutupan hutan sebesar ${Math.abs(ha).toFixed(2)} Ha`,
        yoy_forest_gain: (fromYear, toYear, ha) =>
            `Periode ${fromYear}-${toYear}: terjadi peningkatan tutupan hutan sebesar ${ha.toFixed(2)} Ha`,
        yoy_forest_stable: (fromYear, toYear) =>
            `Periode ${fromYear}-${toYear}: kondisi tutupan hutan relatif stabil`,
        yoy_detail_class: (className, diff) => {
            const names = {
                hutan_primer: 'Hutan Primer', hutan_sekunder: 'Hutan Sekunder',
                tanah_kering: 'Tanah Kering/Semak', tanah_kosong: 'Tanah Kosong',
                air: 'Badan Air', lahan_terbangun: 'Lahan Terbangun'
            };
            const name = names[className] || className;
            if (diff > 0.01) return `${name} +${diff.toFixed(2)} Ha`;
            if (diff < -0.01) return `${name} ${diff.toFixed(2)} Ha`;
            return null;
        },
        yoy_class_changes: (changes) => changes.length > 0 ? ` (${changes.join('; ')})` : '',
        yoy_worst_period: (fromYear, toYear, ha) =>
            `Penurunan paling signifikan terjadi pada periode ${fromYear}-${toYear} dengan kehilangan ${Math.abs(ha).toFixed(2)} Ha tutupan hutan.`,
        yoy_best_period: (fromYear, toYear, ha) =>
            `Pemulihan terbaik terjadi pada periode ${fromYear}-${toYear} dengan penambahan ${ha.toFixed(2)} Ha tutupan hutan.`,

        // Hotspot narrative
        hotspot_none: () => 'Tidak terdeteksi titik panas (hotspot) pada wilayah analisis selama periode pengamatan.',
        hotspot_level: (count, level) => {
            const levelMap = { low: 'rendah', medium: 'sedang', high: 'tinggi' };
            return `Total ${count} titik panas terdeteksi dengan tingkat konsentrasi ${levelMap[level] || level}.`;
        },
        hotspot_spike: (year, count) => `Terjadi lonjakan signifikan pada tahun ${year} dengan ${count} titik panas.`,
        hotspot_clustering: (year, pct) => `Terdapat konsentrasi temporal dimana ${pct.toFixed(0)}% titik panas terjadi pada tahun ${year}.`,
        hotspot_source: () => 'Sumber data: NASA FIRMS (VIIRS & MODIS Sensors).',

        // Terrain narrative
        terrain_dominant: (type) => {
            const types = {
                datar: 'datar (0-8%)', landai: 'landai (8-15%)',
                agak_curam: 'agak curam (15-25%)', curam: 'curam (25-45%)',
                sangat_curam: 'sangat curam (>45%)', mixed: 'campuran (beragam)'
            };
            return `Karakteristik topografi wilayah didominasi oleh lereng ${types[type] || type}.`;
        },
        terrain_avg_slope: (avg) => `Kemiringan lereng rata-rata sebesar ${avg.toFixed(1)}%.`,
        terrain_vulnerability: (v) => {
            const vMap = { low: 'rendah', medium: 'sedang', high: 'tinggi' };
            return `Tingkat kerentanan lereng dikategorikan ${vMap[v] || v}.`;
        },
        terrain_erosion: (risk) => `Risiko erosi dinilai pada level ${risk}.`,

        // Connectors
        period: '. ',
        comma: ', ',
        and: ' dan ',
    },

    en: {
        // Executive summary
        exec_period: (start, end) => `Based on spatial analysis for the period ${start}-${end}`,
        exec_trend_deforestation: (ha, pct) => `a ${Math.abs(pct) > 15 ? 'highly significant' : 'significant'} decline in forest cover of ${Math.abs(ha).toFixed(1)} Ha (${Math.abs(pct).toFixed(1)}%) was observed`,
        exec_trend_recovery: (ha, pct) => `an increase in forest cover of ${ha.toFixed(1)} Ha (${pct.toFixed(1)}%) was identified`,
        exec_trend_degradation: (ha) => `dry land degradation was detected with an increase of ${ha.toFixed(1)} Ha`,
        exec_trend_stable: () => `forest cover conditions remained relatively stable with no significant changes`,
        exec_hotspot: (count, level) => {
            if (count === 0) return 'no hotspots were detected during the observation period';
            return `${count} hotspots were detected with ${level} density`;
        },
        exec_terrain: (avgSlope, erosionRisk) => `average slope characteristics at ${avgSlope.toFixed(1)}% with erosion risk level ${erosionRisk}`,
        exec_disclaimer: () => 'This report was generated automatically to support social forestry management policies.',

        // Trend narrative
        trend_deforestation: (ha, pct, rate, period) => `During the analysis period, forest cover decreased by ${Math.abs(ha).toFixed(1)} Ha (${Math.abs(pct).toFixed(1)}%) at a deforestation rate of ${Math.abs(rate).toFixed(1)} Ha/year (average ${(Math.abs(ha) / period).toFixed(1)} Ha per year over ${period} years).`,
        trend_recovery: (ha, pct, rate, period) => `During the analysis period, forest cover recovered by ${ha.toFixed(1)} Ha (${pct.toFixed(1)}%) at a recovery rate of ${rate.toFixed(1)} Ha/year (average ${(ha / period).toFixed(1)} Ha per year over ${period} years).`,
        trend_degradation: (ha) => `Land degradation was detected with an increase in dry land/shrub area of ${ha.toFixed(1)} Ha.`,
        trend_stable: () => `Land cover showed relatively stable conditions with no significant changes.`,
        trend_conversion: (cls) => {
            const names = {
                hutan_primer: 'Primary Forest', hutan_sekunder: 'Secondary Forest',
                tanah_kering: 'Dry Land/Shrub', tanah_kosong: 'Bare Land',
                air: 'Water Body', lahan_terbangun: 'Built-up Area'
            };
            return `Dominant conversion occurred to the ${names[cls] || cls} class.`;
        },
        trend_magnitude: (mag) => `The scale of change is categorized as ${mag}.`,

        // Year-over-year trend narrative
        yoy_header: () => `\n\nYear-over-year breakdown:`,
        yoy_forest_loss: (fromYear, toYear, ha) =>
            `Period ${fromYear}-${toYear}: forest cover decreased by ${Math.abs(ha).toFixed(2)} Ha`,
        yoy_forest_gain: (fromYear, toYear, ha) =>
            `Period ${fromYear}-${toYear}: forest cover increased by ${ha.toFixed(2)} Ha`,
        yoy_forest_stable: (fromYear, toYear) =>
            `Period ${fromYear}-${toYear}: forest cover remained stable`,
        yoy_detail_class: (className, diff) => {
            const names = {
                hutan_primer: 'Primary Forest', hutan_sekunder: 'Secondary Forest',
                tanah_kering: 'Dry Land/Shrub', tanah_kosong: 'Bare Land',
                air: 'Water Body', lahan_terbangun: 'Built-up Area'
            };
            const name = names[className] || className;
            if (diff > 0.01) return `${name} +${diff.toFixed(2)} Ha`;
            if (diff < -0.01) return `${name} ${diff.toFixed(2)} Ha`;
            return null;
        },
        yoy_class_changes: (changes) => changes.length > 0 ? ` (${changes.join('; ')})` : '',
        yoy_worst_period: (fromYear, toYear, ha) =>
            `The most significant decline occurred in ${fromYear}-${toYear} with a loss of ${Math.abs(ha).toFixed(2)} Ha of forest cover.`,
        yoy_best_period: (fromYear, toYear, ha) =>
            `The best recovery occurred in ${fromYear}-${toYear} with an increase of ${ha.toFixed(2)} Ha of forest cover.`,

        // Hotspot narrative
        hotspot_none: () => 'No hotspots were detected in the analysis area during the observation period.',
        hotspot_level: (count, level) => `A total of ${count} hotspots were detected with ${level} concentration level.`,
        hotspot_spike: (year, count) => `A significant spike occurred in ${year} with ${count} hotspots.`,
        hotspot_clustering: (year, pct) => `Temporal concentration was observed with ${pct.toFixed(0)}% of hotspots occurring in ${year}.`,
        hotspot_source: () => 'Data source: NASA FIRMS (VIIRS & MODIS Sensors).',

        // Terrain narrative
        terrain_dominant: (type) => {
            const types = {
                datar: 'flat (0-8%)', landai: 'gentle (8-15%)',
                agak_curam: 'moderately steep (15-25%)', curam: 'steep (25-45%)',
                sangat_curam: 'very steep (>45%)', mixed: 'mixed (varied)'
            };
            return `The topographic character of the area is dominated by ${types[type] || type} slopes.`;
        },
        terrain_avg_slope: (avg) => `Average slope gradient is ${avg.toFixed(1)}%.`,
        terrain_vulnerability: (v) => `Slope vulnerability is categorized as ${v}.`,
        terrain_erosion: (risk) => `Erosion risk is assessed at ${risk} level.`,

        // Connectors
        period: '. ',
        comma: ', ',
        and: ' and ',
    }
};
