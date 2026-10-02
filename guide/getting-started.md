# Getting started

Five minutes from nothing to your first remembered term.

## 1. Install

Harkback is a Chrome extension (Manifest V3). There is no store listing yet, so load it from source. You need Node 22 or newer and [pnpm](https://pnpm.io).

```sh
git clone https://github.com/zestworks-io/harkback.git
cd harkback
pnpm install
pnpm --filter @harkback/extension build
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and select `apps/extension/.output/chrome-mv3`. The onboarding page opens by itself.

After you pull new code, run the build again and press the reload icon on the extension's card.

## 2. Connect a model

Harkback has no server. It needs a model to write explanations, and you choose which one. The onboarding page walks you through it:

1. Pick a provider. The address fills in.
2. Paste an API key if the provider needs one (Ollama does not).
3. Press **Test connection**. Chrome asks whether Harkback may reach that address; allow it.
4. Tick the consent box and press **Finish**.

The easiest free option is a local [Ollama](https://ollama.com) model. It needs one extra step, because Ollama refuses requests from browser extensions until you allow the extension's origin. The Test button shows the exact command for your system. See [Models and providers](models.md) for every provider and for running a model on another computer in your home network.

The interface starts in English. You can change its language, and the language of the explanations, on the onboarding or settings page.

## 3. Explain a term

1. Open a paper on [arxiv.org](https://arxiv.org). arXiv pages are scanned automatically.
2. Select a term, for example `LoRA`.
3. Click **Explain** next to the selection, or press `Alt+Shift+E`.
4. Read the answer as it streams in. A green tag says the page itself defines the term; a yellow one says the answer comes from the model's own knowledge.
5. Press **Got it** or **Still confused**. That answer decides when Harkback brings the term back for review.

Other ways to start: the right-click menu on selected text, and a selection made with the keyboard or by touch.

## 4. Meet the term again

Open a different paper that mentions `LoRA`, `low-rank adaptation` or `LoRAs`. The term is underlined. Hover over it to see when and where you looked it up, and what you understood then. You can mark it remembered, explain it again, compare the two usages, or mute it.

## 5. Look at what you have

Open the **History** page (linked from settings and onboarding). It lists every term by concept, with search, follow-up conversations, a review queue and a graph of how your concepts connect. From there you can also export your records and restore them from a backup.

## Reading something that is not on arXiv

- **A web page:** click the toolbar button once. To scan a site automatically from then on, add it under _Sites_ in settings.
- **A PDF:** click the toolbar button on the PDF. arXiv PDFs open as their HTML version; other PDFs open in Harkback's own reader. A PDF on your computer needs two approvals the first time; see [Troubleshooting](troubleshooting.md#a-pdf-on-my-computer-will-not-open).
- **Something confidential:** mark the site or the source as sensitive first. See [Privacy and sensitive sources](privacy.md).

## Next

[User guide](user-guide.md) · [Models and providers](models.md) · [Troubleshooting](troubleshooting.md)
