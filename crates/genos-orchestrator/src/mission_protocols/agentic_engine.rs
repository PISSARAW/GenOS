//! DAG borné d'agents LLM et outils installés ; aucune commande issue de la prose.
use super::{Binding,Event,Store,agentic_context,agentic_evidence,agentic_exchange,agentic_ledger,agentic_source,agentic_tools};
use super::{agentic_spec::{AgentConfig,AgenticSpec},digest,process,raw_hash};
use agentic_ledger::{AgentCompletion,CompletedAgent,ModelAdmission,ModelDispatch,ModelIntent,ModelRecord,StepKey};
use genos_api::native_inference::{Credential,Finish,ProviderConfig};
use rusqlite::{OptionalExtension,params};
use serde::Serialize;
use serde_json::json;
use std::path::PathBuf;

#[path="agentic_parallel.rs"]
mod parallel;
pub use parallel::Metrics as ParallelMetrics;

pub struct NativeAgenticRequest { pub spec:AgenticSpec, pub executable:PathBuf, pub database:PathBuf }

#[derive(Serialize)]
pub struct Artifact { pub text:String, pub hash:String, pub origin:&'static str }

#[derive(Serialize)]
pub struct NativeAgenticReport {
    pub schema:&'static str, pub status:&'static str, pub completion_scope:&'static str,
    pub binding:Binding, pub agents:Vec<CompletedAgent>, pub artifact:Artifact,
    pub publication:Option<agentic_exchange::Publication>, pub usage:agentic_ledger::MissionState,
    pub contract_verdicts:Vec<super::llm_contract::ContractVerdict>, pub artifact_contract_verified:bool,
    pub semantic_truth_verified:bool, pub promotable:bool, pub external_effects_authorized:bool,
    pub replayed:bool, pub protocols:Vec<String>, pub error:Option<String>,
    pub max_parallel_agents:u32, pub parallelism:ParallelMetrics,
}

struct Session {
    store:Store, binding:Binding, spec:AgenticSpec, source:agentic_source::SourceBundle,
    database:PathBuf, replayed:bool, parallel_metrics:ParallelMetrics,
}

pub fn run(request:NativeAgenticRequest) -> Result<NativeAgenticReport,String> {
    let mut session=Session::open(request)?;
    agentic_ledger::initialize(&mut session.store,&session.binding)?;
    agentic_exchange::initialize(&mut session.store,&session.binding)?;
    match session.execute() {
        Ok(report)=>Ok(report),
        Err(reason)=> { session.stop(&reason)?; session.report(None,Some(reason)) },
    }
}

impl Session {
    fn open(request:NativeAgenticRequest) -> Result<Self,String> {
        validate_request(&request)?;
        let source=validated_source(&request.spec)?;
        let mut store=Store::open(&request.database)?;
        let previous=existing(&store,&request.spec.mission_id)?;
        let replayed=previous.is_some();
        let binding=match previous { Some(binding)=>binding,None=>store.admit_agentic(&request.spec)? };
        if binding.request_hash!=digest(&request.spec)? { return Err("AGENTIC_REQUEST_OR_SOURCE_CHANGED".into()); }
        store.current(&binding)?;
        Ok(Self { store,binding,spec:request.spec,source,database:request.database,replayed,
            parallel_metrics:ParallelMetrics::default() })
    }

    fn execute(&mut self) -> Result<NativeAgenticReport,String> {
        if let Some(publication)=agentic_exchange::publication(&mut self.store,&self.binding)? {
            agentic_ledger::release(&mut self.store,&self.binding)?;
            return self.report(Some(publication),None);
        }
        self.checkpoint()?;
        self.graph()?;
        self.finish()
    }

    fn graph(&mut self) -> Result<(),String> {
        if self.spec.config.max_parallel_agents>1 { return parallel::run(self); }
        for agent in self.spec.config.agents.clone() { self.agent(&agent)?; }
        Ok(())
    }

    fn finish(&mut self) -> Result<NativeAgenticReport,String> {
        self.source.unchanged(&self.spec.workspace)?;
        let evidence=agentic_evidence::qualify(&mut self.store,&self.binding)?;
        if !evidence.contract_satisfied() {
            self.stop("AGENTIC_FINAL_CONTRACT_UNRESOLVED")?;
            return self.report(None,Some("AGENTIC_FINAL_CONTRACT_UNRESOLVED".into()));
        }
        let publication=agentic_exchange::publish(&mut self.store,&self.binding,&evidence)?;
        agentic_ledger::release(&mut self.store,&self.binding)?;
        self.report(Some(publication),None)
    }

    fn checkpoint(&mut self) -> Result<(),String> {
        self.store.checkpoint(&self.binding,&json!({"schema":"genos.rust-agentic-checkpoint/v1",
            "phase":"resume_durable_agent_graph","source_hash":self.spec.source_hash,
            "provider_state_recoverable":false,"automatic_unknown_redispatch":false}))?;
        Ok(())
    }

    fn agent(&mut self, agent:&AgentConfig) -> Result<(),String> {
        if agentic_ledger::agent_record(&mut self.store,&self.binding,&agent.id)?.is_some() { return Ok(()); }
        agentic_exchange::receive(&mut self.store,&self.binding,&agent.id)?;
        for turn in 0..agent.max_turns {
            let key=StepKey { agent_id:agent.id.clone(),turn };
            let record=self.model(&key)?;
            if consume_turn(&mut self.store,&self.binding,&record)? { return Ok(()); }
        }
        Err("AGENTIC_TURN_LIMIT_EXHAUSTED_WITHOUT_COMPLETION".into())
    }

    fn model(&mut self, key:&StepKey) -> Result<ModelRecord,String> {
        self.source.unchanged(&self.spec.workspace)?;
        let mut request=agentic_context::prepare(&mut self.store,&self.binding,key)?;
        request.base.credential=credential(&request.base.provider)?;
        let admission=agentic_ledger::prepare_model(&mut self.store,&self.binding,&ModelIntent {
            key:key.clone(),request:&request,max_wall_ms:self.spec.config.turn_timeout_ms })?;
        match admission {
            ModelAdmission::Known(record)=>Ok(record),
            ModelAdmission::Unknown=>Err("AGENTIC_MODEL_OUTCOME_UNKNOWN: automatic redispatch forbidden".into()),
            ModelAdmission::Fresh(permit)=>agentic_ledger::dispatch_model(&mut self.store,&self.binding,
                ModelDispatch { permit,request:&request }).map_err(error),
        }
    }

    fn report(&mut self, publication:Option<agentic_exchange::Publication>, reason:Option<String>) -> Result<NativeAgenticReport,String> {
        let agents=self.completed()?;
        let text=self.final_candidate()?;
        let verdicts=super::llm_contract::verify(&text,&self.spec.config.contract)?.into_iter().collect();
        let usage=agentic_ledger::state(&mut self.store,&self.binding)?;
        let protocols=protocols(&self.store,&self.binding)?;
        let verified=publication.is_some();
        Ok(NativeAgenticReport { schema:"genos.rust-agentic-mission-result/v1",status:if verified { "completed" } else { "unresolved" },
            completion_scope:"artifact_contract",binding:self.binding.clone(),agents,artifact:Artifact {
                hash:raw_hash(text.as_bytes()),origin:if text.is_empty() { "unavailable" } else { "model_generated" },text },
            publication,usage,contract_verdicts:verdicts,artifact_contract_verified:verified,semantic_truth_verified:false,
            promotable:false,external_effects_authorized:false,replayed:self.replayed,protocols,error:reason,
            max_parallel_agents:self.spec.config.max_parallel_agents,parallelism:self.parallel_metrics.clone() })
    }

    fn completed(&mut self) -> Result<Vec<CompletedAgent>,String> {
        let mut results=Vec::new();
        for agent in &self.spec.config.agents {
            if let Some(result)=agentic_ledger::agent_record(&mut self.store,&self.binding,&agent.id)? { results.push(result); }
        }
        Ok(results)
    }

    fn final_candidate(&mut self) -> Result<String,String> {
        let agent=self.spec.config.agents.last().ok_or("AGENTIC_FINAL_AGENT_REQUIRED")?;
        for turn in (0..agent.max_turns).rev() {
            let exists:bool=self.store.connection.query_row("SELECT EXISTS(SELECT 1 FROM agentic_models
                WHERE run_id=$1 AND agent_id=$2 AND turn=$3 AND status='observed')",
                params![self.binding.run_id,agent.id,turn],|row|row.get(0)).map_err(error)?;
            if !exists { continue; }
            let key=StepKey { agent_id:agent.id.clone(),turn };
            return agentic_ledger::model_record(&mut self.store,&self.binding,&key).map(|record|record.text);
        }
        Ok(String::new())
    }

    fn stop(&mut self, reason:&str) -> Result<(),String> {
        self.store.observation_transaction(&self.binding,|tx| {
            tx.execute("UPDATE rust_protocol_runs SET status='blocked' WHERE run_id=?1 AND status!='completed'",[&self.binding.run_id]).map_err(error)?;
            Store::event(tx,&self.binding,Event { protocol:"RUNTIME",phase:"AGENTIC_STOPPED_WITHOUT_COMPLETION",
                payload:json!({"reason":reason,"consumption_refunded":false,"unknown_exposure_retained":true}) })
        })
    }
}

pub(super) fn consume_turn(store:&mut Store, binding:&Binding, record:&ModelRecord) -> Result<bool,String> {
    if !record.usage_known { return Err("AGENTIC_MODEL_USAGE_UNKNOWN: exposure retained and tools blocked".into()); }
    match record.finish {
        Finish::ToolRequested=> { agentic_tools::execute(store,binding,&record.key)?; Ok(false) },
        Finish::Complete=> {
            agentic_ledger::complete_agent(store,binding,&AgentCompletion {
                agent_id:record.key.agent_id.clone(),last_turn:record.key.turn,text:record.text.clone(),
                observation_hash:record.observation_hash.clone() })?;
            Ok(true)
        },
        _=>Err("AGENTIC_MODEL_TERMINATION_UNRESOLVED".into()),
    }
}

fn validate_request(request:&NativeAgenticRequest) -> Result<(),String> {
    request.spec.validate()?;
    if process::executable_hash(&request.executable)?!=request.spec.env_hash { return Err("AGENTIC_INSTALLED_EXECUTABLE_CHANGED".into()); }
    Ok(())
}

fn validated_source(spec:&AgenticSpec) -> Result<agentic_source::SourceBundle,String> {
    let source=agentic_source::read(&spec.workspace,&spec.source.config_path)?;
    let derived=source.specification(super::llm_source::MissionIdentity { mission_id:spec.mission_id.clone(),workspace:spec.workspace.clone(),
        mission:spec.mission.clone(),timeout_ms:spec.timeout_ms,env_hash:spec.env_hash.clone() })?;
    if digest(&derived)?!=digest(spec)? { return Err("AGENTIC_SOURCE_ADMISSION_MISMATCH".into()); }
    Ok(source)
}

fn existing(store:&Store, mission:&str) -> Result<Option<Binding>,String> {
    let raw:Option<String>=store.connection.query_row("SELECT r.binding_json FROM rust_protocol_runs r
        JOIN rust_protocol_current c ON c.run_id=r.run_id WHERE c.mission_id=?1",[mission],|row|row.get(0)).optional().map_err(error)?;
    raw.map(|raw|serde_json::from_str(&raw).map_err(error)).transpose()
}

fn credential(provider:&ProviderConfig) -> Result<Option<Credential>,String> {
    if !matches!(provider,ProviderConfig::OpenAi { .. }) { return Ok(None); }
    Credential::new(std::env::var("OPENAI_API_KEY").map_err(|_|"NATIVE_LLM_OPENAI_CREDENTIAL_REQUIRED")?).map(Some)
}

fn protocols(store:&Store, binding:&Binding) -> Result<Vec<String>,String> {
    let mut statement=store.connection.prepare("SELECT DISTINCT protocol FROM rust_protocol_events WHERE run_id=?1 ORDER BY protocol").map_err(error)?;
    statement.query_map(params![binding.run_id],|row|row.get(0)).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)
}

fn error(error:impl std::fmt::Display) -> String { error.to_string() }
