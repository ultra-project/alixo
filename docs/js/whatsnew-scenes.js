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
   Aperçu : index.html?nouveautes=1.42.0 (ou nouveautes.html?v=1.37.0 en page seule).
   ============================================================ */
'use strict';

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

AlixoWhatsNew.register('1.41.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Plus <em>fluide</em>, plus riche', text: 'Une IA qui ménage l’ordinateur, deux nouvelles questions de quiz, des Tâches et un bouton Image repensés.', dur: 5000 },
    { title: 'AlixoAI ne fait plus <em>ramer</em>', text: 'Corrections, fiches et quiz : l’ordinateur reste fluide pendant qu’AlixoAI écrit.',
      bullets: ['<b>À la demande</b> : plus rien ne se charge au démarrage', '<b>Une pause entre chaque mot</b> : la souris et l’écran suivent', '<b>Mémoire libérée</b> après 5 minutes sans demande'],
      art: { icon: '✨' }, accent: '#3d6bb5', accent2: '#2e8b6a', dur: 8000 },
    { title: 'Le vote d’<em>assemblée</em>', text: 'Un sondage dont les résultats se dessinent en direct dans un hémicycle coloré.',
      bullets: ['<b>Un siège par votant</b>, regroupé par couleur', '<b>Majorité absolue</b> marquée au centre', '<b>Le groupe en tête</b> ressort à la révélation'],
      art: 'chart', accent: '#c04343', accent2: '#3d6bb5', dur: 7500 },
    { title: 'Le texte à <em>trous</em>', text: 'Sélectionnez un mot, « Faire un trou » : vos étudiants complètent le texte.',
      bullets: ['<b>Menu déroulant</b> avec leurres, ou <b>saisie libre</b>', '<b>Tolérant</b> aux majuscules, accents et espaces', '<b>Réussite par trou</b> dans les résultats'],
      art: 'text', accent: '#8a4b9c', accent2: '#b3762a', dur: 7500 },
    { title: 'Six thèmes <em>signature</em>', text: 'L’éditeur et l’écran de jeu des quiz sont modernisés, avec un aperçu en direct.',
      bullets: ['<b>Aurore, Verre, Néon</b>', '<b>Papier, Galaxie, Minéral</b>', '<b>Bouton Apparence</b> : chaque thème en miniature'],
      art: 'palette', accent: '#2e8b6a', accent2: '#8a4b9c', dur: 7000 },
    { title: 'Tâches et <em>images</em>, repensées', text: 'Des Tâches claires et rapides, et un seul bouton pour toutes vos images.',
      bullets: ['<b>Tâches</b> : saisie rapide, En retard, Aujourd’hui, À venir', '<b>Image</b> : vos photos, l’ordinateur ou le téléphone', '<b>Glisser ou coller</b> une image pour l’importer'],
      art: 'list', accent: '#b3762a', accent2: '#3d6bb5', dur: 8000 },
    { title: 'Plus de <em>place</em> à l’écran', text: 'Comme dans Word, la barre de titre disparaît ; Réduire, Agrandir et Fermer restent.',
      bullets: ['<b>Déplacer</b> : saisir la barre d’Alixo', '<b>Télécharger</b> : plus de format surligné', '<b>Fichier Alixo</b> avec l’icône de son type'],
      art: 'cards', accent: '#33658a', accent2: '#c04343', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});
