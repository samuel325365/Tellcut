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
        { "id": "tech", "name": { "zh": "科技俐落", "en": "Tech", "ja": "テック" }, "hint": { "zh": "精準、現代，動作俐落、很快停住", "en": "Precise and modern; crisp motion that settles fast", "ja": "精密でモダン、キレのある動き" }, "prompt": "Tone: precise and modern; motion crisp and quick to settle; cool neutrals with the brand colour as the accent unless the brand says otherwise." },
        { "id": "warm", "name": { "zh": "溫暖親切", "en": "Warm", "ja": "温かみ" }, "hint": { "zh": "親切、有人味，動作柔和不急", "en": "Welcoming and human; soft, unhurried motion", "ja": "親しみやすく人間味のある、やわらかな動き" }, "prompt": "Tone: welcoming and human; motion soft and unhurried; the brand's own warmer colours lead, with people and hands close to the work." },
        { "id": "premium", "name": { "zh": "高級沉穩", "en": "Premium", "ja": "上質" }, "hint": { "zh": "沉穩、從容，慢而精準，大量留白", "en": "Calm and assured; slow, deliberate, lots of space", "ja": "落ち着いて余裕のある、ゆっくり精密な動き" }, "prompt": "Tone: calm and assured; slow, deliberate motion with long holds; restrained colour and generous empty space, the brand colour used sparingly." },
        { "id": "playful", "name": { "zh": "活潑年輕", "en": "Playful", "ja": "元気" }, "hint": { "zh": "活潑、年輕，有彈性的動作、跟著節拍剪", "en": "Lively and young; springy motion, cuts on the beat", "ja": "明るく若々しい、弾む動きとビートに合わせたカット" }, "prompt": "Tone: lively and young; springy motion with some bounce and cuts on the beat; the brand colours bright and at full strength." }
      ] },
    { "id": "type", "group": { "zh": "品牌", "en": "Brand", "ja": "ブランド" },
      "name": { "zh": "字感", "en": "Type feel", "ja": "書体の印象" },
      "hint": { "zh": "標題字的感覺（立體公司名也跟著）", "en": "The feel of the title type (the 3D company name follows it)", "ja": "見出し書体の印象（立体の社名もこれに合わせます）" },
      "autoHint": { "zh": "自動：跟著調性", "en": "Auto: follows the tone", "ja": "自動：トーンに合わせる" },
      "options": [
        { "id": "sans", "name": { "zh": "黑體", "en": "Sans", "ja": "ゴシック" }, "hint": { "zh": "現代、乾淨", "en": "Modern, clean", "ja": "モダン・すっきり" }, "prompt": "Type feel: a clean sans for titles (Chinese Noto Sans TC 900, Latin Inter or Space Grotesk); 3D Chinese with font3d sans." },
        { "id": "serif", "name": { "zh": "明體", "en": "Serif", "ja": "明朝" }, "hint": { "zh": "典雅、有份量", "en": "Elegant, weighty", "ja": "上品・重厚" }, "prompt": "Type feel: a serif with weight for titles (Chinese Noto Serif TC 900, Latin Playfair Display or Cormorant Garamond); 3D Chinese with font3d serif." },
        { "id": "round", "name": { "zh": "圓體", "en": "Rounded", "ja": "丸ゴシック" }, "hint": { "zh": "親切", "en": "Friendly", "ja": "親しみやすい" }, "prompt": "Type feel: a rounded, friendly face for titles (Chinese Huninn, Latin Nunito); 3D Chinese with font3d round." }
      ] },
    { "id": "voice", "group": { "zh": "聲音", "en": "Sound", "ja": "音" },
      "name": { "zh": "旁白", "en": "Voice", "ja": "ナレーション" },
      "autoHint": { "zh": "自動：Agent 依素材判斷", "en": "Auto: the agent decides from the material", "ja": "自動：素材からエージェントが判断" },
      "options": [
        { "id": "original", "name": { "zh": "原音", "en": "Original", "ja": "元の音声" }, "prompt": "Voice: keep the footage's own sound and speech (an interview, people at work); no voice-over." },
        { "id": "tts", "name": { "zh": "AI 配音", "en": "AI voice", "ja": "AI 音声" }, "prompt": "Voice-over: read the manifesto with npm run voice, one sentence then a pause, in the film's language; the spoken lines are the on-screen lines said aloud, not a second script; the music ducks under it." },
        { "id": "none", "name": { "zh": "無", "en": "None", "ja": "なし" }, "prompt": "No voice-over and no speech: music and sound effects only." }
      ] }
  ],
  "styles": [
    { "id": "people",
      "name": { "zh": "人與工作", "en": "People at work", "ja": "人と仕事" },
      "desc": { "zh": "紀實感：手、背影、工作現場，自然光，鏡頭跟著人走。", "en": "A documentary feel: hands, backs and the work itself in natural light, the camera following the people.", "ja": "ドキュメンタリー風：手元や後ろ姿、仕事の現場を自然光で。カメラは人を追う。" },
      "prompt": "People at work: a documentary feel. The company's people and customers at their work carry the film: hands, backs, distance, natural light, the camera following the action, real moments rather than poses. Designed elements stay quiet (small tags, a line) so the people are what the viewer remembers." },
    { "id": "texture",
      "name": { "zh": "質感特寫", "en": "Close-up textures", "ja": "質感のクローズアップ" },
      "desc": { "zh": "微距拍材料、食材、紋理和手工細節，淺景深，慢慢推、慢慢剪。", "en": "Macro shots of materials, ingredients, surfaces and handwork, shallow focus, slow moves and slow cuts.", "ja": "素材、食材、質感、手仕事をマクロで。浅い被写界深度、ゆっくり寄ってゆっくり切る。" },
      "prompt": "Close-up textures: macro shots of this company's materials, ingredients, surfaces and handwork carry the film; shallow focus, slow push-ins and slow cuts, light raking across the surface. Type small and quiet at the edges of the frame; the brand colour as a detail, not a wash." },
    { "id": "minimal",
      "name": { "zh": "簡約留白", "en": "Minimal", "ja": "ミニマル" },
      "desc": { "zh": "大量留白，一個畫面只放一個東西或一句話，小字、慢，品牌色只點一下。", "en": "Plenty of empty space, one thing or one line at a time, small type, slow, the brand colour as a single point.", "ja": "たっぷりの余白、1 画面に 1 つだけ。小さな文字でゆっくり、ブランドカラーは一点だけ。" },
      "prompt": "Minimal: plenty of empty space; one thing on screen at a time (a single object, a single line); slow, precise motion and long holds; small type set with care; the brand card's neutrals for the ground and the brand colour used once or twice as a point. Footage, when used, is framed small or with lots of room around it; never a busy frame." },
    { "id": "manifesto",
      "name": { "zh": "字的宣言", "en": "Type manifesto", "ja": "言葉の宣言" },
      "desc": { "zh": "大字動態排版，承諾一句一句、一個字一個字打出來，字就是畫面。", "en": "Big kinetic type: the promise set word by word on the music; the words are the picture.", "ja": "大きなモーションタイポ。約束をひと言ずつ音楽に合わせて。文字そのものが画面。" },
      "prompt": "Type manifesto: the promise and the beats set as large kinetic type in the brand card's title face, word by word or phrase by phrase on the music; the words are the picture (scale, weight, colour and position change with what they say). Footage only as brief glimpses behind or between the lines." },
    { "id": "shapes",
      "name": { "zh": "品牌幾何", "en": "Brand shapes", "ja": "ブランドの形" },
      "desc": { "zh": "從商標的形狀和品牌色長出幾何圖形的動態設計，幾乎不用素材。", "en": "Motion design grown from the logo's shapes and the brand colours, with little or no footage.", "ja": "ロゴの形とブランドカラーから生まれる幾何学モーションデザイン。素材はほとんど使わない。" },
      "prompt": "Brand shapes: motion design grown from the logo's own shapes and the brand palette (its lines, curves, circles or angles, repeated, scaled and set moving), with little or no footage; every beat is a shape doing that line's work, and at the end the shapes resolve into the logo." },
    { "id": "cinemascope",
      "name": { "zh": "電影感", "en": "Cinematic", "ja": "シネマティック" },
      "desc": { "zh": "2.39 寬銀幕、慢節奏、照品牌配色調色，左下角加寬字距的小標，像電影預告。", "en": "2.39 bars, a slow pace, a grade in the brand's colours and a small spaced-out label bottom-left, like a film trailer.", "ja": "2.39 の黒帯、ゆったりした間、ブランドカラーに寄せた色調、左下の字間を広げた小見出し。映画の予告編のように。" },
      "prompt": "Cinematic: 2.39 bars for the whole film (common.film with letterbox: 2.39, or your own), a slow pace with long shots, a grade towards the brand card's palette (common.tone given both its color and its edge from the card, or the clips' own colour), display type from the brand card, the sub line as a spaced-out kicker. Keep every word and tag in the picture between the bars." },
    { "id": "product-3d",
      "name": { "zh": "產品 3D", "en": "Product in 3D", "ja": "プロダクト 3D" },
      "desc": { "zh": "產品、服務或商標在 3D 裡當主角：打光、旋轉、組裝，用推進畫框接實拍，最後是立體商標。", "en": "The product, service or logo as the hero in 3D: lit, turning, assembling, pushes through a frame into footage, a 3D logo to end.", "ja": "製品やサービス、ロゴが 3D の主役に。ライティング、回転、組み立て。フレームへの寄りで実写へつなぎ、最後は立体ロゴ。" },
      "prompt": "Product in 3D: the company's product, service or logo is the hero in 3D designed for it (written as this film's own fx with three: true and ThreeKit): lit, turning, assembling, with real finish in the brand card's colours. Footage between the 3D beats may meet them through a push (the camera moves into a frame in the 3D until it fills the picture and the next shot takes over; the handoff frame and the one after look the same). The film ends on a 3D logo; a Chinese company name in 3D is extruded from the type feel's font (npm run tellcut -- font3d, then kit.word3d with cjk)." }
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
- **Places**: when the user's text names origins, branches or routes, one beat may show them on a map or globe written as this film's fx (land and coordinates from assets data countries or maps), using only those places; with no places in the text, leave the map out.
- **The material decides the middle.** The user's own footage first (graphics or 3D only as the wrapping: the opening, the logo; Pixabay only for missing shots). Only photos: the photos first, then Pixabay. Nothing: Pixabay footage carries it, with graphics or 3D made for this company where they serve the idea.
- **Footage: search widely before writing the copy.** List the shot each line needs from the brand card's "what to film", then run assets search for each (English keywords, --kind video --ratio 16:9) and look at the contact sheets; a line with no fitting shot is cut from the copy or told another way. A 60 s film needs **at least 12 distinct clips**: no shot twice, a source at most twice (in-points 3 s or more apart). Prefer people at a distance and hands at work. **Skip the stock clichés** unless the line is about them: hands typing on a laptop, a coffee cup on a desk, sparklers, a handshake, a city time-lapse, a crowd at a concert; search again with more specific words (a place, an action, a time of day) instead.
- **One look for the whole film**, towards the brand card's palette: choose clips whose colour already sits near it, and grade the rest towards it (the clip's colour, or common.tone always given both its color and its edge taken from the brand card, never its defaults) or replace them. Before reporting, look at a contact sheet of the finished cut for colour jumps between neighbouring shots.
- **Photos**: when the idea needs stills (a product's detail, a place, a texture), `npm run tellcut -- assets search <subject> --kind image`, then `assets get` the ones the storyboard uses in one call (several refs at once).
- **3D only where it serves the idea.** Unless the user picked Product in 3D, use 3D only where it carries the storyboard's idea and can be made with real finish (material, light, the brand's colours); flat motion design is as good a way to land the logo as a 3D one. A Chinese company name in 3D: `npm run tellcut -- font3d <sans|serif|round>` for the type feel, then `kit.word3d(name, { glyphs: await kit.loadFont('Inter-700.ttf'), cjk: await kit.loadFont(<the file it names>) })` in ready().
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
