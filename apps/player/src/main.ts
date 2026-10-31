import { AudioEngine, MediaPool, Stage, parseProject, planAudio, usesThree } from '@tellcut/engine';
import { makeResolver } from './media.ts';
import { loadThreeKit, plugins } from '@tellcut/plugins';
import { importFx, registryWith } from '@tellcut/plugins/browser-fx';
import { whenReady } from './ready.ts';
import { loadFonts } from './fonts.ts';
import { drawFrame, settle, settledFrame } from './frame.ts';
import { mountControls } from './controls.ts';
import { startEmbed } from './embed.ts';
import { textBoxes, type Rect } from './layout.ts';

declare global { interface Window { __tellcut: { ready: Promise<void>; fps: number; duration: number; loudness: number; frame(n: number): Promise<void>; wav(): Promise<string>; layout(): Promise<Array<{ id: string; rects: Rect[] }>> } } }

const q = new URLSearchParams(location.search);
const RENDER = q.get('mode') === 'render';
if (RENDER) document.body.classList.add('render');
const apiId = q.get('media') === 'api' ? q.get('id') : null;
const projectUrl = new URL(q.get('project') ?? (apiId ? `/api/projects/${encodeURIComponent(apiId)}/files/project.json` : ''), location.href).href;
// a project only from this server: its fx run as this page, and a link here with ?project= on another site would run that site's code
if (new URL(projectUrl).origin !== location.origin) throw new Error(`project 只能來自這台伺服器：${projectUrl}`);
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const json = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const EMBED = q.get('embed') === '1';

async function init() {
  const project = parseProject(await json(projectUrl));
  const resolver = await makeResolver(q, project, projectUrl, location.origin, json);
  const fx = await importFx(projectUrl, project.meta.fx);
  // a render must not go on without an effect it asked for
  if (RENDER && fx.errors.length) throw new Error(fx.errors.map((e) => `fx ${e.path}：${e.message}`).join('\n'));
  for (const e of fx.errors) console.error(`fx ${e.path}：${e.message}`);
  const registry = registryWith(plugins, fx);
  const pool = new MediaPool(resolver, { render: RENDER, fps: project.meta.fps });
  const stageEl = document.getElementById('stage')!;
  // three.js only for a project that uses it: the chunk is not downloaded otherwise
  const three = usesThree(project, registry) ? await loadThreeKit() : undefined;
  const stage = new Stage(stageEl, registry, pool, { strict: RENDER, subpixelZoom: !RENDER, three });
  stage.load(project);
  const audio = new AudioEngine(planAudio(project, stage.times, resolver, projectUrl), registry.sfx, project.meta.mix, project.meta.duration);
  await loadFonts(document, location.href);
  await whenReady({
    preload: () => Promise.all([pool.preload(stage.mediaRefs()), stage.ready()]).then(() => {}),
    audio: () => audio.load(),
    images: () => [...stageEl.querySelectorAll('img')],
    fonts: document.fonts,
  });
  const at = (t: number) => Math.max(0, Math.min(project.meta.duration, t));
  const draw = (t: number) => stage.draw(at(t)), late = (t: number) => stage.late(at(t));
  const frame = (t: number) => drawFrame(stage, pool, at(t));
  await frame(0);
  if (!RENDER) mountControls({ stage: stageEl, draw, late, pool, audio, duration: project.meta.duration });
  return { project, pool, audio, frame };
}

if (EMBED) {
  // driven by the editor through postMessage (embed.ts); no project is fetched here
  document.body.classList.add('embed');
  const resolver = await makeResolver(q, { sources: {} }, projectUrl, location.origin, json);
  await loadFonts(document, location.href);
  startEmbed(window, document.getElementById('stage')!, document.getElementById('viewport')!, { resolver, projectUrl });
} else {
  const boot = init();
  window.__tellcut = {
    fps: 30, duration: 0, loudness: -14,
    ready: boot.then(({ project }) => { window.__tellcut.fps = project.meta.fps; window.__tellcut.duration = project.meta.duration; window.__tellcut.loudness = project.meta.loudness ?? -14; }),
    async frame(n) { const { project, frame } = await boot; await settledFrame(() => frame(n / project.meta.fps), () => settle(document, raf), document.fonts); },
    async wav() { return (await boot).audio.renderWav(); },
    // the words on screen after the last frame(), for npm run check
    async layout() { const { project } = await boot; return textBoxes(document.getElementById('stage')!, project.meta.width); },
  };
  // the message can quote project.json strings: text, never markup
  boot.catch((e) => {
    console.error(e);
    const pre = document.createElement('pre');
    pre.style.cssText = 'position:fixed;top:0;left:0;color:#f55;white-space:pre-wrap';
    pre.textContent = String(e?.stack ?? e);
    document.body.append(pre);
  });
}
