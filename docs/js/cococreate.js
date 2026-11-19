/* ============================================================
   Alixo — Coco crée des documents (1.55, Alixo+) : js/cococreate.js
   Le bouton « IA » de la bibliothèque (#btn-ai-new, à droite de « Nouveau ») ouvre au centre de l'écran une barre de
   commande (#cococreate, fond flouté) : grand champ « Que voulez-vous créer ? », type en puces (Séance, Présentation,
   Tableur, Planche, Quiz, Fiche de révision), source facultative (« à partir de la séance… »), idées d'exemple, bouton
   Créer (Entrée). Échap ou un clic dehors ferme.
   Flux (start) : disponibilité d'AlixoAI vérifiée (web / téléphone / modèle absent / désactivée : message utile dans la
   barre) → Alixo+ (comme Coco : requirePlus('quizia')) → document vide du type choisi, dans le dossier courant (ou celui
   de la séance source), marqué aiFrom = { kind: 'create', as, prompt, at, docId?, title? } → state.docs, save, openDoc →
   panneau Coco ouvert (AlixoCoco.create) qui montre la progression pendant que le contenu s'écrit, par commandes du
   registre fermé (js/cocotools.js : create), annulables.
   Le chat de Coco y passe aussi (intention « créer », AlixoCocoTools.matchCreate → start).
   Sécurité : la demande n'est jamais injectée en HTML (esc) ; le contenu du modèle passe par le registre (safe / plain).
   Chargé APRÈS app.js, alixoai.js, cocotools.js, coco.js, artefacts.js.
   ============================================================ */
'use strict';

window.AlixoCocoCreate = (() => {
  const S = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const A = () => window.AlixoApp || {};
  const e = t => (A().esc ? A().esc(String(t ?? '')) : String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]));
  const cut = (t, n) => { t = S(t); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const ID = 'cococreate';
  const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7Z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/></svg>';
  /* types proposés : as (cocotools) → kind de AlixoApp.newDocOfKind */
  const TYPES = [
    { as: 'doc', make: 'doc', label: 'Séance', ph: 'Un cours sur…', ico: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
      ex: ['Un cours sur la prescription extinctive', 'Les grandes étapes de la Révolution française', 'Introduction à l’offre et à la demande'] },
    { as: 'slides', make: 'slide', label: 'Présentation', ph: 'Un exposé sur…', ico: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/></svg>',
      ex: ['Exposé de dix minutes sur le réchauffement climatique', 'La Révolution française en huit diapositives', 'Présenter le cycle de Krebs'] },
    { as: 'sheet', make: 'sheet', label: 'Tableur', ph: 'Un tableau pour…', ico: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/></svg>',
      ex: ['Budget mensuel d’un étudiant', 'Planning de révisions sur quatre semaines', 'Dates clés de la Ve République'] },
    { as: 'board', make: 'planche', label: 'Planche', ph: 'Une carte mentale sur…', ico: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M14 17h6M17 14v6"/></svg>',
      ex: ['Carte mentale du droit des contrats', 'Les causes de la Première Guerre mondiale', 'Idées pour un mémoire de marketing'] },
    { as: 'quiz', make: 'quiz', label: 'Quiz', ph: 'Un quiz sur…', ico: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7.5 12 2.5 2.5 6-6"/></svg>',
      ex: ['Dix questions sur la photosynthèse', 'QCM sur les institutions de la Ve République', 'Quiz sur les figures de style'] },
    { as: 'fiche', make: 'doc', label: 'Fiche de révision', ph: 'Une fiche sur…', ico: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5Z"/><path d="M8 8h8M8 12h5"/><path d="m14 15 1.5 1.5L19 13"/></svg>',
      ex: ['La responsabilité civile', 'L’essentiel du système nerveux', 'Les grands courants philosophiques'] }
  ];
  const typeOf = as => TYPES.find(t => t.as === as) || TYPES[0];
  let sel = 'doc', srcSel = '', opener = null, busy = false;

  /* ---------------- disponibilité ---------------- */
  /* → { ok, html } : html = message utile (application PC / Mac, modèle à installer, désactivée…) */
  function availability() {
    const AI = window.AlixoAI; const E = window.AlixoEngine;
    const st = AI ? AI.state() : 'web';
    if (AI && AI.ready()) return { ok: true, html: '' };
    const btn = (act, label, primary) => `<button type="button" class="cc-nbtn${primary ? ' primary' : ''}" data-cc="${act}">${e(label)}</button>`;
    if (st === 'web') return { ok: false, st, html: `<b>Coco crée des documents dans l’application Alixo pour Windows et Mac.</b><p>L’IA y tourne directement sur l’ordinateur : rien n’est envoyé à un service en ligne, sans limite d’utilisation. Vos documents créés ici se retrouvent ensuite partout.</p><a class="cc-nbtn primary" href="${e(E ? E.DOWNLOAD_URL : 'https://alixoapp.com/index.html?site#telecharger')}" target="_blank" rel="noopener">Télécharger l’application Alixo</a>` };
    if (st === 'nomodel') return { ok: false, st, html: `<b>AlixoAI n’est pas encore installée sur cet ordinateur.</b><p>Un seul téléchargement suffit : ensuite, Coco crée vos documents directement sur l’ordinateur, sans rien envoyer en ligne.</p>${btn('install', 'Installer AlixoAI', true)}${btn('settings', 'Paramètres › IA')}` };
    if (st === 'downloading') return { ok: false, st, html: `<b>AlixoAI est en cours de téléchargement.</b><p>Coco pourra créer vos documents dès la fin du téléchargement.</p>${btn('install', 'Voir le téléchargement', true)}` };
    if (st === 'off') return { ok: false, st, html: `<b>AlixoAI est désactivée sur cet appareil.</b><p>Réactivez-la pour que Coco puisse créer des documents.</p>${btn('settings', 'Paramètres › IA', true)}` };
    return { ok: false, st, html: `<b>AlixoAI n’est pas disponible pour le moment.</b><p>${e(AI ? AI.available().reason : '')}</p>${btn('settings', 'Paramètres › IA', true)}` };
  }
  /* message court (chat de Coco, appel direct) */
  function unavailableText() {
    const st = window.AlixoAI ? AlixoAI.state() : 'web';
    if (st === 'web') return 'Je crée des documents dans l’application Alixo pour Windows et Mac (l’IA tourne sur l’ordinateur).';
    if (st === 'nomodel') return 'AlixoAI n’est pas encore installée sur cet ordinateur : Paramètres › IA.';
    if (st === 'downloading') return 'AlixoAI est en cours de téléchargement : je pourrai créer ce document dès la fin.';
    if (st === 'off') return 'AlixoAI est désactivée (Paramètres › IA › Activer).';
    return (window.AlixoAI && AlixoAI.available().reason) || 'AlixoAI n’est pas disponible pour le moment.';
  }

  /* ---------------- séances pouvant servir de source ---------------- */
  const isSeance = d => d && (!d.kind || d.kind === 'doc');
  function sources() {
    const st = A().getState ? A().getState() : null; if (!st) return [];
    return st.docs.filter(d => isSeance(d) && !(d.aiFrom && d.aiFrom.kind === 'create' && !textOf(d))).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 60);
  }
  function textOf(d) {
    if (!d) return '';
    try { const t = window.AlixoAIQuiz ? String(AlixoAIQuiz.docText(d) || '') : ''; return S(t) ? t : ''; } catch { return ''; }
  }

  /* ---------------- création ----------------
     { as, prompt, sourceId?, from: 'palette' | 'chat' } → { ok, id } | { error } */
  async function start(o) {
    o = o || {};
    const t = typeOf(o.as); const prompt = S(o.prompt).slice(0, 600);
    if (busy) return { error: 'Une création est déjà en cours de préparation.' };
    if (!window.AlixoAI || !AlixoAI.ready()) return { error: unavailableText() };
    if (A().isPlus && !A().isPlus()) { if (A().requirePlus) A().requirePlus('quizia'); return { error: 'La création de documents avec Coco fait partie d’Alixo+.' }; }
    const st = A().getState && A().getState(); if (!st || !A().newDocOfKind) return { error: 'La bibliothèque n’est pas prête.' };
    const src = o.sourceId ? (typeof findDoc === 'function' ? findDoc(o.sourceId) : st.docs.find(d => d.id === o.sourceId)) : null;
    let source = null;
    if (src) {
      const text = src.kind === 'quiz' ? '' : textOf(src);
      if (S(text)) source = { title: S(src.titre) || 'Sans titre', text };
    }
    if (!prompt && !source) return { error: 'Décrivez ce que vous voulez créer.' };
    busy = true;
    try {
      const d = A().newDocOfKind(t.make);
      /* dossier : celui de la séance source (si elle est à soi), sinon le dossier courant de la bibliothèque */
      const shared = id => typeof isSharedDoc === 'function' && isSharedDoc(id);
      let fid = src && !shared(src.id) && st.docs.includes(src) ? (src.folderId || null) : (A().currentFolderId ? A().currentFolderId() : null);
      if (fid && A().folder && !A().folder(fid)) fid = null;
      d.folderId = fid || null;
      if (A().folderProf) { try { d.prof = A().folderProf(fid) || d.prof || ''; } catch { /* */ } }
      const subject = prompt ? cap(cut(prompt.replace(/^(cr[ée]e[sz]?|g[ée]n[èe]re[sz]?|fais|pr[ée]pare[sz]?)(-moi)?\s+(un|une|des)?\s*/i, ''), 80)) : '';
      d.titre = subject || (source ? `${t.label} — ${cut(source.title, 70)}` : '');
      d.aiFrom = Object.assign({ kind: 'create', as: t.as, prompt: cut(prompt || `À partir de « ${source.title} »`, 300), at: Date.now() }, src ? { docId: src.id, title: cut(S(src.titre) || 'Sans titre', 120) } : {});
      d.updatedAt = Date.now();
      st.docs.push(d);
      if (A().save) A().save();
      close(true);
      A().openDoc(d.id);
      await new Promise(r => setTimeout(r, 80));   // la vue du document se monte (présentation, tableur, planche, quiz)
      const label = `${t.label} : ${prompt || `à partir de « ${source.title} »`}`;
      const fullPrompt = source && prompt ? prompt : source ? `${t.label} à partir du cours « ${source.title} »` : prompt;
      if (window.AlixoCoco) AlixoCoco.create(d, { as: t.as, prompt: fullPrompt, subject, label, source });
      if (window.AlixoArtefacts && AlixoArtefacts.refresh) AlixoArtefacts.refresh();
      return { ok: true, id: d.id };
    } catch (err) {
      console.error(err);
      return { error: 'Je n’ai pas pu créer ce document.' };
    } finally { busy = false; }
  }

  /* ---------------- la barre de commande ---------------- */
  const root = () => document.getElementById(ID);
  const isOpen = () => !!root();
  function open(preset) {
    preset = preset || {};
    if (isOpen()) { const i = root().querySelector('.cc-input'); if (i) i.focus(); return; }
    if (preset.as) sel = typeOf(preset.as).as;
    srcSel = preset.sourceId || '';
    opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    const ov = document.createElement('div');
    ov.id = ID; ov.className = 'cc-ov';
    ov.innerHTML = `<div class="cc-pal" role="dialog" aria-modal="true" aria-labelledby="cc-h">
      <h2 id="cc-h" class="cc-sr">Créer avec Coco</h2>
      <form class="cc-form" novalidate>
        <div class="cc-inrow"><span class="cc-spark">${SPARK}</span>
          <textarea class="cc-input" rows="1" maxlength="600" placeholder="Que voulez-vous créer ?" aria-label="Que voulez-vous créer ?"></textarea>
          <button type="button" class="cc-esc" aria-label="Fermer" title="Fermer (Échap)">Échap</button></div>
        <div class="cc-types" role="radiogroup" aria-label="Type de document">${TYPES.map(x => `<button type="button" role="radio" class="cc-type" data-as="${x.as}" aria-checked="false">${x.ico}<span>${e(x.label)}</span></button>`).join('')}</div>
        <div class="cc-src"><label for="cc-srcsel">À partir de</label><select id="cc-srcsel" class="cc-srcsel"></select></div>
        <div class="cc-sugs" aria-label="Idées"></div>
        <div class="cc-note" role="status" hidden></div>
        <div class="cc-foot"><span class="cc-hint"><kbd>Entrée</kbd> pour créer · <kbd>Maj</kbd>+<kbd>Entrée</kbd> : retour à la ligne</span>
          <span class="cc-plus" hidden>Alixo+</span>
          <button type="submit" class="cc-go">${SPARK}<span>Créer</span></button></div>
        <p class="cc-legal">Contenu généré par AlixoAI, sur votre ordinateur : relisez-le, l’IA peut se tromper.</p>
      </form></div>`;
    document.body.appendChild(ov);
    document.body.classList.add('cc-open');
    const pal = ov.querySelector('.cc-pal'); const form = ov.querySelector('.cc-form'); const inp = ov.querySelector('.cc-input');
    ov.addEventListener('mousedown', ev => { if (ev.target === ov) close(); });
    ov.querySelector('.cc-esc').addEventListener('click', () => close());
    form.addEventListener('submit', ev => { ev.preventDefault(); submit(); });
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); submit(); } });
    inp.addEventListener('input', () => { autosize(inp); syncGo(); });
    ov.querySelector('.cc-srcsel').addEventListener('change', ev => { srcSel = ev.target.value; syncGo(); });
    pal.addEventListener('click', ev => {
      const ty = ev.target.closest('.cc-type'); if (ty) { sel = ty.dataset.as; syncTypes(); return; }
      const sg = ev.target.closest('.cc-sug'); if (sg) { inp.value = sg.dataset.v; autosize(inp); syncGo(); inp.focus(); return; }
      const b = ev.target.closest('[data-cc]'); if (!b) return;
      if (b.dataset.cc === 'install') { close(); if (typeof openAiModelDialog === 'function') openAiModelDialog(); }
      if (b.dataset.cc === 'settings') { close(); if (A().openSettings) A().openSettings('ia'); }
    });
    /* flèches dans le groupe de types (radiogroup) */
    ov.querySelector('.cc-types').addEventListener('keydown', ev => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
      ev.preventDefault();
      const i = TYPES.findIndex(x => x.as === sel); const k = (i + (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : TYPES.length - 1)) % TYPES.length;
      sel = TYPES[k].as; syncTypes(); const btn = ov.querySelector(`.cc-type[data-as="${sel}"]`); if (btn) btn.focus();
    });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('alixo-ai', syncNote);
    fillSources(); syncTypes(); syncNote(); syncGo();
    if (preset.prompt) { inp.value = preset.prompt; autosize(inp); syncGo(); }
    requestAnimationFrame(() => { ov.classList.add('in'); inp.focus(); });
  }
  function close(keepFocus) {
    const ov = root(); if (!ov) return;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('alixo-ai', syncNote);
    ov.remove(); document.body.classList.remove('cc-open');
    if (!keepFocus && opener && opener.isConnected) { try { opener.focus({ preventScroll: true }); } catch { /* */ } }
    opener = null;
  }
  /* Échap ferme (avant les autres raccourcis) ; Tab reste dans la barre */
  function onKey(ev) {
    const ov = root(); if (!ov) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); close(); return; }
    if (ev.key === 'Tab') {
      const f = [...ov.querySelectorAll('button:not([disabled]), textarea, select, a[href]')].filter(x => x.offsetParent !== null && x.tabIndex >= 0);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      else if (!ov.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
    }
  }
  const autosize = inp => { inp.style.height = 'auto'; inp.style.height = Math.min(160, inp.scrollHeight) + 'px'; };
  function fillSources() {
    const s = root() && root().querySelector('.cc-srcsel'); if (!s) return;
    const list = sources();
    if (srcSel && !list.some(d => d.id === srcSel)) srcSel = '';
    s.innerHTML = `<option value="">Aucune séance — sujet libre</option>${list.map(d => `<option value="${e(d.id)}">${e(cut(S(d.titre) || 'Sans titre', 60))}</option>`).join('')}`;
    s.value = srcSel;
    s.closest('.cc-src').hidden = !list.length;
  }
  function syncTypes() {
    const ov = root(); if (!ov) return;
    ov.querySelectorAll('.cc-type').forEach(b => { const on = b.dataset.as === sel; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    const t = typeOf(sel);
    ov.querySelector('.cc-input').placeholder = `Que voulez-vous créer ? ${t.ph}`;
    ov.querySelector('.cc-sugs').innerHTML = `<span class="cc-sugh">Idées</span>${t.ex.map(x => `<button type="button" class="cc-sug" data-v="${e(x)}">${e(x)}</button>`).join('')}`;
    syncGo();
  }
  function syncNote() {
    const ov = root(); if (!ov) return;
    const av = availability(); const n = ov.querySelector('.cc-note');
    n.hidden = av.ok; n.innerHTML = av.ok ? '' : av.html;
    n.dataset.st = av.st || '';
    ov.querySelector('.cc-plus').hidden = !(A().isPlus && !A().isPlus());
    syncGo();
  }
  function syncGo() {
    const ov = root(); if (!ov) return;
    const ok = availability().ok && !!(S(ov.querySelector('.cc-input').value) || srcSel);
    ov.querySelector('.cc-go').disabled = !ok;
  }
  async function submit() {
    const ov = root(); if (!ov) return;
    const inp = ov.querySelector('.cc-input');
    const av = availability();
    if (!av.ok) { syncNote(); shake(ov); return; }
    if (!S(inp.value) && !srcSel) { shake(ov); inp.focus(); return; }
    if (A().isPlus && !A().isPlus()) { close(true); if (A().requirePlus) A().requirePlus('quizia'); return; }
    const go = ov.querySelector('.cc-go'); go.disabled = true; go.classList.add('wait');
    const r = await start({ as: sel, prompt: inp.value, sourceId: srcSel, from: 'palette' });
    if (r && r.error && root()) { const n = root().querySelector('.cc-note'); n.hidden = false; n.innerHTML = `<b>${e(r.error)}</b>`; go.classList.remove('wait'); syncGo(); }
  }
  function shake(ov) { const p = ov.querySelector('.cc-pal'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); }

  /* ---------------- bouton « IA » de la bibliothèque ---------------- */
  function bind() {
    const b = document.getElementById('btn-ai-new'); if (!b || b.dataset.ccBound) return;
    b.dataset.ccBound = '1';
    b.textContent = 'IA';   // 1.55.1 : libellé seul, dans le style des autres boutons de la barre
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-label', 'Créer avec l’IA');   // 1.55 : le libellé visible « IA » seul ne dit pas l'action
    b.addEventListener('click', () => open());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();

  return { open, close, isOpen, start, availability, TYPES };
})();
