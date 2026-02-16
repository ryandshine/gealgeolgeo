import React, { useState } from 'react';
import axios from 'axios';
import { Download, Loader, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import KpsDetectionDialog from './KpsDetectionDialog';
import { API_URL } from '../constants';

const BulkReportDialog = ({ validationResults, bulkFileItems, onClose, onSuccess, onError }) => {
    const [editingIdx, setEditingIdx] = useState(null);
    const [showKpsSearch, setShowKpsSearch] = useState(false);
    const [saving, setSaving] = useState(false);
    const [localResults, setLocalResults] = useState(validationResults);
    const [localFileItems, setLocalFileItems] = useState(bulkFileItems || []);

    const handleKpsConfirm = (kpsData, linkMethod) => {
        if (editingIdx !== null) {
            const updated = [...localResults];
            updated[editingIdx] = {
                ...updated[editingIdx],
                kps_id: kpsData.id_kps_api,
                kps_name: kpsData.nama_kps,
                kps_no_sk: kpsData.no_sk,
                status: 'valid',
                link_method: linkMethod
            };
            setLocalResults(updated);
            setEditingIdx(null);
            setShowKpsSearch(false);
        }
    };

    const downloadReport = async () => {
        try {
            const payloadRows = localResults.map((r) => ({
                filename: r.filename,
                no_sk: r.no_sk || null,
                status: r.status || '',
                kps_name: r.kps_name || null,
                kps_no_sk: r.kps_no_sk || null,
                link_method: r.link_method || null,
                error: r.error || null
            }));

            const response = await axios.post(
                `${API_URL}/api/bulk/report/excel`,
                { rows: payloadRows },
                { responseType: 'blob' }
            );

            const blob = new Blob(
                [response.data],
                { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            let filename = 'Bulk_Upload_Report.xlsx';
            const contentDisposition = response.headers?.['content-disposition'] || response.headers?.['Content-Disposition'];
            if (contentDisposition) {
                const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
                const basicMatch = contentDisposition.match(/filename=(?:\"([^\"]+)\"|([^;]+))/i);
                const rawName = utf8Match?.[1] || basicMatch?.[1] || basicMatch?.[2];
                if (rawName) {
                    filename = decodeURIComponent(rawName.trim().replace(/^["']|["']$/g, ''));
                }
            }
            filename = filename.replace(/[\\/:*?"<>|]/g, '_').replace(/\.xlsx_+$/i, '.xlsx');
            if (!/\.xlsx$/i.test(filename)) filename = `${filename}.xlsx`;

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Bulk report download error:', error);
            alert('Gagal mengunduh report Excel. Coba lagi.');
        }
    };

    const handleProceed = async () => {
        try {
            setSaving(true);

            // Prepare bulk save items from validation results and file items
            if (!localFileItems || localFileItems.length !== localResults.length) {
                throw new Error(`Data mismatch: ${localResults.length} results vs ${localFileItems?.length ?? 0} file items`);
            }
            if (localResults.length === 0) {
                throw new Error('Daftar analisis kosong. Tambahkan SHP terlebih dahulu.');
            }
            const bulkSaveItems = localResults.map((result, idx) => {
                const fileItem = localFileItems[idx];
                if (!fileItem || !fileItem.geo_data) {
                    console.warn(`Skipping item ${idx} (${result.filename}): missing geo_data`);
                    return null;
                }
                return {
                    filename: result.filename,
                    file_size: 0,
                    metadata: {
                        no_sk: result.no_sk,
                        link_method: result.status === 'valid' ? 'AUTO_DETECTED' : 'MANUAL',
                        validation_status: result.status
                    },
                    analysis_results: [],
                    geo_data: fileItem.geo_data,
                    mode: 'replace',
                    kps_id: result.kps_id,
                    link_method: result.status === 'valid' ? 'AUTO_DETECTED' : (result.status === 'needs_manual' ? 'MANUAL' : 'NONE'),
                    analysis_scope: result.kps_id ? 'KPS' : 'NON_KPS'
                };
            }).filter(Boolean);

            // Note: This is just saving geometry. Full analysis happens in normal flow.
            // For now, we're storing the validated geometries and metadata.

            console.log('Proceeding with bulk save of', bulkSaveItems.length, 'items');

            // For MVP, we'll just close and show that they need to proceed with normal analysis
            onSuccess(localResults, localFileItems);

        } catch (error) {
            console.error('Proceed error:', error);
            onError(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRow = (idx) => {
        const target = localResults[idx];
        if (!target) return;
        const ok = window.confirm(`Hapus "${target.filename}" dari daftar analisis?`);
        if (!ok) return;

        setLocalResults((prev) => prev.filter((_, i) => i !== idx));
        setLocalFileItems((prev) => prev.filter((_, i) => i !== idx));

        if (editingIdx === idx) {
            setEditingIdx(null);
            setShowKpsSearch(false);
        } else if (editingIdx !== null && idx < editingIdx) {
            setEditingIdx((prev) => (prev === null ? null : prev - 1));
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-3 md:p-4">
            <div className="bg-white rounded-lg shadow-xl p-4 md:p-8 max-w-[96vw] md:max-w-6xl w-full mx-auto max-h-[92vh] md:max-h-[90vh] overflow-hidden flex flex-col">
                <h2 className="text-lg md:text-2xl font-bold mb-4 md:mb-6">Bulk Upload Report</h2>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-4 md:mb-6">
                    <div className="bg-gray-50 rounded p-3 text-center">
                        <p className="text-xs text-gray-600">Total Files</p>
                        <p className="text-2xl font-bold">{localResults.length}</p>
                    </div>
                    <div className="bg-green-50 rounded p-3 text-center">
                        <p className="text-xs text-gray-600">Valid (Auto)</p>
                        <p className="text-2xl font-bold text-green-600">
                            {localResults.filter(r => r.status === 'valid').length}
                        </p>
                    </div>
                    <div className="bg-yellow-50 rounded p-3 text-center">
                        <p className="text-xs text-gray-600">Needs Manual</p>
                        <p className="text-2xl font-bold text-yellow-600">
                            {localResults.filter(r => r.status === 'needs_manual').length}
                        </p>
                    </div>
                    <div className="bg-blue-50 rounded p-3 text-center">
                        <p className="text-xs text-gray-600">Non-KPS</p>
                        <p className="text-2xl font-bold text-blue-600">
                            {localResults.filter(r => r.status === 'non_kps').length}
                        </p>
                    </div>
                    <div className="bg-red-50 rounded p-3 text-center">
                        <p className="text-xs text-gray-600">Errors</p>
                        <p className="text-2xl font-bold text-red-600">
                            {localResults.filter(r => r.status === 'error').length}
                        </p>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto flex-1 border rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b sticky top-0">
                            <tr>
                                <th className="text-left px-4 py-3 font-semibold">Filename</th>
                                <th className="text-left px-4 py-3 font-semibold">NO_SK</th>
                                <th className="text-left px-4 py-3 font-semibold">Status</th>
                                <th className="text-left px-4 py-3 font-semibold">KPS Name</th>
                                <th className="text-left px-4 py-3 font-semibold">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {localResults.map((result, idx) => (
                                <tr key={idx} className="border-b hover:bg-gray-50">
                                    <td className="px-4 py-3 font-mono text-xs break-all">{result.filename}</td>
                                    <td className="px-4 py-3 text-xs">{result.no_sk || '-'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {result.status === 'valid' && (
                                                <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                                                    <CheckCircle2 className="w-4 h-4" /> Valid
                                                </span>
                                            )}
                                            {result.status === 'needs_manual' && (
                                                <span className="flex items-center gap-1 text-yellow-600 text-xs font-medium">
                                                    <AlertCircle className="w-4 h-4" /> Manual
                                                </span>
                                            )}
                                            {result.status === 'non_kps' && (
                                                <span className="text-blue-600 text-xs font-medium">ℹ️ Non-KPS</span>
                                            )}
                                            {result.status === 'error' && (
                                                <span className="text-red-600 text-xs font-medium">❌ Error</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        {result.kps_name ? (
                                            <div>
                                                <p className="font-semibold">{result.kps_name}</p>
                                                <p className="text-gray-500">{result.kps_no_sk}</p>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        <div className="flex items-center gap-2">
                                            {result.status === 'needs_manual' && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setEditingIdx(idx);
                                                        setShowKpsSearch(true);
                                                    }}
                                                    className="px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium rounded transition-colors cursor-pointer pointer-events-auto"
                                                    aria-label={`Search KPS for ${result.filename}`}
                                                >
                                                    Search KPS
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleDeleteRow(idx);
                                                }}
                                                className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 font-medium rounded transition-colors"
                                                aria-label={`Delete ${result.filename}`}
                                                title="Hapus dari daftar analisis"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Delete
                                            </button>
                                            {result.error && (
                                                <span className="text-red-500" title={result.error}>
                                                    View Error
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Buttons */}
                <div className="flex flex-col gap-3 md:flex-row md:justify-between mt-4 md:mt-6">
                    <button
                        onClick={downloadReport}
                        className="flex items-center justify-center md:justify-start gap-2 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 w-full md:w-auto"
                    >
                        <Download className="w-4 h-4" />
                        Download Report
                    </button>
                    <div className="flex flex-col-reverse md:flex-row gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 w-full md:w-auto"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleProceed}
                            disabled={saving || localResults.length === 0}
                            className="flex items-center justify-center gap-2 px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 w-full md:w-auto"
                        >
                            {saving && <Loader className="w-4 h-4 animate-spin" />}
                            Proceed to Analysis
                        </button>
                    </div>
                </div>

                {/* KPS Search Modal */}
                {showKpsSearch && (
                    <KpsDetectionDialog
                        show={showKpsSearch}
                        detectedKps={null}
                        extractedNoSk={localResults[editingIdx]?.no_sk}
                        onConfirm={handleKpsConfirm}
                        onSkip={() => {
                            if (editingIdx !== null) {
                                const updated = [...localResults];
                                updated[editingIdx] = {
                                    ...updated[editingIdx],
                                    status: 'non_kps',
                                    kps_id: null,
                                    kps_name: null
                                };
                                setLocalResults(updated);
                                setEditingIdx(null);
                            }
                            setShowKpsSearch(false);
                        }}
                        onClose={() => setShowKpsSearch(false)}
                    />
                )}
            </div>
        </div>
    );
};

export default BulkReportDialog;
