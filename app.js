// Presenter (Lucian Office, Phase 4): decks built from a length of time, references, a
// speaker, an intro and a layout, fed by text, Writer documents and Counter workbooks.
import { api } from '/shared/api.js';
import { apply, characterHandler, deserialise, redo, serialise, toProlog, undo } from './lib/core.js';
import { LAYOUTS, contentFromText, contentFromWriter, figuresFromRows, pickFigures } from './lib/deck.js';
import { buildOps, newDeckDoc, referencesOf, retimeOps, settingOps, settingsBlock, settingsOf, slidesOf, sourcesOf, timePlan } from './lib/deckdoc.js';
import { SLIDE_CSS, deckHTML, outlineMarkdown, slideHTML } from './lib/export.js';
import { presenterCommands } from './lib/commands.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
document.head.append(el('style', { textContent: SLIDE_CSS }));

let doc = newDeckDoc();
let current = 0;
let lastPlan = null;
let settings = { savePath: '' };

const persist = () => { api.state.set('presenter', settings).catch(() => {}); api.state.set('presenter-doc', doc).catch(() => {}); };
function change(ops, by = 'user', label = '') {
  if (!ops.length) return;
  doc = apply(doc, ops, { by, label });
  persist();
  render();
}
const textSource = () => sourcesOf(doc).find((s) => s.kind === 'text');

// ------------------------------------------------------------------ gathering sources
async function gather(d = doc) {
  const content = [], figures = [], graphs = [];
  for (const src of sourcesOf(d)) {
    try {
      if (src.kind === 'text') content.push(...contentFromText(src.text));
      if (src.kind === 'writer') content.push(...contentFromWriter(deserialise((await api.files.read(src.path)).content)));
      if (src.kind === 'counter') {
        const wb = deserialise((await api.files.read(src.path)).content);
        const sheetLib = await import('../counter/lib/sheet.js');
        const { display } = await import('../counter/lib/formula.js');
        for (const sh of wb.blocks.filter((b) => b.type === 'sheet')) {
          const c = sheetLib.compute(sh);
          const { rows } = sheetLib.size(sh);
          const fm = sheetLib.formats(sh);
          const raw = sheetLib.cells(sh);
          const list = [];
          for (let r = 0; r < rows; r++) list.push([c.value(`A${r + 1}`), sheetLib.formatValue(c.value(`B${r + 1}`), fm[`B${r + 1}`]), raw[`B${r + 1}`]]);
          figures.push(...figuresFromRows(list, sh.name));
          if (sh.graph?.variables?.length) {
            const g = sheetLib.segmentRows(sh, sh.graph);
            graphs.push({ title: `${g.labels.join(' and ')} by ${g.segmentLabel}`, labels: g.labels, rows: g.rows.map((x) => ({ segment: x.segment, values: x.values.map((v) => Number(display(v))) })) });
          }
        }
      }
    } catch (err) {
      $('reply').textContent = `Couldn't read ${src.path ?? 'a source'}: ${err.message}`;
    }
  }
  return { content, figures: pickFigures(figures), graphs };
}
async function sourceText(d = doc) {
  const { content, figures } = await gather(d);
  return [...content.flatMap((s) => s.paragraphs), ...figures.map((f) => `${f.label} is ${f.value}.`)].join(' ');
}

async function build() {
  syncSettings();
  const { ops, deck } = buildOps(doc, await gather());
  lastPlan = deck.plan;
  change(ops, 'user', `built ${deck.slides.length} slides`);
  current = 0;
  render();
}

// ------------------------------------------------------------------ rendering
function renderSettings() {
  const s = settingsOf(doc);
  for (const [id, v] of [['title', s.title], ['subtitle', s.subtitle], ['minutes', s.minutes], ['pace', s.pace], ['spName', s.speaker.name], ['spId', s.speaker.id], ['spRole', s.speaker.role]]) if (document.activeElement !== $(id)) $(id).value = v ?? '';
  $('layout').value = s.layout;
  if (document.activeElement !== $('text')) $('text').value = textSource()?.text ?? '';
  $('refs').replaceChildren(...referencesOf(doc).map((r, i) => el('div', { className: 'refrow' },
    el('span', {}, `[${i + 1}] ${r.text}${r.for ? ` (on slides about ${r.for})` : ''}`),
    el('button', { className: 'small', textContent: '✕', title: 'Remove', onclick: () => change([{ op: 'delete', id: r.id }], 'user', 'removed a reference') }))));
  $('sources').replaceChildren(...sourcesOf(doc).filter((x) => x.kind !== 'text').map((x) => el('div', { className: 'srcrow' },
    el('span', {}, `${x.kind === 'writer' ? '📝' : '🧮'} ${x.path}`),
    el('button', { className: 'small', textContent: '✕', title: 'Remove', onclick: () => change([{ op: 'delete', id: x.id }], 'user', 'removed a source') }))));
  const tp = timePlan(doc);
  $('plan').replaceChildren(
    tp.count ? el('p', { className: tp.fits ? 'fits' : 'over' }, `${tp.count} slides for ${tp.minutes} minutes (${tp.target} at this pace)${tp.fits ? ' ✓' : ': more than the time allows'}. ${referencesOf(doc).length} reference${referencesOf(doc).length === 1 ? '' : 's'}, all on the references slide.`) : el('p', { className: 'quiet' }, 'Press "Build the deck" to make the slides.'),
    ...(lastPlan?.notes ?? []).map((n) => el('p', { className: 'quiet' }, n)));
  $('docTitle').textContent = s.title;
}

function render() {
  renderSettings();
  const s = settingsOf(doc);
  const slides = slidesOf(doc);
  current = Math.max(0, Math.min(current, slides.length - 1));
  const sl = slides[current];
  $('preview').innerHTML = sl ? slideHTML(sl, { layout: s.layout, speaker: s.speaker, total: slides.length }) : '<div class="slide"><h2>No slides yet</h2><ul><li>Set the time, speaker and references, add what the talk is about, then press Build the deck.</li></ul></div>';
  for (const [id, v] of [['sTitle', sl?.title ?? ''], ['sBullets', (sl?.bullets ?? []).join('\n')], ['sNotes', sl?.notes ?? '']]) if (document.activeElement !== $(id)) $(id).value = v;
  $('where').textContent = slides.length ? `Slide ${current + 1} of ${slides.length}${sl.minutes ? ` · ${sl.minutes} min` : ''}` : '';
  $('strip').replaceChildren(...slides.map((x, i) => {
    const d = el('div', { className: `thumb${i === current ? ' on' : ''}`, title: x.title, onclick: () => { current = i; render(); } });
    d.innerHTML = `<span class="t">${i + 1}</span>${slideHTML(x, { layout: s.layout, speaker: s.speaker })}`;
    return d;
  }));
}

function syncSettings() {
  const s = settingsOf(doc);
  const patch = {};
  const val = (id) => $(id).value.trim();
  if (val('title') !== s.title) patch.title = val('title') || 'Untitled talk';
  if (val('subtitle') !== s.subtitle) patch.subtitle = val('subtitle');
  if (Number(val('minutes')) !== s.minutes && Number(val('minutes')) > 0) patch.minutes = Number(val('minutes'));
  if (Number(val('pace')) !== s.pace && Number(val('pace')) > 0) patch.pace = Number(val('pace'));
  if ($('layout').value !== s.layout) patch.layout = $('layout').value;
  const sp = { name: val('spName'), role: val('spRole'), id: val('spId') };
  if (JSON.stringify(sp) !== JSON.stringify({ name: s.speaker.name ?? '', role: s.speaker.role ?? '', id: s.speaker.id ?? '' })) patch.speaker = sp;
  const ops = settingOps(doc, patch);
  if (patch.title) ops.push({ op: 'title', value: patch.title });
  if ($('text').value !== (textSource()?.text ?? '')) ops.push({ op: 'set', id: textSource().id, key: 'text', value: $('text').value });
  if (ops.length) { doc = apply(doc, ops, { by: 'user', label: 'changed the talk' }); persist(); }
}

function saveSlideEdits() {
  const sl = slidesOf(doc)[current];
  if (!sl) return;
  const ops = [];
  const bullets = $('sBullets').value.split('\n').map((x) => x.trim()).filter(Boolean);
  if ($('sTitle').value !== sl.title) ops.push({ op: 'set', id: sl.id, key: 'title', value: $('sTitle').value });
  if (JSON.stringify(bullets) !== JSON.stringify(sl.bullets ?? [])) ops.push({ op: 'set', id: sl.id, key: 'bullets', value: bullets });
  if ($('sNotes').value !== (sl.notes ?? '')) ops.push({ op: 'set', id: sl.id, key: 'notes', value: $('sNotes').value });
  change(ops, 'user', `edited slide ${current + 1}`);
}

// ------------------------------------------------------------------ presenting
let showAt = 0, slideStart = 0, timerId = null, talkStart = 0;
function present(from = current) {
  if (!slidesOf(doc).length) return;
  showAt = from;
  talkStart = Date.now();
  $('show').classList.remove('hidden');
  $('show').requestFullscreen?.().catch(() => {});
  showSlide();
  clearInterval(timerId);
  timerId = setInterval(tick, 500);
}
function showSlide() {
  const s = settingsOf(doc);
  const slides = slidesOf(doc);
  const sl = slides[showAt];
  $('showSlide').innerHTML = slideHTML(sl, { layout: s.layout, speaker: s.speaker, total: slides.length });
  $('showWhere').textContent = `${showAt + 1} / ${slides.length}`;
  $('showNotesText').textContent = sl.notes ?? '';
  slideStart = Date.now();
  tick();
}
const mmss = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function tick() {
  const sl = slidesOf(doc)[showAt];
  if (!sl) return;
  const on = Date.now() - slideStart, all = Date.now() - talkStart;
  const plan = (sl.minutes ?? 0) * 60000;
  $('timer').textContent = `this slide ${mmss(on)} of ${mmss(plan)} · talk ${mmss(all)} of ${settingsOf(doc).minutes}:00`;
  $('timer').classList.toggle('late', plan > 0 && on > plan);
}
function showGo(d) { showAt = Math.max(0, Math.min(slidesOf(doc).length - 1, showAt + d)); showSlide(); }
function endShow() { $('show').classList.add('hidden'); clearInterval(timerId); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); current = showAt; render(); }

// ------------------------------------------------------------------ the character
const commands = presenterCommands();
const ctx = { sources: (d) => gather(d), sourceText: (d) => sourceText(d), present: () => setTimeout(() => present(0)) };
const handle = characterHandler(commands, () => doc, (d) => { doc = d; persist(); render(); }, ctx);
async function sayDo(text) {
  syncSettings();
  const reply = await handle({ intent: 'unknown', text }, text);
  $('reply').textContent = reply ?? `I don't know how to do that in Presenter. ${commands.help()}`;
}
$('say').addEventListener('submit', async (e) => { e.preventDefault(); await sayDo($('sayText').value); $('sayText').value = ''; });
addEventListener('message', async (e) => {
  if (e.origin !== location.origin || e.data?.type !== 'lucianos.command') return;
  syncSettings();
  const reply = await handle({ intent: 'unknown', text: e.data.text }, e.data.text);
  e.source.postMessage({ type: 'lucianos.reply', id: e.data.id, text: reply }, location.origin);
});
if (parent !== window) parent.postMessage({ type: 'lucianos.commands', names: commands.list().map((c) => c.name) }, location.origin);

// ------------------------------------------------------------------ files
async function save() {
  syncSettings();
  const path = prompt('Save as (relative to your home folder)', settings.savePath || `Documents/${settingsOf(doc).title.replace(/[^\w -]/g, '')}.presenter.json`);
  if (!path) return;
  await api.files.write(path, serialise(doc), { mkdirs: true, force: true });
  await api.files.write(path.replace(/\.json$/, '') + '.pl', toProlog(doc), { mkdirs: true, force: true });
  settings.savePath = path;
  persist();
  $('reply').textContent = `Saved ${path}, with its Prolog form beside it.`;
}
async function open(path) {
  path ??= prompt('Open which .presenter.json file?', settings.savePath || '');
  if (!path) return;
  try { doc = deserialise((await api.files.read(path)).content); settings.savePath = path; current = 0; persist(); render(); } catch (err) { $('reply').textContent = `Couldn't open it: ${err.message}`; }
}
async function exportAs(kind) {
  syncSettings();
  const base = (settings.savePath || `Documents/${settingsOf(doc).title}.presenter.json`).replace(/\.presenter\.json$|\.json$/, '');
  const path = prompt('Export as', `${base}.${kind === 'html' ? 'html' : kind}`);
  if (!path) return;
  await api.files.write(path, kind === 'html' ? deckHTML(doc) : kind === 'md' ? outlineMarkdown(doc) : toProlog(doc), { mkdirs: true, force: true });
  $('reply').textContent = `Exported ${path}.${kind === 'html' ? ' Open it in any browser and use the arrow keys (or swipe) to present.' : ''}`;
}
async function addSource(kind) {
  const ext = kind === 'writer' ? '.writer.json' : '.counter.json';
  const path = prompt(`Which ${ext} file? (relative to your home folder)`, `Documents/`);
  if (!path) return;
  try { await api.files.read(path); } catch (err) { $('reply').textContent = `Couldn't read ${path}: ${err.message}`; return; }
  change([{ op: 'insert', block: { type: 'source', kind, path } }], 'user', `added ${path}`);
}

// ------------------------------------------------------------------ start
async function init() {
  $('layout').replaceChildren(...Object.entries(LAYOUTS).map(([k, l]) => el('option', { value: k, textContent: `${l.name}: ${l.about}` })));
  settings = { ...settings, ...((await api.state.get('presenter').catch(() => null)) ?? {}) };
  const saved = await api.state.get('presenter-doc').catch(() => null);
  if (saved?.format === 'lucianoffice/1' && saved.app === 'presenter') doc = saved;
  const params = new URLSearchParams(location.search);
  if (params.get('text')) {
    doc = newDeckDoc();
    const patch = { title: params.get('title') ?? 'Untitled talk', minutes: Number(params.get('minutes') ?? 10), speaker: { name: params.get('speaker') ?? '', role: params.get('role') ?? '', id: params.get('id') ?? '' }, layout: params.get('layout') ?? 'classic' };
    const ops = [...settingOps(doc, patch), { op: 'set', id: sourcesOf(doc)[0].id, key: 'text', value: params.get('text') }];
    for (const r of params.getAll('ref')) { const [text, f] = r.split('|'); ops.push({ op: 'insert', block: { type: 'reference', text, for: f ?? '' } }); }
    doc = apply(doc, ops, { by: 'user', label: 'started' });
  }
  render();
  for (const id of ['title', 'subtitle', 'minutes', 'pace', 'layout', 'spName', 'spId', 'spRole', 'text']) $(id).addEventListener('change', () => { syncSettings(); render(); });
  for (const id of ['sTitle', 'sBullets', 'sNotes']) $(id).addEventListener('change', saveSlideEdits);
  $('addRef').addEventListener('submit', (e) => { e.preventDefault(); if ($('refText').value.trim()) { change([{ op: 'insert', block: { type: 'reference', text: $('refText').value.trim(), for: $('refFor').value.trim() } }], 'user', 'added a reference'); $('refText').value = ''; $('refFor').value = ''; } });
  $('addWriter').onclick = () => addSource('writer');
  $('addCounter').onclick = () => addSource('counter');
  $('build').onclick = build;
  $('prev').onclick = () => { current--; render(); };
  $('next').onclick = () => { current++; render(); };
  $('delSlide').onclick = () => { const sl = slidesOf(doc)[current]; if (sl) { const next = { ...doc, blocks: doc.blocks.filter((b) => b.id !== sl.id) }; change([{ op: 'delete', id: sl.id }, ...retimeOps(next)], 'user', `deleted slide ${current + 1}`); } };
  $('undo').onclick = () => { doc = undo(doc).doc; persist(); render(); };
  $('redo').onclick = () => { doc = redo(doc).doc; persist(); render(); };
  $('present').onclick = () => { syncSettings(); present(current); };
  $('showPrev').onclick = () => showGo(-1);
  $('showNext').onclick = () => showGo(1);
  $('showEnd').onclick = endShow;
  $('showNotes').onclick = () => $('showNotesText').classList.toggle('hidden');
  $('showSlide').onclick = () => showGo(1);
  addEventListener('keydown', (e) => {
    if ($('show').classList.contains('hidden')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); showGo(1); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); showGo(-1); }
    if (e.key === 'Escape') endShow();
    if (e.key === 'n') $('showNotesText').classList.toggle('hidden');
  });
  $('new').onclick = () => { if (confirm('Start a new talk? The current one stays saved if you saved it.')) { doc = newDeckDoc(); settings.savePath = ''; lastPlan = null; current = 0; persist(); render(); } };
  $('save').onclick = save;
  $('open').onclick = () => open();
  $('export').onchange = async (e) => { const k = e.target.value; e.target.value = ''; if (k) await exportAs(k); };
  if (params.get('text')) await build();
  if (params.get('slide')) { current = Number(params.get('slide')) - 1; render(); }
  if (params.get('do')) await sayDo(params.get('do'));
}
init();
