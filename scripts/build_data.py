#!/usr/bin/env python3
"""Ubah ASSET_FREEZER_IN_USE.xlsx menjadi data/freezers.js untuk dipakai web.

Pakai:
    pip install openpyxl
    python3 scripts/build_data.py

Output ditulis sebagai file JavaScript (bukan .json) supaya web tetap bisa
dibuka langsung lewat file:// tanpa perlu menjalankan server.
"""

import json
import os
import re
import sys

import openpyxl

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(BASE, "data", "ASSET_FREEZER_IN_USE.xlsx")
OUT = os.path.join(BASE, "data", "freezers.js")

# Kolom xlsx -> key ringkas yang dipakai di web.
COLUMNS = [
    ("OUTLET", "toko"),
    ("CODE OUTLET", "kode"),
    ("OUTLETS ADDRESS", "alamat"),
    ("OUTLETS CONTACTPERSON", "pic"),
    ("OUTLETSPHONE", "telp"),
    ("LAST INSPECTOR", "inspector"),
    ("LAST INSPECTED TIME", "waktu"),
    ("INSPECTION DURATION", "durasi"),
    ("INSPECTION ADDRESS", "alamatInspeksi"),
    ("QR CODE", "qr"),
    ("SERIAL NUMBER", "serial"),
    ("FREEZER MODEL", "model"),
    ("BRAND", "brand"),
    ("ASSET NAME", "asset"),
    ("ASSET PROPERTIES", "properti"),
    ("ASSET AGE", "usia"),
    ("PO YEAR", "tahunPo"),
    ("WARRANTY STATUS", "garansi"),
    ("FREEZER DISTRIBUTION STATUS", "distribusi"),
    ("STATUS ICON", "status"),
    ("DISTRICT/CITY", "kota"),
    ("PROVINCE", "provinsi"),
    ("DISTRIBUTOR NAME", "distributor"),
]


def clean(value):
    """Rapikan sel: buang spasi ganda, seragamkan format tanggal."""
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in ("none", "nan"):
        return ""
    # "2026-07-28 08:57:40.000" -> "2026-07-28 08:57"
    match = re.match(r"^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})", text)
    if match:
        return "%s %s" % match.groups()
    if re.match(r"^\d{4}-\d{2}-\d{2} 00:00:00(\.0+)?$", text):
        return text[:10]
    return re.sub(r"\s+", " ", text)


def parse_latlng(value):
    """'-6.0388627, 106.0056752' -> (-6.0388627, 106.0056752)."""
    if not value:
        return None
    parts = str(value).split(",")
    if len(parts) != 2:
        return None
    try:
        lat, lng = float(parts[0]), float(parts[1])
    except ValueError:
        return None
    if not (-11 < lat < 6 and 94 < lng < 142):  # di luar Indonesia -> buang
        return None
    return round(lat, 6), round(lng, 6)


def main():
    if not os.path.exists(XLSX):
        sys.exit("File tidak ditemukan: %s" % XLSX)

    sheet = openpyxl.load_workbook(XLSX, data_only=True, read_only=True).active
    rows = sheet.iter_rows(values_only=True)
    header = [clean(h) for h in next(rows)]
    idx = {name: i for i, name in enumerate(header)}

    missing = [src for src, _ in COLUMNS if src not in idx]
    if missing:
        sys.exit("Kolom hilang di xlsx: %s" % ", ".join(missing))

    keys = [key for _, key in COLUMNS] + ["lat", "lng"]
    records, tanpa_koordinat = [], 0

    for row in rows:
        if not any(cell is not None and str(cell).strip() for cell in row):
            continue
        coords = parse_latlng(row[idx["LATITUDE AND LONGITUDE"]])
        if coords is None:
            tanpa_koordinat += 1
            continue
        values = [clean(row[idx[src]]) for src, _ in COLUMNS]
        values += [coords[0], coords[1]]
        records.append(values)

    # Simpan sebagai array-of-array + daftar key supaya file jauh lebih kecil.
    payload = {"keys": keys, "rows": records}
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write("// File ini dibuat otomatis oleh scripts/build_data.py — jangan diedit manual.\n")
        handle.write("window.FREEZER_DATA = ")
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write(";\n")

    size_kb = os.path.getsize(OUT) / 1024
    print("OK  %d baris -> %s (%.0f KB)" % (len(records), OUT, size_kb))
    if tanpa_koordinat:
        print("    %d baris dilewati karena koordinat kosong/tidak valid" % tanpa_koordinat)


if __name__ == "__main__":
    main()
