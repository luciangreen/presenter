import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, REFS_PER_SLIDE, bullet, buildDeck, contentFromText, contentFromWriter, figuresFromRows, pickFigures, sentencesOf, shareOut, slideCount } from '../lib/deck.js';
import { buildOps, newDeckDoc, referencesOf, settingOps, settingsOf, slidesOf, timePlan } from '../lib/deckdoc.js';
import { deckHTML, outlineMarkdown, slideHTML } from '../lib/export.js';
import { presenterCommands } from '../lib/commands.js';
import { apply, createDocument } from '../lib/core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEXT = `Meditation at school

Meditation helps students learn. Students who meditate for ten minutes a day focus better. Calm students remember more of what they study, because stress blocks memory. Teachers report fewer conflicts in class. Classes start more quietly.

How to start

Begin with two minutes of breathing. Add a minute each week. Use the same time each day, which builds a habit. Keep a short journal of how it feels.

Results

In one school, test scores rose by 12 percent. Attendance improved by 5 percent. Students said they felt happier. Parents noticed calmer evenings at home.`;
const REFS = [{ text: 'Smith (2020) Mindful classrooms', for: 'test scores' }, { text: 'Lee (2019) Breathing and memory', for: 'memory' }, { text: 'Green (2024) Daily practice' }];
const SPEAKER = { name: 'Lucian Green', role: 'Lucian Academy', id: 'LG-01' };
const long = Array.from({ length: 8 }, (_, i) => `Part ${i + 1}\n\n${Array.from({ length: 9 }, (_, j) => `Point ${j + 1} of part ${i + 1} explains one idea clearly.`).join(' ')}`).join('\n\n');

test('the slide count fits the time, for short and long talks, at any pace', () => {
  for (const minutes of [3, 5, 10, 15, 20, 30, 45, 60]) {
    for (const pace of [1, 1.5, 2, 3]) {
      for (const text of [TEXT, long]) {
        const d = buildDeck({ minutes, pace, content: contentFromText(text), references: REFS, title: 'T' });
        const target = slideCount(minutes, pace);
        const minimum = 1 + Math.ceil(REFS.length / REFS_PER_SLIDE) + 1 + 1; // intro, references, closing, one content slide
        assert.ok(d.slides.length <= Math.max(target, minimum), `${minutes} min at ${pace}: ${d.slides.length} slides for ${target}`);
        assert.equal(d.plan.count, d.slides.length);
        // the long text has 8 parts of 9 sentences: up to 3 slides each at 4 points a slide
        if (text === long) assert.equal(d.slides.length, Math.min(Math.max(target, minimum), 3 + 8 * 3), 'with plenty to say, the deck uses the time it has');
        const planned = d.slides.reduce((a, s) => a + s.minutes, 0);
        assert.ok(Math.abs(planned - minutes) < 0.06 * d.slides.length + 0.1, `the slide times add up to the talk (${planned} for ${minutes})`);
      }
    }
  }
});

test('every reference appears: on the references slides, and cited on slides about it', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ text: `Author ${i + 1} (${2000 + i}) Work`, for: i === 0 ? 'test scores' : '' }));
  const d = buildDeck({ minutes: 10, content: contentFromText(TEXT), references: [...REFS, ...many] });
  const listed = d.slides.filter((s) => s.kind === 'references').flatMap((s) => s.bullets);
  assert.equal(listed.length, REFS.length + many.length);
  for (const r of [...REFS, ...many]) assert.ok(listed.some((b) => b.endsWith(r.text)), r.text);
  assert.equal(d.slides.filter((s) => s.kind === 'references').length, Math.ceil(17 / REFS_PER_SLIDE));
  const scores = d.slides.find((s) => s.bullets.some((b) => b.includes('test scores')));
  assert.ok(scores.refs.includes(1), 'Smith is cited on the slide about test scores');
  const memory = d.slides.find((s) => s.kind === 'content' && /memory/.test(s.notes));
  assert.ok(memory.refs.includes(2), 'Lee is cited on the slide about memory');
  // even a 2-minute talk keeps every reference
  const tiny = buildDeck({ minutes: 2, content: contentFromText(TEXT), references: REFS });
  assert.equal(tiny.slides.filter((s) => s.kind === 'references').flatMap((s) => s.bullets).length, 3);
  assert.equal(tiny.plan.fits, false);
  assert.match(tiny.plan.notes[0], /need/);
});

test('the speaker and the intro open the deck, and the speaker is on every slide', () => {
  const d = buildDeck({ minutes: 10, title: 'Meditation in schools', subtitle: 'Calmer classes in ten minutes a day', speaker: SPEAKER, content: contentFromText(TEXT), references: REFS });
  const intro = d.slides[0];
  assert.equal(intro.kind, 'intro');
  assert.equal(intro.title, 'Meditation in schools');
  assert.deepEqual(intro.bullets, ['Calmer classes in ten minutes a day', 'Lucian Green, Lucian Academy', 'Speaker ID: LG-01']);
  assert.equal(d.slides.at(-1).kind, 'end');
  for (const s of d.slides) assert.match(slideHTML(s, { speaker: SPEAKER, total: d.slides.length }), /<footer>Lucian Green · ID LG-01 · \d+\/\d+<\/footer>/);
});

test('too much to say: the most important points become bullets, and everything is kept in the notes', () => {
  const d = buildDeck({ minutes: 6, content: contentFromText(TEXT) });
  const content = d.slides.filter((s) => s.kind === 'content');
  assert.ok(content.every((s) => s.bullets.length <= LAYOUTS.classic.bullets));
  const allNotes = d.slides.map((s) => s.notes).join(' ');
  for (const sen of sentencesOf(TEXT.replace(/^[A-Z][a-z ]+$/gm, ''))) assert.ok(allNotes.includes(sen), `kept in the notes: ${sen}`);
  assert.ok(content.flatMap((s) => s.bullets).some((b) => /12 percent/.test(b)), 'a sentence with a number is chosen');
  assert.match(d.plan.notes.join(' '), /share/);
});

test('too little to say: fewer slides with more time each, nothing padded', () => {
  const d = buildDeck({ minutes: 30, content: contentFromText('Hello\n\nOne short point. Another point.') });
  assert.equal(d.slides.length, 3);
  assert.ok(d.slides.find((s) => s.kind === 'content').minutes > 10);
  assert.match(d.plan.notes[0], /more time instead of padding/);
});

test('layouts change how many points fit on a slide', () => {
  const content = contentFromText(TEXT);
  const statement = buildDeck({ minutes: 30, layout: 'statement', content });
  assert.ok(statement.slides.filter((s) => s.kind === 'content').every((s) => s.bullets.length === 1));
  const two = buildDeck({ minutes: 10, layout: 'two-column', content });
  assert.ok(two.slides.some((s) => s.bullets.length > 4));
  assert.match(slideHTML(two.slides[1], { layout: 'two-column' }), /<ul class="cols">/);
  assert.match(slideHTML(statement.slides[1], { layout: 'statement' }), /class="statement"/);
});

test('fed by Writer: headings become sections, inspiration notes are left out', () => {
  const writerDoc = { blocks: [
    { type: 'description', text: 'ignored' },
    { type: 'paragraph', text: 'An opening paragraph before any heading.' },
    { type: 'heading', text: 'Method' }, { type: 'paragraph', text: 'We breathed for two minutes. We wrote in a journal.' },
    { type: 'inspiration', text: 'music: a new direction' },
    { type: 'heading', text: 'Findings' }, { type: 'paragraph', text: 'Scores rose.', deleted: true }, { type: 'paragraph', text: 'Students were calmer.' }
  ] };
  const content = contentFromWriter(writerDoc);
  assert.deepEqual(content.map((s) => s.heading), ['', 'Method', 'Findings']);
  assert.deepEqual(content[2].paragraphs, ['Students were calmer.']);
  const d = buildDeck({ minutes: 10, title: 'Study', content });
  assert.deepEqual(d.slides.filter((s) => s.kind === 'content').map((s) => s.title), ['Study', 'Method', 'Findings']);
});

test('fed by Counter: labelled figures, results first, and graphs', () => {
  const figs = figuresFromRows([['Profit and loss', 'Amount'], ['Sales', '50000', '50000'], ['Net profit', '$7,125.00', '=B12-B13'], ['Net margin', '13.7%', '=B14/B4'], ['', '5'], ['Note', 'none']], 'P&L');
  assert.deepEqual(figs.map((f) => f.label), ['Sales', 'Net profit', 'Net margin']);
  assert.deepEqual(pickFigures(figs).map((f) => f.label), ['Net profit', 'Net margin', 'Sales']);
  const graph = { title: 'Sales by Region', labels: ['Sales'], rows: [{ segment: 'North', values: [1700] }, { segment: 'South', values: [1850] }] };
  const d = buildDeck({ minutes: 10, content: contentFromText(TEXT), figures: pickFigures(figs), graphs: [graph] });
  const f = d.slides.find((s) => s.kind === 'figures');
  assert.deepEqual(f.figures.map((x) => x.value), ['$7,125.00', '13.7%', '50000']);
  assert.match(f.notes, /Net profit is \$7,125.00, worked out as =B12-B13/);
  const g = d.slides.find((s) => s.kind === 'graph');
  assert.match(slideHTML(g), /<svg[^>]*aria-label="Sales by Region"/);
  assert.match(g.notes, /North: Sales 1700/);
});

test('fed by a real Counter workbook, when Counter is beside Presenter', async (t) => {
  const counter = path.join(HERE, '..', '..', 'counter', 'lib', 'proformas.js');
  if (!fs.existsSync(counter)) return t.skip('Counter is not checked out beside Presenter');
  const { PROFORMAS } = await import(counter);
  const sheetLib = await import(path.join(HERE, '..', '..', 'counter', 'lib', 'sheet.js'));
  const sh = PROFORMAS['profit-and-loss'].build();
  const c = sheetLib.compute(sh);
  const fm = sheetLib.formats(sh);
  const rows = Array.from({ length: sheetLib.size(sh).rows }, (_, r) => [c.value(`A${r + 1}`), sheetLib.formatValue(c.value(`B${r + 1}`), fm[`B${r + 1}`]), sheetLib.cells(sh)[`B${r + 1}`]]);
  const figs = pickFigures(figuresFromRows(rows));
  assert.ok(figs.some((f) => f.label === 'Net profit' && f.value === '7125'));
  assert.ok(figs.some((f) => f.label === 'Net margin' && f.value === '13.7%'));
});

test('bullets and sentences', () => {
  assert.equal(bullet('Calm students remember more.'), 'Calm students remember more');
  assert.equal(bullet('Students who practise every single day for many weeks, even when tired, find that their focus grows steadily stronger over time.'), 'Students who practise every single day for many weeks');
  assert.deepEqual(sentencesOf('Dr. Who? No. It rose 5.5 percent. "Yes," she said.'), ['Dr.', 'Who?', 'No.', 'It rose 5.5 percent.', '"Yes," she said.']);
  assert.deepEqual(shareOut([4, 1, 2], 4), [2, 1, 1]);
  assert.deepEqual(shareOut([3, 3], 10), [3, 3]);
  assert.deepEqual(shareOut([2, 2, 2], 2), [1, 1, 0]);
});

test('a Presenter document: build, time plan, edits and the character, all undoable', async () => {
  let d = newDeckDoc();
  d = apply(d, [...settingOps(d, { title: 'Meditation in schools', minutes: 10, speaker: SPEAKER }), ...REFS.map((r) => ({ op: 'insert', block: { type: 'reference', ...r } }))]);
  const sources = async () => ({ content: contentFromText(TEXT) });
  const reg = presenterCommands();
  const ctx = { sources, sourceText: async () => TEXT };
  const run = async (t) => { const r = await reg.perform(t, d, { ctx }); d = r.doc; return r.say; };
  assert.match(await run('build the deck'), /Built 7 slides for 10 minutes/);
  assert.equal(timePlan(d).fits, true);
  assert.match(await run('make it 5 minutes'), /5 minutes: 4 slides/);
  assert.equal(settingsOf(d).minutes, 5);
  assert.equal(slidesOf(d).length, 4);
  await run('undo that');
  assert.equal(settingsOf(d).minutes, 10);
  assert.equal(slidesOf(d).length, 7);
  assert.match(await run('add a slide about breathing'), /1 point from your text/);
  const added = slidesOf(d).find((s) => s.title === 'Breathing');
  assert.ok(added.bullets.some((b) => /breathing/i.test(b)));
  assert.equal(slidesOf(d)[slidesOf(d).length - 3].title, 'Breathing', 'added before the references and closing');
  assert.match(await run('delete slide 3'), /Deleted slide 3/);
  await run('move slide 2 to 4');
  assert.match(await run('use the minimal layout'), /minimal/);
  assert.equal(settingsOf(d).layout, 'minimal');
  await run('add a reference Brown (2021) School habits for habit');
  assert.equal(referencesOf(d).at(-1).for, 'habit');
  await run('build the deck');
  const refsSlide = slidesOf(d).find((s) => s.kind === 'references');
  assert.ok(refsSlide.bullets.some((b) => b.includes('Brown (2021)')));
  assert.match(await run('how long is it'), /slides for 10 minutes/);
});

test('exports: an HTML deck to present anywhere, and an outline with notes', () => {
  let d = newDeckDoc();
  d = apply(d, [...settingOps(d, { title: 'Meditation in schools', speaker: SPEAKER }), ...REFS.map((r) => ({ op: 'insert', block: { type: 'reference', ...r } }))]);
  d = apply(d, buildOps(d, { content: contentFromText(TEXT) }).ops);
  const html = deckHTML(d);
  assert.match(html, /^<!doctype html>/);
  assert.equal((html.match(/<section /g) ?? []).length, slidesOf(d).length);
  for (const r of REFS) assert.ok(html.includes(r.text), `the HTML deck lists ${r.text}`);
  assert.match(html, /addEventListener\('keydown'/);
  assert.match(html, /touchstart/, 'swipe to change slides on a phone');
  const md = outlineMarkdown(d);
  assert.match(md, /^# Meditation in schools/);
  assert.match(md, /Speaker: Lucian Green, Lucian Academy, ID LG-01/);
  for (const r of REFS) assert.ok(md.includes(r.text));
  assert.match(md, /> Meditation helps students learn\./);
});
