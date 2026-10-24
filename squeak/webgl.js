/* Pond light: a soft caustic field behind the duck pile.
   Raw WebGL, one fragment shader, one full-screen triangle. It is decoration
   only and draws no ducks. It follows the pointer (a slow swell under it) and
   the scroll (the light drifts and dims as the stage opens). Ink tones with a
   faint yellow sheen on the brightest ripples.
   Never runs under reduced motion, without WebGL, in a hidden tab or off screen;
   the stage's flat Ink background is the fallback. Backing store is capped at
   1.5 device pixels and drawn at 60 percent of that: the field is soft, and
   the browser scales it up smoothly. ~30 frames a second, no more. */
(function () {
  "use strict";

  var stage = document.querySelector("[data-stage]");
  var canvas = stage && stage.querySelector("canvas[data-gl]");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var gl = null;
  try {
    gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power", preserveDrawingBuffer: false });
  } catch (e) {
    gl = null;
  }
  if (!gl) return;

  var VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";
  var FRAG = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "uniform vec2 u_res;",
    "uniform float u_time;",
    "uniform vec2 u_mouse;",
    "uniform float u_amt;",
    "uniform float u_scroll;",
    "float caustic(vec2 p, float t) {",
    "  vec2 i = p;",
    "  float c = 1.0;",
    "  for (int n = 0; n < 4; n++) {",
    "    float tt = t * (1.0 - (3.5 / float(n + 1)));",
    "    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));",
    "    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.006), p.y / (cos(i.y + tt) / 0.006)));",
    "  }",
    "  c /= 4.0;",
    "  c = 1.17 - pow(c, 1.4);",
    "  return pow(abs(c), 7.0);",
    "}",
    "float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / u_res;",
    "  float aspect = u_res.x / u_res.y;",
    "  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 5.0;",
    "  vec2 o = vec2(-250.0);",
    "  vec2 m = (u_mouse - 0.5) * vec2(aspect, 1.0) * 5.0;",
    "  vec2 d = p - m;",
    "  float swell = exp(-dot(d, d) * 0.55) * u_amt;",
    "  p += d * swell * 0.22;",
    "  p.y += u_scroll * 1.6;",
    "  p += o;",
    "  float t = u_time * 0.14 + swell * 0.6;",
    "  float c = caustic(p, t) * 0.7 + caustic(p * 0.62 + 3.1, t * 0.8 + 1.7) * 0.5;",
    "  c = smoothstep(0.0, 1.0, c);",
    "  vec3 ink = vec3(0.094, 0.098, 0.106);",
    "  vec3 lift = vec3(0.150, 0.158, 0.172);",
    "  vec3 sheen = vec3(1.0, 0.855, 0.10);",
    "  float dim = 1.0 - smoothstep(0.0, 0.9, u_scroll) * 0.55;",
    "  float vig = smoothstep(1.05, 0.25, length((uv - vec2(0.5, 0.42)) * vec2(0.9, 1.0)));",
    "  vec3 col = ink + (lift - ink) * (0.3 + 0.7 * uv.y) * 0.25;",
    "  col += (lift - ink) * c * 2.2 * vig * dim;",
    "  col += sheen * pow(c, 2.5) * 0.09 * vig * dim;",
    "  col += (hash(gl_FragCoord.xy + u_time) - 0.5) / 255.0;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "u_res");
  var uTime = gl.getUniformLocation(prog, "u_time");
  var uMouse = gl.getUniformLocation(prog, "u_mouse");
  var uAmt = gl.getUniformLocation(prog, "u_amt");
  var uScroll = gl.getUniformLocation(prog, "u_scroll");

  var running = false;
  var visible = true;
  var lost = false;
  var lastDraw = 0;
  var t0 = performance.now();
  var mouse = { x: 0.7, y: 0.4, tx: 0.7, ty: 0.4, amt: 0, tamt: 0 };
  var stageH = 1;

  function size() {
    var r = stage.getBoundingClientRect();
    var scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
    var w = Math.max(2, Math.round(r.width * scale));
    var h = Math.max(2, Math.round(r.height * scale));
    stageH = Math.max(1, r.height);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function draw(now) {
    var k = 0.06;
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    mouse.amt += (mouse.tamt - mouse.amt) * 0.05;
    var scroll = Math.max(0, Math.min(1, (window.scrollY || 0) / stageH));
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.uniform1f(uAmt, mouse.amt);
    gl.uniform1f(uScroll, scroll);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - lastDraw < 32) return; // ~30 fps
    lastDraw = now;
    draw(now);
    if (!canvas.classList.contains("is-live")) canvas.classList.add("is-live");
  }

  function start() {
    if (running || !visible || document.hidden || lost) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
  }

  stage.addEventListener(
    "pointermove",
    function (e) {
      var r = stage.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / r.width;
      mouse.ty = 1 - (e.clientY - r.top) / r.height;
      mouse.tamt = 1;
    },
    { passive: true }
  );
  stage.addEventListener(
    "pointerleave",
    function () {
      mouse.tamt = 0;
    },
    { passive: true }
  );
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) start();
      else stop();
    }).observe(stage);
  }
  if ("ResizeObserver" in window) {
    var pending = 0;
    new ResizeObserver(function () {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = 0;
        size();
        if (!running) draw(performance.now());
      });
    }).observe(stage);
  }
  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    lost = true;
    stop();
    canvas.classList.remove("is-live");
  });

  size();
  draw(t0);
  start();
})();
