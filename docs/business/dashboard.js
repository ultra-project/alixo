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
      listenConvAll: (oid, cb) => orgs.doc(oid).collection('convs').doc('all').onSnapshot(s => cb(s.exists ? s.data() : null), () => cb(null)),
      /* 1.35 : abonnement Business du compte (écrit par le serveur de paiement), pré-inscription, création de l'entreprise par le dirigeant */
      listenBizSub: cb => db.collection('bizsubs').doc(uid()).onSnapshot(s => cb(s.exists ? s.data() : null), () => cb(null)),
      setLead: lead => db.collection('bizleads').doc(uid()).set(Object.assign({ uid: uid(), updatedAt: now() }, lead), { merge: true }),
      publicConfig: async () => { try { const s = await db.collection('config').doc('public').get(); return s.exists ? s.data() : {}; } catch { return {}; } },
      idToken: () => firebase.auth().currentUser.getIdToken(),
      /* l'entreprise est écrite en quatre temps (les règles vérifient chaque document contre l'entreprise déjà créée) */
      createOrg: async (o, member, code) => {
        const id = uid();
        await orgs.doc(id).set(o);
        await orgs.doc(id).collection('members').doc(id).set(member);
        await db.collection('orgcodes').doc(code).set({ orgId: id, name: o.name, createdAt: now(), by: uid() });
        await db.collection('profiles').doc(id).set({ org: { id, name: o.name, role: 'owner' } }, { merge: true });
        return id;
      }
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
    stop(); stopOffers(); orgId = oid;
    unsubs.push(store.listenOrg(oid, o => { org = o; if (!o) { showOffers(); return; } show('shell'); render(); }));
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
     1.35 : sans entreprise — les offres, puis l'assistant « Configurer votre entreprise »
     ------------------------------------------------------------
     - Offres : 60 € / mois ou 690 € / an (30 € de moins qu'au mensuel) pour l'offre de base : 10 employés dont 5 licences Alixo+.
       Les tarifs réels viennent du serveur de paiement (billing/, GET /business/offer) ; tant qu'il ne les publie pas
       (abonnement pas encore ouvert chez Stripe), « Souscrire » propose une pré-inscription (bizleads/{uid}) — jamais de
       faux paiement.
     - Après paiement (bizsubs/{uid}.status actif) : 1. vérification d'identité du dirigeant (Stripe Identity : pièce
       d'identité + selfie, traités par Stripe) ; 2. informations de l'entreprise ; 3. création — orgs/{uid} écrite par le
       dirigeant lui-même, les règles Firestore exigent l'abonnement actif et identity == 'verified'.
     ============================================================ */
  const PRICES = { monthly: 6000, yearly: 69000 };                 // affichage par défaut, en centimes (les vrais tarifs viennent du serveur)
  const OFFER_SEATS = { seats: 10, plusSeats: 5 };
  const GRANT = ['active', 'trialing', 'past_due'];
  const fmtEur = (cents, cur) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: (cur || 'eur').toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  let bizSub = null, bizOffer = null, billingApi = '', oview = 'offres', period = 'yearly', unsubBiz = null, setupDraft = {}, busy = false;
  const subActive = () => !!(bizSub && GRANT.includes(bizSub.status));
  const PLUS_FEATURES = [
    ['Intelligence artificielle', 'Correction, quiz et fiches de révision générés depuis les documents'],
    ['Tous les thèmes et toutes les polices', 'Apparence de l’application et police des documents'],
    ['Fond d’écran des documents', 'Une image ou un dégradé derrière les pages'],
    ['Widgets de bureau', 'Tâches, agenda et minuteur sur le bureau (version PC)'],
    ['Tâches et bilan de la semaine', 'À faire, échéances, statistiques d’écriture'],
    ['Stockage au-delà de 3 Go', 'Fichiers, images et cours sans la limite du compte gratuit']
  ];
  const BIZ_FEATURES = [
    ['users', '10 employés', 'des comptes créés avec votre code d’invitation, séparés des comptes personnels'],
    ['star', '5 licences Alixo+', 'attribuées en un clic depuis l’équipe, y compris celle du dirigeant'],
    ['home', 'Tableau de bord', 'présence, licences, partages à valider, activité de l’équipe'],
    ['share', 'Partages contrôlés', 'libres entre collègues ; vers l’extérieur, validés par un modérateur'],
    ['folder', 'Dossiers d’entreprise', 'des dossiers partagés à toute l’équipe, en lecture ou en écriture'],
    ['brand', 'Personnalisation', 'nom, logo, bannière et couleur de l’entreprise, vus par tous les membres'],
    ['shield', 'Vérification d’identité', 'le dirigeant est vérifié (Stripe Identity) : des équipes de confiance'],
    ['mail', 'Assistance', 'réponse par e-mail sous deux jours ouvrés, en français']
  ];
  const ICO = {
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
    brand: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1 1-2 1-3a9 9 0 0 0-7-9Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15.5" cy="7.5" r="1.2"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7"/></svg>',
    id: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5 17a3.5 3.5 0 0 1 7 0M14 10h5M14 13.5h4"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
  };
  const FAQ = [
    ['Comment est-on facturé ?', 'Par carte bancaire, via Stripe, chaque mois ou chaque année selon la formule choisie. La facture arrive par e-mail ; un numéro de TVA intracommunautaire peut être indiqué au paiement.'],
    ['Peut-on résilier ?', 'À tout moment, sans frais : l’abonnement reste actif jusqu’à la fin de la période payée. L’entreprise est alors suspendue, ses membres gardent leurs comptes et leurs documents, et tout repart au paiement suivant.'],
    ['Pourquoi vérifier l’identité du dirigeant ?', 'Une entreprise Alixo Business rassemble des comptes et leurs documents : la vérification (pièce d’identité et selfie, traités par Stripe Identity) évite les créations frauduleuses. Alixo ne reçoit que le résultat, jamais la pièce.'],
    ['Où sont les données ?', 'Dans le même service en ligne que les comptes Alixo (Google Cloud Firestore, région Europe) : les séances, fichiers et messages d’un employé ne sont lisibles que par lui et les personnes avec qui il partage. Les règles d’accès sont publiques dans le dépôt.'],
    ['Et le RGPD ?', 'L’entreprise reste responsable des données de ses employés ; Alixo agit comme sous-traitant. Suppression d’un membre : il garde ses documents, perd l’accès aux dossiers de l’entreprise et sa licence Alixo+. Export et suppression d’un compte : depuis l’application, Paramètres › Compte.']
  ];
  function showOffers() {
    show('noorg');
    $('#noorg-mail').textContent = me.email; $('#noorg-uid').textContent = me.uid;
    if (!unsubBiz && store.listenBizSub) unsubBiz = store.listenBizSub(s => { const was = bizSub; bizSub = s; if (!was && subActive() && !location.hash.startsWith('#offres')) oview = 'configurer'; renderOffers(); });
    if (bizOffer === null) loadBizOffer();
    const h = location.hash.replace('#', '');
    if (h === 'configurer' || (new URLSearchParams(location.search).get('identity') === 'retour')) oview = 'configurer';
    else if (h === 'offres') oview = 'offres';
    renderOffers();
  }
  function stopOffers() { if (unsubBiz) { try { unsubBiz(); } catch { /* */ } unsubBiz = null; } }
  async function loadBizOffer() {
    bizOffer = false;   // chargement en cours / pas d'offre
    try {
      if (fake) { bizOffer = fake.offer || false; billingApi = fake.offer ? 'fake' : ''; }
      else {
        const pub = store.publicConfig ? await store.publicConfig() : {};
        billingApi = String(pub.billingApi || (window.ALIXO_BILLING && window.ALIXO_BILLING.api) || '').replace(/\/+$/, '');
        if (billingApi) { const r = await fetch(billingApi + '/business/offer'); const j = r.ok ? await r.json() : null; bizOffer = j && j.open ? j : false; }
      }
    } catch { bizOffer = false; }
    renderOffers();
  }
  const offerOpen = () => !!(bizOffer && bizOffer.open);
  const priceOf = k => (offerOpen() && bizOffer[k] ? fmtEur(bizOffer[k].amount, bizOffer[k].currency) : fmtEur(PRICES[k]));
  function renderOffers() {
    const v = $('#offers-view'); if (!v || $('#noorg').hidden) return;
    document.querySelectorAll('#bz-otabs [data-ov]').forEach(b => b.classList.toggle('on', b.dataset.ov === oview));
    v.innerHTML = oview === 'configurer' ? setupHTML() : offersHTML();
    bindOffers(v);
  }
  function offersHTML() {
    const yearly = period === 'yearly';
    const perMonthYearly = offerOpen() && bizOffer.yearly ? bizOffer.yearly.amount / 12 : PRICES.yearly / 12;
    /* économie réelle de l'annuel sur douze mois au tarif mensuel (690 € contre 12 × 60 € : 30 €, pas « deux mois offerts ») */
    const amt = k => (offerOpen() && bizOffer[k] ? bizOffer[k].amount : PRICES[k]);
    const saving = Math.max(0, 12 * amt('monthly') - amt('yearly'));
    const savingTxt = saving ? `${fmtEur(saving)} de moins qu’au mensuel` : '';
    const sub = subActive() ? `<div class="bz-note ok">${ICO.check}<div><b>Votre abonnement Alixo Business est actif</b> (${bizSub.plan === 'yearly' ? 'formule annuelle' : 'formule mensuelle'}). Il reste à configurer votre entreprise.</div><button type="button" class="bz-btn primary small" data-ov="configurer">Configurer</button></div>` : '';
    return `<section class="bz-hero2">
        <span class="bz-kicker">Alixo Business</span>
        <h1>Alixo pour toute <em>votre équipe</em></h1>
        <p>Les cours, documents et outils d’Alixo, avec un espace d’entreprise : des comptes pour vos employés, des licences Alixo+ à distribuer, des partages maîtrisés et un tableau de bord pour piloter l’ensemble.</p>
        ${sub}
      </section>
      <section class="bz-pricing">
        <div class="bz-period" role="radiogroup" aria-label="Facturation">
          <button type="button" data-period="monthly" class="${yearly ? '' : 'on'}" role="radio" aria-checked="${!yearly}">Mensuel</button>
          <button type="button" data-period="yearly" class="${yearly ? 'on' : ''}" role="radio" aria-checked="${yearly}">Annuel${savingTxt ? ` <span class="bz-save">${savingTxt}</span>` : ''}</button>
        </div>
        <div class="bz-plans">
          <article class="bz-plan main">
            <div class="bz-plantop"><span class="bz-plantag">Offre de base</span><h2>Business</h2><p>Pour une équipe jusqu’à ${OFFER_SEATS.seats} personnes.</p></div>
            <div class="bz-price"><b>${yearly ? priceOf('yearly') : priceOf('monthly')}</b><span>${yearly ? 'par an' : 'par mois'}</span>${yearly ? `<small>soit ${fmtEur(Math.round(perMonthYearly))} par mois · ${priceOf('monthly')} en mensuel</small>` : `<small>ou ${priceOf('yearly')} par an${savingTxt ? ', ' + savingTxt : ''}</small>`}</div>
            <ul class="bz-feats">${BIZ_FEATURES.map(([i, t, d]) => `<li><span class="bz-fico">${ICO[i]}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></li>`).join('')}</ul>
            <button type="button" class="bz-btn primary big" data-subscribe="${period}" ${subActive() ? 'disabled' : ''}>${subActive() ? 'Abonnement actif' : offerOpen() ? `Souscrire — ${yearly ? priceOf('yearly') + ' / an' : priceOf('monthly') + ' / mois'}` : 'Souscrire'}</button>
            <p class="bz-muted bz-center">${offerOpen() ? 'Paiement sécurisé par Stripe · sans engagement · facture par e-mail' : 'Les abonnements ouvrent très bientôt : laissez-nous vos coordonnées, nous vous prévenons à l’ouverture.'}</p>
          </article>
          <article class="bz-plan">
            <div class="bz-plantop"><span class="bz-plantag alt">Sur devis</span><h2>Plus d’employés ?</h2><p>Au-delà de ${OFFER_SEATS.seats} personnes, l’offre se construit avec vous.</p></div>
            <ul class="bz-tiers"><li><b>25 places</b><span>8 licences Alixo+</span></li><li><b>50 places</b><span>15 licences Alixo+ · messagerie d’équipe</span></li><li><b>100 places et plus</b><span>licences au choix · messagerie · accompagnement</span></li></ul>
            <ul class="bz-feats compact"><li><span class="bz-fico">${ICO.check}</span><div><b>Messagerie de l’équipe</b><small>à partir de 50 employés : un fil pour toute l’équipe et des conversations privées, dans Alixo</small></div></li><li><span class="bz-fico">${ICO.check}</span><div><b>Facturation sur devis</b><small>bon de commande, virement, engagement annuel possible</small></div></li></ul>
            <a class="bz-btn big" href="mailto:contact@alixoapp.com?subject=${encodeURIComponent('Alixo Business — devis')}&body=${encodeURIComponent('Bonjour,\n\nNous souhaitons un devis Alixo Business pour une équipe de … personnes.\n\nEntreprise : \nContact : \n')}">Demander un devis</a>
            <p class="bz-muted bz-center">contact@alixoapp.com — réponse sous deux jours ouvrés</p>
          </article>
        </div>
      </section>
      <section class="bz-plusin">
        <div class="bz-plusin-head"><span class="bz-chip plus">Alixo+</span><h2>Ce que comprend Alixo+ pour vos employés</h2><p>Chaque licence ouvre, sur le compte de l’employé, tout ce que propose l’abonnement Alixo+ individuel.</p></div>
        <ul class="bz-plusgrid">${PLUS_FEATURES.map(([t, d]) => `<li><span class="bz-fico plus">${ICO.check}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></li>`).join('')}</ul>
      </section>
      <section class="bz-how">
        <h2>Comment ça se passe</h2>
        <ol class="bz-hsteps">
          <li><b>Vous souscrivez</b><span>par carte, en quelques instants ; la facture arrive par e-mail.</span></li>
          <li><b>Vous vérifiez votre identité</b><span>pièce d’identité et selfie, traités par Stripe Identity — une seule fois.</span></li>
          <li><b>Vous nommez l’entreprise</b><span>et recevez le code d’invitation que vos employés saisissent à la création de leur compte.</span></li>
          <li><b>Vous pilotez</b><span>licences, rôles, partages et personnalisation depuis ce tableau de bord.</span></li>
        </ol>
      </section>
      <section class="bz-faq"><h2>Questions fréquentes</h2>${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>`;
  }
  /* ---- assistant de création ---- */
  const stepState = () => {
    if (!subActive()) return 0;
    const id = bizSub.identity || 'none';
    if (id !== 'verified') return 1;
    return 2;
  };
  function setupHTML() {
    const st = stepState();
    const steps = ['Abonnement', 'Identité du dirigeant', 'Votre entreprise'];
    const bar = `<ol class="bz-wsteps">${steps.map((s, i) => `<li class="${i < st ? 'done' : i === st ? 'cur' : ''}"><i>${i < st ? ICO.check : i + 1}</i><span>${s}</span></li>`).join('')}</ol>`;
    let body = '';
    if (st === 0) {
      body = `<div class="bz-wcard"><span class="bz-wico">${ICO.lock}</span><h2>Commencez par souscrire</h2><p>L’assistant s’ouvre dès que votre abonnement Alixo Business est actif. ${bizSub && bizSub.lastCheckoutAt && !bizSub.status ? 'Un paiement est en cours de confirmation : cette page se mettra à jour toute seule.' : ''}</p><div class="bz-wacts"><button type="button" class="bz-btn primary" data-ov="offres">Voir les offres</button></div></div>`;
    } else if (st === 1) {
      const id = bizSub.identity || 'none';
      const idOpen = offerOpen() ? !!bizOffer.identity : false;
      const status = id === 'pending' ? `<div class="bz-note">${ICO.id}<div><b>Vérification en cours.</b> Stripe examine votre pièce : le résultat arrive ici en général en moins de deux minutes. Si vous avez interrompu la vérification, relancez-la.</div></div>`
        : id === 'requires_input' ? `<div class="bz-note bad">${ICO.id}<div><b>La vérification n’a pas abouti</b>${bizSub.identityError ? ` (${esc(bizSub.identityError)})` : ''}. Reprenez-la avec une pièce bien lisible, dans un endroit éclairé.</div></div>` : '';
      body = `<div class="bz-wcard">
          <span class="bz-wico">${ICO.id}</span>
          <h2>Vérifier votre identité</h2>
          <p>La création d’une entreprise Alixo Business demande une vérification d’identité de son dirigeant. Elle est assurée par <b>Stripe Identity</b>, le même prestataire que le paiement.</p>
          ${status}
          <div class="bz-wgrid">
            <div><b>Pourquoi</b><span>Une entreprise réunit des comptes et leurs documents : la vérification empêche les créations frauduleuses et protège vos employés.</span></div>
            <div><b>Comment</b><span>Une pièce d’identité (carte nationale, passeport, titre de séjour) photographiée avec votre téléphone ou votre webcam, puis un selfie en direct. Deux à trois minutes.</span></div>
            <div><b>Vos données</b><span>Traitées et conservées par Stripe, conformément au RGPD ; Alixo reçoit seulement « vérifiée » ou « à reprendre », jamais la pièce ni le selfie.</span></div>
          </div>
          <div class="bz-wacts">${idOpen ? `<button type="button" class="bz-btn primary" data-identity>${id === 'none' ? 'Commencer la vérification' : 'Reprendre la vérification'}</button>` : `<button type="button" class="bz-btn primary" disabled>Commencer la vérification</button><span class="bz-muted">La vérification ouvrira avec le lancement des abonnements.</span>`}</div>
        </div>`;
    } else {
      const d = setupDraft;
      body = `<div class="bz-wcard wide">
          <span class="bz-wico ok">${ICO.check}</span>
          <h2>Votre entreprise</h2>
          <p>Identité vérifiée. Dernière étape : les informations de l’entreprise — elles s’affichent chez tous les membres et pourront être modifiées dans « Personnaliser ».</p>
          <div class="bz-form">
            <label><span>Nom de l’entreprise <small>obligatoire</small></span><input id="su-name" maxlength="60" placeholder="Ex. Cabinet Durand" value="${esc(d.name || '')}" autocomplete="organization"></label>
            <div class="bz-form2">
              <label><span>SIREN ou SIRET <small>facultatif</small></span><input id="su-siret" inputmode="numeric" maxlength="17" placeholder="14 chiffres" value="${esc(d.siret || '')}"><small id="su-siret-msg" class="bz-fmsg"></small></label>
              <label><span>Secteur</span><select id="su-sector">${['Cabinet d’avocats', 'Études et formation', 'Santé', 'Conseil et audit', 'Collectivité, association', 'Commerce, services', 'Industrie', 'Autre'].map(s => `<option ${d.sector === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
              <label><span>Taille de l’équipe</span><select id="su-size">${['1 à 5', '6 à 10', '11 à 25', '26 à 50', 'plus de 50'].map(s => `<option ${d.size === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
              <label><span>E-mail de contact</span><input id="su-mail" type="email" value="${esc(d.contact || me.email)}" autocomplete="email"></label>
            </div>
            <div><span class="bz-lbl">Couleur de l’entreprise</span><div class="bz-colors">${['#2e8b6a', '#33658a', '#3d6bb5', '#8a4b9c', '#c04343', '#b3762a', '#1f2937'].map(c => `<button type="button" data-color="${c}" class="${(d.accent || '#2e8b6a') === c ? 'on' : ''}" style="--c:${c}" title="${c}"></button>`).join('')}</div></div>
            <div class="bz-wsum"><b>Récapitulatif</b><span>Offre de base · ${OFFER_SEATS.seats} employés dont ${OFFER_SEATS.plusSeats} licences Alixo+ · dirigeant : ${esc(me.name || me.email)} (${esc(me.email)})</span></div>
            <div class="bz-wacts"><button type="button" class="bz-btn primary big" id="su-create">Créer l’entreprise</button><span class="bz-muted">Le code d’invitation pour vos employés s’affiche juste après.</span></div>
          </div>
        </div>`;
    }
    return `<section class="bz-wizard"><div class="bz-whead"><span class="bz-kicker">Assistant</span><h1>Configurer votre entreprise</h1></div>${bar}${body}</section>`;
  }
  /* SIREN (9) / SIRET (14) : clé de Luhn */
  function luhnOk(digits) { let s = 0; for (let i = 0; i < digits.length; i++) { let n = +digits[digits.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; } return s % 10 === 0; }
  function siretCheck(v) { const d = String(v || '').replace(/\D/g, ''); if (!d) return { ok: true, d: '' }; if (d.length !== 9 && d.length !== 14) return { ok: false, d, msg: 'Un SIREN a 9 chiffres, un SIRET 14.' }; if (!luhnOk(d)) return { ok: false, d, msg: 'Ce numéro ne passe pas le contrôle de clé : vérifiez-le.' }; return { ok: true, d, msg: d.length === 14 ? 'SIRET valide' : 'SIREN valide' }; }
  function bindOffers(v) {
    v.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => { period = b.dataset.period; renderOffers(); }));
    v.querySelectorAll('[data-ov]').forEach(b => b.addEventListener('click', () => { oview = b.dataset.ov; try { history.replaceState(null, '', '#' + oview); } catch { /* */ } renderOffers(); window.scrollTo(0, 0); }));
    const sub = v.querySelector('[data-subscribe]'); if (sub) sub.addEventListener('click', () => (offerOpen() ? subscribe(sub.dataset.subscribe, sub) : openLeadModal(sub.dataset.subscribe)));
    const idb = v.querySelector('[data-identity]'); if (idb) idb.addEventListener('click', () => startIdentity(idb));
    const siret = v.querySelector('#su-siret');
    if (siret) {
      const msg = v.querySelector('#su-siret-msg');
      const upd = () => { const r = siretCheck(siret.value); msg.textContent = r.msg || ''; msg.className = 'bz-fmsg ' + (r.ok ? (r.d ? 'ok' : '') : 'bad'); setupDraft.siret = siret.value; };
      siret.addEventListener('input', upd); if (siret.value) upd();
      v.querySelector('#su-name').addEventListener('input', e => { setupDraft.name = e.target.value; });
      v.querySelector('#su-sector').addEventListener('change', e => { setupDraft.sector = e.target.value; });
      v.querySelector('#su-size').addEventListener('change', e => { setupDraft.size = e.target.value; });
      v.querySelector('#su-mail').addEventListener('input', e => { setupDraft.contact = e.target.value; });
      v.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { setupDraft.accent = b.dataset.color; v.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('on', x === b)); }));
      v.querySelector('#su-create').addEventListener('click', createCompany);
    }
  }
  async function subscribe(plan, btn) {
    if (busy) return; busy = true; btn.disabled = true; const t = btn.textContent; btn.textContent = 'Ouverture du paiement…';
    try {
      if (fake) { fake.log.push({ op: 'checkout', plan }); toast('Paiement simulé : ' + plan); return; }
      const r = await fetch(billingApi + '/business/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: await store.idToken(), plan, nonce: String(Date.now()) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.error || 'serveur de paiement indisponible');
      location.href = j.url;
    } catch (e) { toast('Paiement impossible : ' + (e && e.message || e)); }
    finally { busy = false; btn.disabled = false; btn.textContent = t; }
  }
  async function startIdentity(btn) {
    if (busy) return; busy = true; btn.disabled = true; const t = btn.textContent; btn.textContent = 'Ouverture de Stripe Identity…';
    try {
      if (fake) { fake.log.push({ op: 'identity' }); if (fake.verifyIdentity) await fake.verifyIdentity(); return; }
      const r = await fetch(billingApi + '/business/identity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: await store.idToken() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'service indisponible');
      if (j.verified) { toast('Identité déjà vérifiée'); return; }
      location.href = j.url;
    } catch (e) { toast('Vérification impossible : ' + (e && e.message || e)); }
    finally { busy = false; btn.disabled = false; btn.textContent = t; }
  }
  async function createCompany() {
    const name = String(setupDraft.name || $('#su-name').value || '').trim().slice(0, 60);
    if (name.length < 2) { toast('Indiquez le nom de l’entreprise'); $('#su-name').focus(); return; }
    const sr = siretCheck(setupDraft.siret || ''); if (!sr.ok) { toast(sr.msg); $('#su-siret').focus(); return; }
    const contact = String(setupDraft.contact || me.email).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) { toast('Adresse e-mail de contact invalide'); return; }
    if (busy) return; busy = true; const btn = $('#su-create'); btn.disabled = true; btn.textContent = 'Création…';
    const code = genCode(), t = now();
    const o = { name, ownerUid: me.uid, ownerEmail: me.email, ownerName: me.name || '', plan: 'basic', seats: OFFER_SEATS.seats, plusSeats: OFFER_SEATS.plusSeats, code, codeAt: t, disabled: false, by: 'self', createdAt: t, updatedAt: t,
      siret: sr.d, sector: setupDraft.sector || '', size: setupDraft.size || '', contact, identity: 'verified', subscription: bizSub && bizSub.subscription || '' };
    const member = { uid: me.uid, name: me.name || me.email.split('@')[0], email: me.email, emailLower: me.email, nameLower: norm(me.name || ''), role: 'owner', plus: true, joinedAt: t, lastSeen: 0, online: false };
    try {
      const id = await store.createOrg(o, member, code);
      if (store.setBrand && setupDraft.accent) { try { await store.setBrand(id, { accent: setupDraft.accent }); } catch { /* vitrine facultative */ } }
      toast(`Entreprise « ${name} » créée — code d’invitation ${code}`);
      setupDraft = {}; stopOffers();
      try { history.replaceState(null, '', '#invite'); } catch { /* */ }
      view = 'invite';
      startOrg(id);
    } catch (e) { fail(e); btn.disabled = false; btn.textContent = 'Créer l’entreprise'; }
    finally { busy = false; }
  }
  /* ---- pré-inscription (abonnement pas encore ouvert) ---- */
  function openLeadModal(plan) {
    const ov = $('#bz-modal');
    ov.innerHTML = `<div class="bz-modal" role="dialog" aria-modal="true" aria-labelledby="ld-title">
        <button type="button" class="bz-icon bz-mclose" data-close title="Fermer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        <span class="bz-kicker">Bientôt disponible</span>
        <h2 id="ld-title">Les abonnements Alixo Business ouvrent très bientôt</h2>
        <p>Le paiement en ligne n’est pas encore activé — rien ne sera débité aujourd’hui. Laissez-nous vos coordonnées : nous vous prévenons dès l’ouverture, au tarif annoncé (${fmtEur(PRICES.monthly)} par mois ou ${fmtEur(PRICES.yearly)} par an).</p>
        <div class="bz-form">
          <label><span>Nom de l’entreprise</span><input id="ld-company" maxlength="80" placeholder="Ex. Cabinet Durand" autocomplete="organization"></label>
          <div class="bz-form2">
            <label><span>Taille de l’équipe</span><select id="ld-size">${['1 à 5', '6 à 10', '11 à 25', '26 à 50', 'plus de 50'].map(s => `<option>${s}</option>`).join('')}</select></label>
            <label><span>E-mail</span><input id="ld-mail" type="email" value="${esc(me.email)}" autocomplete="email"></label>
          </div>
          <label><span>Un mot sur vos besoins <small>facultatif</small></span><textarea id="ld-note" rows="2" maxlength="600" placeholder="Ex. 8 collaborateurs, besoin de dossiers partagés et de la messagerie."></textarea></label>
          <div class="bz-formacts"><a class="bz-btn ghost" id="ld-mailto" href="#" target="_blank" rel="noopener">Envoyer plutôt un e-mail</a><button type="button" class="bz-btn primary" id="ld-ok">Me prévenir à l’ouverture</button></div>
        </div></div>`;
    ov.hidden = false;
    const close = () => { ov.hidden = true; ov.innerHTML = ''; };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
    const mailto = () => `mailto:contact@alixoapp.com?subject=${encodeURIComponent('Alixo Business — pré-inscription')}&body=${encodeURIComponent(`Bonjour,\n\nNous souhaitons être prévenus à l’ouverture des abonnements Alixo Business (formule ${plan === 'yearly' ? 'annuelle' : 'mensuelle'}).\n\nEntreprise : ${$('#ld-company').value}\nTaille de l’équipe : ${$('#ld-size').value}\nE-mail : ${$('#ld-mail').value}\n${$('#ld-note').value}\n`)}`;
    const upd = () => { $('#ld-mailto').href = mailto(); }; upd();
    ['#ld-company', '#ld-size', '#ld-mail', '#ld-note'].forEach(s => $(s).addEventListener('input', upd));
    $('#ld-ok').addEventListener('click', async () => {
      const company = $('#ld-company').value.trim(); const email = $('#ld-mail').value.trim();
      if (!company) { toast('Indiquez le nom de l’entreprise'); $('#ld-company').focus(); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Adresse e-mail invalide'); return; }
      const lead = { company, size: $('#ld-size').value, email, note: $('#ld-note').value.trim(), plan, name: me.name || '', createdAt: now() };
      try { if (store.setLead) await store.setLead(lead); toast('Merci ! Nous vous écrirons à l’ouverture des abonnements.'); close(); }
      catch (e) { toast('Enregistrement impossible (' + (e && e.message || e) + ') : utilisez le bouton e-mail.'); }
    });
    setTimeout(() => $('#ld-company').focus(), 50);
  }
  $('#bz-otabs').addEventListener('click', e => { const b = e.target.closest('[data-ov]'); if (!b) return; oview = b.dataset.ov; try { history.replaceState(null, '', '#' + oview); } catch { /* */ } renderOffers(); window.scrollTo(0, 0); });
  $('#theme2').addEventListener('click', () => $('#theme').click());

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
      stop(); showOffers();   // 1.35 : pas d'entreprise → les offres, puis l'assistant de création
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
    stop(); stopOffers();
    if (!user) { show('login'); return; }
    signedIn({ uid: user.uid, email: (user.email || '').toLowerCase(), name: user.displayName || (user.email || '').split('@')[0] });
  });
})();
