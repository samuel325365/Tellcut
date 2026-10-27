// What a project's material is (spec 2026-10-14 §8), with every analysis done: for `npm run inspect` and cut scripts.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseProject, type Project, type Transcript } from '@tellcut/engine';
import { analysisDone, analysisFiles, analyzeSource, describeFaces, extrasFiles, faceKey, facesAt, ffmpeg, musicBeats, overviewSheets, readAssetRecords, photoSheet, probeDuration, readBurned, readTranscript, sourceExtras, timecode1, type Beats, type Burned, type BurnedCaption } from '@tellcut/media-node';
import { chapters, chronological, type Chapter } from './chapters.ts';
import { ANALYSIS_STEPS } from '@tellcut/protocol';

export interface SourceInfo {
  id: string; kind: 'video' | 'image'; duration: number; width: number; height: number; orientation: 'portrait' | 'landscape' | 'square';
  taken?: string; takenOffset?: string; takenGuess?: boolean; audio: boolean; speech: string; transcript: Transcript | null; /** captions burned into the picture (toolkit phase 2d) */ burned?: Burned | null; segments: Array<[number, number]>; sheets: string[];
  /** the server is making the transcript now (it starts when a project is made): since when, ms */ transcribing?: number;
  /** the server is still analysing it (its job's step and progress, in words): nothing here waits for it or does it again */ pending?: string;
}
/** what the Tellcut server is doing for this project's sources (its job list): the basic analysis, the sheets/transcript */
export type ServerBusy = Record<string, { analyze?: string; extras?: string }>;
/** generated: narration made by npm run voice, or music made by npm run score / c.score (no beats looked for: they are not songs to cut to) */
export interface MusicInfo { id: string; duration: number | null; beats: Beats | null; generated?: 'voice' | 'score' }
/** overview: pages with a row of small frames per video (toolkit phase 1): the first look at the material */
export interface Inventory { id: string; dir: string; project: Project; sources: SourceInfo[]; music: MusicInfo[]; chapters: Chapter[]; photoSheets: string[]; overview: string[] }

const segmentsOf = (duration: number, cuts: number[]): Array<[number, number]> => {
  const pts = [0, ...cuts.filter((c) => c > 0 && c < duration), duration];
  return pts.slice(0, -1).map((a, i) => [a, pts[i + 1]] as [number, number]);
};
const json = <T>(f: string): T | null => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : null);

export async function inventory(dir: string, o: { transcribe?: boolean; log?: (s: string) => void; /** inspect asks the server: sources it is analysing are not analysed here too */ busy?: ServerBusy } = {}): Promise<Inventory> {
  const log = o.log ?? (() => {}), project = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')));
  const sources: SourceInfo[] = [], waiting = new Set<string>();
  for (const [id, s] of Object.entries(project.sources)) {
    const path = resolve(dir, s.path);
    if (!existsSync(path)) { log(`離線，略過：${id}（${s.path}）`); continue; }
    const kind = s.kind === 'image' ? 'image' : 'video', busy = o.busy?.[id];
    if (busy?.analyze && !analysisDone(analysisFiles(dir, path), path)) {
      // the server is making the proxy, thumbnails and cuts: say so rather than wait (a long video takes many minutes)
      const r = s.width / s.height;
      sources.push({ id, kind, duration: s.duration, width: s.width, height: s.height, orientation: r < 0.95 ? 'portrait' : r > 1.05 ? 'landscape' : 'square',
        audio: kind === 'video' && s.audio !== false, speech: '', transcript: null, segments: [], sheets: [], pending: busy.analyze });
      waiting.add(id);
      continue;
    }
    if (!analysisDone(analysisFiles(dir, path), path)) log(`分析 ${id}`);   // said only when there is work to do
    // one file ffmpeg cannot read (cut short, not a video) must not hide all the others
    try { await analyzeSource(dir, path); } catch (e) { log(`分析 ${id} 失敗，略過：${(e as Error).message.split(/\r?\n/)[0].slice(0, 200)}`); continue; }
    let transcript: Transcript | null = null, burned: Burned | null = null, sheets: string[] = [], segments: Array<[number, number]> = [], started: number | undefined, pendingExtras: string | undefined;
    if (kind === 'video') {
      if (busy?.extras) pendingExtras = busy.extras;   // the server is on the sheets / transcript: not again here
      else try { started = (await sourceExtras(dir, path, { label: id, transcribe: o.transcribe })).transcribing?.started; } catch (e) { log(`  ${id} 的縮圖總覽或逐字稿失敗：${(e as Error).message}`); }
      const f = extrasFiles(dir, path), pages = json<{ pages: number }>(f.sheets)?.pages ?? 0;
      sheets = Array.from({ length: pages }, (_, i) => f.sheet(i + 1));
      transcript = readTranscript(dir, path);
      burned = readBurned(dir, path);   // as check reads it: an older burned.json too
      segments = segmentsOf(s.duration, json<number[]>(analysisFiles(dir, path).cuts) ?? []);
    }
    const ratio = s.width / s.height;
    sources.push({ id, kind, duration: s.duration, width: s.width, height: s.height, orientation: ratio < 0.95 ? 'portrait' : ratio > 1.05 ? 'landscape' : 'square',
      ...(s.taken ? { taken: s.taken } : {}), ...(s.takenOffset ? { takenOffset: s.takenOffset } : {}), ...(s.takenGuess ? { takenGuess: true } : {}), audio: kind === 'video' && s.audio !== false,
      speech: (transcript?.segments ?? []).map((x) => x.text).join(' ').slice(0, 80), transcript, burned, segments, sheets, ...(started && !transcript ? { transcribing: started } : {}), ...(pendingExtras && !transcript ? { pending: pendingExtras } : {}) });
  }
  // music downloaded from a source that lists its tempo (assets get): the beats are checked against it
  const listed = new Map(readAssetRecords(dir).filter((r) => r.bpm).map((r) => [r.path, r.bpm!]));
  const music: MusicInfo[] = [];
  for (const [id, m] of Object.entries(project.media)) {
    const path = resolve(dir, m.path);
    if (!existsSync(path)) { log(`離線，略過：${id}（${m.path}）`); continue; }
    const generated = /^media\/voice\//.test(m.path) ? 'voice' as const : /^media\/score-/.test(m.path) ? 'score' as const : undefined;
    let beats: Beats | null = null;
    if (!generated) try { beats = await musicBeats(dir, path, { bpm: listed.get(m.path) }); } catch (e) { log(`  ${id} 的拍點分析失敗：${(e as Error).message}`); }
    music.push({ id, duration: await probeDuration(path).catch(() => null), beats, ...(generated ? { generated } : {}) });
  }
  // photos: contact sheets of 12, in shooting order
  const photos = chronological(sources.filter((s) => s.kind === 'image')), photoSheets: string[] = [];
  mkdirSync(join(dir, 'cache', 'sheets'), { recursive: true });
  for (let i = 0; i * 12 < photos.length; i++) {
    const out = join(dir, 'cache', 'sheets', `photos-${i + 1}.jpg`), keyFile = `${out}.key`;
    const cells = photos.slice(i * 12, i * 12 + 12).map((s) => ({ img: resolve(dir, project.sources[s.id].path), label: `${s.id} ${s.taken?.slice(5, 16).replace('T', ' ') ?? ''}` }));
    // made again only when its photos change (each sheet decodes up to 12 photos, HEIC included): inspect and cut stay fast
    const key = JSON.stringify(cells.map((c) => { const st = existsSync(c.img) ? statSync(c.img) : null; return [c.img, c.label, st?.size, st?.mtimeMs]; }));
    if (!existsSync(out) || !existsSync(keyFile) || readFileSync(keyFile, 'utf8') !== key) {
      await photoSheet(out, cells);
      writeFileSync(keyFile, key);
    }
    photoSheets.push(out);
  }
  // a source the server has not analysed yet is left out of the overview (it would wait for it)
  const videos = sources.filter((s) => s.kind === 'video' && !waiting.has(s.id)).map((s) => ({ id: s.id, path: resolve(dir, project.sources[s.id].path), duration: s.duration }));
  // an extra like the sheets: a failure is reported, never stops inspect or cut
  let overview: string[] = [];
  try { overview = await overviewSheets(dir, videos); } catch (e) { log(`素材總覽失敗：${(e as Error).message}`); }
  return { id: project.meta.name, dir, project, sources, music, chapters: chapters(sources), photoSheets, overview };
}

/**
 * How many pictures one film should take to look at: every picture is read again on each later step, so the budget follows the
 * footage instead of a flat 30 — the overview pages, each video's --source sheets plus, for one over 3 minutes, a --range sheet
 * per 3 minutes (at most 10; 2 more when it cuts more than 10 times a minute), at most 16 of those, two check sheets and up to
 * 8 frames. Measured against the films of 2026-10-19..21: a 20-minute food walk took 22–36 pictures, a podcast 14–28.
 */
export function imageBudget(inv: Pick<Inventory, 'sources' | 'overview' | 'photoSheets'>) {
  const sheets = inv.overview.length + inv.photoSheets.length;
  const ranges = (s: SourceInfo) => s.duration <= 180 ? 0 : Math.min(10, Math.ceil(s.duration / 180)) + (s.segments.length / (s.duration / 60) > 10 ? 2 : 0);
  const detail = Math.min(16, inv.sources.filter((s) => s.kind === 'video').reduce((n, s) => n + Math.max(1, s.sheets.length) + ranges(s), 0));
  return { total: sheets + detail + 2 + 8, sheets, detail };
}
const budgetLine = ({ total, sheets, detail }: ReturnType<typeof imageBudget>) =>
  `看圖預算：約 ${total} 張（${[sheets && `總覽 ${sheets}`, detail && `細看素材（--source、--range）至多 ${detail}`].filter(Boolean).map((x) => `${x} ＋ `).join('')}check 拼貼 2 ＋ frames 至多 8）；新寫的 fx 每個再加 2 張；超過要說得出為什麼`;

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
export function formatInventory(inv: Inventory): string {
  const L: string[] = [`專案 ${inv.id}（${inv.project.meta.width}×${inv.project.meta.height}）`, budgetLine(imageBudget(inv)), ''];
  for (const f of inv.overview) L.push(`素材總覽：${f}`);
  if (inv.overview.length) L.push(`（每段影片一列；某段的場景表、逐字稿和大縮圖：npm run inspect -- ${basename(inv.dir)} --source <素材>）`, '');
  for (const s of inv.sources) {
    const what = s.kind === 'image' ? '照片' : `影片 ${mmss(s.duration)}，${s.segments.length} 段${s.audio ? '，有聲音' : ''}`;
    L.push(`${s.id}：${what}，${s.width}×${s.height}（${{ portrait: '直式', landscape: '橫式', square: '方形' }[s.orientation]}），${s.taken ? `${s.taken.replace('T', ' ')}${s.takenGuess ? '（推測）' : ''}` : '時間不明'}`);
    if (s.burned?.caption) L.push(burnedLine(s.burned.caption));
    if (s.speech) L.push(`  說話：${s.speech}${s.speech.length >= 80 ? '…' : ''}`);
    if (s.transcribing) L.push(transcribingLine(s.duration, s.transcribing));
    if (s.pending) L.push(`  伺服器正在分析這段素材（${s.pending}）。不用等，也不要自己再跑：先做不需要它的部分，或結束這一輪，好了會自動送訊息叫你繼續`);
  }
  for (const m of inv.music) {
    const len = m.duration ? mmss(m.duration) : '長度不明';
    L.push(m.generated === 'voice' ? `旁白 ${m.id}：${len}` : m.generated === 'score' ? `配樂 ${m.id}（產生的）：${len}` : `音樂 ${m.id}：${len}${m.beats ? `，${m.beats.bpm} BPM` : ''}`);
  }
  if (inv.photoSheets.length) L.push('', ...inv.photoSheets.map((f) => `照片總覽：${f}`));
  L.push('', '分章：', ...inv.chapters.map((c) => `  ${c.title}：${c.ids.join('、')}`));
  return L.join('\n');
}


/** a server job of this project as inspect shows it: its step in words, and how far */
export function busyFromJobs(jobs: Array<{ kind: string; project: string; label: string; status: string; progress?: number; message?: string }>, project: string): ServerBusy {
  const out: ServerBusy = {};
  for (const j of jobs) {
    if (j.project !== project || (j.kind !== 'analyze' && j.kind !== 'extras') || ['done', 'failed', 'cancelled'].includes(j.status)) continue;
    const what = j.status === 'queued' ? '排隊中' : `${ANALYSIS_STEPS[j.message ?? ''] ?? j.message ?? ''}${typeof j.progress === 'number' ? ` ${Math.round(j.progress * 100)}%` : ''}`.trim();
    (out[j.label] ??= {})[j.kind as 'analyze' | 'extras'] = `${j.kind === 'analyze' ? '基本分析' : '縮圖總覽與逐字稿'}：${what || '進行中'}`;
  }
  return out;
}

/** transcription runs at about 0.65× the video's length on a CPU (measured: 17:22 → 11.5 min, 20:39 → 13 min) */
export const transcribingLine = (duration: number, started: number, now = Date.now()) => {
  const left = Math.max(1, Math.round((duration * 0.65 - (now - started) / 1000) / 60));
  return `  逐字稿：伺服器正在轉錄（約還要 ${left} 分鐘）。不用等，也不要自己再跑轉錄；好了之後頁面會自動送訊息叫你繼續`;
};

const pct = (x: number) => Math.round(x * 100);
/** one line in the overview: this footage carries its own captions */
export const burnedLine = (c: BurnedCaption) => `  燒字：畫面下方（約 ${pct(c.rect[1])}–${pct(c.rect[1] + c.rect[3])}% 高度）有原片自己的字幕，約 ${pct(c.share)}% 的時間；疊字幕或消音前先看 --source`;
const MAX_SPANS = 40;
export function burnedDetail(c: BurnedCaption): string[] {
  const shown = c.spans.slice(0, MAX_SPANS).map(([a, b]) => `${timecode1(a)}–${timecode1(b)}`).join('、');
  return [
    `燒進畫面的字幕：畫面下方 ${pct(c.rect[1])}–${pct(c.rect[1] + c.rect[3])}% 高度，約 ${pct(c.share)}% 的時間有（${c.spans.length} 段）：`, `  ${shown}${c.spans.length > MAX_SPANS ? `（還有 ${c.spans.length - MAX_SPANS} 段）` : ''}`,
    '  我們自己的字幕會疊在它上面；要消音的字它也寫出來了。避開：放大裁掉下緣（c.clip 加 avoidBurned: true）、字幕改放畫面上方、或換沒有字的鏡頭。',
  ];
}

const MAX_SCENES = 60, MAX_SAID = 150;
/** One source in detail (`npm run inspect -- <id> --source <sid>`): scenes, every sentence with its times, the big sheets. */
export function formatSource(inv: Inventory, sid: string): string {
  const s = inv.sources.find((x) => x.id === sid);
  if (!s) throw new Error(`沒有素材「${sid}」；有：${inv.sources.map((x) => x.id).join('、')}`);
  const orient = { portrait: '直式', landscape: '橫式', square: '方形' }[s.orientation];
  if (s.kind === 'image') return `${s.id}：照片，${s.width}×${s.height}（${orient}）${s.taken ? `，${s.taken.replace('T', ' ')}` : ''}`;
  if (s.pending && !s.segments.length) return `${s.id}：影片 ${mmss(s.duration)}，${orient}；伺服器正在分析（${s.pending}），場景和逐字稿還沒有。不用等：結束這一輪，好了會自動送訊息叫你繼續`;
  const L = [`${s.id}：影片 ${mmss(s.duration)}，${s.segments.length} 段，${orient}，${s.width}×${s.height}${s.audio ? '，有聲音' : ''}`, '', '場景：'];
  L.push(...s.segments.slice(0, MAX_SCENES).map(([a, b], i) => `  #${i + 1} ${timecode1(a)}–${timecode1(b)}`));
  if (s.segments.length > MAX_SCENES) L.push(`  （還有 ${s.segments.length - MAX_SCENES} 段沒列出）`);
  if (s.burned?.caption) L.push('', ...burnedDetail(s.burned.caption));
  const said = (s.transcript?.segments ?? []).filter((x) => x.text.trim()), shown = said.slice(0, MAX_SAID);
  L.push('', said.length ? '說話：' : '說話：（沒有逐字稿）', ...shown.map((x) => `  ${timecode1(x.start)}–${timecode1(x.end)} ${x.text.trim()}`));
  // a long talk would not fit in one read: the first sentences, and the way to look at any stretch
  if (said.length > MAX_SAID) L.push(`  （還有 ${said.length - MAX_SAID} 句沒列出；看某一段：npm run inspect -- ${basename(inv.dir)} --source ${s.id} --range 5:00-6:30）`);
  if (s.sheets.length) L.push('', ...s.sheets.map((f) => `大縮圖總覽：${f}`));
  if (s.duration > 180) L.push(`（長片：看某一段的密集縮圖與逐字稿，加 --range 開始-結束，例如 --range 5:00-6:30）`);
  return L.join('\n');
}

/** "1:05-2:30", "65-150", "1:05.5-1:20" as seconds (– and ~ too: inspect prints its ranges with –); throws a sentence on anything else. */
export function parseRange(s: string): [number, number] {
  const sec = (x: string) => {
    const p = x.split(':').map(Number);
    if (p.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
    return p.reduce((acc, n) => acc * 60 + n, 0);
  };
  const m = /^\s*([\d:.]+)\s*[-–—~〜]\s*([\d:.]+)\s*$/.exec(s), a = m ? sec(m[1]) : NaN, b = m ? sec(m[2]) : NaN;
  if (!(b > a)) throw new Error(`看不懂時間範圍「${s}」：用像 5:00-6:30 或 300-390 這樣的寫法`);
  return [a, b];
}

const RANGE_CELLS = 24, STEPS = [0.5, 1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 180, 300, 600, 900];
/** Frame times for a stretch: the smallest round step that fits in RANGE_CELLS frames. */
export function rangeTimes(a: number, b: number): { step: number; times: number[] } {
  // the whole range is always covered: the step grows with it (a round one while there is one)
  const step = STEPS.find((x) => (b - a) / x <= RANGE_CELLS) ?? Math.ceil((b - a) / RANGE_CELLS), times: number[] = [];
  for (let t = a; t < b - 1e-6 && times.length < RANGE_CELLS; t += step) times.push(Math.round(t * 10) / 10);
  return { step, times };
}

/**
 * One stretch of a video (`inspect --source <sid> --range a-b`): a sheet of frames every few seconds, each labelled with its time,
 * and the scenes and sentences in it — for long footage, where the whole-video sheets are too sparse to find a shot.
 */
export async function formatSourceRange(inv: Inventory, sid: string, range: [number, number]): Promise<string> {
  const pend = inv.sources.find((x) => x.id === sid);
  if (pend?.pending && !pend.segments.length) return formatSource(inv, sid);   // not analysed yet: say so, do not decode it here
  const s = inv.sources.find((x) => x.id === sid);
  if (!s) throw new Error(`沒有素材「${sid}」；有：${inv.sources.map((x) => x.id).join('、')}`);
  if (s.kind === 'image') throw new Error(`${sid} 是照片，沒有時間範圍`);
  const a = Math.max(0, range[0]), b = Math.min(s.duration, range[1]);
  if (!(b > a)) throw new Error(`${sid} 只有 ${mmss(s.duration)}，範圍 ${timecode1(range[0])}–${timecode1(range[1])} 在片子外面`);
  const { step, times } = rangeTimes(a, b);
  const path = resolve(inv.dir, inv.project.sources[sid].path), proxy = analysisFiles(inv.dir, path).proxy, src = existsSync(proxy) ? proxy : path;
  const dir = join(inv.dir, 'cache', 'sheets'), out = join(dir, `range-${sid}-${Math.round(a)}-${Math.round(b)}.jpg`);
  mkdirSync(dir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'range-'));
  try {
    const cells: Array<{ img: string; label: string }> = [];
    for (const [i, t] of times.entries()) {
      const img = join(tmp, `${i}.jpg`);
      await ffmpeg(['-ss', String(t), '-i', src, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', img]);
      cells.push({ img, label: `${s.id} ${timecode1(t)}` });
    }
    await photoSheet(out, cells, undefined, { cols: 6, cellW: 320 });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const scenes = s.segments.filter(([x, y]) => y > a && x < b), said = (s.transcript?.segments ?? []).filter((x) => x.text.trim() && x.end > a && x.start < b);
  // faces at the same times (toolkit phase 5): who is in the shot and where, for follow / who / a crop's focus
  let faces: string;
  try {
    const found = await facesAt(inv.dir, path, times);
    faces = `人臉：${describeFaces(times.map((t) => ({ t, faces: found.get(faceKey(t)) ?? [] })), timecode1)}`;
  } catch (e) { faces = `人臉：（偵測失敗：${(e as Error).message.split('\n')[0].slice(0, 100)}）`; }
  return [
    `${s.id} ${timecode1(a)}–${timecode1(b)}（每 ${step} 秒一格，共 ${times.length} 格）`, `縮圖：${out}`, faces,
    '', '場景：', ...scenes.map(([x, y]) => `  ${timecode1(x)}–${timecode1(y)}`),
    '', said.length ? '說話：' : '說話：（這段沒有）', ...said.map((x) => `  ${timecode1(x.start)}–${timecode1(x.end)} ${x.text.trim()}`),
  ].join('\n');
}
