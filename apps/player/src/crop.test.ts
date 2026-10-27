// @vitest-environment jsdom
import { CropView, cropFrameLocal } from './crop.ts';

function setup() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const sent: any[] = [];
  const v = new CropView(host, (m) => sent.push(m));
  v.show({ itemId: 'c1', which: 'from', url: 'http://h/proxy/s', time: 1, srcW: 1920, srcH: 1080, frameW: 1920, frameH: 1080,
    crop: { x: 0.5, y: 0.5, zoom: 2 }, view: { w: 960, h: 540 } });
  return { host, v, sent, box: host.querySelector<HTMLElement>('[data-crop-box]')! };
}

test('the viewfinder marks the visible part of the full source frame', () => {
  const { box } = setup();
  expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual(['240px', '135px', '480px', '270px']);
});

test('the viewfinder follows the cursor; live crops while dragging and a final one on release', () => {
  const { box, sent } = setup();
  box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500, clientY: 300 }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 596, clientY: 300 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 596, clientY: 300 }));
  expect(sent[0]).toEqual({ type: 'cropChange', itemId: 'c1', which: 'from', crop: { x: 0.7, y: 0.5, zoom: 2 }, final: false });
  expect(sent.at(-1)).toEqual({ type: 'cropChange', itemId: 'c1', which: 'from', crop: { x: 0.7, y: 0.5, zoom: 2 }, final: true });
  expect(box.style.left).toBe('336px');   // moved with the cursor: 240 + 96
});

test('the wheel zooms within 1..8', () => {
  const { box, sent } = setup();
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 }));
  expect(sent.at(-1).crop.zoom).toBeCloseTo(2.2);
  for (let i = 0; i < 40; i++) box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 }));
  expect(sent.at(-1).crop.zoom).toBe(8);
});

test('a burst of wheel zooms previews live and ends in one final change', () => {
  vi.useFakeTimers();
  try {
    const { box, sent } = setup();
    box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 }));
    box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 }));
    expect(sent.filter((m) => m.final)).toEqual([]);
    vi.advanceTimersByTime(300);
    const finals = sent.filter((m) => m.final);
    expect(finals.length).toBe(1);
    expect(finals[0].crop.zoom).toBeCloseTo(2.42);
  } finally { vi.useRealTimers(); }
});

test('crop mode shows the first frame for the start and the last (or frozen) frame for the end', () => {
  expect(cropFrameLocal({}, 4, 'from', 25)).toBe(0);
  expect(cropFrameLocal({}, 4, 'to', 25)).toBeCloseTo(3.96);
  expect(cropFrameLocal({ freezeAt: 1.5 }, 4, 'to', 25)).toBe(1.5);
});

test('a photo is framed on the picture itself (an image, not a video)', () => {
  const { host, v } = setup();
  v.show({ itemId: 'p1', which: 'to', url: 'http://h/image/ph', image: true, time: 0, srcW: 900, srcH: 1200, frameW: 1920, frameH: 1080,
    crop: { x: 0.5, y: 0.5, zoom: 1.1 }, view: { w: 960, h: 540 } });
  const img = host.querySelector<HTMLImageElement>('.crop-view img')!, video = host.querySelector<HTMLVideoElement>('.crop-view video')!;
  expect([img.getAttribute('src'), img.style.display, video.style.display, img.style.height]).toEqual(['http://h/image/ph', '', 'none', '540px']);
  v.show({ itemId: 'c1', which: 'from', url: 'http://h/proxy/s', time: 1, srcW: 1920, srcH: 1080, frameW: 1920, frameH: 1080, crop: { x: 0.5, y: 0.5, zoom: 1 }, view: { w: 960, h: 540 } });
  expect([img.style.display, video.style.display]).toEqual(['none', '']);
});

test('crop mode shows the frame of a keyframe', () => {
  const it = { freezeAt: null, crop: { keys: [{ t: 1.5 }] } };
  expect(cropFrameLocal(it, 4, 0, 30)).toBe(1.5);
  expect(cropFrameLocal({ ...it, freezeAt: 1 }, 4, 0, 30)).toBe(1);
  expect(cropFrameLocal(it, 4, 'from', 30)).toBe(0);
});

test('a keyframe trimmed off the clip shows the clip\'s last frame', () => {
  expect(cropFrameLocal({ crop: { keys: [{ t: 5 }] } }, 4, 0, 30)).toBeCloseTo(4 - 1 / 30);
});
