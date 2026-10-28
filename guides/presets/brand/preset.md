---
{
  "order": 7,
  "color": "#1f7a5c",
  "name": { "zh": "品牌形象片", "en": "Brand Film", "ja": "ブランドムービー" },
  "summary": {
    "zh": "從商標、一段公司介紹和官網，做出一看就是這家公司的品牌形象片；有自己的影片或照片更好。",
    "en": "A brand film that looks like the company at a glance, made from its logo, a paragraph about it and its website; even better with your own footage or photos.",
    "ja": "ロゴと会社紹介の文章、ウェブサイトから、ひと目でその会社とわかるブランドムービーに。自社の映像や写真があればさらに◎。"
  },
  "fit": {
    "zh": ["商標檔（SVG 最好，PNG、JPG 也可以）和一段公司介紹", "官網網址（會參考它的配色和字體）、自己拍的影片或照片更好"],
    "en": ["A logo file (SVG is best; PNG or JPG work too) and a paragraph about the company", "Even better with the website address (its colours and type are read) and your own footage or photos"],
    "ja": ["ロゴファイル（SVG が最適、PNG や JPG も可）と会社紹介の文章", "ウェブサイトの URL（配色や書体を参考にします）、自社で撮った映像や写真があればさらに◎"]
  },
  "facts": {
    "zh": ["16:9 橫式", "45–90 秒", "承諾 → 能力 → 證明 → 我們是 → 商標", "配色和字體照品牌"],
    "en": ["16:9 landscape", "45–90 s", "Promise → what we do → proof → we are → logo", "Colours and type from the brand"],
    "ja": ["16:9 横型", "45〜90 秒", "約束 → できること → 実績 → 私たちは → ロゴ", "配色と書体はブランドに合わせて"]
  },
  "length": [45, 90],
  "ratios": ["16:9"],
  "sources": ["pixabay", "freesound"],
  "fields": [
    { "id": "tone", "group": { "zh": "品牌", "en": "Brand", "ja": "ブランド" },
      "name": { "zh": "調性", "en": "Tone", "ja": "トーン" },
      "hint": { "zh": "片子的感覺和動態", "en": "How the film feels and moves", "ja": "動画の雰囲気と動き" },
      "autoHint": { "zh": "自動：Agent 從公司介紹和官網判斷", "en": "Auto: the agent judges from the introduction and the website", "ja": "自動：会社紹介とウェブサイトからエージェントが判断" },
      "options": [
        { "id": "tech", "name": { "zh": "科技俐落", "en": "Tech & crisp", "ja": "テック・シャープ" }, "prompt": "Tone: precise and modern; motion crisp and quick to settle; cool neutrals with the brand colour as the accent unless the brand says otherwise." },
        { "id": "warm", "name": { "zh": "溫暖親切", "en": "Warm & friendly", "ja": "あたたかく親しみやすい" }, "prompt": "Tone: welcoming and human; motion soft and unhurried; the brand's own warmer colours lead, with people and hands close to the work." },
        { "id": "premium", "name": { "zh": "高級沉穩", "en": "Premium & calm", "ja": "上質・落ち着き" }, "prompt": "Tone: calm and assured; slow, deliberate motion with long holds; restrained colour and generous empty space, the brand colour used sparingly." },
        { "id": "playful", "name": { "zh": "活潑年輕", "en": "Playful & young", "ja": "明るく若々しい" }, "prompt": "Tone: lively and young; springy motion with some bounce and cuts on the beat; the brand colours bright and at full strength." }
      ] },
    { "id": "type", "group": { "zh": "品牌", "en": "Brand", "ja": "ブランド" },
      "name": { "zh": "字感", "en": "Type feel", "ja": "書体の印象" },
      "hint": { "zh": "標題字的感覺（立體公司名也跟著）", "en": "The feel of the title type (the 3D company name follows it)", "ja": "見出し書体の印象（立体の社名もこれに合わせます）" },
      "autoHint": { "zh": "自動：跟著調性", "en": "Auto: follows the tone", "ja": "自動：トーンに合わせる" },
      "options": [
        { "id": "sans", "name": { "zh": "黑體（現代、乾淨）", "en": "Sans (modern, clean)", "ja": "ゴシック（モダン・すっきり）" }, "prompt": "Type feel: a clean sans for titles (Chinese Noto Sans TC 900, Latin Inter or Space Grotesk); 3D Chinese with font3d sans." },
        { "id": "serif", "name": { "zh": "明體（典雅、有份量）", "en": "Serif (elegant, weighty)", "ja": "明朝（上品・重厚）" }, "prompt": "Type feel: a serif with weight for titles (Chinese Noto Serif TC 900, Latin Playfair Display or Cormorant Garamond); 3D Chinese with font3d serif." },
        { "id": "round", "name": { "zh": "圓體（親切）", "en": "Rounded (friendly)", "ja": "丸ゴシック（親しみやすい）" }, "prompt": "Type feel: a rounded, friendly face for titles (Chinese Huninn, Latin Nunito); 3D Chinese with font3d round." }
      ] }
  ],
  "styles": [
    { "id": "real-3d",
      "name": { "zh": "實拍＋3D", "en": "Real footage + 3D", "ja": "実写＋3D" },
      "desc": { "zh": "實拍畫面和為這家公司設計的 3D 畫面交錯，用 3D 畫框推拉無縫轉場，最後是立體商標。", "en": "Real footage interleaved with 3D made for this company, seamless 3D frame pushes between them, a 3D logo to end.", "ja": "実写と、この会社のためにデザインした 3D を交互に。3D フレームの寄り引きでつなぎ、最後は立体ロゴ。" },
      "prompt": "Real footage + 3D: real footage interleaved with 3D designed for this company (its product, its process, its place) and for the brand card (its colours, its type), written as this film's own fx with three: true, never another company's scenes renamed. Footage and 3D meet through a push: the camera moves into a frame in the 3D until it fills the picture and the next shot takes over on the main track (and pulls back out of the last shot into the 3D logo); the handoff frame and the one after must look the same. The film ends on a 3D logo; a Chinese company name in 3D is extruded from the type feel's font (npm run tellcut -- font3d, then kit.word3d with cjk)." },
    { "id": "cinemascope",
      "name": { "zh": "電影寬銀幕", "en": "Cinemascope", "ja": "シネマスコープ" },
      "desc": { "zh": "2.39 黑邊、照品牌配色的調色、襯線字和左下角加寬字距的小標，像電影預告。", "en": "2.39 bars, a grade in the brand's colours, serif type and a small spaced-out label bottom-left, like a film trailer.", "ja": "2.39 の黒帯、ブランドカラーに寄せた色調、セリフ体と左下の字間を広げた小見出し。映画の予告編のように。" },
      "prompt": "Cinemascope: 2.39 bars for the whole film (common.film with letterbox: 2.39, or your own), a grade towards the brand card's palette (common.tone given both its color and its edge from the card, or the clips' own colour), serif display type (the brand card's serif, else Playfair Display or Cormorant Garamond via c.theme fonts.display), the sub line as a spaced-out kicker. Keep every word and tag in the picture between the bars." },
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
      "prompt": "After the main film, also make a 15 s 9:16 social cut as a second project: the promise in one line, the strongest shot or beat, the logo." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: a brand film makes people remember who this company is and why to trust or like it; it opens a website, a launch or a pitch, it does not explain how a product works. Afterwards the viewer knows the company's name (in the film's language) and its logo, its colours, type and manner look like this company's own, one idea or promise stays with them, and the company would put the film on its home page. It fails, however well made, if swapping the logo would make it any other company's film, if its colours and type have nothing to do with the brand, if it invents a number or a fact, or if it turns into a feature list. 16:9, 45–90 s. Quality comes before speed.

- **The brand card first** (brand.md in the project folder, before the storyboard; every later choice must agree with it):
  - **Palette**: 3–5 colours, each with its job (ground, main, accent, text), as hex.
  - **Type**: a title face and a text face, one Latin and one Chinese when the film has Chinese, picked from the workflow guide's Fonts list for this company's character; and the sizes: at 16:9 no label or product name under 3.5% of the frame height, numbers as a large figure with a small label under it, titles clearly above both.
  - **Tone**: three adjectives, and the motion they mean (a precise, technical brand moves crisply and settles fast; a gentle, homely one moves slowly and softly).
  - **What to film**: what this company's world looks like, the things, places and hands of its work (a software maker's world is screens and the people at them; a farm's is soil, weather and tools). The footage searches come from this list.
  - **Where it comes from**, first wins: the user's message > the form (tone, type feel) > the website > the logo > your judgement. With a website address, run `npm run tellcut -- site <id> <url>` first and open the screenshot it saves: its colours and fonts are what the page is painted in, and a home page often shows the campaign of the month, so the brand colours are the ones the site and the logo share, not a seasonal banner's. A site that cannot be read: say so in one sentence and go on from the logo and the introduction. A font the site uses that Tellcut lacks: take the closest one from the Fonts list.
- **Every film is written for its company.** No recipe and no shared block for what the viewer looks at (lines, tags, numbers, 3D, transitions, the logo): write each as this project's own fx; 3D with three: true and ThreeKit (ctx.three, in the workflow guide's 3D line: its parts give a clip slab, a glass bar, dust, a floor, a mark built from the user's logo file and letters in 3D). Whole-film look layers (common.film grain or bars, common.tone) and shared sounds may be used where they fit. Two companies must not get the same film with the words changed.
- **Storyboard** (storyboard.md, after brand.md): one visual idea that runs through the whole film, found in what this company does, then a table of time, part, picture, words on screen and element. Every designed moment carries that idea.
- **The parts**: the promise or the problem; what they do, 3–5 beats, one line each, **each beat acted out** by its own fx over its shot (something in the picture that shows the line happening), never a line over footage alone; the proof, using only numbers and facts that are in the user's own text (with none, one short line from the text, never an invented number); "We are …" (in the film's language); the logo, then the tagline and the website address exactly as the user wrote them. Each part is as long as its content needs; cutting on the music's bars (about 80 BPM, a part 1.5–4 bars, two shots a line) is a starting point, not a rule.
- **The material decides the middle.** The user's own footage first (graphics or 3D only as the wrapping: the opening, the logo; Pixabay only for missing shots). Only photos: the photos first, then Pixabay. Nothing: Pixabay footage carries it, with graphics or 3D made for this company where they serve the idea.
- **Footage: search widely before writing the copy.** List the shot each line needs from the brand card's "what to film", then run assets search for each (English keywords, --kind video --ratio 16:9) and look at the contact sheets; a line with no fitting shot is cut from the copy or told another way. A 60 s film needs **at least 12 distinct clips**: no shot twice, a source at most twice (in-points 3 s or more apart). Prefer people at a distance and hands at work. **Skip the stock clichés** unless the line is about them: hands typing on a laptop, a coffee cup on a desk, sparklers, a handshake, a city time-lapse, a crowd at a concert; search again with more specific words (a place, an action, a time of day) instead.
- **One look for the whole film**, towards the brand card's palette: choose clips whose colour already sits near it, and grade the rest towards it (the clip's colour, or common.tone always given both its color and its edge taken from the brand card, never its defaults) or replace them. Before reporting, look at a contact sheet of the finished cut for colour jumps between neighbouring shots.
- **Photos**: when the idea needs stills (a product's detail, a place, a texture), `npm run tellcut -- assets search <subject> --kind image`, then `assets get` the ones the storyboard uses in one call (several refs at once).
- **3D only where it serves the idea.** Unless the user ticked Real footage + 3D, use 3D only where it carries the storyboard's idea and can be made with real finish (material, light, the brand's colours); flat motion design is as good a way to land the logo as a 3D one. A Chinese company name in 3D: `npm run tellcut -- font3d <sans|serif|round>` for the type feel, then `kit.word3d(name, { glyphs: await kit.loadFont('Inter-700.ttf'), cjk: await kit.loadFont(<the file it names>) })` in ready().
- **The logo**: npm run tellcut -- logo <id> <file> copies it into media/brand/ and says what it is and its colours; open the file to see it, and let its colours into the brand card (c.theme palette from the card). In 3D, build it in an fx from that file (kit.loadMark: an SVG extruded, a picture as a cut-out plate). No logo file: design a simple mark from what the company does, in the brand card's colours and type.
- **The end**: the logo, the tagline, the website address, and the company name in the film's language next to the logo when the logo does not carry it (a Latin logo in a Chinese film gets the Chinese name, and the other way round).
- **Handoffs between footage and designed shots**: look at the handoff frame and the one after with npm run tellcut -- frames; they must look the same (same crop, same colour), no jump.
- **People**: no shot that makes a recognisable person look like they endorse the brand (the Pixabay licence forbids it); prefer hands, backs, distance, soft focus.
- **Check Pixabay clips frame by frame**: soft focus, exposure jumps, a sudden dark end; pick in-points by brightness. A clip with black bars of its own shows them in a 16:9 film: `check` warns about the source's own black bars; move the in-point, zoom it (crop) or take another clip. Avoid clips the search marks as AI-generated (in the detail line) for close-ups.
- **Words**: one line a beat, never a paragraph on screen; the brand card's fonts and sizes, with a clear hierarchy (lines, proof numbers large with a small label under them, small facts as quiet tags).
- **Music**: a bed at the film's tempo that suits the brand card's tone and follows the parts (quiet under the opening, building through the beats, a breath before "We are", one hit on the logo); write it as this project's score style, or use a library style when one fits. Shape its level to the parts.
- **Picture budget for this preset**: about 40 pictures (the website screenshot, the logo, the contact sheets of the searches, a few frames of the chosen clips and of each designed moment, the finished cut). The searches and the finished cut are what make the film; spend the pictures there.
- **Before reporting**, set a contact sheet of the finished cut beside brand.md: are the colours the brand's, are the type and its sizes the card's, does the company name appear (in the film's language), and is there a moment that would fit any other company if the logo were swapped? Fix what fails, then report.
- **Report** a short summary of the brand card (palette, type, tone), which beats use the user's footage, Pixabay, graphics or 3D, each marked library / tuned / new as the workflow asks, and which of this film's fx could become shared parts.
