/* ระบบจัดการเนื้อหา สำนักงานไปรษณีย์เขต 6 (Supabase)
   ต้องเปิดจากเบราว์เซอร์สมัยใหม่ (Chrome / Edge / Firefox) ไม่ใช่ IE */
(function () {
  'use strict';

  var sb = window.supabase.createClient(window.CONFIG.url, window.CONFIG.key);
  var $ = function (id) { return document.getElementById(id); };
  var MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function thaiDate(iso) {            // "2026-01-15" -> "15 ม.ค. 69"
    var p = String(iso).slice(0, 10).split('-');
    return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + String(Number(p[0]) + 543).slice(-2);
  }
  function js(s) {                    // สตริงปลอดภัยสำหรับฝังในไฟล์ .js
    return JSON.stringify(String(s == null ? '' : s)).replace(/<\//g, '<\\/').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }

  // ---------- ดึงข้อมูลทั้งหมด (เกิน 1,000 แถวก็ได้) ----------
  async function fetchAll(table, orders, filter) {
    var out = [], from = 0, step = 1000;
    for (;;) {
      var q = sb.from(table).select('*');
      if (filter) { q = q.eq(filter[0], filter[1]); }
      (orders || []).forEach(function (o) { q = q.order(o[0], { ascending: o[1] }); });
      var r = await q.range(from, from + step - 1);
      if (r.error) { throw r.error; }
      out = out.concat(r.data);
      if (r.data.length < step) { break; }
      from += step;
    }
    return out;
  }

  // ---------- ตัวเลือกจากตารางอ้างอิง ----------
  var LOOKUPS = {
    dept: function () { return fetchAll('dept', [['sort_order', true], ['dept_id', true]]).then(function (r) { return r.map(function (x) { return [x.dept_id, x.short_name]; }); }); },
    doc_type: function () { return fetchAll('doc_type', [['type_id', true]]).then(function (r) { return r.map(function (x) { return [x.type_id, x.type_name]; }); }); },
    news_category: function () { return fetchAll('news_category', [['cat_id', false]]).then(function (r) { return r.map(function (x) { return [x.cat_id, x.cat_name]; }); }); },
    hub_section: function () { return fetchAll('hub_section', [['sort_order', true], ['section_id', true]]).then(function (r) { return r.map(function (x) { return [x.section_id, x.name]; }); }); },
    hub_kind: function () { return Promise.resolve([['app', 'ระบบงาน (Application)'], ['doc', 'คู่มือ/เอกสาร (Document)']]); }
  };

  // ---------- นิยามแต่ละหน้าจัดการ ----------
  var ENT = {
    news: {
      title: 'ข่าวประชาสัมพันธ์', table: 'news', pk: 'news_id', touch: true, nav: 'ข่าว',
      order: [['published_at', false], ['news_id', false]],
      fields: [
        { k: 'title', l: 'หัวข้อข่าว (แสดงใต้โปสเตอร์)', t: 'text', req: 1, list: 1, full: 1 },
        { k: 'cat_id', l: 'หมวด', t: 'select', opts: 'news_category', num: 1, req: 1, list: 1, def: 2 },
        { k: 'image_file', l: 'รูปโปสเตอร์ (JPG, PNG, GIF, TIFF, WEBP)', t: 'image', list: 1, full: 1, fmt: function (v) { return /^https?:/i.test(v) ? 'มีรูป' : v; } },
        { k: 'link_url', l: 'ลิงก์เมื่อคลิก', t: 'text', def: '#' },
        { k: 'is_published', l: 'แสดงบนเว็บไซต์', t: 'bool', def: true, list: 1 }
      ]
    },
    circular: {
      title: 'หนังสือเวียนและคำสั่ง', table: 'circular', pk: 'circular_id', touch: true, nav: 'หนังสือเวียน',
      order: [['doc_date', false], ['circular_id', false]], search: 1,
      fields: [
        { k: 'title', l: 'หัวข้อเรื่อง', t: 'textarea', req: 1, list: 1, full: 1 },
        { k: 'type_id', l: 'ประเภท', t: 'select', opts: 'doc_type', num: 1, req: 1, list: 1, def: 2 },
        { k: 'dept_id', l: 'ส่วนงาน', t: 'select', opts: 'dept', num: 1, req: 1, list: 1 },
        { k: 'doc_no', l: 'เลขที่หนังสือ', t: 'text' },
        { k: 'doc_date', l: 'วันที่', t: 'date', req: 1, list: 1, fmt: thaiDate },
        { k: 'is_published', l: 'แสดงบนเว็บไซต์', t: 'bool', def: true, list: 1 },
        { k: 'files', l: 'ไฟล์แนบ (บรรทัดละ 1 ไฟล์ เช่น files/doc001.pdf)', t: 'textarea', virtual: 1, rows: 3, full: 1 },
        { k: 'links', l: 'ลิงก์อ้างอิง (บรรทัดละ 1 ลิงก์)', t: 'textarea', virtual: 1, rows: 2, full: 1 }
      ]
    },
    hub_section: {
      title: 'ระบบ/คู่มือ - หมวด', table: 'hub_section', pk: 'section_id', nav: 'ระบบ/คู่มือ (หมวด)',
      order: [['sort_order', true], ['section_id', true]],
      fields: [
        { k: 'name', l: 'ชื่อหมวด', t: 'text', req: 1, list: 1 },
        { k: 'description', l: 'คำอธิบายสั้น ๆ', t: 'text', list: 1 },
        { k: 'sort_order', l: 'ลำดับการแสดง', t: 'number', num: 1, def: 0, list: 1 }
      ],
      rowAction: { label: 'ดูรายการ', go: 'hub_item', filterKey: 'section_id' },
      deleteWarn: 'ลบหมวดนี้และรายการระบบ/คู่มือทั้งหมดในหมวดใช่หรือไม่?'
    },
    hub_item: {
      title: 'ระบบ/คู่มือ - รายการ', table: 'hub_item', pk: 'item_id', nav: 'ระบบ/คู่มือ (รายการ)',
      order: [['section_id', true], ['kind', true], ['sort_order', true], ['item_id', true]],
      filterBy: { k: 'section_id', opts: 'hub_section', label: 'หมวด' }, search: 1,
      fields: [
        { k: 'section_id', l: 'หมวด', t: 'select', opts: 'hub_section', num: 1, req: 1, list: 1 },
        { k: 'kind', l: 'ประเภท', t: 'select', opts: 'hub_kind', req: 1, list: 1, def: 'app' },
        { k: 'name', l: 'ชื่อ', t: 'text', req: 1, list: 1 },
        { k: 'url', l: 'ลิงก์ (URL ระบบ หรือไฟล์คู่มือ)', t: 'text', list: 1, def: '#' },
        { k: 'sort_order', l: 'ลำดับการแสดง', t: 'number', num: 1, def: 0, list: 1 }
      ]
    },
    phone_directory: {
      title: 'หมายเลขโทรศัพท์', table: 'phone_directory', pk: 'phone_id', nav: 'เบอร์โทรศัพท์',
      order: [['phone_id', true]], search: 1,
      fields: [
        { k: 'office_name', l: 'ชื่อที่ทำการ', t: 'text', req: 1, list: 1, def: 'สำนักงานไปรษณีย์เขต 6' },
        { k: 'postal_code', l: 'รหัสไปรษณีย์ / รหัสที่ทำการ', t: 'text', list: 1 },
        { k: 'position_name', l: 'ตำแหน่ง', t: 'text', list: 1 },
        { k: 'affiliation', l: 'สังกัด', t: 'text', list: 1, def: 'ปข.6' },
        { k: 'phone_number', l: 'เบอร์โทรศัพท์', t: 'text', req: 1, list: 1 }
      ]
    },
    dept: {
      title: 'ส่วนงาน', table: 'dept', pk: 'dept_id', nav: 'ส่วนงาน',
      order: [['sort_order', true], ['dept_id', true]],
      fields: [
        { k: 'short_name', l: 'ชื่อย่อ (แสดงในตัวกรองและป้ายส่วนงาน เช่น รป.)', t: 'text', req: 1, list: 1 },
        { k: 'full_name', l: 'ชื่อเต็ม (ไม่บังคับ)', t: 'text', list: 1 },
        { k: 'sort_order', l: 'ลำดับการแสดง', t: 'number', num: 1, def: 0, list: 1 }
      ],
      fkMsg: 'ลบไม่ได้ เพราะยังมีหนังสือเวียนใช้ส่วนงานนี้อยู่ (ย้ายหรือลบหนังสือเวียนเหล่านั้นก่อน)'
    },
    dashboard: {
      title: 'Dashboard (Looker Studio)', table: 'dashboard', pk: 'dashboard_id', nav: 'Dashboard',
      order: [['sort_order', true], ['dashboard_id', true]],
      fields: [
        { k: 'name', l: 'ชื่อแท็บ', t: 'text', req: 1, list: 1 },
        { k: 'embed_url', l: 'ลิงก์สำหรับฝัง (Embed URL ของ Looker Studio)', t: 'text', list: 1, full: 1 },
        { k: 'sort_order', l: 'ลำดับการแสดง', t: 'number', num: 1, def: 0, list: 1 }
      ]
    }
  };
  var NAV = ['news', 'circular', 'hub_section', 'hub_item', 'phone_directory', 'dept', 'dashboard', 'export'];

  // ---------- สถานะ ----------
  var state = { tab: 'news', editId: null, editRow: null, filter: null, q: '', lookups: {}, rows: [] };

  function flash(text, kind) {
    var el = $('flash');
    el.className = 'msg ' + (kind || 'ok');
    el.textContent = text;
    if (kind !== 'err') { setTimeout(function () { el.className = 'msg hidden'; }, 4000); }
  }
  function setDirty(v) {
    try { sessionStorage.setItem('reg6_dirty', v ? '1' : ''); } catch (e) { /* ignore */ }
    $('dirty').className = 'msg warn' + (v ? '' : ' hidden');
  }
  function errText(e) {
    if (!e) { return ''; }
    if (e.code === '42501' || /row-level security/i.test(e.message || '')) { return 'ไม่มีสิทธิ์ดำเนินการ (บัญชีนี้ไม่ได้อยู่ในรายชื่อผู้ดูแล)'; }
    return e.message || String(e);
  }

  // ---------- เมนู ----------
  function renderNav() {
    $('nav').innerHTML = NAV.map(function (k) {
      var name = k === 'export' ? 'ส่งออกไปยังเว็บไซต์' : ENT[k].nav;
      return '<button data-tab="' + k + '" class="' + (state.tab === k ? 'on' : '') + '">' + esc(name) + '</button>';
    }).join('');
  }
  function go(tab, filter) {
    state.tab = tab; state.editId = null; state.editRow = null; state.q = '';
    state.filter = filter || null;
    renderNav();
    render();
  }

  // ---------- หน้าจัดการทั่วไป ----------
  async function loadLookups(ent) {
    var need = {};
    ent.fields.forEach(function (f) { if (f.opts) { need[f.opts] = 1; } });
    if (ent.filterBy) { need[ent.filterBy.opts] = 1; }
    var names = Object.keys(need);
    for (var i = 0; i < names.length; i++) { state.lookups[names[i]] = await LOOKUPS[names[i]](); }
  }
  function lookupLabel(name, id) {
    var list = state.lookups[name] || [];
    for (var i = 0; i < list.length; i++) { if (String(list[i][0]) === String(id)) { return list[i][1]; } }
    return id;
  }


  // ---------- รูปโปสเตอร์: เลือกไฟล์ -> แปลงเป็น JPG -> อัปโหลดขึ้น Supabase Storage ----------
  var BUCKET = 'news-images', IMG_MAX_W = 1200, IMG_MAX_H = 1600, IMG_MAX_BYTES = 15 * 1024 * 1024;
  var IMG_EXT = { jpg: 1, jpeg: 1, png: 1, gif: 1, tif: 1, tiff: 1, webp: 1 };

  function imgSrc(v) {                // ค่าที่เก็บอาจเป็น URL เต็ม หรือชื่อไฟล์เดิมใน images/news/
    return /^https?:\/\//i.test(v) ? v : '';
  }
  function loadScript(src) {
    return new Promise(function (ok, bad) {
      var el = document.createElement('script');
      el.src = src; el.onload = ok; el.onerror = function () { bad(new Error('โหลดไลบรารีไม่สำเร็จ: ' + src)); };
      document.head.appendChild(el);
    });
  }
  async function decodeToCanvasSource(file, ext) {
    if (ext === 'tif' || ext === 'tiff') {       // เบราว์เซอร์ส่วนใหญ่เปิด TIFF ไม่ได้ ใช้ UTIF ถอดรหัสเอง
      if (!window.pako) { await loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js'); }
      if (!window.UTIF) { await loadScript('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js'); }
      var buf = await file.arrayBuffer();
      var ifds = window.UTIF.decode(buf);
      if (!ifds.length) { throw new Error('อ่านไฟล์ TIFF ไม่ได้'); }
      window.UTIF.decodeImage(buf, ifds[0]);
      var w = ifds[0].width, h = ifds[0].height;
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      ctx.putImageData(new ImageData(new Uint8ClampedArray(window.UTIF.toRGBA8(ifds[0])), w, h), 0, 0);
      return cv;
    }
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file); } catch (e) { /* ลองวิธีสำรอง */ }
    }
    return await new Promise(function (ok, bad) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { bad(new Error('อ่านไฟล์รูปไม่ได้ (ไฟล์อาจเสียหรือไม่ใช่รูป)')); };
      im.src = url;
    });
  }
  async function toJpegBlob(file) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!IMG_EXT[ext]) { throw new Error('รองรับเฉพาะไฟล์ JPG, PNG, GIF, TIFF, WEBP'); }
    if (file.size > IMG_MAX_BYTES) { throw new Error('ไฟล์ใหญ่เกิน 15 MB'); }
    var src = await decodeToCanvasSource(file, ext);
    var sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
    if (!sw || !sh) { throw new Error('อ่านขนาดรูปไม่ได้'); }
    var k = Math.min(1, IMG_MAX_W / sw, IMG_MAX_H / sh);
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(sw * k)); cv.height = Math.max(1, Math.round(sh * k));
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);   // พื้นหลังขาวแทนส่วนโปร่งใส
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    return await new Promise(function (ok, bad) {
      cv.toBlob(function (b) { b ? ok(b) : bad(new Error('แปลงรูปเป็น JPG ไม่สำเร็จ')); }, 'image/jpeg', 0.88);
    });
  }
  async function onPickImage(input) {
    var id = input.id.replace(/_pick$/, ''), msg = $(id + '_msg'), btn = document.querySelector('#ent-form button[type=submit]');
    var file = input.files && input.files[0];
    if (!file) { return; }
    msg.className = 'note'; msg.textContent = 'กำลังแปลงและอัปโหลดรูป...';
    if (btn) { btn.disabled = true; }
    try {
      var blob = await toJpegBlob(file);
      var path = 'news/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
      var up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (up.error) { throw up.error; }
      var url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      $(id).value = url;
      var pv = $(id + '_prev'); pv.src = url; pv.className = 'imgprev';
      $(id + '_clear').className = 'btn gray small';
      msg.textContent = 'อัปโหลดแล้ว (' + Math.round(blob.size / 1024) + ' KB) กด "บันทึก" เพื่อใช้รูปนี้';
    } catch (e) {
      msg.className = 'note err'; msg.textContent = 'อัปโหลดรูปไม่สำเร็จ: ' + errText(e);
      input.value = '';
    }
    if (btn) { btn.disabled = false; }
  }

  function fieldHtml(f, val) {
    var id = 'f_' + f.k, inner;
    if (f.t === 'bool') {
      return '<div class="full"><label class="chk"><input type="checkbox" id="' + id + '"' + (val ? ' checked' : '') + '> ' + esc(f.l) + '</label></div>';
    }
    if (f.t === 'image') {
      var has = !!val;
      inner = '<input type="hidden" id="' + id + '" value="' + esc(val) + '">' +
        '<div class="imgpick"><img id="' + id + '_prev" class="imgprev' + (imgSrc(val) ? '' : ' hidden') + '" src="' + esc(imgSrc(val)) + '" alt="">' +
        '<div><input type="file" id="' + id + '_pick" accept=".jpg,.jpeg,.png,.gif,.tif,.tiff,.webp,image/jpeg,image/png,image/gif,image/tiff,image/webp"> ' +
        '<button type="button" class="btn gray small' + (has ? '' : ' hidden') + '" id="' + id + '_clear">ลบรูป</button>' +
        '<p class="note" id="' + id + '_msg">' + (has && !imgSrc(val) ? 'รูปเดิม: ' + esc(val) + ' (ในโฟลเดอร์ images/news/) เลือกไฟล์ใหม่เพื่อแทนที่ ' : '') + 'เลือกไฟล์แล้วระบบจะย่อและแปลงเป็น JPG ให้อัตโนมัติ (ไม่เกิน 15 MB) แล้วอัปโหลดทันที</p></div></div>';
    } else if (f.t === 'textarea') {
      inner = '<textarea id="' + id + '" rows="' + (f.rows || 3) + '">' + esc(val) + '</textarea>';
    } else if (f.t === 'select') {
      inner = '<select id="' + id + '">' + (state.lookups[f.opts] || []).map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
    } else {
      inner = '<input type="' + (f.t === 'date' ? 'date' : f.t === 'number' ? 'number' : 'text') + '" id="' + id + '" value="' + esc(val) + '">';
    }
    return '<div' + (f.full ? ' class="full"' : '') + '><label for="' + id + '">' + esc(f.l) + '</label>' + inner + '</div>';
  }

  async function render() {
    if (state.tab === 'export') { return renderExport(); }
    var ent = ENT[state.tab], c = $('content');
    c.innerHTML = '<p class="note">กำลังโหลด...</p>';
    try {
      await loadLookups(ent);
      var filt = (ent.filterBy && state.filter) ? [ent.filterBy.k, state.filter] : null;
      state.rows = await fetchAll(ent.table, ent.order, filt);
    } catch (e) { c.innerHTML = ''; flash('โหลดข้อมูลไม่สำเร็จ: ' + errText(e), 'err'); return; }

    var vals = {};
    ent.fields.forEach(function (f) {
      var v = state.editRow ? state.editRow[f.k] : f.def;
      if (f.k === 'section_id' && !state.editRow && state.filter) { v = state.filter; }
      if (f.t === 'select' && (v === undefined || v === null || v === '') && (state.lookups[f.opts] || []).length) { v = state.lookups[f.opts][0][0]; }
      vals[f.k] = (v === undefined || v === null) ? '' : v;
    });
    if (state.editRow && state.editRow._virt) { vals.files = state.editRow._virt.files; vals.links = state.editRow._virt.links; }
    if (!state.editRow && ent.table === 'circular') { vals.files = ''; vals.links = ''; }

    var html = '<h2>' + esc(ent.title) + '</h2>';
    html += '<form id="ent-form" class="card"><h3>' + (state.editId ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่') + '</h3><div class="grid">';
    html += ent.fields.map(function (f) { return fieldHtml(f, vals[f.k]); }).join('');
    html += '</div><div class="actions"><button class="btn" type="submit">บันทึก</button>' +
            (state.editId ? '<button type="button" class="btn gray" id="cancel">ยกเลิก</button>' : '') + '</div></form>';

    html += '<div class="toolbar">';
    if (ent.filterBy) {
      html += '<select id="filter"><option value="">ทุก' + esc(ent.filterBy.label) + '</option>' + (state.lookups[ent.filterBy.opts] || []).map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(state.filter) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
    }
    if (ent.search) { html += '<input type="text" id="q" placeholder="ค้นหา..." value="' + esc(state.q) + '">'; }
    html += '<span class="count" id="count"></span></div>';
    html += '<div id="tbl"></div>';
    c.innerHTML = html;
    renderTable();
  }

  function cellText(ent, f, row) {
    var v = row[f.k];
    if (f.t === 'bool') { return '<span class="badge ' + (v ? 'on' : 'off') + '">' + (v ? 'แสดง' : 'ซ่อน') + '</span>'; }
    if (f.t === 'select') { return esc(lookupLabel(f.opts, v)); }
    if (v == null || v === '') { return '<span class="muted">-</span>'; }
    return esc(f.fmt ? f.fmt(v) : v);
  }
  function renderTable() {
    var ent = ENT[state.tab], q = state.q.toLowerCase();
    var cols = ent.fields.filter(function (f) { return f.list; });
    var rows = state.rows.filter(function (r) {
      if (!q) { return true; }
      return cols.some(function (f) { return String(r[f.k] == null ? '' : (f.t === 'select' ? lookupLabel(f.opts, r[f.k]) : r[f.k])).toLowerCase().indexOf(q) !== -1; });
    });
    var h = '<table><tr>' + cols.map(function (f) { return '<th>' + esc(f.l.replace(/\s*\(.*$/, '')) + '</th>'; }).join('') + '<th></th></tr>';
    rows.forEach(function (r) {
      h += '<tr>' + cols.map(function (f) { return '<td>' + cellText(ent, f, r) + '</td>'; }).join('') + '<td class="act">' +
        (ent.rowAction ? '<button class="link" data-act="go" data-id="' + esc(r[ent.pk]) + '">' + esc(ent.rowAction.label) + '</button> &nbsp; ' : '') +
        '<button class="link" data-act="edit" data-id="' + esc(r[ent.pk]) + '">แก้ไข</button> &nbsp; ' +
        '<button class="link" data-act="del" data-id="' + esc(r[ent.pk]) + '">ลบ</button></td></tr>';
    });
    if (!rows.length) { h += '<tr><td colspan="' + (cols.length + 1) + '" class="muted">ไม่พบรายการ</td></tr>'; }
    $('tbl').innerHTML = h + '</table>';
    $('count').textContent = 'ทั้งหมด ' + rows.length + ' รายการ';
  }

  // ---------- บันทึก / ลบ ----------
  function collect(ent) {
    var payload = {}, virt = {};
    ent.fields.forEach(function (f) {
      var el = $('f_' + f.k), v;
      if (f.t === 'bool') { v = el.checked; }
      else {
        v = el.value.trim();
        if (v === '') { if (f.req) { throw new Error('กรุณากรอก "' + f.l.replace(/\s*\(.*$/, '') + '"'); } v = f.num ? 0 : null; if (f.t === 'select') { v = null; } }
        else if (f.num) { v = Number(v); }
      }
      if (f.virtual) { virt[f.k] = v || ''; } else { payload[f.k] = v; }
    });
    return { payload: payload, virt: virt };
  }

  async function saveEntity(ev) {
    ev.preventDefault();
    var ent = ENT[state.tab], btn = ev.target.querySelector('button[type=submit]');
    var data;
    try { data = collect(ent); } catch (e) { flash(e.message, 'err'); return; }
    btn.disabled = true;
    try {
      var id = state.editId;
      if (ent.touch) { data.payload.updated_at = new Date().toISOString(); }
      if (id) {
        var u = await sb.from(ent.table).update(data.payload).eq(ent.pk, id);
        if (u.error) { throw u.error; }
      } else {
        if (ent.touch) { delete data.payload.updated_at; }
        var ins = await sb.from(ent.table).insert(data.payload).select(ent.pk).single();
        if (ins.error) { throw ins.error; }
        id = ins.data[ent.pk];
      }
      if (ent.table === 'circular') { await saveFiles(id, data.virt); }
      state.editId = null; state.editRow = null;
      setDirty(true);
      flash('บันทึกเรียบร้อยแล้ว');
      await render();
    } catch (e) { flash('บันทึกไม่สำเร็จ: ' + errText(e), 'err'); btn.disabled = false; }
  }

  async function saveFiles(cid, virt) {
    var d = await sb.from('circular_file').delete().eq('circular_id', cid);
    if (d.error) { throw d.error; }
    var rows = [];
    [['file', virt.files], ['link', virt.links]].forEach(function (p) {
      String(p[1] || '').split(/\r?\n/).forEach(function (line) {
        line = line.trim();
        if (line) { rows.push({ circular_id: cid, kind: p[0], url: line }); }
      });
    });
    if (rows.length) {
      var i = await sb.from('circular_file').insert(rows);
      if (i.error) { throw i.error; }
    }
  }

  async function startEdit(id) {
    var ent = ENT[state.tab], row = null;
    state.rows.forEach(function (r) { if (String(r[ent.pk]) === String(id)) { row = r; } });
    if (!row) { return; }
    row = Object.assign({}, row);
    if (ent.table === 'circular') {
      try {
        var files = await fetchAll('circular_file', [['file_id', true]], ['circular_id', id]);
        row._virt = {
          files: files.filter(function (f) { return f.kind === 'file'; }).map(function (f) { return f.url; }).join('\n'),
          links: files.filter(function (f) { return f.kind === 'link'; }).map(function (f) { return f.url; }).join('\n')
        };
      } catch (e) { flash('โหลดไฟล์แนบไม่สำเร็จ: ' + errText(e), 'err'); return; }
    }
    state.editId = id; state.editRow = row;
    await render();
    window.scrollTo(0, 0);
  }

  async function removeRow(id) {
    var ent = ENT[state.tab];
    if (!window.confirm(ent.deleteWarn || 'ลบรายการนี้ใช่หรือไม่?')) { return; }
    var r = await sb.from(ent.table).delete().eq(ent.pk, id);
    if (r.error) {
      flash(r.error.code === '23503' ? (ent.fkMsg || 'ลบไม่ได้ เพราะมีรายการอื่นอ้างอิงอยู่') : 'ลบไม่สำเร็จ: ' + errText(r.error), 'err');
      return;
    }
    setDirty(true);
    flash('ลบเรียบร้อยแล้ว');
    await render();
  }

  // ---------- ส่งออก content.js ----------
  async function buildContent() {
    var t = await Promise.all([
      fetchAll('dept', [['sort_order', true], ['dept_id', true]]),
      fetchAll('news', [['published_at', false], ['news_id', false]]),
      fetchAll('circular', [['doc_date', false], ['circular_id', false]]),
      fetchAll('circular_file', [['file_id', true]]),
      fetchAll('hub_section', [['sort_order', true], ['section_id', true]]),
      fetchAll('hub_item', [['sort_order', true], ['item_id', true]]),
      fetchAll('phone_directory', [['phone_id', true]]),
      fetchAll('dashboard', [['sort_order', true], ['dashboard_id', true]])
    ]);
    var depts = t[0], news = t[1], circ = t[2], cfiles = t[3], secs = t[4], items = t[5], phones = t[6], dash = t[7];
    var deptName = {};
    depts.forEach(function (d) { deptName[d.dept_id] = d.short_name; });

    var o = ['/* สร้างอัตโนมัติจากระบบจัดการเนื้อหา (Supabase) เมื่อ ' + new Date().toISOString() + ' - อย่าแก้ไขไฟล์นี้ด้วยมือ */'];
    o.push('var DEPTS = [' + depts.map(function (d) { return js(d.short_name); }).join(', ') + '];');
    o.push('');
    o.push('var NEWS = [\n' + news.filter(function (n) { return n.is_published; }).map(function (n) {
      return '  { cat: ' + js(n.cat_id === 1 ? 'ทั่วไป' : 'ประชาสัมพันธ์') + ', title: ' + js(n.title) + ', img: ' + js(n.image_file) + ', url: ' + js(n.link_url) + ' }';
    }).join(',\n') + '\n];');
    o.push('');
    o.push('var CIRCULARS = [\n' + circ.filter(function (c) { return c.is_published; }).map(function (c) {
      var fs = cfiles.filter(function (f) { return f.circular_id === c.circular_id; });
      var files = fs.filter(function (f) { return f.kind === 'file'; }), links = fs.filter(function (f) { return f.kind === 'link'; });
      return '  { title: ' + js(c.title) + ', no: ' + js(c.doc_no) + ', type: ' + c.type_id + ', date: ' + js(thaiDate(c.doc_date)) +
             ', dept: ' + js(deptName[c.dept_id]) + ', files: ' + files.length + ', links: ' + links.length + ', url: ' + js(files.length ? files[0].url : '') + ' }';
    }).join(',\n') + '\n];');
    o.push('');
    o.push('var HUB = [\n' + secs.map(function (s) {
      var its = items.filter(function (i) { return i.section_id === s.section_id; })
        .sort(function (a, b) { return a.kind === b.kind ? 0 : (a.kind < b.kind ? -1 : 1); });   // ระบบงานก่อนคู่มือ (sort เสถียร)
      return '  { name: ' + js(s.name) + ', desc: ' + js(s.description) + ', items: [' + its.map(function (i) {
        return ' { kind: ' + js(i.kind) + ', name: ' + js(i.name) + ', url: ' + js(i.url) + ' }';
      }).join(',') + ' ] }';
    }).join(',\n') + '\n];');
    o.push('');
    o.push('var PHONES = [\n' + phones.map(function (p) {
      return '  { name: ' + js(p.office_name) + ', zip: ' + js(p.postal_code) + ', pos: ' + js(p.position_name) + ', unit: ' + js(p.affiliation) + ', tel: ' + js(p.phone_number) + ' }';
    }).join(',\n') + '\n];');
    o.push('');
    o.push('var DASHBOARDS = [\n' + dash.map(function (d) { return '  { name: ' + js(d.name) + ', url: ' + js(d.embed_url) + ' }'; }).join(',\n') + '\n];');
    return o.join('\n') + '\n';
  }

  function download(text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript;charset=utf-8' }));
    a.download = 'content.js';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function renderExport() {
    $('content').innerHTML =
      '<h2>ส่งออกไปยังเว็บไซต์</h2>' +
      '<div class="card"><p><b>ปกติไม่ต้องทำอะไรในหน้านี้</b> เซิร์ฟเวอร์เว็บ (Windows Server 2008) ดึงข้อมูลล่าสุดจาก Supabase มาสร้างไฟล์ <b>js/content.js</b> เองตามรอบที่ตั้งไว้ (ทุก 5 นาที) ' +
      'ใช้ปุ่มด้านล่างเฉพาะเมื่อต้องการอัปเดตทันที หรือเมื่อเซิร์ฟเวอร์ซิงก์เองไม่ได้ ' +
      'วิธีนี้ให้สร้างไฟล์จากข้อมูลล่าสุดใน Supabase แล้วนำไปวางทับไฟล์เดิมในโฟลเดอร์ <b>js</b> ของเว็บไซต์ จากนั้นเปิดเว็บแล้วกด Ctrl+F5</p>' +
      '<div class="actions"><button class="btn" id="exDownload">สร้างและดาวน์โหลด content.js</button>' +
      '<button class="btn gray" id="exSave">สร้างและบันทึกลงโฟลเดอร์เว็บโดยตรง</button></div>' +
      '<p class="note">ปุ่มที่สอง (Chrome / Edge) เปิดหน้าต่างให้เลือกไฟล์ปลายทาง เช่น ไดรฟ์ที่ map ไปยังเซิร์ฟเวอร์ ' +
      '\\\\เครื่อง\\wwwroot\\reg6-web\\js\\content.js ถ้าเบราว์เซอร์ไม่รองรับจะดาวน์โหลดแทน</p></div>' +
      '<div class="card"><h3>ตัวอย่างไฟล์ที่สร้าง</h3><pre id="preview">(ยังไม่ได้สร้าง)</pre></div>';
    $('exDownload').onclick = function () { runExport(false); };
    $('exSave').onclick = function () { runExport(true); };
  }

  async function runExport(direct) {
    var btns = document.querySelectorAll('#content .btn');
    btns.forEach(function (b) { b.disabled = true; });
    try {
      var text = await buildContent();
      $('preview').textContent = text;
      if (direct && window.showSaveFilePicker) {
        var h = await window.showSaveFilePicker({ suggestedName: 'content.js', types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }] });
        var w = await h.createWritable();
        await w.write(new Blob([text], { type: 'text/javascript' }));
        await w.close();
        flash('บันทึกไฟล์ content.js เรียบร้อยแล้ว');
      } else {
        download(text);
        flash(direct ? 'เบราว์เซอร์นี้ไม่รองรับการบันทึกโดยตรง จึงดาวน์โหลดไฟล์แทน' : 'ดาวน์โหลดไฟล์ content.js แล้ว นำไปวางทับในโฟลเดอร์ js ของเว็บไซต์');
      }
      setDirty(false);
    } catch (e) {
      if (e && e.name === 'AbortError') { flash('ยกเลิกการบันทึก', 'warn'); }
      else { flash('สร้างไฟล์ไม่สำเร็จ: ' + errText(e), 'err'); }
    }
    btns.forEach(function (b) { b.disabled = false; });
  }

  // ---------- เข้าสู่ระบบ ----------
  async function showApp(session) {
    var ok = await sb.rpc('is_admin');
    if (ok.error || ok.data !== true) {
      await sb.auth.signOut();
      showLogin('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแล (ยังไม่ได้เพิ่มในตาราง admin_users)');
      return;
    }
    $('login-view').className = 'hidden';
    $('app-view').className = '';
    $('who').textContent = session.user.email;
    var dirty = false;
    try { dirty = !!sessionStorage.getItem('reg6_dirty'); } catch (e) { /* ignore */ }
    setDirty(dirty);
    go(state.tab);
  }
  function showLogin(msg) {
    $('app-view').className = 'hidden';
    $('login-view').className = '';
    var e = $('login-err');
    if (msg) { e.textContent = msg; e.className = 'msg err'; } else { e.className = 'msg err hidden'; }
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.getAttribute && t.getAttribute('data-tab')) { go(t.getAttribute('data-tab')); return; }
    var act = t.getAttribute && t.getAttribute('data-act');
    if (!act) { return; }
    var id = t.getAttribute('data-id'), ent = ENT[state.tab];
    if (act === 'edit') { startEdit(id); }
    else if (act === 'del') { removeRow(id); }
    else if (act === 'go') { go(ent.rowAction.go, id); }
  });
  document.addEventListener('submit', function (ev) { if (ev.target.id === 'ent-form') { saveEntity(ev); } });
  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'q') { state.q = ev.target.value; renderTable(); }
  });
  document.addEventListener('change', function (ev) {
    if (/^f_.*_pick$/.test(ev.target.id || '')) { onPickImage(ev.target); return; }
    if (ev.target.id === 'filter') { state.filter = ev.target.value || null; state.editId = null; state.editRow = null; render(); }
  });
  document.addEventListener('click', function (ev) {
    var tid = ev.target.id || '';
    if (/^f_.*_clear$/.test(tid)) {
      var base = tid.replace(/_clear$/, '');
      $(base).value = ''; $(base + '_prev').className = 'imgprev hidden'; $(base + '_pick').value = ''; ev.target.className = 'btn gray small hidden';
      $(base + '_msg').textContent = 'ลบรูปแล้ว กด "บันทึก" เพื่อยืนยัน';
    }
    if (ev.target.id === 'cancel') { state.editId = null; state.editRow = null; render(); }
  });
  $('goExport').onclick = function () { go('export'); };
  $('logout').onclick = async function () { await sb.auth.signOut(); showLogin(); };
  $('login-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var btn = ev.target.querySelector('button');
    btn.disabled = true;
    var r = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    btn.disabled = false;
    if (r.error) { showLogin('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); return; }
    await showApp(r.data.session);
  });

  (async function start() {
    var s = await sb.auth.getSession();
    if (s.data && s.data.session) { await showApp(s.data.session); } else { showLogin(); }
  })();
})();
