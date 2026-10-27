/* The hero portrait: a toy-like cartoon of the site owner, drawn in code, then read back as a coarse grid of glyphs
   (empty, dot, big dot, segment, cross, square) with an ordered dither, and drawn on a 2D canvas.
   It reacts to the pointer, shimmers, blinks, "develops" on load, and scatters away as the hero scrolls into the first project.
   field.js imports portraitBox (so the name leaves room for it) and setScatter (scroll). Reduced motion / no WebGL: drawn once, static. */

const root = document.documentElement;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const FG = '#F2F0EB', AC = '#FF4D1F';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SRC_W = 456, SRC_H = 552;

let mobileY = null;
export function setPortraitY(y) { mobileY = y; if (live && box && box.mobile && root.classList.contains('gl')) { box.y = y; canvas.style.top = y + 'px'; } }
/* where the portrait sits, in CSS px of the viewport (plain = in the document flow, size only) */
export function portraitBox(W, H, plain = false) {
  const mobile = W <= 760;
  const cols = mobile ? 52 : 96, rows = Math.round(cols * SRC_H / SRC_W);
  const pad = Math.max(20, Math.min(44, W * 0.031));
  let w, x = 0, y = 0;
  if (plain) w = mobile ? Math.min(W * 0.62, 300) : Math.min(W * 0.34, 380);
  else if (mobile) w = Math.min(W * 0.8, H * 0.4 * cols / rows);
  else w = Math.min(W * 0.4, (H - 150) * cols / rows);
  const h = w * rows / cols;
  if (!plain) {
    if (mobile) { x = (W - w) / 2; y = mobileY ?? Math.max(72, H * 0.095); }
    else { x = W - pad - w; y = 70 + (H - 70 - 30 - h) / 2; }
  }
  return { x, y, w, h, cols, rows, cell: w / cols, mobile };
}

/* ------------------------------------------------------------------ the photo (cut out with Apple Vision, cropped, greyscale + alpha) */
const IMG_P = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'assets/portrait-src.png'; });
let IMG = null;
/* the eyes, in the cropped photo's pixels (456 x 552): centre x, y, half width, half height */
const EYES = [[171, 235, 28, 13], [259, 240, 28, 13]];

/* rungs: 0 empty, 1 dot, 2 big dot, 3 segment (- or | by parity), 4 cross, 5 square. */
function buildGrid(cols, rows, img) {
  const S = 6, W = cols * S, H = rows * S, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, W, H);
  const d = cx.getImageData(0, 0, W, H).data, n = cols * rows, cov = new Float32Array(n), L = new Float32Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let a = 0, l = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const o = ((r * S + y) * W + c * S + x) * 4, al = d[o + 3] / 255; a += al; l += d[o] / 255 * al; }
    cov[r * cols + c] = a / (S * S); L[r * cols + c] = a > 0 ? l / a : 0;
  }
  /* local contrast: each cell against the mean and spread of the cells around it (only the person counts), so the skin,
     the white shirt, the hair and the scarf each get their own range and the features stand out of them */
  const R = Math.max(5, Math.round(cols / 11)), iw = cols + 1;
  const I0 = new Float64Array(iw * (rows + 1)), I1 = new Float64Array(iw * (rows + 1)), I2 = new Float64Array(iw * (rows + 1));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const w = cov[r * cols + c], l = L[r * cols + c], k = (r + 1) * iw + c + 1;
    I0[k] = w + I0[k - 1] + I0[k - iw] - I0[k - iw - 1]; I1[k] = w * l + I1[k - 1] + I1[k - iw] - I1[k - iw - 1]; I2[k] = w * l * l + I2[k - 1] + I2[k - iw] - I2[k - iw - 1];
  }
  const box = (I, r0, c0, r1, c1) => I[r1 * iw + c1] - I[r0 * iw + c1] - I[r1 * iw + c0] + I[r0 * iw + c0];
  const base = new Uint8Array(n), cdf = new Float32Array(n);
  const order = []; for (let i = 0; i < n; i++) if (cov[i] >= 0.4) order.push(i);
  order.sort((a, b) => L[a] - L[b]); order.forEach((i, k) => { cdf[i] = k / order.length; });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c; if (cov[i] < 0.4) continue;
    const r0 = Math.max(0, r - R), r1 = Math.min(rows, r + R + 1), c0 = Math.max(0, c - R), c1 = Math.min(cols, c + R + 1);
    const w = box(I0, r0, c0, r1, c1) || 1e-6, mu = box(I1, r0, c0, r1, c1) / w, sd = Math.sqrt(Math.max(0, box(I2, r0, c0, r1, c1) / w - mu * mu));
    const z = (L[i] - mu) / (sd + 0.05), lc = clamp(0.5 + 0.42 * z);
    const lum = clamp(0.45 * cdf[i] + 0.4 * Math.pow(L[i], 0.9) + 0.15 * lc), v = lum * 5, t = (BAYER[(r & 3) * 4 + (c & 3)] + 0.5) / 16;
    base[i] = clamp(Math.floor(v + t), 0, 5);
    if (base[i] === 0 && lum > 0.12) base[i] = 1;
  }
  const accent = new Int32Array(2).fill(-1);
  const eyes = EYES.map(([ex, ey, rx, ry]) => {
    const list = []; let rmin = 1e9, rmax = -1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const px = (c + 0.5) / cols * SRC_W, py = (r + 0.5) / rows * SRC_H;
      if (((px - ex) / rx) ** 2 + ((py - ey) / ry) ** 2 <= 1 && cov[r * cols + c] > 0.4) { list.push(r * cols + c); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
    }
    return { list, mid: Math.round((rmin + rmax) / 2) };
  });
  const hash = new Float32Array(n), ang = new Float32Array(n), thr = new Float32Array(n);
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) {
    hash[i] = rnd(); ang[i] = rnd() * 6.2832;
    const r = Math.floor(i / cols), c = i % cols;
    thr[i] = clamp((BAYER[(r & 3) * 4 + (c & 3)] + rnd()) / 16 * 0.9 + 0.06 * rnd(), 0, 1);
  }
  return { cols, rows, n, base, hash, ang, thr, accent, eyes };
}

/* glyph atlas: 0 dot, 1 big dot, 2 segment -, 3 segment |, 4 cross, 5 square, 6 accent */
function buildAtlas(gs) {
  const cv = document.createElement('canvas'); cv.width = gs * 7; cv.height = gs;
  const c = cv.getContext('2d'); c.fillStyle = FG; c.strokeStyle = FG; c.lineCap = 'butt';
  const at = (i, fn) => { c.save(); c.translate(i * gs + gs / 2, gs / 2); fn(); c.restore(); };
  at(0, () => { c.beginPath(); c.arc(0, 0, gs * 0.12, 0, 7); c.fill(); });
  at(1, () => { c.beginPath(); c.arc(0, 0, gs * 0.26, 0, 7); c.fill(); });
  at(2, () => c.fillRect(-gs * 0.4, -gs * 0.09, gs * 0.8, gs * 0.18));
  at(3, () => c.fillRect(-gs * 0.09, -gs * 0.4, gs * 0.18, gs * 0.8));
  at(4, () => { c.lineWidth = Math.max(1, gs * 0.17); c.beginPath(); c.moveTo(-gs * 0.3, -gs * 0.3); c.lineTo(gs * 0.3, gs * 0.3); c.moveTo(gs * 0.3, -gs * 0.3); c.lineTo(-gs * 0.3, gs * 0.3); c.stroke(); });
  at(5, () => c.fillRect(-gs * 0.39, -gs * 0.39, gs * 0.78, gs * 0.78));
  at(6, () => { c.fillStyle = AC; c.fillRect(-gs * 0.3, -gs * 0.3, gs * 0.6, gs * 0.6); });
  return cv;
}
const RUNG_GLYPH = [-1, 0, 1, 2, 4, 5];

/* ------------------------------------------------------------------ the live portrait */
const canvas = document.getElementById('portrait');
let G = null, box = null, atlas = null, gs = 0, dpr = 1, ctx = null;
let live = false, started = false, staticDone = false;
let scatter = 0, running = false, raf = 0, gone = false, tPrev = 0, tStart = 0;
let fi, fv, flick, blinkAt = 0, blinkEnd = 0, nextBlink = 0, ptr = { x: -1e5, y: -1e5, on: false, touch: false }, ptrK = 0;

function layout() {
  const gl = root.classList.contains('gl');
  box = portraitBox(innerWidth, innerHeight, !gl);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(box.w * dpr); canvas.height = Math.round(box.h * dpr);
  canvas.style.width = box.w + 'px'; canvas.style.height = box.h + 'px';
  if (gl) { canvas.style.left = box.x + 'px'; canvas.style.top = box.y + 'px'; } else { canvas.style.left = canvas.style.top = ''; }
  ctx = canvas.getContext('2d');
  gs = Math.ceil(canvas.width / box.cols);
  atlas = buildAtlas(gs);
  if (!G || G.cols !== box.cols) G = buildGrid(box.cols, box.rows, IMG);
  fi = new Float32Array(G.n); fv = new Float32Array(G.n); flick = new Float32Array(G.n);
}

function cellPos(i) { return [(i % G.cols + 0.5) * canvas.width / G.cols, (Math.floor(i / G.cols) + 0.5) * canvas.height / G.rows]; }

/* one frame. dev = develop progress 0..1, sc = scatter 0..1, interactive = false draws the plain static portrait */
function draw(dev, sc, t, interactive, blinking) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { cols, n, base, hash, ang, thr } = G, cw = canvas.width / cols, chh = canvas.height / G.rows;
  const blinkCells = blinking ? new Map() : null;
  if (blinking) G.eyes.forEach(e => e.list.forEach(i => blinkCells.set(i, Math.floor(i / cols) === e.mid ? 1 : 0)));
  let lastA = 1; ctx.globalAlpha = 1;
  for (let i = 0; i < n; i++) {
    let rung = base[i], g, rot = 0, ox = 0, oy = 0, a = 1, sz = 1;
    const c = i % cols, r = (i / cols) | 0;
    if (interactive) {
      const f = Math.max(fi[i], 0);
      if (f > 0.02 || flick[i] > 0.01 || fv[i] > 0.01) {
        const dir = hash[i] < 0.5 ? 1 : -1;
        rung = clamp(Math.round(rung + dir * f * 2.8 + (flick[i] > 0.01 ? (hash[i] < 0.5 ? 1 : -1) * 1 : 0)), 0, 5);
        if (f > 0.15) rot = f * (hash[i] - 0.5) * 4.4;
        if (f > 0.02) { const dx = c + 0.5 - ptr.cx, dy = r + 0.5 - ptr.cy, dl = Math.hypot(dx, dy) + 0.001; ox = dx / dl * fi[i] * cw * 1.8; oy = dy / dl * fi[i] * chh * 1.8; }
      }
      const dv = clamp((dev * 1.35 - thr[i]) / 0.35); if (dv < 1) sz = dv;
      if (sc > 0) {
        const k = clamp(sc * 1.5 - hash[i] * 0.5);
        if (k > 0) { const dd = (70 + 320 * hash[(i * 7) % n]) * dpr * k; ox += Math.cos(ang[i]) * dd; oy += Math.sin(ang[i]) * dd - 40 * k * dpr; rot += k * (hash[i] - 0.5) * 6; a = 1 - k; }
      }
    }
    g = RUNG_GLYPH[rung];
    if (g === 2 && ((c + r) & 1)) g = 3;
    if (blinkCells && blinkCells.has(i)) g = blinkCells.get(i) ? 2 : -1;
    else if (G.accent[0] === i || G.accent[1] === i) g = 6;
    if (g < 0 || a < 0.02 || sz <= 0.02) continue;
    if (g === 6 && rung === 0 && !interactive) g = 6;
    if (a !== lastA) { ctx.globalAlpha = a; lastA = a; }
    const cx = (c + 0.5) * cw + ox, cy = (r + 0.5) * chh + oy;
    if (rot === 0 && sz === 1) ctx.drawImage(atlas, g * gs, 0, gs, gs, Math.round(cx - gs / 2), Math.round(cy - gs / 2), gs, gs);
    else {
      const co = Math.cos(rot) * sz, si = Math.sin(rot) * sz;
      ctx.setTransform(co, si, -si, co, cx, cy);
      ctx.drawImage(atlas, g * gs, 0, gs, gs, -gs / 2, -gs / 2, gs, gs);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  ctx.globalAlpha = 1;
}

function drawStatic() { draw(1, 0, 0, false, false); }

function tick(now) {
  raf = 0; if (!running) return;
  const dt = Math.min((now - tPrev) / 1000 || 0.016, 0.05); tPrev = now;
  if (scatter >= 0.999) { if (!gone) { ctx.clearRect(0, 0, canvas.width, canvas.height); gone = true; } running = false; return; }
  gone = false;
  const dev = clamp((now - tStart) / 1200);
  /* pointer, in cell units */
  const rc = canvas.getBoundingClientRect(), k = box.cell;
  ptr.cx = (ptr.x - rc.left) / (rc.width / G.cols); ptr.cy = (ptr.y - rc.top) / (rc.height / G.rows);
  ptrK += ((ptr.on ? 1 : 0) - ptrK) * Math.min(1, dt * 10);
  const sig = (box.mobile ? 4.5 : 7.5), s2 = 2 * sig * sig, n = G.n, cols = G.cols;
  const r0 = Math.max(0, Math.floor(ptr.cy - sig * 3.2)), r1 = Math.min(G.rows - 1, Math.ceil(ptr.cy + sig * 3.2));
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = (i / cols) | 0;
    let target = 0;
    if (ptrK > 0.01 && r >= r0 && r <= r1) { const dx = c + 0.5 - ptr.cx, dy = r + 0.5 - ptr.cy; target = Math.exp(-(dx * dx + dy * dy) / s2) * ptrK; }
    if (target === 0 && fi[i] === 0 && fv[i] === 0) { if (flick[i] > 0) flick[i] = Math.max(0, flick[i] - dt * 5); continue; }
    fv[i] += ((target - fi[i]) * 170 - fv[i] * 17) * dt; fi[i] += fv[i] * dt;
    if (target === 0 && Math.abs(fi[i]) < 0.004 && Math.abs(fv[i]) < 0.02) fi[i] = fv[i] = 0;
    if (flick[i] > 0) flick[i] = Math.max(0, flick[i] - dt * 5);
  }
  /* shimmer: a few cells flick to a neighbouring glyph */
  const nf = dt * 26 + (Math.random() < (dt * 26) % 1 ? 1 : 0);
  for (let q = 0; q < nf; q++) { const j = (Math.random() * n) | 0; if (G.base[j] > 0) flick[j] = 1; }
  /* blink every 4-7 s */
  if (now > nextBlink && dev >= 1) { blinkAt = now; blinkEnd = now + 120; nextBlink = now + 4000 + Math.random() * 3000; }
  draw(dev, scatter, now, true, now >= blinkAt && now < blinkEnd);
  raf = requestAnimationFrame(tick);
}
function wake() { if (!live || running || document.hidden || scatter >= 0.999) return; running = true; tPrev = performance.now(); raf = requestAnimationFrame(tick); }

export function setScatter(v) { scatter = clamp(v); if (live) { if (scatter < 0.999) { canvas.style.visibility = ''; wake(); } } }
export function blink() { blinkAt = performance.now(); blinkEnd = blinkAt + 120; }

async function startLive() {
  if (started) return; started = true; IMG = await IMG_P; if (!IMG) { root.classList.remove('pt'); return; } live = true;
  root.classList.add('pt'); layout();
  const now = performance.now(); tStart = now; nextBlink = now + 1200 + 4200;
  ptr.cx = ptr.cy = -1e5;
  addEventListener('pointermove', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; ptr.touch = e.pointerType === 'touch'; });
  addEventListener('pointerdown', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; });
  ['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => { if (e.pointerType === 'touch') ptr.on = false; }));
  document.addEventListener('pointerleave', () => { ptr.on = false; });
  addEventListener('blur', () => { ptr.on = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else wake(); });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); gone = false; wake(); }, 150); });
  wake();
}
async function startStatic() {
  if (started || staticDone) return; staticDone = true; started = true; IMG = await IMG_P; if (!IMG) return;
  root.classList.add('pt'); layout(); drawStatic();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); drawStatic(); }, 150); });
}

/* a PNG of the glyph grid for the no-JS <img>: window.__portraitPNG(cellPx) -> data URL */
window.__portraitPNG = async cell => {
  const im = await IMG_P, g = buildGrid(96, 116, im), gsz = cell, cv = document.createElement('canvas');
  cv.width = 96 * gsz; cv.height = 116 * gsz; const c = cv.getContext('2d'); c.fillStyle = '#0A0A0A'; c.fillRect(0, 0, cv.width, cv.height);
  const at = buildAtlas(gsz);
  for (let i = 0; i < g.n; i++) {
    let gl = RUNG_GLYPH[g.base[i]]; const cc = i % 96, rr = (i / 96) | 0;
    if (gl === 2 && ((cc + rr) & 1)) gl = 3;
    if (gl >= 0) c.drawImage(at, gl * gsz, 0, gsz, gsz, cc * gsz, rr * gsz, gsz, gsz);
  }
  return cv.toDataURL('image/png');
};
window.__portrait = { blink, setScatter };

if (canvas) {
  const decide = () => {
    if (root.classList.contains('gl')) startLive();
    else if (root.classList.contains('nogl')) startStatic();
  };
  decide();
  if (!started) new MutationObserver(() => { decide(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
}
