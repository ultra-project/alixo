/* Documentation Alixo : sommaire (section courante, groupes repliables, version téléphone), recherche dans la page.
   Mode clair seul : aucune préférence de thème. Le menu mobile de la barre est géré par /site.js. */

/* Sommaire : section courante */
const links = [...document.querySelectorAll('.doc-side a[href^="#"]')];
const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
const targets = [...byId.keys()].map(id => document.getElementById(id)).filter(Boolean);
const side = document.querySelector('.doc-side');
let current = null;
/* Garde le lien actif visible dans le sommaire collant (qui défile à part), sans toucher au défilement de la page. */
function reveal(a) {
  if (getComputedStyle(side).position !== 'sticky' || !a.offsetParent) return;
  const s = side.getBoundingClientRect(), r = a.getBoundingClientRect();
  if (r.top < s.top + 8) side.scrollTop += r.top - s.top - 48;
  else if (r.bottom > s.bottom - 8) side.scrollTop += r.bottom - s.bottom + 48;
}
/* La barre de navigation est fixe (pilule flottante) : la zone d'observation commence dessous, juste après la ligne
   où s'arrête une section visée par une ancre (scroll-padding-top 96 px + scroll-margin-top 8 px = 104 px).
   Section courante = la première, dans l'ordre de la page, qui traverse cette zone. */
/* Sur téléphone, le sommaire replié reste collé sous la barre : la zone commence sous lui (voir doc.css, scroll-padding-top).
   La zone est recalculée quand la fenêtre change de taille (passage bureau ↔ téléphone). */
const spyTop = () => matchMedia('(max-width: 900px)').matches ? 172 : 112;
const seen = new Set();
let spy = null, spyTopNow = -1;
function paint() {
  const top = targets.find(t => seen.has(t) && !t.hidden);
  if (top) current = top.id;
  if (!current) return;
  links.forEach(a => {
    const on = a.getAttribute('href') === '#' + current;
    a.classList.toggle('on', on);
    if (on) { a.setAttribute('aria-current', 'location'); reveal(a); } else a.removeAttribute('aria-current');
  });
}
function buildSpy() {
  const top = spyTop(); if (top === spyTopNow) return;
  spyTopNow = top;
  if (spy) spy.disconnect();
  seen.clear();
  spy = new IntersectionObserver(entries => {
    for (const e of entries) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); }
    paint();
  }, { rootMargin: '-' + top + 'px 0px -70% 0px', threshold: 0 });
  targets.forEach(t => spy.observe(t));
}
buildSpy();
let resizeTimer; addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(buildSpy, 150); });

/* Sommaire : groupes repliables (clic ou Entrée / Espace sur le titre du groupe) */
document.querySelectorAll('.doc-side .grp').forEach(g => {
  const t = g.querySelector('.grp-t'); if (!t) return;
  t.setAttribute('role', 'button'); t.tabIndex = 0; t.setAttribute('aria-expanded', 'true');
  const flip = () => t.setAttribute('aria-expanded', g.classList.toggle('closed') ? 'false' : 'true');
  t.addEventListener('click', flip);
  t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
});

/* Sommaire repliable sur téléphone (le bouton porte aria-controls="doc-toc" dans le HTML) */
const toggle = document.querySelector('.doc-side-toggle');
const setSide = open => { side.classList.toggle('open', open); if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); };
if (toggle) toggle.addEventListener('click', () => setSide(!side.classList.contains('open')));
links.forEach(a => a.addEventListener('click', () => setSide(false)));
addEventListener('keydown', e => { if (e.key === 'Escape' && side.classList.contains('open')) { setSide(false); if (toggle) toggle.focus(); } });

/* Recherche dans la page : filtre les sections, surligne les mots */
const input = document.getElementById('doc-q');
const clearBtn = document.getElementById('doc-clear');
const noResClear = document.getElementById('doc-noresult-clear');
const sections = [...document.querySelectorAll('.doc-main > section')];
const noRes = document.getElementById('doc-noresult');
const countEl = document.getElementById('doc-count');   /* role=status : le nombre de sections trouvées est annoncé */
/* norm : minuscules sans accents ; apostrophes typographiques ’ ‘ ` ´ → ' ; œ → oe ; espace insécable (et fine) → espace.
   Ainsi « fiche d'arrêt » tapé avec une apostrophe droite trouve « fiche d’arrêt » de la page. */
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’‘`´]/g, "'").replace(/œ/g, 'oe').replace(/[  ]/g, ' ');
/* forme compactée : sans espaces ni « + », pour que « ctrl k », « ctrl+k » et « Ctrl K » se retrouvent */
const compact = s => s.replace(/[\s+]/g, '');
function clearMarks() { document.querySelectorAll('mark.hit').forEach(m => m.replaceWith(m.textContent)); }
/* Surligne q (déjà normalisé) dans un nœud texte ; si rien n'est trouvé et que qc (compacté) est donné, cherche
   dans la forme compactée du texte et remonte aux positions d'origine (les caractères retirés sont des espaces / « + »). */
function hitsIn(txt, q, qc) {
  const low = norm(txt), hits = [];
  let i = low.indexOf(q);
  if (i >= 0) { while (i >= 0) { hits.push([i, i + q.length]); i = low.indexOf(q, i + q.length); } return hits; }
  if (!qc || qc === q) return hits;
  /* positions d'origine de chaque caractère gardé par compact() */
  const map = []; let c = '';
  for (let k = 0; k < low.length; k++) { const ch = low[k]; if (ch === '+' || /\s/.test(ch)) continue; map.push(k); c += ch; }
  let j = c.indexOf(qc);
  while (j >= 0) { hits.push([map[j], map[j + qc.length - 1] + 1]); j = c.indexOf(qc, j + qc.length); }
  return hits;
}
function markIn(el, q, qc) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement.closest('video, script, style, mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);
  let count = 0;
  for (const t of nodes) {
    const txt = t.nodeValue, hits = hitsIn(txt, q, qc); if (!hits.length) continue;
    const frag = document.createDocumentFragment(); let last = 0;
    for (const [a, b] of hits) {
      if (count >= 400 || a < last) break;
      frag.append(txt.slice(last, a)); const m = document.createElement('mark'); m.className = 'hit'; m.textContent = txt.slice(a, b); frag.append(m); last = b; count++;
    }
    frag.append(txt.slice(last)); t.replaceWith(frag);
  }
  return count;
}
function search() {
  const raw = input.value.trim();
  const q = norm(raw), qc = compact(q);
  clearMarks();
  if (clearBtn) clearBtn.hidden = !input.value;
  let shown = 0;
  for (const s of sections) {
    const txt = norm(s.textContent);
    const ok = q.length < 2 || txt.includes(q) || (qc.length >= 2 && compact(txt).includes(qc));
    s.hidden = !ok; if (ok) shown++;
    if (ok && q.length >= 2) markIn(s, q, qc.length >= 2 ? qc : '');
  }
  noRes.style.display = shown ? 'none' : 'block';
  if (countEl) {
    const word = raw;   /* espaces insécables à l'intérieur des guillemets */
    const msg = q.length < 2 ? '' : !shown ? 'Aucune section ne contient ce mot.'
      : shown + (shown > 1 ? ' sections contiennent' : ' section contient') + ' « ' + word + ' ».';
    if (countEl.textContent !== msg) countEl.textContent = msg;
  }
  links.forEach(a => { const s = document.getElementById(a.getAttribute('href').slice(1)); a.style.display = (s && s.closest('section') && s.closest('section').hidden) ? 'none' : ''; });
  /* un groupe du sommaire dont tous les liens sont masqués disparaît avec eux */
  document.querySelectorAll('.doc-side .grp').forEach(g => { g.hidden = ![...g.querySelectorAll('a')].some(a => a.style.display !== 'none'); });
}
function clearSearch(focus) { clearTimeout(timer); input.value = ''; search(); if (focus) input.focus(); }
if (clearBtn) clearBtn.addEventListener('click', () => clearSearch(true));
if (noResClear) noResClear.addEventListener('click', () => clearSearch(true));
/* Lien interne vers une section masquée par la recherche (raccourcis, sommaire, renvois dans le texte) :
   la recherche est vidée d'abord, puis le saut se fait normalement. */
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
  const id = decodeURIComponent(a.getAttribute('href').slice(1)); if (!id) return;
  const t = document.getElementById(id), s = t && t.closest('.doc-main > section');
  if (s && s.hidden) clearSearch(false);
});
let timer; input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 120); });
/* « / » met le curseur dans la recherche, sauf si l'on tape déjà dans un champ (input, textarea, select, zone modifiable) */
const typing = el => !!el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable);
addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== input && !typing(document.activeElement)) { e.preventDefault(); input.focus(); }
  if (e.key === 'Escape' && document.activeElement === input) { clearSearch(false); input.blur(); }
});
if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) setTimeout(() => el.scrollIntoView(), 50); }
