/* Map Local Bình Thuận · trang bản đồ công khai */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var DEFAULT_CENTER = { lat: 10.9678946, lng: 108.0377487, zoom: 11 };
  var MODES = { driving: { label: "Xe máy / Ô tô", osrm: "car", speed: 30 }, bike: { label: "Xe đạp", osrm: "bike", speed: 14 }, foot: { label: "Đi bộ", osrm: "foot", speed: 4.5 } };

  var db = null, catById = {}, placeById = {}, tourById = {}, areaById = {};
  var state = { cat: "", q: "", tab: "places", view: { type: "list" }, stack: [], userLoc: null, mode: null };
  var markers = {}, routeLayer = null, meMarker = null, activeId = null, satellite = false;

  /* ---------- Tiện ích ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d"); }
  var FILE = location.protocol === "file:";
  var ROOT = FILE ? location.href.replace(/[^/]*([?#].*)?$/, "") : "/";
  function safeUrl(u) {
    u = String(u || "").trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (/^\/?(assets|uploads)\//.test(u)) return ROOT + u.replace(/^\//, "");
    return /^\//.test(u) ? u : "";
  }
  function isImg(icon) { return /^(https?:\/\/|\/)/.test(String(icon || "")); }
  function iconHtml(icon) { return isImg(icon) ? '<img src="' + esc(safeUrl(icon)) + '" alt="">' : esc(icon || "📍"); }
  function catOf(p) { return catById[p.categoryId] || { name: "Khác", icon: "📍", color: "#6f4a36" }; }
  function hav(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function fmtKm(km) { return km < 1 ? Math.round(km * 1000 / 10) * 10 + " m" : (km < 10 ? km.toFixed(1) : Math.round(km)) .toString().replace(".", ",") + " km"; }
  function fmtMin(min) { min = Math.max(1, Math.round(min)); return min < 60 ? min + " phút" : Math.floor(min / 60) + " giờ" + (min % 60 ? " " + (min % 60) + " phút" : ""); }
  function telHref(p) { return "tel:" + String(p).replace(/[^\d+]/g, ""); }
  function zaloHref(p) { var d = String(p).replace(/\D/g, ""); if (d.indexOf("84") === 0 && d.length > 10) d = "0" + d.slice(2); return "https://zalo.me/" + d; }
  function dirHref(p) { return "https://www.google.com/maps/dir/?api=1&destination=" + p.lat + "," + p.lng; }
  function gmapHref(p) { return safeUrl(p.mapLink) || "https://www.google.com/maps/search/?api=1&query=" + p.lat + "," + p.lng; }
  function hasCoords(p) { return isFinite(p.lat) && isFinite(p.lng) && p.lat !== null && p.lng !== null && p.lat !== "" && p.lng !== ""; }
  function imagesOf(p) {
    var list = [];
    if (p.cover) list.push(p.cover);
    (p.photos || []).forEach(function (u) { if (u && list.indexOf(u) < 0) list.push(u); });
    return list.map(safeUrl).filter(Boolean);
  }
  var toastTimer;
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400); }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, no) {
      var f = document.createElement("textarea"); f.value = text; f.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(f); f.select();
      try { document.execCommand("copy") ? ok() : no(); } catch (e) { no(e); } document.body.removeChild(f);
    });
  }
  function share(title, url) {
    if (navigator.share) { navigator.share({ title: title, text: title, url: url }).catch(function () {}); return; }
    copy(url).then(function () { toast("Đã sao chép liên kết"); }, function () { prompt("Sao chép liên kết:", url); });
  }

  /* ---------- Đường dẫn chia sẻ ---------- */
  var queryMode = /\.html$/.test(location.pathname) || location.protocol === "file:";
  function linkFor(kind, id) {
    var base = location.origin + (queryMode ? location.pathname : "");
    if (!kind) return queryMode ? base : base + "/map";
    return queryMode ? base + "?" + kind + "=" + encodeURIComponent(id) : base + "/" + kind + "/" + encodeURIComponent(id);
  }
  function setUrl(kind, id) {
    var u = linkFor(kind, id);
    if (state.cat && !kind) u += (u.indexOf("?") < 0 ? "?" : "&") + "c=" + encodeURIComponent(state.cat);
    try { history.replaceState(null, "", u); } catch (e) {}
  }
  function readUrl() {
    var m = /\/(p|t|k)\/([^/?#]+)/.exec(location.pathname), q = new URLSearchParams(location.search);
    var out = { c: q.get("c") || "" };
    if (m) out[m[1]] = decodeURIComponent(m[2]);
    ["p", "t", "k"].forEach(function (k) { if (q.get(k)) out[k] = q.get(k); });
    return out;
  }

  /* ---------- Bản đồ ---------- */
  var map = L.map("map", { zoomControl: false, attributionControl: true, tap: true }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_CENTER.zoom);
  // CARTO cần trang chạy trên web (Vercel). Khi mở file trực tiếp trên máy, dùng nền Esri để không bị báo "API key required".
  var baseLayer = (FILE
    ? L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "&copy; Esri, OpenStreetMap" })
    : L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 20, subdomains: "abcd", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
      })).addTo(map);
  var satLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, attribution: "Ảnh vệ tinh &copy; Esri"
  });
  var satLabels = FILE ? L.layerGroup() : L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 20, subdomains: "abcd" });
  map.attributionControl.setPrefix(false);

  function zoomClasses() {
    var z = map.getZoom(), c = map.getContainer().classList;
    c.toggle("show-labels", z >= 15); c.toggle("zoom-far", z < 13);
  }
  map.on("zoomend", zoomClasses); zoomClasses();

  $("#zoom-in").onclick = function () { map.zoomIn(); };
  $("#zoom-out").onclick = function () { map.zoomOut(); };
  $("#fit-btn").onclick = function () { fitVisible(); };
  $("#layer-btn").onclick = function () {
    satellite = !satellite;
    if (satellite) { map.removeLayer(baseLayer); satLayer.addTo(map); satLabels.addTo(map); }
    else { map.removeLayer(satLayer); map.removeLayer(satLabels); baseLayer.addTo(map); }
    this.classList.toggle("on", satellite); toast(satellite ? "Bản đồ vệ tinh" : "Bản đồ đường phố");
  };
  $("#locate-btn").onclick = function () {
    var btn = this;
    if (!navigator.geolocation) return toast("Trình duyệt không hỗ trợ định vị");
    toast("Đang tìm vị trí của bạn…");
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (!meMarker) meMarker = L.marker([state.userLoc.lat, state.userLoc.lng], { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 2000, interactive: false }).addTo(map);
      else meMarker.setLatLng([state.userLoc.lat, state.userLoc.lng]);
      btn.classList.add("on"); focusLatLng(state.userLoc, Math.max(map.getZoom(), 14)); render();
    }, function () { toast("Không lấy được vị trí. Hãy cho phép quyền định vị."); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  // Phần bản đồ không bị bảng thông tin che
  function visibleBox() {
    var W = innerWidth, H = innerHeight, top = $(".topbar").getBoundingClientRect().bottom + 52, left = 0, bottom = H;
    var sh = $("#sheet").getBoundingClientRect();
    if (W >= 900) left = sh.right; else bottom = Math.min(H, sh.top);
    return { left: left + 16, top: top, right: W - 16, bottom: bottom - 16 };
  }
  function focusLatLng(ll, zoom) {
    var z = zoom || map.getZoom(), b = visibleBox();
    var p = map.project([ll.lat, ll.lng], z);
    var cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
    p = p.add([innerWidth / 2 - cx, innerHeight / 2 - cy]);
    map.flyTo(map.unproject(p, z), z, { duration: .6 });
  }
  function fitPoints(points, maxZoom) {
    if (!points.length) return;
    if (points.length === 1) return focusLatLng(points[0], 16);
    var b = visibleBox();
    map.flyToBounds(L.latLngBounds(points.map(function (p) { return [p.lat, p.lng]; })), {
      paddingTopLeft: [b.left + 10, b.top + 10], paddingBottomRight: [innerWidth - b.right + 10, innerHeight - b.bottom + 10], maxZoom: maxZoom || 16, duration: .6
    });
  }
  function fitVisible() {
    if (state.view.type === "tour") return fitPoints(tourPlaces(tourById[state.view.id]));
    fitPoints(filteredPlaces());
  }

  /* ---------- Ghim ---------- */
  function pinHtml(p, num) {
    var c = catOf(p);
    var inner = num ? '<b class="n">' + num + "</b>" : '<span class="glyph">' + iconHtml(c.icon) + "</span>";
    return '<div class="pin' + (num ? " num" : "") + '" style="--c:' + esc(c.color || "#2a9d8f") + '">' + inner + '</div><div class="pin-label">' + esc(p.name) + "</div>";
  }
  function tipHtml(p) {
    var c = catOf(p), img = safeUrl(p.cover), info = p.note ? p.note.split("\n")[0] : (p.address || "");
    return '<div class="tip">' + (img ? '<img src="' + esc(img) + '" alt="">' : "") + '<div class="tip-tx"><span class="cat-tag" style="--c:' + esc(c.color) + '"><span class="em">' + iconHtml(c.icon) + "</span>" + esc(c.name) + "</span><b>" + esc(p.name) + "</b>" +
      (info ? "<small>" + esc(info) + "</small>" : "") + (p.phone ? "<small>☎ " + esc(p.phone) + "</small>" : "") + (state.userLoc ? "<small>" + esc(distText(p)) + "</small>" : "") + '<em>Bấm để xem chi tiết</em></div></div>';
  }
  var canHover = window.matchMedia && matchMedia("(hover: hover)").matches;
  function drawMarkers() {
    Object.keys(markers).forEach(function (id) { map.removeLayer(markers[id]); }); markers = {};
    var tour = state.view.type === "tour" ? tourById[state.view.id] : (state.stack.length && state.stack[state.stack.length - 1].type === "tour" ? tourById[state.stack[state.stack.length - 1].id] : null);
    var nums = {};
    if (tour) tour.stops.forEach(function (s, i) { if (!nums[s.placeId]) nums[s.placeId] = String(i + 1); else nums[s.placeId] += "·" + (i + 1); });
    db.places.forEach(function (p) {
      if (!hasCoords(p)) return;
      if (tour && !nums[p.id]) return;
      if (!tour && state.cat && p.categoryId !== state.cat) return;
      var m = L.marker([+p.lat, +p.lng], {
        icon: L.divIcon({ className: "pin-wrap", html: pinHtml(p, nums[p.id]), iconSize: [30, 30], iconAnchor: [15, 36] }),
        riseOnHover: true, keyboard: true, title: p.name, alt: p.name
      }).addTo(map);
      m.on("click", function () { m.closeTooltip(); openPlace(p.id, true); });
      if (canHover) m.bindTooltip(function () { return tipHtml(p); }, { direction: "top", offset: [0, -34], className: "pin-tip", opacity: 1 });
      markers[p.id] = m;
    });
    setActive(activeId);
  }
  function setActive(id) {
    activeId = id;
    Object.keys(markers).forEach(function (k) {
      var el = markers[k].getElement(); if (!el) return;
      var pin = el.querySelector(".pin"); pin.classList.toggle("active", k === id);
      markers[k].setZIndexOffset(k === id ? 1000 : 0);
    });
  }

  /* ---------- Định tuyến ---------- */
  var routeCache = {};
  function routeFor(points, mode) {
    var key = mode + "|" + points.map(function (p) { return (+p.lat).toFixed(6) + "," + (+p.lng).toFixed(6); }).join(";");
    if (routeCache[key]) return Promise.resolve(routeCache[key]);
    var coords = points.map(function (p) { return (+p.lng) + "," + (+p.lat); }).join(";");
    var url = "https://routing.openstreetmap.de/routed-" + MODES[mode].osrm + "/route/v1/driving/" + coords + "?overview=full&geometries=geojson&steps=false";
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 9000);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) { return r.json(); }).then(function (j) {
      clearTimeout(timer);
      if (!j.routes || !j.routes[0]) throw new Error("no route");
      var r = j.routes[0];
      var res = { real: true, line: r.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }),
        legs: r.legs.map(function (l) { return { km: l.distance / 1000, min: l.duration / 60 }; }) };
      if (mode === "driving") res.legs.forEach(function (l) { l.min = l.min * 0.95; });
      return (routeCache[key] = res);
    }).catch(function () {
      clearTimeout(timer);
      var legs = [];
      for (var i = 1; i < points.length; i++) { var km = hav(points[i - 1], points[i]) * 1.3; legs.push({ km: km, min: km / MODES[mode].speed * 60 }); }
      return { real: false, line: points.map(function (p) { return [+p.lat, +p.lng]; }), legs: legs };
    });
  }
  function clearRoute() { if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; } }
  function drawRoute(r) {
    clearRoute();
    routeLayer = L.layerGroup([
      L.polyline(r.line, { color: "#fff", weight: 9, opacity: .95, lineCap: "round", lineJoin: "round" }),
      L.polyline(r.line, { color: "#1f8a7a", weight: 5, opacity: .9, dashArray: r.real ? null : "8 10", lineCap: "round", lineJoin: "round" })
    ]).addTo(map);
    Object.keys(markers).forEach(function (k) { markers[k].setZIndexOffset(markers[k].options.zIndexOffset || 0); });
  }

  /* ---------- Dữ liệu ---------- */
  function filteredPlaces() {
    var q = norm(state.q);
    return db.places.filter(function (p) {
      if (state.cat && p.categoryId !== state.cat) return false;
      if (!q) return true;
      return norm(p.name + " " + (p.note || "") + " " + (p.address || "") + " " + catOf(p).name + " " + p.id).indexOf(q) >= 0;
    }).filter(hasCoords);
  }
  function tourPlaces(t) { return (t ? t.stops : []).map(function (s) { return placeById[s.placeId]; }).filter(function (p) { return p && hasCoords(p); }); }
  function distText(p) { return state.userLoc ? "Cách bạn " + fmtKm(hav(state.userLoc, { lat: +p.lat, lng: +p.lng })) : ""; }

  /* ---------- Giao diện ---------- */
  var view = $("#view");
  function setSheet(s) { if (innerWidth >= 900) return; document.body.classList.remove("sheet-peek", "sheet-half", "sheet-full"); document.body.classList.add("sheet-" + s); }
  function sheetState() { return ["peek", "half", "full"].filter(function (s) { return document.body.classList.contains("sheet-" + s); })[0] || "half"; }

  function renderChips() {
    var counts = {}; db.places.forEach(function (p) { counts[p.categoryId] = (counts[p.categoryId] || 0) + 1; });
    var html = '<button class="chip' + (state.cat ? "" : " on") + '" data-cat=""><span class="em">🗺️</span>Tất cả <small>' + db.places.length + "</small></button>";
    db.categories.forEach(function (c) {
      if (!counts[c.id]) return;
      html += '<button class="chip' + (state.cat === c.id ? " on" : "") + '" data-cat="' + esc(c.id) + '" title="' + esc(c.note || c.name) + '"><span class="em">' + iconHtml(c.icon) + "</span>" + esc(c.name) + " <small>" + counts[c.id] + "</small></button>";
    });
    var el = $("#chips"); el.innerHTML = html;
    el.hidden = state.view.type === "tour";
    el.querySelectorAll(".chip").forEach(function (b) {
      b.onclick = function () {
        state.cat = b.dataset.cat === state.cat ? "" : b.dataset.cat;
        state.view = { type: "list" }; state.stack = []; state.tab = "places"; activeId = null;
        clearRoute(); renderChips(); drawMarkers(); render(); setUrl(); fitVisible();
      };
    });
  }

  var AREA_COLORS = ["#e76f51", "#2a9d8f", "#457b9d", "#e9a23b", "#8e6bbf"];
  var areaLayer = L.layerGroup().addTo(map);
  function areaColor(a, i) { return a.color || AREA_COLORS[i % AREA_COLORS.length]; }
  function renderAreas() {
    var box = $("#areas");
    if (!db.areas.length) { box.hidden = true; return; }
    box.innerHTML = db.areas.map(function (a, i) {
      return '<button type="button" class="area" data-id="' + esc(a.id) + '" style="--a:' + esc(areaColor(a, i)) + '"><i></i>' + esc(a.name) + "</button>";
    }).join("");
    box.querySelectorAll(".area").forEach(function (b) { b.onclick = function () { openArea(b.dataset.id); }; });
    areaLayer.clearLayers();
    db.areas.forEach(function (a, i) {
      var r = 40000 / Math.pow(2, (+a.zoom || 13) - 10);
      L.circle([+a.lat, +a.lng], { radius: r, color: areaColor(a, i), weight: 2, opacity: .55, dashArray: "6 8", fillColor: areaColor(a, i), fillOpacity: .04, interactive: false }).addTo(areaLayer);
    });
    layoutTop();
  }
  function openArea(id) {
    var a = areaById[id]; if (!a) return;
    $("#areas").querySelectorAll(".area").forEach(function (b) { b.classList.toggle("on", b.dataset.id === id); });
    map.flyTo([+a.lat, +a.lng], +a.zoom || 14, { duration: .8 });
    setUrl("k", id);
  }
  function layoutTop() {
    var b = $(".topbar").getBoundingClientRect().bottom;
    document.documentElement.style.setProperty("--below-top", (b + 10) + "px");
  }
  addEventListener("resize", layoutTop);

  function pcard(p, extra) {
    var c = catOf(p), img = safeUrl(p.cover);
    var sub = [p.address, distText(p)].filter(Boolean).join(" · ") || (p.note ? p.note.split("\n")[0] : "");
    return '<button class="pcard" type="button" data-place="' + esc(p.id) + '" style="--c:' + esc(c.color) + '">' +
      '<span class="th">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="glyph">' + iconHtml(c.icon) + "</span>") + "</span>" +
      '<span class="tx"><span class="cat-tag"><span class="em">' + iconHtml(c.icon) + "</span>" + esc(c.name) + "</span><b>" + esc(p.name) + "</b>" +
      (sub ? "<small>" + esc(sub) + "</small>" : "") + (extra || "") + "</span><svg><use href=\"#i-next\"/></svg></button>";
  }
  function bindCards(root) {
    root.querySelectorAll("[data-place]").forEach(function (b) { b.onclick = function () { openPlace(b.dataset.place, true, true); }; });
    root.querySelectorAll("[data-tour]").forEach(function (b) { b.onclick = function () { openTour(b.dataset.tour); }; });
  }

  function renderList() {
    var places = filteredPlaces();
    if (state.userLoc) places.sort(function (a, b) { return hav(state.userLoc, a) - hav(state.userLoc, b); });
    var tours = db.tours.filter(function (t) { return tourPlaces(t).length; });
    var html = "";
    if (tours.length) html += '<div class="tabs" role="tablist"><button type="button" data-tab="places" class="' + (state.tab === "places" ? "on" : "") + '">Địa điểm (' + places.length + ')</button><button type="button" data-tab="tours" class="' + (state.tab === "tours" ? "on" : "") + '">Lịch trình (' + tours.length + ")</button></div>";
    if (state.tab === "places" || !tours.length) {
      html += '<label class="search"><svg><use href="#i-search"/></svg><input id="q" type="search" placeholder="Tìm quán ăn, chỗ ở, điểm tham quan…" value="' + esc(state.q) + '" autocomplete="off"></label>';
      html += places.length ? '<div class="list">' + places.map(function (p) { return pcard(p); }).join("") + "</div>" : '<p class="empty">Chưa có địa điểm phù hợp.</p>';
    } else {
      html += '<div class="list">' + tours.map(function (t) {
        var ps = tourPlaces(t), imgs = ps.map(function (p) { return safeUrl(p.cover); }).filter(Boolean).slice(0, 3);
        return '<button class="tcard" type="button" data-tour="' + esc(t.id) + '">' + (imgs.length ? '<span class="imgs">' + imgs.map(function (u) { return '<img src="' + esc(u) + '" alt="" loading="lazy">'; }).join("") + "</span>" : "") +
          '<span class="tb"><b>' + esc(t.name) + "</b><small>" + ps.length + " điểm dừng" + (t.note ? " · " + esc(t.note.split("\n")[0]) : "") + "</small></span></button>";
      }).join("") + "</div>";
    }
    view.innerHTML = html;
    view.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { state.tab = b.dataset.tab; render(); }; });
    var q = $("#q", view);
    if (q) {
      q.oninput = function () { state.q = q.value; var pos = q.selectionStart; renderList(); var nq = $("#q", view); nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (e) {} };
      q.onfocus = function () { setSheet("full"); };
    }
    bindCards(view);
  }

  function backRow(label) {
    return '<div class="back-row"><button class="icon-btn" type="button" id="back" aria-label="Quay lại"><svg><use href="#i-back"/></svg></button><span>' + esc(label) + "</span></div>";
  }

  function renderPlace(p) {
    var c = catOf(p), imgs = imagesOf(p), photos = (p.photos || []).map(safeUrl).filter(Boolean);
    var prev = state.stack[state.stack.length - 1];
    var html = backRow(prev && prev.type === "tour" ? "Lịch trình" : prev && prev.type === "place" ? "Quay lại" : "Tất cả địa điểm");
    if (imgs.length) html += '<div class="hero" id="hero" style="--c:' + esc(c.color) + '"><img src="' + esc(imgs[0]) + '" alt="' + esc(p.name) + '">' + (imgs.length > 1 ? '<span class="count">' + imgs.length + " ảnh</span>" : "") + "</div>";
    html += '<span class="cat-tag" style="--c:' + esc(c.color) + '"><span class="em">' + iconHtml(c.icon) + "</span>" + esc(c.name) + "</span>";
    html += '<h1 class="d-title">' + esc(p.name) + "</h1>";
    var sub = [p.address, distText(p)].filter(Boolean);
    if (sub.length) html += '<div class="d-sub">' + sub.map(function (s) { return "<span>" + esc(s) + "</span>"; }).join("") + "</div>";

    html += '<div class="actions">';
    if (p.phone) html += '<a class="act call" href="' + esc(telHref(p.phone)) + '"><i><svg><use href="#i-phone"/></svg></i>Gọi</a><a class="act zalo" href="' + esc(zaloHref(p.phone)) + '" target="_blank" rel="noopener"><i>Zalo</i>Zalo</a>';
    html += '<a class="act dir" href="' + esc(dirHref(p)) + '" target="_blank" rel="noopener"><i><svg><use href="#i-route"/></svg></i>Chỉ đường</a>';
    html += '<a class="act" href="' + esc(gmapHref(p)) + '" target="_blank" rel="noopener"><i><svg><use href="#i-gmap"/></svg></i>Google Maps</a>';
    html += '<button class="act" type="button" id="share-place"><i><svg><use href="#i-share"/></svg></i>Chia sẻ</button></div>';

    if (p.phone) html += '<div class="phone-row"><span><small class="muted">Điện thoại</small><br><b>' + esc(p.phone) + '</b></span><span class="btns"><a class="btn call" href="' + esc(telHref(p.phone)) + '"><svg><use href="#i-phone"/></svg>Gọi</a><a class="btn zalo" href="' + esc(zaloHref(p.phone)) + '" target="_blank" rel="noopener"><svg><use href="#i-chat"/></svg>Zalo</a></span></div>';
    if (p.note) html += '<p class="d-note">' + esc(p.note) + "</p>";
    if (photos.length) {
      html += '<h2 class="section-title">Album ảnh</h2><div class="gallery">' + photos.map(function (u) { return '<button type="button" data-img="' + esc(u) + '"><img src="' + esc(u) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>";
    }
    var inTours = db.tours.filter(function (t) { return t.stops.some(function (s) { return s.placeId === p.id; }); });
    if (inTours.length) html += '<h2 class="section-title">Có trong lịch trình</h2><div class="list">' + inTours.map(function (t) { return '<button class="tcard" type="button" data-tour="' + esc(t.id) + '"><span class="tb"><b>' + esc(t.name) + "</b><small>" + t.stops.length + " điểm dừng</small></span></button>"; }).join("") + "</div>";
    var near = db.places.filter(function (o) { return o.id !== p.id && hasCoords(o); })
      .map(function (o) { return { p: o, d: hav(p, o) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 4);
    if (near.length) html += '<h2 class="section-title">Gần đây</h2><div class="list">' + near.map(function (n) { return pcard(n.p, '<small class="tour-line">' + fmtKm(n.d) + " từ đây</small>"); }).join("") + "</div>";
    html += '<p class="meta">Mã địa điểm: ' + esc(p.id) + "</p>";
    view.innerHTML = html;
    $("#back", view).onclick = goBack;
    $("#share-place", view).onclick = function () { share(p.name, linkFor("p", p.id)); };
    var hero = $("#hero", view); if (hero) hero.onclick = function () { lightbox(imgs, 0); };
    view.querySelectorAll("[data-img]").forEach(function (b) { b.onclick = function () { lightbox(photos, photos.indexOf(b.dataset.img)); }; });
    bindCards(view);
  }

  function renderTour(t) {
    var ps = tourPlaces(t), mode = state.mode || t.mode || "driving";
    var imgs = ps.map(function (p) { return safeUrl(p.cover); }).filter(Boolean).slice(0, 3);
    var html = backRow("Tất cả lịch trình");
    if (imgs.length) html += '<div class="tcard" style="cursor:default;margin-bottom:12px"><span class="imgs" style="height:120px">' + imgs.map(function (u) { return '<img src="' + esc(u) + '" alt="">'; }).join("") + "</span></div>";
    html += '<span class="brand-kicker">Lịch trình</span><h1 class="d-title">' + esc(t.name) + "</h1>";
    if (t.note) html += '<p class="d-note">' + esc(t.note) + "</p>";
    html += '<div class="stats"><div class="stat"><b>' + ps.length + '</b><small>Điểm dừng</small></div><div class="stat"><b id="t-km">…</b><small>Quãng đường</small></div><div class="stat"><b id="t-min">…</b><small>Di chuyển</small></div></div>';
    html += '<div class="modes">' + Object.keys(MODES).map(function (k) { return '<button type="button" data-mode="' + k + '" class="' + (k === mode ? "on" : "") + '">' + MODES[k].label + "</button>"; }).join("") + "</div>";
    html += '<div class="timeline">';
    t.stops.forEach(function (s, i) {
      var p = placeById[s.placeId]; if (!p || !hasCoords(p)) return;
      if (i > 0) html += '<div class="leg" data-leg="' + (i - 1) + '"><span>Đang tính đường đi…</span></div>';
      html += '<div class="stop"><span class="num">' + (i + 1) + "</span>" + pcard(p, s.note ? '<span class="snote">📝 ' + esc(s.note) + "</span>" : "") + "</div>";
    });
    html += "</div>";
    html += '<div class="stack"><a class="btn dark block" id="tour-gmap" target="_blank" rel="noopener"><svg><use href="#i-route"/></svg>Mở cả hành trình trên Google Maps</a><button class="btn light block" type="button" id="share-tour"><svg><use href="#i-share"/></svg>Chia sẻ lịch trình</button></div>';
    view.innerHTML = html;
    $("#back", view).onclick = goBack;
    $("#share-tour", view).onclick = function () { share("Lịch trình: " + t.name, linkFor("t", t.id)); };
    var gm = { driving: "driving", bike: "bicycling", foot: "walking" }[mode];
    var pts = ps.map(function (p) { return p.lat + "," + p.lng; });
    var gUrl = "https://www.google.com/maps/dir/?api=1&travelmode=" + gm + "&origin=" + pts[0] + "&destination=" + pts[pts.length - 1] + (pts.length > 2 ? "&waypoints=" + encodeURIComponent(pts.slice(1, -1).slice(0, 9).join("|")) : "");
    $("#tour-gmap", view).href = gUrl;
    view.querySelectorAll("[data-mode]").forEach(function (b) { b.onclick = function () { state.mode = b.dataset.mode; renderTour(t); }; });
    bindCards(view);
    if (ps.length < 2) { $("#t-km").textContent = "–"; $("#t-min").textContent = "–"; clearRoute(); return; }
    routeFor(ps, mode).then(function (r) {
      if (state.view.type !== "tour" || state.view.id !== t.id) return;
      drawRoute(r);
      var km = 0, min = 0;
      r.legs.forEach(function (l, i) {
        km += l.km; min += l.min;
        var el = view.querySelector('[data-leg="' + i + '"]');
        if (el) el.innerHTML = "<span>" + (r.real ? "" : "≈ ") + fmtKm(l.km) + " · " + fmtMin(l.min) + "</span>";
      });
      $("#t-km").textContent = (r.real ? "" : "≈") + fmtKm(km); $("#t-min").textContent = fmtMin(min);
    });
  }

  function render() {
    var v = state.view;
    if (v.type === "place" && placeById[v.id]) renderPlace(placeById[v.id]);
    else if (v.type === "tour" && tourById[v.id]) renderTour(tourById[v.id]);
    else { state.view = { type: "list" }; renderList(); }
    document.body.classList.toggle("tour-mode", state.view.type === "tour");
  }
  function scrollTop() { $("#sheet-scroll").scrollTop = 0; }

  function openPlace(id, fly, fromList) {
    var p = placeById[id]; if (!p) return;
    if (!(state.view.type === "place" && state.view.id === id)) {
      if (state.view.type === "list") state.stack = [];
      state.stack.push(state.view);
    }
    state.view = { type: "place", id: id };
    render(); scrollTop(); setActive(id);
    if (sheetState() === "peek" || sheetState() === "full") setSheet("half");
    if (fly !== false) setTimeout(function () { focusLatLng({ lat: +p.lat, lng: +p.lng }, Math.max(map.getZoom(), 16)); }, 40);
    setUrl("p", id);
  }
  function openTour(id) {
    var t = tourById[id]; if (!t) return;
    state.stack = [{ type: "list" }]; state.tab = "tours"; state.mode = null;
    state.view = { type: "tour", id: id }; activeId = null;
    renderChips(); drawMarkers(); render(); scrollTop(); setSheet("half");
    setTimeout(function () { fitPoints(tourPlaces(t)); }, 60);
    setUrl("t", id);
  }
  function goBack() {
    var prev = state.stack.pop() || { type: "list" };
    var wasTour = state.view.type === "tour";
    state.view = prev; activeId = null;
    if (prev.type === "tour") { renderChips(); drawMarkers(); render(); setUrl("t", prev.id); fitPoints(tourPlaces(tourById[prev.id])); }
    else if (prev.type === "place") { render(); setActive(prev.id); setUrl("p", prev.id); }
    else { if (wasTour || routeLayer) { clearRoute(); } renderChips(); drawMarkers(); render(); setUrl(); }
    scrollTop();
  }

  map.on("click", function () {
    if (innerWidth < 900 && sheetState() !== "peek") setSheet("peek");
  });

  /* ---------- Kéo bảng thông tin (điện thoại) ---------- */
  (function () {
    var handle = $("#handle"), sheet = $("#sheet"), startY = 0, startT = 0, dragging = false, moved = false;
    function currentTop() { return sheet.getBoundingClientRect().top; }
    handle.addEventListener("pointerdown", function (e) { dragging = true; moved = false; startY = e.clientY; startT = currentTop(); handle.setPointerCapture(e.pointerId); });
    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return; var dy = e.clientY - startY; if (Math.abs(dy) > 4) moved = true; if (!moved) return;
      sheet.classList.add("dragging");
      var h = sheet.offsetHeight, top = Math.max(innerHeight - h, Math.min(innerHeight - 90, startT + dy));
      sheet.style.transform = "translateY(" + (top - (innerHeight - h)) + "px)";
    });
    function end(e) {
      if (!dragging) return; dragging = false; sheet.classList.remove("dragging"); sheet.style.transform = "";
      if (!moved) { setSheet({ peek: "half", half: "full", full: "half" }[sheetState()]); return; }
      var visible = innerHeight - (startT + (e.clientY - startY)), H = innerHeight;
      setSheet(visible < H * .3 ? "peek" : visible < H * .7 ? "half" : "full");
    }
    handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end);
  })();

  /* ---------- Xem ảnh ---------- */
  var lb = { list: [], i: 0 };
  function lightbox(list, i) { if (!list.length) return; lb.list = list; lb.i = Math.max(0, i); showLb(); $("#lightbox").hidden = false; }
  function showLb() { $("#lb-img").src = lb.list[lb.i]; $("#lb-count").textContent = (lb.i + 1) + " / " + lb.list.length; $("#lb-prev").hidden = $("#lb-next").hidden = lb.list.length < 2; }
  function lbMove(d) { lb.i = (lb.i + d + lb.list.length) % lb.list.length; showLb(); }
  $("#lb-close").onclick = function () { $("#lightbox").hidden = true; };
  $("#lb-prev").onclick = function (e) { e.stopPropagation(); lbMove(-1); };
  $("#lb-next").onclick = function (e) { e.stopPropagation(); lbMove(1); };
  $("#lightbox").onclick = function (e) { if (e.target === this) this.hidden = true; };
  var sx = null;
  $("#lightbox").addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
  $("#lightbox").addEventListener("touchend", function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) lbMove(dx < 0 ? 1 : -1); sx = null; });
  document.addEventListener("keydown", function (e) {
    if ($("#lightbox").hidden) { if (e.key === "Escape" && state.view.type !== "list") goBack(); return; }
    if (e.key === "Escape") $("#lightbox").hidden = true; if (e.key === "ArrowLeft") lbMove(-1); if (e.key === "ArrowRight") lbMove(1);
  });

  $("#share-btn").onclick = function () {
    var v = state.view;
    if (v.type === "place") share(placeById[v.id].name, linkFor("p", v.id));
    else if (v.type === "tour") share("Lịch trình: " + tourById[v.id].name, linkFor("t", v.id));
    else share((db.settings && db.settings.title) || "Map Local Bình Thuận", location.href);
  };

  /* ---------- Khởi động ---------- */
  function load() {
    view.innerHTML = '<p class="loading">Đang tải bản đồ…</p>';
    if (FILE) return new Promise(function (ok, no) {
      var sc = document.createElement("script"); sc.src = "data/seed.js";
      sc.onload = function () { window.MAP_SEED ? ok(window.MAP_SEED) : no(); }; sc.onerror = no; document.head.appendChild(sc);
    });
    return fetch("/api/data", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () { return fetch("/data/db.json", { cache: "no-store" }).then(function (r) { return r.json(); }); });
  }
  load().then(function (data) {
    db = data; ["categories", "places", "tours", "areas"].forEach(function (k) { if (!Array.isArray(db[k])) db[k] = []; });
    db.tours.forEach(function (t) { t.stops = Array.isArray(t.stops) ? t.stops : []; });
    db.categories.forEach(function (c) { catById[c.id] = c; });
    db.places.forEach(function (p) { p.lat = parseFloat(p.lat); p.lng = parseFloat(p.lng); placeById[p.id] = p; });
    db.tours.forEach(function (t) { tourById[t.id] = t; });
    db.areas.forEach(function (a) { areaById[a.id] = a; });
    var s = db.settings || {};
    if (s.title) { $("#brand-title").textContent = s.title.replace(/^Map Local\s*/i, "") || s.title; document.title = s.title + " – Thoai Mai House"; }
    if (s.center) map.setView([s.center.lat, s.center.lng], s.center.zoom || 11);

    var u = readUrl();
    if (u.c && catById[u.c]) state.cat = u.c;
    renderAreas(); renderChips();
    if (u.t && tourById[u.t]) { openTour(u.t); return; }
    drawMarkers();
    if (u.p && placeById[u.p]) { openPlace(u.p, true); return; }
    render();
    if (u.k && areaById[u.k]) { openArea(u.k); return; }
    if (db.places.length) setTimeout(fitVisible, 80);
  }).catch(function () {
    view.innerHTML = '<p class="empty">Không tải được dữ liệu bản đồ. Vui lòng thử lại sau.</p>';
  });
})();
