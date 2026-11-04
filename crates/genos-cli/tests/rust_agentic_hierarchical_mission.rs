#[path="../../genos-orchestrator/tests/helpers/hierarchical_agentic_fixture.rs"] mod fixture;
use fixture::{Fixture,Mode};
use genos_orchestrator::mission_protocols::{Binding,digest,process};
use serde_json::{Value,json};
use std::path::PathBuf;
use std::process::{Command,Output};
use std::sync::{Mutex,OnceLock};

fn serial()->std::sync::MutexGuard<'static,()> {
    static LOCK:OnceLock<Mutex<()>>=OnceLock::new();
    LOCK.get_or_init(||Mutex::new(())).lock().unwrap_or_else(|error|error.into_inner())
}

fn executable(f:&Fixture)->PathBuf {
    let source=std::path::Path::new(env!("CARGO_BIN_EXE_genos"));
    let target=f.root.path().join("genos-hierarchical-cli.exe");
    if !target.exists() { std::fs::copy(source,&target).unwrap(); }
    assert_eq!(process::executable_hash(source).unwrap(),process::executable_hash(&target).unwrap());
    target
}

fn command(f:&Fixture,mission:&str)->Command {
    let mut value=Command::new(executable(f));
    value.args(["run","Delegate the hierarchical source analysis with Sources and Limites.","--executor","rust","--workspace-root"])
        .arg(&f.workspace).args(["--mission-id",mission,"--timeout-ms"]).arg(f.spec.timeout_ms.to_string())
        .args(["--agentic-config","agentic.json"])
        .current_dir(&f.workspace).env("PATH",&f.workspace).env("GENOS_MOCK_LLM","1");
    value
}

fn parse(output:Output,ok:bool)->Value {
    assert_eq!(output.status.success(),ok,"{} / {}",String::from_utf8_lossy(&output.stdout),String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).unwrap()
}

fn complete(value:&Value) {
    assert_eq!(value["status"],"completed");assert_eq!(value["artifact"]["text"],fixture::FINAL);
    assert_eq!(value["agents"].as_array().unwrap().len(),5);
    assert_eq!(value["usage"]["spent"]["model_calls"],14);
    assert_eq!(value["usage"]["spent"]["tool_calls"],11);
    assert_eq!(value["usage"]["limits"]["wall_ms"],570000);
    assert_eq!(value["usage"]["protected"]["wall_ms"],28500);
    assert_eq!(value["orchestration"]["recursive_delegation"],true);
    assert_eq!(value["orchestration"]["hierarchy"]["observed_depth"],2);
    assert_eq!(value["orchestration"]["dormant_workers"],json!(["idle"]));
    assert_eq!(value["artifact_contract_verified"],true);
    for field in ["semantic_truth_verified","promotable","external_effects_authorized"] { assert_eq!(value[field],false); }
    for protocol in ["EVIDENCE","CONTINUITY","MORPH","OMEGA","GQWF","SYNAPSE","ALLOSTASIS"] {
        assert!(value["protocols"].as_array().unwrap().iter().any(|item|item==protocol));
    }
}

#[test]
fn hierarchical_cli_uses_three_levels_two_parallel_branches_and_a_second_idle_process() {
    let _guard=serial();let f=Fixture::new(Mode::Tree);let id=uuid::Uuid::new_v4().to_string();
    let first=parse(command(&f,&id).output().unwrap(),true);complete(&first);
    assert_eq!(f.provider.calls(),14);
    assert_eq!(f.provider.arrivals()["intermediate"],2);assert_eq!(f.provider.arrivals()["leaf"],2);
    assert_eq!(first["parallelism"]["peak_active_step_workers"],2);
    let replay=parse(command(&f,&id).output().unwrap(),true);complete(&replay);
    assert_eq!(f.provider.calls(),14);assert_eq!(replay["parallelism"]["waves_prepared"],0);
    for field in ["binding","agents","usage","artifact","publication","orchestration"] { assert_eq!(first[field],replay[field]); }
}

#[test]
fn an_extended_deadline_does_not_admit_a_flat_or_static_source_profile() {
    let _guard=serial();let f=Fixture::new(Mode::Tree);
    let original:Value=serde_json::from_slice(&std::fs::read(&f.config_path).unwrap()).unwrap();
    let mut flat=original.clone();
    flat["agents"].as_array_mut().unwrap().retain(|agent|agent["id"]=="leaf_right" || agent["id"]=="root");
    flat["orchestration"].as_object_mut().unwrap().remove("hierarchy");
    flat["orchestration"]["max_delegations"]=1.into();flat["limits"]["wall_ms"]=170000.into();
    let mut fixed=flat.clone();fixed.as_object_mut().unwrap().remove("orchestration");
    fixed["agents"][1]["tools"]=json!(["write_artifact"]);fixed["agents"][1]["depends_on"]=json!(["leaf_right"]);
    for config in [flat,fixed] {
        std::fs::write(&f.config_path,serde_json::to_vec(&config).unwrap()).unwrap();
        let output=command(&f,&uuid::Uuid::new_v4().to_string()).output().unwrap();
        assert!(!output.status.success());assert!(String::from_utf8_lossy(&output.stderr).contains("AGENTIC_DEADLINE_INVALID"));
        assert_eq!(f.provider.calls(),0);assert!(!f.database.exists());
    }
}

#[test]
fn a_leaf_unknown_blocks_its_ancestry_and_a_fresh_process_does_not_redispatch() {
    let _guard=serial();let f=Fixture::new(Mode::UnknownLeafLeft);let id=uuid::Uuid::new_v4().to_string();
    let first=parse(command(&f,&id).output().unwrap(),false);
    assert_eq!(first["status"],"unresolved");assert!(first["publication"].is_null());
    assert_eq!(first["usage"]["unknown_operations"],1);
    assert!(first["usage"]["held"]["tokens"].as_u64().unwrap()>0);
    assert_eq!(f.provider.calls(),5);
    assert_eq!(f.provider.requests().iter().filter(|request|fixture::agent_id(request)=="root").count(),1);
    let replay=parse(command(&f,&id).output().unwrap(),false);
    assert_eq!(replay["status"],"unresolved");assert_eq!(f.provider.calls(),5);
    assert_eq!(replay["usage"],first["usage"]);assert_eq!(replay["parallelism"]["waves_prepared"],0);
}

#[test]
fn hierarchy_cycles_depth_and_unauthorized_leaf_grants_are_refused_before_any_http() {
    let _guard=serial();let f=Fixture::new(Mode::Tree);
    let original:Value=serde_json::from_slice(&std::fs::read(&f.config_path).unwrap()).unwrap();
    let mut cycle=original.clone();cycle["orchestration"]["hierarchy"]["parents"]["mid_left"]="leaf_left".into();
    let mut depth=original.clone();depth["orchestration"]["hierarchy"]["max_depth"]=1.into();
    let mut grant=original;grant["agents"][0]["tools"]=json!(["delegate_task"]);
    for config in [cycle,depth,grant] {
        std::fs::write(&f.config_path,serde_json::to_vec(&config).unwrap()).unwrap();
        let output=command(&f,&uuid::Uuid::new_v4().to_string()).output().unwrap();
        assert!(!output.status.success());assert_eq!(f.provider.calls(),0);assert!(!f.database.exists());
    }
}

#[test]
fn corrupting_a_grandchild_return_refuses_publication_replay_without_new_http() {
    let _guard=serial();let f=Fixture::new(Mode::Tree);let id=uuid::Uuid::new_v4().to_string();
    let first=parse(command(&f,&id).output().unwrap(),true);complete(&first);
    let binding:Binding=serde_json::from_value(first["binding"].clone()).unwrap();
    let child=first["agents"].as_array().unwrap().iter().find(|item|item["agent_id"]=="leaf_left").unwrap();
    let receiver=digest(&(&binding,"agentic-receiver","leaf_left","mid_left")).unwrap();
    let db=rusqlite::Connection::open(&f.database).unwrap();
    assert_eq!(db.execute("UPDATE protocol_gqwf_objects SET bytes=X'00' WHERE store_id=?1 AND hash=?2",
        rusqlite::params![receiver,child["result_hash"].as_str().unwrap()]).unwrap(),1);drop(db);
    let output=command(&f,&id).output().unwrap();assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stdout).contains("AGENTIC_EXCHANGE_OBJECT_CORRUPT"));
    assert_eq!(f.provider.calls(),14);
}
