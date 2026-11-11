import { useEffect, useRef } from 'preact/hooks';
import type { PeakInfo } from '../store.ts';
import { peakSlice } from './waveform.ts';

/** The peaks of `dur` source seconds from `from`, `width` px wide; `left`: where that stretch starts in the clip (the timeline
 *  draws only what is in view: a canvas the length of a long clip at a high zoom is wider than a browser draws). */
export function Wave({ info, from, dur, width, height, left = 0 }: { info: PeakInfo; from: number; dur: number; width: number; height: number; left?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, g = c.getContext('2d');
    if (!g) return;
    const cols = Math.max(1, Math.floor(width / 2));
    c.width = cols * 2; c.height = height;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(255,255,255,.55)';
    peakSlice(info, from, dur, cols).forEach((v, i) => { const h = Math.max(1, v * height); g.fillRect(i * 2, (height - h) / 2, 1.5, h); });
  }, [info, from, dur, width, height]);
  return <canvas ref={ref} class="wave" style={{ left: `${left}px`, width: `${width}px`, height: `${height}px` }} />;
}
