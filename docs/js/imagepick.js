/* ============================================================
   Alixo — 1.41 : bouton Image de la barre d'outils
   Un clic sur l'icône « Image » ouvre un petit menu juste dessous :
   - « Insérer une image » : fenêtre centrale avec les photos déjà enregistrées dans le compte (les images des
     cours, présentations, tableaux blancs et quiz : magasin AlixoImages, synchronisé dans users/{uid}/imgs) ;
     un clic insère la photo à l'endroit du curseur (même image, rien n'est renvoyé sur le cloud).
     Bouton « Importer depuis l'ordinateur » : seconde fenêtre, plus petite, par-dessus (zone de dépôt) ET
     l'explorateur de fichiers ouvert dans le même geste. Explorateur, glisser-déposer ou Ctrl+V : même chemin
     qu'une image déposée sur la feuille (addImageFiles : réduction, magasin local, envoi sur le cloud).
   - « Insérer une image via téléphone » : le flux QR code de la 1.40 (openPhoneImage, js/photodrop.js).
   Chargé après app.js (fonctions globales : doc, readOnly, isSpecialDoc, addImageFiles, insertSpecial, selectObj,
   showPopover, hidePopover, openDialog, closeDialog, toast, esc, state, AlixoImages).
   ============================================================ */
'use strict';

(() => {
  const tb = document.getElementById('toolbar');
  if (!tb) return;
  const ICO = {
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.6" cy="9.6" r="1.6"/><path d="m4 17.5 5-5 3.6 3.6 2.6-2.6L20 18"/></svg>',
    qr: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5Z"/></svg>'
  };
  const btnEl = () => tb.querySelector('[data-act="imgmenu"]');
  const editable = () => { const d = doc(); return !!d && !readOnly && !isSpecialDoc(d); };
  const connected = () => !!(window.AlixoAuth && AlixoAuth.isConfigured && AlixoAuth.account());

  /* ---------- petit menu sous l'icône ---------- */
  function openMenu() {
    const b = btnEl(); if (!b) return;
    const r = b.getBoundingClientRect();
    const phone = !document.body.classList.contains('mobile');   // la photo par QR code sert sur l'ordinateur
    showPopover(`<div class="ip-menu" role="menu" aria-label="Image">
        <button type="button" role="menuitem" data-ip="pick">${ICO.image}<span>Insérer une image</span></button>
        ${phone ? `<button type="button" role="menuitem" data-ip="phone">${ICO.qr}<span>Insérer une image via téléphone</span></button>` : ''}
      </div>`, { left: r.left - 6, top: r.top, bottom: r.bottom - 2 }, pop => {
      b.setAttribute('aria-expanded', 'true');
      pop._onHide = () => b.setAttribute('aria-expanded', 'false');
      const items = [...pop.querySelectorAll('[data-ip]')];
      items[0].focus({ preventScroll: true });
      pop.addEventListener('keydown', e => {
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hidePopover(); b.focus({ preventScroll: true }); }
        else if (e.key === 'Tab') { hidePopover(); }
      });
      pop.addEventListener('click', e => {
        const it = e.target.closest('[data-ip]'); if (!it) return;
        hidePopover();
        if (it.dataset.ip === 'phone') openPhoneImage();
        else openGallery();
      });
    });
  }
  tb.addEventListener('click', e => {
    const b = e.target.closest('[data-act="imgmenu"]'); if (!b) return;
    const pop = document.getElementById('popover');
    if (pop && !pop.hidden && pop.querySelector('.ip-menu')) { hidePopover(); return; }
    if (!editable()) { toast(readOnly ? 'Séance en lecture seule' : 'Ouvrez un cours pour insérer une image'); return; }
    openMenu();
  });
  /* le pointerdown global (app.js) ferme le menu avant le clic : un second clic sur l'icône le referme */
  tb.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-act="imgmenu"]'); const pop = document.getElementById('popover');
    b && (b._wasOpen = !!(pop && !pop.hidden && pop.querySelector('.ip-menu')));
  }, true);
  tb.addEventListener('click', e => {
    const b = e.target.closest('[data-act="imgmenu"]');
    if (b && b._wasOpen) { b._wasOpen = false; e.stopImmediatePropagation(); }
  }, true);

  /* ---------- photos du compte ---------- */
  /* toutes les images référencées par les documents (blocs, diapositives, tableaux blancs, quiz) : { iid, nw, nh, doc } */
  function cloudPhotos() {
    const seen = new Map();
    const docs = [...((state && state.docs) || [])].filter(Boolean)
      .sort((a, b) => (+b.updatedAt || 0) - (+a.updatedAt || 0));
    const walk = (o, d, depth) => {
      if (!o || typeof o !== 'object' || depth > 8) return;
      if (Array.isArray(o)) { for (const x of o) walk(x, d, depth + 1); return; }
      if (typeof o.iid === 'string' && o.iid && !seen.has(o.iid)) seen.set(o.iid, { iid: o.iid, nw: +o.nw || 0, nh: +o.nh || 0, doc: d.titre || 'Sans titre' });
      for (const k in o) if (o[k] && typeof o[k] === 'object') walk(o[k], d, depth + 1);
    };
    for (const d of docs) walk(d, d, 0);
    return [...seen.values()].slice(0, 400);
  }

  let returnFocus = null;
  function openGallery() {
    if (!editable()) return;
    returnFocus = btnEl();
    const list = cloudPhotos();
    const on = connected();
    const empty = `<div class="ip-empty">
        <div class="ip-empty-ico">${on ? ICO.image : ICO.cloud}</div>
        <b>${on ? 'Aucune image dans votre compte pour l’instant' : 'Vos photos du cloud apparaîtront ici'}</b>
        <p>${on ? 'Les images que vous ajoutez à vos cours sont enregistrées dans votre compte et se retrouvent ici, sur tous vos appareils.'
              : 'Connectez-vous à votre compte Alixo : les images de tous vos cours vous suivront sur l’ordinateur, le web et le téléphone.'}</p>
        ${!on && window.AlixoAuth && AlixoAuth.isConfigured ? '<button type="button" class="cta ghost small" data-ip="login">Se connecter</button>' : ''}
      </div>`;
    const note = list.length && !on ? `<div class="ip-note">${ICO.cloud}<span>Vous n’êtes pas connecté : ces images sont celles de vos cours sur cet appareil.</span>${window.AlixoAuth && AlixoAuth.isConfigured ? '<button type="button" class="linklike" data-ip="login">Se connecter</button>' : ''}</div>` : '';
    const grid = list.length ? `<div class="ip-grid" role="list">${list.map((p, i) => `<button type="button" class="ip-ph loading" role="listitem" data-i="${i}" title="${esc(p.doc)}" aria-label="Insérer l’image de « ${esc(p.doc)} »"><span class="ip-cap">${esc(p.doc)}</span></button>`).join('')}</div>` : empty;
    openDialog({
      id: 'ip-dlg', cls: 'ip-card',
      eyebrow: on ? `${ICO.cloud} Cloud Alixo` : 'Images',
      title: 'Insérer une image',
      sub: list.length ? `${list.length} image${list.length > 1 ? 's' : ''} déjà enregistrée${list.length > 1 ? 's' : ''} — cliquez sur une photo pour l’insérer à l’endroit du curseur.` : '',
      body: note + grid,
      foot: `<span class="ip-foot-hint">Astuce : vous pouvez aussi coller une image (Ctrl+V) ou la glisser ici.</span><span class="dlg-spacer"></span><button type="button" class="cta" data-ip="import">${ICO.upload}<span>Importer depuis l’ordinateur</span></button>`,
      onClose: () => { const f = returnFocus; returnFocus = null; if (f && f.isConnected && !document.querySelector('.dlgov')) f.focus({ preventScroll: true }); },
      onMount: card => {
        const ov = card.parentElement;
        ov.setAttribute('aria-modal', 'true'); card.setAttribute('aria-modal', 'true');
        card.addEventListener('click', e => {
          const a = e.target.closest('[data-ip]');
          if (a && a.dataset.ip === 'import') { openDrop(); return; }
          if (a && a.dataset.ip === 'login') { closeAll(); AlixoAuth.openAuthOverlay(); return; }
          const ph = e.target.closest('.ip-ph'); if (ph) insertCloud(list[+ph.dataset.i], ph);
        });
        card.addEventListener('keydown', e => {   // flèches dans la grille
          const ph = e.target.closest && e.target.closest('.ip-ph'); if (!ph || !/^Arrow/.test(e.key)) return;
          const all = [...card.querySelectorAll('.ip-ph')]; const i = all.indexOf(ph);
          const cols = Math.max(1, Math.round(ph.parentElement.clientWidth / (ph.offsetWidth + 10)));
          const j = i + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols })[e.key];
          if (all[j]) { e.preventDefault(); all[j].focus(); }
        });
        dropTarget(ov, null);
        lazyThumbs(card, list);
        const first = card.querySelector('.ip-ph') || card.querySelector('[data-ip="import"]');
        if (first) first.focus({ preventScroll: true });
      }
    });
  }
  /* vignettes chargées à l'apparition (data URL du magasin local, sinon du cloud) */
  function lazyThumbs(card, list) {
    const load = el => {
      const p = list[+el.dataset.i]; if (!p || el._ld) return; el._ld = true;
      AlixoImages.get(p.iid).then(v => {
        if (!el.isConnected) return;
        el.classList.remove('loading');
        if (!v) { el.classList.add('missing'); el.disabled = true; el.title = 'Image introuvable'; return; }
        const im = new Image(); im.alt = ''; im.draggable = false; im.decoding = 'async'; im.src = v;
        im.onload = () => { if (!p.nw) { p.nw = im.naturalWidth; p.nh = im.naturalHeight; } };
        el.prepend(im);
      }).catch(() => { el.classList.remove('loading'); el.classList.add('missing'); });
    };
    const els = [...card.querySelectorAll('.ip-ph')];
    if (!('IntersectionObserver' in window)) { els.forEach(load); return; }
    const io = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); load(en.target); } }), { root: card.querySelector('.dlg-body'), rootMargin: '200px' });
    els.forEach(el => io.observe(el));
  }
  async function insertCloud(p, el) {
    if (!p || !editable()) return;
    const data = await AlixoImages.get(p.iid);
    if (!data) { toast('Image introuvable'); return; }
    let w = p.nw, h = p.nh;
    if (!w || !h) {
      const im = el && el.querySelector('img');
      if (im && im.naturalWidth) { w = im.naturalWidth; h = im.naturalHeight; }
      else { const d = await new Promise(res => { const x = new Image(); x.onload = () => res([x.naturalWidth, x.naturalHeight]); x.onerror = () => res([800, 600]); x.src = data; }); w = d[0]; h = d[1]; }
    }
    closeAll();
    const nb = insertSpecial({ type: 'img', iid: p.iid, nw: w, nh: h, w: w >= 900 ? 80 : (w < 400 ? 40 : 60), align: 'center' });
    if (nb) { selectObj(nb.id); toast('Image insérée — poignées pour la taille, barre pour recadrer ou aligner'); }
  }

  /* ---------- import depuis l'ordinateur (fenêtre du dessus) ---------- */
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true; input.id = 'ip-file';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const files = [...(input.files || [])]; input.value = '';
    if (files.length) importFiles(files);
  });
  function openDrop() {
    openDialog({
      id: 'ip-drop', cls: 'ip-dropcard',
      title: 'Importer depuis l’ordinateur',
      body: `<div class="ip-zone" tabindex="0" role="button" aria-label="Choisir des images sur l’ordinateur, ou les glisser ici">
          <div class="ip-zone-ico">${ICO.upload}</div>
          <b>Glissez vos images ici</b>
          <span>ou collez-les (Ctrl+V), ou <u>parcourez l’ordinateur</u></span>
          <small>JPEG, PNG, WebP, GIF — plusieurs à la fois</small>
        </div>`,
      onMount: card => {
        const ov = card.parentElement;
        ov.setAttribute('aria-modal', 'true'); ov.classList.add('ip-top');
        const zone = card.querySelector('.ip-zone');
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
        dropTarget(ov, zone);
        zone.focus({ preventScroll: true });
      },
      onClose: () => { const b = document.querySelector('#ip-dlg [data-ip="import"]'); if (b) b.focus({ preventScroll: true }); }
    });
    input.click();   // même geste que le clic sur « Importer » : l'explorateur s'ouvre aussitôt
  }
  /* glisser-déposer sur une fenêtre (et jamais dans la page : le navigateur ouvrirait le fichier) */
  function dropTarget(ov, zone) {
    const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    ov.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; (zone || ov).classList.add('ip-over'); });
    ov.addEventListener('dragleave', e => { if (!e.relatedTarget || !ov.contains(e.relatedTarget)) (zone || ov).classList.remove('ip-over'); });
    ov.addEventListener('drop', e => {
      (zone || ov).classList.remove('ip-over');
      const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
      if (!files.length) return;
      e.preventDefault(); e.stopPropagation();
      importFiles(files);
    });
  }
  /* Ctrl+V dans l'une des deux fenêtres */
  document.addEventListener('paste', e => {
    if (!document.getElementById('ip-drop') && !document.getElementById('ip-dlg')) return;
    const cd = e.clipboardData; if (!cd) return;
    const files = [...(cd.files || [])].filter(f => f.type && f.type.startsWith('image/'));
    if (!files.length) { if (document.getElementById('ip-drop')) toast('Aucune image dans le presse-papiers'); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    importFiles(files);
  }, true);
  function importFiles(files) {
    const imgs = files.filter(f => f.type && f.type.startsWith('image/'));
    if (!imgs.length) { toast('Aucune image dans ce qui a été déposé'); return; }
    if (!editable()) return;
    closeAll();
    addImageFiles(imgs);   // même chemin qu'une image déposée sur la feuille (réduction, magasin, cloud)
  }
  function closeAll() { returnFocus = null; closeDialog('ip-drop'); closeDialog('ip-dlg'); }

  window.AlixoImagePick = { openMenu, openGallery, openDrop };
})();
