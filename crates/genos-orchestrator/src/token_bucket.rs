use std::collections::HashMap;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};

pub const DEFAULT_BUCKET_CAPACITY: f64 = 100.0;
pub const DEFAULT_REFILL_RATE: f64 = 10.0;
pub const BASELINE_CPU_QUANTUM_MS: u64 = 100;
pub const MAX_STARVATION_ATTEMPTS: u32 = 3;
/// Upper bound on burst capacity so spamming high-quality proofs cannot
/// inflate a bucket without limit.
pub const MAX_BUCKET_CAPACITY: f64 = 4.0 * DEFAULT_BUCKET_CAPACITY;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum BucketState {
    Active,
    Throttled { sleep_ms: u64 },
    Starved,
    Apoptotic,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum SchedulingDecision {
    Allowed { allocated_tokens: f64, time_slice_ms: u64, remaining_tokens: f64 },
    Suspended { sleep_ms: u64, reason: String },
    Terminated { reason: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RewardReport {
    pub agent_id: String,
    pub added_tokens: f64,
    pub new_balance: f64,
    pub capacity: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PenaltyReport {
    pub agent_id: String,
    pub deducted_tokens: f64,
    pub new_balance: f64,
    pub state: BucketState,
}

#[derive(Clone, Debug)]
pub struct AgentComputeBucket {
    pub agent_id: String,
    pub tokens: f64,
    pub capacity: f64,
    pub refill_rate: f64,
    pub last_refill: Instant,
    pub throttled_until: Option<Instant>,
    pub starvation_count: u32,
    pub total_evidence: f64,
    pub total_waste: f64,
    pub state: BucketState,
}

impl AgentComputeBucket {
    pub fn new(agent_id: &str, initial_tokens: f64, capacity: f64) -> Self {
        Self {
            agent_id: agent_id.to_string(),
            tokens: initial_tokens.min(capacity),
            capacity,
            refill_rate: DEFAULT_REFILL_RATE,
            last_refill: Instant::now(),
            throttled_until: None,
            starvation_count: 0,
            total_evidence: 0.0,
            total_waste: 0.0,
            state: BucketState::Active,
        }
    }

    pub fn is_dead(&self) -> bool {
        matches!(self.state, BucketState::Apoptotic | BucketState::Starved)
    }

    pub fn refill(&mut self, now: Instant) {
        if self.is_dead() {
            return;
        }
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        if elapsed > 0.0 {
            self.tokens = (self.tokens + elapsed * self.refill_rate).min(self.capacity);
            self.last_refill = now;
        }
        if let Some(until) = self.throttled_until {
            if now >= until {
                self.throttled_until = None;
                if self.tokens > 0.0 {
                    self.state = BucketState::Active;
                }
            }
        }
    }
}

/// Token Bucket Compute Scheduler for Biocénose & Metapopulation runtimes.
/// Manages CPU quantum allocation, reward on proven evidence, and starvation on waste.
#[derive(Clone, Debug, Default)]
pub struct TokenBucketScheduler {
    pub buckets: HashMap<String, AgentComputeBucket>,
}

impl TokenBucketScheduler {
    pub fn new() -> Self {
        Self { buckets: HashMap::new() }
    }

    /// Registers an agent exactly once. Re-registering is idempotent so it can
    /// never silently resurrect a Starved/Apoptotic agent (or reset its
    /// accumulated evidence/waste counters).
    pub fn register_agent(&mut self, agent_id: &str, initial_tokens: f64, capacity: f64) {
        self.buckets
            .entry(agent_id.to_string())
            .or_insert_with(|| AgentComputeBucket::new(agent_id, initial_tokens, capacity));
    }

    /// Allocates compute time according to the agent's current token balance.
    pub fn schedule_step(&mut self, agent_id: &str, token_cost: f64) -> SchedulingDecision {
        let now = Instant::now();
        let bucket = match self.buckets.get_mut(agent_id) {
            Some(b) => b,
            None => return SchedulingDecision::Terminated { reason: format!("Agent '{agent_id}' is not registered.") },
        };

        bucket.refill(now);
        match bucket.state {
            BucketState::Apoptotic | BucketState::Starved => {
                SchedulingDecision::Terminated { reason: "Agent is dead from compute starvation.".to_string() }
            }
            BucketState::Throttled { sleep_ms } => {
                SchedulingDecision::Suspended { sleep_ms, reason: "Agent is currently throttled.".to_string() }
            }
            BucketState::Active => self.evaluate_active_allocation(agent_id, token_cost),
        }
    }

    fn evaluate_active_allocation(&mut self, agent_id: &str, token_cost: f64) -> SchedulingDecision {
        let bucket = self.buckets.get_mut(agent_id).unwrap();
        if bucket.tokens >= token_cost {
            bucket.tokens -= token_cost;
            let time_slice = BASELINE_CPU_QUANTUM_MS + (bucket.tokens / bucket.capacity * 100.0) as u64;
            SchedulingDecision::Allowed { allocated_tokens: token_cost, time_slice_ms: time_slice, remaining_tokens: bucket.tokens }
        } else {
            bucket.starvation_count += 1;
            if bucket.starvation_count >= MAX_STARVATION_ATTEMPTS {
                bucket.state = BucketState::Starved;
                SchedulingDecision::Terminated { reason: "Compute starvation limit exceeded.".to_string() }
            } else {
                let sleep_ms = 200 * bucket.starvation_count as u64;
                bucket.state = BucketState::Throttled { sleep_ms };
                bucket.throttled_until = Some(Instant::now() + Duration::from_millis(sleep_ms));
                SchedulingDecision::Suspended { sleep_ms, reason: "Insufficient tokens for quantum.".to_string() }
            }
        }
    }

    /// Rewards good evidence submission with fresh compute tokens and burst headroom.
    pub fn reward_proof(&mut self, agent_id: &str, evidence_score: f64) -> Result<RewardReport, String> {
        let bucket = self.buckets.get_mut(agent_id)
            .ok_or_else(|| format!("Agent '{agent_id}' not found"))?;

        // Death from compute starvation is terminal: a dead agent cannot be
        // revived by submitting a perfect proof.
        if bucket.is_dead() {
            return Err(format!(
                "Agent '{agent_id}' is {:?}; dead agents cannot be rewarded.",
                bucket.state
            ));
        }

        let score = evidence_score.clamp(0.0, 1.0);
        let bonus_capacity = if score >= 0.85 { 20.0 } else { 0.0 };
        bucket.capacity = (bucket.capacity + bonus_capacity).min(MAX_BUCKET_CAPACITY);

        let reward = 30.0 * score;
        bucket.tokens = (bucket.tokens + reward).min(bucket.capacity);
        bucket.total_evidence += score;
        bucket.starvation_count = 0;

        if matches!(bucket.state, BucketState::Throttled { .. }) {
            bucket.state = BucketState::Active;
            bucket.throttled_until = None;
        }

        Ok(RewardReport {
            agent_id: agent_id.to_string(),
            added_tokens: reward,
            new_balance: bucket.tokens,
            capacity: bucket.capacity,
        })
    }

    /// Penalizes waste (hallucination, broken proofs, repeated failures) with token drain and sleep.
    pub fn penalize_waste(&mut self, agent_id: &str, waste_score: f64) -> Result<PenaltyReport, String> {
        let bucket = self.buckets.get_mut(agent_id)
            .ok_or_else(|| format!("Agent '{agent_id}' not found"))?;

        let waste = waste_score.clamp(0.0, 1.0);
        let penalty = 25.0 * (1.0 + waste);
        bucket.tokens = (bucket.tokens - penalty).max(0.0);
        bucket.total_waste += waste;

        if bucket.tokens <= 0.0 {
            bucket.starvation_count += 1;
            if bucket.starvation_count >= MAX_STARVATION_ATTEMPTS || waste >= 0.9 {
                bucket.state = BucketState::Apoptotic;
            } else {
                let sleep_ms = 500;
                bucket.state = BucketState::Throttled { sleep_ms };
                bucket.throttled_until = Some(Instant::now() + Duration::from_millis(sleep_ms));
            }
        } else if waste >= 0.5 {
            let sleep_ms = (waste * 400.0) as u64;
            bucket.state = BucketState::Throttled { sleep_ms };
            bucket.throttled_until = Some(Instant::now() + Duration::from_millis(sleep_ms));
        }

        Ok(PenaltyReport {
            agent_id: agent_id.to_string(),
            deducted_tokens: penalty,
            new_balance: bucket.tokens,
            state: bucket.state.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_agent_does_not_resurrect_a_dead_bucket() {
        let mut scheduler = TokenBucketScheduler::new();
        scheduler.register_agent("agent-a", 50.0, DEFAULT_BUCKET_CAPACITY);
        scheduler.buckets.get_mut("agent-a").unwrap().state = BucketState::Apoptotic;

        scheduler.register_agent("agent-a", 100.0, DEFAULT_BUCKET_CAPACITY);

        let bucket = scheduler.buckets.get("agent-a").unwrap();
        assert_eq!(bucket.state, BucketState::Apoptotic);
        assert_eq!(bucket.tokens, 50.0, "re-registration must not reset counters");
    }

    #[test]
    fn reward_proof_rejects_dead_agents() {
        let mut scheduler = TokenBucketScheduler::new();
        scheduler.register_agent("agent-a", 10.0, DEFAULT_BUCKET_CAPACITY);
        scheduler.buckets.get_mut("agent-a").unwrap().state = BucketState::Starved;

        assert!(scheduler.reward_proof("agent-a", 1.0).is_err());
        assert_eq!(scheduler.buckets.get("agent-a").unwrap().state, BucketState::Starved);
    }

    #[test]
    fn reward_proof_capacity_is_capped() {
        let mut scheduler = TokenBucketScheduler::new();
        scheduler.register_agent("agent-a", 0.0, DEFAULT_BUCKET_CAPACITY);

        for _ in 0..200 {
            scheduler.reward_proof("agent-a", 1.0).unwrap();
        }

        assert_eq!(scheduler.buckets.get("agent-a").unwrap().capacity, MAX_BUCKET_CAPACITY);
    }
}
