---
{
  "order": 0,
  "color": "#4263eb",
  "name": { "zh": "自定義", "en": "Custom", "ja": "カスタム" },
  "summary": {
    "zh": "自己決定比例、長度、構圖這些，其他交給 Agent。",
    "en": "Set the ratio, length, framing and the like yourself; the agent decides the rest.",
    "ja": "比率や長さ、構図などを自分で決めて、残りはエージェントにお任せ。"
  },
  "fields": [
    { "id": "ratio", "group": { "zh": "畫面", "en": "Picture", "ja": "画面" },
      "name": { "zh": "比例", "en": "Ratio", "ja": "比率" },
      "options": [
        { "id": "9:16", "name": { "zh": "9:16 直式", "en": "9:16", "ja": "9:16 縦" }, "prompt": "Make the film 9:16 vertical." },
        { "id": "1:1", "name": { "zh": "1:1 方形", "en": "1:1", "ja": "1:1 正方形" }, "prompt": "Make the film 1:1 square." },
        { "id": "4:5", "name": { "zh": "4:5 直式貼文", "en": "4:5", "ja": "4:5 投稿" }, "prompt": "Make the film 4:5 vertical (a feed post)." },
        { "id": "16:9", "name": { "zh": "16:9 橫式", "en": "16:9", "ja": "16:9 横" }, "prompt": "Make the film 16:9 horizontal." }
      ] },
    { "id": "resolution", "group": { "zh": "畫面", "en": "Picture", "ja": "画面" },
      "name": { "zh": "解析度", "en": "Resolution", "ja": "解像度" },
      "hint": { "zh": "4K 輸出會慢很多", "en": "4K takes much longer to render", "ja": "4K は書き出しにかなり時間がかかります" },
      "options": [
        { "id": "720p", "name": { "zh": "720p", "en": "720p", "ja": "720p" }, "prompt": "Make the project's short side 720 px (the long side follows the ratio)." },
        { "id": "1080p", "name": { "zh": "1080p", "en": "1080p", "ja": "1080p" }, "prompt": "Make the project's short side 1080 px (the long side follows the ratio)." },
        { "id": "4k", "name": { "zh": "4K", "en": "4K", "ja": "4K" }, "prompt": "Make the project's short side 2160 px (the long side follows the ratio); rendering takes much longer." }
      ] },
    { "id": "length", "group": { "zh": "畫面", "en": "Picture", "ja": "画面" }, "seconds": true,
      "name": { "zh": "長度", "en": "Length", "ja": "長さ" },
      "options": [
        { "id": "15", "name": { "zh": "15 秒", "en": "15 s", "ja": "15 秒" }, "prompt": "Make the film about 15 s long (within 10%)." },
        { "id": "30", "name": { "zh": "30 秒", "en": "30 s", "ja": "30 秒" }, "prompt": "Make the film about 30 s long (within 10%)." },
        { "id": "60", "name": { "zh": "60 秒", "en": "60 s", "ja": "60 秒" }, "prompt": "Make the film about 60 s long (within 10%)." },
        { "id": "90", "name": { "zh": "90 秒", "en": "90 s", "ja": "90 秒" }, "prompt": "Make the film about 90 s long (within 10%)." }
      ] },
    { "id": "framing", "group": { "zh": "畫面", "en": "Picture", "ja": "画面" },
      "name": { "zh": "構圖", "en": "Framing", "ja": "構図" },
      "options": [
        { "id": "full", "name": { "zh": "滿版", "en": "Full frame", "ja": "全面" }, "prompt": "Shots fill the frame, cropped to the ratio." },
        { "id": "inset", "name": { "zh": "置中留邊", "en": "Centered with margins", "ja": "中央に余白" }, "prompt": "The footage sits centered with a margin around it (a plain or blurred background)." },
        { "id": "split", "name": { "zh": "上下分割（上畫面、下文字）", "en": "Split: picture above, text below", "ja": "上下分割（上に映像、下に文字）" }, "prompt": "Split the frame: footage in the top part, text in the bottom part." },
        { "id": "side", "name": { "zh": "左右並排", "en": "Side by side", "ja": "左右に並べる" }, "prompt": "Two shots side by side." },
        { "id": "pip", "name": { "zh": "畫中畫", "en": "Picture in picture", "ja": "ピクチャー・イン・ピクチャー" }, "prompt": "A main shot with a smaller shot inset in a corner (picture in picture)." }
      ] },
    { "id": "inserts", "group": { "zh": "結構", "en": "Structure", "ja": "構成" },
      "name": { "zh": "圖文段落", "en": "Graphics", "ja": "図解パート" },
      "hint": { "zh": "圖文插圖：文字卡、資訊圖、圖表、插畫", "en": "Graphics: text cards, infographics, charts, illustrations", "ja": "図解：文字カード、インフォグラフィック、グラフ、イラスト" },
      "options": [
        { "id": "footage", "name": { "zh": "只用原片", "en": "Footage only", "ja": "素材映像のみ" }, "prompt": "Use only the footage: no text cards, infographics, charts or illustrations." },
        { "id": "some", "name": { "zh": "原片為主，偶爾穿插圖卡", "en": "Mostly footage, a card now and then", "ja": "映像中心、ときどき図解" }, "prompt": "Mostly footage, with a text card or graphic now and then (a few in the whole film)." },
        { "id": "mixed", "name": { "zh": "原片和圖文插圖交錯", "en": "Footage and graphics in turn", "ja": "映像と図解を交互に" }, "prompt": "Alternate footage with graphic inserts (text cards, infographics, charts, illustrations) through the film." },
        { "id": "graphics", "name": { "zh": "以圖文動畫為主", "en": "Mostly animated graphics", "ja": "図解アニメ中心" }, "prompt": "Mostly animated text and graphics; footage is optional and may be little or none." }
      ] },
    { "id": "opening", "group": { "zh": "結構", "en": "Structure", "ja": "構成" },
      "name": { "zh": "開頭", "en": "Opening", "ja": "冒頭" },
      "options": [
        { "id": "result", "name": { "zh": "先給結果", "en": "Result first", "ja": "結果から" }, "prompt": "Open on the result or the best moment, then go back to how it got there." },
        { "id": "question", "name": { "zh": "問句鉤子", "en": "A question", "ja": "問いかけ" }, "prompt": "Open with a question on screen that the film then answers." },
        { "id": "title", "name": { "zh": "標題卡", "en": "Title card", "ja": "タイトル" }, "prompt": "Open with a title card naming the film." },
        { "id": "straight", "name": { "zh": "直接開始", "en": "Straight in", "ja": "いきなり本編" }, "prompt": "Start straight into the footage, with no title or hook text." }
      ] },
    { "id": "ending", "group": { "zh": "結構", "en": "Structure", "ja": "構成" },
      "name": { "zh": "結尾", "en": "Ending", "ja": "締め" },
      "options": [
        { "id": "cta", "name": { "zh": "行動呼籲（追蹤、留言）", "en": "Call to action (follow, comment)", "ja": "フォロー・コメントの呼びかけ" }, "prompt": "End with a call to action on screen (follow, comment)." },
        { "id": "info", "name": { "zh": "資訊卡", "en": "Info card", "ja": "情報カード" }, "prompt": "End on an info card with the place, time, price or link, only as the material has them." },
        { "id": "best", "name": { "zh": "停在最好的畫面", "en": "Hold the best shot", "ja": "一番いい場面で止める" }, "prompt": "End on the best shot and hold it." },
        { "id": "fade", "name": { "zh": "淡出", "en": "Fade out", "ja": "フェードアウト" }, "prompt": "End with a fade out." }
      ] },
    { "id": "voice", "group": { "zh": "聲音", "en": "Sound", "ja": "音" },
      "name": { "zh": "旁白", "en": "Voice", "ja": "ナレーション" },
      "options": [
        { "id": "original", "name": { "zh": "原音", "en": "Original", "ja": "元の音声" }, "prompt": "Keep the footage's own sound and speech; no voice-over." },
        { "id": "tts", "name": { "zh": "AI 配音", "en": "AI voice", "ja": "AI 音声" }, "prompt": "Write a voice-over and make it with TTS." },
        { "id": "none", "name": { "zh": "無", "en": "None", "ja": "なし" }, "prompt": "No voice-over and no speech: music and sound effects only." }
      ] },
    { "id": "music", "group": { "zh": "聲音", "en": "Sound", "ja": "音" },
      "name": { "zh": "配樂", "en": "Music", "ja": "音楽" },
      "options": [
        { "id": "none", "name": { "zh": "無", "en": "None", "ja": "なし" }, "prompt": "No music." },
        { "id": "soft", "name": { "zh": "輕柔", "en": "Soft", "ja": "やさしい" }, "prompt": "Soft, gentle music." },
        { "id": "upbeat", "name": { "zh": "輕快", "en": "Upbeat", "ja": "軽快" }, "prompt": "Upbeat, light music." },
        { "id": "epic", "name": { "zh": "熱血", "en": "Epic", "ja": "熱い" }, "prompt": "Big, driving, epic music." },
        { "id": "warm", "name": { "zh": "溫馨", "en": "Warm", "ja": "あたたかい" }, "prompt": "Warm, heartfelt music." },
        { "id": "suspense", "name": { "zh": "懸疑", "en": "Suspense", "ja": "サスペンス" }, "prompt": "Tense, suspenseful music." }
      ] },
    { "id": "pace", "group": { "zh": "聲音", "en": "Sound", "ja": "音" },
      "name": { "zh": "節奏", "en": "Pace", "ja": "テンポ" },
      "options": [
        { "id": "slow", "name": { "zh": "慢", "en": "Slow", "ja": "ゆっくり" }, "prompt": "Slow cutting: shots of about 4–6 s." },
        { "id": "medium", "name": { "zh": "中", "en": "Medium", "ja": "ふつう" }, "prompt": "Medium cutting: shots of about 2–4 s." },
        { "id": "fast", "name": { "zh": "快", "en": "Fast", "ja": "速い" }, "prompt": "Fast cutting: shots of about 1–2 s, on the beat." }
      ] },
    { "id": "captions", "group": { "zh": "文字", "en": "Text", "ja": "文字" },
      "name": { "zh": "字幕", "en": "Captions", "ja": "字幕" },
      "options": [
        { "id": "none", "name": { "zh": "無", "en": "None", "ja": "なし" }, "prompt": "No captions for speech." },
        { "id": "full", "name": { "zh": "全字幕", "en": "Full", "ja": "全文" }, "prompt": "Caption all speech, line by line." },
        { "id": "keywords", "name": { "zh": "關鍵字大字", "en": "Big keywords", "ja": "キーワード" }, "prompt": "Only big captions for the key words of the speech." }
      ] },
    { "id": "caption-lang", "group": { "zh": "文字", "en": "Text", "ja": "文字" },
      "name": { "zh": "字幕語言", "en": "Text language", "ja": "字幕の言語" },
      "options": [
        { "id": "zh", "name": { "zh": "繁體中文", "en": "Traditional Chinese", "ja": "繁体字中国語" }, "prompt": "Text on screen in Traditional Chinese." },
        { "id": "en", "name": { "zh": "英文", "en": "English", "ja": "英語" }, "prompt": "Text on screen in English." },
        { "id": "ja", "name": { "zh": "日文", "en": "Japanese", "ja": "日本語" }, "prompt": "Text on screen in Japanese." }
      ] },
    { "id": "library", "group": { "zh": "製作", "en": "Making", "ja": "制作" },
      "name": { "zh": "特效", "en": "Effects", "ja": "エフェクト" },
      "hint": { "zh": "全部現做：不用積木庫裡現成的特效、配樂風格和音效，每一樣都為這支片新寫。比較獨特，但比較花時間和費用。", "en": "All made new: none of the library's ready-made effects, music styles or sounds; everything is written for this film. More its own, but takes longer and costs more.", "ja": "すべて新規作成：ブロックライブラリの既製エフェクト・音楽スタイル・効果音を使わず、この動画のためにすべて新しく作ります。個性は出ますが、時間と費用がかかります。" },
      "options": [
        { "id": "library", "name": { "zh": "用積木庫", "en": "Library", "ja": "ライブラリ" }, "prompt": "Use the shared blocks (common.*) and library music styles where they fit, as usual." },
        { "id": "none", "name": { "zh": "全部現做", "en": "All new", "ja": "すべて新規" }, "prompt": "No library: use no shared block (common.*), no c.recipe(...), no built-in or library music style and nothing from score-library/; write every effect, music style and synthesised sound as this project's own (fx modules, a project score style, c.sfxFile). Avoid the Cut methods that quietly add common blocks, or pass your own type: c.panel, polaroids, censorSpeech's defaults, c.voiceCaptions (pass { type: 'fx.xxx' }), c.sfx('common.*'). Outside assets are allowed. When done, project.json must contain no \"common.\"." }
      ] }
  ],
  "examples": [
    { "zh": "復古底片感，暖色調，畫面帶一點顆粒", "en": "Retro film look, warm tones, a little grain", "ja": "レトロなフィルム風、暖色、少し粒子感" },
    { "zh": "黑底白字，大字一個一個浮現，很安靜", "en": "White on black, big words appearing one by one, very quiet", "ja": "黒地に白文字、大きな文字が一つずつ浮かぶ静かな雰囲気" },
    { "zh": "日系清新：低對比、大量留白、細字體", "en": "Fresh Japanese look: low contrast, lots of white space, thin type", "ja": "日本風の爽やかさ：低コントラスト、たっぷりの余白、細い書体" },
    { "zh": "快節奏：每 2 秒換一個畫面，字幕跳出來", "en": "Fast: a new shot every 2 seconds, captions popping in", "ja": "速いテンポ：2 秒ごとに場面転換、字幕が飛び出す" },
    { "zh": "紀錄片口吻，旁白沉穩，配樂低調", "en": "Documentary tone, a calm narrator, understated music", "ja": "ドキュメンタリー調、落ち着いたナレーション、控えめな音楽" },
    { "zh": "可愛手繪風，加貼紙和塗鴉框", "en": "Cute hand-drawn style with stickers and doodle frames", "ja": "かわいい手描き風、ステッカーと落書きフレーム" },
    { "zh": "電影感：上下黑邊、慢動作、大氣配樂", "en": "Cinematic: letterbox bars, slow motion, sweeping music", "ja": "映画風：上下の黒帯、スローモーション、壮大な音楽" },
    { "zh": "極簡科技感：深色底、霓虹線條、等寬字", "en": "Minimal tech: dark background, neon lines, monospace type", "ja": "ミニマルなテック感：暗い背景、ネオンの線、等幅フォント" }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Whatever the user did not set: decide from the material and what the user says.
