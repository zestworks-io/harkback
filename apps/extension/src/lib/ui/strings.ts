import type { ErrorCode } from "../messaging/messages";
import type { Lang } from "./languages";

export type { Lang };

const zh = {
  explain: "解释",
  loading: "正在解释…",
  close: "关闭",
  tierDefined: "原文定义",
  tierExternal: "外部知识",
  askSame: "这是你 {days} 天前查过的「{name}」吗？",
  yes: "是",
  no: "不是",
  understood: "懂了",
  confused: "还是不懂",
  followUp: "追问",
  followUpPlaceholder: "输入你的问题",
  send: "发送",
  markSensitive: "标为敏感来源",
  markedSensitive: "已标为敏感来源：此后只使用本机模型。",
  notRecorded: "无痕窗口：只解释，不记录。",
  openLink: "打开链接：{url}",
  openConfirm: "打开",
  daysAgo: "{n} 天前",
  related: "你没查过「{a}」，但 {n} 天前弄懂了「{b}」",
  thenExplained: "当时的解释：{text}",
  whyDirect: "划线原因：页面上的“{text}”就是你查过的“{name}”。",
  whyRelated: "划线原因：页面上的“{text}”与你弄懂的“{via}”有关。",
  recalled: "想起来了",
  reexplain: "再解释一次",
  compare: "对比两处用法",
  mute: "不再提示",
  retry: "重试",
  stop: "停止",
  tryModel: "改用 {model}",
  err_site_disabled: "已在此网站停用。",
  err_no_model: "还没有配置模型，请在设置中添加。",
  err_needs_local_model: "这是敏感来源，只能使用本机模型；请在设置中配置本机模型。",
  err_insecure_model: "模型地址不安全：非本机地址必须使用 https。",
  err_sensitive_compare: "之前的记录来自敏感来源，不能发送给非本机模型。",
  err_empty_selection: "选中的内容里没有可以解释的文字。",
  err_auth: "模型服务拒绝了请求：请检查 API key（Ollama 请检查 OLLAMA_ORIGINS 设置）。",
  err_rate_limited: "模型服务限流（429），请稍后重试。",
  err_timeout: "模型长时间没有响应，请重试。",
  err_network: "连不上模型服务，请检查地址与网络。",
  err_http: "模型服务返回了错误。",
  err_insecure: "非本机模型地址必须使用 https。",
  err_aborted: "已取消。",
  err_local_rate: "解释太频繁了，请 {s} 秒后再试。",
  err_no_permission: "还没有允许访问模型地址：请在设置中点“测试”或保存，并在弹窗中允许。",
  err_expired: "这次解释已失效，请重新解释。",
  err_internal: "出错了，请重试。",
  err_unavailable: "Chrome 内置模型还不能用：请在设置的模型页下载它，或确认这台电脑和 Chrome 版本支持它。",
  previewTitle: "预览本页概念",
  previewAsk: "Scan this page for its key concepts, to see which you know and which to read first?",
  previewScan: "扫描",
  previewScanning: "正在扫描…",
  previewConfused: "仍困惑",
  previewRusty: "有点生疏",
  previewNew: "没见过",
  previewUnderstood: "已懂",
  previewShow: "预习",
  previewWorking: "正在写…",
  previewStored: "你之前的解释",
  previewGenerated: "模型生成，不会记录",
  previewLocal: "页面文字会留在本机，使用本机模型 {model}。",
  previewRemote: "页面文字会发送给远程模型 {model}。",
  previewCovered: "只扫描了页面开头的 {n} 个字符（共 {total} 个），后面的术语不在其中。",
} as const;

export type StringKey = keyof typeof zh;

const en: Record<StringKey, string> = {
  explain: "Explain",
  loading: "Explaining…",
  close: "Close",
  tierDefined: "Defined in source",
  tierExternal: "External knowledge",
  askSame: "Is this the “{name}” you looked up {days} days ago?",
  yes: "Yes",
  no: "No",
  understood: "Got it",
  confused: "Still confused",
  followUp: "Ask more",
  followUpPlaceholder: "Your question",
  send: "Send",
  markSensitive: "Mark source as sensitive",
  markedSensitive: "Marked as sensitive: only local models from now on.",
  notRecorded: "Private window: explained, not recorded.",
  openLink: "Open link: {url}",
  openConfirm: "Open",
  daysAgo: "{n} days ago",
  related: "You haven't looked up “{a}”, but you understood “{b}” {n} days ago",
  thenExplained: "Earlier explanation: {text}",
  whyDirect: "Underlined because “{text}” on this page is the term “{name}” you looked up.",
  whyRelated: "Underlined because “{text}” on this page is linked to “{via}”, which you understood.",
  recalled: "I remember",
  reexplain: "Explain again",
  compare: "Compare usages",
  mute: "Don't show again",
  retry: "Try again",
  stop: "Stop",
  tryModel: "Try with {model}",
  err_site_disabled: "Disabled on this site.",
  err_no_model: "No model configured yet. Add one in settings.",
  err_needs_local_model: "This source is sensitive and can only use a local model. Configure one in settings.",
  err_insecure_model: "Insecure model address: non-local addresses must use https.",
  err_sensitive_compare: "The earlier record comes from a sensitive source and cannot be sent to a non-local model.",
  err_empty_selection: "The selection has nothing to explain.",
  err_auth: "The model service rejected the request. Check the API key (for Ollama, check OLLAMA_ORIGINS).",
  err_rate_limited: "The model service is rate limiting (429). Try again later.",
  err_timeout: "The model stopped responding. Try again.",
  err_network: "Cannot reach the model service. Check the address and your network.",
  err_http: "The model service returned an error.",
  err_insecure: "Non-local model addresses must use https.",
  err_aborted: "Cancelled.",
  err_local_rate: "Too many explanations. Try again in {s} seconds.",
  err_no_permission: "Access to the model address has not been granted. In settings, press Test or Save and allow the prompt.",
  err_expired: "This explanation expired. Please explain again.",
  err_internal: "Something went wrong. Try again.",
  err_unavailable:
    "Chrome's built-in model is not ready. Download it in settings, or check that this computer and Chrome version support it.",
  previewTitle: "Preview this page",
  previewAsk:
    "Scan this page for its key concepts, to see which you know and which to read first? The page text is sent to your configured model (sensitive sources only use a local model).",
  previewScan: "Scan",
  previewScanning: "Scanning…",
  previewConfused: "Still confused",
  previewRusty: "Rusty",
  previewNew: "New to you",
  previewUnderstood: "Known",
  previewShow: "Preview",
  previewWorking: "Writing…",
  previewStored: "Your earlier explanation",
  previewGenerated: "Written by the model, not recorded",
  previewLocal: "The page text stays on this computer: local model {model}.",
  previewRemote: "The page text will be sent to the remote model {model}.",
  previewCovered: "Only the first {n} of {total} characters were scanned, so terms later in the page are missing.",
};

const TABLE: Partial<Record<Lang, Readonly<Partial<Record<StringKey, string>>>>> = { zh, en };

/**
 * Text for the other languages is sent by the background page with the page info, so the content script does not carry
 * every language. Keys that are missing fall back to English.
 */
export function useStrings(lang: Lang, table: Readonly<Partial<Record<StringKey, string>>>): void {
  if (lang !== "zh" && lang !== "en") TABLE[lang] = table;
}

type ErrorKey = `err_${ErrorCode}`;
// Compile-time check that every error code has a message.
const errorKeysExist: ErrorKey extends StringKey ? true : never = true;
void errorKeysExist;

export function t(lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string {
  return (TABLE[lang]?.[key] ?? en[key]).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function errorText(lang: Lang, code: ErrorCode, retryAfterMs = 0): string {
  return t(lang, `err_${code}`, { s: Math.ceil(retryAfterMs / 1000) });
}
