/* ============================================================
   Alixo — grammaire sur l'appareil (1.43), sans IA ni carte graphique
   ------------------------------------------------------------
   Quelques règles sûres, choisies pour ne JAMAIS signaler une phrase correcte : homophones grammaticaux sans
   ambiguïté (il à → il a, il et → il est, ils on → ils ont, jusqu'a → jusqu'à…), « si il » → « s'il », « quelque soit »
   → « quel(le) que soit », « sa va » → « ça va », mot outil répété (« le le »), et, au niveau « strict » seulement,
   l'espace avant ; : ! ?. Dans le doute, rien : une faute manquée vaut mieux qu'une phrase juste « corrigée ».
   Écartés car trop ambigus sans analyse complète : ces / ses, ou / où, la / là, « de le » (« de le faire »)…
   Les cas limites sont gérés à part : inversion (« dit-il à », « pense-t-on à »), pronom tonique après une préposition
   (« pour elle à », « chez elles on »), incises (« il, à son tour, … »), noms communs (« la grâce a été »).
   Complète le correcteur orthographique natif du navigateur (soulignement rouge) et les fautes de frappe de corr.js.
   API (window.AlixoGrammar) :
     check(text, { level }) → [{ avant, apres, kind: 'grammaire' | 'typographie', regle, at }]
                              at = position de `avant` dans `text` ; level 'leger' | 'standard' | 'strict'
     tokens(text)           découpe (exposée pour les tests)
   ============================================================ */
'use strict';

window.AlixoGrammar = (() => {
  /* ---------------- découpe en mots ----------------
     Mot = lettres (accents compris), éventuellement suivies d'une apostrophe d'élision (« qu' », « c' », « jusqu' ») ;
     nombre ; ou signe isolé. Chaque jeton garde sa position (s, e) et sa forme minuscule à apostrophe droite (k). */
  const RE_TOK = /[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]+['’]?|\d+(?:[.,]\d+)?|[^\sA-Za-zÀ-ÖØ-öø-ÿŒœÆæ\d]/g;
  function tokens(text) {
    const out = []; let m; RE_TOK.lastIndex = 0;
    while ((m = RE_TOK.exec(text))) out.push({ w: m[0], s: m.index, e: m.index + m[0].length, k: m[0].toLowerCase().replace(/’/g, "'") });
    return out;
  }
  const isWord = t => !!t && /^[a-zà-ÿœæ]/i.test(t.w);
  const isCap = t => !!t && /^[A-ZÀ-ÖØ-ÞŒÆ]/.test(t.w);
  const BOUNDARY = new Set(['.', '!', '?', '…', ':', ';', '«', '"', '“', '(', '[', '—', '–', '•']);
  /* début de phrase : rien avant, ou une ponctuation forte (le tiret ne compte que s'il n'est pas collé à un mot) */
  const atStart = (T, i) => { const p = T[i - 1]; if (!p) return true; if (BOUNDARY.has(p.w)) return true; if (p.w === '-' && !(T[i - 2] && T[i - 2].e === p.s)) return true; return false; };
  /* inversion du sujet : « dit-il », « pense-t-on », « a-t-elle » (trait d'union collé des deux côtés) */
  const inverted = (T, i) => { const p = T[i - 1]; return !!p && p.w === '-' && p.e === T[i].s && !!T[i - 2] && T[i - 2].e === p.s; };
  const sameCase = (word, fix) => (/^[A-ZÀ-ÖØ-ÞŒÆ]/.test(word) ? fix[0].toUpperCase() + fix.slice(1) : fix);
  /* extrait du texte entre deux jetons (garde l'espace et l'apostrophe tels que tapés) */
  const span = (text, a, b) => text.slice(a.s, b.e);

  /* ---------------- contextes ---------------- */
  /* « elle(s) » est sujet (et non tonique : « pour elle », « plus qu'elle », « c'est elle ») : début de phrase, virgule,
     coordination ou subordination qui introduit une proposition */
  const SUBJ_BEFORE = new Set(['mais', 'car', 'donc', 'or', 'quand', "lorsqu'", "puisqu'", 'lorsque', 'puisque', 'comme', ',']);
  const QU_INTRO = new Set(['parce', 'alors', 'bien', 'afin', 'pour', 'tandis', 'dès', 'sans', 'avant', 'après', 'ce', 'ainsi', 'si']);
  function subjectContext(T, i) {
    if (atStart(T, i)) return true;
    const p = T[i - 1];
    if (SUBJ_BEFORE.has(p.k)) return true;
    if (p.k === "qu'" && T[i - 2] && QU_INTRO.has(T[i - 2].k)) return true;   // parce qu'elle, alors qu'elle, est-ce qu'elle
    return false;
  }
  /* locutions adverbiales qui peuvent s'intercaler entre le sujet et le verbe : « il, à son tour, … » écrit sans virgules,
     « elle à peine arrivée » — on ne touche à rien */
  const INCISES = [
    ['peine'], ['tort'], ['raison'], ['nouveau'], ['savoir'], ['propos'], ['terme'], ['priori'], ['posteriori'], ['part'], ['travers'], ['titre'], ['défaut'], ['vrai'],
    ['son', 'tour'], ['leur', 'tour'], ['mon', 'tour'], ['ton', 'tour'], ['notre', 'tour'], ['votre', 'tour'], ['son', 'avis'], ['leur', 'avis'], ['mon', 'avis'], ['son', 'insu'], ['leur', 'insu'], ['son', 'image'],
    ['cet', 'égard'], ['ce', 'titre'], ['ce', 'sujet'], ['ce', 'propos'], ['ce', 'moment'], ['ce', 'stade'], ['cet', 'instant'], ['cette', 'époque'], ['cette', 'occasion'], ['cette', 'fin'], ['cette', 'date'],
    ["l'", 'inverse'], ["l'", 'instar'], ["l'", 'époque'], ["l'", 'origine'], ["l'", 'occasion'], ["l'", 'unanimité'], ["l'", 'issue'], ["l'", 'heure'], ["l'", 'avenir'], ["l'", 'évidence'], ["l'", 'oral'], ["l'", 'écrit'], ["l'", 'image'], ["l'", 'intérieur'], ["l'", 'extérieur'],
    ['la', 'fois'], ['la', 'suite'], ['la', 'place'], ['la', 'rigueur'], ['la', 'limite'], ['la', 'lettre'], ['la', 'fin'], ['la', 'demande'], ['la', 'différence'], ['la', 'manière'], ['la', 'française'],
    ['ce', 'jour'], ['ce', 'niveau'], ['ce', 'point'], ['cette', 'étape'], ['mon', 'sens'], ['son', 'sens'], ['première', 'vue'], ['son', 'retour'], ['leur', 'retour'], ['un', 'moment'], ['chaque'], ['côté'], ['partir'],
    ["l'", 'aide'], ["l'", 'âge'], ["l'", 'égard'], ["l'", 'avance'], ["l'", 'heure'], ['la', 'majorité'], ['la', 'lumière'], ['la', 'base'], ['la', 'veille'], ['la', 'longue'], ['plein', 'temps'],
    ['juste', 'titre'], ['court', 'terme'], ['long', 'terme'], ['moyen', 'terme'], ['plusieurs', 'reprises'], ['chaque', 'fois'], ['tout', 'prix'], ['tout', 'moment'], ['nouveau'], ['présent'], ['jamais'], ['cause']
  ];
  const isIncise = (T, j) => INCISES.some(seq => seq.every((w, n) => T[j + n] && T[j + n].k === w));
  /* mots qui peuvent suivre « a » (avoir) : déterminants, adverbes fréquents, participes ; sinon on ne touche pas à « à » */
  const AFTER_AVOIR = new Set(['un', 'une', 'des', 'le', 'la', 'les', "l'", 'du', 'de', "d'", 'son', 'sa', 'ses', 'leur', 'leurs', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'notre', 'nos', 'votre', 'vos',
    'plusieurs', 'aucun', 'aucune', 'beaucoup', 'peu', 'toujours', 'déjà', 'pas', 'rien', 'souvent', 'encore', 'bien', 'trop', 'tout', 'tous', 'toutes', 'été', 'eu', 'fait', 'dit', 'pu', 'dû', 'vu', 'su', 'pris', 'mis', 'cru', 'voulu', 'reçu', 'perdu', 'obtenu', 'tenu', 'ouvert', 'offert', 'écrit', 'compris', 'appris', 'besoin', 'droit', 'lieu', 'tendance', 'intérêt', 'raison', 'tort']);
  const participle = t => !!t && isWord(t) && !isCap(t) && /(?:é|ée|és|ées|i|ie|is|ies|u|ue|us|ues|it|ite|its|ites|ert|erte|erts|ertes|int|inte|ints|aint|ort|orte|ait|aite|aits|aites|ris|rise|mis|mise)$/.test(t.k) && t.k.length > 2;
  const avoirFollows = (T, j) => { const n = T[j]; if (!n || !isWord(n) || isCap(n)) return false; if (isIncise(T, j)) return false; return AFTER_AVOIR.has(n.k) || participle(n); };
  /* « il et … » : ce qui suit « est » — tout sauf un pronom ou un nom propre (« lui et elle » s'écrit avec « lui ») */
  const PRONOUNS = new Set(['il', 'ils', 'elle', 'elles', 'on', 'lui', 'eux', 'moi', 'toi', 'nous', 'vous', 'je', 'tu', "j'", 'ou', 'et', 'ni']);
  const DETS = new Set(['un', 'une', 'des', 'le', 'la', 'les', "l'", 'du', 'de', "d'", 'son', 'sa', 'ses', 'leur', 'leurs', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'notre', 'nos', 'votre', 'vos', 'ce', 'cet', 'cette', 'ces', 'chaque', 'plusieurs', 'certains', 'certaines', 'quelques', 'aucun', 'aucune', 'tout', 'tous', 'toute', 'toutes']);
  /* « elle et … » : seulement devant un adverbe, un adjectif ou un participe au féminin (« elle et son mari » est juste) */
  const ELLE_EST = new Set(['très', 'trop', 'toujours', 'souvent', 'déjà', 'encore', 'parfois', 'bien', 'mal', 'pas', 'aussi', 'donc', 'ainsi', 'désormais', 'alors', 'vraiment', 'assez', 'si', 'plutôt', 'tout', 'toute', 'née', 'nées', 'seule', 'seules', 'libre', 'libres', 'capable', 'capables', 'responsable', 'responsables', 'nécessaire', 'nécessaires', 'possible', 'impossible', 'enceinte', 'morte', 'mortes', 'importante', 'importantes', 'différente', 'différentes', 'valable', 'valables', 'nulle', 'nulles', 'soumise', 'soumises', 'tenue', 'tenues', 'prise', 'prises', 'mise', 'mises', 'faite', 'faites', 'dite', 'dites', 'contrainte', 'composée', 'définie', 'prévue', 'interdite', 'applicable', 'applicables', 'inférieure', 'supérieure', 'égale', 'opposable', 'opposables', 'en', 'ici', 'là']);
  const elleEst = n => !!n && isWord(n) && !isCap(n) && (ELLE_EST.has(n.k) || /(?:ée|ées)$/.test(n.k));
  const PREP = new Set(['à', 'de', "d'", 'du', 'sur', 'sous', 'en', 'pour', 'par', 'avec', 'sans', 'entre', 'vers', 'chez', 'contre', 'le', 'la', 'les', "l'", 'un', 'une', 'des', 'mot', 'pronom']);
  /* « quelque soit » : le genre vient du déterminant qui suit */
  const MASC = new Set(['le', 'un', 'son', 'ce', 'cet', 'mon', 'ton', 'notre', 'votre', 'leur', 'du']);
  const FEM = new Set(['la', 'une', 'sa', 'cette', 'ma', 'ta']);
  /* mots outils dont la répétition immédiate est une faute de frappe (« nous nous », « vous vous », « en en » sont justes) */
  const DUP = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'et', 'est', 'dans', 'pour', 'par', 'sur', 'avec', 'sans', 'ce', 'cette', 'ces', 'sa', 'son', 'ses', 'leur', 'leurs', 'il', 'ils', 'que', 'ne', 'se', 'mais', 'donc', 'car', 'entre', 'vers', 'chez', 'contre', 'selon', 'lorsque', 'puisque', 'quand', 'comme']);   // pas « très très », « plus plus » (insistance)
  /* déterminants avant « grâce » / « face » : ce sont alors des noms (« la grâce a été accordée », « la face a changé ») */
  const DET = new Set(['la', 'le', 'une', 'un', 'sa', 'son', 'ma', 'ta', 'cette', 'de', 'du', 'des', 'leur', 'notre', 'votre', 'quelle', 'en', 'volte', 'pile', 'droit', 'recours', 'demande', 'mesure', 'mesures']);

  /* ---------------- règles ---------------- */
  function check(text, opts) {
    text = String(text || ''); const level = (opts && opts.level) || 'standard';
    const T = tokens(text); const out = [];
    const add = (a, b, apres, regle, kind) => { const avant = span(text, a, b); if (avant !== apres) out.push({ avant, apres, kind: kind || 'grammaire', regle, at: a.s }); };
    for (let i = 0; i < T.length; i++) {
      const t = T[i], n = T[i + 1], n2 = T[i + 2];
      if (!isWord(t)) continue;
      const k = t.k;
      const midCap = isCap(t) && !atStart(T, i);   // « Il Sole », « On » au milieu d'une phrase : nom propre, titre
      const glue = n && t.e === n.s - 1 && text[t.e] === ' ';   // un seul espace entre les deux mots
      const afterPrep = !!T[i - 1] && PREP.has(T[i - 1].k);       // « sur on et off », « de il » : pas un sujet

      /* il / elle / on + « à » → « a » ; « il y à » → « il y a » */
      if (n && n.k === 'à' && glue && (k === 'il' || k === 'on' || k === 'elle') && !inverted(T, i) && !midCap && !afterPrep) {
        const ok = (k === 'elle' ? subjectContext(T, i) : true) && avoirFollows(T, i + 2);
        if (ok) { add(t, n, t.w + ' a', `Verbe avoir : « ${k} a » (on peut dire « ${k} avait »)`); continue; }
      }
      if (k === 'y' && n && n.k === 'à' && glue && T[i - 1] && (T[i - 1].k === 'il' || T[i - 1].k === "n'") && !inverted(T, i - 1)) {
        add(t, n, t.w + ' a', 'Locution « il y a » : verbe avoir'); continue;
      }
      /* il / on / elle + « et » → « est » — jamais devant un déterminant : « il et sa femme » (pour « lui et sa femme ») */
      if (n && n.k === 'et' && glue && (k === 'il' || k === 'on' || k === 'elle') && !inverted(T, i) && !midCap && !afterPrep && n2 && isWord(n2) && !isCap(n2) && !PRONOUNS.has(n2.k) && !DETS.has(n2.k)) {
        const ok = k === 'elle' ? subjectContext(T, i) && elleEst(n2) : true;
        if (ok) { add(t, n, t.w + ' est', `Verbe être : « ${k} est » (on peut dire « ${k} était »)`); continue; }
      }
      /* « c'et » → « c'est » */
      if (k === "c'" && n && n.k === 'et' && t.e === n.s) { add(t, n, t.w + 'est', 'Verbe être : « c’est »'); continue; }
      /* ils / elles + « on » → « ont » */
      if (n && n.k === 'on' && glue && (k === 'ils' || k === 'elles') && !inverted(T, i) && !midCap && n2 && isWord(n2) && !isCap(n2)) {
        const ok = k === 'elles' ? subjectContext(T, i) && !['y', 'en', 'se', "s'", 'ne', "n'", 'le', 'la', 'les', "l'", 'lui', 'leur', 'nous', 'vous', 'me', "m'", 'te', "t'", 'a', 'est', 'peut', 'doit', 'va', 'sait'].includes(n2.k)
          : !['y', 'en', 'se', "s'", 'ne', "n'", 'a', 'est', 'peut', 'doit', 'va', 'sait', 'dit'].includes(n2.k);
        if (ok) { add(t, n, t.w + ' ont', `Verbe avoir : « ${k} ont » (on peut dire « ${k} avaient »)`); continue; }
      }
      /* il / on / elle + « c'est » + participe → « s'est » (« il c'est trompé ») */
      if (n && n.k === "c'" && glue && n2 && n2.k === 'est' && n.e === n2.s && (k === 'il' || k === 'on' || k === 'elle') && !inverted(T, i) && !midCap && participle(T[i + 3]) && (k !== 'elle' || subjectContext(T, i))) {
        add(n, n2, (n.w[0] === 'C' ? 'S' : 's') + n.w.slice(1) + n2.w, 'Verbe pronominal : « s’est » (« se » + être), pas « c’est »'); continue;
      }
      /* « si il(s) » → « s'il(s) » */
      if (k === 'si' && n && glue && (n.k === 'il' || n.k === 'ils') && !inverted(T, i + 1)) {
        add(t, n, sameCase(t.w, 's’' + n.w.toLowerCase()), 'Élision obligatoire : « s’il », « s’ils »'); continue;
      }
      /* « quelque soit » → « quel / quelle que soit » (selon le déterminant qui suit) */
      if ((k === 'quelque') && n && n.k === 'soit' && glue && n2 && (MASC.has(n2.k) || FEM.has(n2.k))) {
        add(t, n, sameCase(t.w, (FEM.has(n2.k) ? 'quelle' : 'quel') + ' que soit'), '« Quel(le) que soit » s’accorde avec le nom qui suit'); continue;
      }
      /* « sa va » → « ça va » */
      if (k === 'sa' && n && n.k === 'va' && glue && !(T[i + 2] && T[i + 2].w === '-')) {
        add(t, n, sameCase(t.w, 'ça') + ' ' + n.w, '« Ça » (cela), pas le possessif « sa »'); continue;
      }
      /* préposition « à » après grâce / face / quant / jusqu' / par rapport */
      if (n && n.k === 'a' && n2) {
        const prev = T[i - 1];
        let hit = '';
        if (k === "jusqu'" && t.e === n.s) hit = 'jusqu’';
        else if (k === 'quant' && glue) hit = 'quant';
        else if (k === 'rapport' && glue && prev && prev.k === 'par') hit = 'rapport';
        else if ((k === 'grâce' || k === 'face') && glue && isWord(n2) && !(prev && (DET.has(prev.k) || prev.k === "l'" || prev.k === "d'")) && !(k === 'face' && n2.k === 'face') && AFTER_AVOIR.has(n2.k) && !participle(n2) && !['été', 'eu', 'fait', 'pas', 'rien', 'toujours', 'déjà', 'souvent', 'encore', 'bien', 'trop', 'beaucoup', 'peu', 'besoin', 'droit', 'lieu', 'tendance', 'intérêt', 'raison', 'tort', 'tout', 'tous', 'toutes', 'plusieurs', 'aucun', 'aucune'].includes(n2.k)) hit = k;
        if (hit) { const a = k === 'rapport' ? prev : t; add(a, n, span(text, a, t) + (t.e === n.s ? '' : ' ') + (n.w === 'A' ? 'À' : 'à'), `Préposition « à » : « ${k === 'rapport' ? 'par rapport' : k === "jusqu'" ? 'jusqu’' : k} à »`); continue; }
      }
      /* mot outil répété : « le le », « de de » (même casse, ou majuscule de début de phrase) */
      if (n && glue && DUP.has(k) && n.k === k && (n.w === t.w || (atStart(T, i) && n.w === t.w.toLowerCase()))) {
        out.push({ avant: span(text, t, n), apres: t.w, kind: 'grammaire', regle: 'Mot répété', at: t.s }); i++; continue;
      }
    }
    /* typographie française (niveau strict) : espace avant ; : ! ? — pas dans « 10:30 », « http:// », « :) » */
    if (level === 'strict') {
      const re = /([A-Za-zÀ-ÖØ-öø-ÿŒœ»)\]])([;:!?]+)(?=\s|$)/g; let m;
      while ((m = re.exec(text))) {
        if (m[2] === ':' && /\d$/.test(text.slice(0, m.index + 1))) continue;
        const ws = text.slice(0, m.index + 1).match(/[A-Za-zÀ-ÖØ-öø-ÿŒœ»)\]'’-]+$/); const word = ws ? ws[0] : m[1];
        const at = m.index + 1 - word.length;
        out.push({ avant: word + m[2], apres: word + ' ' + m[2], kind: 'typographie', regle: 'Typographie française : espace insécable avant « ' + m[2] + ' »', at });
      }
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }
  return { check, tokens };
})();
