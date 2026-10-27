/* The mouse effect, and nothing else: squares within R px of the pointer shrink toward MIN of their size (the nearer, the smaller) and ease
   back in ~200 ms once it moves away. The resting field is kept as a bitmap; only the cells inside the radius (plus those still easing back)
   are tracked, only their dirty rect is redrawn, and step() says false when nothing changed so the caller stops its rAF loop. */
const R = 80, MIN = 0.35, BACK = 0.2, RISE = 0.05;
const smooth = v => v * v * (3 - 2 * v);

export function createHover(o) {
  const { canvas, xs, ys, zs, cell, dpr, cd, sizeOf } = o, n = xs.length, ctx = canvas.getContext('2d'), FG = '#F2F0EB';
  let ox = 1e9, oy = 1e9; for (let i = 0; i < n; i++) { if (xs[i] < ox) ox = xs[i]; if (ys[i] < oy) oy = ys[i]; }
  let gc = 0, gr = 0, grid = null, rest = null, k = null, tg = null, inAct = null, act = null, actN = 0, forced = [], px = 0, py = 0, on = false, last = 0, calls = 0;

  function build() {
    let mx = 0, my = 0; for (let i = 0; i < n; i++) { if (xs[i] > mx) mx = xs[i]; if (ys[i] > my) my = ys[i]; }
    gc = Math.round((mx - ox) / cell) + 1; gr = Math.round((my - oy) / cell) + 1; grid = new Int32Array(gc * gr).fill(-1);
    for (let i = 0; i < n; i++) grid[Math.round((ys[i] - oy) / cell) * gc + Math.round((xs[i] - ox) / cell)] = i;
    k = new Float32Array(n); tg = new Float32Array(n); inAct = new Uint8Array(n); act = new Int32Array(n); actN = 0;
    rest = document.createElement('canvas'); rest.width = canvas.width; rest.height = canvas.height;
    const c = rest.getContext('2d'); c.fillStyle = FG; c.beginPath();
    for (let i = 0; i < n; i++) { const z = cd * zs[i], q = (cd - z) / 2; c.rect(Math.round(xs[i] * dpr) + q, Math.round(ys[i] * dpr) + q, z, z); }
    c.fill();
  }
  /* the whole canvas from the resting bitmap (the caller takes over from another drawing) */
  function full() {
    if (!grid) build();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(rest, 0, 0);
    for (let q = 0; q < actN; q++) { k[act[q]] = 0; inAct[act[q]] = 0; } actN = 0;
  }

  return {
    get calls() { return calls; },
    full,
    move(x, y) { px = x; py = y; on = true; },
    leave() { on = false; },
    force(i) { forced.push(i); },
    step(now) {
      if (!grid) build();
      const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.033); last = now; calls = 0;
      for (let q = 0; q < actN; q++) tg[act[q]] = 0;
      if (on) {
        const r0 = Math.max(0, Math.floor((py - R - oy) / cell)), r1 = Math.min(gr - 1, Math.ceil((py + R - oy) / cell)), c0 = Math.max(0, Math.floor((px - R - ox) / cell)), c1 = Math.min(gc - 1, Math.ceil((px + R - ox) / cell));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = grid[r * gc + c]; if (i < 0) continue;
          const dx = xs[i] + cell / 2 - px, dy = ys[i] + cell / 2 - py, d2 = dx * dx + dy * dy; if (d2 >= R * R) continue;
          tg[i] = smooth(1 - Math.sqrt(d2) / R);
          if (!inAct[i]) { inAct[i] = 1; k[i] = 0; act[actN++] = i; }
        }
      }
      const a = 1 - Math.exp(-dt / RISE); let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9, changed = false;
      const box = i => { const ix = Math.round(xs[i] * dpr), iy = Math.round(ys[i] * dpr); if (ix < bx0) bx0 = ix; if (iy < by0) by0 = iy; if (ix + cd > bx1) bx1 = ix + cd; if (iy + cd > by1) by1 = iy + cd; };
      for (let q = 0; q < actN; q++) {
        const i = act[q], old = k[i]; let v = old;
        if (tg[i] > old) { v = old + (tg[i] - old) * a; if (tg[i] - v < 0.003) v = tg[i]; } else if (tg[i] < old) v = Math.max(tg[i], old - dt / BACK);
        if (v !== old) { k[i] = v; changed = true; box(i); }
      }
      const nf = forced.length;
      for (let q = 0; q < nf; q++) { const i = forced[q]; box(i); if (!inAct[i]) { inAct[i] = 1; k[i] = 0; tg[i] = 0; act[actN++] = i; } }
      if (!changed && !nf) return false;
      const ux = Math.max(0, bx0), uy = Math.max(0, by0), uw = Math.min(canvas.width, bx1) - ux, uh = Math.min(canvas.height, by1) - uy;
      /* cells back at rest and not forced leave the list; the resting bitmap already has them at full size */
      const fset = nf ? new Set(forced) : null; let m = 0;
      for (let q = 0; q < actN; q++) { const i = act[q]; if (k[i] > 0 || (fset && fset.has(i))) act[m++] = i; else inAct[i] = 0; }
      actN = m; forced = [];
      if (uw > 0 && uh > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(ux, uy, uw, uh); ctx.drawImage(rest, ux, uy, uw, uh, ux, uy, uw, uh); calls += 2;
        const erase = new Path2D(), sq = new Path2D();
        for (let q = 0; q < actN; q++) {
          const i = act[q], ix = Math.round(xs[i] * dpr), iy = Math.round(ys[i] * dpr);
          if (ix + cd <= ux || iy + cd <= uy || ix >= ux + uw || iy >= uy + uh) continue;
          erase.rect(ix, iy, cd, cd);
          const s = cd * (sizeOf ? sizeOf(i, zs[i]) : zs[i]) * (1 - (1 - MIN) * k[i]);
          if (s > 0.4) sq.rect(ix + (cd - s) / 2, iy + (cd - s) / 2, s, s);
        }
        ctx.globalCompositeOperation = 'destination-out'; ctx.fill(erase); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = FG; ctx.fill(sq); calls += 2;
      }
      return changed || nf > 0;
    },
  };
}
