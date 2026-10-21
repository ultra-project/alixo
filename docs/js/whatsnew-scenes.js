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
   Aperçu : index.html?nouveautes=1.43.0 (ou nouveautes.html?v=1.37.0 en page seule).
   ============================================================ */
'use strict';

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

AlixoWhatsNew.register('1.41.1', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Des mises à jour <em>sans accroc</em>', text: 'Correction : la mise à jour automatique ne bloque plus sur un fichier verrouillé.', dur: 5000 },
    { title: 'Plus de fichier <em>verrouillé</em>', text: 'Quand Windows ou l’antivirus retient le fichier téléchargé, Alixo trouve un autre chemin.',
      bullets: ['<b>Dossier neuf</b> si l’ancien fichier ne s’efface pas', '<b>Trois nouveaux essais</b> tout seuls : 20 s, 1 min, 3 min', '<b>Rien à faire</b> : la suite se met à jour toute seule'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>' }, accent: '#2e8b6a', accent2: '#3d6bb5', dur: 8000 },
    { title: 'Et toujours : la <em>1.41</em>', text: 'AlixoAI plus légère, vote d’assemblée, texte à trous, Tâches et bouton Image repensés.',
      bullets: ['<b>Paramètres › À propos</b> : revoir la présentation de la 1.41'],
      art: 'cards', accent: '#8a4b9c', accent2: '#b3762a', dur: 6500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});
