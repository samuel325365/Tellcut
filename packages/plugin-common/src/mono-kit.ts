// Black and white, promoted 2026-11-05 from the Mono Frame pilot film's fx.monoframe / fx.filmstrip (after the user's own Mono Frame
// style film). This file holds the faces its blocks share:
//   common.monoframe  (monoframe.ts) a frame of diagonal bands of repeated words round the picture, black on white and white on black
//                     by turns, the words drifting along their bands; a rounded window shows the footage, and can shrink and grow
//   common.filmstrip  (filmstrip.ts) a page of two 35 mm film strips scrolling opposite ways, stills of the footage in their frames,
//                     sprocket holes and edge numbers
// The stacked title is the title template mono-cycle, the caption the template mono-box, the vortex common.wipe's mode vortex.

export const LATIN = 'Space Grotesk', CJK = 'Noto Sans TC';
// a face that fails to load draws with the fallback, as in the other blocks, rather than failing the item's ready
export const fontsReady = (text: string) => Promise.all([document.fonts.load(`700 80px "${LATIN}"`, 'AZaz09·&').catch(() => []), document.fonts.load(`700 80px "${CJK}"`, text || '字').catch(() => [])]).then(() => undefined);
