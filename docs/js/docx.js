/* ============================================================
   Alixo — lecture et réécriture fidèles d'un document Word (.docx) pour l'éditeur (js/docedit.js) (1.34.1)
   Lecture : styles (héritage basedOn, valeurs par défaut, polices du thème), paragraphes (retraits, espacements,
   interligne, alignement, bordures, trame, tabulations, saut de page avant), caractères (police, taille, gras,
   italique, souligné, barré, couleur, surlignage, exposant / indice, majuscules, espacement), listes numérotées et à
   puces (numbering.xml), tableaux (grille, fusions, bordures, trames, marges des cellules), images, zones de texte,
   formes, liens, champs (PAGE, NUMPAGES), notes de bas de page, sections (format, marges, en-têtes et pieds de page
   par section, première page différente, pages paires), bordures de page.
   Réécriture : le XML d'origine est gardé ; seuls les paragraphes modifiés sont reconstruits (en reprenant la mise en
   forme de leurs portions d'origine), les paragraphes ajoutés copient les propriétés de celui qu'ils prolongent, les
   supprimés sont retirés. Tout le reste de l'archive (styles, images, propriétés, en-têtes…) est réécrit à l'identique.
   ============================================================ */
'use strict';

window.AlixoDocx = (() => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const XMLNS_XML = 'http://www.w3.org/XML/1998/namespace';
  const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const tw = v => (+v || 0) / 15;                 // twips → px (96 dpi)
  const emu = v => (+v || 0) / 9525;              // EMU → px
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const at = (el, n) => (el ? (el.getAttributeNS(W, n) ?? el.getAttribute('w:' + n)) : null);
  const ch = (el, n) => { if (!el) return null; for (const c of el.children) if (c.localName === n) return c; return null; };
  const chs = (el, n) => (el ? [...el.children].filter(c => c.localName === n) : []);
  const on = el => { if (!el) return undefined; const v = at(el, 'val'); return !(v === '0' || v === 'false' || v === 'off' || v === 'none'); };
  const HL = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff' };
  const HL_NAME = Object.fromEntries(Object.entries(HL).map(([k, v]) => [v, k]));
  /* hauteur d'une ligne « simple » de Word, en multiple de la taille de la police */
  const LH = { 'times new roman': 1.15, 'liberation serif': 1.15, times: 1.15, arial: 1.15, 'liberation sans': 1.15, helvetica: 1.15, calibri: 1.22, carlito: 1.22, cambria: 1.17, georgia: 1.14, verdana: 1.22, tahoma: 1.21, garamond: 1.12, 'courier new': 1.13, 'segoe ui': 1.33, aptos: 1.2, 'century gothic': 1.23, 'book antiqua': 1.17, 'palatino linotype': 1.32, 'trebuchet ms': 1.16, 'comic sans ms': 1.39 };
  const lhRatio = f => LH[String(f || '').toLowerCase()] || 1.17;
  const SYMBOL = { 0xB7: '•', 0xA7: '♣', 0xA8: '♦', 0x2D: '–', 0xD8: '¬', 0x6F: 'o', 0xAE: '→', 0xDE: '⇒' };
  const WINGDINGS = { 0xA7: '▪', 0xD8: '➢', 0x76: '❖', 0xFC: '✓', 0xFB: '✗', 0x6E: '■', 0x71: '❑', 0x6C: '●', 0xA8: '◆', 0x77: '⬥', 0xF0: '⇨', 0xE8: '➔', 0x9F: '•', 0x75: '◆', 0x6F: '□', 0x4A: '☺', 0xE0: '➜', 0xD9: '⮚', 0x34: '✔' };
  const symChar = (code, font) => {
    let c = code >= 0xF000 ? code - 0xF000 : code;
    const f = String(font || '').toLowerCase();
    if (f.startsWith('wingdings')) return WINGDINGS[c] || '•';
    if (f === 'symbol') return SYMBOL[c] || String.fromCharCode(c);
    return String.fromCharCode(code);
  };
  /* ordre des éléments imposé par le schéma (Word refuse un fichier dans le désordre) */
  const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
  const PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'];
  function setProp(parent, name, order, attrs) {
    for (const c of [...parent.children]) if (c.localName === name) c.remove();
    if (attrs === null) return null;
    const el = parent.ownerDocument.createElementNS(W, 'w:' + name);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttributeNS(W, 'w:' + k, String(v));
    const idx = order.indexOf(name);
    const after = [...parent.children].find(c => order.indexOf(c.localName) > idx);
    parent.insertBefore(el, after || null);
    return el;
  }
  const bdrCss = b => {
    if (!b || !b.val || b.val === 'nil' || b.val === 'none') return 'none';
    const px = Math.max(1, (b.sz || 4) / 8 * 96 / 72);
    const style = /double/.test(b.val) ? 'double' : /dot/.test(b.val) ? 'dotted' : /dash/.test(b.val) ? 'dashed' : 'solid';
    return `${style === 'double' ? Math.max(3, px * 3) : px}px ${style} ${b.color && b.color !== 'auto' ? '#' + b.color : '#000'}`;
  };
  const readBdr = el => (el ? { val: at(el, 'val'), sz: +at(el, 'sz') || 4, color: at(el, 'color'), space: +at(el, 'space') || 0 } : undefined);

  async function load(buf) {
    if (typeof JSZip === 'undefined') throw new Error('lecteur d’archives indisponible');
    const zip = await JSZip.loadAsync(buf);
    const parser = new DOMParser();
    const readXml = async p => { const f = zip.file(p); if (!f) return null; const x = parser.parseFromString(await f.async('string'), 'application/xml'); return x.getElementsByTagName('parsererror').length ? null : x; };
    const dirOf = p => p.replace(/[^/]*$/, '');
    const join = (base, t) => {
      if (t.startsWith('/')) return t.slice(1);
      const parts = (dirOf(base) + t).split('/'); const out = [];
      for (const s of parts) { if (s === '..') out.pop(); else if (s !== '.') out.push(s); }
      return out.join('/');
    };
    const relsCache = new Map();
    const relsOf = async part => {
      if (relsCache.has(part)) return relsCache.get(part);
      const x = await readXml(part.replace(/([^/]+)$/, '_rels/$1.rels'));
      const m = {};
      if (x) for (const r of x.getElementsByTagName('Relationship')) m[r.getAttribute('Id')] = { type: (r.getAttribute('Type') || '').split('/').pop(), target: r.getAttribute('Target') || '', ext: r.getAttribute('TargetMode') === 'External', path: r.getAttribute('TargetMode') === 'External' ? '' : join(part, r.getAttribute('Target') || '') };
      relsCache.set(part, m); return m;
    };
    // partie principale
    let main = 'word/document.xml';
    { const x = await readXml('_rels/.rels'); if (x) for (const r of x.getElementsByTagName('Relationship')) if (/officeDocument$/.test(r.getAttribute('Type') || '')) main = (r.getAttribute('Target') || main).replace(/^\//, ''); }
    const doc = await readXml(main);
    if (!doc) throw new Error('le contenu du document (document.xml) est illisible');
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    if (!body) throw new Error('document sans corps');
    const rels = await relsOf(main);
    const relOfType = t => Object.values(rels).find(r => r.type === t);
    const stylesX = relOfType('styles') ? await readXml(relOfType('styles').path) : null;
    const numX = relOfType('numbering') ? await readXml(relOfType('numbering').path) : null;
    const themeX = relOfType('theme') ? await readXml(relOfType('theme').path) : null;
    const settingsX = relOfType('settings') ? await readXml(relOfType('settings').path) : null;
    const fnRel = relOfType('footnotes'); const fnX = fnRel ? await readXml(fnRel.path) : null;

    /* images : toutes les images de l'archive, en adresses locales */
    const urls = new Map();
    for (const p of Object.keys(zip.files)) {
      if (!/\.(png|jpe?g|gif|bmp|webp|svg|tiff?|emf|wmf)$/i.test(p) || zip.files[p].dir) continue;
      const ext = p.split('.').pop().toLowerCase();
      if (ext === 'emf' || ext === 'wmf' || ext === 'tif' || ext === 'tiff') { urls.set(p, ''); continue; }
      const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' }[ext];
      urls.set(p, URL.createObjectURL(new Blob([await zip.file(p).async('arraybuffer')], { type })));
    }

    /* thème : polices et couleurs */
    const theme = { major: '', minor: '', colors: {} };
    if (themeX) {
      const fs = themeX.getElementsByTagNameNS(A, 'fontScheme')[0];
      const latin = n => { const e = fs && fs.getElementsByTagNameNS(A, n)[0]; const l = e && e.getElementsByTagNameNS(A, 'latin')[0]; return l ? l.getAttribute('typeface') : ''; };
      theme.major = latin('majorFont'); theme.minor = latin('minorFont');
      const cs = themeX.getElementsByTagNameNS(A, 'clrScheme')[0];
      if (cs) for (const c of cs.children) { const v = c.firstElementChild; if (v) theme.colors[c.localName] = v.getAttribute('val') || v.getAttribute('lastClr') || ''; }
    }
    const themeFont = n => (!n ? '' : /^major/i.test(n) ? theme.major : theme.minor);
    const themeColor = n => { const map = { text1: 'dk1', background1: 'lt1', text2: 'dk2', background2: 'lt2', dark1: 'dk1', light1: 'lt1', dark2: 'dk2', light2: 'lt2' }; return theme.colors[map[n] || n] || ''; };
    const settings = { tab: 708, evenOdd: false };
    if (settingsX) {
      const dt = settingsX.getElementsByTagNameNS(W, 'defaultTabStop')[0]; if (dt) settings.tab = +at(dt, 'val') || 708;
      settings.evenOdd = !!settingsX.getElementsByTagNameNS(W, 'evenAndOddHeaders')[0] && on(settingsX.getElementsByTagNameNS(W, 'evenAndOddHeaders')[0]) !== false;
    }
    const fontsUsed = new Set([theme.minor, theme.major].filter(Boolean));

    /* ---------------- propriétés ---------------- */
    function parseRPr(el) {
      const o = {}; if (!el) return o;
      for (const c of el.children) switch (c.localName) {
        case 'rStyle': o.rStyle = at(c, 'val'); break;
        case 'rFonts': { const f = at(c, 'ascii') || at(c, 'hAnsi') || themeFont(at(c, 'asciiTheme') || at(c, 'hAnsiTheme')) || at(c, 'eastAsia') || at(c, 'cs'); if (f) { o.font = f; fontsUsed.add(f); } break; }
        case 'b': o.b = on(c); break;
        case 'i': o.i = on(c); break;
        case 'u': { const v = at(c, 'val') || 'single'; o.u = v; const uc = at(c, 'color'); if (uc && uc !== 'auto') o.uc = '#' + uc; break; }
        case 'strike': o.strike = on(c); break;
        case 'dstrike': o.dstrike = on(c); break;
        case 'sz': o.sz = (+at(c, 'val') || 20) / 2; break;
        case 'color': { const v = at(c, 'val'); const t = at(c, 'themeColor'); o.color = v && v !== 'auto' ? '#' + v : t && themeColor(t) ? '#' + themeColor(t) : 'auto'; break; }
        case 'highlight': { const v = at(c, 'val'); o.hl = v && v !== 'none' ? (HL[v] || '') : ''; break; }
        case 'shd': { const f = at(c, 'fill'); o.shd = f && f !== 'auto' ? '#' + f : ''; break; }
        case 'vertAlign': o.va = at(c, 'val'); break;
        case 'caps': o.caps = on(c); break;
        case 'smallCaps': o.smallCaps = on(c); break;
        case 'vanish': o.hidden = on(c); break;
        case 'spacing': o.ls = tw(at(c, 'val')); break;
        case 'position': o.pos = (+at(c, 'val') || 0) / 2; break;
        default: break;
      }
      return o;
    }
    function parsePPr(el) {
      const o = {}; if (!el) return o;
      for (const c of el.children) switch (c.localName) {
        case 'pStyle': o.style = at(c, 'val'); break;
        case 'jc': o.jc = at(c, 'val'); break;
        case 'spacing': {
          if (at(c, 'before') !== null) o.before = tw(at(c, 'before'));
          if (at(c, 'after') !== null) o.after = tw(at(c, 'after'));
          if (at(c, 'line') !== null) { o.line = +at(c, 'line'); o.rule = at(c, 'lineRule') || 'auto'; }
          if (at(c, 'beforeAutospacing') === '1' || at(c, 'beforeAutospacing') === 'true') o.before = 18.67;
          if (at(c, 'afterAutospacing') === '1' || at(c, 'afterAutospacing') === 'true') o.after = 18.67;
          break;
        }
        case 'ind': {
          const l = at(c, 'left') ?? at(c, 'start'); if (l !== null) o.indL = tw(l);
          const r = at(c, 'right') ?? at(c, 'end'); if (r !== null) o.indR = tw(r);
          if (at(c, 'firstLine') !== null) o.first = tw(at(c, 'firstLine'));
          if (at(c, 'hanging') !== null) o.first = -tw(at(c, 'hanging'));
          break;
        }
        case 'keepNext': o.keepNext = on(c); break;
        case 'pageBreakBefore': o.pbb = on(c); break;
        case 'contextualSpacing': o.ctx = on(c); break;
        case 'numPr': { const id = at(ch(c, 'numId'), 'val'); const lv = at(ch(c, 'ilvl'), 'val'); o.num = { id: id === null ? undefined : +id, lvl: lv === null ? undefined : +lv }; break; }
        case 'pBdr': { o.bdr = {}; for (const b of c.children) o.bdr[b.localName] = readBdr(b); break; }
        case 'shd': { const f = at(c, 'fill'); o.shd = f && f !== 'auto' ? '#' + f : ''; break; }
        case 'tabs': o.tabs = chs(c, 'tab').map(t => ({ val: at(t, 'val'), pos: tw(at(t, 'pos')), leader: at(t, 'leader') || '' })); break;
        case 'outlineLvl': o.outline = +at(c, 'val'); break;
        default: break;
      }
      return o;
    }
    const mergeR = (...a) => Object.assign({}, ...a.filter(Boolean));
    function mergeP(...list) {
      const o = {};
      for (const p of list) {
        if (!p) continue;
        for (const [k, v] of Object.entries(p)) {
          if (v === undefined) continue;
          if (k === 'tabs') { const cur = (o.tabs || []).slice(); for (const t of v) { const i = cur.findIndex(x => Math.abs(x.pos - t.pos) < 1); if (t.val === 'clear') { if (i >= 0) cur.splice(i, 1); } else if (i >= 0) cur[i] = t; else cur.push(t); } o.tabs = cur.sort((a, b) => a.pos - b.pos); }
          else if (k === 'bdr') o.bdr = Object.assign({}, o.bdr, v);
          else if (k === 'num') o.num = Object.assign({}, o.num, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)));
          else o[k] = v;
        }
      }
      return o;
    }

    /* ---------------- styles ---------------- */
    const styles = {};
    let defR = {}, defP = {}, defParaStyle = '', defTableStyle = '';
    if (stylesX) {
      const dd = stylesX.getElementsByTagNameNS(W, 'docDefaults')[0];
      if (dd) { defR = parseRPr(ch(ch(dd, 'rPrDefault'), 'rPr')); defP = parsePPr(ch(ch(dd, 'pPrDefault'), 'pPr')); }
      for (const st of stylesX.getElementsByTagNameNS(W, 'style')) {
        const id = at(st, 'styleId'); if (!id) continue;
        const s = { id, type: at(st, 'type'), name: at(ch(st, 'name'), 'val') || id, basedOn: at(ch(st, 'basedOn'), 'val'), next: at(ch(st, 'next'), 'val'), pPr: parsePPr(ch(st, 'pPr')), rPr: parseRPr(ch(st, 'rPr')), tblPr: ch(st, 'tblPr'), tcPr: ch(st, 'tcPr'), hidden: !!ch(st, 'semiHidden') || !!ch(st, 'hidden'), q: !!ch(st, 'qFormat'), pri: +at(ch(st, 'uiPriority'), 'val') || 99 };
        styles[id] = s;
        const dft = at(st, 'default'); if (dft === '1' || dft === 'true') { if (s.type === 'paragraph') defParaStyle = id; if (s.type === 'table') defTableStyle = id; }
      }
    }
    const memoP = new Map(), memoR = new Map();
    function chainP(id, depth = 0) {
      if (!id || !styles[id] || depth > 20) return {};
      if (memoP.has(id)) return memoP.get(id);
      const s = styles[id]; const o = mergeP(chainP(s.basedOn, depth + 1), s.pPr); memoP.set(id, o); return o;
    }
    function chainR(id, depth = 0) {
      if (!id || !styles[id] || depth > 20) return {};
      if (memoR.has(id)) return memoR.get(id);
      const s = styles[id]; const o = mergeR(chainR(s.basedOn, depth + 1), s.rPr); memoR.set(id, o); return o;
    }
    function tableStyle(id, depth = 0) {
      const out = { bdr: {}, mar: {}, ind: null, pPr: {}, rPr: {}, shd: '' };
      if (!id || !styles[id] || depth > 20) return out;
      const base = tableStyle(styles[id].basedOn, depth + 1);
      const s = styles[id]; const t = readTblPr(s.tblPr);
      return { bdr: Object.assign({}, base.bdr, t.bdr), mar: Object.assign({}, base.mar, t.mar), ind: t.ind !== null ? t.ind : base.ind, pPr: mergeP(base.pPr, s.pPr), rPr: mergeR(base.rPr, s.rPr), shd: (s.tcPr && readShd(ch(s.tcPr, 'shd'))) || base.shd };
    }
    const readShd = el => { const f = at(el, 'fill'); return f && f !== 'auto' ? '#' + f : ''; };
    function readTblPr(el) {
      const o = { bdr: {}, mar: {}, ind: null, jc: '', w: null, wType: '', layout: '' };
      if (!el) return o;
      const b = ch(el, 'tblBorders'); if (b) for (const s of b.children) o.bdr[s.localName === 'start' ? 'left' : s.localName === 'end' ? 'right' : s.localName] = readBdr(s);
      const m = ch(el, 'tblCellMar'); if (m) for (const s of m.children) o.mar[s.localName === 'start' ? 'left' : s.localName === 'end' ? 'right' : s.localName] = tw(at(s, 'w'));
      const ind = ch(el, 'tblInd'); if (ind) o.ind = tw(at(ind, 'w'));
      const jc = ch(el, 'jc'); if (jc) o.jc = at(jc, 'val');
      const w = ch(el, 'tblW'); if (w) { o.w = +at(w, 'w') || 0; o.wType = at(w, 'type') || 'dxa'; }
      return o;
    }

    /* ---------------- numérotation ---------------- */
    const abs = {}, nums = {};
    if (numX) {
      for (const an of numX.getElementsByTagNameNS(W, 'abstractNum')) {
        const id = at(an, 'abstractNumId'); const lv = {};
        for (const l of chs(an, 'lvl')) lv[+at(l, 'ilvl')] = readLvl(l);
        abs[id] = { lv, link: at(ch(an, 'numStyleLink'), 'val') };
      }
      for (const n of numX.getElementsByTagNameNS(W, 'num')) {
        const id = +at(n, 'numId'); const o = { abs: at(ch(n, 'abstractNumId'), 'val'), start: {}, lv: {} };
        for (const ov of chs(n, 'lvlOverride')) { const k = +at(ov, 'ilvl'); const so = ch(ov, 'startOverride'); if (so) o.start[k] = +at(so, 'val'); const l = ch(ov, 'lvl'); if (l) o.lv[k] = readLvl(l); }
        nums[id] = o;
      }
    }
    function readLvl(l) {
      return { fmt: at(ch(l, 'numFmt'), 'val') || 'decimal', text: at(ch(l, 'lvlText'), 'val') ?? '', start: +(at(ch(l, 'start'), 'val') ?? 1), suff: at(ch(l, 'suff'), 'val') || 'tab', pPr: parsePPr(ch(l, 'pPr')), rPr: parseRPr(ch(l, 'rPr')), lgl: !!ch(l, 'isLgl') };
    }
    const levelOf = (numId, ilvl) => { const n = nums[numId]; if (!n) return null; if (n.lv[ilvl]) return n.lv[ilvl]; const a = abs[n.abs]; return a ? a.lv[ilvl] || null : null; };
    const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    const roman = n => { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; };
    const letters = n => { let s = ''; n = Math.max(1, n); while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
    function fmtNum(n, f) {
      switch (f) {
        case 'lowerLetter': return letters(n); case 'upperLetter': return letters(n).toUpperCase();
        case 'lowerRoman': return roman(n); case 'upperRoman': return roman(n).toUpperCase();
        case 'decimalZero': return (n < 10 ? '0' : '') + n; case 'ordinal': return n === 1 ? '1er' : n + 'e';
        case 'none': return ''; case 'bullet': return '';
        default: return String(n);
      }
    }

    /* ---------------- registres (pour la réécriture) ---------------- */
    const reg = { p: [], r: [], h: [], t: [], css: [], pinfo: [], numCss: [] };
    const rendered = new Set();
    const fnNum = new Map(); let fnCount = 0;

    /* ---------------- sections ---------------- */
    const sectEls = [];
    for (const c of body.children) {
      if (c.localName === 'p') { const s = ch(ch(c, 'pPr'), 'sectPr'); if (s) sectEls.push(s); }
      else if (c.localName === 'sectPr') sectEls.push(c);
      else if (c.localName === 'sdt') { for (const p of c.getElementsByTagNameNS(W, 'p')) { const s = ch(ch(p, 'pPr'), 'sectPr'); if (s) sectEls.push(s); } }
    }
    if (!sectEls.length) sectEls.push(null);
    const sections = []; const hfRefs = [];
    let prevRefs = { header: {}, footer: {} };
    for (const s of sectEls) {
      const sz = ch(s, 'pgSz'), mg = ch(s, 'pgMar');
      let w = tw(at(sz, 'w') || 11906), h = tw(at(sz, 'h') || 16838);
      if (at(sz, 'orient') === 'landscape' && w < h) [w, h] = [h, w];
      const S = {
        w, h, mt: tw(at(mg, 'top') ?? 1440), mb: tw(at(mg, 'bottom') ?? 1440), ml: tw(at(mg, 'left') ?? 1440), mr: tw(at(mg, 'right') ?? 1440),
        hd: tw(at(mg, 'header') ?? 708), fd: tw(at(mg, 'footer') ?? 708), type: at(ch(s, 'type'), 'val') || 'nextPage',
        titlePg: !!ch(s, 'titlePg') && on(ch(s, 'titlePg')) !== false, pgStart: +at(ch(s, 'pgNumType'), 'start') || 0, cols: +at(ch(s, 'cols'), 'num') || 1
      };
      S.mt = Math.abs(S.mt); S.mb = Math.abs(S.mb);
      const pb = ch(s, 'pgBorders');
      if (pb) {
        const fromText = at(pb, 'offsetFrom') !== 'page';
        const side = n => { const b = readBdr(ch(pb, n)); return b ? { css: bdrCss(b), sp: (b.space || 0) * 96 / 72 } : null; };
        const t = side('top'), l = side('left'), b = side('bottom'), r = side('right');
        const pos = (x, m) => (x ? (fromText ? m - x.sp : x.sp) : m);
        S.border = `top:${pos(t, S.mt)}px;left:${pos(l, S.ml)}px;bottom:${pos(b, S.mb)}px;right:${pos(r, S.mr)}px;border-top:${t ? t.css : 'none'};border-left:${l ? l.css : 'none'};border-bottom:${b ? b.css : 'none'};border-right:${r ? r.css : 'none'}`;
      }
      const refs = { header: Object.assign({}, prevRefs.header), footer: Object.assign({}, prevRefs.footer) };
      for (const k of ['header', 'footer']) for (const ref of chs(s, k + 'Reference')) { const rid = ref.getAttributeNS(R, 'id'); const t = at(ref, 'type') || 'default'; if (rid && rels[rid]) refs[k][t] = rels[rid].path; }
      prevRefs = refs;
      sections.push(S); hfRefs.push(refs);
    }
    const note = sections.some(x => x.cols > 1) ? 'Les colonnes du document sont affichées sur une seule colonne.' : '';

    /* ---------------- rendu ---------------- */
    const mediaUrl = (part, rid) => { const rr = rid && relsCache.get(part) && relsCache.get(part)[rid]; return rr && !rr.ext ? (urls.get(rr.path) || '') : ''; };
    // relations des parties annexes (en-têtes, pieds, notes) : chargées d'avance
    const hfParts = new Set(); hfRefs.forEach(r => { Object.values(r.header).forEach(p => hfParts.add(p)); Object.values(r.footer).forEach(p => hfParts.add(p)); });
    const hfXml = new Map();
    for (const p of hfParts) { hfXml.set(p, await readXml(p)); await relsOf(p); }
    if (fnRel) await relsOf(fnRel.path);

    function runCss(Rr) {
      let s = '';
      if (Rr.font) s += `font-family:${AlixoDocEdit.fontStack(Rr.font)};`;
      const sz = Rr.sz || 10;
      if (Rr.va === 'superscript' || Rr.va === 'subscript') s += `font-size:${+(sz * 0.65).toFixed(2)}pt;position:relative;top:${Rr.va === 'superscript' ? '-0.55em' : '0.25em'};`;
      else s += `font-size:${sz}pt;`;
      s += `font-weight:${Rr.b ? 700 : 400};font-style:${Rr.i ? 'italic' : 'normal'};`;
      const deco = [];
      if (Rr.u && Rr.u !== 'none') deco.push('underline');
      if (Rr.strike || Rr.dstrike) deco.push('line-through');
      s += `text-decoration-line:${deco.join(' ') || 'none'};`;
      if (Rr.u && /double/.test(Rr.u)) s += 'text-decoration-style:double;'; else if (Rr.u && /dot/.test(Rr.u)) s += 'text-decoration-style:dotted;'; else if (Rr.u && /dash/.test(Rr.u)) s += 'text-decoration-style:dashed;'; else if (Rr.u && /wave/.test(Rr.u)) s += 'text-decoration-style:wavy;';
      if (Rr.uc) s += `text-decoration-color:${Rr.uc};`;
      if (Rr.color && Rr.color !== 'auto') s += `color:${Rr.color};`;
      if (Rr.hl) s += `background-color:${Rr.hl};`; else if (Rr.shd) s += `background-color:${Rr.shd};`;
      if (Rr.caps) s += 'text-transform:uppercase;'; if (Rr.smallCaps) s += 'font-variant:small-caps;';
      if (Rr.ls) s += `letter-spacing:${+Rr.ls.toFixed(2)}px;`;
      if (Rr.pos && !Rr.va) s += `position:relative;top:${-Rr.pos}pt;`;
      if (Rr.hidden) s += 'display:none;';
      return s;
    }
    function paraCss(P, mark, ctx) {
      const s = [];
      const l = (ctx.l || 0) + (P.indL || 0), r = (ctx.r || 0) + (P.indR || 0);
      s.push(`margin-left:${+l.toFixed(2)}px`, `margin-right:${+r.toFixed(2)}px`);
      if (P.first) s.push(`text-indent:${+P.first.toFixed(2)}px`);
      const bdr = P.bdr || {};
      const hasB = side => bdr[side] && bdr[side].val && bdr[side].val !== 'nil' && bdr[side].val !== 'none';
      // paragraphe encadré : l'espace avant / après reste à l'extérieur du cadre
      let pt = P.before || 0, pb = P.after || 0;
      if (hasB('top')) { if (pt) s.push(`margin-top:${+pt.toFixed(2)}px`); pt = 0; }
      if (hasB('bottom')) { if (pb) s.push(`margin-bottom:${+pb.toFixed(2)}px`); pb = 0; }
      s.push(`padding-top:${+pt.toFixed(2)}px`, `padding-bottom:${+pb.toFixed(2)}px`);
      const jc = P.jc === 'both' || P.jc === 'distribute' ? 'justify' : P.jc === 'center' ? 'center' : (P.jc === 'right' || P.jc === 'end') ? 'right' : 'left';
      s.push(`text-align:${jc}`);
      const ratio = lhRatio(mark.font);
      if (P.rule === 'exact') s.push(`line-height:${tw(P.line)}px`);
      else if (P.rule === 'atLeast') { const px = tw(P.line); const nat = ratio * (mark.sz || 10) * 96 / 72; s.push(px > nat ? `line-height:${px}px` : `line-height:${ratio}`); }
      else s.push(`line-height:${+(((P.line || 240) / 240) * ratio).toFixed(4)}`);
      if (mark.font) s.push(`font-family:${AlixoDocEdit.fontStack(mark.font)}`);
      s.push(`font-size:${mark.sz || 10}pt`);
      if (P.shd) s.push(`background-color:${P.shd}`);
      for (const side of ['top', 'bottom', 'left', 'right']) {
        const b = bdr[side]; if (!b || b.val === 'nil' || b.val === 'none') continue;
        s.push(`border-${side}:${bdrCss(b)}`);
        const sp = (b.space || 0) * 96 / 72;
        if (side === 'top' || side === 'bottom') s.push(`padding-${side}:${+((side === 'top' ? pt : pb) + sp).toFixed(2)}px`);
        else s.push(`padding-${side}:${+sp.toFixed(2)}px`);
      }
      return s.join(';');
    }
    /* propriétés effectives d'un paragraphe (style, liste, directes) */
    function paraProps(pEl, ctx, styleOverride) {
      const pPrEl = ch(pEl, 'pPr');
      const direct = parsePPr(pPrEl);
      const sid = styleOverride || direct.style || defParaStyle;
      const tsP = ctx.tbl ? ctx.tbl.pPr : null, tsR = ctx.tbl ? ctx.tbl.rPr : null;
      let P = mergeP(defP, tsP, chainP(sid));
      const numPr = mergeP({ num: P.num || {} }, { num: direct.num || {} }).num || {};
      let lvl = null;
      if (numPr.id && numPr.id > 0) { lvl = levelOf(numPr.id, numPr.lvl || 0); if (lvl) P = mergeP(P, lvl.pPr); }
      const dd = Object.assign({}, direct); delete dd.style;
      P = mergeP(P, dd);
      const baseR = mergeR(defR, tsR, chainR(sid));
      const mark = mergeR(baseR, parseRPr(ch(pPrEl, 'rPr')));
      return { P, sid, baseR, mark, num: numPr.id > 0 && lvl ? { id: numPr.id, lvl: numPr.lvl || 0, def: lvl } : null };
    }

    function renderBlocks(container, ctx) {
      const out = [];
      const walk = el => {
        for (const c of el.children) {
          const n = c.localName;
          // pages de formats différents (portrait / paysage) : chaque page est centrée, comme dans Word
          if (ctx.top) { const S = sections[ctx.sec.i]; const off = (pageMax() - S.w) / 2; ctx.l = S.ml + off; ctx.r = S.mr + off; ctx.w = S.w - S.ml - S.mr; }
          if (n === 'p') out.push(renderP(c, ctx));
          else if (n === 'tbl') out.push({ html: renderTable(c, ctx), table: true, sec: ctx.sec ? ctx.sec.i : 0 });
          else if (n === 'sdt') walk(ch(c, 'sdtContent') || c);
          else if (n === 'customXml' || n === 'sdtContent') walk(c);
          else if (n === 'AlternateContent') { const b = chooseBranch(c); if (b) walk(b); }
        }
      };
      walk(container);
      // espacement contextuel et bordures de paragraphes groupés
      for (let i = 0; i < out.length; i++) {
        const a = out[i], b = out[i + 1]; if (!a.P || !b || !b.P) continue;
        if (a.P.ctx && b.P.ctx && a.sid === b.sid) { a.P.after = 0; b.P.before = 0; }
        const ka = a.P.bdr && JSON.stringify(a.P.bdr), kb = b.P.bdr && JSON.stringify(b.P.bdr);
        if (ka && ka === kb) { const between = a.P.bdr.between; a.P = Object.assign({}, a.P, { bdr: Object.assign({}, a.P.bdr, { bottom: between }) }); b.P = Object.assign({}, b.P, { bdr: Object.assign({}, b.P.bdr, { top: undefined }) }); }
      }
      return out.map(o => (o.P ? paraHTML(o) : o.html)).join('');
    }
    function paraHTML(o) {
      const css = paraCss(o.P, o.mark, o.ctx);
      const attrs = o.ctx.hf ? '' : ` data-pi="${o.pi}" data-style="${esc(o.sid)}"`;
      const bt = o.P.bdr && o.P.bdr.top && o.P.bdr.top.val && o.P.bdr.top.val !== 'nil' && o.P.bdr.top.val !== 'none';
      const blk = o.ctx.top ? ` data-sec="${o.sec}"${o.brk ? ' data-brk="1"' : ''}${o.P.before ? (bt ? ` data-mt="${+o.P.before.toFixed(2)}"` : ` data-sb="${+o.P.before.toFixed(2)}"`) : ''}` : '';
      const tabs = (o.P.tabs || []).filter(t => t.val !== 'clear' && t.val !== 'bar').map(t => [+t.pos.toFixed(2), t.val === 'end' ? 'right' : t.val === 'start' ? 'left' : t.val, t.leader === 'none' ? '' : t.leader]);
      const tabAttr = o.hasTab || o.num ? ` data-il="${+(o.P.indL || 0).toFixed(2)}" data-dt="${+tw(settings.tab).toFixed(2)}"${tabs.length ? ` data-tabs="${esc(JSON.stringify(tabs))}"` : ''}${(o.P.first || 0) < 0 ? ' data-hang="1"' : ''}` : '';
      const num = o.num ? ` data-num="${o.num.id}:${o.num.lvl}"` : '';
      return `<div class="wp"${attrs}${blk}${tabAttr}${num} style="${css}">${o.inner}</div>`;
    }
    function renderP(pEl, ctxIn) {
      const ctx = ctxIn.top ? Object.assign({}, ctxIn, { sec: ctxIn.sec }) : ctxIn;
      const pp = paraProps(pEl, ctx);
      const pi = ctx.hf ? -1 : reg.p.push(pEl) - 1;
      if (!ctx.hf) { rendered.add(pi); reg.pinfo[pi] = { ctx: Object.assign({}, ctx), sid: pp.sid }; }
      const st = { ctx, baseR: pp.baseR, hasTab: false, part: ctx.part, indL: pp.P.indL || 0 };
      let inner = renderInline(pEl, st);
      const visible = inner.replace(/<span class="wkeep wfc"[^>]*><\/span>/g, '');
      if (!/[^\s]/.test(visible.replace(/<[^>]*>/g, '')) && !/wkeep|<br>|wtab|wpbr/.test(visible)) inner += '<br data-ph="1">';
      if (pp.num && !ctx.hf) {
        const L = pp.num.def;
        const nr = mergeR(pp.mark, L.rPr); delete nr.u;
        if (/^(symbol|wingdings.*)$/i.test(nr.font || '') && L.fmt === 'bullet') nr.font = pp.mark.font;
        reg.numCss[pi] = runCss(Object.assign({}, nr, { b: nr.b, i: nr.i }));
        st.hasTab = true;
      }
      // section : un paragraphe qui porte sectPr termine la section
      let sec = 0, brk = false;
      if (ctxIn.top) {
        const ctx = ctxIn;
        sec = ctx.sec.i;
        if (ctx.sec.pendingBrk) { brk = true; ctx.sec.pendingBrk = false; }
        if (pp.P.pbb) brk = true;
        if (ch(ch(pEl, 'pPr'), 'sectPr')) { ctx.sec.i = Math.min(sections.length - 1, ctx.sec.i + 1); const nt = sections[ctx.sec.i].type; ctx.sec.pendingBrk = nt !== 'continuous'; }
      }
      return { P: pp.P, mark: pp.mark, sid: pp.sid, ctx, pi, inner, hasTab: st.hasTab || /class="wtab"/.test(inner), num: ctx.hf ? null : pp.num, sec, brk };
    }
    function chooseBranch(ac) {
      const choice = ch(ac, 'Choice');
      if (choice) { const req = choice.getAttribute('Requires') || ''; if (/wps|wpg|wp14|w14|a14|w15/.test(req) || !req) return choice; }
      return ch(ac, 'Fallback') || choice;
    }
    function renderInline(el, st) {
      let h = '';
      for (const c of el.children) {
        const n = c.localName;
        if (n === 'r') h += renderRun(c, st);
        else if (n === 'hyperlink') {
          const rid = c.getAttributeNS(R, 'id'); const anchor = at(c, 'anchor');
          const rr = rid && relsCache.get(st.part) && relsCache.get(st.part)[rid];
          const href = rr ? rr.target : anchor ? '#' + anchor : '';
          if (st.ctx.hf) { h += `<a class="wh" href="${esc(href)}">${renderInline(c, st)}</a>`; continue; }
          const hid = reg.h.push(c) - 1;
          h += `<a class="wh" data-h="${hid}" href="${esc(href)}" title="${esc(href)} — Ctrl + clic pour suivre le lien">${renderInline(c, st)}</a>`;
        }
        else if (n === 'ins' || n === 'moveTo' || n === 'smartTag' || n === 'customXml' || n === 'dir' || n === 'bdo') h += renderInline(c, st);
        else if (n === 'sdt') h += renderInline(ch(c, 'sdtContent') || c, st);
        else if (n === 'fldSimple') {
          const instr = (at(c, 'instr') || '').trim();
          if (st.ctx.hf && /^PAGE\b/i.test(instr)) h += '<span class="wfld" data-f="PAGE"></span>';
          else if (st.ctx.hf && /^(NUMPAGES|SECTIONPAGES)\b/i.test(instr)) h += '<span class="wfld" data-f="NUMPAGES"></span>';
          else if (st.ctx.hf) h += renderInline(c, st);
          else { const id = reg.r.push(c) - 1; h += `<span class="wkeep" data-ri="${id}" contenteditable="false">${renderInline(c, Object.assign({}, st, { ctx: Object.assign({}, st.ctx, { hf: true }) }))}</span>`; }
        }
        else if (n === 'oMath' || n === 'oMathPara') {
          const txt = [...c.getElementsByTagNameNS('http://schemas.openxmlformats.org/officeDocument/2006/math', 't')].map(t => t.textContent).join('');
          if (st.ctx.hf) h += `<i>${esc(txt)}</i>`;
          else { const id = reg.r.push(c) - 1; h += `<span class="wkeep wmath" data-ri="${id}" contenteditable="false">${esc(txt)}</span>`; }
        }
        else if (n === 'AlternateContent') { const b = chooseBranch(c); if (b) h += renderInline(b, st); }
      }
      return h;
    }
    const KEEP = new Set(['drawing', 'pict', 'object', 'footnoteReference', 'endnoteReference', 'AlternateContent', 'ruby', 'fldChar', 'instrText', 'commentReference', 'embedObject', 'sym']);
    const SYMFONT = /^(wingdings|webdings|symbol)/i;
    const symbolize = (t, font) => [...t].map(ch => symChar(ch.charCodeAt(0), font)).join('');
    function renderRun(r, st) {
      const ctx = st.ctx;
      const direct = parseRPr(ch(r, 'rPr'));
      const Rr = mergeR(st.baseR, direct.rStyle ? chainR(direct.rStyle) : null, direct);
      const kids = [...r.children].filter(c => c.localName !== 'rPr');
      const fld = st.fld || (st.fld = []);
      const top = fld[fld.length - 1];
      // champs complexes : début / instruction / séparateur / fin, invisibles et conservés ; le résultat s'affiche
      const fc = kids.find(c => c.localName === 'fldChar');
      const it = kids.find(c => c.localName === 'instrText');
      if (fc || it || (top && top.phase === 'instr')) {
        if (fc) { const t = at(fc, 'fldCharType'); if (t === 'begin') fld.push({ phase: 'instr', instr: '' }); else if (t === 'separate' && top) top.phase = 'result'; else if (t === 'end') fld.pop(); }
        if (it && top) top.instr += it.textContent;
        let out = '';
        if (ctx.hf && fc && at(fc, 'fldCharType') === 'separate' && top) { if (/^\s*PAGE\b/i.test(top.instr)) { out = '<span class="wfld" data-f="PAGE"></span>'; top.skip = true; } else if (/^\s*(NUMPAGES|SECTIONPAGES)\b/i.test(top.instr)) { out = '<span class="wfld" data-f="NUMPAGES"></span>'; top.skip = true; } }
        if (ctx.hf) return out;
        const id = reg.r.push(r) - 1;
        return `<span class="wkeep wfc" data-ri="${id}" contenteditable="false"></span>`;
      }
      if (top && top.skip && ctx.hf) return '';
      // images, champs, symboles (Wingdings, Symbol…) : conservés tels quels dans le fichier
      const isKeep = kids.some(c => KEEP.has(c.localName)) || (SYMFONT.test(Rr.font || '') && kids.some(c => c.localName === 't'));
      const css = runCss(Rr);
      if (isKeep) {
        let vis = '', blockStyle = '', pageAbs = '';
        const takeAbs = d => { if (d.px !== undefined && d.px !== null) pageAbs += ` data-px="${+d.px.toFixed(2)}"`; if (d.py !== undefined && d.py !== null) pageAbs += ` data-py="${+d.py.toFixed(2)}"`; };
        for (const c of kids) {
          const n = c.localName;
          if (n === 'drawing') { const d = renderDrawing(c, st); vis += d.html; blockStyle = d.style; takeAbs(d); }
          else if (n === 'pict' || n === 'object') { const d = renderPict(c, st); vis += d.html; if (d.style) blockStyle = d.style; }
          else if (n === 'AlternateContent') { const b = chooseBranch(c); if (b) for (const k of b.children) { if (k.localName === 'drawing') { const d = renderDrawing(k, st); vis += d.html; blockStyle = d.style; takeAbs(d); } else if (k.localName === 'pict') { const d = renderPict(k, st); vis += d.html; if (d.style) blockStyle = d.style; } } }
          else if (n === 'footnoteReference' || n === 'endnoteReference') {
            const fid = at(c, 'id');
            if (n === 'footnoteReference') { if (!fnNum.has(fid)) fnNum.set(fid, ++fnCount); vis += `<sup class="wfnref"${ctx.hf ? '' : ` data-fn="${esc(fid)}"`}>${fnNum.get(fid)}</sup>`; }
            else vis += '<sup class="wfnref">*</sup>';
          }
          else if (n === 't') vis += esc(SYMFONT.test(Rr.font || '') ? symbolize(c.textContent, Rr.font) : c.textContent);
          else if (n === 'sym') vis += esc(symChar(parseInt(at(c, 'char') || '0', 16), at(c, 'font')));
          else if (n === 'ruby') vis += esc((ch(c, 'rubyBase') || c).textContent);
        }
        const symCss = SYMFONT.test(Rr.font || '') || kids.some(c => c.localName === 'sym') ? `font-family:${AlixoDocEdit.fontStack('Segoe UI Symbol')};` : '';
        if (ctx.hf) return `<span style="${css}${symCss}${blockStyle}"${pageAbs}>${vis}</span>`;
        const id = reg.r.push(r) - 1;
        return `<span class="wkeep" data-ri="${id}" contenteditable="false" style="${css}${symCss}${blockStyle}">${vis}</span>`;
      }
      let inner = '';
      for (const c of kids) {
        switch (c.localName) {
          case 't': inner += esc(c.textContent); break;
          case 'tab': case 'ptab': inner += '<span class="wtab" contenteditable="false"></span>'; st.hasTab = true; break;
          case 'br': { const t = at(c, 'type'); inner += t === 'page' ? '<span class="wpbr" contenteditable="false" title="Saut de page"></span>' : '<br>'; break; }
          case 'cr': inner += '<br>'; break;
          case 'sym': { const code = parseInt(at(c, 'char') || '0', 16); inner += esc(symChar(code, at(c, 'font'))); break; }
          case 'noBreakHyphen': inner += '‑'; break;
          case 'softHyphen': inner += '&shy;'; break;
          case 'footnoteRef': inner += `<sup>${esc(st.fnLabel || '')}</sup>`; break;
          case 'separator': inner += '<span class="wfnsepl"></span>'; break;
          default: break;
        }
      }
      if (ctx.hf) return `<span style="${css}">${inner}</span>`;
      const id = reg.r.push(r) - 1; reg.css[id] = css;
      const va = Rr.va === 'superscript' || Rr.va === 'subscript' ? ` data-va="${Rr.va}"` : '';
      return `<span class="wr" data-ri="${id}"${va} data-sz="${Rr.sz || 10}" style="${css}">${inner}</span>`;
    }
    /* image ou forme DrawingML */
    function renderDrawing(dr, st) {
      const box = ch(dr, 'inline') || ch(dr, 'anchor'); if (!box) return { html: '', style: '' };
      const anchor = box.localName === 'anchor';
      const ext = ch(box, 'extent'); const w = emu(ext && ext.getAttribute('cx')), h = emu(ext && ext.getAttribute('cy'));
      const gd = box.getElementsByTagNameNS(A, 'graphicData')[0];
      const content = graphicHTML(gd, w, h, st);
      const autofit = box.getElementsByTagNameNS(A, 'spAutoFit').length > 0;
      const hCss = autofit ? `min-height:${h}px` : `height:${h}px;overflow:hidden`;
      if (!anchor) return { html: content, style: `display:inline-block;width:${w}px;height:${h}px;vertical-align:text-bottom;text-indent:0;line-height:normal;` };
      // objet ancré : position par rapport à la page, à la marge ou au paragraphe
      const ctx = st.ctx; const S = sections[(ctx.sec && ctx.sec.i) || 0] || sections[0];
      const pH = ch(box, 'positionH'), pV = ch(box, 'positionV');
      const offH = pH && ch(pH, 'posOffset') ? emu(ch(pH, 'posOffset').textContent) : 0, offV = pV && ch(pV, 'posOffset') ? emu(ch(pV, 'posOffset').textContent) : 0;
      const relH = pH ? pH.getAttribute('relativeFrom') : 'column', relV = pV ? pV.getAttribute('relativeFrom') : 'paragraph';
      const alH = pH && ch(pH, 'align') ? ch(pH, 'align').textContent : '';
      const textW = S.w - S.ml - S.mr;
      let xPage;
      const base = relH === 'page' ? 0 : relH === 'leftMargin' ? 0 : relH === 'rightMargin' ? S.w - S.mr : S.ml;
      const span = relH === 'page' ? S.w : relH === 'leftMargin' ? S.ml : relH === 'rightMargin' ? S.mr : textW;
      if (alH) xPage = base + (alH === 'center' ? (span - w) / 2 : alH === 'right' || alH === 'outside' ? span - w : 0);
      else xPage = base + offH;
      const pLeft = ctx.top ? (ctx.l || 0) + (st.indL || 0) : 0;
      const dx = ctx.top ? xPage + (pageMax() - S.w) / 2 - pLeft : offH;
      const behind = box.getAttribute('behindDoc') === '1';
      const wrap = [...box.children].map(c => c.localName).find(n => /^wrap/.test(n)) || 'wrapNone';
      const dist = k => emu(box.getAttribute('dist' + k) || 0);
      const vPage = relV === 'page' ? offV : relV === 'margin' || relV === 'topMargin' ? S.mt + offV : null;
      if (wrap === 'wrapTopAndBottom') return { html: content, style: `display:block;width:${w}px;${hCss};margin:${relV === 'paragraph' || relV === 'line' ? Math.max(0, offV) : 0}px 0 ${dist('B')}px ${dx}px;text-indent:0;line-height:normal;` };
      if (wrap === 'wrapSquare' || wrap === 'wrapTight' || wrap === 'wrapThrough') {
        const left = (xPage - S.ml) + w / 2 < textW / 2;
        return { html: content, style: `display:block;float:${left ? 'left' : 'right'};width:${w}px;height:${h}px;margin:${relV === 'paragraph' ? Math.max(0, offV) : 0}px ${left ? dist('R') : 0}px ${dist('B')}px ${left ? Math.max(0, dx) : dist('L')}px;text-indent:0;line-height:normal;` };
      }
      // en-tête / pied de page : objets placés sur la page (numéro de page dans une zone de texte…) — replacés par la mise en page
      const px = ctx.hf && (relH === 'page' || relH === 'margin' || relH === 'column' || alH) ? xPage : null;
      return { html: content, style: `display:block;position:absolute;left:${dx}px;top:${vPage === null ? offV : 0}px;width:${w}px;height:${h}px;z-index:${behind ? -1 : 2};text-indent:0;line-height:normal;`, vpage: vPage, px, py: ctx.hf ? vPage : null };
    }
    function graphicHTML(gd, w, h, st) {
      if (!gd) return '';
      const uri = gd.getAttribute('uri') || '';
      const pic = [...gd.children].find(c => c.localName === 'pic');
      if (pic) return picHTML(pic, st);
      const wsp = [...gd.children].find(c => c.localName === 'wsp');
      if (wsp) return shapeHTML(wsp, w, h, st);
      const grp = [...gd.children].find(c => c.localName === 'wgp');
      if (grp) return groupHTML(grp, w, h, st);
      if (/chart/.test(uri)) return '<div class="wshape wchart">Graphique</div>';
      return '';
    }
    function picHTML(pic, st) {
      const blip = pic.getElementsByTagNameNS(A, 'blip')[0];
      const rid = blip && (blip.getAttributeNS(R, 'embed') || blip.getAttributeNS(R, 'link'));
      const u = mediaUrl(st.part, rid);
      return u ? `<img src="${u}" alt="" draggable="false" style="width:100%;height:100%;display:block">` : '<span class="wimg-missing">Image</span>';
    }
    const fillOf = spPr => {
      if (!spPr) return '';
      const sf = [...spPr.children].find(c => c.localName === 'solidFill');
      if (sf) { const c = sf.firstElementChild; if (c) { if (c.localName === 'srgbClr') return '#' + c.getAttribute('val'); if (c.localName === 'schemeClr' && themeColor(c.getAttribute('val'))) return '#' + themeColor(c.getAttribute('val')); } }
      return '';
    };
    const lineOf = spPr => {
      const ln = spPr && [...spPr.children].find(c => c.localName === 'ln'); if (!ln) return '';
      if ([...ln.children].some(c => c.localName === 'noFill')) return 'none';
      const wpx = Math.max(1, emu(ln.getAttribute('w') || 9525));
      const col = fillOf(ln) || '#000';
      return `${wpx}px solid ${col}`;
    };
    function shapeHTML(wsp, w, h, st) {
      const spPr = [...wsp.children].find(c => c.localName === 'spPr');
      const geom = spPr && spPr.getElementsByTagNameNS(A, 'prstGeom')[0];
      const prst = geom ? geom.getAttribute('prst') : 'rect';
      const bg = fillOf(spPr), bd = lineOf(spPr);
      const bp = [...wsp.children].find(c => c.localName === 'bodyPr');
      const ins = k => emu(bp && bp.getAttribute(k + 'Ins') !== null ? bp.getAttribute(k + 'Ins') : (k === 'l' || k === 'r' ? 91440 : 45720));
      const vAnchor = bp ? bp.getAttribute('anchor') : 't';
      const radius = prst === 'ellipse' ? '50%' : prst === 'roundRect' ? '10px' : '0';
      const tx = wsp.getElementsByTagNameNS(W, 'txbxContent')[0];
      const style = `width:100%;height:100%;box-sizing:border-box;${bg ? 'background:' + bg + ';' : ''}${bd && bd !== 'none' ? 'border:' + bd + ';' : ''}border-radius:${radius};padding:${ins('t')}px ${ins('r')}px ${ins('b')}px ${ins('l')}px;display:flex;flex-direction:column;justify-content:${vAnchor === 'ctr' ? 'center' : vAnchor === 'b' ? 'flex-end' : 'flex-start'}`;
      if (prst === 'line' || prst === 'straightConnector1') return `<div class="wshape" style="width:100%;height:0;border-top:${bd && bd !== 'none' ? bd : '1px solid #000'}"></div>`;
      if (!tx) return `<div class="wshape" style="${style}"></div>`;
      const inner = renderBlocks(tx, Object.assign({}, st.ctx, { top: false, l: 0, r: 0, w: w - ins('l') - ins('r'), tbl: null, sec: st.ctx.sec ? { i: st.ctx.sec.i } : null }));
      return `<div class="wtxbx" style="${style}"><div class="wtxbx-in"${st.ctx.hf ? '' : ' contenteditable="true"'}>${inner}</div></div>`;
    }
    function groupHTML(grp, w, h, st) {
      const gx = grp.getElementsByTagNameNS(A, 'xfrm')[0];
      const chOff = gx && gx.getElementsByTagNameNS(A, 'chOff')[0], chExt = gx && gx.getElementsByTagNameNS(A, 'chExt')[0];
      const ox = chOff ? +chOff.getAttribute('x') : 0, oy = chOff ? +chOff.getAttribute('y') : 0;
      const ew = chExt ? +chExt.getAttribute('cx') : 1, eh = chExt ? +chExt.getAttribute('cy') : 1;
      let html = '';
      for (const c of grp.children) {
        if (c.localName !== 'wsp' && c.localName !== 'pic') continue;
        const x = c.getElementsByTagNameNS(A, 'xfrm')[0]; if (!x) continue;
        const off = x.getElementsByTagNameNS(A, 'off')[0], ex = x.getElementsByTagNameNS(A, 'ext')[0];
        const L = ((+off.getAttribute('x') - ox) / ew) * w, T = ((+off.getAttribute('y') - oy) / eh) * h;
        const cw = (+ex.getAttribute('cx') / ew) * w, chh = (+ex.getAttribute('cy') / eh) * h;
        html += `<div style="position:absolute;left:${L}px;top:${T}px;width:${cw}px;height:${chh}px">${c.localName === 'pic' ? picHTML(c, st) : shapeHTML(c, cw, chh, st)}</div>`;
      }
      return `<div style="position:relative;width:100%;height:100%">${html}</div>`;
    }
    /* VML (anciens documents) : image, zone de texte */
    function renderPict(pc, st) {
      const shape = [...pc.getElementsByTagName('*')].find(e => /^(shape|rect|roundrect|oval)$/.test(e.localName) && e.namespaceURI && /vml/.test(e.namespaceURI));
      const imgd = [...pc.getElementsByTagName('*')].find(e => e.localName === 'imagedata');
      const style = shape ? shape.getAttribute('style') || '' : '';
      const get = k => { const m = new RegExp('(?:^|;)\\s*' + k + '\\s*:\\s*([-\\d.]+)(pt|px|in|cm|mm)?', 'i').exec(style); if (!m) return null; const v = +m[1], u = (m[2] || 'px').toLowerCase(); return u === 'pt' ? v * 96 / 72 : u === 'in' ? v * 96 : u === 'cm' ? v * 96 / 2.54 : u === 'mm' ? v * 96 / 25.4 : v; };
      const w = get('width') || 0, h = get('height') || 0;
      let html = '';
      if (imgd) { const u = mediaUrl(st.part, imgd.getAttributeNS(R, 'id') || imgd.getAttribute('r:id')); html = u ? `<img src="${u}" alt="" draggable="false" style="width:100%;height:100%;display:block">` : '<span class="wimg-missing">Objet</span>'; }
      const tx = pc.getElementsByTagNameNS(W, 'txbxContent')[0];
      if (tx) {
        const fill = shape && shape.getAttribute('fillcolor'); const stroke = shape && shape.getAttribute('stroked') !== 'f' ? (shape.getAttribute('strokecolor') || '#000') : '';
        const inner = renderBlocks(tx, Object.assign({}, st.ctx, { top: false, l: 0, r: 0, w: (w || 400) - 14, tbl: null, sec: st.ctx.sec ? { i: st.ctx.sec.i } : null }));
        html = `<div class="wtxbx" style="width:100%;min-height:100%;box-sizing:border-box;padding:4px 7px;${fill && fill !== 'none' ? 'background:' + fill + ';' : ''}${stroke ? 'border:1px solid ' + stroke : ''}"><div class="wtxbx-in"${st.ctx.hf ? '' : ' contenteditable="true"'}>${inner}</div></div>`;
      }
      if (!html) return { html: '', style: '' };
      const abs = /position\s*:\s*absolute/i.test(style);
      const ml = get('margin-left') || 0, mt = get('margin-top') || 0;
      return { html, style: abs ? `display:block;width:${w}px;min-height:${h}px;margin:${Math.max(0, mt)}px 0 4px ${ml}px;text-indent:0;line-height:normal;` : `display:inline-block;width:${w}px;height:${h}px;vertical-align:text-bottom;text-indent:0;line-height:normal;` };
    }
    /* tableaux */
    function renderTable(tbl, ctx) {
      const tblPr = ch(tbl, 'tblPr');
      const D = readTblPr(tblPr);
      const sid = at(ch(tblPr, 'tblStyle'), 'val') || defTableStyle;
      const TS = tableStyle(sid);
      const bdr = Object.assign({}, TS.bdr, D.bdr);
      const mar = Object.assign({ left: 7.2, right: 7.2, top: 0, bottom: 0 }, TS.mar, D.mar);
      let grid = chs(ch(tbl, 'tblGrid'), 'gridCol').map(g => tw(at(g, 'w')));
      const rows = chs(tbl, 'tr');
      // grille absente : largeurs des cellules de la première ligne
      if (!grid.length || grid.every(x => !x)) grid = chs(rows[0], 'tc').map(tc => tw(at(ch(ch(tc, 'tcPr'), 'tcW'), 'w')) || 100);
      let tableW = grid.reduce((a, b) => a + b, 0);
      if (D.wType === 'pct' && D.w) tableW = (ctx.w || 600) * D.w / 5000;
      const avail = ctx.w || (sections[0].w - sections[0].ml - sections[0].mr);
      const ind = D.ind !== null ? D.ind : (TS.ind || 0);
      const ml = (ctx.l || 0) + (D.jc === 'center' ? (avail - tableW) / 2 : (D.jc === 'right' || D.jc === 'end') ? avail - tableW : ind);
      const ti = ctx.hf ? -1 : reg.t.push(tbl) - 1;
      // cellules : grille d'occupation (fusions verticales)
      const cells = [];
      rows.forEach((tr, ri) => {
        const trPr = ch(tr, 'trPr');
        let col = +at(ch(trPr, 'gridBefore'), 'val') || 0;
        const list = [];
        for (const c of tr.children) {
          if (c.localName === 'sdt') { for (const tc of (ch(c, 'sdtContent') || c).children) if (tc.localName === 'tc') { add(tc); } continue; }
          if (c.localName === 'tc') add(c);
        }
        function add(tc) {
          const tcPr = ch(tc, 'tcPr');
          const span = +at(ch(tcPr, 'gridSpan'), 'val') || 1;
          const vm = ch(tcPr, 'vMerge'); const vmv = vm ? (at(vm, 'val') || 'continue') : null;
          list.push({ tc, tcPr, col, span, vm: vmv, row: ri, rowspan: 1 });
          col += span;
        }
        cells.push(list);
      });
      cells.forEach((list, ri) => list.forEach(c => {
        if (c.vm !== 'continue' || ri === 0) return;
        for (let k = ri - 1; k >= 0; k--) { const o = cells[k].find(x => x.col === c.col && !x.skip); if (o) { if (o.vm === 'restart' || o.vm === 'continue' && !o.skip) { /* */ } const origin = o.origin || o; origin.rowspan++; c.skip = true; c.origin = origin; break; } }
      }));
      const nCols = grid.length;
      const totalRows = rows.length;
      let html = `<table class="wt"${ti >= 0 ? ` data-ti="${ti}"` : ''}${ctx.top ? ` data-sec="${ctx.sec.i}"${ctx.sec.pendingBrk ? ' data-brk="1"' : ''}` : ''} style="margin-left:${+ml.toFixed(2)}px;width:${+tableW.toFixed(2)}px"><colgroup>${grid.map(w => `<col style="width:${+w.toFixed(2)}px">`).join('')}</colgroup><tbody>`;
      if (ctx.top && ctx.sec.pendingBrk) ctx.sec.pendingBrk = false;
      rows.forEach((tr, ri) => {
        const trPr = ch(tr, 'trPr'); const th = ch(trPr, 'trHeight');
        const hpx = th ? tw(at(th, 'val')) : 0; const rule = th ? at(th, 'hRule') || 'atLeast' : '';
        html += `<tr${hpx ? ` style="height:${hpx}px"` : ''}${ch(trPr, 'tblHeader') ? ' data-hdr="1"' : ''}>`;
        for (const c of cells[ri]) {
          if (c.skip) continue;
          const tcPr = c.tcPr;
          const cb = {}; const tb = ch(tcPr, 'tcBorders'); if (tb) for (const s of tb.children) cb[s.localName === 'start' ? 'left' : s.localName === 'end' ? 'right' : s.localName] = readBdr(s);
          const lastRow = ri + c.rowspan - 1 >= totalRows - 1;
          const top = cb.top || (ri === 0 ? bdr.top : bdr.insideH), bottom = cb.bottom || (lastRow ? bdr.bottom : bdr.insideH);
          const left = cb.left || (c.col === 0 ? bdr.left : bdr.insideV), right = cb.right || (c.col + c.span >= nCols ? bdr.right : bdr.insideV);
          const cm = Object.assign({}, mar); const tm = ch(tcPr, 'tcMar'); if (tm) for (const s of tm.children) cm[s.localName === 'start' ? 'left' : s.localName === 'end' ? 'right' : s.localName] = tw(at(s, 'w'));
          const shd = readShd(ch(tcPr, 'shd')) || TS.shd;
          const va = at(ch(tcPr, 'vAlign'), 'val');
          const cw = grid.slice(c.col, c.col + c.span).reduce((a, b) => a + b, 0);
          const css = `border-top:${bdrCss(top)};border-bottom:${bdrCss(bottom)};border-left:${bdrCss(left)};border-right:${bdrCss(right)};padding:${cm.top}px ${cm.right}px ${cm.bottom}px ${cm.left}px;vertical-align:${va === 'center' ? 'middle' : va === 'bottom' ? 'bottom' : 'top'}${shd ? ';background:' + shd : ''}${rule === 'exact' ? `;height:${hpx}px;overflow:hidden` : ''}`;
          const inner = renderBlocks(c.tc, Object.assign({}, ctx, { top: false, l: 0, r: 0, w: Math.max(10, cw - cm.left - cm.right), tbl: TS, sec: ctx.sec ? { i: ctx.sec.i } : null }));
          html += `<td${c.span > 1 ? ` colspan="${c.span}"` : ''}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ''} style="${css}">${inner || '<div class="wp"><br data-ph="1"></div>'}</td>`;
        }
        html += '</tr>';
      });
      return html + '</tbody></table>';
    }

    /* ---------------- corps ---------------- */
    const S0 = sections[0];
    const topCtx = { top: true, l: S0.ml, r: 0, w: S0.w - S0.ml - S0.mr, part: main, sec: { i: 0, pendingBrk: false }, tbl: null };
    const html = renderBlocks(body, topCtx);
    function pageMax() { return Math.max(...sections.map(x => x.w)); }

    /* ---------------- en-têtes, pieds de page, notes ---------------- */
    const hfHtml = new Map();
    function hf(si, kind) {
      const refs = hfRefs[si] || { header: {}, footer: {} };
      const S = sections[si];
      const part = (k) => { const r = refs[k]; return kind === 'first' ? r.first || '' : kind === 'even' ? r.even || '' : r.default || ''; };
      const render = p => {
        if (!p) return '';
        if (hfHtml.has(p + ':' + si)) return hfHtml.get(p + ':' + si);
        const x = hfXml.get(p); if (!x) return '';
        const rootEl = x.documentElement;
        const h = renderBlocks(rootEl, { top: false, hf: true, l: 0, r: 0, w: S.w - S.ml - S.mr, part: p, sec: { i: si }, tbl: null });
        hfHtml.set(p + ':' + si, h); return h;
      };
      return { header: render(part('header')), footer: render(part('footer')) };
    }
    const fnHtml = new Map();
    function footnoteHtml(id) {
      if (fnHtml.has(id)) return fnHtml.get(id);
      if (!fnX) return '';
      const f = [...fnX.getElementsByTagNameNS(W, 'footnote')].find(e => at(e, 'id') === String(id));
      if (!f) return '';
      const S = sections[0];
      const st0 = { top: false, hf: true, l: 0, r: 0, w: S.w - S.ml - S.mr, part: fnRel.path, sec: { i: 0 }, tbl: null };
      // le numéro de la note (w:footnoteRef) : celui du renvoi dans le texte
      const label = String(fnNum.get(String(id)) || '');
      const h = renderBlocks(f, st0).replace(/<sup><\/sup>/, `<sup>${esc(label)}</sup>`);
      fnHtml.set(id, `<div class="wdx-fn">${h}</div>`); return fnHtml.get(id);
    }

    /* ---------------- numéros de liste (recalculés à chaque mise en page) ---------------- */
    function renumber(flow) {
      const cnt = {};      // par liste abstraite : compteurs par niveau
      const seen = new Set();
      for (const p of flow.querySelectorAll('div.wp[data-num]')) {
        const [nid, lv] = p.dataset.num.split(':').map(Number);
        const nm = nums[nid]; if (!nm) continue;
        const key = nm.abs;
        const c = cnt[key] || (cnt[key] = new Array(9).fill(null));
        if (!seen.has(nid)) { seen.add(nid); for (const [k, v] of Object.entries(nm.start)) c[+k] = v - 1; }
        const L = levelOf(nid, lv); if (!L) continue;
        c[lv] = c[lv] === null ? L.start : c[lv] + 1;
        for (let k = lv + 1; k < 9; k++) c[k] = null;
        let text;
        if (L.fmt === 'bullet') { const code = (L.text || '•').charCodeAt(0); text = symChar(code, L.rPr.font); }
        else text = L.text.replace(/%([1-9])/g, (_, d) => { const k = +d - 1; const LL = levelOf(nid, k); const v = c[k] === null ? (LL ? LL.start : 1) : c[k]; return LL ? fmtNum(v, L.lgl ? 'decimal' : LL.fmt) : ''; });
        let w = p.firstChild && p.firstChild.nodeType === 1 && p.firstChild.classList.contains('wnum') ? p.firstChild : null;
        if (!w) { p.querySelectorAll(':scope > .wnum').forEach(x => x.remove()); w = document.createElement('span'); w.className = 'wnum'; w.contentEditable = 'false'; p.insertBefore(w, p.firstChild); }
        const key2 = text + '|' + L.suff;
        if (w.dataset.t !== key2) { w.dataset.t = key2; w.innerHTML = esc(text) + (L.suff === 'tab' ? '<span class="wtab"></span>' : L.suff === 'space' ? ' ' : ''); }
        const css = reg.numCss[+p.dataset.pi] || ''; if (w.getAttribute('style') !== css) w.setAttribute('style', css);
      }
      // numéro resté sur un paragraphe qui n'est plus dans une liste
      flow.querySelectorAll('div.wp:not([data-num]) > .wnum').forEach(x => x.remove());
    }

    /* ---------------- style de paragraphe appliqué depuis la barre d'outils ---------------- */
    function applyStyle(p, sid) {
      const pi = +p.dataset.pi; const src = reg.p[pi]; const info = reg.pinfo[pi]; if (!src || !info) return;
      const pp = paraProps(src, info.ctx, sid);
      const ctxL = p.closest('td, .wtxbx-in') ? { l: 0, r: 0 } : { l: info.ctx.l, r: info.ctx.r };
      const keep = p.style.marginTop;
      p.setAttribute('style', paraCss(pp.P, pp.mark, Object.assign({}, info.ctx, ctxL)));
      if (keep) p.style.marginTop = keep;
      p.dataset.style = sid;
      for (const sp of p.querySelectorAll('.wr')) {
        const r = reg.r[+sp.dataset.ri];
        const direct = r && r.localName === 'r' ? parseRPr(ch(r, 'rPr')) : {};
        const Rr = mergeR(pp.baseR, direct.rStyle ? chainR(direct.rStyle) : null, direct);
        sp.setAttribute('style', runCss(Rr)); sp.dataset.sz = String(Rr.sz || 10);
      }
    }
    function baseCss(ri) { return reg.css[+ri] ?? null; }
    const styleList = Object.values(styles).filter(s => s.type === 'paragraph' && (!s.hidden || s.q)).sort((a, b) => (a.pri - b.pri) || a.name.localeCompare(b.name)).map(s => ({ id: s.id, name: STYLE_FR[s.name.toLowerCase()] || s.name }));

    /* ============================================================
       Réécriture
       ============================================================ */
    const mk = (n) => doc.createElementNS(W, 'w:' + n);
    function newRun(ri, fmt, markRPr) {
      const r = mk('r');
      const src = ri !== undefined && ri !== null && ri !== '' ? reg.r[+ri] : null;
      let rPr = null;
      if (src && src.localName === 'r' && ch(src, 'rPr')) rPr = ch(src, 'rPr').cloneNode(true);
      else if (markRPr) { rPr = markRPr.cloneNode(true); for (const c of [...rPr.children]) if (/^(ins|del|moveFrom|moveTo|rPrChange)$/.test(c.localName)) c.remove(); }
      if (fmt && Object.keys(fmt).length) {
        if (!rPr) rPr = mk('rPr');
        if ('b' in fmt) { setProp(rPr, 'b', RPR_ORDER, fmt.b ? {} : { val: 0 }); setProp(rPr, 'bCs', RPR_ORDER, fmt.b ? {} : { val: 0 }); }
        if ('i' in fmt) { setProp(rPr, 'i', RPR_ORDER, fmt.i ? {} : { val: 0 }); setProp(rPr, 'iCs', RPR_ORDER, fmt.i ? {} : { val: 0 }); }
        if ('u' in fmt) setProp(rPr, 'u', RPR_ORDER, { val: fmt.u ? 'single' : 'none' });
        if ('s' in fmt) { setProp(rPr, 'strike', RPR_ORDER, fmt.s ? {} : { val: 0 }); if (!fmt.s) setProp(rPr, 'dstrike', RPR_ORDER, null); }
        if (fmt.font) setProp(rPr, 'rFonts', RPR_ORDER, { ascii: fmt.font, hAnsi: fmt.font, cs: fmt.font, eastAsia: fmt.font });
        const size = fmt.vbase || fmt.sz;
        if (size) { setProp(rPr, 'sz', RPR_ORDER, { val: Math.round(size * 2) }); setProp(rPr, 'szCs', RPR_ORDER, { val: Math.round(size * 2) }); }
        if (fmt.color) setProp(rPr, 'color', RPR_ORDER, { val: fmt.color === 'auto' ? 'auto' : fmt.color.replace('#', '').toUpperCase() });
        if ('hl' in fmt) {
          const name = HL_NAME[String(fmt.hl || '').toLowerCase()];
          if (!fmt.hl) { setProp(rPr, 'highlight', RPR_ORDER, null); setProp(rPr, 'shd', RPR_ORDER, null); }
          else if (name) setProp(rPr, 'highlight', RPR_ORDER, { val: name });
          else setProp(rPr, 'shd', RPR_ORDER, { val: 'clear', color: 'auto', fill: fmt.hl.replace('#', '').toUpperCase() });
        }
        if (fmt.va) setProp(rPr, 'vertAlign', RPR_ORDER, fmt.va === 'baseline' ? null : { val: fmt.va });
      }
      if (rPr && rPr.children.length) r.appendChild(rPr);
      return r;
    }
    function addText(r, s) {
      const last = r.lastElementChild;
      if (last && last.localName === 't') { last.textContent += s; return; }
      const t = mk('t'); t.setAttributeNS(XMLNS_XML, 'xml:space', 'preserve'); t.textContent = s; r.appendChild(t);
    }
    /* reconstruit le contenu d'un paragraphe à partir de l'écran */
    function fill(xp, el, H, pPr) {
      const bookmarks = [...xp.children].filter(c => c.localName === 'bookmarkStart' || c.localName === 'bookmarkEnd');
      const markRPr = pPr ? ch(pPr, 'rPr') : null;
      const kept = new Set();
      const segs = H.segments(el);
      const parts = [];
      let cur = null, curKey = null, hostH = null, hostEl = null;
      const parentFor = h => {
        if (h === null || h === undefined) { hostH = null; hostEl = null; return null; }
        if (hostH === h && hostEl) return hostEl;
        const src = reg.h[+h]; if (!src) { hostH = null; hostEl = null; return null; }
        hostEl = src.cloneNode(false); hostH = h; parts.push(hostEl); return hostEl;
      };
      for (const s of segs) {
        const host = parentFor(s.h);
        const put = node => { if (host) host.appendChild(node); else parts.push(node); };
        if (s.t === 'keep') {
          let node = reg.r[+s.ri]; if (!node) continue;
          if (kept.has(node)) node = node.cloneNode(true); kept.add(node);
          put(node); cur = null; curKey = null; continue;
        }
        const key = (s.ri ?? '') + '|' + JSON.stringify(s.fmt || {}) + '|' + (s.h ?? '');
        if (!cur || key !== curKey) { cur = newRun(s.ri, s.fmt, markRPr); curKey = key; put(cur); }
        if (s.t === 'text') addText(cur, s.s);
        else if (s.t === 'tab') cur.appendChild(mk('tab'));
        else if (s.t === 'br') cur.appendChild(mk('br'));
        else if (s.t === 'pbr') { const b = mk('br'); b.setAttributeNS(W, 'w:type', 'page'); cur.appendChild(b); }
      }
      for (const c of [...xp.children]) if (c !== pPr) c.remove();
      bookmarks.filter(b => b.localName === 'bookmarkStart').forEach(b => xp.appendChild(b));
      parts.forEach(n => xp.appendChild(n));
      bookmarks.filter(b => b.localName === 'bookmarkEnd').forEach(b => xp.appendChild(b));
    }
    function applyPprOverrides(pPr, el) {
      const o = el.dataset.ppr ? JSON.parse(el.dataset.ppr) : {};
      if (o.style) setProp(pPr, 'pStyle', PPR_ORDER, { val: o.style });
      if (o.jc) setProp(pPr, 'jc', PPR_ORDER, { val: o.jc });
    }
    function ensurePPr(xp) { let p = ch(xp, 'pPr'); if (!p) { p = mk('pPr'); xp.insertBefore(p, xp.firstChild); } return p; }
    function rebuild(xp, el, H) {
      const pPr = el.dataset.ppr ? ensurePPr(xp) : ch(xp, 'pPr');
      if (el.dataset.ppr) applyPprOverrides(pPr, el);
      fill(xp, el, H, pPr);
    }
    function buildNew(src, el, H) {
      const np = mk('p');
      const sp = ch(src, 'pPr');
      let pPr = null;
      if (sp) { pPr = sp.cloneNode(true); for (const c of [...pPr.children]) if (c.localName === 'sectPr' || c.localName === 'pPrChange') c.remove(); np.appendChild(pPr); }
      if (el.dataset.ppr) { pPr = pPr || ensurePPr(np); applyPprOverrides(pPr, el); }
      fill(np, el, H, pPr);
      return np;
    }
    function removeP(xp) {
      const parent = xp.parentNode; if (!parent) return;
      const keepEmpty = ch(ch(xp, 'pPr'), 'sectPr') || ((parent.localName === 'tc' || parent.localName === 'txbxContent' || parent.localName === 'footnote') && chs(parent, 'p').length <= 1);
      if (keepEmpty) { for (const c of [...xp.children]) if (c.localName !== 'pPr') c.remove(); }
      else parent.removeChild(xp);
    }
    function patch(flow, H) {
      // tableaux supprimés
      const domT = new Set([...flow.querySelectorAll('table[data-ti]')].map(t => t.dataset.ti));
      reg.t.forEach((t, i) => { if (t && !domT.has(String(i)) && t.parentNode) { t.parentNode.removeChild(t); reg.t[i] = null; } });
      const occ = new Map();
      for (const el of flow.querySelectorAll('[data-pi]')) { const k = el.dataset.pi; if (!occ.has(k)) occ.set(k, []); occ.get(k).push(el); }
      for (const pi of [...rendered]) if (!occ.has(String(pi))) { const x = reg.p[pi]; if (x) removeP(x); rendered.delete(pi); }
      for (const [k, els] of occ) {
        const src = reg.p[+k]; if (!src || !src.parentNode) continue;
        let prev = src;
        els.forEach((el, i) => {
          if (i === 0) { if (H.sigOf(el) !== H.orig.get(k)) rebuild(src, el, H); return; }
          const np = buildNew(src, el, H);
          prev.parentNode.insertBefore(np, prev.nextSibling); prev = np;
          const ni = reg.p.push(np) - 1; rendered.add(ni); reg.pinfo[ni] = reg.pinfo[+k]; reg.numCss[ni] = reg.numCss[+k];
          el.dataset.pi = String(ni);
        });
      }
      // zones de texte : la copie « de secours » (VML) suit le texte modifié
      for (const ac of doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/markup-compatibility/2006', 'AlternateContent')) {
        const c = ch(ac, 'Choice'), f = ch(ac, 'Fallback'); if (!c || !f) continue;
        const ct = c.getElementsByTagNameNS(W, 'txbxContent'), ft = f.getElementsByTagNameNS(W, 'txbxContent');
        if (ct.length !== 1 || ft.length !== 1) continue;
        const dst = ft[0]; while (dst.firstChild) dst.removeChild(dst.firstChild);
        for (const n of ct[0].childNodes) dst.appendChild(n.cloneNode(true));
      }
    }
    async function pack() {
      let xml = new XMLSerializer().serializeToString(doc);
      if (!/^<\?xml/.test(xml)) xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + xml;
      return AlixoDocEdit.repack(zip, { [main]: xml }, MIME);
    }
    function nextStyle(pi) { const info = reg.pinfo[+pi]; const s = info && styles[info.sid]; return s && s.next && s.next !== s.id ? s.next : ''; }
    function dispose() { for (const u of urls.values()) if (u) URL.revokeObjectURL(u); }
    const bgEl = doc.getElementsByTagNameNS(W, 'background')[0];
    const pageBg = bgEl && at(bgEl, 'color') && at(bgEl, 'color') !== 'auto' ? '#' + at(bgEl, 'color') : '';

    return { html, sections, hf, evenOdd: settings.evenOdd, footnoteHtml, renumber, styles: styleList, fonts: [...fontsUsed].filter(Boolean), applyStyle, baseCss, patch, pack, nextStyle, dispose, mime: MIME, pageBg, note };
  }
  /* noms des styles de Word en français (documents créés avec un Word anglais) */
  const STYLE_FR = { normal: 'Normal', 'heading 1': 'Titre 1', 'heading 2': 'Titre 2', 'heading 3': 'Titre 3', 'heading 4': 'Titre 4', 'heading 5': 'Titre 5', 'heading 6': 'Titre 6', title: 'Titre', subtitle: 'Sous-titre', quote: 'Citation', 'intense quote': 'Citation intense', 'list paragraph': 'Paragraphe de liste', 'no spacing': 'Sans interligne', 'body text': 'Corps de texte', caption: 'Légende', 'toc heading': 'En-tête de table des matières', header: 'En-tête', footer: 'Pied de page', 'footnote text': 'Note de bas de page' };

  return { load, MIME };
})();
