import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Database, Search, X, Check, AlertCircle, MapPin, FileText, Building2, ArrowRight, Loader2 } from 'lucide-react';
import { API_URL } from '../constants';

/**
 * KPS Detection Dialog - Enhanced with Autocomplete
 * 
 * Shows when SHP file is uploaded to:
 * 1. Confirm auto-detected KPS (from NO_SK metadata)
 * 2. Allow manual KPS search with live autocomplete
 * 3. "Lanjutkan sebagai KPS" - Select KPS and proceed
 * 4. "Lanjutkan sebagai Non-KPS" - Skip KPS linkage
 */
const KpsDetectionDialog = ({
    show,
    detectedKps,
    extractedNoSk,
    onConfirm,
    onSkip,
    onClose
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showManualSearch, setShowManualSearch] = useState(!detectedKps);
    const [selectedKps, setSelectedKps] = useState(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchTimeoutRef = useRef(null);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);

    // Reset state when dialog opens/closes
    useEffect(() => {
        if (show) {
            setShowManualSearch(!detectedKps);
            setSearchQuery('');
            setSearchResults([]);
            setSelectedKps(null);
            setShowDropdown(false);
        }
    }, [show, detectedKps]);

    // Handle clicks outside dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
                inputRef.current && !inputRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Live autocomplete search with debounce
    const performSearch = useCallback(async (query) => {
        if (!query || query.length < 2) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }
        setIsSearching(true);
        try {
            const res = await axios.get(`${API_URL}/api/kps/search?query=${encodeURIComponent(query)}&limit=10`);
            setSearchResults(res.data.results || []);
            setShowDropdown(true);
        } catch (e) {
            console.error('KPS Search error:', e);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, []);

    // Debounced search on input change
    const handleSearchInput = (e) => {
        const value = e.target.value;
        setSearchQuery(value);
        setSelectedKps(null); // Clear selection when typing

        // Clear previous timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Set new debounced search
        searchTimeoutRef.current = setTimeout(() => {
            performSearch(value);
        }, 300);
    };

    const handleConfirmDetected = () => {
        if (detectedKps) {
            onConfirm(detectedKps, 'NO_SK_METADATA');
        }
    };

    const handleSelectFromSearch = (kps) => {
        setSelectedKps(kps);
        setSearchQuery(kps.nama_kps); // Show selected name in input
        setShowDropdown(false);
    };

    const handleConfirmSelected = () => {
        if (selectedKps) {
            onConfirm(selectedKps, 'MANUAL');
        }
    };

    const handleSkip = () => {
        onSkip();
    };

    // Highlight matching text in search results
    const highlightMatch = (text, query) => {
        if (!query || query.length < 2) return text;
        const parts = text.split(new RegExp(`(${query})`, 'gi'));
        return parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase()
                ? <mark key={i} className="bg-emerald-200 text-emerald-900 rounded px-0.5">{part}</mark>
                : part
        );
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg">
                            <Database className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">
                                {detectedKps && !showManualSearch ? 'KPS Terdeteksi' : 'Identifikasi KPS'}
                            </h3>
                            <p className="text-emerald-100 text-sm">
                                {detectedKps && !showManualSearch
                                    ? 'Konfirmasi atau cari yang lain'
                                    : 'Pilih KPS atau lanjutkan tanpa KPS'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white p-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    {/* Extracted NO_SK info */}
                    {extractedNoSk && (
                        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
                            <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm text-blue-800 font-medium">NO_SK dari Metadata SHP:</p>
                                <p className="text-blue-900 font-mono text-sm">{extractedNoSk}</p>
                            </div>
                        </div>
                    )}

                    {/* Auto-detected KPS Confirmation */}
                    {detectedKps && !showManualSearch ? (
                        <div className="space-y-4">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                                <div className="flex items-start gap-3">
                                    <div className="bg-emerald-100 p-2 rounded-lg">
                                        <MapPin className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-emerald-800 text-lg">{detectedKps.nama_kps}</p>
                                        <div className="mt-2 space-y-1">
                                            <p className="text-sm text-emerald-700 flex items-center gap-2">
                                                <FileText className="w-4 h-4" />
                                                {detectedKps.no_sk}
                                            </p>
                                            <p className="text-sm text-gray-600 flex items-center gap-2">
                                                <Building2 className="w-4 h-4" />
                                                {detectedKps.kps_type}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {detectedKps.nama_kab}, {detectedKps.nama_prov}
                                            </p>
                                            {detectedKps.luas_sk_ha && (
                                                <p className="text-sm text-gray-500">
                                                    Luas SK: {Number(detectedKps.luas_sk_ha).toLocaleString('id-ID')} Ha
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleConfirmDetected}
                                    className="flex-1 bg-emerald-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Check className="w-5 h-5" />
                                    Lanjutkan sebagai KPS
                                </button>
                                <button
                                    onClick={() => setShowManualSearch(true)}
                                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Search className="w-5 h-5" />
                                    Cari Lain
                                </button>
                            </div>

                            <button
                                onClick={handleSkip}
                                className="w-full bg-amber-50 text-amber-700 py-2.5 px-4 rounded-xl font-medium hover:bg-amber-100 transition-colors text-sm border border-amber-200"
                            >
                                Lanjutkan sebagai Non-KPS
                            </button>
                        </div>
                    ) : (
                        /* Manual Search Mode */
                        <div className="space-y-4">
                            {!detectedKps && !extractedNoSk && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm text-amber-800">
                                        Tidak ada field <code className="bg-amber-100 px-1 rounded">NO_SK</code> di metadata SHP.
                                        Cari KPS atau lanjutkan sebagai Non-KPS.
                                    </p>
                                </div>
                            )}

                            {!detectedKps && extractedNoSk && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm text-amber-800">
                                        NO_SK <code className="bg-amber-100 px-1 rounded">{extractedNoSk}</code> tidak ditemukan di database.
                                        Cari KPS atau lanjutkan sebagai Non-KPS.
                                    </p>
                                </div>
                            )}

                            {/* Selected KPS Preview */}
                            {selectedKps && (
                                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="bg-emerald-100 p-2 rounded-lg">
                                            <Check className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-emerald-800">{selectedKps.nama_kps}</p>
                                            <p className="text-sm text-emerald-700">{selectedKps.no_sk}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {selectedKps.kps_type} • {selectedKps.kab_kota}, {selectedKps.provinsi}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setSelectedKps(null);
                                                setSearchQuery('');
                                            }}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Autocomplete Search Input */}
                            <div className="relative">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        placeholder="Ketik Nama KPS atau NO SK..."
                                        value={searchQuery}
                                        onChange={handleSearchInput}
                                        onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                                        className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                                    />
                                    {isSearching && (
                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500 animate-spin" />
                                    )}
                                </div>

                                {/* Autocomplete Dropdown */}
                                {showDropdown && searchResults.length > 0 && (
                                    <div
                                        ref={dropdownRef}
                                        className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto"
                                    >
                                        {searchResults.map(kps => (
                                            <div
                                                key={kps.id_kps_api}
                                                onClick={() => handleSelectFromSearch(kps)}
                                                className="p-3 hover:bg-emerald-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                                            >
                                                <p className="font-medium text-gray-900">
                                                    {highlightMatch(kps.nama_kps, searchQuery)}
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    {highlightMatch(kps.no_sk, searchQuery)} • {kps.kps_type}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {kps.nama_kab}, {kps.nama_prov}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* No Results Message */}
                                {showDropdown && searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl p-4">
                                        <p className="text-center text-gray-500 text-sm">
                                            Tidak ada hasil untuk "{searchQuery}"
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-3 pt-2">
                                {selectedKps ? (
                                    <button
                                        onClick={handleConfirmSelected}
                                        className="w-full bg-emerald-600 text-white py-3.5 px-4 rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                                    >
                                        <ArrowRight className="w-5 h-5" />
                                        Lanjutkan sebagai KPS
                                    </button>
                                ) : (
                                    <button
                                        disabled
                                        className="w-full bg-gray-200 text-gray-400 py-3.5 px-4 rounded-xl font-bold cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <Search className="w-5 h-5" />
                                        Pilih KPS untuk Melanjutkan
                                    </button>
                                )}

                                <button
                                    onClick={handleSkip}
                                    className="w-full bg-amber-50 text-amber-700 py-3 px-4 rounded-xl font-medium hover:bg-amber-100 transition-colors border border-amber-200"
                                >
                                    Lanjutkan sebagai Non-KPS
                                </button>

                                {detectedKps && (
                                    <button
                                        onClick={() => setShowManualSearch(false)}
                                        className="w-full px-4 py-2 text-emerald-600 hover:bg-emerald-50 rounded-xl font-medium transition-colors text-sm"
                                    >
                                        ← Kembali ke KPS Terdeteksi
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default KpsDetectionDialog;
