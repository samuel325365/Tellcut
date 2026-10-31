/** After a frame is drawn: force layout (text needing a font slice starts loading it), wait for the fonts, then two paints. */
export async function settle(doc: { body: HTMLElement; fonts: { ready: Promise<unknown> } }, raf: () => Promise<void>) {
  void doc.body.offsetWidth;
  await doc.fonts.ready;
  await raf(); await raf();
}

/** One frame: the stage draws, the media pool seeks or syncs its videos, then the late pass draws what reads a video's picture. */
export async function drawFrame(stage: { draw(t: number): void; late(t: number): void }, pool: { sync(): Promise<void> }, t: number) {
  stage.draw(t);
  await pool.sync();
  stage.late(t);
}

/** how many font faces have loaded (a face is one unicode-range slice of a font) */
function loadedFaces(fonts: { forEach(f: (face: { status: string }) => void): void }) {
  let n = 0;
  fonts.forEach((face) => { if (face.status === 'loaded') n++; });
  return n;
}

/** A frame for export, check and golden: drawn and settled, and drawn again when a font face arrived meanwhile. A slice of a font
 *  starts loading only when laid-out text needs it, so the first draw that shows it measures that text with the fallback font: a
 *  block that sizes a shape to its words (common.tag's day label is a canvas as wide as its words) would keep the fallback's size
 *  while the words themselves turn up in the real font, and the picture would depend on how fast the font loaded. At most 3 draws. */
export async function settledFrame(draw: () => Promise<void>, settle: () => Promise<void>, fonts: { forEach(f: (face: { status: string }) => void): void }) {
  for (let i = 0; i < 3; i++) {
    const before = loadedFaces(fonts);
    await draw(); await settle();
    if (loadedFaces(fonts) === before) return;
  }
}
