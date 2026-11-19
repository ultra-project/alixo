/* ============================================================
   Alixo Workspace (1.53) — dépôt public de séances entre membres d'Alixo (Cloud Firestore, sans Storage ni
   Cloud Functions). Chargé APRÈS app.js, alx.js, sync.js et share.js : utilise directement les fonctions
   globales de l'application (state, toast, openDialog, esc, OB_SPECIALITES…) et AlixoAlx / AlixoShare.

   Données :
   - workspace/{wid}                 → fiche publique { uid, pseudo, title, desc, kind, subject, level, tags[], preview, size,
                                       chunks, app, ready, hidden, pub (= ready && !hidden), downloads, stars, comments,
                                       reports, lastComment (identifiant du dernier commentaire, exigé par les règles), createdAt, updatedAt }
   - workspace/{wid}/chunks/{0000…}  → { i, data: Blob ≤ 700 Ko } — l'archive .alx (AlixoAlx.build), 10 Mo au plus
   - workspace/{wid}/stars/{uid}     → { ts }         (une étoile par personne, retirable)
   - workspace/{wid}/downloads/{uid} → { ts }         (un téléchargement compté par personne)
   - workspace/{wid}/comments/{uid_ts} → { uid, pseudo, text ≤ 1000, ts, hidden, reports }
   - workspace/{wid}/comments/{cid}/reports/{uid} → { reason, text ≤ 400, ts } ; trois signalements masquent le commentaire
   - workspace/{wid}/reports/{uid}   → { reason, text ≤ 400, ts } ; trois signalements masquent la fiche (hidden, pub: false)
   - wsusers/{uid}                   → { posts, updatedAt, last } — quota de 20 dépôts par personne ; `last` = fiche créée ou retirée dans le lot
   Les compteurs sont tenus par l'application (lot : sous-document + incrément) et vérifiés par les règles Firestore ; un
   signalement est une transaction (la fiche est relue avant de décider du masquage). Au retrait, les sous-collections
   (étoiles, téléchargements, commentaires et leurs signalements, signalements) sont purgées avant la fiche.

   Sécurité : tout ce qui vient du nuage est normalisé (norm) puis échappé (esc) à l'affichage ; les identifiants
   doivent respecter SAFE_ID. Une archive téléchargée passe par AlixoAlx.importFiles(…, { sanitize: true }) :
   blocs reconstruits par AlixoSanitize.blocks, images SVG refusées — seules les séances (texte) sont acceptées
   en v1, les autres types de documents n'ayant pas d'assainisseur. « Enregistrer le .alx » livre une archive
   reconstruite de la même façon (AlixoAlx.sanitizeArchive), jamais l'archive brute.
   Les membres de moins de 15 ans consultent et téléchargent, mais ne déposent, ne commentent ni n'étoilent.
   ============================================================ */
'use strict';

window.AlixoWorkspace = (() => {
  const SAFE_ID = /^[\w-]{1,64}$/;
  const safeId = id => typeof id === 'string' && SAFE_ID.test(id);
  const MAX_BYTES = 10 * 1024 * 1024;   // taille d'une archive déposée
  const CHUNK = 700 * 1024;             // un document Firestore est limité à 1 Mio
  const MAX_CHUNKS = 15;
  const MAX_POSTS = 20;
  const PAGE = 40;
  const LIM = { title: 120, desc: 600, tag: 30, tags: 5, preview: 200, comment: 1000, report: 400, pseudo: 24 };
  const SORTS = [['popular', 'Populaires'], ['recent', 'Récents'], ['rated', 'Mieux notés']];
  const SORT_FIELD = { popular: 'downloads', recent: 'createdAt', rated: 'stars' };
  const REASONS = [['droits', 'Contenu protégé (droits d’auteur)'], ['inapproprie', 'Contenu inapproprié'], ['perso', 'Données personnelles'], ['autre', 'Autre…']];
  const SANITIZED_KINDS = ['docs'];      // types de documents qu'AlixoSanitize sait assainir (v1 : séances)
  const KIND_LABEL = { docs: 'Séance', slide: 'Présentation', sheet: 'Tableur', planche: 'Planche', quiz: 'Quiz' };
  const kindIcon = k => (k === 'slide' ? SLIDES_ICON : k === 'sheet' ? SHEET_ICON : k === 'planche' ? BOARD_ICON : k === 'quiz' ? QUIZ_ICON : DOC_ICON);
  const STAR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.9 6.2.9-4.5 4.4 1.1 6.3L12 17.6l-5.6 2.9 1.1-6.3L3 9.8l6.2-.9Z"/></svg>';
  const DL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>';
  /* 1.55 : caddie (même dessin que le bouton latéral « Workspace ») ; loupe et « + » de la boutique */
  const WS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 4h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L21 8H6"/><path d="M6.9 12h13"/><circle cx="9.5" cy="20" r="1.4"/><circle cx="17.5" cy="20" r="1.4"/></svg>';
  const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
  const PLUS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const CGU_URL = 'https://alixoapp.com/conditions.html';
  /* 1.55 : une séance créée par Coco (doc.aiFrom) est déposée avec `ai: true` (fiche publique, vérifié par les règles) */
  const AI_BADGE = 'Créé avec l’IA';
  const AI_TITLE = 'Séance créée avec AlixoAI (Coco) puis relue par son auteur';
  const isAiDoc = d => !!(d && d.aiFrom && typeof d.aiFrom === 'object');
  const CONTACT = 'contact@alixoapp.com';
  const U15_TITLE = 'Réservé aux membres de 15 ans et plus';
  const plural = (n, one, many) => `${n} ${n > 1 ? (many || one + 's') : one}`;

  const specs = () => (typeof OB_SPECIALITES !== 'undefined' && Array.isArray(OB_SPECIALITES) ? OB_SPECIALITES : []);
  const levels = () => (typeof OB_NIVEAUX !== 'undefined' && Array.isArray(OB_NIVEAUX) ? OB_NIVEAUX : []);
  const keyIn = (list, k) => (typeof k === 'string' && k !== '' && list.some(x => x.k === k) ? k : '');
  const specName = k => { const s = specs().find(x => x.k === k); return s ? (s.nom || s.k) : ''; };
  const levelName = k => { const l = levels().find(x => x.k === k); return l ? (l.label || l.k) : ''; };
  const specColor = k => { const s = specs().find(x => x.k === k); return s && /^#[0-9a-f]{6}$/i.test(String(s.c || '')) ? s.c : 'var(--tint)'; };
  /* texte reçu du nuage : chaîne bornée, sans caractères de contrôle (toujours passée par esc() à l'affichage) */
  const S = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');
  const N = v => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  const fmtSize = n => (n < 1024 ? `${n} o` : n < 1048576 ? `${Math.round(n / 1024)} Ko` : `${(n / 1048576).toFixed(1).replace('.', ',')} Mo`);
  const fmtWhen = ts => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const tagsOf = v => (Array.isArray(v) ? v.map(t => S(t, LIM.tag)).filter(Boolean).slice(0, LIM.tags) : []);

  /* ---------------- fiche du nuage → objet sûr ---------------- */
  function norm(id, m) {
    if (!safeId(id) || !m || typeof m !== 'object') return null;
    return {
      id, uid: safeId(m.uid) ? m.uid : '', pseudo: S(m.pseudo, LIM.pseudo) || 'Membre',
      title: S(m.title, LIM.title) || 'Sans titre', desc: S(m.desc, LIM.desc), kind: KIND_LABEL[m.kind] ? m.kind : 'docs',
      subject: keyIn(specs(), m.subject), level: keyIn(levels(), m.level), tags: tagsOf(m.tags), preview: S(m.preview, LIM.preview),
      size: N(m.size), chunks: N(m.chunks), app: S(m.app, 16),
      downloads: N(m.downloads), stars: N(m.stars), comments: N(m.comments), reports: N(m.reports),
      ready: m.ready === true, hidden: m.hidden === true, pub: m.pub === true, ai: m.ai === true,   // 1.55 : ai = séance créée avec AlixoAI
      createdAt: N(m.createdAt), updatedAt: N(m.updatedAt)
    };
  }
  function normComment(id, m) {
    if (!safeId(id) || !m || typeof m !== 'object') return null;
    const text = S(m.text, LIM.comment); if (!text) return null;
    return { id, uid: safeId(m.uid) ? m.uid : '', pseudo: S(m.pseudo, LIM.pseudo) || 'Membre', text, ts: N(m.ts), hidden: m.hidden === true, reports: N(m.reports) };
  }
  /* tri et filtres côté client (la recherche texte n'existe pas côté serveur) */
  function apply(items, { sort = 'popular', subject = '', level = '', q = '' } = {}) {
    const f = SORT_FIELD[sort] || 'downloads';
    const needle = String(q || '').trim().toLowerCase();
    return (items || []).filter(it => it && (!subject || it.subject === subject) && (!level || it.level === level)
      && (!needle || [it.title, it.desc, it.pseudo, ...it.tags].join(' ').toLowerCase().includes(needle)))
      .sort((a, b) => (b[f] - a[f]) || (b.createdAt - a.createdAt));
  }

  /* ---------------- gabarits (fonctions pures : tout est échappé) ----------------
     1.55 : refonte « boutique de cours » — en-tête (recherche, dépôt), onglets Explorer / Mes dépôts, filtres en pastilles,
     cartes avec aperçu façon page, état vide engageant, squelettes de chargement */
  const countsText = it => `${plural(it.downloads, 'téléchargement')} · ${plural(it.stars, 'étoile')}`;
  const counts = it => `<span class="ws-counts" title="${esc(countsText(it))}"><i class="ws-cstar">${STAR_ICON}${it.stars}<span class="sr-only"> ${it.stars > 1 ? 'étoiles' : 'étoile'}</span></i><i>${DL_ICON}${it.downloads}<span class="sr-only"> ${it.downloads > 1 ? 'téléchargements' : 'téléchargement'}</span></i></span>`;
  const initial = s => esc((String(s || '?').match(/\p{L}|\p{N}/u) || ['?'])[0].toUpperCase());
  function cardHTML(it) {
    const state = !it.ready ? '<span class="ws-state">Envoi en cours…</span>' : it.hidden ? '<span class="ws-state ws-hidden">Masqué</span>' : '';
    const excerpt = (it.desc || it.preview).slice(0, 220);
    const meta = [it.subject ? esc(specName(it.subject)) : '', it.level ? esc(levelName(it.level)) : ''].filter(Boolean).join(' · ');
    const ai = it.ai ? `<span class="ws-ai" title="${esc(AI_TITLE)}">${AI_BADGE}</span>` : '';   // 1.55 : séance créée avec l'IA
    return `<button class="ws-card" type="button" data-ws="open" data-wid="${esc(it.id)}" style="--mc:${specColor(it.subject)}" aria-label="${esc(it.title)}, par ${esc(it.pseudo)}${it.subject ? ', ' + esc(specName(it.subject)) : ''}${it.ai ? ', ' + AI_BADGE : ''}, ${esc(countsText(it))}">
      <span class="ws-cover" aria-hidden="true"><span class="ws-paper"><span class="ws-pkind">${kindIcon(it.kind)}${esc(KIND_LABEL[it.kind] || 'Séance')}</span><span class="ws-ptitle">${esc(it.title)}</span>${excerpt ? `<span class="ws-pexc">${esc(excerpt)}</span>` : '<span class="ws-plines"><i></i><i></i><i></i><i></i></span>'}</span>${state}${ai}</span>
      <span class="ws-cbody">
        <span class="ws-subj"><i class="ws-dot"></i>${meta || 'Toutes matières'}</span>
        <span class="ws-ctitle">${esc(it.title)}</span>
        <span class="ws-cfoot"><span class="ws-by"><span class="ws-av">${initial(it.pseudo)}</span>${esc(it.pseudo)}</span>${counts(it)}</span>
      </span>
    </button>`;
  }
  const SKELETON = `<div class="ws-grid ws-skel" aria-hidden="true">${'<div class="ws-card ws-sk"><span class="ws-cover"></span><span class="ws-cbody"><i></i><i></i><i></i></span></div>'.repeat(6)}</div>`;
  const EMPTY_ART = '<svg class="ws-eart" viewBox="0 0 120 96" aria-hidden="true"><rect x="22" y="14" width="52" height="66" rx="6" class="a1"/><rect x="44" y="8" width="52" height="66" rx="6" class="a2"/><path d="M54 24h32M54 33h32M54 42h22" class="a3"/><g transform="translate(64 54)" class="a4"><path d="M2 4h5l4.5 18.5a2.5 2.5 0 0 0 2.4 1.9h15.6a2.5 2.5 0 0 0 2.4-1.8L35.5 11H9"/><circle cx="15" cy="31" r="2.6"/><circle cx="28" cy="31" r="2.6"/></g></svg>';
  /* opts : { title, text, filters (bouton « Effacer les filtres »), post (bouton « Déposer une séance »), u15 } */
  function emptyHTML({ title = 'Aucune séance ne correspond.', text = '', filters = false, post = true, u15 = false } = {}) {
    return `<div class="ws-empty">${EMPTY_ART}<b>${title}</b>${text ? `<span>${text}</span>` : ''}<div class="ws-eact">${filters ? '<button type="button" class="cta ghost" data-ws="clear">Effacer les filtres</button>' : ''}${post ? `<button type="button" class="cta" data-ws="post" ${u15 ? `disabled title="${U15_TITLE}"` : ''}>${PLUS_ICON}Déposer une séance</button>` : ''}</div></div>`;
  }
  const gridHTML = (items, emptyMsg) => (items.length ? `<div class="ws-grid">${items.map(cardHTML).join('')}</div>` : emptyHTML({ title: emptyMsg || 'Aucune séance ne correspond.' }));
  /* en-tête de la boutique : présentation, grande recherche, bouton de dépôt, onglets.
     ui.u15 (facultatif) : le bouton « Déposer une séance » reste visible mais désactivé pour les moins de 15 ans */
  function headHTML(ui) {
    const tab = ui.tab === 'mine' ? 'mine' : 'explore';
    const nMine = (ui.mine || []).length;
    return `<header class="ws-hero">
      <div class="ws-htxt">
        <div class="ws-eyebrow">${WS_ICON}Workspace<span class="ws-eb-more"> · la boutique de cours</span></div>
        <h2 class="ws-htitle">Des séances partagées par les membres d’Alixo</h2>
        <p class="ws-hsub">Trouvez un cours et ajoutez-le à votre bibliothèque en un clic — c’est gratuit.</p>
      </div>
      <button type="button" class="cta ws-post" data-ws="post" ${ui.u15 ? `disabled title="${U15_TITLE}"` : ''}>${PLUS_ICON}Déposer une séance</button>
      <label class="ws-searchbar">${SEARCH_ICON}<input class="ws-q" type="search" data-ws="q" value="${esc(ui.q)}" placeholder="Rechercher une séance, un pseudo, une étiquette…" aria-label="Rechercher dans le Workspace" autocomplete="off"></label>
    </header>
    <div class="ws-tabs" role="tablist" aria-label="Workspace">
      <button type="button" role="tab" class="ws-tab ${tab === 'explore' ? 'on' : ''}" data-ws="tab" data-v="explore" aria-selected="${tab === 'explore'}">Explorer</button>
      <button type="button" role="tab" class="ws-tab ${tab === 'mine' ? 'on' : ''}" data-ws="tab" data-v="mine" aria-selected="${tab === 'mine'}">Mes dépôts<span class="ws-tbadge">${nMine}/${MAX_POSTS}</span></button>
    </div>`;
  }
  /* filtres de l'onglet Explorer : matière, niveau (listes natives habillées en pastilles), tri */
  function filtersHTML(ui, shown) {
    const opt = (list, cur, name, all) => `<label class="ws-pill ${cur ? 'on' : ''}" ${name === 'subject' && cur ? `style="--mc:${specColor(cur)}"` : ''}>${name === 'subject' ? '<i class="ws-dot"></i>' : ''}<select data-ws="${name}" aria-label="${all}"><option value="">${all}</option>${list.map(x => `<option value="${esc(x.k)}" ${x.k === cur ? 'selected' : ''}>${esc(x.nom || x.label)}</option>`).join('')}</select><svg class="ws-pcaret" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></label>`;
    const any = !!(ui.subject || ui.level || ui.q);
    const count = ui.loading && !ui.items.length ? '' : plural(shown, 'séance');
    return `<div class="ws-filters">
      ${opt(specs(), ui.subject, 'subject', 'Toutes les matières')}${opt(levels(), ui.level, 'level', 'Tous les niveaux')}
      ${any ? '<button type="button" class="ws-clear" data-ws="clear">Effacer les filtres</button>' : ''}
      <span class="ws-fsp"></span>
      <span class="ws-count" role="status">${count}</span>
      <div class="ws-sort" role="group" aria-label="Trier par">${SORTS.map(([k, l]) => `<button type="button" class="${ui.sort === k ? 'on' : ''}" data-ws="sort" data-v="${k}" aria-pressed="${ui.sort === k}">${l}</button>`).join('')}</div>
    </div>`;
  }
  const INTRO = 'Un dépôt est visible par tous les membres connectés et retirable à tout moment par son auteur. Les séances sont déposées par les membres sous leur responsabilité et ne sont pas vérifiées par Alixo avant publication.';
  /* liste des commentaires ; opts : { me, owner (auteur du dépôt : voit et masque les commentaires masqués), canReport (15 ans et plus) } */
  function commentsHTML(list, { me = '', owner = false, canReport = true } = {}) {
    const shown = list.filter(c => !c.hidden || owner || c.uid === me);
    if (!shown.length) return '<div class="po-hint ws-nocom">Aucun commentaire pour l’instant.</div>';
    return `<div class="ws-clist">${shown.map(c => `<div class="ws-c ${c.hidden ? 'hidden' : ''}" data-cid="${esc(c.id)}"><div class="ws-chead"><b>${esc(c.pseudo)}</b><span>${c.ts ? esc(fmtWhen(c.ts)) : ''}${c.hidden ? ' · masqué' : ''}</span>${owner && c.uid !== me ? `<button type="button" class="ws-clink" data-ws="chide" data-cid="${esc(c.id)}" data-h="${c.hidden ? '0' : '1'}">${c.hidden ? 'Afficher' : 'Masquer'}</button>` : ''}${c.uid === me ? `<button type="button" class="ws-clink" data-ws="cdel" data-cid="${esc(c.id)}">Supprimer</button>` : ''}${c.uid !== me && canReport ? `<button type="button" class="ws-clink" data-ws="creport" data-cid="${esc(c.id)}" title="Signaler ce commentaire à l’équipe d’Alixo">Signaler</button>` : ''}</div><div class="ws-ctext">${esc(c.text)}</div></div>`).join('')}</div>`;
  }
  /* corps de la fiche (openDialog) ; `comments` déjà normalisés ; opts : { me, starred, canPost } */
  function detailHTML(it, comments, { me = '', starred = false, canPost = true } = {}) {
    const owner = !!me && it.uid === me;
    const nCom = comments.filter(c => !c.hidden).length;
    return `<div class="ws-detail" data-wid="${esc(it.id)}">
      <div class="ws-dmain">
        <p class="ws-desc ${it.desc ? '' : 'muted'}">${it.desc ? esc(it.desc) : 'Aucune description.'}</p>
        ${it.preview ? `<div class="ws-preview"><div class="po-label">Aperçu</div><div class="ws-ptext">${esc(it.preview)}</div></div>` : ''}
        ${it.tags.length ? `<div class="ws-tags">${it.tags.map(t => `<span class="ws-tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="ws-actions">
          <button type="button" class="cta" data-ws="add" ${it.pub || owner ? '' : 'disabled'}>${DL_ICON}Ajouter à ma bibliothèque</button>
          <button type="button" class="cta ghost" data-ws="save" ${it.pub || owner ? '' : 'disabled'} title="Enregistrer le fichier Alixo (vérifié) sur l’ordinateur">Enregistrer le .alx</button>
          <button type="button" class="cta ghost ws-star ${starred ? 'on' : ''}" data-ws="star" ${owner ? 'disabled title="On ne met pas d’étoile à son propre dépôt"' : !canPost ? `disabled title="${U15_TITLE}"` : `title="${starred ? 'Retirer mon étoile' : 'Mettre une étoile'}"`}>${STAR_ICON}<span class="ws-nstar">${it.stars}</span><span class="sr-only"> ${it.stars > 1 ? 'étoiles' : 'étoile'}</span></button>
        </div>
        <div class="ai-keymsg" id="ws-msg"></div>
        <div class="ws-comments">
          <div class="po-label">Commentaires (${nCom})</div>
          <div id="ws-clist">${commentsHTML(comments, { me, owner, canReport: canPost })}</div>
          ${canPost ? `<div class="ws-cadd"><input id="ws-ctext" maxlength="${LIM.comment}" placeholder="Votre commentaire…" aria-label="Votre commentaire" autocomplete="off"><button type="button" class="cta small" data-ws="comment">Publier</button></div>` : '<div class="po-hint">Les commentaires sont réservés aux membres de 15 ans et plus.</div>'}
        </div>
      </div>
      <aside class="ws-dside">
        ${it.ai ? `<div class="ws-info ws-aiinfo"><span class="ws-ai" title="${esc(AI_TITLE)}">${AI_BADGE}</span></div>` : ''}
        <div class="ws-info"><b>Auteur</b><span>${esc(it.pseudo)}</span></div>
        ${it.subject ? `<div class="ws-info"><b>Matière</b><span>${esc(specName(it.subject))}</span></div>` : ''}
        ${it.level ? `<div class="ws-info"><b>Niveau</b><span>${esc(levelName(it.level))}</span></div>` : ''}
        <div class="ws-info"><b>Déposé le</b><span>${it.createdAt ? esc(fmtWhen(it.createdAt)) : '—'}</span></div>
        <div class="ws-info"><b>Taille</b><span>${esc(fmtSize(it.size))}</span></div>
        <div class="ws-info ws-stats"><span>${esc(countsText(it))}</span></div>
        ${it.hidden ? '<div class="ws-info ws-warn"><b>Masqué</b><span>Ce dépôt n’est plus visible des autres membres.</span></div>' : ''}
        <div class="po-hint ws-legal">Déposé par un membre d’Alixo sous sa responsabilité, pour un usage personnel et pédagogique. Alixo n’en vérifie pas le contenu avant publication. S’il porte atteinte à vos droits ou vous semble inapproprié, utilisez « Signaler… ».</div>
      </aside>
    </div>`;
  }
  const HIDDEN_MINE = 'Masqué après signalements — en attente de vérification par l’équipe ; écrivez à ' + CONTACT + ' pour contester';
  /* 1.55 : onglet « Mes dépôts » — jauge du quota, lignes avec état (en ligne / envoi / masqué), statistiques */
  function mineHTML(items, u15) {
    if (!items.length) return emptyHTML({ title: 'Vous n’avez encore rien déposé', text: 'Partagez une de vos séances avec les autres membres : choisissez-la dans votre bibliothèque, décrivez-la, et elle est en ligne. Vous pouvez la retirer à tout moment.', u15 });
    const quota = `<div class="ws-quota-bar"><div><b>${plural(items.length, 'dépôt')}</b> sur ${MAX_POSTS} possibles</div><span class="ws-qtrack"><i style="width:${Math.min(100, Math.round(items.length / MAX_POSTS * 100))}%"></i></span></div>`;
    return quota + `<div class="ws-mine">${items.map(it => {
      const st = !it.ready ? ['wait', 'Envoi en cours…'] : it.hidden ? ['hid', 'Masqué'] : ['ok', 'En ligne'];
      return `<div class="ws-mrow" data-wid="${esc(it.id)}" style="--mc:${specColor(it.subject)}"><span class="ws-mthumb" aria-hidden="true">${kindIcon(it.kind)}</span><div class="ws-mi"><b>${esc(it.title)}</b><span><em class="ws-mst ${st[0]}">${st[1]}</em>${it.subject ? `${esc(specName(it.subject))} · ` : ''}${esc(countsText(it))} · ${plural(it.comments, 'commentaire')}${it.createdAt ? ` · déposé le ${esc(new Date(it.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}</span>${it.hidden ? `<small class="ws-mwarn">${esc(HIDDEN_MINE)}</small>` : ''}</div><button type="button" class="cta ghost small" data-ws="open" data-wid="${esc(it.id)}">Ouvrir</button><button type="button" class="cta ghost small ev-danger" data-ws="remove" data-wid="${esc(it.id)}">Retirer</button></div>`;
    }).join('')}</div>`;
  }
  const view = { norm, normComment, apply, cardHTML, gridHTML, headHTML, filtersHTML, emptyHTML, detailHTML, commentsHTML, mineHTML, SORTS, REASONS, LIM, INTRO };

  /* ---------------- garde-fou : sans compte, rien ne part et l'espace l'explique ---------------- */
  const OFF_MSG = '<div class="sh-empty ws-off"><b>Connectez-vous pour accéder au Workspace.</b><br>Le Workspace rassemble les séances déposées par les membres d’Alixo, à ajouter à votre bibliothèque en un clic.<div class="ws-off-act"><button type="button" class="cta" data-ws="login">Se connecter</button></div></div>';
  const renderOff = () => {
    const root = $('#lib-workspace'); if (!root) return;
    root.innerHTML = OFF_MSG;
    const b = root.querySelector('[data-ws="login"]'); if (b) b.addEventListener('click', () => AlixoApp.openSettings('compte'));
  };
  const offToast = () => toast('Connectez-vous pour accéder au Workspace', { duration: 6000, action: 'Se connecter', onAction: () => AlixoApp.openSettings('compte') });
  const OFF = { enabled: false, view, render: renderOff, publish: async () => null, list: async () => [], download: async () => false, star: async () => false, unstar: async () => false, comment: async () => null, report: async () => false, reportComment: async () => false, remove: async () => false, mine: async () => [], openPublish: offToast, openItem: offToast };
  const A = window.AlixoAuth;
  const acc = A && A.isConfigured && A.account();
  if (!acc || !window.firebase || !firebase.firestore || !window.AlixoApp) return OFF;

  /* ============================================================ compte connecté ============================================================ */
  const uid = acc.uid;
  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  const FBlob = firebase.firestore.Blob;
  const wsRef = db.collection('workspace');
  const usersRef = db.collection('wsusers');
  const now = () => Date.now();
  const pad = i => String(i).padStart(4, '0');
  const myPseudo = () => S(window.AlixoShare && typeof AlixoShare.pseudo === 'function' ? AlixoShare.pseudo() : '', LIM.pseudo);
  const underAge = () => AlixoApp.ageGroup() === 'u15';
  const isDenied = e => /permission-denied/.test((e && e.code) || '');
  /* message pour l'utilisateur ; le détail technique (code, message) va dans la console */
  function friendly(err) {
    const code = (err && err.code) || '', msg = (err && err.message) || String(err);
    if (/permission-denied/.test(code)) { console.error('Workspace (règles) :', code, msg); return 'Le Workspace n’est pas disponible pour le moment. Réessayez plus tard.'; }
    if (/failed-precondition/.test(code)) { console.error('Workspace (index) :', code, msg); return 'Le Workspace est en cours de mise à jour. Réessayez dans quelques minutes.'; }
    if (/unavailable|network/.test(code)) return 'Serveur injoignable — vérifiez la connexion internet.';
    return msg;
  }
  const PSEUDO_WAIT = 'Votre pseudo n’est pas encore prêt — réessayez dans quelques secondes (connexion requise).';
  /* déposer, commenter, étoiler : 15 ans et plus, pseudo prêt (il est automatique : on attend qu'il soit chargé ou tiré) */
  async function gate(what) {
    if (underAge()) { toast(`${what} dans le Workspace est réservé aux membres de 15 ans et plus — la consultation et le téléchargement restent libres`, { duration: 7000 }); return false; }
    if (!myPseudo() && window.AlixoShare && typeof AlixoShare.ensurePseudo === 'function') { try { await AlixoShare.ensurePseudo(); } catch (e) { console.error('Workspace (pseudo) :', e); } }
    if (!myPseudo()) { toast(PSEUDO_WAIT, { duration: 7000 }); return false; }
    return true;
  }
  const snapItem = s => (s && s.exists ? norm(s.id, s.data()) : null);
  const snapList = qs => qs.docs.map(s => norm(s.id, s.data())).filter(Boolean);

  /* ---------------- dépôt ---------------- */
  function cleanMeta(meta, d) {
    const m = meta || {};
    const title = S(m.title, LIM.title) || S(d.titre, LIM.title) || 'Sans titre';
    return { title, desc: S(m.desc, LIM.desc), subject: keyIn(specs(), m.subject), level: keyIn(levels(), m.level), tags: tagsOf(m.tags) };
  }
  /* copie expurgée du document : rien de personnel (prof, fichier du disque, onglets ouverts, dossier) */
  function publicCopy(d) {
    const copy = JSON.parse(JSON.stringify(d));
    delete copy.prof; delete copy.alxFile; delete copy.vwOpen;
    copy.folderId = null; copy.pinned = false;
    return copy;
  }
  const TYPE_REFUSED = 'Seules les séances peuvent être déposées pour l’instant (pas les présentations, tableurs, planches ni quiz).';
  /* hooks (facultatifs, fenêtre de dépôt) : onError(message) remplace le toast d'erreur ; onProgress(fait, total) suit l'envoi des morceaux */
  async function publish(docId, meta, hooks) {
    const H = hooks || {};
    const fail = msg => { if (H.onError) H.onError(msg); else toast(msg, { duration: 7000 }); return null; };
    if (!await gate('Déposer')) return null;
    const d = (typeof findDoc === 'function' ? findDoc(docId) : null) || state.docs.find(x => x.id === docId);
    if (!d) return fail('Ce document n’existe plus.');
    const kind = AlixoAlx.kindOfDoc(d);
    if (!SANITIZED_KINDS.includes(kind)) return fail(TYPE_REFUSED);
    const mine = await usersRef.doc(uid).get().catch(() => null);
    const posts = mine && mine.exists ? N(mine.data().posts) : 0;
    if (posts >= MAX_POSTS) return fail(`Vous avez atteint les ${MAX_POSTS} dépôts : retirez-en un pour en déposer un nouveau.`);
    const m = cleanMeta(meta, d);
    let buf;
    try { buf = await AlixoAlx.build(publicCopy(d)); } catch (e) { console.error('Workspace (archive) :', e); return fail('Dépôt impossible : ' + ((e && e.message) || e)); }
    if (buf.byteLength > MAX_BYTES) return fail(`Ce document pèse ${fmtSize(buf.byteLength)} : un dépôt est limité à 10 Mo (allégez les images).`);
    const u8 = new Uint8Array(buf);
    const n = Math.max(1, Math.ceil(u8.length / CHUNK));
    if (n > MAX_CHUNKS) return fail('Dépôt trop volumineux.');
    const ref = wsRef.doc();
    const t = now();
    const fiche = Object.assign({ uid, pseudo: myPseudo(), kind, ai: isAiDoc(d), preview: S(typeof docSubtitle === 'function' ? docSubtitle(d) : '', LIM.preview), size: u8.length, chunks: n, app: typeof ALIXO_VERSION === 'string' ? ALIXO_VERSION : '', ready: false, hidden: false, pub: false, downloads: 0, stars: 0, comments: 0, reports: 0, createdAt: t, updatedAt: t }, m);
    try {
      const b = db.batch();
      b.set(usersRef.doc(uid), { posts: posts + 1, updatedAt: t, last: ref.id }, { merge: true });   // `last` : la fiche créée dans ce lot (règles)
      b.set(ref, fiche);
      await b.commit();
      if (H.onProgress) H.onProgress(0, n);
      for (let i = 0; i < n; i++) {
        await ref.collection('chunks').doc(pad(i)).set({ i, data: FBlob.fromUint8Array(u8.subarray(i * CHUNK, Math.min(u8.length, (i + 1) * CHUNK))) });
        if (H.onProgress) H.onProgress(i + 1, n);
      }
      await ref.update({ ready: true, pub: true, updatedAt: now() });   // la fiche n'est visible qu'une fois complète
    } catch (e) {
      console.error('Workspace (dépôt) :', e);
      await remove(ref.id, { silent: true }).catch(() => {});
      return fail('Dépôt impossible : ' + friendly(e));
    }
    toast(`« ${m.title} » est déposé dans le Workspace — visible par tous les membres, retirable à tout moment`, { duration: 7000, action: 'Voir', onAction: () => openItem(ref.id) });
    const it = norm(ref.id, Object.assign({}, fiche, { ready: true, pub: true }));
    ui.mine.unshift(it); ui.items.unshift(it);
    if (!currentDocId && libMode === 'workspace') render();
    return it;
  }

  /* ---------------- consultation ---------------- */
  async function list({ sort = 'popular', subject = '', level = '', q = '', after = null } = {}) {
    let qy = wsRef.where('pub', '==', true);
    if (keyIn(specs(), subject)) qy = qy.where('subject', '==', subject);
    if (keyIn(levels(), level)) qy = qy.where('level', '==', level);
    qy = qy.orderBy(SORT_FIELD[sort] || 'downloads', 'desc').limit(PAGE);
    if (after) qy = qy.startAfter(after);
    const qs = await qy.get();
    const items = snapList(qs).filter(it => it.pub);
    return { items: apply(items, { sort, q }), last: qs.docs.length === PAGE ? qs.docs[qs.docs.length - 1] : null };
  }
  async function mine() {
    const qs = await wsRef.where('uid', '==', uid).orderBy('createdAt', 'desc').limit(MAX_POSTS + 5).get();
    return snapList(qs);
  }
  async function fetchArchive(it, onProgress) {
    const parts = []; let total = 0;
    for (let i = 0; i < it.chunks; i++) {
      const c = await wsRef.doc(it.id).collection('chunks').doc(pad(i)).get();
      if (!c.exists || !c.data().data) throw new Error('archive incomplète');
      const u = c.data().data.toUint8Array(); parts.push(u); total += u.length;
      if (onProgress) onProgress((i + 1) / it.chunks);
    }
    if (total > MAX_BYTES) throw new Error('archive trop volumineuse');
    const out = new Uint8Array(total); let o = 0; for (const q of parts) { out.set(q, o); o += q.length; }
    return out.buffer;
  }
  async function countDownload(it) {
    if (it.uid === uid) return;   // son propre dépôt ne compte pas
    try {
      const b = db.batch();
      b.set(wsRef.doc(it.id).collection('downloads').doc(uid), { ts: now() });
      b.update(wsRef.doc(it.id), { downloads: FV.increment(1) });
      await b.commit();
      it.downloads++;
    } catch (e) { if (!isDenied(e)) console.error('Workspace (compteur) :', e); }   // déjà compté pour cette personne : refus normal
  }
  /* ajoute le dépôt à la bibliothèque (import assaini) ou enregistre le fichier .alx ; renvoie vrai si c'est fait */
  async function download(wid, { save = false, item = null } = {}) {
    if (!safeId(wid)) return false;
    let it = item;
    try { if (!it) it = snapItem(await wsRef.doc(wid).get()); } catch (e) { toast(friendly(e), { duration: 7000 }); return false; }
    if (!it) { toast('Ce dépôt n’existe plus'); return false; }
    if (!save && !SANITIZED_KINDS.includes(it.kind)) { toast('Ce type de document ne peut pas encore être ajouté depuis le Workspace — enregistrez le fichier .alx', { duration: 6000 }); return false; }
    if (!save && !await AlixoApp.storageAllows(it.size)) return false;
    toast(save ? 'Préparation du fichier…' : 'Récupération de la séance…', { duration: 2500 });
    let buf;
    try { buf = await fetchArchive(it); } catch (e) { console.error('Workspace (archive) :', e); toast('Téléchargement impossible : ' + friendly(e), { duration: 7000 }); return false; }
    const name = safeFileName(it.title) + '.' + AlixoAlx.KINDS[it.kind].ext;
    if (save) {
      /* l'archive reçue d'un inconnu est reconstruite (séance assainie, images sûres) avant d'être enregistrée — jamais le brut */
      let clean;
      try { clean = await AlixoAlx.sanitizeArchive(buf, name); } catch (e) { console.error('Workspace (archive) :', e); toast('Enregistrement impossible : ' + ((e && e.message) || e), { duration: 7000 }); return false; }
      const ok = await AlixoAlx.saveBuffer(name, clean);
      if (!ok) return false;
    } else {
      const made = await AlixoAlx.importFiles([{ name, data: buf }], null, { open: true, quiet: true, sanitize: true });
      if (!made.length) return false;
      toast(`« ${made[0].titre || it.title} » ajouté à votre bibliothèque (Mes cours)`, { duration: 6000 });
    }
    await countDownload(it);
    return true;
  }

  /* ---------------- étoiles, commentaires, signalements, retrait ---------------- */
  const starred = new Set();   // dépôts étoilés par moi (chargés fiche par fiche)
  async function isStarred(wid) {
    try { const s = await wsRef.doc(wid).collection('stars').doc(uid).get(); if (s.exists) starred.add(wid); else starred.delete(wid); } catch { /* hors ligne */ }
    return starred.has(wid);
  }
  async function star(wid) {
    if (!safeId(wid)) return false;
    if (underAge()) { toast(`Mettre une étoile dans le Workspace est réservé aux membres de 15 ans et plus`, { duration: 6000 }); return false; }
    const b = db.batch();
    b.set(wsRef.doc(wid).collection('stars').doc(uid), { ts: now() });
    b.update(wsRef.doc(wid), { stars: FV.increment(1) });
    await b.commit(); starred.add(wid); return true;
  }
  async function unstar(wid) {
    if (!safeId(wid)) return false;
    const b = db.batch();
    b.delete(wsRef.doc(wid).collection('stars').doc(uid));
    b.update(wsRef.doc(wid), { stars: FV.increment(-1) });
    await b.commit(); starred.delete(wid); return true;
  }
  async function comments(wid) {
    const qs = await wsRef.doc(wid).collection('comments').orderBy('ts', 'asc').limit(100).get();
    return qs.docs.map(s => normComment(s.id, s.data())).filter(Boolean);
  }
  async function comment(wid, text) {
    if (!safeId(wid) || !await gate('Commenter')) return null;
    text = S(text, LIM.comment); if (!text) return null;
    const ts = now(), cid = `${uid}_${ts}`, c = { uid, pseudo: myPseudo(), text, ts, hidden: false, reports: 0 };
    const b = db.batch();
    b.set(wsRef.doc(wid).collection('comments').doc(cid), c);
    b.update(wsRef.doc(wid), { comments: FV.increment(1), lastComment: cid });   // lastComment : les règles vérifient que ce commentaire existe après le lot
    await b.commit();
    return normComment(cid, c);
  }
  const hideComment = (wid, cid, hidden) => wsRef.doc(wid).collection('comments').doc(cid).update({ hidden: !!hidden });
  const deleteComment = (wid, cid) => wsRef.doc(wid).collection('comments').doc(cid).delete();
  const cleanReason = r => (REASONS.some(([k]) => k === r) ? r : 'autre');
  /* signalement (fiche ou commentaire) : un par personne, en transaction — la cible est relue, puis reports/{uid} est écrit avec
     le compteur + 1 ; au troisième signalement la cible est masquée d'elle-même (fiche : hidden, pub: false ; commentaire : hidden) */
  async function reportTarget(targetRef, reason, text, isFiche) {
    await db.runTransaction(async tx => {
      const s = await tx.get(targetRef);
      if (!s.exists) throw new Error('Ce contenu n’existe plus');
      const cur = N((s.data() || {}).reports);
      const upd = { reports: cur + 1 };
      if (cur + 1 >= 3) { upd.hidden = true; if (isFiche) upd.pub = false; }
      tx.set(targetRef.collection('reports').doc(uid), { reason: cleanReason(reason), text: S(text, LIM.report), ts: now() });
      tx.update(targetRef, upd);
    });
    return true;
  }
  const report = (wid, reason, text) => (safeId(wid) ? reportTarget(wsRef.doc(wid), reason, text, true) : Promise.resolve(false));
  const reportComment = (wid, cid, reason, text) => (safeId(wid) && safeId(cid) ? reportTarget(wsRef.doc(wid).collection('comments').doc(cid), reason, text, false) : Promise.resolve(false));
  /* efface les documents d'une collection par lots de 200 ; renvoie les identifiants effacés */
  async function purge(col) {
    const qs = await col.get();
    let b = db.batch(), n = 0;
    for (const c of qs.docs) { b.delete(c.ref); if (++n >= 200) { await b.commit(); b = db.batch(); n = 0; } }
    if (n) await b.commit();
    return qs.docs.map(s => s.id);
  }
  /* retrait par l'auteur : morceaux, étoiles, téléchargements, commentaires (et leurs signalements), puis — dans un même lot —
     les signalements de la fiche, la fiche et le quota (wsusers.posts − 1, last = wid) */
  async function remove(wid, { silent = false } = {}) {
    if (!safeId(wid)) return false;
    const ref = wsRef.doc(wid);
    await purge(ref.collection('chunks'));
    /* étoiles, téléchargements et signalements d'autrui ne sont lisibles que par leur titulaire et les administrateurs :
       un auteur qui n'est pas administrateur ne peut pas les lister, donc pas les effacer — on passe (permission-denied)
       et la fiche est retirée quand même ; ces restes ne contiennent qu'un horodatage ou un signalement, jamais la séance */
    const tryPurge = col => purge(col).catch(e => { if (isDenied(e)) return []; throw e; });
    await tryPurge(ref.collection('stars'));
    await tryPurge(ref.collection('downloads'));
    const coms = await ref.collection('comments').get();
    for (const c of coms.docs) await tryPurge(c.ref.collection('reports'));
    await purge(ref.collection('comments'));
    const reps = await ref.collection('reports').get().catch(e => { if (isDenied(e)) return { docs: [] }; throw e; });
    const me = await usersRef.doc(uid).get().catch(() => null);
    const posts = me && me.exists ? N(me.data().posts) : 0;
    const b = db.batch();
    for (const r of reps.docs.slice(0, 400)) b.delete(r.ref);   // effaçables par l'auteur seulement dans le lot qui retire la fiche
    b.delete(ref);
    if (me && me.exists && posts > 0) b.set(usersRef.doc(uid), { posts: posts - 1, updatedAt: now(), last: wid }, { merge: true });
    await b.commit();
    ui.mine = ui.mine.filter(x => x.id !== wid); ui.items = ui.items.filter(x => x.id !== wid);
    if (!silent) toast('Dépôt retiré du Workspace');
    return true;
  }

  /* ---------------- affichage dans #lib-workspace ---------------- */
  const profil = () => (state.settings && state.settings.profil) || {};
  const ui = { sort: 'popular', subject: keyIn(specs(), (profil().specialites || [])[0]), level: keyIn(levels(), profil().niveau), q: '', items: [], last: null, loading: false, error: '', loaded: false, mine: [], mineLoaded: false, tab: 'explore' };   // 1.55 : tab = onglet Explorer / Mes dépôts
  let loadSeq = 0;
  async function load({ more = false } = {}) {
    const seq = ++loadSeq;
    ui.loading = true; ui.error = '';
    if (!more) { ui.items = []; ui.last = null; }
    paint();
    try {
      const r = await list({ sort: ui.sort, subject: ui.subject, level: ui.level, after: more ? ui.last : null });
      if (seq !== loadSeq) return;
      const seen = new Set(ui.items.map(x => x.id));
      ui.items = ui.items.concat(r.items.filter(x => !seen.has(x.id))); ui.last = r.last; ui.loaded = true;
    } catch (e) { if (seq !== loadSeq) return; console.error('Workspace (liste) :', e); ui.error = friendly(e); }
    ui.loading = false;
    paint();
  }
  async function loadMine() {
    try { ui.mine = await mine(); ui.mineLoaded = true; } catch (e) { console.error('Workspace (mes dépôts) :', e); }
    paint();
  }
  /* 1.55 : page « boutique » — en-tête, onglets, puis l'onglet courant (Explorer : filtres + grille ; Mes dépôts : liste) */
  const ROWS_SKEL = '<div class="ws-mine ws-skel" aria-hidden="true">' + '<div class="ws-mrow ws-sk"><span class="ws-mthumb"></span><div class="ws-mi"><i></i><i></i></div></div>'.repeat(2) + '</div>';
  function paint() {
    const root = $('#lib-workspace'); if (!root || root.hidden) return;
    const shown = apply(ui.items, { sort: ui.sort, q: ui.q });
    ui.u15 = underAge();
    let html = '<div class="ws-shop">' + headHTML(ui);
    if (ui.tab === 'mine') {
      html += `<section class="ws-sect" role="tabpanel" aria-label="Mes dépôts">${ui.mineLoaded ? mineHTML(ui.mine, ui.u15) : ROWS_SKEL}</section>`;
    } else {
      html += '<section class="ws-sect ws-list" role="tabpanel" aria-label="Explorer">' + filtersHTML(ui, shown.length);
      if (ui.error) html += `<div class="ws-err" role="alert"><b>Impossible de charger le Workspace</b><span>${esc(ui.error)}</span><button class="cta ghost small" type="button" data-ws="reload">Réessayer</button></div>`;
      else if (ui.loading && !ui.items.length) html += SKELETON;
      else if (!shown.length) {
        html += ui.q ? emptyHTML({ title: `Aucune séance ne correspond à « ${esc(ui.q)} »`, text: 'La recherche porte sur les séances chargées : essayez un autre mot, ou élargissez les filtres.', filters: true, post: false })
          : (ui.subject || ui.level) ? emptyHTML({ title: 'Aucune séance pour ces critères pour l’instant', text: 'Élargissez la recherche, ou soyez la première personne à déposer une séance dans cette catégorie !', filters: true, u15: ui.u15 })
            : emptyHTML({ title: 'Le Workspace attend ses premières séances', text: 'Soyez la première personne à partager un cours avec les membres d’Alixo.', u15: ui.u15 });
      } else html += gridHTML(shown);
      if (ui.last && !ui.loading) html += '<div class="ws-more"><button class="cta ghost" type="button" data-ws="more">Afficher plus de séances</button></div>';
      else if (ui.loading && ui.items.length) html += '<div class="ws-more po-hint">Chargement…</div>';
      html += `<p class="ws-intro">${INTRO}</p></section>`;
    }
    html += '</div>';
    const q = root.querySelector('[data-ws="q"]'), hadFocus = q && document.activeElement === q, pos = q ? q.selectionStart : 0;
    root.innerHTML = html;
    if (hadFocus) { const nq = root.querySelector('[data-ws="q"]'); nq.focus(); try { nq.setSelectionRange(pos, pos); } catch { /* */ } }
  }
  function render() {
    const root = $('#lib-workspace'); if (!root) return;
    root.hidden = false;
    if (!ui.loaded && !ui.loading) load();
    if (!ui.mineLoaded) loadMine();
    paint();
  }

  /* ---------------- fenêtre « Déposer une séance » ---------------- */
  const WS_ACCEPT_LABEL = 'J’ai écrit cette séance moi-même (ou j’en détiens les droits) et j’accepte qu’elle soit mise à disposition des autres membres dans les conditions ci-dessus.';
  /* 1.55 : séance créée par Coco (aiFrom) — l'attestation « écrite moi-même » serait fausse */
  const WS_ACCEPT_AI_LABEL = `Cette séance a été créée avec AlixoAI (Coco) à partir de mes demandes ou de mes propres cours ; je l’ai relue, j’ai le droit de la partager et j’accepte qu’elle soit publique (voir les <a href="${CGU_URL}" target="_blank" rel="noopener">CGU</a>).`;
  const acceptLabel = d => (isAiDoc(d) ? WS_ACCEPT_AI_LABEL : WS_ACCEPT_LABEL);
  const mentionHTML = pseudo => `<b>Visible par tous les membres d’Alixo connectés, retirable à tout moment.</b> En déposant cette séance, vous autorisez les autres membres à la télécharger, la lire, la modifier et la réutiliser pour leurs études, sans usage commercial ; les copies déjà ajoutées à leur bibliothèque restent chez eux après un retrait. Ne déposez que ce que vous avez écrit vous-même (ou créé avec Coco à partir de vos demandes ou de vos propres cours) : pas de polycopiés ni de diapositives d’enseignants, pas d’extraits d’ouvrages, de sujets d’examen ou d’images trouvées en ligne ; pas de données personnelles (noms de camarades, d’enseignants, de patients, parties non anonymisées d’une décision). Vous en êtes responsable ; un contenu signalé peut être masqué puis retiré. Votre pseudo « ${esc(pseudo)} » apparaît comme auteur ; le nom du professeur et le dossier ne sont pas envoyés. <a href="${CGU_URL}" target="_blank" rel="noopener">Conditions d’utilisation</a>`;
  /* 1.55 : fenêtre en trois étapes (1. la séance, choisie dans l'explorateur de fichiers ; 2. sa présentation ; 3. la
     publication : récapitulatif, mention et case d'acceptation). Mêmes champs, mêmes contrôles et même appel à publish() qu'avant. */
  const STEPS = ['Séance', 'Présentation', 'Publication'];
  const docPathText = d => { const p = d && d.folderId && typeof folderPath === 'function' ? folderPath(d.folderId) : []; return ['Mes cours', ...p.map(f => f.nom || 'Sans nom')].join(' › '); };
  const pickedHTML = d => `<span class="ws-dpk-ico" aria-hidden="true">${DOC_ICON}</span><span class="ws-dpk-txt"><b>${esc(d.titre || 'Sans titre')}</b><small>${esc(docPathText(d))}${typeof docSubtitle === 'function' ? ' · ' + esc(docSubtitle(d)) : ''}</small></span>`;
  async function openPublish(docId) {
    if (!await gate('Déposer')) return;
    const docs = state.docs.filter(d => AlixoAlx.kindOfDoc(d) === 'docs' && !(d.alxFile && !d.alxFile.online)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!docs.length) { toast('Aucune séance à déposer : créez d’abord une séance dans votre bibliothèque'); return; }
    let sel = docs.find(d => d.id === docId) || docs[0];
    const p = profil();
    const opts = (list, cur) => `<option value="">—</option>${list.map(x => `<option value="${esc(x.k)}" ${x.k === cur ? 'selected' : ''}>${esc(x.nom || x.label)}</option>`).join('')}`;
    /* 1.55 : la case n'est JAMAIS pré-cochée et « Déposer » est désactivé à chaque ouverture (wsAccepted ne sert qu'à l'historique) */
    let busy = false, step = docId && docs.some(d => d.id === docId) ? 1 : 0;
    const onKey = e => { if (e.key === 'Escape' && busy) e.stopImmediatePropagation(); };   // pas de fermeture par Échap pendant l'envoi
    const recent = () => docs.filter(d => d.id !== sel.id).slice(0, 4);
    openDialog({
      id: 'wsov', cls: 'share-dlg ws-dlg ws-pubdlg', eyebrow: 'Workspace',
      title: 'Déposer une séance dans le Workspace',
      sub: 'Votre séance devient visible par tous les membres d’Alixo connectés ; vous pouvez la retirer à tout moment.',
      body: `<ol class="ws-steps">${STEPS.map((l, i) => `<li><button type="button" data-step="${i}"><span class="ws-snum">${i + 1}</span>${l}</button></li>`).join('')}</ol>
      <div class="ws-form">
        <div class="ws-step" data-s="0">
          <div class="ws-f"><span>Séance à déposer</span>
            <button type="button" class="ws-dpick" id="ws-doc" title="Choisir la séance dans l’explorateur de fichiers">${pickedHTML(sel)}<span class="ws-dpk-act">Changer…</span></button>
          </div>
          <div class="ws-f ws-recent"><span>Séances récentes</span><div class="ws-rlist"></div></div>
          <div class="po-hint">Seules les séances (documents de texte) peuvent être déposées pour l’instant. Le nom du professeur et le dossier ne sont pas envoyés.</div>
        </div>
        <div class="ws-step" data-s="1" hidden>
          <label class="ws-f"><span>Titre</span><input id="ws-title" maxlength="${LIM.title}" value="${esc(sel.titre || '')}" placeholder="Titre de la séance"></label>
          <label class="ws-f"><span>Description</span><textarea id="ws-desc" maxlength="${LIM.desc}" rows="4" placeholder="De quoi parle cette séance, pour qui, ce qu’elle contient…"></textarea></label>
          <div class="ws-f2">
            <label class="ws-f"><span>Matière</span><select id="ws-subject">${opts(specs(), keyIn(specs(), (p.specialites || [])[0]))}</select></label>
            <label class="ws-f"><span>Niveau</span><select id="ws-level">${opts(levels(), keyIn(levels(), p.niveau))}</select></label>
          </div>
          <label class="ws-f"><span>Étiquettes</span><input id="ws-tags" maxlength="200" placeholder="jusqu’à 5, séparées par des virgules (ex. contrat, obligations, L2)"></label>
        </div>
        <div class="ws-step" data-s="2" hidden>
          <div class="ws-recap" id="ws-recap"></div>
          <div class="po-hint ws-mention">${mentionHTML(myPseudo())}</div>
          <div class="ws-aiwarn" id="ws-aiwarn" ${isAiDoc(sel) ? '' : 'hidden'}><span class="ws-ai">${AI_BADGE}</span> Cette séance sera signalée comme créée avec l’IA sur sa fiche publique.</div>
          <label class="plus-chk ws-accept"><input type="checkbox" id="ws-accept"> <span id="ws-acclbl">${acceptLabel(sel)}</span></label>
        </div>
        <div class="ai-keymsg" id="ws-pmsg" role="status"></div>
      </div>`,
      foot: `<button class="cta ghost" type="button" data-dlg-close>Annuler</button><span class="dlg-spacer"></span><button class="cta ghost" type="button" id="ws-prev">Retour</button><button class="cta" type="button" id="ws-next">Suivant</button><button class="cta" id="ws-pub" type="button" disabled>Déposer</button>`,
      onClose: () => window.removeEventListener('keydown', onKey, true),
      onMount: (card, close) => {
        const docBtn = card.querySelector('#ws-doc'), title = card.querySelector('#ws-title'), msg = card.querySelector('#ws-pmsg');
        const chk = card.querySelector('#ws-accept'), pub = card.querySelector('#ws-pub'), prev = card.querySelector('#ws-prev'), next = card.querySelector('#ws-next');
        const say = (t, cls) => { msg.textContent = t; msg.className = 'ai-keymsg ' + (cls || ''); };
        const tagsOfInput = () => card.querySelector('#ws-tags').value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        const setDoc = d => {
          if (!d) return;
          const was = isAiDoc(sel);
          sel = d; docBtn.innerHTML = pickedHTML(d) + '<span class="ws-dpk-act">Changer…</span>';
          /* 1.55 : attestation adaptée à l'origine de la séance ; changer de nature de séance décoche la case */
          card.querySelector('#ws-acclbl').innerHTML = acceptLabel(d);
          card.querySelector('#ws-aiwarn').hidden = !isAiDoc(d);
          if (was !== isAiDoc(d)) { chk.checked = false; pub.disabled = true; }
          if (!title.dataset.touched) title.value = d.titre || '';
          paintRecent();
        };
        const paintRecent = () => {
          const r = recent(), box = card.querySelector('.ws-recent');
          box.hidden = !r.length;
          box.querySelector('.ws-rlist').innerHTML = r.map(d => `<button type="button" class="ws-rdoc" data-did="${esc(d.id)}">${DOC_ICON}<span><b>${esc(d.titre || 'Sans titre')}</b><small>${esc(docPathText(d))}</small></span></button>`).join('');
        };
        const recap = () => {
          const sv = card.querySelector('#ws-subject').value, lv = card.querySelector('#ws-level').value, tags = tagsOfInput();
          card.querySelector('#ws-recap').innerHTML = `<div class="ws-rcard" style="--mc:${specColor(sv)}"><span class="ws-rc-ico">${DOC_ICON}</span><div><b>${esc(title.value.trim() || 'Sans titre')}</b><span>${[sv ? esc(specName(sv)) : '', lv ? esc(levelName(lv)) : '', 'par ' + esc(myPseudo())].filter(Boolean).join(' · ')}</span>${tags.length ? `<div class="ws-tags">${tags.slice(0, LIM.tags).map(t => `<span class="ws-tag">${esc(S(t, LIM.tag))}</span>`).join('')}</div>` : ''}</div></div>`;
        };
        /* passage d'une étape à l'autre ; en avançant, l'étape quittée est vérifiée */
        const check = s => {
          if (s === 1) {
            if (!title.value.trim()) { say('Donnez un titre à votre dépôt.', 'err'); title.focus(); return false; }
            if (tagsOfInput().length > LIM.tags) { say(`${LIM.tags} étiquettes au plus.`, 'err'); card.querySelector('#ws-tags').focus(); return false; }
          }
          return true;
        };
        const goStep = n => {
          n = Math.max(0, Math.min(STEPS.length - 1, n));
          for (let i = step; i < n; i++) if (!check(i)) { n = i; break; }
          step = n; if (!busy) say('');
          card.querySelectorAll('.ws-step').forEach(el => { el.hidden = +el.dataset.s !== step; });
          card.querySelectorAll('.ws-steps button').forEach(b => { const i = +b.dataset.step; b.parentElement.className = i === step ? 'on' : i < step ? 'done' : ''; b.setAttribute('aria-current', i === step ? 'step' : 'false'); });
          prev.hidden = step === 0; next.hidden = step === STEPS.length - 1; pub.hidden = step !== STEPS.length - 1;
          if (step === 2) recap();
          setTimeout(() => { const f = step === 0 ? docBtn : step === 1 ? title : chk; if (f) f.focus(); }, 30);
        };
        docBtn.addEventListener('click', () => {
          if (busy) return;
          if (!window.AlixoExplorer) return;
          const ids = new Set(docs.map(d => d.id));
          AlixoExplorer.pick({ mode: 'doc', title: 'Choisir la séance à déposer', sub: 'Seules les séances (documents de texte) de votre bibliothèque peuvent être déposées.', kinds: ['cours'], filter: d => ids.has(d.id), start: sel.folderId || '', selected: sel.id, okLabel: 'Choisir cette séance', onPick: id => setDoc(docs.find(d => d.id === id)) });
        });
        card.querySelector('.ws-rlist').addEventListener('click', e => { const b = e.target.closest('[data-did]'); if (b && !busy) setDoc(docs.find(d => d.id === b.dataset.did)); });
        card.querySelector('.ws-steps').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b && !busy) goStep(+b.dataset.step); });
        prev.addEventListener('click', () => goStep(step - 1));
        next.addEventListener('click', () => goStep(step + 1));
        title.addEventListener('input', () => { title.dataset.touched = '1'; });
        chk.addEventListener('change', () => { pub.disabled = !chk.checked; if (chk.checked) say(''); });
        card.addEventListener('keydown', e => { if (e.key === 'Enter' && step < 2 && e.target.matches('input:not([type="checkbox"])')) { e.preventDefault(); goStep(step + 1); } });
        /* pendant l'envoi : Annuler, la croix et le clic hors de la fenêtre sont neutralisés (la fiche serait laissée incomplète) */
        const ov = card.parentElement;
        ov.addEventListener('click', e => { if (busy && (e.target === ov || e.target.closest('.set-x') || e.target.closest('[data-dlg-close]'))) { e.stopPropagation(); e.preventDefault(); } }, true);
        window.addEventListener('keydown', onKey, true);
        const setBusy = v => { busy = v; card.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = v || (el === pub && !chk.checked); }); card.classList.toggle('ws-busy', v); };
        pub.addEventListener('click', async () => {
          if (!chk.checked) { say('Cochez la case ci-dessus pour confirmer que la séance est la vôtre.', 'err'); chk.focus(); return; }
          const t = title.value.trim(); if (!t) { goStep(1); say('Donnez un titre à votre dépôt.', 'err'); title.focus(); return; }
          const tags = tagsOfInput();
          if (tags.length > LIM.tags) { goStep(1); say(`${LIM.tags} étiquettes au plus.`, 'err'); return; }
          if (!state.settings.wsAccepted) { state.settings.wsAccepted = now(); if (typeof save === 'function') save(); }
          setBusy(true); say('Envoi en cours…');
          const it = await publish(sel.id, { title: t, desc: card.querySelector('#ws-desc').value, subject: card.querySelector('#ws-subject').value, level: card.querySelector('#ws-level').value, tags },
            { onError: m => say(m, 'err'), onProgress: (i, n) => say(`Envoi en cours… ${i}/${n}`) });
          setBusy(false);
          if (it) { close(); if (!currentDocId && libMode !== 'workspace') AlixoApp.openWorkspaceHome(); }
        });
        paintRecent();
        goStep(step);
      }
    });
  }

  /* ---------------- fiche d'un dépôt ---------------- */
  async function openItem(wid) {
    if (!safeId(wid)) return;
    let it, coms = [], mineStar = false;
    try {
      it = snapItem(await wsRef.doc(wid).get());
      if (!it) { toast('Ce dépôt n’existe plus'); return; }
      [coms, mineStar] = await Promise.all([comments(wid).catch(() => []), isStarred(wid)]);
    } catch (e) { toast(friendly(e), { duration: 7000 }); return; }
    const owner = it.uid === uid;
    if (!it.pub && !owner) { toast('Ce dépôt n’est plus disponible'); return; }
    const canPost = !underAge();
    openDialog({
      id: 'wsov', cls: 'share-dlg wide ws-dlg', eyebrow: 'Workspace',
      title: `${esc(it.title)}<span class="dlg-chip">${esc(KIND_LABEL[it.kind] || 'Séance')}</span>`,
      sub: `Déposé par ${esc(it.pseudo)}${it.subject ? ' · ' + esc(specName(it.subject)) : ''}${it.level ? ' · ' + esc(levelName(it.level)) : ''}`,
      body: detailHTML(it, coms, { me: uid, starred: mineStar, canPost }),
      foot: `${owner ? '<button class="cta ghost ev-danger" type="button" data-ws="remove">Retirer</button>' : '<button class="cta ghost" type="button" data-ws="report">Signaler…</button>'}<span class="dlg-spacer"></span><button class="cta" type="button" data-dlg-close>Fermer</button>`,
      onMount: (card, close) => {
        const msg = () => card.querySelector('#ws-msg');
        const say = (t, cls) => { const m = msg(); if (m) { m.textContent = t; m.className = 'ai-keymsg ' + (cls || ''); } };
        const refreshComments = async () => { coms = await comments(wid).catch(() => coms); const l = card.querySelector('#ws-clist'); if (l) l.innerHTML = commentsHTML(coms, { me: uid, owner, canReport: canPost }); const lab = card.querySelector('.ws-comments .po-label'); if (lab) lab.textContent = `Commentaires (${coms.filter(c => !c.hidden).length})`; };
        const busy = (b, v) => { if (b) b.disabled = v; };
        card.addEventListener('click', async e => {
          const b = e.target.closest('[data-ws]'); if (!b) return;
          const k = b.dataset.ws;
          try {
            if (k === 'add' || k === 'save') { busy(b, true); const ok = await download(wid, { save: k === 'save', item: it }); busy(b, false); if (ok && k === 'add') close(); return; }
            if (k === 'star') {
              if (owner || !canPost) return;
              busy(b, true);
              if (starred.has(wid)) { await unstar(wid); it.stars = Math.max(0, it.stars - 1); } else if (await star(wid)) it.stars++;
              b.classList.toggle('on', starred.has(wid)); b.querySelector('.ws-nstar').textContent = it.stars; b.title = starred.has(wid) ? 'Retirer mon étoile' : 'Mettre une étoile'; busy(b, false);
              const cached = ui.items.find(x => x.id === wid); if (cached) cached.stars = it.stars;
              return;
            }
            if (k === 'comment') {
              const inp = card.querySelector('#ws-ctext'); const text = (inp.value || '').trim(); if (!text) { inp.focus(); return; }
              busy(b, true); const c = await comment(wid, text); busy(b, false);
              if (c) { inp.value = ''; coms.push(c); await refreshComments(); say('Commentaire publié.', 'ok'); }
              return;
            }
            if (k === 'chide') { await hideComment(wid, b.dataset.cid, b.dataset.h === '1'); await refreshComments(); return; }
            if (k === 'cdel') { if (await confirmDialog({ title: 'Supprimer votre commentaire ?', ok: 'Supprimer' })) { await deleteComment(wid, b.dataset.cid); await refreshComments(); } return; }
            if (k === 'remove') { if (await confirmDialog({ title: `Retirer « ${it.title} » du Workspace ?`, text: REMOVE_TEXT, ok: 'Retirer' })) { close(); await remove(wid); paint(); } return; }
            if (k === 'report') { openReport(it); return; }
            if (k === 'creport') { const c = coms.find(x => x.id === b.dataset.cid); if (c) openReport(it, { comment: c, onDone: refreshComments }); return; }
          } catch (err) { console.error('Workspace :', err); say(friendly(err), 'err'); busy(b, false); }
        });
        const inp = card.querySelector('#ws-ctext');
        if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const b = card.querySelector('[data-ws="comment"]'); if (b) b.click(); } });
      }
    });
  }
  const REMOVE_TEXT = 'Le dépôt disparaît du Workspace pour tout le monde ; les copies que d’autres membres ont déjà ajoutées à leur bibliothèque ne sont pas effacées. Votre document reste dans la vôtre.';
  /* signaler un dépôt, ou un de ses commentaires (opts.comment) ; opts.onDone : rafraîchir la fiche après l'envoi */
  function openReport(it, opts) {
    const com = opts && opts.comment ? opts.comment : null;
    const what = com ? 'le commentaire' : 'le dépôt';
    openDialog({
      id: 'wsrep', cls: 'share-dlg ws-dlg', eyebrow: 'Workspace',
      title: com ? `Signaler un commentaire de ${esc(com.pseudo)}` : `Signaler « ${esc(it.title)} »`,
      sub: `Le signalement est transmis à l’équipe d’Alixo, qui vérifie et vous informe de sa décision dans l’application. Après trois signalements, ${what} est masqué automatiquement en attendant la vérification.`,
      body: `<div class="ws-form">
        ${com ? `<div class="ws-ptext ws-rquote">${esc(com.text.slice(0, 300))}${com.text.length > 300 ? '…' : ''}</div>` : ''}
        <label class="ws-f"><span>Motif</span><select id="ws-reason">${REASONS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="ws-f"><span>Précisions (facultatif)</span><textarea id="ws-rtext" maxlength="${LIM.report}" rows="3" placeholder="${com ? 'Ce qui pose problème dans ce commentaire…' : 'Ce qui pose problème, la page ou le passage concerné…'}"></textarea></label>
        <div class="ai-keymsg" id="ws-rmsg" role="status"></div>
        <div class="po-hint">Pour une atteinte à vos droits d’auteur, indiquez l’œuvre concernée et le passage copié : l’équipe d’Alixo retire promptement les contenus manifestement illicites qui lui sont signalés. Les signalements abusifs peuvent entraîner la suspension du compte.</div>
      </div>`,
      foot: `<button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" id="ws-rok" type="button">Envoyer le signalement</button>`,
      onMount: (card, close) => {
        card.querySelector('#ws-rok').addEventListener('click', async () => {
          const msg = card.querySelector('#ws-rmsg'); card.querySelector('#ws-rok').disabled = true;
          const reason = card.querySelector('#ws-reason').value, text = card.querySelector('#ws-rtext').value;
          try {
            if (com) await reportComment(it.id, com.id, reason, text); else await report(it.id, reason, text);
            close(); toast('Signalement envoyé — merci. L’équipe d’Alixo vous informera de sa décision.', { duration: 6000 });
            if (opts && opts.onDone) opts.onDone();
          } catch (e) { console.error('Workspace (signalement) :', e); msg.textContent = isDenied(e) ? `Vous avez déjà signalé ${what}.` : friendly(e); msg.className = 'ai-keymsg err'; card.querySelector('#ws-rok').disabled = false; }
        });
      }
    });
  }

  /* ---------------- interactions de l'espace ---------------- */
  const root = $('#lib-workspace');
  if (root) {
    let qTm = null;
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-ws]'); if (!b) return;
      const k = b.dataset.ws;
      if (k === 'sort') { ui.sort = SORT_FIELD[b.dataset.v] ? b.dataset.v : 'popular'; load(); return; }
      /* 1.55 : onglets Explorer / Mes dépôts, et « Effacer les filtres » */
      if (k === 'tab') { ui.tab = b.dataset.v === 'mine' ? 'mine' : 'explore'; paint(); const t = root.querySelector(`[data-ws="tab"][data-v="${ui.tab}"]`); if (t) t.focus(); return; }
      if (k === 'clear') { const reload = !!(ui.subject || ui.level); ui.subject = ''; ui.level = ''; ui.q = ''; if (reload) load(); else paint(); return; }
      if (k === 'post') { openPublish(); return; }
      if (k === 'open') { openItem(b.dataset.wid); return; }
      if (k === 'more') { load({ more: true }); return; }
      if (k === 'reload') { load(); loadMine(); return; }
      if (k === 'remove') {
        const it = ui.mine.find(x => x.id === b.dataset.wid); if (!it) return;
        if (await confirmDialog({ title: `Retirer « ${it.title} » du Workspace ?`, text: REMOVE_TEXT, ok: 'Retirer' })) {
          try { await remove(it.id); } catch (err) { console.error('Workspace :', err); toast('Retrait impossible : ' + friendly(err), { duration: 7000 }); }
          paint();
        }
      }
    });
    root.addEventListener('change', e => {
      const s = e.target.closest('select[data-ws]'); if (!s) return;
      if (s.dataset.ws === 'subject') ui.subject = keyIn(specs(), s.value);
      if (s.dataset.ws === 'level') ui.level = keyIn(levels(), s.value);
      load();
    });
    root.addEventListener('input', e => {
      const q = e.target.closest('input[data-ws="q"]'); if (!q) return;
      clearTimeout(qTm); qTm = setTimeout(() => { ui.q = q.value.slice(0, 80); ui.tab = 'explore'; paint(); }, 160);
    });
  }

  /* ---------------- notifications : un commentaire arrive sur un de mes dépôts ; un de mes dépôts est masqué ---------------- */
  const unsubs = [];
  async function watchComments() {
    if (!window.AlixoNotify) return;
    let list;
    try { list = await mine(); } catch { return; }
    const since = now();
    for (const it of list.slice(0, MAX_POSTS)) {
      const u = wsRef.doc(it.id).collection('comments').where('ts', '>', since).onSnapshot(snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return;
          const c = normComment(ch.doc.id, ch.doc.data()); if (!c || c.uid === uid) return;
          AlixoNotify.push({ id: 'ws_c_' + c.id, kind: 'workspace', title: `${c.pseudo} a commenté « ${it.title} »`, text: c.text.slice(0, 200), action: { type: 'workspace', wid: it.id } });
        });
      }, err => console.warn('Workspace (commentaires) :', err && err.message));
      unsubs.push(u);
    }
    /* masquage (trois signalements ou administrateur) : hidden false → true sur une de mes fiches */
    const hiddenState = new Map(list.map(it => [it.id, it.hidden]));
    const u2 = wsRef.where('uid', '==', uid).onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type === 'removed') { hiddenState.delete(ch.doc.id); return; }
        const it = norm(ch.doc.id, ch.doc.data()); if (!it) return;
        const was = hiddenState.get(it.id); hiddenState.set(it.id, it.hidden);
        if (was === false && it.hidden) AlixoNotify.push({ id: 'ws_h_' + it.id + '_' + it.updatedAt, kind: 'workspace', title: `Votre dépôt « ${it.title} » a été masqué après signalements`, text: `Il n’est plus visible des autres membres en attendant la vérification par l’équipe d’Alixo — écrivez à ${CONTACT} pour contester.`, action: { type: 'workspace', wid: it.id } });
      });
    }, err => console.warn('Workspace (mes dépôts) :', err && err.message));
    unsubs.push(u2);
  }
  setTimeout(() => { watchComments().catch(() => {}); }, 6000);

  return { enabled: true, view, render, publish, list, download, star, unstar, comment, report, reportComment, remove, mine, openPublish, openItem, comments, hideComment, deleteComment };
})();
