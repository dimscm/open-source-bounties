#!/usr/bin/env python3
"""Rakit seluruh web menjadi satu berkas HTML mandiri.

Berkas hasilnya dipakai untuk versi online (artifact claude.ai) yang tidak
boleh memanggil host luar: semua CSS, JavaScript, font, dan data disisipkan ke
dalam HTML. Karena tile OpenStreetMap ikut terblokir di sana, peta dasarnya
diganti garis pantai dari data/basemap.js.

Pakai:
    python3 scripts/build_artifact.py [keluaran.html]
"""

import base64
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "dist", "peta-freezer.html")

CSS = ["assets/vendor/leaflet.css", "assets/vendor/MarkerCluster.css",
       "assets/vendor/MarkerCluster.Default.css", "assets/app.css"]
JS = ["assets/vendor/leaflet.js", "assets/vendor/leaflet.markercluster.js",
      "data/basemap.js", "data/freezers.js", "assets/app.js"]
FONTS = [
    ("Plex Sans", 400, "assets/fonts/plex-sans-400.woff2"),
    ("Plex Sans", 500, "assets/fonts/plex-sans-500.woff2"),
    ("Plex Sans", 600, "assets/fonts/plex-sans-600.woff2"),
    ("Plex Condensed", 600, "assets/fonts/plex-condensed-600.woff2"),
    ("Plex Mono", 400, "assets/fonts/plex-mono-400.woff2"),
    ("Plex Mono", 500, "assets/fonts/plex-mono-500.woff2"),
]

PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="


def baca(rel):
    with open(os.path.join(BASE, rel), encoding="utf-8") as handle:
        return handle.read()


def font_face(keluarga, berat, rel):
    with open(os.path.join(BASE, rel), "rb") as handle:
        b64 = base64.b64encode(handle.read()).decode("ascii")
    return ("@font-face{font-family:\"%s\";font-weight:%d;font-style:normal;"
            "font-display:swap;src:url(data:font/woff2;base64,%s) format(\"woff2\")}"
            % (keluarga, berat, b64))


def periksa_tema_gelap(css):
    """Palet gelap ditulis dua kali (media query dan [data-theme=dark]).

    Kalau keduanya sampai berbeda, halaman akan menampilkan warna teks satu tema
    di atas latar tema lain, jadi lebih baik gagal di sini daripada di layar.
    """
    blok = re.findall(r"(?:prefers-color-scheme: dark\).*?|:root\[data-theme=\"dark\"\])\{?[^{]*\{(.*?)\}", css, re.S)
    token = [dict(re.findall(r"(--[\w-]+):\s*([^;]+);", b)) for b in blok[:2]]
    if len(token) == 2 and token[0] != token[1]:
        beda = [k for k in set(token[0]) | set(token[1]) if token[0].get(k) != token[1].get(k)]
        sys.exit("Palet tema gelap tidak sama di kedua blok: %s" % ", ".join(sorted(beda)))


def main():
    periksa_tema_gelap(baca("assets/app.css"))

    css = "\n".join(font_face(*f) for f in FONTS)
    for rel in CSS:
        isi = baca(rel)
        # Leaflet merujuk images/*.png untuk kontrol yang tidak dipakai di sini;
        # ganti ke pixel kosong supaya tidak ada permintaan yang gagal.
        isi = re.sub(r"url\((['\"]?)images/[^)]+\)", "url(%s)" % PIXEL, isi)
        css += "\n" + isi

    js = "\n;\n".join(baca(rel) for rel in JS)

    # Ambil <body> dari index.html supaya penanda HTML tidak ditulis dua kali.
    index = baca("index.html")
    body = re.search(r"<body>(.*)</body>", index, re.S).group(1)
    body = re.sub(r"\s*<script[^>]*></script>", "", body)

    html = (
        "<title>Peta Freezer</title>\n"
        "<style>\n%s\n</style>\n%s\n<script>\n%s\n</script>\n" % (css, body.strip(), js)
    )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(html)

    print("OK  %s (%.1f MB)" % (OUT, os.path.getsize(OUT) / 1024 / 1024))


if __name__ == "__main__":
    main()
