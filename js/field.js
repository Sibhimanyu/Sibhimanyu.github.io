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
  const imgCache = new Map();                                      // one particle sample per project per layout
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
  /* the real screenshot, drawn exactly where the particles form it, dissolving in through a noise threshold */
  const planeMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uTex: { value: null }, uShow: { value: 0 }, uPx: { value: new THREE.Vector2(1, 1) }, uV0: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform float uShow, uV0; uniform vec2 uPx; varying vec2 vUv;
      float h(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ return vn(p)*0.55 + vn(p*2.1+7.3)*0.3 + vn(p*4.3+13.1)*0.15; }
      void main(){
        vec3 c = texture2D(uTex, vec2(vUv.x, mix(uV0, 1., vUv.y))).rgb;      // always the screenshot's own colour
        vec2 px = vUv * uPx;
        float n = clamp((fbm(px / 30.) - 0.2) / 0.6, 0., 1.);                // smooth, ~30px cells
        float x = mix(-0.08, 1.08, uShow) - n;                                 // >0 = revealed
        float a = smoothstep(0., 0.012, x);
        float edge = (1. - smoothstep(0., 0.05, abs(x - 0.02))) * step(uShow, 0.985) * step(0.01, uShow);
        c = mix(c, vec3(0.949, 0.941, 0.922), edge);                           // off-white glow where it breaks up
        a = max(a, edge * 0.95);
        if (uShow > 0.995) a = 1.;
        float e = min(min(px.x, uPx.x - px.x), min(px.y, uPx.y - px.y));
        c = mix(vec3(0.949, 0.941, 0.922) * 0.55, c, smoothstep(0.5, 1.5, e));   // 1px frame
        gl_FragColor = vec4(c, a);
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

  const fin = R => { R.x0 = Math.round(R.cx - R.w / 2); R.y0 = Math.round(R.cy - R.h / 2); return R; };
  function rectFor(kind) {
    if (mobile) {
      let w, h;
      if (kind === 'wide') { w = W * 0.9; h = w / 2; }
      else { h = L.avail; w = h * (1280 / 1800); if (w > W * 0.8) { w = W * 0.8; h = w / (1280 / 1800); } }
      return fin({ w: Math.round(w), h: Math.round(h), cx: W / 2, cy: L.top + L.avail / 2 });
    }
    if (kind === 'wide') { const w = Math.min(W * 0.48, 720); return fin({ w: Math.round(w), h: Math.round(w / 2), cx: W * 0.665, cy: H * 0.485 }); }
    const h = Math.min(H * 0.78, 820);
    return fin({ w: Math.round(h * (1280 / 1800)), h: Math.round(h), cx: W * 0.66, cy: H * 0.485 });
  }

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

  async function sampleImage(el) {
    const key = `${el.id}|${N}|${W}x${H}`;
    if (imgCache.has(key)) { await loadImg(el.dataset.src).then(img => { planeInfo[projEls.indexOf(el)] = { tex: texFor(img), R: rectFor(el.dataset.kind), v0: 1 - Math.min(img.naturalHeight, img.naturalWidth * rectFor(el.dataset.kind).h / rectFor(el.dataset.kind).w) / img.naturalHeight }; }); return imgCache.get(key); }
    const img = await loadImg(el.dataset.src);
    const R = rectFor(el.dataset.kind);
    const c = document.createElement('canvas'); c.width = R.w; c.height = R.h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    const srcH = Math.min(img.naturalHeight, img.naturalWidth * R.h / R.w);
    x.drawImage(img, 0, 0, img.naturalWidth, srcH, 0, 0, R.w, R.h);
    const d = x.getImageData(0, 0, R.w, R.h).data;
    const lumAt = i => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    let bg = 0, bn = 0;
    for (let y = 2; y < 20; y++) for (let xx = 2; xx < 20; xx++) { bg += lumAt((y * R.w + xx) * 4); bn++; }
    bg /= bn;
    const light = bg > 0.5;
    const t = newT();
    const x0 = R.x0 - W / 2, y0 = H / 2 - R.y0;
    let i = 0, guard = 0;
    while (i < N && guard < N * 40) {
      guard++;
      const px = (Math.random() * R.w) | 0, py = (Math.random() * R.h) | 0;
      const o = (py * R.w + px) * 4, l = lumAt(o);
      const w = (light ? 0.05 : 0.12) + (light ? 0.95 : 0.88) * Math.min(1, Math.abs(l - bg) * 2.6);
      if (Math.random() > w) continue;
      t.pos[i * 3] = x0 + px + Math.random(); t.pos[i * 3 + 1] = y0 - py - Math.random(); t.pos[i * 3 + 2] = (Math.random() - .5) * 6;
      const near = 1 - Math.min(1, Math.abs(l - bg) * 3);
      const k = (light ? 0.55 + 0.45 * (1 - near) : 0.95) * (0.92 + Math.random() * 0.16);
      // on a light page the ink is the dark part: lift it so it reads on near-black, and let the ground fall away
      const lf = light ? (1 - l) * 0.4 : 0;
      t.col[i * 3] = grey(d[o] + (255 - d[o]) * lf, k * 1.05); t.col[i * 3 + 1] = grey(d[o + 1] + (255 - d[o + 1]) * lf, k * 1.05); t.col[i * 3 + 2] = grey(d[o + 2] + (255 - d[o + 2]) * lf, k * 1.05);
      i++;
    }
    for (; i < N; i++) { t.pos[i * 3] = x0; t.pos[i * 3 + 1] = y0; }
    imgCache.set(key, t);
    planeInfo[projEls.indexOf(el)] = { tex: texFor(img), R, v0: 1 - srcH / img.naturalHeight };
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
      try { T[PROJ_T[j]] = await sampleImage(projEls[j]); } catch (e) { console.warn('[field] image', projEls[j].id, e && e.message); }
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
  const state = { p: 0, h: 0, dr: 0 };
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
          if (show > 0) {
            const R = pi.R, pu = planeMat.uniforms;
            plane.position.set(R.x0 + R.w / 2 - W / 2, H / 2 - R.y0 - R.h / 2, 0); plane.scale.set(R.w, R.h, 1);
            pu.uTex.value = pi.tex; pu.uPx.value.set(R.w, R.h); pu.uV0.value = pi.v0;
          }
          break;
        }
      }
    }
    plane.visible = show > 0; planeMat.uniforms.uShow.value = show; u.uShow.value = show;
    u.uF.value = f; u.uT.value += dt; u.uVel.value = vel; u.uPtrK.value = ptrK;
    renderer.render(scene, camera);
  }
  const run = on => renderer.setAnimationLoop(on ? frame : null);
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); run(!document.hidden); });

  /* ---------------- scroll choreography ---------------- */
  const MOVE = 1, HOLD = 0.6, H0 = 0.5, TOTAL = H0 + 10 * (MOVE + HOLD);
  const holdStart = t => t === 0 ? 0 : H0 + (t - 1) * (MOVE + HOLD) + MOVE;
  const snapPts = [0]; for (let t = 1; t <= 10; t++) snapPts.push(t === 10 ? 1 : (holdStart(t) + HOLD * 0.5) / TOTAL);
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
          snap: { snapTo: (v, self) => { const at = self.progress; return noSnap ? at : snapPts.reduce((b, s) => Math.abs(s - at) < Math.abs(b - at) ? s : b, 0); }, directional: false, delay: 0.12, duration: { min: 0.25, max: 0.9 }, ease: 'power2.inOut' },
          onUpdate: self => { fill.style.transform = `scaleX(${self.progress})`; }
        },
        onUpdate: () => {
          const p = state.p, near = Math.round(p), tj = PROJ_T.indexOf(near);
          setHud(tj >= 0 && Math.abs(p - near) < 0.4 ? tj : -1);
        }
      });
      pinST = tl.scrollTrigger;
      tl.to('.hero-ov', { autoAlpha: 0, y: -16, duration: 0.35 }, 0.08);
      for (let k = 0; k < 10; k++) tl.to(state, { p: k + 1, duration: MOVE }, H0 + k * (MOVE + HOLD));
      tl.to('.rail', { opacity: 0, duration: 0.25 }, TOTAL - 0.25);
      tl.set({}, {}, TOTAL);
      projEls.forEach((el, j) => {
        const hs = holdStart(PROJ_T[j]), at = hs - 0.02;
        const lines = [$('.pname a', el), $('.tag span', el), ...$('.desc', el).__lines, $('.lk', el)];
        gsap.set(lines, { yPercent: 115 });
        gsap.set($('.pmark', el), { autoAlpha: 0 });
        tl.set(el, { autoAlpha: 1 }, at)
          .to(lines, { yPercent: 0, duration: 0.32, ease: 'power3.out', stagger: 0.045 }, at)
          .to($('.pmark', el), { autoAlpha: 1, duration: 0.4 }, at)
          .to([...lines, $('.pmark', el)], { yPercent: -115, duration: 0.28, ease: 'power2.in', stagger: 0.02, immediateRender: false }, hs + HOLD)
          .set(el, { autoAlpha: 0 }, hs + HOLD + 0.36);
      });
      /* index: the 8 dots land on the DOM rows, then the field loosens into the drift behind it */
      ScrollTrigger.create({ trigger: indexEl, start: 'top bottom', end: 'top 38%', scrub: true, onUpdate: s => { state.h = s.progress; } });
      ScrollTrigger.create({ trigger: indexEl, start: 'top 38%', end: 'top -15%', scrub: true, onUpdate: s => { state.dr = s.progress; indexEl.style.setProperty('--dot', clamp(s.progress * 4).toFixed(3)); } });
      window.__sq = { state, tl, st: pinST, TOTAL, holdStart, setNoSnap: v => { noSnap = v; }, N: () => N };
    });
  }

  function goToWork(e) {
    if (!root.classList.contains('gl') || !pinST) return;
    e.preventDefault();
    const y = pinST.start + (holdStart(1) + HOLD * 0.5) / TOTAL * (pinST.end - pinST.start);
    scrollTo({ top: y, behavior: 'smooth' });
  }
  const navWork = $('#nav-work'); navWork && navWork.addEventListener('click', goToWork);

  /* ---------------- boot ---------------- */
  await Promise.race([
    Promise.all([document.fonts.load('600 100px "Inter Tight"'), document.fonts.load('400 12px "JetBrains Mono"')]).then(() => document.fonts.ready),
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
