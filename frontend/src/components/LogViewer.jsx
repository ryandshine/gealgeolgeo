import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Copy, Trash2, Filter, CheckCircle, ChevronDown, ChevronUp, Download, Pause, Play, RefreshCw } from 'lucide-react';

// Simple ANSI to HTML parser since we can't easily add dependencies like ansi-to-react without npm install
const AnsiParser = ({ text }) => {
    if (!text) return null;

    // Simple parser for standard ANSI colors
    // This is a robust enough implementation for standard console logs
    const parts = text.split(/(\u001b\[\d+(?:;\d+)*m)/g);

    let style = {};

    return (
        <span>
            {parts.map((part, index) => {
                const match = part.match(/\u001b\[(\d+(?:;\d+)*)m/);
                if (match) {
                    const codes = match[1].split(';').map(Number);
                    for (const code of codes) {
                        if (code === 0) style = {}; // Reset
                        else if (code === 1) style = { ...style, fontWeight: 'bold' };
                        else if (code >= 30 && code <= 37) {
                            const colors = ['#000', '#c0392b', '#27ae60', '#d35400', '#2980b9', '#8e44ad', '#16a085', '#bdc3c7'];
                            style = { ...style, color: colors[code - 30] };
                        }
                        else if (code >= 90 && code <= 97) {
                            const colors = ['#7f8c8d', '#e74c3c', '#2ecc71', '#f39c12', '#3498db', '#9b59b6', '#1abc9c', '#ecf0f1'];
                            style = { ...style, color: colors[code - 90] };
                        }
                    }
                    return null;
                }
                return <span key={index} style={style}>{part}</span>;
            })}
        </span>
    );
};

const LogViewer = ({ isOpen, onClose, embedded = false }) => {
    const [logs, setLogs] = useState([]);
    const [filter, setFilter] = useState('ALL');
    const [autoScroll, setAutoScroll] = useState(true);
    const [copySuccess, setCopySuccess] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const logsEndRef = useRef(null);
    const logContainerRef = useRef(null);
    const eventSourceRef = useRef(null);

    // Initial log fetch and SSE Connection
    useEffect(() => {
        // In embedded mode, we might want to connect even if "isOpen" isn't strictly controlled by parent like the modal
        // But for now, we assume parent controls isOpen or it defaults to true
        if (!isOpen && !embedded) {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            return;
        }

        // If embedded, we definitely want logs when mounted (assuming component is conditionally rendered)
        // If it's a fixed modal (not embedded), we rely on isOpen.

        const connectSSE = () => {
            // Close existing connection if any
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }

            console.log('📡 Connecting to log stream...');
            const evtSource = new EventSource('http://127.0.0.1:8000/api/logs/stream');
            eventSourceRef.current = evtSource;

            evtSource.onmessage = (event) => {
                if (isPaused) return;

                try {
                    const newLog = event.data;
                    // Parse log level from text if possible
                    let level = 'INFO';
                    if (newLog.includes('ERROR') || newLog.includes('CRITICAL')) level = 'ERROR';
                    else if (newLog.includes('WARNING')) level = 'WARNING';
                    else if (newLog.includes('DEBUG')) level = 'DEBUG';

                    // Add timestamp if missing (simple heuristic)
                    let timestamp = new Date().toISOString();
                    // Try to extract timestamp from log line (e.g. 2026-01-24 13:30:00)
                    const timeMatch = newLog.match(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/);
                    if (timeMatch) timestamp = timeMatch[0];

                    setLogs(prev => {
                        const updated = [...prev, {
                            raw: newLog,
                            level,
                            timestamp,
                            id: Date.now() + Math.random()
                        }];
                        // Limit log history to avoid memory issues
                        if (updated.length > 2000) return updated.slice(-1000);
                        return updated;
                    });

                    // Force scroll on new message if auto-scroll is active
                    if (autoScroll && logsEndRef.current && (isExpanded || embedded) && !isPaused) {
                        // Small timeout to allow render
                        setTimeout(() => {
                            if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
                        }, 10);
                    }

                } catch (error) {
                    console.error('Error parsing log:', error);
                }
            };

            evtSource.onerror = (err) => {
                if (evtSource.readyState === EventSource.CLOSED) {
                    console.log('Eventsource closed');
                } else {
                    console.error('EventSource error:', err);
                    // Show error in UI
                    setLogs(prev => [...prev, {
                        raw: `⚠️ Connection Error (ReadyState: ${evtSource.readyState}). Retrying...`,
                        level: "ERROR",
                        timestamp: new Date().toISOString(),
                        id: Date.now()
                    }]);
                }
            };
        };

        connectSSE();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, [isOpen, isPaused, embedded]);

    // Auto-scroll logic
    useEffect(() => {
        if (autoScroll && logsEndRef.current && (isExpanded || embedded) && !isPaused) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll, isExpanded, isPaused, embedded]);

    // Filter logs
    const filteredLogs = logs.filter(log => {
        if (filter === 'ALL') return true;
        return log.level === filter;
    });

    // Copy logs
    const handleCopyLogs = () => {
        const logText = filteredLogs.map(log => log.raw).join('\n');
        navigator.clipboard.writeText(logText).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        });
    };

    // Download logs
    const handleDownloadLogs = () => {
        window.open('http://localhost:8000/api/logs/download', '_blank');
    };

    const handleClearLogs = () => {
        setLogs([]);
    };

    if (!isOpen && !embedded) return null;

    // DIFFERENT STYLES FOR EMBEDDED MODE
    const containerClasses = embedded
        ? "w-full h-full min-h-[200px] flex flex-col font-mono text-xs bg-[#0f172a] rounded-xl overflow-hidden border border-slate-700/50"
        : "fixed bottom-0 left-0 right-0 bg-[#0d1117] border-t-2 border-emerald-500 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] z-[9999] transition-all duration-300 flex flex-col font-mono text-sm";

    const containerStyle = embedded
        ? {}
        : { height: isExpanded ? '400px' : '48px' };

    return (
        <div
            className={containerClasses}
            style={containerStyle}
        >
            {/* Header Toolbar */}
            <div className={`flex items-center justify-between px-3 py-2 border-b select-none ${embedded ? 'bg-slate-800/50 border-slate-700' : 'bg-[#161b22] border-gray-700'}`}>
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-500" />
                    <h3 className={`font-semibold ${embedded ? 'text-slate-300 text-xs' : 'text-gray-200'}`}>
                        {embedded ? 'Live System Logs' : 'Backend Console'}
                    </h3>
                    <div className="flex items-center gap-2 ml-2">
                        <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded-full border border-emerald-500/20 flex items-center gap-1">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                            </span>
                            Live
                        </span>
                        {!embedded && (
                            <span className="text-xs text-gray-500">
                                {filteredLogs.length} lines
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {/* Controls */}
                    <div className="flex items-center bg-white/5 rounded p-0.5 border border-white/10 mr-1">
                        <button
                            onClick={() => setIsPaused(!isPaused)}
                            className={`p-1 rounded transition-colors ${isPaused ? 'bg-yellow-500/20 text-yellow-500' : 'text-slate-400 hover:text-white'}`}
                            title={isPaused ? "Resume scrolling" : "Pause scrolling"}
                        >
                            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                        </button>
                    </div>

                    {!embedded && (
                        <div className="flex items-center bg-gray-800 rounded p-0.5 border border-gray-700 mr-2">
                            <button
                                onClick={handleClearLogs}
                                className="p-1.5 text-gray-400 hover:text-red-400 rounded transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}


                    <div className="flex items-center gap-1">
                        <button onClick={handleDownloadLogs} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition" title="Download Full Log">
                            <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={handleCopyLogs} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition" title="Copy to Clipboard">
                            {copySuccess ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        {!embedded && (
                            <>
                                <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition">
                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                </button>
                                <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition">
                                    <X className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Log Content */}
            {(isExpanded || embedded) && (
                <div
                    ref={logContainerRef}
                    className={`flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-4 text-slate-300 overflow-x-hidden custom-scrollbar ${embedded ? 'bg-[#0f172a]' : 'bg-[#0d1117]'}`}
                >
                    {filteredLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-60">
                            <Terminal className="w-8 h-8 mb-2" />
                            <p>Waiting for live logs...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {filteredLogs.map((log) => (
                                <div key={log.id} className="whitespace-pre-wrap break-all hover:bg-white/5 py-0.5 -mx-1 px-1 rounded">
                                    {!embedded && (
                                        <span className="text-slate-600 select-none mr-2 text-[10px] opacity-60">
                                            {log.timestamp.split('T')[1]?.split('.')[0] || log.timestamp.split(' ')[1] || ''}
                                        </span>
                                    )}
                                    <AnsiParser text={log.raw} />
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LogViewer;
