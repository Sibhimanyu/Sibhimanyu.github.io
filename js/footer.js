/* Footer: the page closes in the same 1-bit square material it opens with.
   - The headline is crisp text until the pointer comes near; then it is drawn as the hero's squares and the same light effect plays
     (glyphs within ~90 px, ease back in ~250 ms). Frames run only while something moves; the text returns when it has settled.
   - The pill's colour wipe is CSS only. Reduced motion: nothing here runs. */
import { heroCell, rasterText } from './portrait.js';
import { createFx } from './glyph-fx.js';

const root = document.documentElement;
if (!root.classList.contains('rm')) boot();

function boot() {
  const closing = document.querySelector('.closing'), h2 = document.getElementById('h-close'), cv = document.getElementById('fx-head');
  if (!closing || !h2 || !cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  /* ------------------------------------------------------------ headline */
  let fx = null, box = null, cell = 4, raf = 0, shown = false, R = 90;
  function build() {
    cell = heroCell(); const cs = getComputedStyle(h2), fs = parseFloat(cs.fontSize), ls = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, tn = h2.firstChild, words = [], txt = tn.textContent;
    const re = /\S+/g; let m; while ((m = re.exec(txt))) { const rg = document.createRange(); rg.setStart(tn, m.index); rg.setEnd(tn, m.index + m[0].length); const rc = rg.getClientRects()[0]; if (rc) words.push([m[0], Math.round(rc.top), rc]); }
    const lines = []; words.forEach(w => { const l = lines.find(x => x.top === w[1]); if (l) { l.t += ' ' + w[0]; l.r = Math.max(l.r, w[2].right); } else lines.push({ top: w[1], t: w[0], l: w[2].left, r: w[2].right, rt: w[2].top }); });
    const hr = h2.getBoundingClientRect(), cr = closing.getBoundingClientRect(), sy = scrollY, xs = [], ys = [];
    box = { x: hr.left - cr.left - R, y: hr.top - cr.top - R, w: hr.width + 2 * R, h: hr.height + 2 * R, vx: hr.left - R, vy: hr.top + sy - R };
    lines.forEach(l => { const base = l.rt + sy + fs * 0.969, c = rasterText(l.t, font, ls, l.l, base, fs, 'left', l.r - l.l + 6, cell); for (let i = 0; i < c.length; i += 2) { xs.push(c[i] * cell - box.vx); ys.push(c[i + 1] * cell - box.vy); } });
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr); cv.style.width = box.w + 'px'; cv.style.height = box.h + 'px'; cv.style.left = box.x + 'px'; cv.style.top = box.y + 'px';
    const cd = Math.max(2, Math.round(cell * dpr)), sq = Math.max(1, cd - Math.max(1, Math.round(0.6 * dpr)));
    fx = createFx({ canvas: cv, xs: Float32Array.from(xs), ys: Float32Array.from(ys), zs: new Float32Array(xs.length).fill(sq / cd), tone: Float32Array.from({ length: xs.length }, () => Math.random()), cell, dpr: cd / cell, cd, R, Rt: R });
  }
  function frame(now) {
    raf = 0; const busy = fx.step(now);
    if (busy) { raf = requestAnimationFrame(frame); return; }
    if (!fx.on) hide();
  }
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }
  function show() {
    if (!fx) build();
    if (shown) return; shown = true; cv.style.display = 'block'; h2.dataset.fx = '1'; fx.full();
  }
  function hide() { if (!shown) return; shown = false; cv.style.display = 'none'; h2.dataset.fx = ''; }
  closing.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const hr = h2.getBoundingClientRect(), near = e.clientX > hr.left - R && e.clientX < hr.right + R && e.clientY > hr.top - R && e.clientY < hr.bottom + R;
    if (near) { show(); fx.move(e.clientX - box.vx, e.clientY + scrollY - box.vy, false); wake(); } else if (shown) { fx.leave(); wake(); }
  });
  closing.addEventListener('pointerleave', () => { if (shown) { fx.leave(); wake(); } });
  const drop = () => { fx = null; if (shown) hide(); };
  addEventListener('resize', drop);
  document.fonts && document.fonts.addEventListener('loadingdone', drop);
  addEventListener('sq:layout', drop);
}
