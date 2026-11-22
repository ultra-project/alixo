/* ============================================================
   Alixo — Page d'accueil. Vanilla, sans dépendance.
   1. Téléchargement : version et poids live (/releases-latest.json, repli /releases.json), téléchargement direct
      avec toast, macOS détecté (bouton principal et carte Mac mis en avant), mobile détecté (le bouton principal ouvre l'application).
      Les pages ne nomment jamais l'hébergement des fichiers (seul ce script le connaît, pour valider les adresses) :
      les pages /telecharger/… s'en chargent en arrière-plan, et tous les liens y mènent sans ce script.
   2. Décor : apparitions au défilement (.reveal), démarrage de la scène du héros (classe « on » sur .rig).
   3. Quiz interactif de la section Fonctionnalités : minuteur, réponse, pourcentages, « Rejouer ».
   Le menu mobile (#nav-burger / #nav-sheet) est géré par /site.js, chargé par toutes les pages.
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

    var heroWin = $('#hero-win'), heroWeb = $('#hero-web');
    var endDl = $('#end-dl'), endWeb = $('#end-web');   /* bandeau final : même logique que le héros */
    var OPEN_APP = 'Ouvrir Alixo sur ton téléphone';
    var macBtns = [$('#btn-mac')];                      /* boutons qui téléchargent le fichier Mac */

    /* ---------- macOS : le bouton principal du héros et celui du bandeau final téléchargent le fichier Mac ;
       la carte Mac passe en premier dans la section Télécharger ---------- */
    if (isMac) {
      [heroWin, endDl].forEach(function (el) {
        if (!el) return;
        el.removeAttribute('data-download');
        el.href = DL_PAGE.mac;
        macBtns.push(el);
      });
      var cardWin = $('#dl-card-win'), cardMac = $('#dl-card-mac');
      if (cardWin && cardMac) cardWin.parentNode.insertBefore(cardMac, cardWin);
    }

    /* ---------- Mobile : pas de fichier à télécharger, le bouton principal ouvre l'application
       (même habillage violet) et le second bouton, qui menait au même endroit, est masqué ---------- */
    if (isMobile) {
      [[heroWin, heroWeb], [endDl, endWeb]].forEach(function (pair) {
        var main = pair[0], alt = pair[1];
        if (!main) return;
        main.removeAttribute('data-download');
        main.href = APP_URL;
        var ico = $('svg', main);
        main.textContent = '';
        if (ico) { ico.innerHTML = '<path d="M7 17 17 7M8 7h9v9"/>'; main.appendChild(ico); }
        main.appendChild(document.createTextNode(OPEN_APP));
        if (alt) alt.hidden = true;
      });
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
    /* Boutons Mac (carte, héros et bandeau final sur un Mac) : téléchargement direct dès que l'adresse du fichier est connue */
    macBtns.forEach(function (el) { if (el) el.addEventListener('click', startMacDownload); });

    /* ---------- Version et poids (/releases-latest.json, repli sur /releases.json) ----------
       releases-latest.json ne contient que version, date et installateurs (quelques centaines d'octets) ;
       releases.json, bien plus lourd (notes et historique), reste le repli si le petit fichier manque.
       Les valeurs écrites dans la page (« Dernière version », « 85 Mo ») restent affichées si rien ne répond. */
    var toMo = function (bytes) { return (bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1).replace('.', ',') + ' Mo'; };   /* espace insécable */
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

  /* Ne lance « start » que lorsque l'élément est à l'écran, « stop » quand il en sort */
  function whenVisible(el, start, stop) {
    if (!el || !('IntersectionObserver' in window)) { start(); return; }
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
    }, { threshold: 0.25 }).observe(el);
  }

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

    /* ---------- Héros : la scène démarre (classe « on ») au premier des deux événements, un défilement de plus
       de 8 px ou ~900 ms après le chargement ; tout de suite en mouvement réduit ou sur appareil faible ---------- */
    var rigs = $$('.rig');
    var started = false;
    var startRig = function () {
      if (started) return;
      started = true;
      rigs.forEach(function (r) { r.classList.add('on'); });
      window.removeEventListener('scroll', onRigScroll);
    };
    var onRigScroll = function () { if ((window.scrollY || 0) > 8) startRig(); };
    if (still) {
      startRig();
    } else {
      window.addEventListener('scroll', onRigScroll, { passive: true });
      onRigScroll();
      var armRig = function () { setTimeout(startRig, 900); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armRig); else armRig();
    }

    /* ---------- Comparatif : la région n'est focalisable (défilement au clavier) que si elle défile vraiment ---------- */
    var cmp = $('#cmp');
    if (cmp) {
      var cmpSync = function () {
        if (cmp.scrollWidth > cmp.clientWidth + 1) cmp.setAttribute('tabindex', '0'); else cmp.removeAttribute('tabindex');
      };
      cmpSync();
      window.addEventListener('resize', cmpSync);
      window.addEventListener('load', cmpSync);
    }
  } catch (err) {
    /* En cas d'erreur, on retire la classe « js » : plus rien n'est masqué. */
    root.classList.remove('js');
    if (window.console) console.error(err);
  }

  /* ============================================================
     Quiz interactif (section Fonctionnalités)
     Les boutons ne sont jamais « disabled » (ils restent lisibles et atteignables au clavier) : une fois la réponse
     donnée, ils passent en aria-disabled et le script ignore les clics. Le minuteur (20 s) ne tourne que lorsque le
     quiz est à l'écran et au plus trois tours (WCAG 2.2.2) ; il n'est pas annoncé (pas d'aria-live).
     ============================================================ */
  try {
    var quiz = $('#quiz');
    if (quiz) {
      var opts = $$('.quiz-opt', quiz), timerEl = $('#quiz-timer'), msgEl = $('#quiz-msg'), countEl = $('#quiz-count'), replay = $('#quiz-replay');
      var MSG_IDLE = 'Choisis une réponse, comme dans l’amphi.';
      var MSG_OK = 'Bonne réponse ! Ass. plén., 9 mai 1984 : faute retenue sans discernement.';
      var MSG_KO = 'Raté : c’était Derguini (Ass. plén., 9 mai 1984).';
      var MAX_LOOPS = 3, left = 20, loops = 0, tick = 0, visible = false, revealed = false;
      var pad = function (n) { return '00:' + (n < 10 ? '0' : '') + n; };
      var stopTimer = function () { clearInterval(tick); tick = 0; };
      var runTimer = function () {
        if (tick || revealed || !visible || loops >= MAX_LOOPS) return;
        tick = setInterval(function () {
          left -= 1;
          if (left <= 0) {
            loops += 1; left = 20;
            if (loops >= MAX_LOOPS) { stopTimer(); }     /* trois tours : le minuteur se pose sur 00:20 */
          }
          timerEl.textContent = pad(left);
        }, 1000);
      };
      var reveal = function (picked) {
        if (revealed) return;
        revealed = true;
        stopTimer();
        quiz.classList.add('is-revealed');
        var ok = picked.hasAttribute('data-ok');
        opts.forEach(function (b) {
          var isOk = b.hasAttribute('data-ok'), isPicked = b === picked;
          b.classList.toggle('is-ok', isOk);
          b.classList.toggle('is-picked', isPicked);
          b.setAttribute('aria-pressed', isPicked ? 'true' : 'false');
          b.setAttribute('aria-disabled', 'true');
          var label = $('.quiz-label', b);
          label.textContent = label.getAttribute('data-label') + (isOk ? ' ✓' : '') + (isPicked && !isOk ? ' — ta réponse' : '');
          $('.quiz-pct', b).textContent = b.getAttribute('data-pct') + ' %';
        });
        timerEl.textContent = 'Terminé';
        countEl.textContent = '29 réponses';
        msgEl.textContent = ok ? MSG_OK : MSG_KO;
        replay.hidden = false;
      };
      var reset = function () {
        revealed = false; left = 20; loops = 0;
        quiz.classList.remove('is-revealed');
        opts.forEach(function (b) {
          b.classList.remove('is-ok', 'is-picked');
          b.setAttribute('aria-pressed', 'false');
          b.removeAttribute('aria-disabled');
          $('.quiz-label', b).textContent = $('.quiz-label', b).getAttribute('data-label');
          $('.quiz-pct', b).textContent = '';
        });
        timerEl.textContent = pad(left);
        countEl.textContent = '28 réponses';
        msgEl.textContent = MSG_IDLE;
        replay.hidden = true;
        runTimer();
        opts[0].focus();                                /* « Rejouer » rend le focus à la première réponse */
      };
      opts.forEach(function (b) {
        $('.quiz-label', b).setAttribute('data-label', $('.quiz-label', b).textContent);
        b.addEventListener('click', function () { if (!revealed) reveal(b); });
      });
      replay.addEventListener('click', reset);
      whenVisible(quiz, function () { visible = true; runTimer(); }, function () { visible = false; stopTimer(); });
    }
  } catch (err) {
    /* Le quiz n'est qu'une démonstration : sans lui, la section reste lisible. */
    if (window.console) console.error(err);
  }
})();
