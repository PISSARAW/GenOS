# Ubiquitous Language & Domain-Driven Design Glossary

This glossary establishes the canonical, mathematically grounded Domain-Driven Design (DDD) ubiquitous language for GenOS. All architectural blueprints, crate interfaces, event schemas, and CLI commands must strictly adhere to these definitions.

---

## 1. Core Ontological Entities

### Agent ($\mathcal{A}$)
An autonomous computational entity executing cognitive cycles over discrete time steps $t \in \mathbb{N}$. An agent is formally defined as the tuple:
$$\mathcal{A}(t) = \langle G, P(t), S(t), \pi \rangle$$
where $G$ is the immutable genome, $P(t)$ is the dynamic phenotype, $S(t)$ is the internal epistemic state, and $\pi: (S(t), O(t)) \to A(t)$ is the decision policy mapping state and observations $O(t)$ to actions $A(t)$.

### Genome ($G$)
The immutable genotype and hereditary blueprint of an agent. The genome defines the structural DNA that remains constant across an agent's lifecycle unless explicitly subjected to evolutionary mutation or breeding:
$$G = \langle \text{id}, \text{name}, \text{system\_prompt}, \mathcal{T}_{\text{allowed}}, \Theta, \mathcal{K}_{\text{guardrails}} \rangle$$
where $\mathcal{T}_{\text{allowed}}$ is the authorized tool catalog, $\Theta = \{\tau, \text{top\_p}, \text{penalty}\}$ represents model hyperparameter bounds, and $\mathcal{K}_{\text{guardrails}}$ specifies safety constraints.

### Phenotype ($P$)
The realized behavioral and operational expression of an agent within a concrete runtime environment at time $t$. The phenotype reflects the interaction between the genotype $G$ and environmental stimulus $E(t)$:
$$P(t) = \text{Express}(G, E(0:t))$$
Phenotypic traits include observed latency profiles, tool usage preferences, error tolerance, and reasoning depth.

### Phenotypic / Internal State ($S(t)$)
The complete internal state vector of an agent at step $t$:
$$S(t) = \langle M(t), B(t), C(t), V(t), E_{\text{hist}}(t) \rangle$$
- **$M(t)$ (Working & Episodic Memory)**: Active context window tokens, key-value scratchpads, and retrieved vector embeddings.
- **$B(t)$ (Epistemic Beliefs)**: Probabilistic propositions $b_i = \langle \phi_i, p_i, \text{evidence\_ids} \rangle$ where $p_i \in [0, 1]$ represents confidence in claim $\phi_i$.
- **$C(t)$ (Cognitive State)**: Goal hierarchy, plan stack, attention mask, and active reasoning step.
- **$V(t)$ (Environment Variables)**: Scoped session parameters and execution flags.
- **$E_{\text{hist}}(t)$ (Event Log Cursor)**: Pointer to the latest ingested event in the causal history.

---

## 2. Counterfactual Execution & World Primitives

### Capsule ($\mathcal{C}$)
The atomic, self-contained unit of execution and version control in GenOS. An Agent-World Capsule encapsulates both the cognitive entity and its physical environment:
$$\mathcal{C} = \langle \text{id}, G, S(t), W(t), R, \mathcal{B}, \mathcal{L}, \mathcal{H} \rangle$$
- **$W(t)$ (World State)**: Isolated filesystem, process tree, mock services, and network sandbox.
- **$R$ (Permissions Mask)**: Fine-grained security capabilities (read, write, execute, network).
- **$\mathcal{B} = \langle \text{tokens\_remaining}, \text{max\_steps}, \text{wallclock\_budget} \rangle$**: Enforced resource quota.
- **$\mathcal{L}$ (Lineage Identifier)**: Hierarchical ancestry address (e.g., `agent://cluster/gen/12/fork/B`).
- **$\mathcal{H}$ (Cryptographic Hash)**: Merkle digest computed over $\{G, S(t), W(t), \mathcal{L}\}$.

### World ($W$)
An isolated execution context providing sensory inputs (file contents, command outputs, API responses) and capturing all side-effects caused by agent actions. Supported world backends:
1. **Directory World**: Ephemeral or copy-on-write host directories.
2. **Git Worktree World**: Linked branch-isolated checkouts sharing a single `.git` object store.
3. **Containerized / MicroVM World**: OCI container or Firecracker VM for zero-trust tool execution.

### Branch / Counterfactual Fork ($\Phi$)
A state bifurcation operator that clones an ancestor capsule $\mathcal{C}_0$ into an isolated sibling branch $\mathcal{C}'$:
$$\mathcal{C}' \leftarrow \text{Fork}(\mathcal{C}_0, \delta_{\text{mutation}})$$
The fork preserves all past causal history while creating an isolated copy-on-write world $W'$ and independent budget $\mathcal{B}'$. Sibling branches execute concurrently without state interference.

### Divergence ($\Delta$)
The quantified multi-dimensional distance between two sibling branches $\mathcal{C}_A$ and $\mathcal{C}_B$ sharing a common ancestor $\mathcal{C}_0$:
$$\Delta(\mathcal{C}_A, \mathcal{C}_B) = w_s \cdot d_S(S_A, S_B) + w_w \cdot d_W(W_A, W_B) + w_e \cdot d_E(E_A, E_B)$$
where $d_S$ measures belief/memory divergence, $d_W$ is the tree diff distance over filesystems, and $d_E$ is the trajectory divergence over emitted actions.

---

## 3. Causal Lineage & Event Sourcing

### Causal DAG ($\mathcal{G}$)
A directed acyclic graph $\mathcal{G} = (\mathcal{V}, \mathcal{E})$ capturing the causal provenance of all system occurrences:
- **Vertices $\mathcal{V}$**: Immutable events $e = \langle \text{id}, t, \text{type}, \text{payload}, \text{hash} \rangle$.
- **Edges $\mathcal{E}$**: Directed causal relationships $(e_i, e_j)$ denoting that $e_i \prec e_j$ ($e_i$ directly caused or was observed during the creation of $e_j$).

```text
       (e0: AgentInit)
              |
       (e1: ToolRead "config.json")
              |
       (e2: SnapshotCreated S0)
             / \
            /   \ (Counterfactual Fork)
           v     v
  (e3_A: Fix A)   (e3_B: Fix B)
        |               |
  (e4_A: Test PASS) (e4_B: Test FAIL)
           \           /
            v         v
       (e5: CognitiveMerge -> S1)
```

### Snapshot ($\sigma$ or $S$)
An immutable, point-in-time serialized checkpoint of an agent's internal state $S(t)$, stored in Content-Addressable Storage (CAS) and addressable by its SHA-256 hash.

### Replay ($\mathcal{R}$)
The reconstruction of agent execution from historical event logs:
1. **State Replay (Deterministic)**: Replays exact recorded events without invoking external LLMs or tools; verifies state transitions and assertion invariants.
2. **Execution Replay (Counterfactual)**: Re-executes the agent loop from snapshot $S_k$ with modified prompts, mutated tool responses, or updated model weights.

---

## 4. Synthesis & Biomimetic Resilience

### Cognitive Merge ($\mathcal{M}_{\text{cog}}$)
The semantic arbitration engine that combines the experiences, discovered facts, and epistemic beliefs of multiple counterfactual branches into a unified successor checkpoint $S_{t+1}$:
$$S_{t+1} = \mathcal{M}_{\text{cog}}(S_0, \{(S_A, W_A, \mathcal{E}_A), (S_B, W_B, \mathcal{E}_B)\})$$
Unlike a textual Git merge, Cognitive Merge constructs a typed knowledge graph, resolves factual contradictions using evidence scoring $P(\text{belief} | E_A, E_B)$, and discards invalid or hallucinated beliefs.

### Apoptosis
Programmed agent self-termination. When an agent detects unrecoverable reasoning loops, catastrophic security invariant breaches, or critical entropy collapse, the runtime executes controlled cellular shutdown:
$$\text{Entropy}(C(t-k:t)) < \epsilon_{\text{loop}} \implies \text{Trigger}(\text{Apoptosis})$$
All allocated sandboxes and locks are released cleanly, and an apoptosis report is logged.

### Cryptobiosis
A state of metabolic suspension and preservation. When external dependencies fail (e.g., API rate limits, network partitions, unhandled OS signals), the agent freezes internal state, flushes all volatile memory to disk, and transitions to a quiescent checkpoint awaiting environmental resumption.

### Hypermutation
An adaptive survival mechanism activated when an agent encounters cognitive stagnation or deadlocks in problem-solving. The runtime deliberately expands exploration entropy by increasing model temperature $\tau$, injecting alternative tool schemas, or shuffling prompt paradigms.

### Stigmergy
Indirect environmental coordination among distributed agents. Agents communicate and coordinate not via direct message channels, but through traces left in the shared environment (e.g., marker files, modified AST nodes, shared artifact hashes).

### Content-Addressable Storage (CAS)
A storage architecture where data items are uniquely indexed and retrieved using their cryptographic content hashes (SHA-256). CAS guarantees immutability, zero-overhead deduplication, and byte-for-byte reproducibility.

### Worktree
An isolated Git working tree linked to a primary repository. GenOS uses Git worktrees to spin up instantaneous, isolated directory sandboxes on the same filesystem without duplicating `.git` history or incurring expensive cloning overhead.

### Operon & Horizontal Gene Transfer (HGT)
- **Operon**: A functional cluster of genomic directives and tools that are co-regulated and transcribed together (e.g., a "Rust Compilation & Linting Operon").
- **Horizontal Gene Transfer (HGT)**: The lateral transfer of successful tool patterns, prompt segments, or cognitive subroutines between unrelated agent lineages without sexual breeding.
