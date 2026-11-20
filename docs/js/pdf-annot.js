/* ============================================================
   Alixo — 1.56.0 : annotations des PDF (modèle, outils, dessin SVG, sélection, historique)
   Aucune dépendance à pdf.js ni à pdf-lib : js/pdfview.js fournit la page (ps : { key, el, svg, vp1 }) et les crochets
   (my.hooks : snap() avant une modification, changed(keys) après, select(), toast()) ; js/pdf-write.js écrit le modèle.
   Coordonnées : toujours en points PDF, dans l'espace utilisateur de la page non tournée (origine en bas à gauche).
   Le SVG d'une page porte viewBox = viewport à l'échelle 1 et un <g transform="matrix(vp1.transform)"> : les formes y
   sont émises en coordonnées PDF ; un zoom ne redessine rien (le SVG s'étire avec la page).
   Annotations : ink (stylo), hl (surligneur), rect, ellipse, line, arrow, text, note, stamp, texthl (surlignage du texte
   sélectionné), image (image ou signature). Tout texte est échappé (esc) avant d'entrer dans le SVG.
   ============================================================ */
'use strict';

window.AlixoPdfAnnot = (() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const escX = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rid = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const PALETTE = ['#1f1f1f', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#d63384', '#ffffff'];
  const HL_PALETTE = ['#ffeb3b', '#a5f36b', '#7fdbff', '#ff9ecf', '#ffb74d', '#c5a3ff'];
  const STAMPS = [['vu', 'VU', '#2e7d4f'], ['ok', 'VALIDÉ', '#2e7d4f'], ['important', 'IMPORTANT', '#c0392b'], ['arevoir', 'À REVOIR', '#c25e00'], ['date', 'Date du jour', '#2980b9']];   // 1.56.0 : orange plus foncé (contraste)
  /* 1.56.0 : noms des couleurs (aria-label, infobulles) */
  const COLOR_NAMES = { '#1f1f1f': 'Noir', '#c0392b': 'Rouge', '#e67e22': 'Orange', '#f1c40f': 'Jaune', '#27ae60': 'Vert', '#16a085': 'Turquoise', '#2980b9': 'Bleu', '#8e44ad': 'Violet', '#d63384': 'Rose', '#ffffff': 'Blanc',
    '#ffeb3b': 'Jaune fluo', '#a5f36b': 'Vert fluo', '#7fdbff': 'Bleu ciel', '#ff9ecf': 'Rose fluo', '#ffb74d': 'Orange clair', '#c5a3ff': 'Lavande', '#1d3f8f': 'Bleu encre', '#0b6b3a': 'Vert sapin', '#c04343': 'Rouge brique', '#f2c94c': 'Jaune note' };
  const colorName = c => COLOR_NAMES[String(c || '').toLowerCase()] || 'Couleur personnalisée';
  const FONTS = { helv: 'Helvetica, Arial, "Liberation Sans", sans-serif', times: '"Times New Roman", Times, "Liberation Serif", serif', cour: '"Courier New", Courier, "Liberation Mono", monospace' };
  const STAMP_TEXT = { vu: 'VU', arevoir: 'À REVOIR', important: 'IMPORTANT', ok: 'VALIDÉ', date: '' };
  const stampLabel = a => (a.kind === 'date' ? (a.text || new Date().toLocaleDateString('fr-FR')) : String(a.text || STAMP_TEXT[a.kind] || 'VU').toUpperCase());
  const BOX_TYPES = new Set(['rect', 'ellipse', 'image', 'stamp']);
  const n2 = v => (Math.round(v * 100) / 100);

  /* ---------------- géométrie ---------------- */
  const inv = m => { const [a, b, c, d, e, f] = m; const det = a * d - b * c || 1; return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]; };
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  /* point écran (client) → point PDF de la page */
  function toPdf(ps, cx, cy) {
    const r = ps.svg.getBoundingClientRect();
    const px = (cx - r.left) * ps.vp1.width / (r.width || 1), py = (cy - r.top) * ps.vp1.height / (r.height || 1);
    return apply(inv(ps.vp1.transform), px, py);
  }
  /* point PDF → point en pixels CSS dans l'élément de la page */
  function toEl(ps, x, y) {
    const [px, py] = apply(ps.vp1.transform, x, y);
    const r = ps.svg.getBoundingClientRect(); const k = (r.width || 1) / ps.vp1.width;
    return [px * k, py * k];
  }
  let mctx = null;
  function textWidth(a, line) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = `${a.bold ? 'bold ' : ''}${a.size || 14}px ${FONTS[a.font] || FONTS.helv}`;
    return mctx.measureText(line).width;
  }
  function bbox(a) {
    switch (a.t) {
      case 'ink': case 'hl': {
        const xs = a.pts.map(p => p[0]), ys = a.pts.map(p => p[1]); const w = (a.w || 2) / 2;
        return { x: Math.min(...xs) - w, y: Math.min(...ys) - w, w: Math.max(...xs) - Math.min(...xs) + 2 * w, h: Math.max(...ys) - Math.min(...ys) + 2 * w };
      }
      case 'line': case 'arrow': return { x: Math.min(a.x1, a.x2) - 3, y: Math.min(a.y1, a.y2) - 3, w: Math.abs(a.x2 - a.x1) + 6, h: Math.abs(a.y2 - a.y1) + 6 };
      case 'text': {
        const lines = String(a.text || ' ').split('\n'); const s = a.size || 14;
        const w = Math.max(20, ...lines.map(l => textWidth(a, l)));
        return { x: a.x, y: a.y - lines.length * s * 1.2, w, h: lines.length * s * 1.2 };
      }
      case 'note': return { x: a.x, y: a.y, w: 20, h: 20 };
      case 'texthl': {
        const R = a.rects || []; if (!R.length) return { x: 0, y: 0, w: 0, h: 0 };
        const x = Math.min(...R.map(r => r[0])), y = Math.min(...R.map(r => r[1])), X = Math.max(...R.map(r => r[0] + r[2])), Y = Math.max(...R.map(r => r[1] + r[3]));
        return { x, y, w: X - x, h: Y - y };
      }
      default: return { x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
    }
  }
  function translate(a, dx, dy) {
    if (a.pts) a.pts = a.pts.map(p => [n2(p[0] + dx), n2(p[1] + dy)]);
    if (a.rects) a.rects = a.rects.map(r => [n2(r[0] + dx), n2(r[1] + dy), r[2], r[3]]);
    if ('x1' in a) { a.x1 = n2(a.x1 + dx); a.y1 = n2(a.y1 + dy); a.x2 = n2(a.x2 + dx); a.y2 = n2(a.y2 + dy); }
    if ('x' in a && !a.pts && !a.rects) { a.x = n2(a.x + dx); a.y = n2(a.y + dy); }
  }
  /* simplification d'un tracé (Ramer-Douglas-Peucker, ε en points) */
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    const d2 = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = dx * dx + dy * dy; if (!l) return Math.hypot(p[0] - a[0], p[1] - a[1]); const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
    let idx = 0, max = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = d2(pts[i], pts[0], pts[pts.length - 1]); if (d > max) { max = d; idx = i; } }
    if (max <= eps) return [pts[0], pts[pts.length - 1]];
    return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  }

  /* ---------------- dessin SVG (coordonnées PDF) ---------------- */
  const pathOf = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${n2(p[0])} ${n2(p[1])}`).join(' ') + (pts.length === 1 ? ` l0.01 0` : '');
  /* clean : sans les zones de clic invisibles (export en image, vignettes) */
  function shapeSVG(a, images, clean) {
    const c = escX(a.c || '#000');
    const hit = (tag, attrs) => (clean ? '' : `<${tag} class="pdx-hit" ${attrs}/>`);
    const id = `data-id="${escX(a.id)}"`;
    switch (a.t) {
      case 'ink': { const d = pathOf(a.pts); return `<g class="pdx-a" ${id}>${hit('path', `d="${d}" stroke-width="${(a.w || 2) + 8}"`)}<path d="${d}" fill="none" stroke="${c}" stroke-width="${a.w || 2}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${a.a ?? 1}"/></g>`; }
      case 'hl': { const d = pathOf(a.pts); return `<g class="pdx-a pdx-blend" ${id}>${hit('path', `d="${d}" stroke-width="${(a.w || 14) + 4}"`)}<path d="${d}" fill="none" stroke="${c}" stroke-width="${a.w || 14}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${a.a ?? 0.4}"/></g>`; }
      case 'rect': return `<g class="pdx-a" ${id}><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="${a.fill ? escX(a.fill) : 'transparent'}" fill-opacity="${a.fill ? (a.fa ?? 0.25) : 0}" stroke="${c}" stroke-width="${a.sw || 2}" stroke-opacity="${a.a ?? 1}" pointer-events="all"/></g>`;
      case 'ellipse': return `<g class="pdx-a" ${id}><ellipse cx="${a.x + a.w / 2}" cy="${a.y + a.h / 2}" rx="${Math.abs(a.w / 2)}" ry="${Math.abs(a.h / 2)}" fill="${a.fill ? escX(a.fill) : 'transparent'}" fill-opacity="${a.fill ? (a.fa ?? 0.25) : 0}" stroke="${c}" stroke-width="${a.sw || 2}" stroke-opacity="${a.a ?? 1}" pointer-events="all"/></g>`;
      case 'line': case 'arrow': {
        let head = '';
        if (a.t === 'arrow') {
          const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), len = Math.max(8, (a.sw || 2) * 4);
          const p = s => { const b = ang + Math.PI + s * 0.45; return `${n2(a.x2 + len * Math.cos(b))} ${n2(a.y2 + len * Math.sin(b))}`; };
          head = `<path d="M${p(-1)} L${a.x2} ${a.y2} L${p(1)}" fill="none" stroke="${c}" stroke-width="${a.sw || 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        return `<g class="pdx-a" ${id} stroke-opacity="${a.a ?? 1}">${hit('line', `x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke-width="${(a.sw || 2) + 8}"`)}<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="${c}" stroke-width="${a.sw || 2}" stroke-linecap="round"/>${head}</g>`;
      }
      case 'texthl': return `<g class="pdx-a pdx-blend" ${id}>${(a.rects || []).map(r => `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="${c}" fill-opacity="${a.a ?? 0.35}" pointer-events="all"/>`).join('')}</g>`;
      case 'text': {
        const s = a.size || 14; const lines = String(a.text || '').split('\n');
        const b = bbox(a);
        return `<g class="pdx-a" ${id}>${clean ? '' : `<rect class="pdx-hitbox" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`}${lines.map((l, i) => `<text transform="translate(${a.x} ${n2(a.y - s * 0.86 - i * s * 1.2)}) scale(1 -1)" font-size="${s}" font-family='${FONTS[a.font] || FONTS.helv}' font-weight="${a.bold ? 700 : 400}" fill="${c}" fill-opacity="${a.a ?? 1}" xml:space="preserve">${escX(l)}</text>`).join('')}</g>`;
      }
      case 'note': return `<g class="pdx-a pdx-note" ${id} transform="translate(${a.x} ${a.y + 20}) scale(1 -1)"><rect width="20" height="20" rx="4" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="0.8"/><path d="M5 6.5h10M5 10h10M5 13.5h6" stroke="rgba(0,0,0,.6)" stroke-width="1.4" stroke-linecap="round"/></g>`;
      case 'stamp': {
        const w = a.w || 120, h = a.h || 36; const label = stampLabel(a);
        const fs = Math.max(6, Math.min(h * 0.46, (w - 12) / Math.max(1, label.length) * 1.55));
        return `<g class="pdx-a" ${id}><rect x="${a.x}" y="${a.y}" width="${w}" height="${h}" rx="${Math.min(8, h / 4)}" fill="${c}" fill-opacity=".08" stroke="${c}" stroke-width="2.2" pointer-events="all"/><text transform="translate(${n2(a.x + w / 2)} ${n2(a.y + (h - fs * 0.72) / 2)}) scale(1 -1)" text-anchor="middle" font-size="${n2(fs)}" font-family='${FONTS.helv}' font-weight="700" fill="${c}" letter-spacing=".5">${escX(label)}</text></g>`;
      }
      case 'image': {
        const im = images && images[a.img]; const href = im ? im.url : '';
        return `<g class="pdx-a" ${id}><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="transparent" pointer-events="all"/>${href ? `<image href="${escX(href)}" transform="translate(${a.x} ${a.y + a.h}) scale(1 -1)" width="${a.w}" height="${a.h}" preserveAspectRatio="none" opacity="${a.a ?? 1}"/>` : ''}</g>`;
      }
      default: return '';
    }
  }
  /* le SVG d'une page : annotations, résultats de recherche, sélection */
  function render(my, ps) {
    if (!ps || !ps.svg || !ps.vp1) return;
    const list = (my.model.annots[ps.key] || []);
    const t = ps.vp1.transform.map(n2).join(' ');
    ps.svg.setAttribute('viewBox', `0 0 ${n2(ps.vp1.width)} ${n2(ps.vp1.height)}`);
    const sel = my.sel && my.sel.key === ps.key ? list.find(a => a.id === my.sel.id) : null;
    let selHTML = '';
    if (sel) {
      const b = bbox(sel); const pad = 3;
      selHTML = `<g class="pdx-selg"><rect x="${n2(b.x - pad)}" y="${n2(b.y - pad)}" width="${n2(b.w + 2 * pad)}" height="${n2(b.h + 2 * pad)}" vector-effect="non-scaling-stroke"/>${BOX_TYPES.has(sel.t) ? `<circle class="pdx-handle" data-handle="br" cx="${n2(b.x + b.w + pad)}" cy="${n2(b.y - pad)}" r="${n2(6 / (my.view.zoom * 1.333))}"/>` : ''}</g>`;
    }
    const hits = (my.find && my.find.marks && my.find.marks[ps.key]) || [];
    const hitHTML = hits.map(h => `<rect class="pdx-hit-r${h.cur ? ' cur' : ''}" x="${n2(h.x)}" y="${n2(h.y)}" width="${n2(h.w)}" height="${n2(h.h)}" rx="1.5"/>`).join('');
    const halo = my.halo && my.halo.key === ps.key ? `<rect class="pdx-halo" x="${my.halo.r[0]}" y="${my.halo.r[1]}" width="${my.halo.r[2] - my.halo.r[0]}" height="${my.halo.r[3] - my.halo.r[1]}" rx="3" vector-effect="non-scaling-stroke"/>` : '';
    /* notes déjà présentes dans le fichier (annotations /Text natives) : icône, lecture au clic */
    const nat = (ps.native || []).map((n, i) => `<g class="pdx-nat" data-nat="${i}" transform="translate(${n2(n.rect[0])} ${n2(n.rect[1] + 20)}) scale(1 -1)"><title>${escX(n.title ? n.title + ' : ' : '')}${escX(n.text.slice(0, 200))}</title><rect width="20" height="20" rx="4" fill="${escX(n.color || '#f2c94c')}" stroke="rgba(0,0,0,.35)" stroke-width="0.8"/><path d="M5 6.5h10M5 10h10M5 13.5h6" stroke="rgba(0,0,0,.6)" stroke-width="1.4" stroke-linecap="round"/></g>`).join('');
    ps.svg.innerHTML = `<g transform="matrix(${t})"><g class="pdx-hitg">${hitHTML}${halo}</g>${nat}<g class="pdx-anng">${list.map(a => shapeSVG(a, my.images)).join('')}</g>${selHTML}</g>`;
  }
  const findAnnot = (my, key, id) => (my.model.annots[key] || []).find(a => a.id === id) || null;

  /* ---------------- outils ---------------- */
  /* options des outils (couleur, épaisseur…) — mémorisées sur l'appareil */
  const OPTS_LS = 'alixo.pdf.tools';
  const DEF_OPTS = { pen: { c: '#c0392b', w: 2, a: 1 }, hl: { c: '#ffeb3b', w: 14, a: 0.4 }, shape: { c: '#2980b9', sw: 2, fill: null, kind: 'rect' }, text: { c: '#1f1f1f', size: 14, font: 'helv', bold: false }, note: { c: '#f2c94c' }, stamp: { kind: 'important' }, texthl: { c: '#ffeb3b' } };
  /* 1.56.0 : réglages relus avec validation (le stockage local peut avoir été modifié) : couleurs #rrggbb, nombres finis
     bornés, police et tampon connus — rien d'autre n'entre dans le SVG ou les styles */
  const HEX = /^#[0-9a-f]{6}$/i;
  const isHex = v => typeof v === 'string' && HEX.test(v);
  const fnum = (v, d, lo, hi) => { const n = +v; return typeof v !== 'boolean' && v !== null && v !== '' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  function cleanOpts(o) {
    const src = o && typeof o === 'object' ? o : {}; const r = JSON.parse(JSON.stringify(DEF_OPTS));
    const g = k => (src[k] && typeof src[k] === 'object' ? src[k] : {});
    for (const k of ['pen', 'hl', 'shape', 'text', 'note', 'texthl']) if (isHex(g(k).c)) r[k].c = g(k).c.toLowerCase();
    r.pen.w = fnum(g('pen').w, r.pen.w, 0.5, 12); r.pen.a = fnum(g('pen').a, r.pen.a, 0.05, 1);
    r.hl.w = fnum(g('hl').w, r.hl.w, 6, 30); r.hl.a = fnum(g('hl').a, r.hl.a, 0.05, 1);
    r.shape.sw = fnum(g('shape').sw, r.shape.sw, 0.5, 10); r.shape.fill = isHex(g('shape').fill) ? g('shape').fill.toLowerCase() : null;
    if (['rect', 'ellipse', 'line', 'arrow'].includes(g('shape').kind)) r.shape.kind = g('shape').kind;
    r.text.size = Math.round(fnum(g('text').size, r.text.size, 6, 72)); if (Object.prototype.hasOwnProperty.call(FONTS, g('text').font)) r.text.font = g('text').font; r.text.bold = g('text').bold === true;
    if (STAMPS.some(s => s[0] === g('stamp').kind)) r.stamp.kind = g('stamp').kind;
    return r;
  }
  let opts = (() => { try { return cleanOpts(JSON.parse(localStorage.getItem(OPTS_LS))); } catch { return cleanOpts(null); } })();
  const saveOpts = () => { try { localStorage.setItem(OPTS_LS, JSON.stringify(opts)); } catch { /* */ } };
  const groupOf = tool => (tool === 'pen' ? 'pen' : tool === 'hl' ? 'hl' : ['rect', 'ellipse', 'line', 'arrow'].includes(tool) ? 'shape' : tool === 'text' ? 'text' : tool === 'note' ? 'note' : tool === 'stamp' ? 'stamp' : null);
  function setOpt(tool, k, v) { const g = groupOf(tool) || tool; if (!opts[g]) return; const o = JSON.parse(JSON.stringify(opts)); o[g][k] = v; opts = cleanOpts(o); saveOpts(); }

  /* 1.56.0 : annotation relue d'un brouillon (IndexedDB) : type connu, nombres finis bornés, couleurs #rrggbb, textes
     bornés ; renvoie null si elle est inutilisable. imgIds : identifiants d'images disponibles */
  const ANN_TYPES = new Set(['ink', 'hl', 'rect', 'ellipse', 'line', 'arrow', 'text', 'note', 'stamp', 'texthl', 'image']);
  const C = 1e6;   // coordonnées PDF plausibles
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  function sanitizeAnnot(a, imgIds) {
    if (!a || typeof a !== 'object' || !ANN_TYPES.has(a.t)) return null;
    const o = { id: typeof a.id === 'string' && /^[\w-]{1,40}$/.test(a.id) ? a.id : rid(), t: a.t, c: isHex(a.c) ? a.c.toLowerCase() : '#c0392b' };
    if (a.a != null) o.a = fnum(a.a, 1, 0, 1);
    const xy = k => fnum(a[k], 0, -C, C);
    switch (a.t) {
      case 'ink': case 'hl': {
        if (!Array.isArray(a.pts)) return null;
        o.pts = a.pts.slice(0, 20000).filter(p => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])).map(p => [fnum(p[0], 0, -C, C), fnum(p[1], 0, -C, C)]);
        if (!o.pts.length) return null;
        o.w = fnum(a.w, a.t === 'hl' ? 14 : 2, 0.1, 60); return o;
      }
      case 'rect': case 'ellipse':
        Object.assign(o, { x: xy('x'), y: xy('y'), w: fnum(a.w, 0, -C, C), h: fnum(a.h, 0, -C, C), sw: fnum(a.sw, 2, 0.1, 40), fill: isHex(a.fill) ? a.fill.toLowerCase() : null });
        if (a.fa != null) o.fa = fnum(a.fa, 0.25, 0, 1);
        return o;
      case 'line': case 'arrow': return Object.assign(o, { x1: xy('x1'), y1: xy('y1'), x2: xy('x2'), y2: xy('y2'), sw: fnum(a.sw, 2, 0.1, 40), head: a.t === 'arrow' });
      case 'text': return Object.assign(o, { x: xy('x'), y: xy('y'), text: str(a.text, 10000), size: fnum(a.size, 14, 4, 200), font: Object.prototype.hasOwnProperty.call(FONTS, a.font) ? a.font : 'helv', bold: a.bold === true });
      case 'note': return Object.assign(o, { x: xy('x'), y: xy('y'), text: str(a.text, 20000), open: false });
      case 'stamp': return Object.assign(o, { x: xy('x'), y: xy('y'), w: fnum(a.w, 120, 10, 2000), h: fnum(a.h, 32, 6, 1000), kind: Object.prototype.hasOwnProperty.call(STAMP_TEXT, a.kind) ? a.kind : 'vu', text: str(a.text, 60) });
      case 'texthl': {
        if (!Array.isArray(a.rects)) return null;
        o.rects = a.rects.slice(0, 2000).filter(r => Array.isArray(r) && r.length >= 4 && r.slice(0, 4).every(v => Number.isFinite(+v))).map(r => [fnum(r[0], 0, -C, C), fnum(r[1], 0, -C, C), fnum(r[2], 0, 0, C), fnum(r[3], 0, 0, C)]);
        if (!o.rects.length) return null;
        o.quote = str(a.quote, 2000); return o;
      }
      case 'image':
        if (typeof a.img !== 'string' || !(imgIds && imgIds.has(a.img))) return null;
        return Object.assign(o, { x: xy('x'), y: xy('y'), w: fnum(a.w, 100, -C, C), h: fnum(a.h, 100, -C, C), img: a.img, sig: a.sig === true, ratio: fnum(a.ratio, 1, 1e-3, 1e3) });
      default: return null;
    }
  }

  function addAnnot(my, key, a, noSelect) {
    my.hooks.snap();
    (my.model.annots[key] || (my.model.annots[key] = [])).push(a);
    my.sel = noSelect ? null : { key, id: a.id };
    my.hooks.changed([key]);
    return a;
  }
  function removeAnnot(my, key, id, silent) {
    const l = my.model.annots[key] || []; const i = l.findIndex(a => a.id === id); if (i < 0) return false;
    if (!silent) my.hooks.snap();
    l.splice(i, 1); if (!l.length) delete my.model.annots[key];
    if (my.sel && my.sel.id === id) my.sel = null;
    my.hooks.changed([key]);
    return true;
  }
  function duplicate(my) {
    const a = my.sel && findAnnot(my, my.sel.key, my.sel.id); if (!a) return;
    const b = JSON.parse(JSON.stringify(a)); b.id = rid(); translate(b, 12, -12);
    addAnnot(my, my.sel.key, b);
  }
  function recolor(my, c) {
    const a = my.sel && findAnnot(my, my.sel.key, my.sel.id); if (!a) return;
    my.hooks.snap(); a.c = c; my.hooks.changed([my.sel.key]);
  }

  /* pointeur : création, sélection, déplacement, redimensionnement — un écouteur délégué par onglet (host = .pdx-pages) */
  function bind(my, host) {
    let drag = null;
    const pageOf = e => { const el = e.target.closest && e.target.closest('.pdx-page'); return el ? my.ps.get(el.dataset.key) : null; };
    host.addEventListener('pointerdown', e => {
      if (e.button !== 0 || my.readOnlyHard) return;
      const ps = pageOf(e); if (!ps || !ps.svg || !ps.vp1) return;
      const tool = my.view.tool;
      const [x, y] = toPdf(ps, e.clientX, e.clientY);
      // poignée de redimensionnement
      const hd = e.target.closest('[data-handle]');
      if (hd && my.sel && my.sel.key === ps.key) {
        const a = findAnnot(my, ps.key, my.sel.id); if (!a) return;
        e.preventDefault(); host.setPointerCapture(e.pointerId);
        drag = { kind: 'resize', ps, a, top: Math.max(a.y, a.y + a.h), x0: Math.min(a.x, a.x + a.w), snapped: false };
        return;
      }
      const ne = e.target.closest('.pdx-nat');
      if (ne) { e.preventDefault(); const n = (ps.native || [])[+ne.dataset.nat]; if (n && my.hooks.nativeNote) my.hooks.nativeNote(n, ps); return; }
      const ae = e.target.closest('.pdx-a');
      if (tool === 'erase') { if (ae) { e.preventDefault(); removeAnnot(my, ps.key, ae.dataset.id); } return; }
      if (tool === 'select' || (ae && tool !== 'pen' && tool !== 'hl')) {
        if (!ae) { if (my.sel) { my.sel = null; my.hooks.changed([], true); } return; }
        const a = findAnnot(my, ps.key, ae.dataset.id); if (!a) return;
        e.preventDefault();
        const was = my.sel && my.sel.id === a.id;
        my.sel = { key: ps.key, id: a.id }; render(my, ps); my.hooks.selected(a, ps);
        if (a.t === 'note' && was) { my.hooks.editNote(a, ps); return; }
        host.setPointerCapture(e.pointerId);
        drag = { kind: 'move', ps, a, x, y, sx: x, sy: y, snapped: false, cx: e.clientX, cy: e.clientY };
        return;
      }
      e.preventDefault();
      const o = opts[groupOf(tool)] || {};
      if (tool === 'pen' || tool === 'hl') {
        host.setPointerCapture(e.pointerId);
        const a = { id: rid(), t: tool === 'pen' ? 'ink' : 'hl', pts: [[n2(x), n2(y)]], w: +o.w || (tool === 'pen' ? 2 : 14), c: o.c, a: tool === 'pen' ? (o.a ?? 1) : (o.a ?? 0.4) };
        drag = { kind: 'draw', ps, a, live: null };
        const g = ps.svg.querySelector('.pdx-anng');
        g.insertAdjacentHTML('beforeend', shapeSVG(a)); drag.live = g.lastElementChild;
        return;
      }
      if (['rect', 'ellipse', 'line', 'arrow'].includes(tool)) {
        host.setPointerCapture(e.pointerId);
        const a = tool === 'line' || tool === 'arrow' ? { id: rid(), t: tool, x1: n2(x), y1: n2(y), x2: n2(x), y2: n2(y), c: o.c, sw: +o.sw || 2, head: tool === 'arrow' } : { id: rid(), t: tool, x: n2(x), y: n2(y), w: 0, h: 0, c: o.c, sw: +o.sw || 2, fill: o.fill || null };
        drag = { kind: 'shape', ps, a, x, y, live: null };
        return;
      }
      if (tool === 'text') { const a = { id: rid(), t: 'text', x: n2(x), y: n2(y + (o.size || 14) * 0.5), text: '', size: +o.size || 14, c: o.c, font: o.font || 'helv', bold: !!o.bold }; my.hooks.editText(a, ps, true); return; }
      if (tool === 'note') { const a = addAnnot(my, ps.key, { id: rid(), t: 'note', x: n2(x - 10), y: n2(y - 10), text: '', c: o.c || '#f2c94c', open: false }); my.hooks.editNote(a, ps, true); my.hooks.tool('select'); return; }
      if (tool === 'stamp') {
        const kind = (opts.stamp && opts.stamp.kind) || 'important'; const st = STAMPS.find(s => s[0] === kind) || STAMPS[2];
        const label = kind === 'date' ? new Date().toLocaleDateString('fr-FR') : st[1];
        const w = Math.max(70, label.length * 10 + 26), h = 32;
        addAnnot(my, ps.key, { id: rid(), t: 'stamp', x: n2(x - w / 2), y: n2(y - h / 2), w, h, kind, text: kind === 'date' ? label : '', c: st[2] });
        my.hooks.tool('select');
        return;
      }
      if (tool === 'image' || tool === 'sig') { my.hooks.placeImage(ps, x, y); return; }
    });
    host.addEventListener('pointermove', e => {
      if (!drag) return;
      const [x, y] = toPdf(drag.ps, e.clientX, e.clientY);
      if (drag.kind === 'draw') {
        const p = drag.a.pts; const last = p[p.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) < 0.6) return;
        p.push([n2(x), n2(y)]);
        const d = pathOf(p); drag.live.querySelectorAll('path').forEach(el => el.setAttribute('d', d));
        return;
      }
      if (drag.kind === 'shape') {
        const a = drag.a;
        if ('x1' in a) { a.x2 = n2(x); a.y2 = n2(y); if (e.shiftKey) { const ang = Math.round(Math.atan2(a.y2 - a.y1, a.x2 - a.x1) / (Math.PI / 4)) * (Math.PI / 4); const l = Math.hypot(a.x2 - a.x1, a.y2 - a.y1); a.x2 = n2(a.x1 + l * Math.cos(ang)); a.y2 = n2(a.y1 + l * Math.sin(ang)); } }
        else { let w = x - drag.x, h = y - drag.y; if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; } a.x = n2(Math.min(drag.x, drag.x + w)); a.y = n2(Math.min(drag.y, drag.y + h)); a.w = n2(Math.abs(w)); a.h = n2(Math.abs(h)); }
        const g = drag.ps.svg.querySelector('.pdx-anng');
        if (drag.live) drag.live.remove();
        g.insertAdjacentHTML('beforeend', shapeSVG(a)); drag.live = g.lastElementChild;
        return;
      }
      if (drag.kind === 'move') {
        if (!drag.snapped) { if (Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 3) return; my.hooks.snap(); drag.snapped = true; }
        translate(drag.a, x - drag.x, y - drag.y); drag.x = x; drag.y = y;
        render(my, drag.ps);
        return;
      }
      if (drag.kind === 'resize') {
        if (!drag.snapped) { my.hooks.snap(); drag.snapped = true; }
        const a = drag.a; const minS = 6;
        const w = Math.max(minS, x - drag.x0); let h = Math.max(minS, drag.top - y);
        if (a.t === 'image' || e.shiftKey) { const ratio = (a.ratio || (a.h ? Math.abs(a.w / a.h) : 1)); a.ratio = ratio; h = w / ratio; }
        a.x = n2(drag.x0); a.w = n2(w); a.h = n2(h); a.y = n2(drag.top - h);
        render(my, drag.ps);
      }
    });
    const end = e => {
      if (!drag) return;
      const d = drag; drag = null;
      try { host.releasePointerCapture(e.pointerId); } catch { /* */ }
      if (d.kind === 'draw') {
        if (d.live) d.live.remove();
        d.a.pts = rdp(d.a.pts, 0.4);
        addAnnot(my, d.ps.key, d.a, true);   // un tracé n'est pas sélectionné : on enchaîne les traits
        return;
      }
      if (d.kind === 'shape') {
        if (d.live) d.live.remove();
        const a = d.a;
        const tiny = 'x1' in a ? Math.hypot(a.x2 - a.x1, a.y2 - a.y1) < 4 : (a.w < 4 || a.h < 4);
        if (tiny) {   // simple clic : forme de taille par défaut
          if ('x1' in a) { a.x2 = n2(a.x1 + 80); a.y2 = a.y1; } else { a.w = 90; a.h = 60; a.y = n2(a.y - 60); }
        }
        addAnnot(my, d.ps.key, a);
        return;
      }
      if ((d.kind === 'move' || d.kind === 'resize') && d.snapped) my.hooks.changed([d.ps.key]);
      else if (d.kind === 'move') my.hooks.selected(d.a, d.ps);
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
    /* Sélection : un clic (sans sélection de texte) sur un surlignage le sélectionne — il ne gêne pas la sélection du texte */
    host.addEventListener('click', e => {
      if (my.view.tool !== 'select' || e.target.closest('.pdx-a, .pdx-bubble, .pdx-tedit')) return;
      const s = getSelection(); if (s && !s.isCollapsed) return;
      const ps = pageOf(e); if (!ps || !ps.vp1) return;
      const [x, y] = toPdf(ps, e.clientX, e.clientY);
      const near = (a) => {
        if (a.t === 'texthl') return (a.rects || []).some(r => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]);
        if (a.t !== 'hl') return false;
        const w = (a.w || 14) / 2 + 2; const P = a.pts;
        for (let i = 0; i < P.length; i++) { const p = P[i], q = P[Math.min(i + 1, P.length - 1)]; const dx = q[0] - p[0], dy = q[1] - p[1]; const l = dx * dx + dy * dy; const t = l ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l)) : 0; if (Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy) <= w) return true; }
        return false;
      };
      const hit = (my.model.annots[ps.key] || []).slice().reverse().find(near);
      if (hit) { my.sel = { key: ps.key, id: hit.id }; render(my, ps); my.hooks.selected(hit, ps); }
    });
    host.addEventListener('dblclick', e => {
      const ps = pageOf(e); const ae = e.target.closest('.pdx-a'); if (!ps || !ae || my.readOnlyHard) return;
      const a = findAnnot(my, ps.key, ae.dataset.id); if (!a) return;
      if (a.t === 'text') { e.preventDefault(); my.hooks.editText(a, ps, false); }
      if (a.t === 'note') { e.preventDefault(); my.hooks.editNote(a, ps); }
    });
  }
  /* clavier (sélection) : Suppr, flèches, Ctrl+D ; renvoie true si consommé */
  function key(my, e) {
    const a = my.sel && findAnnot(my, my.sel.key, my.sel.id); if (!a) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeAnnot(my, my.sel.key, a.id); return true; }
    if (e.key === 'Escape') { my.sel = null; my.hooks.changed([], true); return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(my); return true; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (arrows[e.key] && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); const k = e.shiftKey ? 10 : 1;
      if (!my.nudge || Date.now() - my.nudge > 800) my.hooks.snap();
      my.nudge = Date.now();
      translate(a, arrows[e.key][0] * k, arrows[e.key][1] * k); my.hooks.changed([my.sel.key]);
      return true;
    }
    return false;
  }
  /* surlignage du texte sélectionné : rectangles de la sélection → rectangles PDF, par page */
  function highlightSelection(my, color) {
    const s = getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return 0;
    const range = s.getRangeAt(0); const rects = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1);
    const quote = s.toString().replace(/\s+/g, ' ').trim().slice(0, 2000);
    const byKey = new Map();
    for (const r of rects) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ps = [...my.ps.values()].find(p => { if (!p.svg) return false; const b = p.svg.getBoundingClientRect(); return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom; });
      if (!ps || !ps.vp1) continue;
      const pts = [toPdf(ps, r.left, r.top), toPdf(ps, r.right, r.bottom)];
      const x = Math.min(pts[0][0], pts[1][0]), y = Math.min(pts[0][1], pts[1][1]), w = Math.abs(pts[1][0] - pts[0][0]), h = Math.abs(pts[1][1] - pts[0][1]);
      if (!byKey.has(ps.key)) byKey.set(ps.key, []);
      // fusion des rectangles d'une même ligne qui se chevauchent
      const list = byKey.get(ps.key); const same = list.find(q => Math.abs(q[1] - y) < h * 0.4 && Math.abs(q[3] - h) < h * 0.5 && x <= q[0] + q[2] + 2 && x + w >= q[0] - 2);
      if (same) { const X = Math.min(same[0], x), R = Math.max(same[0] + same[2], x + w); same[0] = n2(X); same[2] = n2(R - X); }
      else list.push([n2(x), n2(y), n2(w), n2(h)]);
    }
    if (!byKey.size) return 0;
    my.hooks.snap();
    for (const [k, list] of byKey) (my.model.annots[k] || (my.model.annots[k] = [])).push({ id: rid(), t: 'texthl', rects: list, c: color || opts.texthl.c, a: 0.35, quote });
    s.removeAllRanges();
    my.hooks.changed([...byKey.keys()]);
    return byKey.size;
  }

  return { PALETTE, HL_PALETTE, STAMPS, FONTS, BOX_TYPES, COLOR_NAMES, colorName, isHex, sanitizeAnnot, cleanOpts, get opts() { return opts; }, setOpt, groupOf, render, shapeSVG, bind, key, bbox, translate, toPdf, toEl, addAnnot, removeAnnot, duplicate, recolor, findAnnot, highlightSelection, rdp, stampLabel, rid };
})();
