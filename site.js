/* ============================================================
   Alixo — pages du site (hors accueil). Vanilla, sans dépendance.
   Un seul rôle : le menu mobile de la navigation flottante (même logique que accueil.js).
   Le bouton #nav-burger et le volet #nav-sheet sont écrits dans la page (voir /tools/gabarit-nav-pied.html) :
   sans ce script, la barre et tous les liens du pied de page restent utilisables.
   Mode clair seul : ce script ne lit ni n'écrit aucune préférence de thème.
   ============================================================ */
(function () {
  'use strict';
  try {
    var nav = document.getElementById('nav'), burger = document.getElementById('nav-burger');
    if (!nav || !burger) return;
    var setNav = function (open) {
      nav.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    burger.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
    Array.prototype.forEach.call(document.querySelectorAll('#nav-sheet a'), function (a) {
      a.addEventListener('click', function () { setNav(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { setNav(false); burger.focus(); }
    });
    document.addEventListener('click', function (e) { if (nav.classList.contains('open') && !nav.contains(e.target)) setNav(false); });
  } catch (err) {
    if (window.console) console.error(err);
  }
})();
