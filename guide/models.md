# Models and providers

Harkback sends one request to the model you configure whenever you ask for an explanation or a follow-up. It has no server of its own, and nothing else is sent anywhere.

## Providers

Picking a provider fills in its address; you can still edit it. The provider decides the wire format.

| Provider      | Address                                            | Format            | Key      | Example model                 |
| ------------- | -------------------------------------------------- | ----------------- | -------- | ----------------------------- |
| Ollama        | `http://127.0.0.1:11434/v1`                        | OpenAI-compatible | no       | `qwen3`                       |
| OpenAI        | `https://api.openai.com/v1`                        | OpenAI            | yes      | `gpt-4o-mini`                 |
| Anthropic     | `https://api.anthropic.com/v1`                     | Anthropic native  | yes      | `claude-sonnet-5-5`           |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | Gemini native     | yes      | `gemini-2.5-flash`            |
| xAI Grok      | `https://api.x.ai/v1`                              | OpenAI-compatible | yes      | `grok-4`                      |
| OpenRouter    | `https://openrouter.ai/api/v1`                     | OpenAI-compatible | yes      | `anthropic/claude-sonnet-5-5` |
| Custom        | anything                                           | OpenAI-compatible | optional | –                             |

Choose **Custom** for LiteLLM, vLLM, LM Studio, llama.cpp's server, a company gateway, or any other service that speaks the OpenAI chat-completions format. You may paste an address that already ends in `/chat/completions` or `/messages`; Harkback trims it.

The first time you test or save a model, Chrome asks whether Harkback may reach its address. If you decline, the explain card says so instead of failing with a network error.

## Which address is allowed

| Address                                                                                                                                                                  | Plain `http`     | Counts as local |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | --------------- |
| `127.0.0.1`, `localhost`, `[::1]`                                                                                                                                        | yes              | yes             |
| Your own network: `192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`, `169.254.x.x`, Tailscale `100.64–127.x.x`, `*.local`, `*.lan`, `*.ts.net`, IPv6 `fc00::/7` and `fe80::/10` | yes              | **no**          |
| Anything else                                                                                                                                                            | no, `https` only | no              |

"Local" matters because [sensitive sources](privacy.md) are only ever sent to a local model. A server on your home network is reachable only from inside it, so plain `http` is accepted, but it is a different machine, so it is treated as remote.

## Ollama

Ollama rejects requests from browser extensions unless the extension's origin is allowed. The **Test connection** button shows the exact command with your extension id. For example, on macOS:

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://<your-extension-id>"
```

Then quit and restart Ollama. On Linux with systemd, add `Environment="OLLAMA_ORIGINS=chrome-extension://<id>"` to the service with `systemctl edit ollama`. On Windows, set `OLLAMA_ORIGINS` as a user environment variable and restart Ollama.

To use Ollama on another computer, start it with `OLLAMA_HOST=0.0.0.0` there and enter `http://<that-computer>:11434/v1` here. Ollama has no authentication, so only do this on a network you trust.

Small local models may write weaker concept cards (relations and aliases). That lowers recall quality but never stops an explanation from being recorded.

## Several models

You can configure as many models as you like.

- **Default model** – used for everything unless a rule says otherwise.
- **For sensitive sources** – tick this on one _local_ model. Sensitive sources use it, and never any other.
- **Per site** – a site rule can name a model for matching pages.
- **After a failure** – the explain card offers each of the other models as _Try with …_.

## Rate limits

Harkback limits itself to 10 explanations per minute and 100 per hour by default (settings → _Limits and hints_). A request that fails before an answer arrives does not count.

## API keys

Keys are stored **unencrypted** in the extension's storage. Other sites and extensions cannot read them, but anyone with access to your computer's disk can. A key is only sent to the address you entered, and never goes into backups or logs. Use a key with a spending limit, or a local model.
