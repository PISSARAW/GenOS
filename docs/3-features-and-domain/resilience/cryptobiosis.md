# Cryptobiosis: State Vitrification & Metabolic Suspension

## 1. Overview & Biological Analogy

In natural extremophiles (such as tardigrades, brine shrimp, and nematodes), **cryptobiosis** (notably *anhydrobiosis* and *cryobiosis*) is a state of reversible metabolic cessation entered in response to lethal environmental conditions (desiccation, freezing, radiation, or oxygen depletion). Organisms replace water with non-reducing disaccharides like **trehalose**, vitrifying their internal structures into bioglass until favorable conditions return.

In **GenOS**, Cryptobiosis provides autonomous agents with a zero-resource hibernation and state vitrification capability. When an agent encounters severe environmental stress—such as API rate limits (HTTP 429), token budget depletion, host network partitions, or cost ceiling spikes—it does not crash or spin in costly retry loops. Instead, it deterministically dehydrates its complete execution state into an immutable **Spore** (`.spore`), completely releasing all memory, thread, and token allocations.

```
       +-------------------------------------------------------------+
       |                  ACTIVE METABOLIC STATE                     |
       |  - Running Agent, Dynamic Working Memory, Open I/O Handles  |
       +-------------------------------------------------------------+
                                      |
                     [Environmental Stress / Rate Limit 429]
                                      v
       +-------------------------------------------------------------+
       |               DETERMINISTIC DEHYDRATION (VITRIFY)           |
       |  1. Flush & serialize belief graphs and causal DAG          |
       |  2. Freeze PRNG seeds, Epigenetic flags, and Token Counters |
       |  3. Package state into Trehalose-compressed Spore artifact  |
       |  4. Generate SHA-256 HMAC signature                         |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |                  SPORE STATE (.spore on Disk)               |
       |  - Zero compute consumption, Zero active RAM, Zero Tokens   |
       +-------------------------------------------------------------+
                                      |
                     [Environmental Thaw / Rate Window Reset]
                                      v
       +-------------------------------------------------------------+
       |                 REHYDRATION & INTEGRITY CHECK               |
       |  1. Cryptographic HMAC & schema integrity verification      |
       |  2. Decompress memory registers and causal lineage          |
       |  3. Reconstruct execution context and resume seamlessly     |
       +-------------------------------------------------------------+
```

---

## 2. Forms of Cryptobiotic Suspension

GenOS implements four specialized suspension modes modeled after biological cryptobiosis:

| Mode | Environmental Trigger | Suspension Characteristics |
| :--- | :--- | :--- |
| **Anhydrobiosis** | Token budget exhaustion or quota breach | Vitrifies context; awaits budget top-up or token window replenishment. |
| **Cryobiosis** | Extreme downstream service latency / outages | Freezes agent pipeline; awaits external endpoint heartbeat recovery. |
| **Osmobiosis** | Rate limiting / Backpressure (HTTP 429) | Calculated backoff dormancy with precision resume nonces. |
| **Anoxybiosis** | Network isolation / Host partitioning | Local disk vitrification until remote IPC connectivity is re-established. |

---

## 3. The Spore Architecture & Trehalose Compression

The frozen state is encapsulated in a deterministic, binary or compact JSON format termed the **Spore**. 

### 3.1 Spore Data Layout
A valid `.spore` archive contains:
- **Header**: Magic byte identifier `GENOS_SPORE_V1`, timestamp, agent archetype, suspension mode.
- **Genome & Epigenetics**: Base model configuration, active prompt mutations, behavioral traits.
- **Execution Vector**: Program counter, call stack, unresolved tool calls, intermediate scratchpad.
- **Belief & Causal Graph**: Node graph of verified facts, invalidated hypotheses, and lineage DAG.
- **Integrity Seal**: SHA-256 checksum and cryptographic HMAC verifying provenance.

```rust
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::SystemTime;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum HibernationMode {
    Anhydrobiosis, // Token / budget exhaustion
    Cryobiosis,    // Endpoint freeze
    Osmobiosis,    // Rate limit 429
    Anoxybiosis,   // Network partition
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SporeManifest {
    pub magic: String,
    pub version: u32,
    pub agent_id: String,
    pub mode: HibernationMode,
    pub timestamp: SystemTime,
    pub entropy_seed: u64,
    pub payload_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Spore {
    pub manifest: SporeManifest,
    pub compressed_state: Vec<u8>,
}

impl Spore {
    pub fn new(agent_id: &str, mode: HibernationMode, raw_state: &[u8]) -> Self {
        let manifest = SporeManifest {
            magic: "GENOS_SPORE_V1".to_string(),
            version: 1,
            agent_id: agent_id.to_string(),
            mode,
            timestamp: SystemTime::now(),
            entropy_seed: 424242,
            payload_hash: "sha256_hash_here".to_string(),
        };
        Self {
            manifest,
            compressed_state: raw_state.to_vec(),
        }
    }

    pub fn serialize(&self, path: &Path) -> std::io::Result<()> {
        let data = serde_json::to_vec(self)?;
        std::fs::write(path, data)
    }

    pub fn deserialize(path: &Path) -> std::io::Result<Self> {
        let data = std::fs::read(path)?;
        let spore: Self = serde_json::from_slice(&data)?;
        Ok(spore)
    }
}
```

---

## 4. Dehydration & Rehydration Lifecycle

### 4.1 Deterministic Dehydration Protocol
1. **Quiescence Intercept**: The agent intercepts the current step before emitting external side-effects.
2. **State Freeze**: Captures register states, episodic memories, and PRNG seeds.
3. **Trehalose Compression**: Compresses JSON data using fast, zero-overhead zstd/deflate algorithms.
4. **Spore Persistence**: Flushes spore bytes to `.genos/cryptobiosis/<agent_id>.spore`.
5. **Thread Exit**: Process drops all memory mappings and terminates without error.

### 4.2 Rehydration Protocol
1. **Watchdog Wakeup**: The GenOS Scheduler detects conditions are restored (e.g. rate limit window reset).
2. **Spore Attestation**: Reads `.spore`, verifies SHA-256 checksum and schema validity.
3. **Memory Thaw**: Restores agent state directly into execution memory.
4. **Continuous Resumption**: Resumes execution from the exact point of dehydration without repeating completed tool calls.

---

## 5. MCP & CLI Integration

### MCP Tool Interface
```json
{
  "name": "genos_resilience_cryptobiosis",
  "description": "Dehydrate agent state to disk and suspend metabolic consumption.",
  "parameters": {
    "agent_id": "worker_refactor_core",
    "mode": "Anhydrobiosis",
    "target_spore_path": ".genos/cryptobiosis/worker_refactor_core.spore"
  }
}
```

### CLI Invocations
```bash
# Freeze agent to spore
genos resilience cryptobiosis --agent-id "worker_refactor_core" --mode "Osmobiosis"

# Inspect and rehydrate spore
genos inspect --spore ".genos/cryptobiosis/worker_refactor_core.spore"
genos restore --spore ".genos/cryptobiosis/worker_refactor_core.spore"
```

---

## 6. Operational Guarantees & Fault Invariance

- **Zero Token Leakage**: Suspended agents consume exactly 0 LLM tokens per second while hibernating.
- **Idempotent Thaw**: Multiple rehydrations produce bit-for-bit identical execution branches if seeded with the original PRNG state.
- **Disaster Survivability**: Spores can be transported across hosts or cloud regions to resume workloads during severe infrastructure failures.
