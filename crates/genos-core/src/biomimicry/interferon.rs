//! Interferon signaling mapped to preventive neighborhood alerting.
//!
//! Biological mechanism: when a cell detects a virus it secretes interferons;
//! *neighboring* cells enter an antiviral state BEFORE being infected —
//! defenses propagate faster than the pathogen. Paracrine (short-range),
//! brief, immediate: distinct from endocrine (slow, global) and from
//! inflammation (system-wide). Repeated exposure escalates the antiviral
//! state (sensitivity ramp with saturation).

/// An emitted paracrine alert carrying the confirmed threat signature.
#[derive(Debug, Clone, PartialEq)]
pub struct InterferonSignal {
    pub source_capsule: String,
    /// Normalized threat tokens (whitespace-lowercase), reusable by memory.
    pub signature_tokens: Vec<String>,
    /// Antiviral state lifetime in seconds (brief by design).
    pub ttl_seconds: u64,
}

impl InterferonSignal {
    pub fn new(source_capsule: &str, signature: &str, ttl_seconds: u64) -> Self {
        InterferonSignal {
            source_capsule: source_capsule.to_string(),
            signature_tokens: signature
                .split_whitespace()
                .map(|t| t.to_ascii_lowercase())
                .filter(|t| !t.is_empty())
                .collect(),
            ttl_seconds,
        }
    }
}

/// The antiviral state a neighbor enters upon receiving an interferon.
#[derive(Debug, Clone, PartialEq)]
pub struct AntiviralState {
    /// Multiplicative sensitivity boost for local detectors.
    /// Ramps 1.25x on first emission, saturating at 2.0x after 4+ re-emissions.
    pub sensitivity_boost: f64,
    /// External writes are frozen while primed (conservative reflex).
    pub external_writes_frozen: bool,
    /// Absolute expiry timestamp in seconds since an agreed epoch.
    pub expires_at_secs: u64,
    /// How many emissions this state has absorbed (escalation counter).
    pub emissions_seen: u32,
}

fn boost_for(emissions_seen: u32) -> f64 {
    let steps = emissions_seen.min(4);
    1.0 + 0.25 * f64::from(steps)
}

/// Compute the antiviral state a neighbor should hold after receiving
/// `signal` at `now_secs`. If the neighbor was already primed, the state
/// escalates (boost ramp) and the window is extended from now.
pub fn receive(
    previous: Option<&AntiviralState>,
    _signal: &InterferonSignal,
    now_secs: u64,
    ttl_seconds: u64,
) -> AntiviralState {
    let emissions_seen = previous.map_or(0, |s| s.emissions_seen) + 1;
    AntiviralState {
        sensitivity_boost: boost_for(emissions_seen),
        external_writes_frozen: true,
        expires_at_secs: now_secs + ttl_seconds,
        emissions_seen,
    }
}

/// Fan-out of one emission to the declared neighborhood (paracrine radius).
/// Returns `(neighbor_id, new_state)` pairs; neighbors keep no history here —
/// callers merge results into their own state stores.
pub fn emit(
    signal: &InterferonSignal,
    neighbors: &[String],
    now_secs: u64,
) -> Vec<(String, AntiviralState)> {
    neighbors
        .iter()
        .map(|neighbor| {
            (
                neighbor.clone(),
                receive(None, signal, now_secs, signal.ttl_seconds),
            )
        })
        .collect()
}

/// Merge an incoming state into a neighbor's stored state, escalating when
/// already primed and extending the window from `now_secs`.
pub fn merge_into(
    stored: Option<&AntiviralState>,
    incoming: &AntiviralState,
    now_secs: u64,
    ttl_seconds: u64,
) -> AntiviralState {
    match stored {
        // Expired or absent: treat as fresh exposure.
        None => AntiviralState { ..incoming.clone() },
        Some(previous) if previous.expires_at_secs <= now_secs => {
            AntiviralState { ..incoming.clone() }
        }
        Some(_) => receive(
            stored,
            &InterferonSignal::new("", "", 0),
            now_secs,
            ttl_seconds,
        ),
    }
}

/// Drop expired states; returns the ids whose protection just lapsed so the
/// orchestrator can journal the return to baseline vigilance.
pub fn expire<'a, I>(states: I, now_secs: u64) -> Vec<String>
where
    I: IntoIterator<Item = (&'a String, &'a AntiviralState)>,
{
    let mut lapsed = Vec::new();
    for (id, state) in states {
        if state.expires_at_secs <= now_secs {
            lapsed.push(id.clone());
        }
    }
    lapsed
}

/// True while the neighbor is protected (non-expired antiviral state).
pub fn is_primed(state: &AntiviralState, now_secs: u64) -> bool {
    state.expires_at_secs > now_secs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sig() -> InterferonSignal {
        InterferonSignal::new("capsule-a", "prompt injection exfiltration", 300)
    }

    #[test]
    fn emit_primes_whole_neighborhood() {
        let neighbors = vec!["b".to_string(), "c".to_string(), "d".to_string()];
        let primed = emit(&sig(), &neighbors, 1000);
        assert_eq!(primed.len(), 3);
        for (id, state) in &primed {
            assert!(neighbors.contains(id));
            assert!(is_primed(state, 1000));
            assert!(state.external_writes_frozen);
            assert_eq!(state.expires_at_secs, 1300);
            assert_eq!(state.emissions_seen, 1);
            assert!((state.sensitivity_boost - 1.25).abs() < f64::EPSILON);
        }
    }

    #[test]
    fn repeated_exposure_escalates_and_saturates() {
        let mut state = receive(None, &sig(), 1000, 300);
        for expected_emissions in 2..=6u32 {
            state = merge_into(Some(&state), &receive(None, &sig(), 1100, 300), 1100, 300);
            assert_eq!(state.emissions_seen, expected_emissions);
        }
        // Saturated at 4 steps -> 2.0x regardless of further emissions.
        assert!((state.sensitivity_boost - 2.0).abs() < f64::EPSILON);
    }

    #[test]
    fn expired_state_resets_to_first_exposure() {
        let old = AntiviralState {
            sensitivity_boost: 2.0,
            external_writes_frozen: true,
            expires_at_secs: 900,
            emissions_seen: 5,
        };
        let merged = merge_into(Some(&old), &receive(None, &sig(), 1000, 300), 1000, 300);
        assert_eq!(merged.emissions_seen, 1);
        assert!((merged.sensitivity_boost - 1.25).abs() < f64::EPSILON);
    }

    #[test]
    fn expire_lists_only_lapsed_neighbors() {
        let mut states = std::collections::BTreeMap::new();
        states.insert(
            "fresh".to_string(),
            AntiviralState {
                sensitivity_boost: 1.25,
                external_writes_frozen: true,
                expires_at_secs: 2000,
                emissions_seen: 1,
            },
        );
        states.insert(
            "lapsed".to_string(),
            AntiviralState {
                sensitivity_boost: 1.25,
                external_writes_frozen: true,
                expires_at_secs: 500,
                emissions_seen: 1,
            },
        );
        let lapsed = expire(&states, 1000);
        assert_eq!(lapsed, vec!["lapsed".to_string()]);
    }
}
