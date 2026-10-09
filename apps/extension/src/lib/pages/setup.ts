import type { BuiltInState } from "../models/builtin-ai";
import { ollamaOriginsHelp, type ConnectionResult } from "../models/connection";
import { isLocalUrl } from "../models/model-policy";
import type { ModelConfig, Settings } from "../storage/settings";
import type { Lang } from "../ui/languages";
import { pick } from "../ui/pick";

export function onboardingSettings(
  current: Settings,
  input: { language: Lang; label: string; baseUrl: string; apiKey: string; model: string; provider: string },
  now: Date,
  newId: () => string,
): Settings {
  const model: ModelConfig = {
    id: newId(),
    label: input.label.trim() || "Model",
    baseUrl: input.baseUrl.trim(),
    apiKey: input.apiKey.trim(),
    model: input.model.trim(),
    provider: input.provider,
  };
  return {
    ...current,
    onboarded: true,
    consentAt: now.toISOString(),
    language: input.language,
    models: [...current.models, model],
    defaultModelId: model.id,
    localModelId: isLocalUrl(model.baseUrl) ? model.id : current.localModelId,
  };
}

/** What the options page says about Chrome's built-in model: its state, and the progress while it downloads. */
export function builtInMessage(lang: Lang, state: BuiltInState, percent?: number): string {
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(lang, zh, en, vars);
  switch (state) {
    case "available":
      return L("可以使用。Chrome 的模型在这台电脑上运行。", "Ready. Chrome's model runs on this computer.");
    case "downloadable":
      return L("还没有下载，请点“下载模型”。", "Not downloaded yet. Press Download model.");
    case "downloading":
      return L("正在下载… {percent}%", "Downloading… {percent}%", { percent: Math.round((percent ?? 0) * 100) });
    case "unavailable":
      return L(
        "这台设备上用不了。Chrome 需要足够的磁盘空间和内存，并且版本较新。",
        "Not available on this device. Chrome needs enough disk space and memory, and a recent version.",
      );
    case "unsupported":
      return L("这个 Chrome 没有内置模型，请更新 Chrome。", "This Chrome has no built-in model. Update Chrome.");
  }
}

export function connectionMessage(lang: Lang, result: ConnectionResult, extensionOrigin: string): string {
  const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(lang, zh, en, vars);
  switch (result.kind) {
    case "ok":
      return L("连接成功，可用模型 {n} 个。", "Connected. {n} models available.", { n: result.models.length });
    case "auth":
      return L("API key 无效或没有权限。", "The API key is invalid or lacks permission.");
    case "origin_blocked": {
      const help = ollamaOriginsHelp(extensionOrigin);
      return L(
        "Ollama 拒绝了扩展的来源。请设置 OLLAMA_ORIGINS 后重启 Ollama：\nmacOS：{mac}\nLinux：{linux}\nWindows：{windows}",
        "Ollama rejected the extension's origin. Set OLLAMA_ORIGINS, then restart Ollama:\nmacOS: {mac}\nLinux: {linux}\nWindows: {windows}",
        help,
      );
    }
    case "insecure":
      return L("地址无效：非本机地址必须使用 https。", "Invalid address: non-local addresses must use https.");
    case "http":
      return L("服务返回错误（HTTP {status}）。", "The service returned an error (HTTP {status}).", { status: result.status });
    case "unreachable":
      return L("连不上这个地址。使用 Ollama 时请确认它已启动。", "Cannot reach this address. For Ollama, make sure it is running.");
  }
}
