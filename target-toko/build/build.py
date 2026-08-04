"""Ubah hasil ekspor sheet "Ikat Target Toko" jadi halaman web sekali-file.

Jalankan dari folder ini:

    python3 build.py

Input   : sheet-export.txt  (ekspor teks/markdown dari Google Sheets, tidak di-commit)
Output  : ../index.html     (template + data, tidak di-commit)

Sheet aslinya berisi beberapa blok tabel yang ditumpuk ke bawah, masing-masing
satu versi target dengan susunan kolom yang berbeda. Setiap blok didaftarkan di
BLOCKS di bawah, ditandai baris judul kolomnya.
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "sheet-export.txt")
TEMPLATE = os.path.join(HERE, "template.html")
OUT = os.path.join(HERE, os.pardir, "index.html")

# Baris judul (indeks 0-based di file ekspor) yang menandai tiap blok, beserta
# rentang baris datanya dan posisi kolom yang dipakai.
BLOCKS = [
    dict(
        key="juli-13w",
        label="Target Juli — dasar 13 minggu terakhir",
        first=4, last=83,
        avg=[(17, "13 minggu terakhir"), (18, "Q3 2025"), (19, "Q1 2026")],
        zona=21, zona_label="Paket", up=22, sheet_pick=20, sheet_week=23, sheet_month=24,
        periods=[("minggu", "per minggu", 1), ("juli", "Juli", 4)],
    ),
    dict(
        key="agustus",
        label="Target Agustus — dasar 13 minggu 2026",
        first=94, last=162,
        avg=[(17, "13 minggu 2026"), (18, "Q1 2026"), (19, "Q3 2025")],
        zona=None, zona_label="Zona", up=22, sheet_pick=20, sheet_week=None, sheet_month=23,
        periods=[("minggu", "per minggu", 1), ("agustus", "Agustus", 4)],
    ),
    dict(
        key="triwulan-1",
        label="Target triwulan Jul–Sep (versi 1)",
        first=174, last=209,
        avg=[(17, "Q1 2026"), (18, "Q2 2026"), (19, "Q3 2025")],
        zona=21, zona_label="Zona", up=22, sheet_pick=20, sheet_week=23, sheet_month=24,
        periods=[("minggu", "per minggu", 1), ("juli", "Juli", 4), ("triwulan", "Triwulan", 13)],
    ),
    dict(
        key="triwulan-2",
        label="Target triwulan Jul–Sep (versi 2)",
        first=222, last=None,
        avg=[(17, "Q1 2026"), (18, "Q2 2026"), (19, "Q3 2025")],
        zona=21, zona_label="Zona", up=22, sheet_pick=20, sheet_week=23, sheet_month=24,
        periods=[("minggu", "per minggu", 1), ("juli", "Juli", 4), ("triwulan", "Triwulan", 13)],
    ),
]

SKIP_NAMES = {"", "nama outlet", "alamat"}
SKIP_SALES = {"salesman", "sum of karton", "0"}


def cells(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip().replace("\\[merged\\] ", "").replace("\\", "") for c in line.split("|")]


def num(text):
    """Baca angka bergaya Indonesia: 1.234 ribuan, 12,5 desimal, (250) negatif."""
    text = (text or "").strip()
    negative = text.startswith("(") and text.endswith(")")
    text = re.sub(r"[^0-9.,-]", "", text)
    if not text or text in ("-", ".", ","):
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        tail = text.split(",")[-1]
        text = text.replace(",", ".") if len(tail) <= 2 else text.replace(",", "")
    else:
        parts = text.split(".")
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            text = "".join(parts)
    try:
        value = float(text)
    except ValueError:
        return None
    return -value if negative else value


def build_block(grid, spec):
    rows = []
    last = spec["last"] if spec["last"] is not None else len(grid) - 1
    for raw in grid[spec["first"]:last + 1]:
        if len(raw) < 25:
            continue
        outlet = raw[3].strip()
        sales = raw[0].strip()
        if outlet.lower() in SKIP_NAMES or sales.lower() in SKIP_SALES:
            continue
        basis = [{"label": label, "value": num(raw[i]) or 0.0} for i, label in spec["avg"]]
        if not any(b["value"] for b in basis):
            continue
        sheet_week = num(raw[spec["sheet_week"]]) if spec["sheet_week"] is not None else None
        rows.append({
            "sales": sales,
            "rayon": raw[1].strip(),
            "kode": raw[2].strip(),
            "outlet": outlet,
            "alamat": raw[4].strip(),
            "zona": raw[spec["zona"]].strip() if spec["zona"] is not None else "",
            "up": num(raw[spec["up"]]) or 0.0,
            "basis": basis,
            "sheetPick": num(raw[spec["sheet_pick"]]) or 0.0,
            "sheetWeek": sheet_week,
            "sheetMonth": num(raw[spec["sheet_month"]]),
        })
    return {
        "key": spec["key"],
        "label": spec["label"],
        "zonaLabel": spec["zona_label"],
        "periods": [{"key": k, "label": l, "weeks": w} for k, l, w in spec["periods"]],
        "rows": rows,
    }


def main():
    grid = [cells(line) for line in open(SRC, encoding="utf-8").read().split("\n")]
    blocks = [build_block(grid, spec) for spec in BLOCKS]

    total = 0
    for block in blocks:
        rows = block["rows"]
        total += len(rows)
        # Sanity check: di sheet, PILIHAN TARGET selalu nilai tertinggi dari
        # ketiga rata-rata. Kalau ini tidak lagi benar, susunan kolom berubah.
        as_max = sum(
            1 for r in rows
            if abs(r["sheetPick"] - max(b["value"] for b in r["basis"])) <= 1
        )
        print(f"{block['key']:12s} {len(rows):4d} outlet · pilihan = tertinggi pada {as_max}/{len(rows)}")
        if rows and as_max < len(rows):
            print("   PERINGATAN: ada baris yang tidak mengikuti pola 'ambil tertinggi'.")

    payload = json.dumps(blocks, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("<", "\\u003c")  # aman dibenamkan di dalam HTML

    html = open(TEMPLATE, encoding="utf-8").read()
    if "__DATA__" not in html:
        raise SystemExit("template.html tidak punya penanda __DATA__")
    open(OUT, "w", encoding="utf-8").write(html.replace("__DATA__", payload))
    print(f"\n{total} outlet · {os.path.normpath(OUT)} ({len(html) + len(payload):,} bytes)")


if __name__ == "__main__":
    main()
