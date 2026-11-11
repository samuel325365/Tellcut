// common.wash, the one-colour kit's (onecolor-kit.ts) multiplied colour as an item of its own after a grade: an old block now
// (OLD_BLOCKS, common.grade's deep does it), kept for older projects.
import type { ItemType } from '@tellcut/engine';
import { GRADE_STEPS, deepFill, fill, stepsOf, valueAt, type FS } from './onecolor-kit.ts';

interface WP { steps: string; tone: string }

export const wash: ItemType<WP, FS> = {
  type: 'common.wash', label: '色彩加深', category: 'look', kind: 'overlay', blend: 'multiply',
  doc: '舊積木（新片用 common.grade 的 deep）：在 steps 的 mono 那幾段把一層淺色乘上去（multiply），亮的地方也染上顏色；疊在 common.grade 之後、用同一份 steps（bw、none 那幾段不動）',
  params: [
    { key: 'steps', label: '換色（跟 common.grade 同一份）', type: 'text', default: GRADE_STEPS },
    { key: 'tone', label: '乘上的顏色', type: 'color', default: '#ffa070' },
  ],
  build: (ctx) => fill(ctx.root),
  draw(ctx, s) { s.d.style.background = deepFill(valueAt(stepsOf(s.steps, ctx.params.steps), ctx.local), ctx.params.tone); },
};
