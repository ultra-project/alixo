/* ============================================================
   Alixo — Site vitrine (v4)
   Téléchargement direct, version et poids live (/releases-latest.json, repli /releases.json),
   macOS auto-détecté (le bouton Mac passe en tête dans le hero, la carte Mac est mise en avant),
   mobile détecté (le bouton principal ouvre l'application), thème, menu mobile,
   apparition au défilement, captures (onglets, alternance automatique, inclinaison 3D du cadre),
   halo au survol des cartes, Coco.
   Le site ne nomme jamais l'hébergement des fichiers : les pages /telecharger/… s'en chargent en arrière-plan.
   ============================================================ */

const DL_PAGE = { setup: '/telecharger/windows/', portable: '/telecharger/windows-portable/', mac: '/telecharger/mac/' };
let EXE_URL = null;       // adresse directe du fichier Windows (lue dans releases.json) ; sinon la page /telecharger/windows/ s'en charge
let MAC_URL_FILE = null;  // adresse directe du fichier Mac ; sinon la page /telecharger/mac/

/* html.lite : appareil faible détecté par le script du <head> (téléphone + peu de mémoire, économiseur de données, 2G ou peu de cœurs) */
const isLite = document.documentElement.classList.contains('lite');
const saveData = !!(navigator.connection && navigator.connection.saveData);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches || isLite;

/* ---------- Détection de la plateforme ---------- */
const isMac = /Macintosh/.test(navigator.userAgent) && !('ontouchend' in document);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchend' in document && innerWidth < 900);

/* ---------- Téléchargement direct ---------- */
const dlToast = document.getElementById('dl-toast');
const dlFallback = document.getElementById('dl-fallback');
let toastTimer;

/* Lance le téléchargement d'un fichier via un lien invisible, puis affiche le toast ;
   le lien de secours du toast pointe vers la page /telecharger/… de la plateforme. */
function triggerFile(url, fallbackPage, fallbackLabel) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (dlFallback) { dlFallback.href = fallbackPage; dlFallback.textContent = fallbackLabel; }
  dlToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dlToast.hidden = true; }, 8000);
}

function startDownload() {
  if (isMac) { location.href = DL_PAGE.mac; return; }
  if (!EXE_URL) { location.href = DL_PAGE.setup; return; }
  triggerFile(EXE_URL, DL_PAGE.setup, 'clique ici pour la version Windows');
}

function startMacDownload() {
  if (!MAC_URL_FILE) { location.href = DL_PAGE.mac; return; }
  triggerFile(MAC_URL_FILE, DL_PAGE.mac, 'clique ici pour la version Mac');
}

/* [data-download] ne vit que sur les deux boutons explicitement Windows (hero et carte Windows) */
document.querySelectorAll('[data-download]').forEach(el => {
  el.addEventListener('click', (e) => { e.preventDefault(); startDownload(); });
});
/* Boutons Mac (hero et carte) : téléchargement direct dès que l'adresse du fichier est connue */
['hero-mac', 'btn-mac'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (e) => { if (MAC_URL_FILE) { e.preventDefault(); startMacDownload(); } });
});
dlToast.querySelector('.dl-toast-close').addEventListener('click', () => {
  clearTimeout(toastTimer);
  dlToast.hidden = true;
});

/* ---------- macOS : dans le hero, le bouton Mac devient le bouton principal et passe en premier ; la carte Mac est mise en avant ---------- */
if (isMac) {
  const win = document.getElementById('hero-win');
  const mac = document.getElementById('hero-mac');
  if (win && mac) {
    win.classList.remove('primary'); win.classList.add('ghost');
    mac.classList.remove('ghost'); mac.classList.add('primary');
    mac.style.order = '-1';
  }
  const cardWin = document.querySelector('.dl-card.win');
  const cardMac = document.querySelector('.dl-card.mac');
  if (cardWin && cardMac) { cardWin.classList.remove('win'); cardMac.classList.add('win'); }
}

/* ---------- Mobile : pas de fichier à télécharger, le bouton principal ouvre l'application ---------- */
if (isMobile) {
  const win = document.getElementById('hero-win');
  const mac = document.getElementById('hero-mac');
  if (win) {
    const open = win.cloneNode(false);           /* clone sans enfants : l'écouteur de téléchargement ne suit pas */
    open.removeAttribute('data-download');
    open.href = 'https://alixoapp.com/docs/';
    open.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>Ouvrir Alixo sur ton téléphone';
    win.replaceWith(open);
  }
  if (mac) { mac.hidden = true; mac.style.display = 'none'; }   /* .btn est inline-flex : [hidden] seul ne suffit pas */
}

/* ---------- Version et poids (/releases-latest.json, repli sur /releases.json) ---------- */
const toMo = (bytes) => (bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1).replace('.', ',') + ' Mo';

/* releases-latest.json ne contient que version, date et installateurs (quelques centaines d'octets) ;
   releases.json, bien plus lourd (notes et historique), reste le repli si le petit fichier manque */
const fetchReleases = () => fetch('/releases-latest.json', { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .catch(() => fetch('/releases.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)));

fetchReleases()
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
      const mo = toMo(setup.size);
      document.querySelectorAll('.js-size').forEach(el => { el.textContent = mo; });
    }
    const mac = assets.mac;
    if (mac && mac.url) MAC_URL_FILE = mac.url;
    if (mac && mac.size) {
      /* le séparateur vit dans le span : rien ne traîne tant que le poids n'est pas connu */
      const mo = ' · ' + toMo(mac.size);
      ['mac-size', 'mac-size-hero'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = mo; });
    }
  })
  .catch(() => {});

/* ---------- Thème (déjà posé par le script inline du <head>) ---------- */
const root = document.documentElement;
if (!root.dataset.theme) {
  let saved = null; try { saved = localStorage.getItem('alixo-theme'); } catch (e) {}
  root.dataset.theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
/* Les captures de l'application suivent le thème du site : clair ↔ sombre.
   Chaque capture existe en 640, 1024 et 1600 px (img/shot-{clé}-{thème}-{largeur}.jpg) et en 2880 px (l'original) :
   src + srcset ne sont posés que sur la capture affichée (.on) et sur celles déjà chargées (data-loaded = thème),
   les autres sont chargées à la demande (showShot) ou en tâche de fond après le chargement de la page. */
const SHOT_WIDTHS = [640, 1024, 1600];
const shotReady = new Map();   /* img → { theme, promise } : promesse tenue quand la capture est décodée, ou après 1,5 s si elle est au moins chargée */
/* Tenue dès que l'image a fini de charger (pixels présents, ou échec : on bascule quand même pour ne pas rester bloqué) */
const shotLoaded = (img) => new Promise(resolve => {
  if (img.complete) return resolve();
  const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); resolve(); };
  img.addEventListener('load', done); img.addEventListener('error', done);
});
function loadShot(img) {
  const theme = root.dataset.theme === 'dark' ? 'dark' : 'light';
  const cur = shotReady.get(img);
  if (cur && cur.theme === theme) return cur.promise;
  const base = img.dataset.base + '-' + theme;
  /* srcset avant src : le navigateur choisit le candidat en une fois (src seul = repli sans srcset, ou cas du HTML sans JS) */
  img.setAttribute('srcset', SHOT_WIDTHS.map(w => `${base}-${w}.jpg ${w}w`).join(', ') + `, ${base}.jpg 2880w`);
  img.setAttribute('src', base + '-1024.jpg');
  img.dataset.loaded = theme;
  const decoded = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
  /* plafond de 1,5 s pour le décodage, mais jamais de bascule vers une image encore vide : on attend au moins load (ou error) */
  const capped = new Promise(r => setTimeout(r, 1500)).then(() => shotLoaded(img));
  const promise = Promise.race([decoded, capped]);
  shotReady.set(img, { theme, promise });
  return promise;
}
function applyThemeImages() {
  document.querySelectorAll('img.timg').forEach(img => {
    if (img.classList.contains('on') || img.dataset.loaded) loadShot(img);
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
  seance: "Séance de cours — plan I. A. 1. a., encadré définition, fiche d'arrêt",
  sheet: 'Tableur — formules, SOMME, graphique de la sélection',
  board: 'Planche — post-it, zones, flèches sur un tableau blanc infini',
  quiz: 'Quiz — questions à glisser, test en solo et présentation en direct',
  slides: 'Présentation — diapositives dans le style de tes cours',
};
const shotTabs = [...document.querySelectorAll('.shots-tab')];
const shotImgs = [...document.querySelectorAll('.shot')];
const shotTitle = document.getElementById('shots-title');
/* Précharge la capture qui suit `key` dans l'ordre des onglets (alternance automatique ou clic suivant) */
const preloadNextShot = (key) => {
  const i = shotTabs.findIndex(t => t.dataset.shot === key);
  const next = shotImgs.find(img => img.dataset.shot === shotTabs[(i + 1) % shotTabs.length].dataset.shot);
  if (next) loadShot(next);
};
let showSeq = 0;
function showShot(key) {
  const seq = ++showSeq;
  shotTabs.forEach(t => { const on = t.dataset.shot === key; t.classList.toggle('active', on); t.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  const target = shotImgs.find(i => i.dataset.shot === key);
  /* la capture est chargée et décodée avant la bascule (1,5 s au plus) : le fond de la scène ne se voit jamais */
  (target ? loadShot(target) : Promise.resolve()).then(() => {
    if (seq !== showSeq) return;   /* un autre onglet a été choisi entre-temps */
    shotImgs.forEach(i => { const on = i.dataset.shot === key; i.classList.toggle('on', on); i.setAttribute('aria-hidden', on ? 'false' : 'true'); });
    shotTitle.textContent = SHOT_TITLES[key] || '';
    preloadNextShot(key);
  });
}
shotTabs.forEach(t => {
  t.addEventListener('click', () => showShot(t.dataset.shot));
  /* préchargement dès l'intention (doigt posé, focus clavier) : la capture est souvent déjà là au clic */
  const warm = () => { const img = shotImgs.find(i => i.dataset.shot === t.dataset.shot); if (img) loadShot(img); };
  t.addEventListener('pointerdown', warm, { passive: true });
  t.addEventListener('focus', warm);
});
/* Première capture affichée : la suivante est préchargée ; les autres suivent en tâche de fond une fois la page chargée,
   sauf sur appareil faible ou avec l'économiseur de données */
const firstShot = shotImgs.find(i => i.classList.contains('on'));
if (firstShot) loadShot(firstShot).then(() => preloadNextShot(firstShot.dataset.shot));
if (!isLite && !saveData) {
  const preloadRest = () => {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    idle(() => shotImgs.forEach(img => loadShot(img)));
  };
  if (document.readyState === 'complete') preloadRest();
  else window.addEventListener('load', preloadRest, { once: true });
}

/* Alternance automatique : pas en mouvement réduit ; suspendue tant que la souris ou le focus est sur les captures ; stoppée au premier clic sur un onglet */
const demoStage = document.getElementById('demo');
let autoSwap = null;
const nextShot = () => {
  const r = demoStage.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const i = shotTabs.findIndex(t => t.classList.contains('active'));
  showShot(shotTabs[(i + 1) % shotTabs.length].dataset.shot);
};
let autoStopped = reduceMotion;
const autoStart = () => { if (!autoStopped && autoSwap === null) autoSwap = setInterval(nextShot, 7000); };
const autoPause = () => { clearInterval(autoSwap); autoSwap = null; };
autoStart();
demoStage.addEventListener('pointerenter', autoPause);
demoStage.addEventListener('focusin', autoPause);
demoStage.addEventListener('pointerleave', autoStart);
demoStage.addEventListener('focusout', (e) => { if (!demoStage.contains(e.relatedTarget)) autoStart(); });
document.querySelector('.shots-tabs').addEventListener('click', () => { autoStopped = true; autoPause(); }, { once: true });

/* Le cadre est incliné en haut de page et se redresse en arrivant au centre de l'écran */
const frame = document.getElementById('shots-frame');
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
    if (cocoCalm.matches || isLite) { cocoTyped.textContent = COCO_MSG; typed(); return; }
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
