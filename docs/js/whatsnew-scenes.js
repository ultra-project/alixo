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
   Aperçu : index.html?nouveautes=1.34.1 (ou nouveautes.html?v=1.34.1 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.34.1', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Votre Word,<br><em>tel quel</em>', text: 'Les documents Word et OpenDocument s’ouvrent et se modifient sans rien perdre, le zoom agrandit toute la page, le Quiz IA est réparé.' },
    { title: 'Le document <em>reste le même</em>', text: 'Modifier dans Alixo ouvre un vrai traitement de texte : pages, polices, images, tout est à sa place.',
      bullets: ['<b>Mêmes pages</b> : format, marges, en-têtes, pieds, numéros', '<b>Même mise en forme</b> : polices, listes, tableaux, encadrés', '<b>Enregistrer</b> remplace le même fichier, prêt pour Word'],
      art: 'text', accent: '#3d6bb5', accent2: '#33658a', dur: 8000 },
    { title: 'On écrit <em>comme dans Word</em>', text: 'Une barre d’outils familière et les raccourcis habituels, dans le fichier lui-même.',
      bullets: ['<b>Police, taille</b>, gras, souligné, couleur, alignement', '<b>Ctrl + Z</b>, Ctrl + B, Ctrl + Entrée pour un saut de page', '<b>Page 2 sur 9</b> et le nombre de mots en bas'],
      art: 'cards', accent: '#2e8b6a', accent2: '#3d6bb5', dur: 7500 },
    { title: 'Le zoom <em>façon Word</em>', text: 'Toute la feuille s’agrandit, pas seulement le texte : les lignes restent coupées au même endroit.',
      bullets: ['<b>Ctrl + molette</b>, Ctrl + / −, Ctrl 0', '<b>Séances</b> et documents Word', '<b>Curseur de zoom</b> et « largeur de page »'],
      art: 'palette', accent: '#8a4b9c', accent2: '#b3762a', dur: 7000 },
    { title: 'Le Quiz IA <em>réparé</em>', text: 'Il marche maintenant avec les clés dont le crédit est limité, comme la correction par IA.',
      bullets: ['<b>Lots de 5 questions</b> : des demandes plus courtes', '<b>Nouvel essai</b> automatique si le crédit est juste', '<b>Imprimer / PDF</b> aussi sur la version PC'],
      art: 'quiz', accent: '#b3762a', accent2: '#2e8b6a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonnes révisions', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.34.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Révisez avec<br>l’<em>IA</em>', text: 'Des quiz et des fiches de révision générés depuis vos cours, vos documents Word modifiables, et le zoom partout.' },
    { title: 'Un <em>quiz</em> tiré de votre cours', text: 'Dans une séance, une présentation ou un tableur : ✨ Quiz IA (ou F8), et l’IA vous interroge sur vos propres notes.',
      bullets: ['<b>QCM</b>, vrai / faux, réponses courtes ou mélange', '<b>5 à 20 questions</b>, trois niveaux de difficulté', '<b>Corrigé sur place</b>, avec l’explication tirée du cours'],
      art: 'quiz', accent: '#b3762a', accent2: '#33658a', dur: 8000 },
    { title: 'Une <em>fiche de révision</em> en un clic', text: 'La même fenêtre rédige une fiche : résumé, points clés, définitions, à retenir, pièges.',
      bullets: ['<b>Insérer</b> à la fin de la séance, en titres et encadrés', '<b>Nouvelle séance</b> ou copie du texte', '<b>Imprimer / PDF</b>, aussi pour les quiz'],
      art: 'text', accent: '#2e8b6a', accent2: '#b3762a', dur: 7500 },
    { title: 'Word et ODT <em>modifiables</em>', text: 'Un document Word ou OpenDocument s’ouvre dans Alixo et devient une séance que l’on modifie.',
      bullets: ['<b>Modifier dans Alixo</b> : titres, listes, tableaux, images repris', '<b>Retour en Word</b> par Exporter › Word', '<b>.odt</b> lisibles partout où les .docx l’étaient'],
      art: 'cards', accent: '#3d6bb5', accent2: '#2e8b6a', dur: 7500 },
    { title: 'Le <em>zoom</em> des documents', text: 'Ctrl + molette, Ctrl + / −, ou le contrôle « − 100 % + » de la barre d’outils.',
      bullets: ['<b>Séances</b>, présentations et tableurs', '<b>Mémorisé</b> par type de document sur l’appareil', '<b>Version PC</b> : le menu Affichage agrandit le document ouvert'],
      art: 'palette', accent: '#8a4b9c', accent2: '#33658a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonnes révisions', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.33.1', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Votre entreprise,<br><em>toujours là</em>', text: 'Une correction pour Alixo Business : le tableau de bord retrouve l’entreprise de son dirigeant.', dur: 5000 },
    { title: 'Fini, « <em>Aucune entreprise</em> »', text: 'Le dirigeant retrouve son entreprise sur le tableau de bord en ligne et dans Paramètres › Entreprise.',
      bullets: ['<b>Lien réparé</b> tout seul entre le compte et l’entreprise', '<b>Erreur réseau</b> : le lien n’est plus effacé', '<b>Deux comptes</b> pour une adresse ? L’identifiant s’affiche'],
      art: { image: 'logo-business.png', alt: 'Alixo Business' }, accent: '#2e8b6a', accent2: '#33658a', dur: 8000 },
    { title: 'Rappel de la <em>1.33</em>', text: 'Si vous arrivez de la 1.32 : voici ce qui a changé la semaine dernière.',
      bullets: ['<b>Fond d’écran</b> derrière vos documents (Alixo+)', '<b>Bibliothèque des blocs</b> avec aperçu animé', '<b>Messagerie d’équipe</b> pour Alixo Business'],
      art: 'palette', accent: '#8a4b9c', accent2: '#b3762a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});
