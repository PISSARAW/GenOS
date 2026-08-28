# 01. Neurobiology & Memory

This document comprehensively outlines how GenOS models memory, learning, and systemic plasticity at the "synaptic" level. In GenOS, synapses represent the probabilistic and causal relationships between the fundamental concepts manipulated by the agent. 

---

## 1.1 Spike-Timing-Dependent Plasticity (STDP)

### Cognitive Significance and Agent Augmentation
In biological neurobiology, Hebb's postulate dictates that "neurons that fire together, wire together." However, contemporary neuroscience reveals that the *temporal order* of activation is paramount, a mechanism known as Spike-Timing-Dependent Plasticity (STDP). 

In GenOS, memory reinforcement (the `apply_stdp` protocol) strictly adheres to this causal temporal rule. If concept A is frequently invoked just before the successful resolution B, the causal link is fortified through Long-Term Potentiation (LTP). Conversely, if the sequence is reversed or leads to failure, the connection is suppressed via Long-Term Depression (LTD). 

This imbues the agent with **robust causal reasoning**. Instead of merely memorizing a chaotic cluster of facts, the agent constructs a directed, weighted knowledge graph. If the operational trajectory $A \rightarrow B$ proves consistently effective, the synaptic route is optimized.

See also: [03. Dopaminergic RPE](03_dopaminergic_rpe.md), and [07. Synaptic Path](07_synaptic_path.md) for implementation details.

### Conceptual Schema
```mermaid
flowchart LR
    A["Search: 'NullPointerException'"] -->|Before| B["Locate: 'Config File'"]
    B -->|STDP Reinforcement (LTP)| C["Solution Validated"]
    A -.->|After STDP, Ultra-fast link| C
    
    style A fill:#f9f,stroke:#333,stroke-width:2px
    style B fill:#bbf,stroke:#333,stroke-width:2px
    style C fill:#bfb,stroke:#333,stroke-width:2px
```

---

## 1.2 Nociception (Algorithmic Pain)

### Cognitive Significance and Agent Augmentation
Nociception is the perception of pain. GenOS implements a dedicated neural channel (`Nociceptor`) explicitly designed to capture algorithmic "pain"—such as critical errors, recurrent crashes, or unhandled exceptions.

This introduces an **immediate survival reflex**. The nociceptor bypasses the main LLM cortex and immediately triggers an Apoptosis process to preserve system integrity. For the mechanics of this reflex, refer to [09. Spinal Reflex](09_spinal_reflex.md).
