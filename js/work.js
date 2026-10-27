/* Work list: hovering or focusing a row shows that project's screenshot as a 1-bit glyph thumbnail in the project's accent colour,
   following the pointer. Fine pointers only; none for touch or reduced motion. */
(function () {
  var root = document.documentElement, th = document.getElementById('thumb');
  if (!th || root.classList.contains('rm') || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], COLS = 84, ROWS = 63, cache = {}, cur = null;
  var dpr = Math.min(window.devicePixelRatio || 1, 2), cellDev = Math.max(2, Math.round(3 * dpr));
  th.width = COLS * cellDev; th.height = ROWS * cellDev; th.style.width = COLS * cellDev / dpr + 'px'; th.style.height = ROWS * cellDev / dpr + 'px';
  var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;

  /* the screenshot's top (or middle, for a wide one) as a 4:3 crop, equalised, then Bayer-dithered into squares */
  function build(li, img) {
    var w = img.naturalWidth, h = img.naturalHeight, ch = Math.min(h, w * ROWS / COLS), sy = h > w ? 0 : (h - ch) / 2;
    var t = document.createElement('canvas'); t.width = COLS; t.height = ROWS; var x = t.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, sy, w, ch, 0, 0, COLS, ROWS);
    var d = x.getImageData(0, 0, COLS, ROWS).data, n = COLS * ROWS, l = new Float32Array(n), s = [];
    for (var i = 0; i < n; i++) { l[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255; s.push(l[i]); }
    s.sort(function (a, b) { return a - b; }); var light = s[n >> 1] > 0.5;
    var out = document.createElement('canvas'); out.width = th.width; out.height = th.height; var c = out.getContext('2d');
    c.fillStyle = getComputedStyle(li).getPropertyValue('--sk-ac').trim() || '#F2F0EB';
    for (var j = 0; j < ROWS; j++) for (var k = 0; k < COLS; k++) {
      var v = l[j * COLS + k], lo = 0, hi = n; while (lo < hi) { var m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
      var tone = 0.7 * (lo / n) + 0.3 * v; if (light) tone = 1 - tone;
      if (tone > (BAYER[(j & 3) * 4 + (k & 3)] + 0.5) / 16) c.fillRect(k * cellDev, j * cellDev, cellDev - 1, cellDev - 1);
    }
    return out;
  }
  function show(li) {
    var src = li.getAttribute('data-shot'); if (!src) return; cur = li;
    th.style.setProperty('--sk-ac', getComputedStyle(li).getPropertyValue('--sk-ac'));
    if (cache[src]) { paint(cache[src]); return; }
    var im = new Image(); im.onload = function () { cache[src] = build(li, im); if (cur === li) paint(cache[src]); }; im.src = src;
  }
  function paint(canvas) { var c = th.getContext('2d'); c.clearRect(0, 0, th.width, th.height); c.drawImage(canvas, 0, 0); th.classList.add('on'); loop(); }
  function hide() { cur = null; th.classList.remove('on'); }
  function loop() {
    if (raf) return;
    raf = requestAnimationFrame(function step() {
      raf = 0; cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22; th.style.transform = 'translate(' + Math.round(cx) + 'px,' + Math.round(cy) + 'px)';
      if (cur && (Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5)) loop();
    });
  }
  function place(x, y) {
    var w = COLS * cellDev / dpr, h = ROWS * cellDev / dpr;
    tx = Math.min(innerWidth - w - 16, x + 26); ty = Math.max(70, Math.min(innerHeight - h - 16, y - h / 2));
    if (!th.classList.contains('on')) { cx = tx; cy = ty; }
  }
  var list = document.querySelector('.idx-list'); if (!list) return;
  list.addEventListener('pointermove', function (e) {
    var li = e.target.closest && e.target.closest('li'); if (!li) { hide(); return; }
    place(e.clientX, e.clientY); if (li !== cur) show(li); else loop();
  });
  list.addEventListener('pointerleave', hide);
  list.addEventListener('focusin', function (e) { var li = e.target.closest('li'); if (!li) return; var r = li.getBoundingClientRect(); place(r.right - 340, r.top + r.height / 2); show(li); });
  list.addEventListener('focusout', hide);
  addEventListener('scroll', hide, { passive: true });
})();
