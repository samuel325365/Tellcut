// The two kinds of named templates (spec 2026-11-05-title-templates): caption templates for common.caption and title templates for
// common.heading. Everything that handles one handles the other through this: which block takes it, where a project keeps its
// default and its own copies, and its folder in the user's library.
export type TemplateKind = 'caption' | 'title';

export interface TemplateKindInfo {
  /** the block whose `template` parameter names one */
  block: string;
  /** project.json meta: the film's default, and the project's own copies (id → parameters) */
  meta: 'captionTemplate' | 'titleTemplate';
  own: 'captionTemplates' | 'titleTemplates';
  /** the user's library folder (projects/_library/<library>/) and its API path */
  library: 'captions' | 'titles';
}

export const TEMPLATE_KINDS: Record<TemplateKind, TemplateKindInfo> = {
  caption: { block: 'common.caption', meta: 'captionTemplate', own: 'captionTemplates', library: 'captions' },
  title: { block: 'common.heading', meta: 'titleTemplate', own: 'titleTemplates', library: 'titles' },
};
