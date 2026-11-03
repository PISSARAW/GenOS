//! Vérification du contrat d'un artefact LLM, jamais de la vérité générale de sa prose.
use super::{Binding, Store, digest, raw_hash};
use super::llm_contract::ContractVerdict;
use genos_api::native_inference::ModelObservation;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[path = "llm_evidence_bindings.rs"]
mod bindings;
#[path = "llm_evidence_store.rs"]
mod persistence;

pub const ASSURANCE: &str = "artifact_contract_verified";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ArtifactSubject {
    pub source_hash: String,
    pub input_hash: String,
    pub result_hash: String,
    pub context_hash: String,
    pub contract_hash: String,
    pub base_hash: String,
    pub base_generation: u64,
    pub env_hash: String,
    pub policy_hash: String,
    pub method_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ArtifactEvidenceReceipt {
    pub subject: ArtifactSubject,
    pub binding_hash: String,
    pub observation_hash: String,
    pub proof_hash: String,
    pub receipt_hash: String,
    pub assurance: String,
    pub semantic_truth_verified: bool,
}

#[derive(Clone, Debug)]
pub struct VerifiedArtifactEvidence { core: SealedEvidence }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct SealedEvidence {
    subject: ArtifactSubject,
    binding_hash: String,
    observation_hash: String,
    request_hash: String,
    transport_complete: bool,
    verifiers: [VerifierProof; 2],
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct VerifierProof {
    actor_id: String,
    context_hash: String,
    verdict: ContractVerdict,
}

impl VerifiedArtifactEvidence {
    pub fn subject(&self) -> &ArtifactSubject { &self.core.subject }
    pub fn contract_satisfied(&self) -> bool { satisfied(&self.core) }
    pub fn verdicts(&self) -> [&ContractVerdict; 2] {
        [&self.core.verifiers[0].verdict, &self.core.verifiers[1].verdict]
    }
}

pub fn method_hash() -> Result<String, String> {
    digest(&("genos.rust-llm-text-contract/v1", ["rust_str_contains/v1", "rust_byte_windows/v1"]))
}

pub fn qualify(store: &mut Store, binding: &Binding, observation: &ModelObservation) -> Result<VerifiedArtifactEvidence, String> {
    store.transaction(binding, |tx| {
        let producer = super::llm_synapse::read_in(tx, binding, super::WorkerRole::Producer)?;
        observation.assert_request(&super::llm_synapse::request(binding, &producer)?)?;
        let observed = super::llm_omega::observed_in(tx, binding, "infer")?;
        verify_observation(observation, &observed)?;
        qualified_in(tx, binding, &observed)
    })
}

pub(crate) fn qualify_observed(store: &mut Store, binding: &Binding) -> Result<VerifiedArtifactEvidence, String> {
    store.transaction(binding, |tx| {
        let observed = super::llm_omega::observed_in(tx, binding, "infer")?;
        qualified_in(tx, binding, &observed)
    })
}

fn qualified_in(connection: &Connection, binding: &Binding, observed: &super::llm_omega::ObservedArtifact) -> Result<VerifiedArtifactEvidence, String> {
    Ok(VerifiedArtifactEvidence { core:bindings::current(connection, binding, observed)? })
}

fn verify_observation(observation: &ModelObservation, observed: &super::llm_omega::ObservedArtifact) -> Result<(), String> {
    if observation.receipt_hash() != observed.observation_hash || observation.output() != observed.output
        || raw_hash(observation.output()) != observed.result_hash {
        return Err("LLM_EVIDENCE_OBSERVATION_CHANGED".into());
    }
    Ok(())
}

pub fn accept(store: &mut Store, binding: &Binding, evidence: &VerifiedArtifactEvidence) -> Result<ArtifactEvidenceReceipt, String> {
    store.transaction(binding, |tx| persistence::accept(tx, binding, &evidence.core))
}

pub fn require_in(connection: &Connection, binding: &Binding, subject: &ArtifactSubject) -> Result<ArtifactEvidenceReceipt, String> {
    super::store::current_checked(connection, binding)?;
    let receipt = persistence::require(connection, binding, subject)?;
    super::store::current_checked(connection, binding)?;
    Ok(receipt)
}

fn satisfied(core: &SealedEvidence) -> bool {
    core.transport_complete && core.verifiers.iter().all(|proof| proof.verdict.passed)
}

fn receipt(core: &SealedEvidence) -> Result<ArtifactEvidenceReceipt, String> {
    let mut receipt = ArtifactEvidenceReceipt {
        subject:core.subject.clone(),binding_hash:core.binding_hash.clone(),
        observation_hash:core.observation_hash.clone(),proof_hash:digest(core)?,receipt_hash:String::new(),
        assurance:ASSURANCE.into(),semantic_truth_verified:false,
    };
    receipt.receipt_hash = receipt_hash(&receipt)?;
    Ok(receipt)
}

fn receipt_hash(receipt: &ArtifactEvidenceReceipt) -> Result<String, String> {
    digest(&("genos.rust-llm-artifact-evidence/v1", &receipt.subject, &receipt.binding_hash,
        &receipt.observation_hash, &receipt.proof_hash, &receipt.assurance, receipt.semantic_truth_verified))
}

fn error(value: impl std::fmt::Display) -> String { value.to_string() }

#[cfg(test)]
#[path = "llm_evidence_recovery_tests.rs"]
mod recovery_tests;
