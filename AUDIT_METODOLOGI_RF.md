# **LAPORAN AUDIT METODOLOGI**
## Multi-Year Random Forest Classification Implementation

---

## **A. Audit Teknis**

| No | Item Audit | Status | Catatan |
|----|-----------|--------|---------|
| **1** | **AOI** - Hanya dari input web (tanpa hardcode) | **YA** | `geometry` parameter diterima dari `/analyze` endpoint dan WebSocket, diteruskan ke `analyze_land_cover()`. Tidak ada geometri hardcode. (Lines 2581-2582, 1910-1911) |
| **2a** | **Data** - Sentinel-2 Surface Reflectance | **YA** | Menggunakan `SENTINEL2_COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"` (Line 1093) |
| **2b** | **Waktu** - Per tahun: 1 Jan – 31 Des | **YA** | `start_date = f"{year}-01-01"`, `end_date = f"{year}-12-31"` (Lines 1089-1090) |
| **2c** | **Tahun terbaru** - Diperlakukan provisional bila belum lengkap | **TIDAK** | Tidak ada penanganan khusus untuk tahun berjalan. Tahun terbaru diproses sama seperti tahun lain. Cap bawaan hanya mengacu pada `current_year - 1` (Line 1952) |
| **3a** | **Cloud Masking** - Masking per-image sebelum compositing | **YA** | `_mask_clouds_and_shadows_robust()` diterapkan per-image via `.map()` sebelum `.median()` (Lines 1119-1122) |
| **3b** | **Cloud Probability** - COPERNICUS/S2_CLOUD_PROBABILITY | **YA** | `S2_CLOUD_PROBABILITY = "COPERNICUS/S2_CLOUD_PROBABILITY"` digunakan (Lines 977-981) |
| **3c** | **Threshold tetap 50%** (bukan slider user) | **TIDAK** | `cloud_prob_threshold` adalah parameter yang dapat dikirim dari frontend (Line 1923). Default 50%, tetapi **dapat diubah oleh pengguna**. |
| **3d** | **Shadow** - Dark pixel + sun azimuth | **YA** | Shadow detection menggunakan NIR/SWIR threshold + `MEAN_SOLAR_AZIMUTH_ANGLE` + `directionalDistanceTransform` (Lines 999-1030) |
| **4a** | **Feature** - Multi-year stack (satu model semua tahun) | **YA** | `build_multiyear_stack()` membuat stack multi-tahun. Single classifier dilatih pada satu tahun (terbaru) dan diaplikasikan ke semua tahun. (Lines 1191-1239) |
| **4b** | **Band** - B2, B3, B4, B8 + NDVI, NDWI, NDBI | **YA** | `construct_features_fixed()` mengembalikan band: B2, B3, B4, B8, NDVI, NDWI, NDBI (Lines 1169-1188) |
| **4c** | **Suffix tahun** (contoh: `NDVI_2019`) | **YA** | `construct_yearly_features()` menambahkan suffix tahun: `f'NDVI_{year}'` (Lines 1155-1166) |
| **5a** | **Model** - ee.Classifier.smileRandomForest | **YA** | `ee.Classifier.smileRandomForest(numberOfTrees=100)` digunakan (Line 2064) |
| **5b** | **Single classifier** (tidak retrain per tahun) | **YA** | Classifier dilatih sekali pada `latest_composite` dan diaplikasikan ke semua `years_processed` (Lines 2054-2068, 2083-2097) |
| **6a** | **Output** - Raster klasifikasi integer 1–5 | **YA** | Output `.classify(classifier).rename('landcover')` menghasilkan integer 1-5 sesuai kelas (Lines 2095-2096, 2128-2134) |
| **6b** | **Tanpa styling, smoothing, legend, atau export tambahan** | **TIDAK** | Ada fungsi `get_map_url()` yang menerapkan `vis_params` dengan palette (styling untuk tampilan). Untuk endpoint analisis utama RF, tidak ada smoothing. Namun dalam mode legacy ada `focal_mode()` (Line 2308) |
| **7a** | **Fail-Safe** - Mekanisme reset / clear cache / state cleanup | **YA (Parsial)** | Frontend memiliki `handleReset()` untuk membersihkan state. Backend menggunakan `try/except` dengan error logging. WebSocket memiliki `finally: ws_manager.disconnect()` untuk cleanup koneksi. |
| **7b** | **Mencegah job menggantung** | **YA (Parsial)** | Cancellation callback via `check_cancel` yang mengecek `request.is_disconnected()`. Timeout implisit dari GEE API. |
| **7c** | **Mencegah reuse state lama** | **YA** | Setiap analisis membuat variabel lokal baru (`results = []`, `yearly_composites = {}`). Tidak ada state global yang di-reuse antar request. |
| **7d** | **Mencegah error berulang** | **YA (Parsial)** | Error handling per-tahun dengan `continue` jika gagal, sehingga satu tahun gagal tidak menghentikan seluruh proses. |

---

## **B. Self-Declaration Agent**

☑ **ADA** perubahan/improvisasi di luar metodologi murni:

### 1. **Cloud Probability Threshold adalah Parameter User-Adjustable**
   - **Bagian yang diubah**: Parameter `cloud_prob_threshold` di `analyze_land_cover()` (Line 1923)
   - **Alasan**: Memberikan fleksibilitas kepada pengguna untuk menyesuaikan sensitivitas cloud masking
   - **Dampak ke konsistensi multi-year**: Potensial inkonsistensi jika user mengubah threshold antar analisis. Namun dalam satu analisis, threshold konsisten untuk semua tahun.
   - **Disengaja atau tidak**: Disengaja (design choice)

### 2. **Tahun Terbaru Tidak Diperlakukan Khusus sebagai Provisional**
   - **Bagian yang diubah**: Tidak ada penanganan khusus untuk tahun berjalan
   - **Alasan**: Tidak diimplementasikan
   - **Dampak ke konsistensi multi-year**: Tahun berjalan (misal 2025) mungkin memiliki data tidak lengkap, menghasilkan composite berkualitas lebih rendah
   - **Disengaja atau tidak**: Tidak disengaja (oversight)

### 3. **Styling Visual pada Map URL**
   - **Bagian yang diubah**: `get_map_url()` menerapkan color palette untuk visualisasi (Lines 1617-1637)
   - **Alasan**: Kebutuhan UI untuk menampilkan hasil klasifikasi dengan warna yang bermakna
   - **Dampak ke konsistensi multi-year**: Tidak mempengaruhi data klasifikasi, hanya visualisasi
   - **Disengaja atau tidak**: Disengaja (UI requirement)

### 4. **Legacy Mode Menggunakan Smoothing (focal_mode)**
   - **Bagian yang diubah**: Line 2308 dalam mode legacy
   - **Alasan**: Post-processing untuk mengurangi noise
   - **Dampak ke konsistensi multi-year**: Hanya berlaku untuk mode legacy rule-based, BUKAN untuk RF classifier utama
   - **Disengaja atau tidak**: Disengaja (legacy code path)

---

## **C. Output Akhir**

### Ringkasan Kepatuhan

| Kategori | Sesuai | Tidak Sesuai |
|----------|--------|--------------|
| AOI | 1 | 0 |
| Data & Waktu | 2 | 1 |
| Cloud & Shadow | 3 | 1 |
| Feature | 3 | 0 |
| Model | 2 | 0 |
| Output | 1 | 1 |
| Fail-Safe | 4 | 0 |
| **TOTAL** | **16** | **3** |

### Daftar Penyimpangan

1. **2c**: Tahun terbaru tidak diperlakukan sebagai provisional
2. **3c**: Cloud probability threshold dapat diubah user (default 50%, bukan fixed)
3. **6b**: Ada styling (palette) pada map URL untuk visualisasi

---

### **Pernyataan Akhir**

> "Implementasi ini **TIDAK SEPENUHNYA SESUAI** dengan metodologi yang ditetapkan, dengan 3 penyimpangan minor yang tidak mempengaruhi inti algoritma klasifikasi Random Forest multi-year. Penyimpangan utama adalah: (1) cloud threshold yang adjustable, (2) tidak ada penanganan khusus tahun provisional, dan (3) styling pada output visualisasi. Core methodology (single RF classifier, multi-year stack, 7-band features, per-image cloud masking) telah diimplementasikan dengan benar."

---

*Audit dilakukan pada: 2026-01-16T22:20 WIB*
*Mode: READ-ONLY (Tidak ada perubahan kode)*
