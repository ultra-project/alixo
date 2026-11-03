/* ============================================================
   Alixo — Fiche de révision « sketchnote » (1.49, Alixo+ ; avant 1.49 : dans js/aiquiz.js)
   La carte « Fiche de révision » du panneau Alixo AI (js/coco.js) ouvre une fenêtre (#cocofiche, openDialog) :
   AlixoAI (js/alixoai.js, tâche 'sheet') lit le document et rédige une fiche en sections typées — À retenir !,
   Les grandes idées, Définitions, Dates clés, Formules, Mots-clés, Astuce, Pièges, Exemples (et « partie » pour un
   titre libre). Chaque section devient une carte pastel avec son icône (AlixoIcons), ses mots en gras, ses cases à
   cocher (À retenir) ; les cartes apparaissent une à une pendant la génération.
   Les cases « À retenir » se cochent au clic ou au clavier (Espace / Entrée, role="checkbox") ; un clic sur un mot-clé
   demande à Coco de l'expliquer (AlixoCoco.send, la réponse arrive dans le fil derrière la fenêtre).
   Ensuite : insertion à la fin de la séance en blocs (titre, encadrés À retenir / Définition / Exemple, tableau des
   dates, listes), nouvelle séance, copie du texte, impression couleur (#coco-print, coco.css § impression).
   TYPES est la source unique : titre, icône, couleurs (clair / sombre / encre), bloc cible de chaque type.
   Sécurité : tout texte du modèle passe par AlixoCoco.md.inline (esc() puis **gras** / `code`) ; les blocs insérés ne
   contiennent que <b>, <i>, <br>, <code> produits ici.
   Chargé APRÈS app.js, aiquiz.js (docText) et AVANT coco.js : utilise les globales (findDoc, state, save, openDoc,
   openDialog, renderBlocks, specAllowed, todayKey, toast, esc, uid, AlixoAI, AlixoIcons).
   ============================================================ */
'use strict';

window.AlixoFiche = (() => {
  const S = s => String(s ?? '').trim();
  const DLG = 'cocofiche';
  const TYPES = {
    retenir:     { title: 'À retenir !',       ico: 'pin',       light: '#f6e7a1', dark: '#5a4a0a', ink: '#6b5300', block: { callout: 'retenir' } },
    idees:       { title: 'Les grandes idées', ico: 'lightbulb', light: '#cfe3f7', dark: '#1f3a55', ink: '#1d4f80', block: { h: 'Les grandes idées', li: 'ul' } },
    definitions: { title: 'Définitions',       ico: 'book-open', light: '#d4eedd', dark: '#1f4030', ink: '#1f6b43', block: { callout: 'definition' } },
    dates:       { title: 'Dates clés',        ico: 'calendar',  light: '#fde1c6', dark: '#55361c', ink: '#9a4f12', block: { table: ['Date', 'Événement'] } },
    formules:    { title: 'Formules',          ico: 'sigma',     light: '#cdeeea', dark: '#17403d', ink: '#116b63', block: { h: 'Formules', li: 'ul' } },
    mots:        { title: 'Mots-clés',         ico: 'key',       light: '#e4d9f5', dark: '#3a2d58', ink: '#5a3d9a', block: { p: 'chips' } },
    astuce:      { title: 'Astuce',            ico: 'zap',       light: '#fbd9e3', dark: '#55283a', ink: '#a12c57', block: { callout: 'mnemo', fallback: { h: 'Astuce', li: 'ul' } } },
    pieges:      { title: 'Pièges',            ico: 'flag',      light: '#f9d2cf', dark: '#542626', ink: '#b03030', block: { h: 'Pièges à éviter', li: 'ul' } },
    exemples:    { title: 'Exemples',          ico: 'target',    light: '#e9e2d3', dark: '#403828', ink: '#5f4e3a', block: { callout: 'exemple' } },
    partie:      { title: '',                  ico: 'clipboard', light: '#e6e9ee', dark: '#2e333b', ink: '#3b4653', block: { h: '§', li: 'ul' } }
  };
  const ICON = window.AlixoAIQuiz ? AlixoAIQuiz.ICON : '';
  const I = {
    doc: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
    print: '<svg viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3"/><rect x="7" y="14" width="10" height="7"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 8M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-14 5.3L4 16M4 20v-4h4"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'
  };
  const md = t => (window.AlixoCoco ? AlixoCoco.md.inline(t) : esc(t));
  const ico = n => (window.AlixoIcons ? AlixoIcons.svg(n) : '');
  const typeOf = sec => TYPES[sec.type] || TYPES.partie;
  const secTitle = sec => (sec.type === 'partie' ? S(sec.title) || 'Partie' : typeOf(sec).title);
  const srcReadOnly = d => !!(typeof isSharedDoc === 'function' && isSharedDoc(d.id) && !(window.AlixoShare && AlixoShare.canWrite(d.id)));
  const isDoc = d => !d.kind || d.kind === 'doc';
  /* texte brut d'un bloc : analyse inerte (DOMParser), jamais d'innerHTML */
  const strip = h => { try { return (new DOMParser().parseFromString(String(h ?? ''), 'text/html').body.textContent || '').trim(); } catch { return ''; } };
  const confirmNew = () => (typeof confirmDialog === 'function' ? confirmDialog({ title: 'Remplacer cette fiche par une nouvelle ?', text: 'Les cases cochées seront perdues.', ok: 'Nouvelle fiche', danger: false }) : Promise.resolve(window.confirm('Remplacer cette fiche par une nouvelle ? Les cases cochées seront perdues.')));

  /* l'état de la fiche d'une session de coco.js */
  function ficheState(session) {
    if (session.fiche) return session.fiche;
    const f = { result: null, gen: null, done: false, error: '', root: null, card: null, close: null, session };
    session.fiche = f;
    return f;
  }

  /* ---------------- la fenêtre ---------------- */
  function openWin(session) {
    if (!session || !window.openDialog) return;
    const f = ficheState(session);
    if (f.root && document.getElementById(DLG)) return;
    const d = session.d; const canInsert = isDoc(d) && !srcReadOnly(d);
    openDialog({ id: DLG, cls: 'wide coco-dlg coco-fiche-dlg', eyebrow: 'Alixo AI · ' + esc(session.title), title: 'Fiche de révision',
      body: `<div class="fiche-wrap"><div class="aq-scope fiche-gen" hidden></div><article class="fiche" hidden></article></div>`,
      foot: `${canInsert ? `<button class="cta" type="button" data-fi="insert" title="Ajouter la fiche à la fin de cette séance (titres, encadrés, tableau des dates, listes) — Ctrl+Z pour annuler">${I.doc}Insérer à la fin de la séance</button>` : ''}
        <button class="cta ${canInsert ? 'ghost' : ''}" type="button" data-fi="newdoc" title="Créer une séance « Fiche de révision » dans le même dossier">${I.doc}Nouvelle séance</button>
        <button class="cta ghost" type="button" data-fi="copy">${I.copy}Copier le texte</button>
        <button class="cta ghost" type="button" data-fi="print" title="Imprimer ou enregistrer en PDF, en couleur">${I.print}Imprimer / PDF</button>
        <button class="cta ghost" type="button" data-fi="regen" title="Demander une nouvelle fiche à AlixoAI">${I.replay}Nouvelle fiche</button>
        <span class="dlg-spacer"></span><button class="cta ghost" type="button" data-dlg-close>Fermer</button>`,
      onMount(card, close) {
        f.root = card.querySelector('.fiche'); f.card = card; f.close = close;
        card.addEventListener('click', e => onClick(e, f));
        card.addEventListener('keydown', e => onKey(e, f));
        if (f.result && f.done) showFiche(f); else generate(f);
      },
      onClose() { if (f.gen) cancel(f); f.root = null; f.card = null; f.close = null; } });
  }
  function onClick(e, f) {
    const box = e.target.closest('.fiche-check li'); if (box && f.root && f.root.contains(box)) { toggleBox(box); return; }
    const chip = e.target.closest('.fiche-chips [role="button"]'); if (chip && f.root && f.root.contains(chip)) { askWord(f, chip); return; }
    const b = e.target.closest('[data-fi]'); if (!b) return;
    const a = b.dataset.fi;
    if (a === 'cancel') { cancel(f); if (f.close) f.close(); return; }
    if (a === 'retry') { generate(f); return; }
    if (a === 'regen') { if (f.done && f.result) confirmNew().then(y => { if (y && f.card) generate(f); }); else generate(f); return; }
    if (!f.done || !f.result) return;
    if (a === 'insert') { insert(f.session, 'append'); return; }
    if (a === 'newdoc') { insert(f.session, 'new'); return; }
    if (a === 'copy') { copy(f, b); return; }
    if (a === 'print') { printFiche(f); return; }
  }
  /* clavier dans la fenêtre : Espace / Entrée sur une case à cocher ou un mot-clé */
  function onKey(e, f) {
    if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Spacebar') return;
    const t = e.target; if (!t || !f.root || !f.root.contains(t)) return;
    if (t.matches('.fiche-check li')) { e.preventDefault(); toggleBox(t); }
    else if (t.matches('.fiche-chips [role="button"]')) { e.preventDefault(); askWord(f, t); }
  }
  function toggleBox(li) { const on = !li.classList.contains('done'); li.classList.toggle('done', on); li.setAttribute('aria-checked', on ? 'true' : 'false'); }
  /* un mot-clé → question à Coco dans le fil (la fenêtre reste ouverte : la réponse est visible après sa fermeture) */
  function askWord(f, chip) {
    const w = S(chip.textContent); if (!w || !window.AlixoCoco) return;
    AlixoCoco.send(`Explique-moi « ${w} »`, f.session);
    toast(`Coco explique « ${w} » dans le fil`, { duration: 2500 });
  }
  const setButtons = (f, on) => { if (!f.card) return; f.card.querySelectorAll('.dlg-foot [data-fi]').forEach(b => { b.disabled = b.dataset.fi === 'regen' ? !!f.gen : !on; }); };

  /* ---------------- génération progressive ---------------- */
  function showGen(f, partial) {
    const g = f.card && f.card.querySelector('.fiche-gen'); if (!g) return;
    g.hidden = false; g.classList.toggle('partial', !!partial);
    g.innerHTML = `<div class="aq-gen"><div class="aq-orb"><span></span><span></span><span></span><em>${ICON}</em></div>
      <div class="aq-gtxt"><b class="aq-gstep">${partial ? 'La suite arrive…' : 'Lecture du cours…'}</b><p class="aq-gsub">AlixoAI rédige la fiche sur cet ordinateur : à retenir, grandes idées, définitions, dates, mots-clés, astuces et pièges — les cartes apparaissent une à une.</p></div>
      <div class="aq-gbar"><i style="width:${partial ? 60 : 8}%"></i></div>
      <button type="button" class="aq-btn ghost" data-fi="cancel">Annuler</button></div>`;
  }
  function hideGen(f) { const g = f.card && f.card.querySelector('.fiche-gen'); if (g) { g.hidden = true; g.innerHTML = ''; } }
  async function generate(f) {
    const s = f.session;
    if (f.gen) return;
    if (!window.AlixoAI) return;
    const gen = { token: AlixoAI.newToken(), sections: [] }; f.gen = gen; f.done = false; f.error = '';
    f.result = { title: s.title ? 'Fiche de révision — ' + s.title : 'Fiche de révision', resume: '', sections: [] };
    if (f.root) { f.root.hidden = true; f.root.innerHTML = ''; }
    showGen(f, false); setButtons(f, false);
    try {
      const res = await AlixoAI.run('sheet', { title: s.title, text: s.text }, { token: gen.token, onItem: (sec, i) => {
        if (f.gen !== gen) return;
        f.result.sections[i] = sec;
        appendCard(f, sec, i);
        const el = f.card && f.card.querySelector('.aq-gstep'); if (el) el.textContent = `« ${secTitle(sec)} » rédigée — la suite arrive…`;
        const bar = f.card && f.card.querySelector('.aq-gbar i'); if (bar) bar.style.width = Math.min(90, 20 + 12 * (i + 1)) + '%';
      } });
      if (f.gen !== gen) return;
      f.gen = null;
      f.result = { title: S(res.title) || f.result.title, resume: S(res.resume), sections: res.sections.filter(x => x.items && x.items.length), tokIn: res.tokIn, tokOut: res.tokOut, model: res.model };
      if (!f.result.sections.length) throw new Error('Fiche vide — réessayez.');
      f.done = true;
      showFiche(f);
      if (window.AlixoCoco) AlixoCoco.post({ role: 'note', text: `Fiche prête : « ${f.result.title} » (${f.result.sections.length} carte${f.result.sections.length > 1 ? 's' : ''})`, actions: [{ name: 'fiche-open' }].concat(isDoc(s.d) && !srcReadOnly(s.d) ? [{ name: 'fiche-insert' }] : []) }, s);
    } catch (err) {
      if (f.gen !== gen) return;
      f.gen = null; f.error = err && err.message || String(err);
      f.done = false; f.result = null;
      showError(f);
    }
  }
  function cancel(f) { if (f.gen) { AlixoAI.cancel(f.gen.token); f.gen = null; } f.result = f.done ? f.result : null; hideGen(f); setButtons(f, f.done); }
  function showError(f) {
    hideGen(f); setButtons(f, false);
    if (!f.root) return;
    f.root.hidden = false;
    f.root.innerHTML = `<div class="aq-scope"><div class="aq-empty aq-err"><div class="aq-eico ko">✕</div><b>Ça n’a pas marché.</b><p>${esc(f.error || '')}</p><div class="aq-actions"><button type="button" class="aq-btn primary" data-fi="retry">${I.replay}<span>Réessayer</span></button></div></div></div>`;
  }
  /* la fiche complète (titre et résumé définitifs) */
  function showFiche(f) {
    hideGen(f); setButtons(f, true);
    if (!f.root) return;
    f.root.hidden = false;
    f.root.outerHTML = ficheHTML(f.result, { source: f.session.title });
    f.root = f.card.querySelector('.fiche');
  }
  /* pendant la génération : la fiche devient visible dès la première carte */
  function appendCard(f, sec, i) {
    if (!f.root) return;
    if (f.root.hidden) { f.root.hidden = false; f.root.innerHTML = `<header class="fiche-title"><h2>${esc(f.result.title)}</h2></header><div class="fiche-top"></div><div class="fiche-grid"></div>`; showGen(f, true); }
    const grid = f.root.querySelector(sec.type === 'retenir' ? '.fiche-top' : '.fiche-grid'); if (grid) grid.insertAdjacentHTML('beforeend', cardHTML(sec, i));
  }

  /* ---------------- rendu sketchnote ---------------- */
  function ficheHTML(f, o = {}) {
    const secs = (f.sections || []).filter(x => x && x.items && x.items.length);
    const top = secs.filter(x => x.type === 'retenir'), rest = secs.filter(x => x.type !== 'retenir');   // « À retenir ! » pleine largeur, puis colonnes
    return `<article class="fiche">
      <header class="fiche-title"><h2>${esc(f.title)}</h2>${f.resume ? `<p class="fiche-resume">${md(f.resume)}</p>` : ''}</header>
      <div class="fiche-top">${top.map(cardHTML).join('')}</div>
      <div class="fiche-grid">${rest.map((x, i) => cardHTML(x, i + top.length)).join('')}</div>
      <footer class="fiche-foot">Fiche préparée par Alixo AI${o.source ? ` à partir de « ${esc(o.source)} »` : ''} — à relire avec le cours.</footer>
    </article>`;
  }
  function cardHTML(sec, i) {
    const t = typeOf(sec); const items = sec.items || [];
    const style = `--fc-light:${t.light};--fc-dark:${t.dark};--fc-ink:${t.ink};--i:${i || 0}`;
    let body;
    if (sec.type === 'retenir') body = `<ul class="fiche-check">${items.map(x => `<li role="checkbox" tabindex="0" aria-checked="false"><i class="fiche-box"></i><span>${itemHTML(x)}</span></li>`).join('')}</ul>`;
    else if (sec.type === 'dates') body = `<ol class="fiche-timeline">${items.map(x => `<li><b>${md(x.date || x.term || '')}</b><span>${md(x.text || x.def || '')}</span></li>`).join('')}</ol>`;
    else if (sec.type === 'formules') body = `<ul class="fiche-formulas">${items.map(x => (x.date || x.term) ? `<li><b>${md(x.date || x.term)}</b><code>${esc(x.text || x.def || '')}</code></li>` : `<li>${itemHTML(x)}</li>`).join('')}</ul>`;
    else if (sec.type === 'mots') body = `<div class="fiche-chips">${items.map(x => `<span role="button" tabindex="0" title="Demander à Coco d’expliquer ce mot">${md(x.text || x.term || '')}</span>`).join('')}</div>`;
    else if (sec.type === 'astuce') body = `<ul class="fiche-astuce">${items.map(x => `<li>${itemHTML(x)}</li>`).join('')}</ul>`;
    else if (items.every(x => x.term)) body = `<dl>${items.map(x => `<dt>${md(x.term)}</dt><dd>${md(x.def)}</dd>`).join('')}</dl>`;
    else body = `<ul>${items.map(x => `<li>${itemHTML(x)}</li>`).join('')}</ul>`;
    return `<section class="fiche-card" data-k="${esc(sec.type)}" style="${style}"><h3>${ico(t.ico)}<span>${esc(secTitle(sec))}</span></h3>${body}</section>`;
  }
  const itemHTML = x => (x.term ? `<b>${md(x.term)}</b> : ${md(x.def)}` : x.date ? `<b>${md(x.date)}</b> : ${md(x.text)}` : md(x.text || ''));

  /* ---------------- la fiche → blocs de séance ---------------- */
  function sheetBlocks(f) {
    const out = []; const mk = b => Object.assign({ id: uid() }, b, typeof todayKey === 'function' ? { day: todayKey() } : {});
    const mkList = (title, items) => { if (title) out.push(mk({ type: 'h', level: 2, text: esc(title) })); items.forEach(x => out.push(mk({ type: 'li', lt: 'ul', text: itemHTML(x) }))); };
    out.push(mk({ type: 'h', level: 1, text: esc(f.title) }));
    if (f.resume) out.push(mk({ type: 'p', text: `<i>${md(f.resume)}</i>` }));
    for (const sec of (f.sections || []).filter(x => x.items && x.items.length)) {
      const t = typeOf(sec); const b = t.block; const items = sec.items;
      if (b.callout === 'retenir' || b.callout === 'exemple') { out.push(mk({ type: 'callout', ct: b.callout, text: items.map(x => '- ' + itemHTML(x)).join('<br>') })); continue; }
      if (b.callout === 'definition') { items.forEach(x => out.push(mk({ type: 'callout', ct: 'definition', text: x.term ? `<b>${md(x.term)}</b> : ${md(x.def)}` : itemHTML(x) }))); continue; }
      if (b.callout === 'mnemo') {
        if (typeof specAllowed === 'function' && specAllowed('sante')) out.push(mk({ type: 'callout', ct: 'mnemo', text: items.map(x => '- ' + itemHTML(x)).join('<br>') }));
        else mkList(b.fallback.h, items);
        continue;
      }
      if (b.table) { out.push(mk({ type: 'table', head: true, rows: [b.table.slice()].concat(items.map(x => [md(x.date || x.term || ''), md(x.text || x.def || '')])) })); continue; }
      if (b.p === 'chips') { out.push(mk({ type: 'h', level: 2, text: esc(t.title) }), mk({ type: 'p', text: items.map(x => `<b>${md(x.text || x.term || '')}</b>`).join(' · ') })); continue; }
      mkList(sec.type === 'partie' ? S(sec.title) || 'Partie' : b.h, items);
    }
    return out;
  }
  const mkPb = () => Object.assign({ id: uid(), type: 'pb' }, typeof todayKey === 'function' ? { day: todayKey() } : {});
  function insert(session, where) {
    const f = session && session.fiche && session.fiche.done ? session.fiche.result : null; if (!f) { toast('La fiche n’est pas prête'); return; }
    const blocks = sheetBlocks(f);
    const closeWin = () => { if (session.fiche.close) session.fiche.close(); };
    if (where === 'append') {
      const d = findDoc(session.d.id); if (!d || !Array.isArray(d.blocks)) { toast('La séance n’existe plus'); return; }
      if (srcReadOnly(d)) { toast('Séance en lecture seule'); return; }
      const last = d.blocks[d.blocks.length - 1];
      if (last && last.type === 'p' && !strip(last.text)) d.blocks.pop();
      d.blocks.push(mkPb(), ...blocks);
      d.updatedAt = Date.now(); save();
      closeWin();
      openDoc(d.id);   // on revient sur la séance, le curseur au début de la fiche
      if (typeof renderBlocks === 'function') setTimeout(() => renderBlocks(blocks[0].id, 'start'), 30);
      toast('Fiche de révision ajoutée à la fin de la séance (Ctrl+Z pour annuler)', { duration: 6000 });
      return;
    }
    const d0 = findDoc(session.d.id) || session.d;
    const nd = { id: uid(), folderId: (srcReadOnly(d0) || (typeof isSharedDoc === 'function' && isSharedDoc(d0.id))) ? null : (d0.folderId || null), titre: f.title, createdAt: Date.now(), updatedAt: Date.now(), pinned: false, prof: session.d.prof || '', blocks, aiFrom: { docId: session.d.id, title: session.title, at: Date.now() } };
    state.docs.push(nd); save();
    closeWin();
    openDoc(nd.id);
    toast(`Séance « ${f.title} » créée`, { duration: 5000 });
  }

  /* ---------------- copie et impression ---------------- */
  const itemText = x => (x.term ? `${x.term} : ${x.def}` : x.date ? `${x.date} : ${x.text}` : String(x.text || '')).replace(/\*\*/g, '');
  function ficheText(f) {
    const L = [String(f.title || '').toUpperCase(), ''];
    if (f.resume) L.push(f.resume.replace(/\*\*/g, ''), '');
    for (const sec of (f.sections || []).filter(x => x.items && x.items.length)) { L.push(secTitle(sec).toUpperCase()); sec.items.forEach(x => L.push('• ' + itemText(x))); L.push(''); }
    return L.join('\n').trim();
  }
  async function copy(f, btn) {
    try { await navigator.clipboard.writeText(ficheText(f.result)); const t = btn.lastChild; const old = t.textContent; t.textContent = 'Copié !'; setTimeout(() => { t.textContent = old; }, 1500); }
    catch { toast('Copie impossible dans ce navigateur'); }
  }
  /* impression couleur dans la page même (#coco-print, règles dans coco.css) */
  function printFiche(f) {
    if (!f.result) return;
    let box = document.getElementById('coco-print');
    if (!box) { box = document.createElement('div'); box.id = 'coco-print'; document.body.appendChild(box); }
    box.innerHTML = ficheHTML(f.result, { print: true, source: f.session.title });
    document.body.classList.add('coco-printing');
    const done = () => { window.removeEventListener('afterprint', done); document.body.classList.remove('coco-printing'); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('coco-printing')) done(); }, 500); }, 50);
  }

  return { openDialog: openWin, insert, ficheHTML, sheetBlocks, ficheText, TYPES };
})();
