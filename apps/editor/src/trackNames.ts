/** Old Chinese default track names → English. Display only: project.json keeps what it has. */
const OLD_DEFAULTS: Record<string, string> = {
  主軌: 'Main', 文字: 'Text', 音樂: 'Music', 原音: 'Source', 'Original audio': 'Source', 背景效果: 'Background FX', 最上層: 'Top',
  音效: 'SFX', 模糊底: 'Blurred fill', 背景: 'Background', 面板外框: 'Panel frame', 旁白: 'Narration', 字幕: 'Captions',
};

/** the name a track shows: an old Chinese default name in English, any other name as it is */
export function trackLabel(name: string): string {
  if (Object.hasOwn(OLD_DEFAULTS, name)) return OLD_DEFAULTS[name];
  const layer = /^第 (\d+) 條$/.exec(name);
  return layer ? `Layer ${layer[1]}` : name;
}
