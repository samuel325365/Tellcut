---
{
  "order": 6,
  "color": "#d6336c",
  "name": { "zh": "紀念影片", "en": "Celebration Film", "ja": "記念ムービー" },
  "summary": {
    "zh": "把婚禮、生日、畢業或送別的照片和影片，剪成能在現場或分享時播放的溫暖紀念影片。",
    "en": "Turns photos and clips from a wedding, birthday, graduation or farewell into a warm film to play on the day or share afterwards.",
    "ja": "結婚式や誕生日、卒業、送別の写真と動画を、その場や共有で流せる温かい記念ムービーにします。"
  },
  "fit": {
    "zh": ["婚禮、生日、畢業、送別的照片和影片，要在現場或分享時播", "有祝福的話或旁白更好"],
    "en": ["Photos and clips of a wedding, birthday, graduation or farewell, to play on the day or share", "Even better with messages of well-wishes or a voice-over"],
    "ja": ["結婚式・誕生日・卒業・送別の写真と動画（その場や共有で流す）", "お祝いのメッセージやナレーションがあるとさらに良い"]
  },
  "facts": {
    "zh": ["16:9 橫式或 9:16 直式", "1–4 分鐘", "照片和影片都行", "慢節奏、有情感起伏"],
    "en": ["16:9 landscape or 9:16 vertical", "1–4 min", "Photos or clips", "Slow pace with emotional build"],
    "ja": ["16:9 横型または 9:16 縦型", "1〜4 分", "写真でも動画でも", "ゆったりしたテンポで感情を盛り上げる"]
  },
  "length": [60, 240],
  "ratios": ["16:9", "9:16"],
  "genres": false,
  "sources": ["freesound", "incompetech"],
  "styles": [
    { "id": "frame",
      "name": { "zh": "翻老相簿", "en": "Old photo album", "ja": "古いアルバムをめくる" },
      "desc": { "zh": "形式｜像翻一本實體相簿：照片和影片一個個落進木相框、拍立得或老電視裡播放，可以翻到背面看手寫的話。", "en": "Form | Like leafing through a real album: photos and clips land one by one in wooden frames, polaroids or an old TV and play there, some turning over to a handwritten line.", "ja": "形式｜本物のアルバムをめくるように：写真や動画が木の額、ポラロイド、古いテレビに一つずつ収まって流れ、裏返すと手書きの言葉。" },
      "prompt": "Form: leafing through an old album. Every photo and clip lands in a physical frame (common.frame look photo; tv for old home video; polaroid for snapshots), dropping or sliding in and playing in its window (the main-track clip at frame: frameWindow(params, W, H)), now and then turning over to a short handwritten line on its back; one frame after another through the story. In 9:16 the window stays 4:5 or taller, so the picture still fills most of the frame." },
    { "id": "postcard",
      "name": { "zh": "明信片祝福", "en": "Postcards of wishes", "ja": "絵はがきのお祝い" },
      "desc": { "zh": "形式｜每個人的祝福是一張明信片：話一字字手寫上去，郵戳蓋上日期，窗格播那個人的照片或影片；最後整疊攤開。", "en": "Form | Each person's wish is a postcard: the words handwritten, the date postmarked, their photo or clip in the card's window; the pile spreads out at the end.", "ja": "形式｜一人ひとりのお祝いが絵はがきに：言葉を手書きし、消印に日付、窓にはその人の写真や動画。最後に束が広がる。" },
      "prompt": "Form: each wish is a postcard with common.postcard: the guest's words handwritten line by line (lines), the postmark with the place and date of the day (place, date, markAt), their photo or clip playing in the card's window (live; the main-track clip at frame: postcardWindow(orient)), the cards landing on the pile (pile); the pile spreads out at the end (spread). Wishes are the user's real words, or kept short and general." },
    { "id": "timeline",
      "name": { "zh": "年表回顧", "en": "Through the years", "ja": "年表でふり返る" },
      "desc": { "zh": "形式｜年份一格格往前跳，每一年放那年的照片，從小時候一路走到今天。", "en": "Form | The years tick forward one by one, each with that year's photos, from childhood to today.", "ja": "形式｜年が一つずつ進み、その年の写真が現れる。子どもの頃から今日まで。" },
      "prompt": "Form: a timeline of years. common.meter look: 'band' (the year counting up on an era band, the stage of life as its stage name) ticks forward through the film, the photos and clips of each year appearing in turn; today last. Years only where the photos really date from." },
    { "id": "memories",
      "name": { "zh": "N 年前的今天", "en": "On this day", "ja": "○年前の今日" },
      "desc": { "zh": "形式｜手機跳出一張「N 年前的今天」回憶卡，點開後一路是從小到大的照片和影片。16:9 時畫面中間是一支手機。", "en": "Form | The phone shows an \"on this day, N years ago\" memory; tap it and the photos and clips run from childhood to now. At 16:9 a phone stands in the middle.", "ja": "形式｜スマホに「○年前の今日」の思い出カード。タップすると子どもの頃から今までの写真と動画が続く。16:9 では中央にスマホ。" },
      "prompt": "Form: an on-this-day memory on a phone with common.album: mode foryou opens a memory card (N years ago today) into the story; mode grid with the stills grouped by year (# year groups), tapping into the clips that matter (common.touch at albumTile, mode zoom, mode viewer); a fast montage of the best moments near the end. At 16:9 the phone stands in the middle (device auto). Generic phone UI, no real brand marks." },
    { "id": "group-chat",
      "name": { "zh": "家族群組祝福", "en": "Group chat of wishes", "ja": "グループチャットのお祝い" },
      "desc": { "zh": "形式｜家族或同學群組裡，大家一則則傳祝福、老照片、語音和影片；最後是主角的回覆。生日、送別特別適合。16:9 時畫面中間是一支手機。", "en": "Form | In a family or class group chat, one person after another sends a wish, an old photo, a voice note, a clip; the guest of honour replies at the end. Made for birthdays and farewells. At 16:9 a phone stands in the middle.", "ja": "形式｜家族や同級生のグループで、次々にお祝い・昔の写真・ボイス・動画が届き、最後に主役の返信。誕生日や送別にぴったり。16:9 では中央にスマホ。" },
      "prompt": "Form: a family or class group chat with common.chat: one person after another sends a wish, an old photo, a voice note, a clip in a video bubble (play=s-s, the main-track clip at frame: chatWindow(params, message, width, height)); sys pills mark the years or chapters; the clip that matters most opens to full screen; the guest of honour's reply at the end. Wishes are the user's real words, or kept short and general; never invent names or memories. At 16:9 the phone stands in the middle (device auto). Sounds common.send / common.recv. Generic chat UI, no real app's colours or marks." },
    { "id": "magazine",
      "name": { "zh": "生日特刊", "en": "Special issue", "ja": "特別号" },
      "desc": { "zh": "形式｜一本為主角做的雜誌：封面是主角，內頁是人生的各個階段，每頁一句愛他的人說的話，封底是祝福。", "en": "Form | A magazine made for the guest of honour: they are the cover, the pages are the stages of their life with one line from someone who loves them, the back cover holds the wishes.", "ja": "形式｜主役のための一冊の雑誌：表紙は主役、ページは人生の各段階で、愛する人の一言を添えて、裏表紙はお祝い。" },
      "prompt": "Form: a special issue about the guest of honour with common.magazine, the footage in the page window (clip frame = magazineWindow(params)): layout cover with their best photo and the occasion as the masthead, feature pages for the stages of their life (a kicker, a headline, one quote from someone who loves them), layout back with the wishes; turn the pages with common.wipe mode curl. A headline and one line per page." },
    { "id": "slow-title",
      "name": { "zh": "電影片頭片尾", "en": "Film titles and credits", "ja": "映画のタイトルとクレジット" },
      "desc": { "zh": "形式｜像一部電影：開頭放主角名字的明體標題，中間滿版播放，結尾像電影一樣慢慢列出感謝名單。配電影感調色最好。", "en": "Form | Like a film: an elegant name title at the start, the story full-frame, and slow thank-you credits at the end. Best with the cinematic look.", "ja": "形式｜一本の映画のように：冒頭に主役の名前の明朝体タイトル、本編は全画面、最後に映画のようなゆっくりした感謝のクレジット。シネマティックな色調と好相性。" },
      "prompt": "Form: told as a film. An elegant name title at the start (common.headline look: 'name': the name as text, the occasion as sub, e.g. SWEET SIXTEEN), the story full-frame in between, and slow thank-you credits at the end (common.outro look: 'credits': one line a beat; *a line in stars* is an italic heading, _a line in underscores_ a small credit such as the music)." },
    { "id": "dissolves",
      "name": { "zh": "慢溶接", "en": "Slow dissolves", "ja": "ゆっくりディゾルブ" },
      "desc": { "zh": "剪法｜跟著音樂的樂句慢慢溶接，照片停 3–5 秒、慢慢推近或平移。現場播放的版本最適合。", "en": "Cut | Slow dissolves on the phrases of the music, photos held 3–5 s with a slow push or pan. Best for the version played at the venue.", "ja": "編集｜音楽のフレーズに合わせてゆっくりディゾルブ、写真は 3〜5 秒、ゆっくり寄るかパン。会場で流す版に最適。" },
      "prompt": "Cut: slow dissolves on the phrases of the music, not on every beat; photos hold 3 to 5 s with a slow push or pan; the cuts quicken only as the film builds to its peak." },
    { "id": "photo-dump",
      "name": { "zh": "照片卡點輪播", "en": "Photo dump on the beat", "ja": "ビートに合わせた写真ダンプ" },
      "desc": { "zh": "剪法｜照片每拍換一張，白閃、白框、日期印記。適合給大家分享的 9:16 短版。", "en": "Cut | Photos change on every beat, with a flash, a white border and a date stamp. Good for a 9:16 short version to share.", "ja": "編集｜写真がビートごとに替わり、白フラッシュ、白枠、日付。みんなで共有する 9:16 の短い版向き。" },
      "prompt": "Cut: a photo dump on the beat. Photos and very short clips, 0.5 to 2.5 s each, changing on the beat; each photo snapping in with common.snap (flash, white border, the date stamp); the strongest first, the most moving last. For the short 9:16 version, or one lively stretch of a longer film." },
    { "id": "polaroid",
      "name": { "zh": "定格拍立得", "en": "Polaroid freeze", "ja": "ポラロイドで静止" },
      "desc": { "zh": "點綴｜珍貴的瞬間定格成拍立得，下面手寫一句話。", "en": "Accent | Precious moments freeze into polaroids with a handwritten line.", "ja": "アクセント｜大切な瞬間をポラロイドに、下に手書きの一言。" },
      "prompt": "Accent: freeze precious moments as polaroids (common.polaroid) with a short handwritten line." },
    { "id": "cinematic",
      "name": { "zh": "電影感調色", "en": "Cinematic grade", "ja": "シネマティックな色調" },
      "desc": { "zh": "調色｜整支片一種溫暖的調色，輕微顆粒和暗角，可加上下黑邊。", "en": "Look | One warm grade for the whole film, light grain and vignette, optional letterbox.", "ja": "色調｜全編ひとつの温かい色調、軽い粒子と周辺減光、上下の黒帯も可。" },
      "prompt": "Look: a cinematic grade over the whole film. One common.tone (one warm colour and edge for the whole film) and light grain with common.film (look grain, blend overlay, grain about 0.07), optionally letterbox 2.39 at 16:9." },
    { "id": "retro",
      "name": { "zh": "復古家庭錄影", "en": "Home video", "ja": "昔のホームビデオ" },
      "desc": { "zh": "調色｜像爸媽那台攝影機拍的：掃描線、偏暖、日期印記。小時候的家庭錄影帶最適合。", "en": "Look | Like the family camcorder: scanlines, a warm cast, a date stamp. Perfect for childhood home videos.", "ja": "色調｜家族のビデオカメラのように：走査線、暖かい色かぶり、日付。子どもの頃のホームビデオにぴったり。" },
      "prompt": "Look: a home-video look. common.film look vhs (scanlines, a warm cast, lifted blacks, tracking noise at the cuts between years) with common.camcorder mode osd (the date stamp from the capture dates); best on the childhood part, and the present day may return to a clean picture. With an interface form only the common.film part applies: no viewfinder over an interface. Keep the live sound." },
    { "id": "film",
      "name": { "zh": "底片", "en": "Film stock", "ja": "フィルム" },
      "desc": { "zh": "調色｜像沖洗出來的照片：暖色、底片顆粒、柔和的暗角。", "en": "Look | Like printed photos: warm, with film grain and a soft vignette.", "ja": "色調｜プリントした写真のように：暖かく、フィルムの粒子とやわらかな周辺減光。" },
      "prompt": "Look: film stock over the whole film: a warm common.tone and film grain with a soft vignette (common.film look grain), like printed photos." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: a warm celebration film that people watch together, on the day or when shared later.
- Ask or infer the ratio: 16:9 for a screen at the venue, 9:16 for phones. 1–4 min.
- The styles are of four kinds, and their prompts begin with the kind. Form (frame, postcard, timeline, memories, group-chat, magazine, slow-title) carries the whole film: at most one form; if the user picks two, the first is the form and the second only lends its opener or ending; say so in one sentence. Cut and Accent go with any form. Look: at most one, the same grade for the whole film.
- No form picked: the photos and clips full-frame with slow dissolves, a name title at the start and a calm ending.
- Phone forms (memories, group-chat) at 16:9 stand a phone in the middle of the frame; that is fine.
- Photos hold 3–5 s with a slow push or pan; clips keep their natural sound, and the moments that matter (the surprise, a toast, the song, a wish said out loud) play at full volume with the music ducked and the words captioned. Never music alone from start to end: let at least one human voice through.
- Give it an emotional arc: open quietly with the guest of honour, then build (early life or the story so far, the people, the day itself), keep the peak near the end and finish on a calm, happy image.
- Vary the length of the shots; cut on the phrase of the music, not every beat.
- Text is names, dates and short wishes, large and readable from the back of a room; over light skies or photos give it a shadow or a backing. No info cards; never invent names, dates or memories.
- In 9:16, footage inside a frame or window still fills most of the frame (a 4:5 or taller window), never a small picture in a big background.
- Never crop faces at the edge.
