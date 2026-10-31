// Writing presets of the user's own (spec 2026-10-29-my-library §3.5–3.7, §4.5, §4.6): projects/_presets/my-<slug>/preset.md, from the
// save dialog (a film's draft the agent wrote, edited by the user) or from the custom form. The points are the whole prompt: one line
// for the agent per point the user sees, so a point deleted in the dialog is an instruction gone, and none is hidden from them.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { DEFAULT_THEME } from '@tellcut/engine';
import type { L10n, Lang } from '@tellcut/protocol';
import { ffmpeg } from './ffmpeg.ts';
import { findPreset, type Preset, type PresetDirs, type PresetPoint } from './presets.ts';
import { slugFor } from './library/store.ts';

const OPENING = "This is the user's own preset, saved from a film they liked. Follow every point; what the user says in the message still comes first.";
/** preset.md's body: the opening line, then each point's prompt on a line of its own */
export const presetBody = (points: PresetPoint[]) => [OPENING, ...points.map((x) => `- ${x.prompt.replace(/\s*\n\s*/g, ' ').trim()}`)].join('\n');

const POINT = z.object({ text: z.string().trim().min(1), prompt: z.string().trim().min(1) });
/** projects/<id>/preset-draft.json as the agent writes it (apps/server/src/chat/tasks.ts DRAFT_FORMAT) */
export const PresetDraftZ = z.object({
  name: z.string(), summary: z.string(), points: z.array(POINT),
  ratio: z.string().regex(/^[1-9]\d*:[1-9]\d*$/).optional(),
  length: z.tuple([z.number().positive(), z.number().positive()]).optional(),
  theme: z.unknown().optional(), score: z.string().optional(),
  fx: z.array(z.string().regex(/^fx\/(?!.*\.\.)[\w./-]+\.m?js$/)).optional(),
});
export type PresetDraft = z.infer<typeof PresetDraftZ>;

export interface SavePresetInput { name: string; summary: string; points: PresetPoint[]; lang: Lang; color?: string; ratios?: string[]; length?: [number, number];
  theme?: unknown; score?: string; blocks?: string[];
  /** true for one from the custom form: it holds a few options, not a whole direction, so the agent still picks a genre */
  genres?: boolean }

const SECONDS: Record<Lang, (a: number, b: number) => string> = { zh: (a, b) => `${a}–${b} 秒`, en: (a, b) => `${a}–${b} s`, ja: (a, b) => `${a}〜${b} 秒` };
const LANGS: Lang[] = ['zh', 'en', 'ja'];
const mineId = (id: string) => { if (!/^my-[a-z0-9][a-z0-9-]{0,37}$/.test(id)) throw new Error(`不是自己的片型：${id}`); return id; };

/** the user's own words (a name, a summary) in every language: they are not translated, so the other UIs show them as typed, not
 *  nothing (pickText falls back to en and zh only). A language whose text was not the same as the one edited (a translation made by
 *  hand in preset.md) keeps its own */
function ownWords(text: string, lang: Lang, had: L10n | undefined): L10n {
  const was = had?.[lang];
  return Object.fromEntries(LANGS.map((l) => [l, l !== lang && had?.[l] !== undefined && had[l] !== was ? had[l]! : text]));
}

/** the part of a theme a preset keeps: the colours and fonts its dialog shows, each a non-empty string under a name the theme knows.
 *  The rest is left out: the page would save what it never showed, and the safe area is the source film's shape, wrong for a film of
 *  another ratio made from the preset. Undefined when nothing is left */
export function presetTheme(theme: unknown): { palette?: Record<string, string>; fonts?: Record<string, string> } | undefined {
  const t = (theme && typeof theme === 'object' ? theme : {}) as Record<string, unknown>;
  const pick = (x: unknown, keys: string[]) => {
    const o = x && typeof x === 'object' ? x as Record<string, unknown> : {};
    const kept = Object.fromEntries(keys.flatMap((k) => (typeof o[k] === 'string' && o[k].trim() ? [[k, o[k].trim()]] : [])));
    return Object.keys(kept).length ? kept : undefined;
  };
  const palette = pick(t.palette, Object.keys(DEFAULT_THEME.palette)), fonts = pick(t.fonts, Object.keys(DEFAULT_THEME.fonts));
  return palette || fonts ? { ...(palette ? { palette } : {}), ...(fonts ? { fonts } : {}) } : undefined;
}

/** writes (with `id`: rewrites) a preset of the user's own; the poster, when there is one, stays */
export function writeUserPreset(dirs: PresetDirs, i: SavePresetInput, id?: string): Preset {
  const taken = new Set((() => { try { return readdirSync(dirs.user); } catch { return []; } })());
  const pid = id ? mineId(id) : `my-${slugFor(i.name, 'preset', new Set([...taken].filter((x) => x.startsWith('my-')).map((x) => x.slice(3))))}`;
  const had = id ? findPreset(dirs, pid) : null, theme = presetTheme(i.theme);
  const facts = (l: Lang) => [...(i.ratios ?? []), ...(i.length ? [SECONDS[l](Math.round(i.length[0]), Math.round(i.length[1]))] : [])];
  const front = {
    color: i.color ?? '#d8b88a', name: ownWords(i.name.trim() || pid, i.lang, had?.name), summary: ownWords(i.summary.trim(), i.lang, had?.summary),
    ...(facts(i.lang).length ? { facts: Object.fromEntries(LANGS.map((l) => [l, facts(l)])) } : {}),
    ...(i.ratios?.length ? { ratios: i.ratios } : {}), ...(i.length ? { length: i.length.map(Math.round) } : {}),
    genres: i.genres ?? false, points: i.points,
    ...(theme ? { theme } : {}), ...(i.score ? { score: i.score } : {}), ...(i.blocks?.length ? { blocks: i.blocks } : {}),
  };
  const dir = join(dirs.user, pid);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'preset.md');
  writeFileSync(`${file}.tmp`, `---\n${JSON.stringify(front, null, 2)}\n---\n${presetBody(i.points)}\n`);
  renameSync(`${file}.tmp`, file);
  const p = findPreset(dirs, pid);
  if (!p) throw new Error(`寫好的片型讀不回來：${pid}`);
  return p;
}

/** a new name in the language it was given in; the rest stays */
export function renameUserPreset(dirs: PresetDirs, id: string, name: string, lang: Lang = 'zh'): Preset {
  const p = findPreset(dirs, mineId(id));
  if (!p || !p.mine) throw new Error(`沒有這個片型：${id}`);
  return writeUserPreset(dirs, { name, summary: p.summary[lang] ?? Object.values(p.summary)[0] ?? '', points: p.points, lang, color: p.color, ratios: p.ratios, length: p.length,
    theme: p.theme, score: p.score, blocks: p.blocks, genres: p.genres }, id);
}

export function deleteUserPreset(dirs: PresetDirs, id: string) {
  const dir = join(dirs.user, mineId(id));
  if (!existsSync(dir)) throw new Error(`沒有這個片型：${id}`);
  rmSync(dir, { recursive: true, force: true });
}

/** any picture as a preset's poster: covered and cut to 9:16, 540 wide (the home page's thumbnails, spec 2026-10-23-presets-and-languages §5.1) */
export async function posterFromImage(input: string, out: string) {
  const tmp = `${out}.${process.pid}.jpg`;
  await ffmpeg(['-y', '-i', input, '-vf', 'scale=540:960:force_original_aspect_ratio=increase,crop=540:960', '-frames:v', '1', '-q:v', '3', tmp]);
  renameSync(tmp, out);
}
