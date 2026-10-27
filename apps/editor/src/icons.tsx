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
