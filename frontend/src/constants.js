
export const API_URL = import.meta.env.VITE_API_URL ||
    (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
        ? `${window.location.origin}/api`
        : 'http://localhost:8000');

// Batasan Teknis
// Batasan Teknis
export const MAX_FILE_SIZE_MB = 200; // 200MB Max Upload
export const MAX_BATCH_SIZE = 50;    // Max 50 files per batch upload to prevent browser crash

// Regional Presets - Based on ecological characteristics of Indonesian islands
// Regional Presets - Based on ecological characteristics of Indonesian islands
export const REGIONAL_PRESETS = {
    'default': {
        name: 'Default (Global)',
        variants: {
            'balanced': {
                name: 'Balanced',
                description: 'Parameter standar untuk seluruh Indonesia',
                params: { forest_ndvi_min: 0.6, dry_land_ndvi_min: 0.2, dry_land_ndvi_max: 0.6, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.0, water_mndwi_min: 0.1, water_ndvi_max: 0.0 }
            }
        }
    },
    'sumatera': {
        name: 'Sumatera',
        description: 'Hutan hujan tropis dataran rendah dengan lahan gambut',
        variants: {
            'hutan_primer': { name: 'Hutan Primer (Lengkap)', description: 'Vegetasi sangat rapat, kanopi tertutup sempurna', params: { forest_ndvi_min: 0.68, dry_land_ndvi_min: 0.35, dry_land_ndvi_max: 0.68, bare_soil_ndvi_max: 0.3, bare_soil_ndbi_min: 0.05, water_mndwi_min: 0.2, water_ndvi_max: -0.1 } },
            'hutan_rawa': { name: 'Hutan Rawa Gambut', description: 'Karakteristik basah dengan kanopi rapat', params: { forest_ndvi_min: 0.62, dry_land_ndvi_min: 0.28, dry_land_ndvi_max: 0.62, bare_soil_ndvi_max: 0.25, bare_soil_ndbi_min: 0.03, water_mndwi_min: 0.25, water_ndvi_max: -0.05 } },
            'hutan_sekunder': { name: 'Hutan Sekunder', description: 'Bekas tebangan atau vegetasi regenerasi', params: { forest_ndvi_min: 0.55, dry_land_ndvi_min: 0.25, dry_land_ndvi_max: 0.55, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.02, water_mndwi_min: 0.15, water_ndvi_max: 0.0 } },
            'sawit_dewasa': { name: 'Kebun Sawit (Dewasa)', description: 'Kanopi sawit rapat (NDVI tinggi)', params: { forest_ndvi_min: 0.52, dry_land_ndvi_min: 0.22, dry_land_ndvi_max: 0.52, bare_soil_ndvi_max: 0.18, bare_soil_ndbi_min: 0.01, water_mndwi_min: 0.15, water_ndvi_max: 0.02 } },
            'sawit_muda': { name: 'Kebun Sawit (Muda)', description: 'Masih terlihat tanah di sela tanaman', params: { forest_ndvi_min: 0.45, dry_land_ndvi_min: 0.18, dry_land_ndvi_max: 0.45, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: 0.0, water_mndwi_min: 0.12, water_ndvi_max: 0.03 } },
            'hti_homogen': { name: 'HTI (Eukaliptus/Akasia)', description: 'Hutan industri dengan pola tanam homogen', params: { forest_ndvi_min: 0.58, dry_land_ndvi_min: 0.2, dry_land_ndvi_max: 0.58, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: -0.01, water_mndwi_min: 0.1, water_ndvi_max: 0.02 } },
            'lahan_terbuka': { name: 'Lahan Terbuka / Land Clearing', description: 'Baru dibuka untuk perkebunan', params: { forest_ndvi_min: 0.5, dry_land_ndvi_min: 0.12, dry_land_ndvi_max: 0.4, bare_soil_ndvi_max: 0.1, bare_soil_ndbi_min: -0.05, water_mndwi_min: 0.1, water_ndvi_max: 0.05 } },
            'mangrove': { name: 'Ekosistem Mangrove', description: 'Vegetasi pesisir dengan pengaruh pasang surut', params: { forest_ndvi_min: 0.48, dry_land_ndvi_min: 0.15, dry_land_ndvi_max: 0.48, bare_soil_ndvi_max: 0.1, bare_soil_ndbi_min: 0.0, water_mndwi_min: 0.05, water_ndvi_max: 0.05 } },
            'urban_dense': { name: 'Kota Padat (Medan/Palembang)', description: 'Area terbangun rapat, minim vegetasi', params: { forest_ndvi_min: 0.5, dry_land_ndvi_min: 0.15, dry_land_ndvi_max: 0.4, bare_soil_ndvi_max: 0.1, bare_soil_ndbi_min: -0.08, water_mndwi_min: 0.05, water_ndvi_max: 0.08 } },
            'shrub_gambut': { name: 'Semak Belukar Gambut', description: 'Area bekas kebakaran yang mulai ditumbuhi semak', params: { forest_ndvi_min: 0.45, dry_land_ndvi_min: 0.2, dry_land_ndvi_max: 0.45, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: -0.02, water_mndwi_min: 0.2, water_ndvi_max: 0.05 } }
        }
    },
    'kalimantan': {
        name: 'Kalimantan',
        description: 'Hutan hujan tropis dengan lahan gambut ekstensif',
        variants: {
            'hutan_primer_diptero': { name: 'Primer (Dipterocarp)', description: 'Hutan dataran rendah/perbukitan asli', params: { forest_ndvi_min: 0.72, dry_land_ndvi_min: 0.38, dry_land_ndvi_max: 0.72, bare_soil_ndvi_max: 0.3, bare_soil_ndbi_min: 0.06, water_mndwi_min: 0.15, water_ndvi_max: -0.1 } },
            'gambut_dalam': { name: 'Hutan Rawa Gambut Dalam', description: 'Tegakan pohon tinggi di atas gambut', params: { forest_ndvi_min: 0.65, dry_land_ndvi_min: 0.28, dry_land_ndvi_max: 0.65, bare_soil_ndvi_max: 0.25, bare_soil_ndbi_min: 0.04, water_mndwi_min: 0.28, water_ndvi_max: -0.06 } },
            'hutan_kerangas': { name: 'Hutan Kerangas', description: 'Vegatasi spesifik tanah pasir putih gersang', params: { forest_ndvi_min: 0.5, dry_land_ndvi_min: 0.2, dry_land_ndvi_max: 0.5, bare_soil_ndvi_max: 0.18, bare_soil_ndbi_min: 0.03, water_mndwi_min: 0.1, water_ndvi_max: 0.0 } },
            'tambang_terbuka': { name: 'Area Tambang Terbuka', description: 'Tanah terbuka/galian tambang batubara', params: { forest_ndvi_min: 0.53, dry_land_ndvi_min: 0.14, dry_land_ndvi_max: 0.4, bare_soil_ndvi_max: 0.08, bare_soil_ndbi_min: -0.05, water_mndwi_min: 0.1, water_ndvi_max: 0.05 } },
            'kolam_tambang': { name: 'Kolam Void Tambang', description: 'Air pada lubang bekas tambang', params: { forest_ndvi_min: 0.55, dry_land_ndvi_min: 0.22, dry_land_ndvi_max: 0.55, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.01, water_mndwi_min: -0.05, water_ndvi_max: 0.08 } },
            'sawit_skala_besar': { name: 'Perkebunan Sawit Skala Besar', description: 'Hamparan perkebunan sangat luas', params: { forest_ndvi_min: 0.54, dry_land_ndvi_min: 0.24, dry_land_ndvi_max: 0.54, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.02, water_mndwi_min: 0.16, water_ndvi_max: 0.0 } },
            'lahan_kritis_kebakaran': { name: 'Lahan Bekas Kebakaran', description: 'Vulnerable terhadap deteksi tanah kosong', params: { forest_ndvi_min: 0.46, dry_land_ndvi_min: 0.16, dry_land_ndvi_max: 0.42, bare_soil_ndvi_max: 0.12, bare_soil_ndbi_min: -0.04, water_mndwi_min: 0.15, water_ndvi_max: 0.05 } },
            'pemukiman_pinggir_sungai': { name: 'Pemukiman Bantaran Sungai', description: 'Campuran atap dan air sungai (IKN/Pontianak)', params: { forest_ndvi_min: 0.48, dry_land_ndvi_min: 0.18, dry_land_ndvi_max: 0.45, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: -0.06, water_mndwi_min: 0.1, water_ndvi_max: 0.05 } },
            'hutan_pantai_mangrove': { name: 'Hutan Pantai & Mangrove', description: 'Area transisi pesisir laut', params: { forest_ndvi_min: 0.56, dry_land_ndvi_min: 0.2, dry_land_ndvi_max: 0.56, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: 0.01, water_mndwi_min: 0.12, water_ndvi_max: 0.02 } },
            'hutan_lindung_pegunungan': { name: 'Hutan Lindung Pegunungan', description: 'Topografi miring, kanopi sangat lebat', params: { forest_ndvi_min: 0.7, dry_land_ndvi_min: 0.35, dry_land_ndvi_max: 0.7, bare_soil_ndvi_max: 0.3, bare_soil_ndbi_min: 0.05, water_mndwi_min: 0.22, water_ndvi_max: -0.1 } }
        }
    },
    'jawa_bali': {
        name: 'Jawa & Bali',
        description: 'Area padat penduduk dengan pertanian intensif',
        variants: {
            'hutan_pegunungan_tinggi': { name: 'Hutan Pegunungan (Gede/Semeru)', description: 'Taman Nasional dataran tinggi', params: { forest_ndvi_min: 0.72, dry_land_ndvi_min: 0.35, dry_land_ndvi_max: 0.72, bare_soil_ndvi_max: 0.3, bare_soil_ndbi_min: 0.06, water_mndwi_min: 0.18, water_ndvi_max: -0.1 } },
            'hutan_jati_meranggas': { name: 'Hutan Jati (Fase Meranggas)', description: 'Hutan musim saat daun rontok', params: { forest_ndvi_min: 0.45, dry_land_ndvi_min: 0.22, dry_land_ndvi_max: 0.45, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.01, water_mndwi_min: 0.08, water_ndvi_max: 0.03 } },
            'perkebunan_teh_kopi': { name: 'Perkebunan Teh/Kopi', description: 'Tanaman perkebunan dataran tinggi', params: { forest_ndvi_min: 0.58, dry_land_ndvi_min: 0.26, dry_land_ndvi_max: 0.58, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.02, water_mndwi_min: 0.12, water_ndvi_max: 0.0 } },
            'sawah_fase_generatif': { name: 'Sawah (Hijau)', description: 'Padi sedang tumbuh subur', params: { forest_ndvi_min: 0.5, dry_land_ndvi_min: 0.24, dry_land_ndvi_max: 0.5, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.0, water_mndwi_min: 0.1, water_ndvi_max: 0.02 } },
            'sawah_fase_bera': { name: 'Sawah (Bera/Kosong)', description: 'Setelah panen, tanah terbuka atau banyer', params: { forest_ndvi_min: 0.42, dry_land_ndvi_min: 0.15, dry_land_ndvi_max: 0.35, bare_soil_ndvi_max: 0.08, bare_soil_ndbi_min: -0.05, water_mndwi_min: 0.25, water_ndvi_max: 0.08 } },
            'urban_megapolitan_dki': { name: 'Kawasan Inti Jakarta/Surabaya', description: 'Beton dominan, aspal, bangunan tinggi', params: { forest_ndvi_min: 0.55, dry_land_ndvi_min: 0.12, dry_land_ndvi_max: 0.35, bare_soil_ndvi_max: 0.08, bare_soil_ndbi_min: -0.15, water_mndwi_min: 0.05, water_ndvi_max: 0.1 } },
            'suburban_perumahan': { name: 'Suburban / Perumahan', description: 'Pemukiman terencana dengan sedikit taman', params: { forest_ndvi_min: 0.48, dry_land_ndvi_min: 0.18, dry_land_ndvi_max: 0.42, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: -0.08, water_mndwi_min: 0.08, water_ndvi_max: 0.05 } },
            'kawasan_industri': { name: 'Kawasan Industri (Pabrik)', description: 'Atap seng/metal luas (NDBI sangat rendah)', params: { forest_ndvi_min: 0.52, dry_land_ndvi_min: 0.14, dry_land_ndvi_max: 0.38, bare_soil_ndvi_max: 0.1, bare_soil_ndbi_min: -0.2, water_mndwi_min: 0.05, water_ndvi_max: 0.12 } },
            'tegalan_ladang': { name: 'Tegalan / Lahan Kering', description: 'Tanaman palawija di musim kemarau', params: { forest_ndvi_min: 0.46, dry_land_ndvi_min: 0.2, dry_land_ndvi_max: 0.46, bare_soil_ndvi_max: 0.16, bare_soil_ndbi_min: -0.01, water_mndwi_min: 0.05, water_ndvi_max: 0.04 } },
            'tambak_pesisir': { name: 'Area Tambak Pesisir', description: 'Campuran lahan basah dan air tenang', params: { forest_ndvi_min: 0.4, dry_land_ndvi_min: 0.15, dry_land_ndvi_max: 0.35, bare_soil_ndvi_max: 0.12, bare_soil_ndbi_min: -0.03, water_mndwi_min: 0.0, water_ndvi_max: 0.1 } }
        }
    },
    'sulawesi': {
        name: 'Sulawesi',
        description: 'Hutan tropis pegunungan dengan topografi kompleks',
        variants: {
            'hutan_pegunungan_ultramafik': { name: 'Rimba Ultramafik', description: 'Hutan spesifik di atas tanah kaya nikel', params: { forest_ndvi_min: 0.65, dry_land_ndvi_min: 0.25, dry_land_ndvi_max: 0.65, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.08, water_mndwi_min: 0.18, water_ndvi_max: -0.1 } },
            'hutan_primer_lekukan': { name: 'Primer Lekukan Dalam', description: 'Hutan lebat di lembah-lembah curam', params: { forest_ndvi_min: 0.73, dry_land_ndvi_min: 0.38, dry_land_ndvi_max: 0.73, bare_soil_ndvi_max: 0.32, bare_soil_ndbi_min: 0.05, water_mndwi_min: 0.22, water_ndvi_max: -0.1 } },
            'kebun_cengkeh_kakao': { name: 'Perkebunan Rakyat (Cengkeh/Kakao)', description: 'Agroforest campuran yang tampak hijau', params: { forest_ndvi_min: 0.58, dry_land_ndvi_min: 0.24, dry_land_ndvi_max: 0.58, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.02, water_mndwi_min: 0.12, water_ndvi_max: 0.0 } },
            'kebun_kelapa_pesisir': { name: 'Kebun Kelapa Pesisir', description: 'Dominasi kelapa di sepanjang pantai', params: { forest_ndvi_min: 0.52, dry_land_ndvi_min: 0.18, dry_land_ndvi_max: 0.52, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: 0.01, water_mndwi_min: 0.08, water_ndvi_max: 0.04 } },
            'area_tambang_nikel': { name: 'Pertambangan Nikel (Open Pit)', description: 'Tanah merah laterit terbuka luas', params: { forest_ndvi_min: 0.56, dry_land_ndvi_min: 0.15, dry_land_ndvi_max: 0.45, bare_soil_ndvi_max: 0.1, bare_soil_ndbi_min: -0.04, water_mndwi_min: 0.05, water_ndvi_max: 0.08 } },
            'kota_teluk_makassar': { name: 'Kota Teluk (Makassar/Manado)', description: 'Area urban pesisir dengan reklamasi', params: { forest_ndvi_min: 0.53, dry_land_ndvi_min: 0.16, dry_land_ndvi_max: 0.42, bare_soil_ndvi_max: 0.12, bare_soil_ndbi_min: -0.09, water_mndwi_min: 0.02, water_ndvi_max: 0.06 } },
            'hutan_mangrove_sekayu': { name: 'Mangrove & Nipah', description: 'Vegetasi payau di muara sungai', params: { forest_ndvi_min: 0.5, dry_land_ndvi_min: 0.18, dry_land_ndvi_max: 0.5, bare_soil_ndvi_max: 0.12, bare_soil_ndbi_min: 0.02, water_mndwi_min: 0.1, water_ndvi_max: 0.08 } },
            'padang_penggembalaan': { name: 'Padang Penggembalaan', description: 'Area rumput terbuka di lembah Napu/Bada', params: { forest_ndvi_min: 0.48, dry_land_ndvi_min: 0.22, dry_land_ndvi_max: 0.48, bare_soil_ndvi_max: 0.18, bare_soil_ndbi_min: 0.05, water_mndwi_min: 0.08, water_ndvi_max: 0.02 } },
            'pertanian_sawah_irigasi': { name: 'Sawah Irigasi (Sidrap/Pinrang)', description: 'Lumbung pangan Sulawesi Selatan', params: { forest_ndvi_min: 0.49, dry_land_ndvi_min: 0.2, dry_land_ndvi_max: 0.49, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: 0.0, water_mndwi_min: 0.15, water_ndvi_max: 0.04 } },
            'hutan_sekunder_belukar': { name: 'Hutan Sekunder & Belukar', description: 'Bekas ladang berpindah yang ditinggalkan', params: { forest_ndvi_min: 0.55, dry_land_ndvi_min: 0.23, dry_land_ndvi_max: 0.55, bare_soil_ndvi_max: 0.18, bare_soil_ndbi_min: 0.01, water_mndwi_min: 0.1, water_ndvi_max: 0.02 } }
        }
    },
    'nusa_tenggara': {
        name: 'Nusa Tenggara',
        description: 'Iklim kering dengan vegetasi savana',
        variants: {
            'hutan_monsun_primer': { name: 'Hutan Monsun Primer', description: 'Sangat hijau di musim hujan, coklat di kemarau', params: { forest_ndvi_min: 0.6, dry_land_ndvi_min: 0.28, dry_land_ndvi_max: 0.6, bare_soil_ndvi_max: 0.22, bare_soil_ndbi_min: 0.08, water_mndwi_min: 0.12, water_ndvi_max: -0.05 } },
            'savana_rumput_sumba': { name: 'Pusaka Savana (Sumba)', description: 'Hamparan rumput luas dengan sedikit pohon', params: { forest_ndvi_min: 0.42, dry_land_ndvi_min: 0.18, dry_land_ndvi_max: 0.42, bare_soil_ndvi_max: 0.12, bare_soil_ndbi_min: 0.04, water_mndwi_min: 0.05, water_ndvi_max: 0.05 } },
            'hutan_kering_pegunungan': { name: 'Hutan Kering Pegunungan', description: 'Area pegunungan Flores/Timor', params: { forest_ndvi_min: 0.55, dry_land_ndvi_min: 0.24, dry_land_ndvi_max: 0.55, bare_soil_ndvi_max: 0.18, bare_soil_ndbi_min: 0.06, water_mndwi_min: 0.08, water_ndvi_max: 0.0 } },
            'ladang_kemiri_jambu': { name: 'Ladang Kemiri / Jambu Mete', description: 'Budidaya tanaman keras rakyat NT', params: { forest_ndvi_min: 0.48, dry_land_ndvi_min: 0.2, dry_land_ndvi_max: 0.48, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: 0.02, water_mndwi_min: 0.06, water_ndvi_max: 0.03 } },
            'kawasan_karst_gersang': { name: 'Kawasan Karst Gersang', description: 'Area kapur sangat terbuka', params: { forest_ndvi_min: 0.4, dry_land_ndvi_min: 0.12, dry_land_ndvi_max: 0.35, bare_soil_ndvi_max: 0.08, bare_soil_ndbi_min: 0.01, water_mndwi_min: 0.05, water_ndvi_max: 0.08 } },
            'pemukiman_tradisional': { name: 'Pemukiman & Lahan Terbangun', description: 'Bangunan dengan material lokal/modern', params: { forest_ndvi_min: 0.45, dry_land_ndvi_min: 0.15, dry_land_ndvi_max: 0.38, bare_soil_ndvi_max: 0.1, bare_soil_ndbi_min: -0.06, water_mndwi_min: 0.02, water_ndvi_max: 0.05 } },
            'hutan_mangrove_pesisir': { name: 'Mangrove Pesisir Kering', description: 'Hutan payau di iklim kering', params: { forest_ndvi_min: 0.48, dry_land_ndvi_min: 0.18, dry_land_ndvi_max: 0.48, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: 0.03, water_mndwi_min: 0.08, water_ndvi_max: 0.06 } },
            'danau_embung_asri': { name: 'Embung / Waduk Kecil', description: 'Sumber air krusial di wilayah kering', params: { forest_ndvi_min: 0.5, dry_land_ndvi_min: 0.2, dry_land_ndvi_max: 0.5, bare_soil_ndvi_max: 0.18, bare_soil_ndbi_min: 0.0, water_mndwi_min: -0.05, water_ndvi_max: 0.12 } },
            'semak_belukar_berduri': { name: 'Semak Belukar Berduri', description: 'Vegetasi transisi antara savana dan hutan', params: { forest_ndvi_min: 0.46, dry_land_ndvi_min: 0.22, dry_land_ndvi_max: 0.46, bare_soil_ndvi_max: 0.18, bare_soil_ndbi_min: 0.03, water_mndwi_min: 0.06, water_ndvi_max: 0.02 } },
            'pantai_pasir_putih': { name: 'Lahan Terbuka Pesisir (Kuta/Mandalika)', description: 'Area wisata dengan banyak tanah terbuka/pembangunan', params: { forest_ndvi_min: 0.44, dry_land_ndvi_min: 0.15, dry_land_ndvi_max: 0.38, bare_soil_ndvi_max: 0.1, bare_soil_ndbi_min: -0.05, water_mndwi_min: 0.04, water_ndvi_max: 0.08 } }
        }
    },
    'papua_maluku': {
        name: 'Papua & Maluku',
        description: 'Hutan hujan tropis biodiversitas tinggi',
        variants: {
            'rimba_papua_lebat': { name: 'Hutan Rimba (Primer)', description: 'Kanopi sangat rapat, sulit ditembus cahaya', params: { forest_ndvi_min: 0.75, dry_land_ndvi_min: 0.42, dry_land_ndvi_max: 0.75, bare_soil_ndvi_max: 0.35, bare_soil_ndbi_min: 0.06, water_mndwi_min: 0.22, water_ndvi_max: -0.15 } },
            'hutan_rawa_sagu': { name: 'Hutan Rawa Sagu', description: 'Khas papua selatan dan daerah pesisir', params: { forest_ndvi_min: 0.62, dry_land_ndvi_min: 0.22, dry_land_ndvi_max: 0.62, bare_soil_ndvi_max: 0.18, bare_soil_ndbi_min: 0.02, water_mndwi_min: 0.3, water_ndvi_max: -0.04 } },
            'hutan_pegunungan_pepaku': { name: 'Pegunungan Tinggi (Puncak Jaya)', description: 'Vegetasi pegunungan di atas 2000 mdpl', params: { forest_ndvi_min: 0.68, dry_land_ndvi_min: 0.3, dry_land_ndvi_max: 0.68, bare_soil_ndvi_max: 0.25, bare_soil_ndbi_min: 0.07, water_mndwi_min: 0.2, water_ndvi_max: -0.05 } },
            'savana_merauke_wasur': { name: 'Savana Wasur (Merauke)', description: 'Are padang rumput di selatan Papua', params: { forest_ndvi_min: 0.48, dry_land_ndvi_min: 0.2, dry_land_ndvi_max: 0.48, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: 0.04, water_mndwi_min: 0.08, water_ndvi_max: 0.02 } },
            'pulau_kecil_rempah': { name: 'Hutan Pulau Kecil (Maluku)', description: 'Vegetasi rapat di pulau-pulau vulkanik kecil', params: { forest_ndvi_min: 0.58, dry_land_ndvi_min: 0.24, dry_land_ndvi_max: 0.58, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.01, water_mndwi_min: 0.1, water_ndvi_max: 0.03 } },
            'perkebunan_sawit_papua': { name: 'Perkebunan Sawit (MIMIKA/Boven)', description: 'Area perkebunan skala industri di Papua', params: { forest_ndvi_min: 0.55, dry_land_ndvi_min: 0.25, dry_land_ndvi_max: 0.55, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.02, water_mndwi_min: 0.15, water_ndvi_max: 0.0 } },
            'bekas_tambang_grasberg': { name: 'Area Infrastruktur Tambang', description: 'Area perkerasan bangunan infrastruktur besar', params: { forest_ndvi_min: 0.5, dry_land_ndvi_min: 0.15, dry_land_ndvi_max: 0.4, bare_soil_ndvi_max: 0.12, bare_soil_ndbi_min: -0.1, water_mndwi_min: 0.08, water_ndvi_max: 0.05 } },
            'urban_jayapura_ambon': { name: 'Pusat Kota (Jayapura/Ambon)', description: 'Kota berbukit di pinggir pantai', params: { forest_ndvi_min: 0.52, dry_land_ndvi_min: 0.18, dry_land_ndvi_max: 0.42, bare_soil_ndvi_max: 0.15, bare_soil_ndbi_min: -0.07, water_mndwi_min: 0.04, water_ndvi_max: 0.06 } },
            'mangrove_teluk_bintuni': { name: 'Raksasa Mangrove Bintuni', description: 'Ekosistem mangrove terluas di dunia', params: { forest_ndvi_min: 0.54, dry_land_ndvi_min: 0.22, dry_land_ndvi_max: 0.54, bare_soil_ndvi_max: 0.18, bare_soil_ndbi_min: 0.03, water_mndwi_min: 0.12, water_ndvi_max: 0.08 } },
            'lahan_terbuka_hutan_sekunder': { name: 'Transisi Sekunder & Ladang', description: 'Area bekas pembukaan lahan tradisional', params: { forest_ndvi_min: 0.56, dry_land_ndvi_min: 0.26, dry_land_ndvi_max: 0.56, bare_soil_ndvi_max: 0.2, bare_soil_ndbi_min: 0.02, water_mndwi_min: 0.1, water_ndvi_max: 0.02 } }
        }
    }
};

// Konfigurasi Kategori Tutupan Lahan - 9 Kelas (Sub-klasifikasi Hutan)
export const LAND_COVER_CONFIG = {
    hutan_primer: { classId: 1, color: "#006400", label: "Hutan Primer", shortLabel: "H.Primer" },
    hutan_sekunder: { classId: 2, color: "#32CD32", label: "Hutan Sekunder", shortLabel: "H.Sekunder" },
    tanah_kering: { classId: 3, color: "#DAA520", label: "Tanah Kering (Semak/Pertanian Lahan Kering)", shortLabel: "T.Kering" },
    tanah_kosong: { classId: 4, color: "#D2691E", label: "Tanah Kosong (Terbuka)", shortLabel: "T.Kosong" },
    air: { classId: 5, color: "#1E90FF", label: "Air (Sungai/Danau)", shortLabel: "Air" },
    lahan_terbangun: { classId: 6, color: "#708090", label: "Lahan Terbangun (Urban)", shortLabel: "Terbangun" }
};

export const MAP_TILES = {
    SENTINEL_RGB: { name: "Sentinel-2 Imagery (Auto-Year)", url: null }, // Managed by rgbMapUrl
    satellite: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        name: "Satelit High-Res"
    },
    default: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", name: "Peta (OSM)" }
};

export const CALIBRATION_DEFAULTS = {
    forest_ndvi_min: 0.6,
    dry_land_ndvi_min: 0.2,
    dry_land_ndvi_max: 0.6,
    bare_soil_ndvi_max: 0.2,
    bare_soil_ndbi_min: 0.0,
    water_mndwi_min: 0.1,
    water_ndvi_max: 0.0
};

// SIGAP Services Configuration (Centralized for Proxy Support)
export const SIGAP_CONFIG = {
    // Uses Backend Proxy to cache tiles (7 Days Expiry)
    KAWASAN_HUTAN: `${API_URL}/proxy/sigap/Kawasan_Hutan/MapServer`,
    DAS: `${API_URL}/proxy/sigap/Klasifikasi_DAS/MapServer`
};

// NASA FIRMS Hotspot API (Fire Information for Resource Management System)
// Source: https://firms.modaps.eosdis.nasa.gov/
export const NASA_FIRMS_CONFIG = {
    // Backend proxy endpoint for NASA FIRMS data
    PROXY_URL: `${API_URL}/proxy/nasa/hotspot`,
    // Available satellite sources
    SOURCES: {
        VIIRS_SNPP: 'VIIRS_SNPP_NRT',  // Suomi NPP satellite (375m resolution)
        VIIRS_NOAA20: 'VIIRS_NOAA20_NRT',  // NOAA-20 satellite (375m resolution)
        MODIS_TERRA: 'MODIS_NRT',  // Terra & Aqua combined (1km resolution)
    },
    DEFAULT_SOURCE: 'VIIRS_SNPP_NRT'  // Use VIIRS for better resolution
};

