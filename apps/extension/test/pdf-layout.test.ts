import { describe, expect, it } from "vitest";
import { groupParagraphs, type PdfTextItem } from "../src/lib/pdf/layout";

const H = 10;
const CHAR = 5;

/** One text item per line, placed the way a PDF puts it: y grows upwards. */
function line(str: string, x: number, y: number, h = H, w = str.length * CHAR): PdfTextItem {
  return { str, x, y, w, h };
}
const texts = (items: PdfTextItem[], group: number[]) => group.map((i) => items[i]!.str).join("|");

describe("groupParagraphs", () => {
  it("keeps the lines of one paragraph together and puts spaces between them", () => {
    const items = [
      line("first line of a", 50, 700, H, 250),
      line("paragraph that runs on", 50, 688, H, 250),
      line("and ends here", 50, 676, H, 250),
    ];
    const { paragraphs, spaceAfter } = groupParagraphs(items);
    expect(paragraphs.map((p) => p.items)).toEqual([[0, 1, 2]]);
    expect(spaceAfter).toEqual([0, 1]);
  });

  it("starts a new paragraph after a larger vertical gap", () => {
    const items = [
      line("one", 50, 700, H, 250),
      line("two", 50, 688, H, 250),
      line("three", 50, 660, H, 250),
      line("four", 50, 648, H, 250),
    ];
    expect(groupParagraphs(items).paragraphs.map((p) => p.items)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("starts a new paragraph at an indented first line, as typeset papers do", () => {
    const items = [
      line("a full line of text", 50, 700, H, 250),
      line("second full line", 50, 688, H, 250),
      line("indented start", 60, 676, H, 240),
      line("continues left", 50, 664, H, 250),
    ];
    expect(groupParagraphs(items).paragraphs.map((p) => p.items)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("does not split ragged-right text at every short line", () => {
    const items = [
      line("ragged", 50, 700, H, 240),
      line("shorter line", 50, 688, H, 180),
      line("longer again", 50, 676, H, 250),
      line("x", 50, 664, H, 200),
    ];
    expect(groupParagraphs(items).paragraphs.map((p) => p.items)).toEqual([[0, 1, 2, 3]]);
  });

  it("ends a paragraph at a very short last line", () => {
    const items = [line("full line", 50, 700, H, 250), line("end.", 50, 688, H, 30), line("Next paragraph", 50, 676, H, 250)];
    expect(groupParagraphs(items).paragraphs.map((p) => p.items)).toEqual([[0, 1], [2]]);
  });

  it("joins a word broken by a hyphen at the end of a line", () => {
    const items = [
      line("an exam-", 50, 700, H, 250),
      line("ple of it", 50, 688, H, 250),
      line("well-", 50, 676, H, 250),
      line("Known", 50, 664, H, 250),
    ];
    const { hyphenated, spaceAfter } = groupParagraphs(items);
    expect(hyphenated).toEqual([0]);
    expect(spaceAfter).toEqual([1, 2]);
  });

  it("does not treat a dash before a capital, or a lone hyphen, as a break", () => {
    const items = [line("range 3 -", 50, 700, H, 250), line("5 units", 50, 688, H, 250)];
    expect(groupParagraphs(items).hyphenated).toEqual([]);
  });

  it("separates the columns of a page when the text jumps back up", () => {
    const items = [
      line("left one", 50, 700, H, 200),
      line("left two", 50, 688, H, 200),
      line("right one", 320, 700, H, 200),
      line("right two", 320, 688, H, 200),
    ];
    expect(groupParagraphs(items).paragraphs.map((p) => p.items)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("marks a short line in a larger font as a heading of its own", () => {
    const items = [line("Introduction", 50, 720, 14, 90), line("body text one", 50, 700, H, 250), line("body text two", 50, 688, H, 250)];
    const { paragraphs } = groupParagraphs(items);
    expect(paragraphs.map((p) => [p.items, p.heading])).toEqual([
      [[0], true],
      [[1, 2], false],
    ]);
  });

  it("keeps superscripts and subscripts on the line they belong to", () => {
    const items = [
      line("energy E", 50, 700, H, 40),
      line("2", 90, 704, 7, 4),
      line(" grows fast", 94, 700, H, 206),
      line("next line", 50, 688, H, 250),
    ];
    expect(groupParagraphs(items).paragraphs.map((p) => p.items)).toEqual([[0, 1, 2, 3]]);
  });

  it("adds a space where words are far apart on one line, but not where one already exists", () => {
    const items = [
      line("word", 50, 700, H, 20),
      line("next", 78, 700, H, 20),
      line("a ", 98, 700, H, 10),
      line("b", 108, 700, H, 5),
      line("c", 120, 700, H, 5),
    ];
    expect(groupParagraphs(items).spaceAfter).toEqual([0, 3]);
  });

  it("keeps blank items with the paragraph they sit in and ignores stray ones", () => {
    const items = [line(" ", 0, 720, H, 5), line("hello", 50, 700, H, 50), line(" ", 100, 700, H, 5), line("world", 105, 700, H, 50)];
    const { paragraphs } = groupParagraphs(items);
    expect(paragraphs.map((p) => texts(items, p.items))).toEqual(["hello| |world"]);
  });

  it("handles nothing", () => {
    expect(groupParagraphs([])).toEqual({ paragraphs: [], hyphenated: [], spaceAfter: [] });
  });
});
