import type { ErrorCode } from "../messages";

export type Lang = "zh" | "en";

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
  recalled: "想起来了",
  reexplain: "再解释一次",
  compare: "对比两处用法",
  mute: "不再提示",
  retry: "重试",
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
  err_expired: "这次解释已失效，请重新解释。",
  err_internal: "出错了，请重试。",
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
  recalled: "I remember",
  reexplain: "Explain again",
  compare: "Compare usages",
  mute: "Don't show again",
  retry: "Try again",
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
  err_expired: "This explanation expired. Please explain again.",
  err_internal: "Something went wrong. Try again.",
};

const TABLE: Record<Lang, Record<StringKey, string>> = { zh, en };

type ErrorKey = `err_${ErrorCode}`;
// Compile-time check that every error code has a message.
const errorKeysExist: ErrorKey extends StringKey ? true : never = true;
void errorKeysExist;

export function t(lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string {
  return TABLE[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function errorText(lang: Lang, code: ErrorCode, retryAfterMs = 0): string {
  return t(lang, `err_${code}`, { s: Math.ceil(retryAfterMs / 1000) });
}
