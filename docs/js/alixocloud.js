/* ============================================================
   AlixoAI en ligne — client du serveur d'IA d'Alixo (1.43)
   ------------------------------------------------------------
   Remplace le moteur sur l'appareil (WebGPU, retiré : il saturait la carte graphique et faisait planter Alixo).
   La correction approfondie (F7), la mise en forme, le Quiz IA et les fiches de révision envoient le texte concerné au
   serveur d'Alixo (dossier ai/ du dépôt), avec le jeton du compte dans l'en-tête ; rien n'y est conservé. La correction
   pendant la frappe, elle, ne passe jamais par ici (js/grammaire.js, js/corr.js).
   Adresse : window.ALIXO_AI.api (firebase-config.js), sinon https://ai.alixoapp.com ; cloudconfig.js peut la remplacer
   par config/public.aiApi (configure()). Liste blanche d'hôtes (le jeton du compte y est envoyé) : https://ai.alixoapp.com,
   https://alixo-ai.<compte>.workers.dev, et http(s)://localhost ou 127.0.0.1 pour le développement ; toute autre adresse
   est ignorée.
   Messages : MSG ci-dessous est la seule source des textes d'état et d'erreur d'AlixoAI (alixoai.js et app.js les lisent).
   API (window.AlixoCloudAI) — même contrat que l'ancien moteur, pour js/alixoai.js :
     chat({ system, user, messages, maxTokens, temperature, timeoutMs, token, onToken, task, quiet })
        → { ok, text, raw, tokIn, tokOut, model: 'AlixoAI', finish, quota } | { ok: false, status, code, error }
        onToken(texteCumulé, morceau) pendant la réponse (flux) ; status 499 = annulée ; jamais d'exception.
     cancel(token)          annule les demandes portant ce jeton ; cancelVisible() : celles affichées dans la barre d'attente
     status()               { state: 'ready'|'offline'|'signedout'|'unconfigured'|'limit', busy, waiting, unreachable }
     configure({ api, getToken })   adresse du serveur, fournisseur du jeton d'identité (cloudconfig.js, tests)
     api()                  adresse en cours
   Événement document « alixo-ai-cloud » (detail = status()) à chaque changement.
   ============================================================ */
'use strict';

window.AlixoCloudAI = (() => {
  const DEFAULT_API = 'https://ai.alixoapp.com';
  /* adresse acceptée seulement si l'hôte est en liste blanche (un administrateur compromis ne peut pas détourner les jetons) */
  const AI_HOSTS = /^(ai\.alixoapp\.com|alixo-ai\.[a-z0-9-]+\.workers\.dev)$/;
  const LOCAL = /^(localhost|127\.0\.0\.1)$/;
  const clean = u => {
    const s = String(u || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^/?#]+$/i.test(s)) return '';   // origine seule : ni chemin, ni requête, ni identifiants
    let x; try { x = new URL(s); } catch { return ''; }
    if (x.username || x.password) return '';
    const host = x.hostname.toLowerCase();
    if (x.protocol === 'https:' && !x.port && AI_HOSTS.test(host)) return s;
    if ((x.protocol === 'http:' || x.protocol === 'https:') && LOCAL.test(host)) return s;
    return '';
  };
  let api = clean(window.ALIXO_AI && window.ALIXO_AI.api) || DEFAULT_API;
  let getToken = null;
  let unreachable = false;           // le serveur n'a pas répondu alors que l'appareil est en ligne (pas encore ouvert ?)
  let limitUntil = 0;                // quota du jour atteint
  const jobs = new Set();            // { token, ctrl, quiet }

  /* seule source des textes : « unreachable » = le serveur ne répond pas (panne, réseau) ; « unconfigured » = le service
     n'est vraiment pas ouvert (aucune adresse valable) */
  const MSG = {
    offline: 'Hors ligne : AlixoAI a besoin d’Internet. La correction pendant la frappe continue sur l’appareil.',
    signedout: 'Connectez-vous à votre compte Alixo pour utiliser AlixoAI.',
    unreachable: 'AlixoAI ne répond pas pour le moment. Réessayez dans quelques minutes ; la correction pendant la frappe continue sur l’appareil.',
    unconfigured: 'AlixoAI n’est pas encore disponible. La correction pendant la frappe continue sur l’appareil.',
    limit: 'Limite du jour atteinte : AlixoAI sera de nouveau disponible demain.',
    plus: 'AlixoAI en ligne fait partie d’Alixo+.',
    timeout: 'AlixoAI met trop de temps à répondre. Réessayez.',
    cancelled: 'Demande annulée.',
    broken: 'La réponse d’AlixoAI a été interrompue. Réessayez.',
    reauth: 'Reconnectez-vous à votre compte Alixo pour utiliser AlixoAI.',
    off: 'AlixoAI est désactivée (Paramètres › IA › Réactiver).'
  };
  MSG.unavailable = MSG.unreachable;   // nom historique

  function online() { try { return navigator.onLine !== false; } catch { return true; } }
  function firebaseUser() { try { return window.firebase && firebase.apps && firebase.apps.length && firebase.auth().currentUser || null; } catch { return null; } }
  function tokenSource() { if (getToken) return getToken; const u = firebaseUser(); return u ? () => u.getIdToken() : null; }
  function status() {
    const visible = [...jobs].filter(j => !j.quiet);
    const waiting = visible.length;
    const base = { busy: jobs.size > 0, waiting, unreachable, task: waiting ? visible[visible.length - 1].task : '' };
    if (!api) return Object.assign({ state: 'unconfigured' }, base);
    if (!online()) return Object.assign({ state: 'offline' }, base);
    if (!tokenSource()) return Object.assign({ state: 'signedout' }, base);
    if (limitUntil > Date.now()) return Object.assign({ state: 'limit' }, base);
    return Object.assign({ state: 'ready' }, base);
  }
  const emit = () => { try { document.dispatchEvent(new CustomEvent('alixo-ai-cloud', { detail: status() })); } catch { /* hors document */ } };
  try { window.addEventListener('online', () => { unreachable = false; emit(); }); window.addEventListener('offline', emit); } catch { /* hors fenêtre */ }

  function configure(o) {
    o = o || {};
    if ('api' in o) { const u = clean(o.api); if (u || !o.api) { if (u !== api) unreachable = false; api = u || DEFAULT_API; } }
    if (typeof o.getToken === 'function') getToken = o.getToken;
    emit();
  }

  /* lecture du flux normalisé du serveur : « data: {"t"} », « event: done », « event: error » */
  async function readStream(res, onToken) {
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = '', text = '', done = null, error = null;
    const handle = block => {
      let ev = 'message', data = '';
      for (const line of block.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
      if (!data) return;
      let j; try { j = JSON.parse(data); } catch { return; }
      if (ev === 'done') done = j || {};
      else if (ev === 'error') error = j || {};
      else if (j && typeof j.t === 'string') { text += j.t; if (onToken) { try { onToken(text, j.t); } catch { /* lecteur */ } } }
    };
    for (;;) {
      const { value, done: end } = await reader.read(); if (end) break;
      buf += dec.decode(value, { stream: true }).replace(/\r/g, '');
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 2); }
    }
    if (buf.trim()) handle(buf);
    return { text, done, error };
  }

  async function chat(o) {
    o = o || {};
    const task = o.task || 'correct';
    const messages = Array.isArray(o.messages) && o.messages.length ? o.messages.map(m => ({ role: m.role, content: String(m.content || '') }))
      : [{ role: 'system', content: String(o.system || '') }, { role: 'user', content: String(o.user || '') }].filter(m => m.content || m.role === 'user');
    if (!api) return { ok: false, status: 0, code: 'unavailable', error: MSG.unconfigured };
    if (!online()) { emit(); return { ok: false, status: 0, code: 'offline', error: MSG.offline }; }
    const src = tokenSource(); if (!src) return { ok: false, status: 401, code: 'auth', error: MSG.signedout };
    if (limitUntil > Date.now() && task !== 'ping') return { ok: false, status: 429, code: 'quota', error: MSG.limit };
    const ctrl = new AbortController(); const job = { token: o.token || '', ctrl, quiet: !!o.quiet, why: '', task };
    jobs.add(job); emit();
    const timer = setTimeout(() => { job.why = 'timeout'; ctrl.abort(); }, Math.max(5000, +o.timeoutMs || 120000));
    try {
      let idToken;
      try { idToken = await src(); } catch { return { ok: false, status: 401, code: 'auth', error: MSG.signedout }; }
      if (!idToken) return { ok: false, status: 401, code: 'auth', error: MSG.signedout };
      const stream = typeof o.onToken === 'function';
      let res;
      try {
        res = await fetch(api + '/v1/chat', { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + idToken },
          body: JSON.stringify({ task, messages, maxTokens: o.maxTokens, temperature: o.temperature, stream }) });
      } catch (e) {
        if (job.why === 'cancel') return { ok: false, status: 499, code: 'cancelled', error: MSG.cancelled };
        if (job.why === 'timeout') return { ok: false, status: 0, code: 'timeout', error: MSG.timeout };
        if (!online()) return { ok: false, status: 0, code: 'offline', error: MSG.offline };
        unreachable = true;
        return { ok: false, status: 503, code: 'unavailable', error: MSG.unavailable };
      }
      const type = res.headers.get('content-type') || '';
      if (!res.ok) {
        let j = null; if (/json/.test(type)) { try { j = await res.json(); } catch { j = null; } }
        if (!j || !j.code) { unreachable = res.status === 404 || res.status === 405 || res.status >= 500; return { ok: false, status: res.status || 503, code: 'unavailable', error: res.status >= 500 && j && j.error ? j.error : MSG.unavailable }; }
        unreachable = false;
        if (res.status === 429 && j.code === 'quota') { const ra = +j.retryAfter || 0; if (ra > 300) limitUntil = Date.now() + ra * 1000; return { ok: false, status: 429, code: 'quota', error: ra > 300 ? MSG.limit : (j.error || MSG.limit), retryAfter: ra }; }
        if (res.status === 403) return { ok: false, status: 403, code: j.code, error: MSG.plus };
        if (res.status === 401) return { ok: false, status: 401, code: 'auth', error: MSG.reauth };
        return { ok: false, status: res.status, code: j.code, error: j.error || MSG.unavailable };
      }
      unreachable = false;
      if (/event-stream/.test(type) && res.body) {
        let r;
        try { r = await readStream(res, o.onToken); }
        catch {
          if (job.why === 'cancel') return { ok: false, status: 499, code: 'cancelled', error: MSG.cancelled };
          if (job.why === 'timeout') return { ok: false, status: 0, code: 'timeout', error: MSG.timeout };
          return { ok: false, status: 0, code: 'broken', error: online() ? MSG.broken : MSG.offline };
        }
        if (r.error) return { ok: false, status: 503, code: r.error.code || 'ai_unavailable', error: r.error.error || MSG.broken };
        if (!r.done) {
          if (job.why === 'cancel') return { ok: false, status: 499, code: 'cancelled', error: MSG.cancelled };
          if (job.why === 'timeout') return { ok: false, status: 0, code: 'timeout', error: MSG.timeout };
          return { ok: false, status: 0, code: 'broken', error: MSG.broken };
        }
        const u = r.done.usage || {};
        return { ok: true, text: r.text, raw: r.text, finish: r.done.finish || 'stop', tokIn: +u.in || 0, tokOut: +u.out || 0, model: 'AlixoAI', quota: r.done.quota || null };
      }
      let j; try { j = await res.json(); } catch { return { ok: false, status: 503, code: 'unavailable', error: MSG.unavailable }; }
      if (!j || typeof j.text !== 'string') return { ok: false, status: 503, code: 'unavailable', error: MSG.unavailable };
      const u = j.usage || {};
      return { ok: true, text: j.text, raw: j.text, finish: j.finish || 'stop', tokIn: +u.in || 0, tokOut: +u.out || 0, model: 'AlixoAI', quota: j.quota || null };
    } catch (e) {
      if (job.why === 'cancel') return { ok: false, status: 499, code: 'cancelled', error: MSG.cancelled };
      if (job.why === 'timeout') return { ok: false, status: 0, code: 'timeout', error: MSG.timeout };
      console.warn('AlixoAI :', e && e.message || e);
      return { ok: false, status: 0, code: 'error', error: MSG.broken };
    } finally { clearTimeout(timer); jobs.delete(job); emit(); }
  }
  function cancel(token) { if (!token) return; for (const j of jobs) if (j.token === token) { j.why = 'cancel'; try { j.ctrl.abort(); } catch { /* */ } } }
  /* bouton « Annuler » de la barre d'attente : les demandes visibles (F7, mise en forme), pas le quiz ni la fiche */
  function cancelVisible() { for (const j of jobs) if (!j.quiet) { j.why = 'cancel'; try { j.ctrl.abort(); } catch { /* */ } } }

  return { chat, cancel, cancelVisible, status, configure, api: () => api, clean, MSG, DEFAULT_API };
})();
