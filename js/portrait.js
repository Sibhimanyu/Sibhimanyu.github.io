/* The hero portrait: a toy-like cartoon of the site owner, drawn in code, then read back as a coarse grid of glyphs
   (empty, dot, big dot, segment, cross, square) with an ordered dither, and drawn on a 2D canvas.
   It reacts to the pointer, shimmers, blinks, "develops" on load, and scatters away as the hero scrolls into the first project.
   field.js imports portraitBox (so the name leaves room for it) and setScatter (scroll). Reduced motion / no WebGL: drawn once, static. */

const root = document.documentElement;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const FG = '#F2F0EB', AC = '#FF4D1F';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SRC_W = 460, SRC_H = 516;   /* the crop of assets/portrait-src.png (460x600): full width, top 86% */

let mobileY = null, NAME = null;
/* field.js hands over where it lays the name, so the dots draw the same letters in the same place */
export function setNameLayout(n) { NAME = n; if (live) { G = null; layout(); gone = false; wake(); } }
export const portraitLive = () => live;
export function setPortraitY(y) { mobileY = y; if (live && box && box.mobile && root.classList.contains('gl')) { box.y = y; canvas.style.top = y + 'px'; } }
/* where the portrait sits, in CSS px of the viewport (plain = in the document flow, size only) */
export function portraitBox(W, H, plain = false) {
  const mobile = W <= 760;
  const cols = mobile ? 100 : 165, rows = Math.round(cols * SRC_H / SRC_W);
  const pad = Math.max(20, Math.min(44, W * 0.031));
  let w, x = 0, y = 0;
  if (plain) w = mobile ? Math.min(W * 0.62, 300) : Math.min(W * 0.4, 520);
  else if (mobile) w = Math.min(W * 0.78, H * 0.4 * cols / rows);
  else w = Math.min(W * 0.4, (H - 150) * cols / rows);
  const h = w * rows / cols;
  if (!plain) {
    if (mobile) { x = (W - w) / 2; y = mobileY ?? Math.max(72, H * 0.095); }
    else { x = W - pad - w; y = Math.max(70, H - h); }
  }
  return { x, y, w, h, cols, rows, cell: w / cols, mobile };
}

/* ------------------------------------------------------------------ the photo (cut out with Apple Vision, cropped, greyscale + alpha) */
const IMG_P = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'assets/portrait-src.png'; });
let IMG = null;
/* the eyes, in the crop's pixels (435 x 516): centre x, y, half width, half height */
const EYES = [[143, 208, 18, 8], [212, 216, 18, 8]];

/* the tone mapping approved in tone-test.html, copied as is: local contrast against a box-blurred mean/std,
   a histogram equalisation and the raw tone, 3x supersampled, then averaged down to the grid */
function buildGrid(cols, rows, img, bleed = false) {
  const sx = 0, sy = 0, sw = img.width, sh = Math.round(img.height * 0.86);
  const S = 3, cw = cols * S, ch = rows * S, tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch;
  const x = tmp.getContext('2d', { willReadFrequently: true }); x.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  const d = x.getImageData(0, 0, cw, ch).data, n = cw * ch, l = new Float32Array(n), a = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255; a[i] = d[i * 4 + 3] / 255; }
  const R = Math.round(cw / 14), blur = src => { const t = new Float32Array(n), o = new Float32Array(n);
    for (let y = 0; y < ch; y++) { let acc = 0, c = 0; for (let xx = -R; xx < cw + R; xx++) { if (xx + R < cw) { acc += src[y * cw + xx + R]; c++; } if (xx - R - 1 >= 0) { acc -= src[y * cw + xx - R - 1]; c--; } if (xx >= 0 && xx < cw) t[y * cw + xx] = acc / Math.max(c, 1); } }
    for (let xx = 0; xx < cw; xx++) { let acc = 0, c = 0; for (let y = -R; y < ch + R; y++) { if (y + R < ch) { acc += t[(y + R) * cw + xx]; c++; } if (y - R - 1 >= 0) { acc -= t[(y - R - 1) * cw + xx]; c--; } if (y >= 0 && y < ch) o[y * cw + xx] = acc / Math.max(c, 1); } } return o; };
  const la = new Float32Array(n), sq = new Float32Array(n); for (let i = 0; i < n; i++) { la[i] = l[i] * a[i]; sq[i] = l[i] * l[i] * a[i]; }
  const ma = blur(a), ml = blur(la), mq = blur(sq);
  const vals = []; for (let i = 0; i < n; i++) if (a[i] > .5) vals.push(l[i]); vals.sort((p, q) => p - q); const nv = vals.length;
  const cdf = v => { let lo = 0, hi = nv; while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < v) lo = m + 1; else hi = m; } return lo / nv; };
  const t = new Float32Array(n);
  for (let i = 0; i < n; i++) { if (a[i] < .5) continue; const w = Math.max(ma[i], 1e-3), mu = ml[i] / w, sd = Math.sqrt(Math.max(mq[i] / w - mu * mu, 1e-4));
    const loc = Math.min(1, Math.max(0, 0.5 + (l[i] - mu) / (sd * 2.6)));
    t[i] = 0.5 * loc + 0.35 * cdf(l[i]) + 0.15 * l[i]; }
  const L = new Float32Array(cols * rows), A = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { let sl = 0, sa = 0; for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) { const q = (j * S + v) * cw + i * S + u; sl += t[q] * a[q]; sa += a[q]; }
    const q = j * cols + i; A[q] = sa / (S * S); L[q] = sa > 0 ? sl / sa : 0;
    const ex = Math.min(i / (cols * 0.15), (cols - 1 - i) / (cols * 0.15), bleed ? 9 : (rows - 1 - j) / (rows * 0.15));
    if (ex < 1) { const e = smooth(ex); L[q] *= e; if (e < 0.04) A[q] = 0; } }
  const m = cols * rows, hash = new Float32Array(m), ang = new Float32Array(m), thr = new Float32Array(m), vis = new Uint8Array(m);
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < m; i++) { hash[i] = rnd(); ang[i] = rnd() * 6.2832; thr[i] = rnd(); vis[i] = A[i] >= .5 ? 1 : 0; }
  const list = Uint32Array.from({ length: m }, (_, i) => i).filter(i => vis[i]);
  const eyes = EYES.map(([ex, ey, rx, ry]) => {
    const list = []; let rmin = 1e9, rmax = -1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const px = (c + 0.5) / cols * SRC_W, py = (r + 0.5) / rows * SRC_H;
      if (((px - ex) / rx) ** 2 + ((py - ey) / ry) ** 2 <= 1 && vis[r * cols + c]) { list.push(r * cols + c); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
    }
    return { list, mid: Math.round((rmin + rmax) / 2) };
  });
  return { cols, rows, n: m, L, A, vis, hash, ang, thr, eyes, list };
}
/* the halftone radius for brightness v, in cells (the test's rule); under 0.35px the dot is skipped */


const canvas = document.getElementById('portrait');
let G = null, box = null, dpr = 1, ctx = null;
let live = false, started = false, staticDone = false;
let scatter = 0, running = false, raf = 0, gone = false, tPrev = 0, tStart = 0;
let fi, fv, flick, blinkAt = 0, blinkEnd = 0, nextBlink = 0, ptr = { x: -1e5, y: -1e5, on: false, touch: false }, ptrK = 0;

function layout() {
  const gl = root.classList.contains('gl');
  box = portraitBox(innerWidth, innerHeight, !gl);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx = canvas.getContext('2d');
  if (gl) {
    /* one screen: the whole hero is a single dot field holding the name and the portrait, so the pointer acts the same on both */
    const cell = box.cell, cols = Math.ceil(innerWidth / cell), rows = Math.ceil(innerHeight / cell);
    canvas.width = Math.round(cols * cell * dpr); canvas.height = Math.round(rows * cell * dpr);
    canvas.style.width = cols * cell + 'px'; canvas.style.height = rows * cell + 'px'; canvas.style.left = '0px'; canvas.style.top = '0px';
    G = buildScreen(cols, rows, cell);
  } else {
    canvas.width = Math.round(box.w * dpr); canvas.height = Math.round(box.h * dpr);
    canvas.style.width = box.w + 'px'; canvas.style.height = box.h + 'px'; canvas.style.left = canvas.style.top = '';
    if (!G || G.cols !== box.cols || G.screen) G = buildGrid(box.cols, box.rows, IMG);
  }
  fi = new Float32Array(G.n); fv = new Float32Array(G.n); flick = new Float32Array(G.n);
}

/* one frame. 1-bit ordered dither: a cell is a solid square (0.62 of the cell) when its tone beats the Bayer 4x4 threshold.
   dev = develop progress 0..1, sc = scatter 0..1, interactive = false draws the plain static render */
function draw(dev, sc, t, interactive, blinking, cv = canvas, c2 = ctx, grid = G) {
  const { cols, rows, n, L, hash, ang, thr, list } = grid, cw = cv.width / cols, chh = cv.height / rows, sq = cw - 0.6 * dpr;
  c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, cv.width, cv.height);
  c2.fillStyle = FG; c2.strokeStyle = FG; c2.lineCap = 'round'; c2.lineWidth = Math.max(1, cw * 0.2);
  const blinkMid = blinking ? new Map() : null;
  if (blinking) grid.eyes.forEach(e => e.list.forEach(i => blinkMid.set(i, Math.floor(i / cols) === e.mid)));
  c2.globalAlpha = sc > 0 ? 1 - sc : 1;
  c2.beginPath();
  const glyphs = [];
  for (let q = 0; q < list.length; q++) {
    const i = list[q], c = i % cols, r = (i / cols) | 0, v = L[i];
    const on = v > (BAYER[(r & 3) * 4 + (c & 3)] + 0.5) / 16;
    let size = sq, ox = 0, oy = 0, f = 0;
    if (interactive) {
      const dv = clamp((dev * 1.4 - thr[i] * 0.4) / 0.6); if (dv < 1) size *= dv;
      f = Math.max(fi[i], 0); if (flick[i] > 0.01) f = Math.max(f, flick[i] * 0.9);
      if (f > 0.02 && ptr.cx > -1e4) { const dx = c + 0.5 - ptr.cx, dy = r + 0.5 - ptr.cy, dl = Math.hypot(dx, dy) + 0.001; ox = dx / dl * fi[i] * cw * 1.6; oy = dy / dl * fi[i] * chh * 1.6; }
      if (sc > 0) { const k = clamp(sc * 1.5 - hash[i] * 0.5); if (k > 0) { const dd = (60 + 300 * hash[(i * 7) % n]) * dpr * k; ox += Math.cos(ang[i]) * dd; oy += Math.sin(ang[i]) * dd - 40 * k * dpr; size *= 1 - k * 0.6; } }
    }
    if (blinkMid && blinkMid.has(i)) { if (blinkMid.get(i)) glyphs.push([(c + 0.5) * cw, (r + 0.5) * chh, 1, 1, 0, 1]); continue; }
    const cx = (c + 0.5) * cw + ox, cy = (r + 0.5) * chh + oy;
    if (f > 0.25 && (on || (v > 0.3 && f > 0.5))) { glyphs.push([cx, cy, v, ((c + r) & 1) ? 3 : 2, f * (hash[i] - 0.5) * 4.4, Math.min(1, f * 1.4)]); continue; }
    if (!on || size < 0.3) continue;
    if (f > 0.02) size *= 1 - f * 1.6;
    c2.rect(cx - size / 2, cy - size / 2, size, size);
  }
  c2.fill();
  if (glyphs.length) {
    c2.beginPath();
    for (const [cx, cy, v, kind, rot, sz] of glyphs) {
      const h = cw * 0.4 * sz, co = Math.cos(rot), si = Math.sin(rot), seg = (ax, ay, bx, by) => { c2.moveTo(cx + ax * co - ay * si, cy + ax * si + ay * co); c2.lineTo(cx + bx * co - by * si, cy + bx * si + by * co); };
      if (kind === 1) seg(-cw * 0.45, 0, cw * 0.45, 0);
      else if (v > 0.62) { seg(-h, -h, h, h); seg(h, -h, -h, h); }
      else if (v > 0.32) { if (kind === 3) seg(-h, 0, h, 0); else seg(0, -h, 0, h); }
      else { c2.moveTo(cx + h * 0.4, cy); c2.arc(cx, cy, h * 0.4, 0, 6.2832); }
    }
    c2.stroke(); c2.fill();
  }
  c2.globalAlpha = 1;
}

/* the portrait grid placed on a screen-sized grid, plus the name rasterised at the same cell size */
function buildScreen(cols, rows, cell) {
  const P = buildGrid(box.cols, box.rows, IMG, !box.mobile), ox = Math.round(box.x / cell), oy = Math.round(box.y / cell);
  const n = cols * rows, L = new Float32Array(n), A = new Float32Array(n);
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const R = r + oy, C = c + ox; if (R < 0 || R >= rows || C < 0 || C >= cols) continue;
    const q = R * cols + C, p = r * P.cols + c; if (P.A[p] >= 0.5) { L[q] = P.L[p]; A[q] = 1; }
  }
  if (NAME) {
    const S = 3, cv = document.createElement('canvas'); cv.width = cols * S; cv.height = rows * S;
    const x = cv.getContext('2d', { willReadFrequently: true }), k = S / cell;
    x.scale(k, k); x.font = `600 ${NAME.fs}px "Inter Tight", system-ui, sans-serif`; x.letterSpacing = `${-NAME.fs * 0.035}px`;
    x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff'; x.fillText(NAME.text, NAME.cx, NAME.base);
    const d = x.getImageData(0, 0, cv.width, cv.height).data, W3 = cv.width;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let s = 0; for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) s += d[((r * S + v) * W3 + c * S + u) * 4 + 3];
      const cov = s / (S * S * 255); if (cov > 0.3) { const q = r * cols + c; L[q] = 1; A[q] = 1; }
    }
  }
  const hash = new Float32Array(n), ang = new Float32Array(n), thr = new Float32Array(n), vis = new Uint8Array(n);
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) { hash[i] = rnd(); ang[i] = rnd() * 6.2832; thr[i] = rnd(); vis[i] = A[i] >= 0.5 ? 1 : 0; }
  const eyes = P.eyes.map(e => {
    const list = e.list.map(p => (((p / P.cols) | 0) + oy) * cols + (p % P.cols) + ox).filter(q => q >= 0 && q < n);
    return { list, mid: e.mid + oy };
  });
  return { cols, rows, n, L, A, vis, hash, ang, thr, eyes, screen: true, list: Uint32Array.from({ length: n }, (_, i) => i).filter(i => vis[i]) };
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
  const sig = ((ptr.touch ? 70 : 90) / 2) / box.cell, s2 = 2 * sig * sig, n = G.n, cols = G.cols;
  const r0 = Math.max(0, Math.floor(ptr.cy - sig * 3.2)), r1 = Math.min(G.rows - 1, Math.ceil(ptr.cy + sig * 3.2));
  const lst = G.list;
  for (let q = 0; q < lst.length; q++) {
    const i = lst[q], c = i % cols, r = (i / cols) | 0;
    let target = 0;
    if (ptrK > 0.01 && r >= r0 && r <= r1) { const dx = c + 0.5 - ptr.cx, dy = r + 0.5 - ptr.cy; target = Math.exp(-(dx * dx + dy * dy) / s2) * ptrK; }
    if (target === 0 && fi[i] === 0 && fv[i] === 0) { if (flick[i] > 0) flick[i] = Math.max(0, flick[i] - dt * 6); continue; }
    fv[i] += ((target - fi[i]) * 170 - fv[i] * 17) * dt; fi[i] += fv[i] * dt;
    if (target === 0 && Math.abs(fi[i]) < 0.004 && Math.abs(fv[i]) < 0.02) fi[i] = fv[i] = 0;
    if (flick[i] > 0) flick[i] = Math.max(0, flick[i] - dt * 6);
  }
  /* shimmer: a few cells flick to a neighbouring glyph */
  const nf = dt * 26 + (Math.random() < (dt * 26) % 1 ? 1 : 0);
  for (let q = 0; q < nf; q++) { const j = lst[(Math.random() * lst.length) | 0]; flick[j] = 1; }
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

/* a PNG of the halftone for the no-JS <img>: window.__portraitPNG(cellPx) -> data URL */
window.__portraitPNG = async cell => {
  const im = await IMG_P, cols = 165, rows = Math.round(cols * SRC_H / SRC_W), g = buildGrid(cols, rows, im, true), cv = document.createElement('canvas');
  cv.width = cols * cell; cv.height = rows * cell; const c = cv.getContext('2d'); c.fillStyle = '#0A0A0A'; c.fillRect(0, 0, cv.width, cv.height);
  draw(1, 0, 0, false, false, cv, c, g); const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
  const oc = o.getContext('2d'); oc.fillStyle = '#0A0A0A'; oc.fillRect(0, 0, o.width, o.height); oc.drawImage(cv, 0, 0);
  return o.toDataURL('image/png');
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
