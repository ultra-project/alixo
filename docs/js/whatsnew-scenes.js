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
   Aperçu : index.html?nouveautes=1.38.0 (ou nouveautes.html?v=1.37.0 en page seule).
   ============================================================ */
'use strict';

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

AlixoWhatsNew.register('1.37.2', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'AlixoAI <em>s’adapte</em>', text: 'Correction pour les ordinateurs où AlixoAI répondait « le moteur a été relancé, réessayez ».' },
    { title: 'Muette ? Elle <em>s’allège</em>', text: 'Si la carte graphique ne produit aucun mot, AlixoAI passe en version plus légère, recharge et rejoue votre demande, sans rien demander.',
      bullets: ['<b>Taille en dessous</b>, puis variante compatible', '<b>Délais</b> adaptés aux petites puces graphiques', '<b>Message précis</b> si rien ne marche malgré tout'],
      art: { icon: '✨' }, accent: '#b3762a', accent2: '#2e8b6a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.37.1', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'AlixoAI <em>démarre</em> partout', text: 'Correction pour les ordinateurs où AlixoAI répondait « WebGPU n’a pas pu démarrer ».' },
    { title: 'Fini le message <em>« WebGPU »</em>', text: 'Sur bien des portables, l’accélération graphique était refusée. La version PC la force désormais, et AlixoAI insiste avant de renoncer.',
      bullets: ['<b>Accélération graphique</b> forcée dans la version PC', '<b>Trois essais</b> pour trouver la carte graphique', '<b>« Réessayer »</b> refait vraiment l’essai, et le message dit pourquoi'],
      art: { icon: '✨' }, accent: '#2e8b6a', accent2: '#33658a', dur: 7500 },
    { title: 'Et toujours <em>AlixoAI</em>', text: 'Prête dès l’ouverture, le quiz dès la première question, des réponses bien plus rapides.',
      bullets: ['<b>Rien à installer</b>, rien à configurer', '<b>Quiz IA</b> : la suite s’écrit pendant que vous répondez'],
      art: 'quiz', accent: '#33658a', accent2: '#8a4b9c', dur: 6000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});
