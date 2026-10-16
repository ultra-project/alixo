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
   Aperçu : index.html?nouveautes=1.35.0 (ou nouveautes.html?v=1.35.0 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.35.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Une grande<br><em>mise à jour</em>', text: 'Word comme une séance, l’écran partagé, le Quiz IA en onglet, les polices libres, les fichiers .alx et la table des matières.' },
    { title: 'Word, <em>comme une séance</em>', text: 'Un document Word ou OpenDocument s’ouvre dans un onglet, avec le plan et la barre d’outils d’Alixo — et garde son style.',
      bullets: ['<b>Onglet</b>, fil d’Ariane et volet du plan, comme un cours', '<b>Barre d’outils</b> au même endroit : police, taille, gras, couleurs', '<b>Même fichier</b> réécrit à l’enregistrement, pages intactes'],
      art: 'text', accent: '#3d6bb5', accent2: '#33658a', dur: 8000 },
    { title: 'L’<em>écran partagé</em>', text: 'Glissez un onglet vers un bord : le document s’ouvre à côté. Jusqu’à quatre documents à la fois.',
      bullets: ['<b>À droite ou à gauche</b> : deux séances côte à côte', '<b>En haut ou en bas</b> d’un volet : trois, puis quatre', '<b>On écrit partout</b>, tout reste synchronisé'],
      art: 'cards', accent: '#2e8b6a', accent2: '#3d6bb5', dur: 7500 },
    { title: 'Le Quiz IA en <em>onglet</em>', text: 'Plus de fenêtre surgissante : le quiz a son onglet, ses questions se lisent enfin, et Entrée passe à la suivante.',
      bullets: ['<b>Paramétrage</b> en cartes : type, nombre, niveau', '<b>Génération animée</b> : les questions arrivent une à une', '<b>Question visible</b>, « Suivante » réparé, score et révision'],
      art: 'quiz', accent: '#b3762a', accent2: '#2e8b6a', dur: 7500 },
    { title: 'Toutes les <em>polices</em>, par document', text: 'Les polices ne sont plus réservées à Alixo+ : le bouton Police change celle de la séance, de la présentation, du tableur ou de la planche.',
      bullets: ['<b>Police</b> dans la barre d’outils, comme dans Word', '<b>Du texte sélectionné</b> ? Seule la sélection change', '<b>Plan du cours</b> replié par défaut : le bouton latéral l’ouvre'],
      art: 'palette', accent: '#8a4b9c', accent2: '#b3762a', dur: 7500 },
    { title: 'Fichiers <em>.alx</em> et table des matières', text: 'Exportez un document en .alx pour le rouvrir avec Alixo ; insérez une table des matières qui suit vos titres.',
      bullets: ['<b>.alx-docs, -slide, -sheet, -quiz, -planche</b> : tout le document', '<b>Importer</b> ou double-clic sur le fichier (version PC)', '<b>Table des matières</b> : « / », cliquable, mise à jour seule'],
      art: 'list', accent: '#c04343', accent2: '#33658a', dur: 7500 },
    { title: 'Alixo <em>Business</em>', text: 'Sans entreprise, le tableau de bord présente les offres : 60 € par mois ou 690 € par an pour dix employés.',
      bullets: ['<b>Offre de base</b> : 10 employés dont 5 licences Alixo+', '<b>Pré-inscription</b> en attendant l’ouverture des paiements', '<b>Identité vérifiée</b> du dirigeant avant de créer l’entreprise'],
      art: 'chart', accent: '#2e8b6a', accent2: '#8a4b9c', dur: 7000 },
    { kind: 'outro', kicker: 'Bonnes révisions', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

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
