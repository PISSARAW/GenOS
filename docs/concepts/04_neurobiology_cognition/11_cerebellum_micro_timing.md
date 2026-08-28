# 11. Cerebellum Micro-Timing

While the GenOS Cortex (the LLM Planner) governs **strategy** ("Why" and "What"), the Cerebellum governs **micro-tactics** ("How, without drifting").
*Source Reference:* `crates/genos-core/src/biomimicry/cerebellum.rs`.

---

## 11.1 Cortical Intention vs Sensory Feedback

The MCTS agent transmits a quantified goal: the `CorticalIntention`. This contains a target value and an expected latency (`expected_latency_ms`). Simultaneously, execution tools continuously emit `SensoryFeedback`.

## 11.2 Error Calculation and Motor Correction

The `CerebellumCoprocessor` compares these streams in real-time with zero LLM inference cost:
- **Value Error:** Deviation from the expected outcome.
- **Timing Error ($\Delta t$):** Execution lag or premature completion.

Instead of interrupting the LLM for every micro-adjustment, the Cerebellum calculates a `MotorCorrection` proportional to the error (modulated by a `learning_rate`). It essentially operates a "Cruise Control." The LLM commands "Push this block of code" and thinks about the next architectural step, while the Cerebellum precisely manages API quotas and asynchronous timing.

See also [02. Cerebellar Proceduralization](02_cerebellar_proceduralization.md).
