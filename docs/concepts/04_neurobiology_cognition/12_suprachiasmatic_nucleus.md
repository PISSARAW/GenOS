# 12. Suprachiasmatic Nucleus (SCN)

The temporal hierarchy of GenOS climaxes with the **Suprachiasmatic Nucleus (SCN)**, which governs Macro-Timing. While the Cerebellum manages milliseconds, the SCN manages the agent's entire operational day.
*Source Reference:* `crates/genos-core/src/biomimicry/circadian_rhythms.rs`.

---

## 12.1 The Biological Anchor (Zeitgeber)

If an AI operates indefinitely without external anchoring, it wastes CPU cycles during downtime or executes heavy maintenance during traffic spikes. The SCN captures a **ZeitgeberSignal** (external cues like Light or Darkness):
- `ZeitgeberSignal::Light` (e.g., User login, network spike): Forces an immediate Clock Reset. The agent enters `Diurnal` phase. All systems are on maximum alert.
- `ZeitgeberSignal::Darkness` (e.g., Network silence for hours): Triggers the `Nocturnal` phase, signaling sleep.

## 12.2 Sleep Prediction and Autophagy

The SCN possesses a predictive capacity (`predict_next_transition`). Rather than being surprised by nightfall, the agent prepares for sleep. During the `Nocturnal` phase, the SCN authorizes critical maintenance:
- Garbage Collection of obsolete contexts.
- Triggering of [Hippocampal Replay](04_hippocampal_circadian_replay.md).
- Synaptic Pruning (eliminating weak connections).

By synchronizing the AI with this planetary rhythm, GenOS ensures resources are consumed organically and symbiotically with the host environment.
