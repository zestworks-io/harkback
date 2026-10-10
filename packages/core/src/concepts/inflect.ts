/**
 * Inflected forms of a Latin-script name, for the matcher: the German, French, Spanish and Portuguese plurals that a page may
 * use for a term the reader looked up in its base form. The name's language is not known, so the endings are the ones that
 * rarely turn an English word into a different English word, and short names get none (`rate` must not match `rated`).
 * The input is in the matcher's folded form: lower case, accents removed.
 */

/** Names shorter than this get no inflected forms. */
const MIN_LENGTH = 6;

/**
 * German "-en" follows these endings ("Funktion", "Gradient", "Messung", "Struktur", "Metrik"), and "-n" these ("Parameter",
 * "Modul" is not one). Elsewhere the ending would turn "length" into "lengthen" and "sharp" into "sharpen".
 */
const EN_AFTER = /(?:ion|ent|ung|ur|ik|ant|enz)$/;
const N_AFTER = /(?:er|el)$/;

/** Endings replaced: Portuguese "-cao" / "-coes" and "-al" / "-ais", French "-al" / "-aux", Spanish "-z" / "-ces". */
const ENDINGS: readonly (readonly [RegExp, string, string])[] = [
  [/[cs]ao$/, "ao", "oes"],
  [/al$/, "al", "ais"],
  [/al$/, "al", "aux"],
  [/z$/, "z", "ces"],
];

/** The other forms of a folded name, not including the name itself. */
export function inflectedForms(name: string): string[] {
  if (name.length < MIN_LENGTH) return [];
  // German "-e" and Spanish and Portuguese "-es"; "-s" is allowed for every name by the matcher.
  const forms = new Set([`${name}e`, `${name}es`]);
  if (EN_AFTER.test(name)) forms.add(`${name}en`);
  if (N_AFTER.test(name)) forms.add(`${name}n`);
  if (/(?:au|eu)$/.test(name)) forms.add(`${name}x`);
  for (const [test, from, to] of ENDINGS) if (test.test(name)) forms.add(name.slice(0, -from.length) + to);
  return [...forms];
}
