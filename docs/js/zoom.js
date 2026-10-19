/* ============================================================
   Alixo — zoom des documents (1.34, zoom continu ancré sur le curseur en 1.38)
   Un facteur d'agrandissement par type de vue (séance, présentation, tableur), conservé sur l'appareil
   (localStorage alixo.zoom.<vue>) : Ctrl + molette au-dessus du document, Ctrl + / Ctrl − / Ctrl 0 au
   clavier, et un petit contrôle « − 100 % + » dans la barre d'outils de chaque vue.
   Chargé AVANT app.js : ne dépend d'aucune globale de l'application. Les vues s'y abonnent :
     AlixoZoom.get('doc')            → 1.25
     AlixoZoom.set('doc', 1.25)      → applique, enregistre, prévient les abonnés
     AlixoZoom.onChange('doc', cb)   → cb(z) à chaque changement
     AlixoZoom.controlHTML('doc')    → le contrôle de la barre (boutons [data-zoom] portant data-zkind)
     AlixoZoom.bindWheel(el, 'doc')  → Ctrl + molette sur l'élément (continu, ancré sous le curseur)
     AlixoZoom.handleKey(e, 'doc')   → Ctrl + / − / 0 (renvoie true si la touche a été consommée)
   ============================================================ */
'use strict';

window.AlixoZoom = (() => {
  const STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const MIN = STEPS[0], MAX = STEPS[STEPS.length - 1];
  const KEY = k => 'alixo.zoom.' + k;
  const subs = {};
  const cur = {};
  const clamp = z => Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100));

  function get(k) {
    if (cur[k] !== undefined) return cur[k];
    let z = 1;
    try { const v = parseFloat(localStorage.getItem(KEY(k))); if (isFinite(v) && v > 0) z = clamp(v); } catch { /* stockage indisponible */ }
    cur[k] = z;
    return z;
  }
  function set(k, z, { silent = false } = {}) {
    z = clamp(+z || 1);
    const was = get(k);
    cur[k] = z;
    try { if (z === 1) localStorage.removeItem(KEY(k)); else localStorage.setItem(KEY(k), String(z)); } catch { /* stockage indisponible */ }
    paint(k);
    if (!silent && z !== was) (subs[k] || []).forEach(cb => { try { cb(z); } catch (e) { console.error(e); } });
    return z;
  }
  function step(k, dir) {
    const z = get(k);
    if (dir > 0) { const n = STEPS.find(s => s > z + 0.001); return set(k, n === undefined ? MAX : n); }
    const lower = STEPS.filter(s => s < z - 0.001); return set(k, lower.length ? lower[lower.length - 1] : MIN);
  }
  const reset = k => set(k, 1);
  function onChange(k, cb) { (subs[k] || (subs[k] = [])).push(cb); }
  const pct = z => Math.round(z * 100) + ' %';

  /* contrôle de barre d'outils : « − 100 % + » ; un clic sur le pourcentage revient à 100 % */
  function controlHTML(k, extra = '') {
    const z = get(k);
    return `<span class="zoomctl ${extra}" data-zctl="${k}" title="Zoom du document : Ctrl + molette, Ctrl + / Ctrl −, Ctrl 0 pour revenir à 100 %">
      <button type="button" data-zoom="-" data-zkind="${k}" title="Réduire (Ctrl −)" aria-label="Réduire">−</button>
      <button type="button" class="zpct" data-zoom="0" data-zkind="${k}" title="Revenir à 100 % (Ctrl 0)">${pct(z)}</button>
      <button type="button" data-zoom="+" data-zkind="${k}" title="Agrandir (Ctrl +)" aria-label="Agrandir">+</button>
    </span>`;
  }
  function paint(k) {
    document.querySelectorAll(`[data-zctl="${k}"] .zpct`).forEach(b => { b.textContent = pct(get(k)); });
    document.querySelectorAll(`[data-zctl="${k}"]`).forEach(c => c.classList.toggle('off', get(k) !== 1));
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-zoom][data-zkind]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const k = b.dataset.zkind, a = b.dataset.zoom;
    if (a === '+') step(k, 1); else if (a === '-') step(k, -1); else reset(k);
  }, true);

  /* 1.38 : Ctrl + molette (ou pincement du pavé tactile) — zoom continu façon Word : chaque cran de molette agrandit
     d'environ 10 %, un pincement avance par petites touches, et le point du document qui se trouve sous le curseur
     reste sous le curseur (le défilement de `el` est corrigé dans le même rendu). Les événements d'une même image
     sont regroupés (un seul recalcul par image : pas de saccades). `opts.pad` : marges intérieures de `el`
     ({ left, top }) si elles ne se lisent pas dans le style ; `opts.anchor = false` : pas de correction du défilement. */
  function bindWheel(el, k, opts = {}) {
    if (!el) return;
    let pending = 0, raf = 0, at = null;
    const apply = () => {
      raf = 0;
      const was = get(k);
      const z = clamp(was * Math.exp(pending)); pending = 0;
      if (z === was) return;
      const a = at; at = null;
      if (!a || opts.anchor === false) { set(k, z); return; }
      /* ancrage : position du point sous le curseur dans le contenu, avant / après */
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const pad = { left: opts.pad && opts.pad.left != null ? opts.pad.left : parseFloat(cs.paddingLeft) || 0, top: opts.pad && opts.pad.top != null ? opts.pad.top : parseFloat(cs.paddingTop) || 0 };
      const mx = a.x - rect.left, my = a.y - rect.top;
      const cx = el.scrollLeft + mx - pad.left, cy = el.scrollTop + my - pad.top;   // point dans le contenu (échelle `was`)
      const ratio = z / was;
      const sb = el.style.scrollBehavior; el.style.scrollBehavior = 'auto';
      el.classList.add('no-anim');
      set(k, z);
      void el.offsetHeight;   // la vue a appliqué le zoom : on force la mise en page avant de corriger le défilement
      el.scrollLeft = Math.max(0, pad.left + cx * ratio - mx);
      el.scrollTop = Math.max(0, pad.top + cy * ratio - my);
      requestAnimationFrame(() => { el.classList.remove('no-anim'); el.style.scrollBehavior = sb; });
    };
    el.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 40; else if (e.deltaMode === 2) dy *= 400;   // lignes / pages → pixels
      // souris : un cran (≈ 100 px) ≈ 10 % ; pavé tactile (pincement) : petites valeurs → progression douce
      pending += -dy * 0.001;
      at = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: false });
  }
  /* Ctrl + / − / 0 — appelé par la vue active ; renvoie true si la touche a été consommée */
  function handleKey(e, k) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
    const key = e.key;
    if (key === '+' || key === '=' || (key === 'ArrowUp' && e.shiftKey)) { e.preventDefault(); step(k, 1); return true; }
    if (key === '-' || key === '_' || (key === 'ArrowDown' && e.shiftKey)) { e.preventDefault(); step(k, -1); return true; }
    if (key === '0' || key === 'à') {   // « à » : la touche 0 sans Maj sur un clavier AZERTY
      e.preventDefault(); reset(k); return true; }
    return false;
  }

  /* <span data-zoom-mount="doc"></span> dans le HTML → le contrôle */
  function mount(root) { (root || document).querySelectorAll('[data-zoom-mount]').forEach(el => { el.outerHTML = controlHTML(el.dataset.zoomMount); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount()); else mount();

  return { STEPS, MIN, MAX, get, set, step, reset, onChange, controlHTML, paint, bindWheel, handleKey, pct, mount };
})();
