import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../ffmpeg.ts';
import { TELLCUT_ROOT } from '../paths.ts';
import { faceModel, mediapipeFaces, parseFaceLines } from './faces-mediapipe.ts';
import { parseOcrLines, windowsOcr } from './ocr-windows.ts';
import { DEFAULT_PROVIDERS, ProvidersConfigZ } from './config.ts';

test('a providers.json from before ocr/faces still loads, with their defaults', () => {
  const c = ProvidersConfigZ.parse({ tts: DEFAULT_PROVIDERS.tts, transcribe: DEFAULT_PROVIDERS.transcribe });
  expect([c.ocr.use, c.faces.use]).toEqual(['windows', 'mediapipe']);
});

test('OCR output: one line per image, a single line array that ConvertTo-Json flattened is an array again', () => {
  const out = 'WARNING: noise\n{"image":"a.png","width":10,"height":5,"lines":{"text":"你好","box":[1,2,3,4]}}\n{"image":"b.png","width":10,"height":5,"lines":[]}\n';
  expect(parseOcrLines(out)).toEqual([
    { image: 'a.png', width: 10, height: 5, lines: [{ text: '你好', box: [1, 2, 3, 4] }] },
    { image: 'b.png', width: 10, height: 5, lines: [] },
  ]);
});

test('faces output: back in the order asked, an image the script skipped has no faces', () => {
  const out = 'INFO: TensorFlow\n{"image":"b.jpg","faces":[{"box":[0.1,0.1,0.2,0.2],"mouth":[0.2,0.25],"mouthW":0.05}]}\n';
  expect(parseFaceLines(out, ['a.jpg', 'b.jpg'])).toEqual([[], [{ box: [0.1, 0.1, 0.2, 0.2], mouth: [0.2, 0.25], mouthW: 0.05 }]]);
});

const win = process.platform === 'win32';
test.skipIf(!win)('Windows OCR reads a caption drawn on a frame (this PC)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'vocr-')), img = join(d, 'cap.png');
  const font = 'C\\:/Windows/Fonts/msjh.ttc';
  await run(['-f', 'lavfi', '-i', 'color=black:s=1280x720:d=1', '-frames:v', '1', '-vf', `drawtext=fontfile='${font}':text='今天去京都':fontsize=72:fontcolor=white:x=(w-tw)/2:y=600`, img]);
  const [r] = await windowsOcr().read([img]);
  expect(r.lines.map((l) => l.text.replace(/\s+/g, '')).join('')).toContain('京都');
  expect(r.lines[0].box[1]).toBeGreaterThan(550);   // where it was drawn
}, 60000);

test.skipIf(!win || !existsSync(faceModel()))('MediaPipe runs over a batch (this PC; a blank frame has no face)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'vfaces-')), img = join(d, 'blank.png');
  await run(['-f', 'lavfi', '-i', 'color=gray:s=640x360:d=1', '-frames:v', '1', img]);
  expect(await mediapipeFaces().detect([img])).toEqual([[]]);
}, 120000);

test('a PowerShell script with any non-ASCII text starts with a UTF-8 BOM (Windows PowerShell 5.1 reads it in the system code page otherwise)', () => {
  const dir = join(TELLCUT_ROOT, 'tools', 'ps');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ps1'))) {
    const b = readFileSync(join(dir, f));
    if (b.some((x) => x > 0x7f)) expect([f, b[0], b[1], b[2]]).toEqual([f, 0xef, 0xbb, 0xbf]);
  }
});
