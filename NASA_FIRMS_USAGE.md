# NASA FIRMS Hotspot API - Panduan Penggunaan

## Overview
Sistem hotspot telah diganti dari BMKG ke **NASA FIRMS** (Fire Information for Resource Management System) yang menyediakan data titik panas dari satelit dengan resolusi lebih tinggi dan kemampuan time series.

## Sumber Data NASA FIRMS

### Satelit yang Tersedia:
1. **VIIRS_SNPP_NRT** (Default) - Suomi NPP satellite
   - Resolusi: 375m
   - Update: Near Real-Time (3 jam)
   - Recommended untuk akurasi tinggi

2. **VIIRS_NOAA20_NRT** - NOAA-20 satellite
   - Resolusi: 375m
   - Update: Near Real-Time (3 jam)
   - Komplementer dengan VIIRS SNPP

3. **MODIS_NRT** - Terra & Aqua satellites
   - Resolusi: 1km
   - Update: Near Real-Time (3 jam)
   - Coverage lebih luas

## Endpoint API

### Backend Proxy
```
POST /proxy/nasa/hotspot
```

### Request Body
```json
{
  "bounds": {
    "minLon": 95.0,
    "minLat": -11.0,
    "maxLon": 141.0,
    "maxLat": 6.0
  },
  "start_date": "2024-01-01",  // Optional: untuk time series
  "end_date": "2024-12-31",    // Optional: untuk time series
  "source": "VIIRS_SNPP_NRT"   // Optional: default VIIRS_SNPP_NRT
}
```

## Contoh Penggunaan

### 1. Query Data Terkini (10 hari terakhir)
```javascript
const response = await fetch('/proxy/nasa/hotspot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    bounds: {
      minLon: 106.0,
      minLat: -7.0,
      maxLon: 107.0,
      maxLat: -6.0
    }
    // Tidak perlu start_date/end_date untuk data terkini
  })
});

const geojson = await response.json();
console.log(`Total hotspot: ${geojson.features.length}`);
```

### 2. Query Time Series - Tahun Penuh
```javascript
// Data hotspot untuk seluruh tahun 2024
const response = await fetch('/proxy/nasa/hotspot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    bounds: {
      minLon: 106.0,
      minLat: -7.0,
      maxLon: 107.0,
      maxLat: -6.0
    },
    start_date: "2024-01-01",
    end_date: "2024-12-31",
    source: "VIIRS_SNPP_NRT"
  })
});

const geojson = await response.json();
```

### 3. Query Multi-Tahun untuk Analisis Tren
```javascript
// Bandingkan hotspot antar tahun
async function getYearlyHotspots(bounds, years) {
  const results = {};

  for (const year of years) {
    const response = await fetch('/proxy/nasa/hotspot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bounds: bounds,
        start_date: `${year}-01-01`,
        end_date: `${year}-12-31`,
        source: "VIIRS_SNPP_NRT"
      })
    });

    const data = await response.json();
    results[year] = {
      total: data.features.length,
      features: data.features
    };
  }

  return results;
}

// Contoh: Bandingkan 2020-2024
const bounds = { minLon: 106.0, minLat: -7.0, maxLon: 107.0, maxLat: -6.0 };
const trend = await getYearlyHotspots(bounds, [2020, 2021, 2022, 2023, 2024]);

console.log("Tren Hotspot:");
Object.entries(trend).forEach(([year, data]) => {
  console.log(`${year}: ${data.total} titik panas`);
});
```

### 4. Analisis Per Bulan
```javascript
async function getMonthlyHotspots(bounds, year) {
  const months = [];

  for (let month = 1; month <= 12; month++) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const response = await fetch('/proxy/nasa/hotspot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bounds: bounds,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        source: "VIIRS_SNPP_NRT"
      })
    });

    const data = await response.json();
    months.push({
      month: month,
      name: startDate.toLocaleString('id-ID', { month: 'long' }),
      count: data.features.length,
      features: data.features
    });
  }

  return months;
}

// Analisis per bulan untuk tahun 2024
const monthlyData = await getMonthlyHotspots(bounds, 2024);
console.log("Hotspot per Bulan 2024:");
monthlyData.forEach(m => {
  console.log(`${m.name}: ${m.count} titik`);
});
```

## Response Format (GeoJSON)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [106.12345, -6.54321]
      },
      "properties": {
        "brightness": 325.5,          // Brightness temperature (Kelvin)
        "scan": 0.8,                  // Scan size
        "track": 0.8,                 // Track size
        "acq_date": "2024-01-15",     // Acquisition date
        "acq_time": "0245",           // Acquisition time (HHMM)
        "satellite": "N",             // N=Suomi NPP, J1=NOAA-20
        "confidence": "nominal",      // low, nominal, high
        "version": "2.0NRT",
        "bright_ti4": 325.5,          // Band I-4 brightness
        "bright_ti5": 298.2,          // Band I-5 brightness
        "frp": 15.8,                  // Fire Radiative Power (MW)
        "daynight": "N"               // D=day, N=night
      }
    }
  ]
}
```

## Properties Penting

- **brightness (bright_ti4)**: Suhu kecerahan dalam Kelvin. Nilai tinggi (>330K) indikasi kebakaran aktif
- **confidence**: Tingkat kepercayaan deteksi (low/nominal/high)
- **frp**: Fire Radiative Power dalam Megawatt - ukuran intensitas api
- **acq_date & acq_time**: Kapan satelit mendeteksi hotspot
- **daynight**: Deteksi siang (D) atau malam (N)

## Konfigurasi API Key

Untuk akses unlimited, daftar API key gratis di:
https://firms.modaps.eosdis.nasa.gov/api/

Tambahkan ke `.env`:
```
NASA_FIRMS_MAP_KEY=your_api_key_here
```

Tanpa API key, sistem dibatasi max 10 hari data terkini.

## Cache System

- **Data terkini** (tanpa date range): Cache 1 jam
- **Data time series** (dengan date range): Cache 24 jam
- Cache otomatis untuk mempercepat query berulang

## Keunggulan NASA FIRMS vs BMKG

| Aspek | NASA FIRMS | BMKG (Lama) |
|-------|-----------|-------------|
| Resolusi Spasial | 375m (VIIRS) | ~1km |
| Update Frequency | 3 jam | Harian |
| Time Series | ✅ Full support | ❌ Limited |
| Historical Data | ✅ Sejak 2012 | ⚠️ Terbatas |
| Global Coverage | ✅ Seluruh dunia | 🇮🇩 Indonesia only |
| Data Attributes | 13+ fields | 5 fields |
| API Reliability | ⭐⭐⭐⭐⭐ NASA | ⭐⭐⭐ |

## Catatan Penting

1. **Date Range Limits**: Untuk data historical, gunakan API key untuk akses penuh
2. **Bounding Box**: Jangan terlalu besar untuk menghindari timeout (max ~10° x 10°)
3. **Performance**: Query multi-tahun sebaiknya dibatasi max 5 tahun sekaligus
4. **Confidence Filtering**: Filter hanya "nominal" atau "high" untuk mengurangi false positive

## Troubleshooting

### Error: "No data available"
- Pastikan date range valid (tidak di masa depan)
- Cek bounds tidak di luar coverage area
- VIIRS data tersedia sejak 2012

### Slow Response
- Kurangi bounding box area
- Batasi date range
- Gunakan cache dengan query yang sama

### Rate Limiting
- Daftar API key di NASA FIRMS
- Jangan query terlalu sering (gunakan cache)
