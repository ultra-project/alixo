/* ============================================================
   Alixo — Page Tarifs
   Thème, navigation (fond au défilement, menu mobile), apparition au défilement,
   bascule mensuel / annuel, et Coco assis sur la carte Alixo+ qui parle au survol.
   Chaque bloc vérifie ses éléments : la page reste utilisable si l'un manque.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Thème (déjà posé par le script inline du <head>) ---------- */
  const root = document.documentElement;
  if (!root.dataset.theme) {
    let saved = null; try { saved = localStorage.getItem('alixo-theme'); } catch (e) {}
    root.dataset.theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  const btnTheme = document.getElementById('btn-theme');
  if (btnTheme) btnTheme.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('alixo-theme', next); } catch (e) {}
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let saved = null; try { saved = localStorage.getItem('alixo-theme'); } catch (err) {}
    if (!saved) root.dataset.theme = e.matches ? 'dark' : 'light';
  });

  /* ---------- Nav : fond au défilement, menu mobile ---------- */
  const nav = document.getElementById('nav');
  if (nav) {
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
  }

  /* ---------- Apparition au défilement (les barres du prix dégressif poussent avec) ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const revealObs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -40px' });
    reveals.forEach(el => revealObs.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('in'));
  }

  /* ---------- Bascule mensuel / annuel ----------
     Groupe de boutons radio : clic, ou flèches / Début / Fin au clavier (un seul arrêt de tabulation).
     Elle change le prix de la carte Alixo+ et la grille mise en avant dans « Plus tu restes, moins tu paies ». */
  const opts = Array.from(document.querySelectorAll('.tf-switch-opt'));
  const prices = Array.from(document.querySelectorAll('.tf-price'));
  const degressif = document.getElementById('degressif');
  const priceLive = document.getElementById('tf-price-live');
  const ctaBilling = document.getElementById('tf-cta-billing');   /* « Passer à Alixo+ mensuel / annuel » */
  const PRICE_SAY = {
    monthly: "Alixo+ au mensuel : 14,99 € par mois, puis de moins en moins cher, jusqu'à 9,99 € par mois.",
    annual: "Alixo+ à l'année : 149,99 € par an, soit 12,50 € par mois, puis de moins en moins cher, jusqu'à 99,99 € par an.",
  };
  const setBilling = (billing, announce) => {
    if (!PRICE_SAY[billing]) return;
    opts.forEach(o => {
      const on = o.dataset.billing === billing;
      o.classList.toggle('is-on', on);
      o.setAttribute('aria-checked', on ? 'true' : 'false');
      o.tabIndex = on ? 0 : -1;
    });
    prices.forEach(p => p.classList.toggle('is-on', p.dataset.billing === billing));
    if (degressif) degressif.dataset.billingView = billing;
    if (ctaBilling) ctaBilling.textContent = billing === 'annual' ? 'annuel' : 'mensuel';
    if (announce && priceLive) priceLive.textContent = PRICE_SAY[billing];
  };
  if (opts.length) {
    opts.forEach(o => o.addEventListener('click', () => setBilling(o.dataset.billing, true)));
    const group = opts[0].parentElement;
    group.addEventListener('keydown', (e) => {
      const i = opts.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % opts.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + opts.length) % opts.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = opts.length - 1;
      if (j < 0) return;
      e.preventDefault();
      opts[j].focus();
      setBilling(opts[j].dataset.billing, true);
    });
  }

  /* ---------- Coco, assis sur la carte Alixo+ ----------
     Survol de la carte à la souris, focus clavier dans la carte, ou tap : Coco sursaute et tape sa phrase
     dans une bulle terminal (mêmes classes que la bulle de l'accueil). Plusieurs raisons peuvent le faire
     parler (survol, focus, tap) : il se tait quand il n'en reste aucune, après un petit délai de grâce. */
  const coco = document.getElementById('tf-coco');
  const card = document.getElementById('tf-plus');
  if (coco && card) {
    const typedEl = coco.querySelector('.coco-typed');
    const live = document.getElementById('tf-coco-live');
    const MSG = "Alixo+ n'attend plus que toi 😝";
    /* découpe en graphèmes : l'emoji s'affiche entier, jamais à moitié */
    const CHARS = (typeof Intl !== 'undefined' && Intl.Segmenter)
      ? Array.from(new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(MSG), s => s.segment)
      : Array.from(MSG);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reasons = new Set();
    let typeTimer, autoTimer, hoverTimer, focusTimer, announced = false, typing = false;

    /* En tactile, rien ne « quitte » la carte : Coco se tait de lui-même 5 s après avoir fini sa phrase */
    const typed = () => {
      typing = false;
      clearTimeout(autoTimer);
      if (reasons.has('tap')) autoTimer = setTimeout(() => { reasons.delete('tap'); update(); }, 5000);
    };
    const typeFrom = (i) => {
      if (typedEl) typedEl.textContent = CHARS.slice(0, i).join('');
      if (i >= CHARS.length) { typed(); return; }
      typeTimer = setTimeout(() => typeFrom(i + 1), 42);
    };
    const start = () => {
      coco.classList.add('is-talking');
      if (live && !announced) { live.textContent = MSG; announced = true; }   /* annoncé une seule fois, en entier */
      clearTimeout(typeTimer); clearTimeout(autoTimer);
      if (calm.matches) { if (typedEl) typedEl.textContent = MSG; typed(); return; }
      typing = true;
      if (typedEl) typedEl.textContent = '';
      typeTimer = setTimeout(() => typeFrom(1), 260);
    };
    const stop = () => {
      clearTimeout(typeTimer); clearTimeout(autoTimer);
      typing = false;
      coco.classList.remove('is-talking');               /* la bulle s'efface avec le texte figé ; remis à zéro au prochain survol */
    };
    const update = () => {
      const on = reasons.size > 0;
      if (on === coco.classList.contains('is-talking')) return;
      if (on) start(); else stop();
    };

    /* Souris : entrée immédiate, délai de grâce de 300 ms en sortant */
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer);
      reasons.add('hover'); update();
    });
    card.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => { reasons.delete('hover'); update(); }, 300);
    });
    /* Clavier : tant que le focus est dans la carte (bouton, lien des CGV) */
    card.addEventListener('focusin', () => { clearTimeout(focusTimer); reasons.add('focus'); update(); });
    card.addEventListener('focusout', (e) => {
      if (e.relatedTarget && card.contains(e.relatedTarget)) return;
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => { reasons.delete('focus'); update(); }, 300);
    });
    /* Tactile : un tap sur la carte le fait parler ; un tap ailleurs le fait taire */
    card.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      if (reasons.has('tap') && !typing) { typed(); return; }   /* déjà dit : il reste encore 5 s */
      reasons.add('tap'); update();
    });
    document.addEventListener('pointerdown', (e) => {
      if (reasons.has('tap') && !card.contains(e.target)) { reasons.delete('tap'); update(); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && reasons.size) { reasons.clear(); update(); }
    });
  }
})();
