/* ============================================================
   Alixo — page du téléphone pour « Photo depuis le téléphone » et « Importer depuis un téléphone » (photo.html, 1.40 / 1.52)
   Le nom de la session est après le # de l'adresse (il ne part jamais vers un serveur web) ; la page lit
   photodrop/{sid} (titre, type, expiration) puis :
   - type 'photo' : dépose chaque photo (photodrop/{sid}/photos/{pid}), réduite ici même pour tenir dans un document
     Firestore (≤ 1 Mo). L'ordinateur la reçoit, l'insère puis l'efface.
   - type 'file' (1.52) : envoie chaque fichier en morceaux de 700 Ko (Blob Firestore) : fiche photodrop/{sid}/files/{fid}
     { name, size, mime, chunks, at, done: false }, morceaux chunks/{0000…}, puis done: true. 20 Mo par fichier.
     L'ordinateur vérifie, assemble, range dans la bibliothèque et efface. Cette page ne lit, ne liste ni n'efface rien.
   - 1.56.0 : mode « scan » (adresse photo.html#<sid>-scan, session de type 'photo') : même envoi qu'une photo, avec un écran
     dédié (« Photographier la page ») et un redressement des contrastes de la page (papier blanc, noir et blanc au choix).
   - 1.57.0 : mode scan — détection automatique de la feuille (js/scandetect.js, sur le téléphone) puis écran « Vérifiez le
     cadrage » : quatre coins à ajuster (doigt, loupe, flèches du clavier), « Recadrer et envoyer » redresse la page
     (perspective corrigée, format A4 reconnu), « Envoyer sans recadrer » l'envoie telle quelle, « Reprendre la photo »
     relance l'appareil photo ; en lot (galerie), « Passer cette image » et « Envoyer les suivantes sans vérifier ».
     Case « Détecter et redresser la feuille » (clé alixo.scan.crop, '0' = désactivée) : décochée, envoi direct comme en 1.56.
   ============================================================ */
'use strict';

(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const main = $('#main');
  const MAX_SIDE = 2000, MAX_BYTES = 950 * 1024;
  const CHUNK = 700 * 1024, MAX_FILE = 20 * 1024 * 1024, MAX_CHUNKS = 30;   // 1.52 : mêmes limites que js/photodrop.js
  /* 1.52 : liste blanche des extensions acceptées — copie de SAFE_EXTS (js/files.js), cette page est autonome ; l'ordinateur
     refait le contrôle de son côté. Ni SVG, ni pages web, ni code, ni documents à macros, ni aide compilée (.chm). */
  const ACCEPT = ['pdf', 'docx', 'doc', 'odt', 'rtf', 'pptx', 'ppt', 'odp', 'key', 'xlsx', 'xls', 'ods', 'csv', 'tsv',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'heic', 'mp3', 'wav', 'm4a', 'ogg', 'oga', 'flac', 'aac', 'opus',
    'mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'txt', 'md', 'json', 'tex', 'log', 'zip'];
  const ICO = {
    cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v12H4Z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    scan: '<svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 9h8M8 12h8M8 15h5"/></svg>',
    gal: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M6 2.5h8.5L19 7v14.5H6Z"/><path d="M14.5 2.5V7H19"/></svg>',
    busy: '<svg viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8L16.3 9.5"/></svg>',
    err: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2v.3"/></svg>'
  };
  /* 1.56.0 : « #<sid>-scan » — le nom de session (alphabet [a-z2-9]) est avant le tiret, le mode après */
  const [sidRaw = '', modeRaw = ''] = (location.hash || '').replace(/^#/, '').split('-');
  const sid = sidRaw.replace(/[^a-z0-9]/gi, '').slice(0, 40);
  const scanMode = modeRaw === 'scan';
  const BW_KEY = 'alixo.scan.bw';
  let db = null, session = null;
  const msg = (title, text) => { main.innerHTML = `<div class="msg"><b>${esc(title)}</b><p>${esc(text)}</p></div>`; };
  const extOf = name => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
  const extOk = name => ACCEPT.includes(extOf(name));
  /* 1.52 : caractères de contrôle, bidirectionnels et invisibles retirés du nom (comme sur l'ordinateur) */
  const cleanName = s => String(s || '').replace(/[\\/:*?"<>|]/g, '·').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').trim().slice(0, 120);
  const fmtSize = n => n < 1024 ? n + ' o' : n < 1024 * 1024 ? Math.round(n / 1024) + ' Ko' : (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' Mo';
  const expiredErr = e => e && (e.message === 'expired' || e.code === 'permission-denied');

  /* 1.56.0 : redressement d'une page photographiée, en une passe sur la copie réduite. Couleur : étirement des niveaux
     de chaque canal entre ses percentiles 1 % et 99 % (seulement si l'écart dépasse 40) — la teinte du papier (lumière
     jaune, feuille crème) est neutralisée — puis papier presque blanc → blanc. gray : luminance étirée de même, niveaux
     de gris (gamma 0,9, légèrement éclairci). Aucune donnée ne quitte le téléphone avant l'envoi habituel. */
  function enhance(canvas, { gray = false } = {}) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    let img; try { img = ctx.getImageData(0, 0, w, h); } catch { return; }   // canevas illisible : la photo part telle quelle
    const d = img.data, n = w * h;
    const hY = new Uint32Array(256), hC = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    for (let i = 0; i < d.length; i += 4) { hY[(d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0]++; hC[0][d[i]]++; hC[1][d[i + 1]]++; hC[2][d[i + 2]]++; }
    /* table de correspondance d'un histogramme : étirement 1 %–99 %, puis blanc franc au-delà de 235 (gamma facultatif) */
    const lutOf = (hist, gamma = 1) => {
      let lo = 0, hi = 255, acc = 0;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
      acc = 0;
      for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
      const stretch = hi - lo >= 40;
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) {
        let x = stretch ? (v - lo) * 255 / (hi - lo) : v;
        x = Math.max(0, Math.min(255, x));
        if (gamma !== 1) x = 255 * Math.pow(x / 255, gamma);
        lut[v] = x >= 235 ? 255 : x;
      }
      return lut;
    };
    if (gray) {
      const lutG = lutOf(hY, 0.9);
      for (let i = 0; i < d.length; i += 4) { const y = lutG[(d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0]; d[i] = d[i + 1] = d[i + 2] = y; }
    } else {
      const [lR, lG, lB] = hC.map(h => lutOf(h));
      for (let i = 0; i < d.length; i += 4) { d[i] = lR[d[i]]; d[i + 1] = lG[d[i + 1]]; d[i + 2] = lB[d[i + 2]]; }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* 1.57.0 : décodage d'une photo (orientation de l'appareil photo respectée), partagé par shrink et l'écran de vérification */
  async function loadImage(file) {
    let src, w, h;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; h = src.height; }
    catch {
      src = await new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Image illisible')); }; im.src = u; });
      w = src.naturalWidth; h = src.naturalHeight;
    }
    if (!w || !h) { if (src.close) src.close(); throw new Error('Image illisible'); }
    return { src, w, h };
  }

  /* réduit l'image (orientation de l'appareil photo respectée) jusqu'à tenir sous MAX_BYTES ;
     1.56.0 : opts.enhance = { gray } → page redressée (enhance) une fois, sur la première copie réduite ;
     1.57.0 : opts.quad = 4 coins normalisés (HG, HD, BD, BG) → page d'abord redressée (perspective) à MAX_SIDE au plus ;
     si le redressement échoue, la photo entière part (uncropped: true, signalé dans la liste) */
  async function shrink(file, opts = {}) {
    const { src, w: w0, h: h0 } = await loadImage(file);
    let w = w0, h = h0, base = null, uncropped = false;
    if (opts.quad) {
      try { base = window.AlixoScanDetect.warp(src, w0, h0, opts.quad, { maxSide: MAX_SIDE }); }
      catch (e) { console.warn('Redressement impossible', e); base = null; uncropped = true; }
      if (base) { if (src.close) src.close(); w = base.width; h = base.height; if (opts.enhance) enhance(base, opts.enhance); }
    }
    let s = base ? 1 : Math.min(1, MAX_SIDE / Math.max(w, h)), q = 0.86, data = '', cw = w, ch = h;
    for (let k = 0; k < 8; k++) {
      cw = Math.max(1, Math.round(w * s)); ch = Math.max(1, Math.round(h * s));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(base || src, 0, 0, cw, ch);
      if (opts.enhance && !base) { enhance(c, opts.enhance); base = c; }   // les réductions suivantes partent de la page redressée
      data = c.toDataURL('image/jpeg', q);
      if (c !== base) { c.width = 0; c.height = 0; }
      if (data.length <= MAX_BYTES) break;
      q = Math.max(0.5, q - 0.1); s *= 0.82;
    }
    if (src.close) src.close();
    if (base) { base.width = 0; base.height = 0; }
    if (data.length > MAX_BYTES) throw new Error('Photo trop lourde');
    return { data, w: cw, h: ch, uncropped };
  }

  /* ---------------- photo (1.40) ---------------- */
  function screen() {
    main.innerHTML = `<h1>Envoyer une photo dans « ${esc(session.title || 'Document')} »</h1>
      <p class="sub">Elle apparaît tout de suite dans votre document, sur l’ordinateur.</p>
      <button class="btn primary" id="b-cam" type="button">${ICO.cam}Prendre une photo</button>
      <button class="btn ghost" id="b-gal" type="button">${ICO.gal}Choisir dans la galerie</button>
      <input type="file" id="f-cam" accept="image/*" capture="environment">
      <input type="file" id="f-gal" accept="image/*" multiple>
      <ul class="list" id="list"></ul>`;
    $('#b-cam').addEventListener('click', () => $('#f-cam').click());
    $('#b-gal').addEventListener('click', () => $('#f-gal').click());
    ['#f-cam', '#f-gal'].forEach(id => $(id).addEventListener('change', e => { const files = [...(e.target.files || [])]; e.target.value = ''; sendAll(files); }));
  }
  /* ---------------- document scanné (1.56.0) ---------------- */
  const bwGet = () => { try { return localStorage.getItem(BW_KEY) === '1'; } catch { return false; } };
  const bwSet = v => { try { if (v) localStorage.setItem(BW_KEY, '1'); else localStorage.removeItem(BW_KEY); } catch { /* stockage interdit */ } };
  /* 1.57.0 : « Détecter et redresser la feuille » — cochée par défaut, '0' mémorisé quand on la décoche */
  const CROP_KEY = 'alixo.scan.crop';
  const cropGet = () => { try { return localStorage.getItem(CROP_KEY) !== '0'; } catch { return true; } };
  const cropSet = v => { try { if (v) localStorage.removeItem(CROP_KEY); else localStorage.setItem(CROP_KEY, '0'); } catch { /* stockage interdit */ } };
  function screenScan() {
    main.innerHTML = `<h1>Scanner une page dans « ${esc(session.title || 'Document')} »</h1>
      <p class="sub">Cadrez le document en entier, bien à plat. Chaque page apparaît sur une page entière de votre document, sur l’ordinateur.</p>
      <p class="legal">Ne scannez que des documents que vous avez le droit de copier pour votre usage personnel. Une page de manuel ou le polycopié d’un enseignant ne peut être ni partagé ni déposé dans le Workspace sans l’accord de son auteur.</p>
      <label class="chk"><input type="checkbox" id="c-bw"${bwGet() ? ' checked' : ''}><span>Noir et blanc (mode document)</span></label>
      <label class="chk"><input type="checkbox" id="c-crop"${cropGet() ? ' checked' : ''}><span>Détecter et redresser la feuille</span></label>
      <button class="btn primary" id="b-cam" type="button">${ICO.scan}Photographier la page</button>
      <button class="btn ghost" id="b-gal" type="button">${ICO.gal}Choisir dans la galerie</button>
      <input type="file" id="f-cam" accept="image/*" capture="environment">
      <input type="file" id="f-gal" accept="image/*" multiple>
      <ul class="list" id="list"></ul>`;
    $('#b-cam').addEventListener('click', () => $('#f-cam').click());
    $('#b-gal').addEventListener('click', () => $('#f-gal').click());
    $('#c-bw').addEventListener('change', e => bwSet(e.target.checked));
    $('#c-crop').addEventListener('change', e => cropSet(e.target.checked));
    [['#f-cam', 'cam'], ['#f-gal', 'gal']].forEach(([id, from]) => $(id).addEventListener('change', e => { const files = [...(e.target.files || [])]; e.target.value = ''; scanFiles(files, { gray: $('#c-bw').checked, from }); }));
  }

  /* ---------------- 1.57.0 : détection de la feuille et écran « Vérifiez le cadrage » ---------------- */
  const isImg = f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
  let reviewChain = Promise.resolve();
  const FULL_QUAD = () => [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const isFullQuad = q => q.every((p, i) => Math.abs(p.x - (i === 1 || i === 2 ? 1 : 0)) < 0.002 && Math.abs(p.y - (i >= 2 ? 1 : 0)) < 0.002);
  /* case décochée (ou module absent) : envoi direct comme en 1.56 ; sinon une vérification par image, l'une après l'autre ;
     « Envoyer les suivantes sans vérifier » (lot) : les images restantes partent avec le cadre détecté (photo entière sinon) */
  function scanFiles(files, { gray = false, from = 'cam' } = {}) {
    const imgs = files.filter(isImg);
    if (!imgs.length) return;
    const enh = { gray };
    const box = $('#c-crop');
    if (!box || !box.checked || !window.AlixoScanDetect) { sendAll(imgs, { enhance: enh }); return; }
    const batch = from !== 'cam' || imgs.length > 1;
    reviewChain = reviewChain.then(async () => {
      for (let k = 0; k < imgs.length; k++) {
        const f = imgs[k];
        const r = await review(f, { batch, index: k + 1, total: imgs.length });
        if (r.quad) sendAll([f], { enhance: enh, quad: r.quad });
        else if (r.full || r.fail) sendAll([f], { enhance: enh });   // fail : sendAll affichera « Image illisible »
        else if (r.retake || r.cancel) break;
        if (r.rest) {
          for (const g of imgs.slice(k + 1)) { const q = await autoQuad(g); sendAll([g], q ? { enhance: enh, quad: q } : { enhance: enh }); }
          break;
        }
      }
    }).catch(e => console.error(e));
  }
  /* copie d'aperçu (≤ 1024 px) ; la photo décodée est libérée aussitôt */
  async function prepareReview(file) {
    const { src, w, h } = await loadImage(file);
    try {
      const k = Math.min(1, 1024 / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height);
      return { canvas: c, w, h };
    } finally { if (src.close) src.close(); }
  }
  /* cadre détecté sans vérification (lot « Envoyer les suivantes sans vérifier ») : null = photo entière */
  async function autoQuad(file) {
    let prep = null;
    try {
      prep = await prepareReview(file);
      const det = window.AlixoScanDetect.detect(prep.canvas);
      if (!det.ok || det.full || !det.quad) return null;
      const q = det.quad.map(p => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }));
      return isFullQuad(q) ? null : q;
    } catch (e) { console.warn(e); return null; }
    finally { if (prep) { prep.canvas.width = 0; prep.canvas.height = 0; } }
  }
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const CORNER_LABELS = ['Coin supérieur gauche', 'Coin supérieur droit', 'Coin inférieur droit', 'Coin inférieur gauche'];
  /* raisons de AlixoScanDetect.validate ; « outside » n'arrive jamais ici (coins ramenés dans la photo par clamp01) */
  const RV_WARN = { cross: 'Les coins se croisent : remettez chacun à sa place', small: 'Cadre trop petit : écartez les coins', shape: 'Cadre trop déformé : placez les coins sur ceux de la feuille' };
  /* entrées d'historique des écrans de vérification : { alixoRv: n }, n propre à chaque écran */
  let rvSeq = 0;
  /* écran de vérification d'une photo → { quad } | { full } | { retake } | { cancel } | { skip } | { fail } (photo illisible) ;
     + rest: true (lot) : les images suivantes partent sans vérification */
  function review(file, { batch = false, index = 1, total = 1 } = {}) {
    return new Promise(resolve => {
      const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
      const prevFocus = document.activeElement;
      const rvId = ++rvSeq;
      const more = batch && index < total;   // images à suivre dans le lot
      const pre = batch && total > 1 ? `Image ${index} sur ${total} · ` : '';
      const dlg = document.createElement('div');
      dlg.className = 'rv'; dlg.tabIndex = -1;
      dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'rv-t');
      dlg.innerHTML = `<div class="rv-top"><h2 id="rv-t">Vérifiez le cadrage</h2><p class="rv-st" role="status">${esc(pre)}Analyse de la photo…</p><p class="rv-warn" aria-live="polite"></p></div>
        <div class="rv-stage"><div class="rv-box" hidden><svg class="rv-svg" aria-hidden="true" focusable="false"><path class="rv-veil" fill-rule="evenodd"/><path class="rv-l1"/><path class="rv-l2"/></svg><div class="rv-loupe" hidden><canvas></canvas></div></div></div>
        <p class="rv-help" id="rv-help" hidden>Faites glisser les coins sur les bords de la feuille</p>
        <p class="rv-sr" id="rv-kbd">Flèches pour déplacer le coin, Maj + flèches pour aller plus vite</p>
        <div class="rv-bar"><button class="btn primary" id="rv-ok" type="button" disabled>Recadrer et envoyer</button>
          <div class="rv-row"><button class="btn ghost" id="rv-full" type="button" disabled>Envoyer sans recadrer</button><button class="btn ghost" id="rv-back" type="button">${batch ? 'Passer cette image' : 'Reprendre la photo'}</button></div>${more ? `
          <button class="rv-rest" id="rv-rest" type="button" disabled>Envoyer les suivantes sans vérifier</button>` : ''}</div>`;
      const q$ = s => dlg.querySelector(s);
      const st = q$('.rv-st'), warnEl = q$('.rv-warn'), stage = q$('.rv-stage'), box = q$('.rv-box'), svg = q$('.rv-svg'), help = q$('.rv-help');
      const loupe = q$('.rv-loupe'), lc = loupe.querySelector('canvas');
      const okB = q$('#rv-ok'), fullB = q$('#rv-full'), backB = q$('#rv-back'), restB = q$('#rv-rest');
      let quad = null, prep = null, bw = 0, bh = 0, done = false, popped = false, drag = null;
      const handles = [];
      /* anneau de focus jaune réservé au clavier : au toucher (doigt, souris), classe ptr — retirée dès qu'une touche est frappée */
      try { if (window.matchMedia && matchMedia('(pointer: coarse)').matches) dlg.classList.add('ptr'); } catch { /* rien */ }
      dlg.addEventListener('pointerdown', () => dlg.classList.add('ptr'), true);
      dlg.addEventListener('keydown', () => dlg.classList.remove('ptr'), true);

      const layout = () => {
        if (!prep) return;
        const r = stage.getBoundingClientRect(), pad = 26;
        const k = Math.min(Math.max(40, r.width - 2 * pad) / prep.canvas.width, Math.max(40, r.height - 2 * pad) / prep.canvas.height);
        bw = Math.max(1, Math.round(prep.canvas.width * k)); bh = Math.max(1, Math.round(prep.canvas.height * k));
        box.style.width = bw + 'px'; box.style.height = bh + 'px';
        svg.setAttribute('viewBox', `0 0 ${bw} ${bh}`);
        draw();
      };
      const draw = () => {
        if (!quad) return;
        const P = quad.map(p => [+(p.x * bw).toFixed(1), +(p.y * bh).toFixed(1)]);
        const poly = 'M' + P.map(p => p.join(' ')).join('L') + 'Z';
        q$('.rv-veil').setAttribute('d', `M0 0H${bw}V${bh}H0Z` + poly);
        q$('.rv-l1').setAttribute('d', poly); q$('.rv-l2').setAttribute('d', poly);
        handles.forEach((hd, i) => { hd.style.left = P[i][0] + 'px'; hd.style.top = P[i][1] + 'px'; });
      };
      const check = () => {
        const v = window.AlixoScanDetect.validate(quad, prep.w, prep.h);
        okB.disabled = !v.ok;
        const t = v.ok ? '' : (RV_WARN[v.reason] || RV_WARN.shape);
        if (warnEl.textContent !== t) warnEl.textContent = t;
      };
      /* loupe : agrandissement ×2 autour du coin tiré, avec les deux côtés du cadre qui s'y rejoignent. Elle se pose là où elle
         ne cache aucune poignée : bande vide autour de la photo si la place suffit, sinon l'angle ou le milieu de bord de la photo
         le plus éloigné des quatre poignées */
      const L = 96, GAP = 6;
      const loupeSpot = () => {
        const P = quad.map(p => [p.x * bw, p.y * bh]);
        const ox = box.offsetLeft, oy = box.offsetTop, sw = stage.clientWidth, sh = stage.clientHeight;
        const spots = [];
        // dans la photo : angles puis milieux des bords
        [[GAP, GAP], [bw - L - GAP, GAP], [GAP, bh - L - GAP], [bw - L - GAP, bh - L - GAP],
          [(bw - L) / 2, GAP], [(bw - L) / 2, bh - L - GAP], [GAP, (bh - L) / 2], [bw - L - GAP, (bh - L) / 2]].forEach(s => spots.push({ x: s[0], y: s[1], out: false }));
        // hors de la photo (bande vide de la scène), au-dessus, en dessous, à gauche, à droite
        if (oy >= L + GAP) spots.push({ x: (bw - L) / 2, y: -L - GAP, out: true });
        if (sh - oy - bh >= L + GAP) spots.push({ x: (bw - L) / 2, y: bh + GAP, out: true });
        if (ox >= L + GAP) spots.push({ x: -L - GAP, y: (bh - L) / 2, out: true });
        if (sw - ox - bw >= L + GAP) spots.push({ x: bw + GAP, y: (bh - L) / 2, out: true });
        const clear = s => Math.min(...P.map(([px, py]) => {   // distance entre le disque de la loupe et le centre de chaque poignée
          const dx = px - (s.x + L / 2), dy = py - (s.y + L / 2);
          return Math.hypot(dx, dy) - L / 2;
        }));
        let best = null, bestD = -Infinity;
        for (const s of spots) {
          const d = clear(s) + (s.out ? 1000 : 0);   // hors de la photo : rien n'y est caché
          if (d > bestD + 0.5) { best = s; bestD = d; }
        }
        return best;   // photo minuscule : aucune place sûre, la moins gênante
      };
      const showLoupe = i => {
        const dpr = Math.min(3, window.devicePixelRatio || 1), c = prep.canvas;
        if (lc.width !== L * dpr) { lc.width = L * dpr; lc.height = L * dpr; }
        const ctx = lc.getContext('2d'), S = lc.width;
        const cx = quad[i].x * c.width, cy = quad[i].y * c.height, half = (L / 2) / (bw / c.width) / 2;   // ×2
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
        ctx.drawImage(c, cx - half, cy - half, 2 * half, 2 * half, 0, 0, S, S);
        /* côtés du cadre autour du coin : vers le coin précédent et le suivant */
        const toL = p => [(p.x * c.width - (cx - half)) * S / (2 * half), (p.y * c.height - (cy - half)) * S / (2 * half)];
        const A = toL(quad[(i + 3) % 4]), B = toL(quad[(i + 1) % 4]);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(S / 2, S / 2); ctx.lineTo(B[0], B[1]);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * dpr; ctx.stroke();
        ctx.strokeStyle = '#3d8bfd'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
        /* réticule */
        ctx.beginPath(); ctx.moveTo(S / 2, S / 2 - 10 * dpr); ctx.lineTo(S / 2, S / 2 + 10 * dpr); ctx.moveTo(S / 2 - 10 * dpr, S / 2); ctx.lineTo(S / 2 + 10 * dpr, S / 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, .55)'; ctx.lineWidth = 3 * dpr; ctx.stroke();
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
        const s = loupeSpot();
        loupe.style.left = Math.round(s.x) + 'px'; loupe.style.top = Math.round(s.y) + 'px';
        loupe.hidden = false;
      };
      const moved = i => { draw(); check(); if (drag) showLoupe(i); };

      const close = async result => {
        if (done) return; done = true;
        window.removeEventListener('popstate', onPop); window.removeEventListener('resize', layout);
        document.removeEventListener('focusin', onFocusIn);
        dlg.remove(); document.body.classList.remove('rv-open');
        if (prep) { prep.canvas.width = 0; prep.canvas.height = 0; }
        lc.width = 0; lc.height = 0;
        const back = (prevFocus && prevFocus.isConnected && prevFocus !== document.body) ? prevFocus : $('#b-cam');
        if (back) try { back.focus({ preventScroll: true }); } catch { /* rien */ }
        /* l'entrée d'historique de l'écran est retirée avant la photo suivante (sinon le retour arrière la fermerait). Si le
           retour tarde (> 500 ms), l'écran suivant s'ouvre quand même : le popstate tardif est alors marqué (alixoLate) et
           l'écran suivant l'ignore au lieu de se fermer */
        if (!popped && history.state && history.state.alixoRv) {
          await new Promise(res => {
            let late = false;
            const on = ev => { window.removeEventListener('popstate', on); clearTimeout(drop); if (late) ev.alixoLate = true; else res(); };
            window.addEventListener('popstate', on);
            const drop = setTimeout(() => window.removeEventListener('popstate', on), 5000);
            history.back();
            setTimeout(() => { late = true; res(); }, 500);
          });
        }
        resolve(result);
      };
      /* retour arrière du téléphone : ferme l'écran seulement s'il quitte vraiment son entrée { alixoRv: rvId } */
      const onPop = e => {
        const s = history.state && history.state.alixoRv;
        if (e.alixoLate) {   // retour tardif de l'écran précédent : l'entrée de celui-ci est remise en place
          try { if (s && s !== rvId) history.replaceState({ alixoRv: rvId }, ''); else if (!s) history.pushState({ alixoRv: rvId }, ''); } catch { /* rien */ }
          return;
        }
        if (s === rvId) return;   // toujours sur l'entrée de cet écran (retour en avant, popstate d'un autre écran)
        popped = true; close(batch ? { skip: true } : { retake: true });
      };
      const onFocusIn = e => { if (!dlg.contains(e.target)) (okB.disabled ? backB : okB).focus(); };

      okB.addEventListener('click', () => {
        if (!quad || okB.disabled) return;
        close(isFullQuad(quad) ? { full: true } : { quad: quad.map(p => ({ x: p.x, y: p.y })) });
      });
      fullB.addEventListener('click', () => close({ full: true }));
      backB.addEventListener('click', () => {
        if (!batch) { const cam = $('#f-cam'); if (cam) cam.click(); }   // depuis le clic : le navigateur autorise l'appareil photo
        close(batch ? { skip: true } : { retake: true });
      });
      /* lot : celle-ci part avec son cadre (photo entière s'il n'est pas valable), les suivantes avec le cadre détecté */
      if (restB) restB.addEventListener('click', () => {
        if (!quad) return;
        close(okB.disabled || isFullQuad(quad) ? { full: true, rest: true } : { quad: quad.map(p => ({ x: p.x, y: p.y })), rest: true });
      });
      dlg.addEventListener('keydown', e => {
        /* Échap ferme seulement : image passée dans un lot, sinon fermeture sans envoi ni appareil photo */
        if (e.key === 'Escape') { e.preventDefault(); close(batch ? { skip: true } : { cancel: true }); return; }
        if (e.key !== 'Tab') return;
        const f = [...dlg.querySelectorAll('button:not([disabled])')];
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      });

      document.body.appendChild(dlg); document.body.classList.add('rv-open');
      dlg.focus({ preventScroll: true });
      try { history.pushState({ alixoRv: rvId }, ''); } catch { /* historique indisponible */ }
      window.addEventListener('popstate', onPop);
      document.addEventListener('focusin', onFocusIn);

      (async () => {
        await nextFrame();   // « Analyse de la photo… » s'affiche avant le calcul
        try { prep = await prepareReview(file); } catch (e) { console.warn(e); close({ fail: true }); return; }
        if (done) { prep.canvas.width = 0; prep.canvas.height = 0; return; }   // fermé pendant l'analyse
        let det;
        try { det = window.AlixoScanDetect.detect(prep.canvas); } catch (e) { console.warn(e); det = { ok: false, reason: 'contrast', quad: null, full: false }; }
        if (det.reason === 'tiny-image') { close({ full: true }); return; }   // trop petite pour être recadrée : envoyée telle quelle
        quad = (det.quad || FULL_QUAD()).map(p => ({ x: clamp01(p.x), y: clamp01(p.y) }));
        st.textContent = pre + (!det.ok ? 'Feuille non détectée : placez les coins ou envoyez la photo entière' : det.full ? 'La page remplit déjà la photo' : 'Feuille détectée');
        help.hidden = false;
        prep.canvas.className = 'rv-img'; prep.canvas.setAttribute('aria-hidden', 'true');
        box.insertBefore(prep.canvas, svg);
        CORNER_LABELS.forEach((label, i) => {
          const hd = document.createElement('button');
          hd.type = 'button'; hd.className = 'rv-h'; hd.setAttribute('aria-label', label); hd.setAttribute('aria-describedby', 'rv-kbd');
          hd.addEventListener('pointerdown', e => {
            if (e.button > 0) return;
            e.preventDefault(); hd.focus({ preventScroll: true });
            try { hd.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
            const r = box.getBoundingClientRect();
            drag = { id: e.pointerId, i, dx: r.left + quad[i].x * bw - e.clientX, dy: r.top + quad[i].y * bh - e.clientY };   // décalage de prise
            hd.classList.add('on'); showLoupe(i);
          });
          hd.addEventListener('pointermove', e => {
            if (!drag || drag.id !== e.pointerId || drag.i !== i) return;
            const r = box.getBoundingClientRect();
            quad[i] = { x: clamp01((e.clientX + drag.dx - r.left) / bw), y: clamp01((e.clientY + drag.dy - r.top) / bh) };
            moved(i);
          });
          const end = e => { if (drag && drag.id === e.pointerId) { drag = null; hd.classList.remove('on'); loupe.hidden = true; } };
          hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end); hd.addEventListener('lostpointercapture', end);
          hd.addEventListener('keydown', e => {
            const s = e.shiftKey ? 0.03 : 0.005;
            const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
            if (!d) return;
            e.preventDefault();
            quad[i] = { x: clamp01(quad[i].x + d[0]), y: clamp01(quad[i].y + d[1]) };
            moved(i);
          });
          box.appendChild(hd); handles.push(hd);
        });
        box.hidden = false;
        window.addEventListener('resize', layout);
        layout(); check();
        fullB.disabled = false; if (restB) restB.disabled = false;
        if (!okB.disabled) okB.focus(); else handles[0].focus();
      })();
    });
  }

  let chain = Promise.resolve();
  let pages = 0;   // 1.56.0 : pages scannées envoyées (numérotées dans la liste)
  /* 1.56.0 : opts.enhance (mode scan) → page redressée avant l'envoi ; échec réseau → « Réessayer » (comme sendFiles) ;
     1.57.0 : opts.quad → page recadrée et redressée avant l'envoi (le même cadre resservira pour « Réessayer ») */
  function sendAll(files, opts = {}) {
    files.filter(isImg).forEach(f => {
      const li = document.createElement('li'); li.className = 'item';
      const thumb = URL.createObjectURL(f);
      li.innerHTML = `<img src="${thumb}" alt=""><span class="t">Envoi…<small>${esc(f.name || 'Photo')}</small></span><span class="st busy">${ICO.busy}</span>`;
      $('#list').prepend(li);
      const set = (cls, text) => { li.querySelector('.st').className = 'st ' + cls; li.querySelector('.st').innerHTML = ICO[cls]; li.querySelector('.t').firstChild.textContent = text; const r = li.querySelector('.retry'); if (r) r.remove(); };
      const send = () => {
        chain = chain.then(async () => {
          try {
            if (Date.now() > session.exp) throw new Error('expired');
            const im = await shrink(f, opts);
            await db.collection('photodrop').doc(sid).collection('photos').add({ data: im.data, w: im.w, h: im.h, name: String(f.name || 'photo.jpg').slice(0, 80), at: Date.now() });
            set('ok', opts.enhance ? `Page ${++pages} envoyée${im.uncropped ? ' sans recadrage' : ''} — vérifiez qu’elle apparaît sur l’ordinateur` : 'Dans votre document');
          } catch (e) {
            console.error(e);
            const expired = expiredErr(e), heavy = e && e.message === 'Photo trop lourde', bad = e && e.message === 'Image illisible';
            set('err', expired ? 'Code expiré — scannez le nouveau QR code' : heavy ? (opts.enhance ? 'Photo trop lourde — cochez « Noir et blanc » et reprenez-la' : 'Photo trop lourde') : bad ? 'Image illisible' : 'Échec de l’envoi');
            if (!expired && !heavy && !bad) {
              const b = document.createElement('button'); b.type = 'button'; b.className = 'retry'; b.textContent = 'Réessayer';
              b.addEventListener('click', () => { b.remove(); set('busy', 'Envoi…'); send(); });
              li.appendChild(b);
            }
          }
        });
      };
      send();
      setTimeout(() => URL.revokeObjectURL(thumb), 10 * 60000);   // la vignette sert aussi pendant un nouvel essai
    });
  }

  /* ---------------- fichiers (1.52) ---------------- */
  function screenFiles() {
    main.innerHTML = `<h1>Envoyer des fichiers dans « ${esc(session.title || 'Mes cours')} »</h1>
      <p class="sub">Ils arrivent tout de suite dans votre bibliothèque Alixo, sur l’ordinateur.</p>
      <button class="btn primary" id="b-files" type="button">${ICO.file}Choisir des fichiers</button>
      <button class="btn ghost" id="b-cam" type="button">${ICO.cam}Prendre une photo</button>
      <input type="file" id="f-files" accept="${ACCEPT.map(e => '.' + e).join(',')}" multiple>
      <input type="file" id="f-cam" accept="image/*" capture="environment">
      <p class="hint">PDF, Word, PowerPoint, Excel, images, audio… — 20 Mo maximum par fichier.</p>
      <ul class="list" id="list"></ul>`;
    $('#b-files').addEventListener('click', () => $('#f-files').click());
    $('#b-cam').addEventListener('click', () => $('#f-cam').click());
    ['#f-files', '#f-cam'].forEach(id => $(id).addEventListener('change', e => { const files = [...(e.target.files || [])]; e.target.value = ''; sendFiles(files); }));
  }
  function sendFiles(files) {
    files.forEach(f => {
      const name = cleanName(f.name) || 'fichier';
      const li = document.createElement('li'); li.className = 'item';
      li.innerHTML = `<span class="fic">${ICO.file}<b>${esc((extOf(name) || '?').slice(0, 4).toUpperCase())}</b></span><span class="t">Envoi…<small>${esc(name)} · ${fmtSize(f.size || 0)}</small><span class="bar" hidden><i></i></span></span><span class="st busy">${ICO.busy}</span>`;
      $('#list').prepend(li);
      const set = (cls, text) => { li.querySelector('.st').className = 'st ' + cls; li.querySelector('.st').innerHTML = ICO[cls]; li.querySelector('.t').firstChild.textContent = text; li.querySelector('.bar').hidden = cls !== 'busy'; const r = li.querySelector('.retry'); if (r) r.remove(); };
      const pct = p => { li.querySelector('.bar').hidden = false; li.querySelector('.bar i').style.width = p + '%'; li.querySelector('.t').firstChild.textContent = `Envoi… ${p} %`; };
      if (!extOk(name)) { set('err', extOf(name) ? `Ce type de fichier n’est pas accepté (.${extOf(name)})` : 'Ce type de fichier n’est pas accepté'); return; }
      if (!(f.size > 0)) { set('err', 'Fichier vide'); return; }
      if (f.size > MAX_FILE) { set('err', 'Fichier trop lourd (20 Mo maximum)'); return; }
      /* 1.52 : un échec d'envoi (réseau) se rattrape d'un toucher sur « Réessayer » (nouvelle fiche ; l'ordinateur efface l'ancienne) */
      const send = () => {
        chain = chain.then(async () => {
          try {
            if (Date.now() > session.exp) throw new Error('expired');
            await uploadFile(f, name, pct);
            set('ok', 'Dans votre bibliothèque');
          } catch (e) {
            console.error(e);
            const expired = expiredErr(e);
            set('err', expired ? 'Code expiré — scannez le nouveau QR code' : 'Échec de l’envoi');
            if (!expired) {
              const b = document.createElement('button'); b.type = 'button'; b.className = 'retry'; b.textContent = 'Réessayer';
              b.addEventListener('click', () => { b.remove(); set('busy', 'Envoi…'); send(); });
              li.appendChild(b);
            }
          }
        });
      };
      send();
    });
  }
  async function uploadFile(f, name, pct) {
    const u8 = new Uint8Array(await f.arrayBuffer());
    const n = Math.ceil(u8.length / CHUNK);
    if (!n || n > MAX_CHUNKS) throw new Error('trop lourd');
    const ref = db.collection('photodrop').doc(sid).collection('files').doc();
    pct(0);
    await ref.set({ name, size: u8.length, mime: String(f.type || '').slice(0, 100), chunks: n, at: Date.now(), done: false });
    for (let i = 0; i < n; i++) {
      if (Date.now() > session.exp) throw new Error('expired');
      await ref.collection('chunks').doc(String(i).padStart(4, '0')).set({ i, data: firebase.firestore.Blob.fromUint8Array(u8.subarray(i * CHUNK, Math.min(u8.length, (i + 1) * CHUNK))) });
      pct(Math.round(100 * (i + 1) / n));
    }
    await ref.update({ done: true });
  }

  async function init() {
    if (sid.length < 20) { msg('Lien incomplet', 'Scannez à nouveau le QR code affiché par Alixo sur l’ordinateur.'); return; }
    try { firebase.initializeApp(window.ALIXO_FIREBASE_CONFIG); db = firebase.firestore(); } catch (e) { console.error(e); msg('Service indisponible', 'Réessayez dans un instant.'); return; }
    try {
      const snap = await db.collection('photodrop').doc(sid).get();
      if (!snap.exists) { msg('Ce QR code n’est plus valable', 'La fenêtre a été fermée sur l’ordinateur. Rouvrez-la pour en afficher un nouveau.'); return; }
      session = snap.data();
      if (!session.exp || Date.now() > session.exp) { msg('Ce QR code a expiré', 'Cliquez sur « Nouveau code » sur l’ordinateur, puis scannez-le.'); return; }
    } catch (e) { console.error(e); msg('Connexion impossible', 'Vérifiez la connexion internet du téléphone, puis rechargez la page.'); return; }
    if (session.type === 'file') screenFiles(); else if (scanMode) screenScan(); else screen();
  }
  init();
})();
