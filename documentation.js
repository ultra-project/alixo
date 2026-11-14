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
const seen = new Set();
const spy = new IntersectionObserver(entries => {
  for (const e of entries) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); }
  const top = targets.find(t => seen.has(t) && !t.hidden);
  if (top) current = top.id;
  if (!current) return;
  links.forEach(a => {
    const on = a.getAttribute('href') === '#' + current;
    a.classList.toggle('on', on);
    if (on) { a.setAttribute('aria-current', 'location'); reveal(a); } else a.removeAttribute('aria-current');
  });
}, { rootMargin: '-112px 0px -70% 0px', threshold: 0 });
targets.forEach(t => spy.observe(t));

/* Sommaire : groupes repliables (clic ou Entrée / Espace sur le titre du groupe) */
document.querySelectorAll('.doc-side .grp').forEach(g => {
  const t = g.querySelector('.grp-t'); if (!t) return;
  t.setAttribute('role', 'button'); t.tabIndex = 0; t.setAttribute('aria-expanded', 'true');
  const flip = () => t.setAttribute('aria-expanded', g.classList.toggle('closed') ? 'false' : 'true');
  t.addEventListener('click', flip);
  t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
});

/* Sommaire repliable sur téléphone */
const toggle = document.querySelector('.doc-side-toggle');
const setSide = open => { side.classList.toggle('open', open); if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); };
if (toggle) toggle.addEventListener('click', () => setSide(!side.classList.contains('open')));
links.forEach(a => a.addEventListener('click', () => setSide(false)));

/* Recherche dans la page : filtre les sections, surligne les mots */
const input = document.getElementById('doc-q');
const sections = [...document.querySelectorAll('.doc-main > section')];
const noRes = document.getElementById('doc-noresult');
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function clearMarks() { document.querySelectorAll('mark.hit').forEach(m => m.replaceWith(m.textContent)); }
function markIn(el, q) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement.closest('video, script, style, mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);
  let count = 0;
  for (const t of nodes) {
    const txt = t.nodeValue, low = norm(txt); let i = low.indexOf(q); if (i < 0) continue;
    const frag = document.createDocumentFragment(); let last = 0;
    while (i >= 0 && count < 400) { frag.append(txt.slice(last, i)); const m = document.createElement('mark'); m.className = 'hit'; m.textContent = txt.slice(i, i + q.length); frag.append(m); last = i + q.length; i = low.indexOf(q, last); count++; }
    frag.append(txt.slice(last)); t.replaceWith(frag);
  }
  return count;
}
function search() {
  const q = norm(input.value.trim());
  clearMarks();
  let shown = 0;
  for (const s of sections) {
    const ok = q.length < 2 || norm(s.textContent).includes(q);
    s.hidden = !ok; if (ok) shown++;
    if (ok && q.length >= 2) markIn(s, q);
  }
  noRes.style.display = shown ? 'none' : 'block';
  links.forEach(a => { const s = document.getElementById(a.getAttribute('href').slice(1)); a.style.display = (s && s.closest('section') && s.closest('section').hidden) ? 'none' : ''; });
  /* un groupe du sommaire dont tous les liens sont masqués disparaît avec eux */
  document.querySelectorAll('.doc-side .grp').forEach(g => { g.hidden = ![...g.querySelectorAll('a')].some(a => a.style.display !== 'none'); });
}
let timer; input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 120); });
addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== input && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); } if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; search(); input.blur(); } });
if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) setTimeout(() => el.scrollIntoView(), 50); }
