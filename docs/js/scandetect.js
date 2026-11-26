/* ============================================================
   Alixo — détection et redressement d'une feuille photographiée (page du téléphone, mode scan)
   1.59.0 : détection « scanner » à plusieurs hypothèses et score (module pur window.AlixoScanDetect, sans dépendance,
   tout se calcule sur le téléphone, aucun envoi). Analyse sur une copie réduite (côté long 640 px) :
     1. prétraitement : luminance Y et saturation S ; normalisation d'éclairage Yn = Y ÷ (grand flou de Y) (retinex
        simplifié : ombres, vignettage et dégradés neutralisés) ; flou gaussien léger ;
     2. contours : gradient de Sobel sur Yn, sur Y brute (bord papier / table blanche très faible) et sur S (bord papier /
        table colorée), fusion (le plus fort en chaque pixel), suppression des non-maxima puis hystérésis (Canny) avec des
        seuils déduits du bruit de fond (médiane de la magnitude) ;
     3. segments de droite (détecteur type LSD simplifié) : croissance de régions de pixels de contour d'orientation
        voisine (± 22,5°), ajustement par ACP, puis fusion des segments colinéaires de même polarité en droites (longueur
        couverte) ; classement des droites par couverture × uniformité de la bande la plus calme à ± 4 px (un bord de
        feuille longe du papier uni ; une ligne de texte ou de vichy varie sans cesse), plafond de 10 droites par tranche
        de 15° (les rayures ne prennent pas toute la place), 40 droites gardées ;
     4. candidats : quadrilatères formés de deux paires de droites (côtés opposés à moins de 45° l'un de l'autre, écartés
        d'au moins 20 % de l'image), les quatre bords de l'image servant de droites de secours (feuille partiellement hors
        cadre → partial:true), plus les quadrilatères de l'ancienne méthode (carte « papier » → Otsu → composante connexe
        → enveloppe convexe → quadrilatère d'aire maximale) ; préclassement par couverture et dépassement (une droite qui
        continue bien au-delà des coins est un joint ou un motif, pas un bord de feuille) ;
     5. score 0-1 de chaque candidat : force du gradient le long des côtés (± 2 px), part des côtés couverte par des
        contours détectés (et aux deux extrémités de chaque côté : un doigt ne cache qu'un coin), contraste intérieur /
        extérieur (luminance et saturation, médianes robustes, même signe sur les quatre côtés : feuille claire ou feuille
        sombre), netteté du bord par rapport à la texture voisine (texte, bois), homogénéité (bande intérieure ≈ centre de
        la feuille), intérieur fait de papier et d'encre seulement (un vichy ou du bois entre deux feuilles sont pénalisés),
        prolongement des côtés au-delà des coins, convexité, aire (≥ 15 %), angles, rapport des côtés (bonus A4 / Letter /
        carré), position centrale ; côtés posés sur le bord de l'image pénalisés et vérifiés (la bande contre le bord doit
        ressembler au centre de la feuille, pas à l'extérieur) ;
     6. affinage sous-pixel des côtés retenus : profils perpendiculaires, maximum du gradient (parabole sur 3 points),
        droite robuste (consensus de paires puis moindres carrés totaux), d'abord sur la copie 640, puis sur la luminance
        d'une copie ≤ 1024 px ; intersections → coins ;
     7. décision : conf = score du meilleur ; sous le seuil → ok:false avec reason ('dark', 'contrast', 'nofound',
        'lowconf') et un cadre de repli (meilleur candidat) pour l'écran de vérification.
   Redressement : homographie de Heckbert (carré unité → quadrilatère), échantillonnage inverse bilinéaire (option
   bicubic: true → Catmull-Rom borné, sans rebond).
   API : detect(source, opts) → { ok, reason, quad (coins normalisés 0-1, HG HD BD BG), full, partial, conf, score, ms },
   validate, outputSize, warp, order ; _ = fonctions internes (tests).
   ============================================================ */
'use strict';

(() => {
  const SQRT2 = Math.SQRT2;
  const FULL = () => [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const cross3 = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const polyArea = P => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };
  const freeCanvas = c => { if (c) { c.width = 0; c.height = 0; } };
  const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const median = arr => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[a.length >> 1]; };

  /* dimensions d'une source dessinable (image, ImageBitmap, canevas, vidéo) */
  function dimsOf(s) {
    if (!s) return { w: 0, h: 0 };
    return { w: s.naturalWidth || s.videoWidth || s.width || 0, h: s.naturalHeight || s.videoHeight || s.height || 0 };
  }

  /* ---------------- étape 1 : canaux, flous, normalisation d'éclairage ---------------- */
  /* luminance (0-255) et saturation (max − min, 0-255) d'une image RGBA */
  function channels(px, n) {
    const Y = new Float32Array(n), S = new Float32Array(n);
    let sum = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = px[j], g = px[j + 1], b = px[j + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const y = (299 * r + 587 * g + 114 * b) / 1000;
      Y[i] = y; S[i] = mx - mn; sum += y;
    }
    return { Y, S, meanY: sum / n };
  }
  /* carte « papier » de l'ancienne méthode : clair et peu coloré → élevé */
  function paperMap(px, n) {
    const f = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = px[j], g = px[j + 1], b = px[j + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const v = (299 * r + 587 * g + 114 * b) / 1000 - 0.5 * (mx - mn);
      f[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    return f;
  }
  /* flou-boîte séparable (somme glissante, bords répétés) */
  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), k = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w; let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[row + clamp(i, 0, w - 1)];
      for (let x = 0; x < w; x++) { tmp[row + x] = acc / k; acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += tmp[clamp(i, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) { out[y * w + x] = acc / k; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
    }
    return out;
  }
  /* flou gaussien léger séparable (noyau 1 4 6 4 1 / 16, σ ≈ 1) */
  function gauss5(src, w, h) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = x > 1 ? x - 2 : 0, x1 = x > 0 ? x - 1 : 0, x3 = x < w - 1 ? x + 1 : w - 1, x4 = x < w - 2 ? x + 2 : w - 1;
        tmp[row + x] = (src[row + x0] + 4 * src[row + x1] + 6 * src[row + x] + 4 * src[row + x3] + src[row + x4]) / 16;
      }
    }
    for (let y = 0; y < h; y++) {
      const y0 = (y > 1 ? y - 2 : 0) * w, y1 = (y > 0 ? y - 1 : 0) * w, y2 = y * w, y3 = (y < h - 1 ? y + 1 : h - 1) * w, y4 = (y < h - 2 ? y + 2 : h - 1) * w;
      for (let x = 0; x < w; x++) out[y2 + x] = (tmp[y0 + x] + 4 * tmp[y1 + x] + 6 * tmp[y2 + x] + 4 * tmp[y3 + x] + tmp[y4 + x]) / 16;
    }
    return out;
  }
  /* normalisation d'éclairage : Y ÷ (grand flou de Y) ramené autour de 128 (retinex simplifié) */
  function normaliseLight(Y, w, h) {
    const r = Math.max(8, Math.round(0.06 * Math.max(w, h)));
    const B = boxBlur(boxBlur(Y, w, h, r), w, h, r), n = w * h, out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = Y[i] / (B[i] + 6) * 128; out[i] = v > 255 ? 255 : v; }
    return out;
  }

  /* ---------------- étape 2 : gradient, fusion, Canny ---------------- */
  /* Sobel ÷ 4 : écart de niveau sur deux pixels (une marche franche de 60 donne environ 60) */
  function sobel(f, w, h) {
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const a = f[i - w - 1], b = f[i - w], c = f[i - w + 1], d = f[i - 1], e = f[i + 1], g = f[i + w - 1], hh = f[i + w], k = f[i + w + 1];
        gx[i] = ((c + 2 * e + k) - (a + 2 * d + g)) / 4;
        gy[i] = ((g + 2 * hh + k) - (a + 2 * b + c)) / 4;
      }
    }
    return { gx, gy, w, h };
  }
  /* fusion de champs de gradient : en chaque pixel, le plus fort (chaque champ pondéré par son coefficient) ; mag calculée */
  function fuseGradient(fields) {
    const G1 = fields[0].G, n = G1.w * G1.h, gx = new Float32Array(n), gy = new Float32Array(n), mag = new Float32Array(n);
    for (const { G, k } of fields) {
      for (let i = 0; i < n; i++) {
        const bx = G.gx[i] * k, by = G.gy[i] * k, mb = bx * bx + by * by, ma = mag[i];
        if (mb > ma * ma) { gx[i] = bx; gy[i] = by; mag[i] = Math.sqrt(mb); }
      }
    }
    return { gx, gy, mag, w: G1.w, h: G1.h };
  }
  /* seuils de Canny d'après le bruit de l'image : médiane de la magnitude (fond) et percentile élevé */
  function cannyThresholds(mag) {
    const hist = new Int32Array(512);
    for (let i = 0; i < mag.length; i++) { const v = mag[i] * 4 | 0; hist[v > 511 ? 511 : v]++; }
    const pick = q => { let acc = 0; const t = q * mag.length; for (let b = 0; b < 512; b++) { acc += hist[b]; if (acc >= t) return b / 4; } return 128; };
    const med = pick(0.5);   // le fond (majoritaire) donne le niveau de bruit
    const high = clamp(3 * med + 1.5, 2.5, 30);
    return { high, low: Math.max(1.3, 0.4 * high), med };
  }
  /* suppression des non-maxima puis hystérésis ; E[i] = 1 pour un pixel de contour */
  function canny(G) {
    const { gx, gy, mag, w, h } = G, n = w * h, { high, low } = cannyThresholds(mag);
    const nms = new Uint8Array(n);   // 0 : rien, 1 : faible, 2 : fort
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, m = mag[i];
        if (m < low) continue;
        const ax = Math.abs(gx[i]), ay = Math.abs(gy[i]);
        let m1, m2;
        if (ax >= 2.414 * ay) { m1 = mag[i - 1]; m2 = mag[i + 1]; }
        else if (ay >= 2.414 * ax) { m1 = mag[i - w]; m2 = mag[i + w]; }
        else if ((gx[i] > 0) === (gy[i] > 0)) { m1 = mag[i - w - 1]; m2 = mag[i + w + 1]; }
        else { m1 = mag[i - w + 1]; m2 = mag[i + w - 1]; }
        if (m >= m1 && m >= m2) nms[i] = m >= high ? 2 : 1;
      }
    }
    const E = new Uint8Array(n), stack = new Int32Array(n);
    let sp = 0;
    for (let i = 0; i < n; i++) {
      if (nms[i] !== 2 || E[i]) continue;
      E[i] = 1; stack[sp++] = i;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          if (y + dy < 0 || y + dy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (x + dx < 0 || x + dx >= w) continue;
            const q = p + dy * w + dx;
            if (nms[q] && !E[q]) { E[q] = 1; stack[sp++] = q; }
          }
        }
      }
    }
    return { E, high, low };
  }

  /* ---------------- étape 3 : segments et droites ---------------- */
  /* croissance de régions de pixels de contour d'orientation voisine (± 22,5°), ajustement par ACP pondérée.
     segment : { x0, y0, x1, y1, len, d (direction unitaire), g (gradient moyen unitaire = normale « claire »), str } ;
     d est orienté de sorte que (−d.y, d.x) = g : en parcourant le segment, le côté clair est à gauche (sens horaire à l'écran) */
  function findSegments(E, G, minLen) {
    const { gx, gy, mag, w, h } = G, n = w * h;
    let cnt = 0;
    for (let i = 0; i < n; i++) if (E[i]) cnt++;
    if (!cnt) return [];
    /* tri des pixels de contour par magnitude décroissante (comptage sur 128 classes) */
    const buckets = new Int32Array(129);
    const bin = i => { const b = mag[i] | 0; return b > 127 ? 127 : b; };
    for (let i = 0; i < n; i++) if (E[i]) buckets[bin(i) + 1]++;
    for (let b = 127; b >= 1; b--) buckets[b] += buckets[b + 1];   // positions : classes fortes en premier
    const start = new Int32Array(129);
    for (let b = 0; b < 128; b++) start[b] = buckets[b + 1];
    const idx = new Int32Array(cnt);
    for (let i = 0; i < n; i++) if (E[i]) idx[start[bin(i)]++] = i;
    const used = new Uint8Array(n), stack = new Int32Array(cnt), reg = new Int32Array(cnt);
    const cosTol = Math.cos(22.5 * Math.PI / 180);
    const segs = [];
    for (let s = 0; s < cnt; s++) {
      const seed = idx[s];
      if (used[seed]) continue;
      let sx = gx[seed] / mag[seed], sy = gy[seed] / mag[seed], sp = 0, rc = 0;
      stack[sp++] = seed; used[seed] = 1;
      while (sp) {
        const p = stack[--sp]; reg[rc++] = p;
        const x = p % w, y = (p - x) / w, inv = 1 / Math.hypot(sx, sy), mx = sx * inv, my = sy * inv;
        for (let dy = -1; dy <= 1; dy++) {
          if (y + dy < 0 || y + dy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (x + dx < 0 || x + dx >= w) continue;
            const q = p + dy * w + dx;
            if (!E[q] || used[q]) continue;
            const m = mag[q];
            if (gx[q] * mx + gy[q] * my < cosTol * m) continue;
            used[q] = 1; stack[sp++] = q; sx += gx[q] / m; sy += gy[q] / m;
          }
        }
      }
      if (rc < 6) continue;
      /* ACP pondérée par la magnitude */
      let sw = 0, cx = 0, cy = 0;
      for (let k = 0; k < rc; k++) { const p = reg[k], x = p % w, y = (p - x) / w, m = mag[p]; sw += m; cx += m * x; cy += m * y; }
      cx /= sw; cy /= sw;
      let sxx = 0, syy = 0, sxy = 0;
      for (let k = 0; k < rc; k++) { const p = reg[k], x = p % w - cx, y = (p - (p % w)) / w - cy, m = mag[p]; sxx += m * x * x; syy += m * y * y; sxy += m * x * y; }
      sxx /= sw; syy /= sw; sxy /= sw;
      const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const lmin = tr / 2 - disc;
      if (lmin > 0.8) continue;   // région trop large : courbe ou amas, pas un segment
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      let dx = Math.cos(ang), dy = Math.sin(ang);
      const gl = Math.hypot(sx, sy), gxu = sx / gl, gyu = sy / gl;
      if (dx * gyu - dy * gxu < 0) { dx = -dx; dy = -dy; }   // (−d.y, d.x) = g
      let t0 = Infinity, t1 = -Infinity;
      for (let k = 0; k < rc; k++) { const p = reg[k], x = p % w, y = (p - x) / w, t = (x - cx) * dx + (y - cy) * dy; if (t < t0) t0 = t; if (t > t1) t1 = t; }
      const len = t1 - t0 + 1;
      if (len < minLen || rc < 0.6 * len) continue;
      segs.push({ x0: cx + t0 * dx, y0: cy + t0 * dy, x1: cx + t1 * dx, y1: cy + t1 * dy, len, d: { x: dx, y: dy }, g: { x: gxu, y: gyu }, str: sw / rc });
    }
    return segs;
  }
  /* droite par moindres carrés totaux pondérés : point moyen c, direction d */
  function fitTLSW(pts, ws) {
    let sw = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) { const wi = ws ? ws[i] : 1; sw += wi; cx += wi * pts[i].x; cy += wi * pts[i].y; }
    cx /= sw; cy /= sw;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < pts.length; i++) { const wi = ws ? ws[i] : 1, dx = pts[i].x - cx, dy = pts[i].y - cy; sxx += wi * dx * dx; syy += wi * dy * dy; sxy += wi * dx * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { c: { x: cx, y: cy }, d: { x: Math.cos(ang), y: Math.sin(ang) } };
  }
  const fitTLS = pts => fitTLSW(pts, null);
  const lineDist = (L, p) => Math.abs((p.x - L.c.x) * L.d.y - (p.y - L.c.y) * L.d.x);
  /* fusion des segments colinéaires (± 3°, ± tol px, même polarité) en droites ; cov = longueur couverte */
  function mergeLines(segs, w, h) {
    const D = Math.max(w, h), tol = Math.max(2, 0.004 * D), sinTol = Math.sin(3 * Math.PI / 180);
    const S = segs.slice().sort((a, b) => b.len - a.len), lines = [];
    for (const s of S) {
      const p0 = { x: s.x0, y: s.y0 }, p1 = { x: s.x1, y: s.y1 };
      let L = null;
      for (const l of lines) {
        if (l.d.x * s.d.x + l.d.y * s.d.y < 0) continue;   // polarité opposée (d orienté par le gradient)
        if (Math.abs(l.d.x * s.d.y - l.d.y * s.d.x) > sinTol) continue;
        if (lineDist(l, p0) > tol || lineDist(l, p1) > tol) continue;
        L = l; break;
      }
      if (L) {
        L.pts.push(p0, p1); L.ws.push(s.len, s.len); L.cov += s.len; L.str = (L.str * L.nseg + s.str) / (L.nseg + 1); L.nseg++;
        const f = fitTLSW(L.pts, L.ws);
        if (f.d.x * L.d.x + f.d.y * L.d.y < 0) { f.d.x = -f.d.x; f.d.y = -f.d.y; }
        L.c = f.c; L.d = f.d;
      } else lines.push({ c: { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 }, d: { x: s.d.x, y: s.d.y }, g: s.g, pts: [p0, p1], ws: [s.len, s.len], cov: s.len, str: s.str, nseg: 1, border: false });
    }
    for (const L of lines) {   // étendue le long de la droite
      let t0 = Infinity, t1 = -Infinity;
      for (const p of L.pts) { const t = (p.x - L.c.x) * L.d.x + (p.y - L.c.y) * L.d.y; if (t < t0) t0 = t; if (t > t1) t1 = t; }
      L.t0 = t0; L.t1 = t1; L.g = { x: -L.d.y, y: L.d.x };
    }
    return lines.sort((a, b) => b.cov - a.cov);
  }
  /* classement des droites : couverture × uniformité des deux bandes voisines (à ± 4 px). Le long d'un bord de feuille,
     chaque côté est à peu près uniforme ; le long d'une ligne de texte ou d'un motif (vichy), la bande varie sans cesse.
     Renvoie les maxLines meilleures au rang, plus les 10 plus couvrantes (jamais perdues) */
  function rankLines(lines, Y, w, h, maxLines) {
    const NU = 16, off = 4;
    for (const L of lines) {
      let sa = 0, sb = 0, na = 0;
      const va = [], vb = [];
      for (let k = 0; k < NU; k++) {
        const t = L.t0 + (L.t1 - L.t0) * (0.05 + 0.9 * k / (NU - 1)), x = L.c.x + t * L.d.x, y = L.c.y + t * L.d.y;
        const xa = x + off * L.g.x, ya = y + off * L.g.y, xb = x - off * L.g.x, yb = y - off * L.g.y;
        if (xa < 1 || ya < 1 || xa > w - 2 || ya > h - 2 || xb < 1 || yb < 1 || xb > w - 2 || yb > h - 2) continue;
        va.push(sampleBil(Y, w, h, xa, ya)); vb.push(sampleBil(Y, w, h, xb, yb)); na++;
      }
      let u = 0.5;
      if (na >= 6) {   // au moins une des deux bandes doit être uniforme (le papier, même si la table est à motifs)
        const ma = median(va), mb = median(vb);
        for (let k = 0; k < na; k++) { sa += Math.abs(va[k] - ma); sb += Math.abs(vb[k] - mb); }
        u = clamp(1 - (2 * Math.min(sa, sb) / na - 6) / 40, 0, 1);
      }
      L.u = u; L.rank = L.cov * (0.15 + u);
    }
    /* plafond par orientation (tranches de 15°) : un motif de rayures ne doit pas occuper tout le lot */
    const sorted = lines.slice().sort((a, b) => b.rank - a.rank), perBin = new Int32Array(12), byRank = [];
    for (const L of sorted) {
      const bin = Math.floor(((Math.atan2(L.d.y, L.d.x) * 180 / Math.PI + 180 + 7.5) % 180) / 15) % 12;
      if (perBin[bin] >= 10) continue;
      perBin[bin]++; byRank.push(L);
      if (byRank.length >= maxLines) break;
    }
    for (const L of lines.slice(0, 6)) if (!byRank.includes(L)) byRank.push(L);
    return byRank;
  }
  /* les quatre bords de l'image comme droites de secours (sens horaire : côté intérieur à gauche de d) */
  function borderLines(w, h) {
    return [
      { c: { x: w / 2, y: 0 }, d: { x: 1, y: 0 }, cov: 0, str: 0, border: true },
      { c: { x: w, y: h / 2 }, d: { x: 0, y: 1 }, cov: 0, str: 0, border: true },
      { c: { x: w / 2, y: h }, d: { x: -1, y: 0 }, cov: 0, str: 0, border: true },
      { c: { x: 0, y: h / 2 }, d: { x: 0, y: -1 }, cov: 0, str: 0, border: true }
    ];
  }
  function intersect(L1, L2) {
    const den = L1.d.x * L2.d.y - L1.d.y * L2.d.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((L2.c.x - L1.c.x) * L2.d.y - (L2.c.y - L1.c.y) * L2.d.x) / den;
    return { p: { x: L1.c.x + t * L1.d.x, y: L1.c.y + t * L1.d.y }, sin: Math.abs(den) };
  }

  /* ---------------- ancienne méthode (candidats de secours) : Otsu, morphologie, composantes, enveloppe ---------------- */
  function otsu(f) {
    const hist = new Float64Array(256);
    for (let i = 0; i < f.length; i++) hist[f[i] + 0.5 | 0]++;
    let total = f.length, sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let wB = 0, sumB = 0, best = -1, t0 = 0, m0 = 0, m1 = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; t0 = t; m0 = mB; m1 = mF; }
    }
    return { t: t0 + 0.5, m0, m1 };
  }
  function morph(src, w, h, r, isMin) {
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let v = isMin ? 1 : 0;
        for (let i = Math.max(0, x - r), e = Math.min(w - 1, x + r); i <= e; i++) { const s = src[row + i]; if (isMin ? !s : s) { v = s; break; } }
        tmp[row + x] = v;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let v = isMin ? 1 : 0;
        for (let i = Math.max(0, y - r), e = Math.min(h - 1, y + r); i <= e; i++) { const s = tmp[i * w + x]; if (isMin ? !s : s) { v = s; break; } }
        out[y * w + x] = v;
      }
    }
    return out;
  }
  const opening = (m, w, h, r) => morph(morph(m, w, h, r, true), w, h, r, false);
  function bestComponent(mask, w, h) {
    const n = w * h, lab = new Int32Array(n), stack = new Int32Array(n);
    const centre = (h >> 1) * w + (w >> 1);
    let next = 0, best = null;
    for (let s = 0; s < n; s++) {
      if (!mask[s] || lab[s]) continue;
      next++;
      let sp = 0, area = 0, l = false, r = false, t = false, b = false, hasC = false;
      stack[sp++] = s; lab[s] = next;
      while (sp) {
        const p = stack[--sp]; area++;
        const x = p % w, y = (p - x) / w;
        if (p === centre) hasC = true;
        if (x === 0) l = true; if (x === w - 1) r = true; if (y === 0) t = true; if (y === h - 1) b = true;
        if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = next; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = next; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - w] && !lab[p - w]) { lab[p - w] = next; stack[sp++] = p - w; }
        if (y < h - 1 && mask[p + w] && !lab[p + w]) { lab[p + w] = next; stack[sp++] = p + w; }
      }
      const edges = l + r + t + b;
      const score = area * (hasC ? 1 : 0.6) * (edges >= 3 ? 0.5 : 1);
      if (!best || score > best.score) best = { label: next, area, score, edges };
    }
    return best ? Object.assign(best, { lab }) : null;
  }
  function contourPoints(lab, label, w, h) {
    const pts = [];
    for (let y = 0; y < h; y++) {
      let a = -1, b = -1;
      for (let x = 0; x < w; x++) if (lab[y * w + x] === label) { if (a < 0) a = x; b = x; }
      if (a >= 0) { pts.push({ x: a, y: y + 0.5 }, { x: b + 1, y: y + 0.5 }); }
    }
    for (let x = 0; x < w; x++) {
      let a = -1, b = -1;
      for (let y = 0; y < h; y++) if (lab[y * w + x] === label) { if (a < 0) a = y; b = y; }
      if (a >= 0) { pts.push({ x: x + 0.5, y: a }, { x: x + 0.5, y: b + 1 }); }
    }
    return pts;
  }
  /* chaîne monotone d'Andrew ; résultat dans le sens des aiguilles d'une montre à l'écran (y vers le bas) */
  function convexHull(points) {
    const P = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (P.length < 3) return P;
    const lower = [], upper = [];
    for (const p of P) { while (lower.length >= 2 && cross3(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (upper.length >= 2 && cross3(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    upper.pop(); lower.pop();
    const hull = lower.concat(upper);
    return polyArea(hull) < 0 ? hull.reverse() : hull;
  }
  function dpOpen(P, eps) {
    if (P.length < 3) return P.slice();
    const a = P[0], b = P[P.length - 1], L = dist(a, b) || 1;
    let md = -1, mi = 0;
    for (let i = 1; i < P.length - 1; i++) { const d = Math.abs(cross3(a, b, P[i])) / L; if (d > md) { md = d; mi = i; } }
    if (md <= eps) return [a, b];
    const l = dpOpen(P.slice(0, mi + 1), eps), r = dpOpen(P.slice(mi), eps);
    return l.slice(0, -1).concat(r);
  }
  function simplifyClosed(P, eps, maxN = 64) {
    if (P.length <= 4) return P.slice();
    let far = 0, fd = -1;
    for (let i = 1; i < P.length; i++) { const d = dist(P[0], P[i]); if (d > fd) { fd = d; far = i; } }
    let e = eps, out = P;
    for (let k = 0; k < 12; k++) {
      const a = dpOpen(P.slice(0, far + 1), e), b = dpOpen(P.slice(far).concat([P[0]]), e);
      out = a.slice(0, -1).concat(b.slice(0, -1));
      if (out.length <= maxN) break;
      e *= 1.5;
    }
    return out;
  }
  /* quadrilatère d'aire maximale dont les sommets sont des sommets du polygone convexe (O(n³)) */
  function maxQuad(P) {
    const n = P.length;
    if (n < 4) return null;
    if (n === 4) return P.slice();
    const tri = (a, b, c) => Math.abs(cross3(P[a], P[b], P[c]));
    let best = -1, q = null;
    for (let i = 0; i < n; i++) {
      for (let k = i + 2; k < n; k++) {
        if (i === 0 && k === n - 1) continue;
        let bj = -1, aj = -1, bl = -1, al = -1;
        for (let j = i + 1; j < k; j++) { const a = tri(i, j, k); if (a > aj) { aj = a; bj = j; } }
        for (let l = k + 1; l < n + i; l++) { const lm = l % n; const a = tri(k, lm, i); if (a > al) { al = a; bl = lm; } }
        if (bj < 0 || bl < 0) continue;
        if (aj + al > best) { best = aj + al; q = [P[i], P[bj], P[k], P[bl]]; }
      }
    }
    return q;
  }
  /* candidats de l'ancienne méthode : { quads, fullCover (part de l'image « papier »), contrast } */
  function legacyCandidates(px, w, h) {
    const n = w * h, f = paperMap(px, n), fb = boxBlur(boxBlur(f, w, h, 2), w, h, 2);
    const { t, m0, m1 } = otsu(fb), quads = [];
    let fullCover = 0;
    if (m1 - m0 < 25) return { quads, fullCover, contrast: m1 - m0 };
    const seen = [];
    for (const th of [t, t - 0.3 * (t - m0)]) {
      const mask = new Uint8Array(n);
      let c = 0;
      for (let i = 0; i < n; i++) if (fb[i] > th) { mask[i] = 1; c++; }
      fullCover = Math.max(fullCover, c / n);
      const comp = bestComponent(opening(mask, w, h, 2), w, h);
      if (!comp || comp.area < 0.1 * n) continue;
      const q = maxQuad(simplifyClosed(convexHull(contourPoints(comp.lab, comp.label, w, h)), 1, 64));
      if (!q || comp.area < 0.75 * Math.abs(polyArea(q))) continue;
      const o = order(q), key = o.map(p => Math.round(p.x) + ',' + Math.round(p.y)).join(';');
      if (seen.includes(key)) continue;
      seen.push(key); quads.push(o);
    }
    return { quads, fullCover, contrast: m1 - m0 };
  }

  /* ---------------- étape 4 : candidats ---------------- */
  function sampleBil(arr, w, h, x, y) {
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
    const x0 = Math.min(w - 2, x | 0), y0 = Math.min(h - 2, y | 0), fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return (arr[i] * (1 - fx) + arr[i + 1] * fx) * (1 - fy) + (arr[i + w] * (1 - fx) + arr[i + w + 1] * fx) * fy;
  }
  /* gradient projeté sur la normale n au point (x, y) — positif quand on entre dans la feuille plus claire */
  const gradN = (G, x, y, n) => sampleBil(G.gx, G.w, G.h, x - 0.5, y - 0.5) * n.x + sampleBil(G.gy, G.w, G.h, x - 0.5, y - 0.5) * n.y;
  const sideLen = (L, p, q) => Math.abs((q.x - p.x) * L.d.x + (q.y - p.y) * L.d.y);
  /* quadrilatères formés de deux paires de droites ; les bords de l'image sont des droites de secours (2 au plus) */
  function lineCandidates(lines, w, h) {
    const D = Math.max(w, h), m = Math.min(w, h), pool = lines.concat(borderLines(w, h));
    const N = pool.length, nl = N - 4, cos45 = Math.cos(45 * Math.PI / 180);
    /* paires de côtés opposés : angle < 45°, écartement ≥ 20 % du petit côté */
    const pairs = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = pool[i], b = pool[j];
      if (a.border && b.border && j - i !== 2) continue;   // deux bords de l'image : seulement opposés (haut / bas, gauche / droite)
      if (Math.abs(a.d.x * b.d.x + a.d.y * b.d.y) < cos45) continue;
      const sep = Math.abs((b.c.x - a.c.x) * a.d.y - (b.c.y - a.c.y) * a.d.x);
      if (sep < 0.2 * m) continue;
      pairs.push([i, j]);
    }
    const out = [], minArea = 0.15 * w * h, maxOut = 0.25 * D;
    for (let p = 0; p < pairs.length; p++) {
      const [i1, i2] = pairs[p], A1 = pool[i1], A2 = pool[i2];
      for (let q = p + 1; q < pairs.length; q++) {
        const [j1, j2] = pairs[q];
        if (j1 === i1 || j1 === i2 || j2 === i1 || j2 === i2) continue;
        const B1 = pool[j1], B2 = pool[j2];
        if (Math.abs(A1.d.x * B1.d.x + A1.d.y * B1.d.y) > cos45) continue;   // les deux paires doivent être bien croisées
        const nb = A1.border + A2.border + B1.border + B2.border;
        if (nb > 2) continue;
        const X1 = intersect(A1, B1), X2 = intersect(B1, A2), X3 = intersect(A2, B2), X4 = intersect(B2, A1);
        if (!X1 || !X2 || !X3 || !X4) continue;
        const Q = [X1.p, X2.p, X3.p, X4.p];
        if (Q.some(pt => pt.x < -maxOut || pt.x > w + maxOut || pt.y < -maxOut || pt.y > h + maxOut)) continue;
        const area = polyArea(Q);
        if (Math.abs(area) < minArea) continue;
        const o = order(Q);
        let conv = true;
        for (let k = 0; k < 4 && conv; k++) if (cross3(o[k], o[(k + 1) % 4], o[(k + 2) % 4]) <= 0) conv = false;
        if (!conv) continue;
        /* côtés dans l'ordre de o : on retrouve la droite de chaque côté */
        const Ls = [A1, B1, A2, B2], sides = [], borders = [];
        for (let k = 0; k < 4; k++) {
          const a = o[k], b = o[(k + 1) % 4];
          let bestL = null, bd = Infinity;
          for (const L of Ls) { const dd = lineDist(L, a) + lineDist(L, b); if (dd < bd) { bd = dd; bestL = L; } }
          sides.push(bestL); borders.push(!!bestL.border);
        }
        let pre = 0, over = 0;   // over : dépassement maximal sur les quatre côtés
        for (let k = 0; k < 4; k++) {
          const L = sides[k];
          if (L.border) { pre += 0.45; continue; }
          const a = o[k], b = o[(k + 1) % 4], ta = (a.x - L.c.x) * L.d.x + (a.y - L.c.y) * L.d.y, tb = (b.x - L.c.x) * L.d.x + (b.y - L.c.y) * L.d.y;
          const tmin = Math.min(ta, tb), tmax = Math.max(ta, tb), sl = Math.max(1, tmax - tmin);
          /* dépassement : la droite continue au-delà des coins (motif, joint) — un bord de feuille s'arrête au coin */
          const ov = (Math.max(0, tmin - L.t0) + Math.max(0, L.t1 - tmax)) / sl;
          over = Math.max(over, clamp(ov / 0.4, 0, 1));
          pre += Math.min(1, L.cov / sl) * (0.5 + 0.5 * (L.u === undefined ? 0.5 : L.u)) * (1 - 0.5 * clamp(ov / 0.4, 0, 1));
        }
        out.push({ q: o, borders, pre: pre / 4, over, src: 'lines' });
      }
    }
    return out.sort((a, b) => b.pre - a.pre);
  }

  /* ---------------- étape 5 : score ---------------- */
  /* un côté posé sur le bord de l'image n'a pas de bord à chercher */
  function onBorder(a, b, w, h) {
    const m = 1.5;
    return (a.x <= m && b.x <= m) || (a.x >= w - m && b.x >= w - m) || (a.y <= m && b.y <= m) || (a.y >= h - m && b.y >= h - m);
  }
  const NS = 48;   // échantillons par côté
  /* mesures le long d'un côté a → b (normale intérieure n) : force du gradient (± 2 px), couverture par des contours,
     médianes intérieure / extérieure de Y et S, texture de part et d'autre */
  function sideStats(a, b, ctx, buf) {
    const { G, E, Y, S, w, h, D } = ctx, L = dist(a, b);
    const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L, n = { x: -dy, y: dx }, din = Math.max(4, 0.009 * D), dtex = [0.6 * din, din, 1.5 * din];
    let es = 0, esSigned = 0, cov = 0, texIn = 0, texOut = 0, cnt = 0, covA = 0, nA = 0, covB = 0, nB = 0;
    const yi = buf.yi, yo = buf.yo, si = buf.si, so = buf.so;
    for (let k = 0; k < NS; k++) {
      const t = 0.03 + 0.94 * k / (NS - 1), x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
      if (x < 3 || y < 3 || x > w - 4 || y > h - 4) continue;
      let bm = 0, bs = 0, hit = 0;
      for (let o = -2; o <= 2; o++) {
        const px = x + o * n.x, py = y + o * n.y, v = gradN(G, px, py, n), av = Math.abs(v);
        if (av > bm) { bm = av; bs = v; }
        if (E[(py | 0) * w + (px | 0)]) hit = 1;
      }
      es += bm; esSigned += bs; cov += hit; cnt++;
      if (t < 0.2) { covA += hit; nA++; } else if (t > 0.8) { covB += hit; nB++; }
      yi[cnt - 1] = sampleBil(Y, w, h, x + din * n.x, y + din * n.y); yo[cnt - 1] = sampleBil(Y, w, h, x - din * n.x, y - din * n.y);
      si[cnt - 1] = sampleBil(S, w, h, x + din * n.x, y + din * n.y); so[cnt - 1] = sampleBil(S, w, h, x - din * n.x, y - din * n.y);
      for (let j = 0; j < 3; j++) { texIn += sampleBil(G.mag, w, h, x + dtex[j] * n.x - 0.5, y + dtex[j] * n.y - 0.5); texOut += sampleBil(G.mag, w, h, x - dtex[j] * n.x - 0.5, y - dtex[j] * n.y - 0.5); }
    }
    if (cnt < 8) return null;
    /* prolongement : le bord d'une feuille s'arrête aux coins ; une ligne de motif (nappe, carrelage, joint) continue.
       Compté par extrémité, seulement si le contour est presque continu (≥ 5 points sur 6) : des contours épars d'un fond
       à motifs ne comptent pas */
    let ext = 0, extEnds = 0;
    for (const dir of [-1, 1]) {
      let hits = 0, nn = 0;
      for (let k = 0; k < 6; k++) {
        const t = dir < 0 ? -0.16 + 0.12 * k / 5 : 1.04 + 0.12 * k / 5, x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
        if (x < 3 || y < 3 || x > w - 4 || y > h - 4) continue;
        let hit = 0;
        for (let o = -1.5; o <= 1.5; o += 1.5) {   // contour de même orientation que le côté (pas un motif qui le croise)
          const i = ((y + o * n.y) | 0) * w + ((x + o * n.x) | 0);
          if (E[i] && Math.abs(G.gx[i] * n.x + G.gy[i] * n.y) >= 0.85 * G.mag[i]) hit = 1;
        }
        hits += hit; nn++;
      }
      if (nn >= 5) { ext += clamp((hits / nn - 0.5) / 0.4, 0, 1); extEnds++; }
    }
    const pct = (arr, c, p) => { const a = Array.prototype.slice.call(arr, 0, c).sort((x, y) => x - y); return a[Math.floor(p * (c - 1))]; }, med = (arr, c) => pct(arr, c, 0.5);
    return { es: es / cnt, sign: esSigned >= 0 ? 1 : -1, cov: cov / cnt, covA: nA ? covA / nA : 1, covB: nB ? covB / nB : 1, ext: extEnds ? ext / extEnds : 0,
      dY: med(yi, cnt) - med(yo, cnt), dS: med(si, cnt) - med(so, cnt), texIn: texIn / (3 * cnt), texOut: texOut / (3 * cnt), medIn: med(yi, cnt), medOut: med(yo, cnt), medSIn: med(si, cnt), p70In: pct(yi, cnt, 0.7) };
  }
  /* intérieur du quadrilatère (grille 8 × 8 sur les 60 % centraux) : y70 = luminance du papier (70e centile : l'encre est
     toujours plus sombre que le papier, clair ou kraft), sMed = saturation médiane, odd = part des points qui ne sont ni
     du papier (teinte du centre) ni de l'encre (plus sombre, pas plus saturé) : vichy, bois entre deux feuilles… */
  function innerStats(q, Y, S, w, h) {
    const ys = [], ss = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const u = 0.2 + 0.6 * i / 7, v = 0.2 + 0.6 * j / 7;   // bilinéaire dans le quadrilatère
      const x = (1 - v) * ((1 - u) * q[0].x + u * q[1].x) + v * ((1 - u) * q[3].x + u * q[2].x), y = (1 - v) * ((1 - u) * q[0].y + u * q[1].y) + v * ((1 - u) * q[3].y + u * q[2].y);
      ys.push(sampleBil(Y, w, h, x, y)); ss.push(sampleBil(S, w, h, x, y));
    }
    const sorted = ys.slice().sort((a, b) => a - b), y70 = sorted[Math.floor(0.7 * (sorted.length - 1))], sMed = median(ss);
    let odd = 0;
    for (let k = 0; k < ys.length; k++) {
      const ink = ys[k] < y70 - 35 && ss[k] <= sMed + 30, paper = Math.abs(ss[k] - sMed) <= 30 && ys[k] >= y70 - 35;
      if (!ink && !paper) odd++;
    }
    return { y70, sMed, odd: odd / ys.length };
  }
  const ASPECTS = [SQRT2, 1.294, 1];
  /* score 0-1 d'un candidat ordonné HG HD BD BG ; renvoie null si inacceptable */
  function scoreQuad(q, borders, ctx, lineOver = 0) {
    const { w, h, D, Y, S } = ctx, buf = ctx.buf;
    const area = polyArea(q), fracA = area / (w * h);
    if (!(fracA >= 0.15)) return null;
    for (let k = 0; k < 4; k++) if (cross3(q[k], q[(k + 1) % 4], q[(k + 2) % 4]) <= 0) return null;
    const sides = [0, 1, 2, 3].map(i => dist(q[i], q[(i + 1) % 4]));
    if (Math.min(...sides) < 0.1 * Math.min(w, h)) return null;
    if (Math.min(sides[0], sides[2]) / Math.max(sides[0], sides[2]) < 0.4 || Math.min(sides[1], sides[3]) / Math.max(sides[1], sides[3]) < 0.4) return null;
    let angS = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[(i + 3) % 4], o = q[i], b = q[(i + 1) % 4];
      const v1 = { x: a.x - o.x, y: a.y - o.y }, v2 = { x: b.x - o.x, y: b.y - o.y };
      const ang = Math.acos(clamp((v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)), -1, 1)) * 180 / Math.PI;
      if (ang < 45 || ang > 135) return null;
      angS += clamp(1 - (Math.abs(ang - 90) - 12) / 33, 0, 1) / 4;
    }
    const bord = borders || q.map((p, i) => onBorder(p, q[(i + 1) % 4], w, h));
    const st = [];
    let nb = 0;
    for (let k = 0; k < 4; k++) {
      if (bord[k]) { nb++; st.push(null); continue; }
      const s = sideStats(q[k], q[(k + 1) % 4], ctx, buf);
      if (!s) return null;
      st.push(s);
    }
    if (nb === 4) return null;
    /* signe du contraste : le même sur tous les côtés (feuille claire ou feuille sombre) */
    let sumDY = 0;
    for (const s of st) if (s) sumDY += s.dY;
    const sgn = sumDY >= 0 ? 1 : -1;
    const { y70: inner, sMed: innerS, odd } = innerStats(q, Y, S, w, h), outer = nb ? median(st.filter(Boolean).map(s => s.medOut)) : 0;
    let E = 0, Emin = 1, C = 0, Cmin = 1, K = 0, Kmin = 1, Dst = 0, ext = 0, ends = 0, emptyEnds = 0, m = 0, dev = 0;
    for (let k = 0; k < 4; k++) {
      const s = st[k];
      if (!s) {   // bord de l'image : la bande intérieure doit ressembler au centre de la feuille, pas à l'extérieur
        const a = q[k], b = q[(k + 1) % 4], L = dist(a, b), nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, vals = [];
        for (let j = 0; j < 12; j++) { const t = 0.08 + 0.84 * j / 11; vals.push(sampleBil(Y, w, h, a.x + t * (b.x - a.x) + 4 * nx, a.y + t * (b.y - a.y) + 4 * ny)); }
        const bm = median(vals), kb = clamp((Math.abs(bm - outer) - Math.abs(bm - inner)) / 30, 0, 1);
        K += kb; Kmin = Math.min(Kmin, kb); m++;
        continue;
      }
      const e = clamp(s.es / 22, 0, 1), c = s.cov;
      const dy = s.dY * sgn, kc = clamp(Math.max(dy, Math.abs(s.dS) * 0.8) / 32, 0, 1) * (dy < -8 ? 0 : 1);
      const d = s.es / (s.es + 1.2 * s.texIn + 0.4 * s.texOut + 3);
      E += e; Emin = Math.min(Emin, e); C += c; Cmin = Math.min(Cmin, c); K += kc; Kmin = Math.min(Kmin, kc); Dst += d; ext += s.ext; m++;
      ends += (s.covA + s.covB) / 2; if (s.covA < 0.25) emptyEnds++; if (s.covB < 0.25) emptyEnds++;
      dev = Math.max(dev, Math.abs(s.p70In - inner) + 0.7 * Math.abs(s.medSIn - innerS));   // la bande intérieure doit ressembler au centre
    }
    const nn = 4 - nb;
    E /= nn; C /= nn; Dst /= nn; ext /= nn; ends /= nn; K /= m;
    const geom = clamp((fracA - 0.15) / 0.07, 0, 1) * angS;
    const W = (sides[0] + sides[2]) / 2, H = (sides[1] + sides[3]) / 2, r = Math.max(W, H) / Math.min(W, H);
    let asp = 0;
    for (const t of ASPECTS) asp = Math.max(asp, clamp(1 - Math.abs(r - t) / 0.15, 0, 1));
    const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
    const cen = clamp(1 - Math.hypot(cx - w / 2, cy - h / 2) / (0.5 * D), 0, 1);
    const hom = clamp(1 - (dev - 15) / 45, 0, 1);
    ext = Math.max(ext, lineOver);
    let score = 0.15 * E + 0.17 * C + 0.18 * K + 0.12 * Dst + 0.1 * hom + 0.1 * ends + 0.06 * geom + 0.05 * asp + 0.04 * cen + 0.03 * (Emin + Cmin) / 2;
    score *= [1, 0.85, 0.5][nb];   // côtés non vérifiables (bord de l'image) ; deux bords = simple bande, hypothèse faible
    score *= 1 - 0.6 * clamp((ext - 0.15) / 0.5, 0, 1);   // les côtés se prolongent au-delà des coins : motif, pas feuille
    score *= 1 - 0.7 * clamp((odd - 0.2) / 0.3, 0, 1);   // intérieur disparate (ni papier ni encre) : pas une feuille unie
    if (Kmin < 0.12) score *= 0.6;
    if (Cmin < 0.2) score *= 0.7;
    if (emptyEnds >= 3) score *= 0.75;   // un doigt cache au plus un coin (deux extrémités)
    return { score, E, C, K, Dst, hom, ends, ext, odd, geom, asp, cen, nb, sgn, partial: nb > 0, borders: bord };
  }

  /* ---------------- étape 6 : affinage sous-pixel ---------------- */
  function len(a, b) { const l = dist(a, b); return l < 1e-9 ? null : { c: a, d: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } }; }
  /* droite robuste : consensus sur les paires de points (tol px), puis moindres carrés totaux, rejet et réajustement */
  function robustLine(pts, tol = 2) {
    let bestIn = null;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const L = len(pts[i], pts[j]);
        if (!L) continue;
        const inl = pts.filter(p => lineDist(L, p) <= tol);
        if (!bestIn || inl.length > bestIn.length) bestIn = inl;
      }
    }
    if (!bestIn || bestIn.length < 8) return null;
    let L = fitTLS(bestIn);
    const keep = pts.filter(p => lineDist(L, p) <= tol);
    if (keep.length < 8) return null;
    L = fitTLS(keep);
    return { line: L, n: keep.length };
  }
  /* profil perpendiculaire : position sous-pixel du maximum du gradient de polarité sgn (ou de la valeur absolue) ;
     sample(x, y) renvoie la luminance, step = pas le long de la normale */
  function edgeOffset(sample, bx, by, n, R, step, sgn, minStrength, prof) {
    const m = Math.round(2 * R / step), half = m / 2;
    for (let i = 0; i <= m; i++) { const o = (i - half) * step; prof[i] = sample(bx + o * n.x, by + o * n.y); }
    let bi = -1, bv = -Infinity;
    for (let i = 1; i < m; i++) {   // dérivée centrée lissée, orientée vers l'intérieur
      let v = (prof[i + 1] - prof[i - 1]) / (2 * step);
      v = sgn ? v * sgn : Math.abs(v);
      prof[m + 2 + i] = v;
      if (v > bv) { bv = v; bi = i; }
    }
    if (bi < 2 || bi > m - 2 || bv < minStrength) return null;
    const vm = prof[m + 2 + bi - 1], vp = prof[m + 2 + bi + 1], den = vm - 2 * bv + vp;
    let off = (bi - half) * step;
    if (den < 0) off += clamp(0.5 * (vm - vp) / den, -0.5, 0.5) * step;
    return off;
  }
  /* affinage d'un quadrilatère (HG HD BD BG, pixels de l'image de taille w × h) sur une fonction de luminance ;
     borders = côtés posés sur le bord (non affinés) ; sgn = polarité attendue (+1 feuille claire) ; renvoie un nouveau quad */
  function refineQuad(q, borders, sample, w, h, sgn, opts = {}) {
    const D = Math.max(w, h), R = Math.max(3, (opts.R || 0.02) * D), step = opts.step || 1, NSAMP = opts.n || 36, minS = opts.minStrength || 4;
    const prof = new Float32Array(Math.round(2 * R / step) + 8);
    const lines = [], tol = opts.tol || Math.max(1.2, 0.0025 * D);
    for (let s = 0; s < 4; s++) {
      const a = q[s], b = q[(s + 1) % 4], old = len(a, b);
      if (!old) return q;
      lines.push(old);
      if (borders[s] || onBorder(a, b, w, h)) continue;
      const n = { x: -old.d.y, y: old.d.x };
      const pts = [];
      for (let k = 0; k < NSAMP; k++) {
        const t = 0.06 + 0.88 * k / (NSAMP - 1), bx = a.x + t * (b.x - a.x), by = a.y + t * (b.y - a.y);
        if (bx < R || by < R || bx > w - R || by > h - R) continue;
        const off = edgeOffset(sample, bx, by, n, R, step, sgn, minS, prof);
        if (off !== null) pts.push({ x: bx + off * n.x, y: by + off * n.y });
      }
      if (pts.length < Math.max(8, 0.4 * NSAMP)) continue;
      const fit = robustLine(pts, tol);
      if (fit && fit.n >= Math.max(8, 0.4 * NSAMP)) lines[s] = fit.line;
    }
    const out = [];
    for (let i = 0; i < 4; i++) {
      const X = intersect(lines[(i + 3) % 4], lines[i]);
      out.push(X && X.sin >= 0.2 && dist(X.p, q[i]) <= 0.06 * D ? X.p : q[i]);
    }
    return out;
  }

  /* ---------------- ordre et contrôle ---------------- */
  /* HG, HD, BD, BG : tri angulaire autour du centre, départ au point de plus petit x + y */
  function order(points) {
    const P = points.map(p => ({ x: +p.x, y: +p.y }));
    const cx = P.reduce((s, p) => s + p.x, 0) / P.length, cy = P.reduce((s, p) => s + p.y, 0) / P.length;
    P.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    let st = 0;
    for (let i = 1; i < P.length; i++) if (P[i].x + P[i].y < P[st].x + P[st].y) st = i;
    return P.slice(st).concat(P.slice(0, st));
  }
  /* contrôle d'un quadrilatère en pixels ; raisons : 'cross' (coins croisés / retournés), 'small', 'shape', 'outside' */
  function validatePx(P, w, h) {
    if (!Array.isArray(P) || P.length !== 4 || P.some(p => !p || !isFinite(p.x) || !isFinite(p.y))) return { ok: false, reason: 'shape' };
    for (let i = 0; i < 4; i++) if (cross3(P[i], P[(i + 1) % 4], P[(i + 2) % 4]) <= 0) return { ok: false, reason: 'cross' };
    const mx = 0.03 * w, my = 0.03 * h;
    if (P.some(p => p.x < -mx || p.x > w + mx || p.y < -my || p.y > h + my)) return { ok: false, reason: 'outside' };
    if (polyArea(P) < 0.15 * w * h) return { ok: false, reason: 'small' };
    const sides = [0, 1, 2, 3].map(i => dist(P[i], P[(i + 1) % 4]));
    if (Math.min(...sides) < 0.1 * Math.min(w, h)) return { ok: false, reason: 'small' };
    for (let i = 0; i < 4; i++) {
      const a = P[(i + 3) % 4], o = P[i], b = P[(i + 1) % 4];
      const v1 = { x: a.x - o.x, y: a.y - o.y }, v2 = { x: b.x - o.x, y: b.y - o.y };
      const ang = Math.acos(clamp((v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)), -1, 1)) * 180 / Math.PI;
      if (ang < 45 || ang > 135) return { ok: false, reason: 'shape' };
    }
    if (Math.min(sides[0], sides[2]) / Math.max(sides[0], sides[2]) < 0.4 || Math.min(sides[1], sides[3]) / Math.max(sides[1], sides[3]) < 0.4) return { ok: false, reason: 'shape' };
    return { ok: true, reason: '' };
  }
  const toPx = (quad, w, h) => quad.map(p => ({ x: p.x * w, y: p.y * h }));
  function validate(quad, w, h) {
    if (!(w > 0 && h > 0) || !Array.isArray(quad)) return { ok: false, reason: 'shape' };
    return validatePx(toPx(quad, w, h), w, h);
  }

  /* ---------------- étape 7 : analyse complète ---------------- */
  const OK_CONF = 0.5;
  /* analyse d'une image RGBA réduite (w × h) ; fine = { Y, w, h } luminance d'une copie plus grande pour l'affinage (facultatif) */
  function analyse(px, w, h, fine, opts = {}) {
    const t0 = now(), n = w * h, D = Math.max(w, h);
    const fail = (reason, quad, extra) => Object.assign({ ok: false, reason, quad: quad || FULL(), score: 0, conf: 0, full: false, partial: false, ms: now() - t0 }, extra || {});
    /* 1. canaux, normalisation d'éclairage, flou léger */
    const { Y, S, meanY } = channels(px, n);
    if (meanY < 22) return fail('dark');
    const Yn = gauss5(normaliseLight(Y, w, h), w, h), Sb = gauss5(S, w, h);
    /* 2. gradient fusionné (luminance normalisée + saturation), Canny */
    const G = fuseGradient([{ G: sobel(Yn, w, h), k: 1 }, { G: sobel(gauss5(Y, w, h), w, h), k: 1 }, { G: sobel(Sb, w, h), k: 0.8 }]);
    const { E, high } = canny(G);
    /* 3. segments → droites */
    const minLen = Math.max(10, 0.02 * D);
    const segs = findSegments(E, G, minLen);
    const lines = mergeLines(segs, w, h).filter(L => L.cov >= Math.max(minLen, 0.04 * D));
    /* 4. candidats : droites, ancienne méthode (composante papier) */
    const ctx = { G, E, Y, S, w, h, D, buf: { yi: new Float32Array(NS), yo: new Float32Array(NS), si: new Float32Array(NS), so: new Float32Array(NS) } };
    const legacy = legacyCandidates(px, w, h);
    const pool = rankLines(lines, Y, w, h, opts.maxLines || 40);
    let cands = lineCandidates(pool, w, h).slice(0, opts.maxCands || 150);
    for (const q of legacy.quads) cands.push({ q: order(refineQuad(q, [false, false, false, false], (x, y) => sampleBil(Yn, w, h, x - 0.5, y - 0.5), w, h, 0, { R: 0.02, n: 30 })), borders: null, pre: 1, src: 'paper' });
    /* 5. score */
    let best = null;
    const scored = [];
    for (const c of cands) {
      const s = scoreQuad(c.q, c.borders, ctx, c.over || 0);
      if (!s) continue;
      const item = { q: c.q, score: s.score, s, src: c.src, over: c.over || 0 };
      scored.push(item);
      if (!best || s.score > best.score) best = item;
    }
    /* feuille qui remplit la photo : zone « papier » quasi totale (≥ 80 %, le texte compte en creux), du contenu dessus et aucun cadre convaincant */
    if (legacy.fullCover >= 0.8 && legacy.contrast >= 25 && (!best || best.score < OK_CONF)) return Object.assign(fail('', FULL()), { ok: true, full: true, conf: 0.6, score: 0.6 });
    if (!best) return fail(lines.length ? 'nofound' : 'contrast', null, { edges: high });
    /* 6. affinage : d'abord sur la copie d'analyse, puis sur la luminance fine */
    const sgn = best.s.sgn;
    let q = refineQuad(best.q, best.s.borders, (x, y) => sampleBil(Yn, w, h, x - 0.5, y - 0.5), w, h, sgn, { R: 0.015, n: 40 });
    let sc = scoreQuad(q, best.s.borders, ctx, best.over);
    if (!sc || sc.score < best.score - 0.03) { q = best.q; sc = best.s; }
    let quadN = q.map(p => ({ x: p.x / w, y: p.y / h }));
    if (fine && fine.w > w) {
      const k = fine.w / w, qf = q.map(p => ({ x: p.x * k, y: p.y * k }));
      const rf = refineQuad(qf, sc.borders, (x, y) => sampleBil(fine.Y, fine.w, fine.h, x - 0.5, y - 0.5), fine.w, fine.h, sgn, { R: 0.012, n: 48, step: 0.5, minStrength: 3 });
      const back = rf.map(p => ({ x: p.x / k, y: p.y / k }));
      const sf = scoreQuad(back, sc.borders, ctx, best.over);
      if (sf && sf.score >= sc.score - 0.03) { quadN = rf.map(p => ({ x: p.x / fine.w, y: p.y / fine.h })); sc = sf; }
    }
    const conf = clamp(sc.score, 0, 1);
    const full = quadN.every((p, i) => Math.hypot(p.x - FULL()[i].x, p.y - FULL()[i].y) < 0.02);
    const res = { ok: conf >= OK_CONF, reason: conf >= OK_CONF ? '' : 'lowconf', quad: quadN.map(p => ({ x: clamp(p.x, -0.2, 1.2), y: clamp(p.y, -0.2, 1.2) })), score: sc.score, conf, full, partial: !!sc.partial, ms: now() - t0 };
    if (opts.debug) res.debug = { lines: pool, segs: segs.length, cands: scored.sort((a, b) => b.score - a.score).slice(0, 8).map(c => ({ q: c.q, score: c.score, src: c.src, s: c.s, over: c.over })), high, best: sc };
    return res;
  }
  /* luminance d'une source dessinée à la taille w × h */
  function lumOf(src, w, h) {
    const c = newCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    freeCanvas(c);
    return { Y: channels(px, w * h).Y, w, h };
  }
  /* source : image, ImageBitmap, canevas (ou ImageData) ; opts.size = côté long de la copie d'analyse (640),
     opts.fine = côté long de la copie d'affinage (1024, 0 pour désactiver), opts.debug = détails des candidats */
  function detect(source, opts = {}) {
    const t0 = now();
    const size = Math.max(64, Math.min(2048, +opts.size || 640)), fineSize = opts.fine === undefined ? 1024 : +opts.fine;
    let src = source, tmp = null;
    if (source && source.data && !source.getContext && source.width) { tmp = newCanvas(source.width, source.height); tmp.getContext('2d').putImageData(source, 0, 0); src = tmp; }
    const { w: sw, h: sh } = dimsOf(src);
    if (!sw || !sh || Math.min(sw, sh) < 200) { freeCanvas(tmp); return { ok: false, quad: FULL(), reason: 'tiny-image', score: 0, conf: 0, full: false, partial: false, ms: now() - t0 }; }
    const k = Math.min(1, size / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const c = newCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    let px, fine = null;
    try {
      ctx.drawImage(src, 0, 0, w, h); px = ctx.getImageData(0, 0, w, h).data;
      const kf = Math.min(1, fineSize / Math.max(sw, sh));
      if (fineSize && kf * Math.max(sw, sh) > size * 1.2) fine = lumOf(src, Math.round(sw * kf), Math.round(sh * kf));
    } catch { freeCanvas(c); freeCanvas(tmp); return { ok: false, quad: FULL(), reason: 'contrast', score: 0, conf: 0, full: false, partial: false, ms: now() - t0 }; }
    freeCanvas(c); freeCanvas(tmp);
    const r = analyse(px, w, h, fine, opts);
    r.ms = now() - t0;
    return r;
  }

  /* ---------------- taille de sortie et redressement ---------------- */
  function outputSize(quad, w, h, { maxSide = 2000, snapA4 = true } = {}) {
    const P = toPx(quad, w, h);
    const top = dist(P[0], P[1]), right = dist(P[1], P[2]), bottom = dist(P[2], P[3]), left = dist(P[3], P[0]);
    const W = (top + bottom) / 2, H = (left + right) / 2;
    if (!(W > 0 && H > 0)) return { w: 1, h: 1, a4: false };
    const long = Math.min(maxSide, Math.max(W, H));
    let r = Math.max(W, H) / Math.min(W, H), a4 = false;
    if (snapA4 && Math.abs(r / SQRT2 - 1) < 0.07) { r = SQRT2; a4 = true; }
    const L = Math.max(1, Math.round(long)), S = Math.max(1, Math.round(long / r));
    return W >= H ? { w: L, h: S, a4 } : { w: S, h: L, a4 };
  }
  /* homographie de Heckbert : carré unité (0,0) (1,0) (1,1) (0,1) → P0 P1 P2 P3 */
  function homography(P) {
    const [p0, p1, p2, p3] = P;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
    let a, b, c, d, e, f, g, h;
    if (Math.abs(dx3) < 1e-10 && Math.abs(dy3) < 1e-10) {
      a = p1.x - p0.x; b = p3.x - p0.x; c = p0.x; d = p1.y - p0.y; e = p3.y - p0.y; f = p0.y; g = 0; h = 0;
    } else {
      const den = dx1 * dy2 - dx2 * dy1;
      if (Math.abs(den) < 1e-12) throw new Error('warp');
      g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den;
      a = p1.x - p0.x + g * p1.x; b = p3.x - p0.x + h * p3.x; c = p0.x;
      d = p1.y - p0.y + g * p1.y; e = p3.y - p0.y + h * p3.y; f = p0.y;
    }
    return { a, b, c, d, e, f, g, h, map(u, v) { const z = g * u + h * v + 1; return { x: (a * u + b * v + c) / z, y: (d * u + e * v + f) / z }; } };
  }
  /* poids de Catmull-Rom (a = −0,5) pour une fraction t */
  const cubicW = (t, out) => { const t2 = t * t, t3 = t2 * t; out[0] = -0.5 * t3 + t2 - 0.5 * t; out[1] = 1.5 * t3 - 2.5 * t2 + 1; out[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; out[3] = 0.5 * t3 - 0.5 * t2; };
  /* page redressée (canevas) ; lève Error('warp') en cas d'échec ; bicubic: true → Catmull-Rom borné (plus net, sans rebond) */
  function warp(source, w, h, quad, { maxSide = 2000, bicubic = false } = {}) {
    let pre = null;
    try {
      if (!(w > 0 && h > 0) || !Array.isArray(quad) || quad.length !== 4) throw new Error('warp');
      const out = outputSize(quad, w, h, { maxSide });
      const P = toPx(quad, w, h);
      const longest = Math.max(...[0, 1, 2, 3].map(i => dist(P[i], P[(i + 1) % 4])));
      if (!(longest > 0)) throw new Error('warp');
      const sc = Math.min(1, 1.25 * Math.max(out.w, out.h) / longest);
      const bx0 = clamp(Math.floor(Math.min(...P.map(p => p.x))) - 2, 0, w), bx1 = clamp(Math.ceil(Math.max(...P.map(p => p.x))) + 2, 0, w);
      const by0 = clamp(Math.floor(Math.min(...P.map(p => p.y))) - 2, 0, h), by1 = clamp(Math.ceil(Math.max(...P.map(p => p.y))) + 2, 0, h);
      const bw = bx1 - bx0, bh = by1 - by0;
      if (bw < 1 || bh < 1) throw new Error('warp');
      const cw = Math.max(1, Math.round(bw * sc)), ch = Math.max(1, Math.round(bh * sc)), sx = cw / bw, sy = ch / bh;
      pre = newCanvas(cw, ch);
      const pctx = pre.getContext('2d', { willReadFrequently: true });
      pctx.imageSmoothingEnabled = true; pctx.imageSmoothingQuality = 'high';
      pctx.drawImage(source, bx0, by0, bw, bh, 0, 0, cw, ch);
      const S = pctx.getImageData(0, 0, cw, ch).data;
      freeCanvas(pre); pre = null;
      const M = homography(P.map(p => ({ x: (p.x - bx0) * sx, y: (p.y - by0) * sy })));
      const W = out.w, H = out.h;
      const dst = newCanvas(W, H), dctx = dst.getContext('2d');
      const img = dctx.createImageData(W, H), O = img.data;
      const du = 1 / W, u0 = 0.5 / W, ax = M.a * du, ay = M.d * du, az = M.g * du, row = cw * 4;
      const wx = new Float32Array(4), wy = new Float32Array(4), cols = new Int32Array(4), rows = new Int32Array(4);
      for (let j = 0, o = 0; j < H; j++) {
        const v = (j + 0.5) / H;
        let X = M.a * u0 + M.b * v + M.c, Y = M.d * u0 + M.e * v + M.f, Z = M.g * u0 + M.h * v + 1;
        for (let i = 0; i < W; i++, o += 4, X += ax, Y += ay, Z += az) {
          const px = X / Z - 0.5, py = Y / Z - 0.5;
          if (!(px >= -1 && py >= -1 && px <= cw && py <= ch)) { O[o] = O[o + 1] = O[o + 2] = O[o + 3] = 255; continue; }
          const qx = px < 0 ? 0 : px > cw - 1 ? cw - 1 : px, qy = py < 0 ? 0 : py > ch - 1 ? ch - 1 : py;
          const x0 = qx | 0, y0 = qy | 0, fx = qx - x0, fy = qy - y0;
          if (!bicubic) {
            const x1 = x0 + 1 < cw ? x0 + 1 : x0, y1 = y0 + 1 < ch ? y0 + 1 : y0;
            const i00 = y0 * row + x0 * 4, i10 = y0 * row + x1 * 4, i01 = y1 * row + x0 * 4, i11 = y1 * row + x1 * 4;
            const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
            O[o] = S[i00] * w00 + S[i10] * w10 + S[i01] * w01 + S[i11] * w11;
            O[o + 1] = S[i00 + 1] * w00 + S[i10 + 1] * w10 + S[i01 + 1] * w01 + S[i11 + 1] * w11;
            O[o + 2] = S[i00 + 2] * w00 + S[i10 + 2] * w10 + S[i01 + 2] * w01 + S[i11 + 2] * w11;
            O[o + 3] = 255;
            continue;
          }
          cubicW(fx, wx); cubicW(fy, wy);
          for (let k = 0; k < 4; k++) { cols[k] = clamp(x0 - 1 + k, 0, cw - 1) * 4; rows[k] = clamp(y0 - 1 + k, 0, ch - 1) * row; }
          const i00 = rows[1] + cols[1], i10 = rows[1] + cols[2], i01 = rows[2] + cols[1], i11 = rows[2] + cols[2];
          for (let ch3 = 0; ch3 < 3; ch3++) {
            let acc = 0;
            for (let yy = 0; yy < 4; yy++) { const rb = rows[yy] + ch3; let r = 0; for (let xx = 0; xx < 4; xx++) r += S[rb + cols[xx]] * wx[xx]; acc += r * wy[yy]; }
            /* borné par les 4 voisins bilinéaires : pas de rebond (halo) autour du texte */
            const a = S[i00 + ch3], b = S[i10 + ch3], c2 = S[i01 + ch3], d = S[i11 + ch3];
            const lo = Math.min(a, b, c2, d), hi = Math.max(a, b, c2, d);
            O[o + ch3] = acc < lo ? lo : acc > hi ? hi : acc;
          }
          O[o + 3] = 255;
        }
      }
      dctx.putImageData(img, 0, 0);
      return dst;
    } catch (e) {
      freeCanvas(pre);
      throw new Error('warp');
    }
  }

  window.AlixoScanDetect = {
    detect, validate, outputSize, warp, order,
    _: { channels, paperMap, boxBlur, gauss5, normaliseLight, sobel, fuseGradient, canny, cannyThresholds, findSegments, mergeLines, rankLines, lineCandidates, legacyCandidates, scoreQuad, sideStats, refineQuad, robustLine, fitTLS, fitTLSW, otsu, opening, bestComponent, contourPoints, convexHull, simplifyClosed, maxQuad, homography, validatePx, analyse, polyArea, intersect }
  };
})();
