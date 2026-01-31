import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Upload, BarChart3, ChevronUp, ChevronDown, ChevronLeft, ArrowLeft, Layers, Activity, AlertCircle, Satellite, Download, RefreshCw, Calendar, Eye, EyeOff, Sliders, MapPin, Grid, History, ArrowRight, TrendingDown, TrendingUp, CheckCircle2, Info, Sparkles, FileText, Database, Split, Menu, X, Trash2, PenTool, RotateCcw, Eraser, ShieldCheck, List, Maximize, Flame, Image as ImageIcon, Map as MapIcon, Terminal, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, AreaChart, Area, ReferenceLine, LabelList } from 'recharts';
import { MapContainer, TileLayer, GeoJSON, ImageOverlay, Marker, Popup, useMap, useMapEvents, WMSTileLayer, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    calculateTrends,
    generateVerbalNarrative,
    fetchTemporalStatus,
    getOpacityByTemporalStatus,
    getTemporalStatusStyle,
    createYearOpacityMap
} from './utils/analysisUtils';
import HistoryDashboard from './HistoryDashboard';
import AttributeTag from './AttributeTag';
import CalibrationPanel from './CalibrationPanel';
import { DynamicTileLayer, SwipeMapControl, MapRecenter, IdentifySigapFeatures } from './MapComponents';
import { LAND_COVER_CONFIG, MAP_TILES, CALIBRATION_DEFAULTS, SIGAP_CONFIG, NASA_FIRMS_CONFIG, API_URL } from './constants';


// Helper for Enhanced Floating Badge Icon - Color aware
const createPinIcon = (label, color = '#10b981') => L.divIcon({
    html: `
        <div style="display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25)); transition: all 0.3s ease;">
            <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(8px); border: 2px solid ${color}; padding: 6px 12px; border-radius: 99px; display: flex; align-items: center; gap: 8px; white-space: nowrap; transform: translateY(-5px);">
                <div style="width: 8px; height: 8px; background: ${color}; border-radius: 50%; box-shadow: 0 0 8px ${color};"></div>
                <span style="font-family: 'IBM Plex Sans', sans-serif; font-size: 10px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em;">${label.length > 20 ? label.substring(0, 18) + '...' : label}</span>
            </div>
            <div style="width: 2px; height: 10px; background: linear-gradient(to bottom, ${color}, transparent);"></div>
            <div style="width: 6px; height: 6px; background: ${color}; border-radius: 50%; border: 2px solid white;"></div>
        </div>
    `,
    className: 'custom-pin-enhanced',
    iconSize: [150, 50],
    iconAnchor: [75, 45],
    popupAnchor: [0, -45]
});

// Helper to resolve thumbnail URL (handle relative paths from VPS storage)
const resolveThumbUrl = (url) => {
    if (!url) return null;

    try {
        if (url.startsWith('/')) {
            // Remove trailing /api if present in API_URL to get server root
            const root = API_URL.replace(/\/api\/?$/, '');
            const fullUrl = `${root}${url}`;
            console.debug(`[Thumbnail] Resolved local path: ${url} → ${fullUrl.substring(0, 80)}...`);
            return fullUrl;
        }

        // Absolute URL (Supabase or external)
        console.debug(`[Thumbnail] Using absolute URL: ${url.substring(0, 80)}...`);
        return url;
    } catch (e) {
        console.error(`[Thumbnail] Failed to resolve URL: ${url}`, e);
        return url; // Return original as fallback
    }
};

// Component to auto-zoom map to fit all history pin
const MapAutoFitAll = ({ items, active }) => {
    const map = useMap();
    const hasInteracted = useRef(false);
    const lastActive = useRef(active);

    useEffect(() => {
        const onInteraction = () => {
            if (active && !hasInteracted.current) {
                console.log('📍 MapAutoFitAll: Manual Interaction detected - Freezing Auto-fit');
                hasInteracted.current = true;
            }
        };
        map.on('movestart', onInteraction);
        map.on('zoomstart', onInteraction);
        return () => {
            map.off('movestart', onInteraction);
            map.off('zoomstart', onInteraction);
        };
    }, [map, active]);

    useEffect(() => {
        // Reset interaction flag when entering this mode
        if (active && !lastActive.current) {
            console.log('🚩 MapAutoFitAll: Entering Global Mode - Resetting interaction flag');
            hasInteracted.current = false;
        }
        lastActive.current = active;

        if (!active) return;
        if (hasInteracted.current) {
            console.log('🚫 MapAutoFitAll: Auto-fit skipped due to user interaction');
            return;
        }

        console.log('📐 MapAutoFitAll: Performing auto-fit for items:', items?.length);
        // Forced Global View for Indonesia if no data
        if (!items || items.length === 0) {
            map.setView([-2.5, 118.0], 5);
            return;
        }

        try {
            const bounds = L.latLngBounds([]);
            items.forEach(item => {
                if (item.geo_data) {
                    const layer = L.geoJSON(item.geo_data);
                    bounds.extend(layer.getBounds());
                }
            });
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [100, 100], maxZoom: 15 });
            } else {
                // Fallback to Indonesia if bounds invalid
                map.setView([-2.5, 118.0], 5);
            }
        } catch (e) {
            console.error("Error fitting bounds:", e);
            map.setView([-2.5, 118.0], 5);
        }
    }, [items, active, map]);
    return null;
};

// Component to handle map interaction (clicking map to close sidebar and reset view)
const MapClickHandler = ({ onMapClick }) => {
    useMapEvents({
        click: (e) => {
            onMapClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
};

// Component to fit map to specific geoData when triggered
const MapFitToGeoData = ({ geoData, trigger, onComplete }) => {
    const map = useMap();
    useEffect(() => {
        if (!trigger || !geoData) return;
        try {
            const bounds = L.geoJSON(geoData).getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
            }
        } catch (e) {
            console.error("Error fitting to geoData:", e);
        }
        if (onComplete) onComplete();
    }, [trigger, geoData, map, onComplete]);
    return null;
};



// Component to fetch and display SIGAP Legend (Content Only)
const SigapLegend = ({ activeLayers }) => {
    // Hardcoded legend data from SIGAP MenLHK
    const legends = {
        hutan: [
            { label: "Kawasan Konservasi", imageData: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADFJREFUOI1jYaAyYKGZgWsd/v+nxKDgA4yMKAZSC4waOGrgqIGjBtLZQFh5RjUDqQUADwwFZqlOkpkAAAAASUVORK5CYII=" },
            { label: "Kawasan Konservasi Laut", imageData: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADtJREFUOI1jYaAyYKGZgUcZ/v+n1DBrBkZGFnQBcg2DOYh2Xh41cNTAUQNHDcRpICVlIqzoY0EXoBQAAAYYCY5FPBkxAAAAAElFTkSuQmCC" },
            { label: "Hutan Lindung", imageData: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADFJREFUOI1jYaAyYKGZgd7PGP5TYtBWKQZGFAOpBUYNHDVw1MBRA+lsIKw8o5qB1AIAUF0EIe0x2PgAAAAASUVORK5CYII=" },
            { label: "Hutan Produksi Tetap", imageData: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADFJREFUOI1jYaAyYKGZgf//F/+nxCBGxl5GFAOpBUYNHDVw1MBRA+lsIKw8o5qB1AIA4GcE4cex7cIAAAAASUVORK5CYII=" },
            { label: "Hutan Produksi Terbatas", imageData: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADFJREFUOI1jYaAyYKGZgYv/F/+nxKBYxl5GFAOpBUYNHDVw1MBRA+lsIKw8o5qB1AIAAHIFPSnmSA8AAAAASUVORK5CYII=" },
            { label: "Hutan Produksi yang dapat di Konversi", imageData: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADFJREFUOI1jYaAyYKGZgV+rqv5TYhB3WxsjioHUAqMGjho4auCogXQ2EFaeUc1AagEAD0cFacuS3RcAAAAASUVORK5CYII=" },
            { label: "Area Penggunaan Lain", imageData: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADFJREFUOI1jYaAyYKGZgf////9PiUGMjIyMKAZSC4waOGrgqIGjBtLZQFh5RjUDqQUAsNMEVanlzFgAAAAASUVORK5CYII=" },
            { label: "Tubuh Air", imageData: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAC9JREFUOI1jYaAyYKGdgUf//6fIJGtGRlQDqQRGDRw1cNTAUQPpbSC0PKOegVQCABsfA45ok6wHAAAAAElFTkSuQmCC" }
        ],
        das: [
            { label: "DIPERTAHANKAN", imageData: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADlJREFUOI1jYaAyYKGdgTHP/lNs2hIpRhZ0AbINgzqIhl4eNXDUwFEDRw3EaSAlZSK06GNBF6AUAAAESgoQTaKQNwAAAABJRU5ErkJggg==" },
            { label: "DIPULIHKAN", imageData: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADpJREFUOI1jYaAyYKGZgc8YGP5TapgUAwMjC7oAuYbBHEQ7L48aOGrgqIGjBuI0kJIyEVb0saALUAoAtN4GbMznZ4gAAAAASUVORK5CYII=" }
        ]
    };

    if (!activeLayers.hutan && !activeLayers.das) return null;

    return (
        <div className="flex flex-col gap-3">
            {activeLayers.hutan && (
                <div>
                    <div className="text-[10px] font-bold text-emerald-700 mb-1.5 uppercase tracking-tight">Kawasan Hutan</div>
                    <div className="flex flex-col gap-1">
                        {legends.hutan.map((item, idx) => (
                            <div key={`hutan-${idx}`} className="flex items-center gap-2">
                                <img src={`data:image/png;base64,${item.imageData}`} alt="" className="w-4 h-4 object-contain" />
                                <span className="text-[10px] text-slate-600 leading-normal">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeLayers.das && (
                <div>
                    <div className="text-[10px] font-bold text-blue-700 mb-1.5 uppercase tracking-tight">Daerah Aliran Sungai (DAS)</div>
                    <div className="flex flex-col gap-1">
                        {legends.das.map((item, idx) => (
                            <div key={`das-${idx}`} className="flex items-center gap-2">
                                <img src={`data:image/png;base64,${item.imageData}`} alt="" className="w-4 h-4 object-contain" />
                                <span className="text-[10px] text-slate-600 leading-normal">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// 🔄 TEMPORAL STATUS LEGEND COMPONENT (NEW)
const TemporalStatusLegend = ({ show }) => {
    if (!show) return null;

    return (
        <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="text-[10px] font-bold text-amber-700 mb-1.5 uppercase tracking-tight">Status Perubahan Tutupan</div>
            <div className="flex flex-col gap-1.5">
                {[
                    { status: 'stable', label: 'Stabil', opacity: 1.0 },
                    { status: 'transition_confirmed', label: 'Terkonfirmasi', opacity: 1.0 },
                    { status: 'transition_unconfirmed', label: 'Belum Terkonfirmasi (Grey Area)', opacity: 0.5 },
                    { status: 'reverted_noise', label: 'Noise/Musiman', opacity: 0.3 }
                ].map(item => {
                    const style = getTemporalStatusStyle(item.status);
                    return (
                        <div key={item.status} className="flex items-center gap-2">
                            <div
                                className="w-3.5 h-3.5 rounded-sm shadow-sm"
                                style={{
                                    backgroundColor: style.color,
                                    opacity: item.opacity,
                                    border: '1px solid rgba(0,0,0,0.15)'
                                }}
                            />
                            <span className="text-[10px] text-slate-600 leading-normal">{item.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
// END TEMPORAL STATUS LEGEND

// Component to display Slope legend (Raster from GEE)
const SlopeLegend = ({ show }) => {
    if (!show) return null;

    const slopeClasses = [
        { label: "Datar (0-8%)", color: "#31a354" },
        { label: "Landai (8-15%)", color: "#addd8e" },
        { label: "Agak Curam (15-25%)", color: "#fee391" },
        { label: "Curam (25-40%)", color: "#fec44f" },
        { label: "Sangat Curam (40-60%)", color: "#ec7014" },
        { label: "Ekstrem (>60%)", color: "#662506" }
    ];

    return (
        <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="text-[10px] font-bold text-orange-700 mb-1.5 uppercase tracking-tight">Kelerengan (Slope)</div>
            <div className="flex flex-col gap-1.5">
                {slopeClasses.map((item, idx) => (
                    <div key={`slope-${idx}`} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded shadow-sm" style={{ backgroundColor: item.color }} />
                        <span className="text-[10px] text-slate-600 leading-normal">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Component to display Slope numerical summary in analysis dashboard
const SlopeDataPanel = ({ summary, title, variant = 'inside' }) => {
    if (!summary) return null;

    // KLHK Standard Classification (DB columns: slope_25_40 = 25-45%, slope_above_40 = >45%)
    const stats = [
        { label: "Datar (0-8%)", value: summary.slope_0_8, color: "bg-[#31a354]" },
        { label: "Landai (8-15%)", value: summary.slope_8_15, color: "bg-[#addd8e]" },
        { label: "Agak Curam (15-25%)", value: summary.slope_15_25, color: "bg-[#fee391]" },
        { label: "Curam (25-45%)", value: summary.slope_25_40, color: "bg-[#fec44f]" },
        { label: "Sangat Curam (>45%)", value: summary.slope_above_40, color: "bg-[#cc4c02]" }
    ];

    const totalArea = stats.reduce((acc, s) => acc + (Number(s.value) || 0), 0);
    const isOutside = variant === 'outside';
    const bgColor = isOutside ? 'bg-blue-100' : 'bg-orange-100';
    const textColor = isOutside ? 'text-blue-600' : 'text-orange-600';
    const badgeBg = isOutside ? 'bg-blue-50' : 'bg-orange-50';
    const borderColor = isOutside ? 'border-blue-100/50' : 'border-orange-100/50';

    return (
        <div className={`bg-white/70 backdrop-blur-md rounded-2xl p-4 border ${borderColor} shadow-sm animate-in fade-in slide-in-from-right duration-500`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 ${bgColor} ${textColor} rounded-lg shadow-sm`}>
                        <TrendingUp size={16} />
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{title || 'Rerata Kelerengan'}</div>
                        <div className="text-sm font-black text-slate-800">{summary.avg_slope || 0}%</div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Scope</div>
                    <div className={`text-[10px] font-black ${textColor} ${badgeBg} px-2 py-0.5 rounded-full`}>
                        {summary.scope === 'INSIDE' ? 'DALAM' : summary.scope === 'OUTSIDE' ? 'BUFFER 2KM' : (summary.scope || 'Wilayah')}
                    </div>
                </div>
            </div>

            <div className="space-y-2.5">
                {stats.map((stat, i) => {
                    const pct = totalArea > 0 ? (Number(stat.value) / totalArea * 100).toFixed(1) : 0;
                    return (
                        <div key={i} className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="text-slate-600 font-bold">{stat.label}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-400 text-[9px]">{pct}%</span>
                                    <span className="text-slate-800 font-black font-mono">{Number(stat.value).toFixed(1)} Ha</span>
                                </div>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                <div
                                    className={`h-full ${stat.color} transition-all duration-1000 ease-out shadow-sm`}
                                    style={{ width: `${pct}%`, transitionDelay: `${i * 100}ms` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-[9px] text-slate-400 italic">Data Sumber: NASADEM (SRTM-derived)</div>
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-bold text-emerald-600 uppercase">Live Analysis</span>
                </div>
            </div>
        </div>
    );
};

const MainLayout = (props) => {
    const {
        file, loading, showChart, setShowChart, data, geoData, setData, setGeoData, setFile, setMapUrl, setRgbMapUrl, setVectorLayerData, setError,
        vectorLayerData, mapUrl, rgbMapUrl, error,
        analysisMode, setAnalysisMode, specificDate, setSpecificDate, mapType, setMapType, chartType, setChartType,
        selectedYear, setSelectedYear, showOverlay, setShowOverlay, showRgb, setShowRgb, polygonOpacity, setPolygonOpacity,
        showConfidenceInfo, setShowConfidenceInfo, showMetadata, setShowMetadata,
        progress, progressStep, progressDetail, showCalibration, setShowCalibration, thresholds, setThresholds, timeLeft,
        expandedAttributes, setExpandedAttributes, historyData, loadingHistory,
        showSidebar, setShowSidebar, sidebarRef,
        isCompareMode, setIsCompareMode, compareYear, setCompareYear, compareMapUrl, setCompareMapUrl, compareRgbMapUrl, setCompareRgbMapUrl,
        handleFileChange, handleAnalyze, handleDeleteHistory, handleUpdateHistoryItem, handleHistorySelect, handleHistoryReanalyze, handleReset, handleExportBundle, exportToExcel, exportToGeoJSON,
        selectedYearData, yearStats, dominantLandCover,
        // States from props
        showAllPins, setShowAllPins, showHistoryTable, setShowHistoryTable,
        // Analysis completion popup
        // Analysis completion popup
        showAnalysisComplete, setShowAnalysisComplete,
        // Cloud Prob
        cloudProbThreshold, setCloudProbThreshold,
        // Batch Mode
        isBatchMode, setIsBatchMode,
        // Year Range
        startYear, setStartYear, endYear, setEndYear,
        handleCancel,
        // SIGAP Interaktif
        showKawasanHutan, setShowKawasanHutan, kawasanHutanOpacity, setKawasanHutanOpacity,
        showDAS, setShowDAS, dasOpacity, setDasOpacity,
        // Slope Analysis
        showSlopeLayer, setShowSlopeLayer, slopeOpacity, setSlopeOpacity, slopeMapUrl, slopeDbSummary, slopeDbSummaryOutside,

        onOpenCarbonMode,
        queuePosition
    } = props;

    // Local State for SIGAP Panel Visibility
    const [showSigapPanel, setShowSigapPanel] = useState(false);

    // NASA FIRMS Hotspot Layer States (Fire Information for Resource Management System)
    const [showNasaHotspot, setShowNasaHotspot] = useState(false);
    const [nasaHotspotData, setNasaHotspotData] = useState([]);
    const [nasaLoading, setNasaLoading] = useState(false);
    const [nasaError, setNasaError] = useState(null);

    // 🔄 TEMPORAL STATUS STATES (NEW)
    const [temporalStatusData, setTemporalStatusData] = useState(null);
    const [yearOpacityMap, setYearOpacityMap] = useState({});
    const [showTemporalStatus, setShowTemporalStatus] = useState(true);
    // END TEMPORAL STATUS STATES

    // Global Hotspot Aggregation State
    const [totalGlobalHotspots, setTotalGlobalHotspots] = useState(null);
    const [isHotspotsLoading, setIsHotspotsLoading] = useState(false);

    // Chart Tab State (summary, bar, area)
    const [chartTab, setChartTab] = useState('bar');

    // Reset tab when context changes (Global vs Single)
    useEffect(() => {
        setChartTab(showAllPins ? 'summary' : 'bar');
    }, [showAllPins]);

    // Auto-switch to slope tab when slope layer is enabled
    useEffect(() => {
        if (showSlopeLayer) {
            if (!showAllPins) setChartTab('slope');
        }
    }, [showSlopeLayer, showAllPins]);

    // 🔄 FETCH TEMPORAL STATUS WHEN HISTORY CHANGES (NEW)
    useEffect(() => {
        // Fetch temporal status when data changes (i.e., when user selects a history)
        if (!data?.id && !vectorLayerData?.properties?.history_id) {
            setTemporalStatusData(null);
            setYearOpacityMap({});
            return;
        }

        const historyId = data?.id || vectorLayerData?.properties?.history_id;
        if (!historyId) {
            return;
        }

        const fetchStatus = async () => {
            console.log(`📅 Fetching temporal status for history ${historyId.substring(0, 8)}...`);
            try {
                const statusData = await fetchTemporalStatus(historyId, API_URL);

                if (statusData) {
                    setTemporalStatusData(statusData);
                    // Create opacity map for quick lookup
                    const opacityMap = createYearOpacityMap(statusData.yearly_data || []);
                    setYearOpacityMap(opacityMap);
                    console.log('✅ Temporal status loaded:', opacityMap);
                } else {
                    console.log('⚠️ No temporal status data found');
                    setTemporalStatusData(null);
                    setYearOpacityMap({});
                }
            } catch (error) {
                console.error('Error fetching temporal status:', error);
                setTemporalStatusData(null);
                setYearOpacityMap({});
            }
        };

        fetchStatus();
    }, [data?.id, vectorLayerData?.properties?.history_id]);
    // END FETCH TEMPORAL STATUS

    // Fetch NASA FIRMS Hotspot data filtered by user's polygon bounding box
    // Uses time series: 1 January - 31 December of selected year
    const fetchNasaHotspot = async (geoDataInput, year) => {
        if (!geoDataInput?.features?.[0]?.geometry) {
            console.warn('NASA FIRMS Fetch: No valid geometry found');
            setNasaHotspotData([]);
            return;
        }

        // Determine target year (use selected year or current year)
        const targetYear = year || selectedYear || new Date().getFullYear();

        setNasaLoading(true);
        setNasaError(null);

        try {
            // Extract bounding box from GeoJSON polygon
            const geometry = geoDataInput.features[0].geometry;
            let allCoords = [];

            if (geometry.type === 'Polygon') {
                allCoords = geometry.coordinates[0];
            } else if (geometry.type === 'MultiPolygon') {
                // Flatten all polygons
                geometry.coordinates.forEach(poly => {
                    allCoords = allCoords.concat(poly[0]);
                });
            }

            if (allCoords.length === 0) {
                console.warn('NASA FIRMS Fetch: Empty coordinates');
                setNasaHotspotData([]);
                setNasaLoading(false);
                return;
            }

            // Calculate bounding box
            const lngs = allCoords.map(c => c[0]);
            const lats = allCoords.map(c => c[1]);
            const bounds = {
                minLon: Math.min(...lngs),
                minLat: Math.min(...lats),
                maxLon: Math.max(...lngs),
                maxLat: Math.max(...lats)
            };

            // Build time series date range: 1 Jan - 31 Dec of target year
            const startDate = `${targetYear}-01-01`;
            const endDate = `${targetYear}-12-31`;

            console.log(`🔥 NASA FIRMS: Fetching hotspots for ${targetYear} (${startDate} to ${endDate})`);

            // Use NASA FIRMS backend proxy with time series
            const response = await fetch(NASA_FIRMS_CONFIG.PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bounds: bounds,
                    start_date: startDate,
                    end_date: endDate,
                    source: NASA_FIRMS_CONFIG.DEFAULT_SOURCE
                })
            });
            if (!response.ok) throw new Error(`NASA FIRMS Proxy Error: ${response.status}`);

            const data = await response.json();
            const features = data.features || [];

            // Filter features to only those inside the polygon (more precise than bbox)
            const filteredFeatures = features.filter(f => {
                if (!f.geometry?.coordinates) return false;
                const [lng, lat] = f.geometry.coordinates;
                return isPointInPolygon([lng, lat], geometry);
            });

            console.log(`🔥 NASA FIRMS ${targetYear}: Found ${features.length} in bbox, ${filteredFeatures.length} in polygon`);
            setNasaHotspotData(filteredFeatures);
        } catch (err) {
            console.error('NASA FIRMS Fetch Error:', err);
            setNasaError(err.message);
            setNasaHotspotData([]);
        } finally {
            setNasaLoading(false);
        }
    };

    // Helper: Check if point is inside polygon
    const isPointInPolygon = (point, geometry) => {
        const [px, py] = point;
        let rings = [];

        if (geometry.type === 'Polygon') {
            rings = [geometry.coordinates[0]];
        } else if (geometry.type === 'MultiPolygon') {
            rings = geometry.coordinates.map(poly => poly[0]);
        }

        for (const ring of rings) {
            let inside = false;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const xi = ring[i][0], yi = ring[i][1];
                const xj = ring[j][0], yj = ring[j][1];
                const intersect = ((yi > py) !== (yj > py)) &&
                    (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            if (inside) return true;
        }
        return false;
    };

    // Effect: Fetch hotspot when toggle is ON and geoData exists
    // Re-fetch when selectedYear changes to follow time series
    useEffect(() => {
        if (showNasaHotspot && geoData) {
            fetchNasaHotspot(geoData, selectedYear);
        } else if (!showNasaHotspot) {
            setNasaHotspotData([]);
        }
    }, [showNasaHotspot, geoData, selectedYear]);


    const isHistoryVisible = (!data && !loading && !file && !geoData) || showHistoryTable;
    const [shouldFitMap, setShouldFitMap] = React.useState(false);

    // MODE LAPANGAN (Field Mode) States
    const [fieldMode, setFieldMode] = useState(() => {
        const saved = localStorage.getItem('fieldMode');
        return saved === 'true';
    });
    const [userLocation, setUserLocation] = useState(null); // { lat, lng }
    const [isInsideShp, setIsInsideShp] = useState(false);
    const [gpsError, setGpsError] = useState(null);
    const watchIdRef = useRef(null);

    // Point-in-Polygon Helper (Ray Casting)
    const checkIsInside = (lat, lng, geojson) => {
        if (!geojson || !geojson.features) return false;

        // Simple point in polygon check
        const isPointInPoly = (point, vs) => {
            const x = point[0], y = point[1];
            let inside = false;
            for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
                const xi = vs[i][0], yi = vs[i][1];
                const xj = vs[j][0], yj = vs[j][1];
                const intersect = ((yi > y) !== (yj > y))
                    && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        };

        for (const feature of geojson.features) {
            if (feature.geometry.type === 'Polygon') {
                for (const ring of feature.geometry.coordinates) {
                    if (isPointInPoly([lng, lat], ring)) return true;
                }
            } else if (feature.geometry.type === 'MultiPolygon') {
                for (const polygon of feature.geometry.coordinates) {
                    for (const ring of polygon) {
                        if (isPointInPoly([lng, lat], ring)) return true;
                    }
                }
            }
        }
        return false;
    };

    // Geolocation Watcher
    useEffect(() => {
        localStorage.setItem('fieldMode', fieldMode);

        if (fieldMode) {
            if ("geolocation" in navigator) {
                console.log("📍 Field Mode: Starting GPS Watcher...");
                watchIdRef.current = navigator.geolocation.watchPosition(
                    (position) => {
                        setGpsError(null);
                        const { latitude, longitude } = position.coords;
                        setUserLocation({ lat: latitude, lng: longitude });
                        // Check if inside SHP
                        if (geoData) {
                            const inside = checkIsInside(latitude, longitude, geoData);
                            setIsInsideShp(inside);
                        }
                    },
                    (error) => {
                        console.error("📍 Field Mode GPS Error:", error);
                        setGpsError(error.code === 1 ? "Izin Lokasi Ditolak" : "GPS tidak ditemukan");
                        // Graceful fallback: user knows it's failed by lack of point or console
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            } else {
                console.error("📍 Field Mode: Geolocation not supported");
                setFieldMode(false);
            }
        } else {
            if (watchIdRef.current) {
                console.log("📍 Field Mode: Stopping GPS Watcher...");
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            setUserLocation(null);
            setIsInsideShp(false);
        }

        return () => {
            if (watchIdRef.current) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, [fieldMode, geoData]);

    // SIGAP Identify State
    const [identifyResult, setIdentifyResult] = useState(null); // { latlng, features }



    // Aggregate statistics for ALL history items (Global View)
    // DEDUPLICATION: Only take the latest analysis for each unique filename
    const uniqueHistoryData = useMemo(() => {
        if (!historyData || historyData.length === 0) return [];
        const latestMap = new Map();
        [...historyData].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(item => {
            latestMap.set(item.filename, item); // Overwrites older versions of the same file
        });
        return Array.from(latestMap.values());
    }, [historyData]);

    // Global Hotspot Aggregation for Dashboard (NASA FIRMS)
    // Uses time series: 1 January - 31 December of current year
    useEffect(() => {
        const aggregateGlobalHotspots = async () => {
            if (!showChart || !showAllPins || uniqueHistoryData.length === 0) {
                return;
            }

            // Only fetch if not already loaded OR if data refreshed
            if (totalGlobalHotspots !== null && !isHotspotsLoading) return;

            setIsHotspotsLoading(true);
            let grandTotal = 0;

            // Use current year for global aggregation
            const currentYear = new Date().getFullYear();
            const startDate = `${currentYear}-01-01`;
            const endDate = `${currentYear}-12-31`;

            console.log(`🔥 Aggregating NASA FIRMS hotspots for ${uniqueHistoryData.length} KPS (${currentYear})...`);

            try {
                // Fetch hotspots for each unique history item (KPS)
                // Using sequential for stability
                for (const item of uniqueHistoryData) {
                    if (!item.geo_data?.features?.[0]?.geometry) continue;

                    const geometry = item.geo_data.features[0].geometry;
                    let allCoords = [];

                    if (geometry.type === 'Polygon') {
                        allCoords = geometry.coordinates[0];
                    } else if (geometry.type === 'MultiPolygon') {
                        geometry.coordinates.forEach(poly => {
                            allCoords = allCoords.concat(poly[0]);
                        });
                    }

                    if (allCoords.length === 0) continue;

                    // Calculate bounding box
                    const lngs = allCoords.map(c => c[0]);
                    const lats = allCoords.map(c => c[1]);
                    const bounds = {
                        minLon: Math.min(...lngs),
                        minLat: Math.min(...lats),
                        maxLon: Math.max(...lngs),
                        maxLat: Math.max(...lats)
                    };

                    try {
                        const response = await fetch(NASA_FIRMS_CONFIG.PROXY_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                bounds: bounds,
                                start_date: startDate,
                                end_date: endDate,
                                source: NASA_FIRMS_CONFIG.DEFAULT_SOURCE
                            })
                        });

                        if (response.ok) {
                            const result = await response.json();
                            // Filter to only points inside the polygon
                            const insideCount = (result.features || []).filter(f => {
                                if (!f.geometry?.coordinates) return false;
                                return isPointInPolygon(f.geometry.coordinates, geometry);
                            }).length;
                            grandTotal += insideCount;
                        }
                    } catch (e) {
                        console.error(`Error fetching NASA FIRMS for KPS ${item.filename}:`, e);
                    }
                }

                console.log(`🔥 Global Aggregation Complete: ${grandTotal} hotspots found (${currentYear})`);
                setTotalGlobalHotspots(grandTotal);
            } catch (err) {
                console.error("Global Hotspot Aggregation Failed:", err);
            } finally {
                setIsHotspotsLoading(false);
            }
        };

        aggregateGlobalHotspots();
    }, [showChart, showAllPins, uniqueHistoryData]);

    const aggregateHistoryData = useMemo(() => {
        if (uniqueHistoryData.length === 0) return [];
        const yearMap = {};

        // IMPORTANT: Use uniqueHistoryData to prevent double counting in the timeline
        uniqueHistoryData.forEach(item => {
            if (!item.analysis_results) return;
            item.analysis_results.forEach(res => {
                const y = Number(res.year);
                if (!yearMap[y]) {
                    yearMap[y] = {
                        year: y,
                        hutan_primer: 0,
                        hutan_sekunder: 0,
                        tanah_kering: 0,
                        tanah_kosong: 0,
                        air: 0,
                        lahan_terbangun: 0,
                        total_ha: 0,
                        shp_count: 0
                    };
                }

                // Accumulate all 6 classes
                yearMap[y].hutan_primer += (Number(res.hutan_primer) || 0);
                yearMap[y].hutan_sekunder += (Number(res.hutan_sekunder) || 0);
                yearMap[y].tanah_kering += (Number(res.tanah_kering) || 0);
                yearMap[y].tanah_kosong += (Number(res.tanah_kosong) || 0);
                yearMap[y].air += (Number(res.air) || 0);
                yearMap[y].lahan_terbangun += (Number(res.lahan_terbangun) || 0);

                yearMap[y].shp_count += 1;
            });
        });

        // Return TOTAL SUMS for the 'Whole Data' perspective
        return Object.values(yearMap).map(d => ({
            ...d,
            total_ha: d.hutan_primer + d.hutan_sekunder + d.tanah_kering +
                d.tanah_kosong + d.air + d.lahan_terbangun
        })).sort((a, b) => a.year - b.year);
    }, [uniqueHistoryData]);

    // Adaptive data source for the charts
    const activeChartData = showAllPins ? aggregateHistoryData : data;
    const activeYear = showAllPins
        ? (activeChartData.find(d => d.year === selectedYear) ? selectedYear : activeChartData[activeChartData.length - 1]?.year)
        : selectedYear;
    const activeYearData = useMemo(() => activeChartData?.find(d => d.year === activeYear), [activeChartData, activeYear]);

    const activeStats = useMemo(() => {
        if (!activeYearData) return null;
        const stats = Object.entries(LAND_COVER_CONFIG).map(([key, config]) => ({ key, ...config, value: activeYearData[key] || 0 })).filter(s => s.value > 0);
        const total = stats.reduce((sum, s) => sum + s.value, 0);
        return { stats: stats.map(s => ({ ...s, percentage: total > 0 ? ((s.value / total) * 100).toFixed(1) : 0 })).sort((a, b) => b.value - a.value), total };
    }, [activeYearData]);

    const activeDominant = activeStats?.stats?.[0] || null;

    // Advanced Global Statistics for "Option 3" Grid
    const globalStats = useMemo(() => {
        if (!uniqueHistoryData || uniqueHistoryData.length === 0) return null;

        const targetYear = Number(activeYear) || (aggregateHistoryData.length > 0 ? Number(aggregateHistoryData[aggregateHistoryData.length - 1].year) : 2024);

        let totalKPS = uniqueHistoryData.length;
        let yearlyHutanHa = 0;
        let yearlyTotalHa = 0;

        let deforestasiCount = 0;
        let reforestasiCount = 0;
        let stabilCount = 0;

        let totalDeforestasiHa = 0;
        let totalReforestasiHa = 0;
        let totalStabilHutanHa = 0;
        let totalEkspansiTerbangunHa = 0;
        let stabilHutanCount = 0;
        let ekspansiTerbangunCount = 0;

        uniqueHistoryData.forEach(item => {
            const results = [...(item.analysis_results || [])].sort((a, b) => Number(a.year) - Number(b.year));
            if (results.length === 0) return;

            // First Total Forest (Primer + Sekunder)
            const firstRes = results[0];
            const latestRes = results[results.length - 1];

            const hFirst = (Number(firstRes.hutan_primer) || 0) + (Number(firstRes.hutan_sekunder) || 0);
            const hLatest = (Number(latestRes.hutan_primer) || 0) + (Number(latestRes.hutan_sekunder) || 0);
            const diff = hLatest - hFirst;

            const unitArea = (Number(latestRes.hutan_primer) || 0) +
                (Number(latestRes.hutan_sekunder) || 0) +
                (Number(latestRes.tanah_kering) || 0) +
                (Number(latestRes.tanah_kosong) || 0) +
                (Number(latestRes.air) || 0) +
                (Number(latestRes.lahan_terbangun) || 0);

            if (diff < -0.5) {
                deforestasiCount++;
            } else if (diff > 0.5) {
                reforestasiCount++;
            } else {
                stabilCount++;
            }

            // Sum transition metrics if they exist (pixel-based)
            const hLoss = (Number(latestRes.forest_loss) || (diff < -0.5 ? Math.abs(diff) : 0));
            const hGain = (Number(latestRes.forest_gain) || (diff > 0.5 ? diff : 0));
            const hStable = (Number(latestRes.forest_stable) || (diff >= -0.5 && diff <= 0.5 ? hLatest : 0));
            const hBuiltExp = (Number(latestRes.builtup_expansion) || 0);

            totalDeforestasiHa += hLoss;
            totalReforestasiHa += hGain;
            totalStabilHutanHa += hStable;
            totalEkspansiTerbangunHa += hBuiltExp;

            if (hStable > 0.1) stabilHutanCount++;
            if (hBuiltExp > 0.1) ekspansiTerbangunCount++;

            yearlyHutanHa += hLatest;
            yearlyTotalHa += unitArea;
        });

        return {
            totalKPS,
            totalHektar: yearlyTotalHa,
            totalHutanHa: yearlyHutanHa,
            deforestasiCount,
            reforestasiCount,
            stabilCount,
            deforestasiAreaHa: totalDeforestasiHa,
            reforestasiAreaHa: totalReforestasiHa,
            stabilHutanAreaHa: totalStabilHutanHa,
            ekspansiTerbangunAreaHa: totalEkspansiTerbangunHa,
            perubahanBersihHa: totalReforestasiHa - totalDeforestasiHa,
            stabilHutanCount,
            ekspansiTerbangunCount,
            targetYear
        };
    }, [uniqueHistoryData, activeYear, aggregateHistoryData]);

    const globalNarrative = useMemo(() => {
        if (!globalStats) return null;
        const { perubahanBersihHa, reforestasiAreaHa, deforestasiAreaHa } = globalStats;
        const absNet = Math.abs(perubahanBersihHa).toFixed(1);
        const refo = reforestasiAreaHa.toFixed(1);
        const defo = deforestasiAreaHa.toFixed(1);

        if (perubahanBersihHa < -0.1) {
            return `Meskipun ada reforestasi (+${refo} Ha), namun karena deforestasi lebih besar (-${defo} Ha), kawasan mengalami perubahan tutupan (transisi) negatif sebesar ${absNet} Ha. Laju kerusakan melampaui pemulihan.`;
        } else if (perubahanBersihHa > 0.1) {
            return `Laju pemulihan tutupan (+${refo} Ha) berhasil melampaui degradasi (-${defo} Ha), menghasilkan surplus perubahan tutupan (transisi) sebesar ${absNet} Ha.`;
        } else {
            return `Kondisi tutupan kawasan cenderung stabil seimbang antara aktivitas deforestasi (-${defo} Ha) dan reforestasi (+${refo} Ha).`;
        }
    }, [globalStats]);

    // 📊 CALCULATE DYNAMIC OPACITY BASED ON TEMPORAL STATUS (NEW)
    const layerOpacity = useMemo(() => {
        if (!showTemporalStatus || !yearOpacityMap || Object.keys(yearOpacityMap).length === 0) {
            // If temporal status disabled or no data, use original polygonOpacity
            return polygonOpacity;
        }

        const yearOpacity = yearOpacityMap[selectedYear];
        if (yearOpacity !== undefined) {
            // Use temporal status opacity, but respect slider if it's lower
            return Math.min(yearOpacity, polygonOpacity);
        }

        // Fallback to original opacity if year not found
        return polygonOpacity;
    }, [selectedYear, yearOpacityMap, polygonOpacity, showTemporalStatus]);
    // END DYNAMIC OPACITY CALCULATION

    // Polygon style: Menambahkan fill transparan agar area lebih terlihat
    const getPolygonStyle = (showOverlay, isSlopeActive = false) => {
        // Saat slope aktif, tampilkan garis tebal agar batas inside/outside terlihat jelas
        if (isSlopeActive) {
            return {
                color: '#ef4444',      // Merah terang untuk kontras dengan slope colors
                weight: 4,             // Garis tebal
                fillColor: 'transparent',
                fillOpacity: 0,
                dashArray: null
            };
        }
        return {
            color: showOverlay ? '#ffffff' : '#10b981',  // Warna outline
            weight: showOverlay ? 2 : 4,
            fillColor: '#10b981',
            fillOpacity: showOverlay ? 0.05 : 0.15, // Fill sangat tipis jika overlay aktif, agak tebal jika tidak
            dashArray: showOverlay ? null : '5, 5'
        };
    };

    const getConfidenceInterpretation = (confidence) => {
        if (!confidence) return null;
        if (confidence >= 85) return { level: 'Sangat Tinggi', color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: '✓', explanation: 'Sinyal sangat kuat dan konsisten.' };
        if (confidence >= 70) return { level: 'Tinggi', color: 'text-green-700', bgColor: 'bg-green-50', icon: '✓', explanation: 'Klasifikasi akurat.' };
        if (confidence >= 55) return { level: 'Sedang', color: 'text-yellow-700', bgColor: 'bg-yellow-50', icon: '!', explanation: 'Cukup akurat, ada sedikit ambiguitas.' };
        return { level: 'Rendah', color: 'text-red-700', bgColor: 'bg-red-50', icon: '⚠', explanation: 'Perlu verifikasi lapangan.' };
    };

    const sidebarTransitionStats = useMemo(() => {
        if (!selectedYearData || !data || data.length === 0) return null;

        // If pixel-based data is available, use it directly (v3.0+)
        if (selectedYearData.forest_loss !== undefined) {
            return {
                loss: Number(selectedYearData.forest_loss) || 0,
                gain: Number(selectedYearData.forest_gain) || 0,
                builtup: Number(selectedYearData.builtup_expansion) || 0
            };
        }

        // Fallback for older analysis: calculate delta from previous year in the data array
        const sortedData = [...data].sort((a, b) => a.year - b.year);
        const currentIndex = sortedData.findIndex(d => d.year === selectedYear);

        if (currentIndex > 0) {
            const prev = sortedData[currentIndex - 1];
            const hPrev = (Number(prev.hutan_primer) || 0) + (Number(prev.hutan_sekunder) || 0);
            const hCurr = (Number(selectedYearData.hutan_primer) || 0) + (Number(selectedYearData.hutan_sekunder) || 0);
            const bPrev = Number(prev.lahan_terbangun) || 0;
            const bCurr = Number(selectedYearData.lahan_terbangun) || 0;

            return {
                loss: Math.max(0, hPrev - hCurr),
                gain: Math.max(0, hCurr - hPrev),
                builtup: Math.max(0, bCurr - bPrev)
            };
        }

        return { loss: 0, gain: 0, builtup: 0 };
    }, [selectedYearData, data, selectedYear]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;

        // Filter out zero values and sort for a better look
        const validPayload = payload.filter(p => p.value > 0).sort((a, b) => b.value - a.value);

        return (
            <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.15)] border border-emerald-100 min-w-[180px]">
                <p className="font-black text-slate-800 text-sm mb-3 border-b border-slate-100 pb-2">Tahun {label}</p>
                <div className="space-y-2.5">
                    {validPayload.map((entry, i) => (
                        <div key={i} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
                                <span className="text-[11px] font-bold text-slate-600">{entry.name}</span>
                            </div>
                            <span className="text-[11px] font-black text-slate-800 flex items-baseline gap-0.5">
                                {entry.value?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                <span className="text-[9px] font-bold text-slate-400">Ha</span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Component for Option 3: Analytical Grid
    const GlobalGridDashboard = ({ stats }) => {
        if (!stats) return (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 opacity-60">
                <Database size={32} className="animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest">Belum Ada Data Lokasi</span>
            </div>
        );

        const cards = [
            {
                label: 'Luas Areal Pantauan',
                shpCount: stats.totalKPS || '-',
                shpUnit: 'KPS',
                value: stats.totalHektar.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                unit: 'Ha',
                percent: '100',
                icon: <Database size={24} />,
                color: 'bg-slate-100 text-slate-600',
                border: 'border-slate-200'
            },
            {
                label: 'Deforestasi Tahunan',
                shpCount: stats.deforestasiCount || 0,
                shpUnit: 'KPS',
                value: stats.deforestasiAreaHa.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                unit: 'Ha',
                percent: ((stats.deforestasiAreaHa / (stats.totalHektar || 1)) * 100).toFixed(1),
                icon: <TrendingDown size={24} />,
                color: 'bg-red-50 text-red-600',
                border: 'border-red-100'
            },
            {
                label: 'Reforestasi / Pemulihan',
                shpCount: stats.reforestasiCount || 0,
                shpUnit: 'KPS',
                value: stats.reforestasiAreaHa.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                unit: 'Ha',
                percent: ((stats.reforestasiAreaHa / (stats.totalHektar || 1)) * 100).toFixed(1),
                icon: <TrendingUp size={24} />,
                color: 'bg-emerald-50 text-emerald-600',
                border: 'border-emerald-100'
            },
            {
                label: 'Ekspansi Terbangun',
                shpCount: stats.ekspansiTerbangunCount || 0,
                shpUnit: 'KPS',
                value: stats.ekspansiTerbangunAreaHa.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                unit: 'Ha',
                percent: ((stats.ekspansiTerbangunAreaHa / (stats.totalHektar || 1)) * 100).toFixed(1),
                icon: <ImageIcon size={24} />,
                color: 'bg-slate-100 text-slate-500',
                border: 'border-slate-200'
            },
            {
                label: 'Perubahan Tutupan (Transisi)',
                shpCount: null,
                value: (stats.perubahanBersihHa >= 0 ? '+' : '') + stats.perubahanBersihHa.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                unit: 'Ha',
                percent: ((Math.abs(stats.perubahanBersihHa) / (stats.totalHektar || 1)) * 100).toFixed(1),
                icon: <BarChart3 size={24} />,
                color: stats.perubahanBersihHa >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600',
                border: stats.perubahanBersihHa >= 0 ? 'border-emerald-100' : 'border-red-100'
            },
            {
                label: 'TOTAL TITIK TERDETEKSI',
                shpCount: isHotspotsLoading ? '...' : (totalGlobalHotspots ?? 0),
                shpUnit: 'Titik',
                value: isHotspotsLoading ? '...' : uniqueHistoryData.length,
                unit: 'Lokasi',
                status: totalGlobalHotspots > 0 ? 'HIGH RISK' : 'AMAN',
                statusColor: totalGlobalHotspots > 0 ? 'text-red-600' : 'text-emerald-600',
                statusBg: totalGlobalHotspots > 0 ? 'bg-red-50' : 'bg-emerald-50',
                statusBorder: totalGlobalHotspots > 0 ? 'border-red-100' : 'border-emerald-100',
                icon: <Flame size={24} />,
                color: (totalGlobalHotspots > 0) ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500',
                border: (totalGlobalHotspots > 0) ? 'border-orange-100' : 'border-slate-200'
            },
        ];

        return (
            <div className="flex flex-col gap-4 py-2">
                {/* Executive Briefing Banner */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-3 shadow-sm mb-2">
                    <div className={`p-1.5 rounded-lg mt-0.5 ${stats.perubahanBersihHa < 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        <Sparkles size={16} />
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ringkasan Eksekutif</span>
                        <p className="text-[11px] font-bold text-slate-700 leading-tight italic">
                            "{globalNarrative}"
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                    {cards.map((card, i) => (
                        <div key={i} className={`flex flex-col justify-between p-2.5 rounded-2xl bg-white border ${card.border} shadow-sm transition-all hover:shadow-md hover:scale-[1.02] duration-300`}>
                            <div className="flex items-center justify-between mb-1">
                                <div className={`p-1.5 rounded-lg scale-90 ${card.color}`}>{card.icon}</div>
                                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 text-center leading-tight">{card.label}</span>
                            </div>
                            <div className="flex-1 flex flex-col justify-center min-h-[2.5rem]">
                                {card.isPriorityList ? (
                                    <div className="space-y-1 my-0.5 md:my-1">
                                        {card.list && card.list.length > 0 ? (
                                            card.list.map((spot, idx) => (
                                                <div key={idx} className="flex items-center gap-1.5">
                                                    <div className="w-1 h-1 rounded-full bg-orange-400" />
                                                    <span className="text-[8px] md:text-[10px] font-bold text-slate-700 truncate w-24 md:w-32" title={spot.name}>
                                                        {spot.name}
                                                    </span>
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-[8px] md:text-[9px] font-bold text-slate-400 italic">Tidak ada degradasi</span>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        {/* SHP Count - Primary Display */}
                                        {card.shpCount !== null && (
                                            <div className="flex items-baseline gap-1 mb-0.5">
                                                <span className="text-xl text-slate-800 font-black tracking-tight">{card.shpCount}</span>
                                                <span className="text-[9px] font-bold text-slate-400">{card.shpUnit || 'KPS'}</span>
                                            </div>
                                        )}
                                        {/* Ha and % - Secondary smaller display */}
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <div className="flex items-baseline gap-0.5">
                                                <span className={`${card.shpCount !== null ? 'text-xs' : 'text-lg'} text-slate-600 font-bold`}>{card.value}</span>
                                                <span className="text-[8px] font-medium text-slate-400">{card.unit || 'Ha'}</span>
                                            </div>
                                            {card.status ? (
                                                <div className={`flex items-center ${card.statusBg} px-1 py-0.5 rounded-md border ${card.statusBorder}`}>
                                                    <span className={`${card.shpCount !== null ? 'text-[8px]' : 'text-[9px]'} font-black ${card.statusColor}`}>{card.status}</span>
                                                </div>
                                            ) : card.percent && (
                                                <div className="flex items-center bg-slate-50/80 px-1 py-0.5 rounded-md border border-slate-100">
                                                    <span className="text-[9px] font-bold text-slate-500">{card.percent}%</span>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            {card.sub && <p className="text-[8px] md:text-[10px] font-black text-slate-500 mt-1.5 md:mt-2 uppercase tracking-tighter opacity-70 line-clamp-1">{card.sub}</p>}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Sync history table to hide if data starts loading
    useEffect(() => { if (loading) setShowHistoryTable(false); }, [loading]);



    return (
        <div className="flex h-screen w-screen overflow-hidden font-['IBM_Plex_Sans'] text-slate-800 relative" style={{ background: 'linear-gradient(to bottom right, #064e3b, #0f172a)' }}>

            {/* FULL SCREEN LOADING OVERLAY (Optimized Layout) */}
            {loading && (
                <div
                    className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-700"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="bg-white/90 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] p-10 md:p-14 max-w-xl w-full mx-6 border border-white/60 relative overflow-hidden">
                        {/* Animated Glow Background */}
                        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-400/20 rounded-full blur-[80px] animate-pulse"></div>
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-400/20 rounded-full blur-[80px] animate-pulse delay-700"></div>

                        <div className="relative z-10">
                            {/* Header Section */}
                            <div className="flex flex-col mb-10">
                                <div className="flex items-center gap-2">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100 self-start mb-4 shadow-sm">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></div>
                                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.2em]">Analisis Aktif</span>
                                    </div>

                                    {queuePosition > 0 && (
                                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full border border-blue-100 self-start mb-4 shadow-sm animate-in slide-in-from-left duration-500">
                                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                                            <span className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em]">Antrian #{queuePosition}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-end justify-between gap-4">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status Sekarang</p>
                                        <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-tight">
                                            {progressStep || "Sinkronisasi Satelit"}
                                        </h2>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-5xl font-black text-emerald-600 tracking-tighter leading-none">{progress}</span>
                                            <span className="text-xl font-bold text-emerald-400 leading-none">%</span>
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] mt-1 text-right">Progress GEE</span>
                                    </div>
                                </div>
                            </div>

                            {/* Main Progress Indicator */}
                            <div className="relative mb-12">
                                {/* The Bar */}
                                <div className="h-3 w-full bg-slate-100/80 rounded-full overflow-hidden shadow-inner border border-slate-200/50">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-500 transition-all duration-1000 ease-in-out shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                                        style={{ width: `${progress}%` }}
                                    >
                                        <div className="w-full h-full opacity-40 bg-[linear-gradient(45deg,rgba(255,255,255,0.4)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.4)_50%,rgba(255,255,255,0.4)_75%,transparent_75%,transparent)] bg-[length:30px_30px] animate-[shimmer_2s_linear_infinite]"></div>
                                    </div>
                                </div>

                                {/* Pulse at the end of progress */}
                                <div
                                    className="absolute -top-1 -translate-x-1/2 w-5 h-5 bg-white border-2 border-emerald-500 rounded-full shadow-lg transition-all duration-1000 ease-in-out hidden md:block"
                                    style={{ left: `${progress}%` }}
                                >
                                    <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-30"></div>
                                </div>
                            </div>

                            {/* Footer Information - SIMPLIFIED (Timer Only) */}
                            <div className="flex justify-center pt-8 border-t border-slate-100 min-h-[80px]">
                                {timeLeft !== null && timeLeft !== undefined ? (
                                    <span className="flex items-center gap-2 text-emerald-600 animate-pulse font-black text-sm uppercase tracking-widest bg-emerald-50 px-6 py-2 rounded-full border border-emerald-100">
                                        <Clock size={16} className={timeLeft < 10 ? "text-amber-500" : ""} />
                                        {`Estimasi Selesai: ~${timeLeft} Detik`}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 text-xs font-bold uppercase tracking-widest animate-pulse mt-2">
                                        Memulai perhitungan...
                                    </span>
                                )}
                            </div>

                            {/* Cancel Button */}
                            <div className="flex justify-center mt-6">
                                <button
                                    onClick={handleCancel}
                                    className="px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 font-bold rounded-full text-xs uppercase tracking-widest border border-red-500/30 transition-all hover:scale-105 active:scale-95"
                                >
                                    Batalkan Proses
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ANALYSIS COMPLETE POPUP */}
            {showAnalysisComplete && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center animate-[fadeIn_0.3s_ease-out]">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 size={32} className="text-emerald-600" />
                        </div>
                        <h2 className="text-xl font-black text-slate-800 mb-2">Analisis Selesai!</h2>
                        <p className="text-sm text-slate-500 mb-6">
                            Data tutupan lahan berhasil dianalisis. Klik OK untuk melihat hasil analisis pada dashboard.
                        </p>
                        <button
                            onClick={() => {
                                setShowAnalysisComplete(false);
                                setShowSidebar(true);
                                setShowAllPins(false);
                                setShowHistoryTable(false);
                                setShouldFitMap(true); // Trigger map to center on polygon
                            }}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-emerald-600/30"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            {/* Sidebar Toggle Button (Visible even in Draw Mode, as requested) */}
            {/* FLOATING CONTROL DOCK (Unified Navigation) */}
            <div className={`fixed top-6 left-6 z-[3002] flex items-center p-1.5 gap-1 rounded-full bg-white/80 backdrop-blur-md border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.1)] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${showSidebar ? '-translate-x-[150%] opacity-0' : 'translate-x-0 opacity-100'}`}>

                {/* 1. Menu Trigger */}
                <button
                    onClick={() => setShowSidebar(true)}
                    className="p-2.5 rounded-full hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 transition-all active:scale-95"
                    title="Buka Menu"
                >
                    <Menu size={20} />
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-slate-300/50 mx-0.5"></div>

                {/* 2. Layers Toggle (Unified) */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowSigapPanel(!showSigapPanel);
                    }}
                    className={`p-2.5 rounded-full transition-all active:scale-95 relative ${showSigapPanel
                        ? 'bg-emerald-100 text-emerald-700 shadow-inner'
                        : 'hover:bg-emerald-50 text-slate-600 hover:text-emerald-600'
                        }`}
                    title="Layer & Legenda"
                >
                    <Layers size={20} />
                    {(showKawasanHutan || showDAS) && !showSigapPanel && (
                        <span className="absolute top-2 right-2 flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]" />
                    )}
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-slate-300/50 mx-0.5"></div>

                {/* 3. View Toggle (Map <-> History) */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (showHistoryTable) {
                            setShowHistoryTable(false);
                            setShowAllPins(true);
                            setMapType('satellite');
                        } else {
                            setShowHistoryTable(true);
                            setShowAllPins(false);
                        }
                    }}
                    className={`p-2.5 rounded-full transition-all active:scale-95 flex items-center justify-center gap-2 ${showHistoryTable
                        ? 'bg-emerald-100 text-emerald-700 shadow-inner'
                        : 'hover:bg-emerald-50 text-slate-600 hover:text-emerald-600'
                        }`}
                    title={showHistoryTable ? "Kembali ke Peta" : "Lihat Data Riwayat"}
                >
                    {showHistoryTable ? <MapPin size={20} /> : <Database size={20} />}
                </button>
            </div>







            {/* BOTTOM LEFT: Unified View Toggle Button (2-Step Loop: Map <-> History) */}
            {/* Removed standalone View Toggle Button (Moved to Control Dock) */}




            {/* FLOATING SIDEBAR - Responsive & Glassmorphism */}
            <aside
                ref={sidebarRef}
                className={`fixed top-6 bottom-6 left-6 md:left-6 w-[85vw] md:w-96 bg-white/95 backdrop-blur-2xl flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.3)] z-[3001] rounded-[2.5rem] border border-white/40 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${showSidebar ? 'translate-x-0 opacity-100' : '-translate-x-[calc(110%)] opacity-0'
                    }`}
            >
                <div className="px-6 py-5 border-b border-slate-100/50 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                                <Satellite size={20} />
                            </div>
                            <div>
                                <h1 className="font-black text-lg tracking-tight leading-none text-slate-800">GealGeolGeo</h1>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Direktorat Pengendalian Perhutanan Sosial</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowSidebar(false)}
                            className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                            title="Tutup Menu"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-5 flex-1 flex flex-col gap-6 overflow-y-auto no-scrollbar">
                    {/* SECTION 1: MAP CONTROLS & ANALYSIS INPUT (Reordered) */}
                    <div className="space-y-6">
                        {/* Segmented Control for Map Type */}
                        <div className="bg-slate-100/80 p-1 rounded-xl flex items-center relative">
                            {Object.entries(MAP_TILES).map(([key, tile]) => (
                                <button
                                    key={key}
                                    onClick={() => setMapType(key)}
                                    className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all z-10 ${mapType === key
                                        ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-black/5'
                                        : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    {tile.name}
                                </button>
                            ))}
                        </div>

                        {/* HIGH PRIORITY: ANALYSIS INPUT FLOW */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="h-px bg-slate-100 flex-1" />
                                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Setup Analisis</span>
                                <span className="h-px bg-slate-100 flex-1" />
                            </div>

                            {/* Batch Mode Toggle */}
                            <div className="flex items-center justify-between px-1 mb-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer flex items-center gap-2">
                                    <div className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" className="sr-only peer" checked={isBatchMode} onChange={(e) => setIsBatchMode(e.target.checked)} />
                                        <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                                    </div>
                                    Batch Mode
                                </label>
                                {isBatchMode && <span className="text-[9px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">ON</span>}
                            </div>

                            {/* Upload Area */}
                            <div className="group border border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 hover:border-emerald-400 transition-all cursor-pointer relative bg-slate-50/50">
                                <input type="file" accept=".zip,.shp,.shx,.dbf,.prj,.cpg,.geojson" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="flex flex-col items-center gap-1">
                                    <div className="p-2 bg-white rounded-full shadow-sm text-slate-400 group-hover:text-emerald-500 transition-colors">
                                        <Upload size={16} />
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase tracking-wide mt-1 ${file ? "text-emerald-600" : "text-slate-400"}`}>
                                        {file ? file.name : "Upload KPS / GeoJSON"}
                                    </span>
                                </div>
                            </div>

                            {/* Year Range */}
                            <div className="flex items-center gap-3">
                                <div className="relative flex-1">
                                    <label className="absolute -top-1.5 left-2 px-1 bg-white text-[8px] font-black text-slate-400 uppercase tracking-widest">Mulai</label>
                                    <select
                                        value={startYear}
                                        onChange={(e) => setStartYear(parseInt(e.target.value))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
                                    >
                                        {[2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map(y => (
                                            <option key={y} value={y} disabled={y > endYear}>{y}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={12} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                                </div>
                                <span className="text-slate-300">
                                    <ArrowRight size={14} />
                                </span>
                                <div className="relative flex-1">
                                    <label className="absolute -top-1.5 left-2 px-1 bg-white text-[8px] font-black text-slate-400 uppercase tracking-widest">Selesai</label>
                                    <select
                                        value={endYear}
                                        onChange={(e) => setEndYear(parseInt(e.target.value))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
                                    >
                                        {[2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map(y => (
                                            <option key={y} value={y} disabled={y < startYear}>{y}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={12} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            {/* Analyze Button */}
                            <button
                                onClick={handleAnalyze}
                                disabled={!geoData || loading}
                                className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest transition-all shadow-sm ${!geoData || loading
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-emerald-200 active:scale-95'
                                    }`}
                            >
                                {loading ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
                                {loading ? "Memproses Analisis..." : "Mulai Analisis"}
                            </button>

                            {loading && (
                                <div className="space-y-1.5 pt-1">
                                    <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase">
                                        <span>{progressStep}</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-emerald-500 h-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SECTION 2: VISUALIZATION SETTINGS (Now Secondary) */}
                        <div className="relative z-20 bg-white rounded-2xl border border-slate-200/60 shadow-md divide-y divide-slate-100 overflow-hidden">
                            <div className="bg-slate-50/50 px-4 py-2 border-b border-slate-100">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Kontrol Visual</span>
                            </div>
                            <div className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                <span className="text-[11px] font-bold text-slate-600">Overlay Analisis</span>
                                <button
                                    onClick={() => {
                                        const newOverlayState = !showOverlay;
                                        setShowOverlay(newOverlayState);
                                        // Auto turn off slope when overlay is enabled
                                        if (newOverlayState) {
                                            setShowSlopeLayer(false);
                                        }
                                    }}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showOverlay ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                >
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${showOverlay ? 'translate-x-4' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                <span className="text-[11px] font-bold text-slate-600">Citra Satelit Asli</span>
                                <button
                                    onClick={() => setShowRgb(!showRgb)}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showRgb ? 'bg-indigo-500' : 'bg-slate-200'}`}
                                >
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${showRgb ? 'translate-x-4' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {/* 🔄 TEMPORAL STATUS TOGGLE (NEW) */}
                            <div className="relative z-30 px-4 py-3 flex items-center justify-between bg-amber-50 border-y border-amber-100 hover:bg-amber-100/50 transition-colors">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-amber-900">Status Temporal</span>
                                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded font-bold">GREY AREA</span>
                                </div>
                                <button
                                    onClick={() => setShowTemporalStatus(!showTemporalStatus)}
                                    className={`relative z-30 inline-flex h-5 w-9 items-center rounded-full transition-colors ${showTemporalStatus ? 'bg-amber-500' : 'bg-slate-200'}`}
                                >
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${showTemporalStatus ? 'translate-x-4' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            {/* END TEMPORAL STATUS TOGGLE */}

                            <div className="px-4 py-3 space-y-2 hover:bg-slate-50/50 transition-colors">
                                <div className="flex justify-between items-center text-[10px] font-bold text-slate-50">
                                    <span className="text-slate-500">Transparansi Overlay</span>
                                    <span className="text-emerald-600">{Math.round(polygonOpacity * 100)}%</span>
                                </div>
                                <input
                                    type="range" min="0" max="100" step="1"
                                    value={polygonOpacity * 100}
                                    onChange={(e) => setPolygonOpacity(parseInt(e.target.value) / 100)}
                                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-emerald-500"
                                />
                            </div>

                            <div className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors border-t border-slate-100">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                        <MapPin size={12} className={fieldMode ? 'text-emerald-600' : 'text-slate-400'} />
                                        <span className="text-[11px] font-bold text-slate-600">Mode Lapangan</span>
                                    </div>
                                    <span className="text-[9px] text-slate-400 font-medium">
                                        {gpsError ? <span className="text-red-500">{gpsError}</span> : "GPS Visual (Hanya Client-side)"}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setFieldMode(!fieldMode)}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fieldMode ? 'bg-emerald-600' : 'bg-slate-200'}`}
                                >
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${fieldMode ? 'translate-x-4' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 p-3 rounded-xl text-red-600 text-[10px] md:text-[9px] flex gap-2 border border-red-100 items-start">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span className="font-medium leading-relaxed">{error}</span>
                        </div>
                    )}

                    {/* Results & Calibration */}
                    {(data?.length > 0 || geoData) && (
                        <div className="flex-1 space-y-5 md:space-y-4">
                            {data?.length > 0 && (
                                <div className="flex flex-col gap-3 mb-2">
                                    <span className="text-[10px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">Ekspor & Laporan</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button onClick={exportToExcel} className="bg-white border border-slate-200 text-emerald-700 text-[10px] md:text-[9px] flex items-center gap-1.5 hover:bg-emerald-50 px-4 py-2 md:px-2 md:py-1 rounded-xl md:rounded transition-all font-bold">
                                            <Download size={12} /> EXCEL (.xlsx)
                                        </button>
                                        <button onClick={exportToGeoJSON} className="bg-white border border-slate-200 text-blue-700 text-[10px] md:text-[9px] flex items-center gap-1.5 hover:bg-blue-50 px-4 py-2 md:px-2 md:py-1 rounded-xl md:rounded transition-all font-bold">
                                            <Download size={12} /> GeoJSON
                                        </button>
                                        <button onClick={handleExportBundle} className="bg-white border border-indigo-200 text-indigo-700 text-[10px] md:text-[9px] flex items-center gap-1.5 hover:bg-indigo-50 px-4 py-2 md:px-2 md:py-1 rounded-xl md:rounded transition-all font-black shadow-sm">
                                            <Download size={12} /> HTML + SHP (Lengkap)
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Year Selector (Only if data exists) */}
                            {data?.length > 0 && (
                                <div className="relative mb-2">
                                    <Calendar className="absolute left-2 top-1.5 text-slate-400" size={12} />
                                    <select
                                        value={selectedYear || ''}
                                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                        className="w-full pl-7 pr-2 py-1.5 border border-slate-200 rounded text-xs bg-white appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    >
                                        {data.map(d => <option key={d.year} value={d.year}>Tahun {d.year}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* INTEGRATED CALIBRATION PANEL (PERMANENT) */}
                            <CalibrationPanel
                                show={true}
                            />



                            {/* Stats */}
                            {yearStats && (
                                <div className="space-y-1.5">
                                    {yearStats.stats.slice(0, 5).map(stat => (
                                        <div key={stat.key} className="bg-white/50 rounded p-1.5 border border-slate-100">
                                            <div className="flex items-center justify-between text-[10px] mb-0.5">
                                                <div className="flex items-center gap-1">
                                                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: stat.color }} />
                                                    <span className="text-slate-700 font-medium">{stat.shortLabel}</span>
                                                </div>
                                                <span className="font-mono text-slate-800 font-bold">{stat.value.toFixed(1)} <span className="text-slate-400 font-normal">Ha</span></span>
                                            </div>
                                        </div>
                                    ))}



                                    <div className="pt-2 mt-2 border-t border-slate-200 flex justify-between text-[11px] font-black">
                                        <span className="text-slate-500 uppercase tracking-wider">Total Wilayah</span>
                                        <span className="text-slate-800">{yearStats.total.toFixed(1)} Ha</span>
                                    </div>
                                    {/* Confidence Score */}
                                    {
                                        data.find(d => d.year === selectedYear)?.confidence_percent && (
                                            <div className="pt-1.5 mt-1 border-t border-slate-200">
                                                <div className="flex justify-between items-center text-[10px] mt-1.5">
                                                    <span className="text-slate-500">Konfidensi Global</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className={`px-1.5 py-0.5 rounded-full font-bold ${data.find(d => d.year === selectedYear).confidence_percent >= 80
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : data.find(d => d.year === selectedYear).confidence_percent >= 60
                                                                ? 'bg-yellow-100 text-yellow-700'
                                                                : 'bg-red-100 text-red-700'
                                                            }`}>
                                                            {data.find(d => d.year === selectedYear).confidence_percent}%
                                                        </span>
                                                        <button
                                                            onClick={() => setShowConfidenceInfo(!showConfidenceInfo)}
                                                            className="text-slate-400 hover:text-slate-600 transition-colors"
                                                            title="Lihat penjelasan konfidensi"
                                                        >
                                                            <Info size={12} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Accuracy Assessment (Point 3) */}
                                                {selectedYearData?.accuracy_score && (
                                                    <div className="flex justify-between items-center text-[10px] mt-2 pt-2 border-t border-dashed border-slate-100">
                                                        <div className="flex items-center gap-1.5">
                                                            <ShieldCheck size={12} className="text-blue-500" />
                                                            <span className="text-slate-500 font-bold uppercase tracking-tight text-[8px]">Akurasi (ESA WC)</span>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-black text-blue-700">{(selectedYearData.accuracy_score * 100).toFixed(1)}%</span>
                                                            {selectedYearData.kappa_score && (
                                                                <span className="text-[7px] text-slate-400 font-black uppercase">Kappa: {selectedYearData.kappa_score.toFixed(2)}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Confidence Explanation Panel */}
                                                {showConfidenceInfo && selectedYearData?.confidence_detailed && (
                                                    <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-[9px] space-y-2">
                                                        <div className="font-bold text-slate-700 mb-1 flex items-center gap-1">
                                                            <Info size={10} />
                                                            Interpretasi Konfidensi
                                                        </div>
                                                        {Object.entries(selectedYearData.confidence_detailed).map(([classKey, conf]) => {
                                                            const interpretation = getConfidenceInterpretation(conf, classKey);
                                                            if (!interpretation) return null;

                                                            const classConfig = LAND_COVER_CONFIG[classKey];
                                                            if (!classConfig) return null;

                                                            return (
                                                                <div key={classKey} className={`p-2 rounded ${interpretation.bgColor}`}>
                                                                    <div className="flex items-center gap-1 mb-1">
                                                                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: classConfig.color }} />
                                                                        <span className="font-bold">{classConfig.label}</span>
                                                                        <span className={`ml-auto ${interpretation.color} font-bold`}>
                                                                            {interpretation.icon} {conf}% - {interpretation.level}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-slate-600 leading-relaxed">
                                                                        {interpretation.explanation}
                                                                    </p>
                                                                </div>
                                                            );
                                                        })}
                                                        <div className="pt-2 mt-2 border-t border-slate-300 text-slate-500 italic">
                                                            💡 Konfidensi dihitung berdasarkan ketegasan sinyal spektral (NDVI) terhadap ambang batas klasifikasi. Nilai tinggi menunjukkan klasifikasi yang sangat yakin.
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    }
                                </div>
                            )}

                            {/* 📋 TEMPORAL STATUS INFO PANEL (NEW) */}
                            {temporalStatusData && selectedYear && (() => {
                                const yearData = temporalStatusData.yearly_data?.find(d => d.year === selectedYear);
                                if (!yearData) return null;

                                const statusStyle = getTemporalStatusStyle(yearData.temporal_status);
                                const opacity = getOpacityByTemporalStatus(yearData.temporal_status);

                                return (
                                    <div className="mt-2 p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200 space-y-2">
                                        <div className="flex items-start gap-2">
                                            <div className={`px-2 py-1 rounded text-[9px] font-bold whitespace-nowrap ${statusStyle.badgeColor}`}>
                                                {statusStyle.label}
                                            </div>
                                            <div className="text-[10px] text-slate-600 leading-relaxed">
                                                <p className="font-medium text-slate-700">{statusStyle.description}</p>
                                                <p className="mt-1 text-[9px] text-slate-500">
                                                    Opacity Peta: <span className="font-bold">{(opacity * 100).toFixed(0)}%</span>
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* END TEMPORAL STATUS INFO PANEL */}

                            {/* METADATA SIDEBAR */}
                            {geoData && file && (
                                <div className="mt-3 pt-3 border-t border-slate-200">
                                    <div className="flex items-center gap-1.5 mb-2 text-slate-600 px-1">
                                        <Database size={12} className="text-emerald-600" />
                                        <span className="text-[9px] font-bold uppercase tracking-wider">Metadata File</span>
                                    </div>
                                    <div className="bg-white rounded-lg p-3 border border-slate-100 shadow-sm space-y-2">
                                        <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                                            <div className="p-1 bg-emerald-50 rounded">
                                                <FileText size={12} className="text-emerald-500" />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 w-full truncate" title={file.name || 'SHP File'}>
                                                {file.name || 'Data Spasial'}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[9px]">
                                            {file.size && (
                                                <div className="flex flex-col">
                                                    <span className="text-slate-400 uppercase tracking-widest text-[7px] font-semibold mb-0.5">Ukuran</span>
                                                    <span className="font-bold text-slate-600">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                                </div>
                                            )}
                                            <div className="flex flex-col">
                                                <span className="text-slate-400 uppercase tracking-widest text-[7px] font-semibold mb-0.5">Fitur</span>
                                                <span className="font-bold text-slate-600">{geoData.features?.length || 1} Poligon</span>
                                            </div>
                                            <div className="flex flex-col col-span-2">
                                                <span className="text-slate-400 uppercase tracking-widest text-[7px] font-semibold mb-0.5">Tipe Geometri</span>
                                                <span className="font-bold text-slate-600 truncate">{geoData.features?.[0]?.geometry?.type || 'MultiPolygon'}</span>
                                            </div>
                                            {geoData.features?.[0]?.properties && (
                                                <div className="flex flex-col col-span-2 pt-2 border-t border-slate-50 mt-1">
                                                    <span className="text-slate-400 uppercase tracking-widest text-[7px] font-semibold mb-1">Atribut Data (Fields)</span>
                                                    <div className="space-y-1.5 mt-1 border-t border-slate-50 pt-2">
                                                        {Object.entries(geoData.features[0].properties || {})
                                                            .slice(0, expandedAttributes ? undefined : 8)
                                                            .map(([key, value]) => (
                                                                <div key={key} className="flex justify-between items-start text-[9px] border-b border-slate-50 pb-1 last:border-0 last:pb-0">
                                                                    <span className="text-slate-500 font-medium truncate pr-2" title={key}>{key}</span>
                                                                    <span className="text-slate-800 font-bold text-right break-words max-w-[65%]" title={String(value)}>
                                                                        {String(value) || '-'}
                                                                    </span>
                                                                </div>
                                                            ))}

                                                        {Object.keys(geoData.features[0].properties).length > 8 && (
                                                            <div className="pt-1 flex justify-center">
                                                                <button
                                                                    onClick={() => setExpandedAttributes(!expandedAttributes)}
                                                                    className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-full text-[8px] font-black uppercase tracking-widest border border-slate-200 transition-all flex items-center gap-1.5"
                                                                >
                                                                    {expandedAttributes ? (
                                                                        <>Show Less <ChevronUp size={10} /></>
                                                                    ) : (
                                                                        <>+{Object.keys(geoData.features[0].properties).length - 8} More Attributes <ChevronDown size={10} /></>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}


                </div>

                <div className="p-2 border-t border-slate-100 text-[9px] text-center text-slate-400">v2.0</div>
            </aside>



            {/* MAIN */}
            < main className="flex-1 relative flex flex-col h-full overflow-hidden" >


                {/* HISTORY DASHBOARD OVERLAY */}
                {
                    (((!data && !loading && !file && !geoData) || showHistoryTable) && !showAllPins && !showSidebar) && (
                        <div className="absolute inset-0 z-[2500] bg-slate-900/10 backdrop-blur-[2px]">
                            <div className="absolute inset-0 overflow-y-auto bg-slate-50/95 backdrop-blur-xl animate-in fade-in slide-in-from-bottom duration-500">
                                <HistoryDashboard
                                    history={historyData}
                                    loading={loadingHistory}
                                    isSidebarOpen={showSidebar}
                                    onDelete={handleDeleteHistory}
                                    onUpdateItem={handleUpdateHistoryItem}
                                    onSelect={handleHistorySelect}
                                    onReanalyze={handleHistoryReanalyze}
                                    onOpenCarbonMode={onOpenCarbonMode}
                                />
                            </div>
                        </div>
                    )
                }

                {/* MAP AREA */}
                <div className="flex-1 relative w-full h-full overflow-hidden bg-slate-900">
                    <MapContainer center={[-2.5, 118.0]} zoom={5} className="w-full h-full" zoomControl={false} maxZoom={24}>
                        {/* 1. LAYER DASAR (BASEMAP) */}
                        {((mapType === 'SENTINEL_RGB' && rgbMapUrl) || MAP_TILES[mapType].url) && (
                            <TileLayer
                                key={`basemap-${mapType}-${mapType === 'SENTINEL_RGB' ? rgbMapUrl : 'static'}`}
                                url={mapType === 'SENTINEL_RGB' ? rgbMapUrl : MAP_TILES[mapType].url}
                                attributed={MAP_TILES[mapType].attribution || ''}
                                subdomains={MAP_TILES[mapType].subdomains || []}
                                zIndex={1}
                                maxNativeZoom={20} // Google supports up to 20-21 typically
                                maxZoom={24} // Allow deeper over-zooming
                            />
                        )}

                        {/* 3. MAP CLICK HANDLER */}
                        <MapFitToGeoData
                            geoData={geoData}
                            trigger={shouldFitMap}
                            onComplete={() => setShouldFitMap(false)}
                        />
                        <MapClickHandler onMapClick={(lat, lng) => {
                            console.log('🗺️ Map Click detected:', lat, lng);




                            // Jangan tutup sidebar jika sedang ada file/SHP yang diload
                            // User ingin bisa geser peta tanpa menutup menu "Mulai Analisis"
                            if (showSidebar && !geoData && !file && !data) {
                                console.log('🔄 Map Click: No active workspace - Closing sidebar');
                                setShowSidebar(false);
                            } else if (showSidebar) {
                                console.log('🛡️ Map Click: Workspace active - Sidebar preserved');
                            }
                        }} />

                        {/* YEAR SELECTOR OVERLAY (Floating Top-Right) - DROPDOWN MODE */}
                        {data?.length > 1 && !showAllPins && geoData && (
                            <div className="absolute top-6 right-6 z-[1000] animate-in slide-in-from-top-2 fade-in duration-500">
                                <div className="relative group bg-white/80 backdrop-blur-md rounded-full border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.1)] p-1">
                                    {/* Icon Container */}
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Calendar size={14} className="text-slate-500" />
                                    </div>

                                    {/* Select Input */}
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                                        className="appearance-none bg-transparent hover:bg-white/50 pl-9 pr-8 py-1.5 rounded-full text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer transition-all uppercase tracking-wider"
                                    >
                                        {data.map(d => (
                                            <option key={d.year} value={d.year}>Tahun {d.year}</option>
                                        ))}
                                    </select>

                                    {/* Chevron */}
                                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                                        <ChevronDown size={14} className="text-slate-400" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. GLOBAL HISTORY VIEW (POLYGONS & PINS) */}
                        {showAllPins && !isCompareMode && (
                            <>
                                <MapAutoFitAll items={historyData} active={showAllPins} />
                                {historyData.map((item) => {
                                    if (!item.geo_data) return null;
                                    try {
                                        const bounds = L.geoJSON(item.geo_data).getBounds();
                                        if (!bounds.isValid()) return null;
                                        const center = bounds.getCenter();

                                        // Determine Status Color based on Trend
                                        const trendData = calculateTrends(item.analysis_results);
                                        const statusColor = trendData?.trendInfo?.hex || '#94a3b8'; // hex is added in utils or we map it here

                                        // Simple Mapping if hex not available in trendInfo
                                        const finalColor = trendData?.trendInfo?.hex || '#94a3b8';

                                        return (
                                            <React.Fragment key={`global-${item.id}`}>
                                                <GeoJSON
                                                    data={item.geo_data}
                                                    style={{ color: finalColor, weight: 1.5, fillOpacity: 0.1, dashArray: '4, 4' }}
                                                />
                                                {/* HASIL ANALISA: Gunakan ImageOverlay (Thumbnail) karena bersifat PERMANEN (Base64 di Cache/DB) */}
                                                {item.analysis_results?.[item.analysis_results.length - 1]?.thumb_url && (
                                                    <ImageOverlay
                                                        url={resolveThumbUrl(item.analysis_results[item.analysis_results.length - 1].thumb_url)}
                                                        bounds={bounds}
                                                        opacity={0.7}
                                                        zIndex={5}
                                                    />
                                                )}
                                                <Marker position={center} icon={createPinIcon(item.filename, finalColor)}>
                                                    <Popup className="custom-popup">
                                                        <div className="p-1 min-w-[120px]">
                                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Riwayat Lahan</div>
                                                            <div className="text-xs font-bold text-slate-800 mb-2">{item.filename}</div>
                                                            <div className="flex flex-col gap-2">
                                                                <button
                                                                    onClick={() => handleHistorySelect(item)}
                                                                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase rounded shadow-md transition-colors"
                                                                >
                                                                    Buka Analisis
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </Popup>
                                                </Marker>
                                            </React.Fragment>
                                        );
                                    } catch (e) { return null; }
                                })}
                            </>
                        )}

                        {/* DYNAMIC TILE LAYERS (HIGH RES GEE TILES) */}
                        {!isCompareMode && (
                            <>
                                {/* Bottom: Original Sentinel-2 RGB */}
                                {rgbMapUrl && showRgb && (
                                    <DynamicTileLayer
                                        url={rgbMapUrl}
                                        show={true}
                                        opacity={1}
                                        zIndex={195}
                                    />
                                )}
                                {mapUrl && (
                                    <DynamicTileLayer
                                        url={mapUrl}
                                        show={showOverlay}
                                        opacity={layerOpacity}
                                        zIndex={205}
                                    />
                                )}

                                {/* Slope Analysis Layer */}
                                {slopeMapUrl && (
                                    <DynamicTileLayer
                                        url={slopeMapUrl}
                                        show={showSlopeLayer}
                                        opacity={slopeOpacity}
                                        zIndex={200}
                                    />
                                )}
                            </>
                        )}

                        {/* SIGAP INTERAKTIF OVERLAYS (Geoportal MenLHK) - CACHED SERVICES (XYZ) */}
                        {showKawasanHutan && (
                            <TileLayer
                                key="sigap-hutan"
                                url={`${SIGAP_CONFIG.KAWASAN_HUTAN}/tile/{z}/{y}/{x}`}
                                opacity={kawasanHutanOpacity}
                                zIndex={100}
                                maxNativeZoom={12}
                                maxZoom={24}
                            />
                        )}
                        {showDAS && (
                            <TileLayer
                                key="sigap-das"
                                url={`${SIGAP_CONFIG.DAS}/tile/{z}/{y}/{x}`}
                                opacity={dasOpacity}
                                zIndex={99}
                                maxNativeZoom={12}
                                maxZoom={24}
                            />
                        )}

                        {/* NASA FIRMS HOTSPOT LAYER (Fire Points) */}
                        {showNasaHotspot && nasaHotspotData.length > 0 && nasaHotspotData.map((feature, idx) => {
                            const coords = feature.geometry?.coordinates;
                            if (!coords) return null;

                            // Apply tiny jitter to handle overlapping points (same coordinates)
                            // Using idx to ensure stable but slightly different positions
                            const jitter = (idx % 10) * 0.0001;
                            const [lng, lat] = [coords[0] + jitter, coords[1] + jitter];

                            const props = feature.properties || {};

                            // Color based on confidence level
                            const confidenceColor = props.confidence === 'high' ? '#dc2626' :
                                props.confidence === 'nominal' ? '#f97316' : '#fbbf24';

                            return (
                                <CircleMarker
                                    key={`hotspot-${idx}`}
                                    center={[lat, lng]}
                                    radius={6}
                                    pathOptions={{
                                        color: '#dc2626',
                                        fillColor: confidenceColor,
                                        fillOpacity: 0.8,
                                        weight: 2
                                    }}
                                >
                                    <Popup>
                                        <div className="text-xs space-y-1 min-w-[220px]">
                                            <div className="font-black text-orange-600 text-sm border-b pb-1 mb-2 flex justify-between items-center">
                                                <span>🔥 Hotspot NASA FIRMS</span>
                                                <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold">
                                                    {props.satellite === 'N' ? 'VIIRS-SNPP' : props.satellite === 'J1' ? 'VIIRS-NOAA20' : 'VIIRS'}
                                                </span>
                                            </div>

                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Tanggal Deteksi:</span>
                                                <span className="font-bold">{props.acq_date || '-'}</span>
                                            </div>
                                            {props.acq_time && (
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500">Waktu (UTC):</span>
                                                    <span className="font-bold">{props.acq_time.slice(0, 2)}:{props.acq_time.slice(2)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Siang/Malam:</span>
                                                <span className="font-bold">{props.daynight === 'D' ? '☀️ Siang' : '🌙 Malam'}</span>
                                            </div>

                                            <div className="h-px bg-slate-100 my-1" />

                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Latitude:</span>
                                                <span className="font-bold">{lat.toFixed(5)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Longitude:</span>
                                                <span className="font-bold">{lng.toFixed(5)}</span>
                                            </div>

                                            <div className="h-px bg-slate-100 my-1" />

                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Brightness (K):</span>
                                                <span className="font-bold text-red-600">{props.brightness?.toFixed(1) || props.bright_ti4?.toFixed(1) || '-'}</span>
                                            </div>
                                            {props.frp > 0 && (
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500">Fire Radiative Power:</span>
                                                    <span className="font-bold">{props.frp?.toFixed(1)} MW</span>
                                                </div>
                                            )}

                                            <div className="mt-2 pt-1 border-t flex justify-between items-center text-[10px]">
                                                <span className="text-slate-400">Confidence:</span>
                                                <span className={`font-bold uppercase ${props.confidence === 'high' ? 'text-red-600' :
                                                    props.confidence === 'nominal' ? 'text-orange-500' : 'text-yellow-500'
                                                    }`}>
                                                    {props.confidence || '-'}
                                                </span>
                                            </div>
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            );
                        })}



                        {/* PERSISTENT CLIPPED IMAGERY FALLBACK (GEE THUMBNAILS) */}
                        {!isCompareMode && geoData && (
                            (() => {
                                try {
                                    const bounds = L.geoJSON(geoData).getBounds();
                                    if (!bounds.isValid()) return null;

                                    return (
                                        <>
                                            {/* Fallback RGB (Only if tiles miss) */}
                                            {selectedYearData?.rgb_thumb_url && !rgbMapUrl && (
                                                <ImageOverlay
                                                    key={`rgb-thumb-${selectedYear}`}
                                                    url={resolveThumbUrl(selectedYearData.rgb_thumb_url)}
                                                    bounds={bounds}
                                                    opacity={1}
                                                    zIndex={190}
                                                />
                                            )}

                                            {/* Fallback Classification (Only if tiles miss) */}
                                            {selectedYearData?.thumb_url && showOverlay && !mapUrl && (
                                                <ImageOverlay
                                                    key={`class-thumb-${selectedYear}`}
                                                    url={resolveThumbUrl(selectedYearData.thumb_url)}
                                                    bounds={bounds}
                                                    opacity={polygonOpacity}
                                                    zIndex={200}
                                                />
                                            )}
                                        </>
                                    );
                                } catch (e) { return null; }
                            })()
                        )}

                        {/* 4. COMPARE MODE (SWIPE) */}
                        {isCompareMode && (
                            <SwipeMapControl
                                leftUrl={compareMapUrl || compareRgbMapUrl}
                                rightUrl={mapUrl || rgbMapUrl}
                                show={true}
                            />
                        )}

                        {geoData && (
                            <>
                                {vectorLayerData && showOverlay && !isCompareMode && (
                                    <GeoJSON
                                        key={`vector-${selectedYear}-${vectorLayerData?.features?.length || 0}-${polygonOpacity}`}
                                        data={vectorLayerData}
                                        style={(feature) => {
                                            const classId = feature.properties.class;
                                            let color = '#cccccc';
                                            if (classId === 1) color = LAND_COVER_CONFIG.hutan_primer.color;
                                            if (classId === 2) color = LAND_COVER_CONFIG.hutan_sekunder.color;
                                            if (classId === 3) color = LAND_COVER_CONFIG.tanah_kering.color;
                                            if (classId === 4) color = LAND_COVER_CONFIG.tanah_kosong.color;
                                            if (classId === 5) color = LAND_COVER_CONFIG.air.color;
                                            if (classId === 6) color = LAND_COVER_CONFIG.lahan_terbangun.color;
                                            return {
                                                fillColor: color,
                                                fillOpacity: polygonOpacity,
                                                weight: 0,
                                                color: 'transparent'
                                            };
                                        }}
                                    />
                                )}
                                <GeoJSON key={`${file?.id || 'no-id'}-${selectedYear}-${showOverlay}-${showSlopeLayer}-${polygonOpacity}-${dominantLandCover?.key}`} data={geoData} style={getPolygonStyle(showOverlay, showSlopeLayer)} />
                                <MapRecenter data={vectorLayerData || geoData} uniqueKey={file ? (file.id || file.name) : (geoData ? 'geo' : 'none')} />
                            </>
                        )}

                        {/* 5. MODE LAPANGAN INDICATOR (Visible whenever ON, regardless of SHP) */}
                        {fieldMode && userLocation && (
                            <CircleMarker
                                center={[userLocation.lat, userLocation.lng]}
                                radius={8}
                                pathOptions={{
                                    fillColor: isInsideShp ? '#22c55e' : '#ef4444',
                                    color: 'white',
                                    weight: 2,
                                    fillOpacity: 0.9
                                }}
                                zIndex={3000}
                            >
                                <Popup>
                                    <div className="text-[10px] font-bold py-1 px-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`w-2 h-2 rounded-full ${isInsideShp ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                            <span className="uppercase tracking-tight">Status: {isInsideShp ? 'DI DALAM SHP' : 'DI LUAR SHP'}</span>
                                        </div>
                                        <div className="text-slate-400 font-medium">GPS: {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}</div>
                                    </div>
                                </Popup>
                            </CircleMarker>
                        )}

                        <IdentifySigapFeatures
                            activeLayers={{
                                hutan: showKawasanHutan,
                                das: showDAS
                            }}
                            onResult={(latlng, features) => setIdentifyResult({ latlng, features })}
                        />
                        {identifyResult && (
                            <Popup position={identifyResult.latlng} onClose={() => setIdentifyResult(null)}>
                                <div className="min-w-[200px] max-h-[300px] overflow-y-auto no-scrollbar">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 border-b pb-1">Informasi Wilayah & SIGAP</div>
                                    {identifyResult.features.map((feature, idx) => (
                                        <div key={idx} className="mb-3 last:mb-0 pb-2 border-b border-slate-50 last:border-0">
                                            <div className="text-[10px] font-bold text-slate-800 mb-0.5">{feature.layerName}</div>
                                            <div className="text-[10px] text-slate-600 space-y-0.5">
                                                {Object.entries(feature.attributes).map(([k, v]) => {
                                                    const key = k.toLowerCase();
                                                    // Skip technical IDs and empty values
                                                    if (key.includes('objectid') || key.includes('shape') || !v || v === 'Null' || v === ' ') return null;

                                                    // Filter for meaningful fields
                                                    const isMeaningful = key.includes('nama') || key.includes('fungsi') || key.includes('sk') ||
                                                        key.includes('keterangan') || key.includes('prov') || key.includes('kab') ||
                                                        key.includes('kec') || key.includes('desa') || key.includes('kelurahan') ||
                                                        key.includes('namobj') || key.includes('remark');

                                                    if (isMeaningful) {
                                                        return (
                                                            <div key={k} className="flex gap-1 border-l-2 border-slate-100 pl-1.5">
                                                                <span className="font-semibold opacity-60 text-[9px] uppercase">{k}:</span>
                                                                <span className="font-medium text-slate-700">{v}</span>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Popup>
                        )}

                    </MapContainer>

                    {isCompareMode && data && (
                        <div className="absolute top-14 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur rounded-xl px-4 py-2 shadow-2xl border border-indigo-200 z-[1000] flex items-center gap-4">
                            <div className="text-center">
                                <div className="text-[10px] text-slate-500 uppercase font-bold">Kiri (Sebelum)</div>
                                <select
                                    value={compareYear}
                                    onChange={(e) => {
                                        const y = parseInt(e.target.value);
                                        setCompareYear(y);
                                        const d = data.find(item => item.year === y);
                                        setCompareMapUrl(d?.map_url);
                                        setCompareRgbMapUrl(d?.rgb_url);
                                    }}
                                    className="text-xs border-none bg-transparent font-bold text-indigo-600 focus:ring-0 p-0 text-center cursor-pointer"
                                >
                                    {data.map(d => <option key={d.year} value={d.year}>{d.year}</option>)}
                                </select>
                            </div>
                            <div className="text-slate-300"><Split size={20} /></div>
                            <div className="text-center">
                                <div className="text-[10px] text-slate-500 uppercase font-bold">Kanan (Sesudah)</div>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => {
                                        const y = parseInt(e.target.value);
                                        setSelectedYear(y);
                                        // The useEffect in App.jsx will take care of sync
                                    }}
                                    className="text-xs border-none bg-transparent font-bold text-emerald-600 focus:ring-0 p-0 text-center cursor-pointer"
                                >
                                    {data.map(d => <option key={d.year} value={d.year}>{d.year}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* SIGAP LAYER CONTROLS (Floating Panel) */}
                <div className={`absolute z-[3001] flex flex-col pointer-events-none gap-2 transition-all duration-300 ${showSidebar ? 'opacity-0' : 'opacity-100'} 
                    top-20 left-6 items-start`}>

                    {/* Collapsible Panel */}
                    <div className={`transition-all duration-300 origin-top-left ${showSigapPanel ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 -translate-y-4 pointer-events-none h-0 overflow-hidden'}`}>
                        <div className="bg-white/95 backdrop-blur-xl p-3 rounded-2xl shadow-xl border border-white/50 pointer-events-auto w-[260px] max-h-[65vh] md:max-h-[80vh] overflow-y-auto no-scrollbar ring-1 ring-black/5">
                            <div className="text-[10px] font-black uppercase text-slate-500 mb-4 tracking-widest px-1 sticky top-0 bg-white/50 backdrop-blur-sm pb-2 z-10 border-b border-slate-100 flex justify-between items-center">
                                <span>Layer & Legenda</span>
                                <button onClick={() => setShowSigapPanel(false)} className="text-slate-400 hover:text-slate-600 md:hidden p-1">
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="flex flex-col gap-4">
                                {/* SECTION 1: LEGEND TUTUPAN LAHAN (Analysis Result) */}
                                {data && (
                                    <div className="flex flex-col gap-2">
                                        <div className="text-[9px] font-bold text-slate-500 uppercase px-1">Tutupan Lahan</div>
                                        <div className="grid grid-cols-1 gap-1.5">
                                            {Object.entries(LAND_COVER_CONFIG).map(([key, config]) => (
                                                <div key={key} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 transition-colors">
                                                    <span className="w-3 h-3 rounded flex-shrink-0 shadow-sm" style={{ backgroundColor: config.color }} />
                                                    <span className="text-[10px] font-medium text-slate-700">{config.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* SECTION 2: SIGAP OVERLAYS */}
                                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase px-1">Overlay Kehutanan</div>

                                    <div className="flex flex-col gap-1">
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowKawasanHutan(!showKawasanHutan);
                                            }}
                                            className="flex items-center justify-between cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors border border-transparent hover:border-slate-100 group"
                                        >
                                            <div className="flex items-center gap-2.5" >
                                                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${showKawasanHutan ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`}>
                                                    {showKawasanHutan && <CheckCircle2 size={10} className="text-white" />}
                                                </div>
                                                <span className={`text-[10px] font-bold transition-colors ${showKawasanHutan ? 'text-slate-800' : 'text-slate-500 group-hover:text-slate-700'}`}>Kawasan Hutan</span>
                                            </div>
                                        </div>
                                        {showKawasanHutan && (
                                            <div className="px-2 pt-1 pb-1 animate-in slide-in-from-top-1">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-[8px] text-slate-400 uppercase font-black tracking-wider">Opasitas</span>
                                                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 rounded">
                                                        {(kawasanHutanOpacity * 100).toFixed(0)}%
                                                    </span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0" max="1" step="0.1"
                                                    value={kawasanHutanOpacity}
                                                    onChange={(e) => setKawasanHutanOpacity(parseFloat(e.target.value))}
                                                    className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowDAS(!showDAS);
                                            }}
                                            className="flex items-center justify-between cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors border border-transparent hover:border-slate-100 group"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${showDAS ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}`}>
                                                    {showDAS && <CheckCircle2 size={10} className="text-white" />}
                                                </div>
                                                <span className={`text-[10px] font-bold transition-colors ${showDAS ? 'text-slate-800' : 'text-slate-500 group-hover:text-slate-700'}`}>Daerah Aliran Sungai</span>
                                            </div>
                                        </div>
                                        {showDAS && (
                                            <div className="px-2 pt-1 pb-1 animate-in slide-in-from-top-1">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-[8px] text-slate-400 uppercase font-black tracking-wider">Opasitas</span>
                                                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded">
                                                        {(dasOpacity * 100).toFixed(0)}%
                                                    </span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0" max="1" step="0.1"
                                                    value={dasOpacity}
                                                    onChange={(e) => setDasOpacity(parseFloat(e.target.value))}
                                                    className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const newSlopeState = !showSlopeLayer;
                                                setShowSlopeLayer(newSlopeState);
                                                // Auto turn off tutupan lahan when slope is enabled
                                                if (newSlopeState) {
                                                    setShowOverlay(false);
                                                }
                                            }}
                                            className="flex items-center justify-between cursor-pointer hover:bg-orange-50 p-1.5 rounded-lg transition-colors border border-transparent hover:border-orange-100 group"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${showSlopeLayer ? 'bg-orange-500 border-orange-500' : 'bg-white border-slate-300'}`}>
                                                    {showSlopeLayer && <CheckCircle2 size={10} className="text-white" />}
                                                </div>
                                                <span className={`text-[10px] font-bold transition-colors ${showSlopeLayer ? 'text-slate-800' : 'text-slate-500 group-hover:text-slate-700'}`}>Analisis Kelerengan (Slope)</span>
                                            </div>
                                        </div>
                                        {showSlopeLayer && (
                                            <div className="px-2 pt-1 pb-1 animate-in slide-in-from-top-1">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-[8px] text-slate-400 uppercase font-black tracking-wider">Opasitas</span>
                                                    <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 rounded">
                                                        {(slopeOpacity * 100).toFixed(0)}%
                                                    </span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0" max="1" step="0.1"
                                                    value={slopeOpacity}
                                                    onChange={(e) => setSlopeOpacity(parseFloat(e.target.value))}
                                                    className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400"
                                                />
                                                <SlopeLegend show={true} />
                                            </div>
                                        )}
                                    </div>

                                    {/* NASA FIRMS Hotspot Layer (Fire Points) */}
                                    {geoData && (
                                        <div className="flex flex-col gap-1 pt-2 border-t border-slate-100">
                                            <div className="text-[9px] font-bold text-orange-600 uppercase px-1 flex items-center gap-1">
                                                🔥 Titik Panas (NASA FIRMS)
                                            </div>
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowNasaHotspot(!showNasaHotspot);
                                                }}
                                                className="flex items-center justify-between cursor-pointer hover:bg-orange-50 p-1.5 rounded-lg transition-colors border border-transparent hover:border-orange-100 group"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${showNasaHotspot ? 'bg-orange-500 border-orange-500' : 'bg-white border-slate-300'}`}>
                                                        {showNasaHotspot && <CheckCircle2 size={10} className="text-white" />}
                                                    </div>
                                                    <span className={`text-[10px] font-bold transition-colors ${showNasaHotspot ? 'text-slate-800' : 'text-slate-500 group-hover:text-slate-700'}`}>
                                                        Hotspot Kebakaran
                                                    </span>
                                                </div>
                                                {nasaLoading && (
                                                    <div className="w-3 h-3 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
                                                )}
                                            </div>
                                            {showNasaHotspot && (
                                                <div className="px-2 text-[9px] text-slate-500">
                                                    {nasaLoading ? (
                                                        <span className="italic">Memuat data NASA FIRMS...</span>
                                                    ) : nasaError ? (
                                                        <span className="text-red-500">{nasaError}</span>
                                                    ) : (
                                                        <span>{nasaHotspotData.length} titik hotspot (1 Jan - 31 Des {selectedYear || new Date().getFullYear()})</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Integrated Legend Section - Renamed Title */}
                                    {(showKawasanHutan || showDAS) && (
                                        <div className="pt-3 mt-1 border-t border-slate-100 animate-in fade-in">
                                            <div className="flex items-center justify-between mb-3 px-1">
                                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Kelas Hutan / DAS</span>
                                                <List size={11} className="text-slate-400" />
                                            </div>
                                            <SigapLegend activeLayers={{ hutan: showKawasanHutan, das: showDAS }} />
                                        </div>
                                    )}

                                    {/* 🔄 TEMPORAL STATUS LEGEND (NEW - OPTIONAL STEP 8) */}
                                    {showTemporalStatus && temporalStatusData && (
                                        <TemporalStatusLegend show={true} />
                                    )}
                                    {/* END TEMPORAL STATUS LEGEND */}

                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* FLOATING CHART PANEL - Compact & Proportional */}
                {
                    ((activeChartData && activeChartData.length > 0) || loading || showAllPins) && (
                        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[95%] max-w-5xl transition-all duration-500 ${showSidebar ? 'md:translate-x-[20px] md:max-w-4xl' : ''}`}>
                            <div className={`bg-white/95 backdrop-blur-xl border border-emerald-100/50 rounded-[2rem] shadow-[0_10px_40px_rgba(0,0,0,0.15)] transition-all duration-700 overflow-hidden ${showChart ? 'h-[85vh] md:h-[26rem]' : 'h-16'}`}>

                                {/* Header Toggle */}
                                <div className="flex items-center justify-between px-4 md:px-5 py-2.5 md:py-3 cursor-pointer hover:bg-slate-50/50 transition-colors" onClick={() => setShowChart(!showChart)}>
                                    <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                                        {!loading && (
                                            <div className="flex items-center gap-2 md:gap-3 animate-in fade-in duration-300 overflow-hidden">
                                                {/* Back to Menu Button (only when viewing specific analysis) */}
                                                {!showAllPins && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleReset(); }}
                                                        className="p-1.5 md:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all shadow-sm border border-slate-200"
                                                        title="Kembali ke Menu Utama"
                                                    >
                                                        <ArrowLeft size={14} className="md:w-[16px] md:h-[16px]" />
                                                    </button>
                                                )}
                                                <div className={`p-1.5 md:p-2 rounded-xl shadow-sm transition-all duration-500 ${showChart ? 'bg-emerald-600 text-white rotate-0' : 'bg-white border border-slate-100 text-emerald-600 rotate-0'}`}>
                                                    <BarChart3 size={16} className="md:w-[18px] md:h-[18px]" />
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                    <div className="flex items-center">
                                                        <span className="font-bold text-[12px] md:text-sm tracking-tight text-slate-800 line-clamp-1">
                                                            {showAllPins ? 'DASHBOARD GealGeolGeo' : (file?.name ? `${file.name.replace('.zip', '').replace('.geojson', '')}` : 'Analisis Multitemporal')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 md:p-2 rounded-full transition-transform duration-300 ${showChart ? 'rotate-180 bg-slate-100 text-slate-500' : 'rotate-0 text-emerald-500'}`}>
                                            <ChevronUp size={16} className="md:w-[18px] md:h-[18px]" />
                                        </div>
                                    </div>
                                </div>

                                {showChart && (
                                    <div className="px-6 pb-5 h-[calc(100%-4rem)] animate-in fade-in slide-in-from-bottom-10 duration-700 overflow-y-auto">
                                        {loading ? (
                                            <div className="h-full flex flex-col items-center justify-center px-12 gap-8 animate-in fade-in duration-500">
                                                <div className="w-full max-w-2xl space-y-4">
                                                    <div className="flex items-center justify-between px-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] animate-pulse">
                                                                {progressStep || "Sedang Memproses"}
                                                            </span>
                                                            <span className="text-sm font-black text-slate-800 tracking-tight">
                                                                {progressDetail || "Menghubungkan ke satelit..."}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-end gap-1">
                                                            <span className="text-3xl font-black text-emerald-600 tracking-tighter">{progress}</span>
                                                            <span className="text-sm font-bold text-emerald-400 mb-1.5">%</span>
                                                        </div>
                                                    </div>

                                                    <div className="relative h-4 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner p-1 border border-slate-200/50">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-emerald-400 via-emerald-600 to-teal-700 rounded-full transition-all duration-700 ease-out relative shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                                                            style={{ width: `${progress}%` }}
                                                        >
                                                            <div className="absolute top-0 right-0 bottom-0 w-24 bg-gradient-to-r from-transparent to-white/30 animate-shimmer" />
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center px-2">
                                                        <div className="flex items-center gap-2 opacity-40">
                                                            <Satellite size={12} className="animate-bounce" />
                                                            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Sentinel-2 Mission</span>
                                                        </div>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic flex items-center gap-1.5">
                                                            {timeLeft !== null && timeLeft !== undefined ? (
                                                                <>
                                                                    <Clock size={10} className={timeLeft < 10 ? "text-amber-500 animate-pulse" : "text-slate-400"} />
                                                                    {timeLeft > 0
                                                                        ? `Estimasi Selesai: ~${timeLeft} detik`
                                                                        : <span className="text-emerald-500 animate-pulse">Sedikit lagi... Finalisasi data...</span>}
                                                                </>
                                                            ) : (
                                                                "Harap tunggu, komputasi Cloud GEE sedang berjalan..."
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-full flex flex-col">
                                                {/* Tab Switcher */}
                                                {/* Tab Switcher & Year Selector Header */}
                                                <div className="flex justify-between items-center px-1 mb-2 border-b border-slate-100/50 pb-2 shrink-0">
                                                    <div className="flex gap-2">
                                                        {showAllPins && (
                                                            <button
                                                                onClick={() => setChartTab('summary')}
                                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${chartTab === 'summary'
                                                                    ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 shadow-sm'
                                                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                                                    }`}
                                                            >
                                                                <Grid size={12} /> Ringkasan Data
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setChartTab('bar')}
                                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${chartTab === 'bar'
                                                                ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 shadow-sm'
                                                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                                                }`}
                                                        >
                                                            <BarChart3 size={12} /> Grafik Batang
                                                        </button>
                                                        <button
                                                            onClick={() => setChartTab('area')}
                                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${chartTab === 'area'
                                                                ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 shadow-sm'
                                                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                                                }`}
                                                        >
                                                            <Activity size={12} /> Area Akumulatif
                                                        </button>

                                                        {slopeDbSummary && (
                                                            <button
                                                                onClick={() => setChartTab('slope')}
                                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${chartTab === 'slope'
                                                                    ? 'bg-orange-50 text-orange-600 ring-1 ring-orange-100 shadow-sm'
                                                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                                                    }`}
                                                            >
                                                                <TrendingUp size={12} /> Slope
                                                            </button>
                                                        )}
                                                    </div>


                                                </div>


                                                {/* Content Area */}
                                                <div className="flex-1 min-h-0 overflow-hidden">
                                                    {chartTab === 'summary' ? (
                                                        <div className="h-full overflow-y-auto pr-1">
                                                            <GlobalGridDashboard stats={globalStats} />
                                                        </div>
                                                    ) : chartTab === 'slope' ? (
                                                        <div className="h-full overflow-y-auto pr-1 flex flex-col gap-4">
                                                            <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Statistik Kelerengan (Digital Elevation Model)</div>

                                                            {/* Summary Comparison Card */}
                                                            {slopeDbSummary && slopeDbSummaryOutside && (
                                                                <div className="bg-gradient-to-r from-orange-50 to-blue-50 rounded-2xl p-4 border border-slate-100 shadow-sm">
                                                                    <div className="flex items-center gap-2 mb-3">
                                                                        <Info size={14} className="text-slate-500" />
                                                                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Ringkasan Perbandingan</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-4 text-center">
                                                                        <div>
                                                                            <div className="text-[9px] text-slate-400 uppercase font-bold">Dalam Kawasan</div>
                                                                            <div className="text-lg font-black text-orange-600">{slopeDbSummary.avg_slope || 0}%</div>
                                                                            <div className="text-[9px] text-slate-500">rerata kelerengan</div>
                                                                        </div>
                                                                        <div>
                                                                            <div className="text-[9px] text-slate-400 uppercase font-bold">Buffer 2 KM</div>
                                                                            <div className="text-lg font-black text-blue-600">{slopeDbSummaryOutside.avg_slope || 0}%</div>
                                                                            <div className="text-[9px] text-slate-500">rerata kelerengan</div>
                                                                        </div>
                                                                    </div>
                                                                    {(() => {
                                                                        const diff = (Number(slopeDbSummary.avg_slope) || 0) - (Number(slopeDbSummaryOutside.avg_slope) || 0);
                                                                        const isHigher = diff > 0;
                                                                        return (
                                                                            <div className="mt-3 pt-3 border-t border-slate-200/50 text-center">
                                                                                <span className={`text-[10px] font-bold ${isHigher ? 'text-orange-600' : 'text-blue-600'}`}>
                                                                                    Kawasan {isHigher ? 'lebih curam' : 'lebih landai'} {Math.abs(diff).toFixed(1)}% dari area buffer
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            )}

                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <SlopeDataPanel summary={slopeDbSummary} title="Dalam Kawasan" variant="inside" />
                                                                {slopeDbSummaryOutside ? (
                                                                    <SlopeDataPanel summary={slopeDbSummaryOutside} title="Buffer 2 KM" variant="outside" />
                                                                ) : (
                                                                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                                                                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
                                                                            <Info size={20} />
                                                                        </div>
                                                                        <div className="text-[10px] font-bold text-slate-500 uppercase">Buffer 2 KM</div>
                                                                        <p className="text-[9px] text-slate-400 mt-1 max-w-[200px]">Data buffer belum tersedia untuk wilayah ini.</p>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="text-[9px] text-slate-400 italic text-center mt-2">
                                                                Data slope diukur berdasarkan Topografi SRTM v3 dengan resolusi 30 meter.
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col md:flex-row gap-4 h-full">

                                                            <div className="flex-1 min-w-0 h-full shrink-0 min-h-[250px] md:min-h-0 relative">
                                                                {chartTab === 'bar' ? (
                                                                    <div className="h-full w-full relative group/chart">
                                                                        <ResponsiveContainer width="100%" height="100%">
                                                                            <BarChart data={activeChartData} barCategoryGap="15%" barGap={1} margin={{ top: 35, right: 10, left: -20, bottom: 0 }}>
                                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 600, fill: '#94a3b8' }} dy={10} />
                                                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 600, fill: '#94a3b8' }} padding={{ top: 30 }} />
                                                                                <Tooltip
                                                                                    cursor={{ fill: '#f8fafc' }}
                                                                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '10px', padding: '8px' }}
                                                                                    content={<CustomTooltip />}
                                                                                />
                                                                                {Object.entries(LAND_COVER_CONFIG).map(([key, config]) => (
                                                                                    <Bar key={key} dataKey={key} name={config.shortLabel} fill={config.color} radius={[4, 4, 1, 1]}>
                                                                                        <LabelList
                                                                                            dataKey={key}
                                                                                            position="top"
                                                                                            formatter={(val) => {
                                                                                                if (!val || val < 5) return '';
                                                                                                return val.toFixed(1);
                                                                                            }}
                                                                                            style={{ fontSize: '9px', fontWeight: 'bold', fill: config.color }}
                                                                                            dy={-3}
                                                                                        />
                                                                                    </Bar>
                                                                                ))}

                                                                            </BarChart>
                                                                        </ResponsiveContainer>
                                                                    </div>
                                                                ) : (
                                                                    <div className="h-full w-full relative group/chart">
                                                                        <ResponsiveContainer width="100%" height="100%">
                                                                            <AreaChart data={activeChartData} margin={{ top: 35, right: 10, left: -20, bottom: 0 }}>
                                                                                <defs>
                                                                                    <linearGradient id="colorHutanPrimer" x1="0" y1="0" x2="0" y2="1">
                                                                                        <stop offset="5%" stopColor="#006400" stopOpacity={0.8} />
                                                                                        <stop offset="95%" stopColor="#006400" stopOpacity={0.1} />
                                                                                    </linearGradient>
                                                                                    <linearGradient id="colorHutanSekunder" x1="0" y1="0" x2="0" y2="1">
                                                                                        <stop offset="5%" stopColor="#32CD32" stopOpacity={0.8} />
                                                                                        <stop offset="95%" stopColor="#32CD32" stopOpacity={0.1} />
                                                                                    </linearGradient>
                                                                                    <linearGradient id="colorKering" x1="0" y1="0" x2="0" y2="1">
                                                                                        <stop offset="5%" stopColor="#DAA520" stopOpacity={0.8} />
                                                                                        <stop offset="95%" stopColor="#DAA520" stopOpacity={0.1} />
                                                                                    </linearGradient>
                                                                                    <linearGradient id="colorKosong" x1="0" y1="0" x2="0" y2="1">
                                                                                        <stop offset="5%" stopColor="#D2691E" stopOpacity={0.8} />
                                                                                        <stop offset="95%" stopColor="#D2691E" stopOpacity={0.1} />
                                                                                    </linearGradient>
                                                                                    <linearGradient id="colorTerbangun" x1="0" y1="0" x2="0" y2="1">
                                                                                        <stop offset="5%" stopColor="#708090" stopOpacity={0.8} />
                                                                                        <stop offset="95%" stopColor="#708090" stopOpacity={0.1} />
                                                                                    </linearGradient>
                                                                                    <linearGradient id="colorAir" x1="0" y1="0" x2="0" y2="1">
                                                                                        <stop offset="5%" stopColor="#1E90FF" stopOpacity={0.8} />
                                                                                        <stop offset="95%" stopColor="#1E90FF" stopOpacity={0.1} />
                                                                                    </linearGradient>
                                                                                </defs>
                                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 600, fill: '#94a3b8' }} dy={10} />
                                                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 600, fill: '#94a3b8' }} padding={{ top: 30 }} />
                                                                                <Tooltip
                                                                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '10px', padding: '8px' }}
                                                                                    content={<CustomTooltip />}
                                                                                    cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                                                                />
                                                                                {/* Stacked from Bottom to Top to match PDF visual logic */}
                                                                                <Area type="monotone" dataKey="air" stackId="1" stroke="#1E90FF" fill="url(#colorAir)" name="Air (Sungai/Danau)" />
                                                                                <Area type="monotone" dataKey="lahan_terbangun" stackId="1" stroke="#708090" fill="url(#colorTerbangun)" name="Lahan Terbangun (Urban)" />
                                                                                <Area type="monotone" dataKey="tanah_kosong" stackId="1" stroke="#D2691E" fill="url(#colorKosong)" name="Tanah Kosong" />
                                                                                <Area type="monotone" dataKey="tanah_kering" stackId="1" stroke="#DAA520" fill="url(#colorKering)" name="Tanah Kering" />
                                                                                <Area type="monotone" dataKey="hutan_sekunder" stackId="1" stroke="#32CD32" fill="url(#colorHutanSekunder)" name="Hutan Sekunder" />
                                                                                <Area type="monotone" dataKey="hutan_primer" stackId="1" stroke="#006400" fill="url(#colorHutanPrimer)" name="Hutan Primer" />
                                                                            </AreaChart>
                                                                        </ResponsiveContainer>
                                                                    </div>
                                                                )}
                                                            </div>


                                                            <div className="w-full md:w-80 flex flex-col gap-2 py-1">

                                                                {/* Total Area Display - Top Position */}
                                                                <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                                                    <div className="flex items-center gap-2">
                                                                        <Maximize size={12} className="text-slate-400" />
                                                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Luas Wilayah</span>
                                                                    </div>
                                                                    <div className="flex items-baseline gap-1">
                                                                        <span className="text-sm font-black text-slate-700">{(showAllPins && globalStats ? globalStats.totalHektar : activeStats?.total)?.toFixed(1) || '0'}</span>
                                                                        <span className="text-[9px] font-bold text-slate-400 uppercase">Ha</span>
                                                                    </div>
                                                                </div>

                                                                {/* Trend Analysis Section */}
                                                                {activeChartData.length > 1 && (() => {
                                                                    const trendData = calculateTrends(activeChartData);
                                                                    let narrative = generateVerbalNarrative(trendData);

                                                                    // Override with Global Stats if in Global View to ensure consistency with Summary Tab
                                                                    if (showAllPins && globalNarrative && globalStats) {
                                                                        narrative = {
                                                                            ...narrative,
                                                                            highlight: globalNarrative,
                                                                            status: {
                                                                                type: globalStats.perubahanBersihHa < -0.1 ? 'error' : (globalStats.perubahanBersihHa > 0.1 ? 'success' : 'info')
                                                                            }
                                                                        };
                                                                        // Override badge info to match global transition logic
                                                                        trendData.trendInfo = {
                                                                            label: globalStats.perubahanBersihHa < -0.1 ? 'Deforestasi Terdeteksi' : (globalStats.perubahanBersihHa > 0.1 ? 'Pemulihan Tutupan' : 'Stabil'),
                                                                            color: globalStats.perubahanBersihHa < -0.1 ? 'bg-red-500 text-white shadow-sm shadow-red-200' : (globalStats.perubahanBersihHa > 0.1 ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200' : 'bg-slate-500 text-white')
                                                                        };
                                                                    }

                                                                    if (!trendData || !narrative) return null;

                                                                    const statusColors = {
                                                                        error: 'bg-red-50 text-red-700 border-red-100',
                                                                        success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                                                                        warning: 'bg-orange-50 text-orange-700 border-orange-100',
                                                                        info: 'bg-slate-50 text-slate-700 border-slate-100'
                                                                    };

                                                                    return (
                                                                        <div className={`p-2 rounded-xl border ${statusColors[narrative.status.type]} flex flex-col gap-1`}>
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                                                                                    <Activity size={10} /> {showAllPins ? 'Global' : 'Analisis Tren Tutupan'}
                                                                                </span>
                                                                                <span className={`px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase ${trendData.trendInfo.color}`}>
                                                                                    {trendData.trendInfo.label}
                                                                                </span>
                                                                            </div>
                                                                            <div className="text-[10px] md:text-[11px] leading-tight font-bold text-slate-800">
                                                                                {narrative.highlight}
                                                                            </div>
                                                                            <div className="text-[8px] opacity-70 italic">
                                                                                Periode: {trendData.startYear} - {trendData.endYear} ({trendData.period} thn)
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}

                                                                {selectedYearData && chartTab === 'bar' && (
                                                                    <div className="bg-white border border-slate-200 rounded-xl p-2 space-y-1.5 shadow-sm">
                                                                        <div className="flex items-center gap-1.5 border-b border-slate-50 pb-1.5">
                                                                            <Split size={12} className="text-emerald-600" />
                                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ringkasan Transisi ({selectedYear})</span>
                                                                        </div>
                                                                        <div className="grid grid-cols-1 gap-1.5">
                                                                            <div className="flex items-center justify-between bg-red-50/50 p-1.5 rounded-lg border border-red-100/30">
                                                                                <div className="flex items-center gap-2">
                                                                                    <TrendingDown size={14} className="text-red-500" />
                                                                                    <span className="text-[10px] font-bold text-slate-600">Kejadian Deforestasi</span>
                                                                                </div>
                                                                                <span className="text-[10px] font-black text-red-700">{(sidebarTransitionStats?.loss || 0).toFixed(1)} <span className="text-[8px] font-bold opacity-60 uppercase">Ha</span></span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100/30">
                                                                                <div className="flex items-center gap-2">
                                                                                    <TrendingUp size={14} className="text-emerald-500" />
                                                                                    <span className="text-[10px] font-bold text-slate-600">Pemulihan Tutupan</span>
                                                                                </div>
                                                                                <span className="text-[10px] font-black text-emerald-700">{(sidebarTransitionStats?.gain || 0).toFixed(1)} <span className="text-[8px] font-bold opacity-60 uppercase">Ha</span></span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between bg-slate-50/50 p-1.5 rounded-lg border border-slate-200/50">
                                                                                <div className="flex items-center gap-2">
                                                                                    <ImageIcon size={14} className="text-slate-500" />
                                                                                    <span className="text-[10px] font-bold text-slate-600">Ekspansi Terbangun</span>
                                                                                </div>
                                                                                <span className="text-[10px] font-black text-slate-700">{(sidebarTransitionStats?.builtup || 0).toFixed(1)} <span className="text-[8px] font-bold opacity-60 uppercase">Ha</span></span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}


                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }
                {props.children}

            </main >


        </div >
    );
};

export default MainLayout;
