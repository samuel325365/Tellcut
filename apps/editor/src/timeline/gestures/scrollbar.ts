// The bar under the tracks: a scrollbar over the whole project — drag the thumb, or click beside it for a page.
import type { Editor } from '../../editor.ts';
import { follow } from './follow.ts';

export function startScrollbarDrag(e: MouseEvent, editor: Editor, o: { thumb: { left: number; width: number }; width: number; span: number; scroll: number; pps: number }) {
  if (e.button !== 0) return;
  e.preventDefault();
  const onThumb = (e.target as HTMLElement).hasAttribute('data-hthumb'), page = o.width / o.pps;
  if (!onThumb) {
    const x = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left;
    editor.setView({ scroll: o.scroll + (x < o.thumb.left ? -page : page) });
    return;
  }
  const move = (m: MouseEvent) => editor.setView({ scroll: o.scroll + ((m.clientX - e.clientX) * o.span) / o.width });
  follow(move, () => {});
}
