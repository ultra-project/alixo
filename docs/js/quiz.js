/* ============================================================
   Alixo — quiz (1.24, refonte 1.25)
   Un quiz est une séance particulière : { kind: 'quiz', questions: [...], results: [...], theme, music }
   (d.blocks reste vide : synchronisation, onglets, bibliothèque, corbeille et partage n'ont rien
   de nouveau à connaître). Types de questions, thèmes et règles de points : js/quizcore.js (partagé avec
   la page des participants quiz.html) ; musiques et sons : js/quizfx.js.

   Trois usages :
   - l'ÉDITEUR (#view-quiz) : palette de types à glisser dans la liste (ou clic) — questions notées, avis du
     public, pages sans question — ; questions réordonnables, image par question, réponses saisies par objets ;
     bouton « Apparence » : thème (ou couleurs personnalisées), musique de fond, sons ;
   - le TEST (overlay #qz-play, mode « test ») : on joue le quiz sur cet appareil ;
   - la PRÉSENTATION EN DIRECT (mode « live ») : l'écran du présentateur affiche un code à 6 chiffres et un
     QR code ; les participants ouvrent alixoapp.com/quiz sur leur téléphone et répondent à chaque question.
     Firestore : live/{code} (état, thème, question en cours — sans la réponse — puis réponse révélée,
     statistiques, classement) et live/{code}/players/{pid}. Voir firestore.rules (bloc « Quiz en direct »).
     À la fin, le classement et les statistiques (par question, par participant) sont enregistrés dans d.results.

   Chargé APRÈS app.js : utilise ses globales (state, doc(), save(), openTabs, renderTabs,
   renderCrumbs, toast, esc, uid, folderTint, openDialog, confirmDialog, exportWatermark, AlixoImages, fileToImage…).
   ============================================================ */
'use strict';

window.AlixoQuiz = (() => {
  const C = window.QuizCore;
  const FX = () => window.AlixoQuizFx || null;
  const HIST_MAX = 60;
  const MAX_OPTS = 6;
  const JOIN_HOST = 'alixoapp.com/quiz';
  const joinUrl = code => `https://alixoapp.com/quiz/?code=${encodeURIComponent(code)}`;
  const TIMES = [[0, 'Sans limite'], [10, '10 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '1 min'], [90, '1 min 30'], [120, '2 min'], [180, '3 min']];
  const POINTS = [[0, '0 point'], [500, '500 points'], [1000, '1 000 points'], [2000, '2 000 points']];

  const I = {
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8Z"/></svg>',
    cast: '<svg viewBox="0 0 24 24"><path d="M3 17a9 9 0 0 1 9 9M3 12a14 14 0 0 1 14 14"/><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 20h.01"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    look: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="10" r="1.3" fill="currentColor"/><path d="M12 21c-1.5-2-1-4 .5-4.5 2-.5 3.5-2 2.5-4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 9"/></svg>',
    sound: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10Z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>',
    xls: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 14.5h18M9 4v16"/></svg>',
    csv: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>'
  };
  /* icônes des nouveaux types (palette, en-tête de l'éditeur) */
  const TICO = {
    vote: '<svg class="qz-tico" viewBox="0 0 24 24"><g fill="currentColor" stroke="none"><circle cx="3.6" cy="18" r="1.7"/><circle cx="4.8" cy="13.4" r="1.7"/><circle cx="8" cy="10.2" r="1.7"/><circle cx="12" cy="9.2" r="1.7"/><circle cx="16" cy="10.2" r="1.7"/><circle cx="19.2" cy="13.4" r="1.7"/><circle cx="20.4" cy="18" r="1.7"/><circle cx="8.2" cy="18" r="1.5"/><circle cx="9.6" cy="14.4" r="1.5"/><circle cx="14.4" cy="14.4" r="1.5"/><circle cx="15.8" cy="18" r="1.5"/></g></svg>',
    cloze: '<svg class="qz-tico" viewBox="0 0 24 24"><path d="M3 7.5h4M3 16.5h9M17 16.5h4"/><rect x="9.5" y="4.5" width="11.5" height="6" rx="2" fill="currentColor" fill-opacity=".25"/></svg>'
  };
  const tico = k => TICO[k] || (C.TYPES[k] ? C.TYPES[k].ico : '?');

  /* ---------------- état ---------------- */
  const d = () => (typeof doc === 'function' ? doc() : null);
  const qsOf = dd => (Array.isArray(dd && dd.questions) ? dd.questions : (dd ? (dd.questions = []) : []));
  const resOf = dd => (Array.isArray(dd && dd.results) ? dd.results : (dd ? (dd.results = []) : []));
  const themeOf = dd => (dd && dd.theme && typeof dd.theme === 'object' ? dd.theme : { k: 'alixo' });
  const musicOf = dd => (dd && dd.music && typeof dd.music === 'object' ? dd.music : { k: 'none', vol: 0.5, sfx: true });
  const active = () => document.body.classList.contains('mode-quiz');
  let cur = null;                    // question affichée dans l'éditeur
  let hist = { undo: [], redo: [] };
  let readOnly = false, bound = false, saveTm = null, remoteTm = null;
  let dragQ = null, dragType = null; // glisser-déposer : question déplacée / type depuis la palette
  let test = null;                   // { i, score, ok, answers, timer, shownAt, done }
  let live = null;                   // session en direct (hôte) — voir startLive
  const curQ = () => { const dd = d(); if (!dd) return null; return qsOf(dd).find(q => q.id === cur) || null; };
  const qText = q => (q.text || '').trim() || (q.t === 'cloze' && (q.src || '').trim() ? C.clozePlain(q.src).replace(/\s+/g, ' ').trim().slice(0, 120) : '') || (q.t === 'info' ? 'Page sans titre' : 'Question sans texte');
  /* titre affiché en jeu : un texte à trous sans consigne affiche « Complétez le texte » (le texte lui-même suit) */
  const playTitle = q => (q.t === 'cloze' && !(q.text || '').trim() ? 'Complétez le texte' : qText(q));
  const playable = q => (q.text || '').trim() || (q.opts || []).some(o => o.text) || (q.pairs || []).some(p => p.l || p.r) || (q.t === 'info' && ((q.body || '').trim() || q.img)) || (q.t === 'cloze' && C.clozeParse(q.src).answers.length);
  /* la question complète, prête pour l'affichage de la réponse (pub = version publique envoyée aux joueurs) */
  const fullOf = (q, pub) => { const f = Object.assign({}, pub, { ans: q.ans, tol: q.tol, unit: q.unit, opts: q.t === 'order' ? q.opts : pub.opts, multi: q.multi, pairs: q.pairs, rkey: pub._key || null }); if (q.t === 'cloze') f.ansHoles = C.clozeHoles(q); return f; };
  /* décompte des votes (vote d'assemblée) : liste de réponses [id…] → { id: nombre } */
  const tally = (q, list) => { const c = {}; for (const o of (q.opts || [])) c[o.id] = 0; for (const v of list) for (const id of (Array.isArray(v) ? v : [v])) if (id in c) c[id]++; return c; };
  /* préréglages de couleurs d'un vote d'assemblée (de gauche à droite) */
  const VOTE_PRESETS = [
    ['assemblee', 'Assemblée', ['#c62828', '#e8789a', '#2f9e5a', '#e0a800', '#2f6fd1', '#1f3a68']],
    ['pour', 'Pour / Contre', ['#2f9e5a', '#9aa0a6', '#d93a3a', '#e0a800', '#2f6fd1', '#8e5bd0']],
    ['arc', 'Arc-en-ciel', ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa']],
    ['doux', 'Pastel', ['#e57373', '#f6b26b', '#9ccc65', '#4dd0e1', '#7986cb', '#ba68c8']]
  ];
  const fmtPts = n => (n || 0).toLocaleString('fr-FR');
  const fmtSec = ms => (ms == null ? '—' : (Math.round(ms / 100) / 10).toLocaleString('fr-FR') + ' s');

  function newDoc(fid, prof) {
    return { id: uid(), kind: 'quiz', folderId: fid || null, titre: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, prof: prof || '', blocks: [], questions: [C.newQuestion('mcq')], results: [], theme: { k: 'alixo' }, music: { k: 'none', vol: 0.5, sfx: true } };
  }

  /* ---------------- ouverture / fermeture ---------------- */
  function open(id) {
    const dd = findDoc(id); if (!dd) return;
    if (currentDocId && currentDocId !== id && typeof rememberScroll === 'function') rememberScroll();
    if (typeof hidePopover === 'function') hidePopover();
    if (typeof closeCtxMenu === 'function') closeCtxMenu();
    if (window.AlixoSlides) AlixoSlides.leave();
    if (window.AlixoSheets) AlixoSheets.leave();
    if (window.AlixoBoard) AlixoBoard.leave();
    currentDocId = id;
    const shared = typeof isSharedDoc === 'function' && isSharedDoc(id);
    readOnly = !!(shared && !(window.AlixoShare && AlixoShare.canWrite(id)));
    document.body.classList.toggle('readonly', readOnly);
    if (shared && window.AlixoShare && AlixoShare.noteOpened) AlixoShare.noteOpened(id);
    qsOf(dd); resOf(dd);
    if (!qsOf(dd).some(q => q.id === cur)) cur = qsOf(dd).length ? qsOf(dd)[0].id : null;
    hist = { undo: [], redo: [] };
    document.body.classList.remove('mode-editor', 'mode-slides', 'mode-sheet', 'mode-board');
    document.body.classList.add('mode-quiz');
    $('#view-library').style.display = 'none';
    $('#view-editor').hidden = true;
    $('#toolbar').hidden = true;
    $('#view-quiz').hidden = false;
    document.documentElement.style.setProperty('--tint', folderTint(dd.folderId));
    if (typeof setSaveStatus === 'function') setSaveStatus('saved');
    if (!openTabs.includes(id)) openTabs.push(id);
    renderTabs(); renderCrumbs();
    if (typeof renderAccess === 'function') renderAccess();
    if (shared && window.AlixoShare) AlixoShare.setPresence(id, null);
    bind();
    renderAll();
  }
  function leave() {
    if (!active()) return;
    if (saveTm) { clearTimeout(saveTm); saveTm = null; commit(); }
    document.body.classList.remove('mode-quiz');
    $('#view-quiz').hidden = true;
    dragQ = null; dragType = null;
  }
  /* version reçue d'un autre membre / appareil pendant que le quiz est ouvert */
  function remoteChanged() {
    if (!active()) return;
    clearTimeout(remoteTm);
    if (document.activeElement && document.activeElement.closest('#qz-edit')) { remoteTm = setTimeout(remoteChanged, 2000); return; }
    renderAll();
  }

  /* ---------------- enregistrement et historique ---------------- */
  function commit() {
    clearTimeout(saveTm); saveTm = null;
    const dd = d(); if (!dd || readOnly) return;
    dd.updatedAt = Date.now();
    save();
  }
  function commitSoon() { clearTimeout(saveTm); saveTm = setTimeout(commit, 400); }
  function pushHist() {
    const dd = d(); if (!dd || readOnly) return;
    hist.undo.push(JSON.stringify(qsOf(dd)));
    if (hist.undo.length > HIST_MAX) hist.undo.shift();
    hist.redo.length = 0;
  }
  function undo() {
    const dd = d(); if (!dd || !active() || !hist.undo.length) return false;
    hist.redo.push(JSON.stringify(qsOf(dd)));
    dd.questions = JSON.parse(hist.undo.pop());
    commit(); renderAll(); return true;
  }
  function redo() {
    const dd = d(); if (!dd || !active() || !hist.redo.length) return false;
    hist.undo.push(JSON.stringify(qsOf(dd)));
    dd.questions = JSON.parse(hist.redo.pop());
    commit(); renderAll(); return true;
  }

  /* ============================================================
     Éditeur
     ============================================================ */
  function renderAll() { renderBar(); renderList(); renderEdit(); renderPalette(); }
  function renderBar() {
    const bar = $('#qz-bar'); const dd = d(); if (!bar || !dd) return;
    const n = qsOf(dd).length, nr = resOf(dd).length;
    const th = C.resolveTheme(themeOf(dd));
    const info = readOnly && window.AlixoShare && AlixoShare.infoFor ? AlixoShare.infoFor(dd.id) : null;
    bar.innerHTML = `<div class="bd-barl">
      ${readOnly ? `<span class="bd-barlabel">Quiz</span><span class="bd-ro">Partagé par <b>${esc(info ? info.owner : 'un membre')}</b> · lecture seule</span>` : `
      <button data-qz="undo" title="Annuler (Ctrl+Z)" ${hist.undo.length ? '' : 'disabled'}>${I.undo}</button>
      <button data-qz="redo" title="Rétablir (Ctrl+Y)" ${hist.redo.length ? '' : 'disabled'}>${I.redo}</button>
      <span class="bd-sep"></span>
      <span class="bd-barlabel">Quiz</span><span class="qz-count">${n} élément${n > 1 ? 's' : ''}</span>`}
    </div>
    <div class="bd-barr">
      ${readOnly ? '' : `<button data-qz="look" title="Apparence : thème ou couleurs personnalisées, musique de fond, sons"><span class="qz-swatch" style="background:${th.bg};border-color:${th.accent}"><i style="background:${th.accent}"></i></span><span class="bd-lbl">Apparence</span></button><span class="bd-sep"></span>`}
      <button data-qz="test" class="qz-primary" title="Jouer le quiz sur cet appareil (F5) : chronomètre, points, résultat enregistré">${I.play}<span class="bd-lbl">Tester</span></button>
      <button data-qz="live" class="qz-live" title="Présenter en direct : code et QR code à l'écran, les participants répondent sur leur téléphone (alixoapp.com/quiz)">${I.cast}<span class="bd-lbl">Présenter en direct</span></button>
      <button data-qz="results" title="Résultats enregistrés : scores, statistiques par question et par participant, export Excel ou CSV">${I.chart}<span class="bd-lbl">Résultats${nr ? ` (${nr})` : ''}</span></button>
      <span class="bd-sep"></span>
      <button data-qz="dl" class="dl-btn" title="Télécharger : fichier Alixo, PDF (questions et réponses) (Ctrl+P : PDF)"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg><span class="bd-lbl">Télécharger</span></button>
    </div>`;
  }
  function renderPalette() {
    const el = $('#qz-palette'); if (!el) return;
    if (readOnly) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="qz-ptitle">Ajouter</div><div class="qz-phint">Glissez un type dans la liste, ou cliquez : il s’ajoute après l’élément ouvert.</div>
      ${C.GROUPS.map(([g, name]) => `<div class="qz-pgroup">${esc(name)}</div>` + Object.entries(C.TYPES).filter(([, t]) => t.grp === g).map(([k, t]) => `<div class="qz-ptype${k === 'cloze' || k === 'vote' ? ' new' : ''}" draggable="true" data-type="${k}" data-grp="${t.grp}" title="${esc(t.sub)}"><span class="qz-pico">${tico(k)}</span><span><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></span></div>`).join('')).join('')}`;
  }
  function renderList() {
    const el = $('#qz-list'); const dd = d(); if (!el || !dd) return;
    const qs = qsOf(dd);
    let qi = 0;
    el.innerHTML = `<div class="qz-ltitle">Déroulé</div>` + (qs.length ? qs.map((q) => { const page = q.t === 'info'; if (!page) qi++; return `<div class="qz-card${q.id === cur ? ' cur' : ''}${page ? ' page' : ''}" data-q="${q.id}" ${readOnly ? '' : 'draggable="true"'}>
        <span class="qz-cnum" data-grp="${C.TYPES[q.t] ? C.TYPES[q.t].grp : 'q'}">${page ? '▭' : qi}</span>
        <span class="qz-cbody"><span class="qz-ctype">${C.TYPES[q.t] ? C.TYPES[q.t].ico + ' ' + C.TYPES[q.t].name : q.t}${q.img ? ' · 🖼' : ''}</span><span class="qz-ctext">${esc(qText(q))}</span></span>
        ${readOnly ? '' : `<span class="qz-cact"><button type="button" data-cdup title="Dupliquer">${I.dup}</button><button type="button" data-cdel title="Supprimer">${I.trash}</button></span>`}
      </div>`; }).join('') : `<div class="qz-lempty">Aucune question. ${readOnly ? '' : 'Glissez un type depuis la palette, ou cliquez dessus.'}</div>`)
      + (readOnly ? '' : `<div class="qz-ldrop" data-drop-end>${qs.length ? 'Déposer ici pour ajouter à la fin' : ''}</div>`);
  }
  function optRow(q, op, i) {
    const col = q.t === 'vote' ? C.voteColor(op, i) : `var(--qp-c${i % 6})`, sh = C.letter(i);
    const isAns = q.t === 'mcq' && Array.isArray(q.ans) && q.ans.includes(op.id);
    return `<div class="qz-opt${isAns ? ' ok' : ''}${q.t === 'vote' ? ' qz-vopt' : ''}" data-opt="${op.id}" style="--oc:${esc(col)}">
      ${q.t === 'order' ? `<span class="qz-onum">${i + 1}</span>` : q.t === 'vote' ? `<label class="qz-ocolor" title="Couleur de ce groupe dans l’hémicycle"><span class="qz-oshape">${sh}</span><input type="color" data-ocolor value="${esc(col)}" ${readOnly ? 'disabled' : ''}></label>` : `<span class="qz-oshape">${sh}</span>`}
      <input class="qz-otext" value="${esc(op.text)}" placeholder="${q.t === 'order' ? `Élément ${i + 1}` : q.t === 'vote' ? `Groupe ${sh} (ex. Pour, Contre…)` : `Proposition ${sh}`}" maxlength="120" ${readOnly ? 'disabled' : ''}>
      ${q.t === 'mcq' ? `<button type="button" class="qz-ook" data-ook title="${isAns ? 'Bonne réponse (cliquer pour retirer)' : 'Marquer comme bonne réponse'}" ${readOnly ? 'disabled' : ''}>✓</button>` : ''}
      ${q.t === 'order' ? `<span class="qz-omv"><button type="button" data-omv="-1" title="Monter" ${i === 0 || readOnly ? 'disabled' : ''}>▲</button><button type="button" data-omv="1" title="Descendre" ${i === q.opts.length - 1 || readOnly ? 'disabled' : ''}>▼</button></span>` : ''}
      <button type="button" class="qz-odel" data-odel title="Retirer" ${q.opts.length <= 2 || readOnly ? 'disabled' : ''}>${I.x}</button>
    </div>`;
  }
  function imgBox(q) {
    if (readOnly && !q.img) return '';
    return `<div class="qz-img${q.img ? ' has' : ''}" id="qz-img">${q.img ? `<img alt="" data-iid="${esc(q.img)}">` : ''}${readOnly ? '' : `<span class="qz-imgbtns"><button type="button" class="cta ghost small" data-img>${I.image} ${q.img ? 'Changer l’image' : 'Ajouter une image'}</button>${q.img ? `<button type="button" class="cta ghost small" data-imgdel>Retirer</button>` : ''}</span>`}</div>`;
  }
  function renderEdit() {
    const el = $('#qz-edit'); const dd = d(); if (!el || !dd) return;
    const q = curQ();
    if (!q) { el.innerHTML = `<div class="qz-eempty"><div class="qz-eico">?</div><p>${qsOf(dd).length ? 'Choisissez un élément dans la liste.' : 'Ce quiz est vide : ajoutez une première question depuis la palette.'}</p></div>`; return; }
    const t = C.TYPES[q.t] || { name: q.t, ico: '?' };
    const dis = readOnly ? 'disabled' : '';
    let body = '';
    if (q.t === 'mcq' || q.t === 'poll' || q.t === 'order') {
      body = `<div class="qz-label">${q.t === 'order' ? 'Éléments, dans le bon ordre (les participants les reçoivent mélangés)' : q.t === 'poll' ? 'Propositions' : 'Propositions — cochez la ou les bonnes réponses'}</div>
        <div class="qz-opts" id="qz-opts">${q.opts.map((op, i) => optRow(q, op, i)).join('')}</div>
        <div class="po-row" style="gap:10px; margin-top:8px; flex-wrap:wrap; align-items:center">
          <button type="button" class="cta ghost small" data-oadd ${q.opts.length >= MAX_OPTS || readOnly ? 'disabled' : ''}>＋ ${q.t === 'order' ? 'Élément' : 'Proposition'}</button>
          ${q.t === 'mcq' ? `<label class="set-inline"><input type="checkbox" data-multi ${q.multi ? 'checked' : ''} ${dis}> Plusieurs bonnes réponses (le participant valide une sélection)</label>` : ''}
        </div>${q.t === 'mcq' && !(q.ans || []).length ? '<div class="qz-warn">Aucune bonne réponse cochée : la question ne rapportera aucun point.</div>' : ''}`;
    } else if (q.t === 'match') {
      const pairs = Array.isArray(q.pairs) ? q.pairs : (q.pairs = []);
      body = `<div class="qz-label">Paires à relier (les correspondances de droite sont mélangées chez les participants)</div>
        <div class="qz-opts" id="qz-opts">${pairs.map((p, i) => `<div class="qz-opt qz-pair" data-pair="${p.id}" style="--oc:var(--qp-c${i % 6})"><span class="qz-oshape">${C.letter(i)}</span><input class="qz-otext" data-pf="l" value="${esc(p.l || '')}" placeholder="Élément ${C.letter(i)}" maxlength="80" ${dis}><span class="qz-marr">→</span><input class="qz-otext" data-pf="r" value="${esc(p.r || '')}" placeholder="Correspondance" maxlength="80" ${dis}><button type="button" class="qz-odel" data-pdel title="Retirer" ${pairs.length <= 2 || readOnly ? 'disabled' : ''}>${I.x}</button></div>`).join('')}</div>
        <div class="po-row" style="margin-top:8px"><button type="button" class="cta ghost small" data-padd ${pairs.length >= MAX_OPTS || readOnly ? 'disabled' : ''}>＋ Paire</button></div>`;
    } else if (q.t === 'tf') {
      body = `<div class="qz-label">Bonne réponse</div><div class="qz-tf">
        <button type="button" class="qz-tfbtn${q.ans ? ' on' : ''}" data-tf="1" style="--oc:var(--qp-c2)" ${dis}>✓ Vrai</button>
        <button type="button" class="qz-tfbtn${!q.ans ? ' on' : ''}" data-tf="0" style="--oc:var(--qp-c1)" ${dis}>✗ Faux</button></div>`;
    } else if (q.t === 'numeric') {
      body = `<div class="qz-label">Bonne réponse</div><div class="qz-grid">
        <label>Nombre attendu <input type="number" data-f="ans" value="${esc(q.ans)}" step="any" ${dis}></label>
        <label>Tolérance ± <input type="number" data-f="tol" value="${esc(q.tol || 0)}" min="0" step="any" ${dis}></label>
        <label>Unité (affichée) <input type="text" data-f="unit" value="${esc(q.unit || '')}" placeholder="€, %, ans…" maxlength="12" ${dis}></label></div>
        <div class="qz-hint">Les participants tapent un nombre ; la virgule et le point sont acceptés.</div>`;
    } else if (q.t === 'slider') {
      body = `<div class="qz-label">Échelle et bonne réponse</div><div class="qz-grid">
        <label>Minimum <input type="number" data-f="min" value="${esc(q.min)}" ${dis}></label>
        <label>Maximum <input type="number" data-f="max" value="${esc(q.max)}" ${dis}></label>
        <label>Pas <input type="number" data-f="step" value="${esc(q.step)}" min="0.001" step="any" ${dis}></label>
        <label>Bonne réponse <input type="number" data-f="ans" value="${esc(q.ans)}" step="any" ${dis}></label>
        <label>Tolérance ± <input type="number" data-f="tol" value="${esc(q.tol || 0)}" min="0" step="any" ${dis}></label></div>
`;
    } else if (q.t === 'scale') {
      body = `<div class="qz-label">Échelle (sans bonne réponse)</div><div class="qz-grid">
        <label>De <input type="number" data-f="min" value="${esc(q.min)}" min="0" max="9" ${dis}></label>
        <label>À <input type="number" data-f="max" value="${esc(q.max)}" min="2" max="10" ${dis}></label>
        <label>Libellé à gauche <input type="text" data-f="lo" value="${esc(q.lo || '')}" placeholder="Pas du tout" maxlength="30" ${dis}></label>
        <label>Libellé à droite <input type="text" data-f="hi" value="${esc(q.hi || '')}" placeholder="Tout à fait" maxlength="30" ${dis}></label></div>
`;
    } else if (q.t === 'text') {
      const list = Array.isArray(q.ans) ? q.ans : [];
      body = `<div class="qz-label">Réponses acceptées (majuscules, accents et espaces sont ignorés)</div>
        <div class="qz-opts" id="qz-opts">${(list.length ? list : ['']).map((a, i) => `<div class="qz-opt ok" data-ans="${i}" style="--oc:var(--ok)"><span class="qz-oshape">✓</span><input class="qz-otext" value="${esc(a)}" placeholder="Réponse ${i + 1}" maxlength="80" ${dis}><button type="button" class="qz-odel" data-adel title="Retirer" ${list.length <= 1 || readOnly ? 'disabled' : ''}>${I.x}</button></div>`).join('')}</div>
        <div class="po-row" style="margin-top:8px"><button type="button" class="cta ghost small" data-aadd ${list.length >= 8 || readOnly ? 'disabled' : ''}>＋ Variante acceptée</button></div>`;
    } else if (q.t === 'vote') {
      body = `<div class="qz-label">Groupes, de gauche à droite dans l’hémicycle — la pastille règle la couleur</div>
        <div class="qz-opts" id="qz-opts">${q.opts.map((op, i) => optRow(q, op, i)).join('')}</div>
        <div class="qz-vrow">
          <button type="button" class="cta ghost small" data-oadd ${q.opts.length >= MAX_OPTS || readOnly ? 'disabled' : ''}>＋ Groupe</button>
          <span class="qz-vpal"><span>Couleurs</span>${VOTE_PRESETS.map(([k, name, cols]) => `<button type="button" class="qz-vpreset" data-vpreset="${k}" title="Appliquer les couleurs « ${esc(name)} »" ${dis}><span>${cols.slice(0, 5).map(c => `<i style="background:${c}"></i>`).join('')}</span>${esc(name)}</button>`).join('')}</span>
        </div>
        <div class="qz-hint">Sans bonne réponse ni points. À l’écran du présentateur, chaque vote ajoute un siège à l’hémicycle ; le repère central marque la majorité absolue et le groupe en tête ressort à la révélation.</div>`;
    } else if (q.t === 'cloze') {
      const holes = C.syncHoles(q.src, q.holes);
      body = `<div class="qz-label">Texte à compléter</div>
        <div class="qz-ctools">
          <button type="button" class="cta small qz-mkhole" data-mkhole ${dis}><span class="qz-mkico">[…]</span> Faire un trou</button>
          <button type="button" class="cta ghost small" data-unhole ${dis}>Retirer le trou</button>
          <span class="qz-ctip">Sélectionnez un mot (ou placez le curseur dessus), puis « Faire un trou ». Vous pouvez aussi taper <code>[[mot]]</code>.</span>
        </div>
        <textarea class="qz-csrc" data-f="src" rows="5" maxlength="3000" spellcheck="true" placeholder="Ex. : La Révolution française commence en [[1789]] avec la prise de la [[Bastille]]." ${dis}>${esc(q.src || '')}</textarea>
        <div class="qz-cprev" id="qz-cprev">${clozePrevHTML(q)}</div>
        <div id="qz-holes">${holesHTML(holes)}</div>`;
    } else if (q.t === 'open') {
      body = `<div class="qz-hint" style="margin-top:14px">Chaque participant envoie un mot ou une courte idée ; l’écran du présentateur affiche le nuage de mots (les réponses identiques grossissent). Sans points.</div>`;
    } else if (q.t === 'info') {
      body = `<div class="qz-label">Texte de la page</div><textarea class="qz-body" data-f="body" placeholder="Quelques lignes : consigne, rappel de cours, transition, pause…" rows="6" maxlength="2000" ${dis}>${esc(q.body || '')}</textarea>
        <div class="qz-hint">Une page ne pose pas de question : elle s’affiche sur l’écran du présentateur (et sur les téléphones) jusqu’à ce que vous passiez à la suite.</div>`;
    }
    el.innerHTML = `<div class="qz-ecard" data-grp="${t.grp || 'q'}"><div class="qz-ehead">
        <span class="qz-etype" title="${esc(t.sub || '')}"><i>${tico(q.t)}</i> ${esc(t.name)}</span>
        <span class="qz-espacer"></span>
        ${q.t === 'info' ? '' : `<label class="set-inline">Temps <select data-f="time" ${dis}>${TIMES.map(([v, l]) => `<option value="${v}" ${+q.time === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
        ${C.isScored(q) ? `<label class="set-inline">Points <select data-f="points" ${dis}>${POINTS.map(([v, l]) => `<option value="${v}" ${+q.points === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      </div>
      <textarea class="qz-qtext" data-f="text" placeholder="${q.t === 'tf' ? 'Affirmation à juger…' : q.t === 'info' ? 'Titre de la page…' : q.t === 'cloze' ? 'Consigne (facultative) : « Complétez le texte »…' : q.t === 'vote' ? 'Motion soumise au vote…' : q.t === 'poll' || q.t === 'scale' || q.t === 'open' ? 'Question posée au public…' : 'Question…'}" rows="2" maxlength="400" ${dis}>${esc(q.text || '')}</textarea>
      ${imgBox(q)}
      ${body}
      ${C.isScored(q) ? `<div class="qz-hint">${q.t === 'cloze' ? 'Points au prorata des trous justes (3 trous sur 4 = 75 % des points) ; ' : 'Points : '}la moitié pour la bonne réponse, l’autre moitié fond avec le temps écoulé (réponse immédiate = tous les points).</div>` : ''}
      </div>${pvBoxHTML()}`;
    const im = el.querySelector('#qz-img img');
    if (im) AlixoImages.get(im.dataset.iid).then(v => { if (v && im.isConnected) im.src = v; });
    renderPreview();
  }

  /* ---------------- texte à trous : aperçu du texte et réglages des trous ---------------- */
  function clozePrevHTML(q) {
    const { segs, answers } = C.clozeParse(q.src);
    if (!answers.length) return `<span class="qz-cempty">${(q.src || '').trim() ? 'Aucun trou pour l’instant : sélectionnez un mot puis « Faire un trou ».' : 'Écrivez le texte ci-dessus : l’aperçu des trous s’affiche ici.'}</span>`;
    return segs.map((sg, k) => esc(sg).replace(/\n/g, '<br>') + (k < answers.length ? `<button type="button" class="qz-chip" data-hjump="${k}" title="Régler ce trou"><i>${k + 1}</i>${esc(answers[k])}</button>` : '')).join('');
  }
  function holesHTML(holes) {
    if (!holes.length) return '';
    const dis = readOnly ? 'disabled' : '';
    const item = (k, f, x, i, ph) => `<span class="qz-hitem ${f === 'decoys' ? 'ko' : 'ok'}"><input data-hk="${k}" data-hf="${f}" data-hi="${i}" value="${esc(x)}" placeholder="${ph}" maxlength="60" ${dis}><button type="button" data-hidel title="Retirer" ${dis}>${I.x}</button></span>`;
    return `<div class="qz-label">Trous (${holes.length}) — choisissez pour chacun un menu déroulant ou une saisie libre</div><div class="qz-holes">${holes.map((h, k) => {
      const sel = h.mode === 'select';
      const list = sel ? h.decoys : h.alts;
      return `<div class="qz-holecard${sel ? ' sel' : ''}" data-hcard="${k}">
        <div class="qz-hhead"><span class="qz-hnum">${k + 1}</span><b class="qz-hans" title="Réponse attendue">${esc(h.ans)}</b>
          <button type="button" class="qz-odel" data-hdel title="Supprimer ce trou (le mot reste dans le texte)" ${dis}>${I.x}</button></div>
        <span class="qz-seg" role="group" aria-label="Type de trou"><button type="button" data-hmode="select" class="${sel ? 'on' : ''}" ${dis}>▾ Menu déroulant</button><button type="button" data-hmode="free" class="${sel ? '' : 'on'}" ${dis}>⌨ Saisie libre</button></span>
        <div class="qz-hsub">${sel ? `Le menu propose <b>${esc(h.ans)}</b> et les leurres ci-dessous, mélangés.` : `Réponse attendue : <b>${esc(h.ans)}</b>. Variantes acceptées en plus (majuscules, accents et espaces sont ignorés) :`}</div>
        <div class="qz-hlist"><span class="qz-hitem good"><span>✓ ${esc(h.ans)}</span></span>${(sel && !list.length ? [''] : list).map((x, i) => item(k, sel ? 'decoys' : 'alts', x, i, sel ? `Leurre ${i + 1}` : `Variante ${i + 1}`)).join('')}<button type="button" class="qz-hadd" data-hadd="${sel ? 'decoys' : 'alts'}" ${(list.length >= 8 || readOnly) ? 'disabled' : ''}>＋ ${sel ? 'Leurre' : 'Variante'}</button></div>
        ${sel && !C.decoysOf(h).length ? '<div class="qz-warn">Sans leurre, ce trou sera proposé en saisie libre.</div>' : ''}
      </div>`; }).join('')}</div>`;
  }
  function refreshCloze(force) {
    const q = curQ(); if (!q || q.t !== 'cloze') return;
    const pv = $('#qz-cprev'); if (pv) pv.innerHTML = clozePrevHTML(q);
    const box = $('#qz-holes'); if (!box) return;
    const sig = (q.holes || []).map(h => h.ans).join('\u0001');
    if (force || box.dataset.sig !== sig) { box.innerHTML = holesHTML(q.holes || []); box.dataset.sig = sig; }
  }
  /* position [début, fin] du trou [[…]] qui contient la position pos du texte, ou null */
  function holeAt(v, pos) {
    const re = /\[\[([^\[\]\n]{1,80}?)\]\]/g; let m;
    while ((m = re.exec(v))) { if (pos >= m.index && pos <= m.index + m[0].length) return [m.index, m.index + m[0].length]; if (m.index > pos) break; }
    return null;
  }
  function makeHole(ta) {
    const v = ta.value; let a = ta.selectionStart, b = ta.selectionEnd;
    if (holeAt(v, a) || holeAt(v, b)) { toast('Ce passage est déjà un trou'); ta.focus(); return; }
    if (a === b) { const w = ch => !!ch && /[\p{L}\p{N}’'\-]/u.test(ch); while (a > 0 && w(v[a - 1])) a--; while (b < v.length && w(v[b])) b++; }
    while (a < b && /\s/.test(v[a])) a++;
    while (b > a && /\s/.test(v[b - 1])) b--;
    while (b > a && /[.,;:!?»)]/.test(v[b - 1]) && b - a > 1) b--;   // ponctuation finale laissée hors du trou
    const sel = v.slice(a, b);
    if (!sel) { toast('Sélectionnez d’abord le mot ou l’expression à cacher'); ta.focus(); return; }
    if (/\[\[|\]\]|\n/.test(sel)) { toast('La sélection contient déjà un trou ou un saut de ligne'); ta.focus(); return; }
    if (sel.length > 80) { toast('Un trou fait au plus 80 caractères'); ta.focus(); return; }
    pushHist();
    ta.value = v.slice(0, a) + '[[' + sel + ']]' + v.slice(b);
    ta.focus(); ta.setSelectionRange(b + 4, b + 4);
    patch(q => { q.src = ta.value; q.holes = C.syncHoles(q.src, q.holes); });
    refreshCloze(); renderPreviewSoon();
  }
  function unmakeHole(ta, k) {
    const v = ta.value; let r = null;
    if (typeof k === 'number') { const re = /\[\[([^\[\]\n]{1,80}?)\]\]/g; let m, i = 0; while ((m = re.exec(v))) { if (!m[1].trim()) continue; if (i === k) { r = [m.index, m.index + m[0].length]; break; } i++; } }
    else r = holeAt(v, ta.selectionStart);
    if (!r) { toast('Placez le curseur dans un trou [[…]] pour le retirer'); ta.focus(); return; }
    pushHist();
    const inner = v.slice(r[0] + 2, r[1] - 2);
    ta.value = v.slice(0, r[0]) + inner + v.slice(r[1]);
    ta.setSelectionRange(r[0] + inner.length, r[0] + inner.length);
    patch(q => { q.src = ta.value; q.holes = C.syncHoles(q.src, q.holes); });
    refreshCloze(); renderPreviewSoon();
  }

  /* ---------------- aperçu de la question, dans le thème du quiz (on peut y répondre pour essayer) ---------------- */
  let pvOpen = (() => { try { return localStorage.getItem('alixo.quiz.preview') !== '0'; } catch { return true; } })();
  let pvTm = null;
  const pvBoxHTML = () => `<div class="qz-pvwrap${pvOpen ? ' open' : ''}" id="qz-pvwrap"><button type="button" class="qz-pvhead" data-pvtoggle><span class="qz-pvdot"></span>Aperçu sur l’écran des participants<small id="qz-pvtheme"></small><span class="qz-pvchev">▾</span></button><div class="qz-pv qz-play-scope" id="qz-pv"></div></div>`;
  function sampleCounts(q) { const w = [11, 4, 7, 3, 8, 2]; const c = {}; (q.opts || []).forEach((o, i) => { c[o.id] = w[i % w.length] * 5; }); return c; }
  function renderPreview() {
    clearTimeout(pvTm); pvTm = null;
    const box = $('#qz-pv'); const q = curQ(); const dd = d(); if (!box || !q || !dd) return;
    const th = themeOf(dd);
    box.style.cssText = C.themeStyle(th); box.dataset.qth = C.themeFx(th);
    const tn = $('#qz-pvtheme'); if (tn) { const k = th.k || 'alixo'; tn.textContent = ' · thème « ' + (k === 'custom' ? 'Personnalisé' : (C.THEMES[k] || C.THEMES.alixo).name) + ' »'; }
    if (!pvOpen) { box.innerHTML = ''; return; }
    const p = C.publicQuestion(q);
    const w = q.t === 'vote' ? C.widgetHTML(p) + C.hemicycleHTML(p, sampleCounts(q), { anim: false }) + '<div class="qz-pvnote">Hémicycle avec des votes fictifs</div>' : C.widgetHTML(p);
    box.innerHTML = `<div class="qp-q">${esc(playTitle(q))}</div><div class="qp-widget" id="qz-pvw">${w}</div>`;
    if (q.t === 'info') return;
    C.bindWidget(p, box.querySelector('#qz-pvw'), v => {
      const full = fullOf(q, p); const ww = box.querySelector('#qz-pvw'); if (!ww) return;
      const qk = Object.assign({}, q, { rkey: p._key || null });
      const fr = q.t === 'cloze' ? C.fraction(qk, v) : (C.check(qk, v) ? 1 : 0);
      const verdict = !C.isScored(q) ? 'Réponse enregistrée (aperçu)' : fr === 1 ? 'Bonne réponse' : fr > 0 ? `Partiellement juste : ${Math.round(fr * 100)} %` : 'Mauvaise réponse';
      ww.innerHTML = (q.t === 'vote' ? C.widgetHTML(full, { reveal: true, v, done: true }) + C.hemicycleHTML(p, (() => { const c = sampleCounts(q); for (const id of v) c[id] = (c[id] || 0) + 1; return c; })(), { final: true, mine: v, anim: false }) : C.widgetHTML(full, { reveal: true, v, done: true }))
        + `<div class="qz-pvres ${!C.isScored(q) ? '' : fr === 1 ? 'ok' : fr > 0 ? 'part' : 'ko'}">${verdict} · <button type="button" data-pvagain>Recommencer</button></div>`;
    });
  }
  function renderPreviewSoon() { clearTimeout(pvTm); pvTm = setTimeout(renderPreview, 350); }

  /* ---------------- modifications ---------------- */
  function addQuestion(t, at) {
    const dd = d(); if (!dd || readOnly) return;
    pushHist();
    const q = C.newQuestion(t);
    const qs = qsOf(dd);
    let i = typeof at === 'number' ? at : (cur ? qs.findIndex(x => x.id === cur) + 1 : qs.length);
    if (i < 0 || i > qs.length) i = qs.length;
    qs.splice(i, 0, q);
    cur = q.id; commit(); renderAll();
    const ta = $('#qz-edit .qz-qtext'); if (ta) ta.focus();
  }
  function deleteQuestion(id) {
    const dd = d(); if (!dd || readOnly) return;
    const qs = qsOf(dd); const i = qs.findIndex(q => q.id === id); if (i < 0) return;
    pushHist(); qs.splice(i, 1);
    if (cur === id) cur = (qs[i] || qs[i - 1] || {}).id || null;
    commit(); renderAll();
  }
  function duplicateQuestion(id) {
    const dd = d(); if (!dd || readOnly) return;
    const qs = qsOf(dd); const i = qs.findIndex(q => q.id === id); if (i < 0) return;
    pushHist();
    const c = JSON.parse(JSON.stringify(qs[i])); c.id = C.uid();
    if (Array.isArray(c.opts)) { const map = {}; for (const o of c.opts) { const n = C.uid(); map[o.id] = n; o.id = n; } if (Array.isArray(c.ans) && c.t === 'mcq') c.ans = c.ans.map(a => map[a] || a); }
    if (Array.isArray(c.pairs)) for (const p of c.pairs) p.id = C.uid();
    qs.splice(i + 1, 0, c); cur = c.id; commit(); renderAll();
  }
  function moveQuestion(id, to) {
    const dd = d(); if (!dd || readOnly) return;
    const qs = qsOf(dd); const i = qs.findIndex(q => q.id === id); if (i < 0) return;
    if (to > i) to--; if (to === i || to < 0 || to > qs.length) return;
    pushHist(); const [q] = qs.splice(i, 1); qs.splice(to, 0, q); commit(); renderList();
  }
  function patch(fn, structural) {
    const dd = d(); const q = curQ(); if (!dd || !q || readOnly) return;
    if (structural) pushHist();
    fn(q); commitSoon();
    if (structural) { renderEdit(); renderList(); } else { const c = $(`#qz-list .qz-card[data-q="${q.id}"] .qz-ctext`); if (c) c.textContent = qText(q); }
  }
  async function setImage(file) {
    const q = curQ(); if (!q || readOnly || !file || !/^image\//.test(file.type)) return;
    try {
      const im = await fileToImage(file);
      const iid = uid(); await AlixoImages.put(iid, im.data);
      patch(x => { x.img = iid; }, true);
    } catch (e) { console.error(e); toast('Image illisible'); }
  }
  /* image réduite (≤ 720 px, JPEG) pour l'envoi aux participants — la fiche live/{code} doit rester sous 1 Mio */
  async function smallImage(iid) {
    const src = await AlixoImages.get(iid); if (!src) return '';
    return new Promise(res => {
      const im = new Image();
      im.onload = () => { try { const k = Math.min(1, 720 / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72)); } catch { res(''); } };
      im.onerror = () => res('');
      im.src = src;
    });
  }

  /* ---------------- apparence : thème, musique, sons ---------------- */
  function openAppearance() {
    const dd = d(); if (!dd || readOnly) return;
    const th = themeOf(dd), mu = musicOf(dd);
    const fx = FX();
    const custom = Object.assign({ bg: '#f6f7f9', surface: '#ffffff', ink: '#202124', accent: '#33658a' }, th.k === 'custom' ? th : {});
    /* vignette : un vrai petit écran de jeu dans le thème (fond animé, typographie, couleurs des réponses) */
    const mini = tk => `<span class="qz-tprev qz-play-scope" data-qth="${C.themeFx(tk)}" style="${C.themeStyle(tk)}"><span class="qz-tq">Question ?</span><span class="qz-tans">${[0, 1, 2, 3].map(i => `<span class="qz-ta" style="--oc:var(--qp-c${i})"><span class="qz-tl">${C.letter(i)}</span><span class="qz-tbar"></span></span>`).join('')}</span></span>`;
    const tile = (k, t) => `<button type="button" class="set-tile qz-tile ${th.k === k ? 'on' : ''}" data-theme="${k}">${mini({ k })}<b>${esc(t.name)}${t.fx ? '<small class="qz-tnew">signature</small>' : ''}</b><span>${esc(t.sub)}</span></button>`;
    const entries = Object.entries(C.THEMES);
    const tiles = `<div class="qz-tgroup">Thèmes signature : fonds animés, typographies et couleurs propres</div><div class="set-tiles qz-tiles">${entries.filter(([, t]) => t.fx).map(([k, t]) => tile(k, t)).join('')}</div>
      <div class="qz-tgroup">Thèmes unis</div><div class="set-tiles qz-tiles">${entries.filter(([, t]) => !t.fx).map(([k, t]) => tile(k, t)).join('')}`
      + `<button type="button" class="set-tile qz-tile ${th.k === 'custom' ? 'on' : ''}" data-theme="custom"><span id="qz-custprev">${mini(Object.assign({}, custom, { k: 'custom' }))}</span><b>Personnalisé</b><span>Vos couleurs</span></button></div>`;
    const fontSel = th.font || '';
    const body = `<div class="qz-look">
      <div class="set-sect"><h3>Thème</h3>${tiles}
        <div class="qz-custom" id="qz-custom" ${th.k === 'custom' ? '' : 'hidden'}>
          <label>Fond <input type="color" data-c="bg" value="${esc(custom.bg)}"></label>
          <label>Cartes <input type="color" data-c="surface" value="${esc(custom.surface)}"></label>
          <label>Texte <input type="color" data-c="ink" value="${esc(custom.ink)}"></label>
          <label>Accent <input type="color" data-c="accent" value="${esc(custom.accent)}"></label>
        </div>
        <label class="set-inline" style="margin-top:10px">Police <select id="qz-font"><option value="" ${fontSel ? '' : 'selected'}>Celle du thème</option>${Object.entries(C.FONT_NAMES).map(([k, n]) => `<option value="${k}" ${fontSel === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <div class="qz-lprev qz-play-scope" id="qz-lprev" data-qth="${C.themeFx(th)}" style="${C.themeStyle(th)}"><div class="qp-q" style="font-size:20px;margin:6px 0 10px">Aperçu : quelle est la capitale de l’Australie ?</div>${C.widgetHTML({ t: 'mcq', opts: [{ id: 'a', text: 'Sydney' }, { id: 'b', text: 'Canberra' }, { id: 'c', text: 'Melbourne' }, { id: 'd', text: 'Perth' }], ans: ['b'] }, { reveal: true, v: ['a'], done: true })}</div>
      </div>
      <div class="set-sect"><h3>Musique de fond</h3><p class="set-help">Jouée sur l’écran du présentateur (et pendant un test), pas sur les téléphones. Les musiques de base sont générées par Alixo : rien à télécharger.</p>
        <div class="qz-tracks">${Object.entries(fx ? fx.TRACKS : {}).map(([k, t]) => `<label class="qz-track ${mu.k === k ? 'on' : ''}"><input type="radio" name="qz-music" value="${k}" ${mu.k === k ? 'checked' : ''}><span class="qz-trk"><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></span>${k !== 'none' && k !== 'file' ? `<button type="button" class="qz-tplay" data-prev="${k}" title="Écouter quelques secondes">▶</button>` : ''}${k === 'file' ? `<span class="qz-tfile"><input type="file" id="qz-mfile" accept="audio/*" hidden><button type="button" class="cta ghost small" data-mfile>Choisir…</button><small id="qz-mname">${esc(mu.name || 'Aucun fichier')}</small></span>` : ''}</label>`).join('')}</div>
        <label class="set-inline" style="margin-top:10px">Volume <input type="range" id="qz-vol" min="0" max="1" step="0.05" value="${esc(mu.vol == null ? 0.5 : mu.vol)}" style="width:160px"></label>
        <label class="set-inline" style="margin-top:6px"><input type="checkbox" id="qz-sfx" ${mu.sfx === false ? '' : 'checked'}> Sons : dernières secondes, révélation, bonne / mauvaise réponse, arrivée d’un participant</label>
      </div></div>`;
    openDialog({ id: 'qz-look', cls: 'wide', eyebrow: 'Quiz', title: 'Apparence', sub: 'Le thème s’applique à l’écran du présentateur, au test et aux téléphones des participants.', body, onClose: () => { if (fx) fx.stop(); }, onMount: card => {
      const prev = card.querySelector('#qz-lprev');
      const saveTheme = () => { commit(); renderBar(); prev.style.cssText = C.themeStyle(themeOf(dd)); prev.dataset.qth = C.themeFx(themeOf(dd)); renderPreview(); };
      card.addEventListener('click', e => {
        /* 1.28.1 : vignettes seulement — `[data-theme]` seul remontait jusqu'à <html data-theme="…"> : tout clic dans la
           fenêtre (bouton « Choisir… » du fichier audio, aperçu ▶ des musiques) était pris pour un choix de thème */
        const t = e.target.closest('.qz-tile[data-theme]');
        if (t && card.contains(t)) {
          const k = t.dataset.theme;
          card.querySelectorAll('.qz-tile[data-theme]').forEach(b => b.classList.toggle('on', b === t));
          card.querySelector('#qz-custom').hidden = k !== 'custom';
          /* chaque thème arrive avec sa typographie : la police revient à « celle du thème » */
          const fs = card.querySelector('#qz-font'); if (k !== 'custom') fs.value = '';
          const font = fs.value;
          dd.theme = k === 'custom' ? Object.assign({ k: 'custom' }, custom, { k: 'custom' }, font ? { font } : {}) : Object.assign({ k }, font ? { font } : {});
          saveTheme(); return;
        }
        const p = e.target.closest('[data-prev]'); if (p && fx) { fx.setVolume(+card.querySelector('#qz-vol').value); fx.preview(p.dataset.prev, dd.id); return; }
        if (e.target.closest('[data-mfile]')) { card.querySelector('#qz-mfile').click(); }
      });
      card.querySelectorAll('[data-c]').forEach(inp => inp.addEventListener('input', () => { custom[inp.dataset.c] = inp.value; const font = card.querySelector('#qz-font').value; dd.theme = Object.assign({}, custom, { k: 'custom' }, font ? { font } : {}); const cp = card.querySelector('#qz-custprev'); if (cp) cp.innerHTML = mini(Object.assign({}, custom, { k: 'custom' })); saveTheme(); }));
      card.querySelector('#qz-font').addEventListener('change', e => { const t = Object.assign({}, themeOf(dd)); if (e.target.value) t.font = e.target.value; else delete t.font; dd.theme = t; saveTheme(); });
      card.querySelectorAll('input[name="qz-music"]').forEach(r => r.addEventListener('change', () => { card.querySelectorAll('.qz-track').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)); dd.music = Object.assign({}, musicOf(dd), { k: r.value }); commit(); if (fx) { if (r.value === 'none') fx.stop(); else fx.preview(r.value, dd.id); } }));
      card.querySelector('#qz-vol').addEventListener('input', e => { dd.music = Object.assign({}, musicOf(dd), { vol: +e.target.value }); if (fx) fx.setVolume(+e.target.value); commitSoon(); });
      card.querySelector('#qz-sfx').addEventListener('change', e => { dd.music = Object.assign({}, musicOf(dd), { sfx: e.target.checked }); commit(); if (fx && e.target.checked) fx.sfx('reveal'); });
      const mf = card.querySelector('#qz-mfile');
      if (mf) mf.addEventListener('change', async () => {
        const f = mf.files && mf.files[0]; if (!f || !fx) return;
        if (f.size > 25 * 1024 * 1024) { toast('Fichier trop lourd (25 Mo maximum)'); return; }
        try { await fx.storeFile(dd.id, f); dd.music = Object.assign({}, musicOf(dd), { k: 'file', name: f.name }); commit(); card.querySelector('#qz-mname').textContent = f.name; const r = card.querySelector('input[name="qz-music"][value="file"]'); if (r) { r.checked = true; r.dispatchEvent(new Event('change')); } }
        catch (e) { console.error(e); toast('Fichier audio non enregistré'); }
      });
    } });
  }

  /* ---------------- liaison des événements ---------------- */
  function bind() {
    if (bound) return; bound = true;
    const view = $('#view-quiz');
    $('#qz-bar').addEventListener('click', e => {
      const b = e.target.closest('[data-qz]'); if (!b) return;
      const a = b.dataset.qz;
      if (a === 'undo') undo(); else if (a === 'redo') redo();
      else if (a === 'test') startTest(); else if (a === 'live') startLive();
      else if (a === 'results') openResults(); else if (a === 'pdf') exportPDF(); else if (a === 'look') openAppearance();
      else if (a === 'alx') { if (window.AlixoAlx) AlixoAlx.exportDoc(currentDocId); }
      else if (a === 'dl') { if (window.AlixoApp && AlixoApp.openExportMenu) AlixoApp.openExportMenu(b); else exportPDF(); }   // 1.40 : petite fenêtre des formats
    });
    /* palette : clic = ajouter après la question ouverte ; glisser = déposer dans la liste */
    $('#qz-palette').addEventListener('click', e => { const t = e.target.closest('[data-type]'); if (t) addQuestion(t.dataset.type); });
    $('#qz-palette').addEventListener('dragstart', e => { const t = e.target.closest('[data-type]'); if (!t) return; dragType = t.dataset.type; dragQ = null; e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', 'qz:' + dragType); } catch { /* */ } });
    $('#qz-palette').addEventListener('dragend', () => { dragType = null; clearDrop(); });
    /* liste : sélection, suppression, duplication, réordonnancement */
    const list = $('#qz-list');
    list.addEventListener('click', e => {
      const card = e.target.closest('.qz-card'); if (!card) return;
      if (e.target.closest('[data-cdel]')) { deleteQuestion(card.dataset.q); return; }
      if (e.target.closest('[data-cdup]')) { duplicateQuestion(card.dataset.q); return; }
      if (cur !== card.dataset.q) { cur = card.dataset.q; renderList(); renderEdit(); }
    });
    list.addEventListener('dragstart', e => { const card = e.target.closest('.qz-card'); if (!card || readOnly) { e.preventDefault(); return; } dragQ = card.dataset.q; dragType = null; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'qz:move'); } catch { /* */ } });
    list.addEventListener('dragend', () => { dragQ = null; clearDrop(); });
    list.addEventListener('dragover', e => {
      if (!dragQ && !dragType) return;
      e.preventDefault(); e.dataTransfer.dropEffect = dragQ ? 'move' : 'copy';
      clearDrop();
      const card = e.target.closest('.qz-card');
      if (card) { const r = card.getBoundingClientRect(); card.classList.add(e.clientY < r.top + r.height / 2 ? 'over-up' : 'over-down'); }
      else { const end = e.target.closest('[data-drop-end]') || list.querySelector('[data-drop-end]'); if (end) end.classList.add('over'); }
    });
    list.addEventListener('dragleave', e => { if (!list.contains(e.relatedTarget)) clearDrop(); });
    list.addEventListener('drop', e => {
      if (!dragQ && !dragType) return;
      e.preventDefault();
      const dd = d(); const qs = qsOf(dd);
      const card = e.target.closest('.qz-card');
      let to = qs.length;
      if (card) { const r = card.getBoundingClientRect(); to = qs.findIndex(q => q.id === card.dataset.q) + (e.clientY < r.top + r.height / 2 ? 0 : 1); }
      if (dragType) addQuestion(dragType, to); else if (dragQ) moveQuestion(dragQ, to);
      dragQ = null; dragType = null; clearDrop();
    });
    /* éditeur de la question */
    const ed = $('#qz-edit');
    ed.addEventListener('input', e => {
      if (e.target.closest('#qz-pvwrap')) return;   // champs de l'aperçu : rien à enregistrer
      const f = e.target.dataset.f;
      renderPreviewSoon();
      if (f === 'text') { patch(q => { q.text = e.target.value; }); return; }
      if (f === 'src') { patch(q => { q.src = e.target.value; q.holes = C.syncHoles(q.src, q.holes); }); refreshCloze(); return; }
      if (e.target.dataset.hf) { const k = +e.target.dataset.hk, hf = e.target.dataset.hf, hi = +e.target.dataset.hi; patch(q => { q.holes = C.syncHoles(q.src, q.holes); const h = q.holes[k]; if (!h) return; if (!Array.isArray(h[hf])) h[hf] = []; h[hf][hi] = e.target.value; }); return; }
      if (e.target.matches('[data-ocolor]')) { const row = e.target.closest('.qz-opt'); row.style.setProperty('--oc', e.target.value); patch(q => { const op = (q.opts || []).find(o => o.id === row.dataset.opt); if (op) op.color = e.target.value; }); return; }
      if (f === 'body' || f === 'unit' || f === 'lo' || f === 'hi') { patch(q => { q[f] = e.target.value; }); return; }
      if (e.target.classList.contains('qz-otext')) {
        const row = e.target.closest('.qz-opt');
        if (row.dataset.pair) patch(q => { const p = (q.pairs || []).find(x => x.id === row.dataset.pair); if (p) p[e.target.dataset.pf] = e.target.value; });
        else if (row.dataset.ans !== undefined) patch(q => { if (!Array.isArray(q.ans)) q.ans = []; q.ans[+row.dataset.ans] = e.target.value; });
        else patch(q => { const op = (q.opts || []).find(o => o.id === row.dataset.opt); if (op) op.text = e.target.value; });
        return;
      }
      if (['min', 'max', 'step', 'ans', 'tol'].includes(f)) patch(q => { const v = parseFloat(e.target.value); if (!isNaN(v)) q[f] = v; });
    });
    ed.addEventListener('change', e => {
      if (e.target.closest('#qz-pvwrap')) return;
      const f = e.target.dataset.f;
      if (e.target.dataset.hf || e.target.matches('[data-ocolor]')) { pushHist(); return; }
      if (f === 'time' || f === 'points') { patch(q => { q[f] = +e.target.value; }, true); return; }
      if (e.target.matches('[data-multi]')) { patch(q => { q.multi = e.target.checked; if (!q.multi && Array.isArray(q.ans) && q.ans.length > 1) q.ans = q.ans.slice(0, 1); }, true); return; }
      if (e.target.matches('#qz-imgfile')) { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (file) setImage(file); return; }
      if (f === 'text' || f === 'body' || f === 'src' || e.target.classList.contains('qz-otext') || ['min', 'max', 'step', 'ans', 'tol', 'unit', 'lo', 'hi'].includes(f)) pushHist();   // un point d'annulation par champ modifié
    });
    /* « Faire un trou » : le bouton ne doit pas retirer la sélection du texte */
    ed.addEventListener('mousedown', e => { if (e.target.closest('[data-mkhole], [data-unhole]')) e.preventDefault(); });
    ed.addEventListener('click', e => {
      const pvw = e.target.closest('#qz-pvwrap');
      if (pvw) {
        if (e.target.closest('[data-pvtoggle]')) { pvOpen = !pvOpen; try { localStorage.setItem('alixo.quiz.preview', pvOpen ? '1' : '0'); } catch { /* */ } pvw.classList.toggle('open', pvOpen); renderPreview(); }
        else if (e.target.closest('[data-pvagain]')) renderPreview();
        return;
      }
      const jump = e.target.closest('[data-hjump]');
      if (jump) { const c = ed.querySelector(`[data-hcard="${jump.dataset.hjump}"]`); if (c) { c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); const inp = c.querySelector('input'); if (inp && !readOnly) inp.focus({ preventScroll: true }); } return; }
      if (readOnly) return;
      if (e.target.closest('[data-mkhole]')) { const ta = ed.querySelector('.qz-csrc'); if (ta) makeHole(ta); return; }
      if (e.target.closest('[data-unhole]')) { const ta = ed.querySelector('.qz-csrc'); if (ta) unmakeHole(ta); return; }
      const hcard = e.target.closest('[data-hcard]');
      if (hcard) {
        const k = +hcard.dataset.hcard;
        const hm = e.target.closest('[data-hmode]');
        if (hm) { patch(q => { q.holes = C.syncHoles(q.src, q.holes); if (q.holes[k]) q.holes[k].mode = hm.dataset.hmode; }, true); renderPreviewSoon(); return; }
        const ha = e.target.closest('[data-hadd]');
        if (ha) { const f = ha.dataset.hadd; patch(q => { q.holes = C.syncHoles(q.src, q.holes); const h = q.holes[k]; if (!h) return; if (!Array.isArray(h[f])) h[f] = []; if (f === 'decoys' && !h[f].length) h[f].push(''); if (h[f].length < 8) h[f].push(''); }, true); const c = ed.querySelector(`[data-hcard="${k}"]`); const ins = c ? c.querySelectorAll('input') : []; if (ins.length) ins[ins.length - 1].focus(); return; }
        const hd = e.target.closest('[data-hidel]');
        if (hd) { const inp = hd.parentElement.querySelector('input'); const f = inp.dataset.hf, i = +inp.dataset.hi; patch(q => { q.holes = C.syncHoles(q.src, q.holes); const h = q.holes[k]; if (h && Array.isArray(h[f])) h[f].splice(i, 1); }, true); renderPreviewSoon(); return; }
        if (e.target.closest('[data-hdel]')) { const ta = ed.querySelector('.qz-csrc'); if (ta) unmakeHole(ta, k); return; }
        return;
      }
      const vp = e.target.closest('[data-vpreset]');
      if (vp) { const pr = VOTE_PRESETS.find(x => x[0] === vp.dataset.vpreset); if (pr) { patch(q => { (q.opts || []).forEach((o, i) => { o.color = pr[2][i % pr[2].length]; }); }, true); renderPreviewSoon(); } return; }
      if (e.target.closest('[data-img]')) { let inp = $('#qz-imgfile'); if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'qz-imgfile'; inp.hidden = true; ed.appendChild(inp); } inp.value = ''; inp.click(); return; }
      if (e.target.closest('[data-imgdel]')) { patch(q => { delete q.img; }, true); return; }
      if (e.target.closest('[data-oadd]')) { patch(q => { if ((q.opts || []).length >= MAX_OPTS) return; const o = { id: C.uid(), text: '' }; if (q.t === 'vote') { const used = new Set(q.opts.map((x, i) => C.voteColor(x, i).toLowerCase())); o.color = C.VOTE_COLORS.find(c => !used.has(c.toLowerCase())) || C.VOTE_COLORS[q.opts.length % C.VOTE_COLORS.length]; } q.opts.push(o); }, true); renderPreviewSoon(); const rows = ed.querySelectorAll('.qz-opt .qz-otext'); if (rows.length) rows[rows.length - 1].focus(); return; }
      if (e.target.closest('[data-padd]')) { patch(q => { if (!Array.isArray(q.pairs)) q.pairs = []; if (q.pairs.length < MAX_OPTS) q.pairs.push({ id: C.uid(), l: '', r: '' }); }, true); const rows = ed.querySelectorAll('.qz-pair [data-pf="l"]'); if (rows.length) rows[rows.length - 1].focus(); return; }
      if (e.target.closest('[data-aadd]')) { patch(q => { if (!Array.isArray(q.ans)) q.ans = []; if (q.ans.length < 8) q.ans.push(''); }, true); const rows = ed.querySelectorAll('.qz-opt .qz-otext'); if (rows.length) rows[rows.length - 1].focus(); return; }
      const tf = e.target.closest('[data-tf]'); if (tf) { patch(q => { q.ans = tf.dataset.tf === '1'; }, true); return; }
      const row = e.target.closest('.qz-opt'); if (!row) return;
      if (e.target.closest('[data-pdel]')) { patch(q => { if ((q.pairs || []).length <= 2) return; q.pairs = q.pairs.filter(p => p.id !== row.dataset.pair); }, true); return; }
      if (e.target.closest('[data-ook]')) { patch(q => { if (!Array.isArray(q.ans)) q.ans = []; const id = row.dataset.opt; if (q.ans.includes(id)) q.ans = q.ans.filter(x => x !== id); else q.ans = q.multi ? [...q.ans, id] : [id]; }, true); return; }
      if (e.target.closest('[data-odel]')) { patch(q => { if (q.opts.length <= 2) return; q.opts = q.opts.filter(o => o.id !== row.dataset.opt); if (Array.isArray(q.ans) && q.t === 'mcq') q.ans = q.ans.filter(a => a !== row.dataset.opt); }, true); return; }
      if (e.target.closest('[data-adel]')) { patch(q => { if (!Array.isArray(q.ans) || q.ans.length <= 1) return; q.ans.splice(+row.dataset.ans, 1); }, true); return; }
      const mv = e.target.closest('[data-omv]'); if (mv) { patch(q => { const i = q.opts.findIndex(o => o.id === row.dataset.opt); const j = i + (+mv.dataset.omv); if (i < 0 || j < 0 || j >= q.opts.length) return; [q.opts[i], q.opts[j]] = [q.opts[j], q.opts[i]]; }, true); }
    });
    ed.addEventListener('dragover', e => { if (readOnly) return; if ([...(e.dataTransfer.items || [])].some(x => x.kind === 'file')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    ed.addEventListener('drop', e => { if (readOnly) return; const f = [...(e.dataTransfer.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); setImage(f); } });
    /* clavier (la vue a le focus quand aucun champ n'est actif) */
    view.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.altKey && e.key === 'ArrowLeft' && !mod) { e.preventDefault(); showLibrary(); return; }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); exportPDF(); return; }
      if (e.key === 'F5') { e.preventDefault(); startTest(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && cur && !readOnly) { e.preventDefault(); deleteQuestion(cur); }
    });
    document.addEventListener('keydown', e => { if (active() && play().hidden && e.key === 'F5' && !e.target.matches('input, textarea, select')) { e.preventDefault(); startTest(); } });
  }
  function clearDrop() { $$('#qz-list .over-up, #qz-list .over-down, #qz-list .over, #qz-list .dragging').forEach(x => x.classList.remove('over-up', 'over-down', 'over', 'dragging')); }

  /* ============================================================
     Écran de jeu (overlay #qz-play) : commun au test local et au direct
     ============================================================ */
  const play = () => $('#qz-play');
  function openPlay(cls) {
    const dd = d();
    const ov = play(); ov.hidden = false; ov.className = 'qz-play ' + cls; ov.innerHTML = '';
    ov.style.cssText = C.themeStyle(themeOf(dd));
    ov.dataset.qth = C.themeFx(themeOf(dd));
    document.body.classList.add('qz-playing');
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement && cls === 'qz-live') document.documentElement.requestFullscreen().catch(() => {}); } catch { /* */ }
    const fx = FX(); const mu = musicOf(dd);
    if (fx) { fx.setVolume(mu.vol == null ? 0.5 : mu.vol); if (mu.k && mu.k !== 'none') fx.play(mu.k, dd.id); }
    if (!ov.dataset.bound) {
      ov.dataset.bound = '1';
      document.addEventListener('keydown', e => {
        if (play().hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); if (live) closeLive(); else closeTest(); return; }
        if (e.target.matches('input, textarea, select')) return;
        if (e.key.toLowerCase() === 'm') { e.preventDefault(); toggleSound(); return; }
        if (live && (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter')) { e.preventDefault(); liveNext(); return; }
        if (test && (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter')) { const b = play().querySelector('[data-next]'); if (b) { e.preventDefault(); b.click(); } }
      });
    }
  }
  function closePlay() {
    const ov = play(); ov.hidden = true; ov.innerHTML = ''; ov.className = 'qz-play'; ov.style.cssText = ''; delete ov.dataset.qth;
    document.body.classList.remove('qz-playing');
    const fx = FX(); if (fx) fx.stop();
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* */ }
  }
  const sfxOn = () => { const fx = FX(); return fx && musicOf(d()).sfx !== false ? fx : null; };
  const sfx = name => { const fx = sfxOn(); if (fx) fx.sfx(name); };
  function toggleSound() { const fx = FX(); if (!fx) return; const m = fx.toggleMute(); const b = play().querySelector('.qp-sound'); if (b) { b.classList.toggle('off', m); b.innerHTML = m ? I.mute : I.sound; b.title = m ? 'Son coupé (M)' : 'Couper le son (M)'; } }
  const soundBtn = () => { const fx = FX(); if (!fx) return ''; const m = fx.isMuted(); return `<button type="button" class="qp-sound${m ? ' off' : ''}" data-sound title="${m ? 'Son coupé (M)' : 'Couper le son (M)'}">${m ? I.mute : I.sound}</button>`; };
  function timerHTML(left, total) {
    if (!total) return '<span class="qp-timer none">∞</span>';
    const f = Math.max(0, Math.min(1, left / total));
    return `<span class="qp-timer${left <= 5 ? ' low' : ''}" style="--f:${f.toFixed(3)}"><b>${Math.ceil(left)}</b></span>`;
  }
  const progressHTML = (i, n) => `<div class="qp-progress"><i style="--p:${n ? Math.round(((i + 1) / n) * 100) : 0}%"></i></div>`;
  /* image de la question : chargée puis insérée (test local) ou déjà en data URL (direct) */
  function imgHTML(q, pub) {
    const src = pub && pub.img ? pub.img : '';
    if (src) return `<img class="qp-qimg" src="${esc(src)}" alt="">`;
    if (q && q.img) return `<img class="qp-qimg" data-iid="${esc(q.img)}" alt="" hidden>`;
    return '';
  }
  function loadImgs(root) { root.querySelectorAll('.qp-qimg[data-iid]').forEach(im => AlixoImages.get(im.dataset.iid).then(v => { if (v && im.isConnected) { im.src = v; im.hidden = false; } })); }
  /* tic des dernières secondes */
  let lastTick = -1;
  function tickCheck(left) { const s = Math.ceil(left); if (s <= 5 && s >= 1 && s !== lastTick) { lastTick = s; sfx('tick'); } }

  /* ---------------- test local ---------------- */
  function startTest() {
    const dd = d(); if (!dd) return;
    const qs = qsOf(dd).filter(playable);
    if (!qs.length) { toast('Ajoutez au moins une question avec un texte avant de tester'); return; }
    if (live) { toast('Une présentation en direct est en cours'); return; }
    test = { qs, i: 0, score: 0, ok: 0, answers: {}, timer: null, shownAt: 0, answered: false };
    openPlay('qz-test');
    renderTestQ();
  }
  function renderTestQ() {
    const ov = play(); const q = test.qs[test.i]; const p = C.publicQuestion(q);
    test.answered = false; test.shownAt = Date.now(); test.pub = p; lastTick = -1;
    const nq = test.qs.filter(C.isScored).length;
    if (q.t === 'info') {
      ov.innerHTML = `<div class="qp-top"><span class="qp-prog">Page ${test.i + 1} / ${test.qs.length}</span><span class="qp-score">${fmtPts(test.score)} pts</span>${soundBtn()}<button type="button" class="qp-x" data-close title="Quitter (Échap)">${I.x}</button></div>${progressHTML(test.i, test.qs.length)}
        <div class="qp-body qp-page-wrap">${imgHTML(q)}<div class="qp-q">${esc(qText(q))}</div>${C.widgetHTML(p)}</div>
        <div class="qp-ctrl"><button type="button" class="qp-next" data-next>${test.i + 1 < test.qs.length ? 'Continuer →' : 'Voir le résultat'} <kbd>Espace</kbd></button></div>`;
      loadImgs(ov);
      ov.querySelector('[data-close]').addEventListener('click', closeTest);
      ov.querySelector('[data-next]').addEventListener('click', () => { if (test.i + 1 < test.qs.length) { test.i++; renderTestQ(); } else endTest(); });
      const sb = ov.querySelector('[data-sound]'); if (sb) sb.addEventListener('click', toggleSound);
      sfx('page');
      return;
    }
    ov.innerHTML = `<div class="qp-top"><span class="qp-prog">Question ${test.i + 1} / ${test.qs.length}</span><span class="qp-ptype">${C.TYPES[q.t] ? esc(C.TYPES[q.t].name) : ''}${C.isScored(q) ? '' : ' · sans points'}</span><span class="qp-score">${fmtPts(test.score)} pts</span><span id="qp-timer">${timerHTML(q.time, q.time)}</span>${soundBtn()}<button type="button" class="qp-x" data-close title="Quitter (Échap)">${I.x}</button></div>${progressHTML(test.i, test.qs.length)}
      <div class="qp-body">${imgHTML(q)}<div class="qp-q">${esc(playTitle(q))}</div>
      <div class="qp-widget" id="qp-widget">${C.widgetHTML(p)}</div></div>
      <div class="qp-foot">Test sur cet appareil · ${nq} question${nq > 1 ? 's' : ''} notée${nq > 1 ? 's' : ''}</div>`;
    loadImgs(ov);
    ov.querySelector('[data-close]').addEventListener('click', closeTest);
    const sb = ov.querySelector('[data-sound]'); if (sb) sb.addEventListener('click', toggleSound);
    C.bindWidget(p, ov.querySelector('#qp-widget'), v => testAnswer(v));
    clearInterval(test.timer);
    if (q.time) {
      const end = test.shownAt + q.time * 1000;
      test.timer = setInterval(() => { const left = (end - Date.now()) / 1000; const t = $('#qp-timer'); if (t) t.innerHTML = timerHTML(left, q.time); tickCheck(left); if (left <= 0) { clearInterval(test.timer); testAnswer(null); } }, 200);
    }
  }
  function testAnswer(v) {
    if (!test || test.answered) return;
    test.answered = true; clearInterval(test.timer);
    const q = test.qs[test.i]; const el = Date.now() - test.shownAt;
    const qk = Object.assign({}, q, { rkey: test.pub._key || null });
    const ok = C.check(qk, v);
    const fr = q.t === 'cloze' ? C.fraction(qk, v) : (ok ? 1 : 0);
    const pts = C.points(q, el, q.t === 'cloze' ? fr : ok);
    test.score += pts; if (ok) test.ok++;
    const vs = q.t === 'match' && v && test.pub._key ? Object.fromEntries(Object.entries(v).map(([l, r]) => [l, test.pub._key[r] || r])) : v;   // association : identifiants des paires, lisibles plus tard
    test.answers[q.id] = { v: vs, ok, pts, el };
    if (q.t === 'cloze') test.answers[q.id].fr = Math.round(fr * 1000) / 1000;
    const sc = play().querySelector('.qp-score'); if (sc) sc.textContent = fmtPts(test.score) + ' pts';
    const ov = play();
    const full = fullOf(q, test.pub);
    const unscored = !C.isScored(q);
    let wh = unscored && !C.isChoice(q) ? `<div class="qp-good">Votre réponse : <b>${esc(C.answerText(full, v))}</b></div>` : C.widgetHTML(full, { reveal: true, v, done: true });
    if (q.t === 'vote') {
      /* l'hémicycle réunit les votes des tests faits sur cet appareil (et celui-ci) */
      const prev = resOf(d()).filter(r => r.mode === 'test' && r.answers && r.answers[q.id] && r.answers[q.id].v).map(r => r.answers[q.id].v);
      wh = `<div class="qp-hemi-wrap">${C.hemicycleHTML(test.pub, tally(q, v ? [...prev, v] : prev), { final: true, mine: v })}<div class="qp-hnote">Votes des tests faits sur cet appareil${prev.length ? '' : ' : le vôtre est le premier'}</div></div>`;
    }
    ov.querySelector('#qp-widget').innerHTML = wh;
    const nh = q.t === 'cloze' ? C.clozeHoles(q).length : 0;
    const part = q.t === 'cloze' && !ok && fr > 0;
    const fb = document.createElement('div'); fb.className = 'qp-fb ' + (unscored ? 'poll' : ok ? 'ok' : v === null ? 'late' : part ? 'part' : 'ko');
    fb.innerHTML = `<div class="qp-fbt">${unscored ? 'Merci pour votre réponse' : ok ? 'Bonne réponse !' : v === null ? 'Temps écoulé' : part ? 'Presque !' : 'Mauvaise réponse'}</div>${unscored ? '' : `<div class="qp-fbp">${ok ? '+ ' + fmtPts(pts) + ' pts · ' + fmtSec(el) : part ? `${Math.round(fr * nh)} trou${Math.round(fr * nh) > 1 ? 's' : ''} juste${Math.round(fr * nh) > 1 ? 's' : ''} sur ${nh} · + ${fmtPts(pts)} pts` : q.t === 'cloze' ? 'Les bonnes réponses sont dans le texte ci-dessus' : 'Bonne réponse : <b>' + esc(C.correctText(full)) + '</b>'}</div>`}<button type="button" class="qp-next" data-next>${test.i + 1 < test.qs.length ? 'Suivant →' : 'Voir le résultat'} <kbd>Espace</kbd></button>`;
    ov.querySelector('.qp-widget').after(fb);
    fb.querySelector('[data-next]').addEventListener('click', () => { if (test.i + 1 < test.qs.length) { test.i++; renderTestQ(); } else endTest(); });
    fb.querySelector('[data-next]').focus();
    if (!unscored) sfx(ok ? 'ok' : v === null ? 'late' : 'ko'); else sfx('reveal');
  }
  function endTest() {
    const dd = d(); if (!dd || !test) return;
    const n = test.qs.length, scored = test.qs.filter(C.isScored).length;
    const els = Object.values(test.answers).filter(a => a.v !== null).map(a => a.el);
    const rec = { id: uid(), mode: 'test', at: Date.now(), name: 'Moi', score: test.score, ok: test.ok, n: scored, answers: test.answers, meanEl: els.length ? Math.round(els.reduce((a, b) => a + b, 0) / els.length) : null };
    if (!readOnly) { resOf(dd).push(rec); commit(); renderBar(); }
    const ov = play();
    const pct = scored ? Math.round(test.ok / scored * 100) : 0;
    ov.innerHTML = `<div class="qp-top"><span class="qp-prog">Résultat</span>${soundBtn()}<button type="button" class="qp-x" data-close title="Fermer (Échap)">${I.x}</button></div>
      <div class="qp-body"><div class="qp-end"><div class="qp-endscore">${fmtPts(test.score)}<small>points</small></div>
      <div class="qp-kpis"><div class="qp-kpi"><b>${test.ok} / ${scored}</b><small>bonnes réponses</small></div><div class="qp-kpi"><b>${pct} %</b><small>de réussite</small></div><div class="qp-kpi"><b>${fmtSec(rec.meanEl)}</b><small>temps moyen</small></div>${n > scored ? `<div class="qp-kpi"><b>${n - scored}</b><small>sans points</small></div>` : ''}</div>
      <div class="qp-endlist">${test.qs.map((q, i) => { const a = test.answers[q.id] || {}; const un = !C.isScored(q); return `<div class="qp-endrow ${un ? '' : a.ok ? 'ok' : a.pts > 0 ? 'part' : 'ko'}" style="--i:${i}"><span>${i + 1}</span><span class="qp-endq">${esc(qText(q))}</span><span class="qp-enda">${q.t === 'info' ? 'page' : esc(C.answerText(Object.assign({}, q, { rkey: null }), a.v))}</span><span class="qp-endp">${un ? '—' : a.pts > 0 ? '+' + fmtPts(a.pts) : '✗'}</span></div>`; }).join('')}</div>
      <div class="qp-ctrl"><button type="button" class="qp-next" data-again>Rejouer</button><button type="button" class="qp-next ghost" data-close>Fermer</button></div>
      <div class="qp-foot">${readOnly ? 'Quiz en lecture seule : le résultat n’est pas enregistré.' : 'Résultat enregistré (bouton Résultats).'}</div></div></div>`;
    ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeTest));
    ov.querySelector('[data-again]').addEventListener('click', () => { closeTest(); startTest(); });
    const sb = ov.querySelector('[data-sound]'); if (sb) sb.addEventListener('click', toggleSound);
    sfx('end');
  }
  function closeTest() { if (test) clearInterval(test.timer); test = null; closePlay(); }

  /* ============================================================
     Présentation en direct (hôte)
     ============================================================ */
  const dbOk = () => !!(window.firebase && firebase.firestore && window.AlixoAuth && AlixoAuth.isConfigured && AlixoAuth.account());
  const liveRef = () => firebase.firestore().collection('live').doc(live.code);
  const genCode = () => String(Math.floor(100000 + Math.random() * 900000));
  function qrSvg(url) {
    try {
      const q = qrcode(0, 'M'); q.addData(url); q.make(); const n = q.getModuleCount();
      let p = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c} ${r}h1v1h-1z`;
      return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${p}" fill="currentColor"/></svg>`;
    } catch { return ''; }
  }
  async function startLive() {
    const dd = d(); if (!dd) return;
    if (!dbOk()) { toast('Présenter en direct demande un compte Alixo connecté (Paramètres › Compte)', { duration: 6000 }); return; }
    const qs = qsOf(dd).filter(playable);
    if (!qs.length) { toast('Ajoutez au moins une question avant de présenter'); return; }
    if (live) { toast('Une présentation est déjà en cours'); return; }
    const db = firebase.firestore();
    const me = AlixoAuth.account();
    let code = genCode();
    for (let k = 0; k < 5; k++) { try { const s = await db.collection('live').doc(code).get(); if (!s.exists) break; } catch { break; } code = genCode(); }
    const theme = C.resolveTheme(themeOf(dd));
    live = { code, qs, i: -1, state: 'lobby', players: new Map(), unsub: null, timer: null, qStart: 0, qEnd: 0, pub: null, busy: false, err: '', prevRank: new Map(), qstats: [], joined: 0 };
    try {
      await db.collection('live').doc(code).set({ code, host: me.uid, hostName: me.name || me.email || 'Présentateur', title: dd.titre || 'Quiz', n: qs.length, state: 'lobby', qi: -1, q: null, qStart: 0, qEnd: 0, answer: null, stats: null, top: [], theme, createdAt: Date.now(), updatedAt: Date.now() });
    } catch (e) {
      live = null;
      console.error('Quiz en direct :', e);
      toast('Impossible de créer la partie : ' + (e && e.code === 'permission-denied' ? 'les règles Firestore du quiz en direct ne sont pas publiées (voir README)' : (e && e.message) || 'erreur réseau'), { duration: 8000 });
      return;
    }
    live.unsub = db.collection('live').doc(code).collection('players').onSnapshot(snap => {
      if (!live) return;
      let added = 0;
      snap.docChanges().forEach(ch => { if (ch.type === 'removed') live.players.delete(ch.doc.id); else { if (ch.type === 'added') added++; live.players.set(ch.doc.id, Object.assign({}, live.players.get(ch.doc.id) || {}, { pid: ch.doc.id }, ch.doc.data())); } });   // garde les compteurs locaux (nok, nans, sumEl) que Firestore ne stocke pas
      if (added && live.state === 'lobby' && live.joined > 0) sfx('join');
      live.joined += added;
      onPlayers();
    }, err => { console.error('Quiz en direct (participants) :', err); if (live) { live.err = 'Liaison avec les participants interrompue'; renderLive(); } });
    openPlay('qz-live');
    renderLive();
  }
  function onPlayers() {
    if (!live) return;
    if (live.state === 'lobby') { renderLivePlayers(); return; }
    if (live.state === 'q' && live.pub && live.pub.t !== 'info') {
      const n = live.players.size, a = answeredCount();
      const c = $('#qp-answered'); if (c) { c.textContent = `${a} / ${n} réponse${a > 1 ? 's' : ''}`; c.classList.toggle('all', n > 0 && a >= n); }
      if (live.pub.t === 'vote') C.hemiUpdate($('#qp-hemi-live'), live.pub, liveTally());   // l'hémicycle se remplit à chaque vote
      if (n > 0 && a >= n && !live.allTm) live.allTm = setTimeout(() => { live.allTm = null; if (live && live.state === 'q') liveReveal(); }, live.pub.t === 'vote' ? 2400 : 1200);   // tout le monde a répondu
    }
  }
  /* votes reçus pour la question en cours */
  const liveTally = () => { const q = live.pub; const list = []; for (const p of live.players.values()) { const a = p.answers && p.answers[q.id]; if (a && a.v) list.push(a.v); } return tally(q, list); };
  const answeredCount = () => { const q = live.pub; if (!q) return 0; let n = 0; for (const p of live.players.values()) if (p.answers && p.answers[q.id]) n++; return n; };
  function liveQ() { return live.i >= 0 ? live.qs[live.i] : null; }
  function liveNext() {
    if (!live || live.busy) return;
    if (live.state === 'lobby' || live.state === 'reveal' || (live.state === 'q' && live.pub && live.pub.t === 'info')) { if (live.i + 1 < live.qs.length) publishQuestion(live.i + 1); else liveEnd(); }
    else if (live.state === 'q') liveReveal();
    else if (live.state === 'end') closeLive();
  }
  async function publishQuestion(i) {
    if (!live) return;
    const q = live.qs[i]; const pub = C.publicQuestion(q);
    live.busy = true;
    if (q.img) { try { pub.img = await smallImage(q.img); } catch { pub.img = ''; } if (!pub.img) delete pub.img; }
    if (!live) return;
    if (live.state === 'lobby') sfx('start'); else if (q.t === 'info') sfx('page');
    live.i = i; live.state = 'q'; live.pub = pub; live.qStart = Date.now(); live.qEnd = q.time && q.t !== 'info' ? live.qStart + q.time * 1000 : 0; lastTick = -1;
    clearInterval(live.timer); if (live.allTm) { clearTimeout(live.allTm); live.allTm = null; }
    try { await liveRef().update({ state: 'q', qi: i, q: C.sendable(pub), qStart: live.qStart, qEnd: live.qEnd, answer: null, stats: null, updatedAt: Date.now() }); }
    catch (e) { console.error(e); live.err = 'Envoi de la question impossible'; }
    live.busy = false;
    renderLive();
    if (live.qEnd) live.timer = setInterval(() => { if (!live || live.state !== 'q') { clearInterval(live.timer); return; } const left = (live.qEnd - Date.now()) / 1000; const t = $('#qp-timer'); if (t) t.innerHTML = timerHTML(left, q.time); tickCheck(left); if (left <= 0) { clearInterval(live.timer); liveReveal(); } }, 200);
  }
  async function liveReveal() {
    if (!live || live.state !== 'q' || live.busy) return;
    clearInterval(live.timer); if (live.allTm) { clearTimeout(live.allTm); live.allTm = null; }
    const q = liveQ(); const pub = live.pub;
    if (q.t === 'info') { liveNext(); return; }
    live.busy = true; live.state = 'reveal';
    const db = firebase.firestore();
    const qk = Object.assign({}, q, { rkey: pub._key || null });
    const list = [];
    const vals = [];
    let fastest = null;
    live.prevRank = new Map([...live.players.values()].map(p => [p.pid, p.rank || 0]));
    for (const p of live.players.values()) {
      const a = p.answers && p.answers[q.id];
      const v = a ? a.v : null;
      const ok = a ? C.check(qk, v) : (C.isScored(q) ? false : null);
      const fr = a && q.t === 'cloze' ? C.fraction(qk, v) : 0;
      const pts = a ? C.points(q, a.el || 0, q.t === 'cloze' ? fr : ok) : 0;
      p.score = (+p.score || 0) + pts;
      p.fb = { qid: q.id, ok, pts, v, answered: !!a };
      if (q.t === 'cloze') p.fb.fr = Math.round(fr * 1000) / 1000;   // part des trous justes (jamais undefined : Firestore le refuse)
      p.nok = (+p.nok || 0) + (ok ? 1 : 0); p.nans = (+p.nans || 0) + (a ? 1 : 0); p.sumEl = (+p.sumEl || 0) + (a ? (+a.el || 0) : 0);
      if (a) vals.push(v);
      if (ok && a && (!fastest || a.el < fastest.el)) fastest = { name: p.name || '?', el: a.el };
      list.push(p);
    }
    list.sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    list.forEach((p, i) => { p.rank = i + 1; });
    live.stats = C.stats(qk, vals);
    live.fastest = fastest;
    const qs1 = { id: q.id, t: q.t, text: qText(q), n: vals.length, players: live.players.size, ok: live.stats.ok || 0, meanEl: vals.length ? Math.round(list.filter(p => p.fb.answered).reduce((s, p) => s + ((p.answers[q.id] || {}).el || 0), 0) / vals.length) : null, counts: live.stats.counts || null, mean: live.stats.mean == null ? null : live.stats.mean };
    if (q.t === 'cloze') { qs1.holes = live.stats.holes; qs1.frac = Math.round((live.stats.frac || 0) * 1000) / 1000; }
    if (q.t === 'vote') qs1.opts = (q.opts || []).map((o, i) => ({ id: o.id, text: o.text || '', color: C.voteColor(o, i) }));
    live.qstats.push(qs1);
    live.top = list.slice(0, 10).map(p => ({ pid: p.pid, name: p.name || '?', score: p.score || 0 }));
    const answer = q.t === 'slider' || q.t === 'numeric' ? { ans: q.ans, tol: q.tol || 0, unit: q.unit || '' } : q.t === 'order' ? { ans: q.opts.map(o => o.id) } : q.t === 'match' ? { pairs: (q.pairs || []).filter(x => (x.l || '').trim() || (x.r || '').trim()).map(x => ({ id: x.id, l: x.l || '', r: x.r || '' })), rkey: pub._key || {} }
      : q.t === 'cloze' ? { holes: C.clozeHoles(q).map(h => ({ ans: h.ans, mode: h.mode, alts: (h.alts || []).filter(Boolean), decoys: (h.decoys || []).filter(Boolean) })) } : { ans: q.ans === undefined ? null : q.ans };
    /* statistiques envoyées aux participants : le décompte d'un vote (pour leur hémicycle), la réussite par trou d'un texte à trous */
    const pstats = { n: live.stats.n, ok: live.stats.ok || 0 };
    if (q.t === 'vote') pstats.counts = live.stats.counts || {};
    if (q.t === 'cloze') { pstats.holes = live.stats.holes || []; pstats.frac = Math.round((live.stats.frac || 0) * 1000) / 1000; }
    try {
      await liveRef().update({ state: 'reveal', answer, stats: pstats, top: live.top, updatedAt: Date.now() });
      const chunks = []; for (let i = 0; i < list.length; i += 400) chunks.push(list.slice(i, i + 400));
      for (const ch of chunks) { const batch = db.batch(); for (const p of ch) batch.update(db.collection('live').doc(live.code).collection('players').doc(p.pid), { score: p.score, rank: p.rank, fb: p.fb }); await batch.commit(); }
    } catch (e) { console.error(e); live.err = 'Envoi des résultats impossible'; }
    live.busy = false;
    sfx('reveal');
    renderLive();
  }
  async function liveEnd() {
    if (!live) return;
    live.state = 'end'; live.busy = true;
    const list = [...live.players.values()].sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    live.final = list.map((p, i) => ({ pid: p.pid, name: p.name || '?', score: p.score || 0, rank: i + 1, ok: p.nok || 0, answered: p.nans || 0, meanEl: p.nans ? Math.round((p.sumEl || 0) / p.nans) : null }));
    try { await liveRef().update({ state: 'end', top: live.final.slice(0, 50).map(p => ({ pid: p.pid, name: p.name, score: p.score, rank: p.rank })), updatedAt: Date.now() }); } catch (e) { console.error(e); }
    live.busy = false;
    const dd = d();
    if (dd && !readOnly && live.final.length) {
      const scored = live.qs.filter(C.isScored).length;
      resOf(dd).push({ id: uid(), mode: 'live', at: Date.now(), code: live.code, n: scored, questions: live.qs.length, players: live.final.map(p => ({ name: p.name, score: p.score, rank: p.rank, ok: p.ok, answered: p.answered, meanEl: p.meanEl })), qstats: live.qstats.slice() });
      commit(); renderBar();
    }
    sfx('end');
    renderLive();
  }
  async function closeLive() {
    if (!live) return;
    if (live.state !== 'end' && live.state !== 'lobby' && live.players.size && !(await confirmDialog({ title: 'Arrêter la présentation ?', text: 'La partie en cours sera fermée pour les participants ; le classement ne sera pas enregistré.', ok: 'Arrêter', danger: true }))) return;
    const L = live; live = null;
    clearInterval(L.timer); if (L.allTm) clearTimeout(L.allTm);
    if (L.unsub) L.unsub();
    closePlay();
    /* ménage : la partie et ses participants sont effacés (les participants voient « partie terminée ») */
    try {
      const db = firebase.firestore();
      const ref = db.collection('live').doc(L.code);
      await ref.update({ state: 'closed', updatedAt: Date.now() });
      const ids = [...L.players.keys()];
      for (let i = 0; i < ids.length; i += 400) { const batch = db.batch(); for (const pid of ids.slice(i, i + 400)) batch.delete(ref.collection('players').doc(pid)); await batch.commit(); }
      setTimeout(() => ref.delete().catch(() => {}), 15000);
    } catch (e) { console.error('Quiz en direct (fermeture) :', e); }
  }
  /* ---- écran du présentateur ---- */
  function renderLivePlayers() {
    const box = $('#qp-players'); if (!box || !live) return;
    const names = [...live.players.values()].map(p => p.name || '?').sort((a, b) => a.localeCompare(b));
    box.innerHTML = `<div class="qp-pcount">${names.length ? names.length + ' participant' + (names.length > 1 ? 's' : '') : 'En attente des premiers participants'}</div><div class="qp-pnames">${names.map(n => `<span>${esc(n)}</span>`).join('')}</div>`;
    const b = $('#qp-start'); if (b) b.disabled = !names.length;
  }
  function statsHTML(q, st) {
    if (!st) return '';
    const pct = c => (st.n ? Math.round(c / st.n * 100) : 0);
    if (q.t === 'vote') return C.hemicycleHTML(live.pub, st.counts || {}, { final: true, anim: false });
    if (q.t === 'cloze' && st.holes) return clozeStatsHTML(st);
    /* hauteur des barres rapportée à la plus haute (le pourcentage affiché reste celui du total) */
    const hOf = (c, mx) => (st.n && mx ? Math.max(3, Math.round(c / mx * 100)) : 3);
    if ((q.t === 'mcq' || q.t === 'poll') && st.counts) { const mx = Math.max(1, ...(live.pub.opts || []).map(o => st.counts[o.id] || 0)); return `<div class="qp-bars">${(live.pub.opts || []).map((o, i) => { const c = st.counts[o.id] || 0; const ok = q.t === 'mcq' && (q.ans || []).includes(o.id); return `<div class="qp-bar${ok ? ' ok' : ''}" style="--oc:var(--qp-c${i % 6})"><span class="qp-bfill" style="height:${hOf(c, mx)}%"></span><b>${c}<small>${pct(c)} %</small></b><span class="qp-bsh">${C.letter(i)}</span></div>`; }).join('')}</div>`; }
    if (q.t === 'tf' && st.counts) { const mx = Math.max(1, st.counts.true || 0, st.counts.false || 0); return `<div class="qp-bars n2">${[['true', 'V', 'var(--qp-c2)'], ['false', 'F', 'var(--qp-c1)']].map(([k, l, c]) => `<div class="qp-bar${String(q.ans) === k ? ' ok' : ''}" style="--oc:${c}"><span class="qp-bfill" style="height:${hOf(st.counts[k] || 0, mx)}%"></span><b>${st.counts[k] || 0}<small>${pct(st.counts[k] || 0)} %</small></b><span class="qp-bsh">${l}</span></div>`).join('')}</div>`; }
    if (q.t === 'order' || q.t === 'match') return `<div class="qp-stat">${st.ok || 0} sur ${st.n} ont trouvé<small>${pct(st.ok || 0)} % de réussite</small></div>`;
    if (q.t === 'slider' || q.t === 'numeric' || q.t === 'scale') {
      const entries = Object.entries(st.counts || {}).map(([v, c]) => [+v, c]).sort((a, b) => a[0] - b[0]);
      const max = Math.max(1, ...entries.map(e => e[1]));
      const hist = entries.length ? `<div class="qp-hist">${entries.slice(0, 14).map(([v, c]) => `<div class="${q.t !== 'scale' && C.check(q, v) ? 'ok' : ''}"><b>${c}</b><i style="height:${Math.max(3, Math.round(c / max * 100))}%"></i><small>${esc(v)}</small></div>`).join('')}</div>` : '';
      const mean = st.mean == null ? '' : `moyenne ${(Math.round(st.mean * 100) / 100).toLocaleString('fr-FR')}${q.unit ? ' ' + esc(q.unit) : ''}`;
      return hist + `<div class="qp-stat">${q.t === 'scale' ? `${st.n} réponse${st.n > 1 ? 's' : ''}` : `${st.ok || 0} dans la cible sur ${st.n}`}<small>${mean}</small></div>`;
    }
    if (q.t === 'open' && st.counts) {
      const entries = Object.entries(st.counts).sort((a, b) => b[1] - a[1]).slice(0, 40);
      const max = Math.max(1, ...entries.map(e => e[1]));
      return `<div class="qp-cloud">${entries.map(([t, c], i) => `<span style="--k:${((c - 1) / Math.max(1, max - 1)).toFixed(2)};--cc:var(--qp-c${i % 6})">${esc(t)}${c > 1 ? `<small>×${c}</small>` : ''}</span>`).join('') || '<span style="--k:0">Aucune réponse</span>'}</div><div class="qp-stat"><small>${st.n} réponse${st.n > 1 ? 's' : ''} · ${entries.length} mot${entries.length > 1 ? 's' : ''} différent${entries.length > 1 ? 's' : ''}</small></div>`;
    }
    if (q.t === 'text' && st.counts) return `<div class="qp-stat">${st.ok || 0} bonne${st.ok > 1 ? 's' : ''} réponse${st.ok > 1 ? 's' : ''} sur ${st.n}<small>${pct(st.ok || 0)} % de réussite</small></div><div class="qp-texts">${Object.entries(st.counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, c]) => `<span class="${C.check(q, t) ? 'ok' : ''}">${esc(t)} <b>${c}</b></span>`).join('')}</div>`;
    return '';
  }
  /* réussite par trou (écran du présentateur, résultats) */
  function clozeStatsHTML(st) {
    const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
    return `<div class="qp-ltitle qp-hstitle">Réussite par trou</div><div class="qp-holestats">${(st.holes || []).map((h, k) => `<div class="qp-hs" style="--i:${k}"><span class="qp-hn">${k + 1}</span><span class="qp-hsa">${esc(h.ans)}</span><span class="qp-hsbar"><i style="width:${pct(h.ok, h.n)}%"></i></span><b>${pct(h.ok, h.n)} %</b></div>`).join('')}</div>
      <div class="qp-stat">${st.ok || 0} sur ${st.n} ont tout juste<small>${Math.round((st.frac || 0) * 100)} % des trous remplis correctement</small></div>`;
  }
  function renderLive() {
    const ov = play(); if (!live || ov.hidden) return;
    const dd = d();
    const top = (title, extra) => `<div class="qp-top"><span class="qp-prog">${title}</span>${extra || ''}<span class="qp-code-sm" title="Code de la partie">${JOIN_HOST} · <b>${live.code}</b></span>${soundBtn()}<button type="button" class="qp-x" data-close title="Arrêter la présentation (Échap)">${I.x}</button></div>`;
    const err = live.err ? `<div class="qp-err">${esc(live.err)}</div>` : '';
    const hints = `<div class="qp-hints"><span><kbd>Espace</kbd> ou <kbd>→</kbd> suite</span><span><kbd>M</kbd> son</span><span><kbd>Échap</kbd> arrêter</span></div>`;
    if (live.state === 'lobby') {
      const nq = live.qs.filter(C.isScored).length, np = live.qs.filter(C.isPage).length;
      ov.innerHTML = top('Salle d’attente') + `<div class="qp-body"><div class="qp-lobby-title">${esc((dd && dd.titre) || 'Quiz')}</div><div class="qp-lobby-sub">${nq} question${nq > 1 ? 's' : ''}${np ? ` · ${np} page${np > 1 ? 's' : ''}` : ''}${live.qs.length - nq - np ? ` · ${live.qs.length - nq - np} avis du public` : ''}</div><div class="qp-lobby">
        <div class="qp-join"><div class="qp-jtitle">Rejoignez le quiz</div><div class="qp-jurl">${JOIN_HOST}</div><div class="qp-jcode">${live.code}</div><div class="qp-jhint">Sur votre téléphone ou ordinateur : ouvrez ${JOIN_HOST}, entrez le code et un pseudo — ou scannez le QR code.</div></div>
        <div class="qp-qr">${qrSvg(joinUrl(live.code))}</div></div>
        <div id="qp-players" class="qp-players"></div>${err}</div>
        <div class="qp-ctrl"><button type="button" class="qp-next" id="qp-start" data-next disabled>Commencer →</button>${hints}</div>`;
      renderLivePlayers();
    } else if (live.state === 'q') {
      const q = liveQ(), pub = live.pub, n = live.players.size, a = answeredCount();
      if (q.t === 'info') {
        ov.innerHTML = top(`Page ${live.i + 1} / ${live.qs.length}`) + progressHTML(live.i, live.qs.length) + `
          <div class="qp-body qp-page-wrap">${imgHTML(q, pub)}<div class="qp-q">${esc(qText(q))}</div>${C.widgetHTML(pub)}</div>${err}
          <div class="qp-ctrl"><button type="button" class="qp-next" data-next>${live.i + 1 < live.qs.length ? 'Suite →' : 'Terminer : classement final →'}</button>${hints}</div>`;
      } else {
        ov.innerHTML = top(`Question ${live.i + 1} / ${live.qs.length}`, `<span class="qp-ptype">${C.TYPES[q.t] ? esc(C.TYPES[q.t].name) : ''}</span><span id="qp-timer">${timerHTML(q.time ? (live.qEnd - Date.now()) / 1000 : 0, q.time)}</span><span id="qp-answered" class="qp-answered${n > 0 && a >= n ? ' all' : ''}">${a} / ${n} réponse${a > 1 ? 's' : ''}</span>`) + progressHTML(live.i, live.qs.length) + `
          <div class="qp-body">${imgHTML(q, pub)}<div class="qp-q big">${esc(playTitle(q))}</div>
          <div class="qp-widget big">${q.t === 'vote' ? `<div class="qp-hemi-wrap" id="qp-hemi-live">${C.hemicycleHTML(pub, liveTally())}</div><div class="qp-device small">Votez sur votre téléphone : chaque vote ajoute un siège.</div>` : q.t === 'text' || q.t === 'open' || q.t === 'numeric' ? `<div class="qp-device">${q.t === 'numeric' ? 'Les participants tapent un nombre sur leur appareil.' : q.t === 'open' ? 'Les participants envoient un mot ou une idée : le nuage se forme à la révélation.' : 'Les participants tapent leur réponse sur leur appareil.'}</div>` : C.widgetHTML(pub, { done: true })}</div></div>${err}
          <div class="qp-ctrl"><button type="button" class="qp-next" data-next>${C.isScored(q) ? 'Révéler la réponse →' : 'Voir les réponses →'}</button>${hints}</div>`;
      }
    } else if (live.state === 'reveal') {
      const q = liveQ(), st = live.stats || { n: 0 };
      const full = fullOf(q, live.pub);
      const last = live.i + 1 >= live.qs.length;
      const showWidget = !(q.t === 'text' || q.t === 'open' || q.t === 'scale' || q.t === 'numeric' || q.t === 'vote');
      ov.innerHTML = top(`Question ${live.i + 1} / ${live.qs.length} · ${C.isScored(q) ? 'réponse' : 'réponses du public'}`) + progressHTML(live.i, live.qs.length) + `
        <div class="qp-body"><div class="qp-reveal${q.t === 'vote' ? ' vote' : ''}"><div class="qp-rleft"><div class="qp-q">${esc(playTitle(q))}</div>${showWidget ? `<div class="qp-widget">${C.widgetHTML(full, { reveal: true, done: true })}</div>` : (C.isScored(q) ? `<div class="qp-good" style="text-align:center">Bonne réponse : <b>${esc(C.correctText(full))}</b></div>` : '')}${statsHTML(q, st)}</div>
        <div class="qp-rright"><div class="qp-ltitle">Classement</div><ol class="qp-lead">${(live.top || []).slice(0, 8).map((p, i) => { const prev = live.prevRank.get(p.pid) || 0; const delta = prev ? prev - (i + 1) : 0; return `<li><span>${esc(p.name)}</span><em class="${delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'}">${delta > 0 ? '▲' + delta : delta < 0 ? '▼' + (-delta) : (prev ? '=' : '')}</em><b>${fmtPts(p.score)}</b></li>`; }).join('') || '<li class="none">Personne n’a encore de points</li>'}</ol>${live.fastest ? `<div class="qp-fastest">Le plus rapide : <b>${esc(live.fastest.name)}</b> en ${fmtSec(live.fastest.el)}</div>` : ''}</div></div>${err}</div>
        <div class="qp-ctrl"><button type="button" class="qp-next" data-next>${last ? 'Terminer : classement final →' : 'Suivant →'}</button>${hints}</div>`;
    } else if (live.state === 'end') {
      const f = live.final || [];
      const scored = live.qstats.filter(s => C.TYPES[s.t] && C.isScored({ t: s.t }));
      const sumOk = scored.reduce((s, x) => s + (x.ok || 0), 0), sumN = scored.reduce((s, x) => s + (x.n || 0), 0);
      const mean = f.length ? Math.round(f.reduce((s, p) => s + p.score, 0) / f.length) : 0;
      const hardest = scored.length ? scored.slice().sort((a, b) => (a.n ? a.ok / a.n : 0) - (b.n ? b.ok / b.n : 0))[0] : null;
      ov.innerHTML = top('Classement final') + `<div class="qp-body"><div class="qp-end live">
        <div class="qp-podium">${[1, 0, 2].map(i => f[i] ? `<div class="qp-pod p${i + 1}"><div class="qp-pname">${esc(f[i].name)}</div><div class="qp-pbox"><span>${i + 1}</span><b>${fmtPts(f[i].score)}</b></div></div>` : `<div class="qp-pod p${i + 1} empty"></div>`).join('')}</div>
        <div class="qp-kpis"><div class="qp-kpi"><b>${f.length}</b><small>participant${f.length > 1 ? 's' : ''}</small></div><div class="qp-kpi"><b>${fmtPts(mean)}</b><small>score moyen</small></div><div class="qp-kpi"><b>${sumN ? Math.round(sumOk / sumN * 100) : 0} %</b><small>de bonnes réponses</small></div>${hardest ? `<div class="qp-kpi"><b>${hardest.n ? Math.round(hardest.ok / hardest.n * 100) : 0} %</b><small>question la plus dure : « ${esc(hardest.text.slice(0, 40))}${hardest.text.length > 40 ? '…' : ''} »</small></div>` : ''}</div>
        <div class="qp-endlist">${f.slice(3).map(p => `<div class="qp-endrow"><span>${p.rank}</span><span class="qp-endq">${esc(p.name)}</span><span class="qp-enda">${p.ok} / ${scored.length} · ${fmtSec(p.meanEl)}</span><span class="qp-endp">${fmtPts(p.score)}</span></div>`).join('')}</div>${err}
        <div class="qp-ctrl"><button type="button" class="qp-next" data-next>Fermer</button><button type="button" class="qp-next ghost" data-stats>Statistiques détaillées</button></div>
        <div class="qp-foot">${readOnly ? 'Quiz en lecture seule : le classement n’est pas enregistré.' : 'Classement et statistiques enregistrés (bouton Résultats).'}</div></div></div>`;
      const sb = ov.querySelector('[data-stats]'); if (sb) sb.addEventListener('click', () => { closeLive(); setTimeout(openResults, 150); });
    }
    loadImgs(ov);
    ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeLive));
    ov.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', liveNext));
    const sb = ov.querySelector('[data-sound]'); if (sb) sb.addEventListener('click', toggleSound);
  }

  /* ============================================================
     Résultats enregistrés : scores, statistiques par question et par participant, export Excel ou CSV
     ============================================================ */
  const median = arr => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function liveResultHTML(dd, r) {
    const players = r.players || [];
    const qst = Array.isArray(r.qstats) ? r.qstats : [];
    const scoredQ = qst.filter(s => C.isScored({ t: s.t }));
    const scores = players.map(p => +p.score || 0);
    const mean = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const sumOk = scoredQ.reduce((s, x) => s + (x.ok || 0), 0), sumN = scoredQ.reduce((s, x) => s + (x.n || 0), 0);
    const els = players.map(p => p.meanEl).filter(x => x != null);
    const maxScore = Math.max(1, ...scores);
    /* répartition des scores : six tranches */
    const B = 6; const buckets = new Array(B).fill(0);
    for (const s of scores) buckets[Math.min(B - 1, Math.floor(s / maxScore * B))]++;
    const bmax = Math.max(1, ...buckets);
    const kpis = `<div class="qz-kpis"><div class="qz-kpi"><b>${players.length}</b><small>participants</small></div><div class="qz-kpi"><b>${fmtPts(mean)}</b><small>score moyen</small></div><div class="qz-kpi"><b>${fmtPts(Math.round(median(scores)))}</b><small>médiane</small></div><div class="qz-kpi"><b>${sumN ? Math.round(sumOk / sumN * 100) : 0} %</b><small>bonnes réponses</small></div><div class="qz-kpi"><b>${els.length ? fmtSec(Math.round(els.reduce((a, b) => a + b, 0) / els.length)) : '—'}</b><small>temps moyen</small></div></div>`;
    const dist = scores.length > 1 ? `<div class="qz-rsect"><div class="qz-rtitle">Répartition des scores</div><div class="qz-hist">${buckets.map((c, i) => `<div title="${c} participant${c > 1 ? 's' : ''}"><b>${c || ''}</b><i style="height:${Math.max(2, Math.round(c / bmax * 100))}%"></i><small>${fmtPts(Math.round(i / B * maxScore))}</small></div>`).join('')}</div></div>` : '';
    const detail = s => {
      if (s.t === 'cloze' && Array.isArray(s.holes) && s.holes.length) return `<div class="qz-qdetail">${s.holes.map((h, k) => { const p = h.n ? Math.round(h.ok / h.n * 100) : 0; return `<span class="qz-hrate" style="--p:${p}%" title="Trou ${k + 1} : ${h.ok} / ${h.n}"><i>${k + 1}</i>${esc(h.ans)}<b>${p} %</b></span>`; }).join('')}</div>`;
      if (s.t === 'vote' && s.counts) { const qq = { opts: s.opts || (qsOf(dd).find(x => x.id === s.id) || {}).opts || [] }; return qq.opts.length ? `<div class="qz-qdetail qz-play-scope qz-hmini">${C.hemicycleHTML(qq, s.counts, { final: true, mini: true, anim: false })}</div>` : ''; }
      return '';
    };
    const perQ = qst.length ? `<div class="qz-rsect"><div class="qz-rtitle">Par question</div><div class="qz-qrows">${qst.map((s, i) => { const scored = C.isScored({ t: s.t }); const pct = s.t === 'cloze' && s.frac != null ? Math.round(s.frac * 100) : s.n ? Math.round((s.ok || 0) / s.n * 100) : 0; const hard = scored && s.n && scoredQ.length > 1 && s === scoredQ.slice().sort((a, b) => (a.n ? a.ok / a.n : 0) - (b.n ? b.ok / b.n : 0))[0]; return `<div class="qz-qrow${hard ? ' hard' : ''}"><span class="qz-qn">${i + 1}</span><span class="qz-qt" title="${esc(s.text)}">${esc(s.text)}${hard ? ' <em>la plus dure</em>' : ''}</span>${scored ? `<span class="qz-qbar"><i style="width:${pct}%"></i></span><span class="qz-qv">${pct} %<small>${s.ok || 0} / ${s.n}</small></span>` : `<span class="qz-qbar muted"></span><span class="qz-qv"><small>${s.t === 'info' ? 'page' : (s.n || 0) + ' réponse' + (s.n > 1 ? 's' : '') + (s.mean != null ? ' · moy. ' + (Math.round(s.mean * 100) / 100).toLocaleString('fr-FR') : '')}</small></span>`}<span class="qz-qel">${fmtSec(s.meanEl)}</span></div>${detail(s)}`; }).join('')}</div></div>` : '';
    const table = `<div class="qz-rsect"><div class="qz-rtitle">Participants</div><table class="qz-ptable"><thead><tr><th>#</th><th>Pseudo</th><th>Score</th><th>Bonnes</th><th>Temps moyen</th></tr></thead><tbody>${players.map(p => `<tr><td>${p.rank || ''}</td><td>${esc(p.name)}</td><td><b>${fmtPts(p.score)}</b></td><td>${p.ok != null ? `${p.ok} / ${scoredQ.length || r.n || '?'}` : '—'}</td><td>${fmtSec(p.meanEl)}</td></tr>`).join('')}</tbody></table></div>`;
    return kpis + dist + perQ + table;
  }
  function testResultHTML(dd, r) {
    const qs = qsOf(dd);
    return `<div class="qz-kpis"><div class="qz-kpi"><b>${fmtPts(r.score)}</b><small>points</small></div><div class="qz-kpi"><b>${r.ok} / ${r.n}</b><small>bonnes réponses</small></div><div class="qz-kpi"><b>${r.n ? Math.round(r.ok / r.n * 100) : 0} %</b><small>réussite</small></div><div class="qz-kpi"><b>${fmtSec(r.meanEl)}</b><small>temps moyen</small></div></div>
      <div class="qz-rans">${qs.map((q, i) => { const a = r.answers && r.answers[q.id]; if (!a) return ''; const un = !C.isScored(q); return `<span class="${un ? '' : a.ok ? 'ok' : 'ko'}" title="${esc(qText(q))}">${i + 1}. ${q.t === 'info' ? 'page' : esc(C.answerText(Object.assign({}, q, { rkey: null }), a.v))}${a.el ? ` <small>${fmtSec(a.el)}</small>` : ''}</span>`; }).join('')}</div>`;
  }
  /* tableaux de résultats, valeurs typées : servent au CSV (csvOf) et au classeur Excel (xlsxOf).
     Colonnes : label (CSV), xlabel (Excel, si l'unité est portée par le format), type 'text'|'int'|'pct'|'sec'|'num'.
     'pct' = fraction (0,75), 'sec' = secondes ; une cellule peut être { v, s: 'ok'|'ko'|'bold' } (mise en forme Excel). */
  function resultTables(dd, r) {
    const sec = ms => ms != null && Number.isFinite(+ms) ? +ms / 1000 : '';
    const T = [];
    if (r.mode === 'live') {
      const players = r.players || [];
      const best = players.length ? Math.max(...players.map(p => +p.score || 0)) : 0;
      const POD = { 1: 'gold', 2: 'silver', 3: 'bronze' };
      T.push({ name: 'Participants', note: players.length ? `Classement final · meilleur score : ${fmtPts(best)} pts` : 'Classement final', dataBar: 2,
        columns: [{ label: 'Rang', type: 'int', width: 8 }, { label: 'Pseudo', type: 'text', width: 28 }, { label: 'Score', type: 'int', width: 14 }, { label: 'Bonnes réponses', type: 'int', width: 17 }, { label: 'Réponses', type: 'int', width: 12 }, { label: 'Temps moyen (s)', xlabel: 'Temps moyen', type: 'sec', width: 15 }],
        rows: players.map(p => [POD[+p.rank] ? { v: p.rank, s: POD[+p.rank] } : p.rank, p.name, p.score, p.ok ?? '', p.answered ?? '', sec(p.meanEl)]) });
      if (Array.isArray(r.qstats) && r.qstats.length) {
        const rows = [], rowStyles = [];
        r.qstats.forEach((s, i) => {
          const scored = C.isScored({ t: s.t });   // vote, sondage, avis : ni « bonnes » ni réussite
          rows.push([i + 1, s.text, C.TYPES[s.t] ? C.TYPES[s.t].name : s.t, s.n, scored ? s.ok : '', s.t === 'cloze' && s.frac != null ? +s.frac : s.n && scored ? (s.ok || 0) / s.n : '', sec(s.meanEl)]); rowStyles.push(null);
          if (s.t === 'cloze' && Array.isArray(s.holes)) s.holes.forEach((h, k) => { rows.push(['', `Trou ${k + 1} : ${h.ans}`, '', h.n, h.ok, h.n ? h.ok / h.n : '', '']); rowStyles.push('sub'); });
          if (s.t === 'vote' && s.counts) (s.opts || []).forEach(o => { const c = s.counts[o.id] || 0; rows.push(['', `Vote : ${o.text}${s.n ? ` (${Math.round(c / s.n * 100)}\u00a0%)` : ''}`, '', c, '', '', '']); rowStyles.push('sub'); });
        });
        T.push({ name: 'Par question', note: 'Réussite par question (sous-lignes : détail des trous et des votes)', dataBar: 5, rows, rowStyles,
          columns: [{ label: 'N°', type: 'int', width: 8 }, { label: 'Question', type: 'text', width: 52, wrap: true }, { label: 'Type', type: 'text', width: 18 }, { label: 'Réponses', type: 'int', width: 12 }, { label: 'Bonnes', type: 'int', width: 11 }, { label: 'Réussite (%)', xlabel: 'Réussite', type: 'pct', width: 13 }, { label: 'Temps moyen (s)', xlabel: 'Temps moyen', type: 'sec', width: 15 }] });
      }
    } else {
      const rows = [];
      qsOf(dd).forEach((q, i) => { const a = r.answers && r.answers[q.id]; if (a) { const sc = C.isScored(q); rows.push([i + 1, qText(q), C.answerText(Object.assign({}, q, { rkey: null }), a.v), a.ok ? { v: 'oui', s: 'ok' } : (sc ? { v: 'non', s: 'ko' } : ''), sc ? a.pts : '', sec(a.el)]); } });
      T.push({ name: 'Réponses', note: `${fmtPts(r.score)} points · ${r.ok} / ${r.n} bonne${r.ok > 1 ? 's' : ''} réponse${r.ok > 1 ? 's' : ''}`, rows,
        columns: [{ label: 'N°', type: 'int', width: 8 }, { label: 'Question', type: 'text', width: 48, wrap: true }, { label: 'Réponse', type: 'text', width: 34, wrap: true }, { label: 'Juste', type: 'text', width: 9, align: 'center' }, { label: 'Points', type: 'int', width: 11 }, { label: 'Temps (s)', xlabel: 'Temps', type: 'sec', width: 12 }] });
    }
    return T;
  }
  /* CSV (séparateur ;, BOM UTF-8) : les cellules texte commençant par = + - @ (y compris après des espaces, et leurs variantes
     pleine chasse), ou par une tabulation ou un retour, sont préfixées
     d'une apostrophe pour qu'un tableur ne les exécute pas comme formules (pseudos et questions sont saisis par des tiers) */
  function csvOf(dd, r) {
    const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const val = (v, c) => {
      if (v && typeof v === 'object') v = v.v;
      if (v == null || v === '') return '';
      if (c.type === 'sec' && typeof v === 'number') return v.toFixed(1).replace('.', ',');
      if (c.type === 'pct' && typeof v === 'number') return Math.round(v * 100);
      if (typeof v === 'string' && (/^[\s\u00a0\u3000]*[=+\-@\uff1d\uff0b\uff0d\uff20]/.test(v) || /^[\t\r\n]/.test(v))) return "'" + v;
      return v;
    };
    return '﻿' + resultTables(dd, r).map(t => [t.columns.map(c => q(c.label)).join(';')].concat(t.rows.map(row => t.columns.map((c, i) => q(val(row[i], c))).join(';'))).join('\r\n')).join('\r\n\r\n');
  }
  async function xlsxOf(dd, r) {
    if (!window.AlixoXlsx) throw new Error('module Excel indisponible');
    const when = new Date(r.at).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const np = (r.players || []).length, nq = r.questions || r.n || 0;
    const sub = r.mode === 'live'
      ? `Quiz — Résultats en direct · ${when} · ${np} participant${np > 1 ? 's' : ''} · ${nq} question${nq > 1 ? 's' : ''}`
      : `Quiz — Résultats du test · ${when}`;
    const title = dd.titre || 'Quiz';
    const logo = await AlixoXlsx.loadLogo('logo.png').catch(() => null);
    return AlixoXlsx.build({ title: title + ' — résultats', subtitle: sub, logo,
      sheets: resultTables(dd, r).map(t => Object.assign({}, t, { title, subtitle: sub, columns: t.columns.map(c => Object.assign({}, c, { label: c.xlabel || c.label })) })) });
  }
  /* enregistrement commun : boîte « Enregistrer » d'Electron (+ « Ouvrir »), sinon téléchargement du navigateur */
  async function saveBytes(name, bytes, mime, filters, label) {
    const desk = window.alixoDesktop;
    if (desk && desk.saveFile) {
      const res = await desk.saveFile({ name, data: bytes, filters });
      if (res && res.ok) toast(`${label} enregistré : ${res.path.split(/[\\/]/).pop()}`, { action: 'Ouvrir', onAction: () => desk.openPath && desk.openPath(res.path) });
      else if (res && res.error) toast('Enregistrement impossible : ' + res.error);
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  /* titre coupé à 80 caractères AVANT le suffixe : la date et l'extension restent toujours présentes */
  const resultFileName = (dd, r) => safeFileName(String(dd.titre || 'Quiz').trim().slice(0, 80).trim() + ' - résultats ' + new Date(r.at).toLocaleDateString('fr-FR').replace(/\//g, '-'));
  function downloadCSV(dd, r) {
    return saveBytes(resultFileName(dd, r) + '.csv', new TextEncoder().encode(csvOf(dd, r)), 'text/csv;charset=utf-8', [{ name: 'CSV', extensions: ['csv'] }], 'CSV');
  }
  let xlsxBusy = false;
  async function downloadXLSX(dd, r, btn) {
    if (xlsxBusy) return;
    xlsxBusy = true;
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true'); btn.innerHTML = `${I.xls}Création…`; }
    try {
      const bytes = await xlsxOf(dd, r);
      await saveBytes(resultFileName(dd, r) + '.xlsx', bytes, window.AlixoXlsx.MIME, [{ name: 'Classeur Excel', extensions: ['xlsx'] }], 'Classeur Excel');
    } catch (e) { console.error('Export Excel des résultats :', e); toast('Impossible de créer le classeur Excel. Réessayez ou utilisez l’export CSV.'); }
    finally { xlsxBusy = false; if (btn) { btn.disabled = false; btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); btn.innerHTML = label; } }
  }
  function openResults() {
    const dd = d(); if (!dd) return;
    const rs = resOf(dd).slice().sort((a, b) => b.at - a.at);
    const when = ts => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const body = rs.length ? `<div class="qz-results">${rs.map((r, i) => `<div class="qz-res${i === 0 ? ' open' : ''}" data-res="${r.id}"><div class="qz-rhead" data-toggle>${r.mode === 'live' ? `<b>En direct</b> · ${when(r.at)} · ${(r.players || []).length} participant${(r.players || []).length > 1 ? 's' : ''} · ${r.questions || r.n} question${(r.questions || r.n) > 1 ? 's' : ''}` : `<b>Test</b> · ${when(r.at)} · <b>${fmtPts(r.score)} pts</b> · ${r.ok} / ${r.n} bonne${r.ok > 1 ? 's' : ''} réponse${r.ok > 1 ? 's' : ''}`}<span class="qz-ract"><button type="button" class="qz-rxls" data-rxls title="Télécharger le classeur Excel (.xlsx) mis en forme">${I.xls}Excel</button><button type="button" class="qz-rcsv" data-rcsv title="Télécharger en CSV (texte brut, pour tout tableur)">${I.csv}CSV</button>${readOnly ? '' : `<button type="button" class="qz-rdel" data-rdel title="Supprimer">${I.trash}</button>`}</span></div><div class="qz-rbody">${r.mode === 'live' ? liveResultHTML(dd, r) : testResultHTML(dd, r)}</div></div>`).join('')}</div>`
      : `<div class="qz-lempty" style="padding:30px 10px; text-align:center">Aucun résultat pour l’instant : <b>Tester</b> joue le quiz sur cet appareil, <b>Présenter en direct</b> le fait jouer à un groupe. Les scores et statistiques s’enregistrent ici.</div>`;
    openDialog({ id: 'qz-resdlg', cls: 'wide', eyebrow: 'Quiz', title: 'Résultats', sub: esc(dd.titre || 'Sans titre'), body, onMount: card => {
      card.addEventListener('click', e => {
        const box = e.target.closest('.qz-res'); if (!box) return;
        const r = resOf(dd).find(x => x.id === box.dataset.res); if (!r) return;
        if (e.target.closest('[data-rxls]')) { downloadXLSX(dd, r, e.target.closest('[data-rxls]')); return; }
        if (e.target.closest('[data-rcsv]')) { downloadCSV(dd, r); return; }
        if (e.target.closest('[data-rdel]')) {
          if (readOnly) return;
          const i = resOf(dd).indexOf(r); if (i < 0) return;
          resOf(dd).splice(i, 1); commit(); renderBar(); box.remove();
          if (!resOf(dd).length) closeDialog('qz-resdlg');
          return;
        }
        if (e.target.closest('[data-toggle]')) box.classList.toggle('open');
      });
    } });
  }

  /* ============================================================
     Export PDF : les questions, avec les bonnes réponses
     ============================================================ */
  function printHTML(dd) {
    const qs = qsOf(dd);
    let qi = 0;
    return `<h2>${esc(dd.titre || 'Quiz')}</h2><div class="qzp-sub">${qs.filter(q => q.t !== 'info').length} question${qs.length > 1 ? 's' : ''} · les bonnes réponses sont marquées ✓</div>` + qs.map((q) => {
      let ans = '';
      if (q.t === 'vote') ans = `<ol class="qzp-opts">${(q.opts || []).map((o, k) => `<li><span class="qzp-sh" style="background:${esc(C.voteColor(o, k))};color:#fff">${C.letter(k)}</span>${esc(o.text)}</li>`).join('')}</ol><div class="qzp-ans">Vote d’assemblée : résultat en hémicycle, sans bonne réponse</div>`;
      else if (q.t === 'cloze') { const { segs } = C.clozeParse(q.src); const H = C.clozeHoles(q); ans = `<div class="qzp-ans qzp-cloze">${segs.map((sg, k) => esc(sg).replace(/\n/g, '<br>') + (k < H.length ? `<u><b>${esc(H[k].ans)}</b></u><sup>${k + 1}</sup>` : '')).join('')}</div>` + (H.some(h => C.holeMode(h) === 'select' || (h.alts || []).some(Boolean)) ? `<ol class="qzp-opts">${H.map((h, k) => C.holeMode(h) === 'select' ? `<li><span class="qzp-sh">${k + 1}</span>Menu : <b>${esc(h.ans)}</b> · ${C.decoysOf(h).map(esc).join(' · ')}</li>` : (h.alts || []).some(Boolean) ? `<li><span class="qzp-sh">${k + 1}</span>Accepté aussi : ${(h.alts || []).filter(Boolean).map(esc).join(' · ')}</li>` : '').join('')}</ol>` : ''); }
      else if (q.t === 'mcq' || q.t === 'poll') ans = `<ol class="qzp-opts">${(q.opts || []).map((o, k) => `<li class="${q.t === 'mcq' && (q.ans || []).includes(o.id) ? 'ok' : ''}"><span class="qzp-sh">${C.letter(k)}</span>${esc(o.text)}</li>`).join('')}</ol>`;
      else if (q.t === 'order') ans = `<ol class="qzp-opts order">${(q.opts || []).map(o => `<li class="ok">${esc(o.text)}</li>`).join('')}</ol>`;
      else if (q.t === 'match') ans = `<ol class="qzp-opts">${(q.pairs || []).map((p, k) => `<li class="ok"><span class="qzp-sh">${C.letter(k)}</span>${esc(p.l)} → ${esc(p.r)}</li>`).join('')}</ol>`;
      else if (q.t === 'info') ans = q.body ? `<div class="qzp-ans">${esc(q.body).replace(/\n/g, '<br>')}</div>` : '';
      else if (q.t === 'scale') ans = `<div class="qzp-ans">Échelle de ${esc(q.min)} (${esc(q.lo || '')}) à ${esc(q.max)} (${esc(q.hi || '')})</div>`;
      else if (q.t === 'open') ans = `<div class="qzp-ans">Réponse libre (nuage de mots)</div>`;
      else ans = `<div class="qzp-ans">Réponse : <b>${esc(C.correctText(q))}</b>${q.t === 'slider' ? ` <small>(échelle ${esc(q.min)} – ${esc(q.max)})</small>` : ''}</div>`;
      const page = q.t === 'info'; if (!page) qi++;
      return `<div class="qzp-q${page ? ' page' : ''}"><div class="qzp-qh"><span class="qzp-n">${page ? '▭' : qi}</span><span class="qzp-t">${esc(playTitle(q))}</span><span class="qzp-meta">${C.TYPES[q.t] ? esc(C.TYPES[q.t].name) : ''}${q.time && !page ? ` · ${q.time} s` : ''}${C.isScored(q) ? ` · ${fmtPts(q.points)} pts` : ''}</span></div>${ans}</div>`;
    }).join('');
  }
  let pdfBusy = false;
  async function exportPDF() {
    if (pdfBusy) return;
    const dd = d(); if (!dd || !active()) return;
    const box = $('#qz-print'); if (!box) return;
    box.innerHTML = printHTML(dd);
    const title = dd.titre || 'Quiz';
    document.title = title + ' — Alixo';
    document.body.classList.add('printing-quiz');
    const desk = window.alixoDesktop;
    const done = () => { document.body.classList.remove('printing-quiz'); if (typeof exportWatermark === 'function') exportWatermark(false); box.innerHTML = ''; document.title = 'Alixo — Cockpit d’amphi'; };
    if (!desk || !desk.printToPDF || !desk.saveFile) { if (typeof exportWatermark === 'function') exportWatermark(true); try { print(); } finally { done(); } return; }
    pdfBusy = true;
    toast('Préparation du PDF…', { duration: 4000 });
    let pdf = null, err = null;
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (typeof exportWatermark === 'function') exportWatermark(true);
      pdf = await desk.printToPDF({ title });
    } catch (e) { err = e; }
    done(); pdfBusy = false;
    if (!pdf || err) { console.error(err); toast('Export PDF impossible' + (err && err.message ? ' : ' + err.message : '')); return; }
    const r = await desk.saveFile({ name: safeFileName(title) + '.pdf', data: pdf, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r && r.ok) toast(`PDF enregistré : ${r.path.split(/[\\/]/).pop()}`, { action: 'Ouvrir', onAction: () => desk.openPath && desk.openPath(r.path) });
    else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
  }

  /* ---------------- aperçu pour la bibliothèque, recherche ---------------- */
  function preview(dd) {
    const qs = Array.isArray(dd && dd.questions) ? dd.questions : [];
    if (!qs.length) return '<span class="sp-empty">Quiz vide</span>';
    const th = C.resolveTheme(dd.theme);
    return `<div class="qzprev">${qs.slice(0, 4).map((q, i) => `<div class="qzprev-q"><span class="qzprev-n" style="background:${th.pal[i % 6]};color:#fff">${q.t === 'info' ? '▭' : i + 1}</span><span>${esc((q.text || '').trim() || (q.t === 'cloze' ? C.clozePlain(q.src).trim() : '') || (C.TYPES[q.t] ? C.TYPES[q.t].name : '…'))}</span></div>`).join('')}${qs.length > 4 ? `<div class="qzprev-more">+ ${qs.length - 4} autre${qs.length - 4 > 1 ? 's' : ''}</div>` : ''}</div>`;
  }
  const count = dd => (Array.isArray(dd && dd.questions) ? dd.questions.length : 0);
  function search(dd, needle, max) {
    const want = String(needle || '').toLowerCase(); if (!want) return [];
    const out = [];
    for (const q of (Array.isArray(dd && dd.questions) ? dd.questions : [])) {
      const text = [q.text || '', q.body || '', q.t === 'cloze' ? C.clozePlain(q.src, true) : '', ...(q.opts || []).map(o => o.text || ''), ...(q.pairs || []).map(p => `${p.l || ''} ${p.r || ''}`), ...(q.t === 'text' && Array.isArray(q.ans) ? q.ans : [])].filter(Boolean).join(' · ');
      const i = text.toLowerCase().indexOf(want); if (i < 0) continue;
      const start = Math.max(0, i - 30);
      out.push({ itemId: q.id, text: (start > 0 ? '…' : '') + text.slice(start, i + want.length + 60).replace(/\s+/g, ' ') });
      if (out.length >= (max || 12)) break;
    }
    return out;
  }
  function reveal(qid) {
    const dd = d(); if (!dd || !active()) return;
    if (!qsOf(dd).some(q => q.id === qid)) return;
    cur = qid; renderList(); renderEdit();
    const c = $(`#qz-list .qz-card[data-q="${qid}"]`); if (c) { c.scrollIntoView({ block: 'nearest' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1500); }
  }

  return { newDoc, open, leave, remoteChanged, undo, redo, exportPDF, preview, count, search, reveal, startTest, startLive, openResults, openAppearance, isLive: () => !!live };
})();
