// The shell every README figure is drawn in: one light card (it reads the same on GitHub's light
// and dark pages), the type and colours, and connectors drawn between boxes once the browser has
// laid them out (`data-link="from-id to-id [side side]"` on any element, or links passed in).

export const COLOR = {
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  muted: "#52514e",
  faint: "#8a8984",
  line: "#e3e1da",
  /** Meta's models (Muse Spark, Muse Voice Transcribe). */
  meta: "#2a78d6",
  metaSoft: "#e8f0fb",
  /** Our own code and local models. */
  local: "#3f6a50",
  localSoft: "#e9f0eb",
  /** Charts: singing and talk (validated pair). */
  sung: "#2a78d6",
  talk: "#eb6834",
};

const CSS = `
* { box-sizing: border-box; }
body { margin: 0; background: transparent; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif; color: ${COLOR.ink}; }
.figure { position: relative; width: 1200px; padding: 30px 40px 32px; background: ${COLOR.surface}; border: 1px solid ${COLOR.line}; border-radius: 20px; }
h1 { font-size: 22px; line-height: 1.25; margin: 0 0 4px; font-weight: 680; letter-spacing: -.01em; }
.sub { color: ${COLOR.muted}; font-size: 14.5px; line-height: 1.45; max-width: 1000px; }
.step { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: ${COLOR.ink}; color: white; font-size: 12.5px; font-weight: 700; align-items: center; justify-content: center; margin-right: 8px; flex: none; }
.chip { display: inline-block; font-family: "SF Mono", Menlo, monospace; font-size: 12px; padding: 3px 8px; border-radius: 6px; background: #f1f0eb; margin: 2px 3px 2px 0; }
.chip.meta { background: ${COLOR.metaSoft}; color: #1d5aa6; }
.chip.local { background: ${COLOR.localSoft}; color: #2f513c; }
.chip.bad { background: #fbe9e4; color: #a8411c; }
.label { font-size: 12px; color: ${COLOR.muted}; }
.box { position: relative; border: 1.5px solid ${COLOR.line}; background: white; border-radius: 14px; padding: 12px 14px; font-size: 14px; line-height: 1.35; }
.box b { display: block; font-size: 15px; margin-bottom: 3px; }
.box small { color: ${COLOR.muted}; font-size: 12.5px; display: block; }
.box.meta { border-color: ${COLOR.meta}; background: ${COLOR.metaSoft}; }
.box.local { border-color: ${COLOR.local}; background: ${COLOR.localSoft}; }
.tag { display: inline-block; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: 2px 7px; border-radius: 99px; margin-bottom: 6px; }
.tag.meta { background: ${COLOR.meta}; color: white; }
.tag.local { background: ${COLOR.local}; color: white; }
.tag.plain { background: #ecebe6; color: ${COLOR.muted}; }
.legend { display: flex; gap: 18px; font-size: 13px; color: ${COLOR.muted}; margin-top: 18px; }
.legend span::before { content: ""; display: inline-block; width: 11px; height: 11px; border-radius: 3px; margin-right: 7px; vertical-align: -1px; background: var(--c); }
code { font-family: "SF Mono", Menlo, monospace; font-size: .92em; background: #f1f0eb; padding: 1px 5px; border-radius: 5px; }
svg.links { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
`;

/** Draws connectors once laid out: each link is [from id, to id, from side, to side, label?, dashed?]. */
const LINKS_SCRIPT = `
function drawLinks(links) {
  const figure = document.querySelector('.figure');
  const origin = figure.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'links');
  svg.setAttribute('width', origin.width); svg.setAttribute('height', origin.height);
  svg.innerHTML = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${COLOR.faint}"/></marker></defs>';
  const point = (el, side) => {
    const r = el.getBoundingClientRect();
    const x = r.left - origin.left, y = r.top - origin.top;
    return { right: [x + r.width, y + r.height / 2], left: [x, y + r.height / 2], top: [x + r.width / 2, y], bottom: [x + r.width / 2, y + r.height] }[side];
  };
  for (const [from, to, a = 'right', b = 'left', label, dashed] of links) {
    const [x1, y1] = point(document.getElementById(from), a);
    const [x2, y2] = point(document.getElementById(to), b);
    const horizontal = a === 'right' || a === 'left';
    const bend = horizontal ? Math.max(30, Math.abs(x2 - x1) / 2) : Math.max(24, Math.abs(y2 - y1) / 2);
    const c1 = horizontal ? [x1 + (a === 'right' ? bend : -bend), y1] : [x1, y1 + (a === 'bottom' ? bend : -bend)];
    const toHorizontal = b === 'right' || b === 'left';
    const c2 = toHorizontal ? [x2 + (b === 'left' ? -bend : bend), y2] : [x2, y2 + (b === 'top' ? -bend : bend)];
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + c1 + ' ' + c2 + ' ' + (x2 - (b === 'left' ? 3 : b === 'right' ? -3 : 0)) + ' ' + (y2 - (b === 'top' ? 3 : b === 'bottom' ? -3 : 0)));
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', '${COLOR.faint}'); path.setAttribute('stroke-width', '1.6');
    if (dashed) path.setAttribute('stroke-dasharray', '5 5');
    path.setAttribute('marker-end', 'url(#arrow)');
    svg.appendChild(path);
    if (label) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', (x1 + x2) / 2); text.setAttribute('y', (y1 + y2) / 2 - 7);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '12');
      text.setAttribute('fill', '${COLOR.muted}'); text.setAttribute('paint-order', 'stroke');
      text.setAttribute('stroke', '${COLOR.surface}'); text.setAttribute('stroke-width', '5');
      text.textContent = label;
      svg.appendChild(text);
    }
  }
  figure.appendChild(svg);
}`;

export type Link = [from: string, to: string, fromSide?: string, toSide?: string, label?: string, dashed?: boolean];

/** A whole figure: only the drawing, no title (the README's text says what it shows). */
export function page(body: string, links: Link[] = []) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="figure" id="figure">${body}</div>
<script>${LINKS_SCRIPT}; drawLinks(${JSON.stringify(links)}); window.__ready = true;</script>
</body></html>`;
}

export const legend = (items: [color: string, label: string][]) =>
  `<div class="legend">${items.map(([c, l]) => `<span style="--c:${c}">${l}</span>`).join("")}</div>`;
