/* ============================================================
   Alixo — page du téléphone pour « Photo depuis le téléphone » (photo.html, 1.40)
   Le nom de la session est après le # de l'adresse (il ne part jamais vers un serveur web) ; la page lit
   photodrop/{sid} (titre du document, expiration) et y dépose chaque photo (photodrop/{sid}/photos/{pid}),
   réduite ici même pour tenir dans un document Firestore (≤ 1 Mo). L'ordinateur la reçoit, l'insère puis l'efface.
   ============================================================ */
'use strict';

(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const main = $('#main');
  const MAX_SIDE = 2000, MAX_BYTES = 950 * 1024;
  const ICO = {
    cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v12H4Z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    gal: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>',
    busy: '<svg viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8L16.3 9.5"/></svg>',
    err: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2v.3"/></svg>'
  };
  const sid = (location.hash || '').replace(/^#/, '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  let db = null, session = null;
  const msg = (title, text) => { main.innerHTML = `<div class="msg"><b>${esc(title)}</b><p>${esc(text)}</p></div>`; };

  /* réduit l'image (orientation de l'appareil photo respectée) jusqu'à tenir sous MAX_BYTES */
  async function shrink(file) {
    let src, w, h;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; h = src.height; }
    catch {
      src = await new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Image illisible')); }; im.src = u; });
      w = src.naturalWidth; h = src.naturalHeight;
    }
    if (!w || !h) throw new Error('Image illisible');
    let s = Math.min(1, MAX_SIDE / Math.max(w, h)), q = 0.86, data = '', cw = w, ch = h;
    for (let k = 0; k < 8; k++) {
      cw = Math.max(1, Math.round(w * s)); ch = Math.max(1, Math.round(h * s));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(src, 0, 0, cw, ch);
      data = c.toDataURL('image/jpeg', q);
      if (data.length <= MAX_BYTES) break;
      q = Math.max(0.5, q - 0.1); s *= 0.82;
    }
    if (src.close) src.close();
    if (data.length > MAX_BYTES) throw new Error('Photo trop lourde');
    return { data, w: cw, h: ch };
  }

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
  let chain = Promise.resolve();
  function sendAll(files) {
    files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)).forEach(f => {
      const li = document.createElement('li'); li.className = 'item';
      const thumb = URL.createObjectURL(f);
      li.innerHTML = `<img src="${thumb}" alt=""><span class="t">Envoi…<small>${esc(f.name || 'Photo')}</small></span><span class="st busy">${ICO.busy}</span>`;
      $('#list').prepend(li);
      const set = (cls, text) => { li.querySelector('.st').className = 'st ' + cls; li.querySelector('.st').innerHTML = ICO[cls]; li.querySelector('.t').firstChild.textContent = text; };
      chain = chain.then(async () => {
        try {
          if (Date.now() > session.exp) throw new Error('expired');
          const im = await shrink(f);
          await db.collection('photodrop').doc(sid).collection('photos').add({ data: im.data, w: im.w, h: im.h, name: String(f.name || 'photo.jpg').slice(0, 80), at: Date.now() });
          set('ok', 'Dans votre document');
        } catch (e) {
          console.error(e);
          set('err', e && (e.message === 'expired' || e.code === 'permission-denied') ? 'Code expiré — scannez le nouveau QR code' : e && e.message === 'Photo trop lourde' ? 'Photo trop lourde' : 'Échec de l’envoi — réessayez');
        } finally { setTimeout(() => URL.revokeObjectURL(thumb), 60000); }
      });
    });
  }

  async function init() {
    if (sid.length < 20) { msg('Lien incomplet', 'Scannez à nouveau le QR code affiché par Alixo sur l’ordinateur.'); return; }
    try { firebase.initializeApp(window.ALIXO_FIREBASE_CONFIG); db = firebase.firestore(); } catch (e) { console.error(e); msg('Service indisponible', 'Réessayez dans un instant.'); return; }
    try {
      const snap = await db.collection('photodrop').doc(sid).get();
      if (!snap.exists) { msg('Ce QR code n’est plus valable', 'La fenêtre a été fermée sur l’ordinateur. Rouvrez « Photo depuis le téléphone » pour en afficher un nouveau.'); return; }
      session = snap.data();
      if (!session.exp || Date.now() > session.exp) { msg('Ce QR code a expiré', 'Cliquez sur « Nouveau code » sur l’ordinateur, puis scannez-le.'); return; }
    } catch (e) { console.error(e); msg('Connexion impossible', 'Vérifiez la connexion internet du téléphone, puis rechargez la page.'); return; }
    screen();
  }
  init();
})();
