// Presenter's deck builder. From a length of time, references, a speaker, an intro and a
// layout, it plans slides that fit the time and fills them from Writer text and Counter
// figures, in the open:
//   slides     = the time ÷ minutes per slide (the pace), at least 3
//   fixed      = the intro, a slide per 6 references, and a closing slide for questions
//   content    = what is left, shared between Counter's graphs and figures and Writer's
//                sections in proportion to how much each has to say
//   too much   = the most important sentences become bullets; the rest go in the speaker notes
//   too little = the deck is shorter and each slide gets more time; nothing is padded
// Every reference is listed on a references slide, and cited ([1]) on slides about it.

export const LAYOUTS = {
  classic: { name: 'Classic', bullets: 4, about: 'A title and up to four bullets' },
  'two-column': { name: 'Two columns', bullets: 6, about: 'Up to six bullets in two columns' },
  statement: { name: 'Big statement', bullets: 1, about: 'One point per slide, large' },
  minimal: { name: 'Minimal', bullets: 3, about: 'A title and up to three short points' }
};
export const REFS_PER_SLIDE = 6;
export const FIGURES_PER_SLIDE = 4;

const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean);
export const sentencesOf = (text) => String(text ?? '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map((s) => s.trim()).filter(Boolean);

// A bullet: the sentence without its full stop, cut at a clause if it is long.
export function bullet(sentence, max = 16) {
  let s = sentence.replace(/\s*\[\d+\]/g, '').replace(/[.]+$/, '').trim();
  if (words(s).length <= max) return s;
  const cut = s.split(/[,;:]\s+|\s+(?:which|because|although|while|so that)\s+/i)[0];
  if (words(cut).length >= 4 && words(cut).length <= max) return cut;
  return `${words(s).slice(0, max).join(' ')}…`;
}

// How important a sentence is, for choosing bullets when there's too much to say: numbers,
// words the section's title shares, and words that come up often in the text score higher;
// the first sentence of a paragraph gets a little extra.
const STOP = new Set('the a an and or of to in on for is are was were be been it this that with as at by from its their his her our your we you they he she i not but if then so than can will would should could may also has have had do does did'.split(' '));
function importance(sentence, index, title, freq) {
  const ws = words(sentence.toLowerCase().replace(/[^a-z0-9\s]/g, ''));
  let score = 0;
  for (const w of ws) if (!STOP.has(w) && w.length > 2) score += Math.min(freq.get(w) ?? 0, 4) * 0.25;
  if (/\d/.test(sentence)) score += 1.5;
  for (const w of words(String(title ?? '').toLowerCase())) if (ws.includes(w) && !STOP.has(w)) score += 1;
  if (index === 0) score += 1;
  return score / Math.sqrt(ws.length || 1);
}

export function slideCount(minutes, pace = 1.5) {
  return Math.max(3, Math.round(Number(minutes) / Number(pace)));
}

export function buildDeck({
  minutes = 10, pace = 1.5, layout = 'classic', title = 'Untitled', subtitle = '',
  speaker = {}, references = [], content = [], figures = [], graphs = []
} = {}) {
  const lay = LAYOUTS[layout] ?? LAYOUTS.classic;
  const target = slideCount(minutes, pace);
  const refs = references.map((r, i) => ({ n: i + 1, text: String(r.text ?? r).trim(), for: String(r.for ?? '').trim() })).filter((r) => r.text);
  const refSlides = Math.ceil(refs.length / REFS_PER_SLIDE);
  const fixed = 1 + refSlides + 1;
  const budget = Math.max(1, target - fixed);
  const notes = [];

  // ---- candidates: sections from the text, then figures and graphs from Counter
  const sections = content
    .map((s, i) => ({ title: s.heading || (i === 0 ? title : `Part ${i + 1}`), sentences: (s.paragraphs ?? []).flatMap(sentencesOf) }))
    .filter((s) => s.sentences.length);
  const figureGroups = [];
  for (let i = 0; i < figures.length; i += FIGURES_PER_SLIDE) figureGroups.push(figures.slice(i, i + FIGURES_PER_SLIDE));
  const freq = new Map();
  for (const s of sections) for (const sen of s.sentences) for (const w of words(sen.toLowerCase().replace(/[^a-z0-9\s]/g, ''))) if (!STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);

  // ---- share the content slides out
  let left = budget;
  const graphCount = Math.min(graphs.length, sections.length ? Math.max(1, Math.floor(budget / 3)) : budget);
  left -= graphCount;
  const figureCount = Math.min(figureGroups.length, Math.max(0, sections.length ? Math.max(left > 1 ? 1 : 0, Math.floor(budget / 3)) : left));
  left -= figureCount;
  // fewer slides than sections: the best points from every section share the slides
  if (left > 0 && left < sections.length) {
    const merged = { title: 'Key points', sentences: sections.flatMap((x) => x.sentences) };
    notes.push(`${sections.length} sections share ${left} slide${left === 1 ? '' : 's'} as key points; the rest is in the speaker notes.`);
    sections.splice(0, sections.length, merged);
  }
  const needs = sections.map((s) => Math.ceil(s.sentences.length / lay.bullets));
  const sectionSlides = shareOut(needs, Math.max(0, left));
  if (graphs.length > graphCount) notes.push(`${graphs.length - graphCount} graph${graphs.length - graphCount === 1 ? '' : 's'} left out to fit the time.`);
  if (figureGroups.length > figureCount) notes.push(`${figures.length - figureCount * FIGURES_PER_SLIDE} figure${figures.length - figureCount * FIGURES_PER_SLIDE === 1 ? '' : 's'} left out to fit the time.`);
  sections.forEach((s, i) => { if (sectionSlides[i] === 0) notes.push(`There was no time for the section "${s.title}"; its text is in the closing slide's notes.`); });

  // ---- build the slides
  const slides = [];
  const speakerLine = [speaker.name, speaker.role].filter(Boolean).join(', ');
  slides.push({ kind: 'intro', title, bullets: [subtitle, speakerLine, speaker.id ? `Speaker ID: ${speaker.id}` : ''].filter(Boolean), notes: `Introduce yourself${speaker.name ? ` (${speaker.name})` : ''} and the talk: ${title}.` });
  const overflow = [];
  sections.forEach((s, si) => {
    const n = sectionSlides[si];
    if (!n) { overflow.push(...s.sentences); return; }
    const capacity = n * lay.bullets;
    // keep the most important sentences, in their original order
    const ranked = s.sentences.map((sen, i) => ({ sen, i, score: importance(sen, i, s.title, freq) })).sort((a, b) => b.score - a.score || a.i - b.i);
    const keep = new Set(ranked.slice(0, capacity).map((x) => x.i));
    const kept = s.sentences.map((sen, i) => ({ sen, i })).filter((x) => keep.has(x.i));
    const per = Math.ceil(kept.length / n);
    for (let k = 0; k < n; k++) {
      const part = kept.slice(k * per, (k + 1) * per);
      if (!part.length) continue;
      const lastI = k === n - 1 ? s.sentences.length : kept[(k + 1) * per]?.i ?? s.sentences.length;
      const firstI = part[0].i;
      // notes: every sentence of this stretch, so nothing said is lost
      const stretch = s.sentences.slice(k === 0 ? 0 : firstI, lastI);
      slides.push({ kind: 'content', title: n > 1 && k > 0 ? `${s.title} (continued)` : s.title, bullets: part.map((x) => bullet(x.sen)), notes: stretch.join(' ') });
    }
  });
  figureGroups.slice(0, figureCount).forEach((g, i) => slides.push({ kind: 'figures', title: i ? 'Key figures (continued)' : 'Key figures', figures: g, bullets: g.map((f) => `${f.label}: ${f.value}`), notes: g.map((f) => `${f.label} is ${f.value}${f.how ? `, worked out as ${f.how}` : ''}.`).join(' ') }));
  graphs.slice(0, graphCount).forEach((g) => slides.push({ kind: 'graph', title: g.title, graph: g, bullets: [], notes: g.rows.map((r) => `${r.segment}: ${r.values.map((v, i) => `${g.labels[i]} ${v}`).join(', ')}`).join('. ') + '.' }));
  for (let i = 0; i < refSlides; i++) {
    const part = refs.slice(i * REFS_PER_SLIDE, (i + 1) * REFS_PER_SLIDE);
    slides.push({ kind: 'references', title: i ? 'References (continued)' : 'References', bullets: part.map((r) => `[${r.n}] ${r.text}`), notes: 'The sources for this talk.' });
  }
  slides.push({ kind: 'end', title: 'Questions', bullets: [speakerLine ? `Thank you. ${speakerLine}` : 'Thank you.'].filter(Boolean), notes: overflow.length ? `If there is time: ${overflow.join(' ')}` : 'Take questions.' });

  // ---- cite references on the slides about them
  for (const r of refs) {
    const keys = (r.for ? r.for.split(/\s*,\s*/) : []).map((k) => k.toLowerCase()).filter(Boolean);
    for (const sl of slides) {
      if (sl.kind === 'references' || sl.kind === 'intro' || !keys.length) continue;
      const text = `${sl.title} ${sl.bullets.join(' ')} ${sl.notes}`.toLowerCase();
      if (keys.some((k) => text.includes(k))) (sl.refs ??= []).push(r.n);
    }
  }

  // ---- time for each slide: the intro and closing get half a share
  const weights = slides.map((s) => (s.kind === 'intro' || s.kind === 'end' || s.kind === 'references' ? 0.5 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  slides.forEach((s, i) => { s.minutes = Math.round((minutes * weights[i] / total) * 10) / 10; s.n = i + 1; });

  const fits = slides.length <= target;
  if (slides.length < target) notes.unshift(`There is content for ${slides.length} slides; ${minutes} minutes at ${pace} minutes a slide allows ${target}. Each slide gets more time instead of padding.`);
  if (slides.length > target) notes.unshift(`${minutes} minutes allows ${target} slides at ${pace} minutes each, but the intro, references and closing need ${fixed} and the content at least 1, so the deck has ${slides.length}.`);
  return { slides, references: refs, layout, plan: { minutes, pace, target, count: slides.length, fits, budget, notes } };
}

// Gives each section a share of the slides in proportion to what it needs, at least one
// each while there are slides to give, never more than it needs.
export function shareOut(needs, total) {
  const out = needs.map(() => 0);
  let left = total;
  // one each, in order, while slides last
  for (let i = 0; i < needs.length && left > 0; i++) if (needs[i] > 0) { out[i] = 1; left--; }
  while (left > 0) {
    let best = -1, bestGap = 0;
    needs.forEach((n, i) => { const gap = (n - out[i]) / n; if (out[i] < n && gap > bestGap) { best = i; bestGap = gap; } });
    if (best < 0) break;
    out[best]++;
    left--;
  }
  return out;
}

// ------------------------------------------------------------------ from other apps
// A Writer document: headings start sections, paragraphs fill them (inspiration notes skipped).
export function contentFromWriter(doc) {
  const sections = [];
  let cur = null;
  for (const b of doc.blocks ?? []) {
    if (b.deleted || b.type === 'description' || b.type === 'inspiration') continue;
    if (b.type === 'heading') { cur = { heading: b.text, paragraphs: [] }; sections.push(cur); continue; }
    if (!(b.text ?? '').trim()) continue;
    if (!cur) { cur = { heading: '', paragraphs: [] }; sections.push(cur); }
    cur.paragraphs.push(b.text);
  }
  return sections;
}

// Plain text: blank lines separate paragraphs; a short line without a full stop is a heading.
export function contentFromText(text) {
  const sections = [];
  let cur = null;
  for (const para of String(text ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    const lines = para.split('\n');
    if (lines.length === 1 && words(para).length <= 8 && !/[.!?]$/.test(para)) { cur = { heading: para.replace(/^#+\s*/, ''), paragraphs: [] }; sections.push(cur); continue; }
    let rest = para;
    if (lines.length > 1 && words(lines[0]).length <= 8 && !/[.!?]$/.test(lines[0])) { cur = { heading: lines[0].replace(/^#+\s*/, ''), paragraphs: [] }; sections.push(cur); rest = lines.slice(1).join(' '); }
    if (!cur) { cur = { heading: '', paragraphs: [] }; sections.push(cur); }
    cur.paragraphs.push(rest.replace(/\n/g, ' '));
  }
  return sections;
}

// Counter: labelled figures (a text label in column A beside a number in column B), as a
// sheet's computed values give them: rows = [[label, shownValue, formula?], ...].
export function figuresFromRows(rows, sheetName = '') {
  return rows
    .filter(([label, value]) => typeof label === 'string' && label.trim() && value !== '' && value !== undefined && /\d/.test(String(value)))
    .map(([label, value, formula]) => ({ label: label.trim(), value: String(value), how: formula?.startsWith('=') ? formula : '', sheet: sheetName }));
}

// The figures worth a slide: totals and results (formulas) first, then the rest.
export function pickFigures(figures, max = 8) {
  const results = figures.filter((f) => f.how), inputs = figures.filter((f) => !f.how);
  return [...results, ...inputs].slice(0, max);
}
