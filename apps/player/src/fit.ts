/** Scales the stage to fit its viewport (the stage keeps its native pixel size). */
export function fitStage(stage: HTMLElement, viewport: HTMLElement) {
  if (!stage.offsetWidth) return;
  const s = Math.min(viewport.clientWidth / stage.offsetWidth, viewport.clientHeight / stage.offsetHeight);
  stage.style.transform = `scale(${s})`;
}
