import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Helper Component: Attribute Tag with Tooltip
const AttributeTag = ({ label, features }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const buttonRef = useRef(null);
    const tooltipRef = useRef(null);

    const stats = useMemo(() => {
        if (!features || !features.length) return null;
        try {
            // Safe extraction of values
            const values = features.map(f => f.properties?.[label])
                .filter(v => v !== null && v !== undefined && v !== ""); // Filter out null/undefined/empty

            const unique = [...new Set(values)];
            const sortedUnique = unique.sort((a, b) => String(a).localeCompare(String(b))).slice(0, 15); // Top 15 sorted

            return {
                count: values.length,
                uniqueCount: unique.length,
                samples: sortedUnique,
                hasMore: unique.length > 15
            };
        } catch (e) {
            console.error("Error calculating stats for attribute:", label, e);
            return null;
        }
    }, [features, label]);

    // Handle click outside to close tooltip
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showTooltip &&
                buttonRef.current && !buttonRef.current.contains(event.target) &&
                tooltipRef.current && !tooltipRef.current.contains(event.target)) {
                setShowTooltip(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showTooltip]);

    const updatePosition = () => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setTooltipPos({
                top: rect.top - 8, // 8px spacing above the element
                left: rect.left + (rect.width / 2)
            });
        }
    };

    const handleInteraction = (e) => {
        e.stopPropagation();
        updatePosition();
        setShowTooltip(!showTooltip);
    };

    const handleMouseEnter = () => {
        // Only show via hover if not on a touch device
        if (window.matchMedia("(pointer: fine)").matches) {
            updatePosition();
            setShowTooltip(true);
        }
    };

    if (!stats) return (
        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded text-[8px] font-medium border border-slate-200 cursor-not-allowed">
            {label}
        </span>
    );

    return (
        <div className="relative inline-block">
            <button
                ref={buttonRef}
                onClick={handleInteraction}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={() => setShowTooltip(false)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-medium border transition-all cursor-help ${showTooltip ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm scale-105' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200'
                    }`}
            >
                {label}
            </button>

            {/* Tooltip - Portal to Body to avoid overflow clipping */}
            {showTooltip && createPortal(
                <div
                    ref={tooltipRef}
                    className="fixed z-[9999] w-56 bg-white rounded-lg shadow-xl border border-slate-200 p-3 pointer-events-auto transform -translate-x-1/2 -translate-y-full animate-in fade-in zoom-in-95 duration-200"
                    style={{
                        top: tooltipPos.top,
                        left: tooltipPos.left
                    }}
                >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                        <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-700 text-xs truncate max-w-[120px]">{label}</span>
                        </div>
                        <div className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded-full text-slate-500 font-bold whitespace-nowrap">
                            {stats.uniqueCount} Unik
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sampel Data (Unique)</div>
                        <div className="flex flex-wrap gap-1 max-h-32 overflow-hidden">
                            {stats.samples.map((v, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-[9px] text-slate-600 font-mono truncate max-w-[100px]" title={String(v)}>
                                    {String(v)}
                                </span>
                            ))}
                        </div>
                        {stats.hasMore && (
                            <div className="text-[9px] text-slate-400 italic pt-1 text-center bg-gradient-to-t from-white via-white to-transparent">
                                ... +{stats.uniqueCount - 15} lainnya
                            </div>
                        )}
                    </div>

                    {/* Arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-8 border-transparent border-t-white drop-shadow-sm"></div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default AttributeTag;
