// What the editor's browser tests (src/*.e2e.test.ts) share: a fresh projects folder, the server on a free port serving the built
// player and editor, headless Chrome, and the editor page open on a project. The jsdom tests have their own kit
// (src/editor-test-kit.ts). This file sits outside src/ on purpose: the build's staleness check counts every .ts under src/ that is
// not a *.test.ts as editor source, so a test helper newer than the build would stop the browser group until a rebuild.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { expect } from 'vitest';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { makeSource, startApp } from '@tellcut/server/test-utils';

export type App = Awaited<ReturnType<typeof startApp>>['app'];
export interface Session { app: App; base: string; browser: Browser; page: Page }
type Viewport = { width: number; height: number };

export const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');

/** a test file's own projects folder, projects/<name> (each file has its own: files run side by side) */
export const projectsRoot = (name: string) => join(TELLCUT_ROOT, 'projects', name);

/** project `id`'s project.json as saved */
export const readProject = (root: string, id: string) => JSON.parse(readFileSync(join(root, id, 'project.json'), 'utf8'));

/** expect.poll at one interval, with a default timeout that a call can override */
export const poller = (interval: number, timeout: number) => <T>(fn: () => T, t = timeout) => expect.poll(fn, { timeout: t, interval });

/** a project folder `id` holding the 4 s test source as src.mp4 and `project` as its project.json */
export async function writeProject(root: string, id: string, project: unknown): Promise<void> {
  mkdirSync(join(root, id), { recursive: true });
  await makeSource(join(root, id, 'src.mp4'));
  writeFileSync(join(root, id, 'project.json'), JSON.stringify(project, null, 2));
}

/** opens the editor on project `id` and waits for its player */
export async function openProject(page: Page, base: string, id: string, timeout = 30000): Promise<void> {
  await page.goto(`${base}/editor/?id=${id}`);
  await page.waitForSelector('[data-player="ready"]', { timeout });
}

export interface EditorOptions {
  /** the projects folder (projectsRoot): emptied first */
  root: string;
  /** writes the test's projects into the emptied folder, before the server starts */
  setup?: (root: string) => unknown;
  /** more server options: a fake claude, stand-ins for thumbnails and posters */
  app?: Omit<Parameters<typeof startApp>[0], 'projectsDir' | 'playerDist' | 'editorDist'>;
  /** a project whose footage is analysed (its jobs waited for) before Chrome starts */
  analyze?: string;
  /** Chrome plays sound without a gesture; by default it applies the same policy a person's Chrome does */
  autoplay?: boolean;
  /** the page's window; null: no page, the test opens its own */
  viewport: Viewport | null;
  /** default zh-TW */
  locale?: string;
  /** a project the page opens, waiting for its player (`readyTimeout`, default 30 s) and then for `waitFor` */
  open?: string;
  readyTimeout?: number;
  waitFor?: string;
}

/** Fails at once when the player or the editor has never been built: the tests drive the built pages. */
export function assertBuilt(): void {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
}

/** The server, Chrome and (unless `viewport` is null) a page, with the projects `setup` writes; on a failure part way, what was
 *  started is closed again (the file's afterAll only knows what this returned). */
export async function startEditor(o: EditorOptions & { viewport: Viewport }): Promise<Session>;
export async function startEditor(o: EditorOptions & { viewport: null }): Promise<Omit<Session, 'page'>>;
export async function startEditor(o: EditorOptions): Promise<Session | Omit<Session, 'page'>> {
  assertBuilt();
  rmSync(o.root, { recursive: true, force: true });
  await o.setup?.(o.root);
  const { app, base } = await startApp({ projectsDir: o.root, playerDist, editorDist, ...o.app });
  let browser: Browser | undefined;
  try {
    if (o.analyze) for (const j of (await (await fetch(`${base}/api/projects/${o.analyze}/analyze`, { method: 'POST' })).json()).jobs) await app.queue.wait(j.id);
    browser = await chromium.launch({ executablePath: chromePath(), headless: true, ...(o.autoplay ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {}) });
    if (!o.viewport) return { app, base, browser };
    const page = await browser.newPage({ viewport: o.viewport, locale: o.locale ?? 'zh-TW' });
    if (o.open) {
      await openProject(page, base, o.open, o.readyTimeout);
      if (o.waitFor) await page.waitForSelector(o.waitFor);
    }
    return { app, base, browser, page };
  } catch (e) {
    await browser?.close();
    await app.close();
    throw e;
  }
}

/** Closes Chrome and the server, then removes the projects folder. Closing Chrome can take ~25 s while other e2e files render
 *  exports in parallel (0.2 s alone). */
export async function stopEditor(root: string, s: { browser?: Browser; app?: App }): Promise<void> {
  await s.browser?.close();
  await s.app?.close();
  rmSync(root, { recursive: true, force: true });
}
