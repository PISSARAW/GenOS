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

/// Mirrors the JS `Number.isFinite` guard in `agentEvidenceService`.
fn is_finite(value: f64) -> bool {
    value.is_finite()
}

/// Safe default for public entry points that cannot return `Err`.
fn sanitize_non_negative(value: f64, fallback: f64) -> f64 {
    if is_finite(value) && value >= 0.0 { value } else { fallback }
}

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
        // NaN capacity/tokens would brake the bucket (all comparisons false).
        let capacity = if is_finite(capacity) && capacity > 0.0 {
            capacity
        } else {
            DEFAULT_BUCKET_CAPACITY
        };
        let initial_tokens = sanitize_non_negative(initial_tokens, 0.0);
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
        // Saturating clock read: never panics if time moves backwards.
        // Refill is driven by `schedule_step`; reward/penalty do not refill.
        let elapsed = now.saturating_duration_since(self.last_refill).as_secs_f64();
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

    /// Allocates compute time. This is the only automatic refill point; a
    /// non-finite/negative `token_cost` sanitizes to `0.0` instead of
    /// corrupting the balance or faking a starvation.
    pub fn schedule_step(&mut self, agent_id: &str, token_cost: f64) -> SchedulingDecision {
        let token_cost = sanitize_non_negative(token_cost, 0.0);
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
            // The slice bonus is derived from the balance BEFORE the quantum
            // is deducted, so a bigger reservoir always yields a longer slice.
            let balance_before = bucket.tokens;
            bucket.tokens -= token_cost;
            let capacity = bucket.capacity.max(f64::MIN_POSITIVE);
            let time_slice = BASELINE_CPU_QUANTUM_MS + (balance_before / capacity * 100.0) as u64;
            SchedulingDecision::Allowed { allocated_tokens: token_cost, time_slice_ms: time_slice, remaining_tokens: bucket.tokens }
        } else {
            Self::record_starvation(bucket)
        }
    }

    /// Sole owner of starvation accounting: one increment per failed
    /// allocation, death at the limit. `penalize_waste` never touches it.
    fn record_starvation(bucket: &mut AgentComputeBucket) -> SchedulingDecision {
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

    /// Rewards good evidence submission with fresh compute tokens and burst headroom.
    pub fn reward_proof(&mut self, agent_id: &str, evidence_score: f64) -> Result<RewardReport, String> {
        let bucket = self.buckets.get_mut(agent_id)
            .ok_or_else(|| format!("Agent '{agent_id}' not found"))?;

        // NaN/Infinity is not a score: reject before it poisons the balance.
        if !is_finite(evidence_score) {
            return Err(format!("Agent '{agent_id}' received a non-finite evidence score."));
        }

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

    /// Penalizes waste with token drain and sleep. Does not touch
    /// `starvation_count` (owned by `record_starvation`); severe waste
    /// (`>= 0.9`) triggers apoptosis directly.
    pub fn penalize_waste(&mut self, agent_id: &str, waste_score: f64) -> Result<PenaltyReport, String> {
        let bucket = self.buckets.get_mut(agent_id)
            .ok_or_else(|| format!("Agent '{agent_id}' not found"))?;

        // Reject non-finite waste before it can poison the deduction/balance.
        if !is_finite(waste_score) {
            return Err(format!("Agent '{agent_id}' received a non-finite waste score."));
        }

        let waste = waste_score.clamp(0.0, 1.0);
        let penalty = 25.0 * (1.0 + waste);
        bucket.tokens = (bucket.tokens - penalty).max(0.0);
        bucket.total_waste += waste;

        if bucket.tokens <= 0.0 {
            if waste >= 0.9 {
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

    #[test]
    fn bad_scores_do_not_corrupt_the_bucket() {
        for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let mut scheduler = TokenBucketScheduler::new();
            scheduler.register_agent("agent-a", 50.0, DEFAULT_BUCKET_CAPACITY);
            assert!(scheduler.reward_proof("agent-a", bad).is_err());
            assert!(scheduler.penalize_waste("agent-a", bad).is_err());
            let bucket = scheduler.buckets.get("agent-a").unwrap();
            assert!(bucket.tokens.is_finite() && bucket.capacity.is_finite());
            assert_eq!(bucket.tokens, 50.0);
            assert_eq!(bucket.capacity, DEFAULT_BUCKET_CAPACITY);
            assert_eq!(bucket.state, BucketState::Active);
            assert_eq!(bucket.starvation_count, 0);
            assert!(!bucket.is_dead(), "NaN/{bad} bricked the bucket");
        }
        let mut scheduler = TokenBucketScheduler::new();
        scheduler.register_agent("agent-a", 50.0, DEFAULT_BUCKET_CAPACITY);
        let reward = scheduler.reward_proof("agent-a", -3.0).unwrap();
        assert_eq!(reward.added_tokens, 0.0);
        assert_eq!(reward.new_balance, 50.0);
        let penalty = scheduler.penalize_waste("agent-a", -3.0).unwrap();
        assert!(penalty.deducted_tokens.is_finite() && penalty.new_balance.is_finite());
        assert!(scheduler.buckets.get("agent-a").unwrap().tokens.is_finite());
    }

    #[test]
    fn schedule_step_sanitizes_invalid_token_cost() {
        for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -5.0] {
            let mut scheduler = TokenBucketScheduler::new();
            scheduler.register_agent("agent-a", 50.0, DEFAULT_BUCKET_CAPACITY);
            match scheduler.schedule_step("agent-a", bad) {
                SchedulingDecision::Allowed { allocated_tokens, remaining_tokens, .. } => {
                    assert_eq!(allocated_tokens, 0.0, "bad cost {bad} must sanitize to zero");
                    assert!(remaining_tokens.is_finite() && remaining_tokens >= 50.0);
                }
                other => panic!("expected sanitized allowance for {bad}, got {other:?}"),
            }
            assert_eq!(scheduler.buckets.get("agent-a").unwrap().starvation_count, 0);
        }
    }

    #[test]
    fn starvation_is_counted_once_per_event() {
        let mut scheduler = TokenBucketScheduler::new();
        scheduler.register_agent("agent-a", 5.0, DEFAULT_BUCKET_CAPACITY);
        assert!(matches!(
            scheduler.schedule_step("agent-a", 20.0),
            SchedulingDecision::Suspended { .. }
        ));
        assert_eq!(scheduler.buckets.get("agent-a").unwrap().starvation_count, 1);
        // Draining to zero via waste must not bump the starvation counter.
        let _ = scheduler.penalize_waste("agent-a", 0.5).unwrap();
        let bucket = scheduler.buckets.get("agent-a").unwrap();
        assert_eq!(bucket.starvation_count, 1);
        assert!(bucket.tokens.is_finite());
    }

    #[test]
    fn time_slice_increases_with_available_tokens() {
        let mut poor = TokenBucketScheduler::new();
        poor.register_agent("poor", 20.0, DEFAULT_BUCKET_CAPACITY);
        let mut rich = TokenBucketScheduler::new();
        rich.register_agent("rich", 80.0, DEFAULT_BUCKET_CAPACITY);
        let poor_slice = allowed_slice(&mut poor, "poor");
        let rich_slice = allowed_slice(&mut rich, "rich");
        assert!(rich_slice > poor_slice, "rich={rich_slice} poor={poor_slice}");
    }

    #[test]
    fn refill_survives_a_backwards_clock() {
        let mut bucket = AgentComputeBucket::new("agent-a", 50.0, DEFAULT_BUCKET_CAPACITY);
        bucket.last_refill = Instant::now() + Duration::from_secs(60);
        bucket.refill(Instant::now());
        assert!(bucket.tokens.is_finite());
        assert_eq!(bucket.tokens, 50.0, "backwards clock must not grant tokens");
    }

    fn allowed_slice(scheduler: &mut TokenBucketScheduler, agent_id: &str) -> u64 {
        match scheduler.schedule_step(agent_id, 5.0) {
            SchedulingDecision::Allowed { time_slice_ms, .. } => time_slice_ms,
            other => panic!("expected allowed decision, got {other:?}"),
        }
    }
}
