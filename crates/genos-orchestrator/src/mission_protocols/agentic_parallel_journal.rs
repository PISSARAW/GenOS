//! Vagues de tours durables : pas de permis recréé ni d'inférence sur une issue inconnue.
#[path="agentic_parallel_journal_types.rs"] mod types;
#[path="agentic_parallel_journal_store.rs"] mod data;
#[path="agentic_parallel_journal_checks.rs"] mod checks;
#[path="agentic_parallel_journal_settlement.rs"] mod settlement;
#[path="agentic_parallel_journal_events.rs"] mod events;
pub use types::{WaveHandle,WaveDescriptor,WaveMember,WaveReceipt,WaveProof,ClosedStep};
use super::{Binding,Event,Store,digest,now_ms,agentic_ledger::StepKey};
use rusqlite::{Connection,Transaction};
use serde_json::json;
use std::collections::HashSet;

pub fn begin_in(tx:&Transaction<'_>,binding:&Binding,keys:&[StepKey])->Result<WaveHandle,String> {
    data::ensure(tx)?;
    require_idle_or_recover_in(tx,binding)?;
    let members=keys.iter().map(|key|checks::fresh_member(tx,binding,key)).collect::<Result<Vec<_>,_>>()?;
    let mut descriptor=WaveDescriptor { wave_id:uuid::Uuid::new_v4().to_string(),binding_hash:digest(binding)?,
        opened_ms:now_ms(),members,descriptor_hash:String::new() };
    descriptor.descriptor_hash=checks::descriptor_hash(&descriptor)?;
    checks::shape(tx,binding,&descriptor)?;
    data::insert(tx,binding,&descriptor)?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"AGENTIC_WAVE_PREPARED",payload:json!(descriptor) })?;
    Ok(types::handle(descriptor))
}

pub fn require_idle_or_recover_in(tx:&Transaction<'_>,binding:&Binding)->Result<(),String> {
    super::store::current_checked(tx,binding)?;
    data::ensure(tx)?;
    let Some(id)=data::pending(tx,binding)? else { return Ok(()); };
    let (descriptor,_)=data::load(tx,binding,&id)?;
    settlement::outcomes(tx,binding,&descriptor).map_err(|error|format!("AGENTIC_WAVE_RECOVERY_REQUIRED: {error}"))?;
    let receipt=settlement::settle(tx,binding,&descriptor)?;
    if !receipt.is_joined() { return Err("AGENTIC_WAVE_NOT_SETTLED".into()); }
    Ok(())
}

pub(crate) fn require_dispatch_in(connection:&Connection,binding:&Binding,key:&StepKey)->Result<(),String> {
    if !checks::enabled(connection,binding)? { return Ok(()); }
    let (id,_)=data::membership(connection,binding,key)?;
    let (descriptor,status)=data::load(connection,binding,&id)?;
    if status!="active" { return Err("AGENTIC_WAVE_DISPATCH_NOT_ACTIVE".into()); }
    checks::descriptor(connection,binding,&descriptor)?;
    if !descriptor.members.iter().any(|member|member.key==*key) { return Err("AGENTIC_WAVE_DISPATCH_KEY_MISSING".into()); }
    Ok(())
}

pub fn active(store:&mut Store,binding:&Binding)->Result<Option<WaveHandle>,String> {
    store.transaction(binding,|tx| {
        data::ensure(tx)?;
        let Some(id)=data::pending(tx,binding)? else { return Ok(None); };
        let (descriptor,_)=data::load(tx,binding,&id)?;
        checks::descriptor(tx,binding,&descriptor)?;
        Ok(Some(types::handle(descriptor)))
    })
}

pub fn finish(store:&mut Store,binding:&Binding,handle:&WaveHandle)->Result<WaveReceipt,String> {
    store.observation_transaction(binding,|tx| {
        let (descriptor,_)=data::load(tx,binding,handle.wave_id())?;
        if descriptor!=handle.descriptor { return Err("AGENTIC_WAVE_HANDLE_CHANGED".into()); }
        settlement::settle(tx,binding,&descriptor)
    })
}

pub(crate) fn closure_in(connection:&Connection,binding:&Binding)->Result<Vec<WaveProof>,String> {
    if !checks::enabled(connection,binding)? { return Ok(vec![]); }
    let mut proofs=Vec::new();
    let mut covered=HashSet::new();
    for id in data::ids(connection,binding)? {
        let proof=proof(connection,binding,&id)?;
        for member in &proof.descriptor.members { covered.insert(member.key.operation_id()); }
        proofs.push(proof);
    }
    if covered!=observed_keys(connection,binding)? { return Err("AGENTIC_WAVE_OBSERVATION_COVERAGE_CHANGED".into()); }
    Ok(proofs)
}

fn proof(connection:&Connection,binding:&Binding,id:&str)->Result<WaveProof,String> {
    let (descriptor,status)=data::load(connection,binding,id)?;
    checks::descriptor(connection,binding,&descriptor)?;
    let history=data::history(connection,binding,id)?;
    checks::history(&descriptor,&status,&history)?;
    let receipt=history.last().cloned().ok_or("AGENTIC_WAVE_NOT_JOINED")?;
    if !receipt.is_joined() { return Err("AGENTIC_WAVE_NOT_JOINED".into()); }
    if receipt.observations!=settlement::outcomes(connection,binding,&descriptor)? { return Err("AGENTIC_WAVE_OUTCOME_CHANGED".into()); }
    Ok(WaveProof { descriptor,receipt,history })
}

fn observed_keys(connection:&Connection,binding:&Binding)->Result<HashSet<String>,String> {
    let mut statement=super::gqwf_store::sql(connection.prepare("SELECT agent_id,turn FROM agentic_models WHERE run_id=$1 AND status='observed'"))?;
    let rows=super::gqwf_store::sql(statement.query_map([&binding.run_id],|row|Ok(StepKey { agent_id:row.get(0)?,turn:row.get(1)? })))?;
    rows.map(|row|row.map(|key|key.operation_id()).map_err(|error|error.to_string())).collect()
}

#[cfg(test)]
#[path="agentic_parallel_journal_tests.rs"] mod tests;
