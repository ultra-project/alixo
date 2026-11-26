/* ============================================================
   Alixo — Quiz IA (1.34, Alixo+ ; 1.35 : vue en onglet ; 1.49 : fenêtre ouverte depuis le panneau Alixo AI)
   Depuis une séance, une présentation ou un tableur, AlixoAI (js/alixoai.js) lit le document et prépare un quiz à
   jouer sur place : QCM, vrai / faux, réponses courtes ou mélange, 5 à 20 questions, trois niveaux ; correction
   immédiate avec explication, score final, et au besoin enregistrement dans un document Quiz (le type de document,
   lui, reste indépendant : cette fonction ne le requiert pas). Les questions sont au format de QuizCore
   (js/quizcore.js) : mêmes widgets, même vérification des réponses.
   1.37 : génération progressive — AlixoAI livre chaque question dès qu'elle est écrite ; le quiz commence après la
   première, les suivantes s'écrivent pendant que l'étudiant répond (écran d'attente seulement s'il les rattrape).
   1.49 : plus d'onglet « Quiz IA » ni de choix de mode — la carte « Quiz » du panneau Alixo AI (js/coco.js) ouvre
   une fenêtre (#cocoquiz, openDialog) : paramétrage → génération → partie → résultat ; fermer la fenêtre pendant la
   génération l'annule ; la fermer pendant la partie la met en PAUSE (note « Quiz en pause : question 4 / 10 » dans le
   fil, « Reprendre » rouvre à la même question) ; à la fin, une note « Quiz terminé : 7 / 10 » est postée dans le fil
   de Coco (Rejouer, Nouveau quiz).
   1.59 : nouvelle mise en page d’après la maquette « Création de quiz » (cinq écrans : réglages, génération, question,
   correction, résultats) ; l’étudiant lance la partie lui-même (« Commencer le quiz », actif dès la première question) ;
   « Passer la question », réponses au clavier (A B C D, V F), « Refaire les questions ratées », fiche de révision.
   La fiche de révision vit dans js/aifiche.js. docText / shorten (lecture du document) sont exposés pour coco.js et
   aifiche.js. Styles : aiquiz.css (la fenêtre) ; quiz.css § Quiz IA garde ce que la fiche partage (.aq-btn, .aq-empty…).
   Chargé APRÈS app.js et quizcore.js : utilise leurs globales (doc, findDoc, state, save, openDoc, openDialog, toast,
   esc, uid, blockPlain, AlixoCorr, AlixoAI, QuizCore…).
   ============================================================ */
'use strict';

window.AlixoAIQuiz = (() => {
  const MAX_CHARS = 60000;        // texte confié à AlixoAI (elle le découpe elle-même en passages ; au-delà, le document est tronqué)
  const COUNTS = [5, 10, 15, 20];
  const KINDS = [['mix', 'Mélange', 'QCM, vrai / faux et réponses courtes'], ['qcm', 'QCM', 'Une bonne réponse parmi quatre'], ['vf', 'Vrai / Faux', 'Une affirmation, deux boutons'], ['courte', 'Réponse courte', 'Un mot ou une expression à taper']];
  const LEVELS = [['facile', 'Facile', 'Les notions principales, telles qu’elles sont écrites'], ['moyen', 'Moyen', 'Comprendre et distinguer'], ['difficile', 'Difficile', 'Détails, cas limites, raisonnement']];
  const LS = 'alixo.aiquiz.opts';
  const C = () => window.QuizCore;
  const S = s => String(s ?? '').trim();
  const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
  const words = t => (t.match(WORD_RE) || []).length;
  let opts = (() => { try { const o = Object.assign({ kind: 'mix', n: 10, level: 'moyen' }, JSON.parse(localStorage.getItem(LS)) || {}); delete o.mode; return o; } catch { return { kind: 'mix', n: 10, level: 'moyen' }; } })();
  const saveOpts = () => { try { localStorage.setItem(LS, JSON.stringify(opts)); } catch { /* */ } };

  /* ---------------- texte du document ---------------- */
  /* texte brut d'un fragment HTML : fins de bloc → sauts de ligne, puis analyse inerte (DOMParser, rien n'est exécuté) */
  const strip = h => { let t = ''; try { t = new DOMParser().parseFromString(String(h ?? '').replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n'), 'text/html').body.textContent || ''; } catch { t = ''; } return t.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); };
  const SKIP_KEYS = new Set(['id', 't', 'x', 'y', 'w', 'h', 'color', 'bg', 'al', 'iid', 'font', 'fs', 'shape', 'dir', 'pct', 'ct', 'kind', 'theme', 'accent', 'notesOpen', 'icon', 'url', 'gtype', 'style', 'src']);
  function deepText(v, acc, depth = 0) {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') { const t = strip(v); if (t && !/^[#=]/.test(t)) acc.push(t); return; }
    if (Array.isArray(v)) { v.forEach(x => deepText(x, acc, depth + 1)); return; }
    if (typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (SKIP_KEYS.has(k)) continue; deepText(x, acc, depth + 1); }
  }
  function docText(d) {
    if (!d) return '';
    const parts = [];
    if (d.kind === 'slides') {
      (d.slides || []).forEach((s, i) => {
        const acc = []; (s.els || []).forEach(e => { const a = []; deepText(e, a); if (a.length) acc.push(a.join('\n')); });
        if (s.notes) acc.push('Notes : ' + strip(s.notes));
        if (acc.length) parts.push(`## Diapositive ${i + 1}\n${acc.join('\n')}`);
      });
      return parts.join('\n\n');
    }
    if (d.kind === 'sheet') {
      (d.sheets || []).forEach(s => {
        const rows = {};
        for (const [k, c] of Object.entries(s.cells || {})) {
          const v = c && c.v != null ? String(c.v) : ''; if (!v || v.startsWith('=')) continue;
          const m = k.match(/^([A-Z]+)(\d+)$/); if (!m) continue;
          (rows[+m[2]] || (rows[+m[2]] = [])).push([m[1], v]);
        }
        const lines = Object.keys(rows).map(Number).sort((a, b) => a - b).map(r => rows[r].sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0])).map(x => x[1]).join(' | '));
        if (lines.length) parts.push(`## Feuille « ${s.name || 'Feuille'} »\n${lines.join('\n')}`);
      });
      return parts.join('\n\n');
    }
    if (d.kind === 'board') {
      const acc = []; deepText(d.items || d.notes || d.board || {}, acc); return acc.join('\n');
    }
    for (const b of d.blocks || []) {
      if (!b || b.type === 'pb' || b.type === 'hr') continue;
      let t = '';
      try { t = typeof blockPlain === 'function' ? blockPlain(b) : strip(b.text); } catch { t = strip(b.text); }   // blockPlain gère aussi les tableaux
      if (b.type === 'callout' && b.text) t = `[${(typeof CALLOUTS === 'object' && CALLOUTS[b.ct] || {}).name || 'Encadré'}] ${strip(b.text)}`;
      t = S(t); if (!t) continue;
      if (b.type === 'h') parts.push('\n' + '#'.repeat(Math.min(4, +b.level || 1)) + ' ' + t);
      else if (b.type === 'li') parts.push('- ' + t);
      else parts.push(t);
    }
    return parts.join('\n').trim();
  }
  /* raccourcit un long texte en gardant le début de chaque partie (titres) */
  function shorten(text, max = MAX_CHARS) {
    if (text.length <= max) return { text, cut: false };
    const secs = text.split(/\n(?=#{1,4} )/);
    if (secs.length < 3) return { text: text.slice(0, max) + '\n[…]', cut: true };
    const share = Math.max(300, Math.floor(max / secs.length));
    return { text: secs.map(s => (s.length > share ? s.slice(0, share) + ' […]' : s)).join('\n'), cut: true };
  }

  /* ---------------- appels à AlixoAI ----------------
     1.37 : consignes, formats et lots vivent dans js/alixoai.js. Ici : conversion des questions au format QuizCore et
     livraison progressive (onItem). */
  async function genQuiz(ctx, onItem, gen) {
    const r = await AlixoAI.run('quiz', { title: ctx.title, text: ctx.text, n: ctx.n, kind: ctx.kind, level: ctx.level }, { token: gen.token, cancelled: () => gen.cancelled, onItem: (x, i) => { const q = toQuestion(x); if (q && onItem) onItem(q, i); } });
    return { title: r.title || ('Quiz — ' + (ctx.title || 'révision')), questions: r.questions.map(toQuestion).filter(Boolean), tokIn: r.tokIn, tokOut: r.tokOut, model: r.model, partial: r.partial };
  }
  /* une question de l'IA → une question QuizCore */
  function toQuestion(x) {
    if (!x || typeof x !== 'object') return null;
    const Q = C(); const text = S(x.question || x.text || x.q); if (!text) return null;
    const type = S(x.type).toLowerCase();
    const expl = S(x.explication || x.explanation || x.expl);
    if (type === 'vf' || type === 'tf' || typeof x.reponse === 'boolean') {
      const q = Q.newQuestion('tf'); q.text = text; q.time = 0; q.ans = typeof x.reponse === 'boolean' ? x.reponse : /^(vrai|true|oui|v)$/i.test(S(x.reponse)); q.expl = expl; return q;
    }
    if (type === 'courte' || type === 'text' || Array.isArray(x.reponses) || (!Array.isArray(x.choix) && typeof x.reponse === 'string')) {
      const ans = (Array.isArray(x.reponses) ? x.reponses : [x.reponse]).map(S).filter(Boolean);
      if (!ans.length) return null;
      const q = Q.newQuestion('text'); q.text = text; q.time = 0; q.ans = ans.slice(0, 6); q.expl = expl; return q;
    }
    const choix = (Array.isArray(x.choix) ? x.choix : Array.isArray(x.options) ? x.options : []).map(S).filter(Boolean);
    if (choix.length < 2) return null;
    const q = Q.newQuestion('mcq'); q.text = text; q.time = 0;
    q.opts = choix.slice(0, 6).map(t => ({ id: Q.uid(), text: t }));
    let idx = -1;
    if (typeof x.reponse === 'number') idx = x.reponse;
    else if (Array.isArray(x.reponse) && typeof x.reponse[0] === 'number') idx = x.reponse[0];
    else if (typeof x.reponse === 'string') { const n = +x.reponse; idx = isFinite(n) && x.reponse.trim() !== '' ? n : choix.findIndex(c => Q.norm(c) === Q.norm(x.reponse)); if (idx < 0 && /^[a-f]$/i.test(x.reponse.trim())) idx = x.reponse.trim().toLowerCase().charCodeAt(0) - 97; }
    if (idx < 0 || idx >= q.opts.length) idx = 0;
    q.ans = [q.opts[idx].id]; q.multi = false; q.expl = expl;
    return q;
  }
  /* ============================================================
     La fenêtre (1.49) : la carte « Quiz » du panneau Alixo AI ouvre #cocoquiz (openDialog, app.js). L'état du quiz
     vit dans session.quiz (session = objet de coco.js : { d, title, text, cut, nWords, … }) : il survit à la fermeture
     de la fenêtre (le résultat reste consultable via « Rejouer » dans le fil).
     Étapes : form → gen → play → result | error.
     ============================================================ */
  const ICON = '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4Z"/><path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9Z"/><path d="M19 14l.6 1.4 1.4.6-1.4.6L19 18l-.6-1.4L17 16l1.4-.6Z"/></svg>';
  const I = {
    quiz: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7.5 12 2.5 2.5 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 8M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-14 5.3L4 16M4 20v-4h4"/></svg>',
    print: '<svg viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3"/><rect x="7" y="14" width="10" height="7"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5Z"/><path d="M8 3v6h7V3M8 21v-7h8v7"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>'
  };
  const LEVEL_DOT = { facile: 'var(--aqz-facile)', moyen: 'var(--aqz-moyen)', difficile: 'var(--aqz-difficile)' };
  const ROW_HINT = { kind: 'Mélange alterne les trois formats.', n: 'Environ 30 secondes par question.', level: 'Du rappel de cours au cas piégeux.' };
  const DLG = 'cocoquiz';
  let cur = null;               // état du quiz affiché dans la fenêtre
  const srcReadOnly = d => !!(typeof isSharedDoc === 'function' && isSharedDoc(d.id) && !(window.AlixoShare && AlixoShare.canWrite(d.id)));
  const settingsLink = () => `<button class="aq-btn ghost" type="button" data-aq="settings">${I.gear}<span>Paramètres › IA</span></button>`;
  const kindLabel = () => (KINDS.find(k => k[0] === opts.kind) || KINDS[0])[1];
  const levelLabel = () => (LEVELS.find(l => l[0] === opts.level) || LEVELS[1])[1];
  const plural = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`;
  /* nom court du type d'une question (badge) */
  const typeLabel = q => (q.t === 'mcq' ? 'QCM' : q.t === 'tf' ? 'Vrai / Faux' : q.t === 'text' ? 'Réponse courte' : (C().TYPES[q.t] || {}).name || '');
  const noAnswer = v => v === null || v === undefined || v === '';
  /* texte de la question à l'affichage : sans le préfixe « Question 1 : » que le modèle ajoute parfois (la donnée reste intacte) */
  const qText = q => String((q && q.text) || '').replace(/^question\s*\d+\s*[:.—-]\s*/i, '');

  /* l'état du quiz d'une session de coco.js : d, title, text, cut, nWords sont lus sur la session (toujours à jour) */
  function quizState(session) {
    if (session.quiz) return session.quiz;
    const q = { step: 'form', result: null, play: null, gen: null, error: '', root: null, close: null,
      get d() { return session.d; }, get title() { return session.title; }, get text() { return session.text; }, get cut() { return session.cut; }, get nWords() { return session.nWords; }, session };
    session.quiz = q;
    return q;
  }
  /* ouverture de la fenêtre : mode = 'replay' (rejoue le dernier quiz, ordre mélangé) | 'new' (retour au paramétrage) |
     'resume' ou rien (reprend la partie en pause, sinon résultat / paramétrage) */
  function openWin(session, mode) {
    if (!session || !window.openDialog) return;
    const q = quizState(session);
    if (q.root && document.getElementById(DLG)) return;   // déjà ouverte
    if (mode === 'new') { q.step = 'form'; q.play = null; }
    openDialog({ id: DLG, cls: 'wide coco-dlg', eyebrow: 'Alixo AI · ' + esc(session.title), title: 'Quiz',
      body: '<div class="aq-scope aq-stage" data-step="form"></div>',
      onMount(card, close) {
        q.root = card.querySelector('.aq-stage'); q.close = close; cur = q;
        card.addEventListener('click', onClick);
        if (mode === 'replay' && q.result && q.result.questions.length) startPlay(q, true);
        else {
          if (q.step === 'play' && !q.play) q.step = 'form';
          if (q.step === 'play' && q.play && q.play.i >= q.play.order.length) q.step = 'result';   // reprise après une génération interrompue : tout a été joué
          if (q.step === 'gen' && !q.gen && !(q.result && q.result.questions.length)) q.step = 'form';
          render(q);
          if (q.pauseNote) { if (window.AlixoCoco) AlixoCoco.unpost(q.pauseNote, session); q.pauseNote = null; }
        }
      },
      onClose() {
        const paused = q.step === 'play' && q.play && q.result && q.result.questions.length;
        if (q.gen) { const keep = paused ? q.play : null; cancelGen(q, true); if (keep) { q.step = 'play'; q.play = keep; } }   // la suite n'est plus écrite, les questions reçues restent
        q.root = null; q.close = null; if (cur === q) cur = null;
        if (q.step === 'result' && q.play && q.result) postResult(q);
        else if (paused) postPause(q);
        else if (q.step === 'gen' && !(q.result && q.result.questions.length)) { q.step = 'form'; q.play = null; toast('Génération annulée'); }
        // fermée alors que le quiz est prêt mais pas commencé : l'écran de génération (tout est « Prête ») réapparaît à l'ouverture suivante
      } });
  }
  /* fermer pendant la partie = pause : note dans le fil avec « Reprendre » (rouvre à la question en cours) */
  function postPause(q) {
    const p = q.play; p.waiting = false;
    const n = p.order.length; const i = Math.min(p.i + 1, n);
    toast('Quiz mis en pause — reprenez-le depuis le fil de Coco', { duration: 4000 });
    if (!window.AlixoCoco) return;
    if (q.pauseNote) AlixoCoco.unpost(q.pauseNote, q.session);
    q.pauseNote = AlixoCoco.post({ role: 'note', text: `Quiz en pause : question ${i} / ${n}`, actions: [{ name: 'quiz-resume' }, { name: 'quiz-new' }] }, q.session);
  }
  /* note dans le fil de Coco : score, points à revoir, « Rejouer » / « Nouveau quiz » */
  function postResult(q) {
    if (!window.AlixoCoco || q.posted === q.play) return;
    q.posted = q.play;
    const Q = C(); const p = q.play, r = q.result, n = p.order.length;
    const missed = p.answers.filter(a => !a.ok).map(a => r.questions[a.idx]).filter(Boolean);
    const text = `Quiz terminé : ${p.score} / ${n}` + (missed.length ? ` — à revoir : ${missed.slice(0, 3).map(x => Q.correctText(x)).join(', ')}${missed.length > 3 ? '…' : ''}` : ' — sans faute !');
    AlixoCoco.post({ role: 'note', text, actions: [{ name: 'quiz-replay' }, { name: 'quiz-new' }] }, q.session);
  }

  /* ---------------- rendu de la session ---------------- */
  function render(s) {
    if (!s.root || !s.root.isConnected) return;
    const inner = s.step === 'gen' ? genHTML(s) : s.step === 'play' ? '' : s.step === 'result' ? resultHTML(s) : s.step === 'error' ? errorHTML(s) : formHTML(s);
    s.root.dataset.step = s.step;
    s.root.innerHTML = inner;
    if (s.step === 'play' && s.play) renderQuestion(s);
    if (s.step === 'gen') { refreshGen(s); animateGen(s); }
  }
  const stage = s => s.root;
  const errorHTML = s => `<div class="aq-empty aq-err"><div class="aq-eico ko">✕</div><b>Ça n’a pas marché.</b><p>${esc(s.error || '')}</p><div class="aq-actions"><button type="button" class="aq-btn primary" data-aq="back">${I.replay}<span>Réessayer</span></button>${/configur|install|désactiv|Paramètres/i.test(s.error || '') ? settingsLink() : ''}</div></div>`;

  /* ---------------- 1. réglages : trois lignes de pastilles, pied avec la mention locale et « Générer le quiz » ---------------- */
  const pill = (name, k, lab, on, extra, hint) => `<button type="button" class="aq-pill ${on ? 'on' : ''}" data-seg="${name}" data-v="${esc(k)}" aria-pressed="${on ? 'true' : 'false'}" title="${esc(hint || '')}">${extra || ''}<span>${lab}</span><i class="aq-pchk">${I.check}</i></button>`;
  const summary = () => `${plural(opts.n, 'question')} · ${kindLabel()} · ${levelLabel()}`;
  const row = (name, label, pills) => `<div class="aq-row"><div class="aq-rlab"><label id="aq-l-${name}">${label}</label><small>${ROW_HINT[name]}</small></div><div class="aq-pills${name === 'n' ? ' aq-pills-n' : ''}" data-segname="${name}" role="group" aria-labelledby="aq-l-${name}">${pills}</div></div>`;
  function formHTML(s) {
    return `<div class="aq-form">
      <div class="aq-fbody"><div class="aq-rows">
        ${row('kind', 'Type de questions', KINDS.map(([k, lab, hint]) => pill('kind', k, lab, k === opts.kind, '', hint)).join(''))}
        ${row('n', 'Nombre de questions', COUNTS.map(n => pill('n', String(n), String(n), n === +opts.n, '', `${n} questions`)).join(''))}
        ${row('level', 'Niveau', LEVELS.map(([k, lab, hint]) => pill('level', k, lab, k === opts.level, `<i class="aq-dot" style="--c:${LEVEL_DOT[k]}"></i>`, hint)).join(''))}
      </div></div>
      <div class="aq-foot">
        <p class="aq-note"><span class="aq-lock">${I.lock}</span><span>Le quiz est construit à partir de ce document, sur cet appareil : rien n’est envoyé à un service d’IA. <a href="https://alixoapp.com/confidentialite.html#alixoai" target="_blank" rel="noopener">En savoir plus</a>${s.cut ? ' Document très long : seul le début est lu.' : ''}</span></p>
        <div class="aq-fright"><span class="aq-sum">${summary()}</span><button type="button" class="aq-go" data-aq="go">Générer le quiz${I.arrow}</button></div>
      </div>
    </div>`;
  }

  /* ---------------- 2. génération : étapes, barre, une carte par question (Prête / En cours… / à venir), « Commencer le quiz » ----------------
     AlixoAI livre chaque question dès qu'elle est écrite (generate) ; refreshGen remet l'écran à jour. Le quiz commence quand
     l'étudiant le décide (bouton actif dès la première question) : la suite s'écrit pendant qu'il répond. */
  const readingLabel = s => `Lecture ${s.d.kind === 'slides' ? 'de la présentation' : s.d.kind === 'sheet' ? 'du tableur' : s.d.kind === 'pdf' ? 'du PDF' : 'du cours'}`;
  function genHTML(s) {
    const n = +opts.n;
    const cards = Array.from({ length: n }, (_, i) => `<div class="aq-gcard" data-state="todo"><b>Question ${i + 1}</b><span class="aq-gst done">${I.check}Prête</span><span class="aq-gst cur">En cours…</span><span class="aq-gsk" aria-hidden="true"><span></span><span></span></span></div>`).join('');
    const steps = [readingLabel(s), 'Repérage des notions clés', 'Rédaction des questions'].map((t, i) => `<div class="aq-gstep" data-k="${i}" data-state="${i ? 'todo' : 'cur'}"><i>${I.check}</i><span>${t}</span></div>`).join('');
    return `<div class="aq-gen">
      <div class="aq-ghead"><h4>Préparation de votre quiz</h4><p class="aq-gsub">${plural(n, 'question')} · ${esc(kindLabel())} · niveau ${esc(levelLabel().toLowerCase())}</p></div>
      <div class="aq-gsteps" aria-live="polite">${steps}</div>
      <div class="aq-gprog"><div class="aq-gbar" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="0" aria-label="Questions prêtes"><i style="width:0%"></i></div><p class="aq-gcount">0 question prête sur ${n}</p></div>
      <div class="aq-gcards">${cards}</div>
      <p class="aq-gtip">Vous pouvez commencer dès maintenant : la suite s’écrit pendant que vous répondez.</p>
      <div class="aq-gbtns"><button type="button" class="aq-btn ghost" data-aq="cancel">Annuler</button><button type="button" class="aq-btn primary aq-start" data-aq="start" disabled>Commencer le quiz${I.arrow}</button></div>
    </div>`;
  }
  /* avant la première question : les deux premières étapes défilent et la barre « chauffe » un peu */
  function animateGen(s) {
    const g = s.gen; if (!g) return;
    const root = stage(s); let k = 0;
    g.stepTm = setInterval(() => {
      if (s.gen !== g || !root || !root.isConnected) { clearInterval(g.stepTm); return; }
      k++; g.soft = Math.min(0.09, k * 0.03); g.phase = Math.min(2, k);
      if (!s.result || !s.result.questions.length) refreshGen(s);
      if (k >= 3) clearInterval(g.stepTm);
    }, 900);
  }
  function refreshGen(s) {
    const root = stage(s); if (!root || s.step !== 'gen') return;
    const g = s.gen; const k = s.result ? s.result.questions.length : 0; const n = Math.max(1, +(s.result && s.result.target) || +opts.n);
    const soft = g && !k ? (g.soft || 0) : 0;
    const bar = root.querySelector('.aq-gbar'); if (bar) { bar.firstElementChild.style.width = Math.round(Math.max(soft, k / n) * 100) + '%'; bar.setAttribute('aria-valuenow', k); }
    const cnt = root.querySelector('.aq-gcount'); if (cnt) cnt.textContent = k >= n && !g ? `Les ${n} questions sont prêtes` : `${k} question${k > 1 ? 's' : ''} prête${k > 1 ? 's' : ''} sur ${n}`;
    root.querySelectorAll('.aq-gcard').forEach((c, i) => { c.dataset.state = i < k ? 'done' : i === k && g ? 'cur' : 'todo'; });
    const phase = k || !g ? 2 : (g.phase || 0);   // 0 lecture, 1 notions, 2 rédaction
    root.querySelectorAll('.aq-gstep').forEach((el, i) => { el.dataset.state = i < phase || (k >= n && !g) ? 'done' : i === phase ? 'cur' : 'todo'; });
    const start = root.querySelector('.aq-start'); if (start) start.disabled = !k;
  }
  async function generate(s) {
    const gen = { token: AlixoAI.newToken(), target: +opts.n }; s.gen = gen; s.step = 'gen'; s.error = '';
    render(s);
    try {
      const ctx = { title: s.title, text: s.text, kind: opts.kind, n: +opts.n, level: opts.level };
      // 1.37 : chaque question est livrée dès qu'elle est écrite ; 1.59 : l'étudiant commence quand il veut, dès la première
      s.result = { title: 'Quiz — ' + (s.title || 'révision'), questions: [], target: +opts.n };
      const res = await genQuiz(ctx, q => {
        if (s.gen !== gen) return;
        s.result.questions.push(q);
        const k = s.result.questions.length;
        if (s.step === 'gen') refreshGen(s);
        else if (s.step === 'play' && s.play) { s.play.order.push(k - 1); if (s.play.waiting) renderQuestion(s); else refreshCount(s); }
      }, gen);
      if (s.gen !== gen) return;   // annulé entre-temps
      clearInterval(gen.stepTm); s.gen = null;
      s.result.title = res.title || s.result.title; s.result.tokIn = res.tokIn; s.result.tokOut = res.tokOut; s.result.model = res.model;
      if (res.partial) toast(`${s.result.questions.length} questions sur ${opts.n} : ${res.partial}`, { duration: 8000 });
      else autoSave(s);   // 1.55 : enregistré dans Artéfacts (un toast à la fois : l'avertissement « partiel » passe avant)
      if (res.partial) setTimeout(() => autoSave(s), 0);
      if (s.step === 'gen') refreshGen(s);
      else if (s.step === 'play' && s.play) { if (s.play.waiting) { s.play.waiting = false; if (s.play.i >= s.result.questions.length) { s.step = 'result'; render(s); } else renderQuestion(s); } else refreshCount(s); }
    } catch (err) {
      if (s.gen !== gen) return;
      clearInterval(gen.stepTm); s.gen = null;
      if ((s.step === 'play' || s.step === 'gen') && s.result && s.result.questions.length) {   // des questions existent déjà : on termine avec celles-là
        toast(`Alixo AI s’est arrêtée après ${plural(s.result.questions.length, 'question')} : ${err && err.message || err}`, { duration: 8000 });
        autoSave(s);   // 1.55 : les questions déjà générées sont gardées (Artéfacts)
        if (s.step === 'gen') { s.result.target = s.result.questions.length; refreshGen(s); }
        else if (s.play && s.play.waiting) { s.play.waiting = false; s.step = 'result'; render(s); }
        return;
      }
      s.step = 'error'; s.error = err && err.message || String(err); render(s);
    }
  }
  /* quiet : fermeture de la fenêtre (pas de rendu) */
  function cancelGen(s, quiet) { if (s.gen) { clearInterval(s.gen.stepTm); s.gen.cancelled = true; AlixoAI.cancel(s.gen.token); s.gen = null; } s.step = 'form'; s.play = null; if (!quiet) render(s); }
  /* nombre total de questions affiché pendant que la suite s'écrit */
  const totalN = s => (s.gen && s.gen.target ? Math.max(s.gen.target, s.result.questions.length) : (s.play ? s.play.order.length : s.result.questions.length));
  function refreshCount(s) {
    const st = stage(s); if (!st || !s.play) return;
    const n = totalN(s); const el = st.querySelector('.aq-pnum'); if (el) el.textContent = `Question ${s.play.i + 1} sur ${n}`;
    const nb = st.querySelector('.aq-next span'); if (nb) nb.textContent = s.play.i + 1 < n ? 'Question suivante' : 'Voir le résultat';
    const bar = st.querySelector('.aq-pbar'); if (bar) bar.innerHTML = segmentsHTML(s.play, n);
  }

  /* ---------------- interactions (dans la fenêtre) ---------------- */
  function onClick(e) {
    const s = cur; if (!s || !s.root) return;
    const pv = e.target.closest('.aq-pill[data-seg]');
    if (pv) {
      const k = pv.dataset.seg; opts[k] = k === 'n' ? +pv.dataset.v : pv.dataset.v; saveOpts();
      pv.parentElement.querySelectorAll('.aq-pill').forEach(b => { const on = b === pv; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      const sum = s.root.querySelector('.aq-sum'); if (sum) sum.textContent = summary();
      return;
    }
    const b = e.target.closest('[data-aq]'); if (!b) return;
    const a = b.dataset.aq;
    if (a === 'settings') { if (typeof openSettings === 'function') openSettings('ia'); return; }
    if (a === 'back') { s.step = 'form'; s.play = null; render(s); return; }
    if (a === 'cancel') { cancelGen(s); return; }
    if (a === 'go') { generate(s); return; }
    if (a === 'start') { if (s.result && s.result.questions.length) startPlay(s); return; }
    if (a === 'skip') { if (s.play && s.play.answerFn) s.play.answerFn(null); return; }
    if (a === 'next') { nextQuestion(s); return; }
    if (a === 'replay') { startPlay(s, true); return; }
    if (a === 'redo') { startPlay(s, false, missedOrder(s)); return; }
    if (a === 'more') { const rest = s.root.querySelector('.aq-mrest'); if (rest) { rest.hidden = !rest.hidden; b.textContent = rest.hidden ? b.dataset.show : 'Masquer ces questions'; } return; }
    if (a === 'fiche') { const sess = s.session; if (s.close) s.close(); if (window.AlixoFiche && sess) AlixoFiche.openDialog(sess); return; }
    if (a === 'savequiz') { saveAsQuizDoc(s); return; }
    if (a === 'print') { printResult(s); return; }
    if (a === 'close') { if (s.close) s.close(); return; }
  }
  /* Clavier — seulement quand la fenêtre du quiz est la fenêtre du dessus ; Échap est géré par openDialog (fermer = annuler / pause).
     Entrée : Générer (réglages), Commencer (génération, dès la première question), question suivante (après la réponse).
     A B C D (QCM) et V / F (vrai / faux) répondent directement. */
  function onKey(e) {
    const s = cur; if (!s || !s.root || !s.root.isConnected) return;
    const ovs = document.querySelectorAll('.dlgov'); if (!ovs.length || ovs[ovs.length - 1].id !== DLG) return;
    const t = e.target; if (t && (t.closest && t.closest('input, textarea, select, [contenteditable="true"]'))) return;
    if (document.getElementById('popover') && !document.getElementById('popover').hidden) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      if (s.step === 'play' && s.play && s.play.answers.length > s.play.i) { e.preventDefault(); nextQuestion(s); return; }
      if (s.step === 'gen' && s.result && s.result.questions.length) { e.preventDefault(); startPlay(s); return; }
      if (s.step === 'form' && s.nWords >= 30) { e.preventDefault(); generate(s); }
      return;
    }
    if (s.step === 'play' && s.play && !s.play.waiting && s.play.answers.length <= s.play.i && /^[a-zA-Z]$/.test(e.key)) {
      const key = e.key.toUpperCase(); const root = s.root.querySelector('.aq-widget'); if (!root) return;
      const q = s.result.questions[s.play.order[s.play.i]]; if (!q) return;
      let btn = null;
      if (q.t === 'mcq') btn = [...root.querySelectorAll('.qp-opt')].find(b => (b.querySelector('.qp-shape') || {}).textContent === key);
      else if (q.t === 'tf') btn = key === 'V' ? root.querySelector('.qp-tf[data-tf="1"]') : key === 'F' ? root.querySelector('.qp-tf[data-tf="0"]') : null;
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    }
  }
  document.addEventListener('keydown', onKey, true);

  /* ---------------- 3. et 4. jeu : question, puis correction ----------------
     order : indices des questions à jouer (toutes dans l'ordre ; again = toutes mélangées ; « Refaire les questions ratées » =
     celles-là seulement). */
  function startPlay(s, again, order) {
    const r = s.result;
    s.play = { i: 0, score: 0, answers: [], waiting: false, order: order || (again ? C().shuffle(r.questions.map((_, i) => i)) : r.questions.map((_, i) => i)) };
    s.step = 'play';
    render(s);
  }
  const missedOrder = s => (s.play ? C().shuffle(s.play.answers.filter(a => !a.ok).map(a => a.idx)) : null);
  const scoreText = p => { const k = p.answers.length; return `${p.score} bonne${p.score > 1 ? 's' : ''} réponse${p.score > 1 ? 's' : ''}${k ? ` sur ${k}` : ''}`; };
  const segmentsHTML = (p, n) => Array.from({ length: n }, (_, j) => `<span class="${j < p.answers.length ? (p.answers[j].ok ? 'ok' : 'ko') : j === p.i ? 'cur' : ''}"></span>`).join('');
  const keysHint = q => (q.t === 'mcq' ? `Répondez au clavier : ${(q.opts || []).map((_, i) => `<kbd>${C().letter(i)}</kbd>`).join('')}` : q.t === 'tf' ? 'Répondez au clavier : <kbd>V</kbd><kbd>F</kbd>' : 'Tapez votre réponse, puis <kbd>Entrée</kbd>');
  const playHead = (s, p, n, q) => `<div class="aq-phead"><div class="aq-phl"><span class="aq-pnum">Question ${p.i + 1} sur ${n}</span><span class="aq-ptype">${q ? esc(typeLabel(q)) : ''}</span></div><span class="aq-pscore" aria-live="polite">${scoreText(p)}</span></div>
      <div class="aq-pbar" aria-hidden="true">${segmentsHTML(p, n)}</div>`;
  function renderQuestion(s) {
    const Q = C(); const p = s.play, r = s.result;
    const n = totalN(s);
    const st = stage(s);
    if (p.i >= p.order.length) {   // 1.37 : l'étudiant a rattrapé AlixoAI — la question suivante s'écrit
      p.waiting = true;
      st.innerHTML = `<div class="aq-play">${playHead(s, p, n, null)}
        <div class="aq-pbody"><div class="aq-qcard aq-qwait"><span class="aq-spin" aria-hidden="true"></span><div class="aq-qtext">Alixo AI écrit la question suivante…</div></div></div></div>`;
      return;
    }
    p.waiting = false;
    const idx = p.order[p.i]; const q = r.questions[idx];
    st.innerHTML = `<div class="aq-play">${playHead(s, p, n, q)}
      <div class="aq-pbody">
        <div class="aq-qcard"><h4 class="aq-qtext">${esc(qText(q))}</h4><div class="aq-widget qz-play-scope">${Q.widgetHTML(q)}</div></div>
        <div class="aq-feedback" role="status" hidden></div>
      </div>
      <div class="aq-pfoot"><p class="aq-keys">${keysHint(q)}</p><button type="button" class="aq-btn ghost" data-aq="skip">Passer la question</button></div>
    </div>`;
    const root = st.querySelector('.aq-widget');
    let done = false;
    const answer = v => {
      if (done || s.play !== p) return; done = true;
      let ok = !noAnswer(v) && Q.check(q, v);
      if (!ok && q.t === 'text' && typeof v === 'string' && typeof AlixoCorr !== 'undefined' && AlixoCorr.levenshtein) {
        const nv = Q.norm(v); ok = (q.ans || []).some(a => { const na = Q.norm(a); return na.length >= 4 && AlixoCorr.levenshtein(nv, na) <= Math.max(1, Math.floor(na.length / 6)); });   // faute de frappe tolérée
      }
      if (ok) p.score++;
      p.answers.push({ idx, v, ok });
      root.innerHTML = Q.widgetHTML(q, { reveal: true, v, done: true });
      root.querySelectorAll('input, button, select').forEach(x => { x.disabled = true; });
      const sc = st.querySelector('.aq-pscore'); if (sc) sc.textContent = scoreText(p);
      const bar = st.querySelector('.aq-pbar'); if (bar) bar.innerHTML = segmentsHTML(p, totalN(s));
      const foot = st.querySelector('.aq-pfoot'); if (foot) foot.hidden = true;
      const fb = st.querySelector('.aq-feedback');
      fb.hidden = false;
      fb.className = 'aq-feedback ' + (ok ? 'ok' : 'ko');
      // « Voir le passage dans le cours » : seulement si AlixoAI a fourni un extrait source (q.src) — pas le cas aujourd'hui
      fb.innerHTML = `<span class="aq-fbico">${ok ? I.check : I.cross}</span><div class="aq-fbtxt">
        <p class="aq-fbhead">${ok ? 'Bonne réponse' : noAnswer(v) ? 'Question passée' : 'Mauvaise réponse'}</p>
        ${!ok && q.t === 'tf' && noAnswer(v) ? `<p class="aq-fbans">Bonne réponse : <b>${esc(Q.correctText(q))}</b></p>` : ''}
        ${q.expl ? `<p class="aq-fbexpl">${esc(q.expl)}</p>` : ''}
        <div class="aq-fbrow">${q.src ? `<span class="aq-src">${esc(q.src)}</span>` : ''}<button type="button" class="aq-btn ${ok ? 'green' : 'rose'} aq-next" data-aq="next"><span>${p.i + 1 < totalN(s) ? 'Question suivante' : 'Voir le résultat'}</span>${I.arrow}<kbd aria-hidden="true">Entrée</kbd></button></div>
      </div>`;
      const nb = fb.querySelector('.aq-next'); if (nb) { nb.focus({ preventScroll: true }); nb.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    };
    p.answerFn = answer;
    Q.bindWidget(q, root, answer);
    const first = root.querySelector('input'); if (first) first.focus();
    const dlgBody = st.closest('.dlg-body'); if (dlgBody) dlgBody.scrollTop = 0;
  }
  function nextQuestion(s) {
    const p = s.play; if (!p) return;
    if (p.answers.length <= p.i) return;    // pas encore répondu
    p.i++;
    if (p.i >= p.order.length && !s.gen) { s.step = 'result'; render(s); } else renderQuestion(s);
  }

  /* ---------------- 5. résultats : anneau, verdict, actions, questions à revoir ---------------- */
  const RING = 2 * Math.PI * 44;
  function missedItem(Q, q, a) {
    const mine = noAnswer(a.v) ? '' : Q.answerText(q, a.v);
    return `<div class="aq-mitem"><div class="aq-mq"><span class="aq-mtype">${esc(typeLabel(q))}</span><p>${esc(qText(q))}</p></div>
      ${a.ok ? `<div class="aq-mline ok"><span>${I.check}Votre réponse</span><span>${esc(mine)}</span></div>`
        : `<div class="aq-mline ko"><span>${I.cross}Votre réponse</span><span>${mine ? esc(mine) : '<i>Question passée</i>'}</span></div><div class="aq-mline ok"><span>${I.check}Bonne réponse</span><span>${esc(Q.correctText(q))}</span></div>`}
      ${q.expl ? `<p class="aq-mexpl">${esc(q.expl)}</p>` : ''}</div>`;
  }
  function resultHTML(s) {
    const Q = C(); const p = s.play, r = s.result, n = p.order.length || r.questions.length;
    const pct = Math.round(p.score / n * 100);
    const verdict = pct >= 90 ? 'Excellent : le cours est acquis.' : pct >= 70 ? 'Bien : encore quelques points à revoir.' : pct >= 50 ? 'Correct : relisez les passages signalés.' : 'À retravailler : refaites le quiz après une relecture.';
    const missed = p.answers.filter(a => !a.ok), good = p.answers.filter(a => a.ok);
    const item = a => missedItem(Q, r.questions[a.idx], a);
    const showRest = good.length ? `<div class="aq-mrest" hidden>${good.map(item).join('')}</div><div class="aq-mfoot"><button type="button" class="aq-btn ghost" data-aq="more" data-show="Afficher ${missed.length ? `les ${good.length} autre${good.length > 1 ? 's' : ''} question${good.length > 1 ? 's' : ''}` : `les ${plural(good.length, 'question')}`}">Afficher ${missed.length ? `les ${good.length} autre${good.length > 1 ? 's' : ''} question${good.length > 1 ? 's' : ''}` : `les ${plural(good.length, 'question')}`}</button></div>` : '';
    return `<div class="aq-result">
      <div class="aq-score">
        <div class="aq-ring" role="img" aria-label="${p.score} bonne${p.score > 1 ? 's' : ''} réponse${p.score > 1 ? 's' : ''} sur ${n}"><svg viewBox="0 0 104 104" aria-hidden="true"><circle class="aq-rtrack" cx="52" cy="52" r="44"/><circle class="aq-rfill" cx="52" cy="52" r="44" stroke-dasharray="${(RING * pct / 100).toFixed(1)} ${RING.toFixed(1)}" transform="rotate(-90 52 52)"/></svg><div class="aq-ringtxt"><b>${p.score}</b><small>sur ${n}</small></div></div>
        <div class="aq-scoretxt">
          <h4 class="aq-verdict">${verdict}</h4>
          <p class="aq-hint">${esc(s.title || r.title)} · ${plural(n, 'question')} · ${pct} % de bonnes réponses</p>
          <div class="aq-actions wrap">
            ${missed.length ? `<button type="button" class="aq-btn primary" data-aq="redo">Refaire ${missed.length > 1 ? `les ${missed.length} questions ratées` : 'la question ratée'}</button>` : `<button type="button" class="aq-btn primary" data-aq="replay">${I.replay}<span>Rejouer (ordre mélangé)</span></button>`}
            <button type="button" class="aq-btn ghost" data-aq="back">Nouveau quiz</button>
            ${window.AlixoFiche ? '<button type="button" class="aq-btn ghost" data-aq="fiche">Créer une fiche de révision</button>' : ''}
          </div>
          <div class="aq-more">
            ${missed.length ? `<button type="button" class="aq-btn link" data-aq="replay" title="Toutes les questions, dans un ordre mélangé">${I.replay}<span>Rejouer tout le quiz</span></button>` : ''}
            ${savedDoc(s) ? `<button type="button" class="aq-btn link" data-aq="savequiz" title="Ce quiz est enregistré dans Artéfacts : l’ouvrir pour le rejouer, le modifier, le présenter en direct">${I.save}<span>Ouvrir le document Quiz</span></button>`
    : window.AlixoQuiz && !srcReadOnly(s.d) ? `<button type="button" class="aq-btn link" data-aq="savequiz" title="Créer un document Quiz avec ces questions (pour le rejouer, le modifier, le présenter en direct)">${I.save}<span>Enregistrer comme document Quiz</span></button>` : ''}
            <button type="button" class="aq-btn link" data-aq="print" title="Imprimer ou enregistrer en PDF : questions puis corrigé">${I.print}<span>Imprimer / PDF</span></button>
          </div>
        </div>
      </div>
      <div class="aq-missed">
        <p class="aq-mhead">${missed.length ? `À revoir · ${plural(missed.length, 'question')}` : `Sans faute · ${plural(n, 'question')}`}</p>
        ${missed.length ? `<div class="aq-mlist">${missed.map(item).join('')}</div>` : '<p class="aq-perfect">Toutes les réponses sont justes. Bravo !</p>'}
        ${showRest}
      </div></div>`;
  }
  /* un document Quiz (type existant) construit avec les questions générées — facultatif, indépendant du Quiz IA */
  /* 1.55 : le quiz généré est ENREGISTRÉ AUTOMATIQUEMENT comme document Quiz (Artéfacts, js/artefacts.js) dès la fin de la
     génération, dans le dossier de la séance source ; « Enregistrer comme document Quiz » ouvre alors ce document (pas de
     doublon). r.savedId garde le lien résultat → document. */
  function buildQuizDoc(s) {
    const r = s && s.result; if (!r || !window.AlixoQuiz || !r.questions.length) return null;
    const qd = AlixoQuiz.newDoc((srcReadOnly(s.d) || (typeof isSharedDoc === 'function' && isSharedDoc(s.d.id))) ? null : (s.d.folderId || null), s.d.prof || '');
    qd.titre = r.title; qd.questions = r.questions.map(q => { const c = JSON.parse(JSON.stringify(q)); c.time = q.t === 'text' ? 30 : 20; c.points = 1000; return c; });
    qd.aiFrom = { docId: s.d.id, title: s.title, at: Date.now(), kind: 'quiz' };
    return qd;
  }
  function autoSave(s) {
    const r = s && s.result; if (!r || r.savedId) return;
    try {
      const qd = buildQuizDoc(s); if (!qd) return;
      state.docs.push(qd); save(); r.savedId = qd.id;
      if (window.AlixoArtefacts && AlixoArtefacts.refresh) AlixoArtefacts.refresh();
      toast(`Quiz enregistré dans Artéfacts : « ${r.title} » (généré par Alixo AI, à relire)`, { duration: 4000 });
      if (s.step === 'result') render(s);   // le bouton devient « Ouvrir le document Quiz »
    } catch (e) { console.error(e); }
  }
  const savedDoc = s => (s && s.result && s.result.savedId ? state.docs.find(x => x.id === s.result.savedId) || null : null);
  function saveAsQuizDoc(s) {
    const r = s && s.result; if (!r || !window.AlixoQuiz) return;
    const done = savedDoc(s);
    if (done) { if (s.close) s.close(); openDoc(done.id); return; }   // 1.55 : déjà enregistré automatiquement
    try {
      const qd = buildQuizDoc(s); if (!qd) return;
      state.docs.push(qd); save(); r.savedId = qd.id;
      toast(`Document Quiz « ${r.title} » créé dans la bibliothèque`, { duration: 6000 });
      if (s.close) s.close();
      openDoc(qd.id);
    } catch (e) { console.error(e); toast('Création du document Quiz impossible'); }
  }

  function quizText(r) {
    const Q = C(); const L = [r.title.toUpperCase(), ''];
    r.questions.forEach((q, i) => { L.push(`${i + 1}. ${qText(q)}`); if (q.t === 'mcq') q.opts.forEach((o, k) => L.push(`   ${Q.letter ? Q.letter(k) : 'ABCDEF'[k]}. ${o.text}`)); });
    L.push('', 'CORRIGÉ');
    r.questions.forEach((q, i) => L.push(`${i + 1}. ${Q.correctText(q)}${q.expl ? ' — ' + q.expl : ''}`));
    return L.join('\n');
  }
  /* impression : questions puis corrigé — dans la page même (la version PC n'ouvre pas de fenêtre surgissante) */
  function printResult(s) {
    const r = s && s.result; if (!r) return;
    const Q = C();
    const html = `<article class="aq-fiche"><h2>${esc(r.title)}</h2><ol class="aq-pq">${r.questions.map(q => `<li><div>${esc(qText(q))}</div>${q.t === 'mcq' ? `<ul>${q.opts.map((o, k) => `<li>${'ABCDEF'[k]}. ${esc(o.text)}</li>`).join('')}</ul>` : q.t === 'tf' ? '<div class="aq-pvf">☐ Vrai &nbsp; ☐ Faux</div>' : '<div class="aq-pline"></div>'}</li>`).join('')}</ol><h3 class="aq-pbreak">Corrigé</h3><ol class="aq-pq">${r.questions.map(q => `<li><b>${esc(Q.correctText(q))}</b>${q.expl ? ` — ${esc(q.expl)}` : ''}</li>`).join('')}</ol></article>`;
    let box = document.getElementById('aq-print');
    if (!box) { box = document.createElement('div'); box.id = 'aq-print'; document.body.appendChild(box); }
    box.innerHTML = `<style>
      @media screen { #aq-print { display: none; } }
      @media print { body.aq-printing > *:not(#aq-print) { display: none !important; } body.aq-printing { background: #fff !important; }
        #aq-print { display: block; font-family: Georgia, serif; color: #202124; line-height: 1.5; max-width: 760px; margin: 0 auto; }
        #aq-print h2 { font-size: 22px; margin: 0 0 10px; } #aq-print h3 { font-size: 16px; margin: 16px 0 6px; }
        #aq-print ul, #aq-print ol { margin: 4px 0 10px; padding-left: 22px; } #aq-print li { margin: 3px 0; }
        #aq-print .aq-pq > li { margin: 0 0 14px; } #aq-print .aq-pq ul { list-style: none; padding-left: 14px; } #aq-print .aq-pline { border-bottom: 1px solid #9aa0a6; height: 26px; width: 70%; }
        #aq-print .aq-pbreak { break-before: page; } #aq-print footer { margin-top: 30px; font-size: 11px; color: #5f6368; } }
      </style>${html}<footer>Généré par Alixo (Alixo AI) à partir de « ${esc(s.title)} » — alixoapp.com</footer>`;
    document.body.classList.add('aq-printing');
    const done = () => { window.removeEventListener('afterprint', done); document.body.classList.remove('aq-printing'); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('aq-printing')) done(); }, 500); }, 50);
  }

  return { openDialog: openWin, docText, shorten, toQuestion, ICON, KINDS, LEVELS, COUNTS, get opts() { return opts; }, get current() { return cur; } };
})();
