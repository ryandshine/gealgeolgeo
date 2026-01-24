/**
 * CarbonDashboard.jsx
 * 
 * Dashboard untuk menampilkan analisis Carbon Time-Series (Mode Indikatif).
 * Menampilkan stok karbon per tahun, perubahan (delta), tren, dan tingkat keyakinan.
 * 
 * PERINGATAN: Mode ini bersifat INDIKATIF, bukan untuk perdagangan karbon atau regulasi.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
    Cell
} from 'recharts';
import {
    Leaf,
    TrendingUp,
    TrendingDown,
    Minus,
    AlertTriangle,
    Info,
    ChevronDown,
    ChevronUp,
    Loader2,
    X
} from 'lucide-react';
import { API_URL } from '../constants';

// Warna untuk chart
const COLORS = {
    primary: '#10b981',  // Emerald green
    secondary: '#3b82f6', // Blue
    positive: '#22c55e',  // Green
    negative: '#ef4444',  // Red
    neutral: '#6b7280',   // Gray
    warning: '#f59e0b',   // Amber
    background: '#f0fdf4' // Light green
};

// Komponen Badge Tren
const TrendBadge = ({ status }) => {
    const config = {
        Increasing: {
            icon: TrendingUp,
            color: 'text-green-600 bg-green-100',
            label: 'Karbon Meningkat'
        },
        Decreasing: {
            icon: TrendingDown,
            color: 'text-red-600 bg-red-100',
            label: 'Karbon Menurun'
        },
        Stable: {
            icon: Minus,
            color: 'text-gray-600 bg-gray-100',
            label: 'Relatif Stabil'
        }
    };

    const { icon: Icon, color, label } = config[status] || config.Stable;

    return (
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold ${color}`}>
            <Icon className="w-5 h-5" />
            <span>{label}</span>
        </div>
    );
};

// Komponen Confidence Meter
const ConfidenceMeter = ({ percent }) => {
    const getColorByPercent = (p) => {
        if (p >= 80) return 'bg-green-500';
        if (p >= 60) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div className="bg-white rounded-lg border p-4">
            <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                    className={`h-3 rounded-full transition-all ${getColorByPercent(percent)}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
};

// Komponen Disclaimer (WAJIB DITAMPILKAN)
const CarbonDisclaimer = ({ disclaimer }) => (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
            <p className="text-sm text-amber-800 font-medium mb-1">Peringatan Penting</p>
            <p className="text-xs text-amber-700">{disclaimer}</p>
        </div>
    </div>
);

// Komponen Tabel Data Tahunan
const YearlyDataTable = ({ data, showCO2e }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-sm">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Tahun</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">
                        {showCO2e ? 'Stok Karbon (tCO₂e)' : 'Stok Karbon (tC)'}
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Hutan (Ha)</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Non-Hutan (Ha)</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {data.map((row) => (
                    <tr key={row.year} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{row.year}</td>
                        <td className="px-3 py-2 text-right font-mono">
                            {(showCO2e ? row.carbon_stock_co2e : row.carbon_stock_tc).toLocaleString('id-ID', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-green-600">
                            {row.area_breakdown?.hutan?.toLocaleString('id-ID', { maximumFractionDigits: 2 }) || '0'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-amber-600">
                            {(
                                (row.area_breakdown?.tanah_kering || 0) +
                                (row.area_breakdown?.tanah_kosong || 0) +
                                (row.area_breakdown?.lahan_terbangun || 0)
                            ).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// Komponen Utama: CarbonDashboard
const CarbonDashboard = ({
    historyId,
    isOpen,
    onClose,
    filename
}) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [carbonData, setCarbonData] = useState(null);
    const [showCO2e, setShowCO2e] = useState(false);
    const [showFactors, setShowFactors] = useState(false);

    // Fetch carbon data when opened
    useEffect(() => {
        if (isOpen && historyId) {
            fetchCarbonData();
        }
    }, [isOpen, historyId]);

    const fetchCarbonData = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.post(`${API_URL}/carbon/analyze`, {
                history_id: historyId
            });
            setCarbonData(response.data);
        } catch (err) {
            console.error('Carbon analysis error:', err);
            setError(err.response?.data?.detail || 'Gagal menganalisis data karbon');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // Prepare chart data
    const chartData = carbonData?.yearly_data?.map(d => ({
        year: d.year,
        karbon: showCO2e ? d.carbon_stock_co2e : d.carbon_stock_tc,
        hutan: d.area_breakdown?.hutan || 0
    })) || [];

    // Calculate yearly changes for bar chart
    const changeData = chartData.map((d, i) => {
        if (i === 0) return { year: d.year, delta: 0 };
        const prev = chartData[i - 1].karbon;
        return {
            year: d.year,
            delta: d.karbon - prev
        };
    }).slice(1); // Remove first year (no change)

    const changeResult = carbonData?.change_result;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Leaf className="w-6 h-6" />
                        <div>
                            <h2 className="text-lg font-semibold">Analisis Perubahan Stok Karbon</h2>
                            <p className="text-sm text-emerald-100 opacity-90">{filename || 'Time-Series Mode'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-lg transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Loading State */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
                            <p className="text-gray-600">Menganalisis data karbon...</p>
                        </div>
                    )}

                    {/* Error State */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                            <p className="font-medium">Gagal Menganalisis</p>
                            <p className="text-sm mt-1">{error}</p>
                        </div>
                    )}

                    {/* Data Display */}
                    {carbonData && !loading && (
                        <>
                            {/* Disclaimer - WAJIB PERTAMA */}
                            <CarbonDisclaimer disclaimer={carbonData.disclaimer} />

                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                {/* Trend Status */}
                                <div className="bg-white/70 backdrop-blur-md border border-white/40 rounded-xl p-4 text-center shadow-sm">
                                    <p className="text-sm text-gray-500 mb-2">Status Tren</p>
                                    <TrendBadge status={changeResult?.trend_status} />
                                </div>

                                {/* Delta Carbon */}
                                <div className="bg-white/70 backdrop-blur-md border border-white/40 rounded-xl p-4 text-center shadow-sm">
                                    <p className="text-sm text-gray-500 mb-1">Perubahan Stok Karbon</p>
                                    <p className={`text-2xl font-bold ${changeResult?.delta_carbon_tc > 0 ? 'text-green-600' :
                                        changeResult?.delta_carbon_tc < 0 ? 'text-red-600' : 'text-gray-600'
                                        }`}>
                                        {changeResult?.delta_carbon_tc > 0 ? '+' : ''}
                                        {(showCO2e ? changeResult?.delta_carbon_co2e : changeResult?.delta_carbon_tc)?.toLocaleString('id-ID', {
                                            maximumFractionDigits: 2
                                        })} {showCO2e ? 'tCO₂e' : 'tC'}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {changeResult?.start_year} → {changeResult?.end_year}
                                    </p>
                                </div>

                                {/* Annual Rate */}
                                <div className="bg-white/70 backdrop-blur-md border border-white/40 rounded-xl p-4 text-center shadow-sm">
                                    <p className="text-sm text-gray-500 mb-1">Laju Perubahan Tahunan</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {(showCO2e ? changeResult?.annual_rate_co2e : changeResult?.annual_rate_tc)?.toLocaleString('id-ID', {
                                            maximumFractionDigits: 2
                                        })}
                                    </p>
                                    <p className="text-xs text-gray-500">{showCO2e ? 'tCO₂e/tahun' : 'tC/tahun'}</p>
                                </div>

                                {/* Confidence Score Card */}
                                <div className="bg-white/70 backdrop-blur-md border border-white/40 rounded-xl p-4 flex flex-col justify-center shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm text-gray-500">Tingkat Keyakinan</p>
                                        <p className="text-sm font-bold text-gray-700">{changeResult?.confidence_percent || 0}%</p>
                                    </div>
                                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-1000 ${(changeResult?.confidence_percent || 0) > 80 ? 'bg-green-500' :
                                                    (changeResult?.confidence_percent || 0) > 60 ? 'bg-yellow-500' : 'bg-red-500'
                                                }`}
                                            style={{ width: `${changeResult?.confidence_percent || 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            {/* Toggle CO2e */}
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={showCO2e}
                                        onChange={(e) => setShowCO2e(e.target.checked)}
                                        className="w-4 h-4 text-emerald-600 rounded"
                                    />
                                    <span className="text-sm text-gray-700">Tampilkan dalam tCO₂e (× 3.67)</span>
                                </label>
                            </div>

                            {/* Time Series Chart */}
                            <div className="bg-white border rounded-lg p-4">
                                <h3 className="text-sm font-medium text-gray-700 mb-4">
                                    Grafik Stok Karbon Time-Series
                                </h3>
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                                        <YAxis
                                            tick={{ fontSize: 12 }}
                                            tickFormatter={(v) => v.toLocaleString()}
                                        />
                                        <Tooltip
                                            formatter={(value) => [
                                                `${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${showCO2e ? 'tCO₂e' : 'tC'}`,
                                                'Stok Karbon'
                                            ]}
                                        />
                                        <Legend />
                                        <Line
                                            type="monotone"
                                            dataKey="karbon"
                                            name={`Stok Karbon (${showCO2e ? 'tCO₂e' : 'tC'})`}
                                            stroke={COLORS.primary}
                                            strokeWidth={3}
                                            dot={{ fill: COLORS.primary, r: 5 }}
                                            activeDot={{ r: 8 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Change Bar Chart */}
                            {changeData.length > 0 && (
                                <div className="bg-white border rounded-lg p-4">
                                    <h3 className="text-sm font-medium text-gray-700 mb-4">
                                        Perubahan Karbon per Tahun (Δ)
                                    </h3>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={changeData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                                            <YAxis tick={{ fontSize: 12 }} />
                                            <Tooltip
                                                formatter={(value) => [
                                                    `${value > 0 ? '+' : ''}${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${showCO2e ? 'tCO₂e' : 'tC'}`,
                                                    'Perubahan'
                                                ]}
                                            />
                                            <ReferenceLine y={0} stroke="#9ca3af" />
                                            <Bar dataKey="delta" name="Perubahan">
                                                {changeData.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={entry.delta >= 0 ? COLORS.positive : COLORS.negative}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}



                            {/* Carbon Factors Info */}
                            <div className="bg-gray-50 border rounded-lg p-4">
                                <button
                                    onClick={() => setShowFactors(!showFactors)}
                                    className="flex items-center gap-2 text-sm font-medium text-gray-700 w-full"
                                >
                                    <Info className="w-4 h-4" />
                                    <span>Faktor Karbon yang Digunakan</span>
                                    {showFactors ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                                {showFactors && carbonData.carbon_factors_used && (
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        {Object.entries(carbonData.carbon_factors_used).map(([key, value]) => (
                                            <div key={key} className="flex justify-between bg-white p-2 rounded">
                                                <span className="text-gray-600">{key}</span>
                                                <span className="font-mono font-medium">{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Yearly Data Table */}
                            <div className="bg-white border rounded-lg p-4">
                                <h3 className="text-sm font-medium text-gray-700 mb-4">
                                    Data Stok Karbon per Tahun
                                </h3>
                                <YearlyDataTable data={carbonData.yearly_data} showCO2e={showCO2e} />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-3 border-t text-xs text-gray-500 text-center">
                    Mode Karbon Time-Series • Indikatif • Non-Regulatory • Non-Certified
                </div>
            </div>
        </div>
    );
};

export default CarbonDashboard;
