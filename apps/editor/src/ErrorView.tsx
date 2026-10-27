import type { EditorState } from './store.ts';

/** spec §8: a project that fails validation is never overwritten; show the issues and offer earlier versions. */
export function ErrorView({ error, history, onRestore, failed }: { error: NonNullable<EditorState['error']>; history: string[]; onRestore: (name: string) => void; /** why the last restore failed */ failed?: string }) {
  return (
    <div class="error-view">
      <h2>Can't open the project</h2>
      <p>{error.message}</p>
      {error.issues.length > 0 && <ul class="issues">{error.issues.map((i) => <li>{i}</li>)}</ul>}
      {history.length > 0 && (
        <div class="history">
          <h3>Restore from history</h3>
          {failed && <p class="restore-error" data-restore-error role="alert">{failed}</p>}
          <ul>{history.map((h) => <li><button data-restore={h} onClick={() => onRestore(h)}>{h.replace(/_\d+\.json$/, '')}</button></li>)}</ul>
        </div>
      )}
    </div>
  );
}
