---
{
  "order": 1,
  "color": "#2f8cff",
  "name": { "zh": "旅行精華", "en": "Travel Highlights", "ja": "旅のハイライト" },
  "summary": {
    "zh": "把旅途中拍的零散片段，剪成一支適合放 IG、Shorts 的直式短片。",
    "en": "Turns the scattered clips from your trip into a vertical short for IG or Shorts.",
    "ja": "旅先で撮りためた短いクリップを、IG や Shorts 向けの縦型ショートにまとめます。"
  },
  "fit": {
    "zh": ["一堆零散的旅途影片或照片（10 段以上，每段幾秒到幾十秒）", "有拍攝時間和位置更好，可以畫出路線"],
    "en": ["Lots of short travel clips or photos (10 or more, a few seconds to a minute each)", "Even better with time and location data: the route can be drawn"],
    "ja": ["旅先の短い動画や写真がたくさん（10 本以上、1 本数秒〜数十秒）", "撮影日時や位置情報があればルートも描けます"]
  },
  "facts": {
    "zh": ["9:16 直式", "30–150 秒", "一種形式撐起整支片", "字只放一句話"],
    "en": ["9:16 vertical", "30–150 s", "One form carries the film", "One short line of text at a time"],
    "ja": ["9:16 縦型", "30〜150 秒", "ひとつの形式で全編を", "文字は短い一言だけ"]
  },
  "length": [30, 150],
  "ratios": ["9:16"],
  "genres": false,
  "sources": ["maps", "carto", "wikimedia", "countries", "freesound", "incompetech"],
  "styles": [
    { "id": "phone-album",
      "name": { "zh": "手機相簿", "en": "Phone photo album", "ja": "スマホのアルバム" },
      "desc": { "zh": "形式｜睡前滑相簿重溫這趟旅行：照天分組往下滑，點開一張就播那段影片，左右滑到下一段，一天結束縮回格子；最後一張「回憶」卡點開變成快剪高潮。", "en": "Form | Scrolling back through the trip in your photo album at night: day by day, tap a photo and its clip plays, swipe to the next, zoom back out at the end of each day; a \"memories\" card at the end opens into a fast montage.", "ja": "形式｜寝る前にアルバムで旅を振り返る：日ごとにスクロールし、写真をタップすると動画が流れ、スワイプで次へ、一日の終わりにグリッドへ戻る。最後は「思い出」カードが開いてハイライトのモンタージュに。" },
      "prompt": "Form: the whole film is a phone photo-album screen recording with common.album, all on one phone. Mode grid shows the clips' stills grouped by day (photos, # place|date|day), scrolled day by day with the date bubble following; a tap (common.touch at albumTile) and mode zoom open a tile to full screen with the main-track clip's crop; the clip plays under mode viewer (date, time, toolbar); mode swipe moves to the next one; at the end of a day zoom back into the grid and scroll on to the next day. Vary the rhythm: now and then swipe through several in a row instead of tap, play, close. The climax is a foryou memory card that opens into a fast montage of the best shots. Sounds common.tick / common.whoosh. Generic phone UI, no real brand marks." },
    { "id": "chat",
      "name": { "zh": "聊天對話框", "en": "Chat with a friend", "ja": "友だちとのチャット" },
      "desc": { "zh": "形式｜旅途中一直傳給朋友看：整支片是一段對話，影片、照片、語音一則則傳出去，朋友的回覆負責笑點（輸入中…、已讀不回），章節小標分天；精彩的鏡頭從泡泡放大成全螢幕。", "en": "Form | Sending the trip to a friend as it happens: the film is one conversation, clips, photos and voice notes going out one by one, the friend's replies bringing the jokes (typing…, left on read), day chapters; the best shots open from their bubble to full screen.", "ja": "形式｜旅の途中で友だちに送り続ける：全編がひとつの会話。動画・写真・ボイスメッセージを次々送り、友だちの返信が笑いどころ（入力中…、既読スルー）、日ごとの章見出し。いちばんいいショットは吹き出しから全画面に。" },
      "prompt": "Form: the whole film is one common.chat conversation with one friend through the trip. From 'leaving now' at the start, the user sends clips, photos and voice notes as the trip goes; the friend's short replies carry the jokes (the typing dots, a left-on-read with the read mark); sys pills and ch chapter pills mark the days (Day 2 · Rome), the pinned bar tracking chapters as dots; the wallpaper shifts with the time of day. Clips play inside video bubbles (play=s-s, the main-track clip at frame: chatWindow(params, message, width, height)); the best shot or two open from their bubble to full screen for a few seconds and go back. It ends on the friend's last line (take me next time) or a link card. Every message is short and drawn from what the footage really shows; never more than two made-up quips in a row. Taps with common.touch at chatPoint; sounds common.send / common.recv / common.typing / common.buzz. Generic chat UI, no real app's colours or marks." },
    { "id": "search",
      "name": { "zh": "搜尋框", "en": "Search box", "ja": "検索ボックス" },
      "desc": { "zh": "形式｜一個問題，整支片就是答案：打出「三天玩羅馬」，每個地點是一筆搜尋結果，點進去就是那段影片；中間可以再搜一次，結尾是「看完整版」的結果卡。", "en": "Form | One question, and the film is the answer: type \"three days in Rome\", each place is a search result that opens into its clip; search once more in the middle, and end on a \"watch the full version\" result.", "ja": "形式｜ひとつの質問に、全編で答える：「ローマ 3 日間」と入力し、各スポットが検索結果になってタップでその動画へ。途中でもう一度検索、最後は「フル版を見る」の結果カード。" },
      "prompt": "Form: the whole film answers one search with common.search. Open on mode home over the blurred first clip: the question typed (the trip in a few words, e.g. three days in the city), autocomplete rows drop down, one is tapped with common.touch at searchPoint. Then each place is one result: mode results with the place as the result title and one short line, tapped into its clip, which plays at full screen; once in the middle search again for one moment (mode ask may open one answer). Close on mode end with a redacted featured snippet and a full-version result card as the call to action (the main-track clip at frame: searchWindow(params, width, height)). Result pages only between places, short, a title and one line each: no prices, opening hours or lists of tips. Sounds common.typing / common.tick / common.pop. Generic dark search page, no real engine's logo, colours or layout." },
    { "id": "notifications",
      "name": { "zh": "通知串成一天", "en": "A day of notifications", "ja": "通知でつづる一日" },
      "desc": { "zh": "形式｜一整天的手機通知串成一天：鬧鐘、登機提醒、朋友問「到了沒」、當地天氣、晚上相簿說「今天拍了 214 張」；每跳一則，桌布就換成那個時間拍的畫面。", "en": "Form | A day told by its phone notifications: the alarm, a boarding reminder, a friend asking \"there yet?\", the local weather, the album's \"214 photos today\" at night; with each one the wallpaper becomes the footage of that hour.", "ja": "形式｜スマホの通知でつづる一日：アラーム、搭乗案内、友だちの「着いた？」、現地の天気、夜にはアルバムの「今日は 214 枚撮影」。通知が来るたびに壁紙がその時間の映像に変わる。" },
      "prompt": "Form: the whole film runs on one day's phone notifications. common.lockscreen with the clip as its wallpaper and its clock following the capture times, common.notify on top (y 0.43) pushing one notification at each turn of the day: an alarm, a boarding reminder, a friend asking if they are there yet, the weather of the place, the album's photo count at night. With each new one the wallpaper cuts to the footage of that hour, which plays full-frame under one or two cards at most; swipe old ones away. A trip of several days takes one notification per day's turning points, not one per hour. Write them from the footage's real times and places only. Sounds common.buzz / common.recv. Generic UI, no real brand marks." },
    { "id": "magazine",
      "name": { "zh": "旅遊雜誌", "en": "Travel magazine", "ja": "旅の雑誌" },
      "desc": { "zh": "形式｜把旅行做成一本雜誌：封面是最美的鏡頭加刊名，每個地點是一篇專題（大標＋一句引言），影片在版面的窗格裡播，有些頁整頁滿版；翻頁換地點，封底收尾。", "en": "Form | The trip as one magazine issue: the cover is the best shot and a masthead, each place a feature (a headline and one pull quote) with the clip in the page window, some pages bleeding full-frame; pages turn between places, the back cover closes.", "ja": "形式｜旅を一冊の雑誌に：表紙はいちばん美しいショットと誌名、各スポットが特集（大見出しと引用ひとつ）で動画は誌面の窓に、ときどき全面裁ち落とし。ページをめくって次の場所へ、裏表紙で締める。" },
      "prompt": "Form: the whole film is one travel magazine issue with common.magazine, the footage in the page window (clip frame = magazineWindow(params)). Layout cover with the best shot and a masthead (the city and an issue number) to open; then each place is a feature page with a kicker, a headline and one pull quote (slam on the punchline); some pages let the clip bleed full-frame under just the headline; one list page at most (three things, a few words each); layout back with the date and place to close. Turn between places with common.wipe mode curl (the outgoing shot's still, the previous page as art), not on every beat; speech in common.caption style qa. A headline and one line per page, never paragraphs. Generic magazine, no real brand marks." },
    { "id": "social",
      "name": { "zh": "社群短影音", "en": "Short-video app", "ja": "ショート動画アプリ" },
      "desc": { "zh": "形式｜一支正在被滑到的短影音：整支片包在短影音介面裡（帳號、分段進度條、愛心和留言數），精彩處點兩下跳愛心、留言往上飄，中間一個投票貼紙，結尾是置頂留言和分享面板。", "en": "Form | A short being scrolled past: the whole film inside a short-video app (account, segment bars, likes and comments), a double-tap heart and comments floating up on the best shots, one poll sticker, the pinned comment and share sheet at the end.", "ja": "形式｜スクロール中のショート動画：全編がショート動画アプリの画面の中（アカウント、セグメントバー、いいねとコメント数）。見せ場でダブルタップのハート、コメントが流れ、途中に投票スタンプひとつ、最後は固定コメントと共有シート。" },
      "prompt": "Form: the whole film is a short being scrolled in a generic short-video app. common.reels mode feed is the frame over the whole film (segment bars, account, buttons with counts); on the best shots a double-tap heart (common.emoji mode tap) and a few comments floating up with common.comments (where is this, I need to go); once in the middle a common.story poll or slider sticker; captions in common.caption style auto / big; close with mode end on top: the pinned comment and the share sheet. Keep the counts and comments believable and few. Generic look, no real brand marks." },
    { "id": "postcard",
      "name": { "zh": "明信片旅行日記", "en": "Postcard journal", "ja": "絵はがきの旅日記" },
      "desc": { "zh": "形式｜一站寄一張明信片回家：木桌上一張張明信片疊上去，郵票是那一站的畫面，郵戳蓋下地點和日期，手寫一兩句；卡片的窗格播那一站的影片，最後整疊攤開。節奏偏慢，適合有旁白的旅行。", "en": "Form | A postcard home from every stop: cards land one on another on a wooden desk, the stamp a picture of that stop, the postmark with place and date, a line or two handwritten; the card's window plays that stop's clip, and the pile spreads out at the end. A slower pace; good with narration.", "ja": "形式｜立ち寄るたびに絵はがきを一枚：木の机に一枚ずつ重なり、切手はその場所の写真、消印に地名と日付、手書きの一言。はがきの窓でその場所の動画が流れ、最後に束が広がる。ゆったりしたテンポで、ナレーション向き。" },
      "prompt": "Form: the whole film is a travel journal of postcards on a wooden desk with common.postcard, one item per stop. Each card slides in (enter) over the pile of the cards before it (pile), its stamp a picture of that stop (stampLabel, year), the postmark thumping down (place, placeZh, date, markAt), one or two short lines handwritten on it (lines; with narration, in time with the voice). While the card is settled its window plays that stop's clip (live; the main-track clip at frame: postcardWindow(orient)); the best stop may push in from the window to full screen and back. Close with the pile spread out (spread) and a last card saying the trip is over. A slow pace: about 4 to 6 stops in 60 s. Short handwritten lines only." },
    { "id": "map-route",
      "name": { "zh": "地圖路線", "en": "Map route", "ja": "地図ルート" },
      "desc": { "zh": "形式｜整支片跟著地圖走：從地球推到國家再到城市，每一站鏡頭穿進地圖變成那裡的影片，離開時拉回地圖、路線畫到下一站，最後整條路線亮起來。也可以是筆記本手繪路線。", "en": "Form | The film follows the map: from the globe to the country to the city, the camera dives into the map at each stop and becomes that place's footage, pulls back out when leaving as the route draws on, and the whole route lights up at the end. Or a hand-drawn notebook route.", "ja": "形式｜地図をたどる全編：地球から国、街へズームし、各地点で地図に飛び込んでその場所の映像に、出発するときは地図に戻ってルートが次へ伸び、最後にルート全体が光る。ノートの手描きルートも可。" },
      "prompt": "Form: the whole film follows the map. common.worldmap from the globe down to the country (pins, the route arc), then common.mapcam on an assets map photo pushing into each stop; at each stop the camera dives from the map into that place's clips at full screen, and pulls back out to the map when leaving while the route draws on to the next stop (common.mapjump mode leg for a beat or two); close on the whole route lit (common.mapjump mode all). Or tell it as a hand-drawn notebook: common.route look page. Map beats last 1 to 3 s each; the places' clips carry the rest. It needs two or more places: with one city, map its districts, or say in one sentence that it does not suit and leave it out." },
    { "id": "rail-trip",
      "name": { "zh": "車票與路線看板", "en": "Rail ticket and route board", "ja": "切符と路線ボード" },
      "desc": { "zh": "形式｜一趟車旅行的儀表板：上方掛一塊路線看板（迷你地圖、第幾站、日期），每到一站車票從下面砸進來、蓋上「已到站」章；結尾所有站點一次蓋章列出。影片照樣滿版。", "en": "Form | A rail trip's dashboard: a route board hangs at the top (mini map, stop number, date), at each arrival a ticket slams in from below and gets its \"arrived\" stamp; at the end every stop is stamped at once. The footage stays full-frame.", "ja": "形式｜列車旅のダッシュボード：上に路線ボード（ミニ地図、何駅目、日付）、駅に着くたびに切符が下から飛び込んで「到着」スタンプ。最後に全部の駅が一度に押される。映像は全画面のまま。" },
      "prompt": "Form: the whole film is a rail trip's dashboard over full-frame footage. common.routeboard hangs at the top with the trip's real cities (cities, stops), the legs lighting up as they are travelled; at each arrival common.ticket slams in at the bottom with the city, the stop number and the date, stamped on the next beat; on a single-city day common.tripclock may stand in for the board (the local time following the capture times). Close with common.stations stamping every stop at once, with the dates. The board and the tickets are brief; the footage plays full-frame under them. Real cities and dates only." },
    { "id": "photo-dump",
      "name": { "zh": "照片卡點輪播", "en": "Photo dump on the beat", "ja": "ビートに合わせた写真ダンプ" },
      "desc": { "zh": "剪法｜一首歌的時間把整趟旅行倒出來：照片和很短的片段每拍換一張，白閃、白框、底片日期印記，最精彩的一兩刻定格成拍立得。可以跟任何形式一起用。", "en": "Cut | The whole trip poured out in one song: photos and very short clips change on every beat, with a flash, a white border and a film date stamp; the one or two best moments freeze into a polaroid. Goes with any form.", "ja": "編集｜曲ひとつの間に旅を詰め込む：写真やごく短いクリップがビートごとに替わり、白いフラッシュ、白枠、フィルムの日付。いちばんの瞬間はポラロイドに。どの形式とも組み合わせ可。" },
      "prompt": "Cut: a photo dump on the beat. 5 to 20 photos and very short clips, 0.5 to 2.5 s each, changing on the beat; each photo snapping in with common.snap (flash, white border, the camera date stamp from the capture date); one or two peak moments frozen as a polaroid with one handwritten line (c.polaroid); the strongest first, the most conclusive last; little text, deliberately casual. Best under 30 s, or as one stretch of a longer film." },
    { "id": "transitions",
      "name": { "zh": "轉場串連", "en": "Transitions that move", "ja": "動きでつなぐトランジション" },
      "desc": { "zh": "剪法｜每一刀都在移動：手遮鏡頭、甩鏡頭、形狀相似的畫面互接（match cut），重拍前加速、落拍放慢，偶爾白閃。可以跟任何形式一起用。", "en": "Cut | Every cut moves: hand over the lens, whip pans, match cuts between similar shapes, speeding up into the downbeat and slowing on it, an occasional white flash. Goes with any form.", "ja": "編集｜すべてのカットが動く：手でレンズを隠す、カメラを振る、形の似た画面でつなぐマッチカット、強拍の前で加速して強拍で減速、ときどき白フラッシュ。どの形式とも組み合わせ可。" },
      "prompt": "Cut: every cut moves. Hand-over-lens, whip pans into whip pans, match cuts on similar shapes or motion; speed ramps (faster into the downbeat, slow on it), an occasional white flash; never hold slow motion long. Find the cuttable moves in the footage first; where none fit, use a plain cut on the beat rather than forcing one." },
    { "id": "cinematic",
      "name": { "zh": "電影感調色", "en": "Cinematic grade", "ja": "シネマティックな色調" },
      "desc": { "zh": "調色｜旅行電影的預告片：整支片一種調色，輕微顆粒和暗角，可加上下黑邊；鏡頭偏慢，字很少，配電影配樂和環境音。適合畫面本來就美的素材。", "en": "Look | A travel film's trailer: one grade for the whole film, light grain and vignette, optional letterbox; slower shots, very little text, a film score with the place's ambience. Best on footage that already looks good.", "ja": "色調｜旅の映画の予告編：全編ひとつの色調、軽い粒子と周辺減光、上下の黒帯も可。ゆったりしたショット、文字は少なく、映画音楽と現地の環境音。もともと美しい映像向き。" },
      "prompt": "Look: a cinematic grade over the whole film. One common.tone for the whole film (one colour and one edge, e.g. teal and orange) and light grain with common.film (look grain, blend overlay, grain about 0.07), optionally letterbox 2.39; favour slow, steady shots; one centred place line at the start and little text after; music plus the place's own ambience. It suits footage that already looks good; on shaky phone footage keep it light and say so in one sentence." },
    { "id": "retro",
      "name": { "zh": "復古 DV", "en": "Retro camcorder", "ja": "レトロなビデオカメラ" },
      "desc": { "zh": "調色｜爸媽那台家用攝影機拍的：掃描線、偏暖、黑色有點灰、雜訊帶滑過，觀景窗有 ● REC、帶子計數和日期；換天時像換帶子，結尾 STOP。保留現場聲音。", "en": "Look | Shot on the family camcorder: scanlines, a warm cast, lifted blacks, tracking noise sliding through, ● REC, a tape counter and the date in the viewfinder; a tape change between days, STOP at the end. Keeps the live sound.", "ja": "色調｜家族のビデオカメラで撮ったように：走査線、暖かい色かぶり、浮いた黒、流れるトラッキングノイズ、ファインダーに ● REC・テープカウンター・日付。日が変わるとテープ交換、最後は STOP。現場の音を残す。" },
      "prompt": "Look: a home-camcorder look over the whole film. common.film look vhs (scanlines, a warm cast, lifted blacks, tracking noise bands at the cuts between days) with common.camcorder mode osd (REC, the tape counter, the date stamp from the capture dates, the place typed in); a tape change (tape) between days; end on STOP. With an interface form (album, chat, search, notifications, magazine, social, postcard) only the common.film part applies: no viewfinder over an interface. Keep the live sound under the music." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: the best moments of the user's trip as a short for IG Reels, YouTube Shorts or X.
- 9:16, 30–150 s.
- The styles are of three kinds, and their prompts begin with the kind:
  - Form (phone-album, chat, search, notifications, magazine, social, postcard, map-route, rail-trip): carries the whole film from the first second to the last. At most one form: if the user picks two, the first is the form and the second only lends its opener or ending; say so in one sentence.
  - Cut (photo-dump, transitions): how the shots are cut; goes with any form, both may be used.
  - Look (cinematic, retro): one grade over the whole film; at most one look, and if both are picked use the first and say so in one sentence.
- No form picked: the footage plays full-frame, cut on the beat with motivated transitions (a photo dump when it is mostly photos). Choose a form yourself only when the material plainly asks for one, and say which and why in one sentence.
- Inside a form the footage is still the star: the best shots get their moment at full screen.
- Hook in the first 2 s: the most striking shot, or the form's opening.
- Order by capture time and GPS (footage that is one finished vlog keeps the vlog's order). At most 2–3 shots per place.
- Text stays short in every form: a title, a place name, one line per message, card or page; never paragraphs. No info cards (prices, transport, opening hours, lists of tips) unless the user asks. Messages, notifications, comments and postmarks come from what the footage really shows (times, places, what happens): never invent flight numbers, hotels, shops or people's names.
- Avoid footage with burned-in captions.
- End with closure: the form's own ending, back to the opening shot, or one line with date and place.
