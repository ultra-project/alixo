/* ============================================================
   AlixoAI 1.44 — client du moteur d'IA local (window.AlixoEngine)
   ------------------------------------------------------------
   Version PC (Windows, Mac) : le modèle tourne sur l'ordinateur, dans un processus séparé piloté par le processus
   principal (engine/llm-host.js, pont alixoDesktop.llm de preload.js). Aucun texte ne part en ligne ; seul le modèle
   est téléchargé une fois, avec l'accord de l'utilisateur (fenêtre « Installer AlixoAI », app.js).
   Version web et téléphone : pas d'IA générative (état « web ») ; la correction pendant la frappe (js/grammaire.js,
   js/corr.js) reste disponible partout.
   Même contrat que l'ancien client en ligne, pour js/alixoai.js et js/corr.js :
     chat({ system, user, messages, maxTokens, temperature, timeoutMs, token, onToken, task, quiet })
        → { ok, text, raw, tokIn, tokOut, model: 'AlixoAI', finish } | { ok: false, status, code, error }
        onToken(texteCumulé, morceau) pendant la réponse ; status 499 = annulée ; jamais d'exception.
     cancel(token)   cancelVisible()   status() → { state, busy, waiting, task, tier, ctx, … }   MSG (textes)
     model() : profils, téléchargement, mode ; download(profile) ; cancelDownload() ; remove(profile) ;
     setPrefs({ profile, mode }) ; retry()
   États : 'web' | 'starting' | 'nomodel' | 'downloading' | 'idle' | 'loading' | 'ready' | 'busy' | 'unavailable'.
   Événements document : « alixo-ai-engine » (detail = status()) à chaque changement ; « alixo-ai-crash » (detail =
   { fallback, unavailable }) quand le moteur s'est arrêté.
   ============================================================ */
'use strict';

window.AlixoEngine = (() => {
  /* pont du moteur local : seulement s'il est complet (une version PC plus ancienne ou un faux pont n'en a pas) */
  const bridge = () => { const b = window.alixoDesktop && window.alixoDesktop.llm; return b && typeof b === 'object' && typeof b.chat === 'function' && typeof b.onEvent === 'function' ? b : null; };
  const DOWNLOAD_URL = 'https://alixoapp.com/index.html?site#telecharger';
  /* seule source des textes d'état et d'erreur d'AlixoAI (alixoai.js et app.js les lisent) */
  const MSG = {
    web: 'AlixoAI fonctionne dans l’application Alixo pour Windows et Mac.',
    nomodel: 'AlixoAI n’est pas encore installée sur cet ordinateur : un seul téléchargement suffit (Paramètres › IA).',
    downloading: 'AlixoAI est en cours de téléchargement. Suivez la progression dans Paramètres › IA.',
    loading: 'AlixoAI se prépare (chargement du modèle)…',
    unavailable: 'AlixoAI s’est arrêtée deux fois de suite. Elle est en pause pour protéger l’ordinateur : Paramètres › IA › Réessayer.',
    unreachable: 'AlixoAI ne répond pas pour le moment. Réessayez.',
    timeout: 'AlixoAI met trop de temps à répondre. Réessayez avec un texte plus court.',
    cancelled: 'Demande annulée.',
    broken: 'AlixoAI n’a pas pu répondre. Réessayez.',
    plus: 'AlixoAI fait partie d’Alixo+.',
    off: 'AlixoAI est désactivée (Paramètres › IA › Activer).',
    cpu: 'AlixoAI passe en mode processeur : la carte graphique de cet ordinateur ne l’a pas supportée. Les réponses seront nettement plus lentes.'
  };
  let st = { state: bridge() ? 'starting' : 'web', busy: false, waiting: 0, task: '', tier: 'cpu', ctx: 4096, profiles: {}, profile: '', recommended: '', download: null, mode: 'gpu', gpuCapable: false };
  const jobs = new Map();   // id → { token, onToken, text, quiet }
  let seq = 0;
  const emit = () => { try { document.dispatchEvent(new CustomEvent('alixo-ai-engine', { detail: status() })); } catch { /* hors document */ } };

  function status() { return Object.assign({}, st); }
  function apply(s) { if (s && typeof s === 'object' && s.state) { st = s; emit(); } }
  async function refresh() { const b = bridge(); if (!b) return status(); try { apply(await b.status()); } catch { /* moteur pas encore prêt */ } return status(); }

  if (bridge()) {
    bridge().onEvent(ev => {
      if (!ev || typeof ev !== 'object') return;
      if (ev.type === 'token') { const j = jobs.get(ev.id); if (j) { j.text += ev.t; if (j.onToken) { try { j.onToken(j.text, ev.t); } catch { /* lecteur */ } } } return; }
      if (ev.type === 'reset') { const j = jobs.get(ev.id); if (j) j.text = ''; return; }   // la demande repart (moteur relancé)
      if (ev.type === 'state') { apply(ev.status); return; }
      /* progression : l'état ne passe à « downloading » que si AlixoAI attendait ce modèle (sinon elle reste utilisable) */
      if (ev.type === 'progress') { st = Object.assign({}, st, { state: st.state === 'nomodel' ? 'downloading' : st.state, download: { profile: ev.profile, received: ev.received, total: ev.total, bps: ev.bps } }); emit(); return; }
      if (ev.type === 'crash') { try { document.dispatchEvent(new CustomEvent('alixo-ai-crash', { detail: { fallback: ev.fallback || '', unavailable: !!ev.unavailable } })); } catch { /* */ } }
    });
    refresh();
  }

  async function chat(o) {
    o = o || {};
    const b = bridge();
    if (!b) return { ok: false, status: 0, code: 'web', error: MSG.web };
    const task = o.task || 'correct';
    const messages = Array.isArray(o.messages) && o.messages.length ? o.messages.map(m => ({ role: m.role, content: String(m.content || '') }))
      : [{ role: 'system', content: String(o.system || '') }, { role: 'user', content: String(o.user || '') }].filter(m => m.content || m.role === 'user');
    const id = String(o.token || 'ai').replace(/[^\w.:-]/g, '').slice(0, 40) + '.' + (++seq);
    const job = { token: o.token || '', onToken: typeof o.onToken === 'function' ? o.onToken : null, text: '', quiet: !!o.quiet };
    jobs.set(id, job);
    try {
      const r = await b.chat({ id, task, messages, maxTokens: o.maxTokens, temperature: o.temperature, quiet: !!o.quiet, timeoutMs: o.timeoutMs, stream: !!job.onToken });
      if (r && r.ok) { const raw = typeof r.raw === 'string' ? r.raw : job.text; return { ok: true, text: raw, raw, finish: r.finish || 'stop', tokIn: +r.tokIn || 0, tokOut: +r.tokOut || 0, model: 'AlixoAI' }; }
      const code = (r && r.code) || 'broken';
      return { ok: false, status: (r && r.status) || 0, code, error: (r && r.error) || MSG[code] || MSG.broken };
    } catch (e) {
      console.warn('AlixoAI :', e && e.message || e);
      return { ok: false, status: 0, code: 'broken', error: MSG.broken };
    } finally { jobs.delete(id); }
  }
  function cancel(token) { const b = bridge(); if (!b || !token) return; for (const [id, j] of jobs) if (j.token === token) b.cancel(id).catch(() => {}); }
  /* bouton « Annuler » de la barre d'attente : les demandes visibles (F7, mise en forme), pas le quiz ni la fiche */
  function cancelVisible() { const b = bridge(); if (b) b.cancelVisible().catch(() => {}); }

  /* ---------------- modèle ---------------- */
  const call = async (fn, arg) => { const b = bridge(); if (!b) return { ok: false, code: 'web', error: MSG.web }; try { const r = await b[fn](arg); refresh(); return r; } catch (e) { return { ok: false, code: 'broken', error: (e && e.message) || MSG.broken }; } };
  const download = profile => call('ensureModel', { profile });
  const cancelDownload = () => call('cancelDownload');
  const remove = profile => call('removeModel', { profile });
  const setPrefs = p => call('setPrefs', p);
  const retry = () => call('retry');
  const model = () => status();

  return { chat, cancel, cancelVisible, status, refresh, model, download, cancelDownload, remove, setPrefs, retry, MSG, DOWNLOAD_URL, local: () => !!bridge() };
})();
