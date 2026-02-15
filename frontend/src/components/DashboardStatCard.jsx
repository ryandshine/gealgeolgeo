
import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

const DashboardStatCard = ({ title, value, icon: Icon, color = "blue", trend, subtext, loading }) => {
    // Color variants
    const colorClasses = {
        blue: "bg-blue-50 text-blue-600",
        green: "bg-green-50 text-green-600",
        red: "bg-red-50 text-red-600",
        yellow: "bg-yellow-50 text-yellow-600",
        orange: "bg-orange-50 text-orange-600",
        purple: "bg-purple-50 text-purple-600",
        emerald: "bg-emerald-50 text-emerald-600",
        rose: "bg-rose-50 text-rose-600"
    };

    const activeColorClass = colorClasses[color] || colorClasses.blue;

    if (loading) {
        return (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm animate-pulse">
                <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg"></div>
                    <div className="flex-1">
                        <div className="h-3 w-20 bg-slate-100 rounded mb-1"></div>
                        <div className="h-5 w-24 bg-slate-100 rounded"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                    <div className={`p-2.5 rounded-lg ${activeColorClass}`}>
                        {Icon && <Icon size={20} />}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">{title}</p>
                        <h3 className="text-xl font-bold text-slate-800 mt-0.5">{value}</h3>
                    </div>
                </div>

                {/* Optional Trend Indicator */}
                {trend && (
                    <div className={`flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${trend === 'up' ? 'text-emerald-600 bg-emerald-50' :
                            trend === 'down' ? 'text-rose-600 bg-rose-50' :
                                'text-slate-500 bg-slate-50'
                        }`}>
                        {trend === 'up' && <ArrowUp size={12} className="mr-0.5" />}
                        {trend === 'down' && <ArrowDown size={12} className="mr-0.5" />}
                        {trend === 'neutral' && <Minus size={12} className="mr-0.5" />}
                        <span>{subtext}</span>
                    </div>
                )}
            </div>

            {/* Optional Subtext without trend */}
            {!trend && subtext && (
                <p className="text-xs text-slate-400 mt-3 ml-1">{subtext}</p>
            )}
        </div>
    );
};

export default DashboardStatCard;
