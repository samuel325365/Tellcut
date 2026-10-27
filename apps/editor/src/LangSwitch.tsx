// 中 / EN / 日 on the home page and in the gallery (next to ThemeToggle); the editor has none and follows the setting.
import type { Lang } from '@tellcut/protocol';
import { setLang, useLang } from './i18n/lang.ts';
import { t } from './i18n/index.ts';

const OPTIONS: { lang: Lang; text: string }[] = [
  { lang: 'zh', text: '中' },
  { lang: 'en', text: 'EN' },
  { lang: 'ja', text: '日' },
];

export function LangSwitch() {
  const cur = useLang();
  return (
    <span class="lang-switch" role="group">
      {OPTIONS.map((o) => {
        const tip = t(`lang.${o.lang}`, undefined, cur);
        return (
          <button key={o.lang} class="icon-btn lang-btn" data-lang={o.lang} data-tip={tip} aria-label={tip}
            aria-pressed={o.lang === cur ? 'true' : 'false'} onClick={() => setLang(o.lang)}>
            {o.text}
          </button>
        );
      })}
    </span>
  );
}
