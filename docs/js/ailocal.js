/* ============================================================
   Alixo — IA dans l'application : le modèle tourne sur l'appareil de l'utilisateur (1.36, fil dédié depuis 1.36.4)
   ------------------------------------------------------------
   Le modèle de langue est téléchargé une seule fois (0,4 à 2,4 Go selon la taille choisie) puis exécuté
   directement dans le navigateur ou dans la version PC, sur la carte graphique, grâce à WebLLM
   (github.com/mlc-ai/web-llm, Apache 2.0, livré dans js/vendor/web-llm.js et chargé à la demande).
   - aucun serveur, aucune clé, aucun compte, aucune limite d'usage : rien ne quitte l'appareil ;
   - les poids viennent de huggingface.co (dépôts mlc-ai/*), gardés ensuite dans le cache du navigateur
     (Cache API, ou IndexedDB quand la Cache API n'est pas disponible) ;
   - il faut WebGPU : Chrome / Edge / Opera récents, Safari 26, Firefox 141+ (Windows), la version PC
     d'Alixo ; sans WebGPU, AlixoAI n'est pas disponible sur l'appareil (1.37 : plus aucun serveur de repli) ;
   - 1.36.4 : le moteur tourne dans un Web Worker (js/ailocal-worker.js) : chargement du modèle, compilation des
     programmes graphiques et génération n'occupent plus le fil de l'interface, qui ne gèle plus. Si le worker n'a pas
     WebGPU (navigateur ancien), le moteur tourne comme avant sur le fil principal.
   API (window.AlixoLocalAI) :
     MODELS                       catalogue { cle: { id, label, dl, vram, desc } }
     support()                    { ok, reason } — WebGPU présent ? (synchrone)
     probe()                      → { ok, reason, vendor, memory, recommended }  (demande un adaptateur GPU)
     recommend()                  clé conseillée pour cet appareil (après probe, sinon heuristique)
     cached(key)                  → Promise<bool> : le modèle est déjà sur l'appareil
     load(key, onProgress)        → Promise<engine> : télécharge si besoin puis charge sur la carte graphique
     chat({ system, user, maxTokens, temperature, timeoutMs, background }) → { ok, text (JSON nettoyé), tokIn, tokOut, model } | { ok:false, error }
                                  background = true : requête d'arrière-plan (correction pendant la frappe), interrompue et
                                  rendue { ok:false, status:499 } si une requête de l'utilisateur (F7, quiz…) arrive derrière.
     status()                     { state: 'idle'|'loading'|'ready'|'error', key, progress, text, phase, busy, gen }
                                  busy = une réponse est en cours de rédaction, gen = jetons déjà produits
     crashed()                    clé du modèle qui était chargé quand la page précédente s'est terminée brutalement ('' sinon)
     unload(), remove(key)        libère la mémoire / efface le modèle de l'appareil
   Événement document « alixo-ai-local » (detail = status() + { why: 'state' | 'gen' }) à chaque changement : app.js affiche
   la progression du chargement (why 'state') et de la rédaction (why 'gen').
   ============================================================ */
'use strict';

window.AlixoLocalAI = (() => {
  const BASE = (() => { try { return new URL('.', document.currentScript.src); } catch { return new URL('js/', location.href); } })();
  const LIB_URL = new URL('vendor/web-llm.js', BASE).href;
  const WORKER_URL = new URL('ailocal-worker.js', BASE).href;
  const FIRST_TOKEN_MS = 90000;  // 1.36.4 : au-delà sans le moindre jeton (lecture de la consigne), le moteur est considéré bloqué
  const STALL_MS = 30000;        // entre deux jetons
  const LIVE_LS = 'alixo.ai.live';   // clé du modèle chargé ; effacée à la fermeture normale de la page → encore là = fermeture brutale

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
  let engine = null;             // MLCEngine chargé (dans le worker, ou sur le fil principal en repli)
  let worker = null;             // Web Worker qui héberge le moteur
  let workerOk = null;           // null = pas encore essayé, false = indisponible (pas de WebGPU dans le worker) → fil principal
  let loading = null;            // Promise en cours de load()
  const jobs = [];               // 1.36.4 : file des requêtes ; celles de l'utilisateur passent devant celles d'arrière-plan
  let current = null;            // requête en cours
  const st = { state: 'idle', key: '', progress: 0, text: '', phase: '', error: '', busy: false, gen: 0 };
  let probed = null;             // résultat de probe()

  const emit = why => { try { document.dispatchEvent(new CustomEvent('alixo-ai-local', { detail: Object.assign(status(), { why: why || 'state' }) })); } catch { /* hors document */ } };
  function status() { return { state: st.state, key: st.key, model: st.key && MODELS[st.key] ? idFor(st.key) : '', progress: st.progress, text: st.text, phase: st.phase, error: st.error, busy: st.busy, gen: st.gen, waiting: jobs.filter(j => !j.job.background && !j.job.quiet).length + (current && !current.background && !current.quiet ? 1 : 0) }; }
  function set(patch, why) { Object.assign(st, patch); emit(why); }

  /* ---------------- fermeture brutale ----------------
     Le modèle est noté dans localStorage tant qu'il est chargé ; la note est retirée à la fermeture normale de la page.
     Si elle est encore là au démarrage suivant, la page s'est terminée sans prévenir (mémoire graphique épuisée, pilote
     planté…) pendant que l'IA tournait : app.js passe alors à un modèle plus léger. */
  let crashedKey = '';
  try { crashedKey = localStorage.getItem(LIVE_LS) || ''; if (crashedKey) localStorage.removeItem(LIVE_LS); } catch { /* stockage indisponible */ }
  const mark = key => { try { localStorage.setItem(LIVE_LS, key); } catch { /* */ } };
  const unmark = () => { try { localStorage.removeItem(LIVE_LS); } catch { /* */ } };
  try { window.addEventListener('pagehide', unmark); } catch { /* hors fenêtre */ }
  function crashed() { return crashedKey; }

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
  /* 1.37.1 : trois tentatives d'adaptateur (carte performante, par défaut, économe) : certains pilotes refusent la
     demande « high-performance » mais acceptent l'adaptateur par défaut. Un échec n'est plus mémorisé : le processus
     graphique de Chromium peut être en train de redémarrer au lancement, « Réessayer » ou la demande suivante refait
     l'essai. La raison garde le détail (adaptateur absent, erreur), pour comprendre ce qui bloque sur un appareil. */
  async function requestAdapter() {
    let last = null;
    for (const opts of [{ powerPreference: 'high-performance' }, {}, { powerPreference: 'low-power' }]) {
      try { const a = await navigator.gpu.requestAdapter(opts); if (a) return a; } catch (e) { last = e; }
    }
    if (last) throw last;
    return null;
  }
  async function probe() {
    if (probed && probed.ok) return probed;
    const s = support();
    if (!s.ok) return { ok: false, reason: s.reason, recommended: 'leger' };
    try {
      const adapter = await requestAdapter();
      if (!adapter) return { ok: false, reason: 'Aucune carte graphique utilisable n’a été trouvée par le navigateur (WebGPU présent, adaptateur absent : pilotes graphiques à mettre à jour, ou accélération matérielle désactivée).', recommended: 'leger' };
      const info = adapter.info || {};
      const vendor = String(info.vendor || info.description || '').toLowerCase();
      const bind = Number(adapter.limits && adapter.limits.maxStorageBufferBindingSize) || 0;   // ≥ 1 Gio chez les cartes capables
      const memory = Number(navigator.deviceMemory) || 0;                                      // Go de RAM (plafonné à 8 par le navigateur)
      const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent || '');
      const f16 = !!(adapter.features && adapter.features.has && adapter.features.has('shader-f16'));
      let recommended = DEFAULT_KEY;
      /* 1.36.4 : « Complet » (4 milliards de paramètres, 3,5 Go de mémoire graphique) n'est conseillé que sur une carte NVIDIA
         ou un Mac Apple Silicon. Une puce AMD ou Intel intégrée (la plupart des portables) partage la mémoire avec le
         système : le modèle y tenait, mais au prix de gels, de réponses de plusieurs minutes et de fermetures brutales. */
      if (mobile || (memory && memory <= 4) || (bind && bind < 1024 * 1024 * 1024)) recommended = 'leger';
      else if (/nvidia|geforce|rtx|quadro|apple/.test(vendor) && (!memory || memory >= 8)) recommended = 'complet';
      probed = { ok: true, reason: '', vendor, memory, bind, mobile, f16, recommended };
      return probed;
    } catch (e) {
      return { ok: false, reason: 'La carte graphique n’a pas répondu (' + (e && e.message || e) + ').', recommended: 'leger' };
    }
  }
  /* 1.37 : plafond mémorisé après une fermeture brutale (alixo.ai.cap) : la taille conseillée ne le dépasse plus */
  const CAP_LS = 'alixo.ai.cap';
  let cap = ''; try { cap = localStorage.getItem(CAP_LS) || ''; } catch { /* */ }
  function recommend() {
    const r = (probed && probed.recommended) || DEFAULT_KEY;
    if (cap && ORDER.includes(cap) && ORDER.indexOf(cap) < ORDER.indexOf(r)) return cap;
    return r;
  }
  /* passe à la taille en dessous de `bad` (ou de la taille conseillée) ; renvoie la nouvelle clé, '' si déjà au plus léger */
  function downgrade(bad) {
    const i = ORDER.indexOf(ORDER.includes(bad) ? bad : recommend());
    if (i <= 0) return '';
    cap = ORDER[i - 1]; try { localStorage.setItem(CAP_LS, cap); } catch { /* */ }
    return cap;
  }

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
  /* 1.36.4 : le worker qui héberge le moteur. Il se présente (« alixo-ready », gpu = WebGPU visible depuis le worker) avant
     qu'on lui confie le moteur ; sans réponse, ou sans WebGPU, on se rabat sur le fil principal (comportement 1.36.0 à 1.36.3). */
  async function getWorker() {
    if (workerOk === false) return null;
    if (worker) return worker;
    let w;
    try { w = new Worker(WORKER_URL, { type: 'module', name: 'alixo-ia' }); }
    catch (e) { console.warn('IA : worker indisponible, moteur sur le fil principal —', e && e.message || e); workerOk = false; return null; }
    const ok = await new Promise(res => {
      const tm = setTimeout(() => res(false), 20000);
      w.onmessage = e => { if (e.data && e.data.kind === 'alixo-ready') { clearTimeout(tm); res(!!e.data.gpu); } };
      w.onerror = e => { clearTimeout(tm); console.warn('IA : worker en erreur, moteur sur le fil principal —', e && e.message || e); res(false); };
    });
    if (!ok) { try { w.terminate(); } catch { /* */ } workerOk = false; return null; }
    w.onerror = e => console.warn('IA (worker) :', e && e.message || e);
    worker = w; workerOk = true;
    return w;
  }
  /* libère le moteur et, s'il tournait dans un worker, arrête ce worker : mémoire graphique rendue, état remis à zéro */
  async function dispose() {
    const eng = engine; engine = null;
    if (eng) { try { await Promise.race([eng.unload(), new Promise(r => setTimeout(r, 5000))]); } catch { /* déjà libéré */ } }
    if (worker) { try { worker.terminate(); } catch { /* */ } worker = null; }
    unmark();
  }
  /* création du moteur (remplaçable par les tests : AlixoLocalAI.createEngine = …) */
  function createEngine(L, w, id, cfg, chatOpts) { return w ? L.CreateWebWorkerMLCEngine(w, id, cfg, chatOpts) : L.CreateMLCEngine(id, cfg, chatOpts); }
  async function load(key, onProgress) {
    key = MODELS[key] ? key : recommend();
    if (engine && st.key === key && st.state === 'ready') return engine;
    if (loading && st.key === key) return loading;
    const s = support(); if (!s.ok) { set({ state: 'error', error: s.reason }); throw new Error(s.reason); }
    loading = (async () => {
      try {
        if (engine || worker) await dispose();
        set({ state: 'loading', key, progress: 0, text: 'Préparation…', phase: 'prep', error: '' });
        const p = await probe(); if (!p.ok) throw new Error(p.reason);
        const L = await getLib();
        const w = await getWorker();
        const m = MODELS[key];
        mark(key);
        const create = () => api.createEngine(L, w, idFor(key), {
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
        await dispose();
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
    if (/QuotaExceeded|quota|storage/i.test(m)) return 'Pas assez d’espace libre dans le navigateur pour garder le modèle sur l’appareil : libérez de la place.';
    if (/maxStorageBufferBindingSize|maxBufferSize|out of memory|OutOfMemory|device lost|DeviceLost/i.test(m)) return 'La mémoire graphique de l’appareil ne suffit pas pour AlixoAI dans cette taille : elle sera allégée au prochain démarrage.';
    if (/ShaderModule|compute stage|entryPoint|WGSL|Tint/i.test(m)) return 'La carte graphique n’a pas accepté le programme du modèle (pilotes graphiques à mettre à jour ?). AlixoAI a basculé sur la variante compatible : réessayez.';
    if (/Aucune carte graphique utilisable|n’a pas répondu/.test(m)) return m;   // 1.37.1 : raison détaillée de probe()
    if (/Cannot find adapter|requestAdapter|WebGPU/i.test(m)) return 'WebGPU n’a pas pu démarrer sur cet appareil (navigateur ou pilotes graphiques trop anciens) — ' + m.slice(0, 160);
    if (/ContextWindowSizeExceeded|context window/i.test(m)) return 'Le texte envoyé est trop long pour AlixoAI : sélectionnez une partie plus courte.';
    return m || 'AlixoAI n’a pas pu démarrer.';
  }

  /* ---------------- une requête ----------------
     1.36.3 : plus de « mode JSON forcé » (response_format json_object). Cette contrainte passe par le compilateur de
     grammaire xgrammar embarqué dans WebLLM, qui a échoué de trois façons différentes sur les postes des utilisateurs
     (« Invalid ShaderModule », « Cannot pass non-string to std::string », « The current Object has already been
     disposed »). Les consignes demandent du JSON avec un exemple, Qwen3 s'y tient, et chaque appelant extrait le premier
     objet JSON de la réponse (toJSON ci-dessous nettoie les clôtures ``` et le texte autour). Si une requête plante
     quand même (objet GPU perdu, moteur dans un état incohérent), le moteur est rechargé une fois et la requête rejouée. */
  const toJSON = raw => {
    let t = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const i = t.search(/[\[{]/); if (i > 0) t = t.slice(i);
    const j = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']')); if (j >= 0 && j < t.length - 1) t = t.slice(0, j + 1);
    return t;
  };
  /* 1.36.4 : la réponse est lue en continu (stream). On sait ainsi où en est le modèle (jetons produits → barre discrète
     d'app.js), et un moteur réellement bloqué se détecte en 30 à 90 s sans jeton, au lieu d'attendre un délai global de
     plusieurs minutes. Les requêtes passent par une file : une seule à la fois sur la carte graphique, celles de
     l'utilisateur (F7, quiz, fiche) avant celles d'arrière-plan (frappe), qu'elles interrompent si l'une d'elles est en cours. */
  /* 1.37 : chat() accepte aussi `messages` (conversation complète, dernier message = utilisateur) : AlixoAI enchaîne ainsi
     plusieurs tours sur le même document — WebLLM reconnaît la conversation déjà lue et ne relit que le nouveau message
     (cache des clés-valeurs réutilisé), au lieu de relire tout le document à chaque lot. `onToken(text)` reçoit le texte au
     fil de l'eau (lecture progressive : le quiz commence dès la première question). `token` permet d'annuler (cancel). */
  async function chat({ system, user, messages, maxTokens = 1024, temperature = 0, timeoutMs = 180000, key, background = false, onToken, token, stop, quiet = false } = {}) {
    const job = { background, quiet, eng: null, interrupted: false, tokens: 0, token: token || null };   // quiet : l'appelant affiche lui-même l'avancement (pas de barre discrète)
    const once = async () => {
      const eng = await load(key || st.key || recommend());
      job.eng = eng; job.tokens = 0;
      if (job.interrupted) throw Object.assign(new Error('interrupted'), { interrupted: true });
      const msgs = Array.isArray(messages) && messages.length ? messages.map(m => ({ role: m.role, content: String(m.content || '') }))
        : [{ role: 'system', content: String(system || '') }, { role: 'user', content: String(user || '') }];
      const req = {
        messages: msgs,
        max_tokens: Math.max(16, Math.min(4096, Math.round(maxTokens))),
        temperature, top_p: 0.9,
        extra_body: { enable_thinking: false },
        stream: true, stream_options: { include_usage: true }
      };
      if (Array.isArray(stop) && stop.length) req.stop = stop.slice(0, 4);
      let text = '', finish = '', usage = null;
      let stallTm = 0, hardTm = 0, rejectGuard = null;
      const guard = new Promise((_, rej) => { rejectGuard = rej; });
      const stopGen = () => { try { eng.interruptGenerate(); } catch { /* */ } rejectGuard(new Error('timeout')); };
      const arm = ms => { clearTimeout(stallTm); stallTm = setTimeout(stopGen, ms); };
      const consume = async () => {
        const stream = await eng.chat.completions.create(req);
        for await (const chunk of stream) {
          const ch = chunk && chunk.choices && chunk.choices[0];
          if (ch) {
            if (ch.delta && ch.delta.content) {
              text += ch.delta.content; job.tokens++;
              if (job.tokens % 8 === 0) set({ gen: job.tokens }, 'gen');
              if (onToken) { try { onToken(text, ch.delta.content); } catch { /* lecteur */ } }
            }
            if (ch.finish_reason) finish = ch.finish_reason;
          }
          if (chunk && chunk.usage) usage = chunk.usage;
          arm(STALL_MS);
        }
      };
      try {
        arm(FIRST_TOKEN_MS);
        hardTm = setTimeout(stopGen, timeoutMs);
        await Promise.race([consume(), guard]);
      } finally { clearTimeout(stallTm); clearTimeout(hardTm); }
      if (job.interrupted || finish === 'abort') throw Object.assign(new Error('interrupted'), { interrupted: true });
      return { text, finish, usage };
    };
    const run = async () => {
      current = job; set({ busy: true, gen: 0 }, 'gen');
      try {
        let res;
        try { res = await once(); }
        catch (e) {
          const m = String(e && e.message || e || '');
          if (e && e.interrupted) return { ok: false, status: 499, error: job.token && job.cancelled ? 'Demande annulée.' : 'Requête mise de côté : une demande plus urgente est passée devant.' };
          if (m === 'timeout') {
            // aucun jeton reçu : le moteur est bloqué (carte graphique muette) → on le libère, il sera rechargé à la prochaine demande
            if (!job.tokens) await dispose();
            return { ok: false, status: 0, error: job.tokens ? 'AlixoAI met trop de temps à répondre : réessayez avec un passage plus court.' : 'AlixoAI n’a pas répondu : le moteur a été relancé, réessayez.' };
          }
          if (/ContextWindowSizeExceeded|context window/i.test(m)) return { ok: false, status: 0, error: friendly(e) };
          // moteur abîmé (objet libéré, périphérique perdu…) : on le recharge une fois et on rejoue la requête
          try { await dispose(); res = await once(); }
          catch (e2) {
            if (e2 && e2.interrupted) return { ok: false, status: 499, error: 'Requête mise de côté : une demande plus urgente est passée devant.' };
            return { ok: false, status: 0, error: String(e2 && e2.message || e2) === 'timeout' ? 'AlixoAI met trop de temps à répondre — réessayez.' : friendly(e2) };
          }
        }
        const text = toJSON(res.text);
        if (!String(res.text || '').trim()) return { ok: false, status: 0, error: 'AlixoAI n’a pas renvoyé de réponse' + (res.finish === 'length' ? ' (réponse tronquée : demandez moins de texte à la fois)' : '') + '.' };
        const u = res.usage || {};
        return { ok: true, text, raw: res.text, finish: res.finish, model: idFor(st.key), tokIn: u.prompt_tokens || 0, tokOut: u.completion_tokens || job.tokens, local: true };
      } finally { current = null; set({ busy: false, gen: 0 }, 'gen'); }
    };
    // une demande de l'utilisateur interrompt la correction d'arrière-plan en cours : elle n'attend pas derrière
    if (!background && current && current.background && !current.interrupted) {
      current.interrupted = true;
      try { if (current.eng) current.eng.interruptGenerate(); } catch { /* */ }
    }
    return new Promise(resolve => { jobs.push({ job, run, resolve }); emit('gen'); pump(); });
  }
  /* 1.37 : annule les requêtes portant ce jeton (en file : retirées ; en cours : interrompue) */
  function cancel(token) {
    if (!token) return;
    for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].job.token === token) { const j = jobs.splice(i, 1)[0]; j.resolve({ ok: false, status: 499, error: 'Demande annulée.' }); }
    if (current && current.token === token && !current.interrupted) { current.interrupted = true; current.cancelled = true; try { if (current.eng) current.eng.interruptGenerate(); } catch { /* */ } }
    emit('gen');
  }
  let pumping = false;
  function pump() {
    if (pumping || !jobs.length) return;
    const i = jobs.findIndex(j => !j.job.background);
    const next = jobs.splice(i >= 0 ? i : 0, 1)[0];
    pumping = true;
    next.run().then(next.resolve, e => next.resolve({ ok: false, status: 0, error: friendly(e) })).finally(() => { pumping = false; pump(); });
  }

  async function unload() { await dispose(); set({ state: 'idle', key: '', progress: 0, text: '', phase: '' }); }
  async function remove(key) {
    const m = MODELS[key] || MODELS[DEFAULT_KEY];
    if (engine && st.key === key) await unload();
    try { const L = await getLib(); for (const id of [m.id, m.id32]) { try { await L.deleteModelAllInfoInCache(id, appConfig(L)); } catch { /* variante absente */ } } return true; } catch { return false; }
  }

  const api = { MODELS, ORDER, DEFAULT_KEY, support, probe, recommend, downgrade, cached, load, chat, cancel, status, crashed, unload, remove, translate, friendly, toJSON, idFor, vramFor, useF32, createEngine, usesWorker: () => workerOk === true, LIB_URL, WORKER_URL };
  return api;
})();
