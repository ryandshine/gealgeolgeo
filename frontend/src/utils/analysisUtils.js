
/**
 * Utility for land cover trend analysis
 */

/**
 * Calculates differences between first and last data points
 * @param {Array} analysisResults - Array of analysis objects per year
 * @returns {Object} Trends per class and period info
 */
export const calculateTrends = (analysisResults) => {
    if (!analysisResults) return null;

    // Normalize to array if single object, or return null if empty/invalid
    const resultsArray = Array.isArray(analysisResults)
        ? analysisResults
        : (typeof analysisResults === 'object' ? [analysisResults] : []);

    if (resultsArray.length < 2) return null;

    // Sort by year to ensure correct comparison (first year vs latest year)
    const sorted = [...resultsArray].sort((a, b) =>
        (Number(a.year) || 0) - (Number(b.year) || 0)
    );

    const firstData = sorted[0];
    const latestData = sorted[sorted.length - 1];
    const period = latestData.year - firstData.year;

    const calcPct = (curr, old) => old > 0 ? (((curr - old) / old) * 100).toFixed(1) : 0;

    const classes = ['hutan_primer', 'hutan_sekunder', 'tanah_kering', 'tanah_kosong', 'air', 'lahan_terbangun'];
    const trends = {};

    classes.forEach(cls => {
        const diff = (latestData[cls] || 0) - (firstData[cls] || 0);
        trends[cls] = {
            diff,
            pct: calcPct(latestData[cls], firstData[cls]),
            start: firstData[cls] || 0,
            end: latestData[cls] || 0
        };
    });

    // Add aggregate 'hutan' trend for overall status logic
    const firstHutan = (firstData.hutan_primer || 0) + (firstData.hutan_sekunder || 0);
    const latestHutan = (latestData.hutan_primer || 0) + (latestData.hutan_sekunder || 0);
    trends.hutan = {
        diff: latestHutan - firstHutan,
        pct: calcPct(latestHutan, firstHutan),
        start: firstHutan,
        end: latestHutan
    };

    // Main Trend Logic
    // Color schema: background + matching shadow color for consistency
    let trendInfo = { type: 'neutral', label: 'Stabil', color: 'bg-slate-100 text-slate-500 shadow-sm shadow-slate-200', hex: '#64748b' };
    const hutanDiff = trends.hutan.diff;

    if (hutanDiff < -0.5) {
        trendInfo = { type: 'bad', label: 'Kejadian Deforestasi', color: 'bg-red-500 text-white shadow-sm shadow-red-200', hex: '#ef4444' };
        if (hutanDiff < -50) trendInfo.label = 'Deforestasi Masif';
    } else if (hutanDiff > 0.5) {
        trendInfo = { type: 'good', label: 'Pemulihan Tutupan', color: 'bg-emerald-500 text-white shadow-sm shadow-emerald-200', hex: '#10b981' };
    } else if (trends.tanah_kering.diff > 1) {
        trendInfo = { type: 'warn', label: 'Degradasi (Kering)', color: 'bg-orange-500 text-white shadow-sm shadow-orange-200', hex: '#f59e0b' };
    }

    // Year-over-year breakdown for narrative engine
    const yearlyBreakdown = [];
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const yoyClasses = {};
        classes.forEach(cls => {
            const prevVal = prev[cls] || 0;
            const currVal = curr[cls] || 0;
            yoyClasses[cls] = { prev: prevVal, curr: currVal, diff: currVal - prevVal };
        });
        const prevHutan = (prev.hutan_primer || 0) + (prev.hutan_sekunder || 0);
        const currHutan = (curr.hutan_primer || 0) + (curr.hutan_sekunder || 0);
        yoyClasses.hutan = { prev: prevHutan, curr: currHutan, diff: currHutan - prevHutan };
        yearlyBreakdown.push({
            fromYear: prev.year,
            toYear: curr.year,
            classes: yoyClasses
        });
    }

    return { trends, trendInfo, period, startYear: firstData.year, endYear: latestData.year, yearlyBreakdown };
};

/**
 * Generates verbal narrative for the trend
 */
export const generateVerbalNarrative = (trendData) => {
    if (!trendData) return null;
    const { trends, startYear, endYear } = trendData;
    const forestTrend = trends.hutan;

    let status = { text: 'Kondisi Stabil', type: 'info' };
    let highlight = "";

    if (forestTrend.diff < -0.5) {
        status = { text: 'Kejadian Deforestasi', type: 'error' };
        highlight = `Terjadi penurunan tutupan hutan total seluas ${Math.abs(forestTrend.diff).toFixed(1)} Ha (${Math.abs(forestTrend.pct)}%) pada periode ${startYear}-${endYear}.`;
    } else if (forestTrend.diff > 0.5) {
        status = { text: 'Pemulihan Tutupan Teridentifikasi', type: 'success' };
        highlight = `Teridentifikasi kenaikan tutupan hutan total seluas ${forestTrend.diff.toFixed(1)} Ha (${forestTrend.pct}%) pada periode ${startYear}-${endYear}.`;
    } else if ((trends.tanah_kosong?.diff || 0) > 2) {
        status = { text: 'Degradasi Terdeteksi', type: 'warning' };
        highlight = `Terdeteksi peningkatan luasan area terbuka/tanah kosong sebesar ${trends.tanah_kosong.diff.toFixed(1)} Ha pada periode ${startYear}-${endYear}.`;
    } else if ((trends.lahan_terbangun?.diff || 0) > 1) {
        status = { text: 'Ekspansi Lahan Terbangun', type: 'warning' };
        highlight = `Terdeteksi peningkatan lahan terbangun sebesar ${trends.lahan_terbangun.diff.toFixed(1)} Ha pada periode ${startYear}-${endYear}.`;
    } else {
        // Default: kondisi stabil — tetap berikan ringkasan bermakna
        highlight = `Tutupan hutan relatif stabil dengan perubahan ${forestTrend.diff >= 0 ? '+' : ''}${forestTrend.diff.toFixed(1)} Ha (${startYear}-${endYear}). Total hutan saat ini: ${forestTrend.end.toFixed(1)} Ha.`;
    }

    return { status, highlight };
};

/**
 * Temporal Status Utility Functions
 * Implements grey area detection for year-to-year land cover changes
 */

/**
 * Get opacity value based on temporal status
 * @param {string} temporalStatus - Status from DB: 'stable', 'transition_unconfirmed', 'transition_confirmed', 'reverted_noise'
 * @returns {number} Opacity value (0-1)
 */
export const getOpacityByTemporalStatus = (temporalStatus) => {
    const opacityMap = {
        'stable': 1.0,                      // 100% - Solid color
        'transition_confirmed': 1.0,        // 100% - Solid color
        'transition_unconfirmed': 0.5,      // 50% - Faded (GREY AREA)
        'reverted_noise': 0.3               // 30% - Very faded
    };
    return opacityMap[temporalStatus] || 1.0;
};

/**
 * Get styling info for temporal status (for legend/tooltip)
 * @param {string} temporalStatus - Status from DB
 * @returns {object} Styling info with label, description, icon
 */
export const getTemporalStatusStyle = (temporalStatus) => {
    const styleMap = {
        'stable': {
            label: 'Stabil',
            description: 'Tutupan lahan tidak berubah dari tahun sebelumnya',
            color: '#10b981',       // Emerald (confirmed)
            badgeColor: 'bg-emerald-100 text-emerald-700',
            opacity: 1.0
        },
        'transition_confirmed': {
            label: 'Terkonfirmasi',
            description: 'Perubahan tutupan lahan terkonfirmasi (konsisten 2+ tahun)',
            color: '#f59e0b',       // Amber (confirmed change)
            badgeColor: 'bg-amber-100 text-amber-700',
            opacity: 1.0
        },
        'transition_unconfirmed': {
            label: 'Perubahan Belum Terkonfirmasi',
            description: 'Tutupan lahan terdeteksi berubah, namun belum dikonfirmasi secara temporal',
            color: '#84cc16',       // Lime (grey area)
            badgeColor: 'bg-yellow-100 text-yellow-700',
            opacity: 0.5
        },
        'reverted_noise': {
            label: 'Noise/Musiman',
            description: 'Perubahan palsu yang kembali ke kondisi sebelumnya (noise/musiman)',
            color: '#6b7280',       // Gray
            badgeColor: 'bg-slate-100 text-slate-700',
            opacity: 0.3
        }
    };
    return styleMap[temporalStatus] || styleMap['stable'];
};

/**
 * Fetch temporal status data for a history from backend
 * @param {string} historyId - History ID
 * @param {string} apiUrl - API base URL
 * @returns {Promise<object>} Temporal status data with yearly breakdown
 */
export const fetchTemporalStatus = async (historyId, apiUrl) => {
    try {
        const response = await fetch(`${apiUrl}/history/${historyId}/temporal-status`);
        if (!response.ok) {
            console.warn(`Failed to fetch temporal status for history ${historyId}:`, response.status);
            return null;
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching temporal status for history ${historyId}:`, error);
        return null;
    }
};

/**
 * Create opacity map for years based on temporal status data
 * @param {array} yearlyData - Array of yearly data with temporal_status
 * @returns {object} Map of year -> opacity
 */
export const createYearOpacityMap = (yearlyData) => {
    const opacityMap = {};
    if (!Array.isArray(yearlyData)) return opacityMap;

    yearlyData.forEach(yearData => {
        const year = yearData.year;
        const status = yearData.temporal_status || 'stable';
        opacityMap[year] = getOpacityByTemporalStatus(status);
    });

    return opacityMap;
};

/**
 * Fetch slope analysis data for a history from backend
 * @param {string} historyId - History ID
 * @param {string} apiUrl - API base URL
 * @returns {Promise<object>} Slope analysis data
 */
export const fetchSlopeAnalysis = async (historyId, apiUrl) => {
    try {
        const response = await fetch(`${apiUrl}/history/${historyId}/slope`);
        if (!response.ok) {
            console.warn(`Failed to fetch slope analysis for history ${historyId}:`, response.status);
            return null;
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching slope analysis for history ${historyId}:`, error);
        return null;
    }
};

/**
 * Fetch hotspot summary data for a history from backend
 * @param {string} historyId - History ID
 * @param {string} apiUrl - API base URL
 * @returns {Promise<object>} Hotspot summary data
 */
export const fetchHotspotSummary = async (historyId, apiUrl) => {
    try {
        const response = await fetch(`${apiUrl}/history/${historyId}/hotspots-summary`);
        if (!response.ok) {
            console.warn(`Failed to fetch hotspots summary for history ${historyId}:`, response.status);
            return null;
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching hotspots summary for history ${historyId}:`, error);
        return null;
    }
};

/**
 * Resolves local or remote thumbnail URLs to absolute URLs
 * @param {string} url - The URL to resolve
 * @param {string} apiUrl - The API base URL
 * @returns {string|null} - Resolved absolute URL or null
 */
export const resolveThumbUrl = (url, apiUrl) => {
    if (!url) return null;
    try {
        if (url.startsWith('/') && apiUrl) {
            const root = apiUrl.replace(/\/api\/?$/, '');
            const fullUrl = `${root}${url}`;
            console.debug(`[Thumbnail] Resolved local path: ${url} → ${fullUrl.substring(0, 80)}...`);
            return fullUrl;
        }
        return url;
    } catch (e) {
        console.error(`[Thumbnail] Failed to resolve URL: ${url}`, e);
        return url; // Return original as fallback
    }
};
