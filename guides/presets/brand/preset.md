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
      "prompt": "Real footage + 3D (the default when no style is picked): real footage interleaved with 3D designed for this company (its product, its process, its place), written as this film's own fx with three: true, never another company's scenes renamed. Footage and 3D meet through a push: the camera moves into a frame in the 3D until it fills the picture and the next shot takes over on the main track (and pulls back out of the last shot into the 3D logo); the handoff frame and the one after must look the same. The film ends on a 3D logo." },
    { "id": "cinemascope",
      "name": { "zh": "電影寬銀幕", "en": "Cinemascope", "ja": "シネマスコープ" },
      "desc": { "zh": "2.39 黑邊、暖調、襯線字和左下角加寬字距的小標，像電影預告。", "en": "2.39 bars, a warm grade, serif type and a small spaced-out label bottom-left, like a film trailer.", "ja": "2.39 の黒帯、暖色の色調、セリフ体と左下の字間を広げた小見出し。映画の予告編のように。" },
      "prompt": "Cinemascope: 2.39 bars for the whole film (common.film with letterbox: 2.39, or your own), a warmer grade (common.tone or the clips' own colour), serif display type (Playfair Display or Cormorant Garamond via c.theme fonts.display), the sub line as a spaced-out kicker. Keep every word and tag in the picture between the bars." },
    { "id": "voiceover",
      "name": { "zh": "旁白", "en": "Voice-over", "ja": "ナレーション" },
      "desc": { "zh": "合成語音唸出宣言，一句一停，配樂在旁白下自動壓低。不選就只用配樂。", "en": "A synthetic voice reads the manifesto line by line, the music ducking under it. Without it, music only.", "ja": "合成音声が宣言を一文ずつ読み上げ、音楽はナレーションの下で自動的に下がる。選ばなければ音楽だけ。" },
      "prompt": "Voice-over: read the manifesto with npm run voice, one sentence then a pause, in the film's language; the spoken lines are the on-screen lines said aloud, not a second script; the music ducks under it." },
    { "id": "globe",
      "name": { "zh": "據點地球", "en": "Globe of places", "ja": "拠点の地球" },
      "desc": { "zh": "點陣地球標出產地、據點和出貨路線，弧線從產地長向據點。", "en": "A dotted globe with origins, the home base and shipping routes, arcs growing towards home.", "ja": "ドットの地球に産地、拠点、出荷ルート。弧が産地から拠点へ伸びる。" },
      "prompt": "Globe of places: one beat with a dotted 3D globe written as this film's fx (ThreeKit; land and coordinates from assets data countries or maps): the origins, the home base and the routes as arcs growing towards home, using only places the user's text names. With no places in the text, do not make a globe: leave it out and say so in one sentence." },
    { "id": "social-cut",
      "name": { "zh": "另剪 15 秒社群版", "en": "Plus a 15 s social cut", "ja": "15 秒の SNS 版も" },
      "desc": { "zh": "主片之外，再剪一支 15 秒的 9:16 版本給社群用。", "en": "Besides the film, a 15-second 9:16 version for social media.", "ja": "本編に加えて、SNS 用の 15 秒・9:16 版も作る。" },
      "prompt": "After the main film, also make a 15 s 9:16 social cut as a second project: the promise in one line, the strongest shot or 3D beat, the logo." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: goodwill for a company, shop or product, made from what most users have: a logo, one paragraph about the company, maybe a website address. 16:9, 45–90 s. The bar is a film people take for a studio's work: footage picked with care, one look from start to end, and moments made for this company alone. Quality comes before speed.

- **Every film is written for its company.** No recipe and no shared block for what the viewer looks at (lines, tags, numbers, 3D, transitions, the logo): write each as this project's own fx; 3D with three: true and ThreeKit (ctx.three, in the workflow guide's 3D line: its parts give a picture or clip slab, a glass bar, dust, a floor and a logo built from the user's file). Whole-film look layers (common.film grain or bars, common.tone) and shared sounds may be used where they fit. Two companies must not get the same film with the words changed.
- **Storyboard first** (storyboard.md): one visual idea that runs through the whole film (for an editor: a pile of clips that becomes one film; for a bakery: dough that rises into the shop), then a table of time, part, picture, words on screen and element. Every 3D moment carries that idea.
- **The five parts on the music's bars** (about 80 BPM, a part 1.5–4 bars): the promise or the problem over everyday life, two shots a line, cut on the half bar; the pile or the scale of it (photos in 3D, a number); what they do, 3–5 beats, one line each, **each beat acted out** by its own fx over its shot (tags naming what the footage shows, a viewfinder locking on, a checklist ticking, a frame changing ratio), never a line over footage alone; the proof, using only numbers and facts that are in the user's own text (with none, one short line from the text, never an invented number); "We are …" (in the film's language); the logo landing on the music's peak, then the tagline and the website address exactly as the user wrote them.
- **The material decides the middle.** The user's own footage first (3D only as the wrapping: the opening pile, the push in, the logo; Pixabay only for missing shots). Only photos: the photos first, then Pixabay or 3D. Nothing: Pixabay real footage interleaved with 3D made for this company, never the whole middle in 3D.
- **Footage: search widely before writing the copy.** List the shot each line needs, then run assets search for each (English keywords, --kind video --ratio 16:9) and look at the contact sheets; a line with no fitting shot is cut from the copy or told in 3D instead. A 60 s film needs **at least 12 distinct clips**: no shot twice, a source at most twice (in-points 3 s or more apart). Prefer people at a distance, hands at work, everyday life, warm light. **Skip the stock clichés** unless the line is about them: hands typing on a laptop, a coffee cup on a desk, sparklers, a handshake, a city time-lapse, a crowd at a concert; search again with more specific words (a place, an action, a time of day) instead.
- **One look for the whole film.** Pick the grade in the storyboard (warm dusk, cool morning, …) and choose clips that already sit in it; a clip that clashes (a cold blue stage between warm sunsets) is graded towards it (the clip's colour, common.tone) or replaced. Before reporting, look at a contact sheet of the finished cut for colour jumps between neighbouring shots.
- **Photos for the 3D**: `npm run tellcut -- assets search <subject> --kind image` for 30–40 photos on the company's subject, then `assets get` them in one call (several refs at once). They are the pile, the wall or the ball of the 3D, never the main clips.
- **The logo first**: npm run tellcut -- logo <id> <file> --name "<the company name>" copies it into media/brand/ and says what it is and its colours; use its first colour as c.theme palette.accent and build the 3D logo from that file. No logo file: design a simple mark from what the company does and set the name in 3D type.
- **Handoffs between footage and 3D**: look at the handoff frame and the one after with npm run tellcut -- frames; they must look the same (same crop, same colour), no jump.
- **People**: no shot that makes a recognisable person look like they endorse the brand (the Pixabay licence forbids it); prefer hands, backs, distance, soft focus.
- **Check Pixabay clips frame by frame**: soft focus, exposure jumps, a sudden dark end; pick in-points by brightness. A clip with black bars of its own shows them in a 16:9 film: `check` warns about the source's own black bars; move the in-point, zoom it (crop) or take another clip. Avoid clips the search marks as AI-generated (in the detail line) for close-ups.
- **Words**: one line a beat, never a paragraph on screen; a clear hierarchy (lines bottom-left rising from a blur, proof numbers large with a small label under them, small facts as quiet tags). Inter for Latin text, Noto Sans TC for Chinese.
- **Music**: a cinematic bed at the film's tempo that follows the parts (soft under the hook, a pulse from the pile, drums from the beats, a breath before "We are", a riser into one hit on the logo); write it as this project's score style, or use a library style when one fits. Shape its level to the parts.
- **Picture budget for this preset**: about 40 pictures (the contact sheets of the searches, the logo, a few frames of the chosen clips and of each 3D moment, the finished cut). The searches and the finished cut are what make the film; spend the pictures there.
- **Report** which beats use the user's footage, Pixabay or 3D, each marked library / tuned / new as the workflow asks, and which of this film's fx could become shared parts.
