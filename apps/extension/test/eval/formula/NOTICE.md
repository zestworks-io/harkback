# Third-party content in this folder

The files under `pages/` and `pdf/` contain text from the papers below. Each is distributed under the
[Creative Commons Attribution 4.0 International licence](https://creativecommons.org/licenses/by/4.0/) by its authors.

- `pages/<id>.html` is the paper's arXiv HTML version at the given version, trimmed to the article: scripts, styles,
  images, navigation and the bibliography are removed; the text and formulas are otherwise unchanged.
- `pdf/<id>.json` is text extracted from the paper's PDF at the given version with pdf.js, grouped into lines; it is not
  the PDF itself, and spacing and order may differ from it.

| arXiv                                            | Version | Paper                                                                                                                            |
| ------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [2305.14314](https://arxiv.org/abs/2305.14314v1) | v1      | Dettmers, Pagnoni, Holtzman, Zettlemoyer. QLoRA: Efficient Finetuning of Quantized LLMs                                          |
| [2305.18290](https://arxiv.org/abs/2305.18290v3) | v3      | Rafailov, Sharma, Mitchell, Ermon, Manning, Finn. Direct Preference Optimization: Your Language Model is Secretly a Reward Model |
| [2210.17323](https://arxiv.org/abs/2210.17323v2) | v2      | Frantar, Ashkboos, Hoefler, Alistarh. GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers          |
| [2312.00752](https://arxiv.org/abs/2312.00752v2) | v2      | Gu, Dao. Mamba: Linear-Time Sequence Modeling with Selective State Spaces                                                        |
| [2404.19756](https://arxiv.org/abs/2404.19756v5) | v5      | Liu, Wang, Vaidya, Ruehle, Halverson, Soljačić, Hou, Tegmark. KAN: Kolmogorov-Arnold Networks                                    |

The saved files are the evaluation's source of truth. `fetch.mjs` downloads them again, but arXiv renders the HTML of a
version anew from time to time, so a new download may differ; check the scores after replacing them.
