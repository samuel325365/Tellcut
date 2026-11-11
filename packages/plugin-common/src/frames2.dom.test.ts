// @vitest-environment jsdom
// The frames of round two (2026-11-07): common.grid, common.slant, common.postage, common.letterbox — each run on a real Stage with
// a stand-in media API, so the cells' videos, stills and stand-ins, their timing and the DOM they leave are tested (jsdom has no
// canvas: a stand-in context takes any call).
import { createRegistry, defaultSafe, itemMediaIssues, Stage, type ItemType } from '@tellcut/engine';
import { grid } from './grid.ts';
import { slant, slantPolys } from './slant.ts';
import { postage } from './postage.ts';
import { letterbox, letterboxBar } from './letterbox.ts';
import { cellEl, cellMedia, parseCellShots, revealTimes, showCell } from './cells.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext, realToDataURL = HTMLCanvasElement.prototype.toDataURL;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; HTMLCanvasElement.prototype.toDataURL = () => 'data:,'; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; HTMLCanvasElement.prototype.toDataURL = realToDataURL; });

let videos: Array<{ source: string; in: number; out: number; local: number; parent: HTMLElement }> = [];
const media: any = {
  begin() { videos = []; },
  video(ref: any, parent: HTMLElement, local: number) {
    let v = parent.querySelector('video') as HTMLVideoElement | null;
    if (!v) { v = document.createElement('video'); parent.appendChild(v); }
    videos.push({ source: ref.source, in: ref.in, out: ref.out, local, parent }); return v;
  },
  place() {}, stillUrl: (r: any) => `still:${r.source}@${r.t}`, fileUrl: () => '', sync: async () => {}, image() {},
};

/** the block alone on an overlay track over `len` s of a W×H frame; draw(t) draws and returns the item's element */
function run(block: ItemType<any, any>, params: Record<string, unknown>, len = 3, W = 1080, H = 1920) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [block] } as any]), media);
  st.load({
    version: 1, meta: { width: W, height: H, fps: 30, duration: len, background: '#000', plugins: [] },
    sources: { a: { path: 'a.mp4', duration: 60, width: 1920, height: 1080, kind: 'video', audio: false } }, media: {}, grids: [],
    tracks: [{ id: 'ov', kind: 'overlay', items: [{ id: 'x', type: block.type, start: 0, end: len, params }] }],
  } as any);
  const el = root.querySelector('.st-item[data-id="x"]') as HTMLElement;
  return { el, draw: (t: number) => { videos = []; st.draw(t); return el; } };
}
const item = (block: ItemType<any, any>, params: Record<string, unknown>, len: number) => ({ id: 'x', type: block.type, start: 0, end: len, params }) as any;

describe('common.grid', () => {
  test('an overlay frame', () => {
    expect([grid.kind, grid.category]).toEqual(['overlay', 'frame']);
  });
  test('media(): the cells\' clips and stills, as cellMedia says', () => {
    const p = { layout: 'four', shots: 'a|2\na|5||still', times: '0,0.4' };
    expect(grid.media!(item(grid, p, 3), {} as any)).toEqual(cellMedia(parseCellShots(p.shots), revealTimes(p.times, 4, 0.4), 3));
    expect(grid.media!(item(grid, p, 3), {} as any)).toEqual({ videos: [{ source: 'a', in: 2, out: 5, speed: 1, interp: 'none' }], stills: [{ source: 'a', t: 5, w: 1080 }] });
  });
  test('a cell plays its shot from when it comes in; a cell with no shot shows the stand-in, not a video', () => {
    const r = run(grid, { layout: 'two', shots: 'a|2', times: '0,0.4', reveal: 'fade' });
    r.draw(1);
    expect(videos).toEqual([expect.objectContaining({ source: 'a', in: 2, local: 1 })]);
    const cells = [...r.el.querySelectorAll(':scope > div')].slice(1) as HTMLElement[];
    expect(cells.length).toBe(2);
    expect(cells[1].querySelector('video')).toBeNull();
  });
  test('a cell not in yet is hidden; slide starts it off the frame and settles at its place', () => {
    const r = run(grid, { layout: 'two', times: '0,1', reveal: 'slide', from: 'right' });
    const second = () => ([...r.el.querySelectorAll(':scope > div')][2] as HTMLElement);
    r.draw(0.5); expect(second().style.display).toBe('none');
    r.draw(1.01); expect(second().style.transform).toMatch(/^translate\(\d{3,}\.\d+px, 0\.00px\)/);
    r.draw(2.5); expect(second().style.transform).toBe('translate(0.00px, 0.00px) scale(1.0000)');
  });
});

describe('common.slant', () => {
  test('an overlay frame; media(): one clip a band from when it comes in (0.35 s apart)', () => {
    expect([slant.kind, slant.category]).toEqual(['overlay', 'frame']);
    expect(slant.media!(item(slant, { shots: 'a|1\na|2\na|3' }, 3), {} as any).videos.map((v) => [v.in, v.out])).toEqual([[1, 4], [2, 4.65], [3, 5.3]]);
  });
  test('a band not in yet is hidden; it slides in with its picture and settles; its clip-path is its own slanted band', () => {
    const r = run(slant, { count: 3, shots: 'a|1\na|2\na|3' });
    const band = (i: number) => ([...r.el.querySelectorAll(':scope > [data-band]')][i] as HTMLElement);
    r.draw(0.2); expect(band(1).style.display).toBe('none');
    r.draw(0.5); expect(band(1).style.transform).not.toBe('translate(0.00px, 0.00px)');
    r.draw(2); expect(band(1).style.transform).toBe('translate(0.00px, 0.00px)');
    expect(band(1).style.clipPath).toMatch(/^polygon\(/);
    expect(videos.filter((v) => v.parent.closest('[data-band="1"]')).map((v) => v.in)).toEqual([2]);
  });
  test('labels: a tag in each band that has one', () => {
    const r = run(slant, { count: 2, labels: 'BEFORE,AFTER' });
    r.draw(2);
    expect([...r.el.querySelectorAll('[data-tag]')].map((e) => [e.textContent, (e as HTMLElement).style.display])).toEqual([['BEFORE', 'block'], ['AFTER', 'block']]);
  });
});

describe('common.postage', () => {
  test('an overlay frame; media(): its shot from `from` to the end, or a still, or nothing', () => {
    expect([postage.kind, postage.category]).toEqual(['overlay', 'photo']);
    expect(postage.media!(item(postage, { source: 'a', from: 2 }, 4), {} as any)).toEqual({ videos: [{ source: 'a', in: 2, out: 6, speed: 1, interp: 'none' }], stills: [] });
    expect(postage.media!(item(postage, { source: 'a', from: 2, still: true }, 4), {} as any)).toEqual({ videos: [], stills: [{ source: 'a', t: 2, w: 1080 }] });
    expect(postage.media!(item(postage, {}, 4), {} as any)).toEqual({ videos: [], stills: [] });
  });
  test('the stamp plays its shot while it drops in, keeps its tilt when settled, and prints its value and line', () => {
    const r = run(postage, { source: 'a', from: 2, tilt: -3, value: 'NT$ 15', line: 'TAIWAN' }, 4);
    r.draw(0.2);
    expect(videos).toEqual([expect.objectContaining({ source: 'a', in: 2, local: 0.2 })]);
    const stamp = r.el.querySelector('[data-stamp]') as HTMLElement;
    r.draw(2);
    expect(stamp.style.transform).toContain('rotate(-3.000deg)');
    expect(stamp.textContent).toContain('NT$ 15'); expect(stamp.textContent).toContain('TAIWAN');
  });
  test('no source: the stand-in, no video', () => {
    const r = run(postage, {}, 4);
    r.draw(2);
    expect(videos).toEqual([]);
    expect(r.el.querySelector('video')).toBeNull();
  });
});

describe('common.letterbox', () => {
  const bars = (el: HTMLElement) => [...el.querySelectorAll('[data-bar]')].map((b) => parseFloat((b as HTMLElement).style.height));
  test('the bars grow from nothing to the auto ratio and go back after outAt', () => {
    expect(letterbox.kind).toBe('overlay'); expect(letterbox.category).toBe('frame');
    const r = run(letterbox, {});
    expect(bars(r.draw(0))).toEqual([0, 0]);
    expect(bars(r.draw(2))).toEqual([420, 420]);
    const out = run(letterbox, { outAt: 2, outDur: 0.8 }, 4);
    expect(bars(out.draw(3))).toEqual([0, 0]);
  });
  test('the title is DOM text, hidden until titleAt (inDur by default)', () => {
    const r = run(letterbox, { title: 'CHAPTER ONE', sub: 'ROME' });
    const title = r.draw(0.5).querySelector('[data-title]') as HTMLElement;
    expect(title.textContent).toBe('CHAPTER ONE'); expect(Number(title.style.opacity)).toBe(0);
    expect(Number((r.draw(2).querySelector('[data-title]') as HTMLElement).style.opacity)).toBe(1);
    expect((r.draw(2).querySelector('[data-sub]') as HTMLElement).textContent).toBe('ROME');
  });
});

describe('round-1 minors (2026-11-08)', () => {
  test('a shot naming a source the project lacks: the stand-in, nothing played or loaded, and the checks name it', () => {
    const cases: Array<[ItemType<any, any>, Record<string, unknown>]> = [
      [grid, { layout: 'two', shots: 'zz|2\nzz|0||still' }], [slant, { count: 2, shots: 'zz|2\nzz|0||still' }], [postage, { source: 'zz', from: 2 }]];
    for (const [block, params] of cases) {
      const r = run(block, params);
      r.draw(2);
      expect(videos).toEqual([]);
      expect([...r.el.querySelectorAll('img')].every((i) => !i.getAttribute('src') && (i as HTMLElement).style.display === 'none')).toBe(true);
      expect(itemMediaIssues(block, item(block, params, 3), { sources: { a: {} } } as any)).toEqual(['unknown source "zz"']);
    }
  });
  test('postage: a crop of only a zoom places the picture with that zoom, never NaN', () => {
    const crops: unknown[] = [], place = media.place;
    media.place = (_el: unknown, _w: number, _h: number, crop: unknown) => { crops.push(crop); };
    try { run(postage, { source: 'a', crop: { zoom: 1.5 } }).draw(2); } finally { media.place = place; }
    expect(crops.at(-1)).toEqual({ x: 0.5, y: 0.5, zoom: 1.5 });
  });
  test('postage: hiding frees the postmark canvas too', () => {
    const r = run(postage, { source: 'a', markAt: 0.5 });
    r.draw(2); r.draw(5);
    expect([...r.el.querySelectorAll('canvas')].map((c) => [c.width, c.height])).toEqual([[0, 0], [0, 0], [0, 0]]);
  });
  test('slant on a wide frame: each tag sits inside its own band, below the safe line', () => {
    const W = 1920, H = 1080, r = run(slant, { count: 3, labels: 'A,B,C' }, 3, W, H), polys = slantPolys(3, 8, W, H);
    r.draw(2);
    [...r.el.querySelectorAll('[data-tag]')].forEach((e, i) => {
      const left = parseFloat((e as HTMLElement).style.left), top = parseFloat((e as HTMLElement).style.top), [tl, tr, , bl] = polys[i];
      expect(left).toBeGreaterThan(Math.max(tl[0], bl[0])); expect(left).toBeLessThan(tr[0]);
      expect(top).toBeGreaterThanOrEqual(defaultSafe(W, H).top * H);
    });
  });
  test('letterbox: on a wide frame the title lies in the bottom bar and the small line in the top one; on a tall one both in the top bar below the safe line', () => {
    const box = (e: Element) => { const s = (e as HTMLElement).style, y = parseFloat(s.top); return [y, y + parseFloat(s.fontSize)]; };
    const wide = run(letterbox, { title: 'CHAPTER ONE', sub: 'ROME' }, 3, 1920, 1080).draw(2), bw = letterboxBar(0, 1920, 1080);
    const [t0, t1] = box(wide.querySelector('[data-title]')!), [s0, s1] = box(wide.querySelector('[data-sub]')!);
    expect(t0).toBeGreaterThanOrEqual(1080 - bw); expect(t1).toBeLessThanOrEqual(1080);
    expect(s0).toBeGreaterThanOrEqual(0); expect(s1).toBeLessThanOrEqual(bw);
    const tall = run(letterbox, { title: 'CHAPTER ONE', sub: 'ROME' }).draw(2), safe = defaultSafe(1080, 1920).top * 1920;
    for (const sel of ['[data-title]', '[data-sub]']) { const [a, b] = box(tall.querySelector(sel)!); expect(a).toBeGreaterThanOrEqual(safe); expect(b).toBeLessThanOrEqual(420); }
  });
  test('letterbox: a tall title alone gets 0.6 of the room; the small line never shrinks below 20 px while the bar has room', () => {
    const room = 420 - defaultSafe(1080, 1920).top * 1920;
    const alone = run(letterbox, { title: 'ROMA', size: 160 }).draw(2).querySelector('[data-title]') as HTMLElement;
    expect(parseFloat(alone.style.fontSize)).toBeCloseTo(room * 0.6, 1);
    const small = run(letterbox, { title: 'ROMA', sub: 'SPRING', size: 30 }).draw(2).querySelector('[data-sub]') as HTMLElement;
    expect(parseFloat(small.style.fontSize)).toBe(20);
  });
  test('letterbox: going back, a word is gone before the bar uncovers it (never half-seen over the picture)', () => {
    for (const [W, H] of [[1920, 1080], [1080, 1920]]) {
      const r = run(letterbox, { title: 'CHAPTER ONE', sub: 'ROME', outAt: 2, outDur: 0.8 }, 4, W, H);
      for (let t = 2; t <= 2.9; t += 0.01) {
        const el = r.draw(t), bar = parseFloat((el.querySelector('[data-bar]') as HTMLElement).style.height);
        for (const sel of ['[data-title]', '[data-sub]']) {
          const s = (el.querySelector(sel) as HTMLElement).style, y0 = parseFloat(s.top), y1 = y0 + parseFloat(s.fontSize), top = sel === '[data-sub]' || H > W;
          if (Number(s.opacity) > 0) expect(top ? y1 <= bar + 1e-6 : y0 >= H - bar - 1e-6).toBe(true);
        }
      }
    }
  });
});

describe('cells: export path (review fixes)', () => {
  test('every still starts loading at build, while its cell is still hidden, so ready() can wait for it', () => {
    const r = run(grid, { layout: 'four', shots: 'a|1||still\na|2||still\na|3||still\na|4||still' });
    const srcs = [...r.draw(0).querySelectorAll('img')].map((i) => (i as HTMLImageElement).getAttribute('src'));
    expect(srcs).toEqual(['still:a@1', 'still:a@2', 'still:a@3', 'still:a@4']);
  });
  test('a cell due in the last 0.05 s neither shows nor plays (media() does not declare it)', () => {
    const g = run(grid, { layout: 'four', shots: 'a|1\na|2\na|3\na|9', times: '0,1,2,2.96' });
    g.draw(2.9667);
    expect(videos.map((v) => v.in)).not.toContain(9);
    const s = run(slant, { count: 3, shots: 'a|1\na|2\na|9', times: '0,1,2.97' });
    s.draw(2.99);
    expect(videos.map((v) => v.in)).not.toContain(9);
  });
});

describe('health scan 6 (2026-11-08)', () => {
  test('postage: an item of 0.05 s or less plays and loads nothing (media() declares nothing), the stand-in shows', () => {
    for (const still of [false, true]) {
      const r = run(postage, { source: 'a', from: 2, still }, 0.05);
      const el = r.draw(0.02);
      expect(videos).toEqual([]);
      expect(el.querySelector('video')).toBeNull();
      expect(el.querySelector('img')!.getAttribute('src')).toBeNull();
    }
  });
  test('showCell: a cell switched from a still to a video hides the still under the video', () => {
    const ctx: any = { project: { sources: { a: { width: 1920, height: 1080 } } }, media };
    const win = cellEl(document.createElement('div'));
    showCell(ctx, win, { source: 'a', from: 1, crop: { x: 0.5, y: 0.5, zoom: 1 }, still: true }, 0.5, 2, 400, 300);
    expect(win.img.style.display).toBe('block');
    showCell(ctx, win, { source: 'a', from: 1, crop: { x: 0.5, y: 0.5, zoom: 1 }, still: false }, 0.5, 2, 400, 300);
    expect(win.img.style.display).toBe('none');
    expect(win.box.querySelector('video')).not.toBeNull();
  });
  test('letterbox: drawn in the 700 weight fonts.css loads; a centred or right-aligned line moves right by half or all of the trailing letter-spacing', () => {
    const at = (align: string) => {
      const t = run(letterbox, { title: 'CHAPTER ONE', spacing: 0.3, align }).draw(2).querySelector('[data-title]') as HTMLElement;
      return { left: parseFloat(t.style.left), size: parseFloat(t.style.fontSize), weight: t.style.fontWeight };
    };
    const l = at('left'), c = at('center'), r = at('right');
    expect(l.weight).toBe('700');
    expect(c.left - l.left).toBeCloseTo(0.15 * l.size, 1);
    expect(r.left - l.left).toBeCloseTo(0.3 * l.size, 1);
  });
});
