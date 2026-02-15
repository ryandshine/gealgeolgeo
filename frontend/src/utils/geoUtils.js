import proj4 from 'proj4';

// Expose proj4 globally for shpjs to find it
if (typeof window !== 'undefined') {
    window.proj4 = proj4;
}

// Define common Indonesian CRS projections
proj4.defs([
    ['EPSG:32751', '+proj=utm +zone=51 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32750', '+proj=utm +zone=50 +south +datum=WGS84 +units=m +no_defs'],
    // Sumatra & West Indo (N/S)
    ['EPSG:32646', '+proj=utm +zone=46 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32647', '+proj=utm +zone=47 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32648', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32746', '+proj=utm +zone=46 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32747', '+proj=utm +zone=47 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32748', '+proj=utm +zone=48 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32749', '+proj=utm +zone=49 +south +datum=WGS84 +units=m +no_defs'],
    // Java/Bali/Nusa/Kalimantan/Sulawesi (49-51)
    ['EPSG:32649', '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32650', '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs'],
    // Eastern Indo
    ['EPSG:32752', '+proj=utm +zone=52 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32753', '+proj=utm +zone=53 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32754', '+proj=utm +zone=54 +south +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32651', '+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32652', '+proj=utm +zone=52 +datum=WGS84 +units=m +no_defs'],
    ['EPSG:32653', '+proj=utm +zone=53 +datum=WGS84 +units=m +no_defs'],
    // Custom
    ['EPSG:23838', '+proj=tmerc +lat_0=0 +lon_0=124.5 +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
    ['EPSG:54034', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'],
    ['World_Cylindrical_Equal_Area', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'],
    ['Cylindrical_Equal_Area', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'],
    ['ESRI:54034', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'],
    ['PROJCS["World_Cylindrical_Equal_Area",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Cylindrical_Equal_Area"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],UNIT["Meter",1.0]]', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'],
    ['CEA', '+proj=cea +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs']
]);

export const swapCoordinates = (coords) => {
    if (typeof coords[0] === 'number' && coords.length >= 2) return [coords[1], coords[0], ...coords.slice(2)];
    return coords.map(swapCoordinates);
};

export const reprojectToWGS84 = (geojson) => {
    const firstCoord = geojson.type === 'FeatureCollection' ? geojson.features[0]?.geometry?.coordinates?.flat(Infinity).slice(0, 2)
        : (geojson.type === 'Feature' ? geojson.geometry?.coordinates?.flat(Infinity).slice(0, 2) : geojson.coordinates?.flat(Infinity).slice(0, 2));

    if (!firstCoord || firstCoord.length < 2) return geojson;
    const [x, y] = firstCoord;

    // ALGORITMA REPROYEKSI "MAX": Jika koordinat sangat besar (bukan Lat/Lon), paksa ke proyeksi yang paling masuk akal
    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
        let sourceProj = 'EPSG:32751'; // Default UTM 51S

        // Deteksi berdasarkan rentang koordinat CEA (Cylindrical Equal Area)
        // Biasanya koordinat CEA sangat besar (jutaan / sepuluh jutaan)
        if (Math.abs(x) > 5000000 || Math.abs(y) > 5000000) {
            sourceProj = 'EPSG:54034'; // Cylindrical Equal Area
        }
        // Deteksi UTM berdasarkan rentang Indonesia (Zone 46-54)
        else if (x > 100000 && x < 900000) {
            if (y > 1400000 && y < 1600000) sourceProj = 'EPSG:23838'; // Kasus khusus wilayah tertentu
            else sourceProj = 'EPSG:32751';
        }

        const reproject = (coords) => {
            if (typeof coords[0] === 'number' && coords.length >= 2) {
                try {
                    const projected = proj4(sourceProj, 'WGS84', [coords[0], coords[1]]);
                    if (Number.isFinite(projected[0]) && Number.isFinite(projected[1])) {
                        return [projected[0], projected[1], ...coords.slice(2)];
                    }
                } catch (e) { return coords; }
            }
            return Array.isArray(coords) ? coords.map(reproject) : coords;
        };
        const reprojectGeometry = (geometry) => ({ ...geometry, coordinates: reproject(geometry.coordinates) });

        if (geojson.type === 'FeatureCollection') return { ...geojson, features: geojson.features.filter(f => f.geometry?.coordinates?.length > 0).map(f => ({ ...f, geometry: reprojectGeometry(f.geometry) })) };
        if (geojson.type === 'Feature') return { ...geojson, geometry: reprojectGeometry(geojson.geometry) };
        return reprojectGeometry(geojson);
    }

    if (y >= 95 && y <= 141 && Math.abs(x) <= 15) {
        const fixGeometry = (geometry) => ({ ...geometry, coordinates: swapCoordinates(geometry.coordinates) });
        if (geojson.type === 'FeatureCollection') return { ...geojson, features: geojson.features.map(f => ({ ...f, geometry: fixGeometry(f.geometry) })) };
        if (geojson.type === 'Feature') return { ...geojson, geometry: fixGeometry(geojson.geometry) };
        return fixGeometry(geojson);
    }
    return geojson;
};
