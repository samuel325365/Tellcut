// The agent's pending proposal (spec 2026-10-15-proposals-magnetic §3.3) and the outside-change notice (§5): floating bars
// over the editor, so the grid layout stays as it is.
import { useState } from 'preact/hooks';
import type { EditorState } from './store.ts';
import { t } from './i18n/index.ts';
import { lineText } from './proposal-text.ts';

export function ProposalBar({ s, editor }: { s: EditorState; editor: any }) {
  const [open, setOpen] = useState(false);
  const p = s.proposal;
  return (
    <div class="live-bars">
      {p && (
        <div class="proposal-bar" data-proposal>
          <strong>Agent proposes: {p.label}</strong>
          <button class="link" onClick={() => setOpen(!open)}>Changes: {p.changed.length}{open ? ' ▴' : ' ▾'}</button>
          <button class="primary" data-accept onClick={() => void editor.acceptProposal()}>Accept</button>
          <button data-reject onClick={() => void editor.rejectProposal()}>Reject</button>
          {open && (
            <ul>
              {(p.lines ? p.lines.map(lineText) : p.summary).map((x: string) => <li>{x}</li>)}
              {p.warnings.map((x: string) => <li class="warn">⚠ {x}</li>)}
            </ul>
          )}
        </div>
      )}
      {s.diskChanged && (
        <div class="disk-bar" data-disk-changed>
          {t('ed.diskChanged')}
          <button onClick={() => void editor.reload()}>Reload</button>
          <button onClick={() => editor.ignoreDisk?.()}>Ignore</button>
        </div>
      )}
    </div>
  );
}
