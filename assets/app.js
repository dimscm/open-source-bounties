/* Peta Freezer — unggah data aset freezer, lalu lihat toko, inspector,
   order 3 bulan terakhir, dan lokasinya di peta. Semua pemrosesan terjadi di
   browser; tidak ada data yang dikirim ke server. */
(function () {
  "use strict";

  var PAGE_SIZE = 80;
  var STATUS_LABEL = { BLUE: "Biru", YELLOW: "Kuning", RED: "Merah" };
  var STATUS_VAR = { BLUE: "--blue", YELLOW: "--amber", RED: "--red" };

  // Kolom template -> kunci yang dipakai di web. Hanya dua kolom pertama yang
  // wajib; sisanya ditampilkan kalau ada.
  var KOLOM = [
    ["OUTLET", "toko", true],
    ["LATITUDE AND LONGITUDE", "koordinat", true],
    ["CODE OUTLET", "kode"],
    ["OUTLETS ADDRESS", "alamat"],
    ["OUTLETS CONTACTPERSON", "pic"],
    ["OUTLETSPHONE", "telp"],
    ["LAST INSPECTOR", "inspector"],
    ["LAST INSPECTED TIME", "waktu"],
    ["INSPECTION DURATION", "durasi"],
    ["INSPECTION ADDRESS", "alamatInspeksi"],
    ["QR CODE", "qr"],
    ["SERIAL NUMBER", "serial"],
    ["FREEZER MODEL", "model"],
    ["BRAND", "brand"],
    ["ASSET NAME", "asset"],
    ["ASSET PROPERTIES", "properti"],
    ["ASSET AGE", "usia"],
    ["PO YEAR", "tahunPo"],
    ["WARRANTY STATUS", "garansi"],
    ["FREEZER DISTRIBUTION STATUS", "distribusi"],
    ["STATUS ICON", "status"],
    ["DISTRIBUTOR NAME", "distributor"],
    ["AVG L3M", "l3m"]
  ];

  // Susunan kolom persis seperti template yang dipakai tim.
  var TEMPLATE = ["QR CODE", "SERIAL NUMBER", "FREEZER MODEL", "ASSET NO", "ASSET NAME",
    "ASSET CLASS", "BRAND", "DISTRIBUTOR CODE", "DISTRIBUTOR NAME", "RESPONSIBLE DEPARTMENT",
    "ARRIVE TIME", "PO YEAR", "WARRANTY PERIOD END DATE", "WARRANTY STATUS", "ASSET AGE",
    "INSPECTION ADDRESS", "LATITUDE AND LONGITUDE", "ASSET PROPERTIES", "INSPECTION STATUS",
    "USE STATUS", "FREEZER DISTRIBUTION STATUS", "CODE OUTLET", "OUTLET", "OUTLETS ADDRESS",
    "OUTLETS CATEGORY", "OUTLETS CONTACTPERSON", "OUTLETSPHONE", "AUDIT STATUS",
    "FIRST INSPECTION DATE", "FIRST OUTLET CODE", "FIRST OUTLET NAME", "LAST INSPECTOR",
    "LAST INSPECTED TIME", "INSPECTION DURATION", "STATUS ICON", "AVG L3M", "Omzet Sept"];

  // Mode repo (GitHub Pages): semua orang melihat data bersama dari repo dan
  // hanya admin yang bisa menggantinya. Mode lokal (versi satu-berkas/artifact):
  // tidak ada data bersama, jadi setiap orang mengunggah file sendiri.
  var MODE_REPO = !window.FREEZER_BASEMAP && location.protocol !== "file:";
  var REPO = "dimscm/open-source-bounties";
  var CABANG = "claude/web-toko-inspector-maps-1v2m0x";   // branch yang disajikan GitHub Pages

  var css = getComputedStyle(document.documentElement);
  function token(name) { return css.getPropertyValue(name).trim(); }

  var $ = function (id) { return document.getElementById(id); };
  var listEl = $("list");
  var moreEl = $("listMore");

  var items = [];
  var markers = [];
  var dataInfo = null;   // { nama, waktu, omzetLabel }
  var state = { rows: [], shown: 0, activeId: null };

  function angka(n) { return n.toLocaleString("id-ID"); }

  function desimal(n) {
    return n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- pesan status ---------- */

  var pesanWaktu;
  function pesan(teks, lama) {
    var el = $("toast");
    el.textContent = teks;
    el.hidden = false;
    clearTimeout(pesanWaktu);
    if (lama !== 0) {
      pesanWaktu = setTimeout(function () { el.hidden = true; }, lama || 5000);
    }
  }

  /* ---------- peta ---------- */

  // maxZoom wajib diisi: tanpa tile layer, markercluster tidak punya acuan
  // zoom maksimum dan berhenti dengan galat.
  var map = L.map("map", { zoomControl: true, preferCanvas: true, maxZoom: 19 })
             .setView([-6.12, 106.13], 10);

  if (window.FREEZER_BASEMAP) {
    // Versi satu-berkas: tanpa tile, daratan digambar dari garis pantai
    // Natural Earth supaya peta tetap terbaca walau offline.
    L.geoJSON(window.FREEZER_BASEMAP, {
      interactive: false,
      style: { color: token("--coast"), weight: 1, fillColor: token("--land"), fillOpacity: 1 }
    }).addTo(map);
    map.attributionControl.addAttribution(
      'Garis pantai <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>'
    );
  } else {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
  }

  L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

  // Sisi atas diberi ruang lebih supaya popup tidak tertutup pesan status.
  var POPUP_OPSI = {
    closeButton: true,
    autoPanPaddingTopLeft: [24, 78],
    autoPanPaddingBottomRight: [24, 28]
  };

  var cluster = L.markerClusterGroup({
    maxClusterRadius: 55,
    disableClusteringAtZoom: 17,
    chunkedLoading: true,
    showCoverageOnHover: false
  }).addTo(map);

  // Tampilan awal mengikuti sebaran data. Di layar kecil peta masih tersembunyi
  // saat halaman dimuat (ukurannya 0), jadi pemasangannya ditunda sampai peta
  // benar-benar tampil — lihat setView("map").
  var sudahPas = false;

  function tampilanAwal() {
    if (!items.length) { return; }
    var batas = L.latLngBounds(items.map(function (item) { return [item.lat, item.lng]; }));
    if (map.getSize().x > 0) {
      map.fitBounds(batas.pad(0.04));
      sudahPas = true;
    } else {
      map.setView(batas.getCenter(), 10);
    }
  }

  /* ---------- lokasi pengguna ---------- */

  var lokasi = null;          // { lat, lng, akurasi }
  var titikSaya = null;       // marker posisi
  var lingkarSaya = null;     // lingkaran akurasi
  var pantauan = null;        // id watchPosition

  // Haversine — cukup akurat untuk jarak sedekat ini, tanpa perlu pustaka.
  function jarakMeter(aLat, aLng, bLat, bLng) {
    var R = 6371000;
    var d = Math.PI / 180;
    var dLat = (bLat - aLat) * d;
    var dLng = (bLng - aLng) * d;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(aLat * d) * Math.cos(bLat * d) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function formatJarak(m) {
    if (m < 1000) { return Math.round(m / 10) * 10 + " m"; }
    return (m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",") + " km";
  }

  function hitungJarak() {
    items.forEach(function (item) {
      item.jarak = lokasi ? jarakMeter(lokasi.lat, lokasi.lng, item.lat, item.lng) : null;
    });
  }

  // Titik "saya" sengaja berbeda bentuk dan warna dari titik freezer: ungu,
  // lebih besar, dengan cincin berdenyut — tidak mungkin tertukar dengan status
  // biru/kuning/merah maupun gugus berwarna teal.
  var ikonSaya = L.divIcon({
    className: "titik-saya",
    html: '<span class="titik-saya-denyut"></span><span class="titik-saya-inti"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12]
  });

  function gambarPosisi() {
    var titik = [lokasi.lat, lokasi.lng];
    if (!titikSaya) {
      lingkarSaya = L.circle(titik, {
        radius: lokasi.akurasi, interactive: false,
        color: token("--me"), weight: 1, dashArray: "4 4",
        fillColor: token("--me"), fillOpacity: .10
      }).addTo(map);
      titikSaya = L.marker(titik, { icon: ikonSaya, zIndexOffset: 1000, keyboard: false })
        .addTo(map)
        .bindPopup('<div class="pop-saya">Posisi Anda sekarang</div>');
    } else {
      titikSaya.setLatLng(titik);
      lingkarSaya.setLatLng(titik).setRadius(lokasi.akurasi);
    }
  }

  function posisiMasuk(pos) {
    var pertama = !lokasi;
    lokasi = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      akurasi: pos.coords.accuracy || 0
    };
    hitungJarak();
    gambarPosisi();

    if (pertama) {
      document.body.classList.remove("cari-lokasi");
      document.body.classList.add("pakai-lokasi");
      aturOpsiUrut();
      $("fUrut").value = "dekat";
    }
    applyFilters(!pertama);
    renderLegend();

    if (pertama) {
      map.setView([lokasi.lat, lokasi.lng], 15);
      if (items.length) {
        var dekat = items.reduce(function (a, b) { return b.jarak < a.jarak ? b : a; });
        pesan("Lokasi ditemukan. Freezer terdekat: " + (dekat.toko || dekat.kode) +
              " — " + formatJarak(dekat.jarak) + ".");
      } else {
        pesan("Lokasi ditemukan. Unggah data untuk melihat freezer terdekat.");
      }
    }
  }

  function posisiGagal(err) {
    hentikanLokasi();
    if (err.code === 1) {
      pesan("Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini lewat ikon gembok di address bar, lalu coba lagi.", 9000);
    } else if (err.code === 3) {
      pesan("Terlalu lama mencari sinyal GPS. Coba lagi di tempat yang lebih terbuka.", 8000);
    } else {
      pesan("Lokasi tidak bisa diambil. Pastikan GPS perangkat menyala.", 8000);
    }
  }

  function mulaiLokasi() {
    if (!navigator.geolocation) {
      pesan("Perangkat atau browser ini tidak mendukung deteksi lokasi.", 8000);
      return;
    }
    // GPS hanya diizinkan di halaman https (atau localhost). Berkas yang dibuka
    // lewat dobel-klik memakai alamat file:// sehingga selalu ditolak browser.
    if (!window.isSecureContext) {
      pesan("Deteksi lokasi hanya jalan di alamat https. Buka lewat link online, bukan berkas yang tersimpan di perangkat.", 10000);
      return;
    }
    pesan("Mencari lokasi Anda…", 0);
    document.body.classList.add("cari-lokasi");
    pantauan = navigator.geolocation.watchPosition(posisiMasuk, posisiGagal, {
      enableHighAccuracy: true, timeout: 20000, maximumAge: 10000
    });
  }

  function hentikanLokasi() {
    if (pantauan !== null) { navigator.geolocation.clearWatch(pantauan); }
    pantauan = null;
    lokasi = null;
    document.body.classList.remove("cari-lokasi", "pakai-lokasi");
    if (titikSaya) { map.removeLayer(titikSaya); map.removeLayer(lingkarSaya); }
    titikSaya = lingkarSaya = null;
    if ($("fUrut").value === "dekat") { $("fUrut").value = ""; }
    aturOpsiUrut();
    hitungJarak();
    applyFilters(true);
    renderLegend();
  }

  var TombolLokasi = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
      var kotak = L.DomUtil.create("div", "leaflet-bar tombol-lokasi");
      var a = L.DomUtil.create("a", "", kotak);
      a.href = "#";
      a.title = "Tampilkan lokasi saya";
      a.setAttribute("role", "button");
      a.setAttribute("aria-label", "Tampilkan lokasi saya");
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="4"/>' +
        '<path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>' +
        '<circle cx="12" cy="12" r="8" class="cincin"/></svg>';
      L.DomEvent.on(a, "click", function (e) {
        L.DomEvent.stop(e);
        if (pantauan === null) { mulaiLokasi(); } else { hentikanLokasi(); pesan("Lokasi dimatikan."); }
      });
      L.DomEvent.disableClickPropagation(kotak);
      return kotak;
    }
  });

  map.addControl(new TombolLokasi());

  /* ---------- popup ---------- */

  function row(label, value, mono) {
    if (value === "" || value == null) { return ""; }
    return "<dt>" + esc(label) + "</dt>" +
           '<dd' + (mono ? ' class="mono"' : "") + ">" + esc(value) + "</dd>";
  }

  function teksL3m(item) {
    return item.l3m == null ? "Tidak ada data" : desimal(item.l3m);
  }

  function popupHtml(item) {
    var telp = String(item.telp || "").replace(/[^\d+]/g, "");
    // Kalau posisi pengguna diketahui, tombolnya jadi rute dari titik itu.
    var tujuan = item.lat + "," + item.lng;
    var petaUrl = lokasi
      ? "https://www.google.com/maps/dir/?api=1&origin=" + lokasi.lat + "," + lokasi.lng +
        "&destination=" + tujuan + "&travelmode=driving"
      : "https://www.google.com/maps/search/?api=1&query=" + tujuan;
    return '' +
      '<div class="pop-toko">' + esc(item.toko || "(nama toko kosong)") + '</div>' +
      '<div class="pop-kode">' + esc(item.kode || "—") +
        '<span class="badge badge-' + item.status + '">' +
        esc(STATUS_LABEL[item.status]) + '</span></div>' +
      '<div class="pop-order">' +
        '<div><span>Avg order 3 bln</span><b class="' + (item.l3m == null ? "na" : "") + '">' +
          esc(teksL3m(item)) + '</b></div>' +
        (dataInfo && dataInfo.omzetLabel
          ? '<div><span>' + esc(dataInfo.omzetLabel) + '</span><b>' +
            (item.omzet == null ? "–" : esc(desimal(item.omzet))) + '</b></div>'
          : "") +
      '</div>' +
      '<dl class="pop-rows">' +
        (item.jarak != null
          ? '<dt>Jarak</dt><dd class="mono jarak-pop">' + formatJarak(item.jarak) + " dari Anda</dd>"
          : "") +
        row("Inspector", item.inspector) +
        row("Inspeksi", item.waktu, true) +
        row("PIC toko", item.pic) +
        row("Telepon", item.telp, true) +
        row("Alamat", item.alamat) +
        row("Freezer", [item.brand, item.model].filter(Boolean).join(" ")) +
        row("Serial", item.serial, true) +
        row("QR code", item.qr, true) +
        row("Usia aset", item.usia) +
        row("Garansi", item.garansi) +
        row("Distribusi", item.distribusi) +
        row("Koordinat", item.lat + ", " + item.lng, true) +
      '</dl>' +
      '<div class="pop-actions">' +
        '<a class="btn btn-primary" href="' + esc(petaUrl) + '" target="_blank" rel="noopener">' +
          (lokasi ? "Rute ke sini" : "Buka Maps") + '</a>' +
        (telp ? '<a class="btn" href="tel:' + esc(telp) + '">Telepon</a>' : "") +
      '</div>';
  }

  /* ---------- membaca file excel ---------- */

  function normal(teks) {
    return String(teks == null ? "" : teks).trim().replace(/\s+/g, " ").toUpperCase();
  }

  function dua(n) { return (n < 10 ? "0" : "") + n; }

  function formatWaktu(v) {
    if (v instanceof Date && !isNaN(v)) {
      return v.getFullYear() + "-" + dua(v.getMonth() + 1) + "-" + dua(v.getDate()) +
             " " + dua(v.getHours()) + ":" + dua(v.getMinutes());
    }
    var s = String(v == null ? "" : v).trim();
    var m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    return m ? m[1] + " " + m[2] : s;
  }

  function bersih(v) {
    if (v == null) { return ""; }
    if (v instanceof Date) { return formatWaktu(v); }
    var s = String(v).trim().replace(/\s+/g, " ");
    return /^(none|nan|#n\/a|#value!|#ref!)$/i.test(s) ? "" : s;
  }

  // Sel rumus yang gagal (mis. #N/A dari XLOOKUP) terbaca kosong — itu artinya
  // tidak ada data, bukan nol, jadi dibedakan dengan null.
  function angkaAtauNull(v) {
    if (v == null || v === "") { return null; }
    if (typeof v === "number") { return isFinite(v) ? v : null; }
    var s = String(v).trim().replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
  }

  function parseKoordinat(teks, latSaja, lngSaja) {
    var lat, lng;
    if (teks) {
      var p = String(teks).split(",");
      if (p.length !== 2) { return null; }
      lat = parseFloat(p[0]); lng = parseFloat(p[1]);
    } else {
      lat = parseFloat(latSaja); lng = parseFloat(lngSaja);
    }
    if (!isFinite(lat) || !isFinite(lng)) { return null; }
    if (!(lat > -11 && lat < 6 && lng > 94 && lng < 142)) { return null; }  // luar Indonesia
    return [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6];
  }

  // Cari baris judul di 10 baris pertama tiap sheet, supaya file yang punya
  // judul laporan di atas tabel tetap terbaca.
  function cariTabel(wb) {
    for (var s = 0; s < wb.SheetNames.length; s++) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[s]],
        { header: 1, raw: true, defval: null, blankrows: false });
      for (var r = 0; r < Math.min(10, rows.length); r++) {
        var judul = (rows[r] || []).map(normal);
        var adaKoordinat = judul.indexOf("LATITUDE AND LONGITUDE") !== -1 ||
          (judul.indexOf("LATITUDE") !== -1 && judul.indexOf("LONGITUDE") !== -1);
        if (judul.indexOf("OUTLET") !== -1 && adaKoordinat) {
          return { sheet: wb.SheetNames[s], judulAsli: rows[r], judul: judul, isi: rows.slice(r + 1) };
        }
      }
    }
    return null;
  }

  function bacaWorkbook(buffer, nama) {
    var wb = XLSX.read(buffer, { type: "array", cellDates: true });
    var tabel = cariTabel(wb);
    if (!tabel) {
      throw new Error("Kolom wajib tidak ditemukan. File harus punya kolom OUTLET dan " +
        "LATITUDE AND LONGITUDE — samakan dengan template.");
    }

    var idx = {};
    tabel.judul.forEach(function (j, i) { if (j && !(j in idx)) { idx[j] = i; } });

    // Kolom omzet namanya ikut bulan (mis. "Omzet Sept"), jadi dicari awalannya.
    var omzetIdx = -1, omzetLabel = "";
    tabel.judul.forEach(function (j, i) {
      if (omzetIdx === -1 && /^OMZET\b/.test(j)) {
        omzetIdx = i;
        omzetLabel = bersih(tabel.judulAsli[i]);
      }
    });

    var hasil = [], dilewati = 0;
    tabel.isi.forEach(function (baris) {
      if (!baris || !baris.some(function (c) { return c != null && String(c).trim() !== ""; })) { return; }
      var koordinat = parseKoordinat(
        baris[idx["LATITUDE AND LONGITUDE"]],
        baris[idx["LATITUDE"]], baris[idx["LONGITUDE"]]);
      if (!koordinat) { dilewati++; return; }

      var item = { lat: koordinat[0], lng: koordinat[1] };
      KOLOM.forEach(function (k) {
        if (k[1] === "koordinat") { return; }
        var v = idx[k[0]] == null ? null : baris[idx[k[0]]];
        item[k[1]] = k[1] === "l3m" ? angkaAtauNull(v)
                   : k[1] === "waktu" ? formatWaktu(v)
                   : bersih(v);
      });
      item.omzet = omzetIdx === -1 ? null : angkaAtauNull(baris[omzetIdx]);
      hasil.push(item);
    });

    if (!hasil.length) {
      throw new Error("Tidak ada baris dengan koordinat yang valid di sheet \"" + tabel.sheet + "\".");
    }

    return {
      nama: nama,
      waktu: Date.now(),
      sheet: tabel.sheet,
      omzetLabel: omzetLabel,
      dilewati: dilewati,
      items: hasil
    };
  }

  /* ---------- simpanan di perangkat ---------- */

  // IndexedDB dipakai karena datanya bisa beberapa MB (melebihi batas
  // localStorage). Semua akses dibungkus: di mode penyamaran atau pratinjau,
  // penyimpanan bisa ditolak dan web harus tetap jalan tanpa itu.
  var DB_NAMA = "peta-freezer", DB_STORE = "data", DB_KUNCI = "aktif";

  function bukaDb() {
    return new Promise(function (ok, gagal) {
      try {
        var req = indexedDB.open(DB_NAMA, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(DB_STORE); };
        req.onsuccess = function () { ok(req.result); };
        req.onerror = function () { gagal(req.error); };
      } catch (e) { gagal(e); }
    });
  }

  function dbJalankan(mode, kerja) {
    return bukaDb().then(function (db) {
      return new Promise(function (ok, gagal) {
        var tx = db.transaction(DB_STORE, mode);
        var req = kerja(tx.objectStore(DB_STORE));
        tx.oncomplete = function () { ok(req && req.result); db.close(); };
        tx.onerror = tx.onabort = function () { gagal(tx.error); db.close(); };
      });
    });
  }

  function simpanData(paket) { return dbJalankan("readwrite", function (s) { return s.put(paket, DB_KUNCI); }); }
  function muatData() { return dbJalankan("readonly", function (s) { return s.get(DB_KUNCI); }); }
  function hapusData() { return dbJalankan("readwrite", function (s) { return s.delete(DB_KUNCI); }); }

  /* ---------- memasang data ke tampilan ---------- */

  function pasangData(paket) {
    dataInfo = { nama: paket.nama, waktu: paket.waktu, omzetLabel: paket.omzetLabel };

    items = paket.items.map(function (item, i) {
      item.i = i;
      item.status = STATUS_VAR[String(item.status).toUpperCase()] ? String(item.status).toUpperCase() : "BLUE";
      item.q = [item.toko, item.kode, item.alamat, item.pic, item.telp,
                item.inspector, item.serial, item.qr, item.model,
                item.alamatInspeksi].join(" ").toLowerCase();
      return item;
    });

    markers = items.map(function (item) {
      var marker = L.circleMarker([item.lat, item.lng], {
        radius: 6,
        color: token("--surface"),
        weight: 2,
        fillColor: token(STATUS_VAR[item.status]),
        fillOpacity: 1
      });
      // Isi popup dibuat saat dibuka supaya jarak selalu memakai posisi terbaru.
      marker.bindPopup(function () { return popupHtml(item); }, POPUP_OPSI);
      marker.on("click", function () { setActive(item.i, false); });
      return marker;
    });

    hitungJarak();
    isiPilihanFilter();
    state.activeId = null;
    map.closePopup();

    document.body.classList.add("ada-data");
    document.body.classList.remove("memuat");
    $("kosong").hidden = true;
    $("databar").hidden = false;
    $("legend").hidden = false;
    var lokal = paket.sumber !== "bersama";
    var kapan = new Date(paket.waktu).toLocaleString("id-ID",
      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    $("dataNama").textContent = lokal ? paket.nama : "Data bersama tim";
    $("dataNama").title = lokal ? paket.nama : "Dari " + DATA_BERSAMA + " di repo";
    $("dataMeta").textContent = angka(items.length) + " unit · " +
      (lokal ? "unggahan Anda " : "diperbarui ") + kapan;
    // Tombol kembali ke data bersama hanya relevan saat sedang melihat file sendiri.
    $("databar").querySelector('[data-aksi="bersama"]').hidden = !(lokal && dataBersama);
    $("databar").querySelector('[data-aksi="hapus"]').hidden = !lokal;

    renderRingkasan();
    renderLegend();
    applyFilters(true);
    sudahPas = false;
    tampilanAwal();
    setTimeout(function () { map.invalidateSize(); }, 30);
  }

  function tampilKosong(status, memuat) {
    document.body.classList.remove("ada-data");
    document.body.classList.toggle("memuat", !!memuat);
    $("kosongJudul").textContent = memuat ? "Memuat data…"
      : bolehUnggah() ? "Unggah data freezer" : "Data belum tersedia";
    if (!memuat && !bolehUnggah() && !status) {
      status = "Admin belum mengunggah data freezer. Coba buka lagi nanti.";
    }
    $("kosong").hidden = false;
    $("databar").hidden = true;
    $("legend").hidden = true;
    $("kosongStatus").textContent = status || "";
    ["statUnit", "statToko", "statInspector"].forEach(function (id) { $(id).textContent = "–"; });
  }

  var sedangBaca = false;

  function prosesFile(file) {
    if (!file || sedangBaca || !bolehUnggah()) { return; }
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
      laporGagal("File \"" + file.name + "\" bukan Excel. Pilih file .xlsx sesuai template.");
      return;
    }
    sedangBaca = true;
    document.body.classList.add("sedang-baca");
    var teksBaca = "Membaca " + file.name + "…";
    if (items.length) { pesan(teksBaca, 0); } else { $("kosongStatus").textContent = teksBaca; }

    var reader = new FileReader();
    reader.onerror = function () { selesaiBaca(); laporGagal("File tidak bisa dibuka. Coba pilih ulang."); };
    reader.onload = function () {
      // Beri kesempatan browser menggambar pesan "Membaca…" sebelum parsing
      // yang memakan waktu sekitar satu detik untuk ribuan baris.
      setTimeout(function () {
        var paket;
        try {
          paket = bacaWorkbook(new Uint8Array(reader.result), file.name);
        } catch (e) {
          selesaiBaca();
          laporGagal(e && e.message ? e.message : "File tidak bisa dibaca.");
          return;
        }
        var ringkas = angka(paket.items.length) + " unit dari " + file.name + "." +
          (paket.dilewati ? " " + angka(paket.dilewati) + " baris dilewati karena koordinatnya kosong atau tidak valid." : "");

        if (MODE_REPO) {
          // File baru dipakai hanya setelah GitHub menerimanya, supaya tampilan
          // admin tidak berbeda dari yang dilihat orang lain.
          var teksSimpan = "File valid (" + angka(paket.items.length) + " unit). Menyimpan untuk semua orang…";
          if (items.length) { pesan(teksSimpan, 0); } else { $("kosongStatus").textContent = teksSimpan; }
          kirimKeRepo(new Uint8Array(reader.result), file.name).then(function () {
            selesaiBaca();
            paket.sumber = "bersama";
            paket.waktu = Date.now();
            dataBersama = paket;
            pasangData(paket);
            pesan(ringkas + " Tersimpan — semua orang melihat data ini di link publik dalam 1–3 menit.", 12000);
          }, function (e) {
            selesaiBaca();
            laporGagal("Data belum tersimpan: " + e.message);
          });
          return;
        }

        selesaiBaca();
        paket.sumber = "lokal";
        pasangData(paket);
        simpanData(paket).then(function () {
          pesan(ringkas, 7000);
        }, function () {
          pesan(ringkas + " Browser ini menolak penyimpanan, jadi file perlu diunggah ulang saat halaman dibuka lagi.", 10000);
        });
      }, 30);
    };
    reader.readAsArrayBuffer(file);
  }

  function selesaiBaca() {
    sedangBaca = false;
    document.body.classList.remove("sedang-baca");
    $("fileInput").value = "";
  }

  function laporGagal(teks) {
    if (items.length) { pesan(teks, 10000); } else { $("kosongStatus").textContent = teks; }
  }

  function unduhTemplate() {
    try {
      var wb = XLSX.utils.book_new();
      var ws = XLSX.utils.aoa_to_sheet([TEMPLATE]);
      ws["!cols"] = TEMPLATE.map(function (j) { return { wch: Math.max(12, j.length + 2) }; });
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Petunjuk"],
        ["Isi sheet Data mulai baris 2, satu baris per unit freezer."],
        ["Kolom wajib: OUTLET dan LATITUDE AND LONGITUDE (format: -6.1234567, 106.1234567)."],
        ["AVG L3M = rata-rata order 3 bulan terakhir. Sel #N/A dibaca sebagai \"tidak ada data\"."],
        ["Kolom Omzet boleh diganti nama bulannya, misalnya \"Omzet Okt\"."],
        ["Kolom lain boleh kosong atau dihapus."]
      ]), "Petunjuk");
      var isi = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      var blob = new Blob([isi], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      // Di viewer artifact claude.ai, halaman tidak boleh mengunduh sendiri;
      // file ditawarkan lewat kapabilitas "downloads" dan pengguna mengonfirmasi.
      if (window.claude && typeof window.claude.use === "function") {
        window.claude.use("downloads").then(function (downloads) {
          if (!downloads) {
            laporGagal("Template tidak bisa diunduh di halaman ini. Buka lewat link GitHub Pages untuk mengunduhnya.");
            return;
          }
          downloads.save({ filename: "Template_Peta_Freezer.xlsx", data: blob }).then(null, function (e) {
            if (e && e.code === "declined") { return; }
            laporGagal("Template tidak jadi diunduh" + (e && e.code === "rate_limited" ? " — tunggu sebentar lalu coba lagi." : "."));
          });
        });
        return;
      }

      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "Template_Peta_Freezer.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (e) {
      laporGagal("Template tidak bisa diunduh di halaman ini. Buka lewat link GitHub Pages untuk mengunduhnya.");
    }
  }

  /* ---------- penyaring & urutan ---------- */

  var filters = [
    { el: $("fInspector"), key: "inspector", label: null, awal: "Semua inspector" },
    { el: $("fStatus"), key: "status", label: function (v) { return "Status " + (STATUS_LABEL[v] || v); }, awal: "Semua status" },
    { el: $("fModel"), key: "model", label: null, awal: "Semua model" },
    { el: $("fDistribusi"), key: "distribusi", label: null, awal: "Semua" }
  ];

  function isiPilihanFilter() {
    filters.forEach(function (filter) {
      var dipilih = filter.el.value;
      var seen = {};
      items.forEach(function (item) {
        if (item[filter.key]) { seen[item[filter.key]] = (seen[item[filter.key]] || 0) + 1; }
      });
      filter.el.innerHTML = "";
      filter.el.appendChild(new Option(filter.awal, ""));
      Object.keys(seen).sort(function (a, b) {
        return a.localeCompare(b, "id", { numeric: true });
      }).forEach(function (value) {
        filter.el.appendChild(new Option(
          (filter.label ? filter.label(value) : value) + " (" + seen[value] + ")", value));
      });
      // Pertahankan pilihan kalau nilainya masih ada di data baru.
      filter.el.value = seen[dipilih] ? dipilih : "";
    });
  }

  function cocokL3m(item, kelompok) {
    var v = item.l3m;
    switch (kelompok) {
      case "tinggi": return v != null && v >= 15;
      case "sedang": return v != null && v >= 5 && v < 15;
      case "rendah": return v != null && v < 5;
      case "kosong": return v == null;
      default: return true;
    }
  }

  function aturOpsiUrut() {
    $("fUrut").querySelector('option[value="dekat"]').disabled = !lokasi;
  }

  // "Tidak ada data" selalu di bawah, apa pun arah urutannya, supaya tidak
  // mengacaukan peringkat.
  function bandingL3m(arah) {
    return function (a, b) {
      if (a.l3m == null && b.l3m == null) { return a.i - b.i; }
      if (a.l3m == null) { return 1; }
      if (b.l3m == null) { return -1; }
      return arah * (a.l3m - b.l3m) || a.i - b.i;
    };
  }

  function applyFilters(tanpaZoom) {
    var query = $("q").value.trim().toLowerCase();
    var words = query ? query.split(/\s+/) : [];
    var kelompok = $("fL3m").value;

    state.rows = items.filter(function (item) {
      for (var i = 0; i < filters.length; i++) {
        var want = filters[i].el.value;
        if (want && item[filters[i].key] !== want) { return false; }
      }
      if (!cocokL3m(item, kelompok)) { return false; }
      for (var w = 0; w < words.length; w++) {
        if (item.q.indexOf(words[w]) === -1) { return false; }
      }
      return true;
    });

    var urut = $("fUrut").value;
    if (urut === "dekat" && lokasi) {
      state.rows.sort(function (a, b) { return a.jarak - b.jarak; });
    } else if (urut === "l3m-tinggi") {
      state.rows.sort(bandingL3m(-1));
    } else if (urut === "l3m-rendah") {
      state.rows.sort(bandingL3m(1));
    }

    // Di HP penyaring dilipat; jumlah yang aktif ditampilkan di tombolnya.
    var aktif = filters.filter(function (f) { return f.el.value; }).length +
                (kelompok ? 1 : 0) + ($("fUrut").value ? 1 : 0);
    $("toggleFilter").textContent = "Filter & urutan" + (aktif ? " (" + aktif + ")" : "");

    renderList(true);
    renderMarkers(tanpaZoom);
  }

  /* ---------- daftar ---------- */

  var LABEL_URUT = {
    "dekat": "terdekat dulu",
    "l3m-tinggi": "order L3M tertinggi dulu",
    "l3m-rendah": "order L3M terendah dulu"
  };

  function renderList(reset) {
    if (reset) {
      listEl.innerHTML = "";
      listEl.scrollTop = 0;
      state.shown = 0;
      var urut = LABEL_URUT[$("fUrut").value];
      $("resultCount").innerHTML = "<b>" + angka(state.rows.length) + "</b> unit" +
        (urut ? ' <span class="urut">· ' + urut + "</span>" : "");
    }

    if (!items.length) { moreEl.hidden = true; return; }

    if (!state.rows.length) {
      listEl.innerHTML = '<li class="empty">Tidak ada data yang cocok.<br>Coba ubah kata kunci atau reset filter.</li>';
      moreEl.hidden = true;
      return;
    }

    var next = state.rows.slice(state.shown, state.shown + PAGE_SIZE);
    var frag = document.createDocumentFragment();

    next.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "card" + (item.i === state.activeId ? " is-active" : "");
      li.dataset.id = item.i;
      li.dataset.status = item.status;
      li.tabIndex = 0;
      li.innerHTML =
        '<div class="card-toko">' + esc(item.toko || "(nama toko kosong)") +
          (item.jarak != null
            ? '<span class="jarak">' + formatJarak(item.jarak) + "</span>"
            : "") +
        '</div>' +
        '<div class="card-meta">' +
          '<span class="who">' + esc(item.inspector || "—") + '</span>' +
          '<span class="mono">' + esc(item.kode || "—") + '</span>' +
          '<span class="l3m' + (item.l3m == null ? " na" : "") + '" title="Rata-rata order 3 bulan terakhir">' +
            'L3M <b>' + (item.l3m == null ? "–" : esc(desimal(item.l3m))) + '</b></span>' +
        '</div>' +
        '<div class="card-addr">' + esc(item.alamat || item.alamatInspeksi || "—") + '</div>';
      frag.appendChild(li);
    });

    listEl.appendChild(frag);
    state.shown += next.length;

    var sisa = state.rows.length - state.shown;
    moreEl.hidden = sisa <= 0;
    moreEl.textContent = sisa > 0
      ? angka(state.shown) + " dari " + angka(state.rows.length) + " ditampilkan — gulir untuk memuat lagi"
      : "";
  }

  listEl.addEventListener("scroll", function () {
    if (state.shown >= state.rows.length) { return; }
    if (listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 240) {
      renderList(false);
    }
  });

  function onPick(event) {
    var card = event.target.closest(".card");
    if (card) { setActive(Number(card.dataset.id), true); }
  }

  listEl.addEventListener("click", onPick);
  listEl.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick(event);
    }
  });

  /* ---------- marker & pilihan ---------- */

  function renderMarkers(tanpaZoom) {
    cluster.clearLayers();
    cluster.addLayers(state.rows.map(function (item) { return markers[item.i]; }));

    if (!tanpaZoom && state.rows.length && state.rows.length < items.length) {
      map.fitBounds(L.latLngBounds(state.rows.map(function (item) {
        return [item.lat, item.lng];
      })).pad(0.15), { maxZoom: 16 });
    }
  }

  function setActive(id, fromList) {
    state.activeId = id;

    Array.prototype.forEach.call(listEl.children, function (li) {
      li.classList.toggle("is-active", Number(li.dataset.id) === id);
    });

    if (fromList) {
      var item = items[id];
      showMap();
      // Zoom melewati batas cluster supaya marker-nya pasti terpisah, lalu
      // popup dibuka langsung di peta (marker circle tidak punya _icon, jadi
      // zoomToShowLayer milik markercluster tidak bisa dipakai di sini).
      map.setView([item.lat, item.lng], Math.max(map.getZoom(), 17), { animate: false });
      L.popup(POPUP_OPSI)
        .setLatLng([item.lat, item.lng])
        .setContent(popupHtml(item))
        .openOn(map);
    }
  }

  /* ---------- kendali ---------- */

  var timer;
  $("q").addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { applyFilters(); }, 180);
  });

  filters.forEach(function (filter) {
    filter.el.addEventListener("change", function () { applyFilters(); });
  });
  $("fL3m").addEventListener("change", function () { applyFilters(); });
  $("fUrut").addEventListener("change", function () { applyFilters(true); });

  $("toggleFilter").addEventListener("click", function () {
    var buka = document.body.classList.toggle("filter-buka");
    this.setAttribute("aria-expanded", buka ? "true" : "false");
  });

  $("reset").addEventListener("click", function () {
    $("q").value = "";
    filters.forEach(function (filter) { filter.el.value = ""; });
    $("fL3m").value = "";
    $("fUrut").value = lokasi ? "dekat" : "";
    applyFilters(true);
    tampilanAwal();
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-aksi="unggah"]'), function (btn) {
    btn.addEventListener("click", function () { $("fileInput").click(); });
  });
  $("fileInput").addEventListener("change", function () { prosesFile(this.files[0]); });
  $("unduhTemplate").addEventListener("click", unduhTemplate);

  // Seret-lepas file ke mana saja di halaman.
  ["dragenter", "dragover"].forEach(function (jenis) {
    document.addEventListener(jenis, function (e) {
      if (bolehUnggah() && e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") !== -1) {
        e.preventDefault();
        document.body.classList.add("seret");
      }
    });
  });
  ["dragleave", "drop"].forEach(function (jenis) {
    document.addEventListener(jenis, function (e) {
      if (jenis === "dragleave" && e.relatedTarget) { return; }
      document.body.classList.remove("seret");
    });
  });
  document.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) {
      e.preventDefault();
      if (!bolehUnggah()) { return; }
      prosesFile(e.dataTransfer.files[0]);
    }
  });

  /* ---------- tampilan layar kecil ---------- */

  function setView(view) {
    document.body.dataset.view = view;
    Array.prototype.forEach.call(document.querySelectorAll(".mobile-tabs button"), function (btn) {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    if (view === "map") {
      setTimeout(function () {
        map.invalidateSize();
        if (!sudahPas) { tampilanAwal(); }
      }, 30);
    }
  }

  function showMap() {
    if (window.matchMedia("(max-width: 820px)").matches) { setView("map"); }
  }

  Array.prototype.forEach.call(document.querySelectorAll(".mobile-tabs button"), function (btn) {
    btn.addEventListener("click", function () { setView(btn.dataset.view); });
  });

  setView("list");

  /* ---------- ringkasan & legenda ---------- */

  function uniq(key) {
    var seen = {};
    items.forEach(function (item) { if (item[key]) { seen[item[key]] = 1; } });
    return Object.keys(seen).length;
  }

  function renderRingkasan() {
    $("statUnit").textContent = angka(items.length);
    $("statToko").textContent = angka(uniq("kode") || uniq("toko"));
    $("statInspector").textContent = angka(uniq("inspector"));
  }

  function renderLegend() {
    var counts = { BLUE: 0, YELLOW: 0, RED: 0 };
    items.forEach(function (item) { counts[item.status]++; });

    $("legend").innerHTML = "<b>Status ikon</b>" + ["BLUE", "YELLOW", "RED"].map(function (key) {
      return '<span><i class="dot dot-' + key + '"></i>' + STATUS_LABEL[key] +
             '<i class="n">' + angka(counts[key]) + "</i></span>";
    }).join("") +
    (lokasi ? '<span class="saya"><i class="dot-saya"></i>Lokasi Anda</span>' : "") +
    (window.FREEZER_BASEMAP
      ? '<small class="note">Peta dasar hanya garis pantai. Untuk detail jalan dan rute, pakai tombol Google Maps di kotak informasi tiap unit.</small>'
      : "");
  }

  /* ---------- admin ---------- */

  // Hak mengubah data = izin tulis GitHub ke repo ini. Token admin disimpan di
  // browser admin saja; tanpa token yang sah, perubahan tidak bisa masuk ke repo
  // meski seseorang menemukan link ?admin.
  var KUNCI_TOKEN = "peta-freezer-admin-token";

  function bacaToken() {
    try { return localStorage.getItem(KUNCI_TOKEN) || ""; } catch (e) { return ""; }
  }

  function simpanToken(t) {
    try {
      if (t) { localStorage.setItem(KUNCI_TOKEN, t); } else { localStorage.removeItem(KUNCI_TOKEN); }
    } catch (e) { /* mode penyamaran: token hanya bertahan selama halaman terbuka */ }
  }

  var tokenAdmin = MODE_REPO ? bacaToken() : "";

  function bolehUnggah() { return !MODE_REPO || !!tokenAdmin; }

  function aturPeran() {
    document.body.classList.toggle("boleh-unggah", bolehUnggah());
    document.body.classList.toggle("admin", MODE_REPO && !!tokenAdmin);
    var label = MODE_REPO ? "Upload data baru" : "Pakai file lain";
    Array.prototype.forEach.call(document.querySelectorAll('[data-aksi="unggah"]'), function (b) {
      b.textContent = b.classList.contains("btn-besar") ? (MODE_REPO ? "Upload data" : "Pilih file Excel") : label;
    });
    $("kosongCatatan").textContent = MODE_REPO
      ? "File dicek dulu di browser. Kalau valid, file langsung menggantikan data untuk semua orang yang membuka link."
      : "File dibaca di perangkat ini saja — tidak dikirim ke server mana pun — lalu disimpan di browser supaya tidak perlu diunggah ulang setiap kali dibuka.";
  }

  function gh(path, opsi, token) {
    opsi = opsi || {};
    var h = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Authorization": "Bearer " + (token || tokenAdmin)
    };
    Object.keys(opsi.headers || {}).forEach(function (k) { h[k] = opsi.headers[k]; });
    opsi.headers = h;
    opsi.cache = "no-store";
    return fetch("https://api.github.com" + path, opsi).then(null, function () {
      throw new Error("Tidak bisa terhubung ke GitHub. Periksa koneksi internet, lalu coba lagi.");
    });
  }

  function galatGh(status) {
    return new Error(
      status === 401 ? "token admin tidak berlaku (salah atau sudah kedaluwarsa). Tekan Keluar admin, lalu masuk lagi dengan token baru." :
      status === 403 || status === 404 ? "token tidak punya izin menulis ke repo. Pastikan izin Contents diset \"Read and write\" untuk repo " + REPO + "." :
      status === 409 || status === 422 ? "file di repo baru saja berubah. Coba upload sekali lagi." :
      "GitHub menolak permintaan (kode " + status + "). Coba lagi sebentar lagi.");
  }

  function keBase64(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  var PATH_BERSAMA = "/repos/" + REPO + "/contents/data/data-freezer.xlsx";

  // sha file lama wajib disertakan untuk menimpa. Media type "object" dipakai
  // karena file di atas 1 MB ditolak oleh media type bawaan.
  function ambilSha() {
    return gh(PATH_BERSAMA + "?ref=" + encodeURIComponent(CABANG),
              { headers: { "Accept": "application/vnd.github.object+json" } })
      .then(function (r) {
        if (r.status === 404) { return null; }
        if (!r.ok) { throw galatGh(r.status); }
        return r.json().then(function (j) { return j.sha; });
      });
  }

  function kirimKeRepo(bytes, nama, ulang) {
    return ambilSha().then(function (sha) {
      var isi = {
        message: "Perbarui data freezer dari " + nama,
        content: keBase64(bytes),
        branch: CABANG
      };
      if (sha) { isi.sha = sha; }
      return gh(PATH_BERSAMA, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isi)
      });
    }).then(function (r) {
      // 409 = ada perubahan lain di antara ambil sha dan simpan; ulang sekali.
      if (r.status === 409 && !ulang) { return kirimKeRepo(bytes, nama, true); }
      if (!r.ok) { throw galatGh(r.status); }
      return r.json();
    });
  }

  function cekToken(token) {
    return gh("/repos/" + REPO, {}, token).then(function (r) {
      if (r.status === 401) { throw new Error("Token tidak dikenali GitHub. Periksa lagi, mungkin ada karakter yang terpotong."); }
      if (!r.ok) { throw new Error("Token ini tidak punya akses ke repo " + REPO + "."); }
      return r.json().then(function (j) {
        if (j.permissions && j.permissions.push === false) {
          throw new Error("Akun pemilik token ini tidak punya izin tulis ke repo " + REPO + ".");
        }
      });
    });
  }

  function bukaMasukAdmin() {
    var d = $("adminDialog");
    $("adminStatus").textContent = "";
    $("adminToken").value = "";
    if (typeof d.showModal === "function") { d.showModal(); } else { d.setAttribute("open", ""); }
    $("adminToken").focus();
  }

  function tutupMasukAdmin() {
    var d = $("adminDialog");
    if (typeof d.close === "function") { d.close(); } else { d.removeAttribute("open"); }
  }

  $("adminBatal").addEventListener("click", tutupMasukAdmin);

  $("adminForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var token = $("adminToken").value.trim();
    if (!token) { return; }
    $("adminStatus").textContent = "Memeriksa token…";
    $("adminStatus").classList.remove("galat");
    $("adminMasuk").disabled = true;
    cekToken(token).then(function () {
      tokenAdmin = token;
      simpanToken(token);
      aturPeran();
      tutupMasukAdmin();
      if (!items.length) { tampilKosong(); }
      pesan("Masuk sebagai admin. Tombol Upload data baru sekarang tersedia.", 7000);
    }, function (err) {
      $("adminStatus").textContent = err.message;
      $("adminStatus").classList.add("galat");
    }).then(function () { $("adminMasuk").disabled = false; });
  });

  function keluarAdmin() {
    tokenAdmin = "";
    simpanToken("");
    aturPeran();
    if (!items.length) { tampilKosong(); }
    pesan("Keluar dari mode admin di perangkat ini.");
  }

  aturPeran();

  /* ---------- data bersama ---------- */

  // File Excel yang ditaruh di repo. Siapa pun yang membuka link langsung
  // melihat data ini tanpa perlu memilih file. Untuk memperbarui, cukup ganti
  // file ini di repo dengan nama yang sama.
  var DATA_BERSAMA = "data/data-freezer.xlsx";
  var dataBersama = null;

  function muatBersama() {
    if (location.protocol === "file:") { return Promise.resolve(null); }
    // no-cache = tetap memakai salinan di perangkat, tapi selalu menanyakan
    // server dulu apakah ada versi baru (murah: dijawab 304 kalau belum berubah).
    return fetch(DATA_BERSAMA, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) { return null; }
      var diubah = Date.parse(res.headers.get("Last-Modified") || "") || Date.now();
      return res.arrayBuffer().then(function (buf) {
        var paket = bacaWorkbook(new Uint8Array(buf), "data-freezer.xlsx");
        paket.waktu = diubah;
        paket.sumber = "bersama";
        return paket;
      });
    }).then(null, function () { return null; });
  }

  function muatLokal() {
    return muatData().then(function (paket) {
      return paket && paket.items && paket.items.length ? paket : null;
    }, function () { return null; });
  }

  /* ---------- mulai ---------- */

  if (typeof XLSX === "undefined") {
    tampilKosong("Pembaca Excel gagal dimuat. Muat ulang halaman ini.");
  } else {
    tampilKosong("", true);
    if (MODE_REPO && /[?&]admin\b/.test(location.search) && !tokenAdmin) { bukaMasukAdmin(); }
    Promise.all([muatBersama(), MODE_REPO ? null : muatLokal()]).then(function (hasil) {
      dataBersama = hasil[0];
      var lokal = hasil[1];
      // Yang paling baru yang ditampilkan: unggahan pribadi yang sudah basi
      // tidak boleh menahan orang di data lama setelah data bersama diperbarui.
      if (lokal && (!dataBersama || lokal.waktu > dataBersama.waktu)) {
        pasangData(lokal);
      } else if (dataBersama) {
        pasangData(dataBersama);
        if (lokal) {
          pesan("Data bersama lebih baru daripada file yang pernah Anda unggah, jadi yang ditampilkan data bersama.", 8000);
        }
      } else {
        tampilKosong();
      }
    });
  }
  renderList(true);

  function kosongkanTampilan() {
    if (lokasi) { hentikanLokasi(); }
    items = []; markers = []; dataInfo = null;
    cluster.clearLayers();
    map.closePopup();
    state.rows = [];
    renderList(true);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-aksi="keluar"]'), function (b) {
    b.addEventListener("click", keluarAdmin);
  });

  $("databar").addEventListener("click", function (e) {
    if (!e.target.closest('[data-aksi="bersama"]') || !dataBersama) { return; }
    hapusData().then(null, function () {}).then(function () {
      pasangData(dataBersama);
      pesan("Kembali memakai data bersama tim.");
    });
  });

  // Tombol hapus data tersimpan (untuk perangkat bersama).
  $("databar").addEventListener("click", function (e) {
    if (!e.target.closest('[data-aksi="hapus"]')) { return; }
    if (!window.confirm("Hapus file yang Anda unggah dari browser ini?")) { return; }
    hapusData().then(null, function () {}).then(function () {
      if (dataBersama) {
        pasangData(dataBersama);
        pesan("File Anda dihapus dari browser ini. Sekarang menampilkan data bersama tim.");
        return;
      }
      kosongkanTampilan();
      tampilKosong("Data dihapus dari browser ini.");
    });
  });
})();
