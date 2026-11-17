/* ============================================================
   Alixo — Coco modifie le document (1.52, Alixo+) : js/cocotools.js
   Coco ne se contente plus de répondre : il corrige les fautes, met en forme et modifie le document ouvert (séance,
   présentation, tableur, planche, quiz) à la demande de l'étudiant, dans le panneau Alixo AI (js/coco.js).
   Trois couches :
   - routage : AlixoAI.run('route') décide « REPONDRE » ou « AGIR | corriger | embellir | modifier » (une ligne, sans le
     document) — seulement quand la phrase ressemble à une demande d'action (maybeAction) ;
   - intentions déterministes : « corriger » réutilise le correcteur (AlixoCorr.analyzeBlocks → edit.applyFixes),
     « embellir » la mise en forme (tâche « style » → edit.applyStyles) ;
   - édition libre : « modifier » envoie le plan du document (« id | type | texte », coupé en lots) et reçoit des
     COMMANDES, une par ligne (REMPLACE, TYPE, AJOUTE_APRES, SUPPRIME, TITRE…), exécutées par un registre fermé.
   Chaque type de document expose une façade uniforme `edit` (AlixoApp.edit, AlixoSlides.edit, AlixoSheets.edit,
   AlixoBoard.edit, AlixoQuiz.edit : canEdit, snapshot, restore, begin, commit, items, et ses opérations) qui écrit par
   les chemins existants (touch / renderBlocks, pushHist / commit / renderAll) → Ctrl+Z natif.
   Sécurité : registre fermé ; jamais de HTML du modèle (esc → **gras** via AlixoCoco.md.inline → AlixoSanitize.inline) ;
   un lot est validé en entier avant la première écriture ; identifiants courts (b3, d2.e1, A1, n3, q4) résolus par
   table, inconnu = ignoré et compté ; suppressions soumises à confirmation (le lot attend « Appliquer ») ; instantanés
   avant / après pour « Annuler les modifications » ; arrêt propre si le document a changé entre deux lots ; refus en
   lecture seule. Chargé APRÈS app.js, slides.js, sheets.js, board.js, quiz.js et AVANT coco.js.
   ============================================================ */
'use strict';

window.AlixoCocoTools = (() => {
  const S = v => String(v ?? '').trim();
  const MAX_TEXT = 2000, MAX_CMDS = 60, CUT = 280;
  const KINDS = ['doc', 'slides', 'sheet', 'board', 'quiz'];
  const KIND_WORDS = { doc: 'la séance', slides: 'la présentation', sheet: 'le tableur', board: 'la planche', quiz: 'le quiz' };
  const registry = {}; for (const k of KINDS) registry[k] = new Map();
  const intents = new Map();
  const ACTION_RE = /\b(corrige|corriger|mets?|ajoute|insère|insere|supprime|enlève|enleve|retire|rends?|transforme|réécris|reecris|résume|resume|traduis|renomme|change|remplace|encadr|titre|liste|déplace|deplace|écris|ecris|complète|complete|crée|cree|propose|reformule|améliore|ameliore|corrigé|vide|efface|calcul|trie|classe|numérote|numerote|convertis|simplifie|développe|developpe|raccourcis|allonge|souligne|passe|fais|fait)\w*/i;

  /* ---------------- accès au document et à sa façade ---------------- */
  const kindOf = d => (d && d.kind === 'slides' ? 'slides' : d && d.kind === 'sheet' ? 'sheet' : d && d.kind === 'board' ? 'board' : d && d.kind === 'quiz' ? 'quiz' : 'doc');
  function facadeOf(d) {
    const k = kindOf(d);
    const m = k === 'slides' ? window.AlixoSlides : k === 'sheet' ? window.AlixoSheets : k === 'board' ? window.AlixoBoard : k === 'quiz' ? window.AlixoQuiz : window.AlixoApp;
    return (m && m.edit) || null;
  }
  const current = () => (typeof doc === 'function' ? doc() : null);
  /* texte du modèle → HTML sûr : esc() puis **gras** (AlixoCoco.md.inline), puis AlixoSanitize.inline (ceinture et bretelles) */
  const safe = t => { const h = window.AlixoCoco ? AlixoCoco.md.inline(String(t ?? '')) : esc(String(t ?? '')); return window.AlixoSanitize ? AlixoSanitize.inline(h) : h; };
  /* texte brut (planche, quiz, tableur, notes) : sans balise ni marqueur de gras */
  const plain = t => String(t ?? '').replace(/\*\*/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  /* 1.52 : case du tableur — rien n'est retiré (« =SI(A1<B1;…) » est une formule légitime) : la valeur est stockée telle
     quelle et toujours affichée par textContent (js/sheets.js) ; seuls les marqueurs de gras du modèle disparaissent */
  const cellText = t => { t = String(t ?? '').replace(/\s+/g, ' ').trim(); return t[0] === '=' ? t : t.replace(/\*\*/g, ''); };
  const cut = (t, n) => { t = String(t ?? '').replace(/\s+/g, ' ').trim(); return t.length > (n || CUT) ? t.slice(0, (n || CUT) - 1).trimEnd() + '…' : t; };
  const q = t => `« ${cut(t, 70)} »`;

  /* ---------------- registre des commandes ----------------
     register(kind, { name, args (nombre minimal d'arguments), describe (ligne de la consigne), phase (0 modifier,
     1 ajouter, 2 supprimer), destructive, validate(args, ctx) → message d'erreur | null, run(args, ctx) → bool }).
     ctx = { tx, edit, ids (Map court → { id, long, ro, text }), real(court) → identifiant réel } */
  function register(kind, def) {
    if (!registry[kind] || !def || !def.name || typeof def.run !== 'function') return;
    registry[kind].set(def.name, Object.assign({ args: 0, phase: 0, destructive: false, validate: () => null, describe: def.name }, def));
  }
  function registerIntent(name, def) { if (name && def && typeof def.run === 'function') intents.set(name, Object.assign({ kinds: KINDS.slice(), describe: '' }, def, { name })); }
  const SYNONYMS = { REPLACE: 'REMPLACE', REMPLACER: 'REMPLACE', INSERT_AFTER: 'AJOUTE_APRES', AJOUTER_APRES: 'AJOUTE_APRES', INSERT_BEFORE: 'AJOUTE_AVANT', AJOUTER_AVANT: 'AJOUTE_AVANT', DELETE: 'SUPPRIME', SUPPRIMER: 'SUPPRIME', REMOVE: 'SUPPRIME', STYLE: 'TYPE', TITLE: 'TITRE', NOTE: 'NOTES', DELETE_SLIDE: 'SUPPRIME_DIAPO', ADD_SLIDE: 'AJOUTE_DIAPO', CELL: 'CASE', CLEAR: 'VIDE', ADD_NOTE: 'AJOUTE_NOTE', ADD_TEXT: 'AJOUTE_TEXTE', ADD_MCQ: 'AJOUTE_QCM', ADD_TF: 'AJOUTE_VF' };
  const normWord = w => { const u = String(w || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-/g, '_'); return SYNONYMS[u] || u; };
  function describe(kind, edit) {
    const lines = ['Réponds UNIQUEMENT par des commandes, une par ligne :'].concat([...registry[kind].values()].map(d => d.describe));
    if (kind === 'doc' && edit && edit.types) lines.unshift('Types : ' + edit.types().join(', '));
    if (kind === 'slides') lines.unshift('Dispositions : contenu, puces, section');
    return lines.join('\n');
  }
  const EXAMPLES = {
    doc: `Exemple de demande : « mets la définition en encadré et ajoute un titre au-dessus »
Exemple d’entrée :
b3 | p | La prescription extinctive est l’extinction d’un droit par l’écoulement d’un délai.
b4 | p | Elle est de cinq ans en droit commun.
Exemple de réponse :
AJOUTE_AVANT b3 | h2 | La prescription extinctive
TYPE b3 | callout:definition`,
    slides: `Exemple de demande : « ajoute une diapositive de conclusion »
Exemple d’entrée :
d2 | Diapositive 2
d2.e1 | title | Le délai de droit commun
d2.e2 | text | Cinq ans depuis la loi du 17 juin 2008.
Exemple de réponse :
AJOUTE_DIAPO | puces | Conclusion | Délai de droit commun : cinq ans / Point de départ : connaissance des faits`,
    sheet: `Exemple de demande : « calcule le total en B5 »
Exemple d’entrée :
A1 | Produit
B2 | 12
B3 | 30
Exemple de réponse :
CASE A5 | Total
CASE B5 | =SOMME(B2:B4)`,
    board: `Exemple de demande : « ajoute une note sur la prescription »
Exemple d’entrée :
n1 | note | Délai de droit commun : 5 ans
Exemple de réponse :
AJOUTE_NOTE | **Prescription** : extinction d’un droit par l’écoulement d’un délai`,
    quiz: `Exemple de demande : « ajoute une question sur le délai »
Exemple d’entrée :
q1 | qcm | Quand la vente est-elle parfaite ? | Dès la livraison ; Dès l’accord sur la chose et le prix ; Au paiement ; Jamais
Exemple de réponse :
AJOUTE_QCM | Quel est le délai de prescription de droit commun ? | Deux ans | Cinq ans | Dix ans | Trente ans | B`
  };

  /* ---------------- plan du document (outline) ----------------
     → { lines: [{ text, chars }], ids: Map<court, { id, long, ro, text, label }> } ; identifiants courts stables sur
     tout le document (numérotés une fois), lots découpés ensuite au budget (BUDGETS.agent). */
  function outline(edit) {
    const ids = new Map(); const lines = [];
    const push = (short, entry, text) => { ids.set(short, entry); lines.push({ text, short }); };
    const items = edit.items() || [];
    if (edit.kind === 'doc') {
      items.forEach((it, i) => {
        const short = 'b' + (i + 1); const long = it.text.length > CUT;
        push(short, { id: it.id, long, ro: !!it.ro, text: it.text, label: it.type }, `${short} | ${it.type}${long ? ' (long)' : ''} | ${cut(it.text)}`);
      });
    } else if (edit.kind === 'slides') {
      items.forEach((s, i) => {
        const ds = 'd' + (i + 1);
        const tt = s.els.find(e => e.t === 'title' && S(e.text));   // 1.52 : titre montré dans la confirmation de suppression
        push(ds, { id: s.id, text: `Diapositive ${i + 1}`, label: 'diapositive', slide: true, num: i + 1, title: tt ? S(tt.text) : '' }, `${ds} | Diapositive ${i + 1}`);
        s.els.forEach((e, k) => { const short = `${ds}.e${k + 1}`; const long = e.text.length > CUT; push(short, { id: `${s.id}.${e.id}`, sid: s.id, eid: e.id, long, text: e.text, label: e.t }, `${short} | ${e.t}${long ? ' (long)' : ''} | ${cut(e.text)}`); });
        if (s.notes) lines.push({ text: `${ds}.notes | notes | ${cut(s.notes)}` });
      });
    } else if (edit.kind === 'sheet') {
      items.forEach(it => push(it.id, { id: it.id, text: it.text, label: 'case' }, `${it.id} | ${cut(it.text, 120)}`));
    } else if (edit.kind === 'board') {
      items.forEach((it, i) => { const short = 'n' + (i + 1); push(short, { id: it.id, text: it.text, label: it.type, long: it.text.length > CUT }, `${short} | ${it.type} | ${cut(it.text)}`); });
    } else if (edit.kind === 'quiz') {
      items.forEach((it, i) => { const short = 'q' + (i + 1); push(short, { id: it.id, text: it.text, label: it.type }, `${short} | ${it.type} | ${cut(it.text, 200)}${it.opts && it.opts.length ? ' | ' + it.opts.map(o => cut(o, 60)).join(' ; ') : ''}`); });
    }
    return { lines, ids };
  }
  function lots(lines, maxChars) {
    const out = []; let cur = [], n = 0;
    for (const l of lines) { const c = l.text.length + 1; if (cur.length && n + c > maxChars) { out.push(cur); cur = []; n = 0; } cur.push(l); n += c; }
    if (cur.length) out.push(cur);
    return out;
  }

  /* ---------------- analyse et validation des commandes ----------------
     Une ligne = « MOT arg | arg | … ». Le mot est normalisé (majuscules, sans accent, synonymes anglais). Retour :
     { valid: [{ name, args, line, def }], rejected: [{ line, why }] }. Tout est validé avant la première écriture. */
  function parseCommands(rawLines, kind, ctx) {
    const valid = [], rejected = [];
    const list = Array.isArray(rawLines) ? rawLines : (window.AlixoAI ? AlixoAI.parse.edit(rawLines) : String(rawLines || '').split('\n'));
    for (const raw of list.slice(0, MAX_CMDS)) {
      const line = S(raw); if (!line || /^rien\.?$/i.test(line)) continue;
      const m = /^([A-Za-zÀ-ÿ_-]+)\s*(.*)$/u.exec(line); if (!m) { rejected.push({ line, why: 'ligne illisible' }); continue; }
      const name = normWord(m[1]); const def = registry[kind].get(name);
      if (!def) { rejected.push({ line, why: 'commande inconnue' }); continue; }
      let args = m[2].split('|').map(x => x.trim());
      if (args.length && args[0] === '' && m[2].trim().startsWith('|')) args.shift();
      if (args.length === 1 && args[0] === '') args = [];
      if (def.join && args.length > def.args) args = args.slice(0, def.args - 1).concat([args.slice(def.args - 1).join(' | ')]);
      if (args.length < def.args) { rejected.push({ line, why: 'arguments manquants' }); continue; }
      if (args.some(a => a.length > MAX_TEXT)) { rejected.push({ line, why: 'texte trop long' }); continue; }
      const why = def.validate(args, ctx);
      if (why) { rejected.push({ line, why }); continue; }
      valid.push({ name, args, line, def });
    }
    if (list.length > MAX_CMDS) rejected.push({ line: '…', why: `plus de ${MAX_CMDS} commandes` });
    return { valid, rejected };
  }
  const idOk = (ctx, short, extra) => ctx.ids.has(short) || (extra && extra.includes(short)) ? null : `identifiant inconnu « ${cut(short, 20)} »`;
  const entry = (ctx, short) => ctx.ids.get(short) || null;

  /* ---------------- exécution d'un lot (transactionnel) ----------------
     ordre : phase 0 (remplacer, retyper, cases, notes, titre) → 1 (ajouter) → 2 (supprimer) ; un seul edit.commit(). */
  function execute(tx, commands, ids) {
    const ctx = { tx, edit: tx.edit, ids, real: short => (ids.get(short) || {}).id };
    const ordered = commands.slice().sort((a, b) => (a.def.phase - b.def.phase));
    let n = 0;
    tx.edit.begin();
    try {
      for (const c of ordered) {
        let ok = false;
        try { ok = !!c.def.run(c.args, ctx); } catch (err) { console.error(err); ok = false; }
        if (ok) n++; else tx.rejected.push({ line: c.line, why: 'non appliquée' });
      }
    } finally {
      if (n) { tx.edit.commit(); tx.changes += n; }
      const d = current(); tx.lastSeen = d ? (d.updatedAt || 0) : tx.lastSeen;
    }
    return n;
  }

  /* ---------------- transaction ---------------- */
  function begin(session, edit) {
    const d = session.d;
    return { session, edit, kind: edit.kind, docId: d.id, before: edit.snapshot(), startedAt: Date.now(), lastSeen: d.updatedAt || 0, changes: 0,
      counts: { replaced: 0, typed: 0, inserted: 0, removed: 0, fixes: 0, blocks: 0, styled: 0, titled: 0, cells: 0, slides: 0, notes: 0, questions: 0 },
      details: [], rejected: [], lots: 0, lotsTotal: 0, stopped: false, changedByUser: false, pending: null };
  }
  function finish(tx) {
    const edit = tx.edit;
    return { intent: tx.intent, kind: tx.kind, docId: tx.docId, before: tx.before, after: edit.snapshot(), counts: tx.counts, details: tx.details, rejected: tx.rejected.length, changes: tx.changes,
      lots: tx.lots, lotsTotal: tx.lotsTotal, stopped: tx.stopped, changedByUser: tx.changedByUser, pending: tx.pending };
  }
  /* le document est-il toujours celui du départ, inchangé par l'étudiant depuis notre dernier lot, et modifiable ? */
  function alive(tx) {
    const d = current();
    return !!d && d.id === tx.docId && (d.updatedAt || 0) === tx.lastSeen && tx.edit.canEdit();
  }
  /* refus « doux » (lecture seule, autre document…) : Coco l'explique en texte, sans bouton « Réessayer » */
  const softErr = msg => { const e = new Error(msg); e.soft = true; return e; };
  const cancelled = ui => !!(ui && ui.cancelled && ui.cancelled());
  const progress = (ui, p) => { if (ui && ui.onProgress) { try { ui.onProgress(p); } catch { /* interface */ } } };

  /* ---------------- préfiltre et routage ---------------- */
  const maybeAction = text => ACTION_RE.test(String(text || ''));
  async function route(session, text, { token } = {}) {
    const kind = kindOf(session.d);
    const r = await AlixoAI.run('route', { question: text, kind: KIND_WORDS[kind], intents: [...intents.keys()] }, { token });
    const action = r && r.action && intents.has(r.action) ? r.action : (r && r.action === 'repondre' ? 'repondre' : 'modifier');
    return { action, raw: r && r.raw };
  }

  /* ---------------- exécution d'une intention ---------------- */
  async function run(session, intent, text, ui) {
    const edit = facadeOf(session.d);
    if (!edit) throw softErr('Je ne sais pas encore modifier ce type de document.');
    const d = current();
    if (!d || d.id !== session.d.id) throw softErr('Ouvre d’abord ce document pour que je puisse le modifier.');
    if (!edit.canEdit()) throw softErr('Ce document est en lecture seule : je ne peux pas le modifier.');
    let def = intents.get(intent) || intents.get('modifier');
    if (!def.kinds.includes(edit.kind)) def = intents.get('modifier');
    const tx = begin(session, edit); tx.intent = def.name;
    await def.run(tx, text, ui || {});
    return finish(tx);
  }
  /* applique un lot mis en attente (suppressions) après « Appliquer » ; le « avant » reste celui du départ */
  function applyPlan(session, msg) {
    const edit = facadeOf(session.d); const plan = msg && msg.plan; const e = msg && msg.edit;
    if (!edit || !plan || !e) throw new Error('Rien à appliquer.');
    const d = current();
    if (!d || d.id !== e.docId) throw new Error('Ouvre d’abord ce document pour appliquer les modifications.');
    if (!edit.canEdit()) throw new Error('Ce document est en lecture seule : je ne peux pas le modifier.');
    if (edit.snapshot() !== e.after) throw new Error('Le document a changé depuis : je préfère ne rien supprimer. Redemande-moi si tu veux.');
    const tx = begin(session, edit); tx.intent = 'modifier'; tx.before = e.before;
    const ids = new Map(plan.ids);
    const commands = plan.commands.map(c => ({ name: c.name, args: c.args, line: c.line, def: registry[edit.kind].get(c.name) })).filter(c => c.def);
    execute(tx, commands, ids);
    const r = finish(tx);
    r.counts = mergeCounts(msg.result ? msg.result.counts : null, r.counts);
    r.details = (msg.result ? msg.result.details : []).concat(r.details);
    r.rejected += msg.result ? msg.result.rejected : 0;
    return r;
  }
  function mergeCounts(a, b) { const out = Object.assign({}, b); for (const k of Object.keys(a || {})) out[k] = (out[k] || 0) + (a[k] || 0); return out; }

  /* ---------------- annulation ---------------- */
  async function undo(session, msg) {
    const e = msg && msg.edit; if (!e) return false;
    const edit = facadeOf(session.d); const d = current();
    if (!edit || !d || d.id !== e.docId) { toast('Ouvrez d’abord ce document pour annuler les modifications de Coco'); return false; }
    if (!edit.canEdit()) { toast('Ce document est en lecture seule'); return false; }
    if (edit.snapshot() === e.before) { toast('Ces modifications sont déjà annulées'); return false; }
    if (edit.snapshot() !== e.after) {
      const ok = typeof confirmDialog === 'function' ? await confirmDialog({ title: 'Le document a changé depuis', text: 'Annuler quand même les modifications de Coco ? Ce que vous avez écrit depuis sera aussi retiré.', ok: 'Annuler les modifications de Coco', cancel: 'Garder le document tel quel' }) : false;
      if (!ok) return false;
    }
    return edit.restore(e.before);
  }

  /* ---------------- résumé ---------------- */
  const n = (k, one, many) => `${k.toLocaleString('fr-FR')} ${k > 1 ? many : one}`;
  function summary(r) {
    const c = r.counts || {}; const parts = [];
    if (r.intent === 'corriger') {
      if (!c.fixes) return r.stopped ? 'Interrompu : je n’ai rien corrigé.' : 'Je n’ai trouvé aucune faute.';
      return `${n(c.fixes, 'faute corrigée', 'fautes corrigées')} dans ${n(c.blocks, 'paragraphe', 'paragraphes')}.`;
    }
    if (r.intent === 'embellir') {
      if (!c.styled) return r.stopped ? 'Interrompu : je n’ai rien changé.' : 'Rien à changer : la mise en forme me semble déjà adaptée.';
      if (c.callouts) parts.push(n(c.callouts, 'paragraphe passé en encadré', 'paragraphes passés en encadré'));
      if (c.titles) parts.push(n(c.titles, 'titre ajouté', 'titres ajoutés'));
      const other = c.styled - (c.callouts || 0) - (c.titles || 0); if (other > 0) parts.push(n(other, 'autre mise en forme', 'autres mises en forme'));
      return parts.join(', ') + '.';
    }
    if (c.replaced) parts.push(n(c.replaced, 'passage réécrit', 'passages réécrits'));
    if (c.typed) parts.push(n(c.typed, 'mise en forme', 'mises en forme'));
    if (c.inserted) parts.push(n(c.inserted, 'ajout', 'ajouts'));
    if (c.slides) parts.push(n(c.slides, 'diapositive ajoutée', 'diapositives ajoutées'));
    if (c.cells) parts.push(n(c.cells, 'case modifiée', 'cases modifiées'));
    if (c.notes) parts.push(n(c.notes, 'note', 'notes'));
    if (c.questions) parts.push(n(c.questions, 'question ajoutée', 'questions ajoutées'));
    if (c.removed) parts.push(n(c.removed, 'suppression', 'suppressions'));
    if (c.titled) parts.push('titre renommé');
    if (c.fixes) parts.push(n(c.fixes, 'faute corrigée', 'fautes corrigées'));
    let out = parts.length ? parts.join(', ') + '.' : (r.stopped ? 'Interrompu : je n’ai rien modifié.' : 'Je n’ai rien modifié.');
    if (r.rejected) out += ` (${n(r.rejected, 'consigne ignorée', 'consignes ignorées')})`;
    return out;
  }
  /* texte de la demande de confirmation d'un lot qui supprime — 1.52 : jamais d'identifiant technique (b10, n3, q2) : le
     passage lui-même entre guillemets ; une diapositive par son numéro et son titre, une plage du tableur par ses cases */
  function pendingText(r) {
    const p = r.pending; const dels = p.commands.filter(c => c.destructive); const others = p.commands.length - dels.length; const k = dels.length;
    const quotes = list => list.slice(0, 3).map(c => q(c.text || '…')).join(', ') + (list.length > 3 ? ', …' : '');
    const slide = c => `${c.num || ''}${c.title ? ` (${q(c.title)})` : ''}`.trim();
    let what, pron;
    if (p.kind === 'slides') { what = k === 1 ? `la diapositive ${slide(dels[0])}` : `${k} diapositives : ${dels.slice(0, 3).map(slide).join(', ')}${k > 3 ? ', …' : ''}`; pron = k === 1 ? 'la' : 'les'; }
    else if (p.kind === 'sheet') {
      const refs = dels.slice(0, 4).map(c => String(c.args[0] || '').toUpperCase()).join(', ') + (k > 4 ? ', …' : '');
      const first = String(dels[0].args[0] || '');
      what = k === 1 ? `${/:/.test(first) ? 'la plage' : 'la case'} ${refs}` : `${k} plages : ${refs}`; pron = k === 1 ? 'la' : 'les';
      return `Je propose de vider ${what}.${others ? ` J’ai aussi préparé ${n(others, 'autre modification', 'autres modifications')}, appliquée${others > 1 ? 's' : ''} en même temps.` : ''} Je ${pron} vide ?`;
    }
    else if (p.kind === 'board') { what = k === 1 ? `cet élément : ${quotes(dels)}` : `${k} éléments : ${quotes(dels)}`; pron = k === 1 ? 'le' : 'les'; }
    else if (p.kind === 'quiz') { what = k === 1 ? `cette question : ${quotes(dels)}` : `${k} questions : ${quotes(dels)}`; pron = k === 1 ? 'la' : 'les'; }
    else { what = k === 1 ? `ce paragraphe : ${quotes(dels)}` : `${k} paragraphes : ${quotes(dels)}`; pron = k === 1 ? 'le' : 'les'; }
    return `Je propose de supprimer ${what}.${others ? ` J’ai aussi préparé ${n(others, 'autre modification', 'autres modifications')}, appliquée${others > 1 ? 's' : ''} en même temps.` : ''} Je ${pron} supprime ?`;
  }

  /* ============================================================
     Registre : séance (AlixoApp.edit)
     ============================================================ */
  const typeOk = (ctx, t) => (ctx.edit.types && ctx.edit.types().includes(t) ? null : `type inconnu « ${cut(t, 30)} »`);
  const typeLabel = t => { const m = /^callout:(\w+)$/.exec(t); if (m) return (typeof CALLOUTS === 'object' && CALLOUTS[m[1]] ? 'Encadré ' + CALLOUTS[m[1]].name : 'Encadré'); return { p: 'Paragraphe', h1: 'Titre de partie', h2: 'Titre de section', h3: 'Sous-titre', h4: 'Paragraphe de plan', li: 'Élément de liste', quote: 'Citation' }[t] || t; };
  register('doc', { name: 'REMPLACE', args: 2, join: true, describe: 'REMPLACE id | nouveau texte',
    validate: (a, ctx) => idOk(ctx, a[0]) || (entry(ctx, a[0]).ro ? 'bloc en lecture seule' : entry(ctx, a[0]).long ? 'paragraphe long : non réécrit' : !S(a[1]) ? 'texte vide' : null),
    run(a, ctx) { const e = entry(ctx, a[0]); if (!ctx.edit.replaceText(e.id, safe(a[1]))) return false; ctx.tx.counts.replaced++; ctx.tx.details.push({ id: a[0], label: 'Réécrit', avant: e.text, apres: plain(a[1]) }); return true; } });
  register('doc', { name: 'TYPE', args: 2, describe: 'TYPE id | type',
    validate: (a, ctx) => idOk(ctx, a[0]) || (entry(ctx, a[0]).ro ? 'bloc en lecture seule' : typeOk(ctx, a[1])),
    run(a, ctx) { const e = entry(ctx, a[0]); if (!ctx.edit.setType(e.id, a[1])) return false; ctx.tx.counts.typed++; ctx.tx.details.push({ id: a[0], label: typeLabel(a[1]), avant: e.text, apres: '' }); return true; } });
  register('doc', { name: 'AJOUTE_APRES', args: 3, join: true, phase: 1, describe: 'AJOUTE_APRES id | type | texte',
    validate: (a, ctx) => idOk(ctx, a[0], ['debut', 'fin']) || typeOk(ctx, a[1]) || (!S(a[2]) ? 'texte vide' : null),
    run(a, ctx) { const id = ctx.ids.has(a[0]) ? ctx.real(a[0]) : a[0]; if (!ctx.edit.insertAfter(id, a[1], safe(a[2]))) return false; ctx.tx.counts.inserted++; ctx.tx.details.push({ id: a[0], label: 'Ajouté (' + typeLabel(a[1]) + ')', avant: '', apres: plain(a[2]) }); return true; } });
  register('doc', { name: 'AJOUTE_AVANT', args: 3, join: true, phase: 1, describe: 'AJOUTE_AVANT id | type | texte',
    validate: (a, ctx) => idOk(ctx, a[0]) || typeOk(ctx, a[1]) || (!S(a[2]) ? 'texte vide' : null),
    run(a, ctx) { if (!ctx.edit.insertBefore(ctx.real(a[0]), a[1], safe(a[2]))) return false; ctx.tx.counts.inserted++; ctx.tx.details.push({ id: a[0], label: 'Ajouté (' + typeLabel(a[1]) + ')', avant: '', apres: plain(a[2]) }); return true; } });
  register('doc', { name: 'SUPPRIME', args: 1, phase: 2, destructive: true, describe: 'SUPPRIME id',
    validate: (a, ctx) => idOk(ctx, a[0]) || (entry(ctx, a[0]).ro ? 'bloc en lecture seule' : null),   // 1.52 : un objet (tableau, image…) n'est jamais supprimé
    run(a, ctx) { const e = entry(ctx, a[0]); if (!ctx.edit.remove(e.id)) return false; ctx.tx.counts.removed++; ctx.tx.details.push({ id: a[0], label: 'Supprimé', avant: e.text, apres: '' }); return true; } });
  register('doc', { name: 'TITRE', args: 1, join: true, describe: 'TITRE | nouveau titre',
    validate: a => (!S(a[0]) ? 'titre vide' : null),
    run(a, ctx) { const before = ctx.edit.title ? ctx.edit.title() : ''; if (!setTitle(ctx.edit, plain(a[0]))) return false; ctx.tx.counts.titled++; ctx.tx.details.push({ id: 'titre', label: 'Titre', avant: before, apres: plain(a[0]) }); return true; } });
  /* titre du document : la séance passe par sa façade (touch) ; les autres documents écrivent directement (save, fil d'Ariane) */
  function setTitle(edit, t) {
    if (edit.setTitle) return edit.setTitle(t);
    const d = current(); if (!d) return false;
    d.titre = String(t || '').slice(0, 120); d.updatedAt = Date.now(); save();
    if (window.AlixoApp) { AlixoApp.renderCrumbs(); AlixoApp.renderTabs(); }
    return true;
  }

  /* ============================================================
     Registre : présentation (AlixoSlides.edit)
     ============================================================ */
  register('slides', { name: 'REMPLACE', args: 2, join: true, describe: 'REMPLACE d2.e1 | nouveau texte (plusieurs lignes séparées par « / »)',
    validate: (a, ctx) => idOk(ctx, a[0]) || (entry(ctx, a[0]).slide ? 'désigne un élément (d2.e1), pas la diapositive' : entry(ctx, a[0]).long ? 'texte long : non réécrit' : !S(a[1]) ? 'texte vide' : null),
    run(a, ctx) { const e = entry(ctx, a[0]); if (!ctx.edit.setElText(e.sid, e.eid, safe(a[1]), a[1].split(/\s*\/\s*/).map(safe))) return false; ctx.tx.counts.replaced++; ctx.tx.details.push({ id: a[0], label: 'Réécrit', avant: e.text, apres: plain(a[1]) }); return true; } });
  register('slides', { name: 'AJOUTE_DIAPO', args: 2, phase: 1, describe: 'AJOUTE_DIAPO | contenu ou puces ou section | Titre | ligne / ligne',
    validate: a => (!S(a[1]) ? 'titre vide' : null),
    run(a, ctx) { const lines = a.slice(2).join(' / ').split(/\s*\/\s*/).map(x => safe(x)).filter(Boolean); const id = ctx.edit.addSlide(a[0], { title: safe(a[1]), lines }); if (!id) return false; ctx.tx.counts.slides++; ctx.tx.details.push({ id: 'diapo', label: 'Diapositive ajoutée', avant: '', apres: plain(a[1]) }); return true; } });
  register('slides', { name: 'NOTES', args: 2, join: true, describe: 'NOTES d2 | notes de l’orateur',
    validate: (a, ctx) => idOk(ctx, a[0]) || (!entry(ctx, a[0]).slide ? 'désigne une diapositive (d2)' : null),
    run(a, ctx) { const e = entry(ctx, a[0]); if (!ctx.edit.setNotes(e.id, plain(a[1]))) return false; ctx.tx.counts.notes++; ctx.tx.details.push({ id: a[0], label: e.num ? `Notes de la diapositive ${e.num}` : 'Notes', avant: '', apres: plain(a[1]) }); return true; } });
  register('slides', { name: 'SUPPRIME_DIAPO', args: 1, phase: 2, destructive: true, describe: 'SUPPRIME_DIAPO d2',
    validate: (a, ctx) => idOk(ctx, a[0]) || (!entry(ctx, a[0]).slide ? 'désigne une diapositive (d2)' : null),
    run(a, ctx) { const e = entry(ctx, a[0]); if (!ctx.edit.removeSlide(e.id)) return false; ctx.tx.counts.removed++; ctx.tx.details.push({ id: a[0], label: 'Diapositive supprimée', avant: e.text, apres: '' }); return true; } });
  register('slides', { name: 'TITRE', args: 1, join: true, describe: 'TITRE | nouveau titre de la présentation', validate: a => (!S(a[0]) ? 'titre vide' : null),
    run(a, ctx) { if (!setTitle(ctx.edit, plain(a[0]))) return false; ctx.tx.counts.titled++; ctx.tx.details.push({ id: 'titre', label: 'Titre', avant: '', apres: plain(a[0]) }); return true; } });

  /* ============================================================
     Registre : tableur (AlixoSheets.edit) — repères A1 validés par la façade
     ============================================================ */
  const refOk = (ctx, r) => (ctx.edit.isRef && ctx.edit.isRef(r) ? null : `case inconnue « ${cut(r, 12)} »`);
  register('sheet', { name: 'CASE', args: 2, join: true, describe: 'CASE A1 | valeur ou =formule',
    validate: (a, ctx) => refOk(ctx, a[0]) || (a[1].length > 500 ? 'contenu trop long' : null),
    run(a, ctx) { const e = entry(ctx, a[0].toUpperCase()); if (!ctx.edit.setCell(a[0], cellText(a[1]))) return false; ctx.tx.counts.cells++; ctx.tx.details.push({ id: a[0].toUpperCase(), label: 'Case ' + a[0].toUpperCase(), avant: e ? e.text : '', apres: cellText(a[1]) }); return true; } });
  register('sheet', { name: 'VIDE', args: 1, phase: 2, destructive: true, describe: 'VIDE A1:B3',
    validate: (a, ctx) => { const [x, y] = a[0].toUpperCase().split(':'); return refOk(ctx, x) || (y ? refOk(ctx, y) : null); },
    run(a, ctx) { const k = ctx.edit.clear(a[0]); if (!k) return false; ctx.tx.counts.removed += k; ctx.tx.details.push({ id: a[0].toUpperCase(), label: 'Vidé ' + a[0].toUpperCase(), avant: `${k} case${k > 1 ? 's' : ''}`, apres: '' }); return true; } });

  /* ============================================================
     Registre : planche (AlixoBoard.edit)
     ============================================================ */
  register('board', { name: 'AJOUTE_NOTE', args: 1, join: true, phase: 1, describe: 'AJOUTE_NOTE | texte de la note', validate: a => (!S(a[0]) ? 'texte vide' : null),
    run(a, ctx) { if (!ctx.edit.add('note', plain(a[0]))) return false; ctx.tx.counts.notes++; ctx.tx.details.push({ id: 'note', label: 'Note ajoutée', avant: '', apres: plain(a[0]) }); return true; } });
  register('board', { name: 'AJOUTE_TEXTE', args: 1, join: true, phase: 1, describe: 'AJOUTE_TEXTE | texte', validate: a => (!S(a[0]) ? 'texte vide' : null),
    run(a, ctx) { if (!ctx.edit.add('text', plain(a[0]))) return false; ctx.tx.counts.inserted++; ctx.tx.details.push({ id: 'texte', label: 'Texte ajouté', avant: '', apres: plain(a[0]) }); return true; } });
  register('board', { name: 'REMPLACE', args: 2, join: true, describe: 'REMPLACE n3 | nouveau texte',
    validate: (a, ctx) => idOk(ctx, a[0]) || (!S(a[1]) ? 'texte vide' : null),
    run(a, ctx) { const e = entry(ctx, a[0]); if (!ctx.edit.setText(e.id, plain(a[1]))) return false; ctx.tx.counts.replaced++; ctx.tx.details.push({ id: a[0], label: 'Réécrit', avant: e.text, apres: plain(a[1]) }); return true; } });
  register('board', { name: 'SUPPRIME', args: 1, phase: 2, destructive: true, describe: 'SUPPRIME n3', validate: (a, ctx) => idOk(ctx, a[0]),
    run(a, ctx) { const e = entry(ctx, a[0]); if (!ctx.edit.remove(e.id)) return false; ctx.tx.counts.removed++; ctx.tx.details.push({ id: a[0], label: 'Supprimé', avant: e.text, apres: '' }); return true; } });

  /* ============================================================
     Registre : quiz (AlixoQuiz.edit)
     ============================================================ */
  register('quiz', { name: 'AJOUTE_QCM', args: 4, phase: 1, describe: 'AJOUTE_QCM | question | A | B | C | D | lettre de la bonne réponse',
    validate: a => (!S(a[0]) ? 'question vide' : a.length < 4 ? 'au moins deux propositions' : null),
    run(a, ctx) {
      let opts = a.slice(1), ans = 0; const last = opts[opts.length - 1];
      if (opts.length > 2 && /^[A-Da-d]$/.test(last)) { ans = last.toUpperCase().charCodeAt(0) - 65; opts = opts.slice(0, -1); }
      const id = ctx.edit.addMcq(plain(a[0]), opts.map(plain), ans); if (!id) return false;
      ctx.tx.counts.questions++; ctx.tx.details.push({ id: 'qcm', label: 'QCM ajouté', avant: '', apres: plain(a[0]) }); return true;
    } });
  register('quiz', { name: 'AJOUTE_VF', args: 2, phase: 1, describe: 'AJOUTE_VF | affirmation | vrai ou faux',
    validate: a => (!S(a[0]) ? 'affirmation vide' : !/^(vrai|faux|v|f|true|false)$/i.test(a[1]) ? 'réponse : vrai ou faux' : null),
    run(a, ctx) { const id = ctx.edit.addTf(plain(a[0]), /^(vrai|v|true)$/i.test(a[1])); if (!id) return false; ctx.tx.counts.questions++; ctx.tx.details.push({ id: 'vf', label: 'Vrai / faux ajouté', avant: '', apres: plain(a[0]) }); return true; } });
  register('quiz', { name: 'REMPLACE', args: 2, join: true, describe: 'REMPLACE q2 | nouvelle question',
    validate: (a, ctx) => idOk(ctx, a[0]) || (!S(a[1]) ? 'texte vide' : null),
    run(a, ctx) { const e = entry(ctx, a[0]); if (!ctx.edit.setText(e.id, plain(a[1]))) return false; ctx.tx.counts.replaced++; ctx.tx.details.push({ id: a[0], label: 'Réécrit', avant: e.text, apres: plain(a[1]) }); return true; } });
  register('quiz', { name: 'SUPPRIME', args: 1, phase: 2, destructive: true, describe: 'SUPPRIME q2', validate: (a, ctx) => idOk(ctx, a[0]),
    run(a, ctx) { const e = entry(ctx, a[0]); if (!ctx.edit.remove(e.id)) return false; ctx.tx.counts.removed++; ctx.tx.details.push({ id: a[0], label: 'Question supprimée', avant: e.text, apres: '' }); return true; } });
  register('quiz', { name: 'TITRE', args: 1, join: true, describe: 'TITRE | nouveau titre du quiz', validate: a => (!S(a[0]) ? 'titre vide' : null),
    run(a, ctx) { if (!setTitle(ctx.edit, plain(a[0]))) return false; ctx.tx.counts.titled++; ctx.tx.details.push({ id: 'titre', label: 'Titre', avant: '', apres: plain(a[0]) }); return true; } });

  /* ============================================================
     Intentions
     ============================================================ */
  /* éléments corrigeables (texte brut) avec leur identifiant pour applyFixes : séance → blocs ; présentation → sid.eid ; autres → id */
  function fixables(edit) {
    const items = edit.items() || [];
    if (edit.kind === 'slides') return items.flatMap(s => s.els.map(e => ({ id: `${s.id}.${e.id}`, text: e.text })));
    return items.filter(it => it.fix !== false && !it.ro && !(edit.kind === 'sheet' && it.text[0] === '=')).map(it => ({ id: it.id, text: it.text }));
  }
  registerIntent('corriger', { describe: 'fautes d’orthographe ou de grammaire', kinds: KINDS.slice(),
    async run(tx, text, ui) {
      if (typeof AlixoCorr === 'undefined') throw new Error('Le correcteur n’est pas disponible.');
      const payload = fixables(tx.edit).filter(x => x.text.trim().length >= 3).map(x => ({ id: String(x.id), text: x.text, lang: 'fr' }));
      if (!payload.length) return;
      progress(ui, { phase: 'corrige', lot: 1, lots: 1 });
      const all = await AlixoCorr.analyzeBlocks(payload, { onProgress: (i, k) => { tx.lots = Math.min(i + 1, k); tx.lotsTotal = k; progress(ui, { phase: 'corrige', lot: Math.min(i + 1, k), lots: k }); } });
      if (cancelled(ui)) { tx.stopped = true; return; }
      if (!alive(tx)) { tx.changedByUser = true; return; }
      const seen = new Set(); const fixes = [];
      for (const f of all) { const k = f.id + '|' + f.at + '|' + f.avant; if (seen.has(k) || !f.avant || f.avant === f.apres) continue; seen.add(k); fixes.push(f); }
      if (!fixes.length) return;
      tx.edit.begin();
      const r = tx.edit.applyFixes(fixes);
      if (r.fixes) { tx.edit.commit(); tx.changes += r.fixes; }
      const d = current(); tx.lastSeen = d ? (d.updatedAt || 0) : tx.lastSeen;
      tx.counts.fixes += r.fixes; tx.counts.blocks += r.blocks;
      for (const f of r.done) tx.details.push({ id: f.id, label: f.regle || 'Correction', avant: f.avant, apres: f.apres });
    } });
  registerIntent('embellir', { describe: 'encadrés, titres, mise en forme', kinds: ['doc'],
    async run(tx, text, ui) {
      const items = (tx.edit.items() || []).filter(it => it.type === 'p' && it.text.trim().length >= 12).slice(0, 80);
      if (!items.length) return;
      const b = AlixoAI.budget(); const total = Math.ceil(items.length / (b.style || 8));
      progress(ui, { phase: 'embellit', lot: 1, lots: total });
      const arr = await AlixoAI.run('style', { blocks: items.map(x => ({ id: String(x.id), text: x.text })) }, { token: ui.token, onProgress: (i, k) => { tx.lots = Math.ceil(i / (b.style || 8)); tx.lotsTotal = total; progress(ui, { phase: 'embellit', lot: Math.min(total, tx.lots + 1), lots: total }); } });
      if (cancelled(ui)) { tx.stopped = true; return; }
      if (!alive(tx)) { tx.changedByUser = true; return; }
      /* la demande précise ce qu'elle veut : seulement les encadrés, ou seulement les titres */
      const wantsBox = /encadr|d[ée]fini|retenir|exemple/i.test(text), wantsTitle = /titre|plan|partie|section/i.test(text);
      let list = (arr || []).filter(x => x && x.id && typeof STYLE_LABELS === 'object' && STYLE_LABELS[x.type]);
      if (wantsBox && !wantsTitle) list = list.filter(x => !/^h[1-4]$/.test(x.type));
      if (wantsTitle && !wantsBox) list = list.filter(x => /^h[1-4]$/.test(x.type));
      if (!list.length) return;
      tx.edit.begin();
      const r = tx.edit.applyStyles(list.map(x => ({ id: String(x.id), type: x.type, terme: String(x.terme || '').trim() })));
      if (r.styled) { tx.edit.commit(); tx.changes += r.styled; }
      const d = current(); tx.lastSeen = d ? (d.updatedAt || 0) : tx.lastSeen;
      tx.counts.styled += r.styled; tx.counts.callouts = (tx.counts.callouts || 0); tx.counts.titles = (tx.counts.titles || 0);
      const byId = new Map(items.map(x => [String(x.id), x.text]));
      for (const x of r.done) { if (/^h[1-4]$/.test(x.type)) tx.counts.titles++; else if (!['li', 'quote'].includes(x.type)) tx.counts.callouts++; tx.details.push({ id: x.id, label: STYLE_LABELS[x.type] || x.type, avant: byId.get(x.id) || '', apres: '' }); }
    } });
  registerIntent('modifier', { describe: 'tout autre changement du contenu', kinds: KINDS.slice(),
    async run(tx, text, ui) {
      const edit = tx.edit; const kind = edit.kind;
      const o = outline(edit);
      const b = AlixoAI.budget();
      const parts = lots(o.lines, b.agent || 1600);
      if (!parts.length) parts.push([]);
      tx.lotsTotal = parts.length;
      const ctx = { tx, edit, ids: o.ids, real: short => (o.ids.get(short) || {}).id };
      for (let k = 0; k < parts.length; k++) {
        if (cancelled(ui)) { tx.stopped = true; break; }
        if (!alive(tx)) { tx.changedByUser = true; break; }
        tx.lots = k + 1;
        progress(ui, { phase: 'modifie', lot: k + 1, lots: parts.length, changes: tx.changes });
        let r;
        try {
          r = await AlixoAI.run('edit', { instruction: text, kind, lines: parts[k].map(l => l.text), commands: describe(kind, edit), example: EXAMPLES[kind], part: { k: k + 1, n: parts.length } }, { token: ui.token });
        } catch (err) { if (err && err.status === 499) { tx.stopped = true; break; } throw err; }
        if (cancelled(ui)) { tx.stopped = true; break; }
        const { valid, rejected } = parseCommands(r.lines, kind, ctx);
        tx.rejected.push(...rejected);
        if (!valid.length) continue;
        if (!alive(tx)) { tx.changedByUser = true; break; }
        if (valid.some(c => c.def.destructive) && !(ui && ui.confirmDeletes)) {
          tx.pending = { kind, lot: k + 1, ids: [...o.ids], commands: valid.map(c => { const e = o.ids.get(c.args[0]) || {}; return { name: c.name, args: c.args, line: c.line, destructive: c.def.destructive, text: e.text || '', num: e.num || 0, title: e.title || '' }; }) };
          break;
        }
        execute(tx, valid, o.ids);
      }
    } });

  return { register, registerIntent, maybeAction, route, run, applyPlan, undo, summary, pendingText, outline, parseCommands, execute, facadeOf, kindOf, KIND_WORDS, describe, safe, get intents() { return [...intents.keys()]; }, get registry() { return registry; } };
})();
