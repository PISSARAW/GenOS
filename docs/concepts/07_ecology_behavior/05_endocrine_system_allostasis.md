# Endocrine System & Allostasis

In addition to its rapid, direct "nervous system" (handling stigmergy, error traps, and nociception), GenOS features a slower, globally diffusing "endocrine system" to regulate the overarching mood, resource allocation, and general state of the agent swarm. 

---

## 1. Hormonal Diffusion

### Biological Inspiration
The biological endocrine system secretes hormones directly into the circulatory system, slowly altering the physiological state and behavior of the entire organism (e.g., adrenaline for fight-or-flight, cortisol for stress).

### Application in GenOS Agents
In GenOS, "hormones" are global environmental variables that smoothly shift the probability landscape and hyperparameters (like temperature or top-p) of the agents.

- **Mechanism**: If a critical project deadline approaches or the overall system budget runs low, the Orchestrator releases a digital equivalent of "Cortisol" (Stress Hormone) into the runtime environment.
- **Impact**: This provides **swarm-scale ambient modulation**. The cortisol hormone progressively inhibits "genes" tied to curiosity, deep exploration, and refactoring across all agents. Instead, it forces the entire swarm into an exploitation mode, strictly focusing on stabilizing the existing codebase and finishing pending tasks.
- **Cross-Reference**: This acts as an overarching regulator to the local peer-to-peer interactions defined in [Reciprocal Altruism](04_reciprocal_altruism.md).

---

## 2. Allostasis (Anticipatory Regulation)

### Biological Inspiration
While *homeostasis* is the reactive process of maintaining a stable internal state *after* a disturbance (e.g., sweating after you get hot), **allostasis** is the brain's ability to anticipate a need and prepare the body *before* the disturbance occurs (e.g., increasing heart rate before a race begins).

### Application in GenOS Agents
GenOS agents employ predictive models to achieve allostatic regulation rather than merely reacting to errors.

- **Mechanism**: An agent continuously evaluates the trajectory of its current task. If it anticipates that an upcoming compilation or heavy data-processing step will consume massive amounts of RAM, it begins to proactively prune its own caches (digital autophagy) *before* executing the command.
- **Impact**: This delivers absolute **execution fluidity**. The agent no longer suffers from the environment (e.g., hitting Out-Of-Memory errors and crashing); it anticipates constraints and adapts preemptively. 
- **Cross-Reference**: This pairs closely with the broader contractual adaptations discussed in [Adaptation & Compliance](06_adaptation_compliance.md).
