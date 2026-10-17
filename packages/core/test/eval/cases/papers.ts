import type { EvalPaper } from "../../../src/eval/evaluate";

/**
 * Short passages written for this set, in the style of papers on efficient fine-tuning, in reading order. `reunions` lists
 * the concepts looked up in an earlier paper that this one mentions with the same meaning, or that a term on the page is a
 * kind of (prefix tuning, met before as a kind of PEFT, recalls PEFT).
 */
export const PAPERS: EvalPaper[] = [
  {
    id: "lora",
    title: "Low-Rank Adaptation of Large Language Models",
    abstract:
      "We freeze the weights of a pretrained language model and learn a pair of small low-rank matrices for each adapted layer. The approach trains far fewer parameters than updating the whole model while matching its quality.",
    reunions: [],
    paragraphs: [
      {
        section: "1 Introduction",
        text: "Full fine-tuning updates every weight of a pretrained model, so each downstream task needs its own copy of billions of parameters. Low-rank adaptation (LoRA) instead keeps the pretrained weights frozen and adds a trainable update to selected weight matrices, written as the product of two narrow matrices B and A whose inner dimension r is much smaller than the layer width.",
      },
      {
        section: "4 Method",
        text: "The update BA has rank at most r, so the number of trainable parameters grows linearly with r rather than with the square of the hidden size. After training, the product can be merged into the frozen weight, so the method adds no latency at inference time, unlike adapter layers that sit in the forward path.",
      },
    ],
    lookups: [
      { selection: "Full fine-tuning", paragraph: 0, concept: "full_ft", defined: true },
      { selection: "LoRA", paragraph: 0, concept: "lora", defined: true },
      { selection: "adapter layers", paragraph: 1, concept: "adapter", defined: false },
    ],
  },
  {
    id: "qlora",
    title: "Fine-Tuning Quantized Models with Low-Rank Updates",
    abstract:
      "We show that a base model stored in 4 bits can be fine-tuned through low-rank updates without losing quality relative to 16-bit training.",
    reunions: ["lora"],
    paragraphs: [
      {
        section: "1 Introduction",
        text: "QLoRA backpropagates gradients through a frozen base model stored in 4-bit precision into LoRA weights kept in 16-bit precision. Only the LoRA weights receive updates, so the memory needed for a 65B model drops enough to fit on a single large GPU.",
      },
      {
        section: "3 Method",
        text: "The base weights use the 4-bit NormalFloat (NF4) data type, a format whose levels are placed at the quantiles of a normal distribution, which suits weights that are roughly normally distributed. Double quantization then quantizes the per-block scaling constants themselves, saving about a third of a bit per parameter.",
      },
    ],
    lookups: [
      { selection: "QLoRA", paragraph: 0, concept: "qlora", defined: true },
      { selection: "NF4", paragraph: 1, concept: "nf4", defined: true },
      { selection: "Double quantization", paragraph: 1, concept: "double_quant", defined: true },
    ],
  },
  {
    id: "adapters",
    title: "Transfer Learning with Bottleneck Modules",
    abstract: "Small trainable modules added to a frozen pretrained network let one model serve many tasks.",
    reunions: ["adapter", "lora"],
    paragraphs: [
      {
        section: "2 Adapters",
        text: "An adapter is a small bottleneck network inserted after the attention and feed-forward sublayers of each Transformer block: it projects the hidden state down to a few dimensions, applies a nonlinearity and projects back up, with a residual connection around it.",
      },
      {
        section: "5 Related work",
        text: "Parameter-efficient fine-tuning (PEFT) methods share the goal of adapting a large model by training only a small fraction of its parameters. Besides adapters, the family includes prefix tuning and low-rank adaptation.",
      },
    ],
    lookups: [
      { selection: "adapter", paragraph: 0, concept: "adapter", defined: true },
      { selection: "PEFT", paragraph: 1, concept: "peft", defined: true },
    ],
  },
  {
    id: "prefix",
    title: "Optimizing Continuous Prefixes for Generation",
    abstract: "We keep the language model frozen and optimize a short sequence of continuous vectors placed before the input.",
    reunions: ["adapter", "peft"],
    paragraphs: [
      {
        section: "3 Method",
        text: "Prefix tuning prepends a sequence of trainable vectors to the keys and values at every attention layer. The model attends to this prefix as if it were made of virtual tokens, but the vectors are free parameters rather than embeddings of real words.",
      },
      {
        section: "7 Discussion",
        text: "Compared with adapters, the prefix adds no new layers to the network. Prompt tuning is a simpler variant that learns soft prompt embeddings only at the input layer.",
      },
    ],
    lookups: [
      { selection: "Prefix tuning", paragraph: 0, concept: "prefix_tuning", defined: true },
      { selection: "Prompt tuning", paragraph: 1, concept: "prompt_tuning", defined: true },
    ],
  },
  {
    id: "dora",
    title: "Decomposing Weights for Low-Rank Fine-Tuning",
    abstract: "We split each pretrained weight into a magnitude and a direction and train both, using a low-rank update for the direction.",
    reunions: ["full_ft", "lora", "qlora"],
    paragraphs: [
      {
        section: "3 Method",
        text: "DoRA decomposes a weight matrix into a magnitude vector and a direction matrix normalised column by column. The magnitude is trained directly, while the direction is updated with low-rank adaptation, which brings the learning behaviour closer to full fine-tuning.",
      },
      {
        section: "5 Experiments",
        text: "On commonsense reasoning benchmarks DoRA outperforms LoRA at the same rank, and the gap is largest for small ranks. Like QLoRA, it can be applied on top of a quantized base model.",
      },
    ],
    lookups: [
      { selection: "DoRA", paragraph: 0, concept: "dora", defined: true },
      { selection: "low-rank adaptation", paragraph: 0, concept: "lora", defined: false },
      { selection: "QLoRA", paragraph: 1, concept: "qlora", defined: false },
    ],
  },
  {
    id: "ia3",
    title: "Few-Shot Fine-Tuning by Rescaling Activations",
    abstract: "We learn three vectors that rescale keys, values and feed-forward activations, adding very few parameters.",
    reunions: ["adapter", "lora", "peft"],
    paragraphs: [
      {
        section: "3 Method",
        text: "IA3 multiplies the keys and values of each attention layer and the intermediate activations of each feed-forward layer by learned vectors. With the rest of the model frozen, it trains about 0.01% of the parameters, fewer than LoRA or adapters.",
      },
      {
        section: "6 Discussion",
        text: "Among parameter-efficient fine-tuning methods, IA3 suits mixed-task batches, because each example can carry its own rescaling vectors.",
      },
    ],
    lookups: [
      { selection: "IA3", paragraph: 0, concept: "ia3", defined: true },
      { selection: "parameter-efficient fine-tuning", paragraph: 1, concept: "peft", defined: false },
    ],
  },
  {
    id: "gptq",
    title: "Accurate Post-Training Quantization for Generative Transformers",
    abstract: "We quantize the weights of large language models to 3 or 4 bits after training, one layer at a time.",
    reunions: [],
    paragraphs: [
      {
        section: "2 Background",
        text: "Post-training quantization (PTQ) converts the weights of an already trained model to a low-bit format without further training, usually with a small calibration set. GPTQ is a PTQ method that quantizes one weight column at a time and uses approximate second-order information to adjust the remaining columns so the layer output changes as little as possible.",
      },
      {
        section: "6 Discussion",
        text: "Quantization-aware training would recover more accuracy, but it needs the full training pipeline and much more compute.",
      },
    ],
    lookups: [
      { selection: "Post-training quantization", paragraph: 0, concept: "ptq", defined: true },
      { selection: "GPTQ", paragraph: 0, concept: "gptq", defined: true },
      { selection: "Quantization-aware training", paragraph: 1, concept: "qat", defined: false },
    ],
  },
  {
    id: "adalora",
    title: "Adaptive Budget Allocation for Low-Rank Adaptation",
    abstract: "Instead of giving every weight matrix the same rank, we distribute the parameter budget according to importance.",
    reunions: ["lora"],
    paragraphs: [
      {
        section: "3 Method",
        text: "AdaLoRA parameterises each update in the form of a singular value decomposition and prunes the singular values of unimportant directions during training. The rank of each matrix therefore adapts to how much that matrix matters for the task.",
      },
    ],
    lookups: [
      { selection: "AdaLoRA", paragraph: 0, concept: "adalora", defined: true },
      { selection: "singular value decomposition", paragraph: 0, concept: "svd", defined: false },
    ],
  },
  {
    id: "dpo",
    title: "Preference Optimization Without a Reward Model",
    abstract: "We align a language model with human preferences by training directly on pairs of preferred and rejected answers.",
    reunions: ["lora"],
    paragraphs: [
      {
        section: "2 Background",
        text: "RLHF first fits a reward model to human comparisons and then optimizes the policy with reinforcement learning. Direct preference optimization (DPO) skips the reward model: it uses a classification-style loss on pairs of preferred and rejected answers that has the same optimum as the KL-constrained RLHF objective.",
      },
      {
        section: "6 Discussion",
        text: "Since DPO only needs the policy and a frozen reference model, it can be combined with LoRA to align large models on modest hardware.",
      },
    ],
    lookups: [
      { selection: "RLHF", paragraph: 0, concept: "rlhf", defined: true },
      { selection: "DPO", paragraph: 0, concept: "dpo", defined: true },
    ],
  },
  {
    id: "survey",
    title: "A Survey of Memory-Efficient Fine-Tuning",
    abstract: "We review methods that reduce the memory needed to adapt large language models.",
    reunions: ["adapter", "prefix_tuning", "lora", "gptq", "nf4", "qlora"],
    paragraphs: [
      {
        section: "2 Background",
        text: "Methods fall into two groups: those that shrink the number of trainable parameters, such as adapters, prefix tuning, LoRA and its successors, and those that shrink the memory of the frozen weights, such as GPTQ and NF4 quantization.",
      },
      {
        section: "4 Memory",
        text: "QLoRA combines both ideas. Paged optimizers move optimizer states to CPU memory when the GPU runs out, which avoids crashes on long sequences.",
      },
    ],
    lookups: [
      { selection: "Paged optimizers", paragraph: 1, concept: "paged_optimizer", defined: true },
      { selection: "QLoRA", paragraph: 1, concept: "qlora", defined: false },
    ],
  },
];
