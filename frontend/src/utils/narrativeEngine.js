/**
 * Smart Narrative Engine - Core Engine
 * Rule-based deterministic narrative generation from quantitative forest analysis data.
 * Supports bilingual output (ID/EN).
 */

import { calculateTrends } from './analysisUtils';
import { LAND_COVER_CONFIG } from '../constants';
import {
    TREND_THRESHOLDS,
    HOTSPOT_THRESHOLDS,
    TERRAIN_THRESHOLDS,
    PHRASES
} from './narrativeConfig';

// ============================================================
// Module 1: analyzeTrend
// ============================================================
export const analyzeTrend = (analysisResults) => {
    const trendData = calculateTrends(analysisResults);

    if (!trendData) {
        return {
            trendType: 'stable', magnitude: 'minor', ratePerYear: 0,
            diffHa: 0, diffPct: 0, dominantConversion: null,
            period: 0, startYear: null, endYear: null
        };
    }

    const { trends, period, startYear, endYear } = trendData;
    const hutanDiff = trends.hutan.diff;
    const hutanPct = parseFloat(trends.hutan.pct) || 0;

    // Classify trend type
    let trendType = 'stable';
    if (hutanDiff < -TREND_THRESHOLDS.forestChangeMin) {
        trendType = 'deforestation';
    } else if (hutanDiff > TREND_THRESHOLDS.forestChangeMin) {
        trendType = 'recovery';
    } else if ((trends.tanah_kering?.diff || 0) > TREND_THRESHOLDS.degradationDryMin) {
        trendType = 'degradation';
    }

    // Classify magnitude
    const absHa = Math.abs(hutanDiff);
    const absPct = Math.abs(hutanPct);
    let magnitude = 'significant';
    if (absHa < TREND_THRESHOLDS.magnitude.minor.maxHa && absPct < TREND_THRESHOLDS.magnitude.minor.maxPct) {
        magnitude = 'minor';
    } else if (absHa < TREND_THRESHOLDS.magnitude.moderate.maxHa && absPct < TREND_THRESHOLDS.magnitude.moderate.maxPct) {
        magnitude = 'moderate';
    }

    // Rate per year
    const ratePerYear = period > 0 ? hutanDiff / period : 0;

    // Dominant conversion: which non-forest class gained most
    const nonForestClasses = ['tanah_kering', 'tanah_kosong', 'air', 'lahan_terbangun'];
    let dominantConversion = null;
    let maxGain = 0;
    nonForestClasses.forEach(cls => {
        const diff = trends[cls]?.diff || 0;
        if (diff > maxGain) {
            maxGain = diff;
            dominantConversion = cls;
        }
    });

    return {
        trendType, magnitude, ratePerYear,
        diffHa: hutanDiff, diffPct: hutanPct,
        dominantConversion, period, startYear, endYear,
        // Detailed breakdown
        details: {
            hutan_primer: trends.hutan_primer?.diff || 0,
            hutan_sekunder: trends.hutan_sekunder?.diff || 0,
            conversionHa: maxGain
        },
        // Year-over-year breakdown from calculateTrends
        yearlyBreakdown: trendData.yearlyBreakdown || []
    };
};

// ============================================================
// Module 2: analyzeHotspots
// ============================================================
export const analyzeHotspots = (hotspotData, totalAreaHa) => {
    const defaultResult = {
        level: 'none', totalCount: 0, concentrationRatio: 0,
        spike: null, clustering: null, peakYear: null
    };

    if (!hotspotData) return defaultResult;

    const totalCount = hotspotData.total_hotspots || 0;
    if (totalCount === 0) return defaultResult;

    // Handle yearly_hotspots as object or array
    let yearlyEntries = [];
    const yh = hotspotData.yearly_hotspots;
    if (yh) {
        if (Array.isArray(yh)) {
            yearlyEntries = yh.map(item => [String(item.year), item.count || 0]);
        } else if (typeof yh === 'object') {
            yearlyEntries = Object.entries(yh).map(([y, c]) => [y, Number(c) || 0]);
        }
    }
    yearlyEntries.sort((a, b) => Number(a[0]) - Number(b[0]));

    // Concentration ratio
    const areaHa = totalAreaHa > 0 ? totalAreaHa : 1;
    const concentrationRatio = totalCount / areaHa;

    let level = 'medium';
    if (concentrationRatio < HOTSPOT_THRESHOLDS.concentration.low) level = 'low';
    else if (concentrationRatio > HOTSPOT_THRESHOLDS.concentration.high) level = 'high';

    // Spike detection (>2x year-over-year, min 3 count)
    let spike = null;
    for (let i = 1; i < yearlyEntries.length; i++) {
        const prevCount = yearlyEntries[i - 1][1];
        const currCount = yearlyEntries[i][1];
        if (prevCount > 0 && currCount >= HOTSPOT_THRESHOLDS.significantMinCount &&
            currCount >= prevCount * HOTSPOT_THRESHOLDS.spikeFactor) {
            spike = { year: yearlyEntries[i][0], count: currCount, prevCount };
        }
    }

    // Clustering detection (>50% in single year)
    let clustering = null;
    let peakYear = null;
    let peakCount = 0;
    yearlyEntries.forEach(([year, count]) => {
        if (count > peakCount) {
            peakCount = count;
            peakYear = year;
        }
    });

    if (totalCount > 0 && peakCount > 0) {
        const peakPct = (peakCount / totalCount) * 100;
        if (peakPct >= HOTSPOT_THRESHOLDS.clusteringPct) {
            clustering = { year: peakYear, count: peakCount, pct: peakPct };
        }
    }

    return { level, totalCount, concentrationRatio, spike, clustering, peakYear };
};

// ============================================================
// Module 3: analyzeTerrain
// ============================================================
export const analyzeTerrain = (slopeData, latestLandCover) => {
    const defaultResult = {
        dominantTerrainType: 'mixed', distribution: {},
        vulnerability: 'low', erosionRisk: 'AMAN', avgSlope: 0
    };

    if (!slopeData?.slope_analysis?.INSIDE) return defaultResult;

    const insideData = slopeData.slope_analysis.INSIDE;
    const klasifikasi = insideData.klasifikasi || {};
    const avgSlope = insideData.avg_slope || 0;

    // Calculate distribution percentages
    const total = Object.values(klasifikasi).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) || 1;
    const distribution = {};
    TERRAIN_THRESHOLDS.slopeCategories.forEach(cat => {
        const ha = klasifikasi[cat.key] || 0;
        distribution[cat.key] = { ha, pct: (ha / total) * 100 };
    });

    // Dominant terrain type
    let dominantTerrainType = 'mixed';
    let maxPct = 0;
    const typeKeyMap = {
        'datar_0_8': 'datar', 'landai_8_15': 'landai',
        'agak_curam_15_25': 'agak_curam', 'curam_25_45': 'curam',
        'sangat_curam_45_plus': 'sangat_curam'
    };
    Object.entries(distribution).forEach(([key, { pct }]) => {
        if (pct > maxPct) {
            maxPct = pct;
            if (pct >= TERRAIN_THRESHOLDS.dominantThreshold) {
                dominantTerrainType = typeKeyMap[key] || 'mixed';
            }
        }
    });

    // Vulnerability from steep + very steep
    const steepPct = (distribution.curam_25_45?.pct || 0) + (distribution.sangat_curam_45_plus?.pct || 0);
    let vulnerability = 'medium';
    if (steepPct < TERRAIN_THRESHOLDS.vulnerability.low) vulnerability = 'low';
    else if (steepPct >= TERRAIN_THRESHOLDS.vulnerability.high) vulnerability = 'high';

    // Erosion risk (replicates pdfGenerator.js logic lines 852-858)
    const dbErosionRisk = slopeData.enriched_kps?.erosion_risk;
    let erosionRisk = dbErosionRisk || 'AMAN';
    if (!dbErosionRisk && latestLandCover) {
        const totalArea = Object.keys(LAND_COVER_CONFIG).reduce((sum, k) => sum + (latestLandCover[k] || 0), 0);
        const bareLandPct = totalArea > 0 ? ((latestLandCover.tanah_kosong || 0) / totalArea * 100) : 0;
        const er = TERRAIN_THRESHOLDS.erosionRisk;
        if (avgSlope >= er.tinggi.minSlope && bareLandPct > er.tinggi.minBarePct) erosionRisk = 'TINGGI';
        else if (avgSlope >= er.sedang.minSlope && bareLandPct > er.sedang.minBarePct) erosionRisk = 'SEDANG';
        else if (avgSlope >= er.rendah.minSlope || bareLandPct > er.rendah.minBarePct) erosionRisk = 'RENDAH';
    }

    return { dominantTerrainType, distribution, vulnerability, erosionRisk, avgSlope };
};

// ============================================================
// Module 5: assembleNarrative
// ============================================================
export const assembleNarrative = (trendResult, hotspotResult, terrainResult, lang = 'id') => {
    const p = PHRASES[lang] || PHRASES.id;

    // --- Executive Summary ---
    const execParts = [];
    execParts.push(p.exec_period(trendResult.startYear || '-', trendResult.endYear || '-'));

    if (trendResult.trendType === 'deforestation') {
        execParts.push(p.exec_trend_deforestation(trendResult.diffHa, trendResult.diffPct));
    } else if (trendResult.trendType === 'recovery') {
        execParts.push(p.exec_trend_recovery(trendResult.diffHa, trendResult.diffPct));
    } else if (trendResult.trendType === 'degradation') {
        execParts.push(p.exec_trend_degradation(Math.abs(trendResult.diffHa)));
    } else {
        execParts.push(p.exec_trend_stable());
    }

    execParts.push(p.exec_hotspot(hotspotResult.totalCount, hotspotResult.level));
    execParts.push(p.exec_terrain(terrainResult.avgSlope, terrainResult.erosionRisk));

    const executiveSummary = execParts.join(p.period) + p.period + p.exec_disclaimer();

    // --- Trend Narrative ---
    const trendParts = [];
    const tRes = trendResult;
    const { startYear, endYear, period } = tRes;
    
    // Build Forest detail string
    const forestDetail = p.trend_detail_forest(tRes.details.hutan_primer, tRes.details.hutan_sekunder);

    if (tRes.trendType === 'deforestation') {
        trendParts.push(p.trend_deforestation(tRes.diffHa, tRes.diffPct, tRes.ratePerYear, period, startYear, endYear, forestDetail));
    } else if (tRes.trendType === 'recovery') {
        trendParts.push(p.trend_recovery(tRes.diffHa, tRes.diffPct, tRes.ratePerYear, period, startYear, endYear, forestDetail));
    } else if (tRes.trendType === 'degradation') {
        trendParts.push(p.trend_degradation(Math.abs(tRes.diffHa), forestDetail));
    } else {
        trendParts.push(p.trend_stable(forestDetail));
    }

    trendParts.push(p.trend_magnitude(tRes.magnitude));

    if (tRes.dominantConversion) {
        trendParts.push(p.trend_conversion(tRes.dominantConversion, tRes.details.conversionHa));
    }

    // Year-over-year breakdown narrative
    const yoyBreakdown = tRes.yearlyBreakdown || [];
    if (yoyBreakdown.length > 1) {
        trendParts.push(p.yoy_header());

        // Track worst/best periods
        let worstPeriod = null;
        let bestPeriod = null;

        yoyBreakdown.forEach(yoy => {
            const hutanDiffYoy = yoy.classes.hutan?.diff || 0;

            // Build per-period line
            let periodLine;
            if (hutanDiffYoy < -0.01) {
                periodLine = p.yoy_forest_loss(yoy.fromYear, yoy.toYear, hutanDiffYoy);
            } else if (hutanDiffYoy > 0.01) {
                periodLine = p.yoy_forest_gain(yoy.fromYear, yoy.toYear, hutanDiffYoy);
            } else {
                periodLine = p.yoy_forest_stable(yoy.fromYear, yoy.toYear);
            }

            // Detail per-class changes (non-forest)
            const detailClasses = ['tanah_kering', 'tanah_kosong', 'lahan_terbangun', 'air'];
            const classChanges = detailClasses
                .map(cls => p.yoy_detail_class(cls, yoy.classes[cls]?.diff || 0))
                .filter(Boolean);
            periodLine += p.yoy_class_changes(classChanges) + '.';
            trendParts.push(periodLine);

            // Track extremes
            if (!worstPeriod || hutanDiffYoy < worstPeriod.diff) {
                worstPeriod = { fromYear: yoy.fromYear, toYear: yoy.toYear, diff: hutanDiffYoy };
            }
            if (!bestPeriod || hutanDiffYoy > bestPeriod.diff) {
                bestPeriod = { fromYear: yoy.fromYear, toYear: yoy.toYear, diff: hutanDiffYoy };
            }
        });

        // Add highlight for worst/best periods if meaningful
        if (worstPeriod && worstPeriod.diff < -0.5) {
            trendParts.push(p.yoy_worst_period(worstPeriod.fromYear, worstPeriod.toYear, worstPeriod.diff));
        }
        if (bestPeriod && bestPeriod.diff > 0.5) {
            trendParts.push(p.yoy_best_period(bestPeriod.fromYear, bestPeriod.toYear, bestPeriod.diff));
        }
    }

    const trendNarrative = trendParts.join(' ');

    // --- Hotspot Narrative ---
    let hotspotNarrative;
    if (hotspotResult.totalCount === 0) {
        hotspotNarrative = p.hotspot_none();
    } else {
        const hParts = [];
        hParts.push(p.hotspot_level(hotspotResult.totalCount, hotspotResult.level));
        if (hotspotResult.spike) {
            hParts.push(p.hotspot_spike(hotspotResult.spike.year, hotspotResult.spike.count));
        }
        if (hotspotResult.clustering) {
            hParts.push(p.hotspot_clustering(hotspotResult.clustering.year, hotspotResult.clustering.pct));
        }
        hParts.push(p.hotspot_source());
        hotspotNarrative = hParts.join(' ');
    }

    // --- Terrain Narrative ---
    const tParts = [];
    tParts.push(p.terrain_dominant(terrainResult.dominantTerrainType));
    tParts.push(p.terrain_avg_slope(terrainResult.avgSlope));
    tParts.push(p.terrain_vulnerability(terrainResult.vulnerability));
    tParts.push(p.terrain_erosion(terrainResult.erosionRisk));
    const terrainNarrative = tParts.join(' ');

    return {
        executiveSummary,
        trendNarrative,
        hotspotNarrative,
        terrainNarrative
    };
};

// ============================================================
// Main Entry Point: generateNarrative
// ============================================================
export const generateNarrative = ({ analysisResults, slopeData, hotspotData, lang = 'id' }) => {
    // Calculate total area from latest results
    const resultsArray = Array.isArray(analysisResults) ? analysisResults : [analysisResults].filter(Boolean);
    const latestRes = resultsArray.length > 0 ? resultsArray[resultsArray.length - 1] : null;
    const totalAreaHa = latestRes
        ? Object.keys(LAND_COVER_CONFIG).reduce((sum, k) => sum + (latestRes[k] || 0), 0)
        : 0;

    // Module 1: Trend
    const trendResult = analyzeTrend(analysisResults);

    // Module 2: Hotspots
    const hotspotResult = analyzeHotspots(hotspotData, totalAreaHa);

    // Module 3: Terrain
    const terrainResult = analyzeTerrain(slopeData, latestRes);

    // Module 5: Assemble
    const narrative = assembleNarrative(trendResult, hotspotResult, terrainResult, lang);

    return {
        ...narrative,
        // Metadata for debugging/auditing
        _meta: {
            trendResult,
            hotspotResult,
            terrainResult,
            lang,
            totalAreaHa
        }
    };
};
