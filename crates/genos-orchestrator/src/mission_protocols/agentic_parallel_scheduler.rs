use super::{Session,worker};
use crate::mission_protocols::{Binding,agentic_context as context,agentic_exchange as exchange,
    agentic_ledger as ledger,agentic_parallel_journal as journal,agentic_spec::{AgentConfig,AgenticSpec},now_ms};
use rusqlite::Transaction;

pub(super) struct PreparedWave { pub handle:journal::WaveHandle, pub jobs:Vec<worker::Job> }

pub(super) fn ready(session:&mut Session) -> Result<Vec<ledger::StepKey>,String> {
    let mut ready=Vec::new();
    for agent in session.spec.config.agents.clone() {
        if ledger::agent_record(&mut session.store,&session.binding,&agent.id)?.is_some() { continue; }
        if !dependencies_complete(session,&agent)? { continue; }
        if let Some(key)=next_step(session,&agent)? { ready.push(key); }
    }
    if ready.is_empty() && !all_complete(session)? { return Err("AGENTIC_PARALLEL_GRAPH_NOT_READY".into()); }
    Ok(ready)
}

fn dependencies_complete(session:&mut Session,agent:&AgentConfig) -> Result<bool,String> {
    for dependency in &agent.depends_on {
        if ledger::agent_record(&mut session.store,&session.binding,dependency)?.is_none() { return Ok(false); }
    }
    Ok(true)
}

fn all_complete(session:&mut Session) -> Result<bool,String> {
    for agent in &session.spec.config.agents {
        if ledger::agent_record(&mut session.store,&session.binding,&agent.id)?.is_none() { return Ok(false); }
    }
    Ok(true)
}

fn next_step(session:&mut Session,agent:&AgentConfig) -> Result<Option<ledger::StepKey>,String> {
    exchange::receive(&mut session.store,&session.binding,&agent.id)?;
    for turn in 0..agent.max_turns {
        let key=ledger::StepKey { agent_id:agent.id.clone(),turn };
        let Some(record)=ledger::known_model(&mut session.store,&session.binding,&key)? else { return Ok(Some(key)); };
        super::recovery_preflight(session)?;
        if super::super::consume_turn(&mut session.store,&session.binding,&record)? { return Ok(None); }
    }
    Err(format!("AGENTIC_TURN_LIMIT_EXHAUSTED_WITHOUT_COMPLETION: {}",agent.id))
}

pub(super) fn prepare(session:&mut Session,ready:&[ledger::StepKey]) -> Result<PreparedWave,String> {
    let binding=&session.binding;
    let spec=&session.spec;
    let credential=super::super::credential(&spec.config.provider)?;
    session.store.transaction(binding,|tx| {
        journal::require_idle_or_recover_in(tx,binding)?;
        let (count,wall)=allocation(tx,binding,(spec,ready.len()))?;
        let keys=&ready[..count];
        let mut jobs=Vec::new();
        for key in keys {
            let mut request=context::prepare_bounded_in(tx,binding,&context::ContextRequest { key,max_wall_ms:wall })?;
            request.base.credential=credential.clone();
            let admission=ledger::prepare_model_in(tx,binding,&ledger::ModelIntent { key:key.clone(),request:&request,max_wall_ms:wall })?;
            let ledger::ModelAdmission::Fresh(permit)=admission else { return Err("AGENTIC_PARALLEL_FRESH_WAVE_REQUIRED".into()); };
            jobs.push(worker::Job { key:key.clone(),request,permit });
        }
        let handle=journal::begin_in(tx,binding,keys)?;
        Ok(PreparedWave { handle,jobs })
    })
}

fn allocation(tx:&Transaction<'_>,binding:&Binding,input:(&AgenticSpec,usize)) -> Result<(usize,u64),String> {
    let (spec,ready)=input;
    let capacity=ledger::dispatch_capacity_in(tx,binding)?;
    let tokens=spec.config.max_input_tokens.checked_add(spec.config.generation.max_output_tokens).ok_or("AGENTIC_TOKEN_EXPOSURE_OVERFLOW")?;
    let count=(ready as u64).min(u64::from(spec.config.max_parallel_agents))
        .min(capacity.model_calls).min(capacity.tokens/tokens).min(capacity.wall_ms);
    if count==0 { return Err("AGENTIC_PARALLEL_WAVE_CAPACITY_UNAVAILABLE".into()); }
    let lease=binding.expires_ms.saturating_sub(now_ms());
    let wall=spec.config.turn_timeout_ms.min(capacity.wall_ms/count).min(lease);
    if wall==0 { return Err("AGENTIC_PARALLEL_WALL_WINDOW_UNAVAILABLE".into()); }
    Ok((count as usize,wall))
}
