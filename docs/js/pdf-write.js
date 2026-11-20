/* ============================================================
   Alixo — 1.56.0 : écriture des PDF modifiés (pdf-lib, aucun DOM)
   build(model, { sources, images, flattenForm, producer }) → Promise<Uint8Array>
     - sources[0] : le PDF d'origine (jamais modifié en place) ; sources[1…] : PDF fusionnés ;
     - model.pages : ordre final des pages { key, src, srcIndex, rotate, blank: {w,h}|null } (suppression = absente,
       duplication = même srcIndex deux fois, page vierge = blank) ;
     - model.annots[pageKey] : annotations en coordonnées PDF (espace utilisateur de la page, origine en bas à gauche,
       page non tournée) — dessinées DANS le contenu de la page (aplaties), sauf les notes (annotations /Text natives) ;
     - model.form : valeurs des champs du formulaire ; model.numbering, model.watermark ;
     - métadonnées : date de modification, producteur ; AUCUNE mention « Fait avec Alixo » dans le document.
   extract(model, pageKeys, opts) → Uint8Array : les pages choisies seulement (après application des modifications).
   sanitize(text) : texte encodable en WinAnsi (polices standard) — œ, €, guillemets gardés, le reste remplacé.
   Testable en Node : module.exports si `module` existe (scripts/v1560-pdfwrite-test.js).
   ============================================================ */
'use strict';

(function (root) {
  const lib = () => (typeof window !== 'undefined' && window.PDFLib) || (typeof require === 'function' ? require('./vendor/pdf-lib.min.js') : null);

  /* ---------------- texte : WinAnsi ---------------- */
  const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const WIN = new Set();
  for (let c = 32; c < 127; c++) WIN.add(String.fromCharCode(c));
  for (let c = 160; c < 256; c++) WIN.add(String.fromCharCode(c));
  for (const ch of WIN_EXTRA) WIN.add(ch);
  const SUBST = { ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '﻿': '', '‐': '-', '‑': '-', '‒': '–', '―': '—', '′': "'", '″': '"', '←': '<-', '→': '->', '↔': '<->', '⇒': '=>', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '−': '-', '•': '•', '●': '•', '✓': 'v', '✔': 'v', '✕': 'x', '✗': 'x', 'œ': 'œ', 'Œ': 'Œ', '…': '…' };
  function sanitize(text) {
    let out = '';
    for (const ch of String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ')) {
      if (ch === '\n' || WIN.has(ch)) { out += ch; continue; }
      if (Object.prototype.hasOwnProperty.call(SUBST, ch)) { out += SUBST[ch]; continue; }
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base && [...base].every(c => WIN.has(c)) ? base : '?';
    }
    return out;
  }

  /* ---------------- couleurs, géométrie ---------------- */
  function color(hex, L) {
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex || '').trim());
    let h = m ? m[1] : '000000'; if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return L.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  const rgbArr = hex => { const L = lib(); const c = color(hex, L); return [c.red, c.green, c.blue]; };
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp01 = v => Math.max(0, Math.min(1, num(v, 1)));
  const norm360 = a => ((Math.round(num(a, 0) / 90) * 90) % 360 + 360) % 360;
  /* point « visuel » (page telle qu'affichée, origine en bas à gauche) → espace utilisateur de la page tournée de `rot` */
  function visualToUser(box, rot, vx, vy) {
    const { x, y, width: w, height: h } = box;
    if (rot === 90) return [x + w - vy, y + vx];
    if (rot === 180) return [x + w - vx, y + h - vy];
    if (rot === 270) return [x + vy, y + h - vx];
    return [x + vx, y + vy];
  }
  const visualSize = (box, rot) => (rot === 90 || rot === 270 ? [box.height, box.width] : [box.width, box.height]);

  /* le contenu existant est encadré par q … Q : une transformation laissée ouverte par le fichier ne déforme pas nos ajouts */
  function isolate(out, page) {
    if (page.__alxIsolated) return;
    const L = lib();
    page.node.normalize();
    const a = out.context.register(out.context.contentStream([L.pushGraphicsState()]));
    const b = out.context.register(out.context.contentStream([L.popGraphicsState()]));
    page.node.wrapContentStreams(a, b);
    page.__alxIsolated = true;
  }
  /* attributs hérités de l'arbre des pages recopiés sur la feuille (avant de réordonner l'arbre) */
  function pinInherited(page) {
    const L = lib();
    for (const k of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
      const n = L.PDFName.of(k);
      if (!page.node.get(n)) { const v = page.node.getInheritableAttribute(n); if (v) page.node.set(n, v); }
    }
  }

  /* ---------------- dessin des annotations ---------------- */
  const FONT_KEYS = { helv: ['Helvetica', 'HelveticaBold'], times: ['TimesRoman', 'TimesRomanBold'], cour: ['Courier', 'CourierBold'] };
  function fontsCache(out) {
    const L = lib(); const cache = {};
    return async (family, bold) => {
      const keys = FONT_KEYS[family] || FONT_KEYS.helv; const k = keys[bold ? 1 : 0];
      if (!cache[k]) cache[k] = await out.embedFont(L.StandardFonts[k]);
      return cache[k];
    };
  }
  const svgPath = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${(+p[0]).toFixed(2)} ${(-p[1]).toFixed(2)}`).join(' ');
  function drawStroke(page, pts, o) {
    const L = lib();
    if (!pts || !pts.length) return;
    const P = pts.length === 1 ? [pts[0], [pts[0][0] + 0.01, pts[0][1]]] : pts;
    page.pushOperators(L.pushGraphicsState(), L.setLineJoin(L.LineJoinStyle.Round));
    page.drawSvgPath(svgPath(P), { x: 0, y: 0, borderColor: o.color, borderWidth: o.width, borderOpacity: o.opacity, borderLineCap: L.LineCapStyle.Round, blendMode: o.blend });
    page.pushOperators(L.popGraphicsState());
  }
  const STAMP_TEXT = { vu: 'VU', arevoir: 'À REVOIR', important: 'IMPORTANT', ok: 'VALIDÉ', date: '' };
  function stampLabel(a) {
    if (a.kind === 'date') return a.text || new Date().toLocaleDateString('fr-FR');
    return String(a.text || STAMP_TEXT[a.kind] || 'VU').toUpperCase();
  }
  function roundRectPath(w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    return `M${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h - r} Q${w} ${h} ${w - r} ${h} H${r} Q0 ${h} 0 ${h - r} V${r} Q0 0 ${r} 0 Z`;
  }
  async function drawAnnot(out, page, a, ctx) {
    const L = lib();
    const c = color(a.c, L);
    switch (a.t) {
      case 'ink':
        drawStroke(page, a.pts, { color: c, width: Math.max(0.3, num(a.w, 2)), opacity: clamp01(num(a.a, 1)) });
        break;
      case 'hl':
        drawStroke(page, a.pts, { color: c, width: Math.max(1, num(a.w, 14)), opacity: clamp01(num(a.a, 0.4)), blend: L.BlendMode.Multiply });
        break;
      case 'rect':
        page.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, borderColor: c, borderWidth: num(a.sw, 2), color: a.fill ? color(a.fill, L) : undefined, opacity: a.fill ? clamp01(num(a.fa, 0.25)) : undefined, borderOpacity: clamp01(num(a.a, 1)) });
        break;
      case 'ellipse':
        page.drawEllipse({ x: a.x + a.w / 2, y: a.y + a.h / 2, xScale: Math.abs(a.w / 2), yScale: Math.abs(a.h / 2), borderColor: c, borderWidth: num(a.sw, 2), color: a.fill ? color(a.fill, L) : undefined, opacity: a.fill ? clamp01(num(a.fa, 0.25)) : undefined, borderOpacity: clamp01(num(a.a, 1)) });
        break;
      case 'line': case 'arrow': {
        const sw = num(a.sw, 2), op = clamp01(num(a.a, 1));
        page.drawLine({ start: { x: a.x1, y: a.y1 }, end: { x: a.x2, y: a.y2 }, thickness: sw, color: c, opacity: op, lineCap: L.LineCapStyle.Round });
        if (a.t === 'arrow') {
          const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), len = Math.max(8, sw * 4);
          for (const s of [-1, 1]) {
            const b = ang + Math.PI + s * 0.45;
            page.drawLine({ start: { x: a.x2, y: a.y2 }, end: { x: a.x2 + len * Math.cos(b), y: a.y2 + len * Math.sin(b) }, thickness: sw, color: c, opacity: op, lineCap: L.LineCapStyle.Round });
          }
        }
        break;
      }
      case 'texthl':
        for (const r of a.rects || []) page.drawRectangle({ x: r[0], y: r[1], width: r[2], height: r[3], color: c, opacity: clamp01(num(a.a, 0.35)), blendMode: L.BlendMode.Multiply });
        break;
      case 'text': {
        const size = Math.max(4, Math.min(200, num(a.size, 14)));
        const font = await ctx.font(a.font, !!a.bold);
        const lines = sanitize(a.text).split('\n');
        lines.forEach((ln, i) => { if (ln) page.drawText(ln, { x: a.x, y: a.y - size * 0.86 - i * size * 1.2, size, font, color: c, opacity: clamp01(num(a.a, 1)) }); });
        break;
      }
      case 'stamp': {
        const font = await ctx.font('helv', true);
        const label = sanitize(stampLabel(a));
        const w = num(a.w, 120), h = num(a.h, 36);
        page.drawSvgPath(roundRectPath(w, h, Math.min(8, h / 4)), { x: a.x, y: a.y + h, borderColor: c, borderWidth: 2.2, color: c, opacity: 0.08, borderOpacity: 0.95 });
        let size = h * 0.46; const tw = () => font.widthOfTextAtSize(label, size);
        while (size > 5 && tw() > w - 12) size -= 0.5;
        page.drawText(label, { x: a.x + (w - tw()) / 2, y: a.y + (h - size * 0.72) / 2, size, font, color: c });
        break;
      }
      case 'image': {
        const im = ctx.images && ctx.images[a.img]; if (!im || !im.bytes) break;
        let emb = ctx.embedded[a.img];
        if (!emb) {
          const bytes = im.bytes instanceof Uint8Array ? im.bytes : new Uint8Array(im.bytes);
          emb = /jpe?g/i.test(im.mime || '') ? await out.embedJpg(bytes) : await out.embedPng(bytes);
          ctx.embedded[a.img] = emb;
        }
        page.drawImage(emb, { x: a.x, y: a.y, width: a.w, height: a.h, opacity: clamp01(num(a.a, 1)) });
        break;
      }
      case 'note': {
        const ref = out.context.register(out.context.obj({
          Type: 'Annot', Subtype: 'Text', Rect: [a.x, a.y, a.x + 20, a.y + 20],
          Contents: L.PDFHexString.fromText(String(a.text || '')), Name: 'Comment', C: rgbArr(a.c || '#f2c94c'),
          T: L.PDFHexString.fromText('Alixo'), M: L.PDFString.fromDate(new Date()), Open: !!a.open, F: 4
        }));
        out.context.lookup(ref).set(L.PDFName.of('P'), page.ref);
        page.node.addAnnot(ref);
        break;
      }
      default: break;
    }
  }

  /* ---------------- formulaire ---------------- */
  async function fillForm(out, values, flatten, fontFor) {
    const L = lib();
    const keys = Object.keys(values || {});
    if (!keys.length && !flatten) return { filled: 0 };
    let form; try { form = out.getForm(); } catch (e) { return { filled: 0, error: e.message }; }
    let filled = 0;
    for (const name of keys) {
      const v = values[name];
      try {
        const f = form.getFieldMaybe ? form.getFieldMaybe(name) : form.getField(name); if (!f) continue;
        if (f instanceof L.PDFTextField) { f.setText(sanitize(v == null ? '' : String(v))); filled++; }
        else if (f instanceof L.PDFCheckBox) { if (v === true || v === 'true' || v === 'on' || v === 'Yes') f.check(); else f.uncheck(); filled++; }
        else if (f instanceof L.PDFDropdown || f instanceof L.PDFOptionList || f instanceof L.PDFRadioGroup) { if (v != null && v !== '') { f.select(String(v)); filled++; } }
      } catch (e) { /* champ illisible ou valeur refusée : ignoré */ }
    }
    try { form.updateFieldAppearances(await fontFor('helv', false)); } catch (e) { /* apparences d'origine gardées */ }
    if (flatten) { try { form.flatten(); } catch (e) { /* formulaire non figeable */ } }
    return { filled };
  }

  /* ---------------- construction ---------------- */
  const asBytes = b => (b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : b && b.buffer ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : null);
  async function build(model, opts = {}) {
    const L = lib(); if (!L) throw new Error('pdf-lib indisponible');
    const sources = opts.sources || [];
    const src0 = asBytes(sources[0]); if (!src0) throw new Error('PDF d’origine absent');
    const out = await L.PDFDocument.load(src0, { ignoreEncryption: true, updateMetadata: false });
    if (out.isEncrypted) throw new Error('PDF protégé par un mot de passe : il ne peut pas être modifié');
    const orig = out.getPages();
    const want = (model && Array.isArray(model.pages) && model.pages.length ? model.pages : orig.map((p, i) => ({ key: 'p' + i, src: 0, srcIndex: i, rotate: 0 })));
    // 1. les pages voulues, dans l'ordre (une page d'origine réutilisée telle quelle ; ses doublons sont copiés)
    const used = new Set(); const others = new Map(); const final = [];
    for (const p of want) {
      if (p.blank) { final.push({ p, page: null, blank: p.blank }); continue; }
      if (!p.src) {
        const pg = orig[p.srcIndex]; if (!pg) continue;
        if (!used.has(p.srcIndex)) { used.add(p.srcIndex); pinInherited(pg); final.push({ p, page: pg }); }
        else { const [cp] = await out.copyPages(out, [p.srcIndex]); final.push({ p, page: cp }); }
        continue;
      }
      let doc = others.get(p.src);
      if (!doc) { const b = asBytes(sources[p.src]); if (!b) continue; doc = await L.PDFDocument.load(b, { ignoreEncryption: true, updateMetadata: false }); others.set(p.src, doc); }
      if (p.srcIndex < 0 || p.srcIndex >= doc.getPageCount()) continue;
      const [cp] = await out.copyPages(doc, [p.srcIndex]);
      final.push({ p, page: cp });
    }
    if (!final.length) throw new Error('le document doit garder au moins une page');
    // 2. l'arbre des pages est reconstruit à plat, dans l'ordre voulu (les pages retirées disparaissent)
    for (let i = out.getPageCount() - 1; i >= 0; i--) out.removePage(i);
    const pagesNode = out.catalog.Pages();
    pagesNode.set(L.PDFName.of('Kids'), out.context.obj([]));
    pagesNode.set(L.PDFName.of('Count'), L.PDFNumber.of(0));
    for (const f of final) {
      if (f.blank) f.page = out.addPage([Math.max(36, num(f.blank.w, 595.28)), Math.max(36, num(f.blank.h, 841.89))]);
      else out.addPage(f.page);
    }
    // 3. rotation, annotations
    const font = fontsCache(out);
    const ctx = { font, images: opts.images || {}, embedded: {} };
    const annots = (model && model.annots) || {};
    for (const f of final) {
      const pg = f.page, p = f.p;
      if (p.rotate) pg.setRotation(L.degrees(norm360(pg.getRotation().angle + p.rotate)));
      const list = (annots[p.key] || []).filter(a => a && a.t);
      if (!list.length) continue;
      if (list.some(a => a.t !== 'note')) isolate(out, pg);
      for (const a of list) { try { await drawAnnot(out, pg, a, ctx); } catch (e) { if (opts.strict) throw e; console.warn('Annotation non écrite :', a.t, e && e.message); } }
    }
    // 4. formulaire
    if (model && (model.form && Object.keys(model.form).length || opts.flattenForm)) await fillForm(out, model.form || {}, !!opts.flattenForm, font);
    // 5. numérotation et filigrane (en haut de la pile, dans le sens de lecture de la page)
    const N = final.length;
    if (model && model.numbering) {
      const nb = model.numbering; const helv = await font('helv', false);
      const size = Math.max(6, Math.min(24, num(nb.size, 10))); const start = Math.round(num(nb.start, 1));
      final.forEach((f, i) => {
        const pg = f.page; const rot = norm360(pg.getRotation().angle); const box = pg.getCropBox();
        const [W, H] = visualSize(box, rot);
        const label = nb.fmt === 'n/N' ? `${start + i} / ${start + N - 1}` : String(start + i);
        const tw = helv.widthOfTextAtSize(label, size); const m = 24;
        const vx = nb.pos === 'br' || nb.pos === 'tr' ? W - m - tw : (W - tw) / 2;
        const vy = nb.pos === 'tr' ? H - m - size : m;
        const [x, y] = visualToUser(box, rot, vx, vy);
        isolate(out, pg);
        pg.drawText(label, { x, y, size, font: helv, color: color(nb.color || '#444444', L), rotate: L.degrees(rot) });
      });
    }
    if (model && model.watermark && String(model.watermark.text || '').trim()) {
      const wm = model.watermark; const helvB = await font('helv', true);
      const text = sanitize(String(wm.text).trim()).replace(/\n/g, ' ');
      for (const f of final) {
        const pg = f.page; const rot = norm360(pg.getRotation().angle); const box = pg.getCropBox();
        const [W, H] = visualSize(box, rot);
        let size = num(wm.size, 0) || Math.min(96, Math.max(18, Math.hypot(W, H) * 0.55 / Math.max(4, text.length) * 1.7));
        const tw = helvB.widthOfTextAtSize(text, size);
        const ang = num(wm.angle, 45) * Math.PI / 180;
        // centre de la page, texte centré sur ce point le long de son angle
        const vx = W / 2 - (tw / 2) * Math.cos(ang) + (size * 0.35) * Math.sin(ang);
        const vy = H / 2 - (tw / 2) * Math.sin(ang) - (size * 0.35) * Math.cos(ang);
        const [x, y] = visualToUser(box, rot, vx, vy);
        isolate(out, pg);
        pg.drawText(text, { x, y, size, font: helvB, color: color(wm.color || '#c04343', L), opacity: clamp01(num(wm.opacity, 0.18)), rotate: L.degrees(num(wm.angle, 45) + rot) });
      }
    }
    // 6. métadonnées (aucune mention publicitaire)
    try { out.setModificationDate(new Date()); if (opts.producer) out.setProducer(String(opts.producer)); } catch (e) { /* métadonnées en lecture seule */ }
    return out.save({ useObjectStreams: true, addDefaultPage: false });
  }
  /* les pages choisies (clés), après application de toutes les modifications */
  async function extract(model, pageKeys, opts = {}) {
    const L = lib();
    const full = await build(model, opts);
    const doc = await L.PDFDocument.load(full, { updateMetadata: false });
    const keys = (model.pages || []).map(p => p.key);
    const idx = (pageKeys || []).map(k => keys.indexOf(k)).filter(i => i >= 0 && i < doc.getPageCount());
    if (!idx.length) throw new Error('aucune page à extraire');
    const out = await L.PDFDocument.create({ updateMetadata: false });
    const cps = await out.copyPages(doc, idx);
    cps.forEach(p => out.addPage(p));
    try { out.setCreationDate(new Date()); out.setModificationDate(new Date()); if (opts.producer) out.setProducer(String(opts.producer)); } catch (e) { /* */ }
    return out.save({ useObjectStreams: true, addDefaultPage: false });
  }
  /* PDF chiffré ou signé ? (avant toute modification) */
  async function inspect(bytes) {
    const L = lib();
    const doc = await L.PDFDocument.load(asBytes(bytes), { ignoreEncryption: true, updateMetadata: false });
    let signed = false;
    try { signed = !!L.PDFSignature && doc.getForm().getFields().some(f => f instanceof L.PDFSignature); } catch (e) { /* */ }
    const b = asBytes(bytes);
    if (!signed && b.byteLength < 30 * 1024 * 1024) { try { signed = /\/Type\s*\/Sig\b|\/FT\s*\/Sig\b/.test(new TextDecoder('latin1').decode(b)); } catch (e) { /* */ } }
    return { encrypted: !!doc.isEncrypted, signed, pages: doc.getPageCount() };
  }

  const api = { build, extract, inspect, sanitize, visualToUser, stampLabel, STAMP_TEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AlixoPdfWrite = api;
})(typeof window !== 'undefined' ? window : null);
