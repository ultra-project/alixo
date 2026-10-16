/* ============================================================
   Alixo — Quiz IA et fiches de révision (1.34, Alixo+)
   Depuis une séance, une présentation ou un tableur, l'IA (le serveur configuré dans Paramètres › IA,
   moteur js/corr.js) lit le document et propose :
   - un quiz à jouer sur place : QCM, vrai / faux, réponses courtes ou mélange, 5 à 20 questions, trois
     niveaux ; correction immédiate avec explication, score final, et au besoin enregistrement dans un
     document Quiz (le type de document, lui, reste indépendant : cette fonction ne le requiert pas) ;
   - une fiche de révision : résumé, parties avec points clés et définitions, « à retenir », pièges ;
     insérée à la fin de la séance, posée dans une nouvelle séance ou copiée.
   Les questions sont au format de QuizCore (js/quizcore.js) : mêmes widgets, même vérification des réponses.
   Chargé APRÈS app.js et quizcore.js : utilise leurs globales (doc, state, save, openDoc, requirePlus,
   openDialog, closeDialog, toast, esc, uid, blockPlain, renderBlocks, touch, AlixoCorr, QuizCore…).
   ============================================================ */
'use strict';

window.AlixoAIQuiz = (() => {
  const MAX_CHARS = 16000;        // texte envoyé au modèle (au-delà : raccourci, en gardant le début de chaque partie)
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

  /* ---------------- appels au modèle ---------------- */
  const parseJson = text => {
    const t = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '');
    const m = t.match(/[\[{][\s\S]*[\]}]/); if (!m) return null;
    try { return JSON.parse(m[0]); } catch { /* json cassé : tentative sur la dernière accolade fermante */ }
    const i = m[0].lastIndexOf('}'); if (i > 0) { try { return JSON.parse(m[0].slice(0, i + 1).replace(/,\s*$/, '') + (m[0][0] === '[' ? ']' : '}')); } catch { /* */ } }
    return null;
  };
  const kindLine = k => k === 'qcm' ? 'Toutes les questions sont des QCM (type "qcm").' : k === 'vf' ? 'Toutes les questions sont des affirmations vrai / faux (type "vf").' : k === 'courte' ? 'Toutes les questions sont à réponse courte (type "courte") : un mot, un nom, une date, un chiffre ou une expression de trois mots au plus.' : 'Mélange les types : environ la moitié de "qcm", un quart de "vf", un quart de "courte" (réponse d’un à trois mots).';
  const levelLine = l => l === 'facile' ? 'Niveau facile : les notions principales, formulées comme dans le document.' : l === 'difficile' ? 'Niveau difficile : détails, exceptions, cas limites, raisonnement ; distracteurs plausibles.' : 'Niveau moyen : comprendre et distinguer les notions, pas seulement les reconnaître.';
  /* 1.34.1 : génération par lots de 5 questions (réponses courtes : la clé n'a pas à couvrir 8 000 jetons d'un coup),
     chaque lot évite les questions déjà posées ; onProgress(k, n) fait avancer l'écran d'attente */
  const BATCH = 5;
  async function genQuiz(ctx, onProgress) {
    const all = []; let title = '', tokIn = 0, tokOut = 0, model = '', lastErr = '';
    for (let b = 0; b < Math.ceil(ctx.n / BATCH) && all.length < ctx.n; b++) {
      const k = Math.min(BATCH, ctx.n - all.length);
      const avoid = all.length ? `\n\nQuestions déjà posées (n'en reprends aucune, interroge sur d'autres passages du document) :\n${all.map(q => '- ' + q.text).join('\n')}` : '';
      const r = await genQuizBatch(Object.assign({}, ctx, { n: k }), avoid);
      if (!r.ok) { lastErr = r.error; if (all.length) break; throw new Error(r.error); }
      tokIn += r.tokIn || 0; tokOut += r.tokOut || 0; model = r.model || model;
      if (!title && r.title) title = r.title;
      const seen = new Set(all.map(q => C().norm(q.text)));
      for (const q of r.questions) { if (all.length >= ctx.n) break; if (seen.has(C().norm(q.text))) continue; seen.add(C().norm(q.text)); all.push(q); }
      if (onProgress) onProgress(all.length, ctx.n);
      if (!r.questions.length) break;
    }
    if (!all.length) throw new Error(lastErr || 'Aucune question exploitable dans la réponse du modèle — réessayez.');
    return { title: title || ('Quiz — ' + (ctx.title || 'révision')), questions: all, tokIn, tokOut, model, partial: all.length < ctx.n ? lastErr : '' };
  }
  async function genQuizBatch(ctx, avoid) {
    const system = `Tu es un enseignant qui prépare un quiz de révision pour un étudiant (droit, économie, commerce, médecine et santé, STAPS…), à partir de SES notes de cours.
Règles : les questions portent uniquement sur le contenu fourni ; une seule bonne réponse par QCM, quatre propositions courtes et homogènes ; les affirmations vrai/faux sont tranchées ; chaque question a une explication d'une ou deux phrases qui cite l'élément du cours. Varie les parties du document. Français soigné (typographie : « », apostrophe ’).
${kindLine(ctx.kind)} ${levelLine(ctx.level)} Exactement ${ctx.n} questions.
Réponds UNIQUEMENT avec ce JSON, sans commentaire ni texte autour :
{"titre":"titre court du quiz","questions":[
 {"type":"qcm","question":"…","choix":["…","…","…","…"],"reponse":0,"explication":"…"},
 {"type":"vf","question":"affirmation…","reponse":true,"explication":"…"},
 {"type":"courte","question":"…","reponses":["réponse attendue","variante acceptée"],"explication":"…"}
]}
"reponse" d'un QCM = l'indice (0 à 3) de la bonne proposition dans "choix".`;
    const user = `Titre du document : ${ctx.title || 'Sans titre'}\n\n${ctx.text}${avoid || ''}`;
    const r = await AlixoCorr.call(null, { system, user, maxTokens: 350 + ctx.n * 240, minTokens: 120 + ctx.n * 110, timeoutMs: 120000, temperature: 0.35 });
    if (!r.ok) return { ok: false, error: r.error || 'Le modèle n’a pas répondu' };
    const j = parseJson(r.text);
    const arr = j && (Array.isArray(j) ? j : j.questions);
    if (!Array.isArray(arr) || !arr.length) return { ok: false, error: 'Le modèle n’a pas renvoyé de questions lisibles — réessayez.' };
    const qs = arr.map(toQuestion).filter(Boolean).slice(0, ctx.n);
    return { ok: true, title: S(j && j.titre), questions: qs, tokIn: r.tokIn, tokOut: r.tokOut, model: r.model };
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
  async function genSheet(ctx) {
    const system = `Tu es un enseignant qui rédige une fiche de révision à partir des notes de cours d'un étudiant (droit, économie, commerce, médecine et santé, STAPS…).
Règles : ne rien inventer, tout vient du document ; phrases courtes ; définitions exactes ; les points clés sont des phrases complètes et autonomes (pas de « voir plus haut ») ; 3 à 7 parties selon la longueur du document ; français soigné (typographie : « », apostrophe ’).
Réponds UNIQUEMENT avec ce JSON, sans commentaire ni texte autour :
{"titre":"…","resume":"deux ou trois phrases qui situent le sujet","parties":[{"titre":"…","points":["…","…"],"definitions":[{"terme":"…","definition":"…"}]}],"retenir":["l'essentiel en 3 à 6 phrases"],"pieges":["erreurs fréquentes, confusions à éviter (0 à 4)"]}`;
    const user = `Titre du document : ${ctx.title || 'Sans titre'}\n\n${ctx.text}`;
    const r = await AlixoCorr.call(null, { system, user, maxTokens: 3200, minTokens: 900, timeoutMs: 150000, temperature: 0.25 });
    if (!r.ok) throw new Error(r.error || 'Le modèle n’a pas répondu');
    const j = parseJson(r.text);
    if (!j || typeof j !== 'object' || !Array.isArray(j.parties)) throw new Error('Le modèle n’a pas renvoyé de fiche lisible — réessayez.');
    const parties = j.parties.map(p => p && typeof p === 'object' ? { titre: S(p.titre), points: (Array.isArray(p.points) ? p.points : []).map(S).filter(Boolean), definitions: (Array.isArray(p.definitions) ? p.definitions : []).map(d => d && typeof d === 'object' ? { terme: S(d.terme), definition: S(d.definition) } : null).filter(d => d && d.terme && d.definition) } : null).filter(p => p && (p.titre || p.points.length || p.definitions.length));
    if (!parties.length) throw new Error('Fiche vide — réessayez.');
    return { title: S(j.titre) || ('Fiche de révision — ' + (ctx.title || '')), resume: S(j.resume), parties, retenir: (Array.isArray(j.retenir) ? j.retenir : []).map(S).filter(Boolean), pieges: (Array.isArray(j.pieges) ? j.pieges : []).map(S).filter(Boolean), tokIn: r.tokIn, tokOut: r.tokOut };
  }

  /* ---------------- fenêtre ---------------- */
  const ICON = '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4Z"/><path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9Z"/><path d="M19 14l.6 1.4 1.4.6-1.4.6L19 18l-.6-1.4L17 16l1.4-.6Z"/></svg>';
  const DLG = 'aiquiz';
  let cur = null;   // { d, title, text, cut, nWords, result, play }
  const settingsLink = () => `<button class="cta ghost small" type="button" data-aq="settings">Configurer l’IA (Paramètres › IA)</button>`;

  function open(d) {
    d = d || (typeof doc === 'function' ? doc() : null);
    if (!d) { toast('Ouvrez d’abord une séance, une présentation ou un tableur'); return; }
    if (d.kind === 'quiz') { toast('Le Quiz IA se lance depuis une séance, une présentation ou un tableur'); return; }
    if (typeof requirePlus === 'function' && !requirePlus('quizia')) return;
    const raw = docText(d);
    const nWords = words(raw);
    const { text, cut } = shorten(raw);
    cur = { d, title: S(d.titre) || (d.kind === 'slides' ? 'Présentation' : d.kind === 'sheet' ? 'Tableur' : 'Séance'), text, cut, nWords, result: null, play: null };
    const ready = typeof AlixoCorr !== 'undefined' && AlixoCorr.configured();
    openDialog({
      id: DLG, cls: 'aq-dlg', eyebrow: 'Alixo+ · intelligence artificielle',
      title: 'Quiz et fiche de révision',
      sub: `À partir de « ${esc(cur.title)} » — ${nWords.toLocaleString('fr-FR')} mot${nWords > 1 ? 's' : ''}${cut ? ' (document long : le modèle en lit un extrait de chaque partie)' : ''}.`,
      body: `<div id="aq-body">${ready ? formHTML() : noAiHTML()}</div>`,
      onMount: card => bind(card),
      onClose: () => { cur = null; }
    });
    const t = document.querySelector(`#${DLG} .set-htitle`); if (t) t.innerHTML = `${ICON} Quiz et fiche de révision`;
  }
  const noAiHTML = () => `<div class="aq-empty"><b>Aucun serveur d’IA n’est configuré.</b><p>Le Quiz IA utilise le même modèle que la correction par IA : indiquez un serveur (OpenRouter, Ollama sur votre ordinateur, ou un autre serveur compatible) dans Paramètres › IA, puis revenez ici.</p>${settingsLink()}</div>`;
  const seg = (name, list, val) => `<div class="aq-seg" role="radiogroup" data-seg="${name}">${list.map(([k, lab, hint]) => `<button type="button" class="${k === val ? 'on' : ''}" data-v="${k}" title="${esc(hint || '')}">${lab}</button>`).join('')}</div>`;
  function formHTML() {
    if (nWordsTooSmall()) return `<div class="aq-empty"><b>Le document est presque vide.</b><p>Écrivez d’abord quelques paragraphes (une trentaine de mots au moins) : le quiz et la fiche sont construits uniquement à partir de ce que contient le document.</p></div>`;
    const quiz = opts.mode !== 'fiche';
    return `<div class="aq-form">
      <div class="aq-modes">
        <button type="button" class="aq-mode ${quiz ? 'on' : ''}" data-mode="quiz"><span class="aq-mico">☑</span><b>Quiz</b><small>QCM, vrai / faux, réponses courtes — corrigé sur place</small></button>
        <button type="button" class="aq-mode ${!quiz ? 'on' : ''}" data-mode="fiche"><span class="aq-mico">▤</span><b>Fiche de révision</b><small>Résumé, points clés, définitions, à retenir, pièges</small></button>
      </div>
      ${quiz ? `<div class="aq-row"><label>Questions</label>${seg('kind', KINDS, opts.kind)}</div>
      <div class="aq-row"><label>Nombre</label>${seg('n', COUNTS.map(n => [String(n), String(n)]), String(opts.n))}</div>
      <div class="aq-row"><label>Niveau</label>${seg('level', LEVELS, opts.level)}</div>` : `<div class="aq-row aq-hint"><label>Contenu</label><div class="po-hint" style="margin:0">La fiche reprend tout le document : un résumé, trois à sept parties avec leurs points clés et définitions, « à retenir », et les pièges à éviter. Vous pourrez l’insérer à la fin de la séance, en faire une nouvelle séance ou la copier.</div></div>`}
      <div class="aq-actions"><button type="button" class="cta plus-cta" data-aq="go">${ICON} Générer ${quiz ? 'le quiz' : 'la fiche'}</button><span class="aq-note">Les notes partent au serveur d’IA configuré dans Paramètres › IA ; rien n’est conservé par Alixo.</span></div>
    </div>`;
  }
  const nWordsTooSmall = () => !cur || cur.nWords < 30;
  const loadingHTML = what => `<div class="aq-loading"><div class="aq-spin"></div><b>Le modèle lit votre ${cur.d.kind === 'slides' ? 'présentation' : cur.d.kind === 'sheet' ? 'tableur' : 'cours'}…</b><p>${what} — comptez dix à quarante secondes selon le serveur.</p><button type="button" class="cta ghost small" data-aq="cancel">Annuler</button></div>`;
  const errorHTML = msg => `<div class="aq-empty aq-err"><b>Ça n’a pas marché.</b><p>${esc(msg)}</p><div class="aq-actions"><button type="button" class="cta small" data-aq="back">Réessayer</button>${/configur|Paramètres/i.test(msg) ? settingsLink() : ''}</div></div>`;

  function bind(card) {
    const body = card.querySelector('#aq-body');
    body.addEventListener('click', async e => {
      const mode = e.target.closest('[data-mode]'); if (mode) { opts.mode = mode.dataset.mode; saveOpts(); body.innerHTML = formHTML(); return; }
      const sv = e.target.closest('.aq-seg [data-v]');
      if (sv) { const k = sv.closest('.aq-seg').dataset.seg; opts[k] = k === 'n' ? +sv.dataset.v : sv.dataset.v; saveOpts(); sv.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === sv)); return; }
      const b = e.target.closest('[data-aq]'); if (!b || !cur) return;
      const a = b.dataset.aq;
      if (a === 'settings') { closeDialog(DLG); if (typeof openSettings === 'function') openSettings('ia'); return; }
      if (a === 'back') { body.innerHTML = formHTML(); return; }
      if (a === 'cancel') { cur.gen = null; body.innerHTML = formHTML(); return; }
      if (a === 'go') { await generate(body); return; }
      if (a === 'next') { nextQuestion(body); return; }
      if (a === 'replay') { startPlay(body, true); return; }
      if (a === 'savequiz') { saveAsQuizDoc(); return; }
      if (a === 'insert') { insertSheet('append'); return; }
      if (a === 'newdoc') { insertSheet('new'); return; }
      if (a === 'copy') { copySheet(b); return; }
      if (a === 'print') { printResult(); return; }
    });
  }
  async function generate(body) {
    const quiz = opts.mode !== 'fiche';
    const gen = {}; cur.gen = gen;
    body.innerHTML = loadingHTML(quiz ? `${opts.n} questions, niveau ${LEVELS.find(l => l[0] === opts.level)[1].toLowerCase()}` : 'rédaction de la fiche');
    try {
      const ctx = { title: cur.title, text: cur.text, kind: opts.kind, n: opts.n, level: opts.level };
      const res = quiz ? await genQuiz(ctx, (k, n) => { const el = body.querySelector('.aq-loading p'); if (el && cur && cur.gen === gen) el.textContent = `${k} question${k > 1 ? 's' : ''} sur ${n} — la suite arrive…`; }) : await genSheet(ctx);
      if (cur.gen !== gen) return;   // annulé entre-temps
      cur.result = res; cur.resultMode = quiz ? 'quiz' : 'fiche';
      if (quiz) { startPlay(body); if (res.partial) toast(`${res.questions.length} questions sur ${opts.n} : ${res.partial}`, { duration: 8000 }); }
      else body.innerHTML = sheetHTML(res);
    } catch (err) {
      if (cur && cur.gen === gen) body.innerHTML = errorHTML(err && err.message || String(err));
    }
  }

  /* ---------------- jeu ---------------- */
  function startPlay(body, again) {
    const r = cur.result;
    cur.play = { i: 0, score: 0, answers: [], order: again ? C().shuffle(r.questions.map((_, i) => i)) : r.questions.map((_, i) => i) };
    renderQuestion(body);
  }
  function renderQuestion(body) {
    const Q = C(); const p = cur.play, r = cur.result;
    const idx = p.order[p.i]; const q = r.questions[idx];
    const n = r.questions.length;
    body.innerHTML = `<div class="aq-play qz-play-scope">
      <div class="aq-phead"><span class="aq-pnum">Question ${p.i + 1} / ${n}</span><span class="aq-ptype">${esc((Q.TYPES[q.t] || {}).name || '')}</span><span class="aq-pscore">${p.score} / ${p.i} ✓</span></div>
      <div class="aq-pbar"><i style="width:${Math.round(p.i / n * 100)}%"></i></div>
      <div class="qp-q">${esc(q.text)}</div>
      <div class="aq-widget">${Q.widgetHTML(q)}</div>
      <div class="aq-feedback" hidden></div>
    </div>`;
    const root = body.querySelector('.aq-widget');
    let done = false;
    Q.bindWidget(q, root, v => {
      if (done) return; done = true;
      let ok = Q.check(q, v);
      if (!ok && q.t === 'text' && typeof v === 'string' && typeof AlixoCorr !== 'undefined' && AlixoCorr.levenshtein) {
        const nv = Q.norm(v); ok = (q.ans || []).some(a => { const na = Q.norm(a); return na.length >= 4 && AlixoCorr.levenshtein(nv, na) <= Math.max(1, Math.floor(na.length / 6)); });   // faute de frappe tolérée
      }
      if (ok) p.score++;
      p.answers.push({ idx, v, ok });
      root.innerHTML = Q.widgetHTML(q, { reveal: true, v, done: true });
      root.querySelectorAll('input, button, select').forEach(x => { x.disabled = true; });
      const fb = body.querySelector('.aq-feedback');
      fb.hidden = false;
      fb.className = 'aq-feedback ' + (ok ? 'ok' : 'ko');
      fb.innerHTML = `<div class="aq-fbhead">${ok ? '✓ Bonne réponse' : '✗ ' + (v === null || v === undefined || v === '' ? 'Pas de réponse' : 'Mauvaise réponse')}</div>${!ok ? `<div class="aq-fbans">Réponse attendue : <b>${esc(Q.correctText(q))}</b></div>` : ''}${q.expl ? `<div class="aq-fbexpl">${esc(q.expl)}</div>` : ''}
        <div class="aq-actions"><button type="button" class="cta small" data-aq="next" autofocus>${p.i + 1 < n ? 'Question suivante' : 'Voir le résultat'}</button></div>`;
      const nb = fb.querySelector('[data-aq="next"]'); if (nb) nb.focus();
    });
    const first = root.querySelector('input'); if (first) first.focus();
  }
  function nextQuestion(body) {
    const p = cur.play; if (!p) return;
    if (p.answers.length <= p.i) return;    // pas encore répondu
    p.i++;
    if (p.i >= cur.result.questions.length) renderResult(body); else renderQuestion(body);
  }
  function renderResult(body) {
    const Q = C(); const p = cur.play, r = cur.result, n = r.questions.length;
    const pct = Math.round(p.score / n * 100);
    const verdict = pct >= 90 ? 'Excellent : le cours est acquis.' : pct >= 70 ? 'Bien : encore quelques points à revoir.' : pct >= 50 ? 'Correct : relisez les passages signalés.' : 'À retravailler : refaites le quiz après une relecture.';
    const missed = p.answers.filter(a => !a.ok);
    body.innerHTML = `<div class="aq-result">
      <div class="aq-score"><div class="aq-ring" style="--p:${pct}"><b>${p.score}</b><small>/ ${n}</small></div><div><div class="aq-verdict">${verdict}</div><div class="po-hint" style="margin:4px 0 0">${esc(r.title)} · ${n} question${n > 1 ? 's' : ''} · ${pct} % de bonnes réponses.</div></div></div>
      ${missed.length ? `<div class="aq-missed"><div class="aq-mhead">À revoir (${missed.length})</div>${missed.map(a => { const q = r.questions[a.idx]; return `<div class="aq-mitem"><div class="aq-mq">${esc(q.text)}</div><div class="aq-mans">Réponse : <b>${esc(Q.correctText(q))}</b>${a.v !== null && a.v !== undefined && a.v !== '' ? ` — vous : <s>${esc(Q.answerText(q, a.v))}</s>` : ''}</div>${q.expl ? `<div class="aq-mexpl">${esc(q.expl)}</div>` : ''}</div>`; }).join('')}</div>` : '<div class="aq-missed aq-perfect">Sans faute !</div>'}
      <div class="aq-actions wrap">
        <button type="button" class="cta small" data-aq="replay">Rejouer (ordre mélangé)</button>
        <button type="button" class="cta ghost small" data-aq="back">Nouveau quiz ou fiche</button>
        ${window.AlixoQuiz && !cur.d.shared ? `<button type="button" class="cta ghost small" data-aq="savequiz" title="Créer un document Quiz avec ces questions (pour le rejouer, le modifier, le présenter en direct)">Enregistrer comme document Quiz</button>` : ''}
        <button type="button" class="cta ghost small" data-aq="print" title="Imprimer ou enregistrer en PDF : questions puis corrigé">Imprimer / PDF</button>
      </div></div>`;
  }
  /* un document Quiz (type existant) construit avec les questions générées — facultatif, indépendant du Quiz IA */
  function saveAsQuizDoc() {
    const r = cur && cur.result; if (!r || !window.AlixoQuiz) return;
    try {
      const qd = AlixoQuiz.newDoc(cur.d.folderId || null, cur.d.prof || '');
      qd.titre = r.title; qd.questions = r.questions.map(q => { const c = JSON.parse(JSON.stringify(q)); c.time = q.t === 'text' ? 30 : 20; c.points = 1000; return c; });
      qd.aiFrom = { docId: cur.d.id, title: cur.title, at: Date.now() };
      state.docs.push(qd); save();
      toast(`Document Quiz « ${r.title} » créé dans la bibliothèque`, { duration: 6000 });
      closeDialog(DLG);
      openDoc(qd.id);
    } catch (e) { console.error(e); toast('Création du document Quiz impossible'); }
  }

  /* ---------------- fiche de révision ---------------- */
  function sheetHTML(f) {
    const sec = f.parties.map(p => `<section class="aq-sec">${p.titre ? `<h3>${esc(p.titre)}</h3>` : ''}${p.points.length ? `<ul>${p.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${p.definitions.length ? `<dl>${p.definitions.map(d => `<dt>${esc(d.terme)}</dt><dd>${esc(d.definition)}</dd>`).join('')}</dl>` : ''}</section>`).join('');
    const isDoc = !cur.d.kind || cur.d.kind === 'doc';
    const ro = typeof readOnly !== 'undefined' && readOnly;
    return `<div class="aq-sheet"><article class="aq-fiche">
        <h2>${esc(f.title)}</h2>${f.resume ? `<p class="aq-resume">${esc(f.resume)}</p>` : ''}${sec}
        ${f.retenir.length ? `<div class="aq-box retenir"><b>À retenir</b><ul>${f.retenir.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${f.pieges.length ? `<div class="aq-box pieges"><b>Pièges à éviter</b><ul>${f.pieges.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      </article>
      <div class="aq-actions wrap">
        ${isDoc && !ro ? `<button type="button" class="cta small" data-aq="insert" title="Ajouter la fiche à la fin de cette séance (titres, puces, encadrés)">Insérer à la fin de la séance</button>` : ''}
        <button type="button" class="cta ${isDoc && !ro ? 'ghost ' : ''}small" data-aq="newdoc" title="Créer une séance « Fiche de révision » dans le même dossier">Nouvelle séance</button>
        <button type="button" class="cta ghost small" data-aq="copy">Copier le texte</button>
        <button type="button" class="cta ghost small" data-aq="print" title="Imprimer ou enregistrer en PDF">Imprimer / PDF</button>
        <button type="button" class="cta ghost small" data-aq="back">Nouveau quiz ou fiche</button>
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
  function insertSheet(where) {
    const f = cur && cur.result; if (!f) return;
    const blocks = sheetBlocks(f);
    if (where === 'append') {
      const d = cur.d; if (!d || !Array.isArray(d.blocks)) return;
      if (typeof readOnly !== 'undefined' && readOnly) { toast('Séance en lecture seule'); return; }
      const last = d.blocks[d.blocks.length - 1];
      if (last && last.type === 'p' && !S(strip(last.text))) d.blocks.pop();
      d.blocks.push(mkPb(), ...blocks);
      if (typeof touch === 'function') touch(); else { d.updatedAt = Date.now(); save(); }
      closeDialog(DLG);
      if (typeof renderBlocks === 'function') renderBlocks(blocks[0].id, 'start');
      toast('Fiche de révision ajoutée à la fin de la séance (Ctrl+Z pour annuler)', { duration: 6000 });
      return;
    }
    const nd = { id: uid(), folderId: cur.d.folderId || null, titre: f.title, createdAt: Date.now(), updatedAt: Date.now(), pinned: false, prof: cur.d.prof || '', blocks, aiFrom: { docId: cur.d.id, title: cur.title, at: Date.now() } };
    state.docs.push(nd); save();
    closeDialog(DLG);
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
  async function copySheet(btn) {
    const f = cur && cur.result; if (!f) return;
    try { await navigator.clipboard.writeText(cur.resultMode === 'fiche' ? sheetText(f) : quizText(f)); btn.textContent = 'Copié !'; setTimeout(() => { btn.textContent = 'Copier le texte'; }, 1500); }
    catch { toast('Copie impossible dans ce navigateur'); }
  }
  function quizText(r) {
    const Q = C(); const L = [r.title.toUpperCase(), ''];
    r.questions.forEach((q, i) => { L.push(`${i + 1}. ${q.text}`); if (q.t === 'mcq') q.opts.forEach((o, k) => L.push(`   ${Q.letter ? Q.letter(k) : 'ABCDEF'[k]}. ${o.text}`)); });
    L.push('', 'CORRIGÉ');
    r.questions.forEach((q, i) => L.push(`${i + 1}. ${Q.correctText(q)}${q.expl ? ' — ' + q.expl : ''}`));
    return L.join('\n');
  }
  /* impression : questions puis corrigé (quiz) ou la fiche */
  function printResult() {
    const r = cur && cur.result; if (!r) return;
    const Q = C();
    const html = cur.resultMode === 'fiche'
      ? document.querySelector('#aq-body .aq-fiche').outerHTML
      : `<article class="aq-fiche"><h2>${esc(r.title)}</h2><ol class="aq-pq">${r.questions.map(q => `<li><div>${esc(q.text)}</div>${q.t === 'mcq' ? `<ul>${q.opts.map((o, k) => `<li>${'ABCDEF'[k]}. ${esc(o.text)}</li>`).join('')}</ul>` : q.t === 'tf' ? '<div class="aq-pvf">☐ Vrai &nbsp; ☐ Faux</div>' : '<div class="aq-pline"></div>'}</li>`).join('')}</ol><h3 class="aq-pbreak">Corrigé</h3><ol class="aq-pq">${r.questions.map(q => `<li><b>${esc(Q.correctText(q))}</b>${q.expl ? ` — ${esc(q.expl)}` : ''}</li>`).join('')}</ol></article>`;
    // 1.34.1 : impression dans la page même (la version PC n'ouvre pas de fenêtre surgissante)
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
      </style>${html}<footer>Généré par Alixo (Quiz IA) à partir de « ${esc(cur.title)} » — alixoapp.com</footer>`;
    document.body.classList.add('aq-printing');
    const done = () => { window.removeEventListener('afterprint', done); document.body.classList.remove('aq-printing'); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('aq-printing')) done(); }, 500); }, 50);
  }

  const buttonHTML = (attr, cls = '') => `<button type="button" ${attr} class="${cls}" title="Quiz IA et fiche de révision : QCM, vrai / faux, réponses courtes ou fiche de révision générés par l’IA à partir de ce document (Alixo+)">${ICON}<span>Quiz IA</span></button>`;

  return { open, docText, shorten, toQuestion, sheetBlocks, buttonHTML, ICON, parseJson, KINDS, LEVELS, COUNTS, get opts() { return opts; }, get current() { return cur; } };
})();
