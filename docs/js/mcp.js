/* ============================================================
   Alixo — Paramètres › Intégrations (1.56.0) : connecter une IA tierce (Claude, Cursor, VS Code…) à la bibliothèque
   par le serveur MCP d'Alixo (Worker alixo-mcp, dossier mcp/).
   - adresse du serveur : AlixoCloud.mcp.url() (config/public.mcpApi ou ALIXO_MCP.api) ; vide → « pas encore activé » ;
   - jetons personnels : liste, création (secret affiché une seule fois, inséré dans les guides tant que la section
     reste ouverte), révocation — par AlixoCloud.mcp.tokens (API /api/tokens, jeton Firebase du compte) ;
   - guides de connexion prêts à copier et rappel de confidentialité.
   Chargé après cloudconfig.js ; utilise esc, toast, openDialog, openExternalUrl, closeSettings (app.js).
   ============================================================ */
'use strict';

window.AlixoMcp = (() => {
  const MAX = 5;
  const PRIVACY_URL = 'https://alixoapp.com/confidentialite.html';
  const PLACEHOLDER = 'alx_VOTRE_JETON';
  let tokens = null;        // null : pas encore chargés
  let loadErr = '';
  let busy = false;
  let formOpen = false;
  let fresh = null;         // { id, secret, name, copied } : jeton tout juste créé (affiché une fois)
  let loadSeq = 0;
  let consent = false;      // 1.56.0 : case « J’ai compris… » cochée (création du premier jeton)
  let bypass = false;       // 1.56.0 : « Quitter quand même » rejoue le clic sans nouvelle alerte
  let notice = null;        // 1.56.0 : { kind: 'reauth' | 'err', text, name } — message sous la liste (création refusée)
  const AGE_MSG = 'Les intégrations sont réservées aux membres de 15 ans et plus.';
  /* 1.56.0 : tranche d'âge du profil (app.js) ; '' : âge inconnu */
  const ageGroup = () => { try { return window.AlixoApp && AlixoApp.ageGroup ? AlixoApp.ageGroup() : ''; } catch { return ''; } };

  const cloud = () => (window.AlixoCloud && AlixoCloud.enabled && AlixoCloud.mcp ? AlixoCloud.mcp : null);
  const signedIn = () => !!(window.AlixoCloud && AlixoCloud.enabled);
  const rootEl = () => document.getElementById('mcp-root');
  const fmtDate = t => (t ? new Date(+t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  function fmtUse(t) {
    if (!t) return 'Jamais';
    const d = Date.now() - +t;
    if (d < 60000) return 'À l’instant';
    if (d < 3600000) return `Il y a ${Math.round(d / 60000)} min`;
    if (d < 86400000) return `Il y a ${Math.round(d / 3600000)} h`;
    return fmtDate(t);
  }

  const ICO_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
  const ICO_PLUG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7V3M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0Z"/><path d="M12 17v4"/></svg>';
  const ICO_WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.5"/></svg>';

  /* ---------------- guides de connexion ---------------- */
  function guides(url, secret) {
    const tok = secret || PLACEHOLDER;
    const G = [
      { k: 'claude-code', name: 'Claude Code', where: 'Dans un terminal :', code: `claude mcp add --transport http alixo ${url} --header "Authorization: Bearer ${tok}"` },
      { k: 'claude-desktop', name: 'Claude Desktop', where: 'Dans claude_desktop_config.json (Claude › Réglages › Développeur › Modifier la configuration), puis redémarrer Claude. Node.js doit être installé (téléchargez-le sur nodejs.org, version LTS).',
        code: JSON.stringify({ mcpServers: { alixo: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${AUTH}'], env: { AUTH: 'Bearer ' + tok } } } }, null, 2) },
      { k: 'claude-web', name: 'Claude.ai (navigateur)', where: '', code: '', note: 'Claude.ai demande une connexion par identifiant Alixo : elle arrivera dans une prochaine version.' },
      { k: 'cursor', name: 'Cursor', where: 'Dans Cursor : Réglages › MCP › Ajouter un serveur, puis collez ce texte (ou fichier ~/.cursor/mcp.json) :', code: JSON.stringify({ mcpServers: { alixo: { url, headers: { Authorization: 'Bearer ' + tok } } } }, null, 2) },
      { k: 'vscode', name: 'VS Code', where: 'Dans .vscode/mcp.json :', code: JSON.stringify({ servers: { alixo: { type: 'http', url, headers: { Authorization: 'Bearer ' + tok } } } }, null, 2) },
      { k: 'chatgpt', name: 'ChatGPT', where: '', code: '', note: 'ChatGPT demande une connexion par identifiant Alixo : elle arrivera dans une prochaine version.' }
    ];
    return `<div class="mcp-guides">${G.map(g => `<details class="mcp-guide" data-guide="${g.k}"><summary><b>${esc(g.name)}</b>${g.code ? '' : '<span class="set-tag">Bientôt</span>'}</summary>
      ${g.where ? `<div class="po-hint mcp-where">${esc(g.where)}</div>` : ''}
      ${g.code ? `<div class="mcp-code"><pre><code>${esc(g.code).replace(/ (--[a-z-]+)/g, ' <span class="mcp-nobr">$1</span>')}</code></pre><button type="button" class="cta ghost small mcp-copy" data-copy="pre">${ICO_COPY}<span>Copier</span></button></div>` : ''}
      ${g.note ? `<div class="po-hint mcp-note">${esc(g.note)}</div>` : ''}</details>`).join('')}</div>
      <div class="po-hint">${secret ? 'Les exemples contiennent le jeton que vous venez de créer. Ne partagez pas ces exemples : ils contiennent votre jeton.' : `Remplacez <code>${PLACEHOLDER}</code> par votre jeton (créez-en un ci-dessus : il n’est affiché qu’une fois). Une fois complétés, ne partagez pas ces exemples : ils contiendront votre jeton.`}</div>`;
  }

  /* ---------------- rendu ---------------- */
  /* 1.56.0 : présentation sans jargon (revues UX et juridique) ; « MCP » expliqué en une ligne */
  const intro = `<div class="mcp-intro"><span class="mcp-intro-ico">${ICO_PLUG}</span><div><b>Connecter une IA à votre bibliothèque</b><span>Donnez à un assistant IA installé sur votre ordinateur (Claude, Cursor, VS Code…) l’accès à vos cours : il pourra les lire, y chercher, en créer et compléter ceux qui existent. Vous lui donnez une clé d’accès (un « jeton ») que vous pouvez retirer à tout moment.</span></div></div>
    <div class="po-hint mcp-what">MCP est le protocole qui relie ces assistants à des applications comme Alixo.</div>`;
  function privacyHTML() {
    return `<div class="set-sect"><div class="po-label">Confidentialité</div>
      <ul class="mcp-privacy">
        <li>L’IA que vous connectez reçoit le contenu des documents qu’elle lit, ainsi que votre pseudo et votre statut Alixo+. Son éditeur (Anthropic, Cursor, Microsoft, OpenAI…) les traite sous sa propre responsabilité, selon ses conditions, souvent hors de l’Union européenne (États-Unis notamment). Alixo ne contrôle pas cet usage.</li>
        <li>Un jeton permet de lire toute votre bibliothèque (dossiers, séances, quiz, présentations, tableurs, planches ; pas les fichiers PDF ou Word ni les images) et d’y écrire : créer des séances et des dossiers, compléter des séances existantes.</li>
        <li>Ne connectez pas d’IA à des documents qui contiennent des informations sur d’autres personnes (cas de patients, notes ou copies de camarades…). Respectez les conditions de l’IA choisie, notamment l’âge minimal qu’elle exige.</li>
        <li>Les requêtes passent par le serveur d’Alixo, hébergé par Cloudflare, qui traite l’adresse IP de l’appareil ou du service de l’IA pour limiter les abus. Les journaux techniques ne contiennent ni vos documents ni votre jeton et sont effacés après 7 jours.</li>
        <li>Pour chaque jeton, Alixo conserve son nom, sa date de création, la date de son dernier usage, le nom et la version de l’IA déclarés par celle-ci et les compteurs d’usage du jour. Ces informations sont supprimées à la révocation du jeton, après 12 mois sans usage ou avec votre compte.</li>
        <li>Révoquer un jeton coupe l’accès immédiatement. Ce que l’IA a déjà lu reste chez son éditeur : pour le faire effacer, adressez-vous à lui.</li>
        <li>Un document que vous n’avez pas écrit (copie d’un partage, texte collé) peut contenir des consignes cachées destinées à l’IA : relisez ce qu’elle crée.</li>
      </ul>
      <div class="po-hint">Détails : <a href="${PRIVACY_URL}" target="_blank" rel="noopener" data-ext>politique de confidentialité</a>.</div></div>`;
  }
  function tokensHTML() {
    if (tokens === null) return `<div class="mcp-empty">${loadErr ? esc(loadErr) + ` <button type="button" class="cta ghost small" data-act="reload">Réessayer</button>` : 'Chargement…'}</div>`;
    if (!tokens.length) return '<div class="mcp-empty">Aucun jeton pour l’instant.</div>';
    return `<table class="mcp-tbl"><thead><tr><th>Nom</th><th>Créé le</th><th>Dernier usage</th><th>Dernière IA</th><th><span class="mcp-sr">Actions</span></th></tr></thead><tbody>${tokens.map(t => {
      const u = t.usage || {};
      const today = (u.reads || u.writes) ? `${u.reads || 0} lecture${(u.reads || 0) > 1 ? 's' : ''}, ${u.writes || 0} écriture${(u.writes || 0) > 1 ? 's' : ''} aujourd’hui` : '';
      return `<tr data-id="${esc(t.id)}"><td><b>${esc(t.name || 'Jeton')}</b><code class="mcp-prefix">${esc(t.prefix || '')}…</code></td><td>${esc(fmtDate(t.createdAt))}</td><td>${esc(fmtUse(t.lastUsedAt))}${today ? `<small>${esc(today)}</small>` : ''}</td><td>${esc(t.lastClient || '—')}</td>
        <td class="mcp-act"><button type="button" class="cta ghost small mcp-revoke" data-act="revoke" data-id="${esc(t.id)}" aria-label="${esc(`Révoquer le jeton « ${t.name || 'Jeton'} »`)}" ${busy ? 'disabled' : ''}>Révoquer</button></td></tr>`; }).join('')}</tbody></table>`;
  }
  /* 1.56.0 : « J’ai copié mon jeton » reste désactivé tant qu'aucune copie n'a réussi */
  function hideBtnHTML() {
    const c = !!(fresh && fresh.copied);
    return `<button type="button" class="cta ghost small" data-act="hide-secret" ${c ? '' : 'disabled aria-describedby="mcp-copyfirst"'}>J’ai copié mon jeton</button>${c ? '' : '<span class="po-hint mcp-copyfirst" id="mcp-copyfirst">Copiez d’abord votre jeton</span>'}`;
  }
  function freshHTML() {
    if (!fresh) return '';
    return `<div class="mcp-secret" id="mcp-secret" role="status"><div class="mcp-secret-head">${ICO_WARN}<b>Jeton « ${esc(fresh.name)} » créé : copiez-le maintenant</b></div>
      <div class="mcp-code mcp-code-one"><pre><code id="mcp-secret-val">${esc(fresh.secret)}</code></pre><button type="button" class="cta small mcp-copy" data-copy="secret">${ICO_COPY}<span>Copier</span></button></div>
      <div class="mcp-secret-warn">Il ne sera plus jamais affiché. Quiconque le détient peut lire et écrire toute votre bibliothèque : ne le partagez pas, ne le publiez pas (dépôt Git, capture d’écran…).</div>
      <div class="po-row mcp-secret-foot">${hideBtnHTML()}</div></div>`;
  }
  /* 1.56.0 : formulaire de création — nom visible, case de consentement au premier jeton */
  function formHTML() {
    const first = !!tokens && !tokens.length;
    const off = busy || (first && !consent);
    return `<form class="mcp-form" id="mcp-form" autocomplete="off"><label class="mcp-lbl" for="mcp-name">Nom (pour le reconnaître plus tard)</label>
      <div class="mcp-formrow"><input type="text" id="mcp-name" maxlength="40" placeholder="Claude Code sur mon portable" ${busy ? 'disabled' : ''}><button type="submit" class="cta small" ${off ? 'disabled' : ''}>Créer</button><button type="button" class="cta ghost small" data-act="cancel">Annuler</button></div>
      ${first ? `<label class="mcp-consent"><input type="checkbox" id="mcp-consent" ${consent ? 'checked' : ''} ${busy ? 'disabled' : ''}><span>J’ai compris que l’IA choisie recevra le contenu de ma bibliothèque</span></label>` : ''}</form>`;
  }
  /* 1.56.0 : bouton « Créer un jeton » et son explication (âge, plafond de cinq jetons) */
  function ageBlock() {
    const ag = ageGroup();
    return ag === 'u15' ? AGE_MSG : ag === '' ? 'Renseignez votre date de naissance (Paramètres › Compte) pour créer un jeton : ' + AGE_MSG.charAt(0).toLowerCase() + AGE_MSG.slice(1) : '';
  }
  function newRowHTML(full) {
    const ag = ageGroup(), age = ageBlock();
    const off = full || tokens === null || busy || !!age;
    const hint = age ? `<span class="po-hint mcp-age" id="mcp-age" style="margin:0">${esc(age)}</span>${ag === '' ? '<button type="button" class="cta ghost small" data-act="account">Renseigner mon âge</button>' : ''}`
      : full ? '<span class="po-hint" style="margin:0">Cinq jetons au plus : révoquez-en un pour en créer un autre.</span>' : '<span class="po-hint" style="margin:0">Un jeton par appareil ou par IA : vous pourrez le révoquer seul.</span>';
    return `${noticeHTML()}<div class="po-row mcp-new"><button type="button" class="cta small" data-act="new" ${off ? 'disabled' : ''} ${age ? `title="${esc(AGE_MSG)}" aria-describedby="mcp-age"` : ''}>Créer un jeton</button>${hint}</div>`;
  }
  /* 1.56.0 : création refusée par le serveur — reconnexion demandée (401 reauth), âge (403), service pas prêt (503)… */
  function noticeHTML() {
    if (!notice) return '';
    return `<div class="mcp-notice ${notice.kind}" role="alert"><span>${esc(notice.text)}</span>${notice.kind === 'reauth' ? `<button type="button" class="cta small" data-act="reauth" ${busy ? 'disabled' : ''}>Se reconnecter</button>` : ''}</div>`;
  }
  function bodyHTML() {
    if (!signedIn()) return `<div class="set-sect">${intro}<div class="po-hint">Connectez-vous à votre compte Alixo (Paramètres › Compte) pour créer un jeton.</div>
      <div class="po-row" style="margin-top:10px"><button type="button" class="cta small" data-act="login">Se connecter</button></div></div>${privacyHTML()}`;
    const C = cloud();
    if (!C || !C.ready()) return `<div class="set-sect">${intro}<div class="mcp-off"><b>Bientôt disponible</b><span>La connexion d’assistants IA à Alixo n’est pas encore ouverte. Cette page se mettra à jour d’elle-même dès qu’elle le sera.</span></div></div>${privacyHTML()}`;
    const url = C.url();
    const full = tokens && tokens.length >= MAX;
    return `<div class="set-sect">${intro}
      <div class="po-label">Adresse du serveur MCP</div>
      <div class="mcp-urlrow"><input type="text" id="mcp-url" value="${esc(url)}" readonly aria-label="Adresse du serveur MCP" spellcheck="false"><button type="button" class="cta ghost small mcp-copy" data-copy="url">${ICO_COPY}<span>Copier</span></button></div>
      <details class="mcp-dev" data-guide="dev"><summary>Pour les développeurs</summary><div class="po-hint">Transport HTTP ; authentification par en-tête <code>Authorization: Bearer</code> suivi de votre jeton.</div></details></div>
    <div class="set-sect"><div class="po-label">Vos jetons <span class="mcp-count">${tokens ? `${tokens.length} / ${MAX}` : ''}</span></div>
      ${freshHTML()}
      <div id="mcp-tokens">${tokensHTML()}</div>
      ${formOpen && !full && tokens !== null && !ageBlock() ? noticeHTML() + formHTML() : newRowHTML(full)}
      <div class="po-hint">Chaque jeton permet 500 lectures et 50 écritures par jour.</div></div>
    <div class="set-sect"><div class="po-label">Guides de connexion</div>${guides(url, fresh && fresh.secret)}</div>
    ${privacyHTML()}`;
  }
  function render() {
    const r = rootEl(); if (!r) return;
    const open = [...r.querySelectorAll('details[open]')].map(d => d.dataset.guide);
    const name = r.querySelector('#mcp-name'); const typed = name ? name.value : '';
    r.innerHTML = bodyHTML();
    open.forEach(k => { const d = r.querySelector(`details[data-guide="${k}"]`); if (d) d.open = true; });
    const n2 = r.querySelector('#mcp-name'); if (n2) { n2.value = typed; }
  }

  /* ---------------- actions ---------------- */
  async function load() {
    const C = cloud(); if (!C || !C.ready()) return;
    const seq = ++loadSeq;
    loadErr = '';
    try { const list = await C.tokens.list(); if (seq !== loadSeq) return; tokens = Array.isArray(list) ? list : []; }
    catch (e) { if (seq !== loadSeq) return; tokens = null; loadErr = 'Impossible d’afficher vos jetons. Vérifiez votre connexion internet.'; console.error('[mcp] liste des jetons', e); }
    render();
  }
  /* renvoie true si le texte a bien été copié */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Copié'); return true; } catch { /* repli ci-dessous */ }
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); toast(ok ? 'Copié' : 'Copie impossible : sélectionnez le texte puis Ctrl+C');
    return ok;
  }
  /* 1.56.0 : bouton Copier → « Copié ✓ » pendant 2 s */
  function flashCopied(btn) {
    const s = btn && btn.querySelector('span'); if (!s) return;
    clearTimeout(btn._mcpTm); s.textContent = 'Copié ✓';
    btn._mcpTm = setTimeout(() => { if (btn.isConnected) s.textContent = 'Copier'; }, 2000);
  }
  /* 1.56.0 : nom vide → « Jeton du 19 nov. 2026 » */
  const defaultName = () => 'Jeton du ' + fmtDate(Date.now());
  async function create(name) {
    const C = cloud(); if (!C || busy) return;
    if (ageGroup() !== '15-17' && ageGroup() !== 'adult') { toast(AGE_MSG); return; }
    if (tokens && !tokens.length && !consent) { toast('Cochez d’abord la case « J’ai compris… »'); return; }
    busy = true; notice = null; render();
    const nm = name || defaultName();
    try {
      const t = await C.tokens.create(nm);
      fresh = { id: t.id, secret: t.secret, name: t.name || 'Jeton', copied: false };
      formOpen = false; consent = false;
      tokens = (tokens || []).filter(x => x.id !== t.id);
      tokens.unshift({ id: t.id, prefix: t.prefix, name: t.name, createdAt: t.createdAt, lastUsedAt: 0, lastClient: '', usage: { reads: 0, writes: 0 } });
    } catch (e) {
      console.error('[mcp] création du jeton', e);
      const st = e && e.status;
      /* 1.56.0 : refus expliqués à l'endroit du bouton (le formulaire reste ouvert : le nom saisi est gardé) */
      if (st === 401 && e.code === 'reauth') notice = { kind: 'reauth', text: 'Pour votre sécurité, reconnectez-vous avant de créer un jeton.', name: nm };
      else if (st === 403) notice = { kind: 'err', text: AGE_MSG };
      else if (st === 503) notice = { kind: 'err', text: 'Le service n’est pas encore prêt. Réessayez plus tard.' };
      else toast('Le jeton n’a pas pu être créé. Réessayez dans un instant.');
    }
    busy = false; render();
    const s = document.getElementById('mcp-secret'); if (s) s.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  /* confirmation dans une fenêtre centrale (par-dessus les Paramètres, contrairement au popover de confirmDialog) */
  function confirmRevoke(name) {
    return new Promise(resolve => {
      let done = false;
      const fin = v => { if (done) return; done = true; resolve(v); };
      openDialog({ id: 'mcp-revoke', cls: 'mcp-dlg', eyebrow: 'Intégrations', title: esc(`Révoquer le jeton « ${name || 'Jeton'} » ?`),
        body: '<p class="mcp-dlgtxt">Les IA qui l’utilisent perdent aussitôt l’accès à votre bibliothèque. Cette action est définitive : pour les reconnecter, il faudra créer un nouveau jeton.</p>',
        foot: '<button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta mcp-danger" type="button" id="mcp-revoke-ok">Révoquer</button>',
        onMount: (card, close) => { card.querySelector('#mcp-revoke-ok').addEventListener('click', () => { fin(true); close(); }); setTimeout(() => { const c = card.querySelector('[data-dlg-close]'); if (c) c.focus(); }, 40); },
        onClose: () => fin(false) });
    });
  }
  async function revoke(id) {
    const C = cloud(); if (!C || busy) return;
    const t = (tokens || []).find(x => x.id === id);
    if (!(await confirmRevoke(t ? t.name : ''))) return;
    busy = true; render();
    try { await C.tokens.revoke(id); tokens = (tokens || []).filter(x => x.id !== id); if (fresh && fresh.id === id) fresh = null; toast('Jeton révoqué'); }
    catch (e) { toast('Le jeton n’a pas pu être révoqué. Réessayez : tant que ce n’est pas fait, il reste actif.'); console.error('[mcp] révocation du jeton', e); }
    busy = false; render();
  }

  /* ---------------- 1.56.0 : reconnexion avant la création d'un jeton (le serveur exige une connexion de moins de 5 min) ----------------
     Google ou Apple : fenêtre du fournisseur ; adresse et mot de passe : mot de passe demandé ici ; puis jeton Firebase rafraîchi
     et création relancée. Impossible (autre fournisseur, fenêtre bloquée…) : on explique et on propose de se déconnecter. */
  function askPassword(email) {
    return new Promise(resolve => {
      let done = false;
      const fin = v => { if (done) return; done = true; resolve(v); };
      openDialog({ id: 'mcp-reauth', cls: 'mcp-dlg', eyebrow: 'Intégrations', title: 'Confirmez votre mot de passe',
        body: `<p class="mcp-dlgtxt">Pour votre sécurité, saisissez le mot de passe du compte ${esc(email)} avant de créer un jeton.</p><form id="mcp-pwform" autocomplete="on"><label class="mcp-lbl" for="mcp-pw">Mot de passe</label><input type="password" id="mcp-pw" autocomplete="current-password" class="mcp-pw"></form>`,
        foot: '<button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" type="button" id="mcp-pw-ok">Confirmer</button>',
        onMount: (card, close) => {
          const go = () => { const v = card.querySelector('#mcp-pw').value; if (!v) { card.querySelector('#mcp-pw').focus(); return; } fin(v); close(); };
          card.querySelector('#mcp-pw-ok').addEventListener('click', go);
          card.querySelector('#mcp-pwform').addEventListener('submit', e => { e.preventDefault(); go(); });
          setTimeout(() => { const i = card.querySelector('#mcp-pw'); if (i) i.focus(); }, 40);
        },
        onClose: () => fin(null) });
    });
  }
  async function reauthenticate() {
    const A = window.AlixoAuth;
    const u = A && A.user ? A.user() : null;
    if (!u || typeof firebase === 'undefined' || !firebase.auth) throw new Error('indisponible');
    const pid = ((u.providerData || [])[0] || {}).providerId || '';
    if (pid === 'password') {
      const pass = await askPassword(u.email || '');
      if (pass === null) return false;
      await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, pass));
    } else if (pid === 'google.com') await u.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
    else if (pid === 'apple.com') { const p = new firebase.auth.OAuthProvider('apple.com'); p.addScope('email'); await u.reauthenticateWithPopup(p); }
    else throw new Error('fournisseur');
    await u.getIdToken(true);   // nouveau jeton Firebase : date de connexion à jour pour le serveur MCP
    return true;
  }
  async function reauthAndCreate() {
    const n = notice; if (!n || busy) return;
    let ok = false;
    try { ok = await reauthenticate(); }
    catch (e) {
      console.error('[mcp] reconnexion', e);
      const wrong = e && /wrong-password|invalid-credential|invalid-login/.test(e.code || '');
      if (wrong) { notice = { kind: 'reauth', text: 'Mot de passe incorrect. Réessayez.', name: n.name }; render(); return; }
      if (e && /popup-closed|cancelled-popup/.test(e.code || '')) return;
      notice = { kind: 'err', text: 'La reconnexion n’a pas abouti ici. Déconnectez-vous (Paramètres › Se déconnecter), reconnectez-vous, puis revenez créer votre jeton.', name: n.name };
      render(); return;
    }
    if (!ok) return;
    notice = null;
    await create(n.name);
  }

  /* ---------------- 1.56.0 : secret non copié — avertir avant de quitter la section ou les Paramètres ---------------- */
  const mustWarn = () => !!(fresh && !fresh.copied && rootEl());
  function confirmLeave() {
    return new Promise(resolve => {
      let done = false;
      const fin = v => { if (done) return; done = true; resolve(v); };
      openDialog({ id: 'mcp-leave', cls: 'mcp-dlg', eyebrow: 'Intégrations', title: 'Votre jeton n’a pas été copié',
        body: '<p class="mcp-dlgtxt">Il ne sera plus jamais affiché. Si vous quittez maintenant, il faudra le révoquer et en créer un nouveau.</p>',
        foot: '<button class="cta ghost" type="button" id="mcp-leave-go">Quitter quand même</button><button class="cta" type="button" data-dlg-close id="mcp-leave-stay">Rester</button>',
        onMount: (card, close) => { card.querySelector('#mcp-leave-go').addEventListener('click', () => { fin(true); close(); }); setTimeout(() => { const c = card.querySelector('#mcp-leave-stay'); if (c) c.focus(); }, 40); },
        onClose: () => fin(false) });
    });
  }
  /* oublie le secret (et l'efface de l'écran) */
  function forget() { if (!fresh && !formOpen) return; fresh = null; formOpen = false; consent = false; if (rootEl()) render(); }
  function leaveTarget(t) {
    const ov = document.getElementById('setov');
    if (!ov || ov.hidden || document.querySelector('.dlgov') || !t || !t.closest) return null;
    if (t === ov) return ov;
    const x = t.closest('.set-x, #set-logout'); if (x && ov.contains(x)) return x;
    const nb = t.closest('.set-navbtn'); if (nb && ov.contains(nb) && nb.dataset.cat !== 'integrations') return nb;
    return null;
  }
  window.addEventListener('click', e => {
    if (bypass || !mustWarn()) return;
    const el = leaveTarget(e.target); if (!el) return;
    e.preventDefault(); e.stopImmediatePropagation();
    confirmLeave().then(go => { if (!go) return; fresh = null; bypass = true; try { el.click(); } finally { bypass = false; } });
  }, true);
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !mustWarn() || (e.target && e.target.id === 'mcp-name')) return;
    const ov = document.getElementById('setov');
    if (!ov || ov.hidden || document.querySelector('.dlgov') || document.getElementById('pfov')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    confirmLeave().then(go => { if (!go) return; fresh = null; if (typeof closeSettings === 'function') closeSettings(); });
  }, true);
  /* Athéna : le secret est aussi oublié à la fermeture des Paramètres et au changement de section */
  function watchSettings() {
    const ov = document.getElementById('setov'); if (!ov || ov._mcpObs) return;
    ov._mcpObs = true;
    new MutationObserver(() => { if (ov.hidden) forget(); }).observe(ov, { attributes: true, attributeFilter: ['hidden'] });
    const body = ov.querySelector('#set-body');
    if (body) new MutationObserver(() => { if (!rootEl()) { fresh = null; formOpen = false; consent = false; } }).observe(body, { childList: true });
  }

  function settingsHTML() {
    fresh = null; formOpen = false; busy = false; consent = false; notice = null;   // secret affiché une seule fois : oublié en quittant la section
    if (!cloud() || !cloud().ready()) tokens = null;
    return `<div id="mcp-root" class="mcp-root">${bodyHTML()}</div>`;
  }
  function bindSettings(root) {
    watchSettings();
    const r = root.querySelector('#mcp-root'); if (!r || r._mcpBound) return;
    r._mcpBound = true;
    r.addEventListener('click', e => {
      const ext = e.target.closest('a[data-ext]');
      if (ext) { e.preventDefault(); if (typeof openExternalUrl === 'function') openExternalUrl(ext.href); else window.open(ext.href, '_blank', 'noopener'); return; }
      const cp = e.target.closest('[data-copy]');
      if (cp) {
        const k = cp.dataset.copy;
        const text = k === 'url' ? (r.querySelector('#mcp-url') || {}).value : k === 'secret' ? (fresh && fresh.secret) : (cp.parentElement.querySelector('pre') || {}).textContent;
        if (text) copyText(text).then(ok => {
          if (!ok) return;
          flashCopied(cp);
          /* le secret (seul ou dans un guide) est copié : « J’ai copié mon jeton » devient disponible */
          if (fresh && !fresh.copied && text.includes(fresh.secret)) {
            fresh.copied = true;
            const foot = r.querySelector('.mcp-secret-foot'); if (foot) foot.innerHTML = hideBtnHTML();
          }
        });
        return;
      }
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      const act = b.dataset.act;
      if (act === 'login') { if (typeof closeSettings === 'function') closeSettings(); if (window.AlixoAuth && AlixoAuth.openAuthOverlay) AlixoAuth.openAuthOverlay(); }
      else if (act === 'new') { formOpen = true; render(); const n = r.querySelector('#mcp-name'); if (n) n.focus(); }
      else if (act === 'cancel') { formOpen = false; consent = false; notice = null; render(); }
      else if (act === 'reauth') reauthAndCreate();
      else if (act === 'account') { if (window.AlixoApp && AlixoApp.openSettings) AlixoApp.openSettings('compte'); }
      else if (act === 'hide-secret') { fresh = null; render(); }
      else if (act === 'reload') { tokens = null; loadErr = ''; render(); load(); }
      else if (act === 'revoke') revoke(b.dataset.id);
    });
    r.addEventListener('submit', e => { if (e.target.id !== 'mcp-form') return; e.preventDefault(); const n = r.querySelector('#mcp-name'); create(n ? n.value.trim() : ''); });
    r.addEventListener('change', e => {
      if (e.target.id !== 'mcp-consent') return;
      consent = e.target.checked;
      const s = r.querySelector('#mcp-form [type="submit"]'); if (s) s.disabled = busy || !consent;
    });
    r.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.id === 'mcp-name') { e.preventDefault(); e.stopPropagation(); formOpen = false; render(); } });
    r.addEventListener('focusin', e => { if (e.target.id === 'mcp-url') e.target.select(); });
    load();
  }
  /* adresse du serveur changée (panneau admin) : la section ouverte se met à jour */
  function refresh() { if (!rootEl()) return; tokens = null; render(); load(); }

  return { settingsHTML, bindSettings, refresh };
})();
