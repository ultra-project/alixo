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
   Aperçu : index.html?nouveautes=1.47.2 (ou nouveautes.html?v=1.47.2 en page seule).
   ============================================================ */
'use strict';

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

AlixoWhatsNew.register('1.47.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Une bibliothèque<br>plus <em>simple</em>', text: 'Tout au même endroit, un bloc pour reprendre, un menu pour créer.', dur: 5000 },
    { title: '<em>Reprendre</em> là où vous en étiez', text: 'En haut de Mes cours, le cours en ce moment d’après votre agenda, et vos deux derniers documents.',
      bullets: ['<b>Cours en cours</b> : barre de progression et « reste N min »', '<b>Prendre des notes</b> : la séance du jour s’ouvre, ou se crée dans le dossier', '<b>Prochain cours</b> : « Préparer la séance » quand rien n’est en cours', '<b>Derniers ouverts</b> : deux documents, un clic pour y revenir'],
      art: { svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>' }, accent: '#33658a', accent2: '#b3762a', dur: 8500 },
    { title: 'Tout au <em>même endroit</em>', text: 'Séances, fichiers importés et éléments partagés : une seule liste sous vos cartes de cours.',
      bullets: ['<b>Une ligne</b> par document : puce colorée, titre, aperçu, professeur, date', '<b>Épingle</b> et corbeille au bout de chaque ligne', '<b>Vue Liste</b> : la 4e vue, à côté de Grille, Arbre et Galaxie'],
      art: 'cards', accent: '#2e8b6a', accent2: '#3d6bb5', dur: 8000 },
    { title: '<em>Nouveau</em>, en un clic', text: 'La barre se résume à « Importer » et « Nouveau ▾ » ; le clic droit sur le fond fait la même chose.',
      bullets: ['<b>Menu Nouveau</b> : séance, présentation, tableur, planche, quiz, dossier…', '<b>Clic droit</b> sur le fond de la bibliothèque, même à la racine', '<b>Dossiers</b> : un menu contextuel allégé, du plus utile au plus rare'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' }, accent: '#8a4b9c', accent2: '#2e8b6a', dur: 7500 },
    { title: 'Dossiers et <em>puces</em> de couleur', text: 'Un formulaire de dossier plus compact, et des icônes de type qu’on reconnaît avant de lire.',
      bullets: ['<b>Puces</b> : séance, présentation, tableur, planche, quiz, chacune sa couleur', '<b>Fichiers</b> PowerPoint, Excel, Word, PDF : un trombone', '<b>Formulaire</b> : 16 couleurs + couleur libre, 112 icônes par onglets'],
      art: 'palette', accent: '#b3762a', accent2: '#c04343', dur: 8000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});
