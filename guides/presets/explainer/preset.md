---
{
  "order": 8,
  "color": "#8a6d4b",
  "name": { "zh": "圖解故事", "en": "Animated Explainer", "ja": "図解ムービー" },
  "summary": {
    "zh": "用圖解和文字把一件事講清楚。可以完全不用素材（畫面全由程式畫，配旁白和配樂），也可以放你自己的影片，例如教學，旁邊再配圖片和說明。",
    "en": "Explains one idea with diagrams and text. Works with no footage at all (everything is drawn, with voice-over and music), or with your own video, such as a lesson, with pictures and notes beside it.",
    "ja": "図とテキストでひとつのことをわかりやすく説明します。素材なし（画面はすべて描画、ナレーションと音楽付き）でも、レッスンなど自分の動画に図や説明を添えても作れます。"
  },
  "fit": {
    "zh": ["想講清楚的一個主題或一個問題（不用素材也可以）", "或是你自己的影片（教學、操作示範），想在旁邊配圖解說"],
    "en": ["One topic or question to explain (no footage needed)", "Or your own video (a lesson, a demo) that needs pictures and notes beside it"],
    "ja": ["説明したいテーマや問いがひとつ（素材なしでも OK）", "または自分の動画（レッスン、操作説明）に図解を添えたいとき"]
  },
  "facts": {
    "zh": ["9:16 直式", "45 秒–3 分鐘", "一支只講一件事", "旁白＋字幕"],
    "en": ["9:16 vertical", "45 s–3 min", "One idea per video", "Voice-over + captions"],
    "ja": ["9:16 縦型", "45 秒〜3 分", "1 本にひとつのテーマ", "ナレーション＋字幕"]
  },
  "length": [45, 180],
  "ratios": ["9:16"],
  "sources": ["pixabay"],
  "styles": [
    { "id": "flat", "custom": true,
      "name": { "zh": "扁平動畫", "en": "Flat animation", "ja": "フラットアニメ" },
      "desc": { "zh": "向量插畫、圓角造型、鮮豔配色，畫面一直在動。", "en": "Vector illustrations, rounded shapes, bright colours, always moving.", "ja": "ベクターイラスト、丸みのある形、鮮やかな色で常に動く。" },
      "prompt": "Flat animated explainer: vector illustrations drawn as project fx, rounded shapes, bright palette, something moves every 2–3 s." },
    { "id": "whiteboard",
      "name": { "zh": "手繪白板", "en": "Whiteboard doodles", "ja": "手描きホワイトボード" },
      "desc": { "zh": "跟著旁白一筆一筆畫出來的塗鴉和手寫字。", "en": "Doodles and handwriting drawn stroke by stroke with the voice-over.", "ja": "ナレーションに合わせて一筆ずつ描かれる落書きと手書き文字。" },
      "prompt": "Whiteboard look: doodles and handwriting drawn stroke by stroke in time with the narration (common.pen, common.handwrite, common.paper)." },
    { "id": "essay",
      "name": { "zh": "影像論文", "en": "Video essay", "ja": "映像エッセイ" },
      "desc": { "zh": "地圖、圖表、紙張質感，節奏較慢、比較有份量。", "en": "Maps, charts and paper texture; slower and weightier.", "ja": "地図、グラフ、紙の質感。テンポはゆっくり、重みのある語り。" },
      "prompt": "Video essay: maps, charts and archival pictures (assets), paper and film texture, narration first and music low." },
    { "id": "kinetic",
      "name": { "zh": "動態文字", "en": "Kinetic text", "ja": "キネティックタイポ" },
      "desc": { "zh": "文字本身就是畫面，跟著語音或節拍跳出來。", "en": "The words are the picture, appearing with the voice or the beat.", "ja": "文字そのものが画面。声やビートに合わせて現れる。" },
      "prompt": "Kinetic typography: the key words themselves are the picture, timed to the narration words." },
    { "id": "side-by-side",
      "name": { "zh": "影片＋旁邊圖解", "en": "Your video with diagrams beside it", "ja": "動画の横に図解" },
      "desc": { "zh": "你的影片放一邊，另一邊跟著內容出現圖片、步驟和重點。", "en": "Your video on one side; pictures, steps and key points appear on the other as you speak.", "ja": "自分の動画を片側に、もう片側に画像・手順・要点が話に合わせて出る。" },
      "prompt": "The user's own video in one panel, diagrams, steps and key points in the other, timed to the transcript (layout recipes, common.panel, common.list)." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: one idea made clear, worth saving and sharing.
- 9:16, 45 s–3 min. One idea per video; open with a question.
- No footage: draw every scene, write a narration script (npm run voice), time cues to its words, add music.
- With the user's own video (e.g. a lesson): it stays the main picture; diagrams, pictures and notes appear beside it in time with what is said.
- Something on screen changes every 2–3 s; use a visual metaphor for anything abstract.
- Captions in sync with the voice; little other text on screen.
- End with a one-line summary.
- Facts must be checked (assets data wikimedia); never invent numbers.
