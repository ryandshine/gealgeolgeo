# 🔧 MainLayout.jsx Implementation: Ready-to-Copy Code

## Overview
Step-by-step guide dengan code snippets yang ready untuk di-copy-paste ke MainLayout.jsx

---

## STEP 1: Import Temporal Status Functions
**File:** `frontend/src/MainLayout.jsx`
**Line:** ~7 (di bagian imports)

### Find:
```javascript
import {
    calculateTrends,
    generateVerbalNarrative
} from './utils/analysisUtils';
```

### Replace With:
```javascript
import {
    calculateTrends,
    generateVerbalNarrative,
    fetchTemporalStatus,          // ✅ ADD
    getOpacityByTemporalStatus,   // ✅ ADD
    getTemporalStatusStyle,       // ✅ ADD
    createYearOpacityMap          // ✅ ADD
} from './utils/analysisUtils';
```

---

## STEP 2: Add State Variables
**File:** `frontend/src/MainLayout.jsx`
**Line:** ~300-350 (cari bagian state declarations, setelah state lainnya seperti `vectorLayerData`, `mapUrl`, dll)

### Add SETELAH state lain:
```javascript
    // 🔄 TEMPORAL STATUS STATES (NEW)
    const [temporalStatusData, setTemporalStatusData] = useState(null);
    const [yearOpacityMap, setYearOpacityMap] = useState({});
    const [showTemporalStatus, setShowTemporalStatus] = useState(true);
    // END TEMPORAL STATUS STATES
```

---

## STEP 3: Add useEffect untuk Fetch Temporal Status
**File:** `frontend/src/MainLayout.jsx`
**Line:** ~400-500 (cari bagian dimana ada effects untuk data/selectedHistory)

### Add SETELAH useEffect yang existing:
```javascript
    // 🔄 FETCH TEMPORAL STATUS WHEN HISTORY CHANGES (NEW)
    useEffect(() => {
        if (!selectedHistory?.id) {
            setTemporalStatusData(null);
            setYearOpacityMap({});
            return;
        }

        const fetchStatus = async () => {
            console.log(`📅 Fetching temporal status for history ${selectedHistory.id.substring(0, 8)}...`);
            try {
                const statusData = await fetchTemporalStatus(selectedHistory.id, API_URL);

                if (statusData) {
                    setTemporalStatusData(statusData);
                    // Create opacity map for quick lookup
                    const opacityMap = createYearOpacityMap(statusData.yearly_data || []);
                    setYearOpacityMap(opacityMap);
                    console.log('✅ Temporal status loaded:', opacityMap);
                } else {
                    console.log('⚠️ No temporal status data found');
                    setTemporalStatusData(null);
                    setYearOpacityMap({});
                }
            } catch (error) {
                console.error('Error fetching temporal status:', error);
                setTemporalStatusData(null);
                setYearOpacityMap({});
            }
        };

        fetchStatus();
    }, [selectedHistory?.id]);
    // END FETCH TEMPORAL STATUS
```

---

## STEP 4: Calculate Dynamic Layer Opacity
**File:** `frontend/src/MainLayout.jsx`
**Line:** ~500-600 (cari bagian useMemo, setelah perhitungan lain)

### Add SETELAH useMemo yang existing:
```javascript
    // 📊 CALCULATE DYNAMIC OPACITY BASED ON TEMPORAL STATUS (NEW)
    const layerOpacity = useMemo(() => {
        if (!showTemporalStatus || !yearOpacityMap || Object.keys(yearOpacityMap).length === 0) {
            // If temporal status disabled or no data, use original polygonOpacity
            return polygonOpacity;
        }

        const yearOpacity = yearOpacityMap[selectedYear];
        if (yearOpacity !== undefined) {
            // Use temporal status opacity, but respect slider if it's lower
            return Math.min(yearOpacity, polygonOpacity);
        }

        // Fallback to original opacity if year not found
        return polygonOpacity;
    }, [selectedYear, yearOpacityMap, polygonOpacity, showTemporalStatus]);
    // END DYNAMIC OPACITY CALCULATION
```

---

## STEP 5: Update DynamicTileLayer Component
**File:** `frontend/src/MainLayout.jsx`
**Line:** ~1884 (search for `{mapUrl && (`)

### Find:
```javascript
                                {mapUrl && (
                                    <DynamicTileLayer
                                        url={mapUrl}
                                        show={showOverlay}
                                        opacity={polygonOpacity}
                                        zIndex={205}
                                    />
                                )}
```

### Replace With:
```javascript
                                {mapUrl && (
                                    <DynamicTileLayer
                                        url={mapUrl}
                                        show={showOverlay}
                                        opacity={layerOpacity}
                                        zIndex={205}
                                    />
                                )}
```

---

## STEP 6: Add UI Toggle untuk Temporal Status
**File:** `frontend/src/MainLayout.jsx`
**Line:** ~1400-1600 (cari bagian UI controls, biasanya sebelum `showOverlay`, `showSlopeLayer`, dll toggles)

### Find section dengan toggle controls (contoh):
```javascript
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showOverlay}
                                ...
                            />
```

### Add SEBELUM atau SETELAH toggles yang ada:
```javascript
                        {/* 🔄 TEMPORAL STATUS TOGGLE (NEW) */}
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
                        {/* END TEMPORAL STATUS TOGGLE */}
```

---

## STEP 7: Add Info Panel untuk Temporal Status
**File:** `frontend/src/MainLayout.jsx`
**Line:** ~1550-1600 (cari bagian dimana `yearStats` ditampilkan)

### Find section dengan year statistics (contoh):
```javascript
                            {yearStats && (
                                <div>
                                    {yearStats.stats...
```

### Add SETELAH atau DALAM section yearStats:
```javascript
                        {/* 📋 TEMPORAL STATUS INFO PANEL (NEW) */}
                        {temporalStatusData && selectedYear && (() => {
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
                                                Opacity Peta: <span className="font-bold">{(opacity * 100).toFixed(0)}%</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                        {/* END TEMPORAL STATUS INFO PANEL */}
```

---

## STEP 8 (OPSIONAL): Add Legend untuk Temporal Status
**File:** `frontend/src/MainLayout.jsx`
**Line:** ~200-250 (cari function atau component bernama `Legend` atau `SigapLegend`)

### Add DALAM atau SETELAH legend section yang ada:
```javascript
            {/* 🎨 TEMPORAL STATUS LEGEND (OPSIONAL) */}
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
            {/* END TEMPORAL STATUS LEGEND */}
```

---

## 🧪 Testing Checklist Setelah Implementation

Cek ini untuk memastikan semua berfungsi:

- [ ] **STEP 1**: Imports berhasil, tidak ada error di console
- [ ] **STEP 2**: States initialized (buka DevTools → React tab → MainLayout)
- [ ] **STEP 3**: useEffect berjalan saat history berubah (lihat console log 📅)
- [ ] **STEP 4**: useMemo terdefinisi dengan benar
- [ ] **STEP 5**: DynamicTileLayer menggunakan `layerOpacity` (cek di React DevTools props)
- [ ] **STEP 6**: Toggle checkbox muncul di UI
- [ ] **STEP 7**: Info panel muncul saat pilih tahun
- [ ] **STEP 8** (opsional): Legend menampilkan temporal status indicators

---

## 📊 Expected Output Setelah Implementation

### Console Output (saat history berubah):
```
📅 Fetching temporal status for history d0544d68...
✅ Temporal status loaded: {
    2024: 1,
    2025: 0.5
}
```

### UI Changes:
1. **Toggle checkbox** muncul di control panel dengan label "Tampilkan Status Temporal"
2. **Info panel** muncul saat pilih tahun, menampilkan:
   - Badge status (Stabil / Terkonfirmasi / Belum Terkonfirmasi / Noise)
   - Deskripsi status
   - Opacity percentage
3. **Map layer opacity** berubah saat:
   - User ubah selected year
   - User toggle "Tampilkan Status Temporal"

---

## 🔍 Debugging Tips

Jika ada error:

### Error: "fetchTemporalStatus is not defined"
→ Pastikan STEP 1 (imports) sudah dilakukan

### Error: "layerOpacity is not defined"
→ Pastikan STEP 4 (useMemo) sudah ditambahkan

### Layer tidak berubah opacity saat year berubah
→ Pastikan STEP 5 (update DynamicTileLayer) menggunakan `layerOpacity` bukan `polygonOpacity`

### Console shows "No temporal status data found"
→ Data lama belum ter-update, trigger manual:
```bash
curl -X POST http://localhost:8000/history/{history_id}/calculate-temporal-status
```

---

## 🎯 Before & After Comparison

### BEFORE Implementation:
```
User upload GeoJSON
↓
Year 2024: Opacity 100% (no info)
Year 2025: Opacity 100% (no info)
↓
User tidak tahu kelas mana yang stabil/berubah
```

### AFTER Implementation:
```
User upload GeoJSON
↓
Backend auto-calculate temporal status
↓
Frontend fetch & display:
  Year 2024: Opacity 100% ✅ (STABLE)
  Year 2025: Opacity 50% ⚠️ (TRANSITION_UNCONFIRMED - Grey Area)
↓
User bisa lihat info detail di info panel
↓
User paham mana yang terkonfirmasi vs belum terkonfirmasi
```

---

## 📝 Notes

- **Spatial**: Semua file paths sudah sesuai dengan struktur project Anda
- **Copy-Paste Ready**: Semua code snippet bisa langsung di-copy tanpa perlu edit
- **Backward Compatible**: Implementasi ini tidak merusak functionality yang sudah ada
- **Auto Calculation**: Backend sudah handle temporal status calculation otomatis

---

Siap untuk mulai copy-paste? Mulai dari STEP 1! 🚀
