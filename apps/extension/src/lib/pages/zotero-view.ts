import { h } from "../ui/dom";
import type { Lang } from "../ui/languages";
import { pick } from "../ui/pick";
import { libraryPath, readLibrary, ZoteroError, type ZoteroClient, type ZoteroErrorCode, type ZoteroLibrary } from "../zotero/client";
import { findTerms, type ZoteroTerm } from "../zotero/highlights";

/** What was read from a library before: the version to ask for changes since, and the highlights already decided on. */
export interface ZoteroProgress {
  version: number;
  /** Highlights imported or left unticked; they are not offered again. */
  decided: string[];
}

/** The progress kept for a library in storage; 1.0.5 kept the reader's own library under the bare user id. */
export function storedProgress(stored: unknown, path: string): ZoteroProgress | null {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return null;
  const all = stored as Record<string, ZoteroProgress | undefined>;
  return all[path] ?? all[/^users\/(\d+)$/.exec(path)?.[1] ?? ""] ?? null;
}

export interface ZoteroViewDeps {
  lang(): Lang;
  key(): string;
  /** Asks the browser for access to the Zotero API. Called first in the click, which the browser's prompt needs. */
  grant(): Promise<boolean>;
  client(key: string): ZoteroClient;
  /**
   * Kept for each library, by its path (`users/123`, `groups/456`), so changing keys and back does not offer the same
   * highlights again.
   */
  loadProgress(path: string): Promise<ZoteroProgress | null>;
  saveProgress(path: string, p: ZoteroProgress): Promise<void>;
  record(terms: ZoteroTerm[]): Promise<{ ok: boolean; added?: number }>;
}

/** What one library offered: its terms, and the progress to keep once they are decided. */
interface FoundIn {
  lib: ZoteroLibrary;
  progress: ZoteroProgress;
  terms: ZoteroTerm[];
}

/** A highlight's key is only unique in its library. */
const pickKey = (lib: ZoteroLibrary, t: ZoteroTerm): string => `${libraryPath(lib)}/${t.annotationKey}`;

type Problem = ZoteroErrorCode | "denied" | "no-key" | "import";
type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "problem"; problem: Problem }
  | { kind: "found"; libraries: FoundIn[]; passages: number; picked: Set<string> }
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
      const { userID, libraries } = await client.libraries();
      const found: FoundIn[] = [];
      let passages = 0;
      let failure: ZoteroError | null = null;
      for (const lib of libraries) {
        const path = libraryPath(lib);
        const known = (await deps.loadProgress(path)) ?? { version: 0, decided: [] };
        let library: Awaited<ReturnType<typeof readLibrary>>;
        try {
          library = await readLibrary(client, lib, known.version);
        } catch (e) {
          // A group that cannot be read now (left, or failing) does not hide what the other libraries hold.
          if (lib.type === "user" || !(e instanceof ZoteroError) || e.code === "key" || e.code === "network") throw e;
          failure = e;
          continue;
        }
        const terms = findTerms(library.annotations, library.items, new Set(known.decided), lib, userID);
        passages += terms.passages;
        // A highlight whose file or paper could not be read (in the trash, or not synced yet) is asked for again next time.
        const progress = { ...known, version: terms.orphans > 0 ? known.version : library.version };
        // With nothing to offer there is nothing to decide, but the next search can still start from here.
        if (terms.terms.length === 0) await save(path, progress);
        else found.push({ lib, progress, terms: terms.terms });
      }
      if (found.length === 0 && failure) throw failure;
      set({
        kind: "found",
        libraries: found,
        passages,
        // Another member's highlights in a group are offered, but not ticked: they are not the reader's look-ups.
        picked: new Set(found.flatMap((f) => f.terms.filter((t) => !t.highlightedBy).map((t) => pickKey(f.lib, t)))),
      });
    } catch (e) {
      set({ kind: "problem", problem: e instanceof ZoteroError ? e.code : "server" });
    }
  }

  async function importPicked(found: Extract<Phase, { kind: "found" }>): Promise<void> {
    const terms = found.libraries.flatMap((f) => f.terms.filter((t) => found.picked.has(pickKey(f.lib, t))));
    set({ kind: "reading" });
    let r: { ok: boolean; added?: number } | undefined;
    try {
      r = terms.length > 0 ? await deps.record(terms) : { ok: true, added: 0 };
    } catch {
      r = undefined;
    }
    if (!r?.ok) return set({ kind: "problem", problem: "import" });
    // Every highlight offered was decided: imported, or left unticked.
    for (const f of found.libraries) {
      const decided = [...new Set([...f.progress.decided, ...f.terms.map((t) => t.annotationKey)])];
      await save(libraryPath(f.lib), { ...f.progress, decided });
    }
    set({ kind: "done", added: r.added ?? terms.length });
  }

  /** Progress that cannot be saved only costs a longer search next time: what was recorded is not recorded twice. */
  async function save(path: string, p: ZoteroProgress): Promise<void> {
    try {
      await deps.saveProgress(path, p);
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
      const all = found.libraries.flatMap((f) => f.terms.map((t) => ({ lib: f.lib, t })));
      status.textContent =
        all.length === 0
          ? L("你的划线里没有新的术语。", "No new terms in your highlights.")
          : L("找到的术语：{n}。较长的划线没有列出：{m}。", "Terms found: {n}. Longer highlights left out: {m}.", {
              n: all.length,
              m: found.passages,
            });
      if (all.length > 0) {
        const importButton = h(
          "button",
          { type: "button", className: "small primary", "data-hb": "zotero-import" },
          L("导入勾选的术语", "Import ticked terms"),
        );
        importButton.addEventListener("click", () => void importPicked(found));
        const rows = all.map(({ lib, t }) => {
          const key = pickKey(lib, t);
          const box = h("input", { type: "checkbox", "data-hb": "zotero-term" }) as HTMLInputElement;
          box.checked = found.picked.has(key);
          box.addEventListener("change", () => {
            if (box.checked) found.picked.add(key);
            else found.picked.delete(key);
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
              h("span", { className: "muted", dir: "auto" }, t.group ? `${t.paper.title} · ${t.group}` : t.paper.title),
              t.highlightedBy
                ? h(
                    "span",
                    { className: "muted", dir: "auto", "data-hb": "zotero-highlighted-by" },
                    ` · ${L("{name} 的划线", "highlighted by {name}", { name: t.highlightedBy })}`,
                  )
                : null,
            ),
          );
        });
        parts.push(h("ul", { className: "zotero-terms", "data-hb": "zotero-terms" }, ...rows), importButton);
        if (all.some(({ t }) => t.paper.sensitive)) {
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
