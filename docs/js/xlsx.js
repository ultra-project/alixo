/* ============================================================
   Alixo — écriture de classeurs Excel (.xlsx, OOXML) mise en forme, sans dépendance autre que JSZip
   Utilisé par l'export des résultats de quiz (js/quiz.js), réutilisable ailleurs.

   AlixoXlsx.build({
     title, subtitle,                      // propriétés du classeur (docProps)
     logo: Uint8Array | null,              // PNG affiché en A1 de chaque feuille (AlixoXlsx.loadLogo())
     sheets: [{
       name,                               // nom d'onglet (nettoyé : ≤ 31 caractères, sans []:*?/\)
       title, subtitle, note,              // lignes 1 à 3 au-dessus du tableau
       columns: [{ label, width, type: 'text'|'int'|'pct'|'sec'|'num', wrap, align: 'left'|'center'|'right' }],
       rows: [[valeur | { v, s: 'ok'|'ko'|'bold'|'gold'|'silver'|'bronze' }, …]],
       rowStyles: ['sub' | 'ok' | 'ko' | null, …],   // 'sub' : sous-ligne indentée grise (ne change pas la bande)
       dataBar: indexDeColonne             // barre de données (mise en forme conditionnelle)
     }]
   }) → Promise<Uint8Array>

   Les textes sont écrits en chaînes en ligne (inlineStr) : jamais interprétés comme des formules.
   'pct' attend une fraction (0,75 → 75 %), 'sec' des secondes (affichées « 12,3 s »).
   ============================================================ */
(() => {
  'use strict';
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  const C = { tint: 'FF33658A', ink: 'FF202124', ink2: 'FF5F6368', alt: 'FFF6F7F9', line: 'FFDADCE0', white: 'FFFFFFFF',
    okBg: 'FFE6F4EA', okInk: 'FF137333', koBg: 'FFFCE8E6', koInk: 'FFC5221F', bar: 'FF6A9BC3',
    gold: 'FFF5C242', silver: 'FFCFD4DC', bronze: 'FFD08A4B', podInk: 'FF1B1B1B' };
  const HEADER_ROW = 5;          // ligne d'en-tête du tableau (1-3 : logo, titre, sous-titre ; 4 : respiration)
  const MAX_TEXT = 32767;        // limite d'Excel par cellule

  /* ---------- XML sûr : échappement et caractères interdits en XML 1.0 ---------- */
  const BAD_XML = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;
  const clean = s => String(s ?? '').replace(BAD_XML, '');
  const x = s => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const ref = (c, r) => colName(c) + r;

  /* nom d'onglet valide et unique */
  function sheetName(n, used) {
    let s = clean(n).replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '');
    if (!s || /^history$/i.test(s)) s = 'Feuille';
    s = s.slice(0, 31).trim();
    let out = s, k = 2;
    while (used.has(out.toLowerCase())) { const suf = ` (${k++})`; out = s.slice(0, 31 - suf.length).trim() + suf; }
    used.add(out.toLowerCase());
    return out;
  }

  /* ---------- feuille de styles : registre dédoublonné de formats de cellule ---------- */
  function Styles() {
    const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    const numFmts = [], xfs = [];
    const idx = (arr, v) => { let i = arr.indexOf(v); if (i < 0) { arr.push(v); i = arr.length - 1; } return i; };
    const font = ({ b, i, sz = 11, color = C.ink }) => idx(fonts, `<font>${b ? '<b/>' : ''}${i ? '<i/>' : ''}<sz val="${sz}"/><color rgb="${color}"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`);
    const fill = rgb => rgb ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const border = bottom => bottom ? idx(borders, `<border><left/><right/><top/><bottom style="thin"><color rgb="${bottom}"/></bottom><diagonal/></border>`) : 0;
    const fmt = code => { if (typeof code === 'number') return code; const i = numFmts.indexOf(code); if (i >= 0) return 164 + i; numFmts.push(code); return 164 + numFmts.length - 1; };
    font({});   // police par défaut : Calibri 11
    xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
    /* o : { b, i, sz, color, bg, line, fmt, h: 'left'|'center'|'right', v: 'center'|'top', wrap, indent } */
    function xf(o) {
      const f = font(o), fi = fill(o.bg), bo = border(o.line), nf = fmt(o.fmt ?? 0);
      const al = (o.h || o.v || o.wrap || o.indent) ? `<alignment${o.h ? ` horizontal="${o.h}"` : ''}${o.v ? ` vertical="${o.v}"` : ''}${o.wrap ? ' wrapText="1"' : ''}${o.indent ? ` indent="${o.indent}"` : ''}/>` : '';
      const s = `<xf numFmtId="${nf}" fontId="${f}" fillId="${fi}" borderId="${bo}" xfId="0"${nf ? ' applyNumberFormat="1"' : ''}${f ? ' applyFont="1"' : ''}${fi ? ' applyFill="1"' : ''}${bo ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`;
      return idx(xfs, s);
    }
    function xml() {
      return HEAD + `<styleSheet xmlns="${NS_MAIN}">`
        + (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${x(c)}"/>`).join('')}</numFmts>` : '')
        + `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders>`
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>'
        + '</styleSheet>';
    }
    return { xf, xml };
  }

  const FMT = { text: 0, int: 3, pct: '0\\ %', sec: '0.0" s"', num: 0 };   // « 75 % » (espace avant %), num : Standard (pas de « 3, »)
  const isNum = t => t === 'int' || t === 'pct' || t === 'sec' || t === 'num';

  /* dimensions du logo : ratio réel lu dans l'en-tête PNG (IHDR) */
  function pngSize(bytes) {
    try {
      if (bytes && bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const w = dv.getUint32(16), h = dv.getUint32(20);
        if (w > 0 && h > 0) return { w, h };
      }
    } catch { /* en-tête illisible : carré par défaut */ }
    return { w: 1, h: 1 };
  }

  /* ---------- une feuille ---------- */
  function sheetXML(sh, si, st, hasLogo) {
    const cols = Array.isArray(sh.columns) && sh.columns.length ? sh.columns : [{ label: '', type: 'text' }];
    const rows = Array.isArray(sh.rows) ? sh.rows : [];
    const rs = Array.isArray(sh.rowStyles) ? sh.rowStyles : [];
    const nC = cols.length, lastCol = nC - 1;
    const titleCol = hasLogo && nC > 1 ? 1 : 0;
    const lastRow = HEADER_ROW + rows.length;
    /* + 3 : la flèche du filtre automatique ne recouvre pas l'intitulé de l'en-tête */
    const widths = cols.map((c, i) => { let w = (+c.width || (isNum(c.type) ? 12 : 22)) + 3; if (i === 0 && hasLogo) w = Math.max(w, 8); return Math.max(4, Math.min(120, w)); });

    /* styles de la feuille */
    const sTitle = st.xf({ b: 1, sz: 16, color: C.ink, v: 'center' });
    const sSub = st.xf({ sz: 10, color: C.ink2, v: 'center' });
    const sNote = st.xf({ i: 1, sz: 9, color: C.ink2, v: 'center' });
    const hAlign = c => c.align || (isNum(c.type) ? 'right' : 'left');
    const sHead = cols.map(c => st.xf({ b: 1, color: C.white, bg: C.tint, v: 'center', h: hAlign(c), wrap: 1, indent: hAlign(c) === 'left' ? 1 : 0 }));
    const cellStyle = (c, band, kind, cs) => {
      const num = isNum(c.type);
      const h = hAlign(c);
      const o = { fmt: FMT[c.type] ?? 0, line: C.line, v: 'center', bg: band ? C.alt : null, h, wrap: !num && c.wrap ? 1 : 0, indent: h === 'left' ? 1 : 0 };
      if (kind === 'sub') { o.color = C.ink2; o.sz = 10; if (h === 'left') o.indent = 3; }
      if (kind === 'ok' || cs === 'ok') { o.color = C.okInk; if (cs === 'ok') { o.bg = C.okBg; o.b = 1; } }
      if (kind === 'ko' || cs === 'ko') { o.color = C.koInk; if (cs === 'ko') { o.bg = C.koBg; o.b = 1; } }
      if (cs === 'bold') o.b = 1;
      if (cs === 'gold' || cs === 'silver' || cs === 'bronze') { o.bg = C[cs]; o.color = C.podInk; o.b = 1; o.h = 'center'; o.indent = 0; }   // podium
      return st.xf(o);
    };

    const out = [];
    const cell = (c, r, s, v, type) => {
      const a = ref(c, r);
      if (v == null || v === '') return `<c r="${a}" s="${s}"/>`;
      if (type !== 'text' && typeof v === 'number') return Number.isFinite(v) ? `<c r="${a}" s="${s}"><v>${v}</v></c>` : `<c r="${a}" s="${s}"/>`;
      const t = clean(v).slice(0, MAX_TEXT);
      return `<c r="${a}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${x(t)}</t></is></c>`;
    };
    /* lignes 1 à 3 : titre, sous-titre, note ; 4 : vide */
    const blank = (r, from, s) => { let z = ''; for (let c = from; c <= lastCol; c++) z += `<c r="${ref(c, r)}" s="${s}"/>`; return z; };
    out.push(`<row r="1" spans="1:${nC}" ht="30" customHeight="1">${cell(titleCol, 1, sTitle, sh.title || '', 'text')}${blank(1, titleCol + 1, sTitle)}</row>`);
    out.push(`<row r="2" spans="1:${nC}" ht="18" customHeight="1">${cell(titleCol, 2, sSub, sh.subtitle || '', 'text')}${blank(2, titleCol + 1, sSub)}</row>`);
    if (sh.note) out.push(`<row r="3" spans="1:${nC}" ht="16" customHeight="1">${cell(titleCol, 3, sNote, sh.note, 'text')}${blank(3, titleCol + 1, sNote)}</row>`);
    out.push(`<row r="4" spans="1:${nC}" ht="8" customHeight="1"/>`);
    out.push(`<row r="${HEADER_ROW}" spans="1:${nC}" ht="28" customHeight="1">${cols.map((c, i) => cell(i, HEADER_ROW, sHead[i], c.label || '', 'text')).join('')}</row>`);
    let band = false;
    rows.forEach((row, k) => {
      const r = HEADER_ROW + 1 + k, kind = rs[k] || null;
      if (kind !== 'sub') band = !band;
      let lines = 1, z = '';
      for (let i = 0; i < nC; i++) {
        const c = cols[i]; let v = Array.isArray(row) ? row[i] : null, cs = null;
        if (v && typeof v === 'object') { cs = v.s || null; v = v.v; }
        if (isNum(c.type) && typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v.replace(',', '.'))) v = +v.replace(',', '.');
        if (c.wrap && typeof v === 'string') lines = Math.max(lines, Math.min(8, Math.ceil(v.length / Math.max(8, widths[i] * 1.05))));
        z += cell(i, r, cellStyle(c, !band, kind, cs), v, isNum(c.type) ? 'num' : 'text');
      }
      out.push(`<row r="${r}" spans="1:${nC}" ht="${lines > 1 ? 15 * lines + 6 : 20}" customHeight="1">${z}</row>`);
    });

    const dim = `A1:${ref(lastCol, Math.max(lastRow, HEADER_ROW))}`;
    const merges = lastCol > titleCol ? [1, 2].concat(sh.note ? [3] : []).map(r => `<mergeCell ref="${ref(titleCol, r)}:${ref(lastCol, r)}"/>`) : [];
    const bar = Number.isInteger(sh.dataBar) && sh.dataBar >= 0 && sh.dataBar < nC && rows.length ? sh.dataBar : -1;
    const barPct = bar >= 0 && cols[bar].type === 'pct';
    const cf = bar >= 0 ? `<conditionalFormatting sqref="${ref(bar, HEADER_ROW + 1)}:${ref(bar, lastRow)}"><cfRule type="dataBar" priority="1"><dataBar>${barPct ? '<cfvo type="num" val="0"/><cfvo type="num" val="1"/>' : '<cfvo type="num" val="0"/><cfvo type="max"/>'}<color rgb="${C.bar}"/></dataBar></cfRule></conditionalFormatting>` : '';
    const xml = HEAD + `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">`
      + `<sheetPr><tabColor rgb="${C.tint}"/><pageSetUpPr fitToPage="1"/></sheetPr>`
      + `<dimension ref="${dim}"/>`
      + `<sheetViews><sheetView showGridLines="0"${si === 0 ? ' tabSelected="1"' : ''} workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${HEADER_ROW + 1}" sqref="A${HEADER_ROW + 1}"/></sheetView></sheetViews>`
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      + `<sheetData>${out.join('')}</sheetData>`
      + `<autoFilter ref="A${HEADER_ROW}:${ref(lastCol, Math.max(lastRow, HEADER_ROW))}"/>`
      + (merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : '')
      + cf
      + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
      + `<pageSetup paperSize="9" orientation="${nC > 5 ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>`   // impression : toute la largeur sur une page
      + (hasLogo ? '<drawing r:id="rId1"/>' : '')
      + '</worksheet>';
    return { xml, filter: `$A$${HEADER_ROW}:$${colName(lastCol)}$${Math.max(lastRow, HEADER_ROW)}` };
  }

  function drawingXML(size) {
    const H = 381000;   // ≈ 40 px (9 525 EMU par pixel)
    const W = Math.round(H * size.w / size.h);
    const off = 6 * 9525;
    return HEAD + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
      + `<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${off}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${off}</xdr:rowOff></xdr:from><xdr:ext cx="${W}" cy="${H}"/>`
      + `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo Alixo" descr="Alixo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>`
      + `<xdr:blipFill><a:blip xmlns:r="${NS_R}" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`
      + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`
      + '</xdr:wsDr>';
  }

  async function build(opts) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip indisponible');
    const o = opts || {};
    const sheets = (Array.isArray(o.sheets) && o.sheets.length ? o.sheets : [{ name: 'Feuille', columns: [], rows: [] }]);
    const logo = o.logo && o.logo.length ? (o.logo instanceof Uint8Array ? o.logo : new Uint8Array(o.logo)) : null;
    const isPng = !!(logo && logo[0] === 0x89 && logo[1] === 0x50 && logo[2] === 0x4E && logo[3] === 0x47);
    const hasLogo = isPng;
    const zip = new JSZip();
    const st = Styles();
    const used = new Set();
    const names = sheets.map(s => sheetName(s.name, used));
    const built = sheets.map((s, i) => sheetXML(s, i, st, hasLogo));
    const n = sheets.length;

    zip.file('[Content_Types].xml', HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + (hasLogo ? '<Default Extension="png" ContentType="image/png"/>' : '')
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + built.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + (hasLogo ? built.map((_, i) => `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('') : '')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '</Types>');
    zip.file('_rels/.rels', HEAD + `<Relationships xmlns="${NS_PKG_REL}">`
      + `<Relationship Id="rId1" Type="${REL}officeDocument" Target="xl/workbook.xml"/>`
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + `<Relationship Id="rId3" Type="${REL}extended-properties" Target="docProps/app.xml"/>`
      + '</Relationships>');
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('docProps/core.xml', HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${x(o.title || '')}</dc:title>${o.subtitle ? `<dc:description>${x(o.subtitle)}</dc:description>` : ''}<dc:creator>Alixo</dc:creator>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    zip.file('docProps/app.xml', HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Alixo</Application></Properties>');
    zip.file('xl/workbook.xml', HEAD + `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}">`
      + '<bookViews><workbookView activeTab="0"/></bookViews>'
      + `<sheets>${names.map((nm, i) => `<sheet name="${x(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + `<definedNames>${names.map((nm, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${x(`'${nm.replace(/'/g, "''")}'!${built[i].filter}`)}</definedName>`).join('')}</definedNames>`
      + '</workbook>');
    zip.file('xl/_rels/workbook.xml.rels', HEAD + `<Relationships xmlns="${NS_PKG_REL}">`
      + built.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${n + 1}" Type="${REL}styles" Target="styles.xml"/>`
      + '</Relationships>');
    built.forEach((b, i) => {
      zip.file(`xl/worksheets/sheet${i + 1}.xml`, b.xml);
      if (hasLogo) {
        zip.file(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, HEAD + `<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${REL}drawing" Target="../drawings/drawing${i + 1}.xml"/></Relationships>`);
        zip.file(`xl/drawings/drawing${i + 1}.xml`, drawingXML(pngSize(logo)));
        zip.file(`xl/drawings/_rels/drawing${i + 1}.xml.rels`, HEAD + `<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${REL}image" Target="../media/image1.png"/></Relationships>`);
      }
    });
    if (hasLogo) zip.file('xl/media/image1.png', logo);
    zip.file('xl/styles.xml', st.xml());   // en dernier : les feuilles ont rempli le registre des styles
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: MIME });
  }

  /* logo d'Alixo en PNG : fetch (web, Electron : même origine), sinon via un canvas, sinon rien */
  let logoCache = null;
  async function loadLogo(url) {
    url = url || 'logo.png';
    if (logoCache && logoCache.url === url) return logoCache.bytes;
    let bytes = null;
    try { const r = await fetch(url); if (r.ok) bytes = new Uint8Array(await r.arrayBuffer()); } catch { /* repli canvas */ }
    if (!bytes || bytes[0] !== 0x89) {
      bytes = null;
      try {
        bytes = await new Promise(res => {
          const img = new Image();
          img.onload = () => {
            try {
              const cv = document.createElement('canvas'); cv.width = Math.min(256, img.naturalWidth || 256); cv.height = Math.round(cv.width * (img.naturalHeight || 1) / (img.naturalWidth || 1));
              cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
              cv.toBlob(b => { if (!b) return res(null); b.arrayBuffer().then(a => res(new Uint8Array(a)), () => res(null)); }, 'image/png');
            } catch { res(null); }   // canvas « contaminé » : sans logo
          };
          img.onerror = () => res(null);
          img.src = url;
        });
      } catch { bytes = null; }
    }
    logoCache = { url, bytes };
    return bytes;
  }

  window.AlixoXlsx = { build, loadLogo, MIME, _sheetName: n => sheetName(n, new Set()), _esc: x };
})();
