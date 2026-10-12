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
   Aperçu : index.html?nouveautes=1.30.0 (ou nouveautes.html?v=1.30.0 en page seule).
   ============================================================ */
'use strict';

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

AlixoWhatsNew.register('1.29.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Alixo <em>Mail</em> arrive,<br>et l’éditeur se corrige', text: 'Une messagerie à vous, un compte mieux protégé, trois gênes de l’éditeur réglées — en moins d’une minute.', dur: 5000 },
    { title: 'Votre adresse <em>@alixoapp.com</em>', text: 'Alixo Mail est une messagerie indépendante de l’application : seul votre compte Alixo est commun.',
      bullets: ['<b>Webmail</b> : dossiers, fils, recherche, pièces jointes, raccourcis, sombre', '<b>Outlook, Apple Mail, téléphone</b> : mots de passe d’application, configuration automatique', '<b>Répondeur, filtres, alias</b> réglés depuis les paramètres', '<b>Ouverture</b> dès que le serveur sera en ligne : vous serez prévenu ici'],
      art: { icon: '✉️' }, accent: '#2e8b6a', accent2: '#1d8a5e', dur: 8500 },
    { title: 'Une adresse <em>confirmée</em>', text: 'À l’inscription par e-mail, un lien de confirmation protège désormais votre compte avant la première ouverture.',
      bullets: ['<b>Un clic</b> dans l’e-mail reçu, Alixo s’ouvre tout seul', '<b>Pas reçu ?</b> Renvoyer l’e-mail ou changer d’adresse', '<b>Comptes existants</b> : rien ne bloque, la cloche propose le lien'],
      art: 'list', accent: '#33658a', accent2: '#3d6bb5', dur: 7000 },
    { title: 'Le <em>double-clic</em> entre les blocs', text: 'Double-cliquez sous le dernier bloc, entre deux blocs ou au-dessus du premier : un paragraphe s’insère à cet endroit, aussi en vue par pages.',
      bullets: ['<b>Sous le dernier bloc</b> : bas de la feuille, fin de page ou fond gris', '<b>Entre deux blocs</b> espacés : titre, tableau, image', '<b>Au-dessus du premier</b> : un paragraphe en tête'],
      art: 'text', accent: '#b3762a', accent2: '#33658a', dur: 7500 },
    { title: 'Chacun ses <em>spécialités</em>', text: 'Les blocs d’une spécialité que vous n’avez pas choisie ne s’insèrent plus, par aucune porte.',
      bullets: ['<b>Barre d’outils, bibliothèque de formules, graphiques</b> : filtrés selon votre profil', '<b>Collés depuis un autre cours</b> : ils deviennent du texte simple', '<b>Profil conservé</b> lors de la synchronisation entre appareils'],
      art: 'cards', accent: '#8a4b9c', accent2: '#c04343', dur: 7500 },
    { title: 'Les fautes <em>mineures</em> se corrigent seules', text: 'Un accent oublié, une lettre doublée ou inversée repérés plus tard par l’IA : la correction s’applique comme une faute de frappe, sans Tab.',
      bullets: ['<b>Un seul mot</b>, d’une lettre ou d’un accent, vers un mot connu', '<b>Ctrl+Z</b> pour revenir ; le mot est appris', '<b>Accords et homophones</b> restent proposés sous le paragraphe'],
      art: 'text', accent: '#c04343', accent2: '#b3762a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.28.1', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Une <em>correction</em> pour le quiz', text: 'Le fichier audio personnalisé s’importe à nouveau.', dur: 4500 },
    { title: 'Votre <em>musique</em> dans le quiz', text: 'Dans Quiz › Apparence › Musique, « Mon fichier audio » marche de nouveau : le bouton Choisir… ouvre bien la boîte de sélection.',
      bullets: ['<b>Choisir…</b> : un morceau à vous (25 Mo au plus), gardé sur cet appareil', '<b>Écoute ▶</b> des musiques intégrées de nouveau active', '<b>Thèmes</b> : les vignettes se choisissent comme avant'],
      art: { icon: '🎧' }, accent: '#8a4b9c', accent2: '#b3762a', dur: 8000 },
    { title: 'Pour mémoire : l’IA est <em>ouverte</em>', text: 'Depuis la 1.28, la correction par IA tourne sur Qwen3.8-27B, un modèle libre : vous choisissez où il tourne dans Paramètres › Correction par IA.',
      bullets: ['<b>OpenRouter</b> ou <b>Alibaba Cloud</b> : un compte et une clé', '<b>Sur votre ordinateur</b> avec Ollama : gratuit, hors ligne, sans clé'],
      art: 'cards', accent: '#2e8b6a', accent2: '#33658a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});
