import { h } from "./dom";

const SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  sum: "∑",
  prod: "∏",
  int: "∫",
  partial: "∂",
  nabla: "∇",
  infty: "∞",
  cdot: "·",
  times: "×",
  div: "÷",
  pm: "±",
  mp: "∓",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  sim: "∼",
  equiv: "≡",
  propto: "∝",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  Leftrightarrow: "⇔",
  ldots: "…",
  cdots: "⋯",
  dots: "…",
  forall: "∀",
  exists: "∃",
  ell: "ℓ",
  hat: "ˆ",
  top: "⊤",
  circ: "∘",
  ",": " ",
  ";": " ",
  ":": " ",
  " ": " ",
  "!": "",
  quad: "  ",
  qquad: "    ",
  "\\": " ",
  "{": "{",
  "}": "}",
  "%": "%",
  $: "$",
  _: "_",
  "&": "&",
  "#": "#",
};
const OPERATORS = new Set([
  "log",
  "ln",
  "exp",
  "sin",
  "cos",
  "tan",
  "max",
  "min",
  "arg",
  "lim",
  "sup",
  "inf",
  "det",
  "softmax",
  "argmax",
  "argmin",
  "Pr",
]);
const STYLES = new Set(["text", "mathrm", "mathbf", "mathit", "mathcal", "mathbb", "operatorname", "textbf", "boldsymbol", "bm"]);
const IGNORED = new Set(["left", "right", "big", "Big", "bigg", "Bigg", "displaystyle", "limits", "nolimits"]);

type Token = { cmd: string } | { ch: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c !== "\\") {
      out.push({ ch: c });
      continue;
    }
    const m = /^[A-Za-z]+/.exec(src.slice(i + 1));
    if (m) {
      out.push({ cmd: m[0] });
      i += m[0].length;
    } else if (i + 1 < src.length) {
      out.push({ cmd: src[++i]! });
    }
  }
  return out;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  /** Reads up to the closing brace of the current group (or the end), into `parent`. */
  run(parent: Node, top = true): void {
    let word = "";
    const flush = () => {
      if (word) parent.appendChild(h("i", {}, word));
      word = "";
    };
    while (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos++]!;
      if ("ch" in t) {
        if (t.ch === "}") {
          if (top) continue;
          break;
        }
        if (/[A-Za-z]/.test(t.ch)) {
          word += t.ch;
          continue;
        }
        flush();
        if (t.ch === "{") this.run(parent, false);
        else if (t.ch === "^" || t.ch === "_") parent.appendChild(h(t.ch === "^" ? "sup" : "sub", {}, this.argument()));
        else if (t.ch !== "&" && !/\s/.test(t.ch)) parent.appendChild(document.createTextNode(t.ch === "~" ? " " : t.ch));
        continue;
      }
      flush();
      this.command(t.cmd, parent);
    }
    flush();
  }

  private argument(): DocumentFragment {
    const frag = document.createDocumentFragment();
    const t = this.tokens[this.pos];
    if (!t) return frag;
    if ("ch" in t && t.ch === "{") {
      this.pos++;
      this.run(frag, false);
    } else {
      // A bare argument is one token: `x_i`, `2^n`, `a_\alpha`.
      this.pos++;
      if ("ch" in t) frag.appendChild(/[A-Za-z]/.test(t.ch) ? h("i", {}, t.ch) : document.createTextNode(t.ch));
      else this.command(t.cmd, frag);
    }
    return frag;
  }

  private command(name: string, parent: Node): void {
    if (IGNORED.has(name)) return;
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const top = h("span", { className: "hb-num" }, this.argument());
      const bottom = h("span", { className: "hb-den" }, this.argument());
      parent.appendChild(h("span", { className: "hb-frac" }, top, bottom));
    } else if (name === "sqrt") {
      parent.appendChild(document.createTextNode("√"));
      parent.appendChild(h("span", { className: "hb-sqrt" }, this.argument()));
    } else if (name === "overline" || name === "bar") {
      parent.appendChild(h("span", { className: "hb-sqrt" }, this.argument()));
    } else if (STYLES.has(name)) {
      const bold = name === "mathbf" || name === "textbf" || name === "boldsymbol" || name === "bm";
      parent.appendChild(h("span", { className: bold ? "hb-bold" : "hb-op" }, plain(this.argument())));
    } else if (OPERATORS.has(name)) {
      parent.appendChild(h("span", { className: "hb-op" }, name));
    } else {
      parent.appendChild(document.createTextNode(SYMBOLS[name] ?? name));
    }
  }
}

/** Text of a fragment without the italic letter wrappers, for upright and bold styles. */
function plain(frag: DocumentFragment): string {
  return frag.textContent ?? "";
}

/** Typesets the common subset of TeX (Greek letters, sub/superscripts, fractions, roots, operators) as plain DOM; never HTML. */
export function renderMath(tex: string, block: boolean): HTMLElement {
  const el = block ? h("div", { className: "hb-math hb-math-block" }) : h("span", { className: "hb-math" });
  el.setAttribute("data-tex", tex);
  new Parser(tokenize(tex)).run(el);
  return el;
}
