// Title templates (spec 2026-11-05-title-templates): a look with its layout, backing, entrance, exit, colours and font, under a name
// (and a gallery handle, TTL-xx in @tellcut/protocol's HANDLES as title:<id>). They are what people and the agent pick for
// common.heading: an item names one in `template`, a project in meta.titleTemplate for every title that names none. An item's own
// parameters win over its template, the template over the project's, that over the defaults and the theme (caption/templates.ts).
import type { CaptionTemplate } from '../caption/templates.ts';

export type TitleTemplate = CaptionTemplate;

export const TITLE_TEMPLATES: TitleTemplate[] = [
  { id: 'plain-center', label: '置中白字', doc: '白字置中、淡入淡出，畫面本身夠乾淨時最不搶戲', params: { style: 'plain', layout: 'center', animIn: 'fade', animOut: 'fade' } },
  { id: 'doc-rules', label: '紀錄片細線', doc: '明體字，上下兩條細線先從中間畫出來再出字，紀錄片、人文片的片名和章節', params: { style: 'soft', font: 'Noto Serif TC', size: 7, backing: 'rules', animIn: 'rule', animOut: 'fade' } },
  { id: 'lower-bar', label: '左下色條', doc: '粗黑體在左下，左邊一條主色色條，擦出來；地名、人名、段落標題', params: { style: 'heavy', layout: 'lower', size: 7, backing: 'bar', animIn: 'wipe', animOut: 'fade' } },
  { id: 'neon-scrim', label: '霓虹壓暗', doc: '整個畫面壓暗，中間一行霓虹字由模糊對焦亮起來；夜景、派對、開場', params: { style: 'neon', backing: 'scrim', animIn: 'focus', animOut: 'blur' } },
  { id: 'gold-black', label: '黑底金字', doc: '全黑畫面上的金色襯線字，由模糊對焦、字距散開離場；片頭、片尾、典禮', params: { style: 'gold', font: 'Cactus Classical Serif', backing: 'black', animIn: 'focus', animOut: 'spread' } },
  { id: 'sticker-bounce', label: '貼紙彈出', doc: '白邊貼紙字整個彈出來、縮小離場；輕鬆的 vlog、開箱、美食', params: { style: 'sticker', animIn: 'bounce', animOut: 'shrink' } },
  { id: 'vhs-corner', label: '錄影帶角落字', doc: '右上角小小的錄影帶畫面字，一個字一個字打出來；復古、家庭錄影', params: { style: 'vhs', layout: 'corner', animIn: 'typewriter', animOut: 'none' } },
  { id: 'cinema-band', label: '電影暗帶', doc: '細字放在一條暗色橫帶上，字距由寬收緊、散開離場；旅行片、電影感片名', params: { style: 'cinema', backing: 'band', animIn: 'track', animOut: 'spread' } },
];

const BY_ID = new Map(TITLE_TEMPLATES.map((t) => [t.id, t]));
export const titleTemplateOf = (id: unknown): TitleTemplate | undefined => (typeof id === 'string' && id ? BY_ID.get(id) : undefined);
