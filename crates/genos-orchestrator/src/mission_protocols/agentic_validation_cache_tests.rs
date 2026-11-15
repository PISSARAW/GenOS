use super::*;
use crate::mission_protocols::agentic_ledger;

mod fixture {
    use crate as genos_orchestrator;
    include!("../../tests/helpers/agentic_ledger_fixture.rs");
}

fn observed()->fixture::Pending {
    let mut f=fixture::prepare();
    f.complete(fixture::response("Sources: selected. Limites: no semantic truth claim."));f
}

#[test]
fn verified_record_is_reused_only_in_the_same_unchanged_transaction() {
    let mut f=observed();let binding=f.binding.clone();let key=f.key.clone();
    f.store.transaction(&binding,|tx| {
        assert!(get(tx,&binding,&key).is_none());
        let first=agentic_ledger::model_record_in(tx,&binding,&key)?;
        assert_eq!(get(tx,&binding,&key),Some(first.clone()));
        assert_eq!(agentic_ledger::model_record_in(tx,&binding,&key)?,first);Ok(())
    }).unwrap();
    f.store.transaction(&binding,|tx| { assert!(get(tx,&binding,&key).is_none());Ok(()) }).unwrap();
}

#[test]
fn changing_an_observed_row_in_the_same_transaction_cannot_reuse_its_proof() {
    let mut f=observed();let binding=f.binding.clone();let key=f.key.clone();
    let error=f.store.transaction(&binding,|tx| {
        agentic_ledger::model_record_in(tx,&binding,&key)?;
        tx.execute("UPDATE agentic_models SET outcome_json=json_set(outcome_json,'$.text','forged')",[])
            .map_err(|error|error.to_string())?;
        agentic_ledger::model_record_in(tx,&binding,&key)
    }).unwrap_err();
    assert_eq!(error,"AGENTIC_LEDGER_RECORD_CORRUPT");
    f.store.transaction(&binding,|tx|agentic_ledger::model_record_in(tx,&binding,&key)).unwrap();
}

#[test]
fn a_commit_from_another_connection_is_revalidated_in_the_next_transaction() {
    let mut f=observed();let binding=f.binding.clone();let key=f.key.clone();
    f.store.transaction(&binding,|tx|agentic_ledger::model_record_in(tx,&binding,&key)).unwrap();
    let other=Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    other.execute("UPDATE agentic_models SET outcome_hash='forged'",[]).unwrap();
    assert_eq!(f.store.transaction(&binding,|tx|agentic_ledger::model_record_in(tx,&binding,&key))
        .unwrap_err(),"AGENTIC_LEDGER_RECORD_CORRUPT");
}

#[test]
fn another_connection_never_inherits_the_current_validation_scope() {
    let mut f=observed();let binding=f.binding.clone();let key=f.key.clone();
    let mut other=Connection::open_in_memory().unwrap();let other_tx=other.transaction().unwrap();
    f.store.transaction(&binding,|tx| {
        agentic_ledger::model_record_in(tx,&binding,&key)?;
        assert!(get(&other_tx,&binding,&key).is_none());
        assert!(get(tx,&binding,&key).is_some());Ok(())
    }).unwrap();
}

#[test]
fn cached_record_does_not_authorize_a_forged_binding() {
    let mut f=observed();let binding=f.binding.clone();let key=f.key.clone();
    f.store.transaction(&binding,|tx| {
        agentic_ledger::model_record_in(tx,&binding,&key)?;
        let mut forged=binding.clone();forged.expires_ms=u64::MAX;
        assert_eq!(agentic_ledger::model_record_in(tx,&forged,&key).unwrap_err(),"MISSION_INCARNATION_STALE_OR_FORGED");
        Ok(())
    }).unwrap();
}
