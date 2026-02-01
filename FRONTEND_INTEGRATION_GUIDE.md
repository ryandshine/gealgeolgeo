# 🎨 Frontend Integration Guide: Temporal Status & Grey Area

## Overview

Integrasi temporal status ke frontend untuk menampilkan grey area (perubahan belum terkonfirmasi) dengan opacity styling pada peta.

---

## 📝 Utility Functions (SUDAH SELESAI)

File: [frontend/src/utils/analysisUtils.js](frontend/src/utils/analysisUtils.js)

**Functions yang sudah ditambahkan:**

1. **`getOpacityByTemporalStatus(temporalStatus)`**
   - Input: string status ('stable', 'transition_unconfirmed', 'transition_confirmed', 'reverted_noise')
   - Output: number opacity (0-1)

2. **`getTemporalStatusStyle(temporalStatus)`**
   - Input: string status
   - Output: object {label, description, color, badgeColor, opacity}

3. **`fetchTemporalStatus(historyId, apiUrl)`**
   - Async function untuk fetch temporal status data dari backend
   - Returns: {yearly_data, summary}

4. **`createYearOpacityMap(yearlyData)`**
   - Convert yearly data array → opacity map by year

---

## 🔧 INTEGRASI KE MainLayout.jsx

### STEP 1: Import Functions

Di bagian imports `MainLayout.jsx` (line ~7), tambahkan:

```javascript
import {
    calculateTrends,
    generateVerbalNarrative,
    // 👇 TAMBAH BARIS INI
    fetchTemporalStatus,
    getOpacityByTemporalStatus,
    getTemporalStatusStyle,
    createYearOpacityMap
} from './utils/analysisUtils';
```

---

### STEP 2: Add State untuk Temporal Status

Di bagian state declarations (sekitar line ~300-350), tambahkan:

```javascript
// ✅ TAMBAHKAN DI SETELAH STATE YANG SUDAH ADA
const [temporalStatusData, setTemporalStatusData] = useState(null);
const [yearOpacityMap, setYearOpacityMap] = useState({});
const [showTemporalStatus, setShowTemporalStatus] = useState(true);
```

---

### STEP 3: Fetch Temporal Status Data

Cari di `MainLayout.jsx` tempat dimana `selectedHistory` berubah (ada comment `// When history changes` atau similar).

Tambahkan effect untuk fetch temporal status:

```javascript
// 🔄 Fetch temporal status when history changes
useEffect(() => {
    if (!selectedHistory?.id) {
        setTemporalStatusData(null);
        setYearOpacityMap({});
        return;
    }

    const fetchStatus = async () => {
        console.log(`📅 Fetching temporal status for history ${selectedHistory.id.substring(0, 8)}...`);
        const statusData = await fetchTemporalStatus(selectedHistory.id, API_URL);

        if (statusData) {
            setTemporalStatusData(statusData);
            // Create opacity map for quick lookup
            const opacityMap = createYearOpacityMap(statusData.yearly_data || []);
            setYearOpacityMap(opacityMap);
            console.log('✅ Temporal status loaded:', opacityMap);
        }
    };

    fetchStatus();
}, [selectedHistory?.id]);
```

---

### STEP 4: Calculate Dynamic Opacity

Setelah fetch temporal status, hitung opacity untuk selected year:

```javascript
// 📊 Calculate current layer opacity based on temporal status
const layerOpacity = useMemo(() => {
    if (!showTemporalStatus || !yearOpacityMap) {
        return polygonOpacity; // Use original opacity if temporal status disabled
    }

    const yearOpacity = yearOpacityMap[selectedYear];
    if (yearOpacity !== undefined) {
        // Blend dengan polygonOpacity slider: use whichever is lower
        return Math.min(yearOpacity, polygonOpacity);
    }

    return polygonOpacity;
}, [selectedYear, yearOpacityMap, polygonOpacity, showTemporalStatus]);
```

---

### STEP 5: Update DynamicTileLayer

Cari di MainLayout.jsx dimana `DynamicTileLayer` dirender untuk mapUrl (sekitar line ~1884):

**GANTI:**
```javascript
{mapUrl && (
    <DynamicTileLayer
        url={mapUrl}
        show={showOverlay}
        opacity={polygonOpacity}  // ❌ LAMA
        zIndex={205}
    />
)}
```

**DENGAN:**
```javascript
{mapUrl && (
    <DynamicTileLayer
        url={mapUrl}
        show={showOverlay}
        opacity={layerOpacity}  // ✅ BARU - Dynamic based on temporal status
        zIndex={205}
    />
)}
```

---

### STEP 6: Add UI Toggle untuk Temporal Status

Cari di MainLayout.jsx bagian UI controls (biasanya di panel kanan, sekitar line ~1400-1600).

Cari bagian layer toggles (ada `showOverlay`, `showSlopeLayer`, dll) dan tambahkan:

```javascript
{/* 🔄 Temporal Status Toggle */}
<div className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg border border-amber-100">
    <label className="flex items-center gap-2 cursor-pointer flex-1">
        <input
            type="checkbox"
            checked={showTemporalStatus}
            onChange={(e) => setShowTemporalStatus(e.target.checked)}
            className="rounded"
        />
        <span className="text-sm font-medium text-amber-900">
            Tampilkan Status Temporal
        </span>
    </label>
    <span className="text-[10px] px-2 py-0.5 bg-amber-200 text-amber-800 rounded font-bold">
        GREY AREA
    </span>
</div>
```

---

### STEP 7: Add Info Panel untuk Temporal Status

Tambahkan component untuk menampilkan temporal status info untuk year yang dipilih:

```javascript
{/* 📋 Temporal Status Info */}
{temporalStatusData && selectedYear && (
    (() => {
        const yearData = temporalStatusData.yearly_data?.find(d => d.year === selectedYear);
        if (!yearData) return null;

        const statusStyle = getTemporalStatusStyle(yearData.temporal_status);
        const opacity = getOpacityByTemporalStatus(yearData.temporal_status);

        return (
            <div className="mt-3 p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200">
                <div className="flex items-start gap-2">
                    <div className={`px-2 py-1 rounded text-[9px] font-bold whitespace-nowrap ${statusStyle.badgeColor}`}>
                        {statusStyle.label}
                    </div>
                    <div className="text-[10px] text-slate-600 leading-relaxed">
                        <p className="font-medium text-slate-700">{statusStyle.description}</p>
                        <p className="mt-1 text-[9px] text-slate-500">
                            Opacity: <span className="font-bold">{(opacity * 100).toFixed(0)}%</span>
                        </p>
                    </div>
                </div>
            </div>
        );
    })()
)}
```

---

## 🎨 Legend Update (OPSIONAL)

Untuk menambahkan info temporal status di legend, tambahkan di komponen Legend:

```javascript
{/* Temporal Status Legend */}
{showTemporalStatus && (
    <div className="mt-4 pt-4 border-t border-slate-200">
        <div className="text-[10px] font-bold text-amber-700 mb-2 uppercase tracking-tight">
            Status Perubahan Tutupan
        </div>
        <div className="flex flex-col gap-2">
            {[
                { status: 'stable', label: 'Stabil', opacity: 1.0 },
                { status: 'transition_confirmed', label: 'Terkonfirmasi', opacity: 1.0 },
                { status: 'transition_unconfirmed', label: 'Belum Terkonfirmasi (Grey Area)', opacity: 0.5 },
                { status: 'reverted_noise', label: 'Noise/Musiman', opacity: 0.3 }
            ].map(item => {
                const style = getTemporalStatusStyle(item.status);
                return (
                    <div key={item.status} className="flex items-center gap-2">
                        <div
                            className="w-4 h-4 rounded-sm"
                            style={{
                                backgroundColor: style.color,
                                opacity: item.opacity,
                                border: '1px solid rgba(0,0,0,0.2)'
                            }}
                        />
                        <span className="text-[10px] text-slate-600">{item.label}</span>
                    </div>
                );
            })}
        </div>
    </div>
)}
```

---

## 🧪 Testing Checklist

- [ ] Utility functions berhasil di-import
- [ ] State variables initialized
- [ ] Temporal status data di-fetch saat history berubah
- [ ] Opacity map di-calculate dengan benar
- [ ] DynamicTileLayer menggunakan `layerOpacity` dinamis
- [ ] Toggle untuk temporal status muncul di UI
- [ ] Info panel menampilkan status yang benar
- [ ] Legend menampilkan temporal status indicators
- [ ] Saat year berubah, opacity berubah sesuai status

---

## 📊 Expected Behavior

**Saat User Pilih Tahun dengan Status:**

1. **`temporal_status: 'stable'`** atau **`'transition_confirmed'`**
   - Layer opacity = 100% (solid)
   - Badge: ✅ Stabil atau Terkonfirmasi

2. **`temporal_status: 'transition_unconfirmed'`** (GREY AREA)
   - Layer opacity = 50% (faded)
   - Badge: ⚠️ Perubahan Belum Terkonfirmasi
   - Tooltip: "Tutupan lahan terdeteksi berubah, namun belum dikonfirmasi secara temporal"

3. **`temporal_status: 'reverted_noise'`**
   - Layer opacity = 30% (very faded)
   - Badge: 🔇 Noise/Musiman

---

## 🔗 Related Files

- Backend endpoint: `GET /history/{history_id}/temporal-status`
- Utility functions: [utils/analysisUtils.js](utils/analysisUtils.js)
- Map component: [MapComponents.jsx](MapComponents.jsx) (DynamicTileLayer)
- Main layout: [MainLayout.jsx](MainLayout.jsx)

---

## 💡 Notes

- Temporal status calculation sudah otomatis di backend saat history disave
- Kalau data lama belum punya temporal status, bisa trigger manual via:
  ```bash
  curl -X POST http://localhost:8000/history/{history_id}/calculate-temporal-status
  ```
- Opacity bisa di-blend dengan slider `polygonOpacity` sesuai preference
