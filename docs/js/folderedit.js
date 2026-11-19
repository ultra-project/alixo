/* ============================================================
   1.55 : fenêtre « Modifier le dossier » et bannières des cartes de cours
   - remplace l'ancien pop-over de création / modification d'un dossier (openFolderPopover d'app.js y renvoie) :
     aperçu en direct de la carte, nom + professeur, bannière (Aucune / Couleur / Motif / Image), couleur de l'icône,
     icône (recherche + catégories) ;
   - bannière d'un dossier : f.banner = { t: 'color', c } | { t: 'pattern', c, p } | { t: 'image', iid } ; pas de
     `banner` = aucune bannière (la carte reste comme avant). f.couleur reste la couleur de l'icône (teinte --mc).
     Tout est validé à la lecture ET à l'écriture : couleur #rrggbb, motif dans une liste fermée, iid court
     [A-Za-z0-9_-] ; jamais d'URL ni de HTML dans le dossier (la méta est synchronisée, 1 Mo au plus) ;
   - image : réservée à Alixo+ (requirePlus('banniere')). L'image elle-même est rangée par AlixoImages
     (IndexedDB + synchronisation du compte), redimensionnée (1200 px au plus) et compressée en JPEG ; le dossier
     ne garde que son identifiant. Sans Alixo+, une image déjà posée s'affiche en motif neutre sans être effacée.
   Chargé APRÈS app.js : utilise ses globales (state, save, isPlus, AlixoImages…), comme js/wallpaper.js.
   ============================================================ */
'use strict';

window.AlixoFolderEdit = (() => {
  /* couleurs de bannière : tons sourds, lisibles dans les deux thèmes */
  const BANNER_COLORS = [
    ['#8c3a44', 'Bordeaux'], ['#9a4f2c', 'Rouille'], ['#8a6d2b', 'Ocre'], ['#3f6e4f', 'Vert sapin'], ['#2a6b6b', 'Sarcelle'],
    ['#2f4a6e', 'Marine'], ['#454a8f', 'Indigo'], ['#6b3d66', 'Prune'], ['#55575e', 'Ardoise']
  ];
  /* couleurs de l'icône : reprises de la palette des dossiers (FOLDER_COLORS) — les anciennes couleurs restent valables */
  const ICON_COLORS = [
    ['#c04343', 'Rouge'], ['#d06a3a', 'Orange'], ['#b8952e', 'Moutarde'], ['#4a7856', 'Vert'], ['#2e8b8b', 'Sarcelle'],
    ['#33658a', 'Bleu Alixo'], ['#3d6bb5', 'Bleu'], ['#7a5cb8', 'Violet'], ['#a8556f', 'Framboise'], ['#6b6b6b', 'Gris']
  ];
  const PATTERNS = [['dots', 'Points'], ['stripes', 'Rayures'], ['grid', 'Quadrillage'], ['diag', 'Diagonales']];
  const PATTERN_KEYS = PATTERNS.map(p => p[0]);
  const HEX = /^#[0-9a-f]{6}$/i;
  const IID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const DATA_IMG = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
  const TABS = [['none', 'Aucune'], ['color', 'Couleur'], ['pattern', 'Motif'], ['image', 'Image']];
  const CAT_LABEL = c => c.replace(/ & .*$/, '');   // « Sciences & maths » → « Sciences »
  const IMG_SVG = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>';
  const PLUS_SVG = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

  /* ---------------- modèle : validation stricte ---------------- */
  function cleanBanner(b) {
    if (!b || typeof b !== 'object') return null;
    const c = typeof b.c === 'string' && HEX.test(b.c) ? b.c.toLowerCase() : BANNER_COLORS[0][0];
    if (b.t === 'color') return { t: 'color', c };
    if (b.t === 'pattern') return { t: 'pattern', c, p: PATTERN_KEYS.includes(b.p) ? b.p : 'dots' };
    if (b.t === 'image' && typeof b.iid === 'string' && IID_RE.test(b.iid)) return { t: 'image', iid: b.iid };
    return null;
  }
  const plusOn = () => (typeof isPlus === 'function' ? !!isPlus() : false);

  /* ---------------- bannière d'une carte (vue Grille) ---------------- */
  function bannerHTML(f, opts = {}) {
    const b = cleanBanner(f && f.banner); if (!b) return '';
    if (b.t === 'color') return `<span class="fc-banner" style="--bc:${b.c}" aria-hidden="true"></span>`;
    if (b.t === 'pattern') return `<span class="fc-banner fb-${b.p}" style="--bc:${b.c}" aria-hidden="true"></span>`;
    // image : sans Alixo+, motif neutre (l'image reste rangée et revient avec l'abonnement)
    if (!plusOn() && !opts.preview) return '<span class="fc-banner fb-neutral" aria-hidden="true" title="Bannière en image (Alixo+)"></span>';
    scheduleHydrate();
    return `<span class="fc-banner fb-img" data-biid="${b.iid}" aria-hidden="true"></span>`;
  }
  /* les images arrivent après le rendu (IndexedDB / compte) : posées par le DOM, jamais injectées dans le HTML */
  let hydT = 0;
  function scheduleHydrate() { if (!hydT) hydT = setTimeout(hydrate, 0); }
  function setImg(el, v) {
    if (typeof v === 'string' && DATA_IMG.test(v)) { el.style.backgroundImage = `url("${v}")`; el.classList.add('fb-ready'); }
    else el.classList.add('fb-missing');
  }
  function hydrate() {
    hydT = 0;
    if (typeof AlixoImages === 'undefined') return;
    document.querySelectorAll('.fc-banner.fb-img[data-biid]:not([data-hyd])').forEach(el => {
      el.dataset.hyd = '1';
      const iid = el.dataset.biid;
      if (!IID_RE.test(iid)) { el.classList.add('fb-missing'); return; }
      const c = AlixoImages.cache.get(iid);
      if (c) { setImg(el, c); return; }
      AlixoImages.get(iid).then(v => { if (el.isConnected) setImg(el, v); }).catch(() => el.classList.add('fb-missing'));
    });
  }

  /* ---------------- image importée : redimensionnée, compressée ---------------- */
  function fileToBanner(file) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type || '')) { rej(new Error('type')); return; }
      if (file.size > 30 * 1048576) { rej(new Error('taille')); return; }
      const u = URL.createObjectURL(file); const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(u);
        const w = im.naturalWidth, h = im.naturalHeight; if (!w || !h) { rej(new Error('vide')); return; }
        let s = Math.min(1, 1200 / w, 1200 / h), q = 0.8, data = '';
        for (let k = 0; k < 6; k++) {
          const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);   // PNG transparent → fond blanc (JPEG)
          ctx.drawImage(im, 0, 0, cv.width, cv.height);
          data = cv.toDataURL('image/jpeg', q);
          if (data.length <= 360 * 1024) break;
          q = Math.max(0.5, q - 0.1); s *= 0.85;
        }
        if (!DATA_IMG.test(data)) { rej(new Error('format')); return; }
        res(data);
      };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('illisible')); };
      im.src = u;
    });
  }

  /* ---------------- fenêtre ---------------- */
  function swatchesHTML(list, cur, kind, label) {
    const inList = list.some(([c]) => c === cur);
    const custom = HEX.test(cur || '') && !inList;
    return `<div class="fe-swatches" role="group" aria-label="${label}" data-sw="${kind}">
      ${list.map(([c, n]) => `<button type="button" class="fe-sw ${c === cur ? 'sel' : ''}" data-c="${c}" style="--sw:${c}" title="${n}" aria-label="${n}" aria-pressed="${c === cur}"></button>`).join('')}
      <label class="fe-sw fe-sw-custom ${custom ? 'sel picked' : ''}" title="Couleur personnalisée" ${custom ? `style="--sw:${cur}"` : ''}>${PLUS_SVG}<input type="color" value="${custom ? cur : (kind === 'banner' ? '#3a5a8c' : '#4f66e0')}" aria-label="Couleur personnalisée"></label>
    </div>`;
  }

  function open(existing, parentId) {
    if (parentId === undefined) parentId = typeof currentFolderId !== 'undefined' ? currentFolderId : null;
    if (existing && !state.folders.includes(existing)) existing = null;
    const parent = folder(parentId);
    const b0 = cleanBanner(existing && existing.banner);
    const st = {
      nom: existing ? existing.nom || '' : '',
      prof: existing ? (existing.prof || '') : folderProf(parentId),
      couleur: existing && HEX.test(existing.couleur || '') ? existing.couleur : (parent && HEX.test(parent.couleur || '') ? parent.couleur : FOLDER_COLORS[10]),
      icone: existing && existing.icone && AlixoIcons.ICONS[existing.icone] ? existing.icone : '',
      tab: b0 ? b0.t : 'none',
      bc: b0 && b0.c ? b0.c : BANNER_COLORS[0][0],
      bp: b0 && b0.p ? b0.p : 'dots',
      iid: b0 && b0.t === 'image' ? b0.iid : '',
      imgData: '',      // image choisie dans cette fenêtre (rangée à l'enregistrement)
      imgUrl: '',       // image actuelle (aperçu)
      removed: false,   // 1.55 : « Retirer » cliqué (la bannière image est retirée à l'enregistrement)
      cat: '', q: '', busy: false
    };
    const allIcons = [...new Set(Object.values(AlixoIcons.CATEGORIES).flat())].filter(i => AlixoIcons.ICONS[i]);
    const isNew = !existing;

    const body = `
      <div class="fe-label">Aperçu</div>
      <div class="fe-preview" id="fe-prev" aria-hidden="true"></div>
      <div class="fe-row2">
        <div class="fe-field"><label for="fe-name">Nom du cours</label><input id="fe-name" autocomplete="off" placeholder="Ex. Droit administratif" maxlength="120" value="${esc(st.nom)}" aria-describedby="fe-err"><span class="fe-err" id="fe-err" hidden>Donnez un nom au dossier.</span></div>
        <div class="fe-field"><label for="fe-prof">Professeur</label><input id="fe-prof" list="profs-list" autocomplete="off" placeholder="Ex. Mme Martin" maxlength="120" value="${esc(st.prof)}" aria-describedby="fe-prof-h"><small id="fe-prof-h">Repris sur les séances du dossier.</small></div>
      </div>
      <div class="fe-label" id="fe-bl">Bannière</div>
      <div class="fe-seg" role="tablist" aria-labelledby="fe-bl">${TABS.map(([k, n]) => `<button type="button" role="tab" id="fe-tab-${k}" data-tab="${k}" aria-controls="fe-bpanel" aria-selected="${k === st.tab}" tabindex="${k === st.tab ? 0 : -1}" class="${k === st.tab ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="fe-bpanel" id="fe-bpanel" role="tabpanel" aria-labelledby="fe-tab-${st.tab}"></div>
      <div class="fe-label" id="fe-il">Couleur de l’icône</div>
      <div id="fe-icol">${swatchesHTML(ICON_COLORS, st.couleur, 'icon', 'Couleur de l’icône')}</div>
      <div class="fe-label">Icône</div>
      <div class="fe-search">${AlixoIcons.svg('search')}<input id="fe-q" type="search" autocomplete="off" placeholder="Rechercher une icône…" aria-label="Rechercher une icône"></div>
      <div class="fe-chips" role="tablist" aria-label="Catégories d’icônes"><button type="button" role="tab" data-cat="" class="on" aria-selected="true">Tous</button>${Object.keys(AlixoIcons.CATEGORIES).map(c => `<button type="button" role="tab" data-cat="${esc(c)}" aria-selected="false" title="${esc(c)}">${esc(CAT_LABEL(c))}</button>`).join('')}</div>
      <div class="fe-icons" id="fe-icons" role="group" aria-label="Icône du dossier"></div>`;

    openDialog({
      id: 'folderedit', cls: 'narrow fe-dlg', title: isNew ? 'Nouveau dossier' : 'Modifier le dossier', body,
      foot: `<button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta fe-ok" type="button" id="fe-ok">${isNew ? 'Créer' : 'Enregistrer'}</button>`,
      onMount: card => mount(card)
    });

    function mount(card) {
      const $q = s => card.querySelector(s);
      const nameEl = $q('#fe-name'), profEl = $q('#fe-prof'), errEl = $q('#fe-err'), prev = $q('#fe-prev');
      const panel = $q('#fe-bpanel'), iconsEl = $q('#fe-icons'), qEl = $q('#fe-q');

      /* aperçu : la carte telle qu'elle apparaîtra dans la grille */
      function draftBanner() {
        if (st.tab === 'color') return { t: 'color', c: st.bc };
        if (st.tab === 'pattern') return { t: 'pattern', c: st.bc, p: st.bp };
        if (st.tab === 'image' && (st.imgData || st.iid)) return { t: 'image', iid: st.iid || 'apercu' };
        return null;
      }
      function renderPreview() {
        const b = draftBanner();
        let ban = '';
        if (b && b.t === 'image') ban = plusOn() ? '<span class="fc-banner fb-img fe-prev-img"></span>' : '<span class="fc-banner fb-neutral"></span>';
        else if (b) ban = bannerHTML({ banner: b });
        else if (st.tab === 'image') ban = '<span class="fc-banner fe-noimg">Aucune image choisie</span>';   // 1.55 : onglet Image sans image
        const nom = st.nom.trim();
        prev.innerHTML = `<div class="folder-card fe-card ${ban ? 'has-banner' : ''}" style="--mc:${st.couleur}">${ban}
          ${folderTileHTML({ nom: nom || '?', icone: st.icone })}
          <div class="fc-body"><h3>${nom ? esc(nom) : '<span class="fe-ph">Nom du cours</span>'}</h3>${st.prof.trim() ? `<div class="fc-prof">${esc(st.prof.trim())}</div>` : ''}</div></div>`;
        const pi = prev.querySelector('.fe-prev-img');
        if (pi) {
          const src = st.imgData || st.imgUrl;
          if (src) setImg(pi, src);
          else if (st.iid && typeof AlixoImages !== 'undefined') AlixoImages.get(st.iid).then(v => { if (typeof v === 'string' && DATA_IMG.test(v)) { st.imgUrl = v; renderPreview(); if (st.tab === 'image') renderPanel(); } else pi.classList.add('fb-missing'); }).catch(() => pi.classList.add('fb-missing'));
        }
      }

      /* panneau de l'onglet de bannière */
      function renderPanel() {
        if (st.tab === 'none') { panel.innerHTML = '<p class="fe-hint">Sans bannière, la carte garde son apparence habituelle.</p>'; return; }
        if (st.tab === 'color') { panel.innerHTML = swatchesHTML(BANNER_COLORS, st.bc, 'banner', 'Couleur de la bannière'); return; }
        if (st.tab === 'pattern') {
          panel.innerHTML = `<div class="fe-patterns" role="group" aria-label="Motif">${PATTERNS.map(([k, n]) => `<button type="button" class="fe-pat ${k === st.bp ? 'sel' : ''}" data-p="${k}" aria-pressed="${k === st.bp}" title="${n}"><span class="fc-banner fb-${k}" style="--bc:${st.bc}"></span><b>${n}</b></button>`).join('')}</div>
            ${swatchesHTML(BANNER_COLORS, st.bc, 'banner', 'Couleur du motif')}`;
          return;
        }
        // image
        if (!plusOn()) {
          panel.innerHTML = `<div class="fe-plus">
            <span class="fe-plus-ico">${AlixoIcons.svg('sparkles')}</span>
            <div class="fe-plus-txt"><b>Une image en bannière, avec Alixo+</b><span>${st.iid ? 'Votre image est conservée : elle s’affiche de nouveau dès qu’Alixo+ est actif. En attendant, la carte montre un motif neutre.' : 'Importez une photo ou une illustration pour reconnaître vos cours d’un coup d’œil. Elle suit votre compte sur tous vos appareils.'}</span></div>
            <button type="button" class="cta plus-cta fe-plus-go" id="fe-plus-go">Découvrir Alixo+</button></div>`;
          return;
        }
        const src = st.imgData || st.imgUrl;
        panel.innerHTML = `<div class="fe-img ${src ? 'has' : ''}" id="fe-drop">
            ${src ? '<span class="fe-img-thumb" id="fe-thumb"></span>' : `<span class="fe-img-ico">${IMG_SVG}</span>`}
            <div class="fe-img-txt"><b>${src ? 'Image de la bannière' : (st.iid ? 'Image en cours de chargement…' : 'Importer une image')}</b><span>JPEG, PNG ou WebP, glissée ici ou choisie sur l’appareil. Elle est réduite à 1&#8239;200&nbsp;px de large.</span></div>
            <div class="fe-img-btns"><button type="button" class="cta ghost" id="fe-pick">${src || st.iid ? 'Changer…' : 'Choisir…'}</button>${src || st.iid ? '<button type="button" class="cta ghost" id="fe-rm">Retirer</button>' : ''}</div>
            <input type="file" id="fe-file" accept="image/jpeg,image/png,image/webp" hidden></div>`;
        const th = panel.querySelector('#fe-thumb'); if (th) setImg(th, src);
      }
      async function takeFile(file) {
        if (!file || st.busy) return;
        if (!plusOn()) { requirePlus('banniere'); return; }
        st.busy = true;
        try { st.imgData = await fileToBanner(file); st.iid = ''; st.imgUrl = ''; st.removed = false; }
        catch { toast('Image illisible : choisissez un fichier JPEG, PNG ou WebP'); }
        finally { st.busy = false; }
        renderPanel(); renderPreview();
      }

      function renderIcons() {
        const q = norm(st.q.trim());
        let list = st.cat ? (AlixoIcons.CATEGORIES[st.cat] || []).filter(i => AlixoIcons.ICONS[i]) : allIcons.slice();
        if (!st.cat && st.icone && !list.includes(st.icone)) list.push(st.icone);   // icône actuelle hors catégories : gardée visible
        if (q) list = list.filter(i => norm(i + ' ' + (AlixoIcons.KEYWORDS && AlixoIcons.KEYWORDS[i] || '')).includes(q));
        const def = !q || norm('défaut monogramme initiales aucune').includes(q)
          ? `<button type="button" data-i="" class="fe-ic fe-ic-def ${st.icone ? '' : 'sel'}" title="Initiales du cours (par défaut)" aria-label="Initiales du cours (par défaut)" aria-pressed="${!st.icone}"><span class="fc-mono">${esc(folderMonogram(st.nom || 'Aa'))}</span></button>` : '';
        iconsEl.innerHTML = def + list.map(i => `<button type="button" data-i="${esc(i)}" class="fe-ic ${i === st.icone ? 'sel' : ''}" title="${esc((AlixoIcons.KEYWORDS && AlixoIcons.KEYWORDS[i] || i).split(' ')[0])}" aria-label="Icône ${esc((AlixoIcons.KEYWORDS && AlixoIcons.KEYWORDS[i] || i).split(' ')[0])}" aria-pressed="${i === st.icone}">${AlixoIcons.svg(i)}</button>`).join('')
          + (def || list.length ? '' : '<p class="fe-hint fe-none">Aucune icône ne correspond à cette recherche.</p>');
      }
      const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

      /* nuanciers : pastilles + couleur personnalisée */
      function bindSwatches(root, onPick) {
        root.addEventListener('click', e => {
          const b = e.target.closest('button.fe-sw[data-c]'); if (!b || !root.contains(b)) return;
          const grp = b.closest('.fe-swatches');
          grp.querySelectorAll('.fe-sw').forEach(x => { const on = x === b; x.classList.toggle('sel', on); if (x.tagName === 'BUTTON') x.setAttribute('aria-pressed', String(on)); });
          onPick(b.dataset.c, grp.dataset.sw);
        });
        root.addEventListener('input', e => {
          const inp = e.target.closest('.fe-sw-custom input'); if (!inp) return;
          const v = String(inp.value || '').toLowerCase(); if (!HEX.test(v)) return;
          const lab = inp.closest('.fe-sw-custom'), grp = lab.closest('.fe-swatches');
          grp.querySelectorAll('.fe-sw').forEach(x => { x.classList.remove('sel'); if (x.tagName === 'BUTTON') x.setAttribute('aria-pressed', 'false'); });
          lab.classList.add('sel', 'picked'); lab.style.setProperty('--sw', v);
          onPick(v, grp.dataset.sw);
        });
      }
      bindSwatches(card.querySelector('#fe-icol'), c => { st.couleur = c; renderPreview(); });
      bindSwatches(panel, c => {
        st.bc = c; renderPreview();
        panel.querySelectorAll('.fe-pat .fc-banner').forEach(x => x.style.setProperty('--bc', c));
      });
      panel.addEventListener('click', e => {
        const p = e.target.closest('.fe-pat[data-p]');
        if (p) {
          st.bp = PATTERN_KEYS.includes(p.dataset.p) ? p.dataset.p : 'dots';
          panel.querySelectorAll('.fe-pat').forEach(x => { const on = x === p; x.classList.toggle('sel', on); x.setAttribute('aria-pressed', String(on)); });
          renderPreview(); return;
        }
        if (e.target.closest('#fe-plus-go')) { requirePlus('banniere'); return; }
        if (e.target.closest('#fe-pick')) { const f = panel.querySelector('#fe-file'); if (f) f.click(); return; }
        if (e.target.closest('#fe-rm')) { st.imgData = ''; st.imgUrl = ''; st.iid = ''; st.removed = true; renderPanel(); renderPreview(); }
      });
      panel.addEventListener('change', e => {
        const f = e.target.closest('#fe-file'); if (!f) return;
        const file = f.files && f.files[0]; f.value = ''; takeFile(file);
      });
      panel.addEventListener('dragover', e => { if (e.target.closest('#fe-drop')) { e.preventDefault(); panel.querySelector('#fe-drop').classList.add('over'); } });
      panel.addEventListener('dragleave', e => { const d = e.target.closest('#fe-drop'); if (d && !d.contains(e.relatedTarget)) d.classList.remove('over'); });
      panel.addEventListener('drop', e => {
        const d = e.target.closest('#fe-drop'); if (!d) return;
        e.preventDefault(); d.classList.remove('over');
        takeFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
      });

      /* onglets de bannière (1.55 : aria-controls, une seule tabulation, flèches gauche / droite, Début / Fin) */
      const seg = card.querySelector('.fe-seg');
      const selectTab = (b, focus) => {
        st.tab = b.dataset.tab;
        seg.querySelectorAll('[data-tab]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
        panel.setAttribute('aria-labelledby', b.id);
        if (focus) b.focus();
        renderPanel(); renderPreview();
      };
      seg.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) selectTab(b, false); });
      seg.addEventListener('keydown', e => {
        const tabs = [...seg.querySelectorAll('[data-tab]')], i = tabs.indexOf(e.target.closest('[data-tab]')); if (i < 0) return;
        const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
        if (j < 0) return;
        e.preventDefault(); selectTab(tabs[j], true);
      });
      card.querySelector('.fe-chips').addEventListener('click', e => {
        const b = e.target.closest('[data-cat]'); if (!b) return;
        st.cat = b.dataset.cat;
        card.querySelectorAll('.fe-chips [data-cat]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
        renderIcons(); iconsEl.scrollTop = 0;
      });
      qEl.addEventListener('input', () => { st.q = qEl.value; renderIcons(); });
      iconsEl.addEventListener('click', e => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        st.icone = b.dataset.i && AlixoIcons.ICONS[b.dataset.i] ? b.dataset.i : '';
        iconsEl.querySelectorAll('[data-i]').forEach(x => { const on = x === b; x.classList.toggle('sel', on); x.setAttribute('aria-pressed', String(on)); });
        renderPreview();
      });
      const setErr = on => { errEl.hidden = !on; if (on) nameEl.setAttribute('aria-invalid', 'true'); else nameEl.removeAttribute('aria-invalid'); };
      nameEl.addEventListener('input', () => {
        st.nom = nameEl.value; if (st.nom.trim()) setErr(false); renderPreview();
        const d = iconsEl.querySelector('.fe-ic-def .fc-mono'); if (d) d.textContent = folderMonogram(st.nom || 'Aa');
      });
      profEl.addEventListener('input', () => { st.prof = profEl.value; renderPreview(); });

      /* enregistrement */
      async function ok() {
        if (st.busy) return;
        const nom = nameEl.value.trim().slice(0, 120);
        if (!nom) { setErr(true); nameEl.focus(); return; }
        const prof = profEl.value.trim().slice(0, 120);
        const couleur = HEX.test(st.couleur) ? st.couleur.toLowerCase() : FOLDER_COLORS[10];   // toujours #rrggbb
        const icone = st.icone && AlixoIcons.ICONS[st.icone] ? st.icone : '';
        let banner;
        if (st.tab === 'image') {
          if (st.imgData && plusOn()) {
            st.busy = true;
            const iid = 'ban_' + uid();
            try { await AlixoImages.put(iid, st.imgData); banner = { t: 'image', iid }; }
            catch { st.busy = false; toast('Image non enregistrée : réessayez'); return; }
            st.busy = false;
          } else if (st.iid) banner = { t: 'image', iid: st.iid };   // image déjà posée (gardée, même sans Alixo+)
          else banner = st.removed ? null : b0;                      // rien de choisi : la bannière d'avant est gardée (sauf « Retirer », 1.55)
        } else banner = draftBanner();
        banner = cleanBanner(banner);
        rememberProf(prof);
        if (existing) {
          const oldProf = existing.prof || '';
          existing.nom = nom; existing.couleur = couleur; existing.icone = icone; existing.prof = prof;
          if (banner) existing.banner = banner; else delete existing.banner;
          if (prof !== oldProf) {
            // les séances du dossier (et sous-dossiers) sans professeur, ou avec l'ancien, suivent le nouveau nom
            const ids = new Set(descendantIds(existing.id));
            const inherited = oldProf || folderProf(existing.parentId);
            state.docs.forEach(d => { if (ids.has(d.folderId) && (!d.prof || d.prof === inherited)) d.prof = prof || folderProf(d.folderId); });
          }
        } else {
          const f = { id: uid(), nom, couleur, icone, parentId: parentId || null, prof };
          if (banner) f.banner = banner;
          state.folders.push(f);
          if (parentId) for (const p of folderPath(parentId)) expandedFolders.add(p.id);
        }
        /* 1.55 : l'ancienne image de bannière (retirée ou remplacée) est effacée de l'appareil et du compte */
        if (b0 && b0.t === 'image' && /^ban_/.test(b0.iid) && !(banner && banner.t === 'image' && banner.iid === b0.iid)
          && !state.folders.some(x => x.banner && x.banner.iid === b0.iid) && typeof AlixoImages !== 'undefined' && AlixoImages.remove) AlixoImages.remove(b0.iid);
        save(); closeDialog('folderedit'); refreshLibrary();
        if (currentDocId) { renderCrumbs(); const d = doc(); if (d) document.documentElement.style.setProperty('--tint', folderTint(d.folderId)); }
      }
      card.querySelector('#fe-ok').addEventListener('click', ok);
      /* Entrée enregistre (depuis un champ texte ; un bouton focalisé garde son action) */
      card.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || e.isComposing) return;
        const t = e.target;
        if (t.tagName === 'INPUT' && !['color', 'file', 'checkbox', 'radio'].includes(t.type)) { e.preventDefault(); ok(); }
      });

      renderPanel(); renderPreview(); renderIcons();
      setTimeout(() => { nameEl.focus(); if (!isNew) nameEl.select(); }, 40);
    }
  }

  return { open, bannerHTML, cleanBanner, BANNER_COLORS, ICON_COLORS, PATTERNS };
})();
