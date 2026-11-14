/* ============================================================
   Alixo — Page d'accueil. Vanilla, sans dépendance.
   1. Téléchargement : version et poids live (/releases-latest.json, repli /releases.json), téléchargement direct
      avec toast, macOS détecté (bouton et carte Mac mis en avant), mobile détecté (le bouton principal ouvre l'application).
      Le site ne nomme jamais l'hébergement des fichiers : les pages /telecharger/… s'en chargent en arrière-plan,
      et tous les liens y mènent sans ce script.
   2. Décor : apparitions au défilement, menu mobile, onglets des captures, démos vivantes.
   Sans ce script (ou s'il échoue), la page reste entièrement lisible.
   Mode clair seul : ce script ne lit ni n'écrit aucune préférence de thème.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  window.__alixoAccueil = true;                   /* signale au filet de sécurité de la page que le script a bien démarré */
  /* html.lite : appareil faible détecté par le script du <head> ; traité comme le mouvement réduit */
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('lite');
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  /* ============================================================
     Téléchargement
     ============================================================ */
  try {
    var DL_PAGE = { setup: '/telecharger/windows/', mac: '/telecharger/mac/' };
    var APP_URL = 'https://alixoapp.com/docs/';
    var exeUrl = null;       /* adresse directe du fichier Windows (lue dans releases-latest.json) ; sinon la page /telecharger/windows/ s'en charge */
    var macUrl = null;       /* adresse directe du fichier Mac ; sinon la page /telecharger/mac/ */

    /* ---------- Détection de la plateforme ---------- */
    var isMac = /Macintosh/.test(navigator.userAgent) && !('ontouchend' in document);
    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchend' in document && window.innerWidth < 900);

    var heroWin = $('#hero-win'), heroMac = $('#hero-mac');

    /* ---------- macOS : le bouton Mac devient le bouton principal (encre plein) et passe en premier dans le héros ;
       la carte Mac prend la place et l'habillage de la carte mise en avant ---------- */
    if (isMac) {
      if (heroWin && heroMac) {
        heroWin.classList.remove('btn-ink'); heroWin.classList.add('btn-line');
        heroMac.classList.remove('btn-line'); heroMac.classList.add('btn-ink');
        heroWin.parentNode.insertBefore(heroMac, heroWin);
      }
      var cardWin = $('#dl-card-win'), cardMac = $('#dl-card-mac');
      if (cardWin && cardMac) {
        var btnWin = $('.btn', cardWin), btnMac = $('.btn', cardMac);
        cardWin.classList.remove('dl-win'); cardMac.classList.add('dl-win');
        if (btnWin) { btnWin.classList.remove('btn-white'); btnWin.classList.add('btn-ink'); }
        if (btnMac) { btnMac.classList.remove('btn-ink'); btnMac.classList.add('btn-white'); }
        /* l'ordre d'apparition suit la nouvelle place */
        var iWin = cardWin.style.getPropertyValue('--i'), iMac = cardMac.style.getPropertyValue('--i');
        cardWin.style.setProperty('--i', iMac || '0'); cardMac.style.setProperty('--i', iWin || '0');
        cardWin.parentNode.insertBefore(cardMac, cardWin);
      }
    }

    /* ---------- Mobile : pas de fichier à télécharger, le bouton principal ouvre l'application ---------- */
    if (isMobile) {
      if (heroWin) {
        heroWin.removeAttribute('data-download');
        heroWin.href = APP_URL;
        heroWin.innerHTML = '<svg class="os" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>' +
          '<span class="btn-dl-txt">Ouvrir Alixo sur ton téléphone<small>Rien à installer · avec ou sans compte</small></span>';
      }
      if (heroMac) heroMac.hidden = true;
      var heroWeb = $('.hero-web');                 /* même destination que le bouton principal : inutile en double */
      if (heroWin && heroWeb) heroWeb.hidden = true;
    }

    /* ---------- Téléchargement direct + toast ---------- */
    var toast = $('#dl-toast'), fallback = $('#dl-fallback'), toastTimer = 0;
    var hideToast = function () { clearTimeout(toastTimer); if (toast) toast.hidden = true; };
    /* Lance le téléchargement d'un fichier via un lien invisible, puis affiche le toast ;
       le lien de secours du toast pointe vers la page /telecharger/… de la plateforme. */
    var triggerFile = function (url, fallbackPage, fallbackLabel) {
      var a = document.createElement('a');
      a.href = url; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      if (!toast) return;
      if (fallback) { fallback.href = fallbackPage; fallback.textContent = fallbackLabel; }
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, 8000);
    };
    /* Sans adresse directe connue, le lien suit simplement son href (/telecharger/…/). */
    var startDownload = function (e) {
      if (isMac) { e.preventDefault(); location.href = DL_PAGE.mac; return; }
      if (!exeUrl) return;
      e.preventDefault();
      triggerFile(exeUrl, DL_PAGE.setup, 'clique ici pour la version Windows');
    };
    var startMacDownload = function (e) {
      if (!macUrl) return;
      e.preventDefault();
      triggerFile(macUrl, DL_PAGE.mac, 'clique ici pour la version Mac');
    };
    /* [data-download] ne vit que sur les deux boutons explicitement Windows (héros et carte Windows) */
    $$('[data-download]').forEach(function (el) { el.addEventListener('click', startDownload); });
    /* Boutons Mac (héros et carte) : téléchargement direct dès que l'adresse du fichier est connue */
    [heroMac, $('#btn-mac')].forEach(function (el) { if (el) el.addEventListener('click', startMacDownload); });
    var toastClose = toast && $('.dl-toast-close', toast);
    if (toastClose) toastClose.addEventListener('click', hideToast);

    /* ---------- Version et poids (/releases-latest.json, repli sur /releases.json) ----------
       releases-latest.json ne contient que version, date et installateurs (quelques centaines d'octets) ;
       releases.json, bien plus lourd (notes et historique), reste le repli si le petit fichier manque.
       Les valeurs écrites dans la page (« Dernière version », « 85 Mo ») restent affichées si rien ne répond. */
    var toMo = function (bytes) { return (bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1).replace('.', ',') + ' Mo'; };
    var getJson = function (url) {
      return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); });
    };
    if (window.fetch) {
      getJson('/releases-latest.json')
        .catch(function () { return getJson('/releases.json'); })
        .then(function (rel) {
          if (!rel) return;
          var assets = rel.assets || {};
          if (rel.version) {
            var v = 'v' + rel.version;
            $$('.js-version').forEach(function (el) { el.textContent = v; });
          }
          var setup = assets.setup;
          if (setup && setup.url) exeUrl = setup.url;
          if (setup && setup.size) {
            var mo = toMo(setup.size);
            $$('.js-size').forEach(function (el) { el.textContent = mo; });
          }
          var mac = assets.mac;
          if (mac && mac.url) macUrl = mac.url;
          if (mac && mac.size) {
            /* le séparateur vit dans le span : rien ne traîne tant que le poids n'est pas connu */
            var macMo = ' · ' + toMo(mac.size);
            ['#mac-size', '#mac-size-hero'].forEach(function (id) { var el = $(id); if (el) el.textContent = macMo; });
          }
        })
        .catch(function () {});
    }
  } catch (err) {
    /* Les liens gardent leur href /telecharger/… : rien n'est perdu. */
    if (window.console) console.error(err);
  }

  /* ============================================================
     Décor
     ============================================================ */
  function showAll() { $$('.reveal').forEach(function (el) { el.classList.add('in'); }); }

  try {
    /* ---------- Apparitions au scroll ----------
       Filet de sécurité : si l'observateur n'existe pas ou n'a rien signalé au bout de 2,5 s,
       tout est affiché. Un élément déjà dépassé (ancre, rechargement en milieu de page) est
       affiché d'emblée. */
    var reveals = $$('.reveal');
    var ioAlive = false;
    if (!('IntersectionObserver' in window) || still) {
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

    /* ---------- Héros : la capture se redresse au scroll ---------- */
    var win = $('#shot-win');
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = window.scrollY || 0;
        if (win) win.style.setProperty('--tilt', Math.max(0, 1 - y / 420).toFixed(3));
      });
    }
    if (!still) {
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
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
    if (planBox && !still) {
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
    if (graph && !still) {
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
