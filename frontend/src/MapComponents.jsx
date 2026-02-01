import React, { useEffect, useState, useRef } from 'react';
import { useMap, useMapEvents, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-side-by-side';
import { SIGAP_CONFIG } from './constants';
// Map Components
// Map Components
export const MapRecenter = ({ data, uniqueKey }) => {
    const map = useMap();
    const isFirstLoad = useRef(true);
    const lastKey = useRef(uniqueKey);
    const hasInteracted = useRef(false);

    useEffect(() => {
        const onInteraction = () => {
            if (!isFirstLoad.current && !hasInteracted.current) {
                console.log('📍 MapRecenter: Manual Interaction detected - Auto-zoom disabled');
                hasInteracted.current = true;
            }
        };

        map.on('movestart', onInteraction);
        map.on('zoomstart', onInteraction);

        return () => {
            map.off('movestart', onInteraction);
            map.off('zoomstart', onInteraction);
        };
    }, [map]);

    useEffect(() => {
        // Reset if key changed (new file loaded)
        if (uniqueKey !== lastKey.current) {
            console.log('🚩 MapRecenter: UniqueKey changed - Resetting state', { from: lastKey.current, to: uniqueKey });
            isFirstLoad.current = true;
            hasInteracted.current = false;
            lastKey.current = uniqueKey;
        }

        if (data && isFirstLoad.current && !hasInteracted.current) {
            console.log('📐 MapRecenter: Performing initial zoom to data');
            try {
                const geojsonLayer = L.geoJSON(data);
                const bounds = geojsonLayer.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [100, 100], maxZoom: 16 });
                    isFirstLoad.current = false;
                    console.log('✅ MapRecenter: Zoom complete - firstLoad set to false');
                }
            } catch (err) { console.error('Error:', err); }
        } else if (hasInteracted.current) {
            console.log('🚫 MapRecenter: Auto-zoom skipped (user has interacted)');
        }
    }, [data, map, uniqueKey]);

    return null;
};

// ⚡ PERFORMANCE OPTIMIZATION: Add GPU acceleration styles for smooth zoom
// This injected CSS ensures Leaflet containers use hardware acceleration
const injectMapPerformanceStyles = () => {
    if (typeof document !== 'undefined' && !document.getElementById('leaflet-perf-styles')) {
        const style = document.createElement('style');
        style.id = 'leaflet-perf-styles';
        style.textContent = `
            .leaflet-container {
                will-change: transform;
                transform: translateZ(0);
                backface-visibility: hidden;
            }
            .leaflet-pane {
                will-change: transform;
                transform: translateZ(0);
            }
            .leaflet-tile-pane {
                will-change: transform;
            }
            .leaflet-tile {
                backface-visibility: hidden;
            }
        `;
        document.head.appendChild(style);
    }
};

// Dynamic TileLayer that responds to opacity changes
// Updated to strictly recreate layer on URL change to prevent "stacking" of old tiles
export const DynamicTileLayer = ({ url, opacity, show, pane = 'overlayPane', zIndex = 10 }) => {
    const map = useMap();
    const layerRef = useRef(null);

    // Inject performance styles once
    React.useEffect(() => {
        injectMapPerformanceStyles();
    }, []);

    // 1. Manage Layer Lifecycle (Create / Destroy)
    useEffect(() => {
        if (!show || !url) {
            return;
        }

        // Create new layer
        const layer = L.tileLayer(url, {
            opacity: opacity, // Initial opacity
            pane: pane,
            zIndex: zIndex,
            maxNativeZoom: 18,
            maxZoom: 18,
            keepBuffer: 3,     // Optimal buffer for smooth zoom
            updateWhenZooming: false, // Don't update tiles during zoom animation
            updateWhenIdle: true,     // Update tiles after zoom completes
        });

        layer.addTo(map);
        layerRef.current = layer;

        // Cleanup: Remove layer when URL changes or component unmounts
        return () => {
            if (map && layer) {
                map.removeLayer(layer);
            }
            layerRef.current = null;
        };
        // Dependencies: Re-run only when critical identity props change.
        // We exclude opacity/zIndex to prevent recreation (handled by 2nd effect)
    }, [url, show, map, pane]);

    // 2. Handle Dynamic Updates (Opacity / ZIndex) without recreation
    useEffect(() => {
        if (layerRef.current) {
            layerRef.current.setOpacity(opacity);
            layerRef.current.setZIndex(zIndex);
        }
    }, [opacity, zIndex]);

    return null;
};

// SideBySide Component
export const SwipeMapControl = ({ leftUrl, rightUrl, show }) => {
    const map = useMap();
    const [control, setControl] = useState(null);
    const [leftLayer, setLeftLayer] = useState(null);
    const [rightLayer, setRightLayer] = useState(null);

    useEffect(() => {
        if (!show || !leftUrl || !rightUrl) {
            if (control) {
                map.removeControl(control);
                setControl(null);
            }
            if (leftLayer) map.removeLayer(leftLayer);
            if (rightLayer) map.removeLayer(rightLayer);
            setLeftLayer(null);
            setRightLayer(null);
            return;
        }

        // Create layers
        const left = L.tileLayer(leftUrl, { maxNativeZoom: 18, maxZoom: 18 }).addTo(map);
        const right = L.tileLayer(rightUrl, { maxNativeZoom: 18, maxZoom: 18 }).addTo(map);

        // Create control
        const sbs = L.control.sideBySide(left, right);
        sbs.addTo(map);

        setLeftLayer(left);
        setRightLayer(right);
        setControl(sbs);

        return () => {
            if (sbs) map.removeControl(sbs);
            if (left) map.removeLayer(left);
            if (right) map.removeLayer(right);
        };
    }, [show, leftUrl, rightUrl, map]);

    return null;
};

// Draw Polygon Control
export const DrawPolygonControl = ({ active, points, onChange, onComplete }) => {
    const map = useMap();
    const [tempLayer, setTempLayer] = useState(null);

    // Initial setup: Change cursor
    useEffect(() => {
        if (active) {
            map.getContainer().style.cursor = 'crosshair';
            map.doubleClickZoom.disable();
        } else {
            map.getContainer().style.cursor = '';
            map.doubleClickZoom.enable();
            if (onChange) onChange([]); // Reset points on exit
            if (tempLayer) {
                map.removeLayer(tempLayer);
                setTempLayer(null);
            }
        }
    }, [active, map]);

    // Update visuals when points change
    useEffect(() => {
        if (!active) return;

        if (tempLayer) map.removeLayer(tempLayer);

        if (points && points.length > 0) {
            // Draw lines/polygon preview
            const layer = L.featureGroup();

            // Draw points
            points.forEach(p => {
                L.circleMarker(p, { color: '#f97316', radius: 4, fillOpacity: 1, fillColor: '#fff', weight: 2 }).addTo(layer);
            });

            // Draw line
            if (points.length > 1) {
                L.polyline(points, { color: '#f97316', weight: 2, dashArray: '5, 5' }).addTo(layer);
            }

            // Draw polygon preview if 3+ points
            if (points.length > 2) {
                L.polygon(points, { color: '#f97316', weight: 0, fillOpacity: 0.2 }).addTo(layer);
            }

            layer.addTo(map);
            setTempLayer(layer);
        }
    }, [points, active, map]);

    useMapEvents({
        click(e) {
            if (!active) return;
            const newPoints = [...(points || []), e.latlng];
            onChange(newPoints);
        },
        dblclick(e) {
            if (!active) return;
            if (points && points.length >= 3) {
                // GeoJSON expects [[lng, lat], [lng, lat], ...]
                const coordinates = points.map(p => [p.lng, p.lat]);
                coordinates.push(coordinates[0]); // Close ring

                const geoJson = {
                    type: "FeatureCollection",
                    features: [{
                        type: "Feature",
                        properties: { source: "manual_draw" },
                        geometry: {
                            type: "Polygon",
                            coordinates: [coordinates]
                        }
                    }]
                };
                onComplete(geoJson);
            }
        },
        contextmenu(e) {
            if (!active) return;
            e.originalEvent.preventDefault();
            if (points.length > 0) {
                onChange(points.slice(0, -1));
            }
        }
    });

    return null;
};

// Helper for JSONP requests to bypass CORS
const fetchJsonp = (url) => {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
        window[callbackName] = function (data) {
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(data);
        };

        const script = document.createElement('script');
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
        script.onerror = () => {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP request failed'));
        };
        document.body.appendChild(script);
    });
};

// Identify SIGAP Features Component
export const IdentifySigapFeatures = ({ activeLayers, onResult }) => {
    const map = useMapEvents({
        click: async (e) => {
            const size = map.getSize();
            const bounds = map.getBounds();
            const extent = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

            const params = new URLSearchParams({
                f: 'json',
                tolerance: 3,
                returnGeometry: false,
                imageDisplay: `${size.x},${size.y},96`,
                mapExtent: extent,
                geometry: `${e.latlng.lng},${e.latlng.lat}`,
                geometryType: 'esriGeometryPoint',
                sr: 4326,
                layers: 'all'
            });

            const results = [];

            // Helper to fetch identification
            const identify = async (baseUrl, titlePrefix, isSigap = true) => {
                const url = `${baseUrl}/identify?${params.toString()}`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) return [];

                    const json = await response.json();
                    if (json && json.results) {
                        return json.results.map(r => {
                            let displayName = r.value;
                            return {
                                ...r,
                                layerName: `${titlePrefix}: ${r.layerName}`,
                                value: displayName,
                                attributes: r.attributes
                            };
                        });
                    }
                } catch (err) { console.error(`Identify error (${titlePrefix}):`, err); }
                return [];
            };

            // 1. SIGAP Identification
            if (activeLayers.hutan) {
                const hutanRes = await identify(SIGAP_CONFIG.KAWASAN_HUTAN, 'Kawasan Hutan', true);
                results.push(...(hutanRes || []));
            }
            if (activeLayers.das) {
                const dasRes = await identify(SIGAP_CONFIG.DAS, 'DAS', true);
                results.push(...(dasRes || []));
            }

            if (results.length > 0) {
                onResult(e.latlng, results);
            }
        }
    });
    return null;
};

// Custom Pins Manager Component
export const CustomPinsManager = ({ pins, isAddingPin, onAddPin, onDeletePin, onUpdatePin }) => {
    const map = useMap();
    const [editingPinId, setEditingPinId] = useState(null);
    const [editLabel, setEditLabel] = useState('');

    // Handle map click to add new pin
    useMapEvents({
        click(e) {
            if (isAddingPin) {
                const label = prompt('Masukkan label untuk pin (opsional):');
                if (label !== null) { // User didn't cancel
                    onAddPin(e.latlng, label || '');
                }
            }
        }
    });

    // Change cursor when in adding mode
    useEffect(() => {
        if (isAddingPin) {
            map.getContainer().style.cursor = 'crosshair';
        } else {
            map.getContainer().style.cursor = '';
        }
    }, [isAddingPin, map]);

    // Create custom marker icon
    const createCustomPinIcon = (label) => {
        return L.divIcon({
            className: 'custom-pin-marker',
            html: `
                <div style="position: relative;">
                    <svg width="32" height="40" viewBox="0 0 32 40" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                        <path d="M16 0C7.163 0 0 7.163 0 16c0 8.837 16 24 16 24s16-15.163 16-24C32 7.163 24.837 0 16 0z" fill="#ef4444"/>
                        <circle cx="16" cy="16" r="6" fill="white"/>
                    </svg>
                    ${label ? `<div style="position: absolute; top: 42px; left: 50%; transform: translateX(-50%); background: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">${label}</div>` : ''}
                </div>
            `,
            iconSize: [32, 40],
            iconAnchor: [16, 40],
            popupAnchor: [0, -40]
        });
    };

    return (
        <>
            {pins.map(pin => (
                <Marker
                    key={pin.id}
                    position={[pin.lat, pin.lng]}
                    icon={createCustomPinIcon(pin.label)}
                >
                    <Popup>
                        <div className="p-2 min-w-[160px]">
                            {editingPinId === pin.id ? (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={editLabel}
                                        onChange={(e) => setEditLabel(e.target.value)}
                                        className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                                        placeholder="Label pin..."
                                        autoFocus
                                    />
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => {
                                                onUpdatePin(pin.id, { label: editLabel });
                                                setEditingPinId(null);
                                            }}
                                            className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold uppercase rounded"
                                        >
                                            Simpan
                                        </button>
                                        <button
                                            onClick={() => setEditingPinId(null)}
                                            className="flex-1 py-1 bg-slate-400 hover:bg-slate-500 text-white text-[9px] font-bold uppercase rounded"
                                        >
                                            Batal
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custom Pin</div>
                                    <div className="text-xs font-bold text-slate-800 mb-2">{pin.label || 'No Label'}</div>
                                    <div className="text-[9px] text-slate-500 mb-2">
                                        <div>Lat: {pin.lat.toFixed(6)}</div>
                                        <div>Lng: {pin.lng.toFixed(6)}</div>
                                    </div>
                                    <div className="flex gap-1 mb-2">
                                        <button
                                            onClick={() => {
                                                setEditingPinId(pin.id);
                                                setEditLabel(pin.label);
                                            }}
                                            className="flex-1 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-bold uppercase rounded"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (window.confirm('Hapus pin ini?')) {
                                                    onDeletePin(pin.id);
                                                }
                                            }}
                                            className="flex-1 py-1 bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold uppercase rounded"
                                        >
                                            Hapus
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const googleMapsUrl = `https://maps.google.com/?q=${pin.lat},${pin.lng}&z=15`;
                                            window.open(googleMapsUrl, '_blank');
                                        }}
                                        className="w-full py-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-[9px] font-bold uppercase rounded"
                                    >
                                        🗺️ Google Maps
                                    </button>
                                </>
                            )}
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
};
