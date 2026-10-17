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
   Aperçu : index.html?nouveautes=1.36.4 (ou nouveautes.html?v=1.36.4 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.36.4', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'L’IA, <em>sans gel</em>', text: 'Le modèle sur votre appareil ne fige plus Alixo, et vos demandes passent devant tout le reste.' },
    { title: 'Alixo reste <em>fluide</em>', text: 'Le moteur tourne désormais à part : vous continuez d’écrire et de naviguer pendant qu’il charge ou qu’il rédige.',
      bullets: ['<b>Chargement</b> du modèle sans écran figé', '<b>Correction et quiz</b> rédigés pendant que vous travaillez', '<b>Rien à régler</b> : la mise à jour s’applique toute seule'],
      art: 'text', accent: '#33658a', accent2: '#2e8b6a', dur: 7000 },
    { title: 'La réponse <em>avance</em> sous vos yeux', text: 'La barre en bas à droite compte les mots rédigés ; un moteur bloqué est détecté en moins d’une minute et relancé.',
      bullets: ['<b>« Réponse en cours · n mots »</b> pendant la rédaction', '<b>Plus d’attente</b> de plusieurs minutes pour rien', '<b>Délais</b> plus courts, moteur relancé seulement s’il est muet'],
      art: { icon: '✨' }, accent: '#b3762a', accent2: '#33658a', dur: 7000 },
    { title: 'Vos demandes <em>passent devant</em>', text: 'F7, le Quiz IA et la fiche n’attendent plus derrière la correction de la frappe : ils l’interrompent et passent en premier.',
      bullets: ['<b>F7 et F8</b> prioritaires, tout de suite', '<b>La frappe</b> ne charge plus le modèle ni ne s’empile'],
      art: 'quiz', accent: '#8a4b9c', accent2: '#2e8b6a', dur: 6500 },
    { title: 'Un modèle <em>adapté</em> à votre machine', text: '« Complet » n’est conseillé que sur carte NVIDIA ou Mac Apple Silicon ; ailleurs, « Équilibré ». Au choix dans Paramètres › IA.',
      bullets: ['<b>Fermeture brutale</b> pendant l’IA : modèle allégé au prochain démarrage', '<b>Version PC</b> : la fenêtre se recharge au lieu de rester blanche'],
      art: 'list', accent: '#2e8b6a', accent2: '#b3762a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

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
