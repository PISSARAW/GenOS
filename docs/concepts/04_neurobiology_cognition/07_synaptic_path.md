# 07. The Synaptic Path

The **Synaptic Path** in GenOS represents a highly sophisticated, 3-tier memory architecture that faithfully replicates biological neuronal plasticity. Instead of storing a simplistic scalar "weight" (as is common in classical artificial neural networks), GenOS simulates the nuanced physicochemical state of a structural connection between two abstract concepts.

---

## 7.1 Tier 1: The Transient Passage (Chemical Burst)

- **Biological Equivalent:** An electrical action potential triggers the release of transient neurotransmitters into the synaptic cleft.
- **GenOS Implementation (`Transient`):** A concept is invoked in the latent space immediately following another, generating an acute signal spike. If this temporal sequence is not rapidly repeated, the mathematical "neurotransmitters" dissipate (`apply_decay`), and the memory is entirely erased. 
- **Utility:** This is the ultimate noise-filtering mechanism, preventing the system from memorizing the irrelevant, contextual "chatter" inherent to stochastic LLM outputs.

## 7.2 Tier 2: Dynamic Reinforcement (Long-Term Potentiation - LTP)

- **Biological Equivalent:** Repeated, highly synchronized firings force the postsynaptic neuron to facilitate and widen the pathway.
- **GenOS Implementation (`DynamicLTP`):** If the `Transient` signal intensity breaches a defined threshold, the synaptic path upgrades to `DynamicLTP`. Repetition scales the potentiation mathematically. This memory possesses sufficient gravitational "weight" to attract the LLM's attention during retrieval (RAG). However, it remains vulnerable to synaptic pruning if neglected during the agent's sleep cycle.

## 7.3 Tier 3: The Physical Trace (Structural Anchoring)

- **Biological Equivalent:** Durable structural alteration, such as the synthesis of new dendritic spines and AMPA/NMDA receptor clusters.
- **GenOS Implementation (`PhysicalTrace`):** This is the ultimate deep anchoring of a memory. The Synaptic Path now possesses a codified number of virtual `receptors` and a base `efficiency`. Even if the agent completely ceases to traverse this path for extended periods, unlearning it requires a protracted period of disuse (first diminishing efficiency, then destroying virtual receptors one by one).

---

### Systemic Impact
When a GenOS agent enters the offline sleep phase (triggering Prune & Scale mechanisms / Turrigiano's Law of Homeostasis), weak inter-concept links evaporate. However, `PhysicalTrace` pathways survive the pruning algorithm. This guarantees a highly robust, long-term memory framework without polluting the agent's context window with hallucinations or obsolete data.

Refer to [04. Hippocampal Circadian Replay](04_hippocampal_circadian_replay.md) for details on when this pruning occurs.
