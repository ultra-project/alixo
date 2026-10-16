/* ============================================================
   Alixo — lecture et réécriture fidèles d'un document OpenDocument (.odt : LibreOffice, OpenOffice) pour
   l'éditeur (js/docedit.js) (1.34.1)
   Lecture : styles (communs, automatiques, par défaut, héritage), polices déclarées, paragraphes (marges, retrait,
   espacements, interligne, alignement, bordures, fond, tabulations, saut de page avant), texte (police, taille, gras,
   italique, souligné, barré, couleur, surlignage, exposant / indice, majuscules), listes (numéros et puces, niveaux,
   continuation), tableaux (colonnes, fusions, bordures, fonds, marges), images, cadres et formes avec texte, liens,
   notes de bas de page, champs (numéro de page, nombre de pages), pages (format, marges, en-têtes et pieds de page,
   première page, pages de gauche), changement de page maîtresse.
   Réécriture : content.xml d'origine gardé ; seuls les paragraphes modifiés sont reconstruits (portions avec leur
   style d'origine, styles automatiques créés pour les retouches), les ajoutés copient le paragraphe qu'ils
   prolongent (nouvel élément de liste si besoin), les supprimés sont retirés ; le reste de l'archive est identique.
   ============================================================ */
'use strict';

window.AlixoOdt = (() => {
  const NS = {
    office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0', table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0', xlink: 'http://www.w3.org/1999/xlink'
  };
  const MIME = 'application/vnd.oasis.opendocument.text';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const A = (el, ns, n) => (el && el.getAttributeNS ? el.getAttributeNS(NS[ns], n) : null);
  const kids = (el, ns, n) => (el ? [...el.children].filter(c => c.localName === n && (!ns || c.namespaceURI === NS[ns])) : []);
  const kid = (el, ns, n) => kids(el, ns, n)[0] || null;
  const len = v => { const m = /^(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)?$/.exec(String(v || '').trim()); if (!m) return 0; const n = +m[1]; switch (m[2]) { case 'cm': return n * 96 / 2.54; case 'mm': return n * 96 / 25.4; case 'in': return n * 96; case 'pt': return n * 96 / 72; case 'pc': return n * 16; default: return n; } };
  const LH = { 'times new roman': 1.15, 'liberation serif': 1.15, arial: 1.15, 'liberation sans': 1.15, calibri: 1.22, carlito: 1.22, cambria: 1.17, georgia: 1.14, verdana: 1.22, 'dejavu sans': 1.16, 'dejavu serif': 1.16, 'courier new': 1.13, 'liberation mono': 1.13 };
  const lhRatio = f => LH[String(f || '').toLowerCase()] || 1.17;
  const cssBorder = v => { if (!v || v === 'none') return 'none'; const m = /^([\d.]+\w*)\s+(\w+)\s+(#\w+)/.exec(v); if (!m) return v; const w = Math.max(1, len(m[1])); const st = m[2] === 'double' ? 'double' : /dot/.test(m[2]) ? 'dotted' : /dash/.test(m[2]) ? 'dashed' : 'solid'; return `${st === 'double' ? Math.max(3, w) : w}px ${st} ${m[3]}`; };

  async function load(buf) {
    if (typeof JSZip === 'undefined') throw new Error('lecteur d’archives indisponible');
    const zip = await JSZip.loadAsync(buf);
    const parser = new DOMParser();
    const readXml = async p => { const f = zip.file(p); if (!f) return null; const x = parser.parseFromString(await f.async('string'), 'application/xml'); return x.getElementsByTagName('parsererror').length ? null : x; };
    const content = await readXml('content.xml');
    if (!content) throw new Error('le contenu du document (content.xml) est illisible');
    const stylesX = await readXml('styles.xml');
    const officeText = content.getElementsByTagNameNS(NS.office, 'text')[0];
    if (!officeText) throw new Error('ce fichier OpenDocument n’est pas un document texte');
    const urls = new Map();
    for (const p of Object.keys(zip.files)) {
      if (zip.files[p].dir || !/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(p)) continue;
      const ext = p.split('.').pop().toLowerCase();
      urls.set(p, URL.createObjectURL(new Blob([await zip.file(p).async('arraybuffer')], { type: { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' }[ext] })));
    }
    const media = href => urls.get(String(href || '').replace(/^\.\//, '')) || '';

    /* ---------------- polices déclarées ---------------- */
    const faces = {};
    const fontsUsed = new Set();
    for (const x of [content, stylesX]) if (x) for (const f of x.getElementsByTagNameNS(NS.style, 'font-face')) faces[A(f, 'style', 'name')] = (A(f, 'svg', 'font-family') || A(f, 'style', 'name') || '').replace(/^['"]|['"]$/g, '');

    /* ---------------- styles ---------------- */
    const props = (el, n) => { const o = {}; const p = el && kid(el, 'style', n); if (p) for (const at of p.attributes) o[at.localName] = at.value; return { o, el: p }; };
    function readStyle(st, auto) {
      const pp = props(st, 'paragraph-properties');
      const tabs = pp.el ? kids(kid(pp.el, 'style', 'tab-stops'), 'style', 'tab-stop').map(t => ({ pos: len(A(t, 'style', 'position')), val: A(t, 'style', 'type') || 'left', leader: A(t, 'style', 'leader-text') || (A(t, 'style', 'leader-style') && A(t, 'style', 'leader-style') !== 'none' ? '.' : '') })) : null;
      return { name: A(st, 'style', 'name'), family: A(st, 'style', 'family'), parent: A(st, 'style', 'parent-style-name'), display: A(st, 'style', 'display-name'), master: A(st, 'style', 'master-page-name'), list: A(st, 'style', 'list-style-name'), pp: pp.o, tabs, tp: props(st, 'text-properties').o, gp: props(st, 'graphic-properties').o, cp: props(st, 'table-cell-properties').o, tbp: props(st, 'table-properties').o, colp: props(st, 'table-column-properties').o, rowp: props(st, 'table-row-properties').o, auto, el: st };
    }
    const common = {}, autoC = {}, autoS = {}, defaults = {};
    const officeStyles = stylesX && stylesX.getElementsByTagNameNS(NS.office, 'styles')[0];
    if (officeStyles) {
      for (const st of kids(officeStyles, 'style', 'style')) { const s = readStyle(st, false); common[s.family + ':' + s.name] = s; }
      for (const st of kids(officeStyles, 'style', 'default-style')) { const s = readStyle(st, false); defaults[A(st, 'style', 'family')] = s; }
    }
    const asC = content.getElementsByTagNameNS(NS.office, 'automatic-styles')[0];
    if (asC) for (const st of kids(asC, 'style', 'style')) { const s = readStyle(st, true); autoC[s.family + ':' + s.name] = s; }
    const asS = stylesX && stylesX.getElementsByTagNameNS(NS.office, 'automatic-styles')[0];
    if (asS) for (const st of kids(asS, 'style', 'style')) { const s = readStyle(st, true); autoS[s.family + ':' + s.name] = s; }
    const find = (fam, name, hf) => (name ? (hf ? autoS : autoC)[fam + ':' + name] || common[fam + ':' + name] || null : null);
    function chain(fam, name, hf) {
      const out = []; let s = find(fam, name, hf), k = 0;
      while (s && k++ < 30) { out.unshift(s); s = s.parent ? common[fam + ':' + s.parent] || null : null; }
      return out;
    }
    /* propriétés de texte normalisées : { font, sz, b, i, u, strike, color, hl, va, caps, smallCaps, ls, hidden } */
    function textOf(list, base) {
      const R = Object.assign({}, base || {});
      for (const tp of list) {
        if (!tp) continue;
        if (tp['font-name']) { R.font = faces[tp['font-name']] || tp['font-name']; fontsUsed.add(R.font); }
        else if (tp['font-family']) { R.font = tp['font-family'].replace(/^['"]|['"]$/g, ''); fontsUsed.add(R.font); }
        if (tp['font-size']) { const v = tp['font-size']; R.sz = /%$/.test(v) ? (R.sz || 12) * parseFloat(v) / 100 : len(v) * 72 / 96; }
        if (tp['font-weight']) R.b = /bold|[6-9]00/.test(tp['font-weight']);
        if (tp['font-style']) R.i = /italic|oblique/.test(tp['font-style']);
        if (tp['text-underline-style']) R.u = tp['text-underline-style'] !== 'none' ? (tp['text-underline-type'] === 'double' ? 'double' : 'single') : 'none';
        if (tp['text-line-through-style']) R.strike = tp['text-line-through-style'] !== 'none';
        if (tp.color) R.color = tp.color;
        if (tp['use-window-font-color'] === 'true') R.color = 'auto';
        if (tp['background-color']) R.hl = tp['background-color'] === 'transparent' ? '' : tp['background-color'];
        if (tp['text-position']) { const v = tp['text-position']; R.va = /^super/.test(v) || parseFloat(v) > 0 ? 'superscript' : /^sub/.test(v) || parseFloat(v) < 0 ? 'subscript' : 'baseline'; }
        if (tp['text-transform']) R.caps = tp['text-transform'] === 'uppercase';
        if (tp['font-variant']) R.smallCaps = tp['font-variant'] === 'small-caps';
        if (tp['letter-spacing']) R.ls = tp['letter-spacing'] === 'normal' ? 0 : len(tp['letter-spacing']);
        if (tp.display === 'none') R.hidden = true;
      }
      return R;
    }
    function paraOf(list) {
      const P = { indL: 0, indR: 0, first: 0, before: 0, after: 0 };
      for (const s of list) {
        if (!s) continue;
        const pp = s.pp;
        if (pp.margin !== undefined) { const v = len(pp.margin); P.indL = P.indR = P.before = P.after = v; }
        if (pp['margin-left'] !== undefined) P.indL = len(pp['margin-left']);
        if (pp['margin-right'] !== undefined) P.indR = len(pp['margin-right']);
        if (pp['text-indent'] !== undefined) P.first = len(pp['text-indent']);
        if (pp['margin-top'] !== undefined) P.before = len(pp['margin-top']);
        if (pp['margin-bottom'] !== undefined) P.after = len(pp['margin-bottom']);
        if (pp['text-align']) P.jc = pp['text-align'];
        if (pp['line-height'] !== undefined) P.line = pp['line-height'];
        if (pp['line-height-at-least'] !== undefined) P.least = len(pp['line-height-at-least']);
        if (pp['background-color']) P.shd = pp['background-color'] === 'transparent' ? '' : pp['background-color'];
        for (const k of ['border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right']) if (pp[k] !== undefined) (P.box || (P.box = {}))[k] = pp[k];
        if (pp['break-before'] === 'page') P.brk = true;
        if (s.tabs) P.tabs = s.tabs;
        if (s.master) P.master = s.master;
        if (pp['contextual-spacing'] === 'true') P.ctx = true;
      }
      return P;
    }
    const tabDist = len(defaults.paragraph && defaults.paragraph.pp['tab-stop-distance']) || len('1.25cm');
    const paraStyle = (name, hf) => { const ch = chain('paragraph', name, hf); const def = defaults.paragraph; return { P: paraOf([def, ...ch]), R: textOf([def && def.tp, ...ch.map(s => s.tp)]), list: ch.map(s => s.list).filter(Boolean).pop() || '', master: ch.map(s => s.master).filter(x => x !== null && x !== undefined).pop() }; };
    const spanText = (names, base, hf) => textOf(names.flatMap(n => chain('text', n, hf).map(s => s.tp)), base);

    /* ---------------- listes ---------------- */
    const listStyles = {};
    for (const x of [stylesX, content]) if (x) for (const ls of x.getElementsByTagNameNS(NS.text, 'list-style')) {
      const lv = {};
      for (const l of ls.children) {
        const lvl = +A(l, 'text', 'level') || 1;
        const lp = kid(l, 'style', 'list-level-properties'); const la = lp && kid(lp, 'style', 'list-level-label-alignment');
        const o = { type: l.localName === 'list-level-style-bullet' ? 'bullet' : l.localName === 'list-level-style-number' ? 'number' : 'none', fmt: A(l, 'style', 'num-format') ?? '1', prefix: A(l, 'style', 'num-prefix') || '', suffix: A(l, 'style', 'num-suffix') || '', start: +(A(l, 'text', 'start-value') || 1), display: +(A(l, 'text', 'display-levels') || 1), bullet: A(l, 'text', 'bullet-char') || '•', textStyle: A(l, 'text', 'style-name') || '' };
        if (la) { o.ml = len(A(la, 'fo', 'margin-left')); o.ti = len(A(la, 'fo', 'text-indent')); o.follow = A(la, 'text', 'label-followed-by') || 'listtab'; o.tab = A(la, 'text', 'list-tab-stop-position') !== null ? len(A(la, 'text', 'list-tab-stop-position')) : o.ml; }
        else if (lp) { const sb = len(A(lp, 'text', 'space-before')), mw = len(A(lp, 'text', 'min-label-width')); o.ml = sb + mw; o.ti = -mw; o.follow = 'listtab'; o.tab = o.ml; }
        const tp = props(l, 'text-properties').o; if (Object.keys(tp).length) o.tp = tp;
        // puce d'une police de symboles (Symbol, Wingdings, OpenSymbol) : caractère Unicode équivalent
        const bf = (faces[tp['font-name']] || tp['font-name'] || tp['font-family'] || '').toLowerCase();
        const code = o.bullet.charCodeAt(0);
        if (code >= 0xF000 && code <= 0xF0FF) { const c = code - 0xF000; o.bullet = /wingdings/.test(bf) ? ({ 0xA7: '▪', 0xD8: '➢', 0x76: '❖', 0xFC: '✓', 0x6E: '■', 0x71: '❑', 0x6C: '●', 0xA8: '◆' }[c] || '•') : ({ 0xB7: '•', 0xA7: '▪', 0x6F: 'o', 0x2D: '–' }[c] || '•'); delete o.tp['font-name']; }
        lv[lvl] = o;
      }
      listStyles[A(ls, 'style', 'name')] = lv;
    }
    const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    const roman = n => { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; };
    const letters = n => { let s = ''; n = Math.max(1, n); while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
    const fmtNum = (n, f) => (f === 'a' ? letters(n) : f === 'A' ? letters(n).toUpperCase() : f === 'i' ? roman(n) : f === 'I' ? roman(n).toUpperCase() : f === '' ? '' : String(n));

    /* ---------------- pages ---------------- */
    const masters = {};
    for (const mp of (stylesX ? stylesX.getElementsByTagNameNS(NS.style, 'master-page') : [])) masters[A(mp, 'style', 'name')] = mp;
    const layouts = {};
    for (const pl of (stylesX ? stylesX.getElementsByTagNameNS(NS.style, 'page-layout') : [])) layouts[A(pl, 'style', 'name')] = pl;
    const firstMaster = Object.keys(masters)[0] || 'Standard';
    const sections = [];
    const secMaster = [];
    function addSection(mname) {
      const mp = masters[mname] || masters[firstMaster];
      const pl = mp && layouts[A(mp, 'style', 'page-layout-name')];
      const lp = props(pl, 'page-layout-properties').o;
      const hfp = k => { const e = pl && kid(pl, 'style', k); return props(e, 'header-footer-properties').o; };
      let w = len(lp['page-width']) || 793.7, h = len(lp['page-height']) || 1122.5;
      if (lp['print-orientation'] === 'landscape' && w < h) [w, h] = [h, w];
      const m = k => (lp['margin-' + k] !== undefined ? len(lp['margin-' + k]) : lp.margin !== undefined ? len(lp.margin) : 75.6);
      const hp = hfp('header-style'), fp = hfp('footer-style');
      const S = { w, h, mt: m('top'), mb: m('bottom'), ml: m('left'), mr: m('right'), hd: m('top'), fd: m('bottom'), titlePg: false, pgStart: 0, master: mp ? A(mp, 'style', 'name') : '', hp, fp };
      if (mp && kids(mp, 'style', 'header-first').length + kids(mp, 'style', 'footer-first').length) S.titlePg = true;
      if (lp.border || lp['border-top']) S.border = `top:${S.mt}px;left:${S.ml}px;bottom:${S.mb}px;right:${S.mr}px;border:${cssBorder(lp.border || lp['border-top'])}`;
      sections.push(S); secMaster.push(mp); return sections.length - 1;
    }

    /* ---------------- registres ---------------- */
    const reg = { p: [], r: [], h: [], t: [], css: [], pinfo: [], numCss: [] };
    const rendered = new Set();
    const numDefs = {};        // clé de liste → nom du style de liste
    const notes = new Map(); let noteCount = 0;

    function runCss(R) {
      let s = '';
      if (R.font) s += `font-family:${AlixoDocEdit.fontStack(R.font)};`;
      const sz = R.sz || 12;
      if (R.va === 'superscript' || R.va === 'subscript') s += `font-size:${+(sz * 0.58).toFixed(2)}pt;position:relative;top:${R.va === 'superscript' ? '-0.6em' : '0.25em'};`;
      else s += `font-size:${+sz.toFixed(2)}pt;`;
      s += `font-weight:${R.b ? 700 : 400};font-style:${R.i ? 'italic' : 'normal'};`;
      const deco = []; if (R.u && R.u !== 'none') deco.push('underline'); if (R.strike) deco.push('line-through');
      s += `text-decoration-line:${deco.join(' ') || 'none'};`; if (R.u === 'double') s += 'text-decoration-style:double;';
      if (R.color && R.color !== 'auto') s += `color:${R.color};`;
      if (R.hl) s += `background-color:${R.hl};`;
      if (R.caps) s += 'text-transform:uppercase;'; if (R.smallCaps) s += 'font-variant:small-caps;';
      if (R.ls) s += `letter-spacing:${+R.ls.toFixed(2)}px;`;
      if (R.hidden) s += 'display:none;';
      return s;
    }
    function paraCss(P, R, ctx, list) {
      const s = [];
      const indL = list ? list.ml : P.indL, first = list ? list.ti : P.first;
      s.push(`margin-left:${+((ctx.l || 0) + indL).toFixed(2)}px`, `margin-right:${+((ctx.r || 0) + P.indR).toFixed(2)}px`);
      if (first) s.push(`text-indent:${+first.toFixed(2)}px`);
      const box = P.box || {};
      const bt = box['border-top'] || box.border, bb = box['border-bottom'] || box.border, bl = box['border-left'] || box.border, br = box['border-right'] || box.border;
      const pad = k => len(box['padding-' + k] ?? box.padding ?? 0);
      let pt = P.before, pb = P.after;
      if (bt && bt !== 'none') { if (pt) s.push(`margin-top:${pt}px`); pt = 0; }
      if (bb && bb !== 'none') { if (pb) s.push(`margin-bottom:${pb}px`); pb = 0; }
      s.push(`padding-top:${+(pt + (bt && bt !== 'none' ? pad('top') : 0)).toFixed(2)}px`, `padding-bottom:${+(pb + (bb && bb !== 'none' ? pad('bottom') : 0)).toFixed(2)}px`);
      if (bt && bt !== 'none') s.push(`border-top:${cssBorder(bt)}`); if (bb && bb !== 'none') s.push(`border-bottom:${cssBorder(bb)}`);
      if (bl && bl !== 'none') s.push(`border-left:${cssBorder(bl)}`, `padding-left:${pad('left')}px`); if (br && br !== 'none') s.push(`border-right:${cssBorder(br)}`, `padding-right:${pad('right')}px`);
      const jc = P.jc === 'justify' ? 'justify' : P.jc === 'center' ? 'center' : (P.jc === 'end' || P.jc === 'right') ? 'right' : 'left';
      s.push(`text-align:${jc}`);
      const ratio = lhRatio(R.font);
      if (P.line && /%$/.test(P.line)) s.push(`line-height:${+(parseFloat(P.line) / 100 * ratio).toFixed(4)}`);
      else if (P.line && P.line !== 'normal') s.push(`line-height:${len(P.line)}px`);
      else if (P.least) { const nat = ratio * (R.sz || 12) * 96 / 72; s.push(P.least > nat ? `line-height:${P.least}px` : `line-height:${ratio}`); }
      else s.push(`line-height:${ratio}`);
      if (R.font) s.push(`font-family:${AlixoDocEdit.fontStack(R.font)}`);
      s.push(`font-size:${+(R.sz || 12).toFixed(2)}pt`);
      if (P.shd) s.push(`background-color:${P.shd}`);
      return s.join(';');
    }

    /* ---------------- rendu ---------------- */
    function renderBlocks(container, ctx, listCtx) {
      let h = '';
      for (const c of container.children) {
        const n = c.localName, ns = c.namespaceURI;
        if (ctx.top) { const S = sections[ctx.sec.i]; const off = (pageMax() - S.w) / 2; ctx.l = S.ml + off; ctx.r = S.mr + off; ctx.w = S.w - S.ml - S.mr; }
        if (ns === NS.text && (n === 'p' || n === 'h')) h += renderP(c, ctx, listCtx);
        else if (ns === NS.text && n === 'list') h += renderList(c, ctx, listCtx);
        else if (ns === NS.table && n === 'table') h += renderTable(c, ctx);
        else if (ns === NS.text && (n === 'section' || n === 'index-body' || n === 'table-of-content' || n === 'illustration-index' || n === 'alphabetical-index' || n === 'bibliography' || n === 'user-index')) h += renderBlocks(n === 'section' || n === 'index-body' ? c : (kid(c, 'text', 'index-body') || c), ctx, listCtx);
        else if (ns === NS.draw && ctx.top) { const id = reg.r.push(c) - 1; h += `<div class="wfixed" contenteditable="false" data-ri="${id}">${frameHTML(c, ctx, { block: true }).html}</div>`; }
      }
      return h;
    }
    /* listes : numérotation (continuation, reprise), retraits du niveau */
    let lastListKey = {}, listSeq = 0;
    function renderList(el, ctx, parent) {
      const styleName = A(el, 'text', 'style-name') || (parent && parent.style) || '';
      const level = parent ? parent.level + 1 : 1;
      let key;
      if (parent) key = parent.key;
      else if (A(el, 'text', 'continue-numbering') === 'true' || A(el, 'text', 'continue-list')) key = lastListKey[styleName] || ('L' + (++listSeq));
      else key = 'L' + (++listSeq);
      if (!parent) lastListKey[styleName] = key;
      numDefs[key] = styleName;
      let h = '';
      for (const item of el.children) {
        if (item.localName !== 'list-item' && item.localName !== 'list-header') continue;
        const start = A(item, 'text', 'start-value');
        let first = true;
        for (const c of item.children) {
          const n = c.localName;
          if (n === 'p' || n === 'h') { h += renderP(c, ctx, { key, level, style: styleName, numbered: first && item.localName === 'list-item', start: first ? start : null }); first = false; }
          else if (n === 'list') { h += renderList(c, ctx, { key, level, style: styleName }); first = false; }
        }
      }
      return h;
    }
    function renderP(pEl, ctxIn, list) {
      const ctx = ctxIn.top ? Object.assign({}, ctxIn, { sec: ctxIn.sec }) : ctxIn;
      const sname = A(pEl, 'text', 'style-name') || '';
      // changement de page maîtresse : nouvelle section
      let brk = false;
      if (ctxIn.top) {
        // un style de paragraphe qui désigne une page maîtresse commence une nouvelle page (nouvelle section)
        const ps0 = paraStyle(sname, ctx.hf);
        if (ps0.master && ctxIn.started) { ctxIn.sec.i = addSection(ps0.master); brk = true; }
        ctxIn.started = true;
        const S = sections[ctxIn.sec.i]; const off = (pageMax() - S.w) / 2; ctx.l = S.ml + off; ctx.r = S.mr + off; ctx.w = S.w - S.ml - S.mr;
      }
      const ps = paraStyle(sname, ctx.hf);
      const P = ps.P;
      let lv = null;
      if (list) { const ls = listStyles[list.style || ps.list]; lv = ls && (ls[list.level] || ls[Math.min(10, list.level)]); }
      const pi = ctx.hf ? -1 : reg.p.push(pEl) - 1;
      if (!ctx.hf) { rendered.add(pi); reg.pinfo[pi] = { ctx: Object.assign({}, ctx), sname, list }; }
      const st = { ctx, R: ps.R, hasTab: false, chain: [], indL: lv ? lv.ml : P.indL, ws: { prev: true }, ids: {} };
      let inner = renderInline(pEl, st);
      if (!/[^\s]/.test(inner.replace(/<[^>]*>/g, '')) && !/wkeep(?! wbm)|<br>|wtab/.test(inner)) inner += '<br data-ph="1">';
      const css = paraCss(P, ps.R, ctx, lv && lv.ml !== undefined ? lv : null);
      const attrs = ctx.hf ? '' : ` data-pi="${pi}" data-style="${esc(sname)}"`;
      const blk = ctx.top ? ` data-sec="${ctx.sec.i}"${brk || P.brk ? ' data-brk="1"' : ''}${P.before ? ` data-sb="${+P.before.toFixed(2)}"` : ''}` : '';
      let numAttr = '';
      if (list && list.numbered && lv && lv.type !== 'none' && !ctx.hf) {
        numAttr = ` data-num="${list.key}:${list.level}"${list.start ? ` data-nstart="${+list.start}"` : ''}`;
        const lr = textOf([lv.tp, ...(lv.textStyle ? chain('text', lv.textStyle).map(s => s.tp) : [])], ps.R);
        reg.numCss[pi] = runCss(lr);
        st.hasTab = true;
      }
      const tabs = (P.tabs || []).map(t => [+t.pos.toFixed(2), t.val === 'char' ? 'decimal' : t.val, t.leader ? 'dot' : '']);
      if (lv && lv.follow === 'listtab' && lv.tab !== undefined) tabs.push([+(lv.tab - (lv.ml || 0)).toFixed(2), 'left', '']);
      tabs.sort((a, b) => a[0] - b[0]);
      // les tabulations d'OpenDocument se comptent depuis le retrait du paragraphe
      const tabAttr = st.hasTab || /class="wtab"/.test(inner) ? ` data-il="0" data-dt="${+tabDist.toFixed(2)}"${tabs.length ? ` data-tabs="${esc(JSON.stringify(tabs))}"` : ''}` : '';
      return `<div class="wp"${attrs}${blk}${tabAttr}${numAttr} style="${css}">${inner}</div>`;
    }
    const KEEP_INLINE = new Set(['page-number', 'page-count', 'date', 'time', 'title', 'subject', 'chapter', 'sequence', 'bookmark-ref', 'reference-ref', 'note-ref', 'sequence-ref', 'author-name', 'file-name', 'user-defined', 'variable-get', 'expression', 'hidden-text', 'ruby', 'meta-field']);
    function renderInline(el, st) {
      let h = '';
      const ctx = st.ctx;
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          // espaces : une suite d'espaces compte pour un seul, ceux du début de paragraphe sont ignorés (règle d'OpenDocument)
          let t = n.nodeValue.replace(/[ \t\r\n]+/g, ' ');
          if (st.ws.prev) t = t.replace(/^ /, '');
          if (t) { h += textRun(t, st); st.ws.prev = t.endsWith(' '); }
          continue;
        }
        if (n.nodeType !== 1) continue;
        const ln = n.localName, ns = n.namespaceURI;
        if (ns === NS.text) {
          if (ln === 'span') { const sub = Object.assign({}, st, { chain: st.chain.concat([A(n, 'text', 'style-name') || '']) }); h += renderInline(n, sub); st.hasTab = st.hasTab || sub.hasTab; continue; }
          if (ln === 's') { h += textRun(' '.repeat(Math.max(1, +A(n, 'text', 'c') || 1)), st); st.ws.prev = false; continue; }
          if (ln === 'tab') { h += ctx.hf ? '<span class="wtab"></span>' : `<span class="wtab" contenteditable="false" data-ri="${runId(st)}"></span>`; st.hasTab = true; continue; }
          if (ln === 'line-break') { h += '<br>'; st.ws.prev = true; continue; }
          if (ln === 'soft-page-break') continue;
          if (ln === 'a') {
            const href = A(n, 'xlink', 'href') || '';
            if (ctx.hf) { h += `<a class="wh" href="${esc(href)}">${renderInline(n, st)}</a>`; continue; }
            const hid = reg.h.push(n) - 1;
            const sub = Object.assign({}, st, { h: hid });
            h += `<a class="wh" data-h="${hid}" href="${esc(href)}" title="${esc(href)} — Ctrl + clic pour suivre le lien">${renderInline(n, sub)}</a>`; continue;
          }
          if (ln === 'page-number' && ctx.hf) { h += '<span class="wfld" data-f="PAGE"></span>'; continue; }
          if (ln === 'page-count' && ctx.hf) { h += '<span class="wfld" data-f="NUMPAGES"></span>'; continue; }
          if (ln === 'note') {
            const cit = kid(n, 'text', 'note-citation'); const label = cit ? cit.textContent : String(++noteCount);
            const nid = 'n' + notes.size; notes.set(nid, { body: kid(n, 'text', 'note-body'), label });
            if (ctx.hf) { h += `<sup>${esc(label)}</sup>`; continue; }
            const id = reg.r.push(n) - 1;
            h += `<span class="wkeep" data-ri="${id}" contenteditable="false"><sup class="wfnref" data-fn="${nid}">${esc(label)}</sup></span>`; continue;
          }
          if (ln === 'bookmark' || ln === 'bookmark-start' || ln === 'bookmark-end' || ln === 'reference-mark' || ln === 'reference-mark-start' || ln === 'reference-mark-end' || ln === 'alphabetical-index-mark' || ln === 'toc-mark' || ln === 'change' || ln === 'change-start' || ln === 'change-end') {
            if (ctx.hf) continue;
            const id = reg.r.push(n) - 1; h += `<span class="wkeep wbm" data-ri="${id}" contenteditable="false"></span>`; continue;
          }
          if (ln === 'meta') { h += renderInline(n, st); continue; }
          if (KEEP_INLINE.has(ln)) {
            const R = spanText(st.chain, st.R, ctx.hf);
            if (ctx.hf) { h += `<span style="${runCss(R)}">${esc(n.textContent)}</span>`; continue; }
            const id = reg.r.push(n) - 1; h += `<span class="wkeep" data-ri="${id}" contenteditable="false" style="${runCss(R)}">${esc(n.textContent)}</span>`; continue;
          }
          h += renderInline(n, st); continue;
        }
        if (ns === NS.draw) {
          const R = spanText(st.chain, st.R, ctx.hf);
          const f = frameHTML(n, ctx, { indL: st.indL });
          if (ctx.hf) { h += `<span style="${runCss(R)}${f.style}"${f.abs || ''}>${f.html}</span>`; continue; }
          const id = reg.r.push(n) - 1;
          h += `<span class="wkeep" data-ri="${id}" contenteditable="false" style="${runCss(R)}${f.style}">${f.html}</span>`; continue;
        }
        if (ns === NS.office && ln === 'annotation') { if (!ctx.hf) { const id = reg.r.push(n) - 1; h += `<span class="wkeep wbm" data-ri="${id}" contenteditable="false"></span>`; } continue; }
      }
      return h;
    }
    function runId(st) {
      const key = st.chain.join('>');
      if (st.ids[key] !== undefined) return st.ids[key];
      const id = reg.r.push({ chain: st.chain.slice() }) - 1;
      st.ids[key] = id; return id;
    }
    function textRun(text, st) {
      const R = spanText(st.chain, st.R, st.ctx.hf);
      const css = runCss(R);
      if (st.ctx.hf) return `<span style="${css}">${esc(text)}</span>`;
      const id = runId(st); reg.css[id] = css;
      const va = R.va === 'superscript' || R.va === 'subscript' ? ` data-va="${R.va}"` : '';
      return `<span class="wr" data-ri="${id}"${va} data-sz="${+(R.sz || 12).toFixed(2)}" style="${css}">${esc(text)}</span>`;
    }
    /* cadres, images, formes avec texte */
    function frameHTML(f, ctx, o) {
      const gst = find('graphic', A(f, 'draw', 'style-name'), ctx.hf);
      const gp = gst ? Object.assign({}, ...chain('graphic', A(f, 'draw', 'style-name'), ctx.hf).map(s => s.gp)) : {};
      const w = len(A(f, 'svg', 'width')), h = len(A(f, 'svg', 'height'));
      const x = len(A(f, 'svg', 'x')), y = len(A(f, 'svg', 'y'));
      const anchor = A(f, 'text', 'anchor-type') || 'paragraph';
      let inner = '';
      const img = kid(f, 'draw', 'image');
      const tb = kid(f, 'draw', 'text-box');
      const bg = gp['fill-color'] && gp.fill !== 'none' ? gp['fill-color'] : (gp['background-color'] && gp['background-color'] !== 'transparent' ? gp['background-color'] : '');
      const stroke = gp.stroke && gp.stroke !== 'none' ? `${Math.max(1, len(gp['stroke-width'] || '0.03cm'))}px solid ${gp['stroke-color'] || '#000'}` : (gp.border && gp.border !== 'none' ? cssBorder(gp.border) : '');
      const pad = `${len(gp['padding-top'] || gp.padding || 0)}px ${len(gp['padding-right'] || gp.padding || 0)}px ${len(gp['padding-bottom'] || gp.padding || 0)}px ${len(gp['padding-left'] || gp.padding || 0)}px`;
      const tc = c => renderBlocks(c, Object.assign({}, ctx, { top: false, l: 0, r: 0, w: w, sec: ctx.sec ? { i: ctx.sec.i } : null }));
      if (img) { const u = media(A(img, 'xlink', 'href')); inner = u ? `<img src="${u}" alt="" draggable="false" style="width:100%;height:100%;display:block">` : '<span class="wimg-missing">Image</span>'; }
      else if (tb || f.localName === 'custom-shape' || f.localName === 'rect' || f.localName === 'ellipse') {
        const holder = tb || f;
        const v = gp['textarea-vertical-align'];
        inner = `<div class="wtxbx" style="width:100%;height:100%;box-sizing:border-box;${bg ? 'background:' + bg + ';' : ''}${stroke ? 'border:' + stroke + ';' : ''}padding:${pad};${f.localName === 'ellipse' ? 'border-radius:50%;' : ''}display:flex;flex-direction:column;justify-content:${v === 'middle' ? 'center' : v === 'bottom' ? 'flex-end' : 'flex-start'}"><div class="wtxbx-in"${ctx.hf ? '' : ' contenteditable="true"'}>${tc(holder)}</div></div>`;
      } else if (f.localName === 'line') inner = `<div class="wshape" style="width:100%;border-top:${stroke || '1px solid #000'}"></div>`;
      else inner = '';
      if (anchor === 'as-char') return { html: inner, style: `display:inline-block;width:${w}px;height:${h}px;vertical-align:text-bottom;text-indent:0;line-height:normal;` };
      const S = sections[(ctx.sec && ctx.sec.i) || 0] || sections[0];
      const hrel = gp['horizontal-rel'] || 'paragraph', hpos = gp['horizontal-pos'] || 'from-left';
      const areaL = /page/.test(hrel) && !/content/.test(hrel) ? 0 : S.ml, areaW = /page/.test(hrel) && !/content/.test(hrel) ? S.w : S.w - S.ml - S.mr;
      let xPage = hpos === 'center' ? areaL + (areaW - w) / 2 : hpos === 'right' ? areaL + areaW - w : hpos === 'left' ? areaL : areaL + x;
      const pLeft = ctx.top ? (ctx.l || 0) + (o.indL || 0) : 0;
      const pOff = (pageMax() - S.w) / 2;
      const dx = ctx.top || o.block ? xPage + pOff - (o.block ? 0 : pLeft) : x;
      const wrap = gp.wrap || 'none';
      const vrel = gp['vertical-rel'] || 'paragraph';
      if (o.block) return { html: `<div style="position:relative;height:0"><div style="position:absolute;left:${xPage + pOff}px;top:${y}px;width:${w}px;height:${h}px">${inner}</div></div>` };
      if (ctx.hf && /page/.test(vrel)) return { html: inner, style: `display:block;position:absolute;left:${dx}px;top:0;width:${w}px;height:${h}px;text-indent:0;line-height:normal;`, abs: ` data-px="${+xPage.toFixed(2)}" data-py="${+y.toFixed(2)}"` };
      if (wrap === 'none') return { html: inner, style: `display:block;width:${w}px;height:${h}px;margin:${Math.max(0, y)}px 0 0 ${dx}px;text-indent:0;line-height:normal;overflow:hidden;` };
      if (wrap === 'run-through') return { html: inner, style: `display:block;position:absolute;left:${dx}px;top:${y}px;width:${w}px;height:${h}px;z-index:${gp['run-through'] === 'background' ? -1 : 2};text-indent:0;line-height:normal;` };
      const left = (xPage - S.ml) + w / 2 < (S.w - S.ml - S.mr) / 2;
      return { html: inner, style: `display:block;float:${left ? 'left' : 'right'};width:${w}px;height:${h}px;margin:${Math.max(0, y)}px ${left ? len(gp['margin-right'] || 0) : 0}px ${len(gp['margin-bottom'] || 0)}px ${left ? Math.max(0, dx) : len(gp['margin-left'] || 0)}px;text-indent:0;line-height:normal;` };
    }
    /* tableaux */
    function renderTable(tbl, ctx) {
      const ts = find('table', A(tbl, 'table', 'style-name'), ctx.hf);
      const tbp = ts ? ts.tbp : {};
      const cols = [];
      const colWalk = el => { for (const c of el.children) { if (c.localName === 'table-column') { const cs = find('table-column', A(c, 'table', 'style-name'), ctx.hf); const wv = cs ? len(cs.colp['column-width']) : 0; const rep = +A(c, 'table', 'number-columns-repeated') || 1; for (let i = 0; i < Math.min(rep, 64); i++) cols.push(wv || 0); } else if (c.localName === 'table-columns' || c.localName === 'table-column-group' || c.localName === 'table-header-columns') colWalk(c); } };
      colWalk(tbl);
      const avail = ctx.w || 600;
      let tw = len(tbp.width) || cols.reduce((a, b) => a + b, 0) || avail;
      if (!cols.length || cols.every(x => !x)) { const n = Math.max(1, cols.length || 1); cols.length = 0; for (let i = 0; i < n; i++) cols.push(tw / n); }
      const align = tbp.align || 'margins';
      const ml = (ctx.l || 0) + (align === 'center' ? (avail - tw) / 2 : align === 'right' ? avail - tw : len(tbp['margin-left'] || 0));
      const ti = ctx.hf ? -1 : reg.t.push(tbl) - 1;
      const rows = [];
      const rowWalk = el => { for (const c of el.children) { if (c.localName === 'table-row') rows.push(c); else if (c.localName === 'table-header-rows' || c.localName === 'table-rows' || c.localName === 'table-row-group') rowWalk(c); } };
      rowWalk(tbl);
      let html = `<table class="wt"${ti >= 0 ? ` data-ti="${ti}"` : ''}${ctx.top ? ` data-sec="${ctx.sec.i}"` : ''} style="margin-left:${+ml.toFixed(2)}px;width:${+tw.toFixed(2)}px"><colgroup>${cols.map(w => `<col style="width:${+w.toFixed(2)}px">`).join('')}</colgroup><tbody>`;
      for (const tr of rows) {
        const rs = find('table-row', A(tr, 'table', 'style-name'), ctx.hf);
        const rh = rs ? len(rs.rowp['min-row-height'] || rs.rowp['row-height']) : 0;
        html += `<tr${rh ? ` style="height:${rh}px"` : ''}>`;
        let ci = 0;
        for (const tc of tr.children) {
          if (tc.localName === 'covered-table-cell') { ci++; continue; }
          if (tc.localName !== 'table-cell') continue;
          const span = +A(tc, 'table', 'number-columns-spanned') || 1, rspan = +A(tc, 'table', 'number-rows-spanned') || 1;
          const cs = find('table-cell', A(tc, 'table', 'style-name'), ctx.hf); const cp = cs ? cs.cp : {};
          const b = k => cssBorder(cp['border-' + k] || cp.border || 'none');
          const pd = k => len(cp['padding-' + k] ?? cp.padding ?? '0.1cm');
          const cw = cols.slice(ci, ci + span).reduce((a, x) => a + x, 0);
          const va = cp['vertical-align'];
          const css = `border-top:${b('top')};border-bottom:${b('bottom')};border-left:${b('left')};border-right:${b('right')};padding:${pd('top')}px ${pd('right')}px ${pd('bottom')}px ${pd('left')}px;vertical-align:${va === 'middle' ? 'middle' : va === 'bottom' ? 'bottom' : 'top'}${cp['background-color'] && cp['background-color'] !== 'transparent' ? ';background:' + cp['background-color'] : ''}`;
          const inner = renderBlocks(tc, Object.assign({}, ctx, { top: false, l: 0, r: 0, w: Math.max(10, cw - pd('left') - pd('right')), sec: ctx.sec ? { i: ctx.sec.i } : null }));
          html += `<td${span > 1 ? ` colspan="${span}"` : ''}${rspan > 1 ? ` rowspan="${rspan}"` : ''} style="${css}">${inner || '<div class="wp"><br data-ph="1"></div>'}</td>`;
          ci += span;
        }
        html += '</tr>';
      }
      return html + '</tbody></table>';
    }
    /* largeur de la plus grande page possible (toutes les mises en page du fichier) : sert à centrer chaque page */
    let maxW = 0;
    function pageMax() {
      if (!maxW) for (const pl of Object.values(layouts)) { const o = props(pl, 'page-layout-properties').o; let w = len(o['page-width']) || 793.7, h = len(o['page-height']) || 1122.5; if (o['print-orientation'] === 'landscape' && w < h) w = h; maxW = Math.max(maxW, w); }
      return Math.max(maxW, ...sections.map(x => x.w));
    }

    /* ---------------- corps ---------------- */
    // page maîtresse de départ : celle du premier paragraphe qui en désigne une, sinon la première
    let startMaster = firstMaster;
    for (const p of officeText.getElementsByTagNameNS(NS.text, 'p')) { const m = paraStyle(A(p, 'text', 'style-name') || '').master; if (m) startMaster = m; break; }
    addSection(startMaster);
    const topCtx = { top: true, l: sections[0].ml, r: 0, w: sections[0].w - sections[0].ml - sections[0].mr, sec: { i: 0 }, started: false };
    const html = renderBlocks(officeText, topCtx);

    /* ---------------- en-têtes, pieds de page, notes ---------------- */
    const hfHtml = new Map();
    function hf(si, kind) {
      const mp = secMaster[si]; const S = sections[si];
      if (!mp) return { header: '', footer: '' };
      const pick = base => { const el = kind === 'first' ? (kid(mp, 'style', base + '-first') || null) : kind === 'even' ? (kid(mp, 'style', base + '-left') || kid(mp, 'style', base)) : kid(mp, 'style', base); return el && A(el, 'style', 'display') !== 'false' ? el : null; };
      const render = (el, base) => {
        if (!el) return '';
        const key = si + ':' + kind + ':' + base;
        if (hfHtml.has(key)) return hfHtml.get(key);
        const hp = base === 'header' ? S.hp : S.fp;
        const inner = renderBlocks(el, { top: false, hf: true, l: 0, r: 0, w: S.w - S.ml - S.mr, sec: { i: si } });
        const sp = len(base === 'header' ? hp['margin-bottom'] : hp['margin-top']);
        const mh = len(hp['min-height']);
        const out = `<div style="${base === 'header' ? 'padding-bottom' : 'padding-top'}:${sp}px;min-height:${mh}px;box-sizing:border-box">${inner}</div>`;
        hfHtml.set(key, out); return out;
      };
      return { header: render(pick('header'), 'header'), footer: render(pick('footer'), 'footer') };
    }
    function footnoteHtml(id) {
      const n = notes.get(id); if (!n || !n.body) return '';
      const S = sections[0];
      const inner = renderBlocks(n.body, { top: false, hf: true, l: 0, r: 0, w: S.w - S.ml - S.mr, sec: { i: 0 } });
      return `<div class="wdx-fn" style="font-size:10pt"><sup>${esc(n.label)}</sup> ${inner.replace(/^<div class="wp"([^>]*)>/, '<div class="wp"$1 style="display:inline">')}</div>`;
    }

    /* ---------------- numéros de liste ---------------- */
    function renumber(flow) {
      const cnt = {};
      for (const p of flow.querySelectorAll('div.wp[data-num]')) {
        const [key, lvS] = p.dataset.num.split(':'); const lvl = +lvS;
        const ls = listStyles[numDefs[key]] || {}; const L = ls[lvl]; if (!L) continue;
        const c = cnt[key] || (cnt[key] = {});
        if (p.dataset.nstart) c[lvl] = +p.dataset.nstart; else c[lvl] = c[lvl] === undefined ? L.start : c[lvl] + 1;
        for (const k of Object.keys(c)) if (+k > lvl) delete c[k];
        let text;
        if (L.type === 'bullet') text = L.bullet;
        else {
          const parts = [];
          for (let k = Math.max(1, lvl - L.display + 1); k <= lvl; k++) { const LL = ls[k]; parts.push(fmtNum(c[k] ?? (LL ? LL.start : 1), LL ? LL.fmt : '1')); }
          text = L.prefix + parts.join('.') + L.suffix;
        }
        let w = p.firstChild && p.firstChild.nodeType === 1 && p.firstChild.classList.contains('wnum') ? p.firstChild : null;
        if (!w) { p.querySelectorAll(':scope > .wnum').forEach(x => x.remove()); w = document.createElement('span'); w.className = 'wnum'; w.contentEditable = 'false'; p.insertBefore(w, p.firstChild); }
        const k2 = text + '|' + L.follow;
        if (w.dataset.t !== k2) { w.dataset.t = k2; w.innerHTML = esc(text) + (L.follow === 'listtab' ? '<span class="wtab"></span>' : L.follow === 'space' ? ' ' : ''); }
        const css = reg.numCss[+p.dataset.pi] || ''; if (w.getAttribute('style') !== css) w.setAttribute('style', css);
      }
      flow.querySelectorAll('div.wp:not([data-num]) > .wnum').forEach(x => x.remove());
    }
    function applyStyle(p, sname) {
      const info = reg.pinfo[+p.dataset.pi]; if (!info) return;
      const ps = paraStyle(sname);
      const keep = p.style.marginTop;
      const ctxL = p.closest('td, .wtxbx-in') ? Object.assign({}, info.ctx, { l: 0, r: 0 }) : info.ctx;
      p.setAttribute('style', paraCss(ps.P, ps.R, ctxL, null)); if (keep) p.style.marginTop = keep;
      p.dataset.style = sname;
      for (const sp of p.querySelectorAll('.wr')) { const r = reg.r[+sp.dataset.ri]; const R = spanText(r && r.chain || [], ps.R); sp.setAttribute('style', runCss(R)); sp.dataset.sz = String(R.sz || 12); }
    }
    const baseCss = ri => reg.css[+ri] ?? null;
    const styleList = Object.values(common).filter(s => s.family === 'paragraph').map(s => ({ id: s.name, name: s.display || s.name.replace(/_20_/g, ' ') })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    /* ============================================================
       Réécriture
       ============================================================ */
    const mkT = n => content.createElementNS(NS.text, 'text:' + n);
    let autoN = 0;
    const autoName = pre => { let n; do { n = `Alx${pre}${++autoN}`; } while (autoC['text:' + n] || autoC['paragraph:' + n] || common['text:' + n]); return n; };
    const autoCache = new Map();
    function ensureFace(font) {
      const decls = content.getElementsByTagNameNS(NS.office, 'font-face-decls')[0];
      for (const [k, v] of Object.entries(faces)) if (v === font || k === font) return k;
      if (!decls) return null;
      const f = content.createElementNS(NS.style, 'style:font-face');
      f.setAttributeNS(NS.style, 'style:name', font); f.setAttributeNS(NS.svg, 'svg:font-family', `'${font}'`);
      decls.appendChild(f); faces[font] = font; return font;
    }
    /* style de texte pour une portion : chaîne d'origine (+ retouches) → un nom de style */
    function textStyleFor(chainNames, fmt) {
      const names = (chainNames || []).filter(Boolean);
      const keys = fmt ? Object.keys(fmt).filter(k => k !== 'vbase' || fmt.va) : [];
      if (!keys.length && names.length <= 1) return names[0] || '';
      const cacheKey = names.join('>') + '|' + JSON.stringify(fmt || {});
      if (autoCache.has(cacheKey)) return autoCache.get(cacheKey);
      const st = content.createElementNS(NS.style, 'style:style');
      const name = autoName('T'); st.setAttributeNS(NS.style, 'style:name', name); st.setAttributeNS(NS.style, 'style:family', 'text');
      const tp = content.createElementNS(NS.style, 'style:text-properties');
      // propriétés de la chaîne d'origine (styles automatiques à plat ; un style commun devient le parent)
      for (const nm of names) {
        const s = find('text', nm);
        if (!s) continue;
        if (!s.auto) { st.setAttributeNS(NS.style, 'style:parent-style-name', nm); continue; }
        if (s.parent) st.setAttributeNS(NS.style, 'style:parent-style-name', s.parent);
        const src = s.el && kid(s.el, 'style', 'text-properties');
        if (src) for (const at of src.attributes) tp.setAttributeNS(at.namespaceURI, at.name, at.value);
      }
      const set = (ns, n, v) => tp.setAttributeNS(NS[ns], ns + ':' + n, v);
      if (fmt) {
        if ('b' in fmt) { set('fo', 'font-weight', fmt.b ? 'bold' : 'normal'); set('style', 'font-weight-asian', fmt.b ? 'bold' : 'normal'); set('style', 'font-weight-complex', fmt.b ? 'bold' : 'normal'); }
        if ('i' in fmt) { set('fo', 'font-style', fmt.i ? 'italic' : 'normal'); set('style', 'font-style-asian', fmt.i ? 'italic' : 'normal'); set('style', 'font-style-complex', fmt.i ? 'italic' : 'normal'); }
        if ('u' in fmt) { set('style', 'text-underline-style', fmt.u ? 'solid' : 'none'); if (fmt.u) { set('style', 'text-underline-width', 'auto'); set('style', 'text-underline-color', 'font-color'); } }
        if ('s' in fmt) { set('style', 'text-line-through-style', fmt.s ? 'solid' : 'none'); if (fmt.s) set('style', 'text-line-through-type', 'single'); }
        if (fmt.font) { const fn = ensureFace(fmt.font); if (fn) set('style', 'font-name', fn); else set('fo', 'font-family', fmt.font); }
        const size = fmt.vbase || fmt.sz; if (size) { set('fo', 'font-size', size + 'pt'); set('style', 'font-size-asian', size + 'pt'); set('style', 'font-size-complex', size + 'pt'); }
        if (fmt.color) set('fo', 'color', fmt.color === 'auto' ? '#000000' : fmt.color);
        if ('hl' in fmt) set('fo', 'background-color', fmt.hl || 'transparent');
        if (fmt.va) set('style', 'text-position', fmt.va === 'superscript' ? 'super 58%' : fmt.va === 'subscript' ? 'sub 58%' : '0% 100%');
      }
      st.appendChild(tp);
      asC.appendChild(st);
      autoC['text:' + name] = readStyle(st, true);
      autoCache.set(cacheKey, name); return name;
    }
    function paraStyleWith(pEl, el) {
      const o = el.dataset.ppr ? JSON.parse(el.dataset.ppr) : {};
      let name = A(pEl, 'text', 'style-name') || '';
      if (o.style) name = o.style;
      if (o.jc) {
        const cur = find('paragraph', name);
        const st = cur && cur.auto ? cur.el.cloneNode(true) : content.createElementNS(NS.style, 'style:style');
        const nn = autoName('P');
        st.setAttributeNS(NS.style, 'style:name', nn); st.setAttributeNS(NS.style, 'style:family', 'paragraph');
        if (!(cur && cur.auto) && name) st.setAttributeNS(NS.style, 'style:parent-style-name', name);
        let pp = kid(st, 'style', 'paragraph-properties'); if (!pp) { pp = content.createElementNS(NS.style, 'style:paragraph-properties'); st.insertBefore(pp, st.firstChild); }
        pp.setAttributeNS(NS.fo, 'fo:text-align', o.jc === 'both' ? 'justify' : o.jc === 'right' ? 'end' : o.jc === 'center' ? 'center' : 'start');
        asC.appendChild(st); autoC['paragraph:' + nn] = readStyle(st, true); name = nn;
      }
      return name;
    }
    function appendText(parent, s) {
      // OpenDocument réduit les espaces : les espaces multiples et ceux du début s'écrivent <text:s/>
      const parts = s.split(/( {2,})/);
      for (const part of parts) {
        if (!part) continue;
        if (/^ {2,}$/.test(part)) { parent.appendChild(content.createTextNode(' ')); const sp = mkT('s'); if (part.length > 2) sp.setAttributeNS(NS.text, 'text:c', String(part.length - 1)); parent.appendChild(sp); continue; }
        parent.appendChild(content.createTextNode(part));
      }
    }
    function fill(xp, el, H) {
      const segs = H.segments(el);
      for (const c of [...xp.childNodes]) xp.removeChild(c);
      const kept = new Set();
      let host = null, hostH = null, span = null, spanKey = null, atStart = true;
      const target = () => host || xp;
      for (const s of segs) {
        if ((s.h ?? null) !== hostH) { hostH = s.h ?? null; span = null; spanKey = null; host = hostH !== null && reg.h[+hostH] ? reg.h[+hostH].cloneNode(false) : null; if (host) xp.appendChild(host); }
        if (s.t === 'keep') { let node = reg.r[+s.ri]; if (!node || !node.nodeType) continue; if (kept.has(node)) node = node.cloneNode(true); kept.add(node); target().appendChild(node); span = null; spanKey = null; atStart = false; continue; }
        const r = reg.r[+s.ri]; const chainNames = r && r.chain ? r.chain : [];
        const sname = textStyleFor(chainNames, s.fmt && Object.keys(s.fmt).length ? s.fmt : null);
        const key = sname + '|' + (hostH ?? '');
        if (key !== spanKey) { spanKey = key; if (sname) { span = mkT('span'); span.setAttributeNS(NS.text, 'text:style-name', sname); target().appendChild(span); } else span = null; }
        const dst = span || target();
        if (s.t === 'text') { let t = s.s; if (atStart && t.startsWith(' ')) { const m = /^ +/.exec(t)[0]; const sp = mkT('s'); if (m.length > 1) sp.setAttributeNS(NS.text, 'text:c', String(m.length)); dst.appendChild(sp); t = t.slice(m.length); } appendText(dst, t); atStart = false; }
        else if (s.t === 'tab') { dst.appendChild(mkT('tab')); atStart = false; }
        else if (s.t === 'br') { dst.appendChild(mkT('line-break')); atStart = true; }
      }
    }
    function removeP(xp) {
      const parent = xp.parentNode; if (!parent) return;
      const isLast = [...parent.children].filter(c => c.localName === 'p' || c.localName === 'h').length <= 1;
      if (parent.localName === 'table-cell' && isLast) { for (const c of [...xp.childNodes]) xp.removeChild(c); return; }
      if ((parent.localName === 'note-body' || parent.localName === 'text-box') && isLast) { for (const c of [...xp.childNodes]) xp.removeChild(c); return; }
      parent.removeChild(xp);
      // élément de liste devenu vide, liste devenue vide
      let n = parent;
      while (n && (n.localName === 'list-item' || n.localName === 'list') && !n.children.length) { const up = n.parentNode; up.removeChild(n); n = up; }
    }
    function buildNew(src, el, H) {
      const np = src.cloneNode(false);
      for (const at of [...np.attributes]) if (at.localName === 'id' || at.name === 'xml:id' || at.localName === 'marker-style-name') np.removeAttributeNode(at);
      const sname = paraStyleWith(np, el); if (sname) np.setAttributeNS(NS.text, 'text:style-name', sname);
      fill(np, el, H);
      return np;
    }
    function insertAfter(src, prev, np) {
      // paragraphe d'un élément de liste : le nouveau paragraphe devient un nouvel élément
      const item = prev.parentNode;
      if (item && item.localName === 'list-item' && [...item.children].find(c => c.localName === 'p' || c.localName === 'h') === prev) {
        const ni = item.cloneNode(false); for (const at of [...ni.attributes]) if (at.localName === 'start-value' || at.localName === 'id' || at.name === 'xml:id') ni.removeAttributeNode(at);
        ni.appendChild(np); item.parentNode.insertBefore(ni, item.nextSibling); return;
      }
      if (item && item.localName === 'list-item' && prev.parentNode !== src.parentNode) { prev.parentNode.insertBefore(np, prev.nextSibling); return; }
      prev.parentNode.insertBefore(np, prev.nextSibling);
    }
    function patch(flow, H) {
      const domT = new Set([...flow.querySelectorAll('table[data-ti]')].map(t => t.dataset.ti));
      reg.t.forEach((t, i) => { if (t && !domT.has(String(i)) && t.parentNode) { t.parentNode.removeChild(t); reg.t[i] = null; } });
      const occ = new Map();
      for (const el of flow.querySelectorAll('[data-pi]')) { const k = el.dataset.pi; if (!occ.has(k)) occ.set(k, []); occ.get(k).push(el); }
      for (const pi of [...rendered]) if (!occ.has(String(pi))) { const x = reg.p[pi]; if (x) removeP(x); rendered.delete(pi); }
      for (const [k, els] of occ) {
        const src = reg.p[+k]; if (!src || !src.parentNode) continue;
        let prev = src;
        els.forEach((el, i) => {
          if (i === 0) {
            if (H.sigOf(el) !== H.orig.get(k)) { const sname = paraStyleWith(src, el); if (sname) src.setAttributeNS(NS.text, 'text:style-name', sname); fill(src, el, H); }
            return;
          }
          const np = buildNew(src, el, H);
          insertAfter(src, prev, np); prev = np;
          const ni = reg.p.push(np) - 1; rendered.add(ni); reg.pinfo[ni] = reg.pinfo[+k]; reg.numCss[ni] = reg.numCss[+k];
          el.dataset.pi = String(ni);
          if (el.dataset.ppr) delete el.dataset.ppr;
        });
      }
    }
    async function pack() {
      let xml = new XMLSerializer().serializeToString(content);
      if (!/^<\?xml/.test(xml)) xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
      return AlixoDocEdit.repack(zip, { 'content.xml': xml }, MIME);
    }
    function dispose() { for (const u of urls.values()) if (u) URL.revokeObjectURL(u); }

    return { html, sections, hf, evenOdd: false, footnoteHtml, renumber, styles: styleList, fonts: [...fontsUsed].filter(Boolean), applyStyle, baseCss, patch, pack, dispose, mime: MIME, note: '' };
  }

  return { load, MIME };
})();
