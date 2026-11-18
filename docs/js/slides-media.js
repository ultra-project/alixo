/* ============================================================
   Alixo — présentations : vidéo, quiz et images (js/slides-media.js) 1.54
   window.AlixoSlidesMedia :
   - bloc vidéo : fichier local (mp4 / webm, 300 Mo, rangé dans les fichiers de la bibliothèque, affiche d'après la
     première seconde) ou vidéo en ligne (YouTube, Vimeo, Dailymotion : seul l'identifiant est stocké, jamais l'URL).
     En édition, dans les vignettes et le PDF : une carte, AUCUNE requête réseau. En présentation : `mount(root)` monte
     la <video> (fichier) ou, pour une vidéo en ligne, une façade « cliquer pour charger » qui dit clairement ce que le
     service recevra ; l'iframe (youtube-nocookie, Vimeo dnt=1) n'est créée qu'après le clic, ou tout de suite si
     l'utilisateur a coché « Ne plus demander » pour ce service sur cet appareil (localStorage, 6 mois, révocable dans
     Paramètres › Compte). `unmount(root)` arrête tout et libère les URL d'objet.
   - bloc quiz : lien vers un quiz Alixo (ref seulement, titre relu à l'affichage) ; « Lancer le quiz » en présentation
     ferme le diaporama, ouvre le quiz et lance le test local ou le direct ; une pastille « Revenir à la présentation »
     ramène à la même diapositive.
   - menu Image à trois entrées (ordinateur, photos du compte, banque d'images libres) et crédit `.sl-credit` rendu sous
     toute image venue de la banque (pas d'option pour le masquer).
   Chargé APRÈS app.js, slides.js, slides-bank.js et imagepick.js : utilise AlixoSlides (api élargie), AlixoImageBank,
   AlixoImagePick, AlixoFiles, AlixoImages, fileToImage, openDialog, showPopover, openTargetPicker, docRefInfo, toast, esc, uid.
   ============================================================ */
'use strict';

window.AlixoSlidesMedia = (() => {
  const S = () => window.AlixoSlides;
  const $ = s => document.querySelector(s);
  const E = s => (typeof window.esc === 'function' ? window.esc(s) : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
  const say = (m, o) => { if (typeof window.toast === 'function') window.toast(m, o); };
  const ext = url => { if (typeof window.openExternalUrl === 'function') window.openExternalUrl(url); else window.open(url, '_blank', 'noopener'); };
  const I = () => (S() && S().I) || {};
  const ico = k => I()[k] || '';

  /* ---------------- vidéos en ligne : hôtes, identifiants, adresses ---------------- */
  const HOSTS = {
    yt: /^(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/,
    vimeo: /^(?:www\.|player\.)?vimeo\.com$/,
    dm: /^(?:www\.)?(?:dailymotion\.com|dai\.ly)$/
  };
  const ID_RE = { yt: /^[A-Za-z0-9_-]{11}$/, vimeo: /^\d{6,12}$/, dm: /^[a-z0-9]{6,12}$/, file: /^[\w-]{1,64}$/ };
  const SERVICE = {
    yt: { name: 'YouTube', who: 'YouTube (Google)', note: 'YouTube en mode « confidentialité avancée »' },
    vimeo: { name: 'Vimeo', who: 'Vimeo', note: 'Vimeo sans suivi' },
    dm: { name: 'Dailymotion', who: 'Dailymotion', note: 'Dailymotion' }
  };
  const MAX_VIDEO = 300 * 1024 * 1024;
  const CONSENT_MS = 183 * 24 * 3600 * 1000;      // 6 mois
  const LS_CONSENT = 'alixo.video.consent.';
  const SS_RETURN = 'alixo.slides.return';
  const WARN = 'Pendant la présentation, la vidéo n’est chargée qu’au moment où vous cliquez sur « Lire » (ou dès l’affichage si vous avez coché « Ne plus demander ») : le service (YouTube, Vimeo ou Dailymotion) reçoit alors l’adresse IP de l’appareil et peut déposer des traceurs. Alixo utilise le mode « confidentialité avancée » de YouTube (youtube-nocookie.com) et le lecteur Vimeo sans suivi, qui limitent ce dépôt sans le supprimer.';
  const FIRST_IMPORT = 'N’importez que des vidéos que vous avez le droit d’utiliser. Un enregistrement de cours ne peut être partagé qu’avec l’accord de l’enseignant et des personnes filmées.';
  const BAD_URL = 'Adresse non reconnue : collez un lien YouTube, Vimeo ou Dailymotion.';

  /* https seul, hôte de la liste, identifiant validé par la regex du service → { vk, vid } ou null */
  function parseVideoUrl(str) {
    let s = String(str || '').trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[\w.-]+\.[a-z]{2,}([/?#]|$)/i.test(s)) s = 'https://' + s;
    let u; try { u = new URL(s); } catch { return null; }
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    const segs = u.pathname.split('/').filter(Boolean);
    let vk = null, vid = '';
    if (HOSTS.yt.test(host)) {
      vk = 'yt';
      if (host === 'youtu.be') vid = segs[0] || '';
      else if (['embed', 'shorts', 'v', 'live'].includes(segs[0])) vid = segs[1] || '';
      else vid = u.searchParams.get('v') || '';
    } else if (HOSTS.vimeo.test(host)) {
      vk = 'vimeo';
      vid = segs.slice().reverse().find(x => /^\d+$/.test(x)) || '';
    } else if (HOSTS.dm.test(host)) {
      vk = 'dm';
      if (host.endsWith('dai.ly')) vid = segs[0] || '';
      else if (segs[0] === 'video') vid = segs[1] || '';
      else if (segs[0] === 'embed' && segs[1] === 'video') vid = segs[2] || '';
      vid = vid.split('_')[0];
    }
    if (!vk || !ID_RE[vk].test(vid)) return null;
    return { vk, vid };
  }
  const validOnline = e => !!(e && SERVICE[e.vk] && ID_RE[e.vk] && ID_RE[e.vk].test(String(e.vid || '')));
  const validFile = e => !!(e && e.vk === 'file' && ID_RE.file.test(String(e.vid || '')));
  const flag = (e, k) => e && e[k] === true;
  /* adresse de lecture intégrée (nocookie / dnt) — '' si le bloc n'est pas valide */
  function embedUrl(e) {
    if (!validOnline(e)) return '';
    const auto = flag(e, 'auto'), loop = flag(e, 'loop'), mute = flag(e, 'mute');
    if (e.vk === 'yt') return `https://www.youtube-nocookie.com/embed/${e.vid}?rel=0&modestbranding=1&autoplay=${auto ? 1 : 0}&mute=${mute ? 1 : 0}&loop=${loop ? 1 : 0}${loop ? '&playlist=' + e.vid : ''}`;
    if (e.vk === 'vimeo') return `https://player.vimeo.com/video/${e.vid}?dnt=1&autoplay=${auto ? 1 : 0}&muted=${mute ? 1 : 0}&loop=${loop ? 1 : 0}`;
    return `https://www.dailymotion.com/embed/video/${e.vid}?autoplay=${auto ? 1 : 0}&mute=${mute ? 1 : 0}&queue-enable=false`;
  }
  /* adresse canonique de la page (PDF, « Ouvrir sur … à la place ») */
  function watchUrl(e) {
    if (!validOnline(e)) return '';
    if (e.vk === 'yt') return `https://www.youtube.com/watch?v=${e.vid}`;
    if (e.vk === 'vimeo') return `https://vimeo.com/${e.vid}`;
    return `https://www.dailymotion.com/video/${e.vid}`;
  }

  /* ---------------- consentement par service (localStorage, 6 mois) ---------------- */
  const hasConsent = vk => { try { const t = +localStorage.getItem(LS_CONSENT + vk); return !!t && Date.now() - t < CONSENT_MS; } catch { return false; } };
  const giveConsent = vk => { try { localStorage.setItem(LS_CONSENT + vk, String(Date.now())); } catch { /* stockage plein */ } };
  function forgetConsents() {
    let n = 0;
    try { const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(LS_CONSENT)) ks.push(k); } for (const k of ks) { localStorage.removeItem(k); n++; } } catch { /* ignoré */ }
    return n;
  }

  /* ---------------- rendu de la carte vidéo (appelé par elHTML, slides.js) ---------------- */
  const vlabel = e => (e.vk === 'file' ? (e.fname || 'Vidéo') : `Vidéo ${SERVICE[e.vk] ? SERVICE[e.vk].name : ''}`.trim());
  function videoHTML(e, o) {
    const mode = (o && o.mode) || 'edit';
    const edit = mode === 'edit';
    if (!(validOnline(e) || validFile(e))) {
      return `<div class="sl-vcard sl-vempty">${ico('video')}<span>Vidéo</span>${edit ? '<small>Double-clic : un fichier de l’ordinateur ou un lien YouTube, Vimeo, Dailymotion</small>' : ''}</div>`;
    }
    const poster = e.poster && window.AlixoImages ? AlixoImages.cache.get(e.poster) : '';
    const badges = [flag(e, 'auto') && 'auto', flag(e, 'loop') && 'boucle', flag(e, 'mute') && 'muet'].filter(Boolean);
    const online = e.vk !== 'file';
    let foot = '';
    if (mode === 'pdf') foot = online ? `<a class="sl-vurl" href="${E(watchUrl(e))}">${E(watchUrl(e))}</a>` : '<span class="sl-vurl">Vidéo jointe à la présentation Alixo</span>';
    return `<div class="sl-vcard${poster ? ' has-poster' : ''} vk-${E(e.vk)}" data-vk="${E(e.vk)}" data-vid="${E(e.vid)}"${flag(e, 'auto') ? ' data-auto="1"' : ''}${flag(e, 'loop') ? ' data-loop="1"' : ''}${flag(e, 'mute') ? ' data-mute="1"' : ''}${e.fname ? ` data-fname="${E(e.fname)}"` : ''}>
      ${poster ? `<img class="sl-vposter" src="${E(poster)}" alt="" draggable="false">` : ''}
      <div class="sl-vbody"><span class="sl-vplay">${ico('play')}</span><b class="sl-vlabel">${E(vlabel(e))}</b>${e.title ? `<span class="sl-vtitle">${E(e.title)}</span>` : ''}${badges.length ? `<span class="sl-vbadges">${badges.map(b => `<i>${b}</i>`).join('')}</span>` : ''}${foot}</div>
    </div>`;
  }

  /* ---------------- montage / démontage en présentation ---------------- */
  const live = new Map();        // <video> → URL d'objet à libérer
  const sweep = () => { for (const [v, url] of live) if (!v.isConnected) { try { v.pause(); } catch { /* */ } URL.revokeObjectURL(url); live.delete(v); } };
  const mimeOf = name => (/\.webm$/i.test(name || '') ? 'video/webm' : 'video/mp4');
  function iframeFor(card) {
    const e = { vk: card.dataset.vk, vid: card.dataset.vid, auto: card.dataset.auto === '1', loop: card.dataset.loop === '1', mute: card.dataset.mute === '1' };
    const src = embedUrl(e); if (!src) return null;
    const f = document.createElement('iframe');
    f.className = 'sl-vframe';
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    f.setAttribute('allowfullscreen', '');
    f.title = vlabel(e);
    f.src = src;
    return f;
  }
  function facadeFor(card) {
    const vk = card.dataset.vk; const sv = SERVICE[vk]; if (!sv) return null;
    const url = watchUrl({ vk, vid: card.dataset.vid });
    const box = document.createElement('div');
    box.className = 'sl-vfacade';
    box.innerHTML = `<div class="sl-vfhead">${ico('video')}<b>Vidéo ${E(sv.name)}</b></div>
      <button type="button" class="sl-vload">${ico('play')}<span>Lire la vidéo (${E(sv.name)})</span></button>
      <p class="sl-vfnote">En lançant la lecture, vous acceptez que ${E(sv.who)} reçoive l’adresse IP de cet appareil et puisse déposer des cookies ou traceurs.</p>
      <div class="sl-vfrow"><a class="sl-vext" href="${E(url)}" rel="noopener">Ouvrir sur ${E(sv.name)} à la place</a>
      <label class="sl-vremember"><input type="checkbox"> Ne plus demander pour ${E(sv.name)} sur cet appareil</label></div>`;
    return box;
  }
  /* après « Lire » : le focus revient à la scène (jamais à l'iframe cross-origin, sinon Échap et les flèches n'atteignent plus la présentation) */
  function focusStage(card) {
    const ov = card.closest('#sl-present, #sl-presenter'); const t = ov && (ov.querySelector('.sl-pstage') || ov); if (!t) return;
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    try { t.focus({ preventScroll: true }); } catch { /* */ }
  }
  function loadOnline(card) {
    const f = iframeFor(card); if (!f) return null;
    const old = card.querySelector('.sl-vfacade'); if (old) old.remove();
    card.appendChild(f); card.classList.add('mounted', 'playing');
    return f;
  }
  async function mountFile(card) {
    const vid = card.dataset.vid; if (!ID_RE.file.test(vid) || !window.AlixoFiles) return;
    let buf = null;
    try { buf = await AlixoFiles.getData(vid); } catch { buf = null; }
    if (!card.isConnected || card.classList.contains('mounted')) return;
    if (!buf) { card.insertAdjacentHTML('beforeend', '<div class="sl-vmissing">Vidéo non disponible sur cet appareil</div>'); card.classList.add('mounted'); return; }
    const blob = buf instanceof Blob ? buf : new Blob([buf], { type: mimeOf(card.dataset.fname) });
    const v = document.createElement('video');
    v.className = 'sl-vplayer'; v.controls = true; v.playsInline = true; v.setAttribute('playsinline', '');
    if (card.dataset.auto === '1') v.autoplay = true;
    if (card.dataset.mute === '1') v.muted = true;
    if (card.dataset.loop === '1') v.loop = true;
    const poster = card.querySelector('.sl-vposter'); if (poster) v.poster = poster.src;
    const url = URL.createObjectURL(blob); live.set(v, url); v.src = url;
    card.appendChild(v); card.classList.add('mounted', 'playing');
  }
  function mount(root) {
    sweep();
    if (!root || !root.querySelectorAll) return;
    for (const card of root.querySelectorAll('.sl-el.t-video .sl-vcard[data-vk]')) {
      if (card.classList.contains('mounted') || card.dataset.mounting) continue;
      const vk = card.dataset.vk;
      if (vk === 'file') { card.dataset.mounting = '1'; mountFile(card).finally(() => { delete card.dataset.mounting; }); continue; }
      if (!SERVICE[vk]) continue;
      if (hasConsent(vk)) { loadOnline(card); continue; }
      const f = facadeFor(card); if (!f) continue;
      card.appendChild(f); card.classList.add('mounted');
    }
  }
  function unmount(root) {
    if (root && root.querySelectorAll) {
      for (const card of root.querySelectorAll('.sl-vcard.mounted, .sl-vcard[data-mounting]')) {
        for (const v of card.querySelectorAll('video.sl-vplayer')) { try { v.pause(); } catch { /* */ } const url = live.get(v); if (url) { URL.revokeObjectURL(url); live.delete(v); } v.removeAttribute('src'); try { v.load(); } catch { /* */ } }
        for (const n of card.querySelectorAll('.sl-vplayer, .sl-vframe, .sl-vfacade, .sl-vmissing')) n.remove();
        card.classList.remove('mounted', 'playing'); delete card.dataset.mounting;
      }
    }
    sweep();
  }
  /* clics dans une carte montée (présentation) : jamais un changement de diapositive ; « Lire » → iframe ; lien → externe */
  function onPresentClick(ev) {
    const go = ev.target.closest('.sl-quizgo');
    if (go) { ev.stopPropagation(); ev.preventDefault(); launchQuiz(go.dataset.ref, go.dataset.mode); return; }
    const card = ev.target.closest('.sl-vcard.mounted, .sl-vcard.playing');
    if (!card) return;
    ev.stopPropagation();
    const a = ev.target.closest('a.sl-vext');
    if (a) { ev.preventDefault(); const url = a.getAttribute('href') || ''; if (/^https:\/\//.test(url)) ext(url); return; }
    const b = ev.target.closest('.sl-vload');
    if (b) { ev.preventDefault(); const cb = card.querySelector('.sl-vremember input'); if (cb && cb.checked) giveConsent(card.dataset.vk); if (loadOnline(card)) focusStage(card); }
  }

  /* ---------------- dialogue Vidéo (fichier / en ligne) ---------------- */
  function videoDialog(id) {
    const sl = S(); const e = sl && sl.el(id); if (!e || sl.isReadOnly()) return;
    if (typeof openDialog !== 'function') return;
    const online = validOnline(e);
    const cur = online ? watchUrl(e) : '';
    const tab = online || !validFile(e) && !window.AlixoFiles ? 'url' : 'file';
    const chk = (k, l) => `<label class="sl-vopt"><input type="checkbox" data-vo="${k}" ${flag(e, k) ? 'checked' : ''}> ${l}</label>`;
    openDialog({
      id: 'sl-video', cls: 'sl-vdlg', eyebrow: `${ico('video')} Présentation`, title: 'Vidéo',
      sub: 'Un fichier de votre ordinateur, ou une vidéo YouTube, Vimeo ou Dailymotion.',
      body: `<div class="sl-vtabs" role="tablist">
          <button type="button" role="tab" data-vt="file" aria-selected="${tab === 'file'}" ${tab === 'file' ? 'class="on"' : ''}>Fichier de mon ordinateur</button>
          <button type="button" role="tab" data-vt="url" aria-selected="${tab === 'url'}" ${tab === 'url' ? 'class="on"' : ''}>Vidéo en ligne</button>
        </div>
        <div class="sl-vpane" data-vp="file" ${tab === 'file' ? '' : 'hidden'}>
          <p class="sl-vp">${validFile(e) ? `Vidéo actuelle : <b>${E(e.fname || 'fichier')}</b>. ` : ''}MP4 ou WebM, 300 Mo au plus. La vidéo est rangée dans vos fichiers et lue sur cet appareil ; elle ne voyage pas dans les exports.</p>
          <button type="button" class="cta" data-va="pick">Choisir un fichier…</button>
          <p class="po-hint">${E(FIRST_IMPORT)}</p>
        </div>
        <div class="sl-vpane" data-vp="url" ${tab === 'url' ? '' : 'hidden'}>
          <label class="sl-vlab" for="sl-vurl">Adresse de la vidéo</label>
          <input id="sl-vurl" type="url" class="sl-vinput" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off" spellcheck="false" maxlength="500" value="${E(cur)}">
          <div class="po-err sl-verr" hidden>${E(BAD_URL)}</div>
          <p class="po-hint sl-vwarn">${E(WARN)}</p>
        </div>
        <div class="sl-vopts">${chk('auto', 'Lecture automatique')}${chk('loop', 'Boucle')}${chk('mute', 'Muet')}</div>`,
      foot: `<span class="dlg-spacer"></span><button type="button" class="cta ghost" data-dlg-close>Annuler</button><button type="button" class="cta" data-va="ok">Insérer</button>`,
      onMount: (card, close) => {
        card.setAttribute('aria-modal', 'true');
        const inp = card.querySelector('#sl-vurl'), err = card.querySelector('.sl-verr');
        let active = tab;
        const okBtn = card.querySelector('[data-va="ok"]');
        const setTab = t => { active = t; card.querySelectorAll('[data-vt]').forEach(b => { const on = b.dataset.vt === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); card.querySelectorAll('[data-vp]').forEach(p => { p.hidden = p.dataset.vp !== t; }); okBtn.hidden = t !== 'url'; if (t === 'url') inp.focus(); };
        setTab(active);
        const opts = () => { const o = {}; card.querySelectorAll('[data-vo]').forEach(c => { o[c.dataset.vo] = c.checked; }); return o; };
        const applyOpts = ee => { const o = opts(); for (const k of ['auto', 'loop', 'mute']) { if (o[k]) ee[k] = true; else delete ee[k]; } };
        const useUrl = () => {
          const p = parseVideoUrl(inp.value);
          if (!p) { err.hidden = false; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
          const ee = sl.el(id); if (!ee) { close(); return; }
          sl.pushHist();
          ee.vk = p.vk; ee.vid = p.vid; delete ee.fname; delete ee.poster; delete ee.title;
          applyOpts(ee);
          close(); sl.commit(); sl.renderCanvas(); sl.select(id); sl.renderBar();
        };
        card.addEventListener('click', ev => {
          const t = ev.target.closest('[data-vt]'); if (t) { setTab(t.dataset.vt); return; }
          const a = ev.target.closest('[data-va]'); if (!a) return;
          if (a.dataset.va === 'ok') { useUrl(); return; }
          if (a.dataset.va === 'pick') {
            const fi = $('#sl-video-file'); if (!fi) return;
            const ee = sl.el(id); if (ee) applyOpts(ee);
            fi.value = ''; fi.dataset.el = id; fi.click(); close();
          }
        });
        card.addEventListener('change', ev => {
          /* les cases s'appliquent tout de suite à une vidéo déjà choisie (sans changer la vidéo) */
          if (!ev.target.closest('[data-vo]')) return;
          const ee = sl.el(id); if (!ee || !(validOnline(ee) || validFile(ee))) return;
          sl.pushHist(); applyOpts(ee); sl.commit(); sl.renderCanvas(); sl.paintSel(); sl.renderBar();
        });
        inp.addEventListener('input', () => { err.hidden = true; inp.removeAttribute('aria-invalid'); });
        inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); useUrl(); } });
      }
    });
  }
  /* extension attendue ; si le navigateur annonce un type, il doit lui aussi être une vidéo (mp4, webm, quicktime, m4v) */
  const isVideoFile = f => !!(f && /\.(mp4|webm|m4v)$/i.test(f.name || '') && (!f.type || /^video\/(mp4|webm|quicktime|x-m4v)$/i.test(f.type)));
  /* affiche : image fixe prise vers la première seconde (canvas 640 px → magasin d'images) ; null si impossible */
  function capturePoster(file) {
    return new Promise(res => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true;
      let done = false;
      const end = r => { if (done) return; done = true; clearTimeout(tm); URL.revokeObjectURL(url); v.removeAttribute('src'); try { v.load(); } catch { /* */ } res(r); };
      const tm = setTimeout(() => end(null), 8000);
      v.addEventListener('loadedmetadata', () => { try { v.currentTime = Math.min(1, (v.duration || 0) / 10); } catch { end(null); } });
      v.addEventListener('seeked', async () => {
        try {
          const w = v.videoWidth, h = v.videoHeight; if (!w || !h) { end(null); return; }
          const c = document.createElement('canvas'); const k = Math.min(1, 640 / w); c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          const data = c.toDataURL('image/jpeg', 0.8);
          const iid = uid(); await AlixoImages.put(iid, data);
          end({ iid, w, h });
        } catch { end(null); }
      });
      v.addEventListener('error', () => end(null));
      v.src = url;
    });
  }
  async function importVideoFile(id, file) {
    const sl = S(); const e = sl && sl.el(id); if (!e || !file || sl.isReadOnly()) return;
    if (!isVideoFile(file)) { say('Format non pris en charge : choisissez une vidéo MP4 ou WebM.'); return; }
    if (file.size > MAX_VIDEO) { say('Vidéo trop lourde (300 Mo au plus) : compressez-la ou mettez-la en ligne et collez le lien.', { duration: 7000 }); return; }
    if (!window.AlixoFiles) { say('Module des fichiers indisponible'); return; }
    /* le rappel « N’importez que des vidéos que vous avez le droit d’utiliser » est l'encart du dialogue Vidéo (pas de toast en doublon) */
    say('Import de la vidéo…', { duration: 3000 });
    const dd = sl.doc();
    let added = [];
    try { added = await AlixoFiles.addFiles([file], dd ? dd.folderId : null); } catch (err) { console.error(err); added = []; }
    const meta = added && added[0]; if (!meta) return;
    const poster = await capturePoster(file);
    const ee = sl.el(id); if (!ee) return;
    sl.pushHist();
    ee.vk = 'file'; ee.vid = meta.id; ee.fname = meta.name; delete ee.title;
    if (poster) { ee.poster = poster.iid; const ratio = poster.h / poster.w; ee.h = Math.round(Math.max(6, Math.min(100 - ee.y, ee.w * (1280 / 720) * ratio)) * 10) / 10; } else delete ee.poster;
    sl.commit(); sl.renderCanvas(); sl.select(id); sl.renderBar();
  }

  /* ---------------- bloc quiz ---------------- */
  function quizInfo(ref) {
    if (!ref || typeof docRefInfo !== 'function') return { st: 'missing', title: 'Quiz introuvable', n: 0 };
    const info = docRefInfo({ ref, kind: 'quiz' });
    if (info.st === 'ok' && info.d && (info.d.kind || 'cours') === 'quiz') return { st: 'ok', title: info.title || 'Sans titre', n: window.AlixoQuiz && AlixoQuiz.count ? AlixoQuiz.count(info.d) : 0, shared: info.shared };
    if (info.st === 'locked') return { st: 'locked', title: 'Quiz non partagé', n: 0 };
    return { st: 'missing', title: 'Quiz introuvable', n: 0 };
  }
  const MODE_LABEL = { test: 'Test en local', live: 'En direct (code)' };
  function quizHTML(e, o) {
    const mode = (o && o.mode) || 'edit';
    const edit = mode === 'edit';
    if (!e.ref) return `<div class="sl-quizcard sl-qempty">${ico('quiz')}<span>Quiz</span>${edit ? '<small>Double-clic : choisir un de vos quiz</small>' : ''}</div>`;
    const q = quizInfo(e.ref); const m = MODE_LABEL[e.mode] ? e.mode : 'test';
    const go = q.st === 'ok' && (mode === 'present' || mode === 'audience') ? `<button type="button" class="sl-quizgo" data-ref="${E(e.ref)}" data-mode="${m}">${ico('play')}<span>Lancer le quiz</span></button>` : '';
    return `<div class="sl-quizcard st-${q.st}" data-ref="${E(e.ref)}"><span class="sl-qico">${ico('quiz')}</span><b class="sl-qtitle">${E(q.title)}</b>${q.st === 'ok' ? `<small class="sl-qmeta">${q.n} question${q.n > 1 ? 's' : ''} · ${MODE_LABEL[m]}</small>` : `<small class="sl-qmeta">${q.st === 'locked' ? 'Ce quiz ne fait pas partie du partage.' : 'Choisissez un autre quiz.'}</small>`}${go}</div>`;
  }
  function quizPicker(id) {
    const sl = S(); const e = sl && sl.el(id); if (!e || sl.isReadOnly() || typeof openTargetPicker !== 'function') return;
    const node = $(`#sl-canvas .sl-el[data-id="${id}"]`);
    openTargetPicker({
      title: e.ref ? 'Changer de quiz' : 'Lier un quiz', kinds: ['quiz'],
      hint: 'La carte lance ce quiz pendant la présentation. Les personnes avec qui vous partagez devront aussi y avoir accès.',
      empty: 'Aucun quiz dans votre bibliothèque : créez-en un depuis le menu Nouveau.',
      anchor: node ? node.getBoundingClientRect() : undefined,
      onPick: t => { const ee = sl.el(id); if (!ee || !t || t.kind !== 'quiz') return; sl.pushHist(); ee.ref = t.ref; if (!MODE_LABEL[ee.mode]) ee.mode = 'test'; sl.commit(); sl.renderCanvas(); sl.select(id); sl.renderBar(); }
    });
  }
  /* index de la diapositive affichée en présentation (sinon la diapositive courante de l'éditeur) */
  function presentIndex() {
    const sl = S(); const list = sl.slides();
    const P = window.AlixoSlidesPresent;
    if (P && typeof P.active === 'function' && P.active() && typeof P.index === 'function') return Math.max(0, Math.min(list.length - 1, +P.index() || 0));
    const pin = $('#sl-present .sl-pin:not([hidden]) .sl-slide[data-sid]') || $('#sl-present .sl-slide[data-sid]');
    const sid = pin ? pin.dataset.sid : sl.cur();
    return Math.max(0, list.findIndex(s => s.id === sid));
  }
  function launchQuiz(ref, mode) {
    const sl = S(); const dd = sl && sl.doc(); if (!dd || !ref) return;
    const target = typeof findDoc === 'function' ? findDoc(ref) : null;
    if (typeof findDoc === 'function' && (!target || (target.kind || 'cours') !== 'quiz')) { say('Quiz introuvable'); return; }
    try { sessionStorage.setItem(SS_RETURN, JSON.stringify({ docId: dd.id, i: presentIndex(), quiz: ref })); } catch { /* */ }
    const P = window.AlixoSlidesPresent;
    if (P && typeof P.active === 'function' && P.active() && typeof P.close === 'function') P.close();
    else if (typeof sl.closePresent === 'function') sl.closePresent();
    if (typeof openDoc !== 'function') return;
    openDoc(ref);
    requestAnimationFrame(() => {
      if (!window.AlixoQuiz) return;
      if (mode === 'live') AlixoQuiz.startLive(); else AlixoQuiz.startTest();
      renderReturn();
    });
  }
  /* pastille « Revenir à la présentation » : visible tant qu'on est sur le quiz lancé depuis le diaporama */
  let retTm = 0;
  const retInfo = () => { try { const o = JSON.parse(sessionStorage.getItem(SS_RETURN) || 'null'); return o && typeof o.docId === 'string' && typeof o.i === 'number' ? o : null; } catch { return null; } };
  const clearReturn = () => { try { sessionStorage.removeItem(SS_RETURN); } catch { /* */ } };
  function renderReturn() {
    const box = $('#sl-return'); if (!box) return;
    const r = retInfo();
    const here = typeof currentDocId !== 'undefined' ? currentDocId : null;
    const onQuiz = document.body.classList.contains('mode-quiz') && (!r || !r.quiz || here === r.quiz);
    if (!r || !onQuiz) { box.hidden = true; box.innerHTML = ''; if (r && !onQuiz && here && here !== r.quiz) clearReturn(); if (!retInfo()) { clearInterval(retTm); retTm = 0; } return; }
    const playing = document.body.classList.contains('qz-playing');
    if (!box.innerHTML) box.innerHTML = `<button type="button" class="sl-retbtn">${ico('play')}<span>Revenir à la présentation</span></button>`;
    box.hidden = playing;
    if (!retTm) retTm = setInterval(renderReturn, 800);
  }
  function goBack() {
    const r = retInfo(); clearReturn(); renderReturn();
    if (!r || typeof openDoc !== 'function' || typeof findDoc !== 'function' || !findDoc(r.docId)) { say('La présentation n’est plus disponible'); return; }
    openDoc(r.docId);
    requestAnimationFrame(() => { const sl = S(); if (sl && typeof sl.present === 'function') sl.present(r.i); });
  }

  /* ---------------- images : menu à trois entrées, banque, crédit ---------------- */
  const ICO = {
    pc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5Z"/></svg>',
    bank: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'
  };
  const accountOk = () => !!(window.AlixoAuth && AlixoAuth.isConfigured && AlixoAuth.account && AlixoAuth.account());
  const anchorRect = (id, anchor) => {
    if (anchor && typeof anchor.getBoundingClientRect === 'function') return anchor.getBoundingClientRect();
    if (anchor && typeof anchor.left === 'number') return anchor;
    const n = $(`#sl-canvas .sl-el[data-id="${id}"]`);
    if (n) { const r = n.getBoundingClientRect(); return { left: r.left + r.width / 2 - 120, top: r.top + r.height / 2 - 60, bottom: r.top + r.height / 2 - 60 }; }
    return typeof centerRect === 'function' ? centerRect() : { left: innerWidth / 2 - 120, top: innerHeight / 2 - 80, bottom: innerHeight / 2 - 80 };
  };
  function openImageMenu(id, anchor) {
    const sl = S(); const e = sl && sl.el(id); if (!e || sl.isReadOnly() || typeof showPopover !== 'function') return;
    const cloud = !!(window.AlixoImagePick && AlixoImagePick.openGallery && accountOk());
    const bank = !!(window.AlixoImageBank && AlixoImageBank.open);
    showPopover(`<div class="ip-menu sl-imenu" role="menu" aria-label="Image">
        <button type="button" role="menuitem" data-im="pc">${ICO.pc}<span>Mon ordinateur</span></button>
        ${cloud ? `<button type="button" role="menuitem" data-im="cloud">${ICO.cloud}<span>Mes photos du compte</span></button>` : ''}
        ${bank ? `<button type="button" role="menuitem" data-im="bank">${ICO.bank}<span>Banque d’images libres</span></button>` : ''}
      </div>`, anchorRect(id, anchor), pop => {
      const items = [...pop.querySelectorAll('[data-im]')];
      items[0].focus({ preventScroll: true });
      pop.addEventListener('keydown', ev => {
        const i = items.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); items[(i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); hidePopover(); }
      });
      pop.addEventListener('click', ev => {
        const it = ev.target.closest('[data-im]'); if (!it) return;
        hidePopover();
        if (it.dataset.im === 'pc') { if (typeof sl.pickImage === 'function') sl.pickImage(id); }
        else if (it.dataset.im === 'cloud') AlixoImagePick.openGallery((iid, dims) => setFromIid(id, iid, dims));
        else if (it.dataset.im === 'bank') AlixoImageBank.open({ onPick: (item, blob) => insertFromBank(id, item, blob) });
      });
    });
  }
  const fitHeight = (ee, w, h) => { if (!w || !h) return; ee.h = Math.round(Math.max(6, Math.min(100 - ee.y, ee.w * (1280 / 720) * (h / w))) * 10) / 10; };
  async function setFromIid(id, iid, dims) {
    const sl = S(); const ee = sl && sl.el(id); if (!ee || !iid) return;
    let w = dims && dims.nw, h = dims && dims.nh;
    const data = await AlixoImages.get(iid); if (!data) { say('Image introuvable'); return; }
    if (!w || !h) { const d2 = await new Promise(res => { const x = new Image(); x.onload = () => res([x.naturalWidth, x.naturalHeight]); x.onerror = () => res([0, 0]); x.src = data; }); w = d2[0]; h = d2[1]; }
    const e2 = sl.el(id); if (!e2) return;
    sl.pushHist(); e2.iid = iid; delete e2.credit; fitHeight(e2, w, h);
    sl.commit(); sl.renderCanvas(); sl.select(id);
  }
  async function insertFromBank(id, item, blob) {
    const sl = S(); if (!sl || !sl.el(id)) return;
    const type = blob && blob.type || 'image/jpeg';
    if (typeof storageAllows === 'function' && !(await storageAllows(blob.size))) return;   // limite de stockage du compte gratuit
    const im = await fileToImage(new File([blob], 'image.' + (type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, ''), { type }));
    const iid = uid(); await AlixoImages.put(iid, im.data);
    const ee = sl.el(id); if (!ee) return;
    sl.pushHist(); ee.iid = iid; ee.credit = AlixoImageBank.credit(item); fitHeight(ee, im.w, im.h);
    sl.commit(); sl.renderCanvas(); sl.select(id);
    say('Image insérée — crédit ajouté sous l’image');
  }
  /* mention d'auteur et de licence sous l'image (toujours rendue quand e.credit existe) ; en PDF : + la page source en clair */
  function creditHTML(e, o) {
    if (!e || !e.credit || typeof e.credit !== 'object' || !window.AlixoImageBank) return '';
    const txt = AlixoImageBank.creditText(e.credit); if (!txt) return '';
    const mode = (o && o.mode) || 'edit';
    if (mode !== 'pdf') return `<div class="sl-credit">${E(txt)}</div>`;
    /* PDF : titre de l'œuvre, adresse de la licence et page source en clair (adresses https vérifiées) */
    const https = v => typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : '';
    const title = typeof e.credit.title === 'string' && e.credit.title.trim() ? `<small class="sl-credit-title">« ${E(e.credit.title.trim())} »</small>` : '';
    const lic = https(e.credit.licenseUrl) ? `<small class="sl-credit-url">Licence : ${E(e.credit.licenseUrl)}</small>` : '';
    const url = https(e.credit.url) ? `<small class="sl-credit-url">${E(e.credit.url)}</small>` : '';
    return `<div class="sl-credit">${E(txt)}${title}${lic}${url}</div>`;
  }

  /* ---------------- Paramètres : oublier les autorisations vidéo ---------------- */
  function settingsHTML() {
    return `<div class="set-sect"><div class="po-label">Vidéos dans les présentations</div>
      <div class="po-row" style="align-items:center; gap:10px; flex-wrap:wrap"><button id="po-video-forget" class="cta ghost small" type="button">Oublier les autorisations vidéo</button><span class="po-hint" style="margin:0">Quand vous cochez « Ne plus demander » devant une vidéo YouTube, Vimeo ou Dailymotion, Alixo la charge directement pendant vos présentations (le service reçoit alors l’adresse IP de l’appareil). Ce bouton efface ces choix : la question sera posée à nouveau.</span></div></div>`;
  }
  function bindSettings(root) {
    const b = root && root.querySelector('#po-video-forget'); if (!b) return;
    b.addEventListener('click', () => { const n = forgetConsents(); say(n ? `${n} autorisation${n > 1 ? 's' : ''} vidéo oubliée${n > 1 ? 's' : ''}` : 'Aucune autorisation vidéo mémorisée sur cet appareil'); });
  }

  /* ---------------- branchements ---------------- */
  const init = () => {
    const fi = $('#sl-video-file');
    if (fi && !fi.dataset.bound) { fi.dataset.bound = '1'; fi.addEventListener('change', ev => { const f = ev.target.files && ev.target.files[0]; const id = ev.target.dataset.el; ev.target.value = ''; if (f && id) importVideoFile(id, f); }); }
    const ov = $('#sl-present');
    if (ov && !ov.dataset.mediaBound) {
      ov.dataset.mediaBound = '1';
      ov.addEventListener('click', onPresentClick, true);
      /* à la fermeture du diaporama (hidden), tout est démonté et les URL d'objet libérées */
      new MutationObserver(() => { if (ov.hidden) unmount(ov); }).observe(ov, { attributes: true, attributeFilter: ['hidden'] });
    }
    const ret = $('#sl-return');
    if (ret && !ret.dataset.bound) { ret.dataset.bound = '1'; ret.addEventListener('click', ev => { if (ev.target.closest('.sl-retbtn')) goBack(); }); }
    /* au démarrage, on n'est jamais sur un quiz lancé depuis un diaporama : une clé restée en session est obsolète */
    if (retInfo()) { if (document.body.classList.contains('mode-quiz')) renderReturn(); else clearReturn(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return {
    HOSTS, ID_RE, SERVICE, WARN, FIRST_IMPORT,
    parseVideoUrl, embedUrl, watchUrl, isVideoFile,
    videoHTML, quizHTML, creditHTML,
    videoDialog, importVideoFile, capturePoster, mount, unmount,
    quizInfo, quizPicker, launchQuiz, renderReturn,
    openImageMenu, insertFromBank, setFromIid,
    hasConsent, forgetConsents, settingsHTML, bindSettings
  };
})();
