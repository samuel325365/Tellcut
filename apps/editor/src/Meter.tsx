import { useStoreSelector, type EditorState, type Store } from './store.ts';

/** Master output meter: -60 dBFS (empty) … 0 dBFS (full); red above -3 dB. */
export function Meter({ db }: { db: number }) {
  const f = Math.max(0, Math.min(1, (db + 60) / 60)), text = `${db <= -120 ? '-∞' : db.toFixed(1)} dB`;
  return <span class={`meter${db > -3 ? ' hot' : ''}`} data-meter data-tip={text} aria-label={text}><i style={{ width: `${Math.round(f * 100)}%` }} /></span>;
}

/** The meter with its own subscription to the level. */
export function LiveMeter({ store }: { store: Store<EditorState> }) {
  return <Meter db={useStoreSelector(store, (x) => x.level)} />;
}
