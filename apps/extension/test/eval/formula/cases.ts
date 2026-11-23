/**
 * Labels for the arXiv HTML pages of the formula set (see pages/). Drafted from the papers and checked by hand; each names
 * an equation by the number the paper prints beside it.
 */

/** Selecting one symbol of an equation: the element holding it, by tag and shown text, and the symbol it is. */
export interface SymbolCase {
  paper: string;
  equation: string;
  element: "mi" | "msub" | "msup" | "msubsup";
  text: string;
  /** Letters of `text` selected, when the element runs several symbols together (LaTeXML's 𝐖𝐗); all of it otherwise. */
  part?: string;
  symbol: string;
}

/** A symbol of an equation and words of the sentence on the page that defines it, which a found definition must hold. */
export interface DefinitionCase {
  paper: string;
  equation: string;
  symbol: string;
  defines: string;
}

export const SYMBOLS: SymbolCase[] = [
  { paper: "2305.18290", equation: "7", element: "mi", text: "β", symbol: "\\beta" },
  { paper: "2305.18290", equation: "2", element: "mi", text: "σ", symbol: "\\sigma" },
  { paper: "2305.18290", equation: "3", element: "msub", text: "πθ", symbol: "\\pi_{\\theta}" },
  { paper: "2305.14314", equation: "3", element: "mi", text: "s", symbol: "s" },
  { paper: "2210.17323", equation: "1", element: "mi", text: "𝐖𝐗", part: "𝐖", symbol: "\\mathbf{W}" },
  { paper: "2312.00752", equation: "4", element: "mi", text: "Δ", symbol: "\\Delta" },
  { paper: "2404.19756", equation: "2.1", element: "msub", text: "ϕq,p", symbol: "\\phi_{q,p}" },
];

export const DEFINITIONS: DefinitionCase[] = [
  { paper: "2305.18290", equation: "2", symbol: "\\sigma", defines: "is the logistic function" },
  { paper: "2305.18290", equation: "2", symbol: "y_{w}", defines: "denotes the preferred and dispreferred completion" },
  { paper: "2305.18290", equation: "3", symbol: "\\beta", defines: "is a parameter controlling the deviation" },
  { paper: "2305.18290", equation: "3", symbol: "\\pi_{\\text{ref}}", defines: "base reference policy" },
  { paper: "2305.18290", equation: "4", symbol: "Z", defines: "is the partition function" },
  { paper: "2305.14314", equation: "3", symbol: "\\mathbf{L}_{1}", defines: "\\mathbf{L}_{1}\\in\\mathbb{R}^{h\\times r}" },
  { paper: "2305.14314", equation: "3", symbol: "s", defines: "s is a scalar" },
  { paper: "2305.14314", equation: "1", symbol: "c^{\\text{FP32}}", defines: "is the quantization cons" },
  { paper: "2210.17323", equation: "1", symbol: "\\mathbf{X}", defines: "denote the layer input" },
  { paper: "2210.17323", equation: "2", symbol: "\\mathbf{H}_{F}", defines: "whose Hessian is" },
  { paper: "2210.17323", equation: "2", symbol: "F", defines: "denotes the set of remaining full-precision weights" },
  { paper: "2312.00752", equation: "4", symbol: "\\Delta", defines: "discretized by a timestep" },
  { paper: "2404.19756", equation: "2.1", symbol: "\\phi_{q,p}", defines: "where \\phi_{q,p}:[0,1]\\to\\mathbb{R}" },
  { paper: "2404.19756", equation: "2.1", symbol: "\\Phi_{q}", defines: "where \\phi_{q,p}:[0,1]\\to\\mathbb{R}" },
];
