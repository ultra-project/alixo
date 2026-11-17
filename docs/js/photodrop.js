/* ============================================================
   Alixo — photo et fichiers depuis le téléphone (1.40, généralisé en 1.52)
   L'ordinateur affiche un QR code ; le téléphone le scanne, ouvre alixoapp.com/docs/photo.html, et envoie :
   - type 'photo' (1.40) : une photo qui apparaît aussitôt dans le document ouvert (data URL ≤ 1 Mo, réduite sur le téléphone,
     photodrop/{sid}/photos/{pid}) ;
   - type 'file' (1.52) : un ou plusieurs fichiers rangés dans un dossier de la bibliothèque. Même transport que la bibliothèque
     (js/files.js) : fiche photodrop/{sid}/files/{fid} { name, size, mime, chunks, at, done } puis morceaux Blob de 700 Ko
     photodrop/{sid}/files/{fid}/chunks/{0000…}, et done: true quand tout est là. L'ordinateur vérifie la fiche sans s'y fier
     (nom nettoyé, extension de la liste blanche AlixoFiles.knownExt, taille recoupée, MIME déduit de l'extension), assemble,
     range via AlixoFiles.addFiles, puis efface fiche et morceaux. 20 Mo par fichier, 200 Mo et 50 fichiers par session ;
     les fichiers sont reçus un par un (file d'attente), la place étant réservée dès l'annonce « done ».
   Échange par Firestore, sans serveur : photodrop/{sid} (session ouverte par le compte connecté : hôte, titre, type, expiration).
   Le nom de la session (24 caractères aléatoires) n'existe que dans le QR code ; tout est effacé après lecture et à la fermeture.
   1.52 : chaque session ouverte est notée en localStorage (alixo.photodrop.<uid>) ; une session restée sur le serveur (application
   fermée brutalement, coupure réseau) est effacée au prochain démarrage d'Alixo avec ce compte (purgeOrphans).
   Règles : firestore.rules (« Photo et fichiers depuis le téléphone »). Page du téléphone : app/photo.html + app/js/photo.js.
   ============================================================ */
'use strict';

(() => {
  const PHOTO_URL = 'https://alixoapp.com/docs/photo.html';
  const LIFE = 30 * 60 * 1000;   // une session reste ouverte 30 minutes
  const CHUNK = 700 * 1024;                      // 1.52 : même taille de morceau que js/files.js
  const MAX_PHONE_FILE = 20 * 1024 * 1024;       // 1.52 : = MAX_SYNC de files.js
  const MAX_CHUNKS = 30;
  const MAX_SESSION = 200 * 1024 * 1024;         // 1.52 : total reçu par session (puis « Nouveau code »)
  const MAX_FILES = 50;                          // 1.52 : nombre de fichiers par session (puis « Nouveau code »)
  const LIMIT_MSG = 'Limite d’une session atteinte — cliquez sur Nouveau code';
  /* 1.52 : caractères de contrôle, bidirectionnels (U+202E « RLO » : « fdp.exe » affiché « exe.pdf ») et invisibles retirés des noms */
  const cleanName = s => String(s || '').replace(/[\\/:*?"<>|]/g, '·').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').trim().slice(0, 120);
  /* 1.52 : liste blanche = AlixoFiles.knownExt (js/files.js) ; sans elle, rien n'est accepté. MIME par extension (copie locale) */
  const knownExt = name => !!(window.AlixoFiles && typeof AlixoFiles.knownExt === 'function' && AlixoFiles.knownExt(name));
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', heic: 'image/heic',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', odt: 'application/vnd.oasis.opendocument.text', rtf: 'application/rtf',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint', odp: 'application/vnd.oasis.opendocument.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv', tsv: 'text/tab-separated-values',
    txt: 'text/plain', md: 'text/markdown', json: 'application/json', tex: 'text/plain', log: 'text/plain', zip: 'application/zip' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const toast = (m, o) => (typeof window.toast === 'function' ? window.toast(m, o) : console.log(m));   // toast() de js/app.js
  const extOf = name => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
  const pad4 = i => String(i).padStart(4, '0');
  function fmtSize(n) {
    if (!(n >= 0)) return '';
    if (n < 1024) return n + ' o';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' Ko';
    return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' Mo';
  }
  /* 1.52 : cur = { type: 'photo' | 'file', sid, unsub, onItem, panel, n, timer, title, items, ready, err, expired, bytes, reserved, queue, limit }
     items (mode fichier) = [{ fid, name, size, st: 'up' | 'check' | 'down' | 'ok' | 'err', done, chunks, msg }]
     'check' : annoncé complet, en file d'attente (place réservée) ; 'down' : morceaux en cours de lecture */
  let cur = null;

  const dbOk = () => !!(window.firebase && firebase.firestore && window.AlixoAuth && AlixoAuth.isConfigured && AlixoAuth.account());

  /* 1.52 : registre local des sessions ouvertes { sid, type, at, seen } (clé par compte). « seen » est rafraîchi tant que la
     fenêtre est ouverte : une autre fenêtre ou un autre onglet d'Alixo n'efface donc pas une session encore affichée. */
  const REG_ALIVE = 90 * 1000;
  const regKey = () => { const a = window.AlixoAuth && AlixoAuth.account && AlixoAuth.account(); return a && a.uid ? 'alixo.photodrop.' + String(a.uid).replace(/[^\w-]/g, '').slice(0, 64) : ''; };
  function regRead(key) {
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v.filter(e => e && typeof e.sid === 'string' && /^[a-z0-9]{20,40}$/.test(e.sid)).slice(-20) : []; } catch { return []; }
  }
  function regWrite(key, list) { try { if (list.length) localStorage.setItem(key, JSON.stringify(list)); else localStorage.removeItem(key); } catch { /* stockage plein ou interdit */ } }
  function regAdd(sid, type) { const k = regKey(); if (!k) return; const now = Date.now(); regWrite(k, regRead(k).filter(e => e.sid !== sid).concat([{ sid, type, at: now, seen: now }])); }
  function regTouch(sid) { const k = regKey(); if (!k) return; const l = regRead(k); const e = l.find(x => x.sid === sid); if (e) { e.seen = Date.now(); regWrite(k, l); } }
  function regRemove(sid, key) { const k = key || regKey(); if (!k) return; regWrite(k, regRead(k).filter(e => e.sid !== sid)); }
  let purging = false;
  /* efface fiches, morceaux, photos puis la session de chaque entrée qui n'est plus affichée nulle part */
  async function purgeOrphans() {
    if (purging || !dbOk()) return 0;
    const k = regKey(); if (!k) return 0;
    purging = true; let n = 0;
    try {
      for (const e of regRead(k)) {
        if ((cur && cur.sid === e.sid) || Date.now() - (Number(e.seen) || 0) < REG_ALIVE) continue;
        try {
          await purgeAll(e.sid, []);
          await purgePhotos(e.sid);
          await sessionRef(e.sid).delete();
        } catch { /* session déjà effacée (permission refusée sur un document absent) : rien à faire */ }
        regRemove(e.sid, k); n++;
      }
    } finally { purging = false; }
    return n;
  }
  /* au démarrage : dès qu'un compte est connecté (la connexion arrive après le chargement), puis une seconde fois plus tard */
  function schedulePurge() {
    let tries = 0;
    const tick = () => { if (dbOk()) { purgeOrphans().catch(() => {}); setTimeout(() => purgeOrphans().catch(() => {}), 2 * REG_ALIVE); return; } if (++tries < 60) setTimeout(tick, 2000); };
    setTimeout(tick, 1500);
  }
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

  /* 1.52 : icône de fichier (celle de la bibliothèque si elle est chargée) */
  const fileIcon = name => (window.AlixoFiles && typeof AlixoFiles.iconHTML === 'function') ? AlixoFiles.iconHTML(name, 'mini')
    : `<span class="file-ico mini"><svg viewBox="0 0 24 24"><path d="M6 2.5h8.5L19 7v14.5H6Z"/><path d="M14.5 2.5V7H19"/></svg><span class="file-ext">${esc((extOf(name) || '?').slice(0, 4).toUpperCase())}</span></span>`;
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

  function render() {
    if (!cur) return;
    const url = `${PHOTO_URL}#${cur.sid}`;
    const isFile = cur.type === 'file';
    const receiving = isFile ? cur.items.filter(it => it.st === 'down' || it.st === 'check').length : 0;
    const st = cur.err ? `<span class="pd-err">${esc(cur.err)}</span>`
      : cur.expired ? 'Code expiré — cliquez sur « Nouveau code ».'
      : receiving ? `<span class="pd-wait"></span>Réception en cours (${plural(receiving, 'fichier')})`
      : cur.n ? (isFile ? `<b>${plural(cur.n, 'fichier')} reçu${cur.n > 1 ? 's' : ''}</b> — vous pouvez en envoyer d’autres.`
        : `<b>${cur.n} photo${cur.n > 1 ? 's' : ''} reçue${cur.n > 1 ? 's' : ''}</b> — vous pouvez en envoyer d’autres.`)
      : `<span class="pd-wait"></span>${isFile ? 'En attente de fichiers…' : 'En attente d’une photo…'}`;
    const steps = isFile
      ? `<li>Scannez ce QR code avec l’appareil photo de votre téléphone ou tablette.</li><li>Choisissez un ou plusieurs fichiers (PDF, Word, images, audio…).</li><li>Ils arrivent ici, dans « ${esc(cur.title)} ».</li><li>Ce QR code reste valable 30 minutes.</li>`
      : `<li>Scannez ce QR code avec l’appareil photo de votre téléphone.</li><li>Prenez une photo, ou choisissez-la dans la galerie.</li><li>Elle apparaît ici, dans « ${esc(cur.title)} ».</li><li>Ce QR code reste valable 30 minutes.</li>`;
    const list = isFile && cur.items.length ? `<ul class="pd-files" aria-label="Fichiers">${cur.items.map(it => {
      const pct = it.st === 'ok' ? 100 : it.st === 'down' ? Math.round(100 * it.done / Math.max(1, it.chunks)) : 0;
      const lab = it.st === 'ok' ? 'Dans votre bibliothèque' : it.st === 'err' ? esc(it.msg || 'Échec') : it.st === 'down' ? `Réception… ${pct} %` : it.st === 'check' ? 'En attente de réception…' : 'Envoi depuis le téléphone…';
      return `<li class="pd-file ${it.st}">${fileIcon(it.name)}<span class="pd-ftxt"><span class="pd-fname" title="${esc(it.name)}">${esc(it.name)}</span><span class="pd-fst">${lab}${it.size ? ` · ${fmtSize(it.size)}` : ''}</span>${it.st === 'down' || it.st === 'up' || it.st === 'check' ? `<span class="pd-bar${it.st !== 'down' ? ' wait' : ''}"><i style="width:${pct}%"></i></span>` : ''}</span></li>`;
    }).join('')}</ul>` : '';
    cur.panel.className = isFile ? 'files' : '';
    cur.panel.innerHTML = `<div class="pd-head"><b>${isFile ? 'Importer depuis un téléphone ou une tablette' : 'Photo depuis le téléphone'}</b><button class="pd-x" data-pd="close" title="Fermer (le QR code cesse de fonctionner)" aria-label="Fermer : le QR code cessera de fonctionner">✕</button></div>
      <div class="pd-body">
        <div class="pd-qr ${cur.expired || cur.err ? 'off' : ''}">${cur.ready ? qrSvg(url) : '<span class="pd-wait"></span>'}</div>
        <ol class="pd-steps">${steps}</ol>
      </div>${list}
      <div class="pd-status">${st}</div>
      <div class="pd-foot">${cur.expired || cur.err ? '<button class="cta small" data-pd="renew">Nouveau code</button>' : `<button class="cta ghost small" data-pd="copy" title="${esc(url)}">Copier le lien (à ouvrir sur le téléphone)</button>`}</div>`;
  }

  /* ---------------- mode fichier (1.52) ---------------- */
  const sessionRef = sid => firebase.firestore().collection('photodrop').doc(sid);
  const fileRef = (sid, fid) => sessionRef(sid).collection('files').doc(fid);

  /* Fiche envoyée par le téléphone : jamais crue sur parole. Renvoie la fiche nettoyée, ou { err } (message pour l'écran). */
  function validMeta(meta) {
    const m = meta || {};
    const name = cleanName(m.name);
    const ext = extOf(name);
    if (!name || !ext || name === '.' + ext) return { err: 'Type de fichier refusé' };
    if (!knownExt(name)) return { err: `Type de fichier refusé (.${ext})` };   // 1.52 : liste blanche, plus seulement les exécutables
    const size = m.size;
    if (!Number.isInteger(size) || size < 1) return { err: 'Fichier incomplet — renvoyez-le' };
    if (size > MAX_PHONE_FILE) return { err: 'Fichier trop lourd (20 Mo maximum)' };
    const chunks = m.chunks;
    if (!Number.isInteger(chunks) || chunks < 1 || chunks > MAX_CHUNKS || Math.ceil(size / CHUNK) !== chunks) return { err: 'Fichier incomplet — renvoyez-le' };
    return { name, size, chunks, mime: MIME[ext] || '' };
  }
  /* efface fiche et morceaux (un seul lot ; sinon un par un) */
  async function purgeFile(sid, fid, chunks) {
    try {
      const db = firebase.firestore(); const fr = fileRef(sid, fid);
      const n = Math.min(MAX_CHUNKS, Math.max(0, chunks | 0));
      const refs = []; for (let i = 0; i < n; i++) refs.push(fr.collection('chunks').doc(pad4(i)));
      refs.push(fr);
      if (typeof db.batch === 'function') { const b = db.batch(); refs.forEach(r => b.delete(r)); await b.commit(); }
      else await Promise.all(refs.map(r => r.delete()));
    } catch (e) { console.error('Import depuis le téléphone (nettoyage) :', e); }
  }
  /* efface toutes les fiches restantes de la session (celles connues, puis celles listées) */
  async function purgeAll(sid, items) {
    const seen = new Set();
    for (const it of items || []) if (it.fid && !seen.has(it.fid)) { seen.add(it.fid); await purgeFile(sid, it.fid, it.chunks || MAX_CHUNKS); }
    try {
      const col = sessionRef(sid).collection('files');
      if (typeof col.get !== 'function') return;
      const snap = await col.get();
      for (const d of (snap.docs || [])) if (!seen.has(d.id)) { const v = d.data() || {}; await purgeFile(sid, d.id, v.chunks || MAX_CHUNKS); }
    } catch { /* la session a pu disparaître */ }
  }
  /* 1.52 : photos restées dans une session photo (purge au démarrage) */
  async function purgePhotos(sid) {
    try {
      const col = sessionRef(sid).collection('photos');
      if (typeof col.get !== 'function') return;
      const snap = await col.get();
      for (const d of (snap.docs || [])) await col.doc(d.id).delete().catch(() => {});
    } catch { /* */ }
  }
  const findItem = fid => cur ? cur.items.find(it => it.fid === fid) : null;
  function failItem(it, msg) { it.st = 'err'; it.msg = msg; render(); }

  /* 1.52 : ligne d'un fichier annoncé par le téléphone ; au-delà de MAX_FILES, une seule ligne « Limite… » et la fiche est effacée */
  function admit(sid, fid, v) {
    let it = findItem(fid); if (it) return it;
    if (cur.items.length >= MAX_FILES) {
      if (!cur.limit) { cur.limit = true; cur.items.unshift({ fid: '', name: cleanName(v.name) || 'fichier', size: 0, st: 'err', msg: LIMIT_MSG, done: 0, chunks: 0 }); render(); toast(LIMIT_MSG, { duration: 6000 }); }
      purgeFile(sid, fid, v.chunks || MAX_CHUNKS);
      return null;
    }
    it = { fid, name: cleanName(v.name) || 'fichier', size: Number.isInteger(v.size) ? v.size : 0, st: 'up', done: 0, chunks: Number.isInteger(v.chunks) ? v.chunks : 0 };
    cur.items.unshift(it); return it;
  }
  /* fiche « done » : contrôles et réservation SYNCHRONES (deux annonces simultanées ne passent pas toutes deux sous la limite),
     puis réception dans la file d'attente, un fichier à la fois */
  function enqueueFile(sid, fid, meta) {
    const it = admit(sid, fid, meta || {}); if (!it) return;
    if (it.st !== 'up') return;   // déjà en file, reçu ou refusé
    it.st = 'check';
    const v = validMeta(meta);
    it.chunks = v.chunks || 0;
    if (v.err) { failItem(it, v.err); purgeFile(sid, fid, (meta || {}).chunks); return; }
    it.name = v.name; it.size = v.size;
    if (cur.bytes + cur.reserved + v.size > MAX_SESSION) { failItem(it, LIMIT_MSG); toast(LIMIT_MSG, { duration: 6000 }); purgeFile(sid, fid, v.chunks); return; }
    cur.reserved += v.size;
    render();
    const c = cur;
    c.queue = c.queue.then(() => receiveFile(sid, fid, it, v)).catch(e => console.error('Import depuis le téléphone :', e))
      .then(() => { if (c.sid === sid) c.reserved = Math.max(0, c.reserved - v.size); });   // « Nouveau code » remet tout à zéro
  }
  async function receiveFile(sid, fid, it, v) {
    if (!cur || cur.sid !== sid) return;
    if (typeof storageAllows === 'function') {   // quota du compte (js/app.js) AVANT de télécharger
      let allowed = false; try { allowed = await storageAllows(v.size); } catch { allowed = false; }
      if (!cur || cur.sid !== sid) return;
      if (!allowed) { failItem(it, 'Espace de stockage insuffisant'); purgeFile(sid, fid, v.chunks); return; }
    }
    it.st = 'down'; it.done = 0; render();
    try {
      const u8 = new Uint8Array(v.size); let off = 0;
      for (let i = 0; i < v.chunks; i++) {
        const snap = await fileRef(sid, fid).collection('chunks').doc(pad4(i)).get();
        if (!cur || cur.sid !== sid) return;
        const d = snap && snap.exists !== false ? (snap.data() || {}) : null;
        const part = d && d.data && typeof d.data.toUint8Array === 'function' ? d.data.toUint8Array() : null;
        if (!part || !part.length || off + part.length > v.size) throw new Error('incomplet');
        u8.set(part, off); off += part.length;
        it.done = i + 1; render();
      }
      if (off !== v.size) throw new Error('incomplet');
      cur.bytes += v.size;
      const file = new File([u8], v.name, { type: v.mime });
      it.st = 'ok'; cur.n++; render();
      try { cur.onItem(file); } catch (e) { console.error(e); }
    } catch (e) {
      console.error('Import depuis le téléphone :', e);
      failItem(it, 'Fichier incomplet — renvoyez-le');
    }
    purgeFile(sid, fid, v.chunks);
  }
  function listenFiles(sid) {
    cur.unsub = sessionRef(sid).collection('files').onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        if (!cur || cur.sid !== sid || ch.type === 'removed') return;
        const v = ch.doc.data() || {}; const fid = ch.doc.id;
        if (v.done === true) { enqueueFile(sid, fid, v); return; }
        if (!findItem(fid) && admit(sid, fid, v)) render();
      });
    }, e => { console.error('Import depuis le téléphone :', e); if (cur && cur.sid === sid) { cur.err = 'La liaison avec le téléphone a été coupée.'; render(); } });
  }
  function listenPhotos(sid) {
    cur.unsub = sessionRef(sid).collection('photos').onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const v = ch.doc.data() || {};
        ch.doc.ref.delete().catch(() => {});
        const file = dataUrlToFile(v.data, v.name);
        if (!file || !cur || cur.sid !== sid) return;
        cur.n++; render();
        try { cur.onItem(file); } catch (e) { console.error(e); }
      });
    }, e => { console.error('Photo depuis le téléphone :', e); if (cur && cur.sid === sid) { cur.err = 'La liaison avec le téléphone a été coupée.'; render(); } });
  }

  async function start(opts) {
    const db = firebase.firestore();
    const me = AlixoAuth.account();
    const sid = randomId(24);
    cur.sid = sid; cur.ready = false; cur.err = ''; cur.expired = false; cur.items = []; cur.n = 0; cur.bytes = 0; cur.reserved = 0; cur.queue = Promise.resolve(); cur.limit = false; render();
    regAdd(sid, cur.type);   // 1.52 : avant l'écriture, pour qu'une session créée puis abandonnée soit purgée au prochain démarrage
    try {
      await db.collection('photodrop').doc(sid).set({ host: me.uid, title: String(opts.title || 'Document').slice(0, 120), type: cur.type, createdAt: Date.now(), exp: Date.now() + LIFE });
    } catch (e) {
      console.error('Photo depuis le téléphone :', e);
      if (!cur || cur.sid !== sid) return;
      cur.err = e && e.code === 'permission-denied' ? 'Service pas encore activé : les règles Firestore « Photo et fichiers depuis le téléphone » doivent être publiées (npm run rules).' : 'Connexion impossible — vérifiez internet, puis « Nouveau code ».';
      render(); return;
    }
    if (!cur || cur.sid !== sid) { db.collection('photodrop').doc(sid).delete().catch(() => {}); return; }
    cur.ready = true; render();
    clearTimeout(cur.timer);
    cur.timer = setTimeout(() => { if (cur && cur.sid === sid) { cur.expired = true; stopListening(); if (cur.type === 'file') purgeAll(sid, cur.items); render(); } }, LIFE);
    if (cur.type === 'file') listenFiles(sid); else listenPhotos(sid);
  }
  function stopListening() {
    if (!cur) return;
    if (cur.unsub) { try { cur.unsub(); } catch { /* */ } cur.unsub = null; }
    clearTimeout(cur.timer);
  }
  /* efface ce qui reste sur le serveur (fiches, morceaux) puis la session ; l'entrée du registre local n'est retirée qu'une
     fois la session effacée (fenêtre fermée avant la fin : la purge du prochain démarrage s'en charge) */
  function dropSession(sid, type, items) {
    if (!sid || !dbOk()) return;
    const key = regKey();
    const del = () => sessionRef(sid).delete().then(() => regRemove(sid, key), () => {});
    if (type === 'file') purgeAll(sid, items).then(del, del); else del();
  }
  function close() {
    if (!cur) return;
    stopListening();
    clearInterval(cur.beat);
    dropSession(cur.sid, cur.type, cur.items);
    cur.panel.remove();
    cur = null;
  }

  /* fenêtre du QR code ; onItem(file) reçoit chaque photo ou fichier envoyé par le téléphone */
  function openPanel(type, title, onItem) {
    if (!dbOk()) { toast((type === 'file' ? 'L’import depuis un téléphone' : 'La photo depuis le téléphone') + ' demande un compte Alixo connecté (Paramètres › Compte)', { duration: 6000 }); return false; }
    if (cur && cur.type !== type) close();   // 1.52 : une session d'un autre type est remplacée
    if (cur) { cur.onItem = onItem; cur.title = title; render(); return true; }   // une seule session : elle suit le document ou le dossier
    const panel = document.createElement('div');
    panel.id = 'pd-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', type === 'file' ? 'Importer depuis un téléphone ou une tablette' : 'Photo depuis le téléphone');
    document.body.appendChild(panel);
    cur = { type, sid: '', unsub: null, onItem, panel, n: 0, timer: null, title, items: [], ready: false, err: '', expired: false, bytes: 0, reserved: 0, queue: Promise.resolve(), limit: false, beat: 0 };
    cur.beat = setInterval(() => { if (cur && cur.sid) regTouch(cur.sid); }, 30 * 1000);   // 1.52 : « cette session est encore affichée »
    purgeOrphans().catch(() => {});
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-pd]'); if (!b || !cur) return;
      const k = b.dataset.pd;
      if (k === 'close') close();
      else if (k === 'renew') { stopListening(); dropSession(cur.sid, cur.type, cur.items); start(cur); }
      else if (k === 'copy') { const u = `${PHOTO_URL}#${cur.sid}`; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Lien copié — ouvrez-le sur votre téléphone'), () => toast(u, { duration: 8000 })); }
    });
    start(cur);
    return true;
  }
  function open({ title = 'Document', onPhoto } = {}) { return openPanel('photo', title, onPhoto); }
  /* 1.52 : import de fichiers dans un dossier ; onFile(file) reçoit chaque fichier vérifié et assemblé */
  function openFiles({ title = 'Mes cours', onFile } = {}) { return openPanel('file', title, onFile); }

  window.addEventListener('beforeunload', () => { if (cur) close(); });
  schedulePurge();
  window.AlixoPhotoDrop = { open, openFiles, close, isOpen: () => !!cur, purgeOrphans, PHOTO_URL, MAX_PHONE_FILE, CHUNK, MAX_CHUNKS, MAX_FILES };
})();
