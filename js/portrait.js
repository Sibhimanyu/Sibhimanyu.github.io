/* The hero and its hand-over to the Work list: one canvas of 1-bit squares.
   At rest it is the name and a portrait of the site owner (a photo, cut out, tone-mapped and ordered-dithered).
   Scrolling away, the squares rain down and re-gather as the project names of the Work list, row rules included;
   the DOM rows take over once they have settled. Squares near the pointer turn into glyphs (x, - or |, a dot),
   rotate, push outward and spring back. Reduced motion / no canvas: the portrait is drawn once, static. */

const root = document.documentElement;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const ease = v => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const FG = '#F2F0EB', NAME = 'Sibhimanyu';
const SRC_W = 460, SRC_H = 560, CROP_Y = 40;               /* the crop of assets/portrait-src.webp (460x600) */
const EYES = [[155, 173, 18, 8], [215, 177, 18, 8]];       /* in the crop: centre x, y, half width, half height */
const canvas = document.getElementById('portrait');
const IMG_P = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'assets/portrait-src.webp'; });
const mark = n => { try { performance.mark('hero-' + n); } catch (e) {} };
let nameOn = true, nameT = 0;

/* ------------------------------------------------------------------ tone mapping (the approved panel B) */
/* local contrast against a box-blurred mean/std, a histogram equalisation and the raw tone, 3x supersampled, averaged to the grid */
function buildGrid(cols, rows, img, bleed) {
  const k = img.height / 600, sy = CROP_Y * k, sh = Math.round(SRC_H * k), S = 3, cw = cols * S, ch = rows * S;
  const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch;
  const x = tmp.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, sy, img.width, sh, 0, 0, cw, ch);
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
    /* the photo's own side edges (the shoulders run off the frame) taper into the page; the bottom bleeds off the screen */
    const ex = Math.min(i / (cols * 0.1), (cols - 1 - i) / (cols * 0.1), bleed ? 9 : (rows - 1 - j) / (rows * 0.12));
    if (ex < 1) { const e = smooth(ex); L[q] *= e; if (e < 0.04) A[q] = 0; } }
  const eyes = EYES.map(([ex, ey, rx, ry]) => {
    const cells = []; let rmin = 1e9, rmax = -1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const px = (c + 0.5) / cols * SRC_W, py = (r + 0.5) / rows * SRC_H;
      if (((px - ex) / rx) ** 2 + ((py - ey) / ry) ** 2 <= 1) { cells.push([r, c]); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
    }
    return { cells, mid: Math.round((rmin + rmax) / 2) };
  });
  return { cols, rows, L, A, eyes };
}
const on = (L, r, c) => L > (BAYER[(r & 3) * 4 + (c & 3)] + 0.5) / 16;

/* ------------------------------------------------------------------ geometry */
let nameW100 = 0;
function measureName() {
  if (nameW100) return nameW100;
  const c = document.createElement('canvas').getContext('2d'); c.font = '600 100px "Inter Tight", system-ui, sans-serif'; c.letterSpacing = '-3.5px';
  const w = c.measureText(NAME).width;
  return document.fonts.check('600 100px "Inter Tight"') ? (nameW100 = w) : w;   /* a fallback font's width is not kept */
}
function geometry(W, H, plain) {
  const mobile = W <= 760, dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cols = mobile ? 100 : 165, rows = Math.round(cols * SRC_H / SRC_W), pad = Math.max(20, Math.min(44, W * 0.031));
  let w = plain ? (mobile ? Math.min(W * 0.62, 300) : Math.min(W * 0.4, 520)) : mobile ? Math.min(W * 0.78, H * 0.4 * cols / rows) : Math.min(W * 0.4, (H - 150) * cols / rows);
  const cellDev = Math.max(2, Math.round(w * dpr / cols)), cell = cellDev / dpr; w = cols * cell;
  const h = rows * cell, g = { W, H, dpr, mobile, cols, rows, cell, cellDev, sqDev: cellDev - Math.max(1, Math.round(0.6 * dpr)), w, h, pad };
  if (plain) return g;
  const wMax = measureName();
  if (mobile) {
    const fs = Math.min(100 * W * 0.9 / wMax, 1500), tagH = 46, groupH = h + 24 + fs * 0.727 + fs * 0.22 + 32 + tagH, lo = 76, hi = H - 104;
    g.x = (W - w) / 2; g.y = Math.round(lo + Math.max(0, (hi - lo - groupH) * 0.45));
    Object.assign(g, { fs, cx: W / 2, base: g.y + h + 24 + fs * 0.727 });
    g.tagTop = Math.round(g.base + fs * 0.22 + 32);
  } else {
    g.x = W - pad - w; g.y = Math.max(70, H - h);
    const wPx = g.x - pad - 36, fs = Math.min(100 * wPx / wMax, 1500);
    Object.assign(g, { fs, cx: (pad + g.x - 36) / 2, base: H * 0.45 + fs * 0.26 });
  }
  return g;
}

/* text as ON cells of the page-wide cell grid (cell (C,R) covers x C*cell.., doc y R*cell..): coverage above 0.3 is a square */
function rasterText(text, font, ls, x, base, fs, align, wEst, cell) {
  const S = 3, pad = cell * 2, left = align === 'center' ? x - wEst / 2 : x;
  const C0 = Math.floor((left - pad) / cell), C1 = Math.ceil((left + wEst + pad) / cell), R0 = Math.floor((base - fs * 1.05) / cell), R1 = Math.ceil((base + fs * 0.4) / cell);
  const cw = (C1 - C0) * S, ch = (R1 - R0) * S, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const c = cv.getContext('2d', { willReadFrequently: true }), k = S / cell;
  c.setTransform(k, 0, 0, k, -C0 * S, -R0 * S); c.font = font; c.letterSpacing = ls; c.textAlign = align === 'center' ? 'center' : 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = '#fff'; c.fillText(text, x, base);
  const d = c.getImageData(0, 0, cw, ch).data, out = [];
  for (let r = 0; r < R1 - R0; r++) for (let q = 0; q < C1 - C0; q++) {
    let s = 0; for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) s += d[((r * S + v) * cw + q * S + u) * 4 + 3];
    if (s / (S * S * 255) > 0.3) out.push(C0 + q, R0 + r);
  }
  return out;
}

/* ------------------------------------------------------------------ the field */
let g = null, hero = null, rowsData = [], listEl = null, headEl = null, heroOv = null, workEl = null, statusEl = null;
let live = false, running = false, raf = 0, tPrev = 0, tDev = 0, T = 1, pS = 0, pInit = false, cleared = false, lastHeroOp = -1, lastHeadOp = -1;
let nextBlink = 0, blinkEnd = 0; const blocks = [], rv = new Float32Array(32); let headDoc = null;
const ptr = { x: -1e5, y: -1e5, on: false, touch: false }; let ptrK = 0;

function buildHero() {
  const P = buildGrid(g.cols, g.rows, IMG, !g.mobile), cell = g.cell, ox = Math.round(g.x / cell), oy = Math.round(g.y / cell);
  const gc = Math.ceil(g.W / cell) + 4, xs = [], ys = [], vs = [], eyeF = [];
  const eyeSet = new Set(); P.eyes.forEach(e => e.cells.forEach(([r, c]) => eyeSet.add((r + oy) * gc + c + ox)));
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const i = r * P.cols + c; if (P.A[i] < 0.5) continue;
    const R = r + oy, C = c + ox; if (!on(P.L[i], R, C)) continue;
    xs.push(C * cell); ys.push(R * cell); vs.push(P.L[i]); eyeF.push(eyeSet.has(R * gc + C) ? 1 : 0);
  }
  const nP = xs.length;
  const nm = nameOn ? rasterText(NAME, `600 ${g.fs}px "Inter Tight", system-ui, sans-serif`, `${-g.fs * 0.035}px`, g.cx, g.base, g.fs, 'center', measureName() * g.fs / 100, cell) : [];
  for (let i = 0; i < nm.length; i += 2) { xs.push(nm[i] * cell); ys.push(nm[i + 1] * cell); vs.push(1); eyeF.push(0); }
  const n = xs.length, h = { n, nP, x0: Float32Array.from(xs), y0: Float32Array.from(ys), v: Float32Array.from(vs), eye: Uint8Array.from(eyeF),
    hash: new Float32Array(n), d: new Float32Array(n), tx: new Float32Array(n), ty: new Float32Array(n), trow: new Int8Array(n).fill(-1),
    fi: new Float32Array(n), fv: new Float32Array(n), flick: new Float32Array(n), segs: [] };
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) h.hash[i] = rnd();
  P.eyes.forEach(e => { let c0 = 1e9, c1 = -1; e.cells.forEach(([r, c]) => { if (r === e.mid) { c0 = Math.min(c0, c); c1 = Math.max(c1, c); } }); for (let c = c0; c <= c1; c++) h.segs.push((c + ox) * cell, (e.mid + oy) * cell); });
  return h;
}

/* a project row: its name and its bottom rule as ON cells, in document coordinates */
function rowCells(li) {
  const a = li.querySelector('.who a'), cell = g.cell, sy = scrollY, rect = a.getBoundingClientRect(), cs = getComputedStyle(a);
  const probe = document.createElement('span'); probe.style.cssText = 'display:inline-block;width:0;height:0'; a.appendChild(probe);
  const base = probe.getBoundingClientRect().bottom + sy; probe.remove();
  const fs = parseFloat(cs.fontSize), font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, ls = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  const nm = rasterText(a.textContent.trim(), font, ls, rect.left, base, fs, 'left', rect.width + 4, cell), xs = [], ys = [], vs = [];
  for (let i = 0; i < nm.length; i += 2) { xs.push(nm[i] * cell); ys.push(nm[i + 1] * cell); vs.push(1); }
  const lr = li.getBoundingClientRect(), R = Math.round((lr.bottom + sy - 1) / cell), C0 = Math.ceil(lr.left / cell), C1 = Math.floor(lr.right / cell);
  for (let C = C0; C < C1; C++) { xs.push(C * cell); ys.push(R * cell); vs.push(0.5); }
  /* the row's text, as bars of 50% dither where each line sits: the squares gather there too, then the real text fades in over them */
  const bars = el => { if (!el) return; const rg = document.createRange(); rg.selectNodeContents(el);
    for (const rc of rg.getClientRects()) { if (rc.width < 6) continue;
      const r0 = Math.round((rc.top + sy + rc.height * 0.3) / cell), r1 = Math.round((rc.bottom + sy - rc.height * 0.22) / cell), c0 = Math.ceil(rc.left / cell), c1 = Math.floor(rc.right / cell);
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if ((r & 1) === (c & 1)) { xs.push(c * cell); ys.push(r * cell); vs.push(0.45); } } };
  bars(li.querySelector('.d')); bars(li.querySelector('.who p')); li.querySelectorAll('.l a, .l .note').forEach(bars);
  return { xs, ys, vs, top: rect.top + sy, bottom: lr.bottom + sy, left: rect.left, width: rect.width, rtop: lr.top + sy };
}

/* The Work section is held at its final on-screen position while the hand-over plays (it sits still under the pinned hero), so the
   glyph targets are exactly where the live DOM text is; it moves normally once the hand-over is done. */
let shiftOn = '';
function applyShift(sy) { const v = sy < T ? 'translate3d(0,' + (sy - T).toFixed(1) + 'px,0)' : ''; if (v !== shiftOn) { shiftOn = v; workEl.style.transform = v; } }
function unshifted(fn) { const t = workEl.style.transform; workEl.style.transform = ''; try { return fn(); } finally { workEl.style.transform = t; } }
const cellsFor = r => unshifted(() => r.isHead ? headCells() : rowCells(r.li));
/* the heading, filter chips, count line and the list's top rule, as squares */
function headCells() {
  const sy = scrollY, cell = g.cell, xs = [], ys = [], vs = [], h2 = headEl.querySelector('h2'), cs = getComputedStyle(h2), rect = h2.getBoundingClientRect();
  const probe = document.createElement('span'); probe.style.cssText = 'display:inline-block;width:0;height:0'; h2.appendChild(probe); const base = probe.getBoundingClientRect().bottom + sy; probe.remove();
  const ls = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing, nm = rasterText(h2.textContent.trim(), `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, ls, rect.left, base, parseFloat(cs.fontSize), 'left', rect.width + 4, cell);
  for (let i = 0; i < nm.length; i += 2) { xs.push(nm[i] * cell); ys.push(nm[i + 1] * cell); vs.push(1); }
  const bars = (el, dense) => { const rc = el.getBoundingClientRect(); if (rc.width < 6) return;
    const r0 = Math.round((rc.top + sy + rc.height * 0.28) / cell), r1 = Math.round((rc.bottom + sy - rc.height * 0.28) / cell), c0 = Math.ceil(rc.left / cell), c1 = Math.floor(rc.right / cell);
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if (dense || (r & 1) === (c & 1)) { xs.push(c * cell); ys.push(r * cell); vs.push(dense ? 1 : 0.45); } };
  headEl.querySelectorAll('.chip').forEach(c => bars(c, c.getAttribute('aria-pressed') === 'true'));
  if (statusEl) { const rg = document.createRange(); rg.selectNodeContents(statusEl); for (const rc of rg.getClientRects()) if (rc.width > 6) { const r0 = Math.round((rc.top + sy + rc.height * 0.3) / cell), r1 = Math.round((rc.bottom + sy - rc.height * 0.22) / cell), c0 = Math.ceil(rc.left / cell), c1 = Math.floor(rc.right / cell); for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if ((r & 1) === (c & 1)) { xs.push(c * cell); ys.push(r * cell); vs.push(0.45); } } }
  const lr = listEl.getBoundingClientRect(), R = Math.round((lr.top + sy) / cell), C0 = Math.ceil(lr.left / cell), C1 = Math.floor(lr.right / cell);
  for (let C = C0; C < C1; C++) { xs.push(C * cell); ys.push(R * cell); vs.push(1); }
  const hr = headEl.getBoundingClientRect();
  return { xs, ys, vs, top: hr.top + sy, bottom: lr.top + sy + 2, left: rect.left, width: rect.width, rtop: hr.top + sy };
}
function buildRows() {
  const lis = [...document.querySelectorAll('.idx-list > li')];
  const prev = new Map(rowsData.map(r => [r.li, r]));
  const list = [headEl, ...lis];
  rowsData = list.map((li, i) => {
    const old = prev.get(li), r = old || { li, i, state: 0, vis: 0, t0: 0, hash: null, isHead: i === 0 };
    r.i = i; r.cells = null; r.pDriven = false; r.px = null;
    if (!li.hidden && li.offsetParent) { const c = cellsFor(r); r.cells = c; const vt = c.top - T, vb = c.bottom - T; r.pDriven = vt > 56 && (g.mobile ? vt < g.H - 60 : vb < g.H - 20); }
    return r;
  });
}

/* source squares (hero) -> target squares (rows), matched left to right so each name gathers from the column above it */
function assign() {
  const h = hero, n = h.n; h.trow.fill(-1);
  const tx = [], ty = [], tr = [];
  rowsData.forEach(r => { if (!r.cells || !r.pDriven) return; const c = r.cells; for (let k = 0; k < c.xs.length; k++) { tx.push(c.xs[k]); ty.push(c.ys[k]); tr.push(r.i); } });
  const nt = tx.length; if (!nt) return;
  const so = Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => h.x0[a] - h.x0[b] || h.hash[a] - h.hash[b]);
  const to = Uint32Array.from({ length: nt }, (_, i) => i).sort((a, b) => tx[a] - tx[b] || ty[a] - ty[b]);
  const nr = Math.max(1, rowsData.length - 1);
  let seed = 5; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < nt; k++) {
    const si = so[Math.min(n - 1, Math.floor((k + 0.5) * n / nt))], ti = to[k];
    h.tx[si] = tx[ti]; h.ty[si] = ty[ti]; h.trow[si] = tr[ti]; h.d[si] = 0.04 + 0.2 * (tr[ti] / nr) + 0.1 * rnd();
  }
  for (let i = 0; i < n; i++) if (h.trow[i] < 0) {
    h.d[i] = 0.02 + 0.3 * (h.y0[i] / g.H) + 0.1 * rnd();
    /* a phone has few targets: the spare squares still flow to the rows' type and dissolve there instead of falling away */
    if (g.mobile && nt) { const ti = (rnd() * nt) | 0; h.tx[i] = tx[ti] + (rnd() - 0.5) * g.cell * 8; h.ty[i] = ty[ti] + (rnd() - 0.5) * g.cell * 4; h.trow[i] = -2; h.d[i] = 0.04 + 0.2 * rnd(); }
  }
  /* when each row's squares land (progress values, sorted), so its crisp text can wait for them */
  rowsData.forEach(r => { const a = []; for (let i = 0; i < n; i++) if (h.trow[i] === r.i) a.push(h.d[i] + LAND); r.land = Float32Array.from(a).sort(); });
}
const LAND = 0.58;
const landed = (r, p) => { const a = r.land; if (!a || !a.length) return 1; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= p) lo = m + 1; else hi = m; } return lo / a.length; };

function layout() {
  const W = innerWidth, H = innerHeight;
  g = geometry(W, H, false); T = Math.round(H * 1.8);   /* scroll distance the hero stays pinned while the hand-over plays */
  root.style.setProperty('--pin', T + 'px');
  const dpr = g.dpr;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  if (g.tagTop) root.style.setProperty('--tagTop', g.tagTop + 'px'); else root.style.removeProperty('--tagTop');
  hero = buildHero(); unshifted(buildRows); assign(); gridIdx = null; restOK = false; fastOn = false; prevU = null; FX.ring.length = 0; FX.trail.length = 0;
  cleared = false;
}



/* ------------------------------------------------------------------ hover effect at rest: dirty-rect rendering
   The resting field (every square) is drawn ONCE into `rest`; a frame then touches only the cells that are active (under the
   pointer or its trail, in a ripple ring, springing back, shimmering, blinking): it restores their bounding rect from `rest`,
   punches out the active cells' squares in one path and draws them as squares or glyphs, batched per type. */
const FX = { R: 160, Rt: 110, K: 520, C: 21, ring: [], trail: [], lastRing: 0, lastPX: -1e5, lastPY: -1e5 };
let rest = null, restOK = false, fastOn = false, act = null, actN = 0, inAct = null, tgt = null, dirx = null, diry = null, gridIdx = null, gridC = 0, gridR = 0, eyeList = null, prevU = null, blinkOn = false;
const stats = { calls: 0, active: 0 };

function fxPrepare() {
  const h = hero, n = h.n, cell = g.cell;
  gridC = Math.ceil(g.W / cell) + 3; gridR = Math.ceil(g.H / cell) + 3; gridIdx = new Int32Array(gridC * gridR).fill(-1);
  for (let i = 0; i < n; i++) { const C = Math.round(h.x0[i] / cell), R = Math.round(h.y0[i] / cell); if (C >= 0 && R >= 0 && C < gridC && R < gridR) gridIdx[R * gridC + C] = i; }
  act = new Int32Array(n); inAct = new Uint8Array(n); tgt = new Float32Array(n); dirx = new Float32Array(n); diry = new Float32Array(n); actN = 0;
  eyeList = []; for (let i = 0; i < n; i++) if (h.eye[i]) eyeList.push(i);
  restOK = false; fastOn = false;
}
function buildRest() {
  if (!rest) rest = document.createElement('canvas');
  rest.width = canvas.width; rest.height = canvas.height;
  const c = rest.getContext('2d'), h = hero, dpr = g.dpr, sq = g.sqDev; c.fillStyle = FG; c.beginPath();
  for (let i = 0; i < h.n; i++) c.rect(Math.round(h.x0[i] * dpr), Math.round(h.y0[i] * dpr), sq, sq);
  c.fill(); restOK = true;
}
function addAct(i) { if (!inAct[i]) { inAct[i] = 1; act[actN++] = i; } }
function setT(i, v, dx, dy) { if (v > tgt[i]) { tgt[i] = v; const l = Math.hypot(dx, dy) + 0.001; dirx[i] = dx / l; diry[i] = dy / l; } addAct(i); }
function fxRing(x, y, amp, speed, w, max) { FX.ring.push({ x, y, t0: performance.now(), amp, speed, w, max }); if (FX.ring.length > 6) FX.ring.shift(); }

function fastFrame(now, dt) {
  const ctx = canvas.getContext('2d'), h = hero, cell = g.cell, dpr = g.dpr, cd = g.cellDev, sq = g.sqDev, W = g.W, H = g.H;
  stats.calls = 0; dt = Math.min(dt, 0.033);
  if (!gridIdx) fxPrepare();
  if (!restOK) buildRest();
  if (!fastOn) { fastOn = true; prevU = [0, 0, canvas.width, canvas.height]; heroOv.style.opacity = 1; lastHeroOp = 1; rowsData.forEach(r => { r.li.style.opacity = 0; r.vis = 0; }); statusEl.style.opacity = 0; listEl.style.setProperty('--rv', 0); }
  ptrK += ((ptr.on ? 1 : 0) - ptrK) * Math.min(1, dt * 16);
  const px = ptr.x, py = ptr.y, R = ptr.touch ? FX.Rt : FX.R, sig = R * 0.42, s2 = 2 * sig * sig, R2 = R * R;
  /* a fast sweep throws a ring; the pointer leaves a short trail of influence */
  if (ptr.on && FX.lastPX > -1e4) {
    const mv = Math.hypot(px - FX.lastPX, py - FX.lastPY), sp = mv / dt;
    if (sp > 1500 && now - FX.lastRing > 220) { FX.lastRing = now; fxRing(px, py, 0.5, 560, 46, 380); }
    if (mv > cell * 2) { FX.trail.push(px, py, now); }
  }
  FX.lastPX = ptr.on ? px : -1e5; FX.lastPY = py;
  { let k = 0; const t = FX.trail; for (let q = 0; q < t.length; q += 3) if (now - t[q + 2] < 260) { t[k++] = t[q]; t[k++] = t[q + 1]; t[k++] = t[q + 2]; } t.length = Math.min(k, 60); }
  /* targets */
  const gx0 = (x, r) => Math.max(0, Math.floor((x - r) / cell)), gx1 = (x, r) => Math.min(gridC - 1, Math.ceil((x + r) / cell));
  const around = (cx, cy, r, fn) => { const r0 = Math.max(0, Math.floor((cy - r) / cell)), r1 = Math.min(gridR - 1, Math.ceil((cy + r) / cell)), c0 = gx0(cx, r), c1 = gx1(cx, r);
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) { const i = gridIdx[rr * gridC + cc]; if (i < 0) continue; const dx = cc * cell + cell / 2 - cx, dy = rr * cell + cell / 2 - cy, d2 = dx * dx + dy * dy; if (d2 < r * r) fn(i, dx, dy, d2); } };
  if (ptrK > 0.01) around(px, py, R, (i, dx, dy, d2) => setT(i, 1.3 * Math.exp(-d2 / s2) * ptrK, dx, dy));
  for (let q = 0; q < FX.trail.length; q += 3) { const a = 1 - (now - FX.trail[q + 2]) / 260, tr = R * 0.6, ts = 2 * (tr * 0.45) ** 2; around(FX.trail[q], FX.trail[q + 1], tr, (i, dx, dy, d2) => setT(i, 0.9 * a * a * Math.exp(-d2 / ts), dx, dy)); }
  for (let k = FX.ring.length - 1; k >= 0; k--) {
    const rg = FX.ring[k], r = (now - rg.t0) / 1000 * rg.speed; if (r > rg.max) { FX.ring.splice(k, 1); continue; }
    const life = Math.pow(1 - r / rg.max, 1.4), band = rg.w * 1.8; around(rg.x, rg.y, r + band, (i, dx, dy, d2) => { const d = Math.sqrt(d2), e = (d - r) / rg.w; if (e > -1.8 && e < 1.8) setT(i, rg.amp * life * Math.exp(-e * e * 1.6), dx, dy); });
  }
  /* shimmer and blink */
  { const nf = dt * 22 + (Math.random() < (dt * 22) % 1 ? 1 : 0); for (let q = 0; q < nf; q++) { const j = (Math.random() * h.n) | 0; h.flick[j] = 1; addAct(j); } }
  if (now > nextBlink) { blinkEnd = now + 120; nextBlink = now + 4000 + Math.random() * 3000; }
  const blink = now < blinkEnd; if (blink || blinkOn) for (let q = 0; q < eyeList.length; q++) addAct(eyeList[q]); blinkOn = blink;
  /* springs: snappy, a little overshoot */
  const X = [], GL = []; let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9, k2 = 0;
  const f0 = h.fi, v0 = h.fv, K = FX.K, C = FX.C;
  for (let q = 0; q < actN; q++) {
    const i = act[q]; let t = tgt[i]; tgt[i] = 0;
    if (h.flick[i] > 0) { if (h.flick[i] * 0.9 > t) { t = h.flick[i] * 0.9; dirx[i] = 0; diry[i] = 0; } h.flick[i] = Math.max(0, h.flick[i] - dt * 5); }
    v0[i] += ((t - f0[i]) * K - v0[i] * C) * dt; f0[i] += v0[i] * dt;
    const eyeHide = blink && h.eye[i];
    if (t === 0 && Math.abs(f0[i]) < 0.01 && Math.abs(v0[i]) < 0.05 && !eyeHide && h.flick[i] === 0 && !blinkOn) { f0[i] = v0[i] = 0; inAct[i] = 0; /* drawn as a plain square once more below, then dropped */ X.push(i, 1); continue; }
    act[k2++] = i; X.push(i, 0);
  }
  actN = k2;
  stats.active = actN;
  /* draw */
  const erase = new Path2D(), sqs = new Path2D(), lines = new Path2D(), fills = new Path2D(); let hasL = false, hasF = false, hasS = false;
  const lw = Math.max(1, cd * 0.2), half = cd * 0.42;
  for (let q = 0; q < X.length; q += 2) {
    const i = X[q], dropped = X[q + 1], x = h.x0[i], y = h.y0[i], ix = Math.round(x * dpr), iy = Math.round(y * dpr);
    erase.rect(ix - 1, iy - 1, sq + 2, sq + 2);
    const mx0 = ix - cd * 4, my0 = iy - cd * 4, mx1 = ix + cd * 5, my1 = iy + cd * 5; if (mx0 < mnx) mnx = mx0; if (my0 < mny) mny = my0; if (mx1 > mxx) mxx = mx1; if (my1 > mxy) mxy = my1;
    if (dropped) { sqs.rect(ix, iy, sq, sq); hasS = true; continue; }
    if (blink && h.eye[i]) continue;
    const f = Math.max(f0[i], 0);
    if (f < 0.02) { sqs.rect(ix, iy, sq, sq); hasS = true; continue; }
    const hs = h.hash[i], ox = dirx[i] * f * cell * 1.8 * dpr, oy = diry[i] * f * cell * 1.8 * dpr, cx = ix + sq / 2 + ox, cy = iy + sq / 2 + oy;
    if (f < 0.22) { const sz = sq * (1 - f * 3.2); if (sz > 0.5) { sqs.rect(cx - sz / 2, cy - sz / 2, sz, sz); hasS = true; } continue; }
    const fs = Math.min(f, 1.2), sc = 1 + 0.8 * Math.min(fs, 1), rot = fs * (hs - 0.5) * 3.3, co = Math.cos(rot), si = Math.sin(rot), hh = half * sc;
    const score = h.v[i] * 0.7 + hs * 0.55, seg = (ax, ay, bx, by) => { lines.moveTo(cx + ax * co - ay * si, cy + ax * si + ay * co); lines.lineTo(cx + bx * co - by * si, cy + bx * si + by * co); hasL = true; };
    if (score > 1.0) { seg(-hh, -hh, hh, hh); seg(hh, -hh, -hh, hh); }
    else if (score > 0.82) { seg(-hh * 1.15, 0, hh * 1.15, 0); seg(0, -hh * 1.15, 0, hh * 1.15); }
    else if (score > 0.55) { if (((x / cell + y / cell) | 0) & 1) seg(-hh * 1.1, 0, hh * 1.1, 0); else seg(0, -hh * 1.1, 0, hh * 1.1); }
    else if (score > 0.4) { const r = hh * 0.85; fills.moveTo(cx + r * co, cy + r * si); fills.lineTo(cx - r * si, cy + r * co); fills.lineTo(cx - r * co, cy - r * si); fills.lineTo(cx + r * si, cy - r * co); fills.closePath(); hasF = true; }
    else { const r = hh * 0.42; fills.moveTo(cx + r, cy); fills.arc(cx, cy, r, 0, 6.2832); hasF = true; }
  }
  if (blink) for (let q = 0; q < h.segs.length; q += 2) { const ix = Math.round(h.segs[q] * dpr), iy = Math.round(h.segs[q + 1] * dpr); lines.moveTo(ix, iy + sq / 2); lines.lineTo(ix + sq, iy + sq / 2); hasL = true; }
  const cur = [Math.max(0, mnx), Math.max(0, mny), Math.min(canvas.width, mxx), Math.min(canvas.height, mxy)];
  if (mnx > mxx) cur[0] = cur[1] = cur[2] = cur[3] = 0;
  const U = prevU ? [Math.min(prevU[0], cur[0] || prevU[0]), Math.min(prevU[1], cur[1] || prevU[1]), Math.max(prevU[2], cur[2]), Math.max(prevU[3], cur[3])] : cur;
  prevU = mnx > mxx ? null : cur;
  const ux = Math.floor(U[0]), uy = Math.floor(U[1]), uw = Math.ceil(U[2]) - ux, uh = Math.ceil(U[3]) - uy;
  if (uw > 0 && uh > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(ux, uy, uw, uh); ctx.drawImage(rest, ux, uy, uw, uh, ux, uy, uw, uh); stats.calls += 2;
    if (X.length) { ctx.globalCompositeOperation = 'destination-out'; ctx.fill(erase); ctx.globalCompositeOperation = 'source-over'; stats.calls++; }
    ctx.fillStyle = FG; ctx.strokeStyle = FG; ctx.lineWidth = lw; ctx.lineCap = 'round';
    if (hasS) { ctx.fill(sqs); stats.calls++; } if (hasF) { ctx.fill(fills); stats.calls++; } if (hasL) { ctx.stroke(lines); stats.calls++; }
  }
  return true;
}

const heroGone = () => false;
function frame(now) {
  raf = 0; if (!running) return;
  const ctx = canvas.getContext('2d'), dt = Math.min((now - tPrev) / 1000 || 0.016, 0.05); tPrev = now;
  const sy = scrollY, pT = clamp(sy / T); applyShift(sy);
  if (!pInit) { pS = pT; pInit = true; }
  /* the picture chases the scroll with a capped rate (a full hand-over takes at least ~1.4 s however fast the page is scrolled), both ways */
  { const diff = pT - pS, step = clamp(diff * Math.min(1, dt * 9), -dt / 1.4, dt / 1.4); pS = Math.abs(diff) < 0.0006 ? pT : pS + (Math.abs(step) < Math.abs(diff) ? step : diff); }
  const p = pS, dpr = g.dpr, cellDev = g.cellDev, sqDev = g.sqDev, cell = g.cell, W = g.W, H = g.H, dev = clamp((now - tDev) / 1200);
  if (p < 0.0005 && dev >= 1 && now - nameT > 1300 && !heroGone()) { fastFrame(now, dt); raf = requestAnimationFrame(frame); return; }
  if (fastOn) { fastOn = false; }
  ptrK += ((ptr.on ? 1 : 0) - ptrK) * Math.min(1, dt * 10);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = FG; ctx.strokeStyle = FG; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, cellDev * 0.2);
  /* the page's own DOM follows the field: tagline and hint leave, the Work heading and each row take over once settled */
  const hop = Math.round((1 - smooth(p / 0.2)) * 100) / 100; if (hop !== lastHeroOp) { heroOv.style.opacity = hop; lastHeroOp = hop; }
  /* a row's crisp text waits for its own squares (landed >= ~90%), top to bottom; rows without squares type on, but only once the hand-over is over */
  blocks.length = 0;
  rowsData.forEach(r => {
    if (!r.pDriven && p < 0.5 && r.state) { r.state = 0; }
    if (!r.pDriven && r.inView && r.state === 0 && r.cells && p >= 0.97) { r.cells = cellsFor(r); r.state = 1; r.t0 = now; }
    let v = r.pDriven ? smooth((landed(r, p) - 0.9) / 0.1) : r.state === 2 ? 1 : r.state === 1 ? smooth(((now - r.t0) / 700 - 0.6) / 0.4) : 0;
    if (r.cells == null && !r.pDriven && !r.li.hidden) v = 1;
    v = Math.round(v * 100) / 100; rv[r.i] = v; if (v !== r.vis) { r.vis = v; r.li.style.opacity = v; if (r.isHead) { statusEl.style.opacity = v; listEl.style.setProperty('--rv', v); } }
    if (v > 0.2 && r.cells) blocks.push(r.cells.rtop - sy - 4, r.cells.bottom - sy + 4, r.i);
  });
  const h = hero, n = h.n, blink = now < blinkEnd;
  const R2 = ((ptr.touch ? 70 : 90) * 1.5) ** 2, sig2 = 2 * ((ptr.touch ? 70 : 90) / 2) ** 2;
  let springs = false;
  if (p < 0.9999) {
    ctx.beginPath(); const glyphs = [];
    for (let i = 0; i < n; i++) {
      let x = h.x0[i], yv = h.y0[i], size = sqDev, d = h.d[i];
      if (h.trow[i] !== -1) {
        /* along a curved path to the row target (neighbours bow the same way, so the squares move as streams) */
        const t = clamp((p - d) / LAND), e = ease(t);
        if (t > 0) {
          const gx = h.tx[i], gy = h.ty[i] - Math.max(sy, T), dx = gx - x, dy = gy - yv, k = 0.3 * Math.sin(h.x0[i] * 0.005 + h.y0[i] * 0.004 + h.trow[i] * 1.1), u1 = 1 - e;
          const qx = x + dx * 0.5 - dy * k, qy = yv + dy * 0.5 + dx * k;
          x = u1 * u1 * x + 2 * u1 * e * qx + e * e * gx; yv = u1 * u1 * yv + 2 * u1 * e * qy + e * e * gy;
        }
        if (h.trow[i] >= 0) { if (t >= 1) size *= 1 - rv[h.trow[i]]; } else size *= 1 - smooth((t - 0.55) / 0.45);
      } else {
        const tt = clamp((p - d) / 0.55); if (tt > 0) { yv += tt * tt * (g.H * 1.4) * (0.7 + 0.6 * h.hash[i]); x += (h.hash[i] - 0.5) * 30 * tt; size *= 1 - smooth(tt * 1.08 - 0.08); }
      }
      if (size < 0.4) continue;
      const vy = yv; if (blocks.length) { let hid = false; for (let q = 0; q < blocks.length; q += 3) if (vy > blocks[q] && vy < blocks[q + 1] && h.trow[i] !== blocks[q + 2]) { hid = true; break; } if (hid) continue; }
      if (vy < -cell || vy > H + cell || x < -cell || x > W + cell) continue;
      if (p < 0.02) { const dv = clamp(((i >= h.nP ? clamp((now - nameT) / 1200) : dev) * 1.4 - h.hash[(i * 7) % n] * 0.4) / 0.6); if (dv < 1) size *= dv; }
      if (blink && h.eye[i]) continue;
      let f = 0, ox = 0, oy = 0;
      const dx = x + cell / 2 - ptr.x, dy = vy + cell / 2 - ptr.y, d2 = dx * dx + dy * dy;
      let target = 0; if (ptrK > 0.01 && d2 < R2) target = Math.exp(-d2 / sig2) * ptrK;
      if (target > 0 || h.fi[i] !== 0 || h.fv[i] !== 0) {
        h.fv[i] += ((target - h.fi[i]) * 170 - h.fv[i] * 17) * dt; h.fi[i] += h.fv[i] * dt;
        if (target === 0 && Math.abs(h.fi[i]) < 0.004 && Math.abs(h.fv[i]) < 0.02) h.fi[i] = h.fv[i] = 0; else springs = true;
      }
      f = Math.max(h.fi[i], 0);
      if (h.flick[i] > 0) { f = Math.max(f, h.flick[i] * 0.9); h.flick[i] = Math.max(0, h.flick[i] - dt * 6); springs = true; }
      if (f > 0.02) { const dl = Math.sqrt(d2) + 0.001; ox = dx / dl * h.fi[i] * cell * 1.6; oy = dy / dl * h.fi[i] * cell * 1.6; }
      if (f > 0.25) { glyphs.push(x + cell / 2 + ox, vy + cell / 2 + oy, h.v[i], ((x / cell + yv / cell) | 0) & 1, f * (h.hash[i] - 0.5) * 4.4, Math.min(1, f * 1.4)); continue; }
      if (f > 0.02) size *= 1 - f * 1.6;
      if (size < 0.4) continue;
      ctx.rect(Math.round((x + ox) * dpr) + (sqDev - size) / 2, Math.round((vy + oy) * dpr) + (sqDev - size) / 2, size, size);
    }
    if (blink) for (let q = 0; q < h.segs.length; q += 2) glyphs.push(h.segs[q] + cell / 2, h.segs[q + 1] + cell / 2, 1, 2, 0, 1);
    ctx.fill();
    if (glyphs.length) {
      ctx.beginPath();
      for (let q = 0; q < glyphs.length; q += 6) {
        const cx = glyphs[q] * dpr, cy = glyphs[q + 1] * dpr, v = glyphs[q + 2], kind = glyphs[q + 3], rot = glyphs[q + 4], sz = glyphs[q + 5], hh = cellDev * 0.42 * sz, co = Math.cos(rot), si = Math.sin(rot);
        const seg = (ax, ay, bx, by) => { ctx.moveTo(cx + ax * co - ay * si, cy + ax * si + ay * co); ctx.lineTo(cx + bx * co - by * si, cy + bx * si + by * co); };
        if (kind === 2) seg(-cellDev * 0.5, 0, cellDev * 0.5, 0);
        else if (v > 0.62) { seg(-hh, -hh, hh, hh); seg(hh, -hh, -hh, hh); }
        else if (v > 0.32) { if (kind) seg(-hh, 0, hh, 0); else seg(0, -hh, 0, hh); }
        else { ctx.moveTo(cx + hh * 0.4, cy); ctx.arc(cx, cy, hh * 0.4, 0, 6.2832); }
      }
      ctx.stroke(); ctx.fill();
    }
    /* shimmer and blink, only while the hero is at rest */
    if (p < 0.05) {
      const nf = dt * 24 + (Math.random() < (dt * 24) % 1 ? 1 : 0); for (let q = 0; q < nf; q++) h.flick[(Math.random() * n) | 0] = 1;
      if (now > nextBlink && dev >= 1) { blinkEnd = now + 120; nextBlink = now + 4000 + Math.random() * 3000; }
    }
  } else if (!cleared) cleared = true;
  /* rows whose names were not part of the hand-over type on when they scroll into view */
  let typing = false;
  rowsData.forEach(r => {
    if (r.state !== 1 || !r.cells) return; typing = true;
    const rt = (now - r.t0) / 700; if (rt >= 1) { r.state = 2; r.li.style.opacity = 1; r.vis = 1; return; }
    const c = r.cells; ctx.beginPath();
    for (let k = 0; k < c.xs.length; k++) {
      const vy = c.ys[k] - sy; if (vy < -cell || vy > H + cell) continue;
      const th = clamp((c.xs[k] - c.left) / (c.width || 600)) * 0.55 + ((k * 2654435761 >>> 0) % 1000) / 1000 * 0.25;
      let size = sqDev * clamp((rt * 1.45 - th) / 0.3) * (1 - smooth((rt - 0.8) / 0.2)); if (size < 0.4) continue;
      ctx.rect(Math.round(c.xs[k] * dpr) + (sqDev - size) / 2, Math.round(vy * dpr) + (sqDev - size) / 2, size, size);
    }
    ctx.fill();
  });
  const idle = p >= 0.9999 && !typing && !springs && ptrK < 0.01 && pT === pS;
  if (idle) { running = false; return; }
  raf = requestAnimationFrame(frame);
}
function wake() { if (!live || running || document.hidden) return; running = true; tPrev = performance.now(); raf = requestAnimationFrame(frame); }

/* ------------------------------------------------------------------ boot */
async function startLive() {
  mark('start');
  const fontP = document.fonts.load('600 100px "Inter Tight"').catch(() => {});
  const im = await IMG_P; if (!im) throw new Error('no portrait image');
  IMG = im; mark('image');
  /* the portrait does not wait for the name's font: if it is not here within ~300 ms the name joins as soon as it lands */
  await Promise.race([fontP, new Promise(r => setTimeout(r, 300))]);
  nameOn = document.fonts.check('600 100px "Inter Tight"'); mark(nameOn ? 'font' : 'nofont');
  listEl = document.querySelector('.idx-list'); headEl = document.querySelector('.idx-head'); workEl = document.querySelector('.work'); statusEl = document.getElementById('idx-status'); heroOv = document.querySelector('.hero-ov');
  if (!canvas.getContext('2d') || !listEl) throw new Error('no canvas');
  root.classList.add('pt', 'live'); live = true;
  layout(); tDev = nameT = performance.now(); nextBlink = tDev + 5400; mark('layout');
  if (!nameOn) fontP.then(() => { if (document.fonts.check('600 100px "Inter Tight"')) { nameOn = true; nameW100 = 0; nameT = performance.now(); relayout(); } });
  document.fonts.addEventListener('loadingdone', () => { clearTimeout(rt); rt = setTimeout(relayout, 80); });
  document.querySelectorAll('.idx-list > li').forEach(li => { li.style.opacity = 0; });
  headEl.style.opacity = 0; statusEl.style.opacity = 0; listEl.style.setProperty('--rv', 0); listEl.style.setProperty('--rv', 0);
  addEventListener('pointermove', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; ptr.touch = e.pointerType === 'touch'; wake(); });
  if ('onpointerrawupdate' in window) addEventListener('pointerrawupdate', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; ptr.touch = e.pointerType === 'touch'; });
  addEventListener('pointerdown', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; ptr.touch = e.pointerType === 'touch'; fxRing(e.clientX, e.clientY, 1.1, 1100, 70, Math.hypot(innerWidth, innerHeight)); wake(); });
  ['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => { if (e.pointerType === 'touch') ptr.on = false; }));
  document.addEventListener('pointerleave', () => { ptr.on = false; });
  addEventListener('blur', () => { ptr.on = false; });
  addEventListener('scroll', wake, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else wake(); });
  var rt, lw = innerWidth, lh = innerHeight;
  function relayout() { layout(); watch(); wake(); }
  const io = new IntersectionObserver(list => list.forEach(en => { const r = rowsData.find(x => x.li === en.target); if (r) { r.inView = en.isIntersecting; if (en.isIntersecting) wake(); } }), { threshold: 0.25 });
  const watch = () => rowsData.forEach(r => io.observe(r.li));
  watch();

  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (innerWidth === lw && Math.abs(innerHeight - lh) < 140) return; lw = innerWidth; lh = innerHeight; relayout(); }, 200); });
  addEventListener('sq:layout', () => { clearTimeout(rt); rt = setTimeout(relayout, 60); });
  window.__field = { stats, get p() { return pS; }, T: () => T, blink: () => { blinkEnd = performance.now() + 120; }, rows: () => rowsData };
  wake(); mark('firstframe');
}
let IMG = null;

/* reduced motion / no canvas: the portrait drawn once into the document */
async function startStatic() {
  const im = await IMG_P; if (!im) return; IMG = im;
  const draw = () => {
    const sg = geometry(innerWidth, innerHeight, true), P = buildGrid(sg.cols, sg.rows, im, false);
    canvas.width = sg.cols * sg.cellDev; canvas.height = sg.rows * sg.cellDev; canvas.style.width = sg.cols * sg.cell + 'px'; canvas.style.height = sg.rows * sg.cell + 'px';
    const c = canvas.getContext('2d'); c.fillStyle = FG;
    for (let r = 0; r < P.rows; r++) for (let q = 0; q < P.cols; q++) { const i = r * P.cols + q; if (P.A[i] >= 0.5 && on(P.L[i], r, q)) c.fillRect(q * sg.cellDev, r * sg.cellDev, sg.sqDev, sg.sqDev); }
  };
  root.classList.add('pt'); draw();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
}

/* a PNG of the 1-bit portrait for the no-JS <img>: window.__portraitPNG(cellPx) -> data URL */
window.__portraitPNG = async cell => {
  const im = await IMG_P, cols = 165, rows = Math.round(cols * SRC_H / SRC_W), P = buildGrid(cols, rows, im, true), cv = document.createElement('canvas');
  cv.width = cols * cell; cv.height = rows * cell; const c = cv.getContext('2d'); c.fillStyle = '#0A0A0A'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = FG;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { const i = r * cols + q; if (P.A[i] >= 0.5 && on(P.L[i], r, q)) c.fillRect(q * cell, r * cell, cell - 1, cell - 1); }
  return cv.toDataURL('image/png');
};

if (canvas) {
  if (root.classList.contains('rm')) startStatic();
  else startLive().catch(err => { console.warn('[field] falling back to the plain page:', err && err.message); window.__sqFallback && window.__sqFallback(); startStatic(); });
}
