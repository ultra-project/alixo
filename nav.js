/* alixoapp.com — menu mobile des pages annexes (documentation, versions, téléchargement, pages légales).
   Ajoute un bouton « menu » et un volet reprenant les liens de la barre ; la page d'accueil a le sien dans script.js. */
(function () {
  'use strict';
  var nav = document.getElementById('nav');
  if (!nav || document.getElementById('nav-burger')) return;
  var actions = nav.querySelector('.nav-actions'), links = nav.querySelector('.nav-links'), inner = nav.querySelector('.nav-inner');
  if (!actions || !links || !inner) return;
  var burger = document.createElement('button');
  burger.className = 'icon-btn nav-burger'; burger.id = 'nav-burger'; burger.type = 'button';
  burger.setAttribute('aria-label', 'Menu'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-controls', 'nav-sheet');
  burger.innerHTML = '<span></span><span></span><span></span>';
  actions.appendChild(burger);
  var sheet = document.createElement('nav');
  sheet.className = 'nav-sheet'; sheet.id = 'nav-sheet'; sheet.setAttribute('aria-label', 'Menu mobile');
  links.querySelectorAll('a').forEach(function (a) { sheet.appendChild(a.cloneNode(true)); });
  var login = actions.querySelector('.btn-login');
  if (login) { var l = document.createElement('a'); l.href = login.href; l.textContent = 'Se connecter'; sheet.appendChild(l); }
  inner.insertAdjacentElement('afterend', sheet);
  var setOpen = function (open) { nav.classList.toggle('open', open); burger.setAttribute('aria-expanded', open ? 'true' : 'false'); };
  burger.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
  sheet.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', function (e) { if (!nav.contains(e.target)) setOpen(false); });
})();
