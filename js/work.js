/* Work list: hovering or focusing a row shows that project's live page. It starts as 1-bit glyph squares and resolves into the
   real screenshot by an ordered-dither threshold (cell by cell, Bayer order, ~350 ms), and reverses quickly on leave.
   Fine pointers only; none for touch or reduced motion. */
(function () {
  var root = document.documentElement, th = document.getElementById('thumb'), list = document.querySelector('.idx-list');
  if (!th || !list || root.classList.contains('rm') || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], CELL = 4, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var imgs = {}, built = {}, cur = null, u = 0, uT = 0, tx = 0, ty = 0, cx = 0, cy = 0, rowBox = null, raf = 0, last = 0, shown = false, active = null;
  window.__thumb = { force: null };
  var ctx = th.getContext('2d');

  function load(src) { if (!imgs[src]) { var im = new Image(); im.decoding = 'async'; imgs[src] = im; im.src = src; } return imgs[src]; }
  var near = new IntersectionObserver(function (l) { if (l[0].isIntersecting) { near.disconnect(); list.querySelectorAll('li[data-shot]').forEach(function (li) { load(li.getAttribute('data-shot')); }); } }, { rootMargin: '900px 0px' });
  near.observe(list);

  /* the real page (top 16:10 slice) and its 1-bit glyph version, one per project and size */
  function build(src, w) {
    var key = src + '@' + w; if (built[key]) return built[key];
    var im = imgs[src]; if (!im || !im.complete || !im.naturalWidth) return null;
    var h = Math.round(w * 0.625), W = Math.round(w * dpr), H = Math.round(h * dpr);
    var iw = im.naturalWidth, ih = im.naturalHeight, sw = iw, sh = iw / 1.6, sx = 0;
    if (sh > ih) { sh = ih; sw = ih * 1.6; sx = (iw - sw) / 2; }
    var real = document.createElement('canvas'); real.width = W; real.height = H; var rc = real.getContext('2d'); rc.imageSmoothingQuality = 'high'; rc.drawImage(im, sx, 0, sw, sh, 0, 0, W, H);
    var cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL), cd = Math.max(2, Math.round(CELL * dpr)), t = document.createElement('canvas'); t.width = cols; t.height = rows;
    var tc = t.getContext('2d', { willReadFrequently: true }); tc.imageSmoothingQuality = 'high'; tc.drawImage(im, sx, 0, sw, sh, 0, 0, cols, rows);
    var d = tc.getImageData(0, 0, cols, rows).data, n = cols * rows, l = new Float32Array(n), s = [];
    for (var i = 0; i < n; i++) { l[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255; s.push(l[i]); }
    s.sort(function (a, b) { return a - b; }); var light = s[n >> 1] > 0.5;
    var gl = document.createElement('canvas'); gl.width = W; gl.height = H; var gc = gl.getContext('2d'); gc.fillStyle = '#0A0A0A'; gc.fillRect(0, 0, W, H); gc.fillStyle = '#F2F0EB';
    var thr = new Float32Array(n);
    for (var j = 0; j < rows; j++) for (var k = 0; k < cols; k++) {
      var v = l[j * cols + k], lo = 0, hi = n; while (lo < hi) { var m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
      var tone = 0.7 * (lo / n) + 0.3 * v; if (light) tone = 1 - tone;
      var b = (BAYER[(j & 3) * 4 + (k & 3)] + 0.5) / 16;
      if (tone > b) gc.fillRect(k * cd, j * cd, cd - 1, cd - 1);
      thr[j * cols + k] = (BAYER[((j >> 0) & 3) * 4 + (k & 3)] + ((j * 31 + k * 17) % 7) / 7) / 17;
    }
    return (built[key] = { real: real, glyph: gl, thr: thr, cols: cols, rows: rows, cd: cd, W: W, H: H, w: w, h: h });
  }
  function render(b, uu) {
    ctx.clearRect(0, 0, b.W, b.H); ctx.drawImage(b.glyph, 0, 0);
    if (uu <= 0) return;
    if (uu >= 1) { ctx.drawImage(b.real, 0, 0); return; }
    ctx.save(); ctx.beginPath();
    for (var j = 0; j < b.rows; j++) for (var k = 0; k < b.cols; k++) if (b.thr[j * b.cols + k] < uu) ctx.rect(k * b.cd, j * b.cd, b.cd, b.cd);
    ctx.clip(); ctx.drawImage(b.real, 0, 0); ctx.restore();
  }

  function frame(now) {
    raf = 0; var dt = Math.min((now - last) / 1000 || 0.016, 0.05); last = now;
    if (window.__thumb.force != null) u = window.__thumb.force;
    else u = uT > u ? Math.min(uT, u + dt / 0.35) : Math.max(uT, u - dt / 0.2);
    cx += (tx - cx) * 0.25; cy += (ty - cy) * 0.25;
    th.style.transform = 'translate(' + Math.round(cx) + 'px,' + Math.round(cy) + 'px)';
    if (active) { var b = build(active.src, active.w); if (b) render(b, u); }
    th.style.opacity = shown ? 1 : (u > 0 ? 1 : 0);
    if (!shown && u <= 0) { th.classList.remove('on'); return; }
    if (window.__thumb.force == null && (u !== uT || Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5 || shown)) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  function show(li, e) {
    var src = li.getAttribute('data-shot'); if (!src) return; load(src);
    var a = li.querySelector('.who a'), nr = a.getBoundingClientRect(), lk = li.querySelector('.l'), lr = (lk.firstElementChild || lk).getBoundingClientRect(), r = li.getBoundingClientRect();
    /* never over the name or the links: to the right of the name, as wide as the gap allows */
    var left = nr.right + 28, avail = lr.left - 16 - left, w = Math.round(Math.max(200, Math.min(360, avail)));
    if (w > avail) left = Math.max(nr.right + 12, lr.left - 16 - w);
    var h = Math.round(w * 0.625); rowBox = { top: r.top, bottom: r.bottom, h: h };
    if (!active || active.src !== src || active.w !== w) {
      active = { src: src, w: w }; th.width = Math.round(w * dpr); th.height = Math.round(h * dpr); th.style.width = w + 'px'; th.style.height = h + 'px';
      ctx.clearRect(0, 0, th.width, th.height);
    }
    var first = !shown; cur = li; tx = left; place(e); if (first) { cx = tx; cy = ty; u = 0; }
    shown = true; uT = 1; th.classList.add('on'); kick();
    var im = imgs[src]; if (im && !im.complete) im.addEventListener('load', kick, { once: true });
  }
  function place(e) { if (!rowBox) return; var y = (e ? e.clientY : (rowBox.top + rowBox.bottom) / 2) - rowBox.h / 2; ty = Math.max(rowBox.top - 12, Math.min(rowBox.bottom - rowBox.h + 12, y)); ty = Math.max(70, Math.min(innerHeight - rowBox.h - 8, ty)); }
  function hide() { cur = null; shown = false; uT = 0; kick(); }

  list.addEventListener('pointermove', function (e) {
    var li = e.target.closest && e.target.closest('li'); if (!li) { hide(); return; }
    if (li !== cur) show(li, e); else { place(e); kick(); }
  });
  list.addEventListener('pointerleave', hide);
  list.addEventListener('focusin', function (e) { var li = e.target.closest('li'); if (li) show(li, null); });
  list.addEventListener('focusout', hide);
  addEventListener('scroll', function () { if (cur) hide(); }, { passive: true });
})();
