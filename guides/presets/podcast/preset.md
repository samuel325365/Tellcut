---
{
  "order": 3,
  "color": "#c8962a",
  "name": { "zh": "Podcast 精華", "en": "Podcast Highlights", "ja": "ポッドキャスト切り抜き" },
  "summary": {
    "zh": "從一集 Podcast 或訪談裡剪出最好聽的一段，清楚標出誰在說話，配上逐字字幕。",
    "en": "Cuts the best exchange from a podcast or interview, showing clearly who is speaking, with word-by-word captions.",
    "ja": "ポッドキャストやインタビューから一番いいやり取りを切り出し、誰が話しているかをはっきり示し、字幕を付けます。"
  },
  "fit": {
    "zh": ["一集 Podcast 或訪談的錄影或錄音（兩個人以上在對話）", "只有聲音也可以，畫面會用音波和圖片補"],
    "en": ["A recording of a podcast or interview (two or more people talking)", "Audio only is fine: the picture is filled with a waveform and images"],
    "ja": ["ポッドキャストやインタビューの録画・録音（2 人以上の会話）", "音声のみでも OK：波形や画像で画面を作ります"]
  },
  "facts": {
    "zh": ["9:16 直式", "30–120 秒", "標出誰在說話", "逐字字幕"],
    "en": ["9:16 vertical", "30–120 s", "Shows who is speaking", "Word-by-word captions"],
    "ja": ["9:16 縦型", "30〜120 秒", "話者がわかる", "一語ずつの字幕"]
  },
  "length": [30, 120],
  "ratios": ["9:16"],
  "sources": ["freesound", "wikimedia"],
  "styles": [
    { "id": "stacked",
      "name": { "zh": "上下分割", "en": "Stacked split screen", "ja": "上下分割" },
      "desc": { "zh": "兩個人上下各佔一半，觀眾隨時知道誰在說話。", "en": "Two people stacked top and bottom, so it is always clear who talks.", "ja": "2 人を上下に並べ、いつも誰が話しているかわかる。" },
      "prompt": "Stacked split: each speaker in half of the frame, the one talking lit and the other dimmed: common.duo (each person's clip with frame = duoWindow('a' | 'b', params), segs from who speaks when); from one wide shot, c.view cuts each face out as its own camera and c.bands stacks them." },
    { "id": "solo",
      "name": { "zh": "跟著說話的人切", "en": "Cut to whoever speaks", "ja": "話す人に切り替え" },
      "desc": { "zh": "全畫面只放正在說話的人，換人說就切過去。", "en": "Full frame on whoever is talking, cutting when the speaker changes.", "ja": "話している人を全画面に、話者が変わると切り替え。" },
      "prompt": "Solo framing: full frame on the current speaker (the source's own close-up, or c.view around their face from a wide shot), cut on speaker change, never faster than the conversation; hold a short listener reaction now and then. For a framed look, common.duo mode: 'solo' (every clip with frame = duoWindow('a', params), segs from who speaks when: the window's ring takes the speaker's colour, each name chip shows on that person's first turn)." },
    { "id": "big-captions",
      "name": { "zh": "逐字大字幕", "en": "Word-by-word captions", "ja": "一語ずつの大きな字幕" },
      "desc": { "zh": "粗體大字幕，依說話的人分色。", "en": "Bold captions, coloured by speaker.", "ja": "太い大きな字幕、話者ごとに色分け。" },
      "prompt": "Bold word-by-word captions coloured by speaker: c.speechCaptions(clip, { type: \"common.caption\", karaoke: true, speakers: [[from, to, 1|2], …], names: ['', 'A', 'B'], params: { style: \"big\" } }); never mix two speakers in one caption." },
    { "id": "telop",
      "name": { "zh": "綜藝花字", "en": "Variety-show text", "ja": "バラエティ風テロップ" },
      "desc": { "zh": "笑點和吐槽用彩色造型字放大。", "en": "Jokes and comebacks punched up with colourful styled text.", "ja": "笑いやツッコミをカラフルな文字で強調。" },
      "prompt": "Variety telop on jokes and reactions: common.slam or common.burst with a sound (common.pop / common.boing); two or three a minute at most, never over a face or the captions." },
    { "id": "waveform", "custom": true,
      "name": { "zh": "音波動畫", "en": "Audio waveform", "ja": "音声波形" },
      "desc": { "zh": "只有聲音時，用跟著聲音跳動的音波和話題圖片撐住畫面。", "en": "For audio only: a waveform that moves with the voice, plus pictures of what they talk about.", "ja": "音声のみのとき、声に合わせて動く波形と話題の画像で画面を作る。" },
      "prompt": "Audiogram: a waveform driven by the speech audio, show artwork or topic pictures behind it." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: the best exchange of an episode as a short that makes people want the full episode.
- 9:16, 30–120 s. Pick from the transcript an exchange that stands on its own; cold open on its strongest line.
- The viewer always knows who is speaking: speaker labels or colours, framing that follows the speaker. Labels and colours change exactly on the cut or the speaker change.
- If the whole exchange is in single close-ups, cut to whoever speaks rather than faking a split with shots from other moments.
- Word-by-word captions; two people talking at once are never merged into one caption. Captions are in the language spoken; if the film's language differs, translate them with c.lines, timed to the original phrases.
- Cuts follow the conversation, never faster than it; reaction shots of the listener are welcome. Trim filler and false starts only where the cut is not heard.
- Reframe 16:9 to 9:16 around faces; never cut off heads. Cover or crop the show's own burned-in titles and lower thirds.
- End with the show name or a "full episode" card: common.outro look: 'episode' (the show name, a 16:9 window for a last clip with frame = outroWindow(params, W, H), the episode line, a button). When the exchange is a list (three rules, five tips), a common.progress mode: 'slots' row of numbered cards fills as each point is made, and a common.slip stub with slot flies into its card.
- Do not clip other people's shows unless the user says they have the rights.
- Styles the user picked are listed below; if none, choose 1–2 that suit the material.
