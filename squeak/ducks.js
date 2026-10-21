/* The duck pile: a small 2D rigid-body solver on a canvas.
   Each duck is one rigid body made of two circles (body and head), so it can
   tip and settle. Gravity, circle contacts with a few sequential-impulse
   passes, friction, low restitution, walls and a static panel rectangle.
   Fixed timestep. The loop sleeps when everything has settled, pauses while the
   stage is off screen or the tab is hidden, and wakes on the pointer.
   Sprites are the existing duck files, taken from the static pile <img>s,
   which stay on the page as the no-script and reduced-motion fallback. */
(function () {
  "use strict";

  var stage = document.querySelector("[data-stage]");
  var field = stage && stage.querySelector("[data-field]");
  var canvas = field && field.querySelector("canvas");
  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!canvas || reduce || !canvas.getContext) return fail();

  function fail() {
    root.classList.remove("ducks-pending");
  }

  // Collider circles per sprite, in units of the sprite's width, from the
  // sprite's top-left. The sprite is drawn around its centre of mass.
  var KINDS = {
    brand: { ratio: 861.65 / 1000, circles: [[0.27, 0.58, 0.27], [0.6, 0.6, 0.26], [0.6, 0.23, 0.22]] },
    mood: { ratio: 1, circles: [[0.33, 0.65, 0.22], [0.6, 0.65, 0.22], [0.57, 0.35, 0.2]] },
  };

  var G = 2000; // px/s^2
  var STEP = 1 / 120;
  var ITER = 6;
  var FRICTION = 0.55;
  var BOUNCE = 0.18;
  var RIGHTING = 34;
  var CALM_SPEED = 26;
  var CALM_SPIN = 0.5;

  var ctx = canvas.getContext("2d");
  var sprites = Array.prototype.slice.call(stage.querySelectorAll(".pile [data-duck]"));
  var perch = stage.querySelector("[data-perch]");
  var bodies = [];
  var W = 0;
  var H = 0; // floor: the bottom of the frame
  var PAD = 0; // the canvas bleeds this far past each side wall, so a tail resting on a wall is not cut
  var CH = 0; // canvas height: the frame plus the overshoot below it
  var dpr = 1;
  var panel = null; // static rectangle in canvas coordinates, or null
  var running = false;
  var visible = true;
  var asleep = false;
  var last = 0;
  var acc = 0;
  var frames = 0;
  var pointer = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, t: 0, inside: false };

  function seeded() {
    var s = 7;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }
  var rand = seeded();

  function measure() {
    var r = field.getBoundingClientRect();
    W = r.width;
    H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cr = canvas.getBoundingClientRect();
    CH = cr.height || H;
    PAD = Math.max(0, (cr.width - W) / 2);
    canvas.width = Math.round((W + PAD * 2) * dpr);
    canvas.height = Math.round(CH * dpr);
    var p = stage.querySelector("[data-panel]");
    panel = null;
    if (p) {
      // layout offsets, not the bounding box: the panel is still sliding in when this runs
      var x0 = p.offsetLeft - field.offsetLeft;
      var y0 = p.offsetTop - field.offsetTop;
      // a duck's bill and tail stick out past its circles, so the collider is a little larger than the panel
      panel = { x0: x0 - 20, y0: y0 - 4, x1: x0 + p.offsetWidth, y1: y0 + p.offsetHeight };
    }
  }

  function makeBody(img, index, count) {
    var kind = KINDS[img.getAttribute("data-duck")] || KINDS.brand;
    var small = W < 700;
    var base = small ? 88 : Math.min(144, Math.max(100, W * 0.108));
    var w = base * (0.8 + rand() * 0.35);
    var h = w * kind.ratio;
    var cs = kind.circles.map(function (c) {
      return { x: c[0] * w, y: c[1] * w, r: c[2] * w };
    });
    // centre of mass: area-weighted circle centres
    var area = 0;
    var cx = 0;
    var cy = 0;
    cs.forEach(function (c) {
      var a = c.r * c.r;
      area += a;
      cx += c.x * a;
      cy += c.y * a;
    });
    cx /= area;
    cy /= area;
    var inertia = 0;
    cs.forEach(function (c) {
      c.dx = c.x - cx;
      c.dy = c.y - cy;
      inertia += c.r * c.r * (c.r * c.r * 0.5 + c.dx * c.dx + c.dy * c.dy);
    });
    // Drop in from above, spread across the free width, staggered in time.
    var free0 = 0;
    var free1 = panel && W > 700 ? panel.x0 + (panel.x1 - panel.x0) * 0.3 : W * 0.94;
    var t = index / count;
    return {
      img: img,
      w: w,
      h: h,
      ox: cx,
      oy: cy,
      circles: cs,
      x: /needs_you/.test(img.src) && panel ? panel.x0 + (panel.x1 - panel.x0) * 0.62 : free0 + w * 0.7 + rand() * Math.max(10, free1 - free0 - w * 1.4),
      y: -w * (0.6 + t * 9) - rand() * 40,
      a: (rand() - 0.5) * 1.6,
      vx: (rand() - 0.5) * 120,
      vy: 0,
      w2: (rand() - 0.5) * 3,
      invM: 1 / (area * 0.02),
      invI: 1 / (inertia * 0.02),
      calm: 0,
      sleeping: false,
    };
  }

  function build() {
    measure();
    var limit = W < 700 ? 10 : 26;
    var list = sprites.slice(0, limit);
    // the needs-you duck drops last, onto the top edge of the panel, beside its own row
    if (perch) list.push(perch);
    bodies = list.map(function (img, i) {
      return makeBody(img, i, list.length);
    });
  }

  // ---- contacts ----
  var contacts = [];

  function addContact(a, b, px, py, nx, ny, depth) {
    contacts.push({ a: a, b: b, px: px, py: py, nx: nx, ny: ny, depth: depth, jn: 0, jt: 0 });
  }

  function worldCircle(b, c) {
    var cos = Math.cos(b.a);
    var sin = Math.sin(b.a);
    return { x: b.x + c.dx * cos - c.dy * sin, y: b.y + c.dx * sin + c.dy * cos, r: c.r };
  }

  function collide() {
    contacts.length = 0;
    var n = bodies.length;
    var wc = bodies.map(function (b) {
      return b.circles.map(function (c) {
        return worldCircle(b, c);
      });
    });
    for (var i = 0; i < n; i++) {
      var a = bodies[i];
      for (var k = 0; k < wc[i].length; k++) {
        var c = wc[i][k];
        // walls: floor and both sides (no ceiling, ducks fall in from above)
        if (c.y + c.r > H) addContact(a, null, c.x, H, 0, -1, c.y + c.r - H);
        if (c.x - c.r < 0) addContact(a, null, 0, c.y, 1, 0, c.r - c.x);
        if (c.x + c.r > W) addContact(a, null, W, c.y, -1, 0, c.x + c.r - W);
        if (panel) {
          var qx = Math.max(panel.x0, Math.min(c.x, panel.x1));
          var qy = Math.max(panel.y0, Math.min(c.y, panel.y1));
          var dx = c.x - qx;
          var dy = c.y - qy;
          var d2 = dx * dx + dy * dy;
          if (d2 < c.r * c.r && d2 > 1e-6) {
            var d = Math.sqrt(d2);
            addContact(a, null, qx, qy, dx / d, dy / d, c.r - d);
          } else if (d2 <= 1e-6 && c.y > panel.y0 && c.y < panel.y1 && c.x > panel.x0 && c.x < panel.x1) {
            // centre inside the rectangle: leave through the nearest side
            var up = c.y - panel.y0;
            var left = c.x - panel.x0;
            var right = panel.x1 - c.x;
            if (up <= left && up <= right) addContact(a, null, c.x, panel.y0, 0, -1, up + c.r);
            else if (left < right) addContact(a, null, panel.x0, c.y, -1, 0, left + c.r);
            else addContact(a, null, panel.x1, c.y, 1, 0, right + c.r);
          }
        }
      }
      for (var j = i + 1; j < n; j++) {
        var b = bodies[j];
        var ddx = a.x - b.x;
        var ddy = a.y - b.y;
        var reach = a.w + b.w;
        if (ddx * ddx + ddy * ddy > reach * reach) continue;
        for (var k1 = 0; k1 < wc[i].length; k1++) {
          for (var k2 = 0; k2 < wc[j].length; k2++) {
            var p = wc[i][k1];
            var q = wc[j][k2];
            var ex = p.x - q.x;
            var ey = p.y - q.y;
            var rr = p.r + q.r;
            var dd = ex * ex + ey * ey;
            if (dd >= rr * rr) continue;
            var dist = Math.sqrt(dd) || 0.001;
            var nx = ex / dist;
            var ny = ey / dist;
            var depth = rr - dist;
            addContact(a, b, q.x + nx * q.r, q.y + ny * q.r, nx, ny, depth);
          }
        }
      }
    }
  }

  function relVel(c) {
    var a = c.a;
    var b = c.b;
    var rax = c.px - a.x;
    var ray = c.py - a.y;
    var vx = a.vx - a.w2 * ray;
    var vy = a.vy + a.w2 * rax;
    if (b) {
      var rbx = c.px - b.x;
      var rby = c.py - b.y;
      vx -= b.vx - b.w2 * rby;
      vy -= b.vy + b.w2 * rbx;
    }
    return [vx, vy, rax, ray];
  }

  function applyImpulse(c, ix, iy) {
    var a = c.a;
    var b = c.b;
    var rax = c.px - a.x;
    var ray = c.py - a.y;
    a.vx += ix * a.invM;
    a.vy += iy * a.invM;
    a.w2 += (rax * iy - ray * ix) * a.invI;
    if (b) {
      var rbx = c.px - b.x;
      var rby = c.py - b.y;
      b.vx -= ix * b.invM;
      b.vy -= iy * b.invM;
      b.w2 -= (rbx * iy - rby * ix) * b.invI;
    }
  }

  function effMass(c, dx, dy) {
    var a = c.a;
    var b = c.b;
    var rax = c.px - a.x;
    var ray = c.py - a.y;
    var ca = rax * dy - ray * dx;
    var k = a.invM + ca * ca * a.invI;
    if (b) {
      var rbx = c.px - b.x;
      var rby = c.py - b.y;
      var cb = rbx * dy - rby * dx;
      k += b.invM + cb * cb * b.invI;
    }
    return 1 / k;
  }

  function solve() {
    var i;
    for (i = 0; i < contacts.length; i++) {
      var c = contacts[i];
      var rv = relVel(c);
      var vn = rv[0] * c.nx + rv[1] * c.ny;
      c.bias = vn < -120 ? -BOUNCE * vn : 0; // bounce only on a real impact
    }
    for (var it = 0; it < ITER; it++) {
      for (i = 0; i < contacts.length; i++) {
        var k = contacts[i];
        var v = relVel(k);
        var normal = v[0] * k.nx + v[1] * k.ny;
        var jn = (-normal + k.bias) * effMass(k, k.nx, k.ny);
        var old = k.jn;
        k.jn = Math.max(0, old + jn);
        jn = k.jn - old;
        applyImpulse(k, jn * k.nx, jn * k.ny);

        v = relVel(k);
        var tx = -k.ny;
        var ty = k.nx;
        var jt = -(v[0] * tx + v[1] * ty) * effMass(k, tx, ty);
        var max = FRICTION * k.jn;
        var oldt = k.jt;
        k.jt = Math.max(-max, Math.min(max, oldt + jt));
        jt = k.jt - oldt;
        applyImpulse(k, jt * tx, jt * ty);
      }
    }
    // push overlaps apart by position, share by inverse mass
    for (i = 0; i < contacts.length; i++) {
      var p = contacts[i];
      var push = Math.max(0, p.depth - 0.5) * 0.4;
      var sum = p.a.invM + (p.b ? p.b.invM : 0);
      p.a.x += p.nx * push * (p.a.invM / sum);
      p.a.y += p.ny * push * (p.a.invM / sum);
      if (p.b) {
        p.b.x -= p.nx * push * (p.b.invM / sum);
        p.b.y -= p.ny * push * (p.b.invM / sum);
      }
    }
  }

  function step(dt) {
    var allCalm = true;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      b.vy += G * dt;
      var damp = Math.exp(-0.35 * dt);
      b.vx *= damp;
      b.vy *= damp;
      b.w2 *= Math.exp(-1.4 * dt);
      if (b.calm < 0.4) b.w2 -= Math.sin(b.a) * RIGHTING * dt; // a rubber duck rights itself, until it has come to rest
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += b.w2 * dt;
    }
    collide();
    solve();
    for (var j = 0; j < bodies.length; j++) {
      var d = bodies[j];
      var slow = Math.abs(d.vx) + Math.abs(d.vy) < CALM_SPEED && Math.abs(d.w2) < CALM_SPIN;
      d.calm = slow ? d.calm + dt : 0;
      if (d.calm > 0.4) {
        d.vx = d.vy = d.w2 = 0;
      }
      if (d.calm < 0.6 || d.y < 0) allCalm = false;
    }
    return allCalm;
  }

  // ---- pointer: push, and a hop on click ----
  var RADIUS = 120;

  function toField(e) {
    var r = field.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function wake() {
    asleep = false;
    canvas.setAttribute("data-state", "running");
    bodies.forEach(function (b) {
      b.calm = 0;
    });
    start();
  }

  function onMove(e) {
    var p = toField(e);
    var now = performance.now();
    var dt = Math.max(1, now - pointer.t) / 1000;
    pointer.vx = (p.x - pointer.x) / dt;
    pointer.vy = (p.y - pointer.y) / dt;
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.t = now;
    pointer.inside = true;
    var speed = Math.min(Math.hypot(pointer.vx, pointer.vy), 2500);
    var moved = false;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      var dx = b.x - p.x;
      var dy = b.y - p.y;
      var d = Math.hypot(dx, dy);
      if (d > RADIUS + b.w * 0.3 || d < 1) continue;
      var fall = 1 - d / (RADIUS + b.w * 0.3);
      var push = (60 + speed * 0.22) * fall;
      b.vx += (dx / d) * push + pointer.vx * 0.02 * fall;
      b.vy += (dy / d) * push * 0.8 + pointer.vy * 0.02 * fall - 30 * fall;
      b.w2 += ((dx > 0 ? 1 : -1) * push) / 140;
      b.calm = 0;
      moved = true;
    }
    if (moved && (asleep || !running)) wake();
  }

  function onDown(e) {
    var p = toField(e);
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      var d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d > RADIUS * 1.2) continue;
      var fall = 1 - d / (RADIUS * 1.2);
      b.vy -= 520 * fall + 80;
      b.vx += (b.x - p.x) * 1.2 * fall;
      b.w2 += (b.x > p.x ? 1 : -1) * 3 * fall;
      b.calm = 0;
    }
    wake();
  }

  function onLeave() {
    pointer.inside = false;
  }

  // ---- drawing and the loop ----
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, PAD * dpr, 0);
    ctx.clearRect(-PAD, 0, W + PAD * 2, CH);
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.drawImage(b.img, -b.ox, -b.oy, b.w, b.h);
      ctx.restore();
    }
  }

  function frame(now) {
    if (!running) return;
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    acc += dt;
    var calm = false;
    while (acc >= STEP) {
      calm = step(STEP);
      acc -= STEP;
    }
    draw();
    frames++;
    canvas.setAttribute("data-frames", String(frames));
    canvas.setAttribute("data-awake", String(bodies.filter(function (b) { return b.calm < 0.6 || b.y < 0; }).length));
    if (calm) {
      asleep = true;
      running = false;
      canvas.setAttribute("data-state", "asleep");
      return;
    }
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || !visible || document.hidden || !bodies.length) return;
    running = true;
    last = performance.now();
    acc = 0;
    canvas.setAttribute("data-state", "running");
    requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
  }

  function init() {
    build();
    if (!bodies.length || W < 50) return fail();
    root.classList.remove("ducks-pending");
    root.classList.add("ducks-live");
    canvas.setAttribute("data-state", "running");
    draw();
    stage.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("pointerdown", onDown, { passive: true });
    stage.addEventListener("pointerleave", onLeave, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pause();
      else if (!asleep) start();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        if (!visible) pause();
        else if (!asleep) start();
      }).observe(stage);
    }
    var width = field.getBoundingClientRect().width;
    var timer = 0;
    window.addEventListener("resize", function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        var w = field.getBoundingClientRect().width;
        if (Math.abs(w - width) < 1 && Math.abs(field.getBoundingClientRect().height - H) < 1) return;
        width = w;
        measure();
        bodies.forEach(function (b) {
          b.x = Math.max(b.w * 0.5, Math.min(b.x, W - b.w * 0.5));
          b.y = Math.min(b.y, H - b.w * 0.5);
        });
        wake();
      }, 150);
    });
    start();
  }

  // Sprites must be decoded before they can be drawn.
  var pending = sprites.filter(function (img) {
    return !(img.complete && img.naturalWidth > 0);
  });
  if (!pending.length) init();
  else {
    var left = pending.length;
    var done = function () {
      if (--left === 0) init();
    };
    pending.forEach(function (img) {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", fail, { once: true });
    });
  }
})();
