//! Deux méthodes natives vérifient le contrat textuel exact, sans vérité sémantique implicite.
#[path="agentic_evidence_store.rs"] mod data;
#[path="agentic_evidence_closure.rs"] mod closure;
use super::{Binding,Event,Store,digest,raw_hash};
use super::llm_contract::{ContractVerdict,VerificationMethod};
use rusqlite::{Connection,Transaction};
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct ArtifactSubject {
    pub source_hash:String,pub result_hash:String,pub closure_hash:String,pub contract_hash:String,
    pub base_hash:String,pub base_generation:u64,pub env_hash:String,pub policy_hash:String,pub method_hash:String,
}
#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
struct Methods { binding_hash:String,contract_hash:String,actors:[String;2],methods:[String;2],policy_hash:String,env_hash:String }
#[derive(Clone,Debug,PartialEq,Eq)]
pub struct Evidence { subject:ArtifactSubject,text:String,closure:Value,methods:Methods,verdicts:[ContractVerdict;2] }
#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct EvidenceReceipt {
    pub subject:ArtifactSubject,pub binding_hash:String,pub proof_hash:String,pub receipt_hash:String,
    pub assurance:String,pub semantic_truth_verified:bool,
}
impl Evidence {
    pub fn subject(&self)->&ArtifactSubject { &self.subject }
    pub fn text(&self)->&str { &self.text }
    pub fn contract_satisfied(&self)->bool { self.verdicts.iter().all(|verdict|verdict.passed) }
    pub fn verdicts(&self)->[&ContractVerdict;2] { [&self.verdicts[0],&self.verdicts[1]] }
    pub(crate) fn closure_bytes(&self)->Result<Vec<u8>,String> { serde_json::to_vec(&self.closure).map_err(|error|error.to_string()) }
}

fn methods(binding:&Binding,contract_hash:String)->Result<Methods,String> {
    Ok(Methods { binding_hash:digest(binding)?,contract_hash,actors:[format!("{}::contract::direct",binding.run_id),format!("{}::contract::byte-scan",binding.run_id)],
        methods:[VerificationMethod::Direct.method_id().into(),VerificationMethod::ByteScan.method_id().into()],
        policy_hash:binding.policy_hash.clone(),env_hash:binding.env_hash.clone() })
}

pub(crate) fn install_in(tx:&Transaction<'_>,binding:&Binding)->Result<(),String> {
    data::ensure(tx)?;
    super::agentic_tools::ensure_in(tx)?;
    let spec=super::agentic_admission::admitted_in(tx,binding)?;
    let expected=methods(binding,digest(&spec.config.contract)?)?;
    if let Some(previous)=data::methods(tx,binding)? {
        if previous!=expected { return Err("AGENTIC_VERIFIERS_CHANGED".into()); }
        return Ok(());
    }
    data::install(tx,binding,&expected)?;
    Store::event(tx,binding,Event { protocol:"MORPH",phase:"AGENTIC_CONTRACT_METHODS_INSTALLED",payload:json!(expected) })
}

pub fn qualify(store:&mut Store,binding:&Binding)->Result<Evidence,String> {
    store.transaction(binding,|tx|qualify_in(tx,binding))
}

pub(crate) fn qualify_in(connection:&Connection,binding:&Binding)->Result<Evidence,String> {
    super::store::current_checked(connection,binding)?;
    let spec=super::agentic_admission::admitted_in(connection,binding)?;
    let methods=require_methods(connection,binding,digest(&spec.config.contract)?)?;
    let (closure,text)=closure::collect(connection,binding)?;
    let base=super::agentic_exchange::base_in(connection,binding)?;
    let subject=subject(binding,(&spec,&methods),(&closure,&text,base))?;
    let verdicts=super::llm_contract::verify(&text,&spec.config.contract)?;
    Ok(Evidence { subject,text,closure,methods,verdicts })
}

fn require_methods(connection:&Connection,binding:&Binding,contract_hash:String)->Result<Methods,String> {
    let expected=methods(binding,contract_hash)?;
    let installed=data::methods(connection,binding)?.ok_or("AGENTIC_VERIFIERS_NOT_INSTALLED")?;
    if installed!=expected { return Err("AGENTIC_VERIFIER_METHOD_OR_AUTHORITY_CHANGED".into()); }
    Ok(installed)
}

fn subject(binding:&Binding,config:(&super::agentic_spec::AgenticSpec,&Methods),artifact:(&Value,&str,super::gqwf::Head))->Result<ArtifactSubject,String> {
    let bytes=serde_json::to_vec(artifact.0).map_err(|error|error.to_string())?;
    Ok(ArtifactSubject { source_hash:config.0.source_hash.clone(),result_hash:raw_hash(artifact.1.as_bytes()),closure_hash:raw_hash(&bytes),
        contract_hash:config.1.contract_hash.clone(),base_hash:artifact.2.root_hash,base_generation:artifact.2.generation,
        env_hash:binding.env_hash.clone(),policy_hash:binding.policy_hash.clone(),method_hash:digest(config.1)? })
}

fn receipt(binding:&Binding,evidence:&Evidence)->Result<EvidenceReceipt,String> {
    if !evidence.contract_satisfied() { return Err("AGENTIC_FINAL_CONTRACT_UNRESOLVED".into()); }
    let proof_hash=digest(&(&evidence.subject,&evidence.methods,&evidence.verdicts))?;
    let mut receipt=EvidenceReceipt { subject:evidence.subject.clone(),binding_hash:digest(binding)?,proof_hash,receipt_hash:String::new(),
        assurance:"artifact_contract_verified".into(),semantic_truth_verified:false };
    receipt.receipt_hash=digest(&("genos.agentic.evidence/v1",&receipt))?;
    Ok(receipt)
}

pub fn accept(store:&mut Store,binding:&Binding,evidence:&Evidence)->Result<EvidenceReceipt,String> {
    store.transaction(binding,|tx|accept_in(tx,binding,evidence))
}

pub(crate) fn accept_in(tx:&Transaction<'_>,binding:&Binding,evidence:&Evidence)->Result<EvidenceReceipt,String> {
    let current=qualify_in(tx,binding)?;
    if current!=*evidence { return Err("AGENTIC_EVIDENCE_SUBJECT_CHANGED".into()); }
    let expected=receipt(binding,&current)?;
    if let Some(previous)=data::evidence(tx,binding)? {
        if previous!=expected { return Err("AGENTIC_EVIDENCE_RECEIPT_CONFLICT".into()); }
        return Ok(previous);
    }
    data::save(tx,binding,&expected)?;
    Store::event(tx,binding,Event { protocol:"EVIDENCE",phase:"AGENTIC_CONTRACT_VERIFIED",payload:json!(expected) })?;
    Ok(expected)
}

pub fn require_in(connection:&Connection,binding:&Binding,subject:&ArtifactSubject)->Result<EvidenceReceipt,String> {
    let current=qualify_in(connection,binding)?;
    if current.subject()!=subject { return Err("AGENTIC_EVIDENCE_SUBJECT_MISMATCH".into()); }
    let expected=receipt(binding,&current)?;
    let actual=data::evidence(connection,binding)?.ok_or("AGENTIC_ACCEPTED_EVIDENCE_REQUIRED")?;
    if actual!=expected { return Err("AGENTIC_EVIDENCE_PROOF_CHANGED".into()); }
    Ok(actual)
}
