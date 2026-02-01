
/**
 * Utility for land cover trend analysis
 */

/**
 * Calculates differences between first and last data points
 * @param {Array} analysisResults - Array of analysis objects per year
 * @returns {Object} Trends per class and period info
 */
export const calculateTrends = (analysisResults) => {
    if (!analysisResults || analysisResults.length < 2) return null;

    // Sort by year to ensure correct comparison (first year vs latest year)
    const sorted = [...analysisResults].sort((a, b) =>
        (Number(a.year) || 0) - (Number(b.year) || 0)
    );

    const firstData = sorted[0];
    const latestData = sorted[sorted.length - 1];
    const period = latestData.year - firstData.year;

    const calcPct = (curr, old) => old > 0 ? (((curr - old) / old) * 100).toFixed(1) : 0;

    const classes = ['hutan', 'tanah_kering', 'tanah_kosong', 'air'];
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

    return { trends, trendInfo, period, startYear: firstData.year, endYear: latestData.year };
};

/**
 * Generates verbal narrative for the trend
 */
export const generateVerbalNarrative = (trendData) => {
    if (!trendData) return null;
    const { trends } = trendData;
    const forestTrend = trends.hutan;

    let status = { text: 'Kondisi Stabil', type: 'info' };
    let highlight = "";

    if (forestTrend.diff < -0.5) {
        status = { text: 'Kejadian Deforestasi', type: 'error' };
        highlight = `Terjadi penurunan tutupan hutan seluas ${Math.abs(forestTrend.diff).toFixed(1)} Ha (${Math.abs(forestTrend.pct)}%).`;
    } else if (forestTrend.diff > 0.5) {
        status = { text: 'Pemulihan Tutupan Teridentifikasi', type: 'success' };
        highlight = `Teridentifikasi kenaikan tutupan hutan seluas ${forestTrend.diff.toFixed(1)} Ha (${forestTrend.pct}%).`;
    } else if (trends.tanah_kering.diff > 2) {
        status = { text: 'Degradasi Terdeteksi', type: 'warning' };
        highlight = `Terdeteksi peningkatan luasan area terbuka/lahan kering sebesar (${trends.tanah_kering.diff.toFixed(1)} Ha).`;
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
