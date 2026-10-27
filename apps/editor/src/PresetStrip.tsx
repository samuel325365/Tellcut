// The home page's presets (spec 2026-10-23-presets-and-languages §5.1, §5.4): a row of 9:16 thumbnails under the chat box. A click
// opens the preset's dialog (Confirm there tags the composer). The preview only plays while the pointer is on a thumbnail.
import { useEffect, useRef, useState } from 'preact/hooks';
import { pickText, type PresetInfo } from '@tellcut/protocol';
import { t } from './i18n/index.ts';
import { useLang } from './i18n/lang.ts';

// scrollLeft is fractional on scaled displays and the strip has a little padding: this close to an end counts as the end
const END_SLACK = 4;
const reduced = () => { try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** a preset's picture: its poster, or one drawn from its colour and name when it has none; `play` shows the preview instead */
export function PresetPoster({ preset, play }: { preset: PresetInfo; play?: boolean }) {
  const name = pickText(preset.name, useLang()) ?? preset.id;
  if (play && preset.preview && !reduced()) return <video src={preset.preview} muted loop autoplay playsInline />;
  if (preset.poster) return <img src={preset.poster} alt="" loading="lazy" />;
  return <span class="poster-fallback" data-poster-fallback style={`background: linear-gradient(160deg, ${preset.color}, ${preset.color}66 70%, #0b0a12)`}>{name}</span>;
}

export function PresetStrip({ presets, picked, onOpen }: { presets: PresetInfo[]; picked: string | null; onOpen: (id: string) => void }) {
  const lang = useLang(), [hover, setHover] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null), [edge, setEdge] = useState({ prev: false, next: false });
  // which arrows to show: only in a direction that can still scroll
  const measure = () => {
    const el = strip.current;
    if (!el) return;
    const prev = el.scrollLeft > END_SLACK, next = el.scrollLeft + el.clientWidth < el.scrollWidth - END_SLACK;
    setEdge((e) => (e.prev === prev && e.next === next ? e : { prev, next }));
  };
  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [presets.length]);
  const page = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * Math.max(120, strip.current.clientWidth * 0.8), behavior: 'smooth' });
  // a mouse wheel moves the row sideways when it can
  const wheel = (e: WheelEvent) => {
    const el = strip.current;
    if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    // at either end the wheel is the page's: only take it over when the row would move
    if ((e.deltaY < 0 && el.scrollLeft <= END_SLACK) || (e.deltaY > 0 && el.scrollLeft + el.clientWidth >= el.scrollWidth - END_SLACK)) return;
    e.preventDefault();
    el.scrollBy({ left: e.deltaY });
  };
  if (!presets.length) return null;
  const prevTip = t('preset.scrollPrev'), nextTip = t('preset.scrollNext');
  return (
    <div class={`preset-strip-wrap${edge.prev ? ' fade-l' : ''}${edge.next ? ' fade-r' : ''}`}>
      <div class="preset-strip" data-preset-strip ref={strip} onScroll={measure} onWheel={wheel}>
        {presets.map((p) => (
          <div class="preset" key={p.id} data-preset={p.id} aria-pressed={picked === p.id ? 'true' : 'false'} role="button" aria-haspopup="dialog" tabIndex={0}
            onClick={() => onOpen(p.id)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(p.id); } }}
            onMouseEnter={() => { if (!reduced()) setHover(p.id); }} onMouseLeave={() => setHover(null)}>
            <span class="preset-thumb"><PresetPoster preset={p} play={hover === p.id} /></span>
            <span class="preset-name">{pickText(p.name, lang) ?? p.id}</span>
            {p.mine && <span class="preset-mine" data-mine>{t('preset.mine')}</span>}
          </div>
        ))}
      </div>
      {edge.prev && <button class="strip-arrow prev" data-strip-prev data-tip={prevTip} aria-label={prevTip} onClick={() => page(-1)}>‹</button>}
      {edge.next && <button class="strip-arrow next" data-strip-next data-tip={nextTip} aria-label={nextTip} onClick={() => page(1)}>›</button>}
    </div>
  );
}
