// A video clip's picture window in Properties: where its frame sits, the shape its picture is cut to (with that shape's
// parameters), an outline and a shadow, and the corner radius. The shapes and their parameters are the engine's data
// (shapes.ts SHAPE_TYPES / SHAPE_PARAMS), so a new shape or parameter shows here without a change in this file, except its
// English label. Every change is one editor.update, so one undo step.
import { isNamedShape, OUTLINE_DEFAULT, SHADOW_DEFAULT, SHAPE_PARAMS, SHAPE_TYPES, type ShapeParam, type ShapeType } from '@tellcut/engine';
import { t, type Key } from './i18n/index.ts';
import { tip } from './tip.ts';
import { CheckField, ColorField, NumberField, SelectField, TextArea } from './fields.tsx';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** the smallest a window may be, as a fraction of the picture: smaller is no window anyone can see */
const MIN_SIZE = 0.01;

/** the menu's names: English, like the panel's other labels */
export const SHAPE_NAME: Record<ShapeType, string> = {
  circle: 'Circle', ellipse: 'Ellipse', arch: 'Arch', heart: 'Heart', star: 'Star', ngon: 'Polygon', stamp: 'Stamp', bubble: 'Speech bubble',
  blob: 'Blob', torn: 'Torn paper', brush: 'Brush stroke', slats: 'Slats', text: 'Text',
};
export const SHAPE_MENU: Array<[string, string]> = [['', 'None'], ...SHAPE_TYPES.map((x) => [x, SHAPE_NAME[x]] as [string, string])];

/** a parameter's English label; one a newer engine adds and this list does not know shows its key, capitalised */
const PARAM_LABEL: Record<string, string> = {
  points: 'Points', inner: 'Inner radius', round: 'Rounding', 'ngon.sides': 'Sides', turn: 'Turn (°)', teeth: 'Teeth', tail: 'Tail',
  seed: 'Variant', lobes: 'Lobes', wobble: 'Wobble', rough: 'Roughness', 'torn.sides': 'Torn edges', count: 'Slats', gap: 'Gap',
  angle: 'Angle (°)', text: 'Text', font: 'Font', weight: 'Weight', line: 'Line spacing',
};
const paramLabel = (type: string, key: string) => PARAM_LABEL[`${type}.${key}`] ?? PARAM_LABEL[key] ?? key.replace(/^./, (c) => c.toUpperCase());
/** a parameter's hint in the UI language: one per key, except the two meanings of `sides` (a polygon's count, paper's torn edges) */
export const paramHintKey = (type: string, key: string) => `ed.shapeP.${type === 'torn' && key === 'sides' ? 'tornSides' : key}` as Key;
const optionLabel = (o: string) => o.replace(/^./, (c) => c.toUpperCase()).replace(/-/g, ' ');
/** a step that suits the range: whole numbers for wide ranges (degrees), hundredths for the fractions */
const stepOf = (p: ShapeParam) => (p.kind === 'int' ? 1 : (p.max! - p.min!) >= 50 ? 1 : (p.max! - p.min!) >= 1 ? 0.05 : 0.01);

const EDGES = [['t', 'Top'], ['b', 'Bottom'], ['l', 'Left'], ['r', 'Right']] as const;

/** A new shape from the menu: the type alone, its parameters at their defaults ('' removes the shape); the text shape starts
 *  with a short word in the UI language, since it shows nothing without one. */
export function pickShape(type: string): Record<string, unknown> | undefined {
  if (!type) return undefined;
  return type === 'text' ? { type, text: t('ed.shapeTextDefault') } : { type };
}

/** A frame edit kept inside the picture, the typed number kept as it is where it can be: a new size moves the window back in
 *  when it would run off the far edge, a new position shrinks it (so a whole-frame clip can be moved by its X or Y first). */
export function setFrame(frame: readonly number[], k: 0 | 1 | 2 | 3, v: number): [number, number, number, number] {
  const f = [...frame] as [number, number, number, number];
  if (k >= 2) {
    f[k] = r3(clamp(v, MIN_SIZE, 1));
    f[k - 2] = r3(clamp(f[k - 2], 0, 1 - f[k]));
  } else {
    f[k] = r3(clamp(v, 0, 1 - MIN_SIZE));
    f[k + 2] = r3(clamp(f[k + 2], MIN_SIZE, 1 - f[k]));
  }
  return f;
}

export function WindowFields({ it, update }: { it: any; update: (patch: Record<string, unknown>) => void }) {
  const frame: number[] = it.frame ?? [0, 0, 1, 1];
  const whole = frame[0] === 0 && frame[1] === 0 && frame[2] === 1 && frame[3] === 1;
  const shape = it.shape, named = isNamedShape(shape) ? shape : null, polygon = Array.isArray(shape) && shape.length >= 3;
  const setParam = (key: string, v: unknown) => {
    const { [key]: _, ...rest } = named as Record<string, unknown>;
    update({ shape: v === undefined ? rest : { ...rest, [key]: v } });
  };
  const outline = it.outline as { width?: number; color?: string } | undefined;
  const sh = it.shadow === true ? {} : it.shadow || null;
  const setShadow = (key: string, v: number | undefined) => {
    const { [key]: _, ...rest } = sh as Record<string, number>;
    const next = v === undefined ? rest : { ...rest, [key]: v };
    update({ shadow: Object.keys(next).length ? next : true });
  };
  return <div class="field-group window-group" data-group="window">
    {(['X', 'Y', 'W', 'H'] as const).map((n, k) =>
      <NumberField key={n} label={`Frame ${n}`} name={`frame${n}`} hint={t(`ed.frame${n}Hint` as Key)} value={r3(frame[k])} step={0.01} min={k >= 2 ? MIN_SIZE : 0} max={1}
        onCommit={(v) => { if (v !== undefined && Number.isFinite(v)) update({ frame: setFrame(frame, k as 0 | 1 | 2 | 3, v) }); }} />)}
    <button data-frame-whole disabled={whole} {...tip(t('ed.frameWholeTip'))} onClick={() => update({ frame: [0, 0, 1, 1] })}>Whole frame</button>

    <SelectField label="Shape" name="shape" hint={t('ed.shapeHint')} value={named ? named.type : polygon ? 'custom' : ''}
      options={polygon ? [...SHAPE_MENU, ['custom', 'Custom']] : SHAPE_MENU} onCommit={(v) => { if (v !== 'custom') update({ shape: pickShape(v) }); }} />
    {polygon && <p class="hint" data-shape-custom>{t('ed.shapeCustom')}</p>}
    {named && SHAPE_PARAMS[named.type].length > 0 && <div class="sub" data-shape-params={named.type}>
      {SHAPE_PARAMS[named.type].map((p) => <ShapeParamField key={`${named.type}.${p.key}`} type={named.type} p={p} value={(named as any)[p.key]} onCommit={(v) => setParam(p.key, v)} />)}
    </div>}

    <CheckField label="Outline" name="outline" hint={t('ed.outlineHint')} value={!!outline} onCommit={(v) => update({ outline: v ? { ...OUTLINE_DEFAULT } : undefined })} />
    {outline && <div class="sub">
      <NumberField label="Width (px)" name="outlineWidth" hint={t('ed.outlineWidthHint')} value={outline.width ?? OUTLINE_DEFAULT.width} step={1} min={0.5} max={100}
        onCommit={(v) => { const { width: _, ...rest } = outline; update({ outline: v === undefined ? rest : { ...rest, width: clamp(v, 0.5, 100) } }); }} />
      <ColorField label="Colour" name="outlineColor" hint={t('ed.outlineColorHint')} value={outline.color ?? OUTLINE_DEFAULT.color}
        onCommit={(v) => { const { color: _, ...rest } = outline; update({ outline: v.trim() ? { ...rest, color: v.trim() } : rest }); }} />
    </div>}

    <CheckField label="Shadow" name="shadow" hint={t('ed.shadowHint')} value={!!sh} onCommit={(v) => update({ shadow: v ? true : undefined })} />
    {sh && <div class="sub">
      <NumberField label="Blur (px)" name="shadowBlur" hint={t('ed.shadowBlurHint')} value={sh.blur ?? SHADOW_DEFAULT.blur} step={1} min={0} max={300}
        onCommit={(v) => setShadow('blur', v === undefined ? v : clamp(v, 0, 300))} />
      <NumberField label="Drop (px)" name="shadowY" hint={t('ed.shadowYHint')} value={sh.y ?? SHADOW_DEFAULT.y} step={1} min={-300} max={300}
        onCommit={(v) => setShadow('y', v === undefined ? v : clamp(v, -300, 300))} />
      <NumberField label="Opacity" name="shadowOpacity" hint={t('ed.shadowOpacityHint')} value={sh.opacity ?? SHADOW_DEFAULT.opacity} step={0.05} min={0} max={1}
        onCommit={(v) => setShadow('opacity', v === undefined ? v : clamp(v, 0, 1))} />
    </div>}

    {/* a named shape draws its own outline, so the engine drops the radius under it: shown, but off, and the tooltip says why */}
    <NumberField label="Corner radius (px)" name="radius" hint={named ? t('ed.radiusShapeHint') : undefined} disabled={!!named} value={it.radius ?? 0} min={0}
      onCommit={(v) => update({ radius: v || undefined })} />
  </div>;
}

/** One parameter of the chosen shape, as the field its kind needs; an emptied number puts the default back (the key goes). */
function ShapeParamField({ type, p, value, onCommit }: { type: ShapeType; p: ShapeParam; value: unknown; onCommit: (v: unknown) => void }) {
  const label = paramLabel(type, p.key), hint = t(paramHintKey(type, p.key)), name = `shape-${p.key}`;
  const v = value ?? p.default;
  switch (p.kind) {
    case 'int': case 'number':
      return <NumberField label={label} name={name} hint={hint} value={v as number} step={stepOf(p)} min={p.min} max={p.max}
        onCommit={(x) => onCommit(x === undefined || !Number.isFinite(x) ? undefined : clamp(p.kind === 'int' ? Math.round(x) : x, p.min!, p.max!))} />;
    case 'enum':
      return <SelectField label={label} name={name} hint={hint} value={v as string} options={p.options!.map((o) => [o, optionLabel(o)])} onCommit={onCommit} />;
    case 'text':
      // one line, or two; spaces round a line and empty lines are dropped, the rest (too long, three lines) the schema refuses
      return <TextArea label={label} name={name} hint={hint} value={v as string ?? ''}
        onCommit={(x) => onCommit(x.replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean).join('\n'))} />;
    case 'sides': {
      const on = String(v ?? '');
      return <div class="field" data-field={name}><span data-tip={hint}>{label}</span>
        <div class="edge-boxes">{EDGES.map(([c, n]) => <label key={c} data-edge={c}>
          {/* the last edge left cannot be turned off: a torn shape tears at least one */}
          <input type="checkbox" checked={on.includes(c)} disabled={on === c}
            onChange={(e) => onCommit(EDGES.map(([x]) => x).filter((x) => (x === c ? (e.target as HTMLInputElement).checked : on.includes(x))).join(''))} />{n}</label>)}</div>
      </div>;
    }
  }
}
