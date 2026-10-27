// What travels between the Tellcut server, the editor and the embedded player (review B3): one definition each, so the two
// ends cannot drift. Types only, apart from isTerminal.
import type { BlockCategory, Op, ParamDef, SfxCategory, Transform } from '@tellcut/engine';

// ---------------------------------------------------------------- chat (spec 2026-10-16-in-editor-chat §3)
/** what a tool line says, as a code the page words in its language; `label` stays the Chinese text for old pages and old threads */
export type ToolVerb = 'run' | 'read' | 'write' | 'list' | 'denied';
export type ChatTool = { kind: 'run' | 'read' | 'write' | 'denied' | 'other'; label: string; detail: string; verb?: ToolVerb; arg?: string };
/** the home note "this conversation moved to project…", as facts the page words itself (`text` stays the Chinese note) */
export interface MovedNotice { kind: 'moved'; project: string; name: string; others: Array<{ id: string; name: string }> }
/** a reply rebuilt from Claude Code's own log after a server restart (`text` ends with the Chinese note) */
export interface RecoveredNotice { kind: 'recovered' }
export type ChatNotice = MovedNotice | RecoveredNotice;
/** why a turn failed, as a code the page words in its language (err.<code>, like an HTTP error's code); `error` stays the
 *  Chinese words for old pages and old threads, `detail` is the raw cause (a message, an exit code). A failure with no code
 *  (the end of claude's stderr, its own error text) has only `error`, as it came. */
export type ChatErrorCode = 'chat.notFound' | 'chat.notLoggedIn' | 'chat.startFailed' | 'chat.saveFailed' | 'chat.exited' | 'chat.busy';
/** Tokens one reply used (all of its model calls together): new input, input written to / read from the prompt cache, output;
 *  `cost`: what Claude Code reports it would cost at Claude API prices (US$), when it says */
export interface Usage { input: number; cacheWrite: number; cacheRead: number; output: number; cost?: number }
export type ChatStatus = 'done' | 'stopped' | 'interrupted' | 'error';
export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; tool: ChatTool }
  /** moved: the home conversation went on in this new project's chat */
  | { type: 'done'; status: ChatStatus; text: string; error?: string; code?: ChatErrorCode; detail?: string; usage?: Usage; moved?: string };
/** preset: on a user message, the preset it was sent with (spec 2026-10-23-presets-and-languages §6.1);
 *  auto: a message the server sent by itself (its text is for the agent; the page shows its own words): the analysis is over,
 *  -partial when part of it failed */
export interface ChatMessage { role: 'user' | 'assistant'; text: string; time: string; tools?: ChatTool[]; status?: ChatStatus; error?: string; code?: ChatErrorCode; detail?: string; usage?: Usage; preset?: PresetChoice; notice?: ChatNotice; auto?: 'analysis' | 'analysis-partial' }
/** `spent`: Claude Code's running cost of the session `spentIn` (it reports the whole session's total, resumes included):
 *  what is left after taking it off is the turn's own price */
/** `sources`: the outside sources the user ticked in the chat's API menu (spec 2026-10-24-api-picker §3); absent: none */
/** `lang`: the page language of the user's last message, for the messages the server sends by itself */
export interface ChatThread { sessionId: string; started: boolean; messages: ChatMessage[]; spent?: number; spentIn?: string; sources?: string[]; lang?: Lang }

// ---------------------------------------------------------------- presets (spec 2026-10-23-presets-and-languages §3)
export type Lang = 'zh' | 'en' | 'ja';
export type L10n<T = string> = Partial<Record<Lang, T>>;
/** the text in `lang`, else English, else Chinese */
export function pickText<T>(x: L10n<T> | undefined, lang: Lang): T | undefined { return x?.[lang] ?? x?.en ?? x?.zh; }
export interface PresetStyleInfo { id: string; name: L10n; desc: L10n; custom?: boolean }
export interface PresetOptionInfo { id: string; name: L10n }
/** a field of a preset's form (spec 2026-10-24-custom-preset §3): it starts on auto (no option); `seconds`: the user may type a length
 *  of their own; `group`: the heading it sits under (fields next to each other with the same one share it) */
export interface PresetFieldInfo { id: string; name: L10n; hint?: L10n; group?: L10n; seconds?: boolean; options: PresetOptionInfo[] }
/** what the home page shows of a preset (its prompts stay on the server); `sources`: the outside sources (API menu ids) the menu
 *  ticks when the preset is picked; `length` (seconds, shortest and longest) and `ratios` (`9:16`…): what `check` compares the film with */
export interface PresetInfo {
  id: string; order: number; mine: boolean; color: string; name: L10n; summary: L10n; fit: L10n<string[]>; facts: L10n<string[]>;
  styles: PresetStyleInfo[]; sources: string[]; poster: string | null; preview: string | null; length?: [number, number]; ratios?: string[];
  /** the dialog's form, and style lines the user may put into the chat box */
  fields: PresetFieldInfo[]; examples: L10n[];
}
/** the preset a message was sent with, the styles ticked in its dialog and the options set in its form (none set: no `fields`) */
export interface PresetChoice { id: string; styles: string[]; fields?: Record<string, string> }

// ---------------------------------------------------------------- outside sources (spec 2026-10-24-api-picker §3)
/** a group of the chat's API menu */
export type SourceCategory = 'media' | 'sound' | 'map' | 'fandom' | 'knowledge';
export const SOURCE_CATEGORIES: SourceCategory[] = ['media', 'sound', 'map', 'fandom', 'knowledge'];
/** why a source cannot be used: not switched on, its key missing, found broken, not ticked in this conversation, no adapter */
export type SourceReason = 'no-adapter' | 'off' | 'key' | 'broken' | 'unpicked';
/** one row of GET /api/sources */
export interface SourceInfo {
  id: string; label: string; category: SourceCategory; kinds: string[];
  /** it answers `assets data` questions */
  data: boolean; unofficial: boolean; available: boolean; reason?: SourceReason;
  /** the environment variable its key may come from */
  keyEnv?: string;
}

// ---------------------------------------------------------------- jobs (spec §6.2)
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export interface JobInfo {
  id: string; kind: string; project: string; label: string; status: JobStatus; progress: number; message: string; log: string[];
  result?: unknown; error?: string; created: number; started?: number; finished?: number;
}
export const isTerminal = (s: JobStatus) => s === 'done' || s === 'failed' || s === 'cancelled';

/** the catalog's and the gallery's group name for each plugin (and for a project's own fx) */
export const PLUGIN_GROUP: Record<string, string> = {
  core: '內建', common: '共用積木（吃專案 theme）', fx: '本專案自己的 fx',
};

/** the groups of the shared blocks (ItemType.category), in catalog order */
export const BLOCK_CATEGORY: Record<BlockCategory, string> = {
  text: '字幕與大字', chapter: '章節、編號與標籤', card: '資訊卡、清單與收據', number: '數字與計量', travel: '地圖、路線與旅程',
  frame: '版面與相框（影片在框裡播）', phone: '手機與 App 畫面', mark: '貼圖與標記', look: '背景與質感', moment: '轉場、懸念與片尾',
};
/** the groups of the shared sound effects (SfxType.category), in catalog and gallery order */
export const SFX_CATEGORY: Record<SfxCategory, string> = {
  alert: '提示、對錯與警報', chime: '叮鈴、獎勵與旋律', hit: '撞擊、落地與彈跳', move: '移動、轉場與機器', paper: '紙、筆、相機與打字', life: '廚房與生活',
};

/** the same groups in English, for the block index of guides/workflow.md (the agents' prompt is English) */
export const BLOCK_CATEGORY_EN: Record<BlockCategory, string> = {
  text: 'Captions and big text', chapter: 'Chapters, numbers and tags', card: 'Info cards, lists and receipts', number: 'Numbers and meters',
  travel: 'Maps, routes and journeys', frame: 'Layouts and frames (the video plays inside)', phone: 'Phone and app screens', mark: 'Stickers and marks',
  look: 'Backgrounds and textures', moment: 'Transitions, suspense and endings',
};
export const SFX_CATEGORY_EN: Record<SfxCategory, string> = {
  alert: 'Alerts, right and wrong, alarms', chime: 'Chimes, rewards and melodies', hit: 'Hits, landings and bounces', move: 'Movement, transitions and machines',
  paper: 'Paper, pens, cameras and typing', life: 'Kitchen and everyday life',
};

export * from './handles.ts';

/** the steps of a source's analysis (job messages), in words */
export const ANALYSIS_STEPS: Record<string, string> = { proxy: '代理檔', thumbs: '縮圖', cuts: '場景', peaks: '聲音波形', sheets: '縮圖總覽', burned: '燒字偵測', transcript: '逐字稿' };
/** What a project's analysis jobs are doing, as facts: per running job its source, step code and minutes; how many wait. null when nothing is. */
export interface AnalysisState { running: Array<{ label: string; step: string; mins: number }>; queued: number }
export function analysisState(jobs: JobInfo[], now = Date.now()): AnalysisState | null {
  const live = jobs.filter((j) => (j.kind === 'analyze' || j.kind === 'extras') && !isTerminal(j.status));
  if (!live.length) return null;
  const running = live.filter((j) => j.status === 'running').map((j) => ({
    label: j.label, step: j.message || (j.kind === 'analyze' ? 'basic' : 'extras'), mins: j.started ? Math.floor((now - j.started) / 60000) : 0 }));
  return { running, queued: live.length - running.length };
}
/** One line for what a project's analysis jobs are doing ("03：逐字稿（已 12 分鐘）；還有 2 項排隊"), null when nothing is. */
export function analysisStatus(jobs: JobInfo[], now = Date.now()): string | null {
  const a = analysisState(jobs, now);
  if (!a) return null;
  const words = (step: string) => ANALYSIS_STEPS[step] ?? (step === 'basic' ? '基本分析' : step === 'extras' ? '縮圖總覽與逐字稿' : step);
  const running = a.running.map((j) => `${j.label}：${words(j.step)}（已 ${j.mins} 分鐘）`);
  return [...running, ...(a.queued ? [`還有 ${a.queued} 項排隊`] : [])].join('；');
}

// ---------------------------------------------------------------- proposals (spec 2026-10-15-proposals-magnetic §3)
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'stale';
export interface Proposal { id: string; label: string; created: string; base: string; ops: Op[]; status: ProposalStatus; reason?: string; summary?: string[]; warnings?: string[] }

// ---------------------------------------------------------------- the embedded player (spec §2.3, plus 'boot')
/** crop mode: which clip, and which crop — its first frame, its last, or a keyframe by index */
export type CropSel = { itemId: string; which: 'from' | 'to' | number };
export type EditorMsg =
  | { type: 'load'; project: unknown } | { type: 'patch'; project: unknown }
  | { type: 'seek'; t: number } | { type: 'play'; from: number } | { type: 'pause' }
  | { type: 'cropMode'; sel: CropSel | null }
  | { type: 'quality'; value: 'full' | 'draft' }
  | { type: 'select'; itemId: string | null };
/** the preview tools' messages (picking, moving and editing items on the preview) */
export type ToolMsg =
  | { type: 'pick'; itemId: string | null }
  | { type: 'transformChange'; itemId: string; transform: Transform; final: boolean }
  | { type: 'paramEdit'; itemId: string; key: string; value: string };
export type PlayerMsg =
  | { type: 'boot' } | { type: 'ready'; duration: number } | { type: 'time'; t: number }
  | { type: 'ended' } | { type: 'error'; itemId?: string; message: string }
  | { type: 'level'; db: number }
  | { type: 'cropChange'; itemId: string; which: 'from' | 'to' | number; crop: { x: number; y: number; zoom: number }; final: boolean }
  | { type: 'key'; key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
  | ToolMsg;

// ---------------------------------------------------------------- the block gallery (spec 2026-10-17-block-gallery)
export interface GalleryBlock { plugin: string; group: string; type: string; label: string; doc: string; kind: 'scene' | 'overlay'; params: ParamDef[]; needsMedia: boolean;
  /** a BlockCategory key (the core blocks get one in the gallery); none for a sample film's own blocks */
  category?: string;
  /** a golden picture of the block (/api/gallery/thumb/…), when it has one */
  thumb?: string }
export interface GallerySfx { plugin: string; type: string; label: string; doc: string; params: ParamDef[];
  /** an SfxCategory key; none for a sample film's own sounds */
  category?: string }
export interface GalleryStyle { id: string; label: string; doc: string; defaults: { bpm: number; key: string }; origin: 'built-in' | 'library' }
export interface GalleryRecipe { id: string; label: string; doc: string; notes: string[]; example: unknown }
export interface GalleryIndex { blocks: GalleryBlock[]; sfx: GallerySfx[]; styles: GalleryStyle[]; recipes: GalleryRecipe[] }
