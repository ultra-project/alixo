/* ============================================================
   Alixo — photo depuis le téléphone (1.40)
   L'ordinateur affiche un QR code ; le téléphone le scanne, ouvre alixoapp.com/docs/photo.html, prend ou choisit
   une photo, et elle apparaît aussitôt dans le document ouvert (à l'endroit du curseur, puis à la suite).
   Échange par Firestore, sans serveur : photodrop/{sid} (session ouverte par le compte connecté : hôte, titre,
   expiration) et photodrop/{sid}/photos/{pid} (une photo par document, data URL ≤ 1 Mo, réduite sur le téléphone).
   Le nom de la session (24 caractères aléatoires) n'existe que dans le QR code ; l'ordinateur lit chaque photo puis
   l'efface, et ferme la session (suppression) quand on ferme la fenêtre. Règles : firestore.rules (« Photo depuis
   le téléphone »). Page du téléphone : app/photo.html + app/js/photo.js.
   ============================================================ */
'use strict';

(() => {
  const PHOTO_URL = 'https://alixoapp.com/docs/photo.html';
  const LIFE = 30 * 60 * 1000;   // une session reste ouverte 30 minutes
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const toast = (m, o) => (typeof window.toast === 'function' ? window.toast(m, o) : console.log(m));   // toast() de js/app.js
  let cur = null;   // { sid, unsub, onPhoto, panel, n, timer, title }

  const dbOk = () => !!(window.firebase && firebase.firestore && window.AlixoAuth && AlixoAuth.isConfigured && AlixoAuth.account());
  function randomId(n) {
    const a = 'abcdefghijkmnpqrstuvwxyz23456789';
    const buf = new Uint8Array(n); crypto.getRandomValues(buf);
    return [...buf].map(x => a[x % a.length]).join('');
  }
  function qrSvg(url) {
    try {
      const q = qrcode(0, 'M'); q.addData(url); q.make(); const n = q.getModuleCount();
      let p = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c} ${r}h1v1h-1z`;
      return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff" stroke="none"/><path d="${p}" fill="#111" stroke="none"/></svg>`;
    } catch { return ''; }
  }
  /* data URL → File (pour passer par le même chemin qu'une image déposée : réduction, stockage, bloc image) */
  function dataUrlToFile(data, name) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(data || ''); if (!m) return null;
    const bin = atob(m[2]); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], name || ('photo.' + m[1].split('/')[1]), { type: m[1] });
  }

  function render() {
    if (!cur) return;
    const url = `${PHOTO_URL}#${cur.sid}`;
    const st = cur.err ? `<span class="pd-err">${esc(cur.err)}</span>`
      : cur.expired ? 'Code expiré — cliquez sur « Nouveau code ».'
      : cur.n ? `<b>${cur.n} photo${cur.n > 1 ? 's' : ''} reçue${cur.n > 1 ? 's' : ''}</b> — vous pouvez en envoyer d’autres.`
      : '<span class="pd-wait"></span>En attente d’une photo…';
    cur.panel.innerHTML = `<div class="pd-head"><b>Photo depuis le téléphone</b><button class="pd-x" data-pd="close" title="Fermer (le QR code cesse de fonctionner)">✕</button></div>
      <div class="pd-body">
        <div class="pd-qr ${cur.expired || cur.err ? 'off' : ''}">${cur.ready ? qrSvg(url) : '<span class="pd-wait"></span>'}</div>
        <ol class="pd-steps"><li>Scannez ce QR code avec l’appareil photo de votre téléphone.</li><li>Prenez une photo, ou choisissez-la dans la galerie.</li><li>Elle apparaît ici, dans « ${esc(cur.title)} ».</li></ol>
      </div>
      <div class="pd-status">${st}</div>
      <div class="pd-foot">${cur.expired || cur.err ? '<button class="cta small" data-pd="renew">Nouveau code</button>' : `<button class="cta ghost small" data-pd="copy" title="${esc(url)}">Copier le lien</button>`}</div>`;
  }

  async function start(opts) {
    const db = firebase.firestore();
    const me = AlixoAuth.account();
    const sid = randomId(24);
    cur.sid = sid; cur.ready = false; cur.err = ''; cur.expired = false; render();
    try {
      await db.collection('photodrop').doc(sid).set({ host: me.uid, title: String(opts.title || 'Document').slice(0, 120), createdAt: Date.now(), exp: Date.now() + LIFE });
    } catch (e) {
      console.error('Photo depuis le téléphone :', e);
      if (!cur || cur.sid !== sid) return;
      cur.err = e && e.code === 'permission-denied' ? 'Service pas encore activé : les règles Firestore « Photo depuis le téléphone » doivent être publiées (npm run rules).' : 'Connexion impossible — vérifiez internet, puis « Nouveau code ».';
      render(); return;
    }
    if (!cur || cur.sid !== sid) { db.collection('photodrop').doc(sid).delete().catch(() => {}); return; }
    cur.ready = true; render();
    clearTimeout(cur.timer);
    cur.timer = setTimeout(() => { if (cur && cur.sid === sid) { cur.expired = true; stopListening(); render(); } }, LIFE);
    cur.unsub = db.collection('photodrop').doc(sid).collection('photos').onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const v = ch.doc.data() || {};
        ch.doc.ref.delete().catch(() => {});
        const file = dataUrlToFile(v.data, v.name);
        if (!file || !cur || cur.sid !== sid) return;
        cur.n++; render();
        try { cur.onPhoto(file); } catch (e) { console.error(e); }
      });
    }, e => { console.error('Photo depuis le téléphone :', e); if (cur && cur.sid === sid) { cur.err = 'La liaison avec le téléphone a été coupée.'; render(); } });
  }
  function stopListening() {
    if (!cur) return;
    if (cur.unsub) { try { cur.unsub(); } catch { /* */ } cur.unsub = null; }
    clearTimeout(cur.timer);
  }
  function close() {
    if (!cur) return;
    stopListening();
    const sid = cur.sid;
    if (sid && dbOk()) firebase.firestore().collection('photodrop').doc(sid).delete().catch(() => {});
    cur.panel.remove();
    cur = null;
  }

  /* ouvre la fenêtre du QR code ; onPhoto(file) reçoit chaque photo envoyée par le téléphone */
  function open({ title = 'Document', onPhoto } = {}) {
    if (!dbOk()) { toast('La photo depuis le téléphone demande un compte Alixo connecté (Paramètres › Compte)', { duration: 6000 }); return false; }
    if (cur) { cur.onPhoto = onPhoto; cur.title = title; render(); return true; }   // une seule session : elle suit le document
    const panel = document.createElement('div');
    panel.id = 'pd-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Photo depuis le téléphone');
    document.body.appendChild(panel);
    cur = { sid: '', unsub: null, onPhoto, panel, n: 0, timer: null, title, ready: false, err: '', expired: false };
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-pd]'); if (!b || !cur) return;
      const k = b.dataset.pd;
      if (k === 'close') close();
      else if (k === 'renew') { stopListening(); if (cur.sid) firebase.firestore().collection('photodrop').doc(cur.sid).delete().catch(() => {}); start(cur); }
      else if (k === 'copy') { const u = `${PHOTO_URL}#${cur.sid}`; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Lien copié — ouvrez-le sur votre téléphone'), () => toast(u, { duration: 8000 })); }
    });
    start(cur);
    return true;
  }

  window.addEventListener('beforeunload', () => { if (cur) close(); });
  window.AlixoPhotoDrop = { open, close, isOpen: () => !!cur, PHOTO_URL };
})();
