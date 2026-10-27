// Demo 3D fx: a rounded block with a word on its face turns once over the item. Drawn with three.js from ctx.three (no imports):
// `three: true` makes the player load it; the scene is built once, posed from ctx.local alone, rendered on the shared renderer
// and copied onto this item's own canvas right away. The word is drawn in ready(), once its font is loaded.
const FONT = '700 220px "Noto Sans TC"';

/** @type {import('@tellcut/engine').ItemType[]} */
export default [{
  type: 'fx.spin3d', label: '轉動的立體字塊', kind: 'overlay', three: true, doc: '一個圓角方塊轉一圈，正面寫一個字（示範用 3D fx）',
  params: [
    { key: 'text', label: '正面的字', type: 'string', default: '3D' },
    { key: 'color', label: '方塊顏色', type: 'color', default: '#ff6b2c' },
  ],
  build({ root, W, H, three, params }) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    root.appendChild(c);
    const { THREE, addons } = three;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 50);
    // the face's texture: a canvas the word is drawn on in ready()
    const label = document.createElement('canvas'); label.width = 512; label.height = 512;
    const face = new THREE.CanvasTexture(label); face.colorSpace = THREE.SRGBColorSpace;
    const side = new THREE.MeshStandardMaterial({ color: params.color, roughness: 0.4, metalness: 0.1 });
    const front = new THREE.MeshStandardMaterial({ map: face, roughness: 0.4 });
    const box = new THREE.Mesh(new addons.RoundedBoxGeometry(1, 1, 1, 4, 0.12), [side, side, side, side, front, side]);
    scene.add(box, new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 4); scene.add(key);
    return { c, scene, camera, box, label, face, text: params.text, color: params.color, parts: [box.geometry, side, front, face] };
  },
  async ready(s) {
    await document.fonts.load(FONT, s.text);
    const g = s.label.getContext('2d');
    g.fillStyle = s.color; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#ffffff'; g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.text, 256, 270);
    s.face.needsUpdate = true;
  },
  draw({ local, dur, W, H, three }, s) {
    // hide() released the canvas: size it again
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    // the camera first, then the object; both from the time alone
    s.camera.aspect = W / H; s.camera.position.set(0, 0.4, 4); s.camera.lookAt(0, 0, 0); s.camera.updateProjectionMatrix();
    s.box.rotation.set(0.25, (local / dur) * Math.PI * 2, 0);
    const out = three.render(s.scene, s.camera, W, H);
    const g = s.c.getContext('2d'); g.clearRect(0, 0, W, H);
    if (out) { g.drawImage(out, 0, 0, W, H); return; }
    // no WebGL2: the face flat in the middle
    const side = Math.min(W, H) * 0.4;
    g.fillStyle = s.color; g.fillRect((W - side) / 2, (H - side) / 2, side, side);
    g.drawImage(s.label, (W - side) / 2, (H - side) / 2, side, side);
  },
  hide(s) { s.c.width = 0; s.c.height = 0; },
}];
