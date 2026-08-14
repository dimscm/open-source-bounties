/* Peta Freezer — daftar toko, inspector, dan lokasi unit. */
(function () {
  "use strict";

  var PAGE_SIZE = 80;
  var STATUS_LABEL = { BLUE: "Biru", YELLOW: "Kuning", RED: "Merah" };
  var STATUS_VAR = { BLUE: "--blue", YELLOW: "--amber", RED: "--red" };

  var css = getComputedStyle(document.documentElement);
  function token(name) { return css.getPropertyValue(name).trim(); }

  /* ---------- data ---------- */

  var raw = window.FREEZER_DATA || { keys: [], rows: [] };

  var items = raw.rows.map(function (row, i) {
    var item = { i: i };
    raw.keys.forEach(function (key, k) { item[key] = row[k]; });
    item.status = STATUS_VAR[item.status] ? item.status : "BLUE";
    item.q = [item.toko, item.kode, item.alamat, item.pic, item.telp,
              item.inspector, item.serial, item.qr, item.model,
              item.alamatInspeksi].join(" ").toLowerCase();
    return item;
  });

  // Sisi atas diberi ruang lebih supaya popup tidak tertutup pesan status.
  var POPUP_OPSI = {
    closeButton: true,
    autoPanPaddingTopLeft: [24, 78],
    autoPanPaddingBottomRight: [24, 28]
  };

  var $ = function (id) { return document.getElementById(id); };
  var listEl = $("list");
  var moreEl = $("listMore");

  var state = { rows: items, shown: 0, activeId: null };

  function angka(n) { return n.toLocaleString("id-ID"); }

  /* ---------- peta ---------- */

  // maxZoom wajib diisi di sini: tanpa tile layer, markercluster tidak punya
  // acuan zoom maksimum dan akan berhenti dengan galat.
  var map = L.map("map", { zoomControl: true, preferCanvas: true, maxZoom: 19 })
             .setView([-6.12, 106.13], 11);

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

  // Tampilan awal mengikuti sebaran data. Di layar kecil peta masih tersembunyi
  // saat halaman dimuat (ukurannya 0), jadi pemasangannya ditunda sampai peta
  // benar-benar tampil — lihat setView("map").
  var semuaBatas = L.latLngBounds(items.map(function (item) { return [item.lat, item.lng]; }));
  var sudahPas = false;

  function tampilanAwal() {
    if (map.getSize().x > 0) {
      map.fitBounds(semuaBatas.pad(0.04));
      sudahPas = true;
    } else {
      map.setView(semuaBatas.getCenter(), 10);
    }
  }

  var cluster = L.markerClusterGroup({
    maxClusterRadius: 55,
    disableClusteringAtZoom: 17,
    chunkedLoading: true,
    showCoverageOnHover: false
  }).addTo(map);

  var markers = items.map(function (item) {
    var marker = L.circleMarker([item.lat, item.lng], {
      radius: 6,
      color: token("--surface"),
      weight: 2,
      fillColor: token(STATUS_VAR[item.status]),
      fillOpacity: 1
    });
    // Isi popup dibuat saat dibuka, bukan saat marker dibuat, supaya jarak ke
    // posisi pengguna selalu memakai angka terbaru.
    marker.bindPopup(function () { return popupHtml(item); }, POPUP_OPSI);
    marker.on("click", function () { setActive(item.i, false); });
    return marker;
  });

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- lokasi pengguna ---------- */

  var lokasi = null;          // { lat, lng, akurasi }
  var titikSaya = null;       // marker posisi
  var lingkarSaya = null;     // lingkaran akurasi
  var pantauan = null;        // id watchPosition
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

  // Haversine — cukup akurat untuk jarak sedekat ini, dan tidak perlu pustaka.
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

  function gambarPosisi() {
    var titik = [lokasi.lat, lokasi.lng];
    if (!titikSaya) {
      lingkarSaya = L.circle(titik, {
        radius: lokasi.akurasi, interactive: false,
        color: token("--accent"), weight: 1, fillColor: token("--accent"), fillOpacity: .12
      }).addTo(map);
      titikSaya = L.circleMarker(titik, {
        radius: 7, color: "#fff", weight: 3,
        fillColor: token("--accent"), fillOpacity: 1
      }).addTo(map).bindPopup("Posisi Anda sekarang");
      titikSaya.bringToFront();
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
    applyFilters();

    if (pertama) {
      map.setView([lokasi.lat, lokasi.lng], 15);
      var dekat = items.slice().sort(function (a, b) { return a.jarak - b.jarak; })[0];
      pesan("Lokasi ditemukan. Freezer terdekat: " + (dekat.toko || dekat.kode) +
            " — " + formatJarak(dekat.jarak) + ".");
    }
    document.body.classList.remove("cari-lokasi");
    document.body.classList.add("pakai-lokasi");
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
    hitungJarak();
    applyFilters();
  }

  var TombolLokasi = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
      var kotak = L.DomUtil.create("div", "leaflet-bar tombol-lokasi");
      var a = L.DomUtil.create("a", "", kotak);
      a.href = "#";
      a.title = "Tampilkan lokasi saya";
      a.setAttribute("role", "button");
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

  function row(label, value, mono) {
    if (!value) { return ""; }
    return "<dt>" + esc(label) + "</dt>" +
           '<dd' + (mono ? ' class="mono"' : "") + ">" + esc(value) + "</dd>";
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

  /* ---------- penyaring ---------- */

  var filters = [
    { el: $("fInspector"), key: "inspector", label: null },
    { el: $("fStatus"), key: "status", label: function (v) { return "Status " + (STATUS_LABEL[v] || v); } },
    { el: $("fModel"), key: "model", label: null },
    { el: $("fDistribusi"), key: "distribusi", label: null }
  ];

  filters.forEach(function (filter) {
    var seen = {};
    items.forEach(function (item) {
      if (item[filter.key]) { seen[item[filter.key]] = (seen[item[filter.key]] || 0) + 1; }
    });
    Object.keys(seen).sort(function (a, b) {
      return a.localeCompare(b, "id", { numeric: true });
    }).forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = (filter.label ? filter.label(value) : value) + " (" + seen[value] + ")";
      filter.el.appendChild(option);
    });
  });

  function applyFilters() {
    var query = $("q").value.trim().toLowerCase();
    var words = query ? query.split(/\s+/) : [];

    state.rows = items.filter(function (item) {
      for (var i = 0; i < filters.length; i++) {
        var want = filters[i].el.value;
        if (want && item[filters[i].key] !== want) { return false; }
      }
      for (var w = 0; w < words.length; w++) {
        if (item.q.indexOf(words[w]) === -1) { return false; }
      }
      return true;
    });

    // Begitu posisi diketahui, daftar diurutkan dari yang paling dekat supaya
    // kartu teratas selalu freezer terdekat.
    if (lokasi) {
      state.rows = state.rows.slice().sort(function (a, b) { return a.jarak - b.jarak; });
    }

    renderList(true);
    renderMarkers();
  }

  /* ---------- daftar ---------- */

  function renderList(reset) {
    if (reset) {
      listEl.innerHTML = "";
      listEl.scrollTop = 0;
      state.shown = 0;
      $("resultCount").innerHTML = "<b>" + angka(state.rows.length) + "</b> unit" +
        (lokasi ? ' <span class="urut">· terdekat dulu</span>' : "");
    }

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
          '<span class="mono">' + esc(item.waktu || "—") + '</span>' +
          '<span class="mono">' + esc(item.kode || "—") + '</span>' +
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

  function renderMarkers() {
    cluster.clearLayers();
    cluster.addLayers(state.rows.map(function (item) { return markers[item.i]; }));

    if (state.rows.length && state.rows.length < items.length) {
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
    timer = setTimeout(applyFilters, 180);
  });

  filters.forEach(function (filter) {
    filter.el.addEventListener("change", applyFilters);
  });

  $("reset").addEventListener("click", function () {
    $("q").value = "";
    filters.forEach(function (filter) { filter.el.value = ""; });
    applyFilters();
    tampilanAwal();
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

  $("statUnit").textContent = angka(items.length);
  $("statToko").textContent = angka(uniq("kode"));
  $("statInspector").textContent = uniq("inspector");

  var counts = { BLUE: 0, YELLOW: 0, RED: 0 };
  items.forEach(function (item) { counts[item.status]++; });

  $("legend").innerHTML = "<b>Status ikon</b>" + ["BLUE", "YELLOW", "RED"].map(function (key) {
    return '<span><i class="dot dot-' + key + '"></i>' + STATUS_LABEL[key] +
           '<i class="n">' + angka(counts[key]) + "</i></span>";
  }).join("") + (window.FREEZER_BASEMAP
    ? '<small class="note">Peta dasar hanya garis pantai. Untuk detail jalan dan rute, pakai tombol Google Maps di kotak informasi tiap unit.</small>'
    : "");

  /* ---------- mulai ---------- */

  applyFilters();
  tampilanAwal();
})();
