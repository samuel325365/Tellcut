// The help panel's text: how the editor works and every keyboard shortcut. Section titles, item names and key names are
// labels (English); what each says is an explanation, in the i18n dictionaries (help.* keys). help.test.tsx checks the
// shortcut list against keys.ts, so a new key cannot go undocumented.
import type { Action } from './keys.ts';
import type { Key } from './i18n/index.ts';

export interface Shortcut { label: string; ev: { key: string; code?: string; ctrlKey?: boolean; shiftKey?: boolean }; action: Action; desc: Key }

export const SHORTCUTS: Shortcut[] = [
  { label: 'Space', ev: { key: ' ', code: 'Space' }, action: 'playPause', desc: 'help.k.playPause' },
  { label: 'J', ev: { key: 'j' }, action: 'back', desc: 'help.k.back' },
  { label: 'K', ev: { key: 'k' }, action: 'pause', desc: 'help.k.pause' },
  { label: 'L', ev: { key: 'l' }, action: 'play', desc: 'help.k.play' },
  { label: '←', ev: { key: 'ArrowLeft' }, action: 'prevFrame', desc: 'help.k.prevFrame' },
  { label: '→', ev: { key: 'ArrowRight' }, action: 'nextFrame', desc: 'help.k.nextFrame' },
  { label: 'Home', ev: { key: 'Home' }, action: 'home', desc: 'help.k.home' },
  { label: 'End', ev: { key: 'End' }, action: 'end', desc: 'help.k.end' },
  { label: 'S', ev: { key: 's' }, action: 'split', desc: 'help.k.split' },
  { label: 'Delete / Backspace', ev: { key: 'Delete' }, action: 'delete', desc: 'help.k.delete' },
  { label: 'Shift+Delete', ev: { key: 'Delete', shiftKey: true }, action: 'rippleDelete', desc: 'help.k.rippleDelete' },
  { label: 'Ctrl+Z', ev: { key: 'z', ctrlKey: true }, action: 'undo', desc: 'help.k.undo' },
  { label: 'Ctrl+Shift+Z / Ctrl+Y', ev: { key: 'y', ctrlKey: true }, action: 'redo', desc: 'help.k.redo' },
  { label: 'Esc', ev: { key: 'Escape' }, action: 'exitCrop', desc: 'help.k.exitCrop' },
  { label: 'F', ev: { key: 'f' }, action: 'maxPreview', desc: 'help.k.maxPreview' },
  { label: 'Ctrl+]', ev: { key: ']', ctrlKey: true }, action: 'raise', desc: 'help.k.raise' },
  { label: 'Ctrl+[', ev: { key: '[', ctrlKey: true }, action: 'lower', desc: 'help.k.lower' },
  { label: '\\', ev: { key: '\\' }, action: 'zoomFit', desc: 'help.k.zoomFit' },
  { label: '? / F1', ev: { key: '?' }, action: 'help', desc: 'help.k.help' },
];

/** an item: its name (label) and the key of its explanation */
export interface Section { title: string; items: Array<[string, Key]> }

export const SECTIONS: Section[] = [
  { title: 'Layout', items: [
    ['Toolbar', 'help.0.0'],
    ['Landscape project', 'help.0.1'],
    ['Portrait project', 'help.0.2'],
    ['Remembered settings', 'help.0.3'],
  ] },
  { title: 'Playback', items: [
    ['Transport bar', 'help.1.0'],
    ['Loop', 'help.1.1'],
    ['Seeking', 'help.1.2'],
    ['Preview quality', 'help.1.3'],
    ['After clicking the preview', 'help.1.4'],
  ] },
  { title: 'Timeline', items: [
    ['Selecting', 'help.2.0'],
    ['Moving', 'help.2.1'],
    ['Trimming', 'help.2.2'],
    ['Slip / roll', 'help.2.3'],
    ['Speed stretch', 'help.2.4'],
    ['Snapping', 'help.2.5'],
    ['Zoom and scroll', 'help.2.6'],
    ['Tracks', 'help.2.7'],
    ['Overlapping clips', 'help.2.8'],
    ['Double-click', 'help.2.9'],
  ] },
  { title: 'Transitions and stacking', items: [
    ['Transition block', 'help.3.0'],
    ['Add a dissolve', 'help.3.1'],
    ['Linking', 'help.3.2'],
    ['Stacking order', 'help.3.3'],
  ] },
  { title: 'Audio', items: [
    ['Volume line', 'help.4.0'],
    ['Fades', 'help.4.1'],
    ['Crossfade', 'help.4.2'],
    ['Meter', 'help.4.3'],
    ['Beats', 'help.4.4'],
  ] },
  { title: 'Media and audition', items: [
    ['Media', 'help.5.0'],
    ['Adding', 'help.5.1'],
    ['Photos', 'help.5.2'],
    ['Audition', 'help.5.3'],
  ] },
  { title: 'Properties and on-preview editing', items: [
    ['Properties panel', 'help.6.0'],
    ['Selecting on the preview', 'help.6.1'],
    ['Move and scale', 'help.6.2'],
    ['Editing text', 'help.6.3'],
    ['Text effects', 'help.6.4'],
    ['Captions from speech', 'help.6.5'],
    ['Crop (Ken Burns)', 'help.6.6'],
    ['Camera keyframes', 'help.6.7'],
    ['Corners / shake / blur', 'help.6.8'],
    ['Stabilize', 'help.6.9'],
  ] },
  { title: 'Magnetic track', items: [
    ['Turn on', 'help.7.0'],
    ['Hanging on a clip', 'help.7.1'],
    ['Out of range', 'help.7.2'],
    ['Detach', 'help.7.3'],
    ['Music', 'help.7.4'],
  ] },
  { title: 'Agent proposals', items: [
    ['Preview', 'help.8.0'],
    ['Accept / reject', 'help.8.1'],
    ['Stale', 'help.8.2'],
    ['External changes', 'help.8.3'],
    ['Ask Agent', 'help.8.4'],
    ['Chat', 'help.8.5'],
  ] },
  { title: 'Saving and export', items: [
    ['Autosave', 'help.9.0'],
    ['Export', 'help.9.1'],
  ] },
];
