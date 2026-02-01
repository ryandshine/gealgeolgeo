import React, { useState, useEffect } from 'react';
import { AlertTriangle, Calendar, FileText, RefreshCw, Plus, X, Database, MapPin, Clock } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * DuplicateDialog - Dialog for handling duplicate SHP detection
 * Shows when uploaded SHP already exists in database.
 * Offers options to Update (merge new years) or Replace (delete old, save new)
 */
const DuplicateDialog = ({
    show,
    duplicateInfo,
    allYears = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    onUpdate,      // Called with missing years when user chooses Update
    onReplace,     // Called when user chooses Replace
    onCancel       // Called when user cancels
}) => {
    if (!show || !duplicateInfo) return null;

    const existingYears = duplicateInfo.existing_years || [];
    const missingYears = allYears.filter(y => !existingYears.includes(y));
    const hasAnalysis = duplicateInfo.has_analysis !== false;

    // Format date
    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">
                                SHP Sudah Ada di Database
                            </h3>
                            <p className="text-amber-100 text-sm">
                                Pilih aksi untuk melanjutkan
                            </p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="text-white/80 hover:text-white p-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Existing Info Card */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <div className="bg-amber-100 p-2 rounded-lg">
                                <Database className="w-5 h-5 text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-amber-800 truncate">
                                    {duplicateInfo.existing_filename || 'File Sebelumnya'}
                                </p>

                                {/* KPS Info */}
                                {duplicateInfo.kps_info && (
                                    <p className="text-sm text-amber-700 mt-1 flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        {duplicateInfo.kps_info.nama_kps}
                                    </p>
                                )}

                                {/* Date */}
                                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Dianalisis: {formatDate(duplicateInfo.created_at)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Existing Years */}
                    {hasAnalysis && existingYears.length > 0 && (
                        <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">
                                Tahun yang sudah dianalisis:
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {existingYears.map(year => (
                                    <span
                                        key={year}
                                        className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium"
                                    >
                                        {year}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Missing Years */}
                    {missingYears.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
                                <Plus className="w-4 h-4" />
                                Tahun yang belum dianalisis:
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {missingYears.map(year => (
                                    <span
                                        key={year}
                                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                                    >
                                        {year}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* No missing years message */}
                    {missingYears.length === 0 && hasAnalysis && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                            <p className="text-sm text-gray-600">
                                ✓ Semua tahun sudah dianalisis
                            </p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-6 pb-6 space-y-3">
                    {/* Update Button - Only show if there are missing years */}
                    {missingYears.length > 0 && (
                        <button
                            onClick={() => onUpdate(missingYears)}
                            className="w-full bg-emerald-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                        >
                            <Plus className="w-5 h-5" />
                            Update - Analisis Tahun Baru Saja
                            <span className="bg-white/20 px-2 py-0.5 rounded text-sm">
                                {missingYears.length} tahun
                            </span>
                        </button>
                    )}

                    {/* Replace Button */}
                    <button
                        onClick={onReplace}
                        className="w-full bg-red-500 text-white py-3 px-4 rounded-xl font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                    >
                        <RefreshCw className="w-5 h-5" />
                        Replace - Hapus & Analisis Ulang Semua
                    </button>

                    {/* Cancel Button */}
                    <button
                        onClick={onCancel}
                        className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                    >
                        Batal
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DuplicateDialog;
