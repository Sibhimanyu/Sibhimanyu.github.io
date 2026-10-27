/* The hero portrait: a toy-like cartoon of the site owner, drawn in code, then read back as a coarse grid of glyphs
   (empty, dot, big dot, segment, cross, square) with an ordered dither, and drawn on a 2D canvas.
   It reacts to the pointer, shimmers, blinks, "develops" on load, and scatters away as the hero scrolls into the first project.
   field.js imports portraitBox (so the name leaves room for it) and setScatter (scroll). Reduced motion / no WebGL: drawn once, static. */

const root = document.documentElement;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const FG = '#F2F0EB', AC = '#FF4D1F';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SRC_W = 660, SRC_H = 800;

let mobileY = null;
export function setPortraitY(y) { mobileY = y; if (live && box && box.mobile && root.classList.contains('gl')) { box.y = y; canvas.style.top = y + 'px'; } }
/* where the portrait sits, in CSS px of the viewport (plain = in the document flow, size only) */
export function portraitBox(W, H, plain = false) {
  const mobile = W <= 760;
  const cols = mobile ? 40 : 66, rows = Math.round(cols * SRC_H / SRC_W);
  const pad = Math.max(20, Math.min(44, W * 0.031));
  let w, x = 0, y = 0;
  if (plain) w = mobile ? Math.min(W * 0.62, 300) : Math.min(W * 0.34, 380);
  else if (mobile) w = Math.min(W * 0.64, H * 0.36 * cols / rows);
  else w = Math.min(W * 0.4, (H - 150) * cols / rows);
  const h = w * rows / cols;
  if (!plain) {
    if (mobile) { x = (W - w) / 2; y = mobileY ?? Math.max(72, H * 0.095); }
    else { x = W - pad - w; y = 70 + (H - 70 - 30 - h) / 2; }
  }
  return { x, y, w, h, cols, rows, cell: w / cols, mobile };
}

/* ------------------------------------------------------------------ the cartoon (tonal image, 660 x 800) */
const gr = l => { const v = Math.round(clamp(l) * 255); return `rgb(${v},${v},${v})`; };
const HEAD_CX = 330, HEAD_CY = 500, TILT = -0.07;
function tilted(c, fn) { c.save(); c.translate(HEAD_CX, HEAD_CY); c.rotate(TILT); c.translate(-HEAD_CX, -HEAD_CY); fn(); c.restore(); }
function facePath(c) {
  c.beginPath(); c.moveTo(330, 178);
  c.bezierCurveTo(440, 178, 484, 260, 482, 345); c.bezierCurveTo(480, 445, 424, 548, 330, 550);
  c.bezierCurveTo(236, 548, 180, 445, 178, 345); c.bezierCurveTo(176, 260, 220, 178, 330, 178); c.closePath();
}
const EYES = [[272, 356], [390, 354]];
function drawEyes(c, white) {
  EYES.forEach(([x, y], i) => { c.fillStyle = white ? '#fff' : gr(0.02); c.beginPath(); c.ellipse(x, y, 22, 33, i ? 0.05 : -0.05, 0, 7); c.fill(); });
}

export function drawCartoon(c, eyeMaskOnly = false) {
  c.fillStyle = '#000'; c.fillRect(0, 0, SRC_W, SRC_H + 40);
  if (eyeMaskOnly) { tilted(c, () => drawEyes(c, true)); return; }

  c.save(); c.translate(0, 26);
  /* shirt: light, with a faint chevron weave, short sleeves */
  const shirt = () => { c.beginPath(); c.moveTo(-10, 810); c.lineTo(28, 660); c.quadraticCurveTo(70, 575, 196, 545); c.lineTo(464, 545); c.quadraticCurveTo(590, 575, 632, 660); c.lineTo(670, 810); c.closePath(); };
  shirt(); c.fillStyle = gr(0.82); c.fill();
  c.save(); shirt(); c.clip(); c.strokeStyle = gr(0.58); c.lineWidth = 4; c.lineJoin = 'round';
  for (let y = 560; y < 830; y += 26) { c.beginPath(); for (let x = -20; x <= 690; x += 26) c.lineTo(x, y + ((x / 26) & 1 ? 11 : -3)); c.stroke(); }
  c.strokeStyle = gr(0.42); c.lineWidth = 6;
  c.beginPath(); c.moveTo(122, 640); c.quadraticCurveTo(96, 720, 84, 812); c.stroke();
  c.beginPath(); c.moveTo(538, 640); c.quadraticCurveTo(564, 720, 576, 812); c.stroke();
  c.restore();
  /* collar lapels */
  [[[236, 520], [150, 590], [248, 652], [292, 548]], [[424, 520], [510, 590], [412, 652], [368, 548]]].forEach(p => {
    c.beginPath(); c.moveTo(...p[0]); c.lineTo(...p[1]); c.lineTo(...p[2]); c.lineTo(...p[3]); c.closePath();
    c.fillStyle = gr(0.97); c.fill(); c.strokeStyle = gr(0.5); c.lineWidth = 5; c.lineJoin = 'round'; c.stroke();
  });
  /* neck: mid-tone */
  c.beginPath(); c.moveTo(256, 440); c.lineTo(404, 440); c.lineTo(414, 560); c.quadraticCurveTo(330, 600, 246, 560); c.closePath();
  c.fillStyle = gr(0.5); c.fill();
  /* scarf: dark, a collar around the neck and a tail hanging down the centre, with light leaf strokes */
  const scarf = () => {
    c.beginPath(); c.moveTo(228, 498); c.bezierCurveTo(240, 575, 420, 580, 432, 498); c.lineTo(440, 552); c.bezierCurveTo(430, 610, 400, 636, 392, 650);
    c.bezierCurveTo(392, 720, 400, 760, 396, 812); c.lineTo(262, 812); c.bezierCurveTo(268, 740, 258, 690, 270, 640); c.bezierCurveTo(240, 620, 224, 580, 220, 552); c.closePath();
  };
  scarf(); c.fillStyle = gr(0.17); c.fill();
  c.save(); scarf(); c.clip();
  const leaves = [[262, 548, -0.5], [330, 574, 0.15], [392, 552, 0.5], [296, 520, -0.9], [372, 528, 0.9], [300, 612, 0.5], [352, 640, -0.55], [316, 676, -0.35], [356, 702, 0.45], [300, 726, 0.6],
    [346, 756, -0.5], [312, 786, 0.3], [284, 650, -0.8], [378, 676, 0.6], [330, 612, -0.4], [274, 760, 0.7], [386, 790, -0.6]];
  leaves.forEach(([x, y, a]) => {
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = gr(0.84); c.beginPath(); c.ellipse(0, 0, 25, 7.5, 0, 0, 7); c.fill();
    c.strokeStyle = gr(0.84); c.lineWidth = 5; c.beginPath(); c.moveTo(-12, -9); c.lineTo(0, -1); c.moveTo(-12, 9); c.lineTo(0, 1); c.moveTo(4, -10); c.lineTo(12, -1); c.stroke();
    c.restore();
  });
  c.restore();
  c.strokeStyle = gr(0.55); c.lineWidth = 4; c.lineJoin = 'round'; scarf(); c.stroke();
  c.restore();

  tilted(c, () => {
    /* ears */
    [[181, 366, 0.7], [480, 366, 0.62]].forEach(([x, y, l]) => {
      c.fillStyle = gr(l); c.beginPath(); c.ellipse(x, y, 24, 38, 0, 0, 7); c.fill();
      c.fillStyle = gr(0.38); c.beginPath(); c.ellipse(x + (x < 330 ? 3 : -3), y + 4, 9, 18, 0, 0, 7); c.fill();
    });
    /* face: light, shaded softly on one side */
    facePath(c); c.fillStyle = gr(0.8); c.fill();
    c.save(); facePath(c); c.clip();
    const gl = c.createLinearGradient(180, 0, 482, 0);
    gl.addColorStop(0, 'rgba(0,0,0,0)'); gl.addColorStop(0.45, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.4)');
    c.fillStyle = gl; c.fillRect(150, 150, 360, 400);
    const gb = c.createLinearGradient(0, 470, 0, 550); gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, 'rgba(0,0,0,0.15)');
    c.fillStyle = gb; c.fillRect(150, 470, 360, 90);
    const lit = c.createRadialGradient(262, 420, 10, 262, 420, 150); lit.addColorStop(0, 'rgba(255,255,255,0.3)'); lit.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = lit; c.fillRect(150, 250, 360, 320);
    c.restore();
    /* hair: a cluster of overlapping curls, sparse and dark, with a lighter rim on each so the curls read */
    const back = [[250, 148, 48], [322, 118, 56], [398, 114, 60], [466, 146, 54], [504, 202, 38], [208, 192, 40], [300, 168, 58], [404, 172, 60]];
    const mid = [[222, 232, 32], [474, 228, 40], [252, 200, 42], [350, 188, 50], [444, 194, 44], [504, 254, 24]];
    const front = [[262, 238, 25], [314, 232, 27], [364, 240, 25], [418, 246, 23], [228, 264, 20], [454, 270, 19]];
    [...back, ...mid, ...front].forEach(([x, y, r]) => {
      c.fillStyle = gr(0.3); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.lineCap = 'round'; c.strokeStyle = gr(0.78); c.lineWidth = 6;
      c.beginPath(); c.arc(x, y, r - 6, Math.PI * 0.9, Math.PI * 1.7); c.stroke();
      c.strokeStyle = gr(0.14); c.lineWidth = 5;
      c.beginPath(); c.arc(x + r * 0.1, y + r * 0.12, r * 0.48, Math.PI * 1.0, Math.PI * 1.8); c.stroke();
      if (r > 36) { c.strokeStyle = gr(0.6); c.lineWidth = 5; c.beginPath(); c.arc(x - r * 0.05, y + r * 0.1, r * 0.3, Math.PI * 0.2, Math.PI * 1.1); c.stroke(); }
    });
    /* brows: short, thick */
    c.lineCap = 'round'; c.strokeStyle = gr(0.1); c.lineWidth = 18;
    c.beginPath(); c.moveTo(240, 306); c.quadraticCurveTo(272, 292, 306, 296); c.stroke();
    c.beginPath(); c.moveTo(358, 294); c.quadraticCurveTo(394, 290, 424, 304); c.stroke();
    /* eyes: solid ovals with a tiny highlight */
    drawEyes(c, false);
    c.fillStyle = gr(1);
    EYES.forEach(([x, y]) => { c.beginPath(); c.ellipse(x - 7, y - 13, 8.5, 10, 0, 0, 7); c.fill(); });
    /* nose and cheeks */
    c.strokeStyle = gr(0.6); c.lineWidth = 6; c.beginPath(); c.moveTo(322, 412); c.quadraticCurveTo(334, 424, 348, 414); c.stroke();
        /* open smile: dark, teeth on top */
    const mouth = () => { c.beginPath(); c.moveTo(262, 446); c.bezierCurveTo(300, 436, 360, 436, 400, 446); c.bezierCurveTo(394, 498, 358, 514, 331, 514); c.bezierCurveTo(306, 514, 268, 498, 262, 446); c.closePath(); };
    mouth(); c.fillStyle = gr(0.05); c.fill(); c.strokeStyle = gr(0.05); c.lineWidth = 9; c.lineJoin = 'round'; c.stroke();
    c.save(); mouth(); c.clip(); c.fillStyle = gr(1); c.fillRect(262, 451, 138, 15); c.restore();
  });
}

/* ------------------------------------------------------------------ the glyph grid */
/* rungs: 0 empty, 1 dot, 2 big dot, 3 segment (- or | by parity), 4 cross, 5 square. */
function buildGrid(cols, rows) {
  const S = 6, mk = eyeOnly => {
    const cv = document.createElement('canvas'); cv.width = cols * S; cv.height = rows * S;
    const cx = cv.getContext('2d', { willReadFrequently: true }); const k = cols * S / SRC_W; cx.scale(k, k);
    drawCartoon(cx, eyeOnly); return cx.getImageData(0, 0, cols * S, rows * S).data;
  };
  const d = mk(false), e = mk(true), n = cols * rows, lum = new Float32Array(n), eye = new Float32Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let a = 0, b = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const o = ((r * S + y) * cols * S + c * S + x) * 4; a += d[o]; b += e[o]; }
    lum[r * cols + c] = a / (S * S * 255); eye[r * cols + c] = b / (S * S * 255);
  }
  const base = new Uint8Array(n), accent = new Int32Array(2).fill(-1), eyeCells = [[], []];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, v = Math.pow(clamp((lum[i] - 0.1) / 0.8), 1.1) * 5, t = (BAYER[(r & 3) * 4 + (c & 3)] + 0.5) / 16;
    base[i] = clamp(Math.floor(v + t), 0, 5);
    if (eye[i] > 0.5) { const side = c < cols * 0.495 ? 0 : 1; eyeCells[side].push(i); if (accent[side] < 0 || lum[i] > lum[accent[side]]) accent[side] = i; }
  }
  const eyes = eyeCells.map(list => {
    const rs = list.map(i => Math.floor(i / cols)), mid = Math.round((Math.min(...rs) + Math.max(...rs)) / 2);
    return { list, mid };
  });
  [0, 1].forEach(s => { if (accent[s] >= 0 && lum[accent[s]] < 0.2) accent[s] = -1; });
  /* per-cell constants */
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
  if (!G || G.cols !== box.cols) G = buildGrid(box.cols, box.rows);
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
  const sig = (box.mobile ? 4.2 : 5.2), s2 = 2 * sig * sig, n = G.n, cols = G.cols;
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

function startLive() {
  if (started) return; started = true; live = true;
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
function startStatic() {
  if (started || staticDone) return; staticDone = true; started = true;
  root.classList.add('pt'); layout(); drawStatic();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); drawStatic(); }, 150); });
}

/* a PNG of the glyph grid for the no-JS <img>: window.__portraitPNG(cellPx) -> data URL */
window.__portraitPNG = cell => {
  const g = G && G.cols === 66 ? G : buildGrid(66, 80), gsz = cell, cv = document.createElement('canvas');
  cv.width = 66 * gsz; cv.height = 80 * gsz; const c = cv.getContext('2d'); c.fillStyle = '#0A0A0A'; c.fillRect(0, 0, cv.width, cv.height);
  const at = buildAtlas(gsz);
  for (let i = 0; i < g.n; i++) {
    let gl = RUNG_GLYPH[g.base[i]]; const cc = i % 66, rr = (i / 66) | 0;
    if (gl === 2 && ((cc + rr) & 1)) gl = 3;
    if (g.accent[0] === i || g.accent[1] === i) gl = 6;
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
