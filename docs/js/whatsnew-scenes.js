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
   Aperçu : index.html?nouveautes=1.46.0 (ou nouveautes.html?v=1.46.0 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.46.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Un nouveau <em>look</em>', text: 'Une interface plus claire et plus douce. Vos cours, eux, ne bougent pas.', dur: 5000 },
    { title: 'Une nouvelle <em>apparence</em>', text: 'Nouvelle palette claire et sombre, accent bleu, coins arrondis : Alixo change de visage.',
      bullets: ['<b>Palette</b> plus douce, en clair comme en sombre', '<b>Accent bleu</b> par défaut sur les boutons et les liens', '<b>Thèmes</b> de Paramètres › Apparence : toujours là, vos icônes aussi'],
      art: 'palette', accent: '#3d6bb5', accent2: '#8a4b9c', dur: 7500 },
    { title: 'La <em>recherche</em> sous les yeux', text: 'Le bouton loupe devient un vrai champ au centre de la barre du haut.',
      bullets: ['<b>Rechercher…</b> : un clic, ou Ctrl K (⌘ K sur Mac)', '<b>Même recherche</b> qu’avant, simplement plus visible', '<b>Boutons</b> de droite plus grands, plus faciles à viser'],
      art: { svg: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>' }, accent: '#33658a', accent2: '#b3762a', dur: 7000 },
    { title: 'Des dossiers à <em>initiales</em>', text: 'Dans la bibliothèque, chaque dossier se reconnaît à sa tuile et résume son contenu.',
      bullets: ['<b>Tuile</b> « MA » pour Maths, « HG » pour Histoire-géo, dans sa couleur', '<b>Puces</b> : « 3 séances · 1 dossier · 2 fichiers »', '<b>Pastilles</b> de couleur sur les onglets et dans l’explorateur'],
      art: 'cards', accent: '#2e8b6a', accent2: '#3d6bb5', dur: 8000 },
    { title: 'Vos cours ne <em>changent</em> pas', text: 'Nouvelle police d’interface Geist, embarquée dans l’application : rien n’est téléchargé.',
      bullets: ['<b>Éditeur</b>, présentations, tableurs et quiz : même rendu', '<b>PDF</b> exportés identiques', '<b>Hors ligne</b> : la police est dans Alixo, aucun appel à Google'],
      art: 'text', accent: '#b3762a', accent2: '#2e8b6a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

AlixoWhatsNew.register('1.45.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Une <em>fenêtre</em><br>par document', text: 'Comme dans Word : chaque document dans sa propre fenêtre, si vous le souhaitez.', dur: 5000 },
    { title: 'Chaque document dans sa <em>fenêtre</em>', text: 'Ouvrir un document depuis l’accueil ouvre une nouvelle fenêtre Alixo, sans barre d’onglets.',
      bullets: ['<b>L’accueil</b> reste ouvert, à côté', '<b>Fermer</b> la fenêtre ramène à l’accueil', '<b>Déjà ouvert</b> : un second clic ramène sa fenêtre devant'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="13" height="10" rx="1.5"/><rect x="9" y="10" width="13" height="10" rx="1.5"/><path d="M2 7h13M9 13h13"/></svg>' }, accent: '#33658a', accent2: '#b3762a', dur: 8000 },
    { title: 'À vous de <em>choisir</em>', text: 'Paramètres › Apparence › Fenêtres : l’interrupteur « Une fenêtre par document ».',
      bullets: ['<b>Désactivé</b> : les onglets, comme avant', '<b>Activé</b> : une fenêtre par document, façon Word', '<b>À l’activation</b> : les onglets ouverts se ferment', '<b>Sur le web</b> : un nouvel onglet du navigateur'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3"/></svg>' }, accent: '#8a4b9c', accent2: '#2e8b6a', dur: 7500 },
    { title: 'Tout reste <em>à jour</em>', text: 'Ce que vous écrivez dans une fenêtre apparaît aussitôt dans l’accueil et sur vos autres appareils.',
      bullets: ['<b>Titre</b> et contenu visibles dans l’accueil sans recharger', '<b>Suppression</b> dans l’accueil : la fenêtre se ferme', '<b>Rien de perdu</b>, même en fermant très vite'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="9" height="14" rx="1.5"/><rect x="13" y="5" width="9" height="14" rx="1.5"/><path d="M2 8h9M13 8h9"/><path d="M9.5 11.5h5M12.5 9.5l2 2-2 2"/></svg>' }, accent: '#2e8b6a', accent2: '#3d6bb5', dur: 8000 },
    { kicker: 'Correction', title: '« Sauvegarde en ligne », sur <em>une</em> ligne', text: 'Avec un fichier Alixo ouvert depuis l’ordinateur, « Sauvegarde en ligne » s’affichait sur deux lignes.',
      bullets: ['<b>Barre du haut</b> : icône et texte côte à côte', '<b>Même hauteur</b> que les autres boutons'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9H7Z"/><path d="M12 16v-5M9.5 13.5 12 11l2.5 2.5"/></svg>' }, accent: '#c04343', accent2: '#33658a', dur: 6500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

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
