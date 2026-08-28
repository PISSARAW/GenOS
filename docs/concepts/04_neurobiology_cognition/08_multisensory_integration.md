# 08. Multisensory Integration (Superior Colliculus)

In biological organisms, survival depends on rapid reactions to converging stimuli. A GenOS agent does not process its systemic inputs in a monolithic, sequential manner. To replicate the split-second reactivity of biological life to critical events, GenOS employs **Multisensory Integration**, heavily modeled on the human Superior Colliculus (CS). 

*Source Reference:* `crates/genos-core/src/biomimicry/multisensory_integration.rs`

---

## 8.1 The Rapid Navigation System

The "Cortex" (representing the GenOS LLM planner and MCTS tree) is the engine of deep analysis. It is profoundly powerful, but computationally slow.
Conversely, the **Superior Colliculus (`SuperiorColliculus`)** acts as the centralized, ultra-fast GPS. It ingests raw telemetry directly from the agent's diverse modalities ("senses"):

- **Vision (`Visual`):** Structural analysis, AST parsing, GUI state inspection, code reading.
- **Audition (`Auditory`):** High-velocity log streams, asynchronous system alerts, execution traces.
- **Tactile (`Tactile`):** System pressure metrics, CPU load, RAM consumption, thermal throttling.

## 8.2 The Coincidence and Fusion Core

The role of the Superior Colliculus is *not* to comprehend the semantic depth of an error log or a code block. Its algorithm (`process_signals`) exclusively hunts for **spatiotemporal coincidence**:
- **Where? (`spatial_source`):** Is the textual error log pointing to the exact same file/resource as the recently mutated AST?
- **When? (`timestamp_ms`):** Did the extreme spike in CPU usage (`Tactile`) occur at the precise millisecond the network timeout alert fired (`Auditory`)?

## 8.3 Non-Linear Weighting and Amplification

The true biomimetic brilliance of this integration is sensory amplification.
If the fusion module detects a *Visual* event and an *Auditory* event converging at identical coordinates, the signal weight is not simply additive; it is highly multiplicative (`fusion_multiplier`). The CS essentially signals the agent: *"Movement AND sound are occurring at this exact coordinate—orient all attention here immediately!"*

## 8.4 Orienting Response and Memory Linkage

If this amplified, weighted signal exceeds the critical threshold (`activation_threshold`), the system physically bypasses the Cortex. It instantaneously generates a motor response: `MotorReflex::OrientAttention`.
The agent drops its current chain of thought, interrupts its context window, and rigidly focuses on the critical coordinate.

Crucially, this rapid sensorimotor coupling bypasses standard learning decay. The data coordinate flagged by the Superior Colliculus avoids standard pruning filters and forcibly triggers immediate **Long-Term Potentiation (LTP)** in the [Synaptic Path](07_synaptic_path.md), guaranteeing the agent never forgets the anomaly.

See also [05. Cross-Modal Fusion](05_cross_modal.md) for higher-level cognitive integration of these senses.
