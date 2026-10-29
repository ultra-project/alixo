/* ============================================================
   Alixo — écran partagé (1.35) : jusqu'à quatre documents côte à côte
   Glisser un onglet de la barre des onglets vers le bord droit ou gauche de la page ouvre le document dans un
   second volet ; vers le haut ou le bas d'un volet, le volet se divise encore (quatre volets au maximum : l'écran
   est découpé en quatre). Chaque volet supplémentaire est l'application elle-même, chargée dans un cadre
   (iframe index.html?pane=<id>) : séance, présentation, tableur, planche ou quiz, avec ses propres outils.
   - La fenêtre principale garde la barre supérieure, les onglets et la synchronisation ; elle place les volets,
     affiche leur en-tête (titre, « Ouvrir ici », fermer) et réduit sa propre zone (variables CSS --main-l/r/t/b,
     classe body.split).
   - Un volet (body.pane, window.ALIXO_PANE) n'a ni barre supérieure, ni onglets, ni synchronisation en ligne :
     il lit et écrit le même stockage local ; les deux côtés se préviennent par l'événement « storage » et
     fusionnent document par document (updatedAt), comme entre deux appareils.
   - La disposition est gardée sur l'appareil (clé alixo.split) et rétablie au démarrage.
   Grille : 2 × 2 cases ; chaque occupant (la fenêtre principale ou un volet) tient un rectangle { c0, c1, r0, r1 }.
   Chargé en dernier : utilise les globales d'app.js (openTabs, tabDrag, openDoc, closeTab, renderTabs, findDoc,
   docIcon, toast, esc, state, LS_KEY, TABS_LS…).
   ============================================================ */
'use strict';

window.AlixoSplit = (() => {
  const PANE = !!window.ALIXO_PANE;
  const MAX = 4;
  const LS = 'alixo.split' + (window.AlixoAuth ? window.AlixoAuth.storageSuffix() : '');
  const bars = () => { const cs = getComputedStyle(document.body); return (parseFloat(cs.getPropertyValue('--topbar-h')) || 0) + (parseFloat(cs.getPropertyValue('--tabbar-h')) || 0); };
  const I = {
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    here: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M8 9l-3 3 3 3M16 9l3 3-3 3"/></svg>',
    split: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>'
  };
  const titleOf = id => { const d = findDoc(id); if (d) return d.titre || 'Sans titre'; const vt = typeof vtabInfo === 'function' ? vtabInfo(id) : null; return vt ? vt.title : 'Document'; };
  const iconOf = id => { const d = findDoc(id); if (d) return docIcon(d); const vt = typeof vtabInfo === 'function' ? vtabInfo(id) : null; return vt && vt.icon ? vt.icon : ''; };

  /* ============================================================
     Fusion des données entre la fenêtre principale et les volets (événement « storage »)
     ============================================================ */
  let mergeTm = 0;
  function mergeFromStorage(json) {
    let inc; try { inc = JSON.parse(json); } catch { return; }
    if (!inc || !Array.isArray(inc.docs)) return;
    const local = new Map(state.docs.map(d => [d.id, d]));
    /* 1.45 : pierres tombales (suppressions) fusionnées d'abord — union, horodatage le plus récent — comme entre deux
       appareils (js/sync.js) : une fenêtre de document ne ressuscite plus une séance supprimée dans l'accueil, et inversement */
    const incDeleted = inc.deleted && typeof inc.deleted === 'object' ? inc.deleted : null;
    const incDocs = new Map(inc.docs.filter(r => r && r.id).map(r => [r.id, r]));
    /* une pierre tombale datée du futur (horloge faussée, stockage altéré) n'est jamais reprise : elle effacerait tout ce qui suit */
    const sane = ts => +ts > 0 && +ts <= Date.now() + 60000;
    if (incDeleted) {
      if (!state.deleted) state.deleted = {};
      for (const kind of ['docs', 'folders']) {
        const src = incDeleted[kind]; if (!src || typeof src !== 'object') continue;
        if (!state.deleted[kind]) state.deleted[kind] = {};
        for (const [id, ts] of Object.entries(src)) if (sane(ts)) state.deleted[kind][id] = Math.max(+ts, +state.deleted[kind][id] || 0);
      }
    }
    /* l'autre fenêtre a restauré un document (annulation d'une suppression) : sa pierre tombale locale est levée avant la fusion
       — le document y est plus récent que la tombale, ou il est de nouveau présent sans tombale chez l'autre */
    if (state.deleted && state.deleted.docs) {
      for (const [id, ts] of Object.entries(state.deleted.docs)) {
        const r = incDocs.get(id); if (!r) continue;
        const otherTomb = incDeleted && incDeleted.docs && sane(incDeleted.docs[id]) ? +incDeleted.docs[id] : 0;
        if ((+r.updatedAt || 0) > +ts || !otherTomb) delete state.deleted.docs[id];
      }
    }
    const tomb = (d, from) => { const t = from && from.docs && +from.docs[d.id]; return sane(t) && t >= (+d.updatedAt || 0); };
    const upserts = inc.docs.filter(r => { const l = local.get(r.id); return !tomb(r, state.deleted) && (!l || (+r.updatedAt || 0) > (+l.updatedAt || 0)); });
    /* un document supprimé par l'autre fenêtre (pierre tombale plus récente que lui) disparaît ici aussi ; avant la 1.45, seule la
       fenêtre principale faisait foi : un volet ne retirait rien, et un document supprimé ailleurs pouvait réapparaître */
    const removed = state.docs.filter(d => tomb(d, inc.deleted)).map(d => d.id);
    if (upserts.length || removed.length) AlixoApp.applyRemoteDocs(upserts, removed);
    /* convergence : si cette fenêtre tient une version plus récente (ou un document que l'autre n'a pas), on la réécrit : l'autre
       fenêtre la reprendra par le même événement « storage », et la dernière modification n'est jamais écrasée à la fermeture */
    const ahead = state.docs.some(d => { const r = incDocs.get(d.id); return r ? (+d.updatedAt || 0) > (+r.updatedAt || 0) : !tomb(d, inc.deleted); });
    if (ahead && !upserts.length && !removed.length) save();
    const foldersChanged = JSON.stringify(inc.folders || []) !== JSON.stringify(state.folders || []);
    const settingsNewer = (+inc.settingsAt || 0) > (+state.settingsAt || 0);
    if (foldersChanged || settingsNewer) AlixoApp.applyRemoteMeta(foldersChanged ? inc.folders : null, settingsNewer ? inc.settings : null, Array.isArray(inc.events) ? inc.events : null, { settingsAt: +inc.settingsAt || 0, todos: inc.todos, todoCats: inc.todoCats });
    if (Array.isArray(inc.files) && JSON.stringify(inc.files) !== JSON.stringify(state.files || [])) { state.files = inc.files; if (!currentDocId && typeof renderLibrary === 'function') renderLibrary(); }
  }
  window.addEventListener('storage', e => {
    if (e.key !== LS_KEY || !e.newValue) return;
    clearTimeout(mergeTm);
    mergeTm = setTimeout(() => mergeFromStorage(e.newValue), 120);
  });

  /* ============================================================
     Côté volet (iframe)
     ============================================================ */
  if (PANE) {
    const paneId = new URLSearchParams(location.search).get('pane') || '';
    const post = msg => { try { parent.postMessage(Object.assign({ alixo: 'pane', pane: paneId }, msg), location.origin); } catch { /* */ } };
    document.body.classList.add('pane');
    document.documentElement.style.setProperty('--topbar-h', '0px');
    const say = () => post({ type: 'doc', id: currentDocId, title: currentDocId ? titleOf(currentDocId) : '' });
    /* fermer l'onglet courant ou revenir à la bibliothèque : le volet se ferme */
    const _closeTab = closeTab, _showLibrary = showLibrary, _openDoc = openDoc;
    closeTab = function (id) { if (id === currentDocId) { post({ type: 'close' }); return; } _closeTab(id); };
    showLibrary = function () { _showLibrary(); post({ type: 'close' }); };
    openDoc = function (id) { _openDoc(id); say(); };
    window.addEventListener('message', e => {
      if (e.origin !== location.origin || !e.data || e.data.alixo !== 'main') return;
      if (e.data.type === 'open' && e.data.id) openDoc(e.data.id);
      if (e.data.type === 'focus') { try { window.focus(); } catch { /* */ } }
    });
    window.addEventListener('focus', () => post({ type: 'focus' }));
    document.addEventListener('pointerdown', () => post({ type: 'focus' }), true);
    /* titre suivi (le fil d'Ariane est caché : on remonte le titre à la fenêtre principale) */
    document.addEventListener('input', e => { if (e.target && e.target.id === 'tb-title') say(); });
    const start = () => { if (paneId && (findDoc(paneId) || (typeof isVTabId === 'function' && isVTabId(paneId)))) openDoc(paneId); else post({ type: 'close' }); post({ type: 'ready' }); };
    start();
    return { isPane: true, id: paneId };
  }

  /* ============================================================
     Côté fenêtre principale : disposition
     ============================================================ */
  let panes = [];                                   // [{ id, rect: { c0, c1, r0, r1 }, el, frame, title }]
  let mainRect = { c0: 0, c1: 2, r0: 0, r1: 2 };
  let host = null, zones = null, zoneTm = 0, drop = null;
  const paneOf = id => panes.find(p => p.id === id) || null;
  const saveLayout = () => { try { if (panes.length) localStorage.setItem(LS, JSON.stringify({ main: mainRect, panes: panes.map(p => ({ id: p.id, rect: p.rect })) })); else localStorage.removeItem(LS); } catch { /* stockage indisponible */ } };
  const pct = v => (v * 50) + '%';
  const rectStyle = r => `left:${pct(r.c0)};top:${pct(r.r0)};width:${pct(r.c1 - r.c0)};height:${pct(r.r1 - r.r0)}`;

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div'); host.id = 'panes'; host.hidden = true;
    document.body.appendChild(host);
    host.addEventListener('click', e => {
      const b = e.target.closest('[data-pact]'); if (!b) return;
      const p = paneOf(b.closest('.pane').dataset.pane); if (!p) return;
      if (b.dataset.pact === 'close') closePane(p.id);
      if (b.dataset.pact === 'here') swapWithMain(p.id);
    });
    window.addEventListener('message', e => {
      if (e.origin !== location.origin || !e.data || e.data.alixo !== 'pane') return;
      const p = paneOf(e.data.pane); if (!p) return;
      if (e.data.type === 'close') { closePane(p.id); return; }
      if (e.data.type === 'doc') {
        if (e.data.id && e.data.id !== p.id) { const other = paneOf(e.data.id); if (other && other !== p) closePane(other.id); p.id = e.data.id; p.el.dataset.pane = p.id; if (!openTabs.includes(p.id)) { openTabs.push(p.id); } saveLayout(); }
        p.title = e.data.title || titleOf(p.id);
        renderPaneHead(p); renderTabs();
      }
      if (e.data.type === 'focus') { host.querySelectorAll('.pane.focus').forEach(x => x.classList.remove('focus')); p.el.classList.add('focus'); }
    });
    window.addEventListener('resize', applyVars);
    return host;
  }
  function renderPaneHead(p) {
    const h = p.el.querySelector('.pane-head');
    h.innerHTML = `<span class="pane-ico">${iconOf(p.id)}</span><span class="pane-title">${esc(p.title || titleOf(p.id))}</span>
      <button type="button" data-pact="here" title="Ouvrir ce document dans la zone principale (et mettre le document principal ici)">${I.here}</button>
      <button type="button" data-pact="close" title="Fermer ce volet (le document reste dans ses onglets)">${I.close}</button>`;
  }
  function paneUrl(id) {
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    u.searchParams.set('pane', id); u.searchParams.set('desktop', '1');
    return u.toString();
  }
  function mountPane(p) {
    ensureHost();
    p.el = document.createElement('div'); p.el.className = 'pane'; p.el.dataset.pane = p.id; p.el.style.cssText = rectStyle(p.rect);
    p.el.innerHTML = `<div class="pane-head"></div>`;
    p.frame = document.createElement('iframe'); p.frame.className = 'pane-frame'; p.frame.title = 'Document : ' + titleOf(p.id); p.frame.src = paneUrl(p.id);
    p.el.appendChild(p.frame);
    renderPaneHead(p);
    host.appendChild(p.el);
  }
  function applyVars() {
    const r = document.documentElement.style;
    const on = panes.length > 0;
    document.body.classList.toggle('split', on);
    if (host) host.hidden = !on;
    if (!on) { ['--main-l', '--main-r', '--main-t', '--main-b'].forEach(k => r.removeProperty(k)); return; }
    const W = window.innerWidth, H = Math.max(0, window.innerHeight - bars());
    r.setProperty('--main-l', Math.round(mainRect.c0 * W / 2) + 'px');
    r.setProperty('--main-r', Math.round((2 - mainRect.c1) * W / 2) + 'px');
    r.setProperty('--main-t', Math.round(mainRect.r0 * H / 2) + 'px');
    r.setProperty('--main-b', Math.round((2 - mainRect.r1) * H / 2) + 'px');
    panes.forEach(p => { p.el.style.cssText = rectStyle(p.rect); });
    if (typeof applyPagesMode === 'function' && currentDocId) applyPagesMode();
  }

  /* découpe d'un rectangle : `dir` = côté que prend le nouveau venu */
  function splitRect(r, dir) {
    const w = r.c1 - r.c0, h = r.r1 - r.r0;
    if ((dir === 'l' || dir === 'r') && w === 2) { const a = { c0: 0, c1: 1, r0: r.r0, r1: r.r1 }, b = { c0: 1, c1: 2, r0: r.r0, r1: r.r1 }; return dir === 'l' ? { nouveau: a, reste: b } : { nouveau: b, reste: a }; }
    if ((dir === 't' || dir === 'b') && h === 2) { const a = { c0: r.c0, c1: r.c1, r0: 0, r1: 1 }, b = { c0: r.c0, c1: r.c1, r0: 1, r1: 2 }; return dir === 't' ? { nouveau: a, reste: b } : { nouveau: b, reste: a }; }
    return null;
  }
  const touching = (a, b) => (a.r0 === b.r0 && a.r1 === b.r1 && (a.c1 === b.c0 || b.c1 === a.c0)) || (a.c0 === b.c0 && a.c1 === b.c1 && (a.r1 === b.r0 || b.r1 === a.r0));
  const union = (a, b) => ({ c0: Math.min(a.c0, b.c0), c1: Math.max(a.c1, b.c1), r0: Math.min(a.r0, b.r0), r1: Math.max(a.r1, b.r1) });

  /* ouvre `id` dans un nouveau volet, en découpant la zone `target` ('main' ou un volet) du côté `dir` */
  function openInPane(id, target, dir) {
    if (!id || !(findDoc(id) || (typeof vtabInfo === 'function' && vtabInfo(id)))) return false;
    if (document.body.classList.contains('mobile')) return false;
    if (paneOf(id)) { focusPane(id); return true; }
    if (panes.length + 1 >= MAX) { toast('Quatre documents au maximum sur l’écran'); return false; }
    const tgt = target === 'main' ? { rect: mainRect } : paneOf(target);
    if (!tgt) return false;
    const cut = splitRect(tgt.rect, dir);
    if (!cut) { toast('Cette zone ne peut plus être divisée dans ce sens'); return false; }
    if (target === 'main') mainRect = cut.reste; else { tgt.rect = cut.reste; tgt.el.style.cssText = rectStyle(tgt.rect); }
    const p = { id, rect: cut.nouveau, title: titleOf(id) };
    panes.push(p); mountPane(p);
    if (!openTabs.includes(id)) openTabs.push(id);
    /* le document quitte la zone principale : on y montre l'onglet voisin (ou la bibliothèque) */
    if (currentDocId === id) { const others = openTabs.filter(t => t !== id && !paneOf(t)); if (others.length) openDocRaw(others[others.length - 1]); else showLibrary(); }
    applyVars(); saveLayout(); renderTabs();
    return true;
  }
  function closePane(id, opts = {}) {
    const i = panes.findIndex(p => p.id === id); if (i < 0) return;
    const p = panes[i];
    panes.splice(i, 1);
    p.el.remove();
    /* la place libérée revient à un voisin qui partage un bord entier : la fenêtre principale d'abord */
    let freed = p.rect;
    if (touching(freed, mainRect)) mainRect = union(freed, mainRect);
    else {
      const n = panes.find(q => touching(freed, q.rect));
      if (n) { n.rect = union(freed, n.rect); }
      else { mainRect = union(freed, mainRect); }   // ne devrait pas arriver avec quatre cases
    }
    if (!panes.length) mainRect = { c0: 0, c1: 2, r0: 0, r1: 2 };
    applyVars(); saveLayout();
    if (!opts.keepTab) renderTabs();
  }
  function focusPane(id) { const p = paneOf(id); if (!p) return; host.querySelectorAll('.pane.focus').forEach(x => x.classList.remove('focus')); p.el.classList.add('focus', 'flash'); setTimeout(() => p.el.classList.remove('flash'), 900); try { p.frame.contentWindow.postMessage({ alixo: 'main', type: 'focus' }, location.origin); } catch { /* */ } }
  function swapWithMain(id) {
    const p = paneOf(id); if (!p) return;
    const mainId = currentDocId;
    if (!mainId || paneOf(mainId)) { closePane(id, { keepTab: true }); openDocRaw(id); return; }
    p.id = mainId; p.el.dataset.pane = mainId; p.title = titleOf(mainId); renderPaneHead(p);
    try { p.frame.contentWindow.postMessage({ alixo: 'main', type: 'open', id: mainId }, location.origin); } catch { p.frame.src = paneUrl(mainId); }
    openDocRaw(id);
    saveLayout(); renderTabs();
  }

  /* ---------------- accroches dans l'application ---------------- */
  const openDocRaw = openDoc;
  const _closeTab = closeTab, _renderTabs = renderTabs;
  openDoc = function (id) {
    if (paneOf(id)) { focusPane(id); return; }   // déjà affiché dans un volet : on le montre
    openDocRaw(id);
  };
  closeTab = function (id) {
    if (paneOf(id)) closePane(id, { keepTab: true });
    _closeTab(id);
  };
  renderTabs = function () {
    _renderTabs();
    if (!panes.length) return;
    panes.forEach(p => { const t = document.querySelector(`#tabbar .tab[data-tab="${CSS.escape(p.id)}"]`); if (t) { t.classList.add('in-pane'); t.title = (t.title || '') + ' — affiché dans un volet'; const n = t.querySelector('.tab-name'); if (n && !t.querySelector('.tab-pane')) n.insertAdjacentHTML('beforebegin', `<span class="tab-pane" title="Affiché dans un volet">${I.split}</span>`); } });
  };
  /* un document supprimé (ici ou sur un autre appareil) ferme son volet */
  const _applyRemoteDocs = AlixoApp.applyRemoteDocs.bind(AlixoApp);
  AlixoApp.applyRemoteDocs = function (upserts, removedIds) { (removedIds || []).forEach(id => { if (paneOf(id)) closePane(id, { keepTab: true }); }); return _applyRemoteDocs(upserts, removedIds); };

  /* ---------------- zones de dépôt pendant le glisser d'un onglet ---------------- */
  function ensureZones() {
    if (zones) return zones;
    zones = document.createElement('div'); zones.id = 'split-zones'; zones.hidden = true;
    zones.innerHTML = `<div class="sz-prev" hidden></div><div class="sz-label" hidden></div>`;
    document.body.appendChild(zones);
    zones.addEventListener('dragover', e => {
      if (!tabDrag) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      drop = hitTest(e.clientX, e.clientY);
      paintPreview();
    });
    zones.addEventListener('dragleave', e => { if (!e.relatedTarget || !zones.contains(e.relatedTarget)) { drop = null; paintPreview(); } });
    zones.addEventListener('drop', e => {
      e.preventDefault();
      const id = tabDrag; const d = drop; hideZones();
      if (!id || !d) return;
      if (d.dir === 'c' && d.target !== 'main') { const p = paneOf(d.target); if (p && p.id !== id) { if (paneOf(id)) closePane(id, { keepTab: true }); p.id = id; p.el.dataset.pane = id; p.title = titleOf(id); renderPaneHead(p); try { p.frame.contentWindow.postMessage({ alixo: 'main', type: 'open', id }, location.origin); } catch { p.frame.src = paneUrl(id); } saveLayout(); renderTabs(); } return; }
      if (d.dir === 'c') { openDocRaw(id); return; }
      openInPane(id, d.target, d.dir);
    });
    return zones;
  }
  /* quelle zone (principale ou volet) sous le pointeur, et quel bord : l, r, t, b, ou c (centre) */
  function hitTest(x, y) {
    const W = window.innerWidth, top = bars(), H = Math.max(1, window.innerHeight - top);
    const gx = (x / W) * 2, gy = ((y - top) / H) * 2;
    const inRect = r => gx >= r.c0 && gx < r.c1 && gy >= r.r0 && gy < r.r1;
    let target = 'main', rect = mainRect;
    for (const p of panes) if (inRect(p.rect)) { target = p.id; rect = p.rect; break; }
    const px = { x: rect.c0 * W / 2, y: top + rect.r0 * H / 2, w: (rect.c1 - rect.c0) * W / 2, h: (rect.r1 - rect.r0) * H / 2 };
    const fx = (x - px.x) / px.w, fy = (y - px.y) / px.h;
    const band = 0.28;
    let dir = 'c';
    const cand = [['l', fx], ['r', 1 - fx], ['t', fy], ['b', 1 - fy]].filter(c => c[1] < band).sort((a, b) => a[1] - b[1]);
    if (cand.length) dir = cand[0][0];
    return { target, dir, px };
  }
  function paintPreview() {
    const prev = zones.querySelector('.sz-prev'), lab = zones.querySelector('.sz-label');
    if (!drop) { prev.hidden = true; lab.hidden = true; return; }
    const { px, dir, target } = drop;
    let r = Object.assign({}, px), txt = '';
    const tgt = target === 'main' ? { rect: mainRect } : paneOf(target);
    const can = dir === 'c' ? true : !!(tgt && splitRect(tgt.rect, dir));
    if (dir === 'l') r.w /= 2; else if (dir === 'r') { r.x += r.w / 2; r.w /= 2; } else if (dir === 't') r.h /= 2; else if (dir === 'b') { r.y += r.h / 2; r.h /= 2; }
    if (dir === 'c') txt = target === 'main' ? 'Ouvrir ici' : 'Remplacer ce volet';
    else txt = !can ? 'Cette zone ne se divise plus dans ce sens' : (panes.length + 1 >= MAX ? 'Quatre documents au maximum' : ({ l: 'Ouvrir à gauche', r: 'Ouvrir à droite', t: 'Ouvrir au-dessus', b: 'Ouvrir en dessous' })[dir]);
    const bad = dir !== 'c' && (!can || panes.length + 1 >= MAX);
    prev.hidden = false; prev.classList.toggle('bad', bad);
    prev.style.cssText = `left:${r.x}px;top:${r.y - bars()}px;width:${r.w}px;height:${r.h}px`;
    lab.hidden = false; lab.textContent = txt; lab.style.cssText = `left:${r.x + r.w / 2}px;top:${r.y - bars() + r.h / 2}px`;
  }
  function showZones() { if (document.body.classList.contains('mobile')) return; ensureZones(); zones.hidden = false; drop = null; paintPreview(); }
  function hideZones() { clearTimeout(zoneTm); if (zones) { zones.hidden = true; drop = null; } }
  document.addEventListener('dragstart', e => {
    const t = e.target && e.target.closest ? e.target.closest('#tabbar .tab[data-tab]') : null;
    if (!t || !t.dataset.tab) return;
    clearTimeout(zoneTm); zoneTm = setTimeout(showZones, 120);   // un simple réordonnancement d'onglets ne fait pas apparaître les zones tout de suite
  });
  document.addEventListener('dragend', hideZones);
  document.addEventListener('drop', () => setTimeout(hideZones, 0));

  /* ---------------- rétablissement au démarrage ---------------- */
  function restore() {
    if (window.ALIXO_SOLO) return;   // 1.45 : une fenêtre de document n'a pas de volets
    let saved = null; try { saved = JSON.parse(localStorage.getItem(LS)); } catch { saved = null; }
    if (!saved || !Array.isArray(saved.panes) || !saved.panes.length) return;
    if (document.body.classList.contains('mobile')) return;
    const ok = saved.panes.filter(p => p && p.id && p.rect && findDoc(p.id));
    if (!ok.length) { try { localStorage.removeItem(LS); } catch { /* */ } return; }
    if (ok.length !== saved.panes.length) { /* un document a disparu : on repart d'une disposition simple */
      mainRect = { c0: 0, c1: 1, r0: 0, r1: 2 };
      const n = Math.min(2, ok.length);
      ok.slice(0, n).forEach((p, i) => { p.rect = n === 1 ? { c0: 1, c1: 2, r0: 0, r1: 2 } : { c0: 1, c1: 2, r0: i, r1: i + 1 }; });
      ok.length = n;
    } else mainRect = saved.main || mainRect;
    ok.forEach(p => { const q = { id: p.id, rect: p.rect, title: titleOf(p.id) }; panes.push(q); mountPane(q); if (!openTabs.includes(q.id)) openTabs.push(q.id); });
    applyVars(); renderTabs();
  }
  restore();

  return { isPane: false, openInPane, closePane, focusPane, panes: () => panes.map(p => ({ id: p.id, rect: Object.assign({}, p.rect) })), mainRect: () => Object.assign({}, mainRect), closeAll: () => { panes.slice().forEach(p => closePane(p.id)); } };
})();
