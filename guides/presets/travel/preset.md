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
    "zh": ["9:16 直式", "30–150 秒", "畫面盡量滿版", "不放整段文字"],
    "en": ["9:16 vertical", "30–150 s", "Full-frame shots", "No text slides"],
    "ja": ["9:16 縦型", "30〜150 秒", "画面いっぱいに", "文字だけの場面なし"]
  },
  "length": [30, 150],
  "ratios": ["9:16"],
  "genres": false,
  "sources": ["maps", "carto", "wikimedia", "countries", "freesound", "incompetech"],
  "styles": [
    { "id": "phone-album",
      "name": { "zh": "手機相簿操作", "en": "Phone photo album", "ja": "スマホのアルバム操作" },
      "desc": { "zh": "像在手機上滑自己的相簿，點開一張就進到那段影片。", "en": "Like scrolling your own photo album on a phone; tapping a photo opens that clip.", "ja": "スマホで自分のアルバムをめくるように、写真をタップするとその動画へ。" },
      "prompt": "A phone photo-album screen recording with common.album (modes on one phone): grid of the clips' stills grouped by day (photos, # place|date|day), scrolled group by group with the date bubble following; a tap (common.touch at albumTile) and mode zoom flies the tile open to full screen with the main-track clip's crop, the clip plays under mode viewer (date, time, toolbar), mode swipe to the next one, zoom back into the grid; optionally a foryou memory card that opens into a montage. Sounds common.tick / common.whoosh. Generic phone UI, no real brand marks." },
    { "id": "chat",
      "name": { "zh": "聊天對話框", "en": "Chat bubbles", "ja": "チャット画面" },
      "desc": { "zh": "用通訊軟體的對話框講完整支片：訊息一則則跳出來，有「輸入中…」，影片在泡泡裡播，也可以有已讀不回的梗。整支片都在對話框裡，畫面不會滿版。", "en": "Tell the whole film in messaging bubbles: messages pop in one by one, with a typing indicator, clips playing inside bubbles, maybe a left-on-read joke. The whole film stays in the chat, so shots are not full-frame.", "ja": "メッセージアプリの吹き出しで全編を語る。メッセージが一つずつ現れ、「入力中…」、吹き出しの中で動画が流れ、既読スルーのネタも。全編がチャット画面の中なので、画面いっぱいにはなりません。" },
      "prompt": "The whole film is one common.chat conversation: messages one per line pop in and scroll up (me / them / sys pills / ch chapter pills, the pinned bar tracking chapters as dots), the friend's typing dots, photos and albums from the clips' stills, voice notes, a link card as the call to action; clips play inside video bubbles (play=s-s, the main-track clip at frame: chatWindow(params, message, width, height)), the input bar types and deletes, the read mark for a left-on-read joke, the wallpaper shifting with the time of day. Taps with common.touch at chatPoint; sounds common.send / common.recv / common.typing / common.buzz. Generic chat UI, no real app's colours or marks. This style is the exception to full-frame: the whole film stays inside the conversation." },
    { "id": "search",
      "name": { "zh": "搜尋框開場", "en": "Search box opener", "ja": "検索ボックスで始まる" },
      "desc": { "zh": "在搜尋框打字，跳出自動完成建議，按下搜尋後進到正片。很適合當開頭吸引人看下去；結尾也可以回到搜尋頁，放一張「看完整版」的結果卡。", "en": "Typing into a search box, autocomplete suggestions appear, hit search and the film begins. A strong hook; the ending can come back to the search page with a \"watch the full version\" result.", "ja": "検索ボックスに入力、候補が出て、検索を押すと本編へ。冒頭のつかみに最適。最後に検索画面へ戻り「フル版を見る」の結果カードで締めることも。" },
      "prompt": "Open on a search box with common.search, for the opener only: mode home over the blurred first clip (the destination typed, autocomplete rows drop down, one is tapped with common.touch at searchPoint), then cut straight to the full-frame film. Optionally close on it again: mode end with a redacted featured snippet and a full-version result card as the call to action (the main-track clip at frame: searchWindow(params, width, height)). The search page never carries the middle of the film. Sounds common.typing / common.tick / common.pop. Generic dark search page, no real engine's logo, colours or layout." },
    { "id": "map-route",
      "name": { "zh": "地圖路線", "en": "Map route", "ja": "地図ルート" },
      "desc": { "zh": "從地球縮放到城市，畫出移動路線，用來串連景點。", "en": "Zoom from the globe to the city and draw the route between places.", "ja": "地球から街へズームし、移動ルートを描いて名所をつなぐ。" },
      "prompt": "Map zooms from globe to city and draws the travel route; use it to link places (common.worldmap globe → common.mapcam on an assets map photo; common.route / common.mapjump)." },
    { "id": "notifications",
      "name": { "zh": "通知堆疊", "en": "Notification stack", "ja": "通知の積み重ね" },
      "desc": { "zh": "鎖定畫面上的通知一則則往上疊，常當開頭。", "en": "Lock-screen notifications stack up one after another, often as the opener.", "ja": "ロック画面に通知が次々と積み重なる。オープニング向き。" },
      "prompt": "Lock-screen notifications stack up one by one (flight, hotel, weather…), usually as the opener: common.lockscreen with common.notify on top (y 0.43), sounds common.buzz / common.recv. Generic UI, no real brand marks." },
    { "id": "social",
      "name": { "zh": "社群介面", "en": "Social media UI", "ja": "SNS の画面" },
      "desc": { "zh": "IG 限動、Reels 的愛心和留言飄出來，或 YouTube 的進度條。", "en": "Story-style frames, hearts and comments floating up like Reels, or a video progress bar.", "ja": "ストーリーズ風の枠、Reels のようにハートやコメントが浮かぶ、動画の再生バーなど。" },
      "prompt": "Social-app overlays: common.reels as the story / short-video frame (mode feed over the whole film: segment bars, account, buttons with counts; mode end on top at the end: pinned comment, share sheet), common.comments floating up, common.emoji float hearts (tap for the double-tap heart), common.story poll / slider stickers, captions in common.caption style auto / big; or a video progress bar (common.progress). Generic look, no real brand marks." },
    { "id": "photo-dump",
      "name": { "zh": "照片卡點輪播", "en": "Photo dump on the beat", "ja": "ビートに合わせた写真スライド" },
      "desc": { "zh": "照片跟著鼓點一張一張換。", "en": "Photos change on every beat.", "ja": "写真がビートごとに切り替わる。" },
      "prompt": "Photo dump: stills and very short clips change on the beat of the music." },
    { "id": "transitions",
      "name": { "zh": "轉場串連", "en": "Transitions that link scenes", "ja": "つながるトランジション" },
      "desc": { "zh": "用手遮鏡頭、甩鏡頭，或用形狀相似的畫面接到下一個場景（match cut）。", "en": "Hand-over-lens, whip pans, or match cuts between similar shapes.", "ja": "手でレンズを隠す、カメラを振る、形の似た画面でつなぐ（マッチカット）。" },
      "prompt": "Link scenes with motivated transitions: hand-over-lens, whip pans, match cuts on similar shapes or motion." },
    { "id": "magazine",
      "name": { "zh": "雜誌排版", "en": "Magazine layout", "ja": "雑誌風レイアウト" },
      "desc": { "zh": "版面切成好幾格，加上標題字，像雜誌或報紙。", "en": "The frame split into panels with headline type, like a magazine or newspaper.", "ja": "画面をいくつかのコマに分け、見出しを入れた雑誌や新聞風。" },
      "prompt": "Magazine layout for a few beats, not the whole film: common.magazine pages with the footage in the page window (clip frame = magazineWindow(params)) — layout cover to open, feature pages with still cells, a kicker and headline, a pull quote (slam on the punchline), list for a short list, back to close; turn between pages with common.wipe mode curl (the outgoing shot's still, the previous page as art); speech in common.caption style qa. Generic magazine, no real brand marks." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: the best moments of the user's trip as a short for IG Reels, YouTube Shorts or X.
- 9:16, 30–150 s. Shots fill the frame (85–100%); no text slides, text only overlays.
- Styles that wrap the footage in an interface (album grid, search, notifications, magazine) are for the opener, the ending or a few beats; everything else stays full-frame. The chat style is the exception: it is the whole film.
- Hook in the first 2 s: the most striking shot, or an opener style the user picked.
- Order by capture time and GPS (footage that is one finished vlog keeps the vlog's order); when the trip crosses cities, link them with a map route.
- Cut on the beat; at most 2–3 shots per place.
- Text is a place name or one short feeling, never paragraphs. Avoid footage with burned-in captions.
- End with closure: back to the opening shot, or one line with date and place.
- Opener and overlay styles the user picked are listed below; if none, choose 1–2 that suit the material.
