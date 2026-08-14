# Peta Freezer — Toko, Inspector & Lokasi

Web statis untuk melihat data `ASSET_FREEZER_IN_USE.xlsx`: **nama toko**, **inspector**
yang terakhir memeriksa, dan **lokasinya di peta**.

## Dua versi

| Versi | Berkas | Peta dasar |
| --- | --- | --- |
| Lengkap | `index.html` | tile OpenStreetMap (butuh internet, ada jalan dan nama tempat) |
| Satu berkas | `dist/peta-freezer.html` | garis pantai Natural Earth (jalan tetap sekali klik lewat tombol Buka Maps) |

Versi satu berkas menyisipkan seluruh CSS, JavaScript, font, dan data ke dalam
satu HTML. Berguna untuk dikirim lewat chat/email atau dipasang di tempat yang
memblokir permintaan ke host luar.

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
- **Lokasi saya** — tombol bidik di bawah tombol zoom menyalakan GPS. Posisi
  Anda muncul sebagai titik dengan lingkaran akurasi, tiap kartu menampilkan
  jaraknya, dan daftar otomatis diurutkan dari yang terdekat — jadi kartu
  teratas selalu freezer paling dekat. Posisi ikut diperbarui selama berpindah.
- **Detail** — klik titik di peta untuk melihat data lengkap unit, tombol
  **Telepon** untuk menghubungi PIC toko, dan tombol Google Maps yang berubah
  jadi **Rute ke sini** (petunjuk arah dari posisi Anda) begitu GPS menyala.

Di layar kecil, daftar dan peta bergantian lewat tab di bagian bawah.

> **Catatan GPS.** Browser hanya mengizinkan deteksi lokasi di halaman `https`
> (atau `localhost`). Berkas yang dibuka lewat dobel-klik memakai alamat
> `file://`, sehingga tombol lokasi akan menolak dan menampilkan keterangannya.
> Untuk memakai fitur ini, buka lewat link online.

## Struktur folder

```
index.html                 halaman utama
assets/app.css             tampilan (token warna, tema terang + gelap)
assets/app.js              logika filter, daftar, dan peta
assets/fonts.css           IBM Plex (OFL 1.1)
assets/fonts/              berkas woff2
assets/vendor/             Leaflet 1.9.4 + Leaflet.markercluster 1.5.3 (offline)
data/ASSET_FREEZER_IN_USE.xlsx  data sumber
data/freezers.js           hasil konversi xlsx (dipakai web)
data/basemap.js            garis pantai untuk versi satu berkas
dist/peta-freezer.html     hasil rakitan satu berkas
scripts/build_data.py      konverter xlsx -> freezers.js
scripts/build_basemap.js   pembuat basemap.js dari Natural Earth
scripts/build_artifact.py  perakit dist/peta-freezer.html
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

Lalu rakit ulang versi satu berkas:

```bash
python3 scripts/build_artifact.py
```

Perakit ini juga memeriksa palet tema gelap yang ditulis dua kali di `app.css`
(satu untuk `prefers-color-scheme`, satu untuk `[data-theme="dark"]`) dan berhenti
kalau keduanya tidak sama.

`data/basemap.js` hanya perlu dibuat ulang kalau cakupan wilayahnya berubah:

```bash
npm i world-atlas@2 topojson-client
node scripts/build_basemap.js
```

## Catatan data

- Kolom `LATITUDE AND LONGITUDE` dipecah jadi `lat`/`lng`; semua 3.133 baris punya
  koordinat valid dan berada di sekitar Serang–Cilegon, Banten.
- Kolom yang kosong di seluruh baris (`OUTLETS CATEGORY`, `AUDIT STATUS`, `VILLAGE`,
  `SUBDISTRICT`, `POSM`, `COMMENT`) tidak ikut ditampilkan.
- Kolom foto (`View Photo`) tidak dibawa karena isinya bukan URL, hanya teks.
- Arti warna pada `STATUS ICON` ditampilkan apa adanya (Biru/Kuning/Merah) tanpa
  ditafsirkan, karena keterangannya tidak ada di file sumber.
