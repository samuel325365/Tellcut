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
  "sources": ["freesound", "incompetech"],
  "styles": [
    { "id": "rating",
      "name": { "zh": "評分卡", "en": "Rating card", "ja": "評価カード" },
      "desc": { "zh": "結尾一張評分卡，味道、份量、價格一列列長上去。", "en": "A closing rating card: taste, portion and price fill in row by row.", "ja": "最後に評価カード。味・量・価格が一行ずつ伸びていく。" },
      "prompt": "Closing rating card (common.rating): taste, portion, value, one row at a time, optional total." },
    { "id": "receipt",
      "name": { "zh": "收據記帳", "en": "Receipt", "ja": "レシート" },
      "desc": { "zh": "一路吃一路印收據，最後印出合計。", "en": "A receipt prints line by line as you eat, ending with the total.", "ja": "食べるたびにレシートが印字され、最後に合計が出る。" },
      "prompt": "Thermal receipt (common.receipt or common.printer) prints one line per dish as it appears, ending with the total." },
    { "id": "verdict-stamp",
      "name": { "zh": "推薦印章", "en": "Verdict stamp", "ja": "おすすめスタンプ" },
      "desc": { "zh": "最好吃的那道菜蓋上「推薦」章。", "en": "The best dish gets a recommendation stamp.", "ja": "一番おいしい一皿に「おすすめ」スタンプ。" },
      "prompt": "Stamp (common.stamp, with common.thud) a recommendation on the single best dish; use once or twice." },
    { "id": "polaroid",
      "name": { "zh": "定格拍立得", "en": "Polaroid freeze", "ja": "ポラロイド風の静止画" },
      "desc": { "zh": "夾起第一口的瞬間定格成拍立得，下面手寫一句感想。", "en": "Freeze the first bite as a polaroid with a handwritten line below.", "ja": "最初の一口の瞬間をポラロイドに定着し、手書きのひとことを添える。" },
      "prompt": "Freeze the first-bite moment as a polaroid (common.polaroid) with one handwritten line." },
    { "id": "price-chart",
      "name": { "zh": "價格比較", "en": "Price compare", "ja": "価格の比較" },
      "desc": { "zh": "用長條比較幾道菜的價格或份量。", "en": "Bars compare the price or size of a few dishes.", "ja": "棒グラフで数品の値段や量を比べる。" },
      "prompt": "Bars compare the price or portion of three or four dishes (common.chart, kind bars); mark the best value." }
  ]
}
---
These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.

Goal: a short that makes people want to eat there, for IG Reels, YouTube Shorts or X.
- 9:16, 30–90 s. Shots fill the frame; dish close-ups lead, the place and the people support.
- Hook in the first 2 s: the most appetising shot (steam, a cheese pull, the first bite).
- Order: the sign or entrance, the dishes, reactions, the verdict.
- Cut on the beat; keep mouth-full reactions short.
- Text is a dish name, a price or one word of verdict, never paragraphs.
- Keep a few short natural-sound moments (the sizzle, the first reaction); when the speech is not in the film's language, caption it in the film's language.
- Footage that is already an edited vlog often has its own subtitles or titles burned in: crop them out or cover them, never let them show at a cut.
- End with a verdict: a rating, a stamp, or the address on one line.
- Styles the user picked are listed below; if none, choose 1–2 that suit the material.
