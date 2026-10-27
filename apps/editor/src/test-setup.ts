// Tests see a Chinese browser unless they choose otherwise (setLang), so the home-type tests keep their Chinese texts.
if (typeof navigator !== 'undefined') Object.defineProperty(navigator, 'language', { value: 'zh-TW', configurable: true });
