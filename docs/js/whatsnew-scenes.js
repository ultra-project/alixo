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
   Aperçu : index.html?nouveautes=1.32.0 (ou nouveautes.html?v=1.32.0 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.32.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Voici <em>Alixo Business</em>', text: 'Alixo pour une entreprise : une équipe, des licences Alixo+, le partage entre collègues. Et deux widgets plus dociles.', dur: 5500 },
    { title: 'Une <em>entreprise</em>, une équipe', text: 'Le dirigeant invite ses employés par un code ; chacun crée son compte professionnel, séparé de ses cours personnels.',
      bullets: ['<b>10 employés</b>, dont 5 licences Alixo+ à attribuer d’un interrupteur', '<b>Paramètres › Entreprise</b> : qui est en ligne, rôles, code d’invitation', '<b>Modérateurs</b> nommés par le dirigeant'],
      art: { image: 'logo-business.png', alt: 'Alixo Business' }, accent: '#2e8b6a', accent2: '#33658a', dur: 8000 },
    { title: 'Partager en <em>4 lettres</em>', text: 'Dans la fenêtre Partager, tapez quatre lettres du nom d’un collègue : il apparaît, avec sa présence en direct.',
      bullets: ['<b>Sans e-mail ni pseudo</b> : la liste des collègues suffit', '<b>Vers l’extérieur</b> : un modérateur autorise, l’invitation part toute seule', '<b>À toute l’entreprise</b> : séance, dossier ou fichier pour tous, en lecture'],
      art: 'cards', accent: '#33658a', accent2: '#2e8b6a', dur: 8500 },
    { title: 'Des widgets plus <em>dociles</em>', text: 'Deux corrections demandées : un widget ne passe plus devant vos fenêtres, et on le déplace d’un appui long.',
      bullets: ['<b>Derrière les fenêtres</b> : un widget posé ne vous interrompt plus', '<b>Appui long</b> : il tremble, vous le glissez, l’emplacement est enregistré', '<b>Partout sur le widget</b>, plus de zone de prise en haut'],
      art: 'board', accent: '#b3762a', accent2: '#3d6bb5', dur: 8000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.31.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Des widgets sur votre <em>bureau</em>', text: 'Tâches, agenda, minuteur, Jour J… posés sur le bureau de l’ordinateur, toujours à jour. Avec Alixo+.', dur: 5000 },
    { title: 'Composez votre <em>bureau</em>', text: 'Paramètres › Widgets : un faux bureau aux dimensions de votre écran, et un catalogue à glisser-déposer.',
      bullets: ['<b>Glissez</b> un widget du catalogue, déplacez-le, cliquez-le pour ses options', '<b>Aperçu</b> en vrai, avec vos données, avant de l’ajouter', '<b>Disposition</b> enregistrée avec le compte, d’un ordinateur à l’autre'],
      art: 'board', accent: '#33658a', accent2: '#b3762a', dur: 7500 },
    { title: 'Votre <em>journée</em> en un coup d’œil', text: 'Les widgets vivent avec l’application : cocher une tâche, lancer le minuteur, rouvrir une séance, sans ouvrir Alixo.',
      bullets: ['<b>Tâches du jour</b> : à cocher depuis le bureau, une ligne pour en ajouter', '<b>Agenda</b> : le cours en cours et le temps qu’il reste', '<b>Minuteur</b> : 25 min, 5 min, 45 min… le même que dans les cours', '<b>Jour J</b> : les jours restants avant le partiel, en grand'],
      art: 'list', accent: '#2e8b6a', accent2: '#c04343', dur: 8500 },
    { title: 'Pour <em>réviser</em> un peu chaque jour', text: 'Une question de vos quiz, votre semaine en chiffres, vos dernières séances et un post-it sous les yeux.',
      bullets: ['<b>Question du jour</b> : quatre réponses, la bonne s’allume', '<b>Bilan de la semaine</b> : mots écrits, jours d’affilée, graphique', '<b>Reprendre</b>, <b>Pense-bête</b>, <b>Horloge</b> avec le numéro de semaine'],
      art: 'quiz', accent: '#2e8b8b', accent2: '#8a4b9c', dur: 8000 },
    { title: 'Toujours <em>à jour</em>', text: 'Fermer la fenêtre ne quitte plus Alixo : il reste dans la zone de notification pour tenir les widgets à jour.',
      bullets: ['<b>Toujours au-dessus</b> des fenêtres, ou posés sur le bureau (Windows + D)', '<b>Lancement</b> avec la session : les widgets apparaissent directement', '<b>Opacité</b> réglable, thème clair ou sombre suivi'],
      art: { icon: '🖥️' }, accent: '#3d6bb5', accent2: '#2e8b6a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.30.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Alixo+ s’achète <em>en ligne</em>', text: 'Mensuel ou annuel, paiement sécurisé, activation immédiate — et vous gérez tout depuis l’application.', dur: 5000 },
    { title: 'Deux <em>formules</em>, au choix', text: 'Paramètres › Alixo+ › Passer à Alixo+ : choisissez, puis payez sur la page sécurisée Stripe.',
      bullets: ['<b>14,99 € par mois</b> : sans engagement, résiliable à tout moment', '<b>149,99 € par an</b> : deux mois offerts, soit 12,50 € par mois', '<b>Carte, Apple Pay, Google Pay</b> : Alixo ne voit jamais votre numéro'],
      art: 'cards', accent: '#b3762a', accent2: '#33658a', dur: 8000 },
    { title: 'Activation <em>immédiate</em>', text: 'Dès le paiement, Alixo+ s’active sur votre compte, sur tous vos appareils : plus de clé à recopier.',
      bullets: ['<b>PC, Mac, web, téléphone</b> : une seule fois pour tout', '<b>Thèmes, polices, IA, tâches, stockage</b> : tout s’ouvre aussitôt', '<b>Clés d’activation</b> : elles continuent de fonctionner'],
      art: { icon: '⚡' }, accent: '#2e8b6a', accent2: '#b3762a', dur: 7500 },
    { title: 'Vous gardez la <em>main</em>', text: 'Paramètres › Alixo+ › Votre abonnement montre où vous en êtes, et le bouton Gérer mon abonnement fait le reste.',
      bullets: ['<b>Résilier</b> en deux clics : l’accès reste ouvert jusqu’à la fin de la période payée', '<b>Changer</b> de carte, passer du mensuel à l’annuel, retrouver vos factures', '<b>Paiement échoué ?</b> Alixo vous prévient, l’accès est conservé quelques jours'],
      art: 'list', accent: '#3d6bb5', accent2: '#8a4b9c', dur: 8000 },
    { title: 'Vos <em>droits</em>, avant de payer', text: 'Une fenêtre claire rappelle l’offre, la durée, la résiliation et le droit de rétractation, puis demande votre accord.',
      bullets: ['<b>Conditions de vente</b> et confidentialité à accepter', '<b>Moins de 18 ans</b> : un lien de paiement à transmettre à un parent'],
      art: { icon: '🛡️' }, accent: '#8a4b9c', accent2: '#c04343', dur: 6500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});
