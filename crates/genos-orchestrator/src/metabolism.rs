//! Métabolisme énergétique : l'ATP est une ressource **réelle** qui se
//! reconstitue avec le **temps réel** et se consomme à chaque opération.
//!
//! La famine (ATP nul) **bloque réellement** les actions, comme un organisme
//! sans énergie.

use crate::GenosEcosystem;
use genos_biology::glycolysis::{MetabolicCycleReport, run_metabolic_cycle};
use std::time::Instant;

/// Combien de tokens de budget ATP correspondent à une mole d'ATP chimique
/// réellement synthétisée par la glycolyse (facteur de conversion documenté,
/// choisi pour que le "repas" métabolique reste dans l'ordre de grandeur du
/// budget existant).
const ATP_TOKENS_PER_MOL: f64 = 10.0;

/// Réserve d'ATP avec régénération temporelle réelle.
#[derive(Clone, Debug)]
pub struct Metabolism {
    pub atp: f64,
    pub capacity: f64,
    pub refill_per_sec: f64,
    pub consumed_total: f64,
    pub produced_total: f64,
    last_refill: Instant,
}

impl Default for Metabolism {
    fn default() -> Self {
        Self::new(100.0, 10.0)
    }
}

impl Metabolism {
    pub fn new(capacity: f64, refill_per_sec: f64) -> Self {
        Self {
            atp: capacity,
            capacity,
            refill_per_sec,
            consumed_total: 0.0,
            produced_total: 0.0,
            last_refill: Instant::now(),
        }
    }

    /// Reconstitue l'ATP selon le temps réel écoulé (horloge saturante).
    pub fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now
            .saturating_duration_since(self.last_refill)
            .as_secs_f64();
        if elapsed > 0.0 {
            self.atp = (self.atp + elapsed * self.refill_per_sec).min(self.capacity);
            self.last_refill = now;
        }
    }

    pub fn available(&self) -> f64 {
        self.atp
    }

    pub fn is_starved(&self) -> bool {
        self.atp <= 0.0
    }

    /// Débite un coût ; renvoie `false` si l'ATP est insuffisant (famine).
    pub fn consume(&mut self, cost: f64) -> bool {
        self.refill();
        if !cost.is_finite() || cost <= 0.0 {
            return true;
        }
        if self.atp + 1e-9 >= cost {
            self.atp -= cost;
            self.consumed_total += cost;
            true
        } else {
            false
        }
    }

    /// Ingestion d'énergie externe (« repas »).
    pub fn feed(&mut self, amount: f64) {
        self.refill();
        let amount = if amount.is_finite() && amount > 0.0 {
            amount
        } else {
            0.0
        };
        self.atp = (self.atp + amount).min(self.capacity);
        self.produced_total += amount;
    }
}

impl GenosEcosystem {
    /// Nourrit l'organisme : reconstitue l'ATP.
    pub fn feed(&mut self, amount: f64) {
        self.orchestrator.metabolism.feed(amount);
    }

    /// ATP disponible (reconstitue d'abord selon le temps réel).
    pub fn atp(&mut self) -> f64 {
        self.orchestrator.metabolism.refill();
        self.orchestrator.metabolism.available()
    }

    /// Métabolise réellement du glucose : fait tourner le réseau de réactions
    /// chimiques équilibrées (glycolyse + régénération des cofacteurs +
    /// hydrolyse de l'ATP) jusqu'à épuisement du substrat, vérifie le bilan
    /// de matière/énergie mesuré, puis convertit l'ATP chimique produit en
    /// tokens de budget via [`GenosEcosystem::feed`]. C'est le pont entre la
    /// chimie réelle (`chemistry`/`glycolysis`) et le budget abstrait.
    pub fn metabolize_glucose(&mut self, glucose_mol: f64) -> MetabolicCycleReport {
        let report = run_metabolic_cycle(&mut self.orchestrator.chemistry, glucose_mol);
        self.feed(report.atp_produced_mol * ATP_TOKENS_PER_MOL);
        report
    }
}
