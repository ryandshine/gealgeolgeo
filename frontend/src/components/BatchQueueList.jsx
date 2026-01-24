import React, { useMemo } from 'react';
import { CheckCircle, Clock, Loader2, AlertCircle, Play, X, Trash2, Minus, Plus, SkipForward } from 'lucide-react';
import { MAX_BATCH_SIZE } from '../constants';

const BatchQueueList = ({ queue, currentJobId, isRunning, onStart, onCancel, onClear, onRemove }) => {
    const [isMinimized, setIsMinimized] = React.useState(false);
    const [jobToDelete, setJobToDelete] = React.useState(null);
    const [startTime, setStartTime] = React.useState(null);
    const [completedJobTimes, setCompletedJobTimes] = React.useState([]);

    // Track when batch starts
    React.useEffect(() => {
        if (isRunning && !startTime) {
            setStartTime(Date.now());
        }
        if (!isRunning) {
            setStartTime(null);
            setCompletedJobTimes([]);
        }
    }, [isRunning]);

    // Track completion times for estimation
    React.useEffect(() => {
        const justCompleted = queue.filter(j => j.status === 'completed');
        if (justCompleted.length > completedJobTimes.length && startTime) {
            const avgTime = (Date.now() - startTime) / justCompleted.length;
            setCompletedJobTimes(prev => [...prev, avgTime]);
        }
    }, [queue]);

    // Hitung statistik
    const stats = useMemo(() => {
        return {
            total: queue.length,
            completed: queue.filter(j => j.status === 'completed').length,
            failed: queue.filter(j => j.status === 'error').length,
            pending: queue.filter(j => j.status === 'waiting' || j.status === 'processing').length,
            waiting: queue.filter(j => j.status === 'waiting').length,
            skipped: queue.filter(j => j.status === 'skipped').length
        };
    }, [queue]);

    // Estimasi waktu selesai
    const timeEstimate = useMemo(() => {
        if (!isRunning || stats.pending === 0) return null;

        // Gunakan average dari completed jobs untuk estimasi
        if (completedJobTimes.length > 0) {
            const avgTimePerJob = completedJobTimes.reduce((a, b) => a + b, 0) / completedJobTimes.length;
            const remainingJobs = stats.waiting + (currentJobId ? 0 : 0); // Don't count current processing job
            const estimatedMs = avgTimePerJob * remainingJobs;

            // Format waktu
            const minutes = Math.floor(estimatedMs / 60000);
            const seconds = Math.floor((estimatedMs % 60000) / 1000);

            if (minutes > 0) {
                return `~${minutes}m ${seconds}s`;
            }
            return `~${seconds}s`;
        }

        // Default estimate: 2 menit per job jika belum ada data
        const estimatedMinutes = stats.pending * 2;
        return `~${estimatedMinutes}m`;
    }, [isRunning, stats.pending, stats.waiting, completedJobTimes, currentJobId]);

    // Progress bar total (termasuk progres job yang sedang jalan)
    const progressPercent = useMemo(() => {
        if (queue.length === 0) return 0;
        const completedWeight = queue.filter(j => j.status === 'completed').length;
        const activeJob = queue.find(j => j.id === currentJobId && j.status === 'processing');
        const activeWeight = activeJob ? (activeJob.progress || 0) / 100 : 0;
        return ((completedWeight + activeWeight) / queue.length) * 100;
    }, [queue, currentJobId]);

    if (queue.length === 0) return null;

    return (
        <div className={`fixed bottom-0 left-0 right-0 sm:bottom-6 sm:right-6 sm:left-auto w-full sm:w-96 bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transition-all duration-300 z-[5000] ${isMinimized ? 'h-auto' : 'max-h-[80vh] sm:max-h-[600px]'}`}>
            {/* Header */}
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center cursor-pointer" onClick={() => setIsMinimized(!isMinimized)}>
                <div className="min-w-0 pr-2">
                    <h3 className="font-bold text-sm truncate">Antrian Analisis</h3>
                    <div className="text-[10px] opacity-70 mt-0.5 truncate">
                        {stats.completed} dari {stats.total} Selesai • {stats.failed} Gagal
                        {stats.skipped > 0 && (
                            <span className="ml-1">• {stats.skipped} Dilewati</span>
                        )}
                        {timeEstimate && (
                            <span className="ml-1.5">
                                • <span className="text-emerald-300 font-semibold">{timeEstimate}</span> tersisa
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {/* Start Button - Only show when not running and has waiting jobs and not minimized */}
                    {!isRunning && stats.waiting > 0 && !isMinimized && (
                        <button
                            onClick={onStart}
                            className="flex items-center gap-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-full transition-colors font-bold whitespace-nowrap"
                        >
                            <Play size={12} fill="white" />
                            Mulai
                        </button>
                    )}
                    {/* Cancel Button - Only show when running and not minimized */}
                    {isRunning && !isMinimized && (
                        <button
                            onClick={onCancel}
                            className="text-xs bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
                        >
                            Batalkan
                        </button>
                    )}
                    {/* Clear Button - Only show when not running and not minimized */}
                    {!isRunning && !isMinimized && (
                        <button
                            onClick={onClear}
                            className="text-xs bg-slate-600 hover:bg-slate-700 px-2 py-1.5 rounded-full transition-colors"
                            title="Hapus Antrian"
                        >
                            <Trash2 size={12} />
                        </button>
                    )}

                    {/* Toggle Minimized Icon */}
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                        {isMinimized ? <Plus size={16} /> : <Minus size={16} />}
                    </button>
                </div>
            </div>

            {/* Always show Global Progress Bar even if minimized */}
            <div className="h-1 bg-slate-100 w-full">
                <div
                    className={`h-full transition-all duration-500 ease-out ${isRunning ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            {!isMinimized && (
                <>
                    {/* Status Banner */}
                    {!isRunning && stats.waiting > 0 && (
                        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2">
                            <Clock size={14} className="text-amber-500 shrink-0" />
                            <span className="text-xs text-amber-700 font-medium leading-tight">
                                Menunggu "Mulai" untuk {stats.waiting} file
                            </span>
                        </div>
                    )}

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50 min-h-0">
                        {queue.map((job) => (
                            <div
                                key={job.id}
                                className={`
                                    relative p-3 rounded-xl border transition-all duration-300
                                    ${job.id === currentJobId
                                        ? 'bg-white border-emerald-500 shadow-md scale-[1.01] z-10'
                                        : 'bg-white border-slate-200 hover:border-slate-300'}
                                `}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Icon Status */}
                                    <div className="mt-1 shrink-0">
                                        {job.status === 'completed' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                                        {job.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                                        {job.status === 'processing' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                                        {job.status === 'waiting' && <Clock className="w-5 h-5 text-slate-400" />}
                                        {job.status === 'cancelled' && <X className="w-5 h-5 text-slate-400" />}
                                        {job.status === 'skipped' && <SkipForward className="w-5 h-5 text-amber-500" />}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-1">
                                            <h4 className="font-semibold text-sm text-slate-800 truncate" title={job.file?.name}>
                                                {job.file?.name}
                                            </h4>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0
                                                    ${job.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                                        job.status === 'error' ? 'bg-red-100 text-red-700' :
                                                            job.status === 'processing' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                                                job.status === 'cancelled' ? 'bg-slate-100 text-slate-500' :
                                                                    job.status === 'skipped' ? 'bg-amber-100 text-amber-700' :
                                                                        'bg-slate-100 text-slate-500'}`
                                                }>
                                                    {job.status === 'processing' ? 'Memproses' :
                                                        job.status === 'completed' ? 'Selesai' :
                                                            job.status === 'error' ? 'Gagal' :
                                                                job.status === 'cancelled' ? 'Tutup' :
                                                                    job.status === 'skipped' ? 'Dilewati' : 'Antri'}
                                                </span>
                                                {/* Individual Delete Button */}
                                                {job.status !== 'processing' && (
                                                    <button
                                                        onClick={() => setJobToDelete(job)}
                                                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                                                        title="Hapus dari antrian"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Detail / Error Message */}
                                        {job.error ? (
                                            <p className="text-[11px] text-red-600 bg-red-50 p-2 rounded mt-1 border border-red-100 leading-normal">
                                                {job.error}
                                            </p>
                                        ) : (
                                            <div className="text-[11px] text-slate-500 w-full">
                                                {job.status === 'processing' ?
                                                    (job.progress !== undefined ?
                                                        <div className="mt-2 w-full">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span className="text-[10px] truncate max-w-[150px]">{job.progressDetail || 'Memproses...'}</span>
                                                                <span className="text-[10px] font-bold text-emerald-600 shrink-0 ml-1">{Math.round(job.progress)}%</span>
                                                            </div>
                                                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                                <div className="h-full bg-emerald-500 transition-all duration-300 ease-out" style={{ width: `${job.progress}%` }} />
                                                            </div>
                                                        </div>
                                                        : 'Sedang menganalisis...') :
                                                    job.status === 'completed' ? 'Data berhasil disimpan.' :
                                                        job.status === 'cancelled' ? 'Proses dibatalkan.' :
                                                            job.status === 'skipped' ? (
                                                                <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100 inline-block">
                                                                    {job.progressDetail || 'Sudah ada di database'}
                                                                </span>
                                                            ) :
                                                                `${(job.file?.size / 1024 / 1024).toFixed(2)} MB • ${job.fileType?.toUpperCase() || 'SHP'}`}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50 border-t">
                        Maksimal {MAX_BATCH_SIZE} file per batch
                    </div>
                </>
            )}

            {/* Delete Confirmation Modal */}
            {jobToDelete && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[280px] overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 text-center space-y-4">
                            <div className="mx-auto w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                                <Trash2 size={24} />
                            </div>
                            <div className="space-y-1">
                                <h4 className="font-bold text-slate-800 text-sm">Hapus dari Antrian?</h4>
                                <p className="text-[11px] text-slate-500 leading-relaxed truncate px-2">
                                    {jobToDelete.file?.name}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setJobToDelete(null)}
                                    className="flex-1 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={() => {
                                        onRemove(jobToDelete.id);
                                        setJobToDelete(null);
                                    }}
                                    className="flex-1 py-2 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-lg shadow-red-500/20"
                                >
                                    Hapus
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BatchQueueList;
