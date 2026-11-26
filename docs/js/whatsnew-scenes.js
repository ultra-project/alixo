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
   Aperçu : index.html?nouveautes=1.59.0 (ou nouveautes.html?v=1.59.0 en page seule).
   ============================================================ */
'use strict';

/* 1.59 : lien de partage sans compte, scan qui trouve la feuille, quiz IA / onglets / tâches redessinés, « / » fantôme corrigé */
AlixoWhatsNew.register('1.59.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Partagez d’un <em>lien</em>,<br>et trois écrans refaits', text: 'Un cours ouvert à qui a le lien, un scan plus sûr, et des corrections : en moins d’une minute.', dur: 5000 },
    { title: 'Un cours, un <em>lien</em>', text: 'Boîte Partager : « Toute personne disposant du lien peut consulter ». Pas besoin de compte pour lire.',
      bullets: ['<b>Sans compte</b> : le lien s’ouvre en lecture seule, sur ordinateur ou téléphone', '<b>Modifier</b> demande un compte : « Créer un compte » inscrit au partage', '<b>Vous gardez la main</b> : désactiver le lien coupe l’accès aussitôt'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1 0l2.1-2.1a5 5 0 0 0-7.1-7.1L11 4.9"/><path d="M14 11a5 5 0 0 0-7.1 0l-2.1 2.1a5 5 0 0 0 7.1 7.1L13 19.1"/></svg>' }, accent: '#33658a', accent2: '#2e8b6a', dur: 8000 },
    { title: 'Le scan <em>trouve</em> la feuille', text: 'Bois, marbre, nappe à carreaux, table blanche, main dans le cadre : les quatre coins tombent juste.',
      bullets: ['<b>Au pixel près</b> sur l’écran « Vérifiez le cadrage »', '<b>Difficile ?</b> Le meilleur cadre trouvé est proposé, un coin se glisse au doigt', '<b>Sur le téléphone</b> : rien n’est envoyé pour l’analyse'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8.5 7.5 16 8.5 15 16.5 7.5 15.5Z"/></svg>' }, accent: '#2e8b6a', accent2: '#3d6bb5', dur: 7500 },
    { title: 'Le <em>quiz</em> d’Alixo AI, refait', text: 'Réglages, préparation, questions, correction et résultats : cinq écrans clairs.',
      bullets: ['<b>Commencer</b> dès la première question prête', '<b>Clavier</b> : A B C D, V F, Entrée pour la suivante', '<b>Résultats</b> : score en anneau, « Refaire les questions ratées »'],
      art: 'quiz', accent: '#b3762a', accent2: '#c04343', dur: 7500 },
    { title: 'Des <em>onglets</em> en cartes', text: 'Jusqu’à trois : des pastilles. Au-delà : une fenêtre qui montre tous les onglets.',
      bullets: ['<b>Cartes</b> : clic pour ouvrir, double-clic pour renommer', '<b>Glisser</b> pour réordonner, « … » pour dupliquer ou supprimer', '<b>Clavier</b> : flèches, Entrée, F2, Échap'],
      art: 'storage', accent: '#3d6bb5', accent2: '#8a4b9c', dur: 7000 },
    { title: 'Des <em>tâches</em> plus lisibles', text: 'Bibliothèque › Tâches : vos vues et catégories à gauche, une barre d’ajout à droite.',
      bullets: ['<b>Ajouter</b> : Entrée, ou « ! », « !! », « #catégorie » dans la phrase', '<b>Échéance, priorité, catégorie</b> en trois boutons', '<b>Menu « … »</b> sur chaque tâche, terminées repliées'],
      art: 'list', accent: '#8a4b9c', accent2: '#33658a', dur: 7000 },
    { kicker: 'Correction', title: 'Fini le « / » <em>fantôme</em>', text: 'Le menu « / » s’ouvre toujours, et le caractère ne reste jamais dans votre texte.',
      bullets: ['<b>AZERTY, clavier virtuel, IME</b> : même résultat', '<b>Listes</b> : l’aide-mémoire est enfin à côté de la puce', '<b>Collage, Échap, clic</b> referment le menu proprement'],
      art: 'text', accent: '#c04343', accent2: '#b3762a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

/* 1.58 : interface du quiz refaite — éditeur, Apparence en grille, Résultats en cartes, écrans de jeu et page des participants */
AlixoWhatsNew.register('1.58.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Le <em>quiz</em> fait<br>peau neuve', text: 'Éditeur, apparence, résultats et écrans de jeu redessinés — vos quiz ne changent pas.', dur: 5000 },
    { title: 'Un éditeur <em>refait</em>', text: 'Déroulé en cartes à gauche, question au centre, palette des types à droite.',
      bullets: ['<b>Bonne réponse</b> : une case à cocher sur chaque proposition', '<b>Déroulé</b> : type, temps et points sous chaque question', '<b>Aperçu</b> des participants, à masquer d’un bouton'],
      art: 'quiz', accent: '#33658a', accent2: '#2e8b6a', dur: 7500 },
    { title: 'Les 14 <em>thèmes</em> en grille', text: 'Bouton Apparence : tous les thèmes d’un coup d’œil, le vôtre coché.',
      bullets: ['<b>Vignette</b>, nom et description sur chaque tuile', '<b>Animé</b> : l’étiquette des six thèmes à fond animé', '<b>Musique</b> : une case déploie les réglages du son'],
      art: 'palette', accent: '#8a4b9c', accent2: '#b3762a', dur: 7000 },
    { title: 'Des <em>résultats</em> en cartes', text: 'Bouton Résultats : une carte par partie, Excel et CSV à portée de main.',
      bullets: ['<b>Par question</b> : la réussite en barres', '<b>Classement</b> : dix premiers, puis « Afficher les autres »', '<b>Annuler</b> une suppression depuis le message'],
      art: 'chart', accent: '#2e8b6a', accent2: '#3d6bb5', dur: 7000 },
    { title: 'Jouer, <em>plus lisible</em>', text: 'En test, en direct et sur le téléphone des participants.',
      bullets: ['<b>Bandeau</b> : question, type, chrono en pastille, score', '<b>Salle d’attente</b> : code et QR d’un côté, participants de l’autre', '<b>Réponses</b> du groupe en barres, la bonne mise en avant', '<b>Téléphone</b> : lisible même sur un petit écran'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 5.5h3M11 18.5h2"/><path d="M9 9.5h6M9 12.5h6"/></svg>' }, accent: '#3d6bb5', accent2: '#c04343', dur: 8000 },
    { kicker: 'Accessibilité', title: 'Pour <em>tout le monde</em>', text: 'Clavier, lecteur d’écran et contraste ont été soignés.',
      bullets: ['<b>Clavier</b> : le déroulé se parcourt avec Tab et Entrée', '<b>Boutons</b> de 44 px, chaque icône a son libellé', '<b>Contraste</b> des lettres garanti sur les 14 thèmes'],
      art: 'list', accent: '#b3762a', accent2: '#2e8b6a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

/* 1.57 : scan qui détecte la feuille, Télécharger au clic droit, police Geist, encadrés et collage corrigés */
AlixoWhatsNew.register('1.57.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Un scan <em>plus malin</em>,<br>et des corrections', text: 'Trois nouveautés et des corrections, en moins d’une minute.', dur: 5000 },
    { title: 'Le scan <em>trouve</em> la feuille', text: 'Photographiez la page : Alixo repère ses quatre coins, la redresse et enlève la table autour.',
      bullets: ['<b>Automatique</b> : la feuille est détectée et remise d’équerre', '<b>Vérifiez</b> le cadrage et déplacez les coins au doigt', '<b>Envoyer sans recadrer</b> ou <b>reprendre</b> la photo'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8.5 7.5 16 8.5 15 16.5 7.5 15.5Z"/></svg>' }, accent: '#2e8b6a', accent2: '#33658a', dur: 8000 },
    { title: '<em>Télécharger</em> d’un clic droit', text: 'Clic droit sur une séance ou un fichier de la bibliothèque, sans l’ouvrir.',
      bullets: ['<b>Séance</b> : PDF, Word, page web ou fichier Alixo', '<b>PDF et fichiers</b> : enregistrés tels quels sur l’ordinateur', '<b>Partout</b> : liste, arbre, onglets, séances partagées'],
      art: { svg: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>' }, accent: '#3d6bb5', accent2: '#b3762a', dur: 7000 },
    { title: 'La police <em>Geist</em>', text: 'La police de l’interface d’Alixo, maintenant pour vos cours aussi.',
      bullets: ['<b>Geist</b> et <b>Geist Mono</b> dans le choix des polices', '<b>Gratuite</b>, pour un passage ou tout le document', '<b>Fidèle</b> dans les PDF et les pages web exportés'],
      art: 'text', accent: '#8a4b9c', accent2: '#3d6bb5', dur: 7000 },
    { kicker: 'Corrections', title: 'Des <em>corrections</em>', text: 'L’écriture au quotidien, plus fluide.',
      bullets: ['<b>Encadrés</b> : deux fois Entrée en fin d’encadré pour en sortir, à chaque fois', '<b>Coller</b> sur une sélection la remplace, au lieu d’ajouter dessous', '<b>Recadrer</b> une image : le cadre tombe juste, plus de doublon'],
      art: 'list', accent: '#b3762a', accent2: '#c04343', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});
