// Recipe `travel`: a narrated travel short (Seattle, Kyoto). Narration scene by scene, each scene's shots share its length, captions
// follow the voice, a place tag per scene, a title at the start, an end card, generated music that dips under the voice.
import { z } from 'zod';
import type { Cut } from '../cut.ts';
import { ThemeSchema, type Recipe } from './types.ts';

const Shot = z.object({ src: z.string(), from: z.number().min(0).optional(), weight: z.number().positive().optional(), focus: z.number().min(0).max(1).optional() });
const Content = z.object({
  title: z.string().optional(), subtitle: z.string().optional(),
  scenes: z.array(z.object({ voice: z.string(), shots: z.array(Shot).min(1), place: z.string().optional() })).min(1),
  end: z.array(z.string()).optional(),
  music: z.union([z.string(), z.object({ style: z.string(), bpm: z.number().optional(), key: z.string().optional(), seed: z.number().optional(), gain: z.number().optional() })]).default('pluck'),
  seed: z.number().optional(),
  theme: ThemeSchema.optional(),
  /** caption block params (common.caption), e.g. { style: 'outline' } */
  captions: z.record(z.unknown()).default({ style: 'outline' }),
  /** dB of the footage's own sound under the narration; false for none */
  ambience: z.union([z.number(), z.literal(false)]).default(-20),
  /** seconds of picture before the first word, between scenes and after the last */
  lead: z.number().min(0).default(0.5), gap: z.number().min(0).default(0.5), dissolve: z.number().min(0).default(0.4),
});
export type TravelContent = z.input<typeof Content>;

export const travel: Recipe<typeof Content> = {
  id: 'travel', label: '旁白旅行', doc: '一場一場的旁白配鏡頭：字幕跟著旁白、每場一個地點標籤、片名與片尾、配樂在旁白時壓低；旅行、城市散步、回憶',
  schema: Content,
  example: {
    title: '京都・春', subtitle: '2025.04',
    scenes: [
      { voice: 's01', shots: [{ src: 'video1', from: 3 }, { src: 'video2', from: 40, weight: 1.5 }], place: '城南宮' },
      { voice: 's02', shots: [{ src: 'video10', from: 12, focus: 0.4 }] },
    ],
    end: ['京都・春', '謝謝收看'], music: { style: 'pluck', gain: -4 }, captions: { style: 'outline' },
  },
  notes: [
    '每場的長度由旁白決定（旁白長度＋場與場之間 gap 秒），場內的鏡頭依 weight 分配這段時間；最後一場會多留 1.5 秒。',
    '鏡頭不會跨到素材的下一個場景：要的長度超出 from 所在的場景時，會把 from 往前挪；整個場景都不夠長時照用並在結果裡警告（換一段素材或多加一個鏡頭）。',
    '片頭（title）約 2.4 秒、片尾卡（end）3.5 秒，都算在片長裡。',
    'music 可以是風格名稱，或 { style, bpm, key, seed, gain }；新寫的風格放 projects/<id>/score/。',
  ],
  run(c: Cut, x) {
    if (x.theme) c.theme(x.theme);
    const titleLen = x.title ? 2.4 : 0;
    if (x.title) c.title(x.title, { at: 0.2, len: titleLen - 0.2, sub: x.subtitle ?? '' });
    let t = 0;
    const placed = [], warnings: string[] = [];
    // a shot stays inside the scene of the source its start is in (so a cut never shows the next scene for a moment)
    const inScene = (src: string, from0: number, len: number) => {
      // first the source itself: a shot that would run past the file's end starts earlier (a short phone clip is common)
      const dur = c.p.sources[src]?.duration ?? Infinity, isPhoto = c.p.sources[src]?.kind === 'image';
      if (!isPhoto && dur < len) warnings.push(`${src} 只有 ${dur.toFixed(1)} 秒，這個鏡頭要 ${len.toFixed(1)} 秒：畫面會比旁白早結束（換一段素材或多加一個鏡頭）`);
      const from = isPhoto ? from0 : Math.max(0, Math.min(from0, dur - len));
      const seg = c.inv.sources.find((s) => s.id === src)?.segments.find(([a, b]) => from >= a - 1e-6 && from < b);
      if (!seg || from + len <= seg[1] + 1e-6) return from;
      if (seg[1] - seg[0] >= len) return Math.max(seg[0], seg[1] - len);
      warnings.push(`${src} 從 ${from.toFixed(1)} 秒要 ${len.toFixed(1)} 秒，但那個場景只有 ${(seg[1] - seg[0]).toFixed(1)} 秒：會跨到下一個場景`);
      return from;
    };
    for (const [si, scene] of x.scenes.entries()) {
      const voiceAt = si === 0 ? Math.max(titleLen, x.lead) : t + x.gap;
      const v = c.voice(scene.voice, { at: voiceAt });
      placed.push(v);
      const sceneEnd = si === x.scenes.length - 1 ? v.end + x.lead + 1.5 : v.end;   // the last scene lingers a moment
      const total = sceneEnd - t, weights = scene.shots.map((s) => s.weight ?? 1), sum = weights.reduce((a, b) => a + b, 0);
      c.at(t);
      for (const [k, shot] of scene.shots.entries()) {
        const first = si === 0 && k === 0, len = (total * weights[k]) / sum + (first ? 0 : x.dissolve);
        c.clip(shot.src, {
          from: inScene(shot.src, shot.from ?? 0, len), len, avoidBurned: true, sound: x.ambience !== false, gain: x.ambience === false ? 0 : x.ambience,
          ...(first ? {} : { transition: { type: 'dissolve', dur: x.dissolve } }),
          ...(shot.focus !== undefined ? { crop: { from: { x: shot.focus, y: 0.5, zoom: 1 }, to: { x: shot.focus, y: 0.5, zoom: 1.06 } } } : {}),
        });
      }
      if (scene.place) c.effect('common.header', { at: t + 0.3, len: Math.min(3.5, total - 0.4), no: '📍', text: scene.place });
      c.voiceCaptions(v, x.captions);
      // the next scene starts after this one's narration, even when the pictures came out shorter (they were warned about above)
      t = Math.max(c.time, sceneEnd);
    }
    if (x.end?.length) c.endCard(x.end, { len: 3.5 });
    const m = typeof x.music === 'string' ? { style: x.music } : x.music;
    c.score(m.style, { bpm: m.bpm, key: m.key, seed: m.seed ?? x.seed, gain: m.gain });
    return { scenes: placed.length, voiceEnds: placed.map((v) => v.end), warnings };
  },
};
