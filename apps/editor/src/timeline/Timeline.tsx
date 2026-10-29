import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import { allItems, beatTimes, overlapPairs, removeEnvelopePoint, resolveTimes, type AnyItem, type Track, magneticTrack, overruns } from '@tellcut/engine';
import type { Editor } from '../editor.ts';
import { useStoreSelector } from '../store.ts';
import { HEADER_W, ROW_H, ROW_H_COMPACT, STRIP_H, STRIP_MIN_H, fitHeights, RULER_H, formatTime, layoutRows, ppsFromZoom, rowAt, rulerTicks, scrollThumb, timeToX, xToTime, zoomAround, zoomFromPps } from './geometry.ts';
import { ItemBlock } from './ItemBlock.tsx';
import { Playhead } from './Playhead.tsx';
import { thumbTiles } from './thumbs.ts';
import { Wave } from './Wave.tsx';
import { EnvelopeLayer } from './EnvelopeLayer.tsx';
import { t } from '../i18n/index.ts';
import { trackLabel } from '../trackNames.ts';
import { getLang } from '../i18n/lang.ts';
import { itemLook, itemName } from './names.ts';
import type { GestureCtx } from './gestures/follow.ts';
import { startTransitionDrag, watchOverlapClick } from './gestures/transition.ts';
import { startEnvelopeDrag } from './gestures/envelope.ts';
import { startItemDrag } from './gestures/item.ts';
import { startMarquee, type Marquee } from './gestures/marquee.ts';
import { startTrackDrag } from './gestures/track.ts';
import { startScrollbarDrag } from './gestures/scrollbar.ts';
import { ToolTray } from './ToolTray.tsx';
import { trayProbe } from './tray.ts';
import { IconEye, IconEyeOff, IconLock, IconMagnet, IconSpeaker, IconSpeakerOff, IconUnlock } from '../icons.tsx';

/** a tooltip: the explanation goes in data-tip (the TooltipLayer shows it) and aria-label */
const tip = (text: string) => ({ 'data-tip': text, 'aria-label': text });
export function Timeline({ editor }: { editor: Editor }) {
  // everything but the playhead: playback must not re-render every row 60×/s
  const s = useStoreSelector(editor.store, (x) => ({ project: x.project, pps: x.pps, scroll: x.scroll, selection: x.selection, guide: x.guide,
    offline: x.offline, thumbs: x.thumbs, peaks: x.peaks, trackSize: x.layout.trackSize, collapsed: x.collapsed, proposal: x.proposal, locked: x.locked }));
  const p = s.project!;
  const times = useMemo(() => resolveTimes(p), [p]);
  // the track area's height (set by the layout, not by the rows, so filling it cannot feed back); 0 until measured
  const tracksEl = useRef<HTMLDivElement>(null), [availH, setAvailH] = useState(0);
  useEffect(() => {
    const el = tracksEl.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (el.clientHeight > 0) setAvailH(el.clientHeight); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // compact / standard are the least the rows get; with room to spare they grow to fill the track area (A1)
  const rows = useMemo(() => {
    const base = s.trackSize === 'compact' ? ROW_H_COMPACT : ROW_H, folded = new Set(s.collapsed);
    return layoutRows(p, times, availH > 0 ? fitHeights(p, times, base, folded, availH) : base, folded);
  }, [p, times, s.trackSize, s.collapsed, availH]);
  const rowsRef = useRef(rows); rowsRef.current = rows;   // drags read the rows as they are now (lanes reflow while dragging)
  const beats = useMemo(() => beatTimes(p), [p]);
  // each same-track overlap is drawn on the item on top (spec 2026-10-14 §5.3): at B's start, or inside A when A is on top
  const spans = useMemo(() => {
    const m = new Map<string, Array<{ b: string; off: number; ov: number; linked: boolean; kind: string; title: string }>>();
    for (const q of overlapPairs(p, times).values()) {
      const host = q.top === 'b' ? q.b : q.a, off = q.top === 'b' ? 0 : times.get(q.b)!.start - times.get(q.a)!.start;
      const tr = q.kind === 'video' ? (allItems(p).find((x) => x.item.id === q.b)!.item as any).transitionIn : null;
      const title = q.kind === 'video' ? t(tr && tr.type !== 'cut' ? 'ed.ov.videoEdit' : 'ed.ov.videoAdd')
        : q.kind === 'music' || q.kind === 'audio' ? t(q.linked ? 'ed.ov.xfadeOff' : 'ed.ov.xfadeOn')
        : t('ed.ov.plain');
      (m.get(host) ?? m.set(host, []).get(host)!).push({ b: q.b, off, ov: q.ov, linked: q.linked, kind: q.kind, title });
    }
    return m;
  }, [p, times]);
  // the magnetic track (spec 2026-10-15-proposals-magnetic §4): what hangs on its clips, and what a trim left outside them
  const mag = useMemo(() => magneticTrack(p), [p]);
  const over = useMemo(() => new Set(overruns(p).map(([id]) => id)), [p]);
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string | null; hung: boolean } | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent && e.key !== 'Escape') return; if (e.type === 'mousedown' && (e.target as HTMLElement).closest?.('.ctx')) return; setCtx(null); };
    addEventListener('mousedown', close); addEventListener('keydown', close);
    return () => { removeEventListener('mousedown', close); removeEventListener('keydown', close); };
  }, [ctx]);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    const el = box.current!;
    // a hidden timeline measures 0: keep the last width
    const measure = () => { const w = el.clientWidth - HEADER_W; if (w <= 0) return; setWidth(w); editor.fitTimeline?.(w - 20); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const view = { pps: s.pps, scroll: s.scroll };
  const left = () => (box.current?.getBoundingClientRect().left ?? 0) + HEADER_W;
  const tAt = (clientX: number) => xToTime(clientX - left(), view);
  const height = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 0;
  // a thin line from each item hanging on a magnetic clip to that clip's row, at the item's start
  const hangs = useMemo(() => {
    if (!mag) return [];
    const onMag = new Set((mag.items as AnyItem[]).map((c) => c.id)), mid = (id: string) => {
      const r = rows.find((x) => (x.track.items as AnyItem[]).some((i) => i.id === id));
      return r ? r.y + (r.lanes.get(id) ?? 0) * r.laneH + r.laneH / 2 : null;
    };
    const out: Array<{ id: string; t: number; y0: number; y1: number }> = [];
    for (const r of rows) for (const it of r.track.items as AnyItem[]) {
      if (it.parent === undefined || !onMag.has(it.parent)) continue;
      const a = mid(it.id), b = mid(it.parent);
      if (a !== null && b !== null) out.push({ id: it.id, t: times.get(it.id)!.start, y0: Math.min(a, b), y1: Math.max(a, b) });
    }
    return out;
  }, [mag, rows, times]);
  // right-click: 交給 Agent on an item or on empty space (spec 2026-10-16-right-click-claude §2.1); detach for hung items
  const onCtx = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.('[data-item-id]') as HTMLElement | null, id = el?.dataset.itemId;
    const it = id ? allItems(p).find((x) => x.item.id === id)?.item : undefined;
    e.preventDefault();
    const tr = id ? p.tracks.find((x) => (x.items as AnyItem[]).some((i) => i.id === id)) : undefined;
    const hung = it?.parent !== undefined && !(tr && s.locked.includes(tr.id));   // anything hanging on a clip can be unhooked, unless locked
    setCtx({ x: e.clientX, y: e.clientY, id: it?.id ?? null, hung });
  };

  // Ctrl+wheel zooms, Shift+wheel (or a sideways swipe) scrolls time; a plain wheel scrolls the tracks up and down
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) { e.preventDefault(); editor.setView(zoomAround(view, e.deltaY < 0 ? 1.25 : 0.8, e.clientX - left())); return; }
    const dx = e.shiftKey ? e.deltaX || e.deltaY : e.deltaX;
    if (!dx) return;
    e.preventDefault();
    editor.setView({ scroll: s.scroll + dx / s.pps });
  };
  const scrubFrom = (e: MouseEvent) => {
    if (e.button !== 0) return;
    editor.seek(tAt(e.clientX));
    const move = (m: MouseEvent) => editor.seek(tAt(m.clientX));
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  };

  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const rowsEl = useRef<HTMLDivElement>(null);
  const lockedSet = new Set(s.locked);
  const gesture = (): GestureCtx => ({ editor, p, times, rows: () => rowsRef.current, view, rowsEl: rowsEl.current!, selection: s.selection, tAt, locked: lockedSet });
  const onRowsDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const g = gesture();
    if (startTransitionDrag(e, g)) return;
    watchOverlapClick(e, g);
    if (startEnvelopeDrag(e, g) || startItemDrag(e, g)) return;
    startMarquee(e, g, setMarquee);
  };

  // double-click: a volume point is removed; any other spot of an item auditions it
  const [drop, setDrop] = useState<number | null>(null);   // y of the insertion line while a track is dragged
  const trackDrag = (e: MouseEvent, track: Track) => startTrackDrag(e, gesture(), track, setDrop);
  const deleteTrack = (tr: Track) => {
    const own = (tr.items as AnyItem[]).map((i) => i.id), doomed = new Set(own), all = allItems(p);
    // items on other tracks parented (directly or not) to this track's items go with them
    for (let grew = true; grew;) { grew = false; for (const x of all) if (x.item.parent && doomed.has(x.item.parent) && !doomed.has(x.item.id)) { doomed.add(x.item.id); grew = true; } }
    const more = doomed.size - own.length;
    if (doomed.size && !confirm(t('ed.trackDelConfirm', { name: trackLabel(tr.name ?? tr.id), n: own.length, more: more ? t('ed.trackDelMore', { m: more }) : '' }))) return;
    editor.removeTrack(tr.id);
  };
  const mine = new Set(['core', ...p.meta.plugins]), lang = getLang(), reg = editor.registry;
  const kinds: Array<[string, string]> = [['video', 'Video track'], ['overlay', 'Effects track'],
    ...((editor.registry?.itemTypes?.() ?? []).some((t: any) => t.kind === 'scene' && mine.has(t.type.split('.')[0])) ? [['scene', 'Scene track'] as [string, string]] : []),
    ['music', 'Music track'], ['audio', 'Audio track'], ['sfx', 'SFX track']];

  const onRowsDblClick = (e: MouseEvent) => {
    const target = e.target as Element, pt = target.closest('[data-env-index]'), itemEl = target.closest<HTMLElement>('[data-item-id]');
    if (!itemEl) return;
    if (pt) { editor.apply((d: any) => removeEnvelopePoint(d, { id: itemEl.dataset.itemId!, index: Number(pt.getAttribute('data-env-index')) })); return; }
    if (target.closest('[data-env-line], [data-fade]')) return;
    // Shift: the finished video from the item's start; otherwise the item's raw material alone (audition.ts)
    if (e.shiftKey) { const tm = times.get(itemEl.dataset.itemId!); if (tm) { editor.seek(tm.start); editor.play(); } return; }
    editor.auditionItem(itemEl.dataset.itemId!);
  };

  // the bar under the tracks: a scrollbar over the whole project (drag the thumb, click beside it for a page) and the zoom
  const thumb = scrollThumb(view, p.meta.duration, width), span = p.meta.duration + 1;
  const onBarDown = (e: MouseEvent) => startScrollbarDrag(e, editor, { thumb, width, span, scroll: s.scroll, pps: s.pps });
  // the slider zooms around the playhead when it is in view, else around the middle
  const onZoom = (e: Event) => {
    const pps = ppsFromZoom(Number((e.target as HTMLInputElement).value)), ph = timeToX(editor.store.get().playhead, view);
    const anchor = ph >= 0 && ph <= width ? ph : width / 2;
    editor.setView({ ...zoomAround(view, pps / s.pps, anchor), pps });
  };

  const addTrackMenu = (
    <select data-add-track {...tip(t('ed.addTrackTip'))} value="" onChange={(e) => {
      const el = e.target as HTMLSelectElement, k = el.value;
      el.value = '';
      if (k) editor.addTrackOf(k as any);
    }}>
      <option value="">+ Track</option>
      {kinds.map(([k, label]) => <option value={k}>{label}</option>)}
    </select>
  );
  const zoomControls = <>
    <input type="range" data-zoom min={0} max={100} step={1} value={Math.round(zoomFromPps(s.pps))} {...tip(t('ed.zoomTip'))} onInput={onZoom as any} />
    <button data-zoom-fit {...tip(t('ed.zoomFitTip'))} onClick={() => editor.zoomToFit()}>⇔</button>
  </>;

  return (
    <section class="timeline" ref={box} onWheel={onWheel as any} onMouseDownCapture={dropTextSelection as any}>
      <TrayBox editor={editor} addTrack={addTrackMenu} zoom={zoomControls} />
      <div class="ruler" data-ruler style={{ height: `${RULER_H}px` }} onMouseDown={scrubFrom as any}>
        {rulerTicks(view, width).map((k) => (
          <span class={k.major ? 'tick major' : 'tick'} style={{ left: `${HEADER_W + timeToX(k.t, view)}px` }}>{k.major ? formatTime(k.t) : ''}</span>
        ))}
      </div>
      {/* only the tracks scroll vertically: the ruler stays on top (small screens could not reach the lower tracks) */}
      <div class="tracks" data-tracks ref={tracksEl}>
      <div class="rows" ref={rowsEl} style={{ height: `${height}px` }} onMouseDown={onRowsDown as any} onDblClick={onRowsDblClick as any} onContextMenu={onCtx as any}>
        {beats.map((b) => { const x = timeToX(b, view); return x >= 0 && x <= width ? <span class="beat" style={{ left: `${HEADER_W + x}px` }} /> : null; })}
        {rows.map((r) => (
          <div class={`row k-${r.track.kind}${s.collapsed.includes(r.track.id) ? ' collapsed' : ''}${lockedSet.has(r.track.id) ? ' locked' : ''}`} data-row={r.track.id} data-track-id={r.track.id} style={{ top: `${r.y}px`, height: `${r.h}px` }}>
            <div class="head" style={{ width: `${HEADER_W}px` }}>
              <span class="grip" data-track-grip={r.track.id} {...tip(t('ed.gripTip'))} onMouseDown={(e) => trackDrag(e as any, r.track)}>⋮⋮</span>
              <span class="tname" {...tip(t('ed.tnameTip', { name: trackLabel(r.track.name ?? r.track.id) }))}
                onMouseDown={(e) => e.stopPropagation()} onClick={(e) => editor.toggleCollapse(r.track.id, e.shiftKey)}>{trackLabel(r.track.name ?? r.track.id)}</span>
              <span class="bus">
                {r.track.kind === 'video' && <button class={`icon${(r.track as any).magnetic ? ' on' : ''}`} data-magnet {...tip(t('ed.magnetTip'))}
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => editor.toggleMagnetic(r.track.id)}><IconMagnet size={13} /></button>}
                {(() => {
                  // a picture track's mute hides it (eye), a sound track's silences it (speaker)
                  const pic = r.track.kind === 'scene' || r.track.kind === 'video' || r.track.kind === 'overlay', off = !!r.track.muted;
                  const Icon = pic ? (off ? IconEyeOff : IconEye) : (off ? IconSpeakerOff : IconSpeaker);
                  return <button class={`icon${off ? ' on' : ''}`} data-mute data-icon={pic ? 'eye' : 'speaker'} {...tip(t(pic ? 'ed.hideTip' : 'ed.muteTip'))}
                    onMouseDown={(e) => e.stopPropagation()} onClick={() => editor.toggleTrack(r.track.id, 'muted')}><Icon size={13} /></button>;
                })()}
                <button class={`icon${lockedSet.has(r.track.id) ? ' on' : ''}`} data-lock {...tip(t('ed.lockTip'))} onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => editor.toggleLock(r.track.id)}>{lockedSet.has(r.track.id) ? <IconLock size={13} /> : <IconUnlock size={13} />}</button>
                {'gain' in r.track && <>
                  <button data-solo class={(r.track as any).solo ? 'on' : ''} {...tip(t('ed.soloTip'))} onMouseDown={(e) => e.stopPropagation()} onClick={() => editor.toggleTrack(r.track.id, 'solo')}>S</button>
                  <input data-bus-gain type="number" step={0.5} value={(r.track as any).gain ?? 0} {...tip(t('ed.gainTip'))} onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => editor.setTrack(r.track.id, { gain: Number((e.target as HTMLInputElement).value) })} />
                </>}
              </span>
              <button class="tdel" data-track-delete={r.track.id} disabled={lockedSet.has(r.track.id)} {...tip(t('ed.trackDelTip'))} onMouseDown={(e) => e.stopPropagation()} onClick={() => deleteTrack(r.track)}>×</button>
            </div>
            <div class="lane" style={{ left: `${HEADER_W}px` }}>
              {(r.track.items as AnyItem[]).map((it) => {
                const tm = times.get(it.id)!;
                const x = it as any, len = tm.end - tm.start, h0 = r.laneH - 4, lane = r.lanes.get(it.id) ?? 0;
                const strip = (r.track.kind === 'video' || r.track.kind === 'audio' || r.track.kind === 'music') && h0 >= STRIP_MIN_H, h = strip ? h0 - STRIP_H : h0;
                let media: any = null;
                if (r.track.kind === 'video' && s.thumbs[x.source]) {
                  const info = s.thumbs[x.source];
                  media = thumbTiles({ in: x.in, speed: x.speed, len, pps: s.pps, rowH: h, info }).map((t) =>
                    <span class="thumb" style={{ left: `${t.x}px`, width: `${t.w}px`, backgroundImage: `url(${info.url})`, backgroundPosition: t.bg, backgroundSize: t.size }} />);
                } else {
                  const peaks = r.track.kind === 'audio' ? s.peaks[`source:${x.source}`] : r.track.kind === 'music' ? s.peaks[`media:${x.media}`] : undefined;
                  if (peaks) media = <Wave info={peaks} from={x.in} dur={len * (x.rate ?? 1)} width={len * s.pps} height={h} />;
                  if (r.track.kind === 'audio' || r.track.kind === 'music') media = <>{media}<EnvelopeLayer item={x} len={len} pps={s.pps} h={h} active={s.selection.includes(it.id) && !lockedSet.has(r.track.id)} /></>;
                }
                return <ItemBlock key={it.id} item={it} track={r.track} name={itemName(it, r.track.kind, reg, lang)} look={itemLook(it, r.track.kind, reg)} strip={strip} media={media} left={timeToX(tm.start, view)} top={lane * r.laneH} width={len * s.pps} height={h0}
                  selected={s.selection.includes(it.id)} offline={'source' in it && s.offline.includes(x.source)}
                  marks={[s.proposal?.changed.includes(it.id) ? 'proposed' : '', over.has(it.id) ? 'hanging' : ''].filter(Boolean).join(' ')}>
                  {r.track.kind === 'video' && x.transitionIn && x.transitionIn.type !== 'cut' && x.transitionIn.dur > 0 &&
                    <span class={`trans t-${x.transitionIn.type}`} data-transition={it.id} style={{ width: `${Math.max(10, x.transitionIn.dur * s.pps)}px` }}
                      {...tip(t('ed.transTip', { kind: t(x.transitionIn.type === 'slide' ? 'ed.transSlide' : 'ed.transDissolve'), dur: x.transitionIn.dur }))}>
                      {x.transitionIn.type === 'slide' ? '➜' : '◢'}<i data-transition-edge /></span>}
                  {(spans.get(it.id) ?? []).map((o) => (
                    <span class={`overlap${o.linked ? ' linked' : ''}${o.linked && (o.kind === 'music' || o.kind === 'audio') ? ' xfade' : ''}${o.kind === 'video' || o.kind === 'music' || o.kind === 'audio' ? '' : ' inert'}`} data-overlap={o.b}
                      {...tip(o.title)} style={{ left: `${o.off * s.pps}px`, width: `${Math.max(12, o.ov * s.pps)}px`, '--w': `${o.ov * s.pps}px` }}><b class="top-mark">▲</b></span>
                  ))}</ItemBlock>;
              })}
            </div>
          </div>
        ))}
        {hangs.map((h) => <span class="hang" data-hang={h.id} style={{ left: `${HEADER_W + timeToX(h.t, view)}px`, top: `${h.y0}px`, height: `${Math.max(1, h.y1 - h.y0)}px` }} />)}
        {drop !== null && <span class="track-drop" style={{ top: `${drop}px` }} />}
        {s.guide !== null && <span class="guide" style={{ left: `${HEADER_W + timeToX(s.guide, view)}px` }} />}
        {marquee && <span class="marquee" style={{ left: `${HEADER_W + Math.min(marquee.x0, marquee.x1)}px`, top: `${Math.min(marquee.y0, marquee.y1)}px`, width: `${Math.abs(marquee.x1 - marquee.x0)}px`, height: `${Math.abs(marquee.y1 - marquee.y0)}px` }} />}
      </div>
      </div>
      {ctx && <div class="ctx" style={{ left: `${ctx.x}px`, top: `${ctx.y}px` }}>
        <button onClick={() => { editor.openAsk(ctx.id ?? undefined); setCtx(null); }}>Ask Agent…</button>
        {ctx.hung && <button onClick={() => { editor.detach(ctx.id!); setCtx(null); }}>Detach</button>}
      </div>}
      <div class="hbar" data-hbar>
        <div class="zoom" style={{ width: `${HEADER_W}px` }} />
        <div class="hscroll" data-hscroll {...tip(t('ed.hscrollTip'))} onMouseDown={onBarDown as any}>
          <span class="hthumb" data-hthumb style={{ left: `${thumb.left}px`, width: `${thumb.width}px` }} />
        </div>
      </div>
      <Playhead editor={editor} onGrab={scrubFrom} width={width} />
    </section>
  );
}

/** A press on the timeline lets go of text selected elsewhere (chat, help…): the clips hold mousedown's default back, so the
 *  selection would stay and Ctrl+C would copy that text instead of the clips (keys.ts clipboardFree). */
function dropTextSelection() { const sel = getSelection(); if (sel && !sel.isCollapsed) sel.removeAllRanges(); }

/** The tray subscribes on its own: it needs the playhead (what is under it); while playing it redraws only when the
 *  playhead crosses a cut point (trayProbe), not every frame. */
function TrayBox({ editor, addTrack, zoom }: { editor: Editor; addTrack: any; zoom: any }) {
  const s = useStoreSelector(editor.store, (x) => ({ project: x.project, selection: x.selection, layout: x.layout, locked: x.locked, playhead: x.playing && x.project ? trayProbe(x.project, x.playhead) : x.playhead }));
  const skip = useMemo(() => new Set(s.locked), [s.locked]);
  return <ToolTray editor={editor} s={s} skip={skip} addTrack={addTrack} zoom={zoom} />;
}
