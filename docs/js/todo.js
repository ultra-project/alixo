/* ============================================================
   Alixo — tâches à faire (Bibliothèque › Tâches)
   state.todos    = [{ id, text, cat, done, doneAt, due, prio, createdAt, updatedAt }]
   state.todoCats = [{ id, name, color, createdAt, updatedAt }]
   Synchronisées avec le compte (méta, voir js/sync.js). Chargé APRÈS app.js.
   1.41 : nouvelle interface — grande saisie rapide (Entrée pour ajouter, « ! » / « !! » / « #catégorie »),
   sections En retard / Aujourd’hui / À venir / Sans échéance / Terminées (repliables), vues Aujourd’hui,
   Importantes, Planifiées, cases rondes animées, édition du texte au clic. Le format des données ne change pas.
   ============================================================ */
'use strict';

window.AlixoTodo = (() => {
  const CAT_COLORS = ['#33658a', '#2f7d68', '#c04343', '#b3762a', '#3d6bb5', '#a8556f', '#7a6852', '#2e8b8b', '#d06a3a', '#5b6b8c'];
  const todos = () => (Array.isArray(state.todos) ? state.todos : (state.todos = []));
  const cats = () => (Array.isArray(state.todoCats) ? state.todoCats : (state.todoCats = []));
  const catOf = id => cats().find(c => c.id === id) || null;
  const SMART = { all: 'Toutes les tâches', today: 'Aujourd’hui', important: 'Importantes', planned: 'Planifiées' };
  let selCat = 'all';         // all | today | important | planned | none | id de catégorie
  const today = () => todayKey();
  const stamp = o => { o.updatedAt = Date.now(); return o; };
  const isLate = t => !t.done && t.due && t.due < today();
  const addDays = n => { const d = parseYmd(today()); d.setDate(d.getDate() + n); return dayKey(d.getTime()); };
  const nextMonday = () => { const d = parseYmd(today()); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return dayKey(d.getTime()); };
  const dueLabel = k => {
    if (!k) return '';
    const t = today(); if (k === t) return 'aujourd’hui';
    const d = parseYmd(k), n = parseYmd(t); const diff = Math.round((d - n) / 86400000);
    if (diff === 1) return 'demain'; if (diff === -1) return 'hier';
    if (diff > 1 && diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + (d.getFullYear() !== n.getFullYear() ? ' ' + d.getFullYear() : '');
  };
  const openCount = () => todos().filter(t => !t.done).length;
  const lateCount = () => todos().filter(isLate).length;
  const PRIO_NAMES = ['Normale', 'Importante', 'Urgente'];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /* sections repliées (préférence de l'appareil seulement) */
  const FOLD_KEY = 'alixo.todo.fold';
  let fold = { done: true };
  try { const f = JSON.parse(localStorage.getItem(FOLD_KEY) || 'null'); if (f && typeof f === 'object') fold = f; } catch { /* stockage indisponible */ }
  const saveFold = () => { try { localStorage.setItem(FOLD_KEY, JSON.stringify(fold)); } catch { /* stockage indisponible */ } };

  /* saisie rapide : réglages en attente (échéance, priorité, catégorie) — gardés d'un rendu à l'autre */
  const quick = { text: '', due: '', prio: 0, cat: null };
  let editing = null, pendingRender = false, justAdded = null;

  const ICON = {
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
    tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.3"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/></svg>',
  };

  function persist() { save(); refresh(); }
  function refresh() {
    const locked = typeof isPlus === 'function' && !isPlus();   // tâches réservées à Alixo+ (1.16)
    const b = $('#todo-badge');
    if (b && locked) { b.hidden = true; b.textContent = ''; b.title = ''; }
    else if (b) { const n = openCount(), l = lateCount(); b.hidden = !n; b.textContent = n ? String(n) : ''; b.classList.toggle('late', l > 0); b.title = n ? `${n} tâche${n > 1 ? 's' : ''} à faire${l ? ` · ${l} en retard` : ''}` : ''; }
    if (!currentDocId && libMode === 'todo') { if (editing) pendingRender = true; else render(); }
  }

  /* ---------------- actions ---------------- */
  function addTask(text, cat, due, prio) {
    text = (text || '').trim(); if (!text) return null;
    const t = { id: uid(), text: text.slice(0, 300), cat: cat && catOf(cat) ? cat : null, done: false, doneAt: 0, due: due || '', prio: +prio || 0, createdAt: Date.now(), updatedAt: Date.now() };
    todos().push(t); persist(); return t;
  }
  function toggle(id) { const t = todos().find(x => x.id === id); if (!t) return; t.done = !t.done; t.doneAt = t.done ? Date.now() : 0; stamp(t); persist(); }
  function remove(id) {
    const i = todos().findIndex(x => x.id === id); if (i < 0) return;
    const [t] = todos().splice(i, 1); persist();
    toast(`« ${t.text.slice(0, 40)} » supprimée`, { action: 'Annuler', onAction: () => { todos().splice(Math.min(i, todos().length), 0, t); persist(); } });
  }
  function addCat(name, color) {
    name = (name || '').trim(); if (!name) return null;
    const c = { id: uid(), name: name.slice(0, 40), color: color || CAT_COLORS[cats().length % CAT_COLORS.length], createdAt: Date.now(), updatedAt: Date.now() };
    cats().push(c); persist(); return c;
  }
  function removeCat(id) {
    const c = catOf(id); if (!c) return;
    const n = todos().filter(t => t.cat === id).length;
    const go = () => { state.todoCats = cats().filter(x => x.id !== id); todos().forEach(t => { if (t.cat === id) { t.cat = null; stamp(t); } }); if (selCat === id) selCat = 'all'; if (quick.cat === id) quick.cat = null; persist(); toast(`Catégorie « ${c.name} » supprimée`); };
    if (n) confirmDialog({ title: `Supprimer la catégorie « ${c.name} » ?`, text: `${n} tâche${n > 1 ? 's' : ''} seront gardées sans catégorie.`, ok: 'Supprimer' }).then(y => { if (y) go(); }); else go();
  }
  function clearDone() {
    const done = todos().filter(t => t.done && inView(t)); if (!done.length) return;
    state.todos = todos().filter(t => !done.includes(t)); persist();
    toast(`${done.length} tâche${done.length > 1 ? 's' : ''} terminée${done.length > 1 ? 's' : ''} effacée${done.length > 1 ? 's' : ''}`, { action: 'Annuler', onAction: () => { todos().push(...done); persist(); } });
  }

  /* saisie rapide : « !! » urgente, « ! » importante, « #Éco » catégorie (début du nom, sans accents) */
  function parseQuick(raw) {
    let text = ' ' + raw + ' ', prio = null, cat = null;
    text = text.replace(/\s!!(?=\s)/g, () => { prio = 2; return ' '; });
    text = text.replace(/\s!(?=\s)/g, () => { if (prio == null) prio = 1; return ' '; });
    text = text.replace(/\s#([^\s#]+)(?=\s)/g, (m, w) => {
      if (cat) return m;
      const k = norm(w); const c = cats().find(x => norm(x.name).replace(/\s+/g, '') === k) || cats().find(x => norm(x.name).replace(/\s+/g, '').startsWith(k));
      if (!c) return m; cat = c.id; return ' ';
    });
    return { text: text.replace(/\s+/g, ' ').trim(), prio, cat };
  }
  /* valeurs par défaut de la saisie selon la vue (Aujourd’hui → échéance aujourd’hui, catégorie → cette catégorie…) */
  const viewDefaults = () => ({
    due: selCat === 'today' ? today() : '',
    prio: selCat === 'important' ? 1 : 0,
    cat: selCat !== 'all' && selCat !== 'none' && !SMART[selCat] ? selCat : null,
  });

  /* ---------------- pop-overs ---------------- */
  function openCatPopover(existing, anchor) {
    let color = existing ? existing.color : CAT_COLORS[cats().length % CAT_COLORS.length];
    showPopover(`<h4>${existing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h4>
      <div class="po-row"><input id="po-catname" value="${esc(existing ? existing.name : '')}" placeholder="Ex. Révisions, Administratif, TD…" maxlength="40" autocomplete="off"></div>
      <div class="po-label">Couleur</div>
      <div class="po-colors" id="po-catcolors">${CAT_COLORS.map(c => `<button data-c="${c}" class="${c === color ? 'sel' : ''}" style="background:${c}" type="button"></button>`).join('')}</div>
      <div class="po-row" style="justify-content:flex-end; gap:6px; margin-top:12px">${existing ? '<button class="cta ghost small" id="po-catdel" type="button">Supprimer</button>' : ''}<button class="pobtn" id="po-catok" type="button">${existing ? 'Enregistrer' : 'Créer'}</button></div>`,
      anchor || centerRect(), pop => {
        const inp = pop.querySelector('#po-catname');
        pop.querySelector('#po-catcolors').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; pop.querySelectorAll('#po-catcolors button').forEach(x => x.classList.toggle('sel', x === b)); });
        const ok = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } if (existing) { existing.name = v.slice(0, 40); existing.color = color; stamp(existing); persist(); } else { const c = addCat(v, color); selCat = c.id; render(); } hidePopover(); };
        pop.querySelector('#po-catok').addEventListener('click', ok);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        const del = pop.querySelector('#po-catdel'); if (del) del.addEventListener('click', () => { hidePopover(); removeCat(existing.id); });
        setTimeout(() => { inp.focus(); inp.select(); }, 40);
      });
  }
  const dueChoices = () => [['today', 'Aujourd’hui', today()], ['tomorrow', 'Demain', addDays(1)], ['monday', 'Lundi prochain', nextMonday()]];
  function openTaskPopover(t, anchor) {
    let due = t.due || '', prio = t.prio || 0;
    showPopover(`<h4>Modifier la tâche</h4>
      <div class="po-row"><input id="po-ttext" value="${esc(t.text)}" maxlength="300" autocomplete="off"></div>
      <div class="po-label">Échéance</div>
      <div class="td-po-chips" id="po-tdues">${dueChoices().map(([k, l, v]) => `<button type="button" data-due="${v}" class="${due === v ? 'on' : ''}">${l}</button>`).join('')}<button type="button" data-due="" class="${!due ? 'on' : ''}">Aucune</button></div>
      <div class="po-row" style="margin-top:6px"><input id="po-tdue" type="date" value="${esc(due)}" title="Autre date"></div>
      <div class="po-label">Priorité</div>
      <div class="td-po-chips td-po-prio" id="po-tprios">${PRIO_NAMES.map((l, i) => `<button type="button" data-prio="${i}" class="p${i} ${prio === i ? 'on' : ''}">${i ? ICON.flag : ''}${l}</button>`).join('')}</div>
      <div class="po-label">Catégorie</div>
      <div class="po-row"><select id="po-tcat" class="td-po-select"><option value="">Sans catégorie</option>${cats().map(c => `<option value="${c.id}" ${t.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      ${t.createdAt > 1e12 ? `<div class="po-hint">Créée le ${new Date(t.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}${t.done && t.doneAt ? ` · terminée le ${new Date(t.doneAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}</div>` : ''}
      <div class="po-row" style="justify-content:flex-end; gap:6px; margin-top:12px"><button class="cta ghost small" id="po-tdel" type="button">Supprimer</button><button class="pobtn" id="po-tok" type="button">Enregistrer</button></div>`,
      anchor || centerRect(), pop => {
        const inp = pop.querySelector('#po-ttext'), dIn = pop.querySelector('#po-tdue');
        const syncDue = () => { dIn.value = due; pop.querySelectorAll('#po-tdues button').forEach(b => b.classList.toggle('on', b.dataset.due === due)); };
        pop.querySelector('#po-tdues').addEventListener('click', e => { const b = e.target.closest('[data-due]'); if (!b) return; due = b.dataset.due; syncDue(); });
        dIn.addEventListener('change', () => { due = dIn.value || ''; syncDue(); });
        pop.querySelector('#po-tprios').addEventListener('click', e => { const b = e.target.closest('[data-prio]'); if (!b) return; prio = +b.dataset.prio; pop.querySelectorAll('#po-tprios button').forEach(x => x.classList.toggle('on', x === b)); });
        const ok = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } t.text = v.slice(0, 300); t.due = due; t.prio = prio; t.cat = pop.querySelector('#po-tcat').value || null; stamp(t); persist(); hidePopover(); };
        pop.querySelector('#po-tok').addEventListener('click', ok);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        pop.querySelector('#po-tdel').addEventListener('click', () => { hidePopover(); remove(t.id); });
        setTimeout(() => { inp.focus(); }, 40);
      });
  }
  /* pastilles de la saisie rapide */
  function openQuickDue(anchor) {
    showPopover(`<h4>Échéance</h4><div class="po-list">${dueChoices().map(([k, l, v]) => `<button type="button" data-due="${v}">${l}<span class="td-po-aside">${esc(dueLabel(v) === l.toLowerCase() ? parseYmd(v).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : dueLabel(v))}</span></button>`).join('')}${quick.due ? '<button type="button" data-due="">Retirer l’échéance</button>' : ''}</div>
      <div class="po-label">Autre date</div><div class="po-row"><input id="po-qdue" type="date" value="${esc(quick.due)}"></div>`, anchor, pop => {
      const set = v => { quick.due = v; hidePopover(); render(); focusQuick(); };
      pop.querySelector('.po-list').addEventListener('click', e => { const b = e.target.closest('[data-due]'); if (b) set(b.dataset.due); });
      pop.querySelector('#po-qdue').addEventListener('change', e => { if (e.target.value) set(e.target.value); });
    });
  }
  function openQuickCat(anchor) {
    showPopover(`<h4>Catégorie</h4><div class="po-list td-po-cats"><button type="button" data-qcat="" class="${!quick.cat ? 'cur' : ''}"><i style="border:1.5px dashed var(--ink-3)"></i>Sans catégorie</button>${cats().map(c => `<button type="button" data-qcat="${c.id}" class="${quick.cat === c.id ? 'cur' : ''}"><i style="background:${c.color}"></i>${esc(c.name)}</button>`).join('')}</div>
      <div class="po-row" style="justify-content:flex-end; margin-top:8px"><button class="cta ghost small" id="po-qnewcat" type="button">＋ Nouvelle catégorie</button></div>`, anchor, pop => {
      pop.querySelector('.po-list').addEventListener('click', e => { const b = e.target.closest('[data-qcat]'); if (!b) return; quick.cat = b.dataset.qcat || null; hidePopover(); render(); focusQuick(); });
      pop.querySelector('#po-qnewcat').addEventListener('click', () => openCatPopover(null, anchor));
    });
  }
  function focusQuick() { const i = $('#lib-todo .td-quick-input'); if (i) { i.focus(); const n = i.value.length; try { i.setSelectionRange(n, n); } catch { /* champ non textuel */ } } }

  /* ---------------- rendu ---------------- */
  function inView(t) {
    if (selCat === 'all') return true;
    if (selCat === 'today') return t.done ? (t.doneAt && dayKey(t.doneAt) === today()) : (!!t.due && t.due <= today());
    if (selCat === 'important') return (t.prio || 0) > 0;
    if (selCat === 'planned') return !!t.due;
    if (selCat === 'none') return !t.cat;
    return t.cat === selCat;
  }
  const pill = (cls, icon, label, title, extra = '') => `<span class="td-pill ${cls}" ${title ? `title="${esc(title)}"` : ''} ${extra}>${icon}${label}</span>`;
  const taskHTML = t => {
    const c = catOf(t.cat), late = isLate(t), isToday = !t.done && t.due === today();
    const showCat = c && (selCat === 'all' || SMART[selCat]);
    const fullDate = t.due ? parseYmd(t.due).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const meta = [
      t.due ? pill(`td-due ${late ? 'late' : ''} ${isToday ? 'today' : ''}`, ICON.cal, esc(dueLabel(t.due)), (late ? 'En retard — échéance : ' : 'Échéance : ') + fullDate, `data-more="${t.id}"`) : '',
      t.prio ? pill(`td-prio p${t.prio}`, ICON.flag, t.prio === 2 ? 'Urgente' : 'Importante', 'Priorité', `data-more="${t.id}"`) : '',
      showCat ? pill('td-cat', '<i></i>', esc(c.name), 'Catégorie', `style="--cc:${c.color}" data-more="${t.id}"`) : '',
      t.done && t.doneAt ? pill('td-done', '', `faite ${dayKey(t.doneAt) === today() ? 'aujourd’hui' : 'le ' + new Date(t.doneAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`, '') : '',
    ].join('');
    return `<div class="td-item ${t.done ? 'done' : ''} ${late ? 'late' : ''} prio${t.prio || 0} ${justAdded === t.id ? 'td-new' : ''}" data-tid="${t.id}" draggable="true">
      <button type="button" class="td-check" data-toggle="${t.id}" title="${t.done ? 'Marquer à faire' : 'Marquer comme faite'}" aria-label="${t.done ? 'Marquer à faire' : 'Marquer comme faite'}" aria-pressed="${t.done ? 'true' : 'false'}"><span class="td-ring"></span>${ICON.check}</button>
      <div class="td-main"><div class="td-text" data-edit="${t.id}" tabindex="0" role="button" title="Cliquer pour modifier">${esc(t.text)}</div>${meta ? `<div class="td-meta">${meta}</div>` : ''}</div>
      <div class="td-acts"><button type="button" class="td-act" data-more="${t.id}" title="Échéance, priorité, catégorie…" aria-label="Détails">${ICON.more}</button><button type="button" class="td-act td-x" data-del="${t.id}" title="Supprimer" aria-label="Supprimer">${ICON.x}</button></div></div>`;
  };
  const order = (a, b) => ((b.prio || 0) - (a.prio || 0)) || ((a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : 0) || (b.createdAt - a.createdAt);
  function sections(list) {
    const t = today(), open = list.filter(x => !x.done);
    const S = [
      { k: 'late', title: 'En retard', items: open.filter(x => x.due && x.due < t) },
      { k: 'today', title: 'Aujourd’hui', items: open.filter(x => x.due === t) },
      { k: 'soon', title: 'À venir', items: open.filter(x => x.due && x.due > t) },
      { k: 'nodate', title: 'Sans échéance', items: open.filter(x => !x.due) },
    ];
    S.forEach(s => s.items.sort(order));
    const done = list.filter(x => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    S.push({ k: 'done', title: 'Terminées', items: done });
    return S.filter(s => s.items.length);
  }
  function emptyHTML(nOpenView, nDoneView) {
    const all = todos().length;
    let title, text;
    if (!all) { title = 'Votre liste est vide'; text = 'Notez ce que vous avez à faire : une fiche à rendre, un chapitre à relire, un dossier à envoyer… Tapez-le ci-dessus et appuyez sur Entrée.'; }
    else if (nDoneView && !nOpenView) { title = 'Tout est fait !'; text = 'Bravo, plus rien à faire ici. Profitez-en pour réviser.'; }
    else if (selCat === 'today') { title = 'Rien pour aujourd’hui'; text = 'Aucune tâche n’arrive à échéance aujourd’hui. Ajoutez-en une ci-dessus : elle sera prévue pour aujourd’hui.'; }
    else if (selCat === 'important') { title = 'Aucune tâche importante'; text = 'Ajoutez « ! » (importante) ou « !! » (urgente) en tapant une tâche, ou choisissez la priorité avec le drapeau.'; }
    else if (selCat === 'planned') { title = 'Aucune tâche planifiée'; text = 'Les tâches avec une échéance apparaissent ici, de la plus proche à la plus lointaine.'; }
    else { title = 'Aucune tâche ici'; text = 'Ajoutez une tâche ci-dessus : elle sera rangée dans cette catégorie.'; }
    return `<div class="td-emptystate"><div class="td-empty-art" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="a1" cx="60" cy="60" r="44"/><circle class="a2" cx="60" cy="60" r="30"/><path class="a3" d="m46 61 10 10 19-21"/></svg></div><div class="td-empty-title">${title}</div><div class="td-empty-text">${text}</div></div>`;
  }
  function navBtn(k, icon, label, n, extra = '', cls = '', after = '') {
    return `<button type="button" class="td-nav-btn ${selCat === k ? 'on' : ''} ${cls}" data-cat="${k}" ${extra}>${icon}<span class="td-nav-l">${label}</span><em>${n || ''}</em>${after}</button>`;
  }
  function render() {
    const root = $('#lib-todo'); if (!root) return;
    if (selCat !== 'all' && !SMART[selCat] && selCat !== 'none' && !catOf(selCat)) selCat = 'all';
    // garder le texte en cours de saisie (rendu déclenché par la synchronisation, une coche…)
    const prevInp = root.querySelector('.td-quick-input');
    const hadFocus = prevInp && document.activeElement === prevInp;
    if (prevInp) quick.text = prevInp.value;
    const all = todos(), t0 = today();
    const visible = all.filter(inView);
    const nOpen = openCount(), nLate = lateCount();
    const nOpenView = visible.filter(t => !t.done).length, nDoneView = visible.filter(t => t.done).length;
    const todayOpen = visible.filter(t => !t.done && t.due === t0).length;            // anneau : avancement du jour dans la vue
    const todayDone = visible.filter(t => t.done && t.doneAt && dayKey(t.doneAt) === t0).length;
    const c = catOf(selCat);
    const title = c ? c.name : selCat === 'none' ? 'Sans catégorie' : SMART[selCat];
    const dateStr = cap(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
    const sub = nOpenView ? `${nOpenView} à faire${nLate && (selCat === 'all' || selCat === 'today') ? ` · <b class="late">${nLate} en retard</b>` : ''}` : (nDoneView ? 'tout est fait' : 'rien à faire');
    const ringTotal = todayOpen + todayDone + (selCat === 'today' ? visible.filter(isLate).length : 0);
    const pct = ringTotal ? Math.round(100 * todayDone / ringTotal) : 0;
    const qd = quick.due, qc = catOf(quick.cat), qp = quick.prio;
    const secs = sections(visible);
    root.innerHTML = `<div class="td-wrap">
      <aside class="td-nav" aria-label="Vues et catégories">
        ${navBtn('all', ICON.list, 'Toutes', nOpen)}
        ${navBtn('today', ICON.sun, 'Aujourd’hui', all.filter(t => !t.done && t.due && t.due <= t0).length, '', nLate ? 'has-late' : '')}
        ${navBtn('important', ICON.star, 'Importantes', all.filter(t => !t.done && t.prio).length)}
        ${navBtn('planned', ICON.cal, 'Planifiées', all.filter(t => !t.done && t.due).length)}
        <div class="td-nav-h"><span>Catégories</span><button type="button" class="td-nav-add" data-newcat title="Nouvelle catégorie" aria-label="Nouvelle catégorie">${ICON.plus}</button></div>
        ${cats().map(x => navBtn(x.id, `<i class="td-dot" style="background:${x.color}"></i>`, esc(x.name), all.filter(t => t.cat === x.id && !t.done).length, `data-catedit="${x.id}" data-drop="${x.id}" title="Clic droit ou ✎ : modifier"`, 'td-catbtn', `<span class="td-catpen" data-cedit="${x.id}" title="Modifier">${ICON.pen}</span>`)).join('')}
        ${navBtn('none', '<i class="td-dot none"></i>', 'Sans catégorie', all.filter(t => !t.cat && !t.done).length, 'data-drop="none"', 'td-catbtn')}
        ${!cats().length ? '<div class="td-nav-hint">Les catégories regroupent vos tâches (révisions, administratif, TD, mémoire…). Glissez une tâche sur une catégorie pour l’y ranger.</div>' : ''}
      </aside>
      <div class="td-pane">
        <header class="td-top" ${c ? `style="--cc:${c.color}"` : ''}>
          <div class="td-top-l">
            <h2 class="td-title">${c ? '<i class="td-title-dot"></i>' : ''}${esc(title)}</h2>
            <div class="td-sub"><span class="td-date">${esc(dateStr)}</span> · ${sub}</div>
          </div>
          ${ringTotal ? `<div class="td-ring-prog" style="--p:${pct}" title="${todayDone} sur ${ringTotal} faite${ringTotal > 1 ? 's' : ''} aujourd’hui"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5"/>${pct ? '<circle class="v" cx="18" cy="18" r="15.5" pathLength="100"/>' : ''}</svg><span>${todayDone}/${ringTotal}</span></div>` : ''}
          ${c ? `<button type="button" class="cta ghost small td-editcat" data-cedit="${c.id}">${ICON.pen}Modifier</button>` : ''}
        </header>
        <form class="td-quick" data-addform autocomplete="off">
          <div class="td-quick-row">
            <span class="td-quick-plus" aria-hidden="true">${ICON.plus}</span>
            <input class="td-quick-input" placeholder="Ajouter une tâche…" maxlength="320" aria-label="Nouvelle tâche (Entrée pour ajouter)" value="${esc(quick.text)}">
            <kbd class="td-quick-kbd" title="Entrée pour ajouter">Entrée ↵</kbd>
          </div>
          <div class="td-quick-opts">
            <button type="button" class="td-chip ${qd ? 'set' : ''} ${qd && qd < t0 ? 'late' : ''}" data-qdue>${ICON.cal}<span>${qd ? esc(cap(dueLabel(qd))) : 'Échéance'}</span>${qd ? `<i class="td-chip-x" data-qclear="due" title="Retirer">${ICON.x}</i>` : ''}</button>
            <button type="button" class="td-chip p${qp} ${qp ? 'set' : ''}" data-qprio title="Cliquer pour changer la priorité">${ICON.flag}<span>${qp ? PRIO_NAMES[qp] : 'Priorité'}</span></button>
            <button type="button" class="td-chip ${qc ? 'set' : ''}" data-qcat ${qc ? `style="--cc:${qc.color}"` : ''}>${qc ? '<i class="td-dot"></i>' : ICON.tag}<span>${qc ? esc(qc.name) : 'Catégorie'}</span></button>
            <span class="td-quick-hint">« ! » importante · « !! » urgente${cats().length ? ' · « #catégorie »' : ''}</span>
          </div>
        </form>
        <div class="td-lists">
          ${nOpenView ? '' : emptyHTML(nOpenView, nDoneView)}
          ${secs.map(s => {
            const folded = !!fold[s.k];
            return `<section class="td-sec td-sec-${s.k} ${folded ? 'folded' : ''}">
              <div class="td-sec-head"><button type="button" class="td-sec-fold" data-fold="${s.k}" aria-expanded="${folded ? 'false' : 'true'}">${ICON.chev}<span class="td-sec-t">${s.title}</span><em>${s.items.length}</em></button>${s.k === 'done' ? `<button type="button" class="td-sec-act" data-cleardone>Effacer</button>` : ''}</div>
              ${folded ? '' : `<div class="td-sec-body">${s.items.map(taskHTML).join('')}</div>`}</section>`;
          }).join('')}
        </div>
      </div>
    </div>`;
    justAdded = null;
    const inp = root.querySelector('.td-quick-input');
    const touch = matchMedia('(hover: none)').matches;   // pas de clavier virtuel ouvert d'office sur téléphone
    if (inp && (hadFocus || (!root.dataset.bound && !touch))) setTimeout(() => { inp.focus(); const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch { /* champ non textuel */ } }, 30);
    if (!root.dataset.bound) { root.dataset.bound = '1'; bind(root); }
  }

  /* édition du texte en place (clic sur le texte) */
  function startEdit(id) {
    const root = $('#lib-todo'); const el = root && root.querySelector(`.td-item[data-tid="${CSS.escape(id)}"] .td-text`);
    const t = todos().find(x => x.id === id); if (!el || !t) return;
    editing = id;
    const item = el.closest('.td-item'); item.classList.add('editing'); item.draggable = false;
    el.outerHTML = `<input class="td-edit" value="${esc(t.text)}" maxlength="300" aria-label="Texte de la tâche">`;
    const inp = item.querySelector('.td-edit');
    inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    let finished = false;
    const end = keep => {
      if (finished) return; finished = true; editing = null;
      const v = inp.value.trim();
      if (keep && v && v !== t.text) { t.text = v.slice(0, 300); stamp(t); persist(); }
      else if (keep && !v) { remove(t.id); }
      else render();
      pendingRender = false;
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); end(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } });
    inp.addEventListener('blur', () => end(true));
  }
  function checkAnim(id, btn) {
    const t = todos().find(x => x.id === id); if (!t) return;
    const item = btn.closest('.td-item');
    if (t.done || !item || matchMedia('(prefers-reduced-motion: reduce)').matches) { toggle(id); return; }
    if (item.classList.contains('checking')) return;
    item.classList.add('checking');
    setTimeout(() => { item.classList.add('leaving'); }, 260);
    setTimeout(() => toggle(id), 520);
  }
  function bind(root) {
    root.addEventListener('submit', e => {
      const f = e.target.closest('[data-addform]'); if (!f) return;
      e.preventDefault();
      const inp = f.querySelector('.td-quick-input');
      const p = parseQuick(inp.value);
      if (!p.text) { inp.focus(); return; }
      quick.text = ''; inp.value = '';
      const t = addTask(p.text, p.cat || quick.cat, quick.due, p.prio != null ? p.prio : quick.prio);
      Object.assign(quick, viewDefaults());   // les pastilles reviennent aux réglages de la vue
      if (t) {
        // la tâche doit rester visible dans la vue courante
        if (!inView(t)) selCat = 'all';
        if (!t.due) fold.nodate = false; else if (t.due === today()) fold.today = false; else if (t.due > today()) fold.soon = false; else fold.late = false;
        justAdded = t.id; render(); focusQuick();
      }
    });
    root.addEventListener('keydown', e => {
      if (e.target.closest('.td-quick-input') && e.key === 'Escape' && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; quick.text = ''; return; }
      const ed = e.target.closest('.td-text[data-edit]'); if (ed && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); startEdit(ed.dataset.edit); }
    });
    root.addEventListener('click', e => {
      const tg = e.target.closest('[data-toggle]'); if (tg) { checkAnim(tg.dataset.toggle, tg); return; }
      const del = e.target.closest('[data-del]'); if (del) { remove(del.dataset.del); return; }
      const ce = e.target.closest('[data-cedit]'); if (ce) { e.stopPropagation(); openCatPopover(catOf(ce.dataset.cedit), ce.getBoundingClientRect()); return; }
      const ed = e.target.closest('[data-edit]'); if (ed) { startEdit(ed.dataset.edit); return; }
      const mo = e.target.closest('[data-more]'); if (mo) { const t = todos().find(x => x.id === mo.dataset.more); if (t) openTaskPopover(t, mo.getBoundingClientRect()); return; }
      const fl = e.target.closest('[data-fold]'); if (fl) { fold[fl.dataset.fold] = !fold[fl.dataset.fold]; saveFold(); render(); return; }
      const ct = e.target.closest('[data-cat]'); if (ct) { if (selCat !== ct.dataset.cat) { selCat = ct.dataset.cat; Object.assign(quick, viewDefaults()); } render(); focusQuick(); return; }
      if (e.target.closest('[data-newcat]')) { openCatPopover(null, e.target.closest('[data-newcat]').getBoundingClientRect()); return; }
      if (e.target.closest('[data-cleardone]')) { clearDone(); return; }
      const qx = e.target.closest('[data-qclear]'); if (qx) { e.stopPropagation(); quick[qx.dataset.qclear] = qx.dataset.qclear === 'due' ? '' : null; render(); focusQuick(); return; }
      const qd = e.target.closest('[data-qdue]'); if (qd) { openQuickDue(qd.getBoundingClientRect()); return; }
      const qp = e.target.closest('[data-qprio]'); if (qp) { quick.prio = ((quick.prio || 0) + 1) % 3; render(); focusQuick(); return; }
      const qc = e.target.closest('[data-qcat]'); if (qc) { openQuickCat(qc.getBoundingClientRect()); return; }
    });
    root.addEventListener('contextmenu', e => {
      const ct = e.target.closest('[data-catedit]'); if (ct) { e.preventDefault(); openCatPopover(catOf(ct.dataset.catedit), ct.getBoundingClientRect()); return; }
      const it = e.target.closest('.td-item'); if (it && !it.classList.contains('editing')) { const t = todos().find(x => x.id === it.dataset.tid); if (t) { e.preventDefault(); openTaskPopover(t, { left: e.clientX, top: e.clientY, bottom: e.clientY }); } }
    });
    /* glisser une tâche sur une catégorie (colonne de gauche) pour la reclasser */
    let drag = null;
    root.addEventListener('dragstart', e => { const it = e.target.closest('.td-item'); if (!it || it.classList.contains('editing')) { e.preventDefault(); return; } drag = it.dataset.tid; it.classList.add('dragging'); root.classList.add('td-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag); } catch { /* navigateur strict */ } });
    root.addEventListener('dragover', e => { const c = e.target.closest('[data-drop]'); if (drag && c) { e.preventDefault(); c.classList.add('drop'); } });
    root.addEventListener('dragleave', e => { const c = e.target.closest('[data-drop]'); if (c && !c.contains(e.relatedTarget)) c.classList.remove('drop'); });
    const endDrag = () => { drag = null; root.classList.remove('td-dragging'); root.querySelectorAll('.drop, .dragging').forEach(x => x.classList.remove('drop', 'dragging')); };
    root.addEventListener('drop', e => { const c = e.target.closest('[data-drop]'); if (!drag || !c) return; e.preventDefault(); root.classList.remove('td-dragging'); const t = todos().find(x => x.id === drag); drag = null; if (!t) return; t.cat = c.dataset.drop === 'none' ? null : c.dataset.drop; stamp(t); persist(); const cc = catOf(t.cat); toast(cc ? `Rangée dans « ${cc.name} »` : 'Rangée sans catégorie'); });
    root.addEventListener('dragend', endDrag);
    document.addEventListener('dragend', () => { if (root.classList.contains('td-dragging')) endDrag(); });   // l'élément glissé a pu être redessiné entre-temps
  }

  /* rappel des tâches en retard / du jour (une fois par jour) */
  function dailyReminder() {
    const late = lateCount(), td = todos().filter(t => !t.done && t.due === today()).length;
    if (!late && !td) return;
    const k = 'alixo.todo.reminded' + (window.AlixoAuth ? window.AlixoAuth.storageSuffix() : '');
    try { if (localStorage.getItem(k) === today()) return; localStorage.setItem(k, today()); } catch { /* stockage indisponible */ }
    if (typeof isPlus === 'function' && !isPlus()) return;   // pas de rappel sans Alixo+
    if (window.AlixoNotify) AlixoNotify.push({ id: 'todo_' + today(), kind: 'todo', title: td ? `${td} tâche${td > 1 ? 's' : ''} pour aujourd’hui${late ? ` · ${late} en retard` : ''}` : `${late} tâche${late > 1 ? 's' : ''} en retard`, text: todos().filter(t => !t.done && (isLate(t) || t.due === today())).slice(0, 3).map(t => '• ' + t.text).join('\n'), action: { type: 'todo' }, silent: true });
  }
  refresh();
  setTimeout(dailyReminder, 2500);

  return { render, refresh, addTask, toggle, remove, addCat, openCount, lateCount, todos, cats, isLate };
})();
