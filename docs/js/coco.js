/* ============================================================
   Alixo — Alixo AI : le panneau Coco (1.49, Alixo+)
   Le bouton « Alixo AI » (barre d'outils de la séance, barres des présentations et des tableurs) et F8 ouvrent un
   panneau sur la moitié droite de l'écran (#cocopanel, au niveau de <body> : il existe depuis les trois vues), comme
   le volet Document / PDF. Dedans : Coco, la mascotte, qui a lu le document ouvert et répond aux questions en
   direct (AlixoAI.run('chat'), js/alixoai.js, sur l'ordinateur) ; au-dessus du fil, deux cartes ouvrent une
   fenêtre : « Fiche de révision » (js/aifiche.js) et « Quiz » (js/aiquiz.js). Les résultats laissent une note dans
   le fil (« Quiz terminé : 7 / 10 », « Fiche prête ») avec des boutons d'action.
   - une session par document (texte lu, messages, état du quiz et de la fiche), gardée tant que l'onglet du document
     est ouvert (les sessions des onglets fermés sont libérées, 20 sessions au plus) ; le panneau suit le document
     affiché (sync(), appelé par openDoc, AlixoSlides.open, AlixoSheets.open) ;
   - un seul panneau droit à la fois (RIGHT_PANELS, app.js) : ouvrir le volet Document ferme Coco, et inversement ;
     passer par un onglet Word ou la bibliothèque le ferme aussi (closeRightPanels) — il faut le rouvrir (bouton / F8) ;
     en revanche une planche ou un quiz le masque seulement (CSS) : il revient en revenant à la séance ;
   - sécurité : tout texte du modèle passe par mdLite (esc() d'abord, puis **gras**, `code`, listes) — jamais de
     balise venue du modèle, jamais d'innerHTML avec un texte brut ;
   - extensibilité (1.50) : un message peut porter des actions [{ name, label, payload }] rendues en boutons ;
     registerAction(name, { label, icon, run(session, payload) }) les déclare. Ici : chat-retry, settings, quiz-replay,
     quiz-resume (quiz mis en pause en fermant la fenêtre), quiz-new, fiche-open, fiche-insert.
   Chargé APRÈS app.js, quizcore.js, aiquiz.js et aifiche.js : utilise leurs globales (doc, findDoc, state, save,
   openRightPanel, closeRightPanels, requirePlus, openSettings, openAiModelDialog, toast, esc, uid, AlixoAI…).
   ============================================================ */
'use strict';

window.AlixoCoco = (() => {
  const S = s => String(s ?? '').trim();
  const sessions = new Map();   // docId → session { d, title, text, cut, nWords, textAt, messages, gen, aiKey, quiz, fiche }
  let cur = null;               // session affichée
  const actions = new Map();    // nom → { label, icon, run(session, payload) }
  const MAX_SESSIONS = 20;
  let opener = null;            // élément qui avait le focus à l'ouverture (il le retrouve à la fermeture)
  const panel = () => document.getElementById('cocopanel');
  const bodyEl = () => panel().querySelector('.coco-body');
  const cardsEl = () => panel().querySelector('.coco-cards');
  const inputEl = () => panel().querySelector('.coco-input');
  const sendEl = () => panel().querySelector('.coco-send');
  const ICON = window.AlixoAIQuiz ? AlixoAIQuiz.ICON : '';
  const I = {
    sheet: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6Z"/><path d="M15 3v4h4M9 12h6M9 16h4"/></svg>',
    quiz: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7.5 12 2.5 2.5 6-6"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 8M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-14 5.3L4 16M4 20v-4h4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>'
  };

  /* ---------------- markdown minimal et sûr ----------------
     Ordre strict : esc() d'abord (tout « < » devient &lt;), puis lignes (puces « - », numéros « 1. », paragraphes),
     puis inline sur le texte déjà échappé : **gras**, `code`, _italique_ / *italique*. Aucun lien, aucune balise du
     modèle. aifiche.js utilise AlixoCoco.md.inline (sans listes). */
  function mdInline(t) {   // t : déjà échappé
    return t.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`\n]+?)`/g, '<code>$1</code>')
      .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s.,;:!?)]|$)/g, '$1<i>$2</i>')
      .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s.,;:!?)]|$)/g, '$1<i>$2</i>');
  }
  function mdLite(text) {
    const out = []; let list = null; let para = [];
    const flushP = () => { if (para.length) { out.push('<p>' + para.map(mdInline).join('<br>') + '</p>'); para = []; } };
    const flushL = () => { if (list) { out.push(`<${list.t}>` + list.items.map(x => '<li>' + mdInline(x) + '</li>').join('') + `</${list.t}>`); list = null; } };
    for (const raw of esc(text).split('\n')) {
      const line = raw.trim(); let m;
      if (!line) { flushP(); flushL(); continue; }
      if ((m = /^[-•*]\s+(.+)$/.exec(line))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
      if ((m = /^\d+[.)]\s+(.+)$/.exec(line))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
      flushL(); para.push(line.replace(/^#+\s*/, ''));   // un titre éventuel devient du texte simple
    }
    flushP(); flushL();
    return out.join('');
  }
  const md = { lite: mdLite, inline: t => mdInline(esc(t)) };

  /* ---------------- sessions ---------------- */
  const kindWord = d => (d.kind === 'slides' ? 'la présentation' : d.kind === 'sheet' ? 'le tableur' : 'la séance');
  const kindMine = d => (d.kind === 'slides' ? 'ta présentation' : d.kind === 'sheet' ? 'ton tableur' : 'ton cours');
  const docTitle = d => S(d.titre) || (d.kind === 'slides' ? 'Présentation' : d.kind === 'sheet' ? 'Tableur' : 'Séance');
  const words = t => (t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  function readDoc(s) {
    const Q = window.AlixoAIQuiz;
    const raw = Q ? Q.docText(s.d) : '';
    const { text, cut } = Q ? Q.shorten(raw) : { text: raw, cut: false };
    s.text = text; s.cut = cut; s.nWords = words(raw); s.textAt = s.d.updatedAt || 0; s.title = docTitle(s.d);
  }
  function session(d) {
    let s = sessions.get(d.id);
    if (s) { s.d = d; s.title = docTitle(d); sessions.delete(d.id); sessions.set(d.id, s); return s; }   // la plus récente en fin de Map
    prune(d.id);
    s = { d, title: '', text: '', cut: false, nWords: 0, textAt: -1, messages: [], gen: null, aiKey: '', quiz: null, fiche: null };
    readDoc(s);
    sessions.set(d.id, s);
    s.messages.push({ id: uid(), role: 'coco', sys: true, text: welcome(s) });
    return s;
  }
  /* les sessions des documents dont l'onglet est fermé sont libérées (sauf celle qui est affichée ou en cours de réponse),
     et la Map est bornée à MAX_SESSIONS (la plus ancienne part la première) */
  function prune(keepId) {
    const tabs = typeof openTabs !== 'undefined' && Array.isArray(openTabs) ? openTabs : null;   // app.js
    for (const [id, s] of [...sessions]) { if (id !== keepId && s !== cur && !s.gen && tabs && !tabs.includes(id)) sessions.delete(id); }
    for (const [id, s] of [...sessions]) { if (sessions.size < MAX_SESSIONS) break; if (id !== keepId && s !== cur && !s.gen) sessions.delete(id); }
  }
  /* le texte du cours est relu si le document a changé depuis (ouverture du panneau, changement de document, envoi) ;
     un document qui paraissait vide est toujours relu (il vient peut-être d'être rempli) */
  function refreshText(s) {
    if ((s.d.updatedAt || 0) === s.textAt && s.nWords >= 30) return;
    const before = s.nWords; readDoc(s);
    const m0 = s.messages[0]; if (m0 && m0.sys && before !== s.nWords) m0.text = welcome(s);
  }
  function welcome(s) {
    const n = s.nWords.toLocaleString('fr-FR');
    return `Salut ! Moi c’est Coco. J’ai lu ${s.cut ? 'le début de ' : ''}${kindMine(s.d)} « ${s.title} » (${n} mot${s.nWords > 1 ? 's' : ''}).\nPose-moi une question dessus, ou choisis une **fiche de révision** ou un **quiz** juste au-dessus.`;
  }

  /* ---------------- ouverture / fermeture ---------------- */
  const isOpen = () => { const p = panel(); return !!p && !p.hidden; };
  function open(d) {
    d = d || (typeof doc === 'function' ? doc() : null);
    if (!d) { toast('Ouvrez d’abord une séance, une présentation ou un tableur'); return; }
    if (d.kind === 'quiz' || d.kind === 'board') { toast('Alixo AI se lance depuis une séance, une présentation ou un tableur'); return; }
    if (typeof requirePlus === 'function' && !requirePlus('quizia')) return;
    if (!isOpen()) opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    openRightPanel('#cocopanel');
    const w = state.settings && state.settings.cocoW; if (w) document.documentElement.style.setProperty('--coco-w', w + 'px');
    cur = session(d); refreshText(cur);
    render();
    const inp = inputEl(); if (inp && !inp.disabled) inp.focus({ preventScroll: true });
  }
  /* fermer depuis le panneau rend le focus au bouton « Alixo AI » de la vue courante (sinon à l'élément actif à l'ouverture) */
  function close() {
    const inside = panel() && panel().contains(document.activeElement);
    closeRightPanels();
    let back = [...document.querySelectorAll('[data-act="quizia"], [data-sl="quizia"], [data-sh="quizia"]')].find(b => b.offsetParent !== null) || null;
    if (!back && opener && opener.isConnected && opener.offsetParent !== null) back = opener;
    opener = null;
    if (back && (inside || document.activeElement === document.body)) { try { back.focus({ preventScroll: true }); } catch { /* */ } }
  }
  function toggle(d) { if (isOpen()) close(); else open(d); }
  /* appelé après l'ouverture d'un document : si le panneau est ouvert, il rebascule sur sa session */
  function sync() {
    const d = typeof doc === 'function' ? doc() : null;
    if (!isOpen() || !d || (cur && cur.d.id === d.id)) { if (cur && d && cur.d.id === d.id) { cur.d = d; renderHead(cur); } return; }
    if (d.kind === 'quiz' || d.kind === 'board') return;   // le panneau est masqué par CSS dans ces vues
    cur = session(d); refreshText(cur);
    render();
  }

  /* ---------------- rendu ---------------- */
  function aiKey() { const ready = typeof AlixoCorr !== 'undefined' && AlixoCorr.configured(); return ready ? 'ok' : (window.AlixoAI ? AlixoAI.state() : 'web'); }
  function renderHead(s) {
    const p = panel();
    const docEl = p.querySelector('.coco-doc'); if (docEl) docEl.textContent = `· ${s.title} · ${s.nWords.toLocaleString('fr-FR')} mot${s.nWords > 1 ? 's' : ''}${s.cut ? ' (début lu)' : ''}`;
    const st = window.AlixoAI ? AlixoAI.state() : 'web';
    const dot = p.querySelector('.coco-state');
    if (dot) { const lab = st === 'ready' ? 'AlixoAI prête' : st === 'busy' || st === 'loading' ? 'AlixoAI travaille…' : st === 'web' ? 'AlixoAI : application Windows / Mac' : st === 'off' ? 'AlixoAI désactivée' : st === 'nomodel' ? 'AlixoAI à installer' : st === 'downloading' ? 'AlixoAI en cours de téléchargement' : 'AlixoAI indisponible'; dot.dataset.state = st; dot.title = lab; dot.setAttribute('aria-label', lab); }
  }
  /* les cartes Fiche / Quiz (hors du fil, toujours visibles) : compactes dès que le fil dépasse deux messages */
  function renderCards(s, step) {
    const c = cardsEl(); if (!c) return;
    c.hidden = step !== 'chat';
    if (step !== 'chat') { c.innerHTML = ''; return; }
    if (!c.firstElementChild) c.innerHTML = `<button type="button" class="coco-card" data-coco="fiche" title="Une fiche de révision colorée, à insérer dans la séance ou à imprimer"><span class="coco-cico">${I.sheet}</span><span><b>Fiche de révision</b><small>Une fiche colorée : à retenir, grandes idées, définitions, dates, pièges</small></span></button>
          <button type="button" class="coco-card" data-coco="quiz" title="Un quiz corrigé sur place, à partir du document"><span class="coco-cico">${I.quiz}</span><span><b>Quiz</b><small>QCM, vrai / faux, réponses courtes, corrigés sur place</small></span></button>`;
    c.classList.toggle('compact', s.messages.length > 2);
  }
  const syncCards = s => { if (cur === s) { const c = cardsEl(); if (c && !c.hidden) c.classList.toggle('compact', s.messages.length > 2); } };
  function render() {
    const s = cur; const p = panel(); if (!s || !p) return;
    s.aiKey = aiKey();
    renderHead(s);
    const b = bodyEl();
    const step = s.aiKey !== 'ok' ? 'noai' : s.nWords < 30 ? 'empty' : 'chat';
    b.dataset.step = step;
    renderCards(s, step);
    if (step === 'noai') b.innerHTML = noAiHTML();
    else if (step === 'empty') b.innerHTML = emptyHTML(s);
    else b.innerHTML = `<div class="coco-thread" aria-live="polite">${s.messages.map(messageHTML).join('')}</div>`;
    const inp = inputEl(), send = sendEl();
    const can = step === 'chat';
    inp.disabled = !can; send.disabled = !can;
    inp.placeholder = can ? 'Pose une question sur le cours…' : step === 'empty' ? 'Écris d’abord quelques lignes dans le document' : 'Indisponible pour le moment';
    p.classList.toggle('busy', !!s.gen);
    syncSend(s); syncMascot();
    scrollBottom(true);
  }
  /* 1.44 : AlixoAI tourne sur l'ordinateur — modèle à installer, version web (lien vers l'application), désactivée ou en pause */
  function noAiHTML() {
    const st = window.AlixoAI ? AlixoAI.state() : 'web';
    const E = window.AlixoEngine;
    const settings = `<button class="cta ghost small" type="button" data-aq="settings">${I.gear}<span>Paramètres › IA</span></button>`;
    if (st === 'web') return `<div class="coco-empty"><img src="img/coco.png" alt="" width="720" height="449"><b>${esc(E ? E.MSG.web : 'AlixoAI fonctionne dans l’application Alixo pour Windows et Mac.')}</b><p>Coco, le quiz et la fiche de révision sont préparés par AlixoAI directement sur l’ordinateur, sans rien envoyer à un service d’IA et sans limite d’utilisation.</p><a class="cta small" href="${esc(E ? E.DOWNLOAD_URL : 'https://alixoapp.com/index.html?site#telecharger')}" target="_blank" rel="noopener"><span>Télécharger l’application Alixo</span>${I.arrow}</a></div>`;
    const es = E ? E.status() : {}; const ep = (es.profiles || {})[es.profile] || {};
    const size = ep.approxBytes ? ` (${(ep.approxBytes / 1e9).toFixed(1).replace('.', ',')} Go)` : '';
    if (st === 'nomodel' || st === 'downloading') return `<div class="coco-empty"><img src="img/coco.png" alt="" width="720" height="449"><b>${st === 'downloading' ? 'AlixoAI est en cours de téléchargement.' : 'AlixoAI n’est pas encore installée sur cet ordinateur.'}</b><p>${st === 'downloading' ? 'Coco sera disponible dès la fin du téléchargement (Paramètres › IA pour suivre la progression).' : 'Un seul téléchargement suffit : ensuite, tout se passe sur l’ordinateur, sans rien envoyer à un service d’IA et sans limite d’utilisation.'}</p><div class="coco-eacts"><button type="button" class="cta small" data-aq="install">${ICON}<span>${st === 'downloading' ? 'Voir le téléchargement' : 'Installer AlixoAI' + size}</span></button>${settings}</div></div>`;
    return `<div class="coco-empty"><img src="img/coco.png" alt="" width="720" height="449"><b>AlixoAI n’est pas disponible pour le moment.</b><p>${esc((window.AlixoAI && !AlixoAI.enabled()) ? 'Elle a été désactivée dans les Paramètres › IA (Activer).' : (window.AlixoAI ? AlixoAI.available().reason : ''))}</p>${settings}</div>`;
  }
  const emptyHTML = s => `<div class="coco-empty"><img src="img/coco.png" alt="" width="720" height="449"><b>Le document est presque vide.</b><p>Écris d’abord quelques paragraphes (une trentaine de mots) : je ne m’appuie que sur ce que contient ${kindWord(s.d)}, pour répondre comme pour le quiz et la fiche.</p></div>`;

  function messageHTML(m) {
    const acts = (m.actions || []).map((a, k) => { const def = actions.get(a.name); if (!def) return ''; return `<button type="button" class="coco-act" data-coco-action="${esc(a.name)}" data-i="${k}">${def.icon || ''}<span>${esc(a.label || def.label)}</span></button>`; }).join('');
    return `<div class="coco-msg ${m.role}${m.streaming ? ' streaming' : ''}${m.error ? ' error' : ''}" data-id="${esc(m.id)}"${m.streaming ? ' aria-busy="true"' : ''}>${messageInner(m)}${acts ? `<div class="coco-acts">${acts}</div>` : ''}</div>`;
  }
  function messageInner(m) {
    if (m.role === 'user') return esc(m.text);
    let body = m.text ? mdLite(m.text) : '';
    if (!body && m.streaming) body = `<i class="coco-wait">${window.AlixoAI && AlixoAI.state() === 'loading' ? 'Coco se réveille…' : 'Coco réfléchit…'}</i>`;
    if (!body && m.stopped) body = '<i class="coco-wait">Réponse interrompue.</i>';
    return `<span class="coco-md">${body}</span>${m.error ? `<span class="coco-err">${esc(m.error)}</span>` : ''}`;
  }
  function appendMessage(s, m) {
    if (cur !== s) return;
    const th = bodyEl().querySelector('.coco-thread'); if (!th) return;
    const atBottom = nearBottom();
    th.insertAdjacentHTML('beforeend', messageHTML(m));
    syncCards(s);
    scrollBottom(atBottom || m.role === 'user');
  }
  function patchMessage(s, m) {
    if (cur !== s) return;
    const el = bodyEl().querySelector(`.coco-msg[data-id="${CSS.escape(m.id)}"]`); if (!el) return;
    const atBottom = nearBottom();
    el.className = `coco-msg ${m.role}${m.streaming ? ' streaming' : ''}${m.error ? ' error' : ''}`;
    if (m.streaming) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
    const acts = el.querySelector('.coco-acts');
    el.innerHTML = messageInner(m) + (acts ? acts.outerHTML : '');
    scrollBottom(atBottom);
  }
  const nearBottom = () => { const b = bodyEl(); return b.scrollHeight - b.scrollTop - b.clientHeight < 40; };
  function scrollBottom(force) { const b = bodyEl(); if (b && force) b.scrollTop = b.scrollHeight; }
  function syncSend(s) {
    const btn = sendEl(); if (!btn) return;
    const busy = !!(s && s.gen);
    btn.textContent = busy ? 'Stop' : 'Envoyer';
    btn.classList.toggle('stop', busy);
    btn.title = busy ? 'Interrompre la réponse (Échap)' : 'Envoyer (Entrée — Maj+Entrée : retour à la ligne)';
    if (busy) btn.disabled = false;
  }

  /* ---------------- chat ---------------- */
  async function send(text, target) {
    const s = target || cur; if (!s) return;
    if (s.gen) { if (s === cur) stop(s); return; }
    text = S(text); if (!text) return;
    if (s.aiKey !== 'ok') { if (s === cur) render(); return; }
    refreshText(s);
    const um = { id: uid(), role: 'user', text };
    const cm = { id: uid(), role: 'coco', text: '', streaming: true };
    const history = historyOf(s).slice(-8);
    s.messages.push(um, cm); appendMessage(s, um); appendMessage(s, cm);
    const gen = { token: AlixoAI.newToken(), msgId: cm.id }; s.gen = gen;
    setBusy(s, true);
    try {
      const r = await AlixoAI.run('chat', { title: s.title, text: s.text, history, question: text }, { token: gen.token, onText: t => { if (s.gen !== gen) return; cm.text = t; patchMessage(s, cm); } });
      if (s.gen === gen) cm.text = r.text || cm.text;
    } catch (e) {
      if (e && e.status === 499) { cm.stopped = true; cm.text = cm.text.trim(); }
      else cm.error = (e && e.message) || 'AlixoAI n’a pas répondu';
    }
    if (s.gen === gen) s.gen = null;
    cm.streaming = false;
    if (cm.error) {
      cm.actions = [{ name: 'chat-retry', payload: { question: text, msgId: cm.id } }];
      if (/install|désactiv|Paramètres/i.test(cm.error)) cm.actions.push({ name: 'settings' });   // modèle absent, IA désactivée…
    }
    patchMessage(s, cm);
    if (cm.actions) { rerenderMessage(s, cm); scrollBottom(true); }
    setBusy(s, false);
    if (cm.error && s === cur && aiKey() !== 'ok') render();   // AlixoAI n'est plus disponible : écran d'état
  }
  /* les échanges complets (question + réponse de Coco) : ni l'accueil, ni les notes, ni une réponse vide ou en erreur */
  function historyOf(s) {
    const ms = s.messages.filter(m => !m.sys && (m.role === 'user' || m.role === 'coco')); const out = [];
    for (let i = 0; i + 1 < ms.length; i++) { const m = ms[i], nx = ms[i + 1]; if (m.role === 'user' && nx.role === 'coco' && nx.text && !nx.error && !nx.streaming) { out.push({ role: 'user', content: m.text }, { role: 'assistant', content: nx.text }); i++; } }
    return out;
  }
  function stop(s) { if (!s.gen) return; AlixoAI.cancel(s.gen.token); s.gen = null; setBusy(s, false); }
  function setBusy(s, on) { if (cur !== s) return; const p = panel(); p.classList.toggle('busy', on && !!s.gen); syncSend(s); syncMascot(); }
  /* 1.49.1 : Coco fait « oh » pendant que l'étudiant écrit (champ actif et non vide, pas pendant une réponse) */
  function syncMascot() { const p = panel(), inp = inputEl(), w = p && p.querySelector('.coco-mascot-wrap'); if (!w || !inp) return; w.classList.toggle('oh', !inp.disabled && !!S(inp.value) && document.activeElement === inp && !(cur && cur.gen)); }
  function rerenderMessage(s, m) { if (cur !== s) return; const el = bodyEl().querySelector(`.coco-msg[data-id="${CSS.escape(m.id)}"]`); if (!el) return; const atBottom = nearBottom(); el.outerHTML = messageHTML(m); scrollBottom(atBottom); }
  /* ajoute un message (note de résultat, par exemple) au fil de la session courante — ou de `session` si donnée */
  function post(message, s) {
    s = s || cur; if (!s || !message) return null;
    const m = Object.assign({ id: uid(), role: 'note', text: '' }, message);
    s.messages.push(m); appendMessage(s, m);
    return m;
  }
  /* retire un message du fil (une note « Quiz en pause » quand le quiz reprend, par exemple) */
  function unpost(m, s) {
    s = s || cur; if (!s || !m) return;
    s.messages = s.messages.filter(x => x !== m);
    if (cur === s) { const el = bodyEl().querySelector(`.coco-msg[data-id="${CSS.escape(m.id)}"]`); if (el) el.remove(); syncCards(s); }
  }
  function registerAction(name, def) { if (name && def && typeof def.run === 'function') actions.set(name, Object.assign({ label: name, icon: '' }, def)); }
  const autosize = inp => { inp.style.height = 'auto'; inp.style.height = Math.min(140, inp.scrollHeight) + 'px'; };

  /* ---------------- interactions ---------------- */
  function bind() {
    const p = panel(); if (!p) return;
    p.querySelector('#coco-close').addEventListener('click', close);
    const form = p.querySelector('.coco-composer'); const inp = inputEl();
    form.addEventListener('submit', e => { e.preventDefault(); const s = cur; if (!s) return; if (s.gen) { stop(s); return; } const t = inp.value; inp.value = ''; autosize(inp); send(t); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); form.requestSubmit(); return; }
      if (e.key === 'Escape' && cur && cur.gen) { e.preventDefault(); e.stopPropagation(); stop(cur); }
    });
    inp.addEventListener('input', () => { autosize(inp); syncMascot(); });
    inp.addEventListener('focus', syncMascot); inp.addEventListener('blur', syncMascot);
    p.addEventListener('click', e => {
      const s = cur; if (!s) return;
      const card = e.target.closest('.coco-card[data-coco]');
      if (card) { if (card.dataset.coco === 'quiz' && window.AlixoAIQuiz) AlixoAIQuiz.openDialog(s); if (card.dataset.coco === 'fiche' && window.AlixoFiche) AlixoFiche.openDialog(s); return; }
      const act = e.target.closest('[data-coco-action]');
      if (act) {
        const el = act.closest('.coco-msg'); const m = s.messages.find(x => x.id === (el && el.dataset.id)); const a = m && (m.actions || [])[+act.dataset.i];
        const def = a && actions.get(a.name); if (def) { try { def.run(s, a.payload || {}, m); } catch (err) { console.error(err); toast('Cette action n’a pas pu s’exécuter'); } }
        return;
      }
      const b = e.target.closest('[data-aq]');
      if (b && b.dataset.aq === 'settings') { if (typeof openSettings === 'function') openSettings('ia'); }
      if (b && b.dataset.aq === 'install') { if (typeof openAiModelDialog === 'function') openAiModelDialog(); }
    });
    /* AlixoAI vient d'être installée (ou s'arrête) pendant que le panneau est ouvert : l'écran se met à jour */
    document.addEventListener('alixo-ai', () => {
      const s = cur; if (!s || !isOpen()) return;
      renderHead(s);
      if (s.aiKey !== aiKey()) render();
    });
    /* 1.49 : plus d'onglet « Quiz IA ». Les onglets aiq:<id> gardés d'une version précédente sont abandonnés au démarrage
       (restore → null, cf. app.js tryRestoreVTabs) ; sans ce stub, tabAlive les garderait comme onglets fantômes. */
    if (window.AlixoApp && AlixoApp.tabs) AlixoApp.tabs.register('aiq', { open(id) { AlixoApp.tabs.close(id); }, leave() {}, close() {}, restore() { return null; } });
  }

  /* ---------------- actions du fil (1.49 : quiz et fiche ; 1.50 : actions proposées par Coco) ---------------- */
  registerAction('chat-retry', { label: 'Réessayer', icon: I.replay, run(s, payload, m) { if (m) { s.messages = s.messages.filter(x => x !== m); const el = bodyEl().querySelector(`.coco-msg[data-id="${CSS.escape(m.id)}"]`); if (el) el.remove(); } const prev = s.messages[s.messages.length - 1]; if (prev && prev.role === 'user' && prev.text === payload.question) { s.messages.pop(); const el = bodyEl().querySelector(`.coco-msg[data-id="${CSS.escape(prev.id)}"]`); if (el) el.remove(); } send(payload.question); } });
  registerAction('settings', { label: 'Paramètres › IA', icon: I.gear, run() { if (typeof openSettings === 'function') openSettings('ia'); } });
  registerAction('quiz-replay', { label: 'Rejouer', icon: I.replay, run(s) { if (window.AlixoAIQuiz) AlixoAIQuiz.openDialog(s, 'replay'); } });
  registerAction('quiz-resume', { label: 'Reprendre', icon: I.arrow, run(s) { if (window.AlixoAIQuiz) AlixoAIQuiz.openDialog(s, 'resume'); } });
  registerAction('quiz-new', { label: 'Nouveau quiz', icon: I.quiz, run(s) { if (window.AlixoAIQuiz) AlixoAIQuiz.openDialog(s, 'new'); } });
  registerAction('fiche-open', { label: 'Voir la fiche', icon: I.sheet, run(s) { if (window.AlixoFiche) AlixoFiche.openDialog(s); } });
  registerAction('fiche-insert', { label: 'Insérer dans la séance', icon: I.arrow, run(s) { if (window.AlixoFiche) AlixoFiche.insert(s, 'append'); } });

  const buttonHTML = (attr, cls = '') => `<button type="button" ${attr} class="${cls}" title="Alixo AI (F8) : Coco répond à vos questions sur ce document, quiz et fiche de révision générés par l’IA (Alixo+)">${ICON}<span>Alixo AI</span></button>`;

  if (document.getElementById('cocopanel')) bind();

  return { open, close, toggle, isOpen, sync, buttonHTML, send, post, unpost, registerAction, md, get current() { return cur; }, get sessions() { return sessions; } };
})();
