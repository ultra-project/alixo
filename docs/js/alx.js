/* ============================================================
   Alixo — fichiers .alx (1.35, documents liés à un fichier du disque en 1.38) : exporter un document d'Alixo dans un fichier qui se rouvre avec Alixo
   Un fichier .alx est une archive ZIP (JSZip, js/vendor/jszip.min.js) :
     mimetype       « application/x-alixo » (en premier, non compressé)
     alixo.json     { format: 'alx', version: 1, app, kind, exportedAt, title, doc, images }
                    doc    : le document tel qu'il est dans la bibliothèque (state.docs) — sauf, depuis la 1.51, la référence à
                             l'original d'une image retouchée (b.o), retirée de la copie exportée
                    images : { <iid>: 'images/<iid>.png' } — les images du magasin (AlixoImages) que le document utilise
     images/…       les images (fichiers binaires, extension d'après le type)
   L'extension dit le type de document : .alx-docs (séance), .alx-slide (présentation), .alx-sheet (tableur),
   .alx-quiz (quiz), .alx-planche (planche). Version PC : ces extensions sont associées à Alixo (package.json ›
   build.fileAssociations) ; un double-clic sur le fichier l'ouvre dans l'application (main.js → preload.js → ici).
   À l'import, le document reçoit de nouveaux identifiants (document, blocs, onglets, diapositives, éléments, items,
   questions, images) : importer deux fois le même fichier donne deux documents distincts, sans toucher à l'original.
   Chargé APRÈS app.js, files.js et export.js : utilise leurs globales (state, save, uid, openDoc, toast, esc,
   AlixoImages, safeFileName, isSlidesDoc…, duplicateDoc n'est pas appelée : sa logique d'identifiants est reprise).
   ============================================================ */
'use strict';

window.AlixoAlx = (() => {
  const FORMAT = 'alx';
  const VERSION = 1;
  const MIME = 'application/x-alixo';
  const MAX_BYTES = 50 * 1024 * 1024;   // au-delà : refusé (mémoire)
  /* type de document ↔ suffixe d'extension */
  const KINDS = {
    docs: { ext: 'alx-docs', name: 'Séance Alixo', label: 'séance', docKind: '' },
    slide: { ext: 'alx-slide', name: 'Présentation Alixo', label: 'présentation', docKind: 'slides' },
    sheet: { ext: 'alx-sheet', name: 'Tableur Alixo', label: 'tableur', docKind: 'sheet' },
    quiz: { ext: 'alx-quiz', name: 'Quiz Alixo', label: 'quiz', docKind: 'quiz' },
    planche: { ext: 'alx-planche', name: 'Planche Alixo', label: 'planche', docKind: 'board' }
  };
  const EXT_RE = /\.alx-(docs|slide|sheet|quiz|planche)$/i;
  const isAlx = name => EXT_RE.test(String(name || ''));
  /* type d'après le nom du fichier ('docs', 'slide'…) ou '' */
  const kindOf = name => { const m = EXT_RE.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  /* type d'après le document */
  const kindOfDoc = d => (!d ? '' : d.kind === 'slides' ? 'slide' : d.kind === 'sheet' ? 'sheet' : d.kind === 'quiz' ? 'quiz' : d.kind === 'board' ? 'planche' : 'docs');
  const extFor = d => '.' + KINDS[kindOfDoc(d)].ext;
  const S = s => String(s ?? '').trim();

  /* ---------------- images utilisées par un document ---------------- */
  function imageIds(d) {
    const ids = new Set();
    const add = v => { if (typeof v === 'string' && v) ids.add(v); };
    /* 1.51 : l'original d'une image retouchée (b.o, js/imgtools.js) n'est PAS exporté — le fond retiré par « Supprimer le fond »
       ne voyage pas avec le fichier (voir publicJSON plus bas) */
    const fromBlocks = bl => (bl || []).forEach(b => { if (b && b.type === 'img') add(b.iid); });
    fromBlocks(d.blocks);
    (d.pages || []).forEach(p => fromBlocks(p.blocks));
    (d.slides || []).forEach(s => (s.els || []).forEach(e => { if (e && e.t === 'image') add(e.iid); }));
    (d.items || []).forEach(it => { if (it && it.t === 'img') add(it.iid); if (it && it.b && it.b.type === 'img') add(it.b.iid); });
    (d.questions || []).forEach(q => { if (q) add(q.img); });
    return [...ids];
  }
  /* data URL → { mime, bytes } ; autre chaîne : conservée telle quelle en texte */
  function dataUrlToBytes(u) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(u || '');
    if (!m) return null;
    const mime = m[1] || 'application/octet-stream';
    if (m[2]) { const bin = atob(m[3]); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return { mime, bytes: out }; }
    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(m[3])) };
  }
  const EXT_OF_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif' };
  const MIME_OF_EXT = Object.fromEntries(Object.entries(EXT_OF_MIME).map(([m, e]) => [e, m]));
  function bytesToDataUrl(bytes, mime) {
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return `data:${mime || 'application/octet-stream'};base64,${btoa(bin)}`;
  }

  /* ---------------- export ---------------- */
  /* 1.51 : le fichier ne contient ni l'image d'origine d'une image retouchée, ni sa référence (b.o). « Réinitialiser l'image »
     reste possible chez l'auteur (son document en mémoire n'est pas touché), pas chez la personne qui reçoit le fichier.
     Vaut aussi pour un document lié à un fichier du disque (writeDoc) : rouvert depuis le fichier, il n'a plus d'original. */
  const publicJSON = v => (window.AlixoImgTools && AlixoImgTools.publicJSON ? AlixoImgTools.publicJSON(v)
    : JSON.stringify(v, function (k, x) { return k === 'o' && this && this.type === 'img' ? undefined : x; }));
  /* l'archive d'un document → ArrayBuffer */
  async function build(d, imgSource) {
    if (!d) throw new Error('document introuvable');
    if (typeof JSZip === 'undefined') throw new Error('archive indisponible (JSZip)');
    const zip = new JSZip();
    zip.file('mimetype', MIME, { compression: 'STORE' });
    const images = {};
    for (const iid of imageIds(d)) {
      let v = null;
      /* 1.53.0 : `imgSource` (Map iid → data URL) remplace le magasin d'images — archive reconstruite à partir d'une autre archive */
      try { v = imgSource instanceof Map ? (imgSource.get(iid) || null) : await AlixoImages.get(iid); } catch { v = null; }
      if (!v) continue;
      const bin = dataUrlToBytes(v);
      if (bin) { const name = `images/${iid}.${EXT_OF_MIME[bin.mime] || 'bin'}`; zip.file(name, bin.bytes); images[iid] = name; }
      else { const name = `images/${iid}.txt`; zip.file(name, String(v)); images[iid] = name; }   // adresse ou autre forme : gardée en texte
    }
    const meta = {
      format: FORMAT, version: VERSION, app: typeof ALIXO_VERSION === 'string' ? ALIXO_VERSION : '',
      kind: kindOfDoc(d), exportedAt: new Date().toISOString(), title: S(d.titre) || 'Sans titre',
      doc: d, images
    };
    zip.file('alixo.json', publicJSON(meta));
    return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: MIME });
  }
  function fileName(d) { return safeFileName(d.titre || 'Sans titre') + extFor(d); }
  /* télécharge (navigateur) ou enregistre (version PC) le document `docId` */
  async function exportDoc(docId) {
    const d = (typeof findDoc === 'function' ? findDoc(docId) : null) || state.docs.find(x => x.id === docId);
    if (!d) { toast('Ce document n’existe plus'); return false; }
    const k = KINDS[kindOfDoc(d)];
    toast(`Préparation du fichier .${k.ext}…`, { duration: 2500 });
    let buf;
    try { buf = await build(d); } catch (e) { console.error(e); toast('Export impossible : ' + (e && e.message || e)); return false; }
    return saveBuffer(fileName(d), buf);
  }
  /* 1.53 : enregistre une archive déjà construite (version PC : boîte « Enregistrer sous » ; navigateur : téléchargement).
     Factorisé depuis exportDoc pour le Workspace (js/workspace.js) : le type vient de l'extension du nom. */
  async function saveBuffer(name, buf) {
    const k = KINDS[kindOf(name) || 'docs'];
    const desk = window.alixoDesktop;
    if (desk && desk.saveFile) {
      const r = await desk.saveFile({ name, data: new Uint8Array(buf), filters: [{ name: k.name + ' (.' + k.ext + ')', extensions: [k.ext] }] });
      if (r && r.ok) toast(`Fichier enregistré : ${r.path.split(/[\\/]/).pop()}`, { action: 'Ouvrir le dossier', onAction: () => desk.openPath && desk.openPath(r.path.replace(/[\\/][^\\/]*$/, '')) });
      else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
      return !!(r && r.ok);
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: MIME })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`« ${name} » téléchargé — il se rouvre dans Alixo (Importer, ou double-clic sur la version PC)`);
    return true;
  }

  /* ---------------- import ---------------- */
  /* nouveaux identifiants partout (même logique que duplicateDoc dans app.js), images comprises (`imap` : ancien iid → nouveau) */
  function freshIds(copy, imap) {
    const remapImg = v => (v && imap.has(v) ? imap.get(v) : v);
    const blocks = bl => (bl || []).forEach(b => { if (!b) return; b.id = uid(); if (b.type === 'img') { b.iid = remapImg(b.iid); if (b.o && typeof b.o === 'object' && b.o.iid) b.o.iid = remapImg(b.o.iid); } });
    copy.id = uid();
    blocks(copy.blocks);
    (copy.pages || []).forEach(p => { p.id = p.id === 'main' ? 'main' : uid(); blocks(p.blocks); });
    if (copy.pages && !copy.pages.some(p => p.id === copy.page)) copy.page = copy.pages[0] && copy.pages[0].id;
    (copy.slides || []).forEach(sl => { sl.id = uid(); (sl.els || []).forEach(el => { el.id = uid(); if (el.t === 'image') el.iid = remapImg(el.iid); }); });
    if (Array.isArray(copy.items)) {
      const ids = new Map(copy.items.map(it => [it.id, uid()]));
      copy.items.forEach(it => {
        it.id = ids.get(it.id);
        if (it.t === 'arrow') { it.from = ids.get(it.from) || it.from; it.to = ids.get(it.to) || it.to; }
        if (it.t === 'img') it.iid = remapImg(it.iid);
        if (it.b && it.b.type === 'img') it.b.iid = remapImg(it.b.iid);
      });
    }
    if (Array.isArray(copy.questions)) {
      copy.questions.forEach(q => {
        q.id = uid();
        if (q.img) q.img = remapImg(q.img);
        if (Array.isArray(q.opts)) { const m = new Map(q.opts.map(o => [o.id, uid()])); q.opts.forEach(o => { o.id = m.get(o.id); }); if (q.t === 'mcq' && Array.isArray(q.ans)) q.ans = q.ans.map(a => m.get(a) || a); }
      });
    }
    return copy;
  }
  /* lit une archive → { meta, images: Map(iid → data URL) } ; lève une erreur lisible si le fichier n'est pas un .alx valable */
  async function read(buf, name) {
    const ab = buf instanceof ArrayBuffer ? buf : (buf && buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : null);
    if (!ab) throw new Error('fichier illisible');
    if (ab.byteLength > MAX_BYTES) throw new Error('fichier de plus de 50 Mo');
    let zip;
    try { zip = await JSZip.loadAsync(ab); } catch { throw new Error('ce n’est pas un fichier Alixo (.alx)'); }
    const entry = zip.file('alixo.json'); if (!entry) throw new Error('fichier Alixo incomplet (alixo.json manquant)');
    let meta;
    try { meta = JSON.parse(await entry.async('string')); } catch { throw new Error('fichier Alixo illisible'); }
    if (!meta || meta.format !== FORMAT || !meta.doc || typeof meta.doc !== 'object' || Array.isArray(meta.doc)) throw new Error('fichier Alixo invalide');
    if (+meta.version > VERSION) throw new Error(`fichier écrit par une version plus récente d’Alixo (${S(meta.app) || '?'}) : mettez Alixo à jour`);
    const kind = KINDS[meta.kind] ? meta.kind : kindOfDoc(meta.doc);
    const fromName = kindOf(name);
    if (fromName && fromName !== kind) throw new Error(`l’extension .${KINDS[fromName].ext} ne correspond pas au contenu (${KINDS[kind].label})`);
    const d = meta.doc;
    if (KINDS[kind].docKind) d.kind = KINDS[kind].docKind; else delete d.kind;
    if (!Array.isArray(d.blocks)) d.blocks = kind === 'docs' ? [] : [];
    const images = new Map();
    for (const [iid, path] of Object.entries(meta.images && typeof meta.images === 'object' ? meta.images : {})) {
      if (typeof path !== 'string' || !path.startsWith('images/')) continue;
      const f = zip.file(path); if (!f) continue;
      if (path.endsWith('.txt')) { images.set(iid, await f.async('string')); continue; }
      const bytes = await f.async('uint8array');
      images.set(iid, bytesToDataUrl(bytes, MIME_OF_EXT[path.split('.').pop().toLowerCase()] || 'application/octet-stream'));
    }
    return { meta, kind, images };
  }
  /* ---- 1.53 : import assaini (fichier venu d'un inconnu : Workspace) ----
     read() valide la forme de l'archive, pas le contenu des champs HTML. Un document reçu du Workspace est donc RECONSTRUIT :
     seuls les champs connus d'une séance sont repris, les blocs passent par AlixoSanitize.blocks (liste blanche, identifiants
     régénérés), le titre et les noms d'onglets deviennent du texte simple. Seules les séances (texte) ont un assainisseur :
     les autres types sont refusés. Les images ne sont gardées que si un bloc les référence encore et si elles sont des images
     matricielles en data URL — jamais de SVG (scripts possibles), jamais d'adresse. */
  const SANITIZED_KINDS = ['docs'];
  const SAFE_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp|bmp|avif);base64,[A-Za-z0-9+/=\s]+$/;
  const ID_RE = /^[\w-]{1,64}$/;
  const plainText = (v, max) => String(typeof v === 'string' ? v : '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
  /* opts.keepProf : le nom du professeur est conservé (fichier du disque, import local) — jamais pour un contenu venu du Workspace */
  function sanitizeDoc(raw, opts) {
    const AS = window.AlixoSanitize;
    if (!AS || typeof AS.blocks !== 'function') throw new Error('assainisseur indisponible');
    const d = raw && typeof raw === 'object' ? raw : {};
    /* bloc par bloc : la date du bloc (jour de cours, « AAAA-MM-JJ ») est un scalaire sûr que AlixoSanitize ne connaît pas — conservée */
    const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
    const cleanBlocks = arr => (Array.isArray(arr) ? arr.slice(0, 5000).flatMap(b => { const c = AS.blocks([b])[0]; if (!c) return []; if (b && DAY_RE.test(String(b.day || ''))) c.day = b.day; return [c]; }) : []);
    const out = { id: uid(), folderId: null, titre: plainText(d.titre, 200), createdAt: Date.now(), updatedAt: Date.now(), pinned: false, blocks: cleanBlocks(d.blocks) };
    const prof = opts && opts.keepProf ? plainText(d.prof, 120) : ''; if (prof) out.prof = prof;   // nom du professeur en texte simple
    if (Array.isArray(d.pages) && d.pages.length) {
      out.pages = d.pages.slice(0, 50).filter(p => p && typeof p === 'object').map(p => ({ id: p.id === 'main' ? 'main' : uid(), titre: plainText(p.titre, 80) || 'Onglet', blocks: Array.isArray(p.blocks) ? cleanBlocks(p.blocks) : null }));
      const cur = d.pages.findIndex(p => p && p.id === d.page);
      out.page = cur >= 0 && out.pages[cur] ? out.pages[cur].id : (out.pages[0] ? out.pages[0].id : undefined);
    }
    if (typeof d.font === 'string' && typeof fontByKey === 'function' && fontByKey(d.font)) out.font = d.font;
    if (typeof d.planMode === 'string' && ['auto', 'adaptive', 'none'].includes(d.planMode)) out.planMode = d.planMode;
    if (d.plan && Array.isArray(d.plan.levels) && typeof normLevels === 'function') { try { const lv = normLevels(d.plan.levels); if (Array.isArray(lv) && lv.length) out.plan = { levels: lv.slice(0, 6) }; } catch { /* plan ignoré */ } }
    return out;
  }
  /* importe des fichiers (File, Blob ou { name, data }) dans le dossier `folderId` ; renvoie les documents créés et ouvre le dernier.
     `sanitize` (1.53) : true → contenu non digne de confiance (Workspace) : document reconstruit par sanitizeDoc, séances SEULEMENT,
     images SVG refusées ; absent (1.53.0, par défaut) → toute séance est assainie de même, les autres types passent tels quels ;
     false → import brut (réservé aux tests). */
  const safeImage = (iid, data) => ID_RE.test(iid) && typeof data === 'string' && SAFE_IMAGE_RE.test(data);
  /* un bloc image dont l'image a été refusée ou manque disparaît (pas de référence qui pointe ailleurs) */
  function dropOrphanImages(raw, has) {
    const keep = bl => (Array.isArray(bl) ? bl.filter(b => !(b && b.type === 'img' && !has(b.iid))) : bl);
    raw.blocks = keep(raw.blocks);
    (raw.pages || []).forEach(p => { p.blocks = keep(p.blocks); });
  }
  async function importFiles(list, folderId, { open = true, quiet = false, sanitize } = {}) {
    const arr = [...(list || [])].filter(Boolean);
    const made = []; const errors = [];
    for (const f of arr) {
      const name = S(f.name) || 'document.alx-docs';
      try {
        const buf = f.data ? f.data : (typeof f.arrayBuffer === 'function' ? await f.arrayBuffer() : f);
        const { meta, kind, images } = await read(buf, name);
        if (sanitize === true && !SANITIZED_KINDS.includes(kind)) throw new Error(`${KINDS[kind].label} : ce type de document ne peut pas encore être importé depuis le Workspace (séances seulement)`);
        const clean = sanitize === true || (sanitize !== false && SANITIZED_KINDS.includes(kind));
        let raw = JSON.parse(JSON.stringify(meta.doc));
        if (clean) raw = sanitizeDoc(raw, { keepProf: sanitize !== true });
        const wanted = clean ? new Set(imageIds(raw)) : null;   // assaini : seules les images encore référencées, et sûres
        const imap = new Map();
        for (const [iid, data] of images) {
          if (wanted && (!wanted.has(iid) || !safeImage(iid, data))) continue;
          const nid = uid(); imap.set(iid, nid); try { await AlixoImages.put(nid, data); } catch (e) { console.error('Image non importée :', e); }
        }
        if (clean) dropOrphanImages(raw, iid => imap.has(iid));
        const copy = freshIds(raw, imap);
        copy.folderId = folderId || null;
        copy.titre = S(copy.titre) || S(meta.title) || name.replace(EXT_RE, '');
        copy.createdAt = copy.updatedAt = Date.now(); copy.pinned = false;
        delete copy.vwOpen;
        state.docs.push(copy); made.push({ doc: copy, kind });
      } catch (e) { console.error('Import .alx impossible :', name, e); errors.push(`${name} : ${e && e.message || e}`); }
    }
    if (made.length) {
      if (folderId && typeof expandedFolders !== 'undefined' && expandedFolders) for (const fo of folderPath(folderId)) expandedFolders.add(fo.id);
      save();
      if (typeof refreshLibrary === 'function') refreshLibrary();
      if (!quiet) {
        const where = typeof folder === 'function' && folder(folderId) ? `« ${folder(folderId).nom} »` : 'Mes cours';
        toast(made.length === 1 ? `${KINDS[made[0].kind].name} « ${made[0].doc.titre} » importée dans ${where}` : `${made.length} documents Alixo importés dans ${where}`);
      }
      if (open) openDoc(made[made.length - 1].doc.id);
    }
    if (errors.length) toast(errors.length === 1 ? 'Import impossible — ' + errors[0] : `${errors.length} fichiers n’ont pas pu être importés (${errors[0]}…)`, { duration: 7000 });
    return made.map(m => m.doc);
  }

  /* ---------------- 1.38 : version PC — documents qui vivent dans un fichier du disque ----------------
     Un fichier .alx ouvert par double-clic (ou créé par « Nouveau › Séance Alixo » sur le bureau : fichier vide) n'est
     plus importé dans la bibliothèque : il s'ouvre tel quel, lié à son fichier (d.alxFile = { path, name, dir, dirName,
     online: false }). Chaque modification est réenregistrée dans le fichier (writeFile), jamais dans le nuage, tant que
     l'utilisateur n'active pas « Sauvegarde en ligne » (barre du haut) : le document rejoint alors sa bibliothèque,
     dans un dossier qui porte le nom du dossier du fichier (Bureau, Documents…), créé au besoin — et le fichier
     continue d'être tenu à jour. Un fichier .alx téléchargé depuis un document de la bibliothèque est indépendant :
     rouvert, c'est un autre document (nouveaux identifiants), ses modifications ne touchent pas l'original. */
  const DIR_NAMES = { desktop: 'Bureau', documents: 'Documents', downloads: 'Téléchargements', onedrive: 'OneDrive', pictures: 'Images', music: 'Musique', videos: 'Vidéos' };
  const baseName = p => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
  const dirOf = p => { const m = /^(.*)[\\/][^\\/]*$/.exec(String(p || '')); return m ? m[1] : ''; };
  const dirName = p => { const n = baseName(p); return DIR_NAMES[n.toLowerCase()] || n || 'Fichiers'; };
  const desk = () => window.alixoDesktop;
  const bytesOf = f => (f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data || []));

  /* ouvre (ou rouvre) le document du fichier `f` = { name, data, path } reçu de main.js */
  async function openFromDisk(f) {
    if (!f || !f.name || !isAlx(f.name)) return null;
    const kind = kindOf(f.name);
    const data = bytesOf(f);
    const path = String(f.path || '');
    const existing = path ? state.docs.find(x => x.alxFile && x.alxFile.path === path) : null;
    if (existing && existing.alxFile.online) {   // déjà dans la bibliothèque : c'est elle qui fait foi
      openDoc(existing.id);
      toast(`« ${existing.titre || 'Sans titre'} » est dans votre bibliothèque (dossier « ${(typeof folder === 'function' && folder(existing.folderId) || {}).nom || 'Mes cours'} »)`);
      return existing;
    }
    let d;
    try {
      if (!data.byteLength) {   // fichier vide (« Nouveau › … Alixo » du bureau) : document neuf du type de l'extension
        d = AlixoApp.newDocOfKind(kind);
        d.titre = f.name.replace(EXT_RE, '').replace(/^Nouveau (document |fichier )?/i, '').trim() || KINDS[kind].name;
      } else {
        const { meta, images } = await read(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), f.name);
        /* 1.53.0 : une séance venue du disque est reconstruite comme un import (sanitizeDoc, images matricielles seulement) */
        const clean = SANITIZED_KINDS.includes(kind);
        let raw = JSON.parse(JSON.stringify(meta.doc));
        if (clean) raw = sanitizeDoc(raw, { keepProf: true });
        const wanted = clean ? new Set(imageIds(raw)) : null;
        const imap = new Map();
        for (const [iid, v] of images) {
          if (wanted && (!wanted.has(iid) || !safeImage(iid, v))) continue;
          const nid = uid(); imap.set(nid, nid); imap.set(iid, nid); try { await AlixoImages.put(nid, v); } catch (e) { console.error('Image non lue :', e); }
        }
        if (clean) dropOrphanImages(raw, iid => imap.has(iid));
        d = freshIds(raw, imap);
        d.titre = S(d.titre) || S(meta.title) || f.name.replace(EXT_RE, '');
        delete d.vwOpen; d.pinned = false;
      }
    } catch (e) { console.error('Ouverture du fichier Alixo impossible :', f.name, e); toast('Ouverture impossible — ' + (e && e.message || e), { duration: 7000 }); return null; }
    if (existing) d.id = existing.id;   // même fichier rouvert : même onglet, contenu relu du fichier
    d.folderId = AlixoApp.LOCAL_FOLDER_ID;
    d.createdAt = d.createdAt || Date.now(); d.updatedAt = Date.now();
    d.alxFile = { path, name: f.name, dir: dirOf(path), dirName: dirName(dirOf(path)), online: false };
    const i = state.docs.findIndex(x => x.id === d.id);
    if (i >= 0) state.docs[i] = d; else state.docs.push(d);
    written.set(d.id, '');   // forcer la première écriture (fichier vide → document complet)
    save();
    openDoc(d.id);
    toast(data.byteLength ? `« ${d.titre} » ouvert depuis ${f.name} — enregistré dans ce fichier, pas en ligne (bouton « Sauvegarde en ligne » pour l’ajouter à votre bibliothèque)` : `${KINDS[kind].name} créée sur votre ordinateur : ${f.name} — enregistrée dans ce fichier à chaque modification`, { duration: 7000 });
    return d;
  }

  /* réécriture du fichier après chaque enregistrement local (débouncée par document) */
  const written = new Map();    // id → JSON écrit (ou en cours d'écriture)
  const writeTm = new Map();
  const warned = new Set();
  function onLocalSave() {
    const dk = desk(); if (!dk || !dk.writeFile) return;
    for (const d of state.docs) {
      if (!d.alxFile || !d.alxFile.path) continue;
      const j = JSON.stringify(d);
      if (written.get(d.id) === j) continue;
      written.set(d.id, j);
      clearTimeout(writeTm.get(d.id));
      writeTm.set(d.id, setTimeout(() => writeDoc(d.id), 900));
    }
  }
  async function writeDoc(id) {
    const d = state.docs.find(x => x.id === id); if (!d || !d.alxFile || !d.alxFile.path) return;
    const dk = desk(); if (!dk || !dk.writeFile) return;
    try {
      const buf = await build(d);
      const r = await dk.writeFile(d.alxFile.path, new Uint8Array(buf));
      if (!r || !r.ok) throw new Error(r && r.error || 'écriture refusée');
      warned.delete(id);
    } catch (e) {
      console.error('Fichier Alixo non réécrit :', d.alxFile.path, e);
      if (!warned.has(id)) { warned.add(id); toast(`Le fichier ${d.alxFile.name} n’a pas pu être réenregistré (${e && e.message || e}) — vos modifications restent dans Alixo`, { duration: 8000 }); }
    }
  }

  /* « Sauvegarde en ligne » : le document rejoint la bibliothèque (dossier du nom du dossier du fichier) et le nuage */
  async function goOnline(docId) {
    const d = state.docs.find(x => x.id === docId);
    if (!d || !d.alxFile) return false;
    if (d.alxFile.online) { toast(`Sauvegarde en ligne déjà active : « ${d.titre || 'Sans titre'} » est dans votre bibliothèque (dossier « ${(typeof folder === 'function' && folder(d.folderId) || {}).nom || 'Mes cours'} »)`); return true; }
    if (typeof AlixoApp.storageAllows === 'function' && !await AlixoApp.storageAllows(JSON.stringify(d).length)) return false;   // espace de stockage épuisé : message déjà affiché
    const nom = d.alxFile.dirName || dirName(d.alxFile.dir);
    const fo = AlixoApp.folderNamed(nom, { create: true });
    d.folderId = fo.id;
    d.prof = d.prof || AlixoApp.folderProf(fo.id) || '';
    d.alxFile.online = true;
    d.updatedAt = Date.now();
    if (typeof expandedFolders !== 'undefined' && expandedFolders) expandedFolders.add(fo.id);
    save();
    AlixoApp.syncCloudSaveBtn(); AlixoApp.renderCrumbs(); AlixoApp.refreshLibrary();
    toast(`« ${d.titre || 'Sans titre'} » ajouté à votre bibliothèque dans « ${fo.nom} » — synchronisé sur vos appareils ; le fichier ${d.alxFile.name} reste à jour`, { duration: 7000 });
    return true;
  }

  if (window.alixoDesktop && alixoDesktop.onOpenFile) {
    alixoDesktop.onOpenFile(f => { openFromDisk(f); });
  }

  /* 1.53.0 : archive reçue d'un inconnu → archive reconstruite (séance assainie, images sûres seulement) — « Enregistrer le fichier Alixo »
     du Workspace ne livre jamais l'archive brute */
  async function sanitizeArchive(buf, name) {
    const { meta, kind, images } = await read(buf, name);
    if (!SANITIZED_KINDS.includes(kind)) throw new Error(`${KINDS[kind].label} : ce type de document ne peut pas encore être assaini (séances seulement)`);
    const raw = sanitizeDoc(JSON.parse(JSON.stringify(meta.doc)));
    const wanted = new Set(imageIds(raw));
    const safe = new Map();
    for (const [iid, data] of images) if (wanted.has(iid) && safeImage(iid, data)) safe.set(iid, data);
    dropOrphanImages(raw, iid => safe.has(iid));
    raw.titre = raw.titre || S(meta.title) || 'Sans titre';
    return build(raw, safe);
  }
  return { KINDS, MIME, isAlx, kindOf, kindOfDoc, extFor, fileName, build, exportDoc, saveBuffer, importFiles, read, openFromDisk, onLocalSave, goOnline, dirName, SANITIZED_KINDS, sanitizeDoc, sanitizeArchive };
})();
