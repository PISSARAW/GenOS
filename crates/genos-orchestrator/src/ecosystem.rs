//! Façade d'accès unifié à l'écosystème GenOS.
//!
//! `GenosEcosystem` compose l'orchestrateur biomimétique avec les sous-systèmes
//! auparavant inaccessibles depuis l'orchestrateur : signalisation (stigmergie,
//! Kuramoto), stockage (événements, capsules, cryptobiose, mémoire, fossiles),
//! reproduction (mitose, méiose, croisement), phénotype/quorum, sensorimoteur,
//! thérapies et ADN compilé. Tous les crates GenOS sont en outre ré-exportés à la
//! racine du crate orchestrateur (`genos_orchestrator::genos_store`, etc.).

use crate::BiomimeticOrchestrator;
use genos_biology::phenotype::{create_default_registry, PhenotypeRegistry};
use genos_biology::quorum::{AutoinducerType, QuorumPhenotype, QuorumSensingSystem};
use genos_biology::sensory::{AccessoryOlfactoryBulb, EcholocationCortex};
use genos_biology::therapy::{apply_systemic_therapy_to_cell, SystemicTherapy, TherapyOutcome};
use genos_cell::AgentCell;
use genos_common::traits::{MemoryEntry, MemoryRepository, SearchQuery};
use genos_dna::model::AgentDna;
use genos_genome::Genome;
use genos_reproduction::{CellDivision, MeioticCrossover};
use genos_signal::{ExtracellularMatrix, KuramotoOscillator, StigmergyField};
use genos_store::{
    Capsule, CapsuleStore, CryptobiosisStore, FossilRegistry, InMemoryEventStore,
    InMemoryVectorRepository,
};
use serde_json::Value;
use uuid::Uuid;

/// Point d'entrée unique donnant accès à toutes les capacités GenOS.
pub struct GenosEcosystem {
    /// L'orchestrateur biomimétique (tissus, cellules, conscience, immunité).
    pub orchestrator: BiomimeticOrchestrator,
    /// Signalisation stigmergique (pistes / répulsifs).
    pub stigmergy: StigmergyField,
    /// Matrice extracellulaire (signaux paracrines, territoires).
    pub matrix: ExtracellularMatrix,
    /// Oscillateurs de Kuramoto (consensus de phase).
    pub oscillators: Vec<KuramotoOscillator>,
    /// Journal d'événements append-only.
    pub events: InMemoryEventStore,
    /// Coffre de capsules intègres (frontières / sandbox).
    pub capsules: CapsuleStore,
    /// Stockage de cryptobiose (agents gelés / spores vitrifiées).
    pub cryptobiosis: CryptobiosisStore,
    /// Mémoire vectorielle (recherche sémantique).
    pub memory: InMemoryVectorRepository,
    /// Registre de fossiles (lignées éteintes).
    pub fossils: FossilRegistry,
    /// Quorum sensing (phénotypes collectifs).
    pub quorum: QuorumSensingSystem,
    /// Registre de régulation phénotypique / épigénétique.
    pub phenotype: PhenotypeRegistry,
    /// Bulbe olfactif accessoire (phéromones / réponse de Flehmen).
    pub olfaction: AccessoryOlfactoryBulb,
    /// Cortex d'écholocation (cartographie spatiale par échos).
    pub echolocation: EcholocationCortex,
}

impl GenosEcosystem {
    /// Construit un écosystème complet autour d'un nouvel orchestrateur.
    pub fn new(name: &str) -> Self {
        Self {
            orchestrator: BiomimeticOrchestrator::new(name, 50.0, 100.0),
            stigmergy: StigmergyField::new(0.1),
            matrix: ExtracellularMatrix::new(),
            oscillators: Vec::new(),
            events: InMemoryEventStore::new(),
            capsules: CapsuleStore::new(),
            cryptobiosis: CryptobiosisStore::new(),
            memory: InMemoryVectorRepository::new(),
            fossils: FossilRegistry::new(),
            quorum: QuorumSensingSystem::new(
                AutoinducerType::AHL,
                0.5,
                vec![
                    QuorumPhenotype::Bioluminescence,
                    QuorumPhenotype::MetabolicCooperation,
                ],
            ),
            phenotype: create_default_registry(),
            olfaction: AccessoryOlfactoryBulb::new(0.5),
            echolocation: EcholocationCortex::new(80.0, 10.0, 343.0, 5.0),
        }
    }

    // --- Signalisation ---

    pub fn deposit_trail(&mut self, marker: &str, amount: f64) {
        self.stigmergy.deposit(marker, amount);
    }

    pub fn read_trail(&self, marker: &str) -> f64 {
        self.stigmergy.read(marker)
    }

    pub fn add_oscillator(&mut self, id: &str, phase: f64, natural_frequency: f64) {
        self.oscillators
            .push(KuramotoOscillator::new(id, phase, natural_frequency));
    }

    pub fn couple_oscillators(&mut self, coupling: f64, dt: f64) {
        let snapshot = self.oscillators.clone();
        for osc in self.oscillators.iter_mut() {
            osc.step(&snapshot, coupling, dt);
        }
    }

    pub fn quorum_step(&mut self, dt: f64) {
        self.quorum.step(dt);
    }

    // --- Stockage ---

    pub fn record_event(&mut self, event_type: &str, payload: Value) -> Uuid {
        self.events.append(event_type, payload).id
    }

    pub fn seal_capsule(&mut self, boundary_id: &str, data: Value) -> Uuid {
        self.capsules.store(Capsule::create(boundary_id, data))
    }

    pub fn freeze_agent(&mut self, agent_id: &str, snapshot: Value) {
        let _ = self.cryptobiosis.freeze(agent_id, snapshot);
    }

    pub fn fossilize(&mut self, lineage_id: &str, reason: &str) {
        let _ = self.fossils.fossilize(lineage_id, reason);
    }

    pub fn remember(&self, entry: MemoryEntry) -> Result<(), String> {
        self.memory.store_memory(entry)
    }

    pub fn recall(&self, query: SearchQuery) -> Result<Vec<MemoryEntry>, String> {
        self.memory.search(query)
    }

    // --- Reproduction ---

    pub fn mitosis(&self, genome: &Genome) -> Result<Vec<Genome>, String> {
        let (a, b) = CellDivision::mitosis(genome)?;
        Ok(vec![a, b])
    }

    pub fn meiosis(&self, genome: &Genome, crossover: Option<usize>) -> Result<Vec<Genome>, String> {
        CellDivision::meiosis(genome, crossover)
    }

    pub fn crossover(&self, a: &Genome, b: &Genome, point: usize) -> (Genome, Genome) {
        MeioticCrossover::single_point_crossover(a, b, point)
    }

    // --- Biologie appliquée ---

    pub fn apply_therapy(&self, cell: &mut AgentCell, therapy: &SystemicTherapy) -> TherapyOutcome {
        apply_systemic_therapy_to_cell(therapy, cell)
    }

    // --- ADN compilé ---

    pub fn encode_dna(&self, dna: &AgentDna) -> Result<Vec<u8>, String> {
        genos_dna::codec::encode(dna)
    }

    pub fn express_dna(&self, dna: &AgentDna) -> genos_dna::Phenotype {
        genos_dna::express::express(dna)
    }
}
