import type { EvalPaper } from "../../../../src/eval/evaluate";

/**
 * Short passages written for this set, in the style of papers on quantum computing, in reading order. `reunions` lists the
 * concepts looked up in an earlier paper that this one mentions with the same meaning. A lookup is `defined` when the
 * paper says what the term is, not merely uses it; every definition here is in the lookup's own paragraph. Some lookups
 * meet a concept again under another name (CNOT, error correction), so joining them to the earlier one is measured.
 */
export const PAPERS: EvalPaper[] = [
  {
    id: "q-qubits",
    title: "Encoding Information in Two-Level Quantum Systems",
    abstract:
      "We review how information is stored and combined in two-level quantum systems. The same few ideas explain why quantum hardware is powerful and why it is fragile.",
    reunions: [],
    paragraphs: [
      {
        section: "1 Introduction",
        text: "A qubit is a two-level quantum system whose state can be any normalised combination of the basis states |0⟩ and |1⟩. Such a combination is called a superposition: until the qubit is measured, both amplitudes shape how it evolves, and a measurement returns 0 or 1 with probabilities given by their squared magnitudes.",
      },
      {
        section: "2 Two qubits",
        text: "Two qubits can be prepared in an entangled state, one that cannot be written as a product of separate single-qubit states; measuring one qubit then fixes the outcome statistics of the other. A Hadamard gate followed by a controlled-NOT gate turns two qubits that start in |00⟩ into such a state.",
      },
    ],
    lookups: [
      { selection: "qubit", paragraph: 0, concept: "qubit", defined: true },
      { selection: "superposition", paragraph: 0, concept: "superposition", defined: true },
      { selection: "entangled state", paragraph: 1, concept: "entanglement", defined: true },
      { selection: "controlled-NOT gate", paragraph: 1, concept: "cnot", defined: false },
    ],
  },
  {
    id: "q-circuits",
    title: "Compiling Quantum Circuits into Native Gates",
    abstract:
      "We present a compiler that maps arbitrary programs onto the gates a device supports. It reduces the number of sequential layers by a third on standard benchmarks.",
    reunions: ["qubit", "cnot"],
    paragraphs: [
      {
        section: "1 Introduction",
        text: "A quantum circuit is a sequence of gates applied to a register of qubits, read from left to right and ending in measurement. Each quantum gate is a unitary operation on one or two qubits; hardware offers only a small native set, so any other gate must be decomposed into it.",
      },
      {
        section: "3 Depth",
        text: "We minimise circuit depth, the number of layers of gates that cannot run at the same time, because every layer gives the qubits more time to lose their state. Two-qubit gates such as the CNOT dominate the cost, as they are slower and noisier than single-qubit rotations.",
      },
    ],
    lookups: [
      { selection: "quantum circuit", paragraph: 0, concept: "quantum_circuit", defined: true },
      { selection: "quantum gate", paragraph: 0, concept: "quantum_gate", defined: true },
      { selection: "circuit depth", paragraph: 1, concept: "circuit_depth", defined: true },
      { selection: "Two-qubit gates", paragraph: 1, concept: "two_qubit_gate", defined: false },
      { selection: "CNOT", paragraph: 1, concept: "cnot", defined: false },
    ],
  },
  {
    id: "q-noise",
    title: "Characterising Decoherence in Superconducting Qubits",
    abstract:
      "We measure how long superconducting qubits keep their state and how accurately they can be operated. The results set targets for the next generation of devices.",
    reunions: ["qubit", "superposition", "two_qubit_gate"],
    paragraphs: [
      {
        section: "2 Coherence",
        text: "Decoherence is the loss of quantum information to the environment: interactions the experiment does not control gradually turn a superposition into a classical mixture. We report the energy relaxation time T1, the time for an excited qubit to decay to its lowest level, and the dephasing time T2, over which the relative phase of a superposition is lost.",
      },
      {
        section: "4 Gates",
        text: "Our transmon qubits reach a median two-qubit gate fidelity of 99.5%, measured by randomized benchmarking. The remaining error is dominated by T1 during the gate, which sets how far error correction would have to push the hardware.",
      },
    ],
    lookups: [
      { selection: "Decoherence", paragraph: 0, concept: "decoherence", defined: true },
      { selection: "T1", paragraph: 0, concept: "t1", defined: true },
      { selection: "transmon", paragraph: 1, concept: "transmon", defined: false },
      { selection: "two-qubit gate fidelity", paragraph: 1, concept: "gate_fidelity", defined: false },
    ],
  },
  {
    id: "q-surface",
    title: "Below-Threshold Operation of a Surface Code Memory",
    abstract:
      "We store a single unit of quantum information across a grid of qubits and correct its errors in real time. Larger grids now lose information more slowly than smaller ones.",
    reunions: ["qubit", "t1"],
    paragraphs: [
      {
        section: "1 Introduction",
        text: "Quantum error correction protects information by spreading one logical qubit over many physical qubits and repeatedly checking for errors without measuring the stored state. In the surface code, data qubits sit on a square grid and ancilla qubits measure the parity of their neighbours each cycle; the pattern of parity flips, the error syndrome, tells a decoder where errors occurred.",
      },
      {
        section: "3 Results",
        text: "Increasing the code distance from 3 to 5 halves the logical error rate per cycle, which shows the device operates below the error threshold: the physical error rate is low enough that adding qubits removes more errors than it introduces. T1 errors during measurement still make up a third of the error budget.",
      },
    ],
    lookups: [
      { selection: "Quantum error correction", paragraph: 0, concept: "qec", defined: true },
      { selection: "surface code", paragraph: 0, concept: "surface_code", defined: true },
      { selection: "error syndrome", paragraph: 0, concept: "syndrome", defined: true },
      { selection: "logical qubit", paragraph: 0, concept: "logical_qubit", defined: false },
      { selection: "code distance", paragraph: 1, concept: "code_distance", defined: false },
      { selection: "error threshold", paragraph: 1, concept: "threshold", defined: true },
    ],
  },
  {
    id: "q-nisq",
    title: "Variational Algorithms on Noisy Intermediate-Scale Devices",
    abstract:
      "We survey algorithms designed to run on today's imperfect quantum hardware. Their common idea is to keep the quantum part short and leave the rest to a classical computer.",
    reunions: ["qubit", "qec", "decoherence", "quantum_circuit"],
    paragraphs: [
      {
        section: "1 Introduction",
        text: "Noisy intermediate-scale quantum (NISQ) devices have tens to hundreds of qubits but no error correction, so only shallow programs finish before decoherence sets in. Variational quantum algorithms suit them: a short trial program prepares a state, and a classical optimizer adjusts its parameters to minimise a measured cost.",
      },
      {
        section: "2 Eigensolvers",
        text: "The variational quantum eigensolver (VQE) estimates the lowest energy of a molecule by minimising the expectation value of its Hamiltonian over the states the ansatz can prepare. Its accuracy is bounded by how well the ansatz can express the true lowest-energy state and by the errors of each operation.",
      },
    ],
    lookups: [
      { selection: "NISQ", paragraph: 0, concept: "nisq", defined: true },
      { selection: "error correction", paragraph: 0, concept: "qec", defined: false },
      { selection: "Variational quantum algorithms", paragraph: 0, concept: "variational", defined: true },
      { selection: "VQE", paragraph: 1, concept: "vqe", defined: true },
      { selection: "Hamiltonian", paragraph: 1, concept: "hamiltonian", defined: false },
      { selection: "ansatz", paragraph: 1, concept: "ansatz", defined: false },
    ],
  },
  {
    id: "q-landscapes",
    title: "Training Landscapes of Variational Programs",
    abstract:
      "We study why variational quantum algorithms are hard to train as they grow. A simple schedule for adding layers keeps them trainable for longer.",
    reunions: ["vqe", "ansatz", "qubit", "nisq", "circuit_depth", "variational"],
    paragraphs: [
      {
        section: "1 Introduction",
        text: "The quantum approximate optimization algorithm (QAOA) alternates layers that encode a combinatorial problem with mixing layers, and like VQE leaves the choice of angles to a classical optimizer. For deep or randomly initialised ansatz choices, training often stalls on a barren plateau, a region where gradients vanish exponentially in the number of qubits.",
      },
      {
        section: "3 Mitigation",
        text: "We show that starting shallow and adding layers gradually keeps gradients measurable up to 40 qubits. Noise flattens the landscape further, so on NISQ hardware the usable circuit depth is lower than in noiseless simulation.",
      },
    ],
    lookups: [
      { selection: "QAOA", paragraph: 0, concept: "qaoa", defined: true },
      { selection: "barren plateau", paragraph: 0, concept: "barren_plateau", defined: true },
    ],
  },
  {
    id: "q-advantage",
    title: "Random Circuit Sampling Beyond Classical Reach",
    abstract:
      "We run a sampling task on a 53-qubit processor that we estimate would take classical machines far longer. We discuss how the estimate depends on classical methods.",
    reunions: ["qubit", "circuit_depth", "gate_fidelity"],
    paragraphs: [
      {
        section: "1 Introduction",
        text: "Quantum advantage is reached when a quantum processor completes a well-defined task that no classical computer can finish in reasonable time. Random circuit sampling is the task most experiments use: the processor runs a randomly chosen sequence of operations and outputs bitstrings whose distribution is hard to reproduce classically.",
      },
      {
        section: "4 Verification",
        text: "We check large runs with cross-entropy benchmarking, comparing measured bitstrings against classical simulation of smaller instances. Improved tensor methods have since narrowed the gap, which is why claims of advantage depend on the circuit depth and the gate fidelity reached.",
      },
    ],
    lookups: [
      { selection: "Quantum advantage", paragraph: 0, concept: "quantum_advantage", defined: true },
      { selection: "Random circuit sampling", paragraph: 0, concept: "random_circuit_sampling", defined: true },
      { selection: "classical simulation", paragraph: 1, concept: "classical_simulation", defined: false },
    ],
  },
  {
    id: "q-ions",
    title: "Fault-Tolerant Gates on a Trapped-Ion Processor",
    abstract:
      "We perform an encoded two-qubit operation whose errors stay correctable. It is the first time an encoded operation beats the best unencoded one on this platform.",
    reunions: ["qubit", "transmon", "circuit_depth", "cnot", "two_qubit_gate", "logical_qubit"],
    paragraphs: [
      {
        section: "2 Platform",
        text: "Trapped-ion qubits store information in the internal levels of single ions held by electric fields, and keep it for seconds, far longer than superconducting transmon devices. Because every ion can interact with every other, entangling operations need no routing, which lowers the circuit depth of each correction cycle.",
      },
      {
        section: "3 Fault tolerance",
        text: "We demonstrate a fault-tolerant CNOT between two logical qubits encoded in a distance-3 code: a single fault anywhere in the procedure cannot cause an uncorrectable error. Its error rate is below that of the best physical two-qubit gate, the first such crossing on trapped ions.",
      },
    ],
    lookups: [
      { selection: "Trapped-ion qubits", paragraph: 0, concept: "trapped_ion", defined: true },
      { selection: "fault-tolerant", paragraph: 1, concept: "fault_tolerance", defined: true },
      { selection: "CNOT", paragraph: 1, concept: "cnot", defined: false },
      { selection: "logical qubits", paragraph: 1, concept: "logical_qubit", defined: false },
    ],
  },
];
