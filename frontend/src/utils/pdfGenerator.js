import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calculateTrends, generateVerbalNarrative } from './analysisUtils';
import { API_URL, LAND_COVER_CONFIG } from '../constants';
import { generateNarrative } from './narrativeEngine';

// --- NORMALIZE ANALYSIS RESULTS ---
// Ensures consistent total area across all years by scaling proportionally
// Uses the maximum total as reference so no class value is artificially inflated
const LAND_COVER_KEYS = ['hutan_primer', 'hutan_sekunder', 'tanah_kering', 'tanah_kosong', 'air', 'lahan_terbangun'];

const normalizeAnalysisResults = (results) => {
    if (!results || results.length === 0) return results;

    // Calculate total per year
    const totals = results.map(r =>
        LAND_COVER_KEYS.reduce((sum, k) => sum + (r[k] || 0), 0)
    );

    // Use the maximum total as reference area
    const refTotal = Math.max(...totals);
    if (refTotal <= 0) return results;

    // Check if normalization is needed (>0.5% difference)
    const needsNorm = totals.some(t => Math.abs(t - refTotal) / refTotal > 0.005);
    if (!needsNorm) return results;

    return results.map((r, i) => {
        const yearTotal = totals[i];
        if (yearTotal <= 0 || Math.abs(yearTotal - refTotal) < 0.01) return r;

        const scale = refTotal / yearTotal;
        const normalized = { ...r };
        LAND_COVER_KEYS.forEach(k => {
            normalized[k] = Math.round((r[k] || 0) * scale * 100) / 100;
        });
        return normalized;
    });
};

// --- FORMAL COLOR PALETTE ---
const COLORS = {
    primary: [31, 41, 55],    // Slate 800 (Formal)
    emerald: [6, 78, 59],     // Emerald 900 (Branding)
    accent: [16, 185, 129],   // Emerald 500
    gray700: [55, 65, 81],    // Gray 700
    gray500: [107, 114, 128], // Gray 500
    gray100: [243, 244, 246], // Gray 100
    white: [255, 255, 255],
    // 6 Classes Colors (Hex)
    hutan_primer: LAND_COVER_CONFIG.hutan_primer.color,
    hutan_sekunder: LAND_COVER_CONFIG.hutan_sekunder.color,
    tanah_kering: LAND_COVER_CONFIG.tanah_kering.color,
    tanah_kosong: LAND_COVER_CONFIG.tanah_kosong.color,
    air: LAND_COVER_CONFIG.air.color,
    lahan_terbangun: LAND_COVER_CONFIG.lahan_terbangun.color
};

const MAP_LC_COLORS = {
    [LAND_COVER_CONFIG.hutan_primer.classId]: LAND_COVER_CONFIG.hutan_primer.color,
    [LAND_COVER_CONFIG.hutan_sekunder.classId]: LAND_COVER_CONFIG.hutan_sekunder.color,
    [LAND_COVER_CONFIG.tanah_kering.classId]: LAND_COVER_CONFIG.tanah_kering.color,
    [LAND_COVER_CONFIG.tanah_kosong.classId]: LAND_COVER_CONFIG.tanah_kosong.color,
    [LAND_COVER_CONFIG.air.classId]: LAND_COVER_CONFIG.air.color,
    [LAND_COVER_CONFIG.lahan_terbangun.classId]: LAND_COVER_CONFIG.lahan_terbangun.color
};

// --- HELPERS ---

const checkPageSpace = (doc, needed, pageHeight) => {
    const currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 20;
    if (currentY + needed > pageHeight - 20) {
        doc.addPage();
        return 20;
    }
    return currentY + 10;
};

const generateBarChart = (data, width = 600, height = 300) => {
    return new Promise((resolve) => {
        if (!data || data.length === 0) { resolve(null); return; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);

        const margin = { top: 40, right: 40, bottom: 60, left: 60 };
        const cW = width - margin.left - margin.right;
        const cH = height - margin.top - margin.bottom;

        const cats = ['hutan_primer', 'hutan_sekunder', 'tanah_kering', 'tanah_kosong', 'lahan_terbangun', 'air'];
        const colors = [COLORS.hutan_primer, COLORS.hutan_sekunder, COLORS.tanah_kering, COLORS.tanah_kosong, COLORS.lahan_terbangun, COLORS.air];

        const maxV = Math.max(...data.map(d => Math.max(
            d.hutan_primer || 0,
            d.hutan_sekunder || 0,
            d.tanah_kering || 0,
            d.tanah_kosong || 0,
            d.lahan_terbangun || 0,
            d.air || 0
        ))) * 1.1;
        const bW = cW / (data.length * cats.length + data.length + 1);

        ctx.strokeStyle = '#f3f4f6'; ctx.lineWidth = 1; ctx.font = '12px Helvetica'; ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const val = (maxV / 5) * i; const y = margin.top + cH - (cH / 5) * i;
            ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + cW, y); ctx.stroke();
            ctx.fillStyle = '#9ca3af'; ctx.fillText(val.toFixed(0), margin.left - 10, y + 4);
        }

        let xPos = margin.left + bW;
        data.forEach((d) => {
            cats.forEach((c, i) => {
                const val = d[c] || 0; const h = (val / maxV) * cH;
                const x = xPos + (i * bW); const y = margin.top + cH - h;
                ctx.fillStyle = colors[i]; ctx.fillRect(x, y, bW - 2, h);
            });
            ctx.fillStyle = '#374151'; ctx.font = 'bold 14px Helvetica'; ctx.textAlign = 'center';
            ctx.fillText(d.year, xPos + (cats.length * bW) / 2, margin.top + cH + 25);

            xPos += (cats.length * bW) + bW;
        });

        resolve(canvas.toDataURL('image/png', 0.9));
    });
};

const generateAreaChart = (data, width = 600, height = 300) => {
    return new Promise((resolve) => {
        if (!data || data.length === 0) { resolve(null); return; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);

        const margin = { top: 40, right: 40, bottom: 60, left: 60 };
        const cW = width - margin.left - margin.right;
        const cH = height - margin.top - margin.bottom;

        const cats = ['hutan_primer', 'hutan_sekunder', 'tanah_kering', 'tanah_kosong', 'lahan_terbangun', 'air'];
        const colors = [COLORS.hutan_primer, COLORS.hutan_sekunder, COLORS.tanah_kering, COLORS.tanah_kosong, COLORS.lahan_terbangun, COLORS.air];
        const fillColors = [
            COLORS.hutan_primer,
            COLORS.hutan_sekunder,
            COLORS.tanah_kering,
            COLORS.tanah_kosong,
            COLORS.lahan_terbangun,
            COLORS.air
        ];

        // For Area Chart, we sum up areas to show a stacked effect
        // REVERSED: Air/Empty at bottom, Forest (Hutan) at top
        const reversedCats = [...cats].reverse(); // ['air', 'tanah_kosong', 'tanah_kering', 'hutan']
        const stackedData = data.map(d => {
            let sum = 0;
            return reversedCats.map(c => {
                sum += (d[c] || 0);
                return sum;
            });
        });

        const maxV = Math.max(...stackedData.map(d => d[d.length - 1])) * 1.1;
        const stepX = cW / (data.length - 1 || 1);

        // Grid
        ctx.strokeStyle = '#f3f4f6'; ctx.lineWidth = 1; ctx.font = '12px Helvetica'; ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const val = (maxV / 5) * i; const y = margin.top + cH - (cH / 5) * i;
            ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + cW, y); ctx.stroke();
            ctx.fillStyle = '#9ca3af'; ctx.fillText(val.toFixed(0), margin.left - 10, y + 4);
        }

        // Draw stacked areas from bottom up (reversed cats for correct visual stacking if needed, 
        // but here we calculate cumulative values so we draw from back to front)
        for (let i = reversedCats.length - 1; i >= 0; i--) {
            const catName = reversedCats[i];
            const catColorIndex = cats.indexOf(catName);

            ctx.fillStyle = fillColors[catColorIndex];
            ctx.beginPath();
            ctx.moveTo(margin.left, margin.top + cH);

            data.forEach((d, idx) => {
                const val = stackedData[idx][i];
                const x = margin.left + (idx * stepX);
                const y = margin.top + cH - (val / maxV) * cH;
                ctx.lineTo(x, y);
            });

            ctx.lineTo(margin.left + cW, margin.top + cH);
            ctx.closePath();
            ctx.fill();

            // Line
            ctx.strokeStyle = colors[catColorIndex];
            ctx.lineWidth = 2;
            ctx.beginPath();
            data.forEach((d, idx) => {
                const val = stackedData[idx][i];
                const x = margin.left + (idx * stepX);
                const y = margin.top + cH - (val / maxV) * cH;
                if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Add Labels for TOTAL AREA at the very top line
            if (i === 0) { // Top category in the stack
                data.forEach((d, idx) => {
                    const val = stackedData[idx][0]; // Stacked total
                    const x = margin.left + (idx * stepX);
                    const y = margin.top + cH - (val / maxV) * cH;
                    ctx.fillStyle = '#4b5563';
                    ctx.font = 'bold 8px Helvetica';
                    ctx.textAlign = 'center';
                    ctx.fillText(val.toFixed(1), x, y - 8);
                });
            }
        }

        // Labels
        data.forEach((d, idx) => {
            const x = margin.left + (idx * stepX);
            ctx.fillStyle = '#374151'; ctx.font = 'bold 12px Helvetica'; ctx.textAlign = 'center';
            ctx.fillText(d.year, x, margin.top + cH + 25);
        });

        resolve(canvas.toDataURL('image/png', 0.9));
    });
};

const generateVectorImage = (geojson, width = 1000, height = 750) => {
    return new Promise((resolve) => {
        if (!geojson || !geojson.features) { resolve(null); return; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        geojson.features.forEach(f => {
            if (f.geometry) {
                const proc = (c) => {
                    if (typeof c[0] === 'number') {
                        if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
                        if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
                    } else c.forEach(proc);
                };
                proc(f.geometry.coordinates);
            }
        });

        const pad = width * 0.05;
        const scale = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY));
        const ox = pad + (width - pad * 2 - (maxX - minX) * scale) / 2;
        const oy = pad + (height - pad * 2 - (maxY - minY) * scale) / 2;

        geojson.features.forEach(f => {
            const cid = f.properties['class'] || f.properties['gridcode'] || 0;
            ctx.fillStyle = MAP_LC_COLORS[cid] || '#f3f4f6'; ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 0.5; ctx.beginPath();
            const draw = (rings) => {
                rings.forEach(r => {
                    r.forEach(([x, y], i) => {
                        const px = (x - minX) * scale + ox; const py = (maxY - y) * scale + oy;
                        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    });
                    ctx.closePath();
                });
            };
            if (f.geometry.type === 'Polygon') draw(geojson.features[0].geometry.type === 'Polygon' ? f.geometry.coordinates : [f.geometry.coordinates]);
            else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates.forEach(p => draw(p));
            ctx.fill(); ctx.stroke();
        });
        resolve(canvas.toDataURL('image/png', 0.9));
    });
};

const loadImage = (url) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
};

const getCentroid = (geojson) => {
    try {
        let coordinates = null;
        if (geojson.type === "FeatureCollection" && geojson.features.length > 0) {
            coordinates = geojson.features[0].geometry.coordinates;
        } else if (geojson.type === "Feature") {
            coordinates = geojson.geometry.coordinates;
        }

        if (!coordinates) return null;

        // Simplify complex polygon/multipolygon to points
        let flatPoints = [];
        const flatten = (arr) => {
            if (typeof arr[0] === 'number') {
                flatPoints.push(arr);
            } else {
                arr.forEach(flatten);
            }
        };
        flatten(coordinates);

        if (flatPoints.length === 0) return null;

        let sumLat = 0, sumLng = 0;
        flatPoints.forEach(p => {
            sumLng += p[0];
            sumLat += p[1];
        });

        return {
            lat: (sumLat / flatPoints.length).toFixed(6),
            lng: (sumLng / flatPoints.length).toFixed(6)
        };
    } catch (e) {
        return null;
    }
};

const generateSlopeChart = (slopeAnalysis, width = 800, height = 400) => {
    return new Promise((resolve) => {
        if (!slopeAnalysis) { resolve(null); return; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);

        const margin = { top: 60, right: 60, bottom: 80, left: 80 };
        const cW = width - margin.left - margin.right;
        const cH = height - margin.top - margin.bottom;

        const classes = [
            { key: 'datar_0_8', label: 'Datar (0-8%)', color: '#31a354', colorLight: '#a1d99b' },
            { key: 'landai_8_15', label: 'Landai (8-15%)', color: '#addd8e', colorLight: '#d9f0a3' },
            { key: 'agak_curam_15_25', label: 'Agak Curam (15-25%)', color: '#fee391', colorLight: '#fff3bf' },
            { key: 'curam_25_45', label: 'Curam (25-45%)', color: '#fec44f', colorLight: '#fee08b' },
            { key: 'sangat_curam_45_plus', label: 'Sangat Curam (>45%)', color: '#cc4c02', colorLight: '#fdae6b' }
        ];

        const scopes = ['INSIDE', 'OUTSIDE_2KM'];
        const scopeLabels = { 'INSIDE': 'Dalam Area', 'OUTSIDE_2KM': 'Buffer 2km' };

        // Data processing for Ha and %
        const processedData = scopes.map(scope => {
            const data = slopeAnalysis[scope]?.klasifikasi || {};
            const total = Object.values(data).reduce((a, b) => a + (Number(b) || 0), 0);
            const items = {};
            classes.forEach(cls => {
                const ha = Number(data[cls.key]) || 0;
                items[cls.key] = {
                    ha,
                    pct: total > 0 ? (ha / total) * 100 : 0
                };
            });
            return { scope, items };
        });

        const maxHa = Math.max(0.1, ...processedData.map(d => Math.max(0, ...classes.map(cls => d.items[cls.key].ha)))) * 1.35;

        // Grid
        ctx.strokeStyle = '#f3f4f6'; ctx.lineWidth = 1; ctx.font = '14px Helvetica'; ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const val = (maxHa / 5) * i; const y = margin.top + cH - (cH / 5) * i;
            ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + cW, y); ctx.stroke();
            ctx.fillStyle = '#9ca3af'; ctx.fillText(val.toFixed(0), margin.left - 10, y + 4);
        }

        ctx.textAlign = 'left';
        ctx.fillText('Luas (Hektar)', margin.left, margin.top - 20);

        const groupW = cW / classes.length;
        const barW = (groupW * 0.7) / scopes.length;

        classes.forEach((cls, idx) => {
            const groupX = margin.left + (idx * groupW);

            scopes.forEach((scope, sIdx) => {
                const item = processedData[sIdx].items[cls.key];
                const h = (item.ha / maxHa) * cH;
                const x = groupX + (groupW * 0.15) + (sIdx * barW);
                const y = margin.top + cH - h;

                // Inside = solid slope color, Buffer = lighter version
                ctx.fillStyle = scope === 'INSIDE' ? cls.color : cls.colorLight;
                ctx.fillRect(x, y, barW - 10, h);

                // Dark border for definition
                ctx.strokeStyle = scope === 'INSIDE' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, barW - 10, h);

                // Add text on top of bars
                if (item.ha > 0) {
                    ctx.fillStyle = '#1e293b';
                    ctx.font = 'bold 11px Helvetica';
                    ctx.textAlign = 'center';
                    ctx.fillText(item.ha.toFixed(1), x + (barW - 10) / 2, y - 18);
                    ctx.font = '9px Helvetica';
                    ctx.fillText(`${item.pct.toFixed(1)}%`, x + (barW - 10) / 2, y - 5);
                }
            });

            // Color indicator + Class Label below
            const labelX = groupX + groupW / 2;
            ctx.fillStyle = cls.color;
            ctx.beginPath(); ctx.arc(labelX - 30, margin.top + cH + 25, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 12px Helvetica';
            ctx.textAlign = 'left';
            ctx.fillText(cls.label.split('(')[0].trim(), labelX - 20, margin.top + cH + 30);
        });

        // Legend for Inside vs Buffer
        const legX = margin.left + cW - 300;
        const legY = margin.top - 40;

        scopes.forEach((scope, i) => {
            // Use first class color as sample
            ctx.fillStyle = scope === 'INSIDE' ? classes[0].color : classes[0].colorLight;
            ctx.fillRect(legX + (i * 150), legY, 20, 15);
            ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
            ctx.strokeRect(legX + (i * 150), legY, 20, 15);
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 13px Helvetica';
            ctx.textAlign = 'left';
            ctx.fillText(`${scopeLabels[scope]} (${scope === 'INSIDE' ? 'Solid' : 'Light'})`, legX + (i * 150) + 25, legY + 12);
        });

        resolve(canvas.toDataURL('image/png', 0.9));
    });
};

const applyPageBranding = (doc, pW, pH, pageNum, totalPages) => {
    // Header Stripe
    doc.setFillColor(...COLORS.emerald);
    doc.rect(0, 0, pW, 8, 'F');

    // Footer Background
    doc.setFillColor(249, 250, 251); // Gray 50
    doc.rect(0, pH - 15, pW, 15, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.line(0, pH - 15, pW, pH - 15);

    // Brand Name & Page info
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.gray500);
    doc.text("GealGeolGeo Dashboard - Direktorat Pengendalian Perhutanan Sosial", 15, pH - 6);
    doc.text(`Halaman ${pageNum} dari ${totalPages}`, pW - 15, pH - 6, { align: 'right' });
};

export const generateAnalysisReport = async (item, slopeData = null, hotspotData = null) => {
    // Normalize analysis results so total area is consistent across all years
    if (item.analysis_results && item.analysis_results.length > 0) {
        item = { ...item, analysis_results: normalizeAnalysisResults(item.analysis_results) };
    }

    const doc = new jsPDF();
    const pW = doc.internal.pageSize.width;
    const pH = doc.internal.pageSize.height;

    // --- FORMAL HEADER (First Page) ---
    doc.setFillColor(...COLORS.emerald);
    doc.rect(0, 0, pW, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(22);
    doc.text("GealGeolGeo", 15, 18);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("Direktorat Pengendalian Perhutanan Sosial", 15, 24);

    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("LAPORAN HASIL ANALISIS", pW - 15, 18, { align: 'right' });
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`Doc ID: ${item.id.substring(0, 12).toUpperCase()}`, pW - 15, 24, { align: 'right' });

    // Footer for first page
    doc.setFillColor(249, 250, 251); doc.rect(0, pH - 15, pW, 15, 'F');
    doc.setDrawColor(229, 231, 235); doc.line(0, pH - 15, pW, pH - 15);
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.gray500);
    doc.text("GealGeolGeo Dashboard - Direktorat Pengendalian Perhutanan Sosial", 15, pH - 6);

    let y = 45;

    // ── Layout constants ──
    const mL = 15;
    const mR = 15;
    const contentW = pW - mL - mR;
    const lineH = 3.8;

    // Helper: check remaining space, add page if needed
    const ensureSpace = (needed) => {
        if (y + needed > pH - 18) { doc.addPage(); y = 20; }
    };

    // ── 1. IDENTITAS DATASET ──
    doc.setTextColor(...COLORS.primary); doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("1. IDENTITAS DATASET", mL, y);
    y += 5;

    const shp = item.geo_data?.features?.[0]?.properties || {};
    const extra = slopeData?.enriched_kps || {};
    const kps = item.kps_info || {};

    const identLeft = [
        ['Nama KPS', kps.nama_kps || extra.nama_kps || shp.nama_kps || shp.NAMA_KPS || item.display_name || '-'],
        ['No. SK', kps.no_sk || extra.no_sk || shp.no_sk || shp.NO_SK || '-'],
        ['Tipe KPS', kps.kps_type || extra.kps_type || shp.kps_type || shp.SKEMA || '-'],
        ['Provinsi', kps.provinsi || extra.provinsi || shp.provinsi || shp.PROVINSI || '-'],
        ['Kab/Kota', kps.kab_kota || extra.kab_kota || shp.kab_kota || shp.KABUPATEN || '-']
    ];

    const centroid = kps.kps_lat ? `${Number(kps.kps_lat).toFixed(5)}, ${Number(kps.kps_lng).toFixed(5)}`
        : extra.kps_lat ? `${Number(extra.kps_lat).toFixed(5)}, ${Number(extra.kps_lng).toFixed(5)}`
        : getCentroid(item.geo_data) ? `${getCentroid(item.geo_data).lat}, ${getCentroid(item.geo_data).lng}`
        : '-';

    const identRight = [
        ['Kecamatan', kps.kecamatan || extra.kecamatan || shp.kecamatan || '-'],
        ['Desa', kps.desa || extra.desa || shp.desa || '-'],
        ['Tanggal SK', kps.tgl_sk || extra.tgl_sk || shp.tgl_sk || '-'],
        ['Luas SK (Ha)', kps.luas_sk_ha || extra.luas_sk_ha || shp.luas_sk_ha || shp.LUAS_HA || '-'],
        ['Luas Analisis (Ha)', item.analysis_results?.[0] ? Object.keys(LAND_COVER_CONFIG).reduce((sum, k) => sum + (item.analysis_results[0][k] || 0), 0).toFixed(2) : '-'],
        ['Centroid', centroid]
    ];

    // Background card
    doc.setFillColor(249, 250, 251);
    const cardHeight = 40;
    doc.roundedRect(mL, y, contentW, cardHeight, 2, 2, 'F');

    // Left Column
    autoTable(doc, {
        startY: y + 2,
        margin: { left: mL + 3 },
        tableWidth: (contentW - 10) / 2,
        body: identLeft,
        theme: 'plain',
        styles: { fontSize: 7.5, cellPadding: 1.2, textColor: COLORS.gray700 },
        columnStyles: { 0: { fontStyle: 'bold', width: 24, textColor: COLORS.gray500 } }
    });

    // Right Column
    autoTable(doc, {
        startY: y + 2,
        margin: { left: mL + contentW / 2 + 2 },
        tableWidth: (contentW - 10) / 2,
        body: identRight,
        theme: 'plain',
        styles: { fontSize: 7.5, cellPadding: 1.2, textColor: COLORS.gray700 },
        columnStyles: { 0: { fontStyle: 'bold', width: 24, textColor: COLORS.gray500 } }
    });

    y = Math.max(y + cardHeight, doc.lastAutoTable.finalY) + 2;

    doc.setFontSize(7); doc.setFont("helvetica", "italic"); doc.setTextColor(...COLORS.gray500);
    doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`, pW - mR, y, { align: 'right' });
    y += 7;

    // ── 2. RINGKASAN EKSEKUTIF ──
    const narrativeResult = generateNarrative({
        analysisResults: item.analysis_results,
        slopeData,
        hotspotData,
        lang: 'id'
    });

    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
    doc.text("2. RINGKASAN EKSEKUTIF", mL, y);
    y += 5;

    // Executive summary text
    const summaryLines = doc.splitTextToSize(narrativeResult.executiveSummary, contentW - 4);
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...COLORS.gray700);
    doc.text(summaryLines, mL + 2, y);
    y += (summaryLines.length * lineH) + 5;

    // ── 2.1 Analisis Tren Tutupan ──
    if (narrativeResult.trendNarrative) {
        ensureSpace(20);
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        doc.text("2.1  Analisis Tren Tutupan", mL, y);
        y += 4;

        const trendText = narrativeResult.trendNarrative;
        const yoyMarker = 'Rincian perubahan per periode tahun:';
        const yoyIdx = trendText.indexOf(yoyMarker);

        // Main trend paragraph
        const mainTrendText = yoyIdx >= 0 ? trendText.substring(0, yoyIdx).trim() : trendText;
        const mainLines = doc.splitTextToSize(mainTrendText, contentW - 8);
        ensureSpace(mainLines.length * lineH + 3);
        doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...COLORS.gray700);
        doc.text(mainLines, mL + 4, y);
        y += (mainLines.length * lineH) + 3;

        // Year-over-year breakdown
        if (yoyIdx >= 0) {
            const yoyText = trendText.substring(yoyIdx + yoyMarker.length).trim();
            const yoyItems = yoyText.split(/(?=Periode \d{4}-\d{4}:)/);

            ensureSpace(10);
            doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
            doc.text("Rincian Perubahan Per Periode:", mL + 4, y);
            y += 4;

            const bulletX = mL + 7;
            const bulletTextX = bulletX + 3;
            const bulletW = contentW - 12;

            yoyItems.forEach(raw => {
                const line = raw.trim();
                if (!line) return;

                const isPeriodLine = /^Periode \d{4}-\d{4}:/.test(line);
                const isHighlight = /^(Penurunan paling signifikan|Pemulihan terbaik)/.test(line);

                if (isPeriodLine) {
                    const periodLines = doc.splitTextToSize(line, bulletW);
                    ensureSpace(periodLines.length * lineH + 1);
                    doc.setFillColor(...COLORS.primary);
                    doc.circle(bulletX, y - 1, 0.6, 'F');
                    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...COLORS.gray700);
                    doc.text(periodLines, bulletTextX, y);
                    y += (periodLines.length * lineH) + 1;
                } else if (isHighlight) {
                    const hlLines = doc.splitTextToSize(line, bulletW - 4);
                    const hlH = (hlLines.length * lineH) + 4;
                    ensureSpace(hlH + 1);
                    doc.setFillColor(254, 243, 199);
                    doc.setDrawColor(251, 191, 36);
                    doc.setLineWidth(0.2);
                    doc.roundedRect(bulletX, y - 3, bulletW, hlH, 1, 1, 'FD');
                    doc.setFontSize(8); doc.setFont("helvetica", "bolditalic"); doc.setTextColor(146, 64, 14);
                    doc.text(hlLines, bulletX + 2, y);
                    y += hlH + 1;
                } else if (line) {
                    const otherLines = doc.splitTextToSize(line, bulletW);
                    ensureSpace(otherLines.length * lineH + 1);
                    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...COLORS.gray700);
                    doc.text(otherLines, bulletTextX, y);
                    y += (otherLines.length * lineH) + 1;
                }
            });
            y += 2;
        }
    }

    // ── 2.2 Analisis Hotspot ──
    if (narrativeResult.hotspotNarrative) {
        ensureSpace(18);
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        doc.text("2.2  Analisis Hotspot (NASA FIRMS)", mL, y);
        y += 4;

        doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...COLORS.gray700);
        const splitHotspot = doc.splitTextToSize(narrativeResult.hotspotNarrative, contentW - 8);
        ensureSpace(splitHotspot.length * lineH + 3);
        doc.text(splitHotspot, mL + 4, y);
        y += (splitHotspot.length * lineH) + 5;
    }

    // ── 2.3 Karakteristik Medan ──
    if (narrativeResult.terrainNarrative) {
        ensureSpace(18);
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        doc.text("2.3  Karakteristik Medan (Terrain)", mL, y);
        y += 4;

        doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...COLORS.gray700);
        const splitTerrain = doc.splitTextToSize(narrativeResult.terrainNarrative, contentW - 8);
        ensureSpace(splitTerrain.length * lineH + 3);
        doc.text(splitTerrain, mL + 4, y);
        y += (splitTerrain.length * lineH) + 6;
    }

    // --- DATA SUMMARY ---
    if (item.analysis_results && item.analysis_results.length > 0) {
        doc.addPage();
        y = 20;
        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary); // Reset font for main header
        doc.text("3. RINGKASAN DATA", 15, y);
        y += 8;

        const seriesBody = item.analysis_results.map(res => {
            const total = (res.hutan_primer || 0) + (res.hutan_sekunder || 0) + (res.tanah_kering || 0) + (res.tanah_kosong || 0) + (res.air || 0) + (res.lahan_terbangun || 0);
            return [
                res.year,
                (res.hutan_primer || 0).toFixed(2),
                (res.hutan_sekunder || 0).toFixed(2),
                (res.tanah_kering || 0).toFixed(2),
                (res.tanah_kosong || 0).toFixed(2),
                (res.lahan_terbangun || 0).toFixed(2),
                (res.air || 0).toFixed(2),
                total.toFixed(2)
            ];
        });

        autoTable(doc, {
            startY: y,
            head: [['Tahun', 'H. Primer', 'H. Sekunder', 'T. Kering', 'T. Kosong', 'Terbangun', 'Air', 'Total']],
            body: seriesBody,
            theme: 'striped',
            headStyles: { fillColor: COLORS.primary, textColor: 255 },
            styles: { fontSize: 7, cellPadding: 2, halign: 'center' },
            columnStyles: { 0: { fontStyle: 'bold' }, 7: { fontStyle: 'bold' } }
        });
        y = doc.lastAutoTable.finalY + 15;
    }

    // --- TREND ANALYSIS ---
    if (item.analysis_results.length > 1) {
        if (y > pH - 150) { doc.addPage(); y = 20; }
        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        doc.text("4. ANALISIS TREN PERUBAHAN", 15, y);
        y += 8;

        const trend = calculateTrends(item.analysis_results);
        const narrative = generateVerbalNarrative(trend);
        const latestRes = item.analysis_results[item.analysis_results.length - 1];

        // Indicator Card
        autoTable(doc, {
            startY: y,
            head: [['Indikator Utama', 'Status / Keterangan']],
            body: [
                ['Status Dinamika', trend.trendInfo.label.toUpperCase()],
                ['Ringkasan', narrative?.highlight || '-']
            ],
            theme: 'grid',
            headStyles: { fillColor: COLORS.gray100, textColor: COLORS.primary },
            styles: { fontSize: 9, cellPadding: 4 },
            columnStyles: { 0: { fontStyle: 'bold', width: 45 } }
        });
        y = doc.lastAutoTable.finalY + 15; // Increased spacing after table since narrative is removed

        // Visual Charts Group - Vertical Split
        if (y > pH - 140) { doc.addPage(); y = 20; }

        doc.setFontSize(9); doc.setFont("helvetica", "bold");
        doc.text("Dinamika Temporal (Batang)", 15, y);
        y += 5;

        const barChart = await generateBarChart(item.analysis_results, 800, 300);
        if (barChart) {
            doc.addImage(barChart, 'PNG', 15, y, pW - 30, 60); // Full width
            y += 65;
        }

        if (y > pH - 80) { doc.addPage(); y = 20; }

        doc.text("Dinamika Temporal (Area Akumulatif)", 15, y);
        y += 5;

        const areaChart = await generateAreaChart(item.analysis_results, 800, 300);
        if (areaChart) {
            doc.addImage(areaChart, 'PNG', 15, y, pW - 30, 60); // Full width
            y += 65;
        }

        // Comparison Table (Red/Green logic)
        const { trends: trendMetrics, startYear, endYear } = trend;
        const comparisonBody = [
            ['Hutan Primer', (trendMetrics.hutan_primer?.start || 0).toFixed(2), (trendMetrics.hutan_primer?.end || 0).toFixed(2), (trendMetrics.hutan_primer?.diff || 0).toFixed(2)],
            ['Hutan Sekunder', (trendMetrics.hutan_sekunder?.start || 0).toFixed(2), (trendMetrics.hutan_sekunder?.end || 0).toFixed(2), (trendMetrics.hutan_sekunder?.diff || 0).toFixed(2)],
            ['Tanah Kering', (trendMetrics.tanah_kering?.start || 0).toFixed(2), (trendMetrics.tanah_kering?.end || 0).toFixed(2), (trendMetrics.tanah_kering?.diff || 0).toFixed(2)],
            ['Tanah Kosong', (trendMetrics.tanah_kosong?.start || 0).toFixed(2), (trendMetrics.tanah_kosong?.end || 0).toFixed(2), (trendMetrics.tanah_kosong?.diff || 0).toFixed(2)],
            ['Lahan Terbangun', (trendMetrics.lahan_terbangun?.start || 0).toFixed(2), (trendMetrics.lahan_terbangun?.end || 0).toFixed(2), (trendMetrics.lahan_terbangun?.diff || 0).toFixed(2)],
            ['Air', (trendMetrics.air?.start || 0).toFixed(2), (trendMetrics.air?.end || 0).toFixed(2), (trendMetrics.air?.diff || 0).toFixed(2)]
        ];

        if (y > pH - 45) { doc.addPage(); y = 20; }

        autoTable(doc, {
            startY: y,
            margin: { top: 20, bottom: 20, left: 15, right: 15 },
            head: [['Kelas Tutupan', `Tahun ${startYear} (Ha)`, `Tahun ${endYear} (Ha)`, 'Perubahan (Ha)']],
            body: comparisonBody,
            theme: 'striped',
            headStyles: { fillColor: COLORS.primary, textColor: 255 },
            styles: { fontSize: 8.5, cellPadding: 3 },
            columnStyles: {
                0: { fontStyle: 'bold' },
                1: { halign: 'right' },
                2: { halign: 'right' },
                3: { halign: 'right', fontStyle: 'bold' }
            },
            didParseCell: (data) => {
                if (data.column.index === 3 && data.cell.section === 'body') {
                    const diff = parseFloat(data.cell.text[0]);
                    const isForest = data.row.index === 0 || data.row.index === 1;
                    if (isForest) {
                        if (diff < -0.01) data.cell.styles.textColor = [185, 28, 28];
                        else if (diff > 0.01) data.cell.styles.textColor = [5, 150, 105];
                    } else {
                        if (diff > 0.1) data.cell.styles.textColor = [5, 150, 105];
                        else if (diff < -0.1) data.cell.styles.textColor = [185, 28, 28];
                    }
                }
            }
        });
        y = doc.lastAutoTable.finalY + 12;
    }

    // --- YEARLY DETAILS (GRID 2x2 — 4 rasters per page) ---
    const results = item.analysis_results || [];
    const GRID_COLS = 2;
    const GRID_ROWS = 2;
    const PER_PAGE = GRID_COLS * GRID_ROWS; // 4
    const cellW = (pW - 30 - 8) / GRID_COLS; // 2 columns with 8mm gap
    const cellH = 95; // height per cell (raster + label + stats)
    const gapX = 8;
    const gapY = 6;
    const marginLeft = 15;

    // Legend items (shared across pages)
    const legendItems = [
        { label: LAND_COVER_CONFIG.hutan_primer.shortLabel, color: LAND_COVER_CONFIG.hutan_primer.color },
        { label: LAND_COVER_CONFIG.hutan_sekunder.shortLabel, color: LAND_COVER_CONFIG.hutan_sekunder.color },
        { label: LAND_COVER_CONFIG.tanah_kering.shortLabel, color: LAND_COVER_CONFIG.tanah_kering.color },
        { label: LAND_COVER_CONFIG.tanah_kosong.shortLabel, color: LAND_COVER_CONFIG.tanah_kosong.color },
        { label: LAND_COVER_CONFIG.air.shortLabel, color: LAND_COVER_CONFIG.air.color },
        { label: LAND_COVER_CONFIG.lahan_terbangun.shortLabel, color: LAND_COVER_CONFIG.lahan_terbangun.color }
    ];

    // Helper: render a single raster cell at (cx, cy)
    const renderYearCell = async (res, cx, cy) => {
        const rasterW = cellW - 4;
        const rasterH = cellH - 28;
        const rasterX = cx + 2;
        const rasterY = cy + 14;

        // Year title
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        doc.text(`Tahun ${res.year}`, cx + cellW / 2, cy + 5, { align: 'center' });

        // Compact stats line
        doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...COLORS.gray500);
        const statsLine = `HP:${(res.hutan_primer || 0).toFixed(1)}  HS:${(res.hutan_sekunder || 0).toFixed(1)}  TK:${(res.tanah_kering || 0).toFixed(1)}  TKs:${(res.tanah_kosong || 0).toFixed(1)}  Air:${(res.air || 0).toFixed(1)}  TB:${(res.lahan_terbangun || 0).toFixed(1)} ha`;
        doc.text(statsLine, cx + cellW / 2, cy + 11, { align: 'center' });

        // Border for raster area
        doc.setDrawColor(...COLORS.gray100);
        doc.setLineWidth(0.3);
        doc.rect(rasterX, rasterY, rasterW, rasterH);

        // Try vector first, then thumb
        let rendered = false;
        if (res.vector_geojson) {
            try {
                const vecImgData = await generateVectorImage(res.vector_geojson, 800, 600);
                if (vecImgData) {
                    const img = await loadImage(vecImgData);
                    if (img) {
                        const imgRatio = img.width / img.height;
                        const boxRatio = rasterW / rasterH;
                        let drawW, drawH;
                        if (imgRatio > boxRatio) { drawW = rasterW; drawH = rasterW / imgRatio; }
                        else { drawH = rasterH; drawW = rasterH * imgRatio; }
                        doc.addImage(img, 'PNG', rasterX + (rasterW - drawW) / 2, rasterY + (rasterH - drawH) / 2, drawW, drawH);
                        rendered = true;
                    }
                }
            } catch (e) { console.warn(`Vector failed for ${res.year}`, e); }
        }

        if (!rendered) {
            let finalThumbUrl = res.thumb_url;
            if (finalThumbUrl && finalThumbUrl.startsWith('/')) {
                finalThumbUrl = `${API_URL.replace(/\/api\/?$/, '')}${finalThumbUrl}`;
            }
            if (finalThumbUrl) {
                try {
                    const img = await loadImage(finalThumbUrl);
                    if (img) {
                        const imgRatio = img.width / img.height;
                        const boxRatio = rasterW / rasterH;
                        let drawW, drawH;
                        if (imgRatio > boxRatio) { drawW = rasterW; drawH = rasterW / imgRatio; }
                        else { drawH = rasterH; drawW = rasterH * imgRatio; }
                        doc.addImage(img, 'PNG', rasterX + (rasterW - drawW) / 2, rasterY + (rasterH - drawH) / 2, drawW, drawH);
                        rendered = true;
                    }
                } catch (e) { console.warn(`Thumb failed for ${res.year}`, e); }
            }
        }

        if (!rendered) {
            doc.setFontSize(7); doc.setTextColor(...COLORS.gray500);
            doc.text("[Tidak Tersedia]", rasterX + rasterW / 2, rasterY + rasterH / 2, { align: 'center' });
        }
    };

    // Helper: render legend row
    const renderLegend = (legendY) => {
        doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.gray500);
        const legColWidth = 30;
        const legTotalW = legColWidth * legendItems.length;
        const legStartX = (pW - legTotalW) / 2;
        legendItems.forEach((li, idx) => {
            const lx = legStartX + idx * legColWidth;
            doc.setFillColor(li.color);
            doc.rect(lx, legendY, 3, 3, 'F');
            doc.text(li.label, lx + 4.5, legendY + 2.5);
        });
    };

    // Smart flow: first batch uses remaining space on current page, then 4 per page
    let rasterIdx = 0;
    const pageBottom = pH - 20; // safe bottom margin

    // Calculate how many rows fit in the remaining space on current page
    const remainingSpace = pageBottom - y - 15; // 15 for title + legend
    const rowsFitOnCurrent = Math.floor(remainingSpace / (cellH + gapY));

    if (rowsFitOnCurrent >= 1 && results.length > 0) {
        // Render section title on current page
        doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        const firstEndIdx = Math.min(rowsFitOnCurrent * GRID_COLS, results.length);
        const yearRange = results.length > firstEndIdx
            ? ` (${results[0].year} - ${results[firstEndIdx - 1].year})`
            : '';
        doc.text(`5. DATA DETAIL PER TAHUN${yearRange}`, 15, y);
        y += 8;

        // Render cells that fit
        const firstBatch = results.slice(0, firstEndIdx);
        for (let i = 0; i < firstBatch.length; i++) {
            const col = i % GRID_COLS;
            const row = Math.floor(i / GRID_COLS);
            const cx = marginLeft + col * (cellW + gapX);
            const cy = y + row * (cellH + gapY);
            await renderYearCell(firstBatch[i], cx, cy);
        }

        // Legend below rendered rows
        const actualRows = Math.ceil(firstBatch.length / GRID_COLS);
        renderLegend(y + actualRows * (cellH + gapY) + 2);

        rasterIdx = firstEndIdx;
    }

    // Remaining results: 4 per page (2x2 grid)
    while (rasterIdx < results.length) {
        doc.addPage();
        y = 20;

        const startIdx = rasterIdx;
        const endIdx = Math.min(startIdx + PER_PAGE, results.length);
        const yearRange = ` (${results[startIdx].year} - ${results[endIdx - 1].year})`;

        doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        doc.text(`5. DATA DETAIL PER TAHUN${yearRange}`, 15, y);
        y += 8;

        const pageResults = results.slice(startIdx, endIdx);
        for (let i = 0; i < pageResults.length; i++) {
            const col = i % GRID_COLS;
            const row = Math.floor(i / GRID_COLS);
            const cx = marginLeft + col * (cellW + gapX);
            const cy = y + row * (cellH + gapY);
            await renderYearCell(pageResults[i], cx, cy);
        }

        // Legend
        const actualRows = Math.ceil(pageResults.length / GRID_COLS);
        renderLegend(y + actualRows * (cellH + gapY) + 2);

        rasterIdx = endIdx;
    }

    // --- SLOPE ANALYSIS SECTION — 1 PAGE: Cards + Chart + Table + Slope Image ---
    if (slopeData && slopeData.slope_analysis) {
        doc.addPage();
        y = 20;

        const slopeClasses = [
            { key: 'datar_0_8', label: 'Datar (0-8%)', color: '#31a354', rgb: [49, 163, 84] },
            { key: 'landai_8_15', label: 'Landai (8-15%)', color: '#addd8e', rgb: [173, 221, 142] },
            { key: 'agak_curam_15_25', label: 'Agak Curam (15-25%)', color: '#fee391', rgb: [254, 227, 145] },
            { key: 'curam_25_45', label: 'Curam (25-45%)', color: '#fec44f', rgb: [254, 196, 79] },
            { key: 'sangat_curam_45_plus', label: 'Sangat Curam (>45%)', color: '#cc4c02', rgb: [204, 76, 2] }
        ];

        // ── Title ──
        doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        doc.text("6. ANALISIS KELERENGAN (SLOPE)", mL, y);
        y += 7;

        // ── Summary Cards (compact) ──
        const avgSlopeInside = slopeData.slope_analysis.INSIDE?.avg_slope || 0;
        const avgSlopeOutside = slopeData.slope_analysis.OUTSIDE_2KM?.avg_slope || 0;

        const dbErosionRisk = slopeData.enriched_kps?.erosion_risk;
        let erosionRisk = dbErosionRisk || 'AMAN';
        if (!dbErosionRisk) {
            const latestRes = item.analysis_results?.at(-1);
            const totalArea = latestRes ? (Object.keys(LAND_COVER_CONFIG).reduce((sum, k) => sum + (Number(latestRes[k]) || 0), 0)) : 0;
            const bareLandPct = (latestRes && Number.isFinite(totalArea) && totalArea > 0) ? ((Number(latestRes.tanah_kosong) || 0) / totalArea * 100) : 0;
            if (avgSlopeInside >= 25 && bareLandPct > 10) erosionRisk = 'TINGGI';
            else if (avgSlopeInside >= 15 && bareLandPct > 5) erosionRisk = 'SEDANG';
            else if (avgSlopeInside >= 8 || bareLandPct > 2) erosionRisk = 'RENDAH';
        }
        const riskColors = { 'TINGGI': [220, 38, 38], 'SEDANG': [245, 158, 11], 'RENDAH': [16, 185, 129], 'AMAN': [5, 150, 105] };

        const sCardW = (contentW - 8) / 3;
        const sCardH = 16;
        // Card 1
        doc.setFillColor(243, 244, 246); doc.roundedRect(mL, y, sCardW, sCardH, 2, 2, 'F');
        doc.setFontSize(5.5); doc.setTextColor(...COLORS.gray500); doc.setFont("helvetica", "normal");
        doc.text("AVG SLOPE (DALAM)", mL + sCardW / 2, y + 5, { align: 'center' });
        doc.setFontSize(9); doc.setTextColor(...COLORS.primary); doc.setFont("helvetica", "bold");
        doc.text(`${avgSlopeInside.toFixed(1)}%`, mL + sCardW / 2, y + 12, { align: 'center' });
        // Card 2
        const c2x = mL + sCardW + 4;
        doc.setFillColor(243, 244, 246); doc.roundedRect(c2x, y, sCardW, sCardH, 2, 2, 'F');
        doc.setFontSize(5.5); doc.setTextColor(...COLORS.gray500); doc.setFont("helvetica", "normal");
        doc.text("AVG SLOPE (BUFFER 2KM)", c2x + sCardW / 2, y + 5, { align: 'center' });
        doc.setFontSize(9); doc.setTextColor(...COLORS.primary); doc.setFont("helvetica", "bold");
        doc.text(`${avgSlopeOutside.toFixed(1)}%`, c2x + sCardW / 2, y + 12, { align: 'center' });
        // Card 3
        const c3x = mL + (sCardW + 4) * 2;
        const rClr = riskColors[erosionRisk] || COLORS.primary;
        doc.setFillColor(...rClr); doc.roundedRect(c3x, y, sCardW, sCardH, 2, 2, 'F');
        doc.setFontSize(5.5); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "normal");
        doc.text("RISIKO EROSI", c3x + sCardW / 2, y + 5, { align: 'center' });
        doc.setFontSize(9); doc.setFont("helvetica", "bold");
        doc.text(erosionRisk, c3x + sCardW / 2, y + 12, { align: 'center' });

        y += sCardH + 5;

        // ── Bar Chart (compact) ──
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        doc.text("Distribusi Kelas Lereng (Inside vs Buffer 2KM)", mL, y);
        y += 4;

        try {
            const slopeChart = await generateSlopeChart(slopeData.slope_analysis, 900, 400);
            if (slopeChart) {
                const chartH = 52;
                doc.addImage(slopeChart, 'PNG', mL, y, contentW, chartH);
                y += chartH + 4;
            }
        } catch (e) {
            console.warn('Slope chart generation failed:', e);
            y += 2;
        }

        // ── Compact Table ──
        const insideData = slopeData.slope_analysis.INSIDE?.klasifikasi || {};
        const outsideData = slopeData.slope_analysis.OUTSIDE_2KM?.klasifikasi || {};
        const totalInside = Object.values(insideData).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) || 1;
        const totalOutside = Object.values(outsideData).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) || 1;

        const slopeTableBody = slopeClasses.map(cls => {
            const haIn = insideData[cls.key] || 0;
            const haOut = outsideData[cls.key] || 0;
            return [
                cls.label,
                haIn.toFixed(2),
                ((haIn / totalInside) * 100).toFixed(1) + '%',
                haOut.toFixed(2),
                ((haOut / totalOutside) * 100).toFixed(1) + '%'
            ];
        });
        slopeTableBody.push(['TOTAL', totalInside.toFixed(2), '100.0%', totalOutside.toFixed(2), '100.0%']);

        autoTable(doc, {
            startY: y,
            margin: { left: mL, right: mR },
            head: [['Kelas Lereng', 'Dalam (Ha)', 'Dalam (%)', 'Buffer (Ha)', 'Buffer (%)']],
            body: slopeTableBody,
            theme: 'striped',
            headStyles: { fillColor: COLORS.primary, textColor: 255, fontSize: 6.5, halign: 'center', cellPadding: 1.2 },
            bodyStyles: { fontSize: 6.5, halign: 'center', cellPadding: 1.2 },
            columnStyles: {
                0: { halign: 'left', fontStyle: 'bold', cellWidth: 40 },
                1: { cellWidth: 24 }, 2: { cellWidth: 20 },
                3: { cellWidth: 24 }, 4: { cellWidth: 20 }
            },
            didParseCell: (data) => {
                if (data.row.index === slopeClasses.length && data.cell.section === 'body') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [229, 231, 235];
                }
            }
        });

        y = doc.lastAutoTable.finalY + 5;

        // ── Slope Image (compact) + Legend ──
        const slopeImgUrl = item.slope_map_url || slopeData.slope_map_url;
        let slopeImgLoaded = false;
        const remainingForImg = pH - y - 20;

        if (slopeImgUrl && remainingForImg > 25) {
            try {
                let imgUrl = slopeImgUrl;
                if (imgUrl.startsWith('/') && !imgUrl.startsWith('http')) {
                    imgUrl = `${API_URL.replace(/\/api\/?$/, '')}${imgUrl}`;
                }
                let img = await loadImage(imgUrl);

                // Fallback: if image load failed and we have history_id, try the slope-image endpoint
                if (!img && item.id) {
                    try {
                        console.log('🔄 Slope image load failed, trying /api/slope-image fallback...');
                        const baseUrl = API_URL.replace(/\/api\/?$/, '');
                        const fallbackRes = await fetch(`${baseUrl}/api/slope-image/${item.id}`);
                        if (fallbackRes.ok) {
                            const fallbackJson = await fallbackRes.json();
                            if (fallbackJson?.url) {
                                let fallbackUrl = fallbackJson.url;
                                if (fallbackUrl.startsWith('/') && !fallbackUrl.startsWith('http')) {
                                    fallbackUrl = `${baseUrl}${fallbackUrl}`;
                                }
                                img = await loadImage(fallbackUrl);
                                console.log(img ? '✅ Slope fallback image loaded' : '❌ Slope fallback image also failed');
                            }
                        }
                    } catch (fallbackErr) {
                        console.warn('Slope fallback fetch failed:', fallbackErr.message);
                    }
                }

                if (img) {
                    // Clean black background
                    const cvs = document.createElement('canvas');
                    cvs.width = img.naturalWidth; cvs.height = img.naturalHeight;
                    const ctx = cvs.getContext('2d');
                    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cvs.width, cvs.height);
                    ctx.drawImage(img, 0, 0);
                    const imageData = ctx.getImageData(0, 0, cvs.width, cvs.height);
                    const px = imageData.data;
                    for (let p = 0; p < px.length; p += 4) {
                        if (px[p] < 15 && px[p + 1] < 15 && px[p + 2] < 15) {
                            px[p] = 255; px[p + 1] = 255; px[p + 2] = 255; px[p + 3] = 255;
                        }
                    }
                    ctx.putImageData(imageData, 0, 0);
                    const cleanedUrl = cvs.toDataURL('image/png');

                    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
                    doc.text("Peta Kelerengan Dalam Area (NASADEM)", mL, y + 2);
                    y += 5;

                    // Fit image in remaining space
                    const imgMaxH = Math.min(remainingForImg - 10, 70);
                    const imgRatio = img.naturalWidth / img.naturalHeight;
                    const imgAreaW = contentW * 0.55;
                    let fitW, fitH;
                    if (imgRatio > imgAreaW / imgMaxH) { fitW = imgAreaW; fitH = imgAreaW / imgRatio; }
                    else { fitH = imgMaxH; fitW = imgMaxH * imgRatio; }

                    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
                    doc.rect(mL - 0.5, y - 0.5, fitW + 1, fitH + 1);
                    doc.addImage(cleanedUrl, 'PNG', mL, y, fitW, fitH);

                    // Compact legend to the right
                    const legX = mL + fitW + 5;
                    let legY = y + 1;
                    doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.gray500);
                    doc.text("LEGENDA", legX, legY); legY += 3.5;
                    slopeClasses.forEach((cls) => {
                        doc.setFillColor(...cls.rgb);
                        doc.rect(legX, legY - 2, 2.5, 2.5, 'F');
                        doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...COLORS.gray700);
                        doc.text(cls.label, legX + 4, legY);
                        legY += 3.5;
                    });

                    y += fitH + 3;
                    slopeImgLoaded = true;
                }
            } catch (e) {
                console.warn("Slope map failed:", e);
            }
        }

        // If no slope image yet and we have history_id, try the dedicated endpoint as last resort
        if (!slopeImgLoaded && item.id && remainingForImg > 25) {
            try {
                console.log('🔄 No slope image URL, trying /api/slope-image as last resort...');
                const baseUrl = API_URL.replace(/\/api\/?$/, '');
                const lastRes = await fetch(`${baseUrl}/api/slope-image/${item.id}`);
                if (lastRes.ok) {
                    const lastJson = await lastRes.json();
                    if (lastJson?.url) {
                        let lastUrl = lastJson.url;
                        if (lastUrl.startsWith('/') && !lastUrl.startsWith('http')) {
                            lastUrl = `${baseUrl}${lastUrl}`;
                        }
                        const img = await loadImage(lastUrl);
                        if (img) {
                            const cvs = document.createElement('canvas');
                            cvs.width = img.naturalWidth; cvs.height = img.naturalHeight;
                            const ctx = cvs.getContext('2d');
                            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cvs.width, cvs.height);
                            ctx.drawImage(img, 0, 0);
                            const imageData = ctx.getImageData(0, 0, cvs.width, cvs.height);
                            const px = imageData.data;
                            for (let p = 0; p < px.length; p += 4) {
                                if (px[p] < 15 && px[p + 1] < 15 && px[p + 2] < 15) {
                                    px[p] = 255; px[p + 1] = 255; px[p + 2] = 255; px[p + 3] = 255;
                                }
                            }
                            ctx.putImageData(imageData, 0, 0);
                            const cleanedUrl = cvs.toDataURL('image/png');

                            doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
                            doc.text("Peta Kelerengan Dalam Area (NASADEM)", mL, y + 2);
                            y += 5;

                            const imgMaxH = Math.min(remainingForImg - 10, 70);
                            const imgRatio = img.naturalWidth / img.naturalHeight;
                            const imgAreaW = contentW * 0.55;
                            let fitW, fitH;
                            if (imgRatio > imgAreaW / imgMaxH) { fitW = imgAreaW; fitH = imgAreaW / imgRatio; }
                            else { fitH = imgMaxH; fitW = imgMaxH * imgRatio; }

                            doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
                            doc.rect(mL - 0.5, y - 0.5, fitW + 1, fitH + 1);
                            doc.addImage(cleanedUrl, 'PNG', mL, y, fitW, fitH);

                            const legX = mL + fitW + 5;
                            let legY = y + 1;
                            doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.gray500);
                            doc.text("LEGENDA", legX, legY); legY += 3.5;
                            slopeClasses.forEach((cls) => {
                                doc.setFillColor(...cls.rgb);
                                doc.rect(legX, legY - 2, 2.5, 2.5, 'F');
                                doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...COLORS.gray700);
                                doc.text(cls.label, legX + 4, legY);
                                legY += 3.5;
                            });

                            y += fitH + 3;
                            slopeImgLoaded = true;
                            console.log('✅ Slope image loaded via last-resort endpoint');
                        }
                    }
                }
            } catch (e) {
                console.warn('Slope last-resort fetch failed:', e.message);
            }
        }

        if (!slopeImgLoaded) {
            doc.setFontSize(7); doc.setFont("helvetica", "italic"); doc.setTextColor(...COLORS.gray500);
            doc.text("Peta kelerengan: aktifkan toggle Slope pada peta untuk men-generate visualisasi.", mL, y);
            y += 5;
        }

        // Source note at bottom
        doc.setFontSize(5.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...COLORS.gray500);
        doc.text("Sumber: NASA DEM (SRTM-derived), resolusi 30m.", mL, Math.min(y + 1, pH - 18));
    }

    // --- HOTSPOT ANALYSIS SECTION ---
    if (hotspotData && hotspotData.total_hotspots > 0) {
        doc.addPage();
        y = 20;
        doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor([185, 28, 28]); // Red 700
        doc.text("7. ANALISIS GANGGUAN (HOTSPOTS)", 15, y);
        y += 10;

        // Hotspot Stats Cards
        const cardW = (pW - 40) / 2;
        const cardH = 22;

        doc.setFillColor(254, 242, 242); doc.roundedRect(15, y, cardW, cardH, 2, 2, 'F');
        doc.setFontSize(7); doc.setTextColor(185, 28, 28); doc.text("TOTAL HOTSPOTS DETECTED", 15 + cardW / 2, y + 7, { align: 'center' });
        doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text(`${hotspotData.total_hotspots}`, 15 + cardW / 2, y + 16, { align: 'center' });

        const latestYear = Object.keys(hotspotData.yearly_hotspots).at(-1);
        const latestCount = hotspotData.yearly_hotspots[latestYear] || 0;
        doc.setFillColor(254, 242, 242); doc.roundedRect(25 + cardW, y, cardW, cardH, 2, 2, 'F');
        doc.setFontSize(7); doc.setTextColor(185, 28, 28); doc.setFont("helvetica", "normal"); doc.text(`HOTSPOTS IN LATEST YEAR (${latestYear})`, 25 + cardW + cardW / 2, y + 7, { align: 'center' });
        doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text(`${latestCount}`, 25 + cardW + cardW / 2, y + 16, { align: 'center' });

        y += cardH + 15;

        // Yearly Table
        const hsTableBody = Object.entries(hotspotData.yearly_hotspots).map(([year, count]) => [year, `${count} Titik Panas`]);

        doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        doc.text("Rekapitulasi Titik Panas Tahunan", 15, y);
        y += 5;

        autoTable(doc, {
            startY: y,
            head: [['Tahun Pengamatan', 'Jumlah Terdeteksi']],
            body: hsTableBody,
            theme: 'grid',
            headStyles: { fillColor: [185, 28, 28], textColor: 255, halign: 'center' },
            bodyStyles: { halign: 'center' },
            styles: { fontSize: 9 }
        });

        y = doc.lastAutoTable.finalY + 10;

        doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.setTextColor(...COLORS.gray500);
        doc.text("* Sumber Data: NASA FIRMS (VIIRS & MODIS Sensors)", 15, y);
    } else if (hotspotData) {
        doc.addPage();
        y = 20;
        doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.emerald);
        doc.text("7. ANALISIS GANGGUAN (HOTSPOTS)", 15, y);
        y += 15;
        doc.setTextColor(...COLORS.gray500); doc.setFontSize(10); doc.setFont("helvetica", "normal");
        doc.text("Tidak terdeteksi titik panas signifikan pada periode analisis ini.", 15, y);
    }

    // Apply Page Branding (Headers/Footers) to all pages
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        if (i > 1) { // Header stripe only for subsequent pages (page 1 has special header)
            applyPageBranding(doc, pW, pH, i, pageCount);
        } else {
            // First page just needs the page number in footer
            doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.gray500);
            doc.text(`Halaman ${i} dari ${pageCount}`, pW - 15, pH - 6, { align: 'right' });
        }
    }

    // Standardize filename: Laporan_Name_YYYYMMDD.pdf
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const cleanName = (item.display_name || item.filename || 'Laporan')
        .replace(/\.[^/.]+$/, "") // Remove existing extension if any
        .replace(/[^a-z0-9]/gi, '_') // Replace special chars with underscore
        .substring(0, 30); // Limit length
    let fileName = `GealGeolGeo_${cleanName}_${dateStr}`;
    if (!fileName.toLowerCase().endsWith('.pdf')) {
        fileName += '.pdf';
    }

    console.log(`✉️ Triggering PDF Download: ${fileName}`);

    // Force Manual Download with strict mimetype
    const pdfOutput = doc.output('blob');

    // Wrap as File object to try to embed filename in the object metadata
    const file = new File([pdfOutput], fileName, { type: 'application/pdf' });
    const url = window.URL.createObjectURL(file);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);

    link.click();

    // Extend cleanup time to ensure browser has time to capture the file and name
    setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }, 60000); // 1 minute delay
};
