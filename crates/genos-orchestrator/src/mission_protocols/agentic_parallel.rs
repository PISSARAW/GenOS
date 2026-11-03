//! Vagues de tours réellement exécutés ; les métriques portent sur cette invocation.
#[path="agentic_parallel_scheduler.rs"] mod scheduler;
#[path="agentic_parallel_worker.rs"] mod worker;
use super::Session;
use crate::mission_protocols::{agentic_parallel_journal as journal,agentic_ledger,agentic_source,Binding};
use serde::Serialize;
use std::path::Path;
use std::sync::atomic::{AtomicUsize,Ordering};

#[derive(Clone,Debug,Default,Serialize)]
pub struct Metrics { pub waves_prepared:u64, pub peak_active_step_workers:u64 }

pub(super) struct Environment<'a> {
    pub database:&'a Path, pub workspace:&'a Path,
    pub binding:&'a Binding, pub source:&'a agentic_source::SourceBundle,
}

#[derive(Default)]
struct Active { count:AtomicUsize, peak:AtomicUsize }
struct WorkerGuard<'a>(&'a Active);

impl Active {
    fn enter(&self) -> WorkerGuard<'_> {
        let current=self.count.fetch_add(1,Ordering::SeqCst)+1;
        self.peak.fetch_max(current,Ordering::SeqCst);
        WorkerGuard(self)
    }
}

impl Drop for WorkerGuard<'_> {
    fn drop(&mut self) { self.0.count.fetch_sub(1,Ordering::SeqCst); }
}

pub(super) fn run(session:&mut Session) -> Result<(),String> {
    worker::database(&session.database,&session.spec.workspace)?;
    loop {
        recovery_preflight(session)?;
        let ready=scheduler::ready(session)?;
        if ready.is_empty() {
            return session.store.transaction(&session.binding,|tx|journal::require_idle_or_recover_in(tx,&session.binding));
        }
        session.source.unchanged(&session.spec.workspace)?;
        let wave=scheduler::prepare(session,&ready)?;
        session.parallel_metrics.waves_prepared=session.parallel_metrics.waves_prepared.saturating_add(1);
        execute(session,wave)?;
    }
}

fn recovery_preflight(session:&mut Session) -> Result<(),String> {
    let Some(wave)=journal::active(&mut session.store,&session.binding)? else { return Ok(()); };
    for key in wave.keys() {
        let record=agentic_ledger::known_model(&mut session.store,&session.binding,key)?
            .ok_or("AGENTIC_PARALLEL_RECOVERY_MODEL_MISSING")?;
        if !record.usage_known { return Err("AGENTIC_PARALLEL_RECOVERY_USAGE_UNKNOWN".into()); }
    }
    Ok(())
}

fn execute(session:&mut Session,wave:scheduler::PreparedWave) -> Result<(),String> {
    let environment=Environment { database:&session.database,workspace:&session.spec.workspace,
        binding:&session.binding,source:&session.source };
    let active=Active::default();
    let outcome=launch(&environment,wave.jobs,&active);
    session.parallel_metrics.peak_active_step_workers=session.parallel_metrics.peak_active_step_workers
        .max(active.peak.load(Ordering::SeqCst) as u64);
    let receipt=journal::finish(&mut session.store,&session.binding,&wave.handle);
    outcome?;
    let receipt=receipt?;
    if !receipt.is_joined() {
        return Err(format!("AGENTIC_PARALLEL_WAVE_NOT_SETTLED: {}",receipt.error.unwrap_or(receipt.status)));
    }
    Ok(())
}

fn launch(environment:&Environment<'_>,jobs:Vec<worker::Job>,active:&Active) -> Result<(),String> {
    std::thread::scope(|scope| {
        let mut handles=Vec::new();
        let mut failure=None;
        for job in jobs {
            let name=format!("agentic-{}-{}",job.key.agent_id,job.key.turn);
            let launched=std::thread::Builder::new().name(name).spawn_scoped(scope,move || {
                let _guard=active.enter();
                worker::dispatch(environment,job)
            });
            match launched {
                Ok(handle)=>handles.push(handle),
                Err(error)=> { failure=Some(format!("AGENTIC_PARALLEL_WORKER_SPAWN_FAILED: {error}"));break; }
            }
        }
        join_all(handles,&mut failure);
        failure.map_or(Ok(()),Err)
    })
}

fn join_all(handles:Vec<std::thread::ScopedJoinHandle<'_,Result<(),String>>>,failure:&mut Option<String>) {
    for handle in handles {
        let result=match handle.join() {
            Ok(result)=>result,
            Err(_)=>Err("AGENTIC_PARALLEL_WORKER_PANICKED: exposure requires recovery".into()),
        };
        if failure.is_none() { *failure=result.err(); }
    }
}

