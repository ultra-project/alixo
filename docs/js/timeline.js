/* ============================================================
   Bloc « Frise chronologique » (1.51)
   b = { id, type: 'timeline', dir: 'v' | 'h', title?: 'HTML',
         events: [ { d: 'date ou période (texte libre, HTML court)', t: 'titre (HTML)', x: 'description (HTML)', c: '#rrggbb' | '' } ] }
   Un objet non éditable (contenteditable="false") dont les champs (.tml-title, .tml-d, .tml-t, .tml-x) sont des zones
   de saisie, comme le bloc Arbre. Date en texte libre (« v. 1450 », « 1914-1918 », « IIIe s. av. J.-C. ») ; ordre manuel.
   Entrée : date → titre → description → nouvel événement ; Maj+Entrée : saut de ligne dans la description ;
   Tab / Maj+Tab : champ suivant / précédent (après le dernier champ : les outils) ; Alt+↑ / Alt+↓ : déplacer l'événement ; Retour arrière sur un événement vide : suppression ; Échap : sélection du bloc.
   Chargé AVANT app.js (blockHTML est appelé dès le premier rendu) : les globales d'app.js (getBlock, touch, renderBlocks…)
   ne sont lues qu'au moment des actions.
   ============================================================ */
'use strict';

window.AlixoTimeline = (() => {
  const MAX_EVENTS = 200;
  const KINDS = ['d', 't', 'x'];
  const PH = { title: 'Titre de la frise (facultatif)', d: 'Date', t: 'Événement', x: 'Description (facultatif)' };
  const QUICK = ['#3d6bb5', '#2e8b6a', '#b3762a', '#b0483f', '#7a5cc7', '#2e8b8b', '#8c4351', '#5f6368'];
  const escA = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const str = v => (typeof v === 'string' ? v : '');
  /* 1.51 — défense en profondeur : le HTML d'un champ (titre, date, événement, description) n'est jamais injecté tel quel —
     un document partagé ou importé peut contenir n'importe quoi. Il est recomposé par AlixoSanitize.atoms (liste blanche :
     mise en forme, liens et atomes Alixo) ; sans le module, repli sur le texte seul, échappé. */
  function safe(h) {
    h = str(h); if (!h) return '';
    if (window.AlixoSanitize && typeof AlixoSanitize.atoms === 'function') { try { return AlixoSanitize.atoms(h); } catch { /* repli ci-dessous */ } }
    return escA(h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&'));
  }
  /* couleur du modèle : uniquement #rgb ou #rrggbb (un document reçu peut contenir n'importe quoi) */
  function hexColor(c) {
    const m = String(c || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return '';
    const h = m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1];
    return '#' + h.toLowerCase();
  }
  /* couleur de la date pour une couleur choisie : la même teinte, foncée (feuille claire) ou éclaircie (feuille sombre)
     jusqu'à un contraste d'au moins 4,5:1 — WCAG, calculé sur les feuilles par défaut des deux thèmes */
  const PAPER = { light: '#ffffff', dark: '#17181b' };
  const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  function readable(hex, theme) {
    const c = hexColor(hex); if (!c) return '';
    const base = rgbOf(c), bg = rgbOf(PAPER[theme] || PAPER.light), to = theme === 'dark' ? 255 : 0;
    let out = base;
    for (let k = 0; k <= 20 && contrast(out, bg) < 4.6; k++) out = base.map(v => Math.round(v + (to - v) * (k + 1) / 20));
    return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  const newEvent = () => ({ d: '', t: '', x: '', c: '' });
  const titled = new Set();   // frises dont le champ de titre (vide) a été demandé par le bouton « Titre » : il reste affiché
  /* événements du bloc, dans une forme sûre (copie) */
  function eventsOf(b) {
    const list = Array.isArray(b && b.events) ? b.events.slice(0, MAX_EVENTS) : [];
    const out = list.map(e => ({ d: str(e && e.d), t: str(e && e.t), x: str(e && e.x), c: hexColor(e && e.c) }));
    return out.length ? out : [newEvent()];
  }
  /* même chose, mais écrit dans le bloc (avant une modification) */
  function ensure(b) { b.events = eventsOf(b); if (b.dir !== 'h') b.dir = 'v'; return b.events; }
  /* événements et titre aux champs assainis (copie) : pour tout ce qui les interprète comme du HTML — rendu, exports */
  const safeEvents = b => eventsOf(b).map(e => ({ d: safe(e.d), t: safe(e.t), x: safe(e.x), c: e.c }));
  const safeTitle = b => safe(b && b.title);
  const textOf = h => String(h || '').replace(/<[^>]*>/g, '').replace(/&nbsp;|[​ ]/g, ' ').trim();
  const isBlankHTML = h => !textOf(h) && !/<img|refart|calc-res|class="lnk"|rtag/.test(String(h || ''));
  const isEmptyEvent = e => isBlankHTML(e.d) && isBlankHTML(e.t) && isBlankHTML(e.x);

  const ICO = {
    add: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="m6 14 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="m6 10 6 6 6-6"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="m10 6 6 6-6 6"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };
  const field = (cls, key, ph, html, extra = '') =>
    `<div class="${cls}${extra}${isBlankHTML(html) ? ' is-blank' : ''}" contenteditable="true" data-f="${key}" data-ph="${escA(ph)}" spellcheck="true">${html || '<br>'}</div>`;

  /* o.handle : poignée de déplacement d'app.js ; o.readOnly : séance partagée en lecture seule (aucun outil) */
  function blockHTML(b, o = {}) {
    const evs = safeEvents(b), h = b.dir === 'h', ro = !!o.readOnly;   // champs assainis : jamais le HTML brut du modèle
    const title = safeTitle(b);
    const tools = (e, i) => ro ? '' : `<div class="tml-evtools" contenteditable="false">
        <button type="button" data-tml="addafter" data-i="${i}" title="Ajouter un événement après celui-ci" aria-label="Ajouter un événement après celui-ci">${ICO.add}</button>
        <button type="button" data-tml="up" data-i="${i}" title="${h ? 'Déplacer vers la gauche' : 'Monter'} (Alt+↑)" aria-label="${h ? 'Déplacer vers la gauche' : 'Monter'}"${i ? '' : ' disabled'}>${h ? ICO.left : ICO.up}</button>
        <button type="button" data-tml="down" data-i="${i}" title="${h ? 'Déplacer vers la droite' : 'Descendre'} (Alt+↓)" aria-label="${h ? 'Déplacer vers la droite' : 'Descendre'}"${i < evs.length - 1 ? '' : ' disabled'}>${h ? ICO.right : ICO.down}</button>
        <button type="button" data-tml="color" data-i="${i}" class="tml-swatch" title="Couleur de l’événement" aria-label="Couleur de l’événement"><i></i></button>
        <button type="button" data-tml="del" data-i="${i}" class="danger" title="Supprimer cet événement" aria-label="Supprimer cet événement"${evs.length > 1 ? '' : ' disabled'}>${ICO.del}</button></div>`;
    return `<div class="block timeline ${h ? 'tml-h' : 'tml-v'}" data-id="${escA(b.id)}" contenteditable="false">${o.handle || ''}
      ${field('tml-title', 'title', PH.title, title, titled.has(b.id) ? ' show' : '')}
      <div class="tml-scroll"><ol class="tml-list">${evs.map((e, i) => `<li class="tml-ev"${e.c ? ` style="--tc:${e.c}; --tcl:${readable(e.c, 'light')}; --tcd:${readable(e.c, 'dark')}"` : ''}><span class="tml-dot" aria-hidden="true"></span>
        <div class="tml-body">${field('tml-d', 'd' + i, PH.d, e.d)}${field('tml-t', 't' + i, PH.t, e.t)}${field('tml-x', 'x' + i, PH.x, e.x)}</div>${tools(e, i)}</li>`).join('')}</ol></div>
      ${ro ? '' : `<div class="tml-tools" contenteditable="false"><button type="button" data-tml="add" title="Ajouter un événement à la fin">Ajouter un événement</button>${isBlankHTML(title) ? '<button type="button" data-tml="title" title="Donner un titre à la frise">Titre</button>' : ''}<button type="button" data-tml="dir" title="${h ? 'Afficher la frise de haut en bas' : 'Afficher la frise de gauche à droite'}">${h ? 'Affichage vertical' : 'Affichage horizontal'}</button><button type="button" data-tml="rm" class="danger" title="Supprimer la frise">Supprimer la frise</button></div>`}</div>`;
  }

  /* relit les champs depuis l'écran (saisie en cours) ; clean : cleanHTML d'app.js */
  function syncFromDom(b, el, clean) {
    const c = typeof clean === 'function' ? clean : (h => String(h || '').replace(/​/g, '').replace(/(<br\s*\/?>)+\s*$/i, ''));
    const evs = ensure(b);
    el.querySelectorAll('.tml-d, .tml-t, .tml-x').forEach(f => {
      const m = String(f.dataset.f || '').match(/^([dtx])(\d+)$/); if (!m) return;
      const e = evs[+m[2]]; if (e) e[m[1]] = c(f.innerHTML);
    });
    const tf = el.querySelector('.tml-title');
    if (tf) { const t = c(tf.innerHTML); if (isBlankHTML(t)) delete b.title; else b.title = t; }
  }

  /* texte brut : recherche, statistiques, IA — « date — titre : description » par ligne */
  function plain(b, strip) {
    const s = typeof strip === 'function' ? strip : textOf;
    const lines = eventsOf(b).filter(e => !isEmptyEvent(e)).map(e => {
      const d = s(e.d).trim(), t = s(e.t).trim(), x = s(e.x).trim();
      return [d, t].filter(Boolean).join(' — ') + (x ? ((d || t) ? ' : ' : '') + x : '');
    });
    const title = s(b.title || '').trim();
    return (title ? [title] : []).concat(lines).join('\n');
  }

  const blockEl = bid => [...document.querySelectorAll('#blocks > .block.timeline')].find(el => el.dataset.id === bid) || null;
  function focus(bid, i, kind, pos) {
    const el = blockEl(bid); if (!el) return;
    const f = el.querySelector(kind === 'title' ? '.tml-title' : `[data-f="${KINDS.includes(kind) ? kind : 'd'}${Math.max(0, +i || 0)}"]`);
    if (!f) return;
    focusField(f, pos || 'end');
    if (f.scrollIntoView && el.classList.contains('tml-h')) f.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  /* placeholders : classe is-blank (js/app.js › syncBlank quand il existe, sinon calcul local) */
  function refreshBlank(scope) {
    if (!scope) return;
    if (typeof syncBlank === 'function') { try { syncBlank(scope); return; } catch { /* repli ci-dessous */ } }
    const list = scope.matches && scope.matches('[data-ph]') ? [scope] : [...scope.querySelectorAll('.tml-title, .tml-d, .tml-t, .tml-x')];
    list.forEach(f => f.classList.toggle('is-blank', !(f.textContent || '').replace(/[​ \s]/g, '') && !f.querySelector('img, .refart, .calc-res, .lnk, .rtag, .nb')));
  }

  function act(bid, a, i, anchor) {
    const b = getBlock(bid); if (!b || b.type !== 'timeline') return;
    if (typeof readOnly !== 'undefined' && readOnly) return;
    const el = blockEl(bid);
    if (el) syncFromDom(b, el, typeof cleanHTML === 'function' ? cleanHTML : null);
    const evs = ensure(b);
    i = Math.max(0, Math.min(evs.length - 1, +i || 0));
    const redraw = () => { touch(); renderBlocks('__none'); };
    if (a === 'add' || a === 'addafter') {
      if (evs.length >= MAX_EVENTS) { toast(`Une frise contient au plus ${MAX_EVENTS} événements`); return; }
      const at = a === 'add' ? evs.length : i + 1;
      evs.splice(at, 0, newEvent()); redraw(); focus(bid, at, 'd'); return;
    }
    if (a === 'up' || a === 'down') {
      const j = i + (a === 'up' ? -1 : 1); if (j < 0 || j >= evs.length) return;
      [evs[i], evs[j]] = [evs[j], evs[i]]; redraw(); focus(bid, j, 't'); return;
    }
    if (a === 'del') {
      if (evs.length < 2) return;
      evs.splice(i, 1); redraw(); focus(bid, Math.max(0, i - 1), 't'); return;
    }
    if (a === 'dir') { b.dir = b.dir === 'h' ? 'v' : 'h'; redraw(); selectObj(bid); return; }
    if (a === 'rm') { deleteObj(bid); return; }
    if (a === 'title') { titled.add(bid); renderBlocks('__none'); focus(bid, 0, 'title'); return; }
    if (a === 'color') {
      const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: innerWidth / 2 - 160, top: innerHeight / 3, bottom: innerHeight / 3 };
      openPalettePopover(r, { title: 'Couleur de l’événement', none: 'Automatique', quick: QUICK, current: evs[i].c, keepSelection: false, onPick: c => {
        const bb = getBlock(bid); if (!bb || bb.type !== 'timeline') return;
        const list = ensure(bb); if (!list[i]) return;
        list[i].c = c === 'none' ? '' : hexColor(c);
        redraw(); focus(bid, i, 't');
      } });
    }
  }

  /* écouteurs posés une fois sur la zone d'écriture (#blocks) — appelés par app.js quand elle existe */
  function init(root) {
    if (!root || root._tmlInit) return; root._tmlInit = true;
    root.addEventListener('click', e => {
      const btn = e.target.closest && e.target.closest('.block.timeline [data-tml]'); if (!btn) return;
      e.preventDefault();
      act(btn.closest('.block').dataset.id, btn.dataset.tml, btn.dataset.i, btn);
    });
    /* les outils ne prennent pas le curseur au champ en cours */
    root.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.tml-evtools, .tml-tools')) e.preventDefault(); });
    root.addEventListener('input', e => { const f = e.target.closest && e.target.closest('.tml-title, .tml-d, .tml-t, .tml-x'); if (f) refreshBlank(f); }, true);
    root.addEventListener('compositionstart', e => { const f = e.target.closest && e.target.closest('.tml-title, .tml-d, .tml-t, .tml-x'); if (f) f.classList.remove('is-blank'); }, true);
    root.addEventListener('compositionend', e => { const f = e.target.closest && e.target.closest('.tml-title, .tml-d, .tml-t, .tml-x'); if (f) refreshBlank(f); }, true);
    root.addEventListener('keydown', e => {
      const f = e.target.closest && e.target.closest('.tml-title, .tml-d, .tml-t, .tml-x'); if (!f) return;
      if (e.isComposing) return;
      const bl = f.closest('.block'); const bid = bl.dataset.id;
      const isTitle = f.classList.contains('tml-title');
      const m = String(f.dataset.f || '').match(/^([dtx])(\d+)$/);
      const kind = isTitle ? 'title' : (m ? m[1] : 'd'), i = m ? +m[2] : 0;
      const n = bl.querySelectorAll('.tml-ev').length;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      /* champ suivant / précédent dans l'ordre de lecture : titre, puis d, t, x de chaque événement */
      const next = () => { if (isTitle) return [0, 'd']; if (kind !== 'x') return [i, KINDS[KINDS.indexOf(kind) + 1]]; return i < n - 1 ? [i + 1, 'd'] : null; };
      const prev = () => { if (isTitle) return null; if (kind !== 'd') return [i, KINDS[KINDS.indexOf(kind) - 1]]; if (i > 0) return [i - 1, 'x']; const tf = bl.querySelector('.tml-title'); return tf && tf.offsetParent !== null ? [0, 'title'] : null; };
      if (e.key === 'Enter') {
        if (e.shiftKey && kind === 'x') { e.stopPropagation(); return; }   // saut de ligne dans la description
        stop();
        if (kind === 'x') { act(bid, 'addafter', i); return; }
        const nx = next(); if (nx) focus(bid, nx[0], nx[1]);
        return;
      }
      if (e.key === 'Tab') {
        /* pas de champ suivant / précédent : Tab n'est plus avalé — le navigateur passe aux outils de l'événement
           (ajouter, déplacer, couleur, supprimer) puis à ceux de la frise ; l'éditeur, lui, ne doit pas y voir une tabulation */
        const to = e.shiftKey ? prev() : next();
        if (to) { stop(); focus(bid, to[0], to[1]); } else e.stopPropagation();
        return;
      }
      /* Alt+↑ / Alt+↓ : déplacer l'événement en cours (équivalent clavier des boutons Monter / Descendre) */
      if (e.altKey && !e.ctrlKey && !e.metaKey && !isTitle && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        stop();
        const j = i + (e.key === 'ArrowUp' ? -1 : 1);
        if (j >= 0 && j < n) { act(bid, e.key === 'ArrowUp' ? 'up' : 'down', i); focus(bid, j, kind); }
        return;
      }
      if (e.key === 'Backspace' && !isTitle && n > 1) {
        const b = getBlock(bid);
        if (b) { syncFromDom(b, bl, typeof cleanHTML === 'function' ? cleanHTML : null); const ev = eventsOf(b)[i]; if (ev && isEmptyEvent(ev)) { stop(); act(bid, 'del', i); if (i > 0) focus(bid, i - 1, 'x'); else focus(bid, 0, 'd'); return; } }
      }
      if (e.key === 'Escape') { stop(); selectObj(bid); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.stopPropagation();   // pas de changement de bloc depuis un champ
    }, true);
  }

  return { blockHTML, syncFromDom, plain, act, focus, init, eventsOf, safeEvents, safeTitle, safe, hexColor, isEmptyEvent, newEvent, PH };
})();
