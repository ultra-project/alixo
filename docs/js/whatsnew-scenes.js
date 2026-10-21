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
   Aperçu : index.html?nouveautes=1.44.0 (ou nouveautes.html?v=1.37.0 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.44.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'AlixoAI, de retour<br>sur votre <em>ordinateur</em>', text: 'Une IA qui travaille chez vous, avec un moteur bien plus solide.', dur: 5000 },
    { title: 'AlixoAI <em>chez vous</em>', text: 'Relecture F7, mise en forme, Quiz IA et fiches (Alixo+) tournent dans l’application Windows et Mac.',
      bullets: ['<b>Rien n’est envoyé</b> : vos textes restent sur l’ordinateur', '<b>Sans limite</b> d’utilisation', '<b>Hors ligne</b> : tout marche sans connexion'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/><path d="M12 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9Z"/></svg>' }, accent: '#8a4b9c', accent2: '#3d6bb5', dur: 8000 },
    { title: 'Un moteur <em>solide</em>', text: 'Si quelque chose se passe mal, la fenêtre d’Alixo reste ouverte et vos cours ne bougent pas.',
      bullets: ['<b>À part</b> : l’IA tourne seule de son côté, sans gêner Alixo', '<b>Repli</b> sur le processeur si la carte graphique pose problème', '<b>Mémoire</b> : plus de gel de l’ordinateur, libérée après 5 min sans demande'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6Z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>' }, accent: '#2e8b6a', accent2: '#b3762a', dur: 8000 },
    { title: 'À <em>installer</em> une fois', text: 'Paramètres › IA › Installer AlixoAI : le bon profil est proposé selon l’ordinateur.',
      bullets: ['<b>Standard</b> : ≈ 2,5 Go, conseillé dès 12 Go de mémoire vive', '<b>Léger</b> : ≈ 1,1 Go, pour les ordinateurs plus modestes', '<b>Avec votre accord</b> : téléchargement vérifié, reprise si coupure'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="M7.5 9.5L12 14l4.5-4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>' }, accent: '#b3762a', accent2: '#33658a', dur: 8000 },
    { title: 'Sur le web et le <em>téléphone</em>', text: 'La correction pendant la frappe reste partout ; les outils AlixoAI demandent l’application Windows ou Mac.',
      bullets: ['<b>Correction</b> de l’orthographe et de la grammaire : partout', '<b>F7, Quiz IA, fiches</b> : dans l’application Windows ou Mac', '<b>Alixo+</b> : privé d’AlixoAI ? Résiliation possible sous 30 jours'],
      art: 'spell', accent: '#3d6bb5', accent2: '#c04343', dur: 8000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

AlixoWhatsNew.register('1.43.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Écrire juste, <em>partout</em>', text: 'Une correction des fautes qui marche sur tous les ordinateurs, AlixoAI en ligne, et de nouveaux blocs.', dur: 5000 },
    { title: 'La correction <em>partout</em>', text: 'Les fautes sont soulignées sur tous les ordinateurs, sans rien faire ramer.',
      bullets: ['<b>Orthographe</b> : clic droit sur le mot pour les suggestions', '<b>Grammaire</b> : « il à » devient « il a » avec la touche Tab', '<b>Gratuite</b> et hors ligne : rien ne quitte l’appareil'],
      art: 'spell', accent: '#c04343', accent2: '#33658a', dur: 8000 },
    { title: 'AlixoAI passe <em>en ligne</em>', text: 'Avec Alixo+, sur n’importe quel ordinateur ou téléphone connecté.',
      bullets: ['<b>F7</b>, Quiz IA et fiches : des réponses plus rapides et plus justes', '<b>Rien à télécharger</b> : jusqu’à 2,4 Go libérés', '<b>À votre demande</b> : texte non conservé, Paramètres › IA'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M12.5 9.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z"/></svg>' }, accent: '#8a4b9c', accent2: '#3d6bb5', dur: 8000 },
    { title: 'Un tableau au <em>quadrillage</em>', text: 'Dans une séance, deux nouvelles façons d’insérer : un tableau dessiné, un autre document.',
      bullets: ['<b>Tableau</b> : glissez sur le quadrillage, puis cliquez', '<b>Au clavier</b> : flèches puis Entrée', '<b>Bloc Document</b> : « / » › Document, une carte qui s’ouvre d’un clic'],
      art: 'grid', accent: '#3d6bb5', accent2: '#2e8b6a', dur: 8000 },
    { title: 'Onglets et <em>stockage</em>', text: 'Un nouvel onglet se nomme sur place, l’espace utilisé se lit d’un coup d’œil.',
      bullets: ['<b>Nouvel onglet</b> : son nom se tape directement dedans', '<b>Stockage</b> : une barre par catégorie, Paramètres › Compte', '<b>Plus gros éléments</b> : listés, un clic les ouvre'],
      art: 'storage', accent: '#b3762a', accent2: '#8a4b9c', dur: 7500 },
    { title: 'Des widgets <em>par appareil</em>', text: 'Le PC du bureau et l’ordinateur portable gardent chacun leur disposition.',
      bullets: ['<b>Disposition</b> propre à chaque ordinateur', '<b>Au démarrage</b> : Alixo peut s’ouvrir seul, Paramètres › Widgets', '<b>Discret</b> : seuls vos widgets apparaissent'],
      art: 'board', accent: '#2e8b6a', accent2: '#b3762a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

AlixoWhatsNew.register('1.42.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Plus <em>sobre</em>, plus pratique', text: 'Des Paramètres redessinés, l’export Excel des résultats de quiz et une barre d’outils centrée.', dur: 5000 },
    { title: 'Des Paramètres <em>redessinés</em>', text: 'Plus sobres et plus lisibles, en thème clair comme en sombre.',
      bullets: ['<b>Interrupteurs</b> à la place des grandes cases', '<b>Surfaces plates</b> et fins séparateurs', '<b>Alixo+</b> : un badge et un bouton unis'],
      art: 'palette', accent: '#3d6bb5', accent2: '#8a4b9c', dur: 7500 },
    { title: 'Les résultats en <em>Excel</em>', text: 'Fenêtre Résultats d’un quiz, bouton « Excel » : un classeur déjà mis en forme.',
      bullets: ['<b>Aux couleurs d’Alixo</b> : logo, en-tête, lignes alternées', '<b>Deux feuilles</b> : Participants et Par question', '<b>Filtres</b> et en-tête figé, prêts à l’emploi', '<b>CSV</b> toujours là, protégé des formules piégées'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M3 14h18"/><path d="M9 4v16"/></svg>' }, accent: '#2e8b6a', accent2: '#b3762a', dur: 8500 },
    { title: 'Tout à <em>portée</em> de main', text: 'Des raccourcis bien rangés, une barre d’outils centrée, une déconnexion facile à trouver.',
      bullets: ['<b>Raccourcis</b> par catégorie : Paramètres › À propos', '<b>Barre d’outils</b> centrée sur grand écran', '<b>Se déconnecter</b> : en bas de la colonne des Paramètres'],
      art: 'cards', accent: '#b3762a', accent2: '#3d6bb5', dur: 8000 },
    { kicker: 'Corrections', title: 'Deux <em>corrections</em>', text: 'De petits défauts d’affichage en moins.',
      bullets: ['<b>Quiz en présentation</b> : le graphique ne cache plus la question', '<b>Présentation des nouveautés</b> : le logo au-dessus de la version'],
      art: 'list', accent: '#c04343', accent2: '#33658a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});
