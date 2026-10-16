/* ============================================================
   Alixo — éditeur de documents Word (.docx) et OpenDocument (.odt) (1.34.1)
   Le fichier s'ouvre tel qu'il a été écrit : mêmes polices, tailles, marges, retraits, interlignes, listes,
   tableaux, images, zones de texte, en-têtes et pieds de page, sur des pages au format du document. On y écrit
   comme dans Word ; l'enregistrement réécrit LE MÊME FICHIER : seuls les paragraphes modifiés sont réécrits,
   tout le reste (styles, sections, images, champs, propriétés) est conservé octet pour octet dans l'archive.

   Ce module est le cœur, commun aux deux formats :
   - fenêtre plein écran (barre d'outils façon Word, barre d'état : page, mots, zoom) et aperçu en lecture seule ;
   - mise en page : les paragraphes et lignes de tableau sont poussés d'une page à l'autre (marges des sections,
     en-têtes et pieds de page mesurés, sauts de page, sauts de section, notes de bas de page), tabulations ;
   - zoom façon Word : toute la page s'agrandit (Ctrl + molette, Ctrl + / − / 0, curseur de la barre d'état) ;
   - mise en forme (police, taille, gras, italique, souligné, barré, exposant, indice, couleur, surlignage,
     alignement, style de paragraphe), annuler / rétablir, collage en texte brut, saut de page (Ctrl + Entrée) ;
   - enregistrement dans la bibliothèque (même fichier, même place), téléchargement, impression / PDF.
   Les formats sont lus et réécrits par js/docx.js (AlixoDocx) et js/odt.js (AlixoOdt), qui produisent le HTML :
     div.wp[data-pi]       un paragraphe du fichier (pi : index dans le fichier ; un doublon = paragraphe créé par Entrée)
     span.wr[data-ri]    un morceau de texte (ri : la portion d'origine dont il garde la mise en forme), data-fmt : retouches
     span.wtab           une tabulation · span.wpbr un saut de page · span.wnum un numéro de liste (recalculé)
     span.wkeep[data-ri] un élément conservé tel quel (image, champ, renvoi de note…)
     table.wt[data-ti]   un tableau · a.wh[data-h] un lien
   et les blocs portent data-sec (section), data-brk (saut forcé avant), data-sb (espace avant, px).
   ============================================================ */
'use strict';

window.AlixoDocEdit = (() => {
  const GAP = 22;                       // espace entre deux pages (px, à 100 %)
  const ZK = 'word';                    // réglage de zoom (AlixoZoom) propre à l'éditeur
  const ZWSP = '\u200B';
  const extOf = name => (String(name || '').split('.').pop() || '').toLowerCase();
  const adapterFor = name => ({ docx: window.AlixoDocx, odt: window.AlixoOdt })[extOf(name)] || null;
  const canOpen = name => !!adapterFor(name);
  const escH = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const jparse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
  const COMMON_FONTS = ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Garamond', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Aptos', 'Century Gothic', 'Book Antiqua', 'Palatino Linotype', 'Courier New', 'Comic Sans MS', 'Liberation Serif', 'Liberation Sans'];
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
  /* polices de remplacement métriquement compatibles (mêmes largeurs : les lignes se coupent au même endroit) */
  const FALLBACK = {
    'times new roman': ['Liberation Serif', 'Tinos', 'Times'], times: ['Times New Roman', 'Liberation Serif', 'Tinos'],
    arial: ['Liberation Sans', 'Arimo', 'Helvetica'], helvetica: ['Arial', 'Liberation Sans', 'Arimo'],
    calibri: ['Carlito', 'Segoe UI', 'Arial'], cambria: ['Caladea', 'Georgia', 'Times New Roman'],
    'courier new': ['Liberation Mono', 'Cousine', 'Courier'], georgia: ['Gelasio', 'Times New Roman'],
    'segoe ui': ['Selawik', 'Arial'], aptos: ['Segoe UI', 'Calibri', 'Arial'], garamond: ['EB Garamond', 'Times New Roman'],
    'century gothic': ['URW Gothic', 'Avant Garde', 'Arial'], 'book antiqua': ['Palatino Linotype', 'Palatino', 'TeX Gyre Pagella', 'serif'],
    symbol: ['Symbol'], wingdings: ['Wingdings']
  };
  const SERIF = /times|roman|georgia|garamond|cambria|book|palatino|serif|antiqua|baskerville|bodoni|didot|century(?! gothic)/i;
  function fontStack(name) {
    if (!name) return '';
    const n = String(name).replace(/["']/g, '').trim(); if (!n) return '';
    const fb = FALLBACK[n.toLowerCase()] || [];
    return [n, ...fb].map(f => `'${f.replace(/'/g, '')}'`).join(', ') + (SERIF.test(n) ? ', serif' : /mono|courier|consol/i.test(n) ? ', monospace' : ', sans-serif');
  }

  /* ============================================================
     Lecture du HTML de l'éditeur : les morceaux d'un paragraphe (pour l'enregistrement et la détection des
     modifications). Chaque morceau : { t: 'text'|'tab'|'br'|'pbr'|'keep', s, ri, fmt, h }.
     ============================================================ */
  const INLINE_FMT = { B: { b: 1 }, STRONG: { b: 1 }, I: { i: 1 }, EM: { i: 1 }, U: { u: 1 }, S: { s: 1 }, STRIKE: { s: 1 }, DEL: { s: 1 }, SUP: { va: 'superscript' }, SUB: { va: 'subscript' } };
  function segments(p) {
    const out = [];
    const walk = (node, ctx) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { const s = n.nodeValue.replace(/\u200B/g, ''); if (s) out.push({ t: 'text', s, ri: ctx.ri, fmt: ctx.fmt, h: ctx.h }); continue; }
        if (n.nodeType !== 1) continue;
        const cl = n.classList;
        if (cl.contains('wnum') || cl.contains('wdx-ui')) continue;
        if (cl.contains('wtab')) { out.push({ t: 'tab', ri: n.dataset.ri || ctx.ri, fmt: ctx.fmt, h: ctx.h }); continue; }
        if (cl.contains('wpbr')) { out.push({ t: 'pbr', ri: ctx.ri, fmt: ctx.fmt, h: ctx.h }); continue; }
        if (cl.contains('wkeep')) { out.push({ t: 'keep', ri: n.dataset.ri, h: ctx.h }); continue; }
        if (n.tagName === 'BR') { if (n.dataset.ph) continue; out.push({ t: 'br', ri: ctx.ri, fmt: ctx.fmt, h: ctx.h }); continue; }
        if (cl.contains('wr')) { walk(n, { ri: n.dataset.ri !== undefined ? n.dataset.ri : ctx.ri, fmt: Object.assign({}, ctx.fmt, jparse(n.dataset.fmt, {})), h: ctx.h }); continue; }
        if (cl.contains('wh')) { walk(n, Object.assign({}, ctx, { h: n.dataset.h })); continue; }
        if (cl.contains('wp') || n.tagName === 'TABLE' || cl.contains('wtxbx')) continue;   // paragraphes imbriqués : traités à part
        const f = INLINE_FMT[n.tagName];
        walk(n, f ? Object.assign({}, ctx, { fmt: Object.assign({}, ctx.fmt, f) }) : ctx);
      }
    };
    walk(p, { ri: p.dataset.mri, fmt: {}, h: null });
    return out;
  }
  const sigOf = p => JSON.stringify(segments(p)) + '|' + (p.dataset.ppr || '');

  /* ============================================================
     Vue : un document affiché (éditeur ou aperçu)
     ============================================================ */
  function makeView(host, { editable }) {
    host.innerHTML = `<div class="wdx-scroll"><div class="wdx-scaler"><div class="wdx-canvas"><div class="wdx-pages"></div><div class="wdx-flow" spellcheck="true" lang="fr"></div></div></div></div><div class="wdx-measure" aria-hidden="true"></div>`;
    const v = {
      host, editable,
      scroll: host.querySelector('.wdx-scroll'), scaler: host.querySelector('.wdx-scaler'), canvas: host.querySelector('.wdx-canvas'),
      pages: host.querySelector('.wdx-pages'), flow: host.querySelector('.wdx-flow'), measure: host.querySelector('.wdx-measure'),
      zoom: 1, model: null, pageList: [], gap: GAP, hfCache: new Map(), raf: 0, layoutTm: 0
    };
    v.flow.contentEditable = editable ? 'true' : 'false';
    return v;
  }
  function mountModel(v, model) {
    v.model = model;
    v.flow.innerHTML = model.html;
    v.flow.querySelectorAll('.wtxbx-in').forEach(el => { el.contentEditable = v.editable ? 'true' : 'false'; });
    v.orig = new Map();
    v.flow.querySelectorAll('[data-pi]').forEach(p => { if (!v.orig.has(p.dataset.pi)) v.orig.set(p.dataset.pi, sigOf(p)); });
    v.hfCache.clear();
    if (model.fontFaces) { const st = document.createElement('style'); st.className = 'wdx-ff'; st.textContent = model.fontFaces; v.host.appendChild(st); }
  }
  const pageW = v => Math.max(...v.model.sections.map(s => s.w));

  /* ---------------- zoom ---------------- */
  function setZoom(v, z, keepPoint) {
    const sc = v.scroll;
    const old = v.zoom;
    const cx = keepPoint ? keepPoint.x : sc.clientWidth / 2, cy = keepPoint ? keepPoint.y : sc.clientHeight / 2;
    const ax = (sc.scrollLeft + cx) / old, ay = (sc.scrollTop + cy) / old;
    v.zoom = z;
    v.canvas.style.transform = z === 1 ? '' : `scale(${z})`;
    sizeScaler(v);
    sc.scrollLeft = ax * z - cx; sc.scrollTop = ay * z - cy;
  }
  function sizeScaler(v) {
    const w = parseFloat(v.canvas.style.width) || 800, h = parseFloat(v.canvas.style.height) || 1100;
    v.scaler.style.width = (w * v.zoom) + 'px'; v.scaler.style.height = (h * v.zoom) + 'px';
  }
  const fitZoom = v => Math.max(0.25, Math.min(3, (v.scroll.clientWidth - 36) / pageW(v)));

  /* ---------------- en-têtes et pieds de page (mesurés une fois par section et par type) ---------------- */
  function hfFor(v, si, kind) {
    const key = si + ':' + kind;
    if (v.hfCache.has(key)) return v.hfCache.get(key);
    const S = v.model.sections[si];
    const r = v.model.hf ? v.model.hf(si, kind) : { header: '', footer: '' };
    const meas = html => {
      if (!html) return 0;
      v.measure.style.width = (S.w - S.ml - S.mr) + 'px';
      v.measure.innerHTML = html.replace(/<span class="wfld" data-f="[A-Z]+"><\/span>/g, '99');
      const h = v.measure.getBoundingClientRect().height / (v.measure.getBoundingClientRect().width / (S.w - S.ml - S.mr) || 1);
      v.measure.innerHTML = '';
      return h;
    };
    const o = { header: r.header || '', footer: r.footer || '', hh: meas(r.header), fh: meas(r.footer) };
    v.hfCache.set(key, o);
    return o;
  }
  const fillFields = (html, n, total) => html.replace(/<span class="wfld" data-f="PAGE"><\/span>/g, String(n)).replace(/<span class="wfld" data-f="NUMPAGES"><\/span>/g, String(total)).replace(/<span class="wfld" data-f="[A-Z]+"><\/span>/g, '');

  /* ---------------- tabulations ---------------- */
  function layoutTabs(v) {
    const z = v.zoom;
    for (const p of v.flow.querySelectorAll('div.wp')) {
      const tabs = p.querySelectorAll('.wtab'); if (!tabs.length) continue;
      const il = +p.dataset.il || 0;
      const stops = jparse(p.dataset.tabs, []);
      const def = +p.dataset.dt || 48;
      const pr = p.getBoundingClientRect();
      const origin = pr.left - il * z;
      const right = (pr.right - origin) / z;
      tabs.forEach(t => { t.style.width = '0px'; t.classList.remove('lead-dot', 'lead-line', 'lead-dash'); });
      for (const t of tabs) {
        const x = (t.getBoundingClientRect().left - origin) / z;
        let stop = stops.find(s => s[0] > x + 0.5 && s[1] !== 'clear');
        // retrait suspendu : taquet implicite au retrait gauche
        if (+p.dataset.hang && il > x + 0.5 && (!stop || il < stop[0])) stop = [il, 'left', ''];
        let pos, al = 'left', lead = '';
        if (stop) { pos = stop[0]; al = stop[1]; lead = stop[2]; }
        else pos = (Math.floor((x + 0.5) / def) + 1) * def;
        if (pos > right + 1 && !stop) pos = Math.max(x + 2, right);
        let w = pos - x;
        if (al === 'right' || al === 'center' || al === 'decimal') {
          const r = document.createRange(); r.setStartAfter(t);
          let nx = t.nextSibling, endNode = null;
          const all = [...p.querySelectorAll('.wtab')]; const i = all.indexOf(t); if (i >= 0 && all[i + 1]) endNode = all[i + 1];
          if (endNode) r.setEndBefore(endNode); else r.setEnd(p, p.childNodes.length);
          const rr = r.getBoundingClientRect(); const tw = rr.width / z;
          w = al === 'center' ? pos - x - tw / 2 : pos - x - tw;
          nx = null;
        }
        t.style.width = Math.max(1, w) + 'px';
        if (lead === 'dot' || lead === 'middleDot') t.classList.add('lead-dot'); else if (lead === 'underscore' || lead === 'heavy') t.classList.add('lead-line'); else if (lead === 'hyphen') t.classList.add('lead-dash');
      }
    }
  }

  /* ---------------- pages : les blocs sont poussés d'une page à l'autre ---------------- */
  function units(v) {
    const out = [];
    for (const el of v.flow.children) {
      if (el.tagName === 'TABLE') {
        const rows = [...el.rows];
        rows.forEach((tr, i) => out.push({ el: tr, row: true, sec: +(el.dataset.sec || 0), brk: i === 0 && el.dataset.brk === '1', table: el, first: i === 0 }));
      } else if (el.nodeType === 1) out.push({ el, sec: +(el.dataset.sec || 0), brk: el.dataset.brk === '1', sb: +el.dataset.sb || 0 });
    }
    return out;
  }
  function clearPush(u) {
    if (u.row) { for (const td of u.el.cells) { if (td.dataset.pt0 === undefined) td.dataset.pt0 = td.style.paddingTop || ''; td.style.paddingTop = td.dataset.pt0; } }
    else { const base = u.el.dataset.mt; u.el.style.marginTop = base ? base + 'px' : ''; }
  }
  function push(u, extra) {
    if (u.row) { for (const td of u.el.cells) { const base = parseFloat(td.dataset.pt0) || 0; td.style.paddingTop = (base + extra) + 'px'; } }
    else u.el.style.marginTop = ((+u.el.dataset.mt || 0) + extra) + 'px';
  }
  /* un paragraphe se termine-t-il par un saut de page ? (alors le bloc suivant change de page) */
  function endsWithPageBreak(el) {
    if (!el || !el.classList || !el.classList.contains('wp')) return false;
    const pb = el.querySelectorAll('.wpbr'); if (!pb.length) return false;
    const last = pb[pb.length - 1];
    const r = document.createRange(); r.setStartAfter(last); r.setEnd(el, el.childNodes.length);
    return !r.toString().replace(/[\s\u200B]/g, '');
  }
  function startsWithPageBreak(el) {
    if (!el || !el.classList || !el.classList.contains('wp')) return false;
    const pb = el.querySelector('.wpbr'); if (!pb) return false;
    const r = document.createRange(); r.setStart(el, 0); r.setEndBefore(pb);
    return !r.toString().replace(/[\s\u200B]/g, '');
  }

  function layout(v) {
    if (!v.model) return;
    const m = v.model, z = v.zoom;
    if (m.renumber) m.renumber(v.flow);
    const W = pageW(v);
    v.canvas.style.width = W + 'px';
    v.flow.style.width = W + 'px';
    layoutTabs(v);
    const us = units(v);
    us.forEach(clearPush);
    const fr = v.flow.getBoundingClientRect();
    const meas = us.map(u => { const r = u.el.getBoundingClientRect(); return { top: (r.top - fr.top) / z, bottom: (r.bottom - fr.top) / z }; });
    // notes de bas de page : de quoi réserver la place, page par page (deux passes)
    const fnRefs = [...v.flow.querySelectorAll('[data-fn]')].map(el => ({ el, id: el.dataset.fn, y: (el.getBoundingClientRect().top - fr.top) / z }));
    let reserve = new Map();
    let pages = [];
    for (let pass = 0; pass < (fnRefs.length ? 3 : 1); pass++) {
      pages = paginate(v, us, meas, reserve);
      if (!fnRefs.length) break;
      // page de chaque renvoi (en coordonnées finales : on rejoue les décalages)
      const next = new Map();
      for (const f of fnRefs) {
        const ui = us.findIndex((u, i) => meas[i].top <= f.y + 0.5 && f.y < meas[i].bottom + 0.5 && (u.el.contains(f.el)));
        const pg = ui >= 0 ? us[ui].page : 0;
        const list = next.get(pg) || []; list.push(f.id); next.set(pg, list);
      }
      const sizes = new Map();
      for (const [pg, ids] of next) sizes.set(pg, footnoteHeight(v, pages[pg], ids));
      const same = [...sizes].every(([k, h]) => Math.abs((reserve.get(k) || 0) - h) < 1) && sizes.size === reserve.size;
      reserve = sizes; pages.fn = next;
      if (same) break;
    }
    if (!pages.fn && fnRefs.length) pages.fn = new Map();
    v.pageList = pages;
    // pages dessinées
    const total = pages.length;
    v.pages.innerHTML = pages.map((P, k) => {
      const S = m.sections[P.sec];
      const hf = hfFor(v, P.sec, P.kind);
      const fnIds = pages.fn && pages.fn.get(k);
      const fnHtml = fnIds && fnIds.length && m.footnoteHtml ? `<div class="wdx-fns" style="left:${S.ml}px;width:${S.w - S.ml - S.mr}px;bottom:${S.h - P.cb}px"><div class="wdx-fnsep"></div>${fnIds.map(id => m.footnoteHtml(id)).join('')}</div>` : '';
      return `<div class="wdx-page" style="top:${P.top}px;left:${(W - S.w) / 2}px;width:${S.w}px;height:${S.h}px${m.pageBg ? ';background:' + m.pageBg : ''}">${S.border ? `<div class="wdx-pgbdr" style="${S.border}"></div>` : ''}`
        + (hf.header ? `<div class="wdx-hdr" style="top:${S.hd}px;left:${S.ml}px;width:${S.w - S.ml - S.mr}px">${fillFields(hf.header, P.num, total)}</div>` : '')
        + fnHtml
        + (hf.footer ? `<div class="wdx-ftr" style="bottom:${S.fd}px;left:${S.ml}px;width:${S.w - S.ml - S.mr}px">${fillFields(hf.footer, P.num, total)}</div>` : '')
        + `</div>`;
    }).join('');
    // en-têtes et pieds de page : les objets placés sur la page (data-px / data-py, coordonnées de la page)
    v.pages.querySelectorAll('.wdx-page').forEach(pg => {
      const pr = pg.getBoundingClientRect();
      for (const el of pg.querySelectorAll('[data-px], [data-py]')) {
        const r = el.getBoundingClientRect();
        if (el.dataset.px) el.style.left = ((parseFloat(el.style.left) || 0) + (+el.dataset.px - (r.left - pr.left) / z)) + 'px';
        if (el.dataset.py) el.style.top = ((parseFloat(el.style.top) || 0) + (+el.dataset.py - (r.top - pr.top) / z)) + 'px';
      }
    });
    const last = pages[pages.length - 1];
    const H = last ? last.top + m.sections[last.sec].h : 1100;
    v.canvas.style.height = H + 'px';
    v.flow.style.minHeight = H + 'px';
    sizeScaler(v);
    // objets placés par rapport à la page (zones de texte, images flottantes)
    for (const el of v.flow.querySelectorAll('[data-vpage]')) {
      const anchor = el.closest('div.wp, table.wt'); if (!anchor) continue;
      const ui = us.findIndex(u => u.el === anchor || u.el.contains(anchor) || (u.table && u.table.contains(anchor)));
      const P = ui >= 0 ? pages[us[ui].page] : pages[0]; if (!P) continue;
      const ar = anchor.getBoundingClientRect(), f2 = v.flow.getBoundingClientRect();
      const pTop = (ar.top - f2.top) / z;
      el.style.top = (P.top + (+el.dataset.vpage) - pTop) + 'px';
    }
    if (v.onLayout) v.onLayout();
  }
  function footnoteHeight(v, P, ids) {
    if (!P || !v.model.footnoteHtml) return 0;
    const S = v.model.sections[P.sec];
    v.measure.style.width = (S.w - S.ml - S.mr) + 'px';
    v.measure.innerHTML = '<div class="wdx-fnsep"></div>' + ids.map(id => v.model.footnoteHtml(id)).join('');
    const h = v.measure.getBoundingClientRect().height / (v.zoom || 1);
    v.measure.innerHTML = '';
    return h + 6;
  }
  function paginate(v, us, meas, reserve) {
    const m = v.model;
    const pages = [];
    let num = 0;
    const newPage = (sec, startOfSection) => {
      const S = m.sections[sec];
      const prev = pages[pages.length - 1];
      const top = prev ? prev.top + m.sections[prev.sec].h + v.gap : 0;
      const firstOfSec = startOfSection || !prev || prev.sec !== sec;
      num = S.pgStart && firstOfSec && startOfSection ? S.pgStart : num + 1;
      const kind = (S.titlePg && firstOfSec) ? 'first' : (m.evenOdd && num % 2 === 0) ? 'even' : 'default';
      const hf = hfFor(v, sec, kind);
      const k = pages.length;
      const ct = top + Math.max(S.mt, S.hd + hf.hh);
      const cb = top + S.h - Math.max(S.mb, S.fd + hf.fh) - (reserve.get(k) || 0);
      pages.push({ top, sec, ct, cb, kind, num });
    };
    let shift = 0, lastSec = -1;
    // saut de page : ce qui le suit change de page (un paragraphe qui commence par un saut passe lui-même à la page suivante)
    const forcedAt = us.map((u, i) => i > 0 && (u.brk || (!u.row && startsWithPageBreak(u.el)) || (!u.row && !us[i - 1].row && endsWithPageBreak(us[i - 1].el) && !startsWithPageBreak(us[i - 1].el))));
    const blank = el => !el.textContent.replace(/[\s\u200B]/g, '') && !el.querySelector('.wkeep:not(.wfc), img, table');
    us.forEach((u, i) => {
      const y = meas[i].top + shift, b = meas[i].bottom + shift;
      const newSec = u.sec !== lastSec;
      if (!pages.length) newPage(u.sec, true);
      let P = pages[pages.length - 1];
      const forced = forcedAt[i];
      let moved = false, natural = false;
      if (forced) { newPage(u.sec, newSec); moved = true; }
      // un paragraphe vide juste avant un saut (souvent celui qui porte le saut de section) reste en bas de page
      else if (i > 0 && b > P.cb + 0.5 && !u.row && blank(u.el) && forcedAt[i + 1]) { /* il déborde sans créer de page */ }
      else if (i > 0 && b > P.cb + 0.5 && y > P.ct + 1 && (b - y) <= (P.cb - P.ct)) {
        // les lignes d'en-tête d'un tableau ne restent pas seules en bas de page : elles suivent la première ligne
        newPage(u.sec, false); moved = true; natural = true;
      }
      if (newSec) lastSec = u.sec;
      P = pages[pages.length - 1];
      if (i === 0 || moved) {
        // en haut d'une page (sauf la première du document), l'espace avant du paragraphe est supprimé
        const target = P.ct - (moved && !u.row ? (u.sb || 0) : 0);
        const extra = target - y;
        if (extra > 0.01 || (i === 0 && Math.abs(extra) > 0.01)) { push(u, extra); shift += extra; }
      }
      u.page = pages.length - 1;
    });
    if (!pages.length) newPage(0, true);
    // dernier bloc plus long que sa page : pages supplémentaires
    if (us.length) {
      let lastB = meas[us.length - 1].bottom + shift;
      while (lastB > pages[pages.length - 1].cb + 1 && pages.length < 2000) { const L = pages[pages.length - 1]; newPage(L.sec, false); if (lastB < pages[pages.length - 1].ct) break; }
    }
    return pages;
  }
  function scheduleLayout(v, ms = 120) {
    clearTimeout(v.layoutTm);
    v.layoutTm = setTimeout(() => { try { layout(v); } catch (e) { console.error('Mise en page :', e); } }, ms);
  }

  /* ============================================================
     Éditeur plein écran
     ============================================================ */
  let ed = null;   // { v, name, ext, fileId, folderId, path, dirty, saving, history… }
  const I = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
    center: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>',
    justify: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5Z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></svg>',
    print: '<svg viewBox="0 0 24 24"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7Z"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M6 6 18 18M13 5h6M5 19h8M15 5 9.5 19"/></svg>',
    pbr: '<svg viewBox="0 0 24 24"><path d="M5 3v6h14V3M5 21v-6h14v6"/><path d="M3 12h3M9 12h2M14 12h2M19 12h2"/></svg>',
    fit: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'
  };
  const HL = [['', 'Aucun'], ['#ffff00', 'Jaune'], ['#00ff00', 'Vert vif'], ['#00ffff', 'Turquoise'], ['#ff00ff', 'Rose'], ['#0000ff', 'Bleu'], ['#ff0000', 'Rouge'], ['#c0c0c0', 'Gris clair'], ['#808080', 'Gris']];
  const COLORS = ['#000000', '#7f7f7f', '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0', '#1f3864', '#c55a11', '#538135', '#ffffff'];

  function barHTML(m) {
    const styles = (m.styles || []).map(s => `<option value="${escH(s.id)}">${escH(s.name)}</option>`).join('');
    const fonts = [...new Set([...(m.fonts || []), ...COMMON_FONTS])].map(f => `<option value="${escH(f)}">${escH(f)}</option>`).join('');
    return `<div class="wdx-grp">
        <button type="button" data-wd="undo" title="Annuler (Ctrl+Z)">${I.undo}</button>
        <button type="button" data-wd="redo" title="Rétablir (Ctrl+Y)">${I.redo}</button>
      </div><span class="wdx-sep"></span>
      <div class="wdx-grp">
        <select data-wd="style" class="wdx-style" title="Style de paragraphe">${styles}</select>
        <select data-wd="font" class="wdx-font" title="Police">${fonts}</select>
        <select data-wd="size" class="wdx-size" title="Taille de police">${SIZES.map(s => `<option value="${s}">${String(s).replace('.', ',')}</option>`).join('')}</select>
      </div><span class="wdx-sep"></span>
      <div class="wdx-grp">
        <button type="button" data-wd="b" title="Gras (Ctrl+B)"><b>G</b></button>
        <button type="button" data-wd="i" title="Italique (Ctrl+I)"><i>I</i></button>
        <button type="button" data-wd="u" title="Souligné (Ctrl+U)"><u>S</u></button>
        <button type="button" data-wd="s" title="Barré"><s>abc</s></button>
        <button type="button" data-wd="sup" title="Exposant (Ctrl+Maj+=)">x<sup>2</sup></button>
        <button type="button" data-wd="sub" title="Indice (Ctrl+=)">x<sub>2</sub></button>
        <button type="button" data-wd="color" class="wdx-colbtn" title="Couleur de police"><span class="wdx-a">A</span><span class="wdx-bar-c" style="background:#c00000"></span></button>
        <button type="button" data-wd="hl" class="wdx-colbtn" title="Couleur de surbrillance du texte"><span class="wdx-a wdx-hla">ab</span><span class="wdx-bar-c" style="background:#ffff00"></span></button>
        <button type="button" data-wd="clear" title="Effacer la mise en forme des caractères">${I.clear}</button>
      </div><span class="wdx-sep"></span>
      <div class="wdx-grp">
        <button type="button" data-wd="al" data-al="left" title="Aligner à gauche (Ctrl+L)">${I.left}</button>
        <button type="button" data-wd="al" data-al="center" title="Centrer (Ctrl+E)">${I.center}</button>
        <button type="button" data-wd="al" data-al="right" title="Aligner à droite (Ctrl+R)">${I.right}</button>
        <button type="button" data-wd="al" data-al="both" title="Justifier (Ctrl+J)">${I.justify}</button>
      </div><span class="wdx-sep"></span>
      <div class="wdx-grp">
        <button type="button" data-wd="pbr" title="Saut de page (Ctrl+Entrée)">${I.pbr}</button>
      </div>`;
  }

  async function open({ name, buf, fileId = null, folderId = null, path = '', shared = false } = {}) {
    const ad = adapterFor(name);
    if (!ad) { toast('Seuls les documents Word (.docx) et OpenDocument (.odt) se modifient dans Alixo'); return false; }
    const ab = buf instanceof ArrayBuffer ? buf : (buf && buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : null);
    if (!ab) { toast('Fichier illisible'); return false; }
    if (ed) await close();
    const ov = document.createElement('div');
    ov.id = 'wdov'; ov.className = 'wdx-ov';
    ov.innerHTML = `<header class="wdx-top">
        <button type="button" class="wdx-back" data-wd="close" title="Fermer et revenir à Alixo">${I.back}</button>
        <span class="wdx-fico ${extOf(name)}">${extOf(name) === 'odt' ? 'ODT' : 'W'}</span>
        <div class="wdx-title"><div class="wdx-name">${escH(name)}</div><div class="wdx-state">Ouverture…</div></div>
        <div class="wdx-acts">
          <button type="button" class="cta small" data-wd="save" title="Enregistrer dans la bibliothèque (Ctrl+S)">${I.save}<span>Enregistrer</span></button>
          <button type="button" class="cta ghost small" data-wd="download" title="Télécharger le fichier ${extOf(name) === 'odt' ? 'OpenDocument (.odt)' : 'Word (.docx)'}">${I.down}<span>Télécharger</span></button>
          <button type="button" class="cta ghost small" data-wd="print" title="Imprimer ou enregistrer en PDF (Ctrl+P)">${I.print}<span>Imprimer / PDF</span></button>
        </div>
      </header>
      <div class="wdx-bar"></div>
      <div class="wdx-body"></div>
      <footer class="wdx-status"><span class="wdx-pg">Page 1 sur 1</span><span class="wdx-words"></span><span class="wdx-note"></span>
        <span class="wdx-zoom"><button type="button" data-wd="fit" title="Largeur de page">${I.fit}</button><button type="button" data-wd="z-" title="Zoom arrière (Ctrl −)">−</button><input type="range" class="wdx-zr" min="25" max="300" step="5" value="100" aria-label="Zoom"><button type="button" data-wd="z+" title="Zoom avant (Ctrl +)">+</button><button type="button" class="wdx-zp" data-wd="z0" title="Zoom à 100 % (Ctrl 0)">100 %</button></span>
      </footer>`;
    document.body.appendChild(ov);
    document.body.classList.add('wdx-open');
    const v = makeView(ov.querySelector('.wdx-body'), { editable: true });
    ed = { ov, v, name, ext: extOf(name), fileId: shared ? null : fileId, folderId, path, shared, dirty: false, saving: null, hist: [], redo: [], lastSnap: 0, lastType: '', saveTm: 0 };
    let model;
    try { model = await ad.load(ab); }
    catch (err) {
      console.error(err);
      ov.querySelector('.wdx-state').textContent = 'Lecture impossible';
      ov.querySelector('.wdx-body').innerHTML = `<div class="wdx-err">Ce document n’a pas pu être lu${err && err.message ? ' : ' + escH(err.message) : ''}.</div>`;
      return false;
    }
    ed.model = model;
    ov.querySelector('.wdx-bar').innerHTML = barHTML(model);
    mountModel(v, model);
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch { /* */ }
    const z0 = window.AlixoZoom ? AlixoZoom.get(ZK) : 1;
    v.zoom = z0;
    layout(v);
    setZoom(v, z0);
    paintZoom();
    bindEditor();
    setState(shared ? 'Fichier partagé : la première modification enregistre une copie dans Mes cours' : (fileId ? 'Enregistré' : 'Pas encore dans la bibliothèque — Enregistrer pour l’y ajouter'));
    ov.querySelector('.wdx-note').textContent = model.note || '';
    v.onLayout = () => { updateStatus(); };
    updateStatus(); updateToolbar();
    // les polices du document arrivent parfois après le premier rendu : on recalcule
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (ed && ed.v === v) layout(v); });
    const first = v.flow.querySelector('div.wp');
    if (first) { const r = document.createRange(); r.setStart(first, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); v.flow.focus({ preventScroll: true }); }
    v.scroll.scrollTop = 0;
    return true;
  }
  function setState(t) { if (ed) ed.ov.querySelector('.wdx-state').textContent = t; }
  function updateStatus() {
    if (!ed) return;
    const v = ed.v; const n = v.pageList.length || 1;
    const midY = (v.scroll.scrollTop + v.scroll.clientHeight / 3) / v.zoom;
    let k = 0; v.pageList.forEach((P, i) => { if (P.top <= midY) k = i; });
    ed.ov.querySelector('.wdx-pg').textContent = `Page ${k + 1} sur ${n}`;
    const words = (v.flow.innerText.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
    ed.ov.querySelector('.wdx-words').textContent = `${words.toLocaleString('fr-FR')} mot${words > 1 ? 's' : ''}`;
  }
  function paintZoom() {
    if (!ed) return;
    const p = Math.round(ed.v.zoom * 100);
    ed.ov.querySelector('.wdx-zp').textContent = p + ' %';
    ed.ov.querySelector('.wdx-zr').value = String(p);
  }
  function zoomTo(z, pt) {
    if (!ed) return;
    z = Math.max(0.25, Math.min(3, Math.round(z * 100) / 100));
    setZoom(ed.v, z, pt);
    if (window.AlixoZoom) AlixoZoom.set(ZK, z, { silent: true });
    paintZoom();
  }
  const ZSTEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const zoomStep = dir => { const z = ed.v.zoom; if (dir > 0) zoomTo(ZSTEPS.find(s => s > z + 0.001) || 3); else { const l = ZSTEPS.filter(s => s < z - 0.001); zoomTo(l.length ? l[l.length - 1] : 0.25); } };

  /* ---------------- historique (annuler / rétablir) ---------------- */
  function selPath() {
    const s = getSelection(); if (!s.rangeCount || !ed) return null;
    const r = s.getRangeAt(0); const root = ed.v.flow;
    if (!root.contains(r.startContainer)) return null;
    const path = n => { const p = []; while (n && n !== root) { p.unshift([...n.parentNode.childNodes].indexOf(n)); n = n.parentNode; } return p; };
    return { s: path(r.startContainer), so: r.startOffset, e: path(r.endContainer), eo: r.endOffset };
  }
  function restoreSel(sp) {
    if (!sp || !ed) return;
    const root = ed.v.flow;
    const node = p => { let n = root; for (const i of p) { if (!n || !n.childNodes[i]) return null; n = n.childNodes[i]; } return n; };
    const a = node(sp.s), b = node(sp.e); if (!a || !b) return;
    try { const r = document.createRange(); r.setStart(a, Math.min(sp.so, a.nodeType === 3 ? a.length : a.childNodes.length)); r.setEnd(b, Math.min(sp.eo, b.nodeType === 3 ? b.length : b.childNodes.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch { /* */ }
  }
  function snapshot(kind) {
    if (!ed) return;
    const now = Date.now();
    if (kind && kind === ed.lastType && now - ed.lastSnap < 900) { ed.lastSnap = now; return; }   // frappe continue : un seul pas
    ed.hist.push({ html: ed.v.flow.innerHTML, sel: selPath() });
    if (ed.hist.length > 200) ed.hist.shift();
    ed.redo = [];
    ed.lastSnap = now; ed.lastType = kind || '';
  }
  function undo(dir) {
    if (!ed) return;
    const from = dir > 0 ? ed.redo : ed.hist, to = dir > 0 ? ed.hist : ed.redo;
    const st = from.pop(); if (!st) return;
    to.push({ html: ed.v.flow.innerHTML, sel: selPath() });
    ed.v.flow.innerHTML = st.html;
    restoreSel(st.sel);
    ed.lastType = '';
    changed();
    layout(ed.v);
  }

  /* ---------------- modifications ---------------- */
  function changed() {
    if (!ed) return;
    ed.dirty = true;
    setState('Modifications non enregistrées…');
    clearTimeout(ed.saveTm);
    ed.saveTm = setTimeout(() => { if (ed && ed.dirty && (ed.fileId || ed.autoImport)) saveNow(true); }, 2500);
  }
  /* le contenu reste fait de paragraphes : du texte tapé hors paragraphe y est replacé */
  function normalize() {
    const flow = ed.v.flow;
    const fix = container => {
      let prevP = null;
      for (const n of [...container.childNodes]) {
        if (n.nodeType === 1 && (n.classList.contains('wp') || n.tagName === 'TABLE')) { prevP = n.classList.contains('wp') ? n : prevP; continue; }
        if (n.nodeType === 3 && !n.nodeValue.trim()) { if (container === flow) n.remove(); continue; }
        if (n.nodeType === 8) { n.remove(); continue; }
        if (n.nodeType === 1 && n.classList.contains('wfixed')) continue;
        if (n.nodeType === 1 && (n.tagName === 'DIV' || n.tagName === 'P') && !n.classList.contains('wtxbx')) {
          // bloc créé par le navigateur : devient un paragraphe (copie des attributs du paragraphe voisin)
          const ref = prevP || container.querySelector('.wp');
          const p = ref ? ref.cloneNode(false) : document.createElement('div'); if (!ref) p.className = 'wp';
          p.style.marginTop = '';
          while (n.firstChild) p.appendChild(n.firstChild);
          if (!p.childNodes.length) p.appendChild(document.createElement('br'));
          n.replaceWith(p); prevP = p; continue;
        }
        const ref = prevP || container.querySelector('.wp');
        if (ref && n.nodeType === 1) { ref.appendChild(n); continue; }
        if (ref && n.nodeType === 3) { ref.appendChild(n); continue; }
      }
    };
    fix(flow);
    flow.querySelectorAll('td, th, .wtxbx-in').forEach(c => { if (!c.querySelector('.wp')) { const p = document.createElement('div'); p.className = 'wp'; p.appendChild(document.createElement('br')); c.appendChild(p); } });
    // paragraphe vidé par le navigateur sans <br> : la ligne garde sa hauteur
    flow.querySelectorAll('div.wp').forEach(p => { if (!p.childNodes.length) p.appendChild(document.createElement('br')); });
  }

  /* ---------------- sélection et mise en forme des caractères ---------------- */
  const inFlow = n => !!(ed && n && ed.v.flow.contains(n));
  function curRange() { const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0); return inFlow(r.commonAncestorContainer) ? r : null; }
  const editableText = t => { const el = t.parentElement; return el && !el.closest('.wnum, .wtab, .wdx-ui') && (!el.closest('[contenteditable="false"]') || !!el.closest('.wtxbx-in')) && el.closest('[contenteditable="true"]'); };
  function textNodesIn(r) {
    const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    const out = []; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) if (r.intersectsNode(n) && n.nodeValue.length && editableText(n)) out.push(n);
    return out;
  }
  function splitRange(r) {
    let sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
    if (ec.nodeType === 3 && eo < ec.length && eo > 0) ec.splitText(eo);
    if (sc.nodeType === 3 && so > 0 && so < sc.length) { const nn = sc.splitText(so); if (ec === sc) { ec = nn; eo = nn.length; } sc = nn; so = 0; }
    const r2 = document.createRange();
    try { r2.setStart(sc, sc.nodeType === 3 && so >= sc.length ? sc.length : so); r2.setEnd(ec, ec.nodeType === 3 ? Math.min(eo, ec.length) : eo); } catch { return { range: r, nodes: [] }; }
    const nodes = textNodesIn(r2).filter(t => {
      if (t === sc && sc.nodeType === 3 && so >= t.length) return false;
      if (t === ec && ec.nodeType === 3 && eo === 0) return false;
      return true;
    });
    return { range: r2, nodes };
  }
  /* donne au nœud texte son propre morceau (span.wr) */
  function ownSpan(t) {
    let sp = t.parentElement;
    if (!sp.classList.contains('wr')) {
      const ref = t.parentElement.closest('.wr') || (t.parentElement.closest('div.wp') || {}).querySelector && t.parentElement.closest('div.wp').querySelector('.wr');
      const ns = document.createElement('span'); ns.className = 'wr';
      if (ref) { if (ref.dataset.ri !== undefined) ns.dataset.ri = ref.dataset.ri; ns.style.cssText = ref.style.cssText; if (ref.dataset.fmt) ns.dataset.fmt = ref.dataset.fmt; }
      t.replaceWith(ns); ns.appendChild(t); return ns;
    }
    if (sp.childNodes.length === 1) return sp;
    const before = [], after = []; let seen = false;
    for (const c of sp.childNodes) { if (c === t) { seen = true; continue; } (seen ? after : before).push(c); }
    if (before.length) { const b = sp.cloneNode(false); before.forEach(c => b.appendChild(c)); sp.parentNode.insertBefore(b, sp); }
    if (after.length) { const a = sp.cloneNode(false); after.forEach(c => a.appendChild(c)); sp.parentNode.insertBefore(a, sp.nextSibling); }
    return sp;
  }
  const ptOf = el => Math.round(parseFloat(getComputedStyle(el).fontSize) * 0.75 * 2) / 2;
  function applyFmtCss(sp, fmt) {
    const st = sp.style;
    if ('b' in fmt) st.fontWeight = fmt.b ? '700' : '400';
    if ('i' in fmt) st.fontStyle = fmt.i ? 'italic' : 'normal';
    if ('u' in fmt || 's' in fmt) st.textDecorationLine = [fmt.u ? 'underline' : '', fmt.s ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
    if (fmt.font) st.fontFamily = fontStack(fmt.font);
    if (fmt.color) st.color = fmt.color;
    if ('hl' in fmt) st.backgroundColor = fmt.hl || 'transparent';
    if (fmt.va === 'superscript' || fmt.va === 'subscript') {
      const base = fmt.vbase || fmt.sz || 11;
      st.fontSize = (base * 0.65) + 'pt'; st.position = 'relative'; st.top = fmt.va === 'superscript' ? '-0.55em' : '0.25em'; st.verticalAlign = 'baseline';
    } else {
      if (fmt.sz) st.fontSize = fmt.sz + 'pt';
      if (fmt.va === 'baseline') { st.position = ''; st.top = ''; if (fmt.vbase && !fmt.sz) st.fontSize = fmt.vbase + 'pt'; }
    }
  }
  const isBold = el => (+getComputedStyle(el).fontWeight || 400) >= 600;
  const isItal = el => getComputedStyle(el).fontStyle === 'italic';
  const hasDeco = (el, k) => { for (let n = el; n && !n.classList.contains('wdx-flow'); n = n.parentElement) { if ((getComputedStyle(n).textDecorationLine || '').includes(k)) return true; if (n.classList.contains('wp')) break; } return false; };
  /* exposant / indice : la retouche, sinon la portion d'origine (data-va posé par l'adaptateur) */
  const vaOf = el => { for (let n = el && el.closest && el.closest('.wr'); n; n = n.parentElement && n.parentElement.closest('.wr')) { const f = jparse(n.dataset.fmt, {}); if (f.va) return f.va; if (n.dataset.va) return n.dataset.va; } return 'baseline'; };
  const baseSize = sp => { const f = jparse(sp.dataset.fmt, {}); return f.vbase || f.sz || +sp.dataset.sz || ptOf(sp); };

  function formatChars(key, value) {
    const r = curRange(); if (!r || !ed.v.editable) return;
    snapshot('fmt-' + key + Date.now());
    if (r.collapsed) {
      // aucune sélection : la mise en forme vaut pour le texte qui va être tapé
      let t = r.startContainer, off = r.startOffset;
      let host;
      if (t.nodeType === 3 && t.parentElement.closest('.wr')) host = t.parentElement.closest('.wr');
      else { const p = (t.nodeType === 1 ? t : t.parentElement).closest('div.wp'); host = p && p.querySelector('.wr'); }
      const ns = document.createElement('span'); ns.className = 'wr';
      if (host) { if (host.dataset.ri !== undefined) ns.dataset.ri = host.dataset.ri; ns.style.cssText = host.style.cssText; if (host.dataset.fmt) ns.dataset.fmt = host.dataset.fmt; }
      ns.textContent = ZWSP;
      if (t.nodeType === 3) { const after = t.splitText(off); t.parentNode.insertBefore(ns, after); }
      else { const ref = t.childNodes[off] || null; if (ref && ref.tagName === 'BR') ref.parentNode.insertBefore(ns, ref); else t.insertBefore(ns, ref); }
      const fmt = Object.assign(jparse(ns.dataset.fmt, {}), fmtValue(key, value, [ns]));
      ns.dataset.fmt = JSON.stringify(fmt); applyFmtCss(ns, fmt);
      const rr = document.createRange(); rr.setStart(ns.firstChild, 1); rr.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(rr);
      changed(); updateToolbar();
      return;
    }
    const { nodes } = splitRange(r);
    if (!nodes.length) return;
    const spans = nodes.map(ownSpan);
    const patch = fmtValue(key, value, spans);
    for (const sp of spans) {
      const fmt = Object.assign(jparse(sp.dataset.fmt, {}), typeof patch === 'function' ? patch(sp) : patch);
      if (key === 'clear') { ['b', 'i', 'u', 's', 'font', 'sz', 'color', 'hl', 'va'].forEach(k => delete fmt[k]); }
      sp.dataset.fmt = JSON.stringify(fmt);
      if (key === 'clear') { const base = ed.model.baseCss ? ed.model.baseCss(sp.dataset.ri, sp) : null; if (base !== null && base !== undefined) sp.style.cssText = base; applyFmtCss(sp, fmt); } else applyFmtCss(sp, fmt);
    }
    const rr = document.createRange(); rr.setStart(nodes[0], 0); rr.setEnd(nodes[nodes.length - 1], nodes[nodes.length - 1].length);
    const s = getSelection(); s.removeAllRanges(); s.addRange(rr);
    changed(); scheduleLayout(ed.v, 30); updateToolbar();
  }
  /* valeur à appliquer (bascule pour gras / italique… : tout gras → plus gras, sinon gras) */
  function fmtValue(key, value, spans) {
    if (key === 'b') { const on = !spans.every(isBold); return { b: on ? 1 : 0 }; }
    if (key === 'i') { const on = !spans.every(isItal); return { i: on ? 1 : 0 }; }
    if (key === 'u') { const on = !spans.every(sp => hasDeco(sp, 'underline')); return sp => ({ u: on ? 1 : 0, s: hasDeco(sp, 'line-through') ? 1 : 0 }); }
    if (key === 's') { const on = !spans.every(sp => hasDeco(sp, 'line-through')); return sp => ({ s: on ? 1 : 0, u: hasDeco(sp, 'underline') ? 1 : 0 }); }
    if (key === 'sup' || key === 'sub') {
      const want = key === 'sup' ? 'superscript' : 'subscript';
      const on = !spans.every(sp => vaOf(sp) === want);
      return sp => { const base = baseSize(sp); return on ? { va: want, vbase: base } : { va: 'baseline', vbase: base }; };
    }
    if (key === 'font') return { font: value };
    if (key === 'size') return sp => { const f = jparse(sp.dataset.fmt, {}); return f.va === 'superscript' || f.va === 'subscript' ? { vbase: +value } : { sz: +value }; };
    if (key === 'color') return { color: value };
    if (key === 'hl') return { hl: value || '' };
    return {};
  }
  /* paragraphes touchés par la sélection */
  function selParas() {
    const r = curRange(); if (!r) return [];
    const startP = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest('div.wp');
    if (r.collapsed) return startP ? [startP] : [];
    const all = [...ed.v.flow.querySelectorAll('div.wp')].filter(p => r.intersectsNode(p) && p.closest('[contenteditable="true"]'));
    return all.length ? all : (startP ? [startP] : []);
  }
  function formatParas(key, value) {
    const ps = selParas(); if (!ps.length || !ed.v.editable) return;
    snapshot('para-' + Date.now());
    for (const p of ps) {
      const o = jparse(p.dataset.ppr, {});
      if (key === 'al') { o.jc = value; p.style.textAlign = value === 'both' ? 'justify' : value; }
      if (key === 'style' && ed.model.applyStyle) { o.style = value; ed.model.applyStyle(p, value); }
      p.dataset.ppr = JSON.stringify(o);
    }
    changed(); scheduleLayout(ed.v, 30); updateToolbar();
  }
  function insertPageBreak() {
    const r = curRange(); if (!r) return;
    snapshot('pbr' + Date.now());
    r.deleteContents();
    const pb = document.createElement('span'); pb.className = 'wpbr'; pb.contentEditable = 'false'; pb.title = 'Saut de page';
    r.insertNode(pb);
    // le texte qui suit passe dans un nouveau paragraphe (comme Word) : on scinde
    const p = pb.closest('div.wp');
    if (p) {
      const tail = document.createRange(); tail.setStartAfter(pb); tail.setEnd(p, p.childNodes.length);
      const frag = tail.extractContents();
      const np = p.cloneNode(false); np.style.marginTop = ''; np.removeAttribute('data-brk');
      np.appendChild(frag.childNodes.length && frag.textContent.replace(/\u200B/g, '') ? frag : document.createElement('br'));
      p.parentNode.insertBefore(np, p.nextSibling);
      const rr = document.createRange(); rr.setStart(np, 0); rr.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(rr);
    }
    changed(); layout(ed.v);
  }
  function insertTab() {
    const r = curRange(); if (!r) return;
    snapshot('tab' + Date.now());
    r.deleteContents();
    const t = document.createElement('span'); t.className = 'wtab'; t.contentEditable = 'false';
    r.insertNode(t);
    const rr = document.createRange(); rr.setStartAfter(t); rr.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(rr);
    changed(); scheduleLayout(ed.v, 20);
  }
  /* collage : texte brut, ligne par ligne (la mise en forme du document est gardée) */
  function pastePlain(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    snapshot('paste' + Date.now());
    lines.forEach((line, i) => {
      if (i) document.execCommand('insertParagraph');
      const parts = line.split('\t');
      parts.forEach((part, k) => { if (k) insertTabRaw(); if (part) document.execCommand('insertText', false, part); });
    });
    normalize(); changed(); scheduleLayout(ed.v, 30);
  }
  function insertTabRaw() { const r = curRange(); if (!r) return; const t = document.createElement('span'); t.className = 'wtab'; t.contentEditable = 'false'; r.insertNode(t); const rr = document.createRange(); rr.setStartAfter(t); rr.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(rr); }

  /* ---------------- barre d'outils : état ---------------- */
  function updateToolbar() {
    if (!ed) return;
    const bar = ed.ov.querySelector('.wdx-bar'); if (!bar) return;
    bar.querySelector('[data-wd="undo"]').disabled = !ed.hist.length;
    bar.querySelector('[data-wd="redo"]').disabled = !ed.redo.length;
    const r = curRange(); if (!r) return;
    let el = r.startContainer.nodeType === 1 ? (r.startContainer.childNodes[r.startOffset] && r.startContainer.childNodes[r.startOffset].nodeType === 1 ? r.startContainer.childNodes[r.startOffset] : r.startContainer) : r.startContainer.parentElement;
    if (!el || !el.closest) return;
    const sp = el.closest('.wr') || el;
    const cs = getComputedStyle(sp);
    const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
    const fs = bar.querySelector('[data-wd="font"]');
    if (fam && ![...fs.options].some(o => o.value === fam)) fs.insertAdjacentHTML('afterbegin', `<option value="${escH(fam)}">${escH(fam)}</option>`);
    if (document.activeElement !== fs) fs.value = fam;
    const pt = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    const ss = bar.querySelector('[data-wd="size"]');
    const ptv = jparse(sp.dataset && sp.dataset.fmt, {}).vbase || pt;
    if (![...ss.options].some(o => +o.value === ptv)) { ss.insertAdjacentHTML('beforeend', `<option value="${ptv}">${String(ptv).replace('.', ',')}</option>`); }
    if (document.activeElement !== ss) ss.value = String(ptv);
    bar.querySelector('[data-wd="b"]').classList.toggle('on', isBold(sp));
    bar.querySelector('[data-wd="i"]').classList.toggle('on', isItal(sp));
    bar.querySelector('[data-wd="u"]').classList.toggle('on', hasDeco(sp, 'underline'));
    bar.querySelector('[data-wd="s"]').classList.toggle('on', hasDeco(sp, 'line-through'));
    const va = sp.closest && sp.closest('.wr') ? vaOf(sp) : 'baseline';
    bar.querySelector('[data-wd="sup"]').classList.toggle('on', va === 'superscript');
    bar.querySelector('[data-wd="sub"]').classList.toggle('on', va === 'subscript');
    const p = el.closest('div.wp');
    if (p) {
      const ta = getComputedStyle(p).textAlign;
      const al = ta === 'justify' ? 'both' : ta === 'center' ? 'center' : (ta === 'right' || ta === 'end') ? 'right' : 'left';
      bar.querySelectorAll('[data-wd="al"]').forEach(b => b.classList.toggle('on', b.dataset.al === al));
      const st = bar.querySelector('[data-wd="style"]');
      const sid = jparse(p.dataset.ppr, {}).style || p.dataset.style || '';
      if (sid && ![...st.options].some(o => o.value === sid)) st.insertAdjacentHTML('beforeend', `<option value="${escH(sid)}">${escH(sid)}</option>`);
      if (document.activeElement !== st) st.value = sid;
    }
  }

  /* ---------------- couleurs (petit menu) ---------------- */
  function colorMenu(btn, kind) {
    closeMenu();
    const m = document.createElement('div'); m.className = 'wdx-menu'; m.id = 'wdx-menu';
    m.innerHTML = kind === 'hl'
      ? `<div class="wdx-mtitle">Surbrillance</div><div class="wdx-swatches">${HL.map(([c, n]) => `<button type="button" data-c="${c}" title="${n}" style="background:${c || 'transparent'}" class="${c ? '' : 'none'}"></button>`).join('')}</div>`
      : `<div class="wdx-mtitle">Couleur de police</div><div class="wdx-swatches">${COLORS.map(c => `<button type="button" data-c="${c}" title="${c}" style="background:${c}"></button>`).join('')}</div><button type="button" class="wdx-mauto" data-c="#000000">Automatique</button>`;
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(); m.style.left = Math.min(innerWidth - 220, r.left) + 'px'; m.style.top = (r.bottom + 4) + 'px';
    m.addEventListener('mousedown', e => e.preventDefault());
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      const c = b.dataset.c;
      btn.querySelector('.wdx-bar-c').style.background = c || 'transparent';
      btn.dataset.last = c;
      formatChars(kind === 'hl' ? 'hl' : 'color', c);
      closeMenu();
    });
    setTimeout(() => document.addEventListener('mousedown', closeMenuOutside, true), 0);
  }
  function closeMenuOutside(e) { if (!e.target.closest('#wdx-menu')) closeMenu(); }
  function closeMenu() { const m = document.getElementById('wdx-menu'); if (m) m.remove(); document.removeEventListener('mousedown', closeMenuOutside, true); }

  /* ---------------- évènements ---------------- */
  function bindEditor() {
    const { ov, v } = ed;
    const flow = v.flow;
    ov.addEventListener('mousedown', e => { if (e.target.closest('.wdx-bar button, .wdx-status button')) e.preventDefault(); });   // le curseur reste dans le texte
    ov.addEventListener('click', e => {
      const b = e.target.closest('[data-wd]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      const k = b.dataset.wd;
      if (k === 'close') { close(); return; }
      if (k === 'save') { saveNow(false); return; }
      if (k === 'download') { download(); return; }
      if (k === 'print') { print(); return; }
      if (k === 'undo') { undo(-1); return; }
      if (k === 'redo') { undo(1); return; }
      if (k === 'fit') { zoomTo(fitZoom(v)); return; }
      if (k === 'z+') { zoomStep(1); return; }
      if (k === 'z-') { zoomStep(-1); return; }
      if (k === 'z0') { zoomTo(1); return; }
      if (k === 'al') { formatParas('al', b.dataset.al); return; }
      if (k === 'pbr') { insertPageBreak(); return; }
      if (k === 'color' || k === 'hl') {
        if (e.offsetY > b.clientHeight - 8 || !b.dataset.last) { colorMenu(b, k); return; }
        formatChars(k, b.dataset.last); return;
      }
      if (['b', 'i', 'u', 's', 'sup', 'sub', 'clear'].includes(k)) { formatChars(k); return; }
    });
    ov.querySelector('.wdx-bar').addEventListener('contextmenu', e => { const b = e.target.closest('[data-wd="color"], [data-wd="hl"]'); if (b) { e.preventDefault(); colorMenu(b, b.dataset.wd); } });
    ov.querySelector('.wdx-bar').addEventListener('change', e => {
      const s = e.target; const k = s.dataset.wd;
      // la sélection du texte est perdue au profit de la liste : on la rétablit
      restoreSel(ed.lastSel);
      if (k === 'font') formatChars('font', s.value);
      if (k === 'size') formatChars('size', +s.value);
      if (k === 'style') formatParas('style', s.value);
      flow.focus({ preventScroll: true }); restoreSel(ed.lastSel);
    });
    ov.querySelector('.wdx-bar').addEventListener('mousedown', e => { if (e.target.closest('select')) ed.lastSel = selPath(); }, true);
    const zr = ov.querySelector('.wdx-zr');
    zr.addEventListener('input', () => zoomTo(+zr.value / 100));
    v.scroll.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = v.scroll.getBoundingClientRect();
      const f = Math.exp(-e.deltaY * 0.0022);
      zoomTo(v.zoom * f, { x: e.clientX - r.left, y: e.clientY - r.top });
    }, { passive: false });
    v.scroll.addEventListener('scroll', () => updateStatus(), { passive: true });
    // zone de texte (dans un objet non modifiable) : le clic y place le curseur
    flow.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const inner = (e.target.closest && e.target.closest('.wtxbx-in')) || document.elementsFromPoint(e.clientX, e.clientY).map(x => x.closest && x.closest('.wtxbx-in')).find(Boolean);
      if (!inner || document.activeElement === inner) return;
      e.preventDefault();
      inner.focus({ preventScroll: true });
      const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      const s = getSelection(); s.removeAllRanges();
      if (r && inner.contains(r.startContainer)) s.addRange(r);
      else { const rr = document.createRange(); rr.selectNodeContents(inner); rr.collapse(false); s.addRange(rr); }
    });
    flow.addEventListener('beforeinput', e => {
      if (e.inputType === 'historyUndo') { e.preventDefault(); undo(-1); return; }
      if (e.inputType === 'historyRedo') { e.preventDefault(); undo(1); return; }
      if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') return;   // traités par paste / drop
      if (e.inputType === 'formatBold' || e.inputType === 'formatItalic' || e.inputType === 'formatUnderline') { e.preventDefault(); formatChars(e.inputType === 'formatBold' ? 'b' : e.inputType === 'formatItalic' ? 'i' : 'u'); return; }
      snapshot(e.inputType.startsWith('insertText') ? 'type' : e.inputType.startsWith('delete') ? 'del' : e.inputType);
    });
    flow.addEventListener('input', () => { normalize(); changed(); scheduleLayout(v, 150); });
    flow.addEventListener('paste', e => { e.preventDefault(); pastePlain(e.clipboardData ? e.clipboardData.getData('text/plain') : ''); });
    flow.addEventListener('drop', e => { e.preventDefault(); });
    flow.addEventListener('dragstart', e => { e.preventDefault(); });
    flow.addEventListener('click', e => {
      const a = e.target.closest('a.wh');
      if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const u = a.getAttribute('href'); if (/^https?:|^mailto:/i.test(u)) { if (window.alixoDesktop && alixoDesktop.openExternal) alixoDesktop.openExternal(u); else window.open(u, '_blank', 'noopener'); } }
      else if (a) e.preventDefault();
    });
    flow.addEventListener('keydown', e => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); insertTab(); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); insertPageBreak(); return; }
      if (!mod || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b' || k === 'g') { e.preventDefault(); formatChars('b'); return; }
      if (k === 'i') { e.preventDefault(); formatChars('i'); return; }
      if (k === 'u') { e.preventDefault(); formatChars('u'); return; }
      if (k === 'e') { e.preventDefault(); formatParas('al', 'center'); return; }
      if (k === 'l') { e.preventDefault(); formatParas('al', 'left'); return; }
      if (k === 'r') { e.preventDefault(); formatParas('al', 'right'); return; }
      if (k === 'j') { e.preventDefault(); formatParas('al', 'both'); return; }
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(-1); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); undo(1); return; }
      if (e.key === '=' && e.shiftKey || e.key === '+' && e.shiftKey) { e.preventDefault(); formatChars('sup'); return; }
      if (e.key === '=' && !e.shiftKey) { e.preventDefault(); formatChars('sub'); return; }
    });
    ed.onKey = e => {
      if (!ed || !document.body.contains(ed.ov)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopImmediatePropagation(); saveNow(false); return; }
      if (mod && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); e.stopImmediatePropagation(); print(); return; }
      if (mod && !e.altKey && !e.shiftKey && (e.key === '+' || (e.key === '=' && !flow.contains(e.target)))) { e.preventDefault(); e.stopImmediatePropagation(); zoomStep(1); return; }
      if (mod && !e.altKey && (e.key === '-' || e.key === '_')) { e.preventDefault(); e.stopImmediatePropagation(); zoomStep(-1); return; }
      if (mod && !e.altKey && (e.key === '0' || e.key === 'à')) { e.preventDefault(); e.stopImmediatePropagation(); zoomTo(1); return; }
    };
    document.addEventListener('keydown', ed.onKey, true);
    ov.addEventListener('keydown', e => e.stopPropagation());   // l'application derrière ne réagit pas (raccourcis des séances)
    ov.addEventListener('keyup', e => e.stopPropagation());
    ed.onSel = () => { if (ed && curRange()) { ed.lastSel = selPath(); updateToolbar(); } };
    document.addEventListener('selectionchange', ed.onSel);
    ed.onResize = () => { if (ed) { sizeScaler(ed.v); } };
    window.addEventListener('resize', ed.onResize);
    ed.onBeforeUnload = e => { if (ed && ed.dirty) { saveNow(true); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', ed.onBeforeUnload);
    if (window.alixoDesktop && alixoDesktop.onZoom) { ed.zoomHook = true; }
  }

  /* ---------------- enregistrement ---------------- */
  /* réécrit le document à partir de l'écran (synchrone), puis l'archive (asynchrone) */
  function patch(markClean) {
    normalize();
    ed.model.patch(ed.v.flow, { sigOf, orig: ed.v.orig, segments });
    if (markClean) {
      ed.dirty = false;
      ed.v.orig = new Map(); ed.v.flow.querySelectorAll('[data-pi]').forEach(p => { if (!ed.v.orig.has(p.dataset.pi)) ed.v.orig.set(p.dataset.pi, sigOf(p)); });
    }
  }
  async function build() { patch(false); return ed.model.pack(); }
  async function saveNow(auto) {
    if (!ed) return;
    if (ed.saving) { ed.again = true; return ed.saving; }
    if (!ed.dirty && ed.fileId && auto) return;
    const my = ed;
    my.saving = (async () => {
      setState('Enregistrement…');
      try {
        patch(true);
        const out = await my.model.pack();
        if (my.fileId && window.AlixoFiles && AlixoFiles.replaceData && AlixoFiles.byId(my.fileId)) {
          await AlixoFiles.replaceData(my.fileId, out);
        } else if (window.AlixoFiles) {
          const blob = new Blob([out], { type: my.model.mime });
          const file = new File([blob], my.name, { type: my.model.mime });
          const added = await AlixoFiles.addFiles([file], my.folderId || null);
          if (added && added[0]) { my.fileId = added[0].id; my.name = added[0].name; my.ov.querySelector('.wdx-name').textContent = my.name; my.autoImport = true; }
          else throw new Error('ajout à la bibliothèque refusé');
        }
        const t = new Date();
        if (!my.dirty) setState(`Enregistré à ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
        if (!auto) toast(my.autoImport && !my.toldImport ? `« ${my.name} » est enregistré dans votre bibliothèque` : 'Document enregistré');
        if (my.autoImport) my.toldImport = true;
      } catch (err) {
        console.error(err);
        my.dirty = true;
        setState('Échec de l’enregistrement');
        toast('Enregistrement impossible' + (err && err.message ? ' : ' + err.message : ''), { duration: 6000 });
      } finally {
        my.saving = null;
        if (my.again) { my.again = false; if (my.dirty) saveNow(true); }
      }
    })();
    return my.saving;
  }
  async function download() {
    if (!ed) return;
    try {
      const out = await build();
      const name = ed.name;
      if (window.alixoDesktop && alixoDesktop.saveFile) {
        const r = await alixoDesktop.saveFile({ name, data: new Uint8Array(out), filters: [{ name: ed.ext === 'odt' ? 'Document OpenDocument' : 'Document Word', extensions: [ed.ext] }] });
        if (r && r.ok) toast('Fichier enregistré sur l’ordinateur'); else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
        return;
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], { type: ed.model.mime })); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) { console.error(err); toast('Téléchargement impossible' + (err && err.message ? ' : ' + err.message : '')); }
  }
  /* impression : les pages à 100 %, sans espace entre elles, une feuille par page */
  /* impression : une feuille par page, découpée exactement sur la page affichée (format de sa section) */
  function print() {
    if (!ed) return;
    const v = ed.v, m = ed.model;
    layout(v);
    const W = pageW(v);
    const box = document.createElement('div'); box.id = 'wdx-print';
    const formats = new Map();
    v.pageList.forEach((P, k) => {
      const S = m.sections[P.sec];
      const key = `wdxp${Math.round(S.w)}x${Math.round(S.h)}`; formats.set(key, S);
      const pg = document.createElement('div'); pg.className = 'wdx-ppage';
      pg.style.cssText = `width:${S.w}px;height:${S.h}px;page:${key}`;
      const bg = v.pages.children[k].cloneNode(true); bg.style.top = '0'; bg.style.left = '0'; pg.appendChild(bg);
      const fl = v.flow.cloneNode(true); fl.removeAttribute('contenteditable'); fl.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
      fl.style.top = (-P.top) + 'px'; fl.style.left = (-(W - S.w) / 2) + 'px';
      pg.appendChild(fl); box.appendChild(pg);
    });
    document.body.appendChild(box);
    const st = document.createElement('style'); st.id = 'wdx-print-page';
    const first = m.sections[(v.pageList[0] || {}).sec || 0];
    st.textContent = `@page { size: ${first.w}px ${first.h}px; margin: 0; }` + [...formats].map(([k, S]) => `@page ${k} { size: ${S.w}px ${S.h}px; margin: 0; }`).join('');
    document.head.appendChild(st);
    document.body.classList.add('wdx-printing');
    const done = () => { window.removeEventListener('afterprint', done); document.body.classList.remove('wdx-printing'); st.remove(); box.remove(); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('wdx-printing')) done(); }, 400); }, 60);
  }
  async function close() {
    if (!ed) return;
    const my = ed;
    if (my.dirty) { await saveNow(true); }
    if (my.saving) await my.saving;
    closeMenu();
    document.removeEventListener('keydown', my.onKey, true);
    document.removeEventListener('selectionchange', my.onSel);
    window.removeEventListener('resize', my.onResize);
    window.removeEventListener('beforeunload', my.onBeforeUnload);
    if (my.model && my.model.dispose) my.model.dispose();
    my.ov.remove();
    document.body.classList.remove('wdx-open');
    if (ed === my) ed = null;
  }

  /* ============================================================
     Aperçu en lecture seule (fenêtre d'un fichier, panneau « à côté du cours »)
     ============================================================ */
  async function preview(container, { name, buf, fit = true }) {
    const ad = adapterFor(name); if (!ad) throw new Error('format non pris en charge');
    const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const model = await ad.load(ab);
    container.innerHTML = '';
    const host = document.createElement('div'); host.className = 'wdx-preview'; container.appendChild(host);
    const v = makeView(host, { editable: false });
    mountModel(v, model);
    v.zoom = 1; layout(v);
    const doFit = () => { if (!host.isConnected) return; const z = fit ? Math.min(1, fitZoom(v)) : 1; setZoom(v, z); };
    doFit();
    v.scroll.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const r = v.scroll.getBoundingClientRect(); setZoom(v, Math.max(0.25, Math.min(3, v.zoom * Math.exp(-e.deltaY * 0.0022))), { x: e.clientX - r.left, y: e.clientY - r.top }); }, { passive: false });
    const ro = new ResizeObserver(() => { if (!host.isConnected) { ro.disconnect(); return; } if (fit) doFit(); });
    ro.observe(host);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (host.isConnected) { layout(v); doFit(); } });
    return () => { ro.disconnect(); if (model.dispose) model.dispose(); };
  }

  /* la version PC : menu Affichage › Zoom → le document ouvert dans l'éditeur */
  function desktopZoom(dir) { if (!ed) return false; if (dir === 0) zoomTo(1); else zoomStep(dir); return true; }

  /* réécrit l'archive : mêmes fichiers, même ordre, sans entrée de dossier ; « mimetype » (OpenDocument) en premier et non compressé */
  async function repack(zip, replace, mime) {
    const out = new JSZip();
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
    names.sort((a, b) => (a === 'mimetype' ? -1 : b === 'mimetype' ? 1 : 0));
    for (const n of names) {
      const data = Object.prototype.hasOwnProperty.call(replace, n) ? replace[n] : await zip.file(n).async('uint8array');
      out.file(n, data, { createFolders: false, compression: n === 'mimetype' ? 'STORE' : 'DEFLATE', date: zip.files[n].date });
    }
    return out.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: mime });
  }

  return { open, close, preview, canOpen, repack, segments, sigOf, fontStack, layout, desktopZoom, get current() { return ed; }, isOpen: () => !!ed };
})();
