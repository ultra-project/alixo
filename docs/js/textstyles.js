/* ============================================================
   Alixo — styles enregistrés (1.52)
   Un style = la mise en forme d'un passage (gras, italique, souligné, barré, couleur, surlignage, police, taille,
   alignement) sous un nom choisi par l'étudiant ; il se rejoue d'un clic sur une autre sélection. Les styles vivent dans
   state.settings.textStyles : ils suivent le compte (sync.js) comme les autres réglages.
   Chargé APRÈS app.js : s'appuie sur AlixoApp (applyFmt, applyFontSize, setAlign, batchFmt…) et AlixoSanitize.
   Sécurité : tout ce qui est lu dans les réglages (donc venu du nuage) repasse par normalize() — couleurs, taille, police
   et alignement par les validateurs de sanitize.js, nom en texte brut borné ; aucune valeur n'est interpolée sans cela.
   API (window.AlixoTextStyles) : list(), capture(), add(style), apply(style, savedRange), saveFromSelection(name, range),
   rename(id, name), remove(id), update(id, range), openMenu(btn), normalize(raw), previewCss(style), describe(style)
   ============================================================ */
'use strict';

window.AlixoTextStyles = (() => {
  const MAX_STYLES = 30;
  const MAX_NAME = 40;
  const ID_RE = /^[\w-]{1,24}$/;
  const A = () => window.AlixoApp;
  const S = () => window.AlixoSanitize;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const uid = () => 'ts_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const settings = () => { const app = A(); return app && app.state && app.state.settings ? app.state.settings : null; };
  /* [clé du style, commande, balises qui portent cette mise en forme dans une sélection partiellement formatée] */
  const CMDS = [['b', 'bold', 'b, strong, [style*="font-weight"]'], ['i', 'italic', 'i, em, [style*="font-style"]'], ['u', 'underline', 'u, [style*="underline"]'], ['s', 'strikeThrough', 's, strike, del, [style*="line-through"]']];
  /* la sélection contient-elle (en partie) une telle balise ? queryCommandState répond « non » pour un passage à moitié en gras */
  function partially(selector) {
    const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return false;
    const r = sel.getRangeAt(0);
    try { const frag = r.cloneContents(); if (frag.querySelector(selector)) return true; } catch { /* sélection hors document */ }
    const el = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentElement : r.commonAncestorContainer;
    return !!(el && el.closest && el.closest(selector) && el.closest('[contenteditable="true"]') && el.closest('[contenteditable="true"]').contains(el.closest(selector)));
  }
  const AL_LABEL = { left: 'À gauche', center: 'Centré', right: 'À droite', justify: 'Justifié' };
  const q = cmd => { try { return !!document.queryCommandState(cmd); } catch { return false; } };

  /* ---------------- données ---------------- */
  /* nom en texte brut : sans caractères de contrôle, espaces normalisés, 40 caractères au plus */
  const cleanName = v => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '');
  /* « rgb(192, 67, 67) » (ce que rend le navigateur) → « #c04343 » ; les autres formes validées restent telles quelles */
  function toHex(c) {
    const m = String(c || '').match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*(1|1\.0|0?\.\d+)\s*)?\)$/i);
    if (!m || (m[4] !== undefined && +m[4] < 1)) return c;
    return '#' + [m[1], m[2], m[3]].map(x => Math.min(255, +x).toString(16).padStart(2, '0')).join('');
  }
  /* objet quelconque → style sûr, ou null si inutilisable (sans nom) ; loose : sans nom admis (aperçu d'une capture) */
  function normalize(raw, loose) {
    if (!raw || typeof raw !== 'object' || !S()) return null;
    const name = cleanName(raw.name); if (!name && !loose) return null;
    const o = { id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : uid(), name, b: !!raw.b, i: !!raw.i, u: !!raw.u, s: !!raw.s };
    const color = S().color(raw.color); if (color) o.color = toHex(color);
    const bg = S().color(raw.bg); if (bg) o.bg = toHex(bg);
    const size = typeof raw.size === 'number' || typeof raw.size === 'string' ? +String(raw.size).replace(',', '.') : NaN;
    if (Number.isFinite(size) && size >= 5 && size <= 96) o.size = Math.round(size * 2) / 2;
    if (typeof raw.font === 'string' && raw.font && A()) { const fo = A().fontByKey(raw.font); if (fo && fo.k) o.font = fo.k; }
    const al = S().align(raw.al); if (al) o.al = al;
    o.ts = Number.isFinite(+raw.ts) && +raw.ts > 0 ? +raw.ts : Date.now();
    return o;
  }
  /* styles enregistrés, tous revalidés (les réglages peuvent venir d'un autre appareil) */
  function list() {
    const st = settings(); if (!st) return [];
    const arr = Array.isArray(st.textStyles) ? st.textStyles : [];
    const out = []; const ids = new Set();
    for (const r of arr.slice(0, MAX_STYLES)) { const n = normalize(r); if (n && !ids.has(n.id)) { ids.add(n.id); out.push(n); } }
    return out;
  }
  function store(arr) { const st = settings(); if (!st) return; st.textStyles = arr; A().save(); }
  const byId = id => list().find(x => x.id === id) || null;
  const nameTaken = (name, exceptId) => list().some(x => x.id !== exceptId && x.name.toLowerCase() === name.toLowerCase());
  /* ajoute un style ; renvoie { ok, style } ou { ok: false, error } */
  function add(raw) {
    const st = normalize(raw);
    if (!st) return { ok: false, error: 'Donnez un nom à ce style.' };
    const name = cleanName(raw && raw.name);
    if (name.length > MAX_NAME || (raw && typeof raw.name === 'string' && raw.name.trim().length > MAX_NAME)) return { ok: false, error: `Le nom ne peut pas dépasser ${MAX_NAME} caractères.` };
    const cur = list();
    if (cur.length >= MAX_STYLES) return { ok: false, error: `Vous avez déjà ${MAX_STYLES} styles : supprimez-en un d’abord.` };
    if (nameTaken(st.name)) return { ok: false, error: `Un style s’appelle déjà « ${st.name} ».` };
    st.ts = Date.now();
    store(cur.concat([st]));
    return { ok: true, style: st };
  }
  function rename(id, name) {
    const n = cleanName(name); if (!n) return { ok: false, error: 'Donnez un nom à ce style.' };
    if (typeof name === 'string' && name.trim().length > MAX_NAME) return { ok: false, error: `Le nom ne peut pas dépasser ${MAX_NAME} caractères.` };
    if (nameTaken(n, id)) return { ok: false, error: `Un style s’appelle déjà « ${n} ».` };
    const cur = list(); const st = cur.find(x => x.id === id); if (!st) return { ok: false, error: 'Style introuvable.' };
    st.name = n; store(cur);
    return { ok: true, style: st };
  }
  function remove(id) { const cur = list(); const st = cur.find(x => x.id === id); if (!st) return false; store(cur.filter(x => x.id !== id)); return true; }

  /* ---------------- capture de la mise en forme au curseur ---------------- */
  const hostOf = node => { const el = node && (node.nodeType === 3 ? node.parentElement : node); return el && el.closest ? el.closest('[contenteditable="true"]') : null; };
  function restore(saved) {
    if (!saved) return;
    const host = hostOf(saved.startContainer); if (host) host.focus({ preventScroll: true });
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(saved);
  }
  /* mise en forme au point de départ de la sélection (ou du curseur) : gras… par queryCommandState, couleur / surlignage /
     taille / police par les span ancêtres lus avec AlixoSanitize.spanProps (jamais getComputedStyle), alignement du bloc ou de
     la case. null : pas dans un texte de la séance (champ de saisie, objet sélectionné) */
  function capture(saved) {
    const app = A(); if (!app) return null;
    if (saved) restore(saved);
    const f = app.activeField();
    if (!f || f.tagName === 'INPUT' || !app.blocksEl.contains(f)) return null;
    const sel = getSelection(); if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0); if (!f.contains(r.startContainer)) return null;
    const st = { b: q('bold'), i: q('italic'), u: q('underline'), s: q('strikeThrough') };
    let node = r.startContainer;
    if (node.nodeType === 1 && !r.collapsed && node.childNodes[r.startOffset]) node = node.childNodes[r.startOffset];
    while (node && node.nodeType === 1 && node.firstChild && !r.collapsed) node = node.firstChild;   // premier caractère sélectionné
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    const props = {};
    while (el && el !== f && f.contains(el)) {
      if (el.tagName === 'SPAN' || el.tagName === 'FONT') { const p = S().spanProps(el); if (p) for (const k of Object.keys(p)) if (!props[k]) props[k] = p[k]; }
      el = el.parentElement;
    }
    if (props.color) st.color = toHex(props.color);
    if (props['background-color']) st.bg = toHex(props['background-color']);
    if (props['font-size']) { const n = parseFloat(props['font-size']); if (Number.isFinite(n)) st.size = n; }
    if (props['font-family']) { const fo = app.DOC_FONTS.find(x => x.k && x.css === props['font-family']); if (fo) st.font = fo.k; }
    const al = app.currentAlign();
    const bl = f.closest('#blocks > .block'); const b = bl ? app.getBlock(bl.dataset.id) : null;
    if (al && (al !== 'left' || (b && b.al))) st.al = al;
    return st;
  }
  /* enregistre la mise en forme de la sélection sous un nom */
  function saveFromSelection(name, saved) {
    const cap = capture(saved);
    if (!cap) return { ok: false, error: 'Placez le curseur dans un texte mis en forme, ou sélectionnez-en.' };
    return add(Object.assign({}, cap, { name }));
  }
  /* « Mettre à jour avec la sélection » : même nom et même identifiant, nouvelle mise en forme */
  function update(id, saved) {
    const cur = list(); const st = cur.find(x => x.id === id); if (!st) return { ok: false, error: 'Style introuvable.' };
    const cap = capture(saved);
    if (!cap) return { ok: false, error: 'Placez le curseur dans un texte mis en forme, ou sélectionnez-en.' };
    const n = normalize(Object.assign({}, cap, { id, name: st.name }));
    store(cur.map(x => (x.id === id ? n : x)));
    return { ok: true, style: n };
  }

  /* ---------------- application ---------------- */
  /* rejoue la mise en forme sur la sélection (ou pour la suite de la frappe). Booléens forcés (un style sans gras retire le
     gras) ; couleur / surlignage absents → « Automatique » / « Aucun » ; police, taille, alignement absents → non touchés.
     Un seul lot d'historique (AlixoApp.batchFmt) : Ctrl+Z revient en une fois. */
  function apply(style, saved) {
    const app = A(); if (!app) return false;
    const st = normalize(style); if (!st) return false;
    if (app.isReadOnly()) { app.toast('Cette séance est en lecture seule'); return false; }
    if (saved) restore(saved);
    const f = app.activeField();
    if (!f || f.tagName === 'INPUT' || !app.blocksEl.contains(f)) { app.toast('Placez le curseur dans un texte, ou sélectionnez-en, puis choisissez le style'); return false; }
    const tsel = app.tselInfo();
    app.batchFmt(() => {
      for (const [k, cmd, tags] of CMDS) {
        if (q(cmd) !== st[k]) app.applyFmt(cmd);
        else if (!st[k] && partially(tags)) { app.applyFmt(cmd); app.applyFmt(cmd); }   // à moitié en gras : tout en gras, puis plus rien
      }
      app.applyFmt('foreColor', st.color || 'inherit', true);
      if (tsel) { const tb = app.getBlock(tsel.bid); if (tb) app.setCellsBg(tb, tsel.cells, st.bg || ''); }
      else app.applyFmt('hiliteColor', st.bg || 'transparent', true);
      if (st.font) { const fo = app.fontByKey(st.font); if (fo && fo.css) app.applyFmt('fontName', fo.css, true); }
      if (st.size) app.applyFontSize(st.size);
      if (st.al) app.setAlign(st.al);   // en dernier : le rendu du bloc défait la sélection
    });
    if (app.updateToolbarState) app.updateToolbarState();   // 1.52 : boutons G, I, couleur… à jour tout de suite
    app.toast(`Style « ${st.name} » appliqué`, { action: 'Annuler', onAction: () => app.undoEdit() });
    return true;
  }
  /* 1.52 : remet un style tel qu'il était (Annuler d'une mise à jour ou d'une suppression) — à sa place dans la liste */
  function putBack(old, index) {
    const cur = list().filter(x => x.id !== old.id);
    if (nameTaken(old.name, old.id)) return false;
    cur.splice(Math.max(0, Math.min(index, cur.length)), 0, old);
    store(cur.slice(0, MAX_STYLES));
    return true;
  }
  const undoToast = (msg, old, index) => A().toast(msg, { action: 'Annuler', onAction: () => { if (putBack(old, index)) A().toast(`Style « ${old.name} » rétabli`); else A().toast('Ce style ne peut pas être rétabli : un autre porte déjà ce nom'); } });

  /* ---------------- aperçu ---------------- */
  /* CSS de l'aperçu « Aa », construit uniquement à partir des champs validés par normalize */
  function previewCss(style) {
    const st = normalize(style, true); if (!st) return '';
    const p = [];
    if (st.color) p.push('color: ' + st.color);
    if (st.bg) p.push('background-color: ' + st.bg);
    if (st.font && A()) { const fo = A().fontByKey(st.font); if (fo && fo.css) p.push('font-family: ' + fo.css); }
    if (st.b) p.push('font-weight: 700');
    if (st.i) p.push('font-style: italic');
    const deco = [st.u ? 'underline' : '', st.s ? 'line-through' : ''].filter(Boolean);
    if (deco.length) p.push('text-decoration-line: ' + deco.join(' '));
    if (st.size) p.push('font-size: ' + Math.min(19, Math.max(9, st.size)) + 'pt');
    return p.join('; ');
  }
  /* « Gras · 14 pt · Garamond · Centré » */
  function describe(style) {
    const st = normalize(style, true); if (!st) return '';
    const parts = [];
    if (st.b) parts.push('Gras'); if (st.i) parts.push('Italique'); if (st.u) parts.push('Souligné'); if (st.s) parts.push('Barré');
    if (st.color) parts.push('Couleur'); if (st.bg) parts.push('Surligné');
    if (st.size) parts.push(String(st.size).replace('.', ',') + ' pt');
    if (st.font && A()) { const fo = A().fontByKey(st.font); if (fo) parts.push(fo.name); }
    if (st.al) parts.push(AL_LABEL[st.al]);
    return parts.length ? parts.join(' · ') : 'Texte simple';
  }
  const previewHTML = st => `<span class="po-tstyle-prev" style="${esc(previewCss(st))}">Aa</span>`;

  /* ---------------- menu de la barre d'outils ---------------- */
  const ICO = {
    more: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/></svg>',
    apply: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    rename: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/></svg>',
    update: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0 2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
  };
  let menu = null;   // { rect, saved } pendant qu'un menu est ouvert
  function openMenu(btn) {
    const app = A(); if (!app || !btn) return;
    const sel = getSelection();
    const saved = sel.rangeCount && app.blocksEl.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    menu = { rect: btn.getBoundingClientRect(), saved };
    renderList();
  }
  function mount(html, onClick) {
    A().showPopover(html, menu.rect, pop => {
      pop.addEventListener('pointerdown', ev => { if (!ev.target.closest('input')) ev.preventDefault(); });   // la sélection du cours reste
      pop.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) onClick(b, ev); });
    });
  }
  function renderList() {
    const styles = list();
    const rows = styles.map(st => `<div class="po-tstyle">
        <button type="button" class="po-tstyle-apply" data-apply="${esc(st.id)}" title="Appliquer « ${esc(st.name)} » à la sélection">${previewHTML(st)}<span class="po-tstyle-txt"><span class="po-tstyle-name">${esc(st.name)}</span><span class="po-tstyle-desc">${esc(describe(st))}</span></span></button>
        <button type="button" class="po-tstyle-more" data-more="${esc(st.id)}" title="Renommer, mettre à jour ou supprimer « ${esc(st.name)} »" aria-label="Actions pour ${esc(st.name)}">${ICO.more}</button>
      </div>`).join('');
    const empty = `<div class="po-tstyle-empty">Aucun style enregistré. Sélectionnez un texte mis en forme, puis « Enregistrer le style de la sélection ».</div>`;
    const full = styles.length >= MAX_STYLES;
    mount(`<h4>Styles enregistrés</h4>
      <div class="po-tstyles">${styles.length ? rows : empty}</div>
      <div class="po-tstyle-foot"><button type="button" class="cta ghost small po-tstyle-save" data-save="1" ${full ? 'disabled' : ''} title="${full ? `${MAX_STYLES} styles au plus : supprimez-en un d’abord` : 'Enregistre la mise en forme du texte sélectionné (ou au curseur) sous un nom'}">${ICO.plus} Enregistrer le style de la sélection…</button></div>`,
    b => {
      const app = A();
      if (b.dataset.apply) { app.hidePopover(); const st = byId(b.dataset.apply); if (st) apply(st, menu.saved); return; }
      if (b.dataset.more) { renderActions(b.dataset.more); return; }
      if (b.dataset.save) {
        const cap = capture(menu.saved);
        if (!cap) { app.toast('Placez le curseur dans un texte mis en forme, ou sélectionnez-en'); return; }
        askName({ title: 'Enregistrer le style', value: '', preview: cap, onOk: name => { const r = add(Object.assign({}, cap, { name })); if (r.ok) app.toast(`Style « ${r.style.name} » enregistré`); return r; } });
      }
    });
  }
  function renderActions(id) {
    const st = byId(id); if (!st) { renderList(); return; }
    mount(`<h4>${esc(st.name)}</h4>
      <div class="po-tstyle po-tstyle-head">${previewHTML(st)}<span class="po-tstyle-txt"><span class="po-tstyle-desc">${esc(describe(st))}</span></span></div>
      <div class="po-tstyle-acts">
        <button type="button" data-act="apply">${ICO.apply} Appliquer à la sélection</button>
        <button type="button" data-act="rename">${ICO.rename} Renommer…</button>
        <button type="button" data-act="update">${ICO.update} Mettre à jour avec la sélection</button>
        <button type="button" data-act="remove" class="danger">${ICO.trash} Supprimer</button>
        <button type="button" data-act="back">${ICO.back} Retour à la liste</button>
      </div>`,
    b => {
      const app = A(); const act = b.dataset.act;
      if (act === 'apply') { app.hidePopover(); apply(st, menu.saved); }
      else if (act === 'rename') askName({ title: 'Renommer le style', value: st.name, preview: st, onOk: name => { const r = rename(st.id, name); if (r.ok) app.toast(`Style renommé « ${r.style.name} »`); return r; } });
      else if (act === 'update') { const at = list().findIndex(x => x.id === st.id); const r = update(st.id, menu.saved); if (r.ok) { app.hidePopover(); undoToast(`Style « ${st.name} » mis à jour`, st, at); } else app.toast(r.error); }
      else if (act === 'remove') renderConfirm(st);
      else renderList();
    });
  }
  function renderConfirm(st) {
    mount(`<h4>Supprimer « ${esc(st.name)} » ?</h4>
      <p class="po-confirm-text">Le style disparaît de la liste ; les textes déjà mis en forme ne changent pas.</p>
      <div class="po-row" style="margin-top:10px; justify-content:flex-end"><button type="button" class="cta ghost small" data-act="back">Annuler</button><button type="button" class="pobtn danger" data-act="yes">Supprimer</button></div>`,
    b => { if (b.dataset.act === 'yes') { const at = list().findIndex(x => x.id === st.id); if (remove(st.id)) undoToast(`Style « ${st.name} » supprimé`, st, at); } renderList(); });
  }
  /* fenêtre « Nom du style » : 40 caractères, nom unique (insensible à la casse) ; onOk(name) renvoie { ok, error } */
  function askName({ title, value, preview, onOk }) {
    const app = A();
    app.openDialog({ id: 'tstyle-name', cls: 'tstyle-dlg', title, sub: 'Un nom court et parlant : « Définition », « Titre jaune », « À retenir »…',
      body: `<div class="po-tstyle po-tstyle-head">${previewHTML(preview)}<span class="po-tstyle-txt"><span class="po-tstyle-desc">${esc(describe(preview))}</span></span></div>
        <div class="po-row" style="margin-top:12px"><input id="tstyle-name-in" maxlength="${MAX_NAME}" value="${esc(value || '')}" placeholder="Nom du style" aria-label="Nom du style" autocomplete="off"></div>
        <div class="po-err" id="tstyle-name-err" role="alert" hidden></div>`,
      foot: `<button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" type="button" id="tstyle-name-ok">${value ? 'Renommer' : 'Enregistrer'}</button>`,
      onMount(card, close) {
        const inp = card.querySelector('#tstyle-name-in'), err = card.querySelector('#tstyle-name-err');
        const go = () => {
          const r = onOk(inp.value);
          if (r && r.ok) { close(); return; }
          err.textContent = (r && r.error) || 'Nom refusé.'; err.hidden = false; inp.setAttribute('aria-invalid', 'true'); inp.focus();
        };
        card.querySelector('#tstyle-name-ok').addEventListener('click', go);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        inp.addEventListener('input', () => { err.hidden = true; inp.removeAttribute('aria-invalid'); });
        setTimeout(() => { inp.focus(); inp.select(); }, 30);
      } });
  }

  return { MAX_STYLES, MAX_NAME, list, normalize, capture, add, apply, saveFromSelection, rename, remove, update, openMenu, previewCss, describe };
})();
