// Tasks from the page's buttons (spec 2026-10-29-my-library §3.2, §3.4, §3.5): the message shows the user's own words, and
// the server puts what the button means for the agent ahead of them, as it does a preset's block. The thread keeps only the words.
//   library-save   "Save to My blocks" with "make it generic" ticked: the fx made generic in its project, then saved
//   preset-draft   "Save as my preset": the film's way of doing things written into preset-draft.json, for the save dialog
//   library-edit   "Change with the Agent" in the gallery: an entry of My blocks edited where it is
import { SLUG } from '@tellcut/media-node';
import type { ChatTask } from '@tellcut/protocol';

const str = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
const q = (s: string) => JSON.stringify(s);   // a quoted shell argument (double quotes inside escaped)

export const DRAFT_FORMAT = `{
  "name": "a short name for the preset, in the UI language",
  "summary": "one sentence: what films it makes, in the UI language",
  "points": [ { "text": "one point, in the UI language", "prompt": "the same point for an agent, in English" } ],
  "ratio": "9:16",
  "length": [25, 35],
  "theme": { "…": "the project's meta.theme as it is, or leave this out" },
  "score": "the id of the music style the film uses, or leave this out",
  "fx": ["fx/…js: the project's own effect modules the film uses"]
}`;

/** the task as the agent reads it, or null when it is not one (a missing field, a slug that is not one) */
export function taskBlock(task: unknown, project: string | null): string | null {
  const t = task as Partial<ChatTask> & Record<string, unknown> | undefined;
  const wrap = (kind: string, lines: string[]) => [`<task kind="${kind}">`, ...lines, '</task>'].join('\n');
  if (t?.kind === 'library-save' && project && str(t.type) && /^fx\.[\w.-]+$/.test(t.type) && str(t.name)) {
    const cat = str(t.category) ? ` --category ${t.category}` : '';
    return wrap('library-save', [
      `The user pressed "Save to My blocks" on ${t.type} and asked for it to be made generic first. In project ${project}:`,
      `1. Find the fx module that defines ${t.type} (Glob projects/${project}/fx/*). Make what is hard-wired for this one film into params: its text, colours, timings and sizes, each with a label and a Chinese hint, the film's current values as the defaults (so the film looks the same). Give every block a doc line.`,
      `2. Run npm run check -- ${project} until it shows no error caused by the module.`,
      `3. Save it: npm run tellcut -- library save ${project} <file> --type ${t.type} --name ${q(t.name)} --desc ${q(String(t.desc ?? ''))}${cat} --replace`,
      '4. Tell the user in one or two sentences which settings they can now change (in the Properties panel), in the UI language. Do not mention files, commands or code.',
    ]);
  }
  if (t?.kind === 'preset-draft' && project) {
    return wrap('preset-draft', [
      `The user pressed "Save as my preset" in project ${project}: they want to start later films the way this one was made. Write projects/${project}/preset-draft.json and nothing else (no other file changes, no commands needed beyond reading).`,
      'Read the conversation so far, the project (npm run tellcut -- show), its cut.ts and storyboard.md, and the preset it was made with if the project line names one.',
      '- The preset stands on its own: the rules of the original preset and form options that this film really followed go into the points too.',
      '- Write habits and requirements, not this film\'s content: no place names, people\'s names, dates or lines that belong only to this film.',
      '- One sentence per point, 4 to 10 points; what the user asked for in the conversation counts most. "text" is in the UI language, "prompt" says the same in English.',
      'The format:', DRAFT_FORMAT,
      'Then tell the user in one sentence that the draft is ready to check; the editor opens it by itself.',
    ]);
  }
  if (t?.kind === 'library-edit' && str(t.slug) && SLUG.test(t.slug) && str(t.type) && str(t.request)) {
    return wrap('library-edit', [
      `The user wants to change ${t.type} of My blocks (entry ${t.slug}) from the gallery. Their words: ${q(t.request)}`,
      `Edit the module in projects/_library/blocks/${t.slug}/fx/ (Glob it first), keeping its type ids. Then run npm run tellcut -- library refresh ${t.slug} and fix what it reports until it passes.`,
      'Tell the user in one or two sentences what changed, in the UI language. Projects that already use it keep their copy until they press Update.',
    ]);
  }
  return null;
}
