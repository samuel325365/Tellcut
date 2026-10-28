// Demo fx: a ring that springs out from the centre; size and stroke depend only on the item's local time.
// The curves come from ctx.motion (fx may not import): a spring for the size, interpolate for the stroke.
/** @type {import('@tellcut/engine').ItemType[]} */
export default [{
  type: 'fx.ring', label: '擴散圓環', kind: 'overlay', doc: '一個彈出去的圓環（示範用 fx）',
  params: [
    { key: 'color', label: '顏色', type: 'color', default: '#ffd166' },
    { key: 'bounce', label: '回彈（0 不回彈）', type: 'number', min: 0, max: 0.8, step: 0.05, default: 0.35 },
  ],
  build({ root, W, H }) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    root.appendChild(c); return { c };
  },
  draw({ local, dur, params, W, H, motion }, { c }) {
    const g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    const grow = motion.spring({ duration: Math.min(0.8, dur * 0.6), bounce: params.bounce })(local);
    const stroke = motion.interpolate([0, dur * 0.7, dur], [12, 8, 0])(local);
    const u = Math.min(W, H);
    g.strokeStyle = params.color; g.lineWidth = stroke * u / 1080; g.beginPath(); g.arc(W / 2, H / 2, Math.max(0, u * (0.04 + grow * 0.36)), 0, Math.PI * 2); g.stroke();
  },
}];
