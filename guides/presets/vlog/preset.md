---
{
  "order": 5,
  "color": "#0c8599",
  "name": { "zh": "生活 Vlog", "en": "Daily Vlog", "ja": "日常 Vlog" },
  "summary": {
    "zh": "把一天或一段日常的零碎片段，剪成有節奏、有起承轉合的 vlog。",
    "en": "Cuts the pieces of a day or a stretch of daily life into a vlog with rhythm and a beginning, middle and end.",
    "ja": "一日や日常の断片を、リズムと起承転結のある Vlog に仕上げます。"
  },
  "fit": {
    "zh": ["一天或一段日常的片段（起床、通勤、吃飯、散步……）", "有自己的旁白或說話聲更好"],
    "en": ["Pieces of one day or a stretch of daily life (waking up, commuting, meals, a walk...)", "Even better with your own voice-over or talking"],
    "ja": ["一日や日常のクリップ（起床、通勤、食事、散歩など）", "自分のナレーションや話し声があるとさらに良い"]
  },
  "facts": {
    "zh": ["9:16 直式", "45–120 秒", "依時間順序", "輕快節奏"],
    "en": ["9:16 vertical", "45–120 s", "In time order", "Light pace"],
    "ja": ["9:16 縦型", "45〜120 秒", "時系列順", "軽快なテンポ"]
  },
  "length": [45, 120],
  "ratios": ["9:16"],
  "sources": ["freesound", "incompetech"],
  "styles": [
    { "id": "day-clock", "custom": true,
      "name": { "zh": "時間戳記", "en": "Time stamps", "ja": "タイムスタンプ" },
      "desc": { "zh": "每個場景角落跳出時間，像一天的時間軸。", "en": "A time pops up in the corner of each scene, like a timeline of the day.", "ja": "場面ごとに隅に時刻が出て、一日のタイムラインになる。" },
      "prompt": "A clock time (07:30, 12:10...) pops up in a corner of each scene, building a timeline of the day." },
    { "id": "photo-dump",
      "name": { "zh": "照片卡點輪播", "en": "Photo dump on the beat", "ja": "ビートに合わせた写真スライド" },
      "desc": { "zh": "照片和短片跟著鼓點一張張換。", "en": "Photos and very short clips change on every beat.", "ja": "写真と短いクリップがビートごとに切り替わる。" },
      "prompt": "Photo dump: stills and very short clips change on the beat of the music." },
    { "id": "polaroid",
      "name": { "zh": "定格拍立得", "en": "Polaroid freeze", "ja": "ポラロイド風の静止画" },
      "desc": { "zh": "把一天裡最喜歡的瞬間定格成拍立得。", "en": "Freeze the favourite moment of the day as a polaroid.", "ja": "一日で一番好きな瞬間をポラロイドに定着する。" },
      "prompt": "Freeze one favourite moment as a polaroid (common.polaroid) with a short handwritten line." },
    { "id": "handwritten-notes", "custom": true,
      "name": { "zh": "手寫便條", "en": "Handwritten notes", "ja": "手書きメモ" },
      "desc": { "zh": "一句手寫的心情貼在畫面上，像日記。", "en": "A handwritten line of mood on screen, like a diary.", "ja": "日記のように、手書きのひとことを画面に貼る。" },
      "prompt": "Short handwritten notes stuck on the frame, like diary lines; at most one per scene." },
    { "id": "transitions",
      "name": { "zh": "轉場串連", "en": "Transitions that link scenes", "ja": "つながるトランジション" },
      "desc": { "zh": "用手遮鏡頭、甩鏡頭或相似畫面接到下一個場景。", "en": "Hand-over-lens, whip pans or match cuts between scenes.", "ja": "手でレンズを隠す、カメラを振る、似た画面でつなぐ。" },
      "prompt": "Link scenes with motivated transitions: hand-over-lens, whip pans, match cuts." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: a relaxed daily vlog for IG Reels, YouTube Shorts or X, with a clear start and end of the day.
- 9:16, 45–120 s. Shots fill the frame; no text slides.
- Hook in the first 2 s: the most charming moment, then rewind to the morning.
- Order by capture time; skip dull stretches, keep one or two shots per moment.
- Cut on the beat; light, warm music; keep any natural speech clear and duck the music under it.
- Text is a time, a place or a few words of mood.
- If the footage is already a finished vlog with talking to camera, keep one or two of the best spoken lines (captioned) as the voice of the film, and crop out its own burned-in titles.
- End by closing the loop: night, home, or a callback to the opening moment.
- Styles the user picked are listed below; if none, choose 1–2 that suit the material.
