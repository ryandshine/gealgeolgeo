/**
 * MonitoringTerkiniDashboard.jsx
 *
 * Early Warning Dashboard for Recent Land Cover Changes
 *
 * Displays aggregate statistics and coordinate points for field verification
 * based on NDVI delta analysis (recent vs Q4 2025 baseline).
 *
 * IMPORTANT: This is an INDICATIVE early warning system, NOT final classification.
 * Results require field verification.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    AlertTriangle,
    MapPin,
    TrendingDown,
    Calendar,
    Loader2,
    X,
    Info,
    CheckCircle2,
    AlertCircle,
    RefreshCw
} from 'lucide-react';
import { API_URL } from '../constants';

// Status configuration with colors and icons
const STATUS_CONFIG = {
    HIJAU: {
        label: 'Hijau - Normal',
        color: 'bg-green-500',
        textColor: 'text-green-700',
        bgLight: 'bg-green-50',
        borderColor: 'border-green-200',
        icon: CheckCircle2,
        description: 'Perubahan minimal, dalam batas normal'
    },
    KUNING: {
        label: 'Kuning - Waspada',
        color: 'bg-yellow-500',
        textColor: 'text-yellow-700',
        bgLight: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        icon: AlertTriangle,
        description: 'Terdeteksi perubahan, perlu monitoring ketat'
    },
    MERAH: {
        label: 'Merah - Perlu Verifikasi Segera',
        color: 'bg-red-500',
        textColor: 'text-red-700',
        bgLight: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: AlertCircle,
        description: 'Perubahan signifikan, verifikasi lapangan segera diperlukan'
    }
};

const MonitoringTerkiniDashboard = ({ isOpen, onClose, idKps, namaKps, geoData }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    useEffect(() => {
        if (isOpen && (idKps || geoData)) {
            fetchMonitoringData();
        }
    }, [isOpen, idKps, geoData]);

    const fetchMonitoringData = async () => {
        setLoading(true);
        setError(null);

        try {
            let response;

            if (geoData) {
                // POST with geometry for direct GEE analysis
                console.log('🚀 Requesting GEE analysis with geometry...');
                response = await axios.post(`${API_URL}/api/dashboard/monitoring-terkini`, {
                    geo_data: geoData,
                    nama: namaKps || 'Analisis Monitoring'
                }, {
                    timeout: 120000  // 2 minutes for GEE processing
                });
            } else if (idKps) {
                // GET with KPS ID
                response = await axios.get(`${API_URL}/api/dashboard/monitoring-terkini`, {
                    params: { id_kps: idKps },
                    timeout: 120000
                });
            } else {
                throw new Error('No geometry or KPS ID provided');
            }

            setData(response.data);
        } catch (err) {
            console.error('Error fetching monitoring data:', err);

            if (err.code === 'ECONNABORTED') {
                setError('Analisis timeout. Area terlalu luas atau koneksi lambat. Silakan coba lagi.');
            } else {
                setError(err.response?.data?.detail || 'Gagal memuat data monitoring. Silakan coba lagi.');
            }
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const statusConfig = data ? (STATUS_CONFIG[data.status] || STATUS_CONFIG.KUNING) : null;
    const StatusIcon = statusConfig?.icon || AlertTriangle;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                                <TrendingDown className="w-7 h-7" />
                                Monitoring Perubahan Terkini
                            </h2>
                            <p className="text-emerald-100 text-sm font-medium">
                                {namaKps || idKps}
                            </p>
                            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-100">
                                <Info className="w-4 h-4" />
                                <span>Sistem Peringatan Dini - Hasil Indikasi Awal, Perlu Verifikasi Lapangan</span>
                            </div>
                            {/* Data Quality Badge (NEW) */}
                            {data && (
                                <div className="mt-3">
                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                        data.data_availability === 'OK'
                                            ? 'bg-emerald-200 text-emerald-800'
                                            : 'bg-yellow-200 text-yellow-800'
                                    }`}>
                                        Kualitas Data: {data.data_availability === 'OK' ? '✓ Baik' : '⚠ Rendah'}
                                    </span>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
                            <p className="text-slate-600 text-lg font-medium">Menganalisis data Sentinel-2...</p>
                            <p className="text-slate-400 text-sm mt-2">Proses ini memerlukan waktu 10-30 detik</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 text-red-700">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="font-semibold text-lg mb-1">Error</p>
                                    <p className="text-sm">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {data && (
                        <>
                            {/* Status Card */}
                            <div className={`${statusConfig.bgLight} ${statusConfig.borderColor} border-2 rounded-xl p-6 mb-6 shadow-sm`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`${statusConfig.color} p-4 rounded-full shadow-md`}>
                                            <StatusIcon className="w-8 h-8 text-white" />
                                        </div>
                                        <div>
                                            <h3 className={`text-2xl font-bold ${statusConfig.textColor}`}>
                                                {statusConfig.label}
                                            </h3>
                                            <p className="text-slate-600 text-sm mt-1">
                                                {statusConfig.description}
                                            </p>
                                            <p className="text-slate-500 text-xs mt-2">
                                                Periode: {data.recent_period.replace('_to_', ' s/d ').replace(/-/g, '/')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-5xl font-black ${statusConfig.textColor}`}>
                                            {data.persentase_perubahan.toFixed(2)}%
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1 font-medium">Persentase Indikasi</div>
                                    </div>
                                </div>
                            </div>

                            {/* Data Quality Alert (NEW) */}
                            {data.data_availability !== 'OK' && (
                                <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-4 mb-6">
                                    <div className="flex gap-3">
                                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-semibold text-amber-900 mb-1">Kualitas Data Rendah</p>
                                            <p className="text-xs text-amber-800">
                                                Data dengan kualitas rendah digunakan. Window waktu: {data.recent_window_used} hari.
                                                Pixel valid: {((data.valid_pixel_ratio || 0) * 100).toFixed(0)}%.
                                                Hasil bersifat indikatif dan memerlukan verifikasi lapangan yang lebih ketat.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 shadow-sm">
                                    <div className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">
                                        Luas Terindikasi
                                    </div>
                                    <div className="text-3xl font-bold text-slate-800">
                                        {data.luas_terindikasi_ha.toFixed(2)}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">hektar</div>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 shadow-sm">
                                    <div className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">
                                        Total Luas KPS
                                    </div>
                                    <div className="text-3xl font-bold text-slate-800">
                                        {data.total_area_kps_ha.toFixed(2)}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">hektar</div>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 shadow-sm">
                                    <div className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">
                                        Scene Satelit
                                    </div>
                                    <div className="text-3xl font-bold text-slate-800">
                                        {data.scene_count_recent}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        {data.cloud_coverage_pct ? `~${data.cloud_coverage_pct}% awan` : 'Sentinel-2'}
                                    </div>
                                </div>
                            </div>

                            {/* Temporal Info */}
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <Calendar className="w-5 h-5 text-blue-600" />
                                    <h4 className="font-semibold text-blue-900 text-lg">Periode Analisis</h4>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <div className="text-blue-600 font-semibold mb-2 text-sm uppercase tracking-wide">
                                            Baseline (Tetap)
                                        </div>
                                        <div className="text-slate-800 font-medium text-lg">
                                            {data.baseline_period}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-2 bg-white px-2 py-1 rounded border border-blue-100 inline-block">
                                            Mean NDVI: <span className="font-mono font-semibold">{data.baseline_ndvi_mean?.toFixed(3) || 'N/A'}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-blue-600 font-semibold mb-2 text-sm uppercase tracking-wide">
                                            Data Terkini
                                        </div>
                                        <div className="text-slate-800 font-medium text-lg">
                                            {data.recent_period.replace('_to_', ' s/d ').replace(/-/g, '/')}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-2 bg-white px-2 py-1 rounded border border-blue-100 inline-block">
                                            Mean NDVI: <span className="font-mono font-semibold">{data.recent_ndvi_mean?.toFixed(3) || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                                {data.delta_ndvi_mean !== null && (
                                    <div className="mt-4 pt-4 border-t border-blue-200">
                                        <div className="text-xs text-blue-600 font-medium mb-1">Delta NDVI (Rata-rata)</div>
                                        <div className={`text-2xl font-bold font-mono ${data.delta_ndvi_mean < -0.1 ? 'text-red-600' : 'text-slate-700'}`}>
                                            {data.delta_ndvi_mean.toFixed(3)}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            {data.delta_ndvi_mean < -0.2 ? '⚠️ Penurunan signifikan' : data.delta_ndvi_mean < -0.1 ? '⚠️ Penurunan moderat' : '✓ Stabil'}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Coordinate Points */}
                            <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="bg-slate-100 px-5 py-4 border-b-2 border-slate-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <MapPin className="w-5 h-5 text-slate-600" />
                                        <h4 className="font-bold text-slate-800 text-lg">
                                            Titik Koordinat Patch Terbesar
                                        </h4>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        Koordinat centroid untuk verifikasi lapangan (maksimal 5 patch terbesar)
                                    </p>
                                </div>

                                {data.centroid_points && data.centroid_points.length > 0 ? (
                                    <div className="divide-y divide-slate-200">
                                        {data.centroid_points.map((point, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="bg-emerald-100 text-emerald-700 font-bold rounded-full w-10 h-10 flex items-center justify-center text-lg shadow-sm">
                                                        {point.rank}
                                                    </div>
                                                    <div>
                                                        <div className="font-mono text-sm text-slate-700 font-medium">
                                                            {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                                                        </div>
                                                        <div className="text-xs text-slate-500 mt-1">
                                                            Luas patch: <span className="font-semibold">{point.area_ha.toFixed(3)} ha</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <a
                                                    href={`https://www.google.com/maps?q=${point.lat},${point.lng}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium shadow-sm hover:shadow-md"
                                                >
                                                    📍 Buka di Maps
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center text-slate-500">
                                        <MapPin className="w-16 h-16 mx-auto mb-3 text-slate-300" />
                                        <p className="font-medium">Tidak ada patch yang terdeteksi</p>
                                        <p className="text-xs mt-1">Tidak ada perubahan signifikan dengan kriteria threshold saat ini</p>
                                    </div>
                                )}
                            </div>

                            {/* Disclaimer */}
                            <div className="mt-6 bg-amber-50 border-2 border-amber-200 rounded-xl p-5 shadow-sm">
                                <div className="flex gap-3">
                                    <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-900">
                                        <p className="font-bold mb-2 text-base">⚠️ Catatan Penting</p>
                                        <ul className="list-disc list-inside space-y-1.5 text-xs leading-relaxed">
                                            <li>Ini adalah <strong>estimasi awal (indikasi)</strong>, bukan klasifikasi final deforestasi</li>
                                            <li>Data memerlukan <strong>verifikasi lapangan</strong> untuk konfirmasi perubahan tutupan lahan</li>
                                            <li>Perubahan NDVI dapat disebabkan oleh faktor alami (musim, cuaca, fenologi tanaman)</li>
                                            <li>Baseline tetap: <strong>Q4 2025</strong> (Oktober-Desember 2025) tidak pernah dihitung ulang</li>
                                            <li>Threshold deteksi: Delta NDVI &lt; -0.2, patch minimum 0.25 hektar</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t-2 border-slate-200 p-4 bg-slate-50">
                    <div className="flex justify-between items-center">
                        <button
                            onClick={fetchMonitoringData}
                            disabled={loading}
                            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-50 px-3 py-2 rounded-lg transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'Memproses...' : 'Refresh Data'}
                        </button>
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium shadow-sm hover:shadow-md"
                        >
                            Tutup
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MonitoringTerkiniDashboard;
