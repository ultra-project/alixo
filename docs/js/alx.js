/* ============================================================
   Alixo — fichiers .alx (1.35) : exporter un document d'Alixo dans un fichier qui se rouvre avec Alixo
   Un fichier .alx est une archive ZIP (JSZip, js/vendor/jszip.min.js) :
     mimetype       « application/x-alixo » (en premier, non compressé)
     alixo.json     { format: 'alx', version: 1, app, kind, exportedAt, title, doc, images }
                    doc    : le document tel qu'il est dans la bibliothèque (state.docs), sans rien retirer
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
  /* l'archive d'un document → ArrayBuffer */
  async function build(d) {
    if (!d) throw new Error('document introuvable');
    if (typeof JSZip === 'undefined') throw new Error('archive indisponible (JSZip)');
    const zip = new JSZip();
    zip.file('mimetype', MIME, { compression: 'STORE' });
    const images = {};
    for (const iid of imageIds(d)) {
      let v = null;
      try { v = await AlixoImages.get(iid); } catch { v = null; }
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
    zip.file('alixo.json', JSON.stringify(meta));
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
    const name = fileName(d);
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
    const blocks = bl => (bl || []).forEach(b => { if (!b) return; b.id = uid(); if (b.type === 'img') b.iid = remapImg(b.iid); });
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
  /* importe des fichiers (File, Blob ou { name, data }) dans le dossier `folderId` ; renvoie les documents créés et ouvre le dernier */
  async function importFiles(list, folderId, { open = true, quiet = false } = {}) {
    const arr = [...(list || [])].filter(Boolean);
    const made = []; const errors = [];
    for (const f of arr) {
      const name = S(f.name) || 'document.alx-docs';
      try {
        const buf = f.data ? f.data : (typeof f.arrayBuffer === 'function' ? await f.arrayBuffer() : f);
        const { meta, kind, images } = await read(buf, name);
        const imap = new Map();
        for (const [iid, data] of images) { const nid = uid(); imap.set(iid, nid); try { await AlixoImages.put(nid, data); } catch (e) { console.error('Image non importée :', e); } }
        const copy = freshIds(JSON.parse(JSON.stringify(meta.doc)), imap);
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

  /* ---------------- version PC : fichier ouvert par double-clic (association d'extension) ---------------- */
  if (window.alixoDesktop && alixoDesktop.onOpenFile) {
    alixoDesktop.onOpenFile(f => {
      if (!f || !f.name || !isAlx(f.name)) return;
      const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      importFiles([{ name: f.name, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) }], typeof currentFolderId !== 'undefined' ? currentFolderId : null);
    });
  }

  return { KINDS, MIME, isAlx, kindOf, kindOfDoc, extFor, fileName, build, exportDoc, importFiles, read };
})();
