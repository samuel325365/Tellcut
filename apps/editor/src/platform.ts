// The computer the page runs on, where the UI has to say it differently: on a Mac the shortcuts are pressed with ⌘ (keys.ts and
// the timeline's gestures take ctrlKey or metaKey alike), and Ctrl+click there is a right-click, so a Ctrl+drag would open the menu.

/** whether the page runs on a Mac (Chrome's userAgentData when there is one, else navigator.platform) */
export function isMac(nav: { platform?: string; userAgentData?: { platform?: string } } | undefined = typeof navigator === 'undefined' ? undefined : navigator as any): boolean {
  return /mac/i.test(nav?.userAgentData?.platform || nav?.platform || '');
}

const MAC = isMac();

/** A text about keys as this computer's keyboard says it: "Ctrl" is ⌘ on a Mac (Ctrl+C → ⌘+C, hold Ctrl → hold ⌘). */
export function keyWords(text: string, mac = MAC): string {
  return mac ? text.replace(/\bCtrl\b/g, '⌘') : text;
}
