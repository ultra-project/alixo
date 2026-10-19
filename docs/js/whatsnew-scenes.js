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
   Aperçu : index.html?nouveautes=1.40.0 (ou nouveautes.html?v=1.37.0 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.40.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Plus <em>vite</em>, au quotidien', text: 'Photos depuis le téléphone, articles de loi en un geste, et des petits gains de temps partout.', dur: 5000 },
    { title: 'La photo du <em>téléphone</em>, dans la séance', text: 'Scannez le QR code, prenez la photo : elle apparaît aussitôt dans votre document.',
      bullets: ['<b>Bouton téléphone</b> de la barre d’outils, ou « / » › Photo depuis le téléphone', '<b>Prendre une photo</b> ou choisir dans la galerie, sans application', '<b>À l’endroit du curseur</b>, puis à la suite des précédentes'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/><path d="M9.5 9.5h1.2l.8-1.2h2l.8 1.2h1.2v4.5h-6Z"/><circle cx="12" cy="11.6" r="1.1"/></svg>' }, accent: '#3d6bb5', accent2: '#2e8b6a', dur: 8500 },
    { title: 'Les articles de loi, en <em>un geste</em>', text: 'Tapez « art. 1240 c. civ. » puis une espace : le lien Légifrance se crée tout seul.',
      bullets: ['<b>Noms complets</b>, articles L. / R., alinéas, plusieurs articles d’un coup', '<b>Bouton §</b> : le dernier code est retenu, tapez juste le numéro', '<b>Récents</b> réinsérés d’un clic ; 25 codes et textes reconnus'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M12 3v18M7 21h10M5 7h14"/><path d="m5 7-3 7a3 3 0 0 0 6 0Z"/><path d="m19 7-3 7a3 3 0 0 0 6 0Z"/></svg>' }, accent: '#b3762a', accent2: '#8a4b9c', dur: 8500 },
    { title: 'Police <em>11</em> et enregistrement en icône', text: 'Le texte des séances passe en police 11, comme dans Word ; la barre d’outils compte en points.',
      bullets: ['<b>Orange qui tourne</b> : enregistrement en cours', '<b>Nuage vert coché</b> : c’est enregistré', '<b>L’heure</b> reste dans l’infobulle'],
      art: 'text', accent: '#2e8b6a', accent2: '#f08a24', dur: 7500 },
    { title: 'Télécharger et <em>renommer</em> plus vite', text: 'La même petite fenêtre partout, et les onglets se renomment sur place.',
      bullets: ['<b>Ordre fixe</b> : fichier Alixo, PDF, Word, page web', '<b>Tableurs, planches, quiz</b> : un seul bouton Télécharger', '<b>Double-clic</b> sur un onglet, une feuille : renommer'],
      art: 'list', accent: '#8a4b9c', accent2: '#3d6bb5', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

AlixoWhatsNew.register('1.39.2', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Des icônes <em>nettes</em>', text: 'Correction : les icônes de vos fichiers Alixo retrouvent leur dessin d’origine.', dur: 5000 },
    { title: 'Le dessin, en <em>entier</em>', text: 'Les symboles blancs au centre des icônes apparaissaient troués. Seul le fond autour de la feuille est désormais retiré.',
      bullets: ['<b>Symboles intacts</b> : lignes, écran, grille, liste, tableau', '<b>Contour net</b>, sans liseré blanc, sur fond clair ou sombre', '<b>Toutes les tailles</b> du bureau et de l’Explorateur'],
      art: 'cards', accent: '#3d6bb5', accent2: '#2e8b6a', dur: 8000 },
    { title: 'Et toujours : le plan à <em>votre</em> façon', text: 'Un plan par séance et trois modes : automatique, adaptatif ou aucun plan.',
      bullets: ['<b>Niveau de plan</b> › « Plan de cette séance… »', '<b>Adaptatif</b> : votre premier numéro devient le niveau 1'],
      art: 'list', accent: '#8a4b9c', accent2: '#b3762a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

AlixoWhatsNew.register('1.39.1', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Icônes <em>entières</em>', text: 'Correction pour les fichiers Alixo dont l’icône apparaissait coupée sur le bureau Windows.', dur: 5000 },
    { title: 'Plus rien n’est <em>coupé</em>', text: 'Séance, présentation, tableur, quiz, planche : chaque fichier montre sa feuille en relief au complet, avec son coin replié.',
      bullets: ['<b>Toutes les tailles</b> d’affichage de l’Explorateur', '<b>Une petite marge</b> autour de l’image', '<b>Appliqué</b> par la mise à jour'],
      art: 'cards', accent: '#3d6bb5', accent2: '#b3762a', dur: 8000 },
    { title: 'Et toujours : le plan à <em>votre</em> façon', text: 'Un plan par séance et trois modes : automatique, adaptatif ou aucun plan.',
      bullets: ['<b>Niveau de plan</b> › « Plan de cette séance… »', '<b>Adaptatif</b> : votre premier numéro devient le niveau 1'],
      art: 'list', accent: '#2e8b6a', accent2: '#8a4b9c', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});
