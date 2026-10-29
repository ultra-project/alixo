/* ============================================================
   Alixo — « une fenêtre par document » (1.45), comme Word
   Réglage Paramètres › Apparence › Fenêtres (state.settings.windowPerDoc). Quand il est activé, un document ouvert
   depuis l'accueil (bibliothèque) s'ouvre dans sa propre fenêtre, sans barre d'onglets ; l'accueil reste ouvert.
   - Version PC : nouvelle fenêtre Alixo (main.js › createDocWindow, IPC doc-window:*) ; un second clic sur le même
     document ramène la fenêtre déjà ouverte. Version web : nouvel onglet du navigateur (fenêtre nommée par document) ;
     si le navigateur bloque l'ouverture, le document s'ouvre en place, comme avant.
   - La fenêtre fille charge index.html?doc=<id>&solo=1&desktop=1 (window.ALIXO_SOLO, body.solo). Elle lit et écrit le
     même stockage local que l'accueil ; les fenêtres se préviennent par l'événement « storage » et fusionnent
     document par document (js/split.js › mergeFromStorage), donc une modification est visible aussitôt dans l'accueil.
     Elle n'a ni synchronisation en ligne, ni widgets, ni fenêtres de démarrage (window.ALIXO_AUX, voir app.js).
   - Dans la fille : le logo, Alt+←, Ctrl+W et la suppression du document ferment la fenêtre et ramènent l'accueil. Un dossier
     du fil d'Ariane ramène l'accueil dans ce dossier : avant de se fermer, la fille écrit la clé « alixo.solo.goto »
     ({ folderId, ts, msg }) ; l'accueil la lit par l'événement « storage », l'efface, va dans le dossier et affiche `msg`
     (les messages d'une fenêtre qui se ferme, « Ce document n'existe plus »…, passent par là aussi).
   Chargé en dernier (après split.js) : enveloppe les globales d'app.js (openDoc, closeTab, showLibrary, cycleTab,
   openTabs, state, saveTm, LS_KEY…) et AlixoApp.tabs.open, comme split.js le fait pour les volets.
   ============================================================ */
'use strict';

window.AlixoSolo = (() => {
  const SOLO = !!window.ALIXO_SOLO;
  const SOLO_ID = typeof ALIXO_SOLO_ID === 'string' ? ALIXO_SOLO_ID : '';
  const DEFAULT_TITLE = 'Alixo — Cockpit d’amphi';
  const GOTO_KEY = 'alixo.solo.goto';   // fille → accueil : { folderId, ts, msg } (voir l'en-tête)
  const enabled = () => !!(state && state.settings && state.settings.windowPerDoc) && !document.body.classList.contains('mobile');
  const desktop = () => !!(window.alixoDesktop && alixoDesktop.openDocWindow);
  /* un document de la bibliothèque locale (les documents partagés par un autre compte ne sont pas dans le stockage : ils s'ouvrent en place) */
  const localDoc = id => !!(state && Array.isArray(state.docs) && state.docs.some(d => d && d.id === id));

  function soloUrl(id) {
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    u.searchParams.set('doc', id); u.searchParams.set('solo', '1'); u.searchParams.set('desktop', '1');
    return u.toString();
  }
  /* l'enregistrement est différé de 350 ms (app.js › save) : la nouvelle fenêtre doit lire un stockage à jour */
  function flush() {
    try { if (state) localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
  }
  let warnedPopup = false;   // web : l'avertissement « fenêtres surgissantes bloquées » n'est affiché qu'une fois par session
  /* ouvre `id` dans sa propre fenêtre ; false si c'est impossible (ouverture bloquée par le navigateur) */
  function spawn(id) {
    if (!id) return false;
    flush();
    if (desktop()) { alixoDesktop.openDocWindow(id); return true; }
    let w = null;
    try { w = window.open(soloUrl(id), 'alixo-doc-' + id); } catch { w = null; }   // fenêtre nommée : un second clic revient sur le même onglet
    if (!w) {
      if (!warnedPopup) { warnedPopup = true; toast('Le navigateur a bloqué l’ouverture d’un nouvel onglet : le document s’ouvre ici. Autorisez les fenêtres surgissantes pour Alixo.', { duration: 6000 }); }
      return false;
    }
    try { w.opener = null; } catch { /* navigateur strict */ }
    return true;
  }

  /* ============================================================
     Fenêtre fille (index.html?doc=<id>&solo=1)
     ============================================================ */
  if (SOLO) {
    document.body.classList.add('solo');
    const titleOf = () => {
      const d = currentDocId ? findDoc(currentDocId) : null;
      if (d) return d.titre || 'Sans titre';
      const vt = typeof vtabInfo === 'function' && currentDocId ? vtabInfo(currentDocId) : null;
      return vt ? (vt.title || 'Document') : '';
    };
    let settingTitle = false;
    function setTitle() {
      const t = titleOf();
      const want = t ? t + ' — Alixo' : DEFAULT_TITLE;
      if (document.title === want) return;
      settingTitle = true; document.title = want; settingTitle = false;
    }
    /* les exports remettent « Alixo — Cockpit d’amphi » une fois finis : on reprend le titre du document */
    const titleEl = document.querySelector('title');
    if (titleEl) new MutationObserver(() => { if (!settingTitle && document.title === DEFAULT_TITLE && currentDocId) setTitle(); }).observe(titleEl, { childList: true, characterData: true, subtree: true });
    document.addEventListener('input', e => { if (e.target && e.target.id === 'tb-title') setTitle(); });

    /* dossier choisi dans le fil d'Ariane (undefined : l'accueil garde son dossier courant) */
    let navFolder;
    document.getElementById('breadcrumb').addEventListener('click', e => {
      const b = e.target.closest('[data-nav]'); if (!b || b.dataset.nav === '__shared') return;
      navFolder = b.dataset.nav || null;
    }, true);
    /* message à l'accueil : il le lit par l'événement « storage » (voir l'en-tête) */
    function tellHome(msg) {
      const m = { ts: Date.now() };
      if (navFolder !== undefined) m.folderId = navFolder;
      if (msg) m.msg = msg;
      try { localStorage.setItem(GOTO_KEY, JSON.stringify(m)); } catch { /* stockage indisponible */ }
    }
    let leaving = false;
    function leave(home, msg) {
      if (leaving) return; leaving = true;
      flush();
      if (home || msg) tellHome(msg);
      if (window.alixoDesktop && alixoDesktop.closeDocWindow) {
        if (home && alixoDesktop.showHome) alixoDesktop.showHome();
        alixoDesktop.closeDocWindow();
        setTimeout(() => { leaving = false; }, 1500);   // la fenêtre devrait avoir disparu ; sinon on pourra réessayer
        return;
      }
      try { window.close(); } catch { /* onglet ouvert par l'utilisateur : le navigateur refuse */ }
      setTimeout(() => {
        if (!window.closed) {   // le navigateur n'a pas fermé l'onglet : on y affiche l'accueil
          const u = new URL(location.href); const d = u.searchParams.get('desktop');
          u.search = ''; u.hash = ''; if (d) u.searchParams.set('desktop', d);
          location.replace(u.toString());
        }
      }, 60);
    }
    const goHome = msg => leave(true, msg);

    const _closeTab = closeTab, _showLibrary = showLibrary, _openDoc = openDoc;
    closeTab = function (id) { if (id && id === currentDocId) { leave(false); return; } _closeTab(id); };
    showLibrary = function () { _showLibrary(); goHome(); };
    openDoc = function (id) {
      /* un autre document (lien d'un bloc « Document », séance liée…) : dans sa propre fenêtre lui aussi */
      if (id && id !== currentDocId && id !== SOLO_ID && !isVTabId(id) && localDoc(id) && spawn(id)) return;
      _openDoc(id); setTitle();
    };
    cycleTab = function () { /* une seule vue par fenêtre : Ctrl+Tab ne ferme pas la fenêtre */ };
    /* AlixoApp garde une copie des fonctions d'origine (notifications, éditeur Word…) : on la met à jour */
    AlixoApp.openDoc = openDoc; AlixoApp.showLibrary = showLibrary;
    const _vtabOpen = AlixoApp.tabs.open.bind(AlixoApp.tabs);
    AlixoApp.tabs.open = function (opts) { const r = _vtabOpen(opts); setTitle(); return r; };
    const _vtabUpdate = AlixoApp.tabs.update.bind(AlixoApp.tabs);
    AlixoApp.tabs.update = function (id, patch) { _vtabUpdate(id, patch); setTitle(); };

    /* infobulles de la fille : le logo et le fil d'Ariane ferment la fenêtre et ramènent l'accueil */
    const home = document.getElementById('btn-home');
    if (home) home.title = 'Fermer et revenir à l’accueil (Alt+←)';
    const _renderCrumbs = renderCrumbs;
    renderCrumbs = function () {
      _renderCrumbs();
      for (const b of document.querySelectorAll('#breadcrumb [data-nav]')) {
        if (b.dataset.nav === '__shared') continue;
        b.title = b.dataset.nav ? 'Revenir à l’accueil, dans ce dossier' : 'Revenir à l’accueil';
      }
    };

    /* fermeture de la fenêtre : la dernière modification est écrite tout de suite (l'enregistrement différé n'aurait pas lieu) */
    window.addEventListener('beforeunload', () => { if (saveTm) { clearTimeout(saveTm); saveTm = null; flush(); if (window.AlixoAlx && AlixoAlx.onLocalSave) { try { AlixoAlx.onLocalSave(); } catch { /* */ } } } });

    /* démarrage : le document demandé, et rien d'autre (les onglets persistés ne concernent pas cette fenêtre) */
    openTabs = [];
    if (isVTabId(SOLO_ID)) {
      const e = AlixoApp.tabs.restoreFor(SOLO_ID);
      if (e) AlixoApp.tabs.open(Object.assign({ id: SOLO_ID, kind: vtabKind(SOLO_ID) }, e));
      else goHome('Ce document n’existe plus');
    } else if (SOLO_ID && findDoc(SOLO_ID)) {
      openDoc(SOLO_ID);
      const d = findDoc(SOLO_ID);
      if (d && !d.titre) setTimeout(() => { const t = document.getElementById('tb-title'); if (t && !t.disabled) t.focus(); }, 120);   // nouvelle séance : on nomme tout de suite
    } else goHome('Ce document n’existe plus');

    return { isSolo: true, id: SOLO_ID, enabled, goHome, spawn, applySetting() { /* le réglage se change ici aussi ; l'accueil l'applique à sa prochaine ouverture */ } };
  }

  /* ============================================================
     Accueil (fenêtre principale)
     ============================================================ */
  let closing = false;   // fermeture groupée des onglets : closeTab(courant) ouvre l'onglet voisin, qui ne doit pas partir dans une fenêtre
  const _openDoc = openDoc;
  openDoc = function (id) {
    if (!closing && enabled() && !isVTabId(id) && localDoc(id) && spawn(id)) return;
    _openDoc(id);
  };
  AlixoApp.openDoc = openDoc;   // la copie tenue par AlixoApp (notifications, éditeur Word…) suit l'enveloppe
  const _vtabOpen = AlixoApp.tabs.open.bind(AlixoApp.tabs);
  AlixoApp.tabs.open = function (opts) {
    const id = opts && opts.id;
    if (enabled() && isVTabId(id) && AlixoApp.tabs.restoreFor(id) && spawn(id)) return true;
    return _vtabOpen(opts);
  };
  /* réglage activé : l'accueil ne garde aucun onglet ouvert (les documents vivent dans leurs fenêtres) */
  function closeAllTabs() {
    closing = true;
    try { for (const id of openTabs.slice()) { try { closeTab(id); } catch (err) { console.error(err); } } } finally { closing = false; }
    openTabs = [];
    renderTabs();
  }
  /* activation du réglage : les onglets se ferment, le document en cours s'ouvre dans sa fenêtre */
  function applySetting() {
    if (!enabled()) return;
    const cur = currentDocId && !isVTabId(currentDocId) && localDoc(currentDocId) ? currentDocId : null;
    if (window.AlixoSplit && AlixoSplit.closeAll) AlixoSplit.closeAll();
    const had = openTabs.length > 0;
    closeAllTabs();
    if (currentDocId) showLibrary();
    if (cur) spawn(cur);
    if (had) toast('Les onglets ouverts ont été fermés : ouvrez un document depuis l’accueil pour l’avoir dans sa fenêtre.', { duration: 6000 });
  }
  if (enabled()) closeAllTabs();

  /* message d'une fenêtre de document qui se ferme (clé « alixo.solo.goto ») : dossier à afficher, message à montrer */
  try { localStorage.removeItem(GOTO_KEY); } catch { /* */ }
  window.addEventListener('storage', e => {
    if (e.key !== GOTO_KEY || !e.newValue) return;
    let m; try { m = JSON.parse(e.newValue); } catch { m = null; }
    try { localStorage.removeItem(GOTO_KEY); } catch { /* */ }
    if (!m || typeof m !== 'object') return;
    if ('folderId' in m) {
      const fid = typeof m.folderId === 'string' && state.folders.some(f => f && f.id === m.folderId) ? m.folderId : null;
      if (currentDocId) showLibrary();
      gotoFolder(fid);
    }
    if (typeof m.msg === 'string' && m.msg) toast(m.msg);
  });

  return { isSolo: false, enabled, applySetting, spawn };
})();
