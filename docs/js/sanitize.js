/* ============================================================
   Alixo — assainissement de tout ce qui vient du presse-papiers (1.51).
   Chargé AVANT app.js, sans dépendance.

   Rien de ce qui est collé n'est digne de confiance, pas même le format « text/x-alixo » : n'importe
   quelle page web peut le poser dans le presse-papiers. Tout passe donc par ici avant d'atteindre le
   modèle ou l'écran.

   Principe : le HTML reçu est analysé par DOMParser (document inerte : aucun script ne s'exécute,
   aucune ressource n'est chargée), puis RECONSTRUIT en chaîne à partir d'une liste blanche. Aucun
   nœud ni attribut d'origine n'est réutilisé : ce qui n'est pas expressément prévu n'existe pas.

     AlixoSanitize.inline(html)   mise en forme seule (b, i, u, s, sup, sub, mark, br, span[style])
     AlixoSanitize.atoms(html)    + atomes Alixo (liens, références d'articles, rangs, résultats de calcul)
     AlixoSanitize.rich(html)     + blocs imbriqués (.nb : tableau, citation, encadré) et listes
     AlixoSanitize.blocks(arr)    tableau de blocs : types, champs HTML et propriétés scalaires validés,
                                  identifiants toujours régénérés
     AlixoSanitize.configure({ fonts, callouts, fiches, scores, calcs, charts, graphs, numStyles, normShape })
                                  listes connues d'app.js : une clé absente de sa liste est refusée
     AlixoSanitize.parseBlocks(json)  JSON du presse-papiers → blocs sûrs, sous un budget global par collage
                                  (AlixoSanitize.tooBig() : le dernier appel a-t-il été abandonné pour dépassement ?)
   ============================================================ */
'use strict';

window.AlixoSanitize = (() => {
  const cfg = { fonts: [], callouts: null, fiches: null, scores: null, calcs: null, charts: null, graphs: null, numStyles: null, linkKinds: null, icons: null, normShape: null };
  /* fonts : piles CSS admises (DOC_FONTS) ; callouts / fiches / scores / calcs / charts / graphs / numStyles : clés connues
     (scores cliniques, calculateurs, types de graphiques, styles de numérotation) ; normShape : validateur des objets de dessin */
  function configure(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.fonts)) cfg.fonts = o.fonts.filter(f => typeof f === 'string' && f).map(f => ({ css: f, key: fontKey(f) }));
    if (Array.isArray(o.callouts)) cfg.callouts = o.callouts.map(String);
    if (Array.isArray(o.fiches)) cfg.fiches = o.fiches.map(String);
    for (const k of ['scores', 'calcs', 'charts', 'graphs', 'numStyles', 'linkKinds', 'icons']) if (Array.isArray(o[k])) cfg[k] = o[k].map(String);   // 1.52 : + linkKinds, icons (bouton de lien)
    if (typeof o.normShape === 'function') cfg.normShape = o.normShape;
  }

  /* ---------------- outils ---------------- */
  const MAX_HTML = 1500000;      // au-delà : texte brut
  const MAX_DEPTH = 60;          // profondeur d'éléments parcourue
  const MAX_NEST = 3;            // blocs imbriqués (comme nest.js)
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const ID_RE = /^[\w-]{1,64}$/;
  const KEY_RE = /^[\w-]{1,40}$/;
  const ALIGNS = ['left', 'center', 'right', 'justify'];
  const hex = v => (typeof v === 'string' && HEX_RE.test(v.trim()) ? v.trim() : '');
  const align = v => (typeof v === 'string' && ALIGNS.includes(v) ? v : '');
  const num = (v, lo, hi) => { if (typeof v !== 'number' && typeof v !== 'string') return undefined; if (v === '') return undefined; const n = +v; return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : undefined; };
  const int = (v, lo, hi) => { const n = num(v, lo, hi); return n === undefined ? undefined : Math.round(n); };
  /* texte simple (jamais interprété comme du HTML par l'appelant, qui l'échappe) : borné, sans caractères de contrôle */
  const plain = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max) : '');
  /* texte court destiné à des gabarits anciens qui ne l'échappent pas tous : sans caractère de balisage */
  const bare = (v, max) => plain(v, max).replace(/[<>"'`&]/g, '');
  /* une clé sert à indexer un objet d'app.js : jamais un nom hérité d'Object.prototype (« constructor », « toString », « __proto__ »…) */
  const inherited = v => v in Object.prototype;
  const key = (v, def) => (typeof v === 'string' && KEY_RE.test(v) && !inherited(v) ? v : def);
  /* clé d'une liste connue (configure) ; sans liste : forme valide et non héritée. Renvoie '' si elle est refusée. */
  const known = (list, v) => (typeof v !== 'string' ? '' : list ? (list.includes(v) ? v : '') : key(v, ''));

  /* ---------------- style : recomposé propriété par propriété ---------------- */
  const COLOR_RE = /^(?:#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*\d{1,3}(?:\.\d+)?%?(?:\s*[, ]\s*\d{1,3}(?:\.\d+)?%?){2}(?:\s*[,/]\s*(?:0|1|0?\.\d{1,6}|\d{1,3}%))?\s*\)|[a-z]{3,24})$/i;
  /* « transparent », « currentcolor » et « inherit » sont refusés : ils servent à rendre invisible un texte collé */
  const COLOR_BAD = /^(?:initial|unset|revert|revertlayer|none|auto|normal|transparent|currentcolor|inherit)$/i;
  const color = v => { v = String(v || '').trim(); return v && v.length <= 60 && COLOR_RE.test(v) && !COLOR_BAD.test(v) ? v.toLowerCase() : ''; };
  /* opacité d'une couleur déjà validée (1 si elle n'en précise pas) */
  function alphaOf(c) {
    let m = c.match(/^#(?:[0-9a-f]{3}([0-9a-f])|[0-9a-f]{6}([0-9a-f]{2}))$/i);
    if (m) return parseInt(m[1] ? m[1] + m[1] : m[2], 16) / 255;
    m = c.match(/^rgba?\((.*)\)$/i);
    if (!m) return 1;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 4) return 1;
    const a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return Number.isFinite(a) ? a : 1;
  }
  /* couleur du texte : en plus, jamais (presque) transparente — un surlignage, lui, peut l'être */
  const inkColor = v => { const c = color(v); return c && alphaOf(c) >= 0.4 ? c : ''; };
  const fontKey = f => String(f || '').toLowerCase().replace(/["'\s]/g, '');
  function fontFamily(v) {
    const k = fontKey(v); if (!k) return '';
    if (k === 'var(--font-serif-base)') return 'var(--font-serif-base)';
    const f = cfg.fonts.find(x => x.key === k);
    return f ? f.css : '';
  }
  /* taille → points, de 5 à 96 (arrondie au demi-point, comme applyFontSize) */
  function fontSize(v) {
    const m = String(v || '').trim().match(/^(\d{1,4}(?:\.\d{1,4})?)(pt|px|em|rem|%)$/i);
    if (!m) return '';
    const n = +m[1], u = m[2].toLowerCase();
    const pt = u === 'pt' ? n : u === 'px' ? n * 0.75 : u === '%' ? n * 0.11 : n * 11;
    if (!(pt > 0)) return '';
    return Math.max(5, Math.min(96, Math.round(pt * 2) / 2)) + 'pt';
  }
  /* st : CSSStyleDeclaration d'un élément du document inerte ; level : 0 mise en forme · 2 + alignement et couleurs d'encadré */
  function styleOf(st, level) {
    if (!st) return '';
    const out = [];
    const get = p => { try { return st.getPropertyValue(p) || ''; } catch { return ''; } };
    let v = inkColor(get('color')); if (v) out.push('color: ' + v);
    v = color(get('background-color')); if (v) out.push('background-color: ' + v);
    v = fontSize(get('font-size')); if (v) out.push('font-size: ' + v);
    v = fontFamily(get('font-family')); if (v) out.push('font-family: ' + v);
    if (level < 0) return out.join('; ');   // couleur, surlignage, taille, police seulement (gras, italique… : par les balises)
    v = get('font-weight').trim(); if (/^(?:bold|normal|[1-9]00)$/.test(v)) out.push('font-weight: ' + v);
    v = get('font-style').trim(); if (/^(?:italic|normal)$/.test(v)) out.push('font-style: ' + v);
    v = (get('text-decoration-line') || get('text-decoration')).trim(); if (/^(?:underline|line-through|underline line-through|line-through underline)$/.test(v)) out.push('text-decoration-line: ' + v);
    if (level >= 2) { v = align(get('text-align').trim()); if (v) out.push('text-align: ' + v); }
    return out.join('; ');
  }
  const styleAttr = s => (s ? ` style="${esc(s)}"` : '');
  /* style sûr d'un élément d'un document inerte, propriété par propriété (couleur, surlignage, taille, police), ou null */
  const SPAN_PROPS = ['color', 'background-color', 'font-size', 'font-family'];
  function spanProps(el) {
    const p = {};
    const get = k => { try { return (el && el.style && el.style.getPropertyValue(k)) || ''; } catch { return ''; } };
    let v = inkColor(get('color')); if (v) p.color = v;
    v = color(get('background-color')); if (v) p['background-color'] = v;
    v = fontSize(get('font-size')); if (v) p['font-size'] = v;
    v = fontFamily(get('font-family')); if (v) p['font-family'] = v;
    if (el && el.localName === 'font') {
      if (!p.color) { const c = inkColor(el.getAttribute('color')); if (c) p.color = c; }
      if (!p['font-family']) { const ff = fontFamily(el.getAttribute('face')); if (ff) p['font-family'] = ff; }
    }
    return SPAN_PROPS.some(k => p[k]) ? p : null;
  }
  /* balise ouvrante <span style="…"> pour un style rendu par spanProps (ou une fusion de tels styles), ou '' */
  function propsSpan(p) {
    const st = p ? SPAN_PROPS.filter(k => typeof p[k] === 'string' && p[k]).map(k => k + ': ' + p[k]).join('; ') : '';
    return st ? `<span${styleAttr(st)}>` : '';
  }
  /* balise ouvrante <span style="…"> sûre pour un élément d'un document inerte, ou '' */
  const spanOpen = el => propsSpan(spanProps(el));
  /* le HTML porte-t-il la marque de provenance posée à la copie ? (simple indice : le contenu est assaini de toute façon) */
  const isAlixoClip = html => typeof html === 'string' && /data-alixo-clip=/.test(html);

  /* ---------------- HTML : reconstruction par liste blanche ---------------- */
  const FMT = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's', sup: 'sup', sub: 'sub', mark: 'mark' };
  /* retirés avec tout leur contenu */
  const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'svg', 'math', 'img', 'head', 'title', 'base', 'noscript', 'template', 'button', 'select', 'option', 'textarea', 'video', 'audio', 'canvas', 'frame', 'frameset', 'applet', 'picture', 'source', 'track', 'map', 'area', 'dialog', 'slot', 'portal', 'xml']);
  /* habillages de l'éditeur qui ne font pas partie du texte */
  const DROP_CLASS = ['corr-notes', 'lnk-print', 'ai-sug', 'mv-handle', 'fl-layer', 'tbl-rz', 'q-src'];
  const BLOCKISH = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'aside', 'main', 'nav', 'pre', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'blockquote', 'ul', 'ol', 'li', 'address', 'center', 'fieldset', 'details', 'summary']);
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const hasClass = (el, c) => { try { return el.classList.contains(c); } catch { return false; } };
  function safeHref(v) {
    v = Array.from(String(v || '')).filter(ch => { const c = ch.codePointAt(0); return c > 0x20 && !(c >= 0x7F && c <= 0x9F) && !(c >= 0x200B && c <= 0x200F) && c !== 0x2028 && c !== 0x2029 && c !== 0xFEFF; }).join('');   // ni espace ni caractère de contrôle ou invisible
    if (!v || v.length > 2000) return '';
    return /^(?:https?:\/\/|mailto:)/i.test(v) ? v : '';
  }
  const titleAttr = el => { const t = el.getAttribute('title'); return t ? ` title="${esc(plain(t, 400))}"` : ''; };

  /* o = { s: sortie, level: 0 | 1 | 2, nest: profondeur d'imbrication } */
  function sep(o) { if (o.s && !/(?:<br>|<\/(?:table|blockquote|div|ul|ol|li)>|<(?:td|li|blockquote|div[^>]*)>)$/.test(o.s)) o.s += '<br>'; }
  function children(node, o, depth) { for (const n of node.childNodes) walk(n, o, depth + 1); }
  function walk(n, o, depth) {
    if (n.nodeType === 3) { o.s += esc(n.nodeValue || '').replace(/&#39;/g, '\'').replace(/&quot;/g, '"'); return; }
    if (n.nodeType !== 1) return;                       // commentaires, instructions : ignorés
    if (n.namespaceURI !== HTML_NS) return;            // SVG, MathML : retirés avec leur contenu
    const tag = n.localName;
    if (DROP.has(tag)) return;
    if (DROP_CLASS.some(c => hasClass(n, c))) return;
    if (depth > MAX_DEPTH) { o.s += esc(n.textContent || ''); return; }
    if (tag === 'br') { o.s += '<br>'; return; }

    /* atomes (non éditables : leur contenu n'est que du texte) */
    if (o.level >= 1) {
      if (tag === 'a') {
        const href = safeHref(n.getAttribute('href'));
        const txt = esc(n.textContent || '');
        if (href && hasClass(n, 'lnk')) { o.s += `<a class="lnk" href="${esc(href)}" contenteditable="false" target="_blank" rel="noopener"${titleAttr(n)}>${txt}</a>`; return; }
        if (href && hasClass(n, 'refart')) {
          const item = n.getAttribute('data-item'), rang = n.getAttribute('data-rang');
          o.s += `<a class="refart${hasClass(n, 'item') ? ' item' : ''}" contenteditable="false" target="_blank" rel="noopener" href="${esc(href)}"${item !== null ? ` data-item="${esc(plain(item, 40))}"` : ''}${rang !== null ? ` data-rang="${esc(plain(rang, 4))}"` : ''}${titleAttr(n)}>${txt}</a>`;
          return;
        }
        children(n, o, depth); return;                  // lien quelconque : son texte seul
      }
      if (tag === 'span' && hasClass(n, 'calc-res')) { o.s += `<span class="calc-res" contenteditable="false"${titleAttr(n)}>${esc(n.textContent || '')}</span>`; return; }
      if (tag === 'span' && hasClass(n, 'rtag')) {
        const r = ['a', 'b', 'c'].find(c => hasClass(n, c));
        o.s += `<span class="rtag${r ? ' ' + r : ''}" contenteditable="false"${titleAttr(n)}>${esc(plain(n.textContent || '', 4))}</span>`;
        return;
      }
    }

    /* blocs imbriqués et listes */
    if (o.level >= 2) {
      if (tag === 'ul' || tag === 'ol' || tag === 'li') { o.s += `<${tag}>`; children(n, o, depth); o.s += `</${tag}>`; return; }
      const nestable = o.nest < MAX_NEST;
      if (tag === 'table' && nestable) {
        const rows = [...n.rows].filter(tr => tr.closest('table') === n);
        if (rows.length) {
          o.s += `<table class="nb nb-tbl${hasClass(n, 'has-head') ? ' has-head' : ''}"><tbody>`;
          o.nest++;
          for (const tr of rows.slice(0, 200)) {
            o.s += '<tr>';
            for (const c of [...tr.cells].slice(0, 50)) { o.s += '<td>'; const at = o.s.length; children(c, o, depth + 2); if (o.s.length === at) o.s += '<br>'; o.s += '</td>'; }
            o.s += '</tr>';
          }
          o.nest--;
          o.s += '</tbody></table>';
        }
        return;
      }
      if (tag === 'blockquote' && nestable) {
        o.s += '<blockquote class="nb nb-quote">'; const at = o.s.length;
        o.nest++; children(n, o, depth); o.nest--;
        if (o.s.length === at) o.s += '<br>';
        o.s += '</blockquote>';
        return;
      }
      if (tag === 'div' && hasClass(n, 'nb-call') && nestable) {
        const raw = n.getAttribute('data-ct') || '';
        const ct = cfg.callouts ? (cfg.callouts.includes(raw) ? raw : 'retenir') : key(raw, 'retenir');
        let light = '', dark = '';
        try { light = hex(n.style.getPropertyValue('--cc-light')); dark = hex(n.style.getPropertyValue('--cc-dark')); } catch { light = dark = ''; }
        const kids = [...n.children];
        const title = kids.find(c => hasClass(c, 'nb-title')), body = kids.find(c => hasClass(c, 'nb-body'));
        o.s += `<div class="nb nb-call" data-ct="${esc(ct)}"${light ? ` style="--cc-light:${light}; --cc-dark:${dark || light}"` : ''}>`;
        if (title) o.s += `<div class="nb-title" contenteditable="false">${esc(plain(title.textContent || '', 80))}</div>`;
        o.s += '<div class="nb-body">'; const at = o.s.length;
        o.nest++;
        if (body) children(body, o, depth + 1);
        else for (const c of n.childNodes) if (c !== title) walk(c, o, depth + 1);
        o.nest--;
        if (o.s.length === at) o.s += '<br>';
        o.s += '</div></div>';
        return;
      }
    }

    /* mise en forme */
    const f = FMT[tag];
    if (f) {
      const st = styleOf(n.style, 0);
      o.s += `<${f}>` + (st ? `<span${styleAttr(st)}>` : '');
      children(n, o, depth);
      o.s += (st ? '</span>' : '') + `</${f}>`;
      return;
    }
    if (tag === 'span' || tag === 'font') {
      let st = styleOf(n.style, 0);
      if (tag === 'font') {   // <font color face> (anciens contenus) → style
        const parts = st ? [st] : [];
        const c = inkColor(n.getAttribute('color')); if (c && !/(?:^|; )color: /.test(st)) parts.push('color: ' + c);
        const ff = fontFamily(n.getAttribute('face')); if (ff && !/font-family: /.test(st)) parts.push('font-family: ' + ff);
        st = parts.join('; ');
      }
      if (!st) { children(n, o, depth); return; }
      o.s += `<span${styleAttr(st)}${n.getAttribute('data-auto-ink') === '1' ? ' data-auto-ink="1"' : ''}>`;
      children(n, o, depth);
      o.s += '</span>';
      return;
    }
    /* tout le reste est déplié : seul le contenu reste, les éléments de structure deviennent des sauts de ligne */
    const blk = BLOCKISH.has(tag);
    if (blk) sep(o);
    children(n, o, depth);
    if (blk) sep(o);
  }
  /* budget global d'un collage (parseBlocks) : nombre de champs / cases et taille cumulée de la sortie. Sans budget
     en cours (inline, atoms, rich, blocks appelés directement), rien n'est compté. */
  const MAX_JSON = 5000000, MAX_FIELDS = 20000, MAX_OUT = 5000000;
  const OVER = { name: 'AlixoSanitizeBudget' };   // sentinelle levée au dépassement, rattrapée par parseBlocks
  let budget = null, lastTooBig = false;
  function spend(fields, out) {
    if (!budget) return;
    budget.n += fields; budget.out += out;
    if (budget.n > MAX_FIELDS || budget.out > MAX_OUT) throw OVER;
  }
  function clean(html, level) {
    const out = cleanRaw(html, level);
    spend(1, out.length);
    return out;
  }
  function cleanRaw(html, level) {
    if (typeof html !== 'string' || !html) return '';
    if (html.length > MAX_HTML) return esc(html.slice(0, MAX_HTML).replace(/<[^>]*>/g, ''));
    if (!/[<&]/.test(html)) return html.replace(/>/g, '&gt;');
    let parsed;
    try { parsed = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html'); } catch { return esc(html.replace(/<[^>]*>/g, '')); }
    if (!parsed || !parsed.body) return '';
    const o = { s: '', level, nest: 0 };
    try { children(parsed.body, o, 0); } catch { return esc(parsed.body.textContent || ''); }
    return level >= 2 ? o.s : o.s.replace(/(?:<br>)+$/, '');
  }
  const inline = html => clean(html, 0);
  const atoms = html => clean(html, 1);
  const rich = html => clean(html, 2);
  const text = html => { if (typeof html !== 'string' || !html) return ''; try { return new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html').body.textContent || ''; } catch { return html.replace(/<[^>]*>/g, ''); } };

  /* ---------------- blocs ---------------- */
  const MAX_BLOCKS = 2000;
  function fieldsOf(v) {
    const out = {};
    if (isObj(v)) for (const k of Object.keys(v).slice(0, 60)) if (KEY_RE.test(k)) out[k] = atoms(typeof v[k] === 'string' ? v[k] : '');
    return out;
  }
  function treeNode(n, depth, count) {
    if (!isObj(n) || depth > 12 || count.n >= 500) return { t: '', k: [] };
    count.n++;
    const out = { t: atoms(typeof n.t === 'string' ? n.t : ''), k: [] };
    if (Array.isArray(n.k)) for (const c of n.k.slice(0, 60)) { if (count.n >= 500) break; out.k.push(treeNode(c, depth + 1, count)); }
    return out;
  }
  /* réglages non destructifs d'une image (lot « outils d'image ») */
  function imgFx(v) {
    if (!isObj(v)) return null;
    const o = {};
    for (const k of ['br', 'ct', 'sat']) { const n = num(v[k], -100, 100); if (n !== undefined && n !== 0) o[k] = n; }
    if (v.gray === true) o.gray = true;
    const rad = num(v.rad, 0, 50); if (rad) o.rad = rad;
    if (v.sh === true) o.sh = true;
    if (isObj(v.bd)) { const w = num(v.bd.w, 0, 12), c = hex(v.bd.c); if (w) o.bd = c ? { w, c } : { w }; }
    return Object.keys(o).length ? o : null;
  }
  function grid(v, fn, maxR, maxC) {
    if (!Array.isArray(v)) return null;
    return v.slice(0, maxR).map(row => (Array.isArray(row) ? row.slice(0, maxC).map(fn) : []));
  }
  function block(b) {
    if (!isObj(b)) return null;
    const type = typeof b.type === 'string' ? b.type : 'p';
    const o = { id: uid(), type };
    const al = align(b.al); if (al && al !== 'left') o.al = al;
    if (b.gen === 'alixoai') o.gen = 'alixoai';   // 1.52 : bloc écrit ou réécrit par Coco (AlixoAI) — seule valeur admise
    const html = k => rich(typeof b[k] === 'string' ? b[k] : '');
    switch (type) {
      case 'p': o.text = html('text'); break;
      case 'h': {
        o.text = html('text'); o.level = int(b.level, 1, 6) || 1;
        /* style de numérotation : clé de NUM_STYLES (« I », « A », « 1 », « § »…) — une clé inconnue est retirée, le titre reste */
        if (typeof b.st === 'string' && !inherited(b.st) && (cfg.numStyles ? cfg.numStyles.includes(b.st) : /^[\w.()-]{1,20}$/.test(b.st))) o.st = b.st;
        break;
      }
      case 'li': {
        o.text = html('text'); o.lt = b.lt === 'ol' || b.lt === 'cl' ? b.lt : 'ul';
        const ind = int(b.ind, 0, 3); if (ind) o.ind = ind;
        if (b.done === true) o.done = true;
        break;
      }
      case 'quote': { o.text = html('text'); const c = atoms(typeof b.cite === 'string' ? b.cite : ''); if (c) o.cite = c; break; }
      case 'callout': {
        o.text = html('text');
        o.ct = cfg.callouts ? (cfg.callouts.includes(b.ct) ? b.ct : 'retenir') : key(b.ct, 'retenir');
        break;
      }
      case 'juris': o.fields = fieldsOf(b.fields); break;
      case 'fiche': {
        o.fk = cfg.fiches ? (cfg.fiches.includes(b.fk) ? b.fk : 'patho') : key(b.fk, 'patho');
        o.fields = fieldsOf(b.fields);
        break;
      }
      case 'formula': o.src = plain(b.src, 5000); break;   // source de formule : texte (« < » légitime), toujours échappé ou composé au rendu
      case 'graph': {
        o.gtype = known(cfg.graphs, b.gtype);
        if (!o.gtype) return null;   // type de graphique inconnu : bloc refusé
        o.params = {};
        if (isObj(b.params)) for (const k of Object.keys(b.params).slice(0, 40)) {
          if (!KEY_RE.test(k)) continue;
          const v = b.params[k];
          if (typeof v === 'boolean') o.params[k] = v;
          else if (typeof v === 'number') { if (Number.isFinite(v)) o.params[k] = v; }
          else if (typeof v === 'string') o.params[k] = bare(v, 200);
        }
        break;
      }
      case 'table': {
        const rows = grid(b.rows, c => rich(typeof c === 'string' ? c : ''), 200, 50) || [];
        o.rows = rows.filter(r => r.length);
        if (!o.rows.length) o.rows = [['', ''], ['', '']];
        o.head = b.head === true;
        const nc = Math.max(1, ...o.rows.map(r => r.length));
        if (Array.isArray(b.widths) && b.widths.length === nc) { const w = b.widths.map(x => num(x, 1, 100)); if (w.every(x => x !== undefined)) o.widths = w; }
        const bg = grid(b.bg, c => hex(c) || null, 200, 50); if (bg) o.bg = bg;
        const ta = grid(b.ta, c => align(c) || null, 200, 50); if (ta) o.ta = ta;
        if (Array.isArray(b.spans)) {
          const sp = [];
          for (const x of b.spans.slice(0, 500)) {
            if (!isObj(x)) continue;
            const r = int(x.r, 0, 199), c = int(x.c, 0, 49), rs = int(x.rs, 1, 200), cs = int(x.cs, 1, 50);
            if (r === undefined || c === undefined || rs === undefined || cs === undefined) continue;
            if (r + rs > o.rows.length || c + cs > nc || (rs < 2 && cs < 2)) continue;
            sp.push({ r, c, rs, cs });
          }
          if (sp.length) o.spans = sp;
        }
        break;
      }
      case 'img': {
        if (typeof b.iid === 'string' && ID_RE.test(b.iid)) o.iid = b.iid;
        const nw = num(b.nw, 1, 100000), nh = num(b.nh, 1, 100000); if (nw) o.nw = nw; if (nh) o.nh = nh;
        const w = num(b.w, 8, 100); if (w) o.w = w;
        if (['left', 'right', 'center'].includes(b.align)) o.align = b.align;
        if (isObj(b.crop)) {
          const c = { x: num(b.crop.x, 0, 1), y: num(b.crop.y, 0, 1), w: num(b.crop.w, 0, 1), h: num(b.crop.h, 0, 1) };
          if (c.w > 0 && c.h > 0 && c.x !== undefined && c.y !== undefined) o.crop = c;
        }
        if (typeof b.cap === 'string') o.cap = atoms(b.cap);
        const alt = plain(b.alt, 500); if (alt) o.alt = alt;
        const fx = imgFx(b.fx); if (fx) o.fx = fx;
        if (isObj(b.o) && typeof b.o.iid === 'string' && ID_RE.test(b.o.iid)) {
          const ow = num(b.o.nw, 1, 100000), oh = num(b.o.nh, 1, 100000);
          if (ow && oh) o.o = { iid: b.o.iid, nw: ow, nh: oh };
        }
        break;
      }
      case 'draw': {
        o.shapes = [];
        if (Array.isArray(b.shapes) && cfg.normShape) for (const s of b.shapes.slice(0, 2000)) { spend(1, 0); let c = null; try { c = cfg.normShape(s); } catch { c = null; } if (c) o.shapes.push(c); }
        const h = num(b.h, 40, 4000); if (h) o.h = h;
        break;
      }
      case 'chart': {
        o.ck = known(cfg.charts, b.ck) || 'bar';   // type de graphique inconnu : barres
        o.title = plain(b.title, 200);
        o.labels = Array.isArray(b.labels) ? b.labels.slice(0, 200).map(x => plain(x, 120)) : [];
        o.series = [];
        if (Array.isArray(b.series)) for (const s of b.series.slice(0, 24)) {
          if (!isObj(s) || !Array.isArray(s.data)) continue;
          const c = { name: plain(s.name, 120), data: s.data.slice(0, 200).map(v => (v === null || v === '' ? null : (num(v, -1e15, 1e15) === undefined ? null : num(v, -1e15, 1e15)))) };
          const col = hex(s.color); if (col) c.color = col;
          if (Array.isArray(s.colors)) c.colors = s.colors.slice(0, 200).map(x => hex(x) || null);
          o.series.push(c);
        }
        o.opts = {};
        if (isObj(b.opts)) {
          for (const k of ['legend', 'values', 'stack']) if (typeof b.opts[k] === 'boolean') o.opts[k] = b.opts[k];
          for (const k of ['ymin', 'ymax']) { const n = num(b.opts[k], -1e15, 1e15); if (n !== undefined) o.opts[k] = n; }
          const u = bare(b.opts.unit, 12); if (u) o.opts.unit = u;
        }
        break;
      }
      case 'score': {
        o.sk = known(cfg.scores, b.sk);
        if (!o.sk) return null;   // score inconnu : bloc refusé
        o.vals = Array.isArray(b.vals) ? b.vals.slice(0, 100).map(v => (typeof v === 'boolean' ? v : typeof v === 'number' && Number.isFinite(v) ? v : null)) : [];
        break;
      }
      case 'mcalc': {
        o.ck = known(cfg.calcs, b.ck);
        if (!o.ck) return null;   // calculateur inconnu : bloc refusé
        o.vals = {};
        if (isObj(b.vals)) for (const k of Object.keys(b.vals).slice(0, 60)) {
          if (!KEY_RE.test(k)) continue;
          const v = b.vals[k];
          if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) o.vals[k] = v;
          else if (typeof v === 'string') o.vals[k] = bare(v, 40);
        }
        break;
      }
      case 'timer': {
        o.mode = b.mode === 'up' ? 'up' : 'down';
        o.secs = int(b.secs, 0, 360000) || 0;
        const l = plain(b.label, 80); if (l) o.label = l;
        break;
      }
      case 'hr': case 'pb': break;
      case 'tree': o.root = treeNode(b.root, 0, { n: 0 }); break;
      case 'toc': {
        const t = plain(b.title, 80); if (t) o.title = t;
        const d = int(b.depth, 1, 6); if (d) o.depth = d;
        break;
      }
      case 'docref': {
        if (typeof b.ref === 'string' && ID_RE.test(b.ref)) o.ref = b.ref;
        if (typeof b.kind === 'string' && KEY_RE.test(b.kind) && !inherited(b.kind)) o.kind = b.kind;
        break;
      }
      case 'linkbtn': {   // 1.52 : bouton de lien — cible invalide ⇒ bloc refusé ; url https: seulement (main.js n'ouvre que https) ; couleur, icône, taille, alignement en liste blanche
        o.kind = known(cfg.linkKinds, b.kind); if (!o.kind) return null;
        if (o.kind === 'url') { const u = safeHref(b.url); if (!/^https:\/\/[^/?#\s]/i.test(u) || u.length > 2000) return null; o.url = u; }
        else if (typeof b.ref === 'string' && ID_RE.test(b.ref)) o.ref = b.ref;
        else return null;
        const l = plain(b.label, 80).trim(); if (l) o.label = l;
        const c = hex(b.color); if (/^#[0-9a-f]{6}$/i.test(c)) o.color = c;
        const ic = known(cfg.icons, b.icon); if (ic) o.icon = ic;
        if (['s', 'm', 'l'].includes(b.size)) o.size = b.size;
        const a = align(b.align); if (a && a !== 'justify') o.align = a;
        break;
      }
      case 'cards': {
        o.cards = Array.isArray(b.cards) ? b.cards.slice(0, 60).map(c => ({ t: atoms(isObj(c) && typeof c.t === 'string' ? c.t : ''), x: atoms(isObj(c) && typeof c.x === 'string' ? c.x : '') })) : [];
        break;
      }
      case 'timeline': {
        o.dir = b.dir === 'h' ? 'h' : 'v';
        const t = atoms(typeof b.title === 'string' ? b.title : ''); if (t) o.title = t;
        o.events = Array.isArray(b.events) ? b.events.slice(0, 200).filter(isObj).map(e => ({
          d: atoms(typeof e.d === 'string' ? e.d : ''), t: atoms(typeof e.t === 'string' ? e.t : ''), x: atoms(typeof e.x === 'string' ? e.x : ''), c: hex(e.c)
        })) : [];
        break;
      }
      default: {   // type inconnu : paragraphe en texte brut
        delete o.al;
        o.type = 'p';
        o.text = esc(text(typeof b.text === 'string' ? b.text : '').slice(0, 20000)).replace(/&#39;/g, '\'').replace(/&quot;/g, '"');
        return o;
      }
    }
    /* alignement des champs (fiche, cartes) : b.fal = { <champ> : alignement } */
    if (isObj(b.fal) && (type === 'juris' || type === 'fiche' || type === 'cards')) {
      const fal = {};
      for (const k of Object.keys(b.fal).slice(0, 80)) { const a = align(b.fal[k]); if (KEY_RE.test(k) && a && a !== 'left') fal[k] = a; }
      if (Object.keys(fal).length) o.fal = fal;
    }
    return o;
  }
  /* tableau de blocs venu du presse-papiers → blocs sûrs (jamais d'exception ; [] si l'entrée n'est pas un tableau) */
  function blocks(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const b of arr.slice(0, MAX_BLOCKS)) {
      let c = null;
      spend(1, 0);
      try { c = block(b); } catch (e) { if (e === OVER) throw e; c = null; }   // seul le dépassement de budget remonte (jusqu'à parseBlocks)
      if (c) out.push(c);
    }
    return out;
  }
  /* JSON du presse-papiers → blocs sûrs, ou null. Budget global par collage : JSON de 5 Mo au plus, 20 000 champs ou
     cases, 5 Mo de sortie cumulée — au-delà, le collage est abandonné en entier (null) et tooBig() renvoie true */
  function parseBlocks(json) {
    lastTooBig = false;
    if (typeof json !== 'string' || !json) return null;
    if (json.length > MAX_JSON) { lastTooBig = true; return null; }
    let arr = null;
    try { arr = JSON.parse(json); } catch { return null; }
    if (!Array.isArray(arr)) return null;
    let out = null;
    budget = { n: 0, out: 0 };
    try { out = blocks(arr); } catch (e) { out = null; if (e === OVER) lastTooBig = true; } finally { budget = null; }
    return out && out.length ? out : null;
  }
  /* le dernier parseBlocks a-t-il été abandonné parce que le contenu dépassait le budget ? */
  const tooBig = () => lastTooBig;

  return { configure, inline, atoms, rich, blocks, parseBlocks, tooBig, text, hex, align, color, fontSize, fontFamily, esc, spanOpen, spanProps, propsSpan, isAlixoClip };   // 1.52 : fontSize, fontFamily (styles enregistrés, js/textstyles.js)
})();
