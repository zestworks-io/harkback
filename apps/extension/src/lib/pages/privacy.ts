import type { Lang } from "../ui/languages";
import { pick } from "../ui/pick";

export const PRIVACY = {
  zh: [
    "划词解释时，选中的文字、所在段落、章节与页面标题会发送给你选择的模型服务，按该服务商的条款处理。",
    "记录只保存在本机浏览器中；每周自动导出一份 JSONL 备份到「下载/harkback」，只含记录，不含设置与 API key。",
    "默认只在 arxiv.org 自动扫描；其他网站需要你点击扩展图标、按 Alt+Shift+E，或在设置中加入白名单。",
    "重逢提示显示在网页上，网页自己的脚本可能据此推断你在哪些词上有记录。",
    "处理保密材料时，请在设置中把该网站标为敏感并使用本机模型（如 Ollama）；敏感来源的内容不会发给非本机模型。",
    "无痕窗口默认不启用；启用后只解释、不记录、不显示重逢。",
    "删除在应用层生效；磁盘上可能仍有残留，已导出的备份无法追回。建议开启全盘加密。",
    "API key 保存在浏览器扩展存储中，未加密；只发送到你填写的模型地址，不进入备份或日志。建议使用有额度限制的 key。",
  ],
  en: [
    "When you ask for an explanation, the selected text, its paragraph, the section and the page title are sent to the model service you choose, under that provider's terms.",
    "Records stay in this browser. A JSONL backup is saved to Downloads/harkback every week; it contains records only, never settings or API keys.",
    "Pages are scanned automatically only on arxiv.org. Elsewhere, click the toolbar button, press Alt+Shift+E, or allow the site in settings.",
    "Reunion hints are shown on the page, so the page's own scripts may infer which terms you have records for.",
    "For confidential material, mark the site as sensitive and use a local model such as Ollama; content from sensitive sources is never sent to non-local models.",
    "Private windows are off by default; when enabled, the extension explains but records nothing and shows no reunions.",
    "Deletion takes effect in the app; traces may remain on disk and exported backups cannot be recalled. Full-disk encryption is recommended.",
    "API keys are stored unencrypted in the extension's storage; they are only sent to the model address you enter and never go into backups or logs. Prefer a key with a spending limit.",
  ],
};

/** The privacy notes in a language: the written-out Chinese ones, or the English ones translated by their text. */
export function privacyNotes(lang: Lang): string[] {
  return PRIVACY.zh.map((zh, i) => pick(lang, zh, PRIVACY.en[i]!));
}
