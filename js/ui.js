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
          if (r.animate && !root.classList.contains('rm')) r.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: n * 35, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
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
