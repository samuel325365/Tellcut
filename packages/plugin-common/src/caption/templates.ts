// Caption templates: a look with its word effect, entrance, exit, colours and font, under a name (and a gallery handle, CAP-xx in
// @tellcut/protocol's HANDLES as caption:<id>). They are what people and the agent pick: an item names one in `template`, a project
// in meta.captionTemplate for every caption that names none. An item's own parameters win over its template, the template over the
// project's, that over the look's defaults and the theme.
export interface CaptionTemplate {
  id: string;
  /** Chinese name and one-line look (English and Japanese ones are in the editor's dictionaries, keyed caption:<id>) */
  label: string; doc: string;
  /** the caption parameters it sets (style, wordFx, animIn, animOut, colours, font, size…) */
  params: Record<string, unknown>;
}

export const TEMPLATES: CaptionTemplate[] = [
  { id: 'clean', label: '清晰描邊', doc: '白字黑描邊，最不搶戲的講話字幕', params: { style: 'outline' } },
  { id: 'bare', label: '純白字', doc: '只有白字，畫面本身夠暗、夠乾淨時用', params: { style: 'plain' } },
  { id: 'darkbox', label: '深色底框', doc: '白字在半透明深色圓角框上，畫面很花也讀得到', params: { style: 'box' } },
  { id: 'bubble', label: '對話氣泡', doc: '米白氣泡、粗黑框、墨色字，強調字用主色', params: { style: 'bubble' } },
  { id: 'receipt', label: '收據紙條', doc: '印在鋸齒撕邊的收據紙上，從下面彈出來', params: { style: 'ticket' } },
  { id: 'crayon', label: '蠟筆底帶', doc: '墨色字壓在蠟筆塗的高亮色底帶上，繪本、手作風', params: { style: 'crayon', font: 'LXGW WenKai TC' } },
  { id: 'snippet', label: '搜尋摘要條', doc: '深色圓角橫條、左邊一條細色條，像搜尋結果的摘要', params: { style: 'bar' } },
  { id: 'interview', label: '雜誌訪談', doc: '靠左的襯線字壓在深色漸層上，Q、A 或名字放進左邊的徽章', params: { style: 'qa' } },
  { id: 'autocap', label: '自動字幕', doc: '深色圓角底白字，從 0.88 倍輕輕彈出，像社群平台的自動字幕', params: { style: 'auto' } },
  { id: 'sticker', label: '大字貼圖', doc: '手寫大字、高亮色、粗黑描邊，從 0.6 倍彈出，吐槽、反應', params: { style: 'big', position: 'center' } },
  { id: 'strips', label: '手帳紙條', doc: '一行一條微歪的米色紙條，講到的詞後面刷螢光筆', params: { style: 'strip' } },
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
export const templateOf = (id: unknown): CaptionTemplate | undefined => (typeof id === 'string' && id ? BY_ID.get(id) : undefined);

/** The parameters a caption draws with: its own (`own`, as the item sets them), then its template's (or the project's, when it names
 *  none and `projectTemplate` is set) over `params` (its parameters with the defaults and the theme filled in). */
export function withTemplate<P extends object>(params: P, own: Record<string, unknown> | undefined, projectTemplate?: string): P {
  const t = templateOf(own?.template) ?? (own?.template ? undefined : templateOf(projectTemplate));
  if (!t) return params;
  const out = { ...params } as Record<string, unknown>;
  for (const [k, v] of Object.entries(t.params)) if (!own || !(k in own)) out[k] = v;
  return out as P;
}
