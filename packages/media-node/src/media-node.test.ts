import { existsSync, mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, relative } from 'node:path';
import { retimeFilter, cutLength, run, ffmpeg, cutVideo, cutAudio, probeDuration, probeHasAudio, readWav, rmsNorm, createStaticServer, sendFile } from './index.ts';

test('retime filter mirrors the wedding prep rules', () => {
  expect(retimeFilter(1, 'none')).toBe('fps=30');
  expect(retimeFilter(0.55, 'mci')).toBe('setpts=(PTS-STARTPTS)/0.55,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1');
  expect(retimeFilter(0.85, 'none')).toBe('setpts=(PTS-STARTPTS)/0.85,fps=30');
  expect(retimeFilter(0.5, 'blend')).toBe('setpts=(PTS-STARTPTS)/0.5,minterpolate=fps=30:mi_mode=blend');
});

test('clamps cut length to the source end', () => {
  expect(cutLength({ in: 1, out: 3 }, 10)).toBeCloseTo(2.2);
  expect(cutLength({ in: 9, out: 12 }, 10)).toBeCloseTo(0.98);
});

test('cuts video and audio from a generated source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mn-'));
  const src = join(dir, 'src.mp4');
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
    '-c:v', 'libx264', '-c:a', 'aac', '-shortest', src]);
  const ref = { source: 's', in: 1, out: 2, speed: 1, interp: 'none' as const };
  await cutVideo({ src, ref, out: join(dir, 'v.mp4'), crf: 18, preset: 'ultrafast', width: 320, height: 180, fps: 30, sourceDuration: 4 });
  expect(await probeDuration(join(dir, 'v.mp4'))).toBeCloseTo(1.2, 1);
  await cutAudio({ src, ref: { source: 's', in: 1, out: 2 }, out: join(dir, 'a.wav') });
  const wav = readWav(readFileSync(join(dir, 'a.wav')));
  expect(wav.sampleRate).toBe(48000);
  expect(wav.channels).toBe(2);
  expect(wav.frames).toBeGreaterThan(47000);
  expect(rmsNorm(wav.data[0], 0.1)).toBeGreaterThan(0);
});

test('static server answers range requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ss-'));
  writeFileSync(join(dir, 'f.bin'), Buffer.from('0123456789'));
  const srv = createStaticServer(dir);
  const port = await srv.listen(0);
  const r = await fetch(`http://localhost:${port}/f.bin`, { headers: { Range: 'bytes=2-5' } });
  expect(r.status).toBe(206);
  expect(await r.text()).toBe('2345');
  expect((await fetch(`http://localhost:${port}/../etc`)).status).toBe(404);
  await srv.close();
});

test('static server listens on loopback only and survives malformed escapes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ss-'));
  writeFileSync(join(dir, 'f.bin'), Buffer.from('x'));
  const srv = createStaticServer(dir);
  const port = await srv.listen(0);
  expect(srv.address()).toBe('127.0.0.1');
  expect((await fetch(`http://127.0.0.1:${port}/%E0%A4%A`)).status).toBe(400);
  expect((await fetch(`http://127.0.0.1:${port}/f.bin`)).status).toBe(200);
  await srv.close();
});

test('an aborted ffmpeg run rejects with AbortError', async () => {
  const ac = new AbortController();
  const p = run(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:duration=120', '-f', 'null', '-'], { signal: ac.signal });
  setTimeout(() => ac.abort(), 300);
  await expect(p).rejects.toMatchObject({ name: 'AbortError' });
});

test('ffmpeg() captures stdout and reports failures with the stderr tail', async () => {
  const { stdout } = await ffmpeg(['-f', 'lavfi', '-i', 'sine=duration=0.1:sample_rate=8000', '-ac', '1', '-f', 's16le', '-'], { stdout: true });
  expect(stdout.length).toBe(1600);
  await expect(ffmpeg(['-i', 'does-not-exist.mp4', '-f', 'null', '-'])).rejects.toThrow(/^ffmpeg exit \d+: .*does-not-exist\.mp4/s);
});

test('probeHasAudio tells video-only files apart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mn-'));
  await run(['-f', 'lavfi', '-i', 'testsrc=size=160x90:duration=1', '-c:v', 'libx264', join(dir, 'v.mp4')]);
  await run(['-f', 'lavfi', '-i', 'testsrc=size=160x90:duration=1', '-f', 'lavfi', '-i', 'sine=duration=1', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', join(dir, 'av.mp4')]);
  expect(await probeHasAudio(join(dir, 'v.mp4'))).toBe(false);
  expect(await probeHasAudio(join(dir, 'av.mp4'))).toBe(true);
});

test('range requests past the end get 416; ranges ending past it are clamped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ss-'));
  writeFileSync(join(dir, 'f.bin'), Buffer.from('0123456789'));
  const srv = createStaticServer(dir);
  const port = await srv.listen(0);
  expect((await fetch(`http://127.0.0.1:${port}/f.bin`, { headers: { Range: 'bytes=20-' } })).status).toBe(416);
  const r = await fetch(`http://127.0.0.1:${port}/f.bin`, { headers: { Range: 'bytes=8-99' } });
  expect(r.status).toBe(206);
  expect(await r.text()).toBe('89');
  await srv.close();
});

test('an aborted download closes its file stream', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-'));
  writeFileSync(join(dir, 'big.bin'), Buffer.alloc(32 * 1024 * 1024));
  let stream: any;
  const srv = createServer((req, res) => { stream = sendFile(req, res, join(dir, 'big.bin')); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const ac = new AbortController();
  const r = await fetch(`http://127.0.0.1:${(srv.address() as any).port}/`, { signal: ac.signal });
  await r.body!.getReader().read();
  ac.abort();
  await new Promise((ok) => setTimeout(ok, 300));
  expect(stream?.destroyed).toBe(true);
  await new Promise((r) => srv.close(() => r(null)));
});

test.skipIf(process.platform !== 'win32')('a file that cannot be opened answers 500 and the server keeps running', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-'));
  const locked = join(dir, 'locked.bin'), ok = join(dir, 'ok.bin');
  writeFileSync(locked, 'x'); writeFileSync(ok, 'fine');
  const holder = spawn('powershell', ['-NoProfile', '-Command', `$f=[System.IO.File]::Open('${locked}','Open','ReadWrite','None'); Write-Output locked; Start-Sleep 30`]);
  await new Promise<void>((r) => holder.stdout.once('data', () => r()));
  const srv = createServer((req, res) => { sendFile(req, res, req.url === '/locked' ? locked : ok); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  try {
    expect((await fetch(`${base}/locked`)).status).toBe(500);
    expect(await (await fetch(`${base}/ok`)).text()).toBe('fine');
  } finally {
    holder.kill();
    await new Promise((r) => srv.close(() => r(null)));
  }
}, 30000);

test('probing does not block the event loop', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'probe-'));
  await run(['-f', 'lavfi', '-i', 'color=c=black:s=64x36:d=1', join(dir, 'v.mp4')]);
  let ticked = false;
  setTimeout(() => { ticked = true; }, 0);
  const d = await probeDuration(join(dir, 'v.mp4'));
  expect(ticked).toBe(true);
  expect(d).toBeCloseTo(1, 1);
});

test('a stabilised cut moves less between frames and leaves no transform file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stab-'));
  const src = join(dir, 'shaky.mp4');
  // a still test card seen through a window that jumps around every frame
  await run(['-f', 'lavfi', '-i', 'testsrc=size=480x360:rate=30:duration=3',
    '-vf', "crop=400:300:'40+30*sin(n*1.3)':'30+25*cos(n*1.9)'", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src]);
  const ref = { source: 's', in: 0.5, out: 2.5, speed: 1, interp: 'none' as const };
  const cut = (out: string, r: any) => cutVideo({ src, ref: r, out, crf: 18, preset: 'ultrafast', width: 400, height: 300, fps: 30, sourceDuration: 3 });
  await cut(join(dir, 'plain.mp4'), ref);
  await cut(join(dir, 'stab.mp4'), { ...ref, stab: { smoothing: 20, zoom: 3 } });
  const jitter = async (f: string) => {
    const { stdout } = await ffmpeg(['-i', f, '-vf', 'scale=100:75,format=gray', '-f', 'rawvideo', '-'], { stdout: true });
    const n = 100 * 75, frames = Math.floor(stdout.length / n);
    let sum = 0;
    for (let k = 1; k < frames; k++) for (let i = 0; i < n; i++) sum += Math.abs(stdout[k * n + i] - stdout[(k - 1) * n + i]);
    return sum / ((frames - 1) * n);
  };
  const [plain, stab] = [await jitter(join(dir, 'plain.mp4')), await jitter(join(dir, 'stab.mp4'))];
  expect(stab).toBeLessThan(plain * 0.6);
  expect(readdirSync(dir).filter((f) => f.endsWith('.trf'))).toEqual([]);
}, 120000);

test('an aborted stabilised cut leaves no transform file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stab-'));
  const src = join(dir, 's.mp4');
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src]);
  const ac = new AbortController();
  const p = cutVideo({ src, ref: { source: 's', in: 0, out: 3.5, speed: 1, interp: 'none', stab: { smoothing: 20, zoom: 3 } } as any,
    out: join(dir, 'o.mp4'), crf: 18, preset: 'ultrafast', width: 320, height: 240, fps: 30, sourceDuration: 4, signal: ac.signal });
  setTimeout(() => ac.abort(), 150);
  await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  expect(readdirSync(dir).filter((f) => f.endsWith('.trf'))).toEqual([]);
}, 60000);

test('stabilising a VP9 source does not corrupt it (vidstab must not hold the decoder\'s reused frames)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stab9-'));
  const src = join(dir, 'shaky.webm');
  await run(['-f', 'lavfi', '-i', 'testsrc2=size=720x420:rate=30:duration=3', '-vf', "crop=640:360:'40+30*sin(n*1.3)':'30+25*cos(n*1.9)'",
    '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2M', '-pix_fmt', 'yuv420p', src]);
  const ref = { source: 's', in: 0, out: 2.5, speed: 1, interp: 'none' as const, stab: { smoothing: 20, zoom: 3 } };
  await cutVideo({ src, ref, out: join(dir, 'cut.mp4'), crf: 18, preset: 'ultrafast', width: 640, height: 360, fps: 30, sourceDuration: 3 });
  // the same stabilisation on frames the filter graph owns (copy): what a correct cut looks like
  const len = cutLength(ref, 3).toFixed(3), cwd = dir;
  await run(['-ss', '0', '-t', len, '-i', src, '-an', '-vf', 'copy,vidstabdetect=shakiness=6:accuracy=12:result=r.trf', '-f', 'null', '-'], { cwd });
  await run(['-ss', '0', '-t', len, '-i', src, '-an', '-vf', 'copy,vidstabtransform=input=r.trf:smoothing=20:zoom=3:interpol=bicubic,fps=30,scale=640:360:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', join(dir, 'ref.mp4')], { cwd });
  const frame = async (f: string) => (await ffmpeg(['-ss', '1.5', '-i', f, '-frames:v', '1', '-vf', 'scale=160:90,format=gray', '-f', 'rawvideo', '-'], { stdout: true })).stdout;
  const [a, b] = [await frame(join(dir, 'cut.mp4')), await frame(join(dir, 'ref.mp4'))];
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  expect(sum / a.length).toBeLessThan(2);
}, 120000);

test('a cut to a relative path lands where the caller means', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rel-'));
  const src = join(dir, 'src.mp4');
  await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=2', '-pix_fmt', 'yuv420p', src]);
  const out = relative(process.cwd(), join(dir, 'v.mp4'));
  await cutVideo({ src, ref: { source: 's', in: 0, out: 1, speed: 1, interp: 'none' }, out, crf: 23, preset: 'ultrafast', width: 320, height: 180, fps: 30, sourceDuration: 2 });
  expect(existsSync(join(dir, 'v.mp4'))).toBe(true);
}, 60000);

test('a failed stabilisation names the source and its range', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stabfail-'));
  const p = cutVideo({ src: join(dir, 'missing.mp4'), ref: { source: 'cam2', in: 1, out: 2.5, speed: 1, interp: 'none', stab: { smoothing: 20, zoom: 3 } } as any,
    out: join(dir, 'o.mp4'), crf: 23, preset: 'ultrafast', width: 320, height: 180, fps: 30, sourceDuration: 3 });
  await expect(p).rejects.toThrow(/stabilise cam2 1–2\.5 s/);
}, 60000);
