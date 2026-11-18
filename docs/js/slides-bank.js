/* ============================================================
   Alixo — 1.54 : banque d'images libres (Wikimedia Commons)
   window.AlixoImageBank : recherche d'images sous licence libre (Creative Commons, domaine public) sur
   Wikimedia Commons, filtre des licences (liste blanche), crédit à conserver sur le bloc image, et fenêtre
   « Banque d'images libres » (champ + grille + panneau latéral « Insérer »).
   - Une seule source en 1.54 (`source: 'commons'`) ; l'objet reste organisé pour en accueillir d'autres.
   - Aucune requête réseau avant une recherche explicite (Entrée ou bouton) ; une seule requête en vol ;
     `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, délai 12 s ; miniatures uniquement dans des
     <img crossorigin="anonymous" referrerpolicy="no-referrer" loading="lazy">.
   - Tout ce qui vient de Commons est vérifié par type, tronqué et passé par esc() avant d'être affiché.
   - `_fetch` est remplaçable (tests) ; `fetchBytes` ne télécharge jamais l'original, seulement la miniature 1600 px.
   Chargé après app.js (openDialog, closeDialog, toast, esc, openExternalUrl) et sanitize.js (AlixoSanitize.text) ;
   fonctionne aussi seul pour `search` / `allowedLicense` / `credit` (la fenêtre exige openDialog).
   ============================================================ */
'use strict';

window.AlixoImageBank = (() => {
  const API = 'https://commons.wikimedia.org/w/api.php';
  const PAGE = 24;
  const TIMEOUT_MS = 12000;
  const MAX_BYTES = 25 * 1024 * 1024;       // miniature 1600 px : jamais plus de 25 Mo (Content-Length, puis taille réelle)
  const TOO_BIG = 'Image trop lourde (25 Mo au plus) : choisissez-en une autre.';
  const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const LIM = { title: 120, author: 200, license: 60, licenseUrl: 300, pageUrl: 500 };
  const NOTICE = 'Votre recherche est envoyée à Wikimedia Commons (Wikimedia Foundation, États-Unis), qui reçoit aussi l’adresse IP de votre appareil. Alixo ne la conserve pas. Les licences sont celles déclarées par Commons : Alixo ne les vérifie pas ; l’auteur et la licence sont ajoutés sous l’image.';

  /* ---------- petits utilitaires (autonomes : le fichier peut être chargé sans app.js) ---------- */
  const escHtml = s => typeof window.esc === 'function' ? window.esc(s) : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const str = (v, max) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  const httpsUrl = (v, max) => {
    if (typeof v !== 'string' || v.length > max) return '';
    try { const u = new URL(v); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
  };
  /* 1.54 : adresse https dont l'hôte est exactement l'un de `hosts` (ou un sous-domaine si `sub`) ; sinon '' */
  const hostUrl = (v, max, hosts, sub) => {
    const s = httpsUrl(v, max); if (!s) return '';
    const h = new URL(s).hostname.toLowerCase();
    return hosts.some(x => h === x || (sub && h.endsWith('.' + x))) ? s : '';
  };
  const MEDIA_HOSTS = ['upload.wikimedia.org'], PAGE_HOSTS = ['commons.wikimedia.org'], LICENSE_HOSTS = ['creativecommons.org'];
  const mediaUrl = v => hostUrl(v, 1000, MEDIA_HOSTS);
  const pageUrlOf = v => hostUrl(v, LIM.pageUrl, PAGE_HOSTS);
  const licenseUrlOf = v => hostUrl(v, LIM.licenseUrl, LICENSE_HOSTS, true);
  /* HTML de Commons (Artist, Attribution) → texte brut */
  const plain = (html, max) => {
    if (typeof html !== 'string') return '';
    let t;
    if (window.AlixoSanitize && typeof AlixoSanitize.text === 'function') t = AlixoSanitize.text(html);
    else t = html.replace(/<[^>]*>/g, '');
    return str(t, max);
  };
  const version = () => {
    const v = (window.AlixoApp && AlixoApp.version) || (typeof window.ALIXO_VERSION === 'string' && window.ALIXO_VERSION) || '';
    return /^\d+(?:\.\d+){0,2}$/.test(String(v)) ? String(v) : '1.54';
  };
  const userAgent = () => `Alixo/${version()} (https://alixoapp.com; contact@alixoapp.com)`;

  /* ---------- licences : liste blanche ---------- */
  /* meta = extmetadata de Commons ({ LicenseShortName: { value }, Restrictions: { value }, … }) ou un objet plat { LicenseShortName, Restrictions } */
  function metaValue(meta, key) {
    if (!meta || typeof meta !== 'object') return '';
    const v = meta[key];
    if (v && typeof v === 'object') return typeof v.value === 'string' ? v.value : '';
    return typeof v === 'string' ? v : '';
  }
  function allowedLicense(meta) {
    const raw = str(metaValue(meta, 'LicenseShortName'), 120);
    const restr = str(metaValue(meta, 'Restrictions'), 120);
    if (restr) return { ok: false, label: '' };
    if (!raw) return { ok: false, label: '' };
    const s = raw.replace(/[‐-―]/g, '-');       // tirets typographiques → tiret simple
    const up = s.toUpperCase();
    if (/\bNC\b/.test(up) || /\bND\b/.test(up)) return { ok: false, label: '' };
    /* domaine public : « Public domain », « PD », « PD-old-70 », « PD-US », « No restrictions » */
    if (/^public domain\b/i.test(s) || /^PD(?:[-\s]|$)/.test(s) || /^no restrictions$/i.test(s)) return { ok: true, label: 'Domaine public' };
    if (/^CC0(?:\s*1\.0)?$/i.test(s) || /^CC[-\s]?Zero$/i.test(s)) return { ok: true, label: 'CC0' };
    /* CC BY x.y / CC BY-SA x.y — avec ou sans suffixe de juridiction (« CC BY-SA 3.0 de ») */
    const m = /^CC[-\s]BY(-SA)?[-\s]?(\d\.\d)(?:[-\s][a-z]{2,3})?$/i.exec(s);
    if (m) return { ok: true, label: `CC BY${m[1] ? '-SA' : ''} ${m[2]}` };
    return { ok: false, label: '' };                       // GFDL seule, « Attribution », vide, inconnue…
  }

  /* ---------- normalisation d'une page Commons → Item ---------- */
  function toItem(page) {
    if (!page || typeof page !== 'object') return null;
    const id = Number(page.pageid);
    if (!Number.isInteger(id) || id <= 0) return null;
    const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    if (!info || typeof info !== 'object') return null;
    const mime = str(info.mime, 40).toLowerCase();
    if (!MIMES.has(mime)) return null;
    const meta = info.extmetadata && typeof info.extmetadata === 'object' ? info.extmetadata : {};
    const lic = allowedLicense(meta);
    if (!lic.ok) return null;
    const thumb = mediaUrl(info.thumburl);                 // seulement upload.wikimedia.org
    if (!thumb || !/\/400px-/.test(thumb)) return null;
    const pageUrl = pageUrlOf(info.descriptionurl);         // seulement commons.wikimedia.org
    if (!pageUrl) return null;
    let title = plain(metaValue(meta, 'ObjectName'), LIM.title);
    if (!title) title = str(String(page.title || '').replace(/^File:/i, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' '), LIM.title);
    const author = plain(metaValue(meta, 'Attribution'), LIM.author) || plain(metaValue(meta, 'Artist'), LIM.author);
    const w = Number(info.width), h = Number(info.height);
    return {
      id, source: 'commons', title, author,
      license: lic.label.slice(0, LIM.license),
      licenseUrl: licenseUrlOf(metaValue(meta, 'LicenseUrl')),   // creativecommons.org (ou sous-domaine), sinon libellé sans lien
      pageUrl, thumb,
      full: thumb.replace('/400px-', '/1600px-'),
      w: Number.isFinite(w) && w > 0 ? Math.round(w) : 0,
      h: Number.isFinite(h) && h > 0 ? Math.round(h) : 0,
      mime
    };
  }

  /* ---------- recherche ---------- */
  let inflight = null;      // AbortController de la requête en cours
  const bank = {
    NOTICE,
    _fetch: (url, opts) => fetch(url, opts),
    allowedLicense,
    async search(q, page = 1) {
      const query = str(q, 200);
      if (!query) return { items: [], next: 0 };
      const p = Math.max(1, Math.min(40, Math.floor(Number(page) || 1)));
      if (inflight) { try { inflight.abort(); } catch { /* ignore */ } }
      const ctl = new AbortController(); inflight = ctl;
      const tm = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      const u = new URL(API);
      const params = {
        action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: query, gsrnamespace: '6',
        gsrlimit: String(PAGE), gsroffset: String((p - 1) * PAGE), prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata', iiurlwidth: '400',
        iiextmetadatafilter: 'Artist|Attribution|Credit|LicenseShortName|LicenseUrl|Restrictions|Copyrighted|ObjectName|ImageDescription',
        maxlag: '5'
      };
      for (const k in params) u.searchParams.set(k, params[k]);
      try {
        const r = await bank._fetch(u.href, {
          method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal,
          headers: { 'Api-User-Agent': userAgent(), Accept: 'application/json' }
        });
        if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
        const data = await r.json();
        if (!data || typeof data !== 'object') throw new Error('Réponse invalide');
        if (data.error) throw new Error(str(data.error.code, 60) || 'Erreur Commons');
        const pages = data.query && data.query.pages && typeof data.query.pages === 'object' ? Object.values(data.query.pages) : [];
        const items = pages.slice(0, 200).map(toItem).filter(Boolean)
          .sort((a, b) => a.id - b.id);
        const more = !!(data.continue && (data.continue.gsroffset != null)) || pages.length >= PAGE;
        return { items, next: more ? p + 1 : 0 };
      } finally {
        clearTimeout(tm);
        if (inflight === ctl) inflight = null;
      }
    },
    /* octets de l'image : miniature 1600 px, repli sur la miniature 400 px ; jamais l'original */
    async fetchBytes(item) {
      if (!item || typeof item !== 'object') throw new Error('Image inconnue');
      const urls = [mediaUrl(item.full), mediaUrl(item.thumb)].filter(Boolean);
      if (!urls.length) throw new Error('Adresse d’image invalide');
      let lastErr = null;
      for (const url of urls) {
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), TIMEOUT_MS);
        try {
          const r = await bank._fetch(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal, headers: { 'Api-User-Agent': userAgent() } });
          if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
          const len = r.headers && typeof r.headers.get === 'function' ? Number(r.headers.get('Content-Length')) : 0;
          if (len > MAX_BYTES) { const e = new Error(TOO_BIG); e.tooBig = true; throw e; }
          const blob = await r.blob();
          if (!blob || !/^image\//.test(blob.type || '') || !blob.size) throw new Error('Pas une image');
          if (blob.size > MAX_BYTES) { const e = new Error(TOO_BIG); e.tooBig = true; throw e; }
          return blob;
        } catch (err) { lastErr = err; if (err && err.tooBig) break; }   // trop lourde : inutile d'essayer la miniature suivante
        finally { clearTimeout(tm); }
      }
      throw lastErr || new Error('Téléchargement impossible');
    },
    /* crédit à stocker sur le bloc image (e.credit) */
    credit(item) {
      if (!item || typeof item !== 'object') return null;
      return {
        title: str(item.title, LIM.title), author: str(item.author, LIM.author), license: str(item.license, LIM.license),
        licenseUrl: licenseUrlOf(item.licenseUrl), url: pageUrlOf(item.pageUrl),
        source: 'commons', at: Date.now()
      };
    },
    /* « Auteur · Wikimedia Commons · CC BY-SA 4.0 » (auteur omis s'il manque) */
    creditText(credit) {
      if (!credit || typeof credit !== 'object') return '';
      const parts = [];
      const a = str(credit.author, LIM.author); if (a) parts.push(a);
      parts.push(credit.source === 'commons' || !credit.source ? 'Wikimedia Commons' : str(credit.source, 40));
      const l = str(credit.license, LIM.license); if (l) parts.push(l);
      return parts.join(' · ');
    },
    open
  };

  /* ---------- fenêtre « Banque d'images libres » ---------- */
  const ICO = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.6" cy="9.6" r="1.6"/><path d="m4 17.5 5-5 3.6 3.6 2.6-2.6L20 18"/></svg>'
  };
  const openExt = url => {
    const u = httpsUrl(url, LIM.pageUrl); if (!u) return;
    if (typeof window.openExternalUrl === 'function') window.openExternalUrl(u);
    else if (window.alixoDesktop && alixoDesktop.openExternal) alixoDesktop.openExternal(u);
    else window.open(u, '_blank', 'noopener');
  };
  const say = msg => { if (typeof window.toast === 'function') window.toast(msg); };

  function cardHTML(it, i) {
    const sub = [it.author, it.license].filter(Boolean).map(escHtml).join(' · ');
    return `<button type="button" class="ib-item" role="listitem" data-i="${i}" aria-label="${escHtml(it.title || 'Image')}${sub ? ' — ' + sub : ''}">
        <span class="ib-th"><img crossorigin="anonymous" referrerpolicy="no-referrer" loading="lazy" alt="" src="${escHtml(it.thumb)}"></span>
        <span class="ib-cap"><b>${escHtml(it.title || 'Sans titre')}</b><small>${sub}</small></span>
      </button>`;
  }
  function sideHTML(it) {
    return `<button type="button" class="ib-back" data-ib="back">← Tous les résultats</button>
      <div class="ib-big"><img crossorigin="anonymous" referrerpolicy="no-referrer" alt="" src="${escHtml(it.thumb)}"></div>
      <h3 class="ib-stitle">${escHtml(it.title || 'Sans titre')}</h3>
      <dl class="ib-meta">
        <dt>Auteur</dt><dd>${it.author ? escHtml(it.author) : '<i>Non renseigné</i>'}</dd>
        <dt>Licence</dt><dd>${it.licenseUrl ? `<a href="${escHtml(it.licenseUrl)}" data-ext="${escHtml(it.licenseUrl)}" rel="noopener noreferrer">${escHtml(it.license)}</a>` : escHtml(it.license)}</dd>
        ${it.w && it.h ? `<dt>Taille</dt><dd>${it.w} × ${it.h} px</dd>` : ''}
      </dl>
      <a class="ib-src" href="${escHtml(it.pageUrl)}" data-ext="${escHtml(it.pageUrl)}" rel="noopener noreferrer">${ICO.ext}<span>Voir la page source</span></a>
      <div class="ib-sact"><button type="button" class="cta" data-ib="insert">Insérer</button></div>
      <p class="ib-shint">L’auteur et la licence seront ajoutés sous l’image.</p>`;
  }

  function open(opts) {
    opts = opts || {};
    if (typeof window.openDialog !== 'function') { console.warn('AlixoImageBank : openDialog indisponible'); return null; }
    const onPick = typeof opts.onPick === 'function' ? opts.onPick : () => {};
    const items = [];           // résultats affichés (toutes pages)
    let query = '', next = 0, loading = false, lastRun = 0, debounceTm = 0, sel = -1, inserting = false;
    const body = `<form class="ib-search" autocomplete="off">
        <label class="ib-field"><span class="ib-sico">${ICO.search}</span><input type="search" class="ib-q" name="q" placeholder="Rechercher une image…" aria-label="Rechercher une image" autocomplete="off" spellcheck="false" maxlength="200"></label>
        <button type="submit" class="cta ib-go">Rechercher</button>
      </form>
      <p class="ib-notice">${escHtml(NOTICE)}</p>
      <div class="ib-main">
        <div class="ib-results">
          <div class="ib-state" role="status" aria-live="polite"></div>
          <div class="ib-grid" role="list" aria-label="Résultats"></div>
          <div class="ib-more"><button type="button" class="cta ghost" data-ib="more" hidden>Plus de résultats</button></div>
        </div>
        <aside class="ib-side" aria-label="Image sélectionnée" hidden></aside>
      </div>`;
    return window.openDialog({
      id: 'imgbank', cls: 'ib-dlg', eyebrow: `${ICO.image} Wikimedia Commons`, title: 'Banque d’images libres',
      sub: 'Images sous licence libre (Creative Commons, domaine public).',
      body,
      onMount: (card, close) => {
        card.setAttribute('aria-modal', 'true');
        const q = card.querySelector('.ib-q'), form = card.querySelector('.ib-search');
        const stateEl = card.querySelector('.ib-state'), grid = card.querySelector('.ib-grid');
        const more = card.querySelector('[data-ib="more"]'), side = card.querySelector('.ib-side');
        const setState = (kind, text) => {
          stateEl.className = 'ib-state' + (kind ? ' ib-' + kind : '');
          stateEl.textContent = text || ''; stateEl.hidden = !text;
        };
        const render = (from) => {
          grid.insertAdjacentHTML('beforeend', items.slice(from).map((it, k) => cardHTML(it, from + k)).join(''));
          more.hidden = !next || !items.length;
        };
        /* ≤ 700 px : le panneau remplace la grille ; « ← Tous les résultats » la ramène et rend le focus à la carte choisie */
        const hideSide = () => {
          side.hidden = true; side.innerHTML = ''; card.classList.remove('has-side');
          const b = grid.querySelector(`.ib-item[data-i="${sel}"]`); if (b) b.focus({ preventScroll: true });
        };
        const showSide = i => {
          const it = items[i]; if (!it) return;
          sel = i;
          for (const b of grid.querySelectorAll('.ib-item')) b.classList.toggle('sel', +b.dataset.i === i);
          side.innerHTML = sideHTML(it); side.hidden = false; card.classList.add('has-side');
          const ins = side.querySelector('[data-ib="insert"]'); if (ins) ins.focus({ preventScroll: true });
        };
        let gen = 0;   // génération de la recherche : une nouvelle recherche rend la précédente caduque
        const run = async (page) => {
          if (loading && page !== 1) return;
          if (navigator.onLine === false) { setState('offline', 'Hors ligne — la recherche d’images nécessite une connexion.'); return; }
          const my = ++gen; loading = true; const fresh = page === 1;
          if (fresh) { grid.innerHTML = ''; items.length = 0; next = 0; side.hidden = true; side.innerHTML = ''; card.classList.remove('has-side'); sel = -1; }
          setState('loading', fresh ? 'Recherche en cours…' : 'Chargement…'); more.hidden = true; more.disabled = true;
          try {
            const r = await bank.search(query, page);
            if (my !== gen) return;                        // remplacée par une recherche plus récente
            const from = items.length; items.push(...r.items); next = r.next;
            render(from);
            if (!items.length) setState('empty', 'Aucune image trouvée.');
            else setState('', `${items.length} image${items.length > 1 ? 's' : ''}`);
          } catch (err) {
            if (my !== gen) return;
            setState('error', 'Wikimedia Commons ne répond pas. Vérifiez la connexion, puis réessayez.');
          } finally { if (my === gen) { loading = false; more.disabled = false; } }
        };
        const submit = () => {
          const v = str(q.value, 200); if (!v) { q.focus(); return; }
          const now = Date.now();
          clearTimeout(debounceTm);
          const go = () => { lastRun = Date.now(); query = v; run(1); };
          if (now - lastRun < 400) debounceTm = setTimeout(go, 400 - (now - lastRun)); else go();
        };
        form.addEventListener('submit', e => { e.preventDefault(); submit(); });
        more.addEventListener('click', () => { if (next) run(next); });
        grid.addEventListener('click', e => { const b = e.target.closest('.ib-item'); if (b) showSide(+b.dataset.i); });
        grid.addEventListener('keydown', e => {   // flèches dans la grille
          const b = e.target.closest && e.target.closest('.ib-item'); if (!b || !/^Arrow/.test(e.key)) return;
          const all = [...grid.querySelectorAll('.ib-item')]; const i = all.indexOf(b);
          const cols = Math.max(1, Math.round(grid.clientWidth / (b.offsetWidth + 10)));
          const j = i + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols })[e.key];
          if (all[j]) { e.preventDefault(); all[j].focus(); }
        });
        card.addEventListener('click', async e => {
          const a = e.target.closest('[data-ext]');
          if (a) { e.preventDefault(); openExt(a.dataset.ext); return; }
          if (e.target.closest('[data-ib="back"]')) { hideSide(); return; }
          const ins = e.target.closest('[data-ib="insert"]');
          if (!ins || inserting) return;
          const it = items[sel]; if (!it) return;
          inserting = true; ins.disabled = true; ins.textContent = 'Téléchargement…';
          try {
            const blob = await bank.fetchBytes(it);
            await onPick(it, blob);
            close();
          } catch (err) {
            console.warn('AlixoImageBank : insertion impossible', err);
            say(err && err.tooBig ? TOO_BIG : 'Image indisponible — réessayez ou choisissez-en une autre.');
            if (ins.isConnected) { ins.disabled = false; ins.textContent = 'Insérer'; }
          } finally { inserting = false; }
        });
        if (navigator.onLine === false) setState('offline', 'Hors ligne — la recherche d’images nécessite une connexion.');
        else setState('hint', 'Tapez un mot-clé puis appuyez sur Entrée. Les résultats sont souvent plus nombreux en anglais.');
        q.focus({ preventScroll: true });
      },
      onClose: () => { if (inflight) { try { inflight.abort(); } catch { /* ignore */ } inflight = null; } }
    });
  }

  return bank;
})();
