/* Map Local · trang quản trị */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var EMOJIS = ["🏠", "🏨", "🛏️", "🍜", "🍲", "🦐", "🍽️", "☕", "🧋", "🍸", "🍺", "🅿️", "⛽", "📸", "🏖️", "⛰️", "🏜️", "🛕", "⛪", "🎡", "🛍️", "🏪", "💆", "🏥", "🚌", "🛵", "⭐", "📍"];
  var COLORS = ["#2a9d8f", "#3a86c8", "#457b9d", "#e05a6d", "#f08a24", "#f4a261", "#d4a017", "#8e6bbf", "#a0703f", "#1f7a6c"];
  var TILE = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  var CENTER = [10.9678946, 108.0377487];

  var token = "", me = "", db = null, tab = "places", filter = { q: "", cat: "" };

  /* ---------- Tiện ích ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d"); }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "muc"; }
  function uniqueId(base, list, selfId) { var id = slug(base), n = 2, out = id; while (list.some(function (x) { return x.id === out && x.id !== selfId; })) out = id + "-" + n++; return out; }
  function isImg(icon) { return /^(https?:\/\/|\/)/.test(String(icon || "")); }
  function iconHtml(icon) { return isImg(icon) ? '<img src="' + esc(icon) + '" alt="">' : esc(icon || "📍"); }
  function cat(id) { return db.categories.filter(function (c) { return c.id === id; })[0]; }
  function place(id) { return db.places.filter(function (p) { return p.id === id; })[0]; }
  function hav(a, b) { var R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; var x = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin(dLng / 2), 2); return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k) || sessionStorage.getItem(k); if (v === null) { localStorage.removeItem(k); sessionStorage.removeItem(k); } else (v.remember ? localStorage : sessionStorage).setItem(k, v.value); } catch (e) { return null; } }
  var toastT;
  function toast(msg, bad) { var t = $("#toast"); t.textContent = msg; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(toastT); toastT = setTimeout(function () { t.className = "toast"; }, bad ? 4500 : 2400); }
  function status(text, cls) { var s = $("#status"); s.textContent = text; s.className = "status " + (cls || ""); }
  function confirmBox(text, yesLabel) {
    return new Promise(function (ok) {
      $("#confirm-text").textContent = text; $("#confirm-yes").textContent = yesLabel || "Xoá"; $("#confirm").hidden = false;
      $("#confirm-yes").onclick = function () { $("#confirm").hidden = true; ok(true); };
      $("#confirm-no").onclick = function () { $("#confirm").hidden = true; ok(false); };
    });
  }
  function parseCoords(s) {
    var m = /(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/.exec(String(s || ""));
    if (!m) return null; var lat = +m[1], lng = +m[2];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: lat, lng: lng };
  }
  function shareUrl(kind, id) { return location.origin + "/" + kind + "/" + encodeURIComponent(id); }
  function copy(text) {
    var done = function () { toast("Đã sao chép: " + text); };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done, function () { prompt("Sao chép liên kết:", text); });
    prompt("Sao chép liên kết:", text);
  }

  /* ---------- API ---------- */
  function api(method, url, body) {
    return fetch(url, { method: method, headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || ("Lỗi " + r.status)); e.status = r.status; e.data = j; throw e; } return j; }); });
  }
  function loadDb() {
    return fetch("/api/data?fresh=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () { return fetch("/data/db.json?" + Date.now()).then(function (r) { return r.json(); }); })
      .then(function (d) {
        ["categories", "places", "tours", "areas"].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
        d.settings = d.settings || {}; db = d;
      });
  }
  var saving = Promise.resolve();
  function save(msg) {
    status("Đang lưu…", "saving");
    saving = saving.then(function () {
      return api("PUT", "/api/data", { db: db, baseUpdatedAt: db.updatedAt }).then(function (r) {
        db.updatedAt = r.updatedAt; status("Đã lưu " + new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }), "ok");
        if (msg) toast(msg);
      }).catch(function (e) {
        status("Chưa lưu được", "bad");
        if (e.status === 409) { toast("Dữ liệu vừa được sửa ở nơi khác. Đang tải lại…", true); return loadDb().then(render); }
        toast(e.message, true); throw e;
      });
    });
    return saving;
  }

  /* ---------- Ảnh ---------- */
  function resize(file, max, quality) {
    return new Promise(function (ok, no) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height)), w = Math.round(img.width * s), h = Math.round(img.height * s);
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        var g = c.getContext("2d"); g.fillStyle = "#fff"; if (file.type !== "image/png") g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        ok(file.type === "image/png" && max <= 256 ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", quality || .84));
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error("Không đọc được ảnh " + file.name)); };
      img.src = url;
    });
  }
  function upload(file, name, max) {
    return resize(file, max || 1600).then(function (data) { return api("POST", "/api/upload", { name: name || file.name.replace(/\.[^.]+$/, ""), data: data }); }).then(function (r) { return r.url; });
  }

  /* ---------- Hộp soạn thảo ---------- */
  var onClose = null;
  function openModal(title, bodyHtml, footHtml) {
    $("#modal-title").textContent = title; $("#modal-body").innerHTML = bodyHtml; $("#modal-foot").innerHTML = footHtml; $("#modal").hidden = false;
    $("#modal-body").scrollTop = 0; document.body.style.overflow = "hidden";
  }
  function closeModal() { $("#modal").hidden = true; document.body.style.overflow = ""; if (onClose) { onClose(); onClose = null; } }
  $("#modal-x").onclick = closeModal;
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#modal").hidden && $("#confirm").hidden) closeModal(); });
  function stdFoot(saveLabel) { return '<button class="btn ghost" type="button" data-close>Huỷ</button><button class="btn primary" type="button" id="m-save">' + (saveLabel || "Lưu") + "</button>"; }
  function bindClose() { $$("[data-close]", $("#modal")).forEach(function (b) { b.onclick = closeModal; }); }
  function miniMap(el, ll, zoom, onPick) {
    var m = L.map(el, { zoomControl: true, attributionControl: false }).setView(ll ? [ll.lat, ll.lng] : CENTER, ll ? (zoom || 16) : 11);
    L.tileLayer(TILE, { maxZoom: 20, subdomains: "abcd" }).addTo(m);
    var mk = null;
    function set(p, pan) { if (!mk) mk = L.marker([p.lat, p.lng], { draggable: true }).addTo(m).on("dragend", function () { var q = mk.getLatLng(); onPick({ lat: +q.lat.toFixed(7), lng: +q.lng.toFixed(7) }); }); else mk.setLatLng([p.lat, p.lng]); if (pan) m.setView([p.lat, p.lng], Math.max(m.getZoom(), 16)); }
    if (ll && onPick) set(ll);
    if (onPick) m.on("click", function (e) { var p = { lat: +e.latlng.lat.toFixed(7), lng: +e.latlng.lng.toFixed(7) }; set(p); onPick(p); });
    setTimeout(function () { m.invalidateSize(); }, 120);
    return { map: m, set: set };
  }

  /* ---------- ĐỊA ĐIỂM ---------- */
  function renderPlaces(main) {
    var q = norm(filter.q);
    var list = db.places.filter(function (p) { return (!filter.cat || p.categoryId === filter.cat) && (!q || norm(p.name + " " + p.id + " " + (p.note || "") + " " + (p.phone || "")).indexOf(q) >= 0); });
    var html = '<div class="bar"><h2>Địa điểm (' + db.places.length + ')</h2><button class="btn primary" type="button" id="add">+ Thêm địa điểm</button></div>' +
      '<div class="bar"><input type="search" id="fq" placeholder="Tìm theo tên, ID, ghi chú, SĐT…" value="' + esc(filter.q) + '"><select id="fc"><option value="">Tất cả danh mục</option>' +
      db.categories.map(function (c) { return '<option value="' + esc(c.id) + '"' + (filter.cat === c.id ? " selected" : "") + ">" + esc((isImg(c.icon) ? "" : c.icon + " ") + c.name) + "</option>"; }).join("") + "</select></div>";
    html += list.length ? '<div class="items">' + list.map(function (p) {
      var c = cat(p.categoryId) || { name: "Chưa có danh mục", icon: "📍", color: "#8a7565" };
      return '<div class="item"><span class="th" style="--c:' + esc(c.color) + '">' + (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy">' : iconHtml(c.icon)) + "</span>" +
        '<span class="tx"><b>' + esc(p.name) + '</b><small><span class="tag">' + iconHtml(c.icon) + " " + esc(c.name) + "</span> · ID: " + esc(p.id) + (p.phone ? " · ☎ " + esc(p.phone) : "") + "</small>" +
        "<small>" + (isFinite(p.lat) && p.lat !== "" ? (+p.lat).toFixed(6) + ", " + (+p.lng).toFixed(6) : "⚠️ Chưa có toạ độ") + ((p.photos || []).length ? " · " + p.photos.length + " ảnh" : "") + "</small></span>" +
        '<span class="acts"><button class="btn sm ghost" data-copy="' + esc(p.id) + '">🔗 Link</button><button class="btn sm ghost" data-edit="' + esc(p.id) + '">Sửa</button><button class="btn sm ghost" data-del="' + esc(p.id) + '">Xoá</button></span></div>';
    }).join("") + "</div>" : '<p class="empty">' + (db.places.length ? "Không có địa điểm phù hợp." : "Chưa có địa điểm nào. Bấm “Thêm địa điểm” để bắt đầu.") + "</p>";
    main.innerHTML = html;
    $("#add").onclick = function () { editPlace(null); };
    $("#fq").oninput = function () { filter.q = this.value; var pos = this.selectionStart; render(); var f = $("#fq"); f.focus(); try { f.setSelectionRange(pos, pos); } catch (e) {} };
    $("#fc").onchange = function () { filter.cat = this.value; render(); };
    $$("[data-edit]", main).forEach(function (b) { b.onclick = function () { editPlace(place(b.dataset.edit)); }; });
    $$("[data-copy]", main).forEach(function (b) { b.onclick = function () { copy(shareUrl("p", b.dataset.copy)); }; });
    $$("[data-del]", main).forEach(function (b) {
      b.onclick = function () {
        var p = place(b.dataset.del), used = db.tours.filter(function (t) { return t.stops.some(function (s) { return s.placeId === p.id; }); });
        confirmBox("Xoá “" + p.name + "”?" + (used.length ? " Điểm này cũng sẽ bị bỏ khỏi " + used.length + " lịch trình." : "")).then(function (yes) {
          if (!yes) return;
          db.places = db.places.filter(function (x) { return x.id !== p.id; });
          db.tours.forEach(function (t) { t.stops = t.stops.filter(function (s) { return s.placeId !== p.id; }); });
          render(); save("Đã xoá địa điểm");
        });
      };
    });
  }

  function editPlace(orig) {
    var p = orig ? JSON.parse(JSON.stringify(orig)) : { id: "", name: "", categoryId: (db.categories[0] || {}).id || "", lat: "", lng: "", cover: "", photos: [], note: "", phone: "", address: "", mapLink: "" };
    p.photos = p.photos || [];
    var idTouched = Boolean(orig);
    var catOpts = function () { return db.categories.map(function (c) { return '<option value="' + esc(c.id) + '"' + (p.categoryId === c.id ? " selected" : "") + ">" + esc((isImg(c.icon) ? "" : c.icon + " ") + c.name) + "</option>"; }).join(""); };
    var body =
      '<div class="grid2"><label class="field"><span>Tên địa điểm *</span><input id="f-name" value="' + esc(p.name) + '" placeholder="VD: Thoai Mai House | Hẻm 40 Lê Lợi (View Biển)"></label>' +
      '<label class="field"><span>ID vị trí <em>(dùng trong link chia sẻ)</em></span><input id="f-id" value="' + esc(p.id) + '" placeholder="tu-dong-tao-tu-ten"></label></div>' +
      '<label class="field"><span>Danh mục điểm đến</span><div class="inline"><select id="f-cat">' + catOpts() + '</select><button class="btn ghost" type="button" id="f-newcat">+ Danh mục mới</button></div></label>' +
      '<div class="box"><h3>📍 Vị trí</h3>' +
      '<label class="field"><span>Toạ độ <em>(dán dạng “10.919147, 108.109223”)</em></span><input id="f-coords" inputmode="decimal" value="' + (p.lat !== "" && p.lat != null ? esc(p.lat + ", " + p.lng) : "") + '" placeholder="10.919147326788922, 108.10922303234705"></label>' +
      '<label class="field"><span>Link Google Maps</span><div class="inline"><input id="f-link" value="' + esc(p.mapLink) + '" placeholder="https://maps.app.goo.gl/…"><button class="btn ghost" type="button" id="f-resolve">Lấy toạ độ</button></div><span class="hint">Dán link Google Maps rồi bấm “Lấy toạ độ”, hoặc bấm trực tiếp lên bản đồ dưới đây / kéo ghim để chỉnh.</span></label>' +
      '<div class="mini-map" id="f-map"></div></div>' +
      '<div class="grid2"><label class="field"><span>Số điện thoại <em>(hiện nút Gọi &amp; Zalo)</em></span><input id="f-phone" type="tel" value="' + esc(p.phone) + '" placeholder="0943 919 441"></label>' +
      '<label class="field"><span>Địa chỉ <em>(tuỳ chọn)</em></span><input id="f-addr" value="' + esc(p.address) + '" placeholder="Hẻm 40 Lê Lợi, Phan Thiết"></label></div>' +
      '<label class="field"><span>Ghi chú</span><textarea id="f-note" placeholder="VD: Sát biển Đồi Dương">' + esc(p.note) + "</textarea></label>" +
      '<div class="box"><h3>🖼️ Ảnh đại diện <em class="muted" style="font-weight:600">(làm icon ghim và ảnh xem trước)</em></h3><div class="cover-pick"><div class="prev" id="f-cover"></div><div style="display:grid;gap:8px">' +
      '<label class="btn ghost file-btn">Tải ảnh lên<input type="file" accept="image/*" id="f-cover-file"></label><button class="btn ghost" type="button" id="f-cover-del">Bỏ ảnh</button><span class="progress" id="f-cover-prog"></span></div></div></div>' +
      '<div class="box"><h3>📷 Album ảnh</h3><div class="photos" id="f-photos"></div><span class="progress" id="f-photo-prog"></span></div>';
    onClose = null;
    openModal(orig ? "Sửa địa điểm" : "Thêm địa điểm", body, stdFoot(orig ? "Lưu thay đổi" : "Thêm địa điểm"));
    bindClose();
    var mm = miniMap($("#f-map"), p.lat !== "" && p.lat != null ? { lat: +p.lat, lng: +p.lng } : null, 16, function (ll) { p.lat = ll.lat; p.lng = ll.lng; $("#f-coords").value = ll.lat + ", " + ll.lng; });
    // Hiện các điểm khác mờ để tham chiếu
    db.places.forEach(function (o) { if (o.id !== p.id && o.lat !== "") L.circleMarker([+o.lat, +o.lng], { radius: 5, color: "#b8895a", weight: 2, fillOpacity: .6 }).bindTooltip(o.name).addTo(mm.map); });

    $("#f-name").oninput = function () { if (!idTouched) $("#f-id").value = uniqueId(this.value, db.places, orig && orig.id); };
    $("#f-id").oninput = function () { idTouched = true; };
    $("#f-coords").oninput = function () { var c = parseCoords(this.value); if (c) { p.lat = c.lat; p.lng = c.lng; mm.set(c, true); } };
    $("#f-link").addEventListener("paste", function () { setTimeout(function () { var c = parseCoords(($("#f-link").value.match(/@(-?[\d.]+,-?[\d.]+)/) || [])[1]); if (c && !$("#f-coords").value) { p.lat = c.lat; p.lng = c.lng; $("#f-coords").value = c.lat + ", " + c.lng; mm.set(c, true); } }, 10); });
    $("#f-resolve").onclick = function () {
      var btn = this, link = $("#f-link").value.trim(); if (!link) return toast("Hãy dán link Google Maps trước", true);
      btn.disabled = true; btn.textContent = "Đang lấy…";
      api("GET", "/api/resolve?url=" + encodeURIComponent(link)).then(function (r) {
        p.lat = +(+r.lat).toFixed(7); p.lng = +(+r.lng).toFixed(7); $("#f-coords").value = p.lat + ", " + p.lng; mm.set(p, true);
        if (r.name && !$("#f-name").value) { $("#f-name").value = r.name; $("#f-name").oninput.call($("#f-name")); }
        toast("Đã lấy toạ độ từ link");
      }).catch(function (e) { toast(e.message, true); }).then(function () { btn.disabled = false; btn.textContent = "Lấy toạ độ"; });
    };
    $("#f-newcat").onclick = function () {
      var name = prompt("Tên danh mục mới (có thể chỉnh icon, màu ở tab Danh mục):"); if (!name) return;
      var c = { id: uniqueId(name, db.categories), name: name.trim(), icon: "📍", color: COLORS[db.categories.length % COLORS.length], note: "" };
      db.categories.push(c); p.categoryId = c.id; $("#f-cat").innerHTML = catOpts(); toast("Đã thêm danh mục “" + c.name + "” (lưu cùng địa điểm)");
    };
    function drawCover() { var el = $("#f-cover"); el.className = "prev" + (p.cover ? " has" : ""); el.style.backgroundImage = p.cover ? "url('" + p.cover.replace(/'/g, "%27") + "')" : ""; el.textContent = p.cover ? "" : "Chưa có ảnh"; $("#f-cover-del").hidden = !p.cover; }
    function drawPhotos() {
      $("#f-photos").innerHTML = p.photos.map(function (u, i) {
        return '<div class="ph"><img src="' + esc(u) + '" alt=""><div class="ops"><button type="button" data-l="' + i + '" title="Chuyển sang trái">◀</button><button type="button" data-c="' + i + '" title="Đặt làm ảnh đại diện">★</button><button type="button" data-r="' + i + '" title="Xoá ảnh">✕</button></div></div>';
      }).join("") + '<label class="upl">+ Thêm ảnh<br>(chọn nhiều)<input type="file" accept="image/*" multiple id="f-photo-file"></label>';
      $$("[data-l]", $("#f-photos")).forEach(function (b) { b.onclick = function () { var i = +b.dataset.l; if (i > 0) { var t = p.photos[i]; p.photos[i] = p.photos[i - 1]; p.photos[i - 1] = t; drawPhotos(); } }; });
      $$("[data-c]", $("#f-photos")).forEach(function (b) { b.onclick = function () { p.cover = p.photos[+b.dataset.c]; drawCover(); toast("Đã đặt làm ảnh đại diện"); }; });
      $$("[data-r]", $("#f-photos")).forEach(function (b) { b.onclick = function () { p.photos.splice(+b.dataset.r, 1); drawPhotos(); }; });
      $("#f-photo-file").onchange = function () {
        var files = Array.prototype.slice.call(this.files), done = 0, prog = $("#f-photo-prog");
        var nm = $("#f-id").value || slug($("#f-name").value) || "anh";
        var chain = Promise.resolve();
        files.forEach(function (f) {
          chain = chain.then(function () { prog.textContent = "Đang tải ảnh " + (done + 1) + "/" + files.length + "…"; return upload(f, nm); })
            .then(function (url) { done++; p.photos.push(url); drawPhotos(); }, function (e) { toast(e.message, true); });
        });
        chain.then(function () { prog.textContent = done ? "Đã tải " + done + " ảnh" : ""; });
      };
    }
    drawCover(); drawPhotos();
    $("#f-cover-del").onclick = function () { p.cover = ""; drawCover(); };
    $("#f-cover-file").onchange = function () {
      var f = this.files[0]; if (!f) return; var prog = $("#f-cover-prog"); prog.textContent = "Đang tải…";
      upload(f, ($("#f-id").value || slug($("#f-name").value)) + "-dai-dien", 1200).then(function (url) { p.cover = url; drawCover(); prog.textContent = "Đã tải"; }, function (e) { prog.textContent = ""; toast(e.message, true); });
    };
    $("#m-save").onclick = function () {
      p.name = $("#f-name").value.trim();
      if (!p.name) return toast("Hãy nhập tên địa điểm", true);
      var id = slug($("#f-id").value || p.name);
      if (db.places.some(function (x) { return x.id === id && (!orig || x.id !== orig.id); })) return toast("ID “" + id + "” đã được dùng, hãy chọn ID khác", true);
      var c = parseCoords($("#f-coords").value);
      if (!c) return toast("Hãy nhập toạ độ hoặc chọn vị trí trên bản đồ", true);
      p.lat = c.lat; p.lng = c.lng;
      p.categoryId = $("#f-cat").value; p.mapLink = $("#f-link").value.trim(); p.phone = $("#f-phone").value.trim();
      p.address = $("#f-addr").value.trim(); p.note = $("#f-note").value.trim();
      if (p.mapLink && !/^https?:\/\//i.test(p.mapLink)) return toast("Link Google Maps phải bắt đầu bằng https://", true);
      if (orig && orig.id !== id) db.tours.forEach(function (t) { t.stops.forEach(function (s) { if (s.placeId === orig.id) s.placeId = id; }); });
      p.id = id;
      var clean = { id: p.id, name: p.name, categoryId: p.categoryId, lat: p.lat, lng: p.lng, cover: p.cover || "", photos: p.photos, note: p.note, phone: p.phone, address: p.address, mapLink: p.mapLink };
      if (orig) db.places[db.places.indexOf(orig)] = clean; else db.places.unshift(clean);
      closeModal(); render(); save(orig ? "Đã lưu địa điểm" : "Đã thêm địa điểm");
    };
  }

  /* ---------- DANH MỤC ---------- */
  function renderCategories(main) {
    var counts = {}; db.places.forEach(function (p) { counts[p.categoryId] = (counts[p.categoryId] || 0) + 1; });
    var html = '<div class="bar"><h2>Danh mục điểm đến (' + db.categories.length + ')</h2><button class="btn primary" type="button" id="add">+ Thêm danh mục</button></div><p class="help">Thứ tự ở đây là thứ tự nút lọc trên bản đồ. Dùng ▲▼ để sắp xếp.</p>';
    html += db.categories.length ? '<div class="items">' + db.categories.map(function (c, i) {
      return '<div class="item"><span class="th icon" style="--c:' + esc(c.color) + '">' + iconHtml(c.icon) + '</span><span class="tx"><b>' + esc(c.name) + "</b><small>" + (counts[c.id] || 0) + " địa điểm · ID: " + esc(c.id) + (c.note ? " · " + esc(c.note) : "") + "</small></span>" +
        '<span class="acts"><button class="btn sm ghost" data-up="' + i + '"' + (i ? "" : " disabled") + '>▲</button><button class="btn sm ghost" data-down="' + i + '"' + (i < db.categories.length - 1 ? "" : " disabled") + '>▼</button><button class="btn sm ghost" data-edit="' + i + '">Sửa</button><button class="btn sm ghost" data-del="' + i + '">Xoá</button></span></div>';
    }).join("") + "</div>" : '<p class="empty">Chưa có danh mục.</p>';
    main.innerHTML = html;
    $("#add").onclick = function () { editCategory(null); };
    function move(i, d) { var a = db.categories, t = a[i]; a[i] = a[i + d]; a[i + d] = t; render(); save(); }
    $$("[data-up]", main).forEach(function (b) { b.onclick = function () { move(+b.dataset.up, -1); }; });
    $$("[data-down]", main).forEach(function (b) { b.onclick = function () { move(+b.dataset.down, 1); }; });
    $$("[data-edit]", main).forEach(function (b) { b.onclick = function () { editCategory(db.categories[+b.dataset.edit]); }; });
    $$("[data-del]", main).forEach(function (b) {
      b.onclick = function () {
        var c = db.categories[+b.dataset.del];
        if (counts[c.id]) return toast("Danh mục đang có " + counts[c.id] + " địa điểm. Hãy chuyển các địa điểm sang danh mục khác trước.", true);
        confirmBox("Xoá danh mục “" + c.name + "”?").then(function (y) { if (!y) return; db.categories.splice(db.categories.indexOf(c), 1); render(); save("Đã xoá danh mục"); });
      };
    });
  }

  function editCategory(orig) {
    var c = orig ? JSON.parse(JSON.stringify(orig)) : { id: "", name: "", icon: "📍", color: COLORS[db.categories.length % COLORS.length], note: "" };
    var body =
      '<div style="display:flex;gap:14px;align-items:center"><div class="icon-preview" id="c-prev"></div><label class="field" style="flex:1"><span>Tên danh mục *</span><input id="c-name" value="' + esc(c.name) + '" placeholder="VD: Quán Cafe"></label></div>' +
      '<label class="field"><span>Icon danh mục</span><div class="emoji-picks" id="c-emojis">' + EMOJIS.map(function (e) { return '<button type="button" data-e="' + e + '">' + e + "</button>"; }).join("") + "</div></label>" +
      '<div class="grid2"><label class="field"><span>Hoặc gõ emoji khác</span><input id="c-icon" value="' + (isImg(c.icon) ? "" : esc(c.icon)) + '" maxlength="8"></label>' +
      '<label class="field"><span>Hoặc tải ảnh icon <em>(PNG nền trong)</em></span><label class="btn ghost file-btn">Chọn ảnh icon<input type="file" accept="image/*" id="c-file"></label></label></div>' +
      '<label class="field"><span>Màu</span><div class="colors" id="c-colors">' + COLORS.map(function (x) { return '<button type="button" data-col="' + x + '" style="background:' + x + '" aria-label="' + x + '"></button>'; }).join("") + '<input type="color" id="c-color" value="' + esc(c.color) + '"></div></label>' +
      '<label class="field"><span>Ghi chú</span><textarea id="c-note" placeholder="Mô tả ngắn cho danh mục">' + esc(c.note) + "</textarea></label>";
    openModal(orig ? "Sửa danh mục" : "Thêm danh mục", body, stdFoot());
    bindClose();
    function draw() {
      $("#c-prev").style.background = c.color; $("#c-prev").innerHTML = iconHtml(c.icon);
      $$("[data-e]").forEach(function (b) { b.classList.toggle("on", b.dataset.e === c.icon); });
      $$("[data-col]").forEach(function (b) { b.classList.toggle("on", b.dataset.col === c.color); });
    }
    draw();
    $$("[data-e]").forEach(function (b) { b.onclick = function () { c.icon = b.dataset.e; $("#c-icon").value = c.icon; draw(); }; });
    $("#c-icon").oninput = function () { if (this.value.trim()) { c.icon = this.value.trim(); draw(); } };
    $$("[data-col]").forEach(function (b) { b.onclick = function () { c.color = b.dataset.col; $("#c-color").value = c.color; draw(); }; });
    $("#c-color").oninput = function () { c.color = this.value; draw(); };
    $("#c-file").onchange = function () { var f = this.files[0]; if (!f) return; toast("Đang tải icon…"); upload(f, "icon-" + slug($("#c-name").value), 128).then(function (u) { c.icon = u; $("#c-icon").value = ""; draw(); toast("Đã tải icon"); }, function (e) { toast(e.message, true); }); };
    $("#m-save").onclick = function () {
      c.name = $("#c-name").value.trim(); if (!c.name) return toast("Hãy nhập tên danh mục", true);
      c.note = $("#c-note").value.trim();
      if (!orig) { c.id = uniqueId(c.name, db.categories); db.categories.push(c); } else db.categories[db.categories.indexOf(orig)] = c;
      closeModal(); render(); save(orig ? "Đã lưu danh mục" : "Đã thêm danh mục");
    };
  }

  /* ---------- LỊCH TRÌNH ---------- */
  function renderTours(main) {
    var html = '<div class="bar"><h2>Lịch trình (' + db.tours.length + ')</h2><button class="btn primary" type="button" id="add">+ Tạo lịch trình</button></div><p class="help">Chọn các địa điểm đã thêm, sắp xếp thứ tự. Khách mở link sẽ thấy đường đi, khoảng cách và thời gian giữa các điểm.</p>';
    html += db.tours.length ? '<div class="items">' + db.tours.map(function (t, i) {
      var first = place((t.stops[0] || {}).placeId);
      return '<div class="item"><span class="th">' + (first && first.cover ? '<img src="' + esc(first.cover) + '" alt="">' : "🧭") + '</span><span class="tx"><b>' + esc(t.name) + "</b><small>" + t.stops.length + " điểm dừng · ID: " + esc(t.id) + "</small><small>" + esc(t.stops.map(function (s) { var p = place(s.placeId); return p ? p.name : "?"; }).join(" → ")) + "</small></span>" +
        '<span class="acts"><button class="btn sm ghost" data-copy="' + esc(t.id) + '">🔗 Link</button><a class="btn sm ghost" href="/map.html?t=' + encodeURIComponent(t.id) + '" target="_blank" rel="noopener">Xem</a><button class="btn sm ghost" data-edit="' + i + '">Sửa</button><button class="btn sm ghost" data-del="' + i + '">Xoá</button></span></div>';
    }).join("") + "</div>" : '<p class="empty">Chưa có lịch trình nào.</p>';
    main.innerHTML = html;
    $("#add").onclick = function () { editTour(null); };
    $$("[data-copy]", main).forEach(function (b) { b.onclick = function () { copy(shareUrl("t", b.dataset.copy)); }; });
    $$("[data-edit]", main).forEach(function (b) { b.onclick = function () { editTour(db.tours[+b.dataset.edit]); }; });
    $$("[data-del]", main).forEach(function (b) { b.onclick = function () { var t = db.tours[+b.dataset.del]; confirmBox("Xoá lịch trình “" + t.name + "”?").then(function (y) { if (!y) return; db.tours.splice(db.tours.indexOf(t), 1); render(); save("Đã xoá lịch trình"); }); }; });
  }

  function editTour(orig) {
    var t = orig ? JSON.parse(JSON.stringify(orig)) : { id: "", name: "", note: "", mode: "driving", stops: [] };
    var q = "", pmap = null, line = null, layer = null;
    var body =
      '<div class="grid2"><label class="field"><span>Tên lịch trình *</span><input id="t-name" value="' + esc(t.name) + '" placeholder="VD: 1 ngày khám phá Phan Thiết"></label>' +
      '<label class="field"><span>Phương tiện gợi ý</span><select id="t-mode"><option value="driving">Xe máy / Ô tô</option><option value="bike">Xe đạp</option><option value="foot">Đi bộ</option></select></label></div>' +
      '<label class="field"><span>Ghi chú lịch trình</span><textarea id="t-note" placeholder="Giới thiệu ngắn, thời gian gợi ý…">' + esc(t.note) + "</textarea></label>" +
      '<div class="tour-cols"><div class="box"><h3>Chọn địa điểm đã thêm</h3><input id="t-q" placeholder="Tìm địa điểm…" style="height:40px;padding:0 12px;border:1.5px solid var(--latte);border-radius:10px"><div class="pick-list" id="t-pick"></div></div>' +
      '<div class="box"><h3>Thứ tự điểm dừng <span class="muted" id="t-total" style="font-weight:700"></span></h3><div class="stop-list" id="t-stops"></div></div></div>' +
      '<div class="mini-map" id="t-map"></div>';
    openModal(orig ? "Sửa lịch trình" : "Tạo lịch trình", body, stdFoot(orig ? "Lưu lịch trình" : "Tạo lịch trình"));
    bindClose();
    $("#t-mode").value = t.mode || "driving";
    pmap = miniMap($("#t-map"), null, 13, null).map; layer = L.layerGroup().addTo(pmap);
    function thumb(p) { var c = cat(p.categoryId) || {}; return p.cover ? '<img src="' + esc(p.cover) + '" alt="">' : '<span class="sw" style="--c:' + esc(c.color || "#b8895a") + '">' + iconHtml(c.icon) + "</span>"; }
    function drawPick() {
      var nq = norm(q);
      $("#t-pick").innerHTML = db.places.filter(function (p) { return !nq || norm(p.name + " " + (p.note || "")).indexOf(nq) >= 0; }).map(function (p) {
        var c = cat(p.categoryId) || { name: "" }, n = t.stops.filter(function (s) { return s.placeId === p.id; }).length;
        return '<div class="pick">' + thumb(p) + '<span class="tx"><b>' + esc(p.name) + "</b><small>" + esc(c.name) + (p.note ? " · " + esc(p.note) : "") + (n ? " · ✓ đã chọn" : "") + '</small></span><button type="button" class="add" data-add="' + esc(p.id) + '" title="Thêm vào lịch trình">+</button></div>';
      }).join("") || '<p class="muted">Chưa có địa điểm.</p>';
      $$("[data-add]", $("#t-pick")).forEach(function (b) { b.onclick = function () { t.stops.push({ placeId: b.dataset.add, note: "" }); drawStops(); drawPick(); }; });
    }
    function drawStops() {
      var pts = [], total = 0, html = "";
      t.stops.forEach(function (s, i) {
        var p = place(s.placeId); if (!p) return;
        if (pts.length) { var d = hav(pts[pts.length - 1], p) * 1.3; total += d; html += '<div class="leg-hint">↓ khoảng ' + (d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km") + "</div>"; }
        pts.push({ lat: +p.lat, lng: +p.lng });
        html += '<div class="stop"><div class="head"><span class="n">' + (i + 1) + "</span><b>" + esc(p.name) + '</b><button type="button" data-up="' + i + '" title="Lên">▲</button><button type="button" data-down="' + i + '" title="Xuống">▼</button><button type="button" data-rm="' + i + '" title="Bỏ">✕</button></div>' +
          '<input data-note="' + i + '" value="' + esc(s.note) + '" placeholder="Ghi chú cho điểm dừng này (tuỳ chọn)"></div>';
      });
      $("#t-stops").innerHTML = html || '<p class="muted">Bấm “+” bên trái để thêm điểm.</p>';
      $("#t-total").textContent = pts.length > 1 ? "· ước tính " + total.toFixed(1).replace(".", ",") + " km" : "";
      $$("[data-up]", $("#t-stops")).forEach(function (b) { b.onclick = function () { var i = +b.dataset.up; if (i > 0) { t.stops.splice(i - 1, 0, t.stops.splice(i, 1)[0]); drawStops(); } }; });
      $$("[data-down]", $("#t-stops")).forEach(function (b) { b.onclick = function () { var i = +b.dataset.down; if (i < t.stops.length - 1) { t.stops.splice(i + 1, 0, t.stops.splice(i, 1)[0]); drawStops(); } }; });
      $$("[data-rm]", $("#t-stops")).forEach(function (b) { b.onclick = function () { t.stops.splice(+b.dataset.rm, 1); drawStops(); drawPick(); }; });
      $$("[data-note]", $("#t-stops")).forEach(function (inp) { inp.oninput = function () { t.stops[+inp.dataset.note].note = inp.value; }; });
      layer.clearLayers();
      pts.forEach(function (p, i) { L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html: '<div style="width:26px;height:26px;border-radius:50%;background:#4a2c1d;color:#fff;display:grid;place-items:center;font:900 12px Mulish,sans-serif;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">' + (i + 1) + "</div>", iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(layer); });
      if (pts.length > 1) L.polyline(pts.map(function (p) { return [p.lat, p.lng]; }), { color: "#4a2c1d", weight: 3, dashArray: "6 8" }).addTo(layer);
      if (pts.length) pmap.fitBounds(L.latLngBounds(pts.map(function (p) { return [p.lat, p.lng]; })), { padding: [30, 30], maxZoom: 16 });
    }
    $("#t-q").oninput = function () { q = this.value; drawPick(); };
    drawPick(); drawStops();
    $("#m-save").onclick = function () {
      t.name = $("#t-name").value.trim(); if (!t.name) return toast("Hãy nhập tên lịch trình", true);
      if (!t.stops.length) return toast("Hãy chọn ít nhất một địa điểm", true);
      t.note = $("#t-note").value.trim(); t.mode = $("#t-mode").value;
      t.stops = t.stops.map(function (s) { return { placeId: s.placeId, note: String(s.note || "").trim() }; });
      if (!orig) { t.id = uniqueId(t.name, db.tours); db.tours.unshift(t); } else db.tours[db.tours.indexOf(orig)] = t;
      closeModal(); render(); save(orig ? "Đã lưu lịch trình" : "Đã tạo lịch trình");
    };
  }

  /* ---------- KHU VỰC ---------- */
  function renderAreas(main) {
    var html = '<div class="bar"><h2>Khu vực nhanh (' + db.areas.length + ')</h2><button class="btn primary" type="button" id="add">+ Thêm khu vực</button></div><p class="help">Các lựa chọn trong nút “Khu vực” trên bản đồ, ví dụ “Trung Tâm Phan Thiết”. Mỗi khu vực có link chia sẻ riêng.</p>';
    html += db.areas.length ? '<div class="items">' + db.areas.map(function (a, i) {
      return '<div class="item"><span class="th">🗺️</span><span class="tx"><b>' + esc(a.name) + "</b><small>" + (+a.lat).toFixed(5) + ", " + (+a.lng).toFixed(5) + " · zoom " + a.zoom + " · ID: " + esc(a.id) + "</small></span>" +
        '<span class="acts"><button class="btn sm ghost" data-copy="' + esc(a.id) + '">🔗 Link</button><button class="btn sm ghost" data-up="' + i + '"' + (i ? "" : " disabled") + '>▲</button><button class="btn sm ghost" data-edit="' + i + '">Sửa</button><button class="btn sm ghost" data-del="' + i + '">Xoá</button></span></div>';
    }).join("") + "</div>" : '<p class="empty">Chưa có khu vực.</p>';
    main.innerHTML = html;
    $("#add").onclick = function () { editArea(null); };
    $$("[data-copy]", main).forEach(function (b) { b.onclick = function () { copy(shareUrl("k", b.dataset.copy)); }; });
    $$("[data-up]", main).forEach(function (b) { b.onclick = function () { var i = +b.dataset.up, a = db.areas; var x = a[i]; a[i] = a[i - 1]; a[i - 1] = x; render(); save(); }; });
    $$("[data-edit]", main).forEach(function (b) { b.onclick = function () { editArea(db.areas[+b.dataset.edit]); }; });
    $$("[data-del]", main).forEach(function (b) { b.onclick = function () { var a = db.areas[+b.dataset.del]; confirmBox("Xoá khu vực “" + a.name + "”?").then(function (y) { if (!y) return; db.areas.splice(db.areas.indexOf(a), 1); render(); save("Đã xoá khu vực"); }); }; });
  }
  function editArea(orig) {
    var a = orig ? JSON.parse(JSON.stringify(orig)) : { id: "", name: "", lat: CENTER[0], lng: CENTER[1], zoom: 13, link: "" };
    var body = '<label class="field"><span>Tên khu vực *</span><input id="a-name" value="' + esc(a.name) + '" placeholder="VD: Trung Tâm Phan Thiết"></label>' +
      '<label class="field"><span>Link Google Maps <em>(tuỳ chọn, để lấy toạ độ)</em></span><div class="inline"><input id="a-link" value="' + esc(a.link || "") + '"><button class="btn ghost" type="button" id="a-resolve">Lấy toạ độ</button></div></label>' +
      '<p class="help" style="margin:0">Di chuyển và phóng to bản đồ dưới đây đến khung nhìn mong muốn, khu vực sẽ lưu đúng khung đó.</p><div class="mini-map" id="a-map" style="height:320px"></div>';
    openModal(orig ? "Sửa khu vực" : "Thêm khu vực", body, stdFoot());
    bindClose();
    var m = miniMap($("#a-map"), { lat: +a.lat, lng: +a.lng }, +a.zoom, null).map;
    $("#a-resolve").onclick = function () {
      var link = $("#a-link").value.trim(); if (!link) return;
      var z = /,(\d+(?:\.\d+)?)z/.exec(link);
      api("GET", "/api/resolve?url=" + encodeURIComponent(link)).then(function (r) { m.setView([r.lat, r.lng], z ? Math.round(+z[1]) : 14); if (r.name && !$("#a-name").value) $("#a-name").value = r.name; toast("Đã cập nhật khung bản đồ"); }).catch(function (e) { toast(e.message, true); });
    };
    $("#m-save").onclick = function () {
      a.name = $("#a-name").value.trim(); if (!a.name) return toast("Hãy nhập tên khu vực", true);
      var c = m.getCenter(); a.lat = +c.lat.toFixed(7); a.lng = +c.lng.toFixed(7); a.zoom = m.getZoom(); a.link = $("#a-link").value.trim();
      if (!orig) { a.id = uniqueId(a.name, db.areas); db.areas.push(a); } else db.areas[db.areas.indexOf(orig)] = a;
      closeModal(); render(); save("Đã lưu khu vực");
    };
  }

  /* ---------- Khung chính ---------- */
  function render() {
    $$("#tabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.tab === tab); });
    var main = $("#main");
    ({ places: renderPlaces, categories: renderCategories, tours: renderTours, areas: renderAreas })[tab](main);
    if (storageWarning) main.insertAdjacentHTML("afterbegin", '<div class="banner">' + storageWarning + "</div>");
  }
  $$("#tabs button").forEach(function (b) { b.onclick = function () { tab = b.dataset.tab; try { sessionStorage.setItem("mlTab", tab); } catch (e) {} render(); }; });
  try { tab = sessionStorage.getItem("mlTab") || tab; } catch (e) {}
  var storageWarning = "";

  function start(info) {
    storageWarning = info && info.storage === false ? "⚠️ Chưa cấu hình lưu trữ: hãy thêm biến môi trường GITHUB_TOKEN trên Vercel (xem README). Bạn vẫn xem được dữ liệu nhưng chưa lưu được thay đổi." : "";
    $("#login").hidden = true; $("#app").hidden = false;
    loadDb().then(function () { status("Đã tải dữ liệu"); render(); }).catch(function () { toast("Không tải được dữ liệu", true); });
  }
  function resume(t) {
    token = t;
    return api("GET", "/api/login").then(function (info) { me = info.email; start(info); });
  }
  $("#login-form").onsubmit = function (e) {
    e.preventDefault(); $("#login-err").textContent = "";
    var btn = $("#login-form button[type=submit]"); btn.disabled = true;
    api("POST", "/api/login", { email: $("#em").value, password: $("#pw").value }).then(function (r) {
      token = r.token; me = r.email; store("mltok", { value: r.token, remember: $("#remember").checked }); $("#pw").value = ""; start({ storage: true });
    }).catch(function (er) { $("#login-err").textContent = er.message; }).then(function () { btn.disabled = false; });
  };
  $("#logout").onclick = function () { store("mltok", null); token = ""; location.reload(); };
  $("#account").onclick = function () {
    openModal("Tài khoản quản trị",
      '<p class="help" style="margin:0">Đổi email đăng nhập và/hoặc mật khẩu. Mật khẩu được lưu dạng mã hoá, không ai đọc được.</p>' +
      '<label class="field"><span>Email đăng nhập</span><input type="email" id="ac-email" value="' + esc(me) + '" autocomplete="username"></label>' +
      '<label class="field"><span>Mật khẩu hiện tại *</span><input type="password" id="ac-cur" autocomplete="current-password"></label>' +
      '<div class="grid2"><label class="field"><span>Mật khẩu mới <em>(để trống nếu không đổi)</em></span><input type="password" id="ac-new" autocomplete="new-password" minlength="8"></label>' +
      '<label class="field"><span>Nhập lại mật khẩu mới</span><input type="password" id="ac-new2" autocomplete="new-password"></label></div>',
      stdFoot("Lưu tài khoản"));
    bindClose();
    $("#m-save").onclick = function () {
      var cur = $("#ac-cur").value, nw = $("#ac-new").value, nw2 = $("#ac-new2").value, em = $("#ac-email").value.trim();
      if (!cur) return toast("Hãy nhập mật khẩu hiện tại", true);
      if (nw && nw.length < 8) return toast("Mật khẩu mới cần ít nhất 8 ký tự", true);
      if (nw !== nw2) return toast("Hai lần nhập mật khẩu mới không khớp", true);
      var btn = this; btn.disabled = true;
      api("POST", "/api/account", { currentPassword: cur, newEmail: em, newPassword: nw }).then(function (r) {
        token = r.token; me = r.email; store("mltok", { value: r.token, remember: true }); closeModal(); toast("Đã cập nhật tài khoản");
      }).catch(function (e) { toast(e.message, true); }).then(function () { btn.disabled = false; });
    };
  };
  window.addEventListener("beforeunload", function (e) { if (/Đang lưu/.test($("#status").textContent)) { e.preventDefault(); e.returnValue = ""; } });

  if (location.protocol === "file:") {
    $("#login").hidden = false;
    $("#login-form").innerHTML = '<span class="kicker">Map Local</span><h1>Quản trị bản đồ</h1><p>Trang quản trị cần chạy trên Vercel (hoặc lệnh <b>npm run dev</b>) để đăng nhập và lưu dữ liệu. Khi mở file trực tiếp trên máy, bạn chỉ xem thử được trang bản đồ.</p><a class="btn primary block" href="map.html">Xem thử bản đồ</a>';
    return;
  }
  var saved = store("mltok");
  if (saved) resume(saved).catch(function () { store("mltok", null); $("#login").hidden = false; });
  else $("#login").hidden = false;
})();
