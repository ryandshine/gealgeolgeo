# TEMPORAL STATUS DOCUMENTATION
**Dokumentasi Lengkap Status Temporal dalam Sistem Analisis Perubahan Tutupan Lahan**

---

## DAFTAR ISI
1. [Pendahuluan](#pendahuluan)
2. [Definisi & Konsep](#definisi--konsep)
3. [Empat Kategori Status Temporal](#empat-kategori-status-temporal)
4. [Bagaimana Status Ditentukan](#bagaimana-status-ditentukan)
5. [Struktur Data Database](#struktur-data-database)
6. [Pengaruh Terhadap Deforestasi/Reforestasi](#pengaruh-terhadap-deforestasireforestasi)
7. [Implementasi Frontend](#implementasi-frontend)
8. [Contoh Kasus & Skenario](#contoh-kasus--skenario)
9. [FAQ & Troubleshooting](#faq--troubleshooting)

---

## PENDAHULUAN

### Latar Belakang
Sistem analisis perubahan tutupan lahan menggunakan **Temporal Status** untuk memberikan indikasi kualitas dan tingkat kepercayaan (confidence level) terhadap data perubahan yang terdeteksi. Status temporal adalah metadata yang dihitung berdasarkan perbandingan perubahan kelas dominan antar tahun.

### Tujuan Temporal Status
- **Mengidentifikasi perubahan nyata vs. perubahan sementara** (noise/musiman)
- **Memberikan confidence level** terhadap perubahan yang terdeteksi
- **Membantu pengguna dalam interpretasi data** melalui visualisasi opasitas
- **Menyediakan audit trail** untuk transparansi analisis

### Penting Diketahui
⚠️ **Temporal Status TIDAK mempengaruhi perhitungan deforestasi/reforestasi secara langsung.** Status ini bersifat deskriptif (metadata) dan digunakan untuk indikasi kualitas di UI, bukan sebagai filter kalkulasi.

---

## DEFINISI & KONSEP

### Apa itu Temporal Status?
Temporal Status adalah label yang diberikan kepada setiap tahun dalam sebuah history record untuk menunjukkan **tingkat kepercayaan terhadap perubahan tutupan lahan yang terdeteksi** pada tahun tersebut.

### Kelas Dominan
Sebelum temporal status ditentukan, sistem terlebih dahulu menghitung **kelas dominan** untuk setiap tahun:
- Kelas dominan = Kelas tutupan lahan dengan area terbesar pada tahun tersebut
- Menggunakan 6 kelas IPSDH: Hutan Primer, Hutan Sekunder, Tanah Kering, Tanah Kosong, Lahan Terbangun, Air

### Contoh Kelas Dominan:
```
Tahun 2020:
  - Hutan Primer: 50 ha
  - Hutan Sekunder: 150 ha  ← DOMINAN (terbesar)
  - Tanah Kering: 10 ha
  - Tanah Kosong: 5 ha
  - Lahan Terbangun: 8 ha
  - Air: 15 ha
  ─────────────────────
  Total: 238 ha

Kelas Dominan = Hutan Sekunder
```

---

## EMPAT KATEGORI STATUS TEMPORAL

### 1. 🟢 STABIL (stable)

**Definisi:**
Kelas tutupan lahan dominan tidak berubah dibanding tahun sebelumnya.

**Kondisi Terdeteksi:**
```
Tahun 2020: Hutan Sekunder (dominan)
Tahun 2021: Hutan Sekunder (dominan)  ← SAMA = STABIL
```

**Arti Praktis:**
- Tidak ada perubahan tutupan lahan yang signifikan
- Area tetap dalam kondisi yang sama
- Tingkat kepercayaan: **TINGGI ✓✓✓**

**Visualisasi di Map:**
- Warna solid
- Opasitas: **100%** (fully opaque)
- Pengguna akan melihat area dengan jelas

**Contoh:**
- Area hutan yang tetap hutan selama bertahun-tahun
- Area terbangun yang tetap terbangun
- Area lahan kosong yang tetap kosong

---

### 2. 🟠 TERKONFIRMASI (transition_confirmed)

**Definisi:**
Terjadi perubahan kelas dominan, dan perubahan tersebut berlanjut konsisten di tahun berikutnya (2+ tahun berturut-turut).

**Kondisi Terdeteksi:**
```
Tahun 2020: Hutan Sekunder (dominan)
Tahun 2021: Tanah Kosong (dominan)      ← BERUBAH
Tahun 2022: Tanah Kosong (dominan)      ← MASIH SAMA = TERKONFIRMASI
Tahun 2023: Tanah Kosong (dominan)      ← TETAP SAMA = CONFIRMED
```

**Arti Praktis:**
- Perubahan tutupan lahan **nyata dan berlanjut**
- Bukan peristiwa sekali jadi, tapi tren yang konsisten
- Tingkat kepercayaan: **SANGAT TINGGI ✓✓✓✓**

**Visualisasi di Map:**
- Warna solid
- Opasitas: **100%** (fully opaque)
- Sama terang seperti stabil

**Contoh:**
- Hutan yang ditebang tahun 2021 dan tetap lahan kosong sampai 2023
- Pembukaan lahan baru yang menjadi permukiman
- Konversi hutan menjadi area pertanian permanen

---

### 3. 🟡 BELUM TERKONFIRMASI / GREY AREA (transition_unconfirmed)

**Definisi:**
Terjadi perubahan kelas dominan, tetapi belum diketahui apakah perubahan akan berlanjut atau berbalik. Ini adalah status "grey area" yang memerlukan monitoring lanjutan.

**Kondisi Terdeteksi:**
```
Tahun 2020: Hutan Sekunder (dominan)
Tahun 2021: Tanah Kosong (dominan)      ← BERUBAH
Tahun 2022: ?                            ← BELUM TAHU = GREY AREA
(Belum tersedia data tahun 2022 atau
 tahun 2022 berbeda dari 2021 dan juga berbeda dari 2020)
```

**Arti Praktis:**
- Perubahan terdeteksi tetapi **masih ragu-ragu**
- Membutuhkan monitoring & verifikasi lebih lanjut
- Tingkat kepercayaan: **MENENGAH ✓✓**

**Visualisasi di Map:**
- Warna FADING/FADE
- Opasitas: **50%** (semi-transparent/abu-abu)
- Terlihat lebih samar untuk menunjukkan tingkat kepercayaan yang lebih rendah

**Contoh:**
- Hutan yang baru saja dirubah menjadi lahan kosong (tahun pertama)
- Area yang menunjukkan perubahan mencolok tapi masih perlu verifikasi
- Zona transisi yang belum stabil

---

### 4. ⚫ NOISE / MUSIMAN (reverted_noise)

**Definisi:**
Terjadi perubahan kelas dominan pada satu tahun, tetapi kemudian kembali ke kondisi tahun sebelumnya (2 tahun lalu). Ini menunjukkan perubahan bersifat sementara (noise atau musiman).

**Kondisi Terdeteksi:**
```
Tahun 2020: Hutan Sekunder (dominan)
Tahun 2021: Tanah Kosong (dominan)      ← BERUBAH
Tahun 2022: Hutan Sekunder (dominan)    ← KEMBALI KE 2020 = NOISE/MUSIMAN
```

**Arti Praktis:**
- Perubahan bersifat **sementara/tidak nyata**
- Kemungkinan kesalahan sensor atau perubahan musiman
- Tingkat kepercayaan: **RENDAH ✓**

**Visualisasi di Map:**
- Warna SANGAT FADING
- Opasitas: **30%** (very faint/hampir transparan)
- Terlihat sangat pucat untuk menunjukkan tingkat kepercayaan yang sangat rendah

**Contoh:**
- Area yang terdeteksi tanpa vegetasi (musim kering) tapi kemudian hijau lagi (musim hujan)
- Kesalahan klasifikasi yang diperbaiki otomatis di tahun berikutnya
- Perubahan sementara karena faktor musiman

---

## BAGAIMANA STATUS DITENTUKAN

### Algoritma Perhitungan Temporal Status

**Input yang Dibutuhkan:**
1. Kelas dominan Tahun N-2 (prev_prev_class)
2. Kelas dominan Tahun N-1 (prev_class)
3. Kelas dominan Tahun N (current_class) ← yang sedang dihitung
4. Kelas dominan Tahun N+1 (next_class)

**Flowchart Logika:**

```
START
  │
  ├─ Apakah current == prev?
  │   │
  │   ├─ YA → Status = STABLE ✓
  │   │
  │   └─ TIDAK → Lanjut ke step 2
  │
  ├─ Apakah current == next?
  │   │
  │   ├─ YA → Status = TRANSITION_CONFIRMED ✓
  │   │
  │   └─ TIDAK → Lanjut ke step 3
  │
  ├─ Apakah current == prev_prev?
  │   │
  │   ├─ YA → Status = REVERTED_NOISE ✓
  │   │
  │   └─ TIDAK → Lanjut ke step 4
  │
  ├─ Default case
  │   │
  │   └─ Status = TRANSITION_UNCONFIRMED (Grey Area) ✓
  │
END
```

### Contoh Perhitungan Step-by-Step

**Skenario Kompleks: History dengan 5 Tahun Data**

```
TAHUN 2020 (Year 1)
  Kelas Dominan = Hutan Sekunder
  prev_prev_class = (tidak ada)
  prev_class = (tidak ada)
  current_class = Hutan Sekunder
  next_class = Hutan Sekunder

  Logika: current (Hutan Sekunder) == prev?
          → prev tidak ada, jadi STABLE
  HASIL: Status = STABLE ✓

────────────────────────────────────────────

TAHUN 2021 (Year 2)
  Kelas Dominan = Hutan Sekunder
  prev_prev_class = (tidak ada)
  prev_class = Hutan Sekunder
  current_class = Hutan Sekunder
  next_class = Tanah Kosong

  Logika: current (Hutan Sekunder) == prev (Hutan Sekunder)?
          → YA → STABLE
  HASIL: Status = STABLE ✓

────────────────────────────────────────────

TAHUN 2022 (Year 3) ← PERUBAHAN!
  Kelas Dominan = Tanah Kosong
  prev_prev_class = Hutan Sekunder
  prev_class = Hutan Sekunder
  current_class = Tanah Kosong
  next_class = Tanah Kosong

  Logika: current (Tanah Kosong) == prev (Hutan Sekunder)?
          → TIDAK, lanjut ke step 2
          current (Tanah Kosong) == next (Tanah Kosong)?
          → YA → TRANSITION_CONFIRMED
  HASIL: Status = TRANSITION_CONFIRMED ✓

────────────────────────────────────────────

TAHUN 2023 (Year 4)
  Kelas Dominan = Tanah Kosong
  prev_prev_class = Hutan Sekunder
  prev_class = Tanah Kosong
  current_class = Tanah Kosong
  next_class = Tanah Kosong

  Logika: current (Tanah Kosong) == prev (Tanah Kosong)?
          → YA → STABLE
  HASIL: Status = STABLE ✓

────────────────────────────────────────────

TAHUN 2024 (Year 5)
  Kelas Dominan = Tanah Kosong
  prev_prev_class = Tanah Kosong
  prev_class = Tanah Kosong
  current_class = Tanah Kosong
  next_class = (tidak ada)

  Logika: current (Tanah Kosong) == prev (Tanah Kosong)?
          → YA → STABLE
  HASIL: Status = STABLE ✓

────────────────────────────────────────────

KESIMPULAN HISTORY:
2020: STABLE (100% opaque)
2021: STABLE (100% opaque)
2022: TRANSITION_CONFIRMED (100% opaque) ← Perubahan dimulai
2023: STABLE (100% opaque)
2024: STABLE (100% opaque)
```

---

## STRUKTUR DATA DATABASE

### Tabel: analysis_yearly_data

**Lokasi:** PostgreSQL/Supabase database

**Kolom Baru (Ditambah oleh Temporal Status Feature):**

```sql
Column Name: temporal_status
Data Type: TEXT
Default Value: 'stable'
Constraints: CHECK (temporal_status IN ('stable', 'transition_unconfirmed',
                                        'transition_confirmed', 'reverted_noise'))
Index: idx_yearly_data_temporal_status (untuk fast filtering)

────────────────────────────────────

Column Name: dominant_class
Data Type: TEXT
Constraints: CHECK (dominant_class IN ('hutan_primer', 'hutan_sekunder',
                                       'tanah_kering', 'tanah_kosong',
                                       'lahan_terbangun', 'air'))
Index: idx_yearly_data_dominant_class (untuk fast filtering)
```

### Relasi Data

```
analysis_history (Parent Table)
├── id (UUID)
├── location (geometry)
├── deforestation_ha
├── reforestation_ha
└── created_at
    │
    └─ 1-to-Many Relationship
       │
       └─ analysis_yearly_data (Child Table)
          ├── id (UUID)
          ├── history_id (FK to analysis_history.id)
          ├── year (INTEGER) ← Unique per history
          ├── hutan_primer (NUMERIC)
          ├── hutan_sekunder (NUMERIC)
          ├── tanah_kering (NUMERIC)
          ├── tanah_kosong (NUMERIC)
          ├── lahan_terbangun (NUMERIC)
          ├── air (NUMERIC)
          ├── total_area (NUMERIC)
          ├── deforestation_ha (NUMERIC)
          ├── reforestation_ha (NUMERIC)
          ├── temporal_status (TEXT) ← NEW
          ├── dominant_class (TEXT) ← NEW
          └── created_at (TIMESTAMP)

Unique Constraint: (history_id, year) ← One record per year per history
```

### Contoh Record di Database

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "history_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "year": 2022,
  "hutan_primer": 30.2,
  "hutan_sekunder": 50.8,
  "tanah_kering": 20.5,
  "tanah_kosong": 80.2,
  "lahan_terbangun": 30.3,
  "air": 15.0,
  "total_area": 227.0,
  "deforestation_ha": 15.5,
  "reforestation_ha": 2.3,
  "temporal_status": "transition_unconfirmed",
  "dominant_class": "tanah_kosong",
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Query Contoh

**Query 1: Semua tahun yang memiliki status GREY AREA**
```sql
SELECT year, dominant_class, temporal_status, deforestation_ha, reforestation_ha
FROM analysis_yearly_data
WHERE history_id = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
  AND temporal_status = 'transition_unconfirmed'
ORDER BY year;
```

**Query 2: Summary status distribution untuk satu history**
```sql
SELECT temporal_status, COUNT(*) as count
FROM analysis_yearly_data
WHERE history_id = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
GROUP BY temporal_status
ORDER BY count DESC;
```

**Query 3: Area dengan perubahan terkonfirmasi**
```sql
SELECT year, dominant_class
FROM analysis_yearly_data
WHERE history_id = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
  AND temporal_status IN ('transition_confirmed', 'stable')
  AND year >= 2022;
```

---

## PENGARUH TERHADAP DEFORESTASI/REFORESTASI

### ⚠️ PENTING: Temporal Status TIDAK Mempengaruhi Perhitungan

**Definisi Resmi:**

| Metrik | Definisi |
|--------|----------|
| **Deforestasi** | Perubahan dari Hutan (kelas 1, 2) → Non-Hutan (kelas 3-9) |
| **Reforestasi** | Perubahan dari Non-Hutan (kelas 3-9) → Hutan (kelas 1, 2) |
| **Degradasi** | *(Belum ada perhitungan terpisah dalam sistem)* |

### Cara Perhitungan (Pixel-Level)

```
DEFORESTATION CALCULATION:
  Input: Classification image Tahun N-1 vs Tahun N
  Process: Pixel-by-pixel comparison
           IF (pixel_year_n-1 is Forest) AND (pixel_year_n is Non-Forest)
           THEN: Tambah ke deforestation_area
  Output: deforestation_ha (dalam hectare)

PENTING: Temporal_status TIDAK digunakan dalam logika ini!
```

### Contoh Kasus: Area dengan Temporal Status Berbeda

```
SKENARIO: Satu area dengan deforestasi 20 ha
          Berbagai temporal status di berbagai tahun

TAHUN 2021: Status = STABLE
            Deforestasi = 5 ha
            Perhitungan: ✓ DIHITUNG (5 ha masuk total)

TAHUN 2022: Status = TRANSITION_UNCONFIRMED (GREY AREA)
            Deforestasi = 8 ha
            Perhitungan: ✓ DIHITUNG (8 ha masuk total, tidak dikurangi!)

TAHUN 2023: Status = TRANSITION_CONFIRMED
            Deforestasi = 7 ha
            Perhitungan: ✓ DIHITUNG (7 ha masuk total)

────────────────────────────────────────────
TOTAL DEFORESTASI: 5 + 8 + 7 = 20 ha
────────────────────────────────────────────

KESIMPULAN: Meskipun tahun 2022 adalah GREY AREA,
            deforestasi tetap dihitung tanpa filtering!
```

### Temporal Status Hanya untuk:

1. **Indikasi Kualitas/Confidence**
   - STABLE/CONFIRMED = confidence tinggi
   - GREY AREA = confidence menengah
   - NOISE = confidence rendah

2. **Visualisasi di Frontend (Opasitas)**
   - STABLE/CONFIRMED: 100% opaque (warna solid)
   - GREY AREA: 50% opaque (warna fading)
   - NOISE: 30% opaque (warna sangat fading)

3. **Filtering/Analisis Lanjutan (Optional)**
   - User bisa filter hasil berdasarkan temporal_status
   - Contoh: "Tampilkan hanya deforestasi yang CONFIRMED"

### Visual Comparison

```
┌────────────────────────────────────────────────────────────────┐
│ Database View (calculation tidak terpengaruh):                  │
│                                                                  │
│ Year 2022:                                                      │
│ - temporal_status: 'transition_unconfirmed'                    │
│ - deforestation_ha: 8.5                                         │
│ - reforestation_ha: 2.1                                         │
│                                                                  │
│ Nilai 8.5 dan 2.1 TIDAK berubah karena status GREY AREA!       │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Map View (visualization berbeda):                              │
│                                                                  │
│ Year 2022:                                                      │
│ ░░░░ Polygon ditampilkan dengan 50% opacity (grey/fading)     │
│ Menunjukkan ke user: "Area ini status GREY AREA, confidence"   │
│ level menengah"                                                 │
│                                                                  │
│ Tetapi di belakang layar, 8.5 ha tetap masuk perhitungan!      │
└────────────────────────────────────────────────────────────────┘
```

---

## IMPLEMENTASI FRONTEND

### Komponen yang Terlibat

**File:** `frontend/src/MainLayout.jsx`

**1. Temporal Status Legend Component**
```javascript
const TemporalStatusLegend = ({ show }) => {
  // Menampilkan 4 kategori dengan warna dan opasitas sesuai
  return (
    <div>
      { Stabil - Emerald #10b981 - 100% opacity }
      { Terkonfirmasi - Amber #f59e0b - 100% opacity }
      { Belum Terkonfirmasi (Grey Area) - Lime #84cc16 - 50% opacity }
      { Noise/Musiman - Gray #6b7280 - 30% opacity }
    </div>
  );
};
```

**2. Layer Menu Section**
```javascript
{showTemporalStatus && (
  <div className="Status Temporal section in layer menu">
    <header>Status Temporal [GREY AREA badge]</header>
    <TemporalStatusLegend show={true} />
  </div>
)}
```

**3. Opacity Mapping untuk Layer**
```javascript
const yearOpacityMap = {
  2020: 1.0,     // STABLE
  2021: 1.0,     // STABLE
  2022: 0.5,     // TRANSITION_UNCONFIRMED (Grey Area)
  2023: 1.0,     // TRANSITION_CONFIRMED
  2024: 0.3      // REVERTED_NOISE
};

// Saat user memilih tahun, polygon opacity diatur sesuai map
```

### API Endpoints

**GET `/history/{history_id}/temporal-status`**

Response:
```json
{
  "status": "success",
  "yearly_data": [
    {
      "year": 2020,
      "dominant_class": "hutan_sekunder",
      "temporal_status": "stable",
      "deforestation_ha": 5.2,
      "reforestation_ha": 1.0,
      "hutan_primer": 50.2,
      "hutan_sekunder": 150.8,
      "tanah_kering": 10.5,
      "tanah_kosong": 5.2,
      "lahan_terbangun": 8.3,
      "air": 15.0
    },
    // ... more years
  ],
  "summary": {
    "total_years": 5,
    "status_counts": {
      "stable": 3,
      "transition_confirmed": 1,
      "transition_unconfirmed": 1,
      "reverted_noise": 0
    },
    "grey_area_years": [2022]
  }
}
```

---

## CONTOH KASUS & SKENARIO

### Kasus 1: Area Hutan yang Ditebang (Deforestasi Nyata)

**Skenario:**
```
Lokasi: Blok hutan di Riau (50 km²)

Timeline:
2019: Hutan Sekunder (area terbesar)
2020: Hutan Sekunder (status: STABLE)
2021: Hutan Sekunder (status: STABLE)
2022: Tanah Kosong (status: TRANSITION_UNCONFIRMED - GREY AREA!)
      Deforestasi terdeteksi: 40 ha
2023: Tanah Kosong (status: TRANSITION_CONFIRMED)
      Deforestasi tambahan: 5 ha
2024: Tanah Kosong (status: STABLE)
      Deforestasi tambahan: 0 ha

Interpretasi:
- 2022: Deforestasi dimulai, tingkat kepercayaan menengah (50% opacity di map)
- 2023: Deforestasi berlanjut, tingkat kepercayaan tinggi (100% opacity di map)
- 2024: Area tetap dalam kondisi tertebang, stabil

Total Deforestasi: 40 + 5 + 0 = 45 ha ✓
(Semua termasuk, tidak ada filtering meskipun ada GREY AREA di tahun 2022)
```

**Visualisasi Map:**
```
User lihat tahun 2022:
  Polygon berwarna FADING (50% opacity)
  → Menunjukkan: "Perubahan baru terdeteksi, belum dikonfirmasi"

User lihat tahun 2023:
  Polygon berwarna SOLID (100% opacity)
  → Menunjukkan: "Perubahan terkonfirmasi, tingkat kepercayaan tinggi"
```

### Kasus 2: Area dengan Perubahan Musiman (Noise)

**Skenario:**
```
Lokasi: Area pertanian/lahan terlantar (10 km²)

Timeline:
2021: Lahan Kosong (area terbesar, musim kering)
2022: Lahan Kosong (status: STABLE)
2023: Rumput/Tanah Bervegetasi Pendek (status: REVERTED_NOISE)
      → Terdeteksi perubahan karena musim penghujan
      → Lahan tumbuh rumput musiman
2024: Lahan Kosong kembali (status: STABLE)
      → Kembali ke kondisi awal saat musim kering

Interpretasi:
- 2023 adalah perubahan SEMENTARA (hanya 1 tahun)
- Tingkat kepercayaan RENDAH (30% opacity di map)
- Ini adalah NOISE/ARTIFACT musiman, bukan perubahan nyata
```

**Visualisasi Map:**
```
User lihat tahun 2023:
  Polygon berwarna SANGAT FADING (30% opacity)
  → Menunjukkan: "Perubahan sementara, kemungkinan noise/musiman"
```

### Kasus 3: Area dengan Banyak Perubahan (Kompleks)

**Skenario:**
```
Lokasi: Area pembangunan perkotaan (8 km²)

Timeline:
2019: Hutan Sekunder
2020: Hutan Sekunder (status: STABLE)
2021: Lahan Terbangun (status: TRANSITION_UNCONFIRMED - GREY AREA)
      Deforestasi: 3 ha (untuk pembangunan)
      Dominant class berubah → grey area
2022: Lahan Terbangun (status: TRANSITION_CONFIRMED)
      Deforestasi: 1 ha (lanjut pembangunan)
      Perubahan dikonfirmasi
2023: Lahan Terbangun + Tanah Kosong (status: STABLE)
      Dominant class masih Lahan Terbangun, stabil
2024: Lahan Terbangun (status: STABLE)

Summary:
- Total Deforestasi: 3 + 1 + 0 = 4 ha ✓
- Grey Area pada: Tahun 2021
- Terkonfirmasi pada: Tahun 2022 onwards
```

---

## FAQ & TROUBLESHOOTING

### Q1: Apakah data dengan Grey Area (transition_unconfirmed) tidak boleh dipercaya?

**A:** Tidak sepenuhnya demikian. Grey Area menunjukkan tingkat kepercayaan **menengah**, bukan "tidak boleh dipercaya". Perubahan tersebut SUDAH terdeteksi oleh sistem dan sudah dihitung dalam metrik deforestasi/reforestasi. Yang masih perlu ditentukan adalah **apakah perubahan akan berlanjut atau berbalik**.

Rekomendasi:
- Gunakan data Grey Area untuk monitoring
- Tunggu tahun berikutnya untuk konfirmasi
- Tidak perlu mengecualikan dari perhitungan

---

### Q2: Apakah Noise/Musiman (reverted_noise) harus diabaikan?

**A:** Noise/Musiman tetap dihitung dalam metrik deforestasi/reforestasi, tetapi:
- Tingkat kepercayaan RENDAH (30% opacity)
- Kemungkinan besar adalah artifact/kesalahan sensor
- Untuk analisis serius, pertimbangkan filtering data ini
- Query: `WHERE temporal_status != 'reverted_noise'`

---

### Q3: Bagaimana jika ada data yang hilang atau tidak lengkap?

**A:** Temporal Status membutuhkan data minimal:
- **Untuk STABLE:** Data tahun N dan N-1
- **Untuk CONFIRMED:** Data tahun N, N-1, dan N+1
- **Untuk GREY AREA:** Data tidak lengkap/tidak sesuai pattern

Jika data tidak lengkap:
- Tahun pertama dalam series = STABLE (tidak ada prev)
- Tahun terakhir = tidak bisa CONFIRMED (tidak ada next)
- Pattern tidak cocok = GREY AREA

---

### Q4: Apakah pengguna bisa melihat temporal_status di UI?

**A:** Ya! Temporal Status divisualisasikan melalui:
1. **Opacity di Map:** 100% (solid), 50% (grey), 30% (noise)
2. **Legend Panel:** Menampilkan 4 kategori dengan warna
3. **Informasi Detail:** Tooltip/panel bisa menampilkan temporal_status value

---

### Q5: Bisakah temporal_status diubah secara manual?

**A:** Tidak disarankan. Temporal Status dihitung otomatis berdasarkan algoritma yang deterministic. Mengubah secara manual akan:
- Merusak audit trail
- Menyebabkan inkonsistensi data
- Menghilangkan metadata kualitas

Jika ada kekeliruan, lebih baik:
1. Verifikasi data sumber (classification)
2. Re-run calculation jika diperlukan

---

### Q6: Bagaimana pengaruh temporal_status terhadap laporan deforestasi?

**A:** Temporal Status TIDAK mempengaruhi angka deforestasi yang dilaporkan.
- Laporan tetap menampilkan total deforestasi sama
- NAMUN, bisa ditambahkan breakdown berdasarkan temporal_status untuk transparansi

Contoh laporan yang lebih informatif:
```
Total Deforestasi: 125.5 ha

Breakdown by Confidence Level:
- Stabil/Confirmed: 110.2 ha (87.8%) ← Tingkat kepercayaan tinggi
- Grey Area: 12.8 ha (10.2%)          ← Perlu monitoring
- Noise: 2.5 ha (2.0%)                 ← Kemungkinan artifact

Rekomendasi:
Report angka 110.2 ha sebagai deforestasi "confirmed"
Catat 12.8 ha sebagai "perlu verifikasi"
```

---

### Q7: Apa bedanya temporal_status dengan dominant_class?

**A:**

| Aspek | temporal_status | dominant_class |
|-------|-----------------|----------------|
| **Apa yang diukur** | Perubahan confidence | Kelas terbesar tahun ini |
| **Nilai Contoh** | stable, transition_confirmed | hutan_sekunder, tanah_kosong |
| **Fungsi** | Indikator kualitas perubahan | Identifikasi kelas dominan |
| **Perubahan** | Bisa berbeda antar tahun | Bisa berbeda antar tahun |
| **Untuk apa** | Confidence level, opacity UI | Tracking tren kelas |

---

### Q8: Bagaimana menjalankan temporal_status calculation?

**A:** Temporal Status dihitung otomatis saat:
1. User melakukan upload analisis baru
2. Backend menerima data analysis_yearly_data
3. Trigger background task: `update_temporal_status_for_history()`

Manual trigger (jika perlu):
```
POST /history/{history_id}/calculate-temporal-status
```

---

### Q9: Apakah temporal_status bisa digunakan untuk alert/notifikasi?

**A:** Ya! Contoh use case:
- Alert ketika ada "transition_unconfirmed" (baru ada perubahan, perlu dimonitor)
- Alert ketika ada "transition_confirmed" (perubahan sudah nyata)
- Suppress alert untuk "reverted_noise" (hanya noise)

---

### Q10: Apa yang terjadi jika kelas dominan sama tapi persentase berbeda?

**A:** Temporal Status hanya membandingkan **kelas dominan** (nama kelas), bukan **persentase**.

Contoh:
```
Tahun 2021: Hutan Sekunder 60% (dominan), Tanah Kosong 40%
Tahun 2022: Hutan Sekunder 55% (dominan), Tanah Kosong 45%

Temporal Status: STABLE (karena dominan masih Hutan Sekunder)
Meskipun persentase berubah!
```

Catatan: Perubahan persentase tetap dihitung dalam deforestasi/reforestasi berdasarkan pixel-level comparison.

---

## KESIMPULAN

### Key Takeaways

1. **Temporal Status adalah metadata kualitas**, bukan filter perhitungan
2. **Semua data dihitung** terlepas dari statusnya (Stabil/Confirmed/Grey Area/Noise)
3. **Visualisasi opasitas** membantu pengguna memahami tingkat kepercayaan
4. **Tidak ada pengaruh pada deforestasi/reforestasi** dalam hal nilai numerik
5. **Bermanfaat untuk monitoring dan audit trail** dalam analisis perubahan

### Rekomendasi Implementasi

1. ✅ Hitung temporal_status otomatis untuk setiap analysis
2. ✅ Tampilkan legend di layer menu dengan warna & opasitas
3. ✅ Apply opasitas ke map berdasarkan temporal_status per tahun
4. ✅ Dokumentasikan dalam laporan analisis
5. ✅ Berikan opsi filter untuk pengguna yang ingin fokus pada "confirmed changes"
6. ✅ Monitor data grey area untuk verifikasi tahun berikutnya

---

**Dokumen ini adalah referensi lengkap untuk implementasi Temporal Status dalam sistem analisis perubahan tutupan lahan.**

**Last Updated:** 2024
**Version:** 1.0
**Status:** Final Documentation
