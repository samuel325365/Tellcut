import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../ffmpeg.ts';
import { TELLCUT_ROOT } from '../paths.ts';
import { ffmpegPath } from '../deps.ts';
import { faceModel, mediapipeFaces, parseFaceLines } from './faces-mediapipe.ts';
import { ocrTimeout, parseOcrLines, windowsOcr } from './ocr-windows.ts';
import { macosOcr, visionLangs } from './ocr-macos.ts';
import { ocrProvider } from './index.ts';
import { DEFAULT_PROVIDERS, ProvidersConfigZ } from './config.ts';

test('a providers.json from before ocr/faces still loads, with their defaults', () => {
  const c = ProvidersConfigZ.parse({ tts: DEFAULT_PROVIDERS.tts, transcribe: DEFAULT_PROVIDERS.transcribe });
  expect([c.ocr.use, c.faces.use]).toEqual(['system', 'mediapipe']);
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

test('the system OCR is Windows\' own on Windows and Vision on macOS; Vision names Chinese without its region', () => {
  expect(ocrProvider({ ...DEFAULT_PROVIDERS }).id).toBe(process.platform === 'darwin' ? 'macos' : 'windows');
  expect(visionLangs('zh-Hant-TW')).toEqual(['zh-Hant', 'en-US']);
  expect(visionLangs('zh-hans')).toEqual(['zh-Hans', 'en-US']);
  expect(visionLangs('en-US')).toEqual(['en-US']);
});

test('macOS OCR hands Vision the image list and its languages, and reads its lines like Windows\'', async () => {
  const calls: string[][] = [];
  const ocr = macosOcr({ lang: 'zh-Hant-TW' }, async (args) => { calls.push(args); return '{"image":"a.png","width":10,"height":5,"lines":[{"text":"你好","box":[1,2,3,4]}]}\n'; });
  expect(await ocr.read(['a.png'])).toEqual([{ image: 'a.png', width: 10, height: 5, lines: [{ text: '你好', box: [1, 2, 3, 4] }] }]);
  expect(calls[0][0]).toBe('--list');
  expect(calls[0].slice(2)).toEqual(['--lang', 'zh-Hant,en-US']);
  expect(await ocr.read([])).toEqual([]);
});

test('an OCR run that hangs is ended after its time, scaled to the pictures, as a failure; the caller\'s own abort stays an abort', async () => {
  const hang = (seen: AbortSignal[]) => (_args: string[], signal?: AbortSignal) => new Promise<string>((_, rej) => {
    seen.push(signal!);
    signal!.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  const asked: number[] = [];
  for (const make of [windowsOcr, macosOcr]) {
    const seen: AbortSignal[] = [];
    const ocr = make({ timeout: (n) => { asked.push(n); return 30; } }, hang(seen));
    await expect(ocr.read(['a.png', 'b.png'])).rejects.toThrow(/文字辨識超過/);
    expect(seen[0].aborted).toBe(true);   // the process is killed, not left running
    const stop = new AbortController();
    const slow = make({ timeout: () => 60000 }, hang([]));
    const p = slow.read(['a.png'], { signal: stop.signal });
    stop.abort();
    await expect(p).rejects.toThrow(/Aborted/);
  }
  expect(asked).toEqual([2, 2]);
  expect([ocrTimeout(1) < ocrTimeout(40), ocrTimeout(0) >= 30000]).toEqual([true, true]);
});

const CJK_FONT = ['/System/Library/Fonts/STHeiti Medium.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/PingFang.ttc'].find(existsSync);
// drawing the caption needs an ffmpeg with drawtext (Homebrew's plain ffmpeg has none; ffmpeg-full does)
const drawtext = () => { try { return /\bdrawtext\b/.test(execFileSync(ffmpegPath(), ['-hide_banner', '-filters'], { encoding: 'utf8' })); } catch { return false; } };
test.skipIf(process.platform !== 'darwin' || !CJK_FONT || !drawtext())('macOS OCR reads a caption drawn on a frame (this Mac)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'vocr-')), img = join(d, 'cap.png');
  await run(['-f', 'lavfi', '-i', 'color=black:s=1280x720:d=1', '-frames:v', '1', '-vf', `drawtext=fontfile='${CJK_FONT}':text='今天去京都':fontsize=72:fontcolor=white:x=(w-tw)/2:y=600`, img]);
  expect((await macosOcr().check()).ok).toBe(true);
  const [r] = await macosOcr().read([img]);
  expect(r.lines.map((l) => l.text.replace(/\s+/g, '')).join('')).toContain('京都');
  expect(r.lines[0].box[1]).toBeGreaterThan(550);   // where it was drawn: top-left origin, as on Windows
}, 300000);

test.skipIf(!(win || process.platform === 'darwin') || !existsSync(faceModel()))('MediaPipe runs over a batch (this PC or Mac; a blank frame has no face)', async () => {
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
