---
{
  "order": 4,
  "color": "#d9480f",
  "name": { "zh": "美食探店", "en": "Food Spot", "ja": "グルメ紹介" },
  "summary": {
    "zh": "把一家店或一趟吃喝的影片和照片，剪成讓人看了就餓的直式短片。",
    "en": "Turns your clips and photos of a restaurant or a food trip into a vertical short that makes people hungry.",
    "ja": "お店や食べ歩きの動画と写真を、見ているとお腹がすく縦型ショートにまとめます。"
  },
  "fit": {
    "zh": ["一家店或一趟吃喝的影片和照片：招牌、菜色特寫、吃的反應", "有菜單或價格更好，可以做成收據或評分"],
    "en": ["Clips and photos of a place or a food trip: the sign, close-ups of dishes, reactions while eating", "Even better with the menu or prices: they can become a receipt or a rating"],
    "ja": ["お店や食べ歩きの動画と写真：看板、料理のアップ、食べる反応", "メニューや値段があればレシートや評価カードにできます"]
  },
  "facts": {
    "zh": ["9:16 直式", "30–90 秒", "菜色特寫優先", "在拍點切換"],
    "en": ["9:16 vertical", "30–90 s", "Dish close-ups first", "Cuts on the beat"],
    "ja": ["9:16 縦型", "30〜90 秒", "料理のアップ優先", "ビートで切り替え"]
  },
  "length": [30, 90],
  "ratios": ["9:16"],
  "genres": false,
  "sources": ["freesound", "incompetech"],
  "styles": [
    { "id": "receipt",
      "name": { "zh": "收據記帳", "en": "Receipt", "ja": "レシート" },
      "desc": { "zh": "形式｜整支片下方一台收據機：每上一道菜就印一行菜名和價格，紙越長越高，最後印出合計。", "en": "Form | A receipt printer at the bottom for the whole film: one line per dish with its price as it arrives, the paper growing taller, the total printed at the end.", "ja": "形式｜全編を通して下にレシートプリンター：料理が出るたびに品名と値段が一行ずつ印字され、紙が伸びていき、最後に合計。" },
      "prompt": "Form: a thermal receipt printer at the bottom carries the whole film (common.printer): a title line first, then one line per dish with its price as the dish appears (lines: seconds|item|name|price), the paper growing up behind the clip window, the total and a thanks line at the end. Real prices only, from the menu, the footage or the user; without prices print the dishes alone." },
    { "id": "street-route",
      "name": { "zh": "吃一條街", "en": "Eat down the street", "ja": "一本の通りを食べ歩き" },
      "desc": { "zh": "形式｜開頭一張手繪路線卡：「1 條商圈、10 分鐘、6 家」，最後兩家打問號；每吃完一家，路線就點亮一站。適合一次吃好幾家。", "en": "Form | A hand-drawn route card to open (\"1 street, 10 minutes, 6 places\", the last two hidden), then each place in turn, the route lighting the next stop. For a visit of several shops.", "ja": "形式｜最初に手描きのルートカード（「1 本の通り・10 分・6 軒」、最後の 2 軒は？）。1 軒食べるごとにルートが次の店へ。何軒も回るとき向き。" },
      "prompt": "Form: eating down one street. Open on common.route look card (heads such as 1|street, 10|minutes on foot, 6|places to eat; the last stops hidden as question marks), then each place in turn with its dishes at full screen, the route card coming back for a beat to light the next stop; close on the whole route lit. For a visit of several shops; with one shop, say in one sentence that it does not suit and leave it out." },
    { "id": "shutter",
      "name": { "zh": "開店到打烊", "en": "Open to close", "ja": "開店から閉店まで" },
      "desc": { "zh": "形式｜開頭鐵捲門往上拉開、露出店面，中間是這一餐，結尾鐵捲門拉下、貼上「今日打烊」。", "en": "Form | The shutter rolls up on the shop front to open, the meal in between, and rolls down with a \"closed for today\" sign at the end.", "ja": "形式｜シャッターが上がって店先が現れ、食事のあと、最後はシャッターが下りて「本日閉店」の札。" },
      "prompt": "Form: from opening to closing. common.rolldoor dir up rolls the shutter open on the shop front to open the film, the visit plays full-frame in between, and the shutter rolls down at the end with its paper sign (closed for today, or the verdict)." },
    { "id": "judge",
      "name": { "zh": "美食評審", "en": "Food judge", "ja": "グルメ審査" },
      "desc": { "zh": "形式｜像評審節目：每道菜蓋上一張加分吊牌（「＋8 酥脆」），分數飛進儀表板，指針一路往上爬，結尾是總分評分卡。", "en": "Form | Like a judging show: each dish gets a score tag (\"+8 crispy\"), the score flies into a gauge that climbs through the film, ending on a rating card with the total.", "ja": "形式｜審査番組のように：料理ごとに加点タグ（「＋8 サクサク」）、点数がメーターへ飛んで針が上がっていき、最後に総合評価カード。" },
      "prompt": "Form: a judging show. Each dish gets a common.hangtag (a big plus score, the dish's name, one quip) whose score flies into a common.gauge that climbs through the film, ending on a common.rating card with the total. Scores are the user's, or an honest verdict given as an opinion." },
    { "id": "search",
      "name": { "zh": "搜尋推薦", "en": "Search for it", "ja": "検索でおすすめ" },
      "desc": { "zh": "形式｜打出「附近 拉麵 推薦」，點進第一筆結果就是這家店；結尾是地址或「看完整版」。", "en": "Form | Type \"ramen near me\", tap the first result and it is this place; end on the address or a full-video result.", "ja": "形式｜「近く ラーメン おすすめ」と入力し、最初の結果をタップするとこの店へ。最後は住所か「フル版を見る」。" },
      "prompt": "Form: open on common.search mode home typing what people search (the dish and the area, e.g. ramen near the station), autocomplete rows, the first result tapped with common.touch at searchPoint into the shop's footage, full-frame; close on mode end with the address or the full-video result card (the main-track clip at frame: searchWindow(params, width, height)). Sounds common.typing / common.tick / common.pop. Generic dark search page, no real engine's logo, colours or layout." },
    { "id": "chat",
      "name": { "zh": "朋友問好不好吃", "en": "Is it worth it?", "ja": "友だち「おいしい？」" },
      "desc": { "zh": "形式｜朋友傳訊息問「這家值得排嗎？」，你一段段傳影片、照片和語音回答，最好吃的那道從泡泡放大成全螢幕。", "en": "Form | A friend asks \"worth the queue?\", and you answer with clips, photos and voice notes; the best dish opens from its bubble to full screen.", "ja": "形式｜友だちが「並ぶ価値ある？」と聞き、動画・写真・ボイスメッセージで答える。いちばんの料理は吹き出しから全画面に。" },
      "prompt": "Form: a friend asks in common.chat whether the place is worth the queue; the answer is sent as clips in video bubbles (play=s-s, the main-track clip at frame: chatWindow(params, message, width, height)), photos of each dish, a voice note on the first bite; the best dish opens from its bubble to full screen and back; it ends on the friend's reply (going this weekend) or a location card. Short lines drawn from what the footage shows. Taps with common.touch at chatPoint; sounds common.send / common.recv / common.typing. Generic chat UI, no real app's colours or marks." },
    { "id": "rating",
      "name": { "zh": "評分卡", "en": "Rating card", "ja": "評価カード" },
      "desc": { "zh": "點綴｜結尾一張評分卡，味道、份量、價格一列列長上去。", "en": "Accent | A rating card at the end: taste, portion and value, one row at a time.", "ja": "アクセント｜最後に評価カード：味・量・コスパが一行ずつ伸びる。" },
      "prompt": "Accent: closing rating card (common.rating): taste, portion, value, one row at a time, optional total." },
    { "id": "verdict-stamp",
      "name": { "zh": "推薦印章", "en": "Recommended stamp", "ja": "おすすめスタンプ" },
      "desc": { "zh": "點綴｜最好吃的那道菜蓋上「推薦」章。", "en": "Accent | The best dish gets a \"recommended\" stamp.", "ja": "アクセント｜いちばんおいしい一品に「おすすめ」のスタンプ。" },
      "prompt": "Accent: stamp (common.stamp, with common.thud) a recommendation on the single best dish; use once or twice." },
    { "id": "polaroid",
      "name": { "zh": "定格拍立得", "en": "Polaroid freeze", "ja": "ポラロイドで静止" },
      "desc": { "zh": "點綴｜夾起第一口的瞬間定格成拍立得，下面手寫一句感想。", "en": "Accent | The first bite freezes into a polaroid with one handwritten line.", "ja": "アクセント｜最初の一口をポラロイドで止め、下に手書きの一言。" },
      "prompt": "Accent: freeze the first-bite moment as a polaroid (common.polaroid) with one handwritten line." },
    { "id": "ember-tag",
      "name": { "zh": "炭火菜名牌", "en": "Branded name board", "ja": "焼き印の品書き" },
      "desc": { "zh": "點綴｜每道菜上桌時，菜名像烙印一樣燙在一塊小木牌上。", "en": "Accent | As each dish arrives, its name is branded onto a small wooden board.", "ja": "アクセント｜料理が出るたび、品名が小さな木札に焼き印のように押される。" },
      "prompt": "Accent: dish names branded on a small wooden board (common.tag look: 'ember'), one per dish as it appears, the dish's real name." },
    { "id": "price-chart",
      "name": { "zh": "價格比較", "en": "Price comparison", "ja": "値段くらべ" },
      "desc": { "zh": "點綴｜用長條比較幾道菜的價格或份量。", "en": "Accent | Bars compare the price or portion of a few dishes.", "ja": "アクセント｜何品かの値段や量を棒グラフで比べる。" },
      "prompt": "Accent: bars compare the price or portion of three or four dishes (common.chart, kind bars); mark the best value. Real prices only." },
    { "id": "sound-closeups",
      "name": { "zh": "聲音特寫", "en": "Sound close-ups", "ja": "音のアップ" },
      "desc": { "zh": "剪法｜只有手和食物的特寫：煎、炸、咬下去的聲音放大，配樂停一拍。", "en": "Cut | Hands and food only: the sizzle, the crunch, the first bite turned up, the music dropping out for a beat.", "ja": "編集｜手と料理だけのアップ：焼く・揚げる・かじる音を大きく、音楽は一拍止める。" },
      "prompt": "Cut: sound close-ups: hands and food only, top-down or close, the sizzle, the crunch, the pour at full volume with the music dropped for a beat; a few moments, not the whole film." },
    { "id": "warm",
      "name": { "zh": "暖色調", "en": "Warm grade", "ja": "暖かい色調" },
      "desc": { "zh": "調色｜整支片偏暖、帶一點顆粒，讓食物看起來更好吃。", "en": "Look | A warm grade with a little grain over the whole film, so the food looks its best.", "ja": "色調｜全編を暖かい色調と少しの粒子で、料理をおいしそうに。" },
      "prompt": "Look: one warm grade over the whole film (common.tone with its warm default, amount about 0.4) and light grain (common.film look grain, blend overlay, grain about 0.07), so the food looks warm and appetising; on dark footage keep it light." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: a short that makes people want to eat there, for IG Reels, YouTube Shorts or X.
- 9:16, 30–90 s. Dish close-ups lead, the place and the people support.
- The styles are of four kinds, and their prompts begin with the kind. Form (receipt, street-route, shutter, judge, search, chat) carries the whole film: at most one form; if the user picks two, the first is the form and the second only lends its opener or ending; say so in one sentence. Accent and Cut go with any form. Look: at most one.
- No form picked: the footage full-frame, cut on the beat, with one or two accents that suit the material.
- Hook in the first 2 s: a close-up of the finished dish (steam, a cheese pull, the pour, the first bite).
- Order: the sign or entrance, the dishes, reactions, the verdict.
- Cut on the beat; keep mouth-full reactions short.
- Info cards are welcome here: prices, ratings, the address. Real numbers only, from the menu, the footage or the user; never invent a price or a shop's name. Other text is a dish name or one word of verdict, never paragraphs.
- Keep the sounds of eating and cooking and a few short natural-sound moments (the sizzle, the first reaction); when the speech is not in the film's language, caption it in the film's language.
- Badly lit shots make food look unappetising: leave them out, or brighten them.
- Footage that is already an edited vlog often has its own subtitles or titles burned in: crop them out or cover them, never let them show at a cut.
- End with a verdict: a rating, a stamp, the form's own ending, or the address on one line.
