/* The hero: one canvas of sized squares, drawn once. A portrait of the site owner (a photo, cut out, tone-mapped and ordered-dithered) with a
   seeded halo of stray small squares, and his name BEHIND him on a desktop (name squares are dropped wherever the portrait has coverage) or
   above him on a phone. It scrolls away with the page like any other content: no pinned stage, no per-square animation on scroll.
   What runs: the develop-in on load, the blink, the mouse effect (hover.js, mouse only) and one rAF-throttled scroll controller that writes
   CSS custom properties (--hp hero progress, --rule the bridge's dotted rule). Reduced motion / no canvas: drawn once, static, no listeners. */

import { createHover } from './hover.js';
const root = document.documentElement;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const ease = v => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const FG = '#F2F0EB', NAME = 'Sibhimanyu';
const SRC_W = 460, SRC_H = 560, CROP_Y = 40;               /* the crop of assets/portrait-src.webp (460x600) */
const EYES = [[155, 173, 15, 5.5], [215, 177, 15, 5.5]];       /* in the crop: centre x, y, half width, half height */
const canvas = document.getElementById('portrait'), flyCv = document.getElementById('fly');
const IMG_P = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'assets/portrait-src.webp'; });
const mark = n => { try { performance.mark('hero-' + n); } catch (e) {} };
let nameOn = true, nameT = 0;
let g = null, hero = null, lastVP = null, live = false, running = false, raf = 0, tDev = 0, IMG = null, blinkT0 = -1e9, blinkDbl = false, blinkFreeze = null;
const ptr = { x: -1e5, y: -1e5, on: false };

/* ------------------------------------------------------------------ tone mapping (the approved panel B) */
/* local contrast against a box-blurred mean/std, a histogram equalisation and the raw tone, 3x supersampled, averaged to the grid */
function buildGrid(cols, rows, img, edge) {
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
    const loc = Math.min(1, Math.max(0, 0.5 + (l[i] - mu) / (sd * 2.1)));
    const m = 0.35 * loc + 0.3 * cdf(l[i]) + 0.35 * l[i];
    t[i] = Math.min(1, Math.max(0, 0.5 + (m - 0.5) * 1.4)); }   /* contrast: deeper darks, brighter lights */
  const L = new Float32Array(cols * rows), A = new Float32Array(cols * rows), SC = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { let sl = 0, sa = 0; for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) { const q = (j * S + v) * cw + i * S + u; sl += t[q] * a[q]; sa += a[q]; }
    const q = j * cols + i; A[q] = sa / (S * S); L[q] = sa > 0 ? sl / sa : 0;
    /* the photo's own side edges (the shoulders run off the frame) taper into the page; the bottom bleeds off the screen */
    const exs = Math.min(edge.l ? i / (cols * 0.1) : 9, edge.r ? (cols - 1 - i) / (cols * 0.1) : 9), exb = edge.b ? (rows - 1 - j) / (rows * edge.b) : 9, ex = Math.min(exs, exb);
    SC[q] = 1;
    if (ex < 1) { const e = smooth(ex); L[q] *= e; if (exs < 1 && smooth(exs) < 0.04) A[q] = 0; if (e < 0.5) SC[q] = 0; } }
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
  for (let q = 0; q < cols * rows; q++) if (A[q] < 0.5) SC[q] = 0;   /* SC: solid coverage (what hides the name) */
  return { cols, rows, L, A, S: SC, eyes };
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
function geometry(W, H, Hc) {
  const mobile = W <= 760, dpr = Math.min(window.devicePixelRatio || 1, 2), pad = Math.max(20, Math.min(44, W * 0.031));
  const cell0 = mobile ? 2 : Math.max(3, Math.round(W / 420)), cellDev = Math.max(2, Math.round(cell0 * dpr)), cell = cellDev / dpr;
  const w0 = mobile ? W * 1.06 : W * 0.47, cols = Math.round(w0 / cell), rows = Math.round(cols * SRC_H / SRC_W), w = cols * cell, h = rows * cell;
  const g = { W, H, Hc, dpr, mobile, cols, rows, cell, cellDev, sqDev: cellDev - Math.max(1, Math.round(0.6 * dpr)), w, h, pad };
  const wMax = measureName();
  /* the face centre is at 51% of the crop's width, the hair top 3% below its top */
  if (mobile) {
    g.x = Math.round(W * 0.58 - 0.51 * w); g.y = Math.round(H * 0.43 - 0.032 * h);
    g.fs = Math.min(100 * (W - 2 * pad) / wMax, 1500); g.base = Math.round(H * 0.266);
    g.tagTop = Math.round(g.base + g.fs * 0.2 + 14); g.eyeTop = Math.round(g.base - g.fs * 0.727 - 38);
  } else {
    g.x = Math.round(W * 0.75 - 0.51 * w); g.y = Math.round(H * 0.12 - 0.032 * h);
    g.fs = Math.min(H * 0.2338, W * 0.14, 1500); g.base = Math.round(H * 0.52);
    g.eyeTop = Math.round(g.base - g.fs * 0.727 - H * 0.058); g.tagTop = Math.round(g.base + H * 0.048);
  }
  g.nx = pad;
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


/* page-grid helpers: a square is a cell (C, R) of the page-wide grid; the halo is a seeded scatter of small squares whose density falls with the
   distance (to ~80 px) from the silhouette, so it is the same on every load and static at rest */
const hash2 = (a, b) => { let h = (Math.imul(a + 7919, 374761393) ^ Math.imul(b + 104729, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function distance(sil, gw, gh) {   /* two-pass chamfer distance in cells to the nearest silhouette cell */
  const INF = 1e6, d = new Float32Array(gw * gh), D = 1.4142;
  for (let i = 0; i < d.length; i++) d[i] = sil[i] ? 0 : INF;
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) { const i = r * gw + c; let v = d[i]; if (!v) continue;
    if (c > 0) v = Math.min(v, d[i - 1] + 1); if (r > 0) { v = Math.min(v, d[i - gw] + 1); if (c > 0) v = Math.min(v, d[i - gw - 1] + D); if (c < gw - 1) v = Math.min(v, d[i - gw + 1] + D); } d[i] = v; }
  for (let r = gh - 1; r >= 0; r--) for (let c = gw - 1; c >= 0; c--) { const i = r * gw + c; let v = d[i]; if (!v) continue;
    if (c < gw - 1) v = Math.min(v, d[i + 1] + 1); if (r < gh - 1) { v = Math.min(v, d[i + gw] + 1); if (c < gw - 1) v = Math.min(v, d[i + gw + 1] + D); if (c > 0) v = Math.min(v, d[i + gw - 1] + D); } d[i] = v; }
  return d;
}
const HALO_PX = 80;
/* the portrait's squares (tone, sized) plus its halo, on a gw x gh page grid; also the cover mask that hides what sits behind it */
function portraitSquares(P, ox, oy, gw, gh, cell, eyeSet, even) {
  const sil = new Uint8Array(gw * gh), cov = new Uint8Array(gw * gh), out = { xs: [], ys: [], zs: [], etz: [], eyeF: [], eyeRow: [], eyeN: [], cov };
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) { const R = r + oy, C = c + ox; if (R < 0 || C < 0 || R >= gh || C >= gw) continue; const i = r * P.cols + c;
    if (P.S[i]) { sil[R * gw + C] = 1; cov[R * gw + C] = 1; } }
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const i = r * P.cols + c; if (P.A[i] < 0.5) continue;
    const R = r + oy, C = c + ox; if (R < -1 || C < -1 || R > gh || C > gw) continue;
    const q = quant(P.L[i], R, C), ev0 = eyeSet ? eyeSet.get(R * 4096 + C + 1024) : null; if (q <= 0 && !ev0) continue;
    out.xs.push(C * cell); out.ys.push(R * cell); out.zs.push(zOf(q)); out.etz.push(ev0 ? zOf(quant(ev0[3], R, C)) * (ev0[4] ? 0.3 : 1) : 0);
    out.eyeF.push(ev0 ? 1 : 0); out.eyeRow.push(ev0 ? ev0[0] : 0); out.eyeN.push(ev0 ? ev0[1] : 1);
  }
  const dist = distance(sil, gw, gh), reach = HALO_PX / cell;
  for (let R = 0; R < gh; R++) for (let C = 0; C < gw; C++) { const k = R * gw + C, d = dist[k]; if (!d || d > reach) continue;
    const t = d / reach, p = even ? 0.3 * (1 - t) ** 1.6 : 0.45 * (1 - t) ** 2, u = even ? ((BAYER[(R & 3) * 4 + (C & 3)] + 0.5) / 16) * 0.8 + hash2(C, R) * 0.2 : hash2(C, R); if (u >= p) continue;
    const v = hash2(R * 3 + 1, C * 5 + 2), q = t < 0.3 && v < 0.35 ? 0.5 : v > 0.93 ? 0.5 : 0.25;
    out.xs.push(C * cell); out.ys.push(R * cell); out.zs.push(zOf(q)); out.etz.push(0); out.eyeF.push(0); out.eyeRow.push(0); out.eyeN.push(1); }
  /* the halo core counts as coverage too: two cells around the silhouette */
  const cv2 = new Uint8Array(cov); for (let R = 0; R < gh; R++) for (let C = 0; C < gw; C++) if (cov[R * gw + C]) for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = R + dr, cc = C + dc; if (rr >= 0 && cc >= 0 && rr < gh && cc < gw) cv2[rr * gw + cc] = 1; }
  out.cov = cv2; return out;
}
function buildHero() {
  const edge = g.mobile ? { l: 1, r: 0, b: 0.22 } : { l: 1, r: 0, b: 0 };
  const P = buildGrid(g.cols, g.rows, IMG, edge), cell = g.cell, ox = Math.round(g.x / cell), oy = Math.round(g.y / cell);
  const gw = Math.ceil(g.W / cell) + 2, gh = Math.ceil(g.Hc / cell) + 2;
  const eyeSet = new Map(); P.eyes.forEach((e, k) => e.cells.forEach(([r, c]) => eyeSet.set((r + oy) * 4096 + c + ox + 1024, [r - e.rmin, e.rmax - e.rmin + 1, k, e.skin, e.colB.get(c) === r])));
  const f = portraitSquares(P, ox, oy, gw, gh, cell, eyeSet, g.mobile), xs = f.xs, ys = f.ys, zs = f.zs, etz = f.etz, eyeF = f.eyeF, eyeRow = f.eyeRow, eyeN = f.eyeN;
  const nP = xs.length;
  const nm = nameOn ? rasterText(NAME, `600 ${g.fs}px "Inter Tight", system-ui, sans-serif`, `${-g.fs * 0.035}px`, g.nx, g.base, g.fs, 'left', measureName() * g.fs / 100, cell) : [];
  for (let i = 0; i < nm.length; i += 2) {
    const C = nm[i], R = nm[i + 1];
    if (!g.mobile && C >= 0 && R >= 0 && C < gw && R < gh && f.cov[R * gw + C]) continue;   /* behind him */
    if (nm[i] * cell > g.W + cell) continue;
    xs.push(C * cell); ys.push(R * cell); zs.push(0.92); eyeF.push(0); eyeRow.push(0); eyeN.push(1); etz.push(0);
  }
  const n = xs.length, h = { n, nP, z: Float32Array.from(zs), x0: Float32Array.from(xs), y0: Float32Array.from(ys), eye: Uint8Array.from(eyeF), erow: Uint8Array.from(eyeRow), etz: Float32Array.from(etz), enr: Uint8Array.from(eyeN), ecx: 0, ecy: 0,
    hash: new Float32Array(n), d: new Float32Array(n), tx: new Float32Array(n), ty: new Float32Array(n), trow: new Int8Array(n).fill(-1),
  };
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) h.hash[i] = rnd();
  { let sx = 0, sy2 = 0, k = 0; for (let i = 0; i < nP; i++) if (h.eye[i]) { sx += h.x0[i]; sy2 += h.y0[i]; k++; } if (k) { h.ecx = sx / k; h.ecy = sy2 / k; } else h.ecx = h.ecy = -1e5; }
  return h;
}


/* The stage height is the SMALL viewport (svh): a phone's address bar showing or hiding must never move anything. The canvas is as tall as the
   large viewport so nothing is cut when the bar hides. */
let probes = null;
function viewport() {
  if (!probes) { probes = ['100svh', '100lvh'].map(h => { const d = document.createElement('div'); d.setAttribute('aria-hidden', 'true'); d.style.cssText = 'position:fixed;left:0;top:0;width:0;height:' + h + ';visibility:hidden;pointer-events:none'; document.body.appendChild(d); return d; }); }
  const sv = probes[0].offsetHeight, lv = probes[1].offsetHeight, ih = innerHeight;
  const H = sv > 100 ? sv : ih;
  return { W: innerWidth, H, Hc: Math.max(H, lv > 100 ? lv : 0, ih) };
}

/* ------------------------------------------------------------------ the field */
let fly = null, flyOn = false, isCut = false, cutBmp = null, T = 1, wtop = 100, hd = -1, hq = -1, wOn = false;
let eyeList = null, fx = null, fastOn = false, blinkOn = false, blinkTimer = 0, bkMode = 0, bkV = 0, bridgeEl = null, hp = -1, rule = -1, sRaf = 0, dpr0 = 1;
const stats = { calls: 0 };
const setVar = (k, v) => root.style.setProperty(k, v);

function makeFx() {
  const h = hero;
  eyeList = []; for (let i = 0; i < h.n; i++) if (h.eye[i]) eyeList.push(i);
  fx = createHover({ canvas, xs: h.x0, ys: h.y0, zs: h.z, cell: g.cell, dpr: g.dpr, cd: g.cellDev,
    sizeOf: (i, z) => { if (!h.eye[i] || !bkMode) return z; const k = blinkK(i); return z * (1 - k) + h.etz[i] * k; } });
}
function layout() {
  const vp = viewport(); g = geometry(vp.W, vp.H, vp.H); T = Math.round(vp.H * 1.1); wtop = Math.round(vp.H * 0.58);
  setVar('--pin', T + 'px'); setVar('--wtop', wtop + 'px');
  setVar('--H', vp.H + 'px'); setVar('--tagTop', g.tagTop + 'px'); setVar('--eyeTop', g.eyeTop + 'px'); setVar('--cell', g.cell + 'px'); setVar('--sq', (g.sqDev / g.dpr) + 'px');
  canvas.width = Math.round(vp.W * g.dpr); canvas.height = Math.round(vp.H * g.dpr); canvas.style.width = vp.W + 'px'; canvas.style.height = vp.H + 'px';
  hero = buildHero(); fastOn = false; makeFx(); lastVP = vp;
  flyCv.width = Math.round(vp.W * g.dpr); flyCv.height = Math.round(vp.Hc * g.dpr); flyCv.style.width = vp.W + 'px'; flyCv.style.height = vp.Hc + 'px';
  cutBmp = null; flyOn = false; buildFly();
}

/* ------------------------------------------------------------------ the bridge: a share of the squares gather into the dotted rule
   Everything below is a pure function of p, the scroll position mapped onto the bridge range, so it scrubs and reverses exactly.
   ~20% of the hero's squares (chosen by a seeded hash, never the eyes) leave the hero canvas at p > 0 and are drawn by the fixed fly canvas:
   each falls (in page coordinates) to the dot of the Work rule below it, with a little sideways spread, centre-out. One square per dot
   stays (the rule), the rest shrink away on arrival; a dot with no square above it grows out of nothing. At p = 1 the CSS rule takes over. */
const flyEase = v => v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
function buildFly() {
  fly = null; const rule = document.querySelector('.work .rule'); if (!rule || !hero) return;
  const rc = rule.getBoundingClientRect(), cell = g.cell, left = rc.left, Ty = wtop, nd = Math.floor(rc.width / cell);
  if (nd < 8) return;
  const h = hero, n = h.n, cx = left + nd * cell / 2, isD = new Uint8Array(n), pick = new Int32Array(nd).fill(-1);
  for (let i = 0; i < n; i++) { if (h.eye[i] || h.z[i] <= 0 || hash2(i, 77) >= 0.2) continue; isD[i] = 1;
    const c = clamp(Math.round((h.x0[i] - left) / cell), 0, nd - 1); if (pick[c] < 0 || hash2(i, 5) < hash2(pick[c], 5)) pick[c] = i; }
  const X0 = [], Y0 = [], Z = [], TX = [], S = [], L = [], JX = [], K = [], IDX = [];
  const add = (i, c, kind) => {   /* kind 0 dissolves on arrival, 1 stays as the dot, 2 grows from nothing */
    const r1 = hash2(i + 11, c), r2 = hash2(i + 23, c + 3), tx = left + c * cell, cr = Math.abs(tx + cell / 2 - cx) / (nd * cell / 2), Lk = 0.4 + 0.5 * cr, dur = 0.42 + 0.12 * r1;
    X0.push(kind === 2 ? tx : h.x0[i]); Y0.push(kind === 2 ? g.H * (0.25 + 0.5 * r1) : h.y0[i]); Z.push(kind === 2 ? 0 : h.z[i]); TX.push(tx);
    S.push(Math.max(0, Lk - dur) + 0.04 * r2); L.push(Lk); JX.push((r2 - 0.5) * cell * 12); K.push(kind); IDX.push(i); };
  for (let i = 0; i < n; i++) if (isD[i]) { const c = clamp(Math.round((h.x0[i] - left) / cell), 0, nd - 1); add(i, c, pick[c] === i ? 1 : 0); }
  for (let c = 0; c < nd; c++) if (pick[c] < 0) add(n + c, c, 2);
  fly = { n: X0.length, x0: Float32Array.from(X0), y0: Float32Array.from(Y0), z: Float32Array.from(Z), tx: Float32Array.from(TX), ty: Ty, s: Float32Array.from(S), l: Float32Array.from(L), jx: Float32Array.from(JX), k: Uint8Array.from(K), isD };
}
function drawFly(p) {
  const f = fly, ctx = flyCv.getContext('2d'), dpr = g.dpr, cd = g.cellDev, sq = g.sqDev, hh = flyCv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, flyCv.width, hh); ctx.fillStyle = FG;
  const A = new Path2D(), B = new Path2D(), C = new Path2D();
  for (let k = 0; k < f.n; k++) {
    const t = clamp((p - f.s[k]) / (f.l[k] - f.s[k])), e = t <= 0 ? 0 : t >= 1 ? 1 : flyEase(t), kind = f.k[k], base = cd * f.z[k];
    const size = kind === 2 ? sq * smooth(e / 0.5) : kind === 1 ? base + (sq - base) * smooth((e - 0.6) / 0.4) : base * (1 - smooth((e - 0.7) / 0.3));
    if (size < 0.4) continue;
    const x = f.x0[k] + (f.tx[k] - f.x0[k]) * e + f.jx[k] * Math.sin(Math.PI * e), y = f.y0[k] + (f.ty - f.y0[k]) * e, off = (cd - size) / 2 * (1 - e);
    const px = Math.round(x * dpr) + off, py = Math.round(y * dpr) + off; if (py < -cd || py > hh) continue;
    (e < 0.7 ? A : e < 0.9 ? B : C).rect(px, py, size, size);
  }
  ctx.globalAlpha = 1; ctx.fill(A); ctx.globalAlpha = 0.75; ctx.fill(B); ctx.globalAlpha = 0.45; ctx.fill(C); ctx.globalAlpha = 1;
}
function clearFly() { flyCv.getContext('2d').clearRect(0, 0, flyCv.width, flyCv.height); }
/* the hero canvas without the squares that have left it */
function setCut(cut) {
  if (cut === isCut) return; isCut = cut;
  if (cut) {
    if (!cutBmp) { cutBmp = document.createElement('canvas'); cutBmp.width = canvas.width; cutBmp.height = canvas.height; const c = cutBmp.getContext('2d'), h = hero, cd = g.cellDev, dpr = g.dpr; c.fillStyle = FG; c.beginPath();
      for (let i = 0; i < h.n; i++) { if (fly && fly.isD[i]) continue; const z = cd * h.z[i], q = (cd - z) / 2; c.rect(Math.round(h.x0[i] * dpr) + q, Math.round(h.y0[i] * dpr) + q, z, z); } c.fill(); }
    const c = canvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(cutBmp, 0, 0);
  } else { fastOn = false; wake(); }
}

/* Blink: an eyelid, not a flash. The eye's squares shrink to nothing from the top row down (70 ms), hold (40 ms), then reopen bottom-up
   (110 ms, ease-out). Every 3-7 s, one in six is a double blink; none is started while the pointer is near the face or the hero is mostly gone. */
const BL_C = 70, BL_H = 40, BL_O = 110, BL_GAP = 90, BL_D = BL_C + BL_H + BL_O;
function blinkTick(now) {
  let t = blinkFreeze != null ? blinkFreeze : now - blinkT0; bkMode = 0;
  if (t < 0) return 0;
  if (blinkDbl && t >= BL_D + BL_GAP) t -= BL_D + BL_GAP;
  if (t >= BL_D) return 0;
  if (t < BL_C) { bkMode = 1; bkV = t / BL_C; } else if (t < BL_C + BL_H) { bkMode = 2; bkV = 1; } else { bkMode = 3; bkV = (t - BL_C - BL_H) / BL_O; }
  return bkMode;
}
const blinkK = i => {
  const row = hero.erow[i], nr = hero.enr[i];
  if (bkMode === 1) return clamp(bkV * nr - row);
  if (bkMode === 2) return 1;
  const o = 1 - (1 - bkV) ** 3; return 1 - clamp(o * nr - (nr - 1 - row));
};
function scheduleBlink(ms) {
  clearTimeout(blinkTimer);
  blinkTimer = setTimeout(() => {
    if (!live || !hero) return;
    if (isCut || document.hidden || (ptr.on && Math.hypot(ptr.x - hero.ecx, ptr.y - hero.ecy) < 280)) { scheduleBlink(700); return; }
    blinkT0 = performance.now(); blinkDbl = Math.random() < 1 / 6; wake(); scheduleBlink(3000 + Math.random() * 4000);
  }, ms);
}

/* a frame: the develop-in on load (squares grow in, name a little after the portrait), then only what the mouse or a blink touches */
function frame(now) {
  raf = 0; if (!live || !fx || isCut) { running = false; return; }
  const dev = clamp((now - tDev) / 1200), nd = clamp((now - nameT) / 1200);
  if (dev < 1 || nd < 1) {
    const ctx = canvas.getContext('2d'), h = hero, cd = g.cellDev, dpr = g.dpr, n = h.n;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = FG; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      let size = cd * h.z[i], f = i >= h.nP ? nd : dev;
      const dv = clamp((f * 1.4 - h.hash[(i * 7) % n] * 0.4) / 0.6); if (dv < 1) size *= dv; if (size < 0.4) continue;
      ctx.rect(Math.round(h.x0[i] * dpr) + (cd - size) / 2, Math.round(h.y0[i] * dpr) + (cd - size) / 2, size, size);
    }
    ctx.fill(); fastOn = false; raf = requestAnimationFrame(frame); return;
  }
  if (!fastOn) { fastOn = true; fx.full(); }
  const blink = blinkTick(now) > 0; if (blink || blinkOn) for (let q = 0; q < eyeList.length; q++) fx.force(eyeList[q]); blinkOn = blink;
  const busy = fx.step(now); stats.calls = fx.calls;
  if (busy || blink) raf = requestAnimationFrame(frame); else running = false;
}
function wake() { if (!live || running || document.hidden) return; running = true; raf = requestAnimationFrame(frame); }

/* the scroll controller: one rAF-throttled pass writing --hp (how far the hero has gone: the cue fades first, the tagline only a little) and
   --rule (the dotted rule between hero and Work grows from the centre over ~280 px of scroll). Nothing else follows the scroll. */
function onScroll() {
  sRaf = 0; const y = scrollY, q = clamp(y / T);
  const d = Math.round(smooth((q - 0.05) / 0.6) * 100) / 100; if (d !== hd) { hd = d; setVar('--hd', d); root.classList.toggle('hgone', d >= 1); }
  const c = Math.round(clamp(q * 8) * 100) / 100; if (c !== hq) { hq = c; setVar('--hq', c); }
  setCut(!!fly && q > 0);
  if (fly && q > 0 && q < 1) { drawFly(q); flyOn = true; } else if (flyOn) { clearFly(); flyOn = false; }
  const r = q >= 1 || !fly ? 1 : 0; if (r !== rule) { rule = r; setVar('--rule', r); root.classList.toggle('handed', r === 1); }
  const on = q >= 0.92; if (on !== wOn) { wOn = on; root.classList.toggle('wi', on); if (!on) root.classList.remove('wi0'); }
  if (ptr.on && fx && !isCut) { fx.move(ptr.x, ptr.y); wake(); }
}

/* ------------------------------------------------------------------ boot */
async function startLive() {
  const fontP = document.fonts.load('600 100px "Inter Tight"').catch(() => {});
  const im = await IMG_P; if (!im) throw new Error('no portrait image');
  IMG = im;
  /* the portrait does not wait for the name's font: if it is not here within ~300 ms the name joins as soon as it lands */
  await Promise.race([fontP, new Promise(r => setTimeout(r, 300))]);
  nameOn = document.fonts.check('600 100px "Inter Tight"');
  bridgeEl = document.querySelector('.bridge');
  if (!canvas.getContext('2d')) throw new Error('no canvas');
  root.classList.add('pt', 'st', 'live'); live = true;
  layout(); tDev = nameT = performance.now();
  /* a #work deep link lands on the finished Work (the stage's end); the browser's own fragment jump can come late, so it is held until the person scrolls */
  let hashLand = location.hash === '#work'; if (hashLand) { scrollTo(0, T); ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(t => addEventListener(t, () => { hashLand = false; }, { once: true, passive: true })); setTimeout(() => { hashLand = false; }, 2500); }
  if (scrollY > 0) tDev = nameT -= 5000; scheduleBlink(5400); onScroll();
  let rt;
  const relayout = () => { layout(); nameT = tDev = performance.now() - 5000; isCut = false; hd = hq = rule = -1; onScroll(); wake(); };
  if (!nameOn) fontP.then(() => { if (document.fonts.check('600 100px "Inter Tight"')) { nameOn = true; nameW100 = 0; layout(); nameT = performance.now(); wake(); } });
  document.fonts.addEventListener('loadingdone', () => { clearTimeout(rt); rt = setTimeout(relayout, 80); });
  addEventListener('load', () => { clearTimeout(rt); rt = setTimeout(relayout, 30); });
  /* the mouse effect: mouse only (touch does nothing), one position per frame */
  addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; if (fx && !isCut) { fx.move(ptr.x, ptr.y); wake(); } });
  const away = () => { ptr.on = false; if (fx) fx.leave(); wake(); };
  document.addEventListener('pointerleave', away); addEventListener('blur', away);
  addEventListener('scroll', () => { if (hashLand && Math.abs(scrollY - T) > 2) scrollTo(0, T); if (!sRaf) sRaf = requestAnimationFrame(onScroll); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else wake(); });
  /* only a change of width or of the stage's own (small-viewport) height re-lays out: a phone's address bar moves innerHeight, never svh */
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const v = viewport(); if (lastVP && v.W === lastVP.W && Math.abs(v.H - lastVP.H) < 2) return; relayout(); }, 200); });
  window.__pin = { T: () => T, wtop: () => wtop };
  window.__field = { stats, blink: () => { blinkFreeze = null; blinkDbl = false; blinkT0 = performance.now(); wake(); }, eyes: () => [hero.ecx, hero.ecy, g.cell] };
  wake();
}


/* reduced motion / no canvas: the same composition drawn once into the hero (no scroll transition) */
async function startStatic() {
  const im = await IMG_P; if (!im) return; IMG = im;
  const draw = () => {
    const vp = viewport(); g = geometry(vp.W, vp.H, vp.H); hero = buildHero();
    root.style.setProperty('--cell', g.cell + 'px'); root.style.setProperty('--sq', (g.sqDev / g.dpr) + 'px'); root.style.setProperty('--H', vp.H + 'px'); root.style.setProperty('--tagTop', g.tagTop + 'px'); root.style.setProperty('--eyeTop', g.eyeTop + 'px');
    canvas.width = Math.round(vp.W * g.dpr); canvas.height = Math.round(vp.H * g.dpr); canvas.style.width = vp.W + 'px'; canvas.style.height = vp.H + 'px';
    const c = canvas.getContext('2d'), cd = g.cellDev; c.fillStyle = FG; c.beginPath();
    for (let i = 0; i < hero.n; i++) { const z = cd * hero.z[i], q = (cd - z) / 2; c.rect(Math.round(hero.x0[i] * g.dpr) + q, Math.round(hero.y0[i] * g.dpr) + q, z, z); }
    c.fill();
  };
  await Promise.race([document.fonts.load('600 100px "Inter Tight"').catch(() => {}), new Promise(r => setTimeout(r, 600))]);
  root.classList.add('pt', 'st'); draw();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
}

/* a PNG of the portrait with its halo for the no-JS <img>: window.__portraitPNG(cellPx) -> data URL */
window.__portraitPNG = async cell => {
  const im = await IMG_P, cols = 150, rows = Math.round(cols * SRC_H / SRC_W), M = Math.ceil(HALO_PX / 6), P = buildGrid(cols, rows, im, { l: 1, r: 1, b: 0 }), gw = cols + 2 * M, gh = rows + M;
  const f = portraitSquares(P, M, M, gw, gh, 1, null), cv = document.createElement('canvas');
  cv.width = gw * cell; cv.height = gh * cell; const c = cv.getContext('2d'); c.fillStyle = '#0A0A0A'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = FG;
  for (let i = 0; i < f.xs.length; i++) { const z = cell * f.zs[i]; c.fillRect(f.xs[i] * cell + (cell - z) / 2, f.ys[i] * cell + (cell - z) / 2, z, z); }
  return cv.toDataURL('image/png');
};

if (canvas) {
  if (root.classList.contains('rm')) startStatic();
  else startLive().catch(err => { console.warn('[field] falling back to the plain page:', err && err.message); window.__sqFallback && window.__sqFallback(); startStatic(); });
}
