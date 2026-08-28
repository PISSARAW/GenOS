# 06. Cognitive Mutation (O(1) Plasticity)

GenOS natively resolves one of the most pervasive flaws in LLM architectures: context window bloat caused by accumulating conversational history and failure logs. Instead of allowing the prompt size to grow exponentially, GenOS relies on **O(1) Cognitive Mutation**, powered by the `genos-synaptic` engine.

---

## 6.1 Principles of O(1) Cognitive Mutation

### Mechanistic Flow
1. **Diagnosis & Evaluation:** When a GenOS agent encounters repeated failures or cyclic reasoning, its behavior is diagnosed by an overarching evaluator (or biological chaperone).
2. **Genomic Mutation:** Rather than appending another "Do not do X" instruction to a bloated prompt, a new, highly concentrated genomic instruction *overwrites* the obsolete one (e.g., executing `mutate_cognition(syntax_strictness=0.99)`).
3. **O(1) Complexity:** The verbose history of failures, stack traces, and apologies is aggressively pruned from the active context window. The newly integrated genomic instruction acts as an immediate, intrinsic correction of constant size.

### Systemic Advantage
This constant-time plasticity ensures that the agent's prompt remains maximally compact, pristine, and highly focused. It entirely eliminates "context fatigue," ensuring that the LLM's attention mechanism remains razor-sharp regardless of how many iterations the task has required.

## 6.2 The `genos-synaptic` Architecture

The underlying infrastructure is managed by the `genos-synaptic` crate, which implements a synaptic plasticity graph directly inspired by biological STDP (Spike-Timing-Dependent Plasticity).

- The agent's genomic traits and systemic instructions constitute a simulated neural network.
- When an instruction successfully resolves a task, its structural "synaptic" weight is augmented.
- Conversely, inefficient or hallucinatory instructions experience long-term depression, their weights fading until they are ultimately pruned during the sleep cycle.

This biomimetic paradigm guarantees a fleet of autonomous agents that remains permanently agile, accumulating profound expertise without accumulating cognitive debt.

See [07. Synaptic Path](07_synaptic_path.md) for the exact molecular levels of this memory tracing, and [01. Neurobiology & Memory](01_neurobiology_memory.md) for the foundational STDP mechanics.
