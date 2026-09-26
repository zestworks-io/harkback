import { ollamaOriginsHelp, type ConnectionResult } from "../connection";
import { isLocalUrl } from "../routing";
import type { ModelConfig, Settings } from "../settings";
import type { Lang } from "../ui/strings";

export const TEMPLATES = [
  { id: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
] as const;

export function onboardingSettings(
  current: Settings,
  input: { language: Lang; label: string; baseUrl: string; apiKey: string; model: string },
  now: Date,
  newId: () => string,
): Settings {
  const model: ModelConfig = {
    id: newId(),
    label: input.label.trim() || "Model",
    baseUrl: input.baseUrl.trim(),
    apiKey: input.apiKey.trim(),
    model: input.model.trim(),
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

export function connectionMessage(lang: Lang, result: ConnectionResult, extensionOrigin: string): string {
  const L = (zh: string, en: string) => (lang === "zh" ? zh : en);
  switch (result.kind) {
    case "ok":
      return L(`连接成功，可用模型 ${result.models.length} 个。`, `Connected. ${result.models.length} models available.`);
    case "auth":
      return L("API key 无效或没有权限。", "The API key is invalid or lacks permission.");
    case "origin_blocked": {
      const help = ollamaOriginsHelp(extensionOrigin);
      return L(
        `Ollama 拒绝了扩展的来源。请设置 OLLAMA_ORIGINS 后重启 Ollama：\nmacOS：${help.mac}\nLinux：${help.linux}\nWindows：${help.windows}`,
        `Ollama rejected the extension's origin. Set OLLAMA_ORIGINS, then restart Ollama:\nmacOS: ${help.mac}\nLinux: ${help.linux}\nWindows: ${help.windows}`,
      );
    }
    case "insecure":
      return L("地址无效：非本机地址必须使用 https。", "Invalid address: non-local addresses must use https.");
    case "http":
      return L(`服务返回错误（HTTP ${result.status}）。`, `The service returned an error (HTTP ${result.status}).`);
    case "unreachable":
      return L("连不上这个地址。使用 Ollama 时请确认它已启动。", "Cannot reach this address. For Ollama, make sure it is running.");
  }
}
