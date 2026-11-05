// Title templates: the heading's own list, kept apart from the caption templates both ways.
import { TEMPLATES, templateOf, withTemplate } from '../caption/templates.ts';
import { HEADING_LOOKS, heading } from './index.ts';
import { TITLE_TEMPLATES, titleTemplateOf } from './templates.ts';

test('every title template names a title look, a layout and a backing the heading has', () => {
  const opts = (k: string) => (heading.params.find((d) => d.key === k) as { options: string[] }).options;
  for (const t of TITLE_TEMPLATES) {
    if (t.params.style) expect(HEADING_LOOKS, t.id).toContain(t.params.style);
    for (const k of ['layout', 'backing', 'animIn', 'animOut']) if (t.params[k]) expect(opts(k), `${t.id} ${k}`).toContain(t.params[k]);
  }
  expect(new Set(TITLE_TEMPLATES.map((t) => t.id)).size).toBe(TITLE_TEMPLATES.length);
});

test('title and caption templates never cross: each list finds only its own ids', () => {
  const p = { style: 'heavy', size: 9 };
  expect(withTemplate(p, {}, 'neon-fill', undefined, titleTemplateOf)).toEqual(p);   // a caption template's id, looked for as a title's
  expect(withTemplate(p, {}, 'doc-rules')).toEqual(p);                                // a title template's id, looked for as a caption's
  expect(withTemplate(p, {}, 'doc-rules', undefined, titleTemplateOf)).toMatchObject({ style: 'soft', backing: 'rules' });
  for (const t of TITLE_TEMPLATES) expect(templateOf(t.id), t.id).toBeUndefined();
  for (const t of TEMPLATES) expect(titleTemplateOf(t.id), t.id).toBeUndefined();
});

test('an item\'s own parameters win over its title template; the project\'s own copies come first', () => {
  expect(withTemplate({ style: 'heavy' }, { template: 'doc-rules', style: 'gold' }, undefined, undefined, titleTemplateOf)).toMatchObject({ style: 'heavy', backing: 'rules' });
  expect(withTemplate({ style: 'heavy' }, {}, 'my-x', { 'my-x': { style: 'chrome' } }, titleTemplateOf)).toMatchObject({ style: 'chrome' });
});
