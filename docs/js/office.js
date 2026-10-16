/* ============================================================
   Alixo — documents Word (.docx) et OpenDocument (.odt) modifiables (1.34)
   Jusqu'ici, un fichier Word ne faisait que s'afficher (lecture). Désormais il s'ouvre « dans Alixo » :
   son contenu devient une séance ordinaire (titres, paragraphes, listes, tableaux, citations, images),
   que l'on modifie comme n'importe quel cours et que l'on récupère en Word par Exporter › Word (.docx).

   - docx → HTML : mammoth (js/vendor/mammoth.browser.min.js) ; odt → HTML : lecteur maison (content.xml
     + styles automatiques, images du dossier Pictures/), avec JSZip ;
   - HTML → blocs : h / p / li (puces, numéros, retrait) / table (en-tête) / quote / img, texte en ligne
     limité aux balises que l'éditeur connaît (b, i, u, s, sup, sub, a, br).
   Chargé APRÈS app.js : utilise ses globales (state, save, openDoc, uid, toast, esc, cleanHTML, fileToImage,
   AlixoImages, folderProf, todayKey, requirePlus…).
   ============================================================ */
'use strict';

window.AlixoOffice = (() => {
  const EDITABLE = ['docx', 'odt'];
  const extOf = name => (String(name || '').split('.').pop() || '').toLowerCase();
  const canEdit = name => EDITABLE.includes(extOf(name));
  const baseName = name => String(name || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const NS = {
    text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
    style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    xlink: 'http://www.w3.org/1999/xlink'
  };

  /* ---------------- .docx → HTML (mammoth) ---------------- */
  async function docxToHtml(buf) {
    if (typeof mammoth === 'undefined') throw new Error('Convertisseur Word indisponible');
    const r = await mammoth.convertToHtml({ arrayBuffer: buf }, {
      styleMap: [
        'p[style-name=\'Title\'] => h1:fresh', 'p[style-name=\'Titre\'] => h1:fresh',
        'p[style-name=\'Subtitle\'] => h2:fresh', 'p[style-name=\'Sous-titre\'] => h2:fresh',
        'p[style-name=\'Quote\'] => blockquote:fresh', 'p[style-name=\'Citation\'] => blockquote:fresh',
        'p[style-name=\'Intense Quote\'] => blockquote:fresh'
      ]
    });
    return r.value || '';
  }

  /* ---------------- .odt → HTML (lecteur maison) ---------------- */
  async function odtToHtml(buf) {
    if (typeof JSZip === 'undefined') throw new Error('Lecteur OpenDocument indisponible');
    const zip = await JSZip.loadAsync(buf);
    const cf = zip.file('content.xml'); if (!cf) throw new Error('Fichier .odt incomplet (content.xml absent)');
    const xml = new DOMParser().parseFromString(await cf.async('string'), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Contenu .odt illisible');
    /* styles automatiques : gras, italique, souligné, barré, exposant / indice, et la famille (paragraphe / texte) */
    const styles = {};
    const readStyles = root => {
      if (!root) return;
      for (const st of root.getElementsByTagNameNS(NS.style, 'style')) {
        const name = st.getAttributeNS(NS.style, 'name'); if (!name) continue;
        const tp = st.getElementsByTagNameNS(NS.style, 'text-properties')[0];
        const o = { parent: st.getAttributeNS(NS.style, 'parent-style-name') || '', family: st.getAttributeNS(NS.style, 'family') || '' };
        if (tp) {
          o.b = /bold|[6-9]00/.test(tp.getAttributeNS(NS.fo, 'font-weight') || '');
          o.i = /italic|oblique/.test(tp.getAttributeNS(NS.fo, 'font-style') || '');
          const ul = tp.getAttributeNS(NS.style, 'text-underline-style') || ''; o.u = !!ul && ul !== 'none';
          const lt = tp.getAttributeNS(NS.style, 'text-line-through-style') || ''; o.s = !!lt && lt !== 'none';
          const pos = tp.getAttributeNS(NS.style, 'text-position') || ''; o.sup = /super|^[1-9]/.test(pos); o.sub = /sub|^-/.test(pos);
        }
        styles[name] = o;
      }
    };
    readStyles(xml.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'automatic-styles')[0]);
    const sf = zip.file('styles.xml');
    if (sf) { try { const sx = new DOMParser().parseFromString(await sf.async('string'), 'application/xml'); readStyles(sx.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'styles')[0]); } catch { /* styles communs facultatifs */ } }
    const styleOf = name => styles[name] || {};
    const rootName = name => { let n = name, k = 0; while (styles[n] && styles[n].parent && k++ < 8) n = styles[n].parent; return n || ''; };
    const images = {};
    const imgData = async href => {
      if (!href) return '';
      if (images[href] !== undefined) return images[href];
      const f = zip.file(href.replace(/^\.?\//, '')); let out = '';
      if (f) {
        const ext = extOf(href);
        const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }[ext];
        if (mime) out = `data:${mime};base64,${await f.async('base64')}`;
      }
      images[href] = out; return out;
    };
    /* texte en ligne d'un paragraphe */
    const inline = async node => {
      let h = '';
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { h += esc(n.nodeValue); continue; }
        if (n.nodeType !== 1) continue;
        const ln = n.localName;
        if (n.namespaceURI === NS.text) {
          if (ln === 's') { h += ' '.repeat(Math.max(1, +n.getAttributeNS(NS.text, 'c') || 1)); continue; }
          if (ln === 'tab') { h += '    '; continue; }
          if (ln === 'line-break') { h += '<br>'; continue; }
          if (ln === 'note' || ln === 'bookmark' || ln === 'bookmark-start' || ln === 'bookmark-end' || ln === 'soft-page-break' || ln === 'tracked-changes' || ln === 'sequence-decl' || ln === 'table-of-content') continue;
          if (ln === 'a') { const href = n.getAttributeNS(NS.xlink, 'href') || ''; const t = await inline(n); h += href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${t}</a>` : t; continue; }
          if (ln === 'span') {
            const st = styleOf(n.getAttributeNS(NS.text, 'style-name'));
            let t = await inline(n);
            if (st.b) t = `<b>${t}</b>`; if (st.i) t = `<i>${t}</i>`; if (st.u) t = `<u>${t}</u>`; if (st.s) t = `<s>${t}</s>`;
            if (st.sup) t = `<sup>${t}</sup>`; else if (st.sub) t = `<sub>${t}</sub>`;
            h += t; continue;
          }
        }
        if (n.namespaceURI === NS.draw && ln === 'frame') {
          const im = n.getElementsByTagNameNS(NS.draw, 'image')[0];
          const src = im ? await imgData(im.getAttributeNS(NS.xlink, 'href')) : '';
          if (src) h += `<img src="${src}" alt="${esc(n.getAttributeNS(NS.draw, 'name') || '')}">`;
          else { const tb = n.getElementsByTagNameNS(NS.draw, 'text-box')[0]; if (tb) h += await blocks(tb); }   // zone de texte : son contenu, à plat
          continue;
        }
        h += await inline(n);
      }
      return h;
    };
    /* éléments de bloc : titres, paragraphes, listes, tableaux, cadres */
    const blocks = async (node, depth = 0) => {
      let h = '';
      for (const n of node.childNodes) {
        if (n.nodeType !== 1) continue;
        const ln = n.localName;
        if (n.namespaceURI === NS.text) {
          if (ln === 'h') { const lvl = Math.min(6, Math.max(1, +n.getAttributeNS(NS.text, 'outline-level') || 1)); h += `<h${lvl}>${await inline(n)}</h${lvl}>`; continue; }
          if (ln === 'p') {
            const sn = n.getAttributeNS(NS.text, 'style-name') || ''; const rn = rootName(sn);
            const t = await inline(n);
            if (/^Title$|^Titre$|Main_20_Title/i.test(rn) || /^Title$|^Titre$/i.test(sn)) h += `<h1>${t}</h1>`;
            else if (/Subtitle|Sous-titre/i.test(rn) || /Subtitle|Sous-titre/i.test(sn)) h += `<h2>${t}</h2>`;
            else if (/^Heading_20_(\d)/i.test(rn)) h += `<h${Math.min(6, +rn.match(/^Heading_20_(\d)/i)[1])}>${t}</h${Math.min(6, +rn.match(/^Heading_20_(\d)/i)[1])}>`;
            else if (/Quot|Citation/i.test(rn) || /Quot|Citation/i.test(sn)) h += `<blockquote><p>${t}</p></blockquote>`;
            else if (depth > 0) h += `<p>${t}</p>`;
            else h += `<p>${t}</p>`;
            continue;
          }
          if (ln === 'list') {
            const items = [...n.childNodes].filter(x => x.nodeType === 1 && x.localName === 'list-item');
            /* numérotée si le style de liste porte un list-level-style-number */
            let ordered = false;
            const lsn = n.getAttributeNS(NS.text, 'style-name');
            if (lsn) { for (const ls of xml.getElementsByTagNameNS(NS.text, 'list-style')) if (ls.getAttributeNS(NS.style, 'name') === lsn) ordered = ls.getElementsByTagNameNS(NS.text, 'list-level-style-number').length > 0; }
            let inner = '';
            for (const it of items) {
              let li = '';
              for (const c of it.childNodes) {
                if (c.nodeType !== 1) continue;
                if (c.localName === 'list') li += await blocks({ childNodes: [c] }, depth + 1);
                else if (c.localName === 'p' || c.localName === 'h') li += (li && !/<[ou]l>$/.test(li) ? '<br>' : '') + await inline(c);
              }
              inner += `<li>${li}</li>`;
            }
            h += ordered ? `<ol>${inner}</ol>` : `<ul>${inner}</ul>`;
            continue;
          }
          if (ln === 'section' || ln === 'index-body' || ln === 'illustration-index' || ln === 'table-of-content') { h += await blocks(n, depth); continue; }
          if (ln === 'soft-page-break' || ln === 'sequence-decls' || ln === 'tracked-changes' || ln === 'variable-decls' || ln === 'user-field-decls') continue;
        }
        if (n.namespaceURI === NS.table && ln === 'table') {
          let rows = '';
          const rowNodes = [...n.getElementsByTagNameNS(NS.table, 'table-row')];
          const headerRows = n.getElementsByTagNameNS(NS.table, 'table-header-rows')[0];
          const headSet = new Set(headerRows ? [...headerRows.getElementsByTagNameNS(NS.table, 'table-row')] : []);
          for (const r of rowNodes) {
            let cells = '';
            for (const c of r.childNodes) {
              if (c.nodeType !== 1 || (c.localName !== 'table-cell' && c.localName !== 'covered-table-cell')) continue;
              const parts = [];
              for (const p of c.childNodes) if (p.nodeType === 1 && (p.localName === 'p' || p.localName === 'h')) parts.push(await inline(p)); else if (p.nodeType === 1 && p.localName === 'list') parts.push(stripHtml(await blocks({ childNodes: [p] }, depth + 1)));
              const tag = headSet.has(r) ? 'th' : 'td';
              cells += `<${tag}>${parts.join('<br>')}</${tag}>`;
              const rep = +c.getAttributeNS(NS.table, 'number-columns-repeated') || 1;
              for (let k = 1; k < Math.min(rep, 20); k++) cells += `<${tag}></${tag}>`;
            }
            rows += `<tr>${cells}</tr>`;
          }
          h += `<table>${rows}</table>`;
          continue;
        }
        if (n.namespaceURI === NS.draw && ln === 'frame') { h += `<p>${await inline({ childNodes: [n] })}</p>`; continue; }
        h += await blocks(n, depth);
      }
      return h;
    };
    const body = xml.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text')[0];
    if (!body) throw new Error('Document .odt sans contenu texte');
    return await blocks(body);
  }
  const stripHtml = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent || ''; };

  /* ---------------- HTML → blocs Alixo ---------------- */
  const INLINE_OK = new Set(['B', 'I', 'U', 'S', 'SUP', 'SUB', 'BR', 'A']);
  const INLINE_MAP = { STRONG: 'B', EM: 'I', INS: 'U', DEL: 'S', STRIKE: 'S', MARK: 'B' };
  /* texte en ligne nettoyé (balises connues de l'éditeur, liens conservés, images retirées — elles deviennent des blocs) */
  function inlineHTML(node, imgs) {
    let h = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { h += esc(n.nodeValue).replace(/\n+/g, ' '); continue; }
      if (n.nodeType !== 1) continue;
      let tag = n.tagName.toUpperCase();
      if (tag === 'IMG') { if (imgs && n.getAttribute('src')) imgs.push({ src: n.getAttribute('src'), alt: n.getAttribute('alt') || '' }); continue; }
      tag = INLINE_MAP[tag] || tag;
      if (tag === 'BR') { h += '<br>'; continue; }
      const inner = inlineHTML(n, imgs);
      if (tag === 'A') { const href = n.getAttribute('href') || ''; h += /^(https?:|mailto:)/i.test(href) ? `<a href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>` : inner; continue; }
      if (INLINE_OK.has(tag)) { h += inner ? `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>` : ''; continue; }
      h += inner;   // span, font, div en ligne… : le texte seul
    }
    return h;
  }
  const clean = h => (typeof cleanHTML === 'function' ? cleanHTML(h) : h).replace(/^(\s|&nbsp;|<br>)+|(\s|&nbsp;|<br>)+$/g, '');
  const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'PRE', 'FIGURE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'HR', 'DL']);

  async function htmlToBlocks(html) {
    const root = document.createElement('div'); root.innerHTML = html || '';
    const out = [];
    const mk = b => Object.assign({ id: uid() }, b);
    const pendingImgs = [];
    const flushImgs = async () => {
      while (pendingImgs.length) {
        const im = pendingImgs.shift();
        const b = await imageBlock(im.src, im.alt); if (b) out.push(mk(b));
      }
    };
    const pushText = async (type, node, extra = {}) => {
      const imgs = [];
      const text = clean(inlineHTML(node, imgs));
      if (text) out.push(mk(Object.assign({ type, text }, extra)));
      pendingImgs.push(...imgs); await flushImgs();
    };
    const walk = async (node, ctx = {}) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) { if (n.nodeValue.trim()) { const p = document.createElement('p'); p.textContent = n.nodeValue; await pushText('p', p); } continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toUpperCase();
        if (/^H[1-6]$/.test(tag)) { await pushText('h', n, { level: Math.min(4, +tag[1]) }); continue; }
        if (tag === 'UL' || tag === 'OL') { await list(n, tag === 'OL' ? 'ol' : 'ul', ctx.ind || 0); continue; }
        if (tag === 'TABLE') { await table(n); continue; }
        if (tag === 'BLOCKQUOTE') {
          const imgs = []; const text = clean(inlineHTML(n, imgs).replace(/(<br>\s*){2,}/g, '<br>'));
          if (text) out.push(mk({ type: 'quote', text, cite: '' })); pendingImgs.push(...imgs); await flushImgs(); continue;
        }
        if (tag === 'PRE') { const p = document.createElement('p'); p.innerHTML = esc(n.textContent).replace(/\n/g, '<br>'); await pushText('p', p); continue; }
        if (tag === 'HR') { out.push(mk({ type: 'hr' })); continue; }
        if (tag === 'IMG') { const b = await imageBlock(n.getAttribute('src'), n.getAttribute('alt') || ''); if (b) out.push(mk(b)); continue; }
        if (tag === 'P' || tag === 'LI' || tag === 'DT' || tag === 'DD' || tag === 'FIGCAPTION') {
          if ([...n.children].some(c => BLOCK_TAGS.has(c.tagName.toUpperCase()))) { await walk(n, ctx); continue; }
          await pushText('p', n); continue;
        }
        if (BLOCK_TAGS.has(tag) || tag === 'BODY' || tag === 'SPAN' || tag === 'FONT') {
          if ([...n.children].some(c => BLOCK_TAGS.has(c.tagName.toUpperCase()) || c.tagName === 'IMG')) { await walk(n, ctx); continue; }
          await pushText('p', n); continue;
        }
        await pushText('p', n);
      }
    };
    const list = async (ul, lt, ind) => {
      for (const li of [...ul.children]) {
        if (li.tagName !== 'LI') { await walk({ childNodes: [li] }, { ind }); continue; }
        const own = li.cloneNode(true);
        const nested = [...own.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL'); nested.forEach(c => c.remove());
        own.querySelectorAll('p, div').forEach(p => { const br = document.createElement('br'); p.replaceWith(...p.childNodes, br); });
        await pushText('li', own, { lt, ind: Math.min(3, ind) });
        for (const sub of [...li.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL')) await list(sub, sub.tagName === 'OL' ? 'ol' : 'ul', ind + 1);
      }
    };
    const table = async t => {
      const rows = []; let head = false;
      const trs = [...t.querySelectorAll('tr')].filter(tr => tr.closest('table') === t);
      trs.forEach((tr, i) => {
        const cells = [...tr.children].filter(c => c.tagName === 'TD' || c.tagName === 'TH');
        if (!cells.length) return;
        if (i === 0 && cells.every(c => c.tagName === 'TH')) head = true;
        const row = [];
        for (const c of cells) {
          c.querySelectorAll('p, div').forEach(p => { const br = document.createElement('br'); p.replaceWith(...p.childNodes, br); });
          row.push(clean(inlineHTML(c, pendingImgs)));
          const span = Math.min(10, Math.max(1, +c.getAttribute('colspan') || 1)); for (let k = 1; k < span; k++) row.push('');
        }
        rows.push(row);
      });
      if (!rows.length) return;
      const nc = Math.min(12, Math.max(...rows.map(r => r.length)));
      const norm = rows.map(r => Array.from({ length: nc }, (_, i) => r[i] || '')).slice(0, 200);
      out.push(mk(Object.assign({ type: 'table', rows: norm }, head ? { head: true } : {})));
      await flushImgs();
    };
    await walk(root);
    await flushImgs();
    /* paragraphes vides en série → au plus un ; document vide → un paragraphe */
    const compact = [];
    for (const b of out) { if (b.type === 'p' && !b.text && compact.length && compact[compact.length - 1].type === 'p' && !compact[compact.length - 1].text) continue; compact.push(b); }
    while (compact.length && compact[compact.length - 1].type === 'p' && !compact[compact.length - 1].text) compact.pop();
    if (!compact.length) compact.push(mk({ type: 'p', text: '' }));
    return compact;
  }
  /* image (data URL) → bloc image, redimensionnée et enregistrée comme une image collée */
  async function imageBlock(src, alt) {
    if (!src || !/^data:image\//i.test(src)) return null;
    try {
      const blob = await (await fetch(src)).blob();
      if (!blob.size) return null;
      const im = await fileToImage(blob);
      const iid = uid();
      await AlixoImages.put(iid, im.data);
      return { type: 'img', iid, nw: im.w, nh: im.h, w: im.w >= 900 ? 80 : (im.w < 400 ? 40 : 60), align: 'center', alt: alt || '' };
    } catch (e) { console.warn('Image du document ignorée :', e); return null; }
  }

  /* ---------------- ouverture « dans Alixo » ---------------- */
  async function toHtml(name, buf) {
    const ext = extOf(name);
    if (ext === 'docx') return docxToHtml(buf);
    if (ext === 'odt') return odtToHtml(buf);
    throw new Error(`Format « .${ext} » non modifiable dans Alixo (Word .docx et OpenDocument .odt seulement)`);
  }
  /* crée une séance à partir du fichier et l'ouvre ; renvoie la séance (ou null) */
  let busy = false;
  async function importAsDoc({ name, buf, folderId = null, fileId = null, path = '' }) {
    if (busy) return null;
    const bufAB = buf instanceof ArrayBuffer ? buf : (buf && buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : null);
    if (!bufAB) { toast('Fichier illisible'); return null; }
    busy = true;
    const t0 = Date.now();
    toast(`Ouverture de « ${name} » dans Alixo…`, { duration: 4000 });
    try {
      const html = await toHtml(name, bufAB);
      const blocks = await htmlToBlocks(html);
      const d = {
        id: uid(), folderId: folderId || null, titre: baseName(name) || 'Document', createdAt: Date.now(), updatedAt: Date.now(), pinned: false,
        prof: typeof folderProf === 'function' ? folderProf(folderId) : '',
        blocks: blocks.map(b => Object.assign(b, typeof todayKey === 'function' ? { day: todayKey() } : {})),
        office: { name, ext: extOf(name), fileId: fileId || null, path: path || '', importedAt: Date.now() }
      };
      state.docs.push(d); save();
      openDoc(d.id);
      const n = blocks.length, imgs = blocks.filter(b => b.type === 'img').length;
      setTimeout(() => toast(`Document ouvert dans Alixo (${n} bloc${n > 1 ? 's' : ''}${imgs ? `, ${imgs} image${imgs > 1 ? 's' : ''}` : ''}, ${Math.max(1, Math.round((Date.now() - t0) / 100) / 10)} s). Modifiez-le ici ; Exporter › Word (.docx) pour le récupérer.`, { duration: 8000 }), 300);
      return d;
    } catch (err) {
      console.error(err);
      toast(`Impossible d’ouvrir ce document dans Alixo${err && err.message ? ' : ' + err.message : ''}`, { duration: 7000 });
      return null;
    } finally { busy = false; }
  }
  /* bouton « Modifier dans Alixo » (HTML) pour un nom de fichier donné, ou '' */
  const editButtonHTML = (name, attr) => canEdit(name) ? `<button class="cta small" type="button" ${attr} title="Ouvrir ce document comme une séance Alixo : titres, paragraphes, listes, tableaux et images deviennent modifiables (retour en Word par Exporter › Word)">${ICON} Modifier dans Alixo</button>` : '';
  const ICON = '<svg viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>';

  return { canEdit, EDITABLE, docxToHtml, odtToHtml, toHtml, htmlToBlocks, importAsDoc, editButtonHTML, extOf };
})();
