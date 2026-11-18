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
   Aperçu : index.html?nouveautes=1.54.0 (ou nouveautes.html?v=1.54.0 en page seule).
   ============================================================ */
'use strict';

/* 1.54 : présentations — animations et transitions, vidéos et quiz, thèmes signature, banque d'images, mode présentation et vue présentateur */
AlixoWhatsNew.register('1.54.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Les <em>présentations</em><br>font peau neuve', text: 'Cinq nouveautés, en moins d’une minute.', dur: 5500 },
    { title: 'Des <em>animations</em> et des transitions', text: 'Bouton Animation : chaque bloc apparaît à son tour ; sans sélection, il devient Transition.',
      bullets: ['<b>Dix effets</b> : fondu, zoom, rebond, machine à écrire…', '<b>Ordre d’apparition</b> : un clic révèle le groupe suivant', '<b>Transitions</b> : Aperçu, puis « Appliquer à toutes les diapositives »'],
      art: 'text', accent: '#3d6bb5', accent2: '#b3762a', dur: 8000 },
    { title: 'Des <em>vidéos</em> et un quiz lié', text: 'Un fichier de l’ordinateur, YouTube, Vimeo ou Dailymotion ; un de vos quiz en un clic.',
      bullets: ['<b>Rien ne se charge</b> avant votre clic sur « Lire la vidéo »', '<b>Lancer le quiz</b> depuis la diapositive, puis revenir où vous étiez'],
      art: 'quiz', accent: '#c04343', accent2: '#3d6bb5', dur: 7500 },
    { title: 'Douze <em>thèmes</em> signature', text: 'Motif de fond et forme signature : Aurore, Granit, Lagon, Kraft, Bauhaus… avec Alixo+.',
      bullets: ['<b>Huit dispositions</b> de plus : citation, comparaison, trois colonnes…', '<b>Une présentation reçue</b> garde son thème, quel que soit votre compte'],
      art: 'palette', accent: '#8a4b9c', accent2: '#2e8b6a', dur: 7000 },
    { title: 'Une <em>banque d’images</em> libres', text: 'Double-clic sur une image, puis « Banque d’images libres » : des photos de Wikimedia Commons.',
      bullets: ['<b>Licences filtrées</b> : domaine public, CC0, CC BY et CC BY-SA seulement', '<b>Crédit</b> de l’auteur ajouté sous l’image, jusque dans le PDF', '<b>Transparence</b> : la recherche part chez Wikimedia, Alixo ne la garde pas'],
      art: 'cards', accent: '#2e8b6a', accent2: '#b3762a', dur: 8000 },
    { title: 'Une <em>vue présentateur</em> complète', text: 'Alt+F5 : notes, suite et chrono pour vous ; la diapositive seule sur le second écran.',
      bullets: ['<b>Laser, encre, spot</b> : montrer sans rien modifier', '<b>Chrono</b>, écran noir, grille des diapositives, aide', '<b>Répétition chronométrée</b> : la durée de chaque diapositive'],
      art: { svg: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8 20.5h8M12 16.5v4"/><path d="M7 8h10M7 11h7"/></svg>' }, accent: '#33658a', accent2: '#c04343', dur: 8500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 6000 }
  ]
});

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
