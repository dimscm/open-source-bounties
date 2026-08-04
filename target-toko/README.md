# Ikat Target Toko

Halaman web sekali-file untuk tim sales: tiap outlet menampilkan target bulanan
dan sales memilih dasar perhitungannya — **nilai tengah (Mid)** atau **nilai
tertinggi (Max)** dari tiga rata-rata penjualan per minggu.

## Kenapa

Di spreadsheet sumber, kolom `PILIHAN TARGET` selalu memakai angka tertinggi
dari tiga periode (dicek: 201 dari 201 baris). Outlet yang kebetulan punya satu
kuartal bagus jadi terikat target itu seterusnya. Halaman ini membuka opsi
nilai tengah, dan menghitung selisihnya supaya keputusannya terlihat.

## Rumus

Mengikuti spreadsheet, tanpa perubahan:

```
target/minggu = dasar terpilih × (1 + %UP)
target bulan  = target/minggu × 4
target triwulan = target/minggu × 13
```

`%UP` dan zona/paket diambil apa adanya dari sheet. Semua angka dalam karton.

## Build

Spreadsheet berisi beberapa blok tabel yang ditumpuk ke bawah — satu blok per
versi target, dengan susunan kolom yang berbeda-beda. `build/build.py` memuat
peta blok itu dan mengubah ekspor sheet jadi satu berkas HTML.

```
cd build
# taruh ekspor teks/markdown dari Google Sheets sebagai sheet-export.txt
python3 build.py     # menulis ../index.html
```

Build akan memperingatkan kalau pola "ambil tertinggi" tidak lagi berlaku di
semua baris — pertanda susunan kolom sheet berubah dan peta blok di `BLOCKS`
perlu disesuaikan.

## Catatan data

`sheet-export.txt` dan `index.html` hasil build **tidak di-commit** (lihat
`.gitignore`): keduanya memuat nama outlet, alamat, nama sales, dan angka
penjualan. Yang tersimpan di repo hanya template dan skrip build-nya.

Pilihan Mid/Max tersimpan di `localStorage` peramban masing-masing sales, jadi
tidak terkumpul otomatis. Sales menyetorkannya lewat tombol **Unduh CSV** atau
**Salin ringkasan**. Untuk pengumpulan terpusat, halaman ini perlu backend.
