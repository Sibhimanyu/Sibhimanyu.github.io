/* Footer: the page closes in the same 1-bit square material it opens with.
   - The headline turns into squares under the pointer (~120 px), which morph into x, - or |, dots and spring back; elsewhere it is crisp text.
   - The pill fills with a Bayer-ordered wipe into the accent, and its GitHub mark breaks into squares and reassembles.
   Reduced motion: nothing here runs (the pill just changes colour in CSS). */
import { heroCell, rasterText } from './portrait.js';

const root = document.documentElement, FG = '#F2F0EB', AC = '#FF4D1F', INK = '#0A0A0A';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
if (!root.classList.contains('rm')) boot();

function boot() {
  const closing = document.querySelector('.closing'), h2 = document.getElementById('h-close'), cv = document.getElementById('fx-head'), btn = document.querySelector('.btn'), bcv = btn && btn.querySelector('.btn-fx');
  if (!closing || !h2 || !cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  /* ------------------------------------------------------------ headline */
  let cells = null, box = null, cell = 4, mx = -1e5, my = -1e5, inside = false, k = 0, raf = 0, last = 0, R = 120;
  function build() {
    cell = heroCell(); const cs = getComputedStyle(h2), fs = parseFloat(cs.fontSize), ls = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, tn = h2.firstChild, words = [], txt = tn.textContent;
    const re = /\S+/g; let m; while ((m = re.exec(txt))) { const rg = document.createRange(); rg.setStart(tn, m.index); rg.setEnd(tn, m.index + m[0].length); const rc = rg.getClientRects()[0]; if (rc) words.push([m[0], Math.round(rc.top), rc]); }
    const lines = []; words.forEach(w => { const l = lines.find(x => x.top === w[1]); if (l) { l.t += ' ' + w[0]; l.r = Math.max(l.r, w[2].right); } else lines.push({ top: w[1], t: w[0], l: w[2].left, r: w[2].right, rt: w[2].top }); });
    const hr = h2.getBoundingClientRect(), cr = closing.getBoundingClientRect(), sy = scrollY, xs = [], ys = [];
    box = { x: hr.left - cr.left - R, y: hr.top - cr.top - R, w: hr.width + 2 * R, h: hr.height + 2 * R, vx: hr.left - R, vy: hr.top + sy - R };
    lines.forEach(l => { const base = l.rt + sy + fs * 0.969, c = rasterText(l.t, font, ls, l.l, base, fs, 'left', l.r - l.l + 6, cell); for (let i = 0; i < c.length; i += 2) { xs.push(c[i] * cell - box.vx); ys.push(c[i + 1] * cell - box.vy); } });
    const n = xs.length; cells = { n, x: Float32Array.from(xs), y: Float32Array.from(ys), f: new Float32Array(n), v: new Float32Array(n), h: Float32Array.from({ length: n }, () => Math.random()) };
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr); cv.style.width = box.w + 'px'; cv.style.height = box.h + 'px'; cv.style.left = box.x + 'px'; cv.style.top = box.y + 'px';
  }
  function frame(now) {
    raf = 0; const dt = Math.min((now - last) / 1000 || 0.016, 0.033); last = now;
    k += ((inside ? 1 : 0) - k) * Math.min(1, dt * 14);
    const c = cells, ctx = cv.getContext('2d'), sq = Math.max(1, Math.round(cell * dpr) - Math.max(1, Math.round(0.6 * dpr))), cd = cell * dpr, r = R * k, sig = R * 0.4, s2 = 2 * sig * sig;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = FG; ctx.strokeStyle = FG; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, cd * 0.2);
    const sqs = new Path2D(), ln = new Path2D(), fl = new Path2D(); let busy = false;
    const px = mx - box.vx, py = my + scrollY - box.vy;   /* pointer in the layer's space */
    for (let i = 0; i < c.n; i++) {
      const x = c.x[i], y = c.y[i], dx = x + cell / 2 - px, dy = y + cell / 2 - py, d2 = dx * dx + dy * dy;
      let t = 0; if (k > 0.01 && d2 < r * r * 1.2) t = 1.3 * Math.exp(-d2 / s2);
      if (t > 0 || c.f[i] !== 0 || c.v[i] !== 0) { c.v[i] += ((t - c.f[i]) * 520 - c.v[i] * 21) * dt; c.f[i] += c.v[i] * dt; if (t === 0 && Math.abs(c.f[i]) < 0.01 && Math.abs(c.v[i]) < 0.05) c.f[i] = c.v[i] = 0; else busy = true; }
      const f = Math.max(c.f[i], 0), inR = d2 < r * r || f > 0.02; if (!inR) continue;
      const dl = Math.sqrt(d2) + 0.001, ox = dx / dl * f * cell * 1.8, oy = dy / dl * f * cell * 1.8, cx = (x + ox) * dpr + cd / 2, cy = (y + oy) * dpr + cd / 2;
      if (f < 0.22) { const s = sq * (1 - f * 3.2); sqs.rect(cx - s / 2, cy - s / 2, s, s); continue; }
      const fs = Math.min(f, 1.2), sc = 1 + 0.8 * Math.min(fs, 1), rot = fs * (c.h[i] - 0.5) * 3.3, co = Math.cos(rot), si = Math.sin(rot), hh = cd * 0.42 * sc, sc2 = c.h[i];
      const seg = (ax, ay, bx, by) => { ln.moveTo(cx + ax * co - ay * si, cy + ax * si + ay * co); ln.lineTo(cx + bx * co - by * si, cy + bx * si + by * co); };
      if (sc2 > 0.7) { seg(-hh, -hh, hh, hh); seg(hh, -hh, -hh, hh); } else if (sc2 > 0.3) { if (((x / cell + y / cell) | 0) & 1) seg(-hh * 1.1, 0, hh * 1.1, 0); else seg(0, -hh * 1.1, 0, hh * 1.1); } else { fl.moveTo(cx + hh * 0.42, cy); fl.arc(cx, cy, hh * 0.42, 0, 6.2832); }
    }
    ctx.fill(sqs); ctx.fill(fl); ctx.stroke(ln);
    /* the crisp text is masked out where squares show */
    h2.style.setProperty('--mx', (mx - h2.getBoundingClientRect().left) + 'px'); h2.style.setProperty('--my', (my - h2.getBoundingClientRect().top) + 'px'); h2.style.setProperty('--mr', (r * 1.04).toFixed(1) + 'px');
    if (inside || k > 0.01 || busy) raf = requestAnimationFrame(frame); else { cv.style.display = 'none'; h2.style.removeProperty('-webkit-mask-image'); h2.style.removeProperty('mask-image'); h2.dataset.fx = ''; }
  }
  const MASK = 'radial-gradient(circle var(--mr) at var(--mx) var(--my), transparent 0, transparent calc(var(--mr) - 6px), #000 var(--mr))';
  function start() {
    if (!cells) build(); if (cv.style.display !== 'block') { cv.style.display = 'block'; }
    h2.style.webkitMaskImage = MASK; h2.style.maskImage = MASK; h2.dataset.fx = '1'; if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  closing.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return; mx = e.clientX; my = e.clientY;
    const hr = h2.getBoundingClientRect(); const near = mx > hr.left - R && mx < hr.right + R && my > hr.top - R && my < hr.bottom + R;
    if (near) { inside = true; start(); } else inside = false;
  });
  closing.addEventListener('pointerleave', () => { inside = false; });
  addEventListener('resize', () => { cells = null; });
  document.fonts && document.fonts.addEventListener('loadingdone', () => { cells = null; });
  addEventListener('sq:layout', () => { cells = null; });

  /* ------------------------------------------------------------ pill */
  if (!btn || !bcv) return;
  const PATH = btn.querySelector('svg path'), mark = btn.querySelector('svg');
  let bp = 0, bt = 0, braf = 0, blast = 0, bt0 = 0, bw = 0, bh = 0, markCells = null;
  function bsize() { const r = btn.getBoundingClientRect(); bw = Math.round(r.width); bh = Math.round(r.height); bcv.width = Math.round(bw * dpr); bcv.height = Math.round(bh * dpr); markCells = null; }
  function markBuild() {
    const sr = mark.getBoundingClientRect(), br = btn.getBoundingClientRect(), cs = Math.max(2, Math.round(2.4 * dpr)), W = Math.round(sr.width * dpr), c = document.createElement('canvas'); c.width = W; c.height = W;
    const x = c.getContext('2d', { willReadFrequently: true }); x.scale(W / 16, W / 16); x.fill(new Path2D(PATH.getAttribute('d')));
    const d = x.getImageData(0, 0, W, W).data, out = []; for (let j = 0; j < W; j += cs) for (let i = 0; i < W; i += cs) if (d[((j + (cs >> 1)) * W + i + (cs >> 1)) * 4 + 3] > 120) out.push((sr.left - br.left) * dpr + i, (sr.top - br.top) * dpr + j);
    markCells = { xs: out, cs };
  }
  function bframe(now) {
    braf = 0; const dt = Math.min((now - blast) / 1000 || 0.016, 0.05); blast = now;
    bp += Math.sign(bt - bp) * Math.min(Math.abs(bt - bp), dt / 0.22);
    const ctx = bcv.getContext('2d'), cd = Math.max(2, Math.round(3.4 * dpr)), cols = Math.ceil(bcv.width / cd), rows = Math.ceil(bcv.height / cd);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, bcv.width, bcv.height);
    if (bp > 0) {
      const full = bp >= 1; ctx.fillStyle = AC;
      if (full) ctx.fillRect(0, 0, bcv.width, bcv.height);
      else { ctx.beginPath(); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const th = (c / cols) * 0.72 + ((BAYER[(r & 3) * 4 + (c & 3)] + 0.5) / 16) * 0.28; if (bp * 1.06 > th) ctx.rect(c * cd, r * cd, cd - Math.round(0.6 * dpr), cd - Math.round(0.6 * dpr)); } ctx.fill(); }
    }
    /* the GitHub mark breaks into squares while the wipe passes, then reassembles */
    const m = Math.sin(clamp(bp) * Math.PI), showSq = bp > 0 && bp < 1 || (bt === 0 && bp > 0);
    if (!markCells) markBuild();
    if (m > 0.04) { mark.style.opacity = 0; ctx.fillStyle = INK; const s = markCells.cs, c = markCells.xs; ctx.beginPath(); for (let i = 0; i < c.length; i += 2) { const h = ((i * 2654435761) >>> 0) / 4294967296 - 0.5, h2 = (((i + 7) * 2246822519) >>> 0) / 4294967296 - 0.5; ctx.rect(c[i] + h * m * 26 * dpr, c[i + 1] + h2 * m * 26 * dpr, s - 0.5 * dpr, s - 0.5 * dpr); } ctx.fill(); }
    else mark.style.opacity = 1;
    if (bp !== bt) braf = requestAnimationFrame(bframe);
  }
  const bgo = v => { bt = v; if (!bcv.width) bsize(); if (!braf) { blast = performance.now(); braf = requestAnimationFrame(bframe); } };
  btn.addEventListener('pointerenter', () => bgo(1)); btn.addEventListener('pointerleave', () => bgo(0));
  btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) bgo(1); }); btn.addEventListener('blur', () => bgo(0));
  addEventListener('resize', () => { bcv.width = 0; markCells = null; });
}
