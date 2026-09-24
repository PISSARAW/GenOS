use genos_orchestrator::token_bucket::{DEFAULT_BUCKET_CAPACITY, MAX_BUCKET_CAPACITY};
use genos_orchestrator::{
    AgentComputeBucket, BucketState, SchedulingDecision, TokenBucketScheduler,
};
use std::time::{Duration, Instant};

#[test]
fn register_agent_does_not_resurrect_a_dead_bucket() {
    let mut scheduler = TokenBucketScheduler::new();
    scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 50.0, capacity: DEFAULT_BUCKET_CAPACITY });
    scheduler.buckets.get_mut("agent-a").unwrap().state = BucketState::Apoptotic;

    scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 100.0, capacity: DEFAULT_BUCKET_CAPACITY });

    let bucket = scheduler.buckets.get("agent-a").unwrap();
    assert_eq!(bucket.state, BucketState::Apoptotic);
    assert_eq!(bucket.tokens, 50.0, "re-registration must not reset counters");
}

#[test]
fn reward_proof_rejects_dead_agents() {
    let mut scheduler = TokenBucketScheduler::new();
    scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 10.0, capacity: DEFAULT_BUCKET_CAPACITY });
    scheduler.buckets.get_mut("agent-a").unwrap().state = BucketState::Starved;

    assert!(scheduler.reward_proof("agent-a", 1.0).is_err());
    assert_eq!(scheduler.buckets.get("agent-a").unwrap().state, BucketState::Starved);
}

#[test]
fn penalize_waste_rejects_dead_agents() {
    for dead in [BucketState::Starved, BucketState::Apoptotic] {
        let mut scheduler = TokenBucketScheduler::new();
        scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 50.0, capacity: DEFAULT_BUCKET_CAPACITY });
        scheduler.buckets.get_mut("agent-a").unwrap().state = dead.clone();

        assert!(scheduler.penalize_waste("agent-a", 0.5).is_err());
        assert_eq!(scheduler.buckets.get("agent-a").unwrap().state, dead);
    }
}

#[test]
fn severe_waste_triggers_apoptosis_even_with_tokens() {
    let mut scheduler = TokenBucketScheduler::new();
    scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 100.0, capacity: DEFAULT_BUCKET_CAPACITY });

    let report = scheduler.penalize_waste("agent-a", 1.0).unwrap();

    assert!(matches!(report.state, BucketState::Apoptotic));
    assert_eq!(scheduler.buckets.get("agent-a").unwrap().tokens, 0.0);
}

#[test]
fn zero_score_reward_does_not_clear_starvation() {
    let mut scheduler = TokenBucketScheduler::new();
    scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 5.0, capacity: DEFAULT_BUCKET_CAPACITY });
    scheduler.schedule_step("agent-a", 20.0);
    assert_eq!(scheduler.buckets.get("agent-a").unwrap().starvation_count, 1);

    scheduler.reward_proof("agent-a", 0.0).unwrap();

    let bucket = scheduler.buckets.get("agent-a").unwrap();
    assert_eq!(bucket.starvation_count, 1, "un reward nul ne doit pas effacer la famine");
    assert!(matches!(bucket.state, BucketState::Throttled { .. }));
}

#[test]
fn reward_proof_capacity_is_capped() {
    let mut scheduler = TokenBucketScheduler::new();
    scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 0.0, capacity: DEFAULT_BUCKET_CAPACITY });

    for _ in 0..200 {
        scheduler.reward_proof("agent-a", 1.0).unwrap();
    }

    assert_eq!(scheduler.buckets.get("agent-a").unwrap().capacity, MAX_BUCKET_CAPACITY);
}

#[test]
fn bad_scores_do_not_corrupt_the_bucket() {
    for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let mut scheduler = TokenBucketScheduler::new();
        scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 50.0, capacity: DEFAULT_BUCKET_CAPACITY });
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
    scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 50.0, capacity: DEFAULT_BUCKET_CAPACITY });
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
        scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 50.0, capacity: DEFAULT_BUCKET_CAPACITY });
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
    scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "agent-a", initial_tokens: 5.0, capacity: DEFAULT_BUCKET_CAPACITY });
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
    poor.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "poor", initial_tokens: 20.0, capacity: DEFAULT_BUCKET_CAPACITY });
    let mut rich = TokenBucketScheduler::new();
    rich.register_agent(crate::token_bucket::RegistrationConfig { agent_id: "rich", initial_tokens: 80.0, capacity: DEFAULT_BUCKET_CAPACITY });
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

#[test]
fn invariants_hold_under_random_operations() {
    let mut scheduler = TokenBucketScheduler::new();
    for id in ["a", "b", "c"] {
        scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: id, initial_tokens: 50.0, capacity: DEFAULT_BUCKET_CAPACITY });
    }
    let mut seed = 0xdead_beef_1234_5678_u64;
    let mut next = move || {
        seed = seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (seed >> 33) as usize
    };
    for _ in 0..500 {
        let id = ["a", "b", "c"][next() % 3];
        match next() % 6 {
            0 => {
                scheduler.schedule_step(id, (next() % 60) as f64);
            }
            1 => {
                let _ = scheduler.reward_proof(id, (next() % 100) as f64 / 100.0);
            }
            2 => {
                let _ = scheduler.penalize_waste(id, (next() % 100) as f64 / 100.0);
            }
            3 => {
                scheduler.register_agent(crate::token_bucket::RegistrationConfig { agent_id: id, initial_tokens: 10.0, capacity: DEFAULT_BUCKET_CAPACITY });
            }
            _ => {
                scheduler.schedule_step(id, 0.0);
            }
        }
        for bucket in scheduler.buckets.values() {
            bucket.check_invariants().unwrap();
        }
    }
}

