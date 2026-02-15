
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Search, X, Trash2, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Loader2, Flame, Eye, CheckCircle, Trees, Activity, TrendingUp, AlertOctagon } from 'lucide-react';
import { API_URL } from './constants';
import DashboardStatCard from './components/DashboardStatCard';
import DashboardCharts from './components/DashboardCharts';

const PER_PAGE = 15;

// Trend icon renderer — DB values: INCREASING, DECREASING, STABLE
const TrendLabel = ({ type }) => {
    if (!type) return <span className="text-[10px] text-slate-300">–</span>;
    const t = type.toUpperCase();
    if (t === 'DECREASING') return <span className="text-[10px] font-bold text-red-500">Turun</span>;
    if (t === 'INCREASING') return <span className="text-[10px] font-bold text-emerald-500">Naik</span>;
    return <span className="text-[10px] font-bold text-slate-400">Stabil</span>;
};

const HistoryDashboard = ({ onSelect, isSidebarOpen, onDelete, onReanalyze }) => {
    // Data state
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    // Global Dashboard State
    const [globalStats, setGlobalStats] = useState(null);
    const [globalYearly, setGlobalYearly] = useState([]);
    const [loadingGlobal, setLoadingGlobal] = useState(true);

    // UI state
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [pendingRowId, setPendingRowId] = useState(null); // Row-level loading
    const [toast, setToast] = useState(null); // { type: 'success'|'error', message: string }
    const [downloadingExcel, setDownloadingExcel] = useState(false); // Excel download loading state


    const toastTimerRef = useRef(null);
    const totalPages = Math.ceil(total / PER_PAGE);

    // Show toast notification
    const showToast = useCallback((type, message) => {
        setToast({ type, message });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    }, []);

    // Fetch data from view
    const fetchData = useCallback(async (p = 1, search = '') => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: p, per_page: PER_PAGE });
            if (search.trim()) params.append('search', search.trim());

            const res = await fetch(`${API_URL}/api/analysis/history/kps?${params}`);
            if (!res.ok) throw new Error('Failed to fetch');
            const json = await res.json();

            setData(json.data || []);
            setTotal(json.total || 0);
            setPage(json.page || 1);
        } catch (err) {
            console.error('Error fetching history table:', err);
            setData([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch Global Dashboard Data
    const fetchGlobalData = useCallback(async () => {
        setLoadingGlobal(true);
        try {
            const [statsRes, yearlyRes] = await Promise.all([
                fetch(`${API_URL}/api/dashboard/global-stats`),
                fetch(`${API_URL}/api/dashboard/global-yearly`)
            ]);

            if (statsRes.ok) {
                const statsJson = await statsRes.json();
                setGlobalStats(statsJson);
            }
            if (yearlyRes.ok) {
                const yearlyJson = await yearlyRes.json();
                setGlobalYearly(yearlyJson);
            }
        } catch (err) {
            console.error('Error fetching global dashboard data:', err);
        } finally {
            setLoadingGlobal(false);
        }
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchData(1, '');
        fetchGlobalData();
    }, [fetchData, fetchGlobalData]);

    // Manual search (on button click or Enter key)
    const handleSearch = useCallback(() => {
        setSearchTerm(searchInput);
        setPage(1);
        fetchData(1, searchInput);
    }, [fetchData, searchInput]);

    const handleSearchKeyDown = useCallback((e) => {
        if (e.key === 'Enter') handleSearch();
    }, [handleSearch]);

    const handleClearSearch = useCallback(() => {
        setSearchInput('');
        setSearchTerm('');
        setPage(1);
        fetchData(1, '');
    }, [fetchData]);

    // Pagination
    const goPage = useCallback((p) => {
        if (p < 1 || p > totalPages) return;
        fetchData(p, searchTerm);
    }, [fetchData, searchTerm, totalPages]);

    // Delete handler - use parent's onDelete for API call, then sync local state
    const handleConfirmDelete = useCallback(async () => {
        if (!deleteConfirmId) return;
        setPendingRowId(deleteConfirmId);
        try {
            if (onDelete) {
                await onDelete(deleteConfirmId);
            }
            // Remove row locally only after parent confirms success
            setData(prev => prev.filter(r => (r.analysis_id || r.id) !== deleteConfirmId));
            setTotal(prev => Math.max(0, prev - 1));
            showToast('success', 'Data berhasil dihapus');
        } catch (err) {
            console.error('Delete error:', err);
            showToast('error', 'Gagal menghapus: ' + (err.response?.data?.detail || err.message));
        } finally {
            setDeleteConfirmId(null);
            setPendingRowId(null);
        }
    }, [deleteConfirmId, onDelete, showToast]);

    // Re-Analisis handler
    const handleReanalyze = useCallback((e, item) => {
        e.stopPropagation();
        if (onReanalyze) {
            onReanalyze({ id: item.analysis_id || item.id, ...item });
        }
    }, [onReanalyze]);

    // Excel Download handler
    const handleDownloadExcel = useCallback(async () => {
        setDownloadingExcel(true);
        try {
            const response = await fetch(`${API_URL}/api/analysis/history/kps/export/excel`);

            if (!response.ok) {
                throw new Error('Failed to download Excel file');
            }

            // Get the blob from response
            const blob = await response.blob();

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            // Extract filename from Content-Disposition header or use default
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'Laporan_Analisis_KPS.xlsx';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showToast('success', 'Excel berhasil diunduh');
        } catch (err) {
            console.error('Excel download error:', err);
            showToast('error', 'Gagal mengunduh Excel: ' + err.message);
        } finally {
            setDownloadingExcel(false);
        }
    }, [showToast]);

    // Format date
    const fmtDate = (d) => {
        if (!d) return '–';
        return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Format number
    const fmtNum = (n) => {
        if (n == null) return '–';
        return Number(n).toFixed(2);
    };

    // Loading skeleton
    if (loading && data.length === 0) {
        return (
            <div className={`p-6 w-full max-w-[100vw] 2xl:max-w-7xl mx-auto pt-28 transition-all duration-500 ${isSidebarOpen ? 'ml-96 w-[calc(100%-24rem)]' : ''}`}>
                <div className="animate-pulse space-y-3">
                    <div className="h-10 bg-slate-200 rounded-xl w-1/3" />
                    <div className="h-8 bg-slate-100 rounded w-full" />
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="h-12 bg-slate-50 rounded border border-slate-100" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <>
            <div
                style={{
                    backgroundImage: `linear-gradient(rgba(6, 78, 59, 0.85), rgba(15, 23, 42, 0.95)), url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/6/10')`,
                    backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed'
                }}
                className={`relative z-10 pt-28 pb-8 px-4 md:px-8 w-full max-w-[100vw] 2xl:max-w-7xl mx-auto transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isSidebarOpen ? 'ml-96 w-[calc(100%-24rem)]' : 'w-full'} h-screen overflow-y-auto overflow-x-hidden`}
            >
                {/* Toast Notification */}
                {toast && (
                    <div className={`fixed top-6 right-6 z-[10002] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in slide-in-from-top duration-300 ${toast.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                        {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                        {toast.message}
                        <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100">
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* Header */}
                <div className="bg-gradient-to-r from-white to-emerald-50/30 backdrop-blur-md rounded-2xl p-4 md:p-6 shadow-xl border border-white/20 mb-6 flex flex-col md:flex-row items-center md:items-start gap-4 ring-1 ring-slate-900/5">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 md:p-3 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/30">
                            <Database size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-black text-slate-800 tracking-tight">Riwayat Analisis KPS</h2>
                            <p className="text-slate-500 text-[10px] md:text-sm mt-0.5">Klik tombol aksi untuk melihat, re-analisis, atau hapus data</p>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="w-full md:flex-1 md:max-w-md md:ml-8 flex items-center gap-2">
                        <div className="relative group flex-1">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search size={14} className="text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                placeholder="Cari nama KPS, No SK, provinsi, tren..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                className="block w-full pl-9 pr-9 py-2 md:py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-inner"
                            />
                            {searchInput && (
                                <button onClick={handleClearSearch} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={handleSearch}
                            className="px-3 py-2 md:py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow flex items-center gap-1.5 shrink-0"
                        >
                            <Search size={14} />
                            <span className="hidden sm:inline">Cari</span>
                        </button>
                    </div>

                    {/* Excel Download Button */}
                    <button
                        onClick={handleDownloadExcel}
                        disabled={downloadingExcel}
                        className="w-full md:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:scale-95 text-white text-[11px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                        {downloadingExcel ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Mengunduh...
                            </>
                        ) : (
                            <>
                                <Database size={16} />
                                Download Laporan Semua Analisis (Excel)
                            </>
                        )}
                    </button>

                    <div className="bg-slate-800 text-white px-3 md:gap-2 px-4 py-3 rounded-full text-[9px] md:text-xs font-bold font-mono border border-slate-700 shadow-sm shrink-0">
                        {total} DATASETS
                    </div>
                </div>

                {/* Global Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <DashboardStatCard
                        title="Total Area Teranalisis"
                        value={`${fmtNum(globalStats?.total_area_ha)} ha`}
                        icon={Activity}
                        color="blue"
                        loading={loadingGlobal}
                    />
                    <DashboardStatCard
                        title="Total Luas Hutan"
                        value={`${fmtNum(globalStats?.current_forest_ha)} ha`}
                        icon={Trees}
                        color="green"
                        loading={loadingGlobal}
                        subtext="Primer + Sekunder"
                    />
                    <DashboardStatCard
                        title="Titik Panas (Hotspots)"
                        value={globalStats?.total_hotspots_all_time || 0}
                        icon={Flame}
                        color="orange"
                        loading={loadingGlobal}
                        subtext="Total Deteksi"
                    />
                    <DashboardStatCard
                        title="Area Kelerengan Kritis"
                        value={`${fmtNum(globalStats?.total_slope_critical_ha)} ha`}
                        icon={AlertOctagon}
                        color="red"
                        loading={loadingGlobal}
                        subtext="> 40% (Sangat Curam)"
                    />
                </div>

                {/* Global Charts */}
                <DashboardCharts
                    yearlyData={globalYearly}
                    compositionData={[
                        { name: 'Hutan Primer', value: globalYearly[globalYearly.length - 1]?.hutan_primer || 0 },
                        { name: 'Hutan Sekunder', value: globalYearly[globalYearly.length - 1]?.hutan_sekunder || 0 },
                        { name: 'Tanah Kering', value: globalYearly[globalYearly.length - 1]?.tanah_kering || 0 },
                        { name: 'Tanah Kosong', value: globalYearly[globalYearly.length - 1]?.tanah_kosong || 0 },
                        { name: 'Air', value: globalYearly[globalYearly.length - 1]?.air || 0 },
                        { name: 'Lahan Terbangun', value: globalYearly[globalYearly.length - 1]?.lahan_terbangun || 0 },
                    ].filter(d => d.value > 0)}
                    loading={loadingGlobal}
                />

                {/* Table */}
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="text-left px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">KPS</th>
                                    <th className="text-left px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">Tipe / SK</th>
                                    <th className="text-left px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">Periode</th>
                                    <th className="text-right px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">Perubahan Hutan</th>
                                    <th className="text-center px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">Tren</th>
                                    <th className="text-center px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px] hidden md:table-cell">Hotspot</th>
                                    <th className="text-left px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px] hidden lg:table-cell">Dibuat</th>
                                    <th className="text-center px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    [...Array(PER_PAGE)].map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            {[...Array(8)].map((_, j) => (
                                                <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-full" /></td>
                                            ))}
                                        </tr>
                                    ))
                                ) : data.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center py-16 text-slate-400">
                                            <Database size={32} className="mx-auto mb-3 text-slate-300" />
                                            <p className="font-bold text-sm">Tidak ada data ditemukan</p>
                                            {searchTerm && <p className="text-[10px] mt-1">Coba ubah kata pencarian</p>}
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((row, idx) => {
                                        const rowId = row.analysis_id || row.id || idx;
                                        const isPending = pendingRowId === rowId;
                                        return (
                                            <tr
                                                key={rowId}
                                                className={`group transition-colors ${isPending ? 'opacity-50 pointer-events-none' : 'hover:bg-emerald-50/30'}`}
                                            >
                                                {/* KPS: nama + lokasi */}
                                                <td className="px-4 py-2.5 max-w-[200px]">
                                                    <div className="font-bold text-slate-800 truncate" title={row.nama_kps}>
                                                        {row.nama_kps || row.filename || '–'}
                                                    </div>
                                                    {(row.provinsi || row.kab_kota) && (
                                                        <div className="text-[10px] text-slate-400 truncate" title={[row.provinsi, row.kab_kota].filter(Boolean).join(', ')}>
                                                            {[row.provinsi, row.kab_kota].filter(Boolean).join(', ')}
                                                        </div>
                                                    )}
                                                </td>
                                                {/* Tipe / SK */}
                                                <td className="px-4 py-2.5">
                                                    <div className="text-slate-600">{row.kps_type || '–'}</div>
                                                    {row.no_sk && (
                                                        <div className="text-[10px] text-slate-400 max-w-[180px] break-words leading-tight">
                                                            {row.no_sk}
                                                        </div>
                                                    )}
                                                </td>
                                                {/* Periode + Luas */}
                                                <td className="px-4 py-2.5">
                                                    <div className="font-mono font-bold text-slate-700 whitespace-nowrap">{row.year_series || '–'}</div>
                                                    <div className="text-[10px] text-slate-400">Luas: {fmtNum(row.area_ha)} ha</div>
                                                </td>
                                                {/* Perubahan Hutan: deforestasi + reforestasi + net */}
                                                <td className="px-4 py-2.5 text-right">
                                                    {(() => {
                                                        const defor = row.deforestation_ha != null ? Number(row.deforestation_ha) : null;
                                                        const refor = row.reforestation_ha != null ? Number(row.reforestation_ha) : null;
                                                        const net = (refor || 0) - (defor || 0);
                                                        if (defor == null && refor == null) return <span className="text-slate-300">–</span>;
                                                        return (
                                                            <div className="space-y-0.5">
                                                                {defor != null && <div className="font-mono text-red-500 text-[10px]">↓ {defor.toFixed(2)} ha</div>}
                                                                {refor != null && <div className="font-mono text-emerald-500 text-[10px]">↑ {refor.toFixed(2)} ha</div>}
                                                                <div className={`font-mono font-bold text-[11px] ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                    net {net >= 0 ? '+' : ''}{net.toFixed(2)} ha
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                {/* Tren */}
                                                <td className="px-4 py-2.5 text-center"><TrendLabel type={row.trend_type} /></td>
                                                {/* Hotspot */}
                                                <td className="px-4 py-2.5 text-center hidden md:table-cell">
                                                    {row.hotspot_count > 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-orange-600 font-bold">
                                                            <Flame size={12} /> {row.hotspot_count}
                                                        </span>
                                                    ) : <span className="text-slate-300">–</span>}
                                                </td>
                                                {/* Dibuat + Dominan */}
                                                <td className="px-4 py-2.5 hidden lg:table-cell">
                                                    <div className="text-slate-500 whitespace-nowrap">{fmtDate(row.created_at)}</div>
                                                    {row.dominant_class && (
                                                        <div className="text-[10px] text-slate-400 truncate max-w-[130px]" title={row.dominant_class}>
                                                            Dominan: {row.dominant_class}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {isPending ? (
                                                            <Loader2 size={14} className="animate-spin text-slate-400" />
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => onSelect({ id: rowId, ...row })}
                                                                    className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase rounded shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5"
                                                                    title="Lihat Detail"
                                                                >
                                                                    <Eye size={13} />
                                                                    <span className="hidden xl:inline">Lihat</span>
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleReanalyze(e, row)}
                                                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-emerald-100 text-slate-500 hover:text-emerald-600 transition-all text-[10px] font-semibold"
                                                                    title="Re-Analisis"
                                                                >
                                                                    <RefreshCw size={13} />
                                                                    <span className="hidden xl:inline">Ulang</span>
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(rowId); }}
                                                                    disabled={pendingRowId === rowId}
                                                                    className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all text-[10px] font-semibold ${pendingRowId === rowId ? 'opacity-50 cursor-not-allowed text-slate-400' : 'hover:bg-red-100 text-slate-500 hover:text-red-600'}`}
                                                                    title="Hapus"
                                                                >
                                                                    {pendingRowId === rowId ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                                                    <span className="hidden xl:inline">Hapus</span>
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                            <span className="text-[10px] text-slate-500 font-medium">
                                Halaman {page} dari {totalPages} ({total} total)
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => goPage(page - 1)}
                                    disabled={page <= 1}
                                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                {/* Page numbers */}
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let p;
                                    if (totalPages <= 5) {
                                        p = i + 1;
                                    } else if (page <= 3) {
                                        p = i + 1;
                                    } else if (page >= totalPages - 2) {
                                        p = totalPages - 4 + i;
                                    } else {
                                        p = page - 2 + i;
                                    }
                                    return (
                                        <button
                                            key={p}
                                            onClick={() => goPage(p)}
                                            className={`w-8 h-8 rounded-lg text-[10px] font-bold transition-all ${p === page ? 'bg-emerald-500 text-white shadow-sm' : 'hover:bg-white border border-slate-200 text-slate-600'}`}
                                        >
                                            {p}
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={() => goPage(page + 1)}
                                    disabled={page >= totalPages}
                                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
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
                                Analisis ini akan dihapus permanen. Lanjutkan?
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all active:scale-95"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={handleConfirmDelete}
                                    disabled={!!pendingRowId}
                                    className={`flex-1 py-3 font-bold rounded-xl shadow-lg transition-all ${pendingRowId ? 'bg-red-400 cursor-not-allowed opacity-70 text-white' : 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/30 active:scale-95'}`}
                                >
                                    {pendingRowId ? <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Menghapus...</span> : 'Ya, Hapus'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default HistoryDashboard;
