// Words for what the server says as codes (spec 2026-10-23 languages-b §9): tool lines, the moved and recovered notices, chat failures, the analysing line and
// export progress. Anything without a code (an old thread, an old server, a tool we have no verb for) shows its old text as it is.
import type { AnalysisState, ChatMessage, ChatTool, Lang } from '@tellcut/protocol';
import { errText, t, type Key } from './index.ts';

export function toolText(tool: ChatTool, lang?: Lang): string {
  return tool.verb ? t(`tool.${tool.verb}`, { arg: tool.arg ?? '' }, lang) : tool.label;
}

export function noticeText(m: ChatMessage, lang?: Lang): string {
  const n = m.notice;
  if (!n) return m.text;
  // a reply recovered from Claude Code's log: its last paragraph is the server's Chinese note, worded here instead
  if (n.kind === 'recovered') { const i = m.text.lastIndexOf('\n\n'); return `${i >= 0 ? m.text.slice(0, i + 2) : ''}${t('chat.recovered', undefined, lang)}`; }
  const item = (x: { id: string; name: string }) => t('chat.movedItem', { name: x.name, id: x.id }, lang);
  const others = n.others.length ? t('chat.movedOthers', { list: n.others.map(item).join(t('chat.movedSep', undefined, lang)) }, lang) : '';
  return t('chat.moved', { name: n.name, project: n.project, others }, lang);
}

const STEPS = new Set(['proxy', 'thumbs', 'cuts', 'peaks', 'sheets', 'burned', 'transcript', 'basic', 'extras']);

export function analysisText(a: AnalysisState, lang?: Lang): string {
  const running = a.running.map((j) => t('analysis.running', { label: j.label, mins: j.mins,
    step: STEPS.has(j.step) ? t(`analysis.step.${j.step}` as Key, undefined, lang) : j.step }, lang));
  return [...running, ...(a.queued ? [t('analysis.queued', { n: a.queued }, lang)] : [])].join(t('analysis.sep', undefined, lang));
}

/** the export job's message ('prepare', 'prepare d/n', 'frame f/n') in words; any other message as it is */
export function exportProgress(message: string, lang?: Lang): string {
  if (message === 'prepare') return t('export.prepare', undefined, lang);
  const m = /^(prepare|frame) (\d+)\/(\d+)$/.exec(message);
  if (!m) return message;
  return m[1] === 'frame' ? t('export.frame', { f: m[2], n: m[3] }, lang) : t('export.prepareN', { d: m[2], n: m[3] }, lang);
}

/** a chat failure (a done event, a failed message) from its code (err.<code>, the raw cause as {detail}) when this page knows
 *  the code; else its own words, as the server wrote them */
export function chatErrorText(f: { error?: string; code?: string; detail?: string }, lang?: Lang): string {
  return errText({ message: f.error ?? '', code: f.code, params: { detail: f.detail ?? '' } }, lang);
}
