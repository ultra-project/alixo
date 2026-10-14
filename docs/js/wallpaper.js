/* ============================================================
   Fond d'écran des documents (1.33, Alixo+)
   Une image (ou un dégradé prêt à l'emploi) affichée DERRIÈRE le document ouvert : autour de la page d'une
   séance (volet du plan compris), autour de la diapositive d'une présentation, autour de la grille d'un
   tableur, sous les post-it d'une planche. La bibliothèque garde son fond habituel.
   - réglage : state.settings.wall = { src: 'img' | '<preset>', iid, dim (0–80 %), blur (0–20 px) }
   - l'image est rangée comme les images des cours (AlixoImages : IndexedDB + synchronisation du compte)
   - Paramètres › Apparence › Fond d'écran des documents. Chargé APRÈS app.js.
   ============================================================ */
'use strict';

window.AlixoWall = (() => {
  const PRESETS = [
    { k: 'aube', name: 'Aube', css: 'linear-gradient(135deg, #f6d1a8 0%, #e79a8f 45%, #8f6fb3 100%)' },
    { k: 'lagon', name: 'Lagon', css: 'linear-gradient(160deg, #a8e6df 0%, #3fa7b5 50%, #1f4e79 100%)' },
    { k: 'foret', name: 'Forêt', css: 'radial-gradient(120% 90% at 20% 10%, #8fbf8a 0%, #3e7a55 45%, #183a2c 100%)' },
    { k: 'nuit', name: 'Nuit étoilée', css: 'radial-gradient(1.5px 1.5px at 20% 30%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 70% 20%, #fff 50%, transparent 51%), radial-gradient(1.2px 1.2px at 45% 75%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 85% 65%, #fff 50%, transparent 51%), radial-gradient(120% 100% at 50% 0%, #2b3a78 0%, #131a3a 55%, #070a18 100%)', size: '260px 260px, 310px 310px, 230px 230px, 290px 290px, cover' },
    { k: 'sable', name: 'Sable', css: 'linear-gradient(180deg, #f3e7d3 0%, #e2c9a0 55%, #b98f5c 100%)' },
    { k: 'aurore', name: 'Aurore', css: 'radial-gradient(80% 60% at 25% 20%, rgba(80, 220, 170, .75), transparent 70%), radial-gradient(70% 60% at 80% 35%, rgba(140, 90, 230, .7), transparent 70%), linear-gradient(180deg, #0d1b2a, #1b263b)' }
  ];
  const VIEWS = ['#view-editor', '#view-slides', '#view-sheet', '#view-board'];
  const DEF = { dim: 30, blur: 0 };
  let el = null, url = '', urlFor = '';

  const conf = () => state.settings.wall || null;
  const preset = k => PRESETS.find(p => p.k === k) || null;
  const docOpen = () => VIEWS.some(s => { const v = $(s); return v && !v.hidden; });
  /* actif : Alixo+ (ou version locale / personnalisée), un fond choisi, et un document ouvert */
  const enabled = () => { const c = conf(); return !!(c && c.src && isPlus() && (c.src !== 'img' || c.iid)); };

  function ensureEl() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'doc-wall'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="dw-img"></div><div class="dw-dim"></div>';
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }
  async function apply() {
    const on = enabled() && docOpen();
    document.body.classList.toggle('wall-on', on);
    if (!on) { if (el) el.hidden = true; return; }
    const c = conf(); const w = ensureEl(); const img = w.querySelector('.dw-img');
    if (c.src === 'img') {
      if (urlFor !== c.iid) { url = await AlixoImages.get(c.iid) || ''; urlFor = c.iid; }
      img.style.backgroundImage = url ? `url("${url}")` : ''; img.style.backgroundSize = 'cover';
    } else {
      const p = preset(c.src) || PRESETS[0];
      img.style.backgroundImage = p.css; img.style.backgroundSize = p.size || 'cover';
    }
    const blur = Math.max(0, Math.min(20, +c.blur || 0));
    img.style.filter = blur ? `blur(${blur}px)` : '';
    img.style.inset = blur ? `-${blur * 2}px` : '0';
    w.style.setProperty('--dw-dim', (Math.max(0, Math.min(80, c.dim == null ? DEF.dim : +c.dim)) / 100).toFixed(2));
    w.hidden = false;
  }
  /* suit l'ouverture / la fermeture des vues document */
  function watch() {
    const mo = new MutationObserver(() => apply());
    VIEWS.forEach(s => { const v = $(s); if (v) mo.observe(v, { attributes: true, attributeFilter: ['hidden', 'style'] }); });
    const lib = $('#view-library'); if (lib) mo.observe(lib, { attributes: true, attributeFilter: ['style', 'hidden'] });
    apply();
  }

  /* ---------------- Paramètres › Apparence ---------------- */
  function thumbStyle(p) { return `background:${p.css};${p.size ? 'background-size:' + p.size.split(',').map(() => 'cover').join(',') : 'background-size:cover'}`; }
  function settingsHTML() {
    const c = conf() || {}; const locked = !isPlus();
    const cur = c.src || '';
    const tiles = [`<button type="button" class="dw-tile ${!cur ? 'on' : ''}" data-wall=""><span class="dw-prev dw-none">Aucun</span><b>Aucun</b></button>`]
      .concat(`<button type="button" class="dw-tile ${cur === 'img' ? 'on' : ''}" data-wall="img"><span class="dw-prev dw-own" id="dw-own"${cur === 'img' && url ? ` style="background-image:url('${url}')"` : ''}>${cur === 'img' ? '' : '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>'}</span><b>${cur === 'img' ? 'Mon image' : 'Choisir une image…'}</b></button>`)
      .concat(PRESETS.map(p => `<button type="button" class="dw-tile ${cur === p.k ? 'on' : ''}" data-wall="${p.k}"><span class="dw-prev" style="${thumbStyle(p)}"></span><b>${p.name}</b></button>`));
    const dim = c.dim == null ? DEF.dim : c.dim, blur = c.blur || 0;
    return `<div class="set-sect" id="dw-sect"><div class="po-label">Fond d’écran des documents ${locked ? plusBadge() : ''}</div>
      <div class="po-hint" style="margin:0 0 10px">Une image à vous, affichée <b>derrière</b> vos documents : autour de la page des séances (et sous le plan), autour des diapositives, des tableaux du tableur et sous les planches. La page reste blanche (ou sombre) : seul l’arrière-plan change.</div>
      <div class="dw-tiles ${locked ? 'locked' : ''}" id="dw-tiles">${tiles.join('')}</div>
      <div class="dw-sliders" ${cur ? '' : 'hidden'} id="dw-sliders">
        <label><span>Assombrir</span><input type="range" min="0" max="80" step="5" value="${dim}" data-dw="dim"><em>${dim} %</em></label>
        <label><span>Flou</span><input type="range" min="0" max="20" step="1" value="${blur}" data-dw="blur"><em>${blur} px</em></label>
      </div>
      ${locked ? '<div class="po-hint">Le fond d’écran des documents fait partie d’<b>Alixo+</b> (Paramètres › Alixo+).</div>' : '<div class="po-hint">Votre image suit le compte : elle s’affiche aussi sur vos autres appareils. Une image claire et peu chargée reste la plus lisible ; « Assombrir » aide sinon.</div>'}
      <input type="file" id="dw-file" accept="image/*" hidden></div>`;
  }
  function bindSettings(root) {
    const sect = root.querySelector('#dw-sect'); if (!sect) return;
    if (url === '' && conf() && conf().src === 'img') apply().then(() => { const o = sect.querySelector('#dw-own'); if (o && url) o.style.backgroundImage = `url('${url}')`; });
    const rerender = () => { const n = document.createElement('div'); n.innerHTML = settingsHTML(); sect.replaceWith(n.firstElementChild); bindSettings(root); };
    const setConf = patch => { state.settings.wall = Object.assign({}, conf() || {}, patch); if (!state.settings.wall.src) delete state.settings.wall; save(); apply(); };
    const file = sect.querySelector('#dw-file');
    sect.querySelector('#dw-tiles').addEventListener('click', e => {
      const b = e.target.closest('[data-wall]'); if (!b) return;
      if (!isPlus()) { openPlusDialog('fond'); return; }
      const k = b.dataset.wall;
      if (k === 'img') { file.click(); return; }
      setConf({ src: k }); rerender();
      if (k && !docOpen()) toast('Fond d’écran choisi : il s’affiche dès qu’un document est ouvert');
    });
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0]; file.value = ''; if (!f) return;
      try {
        const im = await fileToWall(f);
        const iid = 'wall_' + uid();
        await AlixoImages.put(iid, im);
        url = im; urlFor = iid;
        setConf({ src: 'img', iid }); rerender();
        toast('Fond d’écran enregistré');
      } catch { toast('Image illisible'); }
    });
    sect.querySelectorAll('[data-dw]').forEach(r => {
      r.addEventListener('input', () => { r.nextElementSibling.textContent = r.value + (r.dataset.dw === 'dim' ? ' %' : ' px'); setConf({ [r.dataset.dw]: +r.value }); });
    });
  }
  /* une image d'écran : plus grande que celles des cours (2200 px), JPEG, sous 940 Kio (limite d'un document du compte) */
  function fileToWall(f) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(f); const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(u);
        const w = im.naturalWidth, h = im.naturalHeight; if (!w || !h) { rej(new Error('vide')); return; }
        let s = Math.min(1, 2200 / Math.max(w, h)), q = 0.86, data = '';
        for (let k = 0; k < 7; k++) {
          const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          data = c.toDataURL('image/jpeg', q);
          if (data.length <= 940 * 1024) break;
          q -= 0.1; s *= 0.85;
        }
        res(data);
      };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('illisible')); };
      im.src = u;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else setTimeout(watch, 0);
  return { apply, enabled, settingsHTML, bindSettings, PRESETS };
})();
