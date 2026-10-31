---
{
  "order": 8,
  "color": "#8a6d4b",
  "name": { "zh": "圖解故事", "en": "Animated Explainer", "ja": "図解ムービー" },
  "summary": {
    "zh": "用圖解、圖表、測驗或迷思破解，把一件事講清楚。可以完全不用素材（畫面全由程式畫，配旁白和配樂），也可以放你自己的影片，例如教學，旁邊再配圖片和說明。",
    "en": "Explains one idea with diagrams, charts, a quiz or a myth to bust. Works with no footage at all (everything is drawn, with voice-over and music), or with your own video, such as a lesson, with pictures and notes beside it.",
    "ja": "図解、グラフ、クイズ、誤解の検証などで、ひとつのことをわかりやすく説明します。素材なし（画面はすべて描画、ナレーションと音楽付き）でも、レッスンなど自分の動画に図や説明を添えても作れます。"
  },
  "fit": {
    "zh": ["想講清楚的一個主題或一個問題（不用素材也可以）", "或是你自己的影片（教學、操作示範），想在旁邊配圖解說"],
    "en": ["One topic or question to explain (no footage needed)", "Or your own video (a lesson, a demo) that needs pictures and notes beside it"],
    "ja": ["説明したいテーマや問いがひとつ（素材なしでも OK）", "または自分の動画（レッスン、操作説明）に図解を添えたいとき"]
  },
  "facts": {
    "zh": ["9:16 直式或 16:9 橫式", "45 秒–3 分鐘", "一支只講一件事", "旁白＋字幕"],
    "en": ["9:16 vertical or 16:9 landscape", "45 s–3 min", "One idea per video", "Voice-over + captions"],
    "ja": ["9:16 縦型または 16:9 横型", "45 秒〜3 分", "1 本にひとつのテーマ", "ナレーション＋字幕"]
  },
  "length": [45, 180],
  "ratios": ["9:16", "16:9"],
  "genres": false,
  "sources": ["pixabay", "wikimedia"],
  "styles": [
    { "id": "flat", "custom": true,
      "name": { "zh": "扁平動畫", "en": "Flat animation", "ja": "フラットアニメ" },
      "desc": { "zh": "形式｜向量插畫、圓角造型、鮮豔配色，每個抽象的步驟都用一個比喻畫出來，畫面一直在動。（沒有共用的插畫積木，這支片會自己畫）", "en": "Form | Vector illustrations, rounded shapes, bright colours, a picture metaphor for each abstract step, always moving. (No shared illustration block: the film draws its own.)", "ja": "形式｜ベクターイラスト、丸みのある形、鮮やかな色。抽象的な段階はひとつずつ比喩で描き、常に動く。（共通のイラストブロックはなく、この動画用に描きます）" },
      "prompt": "Form: a flat animated explainer: vector illustrations drawn as this project's own fx in one style throughout (rounded shapes, a small bright palette from the theme), one visual metaphor for each abstract step (a pipe for a flow, scales for a trade-off, a queue for waiting), something moving every 2–3 s; a recurring character may carry it. There is no shared illustration block: write the scenes as fx." },
    { "id": "whiteboard",
      "name": { "zh": "手繪白板", "en": "Whiteboard doodles", "ja": "手描きホワイトボード" },
      "desc": { "zh": "形式｜方格紙上，跟著旁白一筆一筆畫出塗鴉、箭頭和手寫字。", "en": "Form | On squared paper, doodles, arrows and handwriting drawn stroke by stroke with the voice-over.", "ja": "形式｜方眼紙の上に、ナレーションに合わせて落書き・矢印・手書き文字を一筆ずつ。" },
      "prompt": "Form: a whiteboard explainer on paper: common.paper look: 'grid' (or the desk) under everything; doodles drawn stroke by stroke with common.pen on the narration's words (circle, arrow, underline, check, cross… or kind trace for a drawing of your own), key words written with common.handwrite, steps on common.notecard; nothing appears that is not being drawn or written. Sound common.scribble under the drawing." },
    { "id": "essay",
      "name": { "zh": "影像論文", "en": "Video essay", "ja": "映像エッセイ" },
      "desc": { "zh": "形式｜地圖飛進去、圖表、老照片和文件，紙張和底片質感，旁白帶著走，節奏慢、比較有份量。適合歷史和社會題材。", "en": "Form | Maps flying in, charts, archive photos and documents, paper and film texture, led by the voice; slower and weightier, for history and society.", "ja": "形式｜地図へ飛び込み、グラフ、古い写真や資料、紙とフィルムの質感、ナレーションが導く。ゆっくり重みのある語りで、歴史や社会のテーマに。" },
      "prompt": "Form: a video essay, narration first and the music low: maps that fly in (common.worldmap from the globe down to a country, common.mapcam over an assets map picture), charts (common.chart), archive photos and documents from assets (wikimedia) panned slowly, chapter titles with common.headline, paper or film texture (common.paper, common.film grain). Slower and weightier: for history and society." },
    { "id": "kinetic",
      "name": { "zh": "動態文字", "en": "Kinetic text", "ja": "キネティックタイポ" },
      "desc": { "zh": "形式｜關鍵字本身就是畫面，跟著旁白的字一個個出來，粗細和大小拉開，一個畫面一句。", "en": "Form | The key words are the picture, each arriving on the word spoken, with big contrasts of weight and size, one line at a time.", "ja": "形式｜キーワードそのものが画面。話す言葉に合わせて現れ、太さと大きさにメリハリ、1 画面に 1 行。" },
      "prompt": "Form: kinetic typography: the key words themselves are the picture, each on the narration word it belongs to (cue times from the words); strong contrasts of weight and size, one line on screen at a time, key words changing colour or moving; common.slam for the hits and common.list look: 'stack' for words stacked down the side, the rest as this project's own type fx over a quiet moving background. Two fonts at most." },
    { "id": "side-by-side",
      "name": { "zh": "影片＋旁邊圖解", "en": "Your video with diagrams beside it", "ja": "動画の横に図解" },
      "desc": { "zh": "形式｜你的影片放一格，另一格跟著內容出現步驟、圖片和重點；教學先給結果，步驟編號，點的地方會圈起來。", "en": "Form | Your video in one panel; steps, pictures and key points appear in the other as you speak. A lesson shows the result first, numbers its steps and rings what is clicked.", "ja": "形式｜自分の動画を一枠に、もう一枠に手順・画像・要点が話に合わせて出る。レッスンは結果から見せ、手順に番号、クリックする所を丸で囲む。" },
      "prompt": "Form: the user's own video (a lesson, a demo) stays the main picture in one panel (common.panel around the clip's frame); the rest of the frame shows the steps, pictures and key points in time with what is said (common.list style number for numbered steps, common.card for a step with its picture, common.callout ringing the place on screen being clicked or touched). A lesson shows the result first, then the steps, numbered; screen text enlarged until it reads on a phone. At 9:16 the video above and the notes under it; at 16:9 side by side." },
    { "id": "myth",
      "name": { "zh": "迷思破解", "en": "Myth busting", "ja": "誤解を検証" },
      "desc": { "zh": "形式｜開頭「你以為 A」被紅筆劃掉、蓋上「其實是 B」，接著一件件攤開證據，最後附上來源。", "en": "Form | \"You think A\" struck out in red and stamped \"actually B\", then the evidence one piece at a time, and the sources to close.", "ja": "形式｜冒頭の「A だと思ってない？」に赤線が引かれ「実は B」のスタンプ。続いて証拠をひとつずつ示し、最後に出典。" },
      "prompt": "Form: myth busting: open on the belief (\"you think A…\"), struck out at the flip and stamped with what is true (common.strike: the before line and the after stamp, with common.buzz); then the evidence one piece at a time, in common.casefile (the claim typed in, evidence boxes stamped, the claim struck and rejected) or as drawn cards; end on a source card naming where the facts come from. Only a belief the evidence really flips; the sources are real and named." },
    { "id": "listicle",
      "name": { "zh": "排行榜", "en": "Top-N list", "ja": "ランキング" },
      "desc": { "zh": "形式｜「5 個…」倒數到第一名，每一項一樣長、開頭一個大數字，上面顯示 3/5；第一名最強或有反轉。", "en": "Form | \"5 things…\" counting down to number one, each item the same length and opened by a big number, 3/5 along the top; number one the strongest or a twist.", "ja": "形式｜「〇〇 5 選」を 1 位までカウントダウン。各項目は同じ長さで大きな数字から始まり、上に 3/5。1 位は最強か、どんでん返し。" },
      "prompt": "Form: a top-N list counting down to number one: a short tease that reveals nothing, then each item opened by a big number and given the same length and rhythm; common.progress mode: 'slots' (or dots) shows 3/5 along the top, common.list style number keeps the items so far; number one is the strongest or the twist, and the ranking may close as common.chart kind rank. No long intro: the first item within the first few seconds." },
    { "id": "data",
      "name": { "zh": "數據說故事", "en": "Data story", "ja": "データで語る" },
      "desc": { "zh": "形式｜一個問題，用會長出來的長條、折線、比例小人或排名回答，數字往上跳，結尾一格結論。", "en": "Form | One question answered with charts that grow (bars, lines, little people, rankings), numbers counting up, and a conclusion to end.", "ja": "形式｜ひとつの問いに、伸びる棒グラフ、折れ線、人型グラフ、ランキングで答える。数字がカウントアップし、最後に結論。" },
      "prompt": "Form: a data story: one clear question answered with animated charts (common.chart: bars growing with their numbers counting up, line over time, people for \"4 in 10\", pie, rank, balance, table), one chart idea at a time, never several things moving at once; a single number that matters big on common.digits or a dial (common.gauge); notes on the key years; the last frame states the answer. Every number from a real source, named on screen (assets data, wikimedia, or the user's own text)." },
    { "id": "quiz",
      "name": { "zh": "隨堂測驗", "en": "Quiz", "ja": "クイズ" },
      "desc": { "zh": "形式｜出題、倒數滴答、揭曉配音效，一題比一題難，最後問「你答對幾題？」。", "en": "Form | A question, a ticking countdown, the reveal with a sound, each question harder, and \"how many did you get?\" to end.", "ja": "形式｜出題、カチカチのカウントダウン、効果音つきの答え合わせ。だんだん難しくなり、最後は「何問正解した？」。" },
      "prompt": "Form: a quiz: each question on screen and read aloud, a common.countdown (from 5, common.tick each second: long enough to think, short enough not to drag), the reveal with a sound (common.ding right, common.buzz wrong), a common.scoreboard keeping count; the questions get harder; end with \"how many did you get? tell me in the comments\". Every answer checked." },
    { "id": "chat",
      "name": { "zh": "朋友來問", "en": "A friend asks", "ja": "友だちの質問" },
      "desc": { "zh": "形式｜朋友在聊天室問「為什麼…？」，你用短訊息、照片和語音一步步回答，需要圖解時畫面切出去再回來。", "en": "Form | A friend asks \"why…?\" in a chat and you answer step by step in short messages, photos and voice notes, cutting out to a diagram when one is needed.", "ja": "形式｜友だちがチャットで「なんで…？」と質問、短いメッセージ・写真・ボイスで一歩ずつ答え、図解が要るときは画面を切り替えて戻る。" },
      "prompt": "Form: explained as a chat with common.chat: a friend (them) asks the question (\"why does…?\"), you (me) answer in short bubbles, photo messages (assets pictures) and voice notes for the narration; where a diagram is needed the chat steps aside to a full-frame diagram (common.chart or this project's fx) and comes back; the friend's follow-up questions carry it from step to step, and the last bubble is the one-line answer. At 16:9 the phone stands in the middle (device auto). Sounds common.send / common.recv / common.typing. Generic chat UI, no real app's colours or marks." },
    { "id": "chapters",
      "name": { "zh": "章節進度", "en": "Chapter progress", "ja": "チャプター" },
      "desc": { "zh": "點綴｜上方一排章節點或分頁，觀眾知道講到哪、還剩多少。", "en": "Accent | A row of chapter dots or tabs along the top, so viewers see where they are and what is left.", "ja": "アクセント｜上にチャプターの点やタブが並び、今どこで、あとどれくらいかがわかる。" },
      "prompt": "Accent: chapter progress along the top safe edge: common.progress mode: 'dots' for a few parts, mode: 'tabs' with a short name for each chapter; it changes exactly when the narration moves to the next part." },
    { "id": "callouts",
      "name": { "zh": "圈重點", "en": "Callouts", "ja": "ここに注目" },
      "desc": { "zh": "點綴｜講到哪就用手繪圈、箭頭指出畫面上的那個東西，旁邊一個小標。", "en": "Accent | A hand-drawn ring or arrow points at the thing being talked about, with a small label.", "ja": "アクセント｜話している所を手描きの丸や矢印で指し、小さなラベルを添える。" },
      "prompt": "Accent: callouts on the thing being talked about: common.callout (a ring, a cross or a ban sign with a leader to a short label) or common.pen arrows and circles, drawn on the word that names it; one at a time, gone before the next." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: one idea made clear, worth saving and sharing.
- 9:16 or 16:9, 45 s–3 min. One idea per video; trying to explain three things in one video is the commonest failure. Open with a question (or the belief to flip, the number, the first item) in the first seconds; end with a one-line summary.
- The styles are of two kinds, and their prompts begin with the kind. Form (flat, whiteboard, essay, kinetic, side-by-side, myth, listicle, data, quiz, chat) carries the whole film: at most one form; if the user picks two, the first is the form and the second only lends its opener or ending; say so in one sentence. Accent goes with any form.
- No form picked: with the user's own video, side-by-side; with none, the form the topic asks for (a belief to flip: myth; numbers: data; a ranking: listicle), else flat animation.
- No footage: draw every scene, write a narration script (npm run voice), time cues to its words, and keep the music low under the voice.
- With the user's own video (e.g. a lesson): it stays the main picture; diagrams, pictures and notes appear beside it in time with what is said.
- Something on screen changes every 2–3 s; a visual metaphor for anything abstract; one new element at a time.
- Captions in sync with the voice; little other text on screen (a key word, a number), never a paragraph.
- Layout: at 9:16 the diagram in the upper half and the captions lower middle; at 16:9 the diagram on the left and the key words on the right, or the animation full-frame with captions below.
- Facts and numbers are checked and real (assets data, wikimedia, or the user's own text), with the source named where a number is shown; never invent a number, a quote or a study.
