/* ============================================================
   Alixo 1.31 — widgets de bureau (Alixo+), côté application
   - Paramètres › Widgets : un faux bureau où l'on glisse-dépose les widgets du catalogue (js/widgets-catalog.js),
     les options générales (toujours au-dessus, lancement avec Windows, zone de notification, opacité) ;
   - les données envoyées aux widgets (version PC : fenêtres flottantes créées par main.js ; aperçu : iframe) ;
   - les actions reçues des widgets (cocher une tâche, lancer le minuteur, rouvrir une séance…).
   Disposition : { on, top, tray, opacity, items: [{ id, k, x, y, opts }] } — x, y : fractions (0 → 1) de la zone de
   travail de l'écran.
   1.43 : la disposition est propre à chaque appareil (localStorage « alixo.widgets » + compte), elle ne part plus dans
   le nuage : la régler sur un PC ne déplace plus les widgets d'un autre PC (écrans de tailles différentes). L'ancien
   state.settings.widgets (synchronisé) est recopié une seule fois au premier lancement, puis ignoré ; il n'est pas effacé
   du nuage, car un PC encore en 1.42 le lit toujours. Le lancement à l'ouverture de session ne dépend plus de la
   disposition : c'est l'état du système qui fait foi (main.js › login-item:get / login-item:set).
   state.settings.widgetNote : le texte du pense-bête (contenu : il reste synchronisé). Chargé APRÈS app.js, todo.js et stats.js.
   ============================================================ */
'use strict';

window.AlixoWidgets = (() => {
  const CAT = () => window.ALIXO_WIDGETS || [];
  const kindOf = k => (window.ALIXO_WIDGET ? ALIXO_WIDGET(k) : null);
  const desk = () => (window.alixoDesktop && alixoDesktop.widgets ? alixoDesktop.widgets : null);
  const DEFAULT_SCREEN = { w: 1920, h: 1040 };
  let screen = Object.assign({}, DEFAULT_SCREEN);
  let publishTm = 0, lastLayoutJson = '';
  const EXAM_RE = /partiel|examen|exam\b|contr[ôo]le|concours|galop|oral|soutenance|\bDS\b|\bCC\b|rattrapage|colle/i;

  /* 1.43 : disposition propre à l'appareil, sur le modèle de TABS_LS (app.js) : une clé par compte connecté */
  const WD_LS = 'alixo.widgets' + (window.AlixoAuth ? AlixoAuth.storageSuffix() : '');
  let local = null;
  function readLocal() {
    try { const v = JSON.parse(localStorage.getItem(WD_LS)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
  }
  function persist() {
    try { localStorage.setItem(WD_LS, JSON.stringify(cfg())); } catch { /* stockage indisponible */ }
  }
  /* 1.43 : migration, synchrone au chargement (avant la première lecture du nuage, qui est asynchrone) : sans clé locale,
     l'appareil reprend la disposition qu'il avait jusqu'ici (state.settings.widgets). Rien n'est retiré des réglages. */
  function migrate() {
    local = readLocal();
    if (local) return;
    const old = state && state.settings && state.settings.widgets;
    let copy = null;
    if (old && typeof old === 'object') { try { copy = JSON.parse(JSON.stringify(old)); } catch { copy = null; } }
    local = copy && typeof copy === 'object' && !Array.isArray(copy) ? copy : {};
    delete local.login;   /* l'ouverture de session suit désormais l'état du système */
    persist();
  }
  function cfg() {
    if (!local || typeof local !== 'object') local = { on: false, top: false, tray: true, opacity: 100, items: [] };
    if (typeof local.on !== 'boolean') local.on = !!local.on;
    if (typeof local.top !== 'boolean') local.top = !!local.top;
    if (!Array.isArray(local.items)) local.items = [];
    if (typeof local.opacity !== 'number') local.opacity = 100;
    if (typeof local.tray !== 'boolean') local.tray = true;
    return local;
  }
  migrate();
  const active = () => isPlus() && cfg().on && cfg().items.length > 0;
  /* 1.43 : enregistrement local seulement — ne touche plus state.settings ni settingsAt (rien ne part dans le nuage) */
  const stamp = () => { persist(); };

  /* ---------------- disposition → version PC ---------------- */
  function layout() {
    const c = cfg();
    const items = isPlus() ? c.items.map(it => { const d = kindOf(it.k); return d ? { id: it.id, k: it.k, x: +it.x || 0, y: +it.y || 0, w: d.w, h: d.h, name: d.name } : null; }).filter(Boolean) : [];
    return { on: !!(c.on && isPlus()), top: !!c.top, tray: c.tray !== false, items };
  }
  function sync(force) {
    const d = desk(); if (!d) return;
    const l = layout(); const j = JSON.stringify(l);
    if (!force && j === lastLayoutJson) return;
    lastLayoutJson = j;
    d.layout(l);
    publish();
  }

  /* ---------------- données envoyées aux widgets ---------------- */
  function folderInfo(fid) {
    const f = (state.folders || []).find(x => x.id === fid);
    return f ? { name: f.nom || '', color: f.couleur || '' } : { name: '', color: '' };
  }
  function docKind(d) { return isSlidesDoc(d) ? 'slides' : isSheetDoc(d) ? 'sheet' : isBoardDoc(d) ? 'board' : isQuizDoc(d) ? 'quiz' : 'cours'; }
  function whenLabel(ts) {
    const d = new Date(ts), now = new Date(); const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (diff <= 0) return `aujourd’hui ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    if (diff === 1) return 'hier';
    if (diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
  const occLine = (o, now) => ({ id: o.ev.id, title: o.ev.title || 'Événement', start: `${pad2(o.start.getHours())}:${pad2(o.start.getMinutes())}`, end: `${pad2(o.end.getHours())}:${pad2(o.end.getMinutes())}`, color: o.ev.color || '', place: o.ev.lieu || '', state: o.end <= now ? 'past' : o.start <= now ? 'now' : 'next' });

  function jourJ(opts) {
    const now = new Date(); const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = d => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - t0) / 86400000);
    if (opts && opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)) { const d = parseYmd(opts.date); return { title: opts.title || 'Jour J', date: opts.date, days: days(d), custom: true }; }
    const horizon = new Date(t0); horizon.setFullYear(horizon.getFullYear() + 1);
    const occ = events().flatMap(ev => occurrences(ev, t0, horizon)).filter(o => o.start >= now).sort((a, b) => a.start - b.start);
    const exam = occ.find(o => EXAM_RE.test(o.ev.title || '')) || null;
    if (exam) return { title: exam.ev.title, date: exam.key, days: days(exam.start), custom: false };
    return { title: '', date: '', days: null, custom: false };
  }

  function snapshot() {
    const c = cfg();
    const now = new Date();
    const plus = isPlus();
    const out = {
      v: ALIXO_VERSION, now: now.getTime(), plus, opacity: c.opacity,
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      tint: (getComputedStyle(document.documentElement).getPropertyValue('--tint') || '#4f66e0').trim()
    };
    if (!plus) return out;
    out.opts = {}; for (const it of c.items) out.opts[it.id] = it.opts || {};
    /* tâches */
    if (window.AlixoTodo) {
      const tk = todayKey();
      const all = AlixoTodo.todos().filter(t => !t.done);
      const score = t => (AlixoTodo.isLate(t) ? 0 : t.due === tk ? 1 : t.due ? 2 : 3);
      const items = all.slice().sort((a, b) => score(a) - score(b) || (b.prio || 0) - (a.prio || 0) || (a.due || '9').localeCompare(b.due || '9')).slice(0, 12)
        .map(t => { const cat = AlixoTodo.cats().find(x => x.id === t.cat); return { id: t.id, text: t.text, due: t.due || '', late: AlixoTodo.isLate(t), today: t.due === tk, prio: t.prio || 0, cat: cat ? cat.name : '', color: cat ? cat.color : '' }; });
      out.taches = { items, open: AlixoTodo.openCount(), late: AlixoTodo.lateCount(), doneToday: AlixoTodo.todos().filter(t => t.done && t.doneAt && dayKey(t.doneAt) === tk).length };
    }
    /* agenda */
    const today = occurrencesOn(now).map(o => occLine(o, now));
    const tom = new Date(now); tom.setDate(tom.getDate() + 1);
    const tomorrow = occurrencesOn(tom).map(o => occLine(o, now));
    const st = calStatus(now);
    out.agenda = { today, tomorrow, status: st ? { kind: st.kind, title: st.o.ev.title || 'Événement', left: st.left, start: `${pad2(st.o.start.getHours())}:${pad2(st.o.start.getMinutes())}`, end: `${pad2(st.o.end.getHours())}:${pad2(st.o.end.getMinutes())}`, place: st.o.ev.lieu || '', color: st.o.ev.color || '' } : null };
    /* minuteur : l'état brut, le widget calcule le temps restant lui-même */
    out.minuteur = { on: !!tp.cd.on, total: tp.cd.total, base: tp.cd.base, t0: tp.cd.t0, over: !!tp.cd.over, label: tp.cd.label || '' };
    /* jour J : par widget (date choisie) sinon le prochain examen de l'agenda */
    out.jourj = {};
    for (const it of c.items) if (it.k === 'jourj') out.jourj[it.id] = jourJ(it.opts);
    out.jourj.auto = jourJ(null);
    /* bilan de la semaine */
    if (window.AlixoStats) {
      try {
        const s = AlixoStats.compute();
        const DOWS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
        out.bilan = { words: s.wordsWeek, wordsPrev: s.wordsPrev, docs: s.docsWeek, streak: s.streak, hours: s.hours, hoursDone: s.hoursDone, dayIndex: s.dayIndex, perDay: Object.values(s.perDay).map((n, i) => ({ d: DOWS[i], n })) };
      } catch { /* statistiques indisponibles */ }
    }
    /* reprendre */
    out.reprendre = state.docs.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5)
      .map(d => { const f = folderInfo(d.folderId); return { id: d.id, title: d.titre || 'Sans titre', kind: docKind(d), folder: f.name, color: f.color, when: whenLabel(d.updatedAt || d.createdAt || 0) }; });
    /* pense-bête */
    out.pensebete = { text: state.settings.widgetNote || '' };
    /* question du jour : jusqu'à 40 QCM à réponse unique tirés des quiz */
    const pool = [];
    for (const d of state.docs) {
      if (!isQuizDoc(d)) continue;
      for (const q of (d.questions || [])) {
        if (q.t !== 'mcq' || q.multi || !q.text || !Array.isArray(q.opts) || !Array.isArray(q.ans) || q.ans.length !== 1) continue;
        const opts = q.opts.filter(o => o && o.text);
        if (opts.length < 2 || !opts.some(o => o.id === q.ans[0])) continue;
        pool.push({ id: q.id, doc: d.id, title: d.titre || 'Quiz', text: q.text, opts: opts.map(o => ({ id: o.id, text: o.text })), ans: q.ans[0] });
      }
    }
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    out.quiz = { pool: pool.slice(0, 40), quizzes: state.docs.filter(isQuizDoc).length };
    return out;
  }
  let lastSnap = null;
  function publishNow() {
    publishTm = 0;
    let snap; try { snap = snapshot(); } catch (e) { console.warn('widgets : données', e); return; }
    lastSnap = snap;
    const d = desk(); if (d && layout().on) d.data(snap);
    for (const fr of document.querySelectorAll('iframe.wd-preview')) { try { fr.contentWindow.postMessage({ alixoWidget: snap }, '*'); } catch { /* aperçu fermé */ } }
  }
  function publish() { clearTimeout(publishTm); publishTm = setTimeout(publishNow, 250); }
  function onSave() { if (active() || document.querySelector('iframe.wd-preview')) publish(); }

  /* ---------------- actions reçues des widgets ---------------- */
  function handleAction(a) {
    if (!a || typeof a !== 'object') return;
    const t = a.type;
    if (t === 'todo-toggle' && window.AlixoTodo) { AlixoTodo.toggle(String(a.id)); return; }
    if (t === 'todo-add' && window.AlixoTodo) { const txt = String(a.text || '').trim(); if (txt) { AlixoTodo.addTask(txt, null, a.today ? todayKey() : '', 0); toast('Tâche ajoutée depuis le widget'); } return; }
    if (t === 'note') { state.settings.widgetNote = String(a.text || '').slice(0, 2000); save(); return; }   /* contenu : synchronisé */
    if (t === 'timer') {
      if (a.op === 'set') setCountdown(Math.max(10, Math.min(36000, +a.secs || 0)), tp.cd.label);
      else if (a.op === 'start') { if (!tp.cd.on) startCountdown(); }
      else if (a.op === 'pause') { if (tp.cd.on) { tp.cd.base = cdRemaining(); tp.cd.on = false; saveTp(); renderTimerPanel(); renderTimerNow(); } }
      else if (a.op === 'reset') { tp.cd = { on: false, total: tp.cd.total, base: tp.cd.total, t0: 0, over: false, label: tp.cd.label }; saveTp(); renderTimerPanel(); renderTimerNow(); }
      publish(); return;
    }
    if (t === 'open') {
      const w = a.what;
      if (w === 'doc' && a.id) { if (findDoc(a.id)) openDoc(a.id); else toast('Cette séance n’existe plus'); }
      else if (w === 'todo') openTodoHome();
      else if (w === 'agenda') { if (currentDocId) showLibrary(); openAgendaHome(); }
      else if (w === 'stats' && window.AlixoStats) AlixoStats.open(true);
      else if (w === 'quiz-new' && window.AlixoQuiz) { if (currentDocId) showLibrary(); const b = document.querySelector('[data-new="quiz"], #new-quiz'); if (b) b.click(); else toast('Créez un quiz depuis la bibliothèque : « Nouveau › Quiz »'); }
      else if (w === 'timer') { if (currentDocId) togglePanel('#timerpanel', openTimerPanel); else toast('Ouvrez une séance pour afficher le panneau des minuteurs'); }
      else if (w === 'widgets') openSettings('widgets');
      else if (w === 'tasks-new' && window.AlixoTodo) openTodoHome();
      return;
    }
    if (t === 'moved') { const it = cfg().items.find(x => x.id === a.id); if (it) { it.x = clamp01(a.x); it.y = clamp01(a.y); lastLayoutJson = JSON.stringify(layout()); stamp(); if ($('#wd-desk')) renderDesk(); } return; }
    if (t === 'close') { const c = cfg(); const n = c.items.length; c.items = c.items.filter(x => x.id !== a.id); if (c.items.length !== n) { stamp(); sync(); if ($('#wd-desk')) renderDesk(); } return; }
    if (t === 'toggle') { cfg().on = !!a.on; stamp(); sync(); const ov = $('#setov'); if (ov && !ov.hidden && settingsCat === 'widgets') renderSettingsBody(); }
  }
  const clamp01 = v => Math.max(0, Math.min(1, +v || 0));

  /* ============================================================
     Paramètres › Widgets : faux bureau + catalogue + options
     ============================================================ */
  const DESK_W = 500;   /* largeur du faux bureau en px ; l'échelle vaut DESK_W / largeur réelle de l'écran */
  const ICO_EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICO_PLUS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
  let selected = null;  /* id du widget sélectionné dans le faux bureau (options) */

  /* ---------------- 1.43 : lancement à l'ouverture de la session (PC Windows et Mac) ---------------- */
  const LOGIN_ASKED_LS = 'alixo.loginAsked';   /* par appareil, sans suffixe de compte */
  const loginApi = () => (window.alixoDesktop && alixoDesktop.loginItem ? alixoDesktop.loginItem : null);
  const loginSupported = () => !!loginApi() && (alixoDesktop.platform === 'win32' || alixoDesktop.platform === 'darwin');
  function loginState() {
    const api = loginApi(); if (!api || !loginSupported()) return Promise.resolve({ supported: false, on: false });
    return api.get().then(r => (r && typeof r === 'object' ? r : { supported: false, on: false })).catch(() => ({ supported: false, on: false }));
  }
  function setLogin(on) {
    const api = loginApi(); if (!api || !loginSupported()) return Promise.resolve({ ok: false });
    return api.set(!!on).catch(() => ({ ok: false }));
  }
  function markLoginAsked() { try { localStorage.setItem(LOGIN_ASKED_LS, '1'); } catch { /* stockage indisponible */ } }
  /* textes propres au système : Windows (barre des tâches, zone de notification) ou Mac (Dock, barre des menus) */
  const isMac = () => !!(window.alixoDesktop && alixoDesktop.platform === 'darwin');
  const TXT = {
    get reduced() { return isMac() ? 'sans widget, Alixo s’ouvre réduit dans le Dock' : 'sans widget, Alixo s’ouvre réduit dans la barre des tâches'; },
    get tray() { return isMac() ? 'la barre des menus' : 'la zone de notification'; },
    get trayClick() { return isMac() ? 'Clic sur l’icône de la barre des menus pour rouvrir Alixo ou le quitter.' : 'Clic sur l’icône pour rouvrir, clic droit pour quitter.'; },
    get findDesk() { return isMac() ? 'F11 ou Mission Control pour les retrouver' : 'raccourci Windows + D pour les retrouver'; }
  };
  /* rappel unique (premier lancement de la 1.43), si le lancement au démarrage n'est pas activé ; jamais par-dessus la
     connexion, le questionnaire de bienvenue, les nouveautés ou une autre fenêtre ; rien si l'installateur a déjà posé la question */
  function maybeAskLogin(tries) {
    if (window.ALIXO_AUX || !loginSupported()) return;
    try { if (localStorage.getItem(LOGIN_ASKED_LS)) return; } catch { return; }
    const authov = $('#authov');
    if ((authov && !authov.hidden) || $('#obov') || $('#suspov') || $('#updov') || $('#wnov') || $('.dlgov') || document.hidden) {
      if ((tries || 0) < 40) setTimeout(() => maybeAskLogin((tries || 0) + 1), 5000);
      return;
    }
    loginState().then(info => {
      if (!info || !info.supported) return;
      if (info.on || info.installerAsked) { markLoginAsked(); return; }
      /* seulement pour un compte Alixo+ qui a posé des widgets : pour les autres, l'intérêt est nul et la question
         reviendra plus tard (rien n'est marqué comme demandé) */
      if (!(isPlus() && cfg().items.length > 0)) return;
      markLoginAsked();
      openDialog({
        id: 'loginask', cls: 'wd-logindlg', eyebrow: 'Démarrage', title: 'Lancer Alixo à l’ouverture de la session ?',
        sub: 'Vos widgets de bureau apparaîtraient d’eux-mêmes dès que vous allumez l’ordinateur.',
        body: `<p class="wd-loginbody">Alixo démarrerait en arrière-plan : avec des widgets, seuls les widgets s’affichent ; ${TXT.reduced}. Ce réglage ne concerne que cet ordinateur et se modifie à tout moment dans Paramètres › Widgets.</p>`,
        foot: `<button class="cta ghost" type="button" data-dlg-close>Non merci</button><button class="cta" type="button" id="loginask-yes">Lancer au démarrage</button>`,
        onMount: (card, close) => {
          card.querySelector('#loginask-yes').addEventListener('click', async () => {
            const r = await setLogin(true); close();
            toast(r && r.ok && r.on ? 'Alixo se lancera à l’ouverture de la session' : 'Impossible d’activer le lancement au démarrage');
          });
        }
      });
    });
  }

  function settingsHTML() {
    const c = cfg(); const plus = isPlus(); const d = !!desk();
    const ratio = screen.h / screen.w;
    /* 1.43 : le lancement au démarrage est gratuit → en tête de section, hors de la zone grisée des comptes sans Alixo+ */
    return `${loginSupported() ? `<div class="set-sect wd-startup"><div class="po-label">Démarrage</div><div class="set-checks"><label><input type="checkbox" role="switch" id="wd-login" disabled><span><b>Lancer Alixo à l’ouverture de la session</b><small id="wd-loginhint">Alixo démarre en arrière-plan : avec des widgets, seuls les widgets apparaissent sur le bureau ; ${TXT.reduced}. Réglage propre à cet ordinateur.</small></span></label></div></div>` : ''}
    <div class="set-sect wd-sect ${plus ? '' : 'wd-locked'}">
      ${plus ? '' : `<div class="wd-cta"><div><b>Les widgets de bureau font partie d’Alixo+</b><small>Tâches, agenda, minuteur, compte à rebours avant le partiel, bilan de la semaine, question de quiz… posés sur le bureau de votre ordinateur, toujours à jour.</small></div><button class="cta plus-cta" type="button" id="wd-plus">Passer à Alixo+</button></div>`}
      <div class="po-row wd-top">
        ${d ? `<label class="wd-switch"><input type="checkbox" id="wd-on" ${c.on ? 'checked' : ''} ${plus ? '' : 'disabled'}><span><b>Afficher les widgets sur le bureau</b><small>Les fenêtres se posent sur le bureau de cet ordinateur, aux emplacements choisis ci-dessous. Alixo continue de tourner dans ${TXT.tray} pour les tenir à jour.</small></span></label>`
          : `<div class="po-hint wd-webhint">Les widgets s’affichent avec l’application <b>Windows</b> ou <b>Mac</b> (<a href="https://alixoapp.com/telecharger/windows/" target="_blank" rel="noopener">télécharger</a>). La disposition est propre à chaque appareil : celle préparée ici reste dans ce navigateur, l’application de l’ordinateur a la sienne.</div>`}
      </div>
      <div class="wd-layout"><div class="wd-left">
      <div class="po-label">Votre bureau <span class="wd-screen">${screen.w} × ${screen.h}</span></div>
      <div class="po-hint" style="margin:0 0 8px">Glissez un widget du catalogue sur le bureau, déplacez-le, cliquez-le pour ses options, « × » pour le retirer. La disposition est propre à cet appareil : vos autres ordinateurs gardent la leur.</div>
      <div class="wd-deskwrap"><div class="wd-desk" id="wd-desk" style="--ratio:${ratio.toFixed(4)}" ${plus ? '' : 'data-locked="1"'}></div><div class="wd-taskbar"><i></i><i></i><i></i><i></i><b>${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</b></div></div>
      <div class="po-label" style="margin-top:14px">Catalogue</div>
      <div class="wd-cat" id="wd-cat">${CAT().map(w => {
        const n = c.items.filter(i => i.k === w.k).length;
        return `<div class="wd-tile" draggable="${plus ? 'true' : 'false'}" data-k="${w.k}" style="--wc:${w.color}" title="${esc(w.sub)}"><span class="wd-tico">${w.ico}</span><span class="wd-tname">${esc(w.name)}${n ? `<span class="wd-count">${n}</span>` : ''}</span><span class="wd-tbtns"><button type="button" data-preview="${w.k}" title="Aperçu">${ICO_EYE}</button><button type="button" data-add="${w.k}" title="Ajouter au bureau" ${plus ? '' : 'disabled'}>${ICO_PLUS}</button></span></div>`; }).join('')}
      </div>
      <div class="po-hint" style="margin:6px 0 0">Survolez un widget pour sa description ; l’œil montre un aperçu en vrai, avec vos données.</div>
      </div><div class="wd-right" id="wd-opts"><div class="wd-optempty">Cliquez un widget du bureau pour ses options.</div></div></div>
    </div>
    <div class="set-sect"><div class="po-label">Options</div>
      <div class="set-checks">
        <label><input type="checkbox" data-wd="top" ${c.top ? 'checked' : ''} ${plus ? '' : 'disabled'}><span><b>Toujours au-dessus des autres fenêtres</b><small>Sinon, les widgets restent posés sur le bureau et passent derrière les fenêtres ouvertes (${TXT.findDesk}).</small></span></label>
        <label><input type="checkbox" data-wd="tray" ${c.tray !== false ? 'checked' : ''} ${plus ? '' : 'disabled'}><span><b>Garder Alixo dans ${TXT.tray}</b><small>Fermer la fenêtre principale ne quitte pas Alixo : les widgets restent à jour. ${TXT.trayClick}</small></span></label>
      </div>
      <div class="po-row wd-opacity"><label for="wd-opacity"><b>Opacité</b> <span id="wd-opval">${c.opacity} %</span></label><input type="range" id="wd-opacity" min="40" max="100" step="5" value="${c.opacity}" ${plus ? '' : 'disabled'}></div>
      <div class="po-row" style="gap:8px; margin-top:10px"><button type="button" class="cta ghost small" id="wd-reset" ${plus ? '' : 'disabled'}>Retirer tous les widgets</button></div>
    </div>`;
  }

  function freeSpot(k) {
    const d = kindOf(k); const items = cfg().items;
    const W = screen.w, H = screen.h;
    const fw = d.w / Math.max(1, W - d.w), fh = d.h / Math.max(1, H - d.h);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
      const x = Math.min(1, 0.015 + col * (fw + 0.012)), y = Math.min(1, 0.03 + row * (fh + 0.03));
      if (x > 1 - 0.001 && col) break;
      const hit = items.some(it => { const dd = kindOf(it.k); if (!dd) return false; return Math.abs(it.x * (W - dd.w) - x * (W - d.w)) < Math.min(dd.w, d.w) - 8 && Math.abs(it.y * (H - dd.h) - y * (H - d.h)) < Math.min(dd.h, d.h) - 8; });
      if (!hit) return { x, y };
    }
    return { x: 0.5, y: 0.5 };
  }
  function addWidget(k, pos) {
    if (!requirePlus('widgets')) return null;
    const d = kindOf(k); if (!d) return null;
    const it = { id: uid(), k, opts: {} };
    Object.assign(it, pos || freeSpot(k));
    cfg().items.push(it);
    if (desk() && !cfg().on && cfg().items.length === 1) cfg().on = true;
    stamp(); sync(); selected = it.id;
    renderDesk(); renderCatCounts();
    const on = $('#wd-on'); if (on) on.checked = cfg().on;
    toast(`« ${d.name} » posé sur le bureau`);
    return it;
  }
  function removeWidget(id) {
    const c = cfg(); c.items = c.items.filter(x => x.id !== id);
    if (selected === id) selected = null;
    stamp(); sync(); renderDesk(); renderCatCounts();
  }
  function renderCatCounts() {
    const c = cfg();
    document.querySelectorAll('#wd-cat .wd-tile').forEach(t => {
      const n = c.items.filter(i => i.k === t.dataset.k).length;
      const b = t.querySelector('.wd-tname'); const old = b.querySelector('.wd-count'); if (old) old.remove();
      if (n) b.insertAdjacentHTML('beforeend', `<span class="wd-count">${n}</span>`);
    });
  }

  function renderDesk() {
    const el = $('#wd-desk'); if (!el) return;
    const c = cfg(); const sc = el.clientWidth / screen.w || DESK_W / screen.w;
    el.innerHTML = `<div class="wd-wall"></div>
      ${c.items.map(it => { const d = kindOf(it.k); if (!d) return '';
        const W = screen.w, H = screen.h;
        return `<div class="wd-item ${selected === it.id ? 'on' : ''}" data-id="${it.id}" style="--wc:${d.color}; left:${(it.x * (W - d.w) * sc).toFixed(1)}px; top:${(it.y * (H - d.h) * sc).toFixed(1)}px; width:${(d.w * sc).toFixed(1)}px; height:${(d.h * sc).toFixed(1)}px" title="${esc(d.name)}"><span class="wd-ihead"><i>${d.ico}</i><em>${esc(d.name)}</em><button type="button" class="wd-x" data-x="${it.id}" title="Retirer">×</button></span><span class="wd-ibody"><s></s><s></s><s></s></span></div>`; }).join('')}
      ${c.items.length ? '' : '<div class="wd-empty">Aucun widget pour l’instant : glissez-en un ici depuis le catalogue.</div>'}`;
    renderOpts();
  }
  function renderOpts() {
    const box = $('#wd-opts'); if (!box) return;
    const it = cfg().items.find(x => x.id === selected);
    if (!it) { box.innerHTML = '<div class="wd-optempty">Cliquez un widget du bureau pour ses options.</div>'; return; }
    const d = kindOf(it.k); const o = it.opts || (it.opts = {});
    let body = '';
    if (it.k === 'jourj') {
      const auto = jourJ(null);
      body = `<div class="po-row wd-orow"><label>Événement <input type="text" id="wdo-title" maxlength="60" placeholder="${esc(auto.title || 'Partiel de droit constitutionnel')}" value="${esc(o.title || '')}"></label><label>Date <input type="date" id="wdo-date" value="${esc(o.date || '')}"></label></div>
        <div class="po-hint" style="margin:4px 0 0">${auto.title ? `Sans date choisie, le widget suit l’agenda : <b>${esc(auto.title)}</b> dans ${auto.days} jour${auto.days > 1 ? 's' : ''}.` : 'Sans date choisie, le widget prend le prochain événement de l’agenda dont le titre contient « partiel », « examen », « contrôle », « oral », « concours »…'}</div>`;
    } else if (it.k === 'minuteur') {
      body = `<div class="po-row wd-orow"><label>Durées proposées (minutes) <input type="text" id="wdo-presets" placeholder="25, 5, 45" value="${esc(o.presets || '')}"></label></div><div class="po-hint" style="margin:4px 0 0">Trois durées au plus, séparées par des virgules. Le minuteur est celui de l’application : il se retrouve en haut de l’écran dans tous les cours.</div>`;
    } else if (it.k === 'taches') {
      body = `<div class="set-checks"><label><input type="checkbox" id="wdo-addtoday" ${o.addToday !== false ? 'checked' : ''}><span><b>Les tâches ajoutées depuis le widget sont pour aujourd’hui</b><small>Décoché : sans échéance.</small></span></label></div>`;
    } else if (it.k === 'reprendre') {
      body = `<div class="po-hint" style="margin:0">Les cinq séances modifiées le plus récemment, tous dossiers confondus.</div>`;
    } else body = `<div class="po-hint" style="margin:0">${esc(d.sub)}</div>`;
    if (it.k === 'jourj' || it.k === 'minuteur' || it.k === 'taches') body = `<div class="po-hint" style="margin:0 0 8px">${esc(d.sub)}</div>` + body;
    box.innerHTML = `<div class="wd-optcard" style="--wc:${d.color}"><div class="wd-opthead"><i>${d.ico}</i><b>${esc(d.name)}</b><span class="wd-size">${d.w} × ${d.h}</span><button type="button" class="cta ghost small" data-x="${it.id}">Retirer</button></div>${body}</div>`;
  }

  function bindSettings(root) {
    const c = cfg();
    const plusBtn = root.querySelector('#wd-plus'); if (plusBtn) plusBtn.addEventListener('click', () => openPlusDialog('widgets'));
    const on = root.querySelector('#wd-on'); if (on) on.addEventListener('change', () => { if (!requirePlus('widgets')) { on.checked = false; return; } c.on = on.checked; stamp(); sync(); if (on.checked && !c.items.length) toast('Ajoutez un widget depuis le catalogue'); });
    root.querySelectorAll('[data-wd]').forEach(cb => cb.addEventListener('change', () => { c[cb.dataset.wd] = cb.checked; stamp(); sync(true); }));
    /* 1.43 : ouverture de session — l'interrupteur reflète l'état du système, relu à chaque affichage */
    const lg = root.querySelector('#wd-login');
    if (lg) {
      loginState().then(info => {
        if (!lg.isConnected) return;
        lg.checked = !!(info && info.on); lg.disabled = !(info && info.supported);
        const h = root.querySelector('#wd-loginhint');
        if (h && info && info.blocked) h.insertAdjacentHTML('beforeend', ' <b>Désactivé dans le Gestionnaire des tâches de Windows (onglet « Démarrage ») : réactivez-le là-bas.</b>');
      });
      lg.addEventListener('change', async () => {
        const want = lg.checked; lg.disabled = true;
        const r = await setLogin(want);
        lg.disabled = false;
        if (!r || !r.ok) { lg.checked = !want; toast('Impossible de modifier le lancement au démarrage'); return; }
        lg.checked = !!r.on;
        markLoginAsked();
        toast(r.on ? 'Alixo se lancera à l’ouverture de la session' : 'Alixo ne se lancera plus à l’ouverture de la session');
      });
    }
    const op = root.querySelector('#wd-opacity');
    if (op) { op.addEventListener('input', () => { c.opacity = +op.value; root.querySelector('#wd-opval').textContent = c.opacity + ' %'; publish(); }); op.addEventListener('change', () => stamp()); }
    const reset = root.querySelector('#wd-reset'); if (reset) reset.addEventListener('click', () => { if (!c.items.length) return; c.items = []; selected = null; stamp(); sync(); renderDesk(); renderCatCounts(); toast('Widgets retirés du bureau'); });

    /* catalogue : Ajouter, Aperçu, glisser vers le bureau */
    const cat = root.querySelector('#wd-cat');
    cat.addEventListener('click', e => {
      const add = e.target.closest('[data-add]'); if (add) { addWidget(add.dataset.add); return; }
      const pv = e.target.closest('[data-preview]'); if (pv) openPreview(pv.dataset.preview);
    });
    cat.addEventListener('dragstart', e => {
      const t = e.target.closest('.wd-tile'); if (!t || !isPlus()) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/alixo-widget', t.dataset.k); e.dataTransfer.effectAllowed = 'copy';
    });
    const dk = root.querySelector('#wd-desk');
    dk.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/alixo-widget')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dk.classList.add('over'); } });
    dk.addEventListener('dragleave', () => dk.classList.remove('over'));
    dk.addEventListener('drop', e => {
      dk.classList.remove('over');
      const k = e.dataTransfer.getData('text/alixo-widget'); if (!k) return;
      e.preventDefault();
      const d = kindOf(k); const r = dk.getBoundingClientRect(); const sc = r.width / screen.w;
      const x = clamp01(((e.clientX - r.left) / sc - d.w / 2) / Math.max(1, screen.w - d.w));
      const y = clamp01(((e.clientY - r.top) / sc - d.h / 2) / Math.max(1, screen.h - d.h));
      addWidget(k, { x, y });
    });
    /* faux bureau : sélection, retrait, déplacement à la souris */
    dk.addEventListener('click', e => {
      const x = e.target.closest('[data-x]'); if (x) { removeWidget(x.dataset.x); return; }
      const it = e.target.closest('.wd-item');
      selected = it ? it.dataset.id : null;
      dk.querySelectorAll('.wd-item').forEach(n => n.classList.toggle('on', n.dataset.id === selected));
      renderOpts();
    });
    dk.addEventListener('pointerdown', e => {
      const node = e.target.closest('.wd-item'); if (!node || e.target.closest('[data-x]') || e.button !== 0) return;
      const it = c.items.find(x => x.id === node.dataset.id); const d = it && kindOf(it.k); if (!d) return;
      e.preventDefault();
      const r = dk.getBoundingClientRect(); const sc = r.width / screen.w;
      const ox = e.clientX - node.offsetLeft, oy = e.clientY - node.offsetTop;
      const maxX = (screen.w - d.w) * sc, maxY = (screen.h - d.h) * sc;
      let moved = false;
      node.setPointerCapture(e.pointerId); node.classList.add('drag');
      const mv = ev => {
        const nx = Math.max(0, Math.min(maxX, ev.clientX - ox)), ny = Math.max(0, Math.min(maxY, ev.clientY - oy));
        node.style.left = nx + 'px'; node.style.top = ny + 'px'; moved = true;
      };
      const up = ev => {
        node.removeEventListener('pointermove', mv); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up);
        node.classList.remove('drag');
        if (!moved) return;
        it.x = clamp01(parseFloat(node.style.left) / Math.max(1, maxX)); it.y = clamp01(parseFloat(node.style.top) / Math.max(1, maxY));
        stamp(); sync();
      };
      node.addEventListener('pointermove', mv); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
    });
    /* options du widget sélectionné */
    const opts = root.querySelector('#wd-opts');
    opts.addEventListener('click', e => { const x = e.target.closest('[data-x]'); if (x) removeWidget(x.dataset.x); });
    opts.addEventListener('input', e => {
      const it = c.items.find(x => x.id === selected); if (!it) return; const o = it.opts || (it.opts = {});
      if (e.target.id === 'wdo-title') o.title = e.target.value.slice(0, 60);
      if (e.target.id === 'wdo-date') o.date = e.target.value;
      if (e.target.id === 'wdo-presets') o.presets = e.target.value.slice(0, 20);
      if (e.target.id === 'wdo-addtoday') o.addToday = e.target.checked;
      stamp(); publish();
    });
    renderDesk();
    if (desk()) desk().screen().then(s => { if (s && s.w && s.h && (s.w !== screen.w || s.h !== screen.h)) { screen = { w: s.w, h: s.h }; const sp = root.querySelector('.wd-screen'); if (sp) sp.textContent = `${s.w} × ${s.h}`; dk.style.setProperty('--ratio', (s.h / s.w).toFixed(4)); renderDesk(); } }).catch(() => {});
  }

  /* aperçu d'un widget dans une fenêtre centrale (iframe widget.html, alimentée par postMessage) */
  function openPreview(k) {
    const d = kindOf(k); if (!d) return;
    const c = cfg();
    openDialog({
      id: 'wdprev', cls: 'wd-prevdlg', eyebrow: 'Aperçu du widget', title: d.name, sub: d.sub,
      body: `<div class="wd-prevbox"><iframe class="wd-preview" src="widget.html?k=${encodeURIComponent(k)}&preview=1" style="width:${d.w + 24}px;height:${d.h + 24}px" title="${esc(d.name)}"></iframe></div><div class="po-hint">${isPlus() ? 'L’aperçu est vivant : il montre vos vraies données et réagit comme sur le bureau.' : 'Avec Alixo+, ce widget se pose sur le bureau de votre ordinateur et reste à jour.'}</div>`,
      foot: `<button class="cta ghost" type="button" data-dlg-close>Fermer</button>${c.items.some(i => i.k === k) ? '' : `<button class="cta" type="button" id="wd-prevadd">Ajouter au bureau</button>`}`,
      onMount: (card, close) => {
        const fr = card.querySelector('iframe'); fr.addEventListener('load', () => { publishNow(); });
        const add = card.querySelector('#wd-prevadd'); if (add) add.addEventListener('click', () => { close(); addWidget(k); });
      }
    });
  }
  window.addEventListener('message', e => { if (e.data && e.data.alixoWidgetAction) handleAction(e.data.alixoWidgetAction); });

  /* ---------------- branchements ---------------- */
  const d0 = desk();
  if (d0) {
    d0.onAction(handleAction);
    d0.onMoved(m => handleAction({ type: 'moved', id: m.id, x: m.x, y: m.y }));
    d0.onToggle(on => handleAction({ type: 'toggle', on }));
    d0.screen().then(s => { if (s && s.w && s.h) screen = { w: s.w, h: s.h }; }).catch(() => {});
    setTimeout(() => sync(true), 400);
    setInterval(() => { if (active()) publish(); }, 30000);
    if (!window.ALIXO_AUX) setTimeout(() => maybeAskLogin(0), 6000);
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => publish());

  return { settingsHTML, bindSettings, sync, publish, onSave, handleAction, snapshot, addWidget, removeWidget, openPreview, cfg, storageKey: WD_LS, loginState, setLogin, maybeAskLogin, get active() { return active(); } };
})();
