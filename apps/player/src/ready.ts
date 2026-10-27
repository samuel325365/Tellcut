// Resolves once media, audio buffers, images and fonts are all ready (nothing renders before this).
export async function whenReady(deps: { preload: () => Promise<void>; audio: () => Promise<void>; images: () => HTMLImageElement[]; fonts: { ready: Promise<unknown> } }) {
  await Promise.all([deps.preload(), deps.audio()]);
  await Promise.all(deps.images().map((im) => im.decode().catch(() => {})));
  await deps.fonts.ready;
}
