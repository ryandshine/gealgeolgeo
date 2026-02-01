import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calculateTrends, generateVerbalNarrative } from './analysisUtils';
import { API_URL } from '../constants';

// --- FORMAL COLOR PALETTE ---
const COLORS = {
    primary: [31, 41, 55],    // Slate 800 (Formal)
    emerald: [6, 78, 59],     // Emerald 900 (Branding)
    accent: [16, 185, 129],   // Emerald 500
    gray700: [55, 65, 81],    // Gray 700
    gray500: [107, 114, 128], // Gray 500
    gray100: [243, 244, 246], // Gray 100
    white: [255, 255, 255],
    hutan: "#10b981",
    tanah_kering: "#f59e0b",
    tanah_kosong: "#ea580c",
    air: "#3b82f6",
    lahan_terbangun: "#708090"
};

const MAP_LC_COLORS = {
    1: "#228B22", 2: "#DAA520", 3: "#D2691E", 4: "#1E90FF", 5: "#708090"
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

        const cats = ['hutan', 'tanah_kering', 'tanah_kosong', 'lahan_terbangun', 'air'];
        const colors = [COLORS.hutan, COLORS.tanah_kering, COLORS.tanah_kosong, COLORS.lahan_terbangun, COLORS.air];

        const maxV = Math.max(...data.map(d => Math.max(
            d.hutan || 0,
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

            // Add label for forest (hutan)
            const hutanVal = d.hutan || 0;
            const hHutan = (hutanVal / maxV) * cH;
            const xHutan = xPos;
            const yHutan = margin.top + cH - hHutan;
            ctx.fillStyle = '#000000'; ctx.font = 'bold 10px Helvetica';
            ctx.fillText(hutanVal.toFixed(1), xHutan + (bW / 2) - 1, yHutan - 5);

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

        const cats = ['hutan', 'tanah_kering', 'tanah_kosong', 'lahan_terbangun', 'air'];
        const colors = [COLORS.hutan, COLORS.tanah_kering, COLORS.tanah_kosong, COLORS.lahan_terbangun, COLORS.air];
        const fillColors = [
            '#10b981', // hutan
            '#f59e0b', // tanah_kering
            '#ea580c', // tanah_kosong
            '#708090', // lahan_terbangun
            '#3b82f6'  // air
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

            // Add Labels for Hutan at the top line
            if (catName === 'hutan') {
                data.forEach((d, idx) => {
                    const val = stackedData[idx][i];
                    const x = margin.left + (idx * stepX);
                    const y = margin.top + cH - (val / maxV) * cH;
                    ctx.fillStyle = '#000000';
                    ctx.font = 'bold 10px Helvetica';
                    ctx.textAlign = 'center';
                    ctx.fillText((d.hutan || 0).toFixed(1), x, y - 8);
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

export const generateAnalysisReport = async (item) => {
    const doc = new jsPDF();
    const pW = doc.internal.pageSize.width;
    const pH = doc.internal.pageSize.height;

    // --- FORMAL HEADER ---
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

    let y = 50;

    // --- DATASET IDENTITY ---
    doc.setTextColor(...COLORS.primary); doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("1. IDENTITAS DATASET", 15, y);
    y += 5;

    const shp = item.geo_data?.features?.[0]?.properties || {};

    // Build metadata rows from SHP properties
    // We filter out common internal/empty keys if needed, but for now we list all significant ones
    const metadataRows = Object.entries(shp)
        .filter(([key]) => key !== 'style') // Exclude style object if present
        .map(([key, val]) => [key, (val !== null && val !== undefined) ? String(val) : '-']);

    // If no metadata found, fallback to geometry type
    if (metadataRows.length === 0) {
        metadataRows.push(['Tipe Geometri', item.metadata?.geometry_type || 'Polygon']);
    }

    // Centroid Data
    const centroid = getCentroid(item.geo_data);
    const coordStr = centroid ? `${centroid.lat}, ${centroid.lng}` : '-';

    // Prepend standard info
    const identityBody = [
        ['Nama KPS/Wilayah', item.display_name || item.filename || '-'],
        ['Koordinat (Centroid)', coordStr],
        ['Tanggal Analisis', new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'medium' })],
        ...metadataRows
    ];

    autoTable(doc, {
        startY: y,
        body: identityBody,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', width: 40, textColor: COLORS.gray500 } }
    });
    y = doc.lastAutoTable.finalY + 15;

    // --- DATA SUMMARY ---
    if (item.analysis_results && item.analysis_results.length > 0) {
        doc.addPage();
        y = 20;
        doc.text("2. RINGKASAN DATA", 15, y);
        y += 8;

        const seriesBody = item.analysis_results.map(res => {
            const total = (res.hutan + res.tanah_kering + res.tanah_kosong + res.air + (res.lahan_terbangun || 0));
            return [
                res.year,
                res.hutan.toFixed(2),
                res.tanah_kering.toFixed(2),
                res.tanah_kosong.toFixed(2),
                (res.lahan_terbangun || 0).toFixed(2),
                res.air.toFixed(2),
                total.toFixed(2)
            ];
        });

        autoTable(doc, {
            startY: y,
            head: [['Tahun', 'Hutan (Ha)', 'T. Kering (Ha)', 'T. Kosong (Ha)', 'L. Terbangun (Ha)', 'Air (Ha)', 'Total (Ha)']],
            body: seriesBody,
            theme: 'striped',
            headStyles: { fillColor: COLORS.primary, textColor: 255 },
            styles: { fontSize: 8, cellPadding: 3, halign: 'center' },
            columnStyles: { 0: { fontStyle: 'bold' }, 6: { fontStyle: 'bold' } }
        });
        y = doc.lastAutoTable.finalY + 15;
    }

    // --- TREND ANALYSIS ---
    if (item.analysis_results.length > 1) {
        if (y > pH - 150) { doc.addPage(); y = 20; }
        doc.text("3. ANALISIS TREN PERUBAHAN", 15, y);
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
        y = doc.lastAutoTable.finalY + 8;

        y = doc.lastAutoTable.finalY + 12;

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
            ['Hutan', trendMetrics.hutan.start.toFixed(2), trendMetrics.hutan.end.toFixed(2), trendMetrics.hutan.diff.toFixed(2)],
            ['Tanah Kering', trendMetrics.tanah_kering.start.toFixed(2), trendMetrics.tanah_kering.end.toFixed(2), trendMetrics.tanah_kering.diff.toFixed(2)],
            ['Tanah Kosong', trendMetrics.tanah_kosong.start.toFixed(2), trendMetrics.tanah_kosong.end.toFixed(2), trendMetrics.tanah_kosong.diff.toFixed(2)],
            ['Lahan Terbangun', (trendMetrics.lahan_terbangun?.start || 0).toFixed(2), (trendMetrics.lahan_terbangun?.end || 0).toFixed(2), (trendMetrics.lahan_terbangun?.diff || 0).toFixed(2)],
            ['Air', trendMetrics.air.start.toFixed(2), trendMetrics.air.end.toFixed(2), trendMetrics.air.diff.toFixed(2)]
        ];

        autoTable(doc, {
            startY: y,
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
                    const isForest = data.row.index === 0;
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

    // --- YEARLY DETAILS ---
    for (let res of item.analysis_results) {
        doc.addPage();
        y = 20;
        doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.primary);
        doc.text(`4. DATA DETAIL PER TAHUN - TAHUN ${res.year}`, 15, y);
        y += 10;

        autoTable(doc, {
            startY: y,
            head: [['Hutan (Ha)', 'T. Kering (Ha)', 'T. Kosong (Ha)', 'Terbangun (Ha)', 'Air (Ha)']],
            body: [[res.hutan.toFixed(2), res.tanah_kering.toFixed(2), res.tanah_kosong.toFixed(2), (res.lahan_terbangun || 0).toFixed(2), res.air.toFixed(2)]],
            theme: 'plain',
            styles: { fontSize: 8.5, cellPadding: 3, halign: 'center', lineWidth: 0.1, lineColor: COLORS.gray100 },
            headStyles: { fillColor: COLORS.gray100, textColor: COLORS.gray500 }
        });

        y = doc.lastAutoTable.finalY + 15;

        // --- SINGLE MAP (Satellite Classification Image) ---
        const thumbUrl = res.thumb_url;
        let finalThumbUrl = thumbUrl;
        if (thumbUrl && thumbUrl.startsWith('/')) {
            finalThumbUrl = `${API_URL.replace(/\/api\/?$/, '')}${thumbUrl}`;
        }

        const mW = 180;
        const mH = 135;
        const mX = (pW - mW) / 2;

        if (finalThumbUrl) {
            try {
                const img = await loadImage(finalThumbUrl);
                if (img) {
                    doc.setDrawColor(...COLORS.gray100);
                    doc.rect(mX - 0.5, y - 0.5, mW + 1, mH + 1);
                    doc.addImage(img, 'PNG', mX, y, mW, mH);

                    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.gray700);
                    doc.text(`Citra Satelit & Klasifikasi GEE (Tahun ${res.year})`, pW / 2, y + mH + 9, { align: 'center' });
                    y += mH + 20;
                }
            } catch (e) {
                console.warn("Failed to add thumbnail to PDF:", e);
                // Fallback text if image fails
                doc.setFontSize(8); doc.setTextColor(...COLORS.gray500);
                doc.text("[Gambar Citra GEE Tidak Tersedia]", pW / 2, y + 20, { align: 'center' });
                y += 30;
            }
        }

        // --- LEGEND (Styled) - Bottom Anchor for the year page ---
        doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...COLORS.gray500);
        const legendItems = [
            { label: "Hutan", color: [34, 139, 34] },
            { label: "Tanah Kering", color: [218, 165, 32] },
            { label: "Tanah Terbuka", color: [210, 105, 30] },
            { label: "Lahan Terbangun", color: [112, 128, 144] },
            { label: "Badan Air", color: [30, 144, 255] }
        ];

        let legX = 35;
        legendItems.forEach(item => {
            doc.setFillColor(...item.color);
            doc.rect(legX, y, 4, 4, 'F');
            doc.text(item.label, legX + 6, y + 3);
            legX += 30;
        });
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
