/* Story page motion. Classic deferred script using window.gsap and ScrollTrigger.
   Everything here is enhancement. With no script, or with reduced motion, the page is a plain
   list of chapters, all readable, in order. With motion allowed:
   - wide and tall screens (>= 900 x 620): a pinned horizontal timeline scrubbed by scroll
     (html.js-story-d): a yellow path draws itself, a duck travels it, the commit counter climbs,
     and the lone duck becomes a small flock;
   - everything else: a vertical timeline (html.js-story-m): the line draws as you scroll and
     each chapter's scene plays when it arrives.
   Only transform and opacity change (plus the path's stroke-dashoffset). */
(function () {
  "use strict";

  var root = document.documentElement;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var story = $("#story");
  if (!story) return;

  var MOTION = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DESK = "(min-width: 900px) and (min-height: 620px)";
  var chapters = $$("[data-chapter]", story);
  var ends = chapters.map(function (c) { return Number(c.getAttribute("data-end")); });
  var shorts = chapters.map(function (c) { return c.getAttribute("data-short") || ""; });
  var hudDate = $("[data-hud-date]", story);
  var hudCount = $("[data-hud-count]", story);
  var track = $("[data-track]", story);
  var list = $("[data-chapters]", story);
  var svg = $("[data-path-svg]", story);
  var pBase = $("[data-p-base]", story);
  var pDraw = $("[data-p-draw]", story);
  var vdraw = $("[data-vline]", story);
  var lead = $("[data-rider]", story);
  var followers = $$("[data-follower]", story);
  var gsap = MOTION ? window.gsap : null;
  var ST = MOTION ? window.ScrollTrigger : null;
  var mm = null;
  var lenis = null;
  var lastW = 0, lastH = 0;

  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function setCount(n) { if (hudCount) hudCount.textContent = fmt(n); }

  // Scenes are drawn in a 420 x 300 box and scaled to the room there is (decorative; the text carries the story).
  function fitScenes() {
    var k;
    if (root.classList.contains("js-story-d")) {
      k = clamp((innerHeight * 0.46 - 54) / 300, 0.5, 1);
    } else {
      var w = chapters[0] ? chapters[0].clientWidth : 300;
      k = clamp(w / 420, 0.5, 1);
    }
    root.style.setProperty("--k", k.toFixed(3));
  }

  // ---------- pinned horizontal timeline ----------
  function buildDesktop() {
    root.classList.add("js-story-d");
    story.setAttribute("data-mode", "d");
    var vw = innerWidth, vh = innerHeight;
    var cw = clamp(vw * 0.36, 500, 640);
    var r = Math.max(150, vw * 0.16);
    root.style.setProperty("--cw", cw + "px");
    root.style.setProperty("--r", r + "px");
    root.style.setProperty("--fx", Math.max(32, (vw - 1280) / 2 + 40) + "px");
    fitScenes();

    var xs = chapters.map(function (c) { return c.offsetLeft; });
    var trackW = list.offsetWidth;
    var yBase = vh * 0.54;
    var amp = 14;
    // Path: gentle S-curves through points half a chapter apart; x always increases.
    var step = cw / 2;
    var pts = [];
    for (var x = 0, i = 0; x <= trackW + step; x += step, i++) pts.push([x, yBase + (i % 2 ? amp : -amp)]);
    var d = "M" + pts[0][0] + " " + pts[0][1];
    for (var j = 1; j < pts.length; j++) {
      var a = pts[j - 1], b = pts[j], mx = (a[0] + b[0]) / 2;
      d += " C" + mx + " " + a[1] + " " + mx + " " + b[1] + " " + b[0] + " " + b[1];
    }
    svg.setAttribute("viewBox", "0 0 " + trackW + " " + vh);
    svg.setAttribute("width", trackW);
    svg.setAttribute("height", vh);
    pBase.setAttribute("d", d);
    pDraw.setAttribute("d", d);
    var total = pDraw.getTotalLength();
    var N = 700, sx = [], sy = [], sl = [];
    for (var n = 0; n <= N; n++) {
      var pt = pDraw.getPointAtLength((total * n) / N);
      sx.push(pt.x); sy.push(pt.y); sl.push((total * n) / N);
    }
    function sample(arr, X) {
      var lo = 0, hi = N;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (sx[mid] <= X) lo = mid; else hi = mid; }
      var span = sx[hi] - sx[lo] || 1, t = clamp((X - sx[lo]) / span, 0, 1);
      return arr[lo] + (arr[hi] - arr[lo]) * t;
    }
    pDraw.style.strokeDasharray = total;
    pDraw.style.strokeDashoffset = total;
    // A stop on the path at each chapter.
    $$(".stop", svg).forEach(function (e) { e.remove(); });
    var stops = xs.map(function (cx) {
      var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("class", "stop");
      c.setAttribute("cx", cx);
      c.setAttribute("cy", sample(sy, cx));
      c.setAttribute("r", 9);
      svg.appendChild(c);
      return c;
    });

    var x0 = xs[0];
    var last = chapters.length - 1;
    var xEnd = xs[last] + 110;
    var scrollMax = Math.max(1, trackW - vw);
    var leadW = lead.offsetWidth, leadH = lead.offsetHeight;
    var setLX = gsap.quickSetter(lead, "x", "px"), setLY = gsap.quickSetter(lead, "y", "px"), setLR = gsap.quickSetter(lead, "rotation", "deg");
    var fol = followers.map(function (f) {
      return { w: f.offsetWidth, h: f.offsetHeight, x: gsap.quickSetter(f, "x", "px"), y: gsap.quickSetter(f, "y", "px"), o: gsap.quickSetter(f, "opacity"), r: gsap.quickSetter(f, "rotation", "deg") };
    });
    var activeIdx = -1;
    var setTrackX = gsap.quickSetter(track, "x", "px");

    function render(s) {
      var X = x0 + s * (xEnd - x0);
      var screenOff = -scrollMax * s;
      setTrackX(screenOff);
      var y = sample(sy, X), y2 = sample(sy, X + 40);
      var bob = Math.sin(s * 140) * 2;
      setLX(X + screenOff - leadW / 2);
      setLY(y - leadH + 10 + bob);
      setLR(Math.atan2(y2 - y, 40) * 22 + Math.sin(s * 140) * 2);
      pDraw.style.strokeDashoffset = total - sample(sl, X);
      // The flock: followers fall in behind the lead from the engine chapter on.
      var f0 = xs[Math.min(7, last)], f1 = xs[last];
      var f = clamp((X - f0) / Math.max(1, f1 - f0), 0, 1) * (fol.length + 0.4);
      for (var q = 0; q < fol.length; q++) {
        var off = 62 + q * 52;
        var fx = X - off, fy = sample(sy, Math.max(0, fx));
        fol[q].x(fx + screenOff - fol[q].w / 2);
        fol[q].y(fy - fol[q].h + 8 + Math.sin(s * 140 + q * 1.7) * 3);
        fol[q].o(clamp(f - q, 0, 1));
        fol[q].r(Math.sin(s * 90 + q) * 5);
      }
      // Counter and date: the running total climbs from the previous chapter's total across each stretch.
      var idx = 0;
      for (var c = 0; c < xs.length; c++) if (X >= xs[c] - cw * 0.1) idx = c;
      var segEnd = idx < last ? xs[idx + 1] : xEnd;
      var t = clamp((X - xs[idx]) / Math.max(1, segEnd - xs[idx]), 0, 1);
      var from = idx === 0 ? 0 : ends[idx - 1];
      var count = X < xs[0] ? 0 : from + (ends[idx] - from) * (1 - Math.pow(1 - t, 2));
      setCount(s >= 0.999 ? ends[last] : count);
      if (idx !== activeIdx) { activeIdx = idx; hudDate.textContent = shorts[idx]; story.setAttribute("data-active", String(idx)); }
      for (var k = 0; k < chapters.length; k++) {
        chapters[k].classList.toggle("is-on", X >= xs[k] - cw * 0.55);
        stops[k].classList.toggle("is-lit", X >= xs[k] - 2);
      }
      story.setAttribute("data-progress", s.toFixed(3));
    }
    var state = { p: 0 };
    render(0);
    gsap.to(state, {
      p: 1, ease: "none", onUpdate: function () { render(state.p); },
      scrollTrigger: { id: "story", trigger: story, start: "top top", end: "+=" + scrollMax, pin: true, scrub: 0.5, anticipatePin: 1 }
    });
    return function () {
      root.classList.remove("js-story-d");
      ["--cw", "--r", "--fx"].forEach(function (v) { root.style.removeProperty(v); });
      story.removeAttribute("data-mode");
      story.removeAttribute("data-progress");
      story.removeAttribute("data-active");
      gsap.set([track, lead].concat(followers), { clearProps: "all" });
      pDraw.style.strokeDasharray = "";
      pDraw.style.strokeDashoffset = "";
      $$(".stop", svg).forEach(function (e) { e.remove(); });
      chapters.forEach(function (c) { c.classList.remove("is-on"); });
      hudDate.textContent = shorts[0];
      setCount(0);
    };
  }

  // ---------- vertical timeline ----------
  function buildVertical() {
    root.classList.add("js-story-m");
    story.setAttribute("data-mode", "m");
    fitScenes();
    var counter = { v: 0 };
    function countTo(n) {
      gsap.to(counter, { v: n, duration: 0.9, ease: "power2.out", overwrite: true, onUpdate: function () { setCount(counter.v); } });
    }
    chapters.forEach(function (ch, i) {
      ST.create({
        trigger: ch, start: "top 78%", end: "bottom top",
        onEnter: function () { ch.classList.add("is-on"); },
        onLeaveBack: function () { ch.classList.remove("is-on"); }
      });
      ST.create({
        trigger: ch, start: "top 55%", end: "bottom 55%",
        onToggle: function (self) {
          if (self.isActive) { hudDate.textContent = shorts[i]; countTo(ends[i]); story.setAttribute("data-active", String(i)); }
        },
        onLeaveBack: function () { if (i === 0) { hudDate.textContent = shorts[0]; countTo(0); } }
      });
    });
    var setLY = gsap.quickSetter(lead, "y", "px");
    ST.create({
      trigger: list, start: "top 60%", end: "bottom 60%", scrub: true,
      onUpdate: function (self) {
        var h = list.offsetHeight - 24;
        gsap.set(vdraw, { scaleY: self.progress });
        setLY(12 + self.progress * h);
        story.setAttribute("data-progress", self.progress.toFixed(3));
      }
    });
    gsap.set(vdraw, { scaleY: 0 });
    setLY(12);
    return function () {
      root.classList.remove("js-story-m");
      story.removeAttribute("data-mode");
      story.removeAttribute("data-progress");
      story.removeAttribute("data-active");
      gsap.set([vdraw, lead], { clearProps: "all" });
      chapters.forEach(function (c) { c.classList.remove("is-on"); });
      hudDate.textContent = shorts[0];
      setCount(0);
    };
  }

  function build() {
    lastW = innerWidth; lastH = innerHeight;
    fitScenes();
    if (!gsap || !ST) return;
    gsap.registerPlugin(ST);
    mm = gsap.matchMedia();
    mm.add({ desk: DESK, mob: "(max-width: 899px), (max-height: 619px)" }, function (ctx) {
      var cleanup = ctx.conditions.desk ? buildDesktop() : buildVertical();
      return function () { cleanup(); };
    });
    ST.refresh();
  }

  function init() {
    if (gsap && ST) {
      ST.config({ ignoreMobileResize: true });
      if (window.Lenis) {
        lenis = new window.Lenis({ autoRaf: false, lerp: 0.1, anchors: true });
        lenis.on("scroll", ST.update);
        gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
        gsap.ticker.lagSmoothing(0);
      }
    }
    build();
    var timer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var deskNow = window.matchMedia(DESK).matches;
        var widthChanged = Math.abs(innerWidth - lastW) > 1;
        var heightChanged = deskNow && Math.abs(innerHeight - lastH) > 40;
        if (!widthChanged && !heightChanged) { fitScenes(); return; }
        if (mm) { mm.revert(); mm = null; }
        build();
      }, 200);
    });
  }

  function start() {
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      if (typeof window.SqueakShown === "function") window.SqueakShown(init); else init();
    });
  }
  if (document.readyState === "complete") start(); else window.addEventListener("load", start);
})();
