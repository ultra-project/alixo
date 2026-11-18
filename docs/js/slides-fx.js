/* ============================================================
   Alixo — présentations : animations et transitions (js/slides-fx.js) 1.54
   ------------------------------------------------------------
   Catalogues ANIMS / TRANSITIONS, pop-overs « Animation » et « Transition »,
   aperçu dans l'éditeur, moteur d'étapes (blocs qui apparaissent au clic) et
   transitions entre diapositives (pur DOM, CSS dans slides.css).

   Modèle (tous champs optionnels ; absents = comportement 1.53) :
     bloc        e.anim  = { fx, dur: 0,2…2 s, ord: 0 = avec la diapositive, n ≥ 1 = au n-ième clic }
     diapositive s.trans = { fx, dur }
   En mode present/audience/presenter, slides.js pose sur chaque bloc animé :
     data-ord="n" data-fx="<fx>" style="--adur:0.6s" (+ classe anim-wait si n > étape).
   applyStep(root, step, animate) révèle les blocs d'ordre ≤ step (anim-in sur ceux
   de l'étape courante) ; transition(stage, oldPin, newPin, trans, dir) enchaîne deux
   diapositives (classes tr-<fx> dir-next|prev sur la scène, .out / .in sur les pins).

   Chargé APRÈS js/slides.js : utilise AlixoSlides (doc, slide, el, renderCanvas…) et
   les globales d'app.js (showPopover, hidePopover, esc, toast). Aucune dépendance.
   ============================================================ */
'use strict';

window.AlixoSlidesFx = (() => {
  const S = () => window.AlixoSlides || {};
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const E = s => (typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

  /* ---------------- catalogues ---------------- */
  const ANIMS = [
    { k: 'fade', name: 'Fondu', kf: 'sl-fade' },
    { k: 'up', name: 'Montée', kf: 'sl-up' },
    { k: 'down', name: 'Descente', kf: 'sl-down' },
    { k: 'left', name: 'Depuis la gauche', kf: 'sl-left' },
    { k: 'right', name: 'Depuis la droite', kf: 'sl-right' },
    { k: 'zoom', name: 'Zoom', kf: 'sl-zoom' },
    { k: 'pop', name: 'Rebond', kf: 'sl-pop' },
    { k: 'flip', name: 'Retournement', kf: 'sl-flip' },
    { k: 'wipe', name: 'Volet', kf: 'sl-wipe' },
    { k: 'type', name: 'Machine à écrire', kf: 'sl-type', textOnly: true }
  ];
  const TRANSITIONS = [
    { k: 'none', name: 'Aucune' },
    { k: 'fade', name: 'Fondu' },
    { k: 'slide', name: 'Glissement' },
    { k: 'push', name: 'Poussée' },
    { k: 'zoom', name: 'Zoom' },
    { k: 'wipe', name: 'Volet' },
    { k: 'cube', name: 'Cube' },
    { k: 'flip', name: 'Retournement' }
  ];
  const ANIM_K = ANIMS.map(a => a.k), TRANS_K = TRANSITIONS.map(t => t.k);
  const THREE_D = ['cube', 'flip'];
  /* blocs « texte » (seuls à accepter la machine à écrire) : la liste TEXT_BLOCKS de slides.js (repli local si elle n'est pas exposée) */
  const TEXT_T_FALLBACK = ['title', 'subtitle', 'text', 'kicker', 'list', 'olist', 'checklist', 'quote', 'code', 'callout', 'definition', 'juris', 'stat', 'kpis', 'question', 'steps', 'compare', 'agenda', 'session', 'table', 'sticky', 'bubble', 'badge', 'progress', 'qr', 'shape'];
  const textBlocks = () => (Array.isArray(S().TEXT_BLOCKS) ? S().TEXT_BLOCKS : TEXT_T_FALLBACK);
  const DUR_MIN = 0.2, DUR_MAX = 2, DUR_DEF = 0.6, ORD_MAX = 50;

  const mq = q => !!(window.matchMedia && matchMedia(q).matches);
  const reduced = () => mq('(prefers-reduced-motion: reduce)');
  /* arbitrage 7 : pas de 3D sur pointeur grossier ni sous 700 px (cube et retournement deviennent un fondu) */
  const no3d = () => mq('(pointer: coarse)') || window.innerWidth < 700;

  /* ---------------- normalisation (liste blanche stricte, pour AlixoSlides.normalize) ---------------- */
  const num = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v) ? +v : null;
  const normDur = v => { const n = num(v); return n === null ? DUR_DEF : Math.round(Math.max(DUR_MIN, Math.min(DUR_MAX, n)) * 10) / 10; };
  function normAnim(a) {
    if (!a || typeof a !== 'object' || Array.isArray(a) || typeof a.fx !== 'string' || !ANIM_K.includes(a.fx)) return null;
    const o = num(a.ord);
    return { fx: a.fx, dur: normDur(a.dur), ord: o === null ? 1 : Math.max(0, Math.min(ORD_MAX, Math.round(o))) };
  }
  function normTrans(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t) || typeof t.fx !== 'string' || !TRANS_K.includes(t.fx)) return null;
    return { fx: t.fx, dur: normDur(t.dur) };
  }
  const fmtDur = d => String(normDur(d)).replace('.', ',') + ' s';
  const animName = k => (ANIMS.find(a => a.k === k) || {}).name || '';
  const transName = k => (TRANSITIONS.find(t => t.k === k) || TRANSITIONS[0]).name;

  /* ---------------- étapes (ordres d'apparition) ---------------- */
  const animOf = e => (e && normAnim(e.anim)) || null;
  /* ordres distincts ≥ 1 présents sur la diapositive, triés : [1, 2, …] */
  function steps(s) {
    const set = new Set();
    for (const e of (s && s.els) || []) { const a = animOf(e); if (a && a.ord >= 1) set.add(a.ord); }
    return [...set].sort((x, y) => x - y);
  }
  const maxStep = s => { const st = steps(s); return st.length ? st[st.length - 1] : 0; };
  /* `step` courant sur un conteneur rendu en mode présentation : ord ≤ step visible (anim-in pour l'étape atteinte si `animate`),
     ord > step en attente (anim-wait). Les blocs révélés plus tôt gardent leur état (pas de rejeu). */
  function applyStep(root, step, animate) {
    if (!root) return;
    const n = Math.max(0, +step || 0);
    root.querySelectorAll('.sl-el[data-ord]').forEach(el => {
      const ord = Math.max(0, +el.dataset.ord || 0);
      if (ord > n) { el.classList.add('anim-wait'); el.classList.remove('anim-in'); return; }
      el.classList.remove('anim-wait');
      if (ord === n && animate && !reduced()) { el.classList.remove('anim-in'); void el.offsetWidth; el.classList.add('anim-in'); }
      else if (ord === n || !animate) el.classList.remove('anim-in');
    });
  }
  /* tout visible, sans animation (retour arrière, PDF, écran présentateur « suite ») */
  function resetSteps(root) { if (root) root.querySelectorAll('.sl-el.anim-wait, .sl-el.anim-in').forEach(el => el.classList.remove('anim-wait', 'anim-in')); }

  /* ---------------- transition entre deux diapositives ---------------- */
  const TR_CLS = TRANSITIONS.map(t => 'tr-' + t.k).concat(['tr-3d', 'dir-next', 'dir-prev']);
  function clearStage(stage) { if (stage) { stage.classList.remove(...TR_CLS); stage.style.removeProperty('--tdur'); } }
  /* oldPin peut être null (premier affichage). Résout quand la nouvelle diapositive est en place et les classes nettoyées. */
  function transition(stage, oldPin, newPin, trans, dir) {
    return new Promise(resolve => {
      const t = normTrans(trans);
      let fx = t ? t.fx : 'none';
      if (THREE_D.includes(fx) && no3d()) fx = 'fade';
      const swap = () => { if (newPin) { newPin.hidden = false; newPin.classList.remove('in', 'out'); } if (oldPin && oldPin !== newPin) { oldPin.hidden = true; oldPin.classList.remove('in', 'out'); } clearStage(stage); resolve(); };
      if (!stage || !newPin || !oldPin || oldPin === newPin || fx === 'none' || reduced()) { swap(); return; }
      const dur = t.dur;
      clearStage(stage);
      stage.style.setProperty('--tdur', dur + 's');
      stage.classList.add('tr-' + fx, dir === 'prev' ? 'dir-prev' : 'dir-next');
      if (THREE_D.includes(fx)) stage.classList.add('tr-3d');
      oldPin.classList.remove('in'); oldPin.classList.add('out');
      newPin.classList.remove('out'); newPin.hidden = false; newPin.classList.add('in');
      let done = false, tm = 0;
      const end = ev => { if (ev && ev.target !== newPin) return; if (done) return; done = true; clearTimeout(tm); newPin.removeEventListener('animationend', end); swap(); };
      newPin.addEventListener('animationend', end);
      tm = setTimeout(end, dur * 1000 + 80);
    });
  }

  /* ---------------- libellés ---------------- */
  /* « au 1er clic », « au 2e clic »… */
  const ordinal = n => `${n}${n === 1 ? 'er' : 'e'} clic`;
  /* « Fondu · au 2e clic · 0,6 s » (infobulle de la pastille) */
  function label(e) {
    const a = animOf(e); if (!a) return '';
    return `${animName(a.fx)} · ${a.ord ? 'au ' + ordinal(a.ord) : 'avec la diapositive'} · ${fmtDur(a.dur)}`;
  }
  /* bouton de la barre : « Animation », « Animation · 2 » (un bloc : son ordre, « avec la diapo » = ordre 0), « Animation · 3 blocs » */
  function barLabel(ids) {
    const els = (ids || []).map(id => S().el && S().el(id)).filter(Boolean);
    const an = els.map(animOf).filter(Boolean);
    if (!an.length) return 'Animation';
    if (els.length === 1) return `Animation · ${an[0].ord || 'avec la diapo'}`;
    return `Animation · ${an.length} bloc${an.length > 1 ? 's' : ''}`;
  }
  const transLabel = s => `Transition : ${transName(s && s.trans && normTrans(s.trans) ? s.trans.fx : 'none')}`;

  /* ---------------- aperçus dans l'éditeur ---------------- */
  let pvTm = [];
  const clearPv = () => { pvTm.forEach(clearTimeout); pvTm = []; };
  function pvCleanup(nodes) { nodes.forEach(n => { n.classList.remove('anim-wait', 'anim-in'); delete n.dataset.fx; n.style.removeProperty('--adur'); }); }
  /* rejoue sur la scène (#sl-canvas) l'animation des blocs `ids` (ou de tous les blocs animés), groupe par groupe (300 ms d'écart) */
  function previewAnim(ids) {
    const c = $('#sl-canvas'); const s = S().slide && S().slide(); if (!c || !s) return;
    clearPv();
    const all = $$('#sl-canvas .sl-el'); pvCleanup(all);
    const items = (s.els || []).filter(e => animOf(e) && (!ids || !ids.length || ids.includes(e.id)))
      .map(e => ({ a: animOf(e), n: c.querySelector(`.sl-el[data-id="${e.id}"]`) })).filter(x => x.n);
    if (!items.length) return;
    items.forEach(({ a, n }) => { n.dataset.fx = a.fx; n.style.setProperty('--adur', a.dur + 's'); n.classList.add('anim-wait'); });
    const ords = [...new Set(items.map(x => x.a.ord))].sort((x, y) => x - y);
    let maxEnd = 0;
    ords.forEach((o, i) => {
      const at = i * 300;
      items.filter(x => x.a.ord === o).forEach(({ a, n }) => { maxEnd = Math.max(maxEnd, at + a.dur * 1000); pvTm.push(setTimeout(() => { n.classList.remove('anim-wait'); n.classList.add('anim-in'); }, at)); });
    });
    pvTm.push(setTimeout(() => pvCleanup(items.map(x => x.n)), maxEnd + 150));
  }
  /* joue la transition de la diapositive courante (depuis la précédente, ou une page vide) par-dessus la scène */
  async function previewTrans() {
    const st = $('#sl-stage'); const dd = S().doc && S().doc(); const s = S().slide && S().slide(); if (!st || !dd || !s || !S().slideHTML) return;
    const list = S().slides ? S().slides() : (dd.slides || []); const i = list.indexOf(s);
    const prev = i > 0 ? list[i - 1] : { id: 'blank', bg: 'paper', els: [] };
    const old = st.querySelector('.sl-fxpv'); if (old) old.remove();
    const ov = document.createElement('div'); ov.className = 'sl-pstage sl-fxpv'; ov.setAttribute('aria-hidden', 'true');
    const SW = S().SW || 1280, SH = S().SH || 720;
    const r = st.getBoundingClientRect(); const k = Math.max(0.05, Math.min((r.width - 56) / SW, (r.height - 56) / SH));
    const pin = (sl, idx) => { const p = document.createElement('div'); p.className = 'sl-pin'; p.innerHTML = S().slideHTML(sl, dd, false, idx, { mode: 'thumb' }); p.style.transform = `translate(-50%, -50%) scale(${k})`; return p; };
    const p0 = pin(prev, Math.max(0, i - 1)), p1 = pin(s, i); p1.hidden = true;
    ov.append(p0, p1); st.appendChild(ov);
    await new Promise(r2 => requestAnimationFrame(r2));
    await transition(ov, p0, p1, s.trans || { fx: 'fade', dur: 0.6 }, 'next');
    await new Promise(r2 => setTimeout(r2, 350));
    ov.remove();
  }

  /* ---------------- pop-over « Animation » ---------------- */
  const anchorRect = a => a && a.getBoundingClientRect ? a.getBoundingClientRect() : (typeof centerRect === 'function' ? centerRect() : { left: innerWidth / 2 - 160, top: innerHeight / 3, bottom: innerHeight / 3 });
  function refreshAfterWrite() { const A = S(); if (A.commit) A.commit(); if (A.renderCanvas) A.renderCanvas(); if (A.paintSel) A.paintSel(); if (A.renderBar) A.renderBar(); }
  function animPopover(ids, anchor) {
    const A = S(); const s = A.slide && A.slide(); if (!s || typeof showPopover !== 'function') return;
    if (A.isReadOnly && A.isReadOnly()) return;
    const els = (ids || []).map(id => A.el(id)).filter(Boolean); if (!els.length) return;
    const allText = els.every(e => textBlocks().includes(e.t));
    const first = animOf(els[0]);
    const others = (s.els || []).filter(e => !els.includes(e));
    const nMax = maxStep({ els: others }) + 1;      // « Au 1er clic … nMax »
    const sameAsPrev = maxStep({ els: others });    // « En même temps que le précédent »
    const curFx = first ? first.fx : '', curDur = first ? first.dur : DUR_DEF;
    const curOrd = first ? Math.min(first.ord, nMax) : nMax;
    const ordOpts = [['0', 'Avec la diapositive']];
    for (let n = 1; n <= nMax; n++) ordOpts.push([String(n), 'Au ' + ordinal(n)]);
    ordOpts.push(['same', 'En même temps que le précédent']);
    const multi = els.length > 1;
    const tiles = ANIMS.map(a => `<button type="button" class="sl-animtile${a.k === curFx ? ' on' : ''}" data-fx="${a.k}" ${a.textOnly && !allText ? 'disabled title="Réservé aux blocs de texte"' : `title="${E(a.name)}"`}><i data-fx="${a.k}"></i><span>${E(a.name)}</span></button>`).join('');
    showPopover(`<h4>${multi ? `Animation de ${els.length} blocs` : 'Animation'}</h4>
      <div class="sl-animgrid" id="po-fxgrid">${tiles}</div>
      <label class="sl-fxrow">Durée <input type="range" id="po-fxdur" min="${DUR_MIN}" max="${DUR_MAX}" step="0.1" value="${curDur}" aria-label="Durée de l’animation"><b id="po-fxdurv">${fmtDur(curDur)}</b></label>
      <label class="sl-fxrow">Apparition <select id="po-fxord" aria-label="Moment d’apparition">${ordOpts.map(([v, l]) => `<option value="${v}"${v === String(curOrd) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${multi ? `<label class="set-inline sl-fxseq"><input type="checkbox" id="po-fxseq"> Un par un (un clic par bloc, dans l’ordre)</label>` : ''}
      <div class="po-row sl-fxbtns"><button type="button" class="cta ghost small" id="po-fxprev">Aperçu</button><button type="button" class="cta ghost small danger" id="po-fxrm"${first ? '' : ' disabled'}>Retirer l’animation</button></div>
      <div class="po-hint">${multi ? 'Le même effet s’applique aux blocs sélectionnés ; « Un par un » les fait apparaître clic après clic.' : '« Au 2e clic » : le bloc apparaît au deuxième clic (ou flèche) pendant la présentation.'}${allText ? '' : ' « Machine à écrire » est réservée aux blocs de texte.'}</div>`,
      anchorRect(anchor), pop => {
        let hist = false;
        const mark = () => { if (!hist) { hist = true; if (A.pushHist) A.pushHist(); } };
        const grid = pop.querySelector('#po-fxgrid'), dur = pop.querySelector('#po-fxdur'), durv = pop.querySelector('#po-fxdurv'), ord = pop.querySelector('#po-fxord'), seq = pop.querySelector('#po-fxseq'), rm = pop.querySelector('#po-fxrm');
        const state = () => {
          const fx = (grid.querySelector('.sl-animtile.on') || {}).dataset?.fx || '';
          const d = normDur(dur.value);
          const o = ord.value === 'same' ? sameAsPrev : Math.max(0, Math.min(ORD_MAX, parseInt(ord.value, 10) || 0));
          return { fx, dur: d, ord: o, seq: !!(seq && seq.checked) };
        };
        const write = () => {
          const st = state(); if (!st.fx) return;
          mark();
          els.forEach((e, i) => { e.anim = { fx: st.fx, dur: st.dur, ord: st.seq ? Math.max(1, st.ord) + i : st.ord }; });
          refreshAfterWrite();
          rm.disabled = false;
        };
        grid.addEventListener('click', ev => {
          const b = ev.target.closest('.sl-animtile'); if (!b || b.disabled) return;
          grid.querySelectorAll('.sl-animtile').forEach(x => x.classList.toggle('on', x === b));
          write(); previewAnim(els.map(e => e.id));
        });
        /* la tuile rejoue son effet au survol */
        grid.addEventListener('mouseover', ev => {
          const b = ev.target.closest('.sl-animtile'); if (!b || b.disabled) return;
          const i = b.querySelector('i'); if (!i || i.classList.contains('anim-in')) return;
          i.classList.add('anim-in'); i.addEventListener('animationend', () => i.classList.remove('anim-in'), { once: true });
        });
        dur.addEventListener('input', () => { durv.textContent = fmtDur(dur.value); });
        dur.addEventListener('change', write);
        ord.addEventListener('change', write);
        if (seq) seq.addEventListener('change', write);
        pop.querySelector('#po-fxprev').addEventListener('click', () => { if (!state().fx) { grid.querySelector('.sl-animtile:not([disabled])').classList.add('on'); write(); } previewAnim(els.map(e => e.id)); });
        rm.addEventListener('click', () => { mark(); els.forEach(e => { delete e.anim; }); if (typeof hidePopover === 'function') hidePopover(); refreshAfterWrite(); });
      });
  }

  /* ---------------- pop-over « Transition » ---------------- */
  function transPopover(anchor) {
    const A = S(); const s = A.slide && A.slide(); if (!s || typeof showPopover !== 'function') return;
    if (A.isReadOnly && A.isReadOnly()) return;
    const cur = normTrans(s.trans) || { fx: 'none', dur: DUR_DEF };
    const tiles = TRANSITIONS.map(t => `<button type="button" class="sl-transtile${t.k === cur.fx ? ' on' : ''}" data-fx="${t.k}" title="${E(t.name)}"><i class="sl-tpv tp-${t.k}"><b></b><b></b></i><span>${E(t.name)}</span></button>`).join('');
    showPopover(`<h4>Transition vers cette diapositive</h4>
      <div class="sl-transgrid" id="po-trgrid">${tiles}</div>
      <label class="sl-fxrow">Durée <input type="range" id="po-trdur" min="${DUR_MIN}" max="${DUR_MAX}" step="0.1" value="${cur.dur}" aria-label="Durée de la transition"><b id="po-trdurv">${fmtDur(cur.dur)}</b></label>
      <div class="po-row sl-fxbtns"><button type="button" class="cta ghost small" id="po-trprev">Aperçu</button><button type="button" class="cta ghost small" id="po-trall">Appliquer à toutes les diapositives</button></div>
      <div class="po-hint">La transition se joue à l’arrivée sur la diapositive. Cube et Retournement deviennent un fondu sur petit écran ou si le système demande moins d’animations.</div>`,
      anchorRect(anchor), pop => {
        let hist = false;
        const mark = () => { if (!hist) { hist = true; if (A.pushHist) A.pushHist(); } };
        const grid = pop.querySelector('#po-trgrid'), dur = pop.querySelector('#po-trdur'), durv = pop.querySelector('#po-trdurv');
        const state = () => ({ fx: (grid.querySelector('.sl-transtile.on') || {}).dataset?.fx || 'none', dur: normDur(dur.value) });
        const write = all => {
          const t = state(); mark();
          const targets = all ? (A.slides ? A.slides() : [s]) : [s];
          targets.forEach(x => { if (t.fx === 'none') delete x.trans; else x.trans = { fx: t.fx, dur: t.dur }; });
          if (A.commit) A.commit(); if (A.renderBar) A.renderBar();
        };
        grid.addEventListener('click', ev => {
          const b = ev.target.closest('.sl-transtile'); if (!b) return;
          grid.querySelectorAll('.sl-transtile').forEach(x => x.classList.toggle('on', x === b));
          write(false); previewTrans();
        });
        dur.addEventListener('input', () => { durv.textContent = fmtDur(dur.value); });
        dur.addEventListener('change', () => write(false));
        pop.querySelector('#po-trprev').addEventListener('click', () => previewTrans());
        pop.querySelector('#po-trall').addEventListener('click', () => { write(true); if (typeof toast === 'function') toast('Transition appliquée à toutes les diapositives'); if (typeof hidePopover === 'function') hidePopover(); });
      });
  }

  return { ANIMS, TRANSITIONS, reduced, no3d, normAnim, normTrans, steps, maxStep, applyStep, resetSteps, transition, animPopover, transPopover, previewAnim, previewTrans, label, barLabel, transLabel, fmtDur };
})();
