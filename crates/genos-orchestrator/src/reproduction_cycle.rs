//! Cycle de reproduction cellulaire autonome : à chaque tick, **sans
//! opérateur**, une cellule mère viable se divise réellement par mitose
//! (`genos_reproduction::CellDivision`). La fille n'est intégrée à
//! l'organisme qu'après avoir réellement survécu à l'immersion dans le
//! milieu biophysique courant — ATP disponible, membrane intacte,
//! `Genome::validate()` — au lieu d'une viabilité simplement supposée.
//! La lignée (parent_ids/generation/lineage_id, portée par `Genome`)
//! continue ainsi de génération en génération sans qu'aucune commande
//! externe ne soit émise à chaque naissance.

use crate::GenosEcosystem;
use genos_cell::AgentCell;
use genos_genome::Genome;
use genos_reproduction::CellDivision;
use rand::SeedableRng;
use rand::rngs::StdRng;
use serde::Serialize;
use serde_json::json;
use uuid::Uuid;

/// Coût ATP réel d'une division cellulaire (cohérent avec le coût `REPLICATE`
/// documenté : `docs/01-concepts/nosologie/01-auto-immunes.md`).
pub const REPRODUCTION_ATP_COST: f64 = 20.0;
/// Intégrité de membrane minimale pour tenter une division : sous ce seuil,
/// l'organisme est trop endommagé pour engager une reproduction.
pub const MIN_MEMBRANE_INTEGRITY_TO_REPRODUCE: f64 = 0.5;
/// Taux de mutation stochastique appliqué à chaque division autonome.
pub const AUTONOMOUS_MUTATION_RATE: f64 = 0.01;

/// Bilan d'une division cellulaire autonome réussie.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ReproductionOutcome {
    pub mother_id: Uuid,
    pub daughter_id: Uuid,
    pub generation: u32,
    pub lineage_id: Uuid,
}

/// Pourquoi la reproduction n'a pas abouti ce tick. `NoEligibleMother` est
/// l'état normal la plupart du temps (pas une erreur) ; les autres variantes
/// signalent un échec réel d'immersion biophysique.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub enum ReproductionBlocked {
    NoEligibleMother,
    InsufficientAtp,
    MembraneTooWeak,
    HayflickLimitReached(String),
    InvalidDaughterGenome(String),
}

impl GenosEcosystem {
    /// Tente une division autonome sauf si l'organisme est déjà mort
    /// (membrane rompue) : appelé par `tick` à chaque cycle, sans opérateur.
    /// Retourne `Ok(outcome)` si division réussie, `Err(ReproductionBlocked)` si bloquée,
    /// `None` si organisme mort.
    pub(crate) fn attempt_autonomous_reproduction_if_alive(
        &mut self,
    ) -> Option<Result<ReproductionOutcome, ReproductionBlocked>> {
        if !self.orchestrator.membrane.is_alive() {
            return None;
        }
        match self.autonomous_reproduction_cycle() {
            Ok(outcome) => Some(Ok(outcome)),
            Err(reason) => {
                self.record_event("REPRODUCTION_BLOCKED", json!({ "reason": reason }));
                Some(Err(reason))
            }
        }
    }

    /// Cellule active dont le génome enregistré peut encore se répliquer
    /// (limite de Hayflick non atteinte) : candidate mère de ce tick.
    fn find_eligible_mother(&self) -> Option<(Uuid, Genome)> {
        self.orchestrator
            .active_cells
            .iter()
            .filter_map(|(cell_id, cell)| {
                let genome_id = cell.genome_id?;
                let genome = self.orchestrator.genomes.get(&genome_id)?;
                genome.can_replicate().then(|| (*cell_id, genome.clone()))
            })
            .max_by_key(|(_, genome)| (genome.generation, genome.genome_id()))
    }

    fn seeded_rng_for(daughter_id: Uuid) -> StdRng {
        let mut seed = [0u8; 32];
        seed[..16].copy_from_slice(daughter_id.as_bytes());
        StdRng::from_seed(seed)
    }

    /// Intègre la fille née de `mother_id` dans le même tissu que sa mère
    /// (ou directement comme cellule active si la mère n'appartient à aucun
    /// tissu), et enregistre son génome pour que la lignée persiste.
    struct IntegrateDaughterInput {
        mother_id: Uuid,
        mother: AgentCell,
        daughter: AgentCell,
        genome: Genome,
    }

    fn integrate_daughter(&mut self, input: IntegrateDaughterInput) -> Uuid {
        let IntegrateDaughterInput { mother_id, mother, daughter, genome } = input;
        let daughter_id = daughter.cell_id;
        self.orchestrator.active_cells.insert(mother_id, mother);
        self.orchestrator.genomes.insert(genome.genome_id(), genome);
        match self.orchestrator.owning_tissue(mother_id) {
            Some(tissue_name) => {
                let _ = self.orchestrator.add_worker(&tissue_name, daughter);
            }
            None => {
                self.orchestrator.active_cells.insert(daughter_id, daughter);
            }
        }
        daughter_id
    }

    /// Tente une division cellulaire autonome ce tick, sans opérateur. Une
    /// mère éligible qui échoue réellement à l'immersion biophysique (ATP,
    /// membrane, génome fille invalide) n'engendre aucune fille : la
    /// viabilité est vérifiée, jamais supposée.
    pub fn autonomous_reproduction_cycle(
        &mut self,
    ) -> Result<ReproductionOutcome, ReproductionBlocked> {
        let (mother_id, mother_genome) = self
            .find_eligible_mother()
            .ok_or(ReproductionBlocked::NoEligibleMother)?;

        if self.orchestrator.membrane.total_integrity() < MIN_MEMBRANE_INTEGRITY_TO_REPRODUCE {
            return Err(ReproductionBlocked::MembraneTooWeak);
        }
        if !self.orchestrator.metabolism.consume(REPRODUCTION_ATP_COST) {
            return Err(ReproductionBlocked::InsufficientAtp);
        }

        let division = CellDivision::mitosis_attested(&mother_genome)
            .map_err(ReproductionBlocked::HayflickLimitReached)?;
        let mut daughter_genome = division.clone;
        let mut rng = Self::seeded_rng_for(daughter_genome.genome_id());
        daughter_genome.mutate_stochastic(AUTONOMOUS_MUTATION_RATE, &mut rng);
        // Immersion biophysique : la fille n'existe que si son génome est
        // structurellement valide dans le milieu courant.
        daughter_genome
            .validate()
            .map_err(ReproductionBlocked::InvalidDaughterGenome)?;

        let mother_cell = self
            .orchestrator
            .active_cells
            .get(&mother_id)
            .cloned()
            .ok_or(ReproductionBlocked::NoEligibleMother)?;
        let (mut parent_cell, mut daughter_cell) = mother_cell
            .mitosis()
            .map_err(ReproductionBlocked::HayflickLimitReached)?;

        self.orchestrator
            .genomes
            .insert(division.parent.genome_id(), division.parent);

        parent_cell.genome_id = Some(mother_genome.genome_id());
        daughter_cell.name = format!("Fille_G{}", daughter_genome.generation);
        daughter_cell.name_meaning = "Division cellulaire autonome".to_string();
        daughter_cell.genome_id = Some(daughter_genome.genome_id());

        let generation = daughter_genome.generation;
        let lineage_id = daughter_genome.lineage_id();
        let daughter_id = self.integrate_daughter(IntegrateDaughterInput {
            mother_id,
            mother: parent_cell,
            daughter: daughter_cell,
            genome: daughter_genome,
        });

        self.record_event(
            "AUTONOMOUS_REPRODUCTION",
            json!({ "mother": mother_id.to_string(), "daughter": daughter_id.to_string(), "generation": generation }),
        );

        Ok(ReproductionOutcome {
            mother_id,
            daughter_id,
            generation,
            lineage_id,
        })
    }

    /// Fait entrer une cellule déjà active dans la lignée reproductive
    /// autonome : lui attribue un génome valide et l'enregistre. Point
    /// d'entrée unique requis pour amorcer une lignée ; toutes les
    /// générations suivantes se poursuivent ensuite sans opérateur via
    /// `autonomous_reproduction_cycle` (appelé automatiquement à chaque
    /// `tick`).
    pub fn seed_germline(&mut self, cell_id: Uuid, base_instruction: &str) -> Result<Uuid, String> {
        if !self.orchestrator.active_cells.contains_key(&cell_id) {
            return Err(format!("Cellule {cell_id} introuvable"));
        }
        let genome = Genome::new(base_instruction);
        genome.validate()?;
        let genome_id = genome.genome_id();
        self.orchestrator.genomes.insert(genome_id, genome);
        if let Some(cell) = self.orchestrator.active_cells.get_mut(&cell_id) {
            cell.genome_id = Some(genome_id);
        }
        Ok(genome_id)
    }
}
