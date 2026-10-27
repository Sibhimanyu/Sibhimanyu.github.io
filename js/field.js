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
  /* Each project's identity outside its letters, read from the live sites (computed font-family, primary button / brand
     colours). `ac` is the brand colour lifted where needed to read on #0A0A0A (>= 4.5:1); `brand` is the site's own value. */
  const PROJECT_SKIN = {
    'p-rasanai':  { ac: '#9aa0ff', brand: '#2a31a8', font: 'Mukta',              w: 400 },   // Anek Latin 600 / Mukta; indigo #1b1f5e #2a31a8
    'p-flotilla': { ac: '#2bb5a6', brand: '#0f766e', font: 'Fraunces',           w: 400 },   // Fraunces / Inter; teal #0F766E
    'p-heresay':  { ac: '#2dd4bf', brand: '#0f766e', font: 'Figtree',            w: 400 },   // Bricolage Grotesque 800 / Figtree; peacock #0f766e, turquoise #2dd4bf
    'p-squeak':   { ac: '#ffda1a', brand: '#ffda1a', font: 'Figtree',            w: 500 },   // Figtree 700 / Inter; duck yellow #FFDA1A
    'p-imago':    { ac: '#3ccf7a', brand: '#0f9f4f', font: 'Inter',              w: 400 },   // Inter; green #0f9f4f on #1b1b19 tile
    'p-greenroom':{ ac: '#7bc653', brand: '#2f6118', font: 'Inter',              w: 400 },   // system SF stack (-> Inter); green #2f6118
    'p-abhishri': { ac: '#f26b65', brand: '#ef5e58', font: 'Playfair Display',   w: 400 },   // Playfair Display / Open Sans; coral #ef5e58
    'p-snof':     { ac: '#34c27a', brand: '#16a34a', font: 'Manrope',            w: 500 }    // Manrope 750; farm green (logo)
  };
  projEls.forEach(el => { const k = PROJECT_SKIN[el.id]; if (k) { el.style.setProperty('--sk-ac', k.ac); el.style.setProperty('--sk-font', `"${k.font}"`); el.style.setProperty('--sk-w', k.w); } });
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
      uDots: { value: dotU }, uKA: { value: 0 }, uKB: { value: 0 }, uAlpha: { value: 0.42 }, uShow: { value: 0 }
    },
    vertexShader: `
      attribute vec3 pA, pB, cA, cB; attribute vec4 r; attribute float gi;
      uniform float uF, uT, uVel, uDpr, uSize, uSc, uPtrK, uKA, uKB, uAlpha, uShow; uniform vec2 uPtr; uniform vec2 uDots[8];
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
        // pointer repel
        vec2 dp = pos.xy - uPtr; float dl = length(dp) + 0.001;
        float f = exp(-dl*dl/(2.*85.*85.)) * uPtrK;
        pos.xy += dp/dl * f * (26. + 44.*r.z);
        pos.z += f*60.;
        vC = col; vA = (0.8 + 0.2*r.z) * vis * mix(1., uAlpha, dr) * (1. - smoothstep(0.55, 1., uShow));
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
  /* THROUGH THE LETTERS, INTO A BAND. Two full-screen planes (the project leaving and the one arriving), each drawing one
     project: its name's mask (uMask) shows the screenshot only inside the type. uK morphs the type into a wide band: the
     letters are dilated by a distance field (uDist, in home px) until they merge, then cross-fade into a rectangle whose
     left/right edges are sharp and whose top/bottom fade softly into the dark. uS/uT place the whole composition on the
     screen (small and off to one side while it arrives, drifting up as it leaves). uImg* is the whole screenshot. */
  const makePlaneMat = () => new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uTex: { value: null }, uMask: { value: null }, uDist: { value: null }, uShow: { value: 0 }, uOp: { value: 1 }, uK: { value: 0 },
      uS: { value: 1 }, uMaxD: { value: 300 }, uRmax: { value: 100 }, uPx: { value: new THREE.Vector2(1, 1) }, uT: { value: new THREE.Vector2() },
      uImgC: { value: new THREE.Vector2() }, uImgS: { value: new THREE.Vector2(1, 1) }, uFade: { value: new THREE.Vector2(20, 60) },
      uBand: { value: new THREE.Vector4() }, uGlow: { value: new THREE.Vector3() }, uGl: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform sampler2D uTex, uMask, uDist; uniform float uShow, uOp, uK, uS, uMaxD, uRmax; uniform vec2 uPx, uT, uImgC, uImgS, uFade; uniform vec4 uBand; uniform vec3 uGlow; uniform float uGl; varying vec2 vUv;
      float h(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ return vn(p)*0.55 + vn(p*2.1+7.3)*0.3 + vn(p*4.3+13.1)*0.15; }
      void main(){
        vec2 px = vUv * uPx;
        vec2 hp = (px - uT) / uS;                                                  // back into the composition's own (home) pixels
        vec2 uvh = hp / uPx;
        float mL = texture2D(uMask, uvh).r;                                        // the letters
        float d = texture2D(uDist, uvh).r * uMaxD;                                 // distance to the nearest letter, px
        float r = pow(uK, 0.7) * uRmax;
        float dil = mix(mL, max(mL, 1. - smoothstep(r - 7., r + 7., d)), step(0.001, uK));
        vec2 bq = hp - uBand.xy;
        float xc = mix(1., step(abs(bq.x), uBand.z), step(0.001, uK));              // sharp left and right edges
        float fk = smoothstep(0., 0.5, uK), wB = mix(1.5, uFade.y, fk), wT = mix(1.5, uFade.x, fk);              // short, soft fade at the bottom and top
        float vf = smoothstep(0., wB, bq.y + uBand.w) * smoothstep(0., wT, uBand.w - bq.y);
        float cover = vf * xc * mix(dil, 1., smoothstep(0.3, 0.8, uK));
        vec2 q = (hp - uImgC) / uImgS + 0.5;                                       // 0..1 across the screenshot, y up
        vec3 c = texture2D(uTex, q).rgb;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = max(c, vec3(0.19, 0.188, 0.18) * (1. - 0.6 * uK));                       // a dark page must not vanish into the dark
        c = mix(vec3(lum), c, 1.4 - 0.3 * uK);                                       // a little colour back into the letters
        c *= mix(vec3(1.), vec3(0.909, 0.894, 0.863), smoothstep(0.55, 0.95, lum) * (1. - 0.5 * uK));
        float inside = step(0., q.x) * step(q.x, 1.) * step(0., q.y) * step(q.y, 1.);
        float a = 1., edge = 0.;
        if (uShow < 0.995) {
          float n = clamp((fbm(px / 30.) - 0.2) / 0.6, 0., 1.);
          float x = mix(-0.08, 1.08, uShow) - n;                                   // >0 = revealed
          a = smoothstep(0., 0.012, x);
          edge = (1. - smoothstep(0., 0.05, abs(x - 0.02))) * step(0.01, uShow);
          c = mix(c, vec3(1., 0.302, 0.122), edge);                                // accent glow where it breaks up
          a = max(a, edge * 0.95);
        }
        float tf = 1.;
        float a2 = a * cover * inside * uOp * tf;
        vec2 gq = (hp - uBand.xy) / vec2(uBand.z * 1.05, uBand.w * 2.4);          // the faintest wash of the brand colour behind the type
        float g = 0.045 * uGl * exp(-dot(gq, gq) * 1.6);
        float al = a2 + (1. - a2) * g;
        gl_FragColor = vec4((c * a2 + uGlow * (1. - a2) * g) / max(al, 1e-4), al);
      }`
  });
  const planes = [0, 1].map(i => {
    const m = makePlaneMat(), mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.frustumCulled = false; mesh.renderOrder = 2 + i; mesh.visible = false;
    return { mesh, u: m.uniforms };
  });
  const texCache = new Map();
  function texFor(img) { if (!texCache.has(img.src)) { const t = new THREE.Texture(img); t.anisotropy = 8; t.needsUpdate = true; renderer.initTexture(t); texCache.set(img.src, t); } return texCache.get(img.src); }
  const planeInfo = [];   // per project: { tex, R, v0 }
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points); planes.forEach(pl => scene.add(pl.mesh));

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

  /* Distance to the nearest letter pixel, on a quarter-size copy of the mask (exact Euclidean transform), packed into a
     texture the shader grows the letters with. Rows are written bottom-up to match the mask's orientation. */
  const MAXD = 300, DINF = 1e20;
  function dt1(f, n, out, v, z) {
    let k = 0; v[0] = 0; z[0] = -DINF; z[1] = DINF;
    for (let q = 1; q < n; q++) {
      let sx;
      for (;;) { const pp = v[k]; sx = ((f[q] + q * q) - (f[pp] + pp * pp)) / (2 * q - 2 * pp); if (sx <= z[k]) k--; else break; }
      k++; v[k] = q; z[k] = sx; z[k + 1] = DINF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const pp = v[k]; out[q] = (q - pp) * (q - pp) + f[pp]; }
  }
  function distTexture(c) {
    const w = Math.ceil(W / 4), h = Math.ceil(H / 4), sm = document.createElement('canvas'); sm.width = w; sm.height = h;
    const sx = sm.getContext('2d', { willReadFrequently: true }); sx.drawImage(c, 0, 0, w, h);
    const d = sx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), n = Math.max(w, h);
    for (let i = 0; i < w * h; i++) g[i] = d[i * 4] > 100 ? 0 : DINF;
    const f = new Float32Array(n), o = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1);
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; dt1(f, h, o, v, z); for (let y = 0; y < h; y++) g[y * w + x] = o[y]; }
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; dt1(f, w, o, v, z); for (let x = 0; x < w; x++) g[y * w + x] = o[x]; }
    const out = new Uint8Array(w * h * 4), px = W / w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const val = Math.min(255, Math.round(Math.sqrt(g[y * w + x]) * px / MAXD * 255)), o4 = ((h - 1 - y) * w + x) * 4;
      out[o4] = out[o4 + 1] = out[o4 + 2] = val; out[o4 + 3] = 255;
    }
    const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; renderer.initTexture(t);
    return t;
  }

  /* a project's copy block (sentence + links), measured off-screen under the same rules the live page uses */
  function copyHeight(el) {
    const w = document.createElement('div'); w.className = 'gl'; w.style.cssText = `position:fixed;left:0;top:0;width:${W}px;visibility:hidden;pointer-events:none;--bl:${Math.round(W * 0.035)}px`;
    const c = $('.copy', el).cloneNode(true); c.style.cssText = 'position:static;'; w.appendChild(c); document.body.appendChild(w);
    const h = c.offsetHeight; w.remove(); return h;
  }

  /* The name set huge: the mask for the plane and the particle target that forms it, one canvas for both. The eyebrow,
     letters and sentence are one group laid out here and centred in the screen; their bounds go to the CSS. */
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
    const EY = 34, GAP = 26, lo = mobile ? 84 : 92, hi = H - 56;
    const ch = copyHeight(el);
    const fsW = 100 * W * (mobile ? 0.94 : 0.93) / wMax, fsH = (hi - lo - EY - GAP - ch) / (n * capR + (n - 1) * gap);
    const fs = Math.min(fsW, fsH);
    x.font = font(fs); x.letterSpacing = `${-fs * 0.01}px`; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
    const bh = (n * capR + (n - 1) * gap) * fs;
    /* the band state is the biggest the group gets (the eyebrow rises and the sentence drops), so that is what is centred */
    /* on a phone the band takes as much of the screen as the copy leaves (up to ~56%), so the page inside reads */
    const fitHH = (hi - lo - (EY + bh + GAP + ch + 18)) / 2 + bh / 2 - 6;
    const hh = mobile ? Math.max(bh / 2 + 30, Math.min(H * 0.28, fitHH)) : Math.max(H * 0.21, bh / 2 + 34), dy0 = hh - bh / 2 + 6;
    const gtop = lo + dy0 + Math.max(0, (hi - lo - (EY + bh + GAP + ch + 2 * dy0 + 18)) / 2), top = gtop + EY;
    let l = 1e9, r = -1e9;
    lines.forEach((ln, i) => {
      x.fillText(ln, W / 2, top + capR * fs + i * (capR + gap) * fs);
      const m = x.measureText(ln); l = Math.min(l, W / 2 - m.actualBoundingBoxLeft); r = Math.max(r, W / 2 + m.actualBoundingBoxRight);
    });
    const mask = new THREE.CanvasTexture(c);
    mask.minFilter = THREE.LinearMipmapLinearFilter; mask.magFilter = THREE.LinearFilter; mask.generateMipmaps = true;   // mipmapped: a small, arriving name keeps its counters
    renderer.initTexture(mask);
    const dist = distTexture(c);
    // particle target (the first project only; the others arrive by flowing, never by particles)
    let t = null;
    if (j === 0) {
      const s1 = document.createElement('canvas'); s1.width = W; s1.height = H;
      const x1 = s1.getContext('2d', { willReadFrequently: true }); x1.drawImage(c, 0, 0, W, H);
      const d = x1.getImageData(0, 0, W, H).data, idx = [];
      for (let i = 0; i < W * H; i++) if (d[i * 4] > 128) idx.push(i);
      if (!idx.length) throw new Error('empty name sample');
      t = newT();
      for (let i = 0; i < N; i++) {
        const p = idx[(Math.random() * idx.length) | 0];
        t.pos[i * 3] = (p % W) + Math.random() - W / 2; t.pos[i * 3 + 1] = H / 2 - ((p / W) | 0) - Math.random(); t.pos[i * 3 + 2] = (Math.random() - .5) * 6;
        const g = 0.88 + Math.random() * 0.12;
        t.col[i * 3] = grey(242, g); t.col[i * 3 + 1] = grey(240, g); t.col[i * 3 + 2] = grey(235, g);
      }
    }
    const wide = el.dataset.kind === 'wide', ar = img.naturalHeight / img.naturalWidth;
    const bb = { cx: (l + r) / 2, cy: top + bh / 2, w: r - l, h: bh };
    const frame = Object.assign({ zoom: 1.06, fx: 0.5 }, FRAME[el.id]);
    const band = Math.min(0.9, (2 * hh) / (bb.w * frame.zoom * ar));        // the band is the tallest slice of the page ever shown
    const fy = frame.fy ?? focusFor(img, band, wide);
    const fy1 = wide ? fy + 0.05 : Math.max(fy + 0.15, 0.7);          // the pan: from the focus down toward ~70% of a tall page; a wide shot barely moves
    const sk = PROJECT_SKIN[el.id] || { brand: '#f2f0eb' }, gl = new THREE.Color(sk.brand);
    planeInfo[j] = { tex: texFor(img), mask, dist, ar, wide, bb, frame, band, fy, fy1, bh, hh, dy0, right: j % 2 === 1, glow: [gl.r, gl.g, gl.b],
      eb: $('.eyebrow', el), cp: $('.copy', el), a: $('.pname a', el), live: null };
    const st = el.style;
    st.setProperty('--bl', Math.round(l) + 'px'); st.setProperty('--bt', Math.round(top) + 'px'); st.setProperty('--bw', Math.round(r - l) + 'px');
    st.setProperty('--bh', Math.round(bh) + 'px'); st.setProperty('--ey', Math.round(gtop) + 'px'); st.setProperty('--ct', Math.round(top + bh + GAP) + 'px');
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
    /* the projects' screenshots stream in behind the hero, in order; nothing waits for them, so a slow connection
       still gets the particle name at once (it used to wait for all eight, and the page gave up after 6 s) */
    streamProjects(tok);
  }
  async function streamProjects(tok) {
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
  /* p walks the particle path below (0 hero, 1 RasanAI's letters, 2 drift, 3 divider phrase, 4 drift, 5 dots, 6 = index handoff via dr);
     S[j] is each project's own progress: arr arriving, cp copy in, k type -> band, sc page pan, ex leaving */
  const PATH = [0, 1, 11, 6, 11, 10, 11];
  const state = { p: 0, h: 0, dr: 0, pv: 1 };      // pv: particles allowed to show (hero, the divider phrase, the index dots)
  const S = Array.from({ length: 8 }, () => ({ arr: 0, cp: 0, k: 0, sc: 0, ex: 0 }));
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

  /* hand-set framing where the picture's interest is a small part of it: SNOF's shot is a login card in the middle of a
     blank page, so the letters zoom in on the card. */
  const FRAME = { 'p-rasanai': { fy: 0.13 }, 'p-squeak': { fy: 0.545 }, 'p-heresay': { fy: 0.07 }, 'p-snof': { zoom: 1.9, fx: 0.5, fy: 0.47 } };
  /* Where a project sits on the screen and how far it has become a band. */
  const eo3 = v => 1 - Math.pow(1 - v, 3);
  function geom(j) {
    const pi = planeInfo[j], s = S[j], bb = pi.bb, sc0 = mobile ? 0.34 : 0.28;
    if (s.ex <= 0) {                                                      // arriving: small at the bottom corner, growing into the letters
      const e = Math.pow(smooth(clamp(s.arr)), 2), scale = sc0 + (1 - sc0) * e;
      const sx = pi.right ? W * (mobile ? 0.7 : 0.74) : W * (mobile ? 0.3 : 0.26), sy = H * (mobile ? 0.86 : 0.8);
      const cx = sx + (bb.cx - sx) * e, cy = sy + (bb.cy - sy) * e;
      return { scale, cx, cy, dx: cx - bb.cx, dy: cy - bb.cy, op: smooth(clamp(s.arr / 0.3)) };
    }
    /* leaving, mirroring the next project's arrival: shrink toward the top corner opposite to where the next one enters
       (the same curve as its growth, run backwards), park just under the nav, then slide out through the corner and fade */
    const nextRight = (j + 1) % 2 === 1, left = nextRight;
    const hx = left ? W * (mobile ? 0.3 : 0.26) : W * (mobile ? 0.7 : 0.74);
    const yT = Math.max(H * (mobile ? 0.14 : 0.2), 88 + pi.hh * sc0 + 6);
    const u1 = clamp(s.ex / 0.75), u2 = smooth(clamp((s.ex - 0.75) / 0.25));
    const e = Math.pow(smooth(1 - u1), 2), scale = sc0 + (1 - sc0) * e;
    const cx = hx + (bb.cx - hx) * e + (left ? -1 : 1) * u2 * W * 0.1, cy = yT + (bb.cy - yT) * e - u2 * (yT + pi.hh * sc0 + 40);
    return { scale, cx, cy, dx: cx - bb.cx, dy: cy - bb.cy, op: 1 - u2 };
  }
  function placeInst(I, j, show) {
    const pi = planeInfo[j], s = S[j], bb = pi.bb, fr = pi.frame, u = planes[I].u, g = geom(j);
    const iw = bb.w * fr.zoom, ih = iw * pi.ar, half = pi.band / 2;
    const f0 = clamp(pi.fy, half, 1 - half), f1 = clamp(pi.fy1, half, 1 - half), fy = f0 + (f1 - f0) * s.sc;
    const mesh = planes[I].mesh; mesh.visible = true; mesh.position.set(0, 0, 0); mesh.scale.set(W, H, 1);
    u.uTex.value = pi.tex; u.uMask.value = pi.mask; u.uDist.value = pi.dist; u.uPx.value.set(W, H);
    u.uS.value = g.scale; u.uT.value.set(g.cx - bb.cx * g.scale, (H - g.cy) - (H - bb.cy) * g.scale);
    u.uImgC.value.set(bb.cx - (fr.fx - 0.5) * iw, H - (bb.cy - (fy - 0.5) * ih)); u.uImgS.value.set(iw, ih);
    u.uK.value = s.k; u.uOp.value = g.op; u.uShow.value = show; u.uMaxD.value = MAXD;
    u.uBand.value.set(bb.cx, H - bb.cy, bb.w / 2, pi.bh / 2 + 6 + (pi.hh - pi.bh / 2) * s.k);
    u.uRmax.value = pi.dy0 + 0.35 * pi.bh + 20;
    u.uFade.value.set(pi.hh * 2 * 0.1, pi.hh * 2 * 0.2);
    u.uGl.value = smooth(clamp((s.arr - 0.8) / 0.2)) * (1 - smooth(s.ex / 0.4));
    u.uGlow.value.set(pi.glow[0], pi.glow[1], pi.glow[2]);
    /* the copy rides the composition: the eyebrow rises and the sentence drops as the type becomes a band, both travel up with it */
    const co = smooth(clamp((s.cp - 0.1) / 0.9)) * (1 - smooth(s.ex / 0.22)), kk = smooth(s.k);
    pi.eb.style.opacity = co; pi.cp.style.opacity = co;
    pi.eb.style.transform = `translate(${g.dx.toFixed(1)}px, ${(-pi.dy0 * kk + g.dy).toFixed(1)}px)`;
    pi.cp.style.transform = `translate(${g.dx.toFixed(1)}px, ${((pi.dy0 + 12) * kk + g.dy).toFixed(1)}px)`;
    const live = s.arr > 0.99 && s.k < 0.01 && s.ex < 0.01 && co > 0.9;           // the letters-as-link only while they sit still as letters
    if (pi.live !== live) { pi.live = live; pi.a.style.pointerEvents = live ? 'auto' : 'none'; pi.a.tabIndex = live ? 0 : -1; }
    return Math.max(g.op * show, 0);
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
    else { const P = clamp(state.p + state.dr, 0, 6); const k = Math.min(Math.floor(P + 1e-6), 5); bind(PATH[k], PATH[k + 1]); f = clamp(P - k); }
    if (KIND[boundA] === 1 || KIND[boundB] === 1) updateDots();
    let show = 0;
    if (!intro.on) {
      const act = [];
      for (let j = 0; j < 8; j++) {
        const pi = planeInfo[j]; if (!pi) continue;
        const sh = j === 0 ? (state.p >= 1 ? 1 : 1 - smooth((1 - state.p) / 0.3)) : 1;
        if (sh > 0 && (j === 0 || S[j].arr > 0) && S[j].ex < 1) act.push([j, sh]);
      }
      for (let I = 0; I < 2; I++) {
        const a = act[I];
        if (!a) { planes[I].mesh.visible = false; continue; }
        const sv = placeInst(I, a[0], a[1]); if (a[0] === 0 && state.p < 1) show = Math.max(show, sv);
      }
    } else planes.forEach(pl => { pl.mesh.visible = false; });
    u.uShow.value = Math.max(show, 1 - state.pv);
    u.uF.value = f; u.uT.value += dt; u.uVel.value = vel; u.uPtrK.value = ptrK;
    renderer.render(scene, camera);
  }
  const run = on => renderer.setAnimationLoop(on ? frame : null);
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); run(!document.hidden); });

  /* ---------------- scroll choreography ---------------- */
  /* The scroll plan, in timeline units (1 unit = half a screen of scroll). Per project, from its letters being filled (L):
       L+0.1 snap: the letters      +0.6..1.6 the type grows into a wide band      then the page pans through the band (free)
       then the band drifts up and fades while the next project arrives small on the opposite side and grows into its
       letters (the next L). Two projects are on screen throughout the hand-over; nothing breaks into particles between them.
     Particles appear only where they always did: hero -> RasanAI's letters, the divider phrase between Imago and Greenroom
     (Greenroom then grows in small from the opposite side), and the index dots after SNOF. */
  const MOVE = 0.9, H0 = 0.5, HOLD_L = 0.6, MORPH = 1.0, EXIT = 1.6, ARR_DV = 1.6, DV_HOLD = 0.9, HOLDQ = 0.6, FILLED = 0.1;
  const scrollLen = j => projEls[j].dataset.kind === 'wide' ? 0.5 : 2.6;
  const TL = { L: [], arr0: [], band0: [], band1: [], pan1: [], ex0: [], ex1: [] };
  let dvSnap = 0, dvEnd = 0, TOTAL = 0;
  TL.L[0] = H0 + MOVE; TL.arr0[0] = TL.L[0] - 0.7;
  for (let j = 0; j < 8; j++) {
    TL.band0[j] = TL.L[j] + HOLD_L; TL.band1[j] = TL.band0[j] + MORPH; TL.pan1[j] = TL.band1[j] + scrollLen(j);
    TL.ex0[j] = TL.pan1[j]; TL.ex1[j] = TL.ex0[j] + EXIT;
    if (j === 4) { dvSnap = TL.ex1[4] + DV_HOLD * 0.5; dvEnd = TL.ex1[4] + DV_HOLD; TL.arr0[5] = dvEnd; TL.L[5] = dvEnd + ARR_DV; }
    else if (j < 7) { TL.arr0[j + 1] = TL.ex0[j]; TL.L[j + 1] = TL.ex1[j]; }
  }
  TOTAL = TL.ex1[7] + HOLDQ;
  const snapOf = j => TL.L[j] + FILLED;
  const snapPts = [0, ...[0, 1, 2, 3, 4].map(snapOf).map(t => t / TOTAL), dvSnap / TOTAL, ...[5, 6, 7].map(snapOf).map(t => t / TOTAL), 1];
  /* snap only to a letters-filled moment (and the divider's phrase); none while a project is a band or two are changing places */
  const snapAt = at => {
    const eps = 1 / TOTAL;
    for (let i = 1; i < snapPts.length - 1; i++) { const a = snapPts[i], b = snapPts[i + 1]; if (at > a + 0.25 * eps && at < b - 0.6 * eps) return at; }
    return snapPts.reduce((b, s) => Math.abs(s - at) < Math.abs(b - at) ? s : b, 0);
  };
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
    ctx = gsap.context(() => {
      const unit = () => innerHeight * 0.5;
      gsap.set(projEls, { autoAlpha: 0 });
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: '#stage', start: 'top top', end: () => '+=' + Math.round(TOTAL * unit()), pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true,
          snap: { snapTo: (v, self) => { const at = self.progress; return noSnap ? at : snapAt(at); }, directional: false, delay: 0.12, duration: { min: 0.25, max: 0.9 }, ease: 'power2.inOut' },
          onUpdate: self => { fill.style.transform = `scaleX(${self.progress})`; }
        },
      });
      pinST = tl.scrollTrigger;
      tl.to('.hero-ov', { autoAlpha: 0, y: -16, duration: 0.35 }, 0.08);
      tl.to('.rail', { opacity: 0, duration: 0.25 }, TOTAL - 0.25);
      tl.set({}, {}, TOTAL);
      /* particles: hero -> RasanAI letters; (hidden) -> drift; Imago's exit -> the divider phrase; phrase -> drift as Greenroom arrives; SNOF's exit -> dots */
      tl.to(state, { p: 1, duration: MOVE }, H0)
        .to(state, { p: 2, duration: 0.5 }, TL.L[1] + 0.5)
        .to(state, { p: 3, duration: EXIT - 0.3 }, TL.ex0[4] + 0.6)
        .to(state, { p: 4, duration: 1.0 }, dvEnd)
        .to(state, { p: 5, duration: EXIT - 0.3 }, TL.ex0[7] + 0.6);
      tl.to(state, { pv: 0, duration: 0.25, ease: 'none' }, TL.L[0] + 0.05)
        .to(state, { pv: 1, duration: 0.4, ease: 'none' }, TL.ex0[4] + 0.6)
        .to(state, { pv: 0, duration: 0.7, ease: 'none' }, dvEnd + 0.2)
        .to(state, { pv: 1, duration: 0.5, ease: 'none' }, TL.ex0[7] + 0.6);
      projEls.forEach((el, j) => {
        const s = S[j]; Object.assign(s, { arr: j === 0 ? 1 : 0, cp: 0, k: 0, sc: 0, ex: 0 });
        gsap.set([$('.eyebrow', el), $('.copy', el)], { opacity: 0 });
        tl.set(el, { autoAlpha: 1 }, TL.arr0[j] - 0.05)
          .set(el, { autoAlpha: 0 }, TL.ex1[j] + 0.02);
        if (j > 0) tl.to(s, { arr: 1, duration: TL.L[j] - TL.arr0[j], ease: 'none' }, TL.arr0[j]);
        tl.to(s, { cp: 1, duration: 0.3, ease: 'none' }, TL.L[j] - 0.3)
          .to(s, { k: 1, duration: MORPH, ease: 'power2.inOut' }, TL.band0[j])
          .to(s, { sc: 1, duration: scrollLen(j), ease: 'none' }, TL.band1[j])
          .to(s, { ex: 1, duration: EXIT, ease: 'none' }, TL.ex0[j]);
      });
      /* index: the 8 dots land on the DOM rows, then the field loosens into the drift behind it */
      ScrollTrigger.create({ trigger: indexEl, start: 'top bottom', end: 'top 38%', scrub: true, onUpdate: s => { state.h = s.progress; } });
      ScrollTrigger.create({ trigger: indexEl, start: 'top 38%', end: 'top -15%', scrub: true, onUpdate: s => { state.dr = s.progress; indexEl.style.setProperty('--dot', clamp(s.progress * 4).toFixed(3)); } });
      window.__sq = { geom, state, S, tl, st: pinST, TOTAL, TL, dvSnap, dvEnd, FILLED, snapPts, planeInfo, setNoSnap: v => { noSnap = v; }, N: () => N };
    });
  }

  function goToWork(e) {
    if (!root.classList.contains('gl') || !pinST) return;
    e.preventDefault();
    const y = pinST.start + snapOf(0) / TOTAL * (pinST.end - pinST.start);
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
