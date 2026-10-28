/* The mouse effect, and nothing else: squares within R px of the pointer turn into thin "+" glyphs a little wider than the square (bright cells only; the darkest keep their dot), and the "+" turns
   toward a "×" with the pointer's speed (0 at rest, 45 deg when fast, clockwise to the right, counter-clockwise to the left). The angle is ONE
   eased number per frame kept in a 16-frame ring; a cell reads the ring a few frames back by its distance from the pointer, so a ripple of
   rotation runs outward from the pointer with no per-cell state beyond `k` (how far it has become a plus). The resting field is a cached bitmap;
   only active cells (inside the radius, plus those easing back over ~250 ms) are tracked and only their dirty rect is redrawn: the resting
   bitmap back, the active squares erased, the shrinking squares in one fill, every plus in one path and ONE stroke. move() just stores the
   position (many pointer events per frame cost nothing); step() reads it once per frame and says false when nothing changed, so the caller's
   rAF loop stops. Nothing is allocated per frame. */
const R = 90, BACK = 0.25, RISE = 0.05, FULL = Math.PI / 4, VMAX = 1400, TAU = 0.09, LAG = 8, RING = 16, STROKE = 1.25, NEAR = 0.3;

export function createHover(o) {
  const { canvas, xs, ys, zs, cell, dpr, cd, sizeOf, mask } = o, n = xs.length, ctx = canvas.getContext('2d'), FG = o.fg || '#F2F0EB';
  let ox = 1e9, oy = 1e9; for (let i = 0; i < n; i++) { if (xs[i] < ox) ox = xs[i]; if (ys[i] < oy) oy = ys[i]; }
  const hist = new Float32Array(RING), PAD = Math.ceil(cd * 1.8) + 2, lw = Math.max(1, STROKE * dpr);
  let gc = 0, gr = 0, grid = null, rest = null, k = null, tg = null, inAct = null, fl = null, act = null, actN = 0, forced = [];
  let px = 0, py = 0, on = false, last = 0, calls = 0, lpx = 0, lpy = 0, hasL = false, vs = 0, sgn = 1, ang = 0, head = 0, still = RING, bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;

  function build() {
    let mx = 0, my = 0; for (let i = 0; i < n; i++) { if (xs[i] > mx) mx = xs[i]; if (ys[i] > my) my = ys[i]; }
    gc = Math.round((mx - ox) / cell) + 1; gr = Math.round((my - oy) / cell) + 1; grid = new Int32Array(gc * gr).fill(-1);
    for (let i = 0; i < n; i++) grid[Math.round((ys[i] - oy) / cell) * gc + Math.round((xs[i] - ox) / cell)] = i;
    k = new Float32Array(n); tg = new Float32Array(n); inAct = new Uint8Array(n); fl = new Uint8Array(n); act = new Int32Array(n); actN = 0;
    if (mask) return;   /* the footer's text is DOM; the canvas only masks it out under the pointer and draws the glyphs */
    rest = document.createElement('canvas'); rest.width = canvas.width; rest.height = canvas.height;
    const c = rest.getContext('2d'); c.fillStyle = FG; c.beginPath();
    for (let i = 0; i < n; i++) { const z = cd * zs[i], q = (cd - z) / 2; c.rect(Math.round(xs[i] * dpr) + q, Math.round(ys[i] * dpr) + q, z, z); }
    c.fill();
  }
  /* the whole canvas from the resting bitmap (the caller takes over from another drawing) */
  function full() {
    if (!grid) build();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); if (rest) ctx.drawImage(rest, 0, 0);
    for (let q = 0; q < actN; q++) { k[act[q]] = 0; inAct[act[q]] = 0; } actN = 0;
  }
  function box(i) {
    const ix = Math.round(xs[i] * dpr), iy = Math.round(ys[i] * dpr);
    if (ix - PAD < bx0) bx0 = ix - PAD; if (iy - PAD < by0) by0 = iy - PAD; if (ix + cd + PAD > bx1) bx1 = ix + cd + PAD; if (iy + cd + PAD > by1) by1 = iy + cd + PAD;
  }

  return {
    get calls() { return calls; },
    full,
    move(x, y) { px = x; py = y; on = true; },
    leave() { on = false; },
    force(i) { if (!fl) build(); if (!fl[i]) { fl[i] = 1; forced.push(i); } },
    step(now) {
      if (!grid) build();
      const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.033); last = now; calls = 0;

      /* the pointer's velocity, once per frame: smoothed speed sets how far toward × the plus turns, its horizontal sign which way */
      if (on) {
        if (hasL) { const vx = (px - lpx) / dt, vy = (py - lpy) / dt, sp = Math.sqrt(vx * vx + vy * vy); vs += (sp - vs) * (1 - Math.exp(-dt / 0.06)); if (vx > 40) sgn = 1; else if (vx < -40) sgn = -1; }
        lpx = px; lpy = py; hasL = true;
      } else { hasL = false; vs *= Math.exp(-dt / 0.06); }
      if (vs < 8) vs = 0;
      const want = sgn * FULL * Math.min(1, vs / VMAX), prev = ang;
      ang += (want - ang) * (1 - Math.exp(-dt / TAU)); if (Math.abs(want - ang) < 0.002) ang = want;
      head = (head + 1) & (RING - 1); hist[head] = ang;
      still = ang !== prev ? 0 : still + 1;

      for (let q = 0; q < actN; q++) tg[act[q]] = 0;
      if (on) {
        const r0 = Math.max(0, Math.floor((py - R - oy) / cell)), r1 = Math.min(gr - 1, Math.ceil((py + R - oy) / cell)), c0 = Math.max(0, Math.floor((px - R - ox) / cell)), c1 = Math.min(gc - 1, Math.ceil((px + R - ox) / cell));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = grid[r * gc + c]; if (i < 0) continue;
          const dx = xs[i] + cell / 2 - px, dy = ys[i] + cell / 2 - py, d2 = dx * dx + dy * dy; if (d2 >= R * R) continue;
          tg[i] = 1;
          if (!inAct[i]) { inAct[i] = 1; k[i] = 0; act[actN++] = i; }
        }
      }
      const a = 1 - Math.exp(-dt / RISE); let changed = false; bx0 = 1e9; by0 = 1e9; bx1 = -1e9; by1 = -1e9;
      for (let q = 0; q < actN; q++) {
        const i = act[q], old = k[i]; let v = old;
        if (tg[i] > old) { v = old + (tg[i] - old) * a; if (tg[i] - v < 0.003) v = tg[i]; } else if (tg[i] < old) v = Math.max(tg[i], old - dt / BACK);
        if (v !== old) { k[i] = v; changed = true; box(i); } else if (still < RING && v > 0) { changed = true; box(i); }
      }
      const nf = forced.length;
      for (let q = 0; q < nf; q++) { const i = forced[q]; box(i); if (!inAct[i]) { inAct[i] = 1; k[i] = 0; tg[i] = 0; act[actN++] = i; } }
      if (!changed && !nf) return false;
      const ux = Math.max(0, bx0), uy = Math.max(0, by0), uw = Math.min(canvas.width, bx1) - ux, uh = Math.min(canvas.height, by1) - uy;
      /* cells back at rest and not forced leave the list; the resting bitmap already has them at full size */
      let m = 0; for (let q = 0; q < actN; q++) { const i = act[q]; if (k[i] > 0 || fl[i]) act[m++] = i; else inAct[i] = 0; }
      actN = m;
      if (uw > 0 && uh > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(ux, uy, uw, uh); calls++; if (rest) { ctx.drawImage(rest, ux, uy, uw, uh, ux, uy, uw, uh); calls++; }
        const ex = ux + uw, ey = uy + uh, ext = cd * 1.8;
        if (rest) {
        /* erase every active cell's resting square in the dirty rect (one path, one fill) ... */
        ctx.beginPath();
        for (let q = 0; q < actN; q++) { const i = act[q], ix = Math.round(xs[i] * dpr), iy = Math.round(ys[i] * dpr); if (ix + cd + ext <= ux || iy + cd + ext <= uy || ix - ext >= ex || iy - ext >= ey) continue; ctx.rect(ix, iy, cd, cd); }
        ctx.globalCompositeOperation = 'destination-out'; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = FG;
        /* ... the squares still shrinking away (one fill) ... */
        ctx.beginPath();
        for (let q = 0; q < actN; q++) {
          const i = act[q], ix = Math.round(xs[i] * dpr), iy = Math.round(ys[i] * dpr);
          if (ix + cd + ext <= ux || iy + cd + ext <= uy || ix - ext >= ex || iy - ext >= ey) continue;
          const s = cd * (sizeOf ? sizeOf(i, zs[i]) : zs[i]) * (1 - k[i]);
          if (s > 0.4) ctx.rect(ix + (cd - s) / 2, iy + (cd - s) / 2, s, s);
        }
        ctx.fill();
        } else {
          /* footer: a cell mostly turned into a plus hides the DOM text under it with the page colour (one fill) */
          ctx.fillStyle = mask; ctx.beginPath();
          for (let q = 0; q < actN; q++) { const i = act[q]; if (k[i] < 0.3) continue; const ix = Math.round(xs[i] * dpr), iy = Math.round(ys[i] * dpr); if (ix + cd + ext <= ux || iy + cd + ext <= uy || ix - ext >= ex || iy - ext >= ey) continue; ctx.rect(ix, iy, cd, cd); }
          ctx.fill(); ctx.fillStyle = FG;
        }
        /* ... and every plus in one path, stroked once */
        ctx.beginPath(); let any = false;
        for (let q = 0; q < actN; q++) {
          const i = act[q], ki = k[i]; if (ki <= 0) continue;
          const ix = Math.round(xs[i] * dpr), iy = Math.round(ys[i] * dpr);
          if (ix + cd + ext <= ux || iy + cd + ext <= uy || ix - ext >= ex || iy - ext >= ey) continue;
          const cx = ix + cd / 2, cy = iy + cd / 2, dx = xs[i] + cell / 2 - px, dy = ys[i] + cell / 2 - py, f = Math.min(1, Math.sqrt(dx * dx + dy * dy) / R);
          const z = sizeOf ? sizeOf(i, zs[i]) : zs[i]; if (z < 0.2) continue;
          const L = cd * (0.55 + 0.75 * z) * ki * (1 + NEAR * (1 - f) * (1 - f));
          const t = hist[(head - Math.round(f * LAG)) & (RING - 1)], ca = Math.cos(t) * L, sa = Math.sin(t) * L;
          ctx.moveTo(cx - ca, cy - sa); ctx.lineTo(cx + ca, cy + sa); ctx.moveTo(cx + sa, cy - ca); ctx.lineTo(cx - sa, cy + ca); any = true;
        }
        if (any) { ctx.strokeStyle = FG; ctx.lineWidth = lw; ctx.lineCap = 'butt'; ctx.stroke(); }
        calls += 3 + (any ? 1 : 0);
      }
      for (let q = 0; q < nf; q++) fl[forced[q]] = 0; forced.length = 0;
      return changed || nf > 0;
    },
  };
}
