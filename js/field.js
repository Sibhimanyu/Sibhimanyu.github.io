/* One persistent WebGL particle field behind the whole page.
   hero name -> 8 project screenshots (with a divider phrase) -> 8 index dots -> quiet drift.
   Everything is a progress value P: integer = a formed target, fraction = the scatter between two. */
import * as THREE from 'three';

const root = document.documentElement;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };

(async function main() {
  try {
    if (root.classList.contains('rm') || root.classList.contains('nogl')) return;
    if (!window.gsap || !window.ScrollTrigger) throw new Error('GSAP did not load');
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('No WebGL');
    await boot();
  } catch (err) {
    console.warn('[field] falling back to the plain page:', err && err.message);
    window.__sqFallback && window.__sqFallback();
  }
})();

async function boot() {
  const gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  /* ---------------- targets ----------------
     0 hero name | 1-5 first five projects | 6 divider phrase | 7-9 last three | 10 index dots | 11 drift */
  const NMAX = 100000, TN = 12;
  const KIND = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2];            // 1 = dots (offset by uDots), 2 = drift (sparse, loose)
  const projEls = $$('#work .proj');
  const PROJ_T = [1, 2, 3, 4, 5, 7, 8, 9];                        // project j -> target
  const T = new Array(TN).fill(null);
    const imgLoad = new Map();
  const loadImg = src => { if (!imgLoad.has(src)) imgLoad.set(src, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; })); return imgLoad.get(src); };

  let W = 0, H = 0, N = NMAX, mobile = false;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x0A0A0A, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);

  const geo = new THREE.BufferGeometry();
  const mk = (name, Type, size, norm = false) => { const a = new THREE.BufferAttribute(new Type(NMAX * size), size, norm); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  const aPA = mk('pA', Float32Array, 3), aPB = mk('pB', Float32Array, 3);
  const aCA = mk('cA', Uint8Array, 3, true), aCB = mk('cB', Uint8Array, 3, true);
  const rnd = new Float32Array(NMAX * 4), gi = new Float32Array(NMAX);
  for (let i = 0; i < NMAX * 4; i++) rnd[i] = Math.random();
  for (let i = 0; i < NMAX; i++) gi[i] = i % 8;
  geo.setAttribute('r', new THREE.BufferAttribute(rnd, 4));
  geo.setAttribute('gi', new THREE.BufferAttribute(gi, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NMAX * 3), 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const dotU = Array.from({ length: 8 }, () => new THREE.Vector2());
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      uF: { value: 0 }, uT: { value: 0 }, uVel: { value: 0 }, uDpr: { value: DPR }, uSize: { value: 2 }, uSc: { value: 1 },
      uPtr: { value: new THREE.Vector2(1e5, 1e5) }, uPtrK: { value: 0 },
      uDots: { value: dotU }, uKA: { value: 0 }, uKB: { value: 0 }, uAlpha: { value: 0.42 }, uShow: { value: 0 }, uOp: { value: 0 }, uWin: { value: new THREE.Vector4() }
    },
    vertexShader: `
      attribute vec3 pA, pB, cA, cB; attribute vec4 r; attribute float gi;
      uniform float uF, uT, uVel, uDpr, uSize, uSc, uPtrK, uKA, uKB, uAlpha, uShow, uOp; uniform vec4 uWin; uniform vec2 uPtr; uniform vec2 uDots[8];
      varying vec3 vC; varying float vA;
      void main(){
        float t = smoothstep(0., 1., clamp((uF - r.x*0.34)/0.66, 0., 1.));
        vec3 a = pA, b = pB;
        int g = int(gi + 0.5);
        if (uKA > 0.5 && uKA < 1.5) a.xy += uDots[g];
        if (uKB > 0.5 && uKB < 1.5) b.xy += uDots[g];
        vec3 pos = mix(a, b, t);
        vec3 col = mix(cA, cB, t);
        float m = sin(3.14159*t);
        // scatter: a drifting, swirling cloud between two forms
        float an = r.y*6.2831 + uT*0.25*(0.5+r.z);
        vec3 d = vec3(cos(an), sin(an*1.3 + r.w*6.), (r.z-0.5)*1.2);
        pos += d * m * (90. + 420.*r.z*r.w) * uSc;
        float sw = m*(r.y-0.5)*0.9;
        pos.xy = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * pos.xy;
        // idle breath
        pos.xy += vec2(sin(uT*0.7 + r.y*40.), cos(uT*0.6 + r.x*40.)) * (0.6 + m*2.);
        // drift field: sparse, slow, loose
        float dr = (uKA > 1.5 ? 1.-t : 0.) + (uKB > 1.5 ? t : 0.);
        pos.xy += vec2(sin(uT*0.23 + r.y*40.), cos(uT*0.19 + r.x*40.)) * 46. * dr;
        float vis = mix(uKA > 1.5 ? 1.-step(0.08, r.w) : 1., uKB > 1.5 ? 1.-step(0.08, r.w) : 1., t);
        // scroll-velocity turbulence
        float v = clamp(abs(uVel), 0., 1.);
        pos.xy += vec2(sin(uT*3. + r.x*50. + pos.y*0.02), cos(uT*2.6 + r.y*50. + pos.x*0.02)) * v * (14. + 60.*r.z) * uSc;
        // dust: one in eight lingers once the page is crisp, hanging faint along the open view's feathered edges
        float dust = (1. - step(0.5, gi)) * step(r.z, 0.3);
        if (dust > 0.5 && uOp > 0.) {
          // a thin scatter along the whole perimeter of the open view (never clumped at the corners), a little outside the edge
          float per = 2. * (uWin.z + uWin.w), u = fract(r.y * 7.13 + r.x) * per, off = (r.w - 0.35) * 26. * uSc;
          vec2 hw = uWin.zw * 0.5, ed;
          if (u < uWin.z) ed = vec2(u - hw.x, hw.y + off);
          else if (u < uWin.z + uWin.w) ed = vec2(hw.x + off, hw.y - (u - uWin.z));
          else if (u < 2. * uWin.z + uWin.w) ed = vec2(hw.x - (u - uWin.z - uWin.w), -hw.y - off);
          else ed = vec2(-hw.x - off, -hw.y + (u - 2. * uWin.z - uWin.w));
          ed += vec2(sin(uT*0.31 + r.y*40.), cos(uT*0.27 + r.x*40.)) * 6. * uSc;
          pos.xy = mix(pos.xy, uWin.xy + ed, smoothstep(0.5, 1., uOp));
        }
        // pointer repel
        vec2 dp = pos.xy - uPtr; float dl = length(dp) + 0.001;
        float f = exp(-dl*dl/(2.*85.*85.)) * uPtrK;
        pos.xy += dp/dl * f * (26. + 44.*r.z);
        pos.z += f*60.;
        vC = col; vA = (0.8 + 0.2*r.z) * vis * mix(1., uAlpha, dr) * (1. - smoothstep(0.55, 1., uShow) * (1. - dust * 0.2));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.);
        if (vis < 0.01) gl_Position = vec4(2., 2., 2., 1.);
        gl_PointSize = uSize * (0.75 + r.z*0.65 + m*0.3) * (1. - 0.2*dr) * uDpr;
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.12, d);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC, a*vA);
      }`
  });
  /* THROUGH THE LETTERS: a full-screen plane. The project's name, set huge, is a mask (uMask); the screenshot shows
     only inside the type, dissolving in through a noise threshold. uO opens it: the letters scale up about their centre
     until the whole window shows, a large borderless view whose edges feather into the page (light at the top so the
     site's own header survives, deep at the bottom). uImg* is the whole screenshot's rectangle, uWin* the part of it
     that shows; sliding the first under the second is the live scroll-through. */
  const planeMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uTex: { value: null }, uMask: { value: null }, uShow: { value: 0 }, uO: { value: 0 }, uS: { value: 1 }, uE: { value: 0 }, uScr: { value: 0 },
      uPx: { value: new THREE.Vector2(1, 1) }, uC: { value: new THREE.Vector2(.5, .5) },
      uImgC: { value: new THREE.Vector2() }, uImgS: { value: new THREE.Vector2(1, 1) },
      uWinC: { value: new THREE.Vector2() }, uWinS: { value: new THREE.Vector2(1, 1) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform sampler2D uTex, uMask; uniform float uShow, uO, uS, uE, uScr; uniform vec2 uPx, uC, uImgC, uImgS, uWinC, uWinS; varying vec2 vUv;
      float h(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ return vn(p)*0.55 + vn(p*2.1+7.3)*0.3 + vn(p*4.3+13.1)*0.15; }
      // one side's feather: 0 at the very edge, 1 past width w, the ramp bent by noise so no edge is a straight line
      float side(float d, float w, float nz){ float t = clamp(d / max(w, 0.5), 0., 1.); t = clamp(t + nz * 0.9 * sin(3.14159 * t), 0., 1.); return t*t*(3.-2.*t); }
      void main(){
        vec2 px = vUv * uPx;
        float m = texture2D(uMask, (vUv - uC) / uS + uC).r;                       // the letters, scaled about their centre
        float cover = max(m, smoothstep(0.6, 0.95, uO));                             // ...until the whole view is open
        vec2 q = (px - uImgC) / uImgS + 0.5;                                       // 0..1 across the screenshot, y up
        vec3 c = texture2D(uTex, q).rgb;
        // light pages must not read as blank letters: pull whites toward #E8E4DC, fully in the letters, a little when open
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, max(c, vec3(0.19, 0.188, 0.18)), 1. - uE);                         // a dark page must not vanish into the dark: lift the floor in the letters
        c = mix(vec3(lum), c, 1. + 0.4 * (1. - uE));                                // a little colour back into the letters
        c *= mix(vec3(1.), vec3(0.909, 0.894, 0.863), smoothstep(0.55, 0.95, lum) * mix(1., 0.45, uE));
        // the window: noise-bent feather, light on top and sides, deep at the bottom
        vec2 wp = px - uWinC + uWinS * 0.5;                                        // px inside the window, y up
        float nz = fbm(px / 190. + 3.7) - 0.5;
        float fw = uE * uE * uWinS.x;
        float wt = fw * mix(0.05, 0.16, uScr), wb = uWinS.y * 0.2 * uE * uE, ws = fw * 0.2 * mix(1., 0.32, 1. - smoothstep(0.07 * uImgS.x, 0.15 * uImgS.x, (1. - q.y) * uImgS.y));   // softer sides beside the page's own header
        float f = side(wp.x, ws, nz * 0.45) * side(uWinS.x - wp.x, ws, nz * 0.5) * side(uWinS.y - wp.y, wt, nz * 0.5) * side(wp.y, wb, nz * 0.7);
        vec2 uvw = wp / uWinS - 0.5;
        float rr = length(uvw * vec2(1.7, uvw.y < 0. ? 2. : 0.9));                 // rounded below, nearly square above (the header lives there)
        f *= mix(1., 1. - smoothstep(0.9, 1.4, rr + nz * 0.3), uE);
        f *= step(0., q.x) * step(q.x, 1.) * step(0., q.y) * step(q.y, 1.);
        float n = clamp((fbm(px / 30.) - 0.2) / 0.6, 0., 1.);
        float x = mix(-0.08, 1.08, uShow) - n;                                     // >0 = revealed
        float a = smoothstep(0., 0.012, x);
        float edge = (1. - smoothstep(0., 0.05, abs(x - 0.02))) * step(uShow, 0.985) * step(0.01, uShow);
        c = mix(c, vec3(1., 0.302, 0.122), edge);                                   // accent glow where it breaks up
        a = max(a, edge * 0.95);
        if (uShow > 0.995) a = 1.;
        c *= mix(1., mix(0.62, 1., f), uE);                                          // the page dims as it thins: no bright rim
        gl_FragColor = vec4(c, a * cover * f);
      }`
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), planeMat);
  plane.frustumCulled = false; plane.renderOrder = 2; plane.visible = false;
  const texCache = new Map();
  function texFor(img) { if (!texCache.has(img.src)) { const t = new THREE.Texture(img); t.anisotropy = 8; t.needsUpdate = true; renderer.initTexture(t); texCache.set(img.src, t); } return texCache.get(img.src); }
  const planeInfo = [];   // per project: { tex, R, v0 }
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points); scene.add(plane);

  /* ---------------- layout + sampling ---------------- */
  function layoutNow() {
    W = innerWidth; H = innerHeight; mobile = W <= 760;
    N = mobile ? 30000 : NMAX;
    renderer.setSize(W, H, false);
    camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2; camera.updateProjectionMatrix();
    mat.uniforms.uSize.value = mobile ? 1.7 : (W > 1800 ? 2.3 : 2.05);
    mat.uniforms.uSc.value = clamp(W / 1440, 0.4, 1.25);
    geo.setDrawRange(0, N);
    const top = Math.max(76, H * 0.1), avail = H * 0.46;
    root.style.setProperty('--imgb', Math.round(top + avail) + 'px');
    return { top, avail };
  }
  let L = null;

  const newT = () => ({ pos: new Float32Array(N * 3), col: new Uint8Array(N * 3) });
  const grey = (c, g) => Math.min(255, Math.round(c * g));

  function sampleText(lines, { frac, maxFs, cy = 0.5 }) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    const font = fs => `600 ${fs}px "Inter Tight", system-ui, sans-serif`;
    x.font = font(100); x.letterSpacing = '-3.5px';
    const wMax = Math.max(...lines.map(l => x.measureText(l).width));
    const fs = Math.min(100 * frac * W / wMax, maxFs);
    x.font = font(fs); x.letterSpacing = `${-fs * 0.035}px`;
    x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
    const lh = fs * 1.06, y0 = H * cy - lh * (lines.length - 1) / 2 + fs * 0.26;
    lines.forEach((l, i) => x.fillText(l, W / 2, y0 + i * lh));
    const d = x.getImageData(0, 0, W, H).data, idx = [];
    for (let i = 0; i < W * H; i++) if (d[i * 4] > 128) idx.push(i);
    if (!idx.length) throw new Error('empty text sample');
    const t = newT();
    for (let i = 0; i < N; i++) {
      const p = idx[(Math.random() * idx.length) | 0];
      t.pos[i * 3] = (p % W) + Math.random() - W / 2; t.pos[i * 3 + 1] = H / 2 - ((p / W) | 0) - Math.random(); t.pos[i * 3 + 2] = (Math.random() - .5) * 8;
      const g = 0.9 + Math.random() * 0.1;
      t.col[i * 3] = grey(242, g); t.col[i * 3 + 1] = grey(240, g); t.col[i * 3 + 2] = grey(235, g);
    }
    return t;
  }

  function sampleDots() {
    const t = newT();
    for (let i = 0; i < N; i++) {
      const g = (Math.random() + Math.random() + Math.random() - 1.5);
      const a = Math.random() * 6.2832, rr = Math.abs(g) * 20;
      t.pos[i * 3] = Math.cos(a) * rr; t.pos[i * 3 + 1] = Math.sin(a) * rr; t.pos[i * 3 + 2] = (Math.random() - .5) * 6;
      const k = 0.85 + Math.random() * 0.15;
      t.col[i * 3] = grey(242, k); t.col[i * 3 + 1] = grey(240, k); t.col[i * 3 + 2] = grey(235, k);
    }
    return t;
  }

  function sampleDrift() {
    const t = newT();
    for (let i = 0; i < N; i++) {
      t.pos[i * 3] = (Math.random() - .5) * W * 1.05; t.pos[i * 3 + 1] = (Math.random() - .5) * H * 1.05; t.pos[i * 3 + 2] = (Math.random() - .5) * 200;
      const k = 0.55 + Math.random() * 0.35;
      t.col[i * 3] = grey(242, k); t.col[i * 3 + 1] = grey(240, k); t.col[i * 3 + 2] = grey(235, k);
    }
    return t;
  }

  const nameLines = name => {
    if (name === 'Abhishri Academy') return ['ABHISHRI', 'ACADEMY'];
    return [name.toUpperCase()];
  };

  /* Where in the picture the letters look. A light page is mostly white, so the window the letters show (a band as tall
     as the letters) is the one with the most colour and detail: per row of a small copy, saturation plus local contrast,
     discounted where the row is near-white, and the best band wins. Returns the band's centre, 0..1 down the image. */
  const focusCache = new Map();
  function focusFor(img, band, wide) {
    if (focusCache.has(img.src + band.toFixed(3))) return focusCache.get(img.src + band.toFixed(3));
    const cw = 96, ch = Math.max(8, Math.round(cw * img.naturalHeight / img.naturalWidth));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, cw, ch);
    const d = x.getImageData(0, 0, cw, ch).data, row = new Float32Array(ch);
    for (let y = 0; y < ch; y++) {
      let sat = 0, con = 0, lum = 0;
      for (let xx = 0; xx < cw; xx++) {
        const o = (y * cw + xx) * 4, r = d[o] / 255, g = d[o + 1] / 255, b = d[o + 2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sat += mx > 0.05 ? (mx - mn) / mx : 0; lum += l;
        if (xx) { const o2 = o - 4; con += Math.abs(l - (0.2126 * d[o2] + 0.7152 * d[o2 + 1] + 0.0722 * d[o2 + 2]) / 255); }
      }
      lum /= cw;
      row[y] = (sat / cw * 0.3 + con / cw * 3) * (1 - 0.75 * clamp((lum - 0.6) / 0.35));
    }
    const win = Math.max(2, Math.min(ch, Math.round(band * ch)));
    let best = 0, bs = -1, sum = 0;
    for (let y = 0; y < ch; y++) { sum += row[y]; if (y >= win) sum -= row[y - win]; if (y >= win - 1 && sum > bs) { bs = sum; best = y - win + 1; } }
    const fy = clamp((best + win / 2) / ch, band / 2, 1 - band / 2);
    focusCache.set(img.src + band.toFixed(3), fy);
    return fy;
  }

  /* a project's copy block at the phone's width, measured off-screen under the same rules the live page uses */
  function copyHeight(el) {
    const w = document.createElement('div'); w.className = 'gl'; w.style.cssText = 'position:fixed;left:0;top:0;width:' + W + 'px;visibility:hidden;pointer-events:none';
    const c = $('.copy', el).cloneNode(true); c.style.cssText = 'position:static;'; w.appendChild(c); document.body.appendChild(w);
    const h = c.offsetHeight; w.remove(); return h;
  }

  /* the name set huge: a mask for the plane, and the particle target that forms it */
  async function sampleName(el, j) {
    const name = el.dataset.name, lines = nameLines(name), n = lines.length;
    const img = await loadImg(el.dataset.src);
    const sc = Math.min(DPR, 1.5);
    const c = document.createElement('canvas'); c.width = Math.round(W * sc); c.height = Math.round(H * sc);
    const x = c.getContext('2d'); x.scale(sc, sc);
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    const font = fs => `800 ${fs}px "Inter Tight", system-ui, sans-serif`;
    x.font = font(100); x.letterSpacing = '-1px';
    const wMax = Math.max(...lines.map(l => x.measureText(l).width));
    const capR = x.measureText('H').actualBoundingBoxAscent / 100, gap = 0.13;
    /* the name sits on one line (only a two-word name wraps), fitted to the width; on a phone that leaves a thin strip,
       so the type is stretched taller (a tall condensed face) to give the picture room to show */
    const sy = 1;
    const aTop = mobile ? 92 : 96, aBot = mobile ? H * 0.52 : H - 262;
    const fsW = 100 * W * (mobile ? 0.94 : 0.93) / wMax, fsH = (aBot - aTop) / ((n * capR + (n - 1) * gap) * sy);
    const fs = Math.min(fsW, fsH);
    x.font = font(fs); x.letterSpacing = `${-fs * 0.01}px`; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
    let bh = (n * capR + (n - 1) * gap) * fs * sy, top = (aTop + aBot) / 2 - bh / 2, copyDy = 0;
    if (mobile) {
      /* name and copy are one group, centred in the screen; the copy sits just under the name and drops to the bottom when the view opens */
      const ch = copyHeight(el), g = 26, lo = 80, hi = H - 76;
      bh = (n * capR + (n - 1) * gap) * fs;
      top = lo + Math.max(0, (hi - lo - (bh + g + ch)) / 2);
      el.style.setProperty('--ct', Math.round(top + bh + g) + 'px');
      copyDy = Math.max(0, (hi - ch) - (top + bh + g));
    }
    x.save(); x.translate(0, top); x.scale(1, sy);
    lines.forEach((l, i) => x.fillText(l, W / 2, capR * fs + i * (capR + gap) * fs));
    x.restore();
    const mask = new THREE.CanvasTexture(c);
    mask.minFilter = THREE.LinearFilter; mask.magFilter = THREE.LinearFilter; mask.generateMipmaps = false;
    renderer.initTexture(mask);
    // particle target: sample the letterforms
    const s1 = document.createElement('canvas'); s1.width = W; s1.height = H;
    const x1 = s1.getContext('2d', { willReadFrequently: true }); x1.drawImage(c, 0, 0, W, H);
    const d = x1.getImageData(0, 0, W, H).data, idx = [];
    for (let i = 0; i < W * H; i++) if (d[i * 4] > 128) idx.push(i);
    if (!idx.length) throw new Error('empty name sample');
    const t = newT();
    for (let i = 0; i < N; i++) {
      const p = idx[(Math.random() * idx.length) | 0];
      t.pos[i * 3] = (p % W) + Math.random() - W / 2; t.pos[i * 3 + 1] = H / 2 - ((p / W) | 0) - Math.random(); t.pos[i * 3 + 2] = (Math.random() - .5) * 6;
      const g = 0.88 + Math.random() * 0.12;
      t.col[i * 3] = grey(242, g); t.col[i * 3 + 1] = grey(240, g); t.col[i * 3 + 2] = grey(235, g);
    }
    const wide = el.dataset.kind === 'wide', ar = img.naturalHeight / img.naturalWidth;
    const bb = { cx: W / 2, cy: top + bh / 2, w: wMax * fs / 100, h: bh };
    const frame = Object.assign({ zoom: 1.06, fx: 0.5, x0: 0, x1: 1 }, FRAME[el.id]);
    planeInfo[j] = { tex: texFor(img), mask, ar, wide, bb, frame, copyDy, fy: frame.fy ?? focusFor(img, Math.min(0.9, bb.h / (bb.w * frame.zoom * ar)), wide) };
    return t;
  }

  let buildTok = 0, boundA = -1, boundB = -1, blank = null;
  async function buildTargets() {
    const tok = ++buildTok;
    boundA = boundB = -1;
    T.fill(null); planeInfo.length = 0;
    T[11] = sampleDrift();
    blank = { pos: T[11].pos, col: new Uint8Array(N * 3) };
    T[0] = sampleText(['Sibhimanyu'], { frac: 0.86, maxFs: 1500 });
    T[10] = sampleDots();
    T[6] = sampleText(mobile ? ['a classroom,', 'a school', 'and a farm'] : ['a classroom, a school', 'and a farm'], { frac: mobile ? 0.84 : 0.7, maxFs: 220 });
    for (let j = 0; j < projEls.length; j++) {
      await new Promise(r => setTimeout(r, 0));
      if (tok !== buildTok) return;
      try { T[PROJ_T[j]] = await sampleName(projEls[j], j); } catch (e) { console.warn('[field] image', projEls[j].id, e && e.message); }
      boundA = boundB = -1;
    }
  }

  function bind(a, b) {
    if (a === boundA && b === boundB) return;
    boundA = a; boundB = b;
    const ta = T[a] || blank, tb = T[b] || blank;
    aPA.array.set(ta.pos); aPB.array.set(tb.pos); aCA.array.set(ta.col); aCB.array.set(tb.col);
    aPA.needsUpdate = aPB.needsUpdate = aCA.needsUpdate = aCB.needsUpdate = true;
    mat.uniforms.uKA.value = KIND[a]; mat.uniforms.uKB.value = KIND[b];
  }

  /* ---------------- index dots: projected to the DOM rows ---------------- */
  const state = { p: 0, h: 0, dr: 0, o: 0, sc: 0 };
  const lastDot = Array.from({ length: 8 }, () => null);
  function updateDots() {
    const dts = $$('#index .idx-list li .dt'), e = smooth(state.h);
    for (let i = 0; i < 8; i++) {
      const gx = W * (0.22 + 0.56 * i / 7) - W / 2, gy = 0;
      const r = dts[i] && dts[i].getBoundingClientRect();
      let rx = gx, ry = gy;
      if (r && r.width) { rx = r.left + r.width / 2 - W / 2; ry = H / 2 - (r.top + r.height / 2); lastDot[i] = [rx, ry]; }
      else if (lastDot[i]) { rx = lastDot[i][0]; ry = lastDot[i][1]; }
      dotU[i].set(gx + (rx - gx) * e, gy + (ry - gy) * e);
    }
  }

  /* ---------------- input ---------------- */
  let ptrK = 0, ptrKT = 0;
  addEventListener('pointermove', ev => { if (ev.pointerType === 'touch') return; mat.uniforms.uPtr.value.set(ev.clientX - W / 2, H / 2 - ev.clientY); ptrKT = 1; });
  document.addEventListener('pointerleave', () => { ptrKT = 0; });
  addEventListener('blur', () => { ptrKT = 0; });

  /* Where the screenshot sits and how far the type has opened (state.o: 0 = letters, 1 = open view; state.sc: how far
     the live scroll-through has slid the page up under the open window). The screenshot's anchor point (the focal band
     in the letters, the window's own centre when open) travels from the letters' centre to the window's centre. */
  /* hand-set framing where the picture's interest is a small part of it: SNOF's shot is a login card in the middle of a
     blank page, so the letters zoom in on the card and the open view crops to the middle of the shot */
  const FRAME = { 'p-rasanai': { fy: 0.13 }, 'p-squeak': { fy: 0.545 }, 'p-heresay': { fy: 0.07 }, 'p-snof': { zoom: 1.9, fx: 0.5, fy: 0.47, x0: 0.2, x1: 0.8 } };
  const OPEN_AR = 1.22;                                              // the open window's height / width for a tall page
  function openRect(pi) {
    const ar = pi.ar;
    if (mobile) {
      const cw = pi.frame.x1 - pi.frame.x0, iw = pi.wide ? W * 0.9 : Math.min(W * 0.88, (H * 0.44) / OPEN_AR);
      const wh = pi.wide ? iw / cw * ar : iw * OPEN_AR; return { iw, wh, cx: W / 2, cy: 92 + wh / 2 };
    }
    const top = 82, bot = H - 104, avail = bot - top;               // clear of the nav above and the counter + rail below
    if (pi.wide) { const cw = pi.frame.x1 - pi.frame.x0, iw = Math.min(W * 0.62, 980 * cw, avail * 1.12 / ar * cw); return { iw, wh: iw / cw * ar, cx: W * 0.62, cy: (top + bot) / 2 }; }
    const iw = Math.min(W * 0.5, avail / OPEN_AR);
    return { iw, wh: iw * OPEN_AR, cx: W * 0.6, cy: (top + bot) / 2 };
  }
  function placePlane(pi, pu) {
    const e = smooth((state.o - 0.3) / 0.7), bb = pi.bb, ar = pi.ar;
    const O = openRect(pi), sc = pi.wide ? 0 : state.sc;
    const fr = pi.frame, cropW = fr.x1 - fr.x0;
    const iw0 = bb.w * fr.zoom, iw1 = O.iw / cropW;                             // the screenshot's full width, in the letters and when open
    const ih1 = iw1 * ar, fy1 = clamp((O.wh / 2 + sc * Math.max(0, ih1 - O.wh)) / ih1, 0, 1);
    const iw = iw0 + (iw1 - iw0) * e, ih = iw * ar;
    const fy = pi.fy + (fy1 - pi.fy) * e, fx = fr.fx + ((fr.x0 + fr.x1) / 2 - fr.fx) * e;
    const ax = bb.cx + (O.cx - bb.cx) * e, ay = bb.cy + (O.cy - bb.cy) * e;      // where the anchor lands on screen (y down)
    const winW = bb.w * 1.12 + (O.iw - bb.w * 1.12) * e, winH = bb.h * 1.3 + (O.wh - bb.h * 1.3) * e;
    plane.position.set(0, 0, 0); plane.scale.set(W, H, 1);
    pu.uTex.value = pi.tex; pu.uMask.value = pi.mask; pu.uPx.value.set(W, H);
    pu.uC.value.set(bb.cx / W, 1 - bb.cy / H);
    pu.uS.value = 1 + 5.5 * Math.pow(state.o, 1.6);
    pu.uO.value = state.o; pu.uE.value = e; pu.uScr.value = pi.wide ? 0 : smooth(sc * 3);
    pu.uImgC.value.set(ax - (fx - 0.5) * iw, H - (ay - (fy - 0.5) * ih)); pu.uImgS.value.set(iw, ih);
    pu.uWinC.value.set(ax, H - ay); pu.uWinS.value.set(winW, winH);
    const mu = mat.uniforms; mu.uOp.value = state.o; mu.uWin.value.set(ax - W / 2, H / 2 - ay, winW, winH);
  }

  /* ---------------- render loop ---------------- */
  const intro = { on: true, u: 0 };
  let vel = 0, lastY = scrollY, lastT = performance.now();
  function frame() {
    const now = performance.now(), rdt = Math.max((now - lastT) / 1000, 0.001); lastT = now;
    const dt = Math.min(rdt, 0.05);
    const y = scrollY; const velTarget = clamp(Math.abs(y - lastY) / rdt / 2600, 0, 1); lastY = y;
    vel += (velTarget - vel) * Math.min(1, dt * 6);
    ptrK += (ptrKT - ptrK) * Math.min(1, dt * 8);
    const u = mat.uniforms;
    if (intro.on && state.p > 0.02) intro.on = false;
    let f;
    if (intro.on) { bind(11, 0); f = intro.u; }
    else { const P = clamp(state.p + state.dr, 0, 11); const k = Math.min(Math.floor(P + 1e-6), 10); bind(k, k + 1); f = clamp(P - k); }
    if (KIND[boundA] === 1 || KIND[boundB] === 1) updateDots();
    let show = 0;
    if (!intro.on) {
      const P2 = state.p + state.dr;
      for (let j = 0; j < 8; j++) {
        const d = Math.abs(P2 - PROJ_T[j]), pi = planeInfo[j];
        if (d < 0.3 && pi) {
          show = 1 - smooth(d / 0.3);
          if (show > 0) placePlane(pi, planeMat.uniforms);
          break;
        }
      }
    }
    plane.visible = show > 0; planeMat.uniforms.uShow.value = show; u.uShow.value = show; if (!show) u.uOp.value = 0;
    u.uF.value = f; u.uT.value += dt; u.uVel.value = vel; u.uPtrK.value = ptrK;
    renderer.render(scene, camera);
  }
  const run = on => renderer.setAnimationLoop(on ? frame : null);
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); run(!document.hidden); });

  /* ---------------- scroll choreography ---------------- */
  /* A project's stretch of scroll, in timeline units (1 unit = half a screen of scroll), from where its letters are filled:
       0.1  filled: snap point 1           0.6-1.4  the letters open into the borderless view
       1.45 open view settled: snap point 2   then SC of live scroll-through (free, no snap), then 0.45 to close */
  const MOVE = 0.9, HOLDQ = 0.6, H0 = 0.5;
  const FILLED = 0.1, OPEN_AT = 0.6, OPEN_DUR = 0.8, OPENED = OPEN_AT + OPEN_DUR + 0.05, CLOSE_DUR = 0.45;
  const isProj = t => PROJ_T.includes(t);
  const scrollLen = t => projEls[PROJ_T.indexOf(t)].dataset.kind === 'wide' ? 0.4 : 3.2;
  const holdLen = t => isProj(t) ? OPENED + 0.05 + scrollLen(t) + CLOSE_DUR + 0.12 : HOLDQ;
  const starts = {}; let TOTAL = H0; for (let t = 1; t <= 10; t++) { TOTAL += MOVE; starts[t] = TOTAL; TOTAL += holdLen(t); }
  const holdStart = t => t === 0 ? 0 : starts[t];
  const snapOf = t => isProj(t) ? holdStart(t) + FILLED : holdStart(t) + HOLDQ * 0.5;
  const scrollEnd = t => holdStart(t) + OPENED + 0.05 + scrollLen(t);
  const snapPts = [0]; for (let t = 1; t <= 10; t++) snapPts.push(t === 10 ? 1 : snapOf(t) / TOTAL);
  PROJ_T.forEach(t => snapPts.push((holdStart(t) + OPENED) / TOTAL, scrollEnd(t) / TOTAL));
  /* no snap inside the scroll-through: it is the person's to read; snap only to the filled letters and the opened view */
  const freeR = PROJ_T.map(t => [(holdStart(t) + OPENED + 0.02) / TOTAL, scrollEnd(t) / TOTAL]);
  const fill = $('#railFill'), hud = $('#hud'), hudN = $('#hudN'), hudNm = $('#hudNm'), hudDs = $('#hudDs');
  const indexEl = $('#index');
  let ctx = null, pinST = null, hudShown = -2, noSnap = false;

  function splitLines(el) {
    if (!el.dataset.t) el.dataset.t = el.textContent.trim();
    const words = el.dataset.t.split(/\s+/);
    el.textContent = '';
    const spans = words.map(w => { const s = document.createElement('span'); s.style.display = 'inline-block'; s.textContent = w; el.appendChild(s); el.appendChild(document.createTextNode(' ')); return s; });
    const lines = []; let lastTop = null;
    spans.forEach(s => { const tp = s.offsetTop; if (lastTop === null || Math.abs(tp - lastTop) > 4) { lines.push([]); lastTop = tp; } lines[lines.length - 1].push(s.textContent); });
    el.textContent = '';
    return lines.map(l => { const o = document.createElement('span'), i = document.createElement('span'); o.className = 'ln'; i.textContent = l.join(' '); o.appendChild(i); el.appendChild(o); return i; });
  }

  function setHud(j) {
    if (j === hudShown) return; hudShown = j;
    if (j < 0) { gsap.to(hud, { opacity: 0, duration: .25, overwrite: true }); return; }
    const d = projEls[j].dataset;
    gsap.timeline({ overwrite: true })
      .to(hud, { opacity: 0, y: 5, duration: .15, ease: 'power2.in' })
      .add(() => { hudN.textContent = d.n; hudNm.textContent = d.name; hudDs.textContent = d.tag; })
      .fromTo(hud, { opacity: 0, y: -5 }, { opacity: 1, y: 0, duration: .32, ease: 'power3.out' });
  }

  function setupScroll() {
    projEls.forEach(el => { const d = $('.desc', el); d && (d.__lines = splitLines(d)); });
    ctx = gsap.context(() => {
      const unit = () => innerHeight * 0.5;
      gsap.set(projEls, { autoAlpha: 0 });
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: '#stage', start: 'top top', end: () => '+=' + Math.round(TOTAL * unit()), pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true,
          snap: { snapTo: (v, self) => { const at = self.progress; return noSnap || freeR.some(r => at >= r[0] && at <= r[1]) ? at : snapPts.reduce((b, s) => Math.abs(s - at) < Math.abs(b - at) ? s : b, 0); }, directional: false, delay: 0.12, duration: { min: 0.25, max: 0.9 }, ease: 'power2.inOut' },
          onUpdate: self => { fill.style.transform = `scaleX(${self.progress})`; }
        },
        onUpdate: () => {
          const p = state.p, near = Math.round(p), tj = PROJ_T.indexOf(near);
          setHud(tj >= 0 && Math.abs(p - near) < 0.4 ? tj : -1);
        }
      });
      pinST = tl.scrollTrigger;
      tl.to('.hero-ov', { autoAlpha: 0, y: -16, duration: 0.35 }, 0.08);
      for (let t = 1; t <= 10; t++) tl.to(state, { p: t, duration: MOVE }, starts[t] - MOVE);
      tl.to('.rail', { opacity: 0, duration: 0.25 }, TOTAL - 0.25);
      tl.set({}, {}, TOTAL);
      projEls.forEach((el, j) => {
        const hs = holdStart(PROJ_T[j]), at = hs - 0.42, HOLD = holdLen(PROJ_T[j]) - 0.12;
        const lines = [$('.pname a', el), $('.tag span', el), ...$('.desc', el).__lines, $('.lk', el)];
        gsap.set(lines, { yPercent: 115 });
        gsap.set($('.pmark', el), { autoAlpha: 0 });
        tl.set(el, { autoAlpha: 1 }, at)
          .to(lines, { yPercent: 0, duration: 0.3, ease: 'power3.out', stagger: 0.03 }, at)
          .to($('.pmark', el), { autoAlpha: 1, duration: 0.4 }, at)
          .to([...lines, $('.pmark', el)], { yPercent: -115, duration: 0.28, ease: 'power2.in', stagger: 0.02, immediateRender: false }, hs + HOLD)
          .set(el, { autoAlpha: 0 }, hs + HOLD + 0.36);
        /* the type opens into the site, then closes back to letters before it dissolves to particles */
        const sEnd = scrollEnd(PROJ_T[j]);
        tl.set(state, { sc: 0 }, hs - 0.05)
          .to(state, { o: 1, duration: OPEN_DUR, ease: 'power2.inOut' }, hs + OPEN_AT)
          .to(state, { sc: 1, duration: sEnd - (hs + OPENED + 0.05), ease: 'none' }, hs + OPENED + 0.05)
          .to(state, { o: 0, duration: CLOSE_DUR, ease: 'power2.inOut', immediateRender: false }, sEnd);
        const dy = planeInfo[j] && planeInfo[j].copyDy;
        if (mobile && dy) tl.to($('.copy', el), { y: dy, duration: OPEN_DUR, ease: 'power2.inOut' }, hs + OPEN_AT)
          .to($('.copy', el), { y: 0, duration: CLOSE_DUR, ease: 'power2.inOut', immediateRender: false }, sEnd);
      });
      /* index: the 8 dots land on the DOM rows, then the field loosens into the drift behind it */
      ScrollTrigger.create({ trigger: indexEl, start: 'top bottom', end: 'top 38%', scrub: true, onUpdate: s => { state.h = s.progress; } });
      ScrollTrigger.create({ trigger: indexEl, start: 'top 38%', end: 'top -15%', scrub: true, onUpdate: s => { state.dr = s.progress; indexEl.style.setProperty('--dot', clamp(s.progress * 4).toFixed(3)); } });
      window.__sq = { state, tl, st: pinST, TOTAL, holdStart, scrollEnd, OPENED, FILLED, holdLen, snapPts, planeInfo, setNoSnap: v => { noSnap = v; }, N: () => N };
    });
  }

  function goToWork(e) {
    if (!root.classList.contains('gl') || !pinST) return;
    e.preventDefault();
    const y = pinST.start + snapOf(1) / TOTAL * (pinST.end - pinST.start);
    scrollTo({ top: y, behavior: 'smooth' });
  }
  const navWork = $('#nav-work'); navWork && navWork.addEventListener('click', goToWork);

  /* ---------------- boot ---------------- */
  await Promise.race([
    Promise.all([document.fonts.load('600 100px "Inter Tight"'), document.fonts.load('800 100px "Inter Tight"'), document.fonts.load('400 12px "JetBrains Mono"')]).then(() => document.fonts.ready),
    new Promise(r => setTimeout(r, 3500))
  ]).catch(() => {});
  if (root.classList.contains('nogl')) return;
  L = layoutNow();
  await buildTargets();                                   // hero, divider, dots, drift; projects stream in after
  root.classList.add('gl');
  setupScroll();
  ScrollTrigger.refresh();
  run(!document.hidden);
  gsap.to(intro, { u: 1, duration: 2.4, ease: 'expo.out', onComplete: () => { intro.on = false; } });
  root.dataset.ready = '1';

  addEventListener('sq:layout', () => ScrollTrigger.refresh());
  let rt, lw = innerWidth, lh = innerHeight;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(async () => {
      if (innerWidth === lw && Math.abs(innerHeight - lh) < 140) return;
      lw = innerWidth; lh = innerHeight;
      ctx && ctx.revert();
      L = layoutNow();
      await buildTargets();
      setupScroll();
      ScrollTrigger.refresh();
    }, 250);
  });
}
