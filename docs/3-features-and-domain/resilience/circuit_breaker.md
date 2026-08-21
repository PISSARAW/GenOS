# Circuit Breakers: Cascade Prevention & Multi-Tripwire Protection

## 1. Overview & Architectural Motivation

In complex distributed agent topologies, failure in a single external LLM provider, sub-agent executor, or downstream API can trigger catastrophic **cascading failures**. Uncontrolled retry storms exhaust token budgets, saturate thread pools, and amplify latencies across the entire agent collective.

The **GenOS Circuit Breaker** subsystem provides deterministic failure containment and fast-failover routing. By wrapping calls to external inference providers, tool APIs, and distributed inter-agent messaging channels, Circuit Breakers isolate faults immediately upon detection, bypassing dead endpoints without blocking the orchestrator pipeline.

```
                  +-----------------------------------+
                  |              CLOSED               |
                  |  Normal Execution / Passing Flow  |
                  +-----------------------------------+
                     |                             ^
                     | Error Rate E_win >= theta   | Canary Successes
                     | or Consecutive Fails >= N   | S_canary >= M_thresh
                     v                             |
                  +-----------------------------------+
                  |               OPEN                |
                  |  Fast Fail / Route to Fallback    |
                  +-----------------------------------+
                     |                             ^
                     | Cooldown T_cooldown(k)      | Canary Failure
                     | Expired                     | (Single Error)
                     v                             |
                  +-----------------------------------+
                  |             HALF-OPEN             |
                  |    Canary Probing (Limited QPS)   |
                  +-----------------------------------+
```

---

## 2. Three-State Finite State Machine

The Circuit Breaker transitions across three discrete operating states:

| State | Execution Policy | Transition Trigger |
| :--- | :--- | :--- |
| **CLOSED** | Requests execute normally. Telemetry updates the sliding window error metric. | Transitions to **OPEN** when $E_{window} \ge \theta_{trip}$ or consecutive failures exceed $N_{max}$. |
| **OPEN** | Invocations fast-fail immediately without hitting the downstream target; fallback routing is engaged. | Transitions to **HALF-OPEN** after exponential backoff cooldown $T_{cooldown}(k)$ elapses. |
| **HALF-OPEN** | A restricted budget of canary probe requests ($M_{probe}$) are permitted to test target recovery. | Transitions to **CLOSED** if $S_{canary} \ge M_{thresh}$; reverts to **OPEN** upon any single error. |

---

## 3. Mathematical Sliding Window & Backoff Formulation

### 3.1 Sliding Window Error Rate
Rather than relying solely on naive consecutive failure counts, GenOS evaluates a time-decayed sliding window of size $W$:

$$E_{window}(t) = \frac{\sum_{i=1}^{W} w_i \cdot \mathbb{I}(\text{Call}_i == \text{FAIL})}{\sum_{i=1}^{W} w_i}$$

Where $w_i = \exp(-\lambda (t - t_i))$ weights recent call outcomes exponentially higher than older ones. The circuit trips to **OPEN** when:

$$E_{window}(t) \ge \theta_{trip} \quad \text{with} \quad \sum_{i=1}^{W} 1 \ge N_{min}$$

Where $N_{min}$ ensures statistical significance before tripping.

### 3.2 Exponential Backoff with Jitter
When the circuit trips to **OPEN**, the cooldown interval $T_{cooldown}(k)$ for trip iteration $k$ is calculated as:

$$T_{cooldown}(k) = \min\left(T_{max}, \; T_{base} \cdot 2^k\right) + \text{Uniform}(0, J_{max})$$

Where:
- $T_{base} = 5.0\text{ s}$, $T_{max} = 300.0\text{ s}$
- $J_{max} = 1.5\text{ s}$ breaks thundering herd synchronization across concurrent workers.

---

## 4. Multi-Tripwire Architecture

GenOS employs five specialized tripwires tailored to autonomous AI systems:

```
                               +---------------------------------------+
                               |         GENOS TRIPWIRE ENGINE         |
                               +---------------------------------------+
                                                   |
      +--------------------+-----------------------+----------------------+--------------------+
      |                    |                       |                      |                    |
      v                    v                       v                      v                    v
[Tool/API Quota]    [Token Velocity]      [Semantic Divergence]   [Action Loop Loop]   [Cost Ceiling]
HTTP 429/5xx >= 3   Tokens/s > MaxRate    D_sem > theta_drift     Repeated Call >= 3   Spend > HardBudget
      |                    |                       |                      |                    |
      +--------------------+-----------------------+----------------------+--------------------+
                                                   |
                                        [Any Tripwire Breached]
                                                   v
                                     TRIP CIRCUIT BREAKER (OPEN)
```

1. **Tool / Provider API Tripwire**: Detects HTTP 429 (Rate Limit), 503 (Unavailable), or JSON serialization corruptions.
2. **Token Velocity Tripwire**: Trips if token consumption velocity $\frac{d(\text{Tokens})}{dt}$ exceeds configured safety envelope ($>60{,}000\text{ tokens/min}$).
3. **Semantic Divergence Tripwire**: Monitors cosine distance between generated reasoning steps and goal embeddings.
4. **Action Cycle Tripwire**: Detects identical parameter invocations with zero state mutation across $\ge 3$ steps.
5. **Cost Ceiling Tripwire**: Trips when task-level token expenditure exceeds the assigned budgetary cap.

---

## 5. Fallback Routing & Graceful Degradation

When a circuit enters **OPEN**, the orchestrator engages deterministic fallback pipelines:

- **Tier Downgrade**: Automatically falls back from a remote Tier-3 flagship LLM to a local Tier-1 quantized model or deterministic AST analyzer.
- **Idempotent Cache Serving**: Serves cryptographically verified past responses for read-only filesystem or code analysis queries.
- **Synthetic Degraded Response**: Emits an attestation detailing the failure and suggesting alternative execution subtrees.
- **Swarm Escort Delegation**: Transfers the execution branch to a peer agent caste with distinct tool capabilities.

---

## 6. Rust Implementation Schema

```rust
use std::sync::RwLock;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

pub struct CircuitBreakerConfig {
    pub error_threshold: f32,
    pub min_samples: usize,
    pub base_cooldown: Duration,
    pub max_cooldown: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            error_threshold: 0.5,
            min_samples: 5,
            base_cooldown: Duration::from_secs(5),
            max_cooldown: Duration::from_secs(300),
        }
    }
}

pub struct CircuitBreaker {
    state: RwLock<CircuitState>,
    failure_history: RwLock<Vec<(Instant, bool)>>,
    consecutive_trips: RwLock<u32>,
    last_state_change: RwLock<Instant>,
    config: CircuitBreakerConfig,
}

impl CircuitBreaker {
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            state: RwLock::new(CircuitState::Closed),
            failure_history: RwLock::new(Vec::new()),
            consecutive_trips: RwLock::new(0),
            last_state_change: RwLock::new(Instant::now()),
            config,
        }
    }

    /// Determines if a request is permitted to proceed.
    pub fn is_allowed(&self) -> bool {
        let state = *self.state.read().unwrap();
        match state {
            CircuitState::Closed | CircuitState::HalfOpen => true,
            CircuitState::Open => {
                let elapsed = self.last_state_change.read().unwrap().elapsed();
                let cooldown = self.compute_cooldown();
                if elapsed >= cooldown {
                    self.transition_to(CircuitState::HalfOpen);
                    true
                } else {
                    false
                }
            }
        }
    }

    /// Records call outcome and recalculates state transitions.
    pub fn record_result(&self, is_success: bool) {
        let now = Instant::now();
        let mut history = self.failure_history.write().unwrap();
        history.push((now, is_success));
        if history.len() > 50 {
            history.remove(0);
        }

        let state = *self.state.read().unwrap();
        if !is_success {
            match state {
                CircuitState::HalfOpen => self.trip_to_open(),
                CircuitState::Closed => {
                    if self.evaluate_error_rate(&history) >= self.config.error_threshold {
                        self.trip_to_open();
                    }
                }
                CircuitState::Open => {}
            }
        } else if state == CircuitState::HalfOpen {
            self.transition_to(CircuitState::Closed);
            *self.consecutive_trips.write().unwrap() = 0;
        }
    }

    fn evaluate_error_rate(&self, history: &[(Instant, bool)]) -> f32 {
        if history.len() < self.config.min_samples {
            return 0.0;
        }
        let fails = history.iter().filter(|(_, success)| !*success).count();
        fails as f32 / history.len() as f32
    }

    fn trip_to_open(&self) {
        let mut trips = self.consecutive_trips.write().unwrap();
        *trips += 1;
        self.transition_to(CircuitState::Open);
    }

    fn transition_to(&self, next: CircuitState) {
        *self.state.write().unwrap() = next;
        *self.last_state_change.write().unwrap() = Instant::now();
    }

    fn compute_cooldown(&self) -> Duration {
        let trips = *self.consecutive_trips.read().unwrap();
        let multiplier = 2u32.saturating_pow(trips.saturating_sub(1));
        let duration = self.config.base_cooldown.saturating_mul(multiplier);
        duration.min(self.config.max_cooldown)
    }
}
```

---

## 7. MCP Tool Schema & CLI Reference

### 7.1 MCP Tool Declaration
```json
{
  "name": "genos_resilience_circuit_breaker",
  "description": "Inspect or manually trip circuit breaker states across tools and model endpoints.",
  "parameters": {
    "type": "object",
    "properties": {
      "target_endpoint": {
        "type": "string",
        "description": "Tool or LLM provider endpoint name"
      },
      "action": {
        "type": "string",
        "enum": ["Inspect", "Trip", "Reset", "SetThreshold"]
      },
      "threshold": {
        "type": "number",
        "description": "Error rate trip threshold in [0.0, 1.0]"
      }
    },
    "required": ["target_endpoint", "action"]
  }
}
```

### 7.2 CLI Commands
```bash
# Query circuit breaker state for a specific tool
genos resilience circuit-breaker --target "anthropic_claude_opus" --action "Inspect"

# Reset circuit breaker after manual infrastructure verification
genos resilience circuit-breaker --target "ast_analyzer" --action "Reset"
```
