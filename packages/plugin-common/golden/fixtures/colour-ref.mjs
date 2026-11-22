// Draws colour-ref.png, the made-up street the colour blocks' golden samples are drawn over (golden's `photo`): no real picture,
// so no licence question. It holds what a grade, a tone or a fade has something to change in, in large patches a 16 × 16 colour
// print still tells apart: a blue sky with a white cloud, a sunlit warm wall, a cool wall in shade, green leaves, a skin-toned face,
// a red awning and a yellow sign, a grey street, deep shadow and bright highlights. Rerun from tellcut/:
//   node packages/plugin-common/golden/fixtures/colour-ref.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const W = 360, H = 640, SS = 3;   // drawn 3 × 3 per pixel, for soft edges
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inRect = (x, y, l, t, r, b) => x >= l && x < r && y >= t && y < b;

/** the colour at a point of the frame (0–1 each way), painted back to front */
function at(u, v) {
  const x = u * W, y = v * H;
  // sky: deep blue at the top to pale near the roofs, a cloud
  let c = mix([38, 92, 178], [170, 208, 236], v / 0.36);
  if (inEllipse(x, y, 250, 70, 70, 26) || inEllipse(x, y, 205, 84, 46, 20) || inEllipse(x, y, 292, 88, 42, 18)) c = mix([255, 255, 255], [222, 230, 240], (y - 50) / 50);
  // the sunlit wall on the left: terracotta to ochre, its windows dark, one lit
  if (x < 190 && y > 150 - x * 0.15) {
    c = mix([214, 128, 74], [236, 182, 96], y / H);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) {
      const l = 30 + k * 80, t = 200 + r * 75;
      if (inRect(x, y, l, t, l + 46, t + 52)) c = r === 1 && k === 1 ? [255, 236, 170] : [34, 26, 30];
    }
  }
  // the wall in shade on the right: cool grey-blue
  if (x >= 190 && y > 230) {
    c = mix([96, 112, 138], [66, 78, 102], (y - 230) / 300);
    if (inRect(x, y, 230, 280, 330, 360)) c = [150, 182, 196];   // a window with the sky in it
  }
  // a red awning over the shop on the right, its yellow sign
  if (inRect(x, y, 196, 400, 360, 440) && (x - y * 0.1) % 36 < 24) c = [204, 36, 40];
  else if (inRect(x, y, 196, 400, 360, 440)) c = [246, 238, 226];
  if (inRect(x, y, 224, 452, 336, 486)) c = [250, 204, 32];
  // leaves: a green tree in front of the walls
  if (inEllipse(x, y, 175, 360, 62, 70) || inEllipse(x, y, 130, 400, 44, 46) || inEllipse(x, y, 220, 395, 40, 40)) c = mix([92, 168, 64], [34, 92, 36], (y - 300) / 150);
  if (inRect(x, y, 168, 420, 182, 520)) c = [70, 48, 34];   // its trunk
  // the street: grey, darker toward the front, a deep shadow in its corner
  if (y > 520) c = mix([150, 148, 144], [92, 90, 88], (y - 520) / 120);
  if (y > 520 && x > 300 - (y - 520) * 0.5) c = [24, 22, 26];
  // someone in front: a skin-toned face, dark hair, a white shirt
  if (inEllipse(x, y, 92, 560, 46, 66) && y > 520) c = [242, 242, 236];
  if (inEllipse(x, y, 92, 478, 24, 30)) c = [228, 174, 138];
  if (inEllipse(x, y, 92, 462, 25, 18) && y < 464) c = [40, 28, 22];
  return c;
}

const png = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const s = [0, 0, 0];
  for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const c = at((x + (i + 0.5) / SS) / W, (y + (j + 0.5) / SS) / H); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; }
  const o = (y * W + x) * 4;
  png.data[o] = Math.round(s[0] / SS / SS); png.data[o + 1] = Math.round(s[1] / SS / SS); png.data[o + 2] = Math.round(s[2] / SS / SS); png.data[o + 3] = 255;
}
writeFileSync(fileURLToPath(new URL('./colour-ref.png', import.meta.url)), PNG.sync.write(png));
