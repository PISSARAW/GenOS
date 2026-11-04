use super::{Session,worker};
use crate::mission_protocols::{Binding,agentic_context as context,agentic_exchange as exchange,
    agentic_ledger as ledger,agentic_parallel_journal as journal,agentic_delegation as delegation,
    agentic_delegation_exchange,agentic_spec::{AgentConfig,AgenticSpec},now_ms};
use rusqlite::{Transaction,Connection};

pub(super) struct PreparedWave { pub handle:journal::WaveHandle, pub jobs:Vec<worker::Job> }

pub(super) fn ready(session:&mut Session) -> Result<Vec<ledger::StepKey>,String> {
    let mut ready=Vec::new();
    for agent in scheduling_order(&session.spec)? {
        if let Some(key)=ready_agent(session,&agent)? { ready.push(key); }
    }
    if ready.is_empty() && !all_complete(session)? { return Err("AGENTIC_PARALLEL_GRAPH_NOT_READY".into()); }
    Ok(ready)
}

fn scheduling_order(spec:&AgenticSpec) -> Result<Vec<AgentConfig>,String> {
    let Some(orchestration)=&spec.config.orchestration else { return Ok(spec.config.agents.clone()); };
    let mut agents=spec.config.agents.iter().map(|agent|Ok((orchestration.depth(&agent.id)?,agent.clone())))
        .collect::<Result<Vec<_>,String>>()?;
    agents.sort_by_key(|(depth,_)|*depth);
    Ok(agents.into_iter().map(|(_,agent)|agent).collect())
}

fn ready_agent(session:&mut Session,agent:&AgentConfig) -> Result<Option<ledger::StepKey>,String> {
    if dormant(session,&agent.id)? { return Ok(None); }
    if ledger::agent_record(&mut session.store,&session.binding,&agent.id)?.is_some() { return Ok(None); }
    if !dependencies_complete(session,agent)? { return Ok(None); }
    next_step(session,agent)
}

fn dormant(session:&mut Session,id:&str) -> Result<bool,String> {
    let Some(orchestration)=&session.spec.config.orchestration else { return Ok(false); };
    if id==orchestration.coordinator { return Ok(false); }
    session.store.transaction(&session.binding,|tx|Ok(delegation::assigned_in(tx,&session.binding,id)?.is_none()))
}

fn dependencies_complete(session:&mut Session,agent:&AgentConfig) -> Result<bool,String> {
    for dependency in &agent.depends_on {
        if ledger::agent_record(&mut session.store,&session.binding,dependency)?.is_none() { return Ok(false); }
    }
    Ok(true)
}

fn all_complete(session:&mut Session) -> Result<bool,String> {
    if let Some(orchestration)=&session.spec.config.orchestration {
        return session.store.transaction(&session.binding,|tx| {
            if ledger::completed_in(tx,&session.binding,&orchestration.coordinator)?.is_none() { return Ok(false); }
            for assignment in delegation::all_in(tx,&session.binding)? {
                if ledger::completed_in(tx,&session.binding,&assignment.worker_id)?.is_none() { return Ok(false); }
            }
            Ok(true)
        });
    }
    for agent in &session.spec.config.agents {
        if ledger::agent_record(&mut session.store,&session.binding,&agent.id)?.is_none() { return Ok(false); }
    }
    Ok(true)
}

fn next_step(session:&mut Session,agent:&AgentConfig) -> Result<Option<ledger::StepKey>,String> {
    exchange::receive(&mut session.store,&session.binding,&agent.id)?;
    for turn in 0..agent.max_turns {
        let key=ledger::StepKey { agent_id:agent.id.clone(),turn };
        let Some(record)=ledger::known_model(&mut session.store,&session.binding,&key)? else { return fresh_step(session,key); };
        super::recovery_preflight(session)?;
        if super::super::consume_turn(&mut session.store,&session.binding,&record)? { return Ok(None); }
    }
    Err(format!("AGENTIC_TURN_LIMIT_EXHAUSTED_WITHOUT_COMPLETION: {}",agent.id))
}

fn fresh_step(session:&mut Session,key:ledger::StepKey) -> Result<Option<ledger::StepKey>,String> {
    if session.spec.config.orchestration.is_none() { return Ok(Some(key)); }
    session.store.transaction(&session.binding,|tx| {
        if !children_complete(tx,&session.binding,&key)? { return Ok(None); }
        agentic_delegation_exchange::receive_returns_in(tx,&session.binding,&key)?;
        Ok(delegation::eligible_in(tx,&session.binding,&key)?.then_some(key))
    })
}

fn children_complete(connection:&Connection,binding:&Binding,key:&ledger::StepKey) -> Result<bool,String> {
    for assignment in delegation::before_in(connection,binding,key)? {
        if ledger::completed_in(connection,binding,&assignment.worker_id)?.is_none() { return Ok(false); }
    }
    Ok(true)
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
            if spec.config.orchestration.is_some() {
                agentic_delegation_exchange::receive_returns_in(tx,binding,key)?;
            }
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
