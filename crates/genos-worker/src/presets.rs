//! Fabriques de contrats par phenotype.
//!
//! Chaque fonction prend un unique `PresetInput` (<= 3 params impose)
//! et remplit differemment le meme `WorkerRuntimeContract`.

use crate::contract::{
    AuthorityProfile, CommsProfile, EvidenceSpec, MemoryProfile, ResourceBudget, WorkerIdentity,
    WorkerMission, WorkerNiche, WorkerRuntimeContract,
};
use crate::phenotype::WorkerKind;

/// Entree commune des fabriques.
#[derive(Clone, Debug)]
pub struct PresetInput {
    pub agent_id: String,
    pub parent_id: Option<String>,
    pub objective: String,
    pub scope: String,
}

impl PresetInput {
    pub fn new(agent: &str, objective: &str, scope: &str) -> Self {
        Self {
            agent_id: agent.to_string(),
            parent_id: None,
            objective: objective.to_string(),
            scope: scope.to_string(),
        }
    }

    pub fn with_parent(self, parent: &str) -> Self {
        Self {
            parent_id: Some(parent.to_string()),
            ..self
        }
    }
}

fn base_contract(kind: WorkerKind, input: &PresetInput) -> WorkerRuntimeContract {
    WorkerRuntimeContract {
        identity: WorkerIdentity {
            agent_id: input.agent_id.clone(),
            parent_id: input.parent_id.clone(),
            lineage: Vec::new(),
            phenotype: kind.name().to_string(),
        },
        mission: WorkerMission {
            objective: input.objective.clone(),
            scope: input.scope.clone(),
            success_criteria: Vec::new(),
            stop_conditions: Vec::new(),
        },
        niche: WorkerNiche {
            environment: input.scope.clone(),
            function: kind.name().to_string(),
            domain: None,
        },
        comms: CommsProfile {
            policy: "parent_only".to_string(),
            allowed_targets: Vec::new(),
            max_messages: 8,
        },
        resources: ResourceBudget {
            tokens: 8000,
            time_ms: 300_000,
            cpu_ms: 60_000,
        },
        evidence: EvidenceSpec {
            required_artifacts: vec!["dossier".to_string()],
            provenance_required: true,
        },
        ..Default::default()
    }
}

fn read_only() -> AuthorityProfile {
    AuthorityProfile {
        read: true,
        execute: false,
        ..Default::default()
    }
}

/// Contrat ScoutCell : capteur ephemere, lecture seule, sans memoire.
pub fn scout_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = base_contract(WorkerKind::ScoutCell, input);
    c.authority = read_only();
    c.memory = MemoryProfile {
        working: true,
        episodic: false,
        semantic: "none".to_string(),
        procedural: "none".to_string(),
        ancestral: false,
    };
    c.lifecycle.max_iterations = Some(1);
    c.evidence.required_artifacts = vec!["scout_observation".to_string()];
    c
}

/// Contrat BoundedWorker : executant previsible, sans spawn.
pub fn bounded_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = base_contract(WorkerKind::BoundedWorker, input);
    c.authority = AuthorityProfile {
        read: true,
        execute: true,
        ..Default::default()
    };
    c.tool_lease = vec!["assigned_tools".to_string()];
    c.lifecycle.max_iterations = Some(10);
    c
}

/// Contrat AdaptiveWorker : adaptation locale bornee.
pub fn adaptive_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = bounded_preset(input);
    c.identity.phenotype = WorkerKind::AdaptiveWorker.name().to_string();
    c.local_strategy_changes = true;
    c.allowed_strategies = vec!["controlled_probe".to_string(), "causal_bisection".to_string()];
    c.max_strategy_changes = 3;
    c.max_cognitive_changes = 2;
    c.lifecycle.max_iterations = Some(20);
    c
}

/// Contrat Specialist : niche + symbiotes proceduraux declares.
pub fn specialist_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = adaptive_preset(input);
    c.identity.phenotype = WorkerKind::Specialist.name().to_string();
    c.niche.domain = Some("declared_niche".to_string());
    c.expressed_capabilities = vec!["niche_analysis".to_string()];
    c
}

/// Contrat VerifierWorker : independant, sans ecriture, verdict ternaire.
pub fn verifier_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = base_contract(WorkerKind::VerifierWorker, input);
    c.authority = read_only();
    c.authority.execute = true;
    c.tool_lease = vec!["safe_test".to_string()];
    c.evidence.required_artifacts = vec!["verification_report".to_string()];
    c.lifecycle.max_iterations = Some(5);
    c
}

/// Contrat RedWorker : adversaire, jamais de promotion directe.
pub fn red_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = verifier_preset(input);
    c.identity.phenotype = WorkerKind::RedWorker.name().to_string();
    c.cognitive_recipe = Some("adversarial".to_string());
    c
}

/// Contrat CreativeWorker : genere des candidats, ne promeut jamais.
pub fn creative_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = base_contract(WorkerKind::CreativeWorker, input);
    c.authority = read_only();
    c.cognitive_recipe = Some("divergent".to_string());
    c.allowed_recipe_changes = true;
    c.max_cognitive_changes = 2;
    c.evidence.required_artifacts = vec!["creative_candidate".to_string()];
    c
}

/// Contrat ProceduralExecutor : zero LLM, 100% deterministe.
pub fn procedural_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = base_contract(WorkerKind::ProceduralExecutor, input);
    c.authority.execute = true;
    c.tool_lease = vec!["solver".to_string()];
    c.cognitive_recipe = Some("deterministic".to_string());
    c.resources.tokens = 0;
    c
}

/// Contrat SymbioticWorker : hote de procedures, autorite = intersection.
pub fn symbiotic_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = bounded_preset(input);
    c.identity.phenotype = WorkerKind::SymbioticWorker.name().to_string();
    c.expressed_capabilities = vec!["procedural_host".to_string()];
    c
}

/// Contrat MedicalWorker : diagnostic, jamais de terminaison auto.
pub fn medical_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = verifier_preset(input);
    c.identity.phenotype = WorkerKind::MedicalWorker.name().to_string();
    c.evidence.required_artifacts = vec!["clinical_report".to_string()];
    c.lifecycle.max_iterations = Some(8);
    c
}

/// Contrat RecoveryWorker : restaure vite, diagnostique plus tard.
pub fn recovery_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = bounded_preset(input);
    c.identity.phenotype = WorkerKind::RecoveryWorker.name().to_string();
    c.authority.execute = true;
    c.tool_lease = vec!["checkpoint_restore".to_string()];
    c.lifecycle.max_iterations = Some(3);
    c
}

/// Contrat ForensicWorker : autopsie causale post-incident.
pub fn forensic_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = verifier_preset(input);
    c.identity.phenotype = WorkerKind::ForensicWorker.name().to_string();
    c.evidence.required_artifacts = vec!["causal_dossier".to_string()];
    c
}

/// Contrat ResidentDaemon : connaissance persistante d'un territoire.
pub fn daemon_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = base_contract(WorkerKind::ResidentDaemon, input);
    c.authority = read_only();
    c.authority.execute = true;
    c.tool_lease = vec!["safe_probe".to_string(), "snapshot".to_string()];
    c.comms.policy = "signal_on_finding".to_string();
    c.lifecycle.max_iterations = None;
    c
}

/// Contrat ExperimentalWorker : hypothese -> protocole -> mesures.
pub fn experimental_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = bounded_preset(input);
    c.identity.phenotype = WorkerKind::ExperimentalWorker.name().to_string();
    c.evidence.required_artifacts = vec!["experiment_record".to_string()];
    c
}

/// Contrat FormalWorker : formalisation + solveur + certificat.
pub fn formal_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = procedural_preset(input);
    c.identity.phenotype = WorkerKind::FormalWorker.name().to_string();
    c.evidence.required_artifacts = vec!["formal_certificate".to_string()];
    c
}

/// Contrat SynthesisWorker : synthese sans ecraser les desaccords.
pub fn synthesis_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = base_contract(WorkerKind::SynthesisWorker, input);
    c.authority = read_only();
    c.evidence.required_artifacts = vec!["synthesis_dossier".to_string()];
    c
}

/// Contrat LiaisonWorker : pont compressant entre sous-graphes.
pub fn liaison_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = base_contract(WorkerKind::LiaisonWorker, input);
    c.authority = read_only();
    c.comms.policy = "bridge".to_string();
    c.comms.max_messages = 32;
    c
}

/// Contrat TeachingWorker : propage une procedure validee.
pub fn teaching_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = base_contract(WorkerKind::TeachingWorker, input);
    c.authority = read_only();
    c.evidence.required_artifacts = vec!["training_packet".to_string()];
    c
}

/// Contrat SubOrchestrator : organisation locale sous plafond d'autorite.
pub fn suborchestrator_preset(input: &PresetInput) -> WorkerRuntimeContract {
    let mut c = adaptive_preset(input);
    c.identity.phenotype = WorkerKind::SubOrchestrator.name().to_string();
    c.authority.delegate = true;
    c.authority.spawn = true;
    c.tool_lease = vec!["spawn_capped".to_string()];
    c.resources.tokens = 20_000;
    c.lifecycle.max_iterations = Some(30);
    c
}

/// Fabrique generique : meme runtime, phenotype variable.
pub fn preset_for(kind: WorkerKind, input: &PresetInput) -> WorkerRuntimeContract {
    use WorkerKind::*;
    match kind {
        ScoutCell => scout_preset(input),
        ResidentDaemon => daemon_preset(input),
        BoundedWorker => bounded_preset(input),
        AdaptiveWorker => adaptive_preset(input),
        Specialist => specialist_preset(input),
        ProceduralExecutor => procedural_preset(input),
        SymbioticWorker => symbiotic_preset(input),
        VerifierWorker => verifier_preset(input),
        RedWorker => red_preset(input),
        ExperimentalWorker => experimental_preset(input),
        FormalWorker => formal_preset(input),
        SynthesisWorker => synthesis_preset(input),
        CreativeWorker => creative_preset(input),
        MedicalWorker => medical_preset(input),
        RecoveryWorker => recovery_preset(input),
        ForensicWorker => forensic_preset(input),
        LiaisonWorker => liaison_preset(input),
        TeachingWorker => teaching_preset(input),
        SubOrchestrator => suborchestrator_preset(input),
    }
}
