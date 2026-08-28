# 04. Hippocampal Replay & Circadian Rhythm

In GenOS, sleep and dreaming are highly active, critical offline phases dedicated strictly to memory consolidation.

---

## 4.1 Circadian Rhythm (Wake/Sleep Cycle)

### Cognitive Significance and Agent Augmentation
GenOS enforces an algorithmic biological clock. 
During the **"Wake" phase**, agents are fully outward-facing.
During the **"Sleep" phase**, all external API requests and live environment interactions are strictly blocked. 

This introduces **rigorous cost control and systemic autophagic cleansing**. It is exclusively during the Sleep phase that heavy chaperone functions, the Garbage Collector, and the Hippocampal Replay are activated.

See [12. Suprachiasmatic Nucleus](12_suprachiasmatic_nucleus.md).

---

## 4.2 Hippocampal Replay

### Cognitive Significance and Agent Augmentation
Throughout the "Sleep" phase, GenOS systematically reviews the most critical operational trajectories of the waking day (high Dopaminergic RPE). 

The system re-simulates (replays) these scenarios continuously in an offline sandbox to consolidate these insights from the "Short-Term Cortex" into the "Long-Term Memory".

### Conceptual Schema
```mermaid
flowchart TD
    Day["Wake Phase\n(Exploration / Unpredicted Success)"] -->|Raw Episodic Data| Hippo("Hippocampus\n(Short-Term Buffer)")
    Hippo --> Night["Sleep Phase\n(Circadian Rhythm Trigger)"]
    Night -->|Continuous Iterative Replay\n(Using Local Free LLM)| Consolidation("Synthesis of new Operons/Scripts")
    Consolidation --> Cortex["Cortex / Cerebellum\n(Long-Term Genetic Memory)"]
```
