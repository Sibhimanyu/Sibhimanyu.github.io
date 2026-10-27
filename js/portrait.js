/* The hero and its hand-over to the Work list: one canvas of 1-bit squares.
   At rest it is the name and a portrait of the site owner (a photo, cut out, tone-mapped and ordered-dithered).
   Scrolling away, the squares rain down and re-gather as the project names of the Work list, row rules included;
   the DOM rows take over once they have settled. The hand-over is a function of one smoothed scroll progress p (see frame()); the Work
   section sits sticky at its final place under the fixed canvas (CSS), so targets are work-local numbers measured once per layout. Squares near the pointer turn into glyphs (x, - or |, a dot),
   rotate, push outward and spring back. Reduced motion / no canvas: the portrait is drawn once, static. */

import { createFx } from './glyph-fx.js';
const root = document.documentElement;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const ease = v => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
export const heroCell = () => (g ? g.cell : 3.6);
export { rasterText };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const FG = '#F2F0EB', NAME = 'Sibhimanyu';
const SRC_W = 460, SRC_H = 560, CROP_Y = 40;               /* the crop of assets/portrait-src.webp (460x600) */
const EYES = [[155, 173, 15, 5.5], [215, 177, 15, 5.5]];       /* in the crop: centre x, y, half width, half height */
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
    t[i] = 0.35 * loc + 0.3 * cdf(l[i]) + 0.35 * l[i]; }
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
    let sk = 0, sn = 0;   /* mean tone of the skin just outside the eye: the lid is skin */
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; if (A[i] < 0.5) continue;
      const px = (c + 0.5) / cols * SRC_W, py = (r + 0.5) / rows * SRC_H, d = ((px - ex) / rx) ** 2 + ((py - ey) / ry) ** 2;
      if (d > 1.15 && d <= 3) { sk += L[i]; sn++; } }
    const colB = new Map(); cells.forEach(([r, c]) => colB.set(c, Math.max(colB.get(c) ?? -1, r)));   /* the bottom cell of each column = the lash line, curved with the ellipse */
    return { cells, rmin, rmax, skin: sn ? sk / sn : 0.6, colB };
  });
  return { cols, rows, L, A, eyes };
}
/* sized squares: tone plus an ordered offset, snapped to 4 sizes; the side is 0.92 cell * sqrt(q), 0 = nothing */
const quant = (L, r, c) => Math.round(clamp(L + ((BAYER[(r & 3) * 4 + (c & 3)] + 0.5) / 16 - 0.5) * 0.25) * 4) / 4;
const zOf = q => 0.92 * Math.sqrt(q);

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
  const cols = mobile ? 100 : 150, rows = Math.round(cols * SRC_H / SRC_W), pad = Math.max(20, Math.min(44, W * 0.031));
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
let wtop = 100, lastVP = null, g = null, hero = null, rowsData = [], listEl = null, headEl = null, heroOv = null, workEl = null, statusEl = null;
let live = false, running = false, raf = 0, tPrev = 0, tDev = 0, T = 1, pS = 0, pInit = false, cleared = false, lastHeroOp = -1, lastHeadOp = -1;
let nextBlink = 0, blinkT0 = -1e9, blinkDbl = false, blinkFreeze = null; const blocks = [], rv = new Float32Array(32); let headDoc = null;
const ptr = { x: -1e5, y: -1e5, on: false, touch: false };

function buildHero() {
  const P = buildGrid(g.cols, g.rows, IMG, !g.mobile), cell = g.cell, ox = Math.round(g.x / cell), oy = Math.round(g.y / cell);
  const gc = Math.ceil(g.W / cell) + 4, xs = [], ys = [], vs = [], eyeF = [], eyeRow = [], eyeN = [], etz = [], zs = [];
  const eyeSet = new Map(); P.eyes.forEach((e, k) => e.cells.forEach(([r, c]) => eyeSet.set((r + oy) * gc + c + ox, [r - e.rmin, e.rmax - e.rmin + 1, k, e.skin, e.colB.get(c) === r])));
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const i = r * P.cols + c; if (P.A[i] < 0.5) continue;
    const R = r + oy, C = c + ox, q = quant(P.L[i], R, C), ev0 = eyeSet.get(R * gc + C); if (q <= 0 && !ev0) continue;
    xs.push(C * cell); ys.push(R * cell); zs.push(zOf(q)); etz.push(ev0 ? zOf(quant(ev0[3], R, C)) * (ev0[4] ? 0.3 : 1) : 0); vs.push(P.L[i]); const ev = eyeSet.get(R * gc + C); eyeF.push(ev ? 1 : 0); eyeRow.push(ev ? ev[0] : 0); eyeN.push(ev ? ev[1] : 1);
  }
  const nP = xs.length;
  const nm = nameOn ? rasterText(NAME, `600 ${g.fs}px "Inter Tight", system-ui, sans-serif`, `${-g.fs * 0.035}px`, g.cx, g.base, g.fs, 'center', measureName() * g.fs / 100, cell) : [];
  for (let i = 0; i < nm.length; i += 2) { xs.push(nm[i] * cell); ys.push(nm[i + 1] * cell); zs.push(0.92); vs.push(1); eyeF.push(0); eyeRow.push(0); eyeN.push(1); etz.push(0); }
  const n = xs.length, h = { n, nP, z: Float32Array.from(zs), x0: Float32Array.from(xs), y0: Float32Array.from(ys), v: Float32Array.from(vs), eye: Uint8Array.from(eyeF), erow: Uint8Array.from(eyeRow), etz: Float32Array.from(etz), enr: Uint8Array.from(eyeN), ecx: 0, ecy: 0,
    hash: new Float32Array(n), d: new Float32Array(n), tx: new Float32Array(n), ty: new Float32Array(n), trow: new Int8Array(n).fill(-1),
  };
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) h.hash[i] = rnd();
  { let sx = 0, sy2 = 0, k = 0; for (let i = 0; i < nP; i++) if (h.eye[i]) { sx += h.x0[i]; sy2 += h.y0[i]; k++; } if (k) { h.ecx = sx / k; h.ecy = sy2 / k; } else h.ecx = h.ecy = -1e5; }
  return h;
}

/* a project row: its name and its bottom rule as ON cells, in document coordinates */
function rowCells(li) {
  const a = li.querySelector('.who a'), cell = g.cell, sy = -workEl.getBoundingClientRect().top, rect = a.getBoundingClientRect(), cs = getComputedStyle(a);
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
  return { xs, ys, vs, top: rect.top + sy, bottom: lr.bottom + sy, left: rect.left, width: rect.width, rtop: lr.top + sy };   /* work-local y: screen y = wy + local */
}

/* Cells are work-local: y measured from the Work section's top, so they do not depend on the scroll. Screen y = wy + local, where wy is
   the section's top on screen (sticky at --wtop while the stage lasts, scrolling from there after it). */
const cellsFor = r => r.isHead ? headCells() : rowCells(r.li);
/* the heading, filter chips, count line and the list's top rule, as squares */
function headCells() {
  const sy = -workEl.getBoundingClientRect().top, cell = g.cell, xs = [], ys = [], vs = [], h2 = headEl.querySelector('h2'), cs = getComputedStyle(h2), rect = h2.getBoundingClientRect();
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
    if (!li.hidden && li.offsetParent) { const c = cellsFor(r); r.cells = c; const vt = wtop + c.top, vb = wtop + c.bottom; r.pDriven = vt > 56 && (g.mobile ? vt < g.H - 60 : vb < g.H - 20); }
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

/* The stage height is the SMALL viewport (svh): a phone's address bar showing or hiding must never move anything. The canvas is as tall as the
   large viewport so nothing is cut when the bar hides. */
let probes = null;
function viewport() {
  if (!probes) { probes = ['100svh', '100lvh'].map(h => { const d = document.createElement('div'); d.setAttribute('aria-hidden', 'true'); d.style.cssText = 'position:fixed;left:0;top:0;width:0;height:' + h + ';visibility:hidden;pointer-events:none'; document.body.appendChild(d); return d; }); }
  const sv = probes[0].offsetHeight, lv = probes[1].offsetHeight, ih = innerHeight;
  const H = sv > 100 ? sv : ih;
  return { W: innerWidth, H, Hc: Math.max(H, lv > 100 ? lv : 0, ih) };
}
function makeFx() {
  const h = hero, cd = g.cellDev;
  eyeList = []; for (let i = 0; i < h.n; i++) if (h.eye[i]) eyeList.push(i);
  fx = createFx({ canvas, xs: h.x0, ys: h.y0, zs: h.z, tone: h.v, cell: g.cell, dpr: g.dpr, cd, R: 90, Rt: 70,
    sizeOf: (i, z) => { if (!h.eye[i] || !bkMode) return z; const k = blinkK(i); return z * (1 - k) + h.etz[i] * k; } });
}
function layout() {
  const vp = viewport(), W = vp.W, H = vp.H;
  g = geometry(W, H, false); T = Math.round(H * 1.5);   /* scroll distance the Work section stays pinned while the hand-over plays */
  wtop = Math.round(Math.max(64, H * 0.12));
  root.style.setProperty('--pin', T + 'px'); root.style.setProperty('--H', H + 'px'); root.style.setProperty('--wtop', wtop + 'px');
  const dpr = g.dpr;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(vp.Hc * dpr); canvas.style.width = W + 'px'; canvas.style.height = vp.Hc + 'px';
  if (g.tagTop) root.style.setProperty('--tagTop', g.tagTop + 'px'); else root.style.removeProperty('--tagTop');
  hero = buildHero(); buildRows(); assign(); fastOn = false; makeFx();
  cleared = false; lastVP = vp;
}

/* ------------------------------------------------------------------ the field at rest
   The hover effect lives in glyph-fx.js (an active list, dirty rects over a bitmap of the resting field). At rest nothing runs on its own:
   a frame is scheduled by the pointer, by a blink, or by the develop-in, and the loop stops when they are done. */
let eyeList = null, fx = null, fastOn = false, blinkOn = false, blinkTimer = 0;
const msLog = [];
const stats = { calls: 0, active: 0 };

/* Blink: an eyelid, not a flash. The eye's squares shrink to nothing from the top row down (70 ms), hold (40 ms), then reopen bottom-up
   (110 ms, ease-out). Every 3-7 s, one in six is a double blink; none is started while the pointer is near the face. */
const BL_C = 70, BL_H = 40, BL_O = 110, BL_GAP = 90, BL_D = BL_C + BL_H + BL_O;
let bkMode = 0, bkV = 0;
function blinkTick(now) {
  let t = blinkFreeze != null ? blinkFreeze : now - blinkT0; bkMode = 0;
  if (t < 0) return 0;
  if (blinkDbl && t >= BL_D + BL_GAP) t -= BL_D + BL_GAP;
  if (t >= BL_D) return 0;
  if (t < BL_C) { bkMode = 1; bkV = t / BL_C; } else if (t < BL_C + BL_H) { bkMode = 2; bkV = 1; } else { bkMode = 3; bkV = (t - BL_C - BL_H) / BL_O; }
  return bkMode;
}
/* how closed this square's lid is (0 open, 1 closed): top rows first when closing, bottom rows first when reopening */
const blinkK = i => {
  const row = hero.erow[i], nr = hero.enr[i];
  if (bkMode === 1) return clamp(bkV * nr - row);
  if (bkMode === 2) return 1;
  const o = 1 - (1 - bkV) ** 3; return 1 - clamp(o * nr - (nr - 1 - row));
};
/* a frame at rest: only the cells the pointer or a blink touches are redrawn; returns true while something is still moving */
function restFrame(now) {
  if (!fx) return false;
  if (!fastOn) { fastOn = true; fx.full(); heroOv.style.opacity = 1; lastHeroOp = 1; rowsData.forEach(r => { r.li.style.opacity = 0; r.vis = 0; }); statusEl.style.opacity = 0; listEl.style.setProperty('--rv', 0); }
  const blink = blinkTick(now) > 0; if (blink || blinkOn) for (let q = 0; q < eyeList.length; q++) fx.force(eyeList[q]); blinkOn = blink;
  const busy = fx.step(now); stats.calls = fx.calls;
  return busy || blink;
}
/* blinks are timer-driven, not frame-driven: nothing wakes the page between them */
function scheduleBlink(ms) {
  clearTimeout(blinkTimer);
  blinkTimer = setTimeout(() => {
    if (!live || !hero) return;
    if (pS > 0.05 || document.hidden || (ptr.on && Math.hypot(ptr.x - hero.ecx, ptr.y - hero.ecy) < 280)) { scheduleBlink(700); return; }
    blinkT0 = performance.now(); blinkDbl = Math.random() < 1 / 6; wake(); scheduleBlink(3000 + Math.random() * 4000);
  }, ms);
}

let wy = 0, handed = false;
/* One frame = arithmetic plus one canvas draw: p (smoothed scroll progress) decides where every square is; nothing here reads layout. */
function frame(now) {
  raf = 0; if (!running) return;
  const t0 = performance.now(), ctx = canvas.getContext('2d'), dt = Math.min((now - tPrev) / 1000 || 0.016, 0.05); tPrev = now;
  const sy = scrollY, pT = clamp(sy / T);
  wy = wtop - Math.max(0, sy - T);   /* the Work section's top on screen: pinned at --wtop during the stage, scrolling from there after it */
  if (!pInit) { pS = pT; pInit = true; }
  /* the picture chases the scroll, rate-capped (a whole hand-over takes at least ~1.2 s however fast the page is scrolled), both ways */
  { const diff = pT - pS, step = clamp(diff * Math.min(1, dt * 9), -dt / 1.2, dt / 1.2); pS = Math.abs(diff) < 0.0006 ? pT : pS + (Math.abs(step) < Math.abs(diff) ? step : diff); }
  const p = pS, dpr = g.dpr, cellDev = g.cellDev, sqDev = g.sqDev, cell = g.cell, W = g.W, H = g.H, dev = clamp((now - tDev) / 1200);
  if (p < 0.0005 && dev >= 1 && now - nameT > 1300) { const busy = restFrame(now); msLog.push(performance.now() - t0); if (msLog.length > 4000) msLog.shift(); if (busy) raf = requestAnimationFrame(frame); else running = false; return; }
  if (fastOn) { fastOn = false; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = FG; ctx.strokeStyle = FG; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, cellDev * 0.2);
  /* the page's own DOM follows the field: tagline and hint leave, the Work heading and each row take over as their squares land */
  const hop = Math.round((1 - smooth(p / 0.2)) * 100) / 100; if (hop !== lastHeroOp) { heroOv.style.opacity = hop; lastHeroOp = hop; }
  const hd = p >= 0.999; if (hd !== handed) { handed = hd; root.classList.toggle('handed', hd); }
  /* rows below the hand-over fade with p too, so reversing never pops them; their own squares type on once the hand-over is over */
  const fade = smooth((p - 0.6) / 0.35);
  blocks.length = 0;
  rowsData.forEach(r => {
    if (!r.pDriven && p < 0.5 && r.state) { r.state = 0; }
    if (!r.pDriven && r.inView && r.state === 0 && r.cells && p >= 0.97) { r.state = 1; r.t0 = now; }
    let v = r.pDriven ? smooth((landed(r, p) - 0.9) / 0.1) : (r.state === 2 ? 1 : r.state === 1 ? smooth(((now - r.t0) / 700 - 0.6) / 0.4) : 0) * fade;
    if (r.cells == null && !r.pDriven && !r.li.hidden) v = fade;
    v = Math.round(v * 100) / 100; rv[r.i] = v; if (v !== r.vis) { r.vis = v; r.li.style.opacity = v; if (r.isHead) { statusEl.style.opacity = v; listEl.style.setProperty('--rv', v); } }
    if (v > 0.02 && r.cells && r.pDriven) blocks.push(r.cells.rtop + wy - 4, r.cells.bottom + wy + 4, r.i, v);
  });
  const h = hero, n = h.n, blink = blinkTick(now) > 0;
  if (p < 0.9999) {
    ctx.beginPath(); const nb = blocks.length;
    for (let i = 0; i < n; i++) {
      let x = h.x0[i], yv = h.y0[i], size = cellDev * h.z[i], d = h.d[i];
      if (h.trow[i] !== -1) {
        /* along a curved path to the row target (neighbours bow the same way, so the squares move as streams) */
        const t = clamp((p - d) / LAND), e = ease(t);
        if (t > 0) {
          const gx = h.tx[i], gy = h.ty[i] + wy, dx = gx - x, dy = gy - yv, k = 0.3 * Math.sin(h.x0[i] * 0.005 + h.y0[i] * 0.004 + h.trow[i] * 1.1), u1 = 1 - e;
          const qx = x + dx * 0.5 - dy * k, qy = yv + dy * 0.5 + dx * k;
          x = u1 * u1 * x + 2 * u1 * e * qx + e * e * gx; yv = u1 * u1 * yv + 2 * u1 * e * qy + e * e * gy;
        }
        if (h.trow[i] >= 0) { if (t >= 1) size *= 1 - rv[h.trow[i]]; } else size *= 1 - smooth((t - 0.55) / 0.45);
      } else {
        const tt = clamp((p - d) / 0.55); if (tt > 0) { yv += tt * tt * (g.H * 1.4) * (0.7 + 0.6 * h.hash[i]); x += (h.hash[i] - 0.5) * 30 * tt; size *= 1 - smooth(tt * 1.08 - 0.08); }
      }
      if (size < 0.4) continue;
      /* a square passing over another row's settled text shrinks as that text fades in (no overlapping, no popping) */
      if (nb) { for (let q = 0; q < nb; q += 4) if (yv > blocks[q] && yv < blocks[q + 1] && h.trow[i] !== blocks[q + 2]) size *= 1 - blocks[q + 3]; if (size < 0.4) continue; }
      if (yv < -cell || yv > H + cell || x < -cell || x > W + cell) continue;
      if (p < 0.02) { const dv = clamp(((i >= h.nP ? clamp((now - nameT) / 1200) : dev) * 1.4 - h.hash[(i * 7) % n] * 0.4) / 0.6); if (dv < 1) size *= dv; }
      if (blink && h.eye[i]) { { const bk = blinkK(i); size = cellDev * (h.z[i] * (1 - bk) + h.etz[i] * bk); } if (size < 0.4) continue; }
      ctx.rect(Math.round(x * dpr) + (cellDev - size) / 2, Math.round(yv * dpr) + (cellDev - size) / 2, size, size);
    }
    ctx.fill();
    } else if (!cleared) cleared = true;
  /* rows whose names were not part of the hand-over type on when they scroll into view */
  let typing = false;
  rowsData.forEach(r => {
    if (r.state !== 1 || !r.cells) return; typing = true;
    const rt = (now - r.t0) / 700; if (rt >= 1) { r.state = 2; r.li.style.opacity = fade; r.vis = fade; return; }
    const c = r.cells; ctx.beginPath();
    for (let k = 0; k < c.xs.length; k++) {
      const vy = c.ys[k] + wy; if (vy < -cell || vy > H + cell) continue;
      const th = clamp((c.xs[k] - c.left) / (c.width || 600)) * 0.55 + ((k * 2654435761 >>> 0) % 1000) / 1000 * 0.25;
      let size = sqDev * clamp((rt * 1.45 - th) / 0.3) * (1 - smooth((rt - 0.8) / 0.2)) * fade; if (size < 0.4) continue;
      ctx.rect(Math.round(c.xs[k] * dpr) + (sqDev - size) / 2, Math.round(vy * dpr) + (sqDev - size) / 2, size, size);
    }
    ctx.fill();
  });
  msLog.push(performance.now() - t0); if (msLog.length > 4000) msLog.shift();
  const idle = (p >= 0.9999 || (p < 0.0005 && dev >= 1 && now - nameT > 1300)) && !typing && pT === pS;
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
  layout(); tDev = nameT = performance.now(); scheduleBlink(5400); mark('layout');
  if (!nameOn) fontP.then(() => { if (document.fonts.check('600 100px "Inter Tight"')) { nameOn = true; nameW100 = 0; nameT = performance.now(); relayout(); } });
  document.fonts.addEventListener('loadingdone', () => { clearTimeout(rt); rt = setTimeout(relayout, 80); });
  document.querySelectorAll('.idx-list > li').forEach(li => { li.style.opacity = 0; });
  headEl.style.opacity = 0; statusEl.style.opacity = 0; listEl.style.setProperty('--rv', 0); listEl.style.setProperty('--rv', 0);
  /* one pointermove listener, one update per frame (the effect reads the latest position when its frame runs) */
  const aim = e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; ptr.touch = e.pointerType === 'touch'; if (fx) fx.move(ptr.x, ptr.y, ptr.touch); wake(); };
  addEventListener('pointermove', aim);
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') aim(e); });
  const away = () => { ptr.on = false; if (fx) fx.leave(); wake(); };
  ['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => { if (e.pointerType === 'touch') away(); }));
  document.addEventListener('pointerleave', away);
  addEventListener('blur', away);
  addEventListener('scroll', wake, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else wake(); });
  var rt;
  function relayout() { layout(); watch(); wake(); }
  const io = new IntersectionObserver(list => list.forEach(en => { const r = rowsData.find(x => x.li === en.target); if (r) { r.inView = en.isIntersecting; if (en.isIntersecting) wake(); } }), { threshold: 0.25 });
  const watch = () => rowsData.forEach(r => io.observe(r.li));
  watch();

  /* only a change of width or of the stage's own (small-viewport) height re-lays out: a phone's address bar moves innerHeight, never svh */
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const v = viewport(); if (lastVP && v.W === lastVP.W && Math.abs(v.H - lastVP.H) < 2) return; relayout(); }, 200); });
  /* the Work link, a #work address and keyboard focus inside the list all mean "the end of the hand-over" */
  const toWork = smoothly => scrollTo({ top: T, behavior: smoothly ? 'smooth' : 'auto' });
  document.querySelectorAll('a[href="#work"]').forEach(a => a.addEventListener('click', e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); toWork(true); try { history.replaceState(null, '', '#work'); } catch (_) {} }));
  workEl.addEventListener('focusin', () => { if (scrollY < T - 2) toWork(false); });
  if (location.hash === '#work' && scrollY < T) toWork(false);
  addEventListener('sq:layout', () => { clearTimeout(rt); rt = setTimeout(relayout, 60); });
  window.__field = { stats, get p() { return pS; }, T: () => T, blink: () => { blinkFreeze = null; blinkDbl = false; blinkT0 = performance.now(); wake(); }, blinkFreeze: ms => { blinkFreeze = ms; wake(); }, ms: msLog, wy: () => wy, eyes: () => [hero.ecx, hero.ecy, g.cell], rows: () => rowsData };
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
    for (let r = 0; r < P.rows; r++) for (let q = 0; q < P.cols; q++) { const i = r * P.cols + q; if (P.A[i] < 0.5) continue; const qq = quant(P.L[i], r, q); if (qq <= 0) continue; const z = sg.cellDev * zOf(qq); c.fillRect(q * sg.cellDev + (sg.cellDev - z) / 2, r * sg.cellDev + (sg.cellDev - z) / 2, z, z); }
  };
  root.classList.add('pt'); draw();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
}

/* a PNG of the 1-bit portrait for the no-JS <img>: window.__portraitPNG(cellPx) -> data URL */
window.__portraitPNG = async cell => {
  const im = await IMG_P, cols = 150, rows = Math.round(cols * SRC_H / SRC_W), P = buildGrid(cols, rows, im, true), cv = document.createElement('canvas');
  cv.width = cols * cell; cv.height = rows * cell; const c = cv.getContext('2d'); c.fillStyle = '#0A0A0A'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = FG;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { const i = r * cols + q; if (P.A[i] < 0.5) continue; const qq = quant(P.L[i], r, q); if (qq <= 0) continue; const z = cell * zOf(qq); c.fillRect(q * cell + (cell - z) / 2, r * cell + (cell - z) / 2, z, z); }
  return cv.toDataURL('image/png');
};

if (canvas) {
  if (root.classList.contains('rm')) startStatic();
  else startLive().catch(err => { console.warn('[field] falling back to the plain page:', err && err.message); window.__sqFallback && window.__sqFallback(); startStatic(); });
}
