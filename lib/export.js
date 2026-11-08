// Exports: a self-contained HTML deck (open it in any browser and present with the arrow
// keys, on a computer or a phone) and a Markdown outline with the speaker notes.
import { LAYOUTS } from './deck.js';
import { referencesOf, settingsOf, slidesOf } from './deckdoc.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const COLOURS = ['#3a7bd5', '#e2a03f', '#2e9e6b', '#c0392b', '#8e44ad'];

export function graphSVG(g) {
  const W = 640, H = 300, L = 40, B = 40, T = 20;
  const all = g.rows.flatMap((r) => r.values);
  const max = Math.max(0, ...all), min = Math.min(0, ...all), span = max - min || 1;
  const y = (v) => T + (H - T - B) * (1 - (v - min) / span);
  const gw = (W - L - 10) / Math.max(1, g.rows.length), bw = Math.max(6, (gw - 16) / Math.max(1, g.labels.length));
  let out = `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="${esc(g.title)}"><line x1="${L}" x2="${W - 10}" y1="${y(0)}" y2="${y(0)}" stroke="#999"/>`;
  g.rows.forEach((r, gi) => {
    r.values.forEach((v, vi) => {
      const x = L + gi * gw + 8 + vi * bw;
      out += `<rect x="${x}" y="${Math.min(y(v), y(0))}" width="${bw - 3}" height="${Math.abs(y(v) - y(0))}" fill="${COLOURS[vi % COLOURS.length]}"/>`;
      out += `<text x="${x + (bw - 3) / 2}" y="${(v >= 0 ? y(v) - 4 : y(v) + 14)}" text-anchor="middle" font-size="13">${esc(v)}</text>`;
    });
    out += `<text x="${L + gi * gw + gw / 2}" y="${H - 14}" text-anchor="middle" font-size="14">${esc(r.segment)}</text>`;
  });
  out += '</svg>';
  out += `<div class="legend">${g.labels.map((l, i) => `<span style="--c:${COLOURS[i % COLOURS.length]}">${esc(l)}</span>`).join('')}</div>`;
  return out;
}

// One slide's inner HTML, for the app and the exported deck alike.
export function slideHTML(slide, { layout = 'classic', speaker = {}, total = 0 } = {}) {
  const cite = slide.refs?.length ? ` <sup class="cite">[${slide.refs.join(', ')}]</sup>` : '';
  const lay = slide.kind === 'intro' || slide.kind === 'end' ? slide.kind : layout;
  let body = '';
  if (slide.kind === 'figures' && slide.figures?.length) {
    body = `<div class="figures">${slide.figures.map((f) => `<div class="figure"><div class="value">${esc(f.value)}</div><div class="label">${esc(f.label)}</div></div>`).join('')}</div>`;
  } else if (slide.kind === 'graph' && slide.graph) {
    body = graphSVG(slide.graph);
  } else if (lay === 'statement' && slide.bullets?.length) {
    body = `<p class="statement">${esc(slide.bullets[0])}${cite}</p>`;
  } else if (slide.bullets?.length) {
    body = `<ul class="${lay === 'two-column' ? 'cols' : ''}">${slide.bullets.map((b, i) => `<li>${esc(b)}${i === slide.bullets.length - 1 ? cite : ''}</li>`).join('')}</ul>`;
  }
  const foot = [speaker.name, speaker.id ? `ID ${speaker.id}` : '', total ? `${slide.n ?? ''}/${total}` : ''].filter(Boolean).join(' · ');
  return `<div class="slide layout-${esc(lay)} kind-${esc(slide.kind)}"><h2>${esc(slide.title)}</h2>${body}<footer>${esc(foot)}</footer></div>`;
}

export const SLIDE_CSS = `
.slide { position: relative; box-sizing: border-box; width: 100%; aspect-ratio: 16 / 9; background: #fffdf8; color: #1f2430; padding: 5% 6% 7%; border-radius: 8px; overflow: hidden; font-family: system-ui, -apple-system, Segoe UI, sans-serif; container-type: inline-size; }
div.slide h2 { margin: 0 0 4cqw; font-size: 4.6cqw; line-height: 1.15; color: #23304a; }
.slide ul { margin: 0; padding-left: 1.2em; font-size: 2.9cqw; line-height: 1.45; }
.slide ul.cols { columns: 2; column-gap: 4cqw; font-size: 2.5cqw; }
.slide li { margin-bottom: 1.2cqw; break-inside: avoid; }
.slide .statement { font-size: 5.2cqw; line-height: 1.25; margin-top: 6cqw; font-weight: 600; color: #23304a; }
.slide.layout-minimal h2 { font-weight: 400; border-bottom: 3px solid #e2a03f; padding-bottom: 1.5cqw; }
.slide.layout-minimal ul { list-style: none; padding-left: 0; font-size: 3.2cqw; }
.slide.layout-intro, .slide.layout-end { display: flex; flex-direction: column; justify-content: center; text-align: center; background: linear-gradient(135deg, #23304a, #3a5a8c); color: #fff; }
.slide.layout-intro h2, .slide.layout-end h2 { color: #fff; font-size: 6.4cqw; }
.slide.layout-intro ul, .slide.layout-end ul { list-style: none; padding: 0; font-size: 3cqw; opacity: .9; }
.slide .figures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3cqw; }
.slide .figure .value { font-size: 6cqw; font-weight: 700; color: #3a7bd5; }
.slide .figure .label { font-size: 2.4cqw; color: #555; }
.slide svg.graph { width: 100%; height: auto; max-height: 30cqw; }
.slide .legend { display: flex; gap: 2cqw; justify-content: center; font-size: 2cqw; }
.slide .legend span::before { content: ''; display: inline-block; width: 1.4cqw; height: 1.4cqw; margin-right: .6cqw; background: var(--c); }
.slide sup.cite { font-size: .6em; color: #3a7bd5; }
.slide footer { position: absolute; left: 6%; right: 6%; bottom: 3%; font-size: 1.6cqw; color: #888; text-align: right; }
.slide.layout-intro footer, .slide.layout-end footer { color: #c8d2e6; }
`;

export function deckHTML(doc) {
  const s = settingsOf(doc);
  const slides = slidesOf(doc);
  const sections = slides.map((sl) => `<section data-notes="${esc(sl.notes)}" data-minutes="${sl.minutes ?? ''}">${slideHTML(sl, { layout: s.layout, speaker: s.speaker, total: slides.length })}</section>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.title)}</title>
<style>
html, body { margin: 0; height: 100%; background: #111; }
main { height: 100%; display: flex; align-items: center; justify-content: center; }
section { display: none; width: min(100vw, 177.78vh); }
section.on { display: block; }
.bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 12px; justify-content: center; padding: 6px; font: 14px system-ui; color: #bbb; }
.bar button { font: inherit; }
#notes { position: fixed; top: 0; left: 0; right: 0; background: #000c; color: #eee; font: 16px system-ui; padding: 10px 16px; display: none; }
${SLIDE_CSS}
</style></head>
<body><main>
${sections}
</main>
<div id="notes"></div>
<div class="bar"><button onclick="go(-1)">◀</button><span id="where"></span><button onclick="go(1)">▶</button><button onclick="notesOn=!notesOn;show()">Notes</button></div>
<script>
const s = [...document.querySelectorAll('section')]; let i = 0, notesOn = false;
function show() { s.forEach((x, k) => x.classList.toggle('on', k === i)); document.getElementById('where').textContent = (i + 1) + ' / ' + s.length + (s[i].dataset.minutes ? ' · ' + s[i].dataset.minutes + ' min' : ''); const n = document.getElementById('notes'); n.style.display = notesOn ? 'block' : 'none'; n.textContent = s[i].dataset.notes; }
function go(d) { i = Math.max(0, Math.min(s.length - 1, i + d)); show(); }
addEventListener('keydown', (e) => { if (['ArrowRight', 'PageDown', ' '].includes(e.key)) go(1); if (['ArrowLeft', 'PageUp'].includes(e.key)) go(-1); if (e.key === 'n') { notesOn = !notesOn; show(); } });
let x0 = null; addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }); addEventListener('touchend', (e) => { if (x0 !== null) { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); x0 = null; } });
show();
</script></body></html>
`;
}

export function outlineMarkdown(doc) {
  const s = settingsOf(doc);
  const lines = [`# ${s.title}`, ''];
  if (s.subtitle) lines.push(`*${s.subtitle}*`, '');
  const who = [s.speaker.name, s.speaker.role, s.speaker.id ? `ID ${s.speaker.id}` : ''].filter(Boolean).join(', ');
  if (who) lines.push(`Speaker: ${who}`, '');
  lines.push(`${s.minutes} minutes · ${slidesOf(doc).length} slides · ${LAYOUTS[s.layout]?.name ?? s.layout} layout`, '');
  slidesOf(doc).forEach((sl, i) => {
    lines.push(`## ${i + 1}. ${sl.title}${sl.minutes ? ` (${sl.minutes} min)` : ''}`, '');
    for (const b of sl.bullets ?? []) lines.push(`- ${b}`);
    if (sl.refs?.length) lines.push(`- Sources: ${sl.refs.map((n) => `[${n}]`).join(', ')}`);
    if (sl.notes) lines.push('', `> ${sl.notes}`);
    lines.push('');
  });
  const refs = referencesOf(doc);
  if (refs.length) { lines.push('## References', ''); refs.forEach((r, i) => lines.push(`${i + 1}. ${r.text}`)); lines.push(''); }
  return lines.join('\n');
}
