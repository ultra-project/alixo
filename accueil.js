/* ============================================================
   Alixo — Page d'accueil. Vanilla, sans dépendance.
   1. Téléchargement : version et poids live (/releases-latest.json, repli /releases.json), téléchargement direct
      avec toast, macOS détecté (bouton et carte Mac mis en avant), mobile détecté (le bouton principal ouvre l'application).
      Les pages ne nomment jamais l'hébergement des fichiers (seul ce script le connaît, pour valider les adresses) :
      les pages /telecharger/… s'en chargent en arrière-plan, et tous les liens y mènent sans ce script.
   2. Décor : apparitions au défilement, menu mobile, onglets des captures, démos vivantes.
   3. Coco, le compagnon : pend sous la navigation, descend en rappel au survol, au focus ou au tap.
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

    /* Les adresses lues dans le JSON ne sont suivies que si elles sont en https et pointent vers le site
       ou vers l'hébergement des installateurs ; sinon la page /telecharger/… prend le relais. */
    var DL_HOSTS = [location.hostname, 'github.com'];
    var safeUrl = function (value) {
      try {
        var u = new URL(String(value), location.href);
        return u.protocol === 'https:' && DL_HOSTS.indexOf(u.hostname) !== -1 ? u.href : null;
      } catch (e) { return null; }
    };

    /* ---------- Détection de la plateforme ----------
       iPadOS se présente comme « Macintosh » avec un écran tactile : il est traité comme un mobile, jamais comme un Mac. */
    var ua = navigator.userAgent, touch = 'ontouchend' in document;
    var isIPad = /Macintosh/.test(ua) && touch;
    var isMobile = /Android|iPhone|iPad|iPod/i.test(ua) || isIPad || (touch && window.innerWidth < 900);
    var isMac = /Macintosh/.test(ua) && !isIPad;

    var heroWin = $('#hero-win'), heroMac = $('#hero-mac');
    var endDl = $('#end-dl'), endAlt = $('#end-alt'), endWeb = $('#end-web');   /* bandeau final : même logique que le héros */
    var ARROW = ' <span aria-hidden="true">→</span>';
    var OPEN_APP = '<svg class="os" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>' +
      '<span class="btn-dl-txt">Ouvrir Alixo sur ton téléphone<small>Rien à installer · avec ou sans compte</small></span>';
    var macBtns = [heroMac, $('#btn-mac')];        /* boutons qui téléchargent le fichier Mac */

    /* ---------- macOS : le bouton Mac devient le bouton principal (encre plein) et passe en premier dans le héros ;
       la carte Mac prend la place et l'habillage de la carte mise en avant ; le bandeau final propose macOS ---------- */
    if (isMac) {
      if (endDl && heroMac) {
        var apple = $('svg', heroMac);
        endDl.removeAttribute('data-download');
        endDl.href = DL_PAGE.mac;
        endDl.innerHTML = (apple ? apple.outerHTML : '') +
          '<span class="btn-dl-txt">Télécharger pour macOS<small><span class="js-version">Dernière version</span><span class="js-mac-size"></span></small></span>';
        macBtns.push(endDl);
        if (endAlt) { endAlt.href = DL_PAGE.setup; endAlt.innerHTML = 'Aussi pour Windows' + ARROW; }
      }
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
        heroWin.innerHTML = OPEN_APP;
      }
      if (heroMac) heroMac.hidden = true;
      var heroWeb = $('.hero-web');                 /* même destination que le bouton principal : inutile en double */
      if (heroWin && heroWeb) heroWeb.hidden = true;
      if (endDl) {
        endDl.removeAttribute('data-download');
        endDl.href = APP_URL;
        endDl.innerHTML = OPEN_APP;
        if (endAlt) endAlt.hidden = true;
        if (endWeb) endWeb.hidden = true;
      }
    }

    /* ---------- Téléchargement direct + toast ----------
       #dl-toast est une région role=status toujours présente et vide au repos : le message y est injecté au clic
       (annonce fiable par les lecteurs d'écran), puis retiré après 15 s. La minuterie est suspendue tant que le
       toast est survolé ou contient le focus ; Échap ou « Fermer » le retirent tout de suite. */
    var toast = $('#dl-toast'), TOAST_MS = 15000;
    var toastTimer = 0, toastEnd = 0, toastLeft = 0, toastFrom = null;
    var toastOpen = function () { return !!(toast && toast.firstChild); };
    var hideToast = function () {
      clearTimeout(toastTimer); toastTimer = 0;
      if (!toastOpen()) return;
      var hadFocus = toast.contains(document.activeElement);
      toast.textContent = '';
      if (hadFocus && toastFrom && document.body.contains(toastFrom)) toastFrom.focus();   /* le focus revient au bouton d'origine */
    };
    var runToast = function (ms) {
      clearTimeout(toastTimer);
      toastLeft = ms; toastEnd = Date.now() + ms;
      toastTimer = setTimeout(hideToast, ms);
    };
    var holdToast = function () {
      if (!toastTimer) return;
      clearTimeout(toastTimer); toastTimer = 0;
      toastLeft = Math.max(2000, toastEnd - Date.now());
    };
    var resumeToast = function () {
      if (toastOpen() && !toastTimer && !toast.matches(':hover') && !toast.contains(document.activeElement)) runToast(toastLeft);
    };
    var showToast = function (fallbackPage, fallbackLabel, from) {
      if (!toast) return;
      toastFrom = from || null;
      toast.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 19h16"/></svg>' +
        '<div><strong>Le téléchargement d\'Alixo démarre…</strong><span>Si rien ne se passe, <a></a>.</span></div>' +
        '<button class="dl-toast-close" type="button" aria-label="Fermer">✕</button>';
      var link = $('a', toast);
      link.href = fallbackPage; link.textContent = fallbackLabel;
      $('.dl-toast-close', toast).addEventListener('click', hideToast);
      runToast(TOAST_MS);
    };
    if (toast) {
      toast.addEventListener('pointerenter', holdToast);
      toast.addEventListener('focusin', holdToast);
      toast.addEventListener('pointerleave', function () { setTimeout(resumeToast, 0); });
      toast.addEventListener('focusout', function () { setTimeout(resumeToast, 0); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && toastOpen()) hideToast(); });
    }
    /* Lance le téléchargement d'un fichier via un lien invisible, puis affiche le toast ;
       le lien de secours du toast pointe vers la page /telecharger/… de la plateforme. */
    var triggerFile = function (url, fallbackPage, fallbackLabel, from) {
      var a = document.createElement('a');
      a.href = url; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      showToast(fallbackPage, fallbackLabel, from);
    };
    /* Sans adresse directe connue (ou refusée par safeUrl), le lien suit simplement son href (/telecharger/…/).
       Un bouton « Windows » télécharge toujours Windows, y compris sur un Mac. */
    var startDownload = function (e) {
      if (!exeUrl) return;
      e.preventDefault();
      triggerFile(exeUrl, DL_PAGE.setup, 'clique ici pour la version Windows', e.currentTarget);
    };
    var startMacDownload = function (e) {
      if (!macUrl) return;
      e.preventDefault();
      triggerFile(macUrl, DL_PAGE.mac, 'clique ici pour la version Mac', e.currentTarget);
    };
    /* [data-download] ne vit que sur les boutons explicitement Windows (héros, carte Windows, bandeau final) */
    $$('[data-download]').forEach(function (el) { el.addEventListener('click', startDownload); });
    /* Boutons Mac (héros, carte, bandeau final sur un Mac) : téléchargement direct dès que l'adresse du fichier est connue */
    macBtns.forEach(function (el) { if (el) el.addEventListener('click', startMacDownload); });

    /* ---------- Version et poids (/releases-latest.json, repli sur /releases.json) ----------
       releases-latest.json ne contient que version, date et installateurs (quelques centaines d'octets) ;
       releases.json, bien plus lourd (notes et historique), reste le repli si le petit fichier manque.
       Les valeurs écrites dans la page (« Dernière version », « 85 Mo ») restent affichées si rien ne répond. */
    var toMo = function (bytes) { return (bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1).replace('.', ',') + ' Mo'; };   /* espace insécable */
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
          if (setup && setup.url) exeUrl = safeUrl(setup.url);
          if (setup && setup.size) {
            var mo = toMo(setup.size);
            $$('.js-size').forEach(function (el) { el.textContent = mo; });
          }
          var mac = assets.mac;
          if (mac && mac.url) macUrl = safeUrl(mac.url);
          if (mac && mac.size) {
            /* le séparateur vit dans le span : rien ne traîne tant que le poids n'est pas connu */
            var macMo = ' · ' + toMo(mac.size);
            $$('.js-mac-size').forEach(function (el) { el.textContent = macMo; });
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
        /* une capture masquée est en display:none : on force sa mise en page pour que le fondu parte bien de 0 */
        if (on && img.hidden) { img.hidden = false; void img.offsetWidth; }
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

    /* ---------- Comparatif : la région n'est focalisable (défilement au clavier) que si elle défile vraiment ;
       l'indication « Fais glisser… » suit le même critère ---------- */
    var cmp = $('#cmp'), cmpHint = $('#cmp-hint');
    if (cmp) {
      var cmpSync = function () {
        var scrolls = cmp.scrollWidth > cmp.clientWidth + 1;
        if (scrolls) cmp.setAttribute('tabindex', '0'); else cmp.removeAttribute('tabindex');
        if (cmpHint) { cmpHint.hidden = !scrolls; cmpHint.style.display = scrolls ? 'block' : ''; }
      };
      cmpSync();
      window.addEventListener('resize', cmpSync);
      window.addEventListener('load', cmpSync);
    }

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

    /* Les démos sont bornées (WCAG 2.2.2) : rien ne bouge indéfiniment. Les démos CSS (formule, correction,
       curseur de recherche, fragments du héros) portent leur nombre d'itérations dans accueil.css. */

    /* Tuile A — le plan se tape tout seul, ligne par ligne : 2 passages, puis le plan complet reste affiché */
    var planBox = $('#plan-demo');
    if (planBox && !still) {
      var lines = $$('.pl', planBox).map(function (el) {
        var t = $('.pl-t', el);
        return { el: el, t: t, full: t.textContent };
      });
      var hint = $('.pl-hint', planBox);
      var caret = document.createElement('span');
      caret.className = 'caret';
      var timer = 0, running = false, li = 0, ci = 0, passes = 0, MAX_PASSES = 2;
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
        if (li >= lines.length) {                     /* fin : on laisse lire, puis on recommence une fois */
          hint.classList.remove('off');
          if (passes >= MAX_PASSES) { running = false; restore(); return; }   /* terminé : plan complet, curseur retiré */
          timer = setTimeout(function () { passes++; reset(); step(); }, 3200);
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
        if (running || passes >= MAX_PASSES) return;
        running = true; passes++; reset(); timer = setTimeout(step, 500);
      }, function () {
        running = false; clearTimeout(timer); restore();
      });
    }

    /* Tuile E — la demande se déplace, l'équilibre suit le long de la courbe d'offre :
       un aller-retour complet (12 s environ, temps à l'écran), puis arrêt sur l'équilibre de départ */
    var graph = $('#graph');
    if (graph && !still) {
      var gD = $('#g-demand'), gPt = $('#g-pt'), gDash = $('#g-dash'), gP = $('#g-p'), gQ = $('#g-q');
      var gRun = false, gRaf = 0, gLast = 0, gElapsed = 0, gDone = false;
      var G_MS = 2 * Math.PI * 1900;                  /* une période complète du mouvement */
      var SLOPE = 74 / 160;                           /* pente (en valeur absolue) des deux droites */
      var frame = function (now) {
        if (!gRun) return;
        if (gLast) gElapsed += now - gLast;
        gLast = now;
        if (gElapsed >= G_MS) { gDone = true; gRun = false; }
        var dx = gDone ? 0 : 22 * Math.sin(gElapsed / 1900);
        var x = 110 + dx / 2, y = 59 - SLOPE * dx / 2;
        gD.setAttribute('transform', 'translate(' + dx.toFixed(2) + ' 0)');
        gPt.setAttribute('cx', x.toFixed(2)); gPt.setAttribute('cy', y.toFixed(2));
        gDash.setAttribute('d', 'M20 ' + y.toFixed(2) + 'H' + x.toFixed(2) + 'V104');
        gP.setAttribute('y', (y + 4).toFixed(2)); gQ.setAttribute('x', (x - 7).toFixed(2));
        if (!gDone) gRaf = requestAnimationFrame(frame);
      };
      whenVisible(graph, function () { if (!gRun && !gDone) { gRun = true; gLast = 0; gRaf = requestAnimationFrame(frame); } },
        function () { gRun = false; cancelAnimationFrame(gRaf); });
    }
  } catch (err) {
    /* En cas d'erreur, on retire la classe « js » : plus rien n'est masqué. */
    root.classList.remove('js');
    if (window.console) console.error(err);
  }

  /* ============================================================
     Coco, le compagnon
     Au repos, Coco pend sous la nav (seuls ses pieds dépassent). Survol à la souris, focus au clavier ou tap :
     il descend en rappel ; une fois en bas, il dit bonjour dans une bulle terminal tapée caractère par caractère.
     Plusieurs raisons peuvent le garder en bas (survol, focus, tap) : il remonte quand il n'en reste aucune.
     ============================================================ */
  try {
    var coco = $('#coco');
    if (coco) {
      var cocoBtn = $('.coco-btn', coco), cocoRig = $('.coco-rig', coco), cocoTyped = $('.coco-typed', coco);
      var cocoLive = $('#coco-live');
      var COCO_MSG = "Salut moi c'est coco, ton compagnon pour tes cours !";
      var cocoCalm = window.matchMedia('(prefers-reduced-motion: reduce)');
      var cocoLite = root.classList.contains('lite');
      var reasons = {};
      var hasReason = function () { return Object.keys(reasons).length > 0; };
      var clearReasons = function () { reasons = {}; };
      var arriveTimer, enterTimer, leaveTimer, typeTimer, autoUpTimer, lastPointer = '';
      var cocoUpdate;

      /* durée de la descente, lue dans le CSS (nulle en mouvement réduit) */
      var descentMs = function () {
        var d = (getComputedStyle(cocoRig).transitionDuration || '0s').split(',')[0].trim();
        return parseFloat(d) * (/ms$/.test(d) ? 1 : 1000) || 0;
      };
      /* En tactile, rien ne « quitte » Coco : il remonte de lui-même 5 s après avoir fini sa phrase */
      var cocoTypedDone = function () {
        clearTimeout(autoUpTimer);
        if (reasons.tap) autoUpTimer = setTimeout(function () { delete reasons.tap; cocoUpdate(); }, 5000);
      };
      var typeFrom = function (i) {
        cocoTyped.textContent = COCO_MSG.slice(0, i);
        if (i >= COCO_MSG.length) { cocoTypedDone(); return; }
        typeTimer = setTimeout(function () { typeFrom(i + 1); }, COCO_MSG.charAt(i - 1) === ',' ? 220 : 34);   /* petite pause après la virgule */
      };
      var cocoArrive = function () {
        if (!coco.classList.contains('is-down')) return;
        coco.classList.add('is-arrived');
        cocoLive.textContent = COCO_MSG;                   /* annoncé une seule fois, en entier */
        clearTimeout(typeTimer); clearTimeout(autoUpTimer);
        if (cocoCalm.matches || cocoLite) { cocoTyped.textContent = COCO_MSG; cocoTypedDone(); return; }
        cocoTyped.textContent = '';
        typeTimer = setTimeout(function () { typeFrom(1); }, 220);
      };
      cocoUpdate = function () {
        var down = hasReason();
        if (down === coco.classList.contains('is-down')) return;
        clearTimeout(arriveTimer); clearTimeout(autoUpTimer);
        if (down) {
          coco.classList.add('is-down');
          arriveTimer = setTimeout(cocoArrive, descentMs() + 40);
        } else {
          clearTimeout(typeTimer);                         /* la bulle s'efface avec le texte figé ; remis à zéro à la prochaine arrivée */
          coco.classList.remove('is-down', 'is-arrived');
          cocoLive.textContent = '';
        }
      };
      var cocoToggle = function (why) { if (reasons[why]) delete reasons[why]; else reasons[why] = true; cocoUpdate(); };
      /* Déjà en bas : il redit bonjour (la phrase est retapée et annoncée à nouveau) */
      var cocoReplay = function () {
        if (!coco.classList.contains('is-arrived')) return;
        cocoArrive();
        cocoLive.textContent = '';                         /* vidée puis remplie : la région live annonce de nouveau */
        setTimeout(function () { if (coco.classList.contains('is-arrived')) cocoLive.textContent = COCO_MSG; }, 60);
      };

      /* Souris : petit délai d'intention avant de descendre (on ne fait que passer en quittant la nav),
         la zone sensible (pieds, puis corps et corde) suit Coco, délai de grâce en sortant */
      cocoRig.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(leaveTimer); clearTimeout(enterTimer);
        if (coco.classList.contains('is-down')) { reasons.hover = true; cocoUpdate(); return; }
        enterTimer = setTimeout(function () { reasons.hover = true; cocoUpdate(); }, 200);
      });
      cocoRig.addEventListener('pointerleave', function (e) {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(leaveTimer); clearTimeout(enterTimer);
        leaveTimer = setTimeout(function () { delete reasons.hover; cocoUpdate(); }, 400);
      });
      cocoRig.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; });

      /* Tactile : un tap le fait descendre, un autre (sur lui, sa bulle ou ailleurs) le fait remonter.
         Clavier (Entrée / Espace) et clic souris : le fait descendre, ou lui fait redire bonjour s'il est déjà en bas.
         Échap le fait remonter. */
      cocoBtn.addEventListener('click', function (e) {
        if (lastPointer === 'touch' || lastPointer === 'pen') cocoToggle('tap');
        else if (coco.classList.contains('is-down')) cocoReplay();
        else { reasons[e.detail === 0 ? 'focus' : 'hover'] = true; cocoUpdate(); }
        lastPointer = '';
      });
      document.addEventListener('pointerdown', function (e) {
        if (reasons.tap && !cocoBtn.contains(e.target)) { delete reasons.tap; cocoUpdate(); }
      });
      cocoBtn.addEventListener('focus', function () {
        var kb = true; try { kb = cocoBtn.matches(':focus-visible'); } catch (err) {}   /* focus clavier seulement */
        if (kb) { reasons.focus = true; cocoUpdate(); }
      });
      cocoBtn.addEventListener('blur', function () { delete reasons.focus; cocoUpdate(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && hasReason()) { clearReasons(); cocoUpdate(); }
      });
      /* Le menu mobile passe devant : Coco remonte (et le CSS le masque tant que le menu est ouvert) */
      var cocoBurger = $('#nav-burger');
      if (cocoBurger) cocoBurger.addEventListener('click', function () { clearReasons(); cocoUpdate(); });
    }
  } catch (err) {
    /* Coco n'est qu'un décor : sans lui, la page reste entière. */
    if (window.console) console.error(err);
  }
})();
