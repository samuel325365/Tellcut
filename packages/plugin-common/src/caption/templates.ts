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
  // second and third batches (2026-11-05)
  { id: 'heavy-rise', label: '重陰影', doc: '極粗的字配一道往右下的硬陰影，像海報', params: { style: 'heavy', animIn: 'rise' } },
  { id: 'heavy-pop', label: '重陰影彈詞', doc: '極粗硬陰影字一個詞一個詞彈出來', params: { style: 'heavy', wordFx: 'pop', animIn: 'none' } },
  { id: 'offset-color', label: '雙色錯位', doc: '高亮色的字後面錯開一層第二色，像印歪的海報，講到的詞變白', params: { style: 'offset', wordFx: 'color' } },
  { id: 'offset-glitch', label: '錯位故障', doc: '雙色錯位字故障閃入、從右擦掉', params: { style: 'offset', animIn: 'glitch', animOut: 'wipe' } },
  { id: 'gold-zoom', label: '金屬金', doc: '亮面金色漸層字、咖啡色邊，由大縮小，講到的詞變亮金', params: { style: 'gold', wordFx: 'color', animIn: 'zoom' } },
  { id: 'gold-one', label: '金字一次一詞', doc: '畫面中間一次只出現一個金色大字', params: { style: 'gold', wordFx: 'one', animIn: 'none', size: 9, position: 'center' } },
  { id: 'chrome-flip', label: '鉻銀翻轉', doc: '冷調銀色金屬字翻轉進場', params: { style: 'chrome', animIn: 'flip' } },
  { id: 'chrome-color', label: '鉻銀跳詞', doc: '鉻銀字，講到的詞染上藍色金屬光', params: { style: 'chrome', wordFx: 'color', hl: '#7fd4ff' } },
  { id: 'flow-fade', label: '流動漸層', doc: '藍粉漸層在字裡一直流動', params: { style: 'flow', animIn: 'fade', hl: '#7cf8ff', accent: '#ff5fa2' } },
  { id: 'flow-wave', label: '流動波浪', doc: '黃橘流動漸層字輕輕波動', params: { style: 'flow', wordFx: 'wave', animIn: 'blur', hl: '#ffe14d', accent: '#ff7a59' } },
  { id: 'halo-fill', label: '柔光點亮', doc: '白字帶粉色柔光，還沒講到的詞是淡的', params: { style: 'halo', wordFx: 'fill', hl: '#ffb3e6' } },
  { id: 'halo-blur', label: '柔光模糊', doc: '藍色柔光白字，模糊進、模糊出', params: { style: 'halo', animIn: 'blur', animOut: 'blur', hl: '#9fd8ff' } },
  { id: 'duotone-pop', label: '雙色調彈詞', doc: '上半黃、下半粉的雙色字，一個詞一個詞彈出', params: { style: 'duotone', wordFx: 'pop', animIn: 'none', hl: '#ffe14d', accent: '#ff5c7a' } },
  { id: 'duotone-slide', label: '雙色調滑入', doc: '上半青綠、下半藍的雙色字滑進滑出', params: { style: 'duotone', animIn: 'slide', animOut: 'slide', hl: '#7fd4c8', accent: '#3d7bff' } },
  { id: 'longshadow-drop', label: '長陰影掉落', doc: '字拖著往右下的長陰影，一個詞一個詞掉下來', params: { style: 'longshadow', animIn: 'drop' } },
  { id: 'longshadow-one', label: '長陰影一次一詞', doc: '畫面中間一次一個帶長陰影的大字', params: { style: 'longshadow', wordFx: 'one', animIn: 'none', size: 9, position: 'center' } },
  { id: 'emboss-fade', label: '浮雕名牌', doc: '灰色金屬牌上的浮雕字，淡入淡出', params: { style: 'emboss', animIn: 'fade', animOut: 'fade' } },
  { id: 'emboss-type', label: '浮雕打字', doc: '浮雕名牌上的字照講話的時間打出來', params: { style: 'emboss', wordFx: 'type', animIn: 'none' } },
  { id: 'block-bounce', label: '積木字彈跳', doc: '白色粗框積木字，下面一層厚厚的主色側邊，詞一個個彈出', params: { style: 'block', wordFx: 'pop', animIn: 'bounce' } },
  { id: 'block-color', label: '積木字跳詞', doc: '積木字，講到的詞變高亮色', params: { style: 'block', wordFx: 'color', animIn: 'rise' } },
  { id: 'puffy-pop', label: '膨膨字', doc: '圓圓鼓起的粉色字、厚白邊，一個詞一個詞彈出', params: { style: 'puffy', wordFx: 'pop', animIn: 'bounce', hl: '#ffd1e8', accent: '#ff5fa2' } },
  { id: 'puffy-wave', label: '膨膨波浪', doc: '水藍膨膨字彈性拉伸進場、之後輕輕波動', params: { style: 'puffy', wordFx: 'wave', animIn: 'stretch', hl: '#bfe8ff', accent: '#3d7bff' } },
  { id: 'tape-wipe', label: '紙膠帶', doc: '一行一條薄荷色紙膠帶、墨色字，從左貼上、撕掉', params: { style: 'tape', animIn: 'wipe', animOut: 'wipe', hl: '#9fe3c8' } },
  { id: 'tape-color', label: '紙膠帶跳詞', doc: '杏色紙膠帶，講到的詞變主色', params: { style: 'tape', wordFx: 'color', hl: '#ffd6a5' } },
  { id: 'postit-type', label: '便利貼', doc: '微歪的黃色便利貼、手寫字照講話的時間寫出來', params: { style: 'postit', wordFx: 'type', animIn: 'bounce' } },
  { id: 'postit-flip', label: '粉紅便利貼', doc: '粉紅便利貼翻轉進場', params: { style: 'postit', animIn: 'flip', accent: '#ffc4dd' } },
  { id: 'label-type', label: '標籤機', doc: '一行一條黑色標籤帶、白色凸字，照講話打出來', params: { style: 'label', wordFx: 'type', animIn: 'none' } },
  { id: 'label-stretch', label: '標籤機彈出', doc: '標籤帶彈性拉伸進場、縮小離場', params: { style: 'label', animIn: 'stretch', animOut: 'shrink' } },
  { id: 'ransom-pop', label: '剪報拼字', doc: '每個字一塊不同顏色、字型、角度的剪報紙，一個詞一個詞彈出', params: { style: 'ransom', wordFx: 'pop', animIn: 'none' } },
  { id: 'ransom-scatter', label: '剪報聚合', doc: '剪報字從四周聚合過來，最後掉下去', params: { style: 'ransom', animIn: 'scatter', animOut: 'drop' } },
  { id: 'rgb-glitch', label: 'RGB 故障', doc: '紅、青兩層錯開的白字，故障閃入、模糊離場', params: { style: 'rgb', animIn: 'glitch', animOut: 'blur' } },
  { id: 'rgb-color', label: 'RGB 跳詞', doc: 'RGB 錯開的字，講到的詞變高亮色', params: { style: 'rgb', wordFx: 'color' } },
  { id: 'pixel-type', label: '像素打字', doc: '8 位元遊戲字照講話的時間打出來', params: { style: 'pixel', wordFx: 'type', animIn: 'none' } },
  { id: 'pixel-pop', label: '像素彈詞', doc: '8 位元字一個詞一個詞彈出，強調字綠色', params: { style: 'pixel', wordFx: 'pop', animIn: 'none', hl: '#7cff6b' } },
  { id: 'vhs-type', label: '錄影帶打字', doc: '錄影帶畫面上的等寬大寫字，照講話打出來', params: { style: 'vhs', wordFx: 'type', animIn: 'none' } },
  { id: 'vhs-fade', label: '錄影帶畫面字', doc: '錄影帶畫面的白字帶色邊，故障閃入', params: { style: 'vhs', animIn: 'glitch', animOut: 'fade' } },
  { id: 'terminal-type', label: '終端機', doc: '深色主控台框裡的綠色等寬字，照講話打出來、後面跟著游標', params: { style: 'terminal', wordFx: 'type', animIn: 'none' } },
  { id: 'terminal-color', label: '終端機跳詞', doc: '終端機綠字，講到的詞變白亮', params: { style: 'terminal', wordFx: 'color', animIn: 'fade' } },
  { id: 'segment-type', label: '液晶顯示', doc: '灰綠液晶面板上的深色字，照講話一格一格亮起來', params: { style: 'segment', wordFx: 'type', animIn: 'none' } },
  { id: 'segment-roll', label: '液晶滾上來', doc: '液晶面板滾上來', params: { style: 'segment', animIn: 'roll' } },
  { id: 'scanline-glitch', label: '掃描線', doc: '藍色掃描線條紋字，故障閃入，像老螢幕', params: { style: 'scanline', animIn: 'glitch', hl: '#7cf8ff' } },
  { id: 'scanline-fill', label: '掃描線點亮', doc: '橘色掃描線字，還沒講到的詞是淡的', params: { style: 'scanline', wordFx: 'fill', hl: '#ffb347', accent: '#ffffff' } },
  { id: 'news-wipe', label: '新聞條', doc: '白底黑字、左邊一塊主色的新聞條，擦出擦掉', params: { style: 'news', animIn: 'wipe', animOut: 'wipe' } },
  { id: 'news-slide', label: '新聞條滑入', doc: '新聞條從左滑入，講到的詞變主色', params: { style: 'news', wordFx: 'color', animIn: 'slide', animOut: 'slide' } },
  { id: 'chat-pop', label: '對話泡泡', doc: '說話者 2、3 在右邊主色泡泡，其他人在左邊灰泡泡，彈出來', params: { style: 'chat', animIn: 'bounce' } },
  { id: 'chat-type', label: '對話泡泡打字', doc: '對話泡泡裡的字照講話打出來', params: { style: 'chat', wordFx: 'type', animIn: 'bounce' } },
  { id: 'lyric-fill', label: '歌詞', doc: '古典襯線白字帶柔光，唱到的詞亮起金光，還沒唱到的是淡的', params: { style: 'lyric', wordFx: 'fill', animIn: 'fade', animOut: 'fade', hl: '#ffd27a' } },
  { id: 'lyric-blur', label: '歌詞模糊', doc: '歌詞字模糊進、模糊出', params: { style: 'lyric', animIn: 'blur', animOut: 'blur' } },
  { id: 'dialog-type', label: '遊戲對話框', doc: '深藍雙框對話框，字照講話打出來', params: { style: 'dialog', wordFx: 'type', animIn: 'none' } },
  { id: 'dialog-roll', label: '對話框滾上來', doc: '遊戲對話框滾上來、縮小離場', params: { style: 'dialog', animIn: 'roll', animOut: 'shrink' } },
  { id: 'comic-bounce', label: '漫畫框', doc: '白底粗黑框、網點底的漫畫框，彈性拉伸進場', params: { style: 'comic', animIn: 'stretch' } },
  { id: 'comic-pop', label: '漫畫框彈詞', doc: '藍網點漫畫框，詞一個個彈出', params: { style: 'comic', wordFx: 'pop', animIn: 'bounce', hl: '#7fd4ff' } },
  { id: 'chalk-type', label: '黑板粉筆', doc: '黑板上的粉筆字照講話寫出來', params: { style: 'chalk', wordFx: 'type', animIn: 'none' } },
  { id: 'chalk-fade', label: '黑板淡入', doc: '黑板粉筆字淡入淡出', params: { style: 'chalk', animIn: 'fade', animOut: 'fade' } },
  { id: 'desk-type', label: '復古桌面訊息框', doc: '粉彩復古視窗樣子的訊息框（粉色標題列、深紫框、硬陰影），字照講話打出來（配 common.desktop 復古桌面）', params: { style: 'desk', wordFx: 'type', animIn: 'rise', size: 3.4, outline: '#4b3a8c', hl: '#f7b2cf' } },
  { id: 'scrap-chip', label: '剪貼簿紙條', doc: '一小張撕邊彩色紙條上的白色襯線字，微斜（配 common.prints 剪貼簿相片）', params: { style: 'scrap', hl: '#d9533a', size: 2.9, animIn: 'zoom', animOut: 'fade' } },
  { id: 'editorial-bar', label: '雜誌旁白條', doc: '白底、左邊一條主題第二色（accent2）細條、黑色明體字，靠左；雜誌風的旁白（配 common.masthead、common.spread）', params: { style: 'bar', boxBg: '#ffffff', color: '#161412', font: 'Noto Serif TC', align: 'left', size: 2.6, animIn: 'fade', animOut: 'fade' } },
  { id: 'mono-box', label: '黑白框字幕', doc: '黑底小框、內圈一道白細線、白色粗字（配 common.monoframe 黑白字框；反過來用 color 黑、outline 白）', params: { style: 'mono', size: 2.6, color: '#ffffff', outline: '#0d0d0d', animIn: 'zoom', animOut: 'fade' } },
  { id: 'color-boxes', label: '單色疊框', doc: '一行一塊直角的主色方框、黑色粗黑體，靠左，擦出來；照拍子的快剪（配 common.grade 單色調色、common.poster 海報頁）', params: { style: 'boxes', color: '#111111', size: 2.8, animIn: 'wipe', animOut: 'none' } },
  { id: 'story-serif', label: '芥末黃明體', doc: '芥末黃的明體字置中、淡入淡出，放在影片上下的素色色塊上（common.backdrop solid ＋片段 frame）；故事書風、Wes Anderson 風的旅行片（配標題範本 storybook）', params: { style: 'plain', font: 'Noto Serif TC', color: '#e8b13c', size: 2.5, animIn: 'fade', animOut: 'fade' } },
  { id: 'comic-narration', label: '漫畫旁白框', doc: '黃底細黑框的漫畫旁白框，靠左上角擦出（配 common.comic 漫畫頁）', params: { style: 'narration', position: 'top', size: 3, animIn: 'wipe', hl: '#ffe14d' } },
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
export const templateOf = (id: unknown): CaptionTemplate | undefined => (typeof id === 'string' && id ? BY_ID.get(id) : undefined);

/** The parameters a caption draws with: its own (`own`, as the item sets them), then its template's (or the project's, when it names
 *  none and `projectTemplate` is set) over `params` (its parameters with the defaults and the theme filled in); `projectTemplates`:
 *  the project's own, by id; `builtIn`: the built-in list it looks in (title templates for common.heading). */
export function withTemplate<P extends object>(params: P, own: Record<string, unknown> | undefined, projectTemplate?: string, projectTemplates?: Record<string, Record<string, unknown>>,
  builtIn: (id: unknown) => { params: Record<string, unknown> } | undefined = templateOf): P {
  // the project's own templates (copied from My caption templates) first, then the built-in ones
  const find = (id: unknown) => (typeof id === 'string' && id && projectTemplates?.[id] ? { params: projectTemplates[id] } : builtIn(id));
  const t = find(own?.template) ?? (own?.template ? undefined : find(projectTemplate));
  if (!t) return params;
  const out = { ...params } as Record<string, unknown>;
  for (const [k, v] of Object.entries(t.params)) if (!own || !(k in own)) out[k] = v;
  return out as P;
}
