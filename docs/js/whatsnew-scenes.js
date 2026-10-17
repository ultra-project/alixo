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
   Aperçu : index.html?nouveautes=1.36.3 (ou nouveautes.html?v=1.36.3 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.36.3', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'L’IA, <em>fiable</em>', text: 'Le Quiz IA et la correction ne s’arrêtent plus sur une erreur du moteur. Rien à faire de votre côté.' },
    { title: 'Quiz et correction : <em>ça marche</em>', text: 'L’erreur « already disposed » au lancement d’un quiz venait d’un composant instable du moteur : Alixo ne l’utilise plus.',
      bullets: ['<b>F8</b> génère quiz et fiches, <b>F7</b> corrige', '<b>Réponses nettoyées</b> avant lecture : plus de surprise', '<b>Même modèle</b>, même qualité, sans la contrainte fragile'],
      art: 'quiz', accent: '#2e8b6a', accent2: '#33658a', dur: 7000 },
    { title: 'Le moteur se <em>relance</em> tout seul', text: 'En cas de pépin, Alixo recharge le modèle depuis l’appareil et rejoue la demande, sans rien vous demander.',
      bullets: ['<b>Une seconde tentative</b> automatique et silencieuse', '<b>Message d’erreur</b> seulement si elle échoue aussi'],
      art: { icon: '✨' }, accent: '#33658a', accent2: '#8a4b9c', dur: 6500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

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
