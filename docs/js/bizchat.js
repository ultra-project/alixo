/* ============================================================
   Messagerie de l'équipe (1.33) — Alixo Business, option premium (entreprises de 50 employés et plus)
   Activée par Alixo sur l'entreprise (orgs/{id}.chat = true, panneau admin). Un volet à droite :
   « Toute l'équipe » + une conversation privée avec chaque collègue (présence en direct, non lus).
   - orgs/{id}/convs/{all | dm_<uid>_<uid>} → { parts, lastAt, lastBy, lastByName, lastText }
   - orgs/{id}/convs/{cid}/msgs/{id}        → { by, byName, text, at }
   Bouton « Messagerie » de la bibliothèque ; notification dans la cloche. Chargé APRÈS business.js.
   ============================================================ */
'use strict';

window.AlixoBizChat = (() => {
  const B = window.AlixoBusiness;
  if (!B || !B.enabled) return { open() {}, close() {}, sync() {}, unread: () => 0 };
  const ICO = '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9h8M8 12h5"/></svg>';
  const t0 = Date.now();
  let oid = '', convs = {}, unsubs = [], msgUnsub = null, cur = '', msgs = [], panel = null, view = 'list';
  const me = () => B.me.uid;
  const readKey = () => 'alixo.chatRead.' + oid;
  let read = {};
  const loadRead = () => { try { read = JSON.parse(localStorage.getItem(readKey())) || {}; } catch { read = {}; } };
  const markRead = cid => { const c = convs[cid]; read[cid] = Math.max(Date.now(), c && c.lastAt || 0); try { localStorage.setItem(readKey(), JSON.stringify(read)); } catch { /* */ } };
  const dmId = u => 'dm_' + [me(), u].sort().join('_');
  const otherOf = cid => { if (cid === 'all') return ''; const p = cid.slice(3); return p.startsWith(me() + '_') ? p.slice(me().length + 1) : p.endsWith('_' + me()) ? p.slice(0, -me().length - 1) : ''; };
  const member = u => B.members().find(m => m.uid === u) || null;
  const isOnline = m => !!(m && m.lastSeen && Date.now() - m.lastSeen < 5 * 60000);
  const titleOf = cid => cid === 'all' ? 'Toute l’équipe' : ((member(otherOf(cid)) || {}).name || 'Collègue');
  const isUnread = c => !!(c && c.lastAt && c.lastBy !== me() && c.lastAt > (read[c.id] || 0));
  const unread = () => Object.values(convs).filter(isUnread).length;
  const hhmm = ts => { const d = new Date(ts); const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const initial = s => (s || '?').trim()[0].toUpperCase();

  /* ---------------- données ---------------- */
  function stop() { unsubs.forEach(u => { try { u(); } catch { /* */ } }); unsubs = []; if (msgUnsub) { try { msgUnsub(); } catch { /* */ } msgUnsub = null; } convs = {}; oid = ''; }
  function onConv(c) {
    if (!c) return;
    const prev = convs[c.id];
    convs[c.id] = c;
    const open = panel && !panel.hidden && view === 'conv' && cur === c.id && !document.hidden;
    if (open) markRead(c.id);
    else if (isUnread(c) && c.lastAt > t0 && (!prev || prev.lastAt !== c.lastAt) && window.AlixoNotify) {
      AlixoNotify.push({ id: 'chat_' + c.id + '_' + c.lastAt, kind: 'chat', title: c.id === 'all' ? `${c.lastByName || 'Un collègue'} · Toute l’équipe` : `Message de ${c.lastByName || 'un collègue'}`, text: c.lastText || '', action: { type: 'chat', cid: c.id } });
    }
  }
  /* appelé par business.js à chaque changement (entreprise, membres, option) */
  function sync() {
    const on = B.chatOn();
    const nid = on ? B.orgId() : '';
    if (nid !== oid) {
      stop();
      if (nid) {
        oid = nid; loadRead();
        unsubs.push(B.store.listenConvs(oid, list => { list.forEach(onConv); paint(); }));
        unsubs.push(B.store.listenConvAll(oid, c => { onConv(c); paint(); }));
      } else if (panel) close();
    }
    paint();
  }

  /* ---------------- interface ---------------- */
  function navBtn() {
    let b = $('#ln-chat');
    if (!b) {
      const after = $('#ln-todo'); if (!after) return null;
      b = document.createElement('button');
      b.id = 'ln-chat'; b.className = 'ln-agenda ln-chat'; b.type = 'button';
      b.title = 'Messagerie de l’équipe (Alixo Business)';
      b.innerHTML = `${ICO}<span>Messagerie</span><span class="ln-next" id="chat-badge" hidden></span>`;
      b.addEventListener('click', () => (panel && !panel.hidden ? close() : open()));
      after.insertAdjacentElement('afterend', b);
    }
    return b;
  }
  function paint() {
    const b = navBtn();
    if (b) { b.hidden = !oid; const n = unread(); const bd = b.querySelector('#chat-badge'); bd.textContent = n; bd.hidden = !n; }
    if (!panel || panel.hidden) return;
    if (view === 'list') renderList(); else renderHead();
  }
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('aside');
    panel.id = 'bzchat'; panel.hidden = true;
    panel.innerHTML = `<header class="bzc-head"></header><div class="bzc-body"></div><form class="bzc-form" hidden><textarea rows="1" placeholder="Écrire un message…" maxlength="4000"></textarea><button class="cta" type="submit" title="Envoyer (Entrée)"><svg viewBox="0 0 24 24"><path d="M4 12 20 4l-6 16-3-7Z"/></svg></button></form>`;
    document.body.appendChild(panel);
    panel.addEventListener('click', e => {
      if (e.target.closest('[data-bzc-close]')) { close(); return; }
      if (e.target.closest('[data-bzc-back]')) { showList(); return; }
      const c = e.target.closest('[data-cid]'); if (c) openConv(c.dataset.cid);
    });
    const form = panel.querySelector('.bzc-form'); const ta = form.querySelector('textarea');
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = ta.value.trim(); if (!text || !cur) return;
      ta.value = ''; ta.style.height = 'auto';
      const parts = cur === 'all' ? ['*'] : [me(), otherOf(cur)].sort();
      try { await B.store.sendMsg(oid, cur, parts, text); markRead(cur); } catch (err) { ta.value = text; toast('Message non envoyé : ' + (err && err.message || err)); }
    });
    return panel;
  }
  function renderList() {
    const p = panel; view = 'list';
    p.querySelector('.bzc-head').innerHTML = `<div class="bzc-ht"><b>Messagerie</b><small>${esc((B.org() || {}).name || 'Entreprise')}</small></div><button type="button" class="bzc-x" data-bzc-close title="Fermer (Échap)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    p.querySelector('.bzc-form').hidden = true;
    const row = (cid, name, sub, av, online) => { const c = convs[cid]; return `<button type="button" class="bzc-conv ${isUnread(c) ? 'unread' : ''}" data-cid="${esc(cid)}"><span class="bzc-av ${online ? 'on' : ''}">${av}</span><span class="bzc-ct"><b>${esc(name)}</b><small>${c && c.lastText ? esc((c.lastBy === me() ? 'Vous : ' : (cid === 'all' ? (c.lastByName || '') + ' : ' : '')) + c.lastText) : esc(sub)}</small></span>${c && c.lastAt ? `<time>${esc(hhmm(c.lastAt))}</time>` : ''}</button>`; };
    const others = B.members().filter(m => m.uid !== me()).sort((a, b) => ((convs[dmId(b.uid)] || {}).lastAt || 0) - ((convs[dmId(a.uid)] || {}).lastAt || 0) || isOnline(b) - isOnline(a) || (a.name || '').localeCompare(b.name || ''));
    p.querySelector('.bzc-body').innerHTML = `<div class="bzc-list">${row('all', 'Toute l’équipe', `${B.members().length} membres`, ICO, false)}
      <div class="bzc-sect">Collègues</div>${others.map(m => row(dmId(m.uid), m.name || m.email, isOnline(m) ? 'en ligne' : (m.email || ''), esc(initial(m.name || m.email)), isOnline(m))).join('') || '<div class="bzc-empty">Personne d’autre dans l’entreprise pour l’instant.</div>'}</div>`;
  }
  function renderHead() {
    const o = member(otherOf(cur));
    panel.querySelector('.bzc-head').innerHTML = `<button type="button" class="bzc-x" data-bzc-back title="Conversations"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button><div class="bzc-ht"><b>${esc(titleOf(cur))}</b><small>${cur === 'all' ? `${B.members().length} membres · ${B.members().filter(isOnline).length} en ligne` : isOnline(o) ? 'en ligne' : 'hors ligne'}</small></div><button type="button" class="bzc-x" data-bzc-close title="Fermer (Échap)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
  }
  function renderMsgs() {
    const body = panel.querySelector('.bzc-body');
    let last = null;
    body.innerHTML = `<div class="bzc-msgs">${msgs.length ? msgs.map(m => { const mine = m.by === me(); const grp = last && last.by === m.by && m.at - last.at < 300000; last = m; return `<div class="bzc-msg ${mine ? 'mine' : ''} ${grp ? 'grp' : ''}">${!mine && !grp && cur === 'all' ? `<em>${esc(m.byName || '')}</em>` : ''}<p>${esc(m.text).replace(/\n/g, '<br>')}</p>${grp ? '' : `<time>${esc(hhmm(m.at))}</time>`}</div>`; }).join('') : `<div class="bzc-empty">${cur === 'all' ? 'Premier message à toute l’équipe ?' : 'Écrivez le premier message à ' + esc(titleOf(cur)) + '.'}</div>`}</div>`;
    const box = body.querySelector('.bzc-msgs'); box.scrollTop = box.scrollHeight;
  }
  function openConv(cid) {
    ensurePanel(); cur = cid; view = 'conv'; msgs = [];
    if (msgUnsub) { try { msgUnsub(); } catch { /* */ } }
    renderHead(); renderMsgs();
    panel.querySelector('.bzc-form').hidden = false;
    msgUnsub = B.store.listenMsgs(oid, cid, list => { msgs = list; if (view === 'conv' && cur === cid) { renderMsgs(); markRead(cid); paint(); } });
    markRead(cid); paint();
    setTimeout(() => panel.querySelector('textarea').focus(), 0);
  }
  function showList() { if (msgUnsub) { try { msgUnsub(); } catch { /* */ } msgUnsub = null; } cur = ''; renderList(); }
  function open(cid) {
    if (!oid) { if (B.active()) toast('La messagerie est une option d’Alixo Business pour les entreprises de 50 employés et plus'); return; }
    ensurePanel(); panel.hidden = false;
    if (cid) openConv(cid); else renderList();
  }
  function close() { if (!panel) return; panel.hidden = true; if (msgUnsub) { try { msgUnsub(); } catch { /* */ } msgUnsub = null; } view = 'list'; cur = ''; }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel && !panel.hidden && !$('.dlgov')) close(); });

  setTimeout(sync, 0);
  return { open, close, sync, unread, isOpen: () => !!(panel && !panel.hidden) };
})();
