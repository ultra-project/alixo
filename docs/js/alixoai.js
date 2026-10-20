/* ============================================================
   AlixoAI — l'intelligence artificielle d'Alixo (1.37)
   ------------------------------------------------------------
   Couche unique entre les fonctions de l'application (correction, mise en forme, quiz, fiche de révision) et le
   moteur de langue (js/ailocal.js). Elle ne laisse rien configurer : elle choisit d'elle-même la taille de modèle
   adaptée à l'appareil, se prépare en silence au démarrage, et optimise chaque demande pour que la réponse arrive
   vite — même sur un portable modeste :
   - consignes courtes, écrites pour un petit modèle, avec un exemple plutôt qu'une liste de règles ;
   - formats de réponse en lignes (pas de JSON bavard) : deux à trois fois moins de texte à produire ;
   - lecture progressive : chaque question de quiz, chaque partie de fiche est livrée dès qu'elle est complète
     (le quiz commence après la première question, le reste s'écrit pendant que l'étudiant répond) ;
   - extraits ciblés : le document est découpé en passages, chaque question part d'un passage précis, courts lots ;
   - conversation suivie : les lots d'un même quiz s'enchaînent dans la même conversation — le moteur ne relit pas
     la consigne à chaque lot (cache des clés-valeurs) ;
   - budgets (taille des extraits, nombre de questions par lot, longueur de réponse) ajustés à la taille du modèle
     et au contexte (frappe en arrière-plan, demande explicite).
   API (window.AlixoAI) :
     available()                 { ok, reason } — l'appareil sait-il faire tourner AlixoAI ?
     enabled() / setEnabled(b)   AlixoAI est actif (réglage « Désactiver » des Paramètres)
     ready()                     prête à répondre tout de suite (modèle chargé)
     state()                     'off' | 'unavailable' | 'idle' | 'preparing' | 'ready' | 'error'
     warm()                      prépare AlixoAI en silence (installation puis chargement, puis une micro-requête)
     tier()                      'leger' | 'equilibre' | 'complet' (taille choisie pour l'appareil)
     run(task, payload, opts)    → Promise<résultat> ; tâches : 'ping', 'correct', 'style', 'quiz', 'sheet'
                                  opts : { onItem(item, i), onProgress(k, n), onText(text), background, token }
     cancel(token)               annule les requêtes portant ce jeton
     passages(text, n, size)     découpe un texte en n passages répartis (exposé pour les tests)
     parse.*                     analyseurs des formats de réponse (exposés pour les tests)
   Événement document « alixo-ai » (detail = { state, busy, waiting }) à chaque changement visible.
   ============================================================ */
'use strict';

window.AlixoAI = (() => {
  const L = () => window.AlixoLocalAI || null;
  const OFF_LS = 'alixo.ai.off';   // '1' : AlixoAI désactivée sur cet appareil

  /* ---------------- budgets par taille de modèle ----------------
     chunk = caractères par passage (quiz) ; batch = questions par lot ; first = questions du premier lot (la première
     question doit arriver vite) ; sheet = caractères du document pour une fiche ; live / full = caractères par lot
     de correction (frappe / F7) ; style = paragraphes par lot de mise en forme. */
  const BUDGETS = {
    leger:     { chunk: 320, batch: 3, first: 2, sheet: 3200, live: 700,  full: 1800, style: 8,  sheetTokens: 900 },
    equilibre: { chunk: 440, batch: 3, first: 2, sheet: 4800, live: 1000, full: 2600, style: 10, sheetTokens: 1100 },
    complet:   { chunk: 560, batch: 4, first: 2, sheet: 7000, live: 1200, full: 3200, style: 14, sheetTokens: 1400 }
  };
  function tier() { const l = L(); if (!l) return 'equilibre'; const s = l.status(); return (s.state === 'ready' || s.state === 'loading') && s.key ? s.key : l.recommend(); }
  const budget = () => BUDGETS[tier()] || BUDGETS.equilibre;

  /* ---------------- état ---------------- */
  let off = false; try { off = localStorage.getItem(OFF_LS) === '1'; } catch { /* stockage indisponible */ }
  function enabled() { return !off; }
  function setEnabled(b) { off = !b; try { if (b) localStorage.removeItem(OFF_LS); else localStorage.setItem(OFF_LS, '1'); } catch { /* */ } emit(); }
  function available() { const l = L(); if (!l) return { ok: false, reason: 'Le moteur d’AlixoAI n’est pas chargé.' }; return l.support(); }
  function ready() { const l = L(); return !!l && enabled() && l.status().state === 'ready'; }
  function state() {
    if (off) return 'off';
    const a = available(); if (!a.ok) return 'unavailable';
    const s = L().status();
    return s.state === 'ready' ? 'ready' : s.state === 'loading' ? 'preparing' : s.state === 'error' ? 'error' : 'idle';
  }
  function emit() { try { const s = L() ? L().status() : {}; document.dispatchEvent(new CustomEvent('alixo-ai', { detail: { state: state(), busy: !!s.busy, waiting: s.waiting || 0 } })); } catch { /* */ } }
  document.addEventListener('alixo-ai-local', emit);

  /* préparation silencieuse : installation (une fois) puis chargement, puis une micro-requête qui compile les programmes
     graphiques — la première vraie demande part ainsi sans attendre. Ne fait rien si AlixoAI est désactivée ou
     indisponible ; ne jamais lever d'erreur (appelée au démarrage). */
  let warming = null;
  function warm() {
    if (warming) return warming;
    warming = (async () => {
      try {
        const l = L(); if (!l || off || !l.support().ok) return false;
        const p = await l.probe(); if (!p.ok) return false;
        await l.load(l.recommend());
        await l.chat({ system: 'Réponds « ok ».', user: 'ok', maxTokens: 4, timeoutMs: 60000, background: true });
        return true;
      } catch (e) { console.warn('AlixoAI (préparation) :', e && e.message || e); return false; }
      finally { warming = null; }
    })();
    return warming;
  }

  /* ---------------- texte : passages ---------------- */
  const norm = t => String(t || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  /* découpe en passages de `size` caractères environ (paragraphes entiers quand c'est possible, titres rattachés au
     paragraphe suivant), puis en garde `n` répartis sur tout le document — pour que les questions couvrent le cours
     entier, pas seulement son début. n = 0 : tous les passages. */
  function passages(text, n, size) {
    size = size || budget().chunk;
    const paras = norm(text).split(/\n+/).map(x => x.trim()).filter(Boolean);
    const chunks = []; let cur = '', head = '';
    const flush = () => { if (cur.trim()) chunks.push((head ? head + '\n' : '') + cur.trim()); cur = ''; head = ''; };
    for (const p of paras) {
      if (/^#{1,4} /.test(p)) { flush(); head = p.replace(/^#+ /, ''); continue; }
      if (p.length > size * 1.6) {   // long paragraphe : coupé aux phrases
        flush();
        let acc = '';
        for (const sn of p.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÝŒ«"(])/)) { if (acc && acc.length + sn.length > size) { chunks.push(acc.trim()); acc = ''; } acc += (acc ? ' ' : '') + sn; }
        if (acc.trim()) chunks.push(acc.trim());
        continue;
      }
      if (cur && cur.length + p.length > size) flush();
      cur += (cur ? '\n' : '') + p;
    }
    flush();
    const good = chunks.filter(c => c.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 40);
    const list = good.length ? good : chunks;
    if (!n || list.length <= n) return list;
    const out = []; const step = list.length / n;
    for (let i = 0; i < n; i++) out.push(list[Math.min(list.length - 1, Math.floor(i * step + step / 2))]);
    return out;
  }
  const shortenTo = (text, max) => { const t = norm(text); return t.length <= max ? t : passages(t, 0, Math.max(200, Math.floor(max / 8))).join('\n\n').slice(0, max); };

  /* ---------------- formats de réponse (lignes) et analyseurs ---------------- */
  const clean = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '');
  const unq = t => String(t || '').trim().replace(/^[«"“]\s*|\s*[»"”]$/g, '').trim();
  const parse = {};

  /* Quiz — une question = un bloc :
       #1 qcm
       Q: question
       A: … / B: … / C: … / D: …
       R: B            (vf : R: vrai|faux ; courte : R: réponse | variante)
       E: explication courte
     complete = false : le dernier bloc, encore en cours d'écriture, n'est pas livré (lecture progressive). */
  parse.quiz = (text, complete) => {
    const lines = clean(text).split('\n');
    const blocks = []; let cur = null;
    const push = () => { if (cur && cur.q) blocks.push(cur); cur = null; };
    for (const raw of lines) {
      const line = raw.trim(); if (!line) continue;
      let m;
      if ((m = /^#+\s*(\d+)?\s*[.)]?\s*(qcm|vf|courte|vrai\s*\/?\s*faux|texte?)?\s*:?\s*(.*)$/i.exec(line)) && !/^#+\s*[A-ZÀ-Ý]/.test(line)) { push(); cur = { type: (m[2] || '').toLowerCase(), q: '', choices: [], r: '', e: '', title: '' }; if (m[3] && !/^(qcm|vf|courte)$/i.test(m[3])) cur.q = unq(m[3].replace(/^Q\s*:\s*/i, '')); continue; }
      if ((m = /^(?:Q|Question)\s*\d*\s*[:.)-]\s*(.*)$/i.exec(line))) { if (!cur || cur.q) { push(); cur = { type: '', q: '', choices: [], r: '', e: '', title: '' }; } cur.q = unq(m[1]); continue; }
      if (!cur) { if ((m = /^(?:T|Titre)\s*:\s*(.+)$/i.exec(line))) blocks.title = unq(m[1]); continue; }
      if ((m = /^([A-Da-d])\s*[:.)-]\s*(.+)$/.exec(line))) { cur.choices.push(unq(m[2])); continue; }
      if ((m = /^(?:R|Réponse|Reponse|Bonne réponse)\s*[:.)-]\s*(.+)$/i.exec(line))) { cur.r = unq(m[1]); continue; }
      if ((m = /^(?:E|Explication|Pourquoi)\s*[:.)-]\s*(.+)$/i.exec(line))) { cur.e = unq(m[1]); continue; }
      if (cur.e) cur.e += ' ' + line; else if (!cur.choices.length && cur.q && !cur.r) cur.q += ' ' + line;
    }
    const done = cur && cur.q && cur.r && (complete || false);
    if (done) push();
    const out = blocks.map(toQuestion).filter(Boolean);
    out.title = blocks.title || '';
    return out;
  };
  function toQuestion(b) {
    const q = unq(b.q); if (!q) return null;
    let type = b.type;
    const r = b.r;
    if (!type) type = b.choices.length >= 2 ? 'qcm' : /^(vrai|faux|v|f|true|false)\b/i.test(r) ? 'vf' : 'courte';
    if (/vrai|vf/.test(type) && !b.choices.length) return { type: 'vf', question: q, reponse: /^(vrai|v|true|oui)\b/i.test(r), explication: unq(b.e) };
    if (type === 'qcm' || b.choices.length >= 2) {
      if (b.choices.length < 2) return null;
      let idx = -1;
      const mm = /^([A-Da-d])\b/.exec(r); if (mm) idx = mm[1].toUpperCase().charCodeAt(0) - 65;
      if (idx < 0 || idx >= b.choices.length) { const n = b.choices.findIndex(c => c.toLowerCase() === r.toLowerCase()); idx = n >= 0 ? n : 0; }
      return { type: 'qcm', question: q, choix: b.choices.slice(0, 4), reponse: idx, explication: unq(b.e) };
    }
    const answers = r.split(/\s*[|;]\s*/).map(unq).filter(Boolean);
    if (!answers.length) return null;
    return { type: 'courte', question: q, reponses: answers.slice(0, 6), explication: unq(b.e) };
  }

  /* Fiche —  # titre / R: résumé / ## partie / - point / = terme : définition / + à retenir / ! piège */
  parse.sheet = (text, complete) => {
    const f = { title: '', resume: '', parties: [], retenir: [], pieges: [], open: null };
    let part = null;
    const lines = clean(text).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim(); if (!line) continue;
      const last = !complete && i === lines.length - 1;   // ligne encore en cours d'écriture
      let m;
      if ((m = /^#\s+(.+)$/.exec(line)) && !f.title) { f.title = unq(m[1]); continue; }
      if ((m = /^(?:R|Résumé|Resume)\s*:\s*(.+)$/i.exec(line))) { f.resume = unq(m[1]); continue; }
      if ((m = /^##+\s*(.+)$/.exec(line))) { const t = unq(m[1]); if (/^(à retenir|a retenir|retenir)$/i.test(t)) { part = { retenir: true }; continue; } if (/^pi[èe]ges?/i.test(t)) { part = { pieges: true }; continue; } part = { titre: t, points: [], definitions: [] }; f.parties.push(part); continue; }
      if (last) continue;
      if ((m = /^=\s*(.+?)\s*[:—–-]\s+(.+)$/.exec(line)) && part && part.points) { part.definitions.push({ terme: unq(m[1]), definition: unq(m[2]) }); continue; }
      if ((m = /^\+\s*(.+)$/.exec(line))) { f.retenir.push(unq(m[1])); continue; }
      if ((m = /^!\s*(.+)$/.exec(line))) { f.pieges.push(unq(m[1])); continue; }
      if ((m = /^[-•*]\s*(.+)$/.exec(line))) { if (part && part.retenir) f.retenir.push(unq(m[1])); else if (part && part.pieges) f.pieges.push(unq(m[1])); else if (part && part.points) part.points.push(unq(m[1])); else f.retenir.push(unq(m[1])); continue; }
      if (part && part.points && !part.points.length && !part.definitions.length && !/^[A-Z#=+!-]/.test(line)) part.points.push(unq(line));
    }
    f.parties = f.parties.filter(p => p.titre || p.points.length || p.definitions.length);
    f.open = !complete && part && part.points ? part : null;   // partie encore en cours d'écriture
    return f;
  };

  /* Correction — une ligne par faute : n | avant → apres | type | règle ; paragraphes : § A | type | terme ; OK = rien */
  parse.correct = text => {
    const c = {}, m = {};
    for (const raw of clean(text).split('\n')) {
      const line = raw.trim(); if (!line) continue;
      let x;
      if ((x = /^§\s*([A-Z])\s*\|\s*([a-z0-9]+)\s*(?:\|\s*(.*?))?\s*(?:\|\s*(.*))?$/i.exec(line))) { m[x[1].toUpperCase()] = { t: x[2].toLowerCase(), terme: unq(x[3] || ''), raison: unq(x[4] || '') }; continue; }
      if ((x = /^(\d+)\s*\|\s*(.+?)\s*(?:→|->|=>|⇒)\s*(.+?)\s*(?:\|\s*([a-z])\b)?\s*(?:\|\s*(.*))?$/.exec(line))) { (c[x[1]] || (c[x[1]] = [])).push([unq(x[2]), unq(x[3]), (x[4] || 'o').toLowerCase(), unq(x[5] || '')]); }
    }
    return { c, m };
  };

  /* Mise en forme — une ligne par paragraphe retenu : id | type | terme | raison */
  parse.style = text => {
    const out = [];
    for (const raw of clean(text).split('\n')) {
      const x = /^\[?([A-Za-z0-9_-]+)\]?\s*\|\s*([a-z0-9]+)\s*(?:\|\s*(.*?))?\s*(?:\|\s*(.*))?$/i.exec(raw.trim());
      if (x && !/^(id|identifiant)$/i.test(x[1])) out.push({ id: x[1], type: x[2].toLowerCase(), terme: unq(x[3] || ''), raison: unq(x[4] || '') });
    }
    return out;
  };

  /* ---------------- consignes (courtes, un exemple) ---------------- */
  const STYLE_TYPES = 'definition (notion suivie de sa définition), arret (décision de justice), exemple, retenir (règle essentielle), controverse (débat), bilan (synthèse), drapeau (santé : signes de gravité), reflexe (santé : réflexe clinique), mnemo (moyen mnémotechnique), h1/h2/h3/h4 (titre de plan), li (élément de liste), quote (citation)';
  const LANG_NAMES = { fr: 'français', en: 'anglais', es: 'espagnol', de: 'allemand', it: 'italien', pt: 'portugais' };
  function correctSystem(mode, ctx, withStyle) {
    const level = ctx.level === 'leger' ? 'Seulement les fautes indiscutables (orthographe, accords, conjugaison) ; ignore ponctuation et majuscules.'
      : ctx.level === 'strict' ? 'Aussi la ponctuation, la typographie française (espace avant ; : ? !, guillemets « ») et les majuscules.'
        : 'Orthographe, accords, conjugaison, homophones (a/à, et/est, ce/se…), ponctuation courante.';
    return `Tu es AlixoAI, le correcteur d’Alixo. Tu relis des notes de cours d’un étudiant (droit, économie, commerce, médecine, STAPS)${ctx.lang && ctx.lang !== 'fr' && LANG_NAMES[ctx.lang] ? `, écrites en ${LANG_NAMES[ctx.lang]} : corrige dans cette langue, ne traduis rien` : ''}.
Entrée : des phrases numérotées « n| texte »${mode === 'live' ? ' ; certaines sont en cours de frappe (une phrase inachevée ou sans point n’est pas une faute)' : ''}.
${level}${ctx.rephrase ? ' Au plus une fois par paragraphe, tu peux proposer une phrase plus claire (type r, règle « Reformulation : … »).' : ''}
Ne touche jamais : abréviations (art., Cass., C. civ., al., n°), sigles, noms propres, mots latins ou étrangers, nombres, notes télégraphiques.
Réponds avec une ligne par faute, rien d’autre :
n | extrait fautif → extrait corrigé | type | règle en dix mots
« extrait fautif » est copié exactement du texte, le plus court possible. type : f faute de frappe, o orthographe, g grammaire ou accord, t ponctuation${ctx.rephrase ? ', r reformulation' : ''}.
Aucune faute : réponds OK.${withStyle ? `
Les lignes « § A : 1, 2 » désignent des paragraphes (phrases 1 et 2). Si un paragraphe est CLAIREMENT un type parmi ${STYLE_TYPES}, ajoute une ligne « § A | type | terme (definition seulement) ». Dans le doute, rien.` : ''}
Exemple d’entrée :
1| Le contrat et formé quand les partie sont d’accord.
2| L’arrêt Cass. civ. 1re du 3 mai 2000 est célèbre.
Exemple de réponse :
1 | et formé → est formé | g | Verbe être : on peut dire « était formé »
1 | les partie → les parties | g | Pluriel après « les »`;
  }
  const STYLE_SYSTEM = `Tu es AlixoAI. Tu aides un étudiant à structurer ses notes de cours (droit, économie, médecine, sciences humaines).
Entrée : des paragraphes, chacun précédé de son identifiant entre crochets.
Pour chaque paragraphe qui relève CLAIREMENT, en entier, d’un type parmi ${STYLE_TYPES}, écris une ligne :
identifiant | type | terme défini (definition seulement, sinon vide) | raison en trois mots
Un paragraphe ordinaire n’apparaît pas. Rien à proposer : réponds RIEN.
Exemple d’entrée :
[b12]
La prescription extinctive est l’extinction d’un droit par l’écoulement d’un délai pendant lequel son titulaire ne l’a pas exercé.
[b13]
On verra ensuite quelques illustrations tirées de la jurisprudence récente.
Exemple de réponse :
b12 | definition | La prescription extinctive | notion puis définition`;
  const kindLine = k => k === 'qcm' ? 'Toutes les questions sont des QCM.' : k === 'vf' ? 'Toutes les questions sont des affirmations vrai / faux.' : k === 'courte' ? 'Toutes les questions sont à réponse courte (un mot, un nom, une date, un chiffre, trois mots au plus).' : 'Mélange : surtout des QCM, quelques vrai / faux et réponses courtes.';
  const levelLine = l => l === 'facile' ? 'Niveau facile : les notions principales, formulées comme dans le cours.' : l === 'difficile' ? 'Niveau difficile : détails, exceptions, cas limites ; distracteurs plausibles.' : 'Niveau moyen : comprendre et distinguer les notions.';
  function quizSystem(ctx) {
    return `Tu es AlixoAI, un enseignant qui prépare un quiz de révision à partir des notes de cours d’un étudiant.
Entrée : des extraits du cours numérotés [1], [2]… Écris UNE question par extrait, dans l’ordre, uniquement sur ce que dit l’extrait.
${kindLine(ctx.kind)} ${levelLine(ctx.level)} Français soigné.
Format, exactement, une question = un bloc :
#1 qcm
Q: la question
A: proposition
B: proposition
C: proposition
D: proposition
R: B
E: explication en une phrase, tirée du cours

Vrai / faux : « #2 vf », Q: l’affirmation, R: vrai ou faux, E: … — sans propositions.
Réponse courte : « #3 courte », Q: la question, R: réponse attendue | variante acceptée, E: …
Exemple (extrait : « La prescription extinctive de droit commun est de cinq ans depuis la loi du 17 juin 2008. ») :
#1 qcm
Q: Quelle est la durée de la prescription extinctive de droit commun ?
A: Deux ans
B: Cinq ans
C: Dix ans
D: Trente ans
R: B
E: Depuis la loi du 17 juin 2008, le délai de droit commun est de cinq ans.`;
  }
  const SHEET_SYSTEM = `Tu es AlixoAI, un enseignant qui rédige une fiche de révision à partir des notes de cours d’un étudiant.
Tout vient du document : n’invente aucune notion, aucun chiffre, aucune date. Phrases courtes et complètes. Français soigné.
Format, exactement :
# titre de la fiche
R: résumé en deux phrases
## titre de la première partie (suis le plan du cours, 3 à 6 parties)
- point clé
- point clé
= terme : sa définition exacte (seulement si le cours la donne)
## titre de la partie suivante
- …
## À retenir
- l’essentiel, 3 à 5 phrases
## Pièges
- confusion ou erreur fréquente (0 à 3)`;

  /* ---------------- exécution ---------------- */
  let seq = 0;
  async function engineChat(o) {
    const l = L(); if (!l) return { ok: false, status: 0, error: 'Le moteur d’AlixoAI n’est pas chargé.' };
    if (off) return { ok: false, status: 0, error: 'AlixoAI est désactivée (Paramètres › IA › Réactiver).' };
    const a = l.support(); if (!a.ok) return { ok: false, status: 0, error: a.reason };
    // le chargement du modèle est fait par chat() lui-même : la demande est déjà en file, la barre « AlixoAI se prépare… » peut s'afficher
    return l.chat(Object.assign({ key: l.recommend() }, o));
  }
  async function run(task, payload, opts) {
    opts = opts || {}; payload = payload || {};
    const token = opts.token || ('ai' + (++seq));
    const b = budget();
    if (task === 'ping') {
      const r = await engineChat({ system: 'Réponds « ok ».', user: 'ok', maxTokens: 4, timeoutMs: 60000, token });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }
    if (task === 'correct') return runCorrect(payload, opts, token, b);
    if (task === 'style') return runStyle(payload, opts, token, b);
    if (task === 'quiz') return runQuiz(payload, opts, token, b);
    if (task === 'sheet') return runSheet(payload, opts, token, b);
    throw new Error('AlixoAI : tâche inconnue « ' + task + ' »');
  }
  const fail = r => { const e = new Error(r.error || 'AlixoAI n’a pas répondu'); e.status = r.status || 0; return e; };

  /* correction : items [{ text }] (phrases), ctx { level, rephrase, lang, already }, styleBlocks { A: [indices] } */
  async function runCorrect(p, opts, token, b) {
    const items = p.items || [];
    const lines = items.map((it, i) => `${i + 1}| ${it.text}`);
    const withStyle = !!(p.styleBlocks && Object.keys(p.styleBlocks).length);
    if (withStyle) for (const [tag, idx] of Object.entries(p.styleBlocks)) lines.push(`§ ${tag} : ${idx.map(i => i + 1).join(', ')}`);
    let user = lines.join('\n');
    const ctx = p.ctx || {};
    if (ctx.already && ctx.already.length) user = `Déjà relevé (ne le répète pas) :\n${ctx.already.map(a => `« ${a.avant} » → « ${a.apres} »`).join('\n')}\n\nRelis chaque phrase une seconde fois, plus attentivement.\n\n${user}`;
    const maxTokens = Math.max(96, Math.min(p.mode === 'live' ? 700 : 1600, 60 + Math.round(user.length / 3)));
    const r = await engineChat({ system: correctSystem(p.mode || 'full', ctx, withStyle), user, maxTokens, temperature: 0, timeoutMs: p.mode === 'live' ? 60000 : 120000, background: !!opts.background, token });
    if (!r.ok) throw fail(r);
    return Object.assign(parse.correct(r.raw), { tokIn: r.tokIn, tokOut: r.tokOut, model: r.model });
  }
  /* mise en forme : blocks [{ id, text }] → [{ id, type, terme, raison }] (par lots, progressif) */
  async function runStyle(p, opts, token, b) {
    const blocks = p.blocks || []; const out = [];
    for (let i = 0; i < blocks.length; i += b.style) {
      const lot = blocks.slice(i, i + b.style);
      const user = lot.map(x => `[${x.id}]\n${shortenTo(x.text, 900)}`).join('\n\n');
      const r = await engineChat({ system: STYLE_SYSTEM, user, maxTokens: 40 + lot.length * 30, temperature: 0, timeoutMs: 120000, token });
      if (!r.ok) { if (out.length) break; throw fail(r); }
      const ids = new Set(lot.map(x => String(x.id)));
      for (const it of parse.style(r.raw)) if (ids.has(it.id)) { out.push(it); if (opts.onItem) opts.onItem(it, out.length - 1); }
      if (opts.onProgress) opts.onProgress(Math.min(blocks.length, i + b.style), blocks.length);
    }
    return out;
  }
  /* quiz : { title, text, n, kind, level } → { title, questions, tokIn, tokOut, partial } ; onItem(question, index) dès
     qu'une question est complète. Lots courts (le premier plus court encore), un extrait par question, lots enchaînés
     dans la même conversation. */
  async function runQuiz(p, opts, token, b) {
    const n = Math.max(1, Math.min(30, +p.n || 10));
    const chunks = passages(p.text, n, b.chunk);
    if (!chunks.length) throw new Error('Le document est presque vide.');
    const ctx = { kind: p.kind || 'mix', level: p.level || 'moyen' };
    const system = quizSystem(ctx);
    const messages = [{ role: 'system', content: system }];
    const all = []; let title = '', tokIn = 0, tokOut = 0, model = '', lastErr = '', ci = 0, qn = 0;
    const seen = new Set();
    const normQ = t => String(t || '').toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, ' ').trim();
    while (all.length < n) {
      const k = Math.min(all.length ? b.batch : b.first, n - all.length);
      const lot = []; for (let i = 0; i < k; i++) lot.push(chunks[(ci++) % chunks.length]);
      const types = ctx.kind === 'mix' ? lot.map((_, i) => ((qn + i) % 4 === 1 ? 'vf' : (qn + i) % 4 === 3 ? 'courte' : 'qcm')) : lot.map(() => ctx.kind);
      const user = (all.length ? `Extraits suivants. Questions ${qn + 1} à ${qn + k}, différentes des précédentes.\n` : `Titre du cours : ${p.title || 'Sans titre'}\n`) +
        lot.map((c, i) => `[${i + 1}]${ctx.kind === 'mix' ? ` (${types[i]})` : ''}\n${c}`).join('\n\n') + `\n\nÉcris ${k} question${k > 1 ? 's' : ''}, numérotées #${qn + 1}${k > 1 ? ` à #${qn + k}` : ''}.`;
      const msgs = messages.concat([{ role: 'user', content: user }]);
      let delivered = 0;
      const deliver = (text, complete) => {
        const qs = parse.quiz(text, complete);
        if (qs.title && !title) title = qs.title;
        for (let i = delivered; i < qs.length; i++) {
          const q = qs[i]; const key = normQ(q.question);
          delivered = i + 1;
          if (!key || seen.has(key) || all.length >= n) continue;
          seen.add(key); all.push(q);
          if (opts.onItem) { try { opts.onItem(q, all.length - 1); } catch { /* interface */ } }
          if (opts.onProgress) { try { opts.onProgress(all.length, n); } catch { /* */ } }
        }
      };
      const r = await engineChat({ messages: msgs, maxTokens: 40 + k * (ctx.kind === 'qcm' || ctx.kind === 'mix' ? 150 : 90), temperature: 0.3, timeoutMs: 180000, token, quiet: true, onToken: t => deliver(t, false) });
      if (!r.ok) { lastErr = r.error; if (r.status === 499) throw fail(r); if (all.length) break; throw fail(r); }
      const before = all.length;
      deliver(r.raw, true);
      tokIn += r.tokIn || 0; tokOut += r.tokOut || 0; model = r.model || model;
      if (all.length === before) { if (all.length) break; throw new Error('AlixoAI n’a pas renvoyé de question lisible — réessayez.'); }
      qn += k;
      // conversation suivie : la consigne et les lots précédents restent en mémoire du moteur (pas de relecture)
      if (r.finish === 'stop') messages.push({ role: 'user', content: user }, { role: 'assistant', content: r.raw });
      else { messages.length = 1; }
      /* 1.41 : mémoire de conversation plafonnée (4 096 jetons) : au-delà d'environ 7 000 caractères, on repart de la seule
         consigne — sans quoi les longs quiz dépassaient la mémoire et la carte graphique relisait tout à chaque lot */
      if (messages.reduce((n, m) => n + m.content.length, 0) > 7000) messages.length = 1;
      if (opts.cancelled && opts.cancelled()) break;
    }
    if (!all.length) throw new Error(lastErr || 'AlixoAI n’a pas renvoyé de question — réessayez.');
    return { title: title || p.title || 'Quiz', questions: all, tokIn, tokOut, model, partial: all.length < n ? lastErr : '' };
  }
  /* fiche : { title, text } → { title, resume, parties, retenir, pieges } ; onItem(partie, index) au fil de l'eau */
  async function runSheet(p, opts, token, b) {
    const text = shortenTo(p.text, b.sheet);
    const user = `Titre du cours : ${p.title || 'Sans titre'}\n\n${text}`;
    let delivered = 0;
    const r = await engineChat({ system: SHEET_SYSTEM, user, maxTokens: b.sheetTokens, temperature: 0.2, timeoutMs: 240000, token, quiet: true, onToken: t => {
      if (!opts.onItem) return;
      const f = parse.sheet(t, false);
      const done = f.parties.filter(x => x !== f.open);
      for (let i = delivered; i < done.length; i++) { delivered = i + 1; try { opts.onItem(done[i], i); } catch { /* */ } }
    } });
    if (!r.ok) throw fail(r);
    const f = parse.sheet(r.raw, true);
    if (!f.parties.length && !f.retenir.length) throw new Error('AlixoAI n’a pas renvoyé de fiche lisible — réessayez.');
    for (let i = delivered; i < f.parties.length; i++) if (opts.onItem) { try { opts.onItem(f.parties[i], i); } catch { /* */ } }
    return { title: f.title || ('Fiche de révision — ' + (p.title || '')), resume: f.resume, parties: f.parties, retenir: f.retenir, pieges: f.pieges, tokIn: r.tokIn, tokOut: r.tokOut, model: r.model };
  }
  function cancel(token) { const l = L(); if (l && l.cancel) l.cancel(token); }
  const newToken = () => 'ai' + (++seq);

  return { available, enabled, setEnabled, ready, state, warm, tier, budget, run, cancel, newToken, passages, parse, BUDGETS };
})();
