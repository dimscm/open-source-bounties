# Peta Freezer — Toko, Inspector, Order & Lokasi

Web statis untuk memetakan unit freezer dari file Excel ekspor aset: **nama toko**,
**inspector** terakhir, **rata-rata order 3 bulan terakhir (L3M)**, dan **lokasinya
di peta** — termasuk mencari unit terdekat dari posisi Anda.

## Cara pakai

Ada dua peran:

| Peran | Cara buka | Bisa apa |
| --- | --- | --- |
| **Pengunjung** | link biasa | melihat peta & daftar, cari, filter, urutkan, lokasi terdekat |
| **Admin** | link + `?admin` | semua di atas, plus **Upload data baru** untuk semua orang |

Pengunjung tidak melihat tombol unggah sama sekali. Hak mengubah data bukan kata
sandi di halaman, melainkan **izin tulis GitHub** ke repo ini — tanpa token yang
sah, perubahan tidak bisa masuk walau seseorang menemukan link `?admin`.

### Masuk sebagai admin (sekali per perangkat)

1. Buat token GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
   - *Repository access*: **Only select repositories** → `open-source-bounties`
   - *Permissions → Repository permissions → Contents*: **Read and write**
   - *Expiration*: sesuai kebutuhan (mis. 1 tahun) → **Generate token** → salin
     token `github_pat_…`
2. Buka link web dengan tambahan `?admin` di belakang, tempel token, **Masuk**.
3. Token disimpan di browser perangkat itu saja. **Keluar admin** menghapusnya.

### Memperbarui data

Sebagai admin, tekan **Upload data baru** dan pilih file Excel terbaru (nama file
bebas). File dicek dulu di browser — kalau kolom wajib tidak ada atau tidak ada
koordinat yang valid, file ditolak dan data lama tetap dipakai. Kalau valid, file
disimpan ke repo sebagai `data/data-freezer.xlsx` dan tampil untuk semua orang
dalam 1–3 menit.

Tanpa token pun data tetap bisa diperbarui manual: ganti nama file jadi
`data-freezer.xlsx`, lalu di GitHub buka folder `data` pada branch yang dipakai
Pages → **Add file → Upload files** → **Commit changes**.

> **Data ini publik.** Siapa pun yang punya link — atau membuka repo — bisa melihat
> seluruh isi file, termasuk nama PIC dan nomor telepon toko.

Belum punya file-nya? Admin bisa menekan **Unduh template** di layar unggah — isinya kolom yang sama persis
dengan template tim, plus sheet *Petunjuk*.

### Kolom yang dibaca

| Kolom | Keterangan |
| --- | --- |
| `OUTLET` | **wajib** — nama toko |
| `LATITUDE AND LONGITUDE` | **wajib** — format `-6.1234567, 106.1234567` |
| `AVG L3M` | rata-rata order 3 bulan terakhir. Sel `#N/A` dibaca "tidak ada data", bukan nol |
| `Omzet …` | kolom yang namanya diawali "Omzet" (mis. `Omzet Sept`, `Omzet Okt`) ikut tampil dengan nama aslinya |
| `LAST INSPECTOR`, `CODE OUTLET`, `OUTLETS ADDRESS`, `OUTLETS CONTACTPERSON`, `OUTLETSPHONE`, `STATUS ICON`, `FREEZER MODEL`, dst. | ditampilkan kalau ada; boleh kosong |

Baris judul dicari otomatis di 10 baris pertama tiap sheet, jadi nama sheet dan
judul laporan di atas tabel tidak masalah. Baris tanpa koordinat valid dilewati,
dan jumlahnya dilaporkan setelah unggah.

## Isi web

- **Peta** — titik unit freezer, dikelompokkan otomatis saat di-zoom out. Warna
  titik mengikuti kolom `STATUS ICON`: biru, kuning, merah.
- **Daftar** — kartu berisi nama toko, inspector, kode outlet, **L3M**, dan alamat.
  Klik kartu untuk meluncur ke titiknya di peta.
- **Order L3M** — filter kelompok *Tinggi (≥ 15)*, *Sedang (5–15)*, *Rendah (< 5)*,
  *Tidak ada data*; dan urutan *L3M tertinggi / terendah* (unit tanpa data selalu
  di bawah). Batas kelompok diambil dari sebaran data: kuartil bawah ±4,7 dan
  kuartil atas ±13,7.
- **Lokasi saya** — tombol bidik di bawah tombol zoom menyalakan GPS. Posisi Anda
  tampil sebagai **titik ungu berdenyut** (sengaja beda warna dan bentuk dari titik
  freezer), tiap kartu menampilkan jaraknya, dan daftar diurutkan dari yang terdekat.
- **Detail** — avg order 3 bulan dan omzet di bagian atas, lalu data unit, tombol
  **Telepon**, dan tombol Google Maps yang berubah jadi **Rute ke sini** begitu GPS menyala.
- **Pencarian** — nama toko, kode outlet, alamat, PIC, telepon, inspector, serial, QR.

Di layar kecil, daftar dan peta bergantian lewat tab di bawah, dan filter dilipat
di balik tombol **Filter & urutan** supaya daftar lebih lega.

> **Catatan GPS.** Browser hanya mengizinkan deteksi lokasi di halaman `https`
> (atau `localhost`). Berkas yang dibuka lewat dobel-klik memakai `file://`, jadi
> tombol lokasi menolak dan menampilkan keterangannya.

## Dua versi

| Versi | Berkas | Peta dasar |
| --- | --- | --- |
| Lengkap | `index.html` | tile OpenStreetMap (ada jalan dan nama tempat) |
| Satu berkas | `dist/peta-freezer.html` | garis pantai Natural Earth — tanpa data bersama, harus unggah file |

Versi satu berkas menyisipkan seluruh CSS, JavaScript, dan font ke dalam satu HTML
(±0,7 MB) — berguna untuk dikirim lewat chat atau dipasang di tempat yang memblokir
host luar. Versi ini tidak membawa data bersama, jadi selalu dimulai dari layar unggah.

## Struktur folder

```
index.html                 halaman utama
assets/app.css             tampilan (token warna, tema terang + gelap)
assets/app.js              unggah & baca Excel, filter, daftar, peta, lokasi
assets/fonts.css           IBM Plex (OFL 1.1)
assets/fonts/              berkas woff2
assets/vendor/             Leaflet 1.9.4, Leaflet.markercluster 1.5.3,
                           SheetJS 0.18.5 (xlsx.mini) — semuanya offline
data/data-freezer.xlsx     data bersama yang tampil untuk semua pengunjung
data/basemap.js            garis pantai untuk versi satu berkas
dist/peta-freezer.html     hasil rakitan satu berkas
scripts/build_basemap.js   pembuat basemap.js dari Natural Earth
scripts/build_artifact.py  perakit dist/peta-freezer.html
```

Setelah mengubah `index.html` atau `assets/`, rakit ulang versi satu berkas:

```bash
python3 scripts/build_artifact.py
```

Perakit ini juga memeriksa palet tema gelap yang ditulis dua kali di `app.css`
(untuk `prefers-color-scheme` dan `[data-theme="dark"]`) dan berhenti kalau
keduanya berbeda.

## Catatan

- **SheetJS 0.18.5** adalah rilis terakhir di npm dan punya dua celah yang sudah
  diketahui (prototype pollution dan ReDoS) yang hanya terpicu oleh file Excel yang
  sengaja dibuat berbahaya. Versi perbaikannya hanya tersedia di CDN SheetJS. Di sini
  file yang dibaca adalah ekspor internal milik pengguna sendiri dan diproses di
  browsernya saja, jadi risikonya terbatas — tapi jangan unggah file Excel dari
  sumber yang tidak dipercaya.
- Arti warna `STATUS ICON` ditampilkan apa adanya (Biru/Kuning/Merah), karena
  keterangannya tidak ada di file sumber.
