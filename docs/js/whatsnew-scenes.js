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
   Aperçu : index.html?nouveautes=1.48.0 (ou nouveautes.html?v=1.48.0 en page seule).
   ============================================================ */
'use strict';

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

AlixoWhatsNew.register('1.47.1', {
  scenes: [
    { kind: 'intro', kicker: 'Correctif installé', title: 'La barre du haut<br><em>respire</em>', text: 'Dans l’éditeur, le titre et le chemin du document passent en premier.', dur: 5000 },
    { title: 'Le <em>titre</em> d’abord', text: 'Le titre du document et son fil d’Ariane gardent leur place, même sur un petit écran.',
      bullets: ['<b>Titre</b> toujours lisible, jamais écrasé par le reste de la barre', '<b>Fil d’Ariane</b> : « Mes cours » et le dossier du document restent entiers', '<b>Sauvegarde en ligne</b> en icône seule sur les écrans moyens'],
      art: 'text', accent: '#33658a', accent2: '#b3762a', dur: 8000 },
    { title: 'Les dossiers repliés en <em>« … »</em>', text: 'Quand le chemin est long, les dossiers du milieu se replient ; rien n’est perdu.',
      bullets: ['<b>Clic</b> sur « … » : retour au dossier précédent', '<b>Survol</b> : le chemin complet s’affiche', '<b>Logo</b> sur une seule ligne, « Alixo » et son badge côte à côte'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><circle cx="8.5" cy="13.5" r="1" fill="currentColor"/><circle cx="12" cy="13.5" r="1" fill="currentColor"/><circle cx="15.5" cy="13.5" r="1" fill="currentColor"/></svg>' }, accent: '#8a4b9c', accent2: '#33658a', dur: 8000 },
    { title: 'Moins de <em>place</em> prise', text: 'La recherche devient une loupe et la pastille du cours en cours se fait plus discrète.',
      bullets: ['<b>Loupe</b> seule dans l’éditeur, Ctrl K (⌘ K) marche toujours', '<b>Cours en cours</b> : pastille bornée, temps restant toujours entier', '<b>Bibliothèque</b> : rien ne change, le champ de recherche y reste'],
      art: { svg: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>' }, accent: '#2e8b6a', accent2: '#3d6bb5', dur: 8000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6500 }
  ]
});
