import { identityKey, normalizeSourceId, ulid, type EventFactory, type State } from "@harkback/core";
import {
  CARD_LIMITS,
  conceptCreatedPayload,
  encounterCreatedPayload,
  encounterNotedPayload,
  sourceSeenPayload,
  type HarkEvent,
  type PayloadOf,
  type SourceIds,
} from "@harkback/spec";
import { arxivIdFromUrl } from "../source/source-id";
import type { ZoteroLibrary } from "./client";

/** An item as the Zotero web API sends it (`format=json`); only what the import reads is typed. */
export interface ZoteroItem {
  key: string;
  version?: number;
  links?: { alternate?: { href?: string } };
  /** Who added the item: in a group library, any of its members. */
  meta?: { createdByUser?: { id?: unknown; username?: unknown } };
  data: { itemType: string; parentItem?: string; [field: string]: unknown };
}

/** A paper (or a file with no paper around it) as a Harkback source. */
export interface ZoteroPaper {
  sourceId: string;
  ids: SourceIds;
  title: string;
  /** A file that is not a published paper may be a private document: it is recorded as sensitive. */
  sensitive: boolean;
}

/** A highlighted term ready to import. */
export interface ZoteroTerm {
  annotationKey: string;
  term: string;
  paper: ZoteroPaper;
  /** The reader's comment on the highlight, kept as their note on the look-up. */
  note?: string;
  /** The group library it was found in; absent for the reader's own library. */
  group?: string;
  /** In a group library, the member who made the highlight when it was not the reader. */
  highlightedBy?: string;
}

export interface ZoteroFindings {
  terms: ZoteroTerm[];
  /** Highlights longer than a term. */
  passages: number;
  /** Highlights whose file or paper could not be found. */
  orphans: number;
}

/** The longest term: a few words, or a few characters in a script written without spaces. */
const MAX_WORDS = 5;
const MAX_UNSPACED = 12;
/** Quotes and punctuation around a highlight; brackets and a full stop are handled on their own, as they can be part of a name. */
const EDGE = /^[\s"'“”‘’«»「」『』《》,;:!?、，。；：！？]+|[\s"'“”‘’«»「」『』《》,;:!?、，。；：！？]+$/gu;
/** Punctuation that ends or splits a sentence, inside the text: a passage, not a term. */
const SENTENCE = /[.!?;,:]\s|[。！？；，、：]/u;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

/** The term a highlight holds, or null when it holds a passage. */
export function termOfHighlight(text: string): string | null {
  let t = text.replace(/\s+/gu, " ").replace(EDGE, "");
  // A bracket is dropped only when it has no partner: "softmax(x)" keeps both, "(LoRA" loses one, "(LoRA)" both.
  for (let before = ""; before !== t;) {
    before = t;
    const wrapped = /^[([{](.*)[)\]}]$/u.exec(t);
    if (wrapped && !/[()[\]{}]/u.test(wrapped[1]!)) t = wrapped[1]!;
    else if (/^[([{]/u.test(t) && !/[)\]}]/u.test(t)) t = t.slice(1);
    else if (/[)\]}]$/u.test(t) && !/[([{]/u.test(t)) t = t.slice(0, -1);
    // A closing full stop ends a sentence, unless the name has others ("U.S.").
    else if (t.endsWith(".") && !t.slice(0, -1).includes(".")) t = t.slice(0, -1);
    t = t.replace(EDGE, "");
  }
  if (!t || !/\p{L}/u.test(t) || [...t].length > CARD_LIMITS.maxNameLength || SENTENCE.test(t)) return null;
  if (t.split(" ").length > MAX_WORDS || (t.match(UNSPACED)?.length ?? 0) > MAX_UNSPACED) return null;
  return t;
}

/** The longest ids the records hold. */
const MAX_ARXIV = 64;
const MAX_DOI = 256;
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i;
const DOI = /10\.\d{4,9}\/[^\s"<>]+/;

/** An arXiv id from any of the places Zotero's arXiv translator puts one. */
function arxivOf(data: ZoteroItem["data"]): string | null {
  const found = [
    /^arxiv:\s*(\S+)$/i.exec(text(data.archiveID))?.[1],
    /^10\.48550\/arxiv\.(\S+)$/i.exec(doiOf(text(data.DOI)) ?? "")?.[1],
    arxivIdFromUrl(text(data.url)) ?? undefined,
    /^arxiv:\s*(\S+)/im.exec(text(data.extra))?.[1],
  ];
  for (const id of found) {
    const m = id ? ARXIV_ID.exec(id) : null;
    if (m) return m[1]!;
  }
  return null;
}

/** The DOI in a field that may hold a resolver or library proxy address around it. */
function doiOf(field: string): string | null {
  let s = field;
  try {
    s = decodeURIComponent(field);
  } catch {
    // Not encoded.
  }
  const m = DOI.exec(s)?.[0].replace(/[.,;)\]]+$/, "");
  return m ? m.toLowerCase() : null;
}

/**
 * The source a highlight belongs to. A paper is named by its arXiv id or DOI; an address stored with the item is never kept,
 * since it can be a library proxy's address with a session in it. A file with neither id is named by its Zotero item and
 * linked to its page in the Zotero web library.
 */
export function paperOf(paper: ZoteroItem | undefined, file: ZoteroItem, lib: Pick<ZoteroLibrary, "type" | "id">): ZoteroPaper {
  const item = paper ?? file;
  // An id longer than the records allow is not used: the item is named as it would be without one.
  const fits = (id: string | null, max: number): string | null => (id && id.length <= max ? id : null);
  const arxiv = fits(arxivOf(item.data), MAX_ARXIV);
  const doi = fits(doiOf(text(item.data.DOI)) ?? doiOf(/^DOI:\s*(\S+)/im.exec(text(item.data.extra))?.[1] ?? ""), MAX_DOI);
  const title = (text(item.data.title) || text(item.data.filename) || item.key).slice(0, 500);
  if (arxiv || doi) {
    return {
      sourceId: normalizeSourceId(arxiv ? `arxiv:${arxiv}` : `doi:${doi}`),
      ids: { ...(arxiv && { arxiv }), ...(doi && { doi }) },
      title,
      sensitive: false,
    };
  }
  const page = item.links?.alternate?.href;
  return {
    // The reader's own library keeps the form the first version wrote: `zotero:<user id>/<key>`.
    sourceId: lib.type === "user" ? `zotero:${lib.id}/${item.key}` : `zotero:groups/${lib.id}/${item.key}`,
    ids: page && /^https:\/\/www\.zotero\.org\//.test(page) ? { url: page } : {},
    title,
    sensitive: true,
  };
}

const isString = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/** A term as a page sends it: the background records only these. */
export function isZoteroTerm(v: unknown): v is ZoteroTerm {
  const t = v as ZoteroTerm | null;
  if (typeof t !== "object" || t === null || typeof t.paper !== "object" || t.paper === null) return false;
  const { sourceId, ids, title, sensitive } = t.paper;
  return (
    isString(t.annotationKey, 64) &&
    isString(t.term, CARD_LIMITS.maxNameLength) &&
    (t.note === undefined || isString(t.note, CARD_LIMITS.maxNoteLength)) &&
    (t.group === undefined || isString(t.group, 500)) &&
    (t.highlightedBy === undefined || isString(t.highlightedBy, 200)) &&
    isString(sourceId, 2048) &&
    /^(arxiv|doi|zotero):/.test(sourceId) &&
    typeof title === "string" &&
    typeof sensitive === "boolean" &&
    typeof ids === "object" &&
    ids !== null &&
    Object.entries(ids).every(
      ([k, val]) => ["arxiv", "doi", "url"].includes(k) && isString(val, k === "url" ? 2048 : k === "arxiv" ? MAX_ARXIV : MAX_DOI),
    )
  );
}

/** The one concept a name already belongs to, if exactly one does. */
function conceptNamed(state: State, term: string): string | null {
  const info = state.aliases.get(identityKey(term));
  if (!info || info.ambiguous || info.derived) return null;
  const reps = new Set(info.conceptIds.map((id) => state.representative.get(id) ?? id));
  return reps.size === 1 ? [...reps][0]! : null;
}

/** The member of a group who made a highlight, when it was someone other than the reader (`userID`). */
function otherMember(a: ZoteroItem, lib: ZoteroLibrary, userID: number | undefined): string | undefined {
  const by = a.meta?.createdByUser;
  if (lib.type !== "group" || userID === undefined || typeof by?.id !== "number" || by.id === userID) return undefined;
  return (typeof by.username === "string" ? by.username.replace(/\s+/g, " ").trim().slice(0, 200) : "") || `#${by.id}`;
}

/**
 * The terms among the highlights, each with its paper. `items` holds the files and papers the highlights hang from;
 * `decided` the highlights already imported or turned down; `userID` the reader, to tell their highlights in a group
 * library from other members'.
 */
export function findTerms(
  annotations: readonly ZoteroItem[],
  items: ReadonlyMap<string, ZoteroItem>,
  decided: ReadonlySet<string>,
  lib: ZoteroLibrary,
  userID?: number,
): ZoteroFindings {
  const out: ZoteroFindings = { terms: [], passages: 0, orphans: 0 };
  for (const a of annotations) {
    const type = a.data.annotationType;
    if (a.data.itemType !== "annotation" || (type !== "highlight" && type !== "underline") || decided.has(a.key)) continue;
    const term = termOfHighlight(text(a.data.annotationText));
    if (!term) {
      if (text(a.data.annotationText)) out.passages++;
      continue;
    }
    const file = a.data.parentItem ? items.get(a.data.parentItem) : undefined;
    const paper = file?.data.parentItem ? items.get(file.data.parentItem) : undefined;
    if (!file || (file.data.parentItem && !paper)) {
      out.orphans++;
      continue;
    }
    const note = text(a.data.annotationComment).slice(0, CARD_LIMITS.maxNoteLength);
    const by = otherMember(a, lib, userID);
    out.terms.push({
      annotationKey: a.key,
      term,
      paper: paperOf(paper, file, lib),
      ...(note && { note }),
      ...(lib.type === "group" && { group: lib.name }),
      ...(by && { highlightedBy: by }),
    });
  }
  return out;
}

/**
 * The events that record the terms: a source for each paper not seen before, a concept for each term no concept is named by
 * yet (one for all its highlights), and a look-up with no explanation for each highlight. Nothing already recorded is changed.
 */
export function buildImportEvents(f: EventFactory, state: State, terms: readonly ZoteroTerm[], newId: () => string = ulid): HarkEvent[] {
  const out: HarkEvent[] = [];
  const sources = new Set<string>();
  const concepts = new Map<string, string>();
  // One look-up per term and paper, even when the same highlight is imported again (after its progress was lost).
  const recorded = new Set(
    [...state.encounters.values()]
      .filter((e) => e.explanation.model === "zotero" || e.explainedLater)
      .map((e) => `${normalizeSourceId(e.sourceId)}\u0000${identityKey(e.selection)}`),
  );
  for (const t of terms) {
    const term = t.term.trim().slice(0, CARD_LIMITS.maxNameLength);
    if (!identityKey(term)) continue;
    const { sourceId } = t.paper;
    const once = `${normalizeSourceId(sourceId)}\u0000${identityKey(term)}`;
    if (recorded.has(once)) continue;
    const key = identityKey(term);
    const source: PayloadOf<"source.seen"> | null =
      state.sources.has(sourceId) || sources.has(sourceId)
        ? null
        : {
            source_id: sourceId.slice(0, 2048),
            ids: t.paper.ids,
            title: t.paper.title.slice(0, 500),
            license: "unknown",
            sensitivity: t.paper.sensitive ? "sensitive" : "normal",
          };
    const known = concepts.get(key) ?? conceptNamed(state, term);
    const conceptId = known ?? newId();
    const concept: PayloadOf<"concept.created"> | null = known
      ? null
      : { concept_id: conceptId, canonical_name: term, aliases: [], domain: "other" };
    const encounter: PayloadOf<"encounter.created"> = {
      encounter_id: newId(),
      concept_id: conceptId,
      source_id: sourceId,
      locator: { exact: term, prefix: "", suffix: "" },
      selection: term.slice(0, CARD_LIMITS.maxSelectionLength),
      explanation: { text: "", tier: "external_knowledge", evidence_span: null, model: "zotero" },
      flags: [],
    };
    const note: PayloadOf<"encounter.noted"> | null = t.note ? { encounter_id: encounter.encounter_id, text: t.note } : null;
    // A term the records could not hold is left out; the others are still imported.
    const valid =
      (!source || sourceSeenPayload.safeParse(source).success) &&
      (!concept || conceptCreatedPayload.safeParse(concept).success) &&
      encounterCreatedPayload.safeParse(encounter).success &&
      (!note || encounterNotedPayload.safeParse(note).success);
    if (!valid) continue;
    recorded.add(once);
    sources.add(sourceId);
    concepts.set(key, conceptId);
    if (source) out.push(f.make("source.seen", source));
    if (concept) out.push(f.make("concept.created", concept));
    out.push(f.make("encounter.created", encounter));
    if (note) out.push(f.make("encounter.noted", note));
  }
  return out;
}
