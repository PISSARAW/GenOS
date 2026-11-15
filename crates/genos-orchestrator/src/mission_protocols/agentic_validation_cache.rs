//! Réutilisation de preuves déjà vérifiées dans une même transaction SQLite stable.
use super::agentic_ledger::{ModelRecord,StepKey};
use super::Binding;
use rusqlite::Connection;
use std::cell::RefCell;
use std::collections::HashMap;

type Key=(String,String,u32);
struct Snapshot { connection:usize, changes:u64, records:HashMap<Key,ModelRecord> }
thread_local! { static ACTIVE:RefCell<Option<Snapshot>>=const { RefCell::new(None) }; }

pub(crate) struct Scope { previous:Option<Snapshot> }
impl Drop for Scope {
    fn drop(&mut self) { ACTIVE.with(|active| { active.replace(self.previous.take()); }); }
}

pub(crate) fn enter(connection:&Connection)->Scope {
    let snapshot=Snapshot { connection:identity(connection),changes:connection.total_changes(),records:HashMap::new() };
    Scope { previous:ACTIVE.with(|active|active.replace(Some(snapshot))) }
}

fn identity(connection:&Connection)->usize { connection as *const Connection as usize }
fn key(binding:&Binding,step:&StepKey)->Key { (binding.run_id.clone(),step.agent_id.clone(),step.turn) }

fn stable<'a>(active:&'a mut Option<Snapshot>,connection:&Connection)->Option<&'a mut Snapshot> {
    let snapshot=active.as_mut()?;
    if snapshot.connection!=identity(connection) || connection.is_autocommit() { return None; }
    let changes=connection.total_changes();
    if changes!=snapshot.changes { snapshot.records.clear();snapshot.changes=changes; }
    Some(snapshot)
}

pub(crate) fn get(connection:&Connection,binding:&Binding,step:&StepKey)->Option<ModelRecord> {
    ACTIVE.with(|active|stable(&mut active.borrow_mut(),connection)?.records.get(&key(binding,step)).cloned())
}

pub(crate) fn verified(connection:&Connection,binding:&Binding,record:&ModelRecord) {
    ACTIVE.with(|active| {
        let mut active=active.borrow_mut();
        if let Some(snapshot)=stable(&mut active,connection) {
            if snapshot.records.len()<32 { snapshot.records.insert(key(binding,&record.key),record.clone()); }
        }
    });
}

#[cfg(test)]
#[path="agentic_validation_cache_tests.rs"]
mod tests;
