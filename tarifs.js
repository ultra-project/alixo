/* ============================================================
   Alixo — Page Tarifs
   Apparition au défilement et bascule mensuel / annuel. Mode clair seul ; le menu mobile est dans /site.js.
   Chaque bloc vérifie ses éléments : la page reste utilisable si l'un manque.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Apparition au défilement (les barres du prix dégressif poussent avec) ----------
     Sans ce script, tout le contenu est visible : le masquage ne s'applique que sous html.js,
     classe posée ici, une fois les blocs déjà à l'écran marqués « in » (aucun clignotement au chargement).
     Le menu mobile est géré par /site.js. */
  const root = document.documentElement;
  const reveals = Array.from(document.querySelectorAll('.reveal'));
  const showAll = () => reveals.forEach(el => el.classList.add('in'));
  try {
    if ('IntersectionObserver' in window) {
      const vh = window.innerHeight || root.clientHeight;
      reveals.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) el.classList.add('in');
      });
      root.classList.add('js');
      const revealObs = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); }
        }
      }, { threshold: 0.08, rootMargin: '0px 0px -40px' });
      reveals.forEach(el => { if (!el.classList.contains('in')) revealObs.observe(el); });
      window.addEventListener('beforeprint', showAll);
    } else {
      showAll();
    }
  } catch (err) {
    root.classList.remove('js');
    showAll();
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

})();
