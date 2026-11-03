use super::{ArtifactSubject, Binding, SealedEvidence, VerifierProof, digest, error, method_hash, raw_hash};
use super::super::{WorkerRole, llm_contract, llm_spec, llm_synapse};
use super::super::llm_contract::{TextContract, VerificationMethod};
use super::super::llm_omega::ObservedArtifact;
use genos_api::native_inference::{Finish, provider_config_hash, request_hash};
use rusqlite::Connection;
use serde_json::Value;

pub(super) fn current(connection: &Connection, binding: &Binding, observed: &ObservedArtifact) -> Result<SealedEvidence, String> {
    let (producer, contract) = producer_context(connection, binding)?;
    verify_transport(binding, (&producer, observed))?;
    let text = std::str::from_utf8(&observed.output).map_err(error)?;
    let subject = subject(binding, (&producer, observed))?;
    let input = VerificationInput { producer:&producer,contract:&contract,text };
    let a = verify_context(connection, binding, (&input, WorkerRole::VerifierA))?;
    let b = verify_context(connection, binding, (&input, WorkerRole::VerifierB))?;
    Ok(SealedEvidence { subject,binding_hash:digest(binding)?,observation_hash:observed.observation_hash.clone(),
        request_hash:observed.request_hash.clone(),transport_complete:observed.finish == Finish::Complete,verifiers:[a,b] })
}

fn producer_context(connection: &Connection, binding: &Binding) -> Result<(llm_synapse::AppliedContext, TextContract), String> {
    let spec = llm_spec::admitted_in(connection, binding)?;
    spec.contract.validate()?;
    let producer = llm_synapse::read_in(connection, binding, WorkerRole::Producer)?;
    let method = super::super::llm_roles::require_in(connection, binding, WorkerRole::Producer)?;
    if method.actor_id != producer.audience || method.method_id != "native_http_inference/v1" {
        return Err("LLM_EVIDENCE_PRODUCER_METHOD_MISMATCH".into());
    }
    verify_intent(binding, (&spec, &producer))?;
    Ok((producer, spec.contract))
}

fn verify_intent(binding: &Binding, input: (&llm_spec::LlmRunSpec, &llm_synapse::AppliedContext)) -> Result<(), String> {
    let (spec, context) = input;
    let supplied: llm_synapse::RequestIntent = serde_json::from_value(context.payload.clone()).map_err(error)?;
    let expected = llm_synapse::RequestIntent { operation_id:"infer".into(),provider:spec.provider.clone(),
        generation:spec.generation.clone(),messages:spec.messages.clone(),max_input_tokens:spec.max_input_tokens,
        expires_ms:supplied.expires_ms };
    if context.payload != serde_json::to_value(&expected).map_err(error)?
        || context.source_hash != spec.source_hash || context.contract_hash != digest(&spec.contract)? {
        return Err("LLM_EVIDENCE_ADMITTED_CONTEXT_MISMATCH".into());
    }
    Ok(())
}

fn verify_transport(binding: &Binding, input: (&llm_synapse::AppliedContext, &ObservedArtifact)) -> Result<(), String> {
    let (producer, observed) = input;
    let request = llm_synapse::request(binding, producer)?;
    let expected = ("infer", digest(binding)?, &producer.context_hash, &producer.input_hash, &producer.audience,
        request_hash(&request)?, provider_config_hash(&request.provider)?);
    let actual = (observed.operation_id.as_str(), observed.binding_hash.clone(), &observed.context_hash,
        &observed.input_hash, &observed.actor_id, observed.request_hash.clone(), observed.provider_config_hash.clone());
    if actual != expected || raw_hash(&observed.output) != observed.result_hash {
        return Err("LLM_EVIDENCE_REQUEST_OR_OUTPUT_MISMATCH".into());
    }
    Ok(())
}

fn subject(binding: &Binding, input: (&llm_synapse::AppliedContext, &ObservedArtifact)) -> Result<ArtifactSubject, String> {
    let (producer, observed) = input;
    Ok(ArtifactSubject { source_hash:producer.source_hash.clone(),input_hash:producer.input_hash.clone(),
        result_hash:observed.result_hash.clone(),context_hash:producer.context_hash.clone(),
        contract_hash:producer.contract_hash.clone(),base_hash:producer.world_hash.clone(),
        base_generation:producer.world_generation,env_hash:binding.env_hash.clone(),
        policy_hash:binding.policy_hash.clone(),method_hash:method_hash()? })
}

struct VerificationInput<'a> {
    producer: &'a llm_synapse::AppliedContext,
    contract: &'a TextContract,
    text: &'a str,
}

fn verify_context(connection: &Connection, binding: &Binding, input: (&VerificationInput<'_>, WorkerRole)) -> Result<VerifierProof, String> {
    let (input, role) = input;
    let context = llm_synapse::read_in(connection, binding, role)?;
    let installed = super::super::llm_roles::require_in(connection, binding, role)?;
    let method = if role == WorkerRole::VerifierA { VerificationMethod::Direct } else { VerificationMethod::ByteScan };
    if context.audience != installed.actor_id || installed.method_id != method.method_id() {
        return Err("LLM_EVIDENCE_VERIFIER_METHOD_OR_ACTOR_MISMATCH".into());
    }
    verify_payload(&context, input)?;
    let text = context.payload.get("candidate").and_then(Value::as_str).ok_or("LLM_EVIDENCE_CANDIDATE_MISSING")?;
    let contract: TextContract = serde_json::from_value(context.payload["contract"].clone()).map_err(error)?;
    let verdict = llm_contract::verify_method(text, &contract, method)?;
    Ok(VerifierProof { actor_id:context.audience,context_hash:context.context_hash,verdict })
}

fn verify_payload(context: &llm_synapse::AppliedContext, input: &VerificationInput<'_>) -> Result<(), String> {
    let intent: llm_synapse::RequestIntent = serde_json::from_value(input.producer.payload.clone()).map_err(error)?;
    let expected = llm_synapse::verifier_payload(&intent, input.text, input.contract);
    let actual = (&context.source_hash, &context.contract_hash, &context.world_hash, context.world_generation);
    let required = (&input.producer.source_hash, &input.producer.contract_hash,
        &input.producer.world_hash, input.producer.world_generation);
    if context.payload != expected || actual != required { return Err("LLM_EVIDENCE_VERIFIER_CONTEXT_MISMATCH".into()); }
    Ok(())
}
