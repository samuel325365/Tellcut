---
{
  "order": 7,
  "color": "#1f7a5c",
  "name": { "zh": "品牌形象片", "en": "Brand Film", "ja": "ブランドムービー" },
  "summary": {
    "zh": "只要商標和一段介紹文字，就能做出有 3D 和實拍畫面的品牌形象片；有自己的影片或照片更好。",
    "en": "A brand film with 3D and real footage from just a logo and a paragraph about the company; even better with your own footage or photos.",
    "ja": "ロゴと会社紹介の文章だけで、3D と実写映像のブランドムービーに。自社の映像や写真があればさらに◎。"
  },
  "fit": {
    "zh": ["商標檔（SVG 最好，PNG、JPG 也可以）和一段公司介紹", "有自己拍的影片或照片、官網網址更好"],
    "en": ["A logo file (SVG is best; PNG or JPG work too) and a paragraph about the company", "Even better with your own footage or photos, and the website address"],
    "ja": ["ロゴファイル（SVG が最適、PNG や JPG も可）と会社紹介の文章", "自社で撮った映像や写真、ウェブサイトの URL があればさらに◎"]
  },
  "facts": {
    "zh": ["16:9 橫式", "45–90 秒", "承諾 → 能力 → 證明 → 我們是 → 商標", "實拍＋3D"],
    "en": ["16:9 landscape", "45–90 s", "Promise → what we do → proof → we are → logo", "Real footage + 3D"],
    "ja": ["16:9 横型", "45〜90 秒", "約束 → できること → 実績 → 私たちは → ロゴ", "実写＋3D"]
  },
  "length": [45, 90],
  "ratios": ["16:9"],
  "sources": ["pixabay", "freesound"],
  "styles": [
    { "id": "real-3d",
      "name": { "zh": "實拍＋3D", "en": "Real footage + 3D", "ja": "実写＋3D" },
      "desc": { "zh": "實拍畫面和為這家公司設計的 3D 畫面交錯，用 3D 畫框推拉無縫轉場，最後是立體商標。", "en": "Real footage interleaved with 3D made for this company, seamless 3D frame pushes between them, a 3D logo to end.", "ja": "実写と、この会社のためにデザインした 3D を交互に。3D フレームの寄り引きでつなぎ、最後は立体ロゴ。" },
      "prompt": "Real footage + 3D (the default when no style is picked): the brand recipe with style: 'real-3d', and a scene: 3D designed for this company between the wall and what they do (an fx with three: true built from its own product or process, never another company's scenes renamed); footage and 3D meet only with c.dolly, the film ends on common.logo." },
    { "id": "cinemascope",
      "name": { "zh": "電影寬銀幕", "en": "Cinemascope", "ja": "シネマスコープ" },
      "desc": { "zh": "2.39 黑邊、暖調、襯線字和左下角加寬字距的小標，像電影預告。", "en": "2.39 bars, a warm grade, serif type and a small spaced-out label bottom-left, like a film trailer.", "ja": "2.39 の黒帯、暖色の色調、セリフ体と左下の字間を広げた小見出し。映画の予告編のように。" },
      "prompt": "Cinemascope: the brand recipe with style: 'cinemascope' (common.film with letterbox: 2.39 for the whole film, lines raised above the bottom bar), a warmer common.tone via c.update, serif display type (Playfair Display or Cormorant Garamond via c.theme fonts.display and the headlines' font), the sub line as a spaced-out kicker. Keep every word and tag you add yourself in the picture between the bars." },
    { "id": "voiceover",
      "name": { "zh": "旁白", "en": "Voice-over", "ja": "ナレーション" },
      "desc": { "zh": "合成語音唸出宣言，一句一停，配樂在旁白下自動壓低。不選就只用配樂。", "en": "A synthetic voice reads the manifesto line by line, the music ducking under it. Without it, music only.", "ja": "合成音声が宣言を一文ずつ読み上げ、音楽はナレーションの下で自動的に下がる。選ばなければ音楽だけ。" },
      "prompt": "Voice-over: read the manifesto with npm run voice, one sentence then a pause, in the film's language; the spoken lines are the on-screen lines said aloud, not a second script; the music ducks under it." },
    { "id": "globe",
      "name": { "zh": "據點地球", "en": "Globe of places", "ja": "拠点の地球" },
      "desc": { "zh": "點陣地球標出產地、據點和出貨路線，弧線從產地長向據點。", "en": "A dotted globe with origins, the home base and shipping routes, arcs growing towards home.", "ja": "ドットの地球に産地、拠点、出荷ルート。弧が産地から拠点へ伸びる。" },
      "prompt": "Globe of places: one common.globe beat for origins, the home base and routes, using only places the user's text names (assets data countries or maps for coordinates). With no places in the text, do not make a globe: leave it out and say so in one sentence." },
    { "id": "social-cut",
      "name": { "zh": "另剪 15 秒社群版", "en": "Plus a 15 s social cut", "ja": "15 秒の SNS 版も" },
      "desc": { "zh": "主片之外，再剪一支 15 秒的 9:16 版本給社群用。", "en": "Besides the film, a 15-second 9:16 version for social media.", "ja": "本編に加えて、SNS 用の 15 秒・9:16 版も作る。" },
      "prompt": "After the main film, also make a 15 s 9:16 social cut as a second project: the promise in one line, the strongest shot or 3D beat, the logo." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: goodwill for a company, shop or product, made from what most users have: a logo, one paragraph about the company, maybe a website address. 16:9, 45–90 s.

- **Start from the brand recipe**: `npm run tellcut -- recipe brand` prints its content; fill it in cut.ts with `c.recipe('brand', { … })`. It lays the five parts on the bars of cinematic music at 80 BPM (the hook over everyday shots, a wall of photos with a number that counts up, what they do with a dolly into the first shot and glass tags, the proof over a turning ball, "we are" with a dolly out, the 3D logo landing on the music's peak), shapes the music's level and places the sounds. Then add this company's own 3D scene as `scene` and fine-tune with `c.update`; do not rebuild by hand what the recipe already does, and do not change the music style unless the user asks.
- **The five parts**: the promise or the problem over everyday life; what they do, 3–5 beats, one line each; the proof, using only numbers and facts that are in the user's own text (with none, give `proof: []` and the part is left out, never invent one); "We are …" (in the film's language); the logo, the tagline and the website address exactly as the user wrote it.
- **The material decides the middle.** The user's own footage first (3D only as wrapping: common.wall, c.dolly, common.logo; Pixabay only for missing shots). Only photos: the photos first, then Pixabay or 3D. Nothing: Pixabay real footage interleaved with 3D designed for this company, never the whole middle in 3D.
- **Footage: search widely before writing the copy.** List the shot each line needs, then run assets search for each (English keywords, --kind video --ratio 16:9) and look at the contact sheets; a line with no fitting shot is cut from the copy or told in 3D instead. A 60 s film needs **at least 12 distinct clips**: no shot twice, a source at most twice (in-points 3 s or more apart). The recipe itself only refuses fewer distinct sources than hook lines plus beats (and says how many more to find), so count the 12 yourself. Prefer people at a distance, hands at work, everyday life, warm light; look at each chosen clip's frames.
- **Wall photos**: `npm run tellcut -- assets search <subject> --kind image` for 30–40 photos on the company's subject, then `assets get` them in one call (several refs at once). They are the tiles of the wall and the proof's ball (the recipe's `wall.tiles`), never the main clips.
- **The logo first**: npm run tellcut -- logo <id> <file> --name "<the company name>", then look at its two previews; use its first colour as c.theme palette.accent. No logo file: common.logo with the name only (the recipe's `logo.file` left out).
- **Footage and 3D meet only through c.dolly** (the recipe puts one in before the first beat and one out after "we are"); check every handoff with npm run tellcut -- seams <id>.
- **3D made for this company**: the `scene` is this company's own (its product, its process, its place), written as an fx with three: true; common.wall (the pictures of the film) and common.globe (origins, only with places in the text) are the shared 3D beats. Two companies must not get the same film with the words changed.
- **People**: no shot that makes a recognisable person look like they endorse the brand (the Pixabay licence forbids it); prefer hands, backs, distance, soft focus.
- **Check Pixabay clips frame by frame**: soft focus, exposure jumps, a sudden dark end; pick in-points by brightness. Avoid clips the search marks as AI-generated (in the detail line) for close-ups.
- **Words**: one line a beat, never a paragraph on screen; the recipe sets lines as common.headline with look: 'brand' (bottom-left, from a blur), big numbers with look: 'proof', small facts as common.tag with look: 'glass'. Inter for Latin text, Noto Sans TC for Chinese.
- **Picture budget for this preset**: about 25 pictures (the contact sheets of several searches, the logo previews, a few frames of the chosen clips and of the finished cut). The searches are what makes the film; spend the pictures there, not on looking again at the same thing.
- **Report** which beats use the user's footage, Pixabay or 3D, each marked library / tuned / new as the workflow asks.
