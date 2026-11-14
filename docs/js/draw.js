/* ============================================================
   Alixo — dessin : formes, traits, flèches, zones de texte, main levée.
   1.50 : plus de « page blanche ». Le bouton Dessin ouvre un panneau à droite (#drawpanel) ; on glisse un objet du
   panneau sur le document et il se pose PAR-DESSUS le texte. Chaque objet appartient à un bloc d'ancrage (un bloc
   de texte) : b.fl = [objets], coordonnées relatives au coin haut-gauche du bloc, en unités logiques où 640 = la
   largeur du bloc. L'objet suit donc son paragraphe quand on écrit au-dessus, et voyage avec lui (historique,
   onglets de séance, synchronisation, partage, .alx) sans aucun repositionnement.
   Les anciens blocs { type: 'draw', h, shapes: [...] } restent affichés et modifiables à leur place (même schéma
   d'objet, mêmes gestes, réglages par le panneau) ; seule leur barre d'outils intégrée a disparu, et on n'en crée plus.
   « Hôte » d'un objet : (bloc, genre) avec genre = 'fl' (objets flottants du bloc) ou 'draw' (ancien bloc Dessin).
   Objet : { id, t, stroke, fill, sw, ls (solid|dash|dot), op (opacité 0.1-1), x,y,w,h | x1,y1,x2,y2 | pts,
             text (zone de texte) | label (texte dans une forme), fs, color, bold, ta (left|center|right), border }
   Sécurité : tout objet lu dans un document passe par normShape (liste fermée de types, nombres bornés, couleurs
   strictes, clés inconnues retirées) avant le premier rendu, et les valeurs injectées dans le HTML sont échappées.
   S'appuie sur les globales d'app.js (getBlock, touch, doc, selectObj, objSel, blocksEl, uid, esc, readOnly,
   openPalettePopover, openRightPanel, placeCtxMenu, TEXT_TYPES…).
   ============================================================ */
window.AlixoDraw = (() => {
  'use strict';
  const W = 640;                       // largeur logique : 640 = largeur du bloc
  const FONT = 'Arial, Helvetica, sans-serif';
  const MAX_SHAPES = 300;              // objets par bloc, au plus
  const MAX_PTS = 5000;                // points d'un tracé à main levée, au plus
  const MAX_PTS_BLOCK = 20000;         // points de tracé par bloc, tous tracés confondus
  const MAX_TEXT_BLOCK = 60000;        // caractères de texte par bloc, tous objets confondus
  const MAX_DOC_SHAPES = 3000;         // objets par document (page courante), au plus
  const MAX_LINES = 200;               // lignes de texte rendues par objet, au plus
  const MAX_SIDE = 2000;               // largeur / hauteur d'un objet, au plus (unités logiques)
  const X_MIN = -W, X_MAX = 2 * W, Y_MIN = -200, Y_MAX = 20000;   // bornes des coordonnées
  const I = {
    rect: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>',
    rrect: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="4"/></svg>',
    ellipse: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>',
    triangle: '<svg viewBox="0 0 24 24"><path d="M12 5l8 14H4Z"/></svg>',
    diamond: '<svg viewBox="0 0 24 24"><path d="M12 4l8 8-8 8-8-8Z"/></svg>',
    pentagon: '<svg viewBox="0 0 24 24"><path d="M12 3.5l8.5 6.2-3.2 10H6.7l-3.2-10Z"/></svg>',
    hexagon: '<svg viewBox="0 0 24 24"><path d="M8 5h8l4 7-4 7H8l-4-7Z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7Z"/></svg>',
    para: '<svg viewBox="0 0 24 24"><path d="M8 6h13l-5 12H3Z"/></svg>',
    cylinder: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/></svg>',
    bubble: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H10l-4 4v-4H4Z"/></svg>',
    line: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5M11 5h8v8"/></svg>',
    darrow: '<svg viewBox="0 0 24 24"><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M6 6h12M12 6v13M9 19h6"/></svg>',
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20c3-8 6-11 9-11s1 8 4 8 3-6 3-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    front: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="11" height="11" rx="1.5"/><rect x="9" y="9" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity=".25"/></svg>',
    back: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="1.5"/><rect x="4" y="4" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity=".25"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 12l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 5v13M6 12l6 6 6-6"/></svg>',
    dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    border: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 12h8"/></svg>',
    label: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10h8M12 10v6M10 16h4"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
    stroke: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/></svg>',
    fill: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" fill-opacity=".28"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    taL: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h13"/></svg>',
    taC: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M5.5 18h13"/></svg>',
    taR: '<svg viewBox="0 0 24 24"><path d="M4 6h16M10 12h10M7 18h13"/></svg>',
    solid: '<svg viewBox="0 0 24 24"><path d="M3 12h18"/></svg>',
    dash: '<svg viewBox="0 0 24 24"><path d="M3 12h4M10 12h4M17 12h4"/></svg>',
    dot: '<svg viewBox="0 0 24 24" stroke-dasharray="1 3"><path d="M3 12h18"/></svg>'
  };
  /* les 15 objets du panneau, dans l'ordre d'affichage */
  const OBJECTS = [
    ['rect', 'Rectangle'], ['rrect', 'Rectangle arrondi'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'], ['diamond', 'Losange'],
    ['pentagon', 'Pentagone'], ['hexagon', 'Hexagone'], ['star', 'Étoile'], ['para', 'Parallélogramme'], ['cylinder', 'Cylindre'],
    ['bubble', 'Bulle'], ['line', 'Trait'], ['arrow', 'Flèche'], ['darrow', 'Double flèche'], ['text', 'Zone de texte']
  ];
  const NAMES = Object.assign(Object.fromEntries(OBJECTS), { path: 'Tracé à main levée' });
  const TYPES = Object.keys(NAMES);    // liste fermée des types d'objet
  const POLY_TYPES = ['triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'para'];
  const BOX_TYPES = ['rect', 'rrect', 'ellipse', ...POLY_TYPES, 'cylinder', 'bubble', 'text'];
  const LABEL_TYPES = BOX_TYPES.filter(t => t !== 'text');   // formes qui peuvent porter un texte
  const LINE_TYPES = ['line', 'arrow', 'darrow'];
  const FEM_TYPES = ['ellipse', 'star', 'bubble', 'arrow', 'darrow', 'text'];   // noms féminins (accord des messages)
  const STROKE_QUICK = ['#202124', '#6b6b6b', '#c04343', '#d06a3a', '#b8952e', '#2e8b6a', '#2e8b8b', '#3d6bb5', '#8c4351', '#a8556f', '#ffffff'];
  const FILL_QUICK = ['none', '#ffffff', '#fff3bf', '#ffe8cc', '#ffd8d8', '#ffdeeb', '#d3f9d8', '#c3fae8', '#d0ebff', '#e5dbff', '#e9ecef', '#202124'];
  const COLOR_NAMES = {
    '#202124': 'Noir', '#6b6b6b': 'Gris', '#c04343': 'Rouge', '#d06a3a': 'Orange', '#b8952e': 'Ocre', '#2e8b6a': 'Vert', '#2e8b8b': 'Turquoise',
    '#3d6bb5': 'Bleu', '#8c4351': 'Bordeaux', '#a8556f': 'Rose', '#ffffff': 'Blanc', none: 'Sans remplissage', '#fff3bf': 'Jaune clair',
    '#ffe8cc': 'Orange clair', '#ffd8d8': 'Rouge clair', '#ffdeeb': 'Rose clair', '#d3f9d8': 'Vert clair', '#c3fae8': 'Menthe',
    '#d0ebff': 'Bleu clair', '#e5dbff': 'Violet clair', '#e9ecef': 'Gris clair'
  };
  const WIDTHS = [1, 2, 3, 5, 8];
  const OPACITIES = [1, 0.75, 0.5, 0.25];
  /* réglages par défaut des prochains objets (modifiés par le panneau quand rien n'est sélectionné) */
  const st = { stroke: '#202124', fill: 'none', sw: 2, fs: 16, ls: 'solid', op: 1, bold: false, ta: 'left', border: false };
  let ctx = null;        // sélection courante : { id: bloc hôte, kind: 'fl' | 'draw', sel: id d'objet, drag, textEdit }
  let clip = null;       // dernier objet copié (secours si le presse-papiers système n'est pas lisible)
  let pen = false;       // mode « main levée » actif
  let palDrag = null;    // glisser en cours depuis le panneau : { type, x0, y0, moved, ghost }
  let palClickMute = 0;  // horodatage du dernier glisser : le clic qui le suit sur le bouton est ignoré
  let palMuteNext = false;   // glisser annulé par Échap avant d'avoir bougé : le clic du relâchement n'insère rien

  /* ---------- assainissement : rien de ce qui vient d'un document n'est rendu sans passer ici ---------- */
  const ID_RE = /^[\w-]{1,40}$/;
  const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}(\s*,\s*\d{1,3}){2}(\s*,\s*(0|1|0?\.\d{1,4}))?\s*\))$/i;
  const okColor = (v, def) => (typeof v === 'string' && COLOR_RE.test(v.trim()) ? v.trim() : def);
  const okNum = (v, lo, hi, def) => { v = typeof v === 'number' || typeof v === 'string' ? +v : NaN; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; };
  /* renvoie une copie propre de l'objet, ou null s'il n'est pas affichable ; l'ordre des clés est conservé
     (un objet déjà propre garde exactement le même JSON : pas de fausse « modification » du bloc) */
  /* texte sûr pour le SVG et les exports : sans caractère interdit en XML ni demi-couple UTF-16 isolé */
  const XML_BAD_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
  const PAIR_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;
  const wellFormed = t => t.replace(PAIR_RE, m => (m.length === 2 ? m : ''));   // demi-couple isolé : retiré (toWellFormed() laisserait un « \uFFFD » visible)
  const cleanText = (v, max = 2000) => wellFormed(wellFormed(String(v).replace(XML_BAD_RE, '')).slice(0, max));   // 2e passe : la coupe peut séparer un couple
  /* identifiant de secours stable (même objet, même rang → même identifiant) : un objet sans identifiant valide ne
     change pas de nom à chaque annulation */
  function stableId(s, i) {
    let h = 2166136261, j = '';
    try { j = JSON.stringify(s).slice(0, 4000); } catch { j = ''; }
    j += ':' + i;
    for (let k = 0; k < j.length; k++) { h ^= j.charCodeAt(k); h = Math.imul(h, 16777619); }
    return 'o' + (h >>> 0).toString(36) + '-' + i;
  }
  /* fb (facultatif) : identifiant de secours à donner si celui de l'objet manque ou n'est pas valide */
  function normShape(s, fb) {
    if (!s || typeof s !== 'object' || Array.isArray(s) || typeof s.t !== 'string' || !TYPES.includes(s.t)) return null;
    const newId = () => (typeof fb === 'string' && ID_RE.test(fb) ? fb : uid());
    const o = {};
    for (const k of Object.keys(s)) {
      const v = s[k];
      if (v === undefined || v === null) continue;
      switch (k) {
        case 'id': o.id = typeof v === 'string' && ID_RE.test(v) ? v : newId(); break;
        case 't': o.t = v; break;
        case 'stroke': case 'color': o[k] = okColor(v, '#202124'); break;
        case 'fill': o.fill = v === 'none' ? 'none' : okColor(v, 'none'); break;
        case 'sw': o.sw = okNum(v, 0.5, 20, 2); break;
        case 'ls': if (v === 'solid' || v === 'dash' || v === 'dot') o.ls = v; break;
        case 'op': o.op = okNum(v, 0.1, 1, 1); break;
        case 'x': case 'x1': case 'x2': o[k] = okNum(v, X_MIN, X_MAX, 0); break;
        case 'y': case 'y1': case 'y2': o[k] = okNum(v, Y_MIN, Y_MAX, 0); break;
        case 'w': case 'h': o[k] = okNum(v, 0, MAX_SIDE, 0); break;
        case 'fs': o.fs = okNum(v, 8, 72, 16); break;
        case 'bold': case 'border': if (v === true || v === 1) o[k] = true; break;
        case 'ta': if (v === 'left' || v === 'center' || v === 'right') o.ta = v; break;
        case 'text': case 'label': if (typeof v === 'string' || typeof v === 'number') o[k] = cleanText(v); break;
        case 'pts':
          if (Array.isArray(v)) {
            o.pts = [];
            for (const p of v) {
              if (o.pts.length >= MAX_PTS) break;
              if (Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1]) && p[0] !== null && p[1] !== null) o.pts.push([okNum(p[0], X_MIN, X_MAX, 0), okNum(p[1], Y_MIN, Y_MAX, 0)]);
            }
          }
          break;
        default: break;   // clé inconnue : retirée
      }
    }
    if (!o.id) o.id = newId();
    if (LINE_TYPES.includes(o.t)) { for (const k of ['x1', 'y1', 'x2', 'y2']) if (!(k in o)) o[k] = 0; delete o.pts; }
    else if (o.t === 'path') { if (!o.pts || o.pts.length < 2) return null; }
    else {
      for (const k of ['x', 'y', 'w', 'h']) if (!(k in o)) o[k] = 0;
      delete o.pts;
      if (o.t === 'text' && typeof o.text !== 'string') o.text = '';
    }
    return o;
  }
  /* nettoie une liste d'objets sur place, une seule fois par tableau (un tableau recréé — annulation, synchronisation,
     changement d'onglet — est revérifié) ; identifiants rendus uniques dans la liste */
  const cleanLists = new WeakSet();
  function clean(list) {
    if (cleanLists.has(list)) return list;
    const out = [], ids = new Set();
    let pts = 0, chars = 0, i = 0;
    for (const s of list) {
      if (out.length >= MAX_SHAPES) break;
      const o = normShape(s, stableId(s, i++)); if (!o) continue;
      if (ids.has(o.id)) o.id = uid();
      /* plafonds par bloc : points de tracé et caractères de texte (un bloc piégé ne doit pas geler le rendu) */
      if (o.t === 'path') {
        if (pts + o.pts.length > MAX_PTS_BLOCK) o.pts.length = Math.max(0, MAX_PTS_BLOCK - pts);
        if (o.pts.length < 2) continue;
        pts += o.pts.length;
      }
      for (const k of ['text', 'label']) {
        if (typeof o[k] !== 'string' || !o[k]) continue;
        if (chars + o[k].length > MAX_TEXT_BLOCK) o[k] = cleanText(o[k], Math.max(0, MAX_TEXT_BLOCK - chars));
        chars += o[k].length;
        if (!o[k] && k === 'label') delete o.label;
      }
      ids.add(o.id); out.push(o);
    }
    list.length = 0; for (const o of out) list.push(o);
    cleanLists.add(list);
    return list;
  }
  /* objets d'un ancien bloc Dessin */
  const shapes = b => clean(Array.isArray(b.shapes) ? b.shapes : (b.shapes = []));
  /* objets flottants d'un bloc : lecture seule (null s'il n'y en a pas) / avec création de la liste */
  const floats = b => (b && Array.isArray(b.fl) ? clean(b.fl) : null);
  const flList = b => clean(Array.isArray(b.fl) ? b.fl : (b.fl = []));
  const listOf = (b, kind) => (kind === 'fl' ? flList(b) : shapes(b));
  const qid = id => (window.CSS && CSS.escape ? CSS.escape(String(id)) : String(id).replace(/["\\]/g, '\\$&'));
  const anyBlockEl = id => blocksEl.querySelector(`:scope > .block[data-id="${qid(id)}"]`);
  const blockEl = id => blocksEl.querySelector(`:scope > .block.draw[data-id="${qid(id)}"]`);
  const isRO = () => typeof readOnly !== 'undefined' && !!readOnly;
  const inEditor = () => document.body.classList.contains('mode-editor') && typeof doc === 'function' && !!doc() && Array.isArray(doc().blocks);

  const mctx = document.createElement('canvas').getContext('2d');
  function measure(t, fs, bold) { mctx.font = `${bold ? 'bold ' : ''}${fs}px ${FONT}`; return mctx.measureText(t).width; }
  /* découpe un texte en lignes qui tiennent dans maxW (MAX_LINES lignes au plus). Coût linéaire : chaque mot est
     mesuré une fois et les largeurs s'additionnent (la ligne entière n'est jamais remesurée) ; le résultat est
     mémorisé par (texte, taille, largeur, graisse), car un calque est redessiné à chaque mouvement du pointeur. */
  const wrapMemo = new Map();
  function wrapLines(text, fs, maxW, bold) {
    text = String(text || '');
    const key = `${fs}|${maxW}|${bold ? 1 : 0}|${text}`;
    const hit = wrapMemo.get(key); if (hit) return hit;
    const out = [];
    mctx.font = `${bold ? 'bold ' : ''}${fs}px ${FONT}`;
    const widths = new Map();
    const wOf = w => { let v = widths.get(w); if (v === undefined) { v = mctx.measureText(w).width; widths.set(w, v); } return v; };
    paras: for (const para of text.split('\n')) {
      const words = para.split(/(\s+)/); let line = '', lw = 0;
      for (const w of words) {
        if (!w) continue;
        const ww = wOf(w);
        if (line && !/^\s+$/.test(w) && lw + ww > maxW) {
          out.push(line.replace(/\s+$/, '')); if (out.length >= MAX_LINES) break paras;
          line = w; lw = ww;
        } else { line += w; lw += ww; }
      }
      out.push(line.replace(/\s+$/, '')); if (out.length >= MAX_LINES) break;
    }
    if (wrapMemo.size >= 800) wrapMemo.clear();
    wrapMemo.set(key, out);
    return out;
  }
  const n1 = v => (Math.round(v * 10) / 10).toString();
  const heightOf = b => Math.max(80, Math.min(2000, +b.h || 300));
  const isLine = s => LINE_TYPES.includes(s.t);
  const canLabel = s => LABEL_TYPES.includes(s.t);
  /* encre lisible sur une couleur de fond */
  function inkOn(fill) {
    const m = String(fill || '').match(/^#([0-9a-f]{6})$/i); if (!m) return '#202124';
    const r = parseInt(m[1].slice(0, 2), 16), g = parseInt(m[1].slice(2, 4), 16), b = parseInt(m[1].slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? '#ffffff' : '#202124';
  }

  /* ---------- géométrie ---------- */
  function bbox(s) {
    if (isLine(s)) return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    if (s.t === 'path') {
      let x = Infinity, y = Infinity, X = -Infinity, Y = -Infinity;
      for (const p of s.pts) { if (p[0] < x) x = p[0]; if (p[0] > X) X = p[0]; if (p[1] < y) y = p[1]; if (p[1] > Y) Y = p[1]; }
      return { x, y, w: X - x, h: Y - y };
    }
    return { x: s.x, y: s.y, w: s.w, h: s.h };
  }
  function moveShape(s, dx, dy) {
    if (isLine(s)) { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
    else if (s.t === 'path') s.pts = s.pts.map(p => [p[0] + dx, p[1] + dy]);
    else { s.x += dx; s.y += dy; }
  }
  /* applique une nouvelle boîte englobante (redimensionnement) à partir de la forme d'origine */
  function fitShape(s, o, nb) {
    if (s.t === 'path') {
      const ob = bbox(o), sx = ob.w ? nb.w / ob.w : 1, sy = ob.h ? nb.h / ob.h : 1;
      s.pts = o.pts.map(p => [nb.x + (p[0] - ob.x) * sx, nb.y + (p[1] - ob.y) * sy]);
    } else if (isLine(s)) {
      const ob = bbox(o), sx = ob.w ? nb.w / ob.w : 1, sy = ob.h ? nb.h / ob.h : 1;
      s.x1 = nb.x + (o.x1 - ob.x) * sx; s.y1 = nb.y + (o.y1 - ob.y) * sy; s.x2 = nb.x + (o.x2 - ob.x) * sx; s.y2 = nb.y + (o.y2 - ob.y) * sy;
    } else { s.x = nb.x; s.y = nb.y; s.w = nb.w; s.h = nb.h; }
  }
  /* ancien bloc Dessin : la forme reste dans le cadre ; le dessin s'allonge si besoin */
  function keepInside(s, b) {
    const bb = bbox(s);
    let dx = 0, dy = 0;
    if (bb.x + bb.w > W) dx = W - (bb.x + bb.w); if (bb.x + dx < 0) dx = -bb.x;
    if (bb.y < 0) dy = -bb.y;
    if (dx || dy) moveShape(s, dx, dy);
    const bb2 = bbox(s);
    if (bb2.y + bb2.h > heightOf(b)) b.h = Math.min(2000, Math.ceil(bb2.y + bb2.h + 10));
  }
  function arrowHead(x1, y1, x2, y2, sw) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const L = 9 + sw * 2.4, wd = 4 + sw * 1.4;
    const bx = x2 - L * Math.cos(a), by = y2 - L * Math.sin(a);
    return { base: [bx, by], pts: `${n1(x2)},${n1(y2)} ${n1(bx + wd * Math.sin(a))},${n1(by - wd * Math.cos(a))} ${n1(bx - wd * Math.sin(a))},${n1(by + wd * Math.cos(a))}` };
  }
  /* sommets des polygones inscrits dans la boîte */
  function polyPoints(s) {
    const { x, y, w, h } = s; const cx = x + w / 2, cy = y + h / 2;
    if (s.t === 'triangle') return [[cx, y], [x + w, y + h], [x, y + h]];
    if (s.t === 'diamond') return [[cx, y], [x + w, cy], [cx, y + h], [x, cy]];
    if (s.t === 'pentagon') { const pts = []; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; pts.push([cx + w / 2 * Math.cos(a), cy + h / 2 * Math.sin(a)]); } return pts; }
    if (s.t === 'hexagon') return [[x + w / 4, y], [x + 3 * w / 4, y], [x + w, cy], [x + 3 * w / 4, y + h], [x + w / 4, y + h], [x, cy]];
    if (s.t === 'star') { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1; pts.push([cx + r * w / 2 * Math.cos(a), cy + r * h / 2 * Math.sin(a)]); } return pts; }
    if (s.t === 'para') { const o = Math.min(w * 0.22, h * 0.6); return [[x + o, y], [x + w, y], [x + w - o, y + h], [x, y + h]]; }
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }
  const dashOf = (ls, sw) => ls === 'dash' ? ` stroke-dasharray="${n1(sw * 4)} ${n1(sw * 3)}"` : ls === 'dot' ? ` stroke-dasharray="${n1(Math.max(1, sw))} ${n1(sw * 2.2)}"` : '';
  /* zone utile pour le texte d'une forme */
  function labelBox(s) {
    const { x, y, w, h } = s;
    if (s.t === 'bubble') return { x, y, w, h: h * 0.78 };
    if (s.t === 'triangle') return { x: x + w * 0.2, y: y + h * 0.4, w: w * 0.6, h: h * 0.55 };
    if (s.t === 'diamond') return { x: x + w * 0.2, y: y + h * 0.2, w: w * 0.6, h: h * 0.6 };
    if (s.t === 'ellipse') return { x: x + w * 0.12, y: y + h * 0.14, w: w * 0.76, h: h * 0.72 };
    if (s.t === 'star') return { x: x + w * 0.25, y: y + h * 0.3, w: w * 0.5, h: h * 0.45 };
    if (s.t === 'pentagon') return { x: x + w * 0.15, y: y + h * 0.25, w: w * 0.7, h: h * 0.65 };
    if (s.t === 'cylinder') return { x: x + w * 0.1, y: y + h * 0.2, w: w * 0.8, h: h * 0.65 };
    if (s.t === 'para') return { x: x + w * 0.18, y, w: w * 0.64, h };
    return { x, y, w, h };
  }

  /* ---------- rendu SVG ---------- */
  /* paper : texte écrit directement sur la feuille (objet flottant sans remplissage) — son noir suit le thème */
  function textSVG(text, box, s, align, color, paper) {
    const fs = +s.fs || (s.t === 'text' ? 16 : 14), pad = 6, lh = fs * 1.3;
    const lines = wrapLines(text, fs, Math.max(10, box.w - 2 * pad), s.bold);
    color = okColor(color, '#202124');   // défense en profondeur : jamais de url(…) dans un attribut de couleur
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const tx = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w - pad : box.x + pad;
    const y0 = s.t === 'text' ? box.y + pad + fs * 0.92 : box.y + Math.max(pad, (box.h - lines.length * lh) / 2) + fs * 0.92;
    return `<text${paper ? ' class="fl-ink"' : ''} x="${n1(tx)}" y="${n1(y0)}" font-family="${FONT}" font-size="${n1(fs)}"${s.bold ? ' font-weight="bold"' : ''} fill="${esc(color)}" text-anchor="${anchor}" xml:space="preserve">${lines.map((l, i) => `<tspan x="${n1(tx)}" dy="${i ? n1(lh) : 0}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
  }
  /* edit : l'objet est cliquable (data-sid) ; float : objet posé sur le texte — une forme sans remplissage ne se
     saisit que par son trait (le texte qu'elle entoure reste cliquable), alors que dans un ancien bloc Dessin
     toute sa surface réagit */
  /* hitMin : largeur minimale (unités logiques) de la zone de saisie des traits — plus large au doigt */
  function shapeSVG(s, edit, float, hitMin = 12) {
    const sid = edit ? ` data-sid="${esc(s.id)}"` : '';
    const op = s.op && s.op < 1 ? ` opacity="${n1(okNum(s.op, 0.1, 1, 1))}"` : '';
    /* couleurs revérifiées ici aussi (défense en profondeur : un objet modifié hors de normShape ne peut pas glisser un url(…)) */
    const stroke = esc(okColor(s.stroke, '#202124')), sw = okNum(s.sw, 0.5, 20, 2), fill = s.fill && s.fill !== 'none' ? esc(okColor(s.fill, 'none')) : 'none';
    const fillAttr = fill === 'none' ? (float && s.t !== 'text' ? 'none' : 'rgba(0,0,0,0.001)') : fill;
    const dash = dashOf(s.ls, sw);
    const hit = `stroke="rgba(0,0,0,0.001)" stroke-width="${n1(Math.max(hitMin, sw + 8))}"`;
    const common = `fill="${fillAttr}" stroke="${stroke}" stroke-width="${sw}"${dash}`;
    /* forme fermée : le tracé visible, précédé d'un trait large invisible quand seule la bordure doit réagir */
    const closed = fn => (edit && float && fill === 'none' ? fn(`fill="none" ${hit}`) : '') + fn(common);
    let inner = '';
    switch (s.t) {
      case 'rect': inner = closed(a => `<rect x="${n1(s.x)}" y="${n1(s.y)}" width="${n1(s.w)}" height="${n1(s.h)}" rx="1" ${a}/>`); break;
      case 'rrect': inner = closed(a => `<rect x="${n1(s.x)}" y="${n1(s.y)}" width="${n1(s.w)}" height="${n1(s.h)}" rx="${n1(Math.min(s.w, s.h) * 0.18)}" ${a}/>`); break;
      case 'ellipse': inner = closed(a => `<ellipse cx="${n1(s.x + s.w / 2)}" cy="${n1(s.y + s.h / 2)}" rx="${n1(s.w / 2)}" ry="${n1(s.h / 2)}" ${a}/>`); break;
      case 'triangle': case 'diamond': case 'pentagon': case 'hexagon': case 'star': case 'para': {
        const pts = polyPoints(s).map(p => `${n1(p[0])},${n1(p[1])}`).join(' ');
        inner = closed(a => `<polygon points="${pts}" ${a} stroke-linejoin="round"/>`); break;
      }
      case 'cylinder': {
        const rx = s.w / 2, ry = Math.max(2, Math.min(s.h / 6, s.w / 4));
        inner = closed(a => `<path d="M${n1(s.x)},${n1(s.y + ry)} A${n1(rx)},${n1(ry)} 0 0 0 ${n1(s.x + s.w)},${n1(s.y + ry)} V${n1(s.y + s.h - ry)} A${n1(rx)},${n1(ry)} 0 0 1 ${n1(s.x)},${n1(s.y + s.h - ry)} Z" ${a}/><ellipse cx="${n1(s.x + rx)}" cy="${n1(s.y + ry)}" rx="${n1(rx)}" ry="${n1(ry)}" ${a}/>`); break;
      }
      case 'bubble': {
        const r = Math.max(2, Math.min(10, s.w / 4, s.h / 4)), yb = s.y + s.h * 0.78, x = s.x, y = s.y, w = s.w, h = s.h;
        inner = closed(a => `<path d="M${n1(x + r)},${n1(y)} H${n1(x + w - r)} Q${n1(x + w)},${n1(y)} ${n1(x + w)},${n1(y + r)} V${n1(yb - r)} Q${n1(x + w)},${n1(yb)} ${n1(x + w - r)},${n1(yb)} H${n1(x + w * 0.36)} L${n1(x + w * 0.16)},${n1(y + h)} L${n1(x + w * 0.2)},${n1(yb)} H${n1(x + r)} Q${n1(x)},${n1(yb)} ${n1(x)},${n1(yb - r)} V${n1(y + r)} Q${n1(x)},${n1(y)} ${n1(x + r)},${n1(y)} Z" ${a} stroke-linejoin="round"/>`); break;
      }
      case 'line': inner = `<line x1="${n1(s.x1)}" y1="${n1(s.y1)}" x2="${n1(s.x2)}" y2="${n1(s.y2)}" ${hit}/><line x1="${n1(s.x1)}" y1="${n1(s.y1)}" x2="${n1(s.x2)}" y2="${n1(s.y2)}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash}/>`; break;
      case 'arrow': {
        const h = arrowHead(s.x1, s.y1, s.x2, s.y2, sw);
        inner = `<line x1="${n1(s.x1)}" y1="${n1(s.y1)}" x2="${n1(s.x2)}" y2="${n1(s.y2)}" ${hit}/><line x1="${n1(s.x1)}" y1="${n1(s.y1)}" x2="${n1(h.base[0])}" y2="${n1(h.base[1])}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash}/><polygon class="fl-ink" points="${h.pts}" fill="${stroke}"/>`; break;
      }
      case 'darrow': {
        const h2 = arrowHead(s.x1, s.y1, s.x2, s.y2, sw), h1 = arrowHead(s.x2, s.y2, s.x1, s.y1, sw);
        inner = `<line x1="${n1(s.x1)}" y1="${n1(s.y1)}" x2="${n1(s.x2)}" y2="${n1(s.y2)}" ${hit}/><line x1="${n1(h1.base[0])}" y1="${n1(h1.base[1])}" x2="${n1(h2.base[0])}" y2="${n1(h2.base[1])}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash}/><polygon class="fl-ink" points="${h2.pts}" fill="${stroke}"/><polygon class="fl-ink" points="${h1.pts}" fill="${stroke}"/>`; break;
      }
      case 'path': {
        if (!Array.isArray(s.pts) || s.pts.length < 2) return '';
        const d = 'M' + s.pts.map(p => `${n1(p[0])} ${n1(p[1])}`).join(' L');
        inner = `<path d="${d}" fill="none" ${hit}/><path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`; break;
      }
      case 'text': {
        const box = `<rect x="${n1(s.x)}" y="${n1(s.y)}" width="${n1(s.w)}" height="${n1(s.h)}" rx="2" fill="${fillAttr}" stroke="${s.border ? stroke : 'none'}" stroke-width="${sw}"${dash}/>`;
        inner = box + textSVG(s.text, s, s, s.ta || 'left', okColor(s.color, stroke), float && fill === 'none'); break;
      }
      default: return '';
    }
    if (s.label && canLabel(s)) inner += textSVG(s.label, labelBox(s), s, 'center', okColor(s.color, inkOn(fill)), float && fill === 'none');
    return `<g${sid}${op}>${inner}</g>`;
  }
  const coarse = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  /* échelle d'affichage de l'hôte : pixels d'écran par unité logique (1 si l'hôte n'est pas encore à l'écran) */
  function scaleOf(b, kind) {
    let el = null;
    if (kind === 'draw') { const bl = blockEl(b.id); el = bl ? bl.querySelector('svg.draw-svg') : null; }
    else { const bl = anyBlockEl(b.id); el = bl ? (bl.querySelector(':scope > .fl-layer > svg') || bl) : null; }
    let w = el ? el.getBoundingClientRect().width : 0;
    if (!(w > 0)) w = blocksEl.getBoundingClientRect().width;
    return w > 0 ? w / W : 1;
  }
  /* zone de saisie des traits, en unités logiques : 12 à la souris ; au doigt, 20 px d'écran au moins */
  const hitMinOf = (b, kind) => (coarse() ? Math.min(80, Math.max(12, 20 / scaleOf(b, kind))) : 12);
  /* poignées : k = échelle d'affichage. La poignée visible fait 10 px d'écran à tout zoom ; elle est doublée d'une
     zone de saisie transparente de 24 px (28 au doigt). Pour que l'objet reste saisissable par son contour, cette
     zone déborde vers l'extérieur (6 px seulement vers l'intérieur) et les poignées du milieu d'un côté ne sont
     affichées que si ce côté est assez long ; aux extrémités d'un trait court, la zone se réduit au tiers du trait. */
  function handlesSVG(s, k = 1) {
    k = k > 0 ? k : 1;
    const b = bbox(s);
    const H = 10 / k, full = (coarse() ? 28 : 24) / k;
    const vis = (h, x, y, cur) => `<rect class="dh" data-h="${h}" x="${n1(x - H / 2)}" y="${n1(y - H / 2)}" width="${n1(H)}" height="${n1(H)}" rx="${n1(2 / k)}" style="cursor:${cur}"/>`;
    const zone = (h, x, y, z, cur) => `<rect class="dhz" data-h="${h}" x="${n1(x)}" y="${n1(y)}" width="${n1(z)}" height="${n1(z)}" style="cursor:${cur}"/>`;
    if (isLine(s)) {
      const Z = Math.max(H, Math.min(full, Math.hypot(b.w, b.h) / 3));
      const hd = (h, x, y) => zone(h, x - Z / 2, y - Z / 2, Z, 'move') + vis(h, x, y, 'move');
      return hd('p1', s.x1, s.y1) + hd('p2', s.x2, s.y2);
    }
    const Z = full, inn = Math.min(6 / k, Math.min(b.w, b.h) / 4);   // débord vers l'intérieur de l'objet
    /* dx, dy : -1 = bord gauche / haut, 0 = milieu, 1 = bord droit / bas */
    const hd = (h, dx, dy, cur) => {
      const x = b.x + b.w * (dx + 1) / 2, y = b.y + b.h * (dy + 1) / 2;
      const zx = dx < 0 ? x - (Z - inn) : dx > 0 ? x - inn : x - Z / 2, zy = dy < 0 ? y - (Z - inn) : dy > 0 ? y - inn : y - Z / 2;
      return zone(h, zx, zy, Z, cur) + vis(h, x, y, cur);
    };
    const mid = 2 * Z + 16 / k;   // longueur minimale d'un côté pour porter une poignée en son milieu
    const hs = [`<rect class="dsel" x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}"/>`];
    if (b.w >= mid) hs.push(hd('n', 0, -1, 'ns-resize'), hd('s', 0, 1, 'ns-resize'));
    if (b.h >= mid) hs.push(hd('e', 1, 0, 'ew-resize'), hd('w', -1, 0, 'ew-resize'));
    hs.push(hd('nw', -1, -1, 'nwse-resize'), hd('ne', 1, -1, 'nesw-resize'), hd('se', 1, 1, 'nwse-resize'), hd('sw', -1, 1, 'nesw-resize'));
    return hs.join('');
  }
  const selIn = (b, kind, list) => (ctx && ctx.kind === kind && ctx.id === b.id && ctx.sel ? list.find(s => s.id === ctx.sel) : null);
  /* ancien bloc Dessin — SVG complet ; plain : autonome (export, fond blanc, attributs de taille) */
  function svg(b, { edit = false, plain = false } = {}) {
    const h = heightOf(b), list = shapes(b);
    const live = edit && !isRO();
    const sel = live ? selIn(b, 'draw', list) : null;
    const n = list.length;
    return `<svg class="draw-svg" viewBox="0 0 ${W} ${h}"${plain ? ` xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}"` : ` role="img" aria-label="Dessin : ${n} objet${n > 1 ? 's' : ''}"`} preserveAspectRatio="xMinYMin meet">${plain ? `<rect width="${W}" height="${h}" fill="#fff"/>` : ''}${list.map(s => shapeSVG(s, live, false)).join('')}${sel ? handlesSVG(sel, scaleOf(b, 'draw')) : ''}</svg>`;
  }
  function blockHTML(b, MV) {
    capDoc();
    const empty = !shapes(b).length;
    return `<div class="block draw${empty ? ' empty' : ''}" data-id="${esc(b.id)}" contenteditable="false">${MV || ''}<div class="draw-wrap">${svg(b, { edit: true })}</div><div class="draw-hrz" title="Glisser pour changer la hauteur du dessin" role="separator" aria-label="Hauteur du dessin"></div></div>`;
  }
  function renderCanvas(b) {
    const bl = blockEl(b.id); if (!bl) return;
    const wrap = bl.querySelector('.draw-wrap'); if (!wrap) return;
    const old = wrap.querySelector(':scope > svg');
    if (old) old.outerHTML = svg(b, { edit: true }); else wrap.insertAdjacentHTML('afterbegin', svg(b, { edit: true }));
    bl.classList.toggle('empty', !shapes(b).length);
    updatePanel();
  }

  /* ---------- calque des objets flottants d'un bloc ---------- */
  function layerSVG(b) {
    const list = floats(b) || [];
    const live = !isRO();
    const sel = live ? selIn(b, 'fl', list) : null;
    let bottom = 0;
    for (const s of list) { const bb = bbox(s); bottom = Math.max(bottom, bb.y + bb.h); }
    const H = Math.max(20, Math.min(30000, Math.ceil(bottom + 12)));
    const n = list.length;
    const hitMin = live ? hitMinOf(b, 'fl') : 12;
    return `<svg class="fl-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${n} objet${n > 1 ? 's' : ''} de dessin posé${n > 1 ? 's' : ''} sur le texte">${list.map(s => shapeSVG(s, live, true, hitMin)).join('')}${sel ? handlesSVG(sel, scaleOf(b, 'fl')) : ''}</svg>`;
  }
  /* plafond d'objets par document : vérifié une fois par tableau de blocs (ouverture, annulation, synchronisation,
     changement d'onglet), les objets en trop — en fin de document — ne sont pas gardés */
  const cappedDocs = new WeakSet();
  const countDoc = () => { let n = 0; if (inEditor()) for (const b of doc().blocks) { if (Array.isArray(b.fl)) n += b.fl.length; if (b.type === 'draw' && Array.isArray(b.shapes)) n += b.shapes.length; } return n; };
  function capDoc() {
    const d = typeof doc === 'function' ? doc() : null;
    if (!d || !Array.isArray(d.blocks) || cappedDocs.has(d.blocks)) return;
    cappedDocs.add(d.blocks);
    let n = 0;
    for (const b of d.blocks) {
      if (!b || typeof b !== 'object') continue;
      for (const k of ['fl', 'shapes']) {
        if (!Array.isArray(b[k]) || (k === 'shapes' && b.type !== 'draw')) continue;
        const list = clean(b[k]);
        if (n + list.length > MAX_DOC_SHAPES) list.length = Math.max(0, MAX_DOC_SHAPES - n);
        n += list.length;
        if (k === 'fl' && !list.length) delete b.fl;
      }
    }
  }
  /* le document peut-il recevoir un objet de plus ? (sinon, message) */
  function docRoom() {
    if (countDoc() < MAX_DOC_SHAPES) return true;
    toast(`Ce document contient déjà ${MAX_DOC_SHAPES.toLocaleString('fr-FR')} objets : supprimez-en pour en ajouter.`);
    return false;
  }
  const fullMsg = kind => (kind === 'fl' ? `Ce paragraphe contient déjà ${MAX_SHAPES} objets : posez l’objet sur un autre paragraphe.` : `Ce dessin contient déjà ${MAX_SHAPES} objets.`);
  /* ajouté par renderBlocks à la fin du bloc d'ancrage, comme les notes de correction */
  function layerHTML(b) {
    capDoc();
    const list = floats(b);
    return list && list.length ? `<div class="fl-layer" contenteditable="false">${layerSVG(b)}</div>` : '';
  }
  const layerOf = bl => bl && bl.querySelector(':scope > .fl-layer');
  const editingIn = el => !!(ctx && ctx.textEdit && el && el.contains(ctx.textEdit.ta));
  /* redessine le seul calque d'un bloc (pas de rendu complet du cours) */
  function renderLayer(b) {
    const bl = anyBlockEl(b.id);
    const list = floats(b);
    if (list && !list.length && !(ctx && ctx.drag && ctx.drag.b === b)) delete b.fl;
    if (!bl) { updatePanel(); return; }
    let layer = layerOf(bl);
    if (!list || !list.length) {
      if (layer) { if (editingIn(layer)) { const o = layer.querySelector(':scope > svg'); if (o) o.remove(); } else layer.remove(); }
      updatePanel(); return;
    }
    if (!layer) bl.insertAdjacentHTML('beforeend', layerHTML(b));
    else {
      const old = layer.querySelector(':scope > svg');
      if (old) old.outerHTML = layerSVG(b); else layer.insertAdjacentHTML('afterbegin', layerSVG(b));
    }
    updatePanel();
  }
  const render = (b, kind) => (kind === 'fl' ? renderLayer(b) : renderCanvas(b));
  function rerender(id, kind) { const b = getBlock(id); if (b && (kind === 'fl' || b.type === 'draw')) render(b, kind); }
  /* SVG de l'hôte à l'écran (le calque est créé au besoin : il sert de repère de mesure) */
  function hostSvg(b, kind) {
    if (kind === 'draw') { const bl = blockEl(b.id); return bl ? bl.querySelector('svg.draw-svg') : null; }
    const bl = anyBlockEl(b.id); if (!bl) return null;
    let layer = layerOf(bl);
    if (!layer) { bl.insertAdjacentHTML('beforeend', `<div class="fl-layer" contenteditable="false"><svg class="fl-svg" viewBox="0 0 ${W} 20" preserveAspectRatio="xMinYMin meet"></svg></div>`); layer = layerOf(bl); }
    return layer.querySelector(':scope > svg');
  }
  /* remet les calques d'accord avec le modèle : calque emporté par une opération native du navigateur → réinjecté ;
     calque orphelin ou déplacé → retiré ; blocs dont les objets ont changé hors rendu → redessinés */
  const dirty = new Set();
  let syncQueued = false;
  function syncLayers() {
    syncQueued = false;
    if (!inEditor()) { dirty.clear(); return; }
    const d = doc();
    blocksEl.querySelectorAll('.fl-layer').forEach(l => {
      const p = l.parentElement;
      const ok = p && p.parentElement === blocksEl && p.classList.contains('block') && layerOf(p) === l;
      const b = ok ? getBlock(p.dataset.id) : null;
      if ((!b || !Array.isArray(b.fl) || !b.fl.length) && !editingIn(l)) l.remove();
    });
    let els = null;   // id → élément, construit une seule fois (pas un querySelector par bloc)
    for (const b of d.blocks) {
      if (!Array.isArray(b.fl) || !b.fl.length) continue;
      if (!els) { els = new Map(); for (const el of blocksEl.children) if (el.classList.contains('block') && el.dataset.id) els.set(el.dataset.id, el); }
      const bl = els.get(String(b.id)); if (!bl) continue;
      if (!layerOf(bl) || dirty.has(b.id)) renderLayer(b);
    }
    dirty.clear();
  }
  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(syncLayers);
  }
  /* appelé par touch(), juste avant l'enregistrement dans l'historique, avec les blocs de la photo précédente :
     les objets d'un bloc d'ancrage qui vient de disparaître (suppression, fusion, coupe, sélection remplacée par une
     frappe…) sont rattachés au bloc survivant qui le précédait (à défaut, au suivant) — aucun objet n'est perdu */
  function afterTouch(prev) {
    const d = typeof doc === 'function' ? doc() : null;
    if (!d || !Array.isArray(d.blocks)) return;
    let had = false;
    if (Array.isArray(prev)) for (const pb of prev) if (pb && Array.isArray(pb.fl) && pb.fl.length) { had = true; break; }
    let has = false;
    for (const b of d.blocks) if (Array.isArray(b.fl) && b.fl.length) { has = true; break; }
    if (!had && !has) return;   // cours sans objet : rien à faire (touch() s'exécute à chaque frappe)
    if (had) {
      const cur = new Map(d.blocks.map(b => [b.id, b]));
      const present = new Set();
      for (const b of d.blocks) if (Array.isArray(b.fl)) for (const s of b.fl) if (s && s.id) present.add(s.id);
      for (let i = 0; i < prev.length; i++) {
        const pb = prev[i];
        if (!pb || !Array.isArray(pb.fl) || !pb.fl.length || cur.has(pb.id)) continue;
        const lost = pb.fl.map(normShape).filter(s => s && !present.has(s.id));
        if (!lost.length) continue;
        let target = null, after = false;
        for (let j = i - 1; j >= 0 && !target; j--) if (prev[j] && cur.has(prev[j].id)) { target = cur.get(prev[j].id); after = true; }
        for (let j = i + 1; j < prev.length && !target; j++) if (prev[j] && cur.has(prev[j].id)) target = cur.get(prev[j].id);
        if (!target) target = d.blocks[0];
        if (!target) continue;
        let dy = 0;
        if (after) { const el = anyBlockEl(target.id); const r = el ? el.getBoundingClientRect() : null; if (r && r.width) dy = Math.min(20000, r.height / r.width * W); }
        const list = flList(target);
        for (const s of lost) {
          if (list.length >= MAX_SHAPES) break;
          if (dy) moveShape(s, 0, dy);
          list.push(s); present.add(s.id);
        }
        if (ctx && ctx.kind === 'fl' && ctx.id === pb.id) ctx.id = target.id;
        dirty.add(target.id);
      }
    }
    /* identifiants uniques dans tout le cours (un bloc dupliqué emporte une copie de ses objets) */
    const seen = new Set();
    for (const b of d.blocks) {
      if (!Array.isArray(b.fl)) continue;
      for (const s of b.fl) {
        if (!s || typeof s !== 'object') continue;
        if (seen.has(s.id)) { s.id = uid(); dirty.add(b.id); }
        seen.add(s.id);
      }
    }
    queueSync();
  }
  /* après un rendu complet du cours : la sélection ne vaut que si l'objet existe toujours */
  function afterRender() {
    if (ctx) {
      const te = ctx.textEdit;
      ctx.drag = null; ctx.textEdit = null;
      const b = getBlock(ctx.id);
      if (te && b && !te.label) {   // saisie interrompue par un rendu complet : une zone de texte restée vide n'est pas gardée
        const l = ctx.kind === 'fl' ? floats(b) : (b.type === 'draw' ? shapes(b) : null);
        const i = l ? l.findIndex(x => x.id === te.s.id && x.t === 'text' && !String(x.text || '').trim()) : -1;
        if (i >= 0) { l.splice(i, 1); dirty.add(b.id); queueSync(); if (ctx.kind === 'draw') renderCanvas(b); }
      }
      const list = b ? (ctx.kind === 'fl' ? floats(b) : (b.type === 'draw' ? shapes(b) : null)) : null;
      if (!list) ctx = null;
      else if (ctx.sel && !list.some(s => s.id === ctx.sel)) { if (ctx.kind === 'fl') ctx = null; else ctx.sel = null; }
      else if (ctx.kind === 'fl' && !ctx.sel) ctx = null;
      if (ctx && ctx.kind === 'fl' && !isRO()) blurEditor();   // l'objet reste sélectionné : le clavier reste à lui
    }
    document.body.classList.remove('draw-dragging');
    updatePanel();
  }
  function ensureCtx(id) { if (!ctx || ctx.id !== id || ctx.kind !== 'draw') { commitText(); const p = ctx; ctx = { id, kind: 'draw', sel: null, drag: null, textEdit: null }; if (p && p.kind === 'fl') rerender(p.id, 'fl'); } return ctx; }
  /* l'objet sélectionné et son hôte : { b, kind, list, s } ou null */
  function selShape() {
    if (!ctx || !ctx.sel) return null;
    const b = getBlock(ctx.id); if (!b) return null;
    const list = ctx.kind === 'fl' ? floats(b) : (b.type === 'draw' ? shapes(b) : null);
    const s = list ? list.find(x => x.id === ctx.sel) : null;
    return s ? { b, kind: ctx.kind, list, s } : null;
  }
  function blurEditor() {
    try { getSelection().removeAllRanges(); } catch { /* pas de sélection */ }
    const a = document.activeElement;
    if (a && a !== document.body && (a === blocksEl || blocksEl.contains(a))) a.blur();
  }
  /* sélectionne un objet (sid = null : rien de sélectionné dans cet hôte) */
  function select(b, kind, sid) {
    commitText();
    const p = ctx;
    ctx = { id: b.id, kind, sel: sid, drag: null, textEdit: null };
    if (p && (p.id !== b.id || p.kind !== kind)) rerender(p.id, p.kind);
    if (kind === 'fl') {
      if (typeof objSel !== 'undefined' && objSel) clearObjSel();
      blurEditor();   // ni curseur ni sélection de texte : le clavier s'adresse à l'objet
      /* le panneau montre l'objet sélectionné : il s'ouvre si aucun panneau de droite n'est ouvert (un autre panneau
         ouvert n'est pas remplacé ; sur téléphone, le panneau plein écran cacherait l'objet) */
      if (sid && !isRO() && !document.body.classList.contains('mobile') && !anyRightPanel()) openPanel();
    }
    render(b, kind);
  }
  const anyRightPanel = () => typeof RIGHT_PANELS !== 'undefined' && RIGHT_PANELS.some(q => { const el = document.querySelector(q); return el && !el.hidden; });
  function deselect() {
    if (!ctx) return;
    commitText();
    const p = ctx; if (!p) return;
    if (p.kind === 'fl') ctx = null; else p.sel = null;
    rerender(p.id, p.kind);
    updatePanel();
  }
  /* hôte actif pour le clavier et le presse-papiers : ancien dessin sélectionné comme objet du cours, ou objet
     flottant sélectionné tant que le curseur n'est pas dans un champ */
  function activeHost() {
    if (!ctx || ctx.textEdit || !inEditor() || isRO()) return null;
    const b = getBlock(ctx.id); if (!b) return null;
    if (ctx.kind === 'draw') return typeof objSel !== 'undefined' && objSel === ctx.id && b.type === 'draw' ? { b, kind: 'draw' } : null;
    if (!ctx.sel || !floats(b)) return null;
    const a = document.activeElement;
    if (a && a.closest && a.closest('input, textarea, select, [contenteditable="true"]')) return null;
    return { b, kind: 'fl' };
  }

  /* ---------- coordonnées ---------- */
  function point(svgEl, e) {
    const r = svgEl.getBoundingClientRect();
    const k = W / (r.width || W);
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }
  const clampPt = (p, b) => ({ x: Math.max(0, Math.min(W, p.x)), y: Math.max(0, Math.min(heightOf(b), p.y)) });
  /* un objet flottant reste dans la largeur de son bloc ; sa hauteur est libre */
  function keepInWidth(s) {
    const bb = bbox(s); let dx = 0;
    if (bb.w <= W) { if (bb.x + bb.w > W) dx = W - (bb.x + bb.w); if (bb.x + dx < 0) dx = -bb.x; }
    if (dx) moveShape(s, dx, 0);
  }
  const keep = (s, b, kind) => (kind === 'fl' ? keepInWidth(s) : keepInside(s, b));
  /* coordonnées au dixième d'unité : un JSON lisible, sans décimales de pointeur */
  const r1 = v => Math.round(v * 10) / 10;
  function tidy(s) {
    for (const k of ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2']) if (typeof s[k] === 'number') s[k] = r1(s[k]);
    if (s.t === 'path' && Array.isArray(s.pts)) s.pts = s.pts.map(p => [r1(p[0]), r1(p[1])]);
    return s;
  }
  const isTextBlockEl = el => !!el && typeof TEXT_TYPES !== 'undefined' && TEXT_TYPES.includes((getBlock(el.dataset.id) || {}).type);
  /* blocs visibles du cours, dans l'ordre */
  const visibleBlocks = () => [...blocksEl.children].filter(el => el.classList.contains('block') && el.offsetParent !== null && getBlock(el.dataset.id));
  /* bloc d'ancrage pour un point de l'écran : le bloc sous le point s'il porte du texte, sinon le bloc de texte
     précédent le plus proche, sinon le suivant ; null s'il n'y en a aucun */
  function anchorElAt(y, els) {
    els = els || visibleBlocks();
    if (!els.length) return null;
    let i = 0;
    for (let k = 0; k < els.length; k++) { if (els[k].getBoundingClientRect().top <= y) i = k; else break; }
    for (let k = i; k >= 0; k--) if (isTextBlockEl(els[k])) return els[k];
    for (let k = i + 1; k < els.length; k++) if (isTextBlockEl(els[k])) return els[k];
    return null;
  }
  /* hôte visé par un point de l'écran : l'ancien bloc Dessin s'il est dessous, sinon un bloc d'ancrage (créé en fin
     de cours s'il n'existe aucun bloc de texte) */
  function hostAt(x, y) {
    const els = visibleBlocks();
    for (const el of els) {
      if (!el.classList.contains('draw')) continue;
      const sv = el.querySelector('svg.draw-svg'); const r = sv ? sv.getBoundingClientRect() : null;
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { const b = getBlock(el.dataset.id); if (b && b.type === 'draw') return { b, kind: 'draw' }; }
    }
    const el = anchorElAt(y, els);
    if (el) return { b: getBlock(el.dataset.id), kind: 'fl' };
    return { b: newAnchorAtEnd(), kind: 'fl' };
  }
  function newAnchorAtEnd() {
    const nb = { id: uid(), type: 'p', text: '' };
    doc().blocks.push(nb);
    renderBlocks('__none');
    return nb;
  }
  /* hôte pour une insertion sans pointeur (clic ou Entrée sur un bouton du panneau) : le bloc du curseur */
  function hostAtCaret() {
    const cur = getBlock(currentBlockId());
    if (cur && cur.type === 'draw') return { b: cur, kind: 'draw' };
    const els = visibleBlocks();
    const curEl = cur ? anyBlockEl(cur.id) : null;
    const i = Math.max(0, els.indexOf(curEl));
    let el = null;
    for (let k = i; k >= 0 && !el; k--) if (isTextBlockEl(els[k])) el = els[k];
    for (let k = i + 1; k < els.length && !el; k++) if (isTextBlockEl(els[k])) el = els[k];
    return { b: el ? getBlock(el.dataset.id) : newAnchorAtEnd(), kind: 'fl' };
  }
  /* après un déplacement : si le haut de l'objet est passé dans un autre bloc de texte, l'objet change d'ancre
     (coordonnées converties par les rectangles à l'écran, il ne bouge pas) ; renvoie le bloc d'ancrage final */
  function reanchor(b, s) {
    const sv = hostSvg(b, 'fl'); if (!sv) return b;
    const r = sv.getBoundingClientRect(); if (!r.width) return b;
    const k = r.width / W;
    let bb = bbox(s);
    const top = blocksEl.getBoundingClientRect().top;
    if (r.top + bb.y * k < top) { moveShape(s, 0, (top - r.top) / k - bb.y); bb = bbox(s); }   // pas au-dessus du cours
    const sx = r.left + bb.x * k, sy = r.top + bb.y * k;
    const own = anyBlockEl(b.id);
    const el = anchorElAt(sy + 0.5);
    if (!el || el === own) return b;
    const nb = getBlock(el.dataset.id); if (!nb) return b;
    const sv2 = hostSvg(nb, 'fl'); const r2 = sv2 ? sv2.getBoundingClientRect() : null;
    if (!r2 || !r2.width || flList(nb).length >= MAX_SHAPES) return b;
    const k2 = r2.width / W, f = k / k2;
    const o = JSON.parse(JSON.stringify(s));
    fitShape(s, o, { x: (sx - r2.left) / k2, y: (sy - r2.top) / k2, w: bb.w * f, h: bb.h * f });
    keepInWidth(s);
    const from = flList(b); const i = from.indexOf(s); if (i >= 0) from.splice(i, 1);
    flList(nb).push(s);
    if (ctx && ctx.kind === 'fl' && ctx.id === b.id) ctx.id = nb.id;
    renderLayer(b);
    return nb;
  }

  /* ---------- zone de texte / texte d'une forme : édition en place ----------
     La zone de saisie est placée en pourcentages de la largeur de l'hôte (les marges verticales en % se rapportent
     aussi à la largeur) et sa police en unités de conteneur (cqw) : elle recouvre exactement l'objet quel que soit
     le zoom de la feuille, sans aucun calcul en pixels. */
  function openTextEdit(b, s, label = false, kind = 'draw') {
    commitText();
    if (isRO()) return;
    let holder;
    if (kind === 'fl') { const sv = hostSvg(b, 'fl'); holder = sv ? sv.parentElement : null; }
    else { const bl = blockEl(b.id); holder = bl ? bl.querySelector('.draw-wrap') : null; }
    if (!holder) return;
    if (!ctx || ctx.id !== b.id || ctx.kind !== kind) ctx = { id: b.id, kind, sel: s.id, drag: null, textEdit: null };
    const box = label ? labelBox(s) : s;
    const pc = v => (v / W * 100).toFixed(4) + '%';
    const ta = document.createElement('textarea');
    ta.className = 'draw-textedit' + (label ? ' label' : '');
    ta.value = (label ? s.label : s.text) || '';
    ta.style.left = pc(box.x); ta.style.marginTop = pc(box.y); ta.style.width = pc(Math.max(20, box.w));
    ta.style.aspectRatio = `${Math.max(20, box.w)} / ${Math.max(10, box.h)}`;
    ta.style.setProperty('--fs', String(+s.fs || (label ? 14 : 16)));
    ta.style.fontWeight = s.bold ? '700' : '400';
    const fillC = s.fill && s.fill !== 'none' ? okColor(s.fill, 'none') : 'none';   // couleurs revérifiées (défense en profondeur)
    ta.style.color = okColor(s.color, label ? inkOn(fillC) : okColor(s.stroke, '#202124'));
    ta.style.textAlign = label ? 'center' : (s.ta || 'left');
    ta.style.background = fillC !== 'none' ? fillC : (label ? 'rgba(255,255,255,.92)' : '#fff');
    ta.spellcheck = true; ta.setAttribute('lang', 'fr');
    ta.setAttribute('aria-label', label ? 'Texte de la forme' : 'Zone de texte');
    ta.placeholder = label ? 'Texte de la forme…' : 'Texte…';
    holder.appendChild(ta);
    ctx.textEdit = { b, s, ta, label, kind };
    const grow = () => { ta.style.height = ''; if (ta.scrollHeight > ta.clientHeight + 1) ta.style.height = (ta.scrollHeight + ta.offsetHeight - ta.clientHeight) + 'px'; };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commitText(); return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); commitText(); return; }
      e.stopPropagation();
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (ctx && ctx.textEdit && ctx.textEdit.ta === ta) commitText(); }, 0));
    setTimeout(() => { if (!ta.isConnected) return; ta.focus({ preventScroll: true }); ta.select(); grow(); }, 10);
  }
  function commitText() {
    if (!ctx || !ctx.textEdit) return;
    const { b, s, ta, label, kind } = ctx.textEdit; ctx.textEdit = null;
    const text = cleanText(ta.value.replace(/\s+$/, ''));
    ta.remove();
    const list = listOf(b, kind);
    if (!list.includes(s) || !getBlock(b.id)) { rerender(b.id, kind); return; }   // l'objet a disparu entre-temps (annulation, synchronisation)
    const before = JSON.stringify(s);
    if (label) {
      if (text.trim()) s.label = text; else delete s.label;
    } else {
      const fs = +s.fs || 16, pad = 6;
      if (!text.trim()) {
        list.splice(list.indexOf(s), 1);
        if (ctx.sel === s.id) ctx.sel = null;
      } else {
        s.text = text;
        const lines = wrapLines(text, fs, Math.max(10, s.w - 2 * pad), s.bold);
        s.h = Math.max(s.h, Math.round(lines.length * fs * 1.3 + 2 * pad));
        if (kind === 'draw' && s.y + s.h > heightOf(b)) b.h = Math.ceil(s.y + s.h + 10);
      }
    }
    if (!list.includes(s) || JSON.stringify(s) !== before) touch();
    if (kind === 'fl' && ctx && !ctx.sel) ctx = null;
    render(b, kind);
    if (kind === 'draw' && typeof objSel !== 'undefined' && objSel === b.id) { blocksEl.focus({ preventScroll: true }); selectObj(b.id); }
  }
  /* hauteur d'une zone de texte selon son contenu */
  function refitText(s) {
    if (s.t !== 'text') return;
    const lines = wrapLines(s.text, +s.fs || 16, Math.max(10, s.w - 12), s.bold);
    s.h = Math.max(s.h, Math.round(lines.length * (+s.fs || 16) * 1.3 + 12));
  }
  function editText(cur) {
    if (!cur) return;
    if (cur.s.t === 'text') openTextEdit(cur.b, cur.s, false, cur.kind);
    else if (canLabel(cur.s)) openTextEdit(cur.b, cur.s, true, cur.kind);
  }

  /* ---------- création ---------- */
  function newShape(t) {
    const s = { id: uid(), t, stroke: st.stroke, fill: st.fill, sw: st.sw };
    if (st.ls !== 'solid') s.ls = st.ls;
    if (st.op < 1) s.op = st.op;
    if (LINE_TYPES.includes(t)) return Object.assign(s, { x1: 0, y1: 0, x2: 120, y2: 0 });
    if (t === 'text') {
      Object.assign(s, { x: 0, y: 0, w: 180, h: Math.round(st.fs * 1.3 + 12), fs: st.fs, text: '', color: st.stroke });
      if (st.bold) s.bold = true;
      if (st.ta !== 'left') s.ta = st.ta;
      if (st.border) s.border = true;
      return s;
    }
    return Object.assign(s, { x: 0, y: 0, w: 120, h: t === 'cylinder' ? 90 : 70 });
  }
  /* pose un nouvel objet dans un hôte, centré sur (lx, ly) en unités logiques ; renvoie l'objet ou null */
  function addShape(host, s, lx, ly) {
    const { b, kind } = host;
    const list = listOf(b, kind);
    if (list.length >= MAX_SHAPES) { toast(fullMsg(kind)); queueSync(); return null; }
    if (!docRoom()) { if (kind === 'fl' && !list.length) delete b.fl; queueSync(); return null; }
    const bb = bbox(s);
    moveShape(s, lx - bb.w / 2 - bb.x, Math.max(0, ly - bb.h / 2) - bb.y);
    keep(s, b, kind); tidy(s);
    list.push(s);
    if (kind === 'draw') { ensureCtx(b.id); ctx.sel = s.id; if (typeof objSel === 'undefined' || objSel !== b.id) selectObj(b.id); }
    else { const p = ctx; commitText(); ctx = { id: b.id, kind: 'fl', sel: s.id, drag: null, textEdit: null }; if (p && (p.id !== b.id || p.kind !== 'fl')) rerender(p.id, p.kind); if (typeof objSel !== 'undefined' && objSel) clearObjSel(); blurEditor(); }
    if (s.t === 'text') { render(b, kind); openTextEdit(b, s, false, kind); return s; }   // enregistré à la validation du texte
    touch(); render(b, kind);
    return s;
  }
  /* dépôt au pointeur (glisser depuis le panneau) */
  function dropAt(type, x, y) {
    if (isRO() || !inEditor() || !TYPES.includes(type) || type === 'path') return null;
    const dr = document.querySelector('#doc').getBoundingClientRect();
    if (x < dr.left || x > dr.right || y < dr.top || y > dr.bottom) return null;   // relâché hors de la feuille : rien
    const host = hostAt(x, y); if (!host.b) return null;
    const sv = hostSvg(host.b, host.kind); if (!sv) return null;
    const r = sv.getBoundingClientRect(); const k = (r.width || W) / W;
    return addShape(host, newShape(type), (x - r.left) / k, (y - r.top) / k);
  }
  /* insertion sans pointeur : dans le bloc du curseur, en cascade si la place est prise */
  function insertAtCaret(type) {
    if (isRO() || !inEditor() || !TYPES.includes(type) || type === 'path') return null;
    const host = hostAtCaret(); if (!host.b) return null;
    const s = newShape(type); const bb = bbox(s);
    const list = listOf(host.b, host.kind);
    let cx = W / 2, cy = (host.kind === 'draw' ? 30 : 6) + bb.h / 2, guard = 0;
    while (guard++ < 30 && list.some(o => { const q = bbox(o); return Math.abs(q.x + q.w / 2 - cx) < 2 && Math.abs(q.y + q.h / 2 - cy) < 2; })) { cx += 14; cy += 14; }
    const out = addShape(host, s, cx, cy);
    if (out) { const el = anyBlockEl(host.b.id); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
    return out;
  }

  /* ---------- souris : objets flottants ---------- */
  blocksEl.addEventListener('pointerdown', e => {
    const t = e.target; if (!t.closest || pen) return;
    const layer = t.closest('.fl-layer'); if (!layer || t.closest('.draw-textedit')) return;
    const hitEl = t.closest('[data-sid], [data-h]'); if (!hitEl) return;
    e.preventDefault();           // ni curseur de texte ni sélection sous l'objet (clic droit compris)
    if (e.button !== 0) return;   // clic droit : le menu contextuel s'en charge
    if (isRO()) return;
    const bl = layer.parentElement; const b = bl && getBlock(bl.dataset.id); if (!b) return;
    const list = floats(b); const svgEl = layer.querySelector(':scope > svg'); if (!list || !svgEl) return;
    const p = point(svgEl, e);
    if (hitEl.dataset.h) {
      const cur = selShape();
      if (cur && cur.kind === 'fl' && cur.b === b) { commitText(); ctx.drag = { kind: 'resize', hk: 'fl', b, s: cur.s, h: hitEl.dataset.h, p0: p, o: JSON.parse(JSON.stringify(cur.s)), moved: false }; document.body.classList.add('draw-dragging'); }
      return;
    }
    const s = list.find(x => x.id === hitEl.dataset.sid); if (!s) return;
    let p0 = p;
    if (!ctx || ctx.kind !== 'fl' || ctx.id !== b.id || ctx.sel !== s.id || ctx.textEdit) {
      select(b, 'fl', s.id);
      const sv = hostSvg(b, 'fl'); if (sv) p0 = point(sv, e);   // le panneau a pu s'ouvrir : la feuille a changé de largeur
    } else blurEditor();
    ctx.drag = { kind: 'move', hk: 'fl', b, s, p0, o: JSON.parse(JSON.stringify(s)), moved: false };
    document.body.classList.add('draw-dragging');
  }, true);
  /* les clics sur un objet flottant ne concernent pas les gestionnaires du texte */
  blocksEl.addEventListener('click', e => { if (e.target.closest && e.target.closest('.fl-layer')) e.stopPropagation(); }, true);
  blocksEl.addEventListener('dblclick', e => {
    const t = e.target; if (!t.closest) return;
    const layer = t.closest('.fl-layer'); if (!layer) return;
    e.stopPropagation();
    if (t.closest('.draw-textedit') || isRO()) return;
    const hitEl = t.closest('[data-sid]'); if (!hitEl) return;
    e.preventDefault();
    const b = getBlock(layer.parentElement.dataset.id); const list = b && floats(b);
    const s = list && list.find(x => x.id === hitEl.dataset.sid); if (!s) return;
    if (!ctx || ctx.kind !== 'fl' || ctx.id !== b.id || ctx.sel !== s.id) select(b, 'fl', s.id);
    ctx.drag = null; document.body.classList.remove('draw-dragging');
    editText({ b, kind: 'fl', s });
  }, true);

  /* ---------- souris : anciens blocs Dessin (sélection, déplacement, redimensionnement, hauteur) ---------- */
  blocksEl.addEventListener('pointerdown', e => {
    if (e.button !== 0 || pen) return;
    const bl = e.target.closest('#blocks > .block.draw'); if (!bl) return;
    const id = bl.dataset.id; const b = getBlock(id); if (!b || b.type !== 'draw') return;
    if (e.target.closest('.draw-textedit') || e.target.closest('.fl-layer')) return;
    if (isRO()) return;
    const hrz = e.target.closest('.draw-hrz');
    if (hrz) {
      e.preventDefault(); e.stopPropagation();
      ensureCtx(id); if (objSel !== id) selectObj(id);
      ctx.drag = { kind: 'height', hk: 'draw', b, y0: e.clientY, h0: heightOf(b), k: W / (bl.querySelector('svg').getBoundingClientRect().width || W) };
      document.body.classList.add('draw-dragging');
      return;
    }
    const svgEl = e.target.closest('svg.draw-svg'); if (!svgEl) return;
    e.preventDefault(); e.stopPropagation();
    ensureCtx(id);
    commitText();
    if (objSel !== id) selectObj(id);
    else if (document.activeElement !== blocksEl) blocksEl.focus({ preventScroll: true });   // le clavier (Suppr, flèches) revient au dessin
    const p = clampPt(point(svgEl, e), b);
    const handle = e.target.closest('[data-h]');
    if (handle && ctx.sel) {
      const s = shapes(b).find(x => x.id === ctx.sel);
      if (s) { ctx.drag = { kind: 'resize', hk: 'draw', b, s, h: handle.dataset.h, p0: p, o: JSON.parse(JSON.stringify(s)), moved: false }; return; }
    }
    const hit = e.target.closest('[data-sid]');
    if (hit) {
      const s = shapes(b).find(x => x.id === hit.dataset.sid);
      if (s) { if (ctx.sel !== s.id) { ctx.sel = s.id; renderCanvas(b); } ctx.drag = { kind: 'move', hk: 'draw', b, s, p0: p, o: JSON.parse(JSON.stringify(s)), moved: false }; return; }
    }
    if (ctx.sel) { ctx.sel = null; renderCanvas(b); } else updatePanel();
  });
  document.addEventListener('pointermove', e => {
    if (palDrag) { palMove(e); return; }
    if (!ctx || !ctx.drag) return;
    const d = ctx.drag, b = d.b, fl = d.hk === 'fl';
    if (d.kind === 'height') {
      b.h = Math.max(80, Math.min(2000, Math.round(d.h0 + (e.clientY - d.y0) * d.k)));
      renderCanvas(b); return;
    }
    const svgEl = hostSvg(b, d.hk); if (!svgEl) return;
    const raw = point(svgEl, e);
    const p = fl ? raw : clampPt(raw, b);
    if (d.kind === 'pen') {
      const s = d.s, last = s.pts[s.pts.length - 1];
      const q = fl ? { x: Math.max(0, Math.min(W, p.x)), y: p.y } : p;
      if (s.pts.length < MAX_PTS && Math.hypot(q.x - last[0], q.y - last[1]) > 1.5) { s.pts.push([Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]); render(b, d.hk); }
      return;
    }
    const dx = p.x - d.p0.x, dy = p.y - d.p0.y;
    if (d.kind === 'move') {
      if (!d.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      d.moved = true;
      const s = d.s, o = d.o;
      if (isLine(s)) { s.x1 = o.x1 + dx; s.y1 = o.y1 + dy; s.x2 = o.x2 + dx; s.y2 = o.y2 + dy; }
      else if (s.t === 'path') s.pts = o.pts.map(q => [q[0] + dx, q[1] + dy]);
      else { s.x = o.x + dx; s.y = o.y + dy; }
      if (fl) keepInWidth(s);
      render(b, d.hk); return;
    }
    if (d.kind === 'resize') {
      const s = d.s, o = d.o, k = d.h;
      d.moved = true;
      const px = fl ? Math.max(0, Math.min(W, p.x)) : p.x;
      if (k === 'p1') { s.x1 = px; s.y1 = p.y; if (e.shiftKey) snap45(s, 'p1'); }
      else if (k === 'p2') { s.x2 = px; s.y2 = p.y; if (e.shiftKey) snap45(s, 'p2'); }
      else {
        const ob = bbox(o), ddx = px - d.p0.x;
        let x0 = ob.x, y0 = ob.y, x1 = ob.x + ob.w, y1 = ob.y + ob.h;
        if (k.includes('w')) x0 = Math.min(x1 - 6, ob.x + ddx);
        if (k.includes('e')) x1 = Math.max(x0 + 6, ob.x + ob.w + ddx);
        if (k.includes('n')) y0 = Math.min(y1 - 6, ob.y + dy);
        if (k.includes('s')) y1 = Math.max(y0 + 6, ob.y + ob.h + dy);
        // Maj sur un coin : proportions d'origine conservées
        if (e.shiftKey && k.length === 2 && ob.w > 0 && ob.h > 0) {
          const ratio = ob.w / ob.h; let w = x1 - x0, h = y1 - y0;
          if (w / h > ratio) w = h * ratio; else h = w / ratio;
          if (k.includes('w')) x0 = x1 - w; else x1 = x0 + w;
          if (k.includes('n')) y0 = y1 - h; else y1 = y0 + h;
        }
        fitShape(s, o, { x: x0, y: y0, w: Math.min(MAX_SIDE, x1 - x0), h: Math.min(MAX_SIDE, y1 - y0) });
      }
      render(b, d.hk);
    }
  });
  function snap45(s, which) {
    const ax = which === 'p2' ? s.x1 : s.x2, ay = which === 'p2' ? s.y1 : s.y2;
    const px = which === 'p2' ? s.x2 : s.x1, py = which === 'p2' ? s.y2 : s.y1;
    const a = Math.round(Math.atan2(py - ay, px - ax) / (Math.PI / 4)) * (Math.PI / 4);
    const L = Math.hypot(px - ax, py - ay);
    const nx = ax + L * Math.cos(a), ny = ay + L * Math.sin(a);
    if (which === 'p2') { s.x2 = nx; s.y2 = ny; } else { s.x1 = nx; s.y1 = ny; }
  }
  function endDrag(cancel) {
    if (palDrag) { palEnd(null); return; }
    if (!ctx || !ctx.drag) return;
    const d = ctx.drag; ctx.drag = null;
    document.body.classList.remove('draw-dragging');
    const b = d.b, fl = d.hk === 'fl';
    if (!getBlock(b.id)) return;
    if (d.kind === 'height') { touch(); return; }
    if (d.kind === 'pen') {
      const list = listOf(b, d.hk);
      if (d.s.pts.length < 2 || cancel) { const i = list.indexOf(d.s); if (i >= 0) list.splice(i, 1); render(b, d.hk); return; }
      if (!fl) keepInside(d.s, b);
      touch(); render(b, d.hk); return;
    }
    if (!d.moved) return;
    if (d.kind === 'move' && fl) { const nb = reanchor(b, d.s); tidy(d.s); touch(); renderLayer(nb); return; }
    if (d.kind === 'resize' && d.s.t === 'text') refitText(d.s);
    tidy(d.s); touch(); render(b, d.hk);
  }
  document.addEventListener('pointerup', e => { if (palDrag) palEnd(e); else endDrag(false); if (palMuteNext) setTimeout(() => { palMuteNext = false; }, 0); });
  document.addEventListener('pointercancel', () => endDrag(true));
  /* double-clic dans un ancien bloc Dessin : zone de texte → modifier le texte ; forme → texte dans la forme ; ailleurs → nouvelle zone de texte */
  blocksEl.addEventListener('dblclick', e => {
    const bl = e.target.closest('#blocks > .block.draw'); if (!bl || isRO()) return;
    const svgEl = e.target.closest('svg.draw-svg'); if (!svgEl) return;
    e.preventDefault();
    const b = getBlock(bl.dataset.id); if (!b || b.type !== 'draw') return;
    ensureCtx(b.id);
    const hit = e.target.closest('[data-sid]');
    const s = hit && shapes(b).find(x => x.id === hit.dataset.sid);
    if (s && (s.t === 'text' || canLabel(s))) { ctx.sel = s.id; renderCanvas(b); editText({ b, kind: 'draw', s }); return; }
    if (!s) {
      const p = clampPt(point(svgEl, e), b);
      const ns = newShape('text'); ns.fill = 'none';
      addShape({ b, kind: 'draw' }, ns, p.x + ns.w / 2, p.y + ns.h / 2);
    }
  });

  /* ---------- main levée : tracer directement sur le document ---------- */
  function setPen(on) {
    on = !!on && !isRO() && inEditor();
    if (pen === on) { updatePanel(); return; }
    pen = on;
    document.body.classList.toggle('fl-pen', pen);
    if (pen) { deselect(); toast('Main levée : tracez sur le document — Échap pour terminer'); }
    updatePanel();
  }
  document.addEventListener('pointerdown', e => {
    if (!pen || e.button !== 0) return;
    const t = e.target; if (!t.closest || !t.closest('#doc')) return;
    e.preventDefault(); e.stopPropagation();
    if (isRO() || !inEditor()) { setPen(false); return; }
    commitText();
    const host = hostAt(e.clientX, e.clientY); if (!host.b) return;
    const list = listOf(host.b, host.kind);
    if (list.length >= MAX_SHAPES) { toast(fullMsg(host.kind)); return; }
    if (!docRoom()) { if (host.kind === 'fl' && !list.length) delete host.b.fl; return; }
    const sv = hostSvg(host.b, host.kind); if (!sv) return;
    const raw = point(sv, e); const p = host.kind === 'fl' ? raw : clampPt(raw, host.b);
    const s = { id: uid(), t: 'path', stroke: st.stroke, fill: 'none', sw: st.sw, pts: [[Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]] };
    if (st.ls !== 'solid') s.ls = st.ls;
    if (st.op < 1) s.op = st.op;
    list.push(s);
    const prev = ctx;
    ctx = { id: host.b.id, kind: host.kind, sel: null, drag: { kind: 'pen', hk: host.kind, b: host.b, s }, textEdit: null };
    if (prev && prev.sel && (prev.id !== ctx.id || prev.kind !== ctx.kind)) rerender(prev.id, prev.kind);
    document.body.classList.add('draw-dragging');
  }, true);

  /* ---------- actions sur l'objet sélectionné ---------- */
  function deleteShape(b, s, kind) {
    const list = listOf(b, kind); const i = list.indexOf(s); if (i < 0) return;
    list.splice(i, 1);
    if (kind === 'fl') ctx = null; else if (ctx) ctx.sel = null;
    touch(); render(b, kind);
  }
  function duplicate(b, s, kind) {
    const list = listOf(b, kind);
    if (list.length >= MAX_SHAPES) { toast(fullMsg(kind)); return; }
    if (!docRoom()) return;
    const copy = normShape(JSON.parse(JSON.stringify(s))); if (!copy) return;
    copy.id = uid(); moveShape(copy, 14, 14); keep(copy, b, kind);
    list.push(copy); ctx.sel = copy.id; touch(); render(b, kind);
  }
  /* ordre : 'front' | 'back' | 'up' | 'down' (entre objets du même hôte) */
  function reorder(cur, how) {
    const { list, s } = cur; const i = list.indexOf(s); if (i < 0) return;
    const j = how === 'front' ? list.length - 1 : how === 'back' ? 0 : how === 'up' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
    if (j === i) return;
    list.splice(i, 1); list.splice(j, 0, s);
    touch(); render(cur.b, cur.kind);
  }
  /* tous les objets du cours, dans l'ordre de lecture (navigation au clavier) */
  function allObjects() {
    const out = [];
    if (!inEditor()) return out;
    for (const b of doc().blocks) {
      if (b.type === 'draw') for (const s of shapes(b)) out.push({ b, kind: 'draw', s });
      const fl = floats(b); if (fl) for (const s of fl) out.push({ b, kind: 'fl', s });
    }
    return out;
  }
  function selectStep(dir) {
    const all = allObjects(); if (!all.length) return;
    let i = all.findIndex(o => ctx && o.b.id === ctx.id && o.kind === ctx.kind && o.s.id === ctx.sel);
    i = i < 0 ? (dir > 0 ? 0 : all.length - 1) : (i + dir + all.length) % all.length;
    const o = all[i];
    if (o.kind === 'draw') { ensureCtx(o.b.id); ctx.sel = o.s.id; if (typeof objSel === 'undefined' || objSel !== o.b.id) selectObj(o.b.id); renderCanvas(o.b); }
    else select(o.b, 'fl', o.s.id);
    const sv = hostSvg(o.b, o.kind); const g = sv ? [...sv.querySelectorAll('[data-sid]')].find(x => x.dataset.sid === o.s.id) : null;
    const el = g || anyBlockEl(o.b.id);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /* ---------- panneau de droite ---------- */
  const btn = (attrs, tip, inner, pressed, cls = '') => `<button type="button" class="dp-btn${cls ? ' ' + cls : ''}" ${attrs} title="${esc(tip)}" aria-label="${esc(tip)}"${pressed === undefined ? '' : ' aria-pressed="false"'}>${inner}</button>`;
  /* la pastille « Noir » du trait suit le thème (classe ink) : en thème sombre, ce noir est rendu clair sur la feuille */
  const swatchBtn = (attr, c) => { const ink = attr === 'data-dqs' && c === '#202124'; return btn(`${attr}="${c}"`, ink ? 'Noir (clair en thème sombre)' : (COLOR_NAMES[c] || c), `<span class="dp-sw${c === 'none' ? ' none' : ''}${ink ? ' ink' : ''}"${c === 'none' ? '' : ` style="background:${c}"`}></span>`, false, 'dp-swb'); };
  /* « Autres couleurs… » : pastille arc-en-ciel ; elle porte la couleur courante quand celle-ci n'est pas dans la liste rapide */
  const moreBtn = (which, tip) => btn(`data-dc="${which}"`, tip, '<span class="dp-sw more"></span>', false, 'dp-swb dp-more');
  const isMobile = () => document.body.classList.contains('mobile');
  const pct = v => `${Math.round(v * 100)}\u00a0%`;
  function panelHTML() {
    const help = isMobile()
      ? 'Touchez un objet pour l’ajouter à l’endroit du curseur. Il se pose par-dessus le texte\u00a0: sautez des lignes pour lui faire de la place.'
      : 'Glissez un objet sur le document, ou cliquez pour l’insérer au curseur. Il se pose par-dessus le texte\u00a0: sautez des lignes pour lui faire de la place. Une forme sans remplissage se saisit par son contour.';
    return `<p class="dp-help">${help}</p>
      <div class="dp-state"><span class="dp-state-txt" id="dp-state" role="status" aria-live="polite"></span>${btn('data-dnav="-1"', 'Objet précédent (Maj+Tab)', I.prev)}${btn('data-dnav="1"', 'Objet suivant (Tab)', I.next)}</div>
      <div class="mp-sect" id="dp-h-obj">Objets</div>
      <div class="dp-objs" role="group" aria-labelledby="dp-h-obj">${OBJECTS.map(([k, name]) => `<button type="button" class="dp-obj" data-dobj="${k}" title="${esc(name)} — glisser sur le document (un clic l’insère à la position du curseur)" aria-label="${esc(name)}">${I[k]}<span class="dp-obj-n" aria-hidden="true">${esc(name)}</span></button>`).join('')}</div>
      <button type="button" class="dp-wide" data-dpen aria-pressed="false" title="Main levée : tracez directement sur le document. Tant que ce mode est actif, le texte sous le pointeur n’est pas modifiable — Échap pour terminer">${I.pen}<span>Main levée</span></button>
      <div class="mp-sect" id="dp-h-stroke">Trait</div>
      <div class="dp-row dp-sws" role="group" aria-label="Couleur du trait et du texte">${STROKE_QUICK.map(c => swatchBtn('data-dqs', c)).join('')}${moreBtn('stroke', 'Autres couleurs de trait…')}</div>
      <div class="dp-row"><span class="dp-seg" role="group" aria-label="Épaisseur du trait">${WIDTHS.map(w => btn(`data-dsw="${w}"`, `Épaisseur ${w} px`, `<i style="height:${w}px"></i>`, false)).join('')}</span><span class="dp-seg" role="group" aria-label="Style du trait">${[['solid', 'Trait plein'], ['dash', 'Tirets'], ['dot', 'Pointillés']].map(([k, tip]) => btn(`data-dls="${k}"`, tip, I[k], false)).join('')}</span></div>
      <div class="mp-sect" id="dp-h-fill">Remplissage</div>
      <div class="dp-row dp-sws" role="group" aria-label="Couleur de remplissage">${FILL_QUICK.map(c => swatchBtn('data-dqf', c)).join('')}${moreBtn('fill', 'Autres couleurs de remplissage…')}</div>
      <p class="dp-help dp-fillhint" hidden>Un remplissage opaque cache le texte situé dessous\u00a0: baissez l’opacité pour le laisser voir.</p>
      <div class="mp-sect" id="dp-h-op">Opacité</div>
      <div class="dp-row"><span class="dp-seg dp-grow" role="group" aria-labelledby="dp-h-op">${OPACITIES.map(v => btn(`data-dop="${v}"`, `Opacité ${pct(v)}`, pct(v), false, 'dp-txt')).join('')}</span></div>
      <div class="mp-sect" id="dp-h-text">Texte</div>
      <div class="dp-row"><span class="dp-seg" role="group" aria-label="Taille et graisse du texte">${btn('data-dfs="-"', 'Texte plus petit', 'A−', undefined, 'dp-txt')}<span class="dp-fs" aria-live="polite" title="Taille du texte"></span>${btn('data-dfs="+"', 'Texte plus grand', 'A+', undefined, 'dp-txt')}${btn('data-dbold', 'Gras', '<b>G</b>', false, 'dp-txt')}</span><span class="dp-seg" role="group" aria-label="Alignement de la zone de texte">${[['left', 'Texte à gauche', I.taL], ['center', 'Texte centré', I.taC], ['right', 'Texte à droite', I.taR]].map(([k, tip, ico]) => btn(`data-dta="${k}"`, tip, ico, false)).join('')}</span><span class="dp-seg" role="group" aria-label="Cadre">${btn('data-dborder', 'Cadre autour de la zone de texte', I.border, false)}</span></div>
      <button type="button" class="dp-wide" data-dlabel title="Modifier le texte de l’objet (Entrée ou double-clic sur l’objet)">${I.label}<span>Modifier le texte</span></button>
      <div class="mp-sect" id="dp-h-z">Ordre</div>
      <div class="dp-row"><span class="dp-seg" role="group" aria-labelledby="dp-h-z">${btn('data-dz="up"', 'Avancer d’un niveau', I.up)}${btn('data-dz="down"', 'Reculer d’un niveau', I.down)}${btn('data-dz="front"', 'Mettre au premier plan', I.front)}${btn('data-dz="back"', 'Mettre à l’arrière-plan', I.back)}</span></div>
      <div class="dp-actions"><button type="button" class="dp-wide" data-ddup title="Dupliquer l’objet (Ctrl+D)">${I.dup}<span>Dupliquer</span></button><button type="button" class="dp-wide danger" data-ddel title="Supprimer l’objet (Suppr)">${I.trash}<span>Supprimer</span></button></div>
      <p class="dp-help dp-keys">Flèches\u00a0: déplacer (Maj\u00a0: par 10) · Alt+flèches\u00a0: taille · Entrée\u00a0: texte · Suppr\u00a0: supprimer · Ctrl+D\u00a0: dupliquer · Tab\u00a0: objet suivant · Échap\u00a0: désélectionner · Clic droit\u00a0: menu</p>`;
  }
  const panelOpen = () => { const p = document.querySelector('#drawpanel'); return !!p && !p.hidden; };
  function updatePanel() {
    const body = document.querySelector('#draw-body'); if (!body || !panelOpen()) return;
    if (!body.firstElementChild) body.innerHTML = panelHTML();
    const ro = isRO();
    const cur = ro ? null : selShape(); const sel = cur ? cur.s : null;
    const v = {
      stroke: sel ? ((sel.t === 'text' ? (sel.color || sel.stroke) : sel.stroke) || '#202124') : st.stroke,
      fill: sel ? (sel.fill || 'none') : st.fill, sw: sel ? (+sel.sw || 2) : st.sw, ls: sel ? (sel.ls || 'solid') : st.ls,
      op: sel ? (sel.op || 1) : st.op, bold: sel ? !!sel.bold : st.bold, ta: sel ? (sel.ta || 'left') : st.ta, border: sel ? !!sel.border : st.border
    };
    const stateEl = body.querySelector('#dp-state');
    const label = ro ? 'Lecture seule : les objets ne sont pas modifiables' : pen ? 'Main levée : tracez sur le document' : sel ? `Objet sélectionné : ${NAMES[sel.t] || 'Objet'}` : 'Réglages des prochains objets (repris du dernier objet modifié)';
    if (stateEl.textContent !== label) stateEl.textContent = label;
    body.classList.toggle('has-sel', !!sel);
    const setOn = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
    const hasText = !sel || sel.t === 'text' || canLabel(sel), isText = !sel || sel.t === 'text', noFill = !!sel && (isLine(sel) || sel.t === 'path');
    const n = ro ? 0 : allObjects().length;
    const zi = cur ? cur.list.indexOf(cur.s) : -1, zn = cur ? cur.list.length : 0;   // rang de l'objet dans son hôte
    /* couleur hors de la liste rapide : c'est la pastille « Autres couleurs » qui la porte */
    const more = (x, c, quick) => { const on = !quick.some(q => same(q, c)); setOn(x, on); const sw = x.querySelector('.dp-sw'); if (sw) sw.style.background = on ? okColor(c, '') : ''; };
    const fsEl = body.querySelector('.dp-fs');
    if (fsEl) { const t = String(sel && (sel.t === 'text' || canLabel(sel)) ? (+sel.fs || (sel.t === 'text' ? 16 : 14)) : st.fs); if (fsEl.textContent !== t) fsEl.textContent = t; fsEl.classList.toggle('off', ro || !(!sel || sel.t === 'text' || canLabel(sel))); }
    const hint = body.querySelector('.dp-fillhint');
    if (hint) hint.hidden = ro || noFill || v.fill === 'none' || v.op < 0.995;
    body.querySelectorAll('button').forEach(x => {
      const ds = x.dataset; let off = ro;
      if (ds.dsw) setOn(x, +ds.dsw === v.sw);
      else if (ds.dqs) setOn(x, same(ds.dqs, v.stroke));
      else if (ds.dqf) { setOn(x, same(ds.dqf, v.fill)); off = off || noFill; }
      else if (ds.dc === 'fill') { more(x, v.fill, FILL_QUICK); off = off || noFill; }
      else if (ds.dc) more(x, v.stroke, STROKE_QUICK);
      else if (ds.dls) setOn(x, ds.dls === v.ls);
      else if (ds.dop) setOn(x, Math.abs(+ds.dop - v.op) < 0.01);
      else if (ds.dta) { setOn(x, ds.dta === v.ta); off = off || !isText; }
      else if (ds.dfs) off = off || !hasText;
      else if ('dbold' in ds) { setOn(x, v.bold && hasText); off = off || !hasText; }
      else if ('dborder' in ds) { setOn(x, v.border && isText); off = off || !isText; }
      else if ('dlabel' in ds) off = off || !(sel && (sel.t === 'text' || canLabel(sel)));
      else if (ds.dz) off = off || !sel || ((ds.dz === 'up' || ds.dz === 'front') ? zi >= zn - 1 : zi <= 0);   // inactifs aux extrémités, comme dans le menu
      else if ('ddup' in ds || 'ddel' in ds) off = off || !sel;
      else if (ds.dnav) off = off || !n;
      else if ('dpen' in ds) setOn(x, pen);
      if (x.disabled !== off) x.disabled = off;
    });
  }
  function openPanel() {
    if (typeof openRightPanel === 'function') openRightPanel('#drawpanel');
    updatePanel();
  }
  /* applique un réglage à l'objet sélectionné (sinon seuls les réglages par défaut changent) */
  function apply(fn) {
    const cur = selShape();
    if (cur) { const before = JSON.stringify(cur.s); fn(cur.s); if (JSON.stringify(cur.s) !== before) touch(); render(cur.b, cur.kind); }
    else updatePanel();
  }
  const setStroke = c => { c = okColor(c, '#202124'); st.stroke = c; apply(s => { s.stroke = c; if (s.t === 'text') s.color = c; }); };
  const setFill = c => { c = c === 'none' ? 'none' : okColor(c, 'none'); st.fill = c; apply(s => { if (!isLine(s) && s.t !== 'path') s.fill = c; }); };
  function pickColor(which, rect) {
    const cur = selShape(); const sel = cur ? cur.s : null;
    const current = which === 'fill' ? (sel ? sel.fill || 'none' : st.fill) : (sel ? (sel.t === 'text' ? sel.color || sel.stroke : sel.stroke) || '#202124' : st.stroke);
    openPalettePopover(rect, {
      title: which === 'fill' ? 'Remplissage' : 'Couleur du trait', none: which === 'fill' ? 'Aucun remplissage' : 'Noir',
      quick: which === 'fill' ? FILL_QUICK.filter(c => c !== 'none') : STROKE_QUICK, current,
      onPick: c => { if (which === 'fill') setFill(c); else setStroke(c === 'none' ? '#202124' : c); }
    });
  }
  function panelClick(btnEl) {
    if (isRO() || btnEl.disabled) return;
    const ds = btnEl.dataset;
    const cur = selShape(); const sel = cur ? cur.s : null;
    if (ds.dobj) {
      if (pen) setPen(false);
      const s = insertAtCaret(ds.dobj);
      /* téléphone : le panneau plein écran cacherait l'objet tout juste posé */
      if (s && isMobile()) {
        if (typeof closeRightPanels === 'function') closeRightPanels();
        const el = ctx ? anyBlockEl(ctx.id) : null;
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });   // au milieu de l'écran : ni sous la barre d'outils, ni sous le message
        const fem = FEM_TYPES.includes(s.t);
        toast(`${NAMES[s.t] || 'Objet'} ajouté${fem ? 'e' : ''} — touchez-l${fem ? 'a' : 'e'} pour l${fem ? 'a' : 'e'} déplacer`);
      }
      return;
    }
    if ('dpen' in ds) { setPen(!pen); return; }
    if (ds.dnav) { selectStep(+ds.dnav < 0 ? -1 : 1); return; }
    if (ds.dqs) { setStroke(ds.dqs); return; }
    if (ds.dqf) { setFill(ds.dqf); return; }
    if (ds.dc) { pickColor(ds.dc === 'fill' ? 'fill' : 'stroke', btnEl.getBoundingClientRect()); return; }
    if (ds.dsw) { const w = okNum(ds.dsw, 0.5, 20, 2); st.sw = w; apply(s => { s.sw = w; }); return; }
    if (ds.dls) { const ls = ds.dls === 'dash' || ds.dls === 'dot' ? ds.dls : 'solid'; st.ls = ls; apply(s => { if (ls === 'solid') delete s.ls; else s.ls = ls; }); return; }
    if (ds.dop) { const op = okNum(ds.dop, 0.1, 1, 1); st.op = op; apply(s => { if (op >= 1) delete s.op; else s.op = op; }); return; }
    if (ds.dfs) {
      const next = fs => Math.max(8, Math.min(72, fs + (ds.dfs === '+' ? 2 : -2)));
      if (sel) apply(s => { if (s.t !== 'text' && !canLabel(s)) return; s.fs = next(+s.fs || (s.t === 'text' ? 16 : 14)); if (s.t === 'text') { st.fs = s.fs; refitText(s); } });
      else { st.fs = next(st.fs); updatePanel(); }   // la taille s'affiche entre « A− » et « A+ »
      return;
    }
    if ('dbold' in ds) {
      if (sel) apply(s => { if (s.t !== 'text' && !canLabel(s)) return; if (s.bold) delete s.bold; else s.bold = true; if (s.t === 'text') { st.bold = !!s.bold; refitText(s); } });
      else { st.bold = !st.bold; updatePanel(); }
      return;
    }
    if (ds.dta) { const ta = ds.dta === 'center' || ds.dta === 'right' ? ds.dta : 'left'; st.ta = ta; apply(s => { if (s.t !== 'text') return; if (ta === 'left') delete s.ta; else s.ta = ta; }); return; }
    if ('dborder' in ds) {
      if (sel) apply(s => { if (s.t !== 'text') return; if (s.border) delete s.border; else s.border = true; st.border = !!s.border; });
      else { st.border = !st.border; updatePanel(); }
      return;
    }
    if (!cur) return;
    if ('dlabel' in ds) { editText(cur); return; }
    if (ds.dz) { reorder(cur, ds.dz); return; }
    if ('ddup' in ds) { duplicate(cur.b, cur.s, cur.kind); return; }
    if ('ddel' in ds) { deleteShape(cur.b, cur.s, cur.kind); }
  }
  /* glisser un objet du panneau : un fantôme suit le pointeur ; relâché sur la feuille, l'objet est posé */
  function palMove(e) {
    const d = palDrag; if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.moved = true;
      const s = newShape(d.type); if (s.t === 'text') s.text = 'Texte';
      const bb = bbox(s), pad = 8;
      const br = blocksEl.getBoundingClientRect(); const k = (br.width || W) / W;
      const g = document.createElement('div'); g.id = 'fl-ghost'; g.setAttribute('aria-hidden', 'true');
      g.innerHTML = `<svg viewBox="${n1(bb.x - pad)} ${n1(bb.y - pad)} ${n1(bb.w + 2 * pad)} ${n1(bb.h + 2 * pad)}" width="${n1((bb.w + 2 * pad) * k)}" height="${n1((bb.h + 2 * pad) * k)}">${shapeSVG(s, false, true)}</svg>`;
      document.body.appendChild(g); d.ghost = g;
      document.body.classList.add('draw-dragging', 'fl-dropping');
    }
    const okHere = overSheet(e.clientX, e.clientY);
    d.ghost.classList.toggle('ok', okHere);
    document.body.classList.toggle('fl-ok', okHere);   // hors de la feuille : curseur « dépôt impossible »
    d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
  }
  /* le point est-il sur la feuille, hors du panneau ? (elementFromPoint : au doigt, la cible de l'événement reste le bouton) */
  function overSheet(x, y) {
    const r = document.querySelector('#doc').getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
    const el = document.elementFromPoint(x, y);
    return !(el && el.closest && el.closest('#drawpanel, #toolbar, #topbar, #tabbar'));
  }
  /* e = null : glisser abandonné (pointeur annulé, Échap) ; mute : le clic qui suivra le relâchement est ignoré */
  function palEnd(e, mute) {
    const d = palDrag; if (!d) return;
    palDrag = null;
    if (d.ghost) d.ghost.remove();
    document.body.classList.remove('draw-dragging', 'fl-dropping', 'fl-ok');
    if (mute) palMuteNext = true;
    if (!d.moved) return;   // simple clic : l'événement click insère l'objet au curseur
    palClickMute = Date.now();
    if (!e || !overSheet(e.clientX, e.clientY)) return;
    dropAt(d.type, e.clientX, e.clientY);
  }
  const dpBody = document.querySelector('#draw-body');
  if (dpBody) {
    dpBody.addEventListener('pointerdown', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (e.pointerType === 'mouse' || b.dataset.dobj) e.preventDefault();   // la sélection et le curseur du cours restent en place
      palMuteNext = false;
      if (e.button !== 0 || b.disabled || !b.dataset.dobj || isRO()) return;
      palDrag = { type: b.dataset.dobj, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
    });
    dpBody.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.dobj && (palMuteNext || Date.now() - palClickMute < 400)) { palMuteNext = false; return; }   // fin d'un glisser (ou glisser annulé) : pas d'insertion en plus
      panelClick(b);
    });
  }
  /* le mode main levée s'arrête quand le panneau se ferme (bouton, autre panneau, retour à l'accueil) */
  const dpEl = document.querySelector('#drawpanel');
  if (dpEl && window.MutationObserver) {
    new MutationObserver(() => {
      const open = !dpEl.hidden;
      if (!open && pen) setPen(false);
      const tb = document.querySelector('#toolbar [data-act="draw"]');
      if (tb) { tb.classList.toggle('on', open); tb.setAttribute('aria-pressed', open ? 'true' : 'false'); }
      if (open) updatePanel();
    }).observe(dpEl, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ---------- clic droit sur un objet ---------- */
  blocksEl.addEventListener('contextmenu', e => {
    const t = e.target; if (!t.closest) return;
    const hit = t.closest('.fl-svg [data-sid], .draw-svg [data-sid], .fl-svg [data-h], .draw-svg [data-h]');   // une poignée vaut pour l'objet sélectionné
    if (!hit) { if (t.closest('.fl-layer') && !t.closest('.draw-textedit')) { e.preventDefault(); e.stopPropagation(); } return; }
    e.preventDefault(); e.stopPropagation();   // ni le menu « Citation », ni celui des tableaux, ni celui du navigateur
    if (isRO() || pen) return;
    const kind = hit.closest('.fl-svg') ? 'fl' : 'draw';
    const bl = hit.closest('#blocks > .block'); const b = bl && getBlock(bl.dataset.id); if (!b) return;
    const list = kind === 'fl' ? floats(b) : (b.type === 'draw' ? shapes(b) : null);
    const sid = hit.dataset.sid || (ctx && ctx.kind === kind && ctx.id === b.id ? ctx.sel : null);
    const s = list && sid ? list.find(x => x.id === sid) : null; if (!s) return;
    if (kind === 'draw') { ensureCtx(b.id); ctx.sel = s.id; if (objSel !== b.id) selectObj(b.id); renderCanvas(b); }
    else if (!ctx || ctx.kind !== 'fl' || ctx.id !== b.id || ctx.sel !== s.id) select(b, 'fl', s.id);
    else blurEditor();
    const canText = s.t === 'text' || canLabel(s), canFill = !isLine(s) && s.t !== 'path';
    const i = list.indexOf(s);
    const menu = document.querySelector('#ctxmenu');
    menu.innerHTML = `<div class="cm-title">${esc(NAMES[s.t] || 'Objet')}</div>
      <button data-cm="flopen">${I.settings}Modifier dans le panneau Dessin</button>
      <button data-cm="flstroke">${I.stroke}Couleur du trait…</button>
      ${canFill ? `<button data-cm="flfill">${I.fill}Remplissage…</button>` : ''}
      ${canText ? `<button data-cm="fltext">${I.label}Modifier le texte</button>` : ''}
      <div class="cm-sep"></div>
      <button data-cm="flup"${i >= list.length - 1 ? ' disabled' : ''}>${I.up}Avancer d’un niveau</button>
      <button data-cm="fldown"${i <= 0 ? ' disabled' : ''}>${I.down}Reculer d’un niveau</button>
      <div class="cm-sep"></div>
      <button data-cm="fldup">${I.dup}Dupliquer</button>
      <button data-cm="fldel" class="danger">${I.trash}Supprimer</button>`;
    for (const k of ['fid', 'did', 'tbl', 'img', 'root', 'tab', 'page', 'dref', 'quote', 'cfid']) menu.dataset[k] = '';
    menu.dataset.fl = '1';
    menu.classList.remove('cm-create'); menu.removeAttribute('role');
    placeCtxMenu(menu, e.clientX, e.clientY);
  }, true);
  const cmEl = document.querySelector('#ctxmenu');
  if (cmEl) cmEl.addEventListener('click', e => {
    const b = e.target.closest('[data-cm]'); if (!b) return;
    const cm = b.dataset.cm || '';
    if (!cm.startsWith('fl') || cmEl.dataset.fl !== '1') return;
    cmEl.dataset.fl = '';
    closeCtxMenu();
    if (b.disabled || isRO()) return;
    const cur = selShape(); if (!cur) return;
    const sv = hostSvg(cur.b, cur.kind); const g = sv ? [...sv.querySelectorAll('[data-sid]')].find(x => x.dataset.sid === cur.s.id) : null;
    const r = g ? g.getBoundingClientRect() : { left: e.clientX, top: e.clientY, bottom: e.clientY };
    if (cm === 'flopen') { openPanel(); if (dpBody) dpBody.scrollTop = 0; }   // l'en-tête « Objet sélectionné » est en haut
    else if (cm === 'flstroke') pickColor('stroke', { left: r.left, top: r.top, bottom: r.bottom });
    else if (cm === 'flfill') pickColor('fill', { left: r.left, top: r.top, bottom: r.bottom });
    else if (cm === 'fltext') editText(cur);
    else if (cm === 'flup') reorder(cur, 'up');
    else if (cm === 'fldown') reorder(cur, 'down');
    else if (cm === 'fldup') duplicate(cur.b, cur.s, cur.kind);
    else if (cm === 'fldel') deleteShape(cur.b, cur.s, cur.kind);
  });

  /* ---------- presse-papiers : un objet voyage d'un endroit à l'autre par son propre Ctrl+C ---------- */
  const clipText = s => (s.t === 'text' ? (s.text || '') : (s.label || ''));
  function pasteShape(b, json, kind = 'draw') {
    let s = null; try { s = normShape(JSON.parse(json)); } catch { s = null; }
    if (!s || isRO()) return false;
    s.id = uid();
    const list = listOf(b, kind);
    if (list.length >= MAX_SHAPES) { toast(fullMsg(kind)); return false; }
    if (!docRoom()) { if (!list.length && kind === 'fl') delete b.fl; return false; }
    // même endroit qu'un objet existant (collage au même endroit) : décalé pour rester visible
    let guard = 0;
    while (guard++ < 40 && list.some(x => { const o = bbox(x), q = bbox(s); return Math.abs(o.x - q.x) < 1 && Math.abs(o.y - q.y) < 1; }) && (kind === 'fl' || bbox(s).y < heightOf(b) - 20)) moveShape(s, 14, 14);
    keep(s, b, kind); tidy(s);
    list.push(s);
    if (kind === 'draw') { ensureCtx(b.id); ctx.sel = s.id; }
    else { const p = ctx; ctx = { id: b.id, kind: 'fl', sel: s.id, drag: null, textEdit: null }; if (p && (p.id !== b.id || p.kind !== 'fl')) rerender(p.id, p.kind); if (typeof objSel !== 'undefined' && objSel) clearObjSel(); blurEditor(); }
    touch(); render(b, kind);
    if (kind === 'draw' && objSel !== b.id) selectObj(b.id);
    return true;
  }
  function onCopy(e, cut) {
    const h = activeHost(); if (!h || !ctx.sel) return;
    const cur = selShape(); if (!cur) return;
    clip = JSON.stringify(cur.s);
    try { e.clipboardData.setData('text/x-alixo-shape', clip); e.clipboardData.setData('text/plain', clipText(cur.s)); } catch { /* presse-papiers indisponible : la copie interne suffit */ }
    e.preventDefault(); e.stopImmediatePropagation();
    if (cut) { deleteShape(cur.b, cur.s, cur.kind); toast('Objet coupé — Ctrl+V pour le coller'); }
    else toast('Objet copié — Ctrl+V pour le coller');
  }
  /* Ctrl+C / Ctrl+X sur un objet sélectionné : l'objet, pas le bloc entier */
  document.addEventListener('copy', e => onCopy(e, false), true);
  document.addEventListener('cut', e => onCopy(e, true), true);
  /* Ctrl+V : un objet copié se colle dans l'hôte actif (ou, curseur dans le texte, sur le bloc du curseur) ;
     avec un objet ou un ancien dessin sélectionné, un texte collé devient une zone de texte */
  document.addEventListener('paste', e => {
    const cd = e.clipboardData; if (!cd || !inEditor() || isRO()) return;
    const sh = cd.getData('text/x-alixo-shape');
    const h = activeHost();
    if (!h) {
      if (!sh || (ctx && ctx.textEdit)) return;
      const t = e.target;
      if (!t || !t.closest || t.closest('input, textarea, select') || !(t === document.body || blocksEl.contains(t) || t === blocksEl)) return;
      let s = null; try { s = normShape(JSON.parse(sh)); } catch { s = null; }
      if (!s) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const host = hostAtCaret(); if (!host.b) return;
      if (host.kind === 'fl') { const bb = bbox(s); moveShape(s, 0, 6 - bb.y); }
      pasteShape(host.b, JSON.stringify(s), host.kind);
      return;
    }
    if (sh) { e.preventDefault(); e.stopImmediatePropagation(); pasteShape(h.b, sh, h.kind); return; }
    if (cd.getData('text/x-alixo')) return;   // blocs copiés depuis le cours : app.js s'en charge
    const text = (cd.getData('text/plain') || '').trim();
    let clipObj = null; try { clipObj = clip ? JSON.parse(clip) : null; } catch { clipObj = null; }
    if (clipObj && text === clipText(clipObj).trim()) { e.preventDefault(); e.stopImmediatePropagation(); pasteShape(h.b, clip, h.kind); return; }
    if (!text || [...(cd.files || [])].some(f => f.type && f.type.startsWith('image/'))) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const ns = newShape('text');
    Object.assign(ns, { x: 20, y: 20, w: Math.min(W - 40, Math.max(180, Math.round(measure(text.split('\n')[0], st.fs, st.bold) + 20))), h: 0, text: cleanText(text), fill: 'none' });
    refitText(ns); pasteShape(h.b, JSON.stringify(ns), h.kind);
  }, true);

  /* ---------- clavier ---------- */
  /* touches communes aux deux genres d'hôte, un objet étant sélectionné ; renvoie true si la touche est traitée */
  function shapeKey(e, cur) {
    const mod = e.ctrlKey || e.metaKey;
    const { b, s, kind } = cur;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) { e.preventDefault(); deleteShape(b, s, kind); return true; }
    if (e.key === 'Escape') { e.preventDefault(); deselect(); return true; }
    if (e.key === 'Enter' && !mod && !e.altKey) { if (s.t !== 'text' && !canLabel(s)) return false; e.preventDefault(); editText(cur); return true; }
    if (mod && !e.altKey && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(b, s, kind); return true; }
    if (/^Arrow(Up|Down|Left|Right)$/.test(e.key) && !mod) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (e.altKey) {   // Alt+flèches : l'objet grandit ou rétrécit
        const o = JSON.parse(JSON.stringify(s)), ob = bbox(o);
        fitShape(s, o, { x: ob.x, y: ob.y, w: Math.max(6, Math.min(MAX_SIDE, ob.w + dx)), h: Math.max(6, Math.min(MAX_SIDE, ob.h + dy)) });
        if (s.t === 'text') refitText(s);
      } else moveShape(s, dx, dy);
      keep(s, b, kind);
      touch({ typing: true, blockId: b.id + ':' + s.id }); render(b, kind); return true;
    }
    return false;
  }
  /* ancien bloc Dessin sélectionné comme objet du cours : appelé par le gestionnaire de touches d'app.js */
  function handleKey(e, id) {
    const b = getBlock(id); if (!b || b.type !== 'draw') return false;
    if (ctx && ctx.textEdit) return true;   // la zone de texte gère ses touches
    if (isRO()) return false;
    ensureCtx(id);
    const mod = e.ctrlKey || e.metaKey;
    const list = shapes(b);
    if (mod && ['z', 'y', 'c', 'x', 'v'].includes(e.key.toLowerCase())) return false;   // annulation et presse-papiers : gestionnaires dédiés
    if (e.key === 'Tab' && !mod && !e.altKey && list.length) {   // Tab : objet suivant (accessibilité clavier)
      e.preventDefault();
      const sel = ctx.sel ? list.find(s => s.id === ctx.sel) : null;
      const i = sel ? list.indexOf(sel) : -1;
      ctx.sel = list[e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i + 1) % list.length].id;
      renderCanvas(b); return true;
    }
    const cur = selShape();
    if (!cur) return false;
    if (e.key === 'Escape') { e.preventDefault(); ctx.sel = null; renderCanvas(b); return true; }
    return shapeKey(e, cur);
  }
  /* objet flottant sélectionné : le clavier lui appartient tant que le curseur n'est pas dans un champ */
  document.addEventListener('keydown', e => {
    if (palDrag && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); palEnd(null, true); return; }   // Échap pendant un glisser : rien n'est posé
    if (pen && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (ctx && ctx.drag && ctx.drag.kind === 'pen') endDrag(true); setPen(false); return; }
    if (!ctx || ctx.kind !== 'fl' || !ctx.sel || ctx.textEdit || e.defaultPrevented) return;
    if (!inEditor() || isRO()) return;
    const a = document.activeElement;
    const inButton = !!(a && a !== document.body && a.closest);
    if (inButton && a.closest('input, textarea, select, [contenteditable="true"]')) return;
    /* un menu, un pop-over, la recherche ou une fenêtre de dialogue est ouvert : ses touches passent d'abord (Échap le ferme) */
    if (['#popover', '#searchov', '#ctxmenu', '#slashmenu'].some(q => { const el = document.querySelector(q); return el && !el.hidden; }) || document.querySelector('.dlgov')) return;
    const cur = selShape(); if (!cur) return;
    const mod = e.ctrlKey || e.metaKey;
    if (inButton && (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab')) return;   // un bouton a le focus : il garde ses touches
    if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); e.stopPropagation(); selectStep(e.shiftKey ? -1 : 1); return; }
    if (shapeKey(e, cur)) e.stopPropagation();
  }, true);
  /* clic ailleurs : le texte en cours est validé, l'objet flottant est désélectionné */
  document.addEventListener('pointerdown', e => {
    const t = e.target; if (!t || !t.closest) return;
    if (ctx && ctx.textEdit && !t.closest('.draw-textedit, #popover')) commitText();
    if (ctx && ctx.kind === 'fl' && ctx.sel && !ctx.drag && !ctx.textEdit && !t.closest('.fl-layer [data-sid], .fl-layer [data-h], .draw-textedit, #drawpanel, #toolbar [data-act="draw"], #popover, #ctxmenu')) deselect();
  });

  /* ---------- export ---------- */
  /* SVG autonome des objets flottants d'un bloc, recadré sur leur boîte englobante : { svg, w, h, x, y } ou null */
  function floatsSVG(b) {
    const list = floats(b); if (!list || !list.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of list) {
      const bb = bbox(s), sw = +s.sw || 2, pad = sw / 2 + (isLine(s) ? 4 + sw * 1.4 : 1);
      x0 = Math.min(x0, bb.x - pad); y0 = Math.min(y0, bb.y - pad); x1 = Math.max(x1, bb.x + bb.w + pad); y1 = Math.max(y1, bb.y + bb.h + pad);
    }
    x0 = Math.floor(x0 - 4); y0 = Math.floor(y0 - 4);
    /* image d'export plafonnée à MAX_SIDE de côté (un objet géant ne doit pas produire une image démesurée) */
    const w = Math.min(MAX_SIDE, Math.ceil(x1 + 4) - x0), h = Math.min(MAX_SIDE, Math.ceil(y1 + 4) - y0);
    if (!(w > 0 && h > 0) || !Number.isFinite(w + h)) return null;
    const body = list.map(s => shapeSVG(s, false, true)).join('');
    if (!body) return null;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>${body}</svg>`, w, h, x: x0, y: y0 };
  }
  /* textes des objets flottants d'un bloc (recherche) */
  function floatsText(b) {
    const list = floats(b); if (!list) return '';
    return list.map(s => (s.t === 'text' ? s.text : s.label) || '').filter(Boolean).join(' ');
  }
  /* textes d'un ancien bloc Dessin (recherche) */
  function shapesText(b) { return shapes(b).map(s => (s.t === 'text' ? s.text : s.label) || '').filter(Boolean).join(' '); }

  return {
    svg: b => svg(b, { plain: true }), blockHTML, layerHTML, afterRender, afterTouch, syncLayers, handleKey, renderCanvas, renderLayer, pasteShape,
    openPanel, updatePanel, dropAt, insertAtCaret, setPen, deselect, floatsSVG, floatsText, shapesText, normShape,
    get ctx() { return ctx; }, get clip() { return clip; }, get pen() { return pen; }, settings: st
  };
})();
