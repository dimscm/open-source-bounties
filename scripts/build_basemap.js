/* Membuat data/basemap.js — garis pantai untuk peta versi offline (artifact),
 * dipakai kalau tile OpenStreetMap tidak bisa dimuat.
 *
 * Sumber: Natural Earth 1:10m land, lewat paket npm world-atlas (TopoJSON).
 * Pakai:
 *     npm i world-atlas@2 topojson-client
 *     node scripts/build_basemap.js
 */

const fs = require("fs");
const path = require("path");
const { feature } = require("topojson-client");
const topo = require("world-atlas/land-10m.json");

// Kotak wilayah data (Banten dan sekitarnya), dilebihkan supaya masih ada
// konteks daratan waktu peta di-zoom out.
const BOX = { w: 104.0, e: 108.5, s: -8.0, n: -4.5 };
const OUT = path.join(__dirname, "..", "data", "basemap.js");

const land = feature(topo, topo.objects.land);
const rings = [];

for (const polygon of land.features[0].geometry.coordinates) {
  for (const ring of polygon) {
    const menyentuhKotak = ring.some(
      ([x, y]) => x > BOX.w && x < BOX.e && y > BOX.s && y < BOX.n
    );
    if (!menyentuhKotak) continue;
    // Bulatkan ke 4 desimal (~11 m) — lebih dari cukup untuk garis pantai 1:10m.
    rings.push(ring.map(([x, y]) => [round(x), round(y)]));
  }
}

function round(n) {
  return Math.round(n * 1e4) / 1e4;
}

const geojson = {
  type: "Feature",
  properties: { source: "Natural Earth 1:10m land (world-atlas)" },
  geometry: { type: "MultiPolygon", coordinates: rings.map((r) => [r]) },
};

fs.writeFileSync(
  OUT,
  "// Dibuat otomatis oleh scripts/build_basemap.js — jangan diedit manual.\n" +
    "// Garis pantai Natural Earth 1:10m (public domain) via paket npm world-atlas.\n" +
    "window.FREEZER_BASEMAP = " +
    JSON.stringify(geojson) +
    ";\n"
);

const titik = rings.reduce((n, r) => n + r.length, 0);
console.log(
  "OK  %d cincin / %d titik -> %s (%d KB)",
  rings.length,
  titik,
  OUT,
  Math.round(fs.statSync(OUT).size / 1024)
);
