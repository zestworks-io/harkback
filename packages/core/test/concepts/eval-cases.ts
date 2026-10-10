/**
 * Labeled cases for the name matcher. `same` pairs must get one identity key, `different` pairs must not. `pages` say
 * which looked-up names a sentence should underline (`hits`, as the matched text) and which it must leave alone.
 * `gap` marks a case the matcher does not handle yet: it is reported, not required, and must never turn into a false merge.
 */
export type Lang = "en" | "de" | "fr" | "es" | "pt";

export interface PairCase {
  lang: Lang;
  a: string;
  b: string;
  same: boolean;
  gap?: true;
}

export interface PageCase {
  lang: Lang;
  /** The names the reader has looked up before. */
  names: string[];
  text: string;
  /** The text of each underline expected, in order. */
  hits: string[];
  gap?: true;
}

export const PAIRS: PairCase[] = [
  // English
  { lang: "en", a: "attention heads", b: "attention head", same: true },
  { lang: "en", a: "databases", b: "database", same: true },
  { lang: "en", a: "strategies", b: "strategy", same: true },
  { lang: "en", a: "Low-Rank Adaptation", b: "low rank adaptations", same: true },
  { lang: "en", a: "boxes", b: "box", same: true, gap: true },
  { lang: "en", a: "analysis", b: "analyses", same: true, gap: true },
  { lang: "en", a: "bias", b: "bia", same: false },
  { lang: "en", a: "series", b: "seri", same: false },
  { lang: "en", a: "class", b: "clas", same: false },
  { lang: "en", a: "bus", b: "bu", same: false },
  { lang: "en", a: "learning", b: "learner", same: false },
  { lang: "en", a: "layer", b: "layers norm", same: false },

  // German
  { lang: "de", a: "Gradient", b: "Gradienten", same: true, gap: true },
  { lang: "de", a: "Modell", b: "Modelle", same: true, gap: true },
  { lang: "de", a: "Netzwerk", b: "Netzwerke", same: true, gap: true },
  { lang: "de", a: "Funktion", b: "Funktionen", same: true, gap: true },
  { lang: "de", a: "Verlustfunktion", b: "Verlustfunktionen", same: true, gap: true },
  { lang: "de", a: "Parameter", b: "Parametern", same: true, gap: true },
  { lang: "de", a: "Lernen", b: "Lerner", same: false },
  { lang: "de", a: "Modell", b: "Modul", same: false },
  { lang: "de", a: "Kern", b: "Kerl", same: false },
  { lang: "de", a: "Regel", b: "Regal", same: false },

  // French
  { lang: "fr", a: "modèle", b: "modèles", same: true },
  { lang: "fr", a: "fonction de perte", b: "fonctions de perte", same: true },
  { lang: "fr", a: "réseau de neurones", b: "réseaux de neurones", same: true, gap: true },
  { lang: "fr", a: "noyau", b: "noyaux", same: true, gap: true },
  { lang: "fr", a: "résumé", b: "resume", same: true },
  { lang: "fr", a: "prix", b: "pri", same: false },
  { lang: "fr", a: "bras", b: "bra", same: false },

  // Spanish
  { lang: "es", a: "modelo", b: "modelos", same: true },
  { lang: "es", a: "función", b: "funciones", same: true, gap: true },
  { lang: "es", a: "red neuronal", b: "redes neuronales", same: true, gap: true },
  { lang: "es", a: "matriz", b: "matrices", same: true, gap: true },
  { lang: "es", a: "red", b: "rey", same: false },
  { lang: "es", a: "tren", b: "tre", same: false },
  { lang: "es", a: "mes", b: "m", same: false },

  // Portuguese
  { lang: "pt", a: "modelo", b: "modelos", same: true },
  { lang: "pt", a: "função", b: "funções", same: true, gap: true },
  { lang: "pt", a: "rede neural", b: "redes neurais", same: true, gap: true },
  { lang: "pt", a: "camada", b: "camadas", same: true },
  { lang: "pt", a: "mal", b: "mais", same: false },
  { lang: "pt", a: "animal", b: "animar", same: false },
];

export const PAGES: PageCase[] = [
  { lang: "en", names: ["attention head"], text: "Each of the attention heads sees the whole input.", hits: ["attention heads"] },
  { lang: "en", names: ["attention"], text: "An attentional bias slows it.", hits: [] },
  { lang: "en", names: ["LoRA"], text: "QLoRA and LoRAs differ.", hits: ["LoRAs"] },

  { lang: "de", names: ["Gradient"], text: "Die Gradienten werden zurückgerechnet.", hits: ["Gradienten"], gap: true },
  { lang: "de", names: ["Modell"], text: "Beide Modelle wurden trainiert.", hits: ["Modelle"], gap: true },
  { lang: "de", names: ["Funktion"], text: "Mehrere Funktionen teilen den Speicher.", hits: ["Funktionen"], gap: true },
  { lang: "de", names: ["Gradient"], text: "Das Gradientenverfahren konvergiert langsam.", hits: [] },
  { lang: "de", names: ["Modell"], text: "Das Modellieren braucht Zeit.", hits: [] },
  { lang: "de", names: ["Kern"], text: "Der Kernel läuft auf der GPU.", hits: [] },
  { lang: "de", names: ["Lernen"], text: "Ein Lerner braucht Beispiele.", hits: [] },

  { lang: "fr", names: ["réseau"], text: "Les réseaux profonds sont coûteux.", hits: ["réseaux"], gap: true },
  { lang: "fr", names: ["noyau"], text: "Les noyaux de convolution sont petits.", hits: ["noyaux"], gap: true },
  { lang: "fr", names: ["modèle"], text: "Ces modèles sont grands.", hits: ["modèles"] },
  { lang: "fr", names: ["perte"], text: "Une expérience perturbée.", hits: [] },

  { lang: "es", names: ["función"], text: "Las funciones se evalúan por lotes.", hits: ["funciones"], gap: true },
  { lang: "es", names: ["red"], text: "Las redes neuronales son profundas.", hits: ["redes"], gap: true },
  { lang: "es", names: ["matriz"], text: "Las matrices son densas.", hits: ["matrices"], gap: true },
  { lang: "es", names: ["red"], text: "El redondeo introduce error.", hits: [] },

  { lang: "pt", names: ["função"], text: "As funções são avaliadas em lote.", hits: ["funções"], gap: true },
  { lang: "pt", names: ["rede neural"], text: "As redes neurais são profundas.", hits: ["redes neurais"], gap: true },
  { lang: "pt", names: ["camada"], text: "Cada camada normaliza a entrada.", hits: ["camada"] },
  { lang: "pt", names: ["mal"], text: "Tem mais dados agora.", hits: [] },
];
