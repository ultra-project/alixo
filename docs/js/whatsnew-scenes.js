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
   Aperçu : index.html?nouveautes=1.39.1 (ou nouveautes.html?v=1.37.0 en page seule).
   ============================================================ */
'use strict';

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

AlixoWhatsNew.register('1.38.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Alixo sur votre <em>bureau</em>', text: 'Des documents Alixo créés depuis le bureau de votre PC, un zoom fluide, un téléchargement simplifié.' },
    { title: 'Nouveau › <em>Séance Alixo</em>', text: 'Comme pour Word : clic droit sur le bureau ou dans un dossier, Nouveau, puis le type de document Alixo.',
      bullets: ['<b>Cinq types</b> : séance, présentation, tableur, quiz, planche', '<b>Une icône par type</b>, dans la couleur du type', '<b>Version PC</b> Windows, après installation'],
      art: 'cards', accent: '#3d6bb5', accent2: '#b3762a', dur: 7500 },
    { title: 'Enregistré dans son <em>fichier</em>', text: 'Un document ouvert depuis un fichier reste dans ce fichier : chaque modification y est enregistrée, rien ne part en ligne.',
      bullets: ['<b>« Sauvegarde en ligne »</b> dans la barre du haut pour l’ajouter à la bibliothèque', '<b>Dossier « Bureau »</b> (ou « Documents »…) créé au besoin', '<b>Fichier .alx téléchargé</b> : indépendant du document du nuage'],
      art: { icon: '☁️' }, accent: '#2e8b6a', accent2: '#3d6bb5', dur: 8000 },
    { title: 'Un zoom <em>fluide</em>', text: 'Ctrl + molette ou pincement : la page grandit en douceur, et ce qui est sous le curseur y reste.',
      bullets: ['<b>Comme dans Word</b> : environ 10 % par cran', '<b>Sous le curseur</b> : la page ne file plus vers la gauche', '<b>Séance, présentation, tableur</b>'],
      art: 'text', accent: '#8a4b9c', accent2: '#2e8b6a', dur: 7000 },
    { title: 'Téléchargez dans le <em>format</em> voulu', text: 'Le bouton ⤓ ouvre une petite fenêtre : PDF, Word, page web ou fichier Alixo. Plus rien à régler dans les paramètres.',
      bullets: ['<b>Dernier choix</b> proposé en premier', '<b>Filigrane discret</b> : une petite mention en bas de page, fini le grand « Alixo »', '<b>Ctrl + P</b> : toujours le PDF'],
      art: 'list', accent: '#b3762a', accent2: '#8a4b9c', dur: 7500 },
    { title: 'Et <em>aussi</em>', text: 'La barre d’outils s’allège, la mise en forme marche partout, le nom en haut à gauche dit votre formule.',
      bullets: ['<b>Agenda</b> dans la barre des raccourcis, nouvelles icônes IA', '<b>Centrer, gras…</b> dans les tableaux, encadrés, fiches et cartes', '<b>Alixo, Alixo+ ou Alixo Business</b> : même logo, le nom change', '<b>Plus d’en-tête</b> « séance + date » en haut des séances'],
      art: 'palette', accent: '#c04343', accent2: '#3d6bb5', dur: 8000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});
