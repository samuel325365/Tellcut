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
  "genres": false,
  "sources": ["freesound"],
  "styles": [
    { "id": "quote-card",
      "name": { "zh": "金句字卡", "en": "Quote card", "ja": "名言カード" },
      "desc": { "zh": "形式｜一句話就夠力的片段：影片縮到右上小窗，左邊大引號加說話的人，金句照講話的時間一個詞一個詞跳出來，最狠的那句砸下來；結尾一張金句卡。", "en": "Form | For a moment where one line says it all: the video shrinks to a corner window, a big quote mark and the speaker's name, the line appearing word by word as it is spoken, the hardest one slammed; a quote card to close.", "ja": "形式｜一言で決まる場面に：動画は右上の小窓へ、大きな引用符と話し手の名前、名言が話すタイミングで一語ずつ現れ、いちばん強い一言をドンと。最後は名言カード。" },
      "prompt": "Form: the clip's key statement as a moving quote card with common.quote mode words: the video shrinks to a small window (win, which is the main-track clip's frame), a big quote mark and the speaker's name beside it, the lines appearing word by word on the speech's times (times), the hardest line hit. Cold open full-frame on the speaker, go into the card for the key statement, and close on mode card with the line that sums it up. For a clip whose strength is one or two sentences; quote the words exactly as said." },
    { "id": "search",
      "name": { "zh": "搜尋問答", "en": "Search and answer", "ja": "検索して答える" },
      "desc": { "zh": "形式｜觀眾會搜尋的問題，片段就是答案：開頭在搜尋框打出問題、點下建議，接著是講者的回答；結尾是「看完整版」的結果卡。適合導流。", "en": "Form | A question viewers would search, and the clip is the answer: type it into a search box, tap a suggestion, the speaker answers; end on a \"watch the full video\" result. Made for sending people to the original.", "ja": "形式｜視聴者が検索しそうな質問に、この場面が答える：検索ボックスに入力して候補をタップ、話し手の答えへ。最後は「本編を見る」の結果カード。本編への誘導向き。" },
      "prompt": "Form: the clip answers a question viewers would search. Open on common.search mode home over the blurred first frame: the question typed, autocomplete rows drop down, one tapped with common.touch at searchPoint; then the speaker's answer plays full-frame with captions; close on mode end with a redacted featured snippet and the full-video result card as the call to action (the main-track clip at frame: searchWindow(params, width, height)). Use it when the user wants to send viewers to the full video. Sounds common.typing / common.tick / common.pop. Generic dark search page, no real engine's logo, colours or layout." },
    { "id": "live-replay",
      "name": { "zh": "直播回放", "en": "Live replay", "ja": "ライブのリプレイ" },
      "desc": { "zh": "形式｜像在看直播精華：講者滿版，留言一則則從下面冒上來，講到高潮時愛心飄滿畫面。適合直播、講座、問答。", "en": "Form | Like watching a live replay: the speaker full-frame, comments rising from below, hearts floating up at the peaks. For streams, talks and Q&As.", "ja": "形式｜ライブ配信の名場面のように：話し手は全画面、コメントが下から次々に上がり、盛り上がりでハートがあふれる。配信・講演・Q&A 向き。" },
      "prompt": "Form: a live-stream replay. The speaker full-frame; common.comments rising from below with short viewer reactions that match what is being said at that moment; common.emoji mode float hearts on the peaks. Comments are generic reactions with generic names, never invented facts and never real usernames. For streams, talks and Q&As." },
    { "id": "title-bar",
      "name": { "zh": "標題條", "en": "Title bar", "ja": "タイトルバー" },
      "desc": { "zh": "形式｜整支片上方一直掛著一條大標題，下面是講者和字幕，像熱門切片的包裝。", "en": "Form | A headline bar stays at the top for the whole clip, the speaker and captions below, like the usual packaging of popular clips.", "ja": "形式｜全編を通して上に大きなタイトルバー、その下に話し手と字幕。人気の切り抜きでよく見る包み方。" },
      "prompt": "Form: a headline bar at the top for the whole clip (common.header look kicker: a small kicker over a big title), the footage full-frame under it with captions. The headline says what the clip delivers and never more than it delivers." },
    { "id": "big-captions",
      "name": { "zh": "逐字大字幕", "en": "Word-by-word captions", "ja": "一語ずつの大きな字幕" },
      "desc": { "zh": "字幕｜一次 2–4 個字的粗體大字幕，正在講的字變色。", "en": "Captions | Bold captions, 2–4 words at a time, the word being said lit.", "ja": "字幕｜一度に 2〜4 語の太い大きな字幕、話している語の色が変わる。" },
      "prompt": "Captions: word-by-word bold captions, 2–4 words at a time, the word being said lit: common.caption in style big or auto, karaoke, 2–4 words per caption: c.speechCaptions(clip, { type: \"common.caption\", karaoke: true, chunk: { zh: 6, ja: 6, '*': 3 }, params: { style: \"big\" } }) (the transcript's language picks the size: Chinese and Japanese transcripts count a character a word) — never a whole sentence in one caption." },
    { "id": "telop",
      "name": { "zh": "綜藝花字", "en": "Variety telop", "ja": "バラエティのテロップ" },
      "desc": { "zh": "字幕｜彩色造型字和效果音，放大笑點和吐槽。", "en": "Captions | Colourful styled words with sound effects to land the jokes and quips.", "ja": "字幕｜カラフルな装飾文字と効果音で、笑いどころやツッコミを強調。" },
      "prompt": "Captions: variety-show telop on jokes and reactions: common.slam or common.burst (with common.speedlines for a big one) in bright colours, each with a sound (common.pop / common.impact / common.boing); a few per minute, never over a face, the header bar or the captions." },
    { "id": "punch-in",
      "name": { "zh": "重點推近", "en": "Punch in", "ja": "要点でズームイン" },
      "desc": { "zh": "剪法｜講到重點時畫面推近。", "en": "Cut | The frame pushes in on the key lines.", "ja": "編集｜要点で画面が寄る。" },
      "prompt": "Cut: punch in on key lines: on that clip, crop from 1× to about 1.15× (c.clip crop { from, to }, or a quick c.view zoom); only the two or three lines that matter, never every sentence." },
    { "id": "tease",
      "name": { "zh": "留白吊胃口", "en": "Tease", "ja": "じらし" },
      "desc": { "zh": "剪法｜在答案前一刻停住，或把關鍵字嗶掉、用貼圖遮住，引人去看完整版。", "en": "Cut | Stop right before the answer, or bleep and cover the key word, to send people to the full video.", "ja": "編集｜答えの直前で止める、キーワードをピー音とスタンプで隠すなど、本編へ誘う。" },
      "prompt": "Cut: tease: stop right before the payoff, or bleep and cover the key word (c.censorSpeech / common.censor), then an end card pointing to the full video (common.outro). Hide one thing, not everything." },
    { "id": "progress",
      "name": { "zh": "進度條", "en": "Progress bar", "ja": "プログレスバー" },
      "desc": { "zh": "剪法｜上緣一條進度條，或一排章節點，讓人知道還剩多少。", "en": "Cut | A progress bar along the top, or a row of chapter dots, so viewers see how much is left.", "ja": "編集｜上端にプログレスバー、またはチャプターの点の列で、残りが分かる。" },
      "prompt": "Cut: a progress bar along the safe area (common.progress mode bar), or a row of chapter dots (mode dots) when the clip has parts, so viewers see how much is left." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: one strong moment from a finished long video, as a self-contained short.
- 9:16, 20–90 s. Find the best moment from the transcript; it must make sense without the rest.
- The styles are of four kinds, and their prompts begin with the kind. Form (quote-card, search, live-replay, title-bar) carries the whole clip: at most one form; if the user picks two, the first is the form and the second only lends its opener or ending; say so in one sentence. Captions and Cut go with any form.
- No form picked: the speaker full-frame with burned-in captions and the user's picks.
- If the user wants to send viewers to the full video: cold open on the strongest line in the first second, and end with a "watch the full video" card. For a personal post (e.g. their own travel vlog on IG) no hook or end card.
- Hold back: hiding too much or a title bigger than the clip makes viewers feel cheated.
- Burned-in captions, kept clear of the platform UI.
- When the footage plays full-frame, fill the frame: crop 16:9 to 9:16 around faces and action, never cutting off heads. When two people cannot both fit, split the frame (one person per band: c.view + c.bands, or common.duo) instead of shrinking the video into a small panel.
- Text stays short: a title, captions of what is said; no info cards. Never invent what the speaker did not say.
- Do not clip other people's content unless the user says they have the rights.
