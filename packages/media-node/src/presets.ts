// Presets (spec 2026-10-23-presets-and-languages §3): guides/presets/<id>/preset.md in git, projects/_presets/my-*/preset.md the
// user's own; guides/presets/shared.json the form fields every one of them has. A JSON frontmatter holds what people read (three
// languages); the body is the English prompt Claude gets. Read by the
// server (the home page, the chat) and by `check` (the length and ratios a preset asks for); the routes are apps/server/src/presets.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import type { PresetFieldInfo, PresetInfo, PresetStyleInfo } from '@tellcut/protocol';
import { TELLCUT_ROOT } from './paths.ts';

export interface PresetDirs { repo: string; user: string }
export type PresetField = Omit<PresetFieldInfo, 'options'> & { options: Array<PresetFieldInfo['options'][number] & { prompt: string }> };
export interface Preset extends Omit<PresetInfo, 'styles' | 'fields'> { prompt: string; file: string; genres: boolean; styles: Array<PresetStyleInfo & { prompt: string }>; fields: PresetField[] }

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const text = z.object({ zh: z.string(), en: z.string(), ja: z.string() }).partial().refine((x) => Object.keys(x).length > 0, 'needs a language');
// an option id may be a ratio like 9:16; `auto` is every field's own default (not chosen), never written in the file
const OPTION = /^[a-z0-9][a-z0-9:-]{0,40}$/;
const field = z.object({
  id: z.string().regex(ID), name: text, hint: text.optional(), autoHint: text.optional(), group: text.optional(), seconds: z.boolean().optional(),
  options: z.array(z.object({ id: z.string().regex(OPTION).refine((x) => x !== 'auto', 'auto is the default, not an option'), name: text, hint: text.optional(), prompt: z.string() })).min(1)
    .refine((o) => new Set(o.map((x) => x.id)).size === o.length, 'option ids repeat'),
});
const list = z.object({ zh: z.array(z.string()), en: z.array(z.string()), ja: z.array(z.string()) }).partial();
const Front = z.object({
  order: z.number().default(0), color: z.string().default('#7c4dff'), name: text, summary: text, fit: list.default({}), facts: list.default({}),
  styles: z.array(z.object({ id: z.string().regex(ID), name: text, desc: text.default({ zh: '' }), prompt: z.string(), custom: z.boolean().optional() })).default([]),
  // the API menu's ids ticked when the preset is picked (a source not installed here is skipped by the page)
  sources: z.array(z.string()).default([]),
  // a form in the dialog (spec 2026-10-24-custom-preset §3): each field starts on auto; examples are style lines for the chat box
  fields: z.array(field).default([]).refine((f) => new Set(f.map((x) => x.id)).size === f.length, 'field ids repeat'),
  examples: z.array(text).default([]),
  // what `check` compares the film with (the facts say the same in words): seconds [shortest, longest], and the ratios it may be
  length: z.tuple([z.number().positive(), z.number().positive()]).refine(([a, b]) => a <= b, 'shortest first').optional(),
  ratios: z.array(z.string().regex(/^[1-9]\d*:[1-9]\d*$/, 'like 9:16')).min(1).optional(),
  // false: the preset holds the film's whole direction, so Claude skips the genre cards (workflow.md step 3)
  genres: z.boolean().default(true),
});

/** `file`: where the preset.md is, relative to tellcut/ when inside it (Claude reads it from there) */
const shown = (f: string) => { const r = relative(TELLCUT_ROOT, f); return r.startsWith('..') || r.includes(':') ? f : r.split(sep).join('/'); };

/** One preset.md; throws with the reason when it is not one. */
export function parsePreset(src: string, id: string, mine: boolean, dir?: string): Preset {
  // PowerShell 5.1 saves UTF-8 with a BOM: a hand-edited file must still read
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) throw new Error('no frontmatter (--- … ---)');
  let raw: unknown;
  try { raw = JSON.parse(m[1]); } catch (e) { throw new Error(`frontmatter is not JSON: ${(e as Error).message}`); }
  const f = Front.safeParse(raw);
  if (!f.success) throw new Error(f.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const has = (name: string) => !!dir && existsSync(join(dir, name));
  return { id, mine, ...f.data, prompt: m[2].trim(), file: dir ? shown(join(dir, 'preset.md')) : '',
    poster: has('poster.jpg') ? `/api/presets/${id}/poster.jpg` : null, preview: has('preview.webm') ? `/api/presets/${id}/preview.webm` : null };
}

function readDir(root: string, mine: boolean): Preset[] {
  let names: string[];
  try { names = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; }
  const out: Preset[] = [];
  for (const id of names.sort()) {
    if (!ID.test(id) || (mine && !id.startsWith('my-'))) { if (mine) console.warn(`preset ${join(root, id)}: a preset of your own needs an id like my-name; skipped`); continue; }
    const file = join(root, id, 'preset.md');
    if (!existsSync(file)) continue;
    try { out.push(parsePreset(readFileSync(file, 'utf8'), id, mine, join(root, id))); }
    catch (e) { console.warn(`preset ${file}: ${(e as Error).message}; skipped`); }
  }
  return out;
}

/** guides/presets/shared.json: the fields every preset's form starts with (Making › Effects), so they are written once */
export const SHARED_FILE = 'shared.json';
const Shared = z.object({ fields: z.array(field).default([]) });
function sharedFields(root: string): PresetField[] {
  const file = join(root, SHARED_FILE);
  if (!existsSync(file)) return [];
  try { return Shared.parse(JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''))).fields; }
  catch (e) { console.warn(`${file}: ${(e as Error).message}; the shared fields are left out`); return []; }
}

/** every preset: the repo's by order, then the user's by id (read afresh each time: a few small files); each with the shared
 *  fields first, unless it has a field of the same id itself */
export function loadPresets(dirs: PresetDirs): Preset[] {
  const shared = sharedFields(dirs.repo);
  return [...readDir(dirs.repo, false).sort((a, b) => a.order - b.order), ...readDir(dirs.user, true)]
    .map((p) => ({ ...p, fields: [...shared.filter((s) => !p.fields.some((f) => f.id === s.id)), ...p.fields] }));
}

export function findPreset(dirs: PresetDirs, id: string): Preset | null {
  if (!ID.test(id)) return null;
  return loadPresets(dirs).find((p) => p.id === id) ?? null;
}

/** what the page gets: the prompts left out */
export const presetInfo = ({ prompt: _p, file: _f, genres: _g, styles, fields, ...p }: Preset): PresetInfo => ({ ...p, styles: styles.map(({ prompt: _s, ...s }) => s),
  fields: fields.map(({ options, ...f }) => ({ ...f, options: options.map(({ prompt: _o, ...o }) => o) })) });

// the form's options are the user's, but what they say in the message still wins (spec 2026-10-24-custom-preset §2)
const OPTIONS_HEAD = 'Options the user set in the form (what the user says in the message still comes first)';
// a length typed in a field's own box (spec 2026-10-24-custom-preset §5.2)
const SECONDS = { min: 5, max: 600 };
const ownSeconds = (f: PresetField, v: string) => !!f.seconds && /^\d+$/.test(v) && +v >= SECONDS.min && +v <= SECONDS.max;

/** The form as sent: only the preset's own fields, each an option id or (a `seconds` field) a whole number of seconds (045 → 45); auto and the rest dropped. */
export function cleanFields(p: Preset, raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const f of p.fields) {
    const v = (raw as Record<string, unknown>)[f.id];
    if (typeof v !== 'string') continue;
    if (f.options.some((o) => o.id === v)) out[f.id] = v;
    else if (ownSeconds(f, v)) out[f.id] = String(+v);
  }
  return out;
}

/** each field set, as [its English name, the option (`prompt`: Claude's words, `name`: the short one)]; cleaned again, as what
 *  project.json kept may be an option the preset no longer has */
function setFields(p: Preset, raw?: Record<string, string>) {
  const fields = cleanFields(p, raw);
  return p.fields.filter((f) => fields[f.id] !== undefined).map((f) => {
    const v = fields[f.id], o = f.options.find((x) => x.id === v), own = `about ${v} s`;
    return { name: f.name.en ?? f.name.zh ?? f.id, prompt: o?.prompt ?? own, short: o ? (o.name.en ?? o.name.zh ?? o.id) : own };
  });
}

const NO_GENRES = 'This preset is the whole direction of the film: skip choosing a genre and do not read guides/genres/.';

/** What Claude gets ahead of the user's words: the preset's prompt, the prompts of the styles ticked in its dialog and the options set in its form. */
export function presetBlock(p: Preset, styles: string[], fields?: Record<string, string>): string {
  const picked = p.styles.filter((s) => styles.includes(s.id)), set = setFields(p, fields);
  const name = p.name.en ?? p.name.zh ?? p.id;
  return [`<preset id="${p.id}" name="${name}">`, p.prompt, ...(p.genres ? [] : [NO_GENRES]),
    ...(picked.length ? ['', 'Styles the user picked:', ...picked.map((s) => `- ${s.name.en ?? s.name.zh ?? s.id}: ${s.prompt}`)] : []),
    ...(set.length ? ['', `${OPTIONS_HEAD}:`, ...set.map((x) => `- ${x.name}: ${x.prompt}`)] : []), '</preset>'].join('\n');
}

/** the options in one line for a project's chat (re-reading preset.md does not show what the user chose); '' when none */
export function fieldsNote(p: Preset, fields?: Record<string, string>): string {
  const set = setFields(p, fields);
  return set.length ? `${OPTIONS_HEAD}: ${set.map((x) => `${x.name}: ${x.short}`).join('; ')}.` : '';
}

/** a preset that is gone by the time the message is sent (its folder was deleted while the page was open) */
export const missingPresetBlock = (id: string) => `(The preset "${id}" the user picked is gone (perhaps deleted): treat this as an ordinary message, and tell the user so in one sentence first.)`;
