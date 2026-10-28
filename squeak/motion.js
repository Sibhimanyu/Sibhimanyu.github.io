/* Squeak page motion. Classic deferred script using window.gsap, ScrollTrigger,
   SplitText. Everything here is enhancement: with no script or with
   reduced motion every section is already present as readable content, and a
   scene is only switched on (an html class) after it is measured to fit.
   Each scene has a desktop and a phone variant (gsap.matchMedia), built in page
   order after fonts load, and rebuilt when the window width changes.
   Only transform and opacity animate (plus the hero stage's clip-path). */
(function () {
  "use strict";

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  if (window.SplitText) gsap.registerPlugin(window.SplitText);
  ScrollTrigger.config({ ignoreMobileResize: true });

  var root = document.documentElement;
  var mm = gsap.matchMedia();
  var lenis = null;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return gsap.utils.toArray(sel, ctx); };

  var MOTION = "(prefers-reduced-motion: no-preference)";
  var HERO_QUERY = "(min-width: 900px) and (min-height: 620px) and " + MOTION;
  var SCENE = { desk: "(min-width: 900px) and (min-height: 620px) and " + MOTION, mob: "(max-width: 899px) and " + MOTION };

  // DESIGN.md's motion-emphasis curve, cubic-bezier(0.2, 0.9, 0.3, 1.2), as a GSAP ease.
  function bezier(x1, y1, x2, y2) {
    function at(t, a, b) { return 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t; }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 24; i++) {
        var v = at(t, x1, x2);
        if (Math.abs(v - x) < 1e-4) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return at(t, y1, y2);
    };
  }
  var EMPH = bezier(0.2, 0.9, 0.3, 1.2);

  // Smooth, inertial scroll on the real scroll position (motion allowed).
  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", function () {
    if (!window.Lenis) return;
    lenis = new window.Lenis({ autoRaf: false, lerp: 0.1, anchors: true });
    lenis.on("scroll", ScrollTrigger.update);
    function tick(time) {
      lenis.raf(time * 1000);
    }
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return function () {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenis = null;
    };
  });

  // Hero scroll handoff: the stage opens from its inset frame to full bleed (clip-path)
  // while the headline rises and fades, leading into the Conductor overview.
  // Wide, tall screens only; elsewhere the framed stage simply scrolls away.
  gsap.matchMedia().add(HERO_QUERY, function () {
    var hero = document.querySelector(".hero");
    var stage = document.querySelector("[data-stage]");
    var text = document.querySelector("[data-hero-text]");
    if (!hero || !stage) return;
    var tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        id: "stage",
        trigger: hero,
        start: "top top",
        end: "bottom 40%",
        scrub: 0.4,
        invalidateOnRefresh: true,
      },
    });
    tl.fromTo(
      stage,
      { "--mx": "12px", "--my": "12px", "--mb": "12px", "--r": "28px" },
      { "--mx": "0px", "--my": "0px", "--mb": "0px", "--r": "0px", duration: 1 },
      0
    );
    if (text) tl.to(text, { y: -96, autoAlpha: 0, duration: 0.6, ease: "power1.in" }, 0);
  });

  // Hero entrance, motion allowed: the headline's words rise out of their lines,
  // then the rest of the copy follows. The pile pours on its own (ducks.js). With
  // no SplitText the copy simply appears; the CSS fallback shows it after 3 s anyway.
  mm.add("(prefers-reduced-motion: no-preference)", function () {
    var title = document.querySelector("[data-hero-title]");
    var ins = gsap.utils.toArray("[data-hero-in]");
    function ready() {
      gsap.fromTo(
        ins,
        { autoAlpha: 0, y: 22 },
        { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.14, delay: 0.55, clearProps: "transform" }
      );
      root.classList.remove("hero-pending");
    }
    function go() {
      if (!title || !window.SplitText) {
        root.classList.remove("hero-pending");
        gsap.set(ins, { clearProps: "all" });
        return;
      }
      gsap.registerPlugin(window.SplitText);
      window.SplitText.create(title, {
        type: "lines,words",
        mask: "lines",
        linesClass: "hl",
        autoSplit: true,
        onSplit: function (self) {
          var tw = gsap.from(self.words, { yPercent: 118, duration: 1.05, ease: "power4.out", stagger: 0.08, delay: 0.1 });
          if (root.classList.contains("hero-pending")) ready();
          return tw;
        },
      });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go);
    else go();

    // Scroll velocity jostles the ducks a little.
    var hero = document.querySelector(".hero");
    if (hero) {
      ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        end: "bottom top",
        onUpdate: function (self) {
          if (window.SqueakDucks && window.SqueakDucks.nudge) window.SqueakDucks.nudge(self.getVelocity());
        },
      });
    }
  });

  // The scroll hint goes away after the first scroll.
  function onFirstScroll() {
    if (window.scrollY < 8) return;
    root.classList.add("is-scrolled");
    window.removeEventListener("scroll", onFirstScroll);
  }
  window.addEventListener("scroll", onFirstScroll, { passive: true });

  // Magnetic primary pills: a pull of at most 6px, fine pointers only.
  gsap.matchMedia().add("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)", function () {
    var cleanups = [];
    gsap.utils.toArray("[data-magnet]").forEach(function (el) {
      var qx = gsap.quickTo(el, "x", { duration: 0.12, ease: "power2.out" });
      var qy = gsap.quickTo(el, "y", { duration: 0.12, ease: "power2.out" });
      function move(e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        qx(Math.max(-1, Math.min(1, dx)) * 6);
        qy(Math.max(-1, Math.min(1, dy)) * 6);
      }
      function leave() {
        qx(0);
        qy(0);
      }
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      cleanups.push(function () {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
        gsap.set(el, { x: 0, y: 0 });
      });
    });
    return function () {
      cleanups.forEach(function (fn) {
        fn();
      });
    };
  });

  // ---------------------------------------------------------------------
  // Scenes. Built in page order once fonts are in, so every pin is measured
  // after the one above it.
  // ---------------------------------------------------------------------
  var scenes = [];

  function scene(conditions, build) {
    var m = gsap.matchMedia();
    m.add(conditions, function (ctx) {
      return build(ctx.conditions.desk === true, ctx.conditions.mob === true);
    });
    scenes.push(m);
  }

  // ---- Mac app: the window tilts flat as you arrive ---------------
  function buildMac() {
    scene(SCENE, function (desk) {
      var stage = $("[data-mac]");
      var plane = $("[data-plane]");
      var a = $("[data-shot-a]");
      var b = $("[data-shot-b]");
      if (!stage || !plane || !a) return;
      var pins = $$(".pin", a);
      var tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: stage, start: "top 94%", end: desk ? "top 20%" : "top 14%", scrub: 0.7, invalidateOnRefresh: true },
      });
      tl.fromTo(plane, { rotationX: desk ? 44 : 30, rotationY: desk ? -17 : -9, scale: desk ? 0.8 : 0.88, y: desk ? 90 : 40, transformOrigin: "50% 100%" }, { rotationX: 0, rotationY: 0, scale: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0);
      if (b) tl.fromTo(b, { x: 0, y: 0, xPercent: 0, yPercent: 0, rotation: 0, scale: 1, opacity: 0.2 }, { xPercent: desk ? 5 : 3, yPercent: desk ? -7 : -5, rotation: 1.5, scale: desk ? 0.94 : 0.95, opacity: 1, duration: 0.6, ease: "power2.out" }, 0.35);
      tl.fromTo(pins, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.12, stagger: 0.1, ease: "back.out(2.2)" }, 0.68);

      var items = $$("[data-callout]");
      var cl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: ".callouts", start: "top 92%", end: "top 58%", scrub: 0.6 },
      });
      cl.fromTo(items, { "--draw": 0 }, { "--draw": 1, duration: 0.5, stagger: 0.18 }, 0);
      cl.from($$(".callouts__n", items[0].parentNode), { scale: 0.2, duration: 0.3, stagger: 0.18, ease: "back.out(2)" }, 0.1);
      cl.from($$("h3, p", items[0].parentNode), { opacity: 0, y: 14, duration: 0.35, stagger: 0.09, ease: "power2.out" }, 0.2);
      return function () {
        gsap.set([plane, b, pins, items, ".callouts__n", ".callouts h3", ".callouts p"], { clearProps: "all" });
      };
    });
  }

  // ---- Remote access: cards that stack and settle -------------------
  function buildAway() {
    scene(SCENE, function (desk, mob) {
      var section = $("[data-away]");
      var wrap = $("[data-stackwrap]");
      var phone = $("[data-phone]");
      var tg = $("[data-tg]");
      if (!section || !wrap || !phone || !tg) return;
      var plates = $$(".stack__plate", section);
      var points = $$("[data-point]", section);
      var cls = desk ? "js-away-d" : "js-away-m";
      root.classList.add("js-away", cls);
      var pinEl = desk ? section : wrap;
      var fitsOk;
      if (desk) fitsOk = $(".away__grid", section).scrollHeight <= section.clientHeight + 4;
      else fitsOk = $(".stack", wrap).getBoundingClientRect().height <= wrap.clientHeight - 24;
      if (!fitsOk) { root.classList.remove("js-away", cls); return; }

      gsap.set([phone, tg], { transformPerspective: 1200 });
      var tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { id: "away", trigger: pinEl, start: "top top", end: desk ? "+=70%" : "+=90%", pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true },
      });
      var stackY = desk ? 0 : 0;
      tl.fromTo(plates[0], { x: 0, y: 0, rotation: -26, xPercent: -16, yPercent: 12, opacity: 0 }, { rotation: -7, xPercent: 0, yPercent: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 0.05);
      tl.fromTo(plates[1], { x: 0, y: 0, rotation: 22, xPercent: 16, yPercent: 10, opacity: 0 }, { rotation: 4, xPercent: 0, yPercent: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 0.12);
      tl.fromTo(phone, { yPercent: 80, rotationX: 38, scale: 0.84, opacity: 0 }, { yPercent: 0, rotationX: 0, scale: 1, opacity: 1, duration: 0.45, ease: "power3.out" }, 0.1);
      tl.fromTo(tg, { xPercent: desk ? 80 : 70, yPercent: 14, rotationY: -38, rotation: 9, scale: 0.84, opacity: 0 }, { xPercent: 0, yPercent: 0, rotationY: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.45, ease: EMPH }, 0.38);
      // settled: a slow float at two depths so the stack never freezes
      tl.to(phone, { yPercent: -2.5, duration: 0.42 }, 0.58);
      tl.to(tg, { yPercent: 3, duration: 0.42 }, 0.58);
      tl.to(plates[0], { rotation: -10, duration: 0.42 }, 0.58);
      if (desk) tl.fromTo(points, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.14, stagger: 0.12, ease: "power2.out" }, 0.28);

      var extra = [];
      if (!desk) {
        // Below the pinned stack, the points arrive as you reach them.
        extra = ScrollTrigger.batch(points, {
          start: "top 92%",
          once: true,
          onEnter: function (els) { gsap.fromTo(els, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.1 }); },
        });
        gsap.set(points, { opacity: 0 });
      }
      return function () {
        extra.forEach(function (t) { t.kill(); });
        gsap.set([phone, tg].concat(plates, points), { clearProps: "all" });
        root.classList.remove("js-away", cls);
      };
    });
  }

  // ---- Trust and install: lines that rise out of a mask ------------------
  function splitLines(el, vars) {
    if (!window.SplitText) return;
    window.SplitText.create(el, {
      type: "lines",
      mask: "lines",
      linesClass: "hl",
      autoSplit: true,
      onSplit: function (self) {
        return gsap.from(self.lines, Object.assign({ yPercent: 112, duration: 1, ease: "power4.out", stagger: 0.12 }, vars(el)));
      },
    });
  }

  function buildLines() {
    scene(MOTION, function () {
      var trust = $$(".trust [data-lines]");
      trust.forEach(function (el) {
        splitLines(el, function (t) {
          return { ease: "none", duration: 1, stagger: 0.25, scrollTrigger: { trigger: t, start: "top 90%", end: "bottom 62%", scrub: 0.6 } };
        });
      });
      $$(".trust__lede, .assurances p, .trust .kicker").forEach(function (el) {
        gsap.from(el, { opacity: 0, y: 26, ease: "none", scrollTrigger: { trigger: el, start: "top 94%", end: "top 74%", scrub: true } });
      });
      var h = $(".install [data-lines]");
      if (h) {
        splitLines(h, function (t) {
          return { scrollTrigger: { trigger: t, start: "top 85%", once: true } };
        });
      }
      var rest = $$(".install .kicker, .install .section__lede, .install .actions, .install__meta");
      gsap.from(rest, { opacity: 0, y: 24, duration: 0.8, ease: "power2.out", stagger: 0.1, scrollTrigger: { trigger: ".install__copy", start: "top 82%", once: true } });
      var steps = $$(".install__steps li");
      gsap.from(steps, { opacity: 0, y: 28, duration: 0.7, ease: "power2.out", stagger: 0.12, scrollTrigger: { trigger: ".install__steps", start: "top 90%", once: true } });
      var pond = $(".pond");
      if (pond) gsap.from(pond, { opacity: 0, y: 40, scale: 0.94, duration: 0.9, ease: EMPH, scrollTrigger: { trigger: pond, start: "top 90%", once: true } });
    });
  }

  function buildAll() {
    buildMac();
    buildAway();
    buildLines();
  }
  function destroyAll() {
    scenes.forEach(function (m) { m.revert(); });
    scenes = [];
  }

  // Rebuild when the window changes width (and, on a desktop, height). A phone's
  // address bar changes only the height while it scrolls, which must not rebuild.
  var lastW = window.innerWidth;
  var lastH = window.innerHeight;
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      var w = window.innerWidth;
      var h = window.innerHeight;
      if (w === lastW && (coarse || Math.abs(h - lastH) < 60)) return;
      lastW = w;
      lastH = h;
      var y = window.scrollY;
      destroyAll();
      buildAll();
      ScrollTrigger.refresh();
      window.scrollTo(0, y);
    }, 250);
  });
  function start() {
    buildAll();
    ScrollTrigger.refresh();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
  else start();
  window.addEventListener("load", function () { ScrollTrigger.refresh(); });
})();
