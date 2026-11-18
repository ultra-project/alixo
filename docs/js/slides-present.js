/* ============================================================
   Alixo — présentations : mode présentation (js/slides-present.js) 1.54
   ------------------------------------------------------------
   Lot B : présentation simple — scène à deux « pins » (la diapositive affichée et la suivante, pour la transition),
   étapes d'animation (slides-fx.js), barre d'outils auto-masquée, minuteur, pointeur laser, écran noir / blanc, grille
   des diapositives, notes, aide, écran de fin.
   Lot E : vue présentateur (#sl-presenter : diapositive courante, suite, notes, chrono / horloge / rythme, vignettes),
   écran public (seconde fenêtre index.html?doc=<id>&present=1 reliée par BroadcastChannel, repli « storage »), spot sur
   un bloc, encre en direct (stylo, surligneur, gomme), répétition chronométrée (durée par diapositive, récapitulatif,
   cibles `s.target`).

   État P (un seul mode présentation à la fois) :
     on        : présentation active
     i, step   : diapositive affichée (index) et étape d'animation atteinte
     mode      : 'simple' | 'presenter' | 'audience'
     black     : null | 'b' | 'w'   (calque noir / blanc)
     laser     : pointeur laser actif
     spot      : id du bloc mis en avant ; spotArm : S enfoncé, en attente d'un clic sur un bloc
     tool      : null | 'pen' | 'hl' | 'eraser' ; ink : Map sid → traits [{ tool, c, w, pts: [x, y, …] }] (1280 × 720 logique, session)
     t0        : début du minuteur (ms) ; slideT0 : arrivée sur la diapositive courante
     rehearsal : répétition chronométrée ; reh : { times: { sid: ms } }
     audience  : un écran public est (probablement) ouvert ; win : sa fenêtre (version web)
     notes, grid, help : volets ouverts ; end : écran de fin affiché ; busy : transition en cours
     opts      : options reçues par start()

   Points d'extension (hooks.<nom> = fonction, ou null) — tous facultatifs, conservés pour les lots suivants :
     beforeStart(P, opts) → true, afterStart(P, ov), afterShow(P, pin, s), afterStep(P, pin), onKey(e, P) → true,
     onStageClick(e, P) → true, onTool(name, btn, P) → true, toolsHTML(P) → html, onState(P), onLaser(x, y, P),
     beforeClose(P), afterClose(P)
   Drapeaux `caps` : { presenter, ink, spot, rehearsal } — tous vrais depuis le lot E.

   Canal présentateur → public (BroadcastChannel 'alixo-present:<docId>', repli : clé localStorage 'alixo.present.<docId>' +
   événement « storage ») — messages : { t:'state', i, step, black, spot, end }, { t:'laser', on, x, y } (0-1, 30 ms),
   { t:'ink', sid, strokes }, { t:'video', cmd }, { t:'hold' } (battement 5 s), { t:'hello' } (public → présentateur),
   { t:'bye' }. Le récepteur valide types et bornes (validMsg) et ignore tout le reste.

   Chargé APRÈS js/slides.js et js/slides-fx.js : utilise AlixoSlides (slideHTML, doc, slides, setCur, renderAll, pushHist,
   commit, accent, I, SW, SH), AlixoSlidesFx (maxStep, applyStep, resetSteps, transition), AlixoSlidesMedia.mount / unmount
   si présents, et les globales d'app.js (esc, toast, openDialog, findDoc, isSlidesDoc, state, LS_KEY).
   ============================================================ */
'use strict';

window.AlixoSlidesPresent = (() => {
  const S = () => window.AlixoSlides || null;
  const FX = () => window.AlixoSlidesFx || null;
  const MEDIA = () => window.AlixoSlidesMedia || null;
  const $ = s => document.querySelector(s);
  const E = s => (typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
  const say = (m, o) => { if (typeof toast === 'function') toast(m, o); };
  const SW = () => (S() && S().SW) || 1280, SH = () => (S() && S().SH) || 720;
  const TOOLS_HIDE_MS = 2500;
  const ID_RE = /^[\w-]{1,64}$/;
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  const HL_COLOR = '#ffe100', PEN_FALLBACK = '#e63946';
  const NOTES_FS_LS = 'alixo.slides.prnotes.fs';
  const REH_LS = 'alixo.slides.rehearsal.';
  const PACE_TOL = 15;   // secondes de tolérance avant « en avance » / « en retard »
  const INK_MAX_SLIDES = 200;   // côté public : nombre de diapositives dont on garde l'encre reçue

  const P = { on: false, i: 0, step: 0, mode: 'simple', black: null, laser: false, spot: null, spotArm: false, tool: null, ink: new Map(), t0: 0, slideT0: 0, rehearsal: false, reh: null, channel: null, win: null, audience: false, notes: false, grid: false, help: false, end: false, busy: false, opts: {}, num: '' };
  const hooks = { beforeStart: null, afterStart: null, afterShow: null, afterStep: null, onKey: null, onStageClick: null, onTool: null, toolsHTML: null, onState: null, onLaser: null, beforeClose: null, afterClose: null };
  const caps = { presenter: true, ink: true, spot: true, rehearsal: true };
  const emit = (name, ...args) => { const f = hooks[name]; if (typeof f !== 'function') return undefined; try { return f(...args); } catch (err) { console.error('slides-present › hook ' + name, err); return undefined; } };
  const stateChanged = () => { emit('onState', P); if (P.on && P.mode !== 'audience') sendState(); if (P.mode === 'presenter') renderNext(); };

  /* icônes propres à la barre (les autres viennent d'AlixoSlides.I : laser, pen, timer, x) */
  const ICO = {
    hl: '<svg viewBox="0 0 24 24"><path d="m9 11 4 4M6 20h12M5 15l9-9 4 4-9 9H5Z"/></svg>',
    eraser: '<svg viewBox="0 0 24 24"><path d="M7 20h13M4.5 16.5 14 7l4 4-7.5 7.5a2 2 0 0 1-2.8 0l-3.2-3.2a2 2 0 0 1 0-2.8Z"/></svg>',
    spot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    black: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor"/></svg>',
    white: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    notes: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/></svg>',
    presenter: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="13" height="10" rx="1.5"/><rect x="17" y="8" width="5" height="12" rx="1"/><path d="M6 20h6"/></svg>',
    screen: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg>'
  };
  const I = () => (S() && S().I) || {};

  /* ---------------- accès ---------------- */
  const doc = () => (S() && S().doc ? S().doc() : null);
  const list = () => (S() && S().slides ? S().slides() : []);
  /* racine du mode en cours : la vue présentateur a sa propre enveloppe */
  const ov = () => $(P.mode === 'presenter' ? '#sl-presenter' : '#sl-present');
  const stage = () => ov() && ov().querySelector('.sl-pstage');
  const pins = () => (stage() ? Array.from(stage().querySelectorAll(':scope > .sl-pin')) : []);
  const pin = () => pins().find(p => !p.hidden) || pins()[0] || null;
  const otherPin = () => pins().find(p => p.hidden) || pins()[1] || null;
  const curSlide = () => list()[P.i] || null;
  const curSid = () => { const s = curSlide(); return s ? s.id : ''; };
  const q = sel => ov() && ov().querySelector(sel);

  /* ---------------- rendu ---------------- */
  /* bouton de barre : title = aria-label (le libellé visible peut être masqué sur petit écran) ; aria-keyshortcuts pour les touches simples */
  const KEYS = { laser: 'l', black: 'b', white: 'w', grid: 'g', notes: 'n', pen: 'p', hl: 'h', eraser: 'e', spot: 's' };
  const btn = (k, ico, label, key, extra) => { const t = `${label}${key ? ` (${key})` : ''}`; return `<button data-pa="${k}" title="${E(t)}" aria-label="${E(t)}"${KEYS[k] ? ` aria-keyshortcuts="${KEYS[k]}"` : ''}${extra || ''}>${ico}<span class="lbl">${E(label)}</span></button>`; };
  const coarse = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  function toolsHTML() {
    const n = list().length; const ic = I();
    return `<button data-pa="prev" class="sl-pnavbtn" title="Diapositive précédente (←)" aria-label="Diapositive précédente (←)">‹</button><span class="sl-pcount">${P.i + 1} / ${n}</span><button data-pa="next" class="sl-pnavbtn" title="Suivante (→, Espace)" aria-label="Suivante (→, Espace)">›</button>
      <span class="sl-psep"></span>
      <button data-pa="timer" class="sl-ptime" title="Chrono (T : remettre à zéro)" aria-label="Chrono (T : remettre à zéro)">${ic.timer || ''}<span class="sl-ptimev">00:00</span></button>
      <span class="sl-psep"></span>
      ${btn('laser', ic.laser || '', 'Laser', 'L')}${btn('pen', ic.pen || '', 'Stylo', 'P')}${btn('hl', ICO.hl, 'Surligneur', 'H')}${btn('eraser', ICO.eraser, 'Gomme', 'E · Maj+E : tout effacer')}${btn('spot', ICO.spot, 'Spot', 'S puis clic sur un bloc')}
      <span class="sl-psep"></span>
      ${btn('black', ICO.black, 'Noir', 'B')}${btn('white', ICO.white, 'Blanc', 'W')}
      <span class="sl-psep"></span>
      ${btn('grid', ICO.grid, 'Grille', 'G')}${btn('notes', ICO.notes, 'Notes', 'N')}
      ${btn('presenter', ICO.presenter, 'Présentateur', 'Alt+F5')}${emit('toolsHTML', P) || ''}
      <span class="sl-psep"></span>
      <button data-pa="help" title="Aide : raccourcis clavier (?)" aria-label="Aide : raccourcis clavier (?)">${ICO.help}</button><button data-pa="exit" title="Quitter (Échap)" aria-label="Quitter (Échap)">${ic.x || '×'}</button>`;
  }
  function helpHTML() {
    const row = (k, l) => `<tr><td>${k}</td><td>${l}</td></tr>`;
    const kb = (...ks) => ks.map(k => `<kbd>${k}</kbd>`).join(' ');
    const pr = P.mode === 'presenter';
    return `<h4>Raccourcis de la présentation<button type="button" data-pa="help" title="Fermer (Échap)">${I().x || '×'}</button></h4><table>
      ${row(kb('→', '↓', 'Espace', 'Entrée', 'Pg. suiv.'), 'Étape ou diapositive suivante')}
      ${row(kb('←', '↑', 'Retour', 'Pg. préc.'), 'Diapositive précédente')}
      ${row(kb('Début') + ' / ' + kb('Fin'), 'Première / dernière diapositive')}
      ${row(kb('1') + '…' + kb('9') + ' puis ' + kb('Entrée'), 'Aller à la diapositive n')}
      ${row(kb('B') + ' / ' + kb('W'), 'Écran noir / blanc (une touche ou un clic le retire)')}
      ${row(kb('L'), 'Pointeur laser')}
      ${row(kb('P') + ' ' + kb('H') + ' ' + kb('E'), 'Stylo, surligneur, gomme (un trait) · ' + kb('Maj+E') + ' tout effacer · ' + kb('Ctrl+Z') + ' annuler un trait')}
      ${row(kb('S') + ' puis clic', 'Spot : met un bloc en avant (second clic ou Échap pour sortir)')}
      ${pr ? row('Clic sur une vignette', 'Aller à cette diapositive') : row(kb('G'), 'Grille de toutes les diapositives')}
      ${pr ? '' : row(kb('N'), 'Notes de la diapositive')}
      ${row(kb('T'), 'Remettre le chrono à zéro')}
      ${row(kb('Alt+F5'), pr ? 'Revenir au mode simple' : 'Vue présentateur')}
      ${row(kb('?'), 'Cette aide')}
      ${row(kb('Échap'), 'Fermer le volet ou l’outil en cours, sinon quitter')}
      ${coarse() ? row('Tap au centre', 'Afficher ou masquer la barre') : ''}
    </table>`;
  }
  const stageHTML = audience => `<div class="sl-pstage"><div class="sl-pin" data-pin="0"></div><div class="sl-pin" data-pin="1" hidden></div><canvas class="sl-ink" width="${SW()}" height="${SH()}" aria-hidden="true"></canvas><div class="sl-pend" hidden>Fin de la présentation${audience ? '' : '<small>Échap pour quitter · ← pour revenir</small>'}</div></div>`;
  function renderShell() {
    const o = ov(); if (!o) return;
    const other = $(P.mode === 'presenter' ? '#sl-present' : '#sl-presenter'); if (other) { other.hidden = true; other.innerHTML = ''; }
    o.className = '';
    if (P.mode === 'presenter') {
      o.innerHTML = `<div class="sl-prcur">${stageHTML(false)}<div class="sl-pblack" hidden></div></div>
        <section class="sl-prnext" aria-label="Suite"><h5>Suite</h5><div class="sl-prnextpv"><div class="sl-pin"></div></div><p class="sl-prnextlbl"></p></section>
        <section class="sl-prnotes" aria-label="Notes"><h5>Notes<span class="sl-prnotesz"><button type="button" data-pa="fs-" title="Notes plus petites">A−</button><button type="button" data-pa="fs+" title="Notes plus grandes">A+</button></span></h5><div class="sl-prnotestxt"></div></section>
        <div class="sl-prgrid" role="list" aria-label="Toutes les diapositives"></div>
        <div class="sl-prbar" role="toolbar" aria-label="Commandes du présentateur">
          <div class="sl-prtime"><b class="sl-prclock" title="Heure">--:--</b><span class="sl-ptimev" title="Chrono (T : remettre à zéro)">00:00</span><span class="sl-prtarget"></span><span class="sl-prpace" hidden></span><span class="sl-preh" hidden></span></div>
          <div class="sl-prbtns">
            <button data-pa="prev" class="sl-pnavbtn" title="Diapositive précédente (←)" aria-label="Diapositive précédente (←)">‹</button><span class="sl-pcount">${P.i + 1} / ${list().length}</span><button data-pa="next" class="sl-pnavbtn" title="Suivante (→, Espace)" aria-label="Suivante (→, Espace)">›</button>
            <span class="sl-psep"></span>
            ${btn('black', ICO.black, 'Noir', 'B')}${btn('laser', I().laser || '', 'Laser', 'L')}${btn('pen', I().pen || '', 'Stylo', 'P')}${btn('hl', ICO.hl, 'Surligneur', 'H')}${btn('eraser', ICO.eraser, 'Gomme', 'E · Maj+E : tout effacer')}${btn('spot', ICO.spot, 'Spot', 'S puis clic sur un bloc')}
            <span class="sl-psep"></span>
            <button data-pa="audience" class="sl-praud" title="Affiche la présentation en plein écran sur l’autre écran" aria-label="Ouvrir sur le second écran">${ICO.screen}<span class="lbl">Ouvrir sur le second écran</span></button>
            <button data-pa="simple" title="Mode simple : la diapositive seule, plein écran (Alt+F5)" aria-label="Mode simple (Alt+F5)">${ICO.presenter}<span class="lbl">Mode simple</span></button>
            <button data-pa="help" title="Aide : raccourcis clavier (?)" aria-label="Aide : raccourcis clavier (?)">${ICO.help}</button>
            <button data-pa="exit" class="sl-prend" title="Terminer la présentation (Échap)" aria-label="Terminer la présentation (Échap)">${I().x || '×'}<span class="lbl">Fin</span></button>
          </div>
        </div>
        <div class="sl-plaser" hidden></div><div class="sl-phelp" hidden></div>`;
      applyNotesFs();
    } else {
      const audience = P.mode === 'audience';
      o.innerHTML = `${stageHTML(audience)}
        <div class="sl-pblack" hidden></div>
        <div class="sl-pgrid" hidden></div>
        <div class="sl-pnotes" hidden></div>
        <div class="sl-phelp" hidden></div>
        <div class="sl-plaser" hidden></div>
        <div class="sl-preh" hidden></div>
        <div class="sl-pwait" hidden></div>
        ${audience ? '' : `<div class="sl-ptools" role="toolbar" aria-label="Outils de présentation">${toolsHTML()}</div>`}`;
      if (audience) o.classList.add('audience');
    }
    o.hidden = false;
    paintRootClasses();
  }
  function paintRootClasses() {
    const o = ov(); if (!o) return;
    o.classList.toggle('inking', !!P.tool);
    ['pen', 'hl', 'eraser'].forEach(t => o.classList.toggle('tool-' + t, P.tool === t));
    o.classList.toggle('spot-arm', P.spotArm);
    o.classList.toggle('laser', P.laser);
  }
  function updateCount() {
    const o = ov(); if (!o) return;
    o.querySelectorAll('.sl-pcount').forEach(c => { c.innerHTML = P.num ? `<span class="sl-pnum">${E(P.num)}</span> / ${list().length}` : `${P.i + 1} / ${list().length}`; });
  }
  function paintTools() {
    const o = ov(); if (!o) return;
    updateCount();
    const on = (k, v) => { o.querySelectorAll(`[data-pa="${k}"]`).forEach(b => { b.classList.toggle('on', !!v); b.setAttribute('aria-pressed', v ? 'true' : 'false'); }); };
    on('laser', P.laser); on('black', P.black === 'b'); on('white', P.black === 'w'); on('grid', P.grid); on('notes', P.notes); on('help', P.help);
    on('pen', P.tool === 'pen'); on('hl', P.tool === 'hl'); on('eraser', P.tool === 'eraser'); on('spot', !!P.spot || P.spotArm);
    const a = o.querySelector('[data-pa="audience"]');
    if (a) { a.classList.toggle('on', P.audience); const l = a.querySelector('.lbl'); if (l) l.textContent = P.audience ? 'Fermer l’écran public' : 'Ouvrir sur le second écran'; a.title = P.audience ? 'Ferme la fenêtre affichée sur le second écran' : 'Affiche la présentation en plein écran sur l’autre écran'; a.setAttribute('aria-label', P.audience ? 'Fermer l’écran public' : 'Ouvrir sur le second écran'); }
    paintRootClasses();
  }
  /* échelle des pins, du calque d'encre, de l'aperçu « Suite » et des vignettes */
  function fit() {
    const st = stage(); if (!st) return;
    const r = st.getBoundingClientRect();
    const k = Math.min(r.width / SW(), r.height / SH());
    const tr = `translate(-50%, -50%) scale(${k})`;
    st.style.setProperty('--k', String(k));   // façade vidéo, bouton « Lancer le quiz » : slides-media compense l'échelle avec --k
    pins().forEach(p => { p.style.transform = tr; });
    const c = st.querySelector(':scope > .sl-ink'); if (c) c.style.transform = tr;
    const o = ov();
    const g = o.querySelector('.sl-pgrid');
    if (g && !g.hidden) g.querySelectorAll('.sl-pgthumb').forEach(t => t.style.setProperty('--k', String(t.clientWidth / SW())));
    if (P.mode === 'presenter') {
      o.querySelectorAll('.sl-prgrid .sl-pgthumb').forEach(t => t.style.setProperty('--k', String(t.clientWidth / SW())));
      const pv = o.querySelector('.sl-prnextpv'), pp = pv && pv.querySelector('.sl-pin');
      if (pp) { const rr = pv.getBoundingClientRect(); pp.style.transform = `translate(-50%, -50%) scale(${Math.max(0.02, Math.min(rr.width / SW(), rr.height / SH()))})`; }
    }
  }
  function fillPin(p, i, step) {
    const dd = doc(), s = list()[i]; if (!dd || !s || !p) return;
    p.innerHTML = S().slideHTML(s, dd, false, i, { mode: P.mode === 'presenter' ? 'presenter' : (P.mode === 'audience' ? 'audience' : 'present'), step: step || 0 });
    p.dataset.i = String(i);
  }
  function mount(p) { const m = MEDIA(); if (p && m && typeof m.mount === 'function') { try { m.mount(p); } catch (err) { console.error('slides-present › mount', err); } } }
  function unmount(p) { const m = MEDIA(); if (p && m && typeof m.unmount === 'function') { try { m.unmount(p); } catch (err) { console.error('slides-present › unmount', err); } } }

  /* affiche la diapositive i : step = 0 (début, blocs d'ordre 0 animés), n (étape atteinte) ou 'max' (tout visible, sans animation).
     dir : 'next' → transition de la diapositive d'arrivée ; 'prev' → transition de la diapositive quittée. */
  async function show(i, step, dir) {
    const dd = doc(); const L = list(); if (!dd || !L[i] || P.busy) return;
    const fx = FX();
    const old = pin(), fresh = otherPin() || old;
    const from = L[P.i];
    const first = !old || !old.innerHTML;
    P.busy = true;
    hideEnd();
    if (P.spot) clearSpotDom();
    if (P.reh && !first) rehTick();
    const target = step === 'max' ? (fx ? fx.maxStep(L[i]) : 0) : Math.max(0, +step || 0);
    fillPin(fresh, i, step === 'max' ? 9999 : target);
    fit();
    const trans = dir === 'prev' ? (from && from.trans) : L[i].trans;
    if (fx && !first) await fx.transition(stage(), old, fresh, trans, dir === 'prev' ? 'prev' : 'next');
    else { fresh.hidden = false; if (old && old !== fresh) old.hidden = true; }
    if (old && old !== fresh) { unmount(old); old.innerHTML = ''; }
    P.i = i; P.step = target; P.slideT0 = Date.now();
    if (fx) { if (step === 'max') fx.resetSteps(fresh); else fx.applyStep(fresh, target, true); }
    mount(fresh);
    P.busy = false;
    redrawInk();
    updateCount(); renderNotes();
    if (P.grid) renderGrid();
    if (P.mode === 'presenter') { renderPrGrid(); tick(); }
    emit('afterShow', P, fresh, L[i]); stateChanged();
    if (P.mode !== 'audience') sendInk();
  }
  /* étape suivante, sinon diapositive suivante, sinon écran de fin */
  async function next() {
    if (P.busy) return;
    if (P.end) { close(); return; }
    const s = curSlide(); const fx = FX();
    const max = s && fx ? fx.maxStep(s) : 0;
    if (P.step < max) { P.step++; fx.applyStep(pin(), P.step, true); emit('afterStep', P, pin()); stateChanged(); return; }
    if (P.i >= list().length - 1) { showEnd(); return; }
    await show(P.i + 1, 0, 'next');
  }
  async function prev() {
    if (P.busy) return;
    if (P.end) { hideEnd(); stateChanged(); return; }
    if (P.i <= 0) { if (P.step > 0 && FX()) { P.step = 0; FX().applyStep(pin(), 0, false); stateChanged(); } return; }
    await show(P.i - 1, 'max', 'prev');
  }
  function step(dir) { return dir < 0 ? prev() : next(); }
  function goto(i, st) {
    const n = list().length; if (!n) return Promise.resolve();
    const k = Math.max(0, Math.min(n - 1, +i || 0));
    if (P.end) hideEnd();
    if (k === P.i && !P.busy) {
      const fx = FX(); const before = P.step;
      P.step = st === 'max' && fx ? fx.maxStep(curSlide()) : Math.max(0, +st || 0);
      if (fx) { if (st === 'max') fx.resetSteps(pin()); else fx.applyStep(pin(), P.step, P.step === before + 1); }
      updateCount(); stateChanged(); return Promise.resolve();
    }
    return show(k, st === 'max' ? 'max' : (st || 0), k < P.i ? 'prev' : 'next');
  }
  function showEnd() { const e = q('.sl-pend'); if (!e) return; if (P.reh) rehTick(); P.end = true; e.hidden = false; stateChanged(); }
  function hideEnd() { const e = q('.sl-pend'); if (e) e.hidden = true; P.end = false; }

  /* ---------------- volets : notes, grille, aide ---------------- */
  const slideTitle = (s, i) => {
    const el = (s.els || []).find(e => ['title', 'subtitle', 'kicker', 'text'].includes(e.t) && e.html);
    const t = el ? String(el.html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '';
    return t ? (t.length > 48 ? t.slice(0, 47) + '…' : t) : `Diapositive ${i + 1}`;
  };
  function renderNotes() {
    const o = ov(); if (!o) return;
    const s = curSlide(); const txt = s && s.notes ? String(s.notes) : '';
    const n = o.querySelector('.sl-pnotes');
    if (n) { n.hidden = !P.notes; n.classList.toggle('empty', !txt); n.textContent = txt || 'Aucune note pour cette diapositive.'; }
    const pn = o.querySelector('.sl-prnotestxt');
    if (pn) { pn.classList.toggle('empty', !txt); pn.textContent = txt || 'Aucune note pour cette diapositive.'; }
  }
  function thumbsHTML(dd) { return list().map((s, i) => `<div class="sl-pgthumb${i === P.i ? ' cur' : ''}" data-i="${i}" role="button" tabindex="0" aria-label="Diapositive ${i + 1}" title="${E(slideTitle(s, i))}">${S().slideHTML(s, dd, false, i, { mode: 'thumb' })}<b>${i + 1}</b></div>`).join(''); }
  function renderGrid() {
    const g = q('.sl-pgrid'); const dd = doc(); if (!g || !dd) return;
    g.hidden = !P.grid; if (!P.grid) { g.innerHTML = ''; return; }
    g.innerHTML = thumbsHTML(dd);
    fit();
    const cur = g.querySelector('.sl-pgthumb.cur'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }
  function renderPrGrid() {
    const g = q('.sl-prgrid'); const dd = doc(); if (!g || !dd) return;
    if (!g.dataset.n || +g.dataset.n !== list().length) { g.innerHTML = thumbsHTML(dd); g.dataset.n = String(list().length); }
    g.querySelectorAll('.sl-pgthumb').forEach(t => t.classList.toggle('cur', +t.dataset.i === P.i));
    fit();
    const cur = g.querySelector('.sl-pgthumb.cur'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function toggleGrid(v) { if (P.mode === 'presenter') return; P.grid = v === undefined ? !P.grid : !!v; if (P.grid) { P.help = false; renderHelp(); } renderGrid(); paintTools(); }
  function toggleNotes(v) { if (P.mode === 'presenter') return; P.notes = v === undefined ? !P.notes : !!v; renderNotes(); paintTools(); }
  function renderHelp() { const h = q('.sl-phelp'); if (!h) return; h.hidden = !P.help; h.innerHTML = P.help ? helpHTML() : ''; }
  function toggleHelp(v) { P.help = v === undefined ? !P.help : !!v; renderHelp(); paintTools(); if (P.help) showTools(); }
  function setBlack(v) {
    const b = q('.sl-pblack'); if (!b) return;
    P.black = v || null; b.hidden = !P.black; b.classList.toggle('w', P.black === 'w');
    paintTools(); stateChanged();
  }
  function setLaser(v) {
    const o = ov(); if (!o) return;
    P.laser = v === undefined ? !P.laser : !!v;
    if (P.laser && P.tool) setTool(null, true);
    o.classList.toggle('laser', P.laser);
    const l = o.querySelector('.sl-plaser'); if (l) l.hidden = !P.laser;
    if (!P.laser) sendLaser(null);
    paintTools(); stateChanged();
  }

  /* ---------------- vue présentateur : suite, notes, horloge, rythme ---------------- */
  function renderNext() {
    const o = ov(); if (!o || P.mode !== 'presenter') return;
    const lbl = o.querySelector('.sl-prnextlbl'), pv = o.querySelector('.sl-prnextpv .sl-pin'); if (!lbl || !pv) return;
    const dd = doc(); const L = list(); const s = L[P.i]; const fx = FX(); if (!dd || !s) return;
    const max = fx ? fx.maxStep(s) : 0;
    let text = '', html = '';
    if (P.end) { text = 'Fin de la présentation'; html = ''; }
    else if (P.step < max) {
      const n = (s.els || []).filter(e => e.anim && fx && (fx.normAnim ? fx.normAnim(e.anim) : e.anim).ord === P.step + 1).length;
      text = n > 1 ? `Suite : ${n} blocs apparaissent` : 'Suite : 1 bloc apparaît';
      html = S().slideHTML(s, dd, false, P.i, { mode: 'presenter', step: P.step + 1 });
    } else if (P.i < L.length - 1) { text = `Diapositive ${P.i + 2} · ${slideTitle(L[P.i + 1], P.i + 1)}`; html = S().slideHTML(L[P.i + 1], dd, false, P.i + 1, { mode: 'presenter', step: 9999 }); }
    else { text = 'Fin'; html = ''; }
    lbl.textContent = text;
    if (pv.dataset.key !== text + '|' + P.i) { pv.innerHTML = html; pv.dataset.key = text + '|' + P.i; pv.classList.toggle('empty', !html); }
    fit();
  }
  function notesFs() { let v = 20; try { v = parseInt(localStorage.getItem(NOTES_FS_LS), 10) || 20; } catch { /* stockage indisponible */ } return Math.max(14, Math.min(40, v)); }
  function applyNotesFs() { const o = ov(); if (o) o.style.setProperty('--prfs', notesFs() + 'px'); }
  function bumpNotesFs(d) { const v = Math.max(14, Math.min(40, notesFs() + d)); try { localStorage.setItem(NOTES_FS_LS, String(v)); } catch { /* */ } applyNotesFs(); }
  /* rythme : cumul des cibles (s.target, secondes) des diapositives passées vs temps écoulé */
  function paceInfo() {
    const L = list(); const tg = L.map(s => Math.max(0, Math.round(+s.target || 0)));
    const total = tg.reduce((a, b) => a + b, 0); if (!total) return null;
    const before = tg.slice(0, P.i).reduce((a, b) => a + b, 0), through = before + tg[P.i];
    const el = (Date.now() - P.t0) / 1000;
    let st = 'ok', label = 'dans les temps';
    if (el < before - PACE_TOL) { st = 'ahead'; label = 'en avance'; } else if (el > through + PACE_TOL) { st = 'late'; label = 'en retard'; }
    return { total, el, st, label, left: total - el };
  }
  function paintPace() {
    const o = ov(); if (!o || P.mode !== 'presenter') return;
    const t = o.querySelector('.sl-prtarget'), p = o.querySelector('.sl-prpace'); if (!t || !p) return;
    const info = paceInfo();
    if (!info) { t.textContent = ''; p.hidden = true; return; }
    t.innerHTML = `Cible ${fmt(info.total * 1000)} · <b>${info.left >= 0 ? 'reste ' + fmt(info.left * 1000) : 'dépassée de ' + fmt(-info.left * 1000)}</b>`;
    p.hidden = false; p.textContent = info.label; p.className = 'sl-prpace ' + info.st;
  }

  /* ---------------- minuteur, horloge, barre auto-masquée ---------------- */
  let tickTm = 0, toolsTm = 0;
  const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; const p = n => String(n).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`; };
  function tick() {
    const o = ov(); if (!o) return;
    const el = fmt(Date.now() - P.t0);
    o.querySelectorAll('.sl-ptimev').forEach(v => { v.textContent = el; });
    const c = o.querySelector('.sl-prclock'); if (c) c.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    paintPace();
    const r = o.querySelector('.sl-preh');
    if (r) { r.hidden = !P.reh; if (P.reh) r.innerHTML = `<b>Répétition</b><span>diapositive ${P.i + 1} / ${list().length}</span><span class="sl-prehv">${fmt(Date.now() - P.slideT0)}</span>`; }
  }
  function resetTimer() { P.t0 = Date.now(); tick(); }
  function toggleTools() { const o = ov(); if (!o || P.mode !== 'simple') return; if (o.classList.contains('tools')) { clearTimeout(toolsTm); o.classList.remove('tools'); } else showTools(); }
  function showTools() {
    const o = ov(); if (!o || P.mode !== 'simple') return;
    o.classList.add('tools'); o.classList.remove('idle');
    clearTimeout(toolsTm);
    if (coarse()) return;                                                 // tactile : la barre reste tant qu'un tap au centre ne la masque pas
    toolsTm = setTimeout(() => { const oo = ov(); if (!oo || !P.on) return; if (oo.querySelector('.sl-ptools:hover') || P.help) return; oo.classList.remove('tools'); oo.classList.add('idle'); }, TOOLS_HIDE_MS);
  }

  /* ---------------- spot sur un bloc ---------------- */
  function clearSpotDom() {
    pins().forEach(p => { p.classList.remove('spot'); p.querySelectorAll('.sl-el.spot-on').forEach(el => { el.classList.remove('spot-on'); el.style.removeProperty('--spot'); }); p.querySelectorAll('.sl-spotveil').forEach(v => v.remove()); });
    P.spot = null;
  }
  /* k : le bloc tient dans 85 % de la scène (calcul sur ses % de largeur / hauteur), centré */
  function setSpot(id, silent) {
    clearSpotDom();
    const p = pin(); const s = curSlide();
    if (id && p && s) {
      const e = (s.els || []).find(x => x.id === id);
      const el = e && p.querySelector(`.sl-el[data-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
      if (el && !el.classList.contains('anim-wait')) {
        const w = Math.max(1, +e.w || 1), h = Math.max(1, +e.h || 1);
        const k = Math.max(1, Math.min(85 / w, 85 / h, 4));
        const dx = (50 - ((+e.x || 0) + w / 2)) / 100 * SW(), dy = (50 - ((+e.y || 0) + h / 2)) / 100 * SH();
        el.style.setProperty('--spot', `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${k.toFixed(3)})`);
        el.classList.add('spot-on'); p.classList.add('spot'); P.spot = id;
        /* voile sombre dans la diapositive (elle isole son empilement) : le bloc à 60 passe devant, le reste s'assombrit — lisible sur fond clair */
        const sl = el.closest('.sl-slide'); if (sl && !sl.querySelector(':scope > .sl-spotveil')) { const v = document.createElement('div'); v.className = 'sl-spotveil'; v.setAttribute('aria-hidden', 'true'); sl.appendChild(v); }
      }
    }
    P.spotArm = false;
    paintTools(); if (!silent) stateChanged();
  }
  function armSpot(v) {
    P.spotArm = v === undefined ? !P.spotArm : !!v;
    if (P.spotArm) { if (P.tool) setTool(null, true); if (P.laser) setLaser(false); say('Spot : cliquez sur un bloc de la diapositive pour le mettre en avant'); }
    paintTools();
  }

  /* ---------------- encre en direct ---------------- */
  const inkCanvas = () => { const st = stage(); return st ? st.querySelector(':scope > .sl-ink') : null; };
  const strokesOf = sid => { if (!P.ink.has(sid)) P.ink.set(sid, []); return P.ink.get(sid); };
  const penColor = () => { const A = S(); const c = A && A.accent ? A.accent(doc()) : ''; return HEX_RE.test(c || '') ? c : PEN_FALLBACK; };
  let draft = null, drawing = false, erased = false;
  function drawStroke(ctx, s) {
    const p = s.pts; if (!p || p.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w;
    if (s.tool === 'hl') { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .45; }
    ctx.beginPath();
    if (p.length === 2) { ctx.arc(p[0], p[1], s.w / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.stroke(); }
    ctx.restore();
  }
  function redrawInk() {
    const c = inkCanvas(); if (!c) return;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    for (const s of P.ink.get(curSid()) || []) drawStroke(ctx, s);
    if (draft) drawStroke(ctx, draft);
  }
  const inkPt = (c, e) => { const r = c.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * SW() * 10) / 10, Math.round((e.clientY - r.top) / r.height * SH() * 10) / 10]; };
  function eraseAt(x, y) {
    const L = strokesOf(curSid()); const r = 14;
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i], d = r + s.w / 2; const p = s.pts;
      for (let j = 0; j < p.length; j += 2) { if (Math.hypot(p[j] - x, p[j + 1] - y) <= d) { L.splice(i, 1); return true; } }
    }
    return false;
  }
  function setTool(t, silent) {
    if (t && !caps.ink) return;
    P.tool = (t && P.tool !== t) ? t : null;
    if (P.tool) { if (P.laser) setLaser(false); P.spotArm = false; }
    if (!P.tool && drawing) { drawing = false; draft = null; redrawInk(); }
    paintTools();
    if (!silent) showTools();
  }
  function undoInk() { const L = P.ink.get(curSid()); if (!L || !L.length) return false; L.pop(); redrawInk(); sendInk(); return true; }
  function clearInk() { const sid = curSid(); if (!(P.ink.get(sid) || []).length) return; P.ink.set(sid, []); redrawInk(); sendInk(); }
  function inkDown(e) {
    const c = e.target.closest && e.target.closest('.sl-ink'); if (!P.tool || !c || P.mode === 'audience') return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const [x, y] = inkPt(c, e);
    drawing = true;
    try { c.setPointerCapture(e.pointerId); } catch { /* */ }
    if (P.tool === 'eraser') { erased = eraseAt(x, y); redrawInk(); return; }
    draft = { tool: P.tool, c: P.tool === 'hl' ? HL_COLOR : penColor(), w: P.tool === 'hl' ? 24 : 4, pts: [x, y] };
    redrawInk();
  }
  function inkMove(e) {
    if (!drawing) return; const c = inkCanvas(); if (!c) return;
    const [x, y] = inkPt(c, e);
    if (P.tool === 'eraser') { if (eraseAt(x, y)) { erased = true; redrawInk(); } return; }
    if (!draft) return;
    const n = draft.pts.length;
    if (n >= 2 && Math.abs(draft.pts[n - 2] - x) < 1 && Math.abs(draft.pts[n - 1] - y) < 1) return;
    if (n < 4000) draft.pts.push(x, y);
    redrawInk();
  }
  function inkUp() {
    if (!drawing) return; drawing = false;
    if (draft) { strokesOf(curSid()).push(draft); draft = null; redrawInk(); sendInk(); }
    else if (erased) { erased = false; sendInk(); }
  }

  /* ---------------- canal présentateur ↔ public ---------------- */
  const MSG_T = ['state', 'laser', 'ink', 'video', 'hold', 'hello', 'bye'];
  const fin = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  function validStroke(s) {
    if (!s || typeof s !== 'object' || (s.tool !== 'pen' && s.tool !== 'hl')) return null;
    if (!fin(s.w, 1, 64) || !Array.isArray(s.pts) || s.pts.length < 2 || s.pts.length > 4000 || s.pts.length % 2) return null;
    for (const v of s.pts) if (!fin(v, -200, 1500)) return null;
    return { tool: s.tool, c: HEX_RE.test(String(s.c || '')) ? s.c : (s.tool === 'hl' ? HL_COLOR : PEN_FALLBACK), w: s.w, pts: s.pts.slice() };
  }
  /* valide un message reçu : renvoie une copie assainie, ou null (ignoré) */
  function validMsg(m) {
    if (!m || typeof m !== 'object' || typeof m.t !== 'string' || !MSG_T.includes(m.t)) return null;
    switch (m.t) {
      case 'state': {
        if (!fin(m.i, 0, 9999) || !Number.isInteger(m.i) || m.i >= list().length) return null;
        return { t: 'state', i: m.i, step: fin(m.step, 0, 9999) && Number.isInteger(m.step) ? m.step : 0, black: m.black === 'b' || m.black === 'w' ? m.black : null, spot: typeof m.spot === 'string' && ID_RE.test(m.spot) ? m.spot : null, end: m.end === true };
      }
      case 'laser':
        if (m.on === false) return { t: 'laser', on: false };
        if (!fin(m.x, 0, 1) || !fin(m.y, 0, 1)) return null;
        return { t: 'laser', on: true, x: m.x, y: m.y };
      case 'ink': {
        if (typeof m.sid !== 'string' || !ID_RE.test(m.sid) || !list().some(s => s.id === m.sid) || !Array.isArray(m.strokes) || m.strokes.length > 500) return null;
        const strokes = []; for (const s of m.strokes) { const v = validStroke(s); if (!v) return null; strokes.push(v); }
        return { t: 'ink', sid: m.sid, strokes };
      }
      case 'video': return ['play', 'pause', 'toggle'].includes(m.cmd) ? { t: 'video', cmd: m.cmd } : null;
      default: return { t: m.t };
    }
  }
  const chan = {
    id: '', bc: null, onMsg: null, seq: 0, storageFn: null,
    key() { return 'alixo.present.' + this.id; },
    open(docId, onMsg) {
      this.close(); this.id = docId; this.onMsg = onMsg;
      try { if ('BroadcastChannel' in window) { this.bc = new BroadcastChannel('alixo-present:' + docId); this.bc.onmessage = ev => this.recv(ev.data); } } catch { this.bc = null; }
      this.storageFn = e => { if (e.key !== this.key() || !e.newValue) return; let m; try { m = JSON.parse(e.newValue); } catch { return; } this.recv(m); };
      window.addEventListener('storage', this.storageFn);
      P.channel = this;
    },
    send(m) {
      if (!this.id) return;
      if (this.bc) { try { this.bc.postMessage(m); return; } catch { /* canal fermé : repli */ } }
      try { localStorage.setItem(this.key(), JSON.stringify(Object.assign({ _n: ++this.seq, _ts: Date.now() }, m))); } catch { /* stockage indisponible */ }
    },
    recv(m) { const v = validMsg(m); if (!v) return; if (typeof this.onMsg === 'function') { try { this.onMsg(v); } catch (err) { console.error('slides-present › message', err); } } },
    close() {
      if (this.bc) { try { this.bc.close(); } catch { /* */ } this.bc = null; }
      if (this.storageFn) { window.removeEventListener('storage', this.storageFn); this.storageFn = null; }
      if (this.id) { try { localStorage.removeItem(this.key()); } catch { /* */ } }
      this.id = ''; this.onMsg = null; P.channel = null;
    }
  };
  const chanOn = () => !!chan.id && P.on && P.mode !== 'audience';
  function sendState() { if (!chanOn()) return; chan.send({ t: 'state', i: P.i, step: P.step, black: P.black, spot: P.spot, end: P.end }); }
  function sendInk() { if (!chanOn()) return; const sid = curSid(); if (sid) chan.send({ t: 'ink', sid, strokes: P.ink.get(sid) || [] }); }
  let laserTm = 0, laserLast = 0;
  function sendLaser(x, y) {
    if (!chanOn()) return;
    if (x === null) { clearTimeout(laserTm); chan.send({ t: 'laser', on: false }); return; }
    if (x < 0 || x > 1 || y < 0 || y > 1) { if (laserLast !== -1) { laserLast = -1; chan.send({ t: 'laser', on: false }); } return; }
    const now = Date.now();
    if (now - laserLast >= 30) { laserLast = now; chan.send({ t: 'laser', on: true, x, y }); }
    else { clearTimeout(laserTm); laserTm = setTimeout(() => { laserLast = Date.now(); chan.send({ t: 'laser', on: true, x, y }); }, 30); }
  }
  function sendFull() { sendState(); sendInk(); if (!P.laser) sendLaser(null); }
  let hbTm = 0;
  function onPresenterMsg(v) {
    if (v.t === 'hello') { P.audience = true; paintTools(); sendFull(); }
    else if (v.t === 'bye') { P.audience = false; paintTools(); }
  }
  /* --- côté public --- */
  let waitTm = 0, pendingState = null;
  function showWait(text) { const w = q('.sl-pwait'); if (!w) return; w.hidden = !text; w.textContent = text || ''; }
  function armWait() { clearTimeout(waitTm); waitTm = setTimeout(() => { if (P.on && P.mode === 'audience') showWait('En attente du présentateur… Gardez cette fenêtre ouverte sur le second écran.'); }, 10000); }
  function applyRemoteState(v) {
    if (P.busy) { pendingState = v; return; }
    pendingState = null;
    const run = async () => {
      if (v.i !== P.i || v.step !== P.step) await goto(v.i, v.step);
      if (v.i !== P.i) return;
      if ((P.black || null) !== v.black) setBlack(v.black);
      if ((P.spot || null) !== v.spot) setSpot(v.spot, true);
      if (v.end && !P.end) showEnd(); else if (!v.end && P.end) hideEnd();
    };
    run().then(() => { if (pendingState) { const n = pendingState; pendingState = null; applyRemoteState(n); } });
  }
  function onAudienceMsg(v) {
    showWait(''); armWait();
    switch (v.t) {
      case 'state': applyRemoteState(v); break;
      case 'laser': {
        const o = ov(); const l = o && o.querySelector('.sl-plaser'); const st = stage(); if (!l || !st) break;
        if (!v.on) { l.hidden = true; break; }
        const r = st.getBoundingClientRect(); l.hidden = false; l.style.left = (r.left + v.x * r.width) + 'px'; l.style.top = (r.top + v.y * r.height) + 'px';
        break;
      }
      case 'ink': if (!P.ink.has(v.sid) && P.ink.size >= INK_MAX_SLIDES) break; P.ink.set(v.sid, v.strokes); if (v.sid === curSid()) redrawInk(); break;
      case 'video': { const vid = pin() && pin().querySelector('video'); if (!vid) break; try { if (v.cmd === 'play' || (v.cmd === 'toggle' && vid.paused)) vid.play().catch(() => {}); else vid.pause(); } catch { /* */ } break; }
      case 'bye': showWait('Le présentateur a terminé la présentation. Vous pouvez fermer cette fenêtre.'); clearTimeout(waitTm); break;
      default: break;   // hold, hello : seule la réception compte
    }
  }

  /* ---------------- écran public : ouverture / fermeture ---------------- */
  /* écrit l'état pour que la fenêtre public lise le document à jour ; une fenêtre auxiliaire (volet, solo, public) ne remplace que le document courant */
  function flushState() {
    try {
      if (typeof state === 'undefined' || typeof LS_KEY !== 'string' || !state) return;
      if (!window.ALIXO_AUX) { localStorage.setItem(LS_KEY, JSON.stringify(state)); return; }
      const dd = doc(); if (!dd) return;
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (!raw || !Array.isArray(raw.docs)) return;
      const k = raw.docs.findIndex(d => d && d.id === dd.id); if (k < 0) return;
      raw.docs[k] = dd; localStorage.setItem(LS_KEY, JSON.stringify(raw));
    } catch { /* stockage indisponible */ }
  }
  function audienceUrl(id) { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('doc', id); u.searchParams.set('present', '1'); u.searchParams.set('desktop', '1'); return u.toString(); }
  async function openAudience() {
    const dd = doc(); if (!dd || !P.on || P.mode === 'audience') return false;
    if (!ID_RE.test(String(dd.id || ''))) { say('Impossible d’ouvrir l’écran public pour ce document.'); return false; }
    flushState();
    if (window.alixoDesktop && typeof alixoDesktop.openPresentWindow === 'function') {
      let r; try { r = await alixoDesktop.openPresentWindow(dd.id); } catch { r = { ok: false, reason: 'error' }; }
      if (r && r.ok) { P.audience = true; paintTools(); sendFull(); return true; }
      const reason = r && r.reason;
      if (reason === 'one-display') say('Un seul écran détecté : branchez le second écran, ou présentez en mode simple.', { duration: 6000 });
      else { if (reason) console.warn('slides-present › écran public :', reason); say('Impossible d’ouvrir l’écran public. La présentation continue dans cette fenêtre.', { duration: 6000 }); }
      return false;
    }
    let w = null;
    try { w = window.open(audienceUrl(dd.id), 'alixo-present-' + dd.id); } catch { w = null; }
    if (!w) { say('Le navigateur a bloqué la fenêtre de l’écran public : autorisez les fenêtres surgissantes pour Alixo, puis réessayez.', { duration: 7000 }); return false; }
    try { w.opener = null; } catch { /* navigateur strict */ }
    P.win = w; P.audience = true; paintTools();
    return true;
  }
  function closeAudience(silent) {
    if (chanOn()) chan.send({ t: 'bye' });
    if (window.alixoDesktop && typeof alixoDesktop.closePresentWindow === 'function') { try { alixoDesktop.closePresentWindow(); } catch { /* */ } }
    if (P.win) { try { if (!P.win.closed) P.win.close(); } catch { /* */ } P.win = null; }
    P.audience = false; paintTools();
    if (!silent) say('Écran public fermé');
  }
  /* démarrage de la fenêtre public (index.html?doc=<id>&present=1) — appelé par app.js après le chargement de l'état */
  function audienceBoot(docId) {
    document.body.classList.add('present-window');
    const A = S(); const id = String(docId || '');
    const d = id && ID_RE.test(id) && typeof findDoc === 'function' ? findDoc(id) : null;
    const isSlides = d && (typeof isSlidesDoc === 'function' ? isSlidesDoc(d) : d.kind === 'slides');
    const o = $('#sl-present');
    if (!A || !d || !isSlides) {
      if (o) { o.hidden = false; o.className = 'audience'; o.innerHTML = '<div class="sl-pwait">Ouvrez la présentation depuis la fenêtre principale.</div>'; }
      return Promise.resolve(false);
    }
    return Promise.resolve(A.open(id)).then(() => start(0, { mode: 'audience' })).catch(err => { console.error('slides-present › audienceBoot', err); if (o) { o.hidden = false; o.innerHTML = '<div class="sl-pwait">Ouvrez la présentation depuis la fenêtre principale.</div>'; } return false; });
  }

  /* ---------------- répétition chronométrée ---------------- */
  function rehTick() { if (!P.reh) return; const sid = curSid(); if (sid) P.reh.times[sid] = (P.reh.times[sid] || 0) + (Date.now() - P.slideT0); P.slideT0 = Date.now(); }
  function saveRehearsal(dd, times) {
    const out = {}; for (const [sid, ms] of Object.entries(times)) out[sid] = Math.round(ms / 1000);
    try { localStorage.setItem(REH_LS + dd.id, JSON.stringify({ at: Date.now(), times: out })); } catch { /* stockage indisponible */ }
  }
  function rehearsalSummary(dd, times) {
    const A = S(); if (!A || typeof openDialog !== 'function' || !dd) return;
    const L = Array.isArray(dd.slides) ? dd.slides : [];
    let total = 0, totalTg = 0;
    const rows = L.map((s, i) => {
      const t = Math.round((times[s.id] || 0) / 1000); const tg = Math.max(0, Math.round(+s.target || 0)); total += t; totalTg += tg;
      const diff = tg ? t - tg : null;
      return `<tr><td>${i + 1}. ${E(slideTitle(s, i))}</td><td>${fmt(t * 1000)}</td><td>${tg ? fmt(tg * 1000) : '—'}</td><td class="${diff === null ? '' : diff > 0 ? 'over' : 'under'}">${diff === null ? '' : (diff > 0 ? '+' : '−') + fmt(Math.abs(diff) * 1000)}</td></tr>`;
    }).join('');
    const ro = A.isReadOnly && A.isReadOnly();
    openDialog({
      id: 'sl-rehearsal', cls: 'sl-rhdlg', eyebrow: 'Répétition chronométrée', title: 'Récapitulatif',
      sub: `Durée totale : ${fmt(total * 1000)}${totalTg ? ` · cible : ${fmt(totalTg * 1000)}` : ''}`,
      body: `<table class="sl-rhtable"><thead><tr><th>Diapositive</th><th>Durée</th><th>Cible</th><th>Écart</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total</td><td>${fmt(total * 1000)}</td><td>${totalTg ? fmt(totalTg * 1000) : '—'}</td><td class="${totalTg ? (total > totalTg ? 'over' : 'under') : ''}">${totalTg ? (total > totalTg ? '+' : '−') + fmt(Math.abs(total - totalTg) * 1000) : ''}</td></tr></tfoot></table>
        <p class="sl-rhhint">Les cibles servent à la barre de rythme de la vue présentateur (en avance · dans les temps · en retard). Vous pouvez aussi les saisir diapositive par diapositive dans le volet Notes (« Durée visée »).</p>`,
      foot: `<button class="cta ghost" type="button" data-dlg-close>Fermer</button>${ro ? '' : '<button class="cta" type="button" id="sl-rhapply">Définir ces durées comme cibles</button>'}`,
      onMount(card, closeDlg) {
        const b = card.querySelector('#sl-rhapply'); if (!b) return;
        b.addEventListener('click', () => {
          if (A.pushHist) A.pushHist();
          L.forEach(s => { const t = Math.round((times[s.id] || 0) / 1000); if (t > 0) s.target = Math.min(3600, t); else delete s.target; });
          if (A.commit) A.commit(); if (A.renderAll && document.body.classList.contains('mode-slides')) A.renderAll();
          say('Durées enregistrées comme cibles');
          closeDlg();
        });
      }
    });
  }

  /* ---------------- clavier ---------------- */
  const NEXT_KEYS = ['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown'], PREV_KEYS = ['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp'];
  let numTm = 0;
  function key(e) {
    if (!P.on || P.mode === 'audience') return;
    const k = e.key, low = k.length === 1 ? k.toLowerCase() : k;
    if (e.altKey && k === 'F5') { e.preventDefault(); if (P.mode === 'presenter') switchTo('simple'); else if (P.mode === 'simple' && caps.presenter) switchTo('presenter'); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && low === 'z') { if (undoInk()) e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;                      // raccourcis de l'application : on ne touche à rien
    const t = e.target;
    const onVideo = t && t.tagName === 'VIDEO';
    if (onVideo && (e.key === ' ' || e.key === 'k')) return;             // Espace sur une vidéo focalisée : lecture / pause natives
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (emit('onKey', e, P) === true) return;
    /* un calque noir / blanc : n'importe quelle touche le retire */
    if (P.black) { e.preventDefault(); setBlack(null); return; }
    if (k === 'Escape') {
      e.preventDefault();
      if (P.help) { toggleHelp(false); return; }
      if (P.grid) { toggleGrid(false); return; }
      if (P.spot) { setSpot(null); return; }
      if (P.spotArm) { armSpot(false); return; }
      if (P.tool) { setTool(null); return; }
      if (P.laser) { setLaser(false); return; }
      close(); return;
    }
    if (k === '?' || (e.shiftKey && k === '/')) { e.preventDefault(); toggleHelp(); return; }
    /* chiffres + Entrée → diapositive n */
    if (/^[0-9]$/.test(k)) { e.preventDefault(); P.num = (P.num + k).slice(0, 3); updateCount(); clearTimeout(numTm); numTm = setTimeout(() => { P.num = ''; updateCount(); }, 2500); return; }
    if (k === 'Enter' && P.num) { e.preventDefault(); const n = parseInt(P.num, 10); P.num = ''; clearTimeout(numTm); if (n >= 1) { if (P.grid) toggleGrid(false); goto(n - 1, 0); } else updateCount(); return; }
    if (P.grid && NEXT_KEYS.concat(PREV_KEYS).includes(k)) {           // dans la grille, les flèches déplacent le repère ; Entrée saute
      e.preventDefault();
      const n = list().length; const d = PREV_KEYS.includes(k) ? -1 : 1;
      const g = q('.sl-pgrid'); const cur = g.querySelector('.sl-pgthumb.cur'); let i = cur ? +cur.dataset.i : P.i;
      if (k === 'Enter' || k === ' ') { toggleGrid(false); goto(i, 0); return; }
      i = Math.max(0, Math.min(n - 1, i + d)); g.querySelectorAll('.sl-pgthumb').forEach(x => x.classList.toggle('cur', +x.dataset.i === i)); return;
    }
    if (NEXT_KEYS.includes(k)) { e.preventDefault(); next(); return; }
    if (PREV_KEYS.includes(k)) { e.preventDefault(); prev(); return; }
    if (k === 'Home') { e.preventDefault(); goto(0, 0); return; }
    if (k === 'End') { e.preventDefault(); goto(list().length - 1, 'max'); return; }
    if (low === 'b') { e.preventDefault(); setBlack('b'); return; }
    if (low === 'w') { e.preventDefault(); setBlack('w'); return; }
    if (low === 'l') { e.preventDefault(); setLaser(); return; }
    if (low === 'g') { e.preventDefault(); toggleGrid(); return; }
    if (low === 'n') { e.preventDefault(); toggleNotes(); return; }
    if (low === 't') { e.preventDefault(); resetTimer(); showTools(); return; }
    if (low === 'p') { e.preventDefault(); setTool('pen'); return; }
    if (low === 'h') { e.preventDefault(); setTool('hl'); return; }
    if (low === 'e') { e.preventDefault(); if (e.shiftKey) { clearInk(); if (P.tool === 'eraser') setTool(null); } else setTool('eraser'); return; }
    if (low === 's') { e.preventDefault(); if (P.spot) setSpot(null); else armSpot(); return; }
  }

  /* ---------------- souris / tactile ---------------- */
  const bound = new WeakSet();
  function bindShell() {
    const o = ov(); if (!o || bound.has(o)) return; bound.add(o);
    o.addEventListener('click', e => {
      if (!P.on || ov() !== o) return;
      const b = e.target.closest('[data-pa]');
      if (b) { e.stopPropagation(); onTool(b.dataset.pa, b); return; }
      if (e.target.closest('.sl-pblack')) { setBlack(null); return; }
      if (e.target.closest('.sl-pend')) { if (P.mode !== 'audience') close(); return; }
      const th = e.target.closest('.sl-pgthumb'); if (th) { toggleGrid(false); goto(+th.dataset.i, 0); return; }
      if (e.target.closest('.sl-pgrid, .sl-pnotes, .sl-phelp, .sl-ptools, .sl-prbar, .sl-prnotes, .sl-prnext, .sl-prgrid, .sl-pwait')) return;
      if (!e.target.closest('.sl-pstage') || P.mode === 'audience') return;
      if (emit('onStageClick', e, P) === true) return;
      /* spot : second clic → sortie ; S armé → le bloc cliqué est mis en avant */
      if (P.spot) { setSpot(null); return; }
      if (P.spotArm) { const el = e.target.closest('.sl-el'); if (el && el.dataset.id) setSpot(el.dataset.id); else armSpot(false); return; }
      if (P.tool) return;                                                // un outil d'encre : le clic dessine, il ne navigue pas
      /* les médias et le bouton « Lancer le quiz » gardent leur clic */
      if (e.target.closest('.t-video, .sl-quizgo, video, iframe, a[href], button, input, select, textarea')) return;
      const r = (stage() || o).getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (P.mode === 'simple' && coarse() && x >= 1 / 3 && x <= 2 / 3) { toggleTools(); return; }   // tactile : tap au centre = barre
      if (x < 1 / 3) prev(); else next();
    });
    o.addEventListener('keydown', e => { if (e.target.closest && e.target.closest('.sl-pgthumb') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); toggleGrid(false); goto(+e.target.closest('.sl-pgthumb').dataset.i, 0); } });
    o.addEventListener('pointerdown', inkDown);
    o.addEventListener('pointermove', e => {
      if (!P.on || ov() !== o) return;
      if (drawing) { inkMove(e); return; }
      if (e.pointerType !== 'touch') showTools();
      if (P.laser) {
        const l = o.querySelector('.sl-plaser'); if (l) { l.style.left = e.clientX + 'px'; l.style.top = e.clientY + 'px'; }
        const st = stage(); if (st) { const r = st.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; emit('onLaser', x, y, P); sendLaser(x, y); }
      }
    });
    o.addEventListener('pointerup', inkUp); o.addEventListener('pointercancel', inkUp);
    o.addEventListener('contextmenu', e => { if (P.on && !e.target.closest('video, iframe, a[href]')) e.preventDefault(); });
  }
  function onTool(k, b) {
    if (b && b.disabled) return;
    switch (k) {
      case 'prev': prev(); break;
      case 'next': next(); break;
      case 'exit': close(); break;
      case 'timer': resetTimer(); break;
      case 'laser': setLaser(); break;
      case 'black': setBlack(P.black === 'b' ? null : 'b'); break;
      case 'white': setBlack(P.black === 'w' ? null : 'w'); break;
      case 'grid': toggleGrid(); break;
      case 'notes': toggleNotes(); break;
      case 'help': toggleHelp(); break;
      case 'pen': case 'hl': case 'eraser': setTool(k); break;
      case 'spot': if (P.spot) setSpot(null); else armSpot(); break;
      case 'presenter': if (P.mode === 'simple') switchTo('presenter'); break;
      case 'simple': if (P.mode === 'presenter') switchTo('simple'); break;
      case 'audience': if (P.audience) closeAudience(); else openAudience(); break;
      case 'fs-': bumpNotesFs(-2); break;
      case 'fs+': bumpNotesFs(2); break;
      default: emit('onTool', k, b, P);
    }
    showTools();
  }
  const onResize = () => { if (P.on) fit(); };
  const onUnload = () => { if (chanOn()) chan.send({ t: 'bye' }); try { if (chan.id) localStorage.removeItem(chan.key()); } catch { /* */ } };

  /* ---------------- cycle de vie ---------------- */
  /* passe du mode simple à la vue présentateur sans perdre le minuteur, l'encre ni l'écran public */
  function switchTo(mode) {
    if (!P.on) return;
    const i = P.i, st = P.step, t0 = P.t0, reh = P.reh, aud = P.audience, win = P.win;
    close({ switching: true });
    start(i, { presenter: mode === 'presenter', rehearsal: !!reh, keepT0: t0, keepInk: true, step: st, reh, audience: aud, win });
  }
  function start(from, opts) {
    const A = S(); const dd = doc(); if (!A || !dd || !list().length) return false;
    if (P.on) close({ switching: true });
    const o = Object.assign({}, opts || {});
    if (o.presenter && !caps.presenter) o.presenter = false;
    if (o.rehearsal && !caps.rehearsal) o.rehearsal = false;
    const i = typeof from === 'number' ? Math.max(0, Math.min(list().length - 1, Math.floor(from))) : Math.max(0, list().findIndex(s => s.id === A.cur()));
    const mode = o.mode === 'audience' ? 'audience' : (o.presenter ? 'presenter' : 'simple');
    Object.assign(P, { on: true, i, step: 0, mode, black: null, laser: false, spot: null, spotArm: false, tool: null, t0: o.keepT0 || Date.now(), slideT0: Date.now(), rehearsal: !!o.rehearsal, reh: o.rehearsal ? (o.reh || { times: {} }) : null, audience: !!o.audience, win: o.win || null, notes: false, grid: false, help: false, end: false, busy: false, opts: o, num: '' });
    if (!o.keepInk) P.ink.clear();
    draft = null; drawing = false; pendingState = null;
    if (emit('beforeStart', P, o) === true) return true;
    if (mode !== 'audience') { if (A.syncAllText) A.syncAllText(); if (A.stopEdit) A.stopEdit(); }
    renderShell(); bindShell();
    window.addEventListener('resize', onResize);
    window.addEventListener('beforeunload', onUnload);
    clearInterval(tickTm); tickTm = setInterval(tick, 1000); tick();
    if (!(mode === 'audience' && window.alixoDesktop)) {   // la fenêtre public Electron est déjà en plein écran
      try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* plein écran refusé */ }
    }
    try { localStorage.removeItem('alixo.present.' + dd.id); } catch { /* stockage indisponible */ }   // message de repli d'une session précédente
    if (mode === 'audience') { chan.open(dd.id, onAudienceMsg); }
    else { chan.open(dd.id, onPresenterMsg); clearInterval(hbTm); hbTm = setInterval(() => { if (chanOn()) chan.send({ t: 'hold' }); }, 5000); }
    fit();
    show(i, o.step || 0, 'next').then(() => {
      showTools();
      if (mode === 'audience') { chan.send({ t: 'hello' }); armWait(); }
      else sendFull();
      if (mode === 'presenter') { renderPrGrid(); renderNext(); }
      emit('afterStart', P, ov());
    });
    return true;
  }
  function close(internal) {
    if (!P.on) return;
    emit('beforeClose', P);
    const switching = !!(internal && internal.switching);
    const dd = doc();
    if (P.reh && !switching && !P.end) rehTick();
    const rehData = P.reh && !switching ? P.reh.times : null;
    if (!switching && P.mode !== 'audience' && (P.audience || P.win)) closeAudience(true);
    else if (!switching && chanOn()) chan.send({ t: 'bye' });
    chan.close(); clearInterval(hbTm); hbTm = 0; clearTimeout(waitTm); clearTimeout(laserTm);
    P.on = false;
    clearInterval(tickTm); tickTm = 0; clearTimeout(toolsTm); clearTimeout(numTm);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('beforeunload', onUnload);
    pins().forEach(unmount);
    ['#sl-present', '#sl-presenter'].forEach(sel => { const o = $(sel); if (o) { o.hidden = true; o.innerHTML = ''; o.className = ''; o.style.removeProperty('--prfs'); } });
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* ignoré */ }
    const A = S(); const s = list()[P.i];
    if (A && s && A.setCur) A.setCur(s.id);
    if (A && document.body.classList.contains('mode-slides') && A.renderAll && !switching) A.renderAll();
    P.black = null; P.laser = false; P.end = false; P.grid = false; P.notes = false; P.help = false; P.busy = false; P.num = ''; P.spot = null; P.spotArm = false; P.tool = null;
    if (!switching) { P.reh = null; P.rehearsal = false; P.audience = false; P.win = null; }
    draft = null; drawing = false;
    emit('afterClose', P);
    if (rehData && dd) { saveRehearsal(dd, rehData); rehearsalSummary(dd, rehData); }
  }

  return {
    P, hooks, caps,
    get presenterReady() { return !!caps.presenter; },
    start, close, active: () => P.on, key, goto, step, next, prev, index: () => P.i, currentStep: () => P.step,
    fit, setBlack, setLaser, toggleGrid, toggleNotes, toggleHelp, resetTimer, showTools, toggleTools, paintTools, pin, stage,
    setSpot, armSpot, setTool, undoInk, clearInk, openAudience, closeAudience, audienceBoot, switchTo,
    validMsg, fmtTime: fmt,
    _ink: () => P.ink, _chan: () => chan
  };
})();
