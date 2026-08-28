# 09. Spinal Reflex (Nociception)

Biological systems rely on peripheral reflexes to prevent catastrophic damage before the central brain is even aware of the danger. GenOS mimics this via the **Spinal Reflex**.

---

## 9.1 Low-Level Execution Wrapper

When an agent executes an operation (e.g., querying an API, running a script), a low-level "medullary segment" continuously monitors critical metrics like response time, RAM consumption, and API error rates. These metrics act as "thermal" and "nociceptive" signals.

## 9.2 Medullary Decision and Motor Response

If these signals breach predefined thresholds (`thermal_threshold`, `nociceptive_threshold`), a localized decision is made in nanoseconds, bypassing the Cortex (the LLM). The system generates an immediate `MotorResponse`:
- `Withdraw`: Instantly drops the current task to prevent a crash.
- `Freeze`: Halts I/O operations to let the system "cool down" (rate limiting).

## 9.3 Ascending Travel (Post-Rationalization)

While the action is already executed, the signal asynchronously travels up to the Cortex. The planner receives the information *a posteriori* ("Warning: I had to sever the connection 3 seconds ago due to a thermal burn"). This separation of **Speed vs Consciousness** ensures the agent is never paralyzed waiting for the LLM to process a lethal threat.

See also [01. Neurobiology & Memory](01_neurobiology_memory.md) (Nociception section).
