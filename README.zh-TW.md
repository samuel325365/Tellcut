<p align="center">
  <img src="docs/readme/banner.jpg" alt="Tellcut — Tell it. Cut it." width="100%">
</p>

<p align="center"><strong>用說的剪片。</strong></p>

<p align="center">把素材丟進來，說一句想要什麼樣的片。Agent 會看完每一段素材、寫好分鏡、剪出初版，<br>全部在你自己的電腦上跑。</p>

<p align="center">
  <a href="README.md">English</a> &nbsp;·&nbsp; <strong>繁體中文</strong>
</p>

<p align="center">
  <a href="#看片">看片</a> &nbsp;·&nbsp;
  <a href="#三種剪法">三種剪法</a> &nbsp;·&nbsp;
  <a href="#agent-會做什麼">Agent 會做什麼</a> &nbsp;·&nbsp;
  <a href="#用-tellcut-剪的片">範例</a> &nbsp;·&nbsp;
  <a href="#片型">片型</a> &nbsp;·&nbsp;
  <a href="#開始用">開始用</a> &nbsp;·&nbsp;
  <a href="#api-key選用">API key</a> &nbsp;·&nbsp;
  <a href="INSTALL.md">安裝說明（英文）</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-only-0a84ff?style=for-the-badge&logo=windows&logoColor=white" alt="只支援 Windows">
  <img src="https://img.shields.io/badge/Node.js-24-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/Agent-Claude%20Code-d97757?style=for-the-badge&logo=claude&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/UI-EN%20%C2%B7%20%E4%B8%AD%E6%96%87%20%C2%B7%20%E6%97%A5%E6%9C%AC%E8%AA%9E-7048e8?style=for-the-badge" alt="English · 中文 · 日本語">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="MIT 授權"></a>
</p>

---

## 看片

<div align="center">
  <video src="https://github.com/user-attachments/assets/a82121b7-2dc8-4330-a473-0e79a1230809" width="100%" controls></video>
</div>

> **「Rome, by talking.」** 一支 16 分鐘的 vlog，變成 60 秒的雜誌風 IG 短片。匯入素材、選「旅行精華」片型、用一句話說你要什麼；Agent 看完全部素材，一次回覆就剪出初版。之後在時間軸上自己改，或選一頁直接請 Agent 改。全程在 Tellcut 裡錄製，Agent 工作的部分有加速。（[出處](docs/readme/CREDITS.md)）

---

## 手機裡的影片，大多沒有人剪

<p align="center"><img src="docs/readme/wall.jpg" alt="1,284 clips. Still waiting to be edited." width="100%"></p>

出去玩、慶生、上個月錄的 Podcast，素材都拍好了，卡住的是剪：一段一段看、挑鏡頭、剪接、上字幕、找配樂。

Tellcut 把這些工作交給 Agent，決定權留在你手上。你說想要什麼片，Agent 先剪出一支能看的初版，之後要怎麼改都可以，自己動手或開口請它改都行。

---

## 三種剪法

三種隨時可以切換。Agent 改的東西不會蓋掉你自己改過的地方。

<table>
  <tr>
    <td width="38%" valign="top">
      <img src="docs/readme/home.jpg" alt="Tellcut 首頁：對話框和一排片型">
    </td>
    <td valign="top">
      <h3>1. 用說的</h3>
      匯入素材，說你想要什麼。題目、鏡頭、字幕、特效、配樂都由 Agent 決定，剪出一支可以直接看的初版。
      <br><br>
      不知道怎麼說？對話框下面選一個<a href="#片型">片型</a>，就會帶進那一類片的做法。
    </td>
  </tr>
</table>

<p align="center"><img src="docs/readme/editor.jpg" alt="Tellcut 編輯器：素材、預覽和多層時間軸" width="100%"></p>

**2. 在時間軸上自己改。** 跟一般剪輯軟體一樣：切開片段、從素材庫換鏡頭、調音量、改字。改錯了可以復原。

**3. 用對話再改。** 在對話框直接說，或在時間軸上選一段、按右鍵「**Ask Agent…**」，說那一段要怎麼改。Agent 會先給你預覽，按「**Accept**」才算數。

---

## Agent 會做什麼

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/watch.jpg" alt="It watches every clip."><br>
      <strong>每一段素材都看過。</strong><br>
      把影片切成場景、做縮圖總覽、把講話轉成逐字稿，也會找出原片自己燒進去的字幕和浮水印。
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/beat.jpg" alt="Captions and music, on the beat."><br>
      <strong>字幕和配樂，都對在拍子上。</strong><br>
      內建 130 多種現成的畫面效果和音效，配樂依片長自動作曲；也能照影片的語言加旁白，字幕自動對齊。現成的不夠用時，Agent 會替這支片寫專屬的效果。
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="docs/readme/ratio.jpg" alt="Vertical. Landscape. Square."><br>
      <strong>直式、橫式、方形。</strong><br>
      輸出 9:16、16:9、1:1、4:5 的 MP4；橫式素材改成直式時，會跟著人臉取景。
    </td>
    <td valign="top">
      <img src="docs/readme/check.jpg" alt="It checks its own work."><br>
      <strong>交給你之前，先自己檢查。</strong><br>
      黑畫面、字幕對不上講話、字跑出畫面、爆音、原片的字露出來，Agent 會先找出來自己修。
    </td>
  </tr>
</table>

動手之前，它會先判斷這是哪一類影片（美食、旅遊、教學、訪談…），照那一類該有的東西寫分鏡，再開始剪。

---

## 用 Tellcut 剪的片

下面每一支都是 Tellcut 從 YouTube 上的 CC BY 影片剪出來的直式短片，點圖看原片、作者和改了什麼。

<table>
  <tr>
    <td align="center" width="33%">
      <a href="guides/presets/travel/CREDITS.md"><img src="docs/readme/sample-travel.webp" width="220" alt="旅行精華"></a><br>
      <strong>旅行精華</strong><br>
      <sub>55 秒・羅馬三日・素材 Jackie Vlogs</sub>
    </td>
    <td align="center" width="33%">
      <a href="guides/presets/clips/CREDITS.md"><img src="docs/readme/sample-clips.webp" width="220" alt="精華切片"></a><br>
      <strong>精華切片</strong><br>
      <sub>37 秒・馬拉喀什 vlog 的一段・素材 Helen</sub>
    </td>
    <td align="center" width="33%">
      <a href="guides/presets/podcast/CREDITS.md"><img src="docs/readme/sample-podcast.webp" width="220" alt="Podcast 精華"></a><br>
      <strong>Podcast 精華</strong><br>
      <sub>58 秒・兩人對談・素材 Lila Rose</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="guides/presets/food/CREDITS.md"><img src="docs/readme/sample-food.webp" width="220" alt="美食探店"></a><br>
      <strong>美食探店</strong><br>
      <sub>58 秒・首爾炭烤＋麵包店・素材 千千進食中</sub>
    </td>
    <td align="center">
      <a href="guides/presets/vlog/CREDITS.md"><img src="docs/readme/sample-vlog.webp" width="220" alt="生活 Vlog"></a><br>
      <strong>生活 Vlog</strong><br>
      <sub>66 秒・三天的待辦清單・素材 Michaela Bento</sub>
    </td>
    <td align="center">
      <a href="guides/presets/celebration/CREDITS.md"><img src="docs/readme/sample-celebration.webp" width="220" alt="紀念影片"></a><br>
      <strong>紀念影片</strong><br>
      <sub>88 秒・十六歲生日驚喜・素材 It's The Donnellys</sub>
    </td>
  </tr>
</table>

> 原片都以 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) 釋出。字幕、標題、卡片、配樂都是 Tellcut 自己加的。

---

## 片型

片型是某一類片的起手方向。點對話框下面的縮圖會看到說明，按「**確認**」就帶進來。不選也可以，直接用說的。

| 片型 | 適合 |
|---|---|
| **自定義** | 自己決定比例、長度、構圖這些，其他交給 Agent |
| **旅行精華** | 旅途中拍的零散片段，剪成適合放 IG、Shorts 的直式短片 |
| **精華切片** | 從一支完成的長片挑出最精彩的一段；要導流回原片就加開頭鉤子 |
| **Podcast 精華** | Podcast 或訪談裡最好聽的一段，清楚標出誰在說話，配逐字字幕 |
| **美食探店** | 一家店或一趟吃喝，剪成讓人看了就餓的短片 |
| **生活 Vlog** | 一天或一段日常的零碎片段，剪成有節奏、有起承轉合的 vlog |
| **紀念影片** | 婚禮、生日、畢業或送別的照片和影片，剪成能在現場播的紀念影片 |
| **品牌形象片** | 只要商標和一段介紹文字，就能做出有 3D 和實拍畫面的品牌形象片 |
| **圖解故事** | 用圖解和文字把一件事講清楚，可以完全不用素材 |
| **Auto** | 不確定要哪一種，交給 Agent 決定 |

---

## 開始用

**需要**

- **Windows 電腦**（目前只支援 Windows）
- **Node.js 24**、**Google Chrome**
- **Claude Code**，而且已經登入。剪片的 Agent 就是 Claude Code，用的是你自己的 Claude 帳號

**然後**

```powershell
npm run setup     # 自動下載需要的工具和模型（約 10～20 分鐘）
npm run server    # 再用瀏覽器打開 http://127.0.0.1:5174/
```

在首頁右邊的對話框匯入素材，跟 Agent 說你想做什麼樣的片。完整步驟和疑難排解在 **[INSTALL.md](INSTALL.md)**（英文）；出問題時先跑 `npm run doctor`，它會列出哪裡沒裝好、怎麼修。

介面有中文、English、日本語三種，首頁右上角的「中 / EN / 日」可以切換；編輯器裡的按鈕字固定是英文，說明跟著語言走。

> 素材和成品都留在你的電腦裡；跟 Agent 對話時，你的訊息和它需要看的畫面會送到 Anthropic。

---

## API key（選用）

不填任何 key 也全部能用。Agent 能用的外部素材來源裡，有幾個要你自己申請一把免費的 key；沒有 key，就只是那個來源不能用，其他照常。

| 來源 | 提供什麼 | 去哪裡申請免費的 key |
|---|---|---|
| **Pixabay** | 實拍影片和照片素材 | 註冊 Pixabay 帳號後，key 就顯示在 <https://pixabay.com/api/docs/> |
| **Freesound** | 音效 | 登入 Freesound，到 <https://freesound.org/apiv2/apply> 申請；用它給的「Client secret/Api key」 |
| **CARTO** | 地圖場景用的街道底圖 | 到 <https://carto.com/basemaps> 用 email 申請（不用帳號；限非商業用途） |

把 key 寫進 `tellcut` 資料夾裡的 `sources.local.json`。git 會忽略這個檔，不會被 commit：

```json
{
  "contact": "you@example.com",
  "keys": {
    "pixabay": "你的 Pixabay key",
    "freesound": "你的 Freesound key",
    "carto": "你的 CARTO key"
  }
}
```

也可以改設環境變數（優先於檔案）：`PIXABAY_API_KEY`、`FREESOUND_API_KEY`、`CARTO_API_KEY`。

- **`contact`**（選填）是一個 email 或網址，Tellcut 每次下載都會放在 User-Agent 標頭裡，讓來源知道是誰在要資料。Wikimedia Commons 給有表明身分的呼叫者高很多的額度。也可以改設環境變數 `TELLCUT_CONTACT`。
- **開關來源**：預設值在 `sources.json`。要改哪一個，就把它寫進 `sources.local.json`，例如 `"sources": { "steam": { "enabled": true } }`。BBC Sound Effects、Incompetech、Steam（非官方，或只限個人使用）預設是關的。
- **檢查設定**用 `npm run sources`：列出每個來源開了沒、有沒有 key、連不連得上。`npm run sources -- --live` 還會從每個來源真的搜尋、下載一次。`npm run doctor` 也會列出同一張表。
- **在對話框裡**，**＋** 旁邊的 **API** 按鈕會打開來源清單，勾選這串對話裡 Agent 可以用的來源。缺 key 的來源會變灰，並寫出原因。

---

## 試試這樣說

**有素材**

> 「這是我們去羅馬三天拍的，剪一支 60 秒的直式短片放 IG，開頭要讓人想看下去。」

> 「從這集 Podcast 挑出最好聽的一段，剪成一分鐘的 Shorts，誰在講話要標清楚。」

> 「把這些婚禮的照片和影片剪成三分鐘的紀念影片，要在婚宴上播。」

**完全沒有素材**

> 「做一支 45 秒的圖解短片，講為什麼貓會發出呼嚕聲，配旁白。」

**剪好之後**

> 在時間軸上選一段，右鍵「Ask Agent…」：「這段字太多了，只留重點。」

---

## 要花多少錢

Tellcut 本身免費。剪片時的 Agent 對話算在你的 Claude 帳號用量裡。每則回覆下面都會顯示這一輪用了多少 token，以及照 Claude API 價格大約多少錢。

| 參考 | 照 Claude API 價格 |
|---|---|
| 一支 30～40 秒的短片 | 約 US$1 |

## 目前的限制

- 只支援 Windows。
- Agent 聽不到聲音：配樂和人聲的大小、旁白念得自不自然，要你自己聽。
- 只在本機用，沒有雲端版，也不能多人同時編輯同一個專案。

---

## 文件

- [docs/reference.md](docs/reference.md)：全部指令、專案資料夾格式、程式架構。
- [CLAUDE.md](CLAUDE.md)：在這個專案用 Claude Code 開發時要知道的事。

除了這份 README，其他文件都是英文。

<details>
<summary><strong>程式架構一覽</strong></summary>

```text
tellcut/
├── apps/
│   ├── player/        唯一的畫面實作：編輯器預覽、輸出、check、golden 圖都跑它
│   ├── editor/        瀏覽器裡的時間軸編輯器
│   └── server/        本機伺服器、頁面聊天（每則訊息起一個 headless Claude Code）
├── packages/
│   ├── engine/        project.json 的 schema、合成器、編輯指令、混音計畫
│   ├── plugin-common/ 共用積木（字幕、標題、特效、3D…）和它們的 golden 圖
│   ├── plugins/       各端共用的外掛清單
│   ├── media-node/    ffmpeg、素材分析、轉錄、人臉、旁白、配樂、輸出、外部素材來源
│   └── protocol/      共用型別、圖鑑代號
├── tools/
│   ├── cut/           Cut API：從素材重建時間軸的 cut.ts、配方
│   ├── check/         輸出前的檢查
│   └── setup/         npm run setup / doctor
└── guides/            給 Agent 看的做片流程、品質標準、影片類型、片型
```

</details>

## 授權

程式碼以 [MIT 授權](LICENSE) 釋出。MIT 只涵蓋程式碼：

- `docs/readme/` 裡的圖和影片，以及 `guides/presets/*/` 的片型範例（`poster.jpg`、`preview.webm`），依旁邊 `CREDITS.md` 寫的條件使用：改編自 CC BY 3.0 影片，以及 Pixabay Content License 的素材。這一頁的圖和影片出處見 [docs/readme/CREDITS.md](docs/readme/CREDITS.md)。
- 第三方程式碼維持原本的授權：`packages/plugin-common/src/shader-vertex.ts` 的頂點著色器來自 Paper Shaders（Apache-2.0，見 [LICENSE.paper-shaders](packages/plugin-common/LICENSE.paper-shaders) 和 [NOTICE.paper-shaders](packages/plugin-common/NOTICE.paper-shaders)）。
- 安裝時下載的外部工具和模型（ffmpeg、uv、Python、Whisper 語音辨識模型、MediaPipe 人臉模型、字型）各有自己的授權。

只匯入你有權使用的影片。給 Tellcut 一個網址，它就會（用 yt-dlp）下載，但不會幫你確認影片是誰的。
