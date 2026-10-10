import { describe, expect, it } from "vitest";
import { identityKey } from "../../src";
import { inflectedForms } from "../../src/concepts/inflect";

describe("inflectedForms", () => {
  it("gives short names no other forms", () => {
    expect(inflectedForms("rate")).toEqual([]);
    expect(inflectedForms("kern")).toEqual([]);
  });

  it("adds the plural endings of German, Spanish and French", () => {
    expect(inflectedForms("gradient")).toEqual(expect.arrayContaining(["gradiente", "gradienten"]));
    expect(inflectedForms("funcion")).toContain("funciones");
    expect(inflectedForms("noyaux")).not.toContain("noyauxx");
    expect(inflectedForms("tableau")).toContain("tableaux");
  });

  it("replaces the endings of Portuguese, French and Spanish plurals", () => {
    expect(inflectedForms("funcao")).toContain("funcoes");
    expect(inflectedForms("neural")).toEqual(expect.arrayContaining(["neurais", "neuraux"]));
    expect(inflectedForms("matriz")).toContain("matrices");
  });

  it("does not turn a name into an English word that means something else", () => {
    expect(inflectedForms("transform")).not.toContain("transformer");
    expect(inflectedForms("optimize")).not.toContain("optimizer");
    expect(inflectedForms("length")).not.toContain("lengthen");
    expect(inflectedForms("sharp")).toEqual([]);
  });
});

describe("identityKey with other plurals", () => {
  it("joins plurals that cannot be English ones", () => {
    expect(identityKey("réseaux")).toBe(identityKey("réseau"));
    expect(identityKey("funciones")).toBe(identityKey("función"));
    expect(identityKey("funções")).toBe(identityKey("função"));
    expect(identityKey("neurais")).toBe(identityKey("neural"));
    expect(identityKey("Funktionen")).toBe(identityKey("Funktion"));
    expect(identityKey("noyaux")).toBe(identityKey("noyau"));
    expect(identityKey("chevaux")).toBe("chevaux");
  });

  it("keeps English words as they were", () => {
    expect(identityKey("heroes")).toBe("heroe");
    expect(identityKey("database")).toBe(identityKey("databases"));
  });
});
