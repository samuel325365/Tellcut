// Resolves once media, audio buffers, images and fonts are all ready (nothing renders before this).
// strict (render mode): a picture that cannot be decoded fails the render, rather than a frame drawn without it; a preview goes on.
export async function whenReady(deps: { preload: () => Promise<void>; audio: () => Promise<void>; images: () => HTMLImageElement[]; fonts: { ready: Promise<unknown> }; strict?: boolean }) {
  await Promise.all([deps.preload(), deps.audio()]);
  await Promise.all(deps.images().map((im) => im.decode().catch((e) => {
    // an <img> with no src yet (a block that sets it later) has nothing to fail
    const src = im.getAttribute('src');
    if (deps.strict && src) throw new Error(`Image could not be loaded: ${src} (${e instanceof Error ? e.message : String(e)})`);
  })));
  await deps.fonts.ready;
}
