/* ============================================================
   Alixo Coedit (1.56.0) — fusion à trois versions des séances partagées.
   Module pur : ni DOM ni Firestore. Utilisé par js/share.js (réception d'une
   version distante) et testé sous Node (scripts/v1560-coedit-test.js).

   Principe : chaque client garde `base` = dernière version serveur connue.
   À la réception d'une version distante, on fusionne base / local / distant :
   - par onglet, puis par bloc (identifiant), puis par mots dans un bloc de texte ;
   - ce que seul un côté a changé est pris de ce côté ;
   - les deux côtés ont changé le même passage → les deux versions l'une après
     l'autre (conflict: true), à relire par les membres.
   L'onglet affiché (local.page) n'est JAMAIS repris de la version distante.
   ============================================================ */
'use strict';

(function (root) {
  /* ---------------- jetons ---------------- */
  /* balise (longueur de texte 0), entité (1 caractère), blancs, mot (lettres / chiffres), autre caractère */
  const TOKEN_RE = /<[^>]*>|&[a-zA-Z#0-9]+;|\s+|[\p{L}\p{N}]+|[^\s<\p{L}\p{N}]/gu;
  function tokenize(html) {
    const s = String(html == null ? '' : html);
    const out = s.match(TOKEN_RE) || [];
    /* un « < » isolé (texte mal formé) n'est capturé par aucune branche : on le garde comme caractère */
    if (out.join('') !== s) {
      const fixed = []; let i = 0;
      for (const t of out) { const j = s.indexOf(t, i); if (j > i) fixed.push(s.slice(i, j)); fixed.push(t); i = j + t.length; }
      if (i < s.length) fixed.push(s.slice(i));
      return fixed;
    }
    return out;
  }
  function textLen(tok) {
    if (!tok) return 0;
    if (tok[0] === '<' && tok[tok.length - 1] === '>') return 0;
    if (tok[0] === '&' && tok[tok.length - 1] === ';' && tok.length > 2) return 1;
    return tok.length;
  }

  /* ---------------- différence (plus longue sous-suite commune) ---------------- */
  const LCS_MAX = 4e6;
  /* → [{op:'=',n}|{op:'-',n}|{op:'+',toks}] ou null si le calcul serait trop lourd (repli au niveau du bloc) */
  function lcsDiff(a, b) {
    a = a || []; b = b || [];
    let pre = 0;
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    let suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
    const n = A.length, m = B.length;
    if (n * m > LCS_MAX) return null;
    const ops = [];
    const push = (op, x) => {
      const last = ops[ops.length - 1];
      if (op === '+') { if (last && last.op === '+') last.toks.push(...x); else ops.push({ op, toks: x.slice() }); return; }
      if (!x) return;
      if (last && last.op === op) last.n += x; else ops.push({ op, n: x });
    };
    push('=', pre);
    if (n && m) {
      /* table des longueurs (de la fin vers le début) : L[i][j] = LCS(A[i..], B[j..]) */
      const W = m + 1;
      const L = new Uint32Array((n + 1) * W);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (A[i] === B[j]) { push('=', 1); i++; j++; }
        else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) { push('-', 1); i++; }
        else { push('+', [B[j]]); j++; }
      }
      if (i < n) push('-', n - i);
      if (j < m) push('+', B.slice(j));
    } else {
      if (n) push('-', n);
      if (m) push('+', B);
    }
    push('=', suf);
    return ops;
  }
  /* opérations → morceaux { start, end, toks } exprimés en positions de la base (remplacement de base[start..end[ par toks) */
  function hunksOf(ops) {
    const out = []; let pos = 0; let cur = null;
    for (const o of ops) {
      if (o.op === '=') { if (cur) { out.push(cur); cur = null; } pos += o.n; continue; }
      if (!cur) cur = { start: pos, end: pos, toks: [] };
      if (o.op === '-') { pos += o.n; cur.end = pos; } else cur.toks.push(...o.toks);
    }
    if (cur) out.push(cur);
    return out;
  }
  const sameToks = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);
  const isPrefix = (p, a) => p.length <= a.length && p.every((t, i) => t === a[i]);

  /* ---------------- fusion d'un texte ---------------- */
  /* → { text, caret, conflict } ou null (garde-fou) ; caret : position (en caractères) du curseur local, recalculée */
  function merge3Text(base, local, remote, opts) {
    opts = opts || {};
    base = String(base == null ? '' : base); local = String(local == null ? '' : local); remote = String(remote == null ? '' : remote);
    const caret0 = typeof opts.caret === 'number' ? opts.caret : null;
    const preferLocal = opts.preferLocal !== false;
    if (local === remote || remote === base) return { text: local, caret: caret0, conflict: false };
    if (local === base) return { text: remote, caret: caret0 === null ? null : mapCaretWhole(local, remote, caret0), conflict: false };
    const B = tokenize(base), Lt = tokenize(local), R = tokenize(remote);
    const dl = lcsDiff(B, Lt), dr = lcsDiff(B, R);
    if (!dl || !dr) return null;
    const hl = hunksOf(dl).map(h => Object.assign(h, { side: 'l' }));
    const hr = hunksOf(dr).map(h => Object.assign(h, { side: 'r' }));
    const all = hl.concat(hr).sort((x, y) => (x.start - y.start) || (x.end - y.end) || (x.side === 'l' ? -1 : 1));
    /* regroupement des morceaux qui se chevauchent (deux insertions au même point comptent comme un chevauchement) */
    const clusters = [];
    for (const h of all) {
      const c = clusters[clusters.length - 1];
      if (c && (h.start < c.end || (h.start === c.start && h.start === c.end && h.end === h.start))) {
        c.items.push(h); c.end = Math.max(c.end, h.end);
      } else clusters.push({ start: h.start, end: h.end, items: [h] });
    }
    const items = [];   // { tok, inL, inO }
    const emit = (toks, inL, inO) => { for (const t of toks) items.push({ tok: t, inL, inO }); };
    /* remplacement d'un côté sur base[cs..ce[ */
    const sideRep = (c, side) => {
      const hs = c.items.filter(h => h.side === side);
      const out = []; let p = c.start;
      for (const h of hs) { out.push(...B.slice(p, h.start)); out.push(...h.toks); p = h.end; }
      out.push(...B.slice(p, c.end));
      return out;
    };
    let conflict = false;
    let pos = 0;
    for (const c of clusters) {
      emit(B.slice(pos, c.start), true, true);
      const hasL = c.items.some(h => h.side === 'l'), hasR = c.items.some(h => h.side === 'r');
      if (hasL && !hasR) emit(sideRep(c, 'l'), true, true);
      else if (hasR && !hasL) { emit(B.slice(c.start, c.end), true, false); emit(sideRep(c, 'r'), false, true); }
      else {
        const lr = sideRep(c, 'l'), rr = sideRep(c, 'r');
        if (sameToks(lr, rr)) emit(lr, true, true);
        else if (isPrefix(lr, rr)) { emit(lr, true, true); emit(rr.slice(lr.length), false, true); }
        else if (isPrefix(rr, lr)) emit(lr, true, true);
        else {
          const ls = lr.join(''), rs = rr.join('');
          if (rs.startsWith(ls)) { emit(lr, true, false); emit(rr, false, true); }
          else if (ls.startsWith(rs)) emit(lr, true, true);
          else {
            conflict = true;
            /* les deux versions l'une après l'autre, séparées par une espace si elles se toucheraient */
            const first = preferLocal ? lr : rr, second = preferLocal ? rr : lr;
            const sep = first.length && second.length && !/\s$/.test(first.join('')) && !/^\s/.test(second.join('')) ? [' '] : [];
            if (preferLocal) { emit(lr, true, true); emit(sep, false, true); emit(rr, false, true); }
            else { emit(rr, false, true); emit(sep, false, true); emit(lr, true, true); }
          }
        }
      }
      pos = c.end;
    }
    emit(B.slice(pos), true, true);
    const text = items.filter(x => x.inO).map(x => x.tok).join('');
    let caret = null;
    if (caret0 !== null) {
      let lc = 0, oc = 0; caret = -1;
      for (const x of items) {
        const n = textLen(x.tok);
        if (x.inL) {
          if (lc + n >= caret0 && (n > 0 || lc === caret0)) { caret = oc + (x.inO ? Math.min(n, caret0 - lc) : 0); break; }
          lc += n;
        }
        if (x.inO) oc += n;
      }
      if (caret < 0) caret = oc;
    }
    return { text, caret, conflict };
  }
  /* curseur quand le texte local est entièrement remplacé par le distant : même position, bornée */
  function mapCaretWhole(local, remote, caret) {
    const m = merge3TextCaretOnly(local, remote, caret);
    return m === null ? caret : m;
  }
  function merge3TextCaretOnly(local, remote, caret) {
    const Lt = tokenize(local), R = tokenize(remote);
    const d = lcsDiff(Lt, R); if (!d) return null;
    let lc = 0, oc = 0, li = 0;
    for (const o of d) {
      if (o.op === '=') {
        for (let k = 0; k < o.n; k++) { const n = textLen(Lt[li++]); if (lc + n >= caret && (n > 0 || lc === caret)) return oc + Math.min(n, caret - lc); lc += n; oc += n; }
      } else if (o.op === '-') {
        for (let k = 0; k < o.n; k++) { const n = textLen(Lt[li++]); if (lc + n >= caret && n > 0) return oc; lc += n; }
      } else { for (const t of o.toks) oc += textLen(t); }
    }
    return oc;
  }

  /* ---------------- fusion des blocs ---------------- */
  const sig = b => JSON.stringify(b, (k, v) => (k === 'day' || k === 'mod' || k === 'notes') ? undefined : v);
  const J = v => (v === undefined ? '\u0000undef' : JSON.stringify(v));
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const TEXT_TYPES = ['p', 'h', 'li', 'quote', 'callout'];
  const FICHE_TYPES = ['juris', 'fiche'];
  const TEXT_KEYS = ['text', 'cite', 'cap'];
  /* 1.56.0 (sécurité) : clés jamais recopiées d'une version reçue — JSON.parse en fait des propriétés propres, et une
     affectation out['__proto__'] = … changerait le prototype de l'objet fusionné */
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const keysOf = o => (o && typeof o === 'object' ? Object.keys(o).filter(k => !BAD_KEYS.has(k)) : []);
  /* au-delà de 100 000 caractères, pas de fusion mot à mot (coût) : la version du côté retenu est prise entière */
  const TEXT_MERGE_MAX = 100000;
  /* ordre « inchangé » : les éléments communs à `order` et `baseOrder` y apparaissent dans le même ordre */
  function sameOrder(order, baseOrder) {
    const inB = new Set(baseOrder), inO = new Set(order);
    const a = order.filter(x => inB.has(x)), b = baseOrder.filter(x => inO.has(x));
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  /* squelette = primary (limité à keep) ; les éléments de secondary absents sont insérés après leur prédécesseur dans secondary */
  function weave(primary, secondary, keep) {
    const out = primary.filter(x => keep.has(x));
    const seen = new Set(out);
    for (let i = 0; i < secondary.length; i++) {
      const id = secondary[i];
      if (seen.has(id) || !keep.has(id)) continue;
      let at = 0;
      for (let k = i - 1; k >= 0; k--) { const j = out.indexOf(secondary[k]); if (j >= 0) { at = j + 1; break; } }
      out.splice(at, 0, id); seen.add(id);
    }
    /* filet : tout ce qui reste (n'apparaît dans aucun ordre) va à la fin */
    for (const id of keep) if (!seen.has(id)) { out.push(id); seen.add(id); }
    return out;
  }
  function mergeOrder(bo, lo, ro, keep) {
    if (sameOrder(lo, bo)) return weave(ro, lo, keep);
    if (sameOrder(ro, bo)) return weave(lo, ro, keep);
    return weave(ro, lo, keep);
  }
  /* fusion d'un bloc modifié des deux côtés → { block, conflict, caret } */
  function mergeBlock(b, l, r, opts) {
    const id = l.id;
    const typing = opts.typingId && opts.typingId === id;
    const sameType = b.type === l.type && l.type === r.type;
    const textual = sameType && (TEXT_TYPES.includes(l.type) || FICHE_TYPES.includes(l.type) || l.type === 'img');
    if (!textual) return { block: clone(typing ? l : r), conflict: false, caret: null };
    const out = {};
    let conflict = false, caret = null;
    const keys = new Set([...keysOf(b), ...keysOf(l), ...keysOf(r)]);
    for (const k of keys) {
      if (k === 'id') continue;
      const bv = b[k], lv = l[k], rv = r[k];
      let v;
      if (J(lv) === J(bv)) v = rv;
      else if (J(rv) === J(bv) || J(lv) === J(rv)) v = lv;
      else if (TEXT_KEYS.includes(k) && (typeof lv === 'string' || lv == null) && (typeof rv === 'string' || rv == null) && String(lv || '').length <= TEXT_MERGE_MAX && String(rv || '').length <= TEXT_MERGE_MAX && String(bv || '').length <= TEXT_MERGE_MAX) {
        const wantCaret = k === 'text' && opts.caretId === id && typeof opts.caret === 'number' && !opts.caretKey;
        const m = merge3Text(typeof bv === 'string' ? bv : '', lv || '', rv || '', { caret: wantCaret ? opts.caret : null, preferLocal: true });
        if (!m) v = typing ? lv : rv;
        else { v = m.text; if (m.conflict) conflict = true; if (wantCaret) caret = m.caret; }
      } else if (k === 'fields' && lv && rv && typeof lv === 'object' && typeof rv === 'object') {
        v = {};
        const bf = bv && typeof bv === 'object' ? bv : {};
        for (const f of new Set([...keysOf(bf), ...keysOf(lv), ...keysOf(rv)])) {
          const fb = bf[f], fl = lv[f], fr = rv[f];
          if (J(fl) === J(fb)) { if (fr !== undefined) v[f] = fr; }
          else if (J(fr) === J(fb) || J(fl) === J(fr)) { if (fl !== undefined) v[f] = fl; }
          else if ((typeof fl === 'string' || fl == null) && (typeof fr === 'string' || fr == null) && String(fl || '').length <= TEXT_MERGE_MAX && String(fr || '').length <= TEXT_MERGE_MAX) {
            const m = merge3Text(typeof fb === 'string' ? fb : '', fl || '', fr || '', { preferLocal: true });
            if (!m) v[f] = typing ? fl : fr; else { v[f] = m.text; if (m.conflict) conflict = true; }
          } else v[f] = typing ? fl : fr;
        }
      } else v = typing ? lv : rv;
      if (v !== undefined) out[k] = clone(v);
    }
    out.id = id;
    /* les clés dans l'ordre du bloc local (JSON stable d'un client à l'autre) */
    const ordered = { id };
    for (const k of keysOf(l)) if (Object.prototype.hasOwnProperty.call(out, k) && k !== 'id') ordered[k] = out[k];
    for (const k of keysOf(out)) if (!Object.prototype.hasOwnProperty.call(ordered, k)) ordered[k] = out[k];
    return { block: ordered, conflict, caret };
  }
  /* → { blocks, changedIds, removedIds, addedIds, conflicts, caret } ; changed/added/removed : par rapport au local */
  function merge3Blocks(base, local, remote, opts) {
    opts = opts || {};
    base = Array.isArray(base) ? base.filter(x => x && x.id) : [];
    local = Array.isArray(local) ? local.filter(x => x && x.id) : [];
    remote = Array.isArray(remote) ? remote.filter(x => x && x.id) : [];
    const Bm = new Map(base.map(b => [b.id, b])), Lm = new Map(local.map(b => [b.id, b])), Rm = new Map(remote.map(b => [b.id, b]));
    const res = new Map();
    const conflicts = [];
    let caret = null;
    const ids = [];
    { const s = new Set(); for (const b of [...local, ...remote, ...base]) if (!s.has(b.id)) { s.add(b.id); ids.push(b.id); } }
    for (const id of ids) {
      const b = Bm.get(id), l = Lm.get(id), r = Rm.get(id);
      if (l && r) {
        const sl = sig(l), sr = sig(r), sb = b ? sig(b) : null;
        /* mêmes contenus : la version distante (jours de modification compris), pour que les deux clients convergent */
        if (sl === sr || sl === sb) res.set(id, r);
        else if (sr === sb) res.set(id, l);
        else {
          const m = mergeBlock(b || { id, type: l.type }, l, r, opts);
          res.set(id, m.block);
          if (m.conflict) conflicts.push(id);
          if (m.caret !== null && m.caret !== undefined) caret = m.caret;
        }
      } else if (l && !r) {
        if (!b || sig(l) !== sig(b)) res.set(id, l);   // ajouté ici, ou modifié ici alors que l'autre l'a supprimé : la modification gagne
      } else if (!l && r) {
        if (!b || sig(r) !== sig(b)) res.set(id, r);   // ajouté là-bas, ou modifié là-bas alors que je l'ai supprimé
      }
    }
    const keep = new Set(res.keys());
    const order = mergeOrder(base.map(b => b.id), local.map(b => b.id), remote.map(b => b.id), keep);
    const blocks = order.map(id => res.get(id));
    const changedIds = [], addedIds = [], removedIds = [];
    for (const bl of blocks) { const l = Lm.get(bl.id); if (!l) addedIds.push(bl.id); else if (bl !== l && sig(bl) !== sig(l)) changedIds.push(bl.id); }
    for (const l of local) if (!keep.has(l.id)) removedIds.push(l.id);
    return { blocks, changedIds, removedIds, addedIds, conflicts, caret };
  }

  /* ---------------- fusion d'une séance ---------------- */
  const WHOLE_KINDS = ['slides', 'sheet', 'board', 'quiz'];
  const META_SKIP = new Set(['id', 'blocks', 'pages', 'page', 'updatedAt', 'createdAt', 'by', 'byName']);
  /* onglets normalisés, sans modifier le document (reproduit docPages d'app.js) → { pages: [{ id, titre, blocks, extra }], cur } */
  function pagesOf(d) {
    if (!d) return { pages: [], cur: null };
    if (!Array.isArray(d.pages) || !d.pages.length) return { pages: [{ id: 'main', titre: 'Principal', blocks: Array.isArray(d.blocks) ? d.blocks : [], extra: {} }], cur: 'main' };
    const raw = d.pages.filter(p => p && typeof p === 'object' && p.id);
    if (!raw.length) return { pages: [{ id: 'main', titre: 'Principal', blocks: Array.isArray(d.blocks) ? d.blocks : [], extra: {} }], cur: 'main' };
    let cur = d.page && raw.some(p => p.id === d.page) ? d.page : null;
    if (!cur) { const wn = raw.find(p => !Array.isArray(p.blocks)); cur = wn ? wn.id : raw[0].id; }
    return {
      cur,
      pages: raw.map(p => {
        const extra = {}; for (const k of keysOf(p)) if (k !== 'id' && k !== 'titre' && k !== 'blocks') extra[k] = p[k];
        return { id: p.id, titre: p.titre, blocks: p.id === cur ? (Array.isArray(d.blocks) ? d.blocks : []) : (Array.isArray(p.blocks) ? p.blocks : []), extra };
      })
    };
  }
  const pageSig = p => J([p.titre, p.extra]) + '|' + p.blocks.map(sig).join(',');
  /* → { doc, report } ; report : { changedIds, addedIds, removedIds, conflicts, titleChanged, pagesChanged, pageGone, caret, whole } */
  function merge3Doc(base, local, remote, opts) {
    opts = opts || {};
    const emptyReport = () => ({ changedIds: [], addedIds: [], removedIds: [], conflicts: [], titleChanged: false, pagesChanged: false, pageGone: false, caret: null, whole: false });
    if (!remote) return { doc: local, report: emptyReport() };
    if (!local) return { doc: clone(remote), report: Object.assign(emptyReport(), { whole: true }) };
    if (WHOLE_KINDS.includes(local.kind) || WHOLE_KINDS.includes(remote.kind)) {
      /* présentations, tableurs, planches, quiz : la dernière version enregistrée gagne (leurs modules savent se rafraîchir) */
      const doc = clone(remote); doc.id = local.id;
      return { doc, report: Object.assign(emptyReport(), { whole: true, titleChanged: (doc.titre || '') !== (local.titre || '') }) };
    }
    if (!base) base = remote;   // pas de base connue : le local gagne partout où il diffère
    const out = {};
    /* champs simples : pris du côté qui les a changés (le local en cas de double changement) */
    const keys = new Set([...keysOf(local), ...keysOf(remote), ...keysOf(base)]);
    for (const k of keys) {
      if (META_SKIP.has(k)) continue;
      const v = J(local[k]) === J(base[k]) ? remote[k] : local[k];
      if (v !== undefined) out[k] = clone(v);
    }
    out.id = local.id;
    if (local.createdAt !== undefined || remote.createdAt !== undefined) out.createdAt = local.createdAt !== undefined ? local.createdAt : remote.createdAt;
    const ua = Math.max(+local.updatedAt || 0, +remote.updatedAt || 0);
    if (ua) out.updatedAt = ua;
    /* onglets */
    const PB = pagesOf(base), PL = pagesOf(local), PR = pagesOf(remote);
    const bM = new Map(PB.pages.map(p => [p.id, p])), lM = new Map(PL.pages.map(p => [p.id, p])), rM = new Map(PR.pages.map(p => [p.id, p]));
    const tabIds = []; { const s = new Set(); for (const p of [...PL.pages, ...PR.pages, ...PB.pages]) if (!s.has(p.id)) { s.add(p.id); tabIds.push(p.id); } }
    const tabs = new Map();
    let curRes = null;
    for (const id of tabIds) {
      const b = bM.get(id), l = lM.get(id), r = rM.get(id);
      const isCur = id === PL.cur;
      if (l && r) {
        const bb = b || { id, titre: l.titre, blocks: [], extra: {} };
        const titre = J(l.titre) === J(bb.titre) ? r.titre : l.titre;
        const extra = {}; for (const k of new Set([...keysOf(l.extra), ...keysOf(r.extra)])) { const v = J(l.extra[k]) === J(bb.extra[k]) ? r.extra[k] : l.extra[k]; if (v !== undefined) extra[k] = v; }
        const mb = merge3Blocks(bb.blocks, l.blocks, r.blocks, isCur ? opts : { typingId: null });
        tabs.set(id, { id, titre, blocks: mb.blocks, extra });
        if (isCur) curRes = mb;
      } else if (l && !r) {
        if (!b || pageSig(l) !== pageSig(b)) tabs.set(id, l);
      } else if (!l && r) {
        if (!b || pageSig(r) !== pageSig(b)) tabs.set(id, r);
      }
    }
    const keepTabs = new Set(tabs.keys());
    let order = mergeOrder(PB.pages.map(p => p.id), PL.pages.map(p => p.id), PR.pages.map(p => p.id), keepTabs);
    if (!order.length) { order = [PL.cur || 'main']; tabs.set(order[0], { id: order[0], titre: 'Principal', blocks: [], extra: {} }); }
    let page = PL.cur, pageGone = false;
    if (!tabs.has(page)) { page = order[0]; pageGone = true; }
    const curTab = tabs.get(page);
    out.blocks = clone(curTab.blocks);
    out.page = page;
    out.pages = order.map(id => { const t = tabs.get(id); return Object.assign({ id: t.id, titre: t.titre }, clone(t.extra), { blocks: id === page ? null : clone(t.blocks) }); });
    /* rapport, relatif à ce qu'affiche le client local (onglet courant) */
    const report = emptyReport();
    if (pageGone || !curRes) {
      const lb = (lM.get(PL.cur) || { blocks: [] }).blocks;
      const lMap = new Map(lb.map(x => [x.id, x]));
      const keepIds = new Set(curTab.blocks.map(x => x.id));
      for (const x of curTab.blocks) { const l = lMap.get(x.id); if (!l) report.addedIds.push(x.id); else if (sig(l) !== sig(x)) report.changedIds.push(x.id); }
      for (const l of lb) if (!keepIds.has(l.id)) report.removedIds.push(l.id);
    } else {
      report.changedIds = curRes.changedIds; report.addedIds = curRes.addedIds; report.removedIds = curRes.removedIds;
      report.conflicts = curRes.conflicts; report.caret = curRes.caret;
    }
    report.pageGone = pageGone;
    report.titleChanged = (out.titre || '') !== (local.titre || '');
    const tabsSig = arr => J(arr.map(p => [p.id, p.titre, p.extra]));
    report.pagesChanged = pageGone || tabsSig(PL.pages) !== tabsSig(order.map(id => tabs.get(id)))
      || order.some(id => id !== page && lM.has(id) && lM.get(id).blocks.map(sig).join(',') !== tabs.get(id).blocks.map(sig).join(','));
    return { doc: out, report };
  }

  /* contenu comparable d'une séance : onglets dépliés, clés triées, sans ce qui est propre à chaque client (onglet affiché,
     dates, auteur). Sert à savoir s'il reste quelque chose à envoyer après une fusion (sinon deux clients sur des onglets
     différents se renverraient la séance sans fin). */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : stable(x))).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  function canon(d) {
    if (!d || typeof d !== 'object') return '';
    const o = {};
    for (const k of keysOf(d)) if (!['page', 'pages', 'blocks', 'updatedAt', 'by', 'byName'].includes(k)) o[k] = d[k];
    if (WHOLE_KINDS.includes(d.kind)) { o.blocks = d.blocks; o.pages = d.pages; return stable(o); }
    o.tabs = pagesOf(d).pages.map(p => ({ id: p.id, titre: p.titre, extra: p.extra, blocks: p.blocks }));
    return stable(o);
  }

  const api = { canon, tokenize, textLen, lcsDiff, merge3Text, merge3Blocks, merge3Doc, pagesOf, sig, LCS_MAX };
  root.AlixoCoedit = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
