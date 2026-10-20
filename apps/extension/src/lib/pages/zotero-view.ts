import { h } from "../ui/dom";
import type { Lang } from "../ui/languages";
import { pick } from "../ui/pick";
import { readLibrary, ZoteroError, type ZoteroClient, type ZoteroErrorCode } from "../zotero/client";
import { findTerms, type ZoteroTerm } from "../zotero/highlights";

/** What was read from a library before: the version to ask for changes since, and the highlights already decided on. */
export interface ZoteroProgress {
  version: number;
  /** Highlights imported or left unticked; they are not offered again. */
  decided: string[];
}

export interface ZoteroViewDeps {
  lang(): Lang;
  key(): string;
  /** Asks the browser for access to the Zotero API. Called first in the click, which the browser's prompt needs. */
  grant(): Promise<boolean>;
  client(key: string): ZoteroClient;
  /** Kept for each library, so changing keys and back does not offer the same highlights again. */
  loadProgress(userID: number): Promise<ZoteroProgress | null>;
  saveProgress(userID: number, p: ZoteroProgress): Promise<void>;
  record(terms: ZoteroTerm[]): Promise<{ ok: boolean; added?: number }>;
}

type Problem = ZoteroErrorCode | "denied" | "no-key" | "import";
type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "problem"; problem: Problem }
  | { kind: "found"; userID: number; progress: ZoteroProgress; terms: ZoteroTerm[]; passages: number; picked: Set<string> }
  | { kind: "done"; added: number };

/**
 * Finds the terms highlighted in a Zotero library and imports the ones the reader keeps ticked. `paint` draws it again in
 * the current language without losing what was found.
 */
export function zoteroView(deps: ZoteroViewDeps): { element: HTMLElement; paint(): void } {
  const element = h("div", { className: "zotero", "data-hb": "zotero" });
  let phase: Phase = { kind: "idle" };
  const set = (next: Phase): void => {
    phase = next;
    paint();
  };

  async function find(): Promise<void> {
    const key = deps.key().trim();
    if (!key) return set({ kind: "problem", problem: "no-key" });
    if (!(await deps.grant())) return set({ kind: "problem", problem: "denied" });
    set({ kind: "reading" });
    try {
      const client = deps.client(key);
      const { userID } = await client.user();
      const known = (await deps.loadProgress(userID)) ?? { version: 0, decided: [] };
      const library = await readLibrary(client, userID, known.version);
      const found = findTerms(library.annotations, library.items, new Set(known.decided), userID);
      // A highlight whose file or paper could not be read (in the trash, or not synced yet) is asked for again next time.
      const progress = { ...known, version: found.orphans > 0 ? known.version : library.version };
      // With nothing to offer there is nothing to decide, but the next search can still start from here.
      if (found.terms.length === 0) await save(userID, progress);
      set({
        kind: "found",
        userID,
        progress,
        terms: found.terms,
        passages: found.passages,
        picked: new Set(found.terms.map((t) => t.annotationKey)),
      });
    } catch (e) {
      set({ kind: "problem", problem: e instanceof ZoteroError ? e.code : "server" });
    }
  }

  async function importPicked(found: Extract<Phase, { kind: "found" }>): Promise<void> {
    const terms = found.terms.filter((t) => found.picked.has(t.annotationKey));
    set({ kind: "reading" });
    let r: { ok: boolean; added?: number } | undefined;
    try {
      r = terms.length > 0 ? await deps.record(terms) : { ok: true, added: 0 };
    } catch {
      r = undefined;
    }
    if (!r?.ok) return set({ kind: "problem", problem: "import" });
    // Every highlight offered was decided: imported, or left unticked.
    const decided = [...new Set([...found.progress.decided, ...found.terms.map((t) => t.annotationKey)])];
    await save(found.userID, { ...found.progress, decided });
    set({ kind: "done", added: r.added ?? terms.length });
  }

  /** Progress that cannot be saved only costs a longer search next time: what was recorded is not recorded twice. */
  async function save(userID: number, p: ZoteroProgress): Promise<void> {
    try {
      await deps.saveProgress(userID, p);
    } catch {
      // Kept as it was.
    }
  }

  function problemText(lang: Lang, problem: Problem): string {
    const L = (zh: string, en: string) => pick(lang, zh, en);
    switch (problem) {
      case "no-key":
        return L("请先粘贴你的 Zotero API 密钥。", "Paste your Zotero API key first.");
      case "denied":
        return L("没有获得访问 Zotero 的权限。", "Access to Zotero was not granted.");
      case "key":
        return L("密钥不对，或已被撤销。", "The key is wrong or was revoked.");
      case "no-library":
        return L(
          "这个密钥不能读取你的文献库：在 zotero.org 上为它勾选“Allow library access”。",
          "This key cannot read your library: tick “Allow library access” for it on zotero.org.",
        );
      case "network":
        return L("连不上 Zotero。", "Zotero could not be reached.");
      case "busy":
        return L("Zotero 现在很忙，请稍后再试。", "Zotero is busy; try again later.");
      case "import":
        return L("导入失败。", "Import failed.");
      default:
        return L("Zotero 返回了错误，请稍后再试。", "Zotero answered with an error; try again later.");
    }
  }

  function paint(): void {
    const lang = deps.lang();
    const L = (zh: string, en: string, vars?: Record<string, string | number>) => pick(lang, zh, en, vars);
    const findButton = h("button", { type: "button", className: "small", "data-hb": "zotero-find" }, L("查找划线", "Find highlights"));
    findButton.disabled = phase.kind === "reading";
    findButton.addEventListener("click", () => void find());
    const status = h("p", { className: "note", "data-hb": "zotero-status", role: "status" });
    const parts: (Node | null)[] = [h("div", { className: "zotero-tools" }, findButton), status];

    if (phase.kind === "reading") status.textContent = L("正在读取 Zotero…", "Reading Zotero…");
    else if (phase.kind === "problem") status.textContent = problemText(lang, phase.problem);
    else if (phase.kind === "done") status.textContent = L("已导入的查词：{n}。", "Look-ups imported: {n}.", { n: phase.added });
    else if (phase.kind === "found") {
      const found = phase;
      status.textContent =
        found.terms.length === 0
          ? L("你的划线里没有新的术语。", "No new terms in your highlights.")
          : L("找到的术语：{n}。较长的划线没有列出：{m}。", "Terms found: {n}. Longer highlights left out: {m}.", {
              n: found.terms.length,
              m: found.passages,
            });
      if (found.terms.length > 0) {
        const importButton = h(
          "button",
          { type: "button", className: "small primary", "data-hb": "zotero-import" },
          L("导入勾选的术语", "Import ticked terms"),
        );
        importButton.addEventListener("click", () => void importPicked(found));
        const rows = found.terms.map((t) => {
          const box = h("input", { type: "checkbox", "data-hb": "zotero-term" }) as HTMLInputElement;
          box.checked = found.picked.has(t.annotationKey);
          box.addEventListener("change", () => {
            if (box.checked) found.picked.add(t.annotationKey);
            else found.picked.delete(t.annotationKey);
          });
          return h(
            "li",
            {},
            h(
              "label",
              {},
              box,
              " ",
              h("strong", { dir: "auto" }, t.term),
              " ",
              h("span", { className: "muted", dir: "auto" }, t.paper.title),
            ),
          );
        });
        parts.push(h("ul", { className: "zotero-terms", "data-hb": "zotero-terms" }, ...rows), importButton);
        if (found.terms.some((t) => t.paper.sensitive)) {
          parts.push(
            h(
              "p",
              { className: "note" },
              L(
                "不是已发表论文的文件可能是私人文档，从中导入的术语会标为敏感。",
                "A file that is not a published paper may be a private document, so terms from it are recorded as sensitive.",
              ),
            ),
          );
        }
      }
    }
    element.replaceChildren(...parts.filter((p): p is Node => p !== null));
  }

  paint();
  return { element, paint };
}
