/* ============================================================
   1.55 : Explorateur de fichiers réutilisable (js/explorer.js + explorer.css)
   Fenêtre centrale façon Finder / Explorateur Windows pour choisir un dossier ou un document de la bibliothèque :
   volet gauche (arbre des dossiers repliable), zone droite (sous-dossiers puis documents du dossier courant), fil
   d'Ariane cliquable, boutons Retour et Dossier parent, recherche dans tout l'arbre (avec le chemin des résultats),
   navigation au clavier (↑ ↓ Entrée Retour arrière Échap, Début / Fin).
   1.55 (revue) : un seul bouton principal dont le libellé suit le contexte (dossier sélectionné, sinon dossier ouvert),
   arbre accessible (role="tree" avec « Mes cours », aria-level, aria-expanded, une seule tabulation et flèches),
   bouton « Dossiers » sous 700 px (l'arbre s'ouvre par-dessus la liste au lieu de disparaître).

   AlixoExplorer.pick({
     mode: 'folder' | 'doc',        // choisir un dossier (défaut) ou un document
     title, sub,                    // titre et sous-titre de la fenêtre
     start,                         // dossier ouvert au départ ('' ou null = racine « Mes cours »)
     current,                       // emplacement actuel (mode folder) : marqué « actuel »
     exclude: [ids],                // dossiers non choisissables ni ouvrables (ex. un dossier déplacé et ses descendants)
     allowRoot: true,               // mode folder : la racine « Mes cours » est-elle un choix valable ?
     kinds: ['cours', 'slides'…],   // mode doc : types acceptés (clés de DOC_TYPES : cours, slides, sheet, board, quiz)
     filter: doc => bool,           // mode doc : filtre supplémentaire
     selected,                      // élément présélectionné dans le dossier ouvert (document, ou dossier en mode folder)
     okLabel,                       // libellé du bouton principal (défaut « Choisir » ; mode folder : choix du dossier ouvert,
                                    //   ex. « Déplacer ici » ; défaut « Choisir « <dossier> » »)
     okIntoLabel,                   // 1.55, mode folder : début du libellé quand un sous-dossier est sélectionné (défaut « Choisir »)
     onPick(id)                     // id choisi : identifiant du dossier / document, '' pour la racine
   }) → Promise<id | null>          // null si la fenêtre est fermée sans choix

   Chargé APRÈS app.js : utilise ses fonctions globales (state, folder, childFolders, folderIconHTML, safeTint,
   docType, DOC_TYPES, esc, openDialog, closeDialog). Les noms viennent des données locales : toujours échappés.
   ============================================================ */
'use strict';

window.AlixoExplorer = (() => {
  const ROOT = '';
  const DLG_ID = 'xpov';
  const ICO = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
    home: '<svg class="xp-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7M6 10v9h12v-9"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    caret: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    tree: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h6M4 12h4M4 18h4M10 12h10M10 18h10M12 6h8"/></svg>',
    clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
    empty: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 14a3 3 0 0 1 3-3h9l3.5 4H39a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z"/><path d="M18 28h12"/></svg>'
  };
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fmtDay = ts => (ts ? new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const plural = (n, one, many) => `${n} ${n > 1 ? (many || one + 's') : one}`;

  let open = null;   // une seule fenêtre d'explorateur à la fois

  function pick(opts) {
    const o = Object.assign({ mode: 'folder', allowRoot: true }, opts || {});
    const mode = o.mode === 'doc' ? 'doc' : 'folder';
    if (open) open.cancel();
    return new Promise(resolve => {
      /* ---------------- données ---------------- */
      const folders = () => state.folders;
      const fById = id => (id ? folder(id) : null);
      const excluded = new Set((Array.isArray(o.exclude) ? o.exclude : []).filter(Boolean));
      const isExcluded = id => { for (let f = fById(id); f; f = fById(f.parentId)) if (excluded.has(f.id)) return true; return false; };
      const kids = pid => childFolders(pid || null);
      const docOk = d => {
        if (!d || (d.alxFile && !d.alxFile.online)) return false;
        if (Array.isArray(o.kinds) && o.kinds.length && !o.kinds.includes(docType(d))) return false;
        return typeof o.filter === 'function' ? !!o.filter(d) : true;
      };
      const docsIn = fid => (mode === 'doc' ? state.docs.filter(d => (d.folderId || null) === (fid || null) && docOk(d))
        .sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || ((b.updatedAt || 0) - (a.updatedAt || 0))) : []);
      /* mode doc : nombre de documents choisissables sous un dossier (un dossier vide est grisé, mais reste ouvrable) */
      const countCache = new Map();
      const docCount = fid => {
        if (countCache.has(fid)) return countCache.get(fid);
        let n = docsIn(fid).length; for (const c of kids(fid)) n += docCount(c.id);
        countCache.set(fid, n); return n;
      };
      const pathOf = fid => folderPath(fid);
      const pathText = fid => ['Mes cours', ...pathOf(fid).map(f => f.nom || 'Sans nom')].join(' › ');
      const validStart = id => (id && fById(id) && !isExcluded(id) ? id : ROOT);

      /* ---------------- état de la fenêtre ---------------- */
      let cur = ROOT;              // dossier affiché
      let history = [];            // dossiers précédents (bouton Retour)
      let q = '';                  // recherche
      let sel = null;              // { t: 'f' | 'd', id } — élément sélectionné dans la zone droite
      const expanded = new Set();
      let done = false, card = null;

      const finish = id => {
        if (done) return; done = true; open = null;
        window.removeEventListener('keydown', onWinKey, true);
        closeDialog(DLG_ID);
        if (id !== null && typeof o.onPick === 'function') { try { o.onPick(id); } catch (e) { console.error('Explorateur :', e); } }
        resolve(id);
      };
      const cancel = () => finish(null);
      open = { cancel };

      /* ---------------- rendu ---------------- */
      const tint = f => esc(safeTint(f && f.couleur));
      const fIcon = f => `<span class="xp-fi" style="--mc:${tint(f)}">${folderIconHTML(f)}</span>`;
      const dIcon = d => { const t = DOC_TYPES[docType(d)] || DOC_TYPES.cours; return `<span class="xp-di ${t.cls}">${t.icon}</span>`; };
      const curMark = id => (mode === 'folder' && o.current !== undefined && (o.current || ROOT) === id ? '<span class="xp-cur">actuel</span>' : '');

      function treeHTML(pid, depth) {
        return kids(pid).map(f => {
          const ex = isExcluded(f.id), has = !ex && kids(f.id).length > 0, isOpen = has && expanded.has(f.id);
          return `<div class="xp-tn" role="none">
            <div class="xp-trow ${f.id === cur ? 'on' : ''} ${ex ? 'off' : ''}" style="--d:${depth}">
              ${has ? `<button type="button" class="xp-caret ${isOpen ? 'open' : ''}" data-xt="toggle" data-id="${esc(f.id)}" tabindex="-1" aria-label="${isOpen ? 'Replier' : 'Déplier'} ${esc(f.nom || 'Sans nom')}">${ICO.caret}</button>` : '<span class="xp-caret leaf"></span>'}
              <button type="button" class="xp-tlab" data-xt="go" data-id="${esc(f.id)}" ${ex ? 'aria-disabled="true" data-off="1" title="Impossible : c’est l’élément déplacé (ou l’un de ses sous-dossiers)"' : ''} role="treeitem" tabindex="-1" aria-level="${depth + 1}" ${has ? `aria-expanded="${isOpen}"` : ''} aria-selected="${f.id === cur}">${fIcon(f)}<span class="xp-tname">${esc(f.nom || 'Sans nom')}</span></button>
            </div>
            ${isOpen ? `<div class="xp-tkids" role="group">${treeHTML(f.id, depth + 1)}</div>` : ''}
          </div>`;
        }).join('');
      }
      function crumbsHTML() {
        const parts = [{ id: ROOT, nom: 'Mes cours' }, ...pathOf(cur).map(f => ({ id: f.id, nom: f.nom || 'Sans nom' }))];
        if (q) return `<span class="xp-crumb-q">Résultats pour « ${esc(q)} »</span>`;
        return parts.map((p, i) => (i === parts.length - 1
          ? `<span class="xp-crumb last" aria-current="location">${i === 0 ? ICO.home : ''}${esc(p.nom)}</span>`
          : `<button type="button" class="xp-crumb" data-xt="go" data-id="${esc(p.id)}">${i === 0 ? ICO.home : ''}${esc(p.nom)}</button><span class="xp-sep" aria-hidden="true">›</span>`)).join('');
      }
      /* lignes de la zone droite : [{ t, id, html }] */
      function rows() {
        const out = [];
        const fRow = (f, withPath) => {
          const ex = isExcluded(f.id);
          const n = mode === 'doc' ? docCount(f.id) : kids(f.id).length;
          const info = mode === 'doc' ? (n ? plural(n, 'document') : 'aucun document') : (n ? plural(n, 'sous-dossier') : 'vide');
          out.push({ t: 'f', id: f.id, off: ex, dim: mode === 'doc' && !n, html: `<span class="xp-name">${fIcon(f)}<span class="xp-ntxt"><b>${esc(f.nom || 'Sans nom')}</b>${withPath ? `<small>${esc(pathText(f.parentId))}</small>` : ''}</span>${curMark(f.id)}</span><span class="xp-type">Dossier</span><span class="xp-info">${ex ? 'élément déplacé' : esc(info)}</span>` });
        };
        const dRow = (d, withPath) => {
          const t = DOC_TYPES[docType(d)] || DOC_TYPES.cours;
          out.push({ t: 'd', id: d.id, html: `<span class="xp-name">${dIcon(d)}<span class="xp-ntxt"><b>${esc(d.titre || 'Sans titre')}</b>${withPath ? `<small>${esc(pathText(fById(d.folderId) ? d.folderId : ROOT))}</small>` : ''}</span></span><span class="xp-type">${esc(t.label)}</span><span class="xp-info">${esc(fmtDay(d.updatedAt))}</span>` });
        };
        if (q) {
          const n = fold(q);
          folders().filter(f => fold(f.nom).includes(n) && !isExcluded(f.id)).forEach(f => fRow(f, true));
          if (mode === 'doc') state.docs.filter(d => docOk(d) && (!d.folderId || fById(d.folderId)) && fold(d.titre || 'Sans titre').includes(n))
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 200).forEach(d => dRow(d, true));
          return out;
        }
        kids(cur).forEach(f => fRow(f, false));
        docsIn(cur).forEach(d => dRow(d, false));
        return out;
      }
      /* 1.55 : arbre — une seule tabulation (roving tabindex) ; ↑ ↓ parcourent, → déplie / descend, ← replie / remonte,
         Entrée ou Espace ouvre, Début / Fin */
      const treeItems = () => [...card.querySelectorAll('.xp-tree [role="treeitem"]')];
      function rovingTree(id, focus) {
        const items = treeItems(); if (!items.length) return;
        const t = items.find(b => (b.dataset.id || '') === (id || '')) || items.find(b => b.getAttribute('aria-selected') === 'true') || items[0];
        items.forEach(b => { b.tabIndex = b === t ? 0 : -1; });
        if (focus) t.focus();
      }
      function onTreeKey(e) {
        const b = e.target.closest('[role="treeitem"]'); if (!b) return;
        const items = treeItems(), i = items.indexOf(b), id = b.dataset.id || '';
        const to = j => { if (items[j]) { e.preventDefault(); rovingTree(items[j].dataset.id || '', true); } };
        const isOpen = b.getAttribute('aria-expanded') === 'true', canOpen = b.getAttribute('aria-expanded') === 'false';
        if (e.key === 'ArrowDown') to(i + 1);
        else if (e.key === 'ArrowUp') to(i - 1);
        else if (e.key === 'Home') to(0);
        else if (e.key === 'End') to(items.length - 1);
        else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (canOpen) { expanded.add(id); render(false); rovingTree(id, true); }
          else if (isOpen) to(i + 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (isOpen && id) { expanded.delete(id); render(false); rovingTree(id, true); }
          else if (id) { const f = fById(id); rovingTree(f && f.parentId && fById(f.parentId) ? f.parentId : ROOT, true); }
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); e.stopPropagation();
          if (b.dataset.off) return;
          closeTreeSheet(); go(id);
        }
      }
      const closeTreeSheet = () => { const x = card && card.querySelector('.xp'); if (x && x.classList.contains('tree-open')) { x.classList.remove('tree-open'); const t = card.querySelector('[data-xt="tree"]'); if (t) t.setAttribute('aria-expanded', 'false'); } };

      let list = [];
      function render(focusList) {
        if (!card) return;
        list = rows();
        if (sel && !list.some(r => r.t === sel.t && r.id === sel.id && !r.off)) sel = null;
        const treeEl = card.querySelector('.xp-tree'), treeFocus = treeEl.contains(document.activeElement) ? (document.activeElement.dataset.id ?? null) : null;
        card.querySelector('.xp-tree-items').innerHTML = treeHTML(null, 1);
        const rootRow = card.querySelector('.xp-trow.root'); rootRow.classList.toggle('on', cur === ROOT && !q);
        rootRow.querySelector('.xp-tlab').setAttribute('aria-selected', String(cur === ROOT && !q));
        rovingTree(treeFocus !== null && !focusList ? treeFocus : cur, treeFocus !== null && !focusList);
        card.querySelector('.xp-crumbs').innerHTML = crumbsHTML();
        card.querySelector('[data-xt="back"]').disabled = !history.length;
        card.querySelector('[data-xt="up"]').disabled = cur === ROOT && !q;
        const box = card.querySelector('.xp-items');
        if (!list.length) {
          const msg = q ? `Aucun ${mode === 'doc' ? 'dossier ni document' : 'dossier'} ne correspond à « ${esc(q)} ».`
            : mode === 'doc' ? 'Ce dossier ne contient aucun document à choisir.' : (cur === ROOT ? 'Aucun dossier pour l’instant.' : 'Ce dossier ne contient pas de sous-dossier.');
          box.innerHTML = `<div class="xp-empty">${ICO.empty}<span>${msg}</span></div>`;
        } else {
          box.innerHTML = list.map((r, i) => `<div class="xp-row ${r.off ? 'off' : ''} ${r.dim ? 'dim' : ''} ${sel && sel.t === r.t && sel.id === r.id ? 'sel' : ''}" role="option" id="xp-r${i}" data-i="${i}" aria-selected="${!!(sel && sel.t === r.t && sel.id === r.id)}" ${r.off ? 'aria-disabled="true"' : ''}>${r.html}</div>`).join('');
        }
        const selIdx = sel ? list.findIndex(r => r.t === sel.t && r.id === sel.id) : -1;
        if (selIdx >= 0) { box.setAttribute('aria-activedescendant', 'xp-r' + selIdx); const el = box.querySelector(`[data-i="${selIdx}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); } else box.removeAttribute('aria-activedescendant');
        card.querySelector('.xp-count').textContent = q ? plural(list.length, 'résultat') : list.length ? plural(list.length, 'élément') : '';
        syncFoot();
        if (focusList) box.focus();
      }
      /* sélection seule : pas de nouveau rendu de la liste (sinon le double-clic perdrait sa cible) */
      function paintSel() {
        const box = card.querySelector('.xp-items');
        let selEl = null;
        box.querySelectorAll('.xp-row').forEach(el => {
          const r = list[+el.dataset.i], on = !!(r && sel && r.t === sel.t && r.id === sel.id);
          el.classList.toggle('sel', on); el.setAttribute('aria-selected', String(on)); if (on) selEl = el;
        });
        if (selEl) { box.setAttribute('aria-activedescendant', selEl.id); selEl.scrollIntoView({ block: 'nearest' }); } else box.removeAttribute('aria-activedescendant');
        syncFoot();
      }
      function syncFoot() {
        const okBtn = card.querySelector('[data-xt="ok"]'), info = card.querySelector('.xp-sel');
        const r = sel && list.find(x => x.t === sel.t && x.id === sel.id);
        if (mode === 'doc') {
          const d = r && r.t === 'd' ? state.docs.find(x => x.id === r.id) : null;
          okBtn.disabled = !d;
          info.innerHTML = d ? `<span class="xp-sel-lab">Sélection</span>${dIcon(d)}<b>${esc(d.titre || 'Sans titre')}</b>` : '<span class="xp-sel-hint">Double-cliquez sur un document pour le choisir.</span>';
        } else {
          /* 1.55 : un seul bouton — le sous-dossier sélectionné, sinon le dossier ouvert (actif dès l'ouverture s'il est valable) */
          const f = r && r.t === 'f' && !r.off ? fById(r.id) : null;
          const short = n => `${String(n || 'Sans nom').slice(0, 28)}${String(n || '').length > 28 ? '…' : ''}`;
          const hereOk = !q && (cur !== ROOT || o.allowRoot !== false);
          okBtn.disabled = !f && !hereOk;
          okBtn.textContent = f ? `${o.okIntoLabel || 'Choisir'} « ${short(f.nom)} »`
            : o.okLabel ? o.okLabel : `Choisir « ${cur === ROOT ? 'Mes cours' : short((fById(cur) || {}).nom)} »`;
          info.innerHTML = q ? '<span class="xp-sel-hint">Ouvrez un résultat pour vous y placer.</span>' : `<span class="xp-sel-lab">Dossier ouvert</span><span class="xp-sel-path">${esc(pathText(cur))}</span>${o.current !== undefined && (o.current || ROOT) === cur ? '<span class="xp-cur">actuel</span>' : ''}`;
        }
      }

      /* ---------------- actions ---------------- */
      const go = (id, { push = true } = {}) => {
        id = id || ROOT;
        if (id && (!fById(id) || isExcluded(id))) return;
        if (q) { q = ''; const inp = card.querySelector('.xp-q'); inp.value = ''; card.querySelector('.xp').classList.remove('searching'); }
        if (push && id !== cur) history.push(cur);
        cur = id; sel = null;
        pathOf(cur).forEach(f => expanded.add(f.id));
        render(true);
      };
      const back = () => { while (history.length) { const p = history.pop(); if (!p || (fById(p) && !isExcluded(p))) { go(p, { push: false }); return; } } };
      const up = () => { if (q) { setQuery(''); return; } if (cur !== ROOT) { const f = fById(cur); go(f && f.parentId && fById(f.parentId) ? f.parentId : ROOT); } };
      const activate = r => {
        if (!r || r.off) return;
        if (r.t === 'f') go(r.id);
        else finish(r.id);
      };
      const choose = () => {
        const r = sel && list.find(x => x.t === sel.t && x.id === sel.id);
        if (mode === 'folder' && (!r || r.off || r.t !== 'f')) { chooseHere(); return; }
        if (!r || r.off) return;
        if (mode === 'folder' && r.t === 'f') finish(r.id);
        else if (mode === 'doc' && r.t === 'd') finish(r.id);
      };
      const chooseHere = () => { if (mode !== 'folder' || q || (cur === ROOT && o.allowRoot === false)) return; finish(cur); };   // dossier ouvert
      function setQuery(v) {
        q = String(v || '').trim().slice(0, 80);
        card.querySelector('.xp').classList.toggle('searching', !!q);
        const inp = card.querySelector('.xp-q'); if (inp.value.trim() !== q) inp.value = q;
        sel = null; render(false);
        const first = list.findIndex(r => !r.off); if (q && first >= 0) { sel = { t: list[first].t, id: list[first].id }; render(false); }
      }
      const moveSel = delta => {
        const idx = list.map((r, i) => (r.off ? -1 : i)).filter(i => i >= 0); if (!idx.length) return;
        const curI = sel ? list.findIndex(r => r.t === sel.t && r.id === sel.id) : -1;
        let p = idx.indexOf(curI);
        if (delta === Infinity) p = idx.length - 1; else if (delta === -Infinity) p = 0;
        else p = p < 0 ? (delta > 0 ? 0 : idx.length - 1) : Math.max(0, Math.min(idx.length - 1, p + delta));
        const r = list[idx[p]]; sel = { t: r.t, id: r.id }; paintSel();
      };

      /* Échap : vide d'abord la recherche ; sinon la fenêtre se ferme (gestionnaire global des fenêtres) */
      function onWinKey(e) {
        if (e.key !== 'Escape' || !card || !document.getElementById(DLG_ID)) return;
        const dlgs = document.querySelectorAll('.dlgov'); if (dlgs[dlgs.length - 1] !== card.parentElement) return;
        const x = card.querySelector('.xp');
        if (x.classList.contains('tree-open')) { e.preventDefault(); e.stopImmediatePropagation(); closeTreeSheet(); card.querySelector('[data-xt="tree"]').focus(); return; }
        if (q) { e.preventDefault(); e.stopImmediatePropagation(); setQuery(''); card.querySelector('.xp-q').focus(); }
      }

      /* ---------------- fenêtre ---------------- */
      const opener = document.activeElement;
      const okLabel = o.okLabel || 'Choisir';
      const kindTitle = mode === 'doc' ? 'Choisir un document' : 'Choisir un dossier';
      const dlgTitle = o.title || kindTitle;
      /* le titre est échappé ici, une seule fois (openDialog l'insère tel quel et en tire le nom accessible) */
      openDialog({
        id: DLG_ID, cls: 'xp-dlg', eyebrow: dlgTitle === kindTitle ? '' : kindTitle,
        title: esc(dlgTitle),
        sub: o.sub ? esc(o.sub) : '',
        body: `<div class="xp xp-${mode}">
          <div class="xp-bar">
            <div class="xp-nav">
              <button type="button" class="xp-nbtn xp-treebtn" data-xt="tree" aria-expanded="false" aria-controls="xp-tree" title="Afficher les dossiers">${ICO.tree}<span>Dossiers</span></button>
              <button type="button" class="xp-nbtn" data-xt="back" title="Retour (dossier précédent)" aria-label="Retour">${ICO.back}</button>
              <button type="button" class="xp-nbtn" data-xt="up" title="Dossier parent (Retour arrière)" aria-label="Dossier parent">${ICO.up}</button>
            </div>
            <nav class="xp-crumbs" aria-label="Emplacement"></nav>
            <label class="xp-search">${ICO.search}<input class="xp-q" type="search" placeholder="Rechercher ${mode === 'doc' ? 'un dossier ou un document' : 'un dossier'}…" aria-label="Rechercher dans toute la bibliothèque" autocomplete="off" spellcheck="false" maxlength="80"></label>
          </div>
          <div class="xp-main">
            <aside class="xp-tree" id="xp-tree" aria-label="Dossiers">
              <div role="tree" aria-label="Arborescence des dossiers">
                <div class="xp-trow root" style="--d:0" role="none"><span class="xp-caret leaf"></span><button type="button" class="xp-tlab" data-xt="go" data-id="" role="treeitem" aria-level="1" aria-expanded="true" aria-selected="false" tabindex="0">${ICO.home}<span class="xp-tname">Mes cours</span></button></div>
                <div class="xp-tree-items" role="group"></div>
              </div>
            </aside>
            <section class="xp-pane">
              <div class="xp-cols" aria-hidden="true"><span>Nom</span><span>Type</span><span>${mode === 'doc' ? 'Modifié le' : 'Contenu'}</span></div>
              <div class="xp-items" role="listbox" tabindex="0" aria-label="Contenu du dossier"></div>
              <div class="xp-status"><span class="xp-count"></span><span class="xp-keys">↑ ↓ pour parcourir · Entrée pour ${mode === 'doc' ? 'ouvrir ou choisir' : 'ouvrir'} · Retour arrière pour remonter</span></div>
            </section>
          </div>
        </div>`,
        foot: `<div class="xp-sel"></div><span class="dlg-spacer"></span><button class="cta ghost" type="button" data-xt="cancel">Annuler</button><button class="cta" type="button" data-xt="ok" disabled>${esc(okLabel)}</button>`,
        onClose: () => {
          if (!done) { done = true; open = null; window.removeEventListener('keydown', onWinKey, true); resolve(null); }
          if (opener && opener.isConnected && typeof opener.focus === 'function') setTimeout(() => opener.focus(), 0);
        },
        onMount: c => {
          card = c;
          const box = card.querySelector('.xp-items'), inp = card.querySelector('.xp-q');
          card.addEventListener('click', e => {
            const b = e.target.closest('[data-xt]');
            if (b && !b.disabled) {
              const k = b.dataset.xt;
              if (k === 'go') { if (b.dataset.off) return; if (b.closest('.xp-tree')) closeTreeSheet(); go(b.dataset.id); return; }
              if (k === 'tree') { const x = card.querySelector('.xp'), on = !x.classList.contains('tree-open'); x.classList.toggle('tree-open', on); b.setAttribute('aria-expanded', String(on)); if (on) rovingTree(cur, true); return; }
              if (k === 'toggle') { const id = b.dataset.id; if (expanded.has(id)) expanded.delete(id); else expanded.add(id); render(false); return; }
              if (k === 'back') { back(); return; }
              if (k === 'up') { up(); return; }
              if (k === 'cancel') { cancel(); return; }
              if (k === 'ok') { choose(); return; }
              if (k === 'here') { chooseHere(); return; }
            }
            const row = e.target.closest('.xp-row');
            if (row) { const r = list[+row.dataset.i]; if (r && !r.off) { sel = { t: r.t, id: r.id }; paintSel(); box.focus(); } }
          });
          card.querySelector('.xp-tree').addEventListener('keydown', onTreeKey);
          box.addEventListener('dblclick', e => { const row = e.target.closest('.xp-row'); if (row) activate(list[+row.dataset.i]); });
          box.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveSel(e.key === 'ArrowDown' ? 1 : -1); return; }
            if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); moveSel(e.key === 'End' ? Infinity : -Infinity); return; }
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); activate(sel && list.find(r => r.t === sel.t && r.id === sel.id)); return; }
            if (e.key === 'Backspace' || (e.key === 'ArrowLeft' && e.altKey)) { e.preventDefault(); up(); return; }
            if (e.key === 'ArrowRight' && sel && sel.t === 'f') { e.preventDefault(); go(sel.id); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); up(); return; }
            /* une lettre tapée dans la liste part dans la recherche */
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') { inp.focus(); }
          });
          let tm = null;
          inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => setQuery(inp.value), 120); });
          inp.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); clearTimeout(tm); setQuery(inp.value); box.focus(); if (!sel) moveSel(1); return; }
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); clearTimeout(tm); setQuery(inp.value); const r = sel && list.find(x => x.t === sel.t && x.id === sel.id); if (r) activate(r); return; }
          });
          window.addEventListener('keydown', onWinKey, true);
          cur = validStart(o.start);
          pathOf(cur).forEach(f => expanded.add(f.id));
          render(true);
          /* élément présélectionné (document, ou dossier en mode folder) s'il figure dans le dossier ouvert */
          if (o.selected) { const t = mode === 'doc' ? 'd' : 'f'; if (list.some(r => r.t === t && r.id === o.selected && !r.off)) { sel = { t, id: o.selected }; paintSel(); } }
          setTimeout(() => box.focus(), 30);
        }
      });
    });
  }

  return { pick };
})();
