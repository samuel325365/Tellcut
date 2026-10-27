// Steelpan bossa (from the fd-ice short's summer-pan): a cool-summer light bossa. Steel pan on top, marimba arpeggios, soft Rhodes
// comping city-pop seventh chords (I–vi–ii–V / IV–iii–ii–V), a root–fifth bossa bass, a rim-click clave and a shaker. Made for a film
// that talks almost all the way through: most bars stay thin (bass, rim, shaker, one Rhodes chord a bar) and the pan only answers
// where a section starts; the band opens up (Rhodes comp, kick, marimba, the pan melody) for a short interlude about a third of the
// way in (and another near two thirds in a long film) and for the last stretch, which it enters after a held breath with a pan run.
// The original's fixed seconds (OPEN / SEAMS / DIP) are gone: panPlan() places them by the bar count.

/** where things go, in bars: open[b] (the band opens up), seams (bars whose downbeat the pan answers), climax (first bar of the last open stretch) */
export function panPlan(bars, role = () => 'loop') {
  const last = bars - 1, final = bars >= 8 ? Math.max(2, Math.round(bars * 0.12)) : 1, climax = Math.max(1, last - final);
  const open = Array.from({ length: bars }, (_, b) => b >= climax && b < last);
  const interlude = (at, len) => { const s = Math.round(bars * at); if (s >= 2 && s + len < climax - 1) for (let b = s; b < s + len; b++) open[b] = true; };
  if (bars >= 10) interlude(0.36, bars >= 20 ? 2 : 1);
  if (bars >= 32) interlude(0.64, 2);
  const seams = [];
  for (let b = 1; b < climax; b++) if (!open[b] && (['intro', 'fill'].includes(role(b - 1)) || open[b - 1])) seams.push(b);
  return { open, seams, climax };
}

/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'steelpan-bossa',
  label: '夏日鋼鼓',
  doc: '清涼夏天的輕 bossa（100 BPM、大調）：鋼鼓、馬林巴琶音、Rhodes 七和弦（city-pop 進行）、根音五度貝斯、rim 響棒、沙鈴；大部分只留薄薄的節奏好讓人講話，中段一小段和最後一段才打開旋律；冰品、夏天、海邊、講話多的美食介紹',
  defaults: { bpm: 100, key: 'D' },
  swing: 0.06,
  voices: {
    // steel pan: strong octave and twelfth over the fundamental, the octave blooming in a few ms after the strike, glassy decay
    pan: (sr, r, e) => {
      const f = 440 * 2 ** ((e.midi - 69) / 12), n = Math.floor(sr * 1.3), out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr, bloom = Math.min(1, t / 0.018);
        const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 3.0)
          + 0.62 * bloom * Math.sin(2 * Math.PI * f * 2.003 * t) * Math.exp(-t * 4.2)
          + 0.2 * Math.sin(2 * Math.PI * f * 3.01 * t) * Math.exp(-t * 7)
          + 0.08 * Math.sin(2 * Math.PI * f * 4.2 * t) * Math.exp(-t * 12);
        out[i] = 0.36 * v * Math.min(1, t / 0.003);
      }
      return out;
    },
    // rim click: a short woody knock
    rim: (sr, r) => {
      const n = Math.floor(sr * 0.07), out = new Float32Array(n);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr; y += 0.35 * ((r() * 2 - 1) - y);
        out[i] = (0.55 * Math.sin(2 * Math.PI * 1720 * t) * Math.exp(-t * 85) + 0.35 * y * Math.exp(-t * 140)) * Math.min(1, t / 0.0008);
      }
      return out;
    },
  },
  build(c) {
    const out = [], last = c.bars - 1, B = c.beat, P = panPlan(c.bars, c.role);
    // the held breath: the last half beat before the climax stays silent
    const dip = [c.at(P.climax, 0) - B * 0.5, c.at(P.climax, 0) - 0.001];
    const push = (t, inst, vel, pan, midi, dur) => {
      if (t < 0 || (t > dip[0] && t < dip[1])) return;
      out.push({ t, inst, vel, pan, ...(midi !== undefined ? { midi } : {}), ...(dur !== undefined ? { dur } : {}) });
    };
    const n = (d, oct) => c.scaleNote(d, oct);
    const prog = [1, 6, 2, 5, 4, 3, 2, 5];

    for (let b = 0; b < last; b++) {
      const t0 = c.at(b, 0), d = prog[b % 8], isOpen = P.open[b], lv = c.layers(b);
      // bass: root on 1 and 3, fifth on the and-of-2 and the and-of-4
      const root = n(d, 2), fifth = n(d + 4, 2);
      push(t0, 'bass', 0.62, 0, root, B * 1.2); push(t0 + B * 1.5, 'bass', 0.42, 0, fifth, B * 0.45);
      push(t0 + B * 2, 'bass', 0.55, 0, root, B * 1.2); push(t0 + B * 3.5, 'bass', 0.42, 0, fifth, B * 0.45);
      // rim clave (two-bar 3–2) and shaker eighths
      for (const e8 of (b % 2 === 0 ? [0, 3, 6] : [2, 4])) push(t0 + e8 * B / 2, 'rim', 0.5, 0.25);
      for (let e8 = 0; e8 < 8; e8++) push(t0 + e8 * B / 2, 'shaker', e8 % 2 ? 0.2 : 0.32, -0.3);
      // Rhodes: one long chord while thin, the bossa comp when open
      const ch = c.chordOn(d, { octave: 4, seventh: true });
      for (const m of ch) push(t0, 'epiano', isOpen ? 0.34 : 0.22, 0, m, B * (isOpen ? 1.3 : 1.8));
      if (isOpen) {
        for (const m of ch) push(t0 + B * 1.5, 'epiano', 0.24, 0, m, B * 0.4);
        for (const m of ch) push(t0 + B * 3, 'epiano', 0.26, 0, m, B * 0.8);
        push(t0, 'kick', 0.32, 0); push(t0 + B * 2, 'kick', 0.26, 0);
        // marimba: up the chord in eighths, second half of the bar
        ch.concat([ch[0] + 12]).forEach((m, i) => push(t0 + B * 2 + i * B / 2, 'marimba', 0.3, 0.35, m + 12, B * 0.5));
        // pan melody: a little rising-falling phrase on chord tones, answering itself every other bar
        const mel = b % 2 === 0 ? [[0, 4], [0.75, 3], [1.5, 1], [2.5, 2]] : [[0, 3], [0.5, 4], [1, 5], [2, 4], [3, 2]];
        for (const [beat, k] of mel) push(t0 + beat * B, 'pan', 0.5, -0.15, n(d + (k - 1) * 2, 5) - (k > 3 ? 12 : 0), B * 1.2);
      } else {
        // thin bars grow a little with the layers: a soft kick, then a marimba tag into the next section
        if (lv >= 2) push(t0, 'kick', 0.2, 0);
        if (c.role(b) === 'fill' && lv >= 1) [5, 6, 8].forEach((k, i) => push(c.at(b, 3 + i * 0.33), 'marimba', 0.24 + i * 0.04, 0.35, n(k, 5), B * 0.4));
      }
    }
    // the pan answers where a section starts: the fifth, then the root of the bar's chord
    for (const b of P.seams) {
      const t = c.at(b, 0) + 0.05, d = prog[b % 8];
      push(t, 'pan', 0.36, 0.2, n(d + 4, 5), B);
      push(t + B / 2, 'pan', 0.3, 0.2, n(d, 5), B * 1.5);
    }
    // the climax: after the held breath, a bright pan run up
    const top = c.at(P.climax, 0);
    if (P.climax < last) [1, 3, 5, 8].forEach((k, i) => push(top + i * B / 4, 'pan', 0.48, -0.1, n(k, 5), B));
    // end: one major-ninth chord, a low root, pan on top
    const tE = c.at(last, 0);
    for (const m of [n(1, 3), n(5, 3), n(7, 4), n(9, 4), n(10, 4)]) push(tE, 'epiano', 0.36, 0, m, c.bar);
    push(tE, 'pad', 0.25, 0, n(3, 4), c.bar);
    push(tE, 'bass', 0.6, 0, n(1, 2), c.bar);
    push(tE, 'pan', 0.5, 0, n(8, 5), c.bar);
    push(tE + B / 3, 'pan', 0.36, 0.2, n(12, 5), c.bar);
    push(tE, 'bell', 0.22, -0.2, n(15, 5), c.bar);
    return out;
  },
};
