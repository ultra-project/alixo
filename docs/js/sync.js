/* ============================================================
   Alixo — synchronisation des cours (Cloud Firestore)
   Chargé APRÈS app.js. Miroir du store local :
   - users/{uid}            → dossiers + paramètres (méta ; réglages datés par settingsAt depuis 1.16)
   - users/{uid}/docs/{id}  → une séance par document
   Le contenu est stocké en JSON (champ `data`) pour éviter les
   limites de types Firestore. Conflits : dernière écriture gagne
   (updatedAt). Hors ligne : Firestore met les écritures en file
   et synchronise à la reconnexion.
   ============================================================ */
'use strict';

window.AlixoSync = (() => {
  const A = window.AlixoAuth;
  const app = window.AlixoApp;
  if (!A || !A.isConfigured || !A.account() || !app || window.ALIXO_AUX) {   // 1.35 : un volet de l'écran partagé (1.45 : ou une fenêtre de document) ne synchronise pas (la fenêtre principale le fait)
    return { enabled: false, onLocalSave() {}, status: () => 'inactif' };
  }

  const uid = A.account().uid;
  const db = firebase.firestore();
  try { db.enablePersistence({ synchronizeTabs: false }).catch(() => {}); } catch { /* déjà actif */ }

  const userRef = db.collection('users').doc(uid);
  const docsRef = userRef.collection('docs');
  const imgsRef = userRef.collection('imgs');   // images des cours : une entrée par image (data URL)

  let lastPushedDocs = new Map();   // id → JSON poussé (ou reçu) — évite les échos
  const cloudIds = new Set();       // séances connues dans le nuage
  let lastPushedMeta = '';
  const tombstoned = (kind, id, since) => app.isTombstoned ? app.isTombstoned(kind, id, since || 0) : false;
  let pushTm = null;
  let started = false;
  let statusTxt = 'connexion…';

  const docJson = d => JSON.stringify(d);
  const metaJson = () => JSON.stringify({ folders: app.state.folders, settings: app.state.settings, settingsAt: +app.state.settingsAt || 0, events: app.state.events || [], todos: app.state.todos || [], todoCats: app.state.todoCats || [] });

  /* ---------------- images (users/{uid}/imgs/{id}) ---------------- */
  const pendingImgs = [];
  async function pushImage(id, data) {
    if (!started) { pendingImgs.push([id, data]); return; }
    try { await imgsRef.doc(id).set({ ts: Date.now(), data }); }
    catch (err) { console.error('Sync (image) :', err); }
  }
  /* 1.55 : suppression d'une image du compte (ancienne bannière de dossier) ; avant le démarrage, mise en file */
  const pendingDels = [];
  async function deleteImage(id) {
    if (!id) return;
    if (!started) { pendingDels.push(id); return; }
    try { await imgsRef.doc(id).delete(); }
    catch (err) { console.error('Sync (image) :', err); }
  }
  /* 1.54 : seule une data URL image/* en base64 est acceptée (défense contre une donnée corrompue ou hostile dans le nuage) */
  const isImageDataUrl = v => typeof v === 'string' && v.length < 40 * 1024 * 1024 && /^data:image\/(png|jpe?g|gif|webp|bmp|avif);base64,[A-Za-z0-9+/=]+$/.test(v);
  async function fetchImage(id) {
    try { const snap = await imgsRef.doc(id).get(); const raw = snap.exists ? snap.data() : null; return raw && isImageDataUrl(raw.data) ? raw.data : null; }
    catch (err) { console.error('Sync (image) :', err); return null; }
  }

  /* ---------------- envoi (débouncé après chaque save local) ---------------- */
  function schedulePush() {
    clearTimeout(pushTm);
    pushTm = setTimeout(push, 1200);
  }

  function push() {
    if (!started) return;
    try {
      const batch = db.batch();
      let n = 0;
      const seen = new Set();
      for (const d of app.state.docs) {
        if (app.isLocalOnly && app.isLocalOnly(d)) continue;   // 1.38 : document .alx du disque sans « Sauvegarde en ligne » : jamais dans le nuage
        seen.add(d.id);
        const j = docJson(d);
        if (lastPushedDocs.get(d.id) === j) continue;
        batch.set(docsRef.doc(d.id), { updatedAt: d.updatedAt || Date.now(), data: j });
        lastPushedDocs.set(d.id, j);
        n++;
      }
      for (const id of [...lastPushedDocs.keys()]) {
        if (!seen.has(id)) { batch.delete(docsRef.doc(id)); lastPushedDocs.delete(id); n++; }
      }
      // séances supprimées localement dont le nuage a encore une copie (suppression faite hors ligne…)
      const tombs = (app.state.deleted && app.state.deleted.docs) || {};
      for (const id of Object.keys(tombs)) {
        if (!seen.has(id) && cloudIds.has(id)) { batch.delete(docsRef.doc(id)); cloudIds.delete(id); lastPushedDocs.delete(id); n++; }
      }
      const mj = metaJson();
      if (mj !== lastPushedMeta) {
        batch.set(userRef, { updatedAt: Date.now(), meta: mj, schema: 1 }, { merge: true });
        lastPushedMeta = mj;
        n++;
      }
      if (n) batch.commit().catch(err => console.error('Sync (envoi) :', err));
    } catch (err) { console.error('Sync (envoi) :', err); }
  }

  /* 1.56.0 (sécurité) : une séance reçue de users/{uid}/docs (autre appareil, serveur MCP) est réassainie avant d'atteindre
     l'écran — AlixoSanitize.doc, identifiants CONSERVÉS (fusion bloc par bloc), autres champs du compte gardés (keepMeta) ;
     les champs propres à CET appareil (fichier .alx lié, fichiers du lecteur) ne sont jamais repris du nuage : ceux de la
     copie locale restent. Présentations : AlixoSlides.normalize ; tableurs, planches, quiz : tels quels (pas d'assainisseur
     dédié). → séance sûre, ou null (ignorée). */
  const WHOLE_KINDS = ['slides', 'sheet', 'board', 'quiz'];
  const DEVICE_KEYS = ['alxFile', 'files'];
  function cleanRemote(remote) {
    if (!remote || typeof remote !== 'object' || Array.isArray(remote) || typeof remote.id !== 'string') return null;
    const local = app.state.docs.find(d => d.id === remote.id) || null;
    let out = remote;
    if (WHOLE_KINDS.includes(remote.kind)) {
      if (remote.kind === 'slides' && window.AlixoSlides && AlixoSlides.normalize) { try { out = AlixoSlides.normalize(remote) || remote; } catch (err) { console.error('Sync (normalisation) :', err); return null; } }
    } else {
      const AS = window.AlixoSanitize;
      if (!AS || typeof AS.doc !== 'function') return null;
      try { out = AS.doc(remote, { keepIds: true, keepMeta: true }); } catch (err) { console.error('Sync (assainissement) :', err); return null; }
      if (out.id !== remote.id) return null;   // identifiant hors format : ignorée
    }
    for (const k of DEVICE_KEYS) { delete out[k]; if (local && local[k] !== undefined) out[k] = JSON.parse(JSON.stringify(local[k])); }
    return out;
  }

  /* ---------------- réception (temps réel) ---------------- */
  function listen() {
    docsRef.onSnapshot(snap => {
      const upserts = [];
      const removed = [];
      snap.docChanges().forEach(ch => {
        if (ch.doc.metadata.hasPendingWrites) return;         // écho de nos propres écritures
        const id = ch.doc.id;
        if (ch.type === 'removed') {
          if (lastPushedDocs.get(id) !== undefined) { lastPushedDocs.delete(id); removed.push(id); }
          return;
        }
        const raw = ch.doc.data();
        if (!raw || !raw.data) return;
        cloudIds.add(id);
        if (lastPushedDocs.get(id) === raw.data) return;      // déjà à jour
        let remote; try { remote = JSON.parse(raw.data); } catch { return; }
        if (tombstoned('docs', id, remote.updatedAt || 0)) { schedulePush(); return; }   // supprimée ici : on ne la reprend pas
        const local = app.state.docs.find(d => d.id === id);
        if (local && (local.updatedAt || 0) > (remote.updatedAt || 0)) return; // le local est plus récent
        if (remote && typeof remote === 'object') remote.id = id;
        const clean = cleanRemote(remote);
        if (!clean) return;
        lastPushedDocs.set(id, docJson(clean));   // version assainie : pas de renvoi tant qu'elle n'est pas modifiée ici
        upserts.push(clean);
      });
      if (upserts.length || removed.length) app.applyRemoteDocs(upserts, removed);
      statusTxt = 'synchronisé';
    }, err => { console.error('Sync (réception) :', err); statusTxt = 'erreur — voir console'; });

    userRef.onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return;
      const raw = snap.data();
      if (!raw || !raw.meta || raw.meta === lastPushedMeta) return;
      let meta; try { meta = JSON.parse(raw.meta); } catch { return; }
      lastPushedMeta = raw.meta;
      app.applyRemoteMeta(meta.folders || [], meta.settings || null, Array.isArray(meta.events) ? meta.events : undefined, { todos: meta.todos, todoCats: meta.todoCats, settingsAt: +meta.settingsAt || 0 });
    }, err => console.error('Sync (méta) :', err));
  }

  /* ---------------- démarrage : fusion initiale ---------------- */
  (async () => {
    try {
      // photo du nuage (cache local Firestore si hors ligne)
      const [metaSnap, docsSnap] = await Promise.all([userRef.get(), docsRef.get()]);

      const remoteDocs = [];
      docsSnap.forEach(s => {
        const raw = s.data();
        if (raw && raw.data) { try { remoteDocs.push({ id: s.id, json: raw.data, d: JSON.parse(raw.data) }); } catch { } }
      });

      const upserts = [];
      for (const r of remoteDocs) {
        cloudIds.add(r.id);
        if (tombstoned('docs', r.id, r.d.updatedAt || 0)) continue;   // supprimée ici : sera effacée du nuage au push
        const local = app.state.docs.find(d => d.id === r.id);
        if (!local || (r.d.updatedAt || 0) > (local.updatedAt || 0)) {
          if (r.d && typeof r.d === 'object') r.d.id = r.id;
          const clean = cleanRemote(r.d);
          if (clean) { upserts.push(clean); lastPushedDocs.set(r.id, docJson(clean)); continue; }
        }
        lastPushedDocs.set(r.id, r.json);
      }
      // docs locaux absents du nuage → seront poussés par le premier push()
      const metaRaw = metaSnap.exists ? metaSnap.data() : null;
      if (metaRaw && metaRaw.meta) {
        try {
          const meta = JSON.parse(metaRaw.meta);
          lastPushedMeta = metaRaw.meta;
          const localFolderIds = new Set(app.state.folders.map(f => f.id));
          const newFolders = (meta.folders || []).filter(f => !localFolderIds.has(f.id) && !tombstoned('folders', f.id, f.updatedAt || 0));
          const localEv = app.state.events || [];
          const newEvents = (meta.events || []).filter(e => !localEv.some(x => x.id === e.id));
          // tâches : union par id (le plus récent gagne)
          const mergeById = (loc, rem) => { const m = new Map((loc || []).map(x => [x.id, x])); for (const r of rem || []) { const l = m.get(r.id); if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) m.set(r.id, r); } return [...m.values()]; };
          const todos = Array.isArray(meta.todos) ? mergeById(app.state.todos, meta.todos) : undefined;
          const todoCats = Array.isArray(meta.todoCats) ? mergeById(app.state.todoCats, meta.todoCats) : undefined;
          // réglages (1.16) : ceux du nuage ne s'appliquent que s'ils sont datés et plus récents que ceux de cet appareil
          const remoteAt = +meta.settingsAt || 0;
          const settings = meta.settings && remoteAt > (+app.state.settingsAt || 0) ? meta.settings : null;
          if (newFolders.length || upserts.length || newEvents.length || todos || todoCats || settings) app.applyRemoteMeta([...app.state.folders, ...newFolders], settings, newEvents.length ? [...localEv, ...newEvents] : undefined, { todos, todoCats, settingsAt: remoteAt });
        } catch { }
      }
      if (upserts.length) app.applyRemoteDocs(upserts, []);

      started = true;
      push();          // pousse ce que le nuage n'a pas
      while (pendingImgs.length) { const [id, data] = pendingImgs.shift(); pushImage(id, data); }
      while (pendingDels.length) deleteImage(pendingDels.shift());
      listen();
      if (app.maybeOnboard) app.maybeOnboard();   // questionnaire de bienvenue si profil absent
    } catch (err) {
      console.error('Sync (démarrage) :', err);
      statusTxt = 'hors ligne';
      started = true;
      while (pendingImgs.length) { const [id, data] = pendingImgs.shift(); pushImage(id, data); }
      while (pendingDels.length) deleteImage(pendingDels.shift());
      listen();
      if (app.maybeOnboard) app.maybeOnboard();
    }
  })();

  return {
    enabled: true,
    onLocalSave: schedulePush,
    status: () => statusTxt,
    pushImage,
    fetchImage,
    deleteImage
  };
})();
