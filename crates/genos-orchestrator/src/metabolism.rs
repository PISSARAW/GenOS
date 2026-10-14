//! Métabolisme énergétique : l'ATP est une ressource **réelle** qui se
//! reconstitue avec le **temps réel** et se consomme à chaque opération.
//!
//! La famine (ATP nul) **bloque réellement** les actions, comme un organisme
//! sans énergie.

use crate::GenosEcosystem;
use genos_biology::glycolysis::{MetabolicCycleReport, run_metabolic_cycle};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use uuid::Uuid;

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
    pub consumption_receipts: Vec<MetabolicConsumptionReceipt>,
    last_refill: Instant,
}

/// Trace en mémoire d'une demande de dépense passée par le registre commun.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MetabolicConsumptionReceipt {
    pub operation: String,
    pub requested: f64,
    pub available_before: f64,
    pub available_after: f64,
    pub accepted: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MetabolismCheckpoint {
    pub atp: f64,
    pub capacity: f64,
    pub refill_per_sec: f64,
    pub consumed_total: f64,
    pub produced_total: f64,
    pub consumption_receipts: Vec<MetabolicConsumptionReceipt>,
}

/// Demande de matière première pour une opération d'une mission.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MissionMetabolicPoolDemand {
    pub cell_id: Uuid,
    pub operation: String,
    pub amino_acids: f64,
}

/// Reçu mesuré du registre `MetabolicPool` porté par une cellule active.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MissionMetabolicPoolReceipt {
    pub schema: String,
    pub mission_id: Uuid,
    pub cell_id: Uuid,
    pub operation: String,
    pub requested_amino_acids: f64,
    pub amino_acids_before: f64,
    pub amino_acids_after: f64,
    pub accepted: bool,
    pub refusal_reason: Option<String>,
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
            consumption_receipts: Vec::new(),
            last_refill: Instant::now(),
        }
    }

    pub fn checkpoint(&self) -> MetabolismCheckpoint {
        MetabolismCheckpoint {
            atp: self.atp,
            capacity: self.capacity,
            refill_per_sec: self.refill_per_sec,
            consumed_total: self.consumed_total,
            produced_total: self.produced_total,
            consumption_receipts: self.consumption_receipts.clone(),
        }
    }

    pub fn restore_checkpoint(&mut self, state: MetabolismCheckpoint) -> Result<(), String> {
        let values = [
            state.atp,
            state.capacity,
            state.refill_per_sec,
            state.consumed_total,
            state.produced_total,
        ];
        if values
            .iter()
            .any(|value| !value.is_finite() || *value < 0.0)
            || state.atp > state.capacity
        {
            return Err("invalid persisted metabolism checkpoint".into());
        }
        self.atp = state.atp;
        self.capacity = state.capacity;
        self.refill_per_sec = state.refill_per_sec;
        self.consumed_total = state.consumed_total;
        self.produced_total = state.produced_total;
        self.consumption_receipts = state.consumption_receipts;
        self.last_refill = Instant::now();
        Ok(())
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
        self.consume_for("unspecified", cost)
    }

    /// Débite un coût depuis un point d'exécution nommé et conserve son reçu.
    pub fn consume_for(&mut self, operation: &str, cost: f64) -> bool {
        self.refill();
        let available_before = self.atp;
        let accepted = cost.is_finite() && cost >= 0.0 && self.atp + 1e-9 >= cost;
        if accepted && cost > 0.0 {
            self.atp -= cost;
            self.consumed_total += cost;
        }
        self.consumption_receipts.push(MetabolicConsumptionReceipt {
            operation: operation.to_string(),
            requested: cost,
            available_before,
            available_after: self.atp,
            accepted,
        });
        accepted
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
    /// Débite le `MetabolicPool` réel d'une cellule active et journalise le résultat.
    /// Une mission et une cellule enregistrée sont exigées; un manque de matière
    /// produit un reçu de refus sans modifier le solde.
    pub fn consume_mission_metabolic_pool(
        &mut self,
        demand: MissionMetabolicPoolDemand,
    ) -> Result<MissionMetabolicPoolReceipt, String> {
        let mission_id = self
            .mission_id
            .ok_or_else(|| "mission required for metabolic pool consumption".to_string())?;
        let cell = self
            .orchestrator
            .active_cells
            .get_mut(&demand.cell_id)
            .ok_or_else(|| "metabolic pool cell is not active".to_string())?;
        let (amino_acids_before, accepted, refusal_reason) = consume_cell_pool(cell, &demand);
        let receipt = MissionMetabolicPoolReceipt {
            schema: "genos.mission-metabolic-pool-receipt/v1".to_string(),
            mission_id,
            cell_id: demand.cell_id,
            operation: demand.operation,
            requested_amino_acids: finite_demand(demand.amino_acids),
            amino_acids_before,
            amino_acids_after: cell.metabolism.amino_acids,
            accepted,
            refusal_reason,
        };
        self.record_event(
            "MISSION_METABOLIC_POOL_RECEIPT",
            serde_json::to_value(&receipt).map_err(|error| error.to_string())?,
        );
        Ok(receipt)
    }

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

pub(crate) fn consume_cell_pool(
    cell: &mut genos_cell::AgentCell,
    demand: &MissionMetabolicPoolDemand,
) -> (f64, bool, Option<String>) {
    let available_before = cell.metabolism.amino_acids;
    let refusal = demand_refusal(&demand.operation, demand.amino_acids);
    let accepted = refusal.is_none() && cell.metabolism.consume_amino_acids(demand.amino_acids);
    let refusal_reason = if accepted {
        None
    } else {
        Some(refusal.unwrap_or_else(|| "insufficient or invalid amino acid reserve".to_string()))
    };
    (available_before, accepted, refusal_reason)
}

fn demand_refusal(operation: &str, amount: f64) -> Option<String> {
    if operation.trim().is_empty() {
        return Some("operation is required".to_string());
    }
    if !amount.is_finite() || amount < 0.0 {
        return Some("amino acid demand must be finite and non-negative".to_string());
    }
    None
}

fn finite_demand(amount: f64) -> f64 {
    if amount.is_finite() && amount >= 0.0 { amount } else { 0.0 }
}

#[cfg(test)]
mod tests {
    use super::Metabolism;

    #[test]
    fn execution_costs_share_auditable_registry_and_fail_closed() {
        let mut metabolism = Metabolism::new(4.0, 0.0);
        assert!(metabolism.consume_for("mission.write", 3.0));
        assert!(!metabolism.consume_for("mission.publish", 2.0));
        assert!(!metabolism.consume_for("mission.invalid", f64::NAN));
        assert_eq!(metabolism.consumption_receipts.len(), 3);
        assert_eq!(
            metabolism.consumption_receipts[0].operation,
            "mission.write"
        );
        assert!(metabolism.consumption_receipts[0].accepted);
        assert_eq!(metabolism.consumption_receipts[1].available_before, 1.0);
        assert!(!metabolism.consumption_receipts[1].accepted);
        assert_eq!(metabolism.consumption_receipts[2].available_after, 1.0);
        assert!(!metabolism.consumption_receipts[2].accepted);
    }
}
