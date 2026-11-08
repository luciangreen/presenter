// A Presenter document is a Lucian Office document of app "presenter":
//   { type: 'settings', minutes, pace, layout, title, subtitle, speaker: { name, role, id } }
//   { type: 'reference', text, for }      the references (cited on slides about "for")
//   { type: 'source', kind: 'text' | 'writer' | 'counter', path, text }
//   { type: 'slide', kind, title, bullets, notes, minutes, refs, figures, graph }
import { createDocument } from './core.js';
import { buildDeck } from './deck.js';

export const DEFAULT_SETTINGS = { minutes: 10, pace: 1.5, layout: 'classic', title: 'Untitled talk', subtitle: '', speaker: { name: '', role: '', id: '' } };

export function newDeckDoc() {
  return createDocument({ app: 'presenter', title: 'Untitled talk', blocks: [{ type: 'settings', ...DEFAULT_SETTINGS }, { type: 'source', kind: 'text', text: '' }] });
}
export const settingsOf = (doc) => ({ ...DEFAULT_SETTINGS, ...(doc.blocks.find((b) => b.type === 'settings') ?? {}) });
export const settingsBlock = (doc) => doc.blocks.find((b) => b.type === 'settings');
export const referencesOf = (doc) => doc.blocks.filter((b) => b.type === 'reference');
export const sourcesOf = (doc) => doc.blocks.filter((b) => b.type === 'source');
export const slidesOf = (doc) => doc.blocks.filter((b) => b.type === 'slide');

// Settings changes as ops (one per key, so each is undoable).
export const settingOps = (doc, patch) => Object.entries(patch).map(([key, value]) => ({ op: 'set', id: settingsBlock(doc).id, key, value }));

// Replace the slides with a freshly built deck. sources: { content, figures, graphs } gathered by the app.
export function buildOps(doc, sources = {}) {
  const s = settingsOf(doc);
  const deck = buildDeck({ ...s, references: referencesOf(doc).map((r) => ({ text: r.text, for: r.for })), ...sources });
  const firstSlide = doc.blocks.findIndex((b) => b.type === 'slide');
  const at = firstSlide < 0 ? doc.blocks.length : firstSlide;
  const ops = [
    ...slidesOf(doc).map((b) => ({ op: 'delete', id: b.id })),
    ...deck.slides.map((sl, i) => ({ op: 'insert', at: at + i, block: { type: 'slide', ...sl } }))
  ];
  return { ops, deck };
}

// The time plan for the slides as they now are (after any edits).
export function timePlan(doc) {
  const s = settingsOf(doc);
  const slides = slidesOf(doc);
  const total = slides.reduce((a, b) => a + (b.minutes ?? 0), 0);
  const target = Math.max(3, Math.round(s.minutes / s.pace));
  return { minutes: s.minutes, target, count: slides.length, planned: Math.round(total * 10) / 10, fits: slides.length <= target };
}

// Re-share the time over the slides (after adding, deleting or moving slides).
export function retimeOps(doc) {
  const s = settingsOf(doc);
  const slides = slidesOf(doc);
  const w = slides.map((b) => (['intro', 'end', 'references'].includes(b.kind) ? 0.5 : 1));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  return slides.map((b, i) => ({ op: 'set', id: b.id, key: 'minutes', value: Math.round((s.minutes * w[i] / total) * 10) / 10 }));
}
