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
   Aperçu : index.html?nouveautes=1.36.1 (ou nouveautes.html?v=1.36.1 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.36.1', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'L’IA, <em>sans réglage</em>', text: 'Elle s’installe toute seule sur votre appareil, et tourne désormais sur toutes les cartes graphiques.' },
    { title: 'Installée <em>toute seule</em>', text: 'Avec Alixo+, le modèle conseillé se télécharge de lui-même après l’ouverture : rien à cliquer, rien à choisir.',
      bullets: ['<b>Barre discrète</b> en bas à droite, puis « IA prête »', '<b>Chargé au démarrage</b> : F7 et F8 répondent tout de suite', '<b>Paramètres › IA</b> pour la taille, désactiver ou effacer'],
      art: { icon: '✨' }, accent: '#33658a', accent2: '#2e8b6a', dur: 7500 },
    { title: 'Toutes les <em>cartes graphiques</em>', text: 'Sur certains ordinateurs, le modèle refusait de démarrer : Alixo choisit maintenant la variante que la carte accepte.',
      bullets: ['<b>Corrigé</b> : l’erreur « Invalid ShaderModule » au chargement', '<b>Automatique</b> : la variante compatible est retenue pour la suite'],
      art: 'list', accent: '#b3762a', accent2: '#33658a', dur: 6500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.36.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'L’IA tourne<br><em>chez vous</em>', text: 'Le modèle d’intelligence artificielle s’installe dans Alixo et travaille sur votre appareil : sans serveur, sans clé, sans limite.' },
    { title: 'Téléchargé <em>une fois</em>, à vous pour toujours', text: 'Le modèle ouvert Qwen3 se télécharge à la première activation, puis reste sur l’appareil et marche hors ligne.',
      bullets: ['<b>Aucun compte</b>, aucune clé, aucun crédit à recharger', '<b>Aucune limite</b> : corrigez et révisez autant que vous voulez', '<b>Hors ligne</b> ensuite, même en amphi sans réseau'],
      art: { icon: '✨' }, accent: '#33658a', accent2: '#8a4b9c', dur: 7500 },
    { title: 'Vos notes ne <em>quittent</em> jamais l’ordinateur', text: 'Tout se calcule sur la carte graphique de votre machine : rien n’est envoyé à qui que ce soit.',
      bullets: ['<b>Confidentiel</b> : cours, quiz et fiches restent chez vous', '<b>Carte graphique</b> de l’ordinateur, dans le navigateur ou la version PC', '<b>Chrome, Edge, Safari 26</b> ou l’application Alixo'],
      art: 'text', accent: '#2e8b6a', accent2: '#33658a', dur: 7500 },
    { title: 'Trois tailles, <em>une conseillée</em>', text: 'Léger, Équilibré ou Complet : Alixo repère votre machine et vous conseille la taille qui lui va.',
      bullets: ['<b>Léger</b> (0,4 Go) : ordinateur modeste ou téléphone récent', '<b>Équilibré</b> (1,1 Go) : la plupart des portables', '<b>Complet</b> (2,4 Go) : carte graphique ou Mac récent'],
      art: 'cards', accent: '#b3762a', accent2: '#2e8b6a', dur: 7500 },
    { title: 'Correction, quiz, fiches : <em>tout</em> y passe', text: 'F7 corrige, F8 génère quiz et fiches de révision, l’analyse pendant la frappe propose titres et encadrés — avec le même modèle.',
      bullets: ['<b>Consignes</b> réécrites pour des réponses justes et rapides', '<b>Progression</b> visible pendant le téléchargement', '<b>Serveurs</b> (Ollama, OpenRouter…) toujours possibles en option'],
      art: 'quiz', accent: '#8a4b9c', accent2: '#b3762a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'Activez-la dans<br>Paramètres › IA', text: 'Un clic sur « Télécharger et activer », et c’est parti. Le détail est sur alixoapp.com/versions.', dur: 6000 }
  ]
});

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
