/* ============================================================
   Outils d'image (1.51) — clic droit sur une image d'une séance
   Tout se fait sur l'appareil (canvas) : aucune image n'est envoyée sur le réseau par ce module.

   Modèle hybride, sur le bloc { type: 'img', iid, nw, nh, w, align, crop, cap, alt } :
   - réglages NON destructifs  b.fx = { br, ct, sat (-100..100), gray: true, rad (0..50, % du petit côté ; 50 = ovale),
                                         sh: true, bd: { w (1..12 px), c: '#rrggbb' } }
     rendus par le CSS (variables --fx, --rad, --bdw, --bdc posées sur la figure) et « cuits » seulement à l'export (bake) ;
   - opérations sur les pixels (suppression du fond, rotation, miroir) : une NOUVELLE image, sous un nouvel iid ;
     à la première, b.o = { iid, nw, nh } garde l'original. L'historique photographie les blocs et l'ancienne image
     reste dans le magasin : Ctrl+Z annule sans rien ajouter. « Réinitialiser l'image » revient à b.o.
   Chargé AVANT app.js (styleVars / classes servent dès le premier rendu) ; les globales d'app.js (getBlock, touch,
   renderBlocks, AlixoImages, IMG_MAX_BYTES, storageAllows…) ne sont lues qu'au moment des actions.
   1.52 : « Supprimer le fond » fait partie d'Alixo+ (requirePlus('detourage') d'app.js) ; l'entrée reste visible dans le
   menu, marquée d'un badge Alixo+ quand l'abonnement n'est pas actif.
   ============================================================ */
'use strict';

window.AlixoImgTools = (() => {
  /* ---------------- réglages : lecture sûre du modèle ---------------- */
  const clampInt = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0; };
  function hexColor(c) {
    const m = String(c || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return '';
    return '#' + (m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1]).toLowerCase();
  }
  /* forme complète et bornée des réglages d'un bloc (un document reçu peut contenir n'importe quoi) */
  function fxOf(b) {
    const f = b && b.fx && typeof b.fx === 'object' ? b.fx : {};
    const bd = f.bd && typeof f.bd === 'object' ? f.bd : null;
    const bw = bd ? clampInt(bd.w, 0, 12) : 0;
    return { br: clampInt(f.br, -100, 100), ct: clampInt(f.ct, -100, 100), sat: clampInt(f.sat, -100, 100), gray: f.gray === true,
      rad: clampInt(f.rad, 0, 50), sh: f.sh === true, bd: bw ? { w: bw, c: hexColor(bd.c) } : null };
  }
  /* écrit les réglages dans le bloc en ne gardant que ce qui diffère du défaut (b.fx disparaît s'il n'y a plus rien) */
  function setFx(b, patch) {
    const f = Object.assign(fxOf(b), patch || {});
    const out = {};
    for (const k of ['br', 'ct', 'sat']) { const n = clampInt(f[k], -100, 100); if (n) out[k] = n; }
    if (f.gray === true) out.gray = true;
    const rad = clampInt(f.rad, 0, 50); if (rad) out.rad = rad;
    if (f.sh === true) out.sh = true;
    if (f.bd && clampInt(f.bd.w, 0, 12)) { const c = hexColor(f.bd.c); out.bd = c ? { w: clampInt(f.bd.w, 0, 12), c } : { w: clampInt(f.bd.w, 0, 12) }; }
    if (Object.keys(out).length) b.fx = out; else delete b.fx;
    return b.fx;
  }
  const hasFx = b => { const f = fxOf(b); return !!(f.br || f.ct || f.sat || f.gray || f.rad || f.sh || f.bd); };
  const cropOf = b => { const c = b && b.crop; return c && c.w > 0 && c.h > 0 ? { x: +c.x || 0, y: +c.y || 0, w: +c.w, h: +c.h } : { x: 0, y: 0, w: 1, h: 1 }; };
  const origOf = b => (b && b.o && typeof b.o === 'object' && typeof b.o.iid === 'string' && /^[\w-]{1,64}$/.test(b.o.iid) ? b.o : null);
  /* JSON d'un document SANS la référence à l'original des images retouchées (b.o) : c'est la forme qui sort de l'appareil
     (export .alx, séance partagée). Le fond retiré par « Supprimer le fond » ne doit pas voyager avec le document, ni pouvoir
     être rétabli par la personne qui le reçoit. Le document en mémoire n'est pas modifié ; sans b.o, le texte produit est
     exactement celui de JSON.stringify. */
  function publicJSON(d) { return JSON.stringify(d, function (k, v) { return k === 'o' && this && this.type === 'img' ? undefined : v; }); }

  /* facteurs des filtres : les mêmes à l'écran (CSS) et à l'export (bake) */
  const kBr = f => 1 + f.br * 0.006, kCt = f => 1 + f.ct * 0.006, kSat = f => 1 + f.sat / 100;
  function filterCss(f) {
    const p = [];
    if (f.br) p.push(`brightness(${kBr(f).toFixed(3)})`);
    if (f.ct) p.push(`contrast(${kCt(f).toFixed(3)})`);
    if (f.sat) p.push(`saturate(${kSat(f).toFixed(3)})`);
    if (f.gray) p.push('grayscale(1)');
    return p.join(' ');
  }
  /* rayon des coins : 50 = ovale ; sinon coins réguliers, en % du petit côté de l'image affichée (recadrage compris) */
  function radiusCss(b, f) {
    if (!f.rad) return '';
    if (f.rad >= 50) return '50%';
    const c = cropOf(b), W = c.w * (+b.nw || 4), H = c.h * (+b.nh || 3), m = Math.min(W, H) || 1;
    return `${(f.rad * m / W).toFixed(2)}% / ${(f.rad * m / H).toFixed(2)}%`;
  }
  /* suite du style de la figure (après imgStyle) : uniquement des nombres bornés et une couleur validée */
  function styleVars(b) {
    const f = fxOf(b), fc = filterCss(f), rc = radiusCss(b, f);
    return (fc ? `; --fx:${fc}` : '') + (rc ? `; --rad:${rc}` : '') + (f.bd ? `; --bdw:${f.bd.w}px` + (f.bd.c ? `; --bdc:${f.bd.c}` : '') : '');
  }
  function classes(b) { const f = fxOf(b); return (f.rad ? ' fx-rad' : '') + (f.bd ? ' fx-bd' : '') + (f.sh ? ' fx-sh' : ''); }

  /* ---------------- cuisson des réglages (export, copie, téléchargement) ---------------- */
  /* applique luminosité, contraste, saturation, noir et blanc (formules des filtres CSS, pixel par pixel : ctx.filter
     manque dans certains Safari) puis le masque des coins. Bordure et ombre ne sont pas cuites. */
  function bake(ctx, fxRaw, w, h) {
    const f = fxOf({ fx: fxRaw });
    w = w || ctx.canvas.width; h = h || ctx.canvas.height;
    if (f.br || f.ct || f.sat || f.gray) {
      const im = ctx.getImageData(0, 0, w, h), d = im.data;
      const kb = kBr(f), kc = kCt(f), s = kSat(f);
      const m = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
      const cl = v => (v < 0 ? 0 : v > 255 ? 255 : v);
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        let r = d[i], g = d[i + 1], bl = d[i + 2];
        if (f.br) { r *= kb; g *= kb; bl *= kb; r = cl(r); g = cl(g); bl = cl(bl); }
        if (f.ct) { r = cl((r - 127.5) * kc + 127.5); g = cl((g - 127.5) * kc + 127.5); bl = cl((bl - 127.5) * kc + 127.5); }
        if (f.sat) { const r2 = m[0] * r + m[1] * g + m[2] * bl, g2 = m[3] * r + m[4] * g + m[5] * bl, b2 = m[6] * r + m[7] * g + m[8] * bl; r = cl(r2); g = cl(g2); bl = cl(b2); }
        if (f.gray) { const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl; r = g = bl = l; }
        d[i] = r; d[i + 1] = g; d[i + 2] = bl;
      }
      ctx.putImageData(im, 0, 0);
    }
    if (f.rad) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = '#000';
      ctx.beginPath();
      if (f.rad >= 50) ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else {
        const r = Math.min(w, h) * f.rad / 100;
        ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r); ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r); ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- suppression du fond ---------------- */
  /* Couleur de référence : médiane du pourtour, ou couleur du point cliqué (o.pick = { x, y } en fractions).
     Un pixel est « fond » si sa distance RVB à la référence est sous la tolérance ; bord adouci entre tol et tol + lissage,
     avec retrait de la couleur du fond dans les pixels à moitié transparents (pas de liseré).
     o.contiguous (défaut) : diffusion depuis les bords (et le point cliqué) ; sinon toute la couleur, zones fermées comprises.
     Modifie imageData sur place ; renvoie { removed, total, ref }. */
  function borderMedian(d, w, h) {
    const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256);
    let n = 0;
    const add = p => { const i = p * 4; if (d[i + 3] < 8) return; hr[d[i]]++; hg[d[i + 1]]++; hb[d[i + 2]]++; n++; };
    const sx = Math.max(1, Math.floor(w / 1500)), sy = Math.max(1, Math.floor(h / 1500));
    for (let x = 0; x < w; x += sx) { add(x); add((h - 1) * w + x); }
    for (let y = 0; y < h; y += sy) { add(y * w); add(y * w + w - 1); }
    if (!n) return [255, 255, 255];
    const med = hist => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc * 2 >= n) return v; } return 255; };
    return [med(hr), med(hg), med(hb)];
  }
  function removeBg(im, o = {}) {
    const d = im.data, w = im.width, h = im.height, n = w * h;
    const tol = Math.max(0, Math.min(100, Number.isFinite(+o.tol) ? +o.tol : 18));
    const T = tol * 2.6 + 2, F = Number.isFinite(+o.feather) ? Math.max(1, +o.feather) : Math.max(8, T * 0.35);
    const T2 = T * T, TF2 = (T + F) * (T + F);
    let pickP = -1;
    if (o.pick && Number.isFinite(+o.pick.x) && Number.isFinite(+o.pick.y)) {
      const px = Math.max(0, Math.min(w - 1, Math.floor(+o.pick.x * w))), py = Math.max(0, Math.min(h - 1, Math.floor(+o.pick.y * h)));
      pickP = py * w + px;
    }
    let ref;
    if (pickP >= 0) {   // moyenne 3 × 3 autour du point cliqué
      let r = 0, g = 0, b = 0, k = 0; const px = pickP % w, py = (pickP - px) / w;
      for (let y = Math.max(0, py - 1); y <= Math.min(h - 1, py + 1); y++) for (let x = Math.max(0, px - 1); x <= Math.min(w - 1, px + 1); x++) { const i = (y * w + x) * 4; if (d[i + 3] < 8) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; k++; }
      ref = k ? [r / k, g / k, b / k] : [255, 255, 255];
    } else ref = borderMedian(d, w, h);
    const R = ref[0], G = ref[1], B = ref[2];
    const dist2 = i => { if (d[i + 3] < 8) return 0; const a = d[i] - R, b = d[i + 1] - G, c = d[i + 2] - B; return a * a + b * b + c * c; };
    let removed = 0;
    const apply = (i, d2) => {
      if (d2 <= T2) { if (d[i + 3]) { d[i + 3] = 0; removed++; } return; }
      const af = (Math.sqrt(d2) - T) / F;   // 0..1 : part de l'image dans ce pixel de bord
      if (af >= 1) return;
      const a = Math.round(af * 255);
      if (a < d[i + 3]) {
        d[i] = Math.max(0, Math.min(255, (d[i] - (1 - af) * R) / af));
        d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] - (1 - af) * G) / af));
        d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] - (1 - af) * B) / af));
        d[i + 3] = a;
      }
    };
    if (o.contiguous === false) {
      for (let p = 0; p < n; p++) { const d2 = dist2(p * 4); if (d2 < TF2) apply(p * 4, d2); }
    } else {
      const seen = new Uint8Array(n), q = new Int32Array(n), qd = new Float32Array(n);
      let qh = 0, qt = 0;
      const push = p => { if (seen[p]) return; seen[p] = 1; const d2 = dist2(p * 4); if (d2 < TF2) { qd[qt] = d2; q[qt++] = p; } };
      for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
      if (pickP >= 0) push(pickP);
      while (qh < qt) {
        const p = q[qh], d2 = qd[qh++];
        const x = p % w;
        /* la diffusion ne repart que d'un pixel franchement « fond » : la zone de lissage ne propage pas */
        if (d2 <= T2) { if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (p >= w) push(p - w); if (p < n - w) push(p + w); }
        apply(p * 4, d2);
      }
    }
    return { removed, total: n, ref: [Math.round(R), Math.round(G), Math.round(B)] };
  }

  /* ---------------- images : chargement, encodage ---------------- */
  const loadImage = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Image illisible')); im.src = src; });
  const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const isJpegSrc = src => /^data:image\/jpe?g/i.test(String(src || ''));
  /* data URL sous IMG_MAX_BYTES : PNG si léger, sinon WebP (transparence gardée), JPEG pour une photo sans transparence ;
     réduit les dimensions par pas de 0,85 tant que c'est trop lourd. Renvoie { data, w, h, shrunk } ou null. */
  function encodeCanvas(c, alpha) {
    const max = typeof IMG_MAX_BYTES === 'number' ? IMG_MAX_BYTES : 940 * 1024;
    let cur = c, shrunk = false;
    for (let k = 0; k < 14; k++) {
      let data;
      if (alpha) {
        data = cur.toDataURL('image/png');
        if (data.length > max * 0.45) { const wp = cur.toDataURL('image/webp', 0.9); if (wp.startsWith('data:image/webp') && wp.length < data.length) data = wp; }
      } else data = cur.toDataURL('image/jpeg', 0.9);
      if (data.length <= max) return { data, w: cur.width, h: cur.height, shrunk };
      if (Math.max(cur.width, cur.height) < 48) break;
      const nx = canvasOf(cur.width * 0.85, cur.height * 0.85);
      const x = nx.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, nx.width, nx.height);
      cur = nx; shrunk = true;
    }
    return null;
  }
  async function sourceOf(b) {
    const src = AlixoImages.cache.get(b.iid) || await AlixoImages.get(b.iid);
    if (!src) throw new Error('Image pas encore chargée');
    return src;
  }
  /* image telle qu'elle est affichée : recadrage et réglages appliqués (copie, téléchargement) */
  async function renderCanvas(b, maxSide = 2400) {
    const img = await loadImage(await sourceOf(b));
    const c0 = cropOf(b);
    const sx = Math.round(c0.x * img.naturalWidth), sy = Math.round(c0.y * img.naturalHeight);
    const sw = Math.max(1, Math.round(c0.w * img.naturalWidth)), sh = Math.max(1, Math.round(c0.h * img.naturalHeight));
    const k = Math.min(1, maxSide / Math.max(sw, sh));
    const c = canvasOf(sw * k, sh * k), ctx = c.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    if (b.fx) bake(ctx, b.fx, c.width, c.height);
    return c;
  }
  const canvasBlob = (c, mime = 'image/png') => new Promise((res, rej) => c.toBlob(bl => (bl ? res(bl) : rej(new Error('Image vide'))), mime));

  /* remplace l'image du bloc par le contenu d'un canvas (nouvel iid, original mémorisé dans b.o) */
  async function commitPixels(id, fromIid, canvas, alpha, after, msg) {
    const enc = encodeCanvas(canvas, alpha);
    if (!enc) { toast('Image trop lourde pour être enregistrée après cette retouche'); return false; }
    if (!await storageAllows(enc.data.length)) return false;
    const b = getBlock(id);
    if (!b || b.type !== 'img' || b.iid !== fromIid) { toast('L’image a changé entre-temps : retouche abandonnée'); return false; }
    const iid = uid();
    await AlixoImages.put(iid, enc.data);
    if (!origOf(b)) b.o = { iid: b.iid, nw: +b.nw || enc.w, nh: +b.nh || enc.h };
    b.iid = iid; b.nw = enc.w; b.nh = enc.h;
    if (after) after(b);
    touch(); renderBlocks('__none'); selectObj(id);
    toast(msg + (enc.shrunk ? ' — image un peu réduite pour rester sous la limite de taille' : ' — Ctrl+Z pour annuler'));
    return true;
  }

  /* ---------------- pivoter, miroir ---------------- */
  const round4 = v => Math.round(v * 10000) / 10000;
  async function transform(id, kind) {
    const b = getBlock(id); if (!b || b.type !== 'img') return;
    let src, img;
    try { src = await sourceOf(b); img = await loadImage(src); } catch (e) { toast(e.message || 'Image illisible'); return; }
    const w = img.naturalWidth, h = img.naturalHeight, rot = kind === 'rotl' || kind === 'rotr';
    const c = canvasOf(rot ? h : w, rot ? w : h), ctx = c.getContext('2d');
    if (kind === 'rotr') { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
    else if (kind === 'rotl') { ctx.translate(0, w); ctx.rotate(-Math.PI / 2); }
    else if (kind === 'fliph') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    else { ctx.translate(0, h); ctx.scale(1, -1); }
    ctx.drawImage(img, 0, 0);
    await commitPixels(id, b.iid, c, !isJpegSrc(src), bb => {
      if (!bb.crop) return;   // le recadrage suit la transformation
      const k = cropOf(bb);
      const n = kind === 'rotr' ? { x: 1 - (k.y + k.h), y: k.x, w: k.h, h: k.w } : kind === 'rotl' ? { x: k.y, y: 1 - (k.x + k.w), w: k.h, h: k.w }
        : kind === 'fliph' ? { x: 1 - (k.x + k.w), y: k.y, w: k.w, h: k.h } : { x: k.x, y: 1 - (k.y + k.h), w: k.w, h: k.h };
      bb.crop = { x: round4(Math.max(0, n.x)), y: round4(Math.max(0, n.y)), w: round4(n.w), h: round4(n.h) };
    }, { rotl: 'Image pivotée vers la gauche', rotr: 'Image pivotée vers la droite', fliph: 'Miroir horizontal appliqué', flipv: 'Miroir vertical appliqué' }[kind]);
  }

  /* ---------------- fenêtre « Supprimer le fond » ---------------- */
  async function openRemoveBg(id) {
    if (typeof requirePlus === 'function' && !requirePlus('detourage')) return;   // 1.52 : Alixo+ (ouvre la fenêtre Alixo+ sinon)
    const b = getBlock(id); if (!b || b.type !== 'img') return;
    let src, img;
    try { src = await sourceOf(b); img = await loadImage(src); } catch (e) { toast(e.message || 'Image illisible'); return; }
    const fromIid = b.iid;
    const k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const pw = Math.max(1, Math.round(img.naturalWidth * k)), ph = Math.max(1, Math.round(img.naturalHeight * k));
    const st = { tol: 18, contiguous: true, pick: null };
    openDialog({
      id: 'igov', cls: 'narrow ig-dlg', title: 'Supprimer le fond',
      sub: 'Le détourage est calculé sur cet appareil, sans service externe. L’image obtenue est enregistrée comme les autres images du document. L’image d’origine est conservée : « Réinitialiser l’image » la rétablit.',
      body: `<div class="ig-stage"><canvas class="ig-cv" width="${pw}" height="${ph}" role="img" aria-label="Aperçu de l’image sans son fond (le damier montre les zones transparentes)" title="Cliquer pour désigner la couleur à retirer"></canvas></div>
        <div class="ig-ctl">
          <label class="ig-row" for="ig-tol"><span>Tolérance</span><input type="range" id="ig-tol" aria-describedby="ig-tolhelp" min="0" max="100" step="1" value="${st.tol}"><output id="ig-tolv" for="ig-tol">${st.tol}</output></label>
          <p class="ig-help" id="ig-tolhelp">Plus la valeur est élevée, plus les couleurs proches du fond sont retirées.</p>
          <label class="ig-check"><input type="checkbox" id="ig-contig" checked><span>Depuis les bords uniquement<small>Décochez pour retirer aussi les zones fermées de la même couleur.</small></span></label>
          <div class="ig-ref"><b>Couleur retirée</b><i class="ig-sw" aria-hidden="true"></i><span id="ig-reftxt"></span><button type="button" class="cta ghost small" id="ig-auto" hidden>Couleur automatique</button></div>
          <p class="ig-msg" id="ig-msg" role="status" aria-live="polite"></p>
        </div>`,
      foot: `<button type="button" class="cta ghost" data-dlg-close>Annuler</button><button type="button" class="cta" id="ig-ok">Appliquer</button>`,
      onMount: (card, close) => {
        const cv = card.querySelector('.ig-cv'), ctx = cv.getContext('2d', { willReadFrequently: true });
        const sc = canvasOf(pw, ph), sctx = sc.getContext('2d', { willReadFrequently: true });
        sctx.drawImage(img, 0, 0, pw, ph);
        const base = sctx.getImageData(0, 0, pw, ph);
        const tolIn = card.querySelector('#ig-tol'), tolOut = card.querySelector('#ig-tolv'), contig = card.querySelector('#ig-contig');
        const sw = card.querySelector('.ig-sw'), refTxt = card.querySelector('#ig-reftxt'), auto = card.querySelector('#ig-auto'), msg = card.querySelector('#ig-msg'), okBtn = card.querySelector('#ig-ok');
        let raf = 0, last = null;
        const draw = () => {
          raf = 0;
          const im = new ImageData(new Uint8ClampedArray(base.data), pw, ph);
          last = removeBg(im, st);
          ctx.clearRect(0, 0, pw, ph); ctx.putImageData(im, 0, 0);
          sw.style.background = `rgb(${last.ref[0]}, ${last.ref[1]}, ${last.ref[2]})`;
          refTxt.textContent = st.pick ? 'celle du point cliqué' : 'celle du pourtour — cliquez dans l’image pour en désigner une autre';
          auto.hidden = !st.pick;
          const part = last.removed / last.total;
          msg.textContent = !last.removed ? 'Rien à retirer avec ce réglage : augmentez la tolérance ou cliquez sur le fond.' : part > 0.985 ? 'Presque toute l’image disparaît : diminuez la tolérance.' : '';
          okBtn.disabled = !last.removed || part > 0.985;
        };
        const refresh = () => { if (!raf) raf = requestAnimationFrame(draw); };
        tolIn.addEventListener('input', () => { st.tol = +tolIn.value; tolOut.textContent = tolIn.value; refresh(); });
        contig.addEventListener('change', () => { st.contiguous = contig.checked; refresh(); });
        cv.addEventListener('click', e => { const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return; st.pick = { x: Math.max(0, Math.min(0.9999, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(0.9999, (e.clientY - r.top) / r.height)) }; refresh(); });
        auto.addEventListener('click', () => { st.pick = null; refresh(); });
        okBtn.addEventListener('click', async () => {
          if (okBtn.disabled) return;
          okBtn.disabled = true; okBtn.textContent = 'Traitement…';
          await new Promise(r => setTimeout(r, 30));   // le libellé s'affiche avant le calcul en pleine résolution
          try {
            const full = canvasOf(img.naturalWidth, img.naturalHeight), fctx = full.getContext('2d', { willReadFrequently: true });
            fctx.drawImage(img, 0, 0);
            const im = fctx.getImageData(0, 0, full.width, full.height);
            removeBg(im, st);
            fctx.putImageData(im, 0, 0);
            close();
            await commitPixels(id, fromIid, full, true, null, 'Fond supprimé');
          } catch (err) { console.error(err); okBtn.disabled = false; okBtn.textContent = 'Appliquer'; toast('Suppression du fond impossible sur cette image'); }
        });
        draw();
        setTimeout(() => tolIn.focus(), 40);
      }
    });
  }

  /* ---------------- réglages (curseurs, aperçu direct) ---------------- */
  function openAdjust(id, rect) {
    const b = getBlock(id); if (!b || b.type !== 'img') return;
    const f0 = fxOf(b), v = { br: f0.br, ct: f0.ct, sat: f0.sat };
    const row = (k, lab) => `<label class="ig-row" for="ig-a-${k}"><span>${lab}</span><input type="range" id="ig-a-${k}" data-k="${k}" min="-100" max="100" step="1" value="${v[k]}"><output for="ig-a-${k}">${v[k]}</output></label>`;
    showPopover(`<h4>Réglages de l’image</h4>
      <div class="ig-adj">${row('br', 'Luminosité')}${row('ct', 'Contraste')}${row('sat', 'Saturation')}</div>
      <div class="po-row ig-adj-foot"><button type="button" class="cta ghost small" id="ig-a0">Remettre à zéro</button><button type="button" class="pobtn" id="ig-aok">Terminé</button></div>`,
      rect, pop => {
        const fig = [...document.querySelectorAll('#blocks > .block.img')].find(el => el.dataset.id === id);
        const live = () => { if (!fig) return; const fc = filterCss(Object.assign(fxOf(getBlock(id) || {}), v)); if (fc) fig.style.setProperty('--fx', fc); else fig.style.removeProperty('--fx'); };
        pop.querySelectorAll('input[type="range"]').forEach(inp => inp.addEventListener('input', () => { v[inp.dataset.k] = clampInt(inp.value, -100, 100); inp.nextElementSibling.textContent = inp.value; live(); }));
        pop.querySelector('#ig-a0').addEventListener('click', () => { v.br = v.ct = v.sat = 0; pop.querySelectorAll('input[type="range"]').forEach(inp => { inp.value = 0; inp.nextElementSibling.textContent = '0'; }); live(); });
        pop.querySelector('#ig-aok').addEventListener('click', () => hidePopover());
        pop.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hidePopover(); } });
        /* à la fermeture (bouton, clic ailleurs, Échap) : une seule entrée d'historique si quelque chose a changé */
        pop._onHide = () => {
          const bb = getBlock(id); if (!bb || bb.type !== 'img') return;
          const cur = fxOf(bb);
          if (cur.br === v.br && cur.ct === v.ct && cur.sat === v.sat) return;
          setFx(bb, v); touch(); renderBlocks('__none'); selectObj(id);
        };
        setTimeout(() => { const i = pop.querySelector('input'); if (i) i.focus(); }, 40);
      });
  }
  function openAlt(id, rect) {
    const b = getBlock(id); if (!b || b.type !== 'img') return;
    showPopover(`<h4>Texte alternatif</h4>
      <div class="po-row"><input id="ig-alt" maxlength="250" value="${esc(typeof b.alt === 'string' ? b.alt : '')}" placeholder="Ce que montre l’image, en une phrase" aria-label="Texte alternatif de l’image" autocomplete="off"></div>
      <div class="po-hint">Lu par les lecteurs d’écran et affiché si l’image ne peut pas se charger. Laissez vide pour une image purement décorative.</div>
      <div class="po-row" style="justify-content:flex-end; margin-top:10px"><button class="pobtn" id="ig-altok" type="button">Enregistrer</button></div>`,
      rect, pop => {
        const inp = pop.querySelector('#ig-alt');
        const ok = () => {
          const val = inp.value.replace(/\s+/g, ' ').trim().slice(0, 250);
          hidePopover();
          const bb = getBlock(id); if (!bb || bb.type !== 'img') return;
          if ((bb.alt || '') === val) return;
          if (val) bb.alt = val; else delete bb.alt;
          touch(); renderBlocks('__none'); selectObj(id); toast(val ? 'Texte alternatif enregistré' : 'Texte alternatif retiré');
        };
        pop.querySelector('#ig-altok').addEventListener('click', ok);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        setTimeout(() => { inp.focus(); inp.select(); }, 40);
      });
  }

  /* ---------------- copier, télécharger, dupliquer, réinitialiser ---------------- */
  async function copyImage(b) {
    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') { toast('Copie d’image indisponible dans ce navigateur — utilisez « Télécharger »'); return; }
    try {
      /* la promesse est passée telle quelle : le geste de l'utilisateur reste valable pendant le rendu (Safari) */
      const blob = renderCanvas(b).then(c => canvasBlob(c, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Image copiée');
    } catch (e) { console.error(e); toast('Copie refusée par le navigateur — utilisez « Télécharger »'); }
  }
  async function downloadImage(b) {
    try {
      const blob = await canvasBlob(await renderCanvas(b), 'image/png');
      const base = (typeof safeFileName === 'function' ? safeFileName : s => s)((typeof b.alt === 'string' && b.alt.trim() ? b.alt : stripTags(b.cap || '')).trim().slice(0, 60) || 'image');
      const name = base + '.png';
      const desk = window.alixoDesktop;
      if (desk && desk.saveFile) {
        const r = await desk.saveFile({ name, data: new Uint8Array(await blob.arrayBuffer()), filters: [{ name: 'Image PNG', extensions: ['png'] }] });
        if (r && r.ok) toast(`Image enregistrée : ${String(r.path || name).split(/[\\/]/).pop()}`); else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Image téléchargée');
    } catch (e) { console.error(e); toast('Téléchargement impossible : ' + (e && e.message || 'image illisible')); }
  }
  function duplicate(id) {
    const d = doc(), i = blockIndex(id); if (!d || i < 0) return;
    const copy = JSON.parse(JSON.stringify(d.blocks[i]));
    copy.id = uid(); delete copy.fl; delete copy.notes;
    d.blocks.splice(i + 1, 0, copy);
    touch(); renderBlocks('__none'); selectObj(copy.id); toast('Image dupliquée');
  }
  async function reset(id) {
    const b = getBlock(id); if (!b || b.type !== 'img') return;
    const o = origOf(b);
    if (o) {
      /* l'original doit être lisible ici. Sa référence (b.o) est retirée de ce qui sort de l'appareil de l'auteur : fichier
         .alx (js/alx.js) et séance partagée (js/share.js). L'image elle-même peut toutefois se trouver dans le partage si
         elle y avait été publiée AVANT la retouche (shares/{sid}/imgs n'est pas purgé) : dans ce cas elle y reste. */
      let src = null; try { src = await AlixoImages.get(o.iid); } catch { src = null; }
      const bb = getBlock(id); if (!bb || bb.type !== 'img') return;
      if (src) { bb.iid = o.iid; bb.nw = clampInt(o.nw, 1, 100000) || bb.nw; bb.nh = clampInt(o.nh, 1, 100000) || bb.nh; delete bb.o; }
      else toast('L’image d’origine n’est pas disponible sur cet appareil : seuls les réglages sont retirés');
      delete bb.fx; delete bb.crop;
    } else { delete b.fx; delete b.crop; }
    touch(); renderBlocks('__none'); selectObj(id); toast('Image réinitialisée — Ctrl+Z pour annuler');
  }

  /* ---------------- menu du clic droit ---------------- */
  const svg = p => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const ICO = {
    wand: svg('<path d="m4 20 11-11M15 4v3M13.5 5.5h3M19 9v2M18 10h2M9 3v2M8 4h2"/>'),
    sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    gray: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M12 7.5h7.2M12 12h8.5M12 16.5h7.2"/>'),
    rotl: svg('<path d="M4 9a8 8 0 1 1-1 5"/><path d="M4 4v5h5"/>'),
    rotr: svg('<path d="M20 9a8 8 0 1 0 1 5"/><path d="M20 4v5h-5"/>'),
    fliph: svg('<path d="M12 3v18" stroke-dasharray="2 2.5"/><path d="M8 7 3 17h5ZM16 7l5 10h-5Z"/>'),
    flipv: svg('<path d="M3 12h18" stroke-dasharray="2 2.5"/><path d="M7 8 17 3v5ZM7 16l10 5v-5Z"/>'),
    transform: svg('<path d="M4 9a8 8 0 0 1 14-4l2 2"/><path d="M20 3v4h-4"/><path d="M20 15a8 8 0 0 1-14 4l-2-2"/><path d="M4 21v-4h4"/>'),
    style: svg('<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M8 20h9a3 3 0 0 0 3-3V8" opacity=".45"/>'),
    shadow: svg('<rect x="3" y="3" width="13" height="13" rx="2.5"/><path d="M8 20h10a2 2 0 0 0 2-2V8"/>'),
    alt: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15l2.2-6 2.2 6M7.8 13h2.8M14 9v6M17 9v6M14 12h3"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    dl: svg('<path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/>'),
    dup: svg('<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5" stroke-dasharray="2 2"/>'),
    replace: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>'),
    reset: svg('<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>'),
    file: svg('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/>'),
    palette: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="15.5" cy="10" r="1"/>'),
    chev: '<svg class="cm-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>'
  };
  const RADS = [[0, 'Aucun'], [5, 'Légers'], [14, 'Marqués'], [50, 'Ovale']];
  const BORDERS = [[0, 'Aucune'], [1, 'Fine'], [3, 'Moyenne'], [6, 'Épaisse']];
  const check = on => (on ? '<span class="cm-check" aria-hidden="true">✓</span>' : '');
  const toggle = (cm, ico, label, on) => `<button data-cm="${cm}" role="menuitemcheckbox" aria-checked="${on ? 'true' : 'false'}" class="${on ? 'on' : ''}">${ico}${label}${check(on)}</button>`;
  const group = (key, ico, label, inner, open) => `<button class="cm-group ${open ? 'open' : ''}" data-cmx="${key}" aria-expanded="${open ? 'true' : 'false'}">${ico}${label}${ICO.chev}</button><div class="cm-sub"${open ? '' : ' hidden'}>${inner}</div>`;

  /* o.readOnly : séance partagée en lecture seule → seulement Copier et Télécharger */
  function menuHTML(b, o = {}) {
    const f = fxOf(b), pct = Math.round(+b.w || 60);
    const share = `<button data-cm="ixcopy">${ICO.copy}Copier l’image</button><button data-cm="ixdl">${ICO.dl}Télécharger (.png)</button>`;
    if (o.readOnly) return `<div class="cm-title">Image</div>${share}`;
    const al = ['left', 'right', 'center'].includes(b.align) ? b.align : 'center';
    const hasCap = b.cap !== undefined && b.cap !== null;
    const canReset = hasFx(b) || !!b.crop || !!origOf(b);
    const radNear = RADS.reduce((best, r) => (Math.abs(r[0] - f.rad) < Math.abs(best - f.rad) ? r[0] : best), 0);
    const bw = f.bd ? f.bd.w : 0;
    const bdNear = BORDERS.reduce((best, r) => (Math.abs(r[0] - bw) < Math.abs(best - bw) ? r[0] : best), 0);
    /* o.open : groupes à dessiner dépliés (le menu se redessine sur place après un choix de style) */
    const openSet = new Set(Array.isArray(o.open) ? o.open : []);
    const isOpen = key => openSet.has(key);
    /* choix exclusif (taille, alignement, coins, bordure) : l'état est dit aux lecteurs d'écran, pas seulement coloré */
    const radio = on => `role="menuitemradio" aria-checked="${on ? 'true' : 'false'}" class="${on ? 'on' : ''}"`;
    const alBtn = (k, lab) => `<button data-cm="ial" data-al="${k}" ${radio(al === k)} title="${lab}" aria-label="${lab}">${AL_ICO[k]}</button>`;
    return `
    <div class="cm-title">Image — ${pct} % de la largeur</div>
    <div class="cm-aligns cm-sizes" role="group" aria-label="Largeur">${[25, 50, 75, 100].map(p => `<button data-cm="isz" data-pct="${p}" ${radio(pct === p)} title="Largeur ${p} %">${p} %</button>`).join('')}<button data-cm="isize" title="Taille personnalisée…" aria-label="Taille personnalisée">Autre…</button></div>
    <div class="cm-aligns" role="group" aria-label="Alignement">${alBtn('left', 'À gauche, texte autour')}${alBtn('center', 'Centrée')}${alBtn('right', 'À droite, texte autour')}</div>
    <button data-cm="icrop"><svg viewBox="0 0 24 24"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>Recadrer</button>
    ${b.crop ? `<button data-cm="iuncrop">${CM_ICO.dup}Image entière (annuler le recadrage)</button>` : ''}
    <button data-cm="icap">${CM_ICO.pen}${hasCap ? 'Retirer la légende' : 'Ajouter une légende'}</button>
    <button data-cm="ixalt">${ICO.alt}Texte alternatif…${check(!!b.alt)}</button>
    <div class="cm-sep"></div>
    ${group('iret', ICO.wand, 'Retouches', `
      ${typeof isPlus === 'function' && !isPlus() ? `<button data-cm="ixbg" aria-label="Supprimer le fond (réservé à Alixo+)">${ICO.wand}Supprimer le fond…<span class="plus-badge" aria-hidden="true">Alixo+</span></button>` : `<button data-cm="ixbg">${ICO.wand}Supprimer le fond…</button>`}
      <button data-cm="ixadj">${ICO.sliders}Luminosité, contraste, saturation…${check(!!(f.br || f.ct || f.sat))}</button>
      ${toggle('ixgray', ICO.gray, 'Noir et blanc', f.gray)}`, isOpen('iret'))}
    ${group('itr', ICO.transform, 'Pivoter, retourner', `
      <button data-cm="ixrotl">${ICO.rotl}Pivoter à gauche</button>
      <button data-cm="ixrotr">${ICO.rotr}Pivoter à droite</button>
      <button data-cm="ixfliph">${ICO.fliph}Miroir horizontal</button>
      <button data-cm="ixflipv">${ICO.flipv}Miroir vertical</button>`, isOpen('itr'))}
    ${group('ist', ICO.style, 'Coins, bordure, ombre', `
      <div class="cm-lab" aria-hidden="true">Coins</div>
      <div class="cm-chips" role="group" aria-label="Coins">${RADS.map(([r, lab]) => `<button data-cm="ixrad" data-rad="${r}" ${radio(radNear === r)}>${lab}</button>`).join('')}</div>
      <div class="cm-lab" aria-hidden="true">Bordure</div>
      <div class="cm-chips" role="group" aria-label="Bordure">${BORDERS.map(([w, lab]) => `<button data-cm="ixbd" data-bw="${w}" ${radio(bdNear === w)}>${lab}</button>`).join('')}</div>
      ${f.bd ? `<button data-cm="ixbdc">${ICO.palette}Couleur de la bordure…</button>` : ''}
      ${toggle('ixsh', ICO.shadow, 'Ombre', f.sh)}`, isOpen('ist'))}
    ${group('ifile', ICO.file, 'Copier, télécharger, remplacer', `${share}
      <button data-cm="ixdup">${ICO.dup}Dupliquer</button>
      <button data-cm="ireplace">${ICO.replace}Remplacer l’image…</button>`, isOpen('ifile'))}
    <div class="cm-sep"></div>
    ${canReset ? `<button data-cm="ixreset">${ICO.reset}Réinitialiser l’image</button>` : ''}
    <button data-cm="idel" class="danger">${CM_ICO.trash}Supprimer l’image</button>`;
  }

  /* exécute une commande du menu ; renvoie true si elle a été prise en charge (sinon app.js traite les commandes d'origine) */
  function run(cm, id, b, e, btn) {
    const ro = typeof readOnly !== 'undefined' && readOnly;
    if (cm === 'ixcopy') { copyImage(b); return true; }
    if (cm === 'ixdl') { downloadImage(b); return true; }
    if (ro) return true;   // lecture seule : aucune autre commande, même celles d'origine
    if (!cm.startsWith('ix')) return false;
    const rect = e && Number.isFinite(e.clientX) ? { left: e.clientX, top: e.clientY, bottom: e.clientY } : centerRect();
    const apply = (patch, msg) => { setFx(b, patch); touch(); renderBlocks('__none'); selectObj(id); if (msg) toast(msg); };
    if (cm === 'ixbg') { openRemoveBg(id); return true; }   // 1.52 : Alixo+ — le garde-fou est dans openRemoveBg (seul point d'entrée)
    if (cm === 'ixadj') { openAdjust(id, rect); return true; }
    if (cm === 'ixgray') { apply({ gray: !fxOf(b).gray }); return true; }
    if (cm === 'ixrotl' || cm === 'ixrotr' || cm === 'ixfliph' || cm === 'ixflipv') { transform(id, cm.slice(2)); return true; }
    if (cm === 'ixrad') { apply({ rad: clampInt(btn && btn.dataset.rad, 0, 50) }); return true; }
    if (cm === 'ixbd') { const w = clampInt(btn && btn.dataset.bw, 0, 12), cur = fxOf(b).bd; apply({ bd: w ? { w, c: cur ? cur.c : '' } : null }); return true; }
    if (cm === 'ixbdc') {
      const cur = fxOf(b).bd;
      openPalettePopover(rect, { title: 'Couleur de la bordure', none: 'Automatique', current: cur ? cur.c : '', keepSelection: false, onPick: c => {
        const bb = getBlock(id); if (!bb || bb.type !== 'img') return;
        const now = fxOf(bb).bd || { w: 1 };
        setFx(bb, { bd: { w: now.w, c: c === 'none' ? '' : hexColor(c) } }); touch(); renderBlocks('__none'); selectObj(id);
      } });
      return true;
    }
    if (cm === 'ixsh') { apply({ sh: !fxOf(b).sh }); return true; }
    if (cm === 'ixalt') { openAlt(id, rect); return true; }
    if (cm === 'ixdup') { duplicate(id); return true; }
    if (cm === 'ixreset') { reset(id); return true; }
    return true;
  }

  return { menuHTML, run, publicJSON, styleVars, classes, bake, removeBg, fxOf, setFx, filterCss, hexColor, renderCanvas, encodeCanvas, openRemoveBg, transform, reset };
})();
