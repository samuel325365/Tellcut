---
{
  "order": 3,
  "color": "#c8962a",
  "name": { "zh": "Podcast 精華", "en": "Podcast Highlights", "ja": "ポッドキャスト切り抜き" },
  "summary": {
    "zh": "從一集 Podcast 或訪談裡剪出最好聽的一段，清楚標出誰在說話，配上逐字字幕。",
    "en": "Cuts the best exchange from a podcast or interview, showing clearly who is speaking, with word-by-word captions.",
    "ja": "ポッドキャストやインタビューから一番いいやり取りを切り出し、誰が話しているかをはっきり示し、字幕を付けます。"
  },
  "fit": {
    "zh": ["一集 Podcast 或訪談的錄影或錄音（兩個人以上在對話）", "只有聲音也可以，畫面會用音波和圖片補"],
    "en": ["A recording of a podcast or interview (two or more people talking)", "Audio only is fine: the picture is filled with a waveform and images"],
    "ja": ["ポッドキャストやインタビューの録画・録音（2 人以上の会話）", "音声のみでも OK：波形や画像で画面を作ります"]
  },
  "facts": {
    "zh": ["9:16 直式", "30–120 秒", "標出誰在說話", "逐字字幕"],
    "en": ["9:16 vertical", "30–120 s", "Shows who is speaking", "Word-by-word captions"],
    "ja": ["9:16 縦型", "30〜120 秒", "話者がわかる", "一語ずつの字幕"]
  },
  "length": [30, 120],
  "ratios": ["9:16"],
  "genres": false,
  "sources": ["freesound", "wikimedia"],
  "styles": [
    { "id": "stacked",
      "name": { "zh": "上下分割", "en": "Stacked split", "ja": "上下分割" },
      "desc": { "zh": "形式｜兩個人上下各佔一半，正在說話的那個亮起來，觀眾隨時知道誰在說話。", "en": "Form | Each speaker takes half of the frame, the one talking lit, so viewers always know who is speaking.", "ja": "形式｜二人が上下に半分ずつ、話している人が明るくなり、誰が話しているか常にわかる。" },
      "prompt": "Form: stacked split: each speaker in half of the frame, the one talking lit and the other dimmed: common.duo (each person's clip with frame = duoWindow('a' | 'b', params), segs from who speaks when); from one wide shot, c.view cuts each face out as its own camera and c.bands stacks them." },
    { "id": "solo",
      "name": { "zh": "跟著說話的人切", "en": "Follow the speaker", "ja": "話し手を追う" },
      "desc": { "zh": "形式｜全畫面只放正在說話的人，換人說就切過去。", "en": "Form | Only the person speaking fills the frame; it cuts when the speaker changes.", "ja": "形式｜話している人だけを全画面に、話し手が替わるとカット。" },
      "prompt": "Form: solo framing: full frame on the current speaker (the source's own close-up, or c.view around their face from a wide shot), cut on speaker change, never faster than the conversation; hold a short listener reaction now and then. For a framed look, common.duo mode: 'solo' (every clip with frame = duoWindow('a', params), segs from who speaks when: the window's ring takes the speaker's colour, each name chip shows on that person's first turn)." },
    { "id": "versus",
      "name": { "zh": "對決", "en": "Face-off", "ja": "対決" },
      "desc": { "zh": "形式｜兩方交鋒：開頭上下兩格各砸進一個大字（他說／她說），VS 轉進來，接著兩個人上下對打；論點轉折時插一張回合卡。適合真的有爭論的片段。", "en": "Form | Two sides clash: a big word slams into each half (his side / her side), the VS turns in, then the two go at it stacked; a round card when the argument turns. For an exchange where they really disagree.", "ja": "形式｜二人の論戦：上下のマスに大きな文字（彼は／彼女は）がドンと入り VS が回り込み、上下で応酬。論点が変わるとラウンドカード。本当に意見が割れる場面向き。" },
      "prompt": "Form: a face-off. common.versus mode title opens it (a big word slammed into each half, the VS diamond turning in, the two names), then common.duo stacks the two speakers (each person's clip with frame = duoWindow('a' | 'b', params), segs from who speaks when); a common.versus mode round card between rounds when the argument turns. Only for an exchange where the two really disagree; the sides are what they said, not a caricature." },
    { "id": "group-chat",
      "name": { "zh": "群組對話", "en": "Group chat", "ja": "グループチャット" },
      "desc": { "zh": "形式｜整段對談變成一個聊天室：每個人是一個聯絡人，講的話變成語音訊息加短短的文字泡泡，關鍵的幾句在影片泡泡裡播。只有聲音的 Podcast 也能用。", "en": "Form | The talk becomes a group chat: each speaker a contact, each turn a voice note with a short text bubble, the key moments playing in video bubbles. Works for audio-only episodes too.", "ja": "形式｜対談がグループチャットに：一人ひとりが連絡先、発言はボイスメッセージと短い吹き出しに、要所は動画の吹き出しで再生。音声だけのポッドキャストでも使える。" },
      "prompt": "Form: the exchange retold as a group chat with common.chat: each speaker is a contact (them with the speaker's name, or me for the host), each turn a voice note with its words as a short bubble, the speaker's clip in a video bubble at the turns that matter (play=s-s, the main-track clip at frame: chatWindow(params, message, width, height)). Works for audio-only episodes. Bubbles quote what was said, shortened, never reworded into something new. Sounds common.send / common.recv. Generic chat UI, no real app's colours or marks." },
    { "id": "quote-card",
      "name": { "zh": "金句字卡", "en": "Quote card", "ja": "名言カード" },
      "desc": { "zh": "形式｜一句話就夠力時：影片縮到小窗，大引號加說話的人，金句一個詞一個詞跳出來；結尾一張金句卡。", "en": "Form | When one line says it all: the video in a small window, a big quote mark and the speaker, the line appearing word by word; a quote card to close.", "ja": "形式｜一言で決まるとき：動画は小窓に、大きな引用符と話し手、名言が一語ずつ現れる。最後は名言カード。" },
      "prompt": "Form: the exchange's key statement as a moving quote card with common.quote mode words: the video shrinks to a small window (win, which is the main-track clip's frame), a big quote mark and the speaker's name, the lines appearing word by word on the speech's times (times), the hardest line hit; open on the exchange itself and close on mode card. Quote the words exactly as said." },
    { "id": "waveform",
      "custom": true,
      "name": { "zh": "音波動畫", "en": "Audiogram", "ja": "音声波形" },
      "desc": { "zh": "形式｜只有聲音時，用跟著聲音跳動的音波和話題圖片撐住畫面。（還沒有共用的積木，這支片會自己寫）", "en": "Form | For audio only: a waveform that moves with the voices, over artwork or pictures of the topic. (No shared block yet: the film writes its own.)", "ja": "形式｜音声だけのとき：声に合わせて動く波形と、話題の画像で画面を作る。（共通ブロックはまだなく、この動画用に作ります）" },
      "prompt": "Form: an audiogram for audio-only episodes: a waveform driven by the speech audio, the show's artwork or pictures of the topic behind it, the speaker's name and colour on each turn. There is no shared waveform block yet: write it as this project's own fx." },
    { "id": "big-captions",
      "name": { "zh": "逐字大字幕", "en": "Word-by-word captions", "ja": "一語ずつの大きな字幕" },
      "desc": { "zh": "字幕｜粗體大字幕，依說話的人分色。", "en": "Captions | Bold word-by-word captions, coloured by speaker.", "ja": "字幕｜太い大きな字幕、話者ごとに色分け。" },
      "prompt": "Captions: bold word-by-word captions coloured by speaker: c.speechCaptions(clip, { type: \"common.caption\", karaoke: true, speakers: [[from, to, 1|2], …], names: ['', 'A', 'B'], params: { style: \"big\" } }); never mix two speakers in one caption." },
    { "id": "qa-captions",
      "name": { "zh": "訪談字幕", "en": "Interview captions", "ja": "インタビュー字幕" },
      "desc": { "zh": "字幕｜雜誌訪談式的安靜字幕，比大字幕沉穩，適合深度對談。", "en": "Captions | Quiet, magazine-interview captions, calmer than the big ones; for in-depth talks.", "ja": "字幕｜雑誌のインタビューのような静かな字幕。大きな字幕より落ち着いていて、じっくりした対談向き。" },
      "prompt": "Captions: interview captions in common.caption style qa, one phrase at a time, calmer than the big ones; the speaker's name with their first line, and never two speakers in one caption." },
    { "id": "telop",
      "name": { "zh": "綜藝花字", "en": "Variety telop", "ja": "バラエティのテロップ" },
      "desc": { "zh": "字幕｜笑點和吐槽用彩色造型字放大。", "en": "Captions | Colourful styled words to land the jokes and quips.", "ja": "字幕｜笑いどころやツッコミをカラフルな装飾文字で強調。" },
      "prompt": "Captions: variety telop on jokes and reactions: common.slam or common.burst with a sound (common.pop / common.boing); two or three a minute at most, never over a face or the captions." },
    { "id": "list-slots",
      "name": { "zh": "重點清單", "en": "Numbered points", "ja": "ポイントの番号札" },
      "desc": { "zh": "點綴｜講到「三個原則」這種清單時，上方一排編號卡一格格填滿，號碼票飛進格子裡。", "en": "Accent | When the talk is a list (three rules, five tips), a row of numbered cards fills as each point is made, a ticket flying into its slot.", "ja": "アクセント｜「三つの原則」のようなリストのとき、上に並んだ番号カードが一つずつ埋まり、番号札がその枠へ飛び込む。" },
      "prompt": "Accent: when the exchange is a list (three rules, five tips), a common.progress mode: 'slots' row of numbered cards fills as each point is made, and a common.slip stub with slot flies into its card." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: the best exchange of an episode as a short that makes people want the full episode.
- 9:16, 30–120 s. Pick from the transcript an exchange that stands on its own; cold open on its strongest line.
- The styles are of four kinds, and their prompts begin with the kind. Form (stacked, solo, versus, group-chat, quote-card, waveform) carries the whole exchange: at most one form; if the user picks two, the first is the form and the second only lends its opener or ending; say so in one sentence. Captions and Accent go with any form.
- No form picked: follow the speaker (solo) when there are close-ups, stacked when it is one wide shot, the audiogram when there is only audio.
- The viewer always knows who is speaking: speaker labels or colours, framing that follows the speaker, a glow or a slight push-in on the one talking. Labels and colours change exactly on the cut or the speaker change.
- If the whole exchange is in single close-ups, cut to whoever speaks rather than faking a split with shots from other moments.
- Word-by-word captions; two people talking at once are never merged into one caption. Captions are in the language spoken; if the film's language differs, translate them with c.lines, timed to the original phrases.
- Cuts follow the conversation, never faster than it; reaction shots of the listener are welcome. Trim filler and false starts only where the cut is not heard.
- Reframe 16:9 to 9:16 around faces; never cut off heads. Cover or crop the show's own burned-in titles and lower thirds.
- Text is what was said, the names and the show; no info cards, and never put words in a speaker's mouth.
- End with the show name or a "full episode" card: common.outro look: 'episode' (the show name, a 16:9 window for a last clip with frame = outroWindow(params, W, H), the episode line, a button).
- Do not clip other people's shows unless the user says they have the rights.
