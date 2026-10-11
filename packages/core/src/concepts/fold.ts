/**
 * Spellings that are one word to a reader but several to a string comparison. Every function here is used on both sides of a
 * comparison (the name a reader looked up and the page text), so it only has to be consistent. The text a reader sees is
 * never changed.
 */

/**
 * Traditional characters that technical terms are written with, each followed by its Simplified form: "神經網絡" and
 * "神经网络" are one term. A character whose Simplified form is also a different Traditional word (干, 面, 里, 志) is left out.
 */
export const HAN_PAIRS: readonly string[] = [
  "學学 習习 機机 網网 絡络 經经 數数 據据 訓训 練练 預预 測测 應应 優优 損损 層层 積积 遞递 歸归 進进 變变 換换 壓压 縮缩",
  "維维 線线 義义 詞词 語语 譯译 識识 別别 類类 決决 樹树 隨随 貝贝 葉叶 條条 統统 計计 論论 證证 質质 態态 獨独 聯联 邊边",
  "緣缘 圖图 視视 覺觉 聲声 頻频 譜谱 號号 時时 間间 閾阈 約约 懲惩 罰罚 陣阵 張张 標标 準准 異异 擬拟 過过 擾扰 動动 對对",
  "強强 獎奖 勵励 價价 環环 狀状 觀观 馬马 爾尔 羅罗 採采 樣样 顯显 誤误 區区 離离 連连 續续 運运 簡简 單单 複复 雜杂 範范",
  "圍围 長长 記记 憶忆 門门 編编 碼码 轉转 調调 參参 級级 邏逻 輯辑 納纳 繹绎 關关 係系 屬属 結结 構构 節节 點点 鄰邻 擴扩",
  "濾滤 導导 極极 閉闭 開开 發发 後后 驗验 會会 認认 靈灵 實实 現现 評评 資资 訊讯 熱热 電电 腦脑 軟软 體体 庫库 檔档 處处",
  "並并 與与 為为 從从 這这 個个 們们 說说 寫写 讀读 見见 於于 該该 當当 無无 際际 設设 則则 規规 劃划 問问 題题 啟启 尋寻",
  "詢询 檢检 監监 遷迁 餾馏 專专 驅驱 擇择 嘗尝 臨临 誘诱 稱称 塊块 鏈链 帶带 倉仓 遊游 戲戏 錯错 隱隐 還还 讓让 協协 議议",
  "內内 閱阅 聽听 師师 傳传 輸输 輪轮 軸轴 軌轨 較较 載载 達达 遠远 適适 選选 盤盘 鍵键 鑰钥 針针 鎖锁 鐘钟 鏡镜 鐵铁 隊队",
  "階阶 難难 雙双 項项 順顺 須须 領领 頭头 頁页 頂顶 願愿 顏颜 風风 飛飞 館馆 饋馈 魚鱼 鳥鸟 麥麦 齊齐 齡龄 藝艺 紅红 紀纪",
  "純纯 紙纸 細细 組组 終终 給给 絕绝 綜综 綠绿 緒绪 總总 縱纵 織织 繞绕 聰聪 職职 脈脉 臟脏 裝装 補补 觸触 討讨 許许 訪访",
  "試试 詳详 話话 課课 談谈 請请 諸诸 謂谓 護护 負负 貢贡 財财 責责 貴贵 買买 費费 賽赛 贊赞 趨趋 跡迹 踐践 軍军 農农 遲迟",
  "醫医 釋释 銀银 錄录 陽阳 陰阴 雖虽 靜静 響响 驚惊 歲岁 歷历 殺杀 歐欧 氣气 沒没 況况 減减 溫温 滿满 漸渐 潔洁 濟济 灣湾",
  "煙烟 營营 燈灯 爭争 獻献 產产 畫画 盡尽 眾众 礎础 確确 禮礼 窮穷 筆笔 築筑 簽签 籌筹 糧粮 糾纠 紐纽 緊紧 緩缓 縣县 繼继",
  "腳脚 舉举 舊旧 藥药 虛虚 蟲虫 術术 衛卫 製制 親亲 貿贸 賴赖 轄辖 辦办 辭辞 閃闪 頓顿 額额 顧顾 幾几 潛潜 衝冲 疊叠 嚴严",
  "獲获 橫横 擊击",
]
  .join(" ")
  .split(" ");

const HAN_MAP = new Map<string, string>(HAN_PAIRS.map((pair) => [pair[0]!, pair[1]!]));

export function foldHan(s: string): string {
  let out = "";
  for (const ch of s) out += HAN_MAP.get(ch) ?? ch;
  return out;
}

const ARABIC_MARK = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed\u0640]/u;

/** Vowel marks and the tatweel (the stretching line), which a writer may or may not put in. */
export const isArabicMark = (ch: string): boolean => ARABIC_MARK.test(ch);

const ARABIC_LETTER: Record<string, string> = {
  "\u0623": "\u0627", // alef with hamza above
  "\u0625": "\u0627", // alef with hamza below
  "\u0622": "\u0627", // alef with madda
  "\u0671": "\u0627", // alef wasla
  "\u0649": "\u064a", // alef maksura -> ya
  "\u06cc": "\u064a", // Persian ya
  "\u0629": "\u0647", // ta marbuta -> ha
  "\u06a9": "\u0643", // Persian kaf
};

/**
 * Drops vowel marks and the tatweel, writes the alef, ya and ta marbuta forms that writers mix up in one form, turns the
 * Persian kaf and ya into the Arabic ones, and writes Arabic-Indic and Persian digits as ASCII digits.
 */
export function foldArabic(s: string): string {
  let out = "";
  for (const ch of s) {
    if (isArabicMark(ch)) continue;
    const c = ch.codePointAt(0)!;
    if (c >= 0x0660 && c <= 0x0669) out += String(c - 0x0660);
    else if (c >= 0x06f0 && c <= 0x06f9) out += String(c - 0x06f0);
    else out += ARABIC_LETTER[ch] ?? ch;
  }
  return out;
}
