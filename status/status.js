/* ============================================================
   alixoapp.com/status — état des services d'Alixo, vérifié depuis le navigateur du visiteur.
   Aucun cookie, aucun traceur, aucune bibliothèque : de simples requêtes vers les services (credentials: 'omit').
   Les prestataires contactés reçoivent l'adresse IP du visiteur : c'est dit dans la note de la page et dans
   la politique de confidentialité (rubrique « Sur le site alixoapp.com »).
   Les services tiers sont toujours désignés par leur nom Alixo (jamais par leur fournisseur).
   AlixoAI n'a pas de carte : depuis la version 1.44, elle fonctionne sur l'ordinateur de l'utilisateur (aucun serveur d'IA).
   Adresses : app/firebase-config.js (authDomain, projectId), Firestore config/public (billingApi),
   mail/cloudflare/wrangler.toml (ALIXO_MAIL_PUBLIC_URL), package.json (dépôt des versions).
   ============================================================ */
(function () {
  'use strict';

  var NB = ' ';                          // espace insécable (typographie française)
  var TIMEOUT = 8000;                         // au-delà : « Injoignable »
  var SLOW = 3000;                            // au-delà : « Lent »
  var PERIOD = 60000;                         // revérification automatique (onglet visible)
  var RELEASES_PERIOD = 5 * 60000;            // l'API publique des versions limite à 60 requêtes par heure : 5 min en automatique

  var PROJECT = 'alixo-b9f58';
  var AUTH_DOMAIN = 'alixo-b9f58.firebaseapp.com';
  var CONFIG_DOC = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/config/public';
  var MAIL_URL = 'https://mail.alixoapp.com';
  var RELEASES = 'https://api.github.com/repos/ultra-project/alixo/releases/latest';
  /* Adresse de repli du paiement, si config/public n'est pas lisible sans compte (règles Firestore).
     Vide : carte « Non vérifiable ». Une adresse de repli peut désigner un service pas encore ouvert :
     si elle ne répond pas, la carte affiche « Non vérifiable » plutôt que « Injoignable », pour ne pas
     annoncer la panne d'un service qui n'est peut-être pas en service. */
  var FALLBACK = { billingApi: '' };

  var LABELS = { pending: 'Vérification…', ok: 'Opérationnel', slow: 'Lent', down: 'Injoignable', unknown: 'Non vérifiable' };

  /* ---------- utilitaires ---------- */
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function safeHttps(u) {
    if (typeof u !== 'string' || !u) return '';
    try { var x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password ? x.origin + x.pathname.replace(/\/+$/, '') : ''; }
    catch (e) { return ''; }
  }
  function fmtMs(ms) {
    if (ms < 1000) return Math.round(ms) + NB + 'ms';
    return (ms / 1000).toFixed(1).replace('.', ',') + NB + 's';
  }
  function fmtTime(d) {
    try { return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch (e) { return d.toTimeString().slice(0, 8); }
  }
  function fmtDate(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    try { return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; }
  }
  function plural(n, one, many) { return n + NB + (n > 1 ? many : one); }

  /* Requête avec délai maximal. Renvoie { res, ms } ou lève { kind: 'timeout' | 'network', ms }. */
  function probe(url, opts) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var t0 = now();
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
    var o = { cache: 'no-store', credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer' };
    for (var k in opts) o[k] = opts[k];
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).then(function (res) {
      clearTimeout(timer);
      return { res: res, ms: now() - t0 };
    }, function (err) {
      clearTimeout(timer);
      var ms = now() - t0;
      throw { kind: (err && err.name === 'AbortError') || ms >= TIMEOUT ? 'timeout' : 'network', ms: ms };
    });
  }
  function bySpeed(ms) { return ms > SLOW ? 'slow' : 'ok'; }
  function failure(e) {
    return { state: 'down', ms: null, detail: e && e.kind === 'timeout' ? 'Pas de réponse en ' + (TIMEOUT / 1000) + NB + 'secondes.' : 'Le service n’a pas pu être joint.' };
  }
  /* Simple joignabilité (réponse opaque, sans détail). `detail` : texte affiché si le service répond. */
  function reach(url, detail) {
    return probe(url, { mode: 'no-cors', method: 'GET' }).then(function (r) {
      return { state: bySpeed(r.ms), ms: r.ms, detail: detail == null ? 'Joignable.' : detail };
    }, failure);
  }
  /* Réponse HTTP lisible : le service répond si le statut est dans `okStatus` (ou 2xx) */
  function httpCheck(url, opts, okStatus, onOk) {
    return probe(url, opts || {}).then(function (r) {
      var s = r.res.status;
      if ((s >= 200 && s < 300) || (okStatus && okStatus.indexOf(s) >= 0)) {
        var out = { state: bySpeed(r.ms), ms: r.ms, detail: '' };
        return onOk ? Promise.resolve(onOk(r.res, out)).then(function () { return out; }) : out;
      }
      return { state: 'down', ms: r.ms, detail: 'Le service répond avec une erreur (' + s + ').' };
    }, failure);
  }

  /* ---------- configuration publique (config/public) ---------- */
  var config = null, configWait = null;
  function onConfig(doc) {
    var f = (doc && doc.fields) || {};
    var str = function (k) { return f[k] && typeof f[k].stringValue === 'string' ? f[k].stringValue : ''; };
    config = { billingApi: safeHttps(str('billingApi')) };
  }
  function getConfig() { return configWait || Promise.resolve(); }

  /* ---------- inventaire ---------- */
  var SERVICES = [
    { id: 'site', name: 'Site alixoapp.com', desc: 'Pages du site, téléchargements et documentation.',
      run: function () {
        return httpCheck('/releases.json', { cache: 'no-store' }, null, function (res, out) {
          return res.json().then(function (j) { if (j && j.version) out.detail = 'Version en téléchargement' + NB + ': ' + String(j.version).slice(0, 20) + '.'; }, function () {});
        });
      } },
    { id: 'web', name: 'Application web', desc: 'Alixo dans le navigateur, sans installation.',
      run: function () { return httpCheck('/docs/index.html', { cache: 'no-store', method: 'HEAD' }); } },
    { id: 'accounts', name: 'Alixo Comptes', desc: 'Création de compte et connexion.',
      run: function () { return reach('https://' + AUTH_DOMAIN + '/__/auth/handler'); } },
    { id: 'google', name: 'Connexion Google', desc: 'Bouton «' + NB + 'Continuer avec Google' + NB + '».',
      run: function () { return reach('https://accounts.google.com/', ''); } },     // le badge « Opérationnel » suffit
    { id: 'database', name: 'Alixo Database', desc: 'Synchronisation des cours, notes et réglages.',
      run: function () {
        /* 200 (document lisible) ou 401/403/404 (accès refusé sans compte) : le service répond */
        configWait = httpCheck(CONFIG_DOC, { cache: 'no-store' }, [401, 403, 404], function (res) {
          if (res.status !== 200) { config = config || { billingApi: '' }; return; }
          return res.json().then(onConfig, function () {});
        });
        return configWait;
      } },
    { id: 'billing', name: 'Alixo Paiement', desc: 'Abonnement Alixo+ et Alixo Business.', needs: 'billingApi',
      run: function (base) {
        return httpCheck(base + '/health', { cache: 'no-store' }, null, function (res, out) {
          return res.json().then(function (j) { if (!j || j.ok !== true) { out.state = 'down'; out.detail = 'Le service répond mais signale un problème.'; } }, function () {});
        });
      } },
    { id: 'mail', name: 'Alixo Mail', desc: 'Messagerie @alixoapp.com.',
      run: function () { return reach(MAIL_URL + '/healthz'); } },
    { id: 'releases', name: 'Alixo Mises à jour', desc: 'Publication des nouvelles versions et mise à jour automatique.', throttle: RELEASES_PERIOD,
      run: function (base, prev) {
        return probe(RELEASES, { cache: 'no-store' }).then(function (r) {
          var s = r.res.status;
          var keep = prev && prev.version ? prev : null;
          var out = { state: bySpeed(r.ms), ms: r.ms, detail: '' };
          if (s === 200) {
            return r.res.json().then(function (j) {
              var v = j && typeof j.tag_name === 'string' ? j.tag_name.replace(/^v/i, '').slice(0, 30) : '';
              var d = j && j.published_at ? fmtDate(j.published_at) : '';
              if (v) { out.version = v; out.detail = 'Dernière version publiée' + NB + ': ' + v + (d ? ' (le ' + d + ')' : '') + '.'; }
              return out;
            }, function () { return out; });
          }
          if (s === 403 || s === 429) {            // limite de requêtes atteinte : le service répond
            if (keep) { out.version = keep.version; out.detail = keep.detail; }
            return out;
          }
          return { state: 'down', ms: r.ms, detail: 'Le service répond avec une erreur (' + s + ').' };
        }, failure);
      } }
  ];

  /* ---------- rendu ---------- */
  var list = document.getElementById('st-list');
  var banner = document.getElementById('st-banner');
  var bTitle = document.getElementById('st-banner-title');
  var bSub = document.getElementById('st-banner-sub');
  var btnAll = document.getElementById('st-all');
  if (!list || !banner) return;

  var REFRESH_ICO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  SERVICES.forEach(function (s) {
    var card = el('article', 'st-card');
    card.id = 'st-' + s.id;                     // ancre : le bandeau renvoie vers les cartes en cause (l'ordre ne change jamais)
    card.tabIndex = -1;
    card.setAttribute('data-state', 'pending');
    card.setAttribute('aria-labelledby', 'st-n-' + s.id);
    var head = el('div', 'st-head');
    var name = el('h2', 'st-name', s.name); name.id = 'st-n-' + s.id;
    var badge = el('span', 'st-badge');
    badge.appendChild(el('span', 'st-dot')).setAttribute('aria-hidden', 'true');
    var label = badge.appendChild(el('span', 'st-label', LABELS.pending));
    head.appendChild(name); head.appendChild(badge);
    var desc = el('p', 'st-desc', s.desc);
    var detail = el('p', 'st-detail'); detail.hidden = true;
    var foot = el('div', 'st-foot');
    var meta = el('dl', 'st-meta');
    var mk = function (k) { var w = el('div'); w.appendChild(el('dt', null, k)); var v = w.appendChild(el('dd', null, '—')); meta.appendChild(w); return v; };
    var msEl = mk('Temps de réponse');
    var atEl = mk('Dernière vérification');
    var btn = el('button', 'btn ghost small st-btn'); btn.type = 'button';
    btn.innerHTML = REFRESH_ICO; btn.appendChild(document.createTextNode('Revérifier'));
    btn.setAttribute('aria-label', 'Revérifier ' + s.name);
    btn.addEventListener('click', function () { check(s, true); });
    foot.appendChild(meta); foot.appendChild(btn);
    card.appendChild(head); card.appendChild(desc); card.appendChild(detail); card.appendChild(foot);
    list.appendChild(card);
    s.ui = { card: card, label: label, detail: detail, ms: msEl, at: atEl, btn: btn };
    s.result = null; s.busy = false; s.last = 0;
  });

  function paint(s) {
    var r = s.result, u = s.ui;
    var state = r ? r.state : 'pending';
    u.card.setAttribute('data-state', state);
    u.card.setAttribute('aria-busy', s.busy ? 'true' : 'false');
    u.card.classList.toggle('is-busy', s.busy);
    u.btn.disabled = s.busy;
    u.label.textContent = LABELS[state];
    if (!r) return;
    u.ms.textContent = r.ms != null ? fmtMs(r.ms) : '—';
    u.at.textContent = s.at ? fmtTime(s.at) : '—';
    u.detail.textContent = r.detail || '';
    u.detail.hidden = !r.detail;
  }

  /* Sous-titre du bandeau : groupes « Libellé : service, service. », chaque service étant un lien vers sa carte.
     Le DOM n'est reconstruit que si le contenu change (la zone est annoncée par les lecteurs d'écran). */
  var subKey = '';
  function setSub(parts) {
    var key = JSON.stringify(parts);
    if (key === subKey) return;
    subKey = key;
    bSub.textContent = '';
    parts.forEach(function (p, i) {
      if (i) bSub.appendChild(document.createTextNode(' '));
      if (typeof p === 'string') { bSub.appendChild(document.createTextNode(p)); return; }
      bSub.appendChild(document.createTextNode(p.label + NB + ': '));
      p.items.forEach(function (s, j) {
        if (j) bSub.appendChild(document.createTextNode(', '));
        var a = el('a', 'st-jump', s.name); a.href = '#st-' + s.id;
        bSub.appendChild(a);
      });
      bSub.appendChild(document.createTextNode('.'));
    });
  }

  function paintBanner() {
    var pending = 0, down = [], slow = [], unknown = [], reached = 0;
    SERVICES.forEach(function (s) {
      var st = s.result ? s.result.state : 'pending';
      if (st === 'pending') pending++;
      else if (st === 'down') down.push(s);
      else if (st === 'slow') { slow.push(s); reached++; }
      else if (st === 'unknown') unknown.push(s);
      else reached++;
    });
    /* Hors ligne : le navigateur le dit, ou aucun service (pas même le site) n'a pu être joint */
    var offline = navigator.onLine === false || (!pending && down.length > 0 && reached === 0);
    var state, title, sub;
    if (offline) { state = 'offline'; title = 'Votre appareil semble hors ligne'; sub = ['Vérifiez votre connexion Internet, puis revérifiez.']; }
    else if (pending) { state = 'pending'; title = 'Vérification…'; sub = ['Interrogation des services en cours.']; }
    else if (down.length) {
      state = 'bad'; title = 'Perturbation sur ' + plural(down.length + slow.length, 'service', 'services');
      sub = [{ label: 'Injoignable', items: down }];
      if (slow.length) sub.push({ label: 'Lent', items: slow });
    }
    else if (slow.length) { state = 'warn'; title = 'Ralentissement sur ' + plural(slow.length, 'service', 'services'); sub = [{ label: 'Lent', items: slow }]; }
    else if (unknown.length) { state = 'ok'; title = 'Tous les services vérifiés fonctionnent'; sub = [{ label: 'Non vérifiable depuis cette page', items: unknown }]; }
    else { state = 'ok'; title = 'Tous les services fonctionnent'; sub = ['Aucun incident détecté.']; }
    banner.setAttribute('data-state', state);
    if (bTitle.textContent !== title) bTitle.textContent = title;
    setSub(sub);
  }

  function check(s, manual) {
    if (s.busy) return Promise.resolve();
    if (!manual && s.throttle && s.last && Date.now() - s.last < s.throttle) return Promise.resolve();
    s.busy = true; paint(s);
    var job;
    if (s.needs) {
      job = getConfig().then(function () {
        var published = config && config[s.needs];
        var base = published || safeHttps(FALLBACK[s.needs]);
        if (!base) return { state: 'unknown', ms: null, detail: 'L’adresse de ce service n’est pas publiée' + NB + ': il ne peut pas être vérifié depuis cette page.' };
        return Promise.resolve(s.run(base, s.result)).then(null, failure).then(function (r) {
          /* adresse de repli (non publiée) qui ne répond pas : peut-être un service pas encore ouvert, pas une panne */
          if (!published && r && r.state === 'down') return { state: 'unknown', ms: null, detail: 'Ce service n’a pas pu être vérifié depuis cette page.' };
          return r;
        });
      });
    } else job = s.run(null, s.result);
    return Promise.resolve(job).then(null, function () { return { state: 'down', ms: null, detail: 'Le service n’a pas pu être joint.' }; }).then(function (r) {
      s.result = r; s.at = new Date(); s.last = Date.now(); s.busy = false;
      paint(s); paintBanner();
    });
  }

  var running = false, lastAll = 0, again = false;
  function checkAll(manual) {
    if (running) { if (manual) again = true; return; }
    running = true; lastAll = Date.now();
    if (btnAll) btnAll.disabled = true;
    var db = SERVICES.filter(function (s) { return s.id === 'database'; })[0];
    /* la base de données d'abord (elle fournit l'adresse du paiement), le reste en parallèle */
    var first = check(db, manual);
    var all = SERVICES.filter(function (s) { return s !== db; }).map(function (s) { return check(s, manual); });
    Promise.all([first].concat(all)).then(function () {
      running = false; if (btnAll) btnAll.disabled = false;
      if (again) { again = false; checkAll(true); }        // demande arrivée pendant la vérification (retour du réseau)
    });
  }

  if (btnAll) btnAll.addEventListener('click', function () { checkAll(true); });
  /* Retour du réseau : tout revérifier ; perte du réseau : le bandeau le dit tout de suite */
  window.addEventListener('online', function () { checkAll(true); });
  window.addEventListener('offline', paintBanner);
  setInterval(function () { if (document.visibilityState === 'visible') checkAll(false); }, PERIOD);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - lastAll >= PERIOD) checkAll(false);
  });
  paintBanner();
  checkAll(true);
})();
