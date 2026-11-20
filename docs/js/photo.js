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

  /* réduit l'image (orientation de l'appareil photo respectée) jusqu'à tenir sous MAX_BYTES ;
     1.56.0 : opts.enhance = { gray } → page redressée (enhance) une fois, sur la première copie réduite */
  async function shrink(file, opts = {}) {
    let src, w, h;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; h = src.height; }
    catch {
      src = await new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Image illisible')); }; im.src = u; });
      w = src.naturalWidth; h = src.naturalHeight;
    }
    if (!w || !h) throw new Error('Image illisible');
    let s = Math.min(1, MAX_SIDE / Math.max(w, h)), q = 0.86, data = '', cw = w, ch = h, base = null;
    for (let k = 0; k < 8; k++) {
      cw = Math.max(1, Math.round(w * s)); ch = Math.max(1, Math.round(h * s));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(base || src, 0, 0, cw, ch);
      if (opts.enhance && !base) { enhance(c, opts.enhance); base = c; }   // les réductions suivantes partent de la page redressée
      data = c.toDataURL('image/jpeg', q);
      if (data.length <= MAX_BYTES) break;
      q = Math.max(0.5, q - 0.1); s *= 0.82;
    }
    if (src.close) src.close();
    if (data.length > MAX_BYTES) throw new Error('Photo trop lourde');
    return { data, w: cw, h: ch };
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
  function screenScan() {
    main.innerHTML = `<h1>Scanner une page dans « ${esc(session.title || 'Document')} »</h1>
      <p class="sub">Cadrez le document en entier, bien à plat. Chaque page apparaît sur une page entière de votre document, sur l’ordinateur.</p>
      <p class="legal">Ne scannez que des documents que vous avez le droit de copier pour votre usage personnel. Une page de manuel ou le polycopié d’un enseignant ne peut être ni partagé ni déposé dans le Workspace sans l’accord de son auteur.</p>
      <label class="chk"><input type="checkbox" id="c-bw"${bwGet() ? ' checked' : ''}><span>Noir et blanc (mode document)</span></label>
      <button class="btn primary" id="b-cam" type="button">${ICO.scan}Photographier la page</button>
      <button class="btn ghost" id="b-gal" type="button">${ICO.gal}Choisir dans la galerie</button>
      <input type="file" id="f-cam" accept="image/*" capture="environment">
      <input type="file" id="f-gal" accept="image/*" multiple>
      <ul class="list" id="list"></ul>`;
    $('#b-cam').addEventListener('click', () => $('#f-cam').click());
    $('#b-gal').addEventListener('click', () => $('#f-gal').click());
    $('#c-bw').addEventListener('change', e => bwSet(e.target.checked));
    ['#f-cam', '#f-gal'].forEach(id => $(id).addEventListener('change', e => { const files = [...(e.target.files || [])]; e.target.value = ''; sendAll(files, { enhance: { gray: $('#c-bw').checked } }); }));
  }

  let chain = Promise.resolve();
  let pages = 0;   // 1.56.0 : pages scannées envoyées (numérotées dans la liste)
  /* 1.56.0 : opts.enhance (mode scan) → page redressée avant l'envoi ; échec réseau → « Réessayer » (comme sendFiles) */
  function sendAll(files, opts = {}) {
    files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)).forEach(f => {
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
            set('ok', opts.enhance ? `Page ${++pages} envoyée — vérifiez qu’elle apparaît sur l’ordinateur` : 'Dans votre document');
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
