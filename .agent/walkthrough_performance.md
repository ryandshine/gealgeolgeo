# Optimasi Performa Pengambilan Data (Discovery & Retrieval)

Masalah keterlambatan ("delay") saat memuat riwayat atau data dari database telah diatasi melalui optimasi pada sisi backend (FastAPI) dan frontend (React).

## Masalah
1.  **Payload JSON Terlalu Besar**: Setiap item riwayat berisi data GeoJSON yang kompleks, Thumbnail Base64 untuk setiap tahun, dan data vektor hasil klasifikasi. Mengambil 50 item sekaligus mengakibatkan transfer data puluhan Megabyte.
2.  **Pemuatan Unnecessary Data**: Data seperti `vector_geojson` dan `rgb_thumb_url` (untuk perbandingan) dimuat di awal meskipun hanya dibutuhkan saat item tertentu dibuka.

## Solusi yang Diimplementasikan

### 1. Kompresi Sisi Server (GZip)
- Mengaktifkan `GZipMiddleware` pada backend FastAPI. 
- Karena data GeoJSON dan Base64 adalah teks berulang, kompresi ini mengurangi ukuran transfer hingga **80-90%**.

### 2. Optimasi API List Riwayat
- Endpoint `/history` kini secara otomatis menghapus (pruning) field yang sangat berat seperti `vector_geojson` dan `rgb_thumb_url`.
- Tetap mempertahankan `thumb_url` utama agar pratinjau di dashboard riwayat tetap muncul.
- Ini mempercepat pemuatan awal dashboard riwayat secara signifikan.

### 3. Endpoint Detail Baru
- Menambahkan endpoint `@app.get("/history/{history_id}")`.
- Endpoint ini digunakan untuk mengambil data lengkap (termasuk GeoJSON detail dan semua thumbnail) hanya ketika pengguna mengklik tombol **"Buka Analisis"**.

### 4. Pola Pemuatan "On-Demand" di Frontend
- **App.jsx** & **MainLayout.jsx** telah diperbarui.
- Saat pengguna memilih item dari daftar riwayat atau mengklik pin di peta, aplikasi akan melakukan fetch detail ke endpoint baru tersebut sebelum menampilkan data di peta.
- Hal ini memastikan map tetap responsif tanpa harus menanggung beban data dari seluruh riwayat sekaligus.

## Hasil
- **Pemuatan Awal Lebih Cepat**: Pengguna dapat melihat daftar riwayat hampir seketika.
- **Hemat Bandwidth**: Data berat hanya dikirim saat benar-benar dibutuhkan oleh pengguna.
- **Stabilitas**: Mengurangi risiko crash pada perangkat mobile akibat konsumsi memori yang tinggi saat memproses JSON raksasa.
