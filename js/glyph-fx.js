/* The pointer effect, kept small: squares within R of the pointer swap to one glyph (x for bright cells, a dot for dark ones), a little
   larger and pushed out by at most one cell; when the pointer leaves they ease back over ~250 ms. One shared ease value per cell
   (set from its distance, decayed over time), an active list of only the cells that are not at rest, and dirty-rect redraws over a
   bitmap of the resting field. step() says whether anything is still moving; the caller stops its rAF loop when it says no. */
const smooth = v => v * v * (3 - 2 * v);

export function createFx(o) {
  const { canvas, xs, ys, zs, tone, cell, dpr, cd, R: R0 = 90, Rt = 70, sizeOf } = o, n = xs.length;
  const FG = o.fg || '#F2F0EB', mg = Math.ceil(cd * 2.2);
  let ox = 1e9, oy = 1e9; for (let i = 0; i < n; i++) { if (xs[i] < ox) ox = xs[i]; if (ys[i] < oy) oy = ys[i]; }
  let gc = 0, gr = 0, grid = null, rest = null, e = null, eOld = null, inForce = null, dirx = null, diry = null, inAct = null, act = null, actN = 0, prev = null;
  let px = 0, py = 0, on = false, touch = false, moved = false, last = 0, forced = [], calls = 0;
  const ctx = canvas.getContext('2d');

  function build() {
    let mx = 0, my = 0; for (let i = 0; i < n; i++) { if (xs[i] > mx) mx = xs[i]; if (ys[i] > my) my = ys[i]; }
    gc = Math.round((mx - ox) / cell) + 1; gr = Math.round((my - oy) / cell) + 1; grid = new Int32Array(gc * gr).fill(-1);
    for (let i = 0; i < n; i++) grid[Math.round((ys[i] - oy) / cell) * gc + Math.round((xs[i] - ox) / cell)] = i;
    e = new Float32Array(n); eOld = new Float32Array(n); inForce = new Uint8Array(n); dirx = new Float32Array(n); diry = new Float32Array(n); inAct = new Uint8Array(n); act = new Int32Array(n); actN = 0; prev = null;
    if (!rest) rest = document.createElement('canvas'); rest.width = canvas.width; rest.height = canvas.height;
    const c = rest.getContext('2d'); c.fillStyle = FG; c.beginPath();
    for (let i = 0; i < n; i++) { const z = cd * zs[i], q = (cd - z) / 2; c.rect(Math.round(xs[i] * dpr) + q, Math.round(ys[i] * dpr) + q, z, z); }
    c.fill();
  }
  /* the whole canvas from the resting bitmap (the caller takes over from another drawing) */
  function full() { if (!grid) build(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(rest, 0, 0); prev = null; actN = 0; inAct.fill(0); e.fill(0); }

  return {
    get on() { return on; }, get calls() { return calls; },
    build: () => { grid = null; },
    full,
    move(x, y, isTouch) { px = x; py = y; on = true; touch = !!isTouch; moved = true; },
    leave() { on = false; moved = true; },
    force(i) { forced.push(i); },
    step(now) {
      if (!grid) build();
      const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.033); last = now; calls = 0;
      const R = touch ? Rt : R0, nf = forced.length;
      let changed = false;
      /* decay everything not at rest, then lift the cells inside the radius to their distance value */
      for (let q = 0; q < actN; q++) { const i = act[q]; eOld[i] = e[i]; if (e[i] > 0) e[i] = Math.max(0, e[i] - dt * 4); }
      if (on) {
        const r0 = Math.max(0, Math.floor((py - R - oy) / cell)), r1 = Math.min(gr - 1, Math.ceil((py + R - oy) / cell)), c0 = Math.max(0, Math.floor((px - R - ox) / cell)), c1 = Math.min(gc - 1, Math.ceil((px + R - ox) / cell));
        for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
          const i = grid[rr * gc + cc]; if (i < 0) continue;
          const dx = xs[i] + cell / 2 - px, dy = ys[i] + cell / 2 - py, d2 = dx * dx + dy * dy; if (d2 >= R * R) continue;
          const d = Math.sqrt(d2), f = smooth(1 - d / R); if (f > e[i]) e[i] = f;
          const l = d + 0.001; dirx[i] = dx / l; diry[i] = dy / l;
          if (!inAct[i]) { inAct[i] = 1; eOld[i] = 0; act[actN++] = i; }
        }
      }
      moved = false;
      for (let q = 0; q < actN; q++) { const i = act[q]; if (Math.abs(e[i] - eOld[i]) > 0.002) { changed = true; break; } }
      if (!changed && !nf) { if (!actN && prev) { /* fall through: restore the last rect */ } else return false; }
      /* the set to draw: active cells plus forced ones (the caller's own size, e.g. a blink) */
      for (let q = 0; q < nf; q++) { const i = forced[q]; inForce[i] = 1; if (!inAct[i]) { inAct[i] = 1; act[actN++] = i; } }
      const erase = new Path2D(), sqs = new Path2D(), lines = new Path2D(), fills = new Path2D(); let hasL = false, hasF = false, hasS = false;
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9, k2 = 0; const lw = Math.max(1, cd * 0.2), half = cd * 0.42;
      for (let q = 0; q < actN; q++) {
        const i = act[q], ev = e[i], isF = inForce[i] === 1;
        if (ev <= 0 && !isF) { inAct[i] = 0; continue; }
        act[k2++] = i;
        const ix = Math.round(xs[i] * dpr), iy = Math.round(ys[i] * dpr);
        erase.rect(ix - 1, iy - 1, cd + 2, cd + 2);
        if (ix - mg < bx0) bx0 = ix - mg; if (iy - mg < by0) by0 = iy - mg; if (ix + cd + mg > bx1) bx1 = ix + cd + mg; if (iy + cd + mg > by1) by1 = iy + cd + mg;
        const z0 = sizeOf ? sizeOf(i, zs[i]) : zs[i];
        if (ev < 0.001) { const s = cd * z0, g = (cd - s) / 2; if (s > 0.4) { sqs.rect(ix + g, iy + g, s, s); hasS = true; } continue; }
        const cx = ix + cd / 2 + dirx[i] * ev * cd, cy = iy + cd / 2 + diry[i] * ev * cd;
        if (ev < 0.3) { const s = cd * z0 * (1 - ev * 2.8); if (s > 0.4) { sqs.rect(cx - s / 2, cy - s / 2, s, s); hasS = true; } continue; }
        const hh = half * (0.85 + 0.5 * ev);
        if (tone[i] > 0.5) { lines.moveTo(cx - hh, cy - hh); lines.lineTo(cx + hh, cy + hh); lines.moveTo(cx + hh, cy - hh); lines.lineTo(cx - hh, cy + hh); hasL = true; }
        else { const r = hh * 0.5; fills.moveTo(cx + r, cy); fills.arc(cx, cy, r, 0, 6.2832); hasF = true; }
      }
      actN = k2; for (let q = 0; q < nf; q++) inForce[forced[q]] = 0; forced = [];
      const cur = bx0 < bx1 ? [Math.max(0, bx0), Math.max(0, by0), Math.min(canvas.width, bx1), Math.min(canvas.height, by1)] : null;
      const U = prev && cur ? [Math.min(prev[0], cur[0]), Math.min(prev[1], cur[1]), Math.max(prev[2], cur[2]), Math.max(prev[3], cur[3])] : (cur || prev);
      prev = cur;
      if (U) {
        const ux = Math.floor(U[0]), uy = Math.floor(U[1]), uw = Math.ceil(U[2]) - ux, uh = Math.ceil(U[3]) - uy;
        if (uw > 0 && uh > 0) {
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(ux, uy, uw, uh); ctx.drawImage(rest, ux, uy, uw, uh, ux, uy, uw, uh); calls += 2;
          if (actN) { ctx.globalCompositeOperation = 'destination-out'; ctx.fill(erase); ctx.globalCompositeOperation = 'source-over'; calls++; }
          ctx.fillStyle = FG; ctx.strokeStyle = FG; ctx.lineWidth = lw; ctx.lineCap = 'round';
          if (hasS) { ctx.fill(sqs); calls++; } if (hasF) { ctx.fill(fills); calls++; } if (hasL) { ctx.stroke(lines); calls++; }
        }
      }
      return changed && actN > 0 || nf > 0;
    },
  };
}
