// @vitest-environment jsdom
// The photo cards point at a picture and frame it one way: a source and a source second, and a crop "x,y,zoom" read as a clip's
// crop (the point to aim at, 0–1, and a zoom of 1 and up). common.popcard's shots and the grid/slant/cells/flatlay shot lines
// already wrote it so; common.prints (src=, crop= options), common.photostack (a zoom after its focus) and common.polaroid (its crop
// as text too) now read it as well, and still read what they read before.
import { coverPlacement, resolveTheme, withDefaults } from '@tellcut/engine';
import { parseShots } from './dopamine.ts';
import { cropText, polaroidCrop } from './polaroid.ts';
import { parsePrints, prints } from './prints.ts';
import { parseCards, photostack } from './photostack.ts';

const CROP = { x: 0.3, y: 0.2, zoom: 1.5 };

test('one crop, written the same way, reads the same in every card', () => {
  expect(cropText('0.3,0.2,1.5')).toEqual(CROP);
  expect(cropText(' 0.3 , 0.2 ')).toEqual({ x: 0.3, y: 0.2, zoom: 1 });
  expect(cropText('')).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
  expect(parseShots('0|a|1|0.3,0.2,1.5', 2)[0].crop).toEqual(CROP);
  expect(parsePrints('0|1|0.5,0.5,0.5|0|4:3|crop=0.3,0.2,1.5')[0].crop).toEqual(CROP);
  expect(parseCards('a|1|latte|0.3,0.2,1.5')[0]).toMatchObject({ fx: 0.3, fy: 0.2, zoom: 1.5 });
  expect(polaroidCrop('0.3,0.2,1.5')).toEqual(CROP);
});

describe('common.polaroid', () => {
  test('its crop as an object as before, or as "x,y,zoom" text; the middle at zoom 1 is the plain cover', () => {
    expect(polaroidCrop({ x: 0.5, y: 0.25, zoom: 1.8 })).toEqual({ x: 0.5, y: 0.25, zoom: 1.8 });
    expect(polaroidCrop('0.5,0.25,1.8')).toEqual({ x: 0.5, y: 0.25, zoom: 1.8 });
    expect([polaroidCrop('0.5,0.5,1'), polaroidCrop(''), polaroidCrop({ x: 0.5, y: 0.5, zoom: 1 })]).toEqual([null, null, null]);
  });
});

describe('common.prints', () => {
  test('a print names its own source with src= (else the item\'s) and its crop with crop=, which wins over the old focus=', () => {
    const [a, b, c] = parsePrints('0|3|0.5,0.5,0.5|0|4:3|src=b crop=0.3,0.2,1.5 focus=0.9,0.9\n0|4|0.5,0.5,0.5|0|4:3|focus=0.3,0.6\n0|5|0.5,0.5,0.5');
    expect([a.source, a.crop, a.fx, a.fy]).toEqual(['b', CROP, 0.3, 0.2]);
    expect([b.source, b.crop, b.fx, b.fy]).toEqual(['', null, 0.3, 0.6]);
    expect([c.source, c.crop]).toEqual(['', null]);
  });
  test('it declares each print\'s still from its own source, or the item\'s; a print with neither has none', () => {
    const item = (source: string) => ({ id: 'p', type: prints.type, start: 0, end: 3, params: { source, prints: '0|10|0.5,0.5,0.5|0|4:3|src=b\n0|12|0.5,0.5,0.5' } }) as any;
    expect(prints.media!(item('v'), {} as any).stills).toEqual([{ source: 'b', t: 10, w: 720 }, { source: 'v', t: 12, w: 720 }]);
    expect(prints.media!(item(''), {} as any).stills).toEqual([{ source: 'b', t: 10, w: 720 }]);
  });
  test('a print with crop= is placed the way a clip\'s crop places its picture, inside the white border', () => {
    const W = 1080, H = 1920, theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
    const ctx: any = { t: 1, local: 1, dur: 3, W, H, root, theme, motion: { spring: () => () => 1 }, media: { stillUrl: (r: { source: string }) => `${r.source}.jpg` },
      params: withDefaults(prints.params, { source: 'v', prints: '0|0|0.5,0.5,0.5|0|1:1|src=b crop=0.3,0.2,1.5\n0|0|0.5,0.5,0.5|0|1:1|focus=0.3,0.6', border: 0.05 }, theme) };
    const s = prints.build(ctx), [cropped, old] = s.list;
    for (const img of [cropped.img, old.img]) { Object.defineProperty(img, 'naturalWidth', { value: 1600 }); Object.defineProperty(img, 'naturalHeight', { value: 900 }); }
    prints.draw(ctx, s);
    expect(cropped.img.src).toMatch(/b\.jpg$/);
    expect(old.img.src).toMatch(/v\.jpg$/);
    // the cropped one sits in a window at the border; the picture in it is where coverPlacement puts it
    const win = cropped.img.parentElement as HTMLElement, inner = 540 - 2 * 27, b = coverPlacement(1600, 900, inner, inner, CROP);
    expect([win.style.overflow, win.style.left, win.style.width]).toEqual(['hidden', '5%', '90%']);
    expect([cropped.img.style.left, cropped.img.style.top, cropped.img.style.width, cropped.img.style.height].map(parseFloat))
      .toEqual([b.left, b.top, b.width, b.height].map((v) => (v / inner) * 100));
    // the old focus= keeps its object-position, as drawn before
    expect([old.img.style.objectFit, old.img.style.objectPosition, old.img.style.left]).toEqual(['cover', '30% 60%', '5%']);
  });
});

describe('common.photostack', () => {
  test('a card\'s focus may carry a zoom (x,y,zoom); without one it is 1, as before', () => {
    expect(parseCards('a|2|latte|0.3,0.6\nb|1|by the window|0.4,0.5,2')).toEqual([
      { source: 'a', t: 2, label: 'latte', fx: 0.3, fy: 0.6, zoom: 1 }, { source: 'b', t: 1, label: 'by the window', fx: 0.4, fy: 0.5, zoom: 2 }]);
    expect(parseCards('a|2||0.3,0.6,0')[0].zoom).toBe(1);
  });
  test('a zoomed card is drawn where coverPlacement puts it; an unzoomed one exactly as before', () => {
    const drawn: number[][] = [];
    const g: any = new Proxy({}, { get: (_t, k) => (typeof k === 'symbol' ? undefined : k === 'drawImage' ? (...a: number[]) => drawn.push(a.slice(1)) : k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
    const real = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = () => g;
    try {
      const W = 1080, H = 1920, theme = resolveTheme(undefined, { width: W, height: H });
      const ctx: any = { t: 3, local: 3, dur: 4, W, H, root: document.createElement('div'), theme, media: { stillUrl: () => 'x.jpg' },
        params: withDefaults(photostack.params, { cards: 'a|0||0.3,0.2,1.5\nb|0||0.3,0.2' }, theme) };
      const s = photostack.build(ctx);
      for (const c of s.cards) { Object.defineProperty(c.img, 'complete', { value: true }); Object.defineProperty(c.img, 'naturalWidth', { value: 1600 }); Object.defineProperty(c.img, 'naturalHeight', { value: 900 }); }
      photostack.draw(ctx, s);
    } finally { HTMLCanvasElement.prototype.getContext = real; }
    const cw = 756 - 10, ch = 378 - 10, b = coverPlacement(1600, 900, cw, ch, CROP);
    expect(drawn[0]).toHaveLength(4);
    expect([drawn[0][2], drawn[0][3]]).toEqual([b.width, b.height]);
    expect(drawn[1]).toHaveLength(8);   // the source rectangle and the card's: coverImage, untouched
  });
});
