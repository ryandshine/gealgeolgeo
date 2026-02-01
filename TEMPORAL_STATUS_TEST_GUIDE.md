# Temporal Status Testing Guide
**Complete Testing Procedure untuk Temporal Status Feature**

---

## Test Data Overview

**File:** `test_data_temporal_status_synthetic.geojson`

**Scenario:** Deforestation dengan Grey Area Detection

### Timeline:
```
2021: Hutan Sekunder (dominan 180.2 ha)
  ↓ STABLE
2022: Hutan Sekunder (dominan 182.1 ha)
  ↓ PERUBAHAN BESAR!
2023: Tanah Kosong (dominan 98.5 ha) ← GREY AREA
  ↓ PERUBAHAN BERLANJUT
2024: Tanah Kosong (dominan 155.2 ha) ← CONFIRMED
```

### Expected Results:

| Year | Dominant Class | Expected Status | Expected Opacity | Meaning |
|------|---|---|---|---|
| 2021 | hutan_sekunder | stable | 100% | Baseline |
| 2022 | hutan_sekunder | stable | 100% | No change |
| 2023 | tanah_kosong | **transition_unconfirmed** | **50%** | 🟡 GREY AREA |
| 2024 | tanah_kosong | transition_confirmed | 100% | Confirmed change |

---

## STEP 1: Upload Test Data to Application

### Option A: Via Web UI
1. Open application in browser
2. Navigate to upload/analyze section
3. Upload file: `test_data_temporal_status_synthetic.geojson`
4. Wait for analysis to complete

### Option B: Via API (cURL)
```bash
curl -X POST "http://localhost:8000/analyze" \
  -H "Content-Type: application/json" \
  -d @test_data_temporal_status_synthetic.geojson
```

### Expected Response:
```json
{
  "status": "success",
  "history_id": "550e8400-e29b-41d4-a716-446655440000",
  "data": [
    {
      "year": 2021,
      "dominant_class": "hutan_sekunder",
      "temporal_status": "stable",
      "deforestation_ha": 0.0,
      ...
    },
    ...
  ]
}
```

---

## STEP 2: Verify Database - Check Temporal Status Values

### Query 1: Check all years for this history
```sql
SELECT
    year,
    dominant_class,
    temporal_status,
    hutan_sekunder,
    tanah_kosong,
    deforestation_ha,
    reforestation_ha
FROM analysis_yearly_data
WHERE history_id = '{YOUR_HISTORY_ID}'
ORDER BY year;
```

### Expected Output:
```
year │ dominant_class │ temporal_status         │ hutan_sekunder │ tanah_kosong │ deforestation_ha
─────┼────────────────┼─────────────────────────┼────────────────┼──────────────┼────────────────
2021 │ hutan_sekunder │ stable                  │ 180.2          │ 8.5          │ 0.0
2022 │ hutan_sekunder │ stable                  │ 182.1          │ 9.2          │ 1.2
2023 │ tanah_kosong   │ transition_unconfirmed  │ 68.9           │ 98.5         │ 98.5  ← GREY AREA!
2024 │ tanah_kosong   │ transition_confirmed    │ 52.3           │ 155.2        │ 18.5
```

### Verification Checklist:
- [ ] Year 2021: temporal_status = `stable`
- [ ] Year 2022: temporal_status = `stable`
- [ ] Year 2023: temporal_status = `transition_unconfirmed` ← **GREY AREA**
- [ ] Year 2024: temporal_status = `transition_confirmed`
- [ ] dominant_class values match expected
- [ ] deforestation_ha values match expected

---

## STEP 3: Test API Endpoint - GET /history/{id}/temporal-status

### API Call:
```bash
curl -X GET "http://localhost:8000/history/{YOUR_HISTORY_ID}/temporal-status"
```

### Expected Response:
```json
{
  "status": "success",
  "history_id": "550e8400-e29b-41d4-a716-446655440000",
  "yearly_data": [
    {
      "year": 2021,
      "dominant_class": "hutan_sekunder",
      "temporal_status": "stable",
      "hutan_primer": 45.5,
      "hutan_sekunder": 180.2,
      "tanah_kering": 15.3,
      "tanah_kosong": 8.5,
      "lahan_terbangun": 12.1,
      "air": 22.8
    },
    {
      "year": 2022,
      "dominant_class": "hutan_sekunder",
      "temporal_status": "stable",
      ...
    },
    {
      "year": 2023,
      "dominant_class": "tanah_kosong",
      "temporal_status": "transition_unconfirmed",
      ...
    },
    {
      "year": 2024,
      "dominant_class": "tanah_kosong",
      "temporal_status": "transition_confirmed",
      ...
    }
  ],
  "summary": {
    "total_years": 4,
    "status_counts": {
      "stable": 2,
      "transition_unconfirmed": 1,
      "transition_confirmed": 1,
      "reverted_noise": 0
    },
    "grey_area_years": [2023]
  }
}
```

### Verification Checklist:
- [ ] status_counts.stable = 2
- [ ] status_counts.transition_unconfirmed = 1
- [ ] status_counts.transition_confirmed = 1
- [ ] grey_area_years = [2023]
- [ ] API responds without errors
- [ ] All yearly data included in response

---

## STEP 4: Test Frontend - Layer Menu Legend

### Visual Check:
1. Open application in browser
2. Select the test history record
3. Look at **Layer Menu** (left side panel)

### Verify:
- [ ] "Status Temporal" section visible in layer menu
- [ ] "GREY AREA" badge displayed with amber color
- [ ] Legend shows 4 categories:
  - [ ] Stabil (Stable) - Emerald color, 100% opacity
  - [ ] Terkonfirmasi (Confirmed) - Amber color, 100% opacity
  - [ ] Belum Terkonfirmasi (Grey Area) - Lime color, **50% opacity** ← Key one!
  - [ ] Noise/Musiman (Seasonal) - Gray color, 30% opacity

### Expected Visual:
```
┌─────────────────────────────────┐
│ Layer & Legenda                 │
├─────────────────────────────────┤
│ ...                             │
│                                 │
│ STATUS TEMPORAL [GREY AREA]     │ ← Header with badge
│                                 │
│ ■ Stabil (100% opaque)          │
│ ■ Terkonfirmasi (100% opaque)   │
│ ░ Belum Terkonfirmasi (50%)  ← FADING │
│ · Noise/Musiman (30% opaque)    │
│                                 │
└─────────────────────────────────┘
```

---

## STEP 5: Test Frontend - Opacity Changes on Year Selection

### Visual Check:
1. Keep layer menu visible
2. Navigate to year selector/slider
3. Select different years one by one
4. Observe polygon opacity on map changing

### Test Sequence:
```
Select Year 2021:
  Polygon should show: 100% opacity (solid color)
  → Status STABLE

Select Year 2022:
  Polygon should show: 100% opacity (solid color)
  → Status STABLE

Select Year 2023:
  Polygon should show: 50% opacity (FADING/GREY)
  → Status TRANSITION_UNCONFIRMED (GREY AREA!)
  ⚠️ This is the KEY test!

Select Year 2024:
  Polygon should show: 100% opacity (solid color)
  → Status TRANSITION_CONFIRMED
```

### Verification Checklist:
- [ ] Year 2021: Polygon at 100% opacity
- [ ] Year 2022: Polygon at 100% opacity
- [ ] **Year 2023: Polygon at 50% opacity** ← CRITICAL!
- [ ] Year 2024: Polygon at 100% opacity
- [ ] Opacity changes smoothly when switching years
- [ ] No console errors

### Expected Result:
When you select year 2023, the polygon should become noticeably **fading/grey**, visually indicating "this is a grey area that needs monitoring". This is the core feature working!

---

## STEP 6: Test Frontend - Toggle Switch

### Test Toggle ON/OFF:
1. Find "Status Temporal" toggle in layer menu (or sidebar)
2. Toggle ON (enabled)
   - Observe: Opacity controlled by temporal status ✓
3. Toggle OFF (disabled)
   - Observe: Opacity controlled by manual slider instead
4. Toggle ON again
   - Observe: Opacity back to temporal status control

### Verification Checklist:
- [ ] When ON: Opacity follows temporal_status values (year 2023 = 50%)
- [ ] When OFF: Opacity follows manual slider
- [ ] Toggle switches smoothly between modes
- [ ] No visual glitches
- [ ] No console errors

---

## STEP 7: Test Backend - Verify Automatic Calculation

### Check Backend Logs:
1. Look at backend console/logs when data was uploaded
2. Search for log messages related to temporal status calculation

### Expected Log Messages:
```
[INFO] Fetching yearly data for history: 550e8400-e29b-41d4-a716-446655440000
[INFO] Processing 4 years of temporal status data...
[INFO] Year 2021: prev_class=None, current=hutan_sekunder, next=hutan_sekunder → STABLE
[INFO] Year 2022: prev_class=hutan_sekunder, current=hutan_sekunder, next=tanah_kosong → STABLE
[INFO] Year 2023: prev_class=hutan_sekunder, current=tanah_kosong, next=tanah_kosong → TRANSITION_CONFIRMED
[INFO] Year 2024: prev_class=tanah_kosong, current=tanah_kosong, next=None → STABLE
[INFO] ✓ Temporal status update complete
```

### Verification Checklist:
- [ ] Background task was triggered
- [ ] All 4 years processed
- [ ] Correct temporal status calculated for each year
- [ ] No errors in logs

---

## STEP 8: Test Backend - Test Manual Calculation Endpoint

### API Call (if needed to recalculate):
```bash
curl -X POST "http://localhost:8000/history/{YOUR_HISTORY_ID}/calculate-temporal-status"
```

### Expected Response:
```json
{
  "status": "success",
  "message": "Temporal status calculation triggered for history {id}",
  "history_id": "..."
}
```

---

## STEP 9: Comprehensive Scenario Testing

### Scenario A: Monitor Grey Area Evolution
**If you later add Year 2025 data:**

**Case 1: Year 2025 = Tanah Kosong (continues)**
```sql
UPDATE analysis_yearly_data
SET hutan_sekunder = 45.0, tanah_kosong = 185.2
WHERE history_id = '{id}' AND year = 2025;

-- Re-calculate
POST /history/{id}/calculate-temporal-status
```

**Expected after Year 2025 added:**
```
Year 2023: temporal_status = TRANSITION_CONFIRMED (not grey area anymore!)
           opacity = 100% (was 50%, now solid)
Year 2024: temporal_status = STABLE
Year 2025: temporal_status = STABLE
```

**Case 2: Year 2025 = Kembali ke Hutan Sekunder (reverts)**
```
Year 2023: temporal_status = REVERTED_NOISE
           opacity = 30% (very fading - noise/artifact)
Year 2024: temporal_status = STABLE
Year 2025: temporal_status = STABLE (hutan sekunder kembali)
```

### Test Verification:
- [ ] System correctly updates temporal_status when new data added
- [ ] Status transitions work as expected
- [ ] Opacity updates reflect the new status
- [ ] UI re-renders with new opacities

---

## STEP 10: Error Handling & Edge Cases

### Test 1: Single Year Data
Upload analysis with only 1 year:
- Expected: Status should be STABLE (no prev to compare)

### Test 2: Missing Data for a Year
If one year has NULL values:
- Expected: System handles gracefully, defaults to STABLE

### Test 3: All Classes Equal
If all 6 classes have same area:
- Expected: get_dominant_class() returns one (implementation-specific)

---

## Final Verification Checklist

### Backend ✓
- [ ] Database columns exist (temporal_status, dominant_class)
- [ ] Indexes created for performance
- [ ] SQL function get_dominant_class() works
- [ ] Background task triggers on upload
- [ ] API endpoints return correct data
- [ ] Temporal status calculated correctly

### Frontend ✓
- [ ] Legend displays in layer menu
- [ ] "GREY AREA" badge visible
- [ ] 4 status categories shown with correct colors
- [ ] Opacity values correct (100%, 50%, 30%)
- [ ] Opacity changes on year selection
- [ ] Toggle switches between temporal and manual control
- [ ] No console errors
- [ ] Visual feedback clear (grey area is visually distinct)

### Data ✓
- [ ] temporal_status values match expected
- [ ] dominant_class values correct
- [ ] deforestation_ha calculated correctly (unaffected by temporal status)
- [ ] reforestation_ha calculated correctly

---

## Success Criteria

**Implementation is SUCCESSFUL when:**

1. ✅ Test data uploads without errors
2. ✅ Database has correct temporal_status values (especially 2023 = transition_unconfirmed)
3. ✅ API endpoint returns temporal status data
4. ✅ Frontend legend displays with 4 categories
5. ✅ Year 2023 shows 50% opacity on map (GREY AREA visually distinct)
6. ✅ Toggle works to switch between temporal and manual opacity
7. ✅ No errors in browser console or backend logs
8. ✅ Deforestation values unchanged (temporal status doesn't filter metrics)

**If all above are ✅, then Temporal Status feature is FULLY WORKING!**

---

## Troubleshooting

### Issue: Temporal status all showing "stable"
**Solution:** Check if calculation was triggered. Verify backend logs. May need to manually trigger calculation.

### Issue: Year 2023 showing 100% opacity instead of 50%
**Solution:**
- Check database: `SELECT temporal_status FROM analysis_yearly_data WHERE year=2023`
- Check frontend opacity mapping is applied
- Check showTemporalStatus toggle is ON

### Issue: Legend not showing
**Solution:**
- Check showTemporalStatus state in code (should be true)
- Check temporalStatusData is not null
- Open browser console for errors

### Issue: Database columns not found
**Solution:**
- Re-run migration SQL
- Verify migration executed successfully
- Check column names are exact (temporal_status, dominant_class)

---

## Next Steps After Successful Testing

1. ✅ Update DEPLOYMENT_CHECKLIST.md (mark as deployed)
2. ✅ Create production migration script
3. ✅ Document any issues found
4. ✅ Consider adding automated tests
5. ✅ Plan user documentation/training

---

**Good luck with testing! Report any issues found.** 🚀
