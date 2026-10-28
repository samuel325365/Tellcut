// Small line icons (24×24, currentColor) for the home page and the chat.
const I = (d: string | string[], extra: Record<string, unknown> = {}) => (props: { size?: number }) => (
  <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {...extra}>
    {(Array.isArray(d) ? d : [d]).map((x) => <path d={x} />)}
  </svg>
);
export const IconPlus = I('M12 5v14M5 12h14');
export const IconArrowUp = I(['M12 19V5', 'M5 12l7-7 7 7']);
export const IconStop = (p: { size?: number }) => <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" /></svg>;
export const IconFolder = I('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z');
export const IconFilm = I(['M4 5h16v14H4z', 'M8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4']);
export const IconImage = I(['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', 'M15 9.5a1.5 1.5 0 1 0 0-.01']);
export const IconMusic = I(['M9 18V6l11-2v12', 'M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3z', 'M20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z']);
export const IconFile = I(['M6 3h8l4 4v14H6z', 'M14 3v4h4']);
export const IconUp = I(['M12 19V5', 'M6 11l6-6 6 6']);
export const IconX = I('M6 6l12 12M18 6L6 18');
export const IconTrash = I(['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13']);
export const IconChevron = I('M9 6l6 6-6 6');
export const IconDrive = I(['M3 14h18v5H3z', 'M5 14l3-9h8l3 9', 'M17 17h.01']);
export const IconSpark = I(['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z']);
export const IconSun = I(['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4']);
export const IconMoon = I('M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z');
export const IconPlay = (p: { size?: number }) => <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>;
export const IconHome = I(['M4 11l8-7 8 7', 'M6 10v10h12V10']);
export const IconCheck = I('M5 12.5l4.5 4.5L19 7.5');
export const IconPlug = I(['M9 2v6M15 2v6', 'M6 8h12v4a6 6 0 0 1-12 0z', 'M12 18v4']);

export const kindIcon = (kind: string) => kind === 'dir' ? IconFolder : kind === 'video' ? IconFilm : kind === 'image' ? IconImage : kind === 'audio' ? IconMusic : kind === 'drive' ? IconDrive : IconFile;

// Timeline clip glyphs (timeline/names.ts Glyph), drawn small before the clip's name.
const GLYPHS: Record<string, string[]> = {
  words: ['M5 6h14', 'M12 6v13'],
  layout: ['M4 5h16v14H4z', 'M4 10h16'],
  place: ['M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z', 'M12 11h.01'],
  look: ['M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z', 'M12 4v16'],
  moment: ['M12 3v5', 'M12 16v5', 'M3 12h5', 'M16 12h5'],
  fx: ['M12 3l2.5 6H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5z'],
  scene: ['M4 5h16v14H4z', 'M4 15l4-4 4 4 4-6 4 6'],
  video: ['M4 5h16v14H4z', 'M8 5v14M16 5v14'],
  music: ['M9 18V6l11-2v12', 'M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3z', 'M20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z'],
  audio: ['M3 12h2', 'M7 8v8', 'M11 5v14', 'M15 8v8', 'M19 11v2'],
  sfx: ['M13 3L5 14h6l-1 7 8-11h-6z'],
};
export const GlyphIcon = ({ glyph, size = 12 }: { glyph: string; size?: number }) => (
  <svg class="glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {(GLYPHS[glyph] ?? GLYPHS.fx).map((d) => <path d={d} />)}
  </svg>
);

// the timeline tray's tools
export const IconScissors = I(['M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M20 4L8.1 15.9', 'M14.5 14.5L20 20', 'M8.1 8.1L12 12']);
export const IconCutLeft = I(['M14 4v16', 'M4 8h6v8H4', 'M18 8l-4 4 4 4']);
export const IconCutRight = I(['M10 4v16', 'M20 8h-6v8h6', 'M6 8l4 4-4 4']);
export const IconRipple = I(['M4 7h16', 'M6 7l1 13h10l1-13', 'M3 13h5', 'M16 13h5']);
export const IconCopy = I(['M9 9h11v11H9z', 'M5 15H4V4h11v1']);
export const IconMinus = I('M5 12h14');

// track header switches
export const IconEye = I(['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z']);
export const IconEyeOff = I(['M3 3l18 18', 'M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1', 'M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6']);
export const IconSpeaker = I(['M4 9h4l5-4v14l-5-4H4z', 'M17 9a4 4 0 0 1 0 6']);
export const IconSpeakerOff = I(['M4 9h4l5-4v14l-5-4H4z', 'M17 9l5 6', 'M22 9l-5 6']);
export const IconMagnet = I(['M6 3v8a6 6 0 0 0 12 0V3', 'M6 7h4', 'M14 7h4']);
export const IconLock = I(['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3']);
export const IconUnlock = I(['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 7.5-2']);
