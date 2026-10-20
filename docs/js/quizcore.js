/* ============================================================
   Alixo — quiz : noyau commun (1.24, refonte 1.25)
   Partagé par l'application (js/quiz.js : éditeur, test, présentation en direct) et par la page des
   participants (quiz.html + js/quizplay.js) : types de questions, vérification des réponses, points,
   statistiques, thèmes et rendu des réponses sur l'écran de chacun. Aucune dépendance (ni app.js, ni Firebase).

   Question : { id, t, text, time (s, 0 = sans limite), points, img (identifiant d'image, côté application), opts: [{ id, text }], ans, … }
     t = 'mcq'     choix multiple   opts, ans: [id…] (plusieurs bonnes réponses possibles : multi = true)
         'tf'      vrai / faux      ans: true | false
         'numeric' nombre à taper   ans: nombre, tol: tolérance (± tol), unit: texte affiché après le champ
         'slider'  curseur          min, max, step, ans: nombre, tol: tolérance acceptée (± tol)
         'text'    réponse écrite   ans: [texte accepté…] (majuscules, accents et espaces ignorés)
         'order'   ordre à remettre opts dans le bon ordre ; les participants les reçoivent mélangés
         'match'   association      pairs: [{ id, l, r }] ; les participants relient chaque élément de gauche à un de droite (mélangés)
         'poll'    sondage          opts, aucune bonne réponse (0 point)
         'scale'   échelle          min, max (ex. 1 à 5), lo, hi (libellés des bornes) ; aucune bonne réponse
         'open'    réponse libre    nuage de mots sur l'écran du présentateur ; aucune bonne réponse
         'info'    page             text = titre, body = texte, img ; aucune question (diapositive d'information)
         'cloze'   texte à trous    src : texte où chaque trou s'écrit [[réponse]] ; holes: [{ id, mode, ans, alts, decoys }] dans l'ordre
                                    des trous (mode 'select' = menu déroulant : réponse + leurres ; 'free' = saisie libre : réponse + variantes).
                                    Points au prorata des trous justes (voir fraction()).
         'vote'    vote d'assemblée opts: [{ id, text, color }] ; aucune bonne réponse ; résultat dessiné en hémicycle (hemicycleHTML)
   Réponse d'un participant (v) : mcq / poll / vote → [id…], tf → booléen, numeric / slider / scale → nombre, text / open → chaîne,
   order → [id…], match → { idGauche: idDroite… }, cloze → [texte du trou 1, texte du trou 2…].
   ============================================================ */
'use strict';

window.QuizCore = (() => {
  /* palette des propositions (A, B, C…) : six teintes validées (séparation daltonienne), déclinées clair / sombre */
  const PAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#4a3aa7', '#e87ba4'];
  const PAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#9085e9', '#d55181'];
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const COLORS = PAL_LIGHT;                       // compatibilité (anciens appels)
  const SHAPES = LETTERS;
  const TYPES = {
    mcq: { name: 'Choix multiple', sub: 'Une ou plusieurs bonnes réponses parmi 2 à 6 propositions', ico: '☑', grp: 'q' },
    tf: { name: 'Vrai / Faux', sub: 'Une affirmation, deux boutons', ico: '✓', grp: 'q' },
    numeric: { name: 'Nombre', sub: 'Un nombre à taper, avec une tolérance (date, montant, pourcentage…)', ico: '12', grp: 'q' },
    slider: { name: 'Curseur', sub: 'Une valeur à placer sur une échelle', ico: '⟷', grp: 'q' },
    text: { name: 'Réponse écrite', sub: 'Un mot ou une expression à taper', ico: 'Aa', grp: 'q' },
    order: { name: 'Ordre', sub: 'Des éléments à remettre dans le bon ordre', ico: '⇅', grp: 'q' },
    match: { name: 'Association', sub: 'Relier chaque élément à celui qui lui correspond (notion → définition, date → événement…)', ico: '⇄', grp: 'q' },
    cloze: { name: 'Texte à trous', sub: 'Un texte à compléter : menus déroulants ou mots à taper', ico: '[…]', grp: 'q' },
    poll: { name: 'Sondage', sub: 'Un avis parmi des propositions, sans bonne réponse ni points', ico: '◔', grp: 'p' },
    vote: { name: 'Vote d’assemblée', sub: 'Un vote dessiné en hémicycle : chaque votant devient un siège, la majorité se dessine en direct', ico: '◠', grp: 'p' },
    scale: { name: 'Échelle', sub: 'Une note de 1 à 5 (ou autre) : accord, confiance, difficulté…', ico: '★', grp: 'p' },
    open: { name: 'Nuage de mots', sub: 'Chacun tape un mot ou une idée ; le nuage se forme à l’écran', ico: '☁', grp: 'p' },
    info: { name: 'Page', sub: 'Une diapositive sans question : titre, texte, image — pour présenter, expliquer, faire une pause', ico: '▭', grp: 'i' }
  };
  const GROUPS = [['q', 'Questions notées'], ['p', 'Avis du public'], ['i', 'Pages']];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isScored = q => !!q && !['poll', 'scale', 'open', 'info', 'vote'].includes(q.t);
  const isChoice = q => !!q && (q.t === 'mcq' || q.t === 'poll' || q.t === 'vote');
  const isPage = q => !!q && q.t === 'info';

  /* ---------------- thèmes ----------------
     Thèmes simples (1.25) : fonds unis. Thèmes « signature » (fx) : fond animé dessiné en CSS (quiz.css, sélecteur
     [data-qth="…"] posé sur l'écran de jeu, la page des participants et les aperçus), palette des réponses et typographies
     propres (font : texte courant, head : questions et titres). vars : variables CSS imposées après le calcul
     (surfaces translucides des thèmes en verre : bg / surface restent des couleurs pleines, utilisées pour les mélanges). */
  const THEMES = {
    alixo: { name: 'Alixo', sub: 'Clair, sobre, bleu Alixo', bg: '#f6f7f9', surface: '#ffffff', ink: '#202124', accent: '#33658a', dark: false },
    nuit: { name: 'Nuit', sub: 'Sombre, pour l’amphi', bg: '#141414', surface: '#1f1f1f', ink: '#e8eaed', accent: '#6d95d8', dark: true },
    ocean: { name: 'Océan', sub: 'Bleu profond', bg: '#0f2a3f', surface: '#163a52', ink: '#eef6fb', accent: '#4fb3bf', dark: true },
    foret: { name: 'Forêt', sub: 'Vert, clair', bg: '#eef4ea', surface: '#ffffff', ink: '#1e2a1e', accent: '#2f7d68', dark: false },
    sable: { name: 'Sable', sub: 'Beige chaud, façon papier', bg: '#f4eee3', surface: '#fdfaf3', ink: '#2c251c', accent: '#b3762a', dark: false },
    ardoise: { name: 'Ardoise', sub: 'Gris sombre, accent doré', bg: '#2b2f36', surface: '#363b44', ink: '#eceff3', accent: '#f2b84b', dark: true },
    prune: { name: 'Prune', sub: 'Violet sombre', bg: '#2a1b2e', surface: '#3a2740', ink: '#f6eefa', accent: '#e59ad1', dark: true },
    lavande: { name: 'Lavande', sub: 'Lilas clair', bg: '#f1eefa', surface: '#fcfbff', ink: '#292340', accent: '#7a5ca8', dark: false },
    aurore: { name: 'Aurore', sub: 'Nuit polaire, voiles boréaux animés', fx: 'aurore', bg: '#06141c', surface: '#0e2430', ink: '#ecfbf6', accent: '#5ef2c2', font: 'display', head: 'display',
      pal: ['#3ad6a6', '#ff7a8a', '#6aa8ff', '#ffd166', '#b48cff', '#5fe0ff'],
      vars: { '--qp-surface': 'rgba(10, 34, 44, .62)', '--qp-border': 'rgba(150, 255, 220, .18)', '--qp-hover': 'rgba(94, 242, 194, .10)' } },
    verre: { name: 'Verre', sub: 'Verre dépoli sur fond pastel', fx: 'verre', bg: '#eef0fb', surface: '#ffffff', ink: '#1b1f3b', accent: '#5b4df0', font: 'sans', head: 'display',
      pal: ['#4f6bed', '#f0627a', '#13a890', '#e89a14', '#8b55e8', '#e2559f'],
      vars: { '--qp-surface': 'rgba(255, 255, 255, .55)', '--qp-border': 'rgba(255, 255, 255, .78)', '--qp-hover': 'rgba(255, 255, 255, .72)' } },
    neon: { name: 'Néon', sub: 'Rétro synthwave, soleil couchant et grille', fx: 'neon', bg: '#12052a', surface: '#1d0b3d', ink: '#fff3ff', accent: '#ff3bd4', font: 'display', head: 'retro',
      pal: ['#ff3bd4', '#27e6ff', '#ffe347', '#62ff8a', '#a77bff', '#ff8a3d'],
      vars: { '--qp-surface': 'rgba(32, 10, 66, .72)', '--qp-border': 'rgba(255, 90, 230, .42)', '--qp-hover': 'rgba(255, 59, 212, .14)' } },
    papier: { name: 'Papier', sub: 'Éditorial : papier grainé, typographie sérif', fx: 'papier', bg: '#f3eee3', surface: '#fffdf7', ink: '#1c1a16', accent: '#a5281b', font: 'serif', head: 'editorial',
      pal: ['#1f4e79', '#a5281b', '#2e6b3f', '#9a6a12', '#5b3f8c', '#7a4b2a'] },
    galaxie: { name: 'Galaxie', sub: 'Nébuleuse et étoiles scintillantes', fx: 'galaxie', bg: '#0a0820', surface: '#17133a', ink: '#f3f0ff', accent: '#a18bff', font: 'display', head: 'display',
      pal: ['#7c8bff', '#ff6fa8', '#40d6c4', '#ffc65c', '#c07bff', '#5cc8ff'],
      vars: { '--qp-surface': 'rgba(24, 20, 64, .66)', '--qp-border': 'rgba(190, 175, 255, .2)', '--qp-hover': 'rgba(161, 139, 255, .12)' } },
    mineral: { name: 'Minéral', sub: 'Marbre veiné, teintes de pierres fines', fx: 'mineral', bg: '#e9ece8', surface: '#fbfbf8', ink: '#1d2421', accent: '#0f6b52', font: 'humanist', head: 'humanist',
      pal: ['#1f4fa3', '#c2410c', '#0f7a55', '#a87908', '#7a3fae', '#b8466f'] }
  };
  const hex2rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const lum = h => { const c = hex2rgb(h); if (!c) return 1; const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); if (!x || !y) return a; return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  /* valeurs résolues d'un thème (clé ou objet personnalisé { k: 'custom', bg, surface, ink, accent }) */
  function resolveTheme(th) {
    const base = th && th.k === 'custom' ? Object.assign({}, THEMES.alixo, th) : (THEMES[(th && th.k) || 'alixo'] || THEMES.alixo);
    const sig = th && th.k !== 'custom' && THEMES[th.k] ? THEMES[th.k] : null;
    const bg = hex2rgb(base.bg) ? base.bg : THEMES.alixo.bg;
    const dark = lum(bg) < .3;
    const surface = hex2rgb(base.surface) ? base.surface : (dark ? mix(bg, '#ffffff', .07) : '#ffffff');
    const ink = hex2rgb(base.ink) ? base.ink : (dark ? '#eef0f3' : '#202124');
    const accent = hex2rgb(base.accent) ? base.accent : THEMES.alixo.accent;
    const pal = sig && Array.isArray(sig.pal) ? sig.pal.slice() : (dark ? PAL_DARK : PAL_LIGHT);
    return { k: (th && th.k) || 'alixo', bg, surface, ink, accent, dark, ink2: mix(ink, bg, .4), border: mix(surface, ink, dark ? .18 : .14), accentInk: lum(accent) > .4 ? '#1a1a1a' : '#ffffff', pal,
      font: (th && th.font) || (sig && sig.font) || 'sans', head: (sig && sig.head) || '', fx: (sig && sig.fx) || '', vars: sig && sig.vars ? Object.assign({}, sig.vars) : null };
  }
  const FONTS = { sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif', serif: '"Iowan Old Style", Palatino, Georgia, "Times New Roman", serif', rounded: '"Nunito", "Varela Round", "Trebuchet MS", "Segoe UI", sans-serif', mono: '"SF Mono", ui-monospace, Consolas, monospace',
    display: '"Avenir Next", "Segoe UI Variable Display", "Montserrat", "Futura", "Century Gothic", -apple-system, "Segoe UI", sans-serif',
    humanist: '"Optima", "Candara", "Segoe UI", "Gill Sans", "Noto Sans", -apple-system, sans-serif',
    editorial: '"Didot", "Bodoni 72", "Bodoni MT", "Iowan Old Style", "Playfair Display", Georgia, serif',
    retro: '"Futura", "Avenir Next Condensed", "Trebuchet MS", "Century Gothic", "Segoe UI", sans-serif' };
  const FONT_NAMES = { sans: 'Sans-serif (Alixo)', serif: 'Serif', rounded: 'Arrondie', mono: 'Monospace', display: 'Géométrique', humanist: 'Humaniste', editorial: 'Éditoriale (Didot)' };
  /* style inline (variables CSS) pour l'écran de jeu ou la page des participants */
  function themeStyle(th) {
    const r = th && th.pal ? th : resolveTheme(th);
    const font = FONTS[r.font] || FONTS.sans;
    let css = `--qp-bg:${r.bg};--qp-surface:${r.surface};--qp-border:${r.border};--qp-ink:${r.ink};--qp-ink2:${r.ink2};--qp-accent:${r.accent};--qp-accent-ink:${r.accentInk};--qp-hover:${mix(r.surface, r.ink, .06)};--qp-font:${font};--qp-font-head:${FONTS[r.head] || font};` + (r.pal || PAL_LIGHT).map((c, i) => `--qp-c${i}:${c};`).join('') + `color-scheme:${r.dark ? 'dark' : 'light'};`;
    if (r.vars && typeof r.vars === 'object') for (const [k, v] of Object.entries(r.vars)) if (/^--qp-[a-z0-9-]+$/.test(k) && /^[#(),.%\w\s-]+$/.test(String(v))) css += `${k}:${v};`;
    return css;
  }
  /* effet de fond du thème (attribut data-qth de l'écran) : '' pour les thèmes unis */
  const themeFx = th => { const r = th && th.pal ? th : resolveTheme(th); return r.fx || ''; };

  function newQuestion(t) {
    const q = { id: uid(), t: TYPES[t] ? t : 'mcq', text: '', time: 20, points: 1000 };
    if (q.t === 'mcq' || q.t === 'poll' || q.t === 'order') q.opts = [{ id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }].slice(0, q.t === 'order' ? 3 : 4);
    if (q.t === 'mcq') { q.ans = []; q.multi = false; }
    if (q.t === 'tf') q.ans = true;
    if (q.t === 'numeric') { q.ans = 0; q.tol = 0; q.unit = ''; }
    if (q.t === 'slider') { q.min = 0; q.max = 100; q.step = 1; q.ans = 50; q.tol = 0; }
    if (q.t === 'text') q.ans = [];
    if (q.t === 'match') q.pairs = [{ id: uid(), l: '', r: '' }, { id: uid(), l: '', r: '' }, { id: uid(), l: '', r: '' }];
    if (q.t === 'scale') { q.min = 1; q.max = 5; q.lo = 'Pas du tout'; q.hi = 'Tout à fait'; q.time = 30; }
    if (q.t === 'open') { q.time = 45; }
    if (!isScored(q)) q.points = 0;
    if (q.t === 'info') { q.time = 0; q.body = ''; }
    if (q.t === 'vote') { q.time = 30; q.opts = [['Pour', '#2f9e5a'], ['Abstention', '#9aa0a6'], ['Contre', '#d93a3a']].map(([text, color]) => ({ id: uid(), text, color })); }
    if (q.t === 'cloze') { q.time = 60; q.src = ''; q.holes = []; }
    return q;
  }

  /* ---------------- texte à trous ----------------
     Le texte source s'écrit avec des trous [[réponse]] ; q.holes garde les réglages de chaque trou dans l'ordre du texte.
     syncHoles réaligne les réglages après une modification du texte : un trou garde les siens s'il a la même réponse
     (même s'il a changé de place), sinon il reprend ceux du trou de même rang. */
  const HOLE_RE = /\[\[([^\[\]\n]{1,80}?)\]\]/g;
  function clozeParse(src) {
    const segs = [], answers = [];
    let last = 0, m;
    const str = String(src || '');
    HOLE_RE.lastIndex = 0;
    while ((m = HOLE_RE.exec(str))) {
      const a = m[1].trim(); if (!a) continue;
      segs.push(str.slice(last, m.index)); answers.push(a); last = m.index + m[0].length;
    }
    segs.push(str.slice(last));
    return { segs, answers };
  }
  const newHole = ans => ({ id: uid(), mode: 'free', ans, alts: [], decoys: [] });
  function syncHoles(src, prev) {
    const { answers } = clozeParse(src);
    const old = Array.isArray(prev) ? prev.filter(h => h && typeof h === 'object') : [];
    const used = new Set();
    const out = answers.map(a => { const i = old.findIndex((h, j) => !used.has(j) && norm(h.ans) === norm(a)); if (i >= 0) { used.add(i); return Object.assign({}, old[i], { ans: a }); } return null; });
    out.forEach((h, k) => { if (h) return; const j = !used.has(k) && old[k] ? k : -1; if (j >= 0) { used.add(j); out[k] = Object.assign({}, old[j], { ans: answers[k] }); } else out[k] = newHole(answers[k]); });
    return out.map(h => ({ id: h.id || uid(), mode: h.mode === 'select' ? 'select' : 'free', ans: h.ans, alts: Array.isArray(h.alts) ? h.alts.map(String) : [], decoys: Array.isArray(h.decoys) ? h.decoys.map(String) : [] }));
  }
  /* trous de la question complète (réglages réalignés sur le texte, sans modifier q) */
  const clozeHoles = q => (Array.isArray(q && q.ansHoles) ? q.ansHoles : syncHoles(q && q.src, q && q.holes));
  const decoysOf = h => [...new Set((h.decoys || []).map(x => String(x).trim()).filter(x => x && norm(x) !== norm(h.ans)))];
  const holeMode = h => (h.mode === 'select' && decoysOf(h).length ? 'select' : 'free');
  function holeOk(h, x) {
    const n = norm(x); if (!n || !h) return false;
    return [h.ans, ...(holeMode(h) === 'free' ? (h.alts || []) : [])].some(a => norm(a) === n);
  }
  /* texte lisible (aperçus, recherche) : trous remplacés par « … » ou par leur réponse */
  const clozePlain = (src, fill) => String(src || '').replace(HOLE_RE, (m, a) => (fill ? a.trim() : '…'));
  /* la question telle qu'elle part chez les participants : sans la réponse ; les éléments à ordonner sont mélangés.
     Pour une association, les éléments de droite reçoivent des identifiants neufs : p._key (à ne pas envoyer) les relie aux paires. */
  function publicQuestion(q) {
    const p = { id: q.id, t: q.t, text: q.text || '', time: +q.time || 0, points: +q.points || 0 };
    if (q.opts) p.opts = q.opts.map(o => ({ id: o.id, text: o.text || '' }));
    if (q.t === 'mcq') p.multi = !!q.multi || (Array.isArray(q.ans) && q.ans.length > 1);
    if (q.t === 'slider') { p.min = +q.min || 0; p.max = +q.max || 100; p.step = +q.step || 1; }
    if (q.t === 'numeric') p.unit = q.unit || '';
    if (q.t === 'scale') { p.min = +q.min || 1; p.max = +q.max || 5; p.lo = q.lo || ''; p.hi = q.hi || ''; }
    if (q.t === 'info') { p.body = q.body || ''; p.time = 0; p.points = 0; }
    if (q.t === 'vote') p.opts = (q.opts || []).map((o, i) => ({ id: o.id, text: o.text || '', color: voteColor(o, i) }));
    if (q.t === 'cloze') {
      const { segs } = clozeParse(q.src);
      p.segs = segs;
      p.holes = clozeHoles(q).map(h => holeMode(h) === 'select' ? { mode: 'select', choices: shuffle([h.ans, ...decoysOf(h)]) } : { mode: 'free', len: Math.max(String(h.ans).length, ...(h.alts || []).map(a => String(a).length)) });
    }
    if (q.t === 'order' && p.opts) { shuffle(p.opts); if (q.opts.length > 1 && p.opts.every((o, i) => o.id === q.opts[i].id)) p.opts.reverse(); }
    if (q.t === 'match') {
      const pairs = (q.pairs || []).filter(x => (x.l || '').trim() || (x.r || '').trim());
      p.opts = pairs.map(x => ({ id: x.id, text: x.l || '' }));
      const key = {};
      p.rights = shuffle(pairs.map(x => { const rid = uid(); key[rid] = x.id; return { id: rid, text: x.r || '' }; }));
      Object.defineProperty(p, '_key', { value: key, enumerable: false });
    }
    return p;
  }
  /* version envoyable (sans la clé d'association) */
  const sendable = p => Object.assign({}, p);
  /* vrai / faux / null (sondage, page ou réponse absente). Pour une association, q.rkey = clé { idDroite: idPaire } */
  function check(q, v) {
    if (!q || v === undefined || v === null) return null;
    switch (q.t) {
      case 'mcq': { const a = new Set(Array.isArray(q.ans) ? q.ans : [q.ans].filter(Boolean)); const r = new Set(Array.isArray(v) ? v : [v]); return a.size > 0 && a.size === r.size && [...a].every(x => r.has(x)); }
      case 'tf': return !!v === !!q.ans;
      case 'numeric': case 'slider': return isFinite(+v) && Math.abs((+v) - (+q.ans)) <= (+q.tol || 0) + 1e-9;
      case 'text': { const n = norm(v); return !!n && (Array.isArray(q.ans) ? q.ans : [q.ans]).some(a => norm(a) === n); }
      case 'order': return Array.isArray(v) && Array.isArray(q.opts) && v.length === q.opts.length && v.every((id, i) => id === q.opts[i].id);
      case 'match': {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
        const pairs = (q.pairs || []).filter(x => (x.l || '').trim() || (x.r || '').trim());
        const key = q.rkey || null;
        return pairs.length > 0 && pairs.every(x => { const r = v[x.id]; return r !== undefined && (key ? key[r] === x.id : r === x.id); });
      }
      case 'cloze': { const H = clozeHoles(q); return Array.isArray(v) && H.length > 0 && H.every((h, k) => holeOk(h, v[k])); }
      default: return null;
    }
  }
  /* part de la réponse qui est juste (0 à 1) : proportion des trous justes pour un texte à trous, 0 ou 1 sinon */
  function fraction(q, v) {
    if (!q || v === undefined || v === null) return 0;
    if (q.t === 'cloze') { const H = clozeHoles(q); if (!H.length || !Array.isArray(v)) return 0; return H.filter((h, k) => holeOk(h, v[k])).length / H.length; }
    return check(q, v) ? 1 : 0;
  }
  /* points : la moitié pour la justesse, l'autre moitié fond avec le temps écoulé (el ms).
     ok : booléen, ou part juste (0 à 1, texte à trous) — les points sont alors au prorata */
  function points(q, el, ok) {
    const part = typeof ok === 'number' ? Math.max(0, Math.min(1, ok)) : (ok ? 1 : 0);
    if (!part || !isScored(q)) return 0;
    const base = Math.max(0, +q.points || 0);
    const t = (+q.time || 0) * 1000;
    if (!t) return Math.round(base * part);
    const f = Math.max(0, Math.min(1, (+el || 0) / t));
    return Math.round(base * part * (1 - 0.5 * f));
  }
  /* réponse lisible (écran du présentateur, résultats) */
  function answerText(q, v) {
    if (v === undefined || v === null) return '—';
    const optText = id => { const o = (q.opts || []).find(x => x.id === id); return o ? o.text : '?'; };
    switch (q.t) {
      case 'mcq': case 'poll': case 'vote': return (Array.isArray(v) ? v : [v]).map(optText).join(', ');
      case 'cloze': return (Array.isArray(v) ? v : [v]).map(x => (String(x ?? '').trim() || '…')).join(' · ');
      case 'tf': return v ? 'Vrai' : 'Faux';
      case 'numeric': return String(v) + (q.unit ? ' ' + q.unit : '');
      case 'slider': case 'scale': return String(v);
      case 'text': case 'open': return String(v);
      case 'order': return (Array.isArray(v) ? v : []).map(optText).join(' → ');
      case 'match': { const pairs = q.pairs || []; const rt = id => { if (q.rkey) { const pid = q.rkey[id]; const p = pairs.find(x => x.id === pid); return p ? p.r : '?'; } const p = pairs.find(x => x.id === id); return p ? p.r : '?'; }; return pairs.map(x => `${x.l} → ${v && v[x.id] !== undefined ? rt(v[x.id]) : '?'}`).join(' · '); }
      default: return String(v);
    }
  }
  function correctText(q) {
    switch (q.t) {
      case 'mcq': return answerText(q, q.ans || []);
      case 'tf': return q.ans ? 'Vrai' : 'Faux';
      case 'numeric': return String(q.ans) + (q.unit ? ' ' + q.unit : '') + (q.tol ? ` (± ${q.tol})` : '');
      case 'slider': return String(q.ans) + (q.tol ? ` (± ${q.tol})` : '');
      case 'text': return (Array.isArray(q.ans) ? q.ans : [q.ans]).filter(Boolean).join(' / ');
      case 'order': return (q.opts || []).map(o => o.text).join(' → ');
      case 'match': return (q.pairs || []).filter(x => (x.l || '').trim() || (x.r || '').trim()).map(x => `${x.l} → ${x.r}`).join(' · ');
      case 'cloze': return clozeHoles(q).map(h => h.ans).join(' · ');
      default: return '';
    }
  }
  /* statistiques des réponses reçues (liste de v) pour l'écran du présentateur et les résultats */
  function stats(q, list) {
    const n = list.length;
    if (q.t === 'cloze') {
      const H = clozeHoles(q);
      const holes = H.map((h, k) => { let ok = 0; for (const v of list) if (Array.isArray(v) && holeOk(h, v[k])) ok++; return { ans: h.ans, ok, n }; });
      const frac = n ? list.reduce((s, v) => s + fraction(q, v), 0) / n : 0;
      return { n, holes, frac, ok: list.filter(v => check(q, v)).length };
    }
    if (q.t === 'mcq' || q.t === 'poll' || q.t === 'vote') {
      const c = {}; for (const o of (q.opts || [])) c[o.id] = 0;
      for (const v of list) for (const id of (Array.isArray(v) ? v : [v])) if (id in c) c[id]++;
      return { n, counts: c, ok: q.t === 'mcq' ? list.filter(v => check(q, v)).length : 0 };
    }
    if (q.t === 'tf') { let t = 0; for (const v of list) if (v) t++; return { n, counts: { true: t, false: n - t }, ok: list.filter(v => check(q, v)).length }; }
    if (q.t === 'order' || q.t === 'match') { let ok = 0; for (const v of list) if (check(q, v)) ok++; return { n, counts: { ok, ko: n - ok }, ok }; }
    if (q.t === 'slider' || q.t === 'numeric' || q.t === 'scale') {
      const vals = list.map(Number).filter(x => !isNaN(x)); const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const counts = {}; for (const v of vals) counts[v] = (counts[v] || 0) + 1;
      return { n, values: vals, mean, counts, ok: q.t === 'scale' ? 0 : vals.filter(v => check(q, v)).length };
    }
    if (q.t === 'text' || q.t === 'open') { const c = {}; for (const v of list) { const k = String(v).trim(); if (!k) continue; const kk = q.t === 'open' ? k.toLowerCase() : k; c[kk] = (c[kk] || 0) + 1; } return { n, counts: c, ok: q.t === 'text' ? list.filter(v => check(q, v)).length : 0 }; }
    return { n, ok: 0 };
  }

  /* ---------------- écran du participant : la question et les boutons de réponse ----------------
     o = { done (déjà répondu), v (réponse donnée), reveal (bonne réponse affichée : q complète), big (écran présentateur) } */
  const letter = i => LETTERS[i % LETTERS.length];
  const colorVar = i => `var(--qp-c${i % 6})`;
  function widgetHTML(q, o = {}) {
    const dis = o.done || o.reveal ? ' disabled' : '';
    const given = o.v;
    if (q.t === 'info') return `<div class="qp-infopage">${q.body ? `<div class="qp-pbody">${esc(q.body).replace(/\n/g, '<br>')}</div>` : ''}</div>`;
    if (q.t === 'cloze') return clozeWidget(q, o);
    if (q.t === 'mcq' || q.t === 'poll' || q.t === 'vote') {
      const multi = q.t === 'mcq' && (q.multi || (o.reveal && Array.isArray(q.ans) && q.ans.length > 1));
      const sel = new Set(Array.isArray(given) ? given : []);
      const ans = new Set(o.reveal && Array.isArray(q.ans) ? q.ans : []);
      return `<div class="qp-opts n${(q.opts || []).length}${q.t === 'vote' ? ' qp-voteopts' : ''}">${(q.opts || []).map((op, i) => `<button type="button" class="qp-opt${sel.has(op.id) ? ' sel' : ''}${o.reveal ? (ans.has(op.id) ? ' ok' : (q.t !== 'mcq' ? '' : ' ko')) : ''}" data-opt="${esc(op.id)}" style="--oc:${q.t === 'vote' ? esc(voteColor(op, i)) : colorVar(i)};--i:${i}"${dis}><span class="qp-shape">${letter(i)}</span><span class="qp-otext">${esc(op.text) || '…'}</span>${multi ? '<span class="qp-check"></span>' : ''}</button>`).join('')}</div>${multi && !o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider mes réponses</button>' : ''}`;
    }
    if (q.t === 'tf') {
      const mk = (val, lab, col, sh) => `<button type="button" class="qp-opt qp-tf${given === val ? ' sel' : ''}${o.reveal ? (q.ans === val ? ' ok' : ' ko') : ''}" data-tf="${val ? '1' : '0'}" style="--oc:${col}"${dis}><span class="qp-shape">${sh}</span><span class="qp-otext">${lab}</span></button>`;
      return `<div class="qp-opts n2">${mk(true, 'Vrai', colorVar(2), 'V')}${mk(false, 'Faux', colorVar(1), 'F')}</div>`;
    }
    if (q.t === 'scale') {
      const min = +q.min || 1, max = Math.max(min + 1, +q.max || 5);
      const vals = []; for (let v = min; v <= max; v++) vals.push(v);
      return `<div class="qp-scale"><div class="qp-sbtns">${vals.map((v, i) => `<button type="button" class="qp-opt qp-sbtn${+given === v ? ' sel' : ''}" data-val="${v}" style="--oc:${colorVar(Math.round(i * 5 / Math.max(1, vals.length - 1)))}"${dis}><span class="qp-shape">${v}</span></button>`).join('')}</div><div class="qp-srange"><span>${esc(q.lo || '')}</span><span>${esc(q.hi || '')}</span></div></div>`;
    }
    if (q.t === 'slider') {
      const min = +q.min || 0, max = +q.max || 100, step = +q.step || 1;
      const v = given !== undefined && given !== null ? +given : Math.round((min + max) / 2 / step) * step;
      return `<div class="qp-slider"><div class="qp-sval"><output>${esc(v)}</output></div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${v}"${dis}>
        <div class="qp-srange"><span>${esc(min)}</span><span>${esc(max)}</span></div>
        ${o.reveal ? `<div class="qp-good">Bonne réponse : <b>${esc(correctText(q))}</b></div>` : ''}
        ${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider</button>' : ''}</div>`;
    }
    if (q.t === 'numeric') {
      return `<div class="qp-text qp-num"><div class="qp-numrow"><input type="number" step="any" inputmode="decimal" placeholder="Votre nombre…" autocomplete="off" value="${given !== undefined && given !== null ? esc(given) : ''}"${dis}>${q.unit ? `<span class="qp-unit">${esc(q.unit)}</span>` : ''}</div>
        ${o.reveal ? `<div class="qp-good">Bonne réponse : <b>${esc(correctText(q))}</b></div>` : ''}
        ${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider</button>' : ''}</div>`;
    }
    if (q.t === 'text' || q.t === 'open') {
      return `<div class="qp-text"><input type="text" maxlength="${q.t === 'open' ? 40 : 80}" placeholder="${q.t === 'open' ? 'Un mot, une idée…' : 'Votre réponse…'}" autocomplete="off" autocapitalize="off" value="${esc(given || '')}"${dis}>
        ${o.reveal && q.t === 'text' ? `<div class="qp-good">Bonne réponse : <b>${esc(correctText(q))}</b></div>` : ''}
        ${!o.done && !o.reveal ? `<button type="button" class="qp-send" data-send>${q.t === 'open' ? 'Envoyer' : 'Valider'}</button>` : ''}</div>`;
    }
    if (q.t === 'order') {
      const ids = Array.isArray(given) && given.length ? given : (q.opts || []).map(x => x.id);
      const by = new Map((q.opts || []).map(x => [x.id, x]));
      const items = o.reveal ? (q.opts || []).map(x => x.id) : ids;
      return `<div class="qp-order${o.reveal ? ' reveal' : ''}">${items.map((id, i) => { const op = by.get(id); if (!op) return ''; return `<div class="qp-oitem" data-opt="${esc(id)}"><span class="qp-onum">${i + 1}</span><span class="qp-otext">${esc(op.text) || '…'}</span>${o.done || o.reveal ? '' : `<span class="qp-omv"><button type="button" data-mv="-1" title="Monter"${i === 0 ? ' disabled' : ''}>▲</button><button type="button" data-mv="1" title="Descendre"${i === items.length - 1 ? ' disabled' : ''}>▼</button></span>`}</div>`; }).join('')}
        ${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider cet ordre</button>' : ''}</div>`;
    }
    if (q.t === 'match') {
      if (o.reveal) {
        const pairs = (q.pairs || []).filter(x => (x.l || '').trim() || (x.r || '').trim());
        const mine = given && typeof given === 'object' ? given : null;
        const rt = id => { if (q.rkey) { const p = pairs.find(x => x.id === q.rkey[id]); return p ? p.r : '?'; } const p = pairs.find(x => x.id === id); return p ? p.r : '?'; };
        return `<div class="qp-match reveal">${pairs.map((x, i) => { const good = mine ? (q.rkey ? q.rkey[mine[x.id]] === x.id : mine[x.id] === x.id) : null; return `<div class="qp-mrow${good === true ? ' ok' : good === false ? ' ko' : ''}"><span class="qp-shape" style="--oc:${colorVar(i)}">${letter(i)}</span><span class="qp-ml">${esc(x.l)}</span><span class="qp-marr">→</span><span class="qp-mr">${esc(x.r)}${mine && good === false ? ` <s>${esc(rt(mine[x.id]))}</s>` : ''}</span></div>`; }).join('')}</div>`;
      }
      const lefts = q.opts || [], rights = q.rights || [];
      const mine = given && typeof given === 'object' ? given : {};
      return `<div class="qp-match">${lefts.map((x, i) => `<div class="qp-mrow"><span class="qp-shape" style="--oc:${colorVar(i)}">${letter(i)}</span><span class="qp-ml">${esc(x.text)}</span><span class="qp-marr">→</span><select data-left="${esc(x.id)}"${dis}><option value="">…</option>${rights.map(r => `<option value="${esc(r.id)}" ${mine[x.id] === r.id ? 'selected' : ''}>${esc(r.text)}</option>`).join('')}</select></div>`).join('')}
        ${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider</button>' : ''}</div>`;
    }
    return '';
  }
  /* texte à trous : le texte, avec un menu déroulant ou un champ par trou ; révélé : réponse donnée (barrée si fausse) et bonne réponse.
     o.done sans o.v (écran du présentateur pendant la question) : trous numérotés vides */
  function clozeWidget(q0, o) {
    const q = Array.isArray(q0.segs) ? q0 : Object.assign(publicQuestion(q0), { ansHoles: q0.ansHoles || clozeHoles(q0) });
    const segs = q.segs, ph = Array.isArray(q.holes) ? q.holes : [];
    const H = o.reveal ? (q.ansHoles || null) : null;
    const given = Array.isArray(o.v) ? o.v : [];
    const has = Array.isArray(o.v);
    const field = k => {
      const p = ph[k] || { mode: 'free', len: 6 };
      if (o.reveal) {
        const h = H && H[k], g = String(given[k] ?? '').trim();
        if (!has) return `<span class="qp-hole ok"><span class="qp-hn">${k + 1}</span><b>${esc(h ? h.ans : '?')}</b></span>`;
        const ok = h ? holeOk(h, g) : false;
        return `<span class="qp-hole ${ok ? 'ok' : 'ko'}"><span class="qp-hn">${k + 1}</span>${ok ? `<b>${esc(g)}</b>` : `${g ? `<s>${esc(g)}</s>` : '<span class="qp-hvide">vide</span>'}<b>${esc(h ? h.ans : '?')}</b>`}</span>`;
      }
      if (o.done) return `<span class="qp-hole blank" style="--w:${Math.max(4, Math.min(16, (p.len || (p.choices || []).reduce((m, c) => Math.max(m, c.length), 0) || 6)))}ch"><span class="qp-hn">${k + 1}</span></span>`;
      if (p.mode === 'select') return `<select class="qp-hsel" data-hole="${k}" aria-label="Trou ${k + 1}"><option value="">…</option>${(p.choices || []).map(c => `<option value="${esc(c)}"${given[k] === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
      const w = Math.max(5, Math.min(22, (+p.len || 6) + 2));
      return `<input type="text" class="qp-hin" data-hole="${k}" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:${w}ch" value="${esc(given[k] || '')}" placeholder="${k + 1}" aria-label="Trou ${k + 1}">`;
    };
    const txt = sg => esc(sg).replace(/\n/g, '<br>');
    return `<div class="qp-cloze${o.reveal ? ' reveal' : ''}${o.done && !o.reveal ? ' done' : ''}"><div class="qp-ctext">${segs.map((sg, k) => txt(sg) + (k < segs.length - 1 ? field(k) : '')).join('')}</div>${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider</button>' : ''}</div>`;
  }

  /* ---------------- vote d'assemblée : l'hémicycle ----------------
     Un siège = un votant, jusqu'à HEMI_MAX votants ; au-delà, HEMI_MAX sièges répartis à la proportionnelle (plus forts
     restes) : un hémicycle de 300 sièges reste lisible sur un vidéoprojecteur comme sur un téléphone, alors qu'à 1 000 points
     chaque siège ne serait plus qu'une poussière. Les sièges sont posés sur des arcs concentriques (autant de sièges par arc
     que sa longueur le permet), triés par angle de gauche à droite et attribués aux options dans l'ordre des propositions
     (la première à gauche, comme les groupes d'une assemblée). Le repère vertical au milieu marque la moitié des sièges :
     une option qui le franchit depuis un bord a la majorité absolue. hemiUpdate() met à jour un hémicycle déjà affiché :
     les sièges glissent vers leur nouvelle place et changent de couleur, les nouveaux apparaissent. */
  const VOTE_COLORS = ['#d93a3a', '#e8789a', '#2f9e5a', '#e0a800', '#2f6fd1', '#1f3a68', '#8e5bd0', '#9aa0a6'];
  const voteColor = (o, i) => (o && hex2rgb(o.color) ? o.color : VOTE_COLORS[i % VOTE_COLORS.length]);
  const HEMI_MAX = 300;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const hemiCache = new Map();
  function hemiLayout(n) {
    if (hemiCache.has(n)) return hemiCache.get(n);
    const cx = 100, cy = 100, R = 94;
    const rows = n <= 0 ? 1 : Math.max(1, Math.min(14, Math.round(Math.sqrt(n / 4.2))));
    const rIn = rows === 1 ? R * .78 : R * Math.max(.36, .64 - rows * .024);
    const radii = []; for (let i = 0; i < rows; i++) radii.push(rows === 1 ? R * .78 : rIn + (R - rIn) * i / (rows - 1));
    const tot = radii.reduce((a, b) => a + b, 0);
    const raw = radii.map(r => n * r / tot);
    const per = raw.map(Math.floor);
    let left = n - per.reduce((a, b) => a + b, 0);
    raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { per[i]++; left--; } });
    const gap = rows > 1 ? (R - rIn) / (rows - 1) : 40;
    let sp = Infinity; per.forEach((m, i) => { if (m > 0) sp = Math.min(sp, Math.PI * radii[i] / m); });
    const sr = Math.max(.9, Math.min(5.6, .43 * Math.min(gap, sp)));
    const seats = [];
    per.forEach((m, i) => {
      const r = radii[i]; const a0 = Math.min(Math.PI / 2, (sr * 1.1) / r);
      for (let k = 0; k < m; k++) { const a = m === 1 ? Math.PI / 2 : Math.PI - a0 - (Math.PI - 2 * a0) * k / (m - 1); seats.push({ a, r, x: +(cx + r * Math.cos(a)).toFixed(2), y: +(cy - r * Math.sin(a)).toFixed(2) }); }
    });
    seats.sort((p, q) => q.a - p.a || p.r - q.r);
    const out = { seats, sr: +sr.toFixed(2), rIn: (rows === 1 ? R * .78 : rIn) - sr, R };
    if (hemiCache.size > 80) hemiCache.clear();
    hemiCache.set(n, out);
    return out;
  }
  function hemiData(q, counts) {
    const opts = (q.opts || []).map((o, i) => ({ id: o.id, text: (o.text || '').trim() || 'Proposition ' + letter(i), color: voteColor(o, i), n: Math.max(0, Math.round(+(counts && counts[o.id]) || 0)), seats: 0 }));
    const total = opts.reduce((s, o) => s + o.n, 0);
    let S = total;
    if (total > HEMI_MAX) {
      S = HEMI_MAX;
      const raw = opts.map(o => o.n * S / total);
      opts.forEach((o, i) => { o.seats = Math.floor(raw[i]); });
      let left = S - opts.reduce((s, o) => s + o.seats, 0);
      raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { opts[i].seats++; left--; } });
    } else opts.forEach(o => { o.seats = o.n; });
    const max = Math.max(0, ...opts.map(o => o.n));
    const leaders = opts.filter(o => o.n === max && max > 0);
    const win = leaders.length === 1 ? leaders[0] : null;
    const majV = Math.floor(total / 2) + 1;
    return { opts, total, S, scaled: total > HEMI_MAX, win, winIdx: win ? opts.indexOf(win) : -1, tie: leaders.length > 1, absolute: !!(win && win.n >= majV), majV, majS: Math.floor(S / 2) + 1 };
  }
  const hemiCols = D => { const c = []; D.opts.forEach((o, i) => { for (let k = 0; k < o.seats; k++) c.push(i); }); return c; };
  const pctOf = (n, t) => (t ? Math.round(n / t * 100) : 0);
  function hemiMeta(D) {
    const maj = D.total ? `<line x1="100" y1="-3" x2="100" y2="60"/><text x="100" y="-6">majorité absolue · ${D.scaled ? D.majS + ' sièges' : D.majV + ' voix'}</text>` : '';
    const center = `<text class="qp-hnum" x="100" y="${D.total ? 93 : 90}">${D.total ? D.total.toLocaleString('fr-FR') : '—'}</text><text class="qp-hsub" x="100" y="101.5">${D.total ? (D.total > 1 ? 'votants' : 'votant') : 'en attente des votes'}</text>`;
    return { maj, center };
  }
  function hemiLegend(D, o) {
    const mine = o && o.mine ? (Array.isArray(o.mine) ? o.mine : [o.mine]) : [];
    return D.opts.map((op, i) => `<div class="qp-hl${i === D.winIdx ? ' win' : ''}" style="--hc:${esc(op.color)}"><i></i><span class="qp-hlt">${esc(op.text)}${mine.includes(op.id) ? ' <small>votre vote</small>' : ''}</span><b>${op.n.toLocaleString('fr-FR')}</b><em>${pctOf(op.n, D.total)} %</em><u style="--p:${pctOf(op.n, D.total)}%"></u></div>`).join('');
  }
  function hemiVerdict(D) {
    if (!D.total) return 'Chaque vote ajoute un siège à l’hémicycle.';
    const scale = D.scaled ? ` · 1 siège ≈ ${(Math.round(D.total / D.S * 10) / 10).toLocaleString('fr-FR')} votants` : ' · 1 siège = 1 votant';
    if (D.tie) return `<b>Égalité en tête</b> · aucune majorité${scale}`;
    if (D.absolute) return `<b>« ${esc(D.win.text)} »</b> obtient la majorité absolue : ${D.win.n.toLocaleString('fr-FR')} voix sur ${D.total.toLocaleString('fr-FR')}${scale}`;
    return `<b>« ${esc(D.win.text)} »</b> arrive en tête (majorité relative) · il manque ${(D.majV - D.win.n).toLocaleString('fr-FR')} voix pour la majorité absolue${scale}`;
  }
  const HBAND = 'M2 100A98 98 0 0 1 198 100L166 100A66 66 0 0 0 34 100Z';
  /* o = { final (résultat définitif : l'option en tête ressort), mini (petit format, sans légende détaillée), anim (false : pas d'apparition), mine (vote du participant) } */
  function hemicycleHTML(q, counts, o = {}) {
    const D = hemiData(q, counts); const L = hemiLayout(D.S); const cols = hemiCols(D);
    const anim = o.anim !== false;
    const step = Math.min(0.012, 1.2 / Math.max(1, D.S));
    const seats = L.seats.map((p, i) => `<g class="qp-seat${anim ? ' in' : ''}${cols[i] === D.winIdx ? ' win' : ''}" style="transform:translate(${p.x}px,${p.y}px)"><circle r="${L.sr}" style="fill:${D.opts[cols[i]].color}${anim ? `;animation-delay:${(i * step).toFixed(3)}s` : ''}"/></g>`).join('');
    const m = hemiMeta(D);
    return `<div class="qp-hemi${D.total ? '' : ' empty'}${o.final ? ' final' : ''}${o.mini ? ' mini' : ''}" data-hemi><svg class="qp-hsvg" viewBox="-4 -16 208 122" role="img" aria-label="Hémicycle : ${D.total} votant${D.total > 1 ? 's' : ''}"><path class="qp-hband" d="${HBAND}"/><g class="qp-seats">${seats}</g><g class="qp-hmaj">${m.maj}</g><g class="qp-hcenter">${m.center}</g></svg>
      <div class="qp-hleg">${hemiLegend(D, o)}</div><div class="qp-hverdict">${hemiVerdict(D)}</div></div>`;
  }
  function hemiUpdate(root, q, counts, o = {}) {
    if (!root) return;
    const box = root.matches && root.matches('.qp-hemi') ? root : root.querySelector('.qp-hemi');
    if (!box || !box.querySelector('.qp-seats')) { root.innerHTML = hemicycleHTML(q, counts, o); return; }
    const D = hemiData(q, counts); const L = hemiLayout(D.S); const cols = hemiCols(D);
    const layer = box.querySelector('.qp-seats');
    const gs = [...layer.children];
    L.seats.forEach((p, i) => {
      let g = gs[i];
      const tr = `translate(${p.x}px,${p.y}px)`;
      if (!g) {
        g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'qp-seat in');
        /* un nouveau siège part du centre de l'hémicycle, puis glisse à sa place */
        g.style.transform = 'translate(100px,100px)';
        g.appendChild(document.createElementNS(SVGNS, 'circle'));
        layer.appendChild(g);
        g.getBoundingClientRect();
      }
      g.style.transform = tr;
      const c = g.firstChild; c.setAttribute('r', L.sr); c.style.fill = D.opts[cols[i]].color;
      g.classList.toggle('win', cols[i] === D.winIdx);
    });
    for (let i = L.seats.length; i < gs.length; i++) gs[i].remove();
    const m = hemiMeta(D);
    box.querySelector('.qp-hmaj').innerHTML = m.maj;
    box.querySelector('.qp-hcenter').innerHTML = m.center;
    box.classList.toggle('empty', !D.total); box.classList.toggle('final', !!o.final);
    const leg = box.querySelector('.qp-hleg'); if (leg) leg.innerHTML = hemiLegend(D, o);
    const vd = box.querySelector('.qp-hverdict'); if (vd) vd.innerHTML = hemiVerdict(D);
  }

  /* lit la réponse dans le DOM du widget (root = élément qui contient widgetHTML) */
  function readAnswer(q, root) {
    if (q.t === 'cloze') { const f = [...root.querySelectorAll('[data-hole]')].sort((a, b) => a.dataset.hole - b.dataset.hole).map(x => String(x.value || '').trim()); return f.some(Boolean) ? f : null; }
    if (q.t === 'mcq' || q.t === 'poll' || q.t === 'vote') { const ids = [...root.querySelectorAll('.qp-opt.sel')].map(b => b.dataset.opt); return ids.length ? ids : null; }
    if (q.t === 'tf') { const b = root.querySelector('.qp-tf.sel'); return b ? b.dataset.tf === '1' : null; }
    if (q.t === 'scale') { const b = root.querySelector('.qp-sbtn.sel'); return b ? +b.dataset.val : null; }
    if (q.t === 'slider') { const i = root.querySelector('input[type=range]'); return i ? +i.value : null; }
    if (q.t === 'numeric') { const i = root.querySelector('input[type=number]'); const v = i ? i.value.trim().replace(',', '.') : ''; return v !== '' && isFinite(+v) ? +v : null; }
    if (q.t === 'text' || q.t === 'open') { const i = root.querySelector('input[type=text]'); const v = i ? i.value.trim() : ''; return v || null; }
    if (q.t === 'order') return [...root.querySelectorAll('.qp-oitem')].map(x => x.dataset.opt);
    if (q.t === 'match') { const v = {}; let all = true; root.querySelectorAll('select[data-left]').forEach(s => { if (s.value) v[s.dataset.left] = s.value; else all = false; }); return all && Object.keys(v).length ? v : null; }
    return null;
  }
  /* branche les interactions du widget ; onAnswer(v) est appelé quand la réponse est prête (clic direct ou « Valider ») */
  function bindWidget(q, root, onAnswer) {
    const multi = q.t === 'mcq' && q.multi;
    root.addEventListener('click', e => {
      const opt = e.target.closest('.qp-opt');
      if (opt && !opt.disabled) {
        if (q.t === 'tf') { root.querySelectorAll('.qp-tf').forEach(b => b.classList.toggle('sel', b === opt)); onAnswer(opt.dataset.tf === '1'); return; }
        if (q.t === 'scale') { root.querySelectorAll('.qp-sbtn').forEach(b => b.classList.toggle('sel', b === opt)); onAnswer(+opt.dataset.val); return; }
        if (multi) { opt.classList.toggle('sel'); return; }
        root.querySelectorAll('.qp-opt').forEach(b => b.classList.toggle('sel', b === opt));
        onAnswer([opt.dataset.opt]); return;
      }
      const mv = e.target.closest('[data-mv]');
      if (mv) {
        const it = mv.closest('.qp-oitem'); const list = it.parentElement; const d = +mv.dataset.mv;
        const sib = d < 0 ? it.previousElementSibling : it.nextElementSibling;
        if (sib && sib.classList.contains('qp-oitem')) { if (d < 0) list.insertBefore(it, sib); else list.insertBefore(sib, it); }
        [...list.querySelectorAll('.qp-oitem')].forEach((x, i, arr) => { x.querySelector('.qp-onum').textContent = i + 1; const up = x.querySelector('[data-mv="-1"]'), dn = x.querySelector('[data-mv="1"]'); if (up) up.disabled = i === 0; if (dn) dn.disabled = i === arr.length - 1; });
        return;
      }
      if (e.target.closest('[data-send]')) { const v = readAnswer(q, root); if (v === null || (Array.isArray(v) && !v.length)) { const inp = root.querySelector('input, select'); if (inp) inp.focus(); return; } onAnswer(v); }
    });
    const rg = root.querySelector('input[type=range]'); if (rg) rg.addEventListener('input', () => { const o = root.querySelector('output'); if (o) o.textContent = rg.value; });
    root.querySelectorAll('input[type=text], input[type=number]').forEach(tx => tx.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (q.t === 'cloze') { const all = [...root.querySelectorAll('[data-hole]')]; const i = all.indexOf(tx); if (i >= 0 && i < all.length - 1) { all[i + 1].focus(); return; } }
      const v = readAnswer(q, root); if (v !== null) onAnswer(v);
    }));
    if (q.t === 'cloze') root.querySelectorAll('select[data-hole]').forEach(sl => sl.addEventListener('change', () => { sl.classList.toggle('filled', !!sl.value); }));
  }

  return { COLORS, SHAPES, LETTERS, PAL_LIGHT, PAL_DARK, TYPES, GROUPS, THEMES, FONTS, FONT_NAMES, VOTE_COLORS, HEMI_MAX, esc, uid, norm, shuffle, isScored, isPage, isChoice, resolveTheme, themeStyle, themeFx, newQuestion, publicQuestion, sendable, check, fraction, points, answerText, correctText, stats, widgetHTML, readAnswer, bindWidget, letter,
    clozeParse, syncHoles, clozeHoles, clozePlain, holeOk, holeMode, decoysOf, voteColor, hemiData, hemicycleHTML, hemiUpdate };
})();
