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
