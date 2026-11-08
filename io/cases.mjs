// The functions whose inputs and outputs are recorded in io/ios.txt (see io/engine.mjs).
import { bullet, slideCount, shareOut, contentFromText, figuresFromRows, pickFigures, sentencesOf } from '../lib/deck.js';

export const title = 'Presenter';

const para = (rnd) => Array.from({ length: rnd.int(2, 5) }, () => rnd.sentence()).join(' ');

export const cases = [
  { name: 'bullet', run: bullet, make: (rnd) => [`${rnd.pick(['However, ', 'In fact, ', 'The research shows that ', ''])}${rnd.words(4, 22)}.`, rnd.pick([8, 12, 16])] },
  { name: 'slideCount', run: slideCount, make: (rnd) => [rnd.pick([1, 3, 5, 10, 15, 20, 45, 60]), rnd.pick([1, 1.5, 2, 3])] },
  { name: 'shareOut', run: shareOut, make: (rnd) => [Array.from({ length: rnd.int(1, 6) }, () => rnd.int(0, 8)), rnd.int(0, 20)] },
  { name: 'contentFromText', run: contentFromText, make: (rnd) => [`# ${rnd.words(1, 3)}\n\n${para(rnd)}\n\n## ${rnd.words(1, 3)}\n\n${para(rnd)}`] },
  { name: 'sentencesOf', run: sentencesOf, make: (rnd) => [para(rnd)] },
  { name: 'figuresFromRows', run: figuresFromRows, make: (rnd) => [Array.from({ length: rnd.int(1, 6) }, () => [rnd.pick([rnd.words(1, 2), 'Total', '', 'Profit']), rnd.pick([rnd.int(0, 900), `$${rnd.int(1, 99)},${rnd.int(100, 999)}`, '', 'n/a']), rnd.pick(['', '=SUM(B1:B3)', '=B2-B3', ''])]), rnd.words(1, 2)] },
  { name: 'pickFigures', run: (figs, max) => pickFigures(figs, max), make: (rnd) => [Array.from({ length: rnd.int(0, 12) }, (_, i) => ({ label: `F${i}`, value: String(rnd.int(1, 1000)), how: rnd.chance(0.3) ? '=SUM(B1:B2)' : '', sheet: 'S' })), rnd.int(1, 8)] }
];
