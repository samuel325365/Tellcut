// Material picked in the import browser rides along with a chat message as full paths (the page never uploads files).
import { t } from './i18n/index.ts';

export interface Attachment { path: string; name: string; kind: 'dir' | 'video' | 'image' | 'audio' }

/** the words go in the UI language at send time; the paths follow, one per line */
export function withAttachments(text: string, atts: Attachment[]): string {
  const words = text.trim();
  if (!atts.length) return words;
  return `${words || t('attach.defaultText')}\n\n${t('attach.header')}\n${atts.map((a) => `- ${a.path}`).join('\n')}`;
}
