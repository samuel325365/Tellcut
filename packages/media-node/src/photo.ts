// Photos (spec 2026-10-14 §4.2, §5): upright size, EXIF time and GPS, HEIC to JPG, upright downscaled copies.
import { pyJson } from './py.ts';

/** taken: local wall-clock time; offset: its zone from EXIF ("-07:00") when the camera wrote one */
export interface PhotoMeta { width: number; height: number; taken: string | null; offset: string | null; gps: [number, number] | null }

export const photoMeta = (path: string) => pyJson<PhotoMeta>('meta.py', ['photo', path]);
export const heicToJpg = (src: string, out: string) => pyJson<PhotoMeta>('meta.py', ['heic2jpg', src, out]);
export const fitImage = (src: string, out: string, maxW: number, maxH: number, signal?: AbortSignal) =>
  pyJson<{ width: number; height: number }>('meta.py', ['fit', src, out, String(Math.round(maxW)), String(Math.round(maxH))], { signal });
