import React, { useState } from 'react';
import axios from 'axios';
import { Download, Loader, AlertCircle, CheckCircle2 } from 'lucide-react';
import KpsDetectionDialog from './KpsDetectionDialog';
import { API_URL } from '../constants';

const BulkReportDialog = ({ validationResults, bulkFileItems, onClose, onSuccess, onError }) => {
    const [editingIdx, setEditingIdx] = useState(null);
    const [showKpsSearch, setShowKpsSearch] = useState(false);
    const [saving, setSaving] = useState(false);
    const [localResults, setLocalResults] = useState(validationResults);

    const handleKpsConfirm = (kpsData) => {
        if (editingIdx !== null) {
            const updated = [...localResults];
            updated[editingIdx] = {
                ...updated[editingIdx],
                kps_id: kpsData.id_kps_api,
                kps_name: kpsData.nama_kps,
                kps_no_sk: kpsData.no_sk,
                status: 'valid'
            };
            setLocalResults(updated);
            setEditingIdx(null);
            setShowKpsSearch(false);
        }
    };

    const downloadReport = () => {
        const headers = ['Filename', 'NO_SK', 'Status', 'KPS Name', 'KPS NO_SK'];
        const rows = localResults.map(r => [
            r.filename,
            r.no_sk || '-',
            r.status,
            r.kps_name || '-',
            r.kps_no_sk || '-'
        ]);

        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bulk-report-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleProceed = async () => {
        try {
            setSaving(true);

            // Prepare bulk save items from validation results and file items
            const bulkSaveItems = localResults.map((result, idx) => {
                const fileItem = bulkFileItems[idx];
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
            });

            // Note: This is just saving geometry. Full analysis happens in normal flow.
            // For now, we're storing the validated geometries and metadata.

            console.log('Proceeding with bulk save of', bulkSaveItems.length, 'items');

            // For MVP, we'll just close and show that they need to proceed with normal analysis
            onSuccess(localResults, bulkFileItems);

        } catch (error) {
            console.error('Proceed error:', error);
            onError(error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                <h2 className="text-2xl font-bold mb-6">Bulk Upload Report</h2>

                {/* Stats */}
                <div className="grid grid-cols-5 gap-3 mb-6">
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
                                    <td className="px-4 py-3 font-mono text-xs">{result.filename}</td>
                                    <td className="px-4 py-3 text-xs">{result.no_sk || '-'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
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
                                        {result.status === 'needs_manual' && (
                                            <button
                                                onClick={() => {
                                                    setEditingIdx(idx);
                                                    setShowKpsSearch(true);
                                                }}
                                                className="text-blue-500 hover:text-blue-700 font-medium"
                                            >
                                                Search KPS
                                            </button>
                                        )}
                                        {result.error && (
                                            <span className="text-red-500" title={result.error}>
                                                View Error
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 justify-between mt-6">
                    <button
                        onClick={downloadReport}
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        <Download className="w-4 h-4" />
                        Download Report
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleProceed}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                        >
                            {saving && <Loader className="w-4 h-4 animate-spin" />}
                            Proceed to Analysis
                        </button>
                    </div>
                </div>

                {/* KPS Search Modal */}
                {showKpsSearch && (
                    <KpsDetectionDialog
                        initialNoSk={localResults[editingIdx]?.no_sk}
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
                        onCancel={() => setShowKpsSearch(false)}
                    />
                )}
            </div>
        </div>
    );
};

export default BulkReportDialog;
