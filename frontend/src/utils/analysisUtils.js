
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

    const firstData = analysisResults[0];
    const latestData = analysisResults[analysisResults.length - 1];
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
    let trendInfo = { type: 'neutral', label: 'Stabil', color: 'bg-slate-100 text-slate-500', hex: '#64748b' };
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
