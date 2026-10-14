/* ============================================================
   Alixo Business — tableau de bord en ligne (1.33)
   Remplace la gestion qui se trouvait dans Paramètres › Entreprise : équipe (présence, rôles, licences Alixo+,
   retrait), invitations (code, lien), partages vers l'extérieur à valider, messagerie (option premium à partir de
   50 employés), personnalisation de l'entreprise par le dirigeant (nom, description, photo, bannière, couleur).
   Données : les mêmes que l'application (js/business.js) — orgs/{id}, members, requests, orgcodes, plans, et
   orgs/{id}/brand/profile (vitrine). Règles : firestore.rules § Alixo Business.
   Tests sans Firestore : window.ALIXO_BUSINESS_FAKE (même couche simulée que scripts/v1330-test.js).
   ============================================================ */
'use strict';

(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const norm = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const now = () => Date.now();
  const ONLINE_MS = 5 * 60000;
  const isOnline = m => !!m.lastSeen && now() - m.lastSeen < ONLINE_MS;
  const initial = s => (String(s || '?').trim()[0] || '?').toUpperCase();
  const fmtWhen = ts => (ts ? new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais');
  const genCode = () => { const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const g = () => Array.from({ length: 4 }, () => AL[Math.floor(Math.random() * AL.length)]).join(''); return `ALXB-${g()}-${g()}`; };
  const CHAT_MIN = 50;
  const APP_URL = 'https://alixoapp.com/docs/';
  let toastTm = 0;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTm); toastTm = setTimeout(() => { el.hidden = true; }, 3800); }

  /* ---------------- thème ---------------- */
  $('#theme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; try { localStorage.setItem('alixo.business.theme', next); } catch { /* */ }
  });

  /* ============================================================
     Couche de données
     ============================================================ */
  const fake = window.ALIXO_BUSINESS_FAKE || null;
  let me = null, store = null, auth = null;
  function firestoreStore(db) {
    const FV = firebase.firestore.FieldValue;
    const orgs = db.collection('orgs');
    const uid = () => me.uid;
    return {
      listenProfile: cb => db.collection('profiles').doc(uid()).onSnapshot(s => cb(s.exists ? s.data() : null), () => cb(null)),
      listenOrg: (oid, cb) => orgs.doc(oid).onSnapshot(s => cb(s.exists ? Object.assign({ id: s.id }, s.data()) : null), () => cb(null)),
      /* 1.33.1 : l'entreprise que ce compte dirige, puis celle de l'adresse ?org= — si le lien du profil manque */
      findOwned: async () => { const q = await orgs.where('ownerUid', '==', uid()).limit(1).get(); return q.empty ? null : Object.assign({ id: q.docs[0].id }, q.docs[0].data()); },
      getOrg: async oid => { const d = await orgs.doc(oid).get(); return d.exists ? Object.assign({ id: d.id }, d.data()) : null; },
      setProfileOrg: o => db.collection('profiles').doc(uid()).set({ org: o }, { merge: true }),
      listenMembers: (oid, cb) => orgs.doc(oid).collection('members').onSnapshot(s => cb(s.docs.map(d => Object.assign({ uid: d.id }, d.data()))), () => cb([])),
      listenRequests: (oid, cb) => orgs.doc(oid).collection('requests').where('state', '==', 'pending').onSnapshot(s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), () => cb([])),
      listenMyRequests: (oid, cb) => orgs.doc(oid).collection('requests').where('by', '==', uid()).onSnapshot(s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), () => cb([])),
      listenBrand: (oid, cb) => orgs.doc(oid).collection('brand').doc('profile').onSnapshot(s => cb(s.exists ? s.data() : null), () => cb(null)),
      setBrand: (oid, patch) => orgs.doc(oid).collection('brand').doc('profile').set(Object.assign({ updatedAt: now(), by: uid() }, patch), { merge: true }),
      setRole: (oid, muid, role) => orgs.doc(oid).collection('members').doc(muid).update({ role, updatedAt: now() }),
      setPlus: async (oid, m, on, orgName) => {
        await orgs.doc(oid).collection('members').doc(m.uid).update({ plus: !!on, plusAt: now(), updatedAt: now() });
        const base = { by: 'business', orgId: oid, note: 'Alixo Business — ' + orgName, email: m.email || '', updatedAt: now() };
        await db.collection('plans').doc(m.uid).set(on ? Object.assign({ plus: true, until: 0, since: now() }, base) : Object.assign({ plus: false, until: 0, since: 0, endedAt: now() }, base));
      },
      removeMember: async (oid, muid) => { await orgs.doc(oid).collection('members').doc(muid).delete(); },
      updateOrg: (oid, patch) => orgs.doc(oid).update(Object.assign({ updatedAt: now() }, patch)),
      setCode: async (oid, code, name, oldCode) => {
        await db.collection('orgcodes').doc(code).set({ orgId: oid, name, createdAt: now(), by: uid() });
        await orgs.doc(oid).update({ code, codeAt: now(), updatedAt: now() });
        if (oldCode) { try { await db.collection('orgcodes').doc(oldCode).delete(); } catch { /* déjà retiré */ } }
      },
      decideRequest: (oid, rid, state) => orgs.doc(oid).collection('requests').doc(rid).update({ state, decidedBy: uid(), decidedByName: me.name, decidedAt: now(), updatedAt: now() }),
      doneRequest: (oid, rid) => orgs.doc(oid).collection('requests').doc(rid).update({ state: 'done', doneAt: now(), updatedAt: now() }),
      listenConvAll: (oid, cb) => orgs.doc(oid).collection('convs').doc('all').onSnapshot(s => cb(s.exists ? s.data() : null), () => cb(null))
    };
  }

  /* ============================================================
     État
     ============================================================ */
  let org = null, members = [], requests = [], myRequests = [], brand = null, convAll = null;
  let orgId = '', unsubs = [], view = 'home', teamQ = '';
  const role = () => (org && org.ownerUid === me.uid ? 'owner' : ((members.find(m => m.uid === me.uid) || {}).role || ''));
  const isMod = () => role() === 'owner' || role() === 'mod';
  const seats = () => ({ seats: +(org && org.seats) || 10, plusSeats: +(org && org.plusSeats) || 5 });
  const plusUsed = () => members.filter(m => m.plus || m.role === 'owner').length;

  function stop() { unsubs.forEach(u => { try { u(); } catch { /* */ } }); unsubs = []; org = null; members = []; requests = []; myRequests = []; brand = null; orgId = ''; }
  function startOrg(oid) {
    if (!oid || oid === orgId) return;
    stop(); orgId = oid;
    unsubs.push(store.listenOrg(oid, o => { org = o; if (!o) { show('noorg'); return; } show('shell'); render(); }));
    unsubs.push(store.listenMembers(oid, ms => { members = ms; render(); }));
    unsubs.push(store.listenRequests(oid, rs => { requests = rs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); render(); }));
    unsubs.push(store.listenMyRequests(oid, rs => { myRequests = rs; render(); }));
    if (store.listenBrand) unsubs.push(store.listenBrand(oid, b => { brand = b; render(); }));
    if (store.listenConvAll) unsubs.push(store.listenConvAll(oid, c => { convAll = c; if (view === 'chat') render(); }));
  }
  function show(which) { $('#login').hidden = which !== 'login'; $('#noorg').hidden = which !== 'noorg'; $('#shell').hidden = which !== 'shell'; }

  /* ============================================================
     Rendu
     ============================================================ */
  function render() {
    if (!org) return;
    const r = role();
    document.querySelectorAll('#bz-nav [data-need]').forEach(b => { b.hidden = b.dataset.need === 'owner' ? r !== 'owner' : !isMod(); });
    if ((view === 'brand' && r !== 'owner') || (view === 'invite' && !isMod())) view = 'home';
    document.querySelectorAll('#bz-nav [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === view));
    $('#n-team').textContent = members.length || '';
    const nreq = isMod() ? requests.length : myRequests.filter(q => q.state === 'pending').length;
    $('#n-req').textContent = nreq || ''; $('#n-req').hidden = !nreq;
    renderHero();
    const v = $('#view');
    const keepFocus = document.activeElement && document.activeElement.id;
    v.innerHTML = ({ home: homeHTML, team: teamHTML, invite: inviteHTML, shares: sharesHTML, chat: chatHTML, brand: brandHTML })[view]();
    bindView(v);
    if (keepFocus === 'team-q') { const q = $('#team-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  }
  function renderHero() {
    const B = brand || {};
    const r = role();
    $('#hero').style.setProperty('--bz', B.accent || '#2e8b6a');
    $('#hero').innerHTML = `<div class="bz-banner"${B.banner ? ` style="background-image:url('${esc(B.banner)}')"` : ''}></div>
      <div class="bz-heroin"><span class="bz-photo"><img src="${esc(B.photo || '../logo-business.png')}" alt=""></span>
      <div class="bz-herotxt"><h1>${esc(org.name || 'Mon entreprise')}</h1>${B.description ? `<p>${esc(B.description)}</p>` : (r === 'owner' ? '<p class="bz-muted">Ajoutez une description, une photo et une bannière dans « Personnaliser ».</p>' : '')}
      <div class="bz-chips"><span class="bz-chip ${org.disabled ? 'bad' : 'ok'}">${org.disabled ? 'Suspendue' : 'Active'}</span><span class="bz-chip">${r === 'owner' ? 'Dirigeant' : r === 'mod' ? 'Modérateur' : 'Membre'}</span>${org.chat ? '<span class="bz-chip ok">Messagerie</span>' : ''}</div></div></div>`;
  }
  const stat = (label, val, sub, pct, cls) => `<div class="bz-stat"><span>${label}</span><b>${val}</b>${pct != null ? `<i class="bz-bar"><em class="${cls || ''}" style="width:${Math.min(100, pct)}%"></em></i>` : ''}<small>${sub}</small></div>`;
  function homeHTML() {
    const S = seats(); const used = plusUsed(); const on = members.filter(isOnline);
    const recent = members.slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).slice(0, 6);
    return `<div class="bz-stats">
        ${stat('Employés', `${members.length} / ${S.seats}`, members.length >= S.seats ? 'toutes les places sont prises' : `${S.seats - members.length} place${S.seats - members.length > 1 ? 's' : ''} libre${S.seats - members.length > 1 ? 's' : ''}`, members.length / S.seats * 100)}
        ${stat('Licences Alixo+', `${used} / ${S.plusSeats}`, 'thèmes, IA, tâches, widgets, stockage', used / S.plusSeats * 100, 'plus')}
        ${stat('En ligne', on.length, on.length ? on.slice(0, 3).map(m => esc((m.name || m.email || '').split(' ')[0])).join(', ') + (on.length > 3 ? '…' : '') : 'personne pour l’instant')}
        ${stat('Partages à valider', isMod() ? requests.length : '—', isMod() ? 'vers l’extérieur de l’entreprise' : 'réservé aux modérateurs')}
      </div>
      <div class="bz-grid2">
        <section class="bz-card"><h2>Activité récente</h2>${recent.map(m => `<div class="bz-row"><span class="bz-av ${isOnline(m) ? 'on' : ''}">${esc(initial(m.name || m.email))}</span><div class="bz-rt"><b>${esc(m.name || m.email)}</b><small>${isOnline(m) ? 'en ligne' : 'vu ' + esc(fmtWhen(m.lastSeen))}${m.platform ? ' · ' + (m.platform === 'desktop' ? 'application PC' : 'navigateur') : ''}</small></div></div>`).join('') || '<p class="bz-muted">Personne pour l’instant.</p>'}</section>
        <section class="bz-card"><h2>Pour commencer</h2>
          <ol class="bz-steps">
            <li class="${members.length > 1 ? 'done' : ''}"><b>Inviter l’équipe</b><span>${isMod() ? 'Rubrique Invitations : un code ou un lien d’inscription.' : 'Votre dirigeant envoie le code d’invitation.'}</span></li>
            <li class="${used > 1 ? 'done' : ''}"><b>Attribuer les licences Alixo+</b><span>Rubrique Équipe, d’un interrupteur.</span></li>
            <li class="${brand && (brand.photo || brand.description) ? 'done' : ''}"><b>Personnaliser l’entreprise</b><span>Photo, bannière, description : vus par tous les membres dans l’application.</span></li>
            <li class="${org.chat ? 'done' : ''}"><b>Messagerie de l’équipe</b><span>Option premium, à partir de ${CHAT_MIN} employés.</span></li>
          </ol></section>
      </div>`;
  }
  function teamHTML() {
    const r = role(); const S = seats(); const used = plusUsed();
    const q = norm(teamQ);
    const list = members.filter(m => q.length < 2 || norm(m.name).includes(q) || norm(m.email).includes(q))
      .sort((a, b) => (b.role === 'owner') - (a.role === 'owner') || isOnline(b) - isOnline(a) || (a.name || '').localeCompare(b.name || ''));
    const row = m => {
      const isOwnerM = m.role === 'owner' || m.uid === org.ownerUid;
      const canPlus = isMod() && !isOwnerM, canRole = r === 'owner' && !isOwnerM, canRm = isMod() && !isOwnerM && m.uid !== me.uid;
      return `<tr data-uid="${esc(m.uid)}"><td><div class="bz-row"><span class="bz-av ${isOnline(m) ? 'on' : ''}">${esc(initial(m.name || m.email))}</span><div class="bz-rt"><b>${esc(m.name || m.email)}${m.uid === me.uid ? ' (vous)' : ''}</b><small>${esc(m.email || '')}</small></div></div></td>
        <td>${isOnline(m) ? '<span class="bz-on">en ligne</span>' : `<span class="bz-muted">${esc(fmtWhen(m.lastSeen))}</span>`}</td>
        <td>${canRole ? `<select data-role="${esc(m.uid)}"><option value="member" ${m.role === 'member' ? 'selected' : ''}>Membre</option><option value="mod" ${m.role === 'mod' ? 'selected' : ''}>Modérateur</option></select>` : `<span class="bz-chip ${isOwnerM ? 'brand' : ''}">${isOwnerM ? 'Dirigeant' : m.role === 'mod' ? 'Modérateur' : 'Membre'}</span>`}</td>
        <td>${isOwnerM ? '<span class="bz-chip plus">Alixo+</span>' : canPlus ? `<label class="bz-sw"><input type="checkbox" data-plus="${esc(m.uid)}" ${m.plus ? 'checked' : ''} ${!m.plus && used >= S.plusSeats ? 'disabled' : ''}><span></span><em>${m.plus ? 'Alixo+' : 'Gratuit'}</em></label>` : (m.plus ? '<span class="bz-chip plus">Alixo+</span>' : '<span class="bz-muted">Gratuit</span>')}</td>
        <td class="bz-act">${canRm ? `<button type="button" class="bz-btn ghost small danger" data-rm="${esc(m.uid)}">Retirer</button>` : ''}</td></tr>`;
    };
    return `<section class="bz-card"><div class="bz-cardhead"><h2>Équipe <small>${members.length} / ${S.seats} · ${used} / ${S.plusSeats} licences Alixo+</small></h2><input id="team-q" type="search" placeholder="Rechercher un membre…" value="${esc(teamQ)}" autocomplete="off"></div>
      <div class="bz-tablewrap"><table class="bz-table"><thead><tr><th>Membre</th><th>Présence</th><th>Rôle</th><th>Licence</th><th></th></tr></thead><tbody>${list.map(row).join('') || '<tr><td colspan="5" class="bz-muted">Aucun membre ne correspond.</td></tr>'}</tbody></table></div>
      <p class="bz-muted">${isMod() ? 'Une licence Alixo+ ouvre toutes les fonctions sur le compte de l’employé ; le dirigeant en a toujours une. Le dirigeant nomme les modérateurs, qui valident les partages vers l’extérieur et attribuent les licences.' : 'Pour partager une séance avec un collègue dans Alixo : bouton Partager, puis 4 lettres de son nom.'}</p></section>`;
  }
  function inviteHTML() {
    const r = role(); const S = seats();
    const link = APP_URL + '?join=' + encodeURIComponent(org.code || '');
    return `<section class="bz-card"><h2>Inviter un employé</h2>
      <p>L’employé crée un <b>nouveau compte Alixo</b> (écran de connexion › Créer un compte) et saisit ce code dans « Code entreprise » — ou ouvre directement le lien d’inscription. Il rejoint l’entreprise aussitôt.${members.length >= S.seats ? ' <b class="bz-warn">Toutes les places sont prises.</b>' : ''}</p>
      <div class="bz-code"><code id="code-val">${esc(org.code || '—')}</code><button type="button" class="bz-btn" data-copy="${esc(org.code || '')}">Copier le code</button>${r === 'owner' ? '<button type="button" class="bz-btn ghost" id="code-regen">Nouveau code</button>' : ''}</div>
      <div class="bz-code small"><code>${esc(link)}</code><button type="button" class="bz-btn ghost" data-copy="${esc(link)}">Copier le lien</button></div>
      <p class="bz-muted">Les comptes personnels existants ne peuvent pas rejoindre une entreprise : le travail et les cours personnels restent séparés.</p></section>`;
  }
  const kindName = k => (k === 'folder' ? 'le dossier' : k === 'file' ? 'le fichier' : k === 'event' ? 'l’événement' : 'la séance');
  function sharesHTML() {
    const mine = myRequests.filter(q => q.state === 'pending');
    const mod = isMod() ? `<section class="bz-card"><h2>Partages vers l’extérieur à valider ${requests.length ? `<span class="bz-count warn">${requests.length}</span>` : ''}</h2>
      ${requests.length ? requests.map(q => `<div class="bz-req"><span class="bz-av">${esc(initial(q.byName || q.byEmail))}</span><div class="bz-rt"><b>${esc(q.byName || q.byEmail)}</b> veut partager ${kindName(q.kind)} <b>« ${esc(q.title)} »</b> avec <b>${esc(q.to)}</b> (${q.role === 'write' ? 'écriture' : 'lecture'})<small>${esc(fmtWhen(q.createdAt))}</small></div><div class="bz-reqact"><button type="button" class="bz-btn primary small" data-ok="${esc(q.id)}">Autoriser</button><button type="button" class="bz-btn ghost small" data-no="${esc(q.id)}">Refuser</button></div></div>`).join('') : '<p class="bz-muted">Aucune demande en attente. Entre collègues, le partage est libre ; un partage vers une adresse extérieure apparaît ici.</p>'}</section>` : '';
    const own = `<section class="bz-card"><h2>Mes demandes en attente</h2>${mine.length ? mine.map(q => `<div class="bz-req"><div class="bz-rt"><b>« ${esc(q.title)} »</b> avec ${esc(q.to)}<small>En attente d’un modérateur · ${esc(fmtWhen(q.createdAt))}</small></div><div class="bz-reqact"><button type="button" class="bz-btn ghost small" data-cancel="${esc(q.id)}">Annuler</button></div></div>`).join('') : '<p class="bz-muted">Aucune demande en attente.</p>'}</section>`;
    return mod + own;
  }
  function chatHTML() {
    const S = seats();
    const mail = `mailto:contact@alixoapp.com?subject=${encodeURIComponent('Alixo Business — messagerie de l’équipe (' + (org.name || '') + ')')}&body=${encodeURIComponent('Bonjour,\n\nNous souhaitons activer la messagerie de l’équipe pour notre entreprise (' + members.length + ' membres, ' + S.seats + ' places).\n\nIdentifiant : ' + orgId + '\n')}`;
    if (org.chat) return `<section class="bz-card"><h2>Messagerie de l’équipe <span class="bz-chip ok">activée</span></h2>
      <p>Vos employés discutent <b>directement dans l’application Alixo</b> : bouton <b>Messagerie</b> de la bibliothèque — une conversation avec toute l’équipe et une conversation privée avec chaque collègue, présence en direct, notifications dans la cloche.</p>
      ${convAll && convAll.lastAt ? `<div class="bz-req"><span class="bz-av">${esc(initial(convAll.lastByName))}</span><div class="bz-rt"><b>Dernier message à toute l’équipe</b> — ${esc(convAll.lastByName || '')} : « ${esc(convAll.lastText || '')} »<small>${esc(fmtWhen(convAll.lastAt))}</small></div></div>` : '<p class="bz-muted">Aucun message à toute l’équipe pour l’instant.</p>'}
      <p class="bz-muted">Les messages ne sont lisibles que par les membres de l’entreprise (les conversations privées, par leurs deux participants).</p></section>`;
    const eligible = S.seats >= CHAT_MIN;
    return `<section class="bz-card bz-offer"><h2>Messagerie de l’équipe <span class="bz-chip">option premium</span></h2>
      <p>Discuter entre employés <b>directement dans Alixo</b>, sans autre application : un fil pour toute l’équipe, des conversations privées entre collègues, la présence en direct et les notifications.</p>
      <ul class="bz-list"><li>Réservée aux entreprises <b>à partir de ${CHAT_MIN} employés</b> (votre offre : ${S.seats} places).</li><li>Facturée en supplément de l’abonnement Alixo Business.</li><li>Activée par l’équipe Alixo, sans rien installer : elle apparaît aussitôt chez tous vos employés.</li></ul>
      ${role() === 'owner' ? `<a class="bz-btn primary" href="${esc(mail)}">${eligible ? 'Demander l’activation' : `Passer à ${CHAT_MIN} employés et activer la messagerie`}</a>` : '<p class="bz-muted">Seul le dirigeant peut demander l’activation.</p>'}</section>`;
  }
  function brandHTML() {
    const B = Object.assign({}, brand || {}, draft);   // les saisies en cours survivent à un rafraîchissement (photo enregistrée…)
    const colors = ['#2e8b6a', '#33658a', '#3d6bb5', '#8a4b9c', '#c04343', '#b3762a', '#1f2937'];
    return `<section class="bz-card"><h2>Personnaliser l’entreprise</h2><p class="bz-muted">Ce que vous choisissez ici s’affiche chez tous les membres : en tête de ce tableau de bord et dans Paramètres › Entreprise de l’application.</p>
      <div class="bz-form">
        <label><span>Nom de l’entreprise</span><input id="br-name" maxlength="60" value="${esc(draft.name != null ? draft.name : org.name || '')}"></label>
        <label><span>Description <small id="br-dcount">${(B.description || '').length} / 400</small></span><textarea id="br-desc" maxlength="400" rows="3" placeholder="Ce que fait l’entreprise, en une ou deux phrases.">${esc(B.description || '')}</textarea></label>
        <div class="bz-imgs">
          <div><span>Photo de profil</span><div class="bz-photoedit"><img src="${esc(B.photo || '../logo-business.png')}" alt=""></div><div class="bz-imgacts"><button type="button" class="bz-btn ghost small" data-pick="photo">Choisir…</button>${B.photo ? '<button type="button" class="bz-btn ghost small" data-clear="photo">Retirer</button>' : ''}</div></div>
          <div class="grow"><span>Bannière</span><div class="bz-banneredit" style="--bz:${esc(B.accent || '#2e8b6a')};${B.banner ? `background-image:url('${esc(B.banner)}')` : ''}"></div><div class="bz-imgacts"><button type="button" class="bz-btn ghost small" data-pick="banner">Choisir…</button>${B.banner ? '<button type="button" class="bz-btn ghost small" data-clear="banner">Retirer</button>' : ''}<small class="bz-muted">Format large (environ 4 : 1)</small></div></div>
        </div>
        <div><span class="bz-lbl">Couleur</span><div class="bz-colors">${colors.map(c => `<button type="button" data-color="${c}" class="${(B.accent || '#2e8b6a') === c ? 'on' : ''}" style="--c:${c}" title="${c}"></button>`).join('')}</div></div>
        <div class="bz-formacts"><button type="button" class="bz-btn primary" id="br-save">Enregistrer</button></div>
      </div><input type="file" id="br-file" accept="image/*" hidden></section>`;
  }

  /* ---------------- images de la vitrine : réduites dans le navigateur (le document reste sous 1 Mio) ---------------- */
  function shrink(file, maxW, maxH, crop) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file); const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(u);
        let w = im.naturalWidth, h = im.naturalHeight, sx = 0, sy = 0, sw = w, sh = h;
        if (crop) { const ratio = maxW / maxH; if (w / h > ratio) { sw = h * ratio; sx = (w - sw) / 2; } else { sh = w / ratio; sy = (h - sh) / 2; } }
        const s = Math.min(1, maxW / sw, maxH / sh);
        const c = document.createElement('canvas'); c.width = Math.round(sw * s); c.height = Math.round(sh * s);
        c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
        let q = 0.85, data = c.toDataURL('image/jpeg', q);
        while (data.length > 380 * 1024 && q > 0.4) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
        res(data);
      };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Image illisible')); };
      im.src = u;
    });
  }

  /* ============================================================
     Actions
     ============================================================ */
  const copy = async (txt, msg) => { try { await navigator.clipboard.writeText(txt); toast(msg); } catch { prompt(msg, txt); } };
  const fail = e => toast('Impossible : ' + (e && e.message || e));
  let pickFor = '', draft = {};
  function bindView(v) {
    const q = v.querySelector('#team-q'); if (q) q.addEventListener('input', () => { teamQ = q.value; render(); });
    v.querySelectorAll('[data-role]').forEach(sel => sel.addEventListener('change', () => store.setRole(orgId, sel.dataset.role, sel.value).then(() => toast(sel.value === 'mod' ? 'Nommé modérateur' : 'Redevenu membre')).catch(fail)));
    v.querySelectorAll('[data-plus]').forEach(cb => cb.addEventListener('change', async () => {
      const m = members.find(x => x.uid === cb.dataset.plus); if (!m) return;
      if (cb.checked && plusUsed() >= seats().plusSeats) { cb.checked = false; toast('Toutes les licences Alixo+ sont attribuées'); return; }
      try { await store.setPlus(orgId, m, cb.checked, org.name || ''); toast(cb.checked ? `Alixo+ attribué à ${m.name || m.email}` : `Alixo+ retiré à ${m.name || m.email}`); } catch (e) { cb.checked = !cb.checked; fail(e); }
    }));
    v.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
      const m = members.find(x => x.uid === b.dataset.rm); if (!m || !confirm(`Retirer ${m.name || m.email} de l’entreprise ? Il perd l’accès à ses dossiers et la licence Alixo+ qu’elle lui donnait.`)) return;
      try { if (m.plus) await store.setPlus(orgId, m, false, org.name || ''); await store.removeMember(orgId, m.uid); toast('Membre retiré'); } catch (e) { fail(e); }
    }));
    v.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copy(b.dataset.copy, b.dataset.copy.startsWith('http') ? 'Lien d’inscription copié' : 'Code copié')));
    const rg = v.querySelector('#code-regen'); if (rg) rg.addEventListener('click', async () => { if (!confirm('Créer un nouveau code ? L’ancien ne fonctionnera plus.')) return; try { await store.setCode(orgId, genCode(), org.name || '', org.code || ''); toast('Nouveau code créé'); } catch (e) { fail(e); } });
    v.querySelectorAll('[data-ok],[data-no]').forEach(b => b.addEventListener('click', () => store.decideRequest(orgId, b.dataset.ok || b.dataset.no, b.dataset.ok ? 'approved' : 'denied').then(() => toast(b.dataset.ok ? 'Partage autorisé : l’invitation part toute seule' : 'Partage refusé')).catch(fail)));
    v.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => store.doneRequest(orgId, b.dataset.cancel).then(() => toast('Demande annulée')).catch(fail)));
    /* personnalisation */
    const save = v.querySelector('#br-save');
    if (save) {
      const desc = v.querySelector('#br-desc');
      desc.addEventListener('input', () => { draft.description = desc.value; v.querySelector('#br-dcount').textContent = `${desc.value.length} / 400`; });
      v.querySelector('#br-name').addEventListener('input', e => { draft.name = e.target.value; });
      v.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { draft.accent = b.dataset.color; v.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('on', x === b)); v.querySelector('.bz-banneredit').style.setProperty('--bz', b.dataset.color); }));
      const file = v.querySelector('#br-file');
      v.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { pickFor = b.dataset.pick; file.click(); }));
      v.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => store.setBrand(orgId, { [b.dataset.clear]: '' }).then(() => toast('Image retirée')).catch(fail)));
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0]; file.value = ''; if (!f) return;
        try {
          const data = pickFor === 'photo' ? await shrink(f, 400, 400, true) : await shrink(f, 1600, 400, true);
          await store.setBrand(orgId, { [pickFor]: data });
          toast(pickFor === 'photo' ? 'Photo de profil enregistrée' : 'Bannière enregistrée');
        } catch (e) { fail(e); }
      });
      save.addEventListener('click', async () => {
        const name = v.querySelector('#br-name').value.trim().slice(0, 60);
        if (!name) { toast('Le nom ne peut pas être vide'); return; }
        try {
          if (name !== org.name) { await store.updateOrg(orgId, { name }); if (org.code) await store.setCode(orgId, org.code, name, ''); }
          const patch = { description: desc.value.trim().slice(0, 400) }; if (draft.accent) patch.accent = draft.accent;
          draft = {};
          await store.setBrand(orgId, patch);
          toast('Entreprise mise à jour');
        } catch (e) { fail(e); }
      });
    }
  }
  $('#bz-nav').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; view = b.dataset.v; teamQ = ''; draft = {}; render(); window.scrollTo(0, 0); try { history.replaceState(null, '', '#' + view); } catch { /* */ } });
  const h = location.hash.slice(1); if (['home', 'team', 'invite', 'shares', 'chat', 'brand'].includes(h)) view = h;

  /* ============================================================
     Démarrage : compte connecté → entreprise du profil
     ============================================================ */
  /* le profil ne relie ce compte à aucune entreprise : est-il le dirigeant d'une entreprise (ou membre de celle de ?org=) ?
     Si oui, le lien du profil est réparé (il sert aussi à l'application). */
  async function findOrg() {
    let o = null;
    try { if (store.findOwned) o = await store.findOwned(); } catch { o = null; }
    const want = new URLSearchParams(location.search).get('org');
    if (!o && want && store.getOrg) { try { o = await store.getOrg(want); } catch { o = null; } }
    if (o && store.setProfileOrg) store.setProfileOrg({ id: o.id, name: o.name || '', role: o.ownerUid === me.uid ? 'owner' : 'member' }).catch(() => {});
    return o;
  }
  function signedIn(user) {
    me = user;
    $('#me-name').textContent = me.name || me.email.split('@')[0];
    $('#me-mail').textContent = me.email;
    $('#me-av').textContent = initial(me.name || me.email);
    store.listenProfile(async p => {
      const oid = p && p.org && p.org.id ? p.org.id : '';
      if (oid) { startOrg(oid); return; }
      const found = await findOrg();
      if (found) { startOrg(found.id); return; }
      stop(); $('#noorg-mail').textContent = me.email; $('#noorg-uid').textContent = me.uid; show('noorg');
    });
  }
  document.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', () => { if (auth) auth.signOut(); else location.reload(); }));

  if (fake) { store = fake; signedIn(fake.me); return; }
  if (!window.ALIXO_FIREBASE_CONFIG || typeof firebase === 'undefined') { show('login'); $('#login-err').hidden = false; $('#login-err').textContent = 'Service en ligne indisponible.'; return; }
  firebase.initializeApp(window.ALIXO_FIREBASE_CONFIG);
  auth = firebase.auth(); auth.languageCode = 'fr';
  store = firestoreStore(firebase.firestore());
  const loginErr = e => { $('#login-err').hidden = false; $('#login-err').textContent = ({ 'auth/invalid-credential': 'E-mail ou mot de passe incorrect.', 'auth/user-not-found': 'Aucun compte avec cet e-mail.', 'auth/wrong-password': 'Mot de passe incorrect.', 'auth/popup-closed-by-user': 'Connexion annulée.' })[e.code] || e.message || 'Connexion impossible'; };
  $('#g-login').addEventListener('click', () => { $('#login-err').hidden = true; auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(loginErr); });
  $('#pw-form').addEventListener('submit', e => { e.preventDefault(); $('#login-err').hidden = true; auth.signInWithEmailAndPassword($('#pw-mail').value.trim(), $('#pw-pass').value).catch(loginErr); });
  auth.onAuthStateChanged(user => {
    stop();
    if (!user) { show('login'); return; }
    signedIn({ uid: user.uid, email: (user.email || '').toLowerCase(), name: user.displayName || (user.email || '').split('@')[0] });
  });
})();
