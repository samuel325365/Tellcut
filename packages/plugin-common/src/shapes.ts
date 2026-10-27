// SVG helpers shared by the shape blocks (badge, burst).
import { rng } from '@tellcut/engine';

const NS = 'http://www.w3.org/2000/svg';

/** The points of a spiky star centred on (0,0): `n` spikes, tips at `outer`, valleys at `inner`; `wobble` (0–1) varies the tips from a seeded generator. */
export function spikePoints(n: number, outer: number, inner: number, rot = 0, wobble = 0, seed = 1): Array<[number, number]> {
  const r = rng(seed), pts: Array<[number, number]> = [];
  for (let i = 0; i < n * 2; i++) {
    const tip = i % 2 === 0, rad = (tip ? outer : inner) * (tip ? 1 - wobble * 0.25 * r() : 1 - wobble * 0.1 * r());
    const a = rot + (Math.PI * i) / n - Math.PI / 2;
    pts.push([+(Math.cos(a) * rad).toFixed(2), +(Math.sin(a) * rad).toFixed(2)]);
  }
  return pts;
}

/** An <svg> of `size` px square centred at its own middle (viewBox −size/2…size/2) holding one polygon. */
export function polygonSvg(): { svg: SVGSVGElement; poly: SVGPolygonElement } {
  const svg = document.createElementNS(NS, 'svg'), poly = document.createElementNS(NS, 'polygon');
  poly.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(poly);
  svg.style.overflow = 'visible';
  return { svg, poly };
}

export function setPolygon(svg: SVGSVGElement, poly: SVGPolygonElement, size: number, pts: Array<[number, number]>, fill: string, stroke: string, strokeWidth: number) {
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
  poly.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
  poly.setAttribute('fill', fill);
  poly.setAttribute('stroke', stroke);
  poly.setAttribute('stroke-width', String(strokeWidth));
}
