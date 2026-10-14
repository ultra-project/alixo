/* ============================================================
   Alixo Business (1.32) — une entreprise, ses employés, ses licences Alixo+
   - orgs/{orgId}                  → { name, ownerUid, ownerEmail, ownerName, plan: 'basic', seats: 10, plusSeats: 5, code, disabled, by, createdAt }
   - orgs/{orgId}/members/{uid}    → { uid, name, email, emailLower, nameLower, role: owner | mod | member, plus, joinedAt, lastSeen, online, code }
   - orgs/{orgId}/requests/{id}    → demandes de partage vers l'extérieur de l'entreprise, décidées par un modérateur
   - orgcodes/{code}               → { orgId, name } : résolution d'un code d'invitation
   - profiles/{uid}.org            → { id, name, role } : l'entreprise du compte (lu au démarrage)
   - plans/{uid}                   → { plus: true, by: 'business', orgId, … } : licence Alixo+ attribuée par l'entreprise
   Règles : firestore.rules (§ Alixo Business). Le dirigeant (celui qui a souscrit) gère les licences, invite par code,
   nomme des modérateurs ; les employés rejoignent avec un NOUVEAU compte (code saisi à l'inscription) ; chaque employé
   retrouve un collègue par son nom (4 lettres au moins) ; un partage vers une personne extérieure attend l'accord d'un
   modérateur. Paramètres › Entreprise. Chargé APRÈS app.js, share.js, cloudconfig.js.
   La couche de données (`store`) est remplaçable (window.ALIXO_BUSINESS_FAKE) pour les tests sans Firestore.
   ============================================================ */
'use strict';

window.AlixoBusiness = (() => {
  const A = window.AlixoAuth;
  const acc = A && A.isConfigured && A.account();
  const JOIN_LS = 'alixo.joinCode';
  const SEATS = { seats: 10, plusSeats: 5 };
  const BUSINESS_URL = 'https://alixoapp.com/docs/business/';   // 1.33 : tableau de bord en ligne (app/business/) ; business.alixoapp.com une fois le sous-domaine posé : config/public.businessUrl (panneau admin)
  const ONLINE_MS = 5 * 60000;
  const MIN_SEARCH = 4;
  const ICO = {
    building: '<svg viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M14 9h5a1 1 0 0 1 1 1v11"/><path d="M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M17 13h1M17 17h1"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>'
  };
  const fake = window.ALIXO_BUSINESS_FAKE || null;
  if (!acc && !fake) return { enabled: false, active: () => false, chatOn: () => false, dashUrl: () => BUSINESS_URL, orgId: () => '', isMember: () => false, isMod: () => false, settingsHTML: () => '', bindSettings() {}, offerHTML: () => '', colleagues: () => [], gate: () => 'free', attachSearch() {}, request: async () => null, ICO };

  const me = fake ? fake.me : { uid: acc.uid, email: (acc.email || '').toLowerCase(), name: acc.name || (acc.email || '').split('@')[0] };
  const uid = me.uid;
  const now = () => Date.now();
  const norm = s => String(s || '').trim().toLowerCase();
  const genCode = () => { const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const g = () => Array.from({ length: 4 }, () => AL[Math.floor(Math.random() * AL.length)]).join(''); return `ALXB-${g()}-${g()}`; };
  const fmtWhen = ts => (ts ? new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const initial = s => (s || '?').trim()[0].toUpperCase();

  /* ============================================================
     Couche de données : Firestore, ou un double en mémoire (tests)
     ============================================================ */
  function firestoreStore() {
    const db = firebase.firestore();
    const FV = firebase.firestore.FieldValue;
    const orgs = db.collection('orgs');
    const profRef = db.collection('profiles').doc(uid);
    const onErr = tag => err => { if (!/permission|insufficient/i.test(String(err && err.message))) console.error('Business (' + tag + ') :', err); };
    return {
      listenProfile: cb => profRef.onSnapshot(s => cb(s.exists ? s.data() : null), onErr('profil')),
      listenOrg: (oid, cb) => orgs.doc(oid).onSnapshot(s => cb(s.exists ? Object.assign({ id: s.id }, s.data()) : null), err => { onErr('entreprise')(err); cb(null); }),
      listenMembers: (oid, cb) => orgs.doc(oid).collection('members').onSnapshot(s => cb(s.docs.map(d => Object.assign({ uid: d.id }, d.data()))), onErr('membres')),
      listenRequests: (oid, cb) => orgs.doc(oid).collection('requests').where('state', '==', 'pending').onSnapshot(s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), onErr('demandes')),
      listenMyRequests: (oid, cb) => orgs.doc(oid).collection('requests').where('by', '==', uid).onSnapshot(s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), onErr('mes demandes')),
      resolveCode: async code => { const s = await db.collection('orgcodes').doc(code).get(); return s.exists ? s.data() : null; },
      join: async (oid, code) => {
        const member = { uid, name: me.name, email: me.email, emailLower: me.email, nameLower: norm(me.name), role: 'member', plus: false, code, joinedAt: now(), lastSeen: now(), online: true };
        await orgs.doc(oid).collection('members').doc(uid).set(member);
        return member;
      },
      setProfileOrg: o => profRef.set({ org: o || FV.delete() }, { merge: true }),
      beat: oid => orgs.doc(oid).collection('members').doc(uid).set({ lastSeen: now(), online: true, name: me.name, nameLower: norm(me.name), version: window.AlixoApp ? AlixoApp.version : '', platform: window.alixoDesktop ? 'desktop' : 'web' }, { merge: true }),
      setRole: (oid, muid, role) => orgs.doc(oid).collection('members').doc(muid).update({ role, updatedAt: now() }),
      setPlus: async (oid, m, on, orgName) => {
        await orgs.doc(oid).collection('members').doc(m.uid).update({ plus: !!on, plusAt: now(), updatedAt: now() });
        const ref = db.collection('plans').doc(m.uid);
        if (on) await ref.set({ plus: true, until: 0, since: now(), updatedAt: now(), by: 'business', orgId: oid, note: 'Alixo Business — ' + orgName, email: m.email || '' });
        else await ref.set({ plus: false, until: 0, since: 0, endedAt: now(), updatedAt: now(), by: 'business', orgId: oid, note: 'Alixo Business — ' + orgName, email: m.email || '' });
      },
      removeMember: (oid, muid) => orgs.doc(oid).collection('members').doc(muid).delete(),
      updateOrg: (oid, patch) => orgs.doc(oid).update(Object.assign({ updatedAt: now() }, patch)),
      setCode: async (oid, code, name, oldCode) => {
        await db.collection('orgcodes').doc(code).set({ orgId: oid, name, createdAt: now(), by: uid });
        await orgs.doc(oid).update({ code, codeAt: now(), updatedAt: now() });
        if (oldCode) { try { await db.collection('orgcodes').doc(oldCode).delete(); } catch { /* déjà retiré */ } }
      },
      createRequest: async (oid, r) => { const ref = await orgs.doc(oid).collection('requests').add(Object.assign({ by: uid, byName: me.name, byEmail: me.email, state: 'pending', createdAt: now() }, r)); return ref.id; },
      decideRequest: (oid, rid, state) => orgs.doc(oid).collection('requests').doc(rid).update({ state, decidedBy: uid, decidedByName: me.name, decidedAt: now(), updatedAt: now() }),
      doneRequest: (oid, rid) => orgs.doc(oid).collection('requests').doc(rid).update({ state: 'done', doneAt: now(), updatedAt: now() }),
      shareToOrg: (sid, oid) => db.collection('shares').doc(sid).update({ org: oid || FV.delete(), updatedAt: now() }),
      /* 1.33 : vitrine de l'entreprise (photo, bannière, description), modifiée sur le tableau de bord en ligne */
      listenBrand: (oid, cb) => orgs.doc(oid).collection('brand').doc('profile').onSnapshot(s => cb(s.exists ? s.data() : null), err => { onErr('vitrine')(err); cb(null); }),
      /* 1.33 : messagerie d'équipe — convs/{all | dm_<uid>_<uid>} et convs/{cid}/msgs/{id} */
      listenConvs: (oid, cb) => orgs.doc(oid).collection('convs').where('parts', 'array-contains', uid).onSnapshot(s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), onErr('conversations')),
      listenConvAll: (oid, cb) => orgs.doc(oid).collection('convs').doc('all').onSnapshot(s => cb(s.exists ? Object.assign({ id: 'all' }, s.data()) : null), onErr('conversation d’équipe')),
      listenMsgs: (oid, cid, cb) => orgs.doc(oid).collection('convs').doc(cid).collection('msgs').orderBy('at', 'desc').limit(80).onSnapshot(s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data())).reverse()), onErr('messages')),
      sendMsg: async (oid, cid, parts, text) => {
        const conv = orgs.doc(oid).collection('convs').doc(cid);
        const m = { by: uid, byName: me.name, text, at: now() };
        await conv.collection('msgs').add(m);
        await conv.set({ parts, lastAt: m.at, lastBy: uid, lastByName: me.name, lastText: text.slice(0, 140) }, { merge: true });
      }
    };
  }
  const store = fake || firestoreStore();

  /* ============================================================
     État
     ============================================================ */
  let profile = null, org = null, members = [], requests = [], myRequests = [], brand = null;
  let orgId = '', unsubs = [], beatTm = 0, started = false;
  const myMember = () => members.find(m => m.uid === uid) || null;
  const role = () => (org && org.ownerUid === uid ? 'owner' : (myMember() || {}).role || '');
  const active = () => !!(org && orgId && !org.disabled && (role() === 'owner' || myMember()));
  const isMod = () => active() && (role() === 'owner' || role() === 'mod');
  const seats = () => ({ seats: +(org && org.seats) || SEATS.seats, plusSeats: +(org && org.plusSeats) || SEATS.plusSeats });
  const plusUsed = () => members.filter(m => m.plus || m.role === 'owner').length;
  const isOnline = m => !!m.lastSeen && now() - m.lastSeen < ONLINE_MS;
  const chatOn = () => active() && org.chat === true;   // 1.33 : option messagerie (entreprises de 50 employés et plus), activée par Alixo
  const emailIsMember = email => members.some(m => m.emailLower === norm(email) || m.email === norm(email));

  function refreshUI() {
    if (typeof applyAppLogo === 'function') applyAppLogo();
    const ov = $('#setov'); if (ov && !ov.hidden && typeof settingsCat !== 'undefined' && (settingsCat === 'business' || settingsCat === 'plus')) renderSettingsBody();
    if (window.AlixoShare && AlixoShare.enabled && AlixoShare.setOrg) AlixoShare.setOrg(active() ? orgId : '');
    if (window.AlixoBizChat) AlixoBizChat.sync();
    const ln = $('#ln-biz'); if (ln) { ln.hidden = !active(); const n = isMod() ? requests.length : 0; const b = ln.querySelector('.ln-badge'); if (b) { b.textContent = n; b.hidden = !n; } }
  }
  function stopOrg() { unsubs.forEach(u => { try { u(); } catch { /* */ } }); unsubs = []; clearInterval(beatTm); beatTm = 0; org = null; members = []; requests = []; myRequests = []; brand = null; }
  function startOrg(oid) {
    if (!oid || oid === orgId) return;
    stopOrg(); orgId = oid;
    unsubs.push(store.listenOrg(oid, o => {
      org = o;
      if (!o) { /* entreprise supprimée ou retirée : on oublie */ stopOrg(); orgId = ''; store.setProfileOrg(null).catch(() => {}); refreshUI(); return; }
      refreshUI();
    }));
    unsubs.push(store.listenMembers(oid, ms => {
      members = ms;
      if (org && org.ownerUid !== uid && !ms.some(m => m.uid === uid)) { /* retiré de l'entreprise */ toast('Vous ne faites plus partie de ' + (org.name || 'l’entreprise')); stopOrg(); orgId = ''; store.setProfileOrg(null).catch(() => {}); refreshUI(); return; }
      refreshUI();
    }));
    unsubs.push(store.listenRequests(oid, rs => { requests = rs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); refreshUI(); if (isMod() && rs.length && window.AlixoNotify) rs.forEach(r => AlixoNotify.push({ id: 'bizreq_' + r.id, kind: 'share', title: 'Demande de partage vers l’extérieur', text: `${r.byName || r.byEmail} veut partager « ${r.title} » avec ${r.to}. À valider sur le tableau de bord Alixo Business (Paramètres › Entreprise).`, action: { type: 'settings', cat: 'business' } })); }));
    unsubs.push(store.listenMyRequests(oid, rs => { myRequests = rs; onMyRequests(rs); }));
    if (store.listenBrand) unsubs.push(store.listenBrand(oid, b => { brand = b; refreshUI(); }));
    beatTm = setInterval(() => { if (active() && !document.hidden) store.beat(oid).catch(() => {}); }, 120000);
    store.beat(oid).catch(() => {});
  }
  /* une demande approuvée : le demandeur (propriétaire du partage) envoie l'invitation lui-même */
  const handled = new Set();
  async function onMyRequests(rs) {
    for (const r of rs) {
      if (r.state === 'denied' && !handled.has(r.id + ':d')) { handled.add(r.id + ':d'); toast(`Partage de « ${r.title} » avec ${r.to} refusé par ${r.decidedByName || 'un modérateur'}`, { duration: 8000 }); store.doneRequest(orgId, r.id).catch(() => {}); }
      if (r.state !== 'approved' || handled.has(r.id)) continue;
      handled.add(r.id);
      try {
        if (window.AlixoShare && AlixoShare.enabled && AlixoShare.inviteDirect) { const inv = await AlixoShare.inviteDirect(r.sid, r.to, r.role); if (inv && AlixoShare.afterInvite) AlixoShare.afterInvite(r.sid, inv); }
        toast(`Partage avec ${r.to} autorisé par ${r.decidedByName || 'un modérateur'} : invitation envoyée`, { duration: 8000 });
      } catch (e) { toast('Partage autorisé, mais l’invitation a échoué : ' + (e && e.message)); }
      store.doneRequest(orgId, r.id).catch(() => {});
    }
  }

  /* ---------------- rejoindre avec le code saisi à l'inscription ---------------- */
  async function joinPending() {
    let code = ''; try { code = localStorage.getItem(JOIN_LS) || ''; } catch { /* */ }
    if (!code) return;
    try { localStorage.removeItem(JOIN_LS); } catch { /* */ }
    const r = await joinByCode(code);
    if (r.ok) toast(`Bienvenue chez ${r.name} !`, { duration: 8000 }); else toast('Entreprise : ' + r.msg, { duration: 10000 });
  }
  async function joinByCode(raw) {
    const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return { ok: false, msg: 'Code vide.' };
    if (orgId) return { ok: false, msg: 'Ce compte fait déjà partie d’une entreprise.' };
    let info = null; try { info = await store.resolveCode(code); } catch { info = null; }
    if (!info || !info.orgId) return { ok: false, msg: 'Code d’entreprise inconnu ou périmé.' };
    try { await store.join(info.orgId, code); } catch (e) {
      return { ok: false, msg: /permission|insufficient/i.test(String(e && e.message)) ? 'Ce code ne peut être utilisé qu’avec un compte créé pour l’entreprise (pas un compte personnel existant), et tant que l’entreprise est active.' : (e && e.message || 'impossible') };
    }
    await store.setProfileOrg({ id: info.orgId, name: info.name || '', role: 'member' }).catch(() => {});
    startOrg(info.orgId);
    return { ok: true, name: info.name || 'l’entreprise' };
  }

  /* ---------------- recherche d'un collègue (4 lettres au moins) ---------------- */
  function colleagues(q) {
    const s = norm(q);
    if (!active() || s.length < MIN_SEARCH) return [];
    return members.filter(m => m.uid !== uid && ((m.nameLower || norm(m.name)).includes(s) || (m.emailLower || '').includes(s))).sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 8);
  }
  /* champ de saisie du partage : liste déroulante des collègues ; onPick(member) */
  function attachSearch(input, onPick) {
    if (!active() || !input) return;
    let box = null;
    const close = () => { if (box) { box.remove(); box = null; } };
    const render = () => {
      const list = colleagues(input.value);
      const q = norm(input.value);
      if (!q || q.includes('@') && !list.length) { close(); return; }
      if (!box) { box = document.createElement('div'); box.className = 'biz-sugg'; input.parentElement.appendChild(box); }
      box.innerHTML = q.length < MIN_SEARCH ? `<div class="biz-sugg-hint">Tapez au moins ${MIN_SEARCH} lettres du nom d’un collègue${org ? ' de ' + esc(org.name) : ''}.</div>`
        : list.length ? list.map(m => `<button type="button" data-pick="${esc(m.uid)}"><span class="biz-av ${isOnline(m) ? 'on' : ''}">${esc(initial(m.name || m.email))}</span><span class="biz-sn"><b>${esc(m.name || m.email)}</b><small>${esc(m.email)}${m.role === 'owner' ? ' · dirigeant' : m.role === 'mod' ? ' · modérateur' : ''}</small></span></button>`).join('')
        : `<div class="biz-sugg-hint">Aucun collègue ne correspond. Une adresse extérieure à l’entreprise devra être validée par un modérateur.</div>`;
      box.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); const m = members.find(x => x.uid === b.dataset.pick); if (m) { input.value = m.email; onPick && onPick(m); } close(); }));
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('blur', () => setTimeout(close, 150));
    render();
  }
  /* porte du partage : 'free' (pas d'entreprise), 'member' (collègue), 'mod' (je décide), 'external' (accord requis) */
  function gate(email) {
    if (!active()) return 'free';
    if (emailIsMember(email)) return 'member';
    return isMod() ? 'mod' : 'external';
  }
  async function request(r) { if (!active()) throw new Error('Pas d’entreprise'); return store.createRequest(orgId, r); }

  /* ============================================================
     Paramètres › Entreprise
     ============================================================ */
  function offerHTML() {
    const b = (typeof billingOffer !== 'undefined' && billingOffer && billingOffer.business) || null;
    const price = b ? `${fmtMoney(b.amount, b.currency)} par ${b.interval === 'year' ? 'an' : 'mois'}` : '';
    return `<div class="biz-offer"><img src="logo-business.png" alt=""><div><b>Alixo Business</b><span>Pour une entreprise : jusqu’à <b>10 employés</b>, dont <b>5 licences Alixo+</b>, un espace d’équipe, le partage par simple recherche d’un collègue, et des modérateurs pour les partages vers l’extérieur.${price ? ` <b>${esc(price)}</b>, sans engagement.` : ''}</span></div>
      ${b ? '<button class="cta biz-cta" type="button" id="biz-buy">Souscrire</button>' : `<a class="cta ghost" href="mailto:contact@alixoapp.com?subject=Alixo%20Business" target="_blank" rel="noopener">Nous contacter</a>`}</div>`;
  }
  /* 1.33 : la gestion de l'entreprise (équipe, licences, rôles, invitations, demandes, vitrine) se fait sur le tableau de
     bord en ligne (BUSINESS_URL). Ici : la fiche de l'entreprise, le lien vers le tableau de bord, la messagerie, les dossiers
     partagés à toute l'entreprise et « Quitter ». */
  function dashUrl() { const c = window.AlixoCloud && AlixoCloud.publicConfig ? AlixoCloud.publicConfig() : null; return (c && c.businessUrl) || BUSINESS_URL; }
  function openDashboard() { const u = dashUrl() + (orgId ? '?org=' + encodeURIComponent(orgId) : ''); if (typeof openExternalUrl === 'function') openExternalUrl(u); else window.open(u, '_blank', 'noopener'); }
  function settingsHTML() {
    const dashBtn = `<button class="cta biz-dash" type="button" id="biz-dash">${ICO.building}Ouvrir le tableau de bord Alixo Business<svg class="ext" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></button>`;
    if (!active()) {
      return `<div class="set-sect">${offerHTML()}</div>
        <div class="set-sect"><div class="po-label">Rejoindre une entreprise</div>
        <div class="po-hint" style="margin:0">Votre employeur vous a remis un <b>code d’entreprise</b> ? Il se saisit <b>à la création d’un nouveau compte</b> (écran de connexion › Créer un compte › Code entreprise) : les comptes personnels existants ne rejoignent pas une entreprise, pour garder séparés les cours personnels et le travail.${orgId && org && org.disabled ? '<br><br><b>Votre entreprise est suspendue</b> : contactez votre dirigeant.' : ''}</div></div>
        <div class="set-sect"><div class="po-label">Vous dirigez une entreprise ?</div><div class="po-hint" style="margin:0 0 10px">L’équipe, les licences Alixo+, les invitations et la personnalisation se gèrent sur le tableau de bord en ligne, <b>${esc(dashUrl().replace(/^https?:\/\//, '').replace(/\/$/, ''))}</b>.</div>${dashBtn}</div>`;
    }
    const r = role(); const S = seats(); const used = plusUsed();
    const online = members.filter(isOnline).length;
    const B = brand || {};
    const card = `<div class="set-sect"><div class="biz-card" style="--bz:${esc(B.accent || '#2e8b6a')}">
        <div class="biz-banner"${B.banner ? ` style="background-image:url('${esc(B.banner)}')"` : ''}></div>
        <div class="biz-cardin"><span class="biz-photo">${B.photo ? `<img src="${esc(B.photo)}" alt="">` : `<img src="logo-business.png" alt="">`}</span>
          <div class="biz-cardtxt"><b id="biz-name">${esc(org.name || 'Mon entreprise')}</b>${B.description ? `<p>${esc(B.description)}</p>` : ''}
          <span>${r === 'owner' ? 'Vous êtes le dirigeant' : r === 'mod' ? 'Vous êtes modérateur' : 'Vous êtes membre'} · ${members.length} membre${members.length > 1 ? 's' : ''}, ${online} en ligne · ${used} / ${S.plusSeats} licence${S.plusSeats > 1 ? 's' : ''} Alixo+</span></div></div></div></div>`;
    const dash = `<div class="set-sect"><div class="po-label">Gérer l’entreprise</div>
      <div class="po-hint" style="margin:0 0 10px">${r === 'owner' || r === 'mod' ? `Équipe, licences Alixo+, modérateurs, code d’invitation, partages à valider${r === 'owner' ? ', photo, bannière et description de l’entreprise' : ''} : tout se trouve sur le <b>tableau de bord en ligne</b>, accessible depuis n’importe quel navigateur.` : 'L’annuaire de l’équipe et vos demandes de partage sont sur le <b>tableau de bord en ligne</b>.'}${isMod() && requests.length ? ` <b class="biz-pending">${requests.length} partage${requests.length > 1 ? 's' : ''} vers l’extérieur à valider.</b>` : ''}</div>${dashBtn}</div>`;
    const chat = `<div class="set-sect"><div class="po-label">Messagerie de l’équipe ${chatOn() ? '' : '<span class="biz-chip">option</span>'}</div>
      ${chatOn() ? `<div class="po-hint" style="margin:0 0 10px">Discutez avec toute l’équipe ou avec un collègue, directement dans Alixo (bouton <b>Messagerie</b> de la bibliothèque).</div><button class="cta ghost" type="button" id="biz-chat">Ouvrir la messagerie</button>`
        : `<div class="po-hint" style="margin:0">La messagerie entre employés est une <b>option premium</b> d’Alixo Business, proposée aux entreprises <b>à partir de 50 employés</b>.${r === 'owner' ? ' Elle s’active depuis le tableau de bord (rubrique Messagerie).' : ' Votre dirigeant peut l’activer.'}</div>`}</div>`;
    const shared = `<div class="set-sect"><div class="po-label">Dossiers et séances de l’entreprise</div>${orgSharesHTML()}</div>`;
    const leave = r !== 'owner' ? `<div class="set-sect"><button class="cta ghost small" type="button" id="biz-leave">Quitter l’entreprise</button></div>` : '';
    return card + dash + chat + shared + leave;
  }
  function orgSharesHTML() {
    const list = window.AlixoShare && AlixoShare.enabled && AlixoShare.orgShares ? AlixoShare.orgShares() : [];
    if (!list.length) return `<div class="po-hint" style="margin:0">${isMod() ? 'Rien n’est encore partagé à toute l’entreprise. Depuis une séance ou un dossier : bouton Partager › <b>Partager à l’entreprise</b> — tous les membres le voient, en lecture.' : 'Rien n’est encore partagé à toute l’entreprise par le dirigeant ou un modérateur.'}</div>`;
    return `<div class="biz-shares">${list.map(sh => `<button type="button" class="biz-share" data-sid="${esc(sh.id)}" style="--mc:${esc(sh.color || '#2e8b6a')}"><b>${esc(sh.title || 'Sans titre')}</b><small>${sh.kind === 'folder' ? 'dossier' : sh.kind === 'file' ? 'fichier' : sh.kind === 'event' ? 'événement' : 'séance'} · par ${esc(sh.ownerName || sh.ownerEmail || '')}${sh.owner === uid || isMod() ? ' · <u data-unshare="' + esc(sh.id) + '">retirer</u>' : ''}</small></button>`).join('')}</div>`;
  }
  function bindSettings(root) {
    const buy = root.querySelector('#biz-buy'); if (buy) buy.addEventListener('click', async e => { if (typeof startCheckout !== 'function') return; const url = await startCheckout('business', e.currentTarget); if (url) openExternalUrl(url); });
    const dash = root.querySelector('#biz-dash'); if (dash) dash.addEventListener('click', openDashboard);
    if (!active()) return;
    const ch = root.querySelector('#biz-chat'); if (ch) ch.addEventListener('click', () => { closeSettings(); if (window.AlixoBizChat) AlixoBizChat.open('all'); });
    const leave = root.querySelector('#biz-leave'); if (leave) leave.addEventListener('click', async () => { if (!confirm(`Quitter ${org.name || 'l’entreprise'} ? Vous perdrez la licence Alixo+ attribuée par l’entreprise et l’accès à ses dossiers.`)) return; try { await store.removeMember(orgId, uid); await store.setProfileOrg(null); stopOrg(); orgId = ''; refreshUI(); toast('Vous avez quitté l’entreprise'); } catch (e) { toast('Impossible : ' + e.message); } });
    root.querySelectorAll('[data-sid]').forEach(b => b.addEventListener('click', e => { const un = e.target.closest('[data-unshare]'); if (un) { e.stopPropagation(); store.shareToOrg(un.dataset.unshare, '').then(() => toast('Retiré de l’entreprise')).catch(x => toast('Impossible : ' + x.message)); return; } closeSettings(); if (window.AlixoShare && AlixoShare.openShared) AlixoShare.openShared(b.dataset.sid); }));
  }
  async function shareToOrg(sid, on) { if (!isMod()) throw new Error('Réservé au dirigeant et aux modérateurs'); await store.shareToOrg(sid, on ? orgId : ''); }

  /* ---------------- démarrage ---------------- */
  function start() {
    if (started) return; started = true;
    store.listenProfile(p => {
      profile = p;
      const o = p && p.org && p.org.id ? p.org.id : '';
      if (o && o !== orgId) startOrg(o);
      else if (!o && orgId && !fake) { /* retiré côté serveur */ }
      if (!o) joinPending();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);

  return { enabled: true, ICO, active, isMod, chatOn, brand: () => brand, me, dashUrl, openDashboard, orgId: () => orgId, org: () => org, role, members: () => members.slice(), requests: () => requests.slice(), colleagues, attachSearch, gate, request, joinByCode, shareToOrg, settingsHTML, bindSettings, offerHTML, refreshUI, get store() { return store; } };
})();
