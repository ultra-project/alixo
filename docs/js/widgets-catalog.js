/* ============================================================
   Alixo 1.31 — catalogue des widgets de bureau
   Partagé entre l'application (js/widgets.js : Paramètres › Widgets, données) et la page d'un widget
   (widget.html + js/widget.js). Chaque widget : clé, nom, description, taille réelle en pixels sur le bureau,
   icône (SVG, trait = couleur d'accent) et couleur de l'étiquette dans le faux bureau.
   ============================================================ */
'use strict';

window.ALIXO_WIDGETS = [
  { k: 'taches', name: 'Tâches du jour', sub: 'Les tâches d’aujourd’hui et en retard, à cocher depuis le bureau. Une ligne pour en ajouter.',
    w: 300, h: 340, color: '#2e8b6a',
    ico: '<svg viewBox="0 0 24 24"><path d="M4 7h3M4 12h3M4 17h3"/><path d="M10 7h10M10 12h10M10 17h10"/><path d="m4.5 6.3.8.9L7 5.5" stroke-width="1.4"/></svg>' },
  { k: 'agenda', name: 'Agenda du jour', sub: 'Le cours en cours et le temps qu’il reste, puis la suite de la journée. Demain quand la journée est finie.',
    w: 300, h: 300, color: '#33658a',
    ico: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h3v3H8z" fill="currentColor" stroke="none"/></svg>' },
  { k: 'minuteur', name: 'Minuteur', sub: 'Compte à rebours de révision (25 min, 5 min, 45 min…), le même que celui de l’application.',
    w: 260, h: 210, color: '#c04343',
    ico: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/></svg>' },
  { k: 'jourj', name: 'Jour J', sub: 'Le compte à rebours avant votre prochain partiel ou examen : jours restants en grand.',
    w: 260, h: 170, color: '#8a4b9c',
    ico: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M12 13v5M9.5 15.5h5" stroke-width="2"/></svg>' },
  { k: 'bilan', name: 'Bilan de la semaine', sub: 'Mots écrits cette semaine, jours d’affilée, séances touchées, avec un petit graphique par jour.',
    w: 300, h: 240, color: '#3d6bb5',
    ico: '<svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M6 17v-5M10 17V8M14 17v-3M18 17V5" stroke-width="2.4"/></svg>' },
  { k: 'reprendre', name: 'Reprendre', sub: 'Vos cinq dernières séances, un clic pour les rouvrir dans Alixo.',
    w: 300, h: 260, color: '#b3762a',
    ico: '<svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 1 0 2-4.9"/><path d="M5 4v4h4"/><path d="M12 9v3l2 2"/></svg>' },
  { k: 'pensebete', name: 'Pense-bête', sub: 'Un post-it toujours sous les yeux. Le texte suit votre compte.',
    w: 260, h: 240, color: '#d9a441',
    ico: '<svg viewBox="0 0 24 24"><path d="M5 4h14v10l-5 6H5z"/><path d="M14 20v-6h5"/><path d="M8 9h8M8 13h4"/></svg>' },
  { k: 'quiz', name: 'Question du jour', sub: 'Une question tirée de vos quiz, quatre réponses, la bonne s’allume. « Une autre » pour continuer.',
    w: 320, h: 310, color: '#2e8b8b',
    ico: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><path d="M12 17v.5"/></svg>' },
  { k: 'horloge', name: 'Horloge', sub: 'L’heure, la date et le numéro de la semaine, avec le prochain rendez-vous en une ligne.',
    w: 260, h: 150, color: '#5b6b8c',
    ico: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>' }
];
window.ALIXO_WIDGET = k => window.ALIXO_WIDGETS.find(w => w.k === k) || null;
