import React from 'react';
import { Sliders, Cloud, Lock } from 'lucide-react';

const CalibrationPanel = ({
    show
    // cloudProbThreshold removed - now uses FIXED 50% per methodology
}) => {
    if (!show) return null;

    // FIXED cloud probability threshold per methodology
    const FIXED_CLOUD_THRESHOLD = 50;

    return (
        <div className="flex flex-col mb-4 mt-2">
            {/* Header */}
            <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
                <div className="p-1.5 bg-emerald-100 rounded-lg">
                    <Sliders size={14} className="text-emerald-600" />
                </div>
                <div className="flex flex-col">
                    <h2 className="font-black text-[9px] tracking-tight leading-none uppercase text-slate-700">Konfigurasi Model</h2>
                    <span className="text-[7px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Multi-Year RF Parameters</span>
                </div>
            </div>

            <div className="px-3 py-3 space-y-4">
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Cloud size={12} className="text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-500">Cloud Probability</span>
                        </div>
                        <div className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md shadow-sm flex items-center gap-1">
                            <Lock size={10} className="text-emerald-600" />
                            <span className="font-mono text-[11px] font-black text-emerald-700">{FIXED_CLOUD_THRESHOLD}%</span>
                        </div>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-tight">
                        Threshold tetap 50% sesuai metodologi Multi-Year RF untuk konsistensi antar tahun dan analisis.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default CalibrationPanel;
