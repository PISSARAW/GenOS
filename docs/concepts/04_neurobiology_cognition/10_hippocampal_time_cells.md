# 10. Hippocampal Time Cells

GenOS models episodic memory not as a flat log file, but as a temporal choreography inspired by human **Hippocampal Time Cells**. 
*Source Reference:* `crates/genos-core/src/biomimicry/hippocampal_replay.rs`.

---

## 10.1 Temporal Coding

Isolated raw events lack narrative meaning. GenOS utilizes `TimeCell` structures to capture the exact chronological succession of event "bursts."
If event A triggers, followed by tool B, and then file C is edited, the `EpisodicSequence` performs **Binding**. It constructs the pattern: `A -> [50ms] -> B -> [120ms] -> C`. This rhythm of succession constitutes the temporal information itself.

## 10.2 From Fragility to Stability (Replay)

- **The Fragile Phase (Hippocampus):** The `EpisodicSequence` is held in volatile memory. It is highly malleable and contextual. If the thread crashes, this unreinforced sequence is lost forever, exactly like short-term memory.
- **The Stable Phase (Cortex):** During idle cycles, GenOS triggers the `HippocampalReplay`. If the sequence led to a massive success (`success_score > 0.8`), the orchestrator replays it at high speed (`replay_speed_multiplier`) and consolidates it into a stable macro. The sequence transitions into a hardcoded "business rule" residing in the Cortex.

See also [04. Hippocampal Circadian Replay](04_hippocampal_circadian_replay.md) and [13. Hippocampal Consolidation](13_hippocampal_consolidation.md).
