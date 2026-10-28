// The volume line, its control points and the fade handles drawn over a music/audio clip (spec §4.4). The points, handles and
// the line's hit area come only with `active` (the clip is selected, spec 2026-10-28-timeline-refresh A1): a first click selects.
import { dbToY, envelopePoints } from './envelope.ts';

export function EnvelopeLayer({ item, len, pps, h, active }: { item: any; len: number; pps: number; h: number; active: boolean }) {
  const pts = envelopePoints(item.envelope, len, pps, h), w = len * pps;
  // the gain holds flat before the first point and after the last one
  const line = [{ x: 0, y: pts[0].y }, ...pts, { x: w, y: pts[pts.length - 1].y }];
  const points = line.map((p) => `${p.x},${p.y}`).join(' ');
  const fi = item.fadeIn * pps, fo = w - item.fadeOut * pps, top = dbToY(0, h);
  return (
    <svg class="env" width={w} height={h} style={{ width: `${w}px`, height: `${h}px` }}>
      {item.fadeIn > 0 && <path class="fade" d={`M0 ${h} L${fi} ${top}`} />}
      {item.fadeOut > 0 && <path class="fade" d={`M${fo} ${top} L${w} ${h}`} />}
      <polyline class="env-line" points={points} />
      {active && <>
        <polyline class="env-hit" data-env-line points={points} />
        {item.envelope?.map((_: unknown, i: number) => <circle data-env-index={i} cx={pts[i].x} cy={pts[i].y} r={4} />)}
        <path data-fade="in" class="fade-handle" d={`M${fi} 0 l10 0 l-10 10 z`} />
        <path data-fade="out" class="fade-handle" d={`M${fo} 0 l-10 0 l10 10 z`} />
      </>}
    </svg>
  );
}
