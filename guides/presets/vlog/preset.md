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
  "genres": false,
  "sources": ["freesound", "incompetech"],
  "styles": [
    { "id": "planner",
      "name": { "zh": "手帳日記", "en": "Planner diary", "ja": "手帳の日記" },
      "desc": { "zh": "形式｜整支片是一頁手帳：牛皮紙底，影片用紙膠帶貼上去，旁邊手寫時間和心情，一天的每個段落翻一頁。", "en": "Form | The film is a planner page: kraft paper, each clip taped on, the time and a mood handwritten beside it, a new page for each part of the day.", "ja": "形式｜全編が手帳の一ページ：クラフト紙に動画をマスキングテープで貼り、横に時間と気分を手書き。一日の区切りごとにページをめくる。" },
      "prompt": "Form: the day as a planner page. common.paper (kraft paper, a tilted lined card, pencil doodles) under the whole film; each scene's clip sits on it as a taped panel (c.panel, a 4:5 or taller window, so the footage still fills most of the frame); its time and place on a common.tag look: 'day' label; a short line written by hand beside it (common.handwrite); a fresh page for each part of the day (morning, afternoon, night)." },
    { "id": "notifications",
      "name": { "zh": "通知串成一天", "en": "A day of notifications", "ja": "通知でつづる一日" },
      "desc": { "zh": "形式｜手機通知串起一天：鬧鐘、通勤提醒、朋友訊息、晚上「今天走了 8,000 步」；每跳一則，桌布就換成那個時間拍的畫面。", "en": "Form | Phone notifications carry the day: the alarm, a commute reminder, a friend's message, \"8,000 steps today\" at night; with each one the wallpaper becomes the footage of that hour.", "ja": "形式｜スマホの通知が一日をつなぐ：アラーム、通勤の通知、友だちのメッセージ、夜の「今日は 8,000 歩」。通知のたびに壁紙がその時間の映像に。" },
      "prompt": "Form: the whole film runs on the day's phone notifications. common.lockscreen with the clip as its wallpaper and its clock following the capture times, common.notify on top (y 0.43) pushing one notification at each turn of the day: the alarm, a reminder on the way, a friend's message, a step count or a photo count at night. With each new one the wallpaper cuts to the footage of that hour, full-frame under one or two cards at most. Written from the footage's real times and what happens; never invent people or places. Sounds common.buzz / common.recv. Generic UI, no real brand marks." },
    { "id": "chat",
      "name": { "zh": "跟朋友報告今天", "en": "Telling a friend", "ja": "友だちに今日を報告" },
      "desc": { "zh": "形式｜一整天傳訊息跟朋友報告：影片、照片、語音一則則傳出去，朋友的回覆負責笑點，最精彩的一刻從泡泡放大成全螢幕。", "en": "Form | Messaging a friend through the day: clips, photos and voice notes go out one by one, the friend's replies bring the jokes, the best moment opens from its bubble to full screen.", "ja": "形式｜一日じゅう友だちにメッセージで報告：動画・写真・ボイスメッセージを次々送り、友だちの返信が笑いどころ。いちばんの瞬間は吹き出しから全画面に。" },
      "prompt": "Form: the day told to one friend in common.chat: clips in video bubbles (play=s-s, the main-track clip at frame: chatWindow(params, message, width, height)), photos and voice notes as the day goes; the friend's short replies carry the jokes (the typing dots, a left-on-read); the wallpaper shifts with the time of day; the best moment opens from its bubble to full screen and back. Short lines from what the footage shows; never more than two made-up quips in a row. Taps with common.touch at chatPoint; sounds common.send / common.recv / common.typing. Generic chat UI, no real app's colours or marks." },
    { "id": "album",
      "name": { "zh": "今天的相簿", "en": "Today's album", "ja": "今日のアルバム" },
      "desc": { "zh": "形式｜睡前滑今天的相簿：點開一張就播那段影片，左右滑到下一段；最後一張「今天的回憶」卡點開變成快剪。", "en": "Form | Scrolling today's album at night: tap a photo and its clip plays, swipe to the next; a \"today\" memory card at the end opens into a fast montage.", "ja": "形式｜寝る前に今日のアルバムを見返す：写真をタップすると動画が流れ、スワイプで次へ。最後は「今日の思い出」カードが開いてモンタージュに。" },
      "prompt": "Form: the day as a phone photo-album screen recording with common.album: mode grid with today's stills grouped by part of the day, a tap (common.touch at albumTile) and mode zoom open a tile to full screen, the clip plays under mode viewer, mode swipe to the next; vary the rhythm with runs of swipes; close with a foryou memory card that opens into a fast montage of the day. Sounds common.tick / common.whoosh. Generic phone UI, no real brand marks." },
    { "id": "silent",
      "name": { "zh": "安靜 vlog", "en": "Silent vlog", "ja": "しゃべらない Vlog" },
      "desc": { "zh": "剪法｜沒有人講話，字幕就是旁白（一行一條紙條）；放大日常的聲音：倒咖啡、翻書、鍵盤聲，節奏慢、氣氛溫暖。", "en": "Cut | Nobody talks: the captions are the narration, one paper strip at a time; the everyday sounds up front (coffee pouring, pages, keys), slow and warm.", "ja": "編集｜誰も話さない：字幕がナレーション（一行ずつの紙片）。コーヒーを注ぐ音、ページ、キーボードなど日常の音を大きく、ゆっくり温かく。" },
      "prompt": "Cut: a silent vlog. Nobody speaks; the captions are the narration, one short line at a time on paper strips (common.caption style: 'strip'); the everyday sounds up front (coffee pouring, pages turning, keys), soft music under them; a slow, warm pace. When the footage has talking, keep only what works as a caption line." },
    { "id": "photo-dump",
      "name": { "zh": "照片卡點輪播", "en": "Photo dump on the beat", "ja": "ビートに合わせた写真ダンプ" },
      "desc": { "zh": "剪法｜照片和很短的片段每拍換一張，白閃、白框、底片日期印記，最喜歡的一兩刻定格成拍立得。", "en": "Cut | Photos and very short clips change on every beat, with a flash, a white border and a film date stamp; the one or two favourite moments freeze into a polaroid.", "ja": "編集｜写真やごく短いクリップがビートごとに替わり、白いフラッシュ、白枠、フィルムの日付。お気に入りの瞬間はポラロイドに。" },
      "prompt": "Cut: a photo dump on the beat. 5 to 20 photos and very short clips, 0.5 to 2.5 s each, changing on the beat; each photo snapping in with common.snap (flash, white border, the camera date stamp from the capture date); the strongest first, the most conclusive last; little text, deliberately casual. Best as one stretch of the day, not the whole film." },
    { "id": "transitions",
      "name": { "zh": "轉場串連", "en": "Transitions that move", "ja": "動きでつなぐトランジション" },
      "desc": { "zh": "剪法｜手遮鏡頭、甩鏡頭、形狀相似的畫面互接（match cut），重拍前加速、落拍放慢。", "en": "Cut | Hand over the lens, whip pans, match cuts between similar shapes, speeding up into the downbeat and slowing on it.", "ja": "編集｜手でレンズを隠す、カメラを振る、形の似た画面でつなぐマッチカット、強拍の前で加速して強拍で減速。" },
      "prompt": "Cut: every cut moves. Hand-over-lens, whip pans, match cuts on similar shapes or motion; speed ramps (faster into the downbeat, slow on it), an occasional white flash; never hold slow motion long. Find the cuttable moves in the footage first; where none fit, use a plain cut on the beat rather than forcing one." },
    { "id": "jump-cuts",
      "name": { "zh": "跳剪", "en": "Jump cuts", "ja": "ジャンプカット" },
      "desc": { "zh": "剪法｜把講話和動作之間的空檔剪掉，節奏更俐落。", "en": "Cut | The dead time between words and actions cut out, for a brisker pace.", "ja": "編集｜話や動作のあいだの間を切って、テンポよく。" },
      "prompt": "Cut: jump cuts: trim the pauses in talking (c.tighten) and the dead time between actions; keep the rhythm brisk, never cut inside a word." },
    { "id": "day-clock",
      "name": { "zh": "時間戳記", "en": "Time stamps", "ja": "タイムスタンプ" },
      "desc": { "zh": "點綴｜每個場景角落跳出時間，像一天的時間軸。", "en": "Accent | A clock time pops up in a corner of each scene, like a timeline of the day.", "ja": "アクセント｜各シーンの隅に時刻が出て、一日のタイムラインのように。" },
      "prompt": "Accent: a clock time (07:30, 12:10...) pops up in a corner of each scene as a planner label (common.tag look: 'day': the time as the first tag, the place or the weather handwritten as the second), building a timeline of the day; for a vlog over several days the first tag can be the day (Day 2)." },
    { "id": "handwritten-notes",
      "name": { "zh": "手寫便條", "en": "Handwritten notes", "ja": "手書きメモ" },
      "desc": { "zh": "點綴｜一句手寫的心情貼在畫面上，像日記。", "en": "Accent | One handwritten line of mood stuck on the frame, like a diary.", "ja": "アクセント｜手書きの一言を画面に貼る、日記のように。" },
      "prompt": "Accent: short handwritten notes stuck on the frame on strips of paper tape (common.tag look: 'tape'), like diary lines; at most one per scene. A spoken line kept as the voice of the film can be captioned on paper strips (common.caption style: 'strip')." },
    { "id": "polaroid",
      "name": { "zh": "定格拍立得", "en": "Polaroid freeze", "ja": "ポラロイドで静止" },
      "desc": { "zh": "點綴｜把一天裡最喜歡的瞬間定格成拍立得。", "en": "Accent | The favourite moment of the day freezes into a polaroid.", "ja": "アクセント｜一日でいちばん好きな瞬間をポラロイドに。" },
      "prompt": "Accent: freeze one favourite moment as a polaroid (common.polaroid) with a short handwritten line." },
    { "id": "cinematic",
      "name": { "zh": "電影感調色", "en": "Cinematic grade", "ja": "シネマティックな色調" },
      "desc": { "zh": "調色｜整支片一種柔和的調色，輕微顆粒和暗角，鏡頭偏慢。", "en": "Look | One soft grade for the whole film, light grain and vignette, slower shots.", "ja": "色調｜全編ひとつのやわらかな色調、軽い粒子と周辺減光、ゆったりしたショット。" },
      "prompt": "Look: a cinematic grade over the whole film. One common.tone for the whole film (one colour and one edge, soft and warm for daily life) and light grain with common.film (look grain, blend overlay, grain about 0.07); favour slow, steady shots; music plus the room's own sounds. On shaky phone footage keep it light." },
    { "id": "retro",
      "name": { "zh": "復古 DV", "en": "Retro camcorder", "ja": "レトロなビデオカメラ" },
      "desc": { "zh": "調色｜家用攝影機的樣子：掃描線、偏暖、雜訊帶，觀景窗有 ● REC 和日期；保留現場聲音。", "en": "Look | The home-camcorder look: scanlines, a warm cast, tracking noise, ● REC and the date in the viewfinder; keeps the live sound.", "ja": "色調｜家庭用ビデオカメラ風：走査線、暖かい色かぶり、トラッキングノイズ、ファインダーに ● REC と日付。現場の音を残す。" },
      "prompt": "Look: a home-camcorder look over the whole film. common.film look vhs (scanlines, a warm cast, lifted blacks, tracking noise bands at the cuts between parts of the day) with common.camcorder mode osd (REC, the tape counter, the date stamp from the capture dates); end on STOP. With an interface form (planner, notifications, chat, album) only the common.film part applies: no viewfinder over an interface. Keep the live sound under the music." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: a relaxed daily vlog for IG Reels, YouTube Shorts or X, with a clear start and end of the day.
- 9:16, 45–120 s.
- The styles are of four kinds, and their prompts begin with the kind. Form (planner, notifications, chat, album) carries the whole film: at most one form; if the user picks two, the first is the form and the second only lends its opener or ending; say so in one sentence. Cut and Accent go with any form. Look: at most one.
- No form picked: the footage full-frame, cut on the beat, with one or two accents that suit the material.
- The main character's voice carries it: their own talking or voice-over, or inner-voice captions when there is none.
- Give the day one thread (a small goal, a mood, a question) and at least one highlight moment; a list of events with no point is not a vlog.
- Hook in the first 2 s: the most charming moment, then rewind to the morning.
- Order by capture time; skip dull stretches, keep one or two shots per moment.
- Cut on the beat; light, warm music; keep any natural speech clear and duck the music under it.
- Text is a time, a place or a few words of mood; no info cards, and never invent people, places or what someone said.
- If the footage is already a finished vlog with talking to camera, keep one or two of the best spoken lines (captioned) as the voice of the film, and crop out its own burned-in titles.
- End by closing the loop: night, home, or a callback to the opening moment.
