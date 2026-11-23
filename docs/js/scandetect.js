/* ============================================================
   Alixo — détection et redressement d'une feuille photographiée (page du téléphone, mode scan)
   1.57.0 : module pur window.AlixoScanDetect, sans dépendance, tout se calcule sur le téléphone (aucun envoi).
   Détection sur une copie réduite (côté long 512 px) :
     1. carte « papier » f = Y − 0,5 × (max − min) : clair et peu coloré → élevé (le bois, la peau, un tissu coloré → bas) ;
     2. flou-boîte séparable (rayon 2, deux passes) ; 3. seuil d'Otsu (second seuil plus bas pour les pages à l'ombre) ;
     4. ouverture morphologique ; 5. composantes connexes (la plus grande, au centre, qui ne touche pas tous les bords) ;
     6-8. contour → enveloppe convexe → Douglas-Peucker → quadrilatère d'aire maximale inscrit ;
     9. affinage des côtés sur le gradient de Sobel (droites robustes par moindres carrés totaux) ; 10. ordre et contrôle.
   Redressement : homographie de Heckbert (carré unité → quadrilatère), échantillonnage inverse bilinéaire.
   API : detect, validate, outputSize, warp, order ; _ = fonctions internes (tests).
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

  /* dimensions d'une source dessinable (image, ImageBitmap, canevas, vidéo) */
  function dimsOf(s) {
    if (!s) return { w: 0, h: 0 };
    return { w: s.naturalWidth || s.videoWidth || s.width || 0, h: s.naturalHeight || s.videoHeight || s.height || 0 };
  }

  /* ---------------- étapes 1 à 4 : carte papier, flou, Otsu, masque ---------------- */
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
  /* seuil d'Otsu sur 256 classes ; m0 / m1 = moyennes des deux classes */
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
  /* minimum (érosion) ou maximum (dilatation) sur une fenêtre carrée, séparable */
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

  /* ---------------- étape 5 : composantes connexes (4-connexité, pile explicite) ---------------- */
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

  /* ---------------- étapes 6 à 8 : contour, enveloppe, simplification, quadrilatère ---------------- */
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
  /* Douglas-Peucker sur un polygone fermé : coupure entre le sommet 0 et le sommet le plus éloigné */
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

  /* ---------------- étape 9 : affinage des côtés sur le gradient ---------------- */
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
  function sampleBil(arr, w, h, x, y) {
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
    const x0 = Math.min(w - 2, x | 0), y0 = Math.min(h - 2, y | 0), fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return (arr[i] * (1 - fx) + arr[i + 1] * fx) * (1 - fy) + (arr[i + w] * (1 - fx) + arr[i + w + 1] * fx) * fy;
  }
  /* gradient projeté sur la normale intérieure n au point (x, y) — positif quand on entre dans la feuille (plus claire) */
  const gradN = (G, x, y, n) => sampleBil(G.gx, G.w, G.h, x - 0.5, y - 0.5) * n.x + sampleBil(G.gy, G.w, G.h, x - 0.5, y - 0.5) * n.y;
  /* droite par moindres carrés totaux (ACP) : point moyen c, direction d */
  function fitTLS(pts) {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { c: { x: cx, y: cy }, d: { x: Math.cos(ang), y: Math.sin(ang) } };
  }
  const lineDist = (L, p) => Math.abs((p.x - L.c.x) * L.d.y - (p.y - L.c.y) * L.d.x);
  /* droite robuste : consensus sur les paires de points (2 px), puis moindres carrés totaux, rejet > 2 px et réajustement */
  function robustLine(pts) {
    let bestIn = null;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const L = len(pts[i], pts[j]);
        if (!L) continue;
        const inl = pts.filter(p => lineDist(L, p) <= 2);
        if (!bestIn || inl.length > bestIn.length) bestIn = inl;
      }
    }
    if (!bestIn || bestIn.length < 8) return null;
    let L = fitTLS(bestIn);
    const keep = pts.filter(p => lineDist(L, p) <= 2);
    if (keep.length < 8) return null;
    L = fitTLS(keep);
    return { line: L, n: keep.length };
  }
  function len(a, b) { const l = dist(a, b); return l < 1e-9 ? null : { c: a, d: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } }; }
  function intersect(L1, L2) {
    const den = L1.d.x * L2.d.y - L1.d.y * L2.d.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((L2.c.x - L1.c.x) * L2.d.y - (L2.c.y - L1.c.y) * L2.d.x) / den;
    return { p: { x: L1.c.x + t * L1.d.x, y: L1.c.y + t * L1.d.y }, sin: Math.abs(den) };
  }
  /* un côté posé sur le bord de l'image (feuille qui remplit la photo) n'a pas de bord à chercher */
  function onBorder(a, b, w, h) {
    const m = 1.5;
    return (a.x <= m && b.x <= m) || (a.x >= w - m && b.x >= w - m) || (a.y <= m && b.y <= m) || (a.y >= h - m && b.y >= h - m);
  }
  /* q ordonné HG, HD, BD, BG (sens horaire à l'écran) */
  function refine(q, G) {
    const { w, h } = G, D = Math.max(w, h), R = Math.max(3, Math.round(0.02 * D));
    const lines = [];
    for (let s = 0; s < 4; s++) {
      const a = q[s], b = q[(s + 1) % 4], old = len(a, b);
      if (!old) return q;
      lines.push(old);
      if (onBorder(a, b, w, h)) continue;
      const n = { x: -old.d.y, y: old.d.x };   // normale intérieure (sens horaire, y vers le bas)
      const pts = [];
      for (let k = 0; k < 30; k++) {
        const t = 0.1 + 0.8 * k / 29, bx = a.x + t * (b.x - a.x), by = a.y + t * (b.y - a.y);
        const vals = [];
        let bi = -1, bv = -Infinity;
        for (let o = -R; o <= R; o++) { const v = gradN(G, bx + o * n.x, by + o * n.y, n); vals.push(v); if (v > bv) { bv = v; bi = o + R; } }
        if (bv < 15) continue;
        let off = bi - R;
        if (bi > 0 && bi < vals.length - 1) { const vm = vals[bi - 1], vp = vals[bi + 1], den = vm - 2 * bv + vp; if (den < 0) off += clamp(0.5 * (vm - vp) / den, -0.5, 0.5); }
        pts.push({ x: bx + off * n.x, y: by + off * n.y });
      }
      if (pts.length < 8) continue;
      const fit = robustLine(pts);
      if (fit) lines[s] = fit.line;
    }
    const out = [];
    for (let i = 0; i < 4; i++) {
      const X = intersect(lines[(i + 3) % 4], lines[i]);
      out.push(X && X.sin >= 0.2 && dist(X.p, q[i]) <= 0.1 * D ? X.p : q[i]);
    }
    return out;
  }
  /* moyenne du gradient (valeur absolue, sur la normale) le long des côtés qui ne sont pas sur le bord de l'image */
  function edgeStrength(q, G) {
    let s = 0, n = 0;
    for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4];
      if (onBorder(a, b, G.w, G.h)) continue;
      const L = len(a, b); if (!L) continue;
      const nn = { x: -L.d.y, y: L.d.x };
      for (let i = 0; i < 40; i++) {
        const t = 0.05 + 0.9 * i / 39, x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
        let m = 0;
        for (let o = -1; o <= 1; o++) m = Math.max(m, Math.abs(gradN(G, x + o * nn.x, y + o * nn.y, nn)));
        s += m; n++;
      }
    }
    return n ? s / n : null;
  }

  /* ---------------- étape 10 : ordre et contrôle ---------------- */
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
    if (polyArea(P) < 0.2 * w * h) return { ok: false, reason: 'small' };
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

  /* ---------------- détection ---------------- */
  /* analyse d'une image RGBA (copie réduite) */
  function analyse(px, w, h) {
    const n = w * h, fail = reason => ({ ok: false, reason, quad: FULL(), score: 0, full: false });
    const f = paperMap(px, n);
    const fb = boxBlur(boxBlur(f, w, h, 2), w, h, 2);
    const { t, m0, m1 } = otsu(fb);
    if (m1 - m0 < 25) return fail('contrast');
    const G = sobel(f, w, h);
    /* 1.57.0 : le second seuil (plus bas) récupère la partie d'une feuille à l'ombre ; les deux essais sont toujours
       comparés (au score), car le premier peut donner un cadre valable mais amputé de la partie ombrée */
    const tries = [t, t - 0.3 * (t - m0)];
    let best = null, firstReason = '';
    for (const th of tries) {
      const r = tryThreshold(fb, G, th, w, h);
      if (r.ok) { if (!best || r.score > best.score) best = r; }
      else if (!firstReason) firstReason = r.reason;
    }
    if (!best) return fail(firstReason || 'shape');
    const P = best.quad;
    const full = P.every((p, i) => Math.hypot(p.x / w - FULL()[i].x, p.y / h - FULL()[i].y) < 0.02);
    return { ok: true, reason: '', quad: P.map(p => ({ x: clamp(p.x / w, 0, 1), y: clamp(p.y / h, 0, 1) })), score: best.score, full };
  }
  function tryThreshold(fb, G, th, w, h) {
    const n = w * h;
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = fb[i] > th ? 1 : 0;
    const open = opening(mask, w, h, 2);
    const comp = bestComponent(open, w, h);
    if (!comp || comp.area < 0.1 * n) return { ok: false, reason: 'small' };
    const hull = convexHull(contourPoints(comp.lab, comp.label, w, h));
    const simp = simplifyClosed(hull, 1, 64);
    let q = maxQuad(simp);
    if (!q) return { ok: false, reason: 'shape' };
    q = order(q);
    /* une feuille remplit son cadre : une tache irrégulière (grain du bois, objets) n'est pas une page */
    if (comp.area < 0.8 * polyArea(q)) return { ok: false, reason: 'shape' };
    q = order(refine(order(refine(q, G)), G));
    const v = validatePx(q, w, h);
    if (!v.ok) return { ok: false, reason: v.reason === 'small' ? 'small' : 'shape' };
    const e = edgeStrength(q, G);
    if (e !== null && e < 12) return { ok: false, reason: 'shape' };   // pas de vrai bord autour du cadre
    return { ok: true, quad: q, score: polyArea(q) / n * (e === null ? 30 : e) };
  }
  /* source : image, ImageBitmap, canevas (ou ImageData) ; opts.size = côté long de la copie d'analyse */
  function detect(source, opts = {}) {
    const size = Math.max(64, Math.min(2048, +opts.size || 512));
    let src = source, tmp = null;
    if (source && source.data && !source.getContext && source.width) { tmp = newCanvas(source.width, source.height); tmp.getContext('2d').putImageData(source, 0, 0); src = tmp; }
    const { w: sw, h: sh } = dimsOf(src);
    if (!sw || !sh || Math.min(sw, sh) < 200) { freeCanvas(tmp); return { ok: false, quad: FULL(), reason: 'tiny-image', score: 0, full: false }; }
    const k = Math.min(1, size / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const c = newCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    let px;
    try { ctx.drawImage(src, 0, 0, w, h); px = ctx.getImageData(0, 0, w, h).data; }
    catch { freeCanvas(c); freeCanvas(tmp); return { ok: false, quad: FULL(), reason: 'contrast', score: 0, full: false }; }
    freeCanvas(c); freeCanvas(tmp);
    return analyse(px, w, h);
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
  /* page redressée (canevas) ; lève Error('warp') en cas d'échec */
  function warp(source, w, h, quad, { maxSide = 2000 } = {}) {
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
      for (let j = 0, o = 0; j < H; j++) {
        const v = (j + 0.5) / H;
        let X = M.a * u0 + M.b * v + M.c, Y = M.d * u0 + M.e * v + M.f, Z = M.g * u0 + M.h * v + 1;
        for (let i = 0; i < W; i++, o += 4, X += ax, Y += ay, Z += az) {
          const px = X / Z - 0.5, py = Y / Z - 0.5;
          if (!(px >= -1 && py >= -1 && px <= cw && py <= ch)) { O[o] = O[o + 1] = O[o + 2] = O[o + 3] = 255; continue; }
          const qx = px < 0 ? 0 : px > cw - 1 ? cw - 1 : px, qy = py < 0 ? 0 : py > ch - 1 ? ch - 1 : py;
          const x0 = qx | 0, y0 = qy | 0, x1 = x0 + 1 < cw ? x0 + 1 : x0, y1 = y0 + 1 < ch ? y0 + 1 : y0, fx = qx - x0, fy = qy - y0;
          const i00 = y0 * row + x0 * 4, i10 = y0 * row + x1 * 4, i01 = y1 * row + x0 * 4, i11 = y1 * row + x1 * 4;
          const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
          O[o] = S[i00] * w00 + S[i10] * w10 + S[i01] * w01 + S[i11] * w11;
          O[o + 1] = S[i00 + 1] * w00 + S[i10 + 1] * w10 + S[i01 + 1] * w01 + S[i11 + 1] * w11;
          O[o + 2] = S[i00 + 2] * w00 + S[i10 + 2] * w10 + S[i01 + 2] * w01 + S[i11 + 2] * w11;
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
    _: { paperMap, boxBlur, otsu, opening, bestComponent, contourPoints, convexHull, simplifyClosed, maxQuad, sobel, refine, robustLine, fitTLS, homography, validatePx, analyse, edgeStrength, polyArea }
  };
})();
