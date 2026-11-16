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
   Aperçu : index.html?nouveautes=1.51.0 (ou nouveautes.html?v=1.51.0 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.51.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Une <em>frise</em>, des images<br>et des dossiers mieux rangés', text: 'Cinq nouveautés et deux corrections, en moins d’une minute.', dur: 5500 },
    { title: 'La <em>frise</em> chronologique', text: 'Un nouveau bloc pour les dates : tapez « / » puis « frise ».',
      bullets: ['<b>Date libre</b> : « 1789 », « v. 1450 », « 1914-1918 »', '<b>Entrée</b> passe au champ suivant, puis à l’événement d’après', '<b>Verticale ou horizontale</b>, reprise dans le PDF et Word'],
      art: { image: 'nouveautes/1.51.0-frise.png', alt: 'Une frise chronologique dans un cours : quatre événements datés le long d’un rail' }, accent: '#3d6bb5', accent2: '#b3762a', dur: 8500 },
    { title: 'Clic droit sur une <em>image</em>', text: 'Une vraie boîte à outils, sans quitter le cours.',
      bullets: ['<b>Supprimer le fond</b>, calculé sur votre appareil', '<b>Régler</b> : luminosité, contraste, noir et blanc, rotation', '<b>Habiller</b> : coins arrondis, bordure, ombre', '<b>Réinitialiser</b> revient à l’original à tout moment'],
      art: { image: 'nouveautes/1.51.0-image.png', alt: 'Le menu d’outils ouvert à côté d’une image aux coins arrondis' }, accent: '#8a4b9c', accent2: '#3d6bb5', dur: 9500 },
    { title: '<em>Rechercher</em> et trier dans un dossier', text: 'Au-dessus de la liste de vos cours, un champ de recherche et un bouton de tri.',
      bullets: ['<b>Recherche</b> dans le dossier et ses sous-dossiers', '<b>Tri</b> par date, nom, type ou taille', '<b>Mémorisé</b> d’une fois sur l’autre'],
      art: 'cards', accent: '#2e8b6a', accent2: '#33658a', dur: 8000 },
    { title: 'Des encadrés plus <em>simples</em>', text: 'Bilan, définition, exemple : un fond léger, une fine barre de couleur, plus de cadre.',
      bullets: ['<b>Vos cours</b> en profitent sans rien changer', '<b>Copier-coller</b> : taille, couleur et surlignage suivent d’un cours à l’autre', '<b>Même</b> pour quelques mots pris au milieu d’un passage coloré'],
      art: { image: 'nouveautes/1.51.0-encadres.png', alt: 'Quatre encadrés : définition, exemple, à retenir, bilan' }, accent: '#b3762a', accent2: '#8a4b9c', dur: 9000 },
    { title: 'Et <em>aussi</em>', text: 'Des retouches demandées, et deux corrections.',
      bullets: ['<b>Profil</b> : niveau, classe et spécialités dans une petite fenêtre', '<b>Menu Nouveau</b> : les icônes en couleur des documents', '<b>Corrigé</b> : « Écrivez, ou tapez… » ne passe plus derrière le texte', '<b>Arbres</b> : la ligne d’aide ne reste plus affichée'],
      art: 'list', accent: '#33658a', accent2: '#2e8b6a', dur: 9500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

AlixoWhatsNew.register('1.50.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Les dessins se posent<br>sur le <em>cours</em>', text: 'Un panneau de dessin, des clics droits partout, et deux corrections.', dur: 5500 },
    { title: 'Glissez un objet sur la <em>page</em>', text: 'Le bouton Dessin ouvre un panneau à droite : attrapez une forme et déposez-la où vous voulez.',
      bullets: ['<b>Quinze objets</b> : formes, flèches, bulle, texte, et la main levée', '<b>Par-dessus le texte</b> : sautez des lignes pour faire de la place', '<b>Accroché</b> à son paragraphe, il suit ce que vous écrivez'],
      art: { image: 'nouveautes/1.50.0-dessin.png', alt: 'Le panneau Dessin ouvert à droite d’un cours, des objets posés sur le texte' }, accent: '#3d6bb5', accent2: '#b3762a', dur: 9000 },
    { title: 'Clic gauche pour <em>régler</em>, clic droit pour agir', text: 'Sélectionnez un objet : ses réglages s’affichent dans le panneau.',
      bullets: ['<b>Trait</b>, remplissage, opacité, texte : tout se change après coup', '<b>Clic droit</b> : avancer, reculer d’un niveau, dupliquer, supprimer', '<b>Anciens dessins</b> conservés et modifiables avec le même panneau'],
      art: 'palette', accent: '#8a4b9c', accent2: '#3d6bb5', dur: 9000 },
    { title: 'Le clic droit arrive sur les <em>onglets</em>', text: 'Dans la barre d’onglets, un clic droit ouvre un petit menu.',
      bullets: ['<b>Renommer</b> l’onglet sur place', '<b>Afficher dans la bibliothèque</b> : le bon dossier, la séance en évidence', '<b>Afficher à côté</b> : un second volet, sans glisser'],
      art: 'storage', accent: '#2e8b6a', accent2: '#33658a', dur: 8500 },
    { title: 'Un accueil plus <em>direct</em>', text: 'Moins de fenêtres, plus de place pour vos cours.',
      bullets: ['<b>Renommer</b> une séance là où elle est : Entrée valide, Échap annule', '<b>Cours récents</b> : le même clic droit que dans la liste', '<b>Barre latérale</b> : un bouton la masque, le choix est mémorisé'],
      art: 'cards', accent: '#b3762a', accent2: '#2e8b6a', dur: 8500 },
    { title: 'Deux <em>corrections</em>', text: 'Deux petits agacements en moins.',
      bullets: ['<b>Fautes dans les tableaux</b> : le clic droit propose enfin les corrections', '<b>Menu des onglets</b> : il ne saute plus à gauche quand on ferme un onglet'],
      art: 'spell', accent: '#c04343', accent2: '#33658a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6500 }
  ]
});

AlixoWhatsNew.register('1.49.1', {
  scenes: [
    { kind: 'intro', kicker: 'Correctif installé', title: 'Coco vous <em>répond</em>', text: 'Le chat d’Alixo AI refusait toute question : c’est réparé.', dur: 6500 },
    { title: 'Le chat <em>fonctionne</em>', text: 'Posez une question sur le cours : la réponse arrive, mot après mot.',
      bullets: ['<b>Réparé</b> : plus de « Demande refusée »', '<b>Quiz</b> et <b>fiche</b> n’étaient pas touchés', '<b>Toujours</b> sur l’ordinateur, rien n’est envoyé'],
      art: { image: 'nouveautes/1.49.0-coco.png', alt: 'Coco répond dans le panneau Alixo AI' }, accent: '#2e8b6a', accent2: '#33658a', dur: 11000 },
    { title: 'Coco <em>s’étonne</em> quand vous écrivez', text: 'Dès que vous tapez un message, la mascotte ouvre de grands yeux.',
      bullets: ['<b>Bouche en « o »</b> pendant la frappe', '<b>Sourire</b> retrouvé quand le champ se vide ou qu’elle répond', '<b>Fondu</b> discret, coupé si le système réduit les animations'],
      art: { image: 'nouveautes/1.49.1-coco-oh.png', alt: 'Coco surprise, bouche en « o »' }, accent: '#b3762a', accent2: '#2e8b6a', dur: 11000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 8000 }
  ]
});
