/* The footer headline's mouse effect: the same createHover as the hero (one module, one set of weight rules). The headline stays real DOM text;
   while the footer is in view a canvas the size of the <h2> is laid over it, with the words rasterised once into a grid of cells (the same cell
   size as the hero) from the text's own font and position. Under the pointer those cells hide the crisp text with the page colour and show the
   thin "+" -> "x" glyphs, then ease back to text over ~250 ms. Mouse/pen only, never reduced motion; the canvas, its listener and its loop
   exist only while the footer is on screen, and the raster is redone on resize and when fonts load. */
import { createHover } from './hover.js?v=574a5883';

const CELL = 3, h2 = document.getElementById('h-close');
const root = document.documentElement;
const fine = matchMedia('(hover: hover) and (pointer: fine)'), rm = matchMedia('(prefers-reduced-motion: reduce)');

if (h2 && 'IntersectionObserver' in window) {
  let cv = null, fx = null, vis = false, dirty = true, running = false, raf = 0, cx = 0, cy = 0, inside = false, rt = 0, ox = 0, oy = 0;

  function raster() {
    const r = h2.getBoundingClientRect(), W = Math.ceil(r.width), H = Math.ceil(r.height), cs = getComputedStyle(h2), dpr = window.devicePixelRatio || 1;
    const off = document.createElement('canvas'); off.width = W; off.height = H; const c = off.getContext('2d', { willReadFrequently: true });
    c.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; c.fillStyle = '#000'; c.textBaseline = 'alphabetic';
    if ('letterSpacing' in c) c.letterSpacing = cs.letterSpacing;
    const node = h2.firstChild, t = node ? node.nodeValue : '', rg = document.createRange(), re = /\S+/g; let m;
    while ((m = re.exec(t))) {
      rg.setStart(node, m.index); rg.setEnd(node, m.index + m[0].length); const q = rg.getClientRects()[0]; if (!q) continue;
      const mt = c.measureText(m[0]); c.fillText(m[0], q.left - r.left, q.top - r.top + (mt.fontBoundingBoxAscent || q.height * 0.8));
    }
    const d = c.getImageData(0, 0, W, H).data, cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), xs = [], ys = [], zs = [];
    for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
      let s = 0, n = 0;
      for (let y = rr * CELL; y < Math.min(H, rr * CELL + CELL); y++) for (let x = cc * CELL; x < Math.min(W, cc * CELL + CELL); x++) { s += d[(y * W + x) * 4 + 3]; n++; }
      const a = s / (255 * n); if (a < 0.04) continue;
      xs.push(cc * CELL); ys.push(rr * CELL); zs.push(a < 0.25 ? 0.1 : 0.4 + 0.6 * a);
    }
    if (!cv) { cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none'; h2.appendChild(cv); }
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    fx = createHover({ canvas: cv, xs: Float32Array.from(xs), ys: Float32Array.from(ys), zs: Float32Array.from(zs), cell: CELL, dpr, cd: Math.round(CELL * dpr), mask: getComputedStyle(root).getPropertyValue('--bg').trim() || '#0A0A0A', fg: getComputedStyle(h2).color });
    dirty = false;
  }
  function frame(now) {
    raf = 0; if (!vis || !fx) { running = false; return; }
    const r = cv.getBoundingClientRect(); if (inside) fx.move(cx - r.left, cy - r.top); else fx.leave();   /* one layout read per animating frame, never on pointermove */
    if (fx.step(now)) raf = requestAnimationFrame(frame); else running = false;
  }
  function wake() { if (!running && vis && fx) { running = true; raf = requestAnimationFrame(frame); } }
  function onMove(e) { if (e.pointerType === 'touch') return; cx = e.clientX; cy = e.clientY; inside = true; wake(); }
  function onAway() { inside = false; wake(); }
  function on() { if (vis || rm.matches || !fine.matches) return; vis = true; if (dirty || !fx) raster(); addEventListener('pointermove', onMove, { passive: true }); document.addEventListener('pointerleave', onAway); addEventListener('blur', onAway); }
  function off() { if (!vis) return; vis = false; cancelAnimationFrame(raf); running = false; removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onAway); removeEventListener('blur', onAway); if (cv) { cv.remove(); cv = null; } fx = null; dirty = true; }
  new IntersectionObserver(es => { for (const e of es) { if (e.isIntersecting) on(); else off(); } }, { rootMargin: '120px' }).observe(h2);
  const redo = () => { clearTimeout(rt); rt = setTimeout(() => { if (vis) { off(); on(); } else dirty = true; }, 150); };
  addEventListener('resize', redo); if (document.fonts) { document.fonts.addEventListener('loadingdone', redo); }
}
