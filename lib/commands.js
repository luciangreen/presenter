// Presenter's commands for the RetroMR character. Each returns ops, applied as one step
// marked as the character's, so "undo that" takes it back.
import { createCommands } from './core.js';
import { LAYOUTS, bullet, sentencesOf } from './deck.js';
import { buildOps, referencesOf, retimeOps, settingOps, settingsOf, slidesOf } from './deckdoc.js';

const clean = (s) => String(s).trim().replace(/^["“']|["”']$/g, '');
const num = (s) => { const w = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, sixty: 60 }; const t = clean(s).toLowerCase(); return w[t] ?? Number(t); };

export function presenterCommands() {
  const reg = createCommands({ app: 'Presenter' });
  reg
    .register({
      name: 'length', patterns: ['make it {n} minutes', 'the talk is {n} minutes', 'set the time to {n} minutes', 'make it {n} minutes long'], help: 'make it 10 minutes',
      run: async ({ args, doc, ctx }) => {
        const n = num(args.n);
        if (!Number.isFinite(n) || n <= 0 || n > 600) return { doc, say: 'Say a number of minutes, such as 10.' };
        const withTime = { ...doc, blocks: doc.blocks.map((b) => (b.type === 'settings' ? { ...b, minutes: n } : b)) };
        const { ops, deck } = buildOps(withTime, await ctx.sources?.(withTime));
        return { ops: [...settingOps(doc, { minutes: n }), ...ops], say: `${n} minutes: ${deck.slides.length} slides. ${deck.plan.notes[0] ?? ''}`.trim() };
      }
    })
    .register({
      name: 'layout', patterns: ['use the {layout} layout', 'make it {layout}', 'change the layout to {layout}'], help: 'use the two-column layout',
      run: ({ args, doc }) => {
        const want = clean(args.layout).toLowerCase().replace(/\s+/g, '-');
        const key = Object.keys(LAYOUTS).find((k) => k === want || LAYOUTS[k].name.toLowerCase().replace(/\s+/g, '-') === want || k.startsWith(want));
        if (!key) return { doc, say: `The layouts are ${Object.values(LAYOUTS).map((l) => l.name.toLowerCase()).join(', ')}.` };
        return { ops: settingOps(doc, { layout: key }), say: `Using the ${LAYOUTS[key].name.toLowerCase()} layout. Say "build the deck" to refit the bullets to it.` };
      }
    })
    .register({
      name: 'build', patterns: ['build the deck', 'build it', 'rebuild', 'rebuild the deck', 'make the slides'], help: 'build the deck',
      run: async ({ doc, ctx }) => {
        const { ops, deck } = buildOps(doc, await ctx.sources?.(doc));
        return { ops, say: `Built ${deck.slides.length} slides for ${deck.plan.minutes} minutes. ${deck.plan.notes[0] ?? ''}`.trim() };
      }
    })
    .register({
      name: 'add slide', patterns: ['add [a] slide about {topic}', 'add [a] slide on {topic}', 'add [a] slide called {topic}'], help: 'add a slide about pricing',
      run: async ({ args, doc, ctx }) => {
        const topic = clean(args.topic);
        const lay = LAYOUTS[settingsOf(doc).layout] ?? LAYOUTS.classic;
        const text = (await ctx.sourceText?.(doc)) ?? '';
        const about = sentencesOf(text).filter((s) => s.toLowerCase().includes(topic.toLowerCase()));
        const slides = slidesOf(doc);
        const end = slides.findIndex((s) => s.kind === 'references' || s.kind === 'end');
        const at = end < 0 ? doc.blocks.length : doc.blocks.findIndex((b) => b.id === slides[end].id);
        const block = { type: 'slide', kind: 'content', title: topic[0].toUpperCase() + topic.slice(1), bullets: about.slice(0, lay.bullets).map((s) => bullet(s)), notes: about.join(' '), minutes: 0 };
        const next = { ...doc, blocks: [...doc.blocks.slice(0, at), { id: '_new', ...block }, ...doc.blocks.slice(at)] };
        const timing = retimeOps(next).filter((o) => o.id !== '_new');
        const mine = retimeOps(next).find((o) => o.id === '_new');
        return { ops: [{ op: 'insert', at, block: { ...block, minutes: mine?.value ?? 0 } }, ...timing], say: about.length ? `Added a slide about ${topic} with ${Math.min(about.length, lay.bullets)} point${Math.min(about.length, lay.bullets) === 1 ? '' : 's'} from your text.` : `Added a slide about ${topic}; nothing in your text mentions it yet, so it's empty for you to fill.` };
      }
    })
    .register({
      name: 'delete slide', patterns: ['delete slide {n}', 'remove slide {n}'],
      run: ({ args, doc }) => {
        const slides = slidesOf(doc);
        const s = slides[num(args.n) - 1];
        if (!s) return { doc, say: `There is no slide ${args.n}.` };
        const next = { ...doc, blocks: doc.blocks.filter((b) => b.id !== s.id) };
        return { ops: [{ op: 'delete', id: s.id }, ...retimeOps(next)], say: `Deleted slide ${args.n}, "${s.title}".` };
      }
    })
    .register({
      name: 'move slide', patterns: ['move slide {from} to {to}', 'move slide {from} to position {to}'],
      run: ({ args, doc }) => {
        const slides = slidesOf(doc);
        const a = slides[num(args.from) - 1], b = slides[num(args.to) - 1];
        if (!a || !b) return { doc, say: 'Say two slide numbers that exist.' };
        return { ops: [{ op: 'move', id: a.id, to: doc.blocks.findIndex((x) => x.id === b.id) }], say: `Moved "${a.title}" to slide ${args.to}.` };
      }
    })
    .register({
      name: 'add reference', patterns: ['add [a] reference {text} for {keys}', 'add [a] reference {text}', 'cite {text}'], help: 'add a reference Smith (2020) for test scores',
      run: ({ args }) => ({ ops: [{ op: 'insert', block: { type: 'reference', text: clean(args.text), for: args.keys ? clean(args.keys) : '' } }], say: `Added the reference. Say "build the deck" to place it.` })
    })
    .register({
      name: 'speaker', patterns: ['the speaker is {name}', 'speaker is {name}', 'my name is {name}'],
      run: ({ args, doc }) => ({ ops: settingOps(doc, { speaker: { ...settingsOf(doc).speaker, name: clean(args.name) } }), say: `The speaker is ${clean(args.name)}.` })
    })
    .register({
      name: 'title', patterns: ['call the talk {title}', 'the title is {title}'],
      run: ({ args, doc }) => ({ ops: [...settingOps(doc, { title: clean(args.title) }), { op: 'title', value: clean(args.title) }], say: `The talk is called ${clean(args.title)}.` })
    })
    .register({ name: 'present', patterns: ['present', 'start presenting', 'present it', 'start the presentation'], run: ({ doc, ctx }) => { ctx.present?.(); return { doc, say: 'Presenting. Use the arrow keys; Escape to stop.' }; } })
    .register({
      name: 'how long', patterns: ['how long is it', 'does it fit', 'how many slides'],
      run: ({ doc }) => {
        const s = settingsOf(doc);
        const slides = slidesOf(doc);
        const target = Math.max(3, Math.round(s.minutes / s.pace));
        return { doc, say: `${slides.length} slides for ${s.minutes} minutes (${target} at ${s.pace} minutes a slide)${slides.length > target ? ': too many' : ''}. ${referencesOf(doc).length} references.` };
      }
    });
  return reg;
}
