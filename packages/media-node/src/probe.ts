// What a media file is (spec 2026-10-14 §4.2): kind, upright size, length, sound, when it was taken and where.
import { statSync } from 'node:fs';
import { extname } from 'node:path';
import { photoMeta } from './photo.ts';
import { ffprobe, uprightSize } from './ffmpeg.ts';

export type MediaKind = 'video' | 'image' | 'audio';
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg']);

export function kindOf(path: string): MediaKind | null {
  const e = extname(path).toLowerCase();
  return VIDEO_EXT.has(e) ? 'video' : IMAGE_EXT.has(e) ? 'image' : AUDIO_EXT.has(e) ? 'audio' : null;
}
export const isImagePath = (path: string) => kindOf(path) === 'image';

/** taken: wall-clock time where it was shot; takenOffset: its zone when known (to order material shot in several zones) */
export interface MediaInfo { kind: MediaKind; duration: number; width: number; height: number; audio: boolean; taken?: string; takenOffset?: string; takenGuess?: boolean; gps?: [number, number] }

const pad = (n: number) => String(n).padStart(2, '0');
/** Wall-clock time where it was shot, without a zone (EXIF photos are written that way): a UTC time ("Z", what most
 *  cameras and Android write) becomes this machine's local time; a time with its own offset (iPhone creationdate) keeps it. */
export function localIso(s: string): string {
  const t = s.trim();
  if (/Z$/i.test(t)) {
    const d = new Date(t);
    if (!Number.isNaN(+d)) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return t.replace(' ', 'T').slice(0, 19);
}
/** When a video was shot, from its container tags: the iPhone creation date (with its zone) before the generic creation_time
 *  (often when it was copied or exported); a UTC time has no zone of its own and becomes this machine's local time. */
export function takenFromTags(tags: Record<string, string>): { taken: string; takenOffset?: string } | null {
  const created = tags['com.apple.quicktime.creationdate'] ?? tags.creation_time;
  if (!created) return null;
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(created.trim());
  return { taken: localIso(created), ...(m ? { takenOffset: `${m[1]}${m[2]}:${m[3]}` } : {}) };
}
/** "+35.0116+135.7681+050.000/" (ISO 6709, how phones store where a video was shot) → [lat, lon] */
export function parseIso6709(s: string): [number, number] | undefined {
  const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}


export async function probeMedia(path: string): Promise<MediaInfo> {
  const kind = kindOf(path);
  if (!kind) throw new Error(`Not a supported media file: ${path}`);
  const guess = () => ({ taken: localIso(statSync(path).mtime.toISOString()), takenGuess: true as const });
  if (kind === 'image') {
    const m = await photoMeta(path);
    // a photo has no media time: 3600 s is the practical limit of one item (spec §5)
    return { kind, duration: 3600, width: m.width, height: m.height, audio: false, ...(m.taken ? { taken: m.taken, ...(m.offset ? { takenOffset: m.offset } : {}) } : guess()), ...(m.gps ? { gps: m.gps } : {}) };
  }
  const j = JSON.parse(await ffprobe(['-show_streams', '-show_format', '-of', 'json', path])), streams: any[] = j.streams ?? [], tags: Record<string, string> = j.format?.tags ?? {};
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = streams.some((s) => s.codec_type === 'audio');
  const duration = Number(j.format?.duration ?? v?.duration ?? 0);
  const when = takenFromTags(tags) ?? guess();
  if (kind === 'audio' || !v) return { kind: 'audio', duration, width: 0, height: 0, audio, ...when };
  const loc = tags['com.apple.quicktime.location.ISO6709'] ?? tags.location, gps = loc ? parseIso6709(loc) : undefined;
  return { kind, duration, ...uprightSize(v), audio, ...when, ...(gps ? { gps } : {}) };   // ffmpeg decodes it upright
}
