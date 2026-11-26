/* ============================================================
   Alixo Share — lecteur d'un lien de partage SANS compte (1.59.0)
   Chargé juste APRÈS js/share.js. Quand personne n'est connecté et que
   l'adresse porte ?join=<code> (ou alixo://join/<code> sur PC), le
   visiteur lit le partage en lecture seule : connexion Firebase anonyme,
   « ticket » linktickets/{uid} = { code, ts }, puis lecture de
   sharelinks/{code} et des sous-collections docs / imgs / files du
   partage (les règles comparent le ticket au code du partage). La fiche
   shares/{sid} elle-même (membres, invitations, e-mail du propriétaire)
   n'est jamais lue. Pour modifier, commenter ou copier, il faut un
   compte : chaque action renvoie à l'écran de connexion, l'adresse garde
   ?join=<code>, et la connexion enchaîne sur AlixoShare.joinByCode
   (rôle du lien, confirmation, adhésion).

   Même interface que window.AlixoShare (façade « guest ») : l'application
   ne distingue le visiteur que par AlixoShare.guest === true.
   Test : scripts/v1590-lienpublic-test.js
   ============================================================ */
'use strict';

window.AlixoShareView = (() => {
  const CODE_RE = /^[A-Za-z0-9]{20}$/;
  const A = window.AlixoAuth;
  const OFF = window.AlixoShare;   // façade « sans compte » de js/share.js (enabled: false, fonctions pures : cleanDoc, readChunks…)
  const KINDS = ['doc', 'folder', 'event', 'file'];
  const kindThe = k => (k === 'folder' ? 'le dossier' : k === 'file' ? 'le fichier' : k === 'event' ? 'l’événement' : 'la séance');
  const tint = () => (typeof DEFAULT_TINT === 'string' ? DEFAULT_TINT : '#4f66e0');
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const denied = err => /permission-denied/.test(String((err && err.code) || ''));

  /* le lecteur n'a de sens que sans compte, avec Firestore et la façade de share.js chargées */
  function available() {
    return !!(A && A.isConfigured && OFF && OFF.enabled === false && typeof OFF.cleanDoc === 'function'
      && window.firebase && firebase.firestore && window.AlixoApp);
  }

  let db = null, uid = '', installed = false;
  /* lien en cours : { code, sid, meta, docs: Map(id → séance), files: Map(id → fiche), unsubs, status, opened, gotDocs, gotFiles, msg } */
  let cur = null;
  const STATUS_LOADING = 'loading', STATUS_READY = 'ready', STATUS_INVALID = 'invalid', STATUS_REVOKED = 'revoked', STATUS_ERROR = 'error';
  /* 1.59.0 : lien créé avant la 1.59 (sharelinks/{code}.anon absent) : il ne s'ouvre qu'avec un compte */
  const STATUS_ACCOUNT = 'account';
  /* information du visiteur (RGPD art. 13, DSA art. 16) : identifiant anonyme, responsabilité de l'auteur du partage, signalement */
  const LEGAL_HTML = '<div class="po-hint shv-legal">Consultation sans compte : Alixo vous attribue un identifiant technique anonyme, sans nom ni e-mail, supprimé au plus tard 30 jours après. Le contenu est publié sous la responsabilité de la personne qui le partage. <a href="https://alixoapp.com/confidentialite.html#lien-sans-compte" target="_blank" rel="noopener">Confidentialité</a> · <a href="mailto:contact@alixoapp.com?subject=Signalement%20d%E2%80%99un%20contenu%20partag%C3%A9">Signaler un contenu</a></div>';

  /* ---------------- ouverture ---------------- */
  async function open(code) {
    code = String(code || '').trim();
    if (!available()) return false;
    if (!CODE_RE.test(code)) { toast('Ce lien de partage n’est pas valide'); return false; }
    if (cur && cur.code === code && cur.status !== STATUS_INVALID && cur.status !== STATUS_ERROR) { AlixoApp.openSharedHome(); return true; }
    stop();
    cur = { code, sid: '', meta: null, docs: new Map(), files: new Map(), unsubs: [], status: STATUS_LOADING, opened: false, gotDocs: false, gotFiles: false, msg: '', tm: null };
    install();
    AlixoApp.openSharedHome();
    try {
      if (!db) db = firebase.firestore();
      const cred = await A.signInAnonymously();
      uid = (cred && cred.user && cred.user.uid) || (A.user() && A.user().uid) || '';
      if (!uid || cur.code !== code) return false;
      /* le ticket d'abord : les règles de lecture du contenu le comparent au code du partage (ts : heure du serveur, exigée) */
      await db.collection('linktickets').doc(uid).set({ code, ts: firebase.firestore.FieldValue.serverTimestamp() });
      const s = await db.collection('sharelinks').doc(code).get();
      if (!cur || cur.code !== code) return false;   // remplacé entre-temps
      const l = s.exists ? s.data() : null;
      if (!l || !OFF.safeId(l.sid)) { fail(STATUS_INVALID, ''); return false; }
      /* lien antérieur à la 1.59 (ou propriétaire n'ayant pas confirmé la consultation sans compte) : les règles refuseraient la
         lecture ; on n'écoute rien et on renvoie vers la connexion */
      if (l.anon !== true) { cur.sid = l.sid; fail(STATUS_ACCOUNT, ''); return false; }
      cur.sid = l.sid;
      cur.meta = { sid: l.sid, title: str(l.title, 200) || 'Partage', owner: str(l.ownerPseudo, 24), role: 'read', kind: KINDS.includes(l.kind) ? l.kind : '', color: tint(), isOwner: false };
      listen();
      return true;
    } catch (err) {
      console.error('Share (lecteur) :', err);
      if (!cur || cur.code !== code) return false;
      const c = String((err && err.code) || '');
      if (c === 'auth/operation-not-allowed') fail(STATUS_ERROR, 'La consultation sans compte n’est pas activée sur le serveur d’Alixo (connexion anonyme). Connectez-vous pour ouvrir ce partage.');
      else if (denied(err)) fail(STATUS_INVALID, '');
      else fail(STATUS_ERROR, (err && err.code === 'unavailable') || !navigator.onLine ? 'Pas de connexion internet.' : 'Le service en ligne n’a pas répondu.');
      return false;
    }
  }
  function fail(status, msg) { if (!cur) return; cur.status = status; cur.msg = msg || ''; clearTimeout(cur.tm); render(); }

  /* ---------------- réception : docs et files du partage (jamais shares/{sid}, ni log, ni presence) ---------------- */
  function listen() {
    const ref = db.collection('shares').doc(cur.sid);
    const onErr = err => { console.error('Share (lecteur, réception) :', err); if (denied(err)) { if (cur && cur.status === STATUS_LOADING && !cur.gotDocs && !cur.gotFiles) { stop(); fail(STATUS_ACCOUNT, ''); } else revoked(); } else fail(STATUS_ERROR, 'Impossible de charger ce partage.'); };
    cur.unsubs.push(ref.collection('docs').onSnapshot(snap => {
      if (!cur) return;
      const next = new Map();
      (snap.docs || []).forEach(s => {
        const id = s.id; if (!OFF.safeId(id)) return;   // identifiant hors format Alixo : ignoré (jamais injecté dans un attribut)
        const raw = s.data(); if (!raw || typeof raw.data !== 'string') return;
        let parsed = null; try { parsed = JSON.parse(raw.data); } catch { return; }
        const d = OFF.cleanDoc(parsed, id, null); if (!d) return;   // même assainissement qu'une séance reçue par un membre
        OFF.stripOriginals(d);
        next.set(id, d);
      });
      const removed = [...cur.docs.keys()].filter(id => !next.has(id));
      cur.docs = next; cur.gotDocs = true;
      afterSnapshot(removed);
    }, onErr));
    cur.unsubs.push(ref.collection('files').onSnapshot(snap => {
      if (!cur) return;
      const next = new Map();
      (snap.docs || []).forEach(s => {
        const id = s.id; if (!OFF.safeId(id)) return;
        const m = s.data(); if (!m || typeof m.name !== 'string' || !m.name || typeof m.chunks !== 'number' || m.chunks < 1) return;
        next.set(id, { id, sid: cur.sid, name: m.name.slice(0, 200), size: typeof m.size === 'number' ? m.size : 0, mime: str(m.mime, 100), folderId: OFF.safeId(m.folderId) ? m.folderId : null, createdAt: m.createdAt || 0, updatedAt: m.updatedAt || 0, chunks: m.chunks });
      });
      cur.files = next; cur.gotFiles = true;
      afterSnapshot([]);
    }, onErr));
    /* sans réponse de l'une des deux écoutes (hors ligne, cache), on ouvre quand même avec ce qu'on a au bout de 6 s */
    cur.tm = setTimeout(() => { if (cur && cur.status === STATUS_LOADING) { cur.gotDocs = cur.gotFiles = true; afterSnapshot([]); } }, 6000);
  }
  function afterSnapshot(removed) {
    if (removed.length) {
      if (removed.includes(currentDocId)) { toast('Cette séance n’est plus partagée'); showLibrary(); }
      openTabs = openTabs.filter(id => !removed.includes(id)); renderTabs();
    }
    if (cur.status === STATUS_LOADING && cur.gotDocs && cur.gotFiles) { cur.status = STATUS_READY; clearTimeout(cur.tm); }
    if (cur.status === STATUS_READY && !cur.opened) { cur.opened = true; autoOpen(); return; }
    render();
  }
  /* une seule séance et aucun fichier : on l'ouvre directement ; sinon la page « Partagés avec moi » à plat */
  function autoOpen() {
    const docs = [...cur.docs.values()];
    if (docs.length === 1 && !cur.files.size && !currentDocId) { openDoc(docs[0].id); return; }
    AlixoApp.openSharedHome(); render();
  }
  function stop() {
    if (!cur) return;
    for (const u of cur.unsubs) { try { u(); } catch { /* déjà coupée */ } }
    cur.unsubs = []; clearTimeout(cur.tm);
  }
  /* le propriétaire a désactivé le lien (les règles refusent désormais la lecture) */
  function revoked() {
    if (!cur) return;
    stop();
    const mine = new Set(cur.docs.keys());
    cur.docs = new Map(); cur.files = new Map();
    cur.status = STATUS_REVOKED;
    openTabs = openTabs.filter(id => !mine.has(id)); renderTabs();
    if (currentDocId && mine.has(currentDocId)) showLibrary();
    AlixoApp.openSharedHome();
    toast('Le propriétaire a désactivé le lien', { duration: 6000 });
  }

  /* ---------------- rendu ---------------- */
  function render() { if (!currentDocId && libMode === 'shared') renderSharedHome(); }
  const accountBtn = (label, cls) => `<button class="cta ${cls || ''}" type="button" data-shv="account">${label}</button>`;
  function renderSharedHome() {
    const root = $('#lib-shared'); if (!root || !cur) return;
    const meta = cur.meta || {};
    const notice = (title, text, retry) => `<div class="sh-section shv-notice"><div class="shv-card"><h3>${title}</h3><p>${text}</p><div class="shv-actions">${retry ? '<button class="cta ghost" type="button" data-shv="retry">Réessayer</button>' : ''}${accountBtn('Se connecter')}</div>${LEGAL_HTML}</div></div>`;
    if (cur.status === STATUS_ACCOUNT) { root.innerHTML = notice('Un compte Alixo est nécessaire', 'Ce partage n’est consultable qu’avec un compte Alixo. Connectez-vous ou créez un compte : vous le rejoindrez avec le droit choisi par son propriétaire.', false); return; }
    if (cur.status === STATUS_INVALID) { root.innerHTML = notice('Ce lien n’est plus valable', 'Le propriétaire l’a désactivé, ou l’adresse est incomplète. Si vous avez un compte Alixo, connectez-vous : les partages que vous avez acceptés sont dans « Partagés avec moi ».', false); return; }
    if (cur.status === STATUS_REVOKED) { root.innerHTML = notice('Le propriétaire a désactivé le lien', 'Ce partage n’est plus consultable par ce lien. Demandez-lui un nouveau lien, ou une invitation sur votre compte Alixo.', false); return; }
    if (cur.status === STATUS_ERROR) { root.innerHTML = notice('Impossible d’ouvrir ce lien', esc(cur.msg || 'Le service en ligne n’a pas répondu.'), true); return; }
    const head = `<div class="sh-section sh-banner"><div class="sh-invite shv-banner"><div class="sh-ico">${esc(((meta.owner || '').trim()[0] || '?').toUpperCase())}</div><div class="sh-txt"><b>${meta.owner ? '@' + esc(meta.owner) : 'Un membre d’Alixo'} partage ${kindThe(meta.kind)} « ${esc(meta.title || '')} »</b><span>Lecture seule · vous consultez sans compte. Pour modifier, commenter ou copier, créez un compte : le lien reste valable.</span></div>${accountBtn('Créer un compte', 'small')}</div></div>`;
    if (cur.status === STATUS_LOADING) { root.innerHTML = head + '<div class="sh-section"><div class="po-hint">Chargement du partage…</div></div>'; return; }
    const docs = [...cur.docs.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const files = [...cur.files.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
    let html = head + '<div class="sh-section">';
    if (!docs.length && !files.length) html += '<div class="sh-empty">Rien à afficher pour l’instant.<br>Le propriétaire doit ouvrir Alixo, connecté, pour envoyer ses séances.</div>';
    if (docs.length) html += `<div class="sh-grid">${docs.map(d => {
      const first = (d.blocks || []).find(b => ['p', 'callout', 'quote', 'li'].includes(b.type));
      const isSl = d.kind === 'slides', isBd = d.kind === 'board', isQz = d.kind === 'quiz', isSh = d.kind === 'sheet';
      const nBd = isBd ? (d.items || []).filter(it => it.t !== 'arrow').length : 0, nQz = isQz ? (d.questions || []).length : 0, nSl = (d.slides || []).length;
      const sub = isSl ? `Présentation · ${nSl} diapositive${nSl > 1 ? 's' : ''}` : isBd ? `Planche · ${nBd} élément${nBd > 1 ? 's' : ''}` : isQz ? `Quiz · ${nQz} question${nQz > 1 ? 's' : ''}` : isSh ? 'Tableur' : esc(first ? stripTags(first.text).slice(0, 140) : '');
      return `<button class="sh-card" data-shdoc="${esc(d.id)}" style="--mc:${esc(tint())}"><h3>${isSl ? SLIDES_ICON : isBd ? BOARD_ICON : isQz ? QUIZ_ICON : ''}${esc(d.titre || 'Sans titre')}</h3><div class="preview" style="font-size:12.5px;color:var(--ink-2)">${sub}</div><div class="meta"><span class="sh-role read">lecture</span>${meta.owner ? `<span>par ${esc(meta.owner)}</span>` : ''}${d.updatedAt ? `<span>${fmtDate(d.updatedAt)}</span>` : ''}</div></button>`;
    }).join('')}</div>`;
    if (files.length) html += `${docs.length ? '<div class="sh-stitle" style="margin-top:14px">Fichiers partagés</div>' : ''}<div class="sh-grid">${files.map(f => `<button class="sh-card sh-filecard" data-shfile="${esc(f.id)}" data-sid="${esc(f.sid)}" style="--mc:${esc(tint())}"><h3>${window.AlixoFiles ? AlixoFiles.iconHTML(f.name) : ''}${esc(f.name)}</h3><div class="preview" style="font-size:12.5px;color:var(--ink-2)">${window.AlixoFiles ? esc(AlixoFiles.fmtSize(f.size)) : ''}</div><div class="meta"><span class="sh-role read">lecture</span>${meta.owner ? `<span>par ${esc(meta.owner)}</span>` : ''}</div></button>`).join('')}</div>`;
    html += LEGAL_HTML + '</div>';
    root.innerHTML = html;
  }
  function onHomeClick(e) {
    if (!cur) return;
    const act = e.target.closest('[data-shv]');
    if (act) {
      /* lien invalide, révoqué ou en erreur : « Se connecter » mène droit à l'écran de connexion ; partage lisible : la boîte « compte nécessaire » */
      if (act.dataset.shv === 'account') { if (cur.status === STATUS_READY || cur.status === STATUS_LOADING) requireAccount(); else A.openAuthOverlay(); }
      else if (act.dataset.shv === 'retry') { const c = cur.code; cur.status = STATUS_ERROR; open(c); }
      return;
    }
    const fbtn = e.target.closest('[data-shfile]');
    if (fbtn) { openSharedFile(fbtn.dataset.sid, fbtn.dataset.shfile); return; }
    const dbtn = e.target.closest('[data-shdoc]');
    if (dbtn && docById(dbtn.dataset.shdoc)) openDoc(dbtn.dataset.shdoc);
  }

  /* ---------------- compte requis ---------------- */
  function requireAccount() {
    const k = cur && cur.meta ? cur.meta.kind : '';
    openDialog({
      id: 'shareov', cls: 'share-dlg narrow', eyebrow: 'Alixo Share',
      title: 'Un compte Alixo est nécessaire',
      sub: 'Vous consultez ce partage sans compte, en lecture seule.',
      body: `<div class="po-hint">Créez un compte ou connectez-vous pour modifier, commenter ou copier ${kindThe(k)} dans votre bibliothèque. Le lien reste ouvert après la connexion : vous rejoindrez le partage avec le droit que son propriétaire a choisi.</div>`,
      foot: '<button class="cta ghost" type="button" data-dlg-close>Plus tard</button><span class="dlg-spacer"></span><button class="cta" id="shv-account" type="button">Créer un compte ou se connecter</button>',
      onMount: (card, close) => { card.querySelector('#shv-account').addEventListener('click', () => { close(); A.openAuthOverlay(); }); }
    });
  }

  /* ---------------- accès pour l'application (même interface qu'AlixoShare) ---------------- */
  function docById(id) { return (cur && cur.docs.get(id)) || null; }
  function infoFor(id) { const d = docById(id); return d && cur.meta ? { sid: cur.sid, title: cur.meta.title, owner: cur.meta.owner, role: 'read', kind: cur.meta.kind || 'doc', color: tint() } : null; }
  function shareMeta(sid) { return cur && cur.meta && sid === cur.sid ? Object.assign({}, cur.meta) : null; }
  function sharedFilesIn(sid) { return cur && sid === cur.sid ? [...cur.files.values()] : []; }
  function sharedFileById(sid, id) { return (cur && sid === cur.sid && cur.files.get(id)) || null; }
  /* image d'une séance du partage (AlixoImages.get) : une data URL image/* seulement */
  async function fetchImage(iid) {
    if (!cur || !cur.sid || !OFF.safeId(iid)) return null;
    try { const s = await db.collection('shares').doc(cur.sid).collection('imgs').doc(iid).get(); const raw = s.exists ? s.data() : null; return raw && OFF.isImageDataUrl(raw.data) ? raw.data : null; }
    catch (err) { if (denied(err)) revoked(); return null; }
  }
  async function fetchFile(sid, id, onProgress) {
    if (!cur || sid !== cur.sid || !OFF.safeId(id)) return null;
    try { return await OFF.readChunks(db.collection('shares').doc(sid).collection('files').doc(id), onProgress); }
    catch (err) { console.error('Share (lecteur, fichier) :', err); if (denied(err)) revoked(); return null; }
  }
  function openSharedFile(sid, id) {
    const f = sharedFileById(sid, id);
    if (!f) { toast('Ce fichier n’est pas disponible'); return; }
    if (!window.AlixoFiles) { toast('Module de fichiers indisponible'); return; }
    AlixoFiles.openShared(f);
  }

  /* la façade remplace window.AlixoShare (OFF) : tout ce que l'application appelle quand `enabled` est vrai existe, en lecture ou sans effet */
  function install() {
    if (installed) return; installed = true;
    document.body.classList.add('guest');
    if (!document.querySelector('meta[name="robots"]')) { const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m); }
    const home = $('#lib-shared'); if (home) { home.addEventListener('click', onHomeClick); home.addEventListener('contextmenu', e => e.preventDefault()); }
    const none = () => {}, nul = () => null, empty = () => [];
    window.AlixoShare = Object.assign({}, OFF, {
      enabled: true, guest: true, code: () => (cur ? cur.code : ''),
      docById, sharedDocs: () => (cur ? [...cur.docs.values()] : []), canWrite: () => false, infoFor, tintFor: nul, labelFor: id => (docById(id) ? 'Partagé' : ''),
      fetchImage, fetchFile, sharedFilesIn, sharedFileById, shareMeta, openSharedFile, renderSharedHome,
      syncStatus: id => (docById(id) ? { state: 'readonly', peers: 0, err: '' } : null),
      peersFor: empty, setPresence: none, noteOpened: none, onLocalSave: none,
      openShared: () => AlixoApp.openSharedHome(),
      openInfo: requireAccount, copyToLibrary: requireAccount, openShareFor: requireAccount, openShareDialog: requireAccount, openShareManager: requireAccount,
      accessFor: nul, sharedFolders: empty, sharedDocsAlone: empty, sharedFolderView: nul, mySharesOf: empty, colorFor: () => '#33658a',
      me: () => ({ uid: '', email: '', name: 'Visiteur' }), setOrg: none, orgShares: empty, invites: empty, pendingCount: () => 0,
      pseudo: () => '', setPseudo: async () => false, ensurePseudo: async () => '', leaveEvent: none, eventDeleted: none,
      setLink: async () => null, inviteDirect: async () => null, afterInvite: none,
      joinByCode: async c => open(c)
    });
  }

  /* 1.59.0 : à la fermeture de l'onglet, le ticket et la session anonyme ne servent plus — effacés au mieux (sans attendre) ;
     le Worker billing purge de toute façon ce qui reste après 7 jours */
  function leave() {
    const u = A.user();
    if (!db || !uid || !u || !u.isAnonymous || u.uid !== uid) return;   // une vraie connexion a remplacé le visiteur : rien à défaire
    try { db.collection('linktickets').doc(uid).delete().catch(() => {}); } catch { /* hors ligne */ }
    try { A.signOutGuest(); } catch { /* déjà déconnecté */ }
  }

  /* ---------------- démarrage : ?join=<code> sans session, ou alixo://join/<code> (PC sans compte) ---------------- */
  if (available()) {
    const code = A.guestCode ? A.guestCode() : '';
    if (code) setTimeout(() => open(code), 0);
    if (window.alixoDesktop && window.alixoDesktop.onDeepLink) window.alixoDesktop.onDeepLink(url => { const j = String(url || '').match(/^alixo:\/\/join\/([A-Za-z0-9]{20})(?:[/?#]|$)/); if (j) open(j[1]); });
    window.addEventListener('pagehide', () => { if (cur && uid) leave(); });
  }

  return { available, open, code: () => (cur ? cur.code : ''), status: () => (cur ? cur.status : '') };
})();
