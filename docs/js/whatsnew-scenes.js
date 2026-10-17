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
   Aperçu : index.html?nouveautes=1.36.2 (ou nouveautes.html?v=1.36.2 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.36.2', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'L’IA <em>répond</em>', text: 'Une correction : l’IA sur l’appareil se chargeait mais refusait la première demande. C’est réparé.' },
    { title: 'Correction, quiz : <em>ça repart</em>', text: 'L’erreur « grammar matcher » au moment de corriger ou de générer un quiz ne se produit plus.',
      bullets: ['<b>F7</b> corrige, <b>F8</b> génère quiz et fiches, comme prévu', '<b>Réponses JSON</b> toujours garanties par le moteur', '<b>Rien à faire</b> : la mise à jour s’applique toute seule'],
      art: 'list', accent: '#2e8b6a', accent2: '#33658a', dur: 7000 },
    { title: 'Pour mémoire : <em>rien à régler</em>', text: 'Avec Alixo+, le modèle s’installe tout seul sur votre appareil et travaille hors ligne : vos notes ne quittent pas l’ordinateur.',
      bullets: ['<b>Paramètres › IA</b> : la taille du modèle, Désactiver, Effacer', '<b>Sans WebGPU</b> : un serveur reste possible'],
      art: { icon: '✨' }, accent: '#33658a', accent2: '#8a4b9c', dur: 6500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

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
