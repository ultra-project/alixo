/* ============================================================
   Alixo — moteur de correction (1.22 ; 1.37 : AlixoAI ; 1.43 : correction pendant la frappe sans IA)
   Pendant la frappe, tout se passe sur l'appareil, sans IA ni carte graphique, pour tous les comptes :
   1. fautes de frappe reconnues à l'espace (liste fermée, mots appris, lexique de 24 000 mots : lettres inversées,
      lettre doublée, accent oublié) ;
   2. grammaire sûre (js/grammaire.js : il à → il a, ils on → ils ont, si il → s'il…) sur les phrases nouvelles ou
      modifiées ; une phrase déjà relue par AlixoAI (mémoire, F7) ressort telle quelle ;
   (le soulignement orthographique est celui du navigateur / de la version PC : correcteur natif, dictionnaire français).
   À la demande (F7, Alixo+) : AlixoAI (1.44 : sur l'ordinateur, js/alixoai.js → js/aiengine.js) relit le texte, phrase
   par phrase, en requêtes groupées ; ses réponses sont mémorisées (une phrase relue n'est jamais redemandée).
   Chargé avant app.js (dépend de window.ALIXO_LEXIQUE, js/lexique.js, window.AlixoGrammar et window.AlixoAI). app.js
   fournit l'accès aux blocs et à l'écran via AlixoCorr.init({...}) et branche les événements de frappe.
   ============================================================ */
'use strict';

window.AlixoCorr = (() => {
  /* ---------------- réglages ---------------- */
  const AI = () => window.AlixoAI || null;
  const GRAMMAR = () => window.AlixoGrammar || null;
  const PAUSE_MS = 1500;           // pause de frappe avant de relire les phrases en cours
  const SENTENCE_MS = 700;         // délai après une fin de phrase (. ! ? Entrée)
  const LEAVE_MS = 250;            // délai après la sortie d'un bloc
  /* taille des lots de F7 (caractères par requête), donnée par AlixoAI */
  const maxBatchFull = () => (AI() ? AI().budget().full : 6000);
  const MIN_WORDS = 3;             // une phrase plus courte n'est pas envoyée
  const CACHE_MAX = 4000;          // phrases mémorisées
  const LS = { learned: 'alixo.corr.learned', ignored: 'alixo.corr.ignored', cache: 'alixo.corr.cache', stats: 'alixo.corr.stats' };

  /* ---------------- fautes de frappe : liste fermée (1.21) ---------------- */
  const TYPO_FIXES = {
    qaund: 'quand', qunad: 'quand', quadn: 'quand', aevc: 'avec', avce: 'avec', dnas: 'dans', dasn: 'dans', pusi: 'puis', mias: 'mais', tuot: 'tout', tuos: 'tous',
    poru: 'pour', puor: 'pour', ausis: 'aussi', ausi: 'aussi', parceque: 'parce que', paceque: 'parce que', ocmme: 'comme', cmome: 'comme', comem: 'comme', dnoc: 'donc', alros: 'alors', enocre: 'encore',
    jsute: 'juste', jutse: 'juste', tojuours: 'toujours', toujour: 'toujours', toujorus: 'toujours', jamias: 'jamais', jamis: 'jamais', beaucuop: 'beaucoup', beacoup: 'beaucoup', beaucop: 'beaucoup',
    plusieur: 'plusieurs', pluseurs: 'plusieurs', plusiuers: 'plusieurs', certian: 'certain', poitn: 'point', ponit: 'point', temsp: 'temps', tmeps: 'temps', tepms: 'temps', momnet: 'moment',
    qustion: 'question', quesiton: 'question', questoin: 'question', raisn: 'raison', noatmment: 'notamment', notament: 'notamment', notemment: 'notamment', effectivment: 'effectivement', effectivemnt: 'effectivement',
    seulemnt: 'seulement', seulment: 'seulement', egalemnt: 'également', egalement: 'également', finalemnt: 'finalement', finalment: 'finalement', generalement: 'généralement', vraimen: 'vraiment', vraimnet: 'vraiment', vraiement: 'vraiment',
    nombruex: 'nombreux', nouvaeu: 'nouveau', nouvau: 'nouveau', nouvelel: 'nouvelle', premeir: 'premier', premeire: 'première', premiere: 'première', derniere: 'dernière', denrier: 'dernier',
    possibel: 'possible', posible: 'possible', imposible: 'impossible', improtant: 'important', importnat: 'important', importan: 'important', necesaire: 'nécessaire', necessaire: 'nécessaire', obligatoir: 'obligatoire', suivnat: 'suivant',
    defintion: 'définition', definiton: 'définition', 'défintion': 'définition', 'définiton': 'définition', contart: 'contrat', cotnrat: 'contrat', tribunla: 'tribunal', jurisprudnece: 'jurisprudence', juriprudence: 'jurisprudence',
    consitution: 'constitution', constituion: 'constitution', 'responsabilté': 'responsabilité', responsabilite: 'responsabilité', economie: 'économie', economique: 'économique', augmentaiton: 'augmentation', augmenation: 'augmentation',
    diminuiton: 'diminution', inflaton: 'inflation', inflaiton: 'inflation', chomage: 'chômage', cout: 'coût', couts: 'coûts', controle: 'contrôle', etre: 'être', etes: 'êtes', etant: 'étant', etait: 'était', etaient: 'étaient', ete: 'été',
    ecrire: 'écrire', ecriture: 'écriture', ecrit: 'écrit', ecrits: 'écrits', ecole: 'école', eleve: 'élève', eleves: 'élèves', etude: 'étude', etudes: 'études', etudiant: 'étudiant', etudiants: 'étudiants', etudier: 'étudier',
    evidemment: 'évidemment', evenement: 'événement', energie: 'énergie', equilibre: 'équilibre', egalite: 'égalité', egal: 'égal', egale: 'égale', enonce: 'énoncé', etablir: 'établir', etablissement: 'établissement', etape: 'étape', etranger: 'étranger',
    europeen: 'européen', europeenne: 'européenne', generale: 'générale', generaux: 'généraux', gerer: 'gérer', heritage: 'héritage', hopital: 'hôpital', idee: 'idée', idees: 'idées', interieur: 'intérieur', exterieur: 'extérieur',
    memoire: 'mémoire', mere: 'mère', pere: 'père', frere: 'frère', metier: 'métier', methode: 'méthode', modele: 'modèle', ministere: 'ministère', monetaire: 'monétaire', necessite: 'nécessité', possibilite: 'possibilité', prefet: 'préfet',
    prevoir: 'prévoir', prevu: 'prévu', prevue: 'prévue', probleme: 'problème', problemes: 'problèmes', porblème: 'problème', qualite: 'qualité', quantite: 'quantité', realiser: 'réaliser', realite: 'réalité', reflexion: 'réflexion',
    remede: 'remède', repondre: 'répondre', reponse: 'réponse', resoudre: 'résoudre', resultat: 'résultat', reunion: 'réunion', salarie: 'salarié', salaries: 'salariés', sante: 'santé', securite: 'sécurité', societe: 'société', liberte: 'liberté',
    propriete: 'propriété', specifique: 'spécifique', strategie: 'stratégie', succes: 'succès', superieur: 'supérieur', symptome: 'symptôme', systeme: 'système', theorie: 'théorie', theoreme: 'théorème', universite: 'université',
    verite: 'vérité', veritable: 'véritable', vehicule: 'véhicule', tres: 'très', apres: 'après', deja: 'déjà', voila: 'voilà', francais: 'français', francaise: 'française', telephone: 'téléphone', developpement: 'développement',
    developement: 'développement', developpment: 'développement', interet: 'intérêt', regle: 'règle', reglement: 'règlement', periode: 'période', siecle: 'siècle', medecin: 'médecin', medecine: 'médecine', hypothese: 'hypothèse',
    synthese: 'synthèse', numero: 'numéro', bibliotheque: 'bibliothèque', facon: 'façon', lecon: 'leçon', recu: 'reçu', apercu: 'aperçu', garcon: 'garçon', exmeple: 'exemple', exempel: 'exemple', exemlpe: 'exemple', exmple: 'exemple',
    entrepirse: 'entreprise', entrerpise: 'entreprise', gouvernemnet: 'gouvernement', gouvernment: 'gouvernement', coment: 'comment', commetn: 'comment', pourquio: 'pourquoi', pourqoi: 'pourquoi', pourquoit: 'pourquoi',
    perosnne: 'personne', persone: 'personne', pesonne: 'personne', enfnat: 'enfant', pouvior: 'pouvoir', droti: 'droit', dorit: 'droit', pensse: 'pense', cest: 'c’est', jai: 'j’ai'
  };

  /* ---------------- stockage local ---------------- */
  const loadJSON = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? def : v; } catch { return def; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage plein ou indisponible */ } };
  let learned = loadJSON(LS.learned, {});               // mot fautif → correction (apprises de l'IA ou de l'utilisateur)
  let ignored = new Set(loadJSON(LS.ignored, []));      // mots que l'utilisateur a voulu garder
  let cache = loadJSON(LS.cache, {});                   // clé de phrase → { f: [[avant, apres, type, regle]…], t }
  const stats = Object.assign({ req: 0, sent: 0, cached: 0, local: 0, auto: 0, chars: 0, since: Date.now() }, loadJSON(LS.stats, {}));
  let saveTm = null;
  function persist() { clearTimeout(saveTm); saveTm = setTimeout(() => { saveJSON(LS.learned, learned); saveJSON(LS.ignored, [...ignored]); saveJSON(LS.cache, cache); saveJSON(LS.stats, stats); }, 1500); }

  /* ---------------- lexique ---------------- */
  const LEX = new Map();        // mot → rang (0 = le plus fréquent)
  const BY_SKEL = new Map();    // squelette sans accent → mots accentués
  const strip = w => w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  (function loadLex() {
    const src = window.ALIXO_LEXIQUE || '';
    let i = 0;
    for (const w of src.split(' ')) {
      if (!w) continue;
      LEX.set(w, i++);
      const s = strip(w);
      if (s !== w) { let a = BY_SKEL.get(s); if (!a) BY_SKEL.set(s, a = []); a.push(w); }
    }
    for (const k of Object.keys(TYPO_FIXES)) LEX.delete(k);   // « etre », « tres »… ne sont pas des mots
  })();
  const known = w => LEX.has(w.toLowerCase());

  /* ---------------- étage 1 : correction locale d'un mot ---------------- */
  const cap = w => w ? w[0].toUpperCase() + w.slice(1) : w;
  const caseLike = (word, fix) => (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase() ? cap(fix) : fix);
  /* « terminé » proposé pour « termine », « invités » pour « invites » : la forme sans accent est un présent valable */
  function participleTrap(cand, word) {
    if (!/é(e|s|es)?$/.test(cand)) return false;
    const diffs = [];
    for (let i = 0; i < cand.length; i++) if (i >= word.length || strip(cand[i]) !== word[i]) diffs.push(i);
    return diffs.every(i => i >= cand.length - 3);
  }
  /* mot tel que tapé (3 lettres ou plus) → { to, src } ou null. src : liste | appris | accent | frappe */
  function localFix(word) {
    if (!word || word.length < 3) return null;
    const k = word.toLowerCase();
    if (ignored.has(k)) return null;
    if (word !== k && word !== cap(k)) return null;                 // sigle, CamelCase : jamais
    if (TYPO_FIXES[k]) return { to: caseLike(word, TYPO_FIXES[k]), src: 'liste' };
    if (learned[k]) return { to: caseLike(word, learned[k]), src: 'appris' };
    if (!LEX.size || LEX.has(k)) return null;                        // mot connu : rien à faire
    if (/[^a-zàâäçéèêëîïôöûùüÿœæ]/.test(k)) return null;
    // accent oublié : un seul mot du lexique a ce squelette (« ecole » → « école », mais « cote » reste « cote »)
    if (strip(k) === k) {
      const c = (BY_SKEL.get(k) || []).filter(x => !participleTrap(x, k));
      if (c.length === 1) return { to: caseLike(word, c[0]), src: 'accent' };
      if (c.length) return null;
    }
    if (k.length < 5) return null;                                   // mots courts : trop de voisins
    const cands = new Set();
    for (let i = 0; i < k.length - 1; i++) {
      if (k[i] === k[i + 1]) { const t = k.slice(0, i) + k.slice(i + 1); if (LEX.has(t)) cands.add(t); continue; }   // lettre doublée
      const t = k.slice(0, i) + k[i + 1] + k[i] + k.slice(i + 2); if (LEX.has(t)) cands.add(t);                      // lettres inversées
    }
    if (cands.size === 1) return { to: caseLike(word, [...cands][0]), src: 'frappe' };
    return null;
  }
  function learn(from, to) {
    const a = String(from || '').trim().toLowerCase(), b = String(to || '').trim();
    if (!a || !b || a === b.toLowerCase() || /\s/.test(a) || /\s/.test(b) || a.length < 3) return;
    if (ignored.has(a) || LEX.has(a)) return;
    learned[a] = b[0].toLowerCase() + b.slice(1);   // en minuscule initiale : la casse du mot tapé est reprise à l'application
    const keys = Object.keys(learned); if (keys.length > 2000) for (const k of keys.slice(0, 500)) delete learned[k];
    persist();
  }
  function ignore(word) { const k = String(word || '').trim().toLowerCase(); if (!k) return; ignored.add(k); delete learned[k]; persist(); }
  const isIgnored = word => ignored.has(String(word || '').toLowerCase());
  function forget() { learned = {}; ignored = new Set(); persist(); }

  /* ---------------- phrases ---------------- */
  /* découpe en phrases : fin sur . ! ? … suivi d'un blanc puis d'une majuscule, d'un guillemet ou d'un retour à la ligne
     (« art. 1240 », « C. civ. » ne coupent pas) ; renvoie [{ s, e, text }] (offsets dans le texte brut) */
  function sentences(text) {
    const out = []; const t = String(text || '');
    let s = 0;
    const re = /[.!?…]+["»”')\]]*(?=\s+(?:[A-ZÀ-ÝŒ«"“(\[]|[-–—•])|\s*\n|\s*$)|\n+/g;
    let m;
    while ((m = re.exec(t))) {
      const e = m.index + (m[0].trim() ? m[0].length : 0);
      push(s, m[0].trim() ? e : m.index);
      s = m.index + m[0].length;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    push(s, t.length);
    function push(a, b) {
      let txt = t.slice(a, b);
      const lead = txt.length - txt.replace(/^\s+/, '').length;
      txt = txt.trim(); if (!txt) return;
      out.push({ s: a + lead, e: a + lead + txt.length, text: txt });
    }
    return out;
  }
  const words = s => String(s || '').split(/[^A-Za-zÀ-ÿœŒ'’-]+/).filter(w => w.length > 1);
  /* une phrase vaut-elle une analyse ? (assez de mots, pas un sigle / une référence / une formule) */
  function worth(text) {
    const w = words(text);
    if (w.length < MIN_WORDS) return false;
    const letters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (letters < text.length * 0.5) return false;                   // chiffres, symboles, références
    if (text === text.toUpperCase()) return false;                   // tout en capitales : sigle, titre
    return true;
  }
  const norm = s => String(s || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
  const keyOf = (text, ctx) => hash(`${ctx.level || 'standard'}|${ctx.lang || 'fr'}|${ctx.strict ? 's' : ''}|${norm(text)}`);

  /* ---------------- mémoire des phrases ---------------- */
  function cacheGet(key) { const c = cache[key]; if (!c) return undefined; c.t = Date.now(); return c.f; }
  function cacheSet(key, fixes) {
    cache[key] = { f: fixes, t: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) { keys.sort((a, b) => cache[a].t - cache[b].t); for (const k of keys.slice(0, 1000)) delete cache[k]; }
    persist();
  }
  function clearCache() { cache = {}; persist(); }

  /* ---------------- AlixoAI : disponibilité et interrupteur (1.37 ; 1.44 : sur l'ordinateur) ----------------
     getConfig() / setConfig() ne servent qu'à l'interrupteur { off } (« Désactiver » dans Paramètres › IA), gardé pour
     les appelants historiques (cloudconfig.js, tests). */
  function getConfig() { const A = AI(); return { provider: 'alixoai', endpoint: 'local', model: 'AlixoAI', key: '', on: !!(A && A.ready()), off: !!(A && !A.enabled()) }; }
  function setConfig(c) { const A = AI(); if (!A) return; if (c && typeof c === 'object' && 'off' in c) A.setEnabled(!c.off); }
  /* prêt = AlixoAI est active et peut répondre (modèle installé sur l'ordinateur, moteur en marche ou prêt à démarrer) */
  function configured() { const A = AI(); return !!A && A.enabled() && A.available().ok; }
  const isLocal = () => false;
  const isLocalUrl = u => { try { const h = new URL(u).hostname; return /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || /\.local$/.test(h); } catch { return false; } };
  /* appel brut (vérification, tests) : AlixoAI répond à une consigne libre (tâche « correct ») */
  async function call(cfg, { system, user, maxTokens = 256, timeoutMs = 60000, temperature = 0 } = {}) {
    const A = AI(); const C = window.AlixoEngine;
    if (!A || !C) return { ok: false, status: 0, error: 'AlixoAI n’est pas chargée.' };
    if (!configured() && !(cfg && cfg.force)) return { ok: false, status: 0, error: A.enabled() ? A.available().reason : 'AlixoAI est désactivée (Paramètres › IA › Réactiver).' };
    return C.chat({ task: 'correct', system, user, maxTokens, temperature, timeoutMs: Math.max(timeoutMs, 60000) });
  }
  const LANG_NAMES = { fr: 'français', en: 'anglais', es: 'espagnol', de: 'allemand', it: 'italien', pt: 'portugais' };
  const KINDS = { f: 'frappe', o: 'orthographe', g: 'grammaire', t: 'typographie', r: 'reformulation' };

  /* retrouve un extrait dans un texte (apostrophes droites / typographiques, espaces insécables) ; null sinon */
  function locate(text, avant) {
    if (!avant) return null;
    const t = String(avant).trim(); if (!t) return null;
    for (const c of [avant, t, t.replace(/'/g, '’'), t.replace(/’/g, "'")]) if (c && text.includes(c)) return c;
    const soft = x => x.replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
    const st = soft(text); let sa = soft(t);
    let i = st.indexOf(sa);
    if (i < 0) { sa = sa.replace(/'/g, '’'); i = st.indexOf(sa); }
    if (i < 0) { sa = sa.replace(/’/g, "'"); i = st.indexOf(sa); }
    if (i < 0) return null;
    const orig = text.slice(i, i + sa.length);
    return soft(orig) === sa ? orig : null;
  }
  function align(avant, apres) {
    if (avant.includes('’') && !avant.includes("'")) return apres.replace(/'/g, '’');
    if (avant.includes("'") && !avant.includes('’')) return apres.replace(/’/g, "'");
    return apres;
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  /* une correction est une « faute de frappe sûre » : un seul mot, à peine changé. 1.21 : seulement quand le modèle l'a
     classée « frappe » ; 1.29 : aussi une faute d'orthographe mineure relevée plus tard par le modèle (accent oublié,
     lettre doublée ou manquante, lettres inversées) dont le résultat est un mot du lexique et le mot tapé n'en est pas
     un — jamais un homophone grammatical (a/à, et/est), ni une reformulation : ceux-là restent proposés (Tab). */
  function sureTypo(f) {
    if (!f || (f.kind !== 'frappe' && f.kind !== 'orthographe')) return false;
    const a = String(f.avant).trim(), b = String(f.apres).trim();
    if (!a || !b || /\s/.test(a) || /\s/.test(b) || a.length < 3) return false;
    if (a === a.toUpperCase() && /[A-Z]/.test(a)) return false;
    if (a.toLowerCase() === b.toLowerCase()) return false;
    if (ignored.has(a.toLowerCase())) return false;
    const d = levenshtein(a.toLowerCase(), b.toLowerCase());
    if (f.kind === 'frappe') return d <= (a.length >= 8 ? 3 : 2);
    return minorSpelling(a, b, d);
  }
  /* faute d'orthographe « mineure » : le mot corrigé est connu, le mot tapé ne l'est pas, et ils ne diffèrent que par
     les accents ou par une lettre (deux à partir de 8 lettres) */
  function minorSpelling(a, b, d) {
    const ka = a.toLowerCase(), kb = b.toLowerCase();
    if (/[^a-zàâäçéèêëîïôöûùüÿœæ-]/.test(kb) || /[^a-zàâäçéèêëîïôöûùüÿœæ-]/.test(ka)) return false;
    if (!LEX.size || !LEX.has(kb) || LEX.has(ka)) return false;
    if (strip(ka) === strip(kb)) return true;
    return d <= (a.length >= 8 ? 2 : 1);
  }
  /* normalise la réponse d'une phrase : [[avant, apres, type, regle]…] → fixes localisées dans la phrase */
  function fixesFor(text, raw) {
    const out = []; const seen = new Set();
    for (const x of Array.isArray(raw) ? raw : []) {
      if (!Array.isArray(x) || typeof x[0] !== 'string' || typeof x[1] !== 'string') continue;
      const avant = locate(text, x[0]); if (!avant) continue;
      const apres = align(avant, x[1]); if (!apres || apres === avant || seen.has(avant)) continue;
      seen.add(avant);
      const kind = KINDS[String(x[2] || '').toLowerCase()] || 'orthographe';
      out.push({ avant, apres, kind, regle: String(x[3] || '').trim(), at: text.indexOf(avant) });
    }
    return out;
  }
  const compact = f => f.map(x => [x.avant, x.apres, Object.keys(KINDS).find(k => KINDS[k] === x.kind) || 'o', x.regle]);

  /* ---------------- une requête : phrases (+ paragraphes à classer) ---------------- */
  /* items : [{ key, text, lang, block, styleTag }] ; styleBlocks : { tag → [indices] } */
  async function request(mode, items, ctx, styleBlocks) {
    if (!configured()) throw new Error('AlixoAI n’est pas disponible.');
    const withStyle = styleBlocks && Object.keys(styleBlocks).length > 0;
    const chars = items.reduce((n, it) => n + it.text.length + 4, 0);
    let r;
    try { r = await AI().run('correct', { mode, items: items.map(it => ({ text: it.text })), ctx, styleBlocks: withStyle ? styleBlocks : null }); }
    catch (e) { stats.req++; stats.chars += chars; stats.sent += items.length; persist(); throw e; }
    stats.req++; stats.chars += chars; stats.sent += items.length;
    stats.tokIn = (stats.tokIn || 0) + (r.tokIn || 0); stats.tokOut = (stats.tokOut || 0) + (r.tokOut || 0); persist();
    const c = r.c || {};
    const results = items.map((it, i) => ({ item: it, fixes: fixesFor(it.text, c[String(i + 1)]) }));
    const styles = {};
    if (withStyle && r.m) for (const [tag, v] of Object.entries(r.m)) if (v && v.t) styles[tag] = { type: String(v.t), terme: String(v.terme || '').trim(), raison: String(v.raison || '').trim() };
    return { results, styles };
  }

  /* ---------------- pendant la frappe : file d'attente, grammaire sur l'appareil (1.43) ----------------
     Plus d'IA ici : les phrases nouvelles ou modifiées passent par js/grammaire.js (quelques millisecondes), sans
     requête ni carte graphique. Les phrases déjà relues par AlixoAI (F7) ressortent de la mémoire telles quelles. */
  let opts = {};               // fourni par app.js : ctx(), text(blockId) → { text, lang, type } | null, onResult, onError, caretIn(blockId, s, e)
  const pending = new Map();   // blockId → { keys: Map(key → { text }), lang }
  const timers = new Map();    // blockId → timer
  let runTm = null;

  function init(o) { opts = Object.assign({}, opts, o); }
  const ctxOf = () => (opts.ctx ? opts.ctx() : {}) || {};

  /* prépare les phrases d'un bloc : celles en mémoire sont rendues tout de suite, les autres mises en file */
  function collect(blockId, { all = false } = {}) {
    const info = opts.text ? opts.text(blockId) : null;
    if (!info || !info.text) return;
    const ctx = Object.assign({}, ctxOf(), { lang: info.lang || 'fr' });
    const sents = sentences(info.text);
    const fromCache = [];
    let entry = pending.get(blockId);
    for (let i = 0; i < sents.length; i++) {
      const sn = sents[i];
      if (!worth(sn.text)) continue;
      // la phrase qui porte encore le curseur (dernier mot en cours) attend la fin de phrase ou la pause : on ne la relit qu'avec « all »
      if (!all && opts.caretIn && opts.caretIn(blockId, sn.s, sn.e) && !/[.!?…]["»”')\]]*$/.test(sn.text)) continue;
      const key = keyOf(sn.text, ctx);
      const hit = cacheGet(key);
      if (hit !== undefined) { stats.cached++; fromCache.push({ key, text: sn.text, fixes: hit.map(x => ({ avant: x[0], apres: x[1], kind: KINDS[x[2]] || 'orthographe', regle: x[3] || '', at: sn.text.indexOf(x[0]) })).filter(f => f.at >= 0) }); continue; }
      if (!entry) { entry = { keys: new Map(), lang: ctx.lang }; pending.set(blockId, entry); }
      entry.keys.set(key, { text: sn.text });
    }
    if (fromCache.length && opts.onResult) opts.onResult(blockId, fromCache, { cached: true });
    if (entry && !entry.keys.size) pending.delete(blockId);
    if (pending.size) schedule();
  }
  function arm(blockId, ms, o) {
    clearTimeout(timers.get(blockId));
    timers.set(blockId, setTimeout(() => { timers.delete(blockId); collect(blockId, o); }, ms));
  }
  /* appels d'app.js */
  function typed(blockId) { if (!enabled()) return; arm(blockId, PAUSE_MS, { all: true }); }                           // pause de frappe : tout, même la phrase en cours
  function sentenceDone(blockId) { if (!enabled()) return; arm(blockId, SENTENCE_MS, { all: false }); }                 // fin de phrase : les phrases terminées
  function left(blockId) { if (!enabled()) return; arm(blockId, LEAVE_MS, { all: true }); }                             // sortie du bloc : tout
  function drop(blockId) { clearTimeout(timers.get(blockId)); timers.delete(blockId); pending.delete(blockId); }
  const enabled = () => !!(opts.enabled ? opts.enabled() : true);

  function schedule() { if (!runTm) runTm = setTimeout(run, 0); }
  /* relit les phrases en file avec la grammaire sur l'appareil (seulement en français : les règles sont françaises) */
  function run() {
    runTm = null;
    if (!pending.size) return;
    if (!enabled()) { pending.clear(); return; }
    const G = GRAMMAR();
    const level = ctxOf().level || 'standard';
    for (const [blockId, entry] of [...pending]) {
      pending.delete(blockId);
      if (!G || (entry.lang && entry.lang !== 'fr')) continue;
      const list = [];
      try {
        for (const [key, v] of entry.keys) {
          stats.sent++; stats.chars += v.text.length;
          const fixes = G.check(v.text, { level }).filter(f => !ignored.has(String(f.avant).toLowerCase()));
          list.push({ key, text: v.text, fixes });
        }
      } catch (err) { if (opts.onError) opts.onError(err); continue; }
      persist();
      if (list.length && opts.onResult) opts.onResult(blockId, list, { cached: false, local: true });
    }
  }

  /* ---------------- AlixoAI (sur l’ordinateur), à la demande (F7) : tout un cours ---------------- */
  /* blocks : [{ id, text, lang }] → [{ id, avant, apres, regle, kind, at }] ; second = seconde lecture (ignore la mémoire) */
  async function analyzeBlocks(blocks, { onProgress, second = false, already = [] } = {}) {
    const base = ctxOf();
    const all = []; const todo = [];
    for (const b of blocks) {
      const ctx = Object.assign({}, base, { lang: b.lang || 'fr', strict: second });
      for (const sn of sentences(b.text)) {
        if (!worth(sn.text)) continue;
        const key = keyOf(sn.text, ctx);
        const hit = second ? undefined : cacheGet(key);
        if (hit !== undefined) { stats.cached++; for (const x of hit) { const at = sn.text.indexOf(x[0]); if (at >= 0) all.push({ id: b.id, avant: x[0], apres: x[1], kind: KINDS[x[2]] || 'orthographe', regle: x[3] || '', at: sn.s + at }); } continue; }
        todo.push({ key, text: sn.text, blockId: b.id, lang: ctx.lang, s: sn.s });
      }
    }
    // lots par taille (une langue par lot)
    const batches = []; let cur = [], n = 0;
    for (const it of todo) {
      if (cur.length && (n + it.text.length > maxBatchFull() || cur[0].lang !== it.lang || cur.length >= 40)) { batches.push(cur); cur = []; n = 0; }
      cur.push(it); n += it.text.length + 4;
    }
    if (cur.length) batches.push(cur);
    let step = 0;
    for (const batch of batches) {
      if (onProgress) onProgress(step, batches.length);
      const ctx = Object.assign({}, base, { lang: batch[0].lang, strict: second });
      // seconde lecture : on rappelle ce qui a déjà été relevé pour ne pas le répéter
      if (second && already.length) ctx.already = already.filter(a => batch.some(it => it.blockId === a.id)).slice(0, 60);
      const { results } = await request('full', batch, ctx, null);
      for (const r of results) {
        if (!second) cacheSet(r.item.key, compact(r.fixes));
        for (const f of r.fixes) all.push({ id: r.item.blockId, avant: f.avant, apres: f.apres, kind: f.kind, regle: f.regle, at: r.item.s + f.at });
      }
      step++;
    }
    if (onProgress) onProgress(batches.length, batches.length);
    return all;
  }

  /* ---------------- statistiques (Paramètres › IA) ---------------- */
  function getStats() { return Object.assign({ learned: Object.keys(learned).length, ignored: ignored.size, cacheSize: Object.keys(cache).length, lexicon: LEX.size }, stats); }
  function resetStats() { for (const k of ['req', 'sent', 'cached', 'local', 'auto', 'chars', 'tokIn', 'tokOut']) stats[k] = 0; stats.since = Date.now(); persist(); }
  const note = k => { stats[k] = (stats[k] || 0) + 1; persist(); };

  return {
    init, typed, sentenceDone, left, drop, pending: () => pending.size,
    localFix, learn, ignore, isIgnored, forget, known,
    sentences, worth, sureTypo, levenshtein, locate, align,
    analyzeBlocks, request, call,
    getConfig, setConfig, configured, isLocalUrl, isLocal,
    cacheGet, cacheSet, clearCache, keyOf,
    stats: getStats, resetStats, note,
    TYPO_FIXES, LANG_NAMES
  };
})();
