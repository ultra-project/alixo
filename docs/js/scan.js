/* ============================================================
   Alixo — bloc « Document scanné » (1.56.0)
   Une feuille photographiée avec le téléphone (QR code, js/photodrop.js en mode « scan », page du téléphone js/photo.js)
   devient un bloc { id, type: 'scan', iid, nw, nh, orient, shapes } :
   - l'image vit dans le magasin d'images (AlixoImages, iid), jamais dans le bloc (limite Firestore : 1 Mio par document) ;
   - le bloc occupe une page entière en vue par pages, à l'impression et dans les exports (sauts avant et après) ;
   - il est annotable au DESSIN seulement : c'est un hôte « draw » de js/draw.js (calque SVG transparent par-dessus l'image,
     coordonnées logiques 640 × 640·nh/nw), sans zone de texte ni texte dans une forme (allowShape, sanitize.js).
   Mini-barre #scanbar sous le bloc sélectionné : stylo, surligneur, formes, couleur, annuler, panneau Dessin, supprimer.
   S'appuie sur les globales d'app.js (doc, getBlock, blockIndex, uid, esc, toast, touch, renderBlocks, selectObj, objSel,
   AlixoImages, storageAllows, isEmptyPara, resetBlock, readOnly, isSpecialDoc, findDoc, openDoc, currentDocId, undoEdit,
   deleteObj, editorTopInset, scrollToBlockEl, IMG_MAX_BYTES).
   ============================================================ */
'use strict';

window.AlixoScan = (() => {
  const W = 640;                      // largeur logique du calque de dessin (comme js/draw.js)
  const SCAN_MAX_SIDE = 2000;         // côté maximal de l'image gardée (lisibilité d'une page A4 à l'écran et à l'impression)
  const MAX_BYTES = () => (typeof IMG_MAX_BYTES === 'number' ? IMG_MAX_BYTES : 940 * 1024);   // data URL ≤ 1 Mio (Firestore)
  const HL = '#ffe066';               // surligneur : jaune, semi-transparent, trait large
  const SVG = {
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/></svg>',
    hl: '<svg viewBox="0 0 24 24"><path d="m9 15 7.5-7.5a2 2 0 0 1 3 3L12 18H9Z"/><path d="M3 21h9" stroke-width="3.2" class="sb-hl"/></svg>',
    rect: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>',
    ellipse: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5M11 5h8v8"/></svg>',
    line: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    more: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
  };
  let lastInk = '#c04343';            // couleur du stylo retrouvée après le surligneur
  let mode = 'pen';                   // dernier outil de tracé choisi dans la mini-barre : 'pen' | 'hl'

  const dims = b => ({ nw: Math.max(1, Math.round(+b.nw) || 1), nh: Math.max(1, Math.round(+b.nh) || 1) });
  /* hauteur logique du calque (640 de large) — dérivée, jamais stockée */
  function heightOf(b) { const { nw, nh } = dims(b); return Math.max(80, Math.min(2000, Math.round(W * nh / nw))); }
  const imgTag = src => `<img class="scan-img" src="${esc(src)}" draggable="false" alt="Document scanné">`;
  /* 1.56.0 : seules les images JPEG, PNG ou WebP en data URL sont affichées (comme patchImages) */
  const okSrc = v => typeof v === 'string' && /^data:image\/(jpeg|png|webp);/.test(v);
  /* 1.56.0 : message lisible (dans le DOM, pas en ::before) quand l'image manque sur cet appareil */
  const MISSING = '<div class="scan-missing" role="note">Image introuvable sur cet appareil. Ouvrez ce document sur l’appareil qui l’a scanné pour la récupérer.</div>';

  /* ---------- rendu ---------- */
  function blockHTML(b, MV) {
    const { nw, nh } = dims(b);
    const hit = typeof AlixoImages !== 'undefined' ? AlixoImages.cache.get(b.iid) : null;   // constante globale d'app.js (pas sur window)
    const src = okSrc(hit) ? hit : null;
    const bad = !!hit && !src;   // image en cache mais d'un format refusé : signalée comme manquante
    const layer = window.AlixoDraw && AlixoDraw.hostSVG ? AlixoDraw.hostSVG(b) : '';
    return `<div class="block draw scan" data-id="${esc(b.id)}" data-orient="${nw >= nh ? 'landscape' : 'portrait'}" contenteditable="false">${MV || ''}<div class="draw-wrap scan-wrap${src ? '' : bad ? ' missing' : ' loading'}" style="aspect-ratio:${nw} / ${nh}">${src ? imgTag(src) : bad ? MISSING : ''}${layer}</div></div>`;
  }
  /* complète les scans dont l'image est arrivée après le rendu (appelé par patchImages d'app.js) */
  function patchImages() {
    document.querySelectorAll('#blocks > .block.scan > .scan-wrap.loading').forEach(wrap => {
      if (wrap.dataset.fetching) return;
      const b = getBlock(wrap.parentElement.dataset.id); if (!b || !b.iid) return;
      const put = v => {
        if (!wrap.isConnected) return;
        wrap.classList.remove('loading');
        if (okSrc(v)) wrap.insertAdjacentHTML('afterbegin', imgTag(v));
        else { wrap.classList.add('missing'); if (!wrap.querySelector('.scan-missing')) wrap.insertAdjacentHTML('afterbegin', MISSING); }
      };
      const hit = AlixoImages.cache.get(b.iid);
      if (hit) { put(hit); return; }
      wrap.dataset.fetching = '1';
      AlixoImages.get(b.iid).then(put, () => put(null));
    });
  }

  /* ---------- image : réduite au besoin, jamais recompressée si elle tient déjà ---------- */
  function readAsDataURL(file) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || '')); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
  }
  function fileToScanImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = async () => {
        URL.revokeObjectURL(url);
        const w = im.naturalWidth, h = im.naturalHeight;
        if (!w || !h) { reject(new Error('Image illisible')); return; }
        const scale = Math.min(1, SCAN_MAX_SIDE / Math.max(w, h));
        /* la page du téléphone a déjà réduit et compressé la photo : on garde ses octets tels quels (pas de 2e perte) */
        if (scale === 1 && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size * 1.37 < MAX_BYTES()) {
          try { const data = await readAsDataURL(file); if (/^data:image\/(jpeg|png|webp);base64,/.test(data) && data.length <= MAX_BYTES()) { resolve({ data, w, h }); return; } } catch { /* on recompresse */ }
        }
        let q = 0.86, s = scale, data = '', cw = w, ch = h;
        for (let k = 0; k < 7; k++) {
          cw = Math.max(1, Math.round(w * s)); ch = Math.max(1, Math.round(h * s));
          const c = document.createElement('canvas'); c.width = cw; c.height = ch;
          const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(im, 0, 0, cw, ch);
          data = c.toDataURL('image/jpeg', q);
          if (data.length <= MAX_BYTES()) break;
          q = Math.max(0.5, q - 0.1); s *= 0.85;
        }
        if (data.length > MAX_BYTES()) { reject(new Error('Image trop lourde')); return; }
        resolve({ data, w: cw, h: ch });
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
      im.src = url;
    });
  }

  /* ---------- insertion ---------- */
  /* une page reçue → un bloc scan, après `afterId` (le premier remplace un paragraphe vide) ; renvoie l'id du bloc ou null */
  async function addScanFile(file, afterId) {
    if (!file || !/^image\//.test(file.type || '')) { toast('Ce fichier n’est pas une image'); return null; }
    if (typeof storageAllows === 'function' && !await storageAllows(file.size || 0)) return null;
    let im;
    try { im = await fileToScanImage(file); } catch (e) { toast(e && e.message === 'Image trop lourde' ? 'Page trop lourde : reprenez la photo avec « Noir et blanc » coché, ou choisissez une image plus légère' : 'Image illisible'); return null; }
    const d = doc(); if (!d) return null;
    const iid = uid();
    await AlixoImages.put(iid, im.data);
    const blk = { type: 'scan', iid, nw: im.w, nh: im.h, orient: im.w >= im.h ? 'landscape' : 'portrait', shapes: [] };
    const target = (afterId && getBlock(afterId)) || getBlock(currentBlockId()) || d.blocks[d.blocks.length - 1] || null;
    let nb;
    if (target && isEmptyPara(target) && !(Array.isArray(target.fl) && target.fl.length)) nb = resetBlock(target, Object.assign({}, blk, { id: target.id }));
    else {
      nb = Object.assign({ id: uid() }, blk);
      d.blocks.splice(target ? blockIndex(target.id) + 1 : d.blocks.length, 0, nb);
    }
    /* toujours un paragraphe après le dernier scan : on peut continuer d'écrire sous la page */
    if (d.blocks[d.blocks.length - 1] === nb) d.blocks.push({ id: uid(), type: 'p', text: '' });
    touch(); renderBlocks('__none');
    return nb.id;
  }
  /* QR code : chaque page photographiée s'insère après la précédente, dans la séance d'origine (rouverte au besoin) */
  function capture(bid) {
    const d = doc(); if (!d || (typeof readOnly !== 'undefined' && readOnly) || (typeof isSpecialDoc === 'function' && isSpecialDoc(d))) return;
    if (!window.AlixoPhotoDrop || !AlixoPhotoDrop.openScan) { toast('Fonction indisponible'); return; }
    const docId = d.id;
    let after = bid || currentBlockId() || null;
    let queue = Promise.resolve();
    AlixoPhotoDrop.openScan({ title: d.titre || 'Sans titre', onPhoto: file => {
      queue = queue.then(async () => {
        if (!findDoc(docId)) return;
        if (currentDocId !== docId) { openDoc(docId); await new Promise(r => setTimeout(r, 60)); }
        if (after && !getBlock(after)) after = null;
        const id = await addScanFile(file, after);
        /* 1.56.0 : refus (image illisible, trop lourde, quota) signalé aussi dans le panneau du QR code, sans le fermer */
        if (!id) { if (AlixoPhotoDrop.warn) AlixoPhotoDrop.warn('Une page n’a pas pu être ajoutée : reprenez la photo.'); return; }
        if (AlixoPhotoDrop.warn) AlixoPhotoDrop.warn('');
        after = id;
        selectObj(id);
        const el = blocksEl.querySelector(`:scope > .block[data-id="${CSS.escape(id)}"]`);
        if (el && typeof scrollToBlockEl === 'function') scrollToBlockEl(el, { margin: 60 });
      }).catch(e => console.error('Document scanné :', e));
    } });
  }

  /* ---------- mini-barre ---------- */
  const bar = () => document.querySelector('#scanbar');
  const btn = (k, tip, inner, cls = '') => `<button type="button" data-sb="${k}"${cls ? ` class="${cls}"` : ''} title="${esc(tip)}" aria-label="${esc(tip)}">${inner}</button>`;
  function barHTML() {
    return btn('pen', 'Stylo : tracez à main levée sur la page (Échap ou nouveau clic pour arrêter)', SVG.pen)
      + btn('hl', 'Surligneur : trait jaune transparent (Échap pour terminer)', SVG.hl)
      + '<span class="tb-sep"></span>'
      + btn('rect', 'Encadrer (rectangle)', SVG.rect) + btn('ellipse', 'Entourer (ellipse)', SVG.ellipse)
      + btn('arrow', 'Flèche', SVG.arrow) + btn('line', 'Trait', SVG.line)
      + '<span class="tb-sep"></span>'
      + btn('color', 'Couleur du trait (stylo, formes)', '<span class="sb-sw"></span>')
      + btn('undo', 'Annuler (Ctrl+Z)', SVG.undo)
      + btn('more', 'Plus d’outils (épaisseur, pointillés, remplissage…)', SVG.more)
      + '<span class="tb-sep"></span>'
      + btn('del', 'Supprimer le document scanné', SVG.del, 'danger');
  }
  const selScan = () => {
    if (typeof objSel === 'undefined' || !objSel) return null;
    const b = getBlock(objSel);
    return b && b.type === 'scan' ? b : null;
  };
  function updateBar() {
    const el = bar(); if (!el) return;
    const b = selScan();
    const blk = b && !readOnly && document.body.classList.contains('mode-editor') ? blocksEl.querySelector(`:scope > .block.scan[data-id="${CSS.escape(b.id)}"]`) : null;
    if (!blk) { if (!el.hidden) el.hidden = true; return; }
    if (!el.firstElementChild) el.innerHTML = barHTML();
    const D = window.AlixoDraw;
    const pen = !!(D && D.pen), st = D ? D.settings : null;
    const on = (k, v) => { const x = el.querySelector(`[data-sb="${k}"]`); if (x) { x.classList.toggle('on', v); x.setAttribute('aria-pressed', v ? 'true' : 'false'); } };
    on('pen', pen && mode === 'pen'); on('hl', pen && mode === 'hl');
    const sw = el.querySelector('.sb-sw'); if (sw && st) sw.style.background = /^#[0-9a-f]{6}$/i.test(st.stroke) ? st.stroke : '#202124';
    /* 1.56.0 : la couleur courante est annoncée (lecteurs d'écran, infobulle) */
    const cb = el.querySelector('[data-sb="color"]');
    if (cb && st) {
      const c = /^#[0-9a-f]{6}$/i.test(st.stroke) ? st.stroke.toLowerCase() : '#202124';
      const name = c === HL ? 'jaune surligneur' : ((D.colorName && D.colorName(c)) || c).toLowerCase();
      const lab = `Couleur du trait : ${name}`;
      if (cb.getAttribute('aria-label') !== lab) { cb.setAttribute('aria-label', lab); cb.title = lab; }
    }
    /* sous la page (comme la barre de l'image) ; au-dessus si l'on manque de place ; page plus haute que l'écran : en bas
       de l'écran, par-dessus la page. Page sortie de l'écran : barre masquée */
    const r = (blk.querySelector('.scan-wrap') || blk).getBoundingClientRect();
    const inset = typeof editorTopInset === 'function' ? editorTopInset() : 0;
    if (r.bottom < inset + 40 || r.top > innerHeight - 40) { el.hidden = true; return; }
    el.hidden = false;
    const h = el.offsetHeight;
    let top = r.bottom + 8;
    /* par-dessus la page : au-dessus de la rangée des messages (toast, en bas de l'écran) pour ne jamais être masquée */
    if (top + h > innerHeight - 8) { const above = r.top - h - 8; top = above >= inset + 6 ? above : Math.max(inset + 6, innerHeight - h - 76); }
    el.style.top = Math.round(top) + 'px';
    el.style.left = Math.round(Math.max(8, Math.min(r.left + r.width / 2 - el.offsetWidth / 2, innerWidth - el.offsetWidth - 8))) + 'px';
  }
  function setTool(m) {
    const D = window.AlixoDraw; if (!D) return;
    const st = D.settings;
    if (D.pen && mode === m) { D.setPen(false); updateBar(); return; }   // second clic sur l'outil actif : on s'arrête
    if (m === 'hl') {
      if (st.stroke.toLowerCase() !== HL) lastInk = st.stroke;
      st.stroke = HL; st.sw = 14; st.op = 0.5; st.ls = 'solid';
    } else {
      if (st.stroke.toLowerCase() === HL) st.stroke = lastInk;
      st.sw = 2; st.op = 1; st.ls = 'solid';
    }
    mode = m;
    D.setPen(true);
    updateBar();
  }
  function barClick(k, btnEl) {
    const b = selScan(); if (!b || readOnly) return;
    const D = window.AlixoDraw;
    if (k === 'pen' || k === 'hl') { setTool(k); return; }
    if (!D) return;
    if (['rect', 'ellipse', 'arrow', 'line'].includes(k)) {
      if (D.pen) D.setPen(false);
      const st = D.settings;
      if (st.stroke.toLowerCase() === HL) { st.stroke = lastInk; st.sw = 2; st.op = 1; }   // une forme au surligneur serait illisible
      D.insertInHost(b.id, k);
      updateBar(); return;
    }
    if (k === 'color') { D.pickStroke(btnEl.getBoundingClientRect()); return; }
    if (k === 'undo') { if (typeof undoEdit === 'function') undoEdit(); return; }
    if (k === 'more') { D.openPanel(); return; }
    if (k === 'del') { if (D.pen) D.setPen(false); deleteObj(b.id); }
  }
  function initBar() {
    const el = bar(); if (!el) return;
    el.setAttribute('role', 'toolbar'); el.setAttribute('aria-label', 'Annoter le document scanné');
    el.addEventListener('pointerdown', e => e.preventDefault());   // le document scanné reste sélectionné, le curseur ne bouge pas
    el.addEventListener('click', e => { const x = e.target.closest('[data-sb]'); if (x) barClick(x.dataset.sb, x); });
    el.addEventListener('keydown', e => {
      /* Échap : retour au document scanné sélectionné (selectObj rend le focus à l'éditeur) */
      if (e.key === 'Escape' && typeof objSel !== 'undefined' && objSel) { e.preventDefault(); e.stopPropagation(); selectObj(objSel); return; }
      /* 1.56.0 : flèches gauche / droite (Début, Fin) entre les boutons visibles de la barre */
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const list = visibleButtons(); const i = list.indexOf(document.activeElement); if (!list.length) return;
      e.preventDefault(); e.stopPropagation();
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
      list[j].focus();
    });
    window.addEventListener('resize', updateBar, { passive: true });
    /* l'état du stylo change aussi hors de la barre (Échap, panneau Dessin) : la barre suit */
    if (window.MutationObserver) new MutationObserver(() => { if (!el.hidden) updateBar(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  const visibleButtons = () => { const el = bar(); return el ? [...el.querySelectorAll('button[data-sb]')].filter(x => x.offsetParent !== null) : []; };
  /* 1.56.0 : clavier — un document scanné sélectionné : Tab ou Alt+F10 place le focus sur le premier bouton de la barre
     (appelé par le gestionnaire de sélection d'objet d'app.js) ; renvoie true si le focus a été déplacé */
  function focusBar() {
    if (!selScan()) return false;
    updateBar();
    const el = bar(); if (!el || el.hidden) return false;
    const first = visibleButtons()[0]; if (!first) return false;
    first.focus(); return true;
  }
  initBar();

  return { heightOf, blockHTML, patchImages, fileToScanImage, addScanFile, capture, updateBar, focusBar, HL };
})();
