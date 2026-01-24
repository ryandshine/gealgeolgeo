
import React from 'react';
import { FileText, Calendar, ChevronRight, BarChart3, Trash2, Clock, Database, Map as MapIcon, Image as ImageIcon, Info, RefreshCw, FileDown, Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Search, X, Grid, Leaf } from 'lucide-react';
import { generateAnalysisReport } from './utils/pdfGenerator';
import { calculateTrends, generateVerbalNarrative } from './utils/analysisUtils';
import { API_URL, LAND_COVER_CONFIG } from './constants';

// Konfigurasi Warna untuk Preview Vektor
const COLORS = {
    1: "#228B22",  // Hutan
    2: "#DAA520",  // Tanah Kering
    3: "#D2691E",  // Tanah Kosong
    4: "#1E90FF"   // Air
};

const GeoJSONThumbnail = ({ data, width = 60, height = 60, fallbackColor = '#cccccc' }) => {
    const canvasRef = React.useRef(null);

    React.useEffect(() => {
        if (!data || !data.features || !canvasRef.current) return;

        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, width, height);

        // 1. Calculate Bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        const processCoords = (coords) => {
            if (typeof coords[0] === 'number') {
                const [x, y] = coords;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            } else {
                coords.forEach(processCoords);
            }
        };

        data.features.forEach(f => processCoords(f.geometry.coordinates));

        if (!isFinite(minX)) return; // Empty or invalid

        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        const scale = Math.min(width / rangeX, height / rangeY) * 0.9; // 90% fill

        const offsetX = (width - rangeX * scale) / 2;
        const offsetY = (height - rangeY * scale) / 2;

        // 2. Draw
        data.features.forEach(f => {
            // Priority: Feature specific class -> Fallback dominant color -> Default grey
            // Try to parse class if it's a string, or lookup directly
            const featureClass = f.properties.class || f.properties.gridcode || f.properties.DN;
            let fillStyle = fallbackColor;

            if (featureClass) {
                fillStyle = COLORS[Number(featureClass)] || COLORS[featureClass] || fallbackColor;
            }

            ctx.fillStyle = fillStyle;
            ctx.beginPath();

            const drawPoly = (rings) => {
                rings.forEach((ring) => {
                    ring.forEach(([x, y], i) => {
                        // Flip Y because Canvas Y is down, Geo Y is up (Latitude)
                        const px = (x - minX) * scale + offsetX;
                        const py = (maxY - y) * scale + offsetY;
                        if (i === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    });
                    ctx.closePath();
                });
            };

            if (f.geometry.type === 'Polygon') {
                drawPoly(f.geometry.coordinates);
            } else if (f.geometry.type === 'MultiPolygon') {
                f.geometry.coordinates.forEach(poly => drawPoly(poly));
            }

            ctx.fill();
        });

    }, [data, width, height, fallbackColor]);

    return <canvas ref={canvasRef} width={width} height={height} className="rounded-lg bg-slate-100/50 border border-slate-200" />;
};

const HistoryDashboard = ({ history, loading, onSelect, isSidebarOpen, onDelete, onReanalyze, onUpdateItem, onOpenCarbonMode }) => {

    // Helper Analisa Verbal
    const renderVerbalAnalysis = (trendData) => {
        const result = generateVerbalNarrative(trendData);
        if (!result) return null;

        const { status, highlight } = result;

        const colors = {
            error: 'text-red-500',
            success: 'text-emerald-500',
            warning: 'text-orange-500',
            info: 'text-slate-500'
        };

        const icons = {
            error: <AlertTriangle size={12} />,
            success: <CheckCircle2 size={12} />,
            warning: <AlertTriangle size={12} />,
            info: <Info size={12} />
        };

        return (
            <div className={`mt-3 pt-2 border-t border-slate-50 flex flex-col gap-1`}>
                <div className={`flex items-center gap-1.5 text-[9px] font-bold ${colors[status.type]}`}>
                    {icons[status.type]} {status.text.toUpperCase()}
                </div>
                {highlight && <div className="text-[10px] leading-tight text-slate-500 italic">"{highlight}"</div>}
            </div>
        );
    };

    if (loading) {
        return (
            <div className={`p-8 w-full max-w-7xl mx-auto transition-all duration-500 ${isSidebarOpen ? 'md:pl-80' : ''}`}>
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-slate-200 rounded w-1/4"></div>
                    <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                    <div className="space-y-3 mt-8">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-slate-50 rounded-xl border border-slate-100"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!history || history.length === 0) {
        return (
            <div className={`flex flex-col items-center justify-center min-h-[60vh] text-slate-400 p-8 transition-all duration-500 ${isSidebarOpen ? 'md:pl-80' : ''}`}>
                <div className="bg-slate-50 p-6 rounded-full mb-4 animate-pulse">
                    <Database size={48} className="text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-600">Belum Ada Riwayat Analisis</h3>
                <p className="text-sm max-w-md text-center mt-2 text-slate-400">
                    Mulai analisis baru dengan mengunggah file SHP/GeoJSON untuk melihat rekam jejak perubahan tutupan lahan di sini.
                </p>
            </div>
        );
    }

    const [generatingPdfId, setGeneratingPdfId] = React.useState(null);
    const [regeneratingVisualsId, setRegeneratingVisualsId] = React.useState(null);
    const [searchTerm, setSearchTerm] = React.useState("");
    const [deleteConfirmId, setDeleteConfirmId] = React.useState(null);
    const [selectedImage, setSelectedImage] = React.useState(null); // Lightbox State

    const filteredHistory = React.useMemo(() => {
        if (!searchTerm) return history;
        return history.filter(item =>
            item.filename.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [history, searchTerm]);

    const handleRegenerateVisuals = async (e, item) => {
        e.stopPropagation();
        setRegeneratingVisualsId(item.id);
        try {
            const response = await fetch(`${API_URL}/history/${item.id}/regenerate-visuals`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error("Gagal mengambil ulang thumbnail");
            }

            const result = await response.json();
            if (result.status === 'success' && result.data) {
                if (onUpdateItem) onUpdateItem(result.data);
                // Notification simulation (optional)
                console.log("Visuals refreshed successfully");
            }
        } catch (error) {
            console.error("Refresh Visuals Error:", error);
            alert("Gagal memperbarui thumbnail: " + error.message);
        } finally {
            setRegeneratingVisualsId(null);
        }
    };

    const handleDownloadPdf = async (e, item) => {
        e.stopPropagation();
        setGeneratingPdfId(item.id);

        let itemToPrint = item;

        try {
            // 1. Cek kelengkapan data visual (Vector GeoJSON atau Thumb URL)
            // Jika vector_geojson kosong, atau thumb_url masih link sementara (bukan base64/permanent)
            const needsRepair = item.analysis_results.some(r =>
                !r.vector_geojson ||
                !r.thumb_url ||
                (r.thumb_url && r.thumb_url.includes('googleapis.com') && !r.thumb_url.startsWith('data:'))
            );

            if (needsRepair) {
                console.log("Repairing visual data for PDF...");
                // Tampilkan toast/alert non-blocking jika mau, tapi spinner di tombol sudah cukup informatif

                const response = await fetch(`${API_URL}/history/${item.id}/regenerate-visuals`, {
                    method: 'POST'
                });

                if (!response.ok) {
                    console.warn("Auto-repair failed, trying to generate with existing data...");
                    // Jangan throw error, coba generate saja dengan data seadanya
                } else {
                    const result = await response.json();
                    if (result.status === 'success' && result.data) {
                        itemToPrint = result.data;
                        console.log("Data repaired successfully:", itemToPrint);
                        if (onUpdateItem) onUpdateItem(itemToPrint);
                    }
                }
            }

            await generateAnalysisReport(itemToPrint);
        } catch (error) {
            console.error("PDF Generate Error:", error);
            alert("Gagal membuat PDF: " + error.message);
        } finally {
            setGeneratingPdfId(null);
        }
    };

    const handleExportExcel = async (e, item) => {
        e.stopPropagation();
        try {
            const response = await fetch(`${API_URL}/history/${item.id}/export-excel`);
            if (!response.ok) throw new Error('Gagal mendownload excel');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `GealGeolGeo_Stats_${item.filename.replace('.shp', '')}_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            console.error("Export Error:", err);
            alert("Gagal mengekspor data Excel");
        }
    };

    // Helper Format File Size
    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(0)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    return (
        <>
            <div style={{
                backgroundImage: `linear-gradient(rgba(6, 78, 59, 0.85), rgba(15, 23, 42, 0.95)), url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/6/10')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed'
            }} className={`relative z-10 pt-28 pb-8 px-4 md:pt-32 md:pb-8 md:px-8 w-full max-w-[100vw] 2xl:max-w-7xl mx-auto transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isSidebarOpen ? 'ml-96 w-[calc(100%-24rem)]' : 'w-full'} h-screen overflow-y-auto overflow-x-hidden`}>
                {/* ... existing content ... */}

                {/* Header Section */}
                <div className="bg-gradient-to-r from-white to-emerald-50/30 backdrop-blur-md rounded-2xl p-4 md:p-6 shadow-xl border border-white/20 mb-6 md:mb-8 flex flex-col md:flex-row items-center md:items-start gap-4 ring-1 ring-slate-900/5">
                    <div className="flex items-start gap-4 self-start md:self-auto">
                        <div className="p-2.5 md:p-3 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/30">
                            <Database size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-tight">Riwayat Analisis</h2>
                            <p className="text-slate-500 text-[10px] md:text-sm mt-0.5 md:mt-1">
                                Database hasil analisis tutupan lahan historis.
                            </p>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="w-full md:flex-1 md:max-w-md md:ml-8 relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={14} className="md:w-4 md:h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="Cari file atau dataset..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-9 md:pl-10 pr-10 py-2 md:py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-inner"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm("")}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="bg-slate-800 text-white px-3 md:px-4 py-1 md:py-1.5 rounded-full text-[9px] md:text-xs font-bold font-mono border border-slate-700 shadow-sm shrink-0 self-end md:self-auto">
                        {filteredHistory.length} DATASETS
                    </div>
                </div>

                {/* NEW LAYOUT: MODERN CARD GRID (Mobile Optimized) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-24 animate-in fade-in duration-500">
                    {filteredHistory.map((item) => {
                        // Logic Extract Last Year Data & Total & Trend
                        const latestData = item.analysis_results && item.analysis_results.length > 0
                            ? item.analysis_results[item.analysis_results.length - 1]
                            : null;

                        const firstData = item.analysis_results && item.analysis_results.length > 0
                            ? item.analysis_results[0]
                            : null;

                        const totalArea = latestData
                            ? (
                                (Number(latestData.hutan_primer) || 0) +
                                (Number(latestData.hutan_sekunder) || 0) +
                                (Number(latestData.tanah_kering) || 0) +
                                (Number(latestData.tanah_kosong) || 0) +
                                (Number(latestData.air) || 0) +
                                (Number(latestData.lahan_terbangun) || 0)
                            )
                            : 0;

                        // Calculate Trend using Utility
                        const trendData = calculateTrends(item.analysis_results);
                        const { trends = {}, trendInfo = {} } = trendData || {};

                        // Extract SHP Properties for Tooltip (not shown in card body to save space)
                        const shpProperties = item.geo_data?.features?.[0]?.properties || {};
                        const propertyKeys = Object.keys(shpProperties).slice(0, 3);

                        // Find most dominant class
                        let dominantClassName = 'Hutan';
                        let maxArea = 0;
                        if (latestData) {
                            const classMap = {
                                'hutan_primer': 'Hutan Primer',
                                'hutan_sekunder': 'Hutan Sekunder',
                                'tanah_kering': 'Kering',
                                'tanah_kosong': 'Kosong',
                                'air': 'Air',
                                'lahan_terbangun': 'Urban'
                            };
                            Object.entries(classMap).forEach(([key, label]) => {
                                const area = latestData[key] || 0;
                                if (area > maxArea) {
                                    maxArea = area;
                                    dominantClassName = label;
                                }
                            });
                        }

                        // Extract Vector for Thumbnail
                        const vectorData = latestData?.vector_geojson || item.geo_data;

                        return (
                            <div key={item.id} className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col relative touch-manipulation">
                                {/* Card Header: File Info */}
                                <div className="p-3.5 md:p-4 flex items-start gap-3 border-b border-slate-100 bg-slate-50/50">
                                    <div className="p-2.5 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 group-hover:text-emerald-500 group-hover:border-emerald-200 transition-colors">
                                        <FileText size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-slate-800 text-sm truncate mb-1" title={item.filename}>
                                            {item.filename}
                                        </h3>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                                            <span className="flex items-center gap-1">
                                                <Calendar size={10} />
                                                {new Date(item.created_at).toLocaleString('id-ID', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit'
                                                })}
                                            </span>
                                            <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                                            <span>{formatFileSize(item.file_size)}</span>
                                        </div>
                                    </div>
                                    {/* Trend Badge (Top Right) */}
                                    <div className="flex flex-col items-end gap-1.5 ml-auto">
                                        {item.analysis_results.length > 1 && (
                                            <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${trendInfo.color || 'bg-slate-100 text-slate-500'}`}>
                                                {trendInfo.label}
                                            </div>
                                        )}
                                        <div className="px-2 py-0.5 rounded bg-amber-50 border border-amber-100 text-[8px] font-bold text-amber-700 uppercase tracking-tighter shadow-sm">
                                            Dominan: {dominantClassName}
                                        </div>
                                    </div>
                                </div>

                                {/* Card Body: Time Series Map Thumbnails */}
                                <div className="bg-slate-50 border-b border-slate-100 p-3">
                                    <div className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span>Time Series ({item.analysis_results.length} Tahun)</span>
                                            <button
                                                onClick={(e) => handleRegenerateVisuals(e, item)}
                                                disabled={regeneratingVisualsId === item.id}
                                                className={`p-1 rounded hover:bg-slate-200 transition-colors ${regeneratingVisualsId === item.id ? 'animate-spin text-emerald-600' : 'text-slate-400 hover:text-emerald-600'}`}
                                                title="Ambil ulang thumbnail dari GEE"
                                            >
                                                <RefreshCw size={10} />
                                            </button>
                                        </div>
                                        <span className="text-[9px] font-normal italic opacity-70">Deslice untuk melihat &rarr;</span>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                                        {item.analysis_results && item.analysis_results.length > 0 ? (
                                            item.analysis_results.map((res, idx) => {
                                                // Ultra-permissive check: Just ensure it's a string longer than 5 chars
                                                const isValidThumb = res.thumb_url && res.thumb_url.length > 5;

                                                // Use vector_geojson from year data, or fallback to parent geo_data
                                                const geoData = res.vector_geojson || item.geo_data;

                                                // Determine dominant color from stats - ALWAYS calculate this if stats exist
                                                let dominantColor = '#94a3b8'; // default slate-400
                                                if (res.stats) {
                                                    const hutan = (res.stats.hutan || res.stats.luas_hutan_ha || 0);
                                                    const nonHutan = (res.stats.non_hutan || res.stats.luas_non_hutan_ha || 0) +
                                                        (res.stats.tanah_terbuka || res.stats.luas_tanah_terbuka_ha || 0);
                                                    // Simple dominance: Forest vs Non-Forest
                                                    dominantColor = hutan >= nonHutan ? '#10b981' : '#f59e0b'; // Emerald (Forest) vs Amber (Non-Forest/Dry)
                                                }

                                                return (
                                                    <div key={idx} className="shrink-0 relative group/thumb cursor-zoom-in"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const fullUrl = res.thumb_url.startsWith('/') ? `${API_URL.replace(/\/api\/?$/, '')}${res.thumb_url}` : res.thumb_url;
                                                            setSelectedImage({
                                                                url: fullUrl,
                                                                title: `Visualisasi Tahun ${res.year}`,
                                                                subtitle: `${item.filename} - Analisis Tutupan Lahan`
                                                            });
                                                        }}
                                                    >
                                                        <div className="w-20 h-20 rounded-lg bg-white border border-slate-200 shadow-sm overflow-hidden relative group-hover/thumb:border-emerald-400 group-hover/thumb:shadow-md transition-all">
                                                            {isValidThumb ? (
                                                                <img
                                                                    src={res.thumb_url.startsWith('/') ? `${API_URL.replace(/\/api\/?$/, '')}${res.thumb_url}` : res.thumb_url}
                                                                    alt={res.year}
                                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-110"
                                                                />
                                                            ) : geoData ? (
                                                                <div className="w-full h-full p-1 opacity-80 group-hover/thumb:opacity-100 transition-opacity">
                                                                    <GeoJSONThumbnail
                                                                        data={geoData}
                                                                        width={80}
                                                                        height={80}
                                                                        fallbackColor={dominantColor}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="w-full h-full flex flex-col items-center justify-center text-[8px] text-slate-300 bg-slate-50">
                                                                    <ImageIcon size={14} className="mb-0.5 opacity-50" />
                                                                    No Img
                                                                </div>
                                                            )}

                                                            {/* Zoom Icon Overlay */}
                                                            <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/10 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-all">
                                                                <RefreshCw size={12} className="text-white drop-shadow-md rotate-45" />
                                                            </div>

                                                            {/* Year Overlay */}
                                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-4 flex justify-between items-end">
                                                                <span className="text-[10px] font-bold text-white leading-none">{res.year}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="w-full h-20 flex items-center justify-center text-slate-400 text-xs italic bg-slate-100 rounded-lg border border-dashed border-slate-200">
                                                Belum ada data analisis
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Card Stats: Mini List */}
                                <div className="p-3.5 md:p-4 space-y-2 flex-1">
                                    {/* Total Area Header */}
                                    <div className="flex items-center justify-between text-[11px] pb-2 border-b border-slate-100 mb-2">
                                        <div className="flex items-center gap-1.5 text-slate-500 font-bold uppercase tracking-wider">
                                            <MapIcon size={12} />
                                            <span>Total Wilayah</span>
                                        </div>
                                        <span className="font-mono font-black text-slate-800 text-xs">{totalArea.toFixed(1)} Ha</span>
                                    </div>

                                    {['hutan_primer', 'hutan_sekunder', 'tanah_kering', 'tanah_kosong', 'air', 'lahan_terbangun'].map((key, idx) => {
                                        const labels = {
                                            hutan_primer: 'Hutan Primer',
                                            hutan_sekunder: 'Hutan Sekunder',
                                            tanah_kering: 'Kering',
                                            tanah_kosong: 'Kosong',
                                            air: 'Air (Sungai/Danau)',
                                            lahan_terbangun: 'Lahan Terbangun (Urban)'
                                        };
                                        const colors = {
                                            hutan_primer: 'bg-emerald-800',
                                            hutan_sekunder: 'bg-emerald-500',
                                            tanah_kering: 'bg-amber-400',
                                            tanah_kosong: 'bg-orange-600',
                                            air: 'bg-blue-500',
                                            lahan_terbangun: 'bg-slate-500'
                                        };
                                        const val = latestData?.[key] || 0;

                                        // Bersihkan tampilan: Sembunyikan jika 0, KECUALI untuk kategori utama (Hutan, Air, Urban)
                                        const isMainCategory = ['hutan_primer', 'hutan_sekunder', 'air', 'lahan_terbangun'].includes(key);
                                        if (val <= 0 && !isMainCategory) return null;

                                        const pct = totalArea ? (val / totalArea * 100).toFixed(1) : 0;

                                        // Trend indicators
                                        const t = trends[key];
                                        let trendEl = null;
                                        if (t && Math.abs(t.diff) > 0.1) {
                                            trendEl = (
                                                <span className={`text-[9px] font-bold ${t.diff > 0 ? 'text-emerald-500' : 'text-red-500'} flex items-center`}>
                                                    {t.diff > 0 ? <TrendingUp size={10} className="mr-0.5" /> : <TrendingDown size={10} className="mr-0.5" />}
                                                    {Math.abs(t.pct)}%
                                                </span>
                                            );
                                        }

                                        return (
                                            <div key={key} className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${colors[key]}`}></div>
                                                        <span className="text-slate-600 font-medium">{labels[key]}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {trendEl}
                                                        <span className="font-mono font-bold text-slate-700">{val.toFixed(1)} Ha</span>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${colors[key]} transition-all duration-1000 ease-out`}
                                                        style={{ width: `${pct}%`, transitionDelay: `${idx * 100}ms` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* Narrative Analysis Section (Restored) */}
                                    {item.analysis_results.length > 1 && (
                                        <div className="mt-3 pt-3 border-t border-slate-100">
                                            {renderVerbalAnalysis(trendData)}
                                        </div>
                                    )}
                                </div>

                                {/* Card Footer: Actions */}
                                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                                    <button
                                        onClick={() => onSelect(item)}
                                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold uppercase tracking-wider py-2 rounded-lg transition-all shadow-lg shadow-slate-900/10 active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        Buka <ChevronRight size={12} />
                                    </button>

                                    <button
                                        onClick={(e) => handleDownloadPdf(e, item)}
                                        disabled={generatingPdfId === item.id}
                                        className="px-3 py-2 bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 text-slate-600 rounded-lg transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                        title="Download PDF"
                                    >
                                        {generatingPdfId === item.id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                                    </button>

                                    <button
                                        onClick={(e) => handleExportExcel(e, item)}
                                        className="px-3 py-2 bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 text-slate-600 rounded-lg transition-all shadow-sm active:scale-95"
                                        title="Export ke Excel (.xlsx)"
                                    >
                                        <Grid size={14} />
                                    </button>

                                    {/* Hide Delete Button per user request
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteConfirmId(item.id);
                                        }}
                                        className="px-3 py-2 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-400 rounded-lg transition-all shadow-sm active:scale-95"
                                        title="Hapus Riwayat"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                    */}

                                    {/* Carbon Time-Series Button */}
                                    {item.analysis_results && onOpenCarbonMode && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenCarbonMode(item.id, item.filename);
                                            }}
                                            className="px-3 py-2 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 text-emerald-600 rounded-lg transition-all shadow-sm active:scale-95"
                                            title="Analisis Karbon Time-Series (Indikatif)"
                                        >
                                            <Leaf size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Delete Confirmation Modal */}
                {deleteConfirmId && (
                    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-300">
                            <div className="p-6 text-center">
                                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertTriangle size={32} />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 mb-2">Hapus Riwayat?</h3>
                                <p className="text-sm text-slate-500 mb-6">
                                    Tindakan ini tidak dapat dibatalkan. Seluruh data analisis dan visualisasi untuk file ini akan dihapus permanen.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setDeleteConfirmId(null)}
                                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all active:scale-95"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        onClick={() => {
                                            onDelete(deleteConfirmId);
                                            setDeleteConfirmId(null);
                                        }}
                                        className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/30 transition-all active:scale-95"
                                    >
                                        Ya, Hapus
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}


            </div >
            {/* --- LIGHTBOX MODAL --- */}
            {
                selectedImage && (
                    <div
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-200"
                        style={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)' }}
                        onClick={() => setSelectedImage(null)}
                    >
                        <div
                            className="relative max-w-5xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 transform"
                            onClick={e => e.stopPropagation()}
                        >
                            <img
                                src={selectedImage.url}
                                alt="Zoom View"
                                className="w-full h-auto max-h-[75vh] object-contain bg-slate-100"
                            />
                            <div className="p-6 bg-white flex items-center justify-between border-t border-slate-100">
                                <div>
                                    <h3 className="text-xl font-extrabold text-slate-800">{selectedImage.title}</h3>
                                    <p className="text-sm text-slate-500 font-medium">{selectedImage.subtitle}</p>
                                </div>
                                <button
                                    onClick={() => setSelectedImage(null)}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-3 rounded-full transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
        </>
    );
};

export default HistoryDashboard;
