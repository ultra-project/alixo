/* ============================================================
   Alixo — Quiz IA et fiches de révision (1.34, Alixo+ ; 1.35 : vue en onglet)
   Depuis une séance, une présentation ou un tableur, AlixoAI (js/alixoai.js, 1.37) lit le document et propose :
   - un quiz à jouer sur place : QCM, vrai / faux, réponses courtes ou mélange, 5 à 20 questions, trois
     niveaux ; correction immédiate avec explication, score final, et au besoin enregistrement dans un
     document Quiz (le type de document, lui, reste indépendant : cette fonction ne le requiert pas) ;
   - une fiche de révision : résumé, parties avec points clés et définitions, « à retenir », pièges ;
     insérée à la fin de la séance, posée dans une nouvelle séance ou copiée.
   Les questions sont au format de QuizCore (js/quizcore.js) : mêmes widgets, même vérification des réponses.
   1.35 : plus de fenêtre surgissante — le Quiz IA est un onglet « Quiz IA — <document> » de la barre des onglets
   (AlixoApp.tabs, section #view-aiquiz, styles dans quiz.css § Quiz IA) : paramétrage en grandes cartes, animation
   de génération, question lisible en clair comme en sombre, « Question suivante » aussi par Entrée.
   1.37 : génération progressive — AlixoAI livre chaque question dès qu'elle est écrite ; le quiz commence après la
   première, les suivantes s'écrivent pendant que l'étudiant répond (écran d'attente seulement s'il les rattrape).
   Chargé APRÈS app.js et quizcore.js : utilise leurs globales (doc, findDoc, state, save, openDoc, requirePlus,
   openSettings, toast, esc, uid, blockPlain, renderBlocks, AlixoCorr, AlixoAI, QuizCore…).
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
  let opts = (() => { try { return Object.assign({ mode: 'quiz', kind: 'mix', n: 10, level: 'moyen' }, JSON.parse(localStorage.getItem(LS)) || {}); } catch { return { mode: 'quiz', kind: 'mix', n: 10, level: 'moyen' }; } })();
  const saveOpts = () => { try { localStorage.setItem(LS, JSON.stringify(opts)); } catch { /* */ } };

  /* ---------------- texte du document ---------------- */
  const strip = h => { const d = document.createElement('div'); d.innerHTML = String(h ?? '').replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n'); return (d.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); };
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
      try { t = typeof blockPlain === 'function' ? blockPlain(b) : strip(b.text); } catch { t = strip(b.text); }
      if (b.type === 'table' && Array.isArray(b.rows)) t = b.rows.map(r => r.map(c => strip(c)).join(' | ')).join('\n');
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
  async function genSheet(ctx, onItem, gen) {
    const f = await AlixoAI.run('sheet', { title: ctx.title, text: ctx.text }, { token: gen.token, onItem });
    const parties = (f.parties || []).map(p => ({ titre: S(p.titre), points: (p.points || []).map(S).filter(Boolean), definitions: (p.definitions || []).map(d => ({ terme: S(d.terme), definition: S(d.definition) })).filter(d => d.terme && d.definition) })).filter(p => p.titre || p.points.length || p.definitions.length);
    if (!parties.length && !(f.retenir || []).length) throw new Error('Fiche vide — réessayez.');
    return { title: S(f.title) || ('Fiche de révision — ' + (ctx.title || '')), resume: S(f.resume), parties, retenir: (f.retenir || []).map(S).filter(Boolean), pieges: (f.pieges || []).map(S).filter(Boolean), tokIn: f.tokIn, tokOut: f.tokOut };
  }

  /* ============================================================
     La vue (1.35) : un vrai onglet « Quiz IA — <document> » dans la barre des onglets (API AlixoApp.tabs,
     section #view-aiquiz), plus de fenêtre surgissante. Chaque document a sa propre session (paramétrage,
     génération en cours, partie jouée, fiche), gardée tant que l'onglet est ouvert : on peut revenir à la
     séance et retrouver le quiz là où on l'a laissé.
     Étapes d'une session : form → gen → play → result | sheet | error ; noai / empty quand rien n'est possible.
     ============================================================ */
  const ICON = '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4Z"/><path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9Z"/><path d="M19 14l.6 1.4 1.4.6-1.4.6L19 18l-.6-1.4L17 16l1.4-.6Z"/></svg>';
  const I = {
    quiz: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7.5 12 2.5 2.5 6-6"/></svg>',
    sheet: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6Z"/><path d="M15 3v4h4M9 12h6M9 16h4"/></svg>',
    mix: '<svg viewBox="0 0 24 24"><path d="M4 7h4l8 10h4M4 17h4l2-2.5M14 9.5 16 7h4"/><path d="m18 5 2 2-2 2M18 15l2 2-2 2"/></svg>',
    qcm: '<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><path d="M11 7h9M11 17h9"/></svg>',
    vf: '<svg viewBox="0 0 24 24"><path d="m4 12 3.5 3.5L14 9"/><path d="m15 15 5 5M20 15l-5 5"/></svg>',
    courte: '<svg viewBox="0 0 24 24"><path d="M4 18h16M4 6h10M4 12h7"/><path d="M15 12h5"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
    slides: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/></svg>',
    sheetdoc: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14.5h18M9 4v16M15 4v16"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 8M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-14 5.3L4 16M4 20v-4h4"/></svg>',
    print: '<svg viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3"/><rect x="7" y="14" width="10" height="7"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5Z"/><path d="M8 3v6h7V3M8 21v-7h8v7"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>'
  };
  const KIND_ICON = { mix: I.mix, qcm: I.qcm, vf: I.vf, courte: I.courte };
  const LEVEL_DOT = { facile: '#2e8b6a', moyen: '#b3762a', difficile: '#c04343' };
  const TAB_KIND = 'aiq';
  const tabId = d => TAB_KIND + ':' + d.id;
  const sessions = new Map();   // docId → session { d, tab, title, text, cut, nWords, step, result, resultMode, play, gen, root }
  let cur = null;               // session affichée
  let view = null;              // la section #view-aiquiz
  const kindWord = d => (d.kind === 'slides' ? 'présentation' : d.kind === 'sheet' ? 'tableur' : d.kind === 'board' ? 'planche' : 'séance');
  const docIco = d => (d.kind === 'slides' ? I.slides : d.kind === 'sheet' ? I.sheetdoc : I.doc);
  const srcReadOnly = d => !!(typeof isSharedDoc === 'function' && isSharedDoc(d.id) && !(window.AlixoShare && AlixoShare.canWrite(d.id)));
  const settingsLink = () => `<button class="aq-btn ghost" type="button" data-aq="settings">${I.gear}<span>Paramètres › IA</span></button>`;

  /* ---------------- ouverture : depuis le bouton ✨ Quiz IA, F8 (séance, présentation, tableur) ---------------- */
  function open(d) {
    d = d || (typeof doc === 'function' ? doc() : null);
    if (!d && cur) d = cur.d;   // F8 depuis l'onglet du quiz : on reste dessus
    if (!d) { toast('Ouvrez d’abord une séance, une présentation ou un tableur'); return; }
    if (d.kind === 'quiz') { toast('Le Quiz IA se lance depuis une séance, une présentation ou un tableur'); return; }
    if (typeof requirePlus === 'function' && !requirePlus('quizia')) return;
    if (!window.AlixoApp || !AlixoApp.tabs) { toast('Onglets indisponibles'); return; }
    ensureView();
    const s = session(d);
    AlixoApp.tabs.open({ id: s.tab, kind: TAB_KIND, title: 'Quiz IA — ' + s.title, icon: ICON, data: { docId: d.id, folderId: d.folderId || null } });
  }
  function session(d) {
    let s = sessions.get(d.id);
    if (s) { s.d = d; return s; }
    const raw = docText(d);
    const nWords = words(raw);
    const { text, cut } = shorten(raw);
    s = { d, tab: tabId(d), title: S(d.titre) || (d.kind === 'slides' ? 'Présentation' : d.kind === 'sheet' ? 'Tableur' : 'Séance'), text, cut, nWords, step: 'form', result: null, resultMode: '', play: null, gen: null, root: null };
    sessions.set(d.id, s);
    return s;
  }
  function ensureView() {
    if (view) return view;
    view = document.getElementById('view-aiquiz');
    if (!view) { view = document.createElement('section'); view.id = 'view-aiquiz'; view.hidden = true; document.body.appendChild(view); }
    view.classList.add('aq-view');
    view.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, true);
    AlixoApp.tabs.register(TAB_KIND, {
      open(id, data) {
        const d = data && typeof findDoc === 'function' ? findDoc(data.docId) : null;
        if (!d) { toast('Le document de ce quiz n’existe plus'); AlixoApp.tabs.close(id); return; }
        const s = session(d);
        for (const o of sessions.values()) if (o.root) o.root.hidden = o !== s;
        cur = s;
        view.hidden = false;
        if (!s.root) { s.root = document.createElement('div'); s.root.className = 'aq-shell'; view.appendChild(s.root); render(s); }
        s.root.hidden = false;
        refreshBadge(s);
      },
      leave() { if (view) view.hidden = true; cur = null; },
      close(id, data) {
        const s = data && sessions.get(data.docId); if (!s) return;
        s.gen = null;   // une génération en cours est abandonnée
        if (s.root) s.root.remove();
        sessions.delete(data.docId);
        if (cur === s) cur = null;
        if (view && !sessions.size) view.hidden = true;
      },
      /* au redémarrage : l'onglet revient au paramétrage (le quiz joué n'est pas conservé) */
      restore(id) {
        const did = id.slice(TAB_KIND.length + 1);
        const d = typeof findDoc === 'function' ? findDoc(did) : null;
        if (!d || d.kind === 'quiz') return null;
        return { title: 'Quiz IA — ' + (S(d.titre) || 'Sans titre'), icon: ICON, data: { docId: d.id, folderId: d.folderId || null } };
      }
    });
    return view;
  }
  /* le titre de l'onglet suit la séance (renommée entre-temps) */
  function refreshBadge(s) {
    const t = 'Quiz IA — ' + (S(s.d.titre) || s.title);
    const info = AlixoApp.tabs.info(s.tab);
    if (info && info.title !== t) AlixoApp.tabs.update(s.tab, { title: t });
  }

  /* ---------------- rendu de la session ---------------- */
  function render(s) {
    const ready = typeof AlixoCorr !== 'undefined' && AlixoCorr.configured();
    s.aiKey = ready ? 'ok' : (window.AlixoAI ? AlixoAI.state() : 'web');
    const inner = !ready ? noAiHTML() : s.nWords < 30 ? emptyHTML(s)
      : s.step === 'gen' ? genHTML(s) : s.step === 'play' ? '' : s.step === 'result' ? resultHTML(s) : s.step === 'sheet' ? sheetHTML(s) : s.step === 'error' ? errorHTML(s) : formHTML(s);
    s.root.innerHTML = `<header class="aq-head">
        <button type="button" class="aq-back" data-aq="backdoc" title="Revenir à la ${kindWord(s.d)} (l’onglet du quiz reste ouvert)">${I.back}<span>${esc(S(s.d.titre) || s.title)}</span></button>
        <div class="aq-htitle">${ICON}<b>Quiz IA</b><small>Alixo+ · intelligence artificielle</small></div>
        <div class="aq-src" title="Document source">${docIco(s.d)}<span>${esc(S(s.d.titre) || s.title)}</span><em>${s.nWords.toLocaleString('fr-FR')} mot${s.nWords > 1 ? 's' : ''}${s.cut ? ' · extrait' : ''}</em></div>
      </header>
      <div class="aq-stage" data-step="${s.step}">${inner}</div>`;
    if (s.step === 'play' && s.play) renderQuestion(s);
    if (s.step === 'gen') animateGen(s);
  }
  const stage = s => s.root.querySelector('.aq-stage');
  /* 1.44 : AlixoAI tourne sur l'ordinateur — modèle à installer (bouton vers la fenêtre d'installation), version web
     (lien vers l'application), désactivée ou en pause : on le dit simplement */
  function noAiHTML() {
    const st = window.AlixoAI ? AlixoAI.state() : 'web';
    const E = window.AlixoEngine;
    if (st === 'web') return `<div class="aq-empty"><div class="aq-eico">${ICON}</div><b>${esc(E ? E.MSG.web : 'AlixoAI fonctionne dans l’application Alixo pour Windows et Mac.')}</b><p>Le quiz et la fiche sont préparés par AlixoAI directement sur l’ordinateur, sans rien envoyer à un service d’IA et sans limite d’utilisation.</p><a class="aq-btn primary" href="${E ? E.DOWNLOAD_URL : 'https://alixoapp.com/index.html?site#telecharger'}" target="_blank" rel="noopener"><span>Télécharger l’application Alixo</span>${I.arrow}</a></div>`;
    const es = E ? E.status() : {}; const ep = (es.profiles || {})[es.profile] || {};
    const size = ep.approxBytes ? ` (${(ep.approxBytes / 1e9).toFixed(1).replace('.', ',')} Go)` : '';
    if (st === 'nomodel' || st === 'downloading') return `<div class="aq-empty"><div class="aq-eico">${ICON}</div><b>${st === 'downloading' ? 'AlixoAI est en cours de téléchargement.' : 'AlixoAI n’est pas encore installée sur cet ordinateur.'}</b><p>${st === 'downloading' ? 'Le quiz sera disponible dès la fin du téléchargement (Paramètres › IA pour suivre la progression).' : 'Un seul téléchargement suffit : ensuite, tout se passe sur l’ordinateur, sans rien envoyer à un service d’IA et sans limite d’utilisation.'}</p><div class="aq-actions"><button type="button" class="aq-btn primary" data-aq="install">${ICON}<span>${st === 'downloading' ? 'Voir le téléchargement' : 'Installer AlixoAI' + size}</span></button>${settingsLink()}</div></div>`;
    return `<div class="aq-empty"><div class="aq-eico">${I.gear}</div><b>AlixoAI n’est pas disponible pour le moment.</b><p>${esc((window.AlixoAI && !AlixoAI.enabled()) ? 'Elle a été désactivée dans les Paramètres › IA (Activer).' : (window.AlixoAI ? AlixoAI.available().reason : ''))}</p>${settingsLink()}</div>`;
  }
  const emptyHTML = s => `<div class="aq-empty"><div class="aq-eico">${docIco(s.d)}</div><b>Le document est presque vide.</b><p>Écrivez d’abord quelques paragraphes (une trentaine de mots au moins) : le quiz et la fiche sont construits uniquement à partir de ce que contient ${s.d.kind === 'slides' ? 'la présentation' : s.d.kind === 'sheet' ? 'le tableur' : 'la séance'}.</p><button type="button" class="aq-btn ghost" data-aq="backdoc">${I.back}<span>Revenir au document</span></button></div>`;
  const errorHTML = s => `<div class="aq-empty aq-err"><div class="aq-eico ko">✕</div><b>Ça n’a pas marché.</b><p>${esc(s.error || '')}</p><div class="aq-actions"><button type="button" class="aq-btn primary" data-aq="back">${I.replay}<span>Réessayer</span></button>${/configur|Paramètres/i.test(s.error || '') ? settingsLink() : ''}</div></div>`;
  const pill = (name, k, lab, on, extra, hint) => `<button type="button" class="aq-pill ${on ? 'on' : ''}" data-seg="${name}" data-v="${esc(k)}" title="${esc(hint || '')}">${extra || ''}<span>${lab}</span></button>`;
  function formHTML(s) {
    const quiz = opts.mode !== 'fiche';
    return `<div class="aq-form">
      <div class="aq-modes" role="radiogroup">
        <button type="button" class="aq-mode ${quiz ? 'on' : ''}" data-mode="quiz" role="radio" aria-checked="${quiz}"><span class="aq-mico">${I.quiz}</span><b>Quiz</b><small>QCM, vrai / faux, réponses courtes — corrigé sur place, avec l’explication tirée du cours</small><i class="aq-mart aq-mart-quiz"><u></u><u></u><u></u><u></u></i></button>
        <button type="button" class="aq-mode ${!quiz ? 'on' : ''}" data-mode="fiche" role="radio" aria-checked="${!quiz}"><span class="aq-mico">${I.sheet}</span><b>Fiche de révision</b><small>Résumé, parties avec points clés et définitions, « À retenir », pièges à éviter</small><i class="aq-mart aq-mart-sheet"><u></u><u></u><u></u><u></u><u></u></i></button>
      </div>
      ${quiz ? `<div class="aq-rows">
        <div class="aq-row"><label>Type de questions</label><div class="aq-pills" data-segname="kind">${KINDS.map(([k, lab, hint]) => pill('kind', k, lab, k === opts.kind, `<i class="aq-pico">${KIND_ICON[k] || ''}</i>`, hint)).join('')}</div></div>
        <div class="aq-row"><label>Nombre</label><div class="aq-pills aq-pills-n" data-segname="n">${COUNTS.map(n => pill('n', String(n), String(n), n === +opts.n, '', `${n} questions`)).join('')}</div></div>
        <div class="aq-row"><label>Niveau</label><div class="aq-pills" data-segname="level">${LEVELS.map(([k, lab, hint]) => pill('level', k, lab, k === opts.level, `<i class="aq-dot" style="--c:${LEVEL_DOT[k]}"></i>`, hint)).join('')}</div></div>
      </div>` : `<div class="aq-rows"><div class="aq-row"><label>Contenu</label><p class="aq-hint">La fiche reprend tout le document : un résumé, trois à sept parties avec leurs points clés et définitions, « À retenir », et les pièges à éviter. Vous pourrez l’insérer à la fin de la séance, en faire une nouvelle séance, la copier ou l’imprimer.</p></div></div>`}
      <div class="aq-foot">
        <button type="button" class="aq-go" data-aq="go">${ICON}<span>Générer ${quiz ? `${opts.n} question${opts.n > 1 ? 's' : ''}` : 'la fiche'}</span>${I.arrow}</button>
        <span class="aq-note">AlixoAI construit ${quiz ? 'le quiz' : 'la fiche'} uniquement à partir de ce document, directement sur cet ordinateur : AlixoAI n’envoie rien à un service d’IA. <a href="https://alixoapp.com/confidentialite.html#alixoai" target="_blank" rel="noopener">En savoir plus</a>${s.cut ? ' Document très long : seul le début est lu.' : ''}</span>
      </div>
    </div>`;
  }

  /* ---------------- génération : l'animation ----------------
     Un halo qui tourne, des cartes de questions qui se matérialisent une à une (squelettes qui se remplissent
     au rythme des lots de 5), des étapes qui défilent et une barre de progression ; Annuler à tout moment. */
  function genHTML(s) {
    const quiz = opts.mode !== 'fiche';
    const n = quiz ? +opts.n : 5;
    const cards = Array.from({ length: Math.min(n, 10) }, (_, i) => `<div class="aq-gcard" style="--i:${i}"><i class="aq-gnum">${i + 1}</i><span class="aq-gl aq-gl1"></span><span class="aq-gl aq-gl2"></span><span class="aq-gl aq-gl3"></span><b class="aq-gok">✓</b></div>`).join('');
    return `<div class="aq-gen">
      <div class="aq-orb"><span></span><span></span><span></span><em>${ICON}</em></div>
      <div class="aq-gtxt"><b class="aq-gstep">Lecture ${s.d.kind === 'slides' ? 'de la présentation' : s.d.kind === 'sheet' ? 'du tableur' : 'du cours'}…</b><p class="aq-gsub">${quiz ? `${n} question${n > 1 ? 's' : ''} · ${esc((KINDS.find(k => k[0] === opts.kind) || KINDS[0])[1])} · niveau ${esc((LEVELS.find(l => l[0] === opts.level) || LEVELS[1])[1].toLowerCase())}` : 'Fiche de révision : résumé, points clés, définitions, pièges'} — ${quiz ? 'la première question arrive dans quelques secondes, la suite s’écrit pendant que vous répondez.' : 'les parties apparaissent au fur et à mesure.'}</p></div>
      <div class="aq-gbar"><i style="width:0%"></i></div>
      <div class="aq-gcards ${quiz ? '' : 'sheet'}">${cards}</div>
      <button type="button" class="aq-btn ghost" data-aq="cancel">Annuler</button>
    </div>`;
  }
  const GEN_STEPS = { quiz: ['Lecture du cours…', 'Repérage des notions clés…', 'Rédaction de la première question…', 'Choix des distracteurs…', 'Relecture…'], fiche: ['Lecture du cours…', 'Rédaction du résumé…', 'Points clés et définitions…', '« À retenir » et pièges…', 'Mise en forme de la fiche…'] };
  function animateGen(s) {
    const g = s.gen; if (!g) return;
    const root = stage(s); const steps = GEN_STEPS[opts.mode !== 'fiche' ? 'quiz' : 'fiche'];
    let k = 0;
    g.stepTm = setInterval(() => {
      if (s.gen !== g || !root.isConnected) { clearInterval(g.stepTm); return; }
      k = Math.min(steps.length - 1, k + 1);
      const el = root.querySelector('.aq-gstep'); if (el && !g.doneK) { el.classList.remove('swap'); void el.offsetWidth; el.textContent = steps[k]; el.classList.add('swap'); }
      // sans nouvelles d'AlixoAI, les premières cartes « chauffent » quand même (jusqu'à 30 %)
      const soft = Math.min(0.3, (k + 1) * 0.07); setGenProgress(s, Math.max(g.p || 0, soft), false);
    }, 2600);
  }
  /* avancement réel : k questions reçues sur n (lots de 5) → cartes cochées et barre */
  function setGenProgress(s, p, hard, k, n) {
    const g = s.gen; if (!g) return;
    g.p = Math.max(g.p || 0, p);
    const root = stage(s); if (!root) return;
    const bar = root.querySelector('.aq-gbar i'); if (bar) bar.style.width = Math.round(g.p * 100) + '%';
    const cards = root.querySelectorAll('.aq-gcard');
    if (hard && n) {
      g.doneK = k;
      const per = Math.ceil(n / cards.length);
      cards.forEach((c, i) => c.classList.toggle('done', (i + 1) * per <= k));
      const el = root.querySelector('.aq-gstep'); if (el) { el.textContent = k < n ? `${k} question${k > 1 ? 's' : ''} sur ${n} — la suite arrive…` : 'Dernière relecture…'; }
    }
  }
  async function generate(s) {
    const quiz = opts.mode !== 'fiche';
    const gen = { token: AlixoAI.newToken(), target: quiz ? +opts.n : 0, parts: [] }; s.gen = gen; s.step = 'gen'; s.error = '';
    render(s);
    try {
      const ctx = { title: s.title, text: s.text, kind: opts.kind, n: +opts.n, level: opts.level };
      if (quiz) {
        // 1.37 : chaque question est livrée dès qu'elle est écrite ; le quiz commence après la première
        s.result = { title: 'Quiz — ' + (s.title || 'révision'), questions: [] }; s.resultMode = 'quiz';
        const res = await genQuiz(ctx, q => {
          if (s.gen !== gen) return;
          s.result.questions.push(q);
          const k = s.result.questions.length;
          if (s.step === 'gen') { clearInterval(gen.stepTm); startPlay(s); }
          else if (s.step === 'play' && s.play) { s.play.order.push(k - 1); if (s.play.waiting) renderQuestion(s); else refreshCount(s); }
        }, gen);
        if (s.gen !== gen) return;   // annulé entre-temps
        clearInterval(gen.stepTm); s.gen = null;
        s.result.title = res.title || s.result.title; s.result.tokIn = res.tokIn; s.result.tokOut = res.tokOut; s.result.model = res.model;
        if (res.partial) toast(`${s.result.questions.length} questions sur ${opts.n} : ${res.partial}`, { duration: 8000 });
        if (s.step === 'gen') startPlay(s);
        else if (s.step === 'play' && s.play) { if (s.play.waiting) { s.play.waiting = false; if (s.play.i >= s.result.questions.length) { s.step = 'result'; render(s); } else renderQuestion(s); } else refreshCount(s); }
      } else {
        const res = await genSheet(ctx, (part, i) => { if (s.gen !== gen) return; gen.parts[i] = part; setGenProgress(s, Math.min(0.9, 0.2 + 0.15 * (i + 1)), true, i + 1, 5); const el = stage(s) && stage(s).querySelector('.aq-gstep'); if (el) el.textContent = `${part.titre ? `« ${part.titre} »` : `Partie ${i + 1}`} rédigée — la suite arrive…`; }, gen);
        if (s.gen !== gen) return;
        clearInterval(gen.stepTm); s.gen = null;
        s.result = res; s.resultMode = 'fiche';
        s.step = 'sheet'; render(s);
      }
    } catch (err) {
      if (s.gen !== gen) return;
      clearInterval(gen.stepTm); s.gen = null;
      if (quiz && s.step === 'play' && s.result && s.result.questions.length) {   // des questions ont déjà été jouées : on termine avec celles-là
        toast(`AlixoAI s’est arrêtée après ${s.result.questions.length} question${s.result.questions.length > 1 ? 's' : ''} : ${err && err.message || err}`, { duration: 8000 });
        if (s.play && s.play.waiting) { s.play.waiting = false; s.step = 'result'; render(s); }
        return;
      }
      s.step = 'error'; s.error = err && err.message || String(err); render(s);
    }
  }
  function cancelGen(s) { if (s.gen) { clearInterval(s.gen.stepTm); s.gen.cancelled = true; AlixoAI.cancel(s.gen.token); s.gen = null; } s.step = 'form'; s.play = null; render(s); }
  /* nombre total de questions affiché pendant que la suite s'écrit */
  const totalN = s => (s.gen && s.gen.target ? Math.max(s.gen.target, s.result.questions.length) : s.result.questions.length);
  function refreshCount(s) {
    const st = stage(s); if (!st || !s.play) return;
    const n = totalN(s); const el = st.querySelector('.aq-pnum'); if (el) el.textContent = `Question ${s.play.i + 1} / ${n}`;
    const nb = st.querySelector('.aq-next'); if (nb) nb.firstChild.textContent = s.play.i + 1 < n ? 'Question suivante' : 'Voir le résultat';
  }

  /* ---------------- interactions ---------------- */
  function onClick(e) {
    const s = cur; if (!s) return;
    const mode = e.target.closest('[data-mode]'); if (mode) { opts.mode = mode.dataset.mode; saveOpts(); render(s); return; }
    const pv = e.target.closest('.aq-pill[data-seg]');
    if (pv) { const k = pv.dataset.seg; opts[k] = k === 'n' ? +pv.dataset.v : pv.dataset.v; saveOpts(); pv.parentElement.querySelectorAll('.aq-pill').forEach(b => b.classList.toggle('on', b === pv)); const go = s.root.querySelector('.aq-go span'); if (go && k === 'n') go.textContent = `Générer ${opts.n} questions`; return; }
    const b = e.target.closest('[data-aq]'); if (!b) return;
    const a = b.dataset.aq;
    if (a === 'backdoc') { if (typeof openDoc === 'function' && findDoc(s.d.id)) openDoc(s.d.id); else if (AlixoApp.showLibrary) AlixoApp.showLibrary(); return; }
    if (a === 'settings') { if (typeof openSettings === 'function') openSettings('ia'); return; }
    if (a === 'install') { if (typeof openAiModelDialog === 'function') openAiModelDialog(); return; }
    if (a === 'back') { s.step = 'form'; s.play = null; render(s); return; }
    if (a === 'cancel') { cancelGen(s); return; }
    if (a === 'go') { generate(s); return; }
    if (a === 'next') { nextQuestion(s); return; }
    if (a === 'replay') { startPlay(s, true); return; }
    if (a === 'savequiz') { saveAsQuizDoc(s); return; }
    if (a === 'insert') { insertSheet(s, 'append'); return; }
    if (a === 'newdoc') { insertSheet(s, 'new'); return; }
    if (a === 'copy') { copySheet(s, b); return; }
    if (a === 'print') { printResult(s); return; }
  }
  /* Entrée : question suivante (après la réponse) ou Générer (au paramétrage) ; Échap : annuler la génération */
  function onKey(e) {
    const s = cur; if (!s || !view || view.hidden) return;
    const t = e.target; if (t && (t.closest && t.closest('input, textarea, select, [contenteditable="true"]'))) return;
    if (document.querySelector('.dlgov') || (document.getElementById('popover') && !document.getElementById('popover').hidden)) return;
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (s.step === 'play' && s.play && s.play.answers.length > s.play.i) { e.preventDefault(); nextQuestion(s); return; }
      if (s.step === 'form' && s.nWords >= 30) { e.preventDefault(); generate(s); }
      return;
    }
    if (e.key === 'Escape' && s.step === 'gen') { e.preventDefault(); e.stopImmediatePropagation(); cancelGen(s); return; }
    /* les raccourcis des onglets d'app.js ne s'appliquent qu'en mode éditeur : on les assure ici pour cette vue */
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'w') { e.preventDefault(); e.stopImmediatePropagation(); AlixoApp.tabs.close(s.tab); return; }
    if (e.altKey && !mod && e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); if (AlixoApp.showLibrary) AlixoApp.showLibrary(); }
  }

  /* ---------------- jeu ---------------- */
  function startPlay(s, again) {
    const r = s.result;
    s.play = { i: 0, score: 0, answers: [], waiting: false, order: again ? C().shuffle(r.questions.map((_, i) => i)) : r.questions.map((_, i) => i) };
    s.step = 'play';
    render(s);
  }
  function renderQuestion(s) {
    const Q = C(); const p = s.play, r = s.result;
    const n = totalN(s);
    const st = stage(s);
    if (p.i >= p.order.length) {   // 1.37 : l'étudiant a rattrapé AlixoAI — la question suivante s'écrit
      p.waiting = true;
      st.innerHTML = `<div class="aq-play"><div class="aq-phead"><span class="aq-pnum">Question ${p.i + 1} / ${n}</span><span class="aq-ptype"></span><span class="aq-pscore" title="Bonnes réponses">${p.score} / ${p.i} ✓</span></div>
        <div class="aq-pbar"><i style="width:${Math.round(p.i / n * 100)}%"></i></div>
        <div class="aq-qcard aq-qwait" style="--k:${p.i}"><div class="aq-orb small"><span></span><span></span><span></span><em>${ICON}</em></div><div class="aq-qtext">AlixoAI écrit la question suivante…</div></div></div>`;
      return;
    }
    p.waiting = false;
    const idx = p.order[p.i]; const q = r.questions[idx];
    st.innerHTML = `<div class="aq-play">
      <div class="aq-phead"><span class="aq-pnum">Question ${p.i + 1} / ${n}</span><span class="aq-ptype">${esc((Q.TYPES[q.t] || {}).name || '')}</span><span class="aq-pscore" title="Bonnes réponses">${p.score} / ${p.i} ✓</span></div>
      <div class="aq-pbar"><i style="width:${Math.round(p.i / n * 100)}%"></i></div>
      <div class="aq-qcard" style="--k:${p.i}">
        <div class="aq-qtext">${esc(q.text)}</div>
        <div class="aq-widget qz-play-scope">${Q.widgetHTML(q)}</div>
      </div>
      <div class="aq-feedback" hidden></div>
    </div>`;
    const root = st.querySelector('.aq-widget');
    let done = false;
    Q.bindWidget(q, root, v => {
      if (done || s.play !== p) return; done = true;
      let ok = Q.check(q, v);
      if (!ok && q.t === 'text' && typeof v === 'string' && typeof AlixoCorr !== 'undefined' && AlixoCorr.levenshtein) {
        const nv = Q.norm(v); ok = (q.ans || []).some(a => { const na = Q.norm(a); return na.length >= 4 && AlixoCorr.levenshtein(nv, na) <= Math.max(1, Math.floor(na.length / 6)); });   // faute de frappe tolérée
      }
      if (ok) p.score++;
      p.answers.push({ idx, v, ok });
      root.innerHTML = Q.widgetHTML(q, { reveal: true, v, done: true });
      root.querySelectorAll('input, button, select').forEach(x => { x.disabled = true; });
      const sc = st.querySelector('.aq-pscore'); if (sc) sc.textContent = `${p.score} / ${p.i + 1} ✓`;
      const fb = st.querySelector('.aq-feedback');
      fb.hidden = false;
      fb.className = 'aq-feedback ' + (ok ? 'ok' : 'ko');
      fb.innerHTML = `<div class="aq-fbrow"><span class="aq-fbico">${ok ? '✓' : '✕'}</span><div class="aq-fbtxt"><div class="aq-fbhead">${ok ? 'Bonne réponse' : (v === null || v === undefined || v === '' ? 'Pas de réponse' : 'Mauvaise réponse')}</div>${!ok ? `<div class="aq-fbans">Réponse attendue : <b>${esc(Q.correctText(q))}</b></div>` : ''}${q.expl ? `<div class="aq-fbexpl">${esc(q.expl)}</div>` : ''}</div></div>
        <div class="aq-actions"><button type="button" class="aq-btn primary aq-next" data-aq="next">${p.i + 1 < n ? 'Question suivante' : 'Voir le résultat'}${I.arrow}<kbd>Entrée</kbd></button></div>`;
      const nb = fb.querySelector('.aq-next'); if (nb) { nb.focus({ preventScroll: true }); nb.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
    const first = root.querySelector('input'); if (first) first.focus();
    st.scrollTop = 0; view.scrollTop = 0;
  }
  function nextQuestion(s) {
    const p = s.play; if (!p) return;
    if (p.answers.length <= p.i) return;    // pas encore répondu
    p.i++;
    if (p.i >= p.order.length && !s.gen) { s.step = 'result'; render(s); } else renderQuestion(s);
  }
  function resultHTML(s) {
    const Q = C(); const p = s.play, r = s.result, n = r.questions.length;
    const pct = Math.round(p.score / n * 100);
    const verdict = pct >= 90 ? 'Excellent : le cours est acquis.' : pct >= 70 ? 'Bien : encore quelques points à revoir.' : pct >= 50 ? 'Correct : relisez les passages signalés.' : 'À retravailler : refaites le quiz après une relecture.';
    const missed = p.answers.filter(a => !a.ok);
    return `<div class="aq-result">
      <div class="aq-score"><div class="aq-ring" style="--p:${pct}"><b>${p.score}</b><small>/ ${n}</small></div><div><div class="aq-verdict">${verdict}</div><div class="aq-hint">${esc(r.title)} · ${n} question${n > 1 ? 's' : ''} · ${pct} % de bonnes réponses.</div></div></div>
      ${missed.length ? `<div class="aq-missed"><div class="aq-mhead">À revoir (${missed.length})</div>${missed.map(a => { const q = r.questions[a.idx]; return `<div class="aq-mitem"><div class="aq-mq">${esc(q.text)}</div><div class="aq-mans">Réponse : <b>${esc(Q.correctText(q))}</b>${a.v !== null && a.v !== undefined && a.v !== '' ? ` — vous : <s>${esc(Q.answerText(q, a.v))}</s>` : ''}</div>${q.expl ? `<div class="aq-mexpl">${esc(q.expl)}</div>` : ''}</div>`; }).join('')}</div>` : '<div class="aq-missed aq-perfect">Sans faute !</div>'}
      <div class="aq-actions wrap">
        <button type="button" class="aq-btn primary" data-aq="replay">${I.replay}<span>Rejouer (ordre mélangé)</span></button>
        <button type="button" class="aq-btn ghost" data-aq="back">${ICON}<span>Nouveau quiz ou fiche</span></button>
        ${window.AlixoQuiz && !srcReadOnly(s.d) ? `<button type="button" class="aq-btn ghost" data-aq="savequiz" title="Créer un document Quiz avec ces questions (pour le rejouer, le modifier, le présenter en direct)">${I.save}<span>Enregistrer comme document Quiz</span></button>` : ''}
        <button type="button" class="aq-btn ghost" data-aq="print" title="Imprimer ou enregistrer en PDF : questions puis corrigé">${I.print}<span>Imprimer / PDF</span></button>
      </div></div>`;
  }
  /* un document Quiz (type existant) construit avec les questions générées — facultatif, indépendant du Quiz IA */
  function saveAsQuizDoc(s) {
    const r = s && s.result; if (!r || !window.AlixoQuiz) return;
    try {
      const qd = AlixoQuiz.newDoc(s.d.folderId || null, s.d.prof || '');
      qd.titre = r.title; qd.questions = r.questions.map(q => { const c = JSON.parse(JSON.stringify(q)); c.time = q.t === 'text' ? 30 : 20; c.points = 1000; return c; });
      qd.aiFrom = { docId: s.d.id, title: s.title, at: Date.now() };
      state.docs.push(qd); save();
      toast(`Document Quiz « ${r.title} » créé dans la bibliothèque`, { duration: 6000 });
      openDoc(qd.id);
    } catch (e) { console.error(e); toast('Création du document Quiz impossible'); }
  }

  /* ---------------- fiche de révision ---------------- */
  function sheetHTML(s) {
    const f = s.result;
    const sec = f.parties.map(p => `<section class="aq-sec">${p.titre ? `<h3>${esc(p.titre)}</h3>` : ''}${p.points.length ? `<ul>${p.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${p.definitions.length ? `<dl>${p.definitions.map(d => `<dt>${esc(d.terme)}</dt><dd>${esc(d.definition)}</dd>`).join('')}</dl>` : ''}</section>`).join('');
    const isDoc = !s.d.kind || s.d.kind === 'doc';
    const ro = srcReadOnly(s.d);
    return `<div class="aq-sheet"><article class="aq-fiche">
        <h2>${esc(f.title)}</h2>${f.resume ? `<p class="aq-resume">${esc(f.resume)}</p>` : ''}${sec}
        ${f.retenir.length ? `<div class="aq-box retenir"><b>À retenir</b><ul>${f.retenir.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${f.pieges.length ? `<div class="aq-box pieges"><b>Pièges à éviter</b><ul>${f.pieges.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      </article>
      <div class="aq-actions wrap">
        ${isDoc && !ro ? `<button type="button" class="aq-btn primary" data-aq="insert" title="Ajouter la fiche à la fin de cette séance (titres, puces, encadrés)">${I.doc}<span>Insérer à la fin de la séance</span></button>` : ''}
        <button type="button" class="aq-btn ${isDoc && !ro ? 'ghost' : 'primary'}" data-aq="newdoc" title="Créer une séance « Fiche de révision » dans le même dossier">${I.doc}<span>Nouvelle séance</span></button>
        <button type="button" class="aq-btn ghost" data-aq="copy"><span>Copier le texte</span></button>
        <button type="button" class="aq-btn ghost" data-aq="print" title="Imprimer ou enregistrer en PDF">${I.print}<span>Imprimer / PDF</span></button>
        <button type="button" class="aq-btn ghost" data-aq="back">${ICON}<span>Nouveau quiz ou fiche</span></button>
      </div></div>`;
  }
  /* la fiche → blocs de séance (titres, puces, encadrés Définition / À retenir) */
  function sheetBlocks(f) {
    const out = []; const mk = b => Object.assign({ id: uid() }, b, typeof todayKey === 'function' ? { day: todayKey() } : {});
    out.push(mk({ type: 'h', level: 1, text: esc(f.title) }));
    if (f.resume) out.push(mk({ type: 'p', text: `<i>${esc(f.resume)}</i>` }));
    for (const p of f.parties) {
      if (p.titre) out.push(mk({ type: 'h', level: 2, text: esc(p.titre) }));
      p.points.forEach(x => out.push(mk({ type: 'li', lt: 'ul', text: esc(x) })));
      p.definitions.forEach(d => out.push(mk({ type: 'callout', ct: 'definition', text: `<b>${esc(d.terme)}</b> : ${esc(d.definition)}` })));
    }
    if (f.retenir.length) out.push(mk({ type: 'callout', ct: 'bilan', text: f.retenir.map(x => '- ' + esc(x)).join('<br>') }));
    if (f.pieges.length) { out.push(mk({ type: 'h', level: 2, text: 'Pièges à éviter' })); f.pieges.forEach(x => out.push(mk({ type: 'li', lt: 'ul', text: esc(x) }))); }
    return out;
  }
  function insertSheet(s, where) {
    const f = s && s.result; if (!f) return;
    const blocks = sheetBlocks(f);
    if (where === 'append') {
      const d = findDoc(s.d.id); if (!d || !Array.isArray(d.blocks)) { toast('La séance n’existe plus'); return; }
      if (srcReadOnly(d)) { toast('Séance en lecture seule'); return; }
      const last = d.blocks[d.blocks.length - 1];
      if (last && last.type === 'p' && !S(strip(last.text))) d.blocks.pop();
      d.blocks.push(mkPb(), ...blocks);
      d.updatedAt = Date.now(); save();
      openDoc(d.id);   // on revient sur la séance, le curseur au début de la fiche
      if (typeof renderBlocks === 'function') setTimeout(() => renderBlocks(blocks[0].id, 'start'), 30);
      toast('Fiche de révision ajoutée à la fin de la séance (Ctrl+Z pour annuler)', { duration: 6000 });
      return;
    }
    const nd = { id: uid(), folderId: s.d.folderId || null, titre: f.title, createdAt: Date.now(), updatedAt: Date.now(), pinned: false, prof: s.d.prof || '', blocks, aiFrom: { docId: s.d.id, title: s.title, at: Date.now() } };
    state.docs.push(nd); save();
    openDoc(nd.id);
    toast(`Séance « ${f.title} » créée`, { duration: 5000 });
  }
  const mkPb = () => Object.assign({ id: uid(), type: 'pb' }, typeof todayKey === 'function' ? { day: todayKey() } : {});
  function sheetText(f) {
    const L = [f.title.toUpperCase(), ''];
    if (f.resume) L.push(f.resume, '');
    for (const p of f.parties) { if (p.titre) L.push(p.titre.toUpperCase()); p.points.forEach(x => L.push('• ' + x)); p.definitions.forEach(d => L.push(`${d.terme} : ${d.definition}`)); L.push(''); }
    if (f.retenir.length) { L.push('À RETENIR'); f.retenir.forEach(x => L.push('• ' + x)); L.push(''); }
    if (f.pieges.length) { L.push('PIÈGES À ÉVITER'); f.pieges.forEach(x => L.push('• ' + x)); }
    return L.join('\n').trim();
  }
  async function copySheet(s, btn) {
    const f = s && s.result; if (!f) return;
    try { await navigator.clipboard.writeText(s.resultMode === 'fiche' ? sheetText(f) : quizText(f)); const sp = btn.querySelector('span') || btn; sp.textContent = 'Copié !'; setTimeout(() => { sp.textContent = 'Copier le texte'; }, 1500); }
    catch { toast('Copie impossible dans ce navigateur'); }
  }
  function quizText(r) {
    const Q = C(); const L = [r.title.toUpperCase(), ''];
    r.questions.forEach((q, i) => { L.push(`${i + 1}. ${q.text}`); if (q.t === 'mcq') q.opts.forEach((o, k) => L.push(`   ${Q.letter ? Q.letter(k) : 'ABCDEF'[k]}. ${o.text}`)); });
    L.push('', 'CORRIGÉ');
    r.questions.forEach((q, i) => L.push(`${i + 1}. ${Q.correctText(q)}${q.expl ? ' — ' + q.expl : ''}`));
    return L.join('\n');
  }
  /* impression : questions puis corrigé (quiz) ou la fiche — dans la page même (la version PC n'ouvre pas de fenêtre surgissante) */
  function printResult(s) {
    const r = s && s.result; if (!r) return;
    const Q = C();
    const fiche = s.root.querySelector('.aq-fiche');
    const html = s.resultMode === 'fiche' && fiche
      ? fiche.outerHTML
      : `<article class="aq-fiche"><h2>${esc(r.title)}</h2><ol class="aq-pq">${r.questions.map(q => `<li><div>${esc(q.text)}</div>${q.t === 'mcq' ? `<ul>${q.opts.map((o, k) => `<li>${'ABCDEF'[k]}. ${esc(o.text)}</li>`).join('')}</ul>` : q.t === 'tf' ? '<div class="aq-pvf">☐ Vrai &nbsp; ☐ Faux</div>' : '<div class="aq-pline"></div>'}</li>`).join('')}</ol><h3 class="aq-pbreak">Corrigé</h3><ol class="aq-pq">${r.questions.map(q => `<li><b>${esc(Q.correctText(q))}</b>${q.expl ? ` — ${esc(q.expl)}` : ''}</li>`).join('')}</ol></article>`;
    let box = document.getElementById('aq-print');
    if (!box) { box = document.createElement('div'); box.id = 'aq-print'; document.body.appendChild(box); }
    box.innerHTML = `<style>
      @media screen { #aq-print { display: none; } }
      @media print { body.aq-printing > *:not(#aq-print) { display: none !important; } body.aq-printing { background: #fff !important; }
        #aq-print { display: block; font-family: Georgia, serif; color: #202124; line-height: 1.5; max-width: 760px; margin: 0 auto; }
        #aq-print .aq-fiche { border: none; max-height: none; overflow: visible; padding: 0; background: none; }
        #aq-print h2 { font-size: 22px; margin: 0 0 10px; } #aq-print h3 { font-size: 16px; margin: 16px 0 6px; }
        #aq-print ul, #aq-print ol { margin: 4px 0 10px; padding-left: 22px; } #aq-print li { margin: 3px 0; }
        #aq-print dt { font-weight: 700; margin-top: 6px; } #aq-print dd { margin: 0 0 4px 16px; }
        #aq-print .aq-box { border: 1px solid #cfd3d8; border-radius: 8px; padding: 10px 14px; margin: 12px 0; } #aq-print .aq-box b { display: block; margin-bottom: 4px; }
        #aq-print .aq-pq > li { margin: 0 0 14px; } #aq-print .aq-pq ul { list-style: none; padding-left: 14px; } #aq-print .aq-pline { border-bottom: 1px solid #9aa0a6; height: 26px; width: 70%; }
        #aq-print .aq-pbreak { break-before: page; } #aq-print footer { margin-top: 30px; font-size: 11px; color: #5f6368; } }
      </style>${html}<footer>Généré par Alixo (Quiz IA) à partir de « ${esc(s.title)} » — alixoapp.com</footer>`;
    document.body.classList.add('aq-printing');
    const done = () => { window.removeEventListener('afterprint', done); document.body.classList.remove('aq-printing'); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('aq-printing')) done(); }, 500); }, 50);
  }

  /* la vue s'enregistre dès le chargement : les onglets « Quiz IA » gardés d'une session à l'autre sont rétablis */
  if (window.AlixoApp && AlixoApp.tabs) ensureView();

  const buttonHTML = (attr, cls = '') => `<button type="button" ${attr} class="${cls}" title="Quiz IA et fiche de révision : QCM, vrai / faux, réponses courtes ou fiche de révision générés par l’IA à partir de ce document (Alixo+)">${ICON}<span>Quiz IA</span></button>`;

  /* 1.44 : AlixoAI vient d'être installée (ou s'arrête) pendant que l'onglet est ouvert : l'écran d'attente se met à jour */
  document.addEventListener('alixo-ai', e => {
    const s = cur; if (!s || !s.root || !s.root.isConnected) return;
    const ok = typeof AlixoCorr !== 'undefined' && AlixoCorr.configured();
    const key = ok ? 'ok' : (e.detail || {}).state;
    if (s.aiKey === key) return;
    s.aiKey = key;
    if (s.step === 'form' || s.step === 'error') render(s);
  });

  return { open, docText, shorten, toQuestion, sheetBlocks, buttonHTML, ICON, KINDS, LEVELS, COUNTS, get opts() { return opts; }, get current() { return cur; }, get sessions() { return sessions; } };
})();
