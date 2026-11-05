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
  { id: 'serif-focus', label: '明體對焦', doc: '明體字略為拉開字距，由模糊對焦出來；人文、紀錄片、美食的片名', params: { style: 'serif', animIn: 'focus', animOut: 'fade' } },
  { id: 'spaced-track', label: '寬字距片名', doc: '全大寫細字、字距很寬，字距由寬收緊、散開離場；電影感的英文片名、旅行片', params: { style: 'spaced', animIn: 'track', animOut: 'spread' } },
  { id: 'stack-left', label: '雜誌堆疊', doc: '第一行大字、後面幾行小一半的高亮字，靠左，由下往上露出；雜誌風、清單的段落標題', params: { style: 'stack', layout: 'left', animIn: 'mask', animOut: 'sink' } },
  { id: 'sign-glitch', label: '霓虹招牌', doc: '深色招牌板上發光的霓虹管字，故障閃入；夜市、酒吧、店名', params: { style: 'sign', animIn: 'glitch', animOut: 'fade' } },
  { id: 'vintage-card', label: '復古卡片', doc: '米白色的老式襯線字壓在深色卡片上，緩緩上升；老店、家族故事、回憶', params: { style: 'vintage', backing: 'card', backColor: '#2b2420e6', animIn: 'rise', animOut: 'fade' } },
  { id: 'seal-stamp', label: '雙線印章', doc: '主色的雙線框印章字、微微傾斜，由大縮小蓋下來；認證、結論、店家推薦', params: { style: 'seal', animIn: 'zoom', animOut: 'fade' } },
  { id: 'split-open', label: '上下雙色', doc: '字的上半白、下半高亮色，從中間往兩邊打開、往下收掉；運動、潮流、開場', params: { style: 'split', animIn: 'open', animOut: 'sink' } },
  { id: 'giant-full', label: '撐滿巨字', doc: '最粗的巨大字撐滿畫面寬、深色柔影，由模糊對焦；開場一個字、章節數字', params: { style: 'giant', layout: 'full', animIn: 'focus', animOut: 'fade' } },
  { id: 'script-lower', label: '手寫底線', doc: '手寫字加一筆高亮色底線，在左下擦出來；vlog、手帳風的地名和日期', params: { style: 'script', layout: 'lower', size: 7, animIn: 'wipe', animOut: 'fade' } },
  { id: 'ribbon-top', label: '緞帶標題', doc: '每行字放在主色、兩端有缺口的緞帶上，在上方彈出來；活動、慶祝、清單標題', params: { style: 'ribbon', layout: 'top', size: 6, animIn: 'bounce', animOut: 'shrink' } },
  { id: 'chalk-board', label: '黑板粉筆', doc: '黑板上的粉筆字、木框，淡入；教學、課堂、菜單', params: { style: 'chalk', size: 7, animIn: 'fade', animOut: 'fade' } },
  { id: 'gradient-full', label: '漸層巨字', doc: '漸層填色的大字撐滿畫面寬，由大縮小落下；開場、倒數、重點數字', params: { style: 'gradient', layout: 'full', animIn: 'zoom', animOut: 'shrink' } },
  { id: 'chrome-black', label: '鉻銀黑底', doc: '全黑畫面上的鉻銀金屬字，由模糊對焦、字距散開離場；科技、汽車、產品發表的片名', params: { style: 'chrome', backing: 'black', animIn: 'focus', animOut: 'spread' } },
  { id: 'frost-blur', label: '毛玻璃', doc: '背景模糊、霧白字由下往上露出、往下收掉；城市、咖啡、生活風的章節', params: { style: 'frost', backing: 'blur', animIn: 'mask', animOut: 'sink' } },
  { id: 'slab-lower', label: '左下字塊', doc: '實心色塊上的字放在左下，擦進擦出；人名、地名、店名', params: { style: 'slab', layout: 'lower', size: 6, animIn: 'wipe', animOut: 'wipe' } },
  { id: 'marker-left', label: '螢光筆標題', doc: '靠左的字後面塗一筆螢光筆，由下露出；筆記、教學、清單的段落', params: { style: 'marker', layout: 'left', size: 8, animIn: 'mask', animOut: 'sink' } },
  { id: 'duotone-open', label: '雙色錯位', doc: '兩種顏色錯開疊在一起的字，從中間打開、往下收掉；音樂、潮流、運動', params: { style: 'duotone', animIn: 'open', animOut: 'sink' } },
  { id: 'halo-scrim', label: '光暈壓暗', doc: '畫面壓暗，柔光暈的字由模糊對焦、模糊離場；夜晚、回憶、溫柔的開場', params: { style: 'halo', backing: 'scrim', animIn: 'focus', animOut: 'blur' } },
  { id: 'extrude-bounce', label: '立體彈出', doc: '有厚度的立體字整個彈出來、縮小離場；遊戲、兒童、輕鬆的開場', params: { style: 'extrude', animIn: 'bounce', animOut: 'shrink' } },
  { id: 'longshadow-top', label: '長影子', doc: '斜斜拖著長影子的扁平字在上方由下露出；資訊、科普、知識頻道', params: { style: 'longshadow', layout: 'top', animIn: 'mask', animOut: 'sink' } },
  { id: 'pixel-top', label: '像素遊戲', doc: '像素字在上方一個字一個字打出來；遊戲、關卡、挑戰', params: { style: 'pixel', layout: 'top', animIn: 'typewriter', animOut: 'none' } },
  { id: 'terminal-left', label: '終端機', doc: '黑底綠字的終端機文字靠左打出來；程式、科技、駭客風', params: { style: 'terminal', layout: 'left', size: 6, animIn: 'typewriter', animOut: 'none' } },
  { id: 'rgb-scrim', label: '色偏故障', doc: '紅藍色偏的字在壓暗的畫面上故障閃入；電子音樂、科技、驚悚', params: { style: 'rgb', backing: 'scrim', animIn: 'glitch', animOut: 'blur' } },
  { id: 'ransom-bounce', label: '剪報拼字', doc: '剪報拼貼的字逐字彈出、縮小離場；搞笑、懸疑、惡作劇', params: { style: 'ransom', animIn: 'pop', animOut: 'shrink' } },
  { id: 'tape-top', label: '紙膠帶', doc: '字貼在紙膠帶上、放在上方彈性拉出；手作、手帳、生活 vlog', params: { style: 'tape', layout: 'top', size: 6, animIn: 'stretch', animOut: 'fade' } },
  { id: 'postit-left', label: '便利貼', doc: '便利貼上的字靠左翻出來；待辦、提醒、學習筆記', params: { style: 'postit', layout: 'left', size: 7, animIn: 'flip', animOut: 'fade' } },
  { id: 'ticket-bottom', label: '票根', doc: '票根樣式的字在下方升起；旅行、電影、展覽', params: { style: 'ticket', layout: 'bottom', size: 6, animIn: 'rise', animOut: 'fade' } },
  { id: 'punch-zoom', label: '重點衝擊', doc: '粗重有衝擊感的字由大縮小砸下、縮小離場；重點、反轉、結論', params: { style: 'punch', animIn: 'zoom', animOut: 'shrink' } },
  { id: 'credit-bottom', label: '片尾名單', doc: '下方一行寬字距的細字，字距收緊出現、散開離場；工作人員、片尾、出處', params: { style: 'spaced', layout: 'bottom', size: 4, animIn: 'track', animOut: 'spread' } },
  { id: 'serif-card', label: '白卡明體', doc: '米白卡片上的深色明體字，緩緩上升；書、展覽、溫和的人文片', params: { style: 'serif', backing: 'card', backColor: '#f4efe6eb', color: '#1f1a16', subColor: '#8a5a2b', kickerColor: '#8a5a2b', animIn: 'rise', animOut: 'fade' } },
  { id: 'neon-rules', label: '霓虹細線', doc: '上下兩條細線先畫出來，霓虹字再亮起；夜景、酒吧、活動', params: { style: 'neon', backing: 'rules', animIn: 'rule', animOut: 'fade' } },
  { id: 'giant-mask', label: '巨字露出', doc: '撐滿畫面寬的巨大字由下往上露出、往下收掉；章節數字、一個字的開場', params: { style: 'giant', layout: 'full', animIn: 'mask', animOut: 'sink' } },
  { id: 'scrapbook-card', label: '剪貼簿標題卡', doc: '奶油色卡片上橘紅的粗襯線字，上下雙線、左上露出一塊青綠紙片，微斜；剪貼簿、旅行、家庭的片名（配 common.prints）', params: { style: 'scrapbook', layout: 'top', accent: '#d9533a', hl: '#1f9e93', animIn: 'zoom', animOut: 'fade' } },
];

const BY_ID = new Map(TITLE_TEMPLATES.map((t) => [t.id, t]));
export const titleTemplateOf = (id: unknown): TitleTemplate | undefined => (typeof id === 'string' && id ? BY_ID.get(id) : undefined);
