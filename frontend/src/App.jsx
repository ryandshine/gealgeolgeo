import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import shp from 'shpjs';
import proj4 from 'proj4';
import JSZip from 'jszip';
import { CheckCircle2, History, Calendar, Database, Activity, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import MainLayout from './MainLayout';
import { CALIBRATION_DEFAULTS, LAND_COVER_CONFIG, API_URL, MAX_BATCH_SIZE } from './constants';
import BatchQueueList from './components/BatchQueueList';
import CarbonDashboard from './components/CarbonDashboard';

// Expose proj4 globally for shpjs to find it
if (typeof window !== 'undefined') {
    window.proj4 = proj4;
}

// Define common Indonesian CRS projections
proj4.defs([
    ['EPSG:32751', '+proj=utm +zone=51 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32750', '+proj=utm +zone=50 +south +datum=WGS84 +units=m +no_defs'],
    // Sumatra & West Indo (N/S)
    ['EPSG:32646', '+proj=utm +zone=46 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32647', '+proj=utm +zone=47 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32648', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32746', '+proj=utm +zone=46 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32747', '+proj=utm +zone=47 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32748', '+proj=utm +zone=48 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32749', '+proj=utm +zone=49 +south +datum=WGS84 +units=m +no_defs'],
    // Java/Bali/Nusa/Kalimantan/Sulawesi (49-51)
    ['EPSG:32649', '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32650', '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs'],
    // Eastern Indo
    ['EPSG:32752', '+proj=utm +zone=52 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32753', '+proj=utm +zone=53 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32754', '+proj=utm +zone=54 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32651', '+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32652', '+proj=utm +zone=52 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32653', '+proj=utm +zone=53 +datum=WGS84 +units=m +no_defs'],
    // Custom
    ['EPSG:23838', '+proj=tmerc +lat_0=0 +lon_0=124.5 +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
    ['EPSG:54034', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'],
    ['World_Cylindrical_Equal_Area', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'],
    ['Cylindrical_Equal_Area', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'],
    ['ESRI:54034', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'],
    ['PROJCS["World_Cylindrical_Equal_Area",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Cylindrical_Equal_Area"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],UNIT["Meter",1.0]]', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'],
    ['CEA', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs']
]);

const swapCoordinates = (coords) => {
    if (typeof coords[0] === 'number' && coords.length >= 2) return [coords[1], coords[0], ...coords.slice(2)];
    return coords.map(swapCoordinates);
};

const reprojectToWGS84 = (geojson) => {
    const firstCoord = geojson.type === 'FeatureCollection' ? geojson.features[0]?.geometry?.coordinates?.flat(Infinity).slice(0, 2)
        : (geojson.type === 'Feature' ? geojson.geometry?.coordinates?.flat(Infinity).slice(0, 2) : geojson.coordinates?.flat(Infinity).slice(0, 2));

    if (!firstCoord || firstCoord.length < 2) return geojson;
    const [x, y] = firstCoord;

    // ALGORITMA REPROYEKSI "MAX": Jika koordinat sangat besar (bukan Lat/Lon), paksa ke proyeksi yang paling masuk akal
    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
        let sourceProj = 'EPSG:32751'; // Default UTM 51S

        // Deteksi berdasarkan rentang koordinat CEA (Cylindrical Equal Area)
        // Biasanya koordinat CEA sangat besar (jutaan / sepuluh jutaan)
        if (Math.abs(x) > 5000000 || Math.abs(y) > 5000000) {
            sourceProj = 'EPSG:54034'; // Cylindrical Equal Area
        }
        // Deteksi UTM berdasarkan rentang Indonesia (Zone 46-54)
        else if (x > 100000 && x < 900000) {
            if (y > 1400000 && y < 1600000) sourceProj = 'EPSG:23838'; // Kasus khusus wilayah tertentu
            else sourceProj = 'EPSG:32751';
        }

        const reproject = (coords) => {
            if (typeof coords[0] === 'number' && coords.length >= 2) {
                try {
                    const projected = proj4(sourceProj, 'WGS84', [coords[0], coords[1]]);
                    if (Number.isFinite(projected[0]) && Number.isFinite(projected[1])) {
                        return [projected[0], projected[1], ...coords.slice(2)];
                    }
                } catch (e) { return coords; }
            }
            return Array.isArray(coords) ? coords.map(reproject) : coords;
        };
        const reprojectGeometry = (geometry) => ({ ...geometry, coordinates: reproject(geometry.coordinates) });

        if (geojson.type === 'FeatureCollection') return { ...geojson, features: geojson.features.filter(f => f.geometry?.coordinates?.length > 0).map(f => ({ ...f, geometry: reprojectGeometry(f.geometry) })) };
        if (geojson.type === 'Feature') return { ...geojson, geometry: reprojectGeometry(geojson.geometry) };
        return reprojectGeometry(geojson);
    }

    if (y >= 95 && y <= 141 && Math.abs(x) <= 15) {
        const fixGeometry = (geometry) => ({ ...geometry, coordinates: swapCoordinates(geometry.coordinates) });
        if (geojson.type === 'FeatureCollection') return { ...geojson, features: geojson.features.map(f => ({ ...f, geometry: fixGeometry(f.geometry) })) };
        if (geojson.type === 'Feature') return { ...geojson, geometry: fixGeometry(geojson.geometry) };
        return fixGeometry(geojson);
    }
    return geojson;
};

const App = () => {
    useEffect(() => {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@100;200;300;400;500;600;700&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        return () => document.head.removeChild(link);
    }, []);



    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showChart, setShowChart] = useState(true);
    const [data, setData] = useState(null);
    const [geoData, setGeoData] = useState(null);
    const [vectorLayerData, setVectorLayerData] = useState(null);
    const [mapUrl, setMapUrl] = useState(null);
    const [rgbMapUrl, setRgbMapUrl] = useState(null);
    const [error, setError] = useState(null);
    // Year Range Selection (for series mode)
    const currentYear = new Date().getFullYear();
    const [startYear, setStartYear] = useState(2021);
    const [endYear, setEndYear] = useState(currentYear - 1);
    const [analysisMode, setAnalysisMode] = useState('series'); // 'series' or 'single'
    const [specificDate, setSpecificDate] = useState(new Date().toISOString().split('T')[0]);
    const [showMetadata, setShowMetadata] = useState(true);
    const [progress, setProgress] = useState(0);
    const [progressStep, setProgressStep] = useState("");
    const [progressDetail, setProgressDetail] = useState("");
    const [queuePosition, setQueuePosition] = useState(null);
    const [timeLeft, setTimeLeft] = useState(null); // Estimated time remaining (seconds)
    const startTimeRef = useRef(null);
    const progressRef = useRef(0);

    // Track progress for calculations without re-triggering effect
    useEffect(() => {
        progressRef.current = progress;
    }, [progress]);

    // SMART Countdown Timer Effect
    useEffect(() => {
        let interval;
        if (loading) {
            if (!startTimeRef.current) startTimeRef.current = Date.now();

            // Initial Heuristic (until progress kicks in)
            if (timeLeft === null) {
                const years = analysisMode === 'single' ? 1 : (Math.max(1, endYear - startYear + 1));
                setTimeLeft(15 + (years * 5));
            }

            interval = setInterval(() => {
                const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
                const currentProgress = progressRef.current;

                if (currentProgress > 10) {
                    // Smart Estimation: (Elapsed / Progress%) * Remaining%
                    // Average speed calculation
                    const estimatedTotalTime = elapsedSec / (currentProgress / 100);
                    const remainingTime = estimatedTotalTime - elapsedSec;

                    // Smooth update (don't jump drastically if possible, but stay accurate)
                    setTimeLeft(Math.max(1, Math.ceil(remainingTime)));
                } else {
                    // Linear countdown fallback during initialization (0-10%)
                    setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 15));
                }
            }, 1000);
        } else {
            setTimeLeft(null);
            startTimeRef.current = null;
        }
        return () => clearInterval(interval);
    }, [loading]); // Run when loading toggles

    const [showCalibration, setShowCalibration] = useState(false);
    const [thresholds, setThresholds] = useState(CALIBRATION_DEFAULTS);
    const [expandedAttributes, setExpandedAttributes] = useState(false);
    const [historyData, setHistoryData] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [showSidebar, setShowSidebar] = useState(false);
    const sidebarRef = useRef(null);
    const [isCompareMode, setIsCompareMode] = useState(false);
    const [compareYear, setCompareYear] = useState(null);
    const [compareMapUrl, setCompareMapUrl] = useState(null);
    const [compareRgbMapUrl, setCompareRgbMapUrl] = useState(null);
    const [analysisConflict, setAnalysisConflict] = useState(null); // { existingItem }

    // Batch Processing State
    const [batchQueue, setBatchQueue] = useState([]); // Array of { id, file, status, error }
    const [currentJobId, setCurrentJobId] = useState(null);
    const [isBatchRunning, setIsBatchRunning] = useState(false); // Manual start control
    const [isBatchMode, setIsBatchMode] = useState(false); // Toggle for Batch Mode vs Single Mode
    const batchWsRef = useRef(null); // WebSocket ref for batch cancellation


    // Cancellation Refs
    const abortControllerRef = useRef(null);
    const wsRef = useRef(null);
    const isCancelledRef = useRef(false);

    // Cloud Probability Threshold - FIXED at 50% per methodology
    // Cannot be changed by user to ensure consistency across all years and runs
    const CLOUD_PROB_THRESHOLD_FIXED = 50;

    // Global View States (moved from MainLayout for centralized control)
    const [showAllPins, setShowAllPins] = useState(true);
    const [showHistoryTable, setShowHistoryTable] = useState(false);

    // Analysis Completion Popup State
    const [showAnalysisComplete, setShowAnalysisComplete] = useState(false);
    const [showBatchComplete, setShowBatchComplete] = useState(false);

    // Missing UI States
    const [selectedYear, setSelectedYear] = useState(null);
    const [mapType, setMapType] = useState('satellite');
    const [chartType, setChartType] = useState('bar');
    const [showOverlay, setShowOverlay] = useState(true);
    const [showRgb, setShowRgb] = useState(true);
    const [polygonOpacity, setPolygonOpacity] = useState(1.0);
    const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);

    // Transition Analysis State
    const [transitionSummary, setTransitionSummary] = useState(null);
    const [auditReport, setAuditReport] = useState(null);

    // Carbon Time-Series Mode (Indicative)
    const [carbonModeEnabled, setCarbonModeEnabled] = useState(false);
    const [carbonHistoryId, setCarbonHistoryId] = useState(null);
    const [carbonFilename, setCarbonFilename] = useState(null);

    const [showKawasanHutan, setShowKawasanHutan] = useState(false);
    const [kawasanHutanOpacity, setKawasanHutanOpacity] = useState(0.6);
    const [showDAS, setShowDAS] = useState(false);
    const [dasOpacity, setDasOpacity] = useState(0.6);

    useEffect(() => { fetchHistory(); }, []);

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            // Add timestamp query param to bypass client/browser cache
            const response = await axios.get(`${API_URL}/history?_t=${new Date().getTime()}`);
            setHistoryData(response.data || []);
        } catch (err) { console.error("Error fetching history:", err.message); } finally { setLoadingHistory(false); }
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showSidebar && sidebarRef.current && !sidebarRef.current.contains(event.target)) {
                // Jangan tutup sidebar dan jangan balik ke dashboard jika sedang ada SHP/data aktif
                // Ini mencegah "jumping" dan menu hilang saat klik/drag peta.
                if (!data && !geoData && !file) {
                    setShowSidebar(false);
                    setShowAllPins(true);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showSidebar, data, geoData, file]);

    const readFileAsArrayBuffer = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });

    const handleFileChange = async (e) => {
        if (!e.target.files?.length) return;
        const files = Array.from(e.target.files);

        // --- SINGLE MODE LOGIC ---
        if (!isBatchMode) {
            // Expecting 1 logical file (either 1 ZIP, 1 GeoJSON, or 1 set of SHP components)
            // We reuse the smart grouping logic to detect what it is.

            const zipFiles = files.filter(f => f.name.toLowerCase().endsWith('.zip'));
            const geoJsonFiles = files.filter(f => f.name.toLowerCase().endsWith('.geojson') || f.name.toLowerCase().endsWith('.json'));
            const shpComponents = files.filter(f => {
                const ext = f.name.toLowerCase().split('.').pop();
                return ['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(ext);
            });

            // Validation for Single Mode
            const groupCount = zipFiles.length + geoJsonFiles.length + (shpComponents.length > 0 ? 1 : 0);
            if (groupCount > 1) {
                setError("Mode Single hanya untuk 1 file analisis. Aktifkan 'Batch Mode' untuk upload banyak file sekaligus.");
                return;
            }

            // Identify target file/bundle
            let rawGeojson;
            let targetFile;

            try {
                if (zipFiles.length === 1) {
                    targetFile = zipFiles[0];
                    rawGeojson = await shp(await readFileAsArrayBuffer(targetFile));
                } else if (geoJsonFiles.length === 1) {
                    targetFile = geoJsonFiles[0];
                    const text = await new Promise((res, rej) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => res(ev.target.result);
                        reader.onerror = rej;
                        reader.readAsText(targetFile);
                    });
                    rawGeojson = JSON.parse(text);
                } else if (shpComponents.length > 0) {
                    // Zip in-memory
                    const zip = new JSZip();
                    const allowedExts = ['.shp', '.shx', '.dbf', '.prj', '.cpg'];
                    let shpName = "";
                    for (const f of shpComponents) {
                        const ext = '.' + f.name.split('.').pop().toLowerCase();
                        if (allowedExts.includes(ext)) {
                            zip.file(f.name, await readFileAsArrayBuffer(f));
                            if (ext === '.shp') shpName = f.name;
                        }
                    }
                    if (!shpName) throw new Error("File .shp tidak ditemukan.");
                    targetFile = { name: shpName, size: shpComponents.reduce((acc, f) => acc + f.size, 0) }; // Mock file obj
                    const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
                    rawGeojson = await shp(zipBlob);
                } else {
                    throw new Error("Format file tidak didukung.");
                }

                if (!rawGeojson) throw new Error("Gagal membaca file.");
                if (Array.isArray(rawGeojson)) rawGeojson = rawGeojson[0];
                const finalGeo = reprojectToWGS84(rawGeojson);

                setGeoData(finalGeo);
                setFile({ name: targetFile.name, size: targetFile.size });

                // Reset state
                setData(null); setMapUrl(null); setVectorLayerData(null); setError(null);
                setBatchQueue([]); // Clear batch queue if switching to single mode
                // Keep sidebar open after upload so user can configure analysis

            } catch (err) {
                console.error("Single File Parse Error:", err);
                setError(err.message || "Gagal memproses file.");
            }
            return;
        }

        // --- BATCH MODE LOGIC ---
        // Batch Limit Check
        if (files.length > MAX_BATCH_SIZE) {
            setError(`Maksimal ${MAX_BATCH_SIZE} file sekaligus untuk menjaga performa browser.`);
            return;
        }

        // Smart File Grouping
        const zipFiles = files.filter(f => f.name.toLowerCase().endsWith('.zip'));
        const geoJsonFiles = files.filter(f => f.name.toLowerCase().endsWith('.geojson') || f.name.toLowerCase().endsWith('.json'));
        const shpComponents = files.filter(f => {
            const ext = f.name.toLowerCase().split('.').pop();
            return ['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(ext);
        });

        const newJobs = [];

        // Add ZIP jobs
        zipFiles.forEach(f => {
            newJobs.push({
                id: Math.random().toString(36).substr(2, 9),
                file: f,
                fileType: 'zip',
                status: 'waiting',
                progress: 0,
                progressDetail: 'Antre...',
                error: null
            });
        });

        // Add GeoJSON jobs
        geoJsonFiles.forEach(f => {
            newJobs.push({
                id: Math.random().toString(36).substr(2, 9),
                file: f,
                fileType: 'geojson',
                status: 'waiting',
                progress: 0,
                progressDetail: 'Antre...',
                error: null
            });
        });

        // Group SHP components into one job (if any)
        if (shpComponents.length > 0) {
            const shpFile = shpComponents.find(f => f.name.toLowerCase().endsWith('.shp'));
            if (!shpFile) {
                setError('File .shp tidak ditemukan dalam komponen SHP yang diupload.');
                return;
            }
            // Calculate total size for all components
            const totalSize = shpComponents.reduce((acc, f) => acc + f.size, 0);
            newJobs.push({
                id: Math.random().toString(36).substr(2, 9),
                file: { ...shpFile, size: totalSize }, // Override with total size
                files: shpComponents, // Store all components
                fileType: 'shp-bundle',
                status: 'waiting',
                progress: 0,
                progressDetail: 'Antre...',
                error: null
            });
        }

        if (newJobs.length === 0) {
            setError('Tidak ada file yang didukung. Gunakan .zip (SHP), .geojson, atau komponen SHP (.shp, .shx, .dbf)');
            return;
        }

        setBatchQueue(prev => [...prev, ...newJobs]);

        // Reset state UI
        setError(null); setMapUrl(null); setData(null);
        // Keep sidebar open for batch queue management
    };

    // --- BATCH PROCESSOR ENGINE ---
    useEffect(() => {
        const processNextJob = async () => {
            // Only process if batch is explicitly started
            if (!isBatchRunning) return;

            // Jika sedang ada job jalan, stop.
            if (currentJobId) return;

            // Cari job waiting pertama
            const nextJob = batchQueue.find(j => j.status === 'waiting');
            if (!nextJob) {
                // Semua selesai - auto stop batch mode
                setIsBatchRunning(false);
                // Jika sebelumnya ada job yang diproses, tampilkan popup sukses
                const hasProcessed = batchQueue.some(j => j.status === 'completed' || j.status === 'error');
                if (hasProcessed) {
                    setShowBatchComplete(true);
                }
                return;
            }

            setCurrentJobId(nextJob.id);
            setBatchQueue(q => q.map(j => j.id === nextJob.id ? { ...j, status: 'processing', progress: 5, progressDetail: 'Menyiapkan...' } : j));

            try {
                // 1. Parse Geometry (lokal browser)
                let rawGeojson;
                const file = nextJob.file;
                const fileType = nextJob.fileType;

                let totalSize = file.size;

                setBatchQueue(q => q.map(j => j.id === nextJob.id ? { ...j, progress: 10, progressDetail: 'Membaca file...' } : j));

                if (fileType === 'geojson') {
                    const text = await new Promise((res, rej) => {
                        const reader = new FileReader();
                        reader.onload = (e) => res(e.target.result);
                        reader.onerror = rej;
                        reader.readAsText(file);
                    });
                    rawGeojson = JSON.parse(text);
                } else if (fileType === 'zip') {
                    rawGeojson = await shp(await readFileAsArrayBuffer(file));
                } else if (fileType === 'shp-bundle') {
                    // Bundle loose SHP components into in-memory ZIP
                    const zip = new JSZip();
                    const allowedExts = ['.shp', '.shx', '.dbf', '.prj', '.cpg'];
                    totalSize = nextJob.files.reduce((acc, f) => acc + f.size, 0); // Re-calculate total size for bundle
                    for (const f of nextJob.files) {
                        const ext = '.' + f.name.split('.').pop().toLowerCase();
                        if (allowedExts.includes(ext)) {
                            zip.file(f.name, await readFileAsArrayBuffer(f));
                        }
                    }
                    const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
                    rawGeojson = await shp(zipBlob);
                } else {
                    throw new Error(`Tipe file tidak dikenal: ${fileType}`);
                }

                if (!rawGeojson) throw new Error("Gagal membaca file.");
                if (Array.isArray(rawGeojson)) rawGeojson = rawGeojson[0];
                const finalGeo = reprojectToWGS84(rawGeojson);

                // 2. Duplicate Detection - Cek apakah geometry sudah ada di history
                setBatchQueue(q => q.map(j => j.id === nextJob.id ? { ...j, progress: 15, progressDetail: 'Memeriksa duplikat...' } : j));

                const currentGeom = JSON.stringify(finalGeo.features?.[0]?.geometry?.coordinates);
                const existingItem = historyData.find(item => {
                    const itemGeom = JSON.stringify(item.geo_data?.features?.[0]?.geometry?.coordinates);
                    return itemGeom === currentGeom;
                });

                if (existingItem) {
                    // Skip - sudah ada di database
                    console.log(`⏭️ Skipping duplicate: ${file.name} (already in history as ID: ${existingItem.id})`);
                    setBatchQueue(q => q.map(j =>
                        j.id === nextJob.id
                            ? {
                                ...j,
                                status: 'skipped',
                                progress: 100,
                                progressDetail: `Sudah ada di database (${existingItem.filename})`,
                                existingHistoryId: existingItem.id
                            }
                            : j
                    ));
                    return; // Skip ke job berikutnya
                }

                // 3. Kirim ke WebSocket (Analisis)
                await runBatchAnalysis(nextJob.id, finalGeo, file.name, totalSize);

                // 3. Sukses
                setBatchQueue(q => q.map(j => j.id === nextJob.id ? { ...j, status: 'completed' } : j));

            } catch (err) {
                console.error("Batch Job Failed:", err);
                setBatchQueue(q => q.map(j => j.id === nextJob.id ? { ...j, status: 'error', error: err.message } : j));

                // Jika error adalah network/WebSocket error, stop batch processing
                const isNetworkError = err.message.includes('WebSocket') ||
                    err.message.includes('Network') ||
                    err.message.includes('Koneksi');
                if (isNetworkError) {
                    setIsBatchRunning(false);
                    alert('⚠️ Batch processing dihentikan karena masalah koneksi.\n\nSilakan periksa:\n• Backend server berjalan\n• Koneksi internet stabil\n\nKemudian coba lagi.');
                }
            } finally {
                setCurrentJobId(null); // Trigger useEffect lagi untuk job berikutnya
            }
        };

        processNextJob();
    }, [batchQueue, currentJobId, isBatchRunning]);

    const runBatchAnalysis = (jobId, geometry, filename, fileSize) => {
        return new Promise((resolve, reject) => {
            // Establish WS
            const clientId = Math.random().toString(36).substring(7);
            const WS_URL = API_URL.replace('http', 'ws');
            const ws = new WebSocket(`${WS_URL}/ws/analyze/${clientId}`);
            batchWsRef.current = ws; // Store ref for cancellation

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    geojson: geometry,
                    start_year: startYear,
                    end_year: endYear,
                    thresholds: thresholds,
                    mode: 'series',
                    cloud_prob_threshold: CLOUD_PROB_THRESHOLD_FIXED,
                    existing_data: []
                }));
            };

            ws.onmessage = async (event) => {
                const response = JSON.parse(event.data);
                if (response.type === 'progress') {
                    setBatchQueue(q => q.map(j => j.id === jobId ? { ...j, progress: response.progress, progressDetail: `${response.step}${response.detail ? ': ' + response.detail : ''}` } : j));
                } else if (response.type === 'complete') {
                    try {
                        const payload = {
                            filename: filename,
                            file_size: fileSize,
                            metadata: {
                                year: 2025,
                                location: "Batch Upload",
                                source: "Sentinel-2",
                                start_year: startYear,
                                end_year: endYear,
                                version: "3.0 (RF)",
                                cloud_prob: CLOUD_PROB_THRESHOLD_FIXED
                            },
                            analysis_results: response.data.data,
                            geo_data: geometry,
                            mode: 'replace',
                            transition_summary: response.data.transition_summary,
                            audit_report: response.data.audit_report
                        };
                        await axios.post(`${API_URL}/history`, payload);
                        fetchHistory();
                        ws.close();
                        resolve();
                    } catch (saveErr) {
                        ws.close();
                        reject(new Error("Gagal menyimpan: " + saveErr.message));
                    }
                } else if (response.type === 'error') {
                    ws.close();
                    reject(new Error(response.message || "Unknown error"));
                }
            };

            ws.onerror = (e) => {
                reject(new Error("WebSocket Error"));
            };

            ws.onclose = (event) => {
                if (!event.wasClean) {
                    reject(new Error('Koneksi terputus secara tidak terduga'));
                }
            };
        });
    };

    const handleCancelBatch = () => {
        // Close active WebSocket if any
        if (batchWsRef.current) {
            batchWsRef.current.close();
            batchWsRef.current = null;
        }
        // Mark waiting jobs as cancelled, stop batch
        setBatchQueue(q => q.map(j => j.status === 'waiting' ? { ...j, status: 'cancelled' } : j));
        setCurrentJobId(null);
        setIsBatchRunning(false);
    };

    const handleStartBatch = () => {
        // Only start if there are waiting jobs
        const hasWaiting = batchQueue.some(j => j.status === 'waiting');
        if (hasWaiting) {
            setIsBatchRunning(true);
        }
    };

    const handleClearQueue = () => {
        // Clear entire queue
        setBatchQueue([]);
        setCurrentJobId(null);
        setIsBatchRunning(false);
    };

    const handleRemoveJob = (jobId) => {
        // Stop batch if the current job is removed (optional, but safer)
        if (jobId === currentJobId) {
            handleCancelBatch();
        }
        setBatchQueue(prev => prev.filter(j => j.id !== jobId));
    };


    const handleDeleteHistory = async (id) => {
        // Optimistic update - remove from UI immediately
        const previousData = historyData;
        setHistoryData(prev => prev.filter(item => item.id !== id));

        try {
            await axios.delete(`${API_URL}/history/${id}`);
            console.log(`✅ ID ${id} deleted successfully.`);
        } catch (err) {
            const is404 = err.response?.status === 404 || err.message?.includes("404");

            if (is404) {
                // If 404, it means it's already gone, which is effectively a success
                // No need to rollback or alert the user
                console.log(`ℹ️ ID ${id} was already deleted (404).`);
                return;
            }

            // Rollback on other failures (500, etc)
            console.error("❌ Delete failure:", err);
            setHistoryData(previousData);
            alert('Gagal menghapus data: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleUpdateHistoryItem = (updatedItem) => {
        setHistoryData(prev => {
            if (!prev) return [];
            return prev.map(item => item.id === updatedItem.id ? updatedItem : item);
        });
    };

    const handleHistorySelect = async (item) => {
        setLoadingHistory(true);
        try {
            // Fetch detailed data including full GeoJSON and all thumbnails
            console.log(`🔍 Fetching full details for history item: ${item.id}`);
            const response = await axios.get(`${API_URL}/history/${item.id}`);
            const fullItem = response.data;

            // Clear previous analysis states to prevent stale layers
            setVectorLayerData(null);
            setMapUrl(null);
            setRgbMapUrl(null);
            setError(null);

            setData(fullItem.analysis_results);
            if (fullItem.geo_data) {
                setGeoData(fullItem.geo_data);
            }
            setFile({ name: fullItem.filename, size: fullItem.file_size, id: item.id });
            if (fullItem.analysis_results?.length > 0) {
                const lastData = fullItem.analysis_results[fullItem.analysis_results.length - 1];
                setSelectedYear(lastData.year || fullItem.analysis_results[0].year);
                setMapType('SENTINEL_RGB');
                setShowOverlay(true);
            }
            if (fullItem.metadata) {
                setStartYear(fullItem.metadata.start_year || 2017);
                setTransitionSummary(fullItem.metadata.transition_summary || null);
                setAuditReport(fullItem.metadata.audit_report || null);
            }

            setShowHistoryTable(false);
            setShowAllPins(false);
        } catch (err) {
            console.error("Error fetching history detail:", err);
            alert("Gagal mengambil detail data: " + err.message);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleHistoryReanalyze = async (item) => {
        setLoadingHistory(true);
        try {
            const response = await axios.get(`${API_URL}/history/${item.id}`);
            const fullItem = response.data;

            if (fullItem.geo_data) setGeoData(fullItem.geo_data);
            setFile({ name: fullItem.filename, size: fullItem.file_size });
            setData(null);
            setVectorLayerData(null);
            setMapUrl(null);
            setRgbMapUrl(null);
            if (fullItem.metadata) setStartYear(fullItem.metadata.start_year || 2017);

            setShowHistoryTable(false);
            setShowAllPins(false);

            // Auto-trigger analysis
            setTimeout(() => handleAnalyze(), 100);
        } catch (err) {
            console.error("Error fetching history for reanalysis:", err);
            alert("Gagal memuat data untuk analisis ulang: " + err.message);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleReset = () => {
        setData(null); setGeoData(null); setFile(null); setMapUrl(null); setRgbMapUrl(null);
        setVectorLayerData(null); // Clear any specific classification vectors
        setTransitionSummary(null); setAuditReport(null);
        setSelectedYear(null); setError(null); setChartType('bar');
        setStartYear(2017); setEndYear(currentYear - 1);
        setMapType('satellite'); // Switch back to high-res basemap
        setShowAllPins(true); fetchHistory();
    };

    const handleCancel = () => {
        isCancelledRef.current = true;
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setLoading(false);
        setProgress(0);
        setError("Analisis dibatalkan oleh pengguna");
    };

    const handleAnalyze = async (customThresholds = null, config = { skipConflictCheck: false, mode: 'replace' }) => {
        if (!geoData) return;

        const skipConflictCheck = config?.skipConflictCheck || false;
        const currentMode = config?.mode || 'replace';

        // 1. Conflict Check: Cari apakah SHP ini sudah pernah dianalisis
        if (!skipConflictCheck && historyData.length > 0) {
            // Heuristic check: bandingkan string coordinates fitur pertama
            const currentGeom = JSON.stringify(geoData.features?.[0]?.geometry?.coordinates);
            const match = historyData.find(item => {
                const itemGeom = JSON.stringify(item.geo_data?.features?.[0]?.geometry?.coordinates);
                return itemGeom === currentGeom;
            });

            if (match) {
                setAnalysisConflict(match);
                return; // Tunggu konfirmasi user
            }
        }

        let actualThresholds = (customThresholds && customThresholds.nativeEvent) ? null : customThresholds;
        if (!actualThresholds) actualThresholds = thresholds;
        setLoading(true); setError(null); setData(null); setMapUrl(null);
        setShowChart(true); // Force dashboard expansion on analysis start
        setProgress(5); setProgressStep("Menghubungkan ke server...");
        setQueuePosition(null); // Reset queue position

        isCancelledRef.current = false;
        abortControllerRef.current = new AbortController(); // Create controller for potential fallback

        console.log(' RF Classification Request');
        console.log(`📅 Year Range: ${startYear} - ${endYear}`);
        console.log(`☁️ Cloud Threshold: ${CLOUD_PROB_THRESHOLD_FIXED}% (Fixed)`);

        const WS_URL = API_URL.replace('http://', 'ws://').replace('https://', 'wss://');
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const runWebSocketAnalysis = () => new Promise((resolve, reject) => {
            const ws = new WebSocket(`${WS_URL}/ws/analyze/${clientId}`);
            wsRef.current = ws;
            let completed = false;
            const connTimeout = setTimeout(() => { if (!completed) { completed = true; ws.close(); reject(new Error('Timeout')); } }, 5000);
            ws.onopen = () => {
                clearTimeout(connTimeout);
                console.log('🔌 WebSocket connected, sending analysis request...');
                ws.send(JSON.stringify({
                    geojson: geoData,
                    start_year: startYear,
                    end_year: endYear,
                    thresholds: actualThresholds,
                    mode: analysisMode,
                    specific_date: analysisMode === 'single' ? specificDate : null,
                    cloud_prob_threshold: CLOUD_PROB_THRESHOLD_FIXED,
                    // OPTIMASI: Kirim data tahun yang sudah ada jika mode MERGE
                    existing_data: currentMode === 'merge' ? (analysisConflict?.analysis_results || []) : []
                }));
            };
            ws.onerror = () => { clearTimeout(connTimeout); if (!completed) { completed = true; reject(new Error('WebSocket error')); } };
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'queue_status') {
                        setQueuePosition(msg.position);
                        setProgressStep(`Antrian #${msg.position}`);
                        setProgressDetail("Menunggu giliran proses...");
                    } else if (msg.type === 'progress') {
                        setQueuePosition(null); // No longer in queue if we have progress
                        setProgress(msg.progress);
                        setProgressStep(msg.step);
                        setProgressDetail(msg.detail || "");
                    } else if (msg.type === 'complete') {
                        setQueuePosition(null);
                        console.log('✅ Analysis complete! Data received:', msg.data);
                        console.log('📊 Data array length:', msg.data.data?.length);
                        completed = true; setProgress(100); setProgressStep("Analisis Selesai!");
                        setData(msg.data.data);
                        setTransitionSummary(msg.data.transition_summary || null);
                        setAuditReport(msg.data.audit_report || null);
                        if (msg.data.data?.length > 0) {
                            console.log('💾 Saving to history...');
                            const lastData = msg.data.data[msg.data.data.length - 1];
                            setSelectedYear(lastData.year); setMapUrl(lastData.map_url); setRgbMapUrl(lastData.rgb_url); setMapType('SENTINEL_RGB');
                            axios.post(`${API_URL}/history`, {
                                filename: file?.name || 'Unknown',
                                file_size: file?.size || 0,
                                metadata: {
                                    feature_count: geoData.features.length,
                                    geometry_type: geoData.features[0]?.geometry?.type,
                                    start_year: startYear,
                                    end_year: endYear,
                                    version: "3.0 (RF)",
                                    cloud_prob: CLOUD_PROB_THRESHOLD_FIXED
                                },
                                analysis_results: msg.data.data,
                                geo_data: geoData,
                                mode: currentMode,
                                transition_summary: msg.data.transition_summary,
                                audit_report: msg.data.audit_report
                            }).then(() => {
                                console.log('✅ History saved successfully');
                                fetchHistory();
                            }).catch(err => {
                                console.error('❌ Failed to save history:', err.response?.data || err.message);
                            });
                        } else {
                            console.warn('⚠️ Analysis returned empty data array - history not saved');
                        }
                        setLoading(false); setShowAnalysisComplete(true); setTimeout(() => setProgress(0), 2000); ws.close(); resolve(msg.data);
                    } else if (msg.type === 'error') {
                        console.error('❌ WebSocket error message:', msg.error);
                        completed = true; setLoading(false); ws.close(); reject(new Error(msg.error));
                    }
                } catch (e) { console.error(e); }
            };
            ws.onclose = () => { if (!completed) { completed = true; reject(new Error('Closed unexpectedly')); } };
        });

        try { await runWebSocketAnalysis(); } catch (wsError) {
            if (isCancelledRef.current) return;
            console.log('Falling back to HTTP');
            const progressInterval = setInterval(() => {
                setProgress(p => p >= 95 ? p : p + 2);
                setProgressStep("Memproses...");
                setProgressDetail("Mengambil data via HTTP...");
            }, 3000);
            try {
                const response = await axios.post(`${API_URL}/analyze`, {
                    geojson: geoData,
                    start_year: startYear,
                    end_year: endYear,
                    thresholds: actualThresholds,
                    cloud_prob_threshold: CLOUD_PROB_THRESHOLD_FIXED
                }, {
                    timeout: 1200000, // 20 minutes
                    signal: abortControllerRef.current.signal
                });
                if (response.data.status === 'sukses' || response.data.status === 'success') {
                    setProgress(100);
                    setData(response.data.data);
                    setTransitionSummary(response.data.transition_summary || null);
                    setAuditReport(response.data.audit_report || null);
                    if (response.data.data?.length > 0) {
                        const lastData = response.data.data[response.data.data.length - 1];
                        setSelectedYear(lastData.year); setMapUrl(lastData.map_url); setRgbMapUrl(lastData.rgb_url); setMapType('SENTINEL_RGB'); setShowOverlay(true);
                        axios.post(`${API_URL}/history`, {
                            filename: file?.name || 'Unknown',
                            file_size: file?.size || 0,
                            metadata: {
                                feature_count: geoData.features.length,
                                geometry_type: geoData.features[0]?.geometry?.type,
                                start_year: startYear,
                                end_year: endYear,
                                version: "3.0 (RF)",
                                cloud_prob: CLOUD_PROB_THRESHOLD_FIXED
                            },
                            analysis_results: response.data.data,
                            geo_data: geoData,
                            transition_summary: response.data.transition_summary,
                            audit_report: response.data.audit_report
                        }).then(() => fetchHistory());
                    }
                    setShowAnalysisComplete(true);
                } else setError(response.data.message || 'Analisis gagal');
            } catch (err) { setError(`Error: ${err.message}`); } finally { clearInterval(progressInterval); setLoading(false); setTimeout(() => setProgress(0), 2000); }
        }
    };

    const exportToExcel = async () => {
        if (!data?.length) return;
        try {
            const response = await axios.post(`${API_URL}/export/excel`, { data, filename: file?.name || 'analysis' }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `GealGeolGeo_Stats_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (e) {
            setError('Export Excel gagal: ' + (e.response?.data?.detail || e.message));
        }
    };

    const exportToGeoJSON = async () => {
        if (!data?.length || !geoData) return;
        try {
            const response = await axios.post(`${API_URL}/export/geojson`, { geojson: geoData, data: data });
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/geo+json' })); a.download = `tutupan_lahan_${new Date().toISOString().split('T')[0]}.geojson`; a.click();
        } catch (e) { setError('Export GeoJSON gagal'); }
    };

    const handleExportBundle = async () => {
        if (!data?.length || !geoData) return;
        try {
            const response = await axios.post(`${API_URL}/export/bundle`, { geojson: geoData, data: data, title: 'Laporan Analisis GealGeolGeo' }, { responseType: 'blob', timeout: 600000 });
            const a = document.createElement('a'); a.href = window.URL.createObjectURL(response.data); a.download = `GealGeolGeo_Export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.zip`; document.body.appendChild(a); a.click(); a.remove();
        } catch (e) { setError('Export gagal: ' + (e.response?.data?.detail || e.message)); }
    };

    const selectedYearData = useMemo(() => data?.find(d => d.year === selectedYear), [data, selectedYear]);
    useEffect(() => {
        if (selectedYearData) {
            setMapUrl(selectedYearData.map_url || null);
            setRgbMapUrl(selectedYearData.rgb_url || null);
            setVectorLayerData(selectedYearData.vector_geojson || null);
        } else {
            setMapUrl(null);
            setRgbMapUrl(null);
            setVectorLayerData(null);
        }
    }, [selectedYearData]);
    const yearStats = useMemo(() => {
        if (!selectedYearData) return null;
        const stats = Object.entries(LAND_COVER_CONFIG).map(([key, config]) => ({ key, ...config, value: selectedYearData[key] || 0 })).filter(s => s.value > 0);
        const total = stats.reduce((sum, s) => sum + s.value, 0);
        return { stats: stats.map(s => ({ ...s, percentage: total > 0 ? ((s.value / total) * 100).toFixed(1) : 0 })).sort((a, b) => b.value - a.value), total };
    }, [selectedYearData]);
    const dominantLandCover = useMemo(() => yearStats?.stats?.[0] || null, [yearStats]);

    const layoutProps = {
        file, loading, showChart, setShowChart, data, geoData, setData, setGeoData, setFile, setMapUrl, setRgbMapUrl, setVectorLayerData, setError,
        vectorLayerData, mapUrl, rgbMapUrl, error, startYear, setStartYear, endYear, setEndYear,
        analysisMode, setAnalysisMode, specificDate, setSpecificDate, mapType, setMapType, chartType, setChartType, selectedYear, setSelectedYear,
        showOverlay, setShowOverlay, showRgb, setShowRgb, polygonOpacity, setPolygonOpacity, showConfidenceInfo, setShowConfidenceInfo,
        showMetadata, setShowMetadata, progress, progressStep, progressDetail, showCalibration, setShowCalibration, thresholds, setThresholds,
        expandedAttributes, setExpandedAttributes, historyData, loadingHistory, showSidebar, setShowSidebar, sidebarRef,
        isCompareMode, setIsCompareMode, compareYear, setCompareYear, compareMapUrl, setCompareMapUrl, compareRgbMapUrl, setCompareRgbMapUrl,
        handleFileChange, handleAnalyze, handleDeleteHistory, handleUpdateHistoryItem, handleHistorySelect, handleHistoryReanalyze, handleReset, handleExportBundle, exportToExcel, exportToGeoJSON,
        handleCancel,
        selectedYearData, yearStats, dominantLandCover,
        // Global Props
        showAllPins, setShowAllPins, showHistoryTable, setShowHistoryTable,
        // Analysis completion popup
        showAnalysisComplete, setShowAnalysisComplete,
        showBatchComplete, setShowBatchComplete,
        // SIGAP Interaktif
        showKawasanHutan, setShowKawasanHutan, kawasanHutanOpacity, setKawasanHutanOpacity,
        showDAS, setShowDAS, dasOpacity, setDasOpacity,
        // Batch Mode
        isBatchMode, setIsBatchMode,
        // Carbon Time-Series Mode
        onOpenCarbonMode: (historyId, filename) => {
            setCarbonHistoryId(historyId);
            setCarbonFilename(filename);
            setCarbonModeEnabled(true);
        },
        transitionSummary,
        auditReport,
        timeLeft, // Pass countdown to MainLayout
        queuePosition // Pass current queue rank
    };

    return (
        <>
            <MainLayout {...layoutProps}>
                <BatchQueueList
                    queue={batchQueue}
                    currentJobId={currentJobId}
                    isRunning={isBatchRunning}
                    onStart={handleStartBatch}
                    onCancel={handleCancelBatch}
                    onClear={handleClearQueue}
                    onRemove={handleRemoveJob}
                />
            </MainLayout>

            {showAnalysisComplete && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[2000] bg-emerald-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce">
                    <CheckCircle2 size={20} />
                    <span className="text-sm font-bold uppercase tracking-widest">Analisis Selesai & Tersimpan!</span>
                </div>
            )}

            {/* MODAL KONFIRMASI ANALISIS ULANG (Request User) */}
            {analysisConflict && (
                <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100 flex flex-col animate-in zoom-in-95 duration-300">
                        {/* Header dengan Icon */}
                        <div className="bg-emerald-50 px-8 py-10 text-center relative">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/50 rounded-full blur-3xl -mr-16 -mt-16" />
                            <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto mb-6 text-emerald-600 relative z-10">
                                <History size={40} />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-tight relative z-10">
                                Lanjutkan Analisis Baru?
                            </h3>
                            <p className="text-slate-500 text-sm mt-2 font-medium relative z-10">SHP ini terdeteksi sudah pernah dianalisis sebelumnya.</p>
                        </div>

                        {/* Body Detail */}
                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4 transition-all hover:bg-slate-100">
                                    <div className="p-3 bg-white rounded-xl text-emerald-600 shadow-sm">
                                        <Calendar size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dianalisis Pada</span>
                                        <span className="text-[11px] font-bold text-slate-700">
                                            {new Date(analysisConflict.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4 transition-all hover:bg-slate-100">
                                    <div className="p-3 bg-white rounded-xl text-emerald-600 shadow-sm">
                                        <Activity size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Time Series</span>
                                        <span className="text-sm font-bold text-slate-700">
                                            {analysisConflict.metadata?.start_year} - {analysisConflict.metadata?.end_year}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-4">
                                <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                                <div className="space-y-1">
                                    <p className="text-[11px] font-bold text-amber-800 uppercase tracking-widest">Peringatan Penting</p>
                                    <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                                        SHP ini sudah dianalisis sebelumnya. Jika Anda melanjutkan, data analisis lama akan <b>digantikan secara permanen</b> dengan hasil analisis terbaru dari GEE.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-8 bg-slate-50 flex flex-col sm:flex-row gap-4 border-t border-slate-100">
                            <button
                                onClick={() => setAnalysisConflict(null)}
                                className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-sm hover:bg-slate-100 transition-all active:scale-95"
                            >
                                Tutup
                            </button>

                            <button
                                onClick={() => {
                                    setAnalysisConflict(null);
                                    handleAnalyze(null, { skipConflictCheck: true, mode: 'merge' });
                                }}
                                className="flex-1 py-4 bg-blue-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                Gabungkan Data <RefreshCw size={14} />
                            </button>

                            <button
                                onClick={() => {
                                    setAnalysisConflict(null);
                                    handleAnalyze(null, { skipConflictCheck: true, mode: 'replace' });
                                }}
                                className="flex-1 py-4 bg-emerald-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-emerald-500/30 hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                Mulai Baru <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Batch Complete Modal */}
            {showBatchComplete && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
                        <div className="h-2 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600" />

                        <div className="p-8 text-center space-y-6">
                            <div className="relative mx-auto w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 shadow-inner">
                                <CheckCircle2 className="w-10 h-10" />
                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full border-4 border-white flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Analisis Batch Selesai!</h2>
                                <p className="text-sm text-slate-500 font-medium leading-relaxed px-4">
                                    Seluruh file dalam antrian telah berhasil dianalisis dan disimpan ke riwayat.
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</div>
                                    <div className="text-lg font-black text-slate-700">{batchQueue.length}</div>
                                </div>
                                <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100/50">
                                    <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Sukses</div>
                                    <div className="text-lg font-black text-emerald-700">{batchQueue.filter(j => j.status === 'completed').length}</div>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gagal</div>
                                    <div className="text-lg font-black text-red-600">{batchQueue.filter(j => j.status === 'error').length}</div>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    setShowBatchComplete(false);
                                    setBatchQueue([]); // Bersihkan antrian setelah selesai
                                }}
                                className="group relative w-full py-4 bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-slate-900/20 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <span className="relative z-10">Tutup Antrian & Lihat Hasil</span>
                                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Carbon Time-Series Dashboard Modal */}
            <CarbonDashboard
                historyId={carbonHistoryId}
                isOpen={carbonModeEnabled}
                onClose={() => {
                    setCarbonModeEnabled(false);
                    setCarbonHistoryId(null);
                    setCarbonFilename(null);
                }}
                filename={carbonFilename}
            />
        </>
    );
};
export default App;
