import React, { useEffect, useState, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-side-by-side';
import { SIGAP_CONFIG, BIG_ADMIN_CONFIG } from './constants';
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

// Dynamic TileLayer that responds to opacity changes
// Updated to strictly recreate layer on URL change to prevent "stacking" of old tiles
export const DynamicTileLayer = ({ url, opacity, show, pane = 'overlayPane', zIndex = 10 }) => {
    const map = useMap();
    const layerRef = useRef(null);

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
            maxNativeZoom: 20, // GEE usually supports high zoom, let it try
            maxZoom: 24,       // Allow over-zooming
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
        const left = L.tileLayer(leftUrl, { maxNativeZoom: 20, maxZoom: 24 }).addTo(map);
        const right = L.tileLayer(rightUrl, { maxNativeZoom: 20, maxZoom: 24 }).addTo(map);

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
                // Use proxy for SIGAP, but direct or proxy for BIG?
                // BIG endpoint: https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_WILAYAH/MapServer
                // Since we're in the browser, let's see if BIG supports CORS.
                // Usually it does. If not, we might need another proxy.
                const url = `${baseUrl}/identify?${params.toString()}`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) return [];

                    const json = await response.json();
                    if (json && json.results) {
                        return json.results.map(r => {
                            let displayName = r.value;
                            // For BIG areas, extract name from common field variations
                            if (!isSigap && r.attributes) {
                                const attr = r.attributes;
                                // Try common BIG field names (case-insensitive search)
                                const findAttr = (keys) => {
                                    const foundKey = Object.keys(attr).find(k => keys.includes(k.toLowerCase()));
                                    return foundKey ? attr[foundKey] : null;
                                };

                                const name = findAttr(['namobj', 'wiadpr', 'wiadkk', 'wiadkc', 'wiadkd', 'wadmpr', 'wadmkk', 'wadmkc', 'wadmkd']);
                                if (name) displayName = name;
                            }

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

            // 2. BIG Administrative Identification
            if (activeLayers.big) {
                // Remove '/export' to get base MapServer URL for identify
                const bigBaseUrl = BIG_ADMIN_CONFIG.EXPORT_URL.replace('/export', '');
                const bigRes = await identify(bigBaseUrl, 'Batas Administrasi', false);
                results.push(...(bigRes || []));
            }

            if (results.length > 0) {
                onResult(e.latlng, results);
            }
        }
    });
    return null;
};

// BIG Administrative Boundaries Layer Component
// Uses ArcGIS Dynamic Map Service export - Reference Layer ONLY
export const BigAdminLayer = ({ show, layerType = 'PROVINSI', opacity = 0.8, showLabels = false }) => {
    const map = useMap();
    const layerRef = useRef(null);

    useEffect(() => {
        if (layerRef.current) {
            map.removeLayer(layerRef.current);
            layerRef.current = null;
        }

        if (!show) return;

        const layerConfig = BIG_ADMIN_CONFIG.LAYERS[layerType];
        if (!layerConfig) return;

        const layer = L.tileLayer('', {
            opacity: opacity,
            zIndex: 50,
            maxNativeZoom: 18,
            maxZoom: 24,
            attribution: '© BIG'
        });

        layer.getTileUrl = function (coords) {
            const tileSize = 256;
            const nwPoint = coords.scaleBy(L.point(tileSize, tileSize));
            const sePoint = nwPoint.add(L.point(tileSize, tileSize));
            const nw = map.unproject(nwPoint, coords.z);
            const se = map.unproject(sePoint, coords.z);
            const bbox = `${nw.lng},${se.lat},${se.lng},${nw.lat}`;

            // Construct layer logic: always show geometry ID, optionally show label ID
            let layerIds = [layerConfig.id];
            if (showLabels && layerConfig.labelId !== undefined) {
                layerIds.push(layerConfig.labelId);
            }

            const params = new URLSearchParams({
                bbox, bboxSR: 4326, imageSR: 4326, size: `${tileSize},${tileSize}`,
                format: 'png32', transparent: true, layers: `show:${layerIds.join(',')}`, f: 'image'
            });
            return `${BIG_ADMIN_CONFIG.EXPORT_URL}?${params.toString()}`;
        };

        layer.on('tileerror', () => console.warn(`BigAdminLayer: Error loading ${layerType}`));
        layer.addTo(map);
        layerRef.current = layer;

        return () => { if (layerRef.current) map.removeLayer(layerRef.current); };
    }, [show, layerType, map, showLabels]);

    useEffect(() => { if (layerRef.current) layerRef.current.setOpacity(opacity); }, [opacity]);

    return null;
};
