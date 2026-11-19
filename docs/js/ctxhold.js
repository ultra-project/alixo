/* 1.55 : ctxhold — élément « tenu » pendant le menu contextuel.
   Un clic droit sur une séance, un dossier, un fichier… (bibliothèque, arbre, barre latérale, partagés) laisse l'élément
   visé avec son apparence survolée (classe .ctx-held, styles dans modals.css) tant que le menu #ctxmenu est ouvert, puis
   tant que l'action lancée depuis ce menu est en cours (renommage en ligne, pop-over, fenêtre de dialogue…).
   L'élément est retrouvé par une clé (conteneur + attribut data-*) : si la liste est re-rendue, la classe est reposée sur
   le nouvel élément. Dès que plus rien n'est ouvert, la classe est retirée (pas de sélection fantôme).
   Module autonome : il n'appelle rien dans app.js et n'en modifie rien. */
(() => {
  'use strict';
  const CLS = 'ctx-held';
  /* conteneurs surveillés */
  const SCOPES = ['#doc-grid', '#lib-tree', '#folder-tree', '#lib-shared'];
  /* éléments qui ont un style de survol propre (c'est lui qui reçoit .ctx-held) */
  const ITEMS = [
    '.lib-row', '.doc-card', '.folder-card', '.file-card', '.rs-card', '.rs-live', '.tn-card', '.sh-card',
    '#folder-tree .tree-row', '.sh-tree [data-shfile]', '.sh-tree [data-shdoc]'
  ].join(', ');
  /* attributs qui identifient l'élément (par ordre de préférence) */
  const KEYS = ['data-id', 'data-fid', 'data-tfid', 'data-tdoc', 'data-doc', 'data-open', 'data-file', 'data-shfile',
    'data-shdoc', 'data-rsdoc', 'data-rsfid', 'data-shrow'];
  const KEY_SEL = KEYS.map(k => `[${k}]`).join(', ');
  /* ce qui compte comme « une action en cours » */
  const BUSY = ['#ctxmenu', '#popover', '.inline-rename', '.dlgov', '#fileov', '#wkov', '#wnov', '#setov', '#pfov'];

  let held = null;      // { scope, attr, val }
  let heldEl = null;
  let timer = 0, idle = 0, obs = null;

  const visible = el => {
    if (!el || el.hidden || !el.isConnected) return false;
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };

  function keyOf(el) {
    for (const k of KEYS) if (el.hasAttribute(k)) return { attr: k, val: el.getAttribute(k) };
    const inner = el.querySelector(KEY_SEL);
    if (!inner) return null;
    for (const k of KEYS) if (inner.hasAttribute(k)) return { attr: k, val: inner.getAttribute(k) };
    return null;
  }

  function findHeld() {
    if (!held) return null;
    const root = document.querySelector(held.scope); if (!root) return null;
    let at;
    try { at = root.querySelector(`[${held.attr}="${CSS.escape(held.val)}"]`); } catch { return null; }
    if (!at) return null;
    return at.closest(ITEMS) || null;
  }

  function apply() {
    const el = findHeld();
    if (el === heldEl) { if (el && !el.classList.contains(CLS)) el.classList.add(CLS); return; }
    if (heldEl) heldEl.classList.remove(CLS);
    heldEl = el;
    if (el) el.classList.add(CLS);
  }

  function busy() {
    for (const s of BUSY) for (const el of document.querySelectorAll(s)) if (visible(el)) return true;
    /* renommage en ligne : un champ éditable a le focus dans l'un des conteneurs */
    const a = document.activeElement;
    if (a && a !== document.body && (a.matches('input, textarea, [contenteditable=""], [contenteditable="true"]')) && SCOPES.some(s => a.closest(s))) return true;
    return false;
  }

  function release() {
    clearInterval(timer); timer = 0; idle = 0;
    if (obs) { obs.disconnect(); obs = null; }
    if (heldEl) heldEl.classList.remove(CLS);
    /* filet de sécurité : aucune classe orpheline */
    document.querySelectorAll('.' + CLS).forEach(el => el.classList.remove(CLS));
    held = null; heldEl = null;
  }

  /* vérification périodique tant qu'un élément est tenu : deux constats « rien d'ouvert » d'affilée → on relâche
     (laisse le temps à une action de passer du menu à son pop-over ou à sa fenêtre) */
  function tick() {
    if (!held) return release();
    if (busy()) { idle = 0; apply(); return; }
    if (++idle >= 2) release();
  }

  function hold(scope, key) {
    release();
    held = { scope, attr: key.attr, val: key.val };
    apply();
    if (!heldEl) { held = null; return; }
    obs = new MutationObserver(() => { if (held) apply(); });
    const root = document.querySelector(scope);
    if (root) obs.observe(root, { childList: true, subtree: true });
    timer = setInterval(tick, 160);
  }

  document.addEventListener('contextmenu', e => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const scope = SCOPES.find(s => t.closest(s));
    if (!scope) { if (held) release(); return; }
    const el = t.closest(ITEMS);
    const key = el && keyOf(el);
    if (!key) { release(); return; }   // clic droit sur le fond : rien à tenir
    hold(scope, key);
  }, true);

  /* Échap ferme tout : on vérifie aussitôt après */
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && held) setTimeout(tick, 0); }, true);

  window.AlixoCtxHold = { release };
})();
