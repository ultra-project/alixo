/* ============================================================
   Alixo — IA dans l'application : le modèle tourne sur l'appareil de l'utilisateur (1.36)
   ------------------------------------------------------------
   Le modèle de langue est téléchargé une seule fois (0,4 à 2,4 Go selon la taille choisie) puis exécuté
   directement dans le navigateur ou dans la version PC, sur la carte graphique, grâce à WebLLM
   (github.com/mlc-ai/web-llm, Apache 2.0, livré dans js/vendor/web-llm.js et chargé à la demande).
   - aucun serveur, aucune clé, aucun compte, aucune limite d'usage : rien ne quitte l'appareil ;
   - les poids viennent de huggingface.co (dépôts mlc-ai/*), gardés ensuite dans le cache du navigateur
     (Cache API, ou IndexedDB quand la Cache API n'est pas disponible) ;
   - il faut WebGPU : Chrome / Edge / Opera récents, Safari 26, Firefox 141+ (Windows), la version PC
     d'Alixo ; sans WebGPU, l'application le dit et propose les serveurs (Paramètres › IA).
   API (window.AlixoLocalAI) :
     MODELS                       catalogue { cle: { id, label, dl, vram, desc } }
     support()                    { ok, reason } — WebGPU présent ? (synchrone)
     probe()                      → { ok, reason, vendor, memory, recommended }  (demande un adaptateur GPU)
     recommend()                  clé conseillée pour cet appareil (après probe, sinon heuristique)
     cached(key)                  → Promise<bool> : le modèle est déjà sur l'appareil
     load(key, onProgress)        → Promise<engine> : télécharge si besoin puis charge sur la carte graphique
     chat({ system, user, maxTokens, temperature, json, timeoutMs }) → { ok, text, tokIn, tokOut, model } | { ok:false, error }
     status()                     { state: 'idle'|'loading'|'ready'|'error', key, progress, text, phase }
     unload(), remove(key)        libère la mémoire / efface le modèle de l'appareil
   Événement document « alixo-ai-local » (detail = status()) à chaque changement : app.js affiche la progression.
   ============================================================ */
'use strict';

window.AlixoLocalAI = (() => {
  const BASE = (() => { try { return new URL('.', document.currentScript.src); } catch { return new URL('js/', location.href); } })();
  const LIB_URL = new URL('vendor/web-llm.js', BASE).href;

  /* Qwen3 (Alibaba, Apache 2.0), poids quantifiés q4f16 préparés par MLC : très bon en français pour sa taille,
     « réflexion » désactivée à chaque requête (réponses JSON directes). dl = téléchargement, vram = mémoire graphique. */
  /* 1.36.1 : deux variantes par taille — q4f16 (calculs en demi-précision, plus légère) quand la carte graphique
     expose l'extension WebGPU « shader-f16 », sinon q4f32 (même modèle, même téléchargement à peu près, un peu
     plus de mémoire graphique). Sans ce choix, les shaders f16 ne compilent pas sur certaines cartes / pilotes
     (« Invalid ShaderModule … entryPoint: index_kernel »). */
  const MODELS = {
    leger:     { id: 'Qwen3-0.6B-q4f16_1-MLC', id32: 'Qwen3-0.6B-q4f32_1-MLC', label: 'Léger',    dl: '0,4 Go', vram: 1.4, vram32: 1.9, ctx: 8192, desc: 'Ordinateur modeste ou téléphone récent.' },
    equilibre: { id: 'Qwen3-1.7B-q4f16_1-MLC', id32: 'Qwen3-1.7B-q4f32_1-MLC', label: 'Équilibré', dl: '1,1 Go', vram: 2.1, vram32: 2.6, ctx: 8192, desc: 'La plupart des portables.' },
    complet:   { id: 'Qwen3-4B-q4f16_1-MLC',   id32: 'Qwen3-4B-q4f32_1-MLC',   label: 'Complet',  dl: '2,4 Go', vram: 3.5, vram32: 4.3, ctx: 8192, desc: 'Carte graphique ou Mac récent : le plus précis.' }
  };
  const F32_LS = 'alixo.ai.f32';   // '1' : les shaders f16 ont échoué sur cet appareil → variantes f32 désormais
  let forceF32 = false; try { forceF32 = localStorage.getItem(F32_LS) === '1'; } catch { /* stockage indisponible */ }
  const useF32 = () => forceF32 || (probed && probed.ok && probed.f16 === false);
  const idFor = key => { const m = MODELS[key] || MODELS[DEFAULT_KEY]; return useF32() ? m.id32 : m.id; };
  const vramFor = key => { const m = MODELS[key] || MODELS[DEFAULT_KEY]; return useF32() ? m.vram32 : m.vram; };
  const ORDER = ['leger', 'equilibre', 'complet'];
  const DEFAULT_KEY = 'equilibre';

  let lib = null;                // module WebLLM (importé à la première demande)
  let engine = null;             // MLCEngine chargé
  let loading = null;            // Promise en cours de load()
  let queue = Promise.resolve(); // les requêtes se suivent : un seul passage GPU à la fois
  let noGrammar = false;         // la grammaire JSON a échoué sur cet appareil : réponses libres (JSON demandé par la consigne)
  const OBJECT_SCHEMA = '{"type":"object"}';
  const st = { state: 'idle', key: '', progress: 0, text: '', phase: '', error: '' };
  let probed = null;             // résultat de probe()

  const emit = () => { try { document.dispatchEvent(new CustomEvent('alixo-ai-local', { detail: status() })); } catch { /* hors document */ } };
  function status() { return { state: st.state, key: st.key, model: st.key && MODELS[st.key] ? idFor(st.key) : '', progress: st.progress, text: st.text, phase: st.phase, error: st.error }; }
  function set(patch) { Object.assign(st, patch); emit(); }

  /* ---------------- l'appareil peut-il faire tourner le modèle ? ---------------- */
  function support() {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      const ua = navigator.userAgent || '';
      const why = /firefox/i.test(ua) ? 'Firefox n’active WebGPU que depuis la version 141 (Windows) : mettez-le à jour ou utilisez Chrome, Edge ou la version PC d’Alixo.'
        : /safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua) ? 'Safari active WebGPU à partir de Safari 26 (macOS Tahoe, iOS 26). Mettez-le à jour ou utilisez Chrome ou Edge.'
        : 'Ce navigateur ne propose pas WebGPU, nécessaire pour faire tourner le modèle sur l’appareil. Utilisez Chrome ou Edge récents, ou la version PC d’Alixo.';
      return { ok: false, reason: why };
    }
    return { ok: true, reason: '' };
  }
  async function probe() {
    if (probed) return probed;
    const s = support();
    if (!s.ok) return (probed = { ok: false, reason: s.reason, recommended: 'leger' });
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return (probed = { ok: false, reason: 'WebGPU est présent mais aucune carte graphique utilisable n’a été trouvée (pilotes graphiques à mettre à jour ?).', recommended: 'leger' });
      const info = adapter.info || {};
      const vendor = String(info.vendor || info.description || '').toLowerCase();
      const bind = Number(adapter.limits && adapter.limits.maxStorageBufferBindingSize) || 0;   // ≥ 1 Gio chez les cartes capables
      const memory = Number(navigator.deviceMemory) || 0;                                      // Go de RAM (plafonné à 8 par le navigateur)
      const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent || '');
      const f16 = !!(adapter.features && adapter.features.has && adapter.features.has('shader-f16'));
      let recommended = DEFAULT_KEY;
      if (mobile || (memory && memory <= 4) || (bind && bind < 1024 * 1024 * 1024)) recommended = 'leger';
      else if (/nvidia|amd|radeon|geforce|rtx|apple/.test(vendor) && (!memory || memory >= 8)) recommended = 'complet';
      probed = { ok: true, reason: '', vendor, memory, bind, mobile, f16, recommended };
    } catch (e) {
      probed = { ok: false, reason: 'La carte graphique n’a pas répondu (' + (e && e.message || e) + ').', recommended: 'leger' };
    }
    return probed;
  }
  function recommend() { return (probed && probed.recommended) || DEFAULT_KEY; }

  /* ---------------- chargement du module et du modèle ---------------- */
  async function getLib() {
    if (lib) return lib;
    lib = await import(/* webpackIgnore: true */ LIB_URL);
    return lib;
  }
  function appConfig(L) {
    const cfg = Object.assign({}, L.prebuiltAppConfig);
    // Cache API absente (contexte non sécurisé, navigateur privé) → IndexedDB
    cfg.useIndexedDBCache = !(typeof caches !== 'undefined' && caches && caches.open);
    return cfg;
  }
  /* « Fetching param cache[12/48]: 1200MB fetched. 35% completed, 10 secs elapsed. » → phrase française + phase */
  function translate(report) {
    const t = String(report && report.text || '');
    let p = typeof report.progress === 'number' ? report.progress : 0;
    const pc = /(\d+)% completed/.exec(t); if (pc) p = Math.max(p, +pc[1] / 100);
    const mb = /(\d+)MB fetched/.exec(t);
    let phase = 'prep', text = 'Préparation…';
    if (/Fetching param/i.test(t)) { phase = 'download'; text = `Téléchargement du modèle${mb ? ` — ${(+mb[1] / 1024).toFixed(mb[1] > 1024 ? 1 : 2).replace('.', ',')} Go reçus` : ''} (une seule fois)`; }
    else if (/from cache/i.test(t)) { phase = 'cache'; text = 'Chargement du modèle depuis l’appareil'; }
    else if (/shader/i.test(t)) { phase = 'gpu'; text = 'Préparation de la carte graphique'; }
    else if (/Finish loading/i.test(t)) { phase = 'ready'; text = 'Modèle prêt'; p = 1; }
    else if (/Start to fetch params|Loading/i.test(t)) { phase = 'prep'; text = 'Lecture de la configuration du modèle'; }
    return { phase, text, progress: Math.min(1, Math.max(0, p)) };
  }
  async function cached(key) {
    try { await probe(); const L = await getLib(); return await L.hasModelInCache(idFor(key), appConfig(L)); } catch { return false; }
  }
  async function load(key, onProgress) {
    key = MODELS[key] ? key : recommend();
    if (engine && st.key === key && st.state === 'ready') return engine;
    if (loading && st.key === key) return loading;
    const s = support(); if (!s.ok) { set({ state: 'error', error: s.reason }); throw new Error(s.reason); }
    loading = (async () => {
      try {
        if (engine) { try { await engine.unload(); } catch { /* déjà libéré */ } engine = null; }
        set({ state: 'loading', key, progress: 0, text: 'Préparation…', phase: 'prep', error: '' });
        const p = await probe(); if (!p.ok) throw new Error(p.reason);
        const L = await getLib();
        const m = MODELS[key];
        const create = () => L.CreateMLCEngine(idFor(key), {
          appConfig: appConfig(L),
          initProgressCallback: r => { const tr = translate(r); set({ progress: tr.progress, text: tr.text, phase: tr.phase }); if (onProgress) { try { onProgress(status()); } catch { /* interface */ } } },
          logLevel: 'WARN'
        }, { context_window_size: m.ctx });
        let eng;
        try { eng = await create(); }
        catch (e) {
          // shaders f16 refusés par cette carte graphique → on passe aux variantes f32, une fois pour toutes
          if (!useF32() && isShaderError(e)) {
            forceF32 = true; try { localStorage.setItem(F32_LS, '1'); } catch { /* */ }
            set({ progress: 0, text: 'Carte graphique sans demi-précision : passage à la variante compatible…', phase: 'prep' });
            eng = await create();
          } else throw e;
        }
        engine = eng;
        set({ state: 'ready', progress: 1, text: 'Modèle prêt', phase: 'ready' });
        return eng;
      } catch (e) {
        engine = null;
        set({ state: 'error', error: friendly(e), progress: 0, text: '', phase: '' });
        throw new Error(friendly(e));
      } finally { loading = null; }
    })();
    return loading;
  }
  const isShaderError = e => /ShaderModule|shader|compute stage|entryPoint|f16|Tint|WGSL/i.test(String(e && e.message || e || ''));
  function friendly(e) {
    const m = String(e && e.message || e || '');
    if (/Failed to fetch|NetworkError|network|ERR_|fetch/i.test(m) && !/context/i.test(m)) return 'Le téléchargement du modèle a été interrompu (connexion internet ou huggingface.co inaccessible depuis ce réseau). Réessayez : il reprend là où il s’était arrêté.';
    if (/QuotaExceeded|quota|storage/i.test(m)) return 'Pas assez d’espace libre dans le navigateur pour garder le modèle sur l’appareil : libérez de la place (ou choisissez un modèle plus léger).';
    if (/maxStorageBufferBindingSize|maxBufferSize|out of memory|OutOfMemory|device lost|DeviceLost/i.test(m)) return 'La carte graphique n’a pas assez de mémoire pour ce modèle : choisissez un modèle plus léger dans Paramètres › IA.';
    if (/ShaderModule|compute stage|entryPoint|WGSL|Tint/i.test(m)) return 'La carte graphique n’a pas accepté le programme du modèle (pilotes graphiques à mettre à jour ?). Alixo a basculé sur la variante compatible : réessayez ; si l’erreur persiste, choisissez « Léger » ou un serveur dans Paramètres › IA.';
    if (/Cannot find adapter|requestAdapter|WebGPU/i.test(m)) return 'WebGPU n’a pas pu démarrer sur cet appareil (navigateur ou pilotes graphiques trop anciens).';
    if (/ContextWindowSizeExceeded|context window/i.test(m)) return 'Le texte envoyé est trop long pour le modèle sur l’appareil : sélectionnez une partie plus courte.';
    return m || 'Le modèle n’a pas pu être chargé.';
  }

  /* ---------------- une requête ---------------- */
  async function chat({ system, user, maxTokens = 1024, temperature = 0, json = true, timeoutMs = 180000, key } = {}) {
    const run = async () => {
      let eng;
      try { eng = await load(key || st.key || recommend()); }
      catch (e) { return { ok: false, status: 0, error: e.message }; }
      const req = {
        messages: [{ role: 'system', content: String(system || '') }, { role: 'user', content: String(user || '') }],
        max_tokens: Math.max(16, Math.min(4096, Math.round(maxTokens))),
        temperature, top_p: 0.9,
        extra_body: { enable_thinking: false }
      };
      /* 1.36.2 : WebLLM 0.2.86 passe `schema` tel quel au compilateur de grammaire ; sans schéma, « Cannot pass non-string
         to std::string ». On fournit donc toujours un schéma (un objet JSON quelconque, ou celui donné par l'appelant) ;
         si la grammaire échoue malgré tout sur cet appareil, on recommence sans contrainte (les consignes demandent
         déjà du JSON et les appelants extraient le premier objet de la réponse). */
      if (json && !noGrammar) req.response_format = { type: 'json_object', schema: typeof json === 'string' ? json : OBJECT_SCHEMA };
      let timer; const guard = new Promise((_, rej) => { timer = setTimeout(() => { rej(new Error('timeout')); try { eng.interruptGenerate(); } catch { /* */ } }, timeoutMs); });
      try {
        let res;
        try { res = await Promise.race([eng.chat.completions.create(req), guard]); }
        catch (e) {
          if (req.response_format && /grammar|xgrammar|std::string|schema/i.test(String(e && e.message || e))) {
            noGrammar = true; delete req.response_format;
            res = await Promise.race([eng.chat.completions.create(req), guard]);
          } else throw e;
        }
        const ch = res && res.choices && res.choices[0];
        const text = String(ch && ch.message && ch.message.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (!text) return { ok: false, status: 0, error: 'Le modèle n’a pas renvoyé de réponse' + (ch && ch.finish_reason === 'length' ? ' (réponse tronquée : demandez moins de texte à la fois)' : '') + '.' };
        const u = res.usage || {};
        return { ok: true, text, model: idFor(st.key), tokIn: u.prompt_tokens || 0, tokOut: u.completion_tokens || 0, local: true };
      } catch (e) {
        if (e && e.message === 'timeout') return { ok: false, status: 0, error: 'Le modèle met trop de temps à répondre sur cet appareil : réessayez avec un passage plus court, ou choisissez un modèle plus léger (Paramètres › IA).' };
        return { ok: false, status: 0, error: friendly(e) };
      } finally { clearTimeout(timer); }
    };
    const p = queue.then(run, run);
    queue = p.then(() => { }, () => { });
    return p;
  }

  async function unload() { if (engine) { try { await engine.unload(); } catch { /* */ } } engine = null; set({ state: 'idle', key: '', progress: 0, text: '', phase: '' }); }
  async function remove(key) {
    const m = MODELS[key] || MODELS[DEFAULT_KEY];
    if (engine && st.key === key) await unload();
    try { const L = await getLib(); for (const id of [m.id, m.id32]) { try { await L.deleteModelAllInfoInCache(id, appConfig(L)); } catch { /* variante absente */ } } return true; } catch { return false; }
  }

  return { MODELS, ORDER, DEFAULT_KEY, support, probe, recommend, cached, load, chat, status, unload, remove, translate, friendly, idFor, vramFor, useF32, LIB_URL };
})();
