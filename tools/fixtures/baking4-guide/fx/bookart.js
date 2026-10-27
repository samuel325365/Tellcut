// 繪本風插畫：手抖墨線＋水彩暈染，畫一個烘焙步驟的小場景（給 common.card 的圖窗用，也能單獨放）。
// 線條每秒抖 4 次（同一時間永遠一樣），物件在前 0.5 秒輕輕彈進來。

const C = {
  ink: '#5a3d2b', flour: '#fbf4e6', sugar: '#ffffff', butter: '#f3d27a', cream: '#fdf8ef', choc: '#6e4630',
  dough: '#ecd3a0', crust: '#d99e5a', bowl: '#a8c8bf', bowl2: '#e6b3a3', wood: '#c58f5a', steel: '#cfcbc3',
  bag: '#efe2c8', red: '#d77a68', blue: '#93b5c6', green: '#a6c08e', wash: '#f7e3c8', oven: '#8c8f93', glow: '#f6b25b',
};

function mkrng(seed) { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; }
const ease = (t) => { t = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - t, 3); };
const back = (t) => { t = Math.min(1, Math.max(0, t)); const s = 1.7; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };

function ell(cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2, n = 30) {
  const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p;
}

function makePen(g, u, boil) {
  let k = 0;
  const wob = (pts, closed, amp, r) => {
    const out = []; const n = pts.length; const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1;
      const m = Math.max(1, Math.round(L / (u * 5)));
      for (let j = 0; j < m; j++) { const t = j / m; const off = (r() - 0.5) * amp; out.push([a[0] + dx * t - dy / L * off, a[1] + dy * t + dx / L * off]); }
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  };
  const trace = (pts, closed) => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    const l = pts[pts.length - 1]; g.lineTo(l[0], l[1]); if (closed) g.closePath();
  };
  // 一個形狀：水彩填色（邊緣顏色積起來）＋兩道墨線
  return function shape(pts, o = {}) {
    const closed = o.closed !== false; const r = mkrng(1000 + (k++) * 97 + boil * 7);
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (o.fill) {
      const p = wob(pts, closed, u * 0.7, r);
      g.globalAlpha = o.alpha ?? 0.95; trace(p, true); g.fillStyle = o.fill; g.fill();
      g.globalAlpha = 0.28; g.strokeStyle = mix(o.fill, C.ink, 0.35); g.lineWidth = u * 2.2; g.stroke();
      g.globalAlpha = 0.22; g.save(); g.clip(); g.translate(-u * 1.2, -u * 1.0); trace(p, true); g.fillStyle = '#ffffff'; g.fill(); g.restore();
    }
    if (o.line !== false) {
      g.globalAlpha = 0.9; g.strokeStyle = o.ink || C.ink; g.lineWidth = u * (o.lw ?? 0.85);
      trace(wob(pts, closed, u * 0.9, r), closed); g.stroke();
      g.globalAlpha = 0.3; g.lineWidth = u * 0.5; trace(wob(pts, closed, u * 1.4, r), closed); g.stroke();
    }
    g.globalAlpha = 1;
  };
}

// ---- 小物件（座標單位 u；畫面中心為原點，約 x ±80、y ±50） ----
function kit(g, u, ox, oy, shape) {
  const X = (x) => ox + x * u, Y = (y) => oy + y * u;
  const E = (cx, cy, rx, ry, a0, a1, n) => ell(X(cx), Y(cy), rx * u, ry * u, a0, a1, n);
  const P = (arr) => arr.map(([x, y]) => [X(x), Y(y)]);
  const dot = (x, y, r, fill, line = true) => shape(E(x, y, r, r * 0.9, 0, Math.PI * 2, 12), { fill, line, lw: 0.6 });
  const shadow = (x, y, rx) => { g.globalAlpha = 0.16; g.fillStyle = C.ink; g.beginPath(); g.ellipse(X(x), Y(y), rx * u, rx * 0.16 * u, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; };
  const bowl = (x, y, w, fillCol, color = C.bowl) => {
    const h = w * 0.55; shadow(x, y + h + 1, w * 0.95);
    shape([...E(x, y, w, w * 0.2, Math.PI, 0, 20), ...E(x, y, w, h, 0, Math.PI, 24).slice(1)], { fill: color });
    shape(E(x, y, w, w * 0.2, 0, Math.PI * 2, 30), { fill: fillCol || mix(color, '#ffffff', 0.55), lw: 0.7 });
  };
  const wash = (x, y, rx, ry, col = C.wash) => { g.globalAlpha = 0.55; g.fillStyle = col; g.beginPath(); g.ellipse(X(x), Y(y), rx * u, ry * u, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; };
  const lines = (pairs, lw = 0.7) => { for (const p of pairs) shape(P(p), { closed: false, lw }); };
  return { X, Y, E, P, dot, shadow, bowl, wash, lines };
}

function scone(k, shape, x, y, s, rot = 0, bite = false) {
  const pts = [[-12, 8], [12, 8], [3, -12], [-3, -12]].map(([a, b]) => {
    const c = Math.cos(rot), d = Math.sin(rot); return [x + (a * c - b * d) * s, y + (a * d + b * c) * s];
  });
  shape(k.P(pts), { fill: C.crust });
  const cx = x, cy = y; const chips = [[-5, 3], [4, 1], [0, -5], [6, 5]];
  for (const [a, b] of chips) { const c = Math.cos(rot), d = Math.sin(rot); k.dot(cx + (a * c - b * d) * s, cy + (a * d + b * c) * s, 1.5 * s, C.choc, false); }
  if (bite) shape(k.E(x + 9 * s, y - 2 * s, 4.5 * s, 4.5 * s, 0, Math.PI * 2, 14), { fill: '#fffaf1', line: false });
}

const SCENES = {
  cover(k, shape, t) {
    k.wash(0, 2, 62, 40);
    k.shadow(0, 26, 46); shape(k.E(0, 18, 46, 10), { fill: '#f3efe6' }); shape(k.E(0, 17, 36, 7), { fill: '#e7eef0', lw: 0.5 });
    const p = ease(t / 0.6);
    scone(k, shape, -16, 6 - (1 - p) * 10, 1.1, -0.25); scone(k, shape, 16, 6 - (1 - p) * 14, 1.1, 0.3); scone(k, shape, 0, -4 - (1 - p) * 18, 1.15, 0.05);
    for (let i = 0; i < 3; i++) {
      const sx = -10 + i * 10, ph = t * 1.6 + i * 1.3;
      k.lines([[[sx, -22], [sx + 3 * Math.sin(ph), -28], [sx - 2 * Math.sin(ph), -34], [sx + 2 * Math.sin(ph + 1), -40]]], 0.6);
    }
  },
  flour(k, shape, t) {
    k.wash(0, 6, 64, 38);
    k.bowl(10, 12, 30, C.flour);
    const tilt = 0.55 + 0.05 * Math.sin(t * 2);
    const bx = -26, by = -18, c = Math.cos(tilt), s = Math.sin(tilt);
    const R = (a, b) => [bx + a * c - b * s, by + a * s + b * c];
    shape(k.P([R(-10, -14), R(10, -14), R(12, 14), R(-12, 14)]), { fill: C.bag });
    shape(k.P([R(-6, -2), R(6, -2), R(6, 6), R(-6, 6)]), { fill: C.blue, lw: 0.5 });
    const mouth = R(11, -2);
    for (let i = 0; i < 9; i++) { const f = ((t * 1.4 + i / 9) % 1); k.dot(mouth[0] + 4 + f * 14 + Math.sin(i) * 2, mouth[1] + f * 24, 1.3 + (i % 3) * 0.3, C.flour); }
    for (let i = 0; i < 4; i++) { const f = ((t * 0.7 + i / 4) % 1); g_puff(k, shape, 4 + i * 6 - 8, 6 - f * 10, 2 + f * 3); }
  },
  sugar(k, shape, t) {
    k.wash(0, 6, 64, 38);
    k.bowl(8, 14, 30, C.flour);
    const sw = Math.sin(t * 2.4) * 0.15;
    const hx = -18, hy = -10;
    const c = Math.cos(-0.5 + sw), s = Math.sin(-0.5 + sw); const R = (a, b) => [hx + a * c - b * s, hy + a * s + b * c];
    shape(k.P([R(-34, -1.5), R(-6, -1.5), R(-6, 1.5), R(-34, 1.5)]), { fill: C.steel });
    shape(k.E(...R(2, 0), 8, 5, 0, Math.PI * 2, 18), { fill: C.steel });
    shape(k.E(...R(2, -1), 6, 3, 0, Math.PI * 2, 14).map(([x, y]) => [x, y]), { fill: C.sugar, lw: 0.4 });
    for (let i = 0; i < 6; i++) { const f = ((t * 1.2 + i / 6) % 1); const p = R(8, 0); k.dot(p[0] + 2 + f * 8, p[1] + 2 + f * 18, 0.9, '#ffffff'); }
    // 旁邊的小罐
    k.shadow(-46, 30, 9); shape(k.P([[-54, 6], [-38, 6], [-39, 30], [-53, 30]]), { fill: C.bowl2 }); shape(k.E(-46, 6, 8, 2.4), { fill: '#fff7f2', lw: 0.5 });
  },
  butter(k, shape, t) {
    k.wash(0, 6, 64, 38);
    k.bowl(-4, 14, 32, C.flour);
    const cubes = [[-12, -26, 0], [-1, -30, 0.33], [10, -24, 0.66]];
    for (const [x, y, ph] of cubes) {
      const f = ((t * 0.8 + ph) % 1); const yy = y + f * 34, a = 0.3 + f * 1.2;
      const c = Math.cos(a), s = Math.sin(a), R = (p, q) => [x + p * c - q * s, yy + p * s + q * c];
      if (f < 0.85) shape(k.P([R(-4, -4), R(4, -4), R(4, 4), R(-4, 4)]), { fill: C.butter, lw: 0.6 });
    }
    // 切刀（pastry cutter）
    const w = Math.sin(t * 3) * 3;
    shape(k.P([[34 + w, -4], [50 + w, -4], [50 + w, 0], [34 + w, 0]]), { fill: C.red });
    k.lines([[[36 + w, 0], [36 + w, 18], [48 + w, 18], [48 + w, 0]], [[40 + w, 0], [40 + w, 18]], [[44 + w, 0], [44 + w, 18]]], 0.7);
  },
  cream(k, shape, t, p) {
    const liq = p.tint || C.cream;
    k.wash(0, 6, 64, 38);
    k.bowl(10, 14, 30, '#f3e6c9');
    const tilt = 0.5 + 0.06 * Math.sin(t * 2);
    const bx = -22, by = -16, c = Math.cos(tilt), s = Math.sin(tilt); const R = (a, b) => [bx + a * c - b * s, by + a * s + b * c];
    shape(k.P([R(-10, -12), R(12, -12), R(9, 14), R(-9, 14)]), { fill: '#f6f2ea' });
    shape(k.P([R(-9, 0), R(10.5, 0), R(9, 14), R(-9, 14)]), { fill: liq, lw: 0.4 });
    shape(k.E(...R(-14, 0), 5, 7, 0, Math.PI * 2, 14), { fill: false, lw: 0.8 });
    const lip = R(13, -12); const tip = [8, 10];
    const flow = [[lip[0], lip[1]], [lip[0] + 4, lip[1] + 4], [tip[0] - 2 + Math.sin(t * 5), tip[1] - 8], [tip[0], tip[1]]];
    shape(k.P(flow), { closed: false, lw: 2.2, ink: liq }); shape(k.P(flow), { closed: false, lw: 0.6 });
  },
  egg(k, shape, t) {
    k.wash(0, 6, 64, 38);
    k.bowl(4, 14, 30, '#f6efe0');
    const open = ease((t % 2.4) / 1.2);
    shape(k.E(-6 - open * 6, -18, 9, 8, Math.PI, Math.PI * 2, 14).concat(k.P([[-6 - open * 6 + 9, -18], [-6 - open * 6 - 9, -18]])), { fill: '#f7ead6' });
    shape(k.E(6 + open * 6, -18, 9, 8, 0, Math.PI, 14), { fill: '#f7ead6' });
    const f = Math.min(1, Math.max(0, ((t % 2.4) - 0.5) / 1.0));
    if (f > 0) { shape(k.E(0, -14 + f * 24, 6, 4.5), { fill: '#fffaf0', lw: 0.5 }); shape(k.E(0, -14 + f * 24, 3, 2.8), { fill: '#f2b33d', lw: 0.5 }); }
  },
  chips(k, shape, t) {
    k.wash(0, 6, 64, 38);
    k.bowl(0, 14, 34, '#efe0bf');
    for (let i = 0; i < 6; i++) k.dot(-18 + i * 7, 13 + (i % 2) * 2, 1.6, C.choc, false);
    for (let i = 0; i < 10; i++) {
      const f = ((t * 0.9 + i / 10) % 1); const x = -16 + (i * 37 % 32), y = -38 + f * 50;
      if (y < 12) shape(k.P([[x - 2, y + 2], [x + 2, y + 2], [x, y - 2.5]]), { fill: C.choc, lw: 0.5 });
    }
  },
  stir(k, shape, t) {
    k.wash(0, 6, 64, 38);
    k.bowl(0, 12, 36, '#efe0bf');
    for (let i = 0; i < 7; i++) { const a = t * 2 + i; k.dot(Math.cos(a) * 18 * ((i % 3) / 3 + 0.3), 12 + Math.sin(a) * 4, 1.5, C.choc, false); }
    const a = t * 2.4; const sx = Math.cos(a) * 12, sy = Math.sin(a) * 3;
    shape(k.P([[sx - 1.6, 10 + sy], [sx + 1.6, 10 + sy], [sx + 6, -36], [sx + 3, -36]]), { fill: C.wood });
    shape(k.E(sx, 12 + sy, 4, 2.5), { fill: C.wood, lw: 0.6 });
    for (let i = 0; i < 2; i++) {
      const arc = []; for (let j = 0; j <= 8; j++) { const q = a + Math.PI * (0.1 + 0.5 * j / 8); arc.push([Math.cos(q) * (40 + i * 6), -6 + Math.sin(q) * (6 + i)]); }
      k.lines([arc], 0.5);
    }
  },
  shape(k, shape, t) {
    k.wash(0, 6, 66, 38);
    k.shadow(0, 30, 56); shape(k.P([[-56, 4], [56, 4], [60, 28], [-60, 28]]), { fill: C.steel });
    shape(k.P([[-50, 7], [50, 7], [53, 25], [-53, 25]]), { fill: '#e7c9a4', lw: 0.5 });
    const press = 0.5 + 0.5 * Math.sin(t * 3); const ry = 6 - press * 1.2, rx = 22 + press * 2;
    shape(k.E(0, 15, rx, ry), { fill: C.dough });
    for (let i = 0; i < 6; i++) k.dot(-14 + i * 6, 14 + (i % 2) * 2.5, 1.3, C.choc, false);
    // 一雙小手往下壓
    const hy = -14 + press * 6;
    for (const sx of [-12, 12]) shape(k.E(sx, hy, 9, 5), { fill: '#f6d1bb' });
    k.lines([[[-30, -10], [-24, -6]], [[30, -10], [24, -6]]], 0.6);
  },
  cut(k, shape, t) {
    k.wash(0, 6, 66, 38);
    k.shadow(0, 30, 56); shape(k.P([[-56, 4], [56, 4], [60, 28], [-60, 28]]), { fill: C.steel });
    shape(k.P([[-50, 7], [50, 7], [53, 25], [-53, 25]]), { fill: '#e7c9a4', lw: 0.5 });
    shape(k.E(0, 15, 26, 7), { fill: C.dough });
    for (let i = 0; i < 6; i++) k.dot(-16 + i * 7, 14 + (i % 2) * 2.5, 1.3, C.choc, false);
    const n = Math.min(4, Math.floor(t / 0.6) + 1);
    for (let i = 0; i < n; i++) { const a = i * Math.PI / 4; k.lines([[[-Math.cos(a) * 25, 15 - Math.sin(a) * 6.6], [Math.cos(a) * 25, 15 + Math.sin(a) * 6.6]]], 0.7); }
    const kx = 30 + Math.sin(t * 4) * 2, ky = -12 + Math.abs(Math.sin(t * 4)) * 4;
    shape(k.P([[kx - 22, ky + 4], [kx, ky - 2], [kx, ky + 3], [kx - 20, ky + 6]]), { fill: C.steel });
    shape(k.P([[kx, ky - 3], [kx + 16, ky - 4], [kx + 16, ky + 2], [kx, ky + 3]]), { fill: C.wood });
  },
  brush(k, shape, t) {
    k.wash(0, 6, 66, 38);
    k.shadow(0, 30, 56); shape(k.P([[-56, 4], [56, 4], [60, 28], [-60, 28]]), { fill: C.steel });
    shape(k.P([[-50, 7], [50, 7], [53, 25], [-53, 25]]), { fill: '#e7c9a4', lw: 0.5 });
    shape(k.E(0, 15, 26, 7), { fill: '#f0d49a' });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; k.lines([[[-Math.cos(a) * 25, 15 - Math.sin(a) * 6.6], [Math.cos(a) * 25, 15 + Math.sin(a) * 6.6]]], 0.5); }
    const bx = Math.sin(t * 3) * 14;
    g_gloss(k, shape, bx);
    shape(k.P([[bx - 3, 8], [bx + 3, 8], [bx + 4, 0], [bx - 4, 0]]), { fill: C.butter, lw: 0.6 });
    shape(k.P([[bx - 2, 0], [bx + 2, 0], [bx + 10, -32], [bx + 7, -33]]), { fill: C.wood });
    k.bowl(-44, -8, 10, C.cream, C.bowl2);
  },
  bake(k, shape, t) {
    k.wash(0, 4, 64, 40, '#f5dcc4');
    k.shadow(0, 40, 44);
    shape(k.P([[-40, -34], [40, -34], [40, 38], [-40, 38]]), { fill: C.oven });
    shape(k.P([[-40, -34], [40, -34], [40, -22], [-40, -22]]), { fill: '#7a7c80', lw: 0.6 });
    for (let i = 0; i < 3; i++) shape(k.E(-24 + i * 12, -28, 3, 3, 0, Math.PI * 2, 12), { fill: '#e9e4da', lw: 0.5 });
    const glow = 0.75 + 0.25 * Math.sin(t * 3);
    shape(k.P([[-30, -14], [30, -14], [30, 24], [-30, 24]]), { fill: mix('#6b4a3a', C.glow, glow) });
    shape(k.P([[-24, 10], [24, 10], [26, 14], [-26, 14]]), { fill: C.steel, lw: 0.5 });
    const rise = ease(t / 3);
    for (let i = 0; i < 3; i++) scone(k, shape, -14 + i * 14, 5 - rise * 1.5, 0.55 + rise * 0.08, (i - 1) * 0.3);
    shape(k.P([[-26, 30], [26, 30], [26, 33], [-26, 33]]), { fill: '#c9c4bb', lw: 0.6 });
    for (let i = 0; i < 3; i++) { const ph = t * 1.5 + i; k.lines([[[-12 + i * 12, -40], [-10 + i * 12 + 2 * Math.sin(ph), -46], [-12 + i * 12, -52]]], 0.5); }
  },
  eat(k, shape, t) {
    k.wash(0, 2, 62, 40, '#f8dccf');
    k.shadow(0, 26, 40); shape(k.E(0, 18, 40, 9), { fill: '#f3efe6' });
    scone(k, shape, -12, 6, 1.1, -0.2); scone(k, shape, 14, -2 + Math.sin(t * 2) * 1.5, 1.25, 0.25, true);
    for (let i = 0; i < 3; i++) { const f = ((t * 0.5 + i / 3) % 1); g_heart(k, shape, 34 + i * 6 - f * 4, -14 - f * 26, 3.4 - i * 0.5, 1 - f); }
    for (let i = 0; i < 4; i++) k.dot(30 + i * 3, 8 + (i % 2) * 3, 0.6, C.crust, false);
  },
};

function g_puff(k, shape, x, y, r) { shape(k.E(x, y, r, r * 0.8, 0, Math.PI * 2, 12), { fill: '#ffffff', lw: 0.35, alpha: 0.7 }); }
function g_gloss(k, shape, bx) { shape(k.E(bx * 0.6, 13, 16, 3.6), { fill: '#f7e6b2', line: false, alpha: 0.6 }); }
function g_heart(k, shape, x, y, s, a) {
  const pts = []; for (let i = 0; i <= 24; i++) { const q = i / 24 * Math.PI * 2; pts.push([x + s * 16 * Math.pow(Math.sin(q), 3) / 16, y - s * (13 * Math.cos(q) - 5 * Math.cos(2 * q) - 2 * Math.cos(3 * q) - Math.cos(4 * q)) / 16]); }
  shape(k.P(pts), { fill: C.red, lw: 0.5, alpha: 0.9 * a });
}

/** @type {import('@tellcut/engine').ItemType[]} */
export default [{
  type: 'fx.bookart', label: '繪本插畫', kind: 'overlay',
  doc: '手繪繪本風的烘焙小場景（手抖墨線＋水彩），給 common.card 的圖窗用',
  params: [
    { key: 'scene', label: '場景', type: 'select', options: Object.keys(SCENES), default: 'cover' },
    { key: 'tint', label: '液體顏色（cream 場景）', type: 'color', default: '#fdf8ef' },
  ],
  build({ root, W, H }) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    root.appendChild(c); return { c };
  },
  draw({ local, params, W, H }, { c }) {
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    const pop = back(local / 0.5);
    const u = Math.min(W / 160, H / 104) * (0.9 + 0.1 * pop);
    const boil = Math.floor(local * 4) % 3;
    g.save(); g.globalAlpha = 1;
    const shape = makePen(g, u, boil);
    const k = kit(g, u, W / 2, H / 2, shape);
    (SCENES[params.scene] || SCENES.cover)(k, shape, local, params);
    g.restore();
  },
}];
