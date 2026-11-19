/* ============================================================
   Alixo — Artéfacts (1.55) : js/artefacts.js
   L'onglet « Artéfacts » de la barre latérale (#ln-artefacts → AlixoApp.openArtefactsHome, libMode 'artefacts') réunit
   tout ce que Coco a créé : documents marqués `aiFrom` — quiz et fiches générés depuis une séance (js/aiquiz.js,
   js/aifiche.js, enregistrés automatiquement), documents créés par la barre « IA » ou le chat (js/cococreate.js).
   app.js appelle AlixoArtefacts.render() ; il remplit #lib-artefacts : en-tête (titre, compte, « Créer avec l’IA »),
   recherche, filtres par type en puces, tri, cartes (type, titre, provenance « depuis : <séance> » ou
   « demande : <prompt> », mention « Généré par AlixoAI » (1.55), date, taille) avec Ouvrir / Supprimer (confirmation, puis « Annuler » du toast de app.js).
   État vide engageant : bouton « Créer avec l’IA » qui ouvre la barre (AlixoCocoCreate.open).
   Sécurité : tout texte (titres, demandes) passe par esc() ; identifiants relus dans state.docs avant toute action.
   ============================================================ */
'use strict';

window.AlixoArtefacts = (() => {
  const S = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const A = () => window.AlixoApp || {};
  const e = t => (A().esc ? A().esc(String(t ?? '')) : String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]));
  const cut = (t, n) => { t = S(t); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7Z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/></svg>';
  const I = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    from: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/></svg>',
    ask: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4Z"/></svg>'
  };
  /* types d'artéfact : libellé, couleur (variables de styles.css), icône */
  const KINDS = {
    doc: { label: 'Séance', many: 'Séances', c: 'var(--stor-cours)', ico: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>' },
    fiche: { label: 'Fiche', many: 'Fiches', c: 'var(--warn)', ico: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5Z"/><path d="M8 8h8M8 12h5"/><path d="m14 15 1.5 1.5L19 13"/></svg>' },
    slides: { label: 'Présentation', many: 'Présentations', c: 'var(--stor-slides)', ico: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/></svg>' },
    sheet: { label: 'Tableur', many: 'Tableurs', c: 'var(--stor-sheet)', ico: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/></svg>' },
    board: { label: 'Planche', many: 'Planches', c: 'var(--stor-board)', ico: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M14 17h6M17 14v6"/></svg>' },
    quiz: { label: 'Quiz', many: 'Quiz', c: 'var(--stor-quiz)', ico: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7.5 12 2.5 2.5 6-6"/></svg>' }
  };
  const ORDER = ['quiz', 'fiche', 'doc', 'slides', 'sheet', 'board'];
  let filter = 'all', query = '', sort = 'recent';

  /* type d'un artéfact : kind du document ; une séance née d'une fiche (aifiche.js, ou création « fiche ») est une fiche */
  function kindOf(d) {
    if (d.kind === 'slides' || d.kind === 'sheet' || d.kind === 'board' || d.kind === 'quiz') return d.kind;
    const f = d.aiFrom || {};
    if (f.as === 'fiche' || f.kind === 'fiche' || (!f.prompt && f.docId)) return 'fiche';
    return 'doc';
  }
  const state = () => (A().getState ? A().getState() : null);
  const list = () => { const st = state(); return st ? st.docs.filter(d => d && d.aiFrom && typeof d.aiFrom === 'object') : []; };
  const when = d => +(d.aiFrom.at || d.createdAt || d.updatedAt || 0);
  function dateText(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 864e5);
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diff === 0) return `aujourd’hui à ${hm}`;
    if (diff === 1) return `hier à ${hm}`;
    if (diff < 7 && diff > 1) return `il y a ${diff} jours`;
    return 'le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  const plur = (n, one, many) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;
  function sizeText(d, k) {
    if (k === 'slides') return plur((d.slides || []).length, 'diapositive', 'diapositives');
    if (k === 'quiz') return plur((d.questions || []).filter(q => S(q && q.text)).length, 'question', 'questions');
    if (k === 'board') return plur((d.items || []).length, 'élément', 'éléments');
    if (k === 'sheet') { const n = (d.sheets || []).reduce((s, sh) => s + Object.values((sh && sh.cells) || {}).filter(c => c && c.v !== undefined && c.v !== '').length, 0); return plur(n, 'case remplie', 'cases remplies'); }
    return plur((d.blocks || []).length, 'bloc', 'blocs');
  }
  /* provenance : « depuis : <séance> » (quiz, fiche, création à partir d'une séance) ou « demande : <prompt> » */
  function originHTML(d) {
    const f = d.aiFrom; const st = state();
    if (f.docId) {
      const src = st && st.docs.find(x => x.id === f.docId);
      const t = cut(src ? (S(src.titre) || 'Sans titre') : (S(f.title) || 'séance supprimée'), 60);
      return `<span class="art-orig">${I.from}<span>depuis : ${src ? `<button type="button" class="art-src" data-src="${e(src.id)}" title="Ouvrir la séance source">«\u00a0${e(t)}\u00a0»</button>` : `<i>«\u00a0${e(t)}\u00a0»</i>`}</span></span>`;
    }
    if (S(f.prompt)) return `<span class="art-orig">${I.ask}<span>demande : «\u00a0${e(cut(f.prompt, 90))}\u00a0»</span></span>`;
    return '';
  }
  function cardHTML(d) {
    const k = kindOf(d); const K = KINDS[k];
    const title = S(d.titre) || 'Sans titre';
    return `<article class="art-card" data-id="${e(d.id)}" data-k="${k}" style="--ak:${K.c}">
      <button type="button" class="art-main" data-open="${e(d.id)}" title="Ouvrir « ${e(cut(title, 80))} »">
        <span class="art-band"><span class="art-ico">${K.ico}</span><span class="art-kind">${e(K.label)}</span><span class="art-spark" title="Créé par Coco">${SPARK}</span></span>
        <span class="art-body"><b class="art-title">${e(cut(title, 90))}</b>
          <span class="art-meta">${e(dateText(when(d)))} · ${e(sizeText(d, k))}</span></span>
      </button>
      <div class="art-foot">${originHTML(d)}<span class="art-gen">${SPARK}Généré par AlixoAI</span>
        <span class="art-acts"><button type="button" class="art-btn primary" data-open="${e(d.id)}">${I.open}<span>Ouvrir</span></button><button type="button" class="art-btn danger" data-del="${e(d.id)}" title="Supprimer cet artéfact" aria-label="Supprimer « ${e(cut(title, 60))} »">${I.trash}</button></span></div>
    </article>`;
  }

  function root() { return document.getElementById('lib-artefacts'); }
  function render() {
    const el = root(); if (!el) return;
    const all = list();
    const counts = {}; for (const d of all) { const k = kindOf(d); counts[k] = (counts[k] || 0) + 1; }
    if (filter !== 'all' && !counts[filter]) filter = 'all';
    const q = S(query).toLowerCase();
    let items = all.filter(d => (filter === 'all' || kindOf(d) === filter) && (!q || `${S(d.titre)} ${S(d.aiFrom.prompt)} ${S(d.aiFrom.title)}`.toLowerCase().includes(q)));
    items.sort((a, b) => sort === 'old' ? when(a) - when(b) : sort === 'title' ? S(a.titre).localeCompare(S(b.titre), 'fr') : when(b) - when(a));
    const hadFocus = document.activeElement && el.contains(document.activeElement) && document.activeElement.classList.contains('art-q');
    const chips = `<button type="button" class="art-chip${filter === 'all' ? ' on' : ''}" data-f="all" aria-pressed="${filter === 'all'}">Tous<em>${all.length}</em></button>` +
      ORDER.filter(k => counts[k]).map(k => `<button type="button" class="art-chip${filter === k ? ' on' : ''}" data-f="${k}" style="--ak:${KINDS[k].c}" aria-pressed="${filter === k}"><i></i>${e(KINDS[k].many)}<em>${counts[k]}</em></button>`).join('');
    const empty = !all.length;
    el.innerHTML = `<div class="art-wrap">
      <header class="art-top">
        <div class="art-top-l"><h2 class="art-h">${SPARK}<span>Artéfacts</span></h2>
          <div class="art-sub">${empty ? 'Tout ce que Coco crée pour vous, au même endroit' : `${plur(all.length, 'document créé', 'documents créés')} par Coco · quiz, fiches, présentations…`}</div></div>
        ${empty ? '' : `<button type="button" class="art-create" data-create>${SPARK}<span>Créer avec l’IA</span></button>`}
      </header>
      ${empty ? emptyHTML() : `<div class="art-tools">
        <label class="art-search">${I.search}<input type="search" class="art-q" placeholder="Rechercher un artéfact…" aria-label="Rechercher un artéfact" value="${e(query)}"></label>
        <div class="art-chips" role="group" aria-label="Filtrer par type">${chips}</div>
        <label class="art-sortw"><span class="cc-sr">Trier</span><select class="art-sort" aria-label="Trier"><option value="recent"${sort === 'recent' ? ' selected' : ''}>Plus récents</option><option value="old"${sort === 'old' ? ' selected' : ''}>Plus anciens</option><option value="title"${sort === 'title' ? ' selected' : ''}>Titre (A → Z)</option></select></label>
      </div>
      ${items.length ? `<div class="art-grid">${items.map(cardHTML).join('')}</div>` : `<div class="art-none"><b>Aucun artéfact ne correspond.</b><p>Essayez un autre mot ou un autre type.</p><button type="button" class="art-btn" data-reset>Tout afficher</button></div>`}`}
    </div>`;
    if (hadFocus) { const i = el.querySelector('.art-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }
  function emptyHTML() {
    return `<div class="art-empty">
      <div class="art-eart" aria-hidden="true"><img src="img/coco.png" alt="" width="720" height="449"><span class="art-float a">${KINDS.quiz.ico}</span><span class="art-float b">${KINDS.slides.ico}</span><span class="art-float c">${KINDS.fiche.ico}</span></div>
      <b>Vos créations avec Coco apparaîtront ici</b>
      <p>Demandez une présentation, un quiz, une fiche de révision ou un tableur : Coco l’écrit pour vous. Les quiz et fiches générés depuis une séance sont aussi rangés ici, automatiquement.</p>
      <button type="button" class="art-create big" data-create>${SPARK}<span>Créer avec l’IA</span></button>
    </div>`;
  }
  /* un document créé ou supprimé ailleurs : on redessine si la vue est affichée */
  function refresh() { const el = root(); if (el && !el.hidden) render(); }

  /* ---------------- actions ---------------- */
  function openOne(id) { const st = state(); if (!st || !st.docs.some(d => d.id === id)) { render(); return; } A().openDoc(id); }
  function removeOne(id) {
    const st = state(); const d = st && st.docs.find(x => x.id === id); if (!d) { render(); return; }
    if (typeof deleteDoc !== 'function') return;
    /* deleteDoc (app.js) demande déjà confirmation pour une séance qui a du contenu ; sinon, on la demande ici */
    const seanceWithText = (!d.kind || d.kind === 'doc') && typeof blockPlain === 'function' && (d.blocks || []).some(b => S(blockPlain(b)));
    if (seanceWithText) { deleteDoc(id); return; }
    const WHAT = { quiz: 'Ce quiz sera retiré', fiche: 'Cette fiche sera retirée', doc: 'Cette séance sera retirée', slides: 'Cette présentation sera retirée', sheet: 'Ce tableur sera retiré', board: 'Cette planche sera retirée' };
    const ask = typeof confirmDialog === 'function' ? confirmDialog({ title: `Supprimer « ${cut(S(d.titre) || 'Sans titre', 60)} » ?`, text: `${WHAT[kindOf(d)]} de la bibliothèque. Vous pourrez annuler pendant quelques secondes.` }) : Promise.resolve(window.confirm('Supprimer cet artéfact ?'));
    ask.then(ok => { if (ok) deleteDoc(id); });
  }
  function bind() {
    const el = root(); if (!el || el.dataset.artBound) return;
    el.dataset.artBound = '1';
    el.addEventListener('click', ev => {
      const t = ev.target;
      const del = t.closest('[data-del]'); if (del) { removeOne(del.dataset.del); return; }
      const src = t.closest('[data-src]'); if (src) { openOne(src.dataset.src); return; }
      const op = t.closest('[data-open]'); if (op) { openOne(op.dataset.open); return; }
      const ch = t.closest('[data-f]'); if (ch) { filter = ch.dataset.f; render(); return; }
      if (t.closest('[data-reset]')) { filter = 'all'; query = ''; render(); return; }
      if (t.closest('[data-create]')) { if (window.AlixoCocoCreate) AlixoCocoCreate.open(); }
    });
    el.addEventListener('input', ev => { if (ev.target.classList.contains('art-q')) { query = ev.target.value; render(); } });
    el.addEventListener('change', ev => { if (ev.target.classList.contains('art-sort')) { sort = ev.target.value; render(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();

  return { render: () => { bind(); render(); }, refresh, kindOf, list };
})();
