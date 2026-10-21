/* ============================================================
   Alixo — Site vitrine (v3)
   Téléchargement direct, version live, macOS auto-détecté, thème,
   menu mobile, apparition au défilement, compteurs, captures,
   inclinaison 3D du cadre, halo au survol des cartes,
   changelog live depuis /releases.json (généré à chaque publication).
   Le site ne nomme jamais l'hébergement des fichiers : les pages /telecharger/… s'en chargent en arrière-plan.
   ============================================================ */

const DL_PAGE = { setup: '/telecharger/windows/', portable: '/telecharger/windows-portable/', mac: '/telecharger/mac/' };
const MAC_URL = DL_PAGE.mac;
let EXE_URL = null;   // adresse directe du fichier (lue dans releases.json) ; sinon la page /telecharger/windows/ s'en charge

/* ---------- Téléchargement direct ---------- */
const dlToast = document.getElementById('dl-toast');
let toastTimer;

function startDownload() {
  if (!EXE_URL) { location.href = DL_PAGE.setup; return; }
  const a = document.createElement('a');
  a.href = EXE_URL;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  dlToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dlToast.hidden = true; }, 8000);
}

document.querySelectorAll('[data-download]').forEach(el => {
  el.addEventListener('click', (e) => { e.preventDefault(); startDownload(); });
});
dlToast.querySelector('.dl-toast-close').addEventListener('click', () => {
  clearTimeout(toastTimer);
  dlToast.hidden = true;
});

/* ---------- Détection macOS ---------- */
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '') || /Macintosh/.test(navigator.userAgent);
if (isMac) {
  const n = document.getElementById('mac-notice');
  if (n) n.hidden = false;
}

/* ---------- Version, poids, portable, macOS, changelog (/releases.json) ---------- */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Rendu markdown minimal et sûr (texte échappé avant tout) */
function renderNotes(md) {
  /* les notes sont écrites à 120 colonnes : une ligne qui ne commence ni par « - », ni par « # », continue la précédente */
  const lines = [];
  for (const raw of md.replace(/\r/g, '').replace(/```\w*/g, '').split('\n')) {
    const t = raw.trim();
    if (t && lines.length && lines[lines.length - 1] && !/^([-*#▶]|\d+\.)/.test(t) && /^[-*]\s/.test(lines[lines.length - 1])) lines[lines.length - 1] += ' ' + t;
    else lines.push(t);
  }
  let html = '', inList = false, count = 0;
  const inline = (t) => escapeHtml(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (let raw of lines) {
    let line = raw.trim();
    if (!line) { closeList(); continue; }
    if (/^mise à jour automatique/i.test(line)) continue;        /* ligne technique */
    if (/^▶/.test(line)) continue;                                /* lien vidéo : déjà dans l'application */
    line = line.replace(/^(-\s+)+/, '- ');                        /* "- - item" → "- item" */
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) { closeList(); html += `<h4>${inline(h[1])}</h4>`; continue; }
    const li = line.match(/^[-*]\s+(.*)/);
    if (li) {
      if (count >= 8) continue;
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(li[1])}</li>`; count++; continue;
    }
    closeList();
    if (count === 0 && !html) { html += `<h4>${inline(line)}</h4>`; continue; } /* première ligne = titre */
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

fetch('/releases.json', { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : null))
  .then(rel => {
    if (!rel) return;
    const assets = rel.assets || {};

    if (rel.version) {
      const v = 'v' + rel.version;
      document.querySelectorAll('.js-version').forEach(el => { el.textContent = v; });
    }
    const setup = assets.setup;
    if (setup && setup.url) EXE_URL = setup.url;
    if (setup && setup.size) {
      const mo = (setup.size / 1048576).toFixed(setup.size > 104857600 ? 0 : 1).replace('.', ',');
      document.querySelectorAll('.js-size').forEach(el => { el.textContent = mo + ' Mo'; });
    }

    /* Le jour où un .dmg apparaît dans la version publiée, tout ce qui dit « bientôt » passe à « disponible ». */
    const mac = assets.mac;
    if (mac) {
      const card = document.getElementById('dl-mac');
      const btn = document.getElementById('btn-mac');
      card.classList.add('available');
      btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 19h16"/></svg> Télécharger Alixo-Mac.dmg';
      btn.classList.remove('ghost'); btn.classList.add('primary');
      btn.href = MAC_URL; btn.removeAttribute('target'); btn.removeAttribute('rel');
      const tag = card.querySelector('.dl-soon-tag');
      if (tag) { tag.textContent = 'Disponible · macOS 12 et plus'; }
      const txt = card.querySelector('.dl-mac-txt');
      if (txt) txt.textContent = 'Même application, mêmes fonctionnalités, même compte : tes cours pris sur Windows ou sur le web sont déjà là.';
      const meta = document.getElementById('mac-meta');
      if (meta) { meta.hidden = false; const s = document.getElementById('mac-size'); if (s && mac.size) s.textContent = (mac.size / 1048576).toFixed(0) + ' Mo'; }
      const hint = document.getElementById('mac-hint');
      if (hint) hint.hidden = false;

      /* Hero, pastille, CTA, FAQ, pied de page */
      const heroMac = document.getElementById('hero-mac');
      if (heroMac) { heroMac.href = MAC_URL; heroMac.setAttribute('aria-label', 'Télécharger pour macOS'); heroMac.classList.add('mac-ready'); }
      document.querySelectorAll('.soon-badge').forEach(el => { el.textContent = 'Disponible'; el.classList.add('ok'); });
      document.querySelectorAll('.cta-mac').forEach(el => { el.innerHTML = '<a href="' + MAC_URL + '">ou pour macOS →</a>'; });
      const pill = document.getElementById('pill-mac');
      if (pill) pill.textContent = 'macOS disponible';
      const notice = document.getElementById('mac-notice');
      if (notice) { notice.innerHTML = 'La version macOS est disponible. <a href="' + MAC_URL + '">Télécharger Alixo pour Mac →</a>'; if (isMac) notice.hidden = false; }
      const faqQ = document.getElementById('faq-mac-q'), faqA = document.getElementById('faq-mac-a');
      if (faqQ && faqA) {
        faqQ.textContent = 'Alixo existe sur Mac ?';
        faqA.innerHTML = 'Oui : une application universelle (Apple Silicon et Intel), avec le même compte et les mêmes cours que sur Windows et sur le web. <a href="' + MAC_URL + '">Télécharge Alixo-Mac.dmg</a>, glisse Alixo dans Applications, puis au premier lancement autorise l\'ouverture une fois dans Réglages Système › Confidentialité et sécurité › « Ouvrir quand même » (l\'application n\'est pas encore signée par Apple) : <a href="' + MAC_URL + '">le mode d\'emploi en trois étapes</a>. Les nouvelles versions sont signalées dans l\'application.';
      }
      const foot = document.getElementById('foot-copy');
      if (foot) foot.textContent = '© 2026 Alixo · Windows, macOS et web.';
      document.title = document.title.replace('Bientôt sur macOS', 'Aussi sur macOS');

      /* Sur Mac, le bouton principal du hero propose directement la version Mac */
      if (isMac) {
        const main = document.querySelector('.hero-ctas .btn.primary');
        if (main) {
          main.removeAttribute('data-download');
          main.href = MAC_URL;
          main.innerHTML = '<svg class="apple-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M16.4 12.7c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8 2.1-1.2 2.9-2.4c.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.8ZM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.8-1.4Z"/></svg> Télécharger pour macOS <small class="btn-meta">Gratuit' + (mac.size ? ' · ' + (mac.size / 1048576).toFixed(0) + ' Mo' : '') + '</small>';
          const clone = main.cloneNode(true); main.replaceWith(clone);   /* retire l'écouteur data-download */
        }
        if (heroMac) {
          heroMac.href = '#telecharger'; heroMac.setAttribute('data-download', '');
          heroMac.innerHTML = '<svg class="win-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M3 5.1 10.6 4v7.6H3V5.1Zm0 13.8L10.6 20v-7.5H3v6.4ZM11.6 3.9 21 2.5v9.1h-9.4V3.9Zm0 16.2L21 21.5v-9h-9.4v7.6Z"/></svg> Windows';
          heroMac.addEventListener('click', (e) => { e.preventDefault(); startDownload(); });
        }
      }
    }

    /* Changelog */
    if (rel.notes) {
      const body = document.getElementById('cl-body');
      const html = renderNotes(rel.notes);
      if (body && html) body.innerHTML = html;
    }
    if (rel.date) {
      const d = new Date(rel.date);
      const el = document.getElementById('cl-date');
      if (el) el.textContent = 'Publiée le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  })
  .catch(() => {});

/* ---------- Thème (déjà posé par le script inline du <head>) ---------- */
const root = document.documentElement;
if (!root.dataset.theme) {
  let saved = null; try { saved = localStorage.getItem('alixo-theme'); } catch (e) {}
  root.dataset.theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
/* Les captures de l'application suivent le thème du site : clair ↔ sombre */
function applyThemeImages() {
  const dark = root.dataset.theme === 'dark';
  document.querySelectorAll('img.timg').forEach(img => {
    const want = dark ? img.dataset.dark : img.dataset.light;
    if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
  });
}
applyThemeImages();
document.getElementById('btn-theme').addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('alixo-theme', next); } catch (e) {}
  applyThemeImages();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let saved = null; try { saved = localStorage.getItem('alixo-theme'); } catch (err) {}
  if (saved) return;
  root.dataset.theme = e.matches ? 'dark' : 'light';
  applyThemeImages();
});

/* ---------- Nav : fond au défilement, menu mobile ---------- */
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const burger = document.getElementById('nav-burger');
if (burger) {
  const setOpen = (open) => { nav.classList.toggle('open', open); burger.setAttribute('aria-expanded', open ? 'true' : 'false'); };
  burger.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  document.querySelectorAll('.nav-sheet a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) setOpen(false); });
}

/* ---------- Apparition au défilement ---------- */
const revealObs = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); }
  }
}, { threshold: 0.08, rootMargin: '0px 0px -40px' });
document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

/* ---------- Compteurs ---------- */
const countObs = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    countObs.unobserve(e.target);
    const el = e.target;
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || '';
    if (target === 0) { el.textContent = '0' + suffix; continue; }
    const t0 = performance.now(), dur = 1100;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}, { threshold: 0.5 });
document.querySelectorAll('.stat-n').forEach(el => countObs.observe(el));

/* ---------- Halo au survol des cartes (position de la souris → variables CSS) ---------- */
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  });
});

/* ============================================================
   Captures réelles — onglets, alternance automatique, inclinaison 3D
   ============================================================ */
const SHOT_TITLES = {
  droit: "Droit des obligations — fiche d'arrêt, définition, références Légifrance",
  eco: 'Macroéconomie — formules rendues et graphique IS-LM',
  quiz: 'Quiz — dix types de questions à glisser, test et présentation en direct',
  board: 'Planche — post-it, formes, zones et flèches sur un tableau blanc infini',
  sheet: 'Tableur — formules, SOMME, graphique de la sélection',
  galaxy: 'Bibliothèque — vue Galaxie de tes dossiers et séances',
  slides: 'Présentations — blocs à glisser-déposer, thèmes, notes',
  agenda: 'Agenda — tes cours du mois, événement en cours dans la barre',
  search: 'Recherche universelle — Ctrl+K dans tous les cours et fichiers',
};
const shotTabs = [...document.querySelectorAll('.shots-tab')];
const shotImgs = [...document.querySelectorAll('.shot')];
const shotTitle = document.getElementById('shots-title');
function showShot(key) {
  shotTabs.forEach(t => { const on = t.dataset.shot === key; t.classList.toggle('active', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
  shotImgs.forEach(i => i.classList.toggle('on', i.dataset.shot === key));
  shotTitle.textContent = SHOT_TITLES[key] || '';
}
shotTabs.forEach(t => t.addEventListener('click', () => showShot(t.dataset.shot)));

let autoSwap = setInterval(() => {
  const stage = document.getElementById('demo');
  const r = stage.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const i = shotTabs.findIndex(t => t.classList.contains('active'));
  showShot(shotTabs[(i + 1) % shotTabs.length].dataset.shot);
}, 7000);
document.querySelector('.shots-tabs').addEventListener('click', () => clearInterval(autoSwap), { once: true });

/* Le cadre est incliné en haut de page et se redresse en arrivant au centre de l'écran */
const frame = document.getElementById('shots-frame');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (frame && !reduceMotion && window.matchMedia('(min-width: 641px)').matches) {
  let ticking = false;
  const tilt = () => {
    ticking = false;
    const r = frame.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, 1 - (r.top - window.innerHeight * 0.15) / (window.innerHeight * 0.55)));
    frame.style.setProperty('--tilt', ((1 - p) * 10).toFixed(2) + 'deg');
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(tilt); } }, { passive: true });
  window.addEventListener('resize', tilt);
  tilt();
}

/* ---------- Coco, le compagnon ---------- */
/* Au repos, Coco pend sous la nav (seuls ses pieds dépassent). Survol à la souris, focus au clavier ou tap :
   il descend en rappel ; une fois en bas, il dit bonjour dans une bulle terminal tapée caractère par caractère.
   Plusieurs raisons peuvent le garder en bas (survol, focus, tap) : il remonte quand il n'en reste aucune. */
const coco = document.getElementById('coco');
if (coco) {
  const cocoBtn = coco.querySelector('.coco-btn');
  const cocoRig = coco.querySelector('.coco-rig');
  const cocoTyped = coco.querySelector('.coco-typed');
  const cocoLive = document.getElementById('coco-live');
  const COCO_MSG = "Salut moi c'est coco, ton compagnon pour tes cours !";
  const cocoCalm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reasons = new Set();
  let arriveTimer, enterTimer, leaveTimer, typeTimer, autoUpTimer, lastPointer = '';

  /* durée de la descente, lue dans le CSS (elle change avec prefers-reduced-motion) */
  const descentMs = () => {
    const d = (getComputedStyle(cocoRig).transitionDuration || '0s').split(',')[0].trim();
    return parseFloat(d) * (d.endsWith('ms') ? 1 : 1000) || 0;
  };
  /* En tactile, rien ne « quitte » Coco : il remonte de lui-même 5 s après avoir fini sa phrase */
  const typed = () => {
    clearTimeout(autoUpTimer);
    if (reasons.has('tap')) autoUpTimer = setTimeout(() => { reasons.delete('tap'); update(); }, 5000);
  };
  const typeFrom = (i) => {
    cocoTyped.textContent = COCO_MSG.slice(0, i);
    if (i >= COCO_MSG.length) { typed(); return; }
    typeTimer = setTimeout(() => typeFrom(i + 1), COCO_MSG[i - 1] === ',' ? 220 : 34);   /* petite pause après la virgule */
  };
  const arrive = () => {
    if (!coco.classList.contains('is-down')) return;
    coco.classList.add('is-arrived');
    cocoLive.textContent = COCO_MSG;                   /* annoncé une seule fois, en entier */
    clearTimeout(typeTimer); clearTimeout(autoUpTimer);
    if (cocoCalm.matches) { cocoTyped.textContent = COCO_MSG; typed(); return; }
    cocoTyped.textContent = '';
    typeTimer = setTimeout(() => typeFrom(1), 220);
  };
  const update = () => {
    const down = reasons.size > 0;
    if (down === coco.classList.contains('is-down')) return;
    clearTimeout(arriveTimer); clearTimeout(autoUpTimer);
    if (down) {
      coco.classList.add('is-down');
      arriveTimer = setTimeout(arrive, descentMs() + 40);
    } else {
      clearTimeout(typeTimer);                          /* la bulle s'efface avec le texte figé ; remis à zéro à la prochaine arrivée */
      coco.classList.remove('is-down', 'is-arrived');
      cocoLive.textContent = '';
    }
  };
  const toggle = (why) => { if (reasons.has(why)) reasons.delete(why); else reasons.add(why); update(); };
  /* Déjà en bas : il redit bonjour (la phrase est retapée et annoncée à nouveau) */
  const replay = () => {
    if (!coco.classList.contains('is-arrived')) return;
    arrive();
    cocoLive.textContent = '';                         /* vidée puis remplie : la région live annonce de nouveau */
    setTimeout(() => { if (coco.classList.contains('is-arrived')) cocoLive.textContent = COCO_MSG; }, 60);
  };

  /* Souris : petit délai d'intention avant de descendre (on ne fait que passer en quittant la nav),
     la zone sensible (pieds, puis corps et corde) suit Coco, délai de grâce en sortant */
  cocoRig.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(leaveTimer); clearTimeout(enterTimer);
    if (coco.classList.contains('is-down')) { reasons.add('hover'); update(); return; }
    enterTimer = setTimeout(() => { reasons.add('hover'); update(); }, 200);
  });
  cocoRig.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(leaveTimer); clearTimeout(enterTimer);
    leaveTimer = setTimeout(() => { reasons.delete('hover'); update(); }, 400);
  });
  cocoRig.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });

  /* Tactile : un tap le fait descendre, un autre (sur lui, sa bulle ou ailleurs) le fait remonter.
     Clavier (Entrée / Espace) et clic souris : le fait descendre, ou lui fait redire bonjour s'il est déjà en bas.
     Échap le fait remonter. */
  cocoBtn.addEventListener('click', (e) => {
    if (lastPointer === 'touch' || lastPointer === 'pen') toggle('tap');
    else if (coco.classList.contains('is-down')) replay();
    else { reasons.add(e.detail === 0 ? 'focus' : 'hover'); update(); }
    lastPointer = '';
  });
  document.addEventListener('pointerdown', (e) => {
    if (reasons.has('tap') && !cocoBtn.contains(e.target)) { reasons.delete('tap'); update(); }
  });
  cocoBtn.addEventListener('focus', () => {
    let kb = true; try { kb = cocoBtn.matches(':focus-visible'); } catch (err) {}   /* focus clavier seulement */
    if (kb) { reasons.add('focus'); update(); }
  });
  cocoBtn.addEventListener('blur', () => { reasons.delete('focus'); update(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && reasons.size) { reasons.clear(); update(); }
  });
  /* Le menu mobile passe devant : Coco remonte (et le CSS le masque tant que le menu est ouvert) */
  const cocoBurger = document.getElementById('nav-burger');
  if (cocoBurger) cocoBurger.addEventListener('click', () => { reasons.clear(); update(); });
}
