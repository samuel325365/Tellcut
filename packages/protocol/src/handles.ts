// Block handles (spec 2026-10-22-block-handles): a short, permanent code for every shared block, sound effect, music style, recipe and
// clip effect (MRK-03, SFX-HIT-02, MUS-07), shown in the gallery, the editor, the catalog and the page chat so people can point at one.
// Only for showing and pointing: project.json and cut.ts keep using type ids. A handle is never renumbered or given out again:
// a removed block's handle moves to RETIRED, a block that changes category keeps its handle (listed in MOVED). tools/handles.test.ts
// checks it all; npm run promote / promote-style add the next handle of a prefix.
import type { BlockCategory, SfxCategory } from '@tellcut/engine';

/** a block category's prefix (core blocks take the gallery's category, CORE_CATEGORY) */
export const BLOCK_PREFIX: Record<BlockCategory, string> = {
  text: 'TXT', chapter: 'CHP', card: 'CRD', number: 'NUM', travel: 'TRV', frame: 'FRM', phone: 'PHN', mark: 'MRK', look: 'LOK', moment: 'MOM',
};
/** a sound effect category's prefix */
export const SFX_PREFIX: Record<SfxCategory, string> = {
  alert: 'SFX-ALR', chime: 'SFX-CHM', hit: 'SFX-HIT', move: 'SFX-MOV', paper: 'SFX-PAP', life: 'SFX-LIF',
};
/** music styles (built in and in score-library/), recipes, clip effects */
export const STYLE_PREFIX = 'MUS', RECIPE_PREFIX = 'RCP', CLIP_PREFIX = 'CLP';

/** the core blocks have no category of their own (only common blocks need one for the catalog): where the gallery puts them */
export const CORE_CATEGORY: Record<string, BlockCategory> = { 'core.title': 'text', 'core.caption': 'text', 'core.lowerThird': 'chapter', 'core.flash': 'moment', 'core.endCard': 'moment' };

/** things a clip itself does (toolkit phase 5): not blocks, but listed with them where people look for effects, with their cut.ts call */
export const CLIP_FX = [
  { key: 'clip.shake', label: '鏡頭晃動', code: 'c.shake(1.2, { dur: 0.4, px: 24 })', doc: '那個時間正在播的片段畫面抖一下再慢慢停：爆字、撞擊、笑點。hook 配方的開場要晃，就在 hook 加 shake: true。' },
  { key: 'clip.follow', label: '貼圖跟著嘴（或臉）', code: "c.effect('common.emoji', { at, len, char: '🤐', follow: 'mouth' })", doc: '任何貼圖都能貼在片段裡那個人的嘴或臉上並跟著動；好幾個人時加 who: left／right／largest／center。消音：censorSpeech(…, { follow: true })。' },
  { key: 'clip.avoidBurned', label: '避開原片字幕', code: "c.clip(src, { from, len, avoidBurned: true })", doc: '原片燒進去的字幕（分析時偵測到的）落在這段時，自動放大裁切把字幕推出畫面；放大到 2.2 倍也避不開就照原樣並提醒。' },
] as const;
export type ClipFx = typeof CLIP_FX[number];

// The handles, one per line, each prefix numbered 01, 02, … with no gaps (the retired ones included). Ids: block and sound
// effect type ids, style:<id>, recipe:<id>, clip.<name>.
export const HANDLES: Readonly<Record<string, string>> = {
  'TXT-01': 'common.burst',
  'TXT-02': 'common.caption',
  'TXT-03': 'common.slam',
  'TXT-04': 'common.handwrite',
  'TXT-05': 'common.strike',
  'TXT-06': 'common.dotmatrix',
  'TXT-07': 'common.quote',
  'TXT-08': 'core.title',
  'TXT-09': 'core.caption',
  'TXT-10': 'common.headline',
  'CHP-01': 'common.badge',
  'CHP-02': 'common.tag',
  'CHP-03': 'common.header',
  'CHP-04': 'common.progress',
  'CHP-05': 'common.slip',
  'CHP-06': 'core.lowerThird',
  'CRD-01': 'common.receipt',
  'CRD-02': 'common.card',
  'CRD-03': 'common.list',
  'CRD-04': 'common.rating',
  'CRD-05': 'common.info',
  'CRD-06': 'common.notecard',
  'CRD-07': 'common.printer',
  'CRD-08': 'common.versus',
  'NUM-01': 'common.meter',
  'NUM-02': 'common.scoreboard',
  'NUM-03': 'common.countdown',
  'NUM-04': 'common.gauge',
  'NUM-05': 'common.hangtag',
  'NUM-06': 'common.timelapse',
  'NUM-07': 'common.digits',
  'NUM-08': 'common.chart',
  'TRV-01': 'common.tripclock',
  'TRV-02': 'common.route',
  'TRV-03': 'common.routeboard',
  'TRV-04': 'common.mapjump',
  'TRV-05': 'common.ticket',
  'TRV-06': 'common.stations',
  'TRV-07': 'common.postmark',
  'TRV-08': 'common.mapcam',
  'TRV-09': 'common.worldmap',
  'FRM-01': 'common.panel',
  'FRM-02': 'common.polaroid',
  'FRM-03': 'common.snap',
  'FRM-04': 'common.postcard',
  'FRM-05': 'common.frame',
  'FRM-06': 'common.duo',
  'FRM-07': 'common.camcorder',
  'FRM-08': 'common.casefile',
  'FRM-09': 'common.magazine',
  'PHN-01': 'common.notify',
  'PHN-02': 'common.lockscreen',
  'PHN-03': 'common.reels',
  'PHN-04': 'common.comments',
  'PHN-05': 'common.story',
  'PHN-06': 'common.album',
  'PHN-07': 'common.chat',
  'PHN-08': 'common.search',
  'MRK-01': 'common.speedlines',
  'MRK-02': 'common.censor',
  'MRK-03': 'common.stamp',
  'MRK-04': 'common.pen',
  'MRK-05': 'common.sparkle',
  'MRK-06': 'common.emoji',
  'MRK-07': 'common.callout',
  'MRK-08': 'common.touch',
  'LOK-01': 'common.backdrop',
  'LOK-02': 'common.ambient',
  'LOK-03': 'common.shader',
  'LOK-04': 'common.glitch',
  'LOK-05': 'common.film',
  'LOK-06': 'common.tone',
  'LOK-07': 'common.paper',
  'MOM-01': 'common.mystery',
  'MOM-02': 'common.outro',
  'MOM-03': 'common.rolldoor',
  'MOM-04': 'common.wipe',
  'MOM-05': 'core.flash',
  'MOM-06': 'core.endCard',
  // 2026-10-30: Tellcut's own dachshund (MOM-07 was common.logo, retired)
  'MOM-08': 'common.dachshund',
  'SFX-ALR-01': 'common.beep',
  'SFX-ALR-02': 'common.tick',
  'SFX-ALR-03': 'common.error',
  'SFX-ALR-04': 'common.deflate',
  'SFX-ALR-05': 'common.alarm',
  'SFX-ALR-06': 'common.dingdong',
  'SFX-ALR-07': 'common.ringbell',
  'SFX-ALR-08': 'common.buzz',
  'SFX-ALR-09': 'common.hush',
  'SFX-CHM-01': 'common.ding',
  'SFX-CHM-02': 'common.cash',
  'SFX-CHM-03': 'common.xylo',
  'SFX-CHM-04': 'common.chime',
  'SFX-CHM-05': 'common.coin',
  'SFX-CHM-06': 'common.fanfare',
  'SFX-CHM-07': 'common.recv',
  'SFX-CHM-08': 'common.shing',
  'SFX-HIT-01': 'common.impact',
  'SFX-HIT-02': 'common.pop',
  'SFX-HIT-03': 'common.thud',
  'SFX-HIT-04': 'common.explode',
  'SFX-HIT-05': 'common.knock',
  'SFX-HIT-06': 'common.boing',
  'SFX-MOV-01': 'common.whoosh',
  'SFX-MOV-02': 'common.riser',
  'SFX-MOV-03': 'common.scratch',
  'SFX-MOV-04': 'common.powerup',
  'SFX-MOV-05': 'common.ffwd',
  'SFX-MOV-06': 'common.rattle',
  'SFX-MOV-07': 'common.footstep',
  'SFX-MOV-08': 'common.flap',
  'SFX-MOV-09': 'common.whirr',
  'SFX-MOV-10': 'common.send',
  'SFX-MOV-11': 'common.rewind',
  'SFX-MOV-12': 'common.air',
  'SFX-PAP-01': 'common.shutter',
  'SFX-PAP-02': 'common.typing',
  'SFX-PAP-03': 'common.page',
  'SFX-PAP-04': 'common.slide',
  'SFX-PAP-05': 'common.flip',
  'SFX-PAP-06': 'common.print',
  'SFX-PAP-07': 'common.clunk',
  'SFX-PAP-08': 'common.tear',
  'SFX-PAP-09': 'common.scribble',
  'SFX-PAP-10': 'common.tape',
  'SFX-LIF-01': 'common.clink',
  'SFX-LIF-02': 'common.drip',
  'SFX-LIF-03': 'common.sizzle',
  'SFX-LIF-04': 'common.pour',
  'SFX-LIF-05': 'common.cry',
  'SFX-LIF-06': 'common.thunder',
  'MUS-01': 'style:pluck',
  'MUS-02': 'style:lofi',
  'MUS-03': 'style:cinematic',
  'MUS-04': 'style:tech',
  'MUS-05': 'style:playful',
  'MUS-06': 'style:bout-bell',
  'MUS-07': 'style:chiptune',
  'MUS-08': 'style:funk-minor',
  'MUS-09': 'style:garden-folk',
  'MUS-10': 'style:guzheng-pop',
  'MUS-11': 'style:hijaz-route',
  'MUS-12': 'style:lullaby-box',
  'MUS-13': 'style:market-groove',
  'MUS-14': 'style:mischief',
  'MUS-15': 'style:postcard-felt',
  'MUS-16': 'style:queue-call',
  'MUS-17': 'style:quote-drop',
  'MUS-18': 'style:rail-beat',
  'MUS-19': 'style:receipt-hop',
  'MUS-20': 'style:steelpan-bossa',
  'MUS-21': 'style:walking-pizz',
  'MUS-22': 'style:candle-glow',
  'MUS-23': 'style:night-studio',
  'RCP-01': 'recipe:travel',
  'RCP-02': 'recipe:hook',
  'RCP-03': 'recipe:montage',
  'CLP-01': 'clip.shake',
  'CLP-02': 'clip.follow',
  'CLP-03': 'clip.avoidBurned',
};
/** handles whose block (or style, recipe…) is gone: kept so they are never given out again, with the id they had */
export const RETIRED: Readonly<Record<string, string>> = {
  // 2026-10-28: the brand preset's template blocks and recipe; brand films build their own 3D with ThreeKit
  'TRV-10': 'common.globe',
  'FRM-10': 'common.dolly',
  'FRM-11': 'common.wall',
  'MOM-07': 'common.logo',
  'RCP-04': 'recipe:brand',
};
/** ids that changed category after getting their handle: they keep it, so its prefix no longer matches */
export const MOVED: readonly string[] = [];

/** a handle as written here: three capitals (two groups for a sound effect), a dash, two digits or more */
export const HANDLE_FORMAT = /^[A-Z]{3}(-[A-Z]{3})?-\d{2,}$/;
const ID_TO_HANDLE = new Map(Object.entries(HANDLES).map(([h, id]) => [id, h]));

/** the handle of a block or sound effect type id (or style:<id>, recipe:<id>, clip.<name>) */
export const handleOf = (id: string): string | undefined => ID_TO_HANDLE.get(id);

/** what someone typed (mrk-3, MRK3, sfx hit 2, Mrk-003) as a handle (MRK-03, SFX-HIT-02); undefined when it does not look like one */
export function normalizeHandle(s: string): string | undefined {
  const m = /^([A-Z]{3})[-_ ]?(?:([A-Z]{3})[-_ ]?)?(\d{1,4})$/.exec(s.trim().toUpperCase());
  if (!m) return undefined;
  return `${m[1]}${m[2] ? `-${m[2]}` : ''}-${String(Number(m[3])).padStart(2, '0')}`;
}

/** the id a typed handle stands for (undefined: not a handle, or not one in use) */
export const idOfHandle = (s: string): string | undefined => { const h = normalizeHandle(s); return h ? HANDLES[h] : undefined; };
