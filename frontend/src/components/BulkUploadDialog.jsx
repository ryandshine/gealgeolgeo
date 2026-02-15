import React, { useState } from 'react';
import axios from 'axios';
import shp from 'shpjs';
import JSZip from 'jszip';
import { Upload, Loader, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { API_URL } from '../constants';
import '../utils/geoUtils'; // Register Proj4 definitions

const BulkUploadDialog = ({ onClose, onValidationComplete, onError }) => {
    const [files, setFiles] = useState([]);
    const [validationResults, setValidationResults] = useState(null);
    const [bulkFileItems, setBulkFileItems] = useState(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
    const [dragActive, setDragActive] = useState(false);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files);
        }
    };

    const handleFileSelect = async (fileList) => {
        const zipFile = Array.from(fileList).find(f => f.name.toLowerCase().endsWith('.zip'));
        if (!zipFile) {
            onError('Please select a ZIP file');
            return;
        }

        try {
            setLoading(true);
            setProgress({ current: 0, total: 0, message: 'Extracting ZIP file...' });

            // Extract ZIP
            const zip = new JSZip();
            const contents = await zip.loadAsync(zipFile);

            // Find all SHP files in ZIP
            const shpFiles = {};
            const shpFileNames = new Set();

            for (const [path, file] of Object.entries(contents.files)) {
                if (file.dir) continue;
                const ext = path.toLowerCase().split('.').pop();
                const basename = path.toLowerCase().split('.')[0];

                if (['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(ext)) {
                    if (!shpFiles[basename]) shpFiles[basename] = {};
                    shpFiles[basename][ext] = file;
                    shpFileNames.add(basename);
                }
            }

            const fileCount = shpFileNames.size;
            if (fileCount === 0) {
                onError('No SHP files found in ZIP');
                return;
            }

            setProgress({ current: 0, total: fileCount, message: `Found ${fileCount} SHP file(s)` });

            // Parse each SHP file
            const bulkFileItems = [];
            const shpFileArray = Array.from(shpFileNames).sort();

            for (let idx = 0; idx < shpFileArray.length; idx++) {
                const basename = shpFileArray[idx];
                const fileGroup = shpFiles[basename];
                if (!fileGroup['shp']) continue;

                setProgress({
                    current: idx + 1,
                    total: fileCount,
                    message: `Parsing ${basename}...`
                });

                try {
                    // Create ZIP blob for this SHP
                    const shpZip = new JSZip();
                    for (const [ext, fileObj] of Object.entries(fileGroup)) {
                        const data = await fileObj.async('arraybuffer');
                        shpZip.file(`${basename}.${ext}`, data);
                    }

                    const shpBlob = await shpZip.generateAsync({ type: 'blob' });
                    const arrayBuffer = await shpBlob.arrayBuffer();

                    // Parse SHP to GeoJSON
                    const geoJson = await shp(arrayBuffer);

                    if (!geoJson || (!geoJson.features && !Array.isArray(geoJson))) {
                        console.warn(`Skipping ${basename}: shp() returned invalid data`);
                        continue;
                    }

                    // Handle case where shp() returns array of FeatureCollections
                    const features = Array.isArray(geoJson)
                        ? geoJson.flatMap(fc => fc?.features || [])
                        : (geoJson.features || []);

                    // Extract NO_SK from properties
                    let noSk = null;
                    if (features.length > 0) {
                        const props = features[0].properties || {};
                        const priorityFields = ['NO_SK', 'NO_KPS', 'NOSK', 'NOSK_KPS', 'SK_NUMBER'];

                        for (const field of priorityFields) {
                            for (const key of Object.keys(props)) {
                                if (key.toUpperCase() === field && props[key]) {
                                    noSk = String(props[key]).trim();
                                    break;
                                }
                            }
                            if (noSk) break;
                        }

                        if (!noSk) {
                            for (const key of Object.keys(props)) {
                                const upperKey = key.toUpperCase();
                                if ((upperKey.includes('SK') || (upperKey.includes('NO') && upperKey.includes('KPS'))) && props[key]) {
                                    noSk = String(props[key]).trim();
                                    break;
                                }
                            }
                        }
                    }

                    // Create feature collection with combined geometry
                    const featureCollection = {
                        type: 'FeatureCollection',
                        features: features
                    };

                    bulkFileItems.push({
                        filename: `${basename}.shp`,
                        geo_data: featureCollection,
                        no_sk: noSk
                    });

                } catch (e) {
                    console.error(`Error parsing ${basename}:`, e);
                }
            }

            if (bulkFileItems.length === 0) {
                onError('Failed to parse SHP files');
                return;
            }

            // Call bulk validation API
            setProgress({
                current: fileCount,
                total: fileCount,
                message: 'Validating files...'
            });

            const response = await axios.post(`${API_URL}/api/bulk/validate`, {
                files: bulkFileItems
            });

            setValidationResults(response.data);
            setBulkFileItems(bulkFileItems);
            onValidationComplete(response.data, bulkFileItems);

        } catch (error) {
            console.error('Bulk upload error:', error);
            onError(error.response?.data?.detail || error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4">
                <h2 className="text-2xl font-bold mb-6">Bulk SHP Upload</h2>

                {!validationResults ? (
                    <>
                        {/* File Upload Area */}
                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
                                dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                            } ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            <Upload className="mx-auto mb-4 w-12 h-12 text-gray-400" />
                            <p className="text-lg font-semibold mb-2">Drop ZIP file here or click to select</p>
                            <p className="text-sm text-gray-500 mb-4">Select a ZIP file containing multiple SHP files</p>
                            <input
                                type="file"
                                accept=".zip"
                                onChange={(e) => handleFileSelect(e.target.files)}
                                className="hidden"
                                id="bulk-file-input"
                                disabled={loading}
                            />
                            <label
                                htmlFor="bulk-file-input"
                                className="inline-block px-6 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 disabled:opacity-50"
                            >
                                Select ZIP File
                            </label>
                        </div>

                        {/* Progress */}
                        {loading && (
                            <div className="mt-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <Loader className="w-4 h-4 animate-spin text-blue-500" />
                                    <span className="text-sm font-medium">{progress.message}</span>
                                </div>
                                {progress.total > 0 && (
                                    <>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div
                                                className="bg-blue-500 h-2 rounded-full transition-all"
                                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {progress.current} / {progress.total}
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* Validation Summary */}
                        <div className="space-y-3 max-h-96 overflow-y-auto mb-6">
                            {validationResults.map((result, idx) => (
                                <div key={idx} className="border rounded-lg p-3 flex items-start gap-3">
                                    {result.status === 'valid' ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                                    )}
                                    <div className="flex-1">
                                        <p className="font-semibold text-sm">{result.filename}</p>
                                        <p className="text-xs text-gray-600">NO_SK: {result.no_sk || 'Not found'}</p>
                                        {result.status === 'valid' && result.kps_name && (
                                            <p className="text-xs text-green-600">✅ {result.kps_name}</p>
                                        )}
                                        {result.status === 'needs_manual' && (
                                            <p className="text-xs text-yellow-600">⚠️ Needs manual KPS search</p>
                                        )}
                                        {result.status === 'non_kps' && (
                                            <p className="text-xs text-blue-600">ℹ️ Will be processed as Non-KPS</p>
                                        )}
                                        {result.error && (
                                            <p className="text-xs text-red-600">❌ {result.error}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-4 gap-2 mb-6">
                            <div className="bg-gray-50 rounded p-2 text-center">
                                <p className="text-xs text-gray-600">Total</p>
                                <p className="text-lg font-bold">{validationResults.length}</p>
                            </div>
                            <div className="bg-green-50 rounded p-2 text-center">
                                <p className="text-xs text-gray-600">Valid</p>
                                <p className="text-lg font-bold text-green-600">
                                    {validationResults.filter(r => r.status === 'valid').length}
                                </p>
                            </div>
                            <div className="bg-yellow-50 rounded p-2 text-center">
                                <p className="text-xs text-gray-600">Manual</p>
                                <p className="text-lg font-bold text-yellow-600">
                                    {validationResults.filter(r => r.status === 'needs_manual').length}
                                </p>
                            </div>
                            <div className="bg-blue-50 rounded p-2 text-center">
                                <p className="text-xs text-gray-600">Non-KPS</p>
                                <p className="text-lg font-bold text-blue-600">
                                    {validationResults.filter(r => r.status === 'non_kps').length}
                                </p>
                            </div>
                        </div>
                    </>
                )}

                {/* Buttons */}
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    {validationResults && (
                        <button
                            onClick={() => onValidationComplete(validationResults, bulkFileItems)}
                            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                        >
                            Next
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkUploadDialog;
