/* Alixo — maquette v2. Vanilla, sans dépendance.
   Tout est décoratif : sans ce script (ou s'il échoue), la page reste entièrement lisible. */
(function () {
  'use strict';

  var root = document.documentElement;
  window.__alixoMaquette = true;                  /* signale au filet de sécurité de la page que le script a bien démarré */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function showAll() { $$('.reveal').forEach(function (el) { el.classList.add('in'); }); }

  try {
    /* ---------- Apparitions au scroll ----------
       Filet de sécurité : si l'observateur n'existe pas ou n'a rien signalé au bout de 2,5 s,
       tout est affiché. Un élément déjà dépassé (ancre, rechargement en milieu de page) est
       affiché d'emblée. */
    var reveals = $$('.reveal');
    var ioAlive = false;
    if (!('IntersectionObserver' in window) || reduce.matches) {
      showAll();
    } else {
      var ro = new IntersectionObserver(function (entries) {
        ioAlive = true;
        entries.forEach(function (e) {
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            e.target.classList.add('in');
            ro.unobserve(e.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      reveals.forEach(function (el) { ro.observe(el); });
      setTimeout(function () { if (!ioAlive) showAll(); }, 2500);
    }

    /* ---------- Navigation mobile ---------- */
    var nav = $('#nav'), burger = $('#nav-burger');
    function setNav(open) {
      nav.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (nav && burger) {
      burger.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
      $$('#nav-sheet a').forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && nav.classList.contains('open')) { setNav(false); burger.focus(); }
      });
      document.addEventListener('click', function (e) { if (nav.classList.contains('open') && !nav.contains(e.target)) setNav(false); });
    }

    /* ---------- Onglets des captures (role=tablist) ---------- */
    var tabs = $$('.tab'), panel = $('#shot-panel'), title = $('#shot-title');
    function selectTab(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      $$('.shot', panel).forEach(function (img) {
        var on = img.dataset.shot === tab.dataset.shot;
        if (on && img.dataset.src) {              /* chargée à la demande */
          img.srcset = img.dataset.srcset; img.src = img.dataset.src;
          delete img.dataset.src; delete img.dataset.srcset;
        }
        if (on) img.hidden = false;
        /* laisse le navigateur prendre en compte l'affichage avant le fondu */
        requestAnimationFrame(function () { img.classList.toggle('on', on); });
        if (!on) setTimeout(function () { if (!img.classList.contains('on')) img.hidden = true; }, 380);
      });
      panel.setAttribute('aria-labelledby', tab.id);
      if (title && tab.dataset.title) title.textContent = tab.dataset.title;
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { selectTab(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var j = i;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = tabs.length - 1;
        else return;
        e.preventDefault();
        selectTab(tabs[j], true);
      });
    });

    /* ---------- Héros : la capture se redresse au scroll, parallaxe souris sur les fragments ---------- */
    var win = $('#shot-win'), hero = $('.hero-panel'), frags = $$('.frag');
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = window.scrollY || 0;
        if (win) win.style.setProperty('--tilt', Math.max(0, 1 - y / 420).toFixed(3));
        if (nav) nav.classList.toggle('scrolled', y > 24);
      });
    }
    if (!reduce.matches) {
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    if (hero && frags.length && fine.matches && !reduce.matches) {
      var px = 0, py = 0, raf = 0;
      var place = function () {
        raf = 0;
        frags.forEach(function (f) {
          var d = parseFloat(f.dataset.depth) || 20;
          f.style.transform = 'translate3d(' + (px * d).toFixed(1) + 'px,' + (py * d).toFixed(1) + 'px,0)';
        });
      };
      frags.forEach(function (f) { f.style.transition = 'transform .5s cubic-bezier(.2,.7,.2,1)'; });
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width - 0.5;
        py = (e.clientY - r.top) / r.height - 0.5;
        if (!raf) raf = requestAnimationFrame(place);
      });
      hero.addEventListener('pointerleave', function () { px = py = 0; if (!raf) raf = requestAnimationFrame(place); });
    }

    /* ---------- Tuiles : inclinaison 3D suivant la souris (4° au plus) ---------- */
    if (fine.matches && !reduce.matches) {
      $$('.tilt').forEach(function (el) {
        var r = null, f = 0, cx = 0, cy = 0;
        function apply() {
          f = 0;
          if (!r) return;
          var x = Math.min(1, Math.max(0, (cx - r.left) / r.width)) - 0.5;
          var y = Math.min(1, Math.max(0, (cy - r.top) / r.height)) - 0.5;
          el.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg');
          el.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
        }
        el.addEventListener('pointerenter', function () {
          if (el.classList.contains('reveal') && !el.classList.contains('in')) return;
          r = el.getBoundingClientRect(); el.classList.add('is-tilt');
        });
        el.addEventListener('pointermove', function (e) {
          if (!r) return;
          cx = e.clientX; cy = e.clientY;
          if (!f) f = requestAnimationFrame(apply);
        });
        el.addEventListener('pointerleave', function () {
          r = null; el.classList.remove('is-tilt');
          el.style.removeProperty('--rx'); el.style.removeProperty('--ry');
        });
      });
    }

    /* ---------- Démos vivantes : ne tournent que lorsqu'elles sont à l'écran ---------- */
    function whenVisible(el, start, stop) {
      if (!el || !('IntersectionObserver' in window)) return;
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
      }, { threshold: 0.25 }).observe(el);
    }

    /* Tuile A — le plan se tape tout seul, ligne par ligne, en boucle */
    var planBox = $('#plan-demo');
    if (planBox && !reduce.matches) {
      var lines = $$('.pl', planBox).map(function (el) {
        var t = $('.pl-t', el);
        return { el: el, t: t, full: t.textContent };
      });
      var hint = $('.pl-hint', planBox);
      var caret = document.createElement('span');
      caret.className = 'caret';
      var timer = 0, running = false, li = 0, ci = 0;
      var reset = function () {
        lines.forEach(function (l) { l.t.textContent = ''; l.el.classList.add('off'); });
        hint.classList.add('off'); li = 0; ci = 0;
      };
      var restore = function () {
        lines.forEach(function (l) { l.t.textContent = l.full; l.el.classList.remove('off'); });
        hint.classList.remove('off'); if (caret.parentNode) caret.parentNode.removeChild(caret);
      };
      var step = function () {
        if (!running) return;
        if (li >= lines.length) {                     /* fin : on laisse lire, puis on recommence */
          hint.classList.remove('off');
          timer = setTimeout(function () { reset(); step(); }, 3200);
          return;
        }
        var l = lines[li];
        if (ci === 0) { l.el.classList.remove('off'); l.el.appendChild(caret); }
        if (ci < l.full.length) {
          ci++; l.t.textContent = l.full.slice(0, ci);
          timer = setTimeout(step, 34 + Math.random() * 46);
        } else {
          li++; ci = 0;
          timer = setTimeout(step, li >= lines.length ? 500 : 380);
        }
      };
      whenVisible(planBox, function () {
        if (running) return;
        running = true; reset(); timer = setTimeout(step, 500);
      }, function () {
        running = false; clearTimeout(timer); restore();
      });
    }

    /* Tuile E — la demande se déplace, l'équilibre suit le long de la courbe d'offre */
    var graph = $('#graph');
    if (graph && !reduce.matches) {
      var gD = $('#g-demand'), gPt = $('#g-pt'), gDash = $('#g-dash'), gP = $('#g-p'), gQ = $('#g-q');
      var gRun = false, gRaf = 0, t0 = 0;
      var SLOPE = 74 / 160;                           /* pente (en valeur absolue) des deux droites */
      var frame = function (now) {
        if (!gRun) return;
        if (!t0) t0 = now;
        var dx = 22 * Math.sin((now - t0) / 1900);
        var x = 110 + dx / 2, y = 59 - SLOPE * dx / 2;
        gD.setAttribute('transform', 'translate(' + dx.toFixed(2) + ' 0)');
        gPt.setAttribute('cx', x.toFixed(2)); gPt.setAttribute('cy', y.toFixed(2));
        gDash.setAttribute('d', 'M20 ' + y.toFixed(2) + 'H' + x.toFixed(2) + 'V104');
        gP.setAttribute('y', (y + 4).toFixed(2)); gQ.setAttribute('x', (x - 7).toFixed(2));
        gRaf = requestAnimationFrame(frame);
      };
      whenVisible(graph, function () { if (!gRun) { gRun = true; gRaf = requestAnimationFrame(frame); } },
        function () { gRun = false; cancelAnimationFrame(gRaf); });
    }
  } catch (err) {
    /* En cas d'erreur, on retire la classe « js » : plus rien n'est masqué. */
    root.classList.remove('js');
    if (window.console) console.error(err);
  }
})();
