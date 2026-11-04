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
  // first batch of the caption-style expansion (2026-11-05)
  { id: 'punch-box', label: '短影音底塊', doc: '粗描邊白字，一塊黃底跟著講到的詞滑過去，整句彈出來', params: { style: 'punch', wordFx: 'box', animIn: 'bounce' } },
  { id: 'punch-color', label: '描邊跳詞', doc: '粗描邊白字，講到的詞變高亮色、稍微放大', params: { style: 'punch', wordFx: 'color', animIn: 'rise' } },
  { id: 'punch-roll', label: '描邊滾上來', doc: '粗描邊白字從下面翻滾上來，最後往下掉出去', params: { style: 'punch', animIn: 'roll', animOut: 'drop' } },
  { id: 'double-pop', label: '雙描邊彈詞', doc: '白字加墨色和主色兩層描邊，一個詞一個詞彈出來', params: { style: 'double', wordFx: 'pop', animIn: 'none' } },
  { id: 'soft-fade', label: '柔影淡入', doc: '只有柔和陰影的白字，慢慢淡入淡出，安靜的畫面', params: { style: 'soft', animIn: 'fade', animOut: 'fade', animDur: 0.45 } },
  { id: 'frost-color', label: '毛玻璃跳詞', doc: '毛玻璃底框、白字，講到的詞變淡藍並放大，模糊淡入', params: { style: 'frost', wordFx: 'color', animIn: 'blur', hl: '#9fe3ff' } },
  { id: 'frost-underline', label: '毛玻璃底線', doc: '毛玻璃底框，講到的詞下面畫出一道底線', params: { style: 'frost', wordFx: 'underline', animIn: 'rise', hl: '#9fe3ff' } },
  { id: 'cinema', label: '電影字幕', doc: '中等粗細、字距稍寬、緊貼陰影的白字，淡入淡出，像電影字幕', params: { style: 'cinema', animIn: 'fade', animOut: 'fade', size: 3.6 } },
  { id: 'cinema-type', label: '打字機字幕', doc: '電影字幕的字照講話的時間一個字一個字打出來，後面跟著游標', params: { style: 'cinema', wordFx: 'type', animIn: 'none', size: 3.6 } },
  { id: 'slab-wipe', label: '斜色塊擦出', doc: '一行一塊斜切的主色色塊壓白字，從左擦出、從左擦掉', params: { style: 'slab', animIn: 'wipe', animOut: 'wipe' } },
  { id: 'hollow-color', label: '空心跳詞', doc: '只有外框的空心字，講到的詞填滿高亮色，由大縮小進場', params: { style: 'hollow', wordFx: 'color', animIn: 'zoom' } },
  { id: 'marker-fill', label: '螢光筆點亮', doc: '一行一道螢光筆刷底、墨色字，還沒講到的詞是淡的', params: { style: 'marker', wordFx: 'fill', animIn: 'wipe' } },
  { id: 'neon-fill', label: '霓虹逐字點亮', doc: '粉紅霓虹燈管字，還沒講到的詞是暗的，講到時亮起來，講到的詞變藍光', params: { style: 'neon', wordFx: 'fill', animIn: 'blur', hl: '#ff3db8', accent: '#29e7ff' } },
  { id: 'neon-wave', label: '霓虹波浪', doc: '藍色霓虹字輕輕上下波動，故障閃入', params: { style: 'neon', wordFx: 'wave', animIn: 'glitch', hl: '#3fb6ff', accent: '#ff5fa2' } },
  { id: 'gradient-zoom', label: '漸層大字', doc: '白到橘的漸層大字、深色硬邊，講到的詞換藍色漸層，由大縮小', params: { style: 'gradient', wordFx: 'color', animIn: 'zoom', hl: '#ffe2a8', accent: '#ff8a4c', size: 6, position: 'center' } },
  { id: 'gradient-one', label: '漸層一次一詞', doc: '畫面中間一次只出現一個漸層大字', params: { style: 'gradient', wordFx: 'one', animIn: 'none', hl: '#ffe2a8', accent: '#ff8a4c', size: 9, position: 'center' } },
  { id: 'extrude-one', label: '一次一個詞', doc: '黃色 3D 立體字，畫面中間一次只出現一個詞，彈出來', params: { style: 'extrude', wordFx: 'one', animIn: 'none', hl: '#ffd23f', accent: '#e8742c', size: 9, position: 'center' } },
  { id: 'extrude-stretch', label: '立體彈跳', doc: '黃色 3D 立體字彈性拉伸進場，詞一個個彈出', params: { style: 'extrude', wordFx: 'pop', animIn: 'stretch', hl: '#ffd23f', accent: '#e8742c', size: 6 } },
  { id: 'sticker-pop', label: '手寫貼紙', doc: '白邊手寫貼紙字，一個詞一個詞掉下來再彈出，強調字用紅', params: { style: 'sticker', wordFx: 'pop', animIn: 'drop', accent: '#ff4f6a', bubbleBg: '#ffffff' } },
  { id: 'sticker-wave', label: '貼紙波浪', doc: '白邊手寫貼紙字從四周聚合過來，之後輕輕波動', params: { style: 'sticker', wordFx: 'wave', animIn: 'scatter', accent: '#ff4f6a', bubbleBg: '#ffffff' } },
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
