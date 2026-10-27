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
const SRC_W = 460, SRC_H = 560, CROP_Y = 40;               /* the crop of assets/portrait-src.png (460x600) */
const EYES = [[155, 173, 18, 8], [215, 177, 18, 8]];       /* in the crop: centre x, y, half width, half height */
const canvas = document.getElementById('portrait');
const IMG_P = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'assets/portrait-src.png'; });

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
  return (nameW100 = c.measureText(NAME).width);
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
let g = null, hero = null, rowsData = [], listEl = null, headEl = null, heroOv = null;
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
  const nm = rasterText(NAME, `600 ${g.fs}px "Inter Tight", system-ui, sans-serif`, `${-g.fs * 0.035}px`, g.cx, g.base, g.fs, 'center', measureName() * g.fs / 100, cell);
  for (let i = 0; i < nm.length; i += 2) { xs.push(nm[i] * cell); ys.push(nm[i + 1] * cell); vs.push(1); eyeF.push(0); }
  const n = xs.length, h = { n, x0: Float32Array.from(xs), y0: Float32Array.from(ys), v: Float32Array.from(vs), eye: Uint8Array.from(eyeF),
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

function buildRows() {
  const lis = [...document.querySelectorAll('.idx-list > li')];
  const prev = new Map(rowsData.map(r => [r.li, r]));
  rowsData = lis.map((li, i) => {
    const old = prev.get(li), r = old || { li, i, state: 0, vis: 0, t0: 0, hash: null };
    r.i = i; r.cells = null; r.pDriven = false; r.px = null;
    if (!li.hidden && li.offsetParent) { const c = rowCells(li); r.cells = c; const vt = c.top - T, vb = c.bottom - T; r.pDriven = vt > 56 && vb < g.H - 20; }
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
  for (let i = 0; i < n; i++) if (h.trow[i] < 0) h.d[i] = 0.02 + 0.3 * (h.y0[i] / g.H) + 0.1 * rnd();
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
  hero = buildHero(); buildRows(); assign();
  { const hr = headEl.getBoundingClientRect(); headDoc = [hr.top + scrollY, hr.bottom + scrollY]; }
  cleared = false;
}


function frame(now) {
  raf = 0; if (!running) return;
  const ctx = canvas.getContext('2d'), dt = Math.min((now - tPrev) / 1000 || 0.016, 0.05); tPrev = now;
  const sy = scrollY, pT = clamp(sy / T);
  if (!pInit) { pS = pT; pInit = true; }
  /* the picture chases the scroll with a capped rate (a full hand-over takes at least ~1.4 s however fast the page is scrolled), both ways */
  { const diff = pT - pS, step = clamp(diff * Math.min(1, dt * 9), -dt / 1.4, dt / 1.4); pS = Math.abs(diff) < 0.0006 ? pT : pS + (Math.abs(step) < Math.abs(diff) ? step : diff); }
  const p = pS, dpr = g.dpr, cellDev = g.cellDev, sqDev = g.sqDev, cell = g.cell, W = g.W, H = g.H, dev = clamp((now - tDev) / 1200);
  ptrK += ((ptr.on ? 1 : 0) - ptrK) * Math.min(1, dt * 10);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = FG; ctx.strokeStyle = FG; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, cellDev * 0.2);
  /* the page's own DOM follows the field: tagline and hint leave, the Work heading and each row take over once settled */
  const hop = Math.round((1 - smooth(p / 0.2)) * 100) / 100; if (hop !== lastHeroOp) { heroOv.style.opacity = hop; lastHeroOp = hop; }
  const hdp = Math.round(smooth((p - 0.55) / 0.35) * 100) / 100; if (hdp !== lastHeadOp) { headEl.style.opacity = hdp; lastHeadOp = hdp; }
  /* a row's crisp text waits for its own squares (landed >= ~90%), top to bottom; rows without squares type on, but only once the hand-over is over */
  blocks.length = 0;
  rowsData.forEach(r => {
    if (!r.pDriven && p < 0.5 && r.state) { r.state = 0; }
    if (!r.pDriven && r.inView && r.state === 0 && r.cells && p >= 0.97) { r.cells = rowCells(r.li); r.state = 1; r.t0 = now; }
    let v = r.pDriven ? smooth((landed(r, p) - 0.9) / 0.1) : r.state === 2 ? 1 : r.state === 1 ? smooth(((now - r.t0) / 700 - 0.6) / 0.4) : 0;
    if (r.cells == null && !r.pDriven && !r.li.hidden) v = 1;
    v = Math.round(v * 100) / 100; rv[r.i] = v; if (v !== r.vis) { r.vis = v; r.li.style.opacity = v; }
    if (v > 0.2 && r.cells) blocks.push(r.cells.rtop - sy - 4, r.cells.bottom - sy + 4, r.i);
  });
  if (hdp > 0.2 && headDoc) blocks.push(headDoc[0] - sy - 4, headDoc[1] - sy + 4, -1);
  const h = hero, n = h.n, blink = now < blinkEnd;
  const R2 = ((ptr.touch ? 70 : 90) * 1.5) ** 2, sig2 = 2 * ((ptr.touch ? 70 : 90) / 2) ** 2;
  let springs = false;
  if (p < 0.9999) {
    ctx.beginPath(); const glyphs = [];
    for (let i = 0; i < n; i++) {
      let x = h.x0[i], yv = h.y0[i], size = sqDev, d = h.d[i];
      if (h.trow[i] >= 0) {
        /* along a curved path to the row target (neighbours bow the same way, so the squares move as streams) */
        const t = clamp((p - d) / LAND), e = ease(t);
        if (t > 0) {
          const gx = h.tx[i], gy = h.ty[i] - sy, dx = gx - x, dy = gy - yv, k = 0.3 * Math.sin(h.x0[i] * 0.005 + h.y0[i] * 0.004 + h.trow[i] * 1.1), u1 = 1 - e;
          const qx = x + dx * 0.5 - dy * k, qy = yv + dy * 0.5 + dx * k;
          x = u1 * u1 * x + 2 * u1 * e * qx + e * e * gx; yv = u1 * u1 * yv + 2 * u1 * e * qy + e * e * gy;
        }
        if (t >= 1) size *= 1 - rv[h.trow[i]];
      } else {
        const tt = clamp((p - d) / 0.55); if (tt > 0) { yv += tt * tt * (g.H * 1.4) * (0.7 + 0.6 * h.hash[i]); x += (h.hash[i] - 0.5) * 30 * tt; size *= 1 - smooth(tt * 1.08 - 0.08); }
      }
      if (size < 0.4) continue;
      const vy = yv; if (blocks.length) { let hid = false; for (let q = 0; q < blocks.length; q += 3) if (vy > blocks[q] && vy < blocks[q + 1] && h.trow[i] !== blocks[q + 2]) { hid = true; break; } if (hid) continue; }
      if (vy < -cell || vy > H + cell || x < -cell || x > W + cell) continue;
      if (p < 0.02) { const dv = clamp((dev * 1.4 - h.hash[(i * 7) % n] * 0.4) / 0.6); if (dv < 1) size *= dv; }
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
  const im = await IMG_P; if (!im) throw new Error('no portrait image');
  IMG = im;
  await Promise.race([Promise.all([document.fonts.load('600 100px "Inter Tight"')]).then(() => document.fonts.ready), new Promise(r => setTimeout(r, 3500))]).catch(() => {});
  listEl = document.querySelector('.idx-list'); headEl = document.querySelector('.idx-head'); heroOv = document.querySelector('.hero-ov');
  if (!canvas.getContext('2d') || !listEl) throw new Error('no canvas');
  root.classList.add('pt', 'live'); live = true;
  layout(); tDev = performance.now(); nextBlink = tDev + 5400;
  document.querySelectorAll('.idx-list > li').forEach(li => { li.style.opacity = 0; });
  headEl.style.opacity = 0;
  addEventListener('pointermove', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; ptr.touch = e.pointerType === 'touch'; wake(); });
  addEventListener('pointerdown', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; ptr.touch = e.pointerType === 'touch'; wake(); });
  ['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => { if (e.pointerType === 'touch') ptr.on = false; }));
  document.addEventListener('pointerleave', () => { ptr.on = false; });
  addEventListener('blur', () => { ptr.on = false; });
  addEventListener('scroll', wake, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else wake(); });
  const io = new IntersectionObserver(list => list.forEach(en => { const r = rowsData.find(x => x.li === en.target); if (r) { r.inView = en.isIntersecting; if (en.isIntersecting) wake(); } }), { threshold: 0.25 });
  const watch = () => rowsData.forEach(r => io.observe(r.li));
  watch();
  let rt, lw = innerWidth, lh = innerHeight;
  const relayout = () => { layout(); watch(); wake(); };
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (innerWidth === lw && Math.abs(innerHeight - lh) < 140) return; lw = innerWidth; lh = innerHeight; relayout(); }, 200); });
  addEventListener('sq:layout', () => { clearTimeout(rt); rt = setTimeout(relayout, 60); });
  window.__field = { get p() { return pS; }, T: () => T, blink: () => { blinkEnd = performance.now() + 120; }, rows: () => rowsData };
  wake();
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
