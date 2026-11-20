/* ============================================================
   Alixo — 1.56.0 : les PDF s'ouvrent, se lisent et se modifient dans Alixo (onglet « pdf »)
   Un PDF de la bibliothèque (ou partagé) s'ouvre COMME UNE SÉANCE : un onglet dans la barre des onglets
   (AlixoApp.tabs, type « pdf »), une barre d'outils au même emplacement que celle des séances (.pdx-bar), un volet
   escamotable à gauche (Vignettes, Plan, Recherche, Annotations, Formulaire), les pages au centre, une barre d'état.
   - lecture : pdf.js (js/pdfboot.mjs → window.pdfjsLib, worker vendu) ; pages virtualisées (seules les pages proches de
     l'écran ont un canvas), couche de texte sélectionnable, zoom (Ctrl + molette, Ctrl + / − / 0, Ajuster à la largeur,
     Page entière), rotation d'affichage (R), mode nuit, présentation plein écran (F5), recherche insensible aux accents ;
   - modification : annotations (js/pdf-annot.js : stylo, surligneur, formes, flèches, texte, notes, tampons, images,
     signature, surlignage du texte sélectionné), pages (réorganiser par glisser-déposer, tourner, supprimer, dupliquer,
     insérer une page vierge, extraire, fusionner un autre PDF), numérotation, filigrane, formulaire ;
   - enregistrement : js/pdf-write.js réécrit LE MÊME FICHIER (AlixoFiles.replaceData) — les annotations deviennent
     partie du PDF (aplaties, sauf les notes) ; tant qu'il n'est pas enregistré, un brouillon est gardé sur l'appareil
     (AlixoFiles.aux, « pdfdraft:<id> ») et proposé à la réouverture ;
   - AlixoAI (js/pdf-ai.js, Alixo+) : volet de droite (résumé, explication, traduction, questions, quiz, fiche, séance) ;
   - aperçu en lecture seule : preview(container, { name, buf }) — fenêtre d'un fichier, panneau « à côté du cours ».
   Sécurité : isEvalSupported false, aucun script du PDF, aucun lien suivi, aucune requête réseau (polices et décodeurs
   vendus), textes du fichier insérés par textContent / esc, taille limitée (150 Mo, 60 Mo sur téléphone), 3 000 pages
   au plus, canvas bornés à 16 Mpx (pages géantes), réglages et brouillons relus avec validation.
   ============================================================ */
'use strict';

window.AlixoPdf = (() => {
  const BASE = 96 / 72;                 // 100 % = taille réelle (1 pt = 1/72 po, 1 px CSS = 1/96 po)
  const ZK = 'pdf';
  const MAX_BYTES = 150 * 1024 * 1024, WARN_BYTES = 40 * 1024 * 1024, MAX_MOBILE = 60 * 1024 * 1024;
  const GAP = 16;
  /* 1.56.0 : bornes contre les fichiers piégés ou démesurés (revue sécurité) */
  const MAX_PX = 16e6, MAX_SIDE = 32000;   // un canvas ne dépasse jamais 16 Mpx ni 32 000 px de côté
  const MAX_PAGES = 3000, PRINT_MAX = 300, SIZES_ALL = 300;   // au-delà de SIZES_ALL pages, tailles lues à la demande
  const ODD_PT = 14400, ODD_RATIO = 50;   // page de plus de 14 400 pt (5 m) ou allongée au-delà de 1:50 → rendu réduit
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const kbd = s => (isMac ? String(s).replace(/Ctrl\+/g, '⌘') : s);
  const isWeb = () => !(window.alixoDesktop && window.alixoDesktop.openData);
  const escH = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const extOf = name => (String(name || '').split('.').pop() || '').toLowerCase();
  const canOpen = name => extOf(name) === 'pdf';
  const uidL = () => (typeof uid === 'function' ? uid() : Math.random().toString(36).slice(2, 10));
  const say = (m, o) => { if (typeof toast === 'function') toast(m, o); else console.log(m); };
  const isMobile = () => document.body.classList.contains('mobile');
  const norm360 = a => ((Math.round((+a || 0) / 90) * 90) % 360 + 360) % 360;
  const A = () => window.AlixoPdfAnnot;
  const absUrl = p => new URL(p, document.baseURI).href;
  const appVersion = () => (window.AlixoApp && AlixoApp.version) || '';

  /* ---------------- pdf.js : chargé par un module différé (js/pdfboot.mjs) ---------------- */
  let readyP = null;
  function ready() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!readyP) readyP = new Promise((res, rej) => {
      const done = () => { if (window.pdfjsLib) res(window.pdfjsLib); };
      document.addEventListener('pdfjs-ready', done, { once: true });
      setTimeout(() => { if (window.pdfjsLib) res(window.pdfjsLib); else { readyP = null; rej(new Error('Visionneuse PDF indisponible')); } }, 8000);
    });
    return readyP;
  }
  /* ouvre un PDF avec pdf.js (copie du tampon : pdf.js le transfère au worker) ; onPassword(reason) → mot de passe | null */
  async function loadPdf(buf, onPassword) {
    const lib = await ready();
    const task = lib.getDocument({
      data: new Uint8Array(buf.slice(0)), isEvalSupported: false, enableXfa: false, useSystemFonts: false,
      standardFontDataUrl: absUrl('js/vendor/pdf-fonts/'), wasmUrl: absUrl('js/vendor/pdf-wasm/'),
      disableAutoFetch: true, stopAtErrors: false, verbosity: 0, maxImageSize: 1e8, canvasMaxAreaInBytes: MAX_PX * 4
    });
    task.onPassword = (update, reason) => {
      Promise.resolve(onPassword ? onPassword(reason) : null).then(pw => { if (pw == null) task.destroy(); else update(pw); });
    };
    return task.promise;
  }
  function askPassword(name, reason) {
    return new Promise(resolve => {
      if (typeof openDialog !== 'function') { resolve(window.prompt('Mot de passe du PDF')); return; }
      let done = false; const fin = v => { if (done) return; done = true; resolve(v); };
      openDialog({ id: 'pdxpw', cls: 'pdx-dlg', eyebrow: 'PDF protégé', title: escH(name),
        body: `<p class="pdx-dtext">${reason === 2 ? 'Mot de passe incorrect. Réessayez.' : 'Ce PDF est protégé par un mot de passe.'}</p><input type="password" class="pdx-pw" autocomplete="off" aria-label="Mot de passe">`,
        foot: '<span class="dlg-spacer"></span><button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" type="button" data-pw="ok">Ouvrir</button>',
        onMount(card, close) {
          const inp = card.querySelector('.pdx-pw');
          const ok = () => { const v = inp.value; fin(v); close(); };
          card.querySelector('[data-pw="ok"]').addEventListener('click', ok);
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
          setTimeout(() => inp.focus(), 40);
        },
        onClose() { fin(null); } });
    });
  }

  /* ---------------- icônes ---------------- */
  const sv = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I = {
    side: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
    select: sv('<path d="M5 3l14 8-6 1.5L10 19Z"/>'),
    pen: sv('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/>'),
    hl: sv('<path d="m9 11-5 5v4h4l5-5"/><path d="m9 11 6-6 4 4-6 6Z"/><path d="M14 20h7"/>'),
    shapes: sv('<rect x="3" y="3" width="10" height="10" rx="1.5"/><circle cx="16" cy="16" r="5"/>'),
    rect: sv('<rect x="4" y="5" width="16" height="14" rx="1.5"/>'),
    ellipse: sv('<ellipse cx="12" cy="12" rx="9" ry="7"/>'),
    line: sv('<path d="M5 19 19 5"/>'),
    arrow: sv('<path d="M5 19 19 5M10 5h9v9"/>'),
    text: sv('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
    note: sv('<path d="M4 4h16v11l-5 5H4Z"/><path d="M15 20v-5h5M8 9h8M8 13h5"/>'),
    stamp: sv('<path d="M9 3h6l-1 7h4a2 2 0 0 1 2 2v3H4v-3a2 2 0 0 1 2-2h4Z"/><path d="M5 19h14"/>'),
    image: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
    sig: sv('<path d="M3 17c3-1 4-9 6-9s0 8 2 8 2-4 4-4 1 3 3 3 2-1 3-1"/><path d="M3 21h18"/>'),
    erase: sv('<path d="m7 21-4-4L14 6l6 6-9 9Z"/><path d="M9 21h12"/>'),
    pages: sv('<rect x="7" y="3" width="13" height="15" rx="1.5"/><path d="M4 7v12a2 2 0 0 0 2 2h10"/>'),
    rotate: sv('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    rotl: sv('<path d="M4 11a8 8 0 1 1 2.3 5.7"/><path d="M4 4v7h7"/>'),
    night: sv('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'),
    present: sv('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="m10 8 4 2-4 2Z"/><path d="M8 20h8M12 16v4"/>'),
    undo: sv('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
    redo: sv('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
    save: sv('<path d="M5 3h11l3 3v15H5Z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/>'),
    down: sv('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/>'),
    print: sv('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7Z"/>'),
    width: sv('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>'),
    fitpage: sv('<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    search: sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
    thumbs: sv('<rect x="4" y="3" width="7" height="8" rx="1"/><rect x="13" y="3" width="7" height="8" rx="1"/><rect x="4" y="13" width="7" height="8" rx="1"/><rect x="13" y="13" width="7" height="8" rx="1"/>'),
    outline: sv('<path d="M4 6h16M7 12h13M10 18h10"/>'),
    annots: sv('<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9h8M8 12h5"/>'),
    form: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 1.5 1.5L11 8M14 9h4M7 15h4M14 15h4"/>'),
    more: sv('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
    up: sv('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    dn: sv('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    trash: sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    dup: sv('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    plus: sv('<path d="M12 5v14M5 12h14"/>'),
    extract: sv('<path d="M14 3h6v6M20 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>'),
    merge: sv('<path d="M8 3v6a4 4 0 0 0 4 4h0a4 4 0 0 1 4 4v4M16 3v6a4 4 0 0 1-4 4"/>'),
    number: sv('<path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18"/>'),
    water: sv('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>'),
    close: sv('<path d="M6 6l12 12M18 6 6 18"/>'),
    copy: sv('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
    tr: sv('<path d="M4 5h9M8.5 3v2M6 5c1 4 4 7 7 8M11 5c-1 4-4 7-7 8M13 21l4-9 4 9M14.5 18h5"/>'),
    doc: sv('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
    png: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
    txt: sv('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>'),
    lock: sv('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    ai: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4Z"/><path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9Z"/><path d="M19 14l.6 1.4 1.4.6-1.4.6L19 18l-.6-1.4L17 16l1.4-.6Z"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/><path d="M8.5 17v-4h1.3a1.2 1.2 0 0 1 0 2.4H8.5M12.5 17v-4h1a2 2 0 0 1 0 4ZM16.5 17v-4h2M16.5 15h1.5"/></svg>'
  };
  const tabIcon = () => `<span class="pdx-tabico">${I.pdf}</span>`;
  /* 1.56.0 : libellé et raccourci séparés (infobulle maison : libellé + <kbd>) */
  const TOOL_NAMES = { select: 'Sélection et texte', pen: 'Stylo', hl: 'Surligneur (à main levée)', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Ligne', arrow: 'Flèche', text: 'Zone de texte', note: 'Note', stamp: 'Tampon', erase: 'Gomme : cliquez une annotation pour l’effacer' };
  const TOOL_KEYS = { select: 'V', pen: 'P', hl: 'H', text: 'T', note: 'N', erase: 'E' };
  const ariaKeys = k => String(k || '').split(/\s*,\s*/).filter(Boolean).map(x => x.replace(/^Ctrl\+/, isMac ? 'Meta+' : 'Control+').replace(/^Maj\+/, 'Shift+')).join(' ');
  const cname = c => (A() ? A().colorName(c) : c);

  /* ============================================================
     Onglets : un .pdx-doc par PDF ouvert dans #view-pdf ; `ed` est celui qui est affiché
     ============================================================ */
  const eds = new Map();
  let ed = null;
  const viewHost = () => { let v = document.getElementById('view-pdf'); if (!v) { v = document.createElement('section'); v.id = 'view-pdf'; v.hidden = true; document.body.appendChild(v); } return v; };
  const SIDE_LS = 'alixo.pdf.side';
  const sideOpen = () => { try { const v = localStorage.getItem(SIDE_LS); return v === null ? innerWidth > 1100 && !isMobile() : v === '1'; } catch { return true; } };

  async function open({ name, buf, fileId = null, folderId = null, shared = false } = {}) {
    if (!canOpen(name)) { say('Ce fichier n’est pas un PDF'); return false; }
    const id = fileId && !shared ? 'pdf:' + fileId : 'pdf:tmp-' + uidL();
    if (eds.has(id)) { showTab(id); return true; }
    const ab = buf instanceof ArrayBuffer ? buf : (buf && buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : null);
    if (!ab || !ab.byteLength) { say('Fichier illisible'); return false; }
    const max = isMobile() ? MAX_MOBILE : MAX_BYTES;
    if (ab.byteLength > max) { say(tooBigMsg(max), { duration: 10000 }); return false; }
    if (ab.byteLength > WARN_BYTES) say('PDF volumineux : l’ouverture peut prendre quelques secondes', { duration: 3500 });
    const my = build(id, { name, ab, fileId: shared ? null : fileId, folderId: shared ? null : folderId, shared });
    showTab(id);
    load(my);
    return true;
  }
  function tooBigMsg(max) {
    const n = Math.round(max / 1048576);
    return isMobile() || isWeb() ? `Ce PDF fait plus de ${n} Mo : il est trop lourd pour être ouvert dans Alixo sur cet appareil. Ouvrez-le avec votre lecteur PDF habituel.`
      : `Ce PDF fait plus de ${n} Mo : ouvrez-le avec votre lecteur PDF (clic droit sur le fichier › Ouvrir avec…).`;
  }
  const tooManyMsg = n => `Ce PDF compte ${n.toLocaleString('fr-FR')} pages : c’est trop pour l’ouvrir dans Alixo (${MAX_PAGES.toLocaleString('fr-FR')} au plus). Ouvrez-le avec votre lecteur PDF habituel.`;
  function showTab(id) {
    const my = eds.get(id); if (!my) return;
    if (window.AlixoApp && AlixoApp.tabs) AlixoApp.tabs.open({ id, kind: 'pdf', title: my.name + (my.dirty ? ' •' : ''), icon: tabIcon(), data: { fileId: my.fileId, folderId: my.folderId } });
    else show(id);
  }
  function newModel(n) { return { v: 1, pages: Array.from({ length: n }, (_, i) => ({ key: 'k' + uidL(), src: 0, srcIndex: i, rotate: 0, blank: null })), annots: Object.create(null), form: Object.create(null), numbering: null, watermark: null }; }
  function build(id, { name, ab, fileId, folderId, shared }) {
    const ov = document.createElement('div');
    ov.className = 'pdx-doc' + (sideOpen() ? ' side-open' : ''); ov.dataset.tab = id; ov.hidden = true;
    const tid = 'pdx' + id.replace(/\W/g, '');
    /* 1.56.0 : onglets du volet accessibles (aria-selected, aria-controls, tabpanel) ; « Replier » hors de la liste d'onglets */
    const stab = (k, title, label, icon, extra = '') => `<button type="button" role="tab" id="${tid}-t-${k}" aria-controls="${tid}-p-${k}" aria-selected="${k === 'thumbs'}" tabindex="${k === 'thumbs' ? 0 : -1}" data-pane="${k}"${k === 'thumbs' ? ' class="on"' : ''} title="${title}" aria-label="${label}" ${extra}>${icon}</button>`;
    const spane = (k, inner) => `<div class="pdx-spane" role="tabpanel" id="${tid}-p-${k}" aria-labelledby="${tid}-t-${k}" data-pane="${k}"${k === 'thumbs' ? '' : ' hidden'}>${inner}</div>`;
    ov.innerHTML = `<div class="pdx-bar" role="toolbar" aria-label="Outils du PDF"></div>
      <div class="pdx-opts" role="toolbar" aria-label="Options de l’outil" hidden></div>
      <div class="pdx-banner" role="status" hidden></div>
      <aside class="pdx-side" aria-label="Volet du PDF">
        <div class="pdx-stabbar">
          <div class="pdx-stabs" role="tablist" aria-label="Contenu du volet">
            ${stab('thumbs', 'Vignettes des pages', 'Vignettes', I.thumbs)}${stab('outline', 'Plan du document', 'Plan', I.outline)}${stab('search', 'Rechercher (' + kbd('Ctrl+F') + ')', 'Rechercher', I.search)}${stab('annots', 'Annotations', 'Annotations', I.annots + '<i class="pdx-badge" hidden></i>')}${stab('form', 'Formulaire', 'Formulaire', I.form, 'hidden')}
          </div>
          <span class="pdx-sflex"></span>
          <button type="button" class="pdx-sclose" data-pd="side" title="Replier le volet" aria-label="Replier le volet">‹</button>
        </div>
        ${spane('thumbs', '<div class="pdx-thumbs" role="listbox" aria-label="Pages"></div>')}
        ${spane('outline', '<nav class="pdx-outline" aria-label="Plan du document"></nav>')}
        ${spane('search', `<div class="pdx-sbox"><span class="pdx-sico">${I.search}</span><input type="search" class="pdx-sq" placeholder="Rechercher dans le PDF" aria-label="Rechercher dans le PDF" spellcheck="false">
            <span class="pdx-scount" aria-live="polite"></span><button type="button" data-pd="find-prev" title="Précédent (Maj+Entrée)" aria-label="Résultat précédent">‹</button><button type="button" data-pd="find-next" title="Suivant (Entrée, F3)" aria-label="Résultat suivant">›</button></div>
          <div class="pdx-sres"></div>`)}
        ${spane('annots', '<div class="pdx-alist"></div>')}
        ${spane('form', '<div class="pdx-form"></div>')}
      </aside>
      <button type="button" class="pdx-pill" data-pd="side" title="Afficher le volet (vignettes, plan, recherche)" aria-label="Afficher le volet">${I.side}</button>
      <div class="pdx-body"><div class="pdx-scroll" tabindex="-1"><div class="pdx-pages"></div></div><div class="pdx-wait"><span class="pdx-spin"></span><span>Ouverture de « ${escH(name)} »…</span></div></div>
      <aside class="pdx-aipanel" hidden aria-label="Alixo AI"></aside>
      <div class="pdx-selpop" hidden></div>
      <footer class="pdx-status">
        <span class="pdx-fico">PDF</span>
        <span class="pdx-pgbox">Page <input class="pdx-pgin" type="text" inputmode="numeric" value="1" aria-label="Aller à la page"> sur <b class="pdx-pgn">…</b></span>
        <span class="pdx-state"></span>
        <span class="pdx-note"></span>
        <span class="pdx-zinfo"></span>
      </footer>`;
    viewHost().appendChild(ov);
    const my = {
      id, ov, name, fileId, folderId, shared, readOnly: !!shared, readOnlyHard: false, origBuf: ab, sources: [ab], docs: [], ps: new Map(),
      model: newModel(0), images: {}, hist: [], redo: [], dirty: false, saving: null, sel: null, flattenForm: false,
      view: { zoom: 1, mode: 'width', rotation: 0, night: false, tool: 'select' }, find: { q: '', hits: [], cur: -1, marks: {} },
      textCache: new Map(), sizes: [[]], loaded: false, broken: false, cur: 0, ai: null, stateTxt: 'Ouverture…'
    };
    my.scroll = ov.querySelector('.pdx-scroll'); my.pagesEl = ov.querySelector('.pdx-pages');
    eds.set(id, my);
    bindDoc(my);
    return my;
  }
  async function load(my) {
    let pdf;
    try { pdf = await loadPdf(my.origBuf, reason => askPassword(my.name, reason)); }
    catch (err) {
      if (!eds.has(my.id)) return;
      console.error(err);
      my.broken = true;
      // 1.56.0 : le détail technique reste dans la console ; l'utilisateur lit une phrase claire
      const pw = err && err.name === 'PasswordException';
      const msg = pw ? 'Mot de passe non saisi : le PDF reste fermé.' : /indisponible/.test(err && err.message || '') ? 'La visionneuse PDF n’a pas pu démarrer. Réessayez dans un instant.' : 'Ce PDF semble endommagé ou incomplet : Alixo n’arrive pas à l’afficher.';
      brokenView(my, msg, !pw);
      return;
    }
    if (!eds.has(my.id)) { pdf.destroy(); return; }
    if (pdf.numPages > MAX_PAGES) { my.broken = true; const n = pdf.numPages; try { pdf.destroy(); } catch { /* */ } brokenView(my, tooManyMsg(n), true); return; }
    my.docs[0] = pdf;
    my.model = newModel(pdf.numPages);
    // brouillon d'une session précédente (modifications non enregistrées)
    await maybeRestoreDraft(my);
    if (!eds.has(my.id)) return;
    // tailles des pages : la première tout de suite, les autres en arrière-plan
    const p1 = await pdf.getPage(1);
    my.sizes[0][0] = { view: p1.view.slice(), rot0: p1.rotate };
    checkOdd(my, p1.view);
    my.ov.querySelector('.pdx-bar').innerHTML = barHTML(my);
    my.ov.querySelector('.pdx-wait').remove();
    my.loaded = true;
    syncPages(my);
    applyMode(my);
    renderOutline(my); initForm(my);
    paintBar(my); updateStatus(my);
    setState(my, my.dirty ? 'Modifications non enregistrées (brouillon repris)' : my.shared ? 'Fichier partagé : « Enregistrer » en garde une copie dans votre bibliothèque' : 'Enregistré');
    fetchSizes(my, 0);
    inspectFile(my);
    if (window.AlixoPdfAI && AlixoPdfAI.attach) AlixoPdfAI.attach(my);
    if (ed === my) show(my.id);
  }
  /* 1.56.0 : lecture impossible (fichier endommagé, trop de pages) : message clair, et une issue (lecteur du navigateur
     dans un onglet séparé sur le web, application de l'ordinateur sur la version PC) */
  function brokenView(my, msg, offer) {
    my.broken = true;
    const w = my.ov.querySelector('.pdx-wait') || my.ov.querySelector('.pdx-body');
    const btn = !offer ? '' : isWeb() ? '<button type="button" class="cta ghost small" data-pd="fallback">Ouvrir avec le lecteur du navigateur</button>' : '<button type="button" class="cta ghost small" data-pd="fallback">Ouvrir avec une autre application</button>';
    w.innerHTML = `<div class="pdx-err"><p></p>${btn}</div>`;
    w.querySelector('p').textContent = msg;
    setState(my, 'Lecture impossible');
  }
  /* page démesurée (MediaBox géante ou très allongée) : rendu réduit (canvas bornés) et un mot pour le dire */
  function checkOdd(my, view) {
    const w = Math.abs(view[2] - view[0]), h = Math.abs(view[3] - view[1]);
    if (my.oddWarned || !(w > ODD_PT || h > ODD_PT || Math.max(w, h) / Math.max(1, Math.min(w, h)) > ODD_RATIO)) return;
    my.oddWarned = true;
    if (my.ov && !my.preview) { setNote(my, 'Pages aux dimensions inhabituelles : affichage en définition réduite'); say('Ce PDF a des pages aux dimensions inhabituelles : elles s’affichent en définition réduite', { duration: 5000 }); }
  }
  /* chiffré (lecture seule) ou signé — 1.56.0 : détecté par pdf.js à l'ouverture (rapide, quelle que soit la taille) ;
     la vérification complète par pdf-lib a lieu au début de chaque enregistrement (saveNow) */
  async function inspectFile(my) {
    const pdf = my.docs[0]; if (!pdf) return;
    let enc = false;
    try { const md = await pdf.getMetadata(); enc = !!(md && md.info && md.info.EncryptFilterName); } catch { /* */ }
    if (!enc) { try { enc = !!(await pdf.getPermissions()); } catch { /* */ } }
    if (!eds.has(my.id)) return;
    if (enc) lockHard(my);
  }
  function lockHard(my) {
    if (my.readOnlyHard) return;
    my.readOnlyHard = true; my.ov.classList.add('pdx-locked');
    if (my.view.tool !== 'select') setTool(my, 'select');
    setNote(my, 'PDF verrouillé : lecture seule');
    banner(my, 'Ce PDF est verrouillé par son auteur : vous pouvez le lire, le rechercher et l’imprimer, mais pas le modifier.');
    paintBar(my); initForm(my);
  }
  function banner(my, text) { const b = my.ov.querySelector('.pdx-banner'); if (!b) return; b.textContent = text || ''; b.hidden = !text; my.ov.classList.toggle('has-banner', !!text); }
  async function fetchSizes(my, src) {
    const pdf = my.docs[src]; if (!pdf) return;
    const arr = my.sizes[src] || (my.sizes[src] = []);
    /* 1.56.0 : gros PDF → seules les premières pages sont mesurées d'avance ; les autres prennent la taille de la page 1
       et sont corrigées à leur premier rendu (getProxy) */
    const upto = pdf.numPages > SIZES_ALL ? 60 : pdf.numPages;
    for (let i = 0; i < upto; i++) {
      if (!eds.has(my.id)) return;
      if (arr[i]) continue;
      try { const p = await pdf.getPage(i + 1); arr[i] = { view: p.view.slice(), rot0: p.rotate }; checkOdd(my, arr[i].view); } catch { arr[i] = arr[0]; }
      if (i % 25 === 24) { await new Promise(r => setTimeout(r, 0)); }
    }
    let changed = false;
    for (const ps of my.ps.values()) if (ps.src === src && !ps.exact) { const s = arr[ps.srcIndex]; if (s) { ps.view = s.view; ps.rot0 = s.rot0; ps.exact = true; changed = true; } }
    if (changed) { layoutAll(my); applyMode(my); }
  }

  /* affiche l'onglet (appelé par AlixoApp.tabs → open) */
  function show(id) {
    const my = eds.get(id); if (!my) return;
    if (ed && ed !== my) hide(ed);
    ed = my;
    viewHost().hidden = false;
    my.ov.hidden = false;
    document.body.classList.add('pdx-open');
    if (window.AlixoZoom) AlixoZoom.set(ZK, my.view.zoom, { silent: true });
    if (my.loaded) { applyMode(my); schedule(my); updateStatus(my); if (my.thumbsStale) syncThumbs(my); }
    setState(my, my.stateTxt);
    setTimeout(() => { if (ed === my && !my.ov.hidden && !my.ov.contains(document.activeElement)) my.scroll.focus({ preventScroll: true }); }, 30);
  }
  function hide(my) {
    if (!my) return;
    closeMenu(); hideSelPop(my); closeBubble(my);
    if (my.ov.classList.contains('pdx-present')) leavePresent(my);
    my.ov.hidden = true;
    if (ed === my) { ed = null; document.body.classList.remove('pdx-open'); }
    if (![...eds.values()].some(e => !e.ov.hidden)) viewHost().hidden = true;
  }
  /* fermeture : avec des modifications, on demande (enregistrer est irréversible) */
  async function close(id, opts = {}) {
    const my = id ? eds.get(id) : ed; if (!my) return;
    if (my.dirty && !my.broken && !opts.force) {
      const choice = await askSave(my);
      if (choice === 'cancel') { if (window.AlixoApp && AlixoApp.tabs && !AlixoApp.tabs.isOpen(my.id)) showTab(my.id); return; }
      if (choice === 'save') { const ok = await saveNow(my); if (!ok) { if (window.AlixoApp && AlixoApp.tabs && !AlixoApp.tabs.isOpen(my.id)) showTab(my.id); return; } }
      else if (my.fileId) await flushDraft(my);   // un PDF partagé n'a pas de brouillon : ses annotations sont abandonnées
    }
    destroy(my);
    if (id === undefined && window.AlixoApp && AlixoApp.tabs && AlixoApp.tabs.isOpen(my.id)) AlixoApp.tabs.close(my.id);
  }
  function destroy(my) {
    hide(my);
    clearTimeout(my.draftTm); clearTimeout(my.zTm);
    if (my.io) my.io.disconnect(); if (my.tio) my.tio.disconnect(); if (my.ro) my.ro.disconnect();
    for (const ps of my.ps.values()) releasePage(ps);
    for (const d of my.docs) { try { d && d.destroy(); } catch { /* */ } }
    for (const im of Object.values(my.images)) if (im.url) URL.revokeObjectURL(im.url);
    if (window.AlixoPdfAI && AlixoPdfAI.detach) AlixoPdfAI.detach(my);
    my.ov.remove(); eds.delete(my.id);
  }
  function askSave(my) {
    return new Promise(resolve => {
      if (typeof openDialog !== 'function') { resolve(window.confirm('Enregistrer les modifications dans le PDF ?') ? 'save' : 'discard'); return; }
      let res = 'cancel';
      /* 1.56.0 : un PDF partagé n'a pas de brouillon (pas de fichier à soi) : fermer sans enregistrer abandonne tout */
      const draftable = !!my.fileId;
      const text = draftable
        ? 'Enregistrer intègre vos annotations au fichier : elles ne pourront plus être déplacées ni effacées (les notes restent modifiables). Si vous fermez sans enregistrer, tout est gardé en brouillon sur cet appareil et vous sera proposé à la prochaine ouverture.'
        : 'Ce PDF vous a été partagé : fermer sans enregistrer abandonne vos annotations. Enregistrer en crée une copie dans votre bibliothèque.';
      openDialog({ id: 'pdxclose', cls: 'pdx-dlg', eyebrow: 'PDF', title: `Enregistrer vos modifications dans « ${escH(my.name)} » ?`,
        body: `<p class="pdx-dtext">${escH(text)}</p>`,
        foot: `<button class="cta ghost${draftable ? '' : ' danger'}" type="button" data-cl="discard">${draftable ? 'Garder en brouillon' : 'Fermer sans garder'}</button><span class="dlg-spacer"></span><button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" type="button" data-cl="save">${my.readOnly ? 'Enregistrer une copie' : 'Enregistrer dans le PDF'}</button>`,
        onMount(card, closeD) { card.addEventListener('click', e => { const b = e.target.closest('[data-cl]'); if (!b) return; res = b.dataset.cl; closeD(); }); },
        onClose() { resolve(res); } });
    });
  }

  /* ============================================================
     Pages : géométrie, virtualisation, rendu
     ============================================================ */
  const pageModel = (my, key) => my.model.pages.find(p => p.key === key) || null;
  /* viewport « à la pdf.js » sans pdf.js (pages vierges) : view = [x0, y0, x1, y1] */
  function viewportOf(view, rotation, scale) {
    const [x0, y0, x1, y1] = view; const cx = (x1 + x0) / 2, cy = (y1 + y0) / 2;
    const r = norm360(rotation); let a, b, c, d;
    if (r === 90) { a = 0; b = 1; c = 1; d = 0; } else if (r === 180) { a = -1; b = 0; c = 0; d = 1; } else if (r === 270) { a = 0; b = -1; c = -1; d = 0; } else { a = 1; b = 0; c = 0; d = -1; }
    let ox, oy, w, h;
    if (a === 0) { ox = Math.abs(cy - y0) * scale; oy = Math.abs(cx - x0) * scale; w = Math.abs(y1 - y0) * scale; h = Math.abs(x1 - x0) * scale; }
    else { ox = Math.abs(cx - x0) * scale; oy = Math.abs(cy - y0) * scale; w = Math.abs(x1 - x0) * scale; h = Math.abs(y1 - y0) * scale; }
    const transform = [a * scale, b * scale, c * scale, d * scale, ox - a * scale * cx - c * scale * cy, oy - b * scale * cx - d * scale * cy];
    return { width: w, height: h, transform, rotation: r, scale };
  }
  function createPS(my, p) {
    const el = document.createElement('div');
    el.className = 'pdx-page'; el.dataset.key = p.key;
    el.innerHTML = `<div class="pdx-textlayer textLayer"></div><svg class="pdx-annots" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"></svg><span class="pdx-pgnum"></span>`;
    const sz = p.blank ? { view: [0, 0, p.blank.w, p.blank.h], rot0: 0 } : ((my.sizes[p.src] || [])[p.srcIndex] || (my.sizes[p.src] || [])[0] || { view: [0, 0, 595.28, 841.89], rot0: 0 });
    const ps = { key: p.key, src: p.src || 0, srcIndex: p.srcIndex, blank: p.blank || null, el, svg: el.querySelector('svg'), tl: el.querySelector('.pdx-textlayer'), view: sz.view, rot0: sz.rot0, exact: !!p.blank || !!((my.sizes[p.src] || [])[p.srcIndex]), proxy: null, canvas: null, task: null, renderedAt: 0, textRot: null, visible: false, thumb: null };
    my.ps.set(p.key, ps);
    if (my.io) my.io.observe(el);
    return ps;
  }
  function geom(my, ps) {
    const p = pageModel(my, ps.key) || {};
    const rot = norm360(ps.rot0 + (p.rotate || 0) + my.view.rotation);
    const rotChanged = ps.rotAll !== rot;
    ps.rotAll = rot;
    ps.vp1 = viewportOf(ps.view, rot, 1);
    const s = my.view.zoom * BASE;
    ps.el.style.width = Math.floor(ps.vp1.width * s) + 'px';
    ps.el.style.height = Math.floor(ps.vp1.height * s) + 'px';
    ps.el.style.setProperty('--scale-factor', s);
    ps.el.classList.toggle('pdx-blank', !!ps.blank);
    if (rotChanged) { A().render(my, ps); if (ps.textRot !== null && ps.textRot !== rot) { ps.tl.innerHTML = ''; ps.textRot = null; } ps.renderedAt = 0; }
  }
  function layoutAll(my) { for (const ps of my.ps.values()) geom(my, ps); if (!my.preview) { updateThumbs(my); } }
  /* le DOM suit le modèle : pages créées, retirées, réordonnées */
  function syncPages(my) {
    if (!my.io && !my.preview) setupObservers(my);
    const keys = new Set(my.model.pages.map(p => p.key));
    for (const [k, ps] of [...my.ps]) if (!keys.has(k)) { releasePage(ps); ps.el.remove(); if (ps.thumb) ps.thumb.remove(); if (my.io) my.io.unobserve(ps.el); my.ps.delete(k); }
    let prev = null;
    my.model.pages.forEach((p, i) => {
      let ps = my.ps.get(p.key);
      if (!ps) ps = createPS(my, p);
      ps.el.querySelector('.pdx-pgnum').textContent = String(i + 1);
      ps.el.setAttribute('aria-label', `Page ${i + 1}`);
      const want = prev ? prev.nextSibling : my.pagesEl.firstChild;
      if (ps.el !== want) my.pagesEl.insertBefore(ps.el, want);
      prev = ps.el;
      geom(my, ps);
      A().render(my, ps);
    });
    if (!my.preview) { syncThumbs(my); renderAnnotList(my); }
    const pgn = my.ov && my.ov.querySelector('.pdx-pgn'); if (pgn) pgn.textContent = String(my.model.pages.length);
    schedule(my);
  }
  function setupObservers(my) {
    my.io = new IntersectionObserver(entries => {
      for (const en of entries) {
        const ps = my.ps.get(en.target.dataset.key); if (!ps) continue;
        ps.visible = en.isIntersecting;
        if (!ps.visible) releasePage(ps);
      }
      schedule(my);
    }, { root: my.scroll, rootMargin: '120% 0px 120% 0px' });
    for (const ps of my.ps.values()) my.io.observe(ps.el);
    my.ro = new ResizeObserver(() => { if (my.view.mode !== 'free' && !my.ov.hidden) applyMode(my); });
    my.ro.observe(my.scroll);
  }
  function releasePage(ps) {
    if (ps.task) { try { ps.task.cancel(); } catch { /* */ } ps.task = null; }
    if (ps.textTask) { try { ps.textTask.cancel(); } catch { /* */ } ps.textTask = null; }
    if (ps.canvas) { ps.canvas.width = 0; ps.canvas.height = 0; ps.canvas.remove(); ps.canvas = null; }
    if (ps.tl && ps.textRot !== null) { ps.tl.innerHTML = ''; ps.textRot = null; }
    ps.renderedAt = 0;
  }
  async function getProxy(my, ps) {
    if (ps.blank) return null;
    if (ps.proxy) return ps.proxy;
    const pdf = my.docs[ps.src]; if (!pdf) return null;
    const pr = await pdf.getPage(ps.srcIndex + 1);
    ps.proxy = pr;
    if (!ps.exact || String(ps.view) !== String(pr.view) || ps.rot0 !== pr.rotate) { ps.view = pr.view.slice(); ps.rot0 = pr.rotate; ps.exact = true; ps.rotAll = null; geom(my, ps); checkOdd(my, ps.view); }
    return pr;
  }
  /* file de rendu : les pages visibles, la plus proche du centre d'abord, deux à la fois */
  function schedule(my) {
    if (!my.loaded && !my.preview) return;
    clearTimeout(my.schedTm);
    my.schedTm = setTimeout(() => pump(my), my.zooming ? 140 : 16);
  }
  let busy = 0;
  async function pump(my) {
    if (my.ov && my.ov.hidden && !my.preview) return;
    const sc = my.scroll.getBoundingClientRect(); const mid = sc.top + sc.height / 2;
    const want = [...my.ps.values()].filter(ps => ps.visible && ps.renderedAt !== my.view.zoom * 1000 + ps.rotAll && !ps.rendering)
      .sort((a, b) => Math.abs(a.el.getBoundingClientRect().top - mid) - Math.abs(b.el.getBoundingClientRect().top - mid));
    for (const ps of want) {
      if (busy >= 2) { setTimeout(() => pump(my), 60); return; }
      busy++; ps.rendering = true;
      renderPage(my, ps).catch(err => { if (!(err && err.name === 'RenderingCancelledException')) console.error(err); }).finally(() => { busy--; ps.rendering = false; });
    }
  }
  async function renderPage(my, ps) {
    const z = my.view.zoom, rot = ps.rotAll, stamp = z * 1000 + rot;
    if (ps.blank) { ps.renderedAt = stamp; return; }
    const pr = await getProxy(my, ps); if (!pr) return;
    if (!ps.visible) return;
    const s = z * BASE;
    const vp = pr.getViewport({ scale: s, rotation: rot });
    let dpr = canvasScale(vp.width, vp.height, Math.min(window.devicePixelRatio || 1, 2));   // 1.56.0 : ≤ 16 Mpx, même en dessous de 1 (le CSS étire)
    const cv = document.createElement('canvas'); cv.className = 'pdx-canvas';
    cv.width = Math.max(1, Math.floor(vp.width * dpr)); cv.height = Math.max(1, Math.floor(vp.height * dpr));
    const ctx = cv.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (ps.task) { try { ps.task.cancel(); } catch { /* */ } }
    const lib = window.pdfjsLib;
    const task = pr.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null, annotationMode: lib.AnnotationMode.ENABLE_STORAGE });
    ps.task = task;
    await task.promise;
    if (ps.task !== task) return;
    ps.task = null;
    if (!ps.visible) { cv.width = 0; return; }
    if (ps.canvas) { ps.canvas.width = 0; ps.canvas.remove(); }
    ps.el.insertBefore(cv, ps.el.firstChild); ps.canvas = cv;
    ps.renderedAt = stamp;
    if (ps.textRot !== rot) buildText(my, ps, pr, rot);
    if (!ps.nativeLoaded && !my.preview) loadNative(my, ps, pr);
  }
  /* 1.56.0 : facteur de rendu d'un canvas de w × h px CSS : jamais plus de MAX_PX pixels ni MAX_SIDE px de côté */
  function canvasScale(w, h, want) {
    let s = want; const area = Math.max(1, w * h);
    if (area * s * s > MAX_PX) s = Math.sqrt(MAX_PX / area);
    s = Math.min(s, MAX_SIDE / Math.max(1, w), MAX_SIDE / Math.max(1, h));
    return Math.max(1e-4, s);
  }
  /* notes déjà présentes dans le PDF (les nôtres une fois enregistrées, celles d'autres lecteurs) : pdf.js ne les
     dessine pas sans calque d'annotations HTML — on les montre en icône, lisibles au clic (texte brut uniquement) */
  async function loadNative(my, ps, pr) {
    ps.nativeLoaded = true;
    let list = []; try { list = await pr.getAnnotations({ intent: 'display' }); } catch { list = []; }
    const hex = c => (c && c.length >= 3 ? '#' + [...c].slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('') : '');
    ps.native = list.filter(a => a.subtype === 'Text' && Array.isArray(a.rect)).slice(0, 200).map(a => ({ rect: a.rect, text: String((a.contentsObj && a.contentsObj.str) || ''), title: String((a.titleObj && a.titleObj.str) || ''), color: hex(a.color) }));
    if (ps.native.length) A().render(my, ps);
  }
  function buildText(my, ps, pr, rot) {
    const lib = window.pdfjsLib; if (!lib || !lib.TextLayer) return;
    ps.tl.innerHTML = ''; ps.textRot = rot;
    const tl = new lib.TextLayer({ textContentSource: pr.streamTextContent({ includeMarkedContent: true, disableNormalization: true }), container: ps.tl, viewport: pr.getViewport({ scale: 1, rotation: rot }) });
    ps.textTask = tl;
    tl.render().then(() => { if (ps.textTask === tl) ps.textTask = null; ps.el.classList.add('has-text'); }).catch(() => {});
  }
  /* texte d'une page (cache par source et numéro) */
  async function pageText(my, ps) {
    if (ps.blank) return { items: [] };
    const k = ps.src + ':' + ps.srcIndex;
    if (my.textCache.has(k)) return my.textCache.get(k);
    const pr = await getProxy(my, ps); if (!pr) return { items: [] };
    const tc = await pr.getTextContent();
    const out = { items: tc.items.filter(it => typeof it.str === 'string') };
    my.textCache.set(k, out);
    return out;
  }
  const itemsText = items => items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim();

  /* ---------------- zoom et modes ---------------- */
  function maxDims(my) {
    let w = 0, h = 0;
    for (const ps of my.ps.values()) { if (!ps.vp1) continue; w = Math.max(w, ps.vp1.width); h = Math.max(h, ps.vp1.height); }
    return [w || 595, h || 842];
  }
  function applyMode(my) {
    if (my.view.mode === 'free' || !my.ps.size) { setZoom(my, my.view.zoom); return; }
    const sc = my.scroll; const cw = sc.clientWidth - (my.preview ? 24 : 48), ch = sc.clientHeight - 32;
    if (cw <= 0 || ch <= 0) return;
    const [w, h] = maxDims(my);
    let z = cw / (w * BASE);
    if (my.view.mode === 'page') z = Math.min(z, ch / (h * BASE));
    if (!my.preview) z = Math.min(z, 2.5);
    setZoom(my, Math.max(0.2, Math.min(3, Math.floor(z * 1000) / 1000)));
  }
  function setZoom(my, z) {
    z = Math.max(0.2, Math.min(4, z));
    const changed = Math.abs(z - my.view.zoom) > 0.0005;
    my.view.zoom = z;
    if (changed || !my.laidOut) { my.laidOut = true; for (const ps of my.ps.values()) geom(my, ps); my.zooming = true; clearTimeout(my.zTm); my.zTm = setTimeout(() => { my.zooming = false; schedule(my); }, 150); }
    if (!my.preview && ed === my && window.AlixoZoom && Math.abs(AlixoZoom.get(ZK) - z) > 0.004) AlixoZoom.set(ZK, z, { silent: true });
    if (!my.preview) { updateStatus(my); paintBar(my); }
    schedule(my);
  }
  function setMode(my, mode) { my.view.mode = mode; applyMode(my); paintBar(my); }
  if (window.AlixoZoom) AlixoZoom.onChange(ZK, z => { if (ed && !ed.ov.hidden) { ed.view.mode = 'free'; setZoom(ed, z); } });
  function stepZoom(my, dir) { if (window.AlixoZoom) { AlixoZoom.set(ZK, my.view.zoom, { silent: true }); AlixoZoom.step(ZK, dir); } }

  /* ---------------- page courante, défilement ---------------- */
  /* 1.56.0 : recherche dichotomique (les pages sont empilées dans l'ordre) : rapide même avec 3 000 pages */
  function currentIndex(my) {
    const P = my.model.pages; if (!P.length) return 0;
    const line = my.scroll.scrollTop + my.scroll.clientHeight / 3;
    let lo = 0, hi = P.length - 1, k = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; const ps = my.ps.get(P[mid].key); if (ps && ps.el.offsetTop <= line) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    return k;
  }
  function goTo(my, i, opts = {}) {
    i = Math.max(0, Math.min(my.model.pages.length - 1, i));
    const ps = my.ps.get(my.model.pages[i] && my.model.pages[i].key); if (!ps) return;
    const sc = my.scroll;
    let y = ps.el.offsetTop - 12;
    if (opts.pdfY != null && ps.vp1) { const [, py] = applyT(ps.vp1.transform, opts.pdfX || 0, opts.pdfY); y = ps.el.offsetTop + py * my.view.zoom * BASE - (opts.center ? sc.clientHeight / 2 : 40); }
    sc.scrollTo({ top: Math.max(0, y), behavior: opts.smooth === false ? 'auto' : 'smooth' });
    my.cur = i; updateStatus(my, i);
    if (my.ov && my.ov.classList.contains('pdx-present')) presentPill(my);
  }
  const applyT = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  /* ---------------- barre d'état, état d'enregistrement ---------------- */
  function updateStatus(my, idx) {
    if (my.preview || !my.ov) return;
    const i = idx != null ? idx : currentIndex(my); my.cur = i;
    const inp = my.ov.querySelector('.pdx-pgin'); if (inp && document.activeElement !== inp) inp.value = String(i + 1);
    const n = my.ov.querySelector('.pdx-pgn'); if (n) n.textContent = String(my.model.pages.length);
    const zi = my.ov.querySelector('.pdx-zinfo'); if (zi) zi.textContent = `${Math.round(my.view.zoom * 100)} %${my.view.mode === 'width' ? ' · largeur' : my.view.mode === 'page' ? ' · page entière' : ''}${my.view.rotation ? ` · tourné ${my.view.rotation}°` : ''}`;
    markThumb(my, i);
  }
  function setState(my, t) {
    my.stateTxt = t;
    const el = my.ov && my.ov.querySelector('.pdx-state');
    if (el) { el.textContent = t; el.dataset.st = /Échec|impossible/.test(t) ? 'error' : /non enregistr|Enregistrement…|Modifi/.test(t) ? 'dirty' : 'saved'; }
    if (ed !== my) return;
    const st = /Échec|impossible/.test(t) ? 'error' : /non enregistr|Enregistrement…|Modifi/.test(t) ? 'saving' : 'saved';
    if (window.AlixoSaveStatus) window.AlixoSaveStatus(st, t);
  }
  function setNote(my, t) { const el = my.ov.querySelector('.pdx-note'); if (el) { el.textContent = t; el.hidden = !t; } }
  const dirtyTxt = () => (isMobile() ? 'Modifié — non enregistré' : `Modifié — non enregistré (${kbd('Ctrl+S')})`);
  function markDirty(my, on) {
    if (my.dirty === on) { if (on) setState(my, dirtyTxt()); return; }
    my.dirty = on;
    setState(my, on ? dirtyTxt() : 'Enregistré');
    if (window.AlixoApp && AlixoApp.tabs && AlixoApp.tabs.isOpen(my.id)) AlixoApp.tabs.update(my.id, { title: my.name + (on ? ' •' : '') });
  }

  /* ============================================================
     Historique, modifications, brouillon
     ============================================================ */
  const snapJSON = my => JSON.stringify({ pages: my.model.pages, annots: my.model.annots, form: my.model.form, numbering: my.model.numbering, watermark: my.model.watermark });
  function snap(my) { my.hist.push(snapJSON(my)); if (my.hist.length > 100) my.hist.shift(); my.redo = []; }
  function restoreSnap(my, json) {
    const s = JSON.parse(json);
    const pagesChanged = JSON.stringify(s.pages) !== JSON.stringify(my.model.pages);
    Object.assign(my.model, s); my.sel = null;
    my.model.form = Object.assign(nullObj(), s.form); my.model.annots = Object.assign(nullObj(), s.annots);   // 1.56.0 : noms de champs venus du PDF
    if (pagesChanged) { for (const ps of my.ps.values()) ps.rotAll = null; syncPages(my); }
    else for (const ps of my.ps.values()) A().render(my, ps);
    syncFormStorage(my);
    afterChange(my, null);
  }
  function undo(my, dir) {
    if (my.readOnlyHard) return;
    const from = dir < 0 ? my.hist : my.redo, to = dir < 0 ? my.redo : my.hist;
    if (!from.length) { say(dir < 0 ? 'Rien à annuler' : 'Rien à rétablir', { duration: 1200 }); return; }
    to.push(snapJSON(my));
    restoreSnap(my, from.pop());
  }
  /* après toute modification : SVG des pages touchées, vignettes, liste, état, brouillon */
  function afterChange(my, keys, selOnly) {
    if (keys) for (const k of keys) { const ps = my.ps.get(k); if (ps) { A().render(my, ps); thumbAnnots(my, ps); } }
    if (selOnly) { for (const ps of my.ps.values()) A().render(my, ps); paintSelBar(my); return; }
    renderAnnotList(my); paintSelBar(my); paintBar(my);
    markDirty(my, true);
    clearTimeout(my.draftTm); my.draftTm = setTimeout(() => flushDraft(my), 1000);
    if (window.AlixoPdfAI && AlixoPdfAI.changed) AlixoPdfAI.changed(my);
  }
  function hooksOf(my) {
    return {
      snap: () => snap(my),
      changed: (keys, selOnly) => afterChange(my, keys, selOnly),
      selected: () => { for (const ps of my.ps.values()) if (ps.svg) A().render(my, ps); paintSelBar(my); },
      editText: (a, ps, isNew) => editText(my, a, ps, isNew),
      editNote: (a, ps, isNew) => openBubble(my, a, ps, isNew),
      placeImage: () => {},
      nativeNote: (n, ps) => openNative(my, n, ps),
      tool: t => setTool(my, t)
    };
  }
  const draftKey = my => 'pdfdraft:' + my.fileId;
  async function flushDraft(my) {
    clearTimeout(my.draftTm);
    if (!my.fileId || !my.dirty || !window.AlixoFiles || !AlixoFiles.aux) return;
    const f = AlixoFiles.byId(my.fileId);
    const pages = my.model.pages.filter(p => !p.src);   // les PDF fusionnés ne vont pas dans le brouillon
    const keys = new Set(pages.map(p => p.key));
    const model = JSON.parse(snapJSON(my)); model.pages = pages; model.annots = Object.fromEntries(Object.entries(model.annots).filter(([k]) => keys.has(k)));
    const images = {}; for (const [id, im] of Object.entries(my.images)) images[id] = { bytes: im.bytes, mime: im.mime, w: im.w, h: im.h };
    try { await AlixoFiles.aux.set(draftKey(my), { v: 1, model, images, merged: my.model.pages.length - pages.length, rev: f ? f.rev || 0 : 0, size: f ? f.size : 0, at: Date.now() }); }
    catch (e) { console.error('Brouillon PDF non enregistré :', e); }
  }
  async function maybeRestoreDraft(my) {
    if (!my.fileId || !window.AlixoFiles || !AlixoFiles.aux) return;
    let d = null; try { d = await AlixoFiles.aux.get(draftKey(my)); } catch { d = null; }
    if (!d || typeof d !== 'object' || !d.model || !Array.isArray(d.model.pages)) return;
    const f = AlixoFiles.byId(my.fileId);
    if (!f || (f.rev || 0) !== (d.rev || 0) || (d.size && f.size !== d.size)) { AlixoFiles.aux.del(draftKey(my)); say('Le PDF a changé depuis vos dernières modifications : le brouillon a été écarté', { duration: 6000 }); return; }
    const n = my.docs[0].numPages;
    /* 1.56.0 : le brouillon vient du stockage de l'appareil : relu avec validation avant tout usage */
    const images = sanitizeImages(d.images);
    const m = sanitizeModel(d.model, n, new Set(Object.keys(images)));
    if (!m || !m.pages.length) { AlixoFiles.aux.del(draftKey(my)); return; }
    /* 1.56.0 : trois issues ; le brouillon n'est supprimé que sur demande explicite (Échap, clic à côté = « Plus tard ») */
    const at = Number.isFinite(+d.at) ? new Date(+d.at) : null;
    const choice = await draftDialog(my, at);
    if (!eds.has(my.id)) return;
    if (choice === 'delete') { AlixoFiles.aux.del(draftKey(my)); return; }
    if (choice !== 'resume') { my.draftLater = true; return; }
    my.model = m;
    for (const [id, im] of Object.entries(images)) my.images[id] = Object.assign(im, { url: URL.createObjectURL(new Blob([im.bytes], { type: im.mime })) });
    my.dirty = true;
    const merged = Math.max(0, Math.min(MAX_PAGES, Math.round(+d.merged || 0)));
    if (merged) say(`${merged} page${merged > 1 ? 's' : ''} d’un PDF fusionné n’ont pas pu être reprises : fusionnez-le à nouveau`, { duration: 7000 });
    if (window.AlixoApp && AlixoApp.tabs && AlixoApp.tabs.isOpen(my.id)) AlixoApp.tabs.update(my.id, { title: my.name + ' •' });
  }
  function draftDialog(my, at) {
    return new Promise(resolve => {
      if (typeof openDialog !== 'function') { resolve(window.confirm('Reprendre vos modifications non enregistrées ?') ? 'resume' : 'later'); return; }
      let res = 'later';
      const when = at ? ` (${at.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})` : '';
      openDialog({ id: 'pdxdraft', cls: 'pdx-dlg', eyebrow: 'PDF', title: 'Reprendre vos modifications ?',
        body: `<p class="pdx-dtext">Des modifications de « ${escH(my.name)} » n’ont pas été enregistrées${escH(when)}. Vous pouvez les reprendre maintenant, ou ouvrir l’original et garder le brouillon pour plus tard.</p>`,
        foot: '<button class="cta ghost danger pdx-ddel" type="button" data-dr="delete">Supprimer le brouillon</button><span class="dlg-spacer"></span><button class="cta ghost" type="button" data-dr="later">Plus tard</button><button class="cta" type="button" data-dr="resume">Reprendre</button>',
        onMount(card, closeD) {
          card.addEventListener('click', e => { const b = e.target.closest('[data-dr]'); if (!b) return; res = b.dataset.dr; closeD(); });
          setTimeout(() => { const b = card.querySelector('[data-dr="resume"]'); if (b) b.focus({ preventScroll: true }); }, 40);
        },
        onClose() { resolve(res); } });
    });
  }
  /* 1.56.0 : validation d'un modèle relu (brouillon) : pages de la source 0 (ou vierges), annotations connues, formulaire
     en texte, numérotation et filigrane bornés. n : nombre de pages du PDF ; imgIds : images disponibles */
  const nullObj = () => Object.create(null);
  const finite = (v, d, lo, hi) => { const x = +v; return typeof v !== 'boolean' && v !== null && v !== '' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
  function sanitizeModel(src, n, imgIds) {
    if (!src || typeof src !== 'object' || !Array.isArray(src.pages)) return null;
    const pages = []; const keys = new Set();
    for (const p of src.pages.slice(0, MAX_PAGES)) {
      if (!p || typeof p !== 'object') continue;
      const key = typeof p.key === 'string' && /^[\w-]{1,40}$/.test(p.key) && !keys.has(p.key) ? p.key : 'k' + uidL();
      const rotate = norm360(finite(p.rotate, 0, -3600, 3600));
      if (p.blank && typeof p.blank === 'object') {
        const w = finite(p.blank.w, 0, 0, ODD_PT), h = finite(p.blank.h, 0, 0, ODD_PT); if (w < 1 || h < 1) continue;
        pages.push({ key, src: 0, srcIndex: -1, rotate, blank: { w, h } });
      } else {
        const i = +p.srcIndex; if ((p.src || 0) !== 0 || !Number.isInteger(i) || i < 0 || i >= n) continue;
        pages.push({ key, src: 0, srcIndex: i, rotate, blank: null });
      }
      keys.add(key);
    }
    const annots = nullObj();
    const A0 = src.annots && typeof src.annots === 'object' ? src.annots : {};
    for (const k of Object.keys(A0)) {
      if (!keys.has(k) || !Array.isArray(A0[k])) continue;
      const l = A0[k].slice(0, 5000).map(a => A().sanitizeAnnot(a, imgIds)).filter(Boolean);
      if (l.length) annots[k] = l;
    }
    const form = nullObj(); let nf = 0;
    const F0 = src.form && typeof src.form === 'object' ? src.form : {};
    for (const k of Object.keys(F0)) {
      if (nf >= 2000 || k.length > 300) continue;
      const v = F0[k];
      if (typeof v === 'boolean') form[k] = v; else if (typeof v === 'string') form[k] = v.slice(0, 10000); else continue;
      nf++;
    }
    let numbering = null; const nb = src.numbering;
    if (nb && typeof nb === 'object') numbering = { pos: ['bc', 'br', 'tr'].includes(nb.pos) ? nb.pos : 'bc', fmt: nb.fmt === 'n/N' ? 'n/N' : 'n', start: Math.round(finite(nb.start, 1, 0, 9999)), size: finite(nb.size, 10, 6, 24) };
    let watermark = null; const wm = src.watermark;
    if (wm && typeof wm === 'object' && typeof wm.text === 'string' && wm.text.trim()) watermark = { text: wm.text.slice(0, 60), opacity: finite(wm.opacity, 0.18, 0.05, 0.6), angle: finite(wm.angle, 45, -180, 180), color: A().isHex(wm.color) ? wm.color.toLowerCase() : '#c04343' };
    return { v: 1, pages, annots, form, numbering, watermark };
  }
  /* images d'un brouillon : PNG ou JPEG, 20 Mo au plus chacune, 200 au plus */
  function sanitizeImages(src) {
    const out = nullObj(); if (!src || typeof src !== 'object') return out;
    for (const id of Object.keys(src).slice(0, 200)) {
      const im = src[id]; if (!/^img[\w-]{1,40}$/.test(id) || !im || typeof im !== 'object') continue;
      const bytes = im.bytes instanceof Uint8Array ? im.bytes : im.bytes instanceof ArrayBuffer ? new Uint8Array(im.bytes) : null;
      if (!bytes || !bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) continue;
      const mime = im.mime === 'image/jpeg' ? 'image/jpeg' : im.mime === 'image/png' ? 'image/png' : null; if (!mime) continue;
      out[id] = { bytes, mime, w: finite(im.w, 1, 1, 1e5), h: finite(im.h, 1, 1, 1e5) };
    }
    return out;
  }

  /* ============================================================
     Barre d'outils
     ============================================================ */
  function barHTML(my) {
    const tip = (label, key) => `data-tip="${escH(label)}"${key ? ` data-kbd="${escH(key)}" aria-keyshortcuts="${escH(ariaKeys(key))}"` : ''} aria-label="${escH(label)}"`;
    const tb = (k, icon, extra = '') => `<button type="button" data-tool="${k}" ${tip(TOOL_NAMES[k], TOOL_KEYS[k])} aria-pressed="false" ${extra}>${icon}</button>`;
    const b = (k, label, icon, extra = '', key = '') => `<button type="button" data-pd="${k}" ${tip(label, key)} ${extra}>${icon}</button>`;
    return `<div class="pdx-grp">${b('side', 'Volet : vignettes, plan, recherche, annotations', I.side)}</div><span class="tb-sep"></span>
      <div class="pdx-grp pdx-tools">
        ${tb('select', I.select)}${tb('pen', I.pen)}${tb('hl', I.hl)}
        ${b('shapes', 'Formes : rectangle, ellipse, ligne, flèche', I.shapes, 'data-tgroup="shape" aria-haspopup="menu"')}
        ${tb('text', I.text)}${tb('note', I.note)}
        ${b('stamps', 'Tampon : VU, VALIDÉ, IMPORTANT, À REVOIR, date', I.stamp, 'data-tgroup="stamp" aria-haspopup="menu"')}
        ${b('image', 'Insérer une image', I.image)}${b('sig', 'Signature manuscrite (dessinée) — ce n’est pas une signature électronique certifiée', I.sig)}${tb('erase', I.erase)}
      </div><span class="tb-sep"></span>
      <div class="pdx-grp">${b('pages', 'Pages : numéroter, filigrane, fusionner, insérer…', `${I.pages}<span class="pdx-lbl">Pages</span>`, 'class="pdx-wide" aria-haspopup="menu"')}</div><span class="tb-sep"></span>
      <div class="pdx-grp pdx-view">
        ${window.AlixoZoom ? AlixoZoom.controlHTML(ZK) : ''}
        ${b('fit-width', 'Ajuster à la largeur', I.width)}${b('fit-page', 'Page entière', I.fitpage)}
        ${b('rotate-view', 'Faire pivoter l’affichage — le fichier n’est pas modifié', I.rotate, '', 'R')}
        ${b('night', 'Mode nuit : pages sombres pour lire le soir', I.night)}
        ${b('present', 'Présentation plein écran', I.present, '', 'F5')}
      </div><span class="tb-sep"></span>
      <div class="pdx-grp">${b('undo', 'Annuler', I.undo, '', 'Ctrl+Z')}${b('redo', 'Rétablir', I.redo, '', 'Ctrl+Y')}</div>
      <div class="pdx-acts">
        <button type="button" class="pdx-moreb" data-pd="more" aria-haspopup="menu" aria-label="Plus d’outils">${I.more}<span>Plus</span></button>
        ${window.AlixoPdfAI ? `<button type="button" class="pdx-aibtn" data-pd="ai" ${tip('Alixo AI : résumer, expliquer, traduire, quiz et fiche à partir de ce PDF (Alixo+)')}>${I.ai}<span>Alixo AI</span></button>` : ''}
        <button type="button" class="cta small pdx-save" data-pd="save" ${tip(my.readOnly ? 'Enregistrer une copie modifiable dans votre bibliothèque' : 'Enregistrer dans le PDF — les annotations deviennent partie du PDF', 'Ctrl+S')}>${I.save}<span>${my.readOnly ? 'Enregistrer une copie' : 'Enregistrer'}</span></button>
        ${b('download', 'Télécharger : PDF, page en image, texte', I.down, 'aria-haspopup="menu"')}
        ${b('print', 'Imprimer', I.print, '', 'Ctrl+P')}
      </div>`;
  }
  /* 1.56.0 : téléphone — « ⋯ Plus » réunit les outils masqués faute de place */
  function moreMenu(my, anchor) {
    const hasForm = !my.ov.querySelector('.pdx-stabs [data-pane="form"]').hidden;
    const lock = my.readOnlyHard ? ' disabled' : '';
    openMenu(anchor, `<button type="button" data-k="sig"${lock}>${I.sig}<span>Signature</span></button>
      <button type="button" data-k="stamps"${lock}>${I.stamp}<span>Tampon</span></button>
      <button type="button" data-k="image"${lock}>${I.image}<span>Image</span></button>
      <button type="button" data-k="shapes"${lock}>${I.shapes}<span>Formes</span></button>
      <button type="button" data-k="erase"${lock}>${I.erase}<span>Gomme</span></button>
      <button type="button" data-k="pages"${lock}>${I.pages}<span>Pages</span></button>
      ${hasForm ? `<button type="button" data-k="form">${I.form}<span>Remplir le formulaire</span></button>` : ''}
      ${window.AlixoPdfAI ? `<button type="button" data-k="ai">${I.ai}<span>Alixo AI</span></button>` : ''}
      <hr><button type="button" data-k="rotate-view">${I.rotate}<span>Tourner l’affichage</span></button>
      <button type="button" data-k="download">${I.down}<span>Télécharger</span></button>
      <button type="button" data-k="print">${I.print}<span>Imprimer</span></button>`, bt => {
      const k = bt.dataset.k;
      if (k === 'sig') signatureDialog(my);
      if (k === 'image') pickImage(my);
      if (k === 'erase') setTool(my, 'erase');
      if (k === 'form') { toggleSide(my, true); showPane(my, 'form'); }
      if (k === 'ai') { if (window.AlixoPdfAI) AlixoPdfAI.toggle(my); paintBar(my); }
      if (k === 'rotate-view') rotateView(my);
      if (k === 'print') print(my);
      /* sous-menus : rouverts sous le bouton « Plus » */
      if (k === 'stamps') setTimeout(() => stampsMenu(my, anchor), 0);
      if (k === 'shapes') setTimeout(() => shapesMenu(my, anchor), 0);
      if (k === 'pages') setTimeout(() => pagesMenu(my, anchor), 0);
      if (k === 'download') setTimeout(() => downloadMenu(my, anchor), 0);
    });
  }
  function paintBar(my) {
    const bar = my.ov && my.ov.querySelector('.pdx-bar'); if (!bar || !bar.firstElementChild) return;
    const t = my.view.tool;
    bar.querySelectorAll('[data-tool]').forEach(x => { const on = x.dataset.tool === t; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    const g = A().groupOf(t);
    bar.querySelectorAll('[data-tgroup]').forEach(x => x.classList.toggle('on', x.dataset.tgroup === g && (g !== 'shape' || ['rect', 'ellipse', 'line', 'arrow'].includes(t))));
    const sh = bar.querySelector('[data-pd="shapes"]'); if (sh && ['rect', 'ellipse', 'line', 'arrow'].includes(t)) sh.innerHTML = I[t];
    const set = (k, on) => { const x = bar.querySelector(`[data-pd="${k}"]`); if (x) x.classList.toggle('on', !!on); };
    const zp = bar.querySelector('.zoomctl .zpct'); if (zp) zp.textContent = Math.round(my.view.zoom * 100) + ' %';   // le contrôle commun s'arrête à 50 % ; l'ajustement peut descendre plus bas
    set('fit-width', my.view.mode === 'width'); set('fit-page', my.view.mode === 'page'); set('night', my.view.night); set('side', my.ov.classList.contains('side-open'));
    set('ai', !my.ov.querySelector('.pdx-aipanel').hidden);
    const dis = (k, v) => { const x = bar.querySelector(`[data-pd="${k}"]`); if (x) x.disabled = !!v; };
    dis('undo', !my.hist.length); dis('redo', !my.redo.length);
    bar.querySelectorAll('.pdx-tools button, [data-pd="pages"]').forEach(x => { if (x.dataset.tool !== 'select') { x.disabled = my.readOnlyHard; if (my.readOnlyHard) x.dataset.tipLock = '1'; else delete x.dataset.tipLock; } });
    const sv2 = bar.querySelector('[data-pd="save"]'); if (sv2) { sv2.disabled = my.readOnlyHard; sv2.classList.toggle('pulse', my.dirty); }
    checkOverflow(my);
  }
  /* 1.56.0 : barre plus large que la fenêtre → les actions (Enregistrer…) restent collées à droite, avec une ombre */
  function checkOverflow(my) { const bar = my.ov && my.ov.querySelector('.pdx-bar'); if (bar && !my.ov.hidden) bar.classList.toggle('pdx-overflow', bar.scrollWidth > bar.clientWidth + 1); }
  function setTool(my, t) {
    if (my.readOnlyHard && t !== 'select') { say('Ce PDF est verrouillé par son auteur : vous pouvez le lire, le rechercher et l’imprimer, mais pas le modifier.', { duration: 5000 }); return; }
    my.view.tool = t;
    my.ov.dataset.tool = t;
    if (t !== 'select') { my.sel = null; for (const ps of my.ps.values()) if (ps.svg) A().render(my, ps); hideSelPop(my); }
    paintBar(my); paintOpts(my); paintSelBar(my);
  }
  /* rangée d'options de l'outil (pastille flottante sous la barre) */
  function paintOpts(my) {
    const box = my.ov.querySelector('.pdx-opts'); const t = my.view.tool; const g = A().groupOf(t);
    /* 1.56.0 : tampon → rappel de ce que fait le clic */
    if (g === 'stamp') {
      const st = A().STAMPS.find(x => x[0] === A().opts.stamp.kind) || A().STAMPS[2];
      const label = st[0] === 'date' ? new Date().toLocaleDateString('fr-FR') : st[1];
      box.innerHTML = `<span class="pdx-otitle">Tampon</span><span class="pdx-ohint pdx-ostamp">Cliquez sur la page pour poser « ${escH(label)} » · Échap pour arrêter</span>`;
      box.hidden = false; return;
    }
    if (!g || g === 'note') { box.hidden = true; box.innerHTML = ''; return; }
    const o = A().opts[g];
    const pal = (g === 'hl' ? A().HL_PALETTE : A().PALETTE).map(c => `<button type="button" class="pdx-sw${o.c === c ? ' on' : ''}" data-opt="c" data-v="${escH(c)}" style="--c:${escH(c)}" title="${escH(cname(c))}" aria-label="${escH(cname(c))}" aria-pressed="${o.c === c}"></button>`).join('');
    let extra = '';
    if (g === 'pen' || g === 'hl') extra = `<label class="pdx-ol">Épaisseur <input type="range" data-opt="w" min="${g === 'hl' ? 6 : 0.5}" max="${g === 'hl' ? 30 : 12}" step="0.5" value="${+o.w}"></label><span class="pdx-oprev" style="--w:${Math.min(22, +o.w * (g === 'hl' ? 1 : 1.6))}px;--c:${escH(o.c)};--a:${g === 'hl' ? 0.45 : 1}"></span>`;
    if (g === 'shape') extra = `<label class="pdx-ol">Trait <input type="range" data-opt="sw" min="0.5" max="10" step="0.5" value="${+o.sw}"></label><label class="pdx-ol pdx-chk"><input type="checkbox" data-opt="fill" ${o.fill ? 'checked' : ''}> Remplir</label>`;
    if (g === 'text') extra = `<select data-opt="font" aria-label="Police"><option value="helv"${o.font === 'helv' ? ' selected' : ''}>Helvetica</option><option value="times"${o.font === 'times' ? ' selected' : ''}>Times</option><option value="cour"${o.font === 'cour' ? ' selected' : ''}>Courier</option></select>
      <select data-opt="size" aria-label="Taille">${[9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48].map(s => `<option value="${s}"${+o.size === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
      <button type="button" class="pdx-ob${o.bold ? ' on' : ''}" data-opt="bold" title="Gras" aria-label="Gras" aria-pressed="${!!o.bold}"><b>G</b></button>`;
    const hint = { pen: 'Dessinez sur la page', hl: 'Passez sur les lignes à surligner', shape: 'Glissez pour tracer (Maj : proportions)', text: 'Cliquez où écrire' }[g] || '';
    box.innerHTML = `<span class="pdx-otitle">${escH((TOOL_NAMES[t] || '').replace(/ \(.*\)$/, '').replace(/ :.*/, ''))}</span><div class="pdx-swatches">${pal}</div>${extra}<span class="pdx-ohint">${hint}</span>`;
    box.hidden = false;
  }
  /* mini-barre de l'annotation sélectionnée (couleur, dupliquer, supprimer) */
  function paintSelBar(my) {
    let bar = my.ov.querySelector('.pdx-selbar');
    const a = my.sel && A().findAnnot(my, my.sel.key, my.sel.id);
    const ps = a && my.ps.get(my.sel.key);
    if (!a || !ps || !ps.svg || !ps.vp1 || my.bubble) { if (bar) bar.hidden = true; return; }   // 1.56.0 : pas par-dessus une note ouverte
    if (!bar) { bar = document.createElement('div'); bar.className = 'pdx-selbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Annotation sélectionnée'); my.ov.appendChild(bar); }
    const pal = (a.t === 'hl' || a.t === 'texthl' ? A().HL_PALETTE : A().PALETTE).slice(0, 8);
    bar.innerHTML = `${pal.map(c => `<button type="button" class="pdx-sw${a.c === c ? ' on' : ''}" data-sel="color" data-v="${escH(c)}" style="--c:${escH(c)}" title="${escH(cname(c))}" aria-label="${escH(cname(c))}" aria-pressed="${a.c === c}"></button>`).join('')}<span class="pdx-ssep"></span>
      ${a.t === 'text' || a.t === 'note' ? `<button type="button" data-sel="edit" title="Modifier le texte" aria-label="Modifier le texte">${I.text}</button>` : ''}
      <button type="button" data-sel="dup" title="Dupliquer (${kbd('Ctrl+D')})" aria-label="Dupliquer" aria-keyshortcuts="${ariaKeys('Ctrl+D')}">${I.dup}</button><button type="button" data-sel="del" class="danger" title="Supprimer (Suppr)" aria-label="Supprimer" aria-keyshortcuts="Delete">${I.trash}</button>`;
    bar.hidden = false;
    const b = A().bbox(a);
    const r = ps.svg.getBoundingClientRect(); const k = r.width / ps.vp1.width;
    const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => applyT(ps.vp1.transform, x, y));
    const top = Math.min(...corners.map(c => c[1])) * k + r.top, left = Math.min(...corners.map(c => c[0])) * k + r.left;
    const bw = bar.offsetWidth || 260;
    bar.style.left = Math.max(8, Math.min(innerWidth - bw - 8, left)) + 'px';
    bar.style.top = Math.max(110, top - 46) + 'px';
  }

  /* ---------------- édition d'un texte, bulles des notes ---------------- */
  function editText(my, a, ps, isNew) {
    closeBubble(my);
    const ta = document.createElement('textarea'); ta.className = 'pdx-tedit'; ta.value = a.text || ''; ta.setAttribute('aria-label', 'Texte de l’annotation');
    const [x, y] = A().toEl(ps, a.x, a.y);
    const k = ps.svg.getBoundingClientRect().width / ps.vp1.width;
    ta.style.left = x + 'px'; ta.style.top = y + 'px';
    ta.style.font = `${a.bold ? 700 : 400} ${a.size * k}px/${1.2} ${A().FONTS[a.font] || A().FONTS.helv}`; ta.style.color = a.c;
    ps.el.appendChild(ta);
    const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.style.width = 'auto'; ta.style.width = Math.max(120, ta.scrollWidth + 12) + 'px'; };
    fit(); ta.addEventListener('input', fit);
    let done = false;
    const commit = () => {
      if (done) return; done = true; const v = ta.value.replace(/\s+$/, ''); ta.remove();
      if (isNew) { if (v) A().addAnnot(my, ps.key, Object.assign(a, { text: v })); setTool(my, 'select'); return; }
      if (v === a.text) return;
      if (!v) { A().removeAnnot(my, ps.key, a.id); return; }
      snap(my); a.text = v; afterChange(my, [ps.key]);
    };
    ta.addEventListener('blur', commit);
    ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); ta.blur(); } });
    ta.addEventListener('pointerdown', e => e.stopPropagation());
    ta.focus({ preventScroll: true }); setTimeout(() => { if (ta.isConnected && document.activeElement !== ta) ta.focus({ preventScroll: true }); }, 0);
  }
  function openBubble(my, a, ps, isNew) {
    closeBubble(my);
    const bub = document.createElement('div'); bub.className = 'pdx-bubble'; bub.setAttribute('role', 'dialog'); bub.setAttribute('aria-label', 'Note');
    bub.innerHTML = `<div class="pdx-bhead"><span class="pdx-bdot" style="--c:${escH(a.c)}"></span><b>Note</b><span class="pdx-sflex"></span><button type="button" data-b="del" title="Supprimer la note" aria-label="Supprimer la note">${I.trash}</button><button type="button" data-b="close" title="Fermer" aria-label="Fermer">${I.close}</button></div><textarea placeholder="Écrivez votre note…" aria-label="Texte de la note"></textarea><div class="pdx-bfoot">La note reste une note dans le PDF : elle s’ouvre dans tous les lecteurs.</div>`;
    const ta = bub.querySelector('textarea'); ta.value = a.text || '';
    const [x, y] = A().toEl(ps, a.x + 20, a.y + 20);
    bub.style.left = Math.min(x + 6, ps.el.clientWidth - 250) + 'px'; bub.style.top = Math.max(4, y) + 'px';
    ps.el.appendChild(bub);
    let snapped = false;
    ta.addEventListener('input', () => { if (!snapped && !isNew) { snap(my); snapped = true; } a.text = ta.value; markDirty(my, true); clearTimeout(my.draftTm); my.draftTm = setTimeout(() => { renderAnnotList(my); flushDraft(my); }, 600); });
    bub.addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (!b) return; if (b.dataset.b === 'del') { closeBubble(my); A().removeAnnot(my, ps.key, a.id); } else closeBubble(my); });
    bub.addEventListener('pointerdown', e => e.stopPropagation());
    bub.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); closeBubble(my); my.scroll.focus({ preventScroll: true }); } });
    my.bubble = { el: bub, a, ps, isNew };
    ta.focus({ preventScroll: true }); setTimeout(() => { if (my.bubble && my.bubble.el === bub && document.activeElement !== ta) ta.focus({ preventScroll: true }); }, 0);
  }
  function openNative(my, n, ps) {
    closeBubble(my);
    const bub = document.createElement('div'); bub.className = 'pdx-bubble pdx-bro'; bub.setAttribute('role', 'dialog'); bub.setAttribute('aria-label', 'Note du PDF');
    bub.innerHTML = `<div class="pdx-bhead"><span class="pdx-bdot"></span><b></b><span class="pdx-sflex"></span><button type="button" data-b="close" title="Fermer" aria-label="Fermer">${I.close}</button></div><div class="pdx-btext"></div><div class="pdx-bfoot">Note enregistrée dans le PDF (lecture seule).</div>`;
    bub.querySelector('.pdx-bdot').style.setProperty('--c', n.color || '#f2c94c');
    bub.querySelector('b').textContent = n.title || 'Note';
    bub.querySelector('.pdx-btext').textContent = n.text || '(note vide)';
    const [x, y] = A().toEl(ps, n.rect[0] + 20, n.rect[1] + 20);
    bub.style.left = Math.min(x + 6, ps.el.clientWidth - 250) + 'px'; bub.style.top = Math.max(4, y) + 'px';
    ps.el.appendChild(bub);
    bub.addEventListener('click', e => { if (e.target.closest('[data-b]')) closeBubble(my); });
    bub.addEventListener('pointerdown', e => e.stopPropagation());
    my.bubble = { el: bub, a: { text: 'x' }, ps, isNew: false, ro: true };
  }
  function closeBubble(my) {
    if (!my || !my.bubble) return;
    const { el, a, ps, isNew } = my.bubble; my.bubble = null; el.remove();
    if (isNew && !String(a.text || '').trim()) { const l = my.model.annots[ps.key] || []; const i = l.indexOf(a); if (i >= 0) { l.splice(i, 1); if (!l.length) delete my.model.annots[ps.key]; my.hist.pop(); my.sel = null; A().render(my, ps); renderAnnotList(my); if (!my.hist.length && !my.redo.length) markDirty(my, false); } }
    else renderAnnotList(my);
  }

  /* ---------------- images et signature ---------------- */
  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const uerr = m => Object.assign(new Error(m), { user: true });
      if (!file || !/^image\//.test(file.type || '') || /svg/i.test(file.type)) { reject(uerr('Choisissez une image PNG, JPEG, WebP ou GIF')); return; }
      if (file.size > 15 * 1024 * 1024) { reject(uerr('Image trop lourde (15 Mo au plus)')); return; }
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = async () => {
        try {
          let bytes, mime = file.type;
          const big = img.naturalWidth * img.naturalHeight > 9e6;
          if (big || !/png|jpe?g/i.test(mime)) {   // autres formats (et très grandes images) → PNG / JPEG redimensionné par canvas
            const sc = big ? Math.sqrt(9e6 / (img.naturalWidth * img.naturalHeight)) : 1;
            const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            mime = /jpe?g/i.test(mime) ? 'image/jpeg' : 'image/png';
            const blob = await new Promise(r => cv.toBlob(r, mime, 0.9)); bytes = new Uint8Array(await blob.arrayBuffer());
          } else bytes = new Uint8Array(await file.arrayBuffer());
          resolve({ bytes, mime: /jpe?g/i.test(mime) ? 'image/jpeg' : 'image/png', w: img.naturalWidth, h: img.naturalHeight });
        } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(uerr('Image illisible')); };
      img.src = url;
    });
  }
  function addImage(my, im, opts = {}) {
    const id = 'img' + uidL();
    my.images[id] = Object.assign({}, im, { url: URL.createObjectURL(new Blob([im.bytes], { type: im.mime })) });
    const p = my.model.pages[my.cur] || my.model.pages[0]; const ps = my.ps.get(p.key); if (!ps) return;
    const [x0, y0, x1, y1] = ps.view; const pw = x1 - x0, ph = y1 - y0;
    let w = opts.sig ? Math.min(180, pw * 0.32) : pw * 0.5; let h = w * im.h / im.w;
    if (h > ph * 0.6) { h = ph * 0.6; w = h * im.w / im.h; }
    const x = opts.sig ? x1 - w - 48 : x0 + (pw - w) / 2, y = opts.sig ? y0 + 70 : y0 + (ph - h) / 2;
    A().addAnnot(my, p.key, { id: A().rid(), t: 'image', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), img: id, sig: !!opts.sig, ratio: im.w / im.h });
    setTool(my, 'select');
  }
  function pickImage(my) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
    inp.addEventListener('change', async () => { const f = inp.files && inp.files[0]; if (!f) return; try { addImage(my, await loadImageFile(f)); } catch (e) { if (!(e && e.user)) console.error(e); say(e && e.user ? e.message : 'Image illisible'); } });
    inp.click();
  }
  const SIGS_LS = 'alixo.pdf.sigs';
  /* 1.56.0 : le stockage local peut avoir été modifié : seules des images PNG en base64 strict (≤ 2 Mo) sont reprises */
  const SIG_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
  const savedSigs = () => { try { const l = JSON.parse(localStorage.getItem(SIGS_LS)); return Array.isArray(l) ? l.filter(s => typeof s === 'string' && s.length < 2.8e6 && SIG_RE.test(s)).slice(0, 3) : []; } catch { return []; } };
  function signatureDialog(my) {
    if (typeof openDialog !== 'function') return;
    const sigs = savedSigs();
    openDialog({ id: 'pdxsig', cls: 'pdx-dlg pdx-sigdlg', eyebrow: escH(my.name), title: 'Signature',
      sub: 'Signez avec la souris, le pavé tactile ou le doigt ; la signature est posée sur la page affichée, puis se déplace et se redimensionne. C’est une signature manuscrite (dessinée), pas une signature électronique certifiée.',
      body: `${sigs.length ? `<div class="pdx-sigsaved"><span>Signatures mémorisées :</span>${sigs.map((s, i) => `<button type="button" class="pdx-sigitem" data-sig="${i}" title="Utiliser cette signature"><img src="${escH(s)}" alt="Signature ${i + 1}"></button><button type="button" class="pdx-sigdel" data-sigdel="${i}" title="Oublier cette signature" aria-label="Oublier cette signature">${I.close}</button>`).join('')}</div>` : ''}
        <div class="pdx-sigpad"><canvas width="1200" height="400" aria-label="Zone de signature"></canvas><span class="pdx-sigline"></span><span class="pdx-sighint">Signez ici</span></div>
        <div class="pdx-sigopts"><span class="pdx-swatches">${['#1f1f1f', '#1d3f8f', '#0b6b3a'].map((c, i) => `<button type="button" class="pdx-sw pdx-sigsw${i ? '' : ' on'}" data-sigc="${c}" style="--c:${c}" title="Encre ${escH(cname(c).toLowerCase())}" aria-label="Encre ${escH(cname(c).toLowerCase())}" aria-pressed="${!i}"></button>`).join('')}</span><label class="pdx-chk"><input type="checkbox" class="pdx-sigkeep"> Mémoriser sur cet appareil (3 au plus)</label></div>`,
      foot: '<button class="cta ghost" type="button" data-sg="clear">Effacer</button><span class="dlg-spacer"></span><button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" type="button" data-sg="use">Poser la signature</button>',
      onMount(card, closeD) {
        const cv = card.querySelector('canvas'); const ctx = cv.getContext('2d'); let ink = '#1f1f1f', drawn = false, last = null;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 5;
        const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
        cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); last = pt(e); drawn = true; card.querySelector('.pdx-sighint').hidden = true; ctx.strokeStyle = ink; ctx.beginPath(); ctx.arc(last[0], last[1], 2.5, 0, 7); ctx.fillStyle = ink; ctx.fill(); });
        cv.addEventListener('pointermove', e => { if (!last) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; });
        const up = () => { last = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
        const useUrl = async url => { const blob = await (await fetch(url)).blob(); const bytes = new Uint8Array(await blob.arrayBuffer()); const img = new Image(); img.src = url; await img.decode(); closeD(); addImage(my, { bytes, mime: 'image/png', w: img.naturalWidth, h: img.naturalHeight }, { sig: true }); };
        card.addEventListener('click', async e => {
          const c = e.target.closest('[data-sigc]'); if (c) { ink = c.dataset.sigc; card.querySelectorAll('[data-sigc]').forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', String(x === c)); }); return; }
          const s = e.target.closest('[data-sig]'); if (s) { useUrl(sigs[+s.dataset.sig]); return; }
          const d = e.target.closest('[data-sigdel]'); if (d) { const l = savedSigs(); l.splice(+d.dataset.sigdel, 1); try { localStorage.setItem(SIGS_LS, JSON.stringify(l)); } catch { /* */ } closeD(); signatureDialog(my); return; }
          const b = e.target.closest('[data-sg]'); if (!b) return;
          if (b.dataset.sg === 'clear') { ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; card.querySelector('.pdx-sighint').hidden = false; return; }
          if (!drawn) { say('Signez d’abord dans le cadre'); return; }
          // recadrage sur le tracé
          const data = ctx.getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
          for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) if (data[(y * cv.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          const pad = 8; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(cv.width, x1 + pad); y1 = Math.min(cv.height, y1 + pad);
          const out = document.createElement('canvas'); out.width = Math.max(2, x1 - x0); out.height = Math.max(2, y1 - y0);
          out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
          const url = out.toDataURL('image/png');
          if (card.querySelector('.pdx-sigkeep').checked) { const l = [url, ...savedSigs()].slice(0, 3); try { localStorage.setItem(SIGS_LS, JSON.stringify(l)); } catch { say('Signature non mémorisée (stockage plein)'); } }
          useUrl(url);
        });
      } });
  }

  /* ============================================================
     Volet de gauche : vignettes, plan, recherche, annotations, formulaire
     ============================================================ */
  function toggleSide(my, on) {
    on = on === undefined ? !my.ov.classList.contains('side-open') : on;
    try { localStorage.setItem(SIDE_LS, on ? '1' : '0'); } catch { /* */ }
    for (const e of eds.values()) e.ov.classList.toggle('side-open', on);
    paintBar(my);
    setTimeout(() => { if (my.view.mode !== 'free') applyMode(my); syncThumbs(my); }, 260);
  }
  function showPane(my, pane) {
    my.ov.querySelectorAll('.pdx-stabs [data-pane]').forEach(b => { const on = b.dataset.pane === pane; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    my.ov.querySelectorAll('.pdx-spane').forEach(p => { p.hidden = p.dataset.pane !== pane; });
    my.pane = pane;
    if (pane === 'thumbs') syncThumbs(my);
    if (pane === 'annots') renderAnnotList(my);
  }
  /* --- vignettes --- */
  function syncThumbs(my) {
    const box = my.ov.querySelector('.pdx-thumbs'); if (!box) return;
    /* 1.56.0 : vignettes créées seulement quand le volet les montre (un PDF de 3 000 pages ne crée rien d'avance) */
    if (!my.ov.classList.contains('side-open') || (my.pane && my.pane !== 'thumbs')) { my.thumbsStale = true; return; }
    my.thumbsStale = false;
    if (!my.tio) my.tio = new IntersectionObserver(en => { for (const e of en) if (e.isIntersecting) { const ps = my.ps.get(e.target.dataset.key); if (ps) queueThumb(my, ps); } }, { root: box.parentElement, rootMargin: '200px 0px' });
    let prev = null;
    my.model.pages.forEach((p, i) => {
      const ps = my.ps.get(p.key); if (!ps) return;
      if (!ps.thumb) {
        /* 1.56.0 : liste de pages accessible (listbox / option) ; le menu ⋯ s'ouvre aussi au clavier (Maj+F10, touche Menu) */
        const t = document.createElement('div'); t.className = 'pdx-thumb'; t.dataset.key = p.key; t.draggable = !my.readOnlyHard; t.tabIndex = -1; t.setAttribute('role', 'option'); t.setAttribute('aria-selected', 'false');
        t.innerHTML = `<div class="pdx-tbox"><svg class="pdx-tsvg" preserveAspectRatio="none"></svg></div><span class="pdx-tn" aria-hidden="true"></span><button type="button" class="pdx-tmenu" data-tmenu="1" tabindex="-1" title="Page : déplacer, tourner, dupliquer, supprimer… (Maj+F10)" aria-label="Actions de la page">${I.more}</button>`;
        ps.thumb = t; my.tio.observe(t);
      }
      ps.thumb.querySelector('.pdx-tn').textContent = String(i + 1);
      ps.thumb.setAttribute('aria-label', `Page ${i + 1}`); ps.thumb.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown Shift+F10');
      const want = prev ? prev.nextSibling : box.firstChild;
      if (ps.thumb !== want) box.insertBefore(ps.thumb, want);
      prev = ps.thumb;
      sizeThumb(my, ps);
    });
    markThumb(my, my.cur);
  }
  /* les vignettes suivent la rotation des pages (écrite), pas la rotation d'affichage */
  const thumbRotOf = (my, ps) => norm360(ps.rot0 + ((pageModel(my, ps.key) || {}).rotate || 0));
  function sizeThumb(my, ps) {
    if (!ps.thumb || !ps.view) return;
    const rot = thumbRotOf(my, ps); ps.tvp = viewportOf(ps.view, rot, 1);
    const tbox = ps.thumb.querySelector('.pdx-tbox'); let W = ps.tvp.width >= ps.tvp.height ? 150 : 132;
    let h = Math.max(4, Math.round(W * ps.tvp.height / Math.max(1, ps.tvp.width)));
    if (h > 220) { W = Math.max(4, Math.round(W * 220 / h)); h = 220; }   // 1.56.0 : page très allongée → vignette bornée
    tbox.style.width = W + 'px'; tbox.style.height = h + 'px';
    if (ps.thumbRot !== rot && ps.thumbDone) { ps.thumbDone = false; queueThumb(my, ps); }
    thumbAnnots(my, ps);
  }
  function updateThumbs(my) { for (const ps of my.ps.values()) sizeThumb(my, ps); }
  function thumbAnnots(my, ps) {
    if (!ps.thumb || !ps.tvp) return;
    const svg = ps.thumb.querySelector('.pdx-tsvg');
    const list = my.model.annots[ps.key] || [];
    svg.setAttribute('viewBox', `0 0 ${ps.tvp.width} ${ps.tvp.height}`);
    svg.innerHTML = list.length ? `<g transform="matrix(${ps.tvp.transform.join(' ')})">${list.map(a => A().shapeSVG(a, my.images, true)).join('')}</g>` : '';
  }
  let thumbBusy = false; const thumbQ = [];
  function queueThumb(my, ps) { if (ps.thumbDone || ps.thumbQueued) return; ps.thumbQueued = true; thumbQ.push([my, ps]); pumpThumbs(); }
  async function pumpThumbs() {
    if (thumbBusy) return; thumbBusy = true;
    while (thumbQ.length) {
      const [my, ps] = thumbQ.shift(); ps.thumbQueued = false;
      if (!eds.has(my.id) || !ps.thumb || !ps.thumb.isConnected) continue;
      try {
        const tbox = ps.thumb.querySelector('.pdx-tbox');
        const old = tbox.querySelector('canvas'); if (old) { old.width = 0; old.remove(); }
        const rot = thumbRotOf(my, ps);
        if (!ps.blank) {
          const pr = await getProxy(my, ps); if (!pr) continue;
          const vp0 = pr.getViewport({ scale: 1, rotation: rot }); const sc = Math.min(264 / vp0.width, 400 / vp0.height);
          const vp = pr.getViewport({ scale: sc, rotation: rot });
          const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.floor(vp.width)); cv.height = Math.max(1, Math.floor(vp.height));
          const ctx = cv.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
          await pr.render({ canvasContext: ctx, viewport: vp, annotationMode: window.pdfjsLib.AnnotationMode.ENABLE_STORAGE }).promise;
          tbox.insertBefore(cv, tbox.firstChild);
        }
        ps.thumbDone = true; ps.thumbRot = rot;
      } catch (e) { if (!(e && e.name === 'RenderingCancelledException')) console.warn('Vignette :', e && e.message); }
    }
    thumbBusy = false;
  }
  function markThumb(my, i) {
    const p = my.model.pages[i]; if (!p) return;
    my.ov.querySelectorAll('.pdx-thumb.cur').forEach(t => { if (t.dataset.key !== p.key) { t.classList.remove('cur'); t.setAttribute('aria-selected', 'false'); t.tabIndex = -1; } });
    const ps = my.ps.get(p.key); if (!ps || !ps.thumb) return;
    if (!ps.thumb.classList.contains('cur')) {
      ps.thumb.classList.add('cur'); ps.thumb.setAttribute('aria-selected', 'true'); ps.thumb.tabIndex = 0;
      const box = my.ov.querySelector('.pdx-spane[data-pane="thumbs"]');
      if (box && !box.hidden) { const r = ps.thumb.getBoundingClientRect(), b = box.getBoundingClientRect(); if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - b.height / 3; }
    }
  }
  /* --- opérations sur les pages (toutes annulables) --- */
  const idxOf = (my, key) => my.model.pages.findIndex(p => p.key === key);
  function pageOp(my, key, op) {
    if (my.readOnlyHard) return;
    const i = idxOf(my, key); if (i < 0) return;
    const p = my.model.pages[i];
    if (op === 'delete' && my.model.pages.length <= 1) { say('Le PDF doit garder au moins une page'); return; }
    snap(my);
    if (op === 'rot+') p.rotate = norm360((p.rotate || 0) + 90);
    if (op === 'rot-') p.rotate = norm360((p.rotate || 0) - 90);
    if (op === 'delete') { my.model.pages.splice(i, 1); delete my.model.annots[key]; }
    if (op === 'dup') { const c = JSON.parse(JSON.stringify(p)); c.key = 'k' + uidL(); my.model.pages.splice(i + 1, 0, c); if (my.model.annots[key]) my.model.annots[c.key] = JSON.parse(JSON.stringify(my.model.annots[key])).map(a => Object.assign(a, { id: A().rid() })); }
    if (op === 'blank-before' || op === 'blank-after') { const ps = my.ps.get(key); const [x0, y0, x1, y1] = ps ? ps.view : [0, 0, 595.28, 841.89]; my.model.pages.splice(i + (op === 'blank-after' ? 1 : 0), 0, { key: 'k' + uidL(), src: 0, srcIndex: -1, rotate: 0, blank: { w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) } }); }
    if (op === 'rot+' || op === 'rot-') { const ps = my.ps.get(key); if (ps) { ps.thumbDone = false; } }
    syncPages(my);
    if (op === 'rot+' || op === 'rot-') { const ps = my.ps.get(key); if (ps) queueThumb(my, ps); }
    afterChange(my, null);
    say({ 'rot+': 'Page tournée', 'rot-': 'Page tournée', delete: `Page ${i + 1} supprimée (${kbd('Ctrl+Z')} pour annuler)`, dup: 'Page dupliquée', 'blank-before': 'Page vierge insérée', 'blank-after': 'Page vierge insérée' }[op], { duration: 1800 });
  }
  function movePage(my, key, to) {
    const i = idxOf(my, key); if (i < 0 || to === i || to === i + 1 || my.readOnlyHard) return;
    snap(my);
    const [p] = my.model.pages.splice(i, 1); my.model.pages.splice(to > i ? to - 1 : to, 0, p);
    syncPages(my); afterChange(my, null);
  }
  /* 1.56.0 : déplacer une page d'une place (menu ⋯, Alt+↑ / Alt+↓ sur la vignette) */
  function stepPage(my, key, dir) {
    if (my.readOnlyHard) return;
    const i = idxOf(my, key); const j = i + dir; if (i < 0 || j < 0 || j >= my.model.pages.length) return;
    movePage(my, key, dir < 0 ? j : j + 1);
    say(`Page déplacée en position ${j + 1}`, { duration: 1500 });
    my.cur = j; updateStatus(my, j);
    const ps = my.ps.get(key); if (ps && ps.thumb) ps.thumb.focus({ preventScroll: false });
  }
  function thumbMenu(my, key, anchor) {
    const i = idxOf(my, key);
    const n = my.model.pages.length;
    openMenu(anchor, `<div class="pdx-mtitle">Page ${i + 1}</div>
      <button type="button" data-tm="up"${i === 0 ? ' disabled' : ''}>${I.up}<span>Monter d’une place</span><kbd>Alt+↑</kbd></button>
      <button type="button" data-tm="down"${i >= n - 1 ? ' disabled' : ''}>${I.dn}<span>Descendre d’une place</span><kbd>Alt+↓</kbd></button>
      <button type="button" data-tm="rot+">${I.rotate}<span>Tourner à droite</span></button>
      <button type="button" data-tm="rot-">${I.rotl}<span>Tourner à gauche</span></button>
      <button type="button" data-tm="dup">${I.dup}<span>Dupliquer</span></button>
      <button type="button" data-tm="blank-before">${I.plus}<span>Insérer une page vierge avant</span></button>
      <button type="button" data-tm="blank-after">${I.plus}<span>Insérer une page vierge après</span></button>
      <button type="button" data-tm="extract">${I.extract}<span>Extraire cette page (PDF)</span></button>
      <hr><button type="button" data-tm="delete" class="danger">${I.trash}<span>Supprimer la page</span></button>`, b => {
      const op = b.dataset.tm; if (!op) return;
      if (op === 'extract') { extractPages(my, [key]); return; }
      if (op === 'up' || op === 'down') { stepPage(my, key, op === 'up' ? -1 : 1); return; }
      pageOp(my, key, op);
    });
  }
  /* --- plan --- */
  async function renderOutline(my) {
    const nav = my.ov.querySelector('.pdx-outline'); if (!nav) return;
    let ol = null; try { ol = await my.docs[0].getOutline(); } catch { ol = null; }
    if (!ol || !ol.length) { nav.innerHTML = '<div class="pt-empty">Ce PDF n’a pas de plan (signets). Utilisez les vignettes ou la recherche.</div>'; return; }
    my.outline = []; const rows = [];
    const walk = (items, lv) => { for (const it of items) { if (rows.length > 800) return; const k = my.outline.length; my.outline.push(it); rows.push(`<button type="button" class="pt-item pl${Math.min(6, lv)}" data-ol="${k}" title="${escH(it.title)}"><span>${escH(it.title || 'Sans titre')}</span></button>`); if (it.items && it.items.length) walk(it.items, lv + 1); } };
    walk(ol, 1);
    nav.innerHTML = rows.join('');
  }
  async function goOutline(my, k) {
    const it = my.outline && my.outline[k]; if (!it || !it.dest) return;
    try {
      const pdf = my.docs[0];
      const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest;
      if (!Array.isArray(dest) || !dest[0]) return;
      const srcIndex = typeof dest[0] === 'object' ? await pdf.getPageIndex(dest[0]) : +dest[0];
      const i = my.model.pages.findIndex(p => !p.src && !p.blank && p.srcIndex === srcIndex);
      if (i < 0) { say('Cette page a été supprimée'); return; }
      const top = dest[1] && dest[1].name === 'XYZ' && typeof dest[3] === 'number' ? dest[3] : null;
      goTo(my, i, top != null ? { pdfX: dest[2] || 0, pdfY: top } : {});
    } catch (e) { console.warn(e); }
  }
  /* --- recherche (insensible à la casse et aux accents) --- */
  function normMap(s) {
    let out = ''; const map = [];
    for (let i = 0; i < s.length; i++) { const n = s[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); for (const c of n) { out += c; map.push(i); } }
    return { out, map };
  }
  async function find(my, q) {
    q = String(q || '').trim(); const ms = Date.now();
    my.find = { q, hits: [], cur: -1, marks: {} }; const gen = my.findGen = (my.findGen || 0) + 1;
    const count = my.ov.querySelector('.pdx-scount'), res = my.ov.querySelector('.pdx-sres');
    for (const ps of my.ps.values()) A().render(my, ps);
    if (!q) { count.textContent = ''; res.innerHTML = ''; return; }
    const nq = normMap(q).out.replace(/\s+/g, ' ');
    count.textContent = 'Recherche…';
    const html = [];
    for (let pi = 0; pi < my.model.pages.length; pi++) {
      const ps = my.ps.get(my.model.pages[pi].key); if (!ps) continue;
      const tc = await pageText(my, ps); if (gen !== my.findGen) return;
      // texte de la page : les morceaux bout à bout (un espace entre deux), avec la position de chaque caractère
      let full = ''; const owner = [];
      tc.items.forEach((it, ii) => { for (let c = 0; c < it.str.length; c++) { full += it.str[c]; owner.push([ii, c]); } full += ' '; owner.push([ii, it.str.length]); });
      const { out, map } = normMap(full); const flat = out.replace(/\s/g, ' ');
      let at = flat.indexOf(nq);
      while (at >= 0) {
        const s0 = map[at], s1 = map[at + nq.length - 1];
        const rects = [];
        const byItem = new Map();
        for (let k = s0; k <= s1; k++) { const [ii, c] = owner[k]; if (!byItem.has(ii)) byItem.set(ii, [c, c]); else byItem.get(ii)[1] = c; }
        for (const [ii, [c0, c1]] of byItem) {
          const it = tc.items[ii]; const len = Math.max(1, it.str.length); const tr = it.transform;
          const fh = it.height || Math.hypot(tr[2], tr[3]) || 10; const w = it.width || fh * len * 0.5;
          rects.push({ x: tr[4] + w * c0 / len, y: tr[5] - fh * 0.22, w: Math.max(1.5, w * (Math.min(c1 + 1, len) - c0) / len), h: fh * 1.2 });
        }
        const before = full.slice(Math.max(0, s0 - 38), s0), hit = full.slice(s0, s1 + 1), after = full.slice(s1 + 1, s1 + 60);
        my.find.hits.push({ key: ps.key, page: pi, rects });
        if (html.length < 300) html.push(`<button type="button" class="pdx-sitem" data-hit="${my.find.hits.length - 1}"><span class="pdx-sp">p. ${pi + 1}</span><span class="pdx-ss">${s0 > 38 ? '…' : ''}${escH(before)}<mark>${escH(hit)}</mark>${escH(after)}…</span></button>`);
        at = flat.indexOf(nq, at + Math.max(1, nq.length));
      }
      if (pi % 10 === 9) { count.textContent = `Recherche… ${pi + 1} / ${my.model.pages.length}`; await new Promise(r => setTimeout(r, 0)); if (gen !== my.findGen) return; }
    }
    const n = my.find.hits.length;
    res.innerHTML = n ? html.join('') + (n > 300 ? `<div class="pt-empty">… et ${n - 300} autres résultats</div>` : '') : `<div class="pt-empty">Aucun résultat pour « ${escH(q)} »${Date.now() - ms > 0 && !my.textCache.size ? '' : ''}.${[...my.textCache.values()].every(t => !t.items.length) ? ' Ce PDF ne contient pas de texte (pages scannées ?).' : ''}</div>`;
    if (n) gotoHit(my, 0); else { count.textContent = '0 résultat'; }
  }
  function gotoHit(my, i) {
    const n = my.find.hits.length; if (!n) return;
    i = ((i % n) + n) % n; my.find.cur = i;
    my.find.marks = {};
    my.find.hits.forEach((h, k) => { for (const r of h.rects) (my.find.marks[h.key] || (my.find.marks[h.key] = [])).push(Object.assign({ cur: k === i }, r)); });
    for (const ps of my.ps.values()) A().render(my, ps);
    const h = my.find.hits[i]; const r = h.rects[0];
    goTo(my, h.page, { pdfX: r.x, pdfY: r.y + r.h, center: true, smooth: false });
    my.ov.querySelector('.pdx-scount').textContent = `${i + 1} / ${n}`;
    my.ov.querySelectorAll('.pdx-sitem.cur').forEach(x => x.classList.remove('cur'));
    const it = my.ov.querySelector(`.pdx-sitem[data-hit="${i}"]`); if (it) { it.classList.add('cur'); it.scrollIntoView({ block: 'nearest' }); }
  }
  function openFind(my) {
    toggleSide(my, true); showPane(my, 'search');
    const inp = my.ov.querySelector('.pdx-sq');
    const s = getSelection(); const t = s && !s.isCollapsed && my.ov.contains(s.anchorNode) ? s.toString().trim() : '';
    if (t && t.length < 80) inp.value = t;
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  }
  /* --- liste des annotations --- */
  const TYPE_LABEL = { ink: 'Tracé', hl: 'Surligneur (à main levée)', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Ligne', arrow: 'Flèche', text: 'Texte', note: 'Note', stamp: 'Tampon', texthl: 'Texte surligné', image: 'Image' };
  function renderAnnotList(my) {
    const box = my.ov && my.ov.querySelector('.pdx-alist'); if (!box) return;
    const rows = []; let n = 0;
    my.model.pages.forEach((p, i) => {
      const l = my.model.annots[p.key] || [];
      for (const a of l) {
        n++;
        if (my.pane !== 'annots') continue;
        const label = a.t === 'image' && a.sig ? 'Signature' : TYPE_LABEL[a.t] || a.t;
        const txt = a.t === 'texthl' ? a.quote : a.t === 'text' || a.t === 'note' ? a.text : a.t === 'stamp' ? A().stampLabel(a) : '';
        rows.push(`<button type="button" class="pdx-aitem" data-ak="${escH(p.key)}" data-aid="${escH(a.id)}"><span class="pdx-adot" style="--c:${escH(a.c || '#888')}"></span><span class="pdx-am"><b>${escH(label)}</b> · p. ${i + 1}${txt ? `<small>${escH(String(txt).slice(0, 140))}</small>` : ''}</span></button>`);
      }
    });
    const badge = my.ov.querySelector('.pdx-stabs [data-pane="annots"] .pdx-badge'); if (badge) { badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n); }
    if (my.pane !== 'annots') return;
    box.innerHTML = n ? `<div class="pdx-ahead"><span>${n} annotation${n > 1 ? 's' : ''}</span><button type="button" class="cta ghost small" data-pd="annots-seance" title="Créer une séance Alixo avec vos surlignages, notes et textes, page par page">${I.doc}<span>En faire une séance</span></button></div>${rows.join('')}`
      : my.savedOnce ? '<div class="pt-empty">Vos annotations enregistrées font maintenant partie des pages. Les nouvelles apparaîtront ici.</div>'
        : '<div class="pt-empty">Aucune annotation. Surlignez du texte (sélectionnez-le puis « Surligner »), écrivez, dessinez ou ajoutez des notes : elles apparaissent ici.</div>';
  }
  /* séance Alixo à partir des surlignages et notes (sans IA) */
  function annotsToSeance(my) {
    const S = window.AlixoApp; if (!S || !S.newDocOfKind) return;
    const e = s => (S.esc ? S.esc(s) : escH(s));
    const blocks = [];
    const mk = b => Object.assign({ id: S.uid ? S.uid() : uidL() }, b);
    blocks.push(mk({ type: 'h', level: 1, text: e('Notes de lecture — ' + my.name.replace(/\.pdf$/i, '')) }));
    my.model.pages.forEach((p, i) => {
      const l = (my.model.annots[p.key] || []).filter(a => (a.t === 'texthl' && a.quote) || ((a.t === 'note' || a.t === 'text') && String(a.text || '').trim()));
      if (!l.length) return;
      blocks.push(mk({ type: 'h', level: 2, text: e('Page ' + (i + 1)) }));
      for (const a of l) blocks.push(a.t === 'texthl' ? mk({ type: 'quote', text: e(a.quote) }) : mk({ type: 'li', lt: 'ul', text: (a.t === 'note' ? '<b>Note :</b> ' : '') + e(a.text).replace(/\n/g, '<br>') }));
    });
    if (blocks.length < 2) { say('Surlignez du texte ou ajoutez des notes d’abord'); return; }
    createSeance(my, 'Notes de lecture — ' + my.name.replace(/\.pdf$/i, ''), blocks);
  }
  function createSeance(my, title, blocks) {
    const S = window.AlixoApp; const st = S && S.getState && S.getState(); if (!st) return null;
    const d = S.newDocOfKind('doc');
    d.titre = title.slice(0, 120); d.folderId = my.folderId || null; d.prof = (S.folderProf && my.folderId) ? S.folderProf(my.folderId) : '';
    const day = d.blocks[0] && d.blocks[0].day; d.blocks = blocks.map(b => (day ? Object.assign({ day }, b) : b));
    d.fromPdf = { fileId: my.fileId || null, title: my.name, at: Date.now() };   // 1.56.0 : origine (sans IA : pas de marque aiFrom)
    st.docs.push(d); S.save(); S.openDoc(d.id);
    say(`Séance « ${d.titre} » créée`, { duration: 4000 });
    return d;
  }
  /* --- formulaire --- */
  /* 1.56.0 : noms techniques (« Text1 », « topmostSubform[0].Page1[0].Nom[0] ») → « Champ 3 · page 1 » */
  const techName = n => /[[\]_]|^\w+\d+$/.test(n);
  async function initForm(my) {
    let raw = null; try { raw = await my.docs[0].getFieldObjects(); } catch { raw = null; }
    /* 1.56.0 : table sans prototype (un champ nommé « __proto__ » ou « constructor » reste un champ comme un autre) */
    let fo = nullObj();
    if (raw && typeof raw === 'object') for (const k of Object.keys(raw)) if (Array.isArray(raw[k])) fo[k] = raw[k];
    if (!Object.keys(fo).length) fo = await fieldsFromAnnotations(my);
    if (!eds.has(my.id)) return;
    const names = Object.keys(fo).filter(n => fo[n].some(w => w && w.type && w.type !== 'button' && w.type !== 'signature'));
    my.fields = fo;
    const tab = my.ov.querySelector('.pdx-stabs [data-pane="form"]'); if (tab) tab.hidden = !names.length;
    const box = my.ov.querySelector('.pdx-form'); if (!box || !names.length) return;
    const val = (n, w) => (my.model.form[n] !== undefined ? my.model.form[n] : w.value);
    const dis = my.readOnlyHard ? 'disabled' : '';
    box.innerHTML = `<div class="pdx-fhead">${names.length} champ${names.length > 1 ? 's' : ''} à remplir. Les valeurs sont écrites dans le PDF à l’enregistrement.</div>` + names.slice(0, 400).map((n, k) => {
      const w = fo[n][0]; const id = `pdxf-${my.id.replace(/\W/g, '')}-${k}`;
      const nm = String(w.name || n);
      const label = escH(techName(nm) ? `Champ ${k + 1}${w.page != null ? ` · page ${w.page + 1}` : ''}` : nm);
      const tip = techName(nm) ? ` title="${escH(nm)}"` : '';
      if (w.type === 'checkbox') return `<label class="pdx-frow pdx-fchk" data-fname="${escH(n)}"${tip}><input type="checkbox" id="${id}" data-f="${escH(n)}" ${val(n, w) && val(n, w) !== 'Off' ? 'checked' : ''} ${dis}><span>${label}</span></label>`;
      if (w.type === 'radiobutton') { const opts = fo[n].map(x => x.buttonValue || x.exportValues).filter(Boolean); return `<label class="pdx-frow" data-fname="${escH(n)}" for="${id}"${tip}><span>${label}</span><select id="${id}" data-f="${escH(n)}" ${dis}><option value=""></option>${opts.map(o => `<option${String(val(n, w)) === String(o) ? ' selected' : ''}>${escH(o)}</option>`).join('')}</select></label>`; }
      if (w.type === 'combobox' || w.type === 'listbox') { const opts = (Array.isArray(w.items) ? w.items : []).map(x => (x && typeof x === 'object' ? x.exportValue || x.displayValue : x)); return `<label class="pdx-frow" data-fname="${escH(n)}" for="${id}"${tip}><span>${label}</span><select id="${id}" data-f="${escH(n)}" ${dis}><option value=""></option>${opts.map(o => `<option${String(val(n, w)) === String(o) ? ' selected' : ''}>${escH(o)}</option>`).join('')}</select></label>`; }
      return `<label class="pdx-frow" data-fname="${escH(n)}" for="${id}"${tip}><span>${label}</span>${w.multiline ? `<textarea id="${id}" data-f="${escH(n)}" rows="3" ${dis}>${escH(val(n, w) || '')}</textarea>` : `<input id="${id}" type="text" data-f="${escH(n)}" value="${escH(val(n, w) || '')}" ${dis}>`}</label>`;
    }).join('') + `<label class="pdx-frow pdx-fchk pdx-flat"><input type="checkbox" data-flatten="1"${my.flattenForm ? ' checked' : ''} ${dis}><span>Figer le formulaire à l’enregistrement (les champs ne seront plus modifiables)</span></label>`;
    syncFormStorage(my);
    /* 1.56.0 : on signale le formulaire une fois, à l'ouverture */
    if (!my.formAnnounced && !my.readOnlyHard && !my.preview) {
      my.formAnnounced = true;
      say(`Ce PDF contient un formulaire (${names.length} champ${names.length > 1 ? 's' : ''})`, { action: 'Remplir', duration: 7000, onAction: () => { if (eds.has(my.id)) { toggleSide(my, true); showPane(my, 'form'); const f = my.ov.querySelector('.pdx-form [data-f]'); if (f) setTimeout(() => f.focus(), 280); } } });
    }
  }
  /* 1.56.0 : clic sur un champ de la page → volet « Formulaire » et focus sur le champ */
  function fieldAt(my, ps, x, y) {
    if (!my.fields || ps.src || ps.blank) return null;
    for (const n of Object.keys(my.fields)) for (const w of my.fields[n]) {
      if (!w || w.page !== ps.srcIndex || !Array.isArray(w.rect) || w.type === 'button' || w.type === 'signature') continue;
      const [x0, y0, x1, y1] = w.rect; if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) return n;
    }
    return null;
  }
  function focusField(my, name) {
    toggleSide(my, true); showPane(my, 'form');
    const row = [...my.ov.querySelectorAll('.pdx-form [data-fname]')].find(r => r.dataset.fname === name); if (!row) return;
    const inp = row.querySelector('[data-f]');
    row.scrollIntoView({ block: 'nearest' });
    setTimeout(() => { if (inp && !inp.disabled) inp.focus({ preventScroll: true }); }, 280);
  }
  /* pdf.js 6 ne renvoie pas toujours getFieldObjects() : les champs sont alors relus dans les annotations des pages
     (formulaire AcroForm seulement, 300 premières pages) */
  async function fieldsFromAnnotations(my) {
    const pdf = my.docs[0]; const out = nullObj();
    let has = false; try { has = !!(await pdf.getMetadata()).info.IsAcroFormPresent; } catch { has = false; }
    if (!has) return out;
    for (let i = 0; i < Math.min(pdf.numPages, 300); i++) {
      let an = []; try { an = await (await pdf.getPage(i + 1)).getAnnotations(); } catch { an = []; }
      for (const a of an) {
        if (a.subtype !== 'Widget' || !a.fieldName) continue;
        const type = a.fieldType === 'Tx' ? 'text' : a.fieldType === 'Btn' ? (a.checkBox ? 'checkbox' : a.radioButton ? 'radiobutton' : 'button') : a.fieldType === 'Ch' ? (a.combo ? 'combobox' : 'listbox') : a.fieldType === 'Sig' ? 'signature' : '';
        const fname = String(a.fieldName);
        (out[fname] || (out[fname] = [])).push({ id: a.id, name: a.alternativeText || fname, type, value: a.fieldValue, rect: a.rect, page: i, multiline: !!a.multiLine, buttonValue: a.buttonValue, exportValues: a.exportValue, items: a.options || [] });
      }
    }
    return out;
  }
  /* les valeurs saisies sont dessinées par pdf.js (annotationStorage) sans attendre l'enregistrement */
  function syncFormStorage(my) {
    const st = my.docs[0] && my.docs[0].annotationStorage; if (!st || !my.fields) return;   // my.fields : table sans prototype
    const touched = new Set();
    for (const [n, list] of Object.entries(my.fields)) {
      if (my.model.form[n] === undefined && !my.formTouched) continue;
      const v = my.model.form[n];
      for (const w of list) {
        if (!w.id) continue;
        const value = w.type === 'checkbox' ? !!(v && v !== 'Off') : w.type === 'radiobutton' ? String(v) === String(w.buttonValue) : v == null ? w.value : v;
        try { st.setValue(w.id, { value }); } catch { /* */ }
        if (w.page != null) touched.add(w.page);
      }
    }
    my.formTouched = true;
    for (const ps of my.ps.values()) if (!ps.src && touched.has(ps.srcIndex)) { ps.renderedAt = 0; ps.thumbDone = false; }
    schedule(my);
  }
  function haloField(my, name) {
    const w = ((my.fields && my.fields[name]) || [])[0]; if (!w || w.page == null || !Array.isArray(w.rect)) return;
    const i = my.model.pages.findIndex(p => !p.src && !p.blank && p.srcIndex === w.page); if (i < 0) return;
    my.halo = { key: my.model.pages[i].key, r: w.rect };
    for (const ps of my.ps.values()) A().render(my, ps);
    goTo(my, i, { pdfX: w.rect[0], pdfY: w.rect[3], center: true });
    clearTimeout(my.haloTm); my.haloTm = setTimeout(() => { my.halo = null; for (const ps of my.ps.values()) A().render(my, ps); }, 1800);
  }

  /* ============================================================
     Menus (popover léger, propre à la visionneuse)
     ============================================================ */
  let menu = null;
  function openMenu(anchor, html, onPick) {
    closeMenu();
    menu = document.createElement('div'); menu.className = 'pdx-menu'; menu.setAttribute('role', 'menu'); menu.innerHTML = html;
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect(); const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.left)) + 'px';
    menu.style.top = (r.bottom + 6 + mh > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
    menu.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; const keep = b.dataset.keep; if (!keep) closeMenu(); onPick(b, e); });
    menu.querySelectorAll('button').forEach(b => b.setAttribute('role', 'menuitem'));
    setTimeout(() => { const f = menu && menu.querySelector('button:not([disabled])'); if (f) f.focus({ preventScroll: true }); }, 20);
    menu._anchor = anchor;
  }
  function closeMenu() { if (menu) { const a = menu._anchor; menu.remove(); menu = null; if (a && a.isConnected && document.activeElement === document.body) a.focus({ preventScroll: true }); } }
  document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target) && !(menu._anchor && menu._anchor.contains(e.target))) closeMenu(); }, true);
  document.addEventListener('keydown', e => {
    if (!menu) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const l = [...menu.querySelectorAll('button:not([disabled])')]; const i = l.indexOf(document.activeElement); const n = l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length]; if (n) n.focus(); }
  }, true);
  function shapesMenu(my, anchor) {
    openMenu(anchor, ['rect', 'ellipse', 'line', 'arrow'].map(k => `<button type="button" data-k="${k}" class="${my.view.tool === k ? 'on' : ''}">${I[k]}<span>${TOOL_NAMES[k]}</span></button>`).join(''), b => setTool(my, b.dataset.k));
  }
  function stampsMenu(my, anchor) {
    openMenu(anchor, `<div class="pdx-mtitle">Tampon — cliquez ensuite sur la page</div>` + A().STAMPS.map(([k, l, c]) => `<button type="button" data-k="${k}"><span class="pdx-stampprev" style="--c:${c}">${escH(k === 'date' ? new Date().toLocaleDateString('fr-FR') : l)}</span></button>`).join(''), b => { A().setOpt('stamp', 'kind', b.dataset.k); setTool(my, 'stamp'); });
  }
  function pagesMenu(my, anchor) {
    const hasForm = !my.ov.querySelector('.pdx-stabs [data-pane="form"]').hidden;
    openMenu(anchor, `<button type="button" data-k="number">${I.number}<span>Numéroter les pages…</span>${my.model.numbering ? '<i class="pdx-mon">activé</i>' : ''}</button>
      <button type="button" data-k="water">${I.water}<span>Filigrane…</span>${my.model.watermark ? '<i class="pdx-mon">activé</i>' : ''}</button>
      <button type="button" data-k="merge">${I.merge}<span>Fusionner un autre PDF…</span></button>
      <button type="button" data-k="blank">${I.plus}<span>Insérer une page vierge après la page ${my.cur + 1}</span></button>
      <button type="button" data-k="rot">${I.rotate}<span>Tourner la page ${my.cur + 1}</span></button>
      <button type="button" data-k="extract">${I.extract}<span>Extraire la page ${my.cur + 1} (PDF)</span></button>
      ${hasForm ? `<button type="button" data-k="form">${I.form}<span>Remplir le formulaire</span></button>` : ''}
      <hr><button type="button" data-k="del" class="danger">${I.trash}<span>Supprimer la page ${my.cur + 1}</span></button>`, b => {
      const k = b.dataset.k; const key = (my.model.pages[my.cur] || {}).key;
      if (k === 'number') numberingDialog(my);
      if (k === 'water') watermarkDialog(my);
      if (k === 'merge') pickMerge(my);
      if (k === 'blank') pageOp(my, key, 'blank-after');
      if (k === 'rot') pageOp(my, key, 'rot+');
      if (k === 'extract') extractPages(my, [key]);
      if (k === 'form') { toggleSide(my, true); showPane(my, 'form'); }
      if (k === 'del') pageOp(my, key, 'delete');
    });
  }
  function downloadMenu(my, anchor) {
    openMenu(anchor, `<button type="button" data-k="pdf">${I.pdf}<span><b>Copie du PDF</b><small>avec vos annotations et modifications</small></span></button>
      <button type="button" data-k="png">${I.png}<span><b>Page ${my.cur + 1} en image</b><small>.png, haute définition</small></span></button>
      <button type="button" data-k="txt">${I.txt}<span><b>Texte du PDF</b><small>.txt, toutes les pages</small></span></button>
      <button type="button" data-k="seance">${I.doc}<span><b>Convertir en séance Alixo</b><small>titres, paragraphes et listes, sans IA</small></span></button>
      <hr><button type="button" data-k="print">${I.print}<span>Imprimer…</span></button>`, b => {
      const k = b.dataset.k;
      if (k === 'pdf') downloadPdf(my); if (k === 'png') downloadPng(my); if (k === 'txt') downloadTxt(my); if (k === 'print') print(my);
      if (k === 'seance') { if (window.AlixoPdfAI && AlixoPdfAI.toSeance) AlixoPdfAI.toSeance(my); }
    });
  }

  /* ---------------- numérotation, filigrane, fusion ---------------- */
  function numberingDialog(my) {
    const nb = my.model.numbering || { pos: 'bc', start: 1, fmt: 'n', size: 10 };
    openDialog({ id: 'pdxnum', cls: 'pdx-dlg', eyebrow: escH(my.name), title: 'Numéroter les pages',
      body: `<div class="pdx-fgrid">
        <label>Position<select data-n="pos"><option value="bc"${nb.pos === 'bc' ? ' selected' : ''}>En bas, au centre</option><option value="br"${nb.pos === 'br' ? ' selected' : ''}>En bas, à droite</option><option value="tr"${nb.pos === 'tr' ? ' selected' : ''}>En haut, à droite</option></select></label>
        <label>Format<select data-n="fmt"><option value="n"${nb.fmt === 'n' ? ' selected' : ''}>1, 2, 3…</option><option value="n/N"${nb.fmt === 'n/N' ? ' selected' : ''}>1 / 12, 2 / 12…</option></select></label>
        <label>Premier numéro<input type="number" data-n="start" min="0" max="9999" value="${+nb.start || 1}"></label>
        <label>Taille<input type="number" data-n="size" min="6" max="24" value="${+nb.size || 10}"></label></div>
        <p class="pdx-dtext">Les numéros sont écrits sur chaque page à l’enregistrement, dans le sens de lecture de la page.</p>`,
      foot: `${my.model.numbering ? '<button class="cta ghost" type="button" data-nd="off">Retirer la numérotation</button>' : ''}<span class="dlg-spacer"></span><button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" type="button" data-nd="ok">Appliquer</button>`,
      onMount(card, closeD) {
        card.addEventListener('click', e => {
          const b = e.target.closest('[data-nd]'); if (!b) return;
          snap(my);
          if (b.dataset.nd === 'off') my.model.numbering = null;
          else { const g = k => card.querySelector(`[data-n="${k}"]`).value; my.model.numbering = { pos: g('pos'), fmt: g('fmt'), start: Math.max(0, Math.min(9999, Math.round(+g('start') || 1))), size: Math.max(6, Math.min(24, +g('size') || 10)) }; }
          closeD(); refreshOverlays(my); afterChange(my, null);
          say(my.model.numbering ? 'Numérotation ajoutée (écrite à l’enregistrement)' : 'Numérotation retirée', { duration: 2500 });
        });
      } });
  }
  function watermarkDialog(my) {
    const wm = my.model.watermark || { text: 'CONFIDENTIEL', opacity: 0.18, angle: 45, color: '#c04343' };
    openDialog({ id: 'pdxwm', cls: 'pdx-dlg', eyebrow: escH(my.name), title: 'Filigrane',
      body: `<div class="pdx-fgrid">
        <label class="pdx-fwide">Texte<input type="text" data-w="text" maxlength="60" value="${escH(wm.text)}"></label>
        <label>Opacité<input type="range" data-w="opacity" min="0.05" max="0.6" step="0.01" value="${wm.opacity}"></label>
        <label>Angle<select data-w="angle">${[0, 30, 45, 60, 90, -45].map(a => `<option value="${a}"${+wm.angle === a ? ' selected' : ''}>${a}°</option>`).join('')}</select></label>
        <label>Couleur<span class="pdx-swatches">${['#c04343', '#1f1f1f', '#2980b9', '#27ae60', '#8e44ad'].map(c => `<button type="button" class="pdx-sw${wm.color === c ? ' on' : ''}" data-wc="${c}" style="--c:${c}" title="${escH(cname(c))}" aria-label="${escH(cname(c))}" aria-pressed="${wm.color === c}"></button>`).join('')}</span></label></div>
        <p class="pdx-dtext">Aperçu sur les pages ; le filigrane est écrit sur toutes les pages à l’enregistrement.</p>`,
      foot: `${my.model.watermark ? '<button class="cta ghost" type="button" data-wd="off">Retirer le filigrane</button>' : ''}<span class="dlg-spacer"></span><button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" type="button" data-wd="ok">Appliquer</button>`,
      onMount(card, closeD) {
        let color = wm.color;
        card.addEventListener('click', e => {
          const c = e.target.closest('[data-wc]'); if (c) { color = c.dataset.wc; card.querySelectorAll('[data-wc]').forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', String(x === c)); }); return; }
          const b = e.target.closest('[data-wd]'); if (!b) return;
          const text = card.querySelector('[data-w="text"]').value.trim();
          snap(my);
          if (b.dataset.wd === 'off' || !text) my.model.watermark = null;
          else my.model.watermark = { text: text.slice(0, 60), opacity: Math.max(0.05, Math.min(0.6, +card.querySelector('[data-w="opacity"]').value || 0.18)), angle: +card.querySelector('[data-w="angle"]').value || 0, color };
          closeD(); refreshOverlays(my); afterChange(my, null);
        });
      } });
  }
  /* aperçu de la numérotation et du filigrane (calque HTML au-dessus des pages, non écrit tant qu'on n'enregistre pas) */
  function refreshOverlays(my) {
    const N = my.model.pages.length; const nb = my.model.numbering, wm = my.model.watermark;
    my.model.pages.forEach((p, i) => {
      const ps = my.ps.get(p.key); if (!ps) return;
      let ov = ps.el.querySelector('.pdx-overlay');
      if (!nb && !wm) { if (ov) ov.remove(); return; }
      if (!ov) { ov = document.createElement('div'); ov.className = 'pdx-overlay'; ps.el.appendChild(ov); }
      const label = nb ? (nb.fmt === 'n/N' ? `${nb.start + i} / ${nb.start + N - 1}` : String(nb.start + i)) : '';
      ov.innerHTML = (nb ? `<span class="pdx-ovnum pos-${escH(nb.pos)}" style="--fs:${nb.size}">${escH(label)}</span>` : '') + (wm ? `<span class="pdx-ovwm" style="--c:${escH(wm.color)};--o:${wm.opacity};--a:${-wm.angle}deg">${escH(wm.text)}</span>` : '');
    });
  }
  function pickMerge(my) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.pdf,application/pdf';
    inp.addEventListener('change', async () => { const f = inp.files && inp.files[0]; if (f) mergeBuffer(my, await f.arrayBuffer(), f.name); });
    inp.click();
  }
  async function mergeBuffer(my, ab, name) {
    if (ab.byteLength > (isMobile() ? MAX_MOBILE : MAX_BYTES)) { say(tooBigMsg(isMobile() ? MAX_MOBILE : MAX_BYTES), { duration: 8000 }); return; }
    let pdf; try { pdf = await loadPdf(ab, r => askPassword(name, r)); } catch (e) { console.error(e); if (!(e && e.name === 'PasswordException')) say('Ce PDF n’a pas pu être ajouté : il semble endommagé.', { duration: 6000 }); return; }
    if (my.model.pages.length + pdf.numPages > MAX_PAGES) { try { pdf.destroy(); } catch { /* */ } say(`Fusion impossible : le PDF dépasserait ${MAX_PAGES.toLocaleString('fr-FR')} pages.`, { duration: 6000 }); return; }
    const src = my.sources.length; my.sources.push(ab); my.docs[src] = pdf; my.sizes[src] = [];
    const p1 = await pdf.getPage(1); my.sizes[src][0] = { view: p1.view.slice(), rot0: p1.rotate };
    snap(my);
    const at = my.cur + 1;
    const add = Array.from({ length: pdf.numPages }, (_, i) => ({ key: 'k' + uidL(), src, srcIndex: i, rotate: 0, blank: null }));
    my.model.pages.splice(at, 0, ...add);
    syncPages(my); afterChange(my, null); fetchSizes(my, src);
    say(`« ${name} » fusionné : ${add.length} page${add.length > 1 ? 's' : ''} insérée${add.length > 1 ? 's' : ''} après la page ${at}`, { duration: 4000 });
    goTo(my, at);
  }

  /* ============================================================
     Enregistrement, téléchargement, impression
     ============================================================ */
  function writeOpts(my) {
    const images = {}; for (const [id, im] of Object.entries(my.images)) images[id] = { bytes: im.bytes, mime: im.mime };
    return { sources: my.sources, images, flattenForm: my.flattenForm, producer: 'Alixo ' + appVersion() };
  }
  async function produce(my) {
    if (!window.AlixoPdfWrite || !window.PDFLib) throw new Error('module d’écriture PDF indisponible');
    closeBubble(my);
    if (document.activeElement && document.activeElement.classList.contains('pdx-tedit')) document.activeElement.blur();
    return AlixoPdfWrite.build(my.model, writeOpts(my));
  }
  async function saveNow(my) {
    if (!my || my.broken || !my.loaded) return false;
    if (my.readOnlyHard) { say('Ce PDF est verrouillé par son auteur : vous pouvez le lire, le rechercher et l’imprimer, mais pas le modifier.', { duration: 5000 }); return false; }
    if (my.saving) return my.saving;
    if (!my.dirty && my.fileId && !my.readOnly) { say('Aucune modification à enregistrer', { duration: 1500 }); return true; }
    /* 1.56.0 : vérification complète (pdf-lib) au début de chaque enregistrement, quelle que soit la taille du fichier :
       chiffré → lecture seule ; signé → avertissement ci-dessous */
    if (window.AlixoPdfWrite && AlixoPdfWrite.inspect && my.inspected !== my.origBuf) {
      try { const r = await AlixoPdfWrite.inspect(my.origBuf); my.inspected = my.origBuf; if (r.signed) my.signed = true; if (r.encrypted) { lockHard(my); say('Ce PDF est verrouillé par son auteur : il ne peut pas être modifié. Télécharger › Copie du PDF reste possible.', { duration: 7000 }); return false; } }
      catch (e) { console.warn('Inspection du PDF :', e); }
    }
    if (!(await confirmFlatten(my))) return false;
    /* PDF signé : l'enregistrement réécrit le fichier et invalide la signature électronique — on le dit avant */
    if (my.signed && !my.signedOk) {
      const go = typeof confirmDialog === 'function' ? await confirmDialog({ title: 'Ce PDF est signé électroniquement', text: 'L’enregistrer avec vos modifications invalidera sa signature. Pour garder l’original signé, utilisez plutôt Télécharger › Copie du PDF.', ok: 'Enregistrer quand même', cancel: 'Annuler', danger: true }) : true;
      if (!go) return false;
      my.signedOk = true;
    }
    my.saving = (async () => {
      setState(my, 'Enregistrement…');
      try {
        const bytes = await produce(my);
        if (my.readOnly || !my.fileId || !window.AlixoFiles || !AlixoFiles.byId(my.fileId)) {
          const added = window.AlixoFiles ? await AlixoFiles.addFiles([new File([bytes], my.name, { type: 'application/pdf' })], my.readOnly ? null : (my.folderId || null)) : null;
          if (!added || !added[0]) throw new Error('ajout à la bibliothèque refusé');
          const f = added[0];
          my.dirty = false; if (my.fileId) AlixoFiles.aux.del(draftKey(my));
          const reopen = { name: f.name, buf: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), fileId: f.id, folderId: f.folderId || null };
          say(`Copie enregistrée dans votre bibliothèque : « ${f.name} »`, { duration: 5000 });
          await close(my.id, { force: true });
          if (window.AlixoApp && AlixoApp.tabs && AlixoApp.tabs.isOpen(my.id)) AlixoApp.tabs.close(my.id);
          await open(reopen);
          return true;
        }
        await AlixoFiles.replaceData(my.fileId, bytes);
        if (AlixoFiles.aux) AlixoFiles.aux.del(draftKey(my));
        await reloadFrom(my, bytes);
        const t = new Date();
        setState(my, `Enregistré à ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
        if (window.AlixoApp && AlixoApp.tabs && AlixoApp.tabs.isOpen(my.id)) AlixoApp.tabs.update(my.id, { title: my.name });
        const f = AlixoFiles.byId(my.fileId);
        say(f && f.size > 20 * 1024 * 1024 && AlixoFiles.cloudEnabled ? 'PDF enregistré (plus de 20 Mo : sur cet appareil seulement)' : 'PDF enregistré', { duration: 2500 });
        return true;
      } catch (err) {
        console.error(err);
        setState(my, 'Échec de l’enregistrement');
        if (my.fileId) flushDraft(my);
        say(my.fileId ? `Enregistrement impossible : vos modifications sont gardées en brouillon. Réessayez avec ${kbd('Ctrl+S')}, ou utilisez Télécharger › Copie du PDF.` : 'Enregistrement impossible. Réessayez dans un instant, ou utilisez Télécharger › Copie du PDF.', { duration: 9000 });
        return false;
      } finally { my.saving = null; }
    })();
    return my.saving;
  }
  /* 1.56.0 : premier enregistrement avec des annotations : on explique qu'elles seront fondues dans les pages */
  const FLAT_LS = 'alixo.pdf.flatWarned';
  function confirmFlatten(my) {
    let warned = false; try { warned = localStorage.getItem(FLAT_LS) === '1'; } catch { /* */ }
    const any = Object.values(my.model.annots).some(l => (l || []).some(a => a.t !== 'note'));
    if (warned || !any || typeof openDialog !== 'function') return Promise.resolve(true);
    return new Promise(resolve => {
      let res = false;
      openDialog({ id: 'pdxflat', cls: 'pdx-dlg', eyebrow: 'PDF', title: 'Intégrer vos annotations au PDF ?',
        body: `<p class="pdx-dtext">En enregistrant, vos surlignages, dessins, tampons et signatures sont fondus dans les pages : vous ne pourrez plus les déplacer ni les effacer. Les notes restent modifiables.</p><label class="pdx-chk pdx-dchk"><input type="checkbox" class="pdx-flatno"> Ne plus me le demander</label>`,
        foot: '<span class="dlg-spacer"></span><button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" type="button" data-fl="ok">Enregistrer dans le PDF</button>',
        onMount(card, closeD) {
          card.querySelector('[data-fl="ok"]').addEventListener('click', () => {
            if (card.querySelector('.pdx-flatno').checked) { try { localStorage.setItem(FLAT_LS, '1'); } catch { /* */ } }
            res = true; closeD();
          });
          setTimeout(() => { const b = card.querySelector('[data-fl="ok"]'); if (b) b.focus({ preventScroll: true }); }, 40);
        },
        onClose() { resolve(res); } });
    });
  }
  /* après l'enregistrement : le PDF écrit devient l'original ; les annotations en font partie */
  async function reloadFrom(my, bytes) {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const pdf = await loadPdf(ab, r => askPassword(my.name, r));
    const top = my.scroll.scrollTop; const cur = my.cur;
    for (const ps of my.ps.values()) { releasePage(ps); ps.el.remove(); if (ps.thumb) ps.thumb.remove(); if (my.io) my.io.unobserve(ps.el); }
    my.ps.clear();
    for (const d of my.docs) { try { d && d.destroy(); } catch { /* */ } }
    my.docs = [pdf]; my.sources = [ab]; my.origBuf = ab; my.sizes = [[]]; my.textCache.clear();
    const p1 = await pdf.getPage(1); my.sizes[0][0] = { view: p1.view.slice(), rot0: p1.rotate };
    my.model = newModel(pdf.numPages); my.hist = []; my.redo = []; my.sel = null; my.find = { q: '', hits: [], cur: -1, marks: {} };
    my.dirty = false; my.formTouched = false; my.savedOnce = true; my.inspected = ab;
    syncPages(my); refreshOverlays(my); applyMode(my);
    my.scroll.scrollTop = top; my.cur = cur;
    renderOutline(my); initForm(my); paintBar(my); updateStatus(my); fetchSizes(my, 0);
    if (window.AlixoPdfAI && AlixoPdfAI.changed) AlixoPdfAI.changed(my, true);
  }
  function saveBlob(name, bytes, mime) {
    if (window.alixoDesktop && alixoDesktop.saveFile) {
      return alixoDesktop.saveFile({ name, data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), filters: [{ name: mime === 'image/png' ? 'Image PNG' : mime === 'text/plain' ? 'Texte' : 'Document PDF', extensions: [name.split('.').pop()] }] })
        .then(r => { if (r && r.ok) say('Fichier enregistré sur l’ordinateur'); else if (r && r.error) { console.error(r.error); say('Le fichier n’a pas pu être préparé. Réessayez dans un instant.'); } });
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: mime })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return Promise.resolve();
  }
  const baseName = my => my.name.replace(/\.pdf$/i, '');
  async function downloadPdf(my) {
    try { const bytes = my.dirty || my.model.pages.length !== (my.docs[0] && my.docs[0].numPages) ? await produce(my) : new Uint8Array(my.origBuf); await saveBlob(my.name, bytes, 'application/pdf'); }
    catch (e) { console.error(e); say('Le fichier n’a pas pu être préparé. Réessayez dans un instant.'); }
  }
  async function extractPages(my, keys) {
    try { const bytes = await AlixoPdfWrite.extract(my.model, keys, writeOpts(my)); const i = idxOf(my, keys[0]); await saveBlob(`${baseName(my)} - page ${i + 1}.pdf`, bytes, 'application/pdf'); }
    catch (e) { console.error(e); say('Le fichier n’a pas pu être préparé. Réessayez dans un instant.'); }
  }
  /* page affichée en PNG : rendu à 2× + annotations (SVG) par-dessus */
  async function pagePng(my, i, scale = 2) {
    const p = my.model.pages[i]; const ps = my.ps.get(p.key);
    const vp1 = ps.vp1;
    scale = canvasScale(vp1.width, vp1.height, scale);   // 1.56.0 : 16 Mpx au plus
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(vp1.width * scale)); cv.height = Math.max(1, Math.round(vp1.height * scale));
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (!ps.blank) { const pr = await getProxy(my, ps); await pr.render({ canvasContext: ctx, viewport: pr.getViewport({ scale, rotation: ps.rotAll }), annotationMode: window.pdfjsLib.AnnotationMode.ENABLE_STORAGE }).promise; }
    const list = my.model.annots[p.key] || [];
    if (list.length) {
      const imgs = {}; for (const [id, im] of Object.entries(my.images)) imgs[id] = { url: await blobToDataUrl(new Blob([im.bytes], { type: im.mime })) };
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cv.width}" height="${cv.height}" viewBox="0 0 ${vp1.width} ${vp1.height}"><g transform="matrix(${vp1.transform.join(' ')})">${list.map(a => A().shapeSVG(a, imgs, true)).join('')}</g></svg>`;
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode(); ctx.drawImage(img, 0, 0, cv.width, cv.height);
    }
    return new Promise(r => cv.toBlob(r, 'image/png'));
  }
  const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  async function downloadPng(my) {
    try { const blob = await pagePng(my, my.cur); await saveBlob(`${baseName(my)} - page ${my.cur + 1}.png`, new Uint8Array(await blob.arrayBuffer()), 'image/png'); }
    catch (e) { console.error(e); say('Le fichier n’a pas pu être préparé. Réessayez dans un instant.'); }
  }
  async function allText(my, onProgress) {
    const parts = [];
    for (let i = 0; i < my.model.pages.length; i++) {
      const ps = my.ps.get(my.model.pages[i].key); const tc = await pageText(my, ps);
      parts.push({ page: i + 1, text: itemsText(tc.items) });
      if (onProgress && i % 10 === 9) onProgress((i + 1) / my.model.pages.length);
    }
    return parts;
  }
  async function downloadTxt(my) {
    const parts = await allText(my);
    const txt = parts.map(p => `--- Page ${p.page} ---\n${p.text}`).join('\n\n');
    if (!parts.some(p => p.text)) { say('Ce PDF ne contient pas de texte (pages scannées ?)'); return; }
    await saveBlob(`${baseName(my)}.txt`, new TextEncoder().encode(txt), 'text/plain');
  }
  /* impression : le PDF produit (avec les annotations), page à page en images — fidèle partout, même sans lecteur PDF */
  async function print(my) {
    if (!my || !my.loaded) return;
    if (my.printing) return;
    /* 1.56.0 : une image par page : au-delà de PRINT_MAX pages, on passe par le lecteur PDF */
    if (my.model.pages.length > PRINT_MAX) { say(`Impression limitée à ${PRINT_MAX} pages dans Alixo : utilisez Télécharger › Copie du PDF, puis imprimez-la avec votre lecteur PDF.`, { duration: 8000 }); return; }
    my.printing = true; setTimeout(() => { my.printing = false; }, 3000);
    say('Préparation de l’impression…', { duration: 1500 });
    try {
      const box = document.createElement('div'); box.id = 'pdx-print';
      const urls = [];
      for (let i = 0; i < my.model.pages.length; i++) {
        const blob = await pagePng(my, i, 1.6); const u = URL.createObjectURL(blob); urls.push(u);
        const ps = my.ps.get(my.model.pages[i].key);
        const img = document.createElement('img'); img.src = u; img.className = 'pdx-pimg'; img.style.aspectRatio = `${ps.vp1.width} / ${ps.vp1.height}`;
        box.appendChild(img);
      }
      document.body.appendChild(box);
      await Promise.all([...box.querySelectorAll('img')].map(im => im.decode().catch(() => {})));
      const st = document.createElement('style'); st.id = 'pdx-print-page'; st.textContent = '@page { margin: 0; }'; document.head.appendChild(st);
      document.body.classList.add('pdx-printing');
      const done = () => { window.removeEventListener('afterprint', done); document.body.classList.remove('pdx-printing'); st.remove(); box.remove(); urls.forEach(u => URL.revokeObjectURL(u)); };
      window.addEventListener('afterprint', done);
      setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('pdx-printing')) done(); }, 600); }, 60);
    } catch (e) { console.error(e); say('Le fichier n’a pas pu être préparé. Réessayez dans un instant.'); }
  }

  /* ---------------- présentation, nuit, rotation ---------------- */
  /* 1.56.0 : pastille « 3 / 12 · Échap pour quitter », montrée 2 s au mouvement de la souris ou au changement de page */
  function presentPill(my) {
    if (!my.ov.classList.contains('pdx-present')) return;
    let pill = my.ov.querySelector('.pdx-ppill');
    if (!pill) { pill = document.createElement('div'); pill.className = 'pdx-ppill'; pill.setAttribute('aria-live', 'polite'); my.ov.appendChild(pill); }
    pill.textContent = `${my.cur + 1} / ${my.model.pages.length} · Échap pour quitter`;
    pill.classList.add('on'); clearTimeout(my.pillTm); my.pillTm = setTimeout(() => pill.classList.remove('on'), 2000);
  }
  function enterPresent(my) {
    my.prevMode = my.view.mode; my.ov.classList.add('pdx-present');
    if (!my.pillBound) { my.pillBound = true; my.ov.addEventListener('pointermove', () => presentPill(my), { passive: true }); }
    setTimeout(() => presentPill(my), 400);
    const fs = my.ov.requestFullscreen ? my.ov.requestFullscreen().catch(() => {}) : Promise.resolve();
    Promise.resolve(fs).then(() => setTimeout(() => { my.view.mode = 'page'; applyMode(my); goTo(my, my.cur, { smooth: false }); }, 120));
    say('Présentation : flèches, espace ou clic pour avancer, Échap pour quitter', { duration: 2500 });
  }
  function leavePresent(my) {
    my.ov.classList.remove('pdx-present');
    if (document.fullscreenElement === my.ov) document.exitFullscreen().catch(() => {});
    my.view.mode = my.prevMode || 'width'; setTimeout(() => { applyMode(my); goTo(my, my.cur, { smooth: false }); }, 60);
  }
  document.addEventListener('fullscreenchange', () => { if (ed && ed.ov.classList.contains('pdx-present') && document.fullscreenElement !== ed.ov) leavePresent(ed); });
  function toggleNight(my) { my.view.night = !my.view.night; my.ov.classList.toggle('pdx-night', my.view.night); paintBar(my); }
  function rotateView(my) { my.view.rotation = norm360(my.view.rotation + 90); const i = my.cur; layoutAll(my); for (const ps of my.ps.values()) A().render(my, ps); applyMode(my); goTo(my, i, { smooth: false }); updateStatus(my); }

  /* ---------------- sélection de texte : petite barre (surligner, copier, Alixo AI) ---------------- */
  function showSelPop(my) {
    const pop = my.ov.querySelector('.pdx-selpop');
    const s = getSelection(); if (!s || s.isCollapsed || !s.rangeCount || my.view.tool !== 'select') { pop.hidden = true; return; }
    const r = s.getRangeAt(0); if (!my.pagesEl.contains(r.commonAncestorContainer)) { pop.hidden = true; return; }
    const text = s.toString().trim(); if (!text) { pop.hidden = true; return; }
    my.lastSelText = text.slice(0, 4000);
    const rects = [...r.getClientRects()]; const last = rects[rects.length - 1] || r.getBoundingClientRect();
    const ai = !!window.AlixoPdfAI;
    pop.innerHTML = `${my.readOnlyHard ? '' : `<span class="pdx-swatches">${A().HL_PALETTE.slice(0, 4).map(c => `<button type="button" class="pdx-sw" data-sp="hl" data-v="${escH(c)}" style="--c:${escH(c)}" title="Surligner en ${escH(cname(c).toLowerCase())}" aria-label="Surligner en ${escH(cname(c).toLowerCase())}"></button>`).join('')}</span><button type="button" data-sp="hl" data-v="" class="pdx-splbl">Surligner</button><span class="pdx-ssep"></span>`}
      <button type="button" data-sp="copy" title="Copier" aria-label="Copier">${I.copy}</button>
      ${ai ? `<button type="button" data-sp="explain" class="pdx-splbl pdx-spai" title="Alixo AI explique ce passage">${I.ai}<span>Expliquer</span></button><button type="button" data-sp="translate" class="pdx-splbl" title="Alixo AI traduit ce passage">${I.tr}<span>Traduire</span></button>` : ''}`;
    pop.hidden = false;
    const pw = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, last.right - pw / 2)) + 'px';
    pop.style.top = Math.min(innerHeight - 50, last.bottom + 8) + 'px';
  }
  function hideSelPop(my) { const p = my && my.ov && my.ov.querySelector('.pdx-selpop'); if (p) p.hidden = true; }

  /* ============================================================
     Événements d'un onglet
     ============================================================ */
  function bindDoc(my) {
    const ov = my.ov;
    my.hooks = hooksOf(my);
    A().bind(my, my.pagesEl);
    ov.addEventListener('click', e => {
      const fb = e.target.closest('[data-pd="fallback"]'); if (fb) { fallbackOpen(my); return; }
      const t = e.target.closest('[data-tool]'); if (t && ov.querySelector('.pdx-bar').contains(t)) { setTool(my, t.dataset.tool); return; }
      const b = e.target.closest('[data-pd]');
      if (b) {
        const k = b.dataset.pd;
        if (k === 'side') return toggleSide(my);
        if (!my.loaded) return;
        if (k === 'more') return moreMenu(my, b);
        if (k === 'shapes') return shapesMenu(my, b);
        if (k === 'stamps') return stampsMenu(my, b);
        if (k === 'image') return my.readOnlyHard ? null : pickImage(my);
        if (k === 'sig') return my.readOnlyHard ? null : signatureDialog(my);
        if (k === 'pages') return pagesMenu(my, b);
        if (k === 'fit-width') return setMode(my, 'width');
        if (k === 'fit-page') return setMode(my, 'page');
        if (k === 'rotate-view') return rotateView(my);
        if (k === 'night') return toggleNight(my);
        if (k === 'present') return enterPresent(my);
        if (k === 'undo') return undo(my, -1);
        if (k === 'redo') return undo(my, 1);
        if (k === 'save') return saveNow(my);
        if (k === 'download') return downloadMenu(my, b);
        if (k === 'print') return print(my);
        if (k === 'ai') { if (window.AlixoPdfAI) AlixoPdfAI.toggle(my); paintBar(my); return; }
        if (k === 'find-next') return gotoHit(my, my.find.cur + 1);
        if (k === 'find-prev') return gotoHit(my, my.find.cur - 1);
        if (k === 'annots-seance') return annotsToSeance(my);
        return;
      }
      const tab = e.target.closest('.pdx-stabs [data-pane]'); if (tab) { showPane(my, tab.dataset.pane); return; }
      const ol = e.target.closest('[data-ol]'); if (ol) { goOutline(my, +ol.dataset.ol); return; }
      const hit = e.target.closest('[data-hit]'); if (hit) { gotoHit(my, +hit.dataset.hit); return; }
      const ai = e.target.closest('[data-aid]');
      if (ai) { const i = idxOf(my, ai.dataset.ak); my.sel = { key: ai.dataset.ak, id: ai.dataset.aid }; setTool(my, 'select'); my.sel = { key: ai.dataset.ak, id: ai.dataset.aid }; const a = A().findAnnot(my, ai.dataset.ak, ai.dataset.aid); const bb = a ? A().bbox(a) : null; goTo(my, i, bb ? { pdfX: bb.x, pdfY: bb.y + bb.h, center: true } : {}); for (const ps of my.ps.values()) A().render(my, ps); setTimeout(() => paintSelBar(my), 450); return; }
      const fr = e.target.closest('[data-fname]'); if (fr && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') haloField(my, fr.dataset.fname);
      const tm = e.target.closest('.pdx-tmenu'); if (tm) { e.stopPropagation(); thumbMenu(my, tm.closest('.pdx-thumb').dataset.key, tm); return; }
      const th = e.target.closest('.pdx-thumb'); if (th) { goTo(my, idxOf(my, th.dataset.key), { smooth: false }); return; }
      const op = e.target.closest('[data-opt]');
      if (op && op.tagName === 'BUTTON') {
        const g = A().groupOf(my.view.tool);
        if (op.dataset.opt === 'c') A().setOpt(my.view.tool, 'c', op.dataset.v);
        if (op.dataset.opt === 'bold') A().setOpt(my.view.tool, 'bold', !A().opts[g].bold);
        paintOpts(my); return;
      }
      const sb = e.target.closest('[data-sel]');
      if (sb) {
        const k = sb.dataset.sel;
        if (k === 'color') A().recolor(my, sb.dataset.v);
        if (k === 'dup') A().duplicate(my);
        if (k === 'del' && my.sel) A().removeAnnot(my, my.sel.key, my.sel.id);
        if (k === 'edit' && my.sel) { const a = A().findAnnot(my, my.sel.key, my.sel.id); const ps = my.ps.get(my.sel.key); if (a && ps) { if (a.t === 'text') editText(my, a, ps, false); else openBubble(my, a, ps); } }
        return;
      }
      const sp = e.target.closest('[data-sp]');
      if (sp) {
        const k = sp.dataset.sp;
        if (k === 'hl') { const n = A().highlightSelection(my, sp.dataset.v || undefined); hideSelPop(my); if (n) say('Passage surligné', { duration: 1200 }); }
        if (k === 'copy') { const t = getSelection().toString(); if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => say('Copié', { duration: 1000 })).catch(() => document.execCommand('copy')); hideSelPop(my); }
        if ((k === 'explain' || k === 'translate') && window.AlixoPdfAI) { const t = my.lastSelText || ''; hideSelPop(my); AlixoPdfAI.run(my, k, { text: t }); paintBar(my); }
      }
    });
    ov.addEventListener('mousedown', e => { if (e.target.closest('.pdx-selpop')) e.preventDefault(); });
    ov.addEventListener('change', e => {
      const o = e.target.closest('[data-opt]');
      if (o) { const k = o.dataset.opt; A().setOpt(my.view.tool, k, k === 'fill' ? (o.checked ? A().opts.shape.c : null) : k === 'font' ? o.value : +o.value); paintOpts(my); return; }
      const f = e.target.closest('[data-f]');
      if (f) { snap(my); my.model.form[f.dataset.f] = f.type === 'checkbox' ? f.checked : f.value; syncFormStorage(my); afterChange(my, null); return; }
      if (e.target.closest('[data-flatten]')) { my.flattenForm = e.target.checked; if (my.flattenForm) markDirty(my, true); }
    });
    ov.addEventListener('input', e => { const o = e.target.closest('input[type=range][data-opt]'); if (o) { A().setOpt(my.view.tool, o.dataset.opt, +o.value); const pv = ov.querySelector('.pdx-oprev'); if (pv) pv.style.setProperty('--w', Math.min(22, +o.value * (my.view.tool === 'hl' ? 1 : 1.6)) + 'px'); } });
    // 1.56.0 : onglets du volet au clavier (← → Début Fin)
    ov.querySelector('.pdx-stabs').addEventListener('keydown', e => {
      const l = [...ov.querySelectorAll('.pdx-stabs [role="tab"]:not([hidden])')]; const i = l.indexOf(document.activeElement); if (i < 0) return;
      const j = e.key === 'ArrowRight' ? (i + 1) % l.length : e.key === 'ArrowLeft' ? (i - 1 + l.length) % l.length : e.key === 'Home' ? 0 : e.key === 'End' ? l.length - 1 : -1;
      if (j < 0) return; e.preventDefault(); e.stopPropagation(); showPane(my, l[j].dataset.pane); l[j].focus();
    });
    // recherche
    const sq = ov.querySelector('.pdx-sq'); let sTm = 0;
    sq.addEventListener('input', () => { clearTimeout(sTm); sTm = setTimeout(() => find(my, sq.value), 260); });
    sq.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); if (sq.value.trim() !== my.find.q) { clearTimeout(sTm); find(my, sq.value); } else gotoHit(my, my.find.cur + (e.shiftKey ? -1 : 1)); }
      if (e.key === 'Escape') { e.preventDefault(); sq.value = ''; find(my, ''); my.scroll.focus({ preventScroll: true }); }
    });
    // page courante (saisie directe)
    const pin = ov.querySelector('.pdx-pgin');
    pin.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const n = parseInt(pin.value, 10); if (n >= 1) goTo(my, n - 1); pin.blur(); my.scroll.focus({ preventScroll: true }); } if (e.key === 'Escape') { pin.blur(); updateStatus(my); } });
    pin.addEventListener('focus', () => pin.select());
    pin.addEventListener('blur', () => updateStatus(my));
    // défilement
    let rafS = 0;
    my.scroll.addEventListener('scroll', () => { if (rafS) return; rafS = requestAnimationFrame(() => { rafS = 0; updateStatus(my); hideSelPop(my); paintSelBar(my); }); }, { passive: true });
    if (window.AlixoZoom) AlixoZoom.bindWheel(my.scroll, ZK);
    // vignettes : glisser-déposer
    const thumbs = ov.querySelector('.pdx-thumbs'); let dragKey = null;
    thumbs.addEventListener('dragstart', e => { const t = e.target.closest('.pdx-thumb'); if (!t || my.readOnlyHard) { e.preventDefault(); return; } dragKey = t.dataset.key; t.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'page'); } catch { /* */ } });
    thumbs.addEventListener('dragover', e => {
      if (!dragKey) return; e.preventDefault();
      const t = e.target.closest('.pdx-thumb'); thumbs.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
      if (t) { const r = t.getBoundingClientRect(); t.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after'); }
    });
    thumbs.addEventListener('drop', e => {
      if (!dragKey) return; e.preventDefault();
      const t = e.target.closest('.pdx-thumb'); let to = my.model.pages.length;
      if (t) { const r = t.getBoundingClientRect(); to = idxOf(my, t.dataset.key) + (e.clientY < r.top + r.height / 2 ? 0 : 1); }
      const k = dragKey; dragKey = null; thumbs.querySelectorAll('.dragging, .drop-before, .drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after'));
      movePage(my, k, to);
    });
    thumbs.addEventListener('dragend', () => { dragKey = null; thumbs.querySelectorAll('.dragging, .drop-before, .drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after')); });
    thumbs.addEventListener('keydown', e => {
      const t = e.target.closest('.pdx-thumb'); if (!t) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(my, idxOf(my, t.dataset.key), { smooth: false }); }
      if ((e.key === 'Delete') && !my.readOnlyHard) { e.preventDefault(); e.stopPropagation(); pageOp(my, t.dataset.key, 'delete'); }
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); e.stopPropagation(); stepPage(my, t.dataset.key, e.key === 'ArrowUp' ? -1 : 1); return; }
      if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); e.stopPropagation(); thumbMenu(my, t.dataset.key, t.querySelector('.pdx-tmenu') || t); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); const n = e.key === 'ArrowDown' ? t.nextElementSibling : t.previousElementSibling; if (n) { goTo(my, idxOf(my, n.dataset.key), { smooth: false }); n.focus(); } }
    });
    // 1.56.0 : clic sur un champ de formulaire de la page (outil Sélection) → volet « Formulaire », champ actif
    my.pagesEl.addEventListener('click', e => {
      if (my.view.tool !== 'select' || !my.fields || e.target.closest('.pdx-a, .pdx-nat, .pdx-bubble, .pdx-tedit')) return;
      const s = getSelection(); if (s && !s.isCollapsed) return;
      const el = e.target.closest('.pdx-page'); const ps = el && my.ps.get(el.dataset.key); if (!ps || !ps.vp1 || !ps.svg) return;
      const [x, y] = A().toPdf(ps, e.clientX, e.clientY); const n = fieldAt(my, ps, x, y);
      if (n) focusField(my, n);
    });
    // sélection de texte → petite barre
    my.pagesEl.addEventListener('mouseup', () => setTimeout(() => showSelPop(my), 10));
    my.pagesEl.addEventListener('keyup', e => { if (e.shiftKey) showSelPop(my); });
    // clic en présentation : page suivante
    my.scroll.addEventListener('click', e => { if (!ov.classList.contains('pdx-present') || my.view.tool !== 'select' || e.target.closest('.pdx-a')) return; const s = getSelection(); if (s && !s.isCollapsed) return; goTo(my, my.cur + (e.clientX < innerWidth / 4 ? -1 : 1)); });
    // pincement à deux doigts (écrans tactiles)
    const pts = new Map(); let pinch = null;
    my.scroll.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: my.view.zoom }; } });
    my.scroll.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]); if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); my.view.mode = 'free'; setZoom(my, Math.max(0.5, Math.min(3, pinch.z * d / (pinch.d || 1)))); } });
    const pend = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    my.scroll.addEventListener('pointerup', pend); my.scroll.addEventListener('pointercancel', pend);
    // les raccourcis des séances ne réagissent pas ici ; ceux de l'application qui doivent passer remontent
    ov.addEventListener('keydown', e => {
      const mod = e.ctrlKey || e.metaKey;
      if ((mod && (e.key === 'Tab' || e.key.toLowerCase() === 'w')) || (e.altKey && e.key === 'ArrowLeft') || e.key === 'F8') return;
      if (e.target.closest('.pdx-aipanel') && !(mod && ['s', 'p'].includes(e.key.toLowerCase()))) { e.stopPropagation(); return; }
      onKey(my, e);
      e.stopPropagation();
    });
    ov.addEventListener('keyup', e => e.stopPropagation());
  }
  function onKey(my, e) {
    if (!my.loaded) return;
    const mod = e.ctrlKey || e.metaKey; const k = e.key; const lk = k.toLowerCase();
    const inField = e.target.matches('input, textarea, select, [contenteditable="true"]');
    if (mod && !e.altKey && lk === 's') { e.preventDefault(); saveNow(my); return; }
    if (mod && !e.altKey && lk === 'p') { e.preventDefault(); print(my); return; }
    if (mod && !e.altKey && lk === 'f') { e.preventDefault(); openFind(my); return; }
    if (k === 'F3') { e.preventDefault(); gotoHit(my, my.find.cur + (e.shiftKey ? -1 : 1)); return; }
    if (inField) return;
    if (mod && lk === 'z' && !e.shiftKey) { e.preventDefault(); undo(my, -1); return; }
    if (mod && (lk === 'y' || (lk === 'z' && e.shiftKey))) { e.preventDefault(); undo(my, 1); return; }
    if (window.AlixoZoom && AlixoZoom.handleKey(e, ZK)) return;
    if (A().key(my, e)) return;
    if (k === 'Escape') { if (my.ov.classList.contains('pdx-present')) { leavePresent(my); return; } if (my.view.tool !== 'select') { setTool(my, 'select'); return; } hideSelPop(my); return; }
    if (k === 'F5') { e.preventDefault(); if (my.ov.classList.contains('pdx-present')) leavePresent(my); else enterPresent(my); return; }
    if (mod || e.altKey) return;
    const present = my.ov.classList.contains('pdx-present');
    if (present && ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); goTo(my, my.cur + 1); return; }
    if (present && ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); goTo(my, my.cur - 1); return; }
    if (k === 'PageDown' && my.view.mode === 'page') { e.preventDefault(); goTo(my, my.cur + 1); return; }
    if (k === 'PageUp' && my.view.mode === 'page') { e.preventDefault(); goTo(my, my.cur - 1); return; }
    if (k === 'Home') { e.preventDefault(); goTo(my, 0); return; }
    if (k === 'End') { e.preventDefault(); goTo(my, my.model.pages.length - 1); return; }
    const TK = { v: 'select', p: 'pen', h: 'hl', t: 'text', n: 'note', e: 'erase' };
    if (TK[lk] && !my.readOnlyHard) { e.preventDefault(); setTool(my, TK[lk]); return; }
    if (lk === 'r') { e.preventDefault(); rotateView(my); }
  }
  /* raccourcis de l'application pendant qu'un PDF est affiché (focus hors de l'onglet) */
  document.addEventListener('keydown', e => {
    if (!ed || ed.ov.hidden || ed.ov.contains(e.target) || document.querySelector('.dlgov')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && ['s', 'p', 'f'].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopImmediatePropagation(); onKey(ed, e); return; }
    // focus perdu (élément retiré du DOM) : annuler / rétablir restent ceux du PDF
    if (mod && !e.altKey && ['z', 'y'].includes(e.key.toLowerCase()) && (e.target === document.body || e.target === document.documentElement)) { e.stopImmediatePropagation(); onKey(ed, e); return; }
    if (window.AlixoApp && AlixoApp.tabs) {
      if (mod && !e.altKey && e.key.toLowerCase() === 'w') { e.preventDefault(); e.stopImmediatePropagation(); AlixoApp.tabs.close(ed.id); return; }
      if (mod && e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); const l = AlixoApp.tabs.list(); const i = l.indexOf(ed.id); const n = i + (e.shiftKey ? -1 : 1); if (n < 0 || n >= l.length) AlixoApp.showLibrary(); else AlixoApp.openDoc(l[n]); return; }
      if (e.altKey && !mod && e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); AlixoApp.showLibrary(); return; }
    }
  }, true);
  /* dans l'onglet : Ctrl+W / Ctrl+Tab / Alt+← remontent jusqu'ici (la page ne les traite que pour les séances) */
  document.addEventListener('keydown', e => {
    if (!ed || ed.ov.hidden || !ed.ov.contains(e.target) || !window.AlixoApp || !AlixoApp.tabs) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 'w') { e.preventDefault(); e.stopImmediatePropagation(); AlixoApp.tabs.close(ed.id); return; }
    if (mod && e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); const l = AlixoApp.tabs.list(); const i = l.indexOf(ed.id); const n = i + (e.shiftKey ? -1 : 1); if (n < 0 || n >= l.length) AlixoApp.showLibrary(); else AlixoApp.openDoc(l[n]); return; }
    if (e.altKey && !mod && e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); AlixoApp.showLibrary(); }
  }, true);
  document.addEventListener('selectionchange', () => { if (ed && !ed.ov.hidden) { const s = getSelection(); if (!s || s.isCollapsed) hideSelPop(ed); } });
  window.addEventListener('resize', () => { if (ed && !ed.ov.hidden) { if (ed.view.mode !== 'free') applyMode(ed); paintSelBar(ed); checkOverflow(ed); } });

  /* 1.56.0 : infobulle maison des barres du PDF : libellé + raccourci (<kbd>, ⌘ sur Mac), après 300 ms, attachée à
     <body> (jamais rognée par la barre qui défile) ; rien sur téléphone */
  let tipEl = null, tipTm = 0, tipFor = null;
  function showTip(el) {
    if (!el.isConnected || isMobile()) return;
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'pdx-tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true; document.body.appendChild(tipEl); }
    tipEl.textContent = el.dataset.tip + (el.disabled && el.dataset.tipLock ? ' (PDF verrouillé : lecture seule)' : '');
    if (el.dataset.kbd) { const k = document.createElement('kbd'); k.textContent = kbd(el.dataset.kbd); tipEl.append(k); }
    tipEl.hidden = false;
    const r = el.getBoundingClientRect(); const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    tipEl.style.top = (r.bottom + 8 + h > innerHeight ? Math.max(8, r.top - h - 8) : r.bottom + 8) + 'px';
  }
  function hideTip() { clearTimeout(tipTm); tipFor = null; if (tipEl) tipEl.hidden = true; }
  const tipTarget = t => (t && t.closest ? t.closest('.pdx-doc [data-tip]') : null);
  document.addEventListener('pointerover', e => { const el = tipTarget(e.target); if (el === tipFor) return; hideTip(); if (!el || e.pointerType === 'touch') return; tipFor = el; tipTm = setTimeout(() => showTip(el), 300); });
  document.addEventListener('focusin', e => { const el = tipTarget(e.target); if (el === tipFor) return; hideTip(); let fv = false; try { fv = !!el && el.matches(':focus-visible'); } catch { /* */ } if (fv) { tipFor = el; tipTm = setTimeout(() => showTip(el), 300); } });
  document.addEventListener('pointerdown', hideTip, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') hideTip(); }, true);
  document.addEventListener('scroll', hideTip, true);
  window.addEventListener('beforeunload', () => { for (const my of eds.values()) if (my.dirty) flushDraft(my); });
  /* 1.56.0 : si pdf.js n'a pas pu lire le fichier, on ne l'affiche plus dans un cadre de la page : sur la version PC,
     il s'ouvre avec l'application de l'ordinateur ; sur le web, avec le lecteur du navigateur dans un onglet séparé
     (choix explicite de l'utilisateur, jamais automatique) */
  async function fallbackOpen(my) { return openOutside(my.name, my.origBuf); }
  async function openOutside(name, buf) {
    if (window.alixoDesktop && alixoDesktop.openData) {
      try { const r = await alixoDesktop.openData({ name: /\.pdf$/i.test(name || '') ? name : 'document.pdf', data: new Uint8Array(buf) }); if (r && r.ok) return true; if (r && r.error) console.error(r.error); }
      catch (e) { console.error(e); }
      say('Aucune application n’a pu ouvrir ce PDF sur l’ordinateur.', { duration: 5000 }); return false;
    }
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }

  /* ---------------- l'onglet « pdf » de la barre des onglets ---------------- */
  const tabHandler = {
    open(id, data) {
      if (eds.has(id)) { show(id); return; }
      const f = data && data.fileId && window.AlixoFiles ? AlixoFiles.byId(data.fileId) : null;
      if (!f) { if (window.AlixoApp && AlixoApp.tabs) AlixoApp.tabs.close(id); return; }
      const host = viewHost(); host.hidden = false;
      const wait = document.createElement('div'); wait.className = 'pdx-doc pdx-waitdoc'; wait.innerHTML = `<div class="pdx-wait"><span class="pdx-spin"></span><span>Ouverture de « ${escH(f.name)} »…</span></div>`; host.appendChild(wait);
      AlixoFiles.getData(f.id).then(buf => {
        wait.remove();
        if (!buf) { say('Le contenu de ce PDF n’est pas sur cet appareil'); if (window.AlixoApp) AlixoApp.tabs.close(id); return; }
        const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const my = build(id, { name: f.name, ab, fileId: f.id, folderId: f.folderId || null, shared: false });
        if (window.AlixoApp && AlixoApp.tabs.current() === id) show(id);
        load(my);
      }).catch(err => { console.error(err); wait.remove(); say('Ce PDF n’a pas pu être ouvert'); if (window.AlixoApp) AlixoApp.tabs.close(id); });
    },
    leave(id) { hide(eds.get(id)); },
    close(id) { close(id); },
    restore(id) {
      const fid = id.slice(4); if (fid.startsWith('tmp-')) return null;
      const f = window.AlixoFiles ? AlixoFiles.byId(fid) : null; if (!f || !canOpen(f.name)) return null;
      return { title: f.name, icon: tabIcon(), data: { fileId: f.id, folderId: f.folderId || null } };
    }
  };
  if (window.AlixoApp && AlixoApp.tabs) AlixoApp.tabs.register('pdf', tabHandler);

  /* ============================================================
     Aperçu en lecture seule (fenêtre d'un fichier, panneau « à côté du cours »)
     ============================================================ */
  /* 1.56.0 : mêmes bornes que l'éditeur (taille, nombre de pages) ; en cas d'échec, l'erreur porte un message à afficher
     (err.userMsg) — l'appelant n'affiche plus de cadre du lecteur du navigateur */
  async function preview(container, { name, buf, fit = true } = {}) {
    const uerr = m => Object.assign(new Error(m), { userMsg: m });
    const ab = buf instanceof ArrayBuffer ? buf : buf && buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : null;
    if (!ab || !ab.byteLength) throw uerr('Ce fichier est vide ou illisible.');
    const max = isMobile() ? MAX_MOBILE : MAX_BYTES;
    if (ab.byteLength > max) throw uerr(tooBigMsg(max));
    let pdf;
    try { pdf = await loadPdf(ab, r => askPassword(name || 'PDF', r)); }
    catch (e) { console.error(e); throw uerr(e && e.name === 'PasswordException' ? 'Mot de passe non saisi : le PDF reste fermé.' : 'Ce PDF semble endommagé ou incomplet : Alixo n’arrive pas à l’afficher.'); }
    if (pdf.numPages > MAX_PAGES) { const n = pdf.numPages; try { pdf.destroy(); } catch { /* */ } throw uerr(tooManyMsg(n)); }
    container.innerHTML = '';
    const host = document.createElement('div'); host.className = 'pdx-preview'; container.appendChild(host);
    host.innerHTML = '<div class="pdx-scroll"><div class="pdx-pages"></div></div>';
    const my = { preview: true, id: 'pv' + uidL(), ov: null, scroll: host.querySelector('.pdx-scroll'), pagesEl: host.querySelector('.pdx-pages'), docs: [pdf], sources: [ab], ps: new Map(), sizes: [[]], textCache: new Map(),
      model: newModel(pdf.numPages), images: {}, view: { zoom: 1, mode: fit ? 'width' : 'free', rotation: 0, tool: 'select' }, find: { marks: {} }, loaded: true, hooks: {} };
    const p1 = await pdf.getPage(1); my.sizes[0][0] = { view: p1.view.slice(), rot0: p1.rotate };
    my.io = new IntersectionObserver(entries => { for (const en of entries) { const ps = my.ps.get(en.target.dataset.key); if (!ps) continue; ps.visible = en.isIntersecting; if (!ps.visible) releasePage(ps); } schedule(my); }, { root: my.scroll, rootMargin: '100% 0px' });
    syncPages(my);
    for (const ps of my.ps.values()) my.io.observe(ps.el);
    applyMode(my);
    fetchSizes(my, 0);
    my.scroll.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); my.view.mode = 'free'; setZoom(my, Math.max(0.3, Math.min(3, my.view.zoom * Math.exp(-e.deltaY * 0.0022)))); }, { passive: false });
    const ro = new ResizeObserver(() => { if (!host.isConnected) { dispose(); return; } if (my.view.mode !== 'free') applyMode(my); });
    ro.observe(my.scroll);
    let gone = false;
    function dispose() { if (gone) return; gone = true; ro.disconnect(); my.io.disconnect(); for (const ps of my.ps.values()) releasePage(ps); try { pdf.destroy(); } catch { /* */ } }
    eds.set(my.id, my); const unregister = () => eds.delete(my.id);
    return () => { unregister(); dispose(); };
  }

  /* la version PC : menu Affichage › Zoom → le PDF affiché */
  function desktopZoom(dir) { if (!ed || ed.ov.hidden) return false; if (dir === 0) { ed.view.mode = 'free'; setZoom(ed, 1); } else stepZoom(ed, dir); return true; }

  /* outils pour les tests automatisés (scripts/v1560-pdf-test.js) et pour js/pdf-ai.js */
  const _debug = {
    get my() { return ed; },
    pageText: async i => { const my = ed; const p = my.model.pages[i]; const tc = await pageText(my, my.ps.get(p.key)); return itemsText(tc.items); },
    model: () => ed && JSON.parse(snapJSON(ed)),
    setTool: t => ed && setTool(ed, t), movePage: (k, to) => ed && movePage(ed, k, to), pageOp: (k, op) => ed && pageOp(ed, k, op),
    find: q => ed && find(ed, q), mergeBuffer: (ab, n) => ed && mergeBuffer(ed, ab, n), produce: () => ed && produce(ed), pagePng: i => ed && pagePng(ed, i),
    setZoom: z => { if (ed) { ed.view.mode = 'free'; setZoom(ed, z); } }, sanitizeModel, sanitizeImages
  };
  return { open, close, canOpen, preview, ready, desktopZoom, current: () => ed, openTabs: () => [...eds.keys()].filter(k => k.startsWith('pdf:')), isOpen: () => !!ed && !ed.ov.hidden,
    allText, pageText, itemsText, goTo, createSeance, setState, say, I, escH, saveNow, _debug };
})();
