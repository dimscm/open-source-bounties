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
    marker.bindPopup(popupHtml(item), { closeButton: true, autoPanPadding: [24, 24] });
    marker.on("click", function () { setActive(item.i, false); });
    return marker;
  });

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function row(label, value, mono) {
    if (!value) { return ""; }
    return "<dt>" + esc(label) + "</dt>" +
           '<dd' + (mono ? ' class="mono"' : "") + ">" + esc(value) + "</dd>";
  }

  function popupHtml(item) {
    var gmaps = "https://www.google.com/maps/search/?api=1&query=" + item.lat + "," + item.lng;
    var telp = String(item.telp || "").replace(/[^\d+]/g, "");
    return '' +
      '<div class="pop-toko">' + esc(item.toko || "(nama toko kosong)") + '</div>' +
      '<div class="pop-kode">' + esc(item.kode || "—") +
        '<span class="badge badge-' + item.status + '">' +
        esc(STATUS_LABEL[item.status]) + '</span></div>' +
      '<dl class="pop-rows">' +
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
        '<a class="btn btn-primary" href="' + esc(gmaps) + '" target="_blank" rel="noopener">Buka Maps</a>' +
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

    renderList(true);
    renderMarkers();
  }

  /* ---------- daftar ---------- */

  function renderList(reset) {
    if (reset) {
      listEl.innerHTML = "";
      listEl.scrollTop = 0;
      state.shown = 0;
      $("resultCount").innerHTML = "<b>" + angka(state.rows.length) + "</b> unit";
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
        '<div class="card-toko">' + esc(item.toko || "(nama toko kosong)") + '</div>' +
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
      L.popup({ autoPanPadding: [24, 24] })
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
    ? '<small class="note">Peta dasar hanya garis pantai. Untuk detail jalan, pakai tombol Buka Maps di kotak informasi.</small>'
    : "");

  /* ---------- mulai ---------- */

  applyFilters();
  tampilanAwal();
})();
