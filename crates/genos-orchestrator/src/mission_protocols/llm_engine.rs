//! Missions textuelles réellement générées, sous contrat explicite et sans pont Node.
use super::{Binding, Event, Store, WorkerRole, digest, now_ms, process, raw_hash};
use super::{gqwf::Head, llm_allostasis, llm_contract, llm_evidence, llm_gqwf, llm_omega};
use super::{llm_roles, llm_source, llm_spec::LlmRunSpec, llm_synapse};
use genos_api::native_inference::{Credential, ModelObservation, ProviderConfig};
use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use serde_json::json;
use std::path::PathBuf;

pub struct NativeLlmRequest { pub spec:LlmRunSpec, pub executable:PathBuf, pub database:PathBuf }

#[derive(Serialize)]
pub struct Artifact { pub text:String, pub hash:String, pub origin:&'static str }

#[derive(Serialize)]
pub struct NativeLlmReport {
    pub schema:&'static str,
    pub status:&'static str,
    pub completion_scope:&'static str,
    pub binding:Binding,
    pub provider:ProviderConfig,
    pub artifact:Artifact,
    pub publication:Option<llm_gqwf::Publication>,
    pub usage:llm_allostasis::State,
    pub contract_verdicts:Vec<llm_contract::ContractVerdict>,
    pub artifact_contract_verified:bool,
    pub semantic_truth_verified:bool,
    pub promotable:bool,
    pub external_effects_authorized:bool,
    pub replayed:bool,
    pub protocols:Vec<String>,
}

struct Session { store:Store, binding:Binding, spec:LlmRunSpec, source:llm_source::SourceBundle, fresh:bool }
struct Prepared { base:Head, intent:llm_synapse::RequestIntent, max_wall_ms:u64 }
struct ReportInput {
    text:String, publication:Option<llm_gqwf::Publication>, verdicts:Vec<llm_contract::ContractVerdict>, replayed:bool,
}
struct Completion { text:String, evidence:llm_evidence::VerifiedArtifactEvidence, replayed:bool }

pub fn run(request:NativeLlmRequest) -> Result<NativeLlmReport,String> {
    let mut session=Session::open(request)?;
    let outcome=if session.fresh { session.execute() } else { session.replay() };
    if let Err(error)=&outcome { session.record_stop(error)?; }
    outcome
}

impl Session {
    fn open(request:NativeLlmRequest) -> Result<Self,String> {
        request.spec.validate()?;
        if process::executable_hash(&request.executable)? != request.spec.env_hash {
            return Err("LLM_INSTALLED_EXECUTABLE_CHANGED".into());
        }
        let source=validated_source(&request.spec)?;
        let mut store=Store::open(&request.database)?;
        let previous=existing(&store,&request.spec.mission_id)?;
        let fresh=previous.is_none();
        let binding=match previous { Some(binding)=>binding, None=>store.admit_llm(&request.spec)? };
        validate_resume(&store,(&request.spec,&binding))?;
        Ok(Self { store,binding,spec:request.spec,source,fresh })
    }

    fn execute(&mut self) -> Result<NativeLlmReport,String> {
        let prepared=self.prepare()?;
        let observation=self.infer(&prepared)?;
        self.review_contexts(&prepared,observation.text())?;
        let evidence=llm_evidence::qualify(&mut self.store,&self.binding,&observation)?;
        self.complete(&prepared,Completion { text:observation.text().into(),evidence,replayed:false })
    }

    fn complete(&mut self, prepared:&Prepared, input:Completion) -> Result<NativeLlmReport,String> {
        let verdicts=input.evidence.verdicts().into_iter().cloned().collect();
        if !input.evidence.contract_satisfied() || !self.resources_ready()? {
            return self.unverified(ReportInput { text:input.text,publication:None,verdicts,replayed:input.replayed });
        }
        llm_evidence::accept(&mut self.store,&self.binding,&input.evidence)?;
        let publication=self.publish(prepared,&input.evidence)?;
        llm_allostasis::release(&mut self.store,&self.binding)?;
        self.report(ReportInput { text:input.text,publication:Some(publication),verdicts,replayed:input.replayed })
    }

    fn resources_ready(&mut self) -> Result<bool,String> {
        let state=llm_allostasis::state(&mut self.store,&self.binding)?;
        Ok(!state.overrun && !state.accounting_overflow && state.unknown_operations==0
            && state.held==llm_allostasis::Amounts::default())
    }

    fn prepare(&mut self) -> Result<Prepared,String> {
        let base=llm_gqwf::initialize(&mut self.store,&self.binding)?;
        llm_roles::install(&mut self.store,&self.binding)?;
        let state=llm_allostasis::reserve(&mut self.store,&self.binding,&self.spec.limits)?;
        let max_wall_ms=state.limits.wall_ms.saturating_sub(state.protected.wall_ms);
        self.source.unchanged(&self.spec.workspace)?;
        llm_omega::record_source(&mut self.store,&self.binding,&self.source.bytes)?;
        let intent=self.intent(max_wall_ms)?;
        let payload=serde_json::to_value(&intent).map_err(error)?;
        self.context(&base,(WorkerRole::Producer,payload))?;
        self.checkpoint(&base)?;
        Ok(Prepared { base,intent,max_wall_ms })
    }

    fn intent(&self, max_wall_ms:u64) -> Result<llm_synapse::RequestIntent,String> {
        let expiry=now_ms().checked_add(max_wall_ms).ok_or("LLM_REQUEST_DEADLINE_OVERFLOW")?.min(self.binding.expires_ms);
        Ok(llm_synapse::RequestIntent { operation_id:"infer".into(),provider:self.spec.provider.clone(),
            generation:self.spec.generation.clone(),messages:self.spec.messages.clone(),
            max_input_tokens:self.spec.max_input_tokens,expires_ms:expiry })
    }

    fn checkpoint(&mut self, base:&Head) -> Result<(),String> {
        self.store.checkpoint(&self.binding,&json!({"schema":"genos.rust-llm-checkpoint/v1",
            "phase":"ready_to_infer","source_hash":self.source.source_hash,"base":base,
            "provider_state_recoverable":false,"automatic_unknown_redispatch":false}))?;
        Ok(())
    }

    fn context(&mut self, base:&Head, input:(WorkerRole,serde_json::Value)) -> Result<(),String> {
        llm_synapse::apply(&mut self.store,&self.binding,&llm_synapse::ContextInput {
            payload:input.1,source_hash:self.spec.source_hash.clone(),contract_hash:digest(&self.spec.contract)?,
            world_hash:base.root_hash.clone(),world_generation:base.generation,role:input.0,base_generation:0 })?;
        Ok(())
    }

    fn infer(&mut self, prepared:&Prepared) -> Result<ModelObservation,String> {
        self.source.unchanged(&self.spec.workspace)?;
        let applied=llm_synapse::read(&self.store,&self.binding,WorkerRole::Producer)?;
        let mut request=llm_synapse::request(&self.binding,&applied)?;
        request.credential=credential(&request.provider)?;
        let admission=llm_omega::begin(&mut self.store,&self.binding,llm_omega::InferenceIntent {
            request:&request,max_wall_ms:prepared.max_wall_ms })?;
        let llm_omega::DispatchAdmission::Fresh(permit)=admission else {
            return Err("LLM_INFERENCE_OUTCOME_ALREADY_OBSERVED_OR_UNKNOWN".into());
        };
        let result=llm_omega::dispatch(&mut self.store,&self.binding,llm_omega::Dispatch { permit,request:&request });
        self.observe_dispatch(result)
    }

    fn observe_dispatch(&mut self, result:Result<ModelObservation,llm_omega::DispatchError>) -> Result<ModelObservation,String> {
        match result {
            Ok(observation)=> {
                llm_omega::observe(&mut self.store,&self.binding,&observation)?;
                Ok(observation)
            }
            Err(llm_omega::DispatchError::Transport(failure))=> {
                llm_omega::record_failure(&mut self.store,&self.binding,&failure)?;
                Err(failure.to_string())
            }
            Err(llm_omega::DispatchError::Guard(error))=>Err(error),
        }
    }

    fn review_contexts(&mut self, prepared:&Prepared, text:&str) -> Result<(),String> {
        for role in [WorkerRole::VerifierA,WorkerRole::VerifierB] {
            let payload=llm_synapse::verifier_payload(&prepared.intent,text,&self.spec.contract);
            self.context(&prepared.base,(role,payload))?;
        }
        Ok(())
    }

    fn unverified(&mut self, input:ReportInput) -> Result<NativeLlmReport,String> {
        self.record_stop("LLM_REQUIRED_CONTRACT_OR_RESOURCE_OBLIGATIONS_UNRESOLVED")?;
        self.report(input)
    }

    fn publish(&mut self, prepared:&Prepared, evidence:&llm_evidence::VerifiedArtifactEvidence) -> Result<llm_gqwf::Publication,String> {
        self.source.unchanged(&self.spec.workspace)?;
        llm_gqwf::offer_observed(&mut self.store,&self.binding,llm_gqwf::RecordedOffer { candidate_id:"result",
            source_bytes:&self.source.bytes,evidence,base:&prepared.base })?;
        llm_gqwf::receive(&mut self.store,&self.binding,"result")?;
        llm_gqwf::verify(&mut self.store,&self.binding,"result")?;
        llm_gqwf::prepare(&mut self.store,&self.binding,"result")?;
        llm_gqwf::commit(&mut self.store,&self.binding,"result")
    }

    fn replay(&mut self) -> Result<NativeLlmReport,String> {
        let Some(publication)=llm_gqwf::publication(&mut self.store,&self.binding,"result")? else {
            return self.recover_observed();
        };
        let text=String::from_utf8(llm_gqwf::result_bytes(&mut self.store,&self.binding,"result")?).map_err(error)?;
        let verdicts=llm_contract::verify(&text,&self.spec.contract)?.into_iter().collect();
        llm_allostasis::release(&mut self.store,&self.binding)?;
        self.report(ReportInput { text,publication:Some(publication),verdicts,replayed:true })
    }

    fn recover_observed(&mut self) -> Result<NativeLlmReport,String> {
        let observed=self.store.transaction(&self.binding,|tx|llm_omega::observed_in(tx,&self.binding,"infer"))
            .map_err(|error|format!("LLM_MISSION_OUTCOME_PENDING: automatic redispatch forbidden: {error}"))?;
        let applied=llm_synapse::read(&self.store,&self.binding,WorkerRole::Producer)?;
        let intent=serde_json::from_value(applied.payload).map_err(error)?;
        let prepared=Prepared { base:Head { root_hash:applied.world_hash,generation:applied.world_generation },intent,max_wall_ms:0 };
        let text=String::from_utf8(observed.output).map_err(error)?;
        self.review_contexts(&prepared,&text)?;
        let evidence=llm_evidence::qualify_observed(&mut self.store,&self.binding)?;
        self.complete(&prepared,Completion { text,evidence,replayed:true })
    }

    fn report(&mut self, input:ReportInput) -> Result<NativeLlmReport,String> {
        let verified=input.publication.is_some();
        let usage=llm_allostasis::state(&mut self.store,&self.binding)?;
        let protocols=protocols(&self.store,&self.binding)?;
        Ok(NativeLlmReport { schema:"genos.rust-llm-mission-result/v1",
            status:if verified { "completed" } else { "unresolved" },completion_scope:"artifact_contract",
            binding:self.binding.clone(),provider:self.spec.provider.clone(),
            artifact:Artifact { hash:raw_hash(input.text.as_bytes()),text:input.text,origin:"model_generated" },
            publication:input.publication,usage,contract_verdicts:input.verdicts,artifact_contract_verified:verified,
            semantic_truth_verified:false,promotable:false,external_effects_authorized:false,replayed:input.replayed,protocols })
    }

    fn record_stop(&mut self, reason:&str) -> Result<(),String> {
        self.store.observation_transaction(&self.binding,|tx| {
            tx.execute("UPDATE rust_protocol_runs SET status='blocked' WHERE run_id=?1 AND status!='completed'",
                params![self.binding.run_id]).map_err(error)?;
            Store::event(tx,&self.binding,Event { protocol:"RUNTIME",phase:"STOPPED_WITHOUT_NEW_ACCEPTANCE",
                payload:json!({"reason":reason,"consumption_refunded":false,"unknown_exposure_retained":true}) })
        })
    }
}

fn credential(provider:&ProviderConfig) -> Result<Option<Credential>,String> {
    if !matches!(provider,ProviderConfig::OpenAi { .. }) { return Ok(None); }
    let key=std::env::var("OPENAI_API_KEY").map_err(|_|"NATIVE_LLM_OPENAI_CREDENTIAL_REQUIRED")?;
    Credential::new(key).map(Some)
}

fn validated_source(spec:&LlmRunSpec) -> Result<llm_source::SourceBundle,String> {
    let source=llm_source::read(&spec.workspace,&spec.config_path)?;
    let derived=source.specification(llm_source::MissionIdentity { mission_id:spec.mission_id.clone(),
        workspace:spec.workspace.clone(),mission:spec.mission.clone(),timeout_ms:spec.timeout_ms,env_hash:spec.env_hash.clone() })?;
    if digest(&derived)? != digest(spec)? { return Err("LLM_SOURCE_ADMISSION_MISMATCH".into()); }
    Ok(source)
}

fn validate_resume(store:&Store, input:(&LlmRunSpec,&Binding)) -> Result<(),String> {
    if digest(input.0)? != input.1.request_hash { return Err("LLM_MISSION_REQUEST_OR_SOURCE_CHANGED".into()); }
    store.current(input.1)
}

fn existing(store:&Store, mission:&str) -> Result<Option<Binding>,String> {
    let raw:Option<String>=store.connection.query_row("SELECT r.binding_json FROM rust_protocol_runs r
        JOIN rust_protocol_current c ON c.run_id=r.run_id WHERE c.mission_id=?1",[mission],|row|row.get(0))
        .optional().map_err(error)?;
    raw.map(|value|serde_json::from_str(&value).map_err(error)).transpose()
}

fn protocols(store:&Store, binding:&Binding) -> Result<Vec<String>,String> {
    let mut statement=store.connection.prepare("SELECT DISTINCT protocol FROM rust_protocol_events WHERE run_id=?1 ORDER BY protocol").map_err(error)?;
    let rows=statement.query_map([&binding.run_id],|row|row.get(0)).map_err(error)?;
    rows.collect::<Result<Vec<_>,_>>().map_err(error)
}

fn error(error:impl std::fmt::Display) -> String { error.to_string() }
