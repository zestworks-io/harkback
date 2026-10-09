<p align="center">
  <img src="assets/logo.png" alt="Harkback" width="96">
</p>

<h1 align="center">Harkback</h1>

<h3 align="center">
边读边解释术语，记住你弄懂了什么。<br>下次再遇到时，把它找回来。
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
| <a href="#快速开始"><b>快速开始</b></a> | <a href="#功能"><b>功能</b></a> | <a href="guide/README.md"><b>文档</b></a> | <a href="#隐私"><b>隐私</b></a> | <a href="CHANGELOG.md"><b>更新日志</b></a> | <a href="CONTRIBUTING.md"><b>参与贡献</b></a> |
</p>

<p align="center"><a href="README.md">English</a> · <b>简体中文</b></p>

Harkback 是一个面向论文与技术文档读者的 Chrome 扩展。选中一个术语，它会结合上下文给出解释；每次解释都会保存到本机的只追加日志里。之后在别的页面再遇到同一个术语（哪怕写法不同），Harkback 会给它加下划线，并告诉你上次是怎么理解的。

> "harken back"：回到先前的某一点。

<p align="center">
  <a href="assets/demo.mp4"><img src="assets/demo.gif" alt="Demo" width="720"></a>
  <br><sub>在 PDF 里选中术语、继续追问，整段对话都会被保存。点击动图查看完整视频。</sub>
</p>

## 快速开始

```sh
git clone https://github.com/zestworks-io/harkback.git && cd harkback
pnpm install && pnpm --filter @harkback/extension build
```

打开 `chrome://extensions`，开启**开发者模式**，选择**加载已解压的扩展程序**，指向 `apps/extension/.output/chrome-mv3`。然后选择模型：

<details open>
<summary><b>本地模型（免费）</b></summary>

安装 [Ollama](https://ollama.com) 并拉取一个模型，在引导页选择 **Ollama**。点「测试连接」会给出允许扩展访问的那一条命令。数据不会离开你的电脑。

</details>

<details>
<summary><b>云端模型（使用你自己的 API Key）</b></summary>

选择 OpenAI、Anthropic、Google Gemini、xAI Grok、OpenRouter，或自定义的 OpenAI 兼容地址，填入你的 Key。费用由服务商直接向你收取，Harkback 中间没有服务器。

</details>

然后在任意页面选中术语，按 `Alt+Shift+E`。详见[安装](#安装)与[连接模型](#连接模型)。

<details>
<summary><b>目录</b></summary>

- [为什么不直接问 ChatGPT？](#为什么不直接问-chatgpt)
- [功能](#功能)
- [你的知识图谱](#你的知识图谱)
- [工作原理](#工作原理)
- [安装](#安装)
- [连接模型](#连接模型)
- [使用方法](#使用方法)
- [文档](#文档)
- [隐私](#隐私)
- [你的数据](#你的数据)
- [限制](#限制)
- [仓库结构](#仓库结构)
- [开发](#开发)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

</details>

## 为什么不直接问 ChatGPT？

把术语贴给聊天机器人，也能得到不错的回答。Harkback 并不想给出更好的回答，它补上的是聊天窗口缺少的**记忆**：你查过的每个术语都会成为一条记录，连着页面、原文引文和日期，这些记录再连成一张属于你自己的知识图谱。

|                | 直接问聊天机器人               | Harkback                                                     |
| -------------- | ------------------------------ | ------------------------------------------------------------ |
| **上下文**     | 复制术语和一段文字，切换标签页 | 在页面上选中术语，所在段落和章节会一并带上，引文会被核对     |
| **下一次**     | 新对话从零开始，或者你忘了问过 | 之后的页面上术语会被加下划线，并显示你上次的理解             |
| **结构**       | 一堆聊天记录                   | 概念及其别名、前置概念、变体和相关术语                       |
| **巩固**       | 没有                           | 由记忆模型安排的复习队列：每个术语在你快要忘记时回来         |
| **你的记录**   | 保存在服务商的账号里           | 留在你的浏览器里，可导出 Markdown、Obsidian 笔记或 JSONL     |
| **模型与费用** | 一个服务、一种套餐             | 任何受支持的模型：本机 Ollama 不花钱，也可以用自己的 API key |

Harkback 免费开源（Apache-2.0），没有服务器，也没有订阅。解释本身仍需要一个模型来写：本机模型免费，云端模型由服务商按你自己的 key 计费。

## 功能

- **结合上下文解释。** 选中术语，点「解释」或按 `Alt+Shift+E`。答案由你配置的模型流式返回，并标注为「原文定义」（页面自己定义了该术语，引文已与页面文字核对）或「外部知识」。
- **追问对话。** 在卡片上继续追问，每个问题都显示在它的答案上方，整段对话会和解释一起保存。历史页可以完整查看，搜索也能找到；公式会被排版显示。
- **记住。** 每次解释、追问以及「懂了 / 还是不懂」都会作为事件存入 IndexedDB。除你触发的模型请求外，没有任何内容离开浏览器。
- **重逢提示。** 在之后的页面上，你查过的术语会带下划线。悬停即可看到你何时、在哪里遇到过它、当时怎么理解的，以及页面上哪段文字触发了划线，还可以标记「想起来了」、再解释一次、对比两处用法，或不再提示。
- **同一概念，多种写法。** `LLM`、`LLMs`、`the LLM`、`large language model`、`Large-Language Models` 是同一个概念；`β-VAE` 与 `beta-VAE`、`fine-tuning` 与带连字的 `ﬁne-tuning` 也是。相近但不确定的写法会问你：「这是你 3 天前查过的术语吗？」
- **相关术语。** 如果模型指出 `QLoRA` 是 `LoRA` 的变体，那么只出现 `QLoRA` 的页面也会提醒你当初对 `LoRA` 的理解。
- **概念页。** 在历史页打开任一术语，可以看到你对它的理解程度、前置概念、变体和相关术语，以及每次遇到它的记录。你还可以添加别名、合并重复的概念、移除错误的关系，或不再提示某个术语。
- **复习。** 历史页有「复习」按钮，显示待复习的术语数。每个术语由 [FSRS](https://github.com/open-spaced-repetition/fsrs4anki) 记忆模型安排：把回答评为「没记住」「勉强记得」「记住了」或「很轻松」，术语就会在你快要忘记时回来，所以容易的词间隔迅速拉长，难的词很快再来；每个按钮都显示术语何时回来。显示解释前可以先写下你记得的内容，可选的**检查我的回答**会让你的模型判断你离答案多近（它只建议评分，由你决定，也可以在设置中关闭）。整个复习可以只用键盘完成：空格显示解释，`1`–`4` 评分，`S` 跳过。若某个术语与它的先修概念同时到期，先修概念会排在前面；对仍然困惑或不太牢的术语，会指出可能缺失的先修概念。在重逢提示上点「想起来了」也算一次轻量复习。一项设置决定术语到期时你希望还记得的概率（默认 90%）。工具栏图标上的角标显示到期数量。
- **周报。** 历史页的「周报」显示一周里遇到了什么：新术语和重温的术语、回答情况、仍然困惑的术语、你在哪里读，以及概念之间的新联系。它由你的记录在本机生成，不调用任何模型。
- **接着你已懂的讲。** 查一个与你已理解的术语相近的词时，模型会得知这一点，直接讲它们的区别，而不是从头解释。
- **默认保护隐私。** 只在 arxiv.org 自动扫描；敏感网站可强制使用本机模型；无痕窗口不记录、不扫描。
- **数据可迁移。** 可导出 Markdown、Anki 卡片，或一个笔记文件夹（每个概念一个文件，带 `[[链接]]`，可直接用于 Obsidian；你写在标记行下面的内容在下次导出时会保留），或带版本、有公开 JSON schema 的 JSONL 事件日志；每周自动备份一份 JSONL 到 `Downloads/harkback`，在历史页点**导入 JSONL**即可恢复（已有的记录会被跳过）。可以在设置中让备份和导出不包含敏感来源。
- **停止、重试、换模型。** 回答生成时可点「停止」。失败后卡片提供「重试」；配置了多个模型时，还能用其他模型重试。
- **读前预览。** 点工具栏按钮、按 `Alt+Shift+P` 或用右键菜单，Harkback 会先问你要不要扫描这一页，并说明将使用哪个模型、是不是远程模型，同意之前不会发送任何内容。一次模型调用提取页面的关键术语，再用你自己的记录把它们分成「仍困惑」「有点生疏」「没见过」「已懂」。点「预习」：已查过的词显示你之前的解释，没见过的词由模型写一段简短解释，都不会被记录。模型只看到页面文字，看不到你的概念库；敏感页面只使用本机模型。一次扫描读取页面的前 1.6 万个字符，页面更长时会提示被截掉了。
- **多种触发方式。** 选中文字后点「解释」（鼠标、键盘或触摸选择都行）、按 `Alt+Shift+E`，或用右键菜单里的「解释」。页面加载了更多文字、或不刷新就跳到另一页时会自动重新扫描。
- **自选模型。** Ollama、OpenAI、Anthropic、Google Gemini、xAI Grok、OpenRouter，或任何兼容 OpenAI 的服务；Anthropic 和 Gemini 使用各自的原生接口。

## 你的知识图谱

每次查词都会给图谱添一笔。这张图来自你自己的阅读，而不是通用模型的记忆。

- **概念是节点。** 无论页面怎么写（`LoRA`、`low-rank adaptation`），它都是同一个节点，并保留别名、所属领域和你的理解程度。
- **关系是边。** 查词时模型会提出 `variant_of`（变体）、`prerequisite`（前置）、`related`（相关）关系，例如 `QLoRA` 是 `LoRA` 的变体。你可以移除错误的关系、合并重复的概念，或添加别名。
- **一切都能追溯到证据。** 每个概念都列出所有遇到过的记录：页面、引文、日期、你的解释和追问对话。
- **图谱会派上用场。** 只提到 `QLoRA` 的页面会提醒你 `LoRA`；模型知道你已经懂什么，可以只讲差别；复习也是按概念安排的。
- **它属于你。** 导出一个带 `[[链接]]` 的笔记文件夹（每个概念一个文件），在 Obsidian 里就能看到图谱；也可以导出完整的 JSONL 事件日志。

在历史页打开**关系图**，就能把它看成一张地图：概念按理解程度着色（已理解、不太牢、仍困惑、新），箭头表示前置概念和变体，可按领域、理解程度或最近查词时间筛选。拖动移动，滚轮缩放，点击概念即可打开。也可以通过概念页浏览，或导出后在 Obsidian 中查看。

## 工作原理

```
 阅读                解释                    记住                     回想
 ────                ───────                 ────────                 ──────
 内容脚本        →   后台 worker         →   只追加事件日志       →   匹配器扫描下一个页面上
 提取页面文字        按站点敏感度选择模型    （IndexedDB），回放      的已知名称，挑出值得提示
 并跟踪选区          流式返回答案            出概念、别名与遇见记录   的概念，画出下划线与卡片
                     并判定属于哪个概念
```

1. **阅读。** 内容脚本提取页面正文（arXiv 使用 LaTeXML 结构，其他网站使用 Readability），并保留文字偏移到 DOM 节点的映射。
2. **解释。** 后台 worker 检查站点规则、选择模型、应用本地限流，然后把术语连同所在段落发出。提示词会列出已知概念作为候选，模型可以回答「这与 c1 是同一个概念」。对模型输出的解析很宽容：被截断的卡片、多余的逗号、带修饰的标签都能读出来。
3. **记住。** 结果被写成事件（`concept.created`、`encounter.created`、`edge.proposed` 等）。概念、别名与合并都是回放日志时推导出来的，不单独存储，所以匹配规则改进后，旧记录也会受益。
4. **回想。** 每个页面上，Aho-Corasick 匹配器扫描所有已知名称与缩写。随后的重逢筛选遵循几条让提示保持有用的规则：不在你查词的那个页面显示，不在最小间隔内重复，已静音的概念保持静音，有歧义的缩写需要同页出现同领域的另一个术语佐证。

## 安装

需要 Node 22 或更新版本和 [pnpm](https://pnpm.io)。目前没有商店上架，请从源码加载：

```sh
# 在仓库根目录
pnpm install
pnpm --filter @harkback/extension build
```

打开 `chrome://extensions`，开启**开发者模式**，选择**加载已解压的扩展程序**，选中 `apps/extension/.output/chrome-mv3`。安装后会自动打开引导页。

## 连接模型

引导页会带你完成这一步，还提供一个内置的示例解释，可以先试一试而不调用任何模型。之后也可以在设置页修改，包括模型多久没有回应就放弃请求。

![设置页：一个模型的名称、模型、地址、API key 和「测试连接」按钮](assets/settings.png)

| 服务          | Base URL                                           | 说明                                                                                             |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Ollama        | `http://127.0.0.1:11434/v1`                        | 本机，无需 key。见下文。                                                                         |
| OpenAI        | `https://api.openai.com/v1`                        | 需要 API key。                                                                                   |
| Anthropic     | `https://api.anthropic.com/v1`                     | 需要 API key。                                                                                   |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | 需要 API key。                                                                                   |
| xAI Grok      | `https://api.x.ai/v1`                              | 需要 API key。                                                                                   |
| OpenRouter    | `https://openrouter.ai/api/v1`                     | 需要 API key。                                                                                   |
| 自定义        | 任意地址                                           | 必须使用 `https`，本机和你自己的网络（`192.168.x.x`、`10.x.x.x`、`name.local`、Tailscale）除外。 |

每个服务使用自己的通信格式：Anthropic 和 Google Gemini 使用各自的原生接口，其余（包括 Ollama、Grok、OpenRouter 以及公司内部代理等自定义地址）都使用 OpenAI 兼容格式。选择服务会自动填好地址，地址仍可修改。其他 OpenAI 兼容的服务请选择「自定义」。

第一次测试或保存模型时，Chrome 会请你允许访问该模型地址。如果拒绝，解释卡片会明确告诉你，而不是报一个含糊的网络错误。

**Ollama** 默认拒绝浏览器扩展的请求，除非允许扩展的来源。「测试连接」按钮会给出适合你系统的确切命令，例如 macOS：

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://<你的扩展 ID>"
```

然后重启 Ollama。

## 使用方法

| 想做的事                 | 操作                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| 解释一个术语             | 选中后点**解释**，或按 `Alt+Shift+E`。                                       |
| 追问                     | 点卡片上的**追问**。问题和回答会与这次解释一起保存。                         |
| 扫描非 arXiv 的页面      | 点工具栏按钮；或在设置的「网站」中允许该站点以自动扫描。                     |
| 阅读 PDF                 | 在 PDF 页面点工具栏按钮：arXiv 论文打开 HTML 版本，其他 PDF 在阅读页中打开。 |
| 查看查过的内容           | 从设置页或引导页打开历史页，它会实时更新。                                   |
| 保存你的记录             | 历史页 →**导出 Markdown**、**导出 Anki 卡片** 或**立即备份 JSONL**。         |
| 从备份恢复               | 历史页 →**导入 JSONL**。                                                     |
| 看概念之间的联系         | 历史页 →**关系图**。                                                         |
| 不再给某个术语加下划线   | 悬停下划线 →**不再提示**。                                                   |
| 让某个来源不发给远程模型 | 卡片 →**标为敏感来源**，或在设置中为该网站添加敏感规则。                     |

## 文档

[`guide/`](guide/README.md) 文件夹有更详细的说明（英文）：[快速开始](guide/getting-started.md)、[使用指南](guide/user-guide.md)、[模型与服务商](guide/models.md)、[常见问题](guide/troubleshooting.md)、[隐私与敏感来源](guide/privacy.md)、[架构](guide/architecture.md)、[数据格式](guide/data-format.md)，以及[更新日志](CHANGELOG.md)。

## 隐私

- 你请求解释时，选中的文字、所在段落、章节和页面标题会发送给你配置的模型服务，按该服务商的条款处理。
- 复习时，可选的**检查我的回答**只在你点击时，才会把术语、你输入的回答和当时的解释发给你的模型。在设置中关闭后，这个按钮不会出现。它与解释遵循相同的模型选择和敏感来源规则。
- 记录只保存在本机浏览器中。备份只含记录，不含设置与 API key。
- 只在 arxiv.org 自动扫描。其他网站需要你点击按钮、按 `Alt+Shift+E`，或把网站加入白名单。
- 敏感来源的内容不会发给非本机模型，包括作为之后「对比」的上下文。你自己网络里的服务器也算非本机。来源会一直保持敏感，直到你在历史记录中把它改为普通来源。
- 可以在设置中让备份和导出不包含敏感来源。
- 无痕窗口只解释，不记录、不扫描、不显示重逢提示。
- 重逢下划线显示在网页里，网页自己的脚本可能据此推断你在哪些词上有记录。
- 删除在应用层生效；磁盘上可能仍有残留，已导出的备份无法追回。
- API key 保存在扩展存储中，**未加密**。

扩展内显示的说明是权威版本：[`apps/extension/src/lib/pages/privacy.ts`](apps/extension/src/lib/pages/privacy.ts)。

## 你的数据

一切都是只追加日志里的事件，格式公开：

- 事件类型与载荷：[`packages/spec`](packages/spec)，以及生成的 [JSON schema](packages/spec/schema/event.schema.json)。
- 回放、匹配与导出：[`packages/core`](packages/core)，不依赖浏览器，可单独使用。

由于概念与别名都由日志推导，你的 JSONL 备份就是你所知内容的完整、可迁移副本。

## 限制

- 仅支持 Chrome（Manifest V3）。
- 解释质量取决于你选的模型；较小的本机模型可能生成较弱的概念卡片，这会降低回想质量，但不会影响记录。
- 无法读取浏览器内置 PDF 阅读器中的文字，所以 Harkback 会在自己的阅读页中打开 PDF（arXiv 论文则跳转到 HTML 版本）。扫描件会在本机用 OCR 识别（英文已内置，其他语言各需从 `cdn.jsdelivr.net` 下载一次），比有文字的 PDF 更慢也更不精确，手写、公式和表格无法还原；表格、含文字的图、三栏及以上等复杂版式的段落识别只是近似。本地 PDF 需要两步授权：先在 `chrome://extensions` 中为 Harkback 开启「允许访问文件网址」，首次打开时再在阅读页点「允许读取本地文件」。
- 自动缩写匹配要求全称至少有三个词（如 `Large Language Model` 得到 `LLM`）。同一领域里对应不同全称的缩写（例如两个不同的「GNN」）会保持为不同概念。
- 中文名称，以及只用汉字书写的日文名称，至少需要三个字符才会加下划线，以避免误报；含假名或谚文的名称两个字符即可。
- 匹配时会忽略重音符号（“résumé”与“resume”视为同一术语），但除英语外不做词形还原，因此德语复数等变形会被当作不同术语。
- 界面默认是英语，也支持简体中文、繁体中文、日语、韩语、西班牙语、法语、德语和巴西葡萄牙语。解释可以用 16 种语言书写，在设置中单独选择。导出的笔记和 Markdown 只有英文或中文标签。

## 仓库结构

| 路径             | 内容                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `packages/spec`  | 事件格式：常量、zod schema 与生成的 JSON schema。                                           |
| `packages/core`  | 纯逻辑：回放、名称规范化、概念匹配、重逢筛选、提示词、输出解析、JSONL 与 Markdown 导出。    |
| `apps/extension` | 基于 [WXT](https://wxt.dev) 的 Chrome 扩展：内容脚本、后台 worker、历史页、设置页与引导页。 |
| `tools/lint`     | ESLint 配置。                                                                               |

## 开发

```sh
pnpm install
pnpm --filter @harkback/extension dev     # 热重载
```

提交 pull request 之前：

```sh
pnpm typecheck     # 所有包
pnpm lint          # ESLint
pnpm test          # 单元测试
pnpm check:build   # 生产构建：清单权限与内容脚本体积
pnpm e2e           # Chromium 端到端测试（首次运行 `pnpm exec playwright install chromium`）
pnpm format:check  # 格式
```

端到端测试会把构建好的扩展加载进 Chromium，从 `apps/extension/fixtures` 提供 arXiv 页面，并连接本地的模型桩服务。它们覆盖完整闭环：读论文、解释、记录、历史页，以及在其他论文上的重逢提示。见 `apps/extension/e2e`。

## 参与贡献

欢迎提交 bug 报告与 pull request，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。报告安全问题请见 [SECURITY.md](SECURITY.md)。

## 许可证

[Apache-2.0](LICENSE)
