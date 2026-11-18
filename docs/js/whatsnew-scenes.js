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
   Aperçu : index.html?nouveautes=1.53.0 (ou nouveautes.html?v=1.53.0 en page seule).
   ============================================================ */
'use strict';

/* 1.53 : Workspace, pseudo, partage, couleur des encadrés, blocs cartes et frise */
AlixoWhatsNew.register('1.53.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Le <em>Workspace</em>,<br>et un partage plus clair', text: 'Six nouveautés, en moins d’une minute.', dur: 5500 },
    { title: 'Le <em>Workspace</em> : vos cours, pour tous', text: 'Un nouvel espace où chacun dépose ses cours et profite de ceux des autres.',
      bullets: ['<b>Déposer une séance</b> : titre, matière, niveau, étiquettes', '<b>Ajouter à ma bibliothèque</b> en un clic', '<b>Étoiles, commentaires</b> : les plus utiles remontent'],
      art: 'cards', accent: '#3d6bb5', accent2: '#b3762a', dur: 9000 },
    { title: 'Un <em>pseudo</em> pour chacun', text: 'C’est lui que voient les autres membres, jamais votre nom ni votre e-mail.',
      bullets: ['<b>Attribué</b> dès la connexion, par exemple « RenardLucide42 »', '<b>Modifiable</b> dans Paramètres › Compte, ou un autre au hasard'],
      art: { icon: '🦊' }, accent: '#8a4b9c', accent2: '#3d6bb5', dur: 7500 },
    { title: 'Le <em>partage</em>, revu', text: 'Une seule fenêtre : qui voit quoi, et comment ajouter quelqu’un.',
      bullets: ['<b>Peut consulter</b> ou <b>Peut modifier</b>, lisible pour chaque personne', '<b>Par pseudo</b> ou par e-mail, avec un message clair', '<b>Lien de partage</b> à copier, désactivable quand vous voulez'],
      art: 'list', accent: '#2e8b6a', accent2: '#33658a', dur: 8500 },
    { title: 'Les <em>encadrés</em> à vos couleurs', text: 'Paramètres › Apparence : une couleur par type d’encadré, avec aperçu.',
      bullets: ['<b>Définition, À retenir, Exemple, Bilan…</b> chacun sa teinte', '<b>Suit</b> le thème sombre, l’impression, le PDF et Word', '<b>Réinitialiser</b> revient aux couleurs d’origine'],
      art: 'palette', accent: '#b3762a', accent2: '#8a4b9c', dur: 8000 },
    { title: 'Des blocs plus <em>nets</em>', text: 'Cartes, frise, arbre, graphique : sans cadre bleu ni espace vide.',
      bullets: ['<b>Plus de contour bleu</b> quand vous écrivez dans une carte ou une frise', '<b>Plus d’espace vide</b> en dessous : les outils apparaissent au survol'],
      art: 'text', accent: '#33658a', accent2: '#2e8b6a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

/* 1.52 : illustrations dessinées (pas encore de captures ni de vidéo) */
const SCENES_152 = {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Coco <em>modifie</em> vos cours,<br>le téléphone <em>importe</em>', text: 'Six nouveautés, en moins d’une minute.', dur: 5500 },
    { title: 'Coco <em>modifie</em> le document', text: 'Demandez, Coco le fait dans le cours.',
      bullets: ['<b>Corrige les fautes</b>, met en encadré, ajoute une conclusion', '<b>Annuler les modifications</b> en un clic', '<b>Rien n’est supprimé</b> sans votre accord'],
      art: 'spell', accent: '#2e8b6a', accent2: '#b3762a', dur: 9000 },
    { title: 'Importer depuis le <em>téléphone</em>', text: 'Un QR code, et vos fichiers arrivent dans le dossier.',
      bullets: ['<b>PDF, Word, photos, audio…</b> jusqu’à 20 Mo', '<b>Effacés du serveur</b> dès leur arrivée'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/><path d="M9.5 8.5h2v2h-2zM12.5 8.5h2v2h-2zM9.5 11.5h2v2h-2z"/></svg>' }, accent: '#3d6bb5', accent2: '#2e8b6a', dur: 8000 },
    { title: 'Des <em>styles</em> enregistrés', text: 'Votre mise en forme préférée, sous un nom, en un clic.',
      art: 'palette', accent: '#8a4b9c', accent2: '#3d6bb5', dur: 6500 },
    { title: 'Le <em>bouton</em> de lien', text: 'Tapez « / » puis « bouton » : vers un cours, un fichier ou une page web.',
      art: 'cards', accent: '#b3762a', accent2: '#3d6bb5', dur: 6500 },
    { title: 'Et <em>aussi</em>', text: 'Des outils du quotidien revus.',
      bullets: ['<b>Minuteurs</b> : anneau de progression, En pause, Temps écoulé', '<b>Agenda</b> : toute la semaine, l’heure qu’il est', '<b>Correcteur</b> : les mots presque justes corrigés', '<b>Supprimer le fond</b> passe dans Alixo+'],
      art: 'list', accent: '#33658a', accent2: '#2e8b6a', dur: 9500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
};
AlixoWhatsNew.register('1.52.1', SCENES_152);   // 1.52.1 : correctif de Coco — même présentation que la 1.52.0
AlixoWhatsNew.register('1.52.0', SCENES_152);

AlixoWhatsNew.register('1.51.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Une <em>frise</em>, des images<br>et des dossiers mieux rangés', text: 'Cinq nouveautés et deux corrections, en moins d’une minute.', dur: 5500 },
    { title: 'La <em>frise</em> chronologique', text: 'Un nouveau bloc pour les dates : tapez « / » puis « frise ».',
      bullets: ['<b>Date libre</b> : « 1789 », « v. 1450 », « 1914-1918 »', '<b>Entrée</b> passe au champ suivant, puis à l’événement d’après', '<b>Verticale ou horizontale</b>, reprise dans le PDF et Word'],
      art: { image: 'nouveautes/1.51.0-frise.png', alt: 'Une frise chronologique dans un cours : quatre événements datés le long d’un rail' }, accent: '#3d6bb5', accent2: '#b3762a', dur: 8500 },
    { title: 'Clic droit sur une <em>image</em>', text: 'Une vraie boîte à outils, sans quitter le cours.',
      bullets: ['<b>Supprimer le fond</b>, calculé sur votre appareil (Alixo+ depuis la 1.52)', '<b>Régler</b> : luminosité, contraste, noir et blanc, rotation', '<b>Habiller</b> : coins arrondis, bordure, ombre', '<b>Réinitialiser</b> revient à l’original à tout moment'],
      art: { image: 'nouveautes/1.51.0-image.png', alt: 'Le menu d’outils ouvert à côté d’une image aux coins arrondis' }, accent: '#8a4b9c', accent2: '#3d6bb5', dur: 9500 },
    { title: '<em>Rechercher</em> et trier dans un dossier', text: 'Au-dessus de la liste de vos cours, un champ de recherche et un bouton de tri.',
      bullets: ['<b>Recherche</b> dans le dossier et ses sous-dossiers', '<b>Tri</b> par date, nom, type ou taille', '<b>Mémorisé</b> d’une fois sur l’autre'],
      art: 'cards', accent: '#2e8b6a', accent2: '#33658a', dur: 8000 },
    { title: 'Des encadrés plus <em>simples</em>', text: 'Bilan, définition, exemple : un fond léger, une fine barre de couleur, plus de cadre.',
      bullets: ['<b>Vos cours</b> en profitent sans rien changer', '<b>Copier-coller</b> : taille, couleur et surlignage suivent d’un cours à l’autre', '<b>Même</b> pour quelques mots pris au milieu d’un passage coloré'],
      art: { image: 'nouveautes/1.51.0-encadres.png', alt: 'Quatre encadrés : définition, exemple, à retenir, bilan' }, accent: '#b3762a', accent2: '#8a4b9c', dur: 9000 },
    { title: 'Et <em>aussi</em>', text: 'Des retouches demandées, et deux corrections.',
      bullets: ['<b>Profil</b> : niveau, classe et spécialités dans une petite fenêtre', '<b>Menu Nouveau</b> : les icônes en couleur des documents', '<b>Corrigé</b> : « Écrivez, ou tapez… » ne passe plus derrière le texte', '<b>Arbres</b> : la ligne d’aide ne reste plus affichée'],
      art: 'list', accent: '#33658a', accent2: '#2e8b6a', dur: 9500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});
