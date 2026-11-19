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
   - 1.52 : Coco modifie le document (js/cocotools.js) : une demande qui ressemble à une action (« corrige les fautes »,
     « mets les définitions en encadré », « ajoute une conclusion ») passe par un routage (AlixoAI.run('route')) ; si Coco
     doit AGIR, le message montre la progression (« Je corrige… (partie 2 sur 5) »), puis un résumé (« 12 fautes corrigées dans
     5 paragraphes ») avec « Annuler les modifications » (coco-undo, instantanés avant / après) et « Voir le détail »
     (coco-details). Un lot qui supprime attend « Supprimer » / « Garder » (coco-apply / coco-cancel). Planche et quiz sont désormais
     acceptés (F8 depuis ces vues).
   - 1.55 : Coco CRÉE des documents : create(d, opts) (appelé par js/cococreate.js) montre la progression pendant que le
     document neuf s'écrit ; dans le chat, « crée-moi une présentation sur… » (AlixoCocoTools.matchCreate) lance le même flux ;
     un document vide n'est plus bloqué : Coco propose de l'écrire (intention « modifier » directe).
   Chargé APRÈS app.js, quizcore.js, aiquiz.js, aifiche.js et cocotools.js : utilise leurs globales (doc, findDoc, state, save,
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
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
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
  const kindWord = d => (d.kind === 'slides' ? 'la présentation' : d.kind === 'sheet' ? 'le tableur' : d.kind === 'board' ? 'la planche' : d.kind === 'quiz' ? 'le quiz' : 'la séance');
  const kindMine = d => (d.kind === 'slides' ? 'ta présentation' : d.kind === 'sheet' ? 'ton tableur' : d.kind === 'board' ? 'ta planche' : d.kind === 'quiz' ? 'ton quiz' : 'ton cours');
  const docTitle = d => S(d.titre) || (d.kind === 'slides' ? 'Présentation' : d.kind === 'sheet' ? 'Tableur' : d.kind === 'board' ? 'Planche' : d.kind === 'quiz' ? 'Quiz' : 'Séance');
  const words = t => (t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  /* 1.52 : texte d'un quiz (questions, propositions, pages d'information) — AlixoAIQuiz.docText ne lit pas les quiz */
  const strip = h => (window.AlixoSanitize ? AlixoSanitize.text(String(h || '')) : String(h || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  const quizText = d => (d.questions || []).map((q, i) => [`${i + 1}. ${strip(q.text)}`, (q.opts || []).map(o => strip(o && o.text)).filter(Boolean).join(' / '), strip(q.body)].filter(Boolean).join('\n')).join('\n');
  function readDoc(s) {
    const Q = window.AlixoAIQuiz;
    const raw = s.d.kind === 'quiz' ? quizText(s.d) : Q ? Q.docText(s.d) : '';
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
  const cap = t => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
  function welcome(s) {
    const n = s.nWords.toLocaleString('fr-FR');
    const can = window.AlixoCocoTools && AlixoCocoTools.facadeOf(s.d);
    /* 1.55 : document (presque) vide — Coco propose de l’écrire (espaces insécables dans les guillemets) */
    if (s.nWords < 30 && can) {
      const q = t => `« ${t} »`;
      const ex = s.d.kind === 'slides' ? 'ajoute cinq diapositives sur la Révolution française' : s.d.kind === 'sheet' ? 'fais un budget mensuel d’étudiant' : s.d.kind === 'board' ? 'ajoute des notes sur les dates clés de la Ve République' : s.d.kind === 'quiz' ? 'ajoute dix questions sur la photosynthèse' : 'écris un cours sur la prescription extinctive';
      return `Salut ! Moi c’est Coco. ${cap(kindMine(s.d))} ${q(s.title)} est encore presque vide : je peux l’écrire pour toi. Dis-moi par exemple ${q(ex)}.\nJe peux aussi créer un autre document : ${q('crée-moi une présentation sur…')}`;
    }
    /* 1.52 : espaces insécables dans les guillemets (jamais « seul en fin de ligne) ; « modifier ta présentation »… */
    const g = t => `«\u00a0${t}\u00a0»`;
    return `Salut ! Moi c’est Coco. J’ai lu ${s.cut ? 'le début de ' : ''}${kindMine(s.d)} ${g(s.title)} (${n} mot${s.nWords > 1 ? 's' : ''}).\nPose-moi une question dessus, ou choisis une **fiche de révision** ou un **quiz** juste au-dessus.${can ? `\nJe peux aussi modifier ${kindMine(s.d)} : ${g('corrige les fautes')}, ${s.d.kind === 'slides' ? g('ajoute une diapositive de conclusion') : s.d.kind === 'sheet' ? g('calcule le total en B10') : s.d.kind === 'board' ? g('ajoute une note sur la prescription') : s.d.kind === 'quiz' ? g('ajoute une question sur le délai') : `${g('mets les définitions en encadré')}, ${g('ajoute une conclusion')}`}… Tu pourras toujours annuler d’un clic.` : ''}`;
  }

  /* ---------------- ouverture / fermeture ---------------- */
  const isOpen = () => { const p = panel(); return !!p && !p.hidden; };
  function open(d) {
    d = d || (typeof doc === 'function' ? doc() : null);
    if (!d) { toast('Ouvrez d’abord un document (séance, présentation, tableur, planche ou quiz)'); return; }
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
    let back = [...document.querySelectorAll('[data-act="quizia"], [data-sl="quizia"], [data-sh="quizia"], [data-bd="quizia"], [data-qz="quizia"]')].find(b => b.offsetParent !== null) || null;
    if (!back && opener && opener.isConnected && opener.offsetParent !== null) back = opener;
    opener = null;
    if (back && (inside || document.activeElement === document.body)) { try { back.focus({ preventScroll: true }); } catch { /* */ } }
  }
  function toggle(d) { if (isOpen()) close(); else open(d); }
  /* appelé après l'ouverture d'un document : si le panneau est ouvert, il rebascule sur sa session */
  function sync() {
    const d = typeof doc === 'function' ? doc() : null;
    if (!isOpen() || !d || (cur && cur.d.id === d.id)) { if (cur && d && cur.d.id === d.id) { cur.d = d; renderHead(cur); } return; }
    cur = session(d); refreshText(cur);   // 1.52 : planche et quiz compris
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
    /* 1.55 : un document vide passe au fil dès qu'une conversation existe (création en cours, demande de remplissage) */
    const step = s.aiKey !== 'ok' ? 'noai' : s.nWords < 30 && !s.gen && !s.messages.some(m => !m.sys) ? 'empty' : 'chat';
    b.dataset.step = step;
    renderCards(s, s.nWords < 30 ? 'empty' : step);   // fiche et quiz : seulement sur un document qui a du contenu
    if (step === 'noai') b.innerHTML = noAiHTML();
    else if (step === 'empty') b.innerHTML = emptyHTML(s);
    else b.innerHTML = `<div class="coco-thread" aria-live="polite">${s.messages.map(messageHTML).join('')}</div>`;
    const inp = inputEl(), send = sendEl();
    const editable = !!(window.AlixoCocoTools && AlixoCocoTools.facadeOf(s.d));
    const can = step === 'chat' || (step === 'empty' && editable);   // 1.55 : un document vide peut être rempli par Coco
    inp.disabled = !can; send.disabled = !can;
    inp.placeholder = step === 'chat' ? (editable ? (s.nWords < 30 ? 'Demande-moi d’écrire ce document…' : 'Pose une question ou demande une modification…') : 'Pose une question sur le cours…') : step === 'empty' ? (editable ? 'Demande-moi d’écrire ce document…' : 'Écris d’abord quelques lignes dans le document') : 'Indisponible pour le moment';
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
  const emptyHTML = s => (window.AlixoCocoTools && AlixoCocoTools.facadeOf(s.d)
    /* 1.55 : Coco peut écrire le document à partir d'une simple demande */
    ? `<div class="coco-empty"><img src="img/coco.png" alt="" width="720" height="449"><b>${esc(cap(kindWord(s.d)))} est presque vide.</b><p>Décris-moi ce que tu veux, juste en dessous : je l’écris pour toi (et tu pourras tout annuler d’un clic). Pour poser des questions, faire un quiz ou une fiche, il faut d’abord un peu de contenu.</p></div>`
    : `<div class="coco-empty"><img src="img/coco.png" alt="" width="720" height="449"><b>Le document est presque vide.</b><p>Écris d’abord quelques paragraphes (une trentaine de mots) : je ne m’appuie que sur ce que contient ${kindWord(s.d)}, pour répondre comme pour le quiz et la fiche.</p></div>`);

  function messageHTML(m) {
    const acts = (m.actions || []).map((a, k) => { const def = actions.get(a.name); if (!def) return ''; return `<button type="button" class="coco-act${def.cls ? ' ' + def.cls : ''}" data-coco-action="${esc(a.name)}" data-i="${k}">${def.icon || ''}<span>${esc(a.label || def.label)}</span></button>`; }).join('');
    return `<div class="coco-msg ${m.role}${m.streaming ? ' streaming' : ''}${m.error ? ' error' : ''}" data-id="${esc(m.id)}"${m.streaming ? ' aria-busy="true"' : ''}${m.undone ? ' data-undone="1"' : ''}>${messageInner(m)}${acts ? `<div class="coco-acts">${acts}</div>` : ''}</div>`;
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
    const wasEmpty = bodyEl() && bodyEl().dataset.step === 'empty' && s === cur;
    const um = { id: uid(), role: 'user', text };
    const cm = { id: uid(), role: 'coco', text: '', streaming: true };
    const history = historyOf(s).slice(-8);
    s.messages.push(um, cm);
    /* 1.55 : intention « créer » (« crée-moi une présentation sur… ») — un NOUVEAU document, rempli par Coco (js/cococreate.js) */
    const cr = window.AlixoCocoCreate && window.AlixoCocoTools ? AlixoCocoTools.matchCreate(text) : null;
    if (cr) {
      cm.streaming = false;
      cm.text = `D’accord : je crée ${CREATE_WORDS[cr.as] || 'un document'}${cr.subject ? ` sur ${'« ' + cr.subject + ' »'}` : cr.fromCurrent ? ` à partir de ${kindWord(s.d)}` : ''}. Je l’ouvre et je l’écris sous tes yeux.`;
      if (wasEmpty) render(); else { appendMessage(s, um); appendMessage(s, cm); }
      try {
        const res = await AlixoCocoCreate.start({ as: cr.as, prompt: cr.subject || text, sourceId: cr.fromCurrent ? s.d.id : '', from: 'chat' });
        if (res && res.error) { cm.text = res.error; rerenderMessage(s, cm); }
      } catch (e) { console.error(e); cm.text = (e && e.message) || 'Je n’ai pas pu créer ce document.'; rerenderMessage(s, cm); }
      return;
    }
    if (wasEmpty) render(); else { appendMessage(s, um); appendMessage(s, cm); }
    const gen = { token: AlixoAI.newToken(), msgId: cm.id }; s.gen = gen;
    setBusy(s, true);
    try {
      /* 1.52 : la phrase ressemble à une demande d'action → Coco décide d'abord s'il répond ou s'il modifie le document */
      let intent = null;
      /* 1.55 : document vide et modifiable : une demande d'action sert à l'écrire (pas de routage : il n'y a rien à réécrire) */
      if (window.AlixoCocoTools && s.nWords < 30 && AlixoCocoTools.facadeOf(s.d) && AlixoCocoTools.maybeAction(text)) intent = 'modifier';
      else if (window.AlixoCocoTools && AlixoCocoTools.maybeAction(text) && AlixoCocoTools.facadeOf(s.d)) {
        const rt = await AlixoCocoTools.route(s, text, { token: gen.token });
        if (s.gen === gen && rt.action !== 'repondre') intent = rt.action;
      }
      if (intent) await act(s, gen, cm, intent, text);
      else {
        const r = await AlixoAI.run('chat', { title: s.title, text: s.text, history, question: text }, { token: gen.token, onText: t => { if (s.gen !== gen) return; cm.text = t; patchMessage(s, cm); } });
        if (s.gen === gen) cm.text = r.text || cm.text;
      }
    } catch (e) {
      if (e && e.status === 499) { cm.stopped = true; cm.text = cm.text.trim(); }
      else if (e && e.soft) { cm.text = e.message; cm.actions = []; }   // 1.52 : refus expliqué (lecture seule…)
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
  /* ---------------- 1.52 : Coco modifie le document (js/cocotools.js) ----------------
     Le message de Coco sert de barre de progression (« Je corrige… (lot 2/5, 7 modifications) »), puis reçoit le résumé,
     les instantanés avant / après (m.edit) et les actions. Stop (bouton, Échap) : le lot en cours n'est pas appliqué,
     ce qui a déjà été fait reste annulable. */
  const MAX_EDITS = 5;   // paires d'instantanés gardées par session
  /* 1.55 : création — « J’écris la présentation… (4 diapositives) » */
  const CREATE_WORDS = { doc: 'une séance', fiche: 'une fiche de révision', slides: 'une présentation', sheet: 'un tableur', board: 'une planche', quiz: 'un quiz' };
  const CREATE_PROGRESS = { doc: ['la séance', 'inserted', 'bloc écrit', 'blocs écrits'], slides: ['la présentation', 'slides', 'diapositive', 'diapositives'], sheet: ['le tableur', 'cells', 'case remplie', 'cases remplies'], board: ['la planche', 'notes', 'note', 'notes'], quiz: ['le quiz', 'questions', 'question', 'questions'] };
  function createProgressText(p) {
    const [w, key, one, many] = CREATE_PROGRESS[p.kind] || CREATE_PROGRESS.doc; const c = p.counts || {};
    const k = (c[key] || 0) + (p.kind === 'board' ? (c.inserted || 0) : 0) + (p.kind === 'slides' && c.replaced ? 1 : 0);   // couverture comprise
    return k ? `J’écris ${w}… (${k.toLocaleString('fr-FR')} ${k > 1 ? many : one})` : `Je réfléchis au plan de ${w}…`;
  }
  const progressText = p => { if (p.phase === 'cree') return createProgressText(p); const verb = p.phase === 'corrige' ? 'Je corrige' : p.phase === 'embellit' ? 'Je mets en forme' : 'Je modifie'; return `${verb}…${p.lots > 1 ? ` (partie ${p.lot} sur ${p.lots}${p.changes ? `, ${p.changes} modification${p.changes > 1 ? 's' : ''}` : ''})` : ''}`; };
  async function act(s, gen, cm, intent, text) {
    cm.text = intent === 'corriger' ? 'Je relis le document…' : intent === 'embellir' ? 'Je regarde la mise en forme…' : 'Je prépare les modifications…';
    patchMessage(s, cm);
    const ui = { token: gen.token, cancelled: () => s.gen !== gen, onProgress: p => { if (s.gen !== gen) return; cm.text = progressText(p); patchMessage(s, cm); } };
    const r = await AlixoCocoTools.run(s, intent, text, ui);
    deliver(s, cm, r);
  }
  /* ---------------- 1.55 : Coco écrit un document neuf (js/cococreate.js → AlixoCoco.create) ----------------
     Le document vient d'être créé et ouvert ; le panneau s'ouvre sur sa session, la demande apparaît dans le fil et le
     message de Coco sert de barre de progression pendant que le contenu s'écrit dans le document (Stop / Échap arrête,
     ce qui est écrit reste et s'annule d'un clic). opts = { as, prompt, label, source?: { title, text } }. */
  async function create(d, opts) {
    if (!d || !window.AlixoCocoTools) return false;
    open(d);
    if (!isOpen() || !cur || cur.d.id !== d.id) return false;   // Alixo+ refusé, ou panneau fermé
    const s = cur;
    if (s.aiKey !== 'ok') return false;   // l'écran d'état (modèle à installer…) est affiché
    if (s.gen) stop(s);
    const m0 = s.messages[0]; if (m0 && m0.sys) m0.text = `C’est parti : j’écris ${CREATE_WORDS[opts.as] || 'ce document'} à partir de ta demande. Tu peux m’arrêter à tout moment (Stop ou Échap) ; ce qui est écrit pourra être annulé d’un clic.`;
    const um = { id: uid(), role: 'user', text: S(opts.label || opts.prompt) };
    const cm = { id: uid(), role: 'coco', text: '', streaming: true };
    s.messages.push(um, cm);
    const gen = { token: AlixoAI.newToken(), msgId: cm.id }; s.gen = gen;
    render(); setBusy(s, true);
    const ui = { token: gen.token, cancelled: () => s.gen !== gen, onProgress: p => { if (s.gen !== gen) return; cm.text = progressText(p); patchMessage(s, cm); } };
    try {
      const r = await AlixoCocoTools.create(s, { as: opts.as, prompt: opts.prompt, subject: opts.subject, source: opts.source || null }, ui);
      deliver(s, cm, r);
      if (r.error) cm.text += `\nAlixoAI s’est arrêtée en route (${r.error}) : je garde ce qui est déjà écrit.`;
      else if (r.truncated) cm.text += '\nJe me suis arrêté à la longueur maximale : demande-moi la suite si tu veux (« continue »).';
      if (!r.changes && !r.stopped) cm.actions = [{ name: 'coco-create-retry', payload: opts }];
    } catch (e) {
      if (e && e.status === 499) { cm.stopped = true; cm.text = 'Interrompu : je n’ai rien écrit.'; }
      else if (e && e.soft) { cm.text = e.message; cm.actions = []; }
      else { cm.error = (e && e.message) || 'AlixoAI n’a pas répondu'; cm.actions = [{ name: 'coco-create-retry', payload: opts }]; if (/install|désactiv|Paramètres/i.test(cm.error)) cm.actions.push({ name: 'settings' }); }
    }
    if (s.gen === gen) s.gen = null;
    cm.streaming = false;
    if (cur === s) { refreshText(s); render(); } else setBusy(s, false);
    return true;
  }
  /* résumé + actions d'un résultat (ou d'un lot en attente de confirmation) */
  function deliver(s, cm, r) {
    const T = AlixoCocoTools;
    cm.result = r; cm.edit = { before: r.before, after: r.after, docId: r.docId }; cm.error = '';
    if (r.pending) {
      cm.plan = r.pending;
      cm.text = (r.changes ? T.summary(r) + '\n' : '') + T.pendingText(r);
      cm.actions = [{ name: 'coco-apply' }, { name: 'coco-cancel' }];
    } else {
      cm.plan = null;
      cm.text = (r.stopped && r.changes ? 'Interrompu. ' : '') + T.summary(r);
      if (r.changedByUser) cm.text += '\nTu as modifié le document pendant que je travaillais : je me suis arrêté là.';
      cm.text += aiNotice(r);
      cm.actions = r.changes ? [{ name: 'coco-undo' }, { name: 'coco-details' }] : [];
    }
    if (!r.changes && !r.pending) delete cm.edit;
    capEdits(s);
  }
  /* 1.52 : Coco a écrit ou réécrit du texte (pas une simple correction ni une mise en forme) — mention AI Act art. 50 ;
     dans un document partagé, les autres membres voient aussi ces modifications */
  function aiNotice(r) {
    const c = (r && r.counts) || {};
    if (r && r.intent === 'creer' && r.changes) return `\nCréé par AlixoAI : relisez le contenu, l’IA peut se tromper.${typeof isSharedDoc === 'function' && isSharedDoc(r.docId) ? '\nCe document est visible par les membres du partage.' : ''}`;   // 1.55
    if (!r || r.intent !== 'modifier' || !(c.replaced || c.inserted || c.slides || c.notes || c.questions || c.cells || c.titled)) return '';
    let t = '\nModifié par AlixoAI : relisez les changements, l’IA peut se tromper.';
    if (typeof isSharedDoc === 'function' && isSharedDoc(r.docId)) t += '\nCes modifications sont visibles par les membres du partage.';
    return t;
  }
  /* au plus MAX_EDITS messages gardent leurs instantanés : les plus anciens perdent « Annuler » */
  function capEdits(s) {
    const list = s.messages.filter(m => m.edit);
    while (list.length > MAX_EDITS) { const m = list.shift(); delete m.edit; delete m.plan; m.actions = (m.actions || []).filter(a => a.name !== 'coco-undo' && a.name !== 'coco-apply' && a.name !== 'coco-cancel'); rerenderMessage(s, m); }
  }
  const detailLine = d => { const a = d.avant ? `« ${cutText(d.avant)} »` : '', b = d.apres ? `« ${cutText(d.apres)} »` : ''; return `- ${d.label}${a && b ? ` : ${a} → ${b}` : a ? ` : ${a}` : b ? ` : ${b}` : ''}`; };
  const cutText = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > 90 ? t.slice(0, 89).trimEnd() + '…' : t; };

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
  function registerAction(name, def) { if (name && def && typeof def.run === 'function') actions.set(name, Object.assign({ label: name, icon: '', cls: '' }, def)); }   // 1.52 : cls ('danger')
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
    /* 1.52 : F8 depuis une planche ou un quiz (app.js laisse ces vues gérer leurs raccourcis) */
    document.addEventListener('keydown', e => {
      if (e.key !== 'F8' || e.defaultPrevented) return;
      if (!document.body.classList.contains('mode-board') && !document.body.classList.contains('mode-quiz')) return;
      e.preventDefault(); toggle();
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
  /* 1.52 : Coco a modifié le document (js/cocotools.js) */
  registerAction('coco-undo', { label: 'Annuler les modifications', icon: I.undo, run(s, payload, m) {
    if (!m || !m.edit || !window.AlixoCocoTools) return;
    AlixoCocoTools.undo(s, m).then(ok => { if (!ok) return; m.actions = (m.actions || []).filter(a => a.name !== 'coco-undo'); m.undone = true; rerenderMessage(s, m); post({ text: 'Modifications annulées.' }, s); }).catch(err => { console.error(err); toast('L’annulation n’a pas abouti'); });
  } });
  /* 1.55 : la création n'a rien donné — on recommence dans le même document (pas de doublon) */
  registerAction('coco-create-retry', { label: 'Réessayer', icon: I.replay, run(s, payload, m) {
    if (m) { s.messages = s.messages.filter(x => x !== m); }
    const d = typeof doc === 'function' ? doc() : null;
    if (!d || d.id !== s.d.id) { toast('Ouvrez d’abord ce document'); return; }
    const prev = s.messages[s.messages.length - 1]; if (prev && prev.role === 'user') s.messages.pop();
    create(d, payload);
  } });
  registerAction('coco-details', { label: 'Voir le détail', icon: I.list, run(s, payload, m) {
    const r = m && m.result; if (!r || !r.details || !r.details.length) { post({ text: 'Aucun détail à montrer.' }, s); return; }
    const lines = r.details.slice(0, 10).map(detailLine);
    if (r.details.length > 10) lines.push(`… et ${r.details.length - 10} autre${r.details.length - 10 > 1 ? 's' : ''}`);
    post({ role: 'coco', text: lines.join('\n') }, s);
  } });
  registerAction('coco-apply', { label: 'Supprimer', icon: I.trash, cls: 'danger', run(s, payload, m) {
    if (!m || !m.plan || !window.AlixoCocoTools) return;
    try { const r = AlixoCocoTools.applyPlan(s, m); deliver(s, m, r); } catch (err) { m.plan = null; m.actions = (m.actions || []).filter(a => a.name !== 'coco-apply' && a.name !== 'coco-cancel'); m.text = (err && err.message) || 'Je n’ai pas pu appliquer ces modifications.'; }
    rerenderMessage(s, m);
  } });
  registerAction('coco-cancel', { label: 'Garder', icon: '', run(s, payload, m) {
    if (!m || !m.plan) return;
    const r = m.result; m.plan = null;
    m.text = (r && r.changes ? AlixoCocoTools.summary(r) + '\n' : '') + 'Je n’ai rien supprimé.' + aiNotice(r);
    m.actions = r && r.changes ? [{ name: 'coco-undo' }, { name: 'coco-details' }] : [];
    rerenderMessage(s, m);
  } });

  const buttonHTML = (attr, cls = '') => `<button type="button" ${attr} class="${cls}" title="Alixo AI (F8) : Coco répond à vos questions sur ce document, quiz et fiche de révision générés par l’IA (Alixo+)">${ICON}<span>Alixo AI</span></button>`;

  if (document.getElementById('cocopanel')) bind();

  return { open, close, toggle, isOpen, sync, buttonHTML, send, post, create, unpost, registerAction, md, get current() { return cur; }, get sessions() { return sessions; } };
})();
