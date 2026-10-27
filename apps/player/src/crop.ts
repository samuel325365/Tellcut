// Crop mode (spec §4.3): the full source frame with a viewfinder of the frame's aspect; drag to move, wheel to zoom.
import { moveViewfinder, visibleRegion, type Crop, type CropWhich } from '@tellcut/engine';

export interface CropShow {
  itemId: string; which: CropWhich; url: string; time: number;
  /** a photo source: the url is an image */
  image?: boolean;
  srcW: number; srcH: number; frameW: number; frameH: number; crop: Crop; view: { w: number; h: number };
}
export type CropChange = { type: 'cropChange'; itemId: string; which: CropWhich; crop: Crop; final: boolean };

export class CropView {
  visible = false;
  private el: HTMLElement;
  private video: HTMLVideoElement;
  private photo: HTMLImageElement;
  private box: HTMLElement;
  private cur: CropShow | null = null;
  private img = { left: 0, top: 0, w: 0, h: 0 };
  private wheelTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(host: HTMLElement, private post: (m: CropChange) => void) {
    this.el = document.createElement('div');
    this.el.className = 'crop-view';
    this.el.style.cssText = 'position:absolute;inset:0;display:none;background:#000;overflow:hidden';
    this.video = document.createElement('video');
    this.video.muted = true; this.video.preload = 'auto';
    this.video.style.cssText = 'position:absolute';
    this.photo = document.createElement('img');
    this.photo.style.cssText = 'position:absolute;display:none';
    this.photo.draggable = false;
    this.box = document.createElement('div');
    this.box.dataset.cropBox = '';
    this.box.style.cssText = 'position:absolute;border:2px solid #ffd60a;box-sizing:border-box;box-shadow:0 0 0 9999px rgba(0,0,0,.55);cursor:move';
    this.el.append(this.video, this.photo, this.box);
    host.appendChild(this.el);
    this.box.addEventListener('mousedown', (e) => this.drag(e));
    this.box.addEventListener('wheel', (e) => this.zoom(e), { passive: false });
  }

  show(o: CropShow) {
    this.cur = o;
    this.visible = true;
    this.el.style.display = 'block';
    // a photo shows as an image; a clip as its video at the chosen frame
    this.photo.style.display = o.image ? '' : 'none';
    this.video.style.display = o.image ? 'none' : '';
    if (o.image) { if (this.photo.getAttribute('src') !== o.url) this.photo.src = o.url; }
    else {
      if (this.video.getAttribute('src') !== o.url) this.video.src = o.url;
      if (Math.abs(this.video.currentTime - o.time) > 0.01) try { this.video.currentTime = o.time; } catch { /* not loaded yet */ }
    }
    // the whole source, contained in the view
    const s = Math.min(o.view.w / o.srcW, o.view.h / o.srcH);
    this.img = { w: o.srcW * s, h: o.srcH * s, left: (o.view.w - o.srcW * s) / 2, top: (o.view.h - o.srcH * s) / 2 };
    const box = { left: `${this.img.left}px`, top: `${this.img.top}px`, width: `${this.img.w}px`, height: `${this.img.h}px` };
    Object.assign(this.video.style, box); Object.assign(this.photo.style, box);
    this.place(o.crop);
  }

  hide() { clearTimeout(this.wheelTimer); this.visible = false; this.cur = null; this.el.style.display = 'none'; }

  private place(crop: Crop) {
    const o = this.cur!, r = visibleRegion(o.srcW, o.srcH, o.frameW, o.frameH, crop), i = this.img;
    const px = (v: number) => `${Math.round(v * 100) / 100}px`;
    Object.assign(this.box.style, { left: px(i.left + r.x0 * i.w), top: px(i.top + r.y0 * i.h), width: px(r.w * i.w), height: px(r.h * i.h) });
  }

  private send(crop: Crop, final: boolean) {
    const o = this.cur!;
    o.crop = crop;
    this.place(crop);
    this.post({ type: 'cropChange', itemId: o.itemId, which: o.which, crop, final });
  }

  private drag(e: MouseEvent) {
    if (!this.cur) return;
    e.preventDefault();
    const start = this.cur.crop, x0 = e.clientX, y0 = e.clientY;
    let last = start;
    const move = (m: MouseEvent) => { if (!this.cur) return; const o = this.cur; last = moveViewfinder(o.srcW, o.srcH, o.frameW, o.frameH, start, (m.clientX - x0) / this.img.w, (m.clientY - y0) / this.img.h); this.send(last, false); };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); if (this.cur) this.send(last, true); };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  }

  private zoom(e: WheelEvent) {
    if (!this.cur) return;
    e.preventDefault();
    const c = this.cur.crop, z = Math.min(8, Math.max(1, Math.round(c.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1) * 1e6) / 1e6));
    this.send({ ...c, zoom: z }, false);
    // one undo step per burst of wheel notches
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => { if (this.cur) this.send(this.cur.crop, true); }, 300);
  }
}

/** Clip-local time crop mode shows: the first frame for 'from', the last for 'to', a keyframe's own time (a frozen clip holds its freeze frame). */
export function cropFrameLocal(it: { freezeAt?: number | null; crop?: { keys?: Array<{ t: number }> } }, len: number, which: CropWhich, fps: number): number {
  const t = typeof which === 'number' ? (it.crop?.keys?.[which]?.t ?? 0) : which === 'from' ? 0 : Math.max(0, len - 1 / fps);
  const inClip = Math.min(t, Math.max(0, len - 1 / fps));   // a keyframe trimmed off the clip shows its last frame
  return it.freezeAt != null ? Math.min(inClip, it.freezeAt) : inClip;
}
