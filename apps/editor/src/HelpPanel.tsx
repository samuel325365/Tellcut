// Help: how the editor works and every keyboard shortcut (help.ts). Esc, ? or F1, ×, or a click outside closes it.
// Headings and item names are labels (English); what they say is in the chosen language.
import { SECTIONS, SHORTCUTS } from './help.ts';
import { t } from './i18n/index.ts';
import { tip } from './tip.ts';

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div class="help-backdrop" data-help-panel onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="help" role="dialog" aria-label={t('ed.helpDialog')}>
        <header><strong>Help</strong><button data-help-close {...tip(t('ed.helpCloseTip'))} onClick={onClose}>×</button></header>
        <div class="help-body">
          {SECTIONS.map((s) => (
            <section>
              <h3>{s.title}</h3>
              <dl>{s.items.map(([k, v]) => <><dt>{k}</dt><dd>{t(v)}</dd></>)}</dl>
            </section>
          ))}
          <section>
            <h3>Shortcuts</h3>
            <table class="keys">{SHORTCUTS.map((k) => <tr data-shortcut><td><kbd>{k.label}</kbd></td><td>{t(k.desc)}</td></tr>)}</table>
          </section>
        </div>
      </div>
    </div>
  );
}
