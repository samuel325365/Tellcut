// Right-hand panel (spec §4.1): fields of the one selected item; plugin params come from their ParamDefs.
import { useEffect } from 'preact/hooks';
import { allItems, paramDefault, resolveTheme, resolveTimes, restackTarget, soundFilePath, transitionFallbacks, type AnyItem, type Track } from '@tellcut/engine';
import { handleOf } from '@tellcut/protocol';
import type { EditorState } from './store.ts';
import { liveLinks } from './editor/library.ts';
import { t } from './i18n/index.ts';
import { tip } from './tip.ts';
import { keyWords } from './platform.ts';
import { CheckField, NumberField, ParamField, SelectField, TextField } from './fields.tsx';
import { CaptionTemplates } from './CaptionTemplates.tsx';
import { BlockTemplates } from './BlockTemplates.tsx';
import { LookPicker } from './LookPicker.tsx';
import { blockText } from './i18n/blocks.ts';
import { paramText } from './i18n/params.ts';
import { fallbackNote, retype, TRANSITION_MENU, usesCentre, usesDir } from './transitions.ts';
import { WindowFields } from './WindowFields.tsx';

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function PropertiesPanel({ editor, s }: { editor: any; s: EditorState }) {
  // the look pickers' pictures (the gallery's); before the early returns below, so the hooks run in the same order every render
  useEffect(() => { void editor.loadBlockThumbs?.(); }, []);
  const p = s.project!;
  const notice = s.notice && <p class="notice" data-notice>{s.notice}</p>;
  if (s.selection.length !== 1) return <aside class="props">{notice}<p class="hint">{s.selection.length ? t('ed.propsMany', { n: s.selection.length }) : t('ed.propsNone')}</p></aside>;
  const found = allItems(p).find((x) => x.item.id === s.selection[0]);
  if (!found) return <aside class="props">{notice}</aside>;
  const { track, item } = found as { track: Track; item: AnyItem };
  const it = item as any, id = it.id, handle = it.type && handleOf(it.type);
  const up = (k: string) => (v: unknown) => editor.update(id, { [k]: v });
  const cropOn = (w: unknown) => (s.crop?.itemId === id && s.crop?.which === w ? 'on' : '');
  const common = <>
    <h3>{it.label ?? id} <small>{track.kind}</small>{handle && <small class="handle" data-handle={handle} {...tip(t('ed.handleTip', { type: it.type }))}>{handle}</small>}
      {typeof it.type === 'string' && it.type.startsWith('fx.') && editor.registry?.item(it.type) && !liveLinks(s).some((l) => l.types.includes(it.type)) && <button class="lib-star" data-props-save-block {...tip(t('lib.saveTip'))} onClick={() => editor.openSaveBlock(it.type)}>☆</button>}</h3>
    <TextField label="Label" name="label" value={it.label} onCommit={(v) => editor.update(id, { label: v || undefined })} />
    <NumberField label="Start (s)" name="start" value={it.start} onCommit={up('start')} />
    <NumberField label="End (s)" name="end" value={it.end} onCommit={up('end')} />
  </>;
  // pictures only: one layer up or down past the nearest overlapping item of the same track (spec 2026-10-14 §5.3)
  const layers = (track.kind === 'video' || track.kind === 'scene' || track.kind === 'overlay') && (
    <div class="layer-buttons" data-field="layer">
      <span>Layer</span>
      <button data-restack="up" disabled={restackTarget(p, id, 'up') < 0} {...tip(keyWords('Ctrl+]'))} onClick={() => editor.restack(id, 'up')}>Move up</button>
      <button data-restack="down" disabled={restackTarget(p, id, 'down') < 0} {...tip(keyWords('Ctrl+['))} onClick={() => editor.restack(id, 'down')}>Move down</button>
    </div>
  );
  let body: any = null;
  if (track.kind === 'video') {
    const grades = Object.keys(editor.registry?.grades ?? {}), image = p.sources[it.source]?.kind === 'image';
    // drawn as a dissolve instead (a reveal on a shaped clip, a push, zoom or whip off the whole picture): said under the menu
    const fallback = it.transitionIn && it.transitionIn.type !== 'cut' ? transitionFallbacks(p).get(id) : undefined;
    // a photo has no media time (spec 2026-10-14 §5): no in-point, speed, freeze or frame interpolation
    body = <>
      <SelectField label="Source" name="source" value={it.source} options={Object.keys(p.sources).map((x) => [x, x])} onCommit={up('source')} />
      {!image && <>
        <NumberField label="In (s)" name="in" value={it.in} onCommit={up('in')} />
        <NumberField label="Speed" name="speed" value={it.speed} step={0.05} min={0.0625} max={16} onCommit={up('speed')} />
      </>}
      <SelectField label="Grade" name="grade" value={it.grade ?? ''} options={[['', 'None'], ...grades.map((g) => [g, g] as [string, string])]} onCommit={(v) => editor.update(id, { grade: v || null })} />
      <SelectField label="Transition" name="transition" value={it.transitionIn?.type ?? 'cut'} options={TRANSITION_MENU}
        onCommit={(v) => editor.update(id, { transitionIn: retype(it.transitionIn, v) })} />
      {fallback && <p class="hint" data-transition-note={fallback.why}>{fallbackNote(fallback.type, fallback.why)}</p>}
      {it.transitionIn && <NumberField label="Transition length (s)" name="transitionDur" value={it.transitionIn.dur} onCommit={(v) => editor.update(id, { transitionIn: { ...it.transitionIn, dur: v ?? 0 } })} />}
      {it.transitionIn && usesDir(it.transitionIn.type) && <SelectField label="Direction" name="transitionDir" hint={t('ed.transDirHint')} value={it.transitionIn.dir ?? 'l'}
        options={[['l', 'From left'], ['r', 'From right'], ['u', 'From top'], ['d', 'From bottom']]}
        onCommit={(v) => editor.update(id, { transitionIn: { ...it.transitionIn, dir: v } })} />}
      {it.transitionIn && usesCentre(it.transitionIn.type) && (['x', 'y'] as const).map((k) =>
        <NumberField key={k} label={`Centre ${k.toUpperCase()}`} name={`transition${k.toUpperCase()}`} hint={t(k === 'x' ? 'ed.transCentreXHint' : 'ed.transCentreYHint')} value={it.transitionIn[k] ?? 0.5} step={0.01} min={0} max={1}
          onCommit={(v) => { const { [k]: _, ...rest } = it.transitionIn; editor.update(id, { transitionIn: v == null ? rest : { ...rest, [k]: Math.min(1, Math.max(0, v)) } }); }} />)}
      {!image && <>
        <NumberField label="Freeze (s)" name="freezeAt" value={it.freezeAt ?? undefined} onCommit={(v) => editor.update(id, { freezeAt: v ?? null })} />
        <SelectField label="Slow-mo interpolation" name="interp" value={it.interp} options={[['none', 'None'], ['blend', 'Blend'], ['mci', 'Motion compensated']]} onCommit={up('interp')} />
      </>}
      <NumberField label="Opacity" name="opacity" value={it.opacity ?? 1} step={0.05} min={0} max={1} onCommit={up('opacity')} />
      <WindowFields it={it} update={(patch) => editor.update(id, patch)} />
      {!image && <>
        <CheckField label="Stabilize (applied on export)" name="stabilize" value={!!it.stabilize} onCommit={(v) => editor.update(id, { stabilize: v ? { smoothing: 20, zoom: 3 } : undefined })} />
        {it.stabilize && <>
          <NumberField label="Smoothing (frames)" name="stabSmoothing" value={it.stabilize.smoothing} min={1} max={100} onCommit={(v) => editor.update(id, { stabilize: { ...it.stabilize, smoothing: v ?? 20 } })} />
          <NumberField label="Zoom %" name="stabZoom" value={it.stabilize.zoom} min={0} max={20} onCommit={(v) => editor.update(id, { stabilize: { ...it.stabilize, zoom: v ?? 3 } })} />
        </>}
      </>}
      {it.defocus
        ? <div class="field-group" data-group="defocus">
            <span>Blur</span>
            <NumberField label="Start (s)" name="defocusFrom" value={it.defocus.from} onCommit={(v) => editor.update(id, { defocus: { ...it.defocus, from: v ?? 0 } })} />
            <NumberField label="End (s)" name="defocusTo" value={it.defocus.to} onCommit={(v) => editor.update(id, { defocus: { ...it.defocus, to: v ?? 0 } })} />
            <NumberField label="Start px" name="defocusPx0" value={it.defocus.px0 ?? 0} min={0} onCommit={(v) => editor.update(id, { defocus: { ...it.defocus, px0: v || undefined } })} />
            <NumberField label="End px" name="defocusPx" value={it.defocus.px} min={0} onCommit={(v) => editor.update(id, { defocus: { ...it.defocus, px: v ?? 0 } })} />
            <button data-del-defocus onClick={() => editor.update(id, { defocus: undefined })}>Remove blur</button>
          </div>
        : <button data-add-defocus onClick={() => editor.update(id, { defocus: { from: 0, to: r3(it.end - it.start), px: 8 } })}>Add blur</button>}
      <div class="field-group" data-group="shake">
        <span>Shake</span>
        {(it.shake ?? []).map((sh: any, i: number) => {
          const set = (k: string, v: number | undefined) => editor.update(id, { shake: it.shake.map((x: any, j: number) => (j === i ? { ...x, [k]: v ?? x[k] } : x)) });
          return <div class="shake-row" key={i}>
            <NumberField label="Start (s)" name={`shakeAt-${i}`} value={sh.at} onCommit={(v) => set('at', v)} />
            <NumberField label="Length (s)" name={`shakeDur-${i}`} value={sh.dur} onCommit={(v) => set('dur', v)} />
            <NumberField label="Strength px" name={`shakePx-${i}`} value={sh.px} onCommit={(v) => set('px', v)} />
            <button data-del-shake={i} onClick={() => editor.update(id, { shake: it.shake.length > 1 ? it.shake.filter((_: any, j: number) => j !== i) : undefined })}>✕</button>
          </div>;
        })}
        <button data-add-shake onClick={() => editor.update(id, { shake: [...(it.shake ?? []), { at: r3(Math.min(Math.max(0, editor.store.get().playhead - resolveTimes(p).get(id)!.start), Math.max(0, it.end - it.start - 0.4))), dur: 0.4, px: 12, hz: 18 }] })}>+ Shake (at playhead)</button>
      </div>
      <div class="crop-buttons" data-field="crop">
        <span>Ken Burns crop</span>
        <button data-crop="from" class={cropOn('from')} onClick={() => editor.enterCrop('from')}>From</button>
        {(it.crop.keys ?? []).map((k: any, i: number) => <span class="crop-key" key={i}>
          <button data-crop={i} class={cropOn(i)} onClick={() => editor.enterCrop(i)}>{`${k.t.toFixed(2)}s`}</button>
          <button data-crop-del={i} {...tip(t('ed.cropDelTip'))} onClick={() => editor.removeCropKey(i)}>✕</button>
        </span>)}
        <button data-crop="to" class={cropOn('to')} onClick={() => editor.enterCrop('to')}>To</button>
        <button data-crop-add {...tip(t('ed.cropAddTip'))} onClick={() => editor.addCropKey()}>+ Keyframe</button>
      </div>
      <SelectField label="Crop easing" name="cropEase" value={it.crop.ease ?? 'linear'} options={[['linear', 'Linear'], ['in', 'Ease in'], ['out', 'Ease out'], ['inOut', 'Ease in-out']]}
        onCommit={(v) => { const { ease: _, ...rest } = it.crop; editor.update(id, { crop: v === 'linear' ? rest : { ...rest, ease: v } }); }} />
      {!image && p.sources[it.source]?.audio !== false && <button data-speech-captions {...tip(t('ed.speechTip'))} onClick={() => void editor.speechCaptions(id)}>Captions from speech</button>}
    </>;
  } else if (track.kind === 'music' || track.kind === 'audio') {
    body = <>
      <NumberField label="Volume (dB)" name="gain" value={it.gain} step={0.5} min={-60} max={12} onCommit={up('gain')} />
      <NumberField label="Fade in (s)" name="fadeIn" value={it.fadeIn} onCommit={up('fadeIn')} />
      <NumberField label="Fade out (s)" name="fadeOut" value={it.fadeOut} onCommit={up('fadeOut')} />
      <NumberField label="In (s)" name="in" value={it.in} onCommit={up('in')} />
      {track.kind === 'audio' && <NumberField label="Rate" name="rate" value={it.rate} step={0.05} min={0.25} max={4} onCommit={up('rate')} />}
      <CheckField label="Mute" name="muted" value={!!it.muted} onCommit={(v) => editor.update(id, { muted: v || undefined })} />
      {track.kind === 'audio' && <button data-speech-captions {...tip(t('ed.speechTip'))} onClick={() => void editor.speechCaptions(id)}>Captions from speech</button>}
    </>;
  } else {
    const defs = track.kind === 'sfx' ? editor.registry?.sfx(it.type)?.params : editor.registry?.item(it.type)?.params;
    const templates = track.kind === 'sfx' ? undefined : editor.registry?.item(it.type)?.templates;
    const variants = track.kind === 'sfx' ? undefined : editor.registry?.item(it.type)?.variants;
    // the param that picks the block's look (engine variants.ts): a picker of its looks' pictures instead of a plain menu; the label
    // stays English as every field's, the looks' names and sentences follow the UI language
    const lookField = (def: any) => {
      const v = it.params?.[def.key] ?? paramDefault(def, resolveTheme(p.meta.theme, p.meta));
      const tiles = variants.list.map((x: any) => { const w = blockText(`${it.type}@${x.value}`, x); return { key: x.value, label: w.label, doc: w.doc, thumb: editor.lookThumb?.(it.type, 'variant', x.value) }; });
      return <div data-param={def.key}><LookPicker name={def.key} label={paramText(it.type, def.key, def.label, 'en').name} hint={paramText(it.type, def.key, def.label).hint}
        tiles={tiles} current={String(v)} fallback={String(v)} onPick={(x) => editor.updateParam(id, def.key, x)} /></div>;
    };
    body = <>
      {track.kind !== 'sfx' && (() => {
        const tf = it.transform ?? { x: 0, y: 0, scale: 1, ox: 0.5, oy: 0.5 };
        const pct = (v: number) => Math.round(v * 1000) / 10;
        const setT = (patch: Record<string, number>) => editor.setTransform(id, { ...tf, ...patch });
        return <>
          <NumberField label="Position X (%)" name="tx" value={pct(tf.x)} step={1} onCommit={(v) => setT({ x: (v ?? 0) / 100 })} />
          <NumberField label="Position Y (%)" name="ty" value={pct(tf.y)} step={1} onCommit={(v) => setT({ y: (v ?? 0) / 100 })} />
          <NumberField label="Size (%)" name="tscale" value={pct(tf.scale)} step={5} min={5} max={1000} onCommit={(v) => setT({ scale: (v ?? 100) / 100 })} />
          {it.transform && <button data-transform-reset onClick={() => editor.setTransform(id, null)}>Reset position and size</button>}
          {tf.keys?.length ? <p class="hint" data-transform-keys>{t('ed.keysMoving', { n: tf.keys.length })}
            <button data-transform-keys-clear onClick={() => editor.setTransform(id, { ...tf, keys: [] })}>Stay at the first position</button></p> : null}
        </>;
      })()}
      {it.type === 'common.caption' && defs && <CaptionTemplates editor={editor} project={p} item={it} track={track.id} defs={defs} />}
      {it.type === 'common.heading' && defs && <CaptionTemplates key="title" kind="title" editor={editor} project={p} item={it} track={track.id} defs={defs} />}
      {/* a block's named templates (engine templates.ts): at the top of its parameters */}
      {defs && templates?.length ? <BlockTemplates type={it.type} templates={templates} thumb={(x) => editor.lookThumb?.(it.type, 'template', x)} onApply={(x) => editor.applyBlockTemplate(id, x)} /> : null}
      {track.kind === 'sfx' && <NumberField label="Volume (dB)" name="gain" value={it.gain} step={0.5} min={-60} max={12} onCommit={up('gain')} />}
      {/* a moving item (following a face): its path decides where it is; the block's own x/y are the path's anchor, so they are not offered */}
      {defs ? defs.filter((def: any) => !(it.transform?.keys?.length && (def.key === 'x' || def.key === 'y'))).map((def: any) => def.key === variants?.param ? lookField(def) : <ParamField def={def} type={it.type} value={it.params?.[def.key]} project={p} onCommit={(v) => editor.updateParam(id, def.key, v)} />)
        : track.kind === 'sfx' && soundFilePath(it) ? <p class="hint" data-sound-file>{t('ed.soundFile', { path: soundFilePath(it) ?? '' })}</p>
        : <p class="hint">{t('ed.unknownType', { type: it.type })}</p>}
    </>;
  }
  // keyed by item: field state (e.g. unparsed JSON) never carries over to another item
  return <aside class="props" data-props={id} key={id}>{notice}{common}{layers}{body}</aside>;
}
