//! Façade d'accès unifié à l'écosystème GenOS.
//!
//! `GenosEcosystem` compose l'orchestrateur biomimétique avec les sous-systèmes
//! auparavant inaccessibles depuis l'orchestrateur : signalisation (stigmergie,
//! Kuramoto), stockage (événements, capsules, cryptobiose, mémoire, fossiles),
//! reproduction (mitose, méiose, croisement), phénotype/quorum, sensorimoteur,
//! thérapies et ADN compilé. Tous les crates GenOS sont en outre ré-exportés à la
//! racine du crate orchestrateur (`genos_orchestrator::genos_store`, etc.).

use crate::BiomimeticOrchestrator;
use genos_biology::pathology::{assess_agent_clinical_status, ClinicalStatusReport};
use genos_biology::phenotype::{create_default_registry, PhenotypeRegistry};
use genos_biology::quorum::{AutoinducerType, QuorumPhenotype, QuorumSensingSystem};
use genos_biology::sensory::{AccessoryOlfactoryBulb, EcholocationCortex};
use genos_biology::specialized_cells::cnidocyte::DischargeImpact;
use genos_biology::therapy::{apply_systemic_therapy_to_cell, SystemicTherapy, TherapyOutcome};
use genos_biology::{
    Choanocyte, Cnidocyte, ElectricOrganStack, ElectricShockBurst, GlialCell, GlialEnvironment,
    GlialPipeline, HgtTransferReport, Iridophore, ObserverPerspective, OssificationReport,
    ProkaryoticAgent, RawSignalPacket, SiftingResult, StomatalPore, ThrottleResult, Tracheid,
};
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
    /// Pipeline glial (astrocytes, microglie, myélinisation).
    pub glial: GlialPipeline,
    /// Cnidocyte (interception de menaces prompt / outil).
    pub cnidocyte: Cnidocyte,
    /// Cellule de garde (throttling de flux / backpressure).
    pub guard_cell: StomatalPore,
    /// Organe électrique (décharge de consensus).
    pub electric_organ: ElectricOrganStack,
    /// Procaryote donneur (transfert horizontal de plasmides).
    pub prokaryote: ProkaryoticAgent,
    /// Trachéide (ossification d'un pipeline statique).
    pub tracheid: Tracheid,
    /// Choanocyte (filtration d'un flux de signaux).
    pub choanocyte: Choanocyte,
    /// Iridophore (rendu polymorphe).
    pub iridophore: Iridophore,
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
            glial: GlialPipeline::new(),
            cnidocyte: Cnidocyte::new("orchestrator_cnidocyte"),
            guard_cell: StomatalPore::new("orchestrator_pore"),
            electric_organ: ElectricOrganStack::new("orchestrator_electric", 8, 2),
            prokaryote: ProkaryoticAgent::new("orchestrator_donor"),
            tracheid: Tracheid::new("orchestrator_tracheid"),
            choanocyte: Choanocyte::new("orchestrator_choanocyte"),
            iridophore: Iridophore::new("orchestrator_iridophore"),
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

    // --- Pathologie / diagnostic ---

    pub fn assess_health(&self, cell: &AgentCell) -> ClinicalStatusReport {
        assess_agent_clinical_status(cell)
    }

    // --- Glie ---

    pub fn process_glial(&self, agents: &mut [GlialCell], env: GlialEnvironment<'_>) {
        self.glial.process_all(agents, env);
    }

    // --- Cellules spécialisées ---

    pub fn intercept_prompt_threat(&mut self, prompt: &str) -> Option<DischargeImpact> {
        self.cnidocyte.intercept_prompt(prompt)
    }

    pub fn intercept_tool_threat(
        &mut self,
        tool_name: &str,
        raw_payload: &str,
    ) -> Option<DischargeImpact> {
        self.cnidocyte.intercept_tool_threat(tool_name, raw_payload)
    }

    pub fn throttle_flux(&self, requested_flux: f64) -> ThrottleResult {
        self.guard_cell.throttle_flux(requested_flux)
    }

    pub fn discharge_electric(&mut self) -> Result<ElectricShockBurst, String> {
        self.electric_organ.discharge_burst()
    }

    pub fn hgt_transfer(
        &self,
        recipient: &mut ProkaryoticAgent,
        plasmid_id: &str,
    ) -> Result<HgtTransferReport, String> {
        self.prokaryote.conjugate_transfer_plasmid(recipient, plasmid_id)
    }

    pub fn ossify_pipeline(&mut self, pipeline_id: &str) -> Result<OssificationReport, String> {
        self.tracheid.trigger_lignified_apoptosis(pipeline_id)
    }

    pub fn filter_stream(&mut self, packets: &[RawSignalPacket]) -> SiftingResult {
        self.choanocyte.sift_stream(packets)
    }

    pub fn render_polymorphic(&self, raw_data: &str, perspective: &ObserverPerspective) -> String {
        self.iridophore.render_polymorphic(raw_data, perspective)
    }
}
