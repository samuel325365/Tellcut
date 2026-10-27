---
{
  "order": 2,
  "color": "#ff5f6d",
  "name": { "zh": "精華切片", "en": "Clips from Long Videos", "ja": "切り抜き" },
  "summary": {
    "zh": "從一支已經完成的長片裡，挑出最精彩的一段剪成短片。要導流回原片就加開頭鉤子；只是放自己的 IG 就不用。",
    "en": "Picks the best moment of a finished long video and makes it a short. Add a hook if it should send people to the full video; skip it for your own IG.",
    "ja": "完成した長い動画から一番いい場面を選んでショートにします。本編へ誘導するならフックを入れ、自分の IG 用ならなしで。"
  },
  "fit": {
    "zh": ["一支已經剪好的長片：vlog、直播、演講、教學", "想放 Shorts、Reels 導流，或只是分享精華"],
    "en": ["One finished long video: a vlog, a stream, a talk, a lesson", "For Shorts or Reels that point back to it, or just to share the best part"],
    "ja": ["完成済みの長い動画 1 本：vlog、配信、講演、レッスン", "本編への誘導用でも、名場面の共有でも"]
  },
  "facts": {
    "zh": ["9:16 直式", "20–90 秒", "鉤子：導流才加", "燒進畫面的字幕"],
    "en": ["9:16 vertical", "20–90 s", "Hook only when promoting", "Burned-in captions"],
    "ja": ["9:16 縦型", "20〜90 秒", "フックは誘導時のみ", "字幕を焼き込み"]
  },
  "length": [20, 90],
  "ratios": ["9:16"],
  "sources": ["freesound"],
  "styles": [
    { "id": "big-captions",
      "name": { "zh": "逐字大字幕", "en": "Word-by-word captions", "ja": "一語ずつの大きな字幕" },
      "desc": { "zh": "一次 2–4 個字的粗體大字幕，正在講的字變色。", "en": "Bold captions, 2–4 words at a time, the spoken word highlighted.", "ja": "一度に 2〜4 語の太い字幕、話している語が色変わり。" },
      "prompt": "Word-by-word bold captions, 2–4 words at a time, the word being said lit: common.caption in style big or auto, karaoke, 2–4 words per caption: c.speechCaptions(clip, { type: \"common.caption\", karaoke: true, chunk: { zh: 6, ja: 6, '*': 3 }, params: { style: \"big\" } }) (the transcript's language picks the size: Chinese and Japanese transcripts count a character a word) — never a whole sentence in one caption." },
    { "id": "telop",
      "name": { "zh": "綜藝花字", "en": "Variety-show text", "ja": "バラエティ風テロップ" },
      "desc": { "zh": "彩色造型字和效果音，放大笑點和吐槽。", "en": "Colourful styled text and sound effects that punch up jokes.", "ja": "カラフルな装飾文字と効果音で笑いどころを強調。" },
      "prompt": "Variety-show telop on jokes and reactions: common.slam or common.burst (with common.speedlines for a big one) in bright colours, each with a sound (common.pop / common.impact / common.boing); a few per minute, never over a face, the header bar or the captions." },
    { "id": "punch-in",
      "name": { "zh": "重點推近", "en": "Punch-in on key lines", "ja": "要所でズーム" },
      "desc": { "zh": "講到重點時畫面推近。", "en": "The frame pushes in on the key line.", "ja": "大事な一言で画面が寄る。" },
      "prompt": "Punch in on key lines: on that clip, crop from 1× to about 1.15× (c.clip crop { from, to }, or a quick c.view zoom); only the two or three lines that matter, never every sentence." },
    { "id": "tease",
      "name": { "zh": "留白吊胃口", "en": "Hold back the answer", "ja": "答えを焦らす" },
      "desc": { "zh": "在答案前一刻停住，或把關鍵字嗶掉、用貼圖遮住，引人去看完整版。", "en": "Stop just before the answer, or bleep and cover the key word, so people watch the full video.", "ja": "答えの直前で止める、またはキーワードをピー音とスタンプで隠し、本編へ誘う。" },
      "prompt": "Tease: stop right before the payoff, or bleep and cover the key word (c.censorSpeech / common.censor), then an end card pointing to the full video (common.outro)." },
    { "id": "title-bar",
      "name": { "zh": "標題條", "en": "Title bar", "ja": "タイトルバー" },
      "desc": { "zh": "整支片上方都有一條大標題。", "en": "A headline bar stays at the top the whole time.", "ja": "画面上部にずっと大きな見出し。" },
      "prompt": "A headline bar at the top for the whole clip (common.header)." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: one strong moment from a finished long video, as a self-contained short.
- 9:16, 20–90 s. Find the best moment from the transcript; it must make sense without the rest.
- If the user wants to send viewers to the full video: cold open on the strongest line in the first second, and end with a "watch the full video" card. For a personal post (e.g. their own travel vlog on IG) no hook or end card.
- Burned-in captions, kept clear of the platform UI.
- Fill the frame: crop 16:9 to 9:16 around faces and action, never cutting off heads. When two people cannot both fit, split the frame (one person per band: c.view + c.bands, or common.duo) instead of shrinking the video into a small panel.
- Do not clip other people's content unless the user says they have the rights.
