// Demo fx: an expanding ring whose size depends only on the item's local time.
/** @type {import('@tellcut/engine').ItemType[]} */
export default [{
  type: 'fx.ring', label: '擴散圓環', kind: 'overlay', doc: '一個隨時間擴大的圓環（示範用 fx）',
  params: [{ key: 'color', label: '顏色', type: 'color', default: '#ffd166' }],
  build({ root, W, H }) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    root.appendChild(c); return { c };
  },
  draw({ local, dur, params, W, H }, { c }) {
    const g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    const p = local / dur;
    g.strokeStyle = params.color; g.lineWidth = 12 * (1 - p); g.beginPath(); g.arc(W / 2, H / 2, 40 + p * H * 0.4, 0, Math.PI * 2); g.stroke();
  },
}];
