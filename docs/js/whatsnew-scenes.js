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
   Aperçu : index.html?nouveautes=1.55.2 (ou nouveautes.html?v=1.55.2 en page seule).
   ============================================================ */
'use strict';

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

/* 1.54 : présentations — animations et transitions, vidéos et quiz, thèmes signature, banque d'images, mode présentation et vue présentateur */
AlixoWhatsNew.register('1.54.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Les <em>présentations</em><br>font peau neuve', text: 'Cinq nouveautés, en moins d’une minute.', dur: 5500 },
    { title: 'Des <em>animations</em> et des transitions', text: 'Bouton Animation : chaque bloc apparaît à son tour ; sans sélection, il devient Transition.',
      bullets: ['<b>Dix effets</b> : fondu, zoom, rebond, machine à écrire…', '<b>Ordre d’apparition</b> : un clic révèle le groupe suivant', '<b>Transitions</b> : Aperçu, puis « Appliquer à toutes les diapositives »'],
      art: 'text', accent: '#3d6bb5', accent2: '#b3762a', dur: 8000 },
    { title: 'Des <em>vidéos</em> et un quiz lié', text: 'Un fichier de l’ordinateur, YouTube, Vimeo ou Dailymotion ; un de vos quiz en un clic.',
      bullets: ['<b>Rien ne se charge</b> avant votre clic sur « Lire la vidéo »', '<b>Lancer le quiz</b> depuis la diapositive, puis revenir où vous étiez'],
      art: 'quiz', accent: '#c04343', accent2: '#3d6bb5', dur: 7500 },
    { title: 'Douze <em>thèmes</em> signature', text: 'Motif de fond et forme signature : Aurore, Granit, Lagon, Kraft, Bauhaus… avec Alixo+.',
      bullets: ['<b>Huit dispositions</b> de plus : citation, comparaison, trois colonnes…', '<b>Une présentation reçue</b> garde son thème, quel que soit votre compte'],
      art: 'palette', accent: '#8a4b9c', accent2: '#2e8b6a', dur: 7000 },
    { title: 'Une <em>banque d’images</em> libres', text: 'Double-clic sur une image, puis « Banque d’images libres » : des photos de Wikimedia Commons.',
      bullets: ['<b>Licences filtrées</b> : domaine public, CC0, CC BY et CC BY-SA seulement', '<b>Crédit</b> de l’auteur ajouté sous l’image, jusque dans le PDF', '<b>Transparence</b> : la recherche part chez Wikimedia, Alixo ne la garde pas'],
      art: 'cards', accent: '#2e8b6a', accent2: '#b3762a', dur: 8000 },
    { title: 'Une <em>vue présentateur</em> complète', text: 'Alt+F5 : notes, suite et chrono pour vous ; la diapositive seule sur le second écran.',
      bullets: ['<b>Laser, encre, spot</b> : montrer sans rien modifier', '<b>Chrono</b>, écran noir, grille des diapositives, aide', '<b>Répétition chronométrée</b> : la durée de chaque diapositive'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8 20.5h8M12 16.5v4"/><path d="M7 8h10M7 11h7"/></svg>' }, accent: '#33658a', accent2: '#c04343', dur: 8500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

/* 1.53 : Workspace, pseudo, partage, couleur des encadrés, blocs cartes et frise */
AlixoWhatsNew.register('1.53.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Le <em>Workspace</em>,<br>et un partage plus clair', text: 'Six nouveautés, en moins d’une minute.', dur: 5500 },
    { title: 'Le <em>Workspace</em> : vos cours, pour tous', text: 'Un nouvel espace où chacun dépose ses cours et profite de ceux des autres.',
      bullets: ['<b>Déposer une séance</b> : titre, matière, niveau, étiquettes', '<b>Ajouter à ma bibliothèque</b> en un clic', '<b>Étoiles, commentaires</b> : les plus utiles remontent'],
      art: 'cards', accent: '#3d6bb5', accent2: '#b3762a', dur: 9000 },
    { title: 'Un <em>pseudo</em> pour chacun', text: 'C’est lui que voient les autres membres, jamais votre nom ni votre e-mail.',
      bullets: ['<b>Attribué</b> dès la connexion, par exemple « RenardLucide42 »', '<b>Modifiable</b> dans Paramètres › Compte, ou un autre au hasard'],
      art: { icon: '🦊' }, accent: '#8a4b9c', accent2: '#3d6bb5', dur: 7500 },
    { title: 'Le <em>partage</em>, revu', text: 'Une seule fenêtre : qui voit quoi, et comment ajouter quelqu’un.',
      bullets: ['<b>Peut consulter</b> ou <b>Peut modifier</b>, lisible pour chaque personne', '<b>Par pseudo</b> ou par e-mail, avec un message clair', '<b>Lien de partage</b> à copier, désactivable quand vous voulez'],
      art: 'list', accent: '#2e8b6a', accent2: '#33658a', dur: 8500 },
    { title: 'Les <em>encadrés</em> à vos couleurs', text: 'Paramètres › Apparence : une couleur par type d’encadré, avec aperçu.',
      bullets: ['<b>Définition, À retenir, Exemple, Bilan…</b> chacun sa teinte', '<b>Suit</b> le thème sombre, l’impression, le PDF et Word', '<b>Réinitialiser</b> revient aux couleurs d’origine'],
      art: 'palette', accent: '#b3762a', accent2: '#8a4b9c', dur: 8000 },
    { title: 'Des blocs plus <em>nets</em>', text: 'Cartes, frise, arbre, graphique : sans cadre bleu ni espace vide.',
      bullets: ['<b>Plus de contour bleu</b> quand vous écrivez dans une carte ou une frise', '<b>Plus d’espace vide</b> en dessous : les outils apparaissent au survol'],
      art: 'text', accent: '#33658a', accent2: '#2e8b6a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});
