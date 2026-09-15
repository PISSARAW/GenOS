//! Autopoïèse, self-model et auto-réparation.
//!
//! Le système maintient sa **frontière** (`Membrane`) : elle se dégrade avec le
//! temps réel et doit être **régénérée** en consommant de l'ATP. Il produit un
//! **modèle de soi** (`SelfModel`) et se **répare** (membrane, ADN manquant),
//! sans intervention externe. Membrane rompue ⇒ mort.

use crate::GenosEcosystem;
use genos_genome::Genome;
use serde_json::json;
use std::time::Instant;
use uuid::Uuid;

/// Frontière auto-entretenue du système.
#[derive(Clone, Debug)]
pub struct Membrane {
    pub integrity: f64,
    pub capacity: f64,
    pub degrade_per_sec: f64,
    pub repairs: u64,
    last_update: Instant,
}

impl Default for Membrane {
    fn default() -> Self {
        Self::new(1.0, 0.0)
    }
}

impl Membrane {
    pub fn new(capacity: f64, degrade_per_sec: f64) -> Self {
        Self {
            integrity: capacity,
            capacity,
            degrade_per_sec,
            repairs: 0,
            last_update: Instant::now(),
        }
    }

    /// Dégradation selon le temps réel écoulé.
    pub fn update(&mut self) {
        let now = Instant::now();
        let elapsed = now.saturating_duration_since(self.last_update).as_secs_f64();
        if elapsed > 0.0 {
            self.integrity = (self.integrity - elapsed * self.degrade_per_sec).max(0.0);
            self.last_update = now;
        }
    }

    pub fn integrity(&mut self) -> f64 {
        self.update();
        self.integrity
    }

    pub fn repair(&mut self, amount: f64) {
        self.integrity = (self.integrity + amount.max(0.0)).min(self.capacity);
        self.repairs += 1;
    }

    pub fn is_alive(&mut self) -> bool {
        self.integrity() > 0.0
    }
}

/// Modèle de soi : ce que le système sait de lui-même.
#[derive(Clone, Debug)]
pub struct SelfModel {
    pub identity: String,
    pub components: usize,
    pub tissues: usize,
    pub dna_registered: usize,
    pub traces: usize,
    pub integrity: f64,
    pub atp: f64,
    pub repairs: u64,
    pub alive: bool,
}

/// Bilan d'une auto-réparation.
#[derive(Clone, Debug)]
pub struct SelfRepairReport {
    pub actions: Vec<String>,
    pub integrity_before: f64,
    pub integrity_after: f64,
    pub atp_before: f64,
    pub atp_after: f64,
}

impl GenosEcosystem {
    pub(crate) fn maintain_autopoiesis(&mut self) {
        self.orchestrator.metabolism.refill();
        let needs_repair = self.orchestrator.membrane.integrity()
            < self.orchestrator.membrane.capacity
            || self
                .orchestrator
                .active_cells
                .keys()
                .any(|id| {
                    !self.agent_dna.contains_key(id)
                        || self
                            .orchestrator
                            .active_cells
                            .get(id)
                            .and_then(|cell| cell.genome_id)
                            .is_some_and(|genome_id| !self.orchestrator.genomes.contains_key(&genome_id))
                });
        if needs_repair {
            self.self_repair();
        }
    }

    /// Observe son propre état.
    pub fn self_model(&mut self) -> SelfModel {
        let integrity = self.orchestrator.membrane.integrity();
        SelfModel {
            identity: self.orchestrator.name.clone(),
            components: self.orchestrator.active_cells.len(),
            tissues: self.orchestrator.tissues.len(),
            dna_registered: self.agent_dna.len(),
            traces: self.traces.known(),
            integrity,
            atp: self.orchestrator.metabolism.available(),
            repairs: self.orchestrator.membrane.repairs,
            alive: integrity > 0.0,
        }
    }

    pub fn is_alive(&mut self) -> bool {
        self.orchestrator.membrane.is_alive()
    }

    /// Auto-réparation : régénère la membrane (coût ATP) et restaure les ADN
    /// manquants — sans intervention externe.
    pub fn self_repair(&mut self) -> SelfRepairReport {
        self.orchestrator.membrane.update();
        let integrity_before = self.orchestrator.membrane.integrity;
        let atp_before = self.orchestrator.metabolism.available();
        let mut actions = Vec::new();

        // 1. Régénération de la membrane si endommagée et si l'ATP le permet.
        if integrity_before < self.orchestrator.membrane.capacity
            && self.orchestrator.metabolism.consume(5.0)
        {
            self.orchestrator.membrane.repair(0.25);
            actions.push("membrane_reparee".to_string());
        }

        // 2. Restauration des ADN manquants pour les composants actifs.
        let missing: Vec<Uuid> = self
            .orchestrator
            .active_cells
            .keys()
            .copied()
            .filter(|id| !self.agent_dna.contains_key(id))
            .collect();
        for id in missing {
            let role = self
                .orchestrator
                .active_cells
                .get(&id)
                .map(|cell| cell.role.clone())
                .unwrap_or_else(|| "Autonomous".to_string());
            let genome = Genome::new(&role);
            let dna = crate::dna_ops::from_genome(&genome, &role);
            self.register_dna(id, dna);
            actions.push(format!("adn_restaure:{}", &id.to_string()[..8]));
        }

        let missing_genomes: Vec<(Uuid, String)> = self
            .orchestrator
            .active_cells
            .iter()
            .filter_map(|(id, cell)| {
                let genome_id = cell.genome_id?;
                (!self.orchestrator.genomes.contains_key(&genome_id))
                    .then(|| (*id, cell.role.clone()))
            })
            .collect();
        for (id, role) in missing_genomes {
            let genome = Genome::new(&role);
            let genome_id = genome.genome_id();
            self.orchestrator.genomes.insert(genome_id, genome);
            if let Some(cell) = self.orchestrator.active_cells.get_mut(&id) {
                cell.genome_id = Some(genome_id);
            }
            actions.push(format!("genome_restaure:{}", &id.to_string()[..8]));
        }

        if !actions.is_empty() {
            self.record_event("SELF_REPAIR", json!({ "actions": actions.len() }));
        }
        SelfRepairReport {
            actions,
            integrity_before,
            integrity_after: self.orchestrator.membrane.integrity,
            atp_before,
            atp_after: self.orchestrator.metabolism.available(),
        }
    }
}
