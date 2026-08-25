//! Virophage defense: parasites of viruses deployed inside honeypot viral
//! factories, with heritable countermeasure harvesting.
//!
//! Reference design: `docs/3-features-and-domain/resilience/virophage.md.
//!
//! Activation: a virophage is deployed automatically when a threat is
//! confirmed against a registered honeypot (the autotomy gate of the existing
//! cyber-immune system). It never runs outside its session sandbox.

use serde::{Deserialize, Serialize};

/// Default exponential decay of attacker yield per parasite load unit.
pub const DEFAULT_DECAY_MU: f64 = 0.35;

/// Attacker yield below which the honeypot is declared sterile.
pub const STERILE_EPSILON: f64 = 0.05;

/// Hard cap on parasite load; crossing it triggers apoptosis of the session.
pub const MAX_PARASITE_LOAD: f64 = 512.0;

/// One harvested signature of the attacker's playbook.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AttackGene {
    pub signature_hash: String,
    pub embedding: Vec<f32>,
    pub playbook_variant_id: String,
}

/// A minimal agent parasitizing a hostile reasoning loop inside one honeypot.
///
/// Each observed playbook iteration increases the parasite load, which
/// exponentially degrades the attacker's effective propagation rate
/// (`Sputnik model). Crossing [`MAX_PARASITE_LOAD] terminates the agent.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VirophageAgent {
    pub parasite_load: f64,
    pub decay_mu: f64,
    pub terminated: bool,
    harvested: Vec<AttackGene>,
}

impl VirophageAgent {
    pub fn new(decay_mu: f64) -> Self {
        Self {
            parasite_load: 0.0,
            decay_mu,
            terminated: false,
            harvested: Vec::new(),
        }
    }

    /// Effective attacker propagation rate under current parasitic load:
    /// `Pi_0 * exp(-mu * V)`.
    pub fn attacker_yield(&self) -> f64 {
        (-self.decay_mu * self.parasite_load).exp()
    }

    pub fn sterile(&self) -> bool {
        self.attacker_yield() < STERILE_EPSILON
    }

    /// Called once per attacker playbook iteration. Returns the updated
    /// attacker yield, or an error when the parasite-load cap triggered
    /// apoptosis of this virophage.
    pub fn observe_iteration(&mut self, gene: AttackGene) -> Result<f64, String> {
        if self.terminated {
            return Err("virophage already terminated by parasite-load cap".into());
        }
        self.harvested.push(gene);
        self.parasite_load += 1.0;
        if self.parasite_load >= MAX_PARASITE_LOAD {
            self.terminated = true;
            return Err(format!(
                "parasite load {} exceeded cap {MAX_PARASITE_LOAD}; apoptosis triggered",
                self.parasite_load
            ));
        }
        Ok(self.attacker_yield())
    }

    /// Mavirus-style harvest: countermeasure candidates for human review.
    pub fn harvest(&self) -> &[AttackGene] {
        &self.harvested
    }
}

/// One captured attack living in an isolated honeypot viral factory.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HoneypotSession {
    pub session_id: String,
    pub source_signature: String,
    pub virophage: VirophageAgent,
    /// Forensic granules preserved through teardown (DLQ contract).
    pub forensics: Vec<String>,
    pub closed: bool,
}

impl HoneypotSession {
    pub fn new(session_id: &str, source_signature: &str) -> Self {
        Self {
            session_id: session_id.to_string(),
            source_signature: source_signature.to_string(),
            virophage: VirophageAgent::new(DEFAULT_DECAY_MU),
            forensics: Vec::new(),
            closed: false,
        }
    }

    /// Records a forensic granule for every playbook iteration seen.
    pub fn record_iteration(&mut self, gene: &AttackGene) -> Result<f64, String> {
        self.forensics.push(format!(
            "{}:{}",
            gene.playbook_variant_id, gene.signature_hash
        ));
        let yield_now = self.virophage.observe_iteration(gene.clone());
        if self.virophage.terminated {
            self.forensics.push("virophage-apoptosis".into());
        }
        yield_now
    }

    /// Deterministic teardown preserving forensic granules; returns the
    /// number of harvested attack genes handed to the review pipeline.
    pub fn sterilize(&mut self) -> Result<usize, String> {
        if self.closed {
            return Err("session already closed".into());
        }
        let count = self.harvest().len();
        self.closed = true;
        Ok(count)
    }

    fn harvest(&self) -> &[AttackGene] {
        self.virophage.harvest()
    }

    pub fn sterile(&self) -> bool {
        self.virophage.sterile() || self.virophage.terminated
    }
}

/// Registry of honeypot sessions. This is where activation lives: confirming
/// a threat against a source signature opens a session and deploys a
/// virophage into it immediately — no manual step required.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct HoneypotFactory {
    sessions: Vec<HoneypotSession>,
}

impl HoneypotFactory {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn sessions(&self) -> &[HoneypotSession] {
        &self.sessions
    }

    /// Mutable session access for callers recording playbook iterations.
    pub fn sessions_mut(&mut self) -> &mut [HoneypotSession] {
        &mut self.sessions
    }

    /// Finds an open session hosting `source_signature`, or opens a new one
    /// with a freshly deployed virophage (**activation on confirmed antigen`).
    pub fn confirm_threat(
        &mut self,
        session_id: &str,
        source_signature: &str,
    ) -> &mut HoneypotSession {
        let index = self
            .sessions
            .iter()
            .position(|s| s.source_signature == source_signature && !s.closed)
            .unwrap_or_else(|| {
                let id = format!("{}-{}", session_id, self.sessions.len());
                self.sessions.push(HoneypotSession::new(&id, source_signature));
                self.sessions.len() - 1
            });
        &mut self.sessions[index]
    }

    /// Teardown after sterilization; forensic granules survive in the returned
    /// report so nothing learned about the adversary is lost.
    pub fn sterilize_session(&mut self, session_id: &str) -> Result<SterilizationReport, String> {
        let session = self
            .sessions
            .iter_mut()
            .find(|s| s.session_id == session_id)
            .ok_or_else(|| format!("unknown session {session_id}"))?;
        let forensics = std::mem::take(&mut session.forensics);
        let harvested_genes = session.sterilize()?;
        Ok(SterilizationReport {
            session_id: session_id.to_string(),
            harvested_genes,
            forensics,
        })
    }
}

/// Outcome of a honeypot teardown.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SterilizationReport {
    pub session_id: String,
    pub harvested_genes: usize,
    pub forensics: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gene(hash: &str) -> AttackGene {
        AttackGene {
            signature_hash: hash.to_string(),
            embedding: vec![0.1, 0.2],
            playbook_variant_id: format!("pb-{hash}"),
        }
    }

    #[test]
    fn yield_decays_and_reaches_sterility() {
        let mut agent = VirophageAgent::new(0.5);
        assert!(agent.attacker_yield() > STERILE_EPSILON);
        for i in 0..10 {
            agent.observe_iteration(gene(&format!("h{i}"))).unwrap();
        }
        assert!(agent.sterile(), "yield after 10 iterations: {}", agent.attacker_yield());
    }

    #[test]
    fn parasite_load_cap_triggers_apoptosis() {
        let mut agent = VirophageAgent::new(0.01);
        for i in 0..(MAX_PARASITE_LOAD as usize - 1) {
            agent.observe_iteration(gene(&format!("h{i}"))).unwrap();
        }
        assert!(!agent.terminated);
        assert!(agent
            .observe_iteration(gene("final"))
            .is_err());
        assert!(agent.terminated);
        // Post-termination observations keep failing.
        assert!(agent.observe_iteration(gene("late")).is_err());
    }

    #[test]
    fn confirmed_threat_deploys_virophage_once_per_source() {
        let mut factory = HoneypotFactory::new();
        factory.confirm_threat("s0", "inject_web_md");
        factory.confirm_threat("s1", "inject_web_md");
        assert_eq!(
            factory.sessions().len(),
            1,
            "same source reuses its open session"
        );
        factory.confirm_threat("s2", "tool_payload_poison");
        assert_eq!(factory.sessions().len(), 2);
        assert_eq!(
            factory.sessions()[0].session_id,
            "s0-0",
            "session ids are collision-safe"
        );
    }

    #[test]
    fn sterilization_preserves_forensics() {
        let mut factory = HoneypotFactory::new();
        let session = factory.confirm_threat("hp", "sig-a");
        session.record_iteration(&gene("g1")).unwrap();
        session.record_iteration(&gene("g2")).unwrap();
        let report = factory.sterilize_session("hp-0").unwrap();
        assert_eq!(report.harvested_genes, 2);
        assert_eq!(report.forensics.len(), 2);
        assert!(factory.sessions()[0].closed);
        assert!(factory.sterilize_session("hp-0").is_err(), "double teardown refused");
    }

    #[test]
    fn closed_sessions_do_not_absorb_new_threats() {
        let mut factory = HoneypotFactory::new();
        {
            let session = factory.confirm_threat("hp", "sig-a");
            session.record_iteration(&gene("g1")).unwrap();
        }
        factory.sterilize_session("hp-0").unwrap();
        factory.confirm_threat("hp2", "sig-a");
        assert_eq!(factory.sessions().len(), 2, "renewed attack gets a fresh session");
    }
}
