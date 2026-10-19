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
   Aperçu : index.html?nouveautes=1.39.2 (ou nouveautes.html?v=1.37.0 en page seule).
   ============================================================ */
'use strict';

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

AlixoWhatsNew.register('1.39.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Le plan, à <em>votre</em> façon', text: 'Un plan par séance, trois modes de plan, et de nouvelles icônes pour vos fichiers Alixo.', dur: 5000 },
    { title: 'Un plan par <em>séance</em>', text: 'Chaque séance peut avoir sa propre pyramide de niveaux et son propre mode, sans toucher aux autres.',
      bullets: ['<b>Niveau de plan</b> › « Plan de cette séance… » dans la barre d’outils', '<b>Noms, numéros, mots déclencheurs</b> propres à la séance', '<b>Paramètres › Écriture</b> garde le plan de toutes les séances'],
      art: 'text', accent: '#3d6bb5', accent2: '#b3762a', dur: 8000 },
    { title: 'Trois <em>modes</em> de plan', text: 'Automatique, adaptatif ou aucun plan : à vous de choisir comment Alixo vous suit.',
      bullets: ['<b>Automatique</b> : numérote et reconnaît « I. », « A. », « 1. »…', '<b>Adaptatif</b> : votre premier style de numéro devient le niveau 1, rien n’est imposé', '<b>Aucun plan</b> : ni détection ni numéro automatique'],
      art: 'list', accent: '#2e8b6a', accent2: '#8a4b9c', dur: 8500 },
    { title: 'De nouvelles <em>icônes</em>', text: 'Sur le bureau, vos fichiers Alixo portent une feuille en relief dans la couleur de leur type.',
      bullets: ['<b>Séance</b> bleu, <b>présentation</b> orange, <b>tableur</b> vert', '<b>Quiz</b> violet, <b>planche</b> rose', '<b>Windows et macOS</b>'],
      art: 'cards', accent: '#b3762a', accent2: '#3d6bb5', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});
