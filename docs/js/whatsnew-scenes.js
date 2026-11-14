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
   Aperçu : index.html?nouveautes=1.50.0 (ou nouveautes.html?v=1.50.0 en page seule).
   ============================================================ */
'use strict';

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

AlixoWhatsNew.register('1.49.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Dites bonjour<br>à <em>Coco</em>', text: 'Alixo AI s’ouvre à côté du cours, et sa mascotte répond à vos questions.', dur: 5500 },
    { title: 'Alixo AI, à <em>côté</em> du cours', text: 'Le bouton Alixo AI (ou F8) ouvre un panneau sur la moitié droite de l’écran, comme un PDF.',
      bullets: ['<b>Le cours</b> reste visible et modifiable à gauche', '<b>Plus d’onglet</b> : un panneau qu’on redimensionne et qu’on referme', '<b>Depuis</b> une séance, une présentation ou un tableur'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v16M15.5 9h3M15.5 12.5h3M15.5 16h3"/></svg>' }, accent: '#2e8b6a', accent2: '#33658a', dur: 8000 },
    { title: '<em>Coco</em> a lu votre cours', text: 'Posez une question : Coco répond en s’appuyant sur ce qui est écrit dans le document ouvert.',
      bullets: ['<b>Réponse</b> en direct, mot après mot, avec Stop à tout moment', '<b>Mots importants</b> en gras, listes courtes', '<b>Sur l’ordinateur</b> : rien n’est envoyé à un service d’IA'],
      art: { image: 'nouveautes/1.49.0-coco.png', alt: 'Coco, la mascotte d’Alixo, cachée derrière la zone de saisie' }, accent: '#2e8b6a', accent2: '#b3762a', dur: 8500 },
    { title: 'Des fiches de révision <em>colorées</em>', text: 'La carte Fiche de révision produit une fiche en cartes de couleur, comme une fiche faite à la main.',
      bullets: ['<b>À retenir</b>, grandes idées, définitions, dates clés, mots-clés', '<b>Astuce</b> et pièges, cases à cocher pour s’auto-évaluer', '<b>Insérer</b> dans la séance, copier, imprimer en couleur'],
      art: { image: 'nouveautes/1.49.0-fiche.png', alt: 'Une fiche de révision en cartes colorées' }, accent: '#b3762a', accent2: '#8a4b9c', dur: 8500 },
    { title: 'Le quiz, en <em>fenêtre</em>', text: 'La carte Quiz ouvre une fenêtre : paramétrage, puis les questions, sans quitter le cours.',
      bullets: ['<b>Première question</b> jouée pendant que les suivantes s’écrivent', '<b>Score</b> rappelé dans le fil du chat, avec Rejouer', '<b>Enregistrer</b> comme document Quiz, imprimer'],
      art: 'quiz', accent: '#3d6bb5', accent2: '#2e8b6a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6500 }
  ]
});
