// The media panel's Audio page (spec 2026-11-10-media-panel-visual §2): a piece of music or narration is a wide card, its name,
// length and tempo over its whole waveform (the analysis' peaks; a grey line until they are known), with ▶ to listen; a sound
// effect is a small card with its group's sign. Sound effects are made by code and have no waveform of their own to show.
import type { PeakInfo } from '../store.ts';
import { Wave } from '../timeline/Wave.tsx';
import { formatTime } from '../timeline/geometry.ts';

/** a sign per sound effect group (protocol SFX_CATEGORY), for the small cards */
const SFX_SIGN: Record<string, string> = { alert: '!', chime: '♪', hit: '●', move: '➜', paper: '✎', life: '☕' };
export const sfxSign = (category?: string) => SFX_SIGN[category ?? ''] ?? '♫';

/** the waveform drawn this wide (the card stretches it to its own width) */
const WAVE_W = 260, WAVE_H = 22;

export function SoundCard(p: { name: string; len?: number; bpm?: number; peaks?: PeakInfo; cls: string; attrs: Record<string, unknown>; listen: () => void; onPress: (e: MouseEvent) => void }) {
  return (
    <button {...p.attrs} class={`${p.cls} snd`} onMouseDown={p.onPress as any}>
      <span class="snd-head">
        <span class="snd-play" role="button" data-listen onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); p.listen(); }}>▶</span>
        <span class="snd-name">{p.name}</span>
        <small>{[p.len ? formatTime(p.len) : '', p.bpm ? `${Math.round(p.bpm)} BPM` : ''].filter(Boolean).join(' · ')}</small>
      </span>
      <span class="snd-wave">{p.peaks && p.len ? <Wave info={p.peaks} from={0} dur={p.len} width={WAVE_W} height={WAVE_H} /> : <span class="wave-none" />}</span>
    </button>
  );
}
