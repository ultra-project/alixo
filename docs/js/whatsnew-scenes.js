/* ============================================================
   Alixo — scènes de la présentation animée des nouveautés, version par version.
   ------------------------------------------------------------
   À chaque mise à jour, ajouter un bloc AlixoWhatsNew.register('x.y.z', { scenes: [...] }) EN TÊTE
   de ce fichier (le lecteur est js/whatsnew.js, le format y est documenté). Garder au plus les trois
   dernières versions : les plus anciennes se retirent (elles restent lisibles sur alixoapp.com/versions/).

   Règles d'écriture (voir .claude/skills/alixo-update/references/video.md) :
   - une idée par scène, 4 à 7 scènes, 35 à 60 secondes au total ;
   - une scène « intro » (numéro de version), des scènes « feature » (titre court avec un mot en <em>,
     une phrase, 2 à 4 puces commençant par un <b>mot-clé</b>, une illustration `art`), une « outro » ;
   - le texte reprend la section « Nouveautés x.y.z » du README en langage d'utilisateur (jamais de
     nom de fichier ni de fonction).
   Aperçu : index.html?nouveautes=1.48.1 (ou nouveautes.html?v=1.48.1 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.48.1', {
  scenes: [
    { kind: 'intro', kicker: 'Correctif installé', title: 'Chaque bouton<br>à sa <em>place</em>', text: 'Partager et Télécharger rejoignent la barre d’outils du document.', dur: 5000 },
    { title: 'La barre du haut, pour l’<em>application</em>', text: 'En haut, il ne reste que ce qui concerne Alixo dans son ensemble.',
      bullets: ['<b>Recherche</b>, agenda, notifications, paramètres, apparence', '<b>Rien</b> qui dépende du document ouvert', '<b>Plus clair</b> : on sait où chercher quoi'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" rx="1.5"/><path d="M3 12h18M3 16h12"/></svg>' }, accent: '#33658a', accent2: '#b3762a', dur: 8000 },
    { title: 'La barre d’outils, pour le <em>document</em>', text: 'Partager et Télécharger sont tout à droite des outils de la séance, avec les pastilles « qui a accès ».',
      bullets: ['<b>Partager</b> : inviter, voir qui a accès', '<b>Télécharger</b> : fichier Alixo, PDF, Word, page web', '<b>Toujours visibles</b> au bord droit, même si la barre défile'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>' }, accent: '#2e8b6a', accent2: '#3d6bb5', dur: 8500 },
    { title: 'Le diaporama <em>télécharge</em> aussi', text: 'Dans la barre de la présentation, le bouton Télécharger remplace le petit « .alx ».',
      bullets: ['<b>Fichier Alixo</b> ou <b>PDF</b>, au choix dans le menu', '<b>Même bouton</b> que dans le tableur et la planche', '<b>Word et OpenDocument</b> gardent leurs boutons Télécharger et Imprimer'],
      art: 'quiz', accent: '#b3762a', accent2: '#8a4b9c', dur: 8000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6500 }
  ]
});

AlixoWhatsNew.register('1.48.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'De nouvelles <em>icônes</em>', text: 'Vos fichiers Alixo se reconnaissent d’un coup d’œil, sur le bureau comme dans l’application.', dur: 5000 },
    { title: 'Une <em>feuille</em> par type', text: 'Chaque document enregistré sur votre ordinateur porte sa couleur et son symbole.',
      bullets: ['<b>Séance</b> en bleu, <b>présentation</b> en orange, <b>tableur</b> en vert', '<b>Quiz</b> en violet, <b>planche</b> en rose', '<b>Symbole</b> du type au centre : lignes, chevalet, grille, cases, cartes'],
      art: { image: 'nouveautes/1.48.0-icones.png', alt: 'Les cinq icônes de fichiers Alixo' }, accent: '#3d6bb5', accent2: '#b3762a', dur: 8500 },
    { title: 'Sur le <em>bureau</em>, sans confusion', text: 'Dans l’Explorateur Windows comme dans le Finder, un document Alixo ne ressemble plus à l’application.',
      bullets: ['<b>Double-clic</b> : le document s’ouvre dans Alixo, comme avant', '<b>Windows</b> et <b>Mac</b> : les mêmes icônes des deux côtés', '<b>Netteté</b> à toutes les tailles, de la liste de fichiers aux grandes vignettes'],
      art: 'cards', accent: '#8a4b9c', accent2: '#2e8b6a', dur: 8000 },
    { title: 'Dans le menu <em>Télécharger</em>', text: 'Le choix « Fichier Alixo » montre l’icône que le document aura sur le bureau.',
      bullets: ['<b>Même icône</b> qu’à l’enregistrement, selon le type du document', '<b>Plus grande</b> : son symbole reste lisible', '<b>Rien d’autre</b> ne change : vos cours et vos réglages restent en place'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>' }, accent: '#2e8b6a', accent2: '#b3762a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6500 }
  ]
});

AlixoWhatsNew.register('1.47.2', {
  scenes: [
    { kind: 'intro', kicker: 'Correctif installé', title: 'Un peu d’<em>air</em><br>dans la barre du haut', text: 'Dans la bibliothèque, la recherche et la pastille de l’agenda ne se touchent plus.', dur: 6000 },
    { title: 'Un peu d’<em>air</em>', text: 'Le champ « Rechercher… » était collé à la pastille du prochain cours de votre agenda.',
      bullets: ['<b>Écart</b> net entre la recherche et le prochain cours', '<b>Lisible</b> d’un coup d’œil : chaque élément garde sa place', '<b>Grand écran</b> : la barre ne déborde pas, même très large'],
      art: { svg: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>' }, accent: '#33658a', accent2: '#b3762a', dur: 11000 },
    { kicker: 'Rappel de la 1.47.1', title: 'La barre du haut <em>allégée</em>', text: 'Dans l’éditeur, le titre du document et son chemin passent en premier.',
      bullets: ['<b>Titre</b> d’abord, jamais écrasé par le reste de la barre', '<b>Dossiers</b> repliés en « … » quand le chemin est long', '<b>Logo</b> sur une seule ligne, « Alixo » et son badge côte à côte'],
      art: 'text', accent: '#2e8b6a', accent2: '#8a4b9c', dur: 11000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 8000 }
  ]
});
