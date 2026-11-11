// common.desktop, the desktop of the pastel retro computer kit (desk-kit.ts) for the whole film: a gradient that changes colour each
// chapter, a faint grid, pixel clouds drifting, twinkles, a menu bar, a globe and folders, and a taskbar whose buttons are the chapters,
// the current one lit. A pure function of time.
import { clamp, eIO3 as eIO, rng, type ItemType } from '@tellcut/engine';
import { mixHex } from './color.ts';
import { CJK, PIX, canvasIn, deskSlot, fit, fonts, rr } from './desk-kit.ts';

export interface DeskChapter { t: number; name: string; top: string; bottom: string }
/** the chapters: "seconds|name|top colour|bottom colour" one a line */
export function deskChapters(text: string): DeskChapter[] {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [t, name = '', top, bottom] = l.split('|').map((s) => s.trim());
    return { t: Number(t) || 0, name, top: top || '#ffd6b8', bottom: bottom || '#cdb8f5' };
  });
}

// ── common.desktop
interface DP { chapters: string; menu: string; start: string; app: string; ink: string; paper: string; seed: number }
interface DS { c: HTMLCanvasElement; text: string }
export const desktop: ItemType<DP, DS> = {
  type: 'common.desktop', label: '復古桌面', category: 'phone', kind: 'scene',
  doc: '粉彩復古電腦的桌面，整支片一個：每章換一組漸層色（淡格線、像素雲慢慢飄、小星星閃），頂端選單列（menu）和右上的程式名（app），左上地球、右邊三個資料夾，底部工作列「★ 開始」＋每章一顆 .exe 按鈕、現在這章的亮起來（章節進度就在工作列上）；chapters 一行一章「秒|名稱|上色|下色」；配 common.window 視窗（章末飛進自己那章的按鈕）、common.popup 對話框、common.touch 的 cursor 游標、字幕範本 desk-type 訊息框；生日、派對、回憶相簿、「打開檔案」式的整理影片',
  params: [
    { key: 'chapters', label: '章節（一行一章：秒|名稱|上色|下色）', type: 'text', default: '0|準備|#ffd6b8|#cdb8f5\n1.5|派對|#ffc4dc|#d9c2f7' },
    { key: 'menu', label: '選單（逗號分隔）', type: 'string', default: '檔案,編輯,檢視,派對' },
    { key: 'start', label: '開始按鈕的字', type: 'string', default: '開始' },
    { key: 'app', label: '右上角的程式名', type: 'string', default: 'PARTY.EXE' },
    { key: 'ink', label: '線和字的顏色', type: 'color', default: '#4b3a8c' },
    { key: 'paper', label: '選單列和工作列的底色', type: 'color', default: '#fffaf0' },
    { key: 'seed', label: '雲和星星的亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 5 },
  ],
  build(ctx) { return { c: canvasIn(ctx.root), text: `${ctx.params.chapters}${ctx.params.menu}${ctx.params.start}★♥.exe` }; },
  ready(s) { return fonts(s.text); },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, k = Math.min(W, H) / 1080;
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const ch = deskChapters(p.chapters);
    if (!ch.length) ch.push({ t: 0, name: '', top: '#ffd6b8', bottom: '#cdb8f5' });
    let n = 0; ch.forEach((c, i) => { if (local >= c.t) n = i; });
    const prev = ch[Math.max(0, n - 1)], cur = ch[n], q = n === 0 ? 1 : eIO(clamp((local - cur.t) / 0.6));
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, mixHex(prev.top, cur.top, q)); grd.addColorStop(1, mixHex(prev.bottom, cur.bottom, q));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.32)'; g.lineWidth = 1.5 * k;
    for (let x = 0; x <= W; x += 54 * k) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += 54 * k) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const r = rng(p.seed);
    for (let i = 0; i < 6; i++) {   // pixel clouds drifting right, wrapping round
      const y = (0.18 + r() * 0.62) * H, sp = (8 + r() * 10) * k, span = W + 300 * k, x = ((r() * span + local * sp) % span) - 150 * k, b = (10 + r() * 6) * k;
      g.fillStyle = 'rgba(255,255,255,0.92)';
      for (const [dx, dy, len] of [[1, 0, 3], [0, 1, 6], [2, -1, 2]]) g.fillRect(x + dx * b * 2, y + dy * b, len * b * 2, b);
    }
    for (let i = 0; i < 22; i++) {   // twinkles
      const x = r() * W, y = (0.1 + r() * 0.8) * H, ph = r() * 6, a = 0.5 + 0.5 * Math.sin(local * 3 + ph), z = (3 + r() * 4) * k;
      g.fillStyle = `rgba(255,255,255,${(0.25 + 0.6 * a).toFixed(3)})`;
      g.fillRect(x - z, y - z / 3, z * 2, (z * 2) / 3); g.fillRect(x - z / 3, y - z, (z * 2) / 3, z * 2);
    }
    const mb = 56 * k;   // the menu bar
    g.fillStyle = p.paper; g.fillRect(0, 0, W, mb); g.fillStyle = p.ink; g.fillRect(0, mb - 3 * k, W, 3 * k);
    const say = (text: string, x: number, y: number) => { g.fillText(text, x, y); ctx.reportText(g, text, x, y); };
    g.font = `${32 * k}px "${CJK}"`; g.textBaseline = 'middle'; g.textAlign = 'left';
    say('★  ' + String(p.menu).split(/[,，]/).join('   '), 22 * k, mb / 2);
    g.textAlign = 'right'; g.font = `${32 * k}px "${PIX}", "${CJK}"`; say('♥ ' + p.app, W - 22 * k, mb / 2);
    g.strokeStyle = p.ink; g.lineWidth = 3 * k;   // the globe
    const gx = 52 * k, gy = 118 * k, gr = 26 * k;
    g.beginPath(); g.arc(gx, gy, gr, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(gx, gy, gr * 0.45, gr, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(gx - gr, gy); g.lineTo(gx + gr, gy); g.stroke();
    ['#f7a8c8', '#8fdcc2', '#f7a8c8'].forEach((col, i) => {   // three folders on the right
      const fx = W - 108 * k, fy = (100 + i * 92) * k, fw = 70 * k, fh = 52 * k;
      g.fillStyle = col; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + fw * 0.4, fy); g.lineTo(fx + fw * 0.5, fy + 9 * k); g.lineTo(fx + fw, fy + 9 * k); g.lineTo(fx + fw, fy + fh); g.lineTo(fx, fy + fh); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(75,58,140,0.5)'; g.lineWidth = 2 * k; g.stroke();
    });
    const tbY = H - 80 * k;   // the taskbar: the start button, then one .exe button a chapter
    g.fillStyle = p.paper; g.fillRect(0, tbY, W, H - tbY); g.fillStyle = p.ink; g.fillRect(0, tbY, W, 3 * k);
    g.fillStyle = p.ink; rr(g, 22 * k, tbY + 19 * k, 150 * k, 50 * k, 8 * k); g.fill();
    g.fillStyle = '#ffd46b'; rr(g, 16 * k, tbY + 13 * k, 150 * k, 50 * k, 8 * k); g.fill(); g.strokeStyle = p.ink; g.lineWidth = 3 * k; g.stroke();
    // the start label and the chapter names shrink into their buttons rather than running out of them
    g.fillStyle = p.ink; g.textAlign = 'center'; g.font = `${fit(g, `★ ${p.start}`, 32 * k, `"${CJK}"`, 130 * k)}px "${CJK}"`; say(`★ ${p.start}`, 91 * k, tbY + 40 * k);
    ch.forEach((c, i) => {
      if (!c.name) return;
      const sl = deskSlot(i + 1, ch.length, W, H), on = i === n;
      g.fillStyle = on ? '#ffffff' : i < n ? '#efe6ff' : '#f6f0e4'; g.fillRect(sl.x - sl.w / 2, sl.y - sl.h / 2, sl.w, sl.h);
      g.strokeStyle = p.ink; g.lineWidth = (on ? 4 : 2) * k; g.strokeRect(sl.x - sl.w / 2, sl.y - sl.h / 2, sl.w, sl.h);
      g.fillStyle = p.ink; g.font = `${fit(g, `${c.name}.exe`, 28 * k, `"${CJK}"`, sl.w - 16 * k)}px "${CJK}"`; g.globalAlpha = on ? 1 : 0.7; say(`${c.name}.exe`, sl.x, sl.y + 2 * k); g.globalAlpha = 1;
    });
  },
};
