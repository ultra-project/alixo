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
   Aperçu : index.html?nouveautes=1.57.0 (ou nouveautes.html?v=1.57.0 en page seule).
   ============================================================ */
'use strict';

/* 1.57 : scan qui détecte la feuille, Télécharger au clic droit, police Geist, encadrés et collage corrigés */
AlixoWhatsNew.register('1.57.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Un scan <em>plus malin</em>,<br>et des corrections', text: 'Trois nouveautés et des corrections, en moins d’une minute.', dur: 5000 },
    { title: 'Le scan <em>trouve</em> la feuille', text: 'Photographiez la page : Alixo repère ses quatre coins, la redresse et enlève la table autour.',
      bullets: ['<b>Automatique</b> : la feuille est détectée et remise d’équerre', '<b>Vérifiez</b> le cadrage et déplacez les coins au doigt', '<b>Envoyer sans recadrer</b> ou <b>reprendre</b> la photo'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8.5 7.5 16 8.5 15 16.5 7.5 15.5Z"/></svg>' }, accent: '#2e8b6a', accent2: '#33658a', dur: 8000 },
    { title: '<em>Télécharger</em> d’un clic droit', text: 'Clic droit sur une séance ou un fichier de la bibliothèque, sans l’ouvrir.',
      bullets: ['<b>Séance</b> : PDF, Word, page web ou fichier Alixo', '<b>PDF et fichiers</b> : enregistrés tels quels sur l’ordinateur', '<b>Partout</b> : liste, arbre, onglets, séances partagées'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>' }, accent: '#3d6bb5', accent2: '#b3762a', dur: 7000 },
    { title: 'La police <em>Geist</em>', text: 'La police de l’interface d’Alixo, maintenant pour vos cours aussi.',
      bullets: ['<b>Geist</b> et <b>Geist Mono</b> dans le choix des polices', '<b>Gratuite</b>, pour un passage ou tout le document', '<b>Fidèle</b> dans les PDF et les pages web exportés'],
      art: 'text', accent: '#8a4b9c', accent2: '#3d6bb5', dur: 7000 },
    { kicker: 'Corrections', title: 'Des <em>corrections</em>', text: 'L’écriture au quotidien, plus fluide.',
      bullets: ['<b>Encadrés</b> : deux fois Entrée en fin d’encadré pour en sortir, à chaque fois', '<b>Coller</b> sur une sélection la remplace, au lieu d’ajouter dessous', '<b>Recadrer</b> une image : le cadre tombe juste, plus de doublon'],
      art: 'list', accent: '#b3762a', accent2: '#c04343', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

/* 1.56 : PDF dans Alixo (annotations, pages, AlixoAI), bloc Scan, co-édition refaite, intégrations MCP */
AlixoWhatsNew.register('1.56.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Vos <em>PDF</em> dans Alixo,<br>et bien plus', text: 'Cinq nouveautés, en moins d’une minute.', dur: 5000 },
    { title: 'Vos <em>PDF</em> s’ouvrent ici', text: 'Double-clic sur un PDF de la bibliothèque : il s’ouvre dans un onglet, comme une séance.',
      bullets: ['<b>Annotez</b> : stylo, surligneur, post-it, tampons, signature', '<b>Réorganisez</b> les pages, fusionnez, remplissez les formulaires', '<b>Ctrl+S</b> enregistre dans le fichier lui-même'],
      art: { image: 'nouveautes/1.56.0-pdf.jpg', alt: 'Un PDF ouvert dans Alixo avec le volet Alixo AI' }, accent: '#c04343', accent2: '#3d6bb5', dur: 8000 },
    { title: 'AlixoAI <em>lit</em> vos PDF', text: 'Bouton « Alixo AI » de la barre, sur l’application PC ou Mac.',
      bullets: ['<b>Résumer</b>, expliquer ou traduire un passage', '<b>Quiz</b> et <b>fiche de révision</b> à partir du PDF', '<b>En séance</b> : le PDF devient un cours Alixo'],
      art: { icon: '✨' }, accent: '#6d5bd0', accent2: '#b3762a', dur: 7500 },
    { title: '<em>Scannez</em> une feuille', text: 'Tapez « / » puis « Scanner un document » : un QR code, une photo, une page entière.',
      bullets: ['<b>Portrait ou paysage</b>, plusieurs pages d’affilée', '<b>Noir et blanc</b> pour un rendu bien lisible', '<b>Annotez</b> au stylo, au surligneur et aux formes'],
      art: { image: 'nouveautes/1.56.0-scan.jpg', alt: 'Une feuille scannée annotée au surligneur et au rectangle' }, accent: '#2e8b6a', accent2: '#33658a', dur: 7500 },
    { title: 'Travailler <em>à plusieurs</em>', text: 'La modification en direct d’une séance partagée a été refaite de fond en comble.',
      bullets: ['<b>Rien ne se perd</b> : les deux textes sont gardés', '<b>Votre curseur</b> ne bouge plus, l’onglet non plus', '<b>Hors ligne</b> : tout est fusionné au retour du réseau'],
      art: 'list', accent: '#33658a', accent2: '#2e8b6a', dur: 7500 },
    { title: 'Claude et Cursor <em>connectés</em>', text: 'Paramètres › Intégrations : un jeton, un guide à copier, et votre assistant voit vos cours.',
      bullets: ['<b>Lire et chercher</b> dans toute la bibliothèque', '<b>Créer</b> des séances et des dossiers', '<b>Révoquer</b> un jeton à tout moment'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M9 7V3M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0Z"/><path d="M12 17v4"/></svg>' }, accent: '#8a4b9c', accent2: '#3d6bb5', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

/* 1.55 : Coco crée vos documents, Artéfacts, bannières de dossiers, explorateur, Workspace repensé, fenêtres floutées, polices multiples */
const SCENES_155 = {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Coco crée,<br>vos cours s’habillent', text: 'Huit nouveautés pour créer plus vite et vous retrouver plus facilement.' },
    { title: 'Coco <em>crée</em> vos documents', text: 'Le bouton « IA », à droite de « Nouveau », ouvre une barre au centre de l’écran.',
      bullets: ['<b>Décrivez</b> ce que vous voulez, en une phrase', '<b>Choisissez</b> : séance, présentation, tableur, planche, quiz ou fiche', '<b>Ctrl+Z</b> annule ce que Coco a écrit'],
      art: { image: 'nouveautes/1.55.0-ia.jpg', alt: 'La barre « Créer avec Coco » ouverte au centre de l’écran' }, accent: '#6d5bd0', accent2: '#3d6bb5', dur: 7500 },
    { title: 'L’onglet <em>Artéfacts</em>', text: 'Tout ce que Coco a créé pour vous, rangé au même endroit.',
      bullets: ['<b>Quiz et fiches</b> enregistrés automatiquement', '<b>Filtres</b> par type, recherche et tri', '<b>Provenance</b> : la séance ou la demande d’origine'],
      art: 'cards', accent: '#8a4b9c', accent2: '#b3762a', dur: 7000 },
    { title: 'Des <em>bannières</em> pour vos cours', text: 'Clic droit sur un dossier › Modifier : une fenêtre entièrement repensée.',
      bullets: ['<b>Couleur</b> ou <b>motif</b> en haut de la carte', '<b>Image perso</b> avec Alixo+', '<b>Icônes</b> à rechercher, rangées par matière'],
      art: { image: 'nouveautes/1.55.0-bannieres.jpg', alt: 'Cartes de cours avec bannières couleur, motif et image' }, accent: '#c04343', accent2: '#2e8b6a', dur: 7000 },
    { title: 'Un vrai <em>explorateur</em>', text: 'Dossiers, sous-dossiers, fil d’Ariane : on ne se perd plus pour choisir une séance.',
      bullets: ['<b>Partout</b> : agenda, dépôt au Workspace, déplacer', '<b>Recherche</b> dans tout l’arbre', '<b>Clavier</b> : flèches, Entrée, Retour arrière'],
      art: 'list', accent: '#33658a', accent2: '#2e8b6a', dur: 7000 },
    { title: 'Le Workspace, une <em>boutique</em>', text: 'Nouvelle icône caddie, nouvelle vitrine des cours partagés par les membres.',
      bullets: ['<b>Recherche</b> et filtres par matière et niveau', '<b>Mes dépôts</b> dans un onglet à part', '<b>Déposer</b> une séance en trois étapes'],
      art: 'cards', accent: '#2e8b6a', accent2: '#33658a', dur: 7000 },
    { title: 'Plus <em>confortable</em> au quotidien', text: 'Plein de petites choses qui changent tout.',
      bullets: ['<b>Fenêtres</b> sur fond flouté : l’arrière ne bouge plus', '<b>Clic droit</b> : l’élément reste sélectionné', '<b>Polices</b> : plusieurs dans une même séance', '<b>Planche</b> : un clic dans le vide désélectionne'],
      art: 'text', accent: '#b3762a', accent2: '#c04343', dur: 8000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'À vous de créer.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
};
AlixoWhatsNew.register('1.55.2', SCENES_155);   // 1.55.1 et 1.55.2 : correctifs — même présentation que la 1.55.0
AlixoWhatsNew.register('1.55.1', SCENES_155);
AlixoWhatsNew.register('1.55.0', SCENES_155);

