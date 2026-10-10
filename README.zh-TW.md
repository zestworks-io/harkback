<p align="center">
  <img src="assets/logo.png" alt="Harkback" width="96">
</p>

<h1 align="center">Harkback</h1>

<h3 align="center">
邊讀邊解釋術語，記住你弄懂了什麼。<br>下次再遇到時，把它找回來。
</h3>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="CHANGELOG.md"><img alt="Version" src="https://img.shields.io/github/package-json/v/zestworks-io/harkback?filename=apps%2Fextension%2Fpackage.json&label=version&color=informational"></a>
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="Node 22+" src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-success">
  <a href="https://github.com/zestworks-io/harkback/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/zestworks-io/harkback?style=flat"></a>
  <a href="https://github.com/zestworks-io/harkback/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/zestworks-io/harkback"></a>
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
</p>

<p align="center">
| <a href="#快速開始"><b>快速開始</b></a> | <a href="#功能"><b>功能</b></a> | <a href="guide/README.md"><b>文件</b></a> | <a href="#隱私"><b>隱私</b></a> | <a href="CHANGELOG.md"><b>更新日誌</b></a> | <a href="CONTRIBUTING.md"><b>參與貢獻</b></a> |
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <b>繁體中文</b> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (Brasil)</a></p>

Harkback 是一個給論文與技術文件讀者使用的 Chrome 擴充功能。選取一個術語，它會結合上下文解釋這個術語；每一次解釋都會存進本機的只追加日誌。之後在別的頁面再遇到同一個術語（即使寫法不同），Harkback 會替它加上底線，並顯示你上次是怎麼理解的。

> “harken back”：回到先前的某個時間點。

<p align="center">
  <a href="assets/demo.mp4"><img src="assets/demo.gif" alt="Demo" width="720"></a>
  <br><sub>在 PDF 中選取術語、接著追問，整段對話都會被保存。點擊動畫可觀看完整畫質的影片。</sub>
</p>

## 快速開始

```sh
git clone https://github.com/zestworks-io/harkback.git && cd harkback
pnpm install && pnpm --filter @harkback/extension build
```

開啟 `chrome://extensions`，打開**開發人員模式**，選擇**載入未封裝項目**，然後選取 `apps/extension/.output/chrome-mv3`。接著選一個模型：

<details open>
<summary><b>本機模型（免費）</b></summary>

安裝 [Ollama](https://ollama.com)、下載一個模型，並在引導頁面選擇 **Ollama**。用「測試連線」取得允許此擴充功能的那一行指令。你的內容不會離開你的電腦。

</details>

<details>
<summary><b>雲端模型（使用你自己的 API 金鑰）</b></summary>

選擇 OpenAI、Anthropic、Google Gemini、xAI Grok、OpenRouter，或自訂的 OpenAI 相容位址，並貼上你的金鑰。費用由服務商直接向你收取；Harkback 中間沒有任何伺服器。

</details>

然後在任何頁面選取術語並按下 `Alt+Shift+E`。詳見[安裝](#安裝)與[連接模型](#連接模型)。完整的入門說明在[快速上手指南](guide/zh-tw/getting-started.md)。

<details>
<summary><b>目錄</b></summary>

- [為什麼不直接問 ChatGPT？](#為什麼不直接問-chatgpt)
- [功能](#功能)
- [你的知識圖譜](#你的知識圖譜)
- [運作方式](#運作方式)
- [安裝](#安裝)
- [連接模型](#連接模型)
- [使用方式](#使用方式)
- [文件](#文件)
- [隱私](#隱私)
- [你的資料](#你的資料)
- [限制](#限制)
- [專案結構](#專案結構)
- [開發](#開發)
- [參與貢獻](#參與貢獻)
- [授權條款](#授權條款)

</details>

## 為什麼不直接問 ChatGPT？

你可以把術語貼到聊天機器人，得到不錯的答案。Harkback 並不想給出更好的答案，它補上的是聊天視窗缺少的那一塊：**記憶**。你查過的每個術語都會成為一筆記錄，連著頁面、引文和日期；這些記錄彼此相連，構成一張屬於你自己的知識圖譜。

|                | 問聊天機器人                       | Harkback                                                   |
| -------------- | ---------------------------------- | ---------------------------------------------------------- |
| **上下文**     | 複製術語和一段文字，切換分頁       | 在頁面上選取術語，所在段落和章節會一併帶上，引文會被核對   |
| **下一次**     | 新的對話從零開始，或你忘了自己問過 | 後續頁面上的術語會被加上底線，並附上你上次的理解           |
| **結構**       | 一堆對話紀錄                       | 帶有別名、前置概念、變體和相關術語的概念                   |
| **記憶**       | 沒有                               | 由記憶模型安排的複習佇列：每個術語會在你快忘掉之前再次出現 |
| **你的記錄**   | 存放在服務商的帳號裡               | 留在你的瀏覽器中；可匯出為 Markdown、Obsidian 筆記或 JSONL |
| **模型與費用** | 一項服務、一個方案                 | 任選支援的模型：本機 Ollama 免費，或使用你自己的 API 金鑰  |

Harkback 免費且開源（Apache-2.0），沒有伺服器，也沒有訂閱。它確實需要一個模型來撰寫解釋：本機模型免費，雲端模型則由服務商向你的金鑰收費。

## 功能

- **結合上下文解釋。** 選取術語，點擊「解釋」或按 `Alt+Shift+E`。答案會從你設定的模型串流出來，並標示為「原文定義」（頁面本身定義了該術語，且引文已與頁面文字核對）或「外部知識」。
- **記住。** 每次解釋、追問，以及「懂了／還是不懂」的標記，都會以事件的形式存進 IndexedDB。除了你觸發的模型請求之外，沒有任何內容離開你的瀏覽器。
- **追問對話。** 在卡片上繼續提問；每個問題都留在它的答案上方，整段對話會連同解釋一起保存。歷史中會完整顯示，搜尋也找得到。公式會被排版。
- **重逢提示。** 在之後的頁面上，你查過的術語會被加上底線。把滑鼠移上去，可以看到你何時、在哪裡遇過這個術語、當時的理解，以及一行說明頁面上哪段文字對上了；然後你可以標記為已記住、再解釋一次、比較兩處用法，或把它靜音。
- **一個概念，多種寫法。** `LLM`、`LLMs`、`the LLM`、`large language model` 和 `Large-Language Models` 是同一個概念；`β-VAE` 和 `beta-VAE`、`fine-tuning` 和帶連字的 `ﬁne-tuning` 也是。相近的比對會以「這是你 3 天前查過的那個術語嗎？」的方式問你。
- **相關術語。** 如果模型說 `QLoRA` 是 `LoRA` 的變體，那麼只提到 `QLoRA` 的頁面會提醒你當時對 `LoRA` 的理解。
- **概念頁。** 在歷史中打開任何術語，可以看到你對它的理解程度、它建立在什麼之上（前置概念）、它的變體和相關術語，以及每一次遇見。你可以新增別名、合併兩個其實相同的概念、移除錯誤的關聯，或把術語靜音。
- **複習。** 歷史中有一個「複習」按鈕，附上到期的術語數量。每個術語由記憶模型 [FSRS-7](https://github.com/open-spaced-repetition/fsrs4anki) 安排：把答案評為「重來」、「困難」、「良好」或「簡單」，術語就會在你快忘掉之前回來，所以簡單的術語間隔拉得很快，困難的很快就會再出現。每個按鈕都會顯示術語何時回來。在揭曉解釋之前，你可以先輸入自己記得的內容，還有一個可選的**檢查我的答案**按鈕，請你的模型判斷你答得多接近（它只建議評分，由你決定，也可以在設定中關閉）。整個複習都能用鍵盤完成：`Space` 顯示解釋，`1`–`4` 評分，`S` 跳過。兩者同時到期時，依賴其他術語的術語排在它的前置概念之後；你一直學不會的術語，會指出可能缺少的前置概念。在重逢提示上標記「想起來了」算一次輕量複習。有一個設定可選擇術語到期時你希望記得的機率（預設 90%）。工具列圖示會顯示到期數量。
- **每週摘要。** 歷史 →「週報」顯示一週內你遇到了什麼：新術語與重溫的術語、答案、你仍然困惑的術語、你在哪裡閱讀，以及概念之間的新連結。它完全在你的電腦上根據你的記錄產生，不呼叫任何模型。
- **站在你已知的基礎上。** 當你查的術語與你已經理解的某個術語很接近時，模型會被告知這一點，因此可以解釋兩者的差別，而不是從頭開始。
- **預設保護隱私。** 在你新增網站之前，自動掃描只限於 arxiv.org；設定中有一個按鈕可新增常見的研究網站。敏感網站可以被強制只用本機模型，無痕視窗則從不記錄或掃描。
- **可攜的記錄。** 全部匯出為 Markdown、Anki 卡片、一個帶連結的筆記資料夾（每個概念一個檔案，附 `[[連結]]`，可直接用於 Obsidian；你寫在標記行下方的內容會在下次匯出後保留），或帶版本的 JSONL 事件日誌（附公開的 JSON schema）。每週的 JSONL 備份會寫到 `Downloads/harkback`，歷史中的**匯入 JSONL** 可以還原它（已有的記錄會被略過）。有一個設定可以讓敏感來源不出現在備份與匯出中。
- **停止、重試、切換模型。** 「停止」按鈕可以在答案撰寫途中結束它。失敗後，卡片會提供「重試」，並且在設定了多個模型時，為其他每個模型提供「改用…重試」。
- **閱讀前先預覽頁面。** 點擊工具列按鈕、按 `Alt+Shift+P` 或使用右鍵選單，Harkback 會詢問是否掃描此頁面，並說明所用的模型以及它是否在遠端；在你同意之前不會傳送任何內容。一次模型呼叫會挑出頁面的關鍵術語，再由你自己的記錄把它們分成「仍然困惑」、「生疏」、「對你是新的」和「已熟悉」。「預覽」會對你認識的術語顯示你先前的解釋，對新術語則顯示模型寫的簡短解釋，並且不會記錄任何東西。模型只會看到頁面文字，從不會看到你的概念清單，敏感頁面只會用本機模型。掃描會讀取頁面的前 16,000 個字元，頁面較長而被截斷時會告訴你。
- **YouTube 字幕。** 在設定中新增 YouTube，開啟字幕後，你查過的術語會在字幕行中被加上底線。暫停並選取術語，即可根據你看過的字幕來解釋。這次查詢會連同播放位置（`12:34`）一起記錄，歷史、複習和匯出都能連回那個時刻。新增網站之前是關閉的；不會下載任何東西，只讀取螢幕上的字幕行。
- **GitHub、Notion 與 Google 文件。** 在設定中新增網站後，它的頁面會依各自的版面讀取：儲存庫的 README、issue 或 pull request 的對話、Notion 頁面、Google 文件的發布版或行動版檢視。無論你從哪裡進入，一份文件都只算一個來源，而且只讀取文件本身的文字，不讀周圍的選單。
- **傳送私密頁面前先詢問。** 看起來是私密的頁面，例如私有的 GitHub 儲存庫，或未發布的 Notion、Google 文件頁面，在你選擇「僅用本機模型」或「照常傳送」之前，不會被傳給任何模型。頁面角落的鎖頭會顯示並更改這個狀態；你的選擇會被記錄，並可以記住在該網站上。
- **多種開始方式。** 選取文字並點擊「解釋」（滑鼠、鍵盤或觸控選取皆可）、按 `Alt+Shift+E`，或使用右鍵選單中的「解釋」。載入更多文字、或不重新載入就跳到另一頁的頁面會被重新掃描。
- **模型由你選。** Chrome 內建的 Gemini Nano（在你的電腦上，無需設定）、Ollama、OpenAI、Anthropic、Google Gemini、xAI Grok、OpenRouter，或任何 OpenAI 相容的伺服器。Anthropic 與 Gemini 使用它們的原生 API。

## 你的知識圖譜

每一次查詢都會為一張你讀過什麼的圖譜加上內容，這張圖譜來自你自己的閱讀，而不是通用模型的記憶。

- **概念是節點。** `LoRA` 是一個節點，不管頁面用哪種寫法（`LoRA`、`low-rank adaptation`），也不管你是用哪種語言遇到它。它保留自己的別名、所屬領域，以及你理解的程度。
- **關係是邊。** 你查詢術語時，模型會提出 `variant_of`、`prerequisite` 和 `related` 連結，例如 `QLoRA` 是 `LoRA` 的變體。你可以移除錯誤的連結、合併兩個相同的概念，或新增別名。
- **一切都指回證據。** 一個概念會列出每一次遭遇：頁面、引文、日期、你的解釋和追問對話。
- **圖譜會派上用場。** 只提到 `QLoRA` 的頁面會提醒你 `LoRA`；模型會得知你已經知道什麼，因此可以解釋差別；複習以概念為單位安排。
- **它屬於你。** 匯出一個帶連結的筆記資料夾（`[[連結]]`，每個概念一個檔案），在 Obsidian 中開啟就能在那裡看到圖譜；或把完整的事件日誌匯出為 JSONL。

在歷史中打開**關係圖**，可以把它當作地圖來看：概念依你的理解程度著色（已理解、不穩、困惑或新的），箭頭表示前置概念和變體。可以依領域、理解程度或上次查詢時間篩選。拖曳移動、捲動縮放、點擊概念即可打開。你也可以透過概念頁瀏覽它，或匯出後在 Obsidian 中瀏覽。

## 運作方式

```
 讀取                解釋                    記住                     重逢
 ────                ───────                 ────────                 ──────
 content script  →   background worker   →   只追加事件日誌       →   比對器掃描下一個頁面
 擷取頁面文字，      依網站敏感度選擇模型，  (IndexedDB)，重放後      中的已知名稱，挑出值得
 追蹤你的選取        串流答案，              得到概念、別名和         顯示的概念，並畫出
                     解析概念                遭遇                     底線與卡片
```

1. **讀取。** content script 擷取頁面的可讀文字（arXiv 上用 LaTeXML 結構，其他地方用 Readability），並保留一份從文字偏移量回到 DOM 節點的對照表。
2. **解釋。** background worker 檢查網站規則、選擇模型、套用本機速率限制，並把術語連同所在段落送出。提示詞會把已知概念列為候選，讓模型可以說「這與 c1 是同一個概念」。對回覆的解析相當寬容：被截斷的卡片、結尾多餘的逗號、帶裝飾的標籤都能容忍。
3. **記住。** 結果會變成事件（`concept.created`、`encounter.created`、`edge.proposed` 等）。概念、別名和合併都是由重放日誌推導出來的，從不另外儲存，因此更好的比對規則也能改善舊記錄。
4. **重逢。** 在每個頁面上，Aho-Corasick 比對器會掃描文字中所有已知的名稱和縮寫。接著，重逢選擇會套用讓它保持實用的規則：不在你查詢該術語的那個頁面上、不在最小間隔之內、被靜音的概念保持靜音，而有歧義的縮寫需要頁面上出現同一領域的第二個術語。

## 安裝

需要 Node 22 或更新版本以及 [pnpm](https://pnpm.io)。目前還沒有上架商店，所以請從原始碼載入擴充功能：

```sh
# 在儲存庫根目錄
pnpm install
pnpm --filter @harkback/extension build
```

開啟 `chrome://extensions`，啟用**開發人員模式**，選擇**載入未封裝項目**，然後選取 `apps/extension/.output/chrome-mv3`。安裝後會開啟引導頁面。

**Microsoft Edge。** 在 `apps/extension` 中執行 `pnpm build -b edge`（或 `pnpm zip:edge`），開啟 `edge://extensions`，打開**開發人員模式**，選擇**載入解壓縮項目**，然後選取 `apps/extension/.output/edge-mv3`。Edge 可能沒有 Chrome 的內建模型；請在設定中選擇其他模型。

## 連接模型

引導分三步：**歡迎**（一個重逢提示範例，以及一則不呼叫任何模型就能試用的內建範例解釋）、**隱私**（你的文字會送到哪裡；必須勾選同意方塊，「下一步」才會啟用）和**模型**（選擇服務商，然後「完成」）。再次執行引導會更新你已有的模型，而不是新增一份副本。之後你可以在設定頁新增更多模型、更改選項，設定頁也可以設定速率限制、重逢提示，以及模型沉默多久後放棄請求。

![設定頁，帶有一個模型：名稱、模型、位址、API 金鑰和「測試連線」按鈕](assets/settings.png)

| 服務商                     | Base URL                                           | 備註                                                                                                   |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Ollama                     | `http://127.0.0.1:11434/v1`                        | 本機，不需要金鑰。見下文。                                                                             |
| Chrome 內建（Gemini Nano） | 無                                                 | 在這台電腦上，不需要金鑰。在引導或設定中下載。是個小模型：比雲端模型慢，在英語、西班牙語和日語上最好。 |
| OpenAI                     | `https://api.openai.com/v1`                        | 需要 API 金鑰。                                                                                        |
| Anthropic                  | `https://api.anthropic.com/v1`                     | 需要 API 金鑰。                                                                                        |
| Google Gemini              | `https://generativelanguage.googleapis.com/v1beta` | 需要 API 金鑰。                                                                                        |
| xAI Grok                   | `https://api.x.ai/v1`                              | 需要 API 金鑰。                                                                                        |
| OpenRouter                 | `https://openrouter.ai/api/v1`                     | 需要 API 金鑰。                                                                                        |
| 自訂                       | 任何位址                                           | 必須是 `https`，本機與你自己的網路（`192.168.x.x`、`10.x.x.x`、`name.local`、Tailscale）除外。         |

每個服務商使用自己的格式：Anthropic 與 Google Gemini 使用原生 API，其餘（包括 Ollama、Grok、OpenRouter 和任何自訂位址，例如公司的代理）都使用 OpenAI 相容格式。選擇服務商會自動填入它的位址，你仍然可以修改。其他 OpenAI 相容的服務請選擇**自訂**。

第一次測試或儲存模型時，Chrome 會請你允許存取該模型的位址。如果你拒絕，解釋卡片會直接說明，而不是以網路錯誤失敗。

**Ollama** 會拒絕來自瀏覽器擴充功能的請求，除非該擴充功能的來源已被允許。「測試連線」按鈕會顯示適用於你系統的確切指令，例如在 macOS 上：

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://<your-extension-id>"
```

然後重新啟動 Ollama。

## 使用方式

| 你想要                   | 這樣做                                                                           |
| ------------------------ | -------------------------------------------------------------------------------- |
| 解釋一個術語             | 選取它並點擊**解釋**，或按 `Alt+Shift+E`。                                       |
| 繼續追問                 | 使用卡片上的**追問**。問題與答案會連同解釋一起保存。                             |
| 掃描不在 arXiv 的頁面    | 點擊工具列按鈕，或在設定的「網站」中允許該網站以自動掃描。                       |
| 閱讀 PDF                 | 在 PDF 上點擊工具列按鈕：arXiv 論文會以 HTML 開啟，其他 PDF 在閱讀器中開啟。     |
| 查看你查過什麼           | 從設定頁或引導頁開啟歷史頁。它會即時更新，每個條目的來源標題會連回它所在的頁面。 |
| 保存你的記錄             | 歷史頁 →**匯出 Markdown**、**匯出 Anki 卡片**或**立即備份 JSONL**。              |
| 從備份還原               | 歷史頁 →**匯入 JSONL**。                                                         |
| 查看概念如何相連         | 歷史頁 →**關係圖**。                                                             |
| 不再為某個術語加底線     | 把滑鼠移到底線上 →**不再提示**。                                                 |
| 不讓某個來源送到遠端模型 | 卡片 →**標為敏感來源**，或在設定中為該網站新增敏感規則。                         |
| 處理看起來是私密的頁面   | 頁面角落的鎖頭，或第一次解釋時的提問：**僅用本機模型**或**照常傳送**。           |

## 文件

[`guide/`](guide/README.md) 資料夾有更詳細的說明（除了[快速上手指南](guide/zh-tw/getting-started.md)之外為英文）：

- [快速上手](guide/zh-tw/getting-started.md)、[使用指南](guide/user-guide.md)、[模型與服務商](guide/models.md)和[疑難排解](guide/troubleshooting.md)。
- [隱私與敏感來源](guide/privacy.md)：傳送了什麼、絕不傳送什麼，以及如何確保這一點。
- [架構](guide/architecture.md)和[資料格式](guide/data-format.md)，給貢獻者，也給想在你的記錄上開發的人。
- [更新日誌](CHANGELOG.md)。

## 隱私

- 當你要求解釋時，選取的文字、它所在的段落、章節和頁面標題，會依該服務商的條款，傳給你設定的模型服務。
- 在複習中，可選的**檢查我的答案**按鈕只在你按下時，才會把術語、你輸入的答案和它已儲存的解釋傳給你的模型。在設定中關閉後，這個按鈕就不會出現。它遵循與解釋相同的模型和敏感來源規則。
- 記錄留在這個瀏覽器中。備份只包含記錄，絕不包含設定或 API 金鑰。
- 只有 arxiv.org 會被自動掃描。在其他地方，你必須點擊按鈕、按 `Alt+Shift+E`，或允許該網站。
- 來自敏感來源的內容絕不會傳給非本機的模型，包括作為之後比較時的上下文。你自己網路上的伺服器也算非本機。一個來源會一直保持敏感，直到你在它的歷史條目上把它標為一般。
- 看起來是私密的頁面（私有的 GitHub 儲存庫；未發布的 Notion 或 Google 文件頁面）在你選擇之前不會傳給任何模型。網站沒有標明是否私密的頁面，在 Notion 和 Google 文件上會詢問，在 GitHub 上不會。頁面對自己的暗示只是一個提示，所以事關重要時請把網站標為敏感。
- 有一個設定可以讓敏感來源不出現在備份與匯出中。
- 無痕視窗會解釋，但從不記錄、掃描或顯示重逢提示。
- 重逢底線存在於頁面中，所以頁面自己的腳本可能推斷出你對哪些術語有記錄。
- 刪除一則解釋，會在應用程式中移除它；磁碟上可能留有痕跡，已匯出的備份也無法收回。
- API 金鑰以**未加密**的方式存放在擴充功能的儲存空間中。

擴充功能中顯示的說明才是依據：[`apps/extension/src/lib/pages/privacy.ts`](apps/extension/src/lib/pages/privacy.ts)。

## 你的資料

一切都是只追加日誌中的事件。格式是公開的：

- 事件類型與內容：[`packages/spec`](packages/spec)，以及產生的 [JSON schema](packages/spec/schema/event.schema.json)。
- 重放、比對與匯出：[`packages/core`](packages/core)，它沒有瀏覽器依賴，可以單獨使用。

因為概念和別名是由日誌推導出來的，你的 JSONL 備份就是你所知一切的完整、可攜的副本。

## 限制

- Chrome 與 Microsoft Edge（Manifest V3）。不支援 Firefox 和 Safari。Chrome 的內建模型並非每個瀏覽器都有；Edge 需要另一個模型。
- 解釋的品質取決於你選的模型；小型本機模型可能產生較弱的概念卡，這會降低重逢的品質，但不會影響記錄。
- 瀏覽器內建 PDF 檢視器中的文字無法讀取，所以 Harkback 會在自己的閱讀器頁面中開啟 PDF（arXiv 論文則改為前往 HTML 版本）。掃描版 PDF 會在你的電腦上用 OCR 讀取（英語內建；其他語言各需從 `cdn.jsdelivr.net` 下載一次），這比真正的文字更慢也更不精確，無法還原手寫內容、公式或表格，在複雜版面（表格、帶文字的圖、三欄以上）上的段落偵測也只是近似。你電腦上的 PDF 需要兩次授權：在 `chrome://extensions` 中為 Harkback 打開「允許存取檔案網址」，然後第一次在閱讀器頁面上點擊「允許本機檔案」。
- 自動縮寫比對要求全稱至少有三個單字（由 `Large Language Model` 得到 `LLM`）。同一領域中對應到不同全稱的兩個縮寫（例如兩個不同的 “GNN”）會被當作各自獨立的概念。
- 為了避免誤判，中文名稱和只用漢字書寫的日文名稱必須至少三個字才會被加底線；含假名或韓文字母的名稱有兩個字就可以。
- YouTube：只讀取已開啟字幕（CC）的 `www.youtube.com/watch` 頁面，而且只有播放器在頁面開啟後顯示過的字幕行可作為上下文。自動產生的字幕常把技術術語拼錯，拼錯的術語對不上你的記錄。不支援 Shorts、其他網站上的嵌入式播放器，以及全螢幕模式（播放器會隱藏 Harkback 的提示；請用劇院模式），YouTube 更動頁面可能讓字幕無法讀取，直到 Harkback 更新。
- GitHub、Notion 與 Google 文件：只讀取儲存庫首頁、issue 和 pull request（不含程式碼檔案）、Notion 頁面，以及發布版或行動版檢視的 Google 文件。Notion 只顯示它已繪製的區塊，所以較長的頁面可能只讀到一部分。Google 文件的編輯器是自己繪製文字的，無法讀取，預覽檢視也尚未驗證。這些網站會在沒有通知的情況下更改版面；當 Harkback 不再認得其中一個時，它會像讀其他頁面一樣讀取，直到更新。
- 比對時會忽略重音符號（“résumé” 與 “resume” 是同一個術語），但除了英語之外沒有詞幹還原，所以像德語複數這樣的屈折變化形式會被當作不同的術語。
- 介面預設為英語，也提供簡體中文、繁體中文、日語、韓語、西班牙語、法語、德語和巴西葡萄牙語。解釋可以用 16 種語言撰寫，在設定中另外選擇。匯出的筆記和 Markdown 只有英文或中文標籤。

## 專案結構

| 路徑             | 說明                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/spec`  | 事件格式：常數、zod schema，以及產生的 JSON schema。                                                     |
| `packages/core`  | 純邏輯：重放、名稱正規化、概念比對、重逢選擇、提示詞、輸出解析、JSONL 與 Markdown 匯出。                 |
| `apps/extension` | Chrome 擴充功能，使用 [WXT](https://wxt.dev) 建置：content script、background worker、歷史、設定與引導。 |
| `tools/lint`     | ESLint 設定。                                                                                            |
| `guide`          | 文件：使用指南、模型、隱私、架構、資料格式。                                                             |

## 開發

```sh
pnpm install
pnpm --filter @harkback/extension dev     # 即時重新載入
```

開啟 pull request 之前：

```sh
pnpm typecheck     # 所有套件
pnpm lint          # ESLint
pnpm test          # 單元測試
pnpm check:build   # 正式建置：manifest 權限與 content script 大小
pnpm e2e           # 在 Chromium 中的端對端測試（先執行一次 `pnpm exec playwright install chromium`）
pnpm format:check  # 格式
```

要為 Microsoft Edge Add-ons 打包發行版，請執行 `pnpm zip:edge`（見 `store/edge/README.md`）。要為 Chrome 線上應用程式商店打包發行版，請先提高 `apps/extension/package.json` 中的 `version`，然後執行 `pnpm release`。它會執行檢查、建置正式版擴充功能、驗證封裝，並寫出 `apps/extension/.output/harkback-<version>-chrome.zip`。只想建置 zip，請使用 `tools/package.sh --skip-checks`。

端對端測試會把建置好的擴充功能載入 Chromium，從 `apps/extension/fixtures` 提供 arXiv 頁面，並與一個本機的模擬模型伺服器通訊。它們涵蓋整個流程：讀取論文、解釋、記錄、歷史頁，以及在其他論文上的重逢。見 `apps/extension/e2e`。

## 參與貢獻

歡迎提交錯誤回報和 pull request。請先閱讀 [CONTRIBUTING.md](CONTRIBUTING.md)。要回報安全問題，請見 [SECURITY.md](SECURITY.md)。

## 授權條款

[Apache-2.0](LICENSE)
