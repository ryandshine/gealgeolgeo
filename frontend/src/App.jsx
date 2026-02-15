import React, { useState, useEffect, useMemo, useRef, Suspense, useCallback } from 'react';
import axios from 'axios';
import { CheckCircle2, History, Calendar, Database, Activity, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { CALIBRATION_DEFAULTS, LAND_COVER_CONFIG, API_URL, MAX_BATCH_SIZE } from './constants';

// Lazy load components
const MainLayout = React.lazy(() => import('./MainLayout'));
const Login = React.lazy(() => import('./Login'));
const BatchQueueList = React.lazy(() => import('./components/BatchQueueList'));
const CarbonDashboard = React.lazy(() => import('./components/CarbonDashboard'));
const KpsDetectionDialog = React.lazy(() => import('./components/KpsDetectionDialog'));
const DuplicateDialog = React.lazy(() => import('./components/DuplicateDialog'));
const BulkUploadDialog = React.lazy(() => import('./components/BulkUploadDialog'));
const BulkReportDialog = React.lazy(() => import('./components/BulkReportDialog'));
const MonitoringTerkiniDashboard = React.lazy(() => import('./components/MonitoringTerkiniDashboard'));

// Proj4 definitions and helpers moved to src/utils/geoUtils.js


const App = () => {
    // Authentication State
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        const user = localStorage.getItem('user');
        return !!user;
    });

    // Session Timeout Configuration (30 minutes = 1800000 ms)
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const sessionTimeoutRef = useRef(null);
    const lastActivityRef = useRef(Date.now());
    const loadingRef = useRef(false);
    const batchRunningRef = useRef(false);

    // Auto Logout Handler - SKIP if analysis is running or data is loaded
    const handleAutoLogout = useCallback(() => {
        // DON'T logout if analysis is in progress
        if (loadingRef.current || batchRunningRef.current) {
            console.log('⏸️ Session timeout paused - Analysis in progress');
            sessionTimeoutRef.current = setTimeout(handleAutoLogout, 60 * 1000);
            return;
        }

        // DON'T logout if user has active analysis data (viewing results)
        // Only logout if truly idle (no data loaded)
        if (dataRef.current && dataRef.current.length > 0) {
            console.log('⏸️ Session timeout paused - User has active data');
            sessionTimeoutRef.current = setTimeout(handleAutoLogout, 5 * 60 * 1000); // Recheck in 5 min
            return;
        }

        console.log('🔒 Session expired - Auto logout');
        localStorage.removeItem('user');
        setIsAuthenticated(false);
        setFile(null);
        setData(null);
        setGeoData(null);
        setMapUrl(null);
        setShowAllPins(true);
        alert('Sesi Anda telah berakhir. Silakan login kembali.');
    }, []);

    // Reset session timeout on user activity
    const resetSessionTimeout = useCallback(() => {
        lastActivityRef.current = Date.now();

        // Clear existing timeout
        if (sessionTimeoutRef.current) {
            clearTimeout(sessionTimeoutRef.current);
        }

        // Set new timeout
        sessionTimeoutRef.current = setTimeout(() => {
            handleAutoLogout();
        }, SESSION_TIMEOUT);
    }, [SESSION_TIMEOUT, handleAutoLogout]);

    // Setup activity listeners for session timeout
    useEffect(() => {
        if (!isAuthenticated) {
            // Clear timeout if not authenticated
            if (sessionTimeoutRef.current) {
                clearTimeout(sessionTimeoutRef.current);
            }
            return;
        }

        // Initialize session timeout
        resetSessionTimeout();

        // Activity events to track
        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

        // Add event listeners
        activityEvents.forEach(event => {
            window.addEventListener(event, resetSessionTimeout);
        });

        // Cleanup
        return () => {
            activityEvents.forEach(event => {
                window.removeEventListener(event, resetSessionTimeout);
            });
            if (sessionTimeoutRef.current) {
                clearTimeout(sessionTimeoutRef.current);
            }
        };
    }, [isAuthenticated, resetSessionTimeout]);

    useEffect(() => {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@100;200;300;400;500;600;700&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        return () => document.head.removeChild(link);
    }, []);



    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);

    const [data, setData] = useState(null);
    const [geoData, setGeoData] = useState(null);
    const [vectorLayerData, setVectorLayerData] = useState(null);
    const [mapUrl, setMapUrl] = useState(null);
    const [rgbMapUrl, setRgbMapUrl] = useState(null);
    const [pipelineState, setPipelineState] = useState(null);
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
    const [loadingGeometries, setLoadingGeometries] = useState(false);
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

    // Track loading, batch, and data state in refs for timeout callback
    const dataRef = useRef(null);
    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    useEffect(() => {
        batchRunningRef.current = isBatchRunning;
    }, [isBatchRunning]);


    // Cancellation Refs
    const abortControllerRef = useRef(null);
    const wsRef = useRef(null);
    const isCancelledRef = useRef(false);
    const pendingReanalyzeRef = useRef(false);

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

    const [showOverlay, setShowOverlay] = useState(true);
    const [showRgb, setShowRgb] = useState(true);
    const [polygonOpacity, setPolygonOpacity] = useState(1.0);
    const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);

    // Transition Analysis State
    const [transitionSummary, setTransitionSummary] = useState(null);
    const [auditReport, setAuditReport] = useState(null);

    // Carbon Time-Series Mode (Indicative)
    const [isCarbonMode, setIsCarbonMode] = useState(false);

    // Identity for Security Verification (Point 4)
    const [userId] = useState(() => {
        const saved = localStorage.getItem('gealgeolgeo_user_id');
        if (saved) return saved;
        const newId = crypto.randomUUID();
        localStorage.setItem('gealgeolgeo_user_id', newId);
        return newId;
    });
    const [carbonModeEnabled, setCarbonModeEnabled] = useState(false);
    const [carbonHistoryId, setCarbonHistoryId] = useState(null);
    const [carbonFilename, setCarbonFilename] = useState(null);

    const [showKawasanHutan, setShowKawasanHutan] = useState(false);
    const [kawasanHutanOpacity, setKawasanHutanOpacity] = useState(0.6);
    const [showDAS, setShowDAS] = useState(false);
    const [dasOpacity, setDasOpacity] = useState(0.6);

    const [showSlopeLayer, setShowSlopeLayer] = useState(false);
    const [slopeOpacityInside, setSlopeOpacityInside] = useState(0.7);
    const [slopeOpacityOutside, setSlopeOpacityOutside] = useState(0.7);
    const [slopeMapUrlInside, setSlopeMapUrlInside] = useState(null);
    const [slopeMapUrlOutside, setSlopeMapUrlOutside] = useState(null);
    const [slopeStaticMapUrl, setSlopeStaticMapUrl] = useState(null); // NEW: Static map for PDF
    const [slopeDbSummary, setSlopeDbSummary] = useState(null);
    const [slopeDbSummaryOutside, setSlopeDbSummaryOutside] = useState(null);
    const [isExportingAll, setIsExportingAll] = useState(false);

    // KPS Detection State
    const [showKpsDialog, setShowKpsDialog] = useState(false);
    const [detectedKps, setDetectedKps] = useState(null);
    const [extractedNoSk, setExtractedNoSk] = useState(null);
    const [kpsLinkMethod, setKpsLinkMethod] = useState(null); // 'NO_SK_METADATA', 'MANUAL', 'NONE'
    const [pendingGeoData, setPendingGeoData] = useState(null); // Store geo data while KPS dialog is shown
    const [pendingFile, setPendingFile] = useState(null); // Store file info while KPS dialog is shown

    // Duplicate Detection State
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [duplicateInfo, setDuplicateInfo] = useState(null);
    const [duplicateHandleMode, setDuplicateHandleMode] = useState('replace'); // 'merge' or 'replace'
    const [selectedYearsForAnalysis, setSelectedYearsForAnalysis] = useState(null); // null = all years

    // Bulk Upload State
    const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
    const [showBulkReportDialog, setShowBulkReportDialog] = useState(false);
    const [bulkValidationResults, setBulkValidationResults] = useState(null);
    const [bulkFileItems, setBulkFileItems] = useState(null);

    // Monitoring Terkini State
    const [showMonitoringTerkini, setShowMonitoringTerkini] = useState(false);
    const [monitoringKpsId, setMonitoringKpsId] = useState(null);
    const [monitoringKpsName, setMonitoringKpsName] = useState(null);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            // Add timestamp query param to bypass client/browser cache
            const response = await axios.get(`${API_URL}/history?_t=${new Date().getTime()}`);
            setHistoryData(response.data || []);
        } catch (err) {
            console.error("Error fetching history:", err.message);

            // Check if it's a network error (backend not running)
            if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                console.warn('⚠️ Backend server tidak dapat dijangkau. Pastikan backend berjalan di', API_URL);
                // Set empty history data instead of leaving it undefined
                setHistoryData([]);
            } else {
                // Other errors (e.g., 500, 404)
                setHistoryData([]);
            }
        } finally {
            setLoadingHistory(false);
        }
    };

    // Fetch Slope Analysis Map (Raster from GEE)
    useEffect(() => {
        const getSlopeLayer = async () => {
            if (!showSlopeLayer || !geoData) {
                if (!showSlopeLayer) {
                    setSlopeMapUrlInside(null);
                    setSlopeMapUrlOutside(null);
                    // Don't clear static URL immediately so we can still export PDF if layer is toggled off but analysis exists
                }
                return;
            }

            try {
                // Use current geoData to get slope raster visualization
                // Pass history_id so backend can persist slope stats to DB
                const payload = { geo_data: geoData, history_id: file?.id || null };

                const response = await axios.post(`${API_URL}/map/slope`, payload);
                if (response.data?.status === 'success') {
                    setSlopeMapUrlInside(response.data.map_url_inside);
                    setSlopeMapUrlOutside(response.data.map_url_outside);
                    // Save static map URL for PDF
                    if (response.data.slope_map_url) {
                        setSlopeStaticMapUrl(response.data.slope_map_url);
                    }

                    // Update stats from live computation
                    if (response.data.db_summary && response.data.db_summary.length > 0) {
                        const insideRecord = response.data.db_summary.find(r => r.scope === 'INSIDE') || response.data.db_summary[0];
                        setSlopeDbSummary(insideRecord);
                        const outsideRecord = response.data.db_summary.find(r => r.scope === 'OUTSIDE_2KM')
                            || response.data.db_summary.find(r => r.scope === 'OUTSIDE');
                        setSlopeDbSummaryOutside(outsideRecord || null);
                    }
                }
            } catch (err) {
                console.error("Error fetching slope layer:", err);
            }
        };

        getSlopeLayer();
    }, [showSlopeLayer, geoData]);

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
                // Lazy import libraries and utils
                const { reprojectToWGS84 } = await import('./utils/geoUtils');

                if (zipFiles.length === 1) {
                    targetFile = zipFiles[0];
                    const { default: shp } = await import('shpjs');
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
                    const { default: JSZip } = await import('jszip');
                    const { default: shp } = await import('shpjs');
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

                // === KPS DETECTION FROM SHP METADATA ===
                // Extract identifier from SHP properties (check multiple common field names)
                let foundNoSk = null;
                if (finalGeo?.features?.length > 0) {
                    // Collect all properties from all features to find identifier
                    for (const feature of finalGeo.features) {
                        const props = feature.properties || {};

                        // Strategy: Look for any key that contains 'SK' or 'KPS' case-insensitively
                        // Priority given to exact matches like NO_SK or NO_KPS
                        const keys = Object.keys(props);

                        // 1. High priority exact-ish matches
                        const priorityFields = ['NO_SK', 'NO_KPS', 'NOSK', 'NOSK_KPS', 'SK_NUMBER'];
                        for (const field of priorityFields) {
                            const foundKey = keys.find(k => k.toUpperCase() === field);
                            if (foundKey && props[foundKey] && String(props[foundKey]).trim()) {
                                foundNoSk = String(props[foundKey]).trim();
                                break;
                            }
                        }

                        // 2. Fallback: Search for any key containing SK or KPS
                        if (!foundNoSk) {
                            for (const key of keys) {
                                const upperKey = key.toUpperCase();
                                if (upperKey.includes('SK') || (upperKey.includes('NO') && upperKey.includes('KPS'))) {
                                    if (props[key] && String(props[key]).trim()) {
                                        foundNoSk = String(props[key]).trim();
                                        break;
                                    }
                                }
                            }
                        }

                        if (foundNoSk) break;
                    }
                }

                // Store pending data for KPS dialog
                setPendingGeoData(finalGeo);
                setPendingFile({ name: targetFile.name, size: targetFile.size });
                setExtractedNoSk(foundNoSk);

                // Reset previous state
                setData(null); setMapUrl(null); setVectorLayerData(null); setError(null);
                setBatchQueue([]); // Clear batch queue if switching to single mode

                // === CHECK FOR DUPLICATE BEFORE KPS DETECTION ===
                try {
                    console.log('🔍 Checking for duplicate geometry...');
                    const dupResponse = await axios.post(`${API_URL}/api/check-duplicate`, { geo_data: finalGeo });

                    if (dupResponse.data?.is_duplicate && dupResponse.data?.has_analysis) {
                        console.log('⚠️ Duplicate found:', dupResponse.data);
                        setDuplicateInfo(dupResponse.data);
                        setShowDuplicateDialog(true);
                        return; // Stop here, let DuplicateDialog handle the flow
                    }
                } catch (err) {
                    console.warn('Duplicate check failed:', err.message);
                    // Continue with normal flow if check fails
                }

                // Try auto-detect KPS if NO_SK found
                if (foundNoSk) {
                    try {
                        console.log(`🔍 Auto-detecting KPS for NO_SK: ${foundNoSk}`);
                        const response = await axios.get(`${API_URL}/api/kps/auto-detect?no_sk=${encodeURIComponent(foundNoSk)}`);
                        if (response.data?.status === 'found' && response.data.kps) {
                            console.log(`✅ KPS found:`, response.data.kps);
                            setDetectedKps(response.data.kps);
                        } else {
                            console.log(`ℹ️ NO_SK not found in master_kps`);
                            setDetectedKps(null);
                        }
                    } catch (err) {
                        console.error("KPS auto-detect error:", err);
                        setDetectedKps(null);
                    }
                } else {
                    setDetectedKps(null);
                }

                // Show KPS detection dialog
                setShowKpsDialog(true);

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
                // 1. Parse Geometry (lokal browser) - Skip if already parsed from bulk upload
                let finalGeo;

                if (nextJob.parsedGeometry) {
                    // Geometry already parsed during bulk upload validation
                    console.log(`✓ Using pre-parsed geometry for ${nextJob.file.name}`);
                    finalGeo = nextJob.parsedGeometry;
                    setBatchQueue(q => q.map(j => j.id === nextJob.id ? { ...j, progress: 15, progressDetail: 'Menggunakan data validasi...' } : j));
                } else {
                    // Parse geometry from file
                    let rawGeojson;
                    const file = nextJob.file;
                    const fileType = nextJob.fileType;

                    let totalSize = file.size;

                    setBatchQueue(q => q.map(j => j.id === nextJob.id ? { ...j, progress: 10, progressDetail: 'Membaca file...' } : j));

                    // Load geoUtils FIRST to ensure Proj4 definitions are registered
                    const { reprojectToWGS84 } = await import('./utils/geoUtils');

                    if (fileType === 'geojson') {
                        const text = await new Promise((res, rej) => {
                            const reader = new FileReader();
                            reader.onload = (e) => res(e.target.result);
                            reader.onerror = rej;
                            reader.readAsText(file);
                        });
                        rawGeojson = JSON.parse(text);
                    } else if (fileType === 'zip') {
                        const { default: shp } = await import('shpjs');
                        rawGeojson = await shp(await readFileAsArrayBuffer(file));
                    } else if (fileType === 'shp-bundle') {
                        // Bundle loose SHP components into in-memory ZIP
                        const { default: JSZip } = await import('jszip');
                        const { default: shp } = await import('shpjs');
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
                    finalGeo = reprojectToWGS84(rawGeojson);
                }

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
                                progressDetail: `Sudah ada di database (${existingItem.display_name || existingItem.filename})`,
                                existingHistoryId: existingItem.id
                            }
                            : j
                    ));
                    return; // Skip ke job berikutnya
                }

                // 3. Kirim ke WebSocket (Analisis)
                await runBatchAnalysis(nextJob.id, finalGeo, nextJob.file.name, nextJob.file.size, nextJob.kpsMetadata);

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

    const runBatchAnalysis = (jobId, geometry, filename, fileSize, kpsMetadata = null) => {
        return new Promise((resolve, reject) => {
            let completed = false; // Track if promise is already resolved/rejected

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
                    completed = true; // Mark as completed IMMEDIATELY to prevent race condition
                    try {
                        const payload = {
                            filename: filename,
                            file_size: fileSize,
                            metadata: {
                                year: 2025,
                                location: kpsMetadata?.kps_name || "Batch Upload",
                                source: "Sentinel-2",
                                start_year: startYear,
                                end_year: endYear,
                                version: "3.0 (RF)",
                                cloud_prob: CLOUD_PROB_THRESHOLD_FIXED,
                                // Add KPS metadata if available
                                ...(kpsMetadata ? {
                                    no_sk: kpsMetadata.kps_no_sk,
                                    link_method: kpsMetadata.link_method
                                } : {})
                            },
                            analysis_results: response.data.data,
                            geo_data: geometry,
                            mode: 'replace',
                            transition_summary: response.data.transition_summary,
                            audit_report: response.data.audit_report,
                            // Add KPS linking if available
                            ...(kpsMetadata ? {
                                kps_id: kpsMetadata.kps_id,
                                link_method: kpsMetadata.link_method,
                                analysis_scope: 'KPS'
                            } : {})
                        };
                        await axios.post(`${API_URL}/history`, payload, {
                            headers: { 'X-User-ID': userId }
                        });
                        fetchHistory();
                        ws.close();
                        resolve();
                    } catch (saveErr) {
                        ws.close();
                        reject(new Error("Gagal menyimpan: " + saveErr.message));
                    }
                } else if (response.type === 'error') {
                    completed = true; // Mark as completed
                    ws.close();
                    reject(new Error(response.message || "Unknown error"));
                }
            };

            ws.onerror = (e) => {
                if (!completed) {
                    completed = true;
                    reject(new Error("WebSocket Error"));
                }
            };

            ws.onclose = (event) => {
                // Only reject if not already completed and close was not clean
                if (!completed && !event.wasClean) {
                    completed = true;
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
        try {
            await axios.delete(`${API_URL}/history/${id}`, {
                headers: { 'X-User-ID': userId }
            });
            // Remove from parent state after confirmed success
            setHistoryData(prev => prev.filter(item => item.id !== id));
            console.log(`✅ ID ${id} deleted successfully.`);
        } catch (err) {
            const is404 = err.response?.status === 404 || err.message?.includes("404");

            if (is404) {
                // Already gone — still remove from parent state
                setHistoryData(prev => prev.filter(item => item.id !== id));
                console.log(`ℹ️ ID ${id} was already deleted (404).`);
                return;
            }

            // Re-throw so child can handle the error via toast
            console.error("❌ Delete failure:", err);
            throw err;
        }
    };

    const handleUpdateHistoryItem = (updatedItem) => {
        setHistoryData(prev => {
            if (!prev) return [];
            return prev.map(item => item.id === updatedItem.id ? updatedItem : item);
        });
    };

    // Strip expired GEE tile URLs from analysis results loaded from history.
    // GEE tile URLs expire after a few hours, so when loading saved data
    // we nullify them to let the fallback ImageOverlay (using local thumb_url/rgb_thumb_url) work.
    const stripExpiredGeeUrls = (results) => {
        if (!results) return results;
        const isGeeUrl = (url) => url && (url.includes('earthengine.googleapis.com') || url.includes('googleapis.com/v1'));
        return results.map(r => ({
            ...r,
            map_url: isGeeUrl(r.map_url) ? null : r.map_url,
            rgb_url: isGeeUrl(r.rgb_url) ? null : r.rgb_url,
        }));
    };

    const handleHistorySelect = async (item) => {
        // --- ⚡ OPTIMIZATION: RENDER DASHBOARD IMMEDIATELY ---
        // First, hide the global pins view so the dashboard knows we are in a specific item view
        setShowAllPins(false);
        setShowHistoryTable(false);
        setError(null);

        // Clear vectorLayerData to allow MapRecenter to auto-fit to new geoData
        setVectorLayerData(null);

        // Set the file/name immediately to update the dashboard title
        setFile({ name: item.nama_kps || item.display_name || item.filename, size: item.file_size, id: item.id, kps_info: item.kps_info || null });

        // Use the stats we already have from the list view
        // Strip expired GEE tile URLs so local assets (thumb_url, rgb_thumb_url) are used as fallback
        if (item.analysis_results) {
            console.log("📊 Setting analysis results immediately:", item.analysis_results.length, "years");
            setData(stripExpiredGeeUrls(item.analysis_results));
        }

        setTransitionSummary(item.metadata?.transition_summary || null);
        setAuditReport(item.metadata?.audit_report || null);

        // Restore slope data if available in summary
        if (item.slope_summary && item.slope_summary.length > 0) {
            const insideSlope = item.slope_summary.find(s => s.scope === 'INSIDE');
            const outsideSlope = item.slope_summary.find(s => s.scope === 'OUTSIDE_2KM')
                || item.slope_summary.find(s => s.scope === 'OUTSIDE');
            if (insideSlope) setSlopeDbSummary(insideSlope);
            if (outsideSlope) setSlopeDbSummaryOutside(outsideSlope);
        }
        // Restore slope map URL if available from DB
        if (item.slope_map_url) {
            setSlopeStaticMapUrl(item.slope_map_url);
        }

        if (item.analysis_results?.length > 0) {
            // Set to the highest year (most recent)
            const maxYear = Math.max(...item.analysis_results.map(d => d.year));
            setSelectedYear(maxYear);
            setMapType('SENTINEL_RGB');
            setShowOverlay(true);
        }

        // If we have a centroid/point from the list, use it as temporary geoData 
        // until the full geometry loads, so the dashboard doesn't show "No Location"
        if (item.geo_data) {
            setGeoData(item.geo_data);
        }

        // --- 🛰️ BACKGROUND FETCH FOR GEOMETRIES ---
        setLoadingGeometries(true);
        try {
            console.log(`📡 Background Fetch: GeoJSON for history item ${item.id}`);
            const response = await axios.get(`${API_URL}/history/${item.id}`);
            const fullItem = response.data;

            // Only update if we're still looking at the same item
            // (Minimal safety, can be improved with refs)
            if (fullItem.geo_data) {
                setGeoData(fullItem.geo_data);
            }

            // Sync any other details that might only be in the full item
            // Strip expired GEE URLs so local assets are used
            if (fullItem.analysis_results) {
                const cleanedResults = stripExpiredGeeUrls(fullItem.analysis_results);
                setData(cleanedResults);
                // Set selectedYear ke tahun terbaru jika belum di-set
                if (cleanedResults.length > 0) {
                    const maxYear = Math.max(...cleanedResults.map(d => d.year));
                    setSelectedYear(maxYear);
                    setMapType('SENTINEL_RGB');
                    setShowOverlay(true);
                }
            }

            // Update file with kps_info from full detail
            if (fullItem.kps_info) {
                setFile(prev => prev ? { ...prev, kps_info: fullItem.kps_info } : prev);
            }

            // Track pipeline state for tile cache status
            setPipelineState(fullItem.pipeline_state || 'LEGACY');

            // Restore slope map URL from DB if available
            if (fullItem.slope_map_url) {
                setSlopeStaticMapUrl(fullItem.slope_map_url);
            }

            console.log('✅ Background GeoJSON loaded');
        } catch (err) {
            console.error("Error fetching background geometries:", err);
            // Don't show global error, just map might be empty
        } finally {
            setLoadingGeometries(false);
        }
    };

    // Auto-trigger analysis after re-analyze sets geoData
    useEffect(() => {
        if (pendingReanalyzeRef.current && geoData && !loading) {
            pendingReanalyzeRef.current = false;
            handleAnalyze();
        }
    }, [geoData]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleHistoryReanalyze = async (item) => {
        setLoadingHistory(true);
        try {
            const response = await axios.get(`${API_URL}/history/${item.id}`);
            const fullItem = response.data;

            setFile({ name: fullItem.display_name || fullItem.filename, size: fullItem.file_size });
            setData(null);
            setVectorLayerData(null);
            setMapUrl(null);
            setRgbMapUrl(null);
            if (fullItem.metadata) setStartYear(fullItem.metadata.start_year || 2017);

            setShowHistoryTable(false);
            setShowAllPins(false);

            // Set flag before setting geoData - useEffect will trigger handleAnalyze
            pendingReanalyzeRef.current = true;
            if (fullItem.geo_data) setGeoData(fullItem.geo_data);
        } catch (err) {
            console.error("Error fetching history for reanalysis:", err);
            pendingReanalyzeRef.current = false;
            alert("Gagal memuat data untuk analisis ulang: " + err.message);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleReset = () => {
        setData(null); setGeoData(null); setFile(null); setMapUrl(null); setRgbMapUrl(null);
        setVectorLayerData(null); // Clear any specific classification vectors
        setTransitionSummary(null); setAuditReport(null);
        setSelectedYear(null); setError(null);
        setStartYear(2017); setEndYear(currentYear - 1);
        setMapType('satellite'); // Switch back to high-res basemap
        setShowAllPins(true); fetchHistory();
        // Clear KPS detection states
        setDetectedKps(null); setExtractedNoSk(null); setKpsLinkMethod(null);
        setPendingGeoData(null); setPendingFile(null);
        // Clear Slope states
        setSlopeDbSummary(null); setSlopeDbSummaryOutside(null);
        setSlopeMapUrlInside(null); setSlopeMapUrlOutside(null);
        setShowSlopeLayer(false);
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

    // === KPS DETECTION DIALOG HANDLERS ===
    const handleKpsConfirm = (kps, method) => {
        // User confirmed a KPS selection
        console.log(`✅ KPS confirmed: ${kps.nama_kps} (method: ${method})`);
        setDetectedKps(kps);
        setKpsLinkMethod(method);
        setShowKpsDialog(false);

        // Now set the actual geoData and file from pending state
        if (pendingGeoData) {
            setGeoData(pendingGeoData);
        }
        if (pendingFile) {
            setFile(pendingFile);
        }

        // Clear pending state
        setPendingGeoData(null);
        setPendingFile(null);
    };

    const handleKpsSkip = () => {
        // User chose to proceed as NON_KPS
        console.log(`ℹ️ Proceeding as NON_KPS`);
        setDetectedKps(null);
        setKpsLinkMethod('NONE');
        setShowKpsDialog(false);

        // Now set the actual geoData and file from pending state
        if (pendingGeoData) {
            setGeoData(pendingGeoData);
        }
        if (pendingFile) {
            setFile(pendingFile);
        }

        // Clear pending state
        setPendingGeoData(null);
        setPendingFile(null);
    };

    const handleKpsClose = () => {
        // User closed dialog without selection - cancel the upload
        console.log(`ℹ️ KPS dialog closed - cancelling upload`);
        setShowKpsDialog(false);
        setDetectedKps(null);
        setExtractedNoSk(null);
        setKpsLinkMethod(null);
        setPendingGeoData(null);
        setPendingFile(null);
    };

    // === DUPLICATE DIALOG HANDLERS ===
    const continueToKpsDetection = async () => {
        // Helper function to continue the flow after duplicate handling
        const foundNoSk = extractedNoSk;

        if (foundNoSk) {
            try {
                console.log(`🔍 Auto-detecting KPS for NO_SK: ${foundNoSk}`);
                const response = await axios.get(`${API_URL}/api/kps/auto-detect?no_sk=${encodeURIComponent(foundNoSk)}`);
                if (response.data?.status === 'found' && response.data.kps) {
                    console.log(`✅ KPS found:`, response.data.kps);
                    setDetectedKps(response.data.kps);
                } else {
                    setDetectedKps(null);
                }
            } catch (err) {
                console.error("KPS auto-detect error:", err);
                setDetectedKps(null);
            }
        }

        setShowKpsDialog(true);
    };

    const handleDuplicateUpdate = async (missingYears) => {
        // User chose to Update - analyze only missing years
        console.log(`📥 Update mode: Will analyze only years: ${missingYears.join(', ')}`);
        setDuplicateHandleMode('merge');
        setSelectedYearsForAnalysis(missingYears);
        setShowDuplicateDialog(false);

        // Continue to KPS detection
        await continueToKpsDetection();
    };

    const handleDuplicateReplace = async () => {
        // User chose to Replace - delete old and analyze all years
        console.log(`🔄 Replace mode: Will delete old data and re-analyze all years`);
        setDuplicateHandleMode('replace');
        setSelectedYearsForAnalysis(null); // null = all years
        setShowDuplicateDialog(false);

        // Continue to KPS detection
        await continueToKpsDetection();
    };

    const handleDuplicateCancel = () => {
        // User cancelled - reset everything
        console.log(`❌ Duplicate dialog cancelled`);
        setShowDuplicateDialog(false);
        setDuplicateInfo(null);
        setDuplicateHandleMode('replace');
        setSelectedYearsForAnalysis(null);
        setPendingGeoData(null);
        setPendingFile(null);
        setExtractedNoSk(null);
    };



    const handleBulkValidationComplete = (validationResults, fileItems) => {
        setBulkValidationResults(validationResults);
        setBulkFileItems(fileItems);
        setShowBulkUploadDialog(false);
        setShowBulkReportDialog(true);
    };

    const handleBulkReportSuccess = async (results, fileItems) => {
        console.log('Bulk upload complete:', results);

        // Convert validated bulk files to batch queue jobs
        const newJobs = fileItems.map((fileItem, idx) => {
            const result = results[idx];
            return {
                id: Math.random().toString(36).substr(2, 9),
                file: {
                    name: result.filename,
                    size: fileItem.file_size || 0
                },
                fileType: result.filename.toLowerCase().endsWith('.geojson') ? 'geojson' : 'zip',
                status: 'waiting',
                progress: 0,
                progressDetail: 'Antre...',
                error: null,
                // Store the already-parsed geometry from validation
                parsedGeometry: fileItem.geo_data,
                // Store KPS metadata if available
                kpsMetadata: result.kps_id ? {
                    kps_id: result.kps_id,
                    kps_name: result.kps_name,
                    kps_no_sk: result.kps_no_sk,
                    link_method: result.status === 'valid' ? 'AUTO' : 'MANUAL'
                } : null
            };
        });

        // Add jobs to batch queue
        setBatchQueue(prev => [...prev, ...newJobs]);

        // Close dialogs
        setShowBulkReportDialog(false);
        setBulkValidationResults(null);
        setBulkFileItems(null);

        // Auto-start batch processing
        setIsBatchRunning(true);

        console.log(`✓ Added ${newJobs.length} files to batch queue and started processing`);
    };

    const handleBulkError = (error) => {
        alert(`Bulk upload error: ${error}`);
        setShowBulkUploadDialog(false);
        setShowBulkReportDialog(false);
    };

    const handleOpenMonitoringTerkini = (kpsId, kpsName) => {
        setMonitoringKpsId(kpsId);
        setMonitoringKpsName(kpsName);
        setShowMonitoringTerkini(true);
    };

    const handleAnalyze = async (customThresholds = null) => {
        if (!geoData) return;

        // Use mode from duplicate dialog state
        const analysisMode = duplicateHandleMode; // 'merge' or 'replace'
        const yearsToAnalyze = selectedYearsForAnalysis; // Array of years or null (all)

        let actualThresholds = (customThresholds && customThresholds.nativeEvent) ? null : customThresholds;
        if (!actualThresholds) actualThresholds = thresholds;
        setLoading(true); setError(null); setData(null); setMapUrl(null);
        setProgress(5); setProgressStep("Menghubungkan ke server...");
        setQueuePosition(null); // Reset queue position
        // Clear slope stats for the new analysis session
        setSlopeDbSummary(null); setSlopeDbSummaryOutside(null);

        isCancelledRef.current = false;
        abortControllerRef.current = new AbortController(); // Create controller for potential fallback

        console.log(' RF Classification Request');
        console.log(`📅 Year Range: ${yearsToAnalyze ? yearsToAnalyze.join(', ') : startYear + ' - ' + endYear}`);
        console.log(`📥 Mode: ${analysisMode}`);
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
                    selected_years: yearsToAnalyze, // NEW: Specific years to analyze
                    thresholds: actualThresholds,
                    mode: analysisMode, // 'merge' or 'replace'
                    cloud_prob_threshold: CLOUD_PROB_THRESHOLD_FIXED,
                    // If merge mode, we don't need to send existing data back, backend handles it
                    existing_data: []
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
                        // Keep session alive during analysis progress
                        resetSessionTimeout();
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
                            // Set to the highest year (most recent)
                            const maxYear = Math.max(...msg.data.data.map(d => d.year));
                            const lastData = msg.data.data.find(d => d.year === maxYear) || msg.data.data[msg.data.data.length - 1];
                            setSelectedYear(maxYear); setMapUrl(lastData.map_url); setRgbMapUrl(lastData.rgb_url); setMapType('SENTINEL_RGB');
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
                                mode: analysisMode, // Pass the mode (merge/replace)
                                transition_summary: msg.data.transition_summary,
                                audit_report: msg.data.audit_report,
                                // KPS Detection Fields
                                kps_id: detectedKps?.id_kps_api || null,
                                link_method: kpsLinkMethod || 'NONE',
                                analysis_scope: detectedKps ? 'KPS' : 'NON_KPS'
                            }, {
                                headers: { 'X-User-ID': userId }
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
                        // Set to the highest year (most recent)
                        const maxYear = Math.max(...response.data.data.map(d => d.year));
                        const lastData = response.data.data.find(d => d.year === maxYear) || response.data.data[response.data.data.length - 1];
                        setSelectedYear(maxYear); setMapUrl(lastData.map_url); setRgbMapUrl(lastData.rgb_url); setMapType('SENTINEL_RGB'); setShowOverlay(true);
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
                            audit_report: response.data.audit_report,
                            // KPS Detection Fields
                            kps_id: detectedKps?.id_kps_api || null,
                            link_method: kpsLinkMethod || 'NONE',
                            analysis_scope: detectedKps ? 'KPS' : 'NON_KPS'
                        }, {
                            headers: { 'X-User-ID': userId }
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
        } catch (e) { setError('Export GeoJSON gagal: ' + (e.response?.data?.detail || e.message)); }
    };

    const exportAllAnalysisToExcel = async () => {
        setIsExportingAll(true);
        try {
            const response = await axios.get(`${API_URL}/api/export/all-analysis-excel`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().toISOString().split('T')[0];
            link.setAttribute('download', `Laporan_Semua_Analisis_${timestamp}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (e) {
            setError('Export Excel gagal: ' + (e.response?.data?.detail || e.message));
        } finally {
            setIsExportingAll(false);
        }
    };

    const handleExportShp = async () => {
        if (!data?.length || !geoData) return;
        try {
            const response = await axios.post(`${API_URL}/export/shp`, { geojson: geoData, data: data }, { responseType: 'blob', timeout: 600000 });
            const a = document.createElement('a'); a.href = window.URL.createObjectURL(response.data); a.download = `SHP_Tutupan_Lahan_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.zip`; document.body.appendChild(a); a.click(); a.remove();
        } catch (e) { setError('Export SHP gagal: ' + (e.response?.data?.detail || e.message)); }
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

    // Local tile URLs for cache-first serving (pipeline Phase 1)
    const localMapTileUrl = useMemo(() => {
        if (!file?.id || !selectedYear) return null;
        const idShort = file.id.substring(0, 8);
        return `${API_URL}/tiles/${file.id}/classified/${selectedYear}/{z}/{x}/{y}.png`;
    }, [file?.id, selectedYear]);

    const localRgbTileUrl = useMemo(() => {
        if (!file?.id || !selectedYear) return null;
        return `${API_URL}/tiles/${file.id}/rgb/${selectedYear}/{z}/{x}/{y}.png`;
    }, [file?.id, selectedYear]);
    const yearStats = useMemo(() => {
        if (!selectedYearData) return null;
        const stats = Object.entries(LAND_COVER_CONFIG).map(([key, config]) => ({ key, ...config, value: selectedYearData[key] || 0 })).filter(s => s.value > 0);
        const total = stats.reduce((sum, s) => sum + s.value, 0);
        return { stats: stats.map(s => ({ ...s, percentage: total > 0 ? ((s.value / total) * 100).toFixed(1) : 0 })).sort((a, b) => b.value - a.value), total };
    }, [selectedYearData]);
    const dominantLandCover = useMemo(() => yearStats?.stats?.[0] || null, [yearStats]);
    const layoutProps = {
        file, loading, data, geoData, setData, setGeoData, setFile, setMapUrl, setRgbMapUrl, setVectorLayerData, setError,
        vectorLayerData, mapUrl, rgbMapUrl, localMapTileUrl, localRgbTileUrl, pipelineState, error, startYear, setStartYear, endYear, setEndYear,
        analysisMode, setAnalysisMode, specificDate, setSpecificDate, mapType, setMapType, selectedYear, setSelectedYear,
        showOverlay, setShowOverlay, showRgb, setShowRgb, polygonOpacity, setPolygonOpacity, showConfidenceInfo, setShowConfidenceInfo,
        showMetadata, setShowMetadata, progress, progressStep, progressDetail, showCalibration, setShowCalibration, thresholds, setThresholds,
        expandedAttributes, setExpandedAttributes, historyData, loadingHistory, loadingGeometries, showSidebar, setShowSidebar, sidebarRef,
        isCompareMode, setIsCompareMode, compareYear, setCompareYear, compareMapUrl, setCompareMapUrl, compareRgbMapUrl, setCompareRgbMapUrl,
        handleFileChange, handleAnalyze, handleDeleteHistory, handleUpdateHistoryItem, handleHistorySelect, handleHistoryReanalyze, handleReset, onExportShp: handleExportShp, onExportToExcel: exportToExcel, onExportToGeoJSON: exportToGeoJSON, onExportAllToExcel: exportAllAnalysisToExcel,
        handleCancel, isExportingAll,
        selectedYearData, yearStats, dominantLandCover,
        // Global Props
        showAllPins, setShowAllPins, showHistoryTable, setShowHistoryTable,
        // Analysis completion popup
        showAnalysisComplete, setShowAnalysisComplete,
        showBatchComplete, setShowBatchComplete,
        // SIGAP Interaktif
        showKawasanHutan, setShowKawasanHutan, kawasanHutanOpacity, setKawasanHutanOpacity,
        showDAS, setShowDAS, dasOpacity, setDasOpacity,
        // Slope Analysis Layer
        showSlopeLayer, setShowSlopeLayer, slopeOpacityInside, setSlopeOpacityInside, slopeOpacityOutside, setSlopeOpacityOutside, slopeMapUrlInside, slopeMapUrlOutside, slopeDbSummary, slopeDbSummaryOutside,
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
        queuePosition, // Pass current queue rank

        // Bulk Upload
        setShowBulkUploadDialog,
        // Monitoring Terkini
        onOpenMonitoringTerkini: handleOpenMonitoringTerkini,
        detectedKps
    };

    // Login Handler
    const handleLoginSuccess = (userData) => {
        setIsAuthenticated(true);
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        setIsAuthenticated(false);
        // Reset all state when logging out
        setFile(null);
        setData(null);
        setGeoData(null);
        setMapUrl(null);
        setShowAllPins(true);
    };

    // Show Login Page if not authenticated
    if (!isAuthenticated) {
        return (
            <Suspense fallback={
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                    color: '#fff',
                    fontFamily: 'sans-serif'
                }}>
                    Loading...
                </div>
            }>
                <Login onLoginSuccess={handleLoginSuccess} />
            </Suspense>
        );
    }

    // Main App Content (shown when authenticated)
    return (
        <>
            <Suspense fallback={
                <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-slate-400 font-sans font-medium">
                    <div className="flex flex-col items-center gap-4 animate-pulse">
                        <div className="w-12 h-12 bg-emerald-500 rounded-2xl shadow-xl shadow-emerald-500/20"></div>
                        <div>Memuat Aplikasi...</div>
                    </div>
                </div>
            }>
                <MainLayout {...layoutProps} onLogout={handleLogout}>
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

            </Suspense>

            {/* Carbon Time-Series Dashboard Modal */}
            {carbonModeEnabled && (
                <Suspense fallback={null}>
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
                </Suspense>
            )}

            {/* KPS Detection Dialog */}
            {showKpsDialog && (
                <Suspense fallback={null}>
                    <KpsDetectionDialog
                        show={showKpsDialog}
                        detectedKps={detectedKps}
                        extractedNoSk={extractedNoSk}
                        onConfirm={handleKpsConfirm}
                        onSkip={handleKpsSkip}
                        onClose={handleKpsClose}
                    />
                </Suspense>
            )}

            {/* Duplicate SHP Detection Dialog */}
            {showDuplicateDialog && (
                <Suspense fallback={null}>
                    <DuplicateDialog
                        show={showDuplicateDialog}
                        duplicateInfo={duplicateInfo}
                        allYears={Array.from({ length: endYear - 2016 }, (_, i) => 2017 + i)}
                        onUpdate={handleDuplicateUpdate}
                        onReplace={handleDuplicateReplace}
                        onCancel={handleDuplicateCancel}
                    />
                </Suspense>
            )}

            {/* Bulk Upload Dialog */}
            {showBulkUploadDialog && (
                <Suspense fallback={null}>
                    <BulkUploadDialog
                        onClose={() => setShowBulkUploadDialog(false)}
                        onValidationComplete={handleBulkValidationComplete}
                        onError={handleBulkError}
                    />
                </Suspense>
            )}

            {/* Bulk Report Dialog */}
            {showBulkReportDialog && bulkValidationResults && bulkFileItems && (
                <Suspense fallback={null}>
                    <BulkReportDialog
                        validationResults={bulkValidationResults}
                        bulkFileItems={bulkFileItems}
                        onClose={() => setShowBulkReportDialog(false)}
                        onSuccess={handleBulkReportSuccess}
                        onError={handleBulkError}
                    />
                </Suspense>
            )}

            {/* Monitoring Terkini Dashboard */}
            {showMonitoringTerkini && (
                <Suspense fallback={null}>
                    <MonitoringTerkiniDashboard
                        isOpen={showMonitoringTerkini}
                        onClose={() => {
                            setShowMonitoringTerkini(false);
                            setMonitoringKpsId(null);
                            setMonitoringKpsName(null);
                        }}
                        idKps={monitoringKpsId}
                        namaKps={monitoringKpsName}
                        geoData={geoData}
                    />
                </Suspense>
            )}
        </>
    );
};
export default App;
