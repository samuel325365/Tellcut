// common.paper — a desk of paper under the video: kraft (or any colour) paper with fibres, specks and a soft vignette, a slightly
// tilted ruled index card held by a strip of tape (where common.notecard writes with `card: false`), pencil doodles and an italic
// signature. Static: painted once per size. Promoted from the baking-steps short's fx.paper.
// look 'book' is a picture-book page (fd-tangyuan's fx.tyPaper): soft blotches, fibres and specks, the spine's shadow and stitching
// on the left, the page stack on the right, a vignette and a crayon meadow along the foot. look 'grid' is a squared notebook page
// (fd-map's fx.nbPage): fibres, a 5 mm grid, a red margin line, a spiral binding along the top and a vignette. look 'print' is
// magazine stock (t2-magazine's fx.magPage paper): smooth off-white with fine specks, faint fibres and a soft warm vignette;
// common.magazine paints its pages with it (paintPrint).
import { cssCamel, h, type ItemType, rng as lcg } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { CARD_W, cardBox, cardParams, LATIN, paintCard, tape } from './hand.ts';
import { crayonStroke, ellipsePts, flatFill, grainBegin, grainEnd, rng, scribbleFill, type GrainLayer, type Pt } from './sketch.ts';
import { shade, withAlpha } from './color.ts';

interface P {
  look: 'desk' | 'book' | 'grid' | 'print'; color: string; card: boolean; x: number; y: number; w: number; h: number; tilt: number; doodles: boolean; sign: string; paper: string; ink: string; accent: string; rule: string; tapeColor: string;
  meadow: boolean; grass: string; cell: number; binding: boolean;
}
interface S { cv: HTMLCanvasElement; sign: HTMLElement; key: string; layer: GrainLayer }


export const paper: ItemType<P, S> = {
  type: 'common.paper', label: '紙張桌面', category: 'look', kind: 'scene',
  doc: '整片紙張底（預設牛皮紙：纖維紋、斑點、暗角），可加一張微斜的橫線索引卡（紅頂線藍橫線、紙膠帶）、鉛筆小塗鴉和一行斜體簽名；look: book 是繪本內頁（紙色 paper、斑駁紙紋、左邊書脊陰影和縫線、右邊書頁厚度、暗角、底部一條蠟筆草地 meadow）；grid 是方格筆記本（方格 cell、紅色邊線、上緣線圈 binding、暗角）；print 是雜誌紙（平滑米白紙、細斑點、淡纖維、暖色暗角，common.magazine 的紙）；靜態，放在影片之下；手帳、食譜、手寫教學、繪本、筆記本，配 common.notecard（card: false 就寫在這張卡上）',
  params: [
    { key: 'look', label: '紙（desk 牛皮紙桌面＋索引卡、book 繪本內頁、grid 方格筆記本、print 雜誌紙）', type: 'enum', options: ['desk', 'book', 'grid', 'print'], default: 'desk' },
    { key: 'color', label: '紙色（desk）', type: 'color', default: '#e7d8bd' },
    { key: 'card', label: '索引卡（desk）', type: 'bool', default: true },
    ...cardParams,
    { key: 'doodles', label: '鉛筆塗鴉（desk：咖啡豆、打蛋器）', type: 'bool', default: true },
    { key: 'sign', label: '底部斜體簽名（desk；空＝不顯示）', type: 'string', default: 'Recipe' },
    { key: 'paper', label: '索引卡紙色（desk）／整頁的紙色（book、grid、print）', type: 'color', default: '#fbf7ee', theme: 'palette.paper' },
    { key: 'ink', label: '鉛筆色', type: 'color', default: '#4a3a2e', theme: 'palette.ink' },
    { key: 'accent', label: '卡片頂線（desk）／紅色邊線（grid）的顏色', type: 'color', default: '#c2533b', theme: 'palette.accent' },
    { key: 'rule', label: '橫線（desk）／方格（grid）的顏色', type: 'color', default: '#9db6c6' },
    { key: 'tapeColor', label: '膠帶顏色', type: 'color', default: '#b0c4a6' },
    { key: 'meadow', label: '底部蠟筆草地（book）', type: 'bool', default: true },
    { key: 'grass', label: '草地顏色（book）', type: 'color', default: '#7fa35b' },
    { key: 'cell', label: '方格大小（grid；以 1080 短邊計的 px）', type: 'number', min: 20, max: 160, step: 1, default: 54 },
    { key: 'binding', label: '上緣線圈（grid）', type: 'bool', default: true },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root), sign = h('div', null, null, ctx.root);
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(sign, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1.2', transform: 'translate(-50%, -100%)', fontFamily: LATIN, fontStyle: 'italic' });
    return { cv, sign, key: '', layer: {} };
  },
  hide(s) { freeCanvas(s.cv); s.layer.cv = undefined; s.key = ''; },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, b = cardBox(p, W, H, theme.safe);
    // the sign sits under the card (or in the bottom safe margin without one)
    const signY = p.card ? Math.min(H - 40 * k, b.y0 + b.h + 150 * k) : (1 - theme.safe.bottom * 0.5) * H;
    s.sign.textContent = p.sign;
    const desk = (p.look ?? 'desk') === 'desk';
    cssCamel(s.sign, { display: p.sign && desk ? 'block' : 'none', left: `${W / 2}px`, top: `${signY}px`, fontSize: `${54 * k}px`, color: withAlpha(p.ink, 0.5) });
    const key = JSON.stringify([W, H, p, theme.safe]);
    if (key === s.key) return;
    s.key = key;
    const g = canvasAt(s.cv, W, H);
    if (p.look === 'book') { paintBook(g, p, W, H, k, s.layer); return; }
    if (p.look === 'grid') { paintGrid(g, p, W, H, k); return; }
    if (p.look === 'print') { paintPrint(g, p.paper, W, H, k); return; }
    const r = lcg(20261019);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, shade(p.color, 1.12)); grd.addColorStop(0.55, p.color); grd.addColorStop(1, shade(p.color, 0.93));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // fibres, specks, a vignette
    const n = Math.round((900 * W * H) / (1080 * 1920));
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, a = r() * Math.PI, l = (6 + r() * 26) * k;
      g.strokeStyle = r() < 0.5 ? 'rgba(120,90,55,0.08)' : 'rgba(255,250,240,0.18)'; g.lineWidth = (0.6 + r()) * k;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < n * 0.55; i++) { g.fillStyle = `rgba(110,80,50,${0.05 + r() * 0.07})`; g.beginPath(); g.arc(r() * W, r() * H, (0.6 + r() * 1.6) * k, 0, 7); g.fill(); }
    const v = g.createRadialGradient(W / 2, H * 0.45, Math.max(W, H) * 0.25, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(70,45,20,0.22)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    if (p.card) {
      g.save();
      g.translate(b.x0 + b.w / 2, b.y0 + b.h / 2); g.rotate((p.tilt * Math.PI) / 180); g.translate(-b.w / 2, -b.h / 2); g.scale(b.u, b.u);
      g.save(); g.shadowColor = 'rgba(60,40,20,0.28)'; g.shadowBlur = 26 * b.u; g.shadowOffsetY = 10 * b.u; g.fillStyle = p.paper; g.fillRect(0, 0, CARD_W, b.h / b.u); g.restore();
      paintCard(g, CARD_W, b.h / b.u, p.paper, p.rule, p.accent);
      tape(g, CARD_W / 2, -10, 200, 44, 0.04, withAlpha(p.tapeColor, 0.78), 5);
      g.restore();
    }
    if (p.doodles) {
      // coffee beans bottom left, a whisk bottom right, in the margins under the card
      const y0 = Math.min(H - 110 * k, p.card ? b.y0 + b.h + 60 * k : H * 0.86);
      g.save(); g.strokeStyle = withAlpha(p.ink, 0.45); g.lineWidth = 2.4 * k; g.lineCap = 'round';
      const bean = (x: number, y: number, rot: number) => {
        g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k);
        g.beginPath(); g.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(-14, 0); g.bezierCurveTo(-5, -7, 5, 7, 14, 0); g.stroke();
        g.restore();
      };
      const lx = W / 2 - 420 * k;
      bean(lx, y0 + 35 * k, 0.5); bean(lx + 42 * k, y0 + 68 * k, -0.3); bean(lx - 22 * k, y0 + 85 * k, 1.2);
      g.translate(W / 2 + 390 * k, y0 + 60 * k); g.rotate(-0.6); g.scale(k, k);
      g.beginPath(); g.moveTo(0, 30); g.lineTo(0, 95); g.stroke();
      for (const q of [-1, -0.45, 0.45, 1]) { g.beginPath(); g.moveTo(0, 30); g.bezierCurveTo(q * 34, -10, q * 22, -62, 0, -70); g.stroke(); }
      g.restore();
    }
  },
};

/** look 'book': the picture-book page (fd-tangyuan's tyPaper and its meadow) */
function paintBook(g: CanvasRenderingContext2D, p: P, W: number, H: number, k: number, layer: GrainLayer) {
  g.fillStyle = p.paper; g.fillRect(0, 0, W, H);
  const r = rng(4242), area = (W * H) / (1080 * 1920);
  for (let i = 0; i < 70; i++) {   // soft blotches
    const x = r() * W, y = r() * H, R = (60 + r() * 220) * k, gr = g.createRadialGradient(x, y, 0, x, y, R), dark = r() < 0.5;
    const c = dark ? '170,130,80' : '255,250,235';   // the edge in the same colour: a stop of transparent black would fade through grey
    gr.addColorStop(0, `rgba(${c},${dark ? 0.07 : 0.12})`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
  for (let i = 0; i < 2600 * area; i++) {   // fibres
    const x = r() * W, y = r() * H, a = r() * Math.PI, L = (4 + r() * 16) * k;
    g.strokeStyle = r() < 0.5 ? 'rgba(140,100,60,0.10)' : 'rgba(255,255,245,0.18)'; g.lineWidth = 0.8 * k;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  for (let i = 0; i < 30000 * area; i++) { g.fillStyle = r() < 0.5 ? 'rgba(120,85,50,0.07)' : 'rgba(255,255,250,0.10)'; g.fillRect(r() * W, r() * H, 1.4 * k, 1.4 * k); }
  // the spine on the left (shadow and stitching), the page stack on the right
  const sp = g.createLinearGradient(0, 0, 80 * k, 0);
  sp.addColorStop(0, 'rgba(90,55,30,0.35)'); sp.addColorStop(0.35, 'rgba(90,55,30,0.12)'); sp.addColorStop(1, 'rgba(90,55,30,0)');
  g.fillStyle = sp; g.fillRect(0, 0, 80 * k, H);
  g.strokeStyle = 'rgba(120,80,45,0.35)'; g.lineWidth = 2 * k; g.setLineDash([14 * k, 12 * k]);
  g.beginPath(); g.moveTo(26 * k, 0); g.lineTo(26 * k, H); g.stroke(); g.setLineDash([]);
  for (let i = 0; i < 4; i++) { g.strokeStyle = `rgba(150,110,70,${(0.22 - i * 0.04).toFixed(2)})`; g.lineWidth = 1.5 * k; g.beginPath(); g.moveTo(W - (3 + i * 4) * k, 0); g.lineTo(W - (3 + i * 4) * k, H); g.stroke(); }
  const vg = g.createRadialGradient(W / 2, H * 0.45, Math.max(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(95,60,30,0.28)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  if (!p.meadow) return;
  // the meadow: a crayon hill coloured in, grass blades and four little flowers, grained like crayon on paper
  const l = grainBegin(layer, W, H), base = H - 40 * k, dark = shade(p.grass, 0.78), mid = shade(p.grass, 0.9), hill: Pt[] = [];
  for (let x = -20 * k; x <= W + 30 * k; x += 30 * k) hill.push([x, base - (18 + 14 * Math.sin(x / k / 160 + 1)) * k]);
  scribbleFill(l, [...hill, [W + 30 * k, H + 30 * k], [-20 * k, H + 30 * k]], p.grass, { u: k, w: 14, gap: 10, seed: 78, alpha: 0.55 });
  crayonStroke(l, hill, { w: 7 * k, u: k, color: dark, seed: 79 });
  const rb = rng(77), n = Math.round(W / (40 * k));
  for (let i = 0; i < n; i++) {
    const x = (40 + i * 40 + rb() * 20) * k, y = base - (14 + 14 * Math.sin(x / k / 160 + 1)) * k, hgt = (18 + rb() * 22) * k, lean = (rb() - 0.5) * 16 * k;
    crayonStroke(l, [[x, y], [x + lean, y - hgt]], { w: 4 * k, u: k, color: mid, seed: 87 + i, passes: 2 });
  }
  [[0.15, '#f2c14e'], [0.4, '#f2a0a0'], [0.7, '#f5f0e6'], [0.88, '#f2c14e']].forEach(([fx, col], i) => {
    const cx = (fx as number) * W, cy = base - 46 * k;
    crayonStroke(l, [[cx, cy + 6 * k], [cx + 3 * k, cy + 40 * k]], { w: 4 * k, u: k, color: dark, seed: 117 + i, passes: 2 });
    for (let j = 0; j < 5; j++) { const a = (j / 5) * Math.PI * 2; flatFill(l, ellipsePts(cx + Math.cos(a) * 10 * k, cy + Math.sin(a) * 10 * k, 8 * k, 8 * k), col as string, 0.9); }
    flatFill(l, ellipsePts(cx, cy, 6 * k, 6 * k), '#e8823a', 0.9);
  });
  grainEnd(layer, g, 0.5, k);
}

/** look 'grid': the squared notebook page (fd-map's nbPage paper) */
function paintGrid(g: CanvasRenderingContext2D, p: P, W: number, H: number, k: number) {
  g.fillStyle = p.paper; g.fillRect(0, 0, W, H);
  const r = rng(42), area = (W * H) / (1080 * 1920);
  for (let i = 0; i < 2600 * area; i++) {
    const x = r() * W, y = r() * H, a = r() * Math.PI, l = (4 + r() * 14) * k;
    g.strokeStyle = r() < 0.5 ? 'rgba(120,100,70,0.05)' : 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const c = Math.max(8, p.cell * k), top = p.binding ? 120 * k : (H % c) / 2;
  g.strokeStyle = withAlpha(p.rule, 0.5); g.lineWidth = Math.max(1, 1.4 * k);
  for (let x = (W % c) / 2; x < W; x += c) { g.beginPath(); g.moveTo(x, p.binding ? 70 * k : 0); g.lineTo(x, H); g.stroke(); }
  for (let y = top; y < H; y += c) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = withAlpha(p.accent, 0.55); g.lineWidth = 2.4 * k;
  g.beginPath(); g.moveTo(66 * k, 0); g.lineTo(66 * k, H); g.stroke();
  if (p.binding) for (let x = 46 * k; x < W; x += 62 * k) {
    g.fillStyle = 'rgba(60,50,40,0.28)'; g.beginPath(); g.ellipse(x, 52 * k, 9 * k, 11 * k, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8d939c'; g.lineWidth = 5 * k; g.beginPath(); g.arc(x + 4 * k, 34 * k, 18 * k, Math.PI * 0.55, Math.PI * 1.75); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.6 * k; g.beginPath(); g.arc(x + 4 * k, 34 * k, 18 * k, Math.PI * 0.9, Math.PI * 1.4); g.stroke();
  }
  const v = g.createRadialGradient(W / 2, H / 2, Math.max(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(70,50,20,0.22)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

/** look 'print': magazine stock (t2-magazine's magPage paper) — fine specks, faint short fibres and a warm vignette over `color`; seeded,
 *  so the same size paints the same sheet */
export function paintPrint(g: CanvasRenderingContext2D, color: string, W: number, H: number, k: number, seed = 4242) {
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  const r = rng(seed), area = (W * H) / (1080 * 1920);
  for (let i = 0; i < 2600 * area; i++) { g.fillStyle = `rgba(90,70,40,${(0.03 + r() * 0.05).toFixed(3)})`; g.fillRect(r() * W, r() * H, (1 + r() * 2) * k, (1 + r() * 2) * k); }
  g.strokeStyle = 'rgba(120,100,70,0.05)'; g.lineWidth = Math.max(1, k);
  for (let i = 0; i < 400 * area; i++) { const x = r() * W, y = r() * H, a = r() * Math.PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 18 * k, y + Math.sin(a) * 18 * k); g.stroke(); }
  const v = g.createRadialGradient(W / 2, H / 2, Math.max(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(60,40,10,0)'); v.addColorStop(1, 'rgba(60,40,10,0.10)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}
