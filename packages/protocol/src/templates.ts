// The two kinds of named templates (spec 2026-11-05-title-templates): caption templates for common.caption and title templates for
// common.heading. Everything that handles one handles the other through this: which block takes it, where a project keeps its
// default and its own copies, its handle prefix and its folder in the user's library.
export type TemplateKind = 'caption' | 'title';

export interface TemplateKindInfo {
  /** the block whose `template` parameter names one */
  block: string;
  /** project.json meta: the film's default, and the project's own copies (id → parameters) */
  meta: 'captionTemplate' | 'titleTemplate';
  own: 'captionTemplates' | 'titleTemplates';
  /** the HANDLES id prefix (caption:<id>) and the handle prefix (CAP-xx) */
  handle: 'caption:' | 'title:';
  prefix: 'CAP' | 'TTL';
  /** the user's library folder (projects/_library/<library>/) and its API path */
  library: 'captions' | 'titles';
}

export const TEMPLATE_KINDS: Record<TemplateKind, TemplateKindInfo> = {
  caption: { block: 'common.caption', meta: 'captionTemplate', own: 'captionTemplates', handle: 'caption:', prefix: 'CAP', library: 'captions' },
  title: { block: 'common.heading', meta: 'titleTemplate', own: 'titleTemplates', handle: 'title:', prefix: 'TTL', library: 'titles' },
};

/** the kind of template a block takes, if any */
export const templateKindOf = (type: string): TemplateKind | undefined => (type === 'common.caption' ? 'caption' : type === 'common.heading' ? 'title' : undefined);
