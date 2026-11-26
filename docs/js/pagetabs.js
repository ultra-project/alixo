/* Alixo 1.59 — onglets d'une séance : l'interface (la barre #page-tabs au-dessus de la page).
   Jusqu'à 3 onglets : des pastilles « ① Principal » et un « + » en pointillé. Au-delà : un bouton compact
   « ▦ Nom  n sur N ⌄ » qui ouvre une fenêtre en grille de cartes (cliquer pour ouvrir, glisser pour réordonner,
   double-clic ou F2 pour renommer, menu « … » : Renommer / Dupliquer / Supprimer).
   Les données (d.pages, d.page) et les opérations (switchPage, addPage, deletePage, duplicatePage, renamePageInline,
   save…) restent dans js/app.js, qui appelle AlixoPageTabs.render() depuis renderPageTabs(). Styles : pagetabs.css.
   Clavier : flèches pour se déplacer, Entrée pour ouvrir, F2 pour renommer, Alt + Maj + flèches pour déplacer
   (Alt + ← seul reste « Retour à la bibliothèque »),
   Maj + F10 ou touche Menu pour les actions, Échap pour fermer. */
(() => {
  'use strict';
  const bar = document.getElementById('page-tabs');
  if (!bar) return;
  const MAX_PILLS = 3;           // au-delà, le bouton compact et la fenêtre
  const ICO = {
    grid: '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
    chev: '<svg aria-hidden="true" class="pg-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    plus: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    more: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
    pen: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    dup: '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    trash: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
  };
  const ORD = ['première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième', 'neuvième', 'dixième', 'onzième', 'douzième', 'treizième', 'quatorzième', 'quinzième', 'seizième', 'dix-septième', 'dix-huitième', 'dix-neuvième', 'vingtième'];
  const FOOT_HELP_MOUSE = 'Cliquez pour ouvrir · glissez pour réordonner · double-clic pour renommer';
  const FOOT_HELP_TOUCH = 'Touchez un onglet pour l’ouvrir · appui long pour le déplacer · « … » pour renommer';
  const FOOT_HELP_KEYS = 'Entrée pour ouvrir · F2 pour renommer · Maj + F10 pour le menu · Alt + Maj + flèches pour déplacer';
  const FOOT_RENAME = 'Entrée pour valider · Échap pour annuler';

  let panel = null;          // la fenêtre (dans #page-tabs), ou null
  let menu = null;           // le menu « … » ouvert, ou null
  let renaming = null;       // { id, isNew } : carte en cours de renommage dans la fenêtre
  let drag = null;           // glisser-déposer en cours
  let pendingFocus = null;   // identifiant d'onglet à rendre au clavier après le prochain rendu
  let clickTimer = 0;        // simple clic sur une carte : on attend un éventuel double-clic avant de fermer
  let swallowClick = false;  // le clic qui suit un dépôt est ignoré (remis à zéro au prochain appui)
  let lastPointerType = 'mouse';
  let openedByKey = false;   // fenêtre ouverte au clavier : le pied décrit les raccourcis
  /* aide du pied : clavier si la fenêtre a été ouverte au clavier, sinon tactile (pas de survol) ou souris */
  const footHelp = () => openedByKey ? FOOT_HELP_KEYS : (window.matchMedia && matchMedia('(hover: none)').matches) ? FOOT_HELP_TOUCH : FOOT_HELP_MOUSE;

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ro = () => typeof readOnly !== 'undefined' && !!readOnly;
  const cur = () => { const d = typeof doc === 'function' ? doc() : null; return d ? { d, pages: docPages(d) } : null; };
  const nameOf = p => (p && p.titre) || 'Sans titre';
  const isOpen = () => !!panel;

  /* ---------------- la barre ---------------- */
  function render() {
    const c = cur();
    if (!c || bar.hidden) { closePanel(false); closeMenu(); bar.innerHTML = ''; return; }
    const { d, pages } = c;
    const i = Math.max(0, pages.findIndex(p => p.id === d.page));
    const addBtn = ro() ? '' : `<button type="button" class="pg-add" data-pgadd aria-label="Nouvel onglet" title="Nouvel onglet dans cette séance">${ICO.plus}</button>`;
    let html;
    if (pages.length <= MAX_PILLS) {
      if (panel) closePanel(false);   // plus de bouton compact où l'ancrer
      html = `<div class="pg-strip" role="tablist" aria-label="Onglets de la séance">` + pages.map((p, k) => `<button type="button" class="pg-tab ${p.id === d.page ? 'active' : ''}" role="tab" aria-selected="${p.id === d.page}" aria-controls="doc" tabindex="${p.id === d.page ? 0 : -1}" data-page="${esc(p.id)}" title="${esc(nameOf(p))} — double-clic : renommer · clic droit : options"><span class="pg-num" data-n="${k + 1}" aria-hidden="true"></span><span class="pg-name">${esc(nameOf(p))}</span></button>`).join('') + `</div>` + addBtn;
    } else {
      const p = pages[i];
      html = `<button type="button" class="pg-cur" aria-haspopup="dialog" aria-expanded="${isOpen()}" title="Tous les onglets de la séance"><span class="pg-ico">${ICO.grid}</span><span class="pg-name">${esc(nameOf(p))}</span><span class="pg-count">${i + 1} sur ${pages.length}</span>${ICO.chev}</button>` + addBtn;
    }
    if (panel) panel.remove();
    bar.innerHTML = html;
    if (panel) { bar.appendChild(panel); renderPanel(); }
    if (pendingFocus) { const el = bar.querySelector(`[data-page="${CSS.escape(pendingFocus)}"], [data-card="${CSS.escape(pendingFocus)}"]`); pendingFocus = null; if (el) el.focus(); }
  }

  bar.addEventListener('click', e => {
    if (e.target.closest('.pgt-panel')) return;
    if (e.target.closest('[data-pgadd]')) { addPage(); return; }
    if (e.target.closest('.pg-cur')) { if (isOpen()) closePanel(true); else openPanel({ byKey: e.detail === 0 }); return; }
    const t = e.target.closest('[data-page]'); if (!t) return;
    /* 2e clic d'un double-clic (e.detail) : la pastille a pu être redessinée par le 1er, d'où le test ici et non sur dblclick */
    if (e.detail === 2) { if (!ro()) renamePageInline(t.dataset.page); return; }
    switchPage(t.dataset.page);
  });
  bar.addEventListener('contextmenu', e => {
    if (e.target.closest('.pgt-panel')) return;
    const t = e.target.closest('[data-page], .pg-cur'); if (!t) return;
    e.preventDefault();
    if (ro() || lastPointerType === 'touch') return;
    const id = t.dataset.page || (cur() || {}).d?.page; if (!id) return;
    openMenu(id, e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : t, t);
  });
  bar.addEventListener('keydown', e => {
    if (e.target.closest('.pgt-panel')) return;
    const t = e.target.closest('[data-page]'); if (!t) return;
    const tabs = [...bar.querySelectorAll('[data-page]')]; const i = tabs.indexOf(t);
    const k = e.key;
    /* Alt + Maj + ←/→ déplace l'onglet (Alt + ← seul reste « retour à la bibliothèque », app.js) */
    if (e.altKey && e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) { e.preventDefault(); e.stopPropagation(); if (!ro()) { pendingFocus = t.dataset.page; movePage(t.dataset.page, k === 'ArrowLeft' ? -1 : 1); } return; }
    if (e.altKey) return;   // Alt + ← seul : « retour à la bibliothèque » (app.js), pas une navigation entre onglets
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End') {
      e.preventDefault();
      const j = k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : (i + (k === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
      tabs.forEach(x => x.tabIndex = -1); tabs[j].tabIndex = 0; tabs[j].focus();
    } else if (k === 'F2') { e.preventDefault(); if (!ro()) renamePageInline(t.dataset.page); }
    else if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) { e.preventDefault(); if (!ro()) openMenu(t.dataset.page, t, t); }
  });
  document.addEventListener('pointerdown', e => { lastPointerType = e.pointerType || 'mouse'; }, true);

  /* ---------------- la fenêtre ---------------- */
  function openPanel({ rename = null, isNew = false, byKey = false } = {}) {
    const c = cur(); if (!c || bar.hidden) return false;
    if (!panel) {
      openedByKey = !!byKey;
      panel = document.createElement('div');
      panel.className = 'pgt-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Onglets de la séance');
      bar.appendChild(panel);
      bindPanel(panel);
    }
    renaming = rename ? { id: rename, isNew } : null;
    const btn = bar.querySelector('.pg-cur'); if (btn) btn.setAttribute('aria-expanded', 'true');
    renderPanel();
    if (!renaming) { const a = panel.querySelector('.pgt-card.active') || panel.querySelector('.pgt-card'); if (a) a.focus(); }
    return true;
  }
  function closePanel(restoreFocus) {
    closeMenu(); endDrag(false);
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = 0; }
    if (!panel) return;
    const had = panel.contains(document.activeElement);
    renaming = null;
    panel.remove(); panel = null;
    const btn = bar.querySelector('.pg-cur'); if (btn) { btn.setAttribute('aria-expanded', 'false'); if (restoreFocus && had) btn.focus(); }
  }
  function renderPanel() {
    const c = cur(); if (!panel || !c) return;
    const { d, pages } = c;
    if (renaming && !pages.some(p => p.id === renaming.id)) renaming = null;
    const cards = pages.map((p, k) => {
      const active = p.id === d.page, n = k + 1;
      if (renaming && renaming.id === p.id) {
        return `<div class="pgt-cell" data-cell="${esc(p.id)}"><div class="pgt-card renaming ${active ? 'active' : ''}"><span class="pg-num" data-n="${n}" aria-hidden="true"></span><span class="pgt-sk" aria-hidden="true"><i></i><i></i><i></i></span><input class="pgt-rename" type="text" aria-label="Nom de l’onglet" maxlength="60" spellcheck="false" autocomplete="off" value="${esc(p.titre || '')}" placeholder="Nom de l’onglet"></div></div>`;
      }
      return `<div class="pgt-cell" data-cell="${esc(p.id)}"><button type="button" class="pgt-card ${active ? 'active' : ''}" data-card="${esc(p.id)}" aria-pressed="${active}" tabindex="${active ? 0 : -1}" aria-label="${esc(nameOf(p))}, onglet ${n} sur ${pages.length}${active ? ', affiché' : ''}"><span class="pg-num" data-n="${n}" aria-hidden="true"></span><span class="pgt-sk" aria-hidden="true"><i></i><i></i><i></i></span><span class="pg-name">${esc(nameOf(p))}</span></button>${ro() ? '' : `<button type="button" class="pgt-more" data-more="${esc(p.id)}" tabindex="-1" aria-label="Actions de « ${esc(nameOf(p))} »" aria-haspopup="menu" aria-expanded="false"><span>${ICO.more}</span></button>`}</div>`;
    }).join('');
    panel.innerHTML = `<div class="pgt-head"><p class="pgt-title" id="pgt-title">Onglets · ${pages.length}</p><button type="button" class="pgt-close" aria-label="Fermer">${ICO.close}</button></div>
      <div class="pgt-grid">${cards}${ro() ? '' : `<button type="button" class="pgt-new" aria-label="Nouvel onglet">${ICO.plus}<span>Nouvel onglet</span></button>`}</div>
      <p class="pgt-foot" aria-live="polite">${renaming ? FOOT_RENAME : footHelp()}</p>`;
    panel.setAttribute('aria-labelledby', 'pgt-title');
    if (renaming) { const inp = panel.querySelector('.pgt-rename'); if (inp) { bindRename(inp, renaming); inp.focus(); inp.select(); } }
  }
  function setFoot(txt) { const f = panel && panel.querySelector('.pgt-foot'); if (f) f.textContent = txt; }

  function bindPanel(el) {
    el.addEventListener('click', e => {
      if (e.target.closest('.pgt-close')) { closePanel(true); return; }
      if (e.target.closest('.pgt-new')) { addPage(); return; }
      const more = e.target.closest('[data-more]'); if (more) { openMenu(more.dataset.more, more, more); return; }
      const card = e.target.closest('[data-card]'); if (!card) return;
      if (swallowClick) { swallowClick = false; return; }   // relâchement d'un glisser
      const id = card.dataset.card;
      if (e.detail === 2) { if (clickTimer) { clearTimeout(clickTimer); clickTimer = 0; } if (!ro()) startRename(id); return; }
      if (e.detail === 0 || lastPointerType === 'touch') { switchPage(id); closePanel(false); const b = bar.querySelector('.pg-cur'); if (b) b.focus(); return; }   // clavier (Entrée / Espace), doigt : focus rendu au bouton compact
      /* souris : l'onglet s'ouvre tout de suite ; la fenêtre se ferme 250 ms plus tard, sauf double-clic (renommer) */
      switchPage(id);
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { clickTimer = 0; closePanel(false); }, 250);
    });
    el.addEventListener('contextmenu', e => {
      const card = e.target.closest('[data-card]'); if (!card) return;
      e.preventDefault();
      if (ro() || lastPointerType === 'touch' || (drag && drag.active)) return;
      openMenu(card.dataset.card, { x: e.clientX, y: e.clientY }, card);
    });
    el.addEventListener('keydown', e => {
      const k = e.key;
      if (e.target.classList.contains('pgt-rename')) return;   // géré par bindRename
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (menu) closeMenu(true); else closePanel(true); return; }
      if (k === 'Tab') { trapTab(e); return; }
      const card = e.target.closest('[data-card]'); if (!card) return;
      const id = card.dataset.card;
      const cards = [...el.querySelectorAll('[data-card]')]; const i = cards.indexOf(card);
      const cols = columns(cards);
      if (e.altKey && e.shiftKey && /^Arrow/.test(k)) { e.preventDefault(); e.stopPropagation(); if (ro()) return; const c = cur(); const from = c.pages.findIndex(p => p.id === id); const to = from + (k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : k === 'ArrowUp' ? -cols : cols); if (to >= 0 && to < c.pages.length) { pendingFocus = id; movePageTo(id, to); } return; }
      if (e.altKey) return;   // Alt + ← seul : laissé à app.js (retour à la bibliothèque)
      let j = -1;
      if (k === 'ArrowLeft') j = i - 1; else if (k === 'ArrowRight') j = i + 1; else if (k === 'ArrowUp') j = i - cols; else if (k === 'ArrowDown') j = i + cols; else if (k === 'Home') j = 0; else if (k === 'End') j = cards.length - 1;
      if (j >= 0 && j < cards.length) { e.preventDefault(); cards.forEach(x => x.tabIndex = -1); cards[j].tabIndex = 0; cards[j].focus(); return; }
      if (j !== -1) { e.preventDefault(); return; }
      if (k === 'F2') { e.preventDefault(); if (!ro()) startRename(id); }
      else if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) { e.preventDefault(); if (!ro()) openMenu(id, card, card); }
    });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('touchmove', e => { if (drag && drag.active) e.preventDefault(); }, { passive: false });
  }
  const columns = cards => { if (cards.length < 2) return 1; const t = cards[0].getBoundingClientRect().top; let n = 0; for (const c of cards) { if (Math.abs(c.getBoundingClientRect().top - t) < 2) n++; else break; } return Math.max(1, n); };
  function trapTab(e) {
    const f = [...panel.querySelectorAll('button:not([disabled]), input')].filter(x => x.tabIndex >= 0 && x.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  }
  document.addEventListener('pointerdown', e => {
    if (panel && !e.target.closest('#page-tabs, .pgt-menu, #popover, #ctxmenu')) closePanel(false);
    if (menu && !e.target.closest('.pgt-menu')) closeMenu(false);
  });

  /* ---------------- renommer dans la carte (C5) ---------------- */
  function startRename(id) {
    if (ro()) return;
    if (!panel) { openPanel({ rename: id }); return; }
    renaming = { id, isNew: false }; renderPanel();
  }
  function bindRename(inp, ctx) {
    const c = cur(); if (!c) return;
    const { d } = c; const pg = c.pages.find(p => p.id === ctx.id); if (!pg) return;
    const old = pg.titre || '';
    let done = false;
    const finish = (ok, how) => {
      if (done) return; done = true;
      const v = inp.value.trim();
      renaming = null;
      if (ok && v && v !== old) { pg.titre = v; d.updatedAt = Date.now(); save(); }
      if (doc() === d && pagesActive()) renderPgHead(d);
      renderPageTabs();
      if (ctx.isNew && how === 'key') { closePanel(false); if (doc() === d && d.page === ctx.id && d.blocks[0]) focusBlock(d.blocks[0].id, 'start'); }
      else if (how === 'key') { const card = panel && panel.querySelector(`[data-card="${CSS.escape(ctx.id)}"]`); if (card) card.focus(); }
    };
    inp.addEventListener('input', () => { if (doc() !== d || d.page !== ctx.id) return; const t = document.querySelector('#pg-head .ph-tab'); if (t) t.textContent = inp.value.trim() || old; });
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true, 'key'); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false, 'key'); }
    });
    inp.addEventListener('blur', () => finish(true, 'blur'));
    inp.addEventListener('pointerdown', e => e.stopPropagation());
  }
  /* renamePageInline (app.js) passe ici quand la pastille n'est pas à l'écran (plus de 3 onglets) */
  function rename(id, isNew) {
    if (ro() || bar.hidden) return false;
    const c = cur(); if (!c || c.pages.length <= MAX_PILLS || !c.pages.some(p => p.id === id)) return false;
    return openPanel({ rename: id, isNew: !!isNew });
  }

  /* ---------------- menu « … » (C4) ---------------- */
  function openMenu(id, anchor, opener) {
    closeMenu(false);
    const c = cur(); if (!c || ro()) return;
    const pg = c.pages.find(p => p.id === id); if (!pg) return;
    menu = document.createElement('div');
    menu.className = 'pgt-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `Actions de « ${nameOf(pg)} »`);
    menu.innerHTML = `<button type="button" role="menuitem" data-act="rename">${ICO.pen}Renommer</button>
      <button type="button" role="menuitem" data-act="dup" ${c.pages.length >= 20 ? 'disabled' : ''}>${ICO.dup}Dupliquer</button>
      <div class="pgt-sep" aria-hidden="true"></div>
      <button type="button" role="menuitem" class="danger" data-act="delete" ${c.pages.length <= 1 ? 'disabled' : ''}>${ICO.trash}Supprimer</button>`;
    menu._opener = opener || null; menu._id = id;
    document.body.appendChild(menu);
    /* sous l'ancre, aligné à droite du bouton « … » ou au point cliqué ; jamais hors de l'écran */
    const w = menu.offsetWidth, h = menu.offsetHeight;
    let x, y;
    if (anchor && anchor.getBoundingClientRect) { const r = anchor.getBoundingClientRect(); x = anchor.matches && anchor.matches('.pgt-more') ? r.right - w : r.left; y = r.bottom + 4; }
    else { x = anchor.x; y = anchor.y; }
    x = Math.max(8, Math.min(x, innerWidth - w - 8)); if (y + h > innerHeight - 8) y = Math.max(8, y - h - 8);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    if (opener && opener.hasAttribute('aria-haspopup')) opener.setAttribute('aria-expanded', 'true');
    const cell = opener && opener.closest ? opener.closest('.pgt-cell') : null; if (cell) cell.classList.add('menu-open');
    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      const act = b.dataset.act; closeMenu(false);
      if (act === 'rename') { if (panel) startRename(id); else renamePageInline(id); }
      else if (act === 'dup') duplicatePage(id);
      else if (act === 'delete') deletePage(id);
    });
    menu.addEventListener('keydown', e => {
      const items = [...menu.querySelectorAll('[role="menuitem"]:not([disabled])')]; const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); } else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    });
    const first = menu.querySelector('[role="menuitem"]:not([disabled])'); if (first) first.focus();
  }
  function closeMenu(restoreFocus) {
    if (!menu) return;
    const m = menu; menu = null;
    const op = m._opener; m.remove();
    if (op && op.isConnected) { if (op.hasAttribute('aria-haspopup')) op.setAttribute('aria-expanded', 'false'); const cell = op.closest('.pgt-cell'); if (cell) cell.classList.remove('menu-open'); if (restoreFocus) op.focus(); }
  }
  window.addEventListener('resize', () => closeMenu(false));
  document.addEventListener('scroll', () => closeMenu(false), true);

  /* ---------------- glisser-déposer (C6) ---------------- */
  function onDown(e) {
    swallowClick = false;
    const card = e.target.closest('[data-card]'); if (!card || ro() || e.button !== 0 || renaming || menu) return;
    const c = cur(); if (!c || c.pages.length < 2) return;
    const r = card.getBoundingClientRect();
    drag = { id: card.dataset.card, cell: card.parentElement, card, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, active: false, to: -1, touch: e.pointerType === 'touch', timer: 0 };
    if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.active) startDrag(e.clientX, e.clientY); }, 320);   // au doigt : appui long
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }
  function startDrag(x, y) {
    const c = cur(); if (!c) { endDrag(false); return; }
    drag.active = true; drag.from = c.pages.findIndex(p => p.id === drag.id);
    drag.cell.classList.add('drag-src'); document.body.classList.add('pgt-dragging');
    const g = document.createElement('div'); g.className = 'pgt-drag'; g.setAttribute('aria-hidden', 'true');
    const clone = drag.card.cloneNode(true); clone.classList.remove('active'); clone.removeAttribute('data-card'); clone.tabIndex = -1; g.appendChild(clone);
    document.body.appendChild(g); drag.ghost = g;
    const ins = document.createElement('div'); ins.className = 'pgt-ins'; ins.setAttribute('aria-hidden', 'true'); ins.hidden = true;
    panel.querySelector('.pgt-grid').appendChild(ins); drag.ins = ins;
    moveDrag(x, y);
  }
  function onMove(e) {
    if (!drag) return;
    if (!drag.active) {
      const far = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > (drag.touch ? 10 : 6);
      if (!far) return;
      if (drag.touch) { endDrag(false); return; }   // le doigt bouge avant l'appui long : c'est un défilement
      startDrag(e.clientX, e.clientY); return;
    }
    e.preventDefault();
    moveDrag(e.clientX, e.clientY);
  }
  function moveDrag(x, y) {
    if (!drag || !drag.active || !panel) return;
    drag.ghost.style.left = (x - drag.dx) + 'px'; drag.ghost.style.top = (y - drag.dy) + 'px';
    const grid = panel.querySelector('.pgt-grid'); const gr = grid.getBoundingClientRect();
    const cells = [...grid.querySelectorAll('.pgt-cell:not(.drag-src)')].map(el => ({ el, r: el.getBoundingClientRect() }));
    if (!cells.length) return;
    /* la rangée sous le pointeur (ou la plus proche), puis la première carte dont le centre est à droite du pointeur */
    const rows = []; for (const c of cells) { let row = rows.find(r => Math.abs(r.top - c.r.top) < 2); if (!row) { row = { top: c.r.top, bottom: c.r.bottom, cells: [] }; rows.push(row); } row.cells.push(c); }
    let row = rows.find(r => y >= r.top - 6 && y <= r.bottom + 6);
    if (!row) row = rows.reduce((a, r) => (Math.abs((r.top + r.bottom) / 2 - y) < Math.abs((a.top + a.bottom) / 2 - y) ? r : a));
    const k = row.cells.findIndex(c => x < c.r.left + c.r.width / 2);
    const before = k >= 0 ? row.cells[k] : null, after = k >= 0 ? row.cells[k - 1] || null : row.cells[row.cells.length - 1];
    const prevIdx = before ? cells.indexOf(before) : cells.indexOf(after) + 1;   // place parmi les cartes restantes
    let bx;
    if (before && after) bx = (after.r.right + before.r.left) / 2;
    else if (before) bx = before.r.left - 8;
    else bx = after.r.right + 8;
    const ins = drag.ins; ins.hidden = false;
    ins.style.left = (bx - gr.left - 2) + 'px'; ins.style.top = ((before || after).r.top - gr.top) + 'px'; ins.style.height = (before || after).r.height + 'px';
    drag.to = prevIdx;
    const c = cur(); const pg = c && c.pages.find(p => p.id === drag.id);
    setFoot(prevIdx === drag.from ? `Relâchez pour laisser « ${nameOf(pg)} » à sa place` : `Relâchez pour placer « ${nameOf(pg)} » en ${ORD[prevIdx] || (prevIdx + 1) + 'e'} position`);
  }
  function onUp() {
    if (!drag) return;
    if (!drag.active) { endDrag(false); return; }
    const { id, to, from } = drag;
    endDrag(true);
    if (to >= 0 && to !== from) movePageTo(id, to); else { setFoot(footHelp()); }
  }
  function onCancel() { endDrag(false); }
  function endDrag(dropped) {
    if (!drag) return;
    if (drag.timer) clearTimeout(drag.timer);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel);
    if (drag.active) {
      swallowClick = true;
      document.body.classList.remove('pgt-dragging');
      if (drag.ghost) drag.ghost.remove(); if (drag.ins) drag.ins.remove();
      if (drag.cell && drag.cell.isConnected) drag.cell.classList.remove('drag-src');
      if (!dropped) setFoot(footHelp());
    }
    drag = null;
  }

  /* ---------------- déplacer un onglet à une position (glisser, Alt + flèches) ---------------- */
  function movePageTo(id, to) {
    const c = cur(); if (!c || ro()) return;
    const { d, pages } = c; const i = pages.findIndex(p => p.id === id);
    if (i < 0 || to < 0 || to >= pages.length || to === i) return;
    pages.splice(to, 0, pages.splice(i, 1)[0]);
    d.updatedAt = Date.now(); save(); renderPageTabs();
    setFoot(footHelp());
  }

  window.AlixoPageTabs = { render, open: () => openPanel(), close: () => closePanel(false), isOpen, rename, move: movePageTo };
})();
