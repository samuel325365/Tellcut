// The common sound effects (toolkit phase 2b): each is a pure function from a sample rate and its params to samples — the same
// samples every time — played through the bus. beep pairs with common.censor. One file per gallery category (alert, move, hit,
// chime, paper, life: each sound's render function and its entry), their building blocks in synth.ts; commonSfx keeps the order
// the sounds were added in.
import type { SfxType } from '@tellcut/engine';
import { beepSfx, tickSfx, errorSfx, deflateSfx, alarmSfx, dingdongSfx, ringbellSfx, buzzSfx, hushSfx } from './alert.ts';
import { whooshSfx, airSfx, riserSfx, scratchSfx, powerupSfx, ffwdSfx, rattleSfx, footstepSfx, flapSfx, whirrSfx, sendSfx, rewindSfx } from './move.ts';
import { impactSfx, popSfx, thudSfx, explodeSfx, knockSfx, boingSfx } from './hit.ts';
import { shingSfx, dingSfx, cashSfx, xyloSfx, chimeSfx, coinSfx, fanfareSfx, recvSfx } from './chime.ts';
import { shutterSfx, typingSfx, pageSfx, slideSfx, flipSfx, printSfx, clunkSfx, tearSfx, scribbleSfx, tapeSfx } from './paper.ts';
import { clinkSfx, dripSfx, sizzleSfx, pourSfx, crySfx, thunderSfx } from './life.ts';

export { renderBeep, renderTick, renderError, renderDeflate, renderAlarm, renderDingDong, renderCamBeep, renderBuzz, renderHush, renderRingBell } from './alert.ts';
export { renderAir, renderWhoosh, renderRiser, renderScratch, renderPowerUp, renderFastForward, renderRattle, renderFootstep, renderFlap, renderWhirr, renderSend, renderRewind } from './move.ts';
export { renderImpact, renderPop, renderThud, renderExplode, renderBoing, renderKnock } from './hit.ts';
export { renderShing, renderDing, renderCash, renderXylo, renderChime, renderCoin, renderFanfare, renderRecv } from './chime.ts';
export { renderShutter, renderTyping, renderPage, renderSlide, renderFlip, renderPrint, renderClunk, renderTear, renderScribble, renderTape } from './paper.ts';
export { renderClink, renderDrip, renderCry, renderSizzle, renderPour, renderThunder } from './life.ts';
export { scaleStep, type ScaleName } from './synth.ts';

export const commonSfx: SfxType[] = [
  beepSfx, whooshSfx, impactSfx, shingSfx, airSfx, riserSfx, popSfx, thudSfx,
  tickSfx, dingSfx, errorSfx, shutterSfx, typingSfx, cashSfx, deflateSfx, scratchSfx,
  powerupSfx, alarmSfx, explodeSfx, ffwdSfx, pageSfx, slideSfx, flipSfx, xyloSfx,
  printSfx, clunkSfx, tearSfx, rattleSfx, dingdongSfx, ringbellSfx,
  // ---- the sound pack (2026-10-21)
  chimeSfx, coinSfx, fanfareSfx, knockSfx, boingSfx, footstepSfx, flapSfx, whirrSfx,
  scribbleSfx, tapeSfx, clinkSfx, dripSfx, sizzleSfx, pourSfx, crySfx, thunderSfx,
  // ---- the phone and the camcorder (2026-10-23)
  buzzSfx, sendSfx, recvSfx, hushSfx, rewindSfx,
];
