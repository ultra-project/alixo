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
   Aperçu : index.html?nouveautes=1.37.2 (ou nouveautes.html?v=1.37.0 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.37.2', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'AlixoAI <em>s’adapte</em>', text: 'Correction pour les ordinateurs où AlixoAI répondait « le moteur a été relancé, réessayez ».' },
    { title: 'Muette ? Elle <em>s’allège</em>', text: 'Si la carte graphique ne produit aucun mot, AlixoAI passe en version plus légère, recharge et rejoue votre demande, sans rien demander.',
      bullets: ['<b>Taille en dessous</b>, puis variante compatible', '<b>Délais</b> adaptés aux petites puces graphiques', '<b>Message précis</b> si rien ne marche malgré tout'],
      art: { icon: '✨' }, accent: '#b3762a', accent2: '#2e8b6a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.37.1', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'AlixoAI <em>démarre</em> partout', text: 'Correction pour les ordinateurs où AlixoAI répondait « WebGPU n’a pas pu démarrer ».' },
    { title: 'Fini le message <em>« WebGPU »</em>', text: 'Sur bien des portables, l’accélération graphique était refusée. La version PC la force désormais, et AlixoAI insiste avant de renoncer.',
      bullets: ['<b>Accélération graphique</b> forcée dans la version PC', '<b>Trois essais</b> pour trouver la carte graphique', '<b>« Réessayer »</b> refait vraiment l’essai, et le message dit pourquoi'],
      art: { icon: '✨' }, accent: '#2e8b6a', accent2: '#33658a', dur: 7500 },
    { title: 'Et toujours <em>AlixoAI</em>', text: 'Prête dès l’ouverture, le quiz dès la première question, des réponses bien plus rapides.',
      bullets: ['<b>Rien à installer</b>, rien à configurer', '<b>Quiz IA</b> : la suite s’écrit pendant que vous répondez'],
      art: 'quiz', accent: '#33658a', accent2: '#8a4b9c', dur: 6000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.37.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Voici <em>AlixoAI</em>', text: 'L’intelligence artificielle d’Alixo : prête dès l’ouverture, sans rien installer ni configurer.' },
    { title: 'Prête dès l’<em>ouverture</em>', text: 'AlixoAI se prépare toute seule, en silence. Plus de serveur, de clé ni de réglage de modèle.',
      bullets: ['<b>Rien à installer</b>, rien à configurer', '<b>Paramètres › IA</b> : un simple interrupteur', '<b>Version PC et web</b> : la même AlixoAI'],
      art: { icon: '✨' }, accent: '#33658a', accent2: '#8a4b9c', dur: 7000 },
    { title: 'Le quiz commence <em>tout de suite</em>', text: 'La première question arrive en quelques secondes ; les suivantes s’écrivent pendant que vous répondez.',
      bullets: ['<b>Une question</b> par passage du cours', '<b>Vous rattrapez l’IA ?</b> Une carte patiente pour vous', '<b>Fini</b> les minutes d’attente avant la première question'],
      art: 'quiz', accent: '#2e8b6a', accent2: '#b3762a', dur: 7500 },
    { title: 'Des réponses bien plus <em>rapides</em>', text: 'Consignes plus courtes, réponses deux à trois fois moins longues à produire, lots courts enchaînés.',
      bullets: ['<b>Correction</b> (F7 et frappe) et mise en forme accélérées', '<b>Fiche de révision</b> rédigée partie par partie, sous vos yeux', '<b>Conversation suivie</b> : AlixoAI ne relit pas sa consigne'],
      art: 'text', accent: '#b3762a', accent2: '#33658a', dur: 7500 },
    { title: 'Discrète, <em>vraiment</em>', text: 'Rien ne s’affiche tant que vous ne demandez rien ; la barre en bas à droite ne paraît que si une demande attend.',
      bullets: ['<b>« AlixoAI rédige · n mots »</b> pendant une réponse', '<b>Fermeture brutale</b> : AlixoAI repart plus légère'],
      art: 'list', accent: '#8a4b9c', accent2: '#2e8b6a', dur: 6500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});
