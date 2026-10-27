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
  "sources": ["freesound", "incompetech"],
  "styles": [
    { "id": "polaroid",
      "name": { "zh": "定格拍立得", "en": "Polaroid freeze", "ja": "ポラロイド風の静止画" },
      "desc": { "zh": "珍貴的瞬間定格成拍立得，下面手寫一句話。", "en": "Precious moments freeze as polaroids with a handwritten line.", "ja": "大切な瞬間をポラロイドに定着し、手書きのひとことを添える。" },
      "prompt": "Freeze precious moments as polaroids (common.polaroid) with a short handwritten line." },
    { "id": "frame",
      "name": { "zh": "相框回憶", "en": "Framed memories", "ja": "フレームの思い出" },
      "desc": { "zh": "影片在相框或老電視裡播，像翻老相簿。", "en": "Clips play inside a photo frame or old TV, like leafing through an old album.", "ja": "フレームや古いテレビの中で映像が流れ、古いアルバムをめくるよう。" },
      "prompt": "Clips play inside a physical frame (common.frame): wooden photo frame or old TV, dropping or sliding in." },
    { "id": "postcard",
      "name": { "zh": "明信片祝福", "en": "Postcard wishes", "ja": "ポストカードのメッセージ" },
      "desc": { "zh": "祝福的話一字一字手寫在明信片上。", "en": "Well-wishes are handwritten word by word on a postcard.", "ja": "お祝いの言葉がポストカードに一文字ずつ手書きされる。" },
      "prompt": "Wishes handwritten word by word on a postcard (common.postcard), the photo showing in its window." },
    { "id": "timeline", "custom": true,
      "name": { "zh": "年表回顧", "en": "Timeline of years", "ja": "年表で振り返る" },
      "desc": { "zh": "年份一格格往前，照片依年代出現。", "en": "Years tick forward and photos appear in order.", "ja": "年が進み、写真が年代順に現れる。" },
      "prompt": "A timeline of years ticks forward; photos from each year appear in turn." },
    { "id": "slow-title", "custom": true,
      "name": { "zh": "名字片頭與片尾名單", "en": "Name title and credits", "ja": "名前のタイトルとクレジット" },
      "desc": { "zh": "開頭放主角的名字，結尾像電影一樣列出感謝名單。", "en": "The guest of honour's name opens it, and thank-you credits roll at the end.", "ja": "冒頭に主役の名前、最後は映画のようにお礼のクレジットを流す。" },
      "prompt": "An elegant name title at the start and slow thank-you credits at the end." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: a warm celebration film that people watch together, on the day or when shared later.
- Ask or infer the ratio: 16:9 for a screen at the venue, 9:16 for phones. 1–4 min.
- Photos hold 3–5 s with a slow push or pan; clips keep their natural sound, and the moments that matter (the surprise, a toast, the song, a wish said out loud) play at full volume with the music ducked and the words captioned.
- Open quietly with the guest of honour, then build: early life or the story so far, the people, the day itself.
- Cut on the phrase of the music, not every beat; slow dissolves are fine here.
- Text is names, dates and short wishes, large and readable from the back of a room; over light skies or photos give it a shadow or a backing.
- In 9:16, footage inside a frame or window still fills most of the frame (a 4:5 or taller window), never a small picture in a big background.
- Never crop faces at the edge; keep the emotional peak near the end and finish on a calm, happy image.
- Styles the user picked are listed below; if none, choose 1–2 that suit the material.
