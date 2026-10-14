/* ============================================================
   Bibliothèque des blocs (1.33) — volet du plan › « Insérer un bloc »
   Une grande fenêtre : recherche, blocs rangés par section (mêmes blocs et mêmes règles que le menu « / » :
   spécialités du profil, niveaux du plan, blocs les plus utilisés en tête) et, à droite, un APERÇU ANIMÉ du
   bloc survolé ou sélectionné, rejoué en boucle. Le menu « / » tapé dans le texte reste le menu compact.
   Chargé APRÈS app.js (SLASH_ITEMS, applySlash, CALLOUTS, AlixoMed, AlixoIcons).
   ============================================================ */
'use strict';

window.AlixoBlockPicker = (() => {
  let ov = null, ctxBlock = null, query = '', sel = 0, flat = [], replay = 0, hoverTm = 0;

  const ico = it => it.icon ? AlixoIcons.svg(it.icon) : esc(it.ico || '');
  /* même filtre que le menu « / » (hors blocs imbriqués : on insère un nouveau paragraphe) */
  function items() {
    const q = norm(query);
    for (const it of SLASH_ITEMS) if (it.plan) { it.name = `${planName(it.plan)} (niveau ${planSample(it.plan)})`; it.ico = planSample(it.plan); }
    const list = SLASH_ITEMS.filter(it => {
      if (it.nest) return false;
      if (it.plan && it.plan > planDepth()) return false;
      if (it.spec === 'sym' && !q) return false;
      return it.sect ? slashSpecOk(it, q) : (slashSpecOk(it, q) && (!q || norm(it.name + ' ' + (it.sub || '') + ' ' + (it.kw || '')).includes(q)));
    });
    /* le nom d'abord (« tableau » → Tableau avant Triade), puis l'usage */
    const rank = it => { const n = norm(it.name); return n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2; };
    if (q) return list.filter(it => !it.sect).map((it, i) => ({ it, i, r: rank(it), u: slashUse(it.id) })).sort((a, b) => a.r - b.r || b.u - a.u || a.i - b.i).map(x => x.it);
    const out = [];
    for (let i = 0; i < list.length; i++) { if (list[i].sect) { if (list[i + 1] && !list[i + 1].sect) out.push(list[i]); } else out.push(list[i]); }
    const top = list.filter(it => !it.sect && slashUse(it.id) > 0).sort((a, b) => slashUse(b.id) - slashUse(a.id)).slice(0, 4);
    return top.length ? [{ sect: 'Les plus utilisés' }].concat(top.map(t => Object.assign({ dup: true }, t)), out) : out;
  }

  /* ---------------- aperçus animés ---------------- */
  const L = (w, d = 0, cls = '') => `<i class="bp-l ${cls}" style="--w:${w}%;--d:${d}s"></i>`;
  const ctxTop = () => L(62, 0, 'ctx') + L(88, 0, 'ctx') + L(74, 0, 'ctx');
  function preview(it) {
    const id = it.id || '';
    const acc = it.color || '';
    if (it.plan) { const sizes = [22, 18, 15, 13.5, 12.5, 12]; return ctxTop() + `<div class="bp-h" style="--fs:${sizes[it.plan - 1]}px"><span class="bp-type" style="--n:${(planSample(it.plan) + ' ' + planName(it.plan)).length}">${esc(planSample(it.plan))} ${esc(planName(it.plan))}</span></div>` + L(90, 1.4) + L(70, 1.6); }
    if (id === 'li' || id === 'ol' || id === 'cl') {
      const mk = k => id === 'li' ? '<b class="bp-dot"></b>' : id === 'ol' ? `<b class="bp-num">${k + 1}.</b>` : `<b class="bp-box ${k < 2 ? 'ck' : ''}" style="--d:${1 + k * .5}s"></b>`;
      return ctxTop() + `<div class="bp-ul">${[70, 54, 80, 46].map((w, k) => `<div class="bp-li" style="--d:${.3 + k * .35}s">${mk(k)}${L(w, .3 + k * .35)}</div>`).join('')}</div>`;
    }
    if (id === 'quote') return ctxTop() + `<div class="bp-quote"><span class="bp-qm">“</span>${L(92, .3)}${L(80, .6)}${L(50, .9)}<small style="--d:1.3s">— Auteur, source</small></div>`;
    if (id.startsWith('c-')) {
      const c = CALLOUTS[id.slice(2)] || {};
      return ctxTop() + `<div class="bp-callout"><div class="bp-ch">${c.ico ? AlixoIcons.svg(c.ico) : ''}<b>${esc(c.name || it.name)}</b></div>${L(90, .5)}${L(76, .8)}${id === 'c-bilan' || id === 'c-objectifs' ? L(60, 1.1, 'dash') + L(52, 1.3, 'dash') : L(48, 1.1)}</div>`;
    }
    if (id === 'juris' || id.startsWith('f-')) {
      const f = id === 'juris' ? { name: 'Fiche d’arrêt', color: '#33658a', head: 'Cass. civ. 1re, 12 mars 2025', fields: [['', 'Faits'], ['', 'Problème de droit'], ['', 'Solution'], ['', 'Portée']] } : (AlixoMed.FICHES[id.slice(2)] || { name: it.name, fields: [] });
      return `<div class="bp-fiche" style="--fc:${esc(f.color || acc || 'var(--tint)')}"><div class="bp-fh">${it.icon ? AlixoIcons.svg(it.icon) : ''}<b>${esc(f.name)}</b><span>${esc(f.head || '')}</span></div>${(f.fields || []).slice(0, 5).map((x, k) => `<div class="bp-ff" style="--d:${.3 + k * .3}s"><em>${esc(x[1])}</em>${L(40 + (k * 17) % 45, .45 + k * .3)}</div>`).join('')}</div>`;
    }
    if (id === 'chart') return `<div class="bp-chart">${[45, 70, 35, 88, 60, 75].map((h, k) => `<b style="--h:${h}%;--d:${.2 + k * .15}s"></b>`).join('')}</div><div class="bp-axis"></div>` + L(60, 1.4);
    if (id === 'formula' || id === 'formlib') return ctxTop() + `<div class="bp-formula"><span class="bp-type" style="--n:21">Y = C + I + G + (X − M)</span></div><div class="bp-frac"><span>∂Q</span><i></i><span>∂L</span></div>`;
    if (id === 'graphmenu' || id === 'g-plot') return `<svg class="bp-graph" viewBox="0 0 200 120"><path class="ax" d="M20 10v95h170"/><path class="c1" d="M30 20 C 80 40, 120 80, 180 98"/><path class="c2" d="M30 98 C 80 80, 120 40, 180 20"/><circle cx="105" cy="59" r="4"/></svg>` + L(50, 1.6);
    if (id === 'table' || id === 'triade' || id === 'ddx') { const cols = id === 'triade' ? 3 : 3, rows = id === 'triade' ? 2 : 4; let h = ''; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) h += `<i class="${r === 0 ? 'th' : ''}" style="--d:${.15 + (r * cols + c) * .09}s"><b></b></i>`; return ctxTop() + `<div class="bp-table" style="--cols:${cols}">${h}</div>`; }
    if (id === 'image') return ctxTop() + `<div class="bp-img"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg></div><small class="bp-cap">Figure 1 — légende</small>`;
    if (id === 'draw') return `<svg class="bp-draw" viewBox="0 0 200 120"><rect x="18" y="20" width="60" height="38" rx="6"/><circle cx="150" cy="40" r="22"/><path d="M80 40h44" class="ar"/><path d="m118 34 8 6-8 6" class="ar"/><path d="M30 95 C 60 70, 90 110, 120 88 S 170 80, 185 100" class="free"/></svg>`;
    if (id === 'link') return ctxTop() + `<div class="bp-link"><span>${AlixoIcons.svg('link')} legifrance.gouv.fr</span></div>` + L(70, 1);
    if (id === 'timer') return `<div class="bp-timer"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="tr"/><circle cx="50" cy="50" r="42" class="pr"/></svg><b>05:00</b></div>`;
    if (id === 'tree') return `<svg class="bp-tree" viewBox="0 0 200 120"><rect x="75" y="8" width="50" height="20" rx="5"/><path d="M100 28v14M45 42h110M45 42v12M100 42v12M155 42v12"/><rect x="20" y="54" width="50" height="18" rx="5"/><rect x="75" y="54" width="50" height="18" rx="5"/><rect x="130" y="54" width="50" height="18" rx="5"/><path d="M45 72v14M30 86h30M30 86v8M60 86v8"/><rect x="14" y="94" width="32" height="14" rx="4"/><rect x="46" y="94" width="32" height="14" rx="4"/></svg>`;
    if (id === 'cards') return ctxTop() + `<div class="bp-cards">${[0, 1, 2].map(k => `<div style="--d:${.2 + k * .25}s"><b></b>${L(80, .5 + k * .25)}${L(60, .6 + k * .25)}</div>`).join('')}</div>`;
    if (id === 'hr') return ctxTop() + `<div class="bp-hr"></div>` + L(80, 1) + L(60, 1.1);
    if (id === 'pb') return `<div class="bp-pb"><div>${L(80)}${L(60)}</div><span>nouvelle page</span><div>${L(70, .8)}${L(50, .9)}</div></div>`;
    if (id === 'score' || id === 'mcalc') return `<div class="bp-score"><div class="bp-sh"><b>${id === 'score' ? 'Glasgow' : 'IMC'}</b></div>${[0, 1, 2].map(k => `<div class="bp-sr" style="--d:${.2 + k * .3}s"><em></em><span class="bp-pill ${k === 1 ? 'on' : ''}"></span></div>`).join('')}<div class="bp-res" style="--d:1.3s">= <b>${id === 'score' ? '13 / 15' : '22,4'}</b></div></div>`;
    if (it.inline) return `<div class="bp-inline">${L(30, 0, 'ctx inl')}<span class="bp-chip" style="--d:.4s">${id === 'refart' ? 'art. 1240 C. civ.' : id === 'item' ? 'Item 221' : id === 'rangA' ? 'Rang A' : id === 'rangB' ? 'Rang B' : esc(it.sym || it.name)}</span>${L(36, 0, 'ctx inl')}</div>` + L(84, 0, 'ctx') + L(66, 0, 'ctx');
    return ctxTop() + `<div class="bp-gen">${ico(it)}</div>`;
  }

  /* ---------------- fenêtre ---------------- */
  function render() {
    const list = items();
    flat = list.filter(it => !it.sect);
    if (sel >= flat.length) sel = Math.max(0, flat.length - 1);
    let fi = -1;
    ov.querySelector('.bp-list').innerHTML = list.map(it => {
      if (it.sect) return `<div class="bp-sect">${esc(it.sect)}</div>`;
      fi++;
      return `<button type="button" class="bp-item ${fi === sel ? 'sel' : ''}" data-i="${fi}"><span class="bp-ico">${ico(it)}</span><span class="bp-nm"><b>${esc(it.name)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`;
    }).join('') || '<div class="bp-empty">Aucun bloc ne correspond. Essayez « tableau », « encadré », « formule »…</div>';
    ov.querySelector('.bp-count').textContent = `${flat.length} bloc${flat.length > 1 ? 's' : ''}`;
    showPreview();
  }
  function showPreview() {
    const it = flat[sel];
    const pv = ov.querySelector('.bp-pv');
    if (!it) { pv.innerHTML = ''; return; }
    pv.innerHTML = `<div class="bp-stage"><div class="bp-page">${preview(it)}</div></div>
      <div class="bp-info"><span class="bp-ico big">${ico(it)}</span><div><b>${esc(it.name)}</b><p>${esc(it.sub || (it.inline ? 'S’insère au milieu d’une phrase, à l’endroit du curseur.' : 'Un nouveau bloc, inséré sous le paragraphe courant.'))}</p></div></div>
      <button type="button" class="cta bp-go">Insérer « ${esc(it.name.length > 28 ? it.name.slice(0, 27) + '…' : it.name)} »</button>`;
    pv.querySelector('.bp-go').addEventListener('click', () => pick(sel));
    clearInterval(replay);
    replay = setInterval(() => { const pg = ov && ov.querySelector('.bp-page'); if (!pg) return; const h = pg.innerHTML; pg.innerHTML = ''; void pg.offsetWidth; pg.innerHTML = h; }, 4200);
  }
  function move(k) {
    sel = Math.max(0, Math.min(flat.length - 1, sel + k));
    ov.querySelectorAll('.bp-item').forEach(b => b.classList.toggle('sel', +b.dataset.i === sel));
    const cur = ov.querySelector('.bp-item.sel'); if (cur) cur.scrollIntoView({ block: 'nearest' });
    showPreview();
  }
  function pick(i) {
    const it = flat[i]; const bid = ctxBlock;
    close(false);
    if (!it || !bid || !getBlock(bid)) return;
    focusBlock(bid, 'start');
    slashCtx = { blockId: bid, query: '', sel: 0, inline: null, nest: null };
    applySlash(it.id);
  }
  function close(refocus = true) {
    clearInterval(replay); clearTimeout(hoverTm);
    if (!ov) return;
    ov.remove(); ov = null;
    document.body.classList.remove('has-dlg');
    if (refocus && ctxBlock && getBlock(ctxBlock)) focusBlock(ctxBlock, 'start');
  }
  /* blockId : le paragraphe vide qui recevra le bloc (préparé par le bouton du volet) */
  function open(blockId) {
    close(false);
    ctxBlock = blockId; query = ''; sel = 0;
    ov = document.createElement('div');
    ov.id = 'bkpick'; ov.className = 'dlgov';
    ov.innerHTML = `<div class="bp-card" role="dialog" aria-label="Insérer un bloc">
      <header class="bp-head"><div class="bp-title"><b>Insérer un bloc</b><span class="bp-count"></span></div>
        <label class="bp-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg><input type="search" placeholder="Rechercher un bloc : tableau, encadré, formule, fiche…" autocomplete="off" spellcheck="false"></label>
        <button class="set-x" type="button" title="Fermer (Échap)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
      <div class="bp-body"><div class="bp-list" role="listbox"></div><div class="bp-pv"></div></div>
      <footer class="bp-foot">↑ ↓ pour parcourir · Entrée pour insérer · Échap pour fermer · Dans le texte, « / » ouvre le menu rapide</footer></div>`;
    document.body.appendChild(ov);
    document.body.classList.add('has-dlg');
    const input = ov.querySelector('input');
    input.addEventListener('input', () => { query = input.value; sel = 0; render(); ov.querySelector('.bp-list').scrollTop = 0; });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }, true);
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('.set-x')) { close(); return; }
      const b = e.target.closest('.bp-item'); if (b) pick(+b.dataset.i);
    });
    ov.querySelector('.bp-list').addEventListener('mouseover', e => {
      const b = e.target.closest('.bp-item'); if (!b || +b.dataset.i === sel) return;
      clearTimeout(hoverTm); hoverTm = setTimeout(() => { if (!ov) return; sel = +b.dataset.i; ov.querySelectorAll('.bp-item').forEach(x => x.classList.toggle('sel', x === b)); showPreview(); }, 90);
    });
    render();
    setTimeout(() => input.focus(), 0);
  }
  return { open, close, isOpen: () => !!ov, preview };
})();
