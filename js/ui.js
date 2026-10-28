/* Plain-page behaviour: index filter, and the fade-in fallback (reduced motion / no canvas). No dependencies. */
(function () {
  var root = document.documentElement;
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---- Index filter ---- */
  var chips = $$('.chip'), rows = $$('.idx-list > li'), status = document.getElementById('idx-status');
  function say(n) { if (status) status.textContent = 'Showing ' + n + ' of ' + rows.length + ' projects'; }
  say(rows.length);
  chips.forEach(function (chip, i) {
    chip.addEventListener('click', function () {
      var f = chip.dataset.f, n = 0;
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
      rows.forEach(function (r) {
        var show = f === 'all' || r.dataset.group === f;
        r.hidden = !show;
        if (show) {
          n++;
          if (r.animate && !root.classList.contains('rm')) r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out', fill: 'backwards' });
        }
      });
      say(n);
      window.dispatchEvent(new CustomEvent('sq:layout'));
    });
    chip.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      chips[(i + d + chips.length) % chips.length].focus();
    });
  });

  /* ---- Work: arrives once, in reading order (CSS does the stagger); an anchor, a deep link or a fast scroll shows it finished ---- */
  var work = document.getElementById('work'), h2 = document.getElementById('h-work');
  function enter(instant) { if (instant) root.classList.add('wi0'); root.classList.add('wi'); }
  function toWork(e) {
    if (!work) return;
    if (e) { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); }
    enter(true);
    if (root.classList.contains('live') && window.__pin) scrollTo(0, window.__pin.T()); else work.scrollIntoView({ behavior: 'auto', block: 'start' });
    try { history.replaceState(null, '', '#work'); } catch (_) {}
    if (h2) h2.focus({ preventScroll: true });
  }
  if (work) {
    window.__wpOK = true;
    $$('a[href="#work"]').forEach(function (a) { a.addEventListener('click', toWork); });
    if (!('IntersectionObserver' in window)) enter(true);
    else {
      var wio = new IntersectionObserver(function (l) {
        if (!l.some(function (x) { return x.isIntersecting; })) return;
        if (root.classList.contains('live')) { wio.disconnect(); return; }   /* the pinned stage reveals Work itself, by scroll */
        wio.disconnect(); enter(work.getBoundingClientRect().top < innerHeight * 0.4);
      }, { rootMargin: '0px 0px -12% 0px' });
      wio.observe(work);
    }
    /* pinned stage: tabbing into Work, or Space / Page Down from the hero, lands on the finished Work */
    work.addEventListener('focusin', function () { if (root.classList.contains('live') && window.__pin && scrollY < window.__pin.T() - 2) { enter(true); scrollTo(0, window.__pin.T()); } });
    document.addEventListener('keydown', function (e) {
      if (!root.classList.contains('live') || !window.__pin || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var t = e.target, tag = t && t.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (t && t.isContentEditable)) return;
      if ((e.key === ' ' || e.key === 'PageDown') && scrollY < window.__pin.T() - 2) { e.preventDefault(); enter(true); scrollTo(0, window.__pin.T()); }
    });
    if (location.hash === '#work') { enter(true); addEventListener('load', function () { if (h2) h2.focus({ preventScroll: true }); }); }
  }

  /* ---- Phone menu: a button that opens a full-screen list; Esc or a link closes it ---- */
  var burger = document.getElementById('burger'), menu = document.getElementById('menu');
  function setMenu(open) {
    if (!burger || !menu) return;
    burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    menu.hidden = !open; root.classList.toggle('menu-open', open);
    if (open) { var a = menu.querySelector('a'); if (a) a.focus(); } else burger.focus();
  }
  if (burger && menu) {
    burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { menu.hidden = true; root.classList.remove('menu-open'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Menu'); }); });
    matchMedia('(min-width:761px)').addEventListener('change', function (m) { if (m.matches && !menu.hidden) setMenu(false); });
  }

  /* ---- Fallback: static screenshots with fades ---- */
  function fallback() {
    if (root.classList.contains('live')) return;
    root.classList.add('nogl', 'fx');
    var els = $$('.rv');
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(function (e) { io.observe(e); });
  }
  window.__sqFallback = fallback;
  if (root.classList.contains('rm')) fallback();
  /* portrait.js calls the fallback itself if the live field cannot start */
})();
