/* Squeak page motion. Classic deferred script using window.gsap and ScrollTrigger.
   Everything here is enhancement: with no script, with reduced motion, or on a
   narrow screen, every state of the page is already present as readable content.
   Mostly transform and opacity; the hero stage grows by animating its clip-path inset.
   Lenis adds inertia to the real scroll position, so anchors, keyboard and find work. */
(function () {
  "use strict";

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  var root = document.documentElement;
  var mm = gsap.matchMedia();
  var lenis = null;

  // The one pinned scene: "The moment". Desktop only, motion allowed.
  // Beats cross over at these progress points of the pin.
  var CUTS = [0.2, 0.45, 0.75];
  var FADE = 0.07;
  var PICK_AT = 0.58; // inside beat 3, when "a person chooses A" lands

  var PIN_QUERY =
    "(min-width: 900px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)";
  var pinMM = null;

  // The pinned layout is used only if every state fits its column without
  // clipping; otherwise the stacked, fully readable layout stays.
  function fits(pin) {
    var beats = pin.querySelectorAll(".beat");
    var area = pin.querySelector(".beats").getBoundingClientRect().height;
    var head = pin.querySelector(".moment__head").getBoundingClientRect().height;
    var ok = true;
    for (var i = 0; i < beats.length; i++) {
      var copy = beats[i].querySelector(".beat__copy").getBoundingClientRect().height;
      var visual = beats[i].querySelector(".beat__visual").getBoundingClientRect().height;
      if (head + copy + 24 > area || visual + 24 > area) ok = false;
    }
    return ok;
  }

  function setupPin() {
    var pin = document.querySelector(".moment__pin");
    if (!pin) return;
    pinMM = gsap.matchMedia();
    pinMM.add(PIN_QUERY, function () {
      var beats = gsap.utils.toArray(".moment .beat");
      var railSteps = gsap.utils.toArray(".moment .rail__step");
      var fill = pin.querySelector(".rail__fill");
      var replay = pin.querySelector(".replay");
      if (beats.length !== 4 || !fill) return;

      root.classList.add("js-pin");
      if (!fits(pin)) {
        root.classList.remove("js-pin");
        return;
      }

      // All four beats occupy one grid cell; their children do the fading.
      gsap.set(beats, { opacity: 1 });

      var tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          id: "moment",
          refreshPriority: 1, // measured before the below-fold triggers, whatever order they were created in
          trigger: pin,
          start: "top top",
          end: "+=175%",
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: function (self) {
            var p = self.progress;
            var active = p < CUTS[0] + FADE / 2 ? 0 : p < CUTS[1] + FADE / 2 ? 1 : p < CUTS[2] + FADE / 2 ? 2 : 3;
            railSteps.forEach(function (el, i) {
              el.classList.toggle("is-on", i === active);
            });
            beats[2].classList.toggle("is-picked", p >= PICK_AT);
            if (replay) replay.hidden = p < 0.03;
          },
        },
      });

      beats.forEach(function (beat, i) {
        var copy = beat.querySelector(".beat__copy");
        var visual = beat.querySelector(".beat__visual");
        var duck = beat.querySelector(".beat__duck");
        var start = i === 0 ? 0 : CUTS[i - 1];
        var end = i === 3 ? 1 : CUTS[i];

        // The visual drifts slowly the whole time its beat is on screen,
        // so the timeline is always moving.
        tl.fromTo(visual, { y: 16 }, { y: -16, duration: end - start }, start);

        // Never two states at once: the old one leaves in the first half of
        // the crossover, the new one arrives in the second half. Copy leaves
        // before the cut and returns after it.
        if (i > 0) {
          tl.fromTo(copy, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: FADE }, start + 0.02);
          tl.fromTo(visual, { opacity: 0 }, { opacity: 1, duration: FADE / 2 }, start + FADE / 2);
          tl.fromTo(
            duck,
            { scale: 0.82, transformOrigin: "50% 100%" },
            { scale: 1, duration: FADE, ease: "back.out(2)" },
            start + FADE / 2
          );
        }
        if (i < 3) {
          tl.to(copy, { opacity: 0, y: -14, duration: 0.04 }, end - 0.04);
          tl.to(visual, { opacity: 0, duration: FADE / 2 }, end);
        }
      });

      // Beat 3: the chosen label settles in. Beat 4: the receipt, then the work steps.
      var chip = beats[2].querySelector(".chip");
      if (chip) tl.fromTo(chip.parentNode, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.05 }, PICK_AT);
      var receipt = beats[3].querySelector(".detail__receipt");
      if (receipt) tl.fromTo(receipt, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.06 }, 0.82);
      var steps = gsap.utils.toArray(beats[3].querySelectorAll(".steps li"));
      if (steps.length) tl.fromTo(steps, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.05, stagger: 0.05 }, 0.88);

      tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 1 }, 0);

      var st = tl.scrollTrigger;
      function onReplay() {
        if (lenis) lenis.scrollTo(st.start);
        else window.scrollTo({ top: st.start, behavior: "smooth" });
      }
      if (replay) replay.addEventListener("click", onReplay);

      return function () {
        if (replay) {
          replay.removeEventListener("click", onReplay);
          replay.hidden = true;
        }
        beats[2].classList.remove("is-picked");
        railSteps.forEach(function (el) {
          el.classList.remove("is-on");
        });
        root.classList.remove("js-pin");
      };
    });
  }

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

  // The hero stage grows from an inset frame to full bleed, so the Ink moment
  // reads as one surface. It finishes well before the moment pin begins.
  gsap.matchMedia().add(PIN_QUERY, function () {
    var hero = document.querySelector(".hero");
    var stage = document.querySelector("[data-stage]");
    var field = stage && stage.querySelector("[data-field]");
    var head = document.querySelector(".hero__head");
    var marks = document.querySelector(".marks");
    if (!hero || !stage || !field) return;
    var tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        id: "stage",
        trigger: hero,
        start: "top+=40 top",
        end: "bottom 35%",
        scrub: 0.4,
        invalidateOnRefresh: true,
      },
    });
    tl.fromTo(
      stage,
      {
        "--mx": function () {
          return field.getBoundingClientRect().left + "px";
        },
        "--mb": function () {
          return parseFloat(getComputedStyle(hero).getPropertyValue("--band")) + "px";
        },
        "--r": "24px",
      },
      { "--mx": "0px", "--mb": "0px", "--r": "0px", duration: 1 },
      0
    );
    if (head) tl.to(head, { y: -48, opacity: 0, duration: 0.55 }, 0);
    if (marks) tl.to(marks, { opacity: 0, duration: 0.3 }, 0);
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

  // Fonts change text wrapping, so measure the fit once they are in, and
  // again (debounced) whenever the window is resized.
  function startPin() {
    if (pinMM) pinMM.revert();
    setupPin();
  }
  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      var y = window.scrollY;
      startPin();
      window.scrollTo(0, y);
    }, 250);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(startPin);
  else startPin();

  // Entrances and one-time duck movements, every width, motion allowed.
  mm.add("(prefers-reduced-motion: no-preference)", function () {
    var vh = window.innerHeight;

    // Only things below the first screen are hidden for an entrance.
    gsap.utils.toArray("[data-reveal]").forEach(function (el) {
      if (el.getBoundingClientRect().top < vh * 0.92) return;
      gsap.from(el, {
        opacity: 0,
        y: 28,
        duration: 0.7,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
      });
    });

    var pins = gsap.utils.toArray(".shot .pin");
    if (pins.length) {
      gsap.from(pins, {
        scale: 0.4,
        opacity: 0,
        duration: 0.45,
        ease: "back.out(2.2)",
        stagger: 0.14,
        scrollTrigger: { trigger: ".shot", start: "top 55%", once: true },
      });
    }

    // Each mood moves once, in its own way, as it arrives.
    function arrive(selector, build) {
      var li = document.querySelector(selector);
      var img = li && li.querySelector("img");
      if (!img) return;
      var t = gsap.timeline({ paused: true });
      build(t, img);
      ScrollTrigger.create({ trigger: li, start: "top 85%", once: true, onEnter: function () { t.play(); } });
      // Hovering a card plays its mood again, never over a run that is still going.
      li.addEventListener("pointerenter", function (e) {
        if (e.pointerType === "mouse" && !t.isActive()) t.restart();
      });
    }
    arrive(".mood--working", function (t, img) {
      t.to(img, { y: -9, duration: 0.16, ease: "sine.inOut", yoyo: true, repeat: 5 });
    });
    arrive(".mood--needs", function (t, img) {
      t.to(img, { scale: 1.08, duration: 0.14, ease: "power2.out", transformOrigin: "50% 100%" })
        .to(img, { rotation: -5, duration: 0.09, ease: "sine.inOut", yoyo: true, repeat: 3 }, 0)
        .to(img, { scale: 1, rotation: 0, duration: 0.25, ease: "power2.inOut" });
    });
    arrive(".mood--done", function (t, img) {
      t.to(img, { y: -34, duration: 0.3, ease: "power2.out" }).to(img, { y: 0, duration: 0.34, ease: "bounce.out" });
    });
    arrive(".mood--asleep", function (t, img) {
      t.fromTo(img, { y: -8 }, { y: 0, duration: 1.1, ease: "power2.out" });
    });
  });

  // Layout settles late: refresh once fonts and images are in.
  function refresh() {
    ScrollTrigger.refresh();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  window.addEventListener("load", refresh);
})();
