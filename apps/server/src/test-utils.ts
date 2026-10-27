// Shared fixtures for the server tests.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '@tellcut/media-node';
import { createApp, type AppOptions } from './app.ts';

export const MIX = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } };

export function demoProject(over: Record<string, unknown> = {}): any {
  return {
    version: 1,
    meta: { name: 'Demo', width: 320, height: 180, fps: 30, duration: 1, plugins: [], cut: { crf: 23, preset: 'ultrafast' }, mix: MIX },
    sources: { s1: { path: 'src.mp4', duration: 4, width: 320, height: 180 } }, media: {}, grids: [],
    tracks: [
      { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0.5, speed: 1, start: 0, end: 1, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.2 } } }] },
      { id: 'o', kind: 'overlay', items: [{ id: 'f', type: 'core.flash', start: 0.5, end: 0.8, params: { peak: 1, rise: 0, hold: 0, fall: 0.3, power: 1, color: '#fff' } }] },
    ],
    ...over,
  };
}

/** A projects dir holding a valid `demo` project (fresh temp dir unless `root` is given). */
export function makeProjects(root = mkdtempSync(join(tmpdir(), 'srv-'))): string {
  mkdirSync(join(root, 'demo'), { recursive: true });
  writeFileSync(join(root, 'demo', 'project.json'), JSON.stringify(demoProject(), null, 2));
  return root;
}

/** 4 s, 320×180: red for 2 s then blue (one scene cut at 2 s), with a 440 Hz tone unless audio is false. */
export async function makeSource(path: string, o: { audio?: boolean } = {}) {
  const audio = o.audio ?? true;
  await run(['-f', 'lavfi', '-i', 'color=red:s=320x180:d=2:r=30', '-f', 'lavfi', '-i', 'color=blue:s=320x180:d=2:r=30',
    ...(audio ? ['-f', 'lavfi', '-i', 'sine=duration=4'] : []),
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', ...(audio ? ['-map', '2:a', '-c:a', 'aac', '-shortest'] : []), '-c:v', 'libx264', path]);
}

export async function startApp(o: AppOptions) {
  const app = createApp({ extras: false, ...o });   // tests that need sheets/transcripts ask for them
  const port = await app.listen(0);
  return { app, base: `http://127.0.0.1:${port}` };
}

/** Reads a server-sent-events stream until the server ends it (or `signal` aborts); returns the JSON payloads. */
export async function sse(url: string, signal?: AbortSignal): Promise<any[]> {
  const out: any[] = [];
  try {
    const res = await fetch(url, { signal });
    const reader = res.body!.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        if (chunk.startsWith('data: ')) out.push(JSON.parse(chunk.slice(6)));
      }
    }
  } catch (e) { if ((e as Error).name !== 'AbortError') throw e; }
  return out;
}

/** A live SSE reader: next() resolves with the next JSON message (rejects after ms). */
export function events(url: string) {
  const ctl = new AbortController(), queue: any[] = [], waiters: Array<(m: any) => void> = [];
  void (async () => {
    try {
      const res = await fetch(url, { signal: ctl.signal });
      const reader = res.body!.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (!line.startsWith('data: ')) continue;
          const m = JSON.parse(line.slice(6)), w = waiters.shift();
          if (w) w(m); else queue.push(m);
        }
      }
    } catch { /* closed */ }
  })();
  return {
    next: (ms = 3000) => new Promise<any>((res, rej) => {
      if (queue.length) return res(queue.shift());
      const w = (m: any) => { clearTimeout(t); res(m); };
      // a wait that timed out must not swallow the next message
      const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej(new Error('no event')); }, ms);
      waiters.push(w);
    }),
    close: () => ctl.abort(),
  };
}
