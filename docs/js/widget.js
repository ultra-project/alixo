/* ============================================================
   Alixo 1.31 — page d'un widget de bureau (widget.html)
   Reçoit les données de l'application (version PC : pont alixoDesktop.widget ; aperçu : postMessage du parent)
   et lui renvoie les actions (cocher une tâche, lancer le minuteur, rouvrir une séance…). Aucune donnée n'est
   lue ici directement : la fenêtre principale d'Alixo reste la seule source.
   ============================================================ */
'use strict';

window.AlixoWidget = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const params = new URLSearchParams(location.search);
  const kind = params.get('k') || 'horloge';
  const id = params.get('id') || '';
  const preview = params.get('preview') === '1';
  const def = (window.ALIXO_WIDGET && ALIXO_WIDGET(kind)) || { k: kind, name: 'Widget', ico: '', color: '#4f66e0' };
  const bridge = window.alixoDesktop && alixoDesktop.widget ? alixoDesktop.widget : null;
  let snap = null, tick = 0;
  let quizQ = null, quizPicked = null, quizSeen = new Set();
  let noteTm = 0;

  const send = a => { a = Object.assign({ id, k: kind }, a); if (bridge) bridge.action(a); else if (window.parent !== window) window.parent.postMessage({ alixoWidgetAction: a }, '*'); };
  const pad2 = n => String(n).padStart(2, '0');
  const fmtClock = secs => { secs = Math.max(0, Math.round(secs)); const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60; return (h ? h + ':' + pad2(m) : String(m)) + ':' + pad2(s); };
  const fmtLeft = m => (m >= 60 ? `${Math.floor(m / 60)} h ${pad2(m % 60)}` : `${m} min`);
  const fmtN = n => (+n || 0).toLocaleString('fr-FR');
  const KIND_ICO = { cours: '📝', slides: '🎞️', sheet: '📊', board: '🗂️', quiz: '❓' };
  const plural = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`;

  /* ---------------- rendu ---------------- */
  function render() {
    const body = $('#wg-body');
    const html = document.documentElement;
    if (!snap) { body.innerHTML = '<div class="wg-empty">Connexion à Alixo…</div>'; return; }
    html.dataset.theme = snap.theme === 'dark' ? 'dark' : 'light';
    html.style.setProperty('--tint', snap.tint || '#4f66e0');
    html.style.setProperty('--op', String((snap.opacity || 100) / 100));
    if (!snap.plus) { body.innerHTML = '<div class="wg-empty"><b>Alixo+</b> est nécessaire pour les widgets de bureau.<br><button type="button" class="wg-cta" data-open="widgets">Voir dans Alixo</button></div>'; return; }
    const r = RENDER[kind];
    body.innerHTML = r ? r() : '<div class="wg-empty">Widget inconnu.</div>';
  }

  const RENDER = {
    taches() {
      const t = snap.taches; if (!t) return '<div class="wg-empty">Tâches indisponibles.</div>';
      const addToday = !(myOpts().addToday === false);
      return `<div class="wg-sum">${t.open ? `<b>${plural(t.open, 'tâche')}</b> à faire${t.late ? ` · <em class="late">${t.late} en retard</em>` : ''}` : '<b>Tout est fait</b> 🎉'}${t.doneToday ? ` · ${t.doneToday} terminée${t.doneToday > 1 ? 's' : ''} aujourd’hui` : ''}</div>
        <div class="wg-list wg-tasks">${t.items.length ? t.items.map(x => `<label class="wg-task ${x.late ? 'late' : ''} ${x.today ? 'today' : ''}"><input type="checkbox" data-todo="${esc(x.id)}"><span class="wg-tt">${x.prio ? '<i class="wg-prio">!</i>' : ''}${esc(x.text)}</span>${x.cat ? `<span class="wg-cat" style="--c:${esc(x.color)}">${esc(x.cat)}</span>` : ''}${x.due ? `<span class="wg-due">${x.late ? 'en retard' : x.today ? 'aujourd’hui' : esc(dueLabel(x.due))}</span>` : ''}</label>`).join('') : '<div class="wg-empty small">Aucune tâche en attente.</div>'}</div>
        <form class="wg-add" id="wg-addform"><input type="text" id="wg-addtext" maxlength="300" placeholder="${addToday ? 'Nouvelle tâche pour aujourd’hui…' : 'Nouvelle tâche…'}" autocomplete="off"><button type="submit" title="Ajouter">＋</button></form>`;
    },
    agenda() {
      const a = snap.agenda; if (!a) return '<div class="wg-empty">Agenda indisponible.</div>';
      const st = a.status;
      const line = o => `<div class="wg-ev ${o.state}" style="--c:${esc(o.color || 'var(--tint)')}"><span class="wg-evt">${esc(o.start)}</span><span class="wg-evn">${esc(o.title)}${o.place ? `<small> · ${esc(o.place)}</small>` : ''}</span></div>`;
      let head = '';
      if (st && st.kind === 'now') head = `<div class="wg-now live" style="--c:${esc(st.color || 'var(--tint)')}"><small>En cours · reste <b id="wg-left">${fmtLeft(st.left)}</b></small><b>${esc(st.title)}</b><span>${esc(st.start)} – ${esc(st.end)}${st.place ? ' · ' + esc(st.place) : ''}</span></div>`;
      else if (st) head = `<div class="wg-now" style="--c:${esc(st.color || 'var(--tint)')}"><small>Prochain · dans <b id="wg-left">${fmtLeft(st.left)}</b></small><b>${esc(st.title)}</b><span>${esc(st.start)} – ${esc(st.end)}${st.place ? ' · ' + esc(st.place) : ''}</span></div>`;
      const rest = a.today.filter(o => o.state !== 'past' && !(st && st.kind === 'now' && o.state === 'now'));
      if (rest.length || head) return head + `<div class="wg-list">${rest.length ? rest.map(line).join('') : ''}</div>${a.today.some(o => o.state === 'past') && !rest.length ? '<div class="wg-foot">Journée terminée.</div>' : ''}`;
      if (a.tomorrow.length) return `<div class="wg-sum">Rien de plus aujourd’hui. <b>Demain :</b></div><div class="wg-list">${a.tomorrow.map(line).join('')}</div>`;
      return '<div class="wg-empty small">Rien de prévu aujourd’hui ni demain.<br><button type="button" class="wg-cta" data-open="agenda">Ouvrir l’agenda</button></div>';
    },
    minuteur() {
      const m = snap.minuteur || { on: false, total: 1500, base: 1500, t0: 0, over: false, label: '' };
      const presets = String(myOpts().presets || '').split(',').map(x => parseInt(x, 10)).filter(x => x > 0 && x <= 600).slice(0, 3);
      const list = presets.length ? presets : [25, 5, 45];
      const running = m.on, left = remaining(m);
      return `<div class="wg-timer ${m.over ? 'over' : ''} ${running ? 'live' : ''}"><div class="wg-digits" id="wg-digits">${m.over ? 'écoulé' : fmtClock(left)}</div>${m.label ? `<div class="wg-tlabel">${esc(m.label)}</div>` : ''}
        <div class="wg-presets">${list.map(p => `<button type="button" data-set="${p * 60}" class="${m.total === p * 60 ? 'on' : ''}" ${running ? 'disabled' : ''}>${p} min</button>`).join('')}</div>
        <div class="wg-tbtns"><button type="button" class="wg-cta" data-timer="${running ? 'pause' : 'start'}">${running ? 'Pause' : (m.over || m.base >= m.total ? 'Démarrer' : 'Reprendre')}</button><button type="button" class="wg-ghost" data-timer="reset" ${running ? 'disabled' : ''}>Remettre</button></div></div>`;
    },
    jourj() {
      const j = (snap.jourj && (snap.jourj[id] || snap.jourj.auto)) || { days: null };
      if (j.days === null || j.days === undefined) return `<div class="wg-empty small">Aucun partiel ni examen dans l’agenda.<br><small>Choisissez une date dans Paramètres › Widgets, ou ajoutez « Partiel de … » à l’agenda.</small></div>`;
      const d = j.days; const lbl = d === 0 ? 'C’est aujourd’hui' : d === 1 ? 'C’est demain' : d < 0 ? 'C’était il y a' : 'Jours restants';
      return `<div class="wg-jj ${d <= 3 ? 'soon' : ''}"><div class="wg-jjn">${d === 0 ? 'J' : d === 1 ? 'J-1' : d < 0 ? `J+${-d}` : `J-${d}`}</div><div class="wg-jjl">${lbl}${d > 1 || d < -1 ? '' : ''}</div><div class="wg-jjt"><b>${esc(j.title || 'Jour J')}</b><span>${esc(fmtDate(j.date))}</span></div></div>`;
    },
    bilan() {
      const b = snap.bilan; if (!b) return '<div class="wg-empty">Bilan indisponible.</div>';
      const max = Math.max(1, ...b.perDay.map(x => x.n));
      const diff = b.words - b.wordsPrev;
      return `<div class="wg-kpis"><div><b>${fmtN(b.words)}</b><span>mots cette semaine</span></div><div><b>${b.streak}</b><span>jour${b.streak > 1 ? 's' : ''} d’affilée</span></div><div><b>${b.docs}</b><span>séance${b.docs > 1 ? 's' : ''} touchée${b.docs > 1 ? 's' : ''}</span></div></div>
        <div class="wg-bars">${b.perDay.map((x, i) => `<div class="wg-bar ${i === b.dayIndex ? 'today' : ''} ${i > b.dayIndex ? 'future' : ''}" title="${esc(x.d)} : ${fmtN(x.n)} mots"><i style="height:${Math.max(x.n ? 6 : 2, Math.round(x.n / max * 100))}%"></i><span>${esc(x.d.replace('.', ''))}</span></div>`).join('')}</div>
        <div class="wg-foot">${diff >= 0 ? `+${fmtN(diff)}` : fmtN(diff)} mots par rapport à la semaine passée${b.hours ? ` · ${Math.round(b.hoursDone)} h de cours sur ${Math.round(b.hours)}` : ''}</div>`;
    },
    reprendre() {
      const r = snap.reprendre || [];
      if (!r.length) return '<div class="wg-empty small">Aucune séance pour l’instant.</div>';
      return `<div class="wg-list">${r.map(d => `<button type="button" class="wg-doc" data-doc="${esc(d.id)}" style="--c:${esc(d.color || 'var(--tint)')}"><i>${KIND_ICO[d.kind] || '📝'}</i><span class="wg-docn">${esc(d.title)}${d.folder ? `<small>${esc(d.folder)}</small>` : ''}</span><span class="wg-when">${esc(d.when)}</span></button>`).join('')}</div>`;
    },
    pensebete() {
      const n = snap.pensebete || { text: '' };
      return `<textarea class="wg-note" id="wg-note" maxlength="2000" placeholder="Notez ici ce qu’il ne faut pas oublier…" spellcheck="true">${esc(n.text)}</textarea>`;
    },
    quiz() {
      const q = snap.quiz; if (!q) return '<div class="wg-empty">Quiz indisponible.</div>';
      if (!q.pool.length) return `<div class="wg-empty small">${q.quizzes ? 'Vos quiz n’ont pas encore de question à choix unique rédigée.' : 'Créez un quiz dans Alixo : ses questions s’afficheront ici.'}<br><button type="button" class="wg-cta" data-open="${q.quizzes ? 'quiz-new' : 'quiz-new'}">Ouvrir Alixo</button></div>`;
      if (!quizQ || !q.pool.some(x => x.id === quizQ.id)) pickQuestion(q.pool);
      const qq = quizQ;
      return `<div class="wg-qsrc">${esc(qq.title)}</div><div class="wg-qtext">${esc(qq.text)}</div>
        <div class="wg-qopts">${qq.opts.map((o, i) => `<button type="button" data-opt="${esc(o.id)}" class="${quizPicked ? (o.id === qq.ans ? 'good' : o.id === quizPicked ? 'bad' : 'off') : ''}" ${quizPicked ? 'disabled' : ''}><i>${'ABCD'[i] || i + 1}</i>${esc(o.text)}</button>`).join('')}</div>
        <div class="wg-qfoot">${quizPicked ? `<span class="${quizPicked === qq.ans ? 'ok' : 'ko'}">${quizPicked === qq.ans ? 'Bonne réponse !' : 'Raté.'}</span>` : '<span>Choisissez une réponse</span>'}<button type="button" class="wg-ghost small" data-next="1">Une autre</button></div>`;
    },
    horloge() {
      const now = new Date();
      const st = snap.agenda && snap.agenda.status;
      return `<div class="wg-clock"><div class="wg-time" id="wg-time">${pad2(now.getHours())}:${pad2(now.getMinutes())}</div><div class="wg-date" id="wg-date">${esc(longDate(now))}</div><div class="wg-week">Semaine ${isoWeek(now)}${st ? ` · ${st.kind === 'now' ? 'en cours' : st.start} ${esc(st.title)}` : ''}</div></div>`;
    }
  };

  /* ---------------- aides ---------------- */
  const myOpts = () => (snap && snap.opts && snap.opts[id]) || {};
  const remaining = m => Math.max(0, m.base - (m.on ? (Date.now() - m.t0) / 1000 : 0));
  const parseYmd = k => { const [y, mo, d] = String(k).split('-').map(Number); return new Date(y, mo - 1, d); };
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const fmtDate = k => (k ? cap(parseYmd(k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })) : '');
  const longDate = d => cap(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
  function dueLabel(k) {
    const d = parseYmd(k), n = new Date(); const t0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const diff = Math.round((d - t0) / 86400000);
    if (diff === 1) return 'demain'; if (diff > 1 && diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
  function isoWeek(d) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 86400000 + 1) / 7); }
  function pickQuestion(pool) {
    const fresh = pool.filter(q => !quizSeen.has(q.id));
    const src = fresh.length ? fresh : pool; if (!fresh.length) quizSeen.clear();
    quizQ = src[Math.floor(Math.random() * src.length)]; quizPicked = null; quizSeen.add(quizQ.id);
  }

  /* ---------------- horloge interne : minuteur, heure, temps restant ---------------- */
  function onTick() {
    if (!snap || !snap.plus) return;
    if (kind === 'minuteur' && snap.minuteur) {
      const m = snap.minuteur; const el = $('#wg-digits'); if (!el) return;
      const left = remaining(m);
      if (m.on && left <= 0) { el.textContent = 'écoulé'; el.closest('.wg-timer').classList.add('over'); return; }
      el.textContent = m.over ? 'écoulé' : fmtClock(left);
    }
    if (kind === 'horloge') { const now = new Date(); const t = $('#wg-time'); if (t) t.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`; const d = $('#wg-date'); if (d) d.textContent = longDate(now); }
    if (kind === 'agenda' && snap.agenda && snap.agenda.status) {
      const st = snap.agenda.status; const el = $('#wg-left'); if (!el) return;
      const elapsed = Math.round((Date.now() - snap.now) / 60000);
      const left = st.left - elapsed; if (left <= 0) return;   /* la prochaine publication rafraîchit l'état */
      el.textContent = fmtLeft(left);
    }
  }

  /* ---------------- interactions ---------------- */
  function bind() {
    $('#wg-open').addEventListener('click', () => send({ type: 'open', what: OPEN_WHAT[kind] || 'app' }));
    $('#wg-x').addEventListener('click', () => send({ type: 'close' }));
    const body = $('#wg-body');
    body.addEventListener('change', e => {
      const cb = e.target.closest('[data-todo]'); if (cb) { cb.closest('.wg-task').classList.add('done'); send({ type: 'todo-toggle', id: cb.dataset.todo }); }
    });
    body.addEventListener('submit', e => {
      if (e.target.id !== 'wg-addform') return; e.preventDefault();
      const inp = $('#wg-addtext'); const txt = inp.value.trim(); if (!txt) return;
      send({ type: 'todo-add', text: txt, today: !(myOpts().addToday === false) }); inp.value = '';
    });
    body.addEventListener('click', e => {
      const op = e.target.closest('[data-open]'); if (op) { send({ type: 'open', what: op.dataset.open }); return; }
      const dc = e.target.closest('[data-doc]'); if (dc) { send({ type: 'open', what: 'doc', id: dc.dataset.doc }); return; }
      const ps = e.target.closest('[data-set]'); if (ps) { send({ type: 'timer', op: 'set', secs: +ps.dataset.set }); return; }
      const tb = e.target.closest('[data-timer]'); if (tb) { send({ type: 'timer', op: tb.dataset.timer }); return; }
      const o = e.target.closest('[data-opt]'); if (o && !quizPicked) { quizPicked = o.dataset.opt; render(); return; }
      const nx = e.target.closest('[data-next]'); if (nx && snap && snap.quiz) { pickQuestion(snap.quiz.pool); render(); }
    });
    body.addEventListener('input', e => {
      if (e.target.id !== 'wg-note') return;
      clearTimeout(noteTm); const v = e.target.value; noteTm = setTimeout(() => send({ type: 'note', text: v }), 500);
    });
  }
  const OPEN_WHAT = { taches: 'todo', agenda: 'agenda', minuteur: 'timer', jourj: 'agenda', bilan: 'stats', reprendre: 'app', pensebete: 'app', quiz: 'app', horloge: 'agenda' };

  function feed(s) {
    const focusNote = document.activeElement && document.activeElement.id === 'wg-note';
    snap = s;
    if (kind === 'pensebete' && focusNote) { const ta = $('#wg-note'); if (ta && snap.pensebete && snap.pensebete.text !== ta.value) { /* saisie en cours : on garde le texte local */ } return; }
    render();
    onTick();
  }

  /* ---------------- 1.32 : déplacement après appui long (version PC) ----------------
     Un appui maintenu 450 ms n'importe où sur le widget (hors champs de saisie) le fait trembler : on le déplace alors
     à la souris, l'emplacement est enregistré en relâchant. Un clic ou un glissement court ne déplacent rien. */
  let press = null, moving = false, swallowClick = false;
  function bindLongPress() {
    if (!bridge || preview || !bridge.drag) return;
    const wg = $('#wg');
    wg.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('input, textarea, select, button, a, [data-opt]')) return;
      press = { x: e.clientX, y: e.clientY, id: e.pointerId, tm: setTimeout(() => {
        moving = true; document.body.classList.add('moving');
        try { wg.setPointerCapture(press.id); } catch { /* */ }
        bridge.drag({ phase: 'start', sx: e.screenX, sy: e.screenY });
      }, 450) };
    });
    const cancel = () => { if (press) { clearTimeout(press.tm); press = null; } };
    wg.addEventListener('pointermove', e => {
      if (moving) { bridge.drag({ phase: 'move', sx: e.screenX, sy: e.screenY }); return; }
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) cancel();
    });
    const end = e => {
      if (moving) {
        moving = false; swallowClick = true; document.body.classList.remove('moving');
        try { wg.releasePointerCapture(e.pointerId); } catch { /* */ }
        bridge.drag({ phase: 'end', sx: e.screenX, sy: e.screenY });
        setTimeout(() => { swallowClick = false; }, 50);
      }
      cancel();
    };
    wg.addEventListener('pointerup', end); wg.addEventListener('pointercancel', end);
    wg.addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && moving) end(e); });
  }

  /* ---------------- démarrage ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    const wg = $('#wg'); wg.hidden = false; wg.classList.add('k-' + kind);
    document.documentElement.style.setProperty('--wc', def.color);
    $('#wg-ico').innerHTML = def.ico; $('#wg-name').textContent = def.name; document.title = `${def.name} — Alixo`;
    if (bridge && !preview) { $('#wg-x').hidden = false; document.body.classList.add('desktop'); }
    if (preview) document.body.classList.add('preview');
    bind(); bindLongPress(); render();
    tick = setInterval(onTick, 1000);
    if (bridge) { bridge.onData(feed); bridge.ready().then(s => { if (s) feed(s); }).catch(() => {}); }
    window.addEventListener('message', e => { if (e.data && e.data.alixoWidget) feed(e.data.alixoWidget); });
  });

  return { feed, get snapshot() { return snap; }, kind, id };
})();
