# Peta Freezer — Toko, Inspector & Lokasi

Web statis untuk melihat data `ASSET_FREEZER_IN_USE.xlsx`: **nama toko**, **inspector**
yang terakhir memeriksa, dan **lokasinya di peta**.

## Cara membuka

Buka `index.html` lewat browser (bisa langsung dobel-klik, tidak perlu server).
Semua library sudah disimpan lokal di `assets/vendor/`, jadi yang butuh internet
hanya gambar peta (tile OpenStreetMap).

Kalau mau dijalankan lewat server lokal:

```bash
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

Untuk online, folder ini bisa langsung di-hosting di GitHub Pages / Netlify apa adanya.

## Isi web

- **Peta** — 3.133 titik unit freezer, dikelompokkan otomatis (cluster) saat di-zoom out.
  Warna titik mengikuti kolom `STATUS ICON`: biru, kuning, merah.
- **Daftar** — kartu berisi nama toko, inspector, tanggal inspeksi terakhir,
  kode outlet, dan alamat. Klik kartu untuk langsung meluncur ke titiknya di peta.
- **Pencarian** — cocokkan kata kunci ke nama toko, kode outlet, alamat, PIC,
  nomor telepon, inspector, serial number, dan QR code. Beberapa kata dicari
  sekaligus (semua harus cocok).
- **Filter** — inspector, status, model freezer, dan status distribusi.
  Peta ikut menyesuaikan ke area hasil filter.
- **Detail** — klik titik di peta untuk melihat data lengkap unit, tombol
  **Buka Maps** (Google Maps) dan **Telepon** untuk menghubungi PIC toko.

Di layar kecil, daftar dan peta bergantian lewat tab di bagian bawah.

## Struktur folder

```
index.html            halaman utama
assets/app.css        tampilan
assets/app.js         logika filter, daftar, dan peta
assets/vendor/        Leaflet 1.9.4 + Leaflet.markercluster 1.5.3 (offline)
data/ASSET_FREEZER_IN_USE.xlsx   data sumber
data/freezers.js      hasil konversi xlsx (dipakai web)
scripts/build_data.py konverter xlsx -> freezers.js
```

## Memperbarui data

Ganti `data/ASSET_FREEZER_IN_USE.xlsx` dengan file baru (nama kolom harus sama),
lalu jalankan:

```bash
pip install openpyxl
python3 scripts/build_data.py
```

Script akan menulis ulang `data/freezers.js`. Baris yang koordinatnya kosong atau
tidak valid akan dilewati dan jumlahnya dilaporkan di terminal.

## Catatan data

- Kolom `LATITUDE AND LONGITUDE` dipecah jadi `lat`/`lng`; semua 3.133 baris punya
  koordinat valid dan berada di sekitar Serang–Cilegon, Banten.
- Kolom yang kosong di seluruh baris (`OUTLETS CATEGORY`, `AUDIT STATUS`, `VILLAGE`,
  `SUBDISTRICT`, `POSM`, `COMMENT`) tidak ikut ditampilkan.
- Kolom foto (`View Photo`) tidak dibawa karena isinya bukan URL, hanya teks.
- Arti warna pada `STATUS ICON` ditampilkan apa adanya (Biru/Kuning/Merah) tanpa
  ditafsirkan, karena keterangannya tidak ada di file sumber.
