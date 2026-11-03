use super::*;
use crate::mission_protocols::{agentic_context,agentic_exchange,agentic_parallel_journal};
use genos_api::native_inference::ToolInferenceRequest;
use serde_json::{Value,json};
use std::io::Write;
use std::sync::{Arc,atomic::{AtomicUsize,Ordering}};

mod fixture {
    use crate as genos_orchestrator;
    include!("../../tests/helpers/agentic_ledger_fixture.rs");
}

const TEXT:&str="Sources: selected snapshot. Limites: structural contract only.";

struct Prepared { key:StepKey,request:ToolInferenceRequest,permit:ModelPermit }

fn parallel_fixture(tokens:u64) -> fixture::Pending {
    let mut f=fixture::with_config(|mut config| {
        config["max_parallel_agents"]=2.into();config["limits"]["tokens"]=tokens.into();
        let reader=config["agents"][0].clone();let mut author=config["agents"][1].clone();
        author["depends_on"]=json!(["reader","peer"]);
        config["agents"]=json!([reader,{"id":"peer","instruction":"Inspect independently",
            "tools":["read_source"],"max_turns":3},author]);config
    });
    agentic_exchange::receive(&mut f.store,&f.binding,"peer").unwrap();f
}

fn keys() -> Vec<StepKey> {
    ["reader","peer"].into_iter().map(|id|StepKey { agent_id:id.into(),turn:0 }).collect()
}

fn prepare_wave(f:&mut fixture::Pending, keys:&[StepKey]) -> Result<Vec<Prepared>,String> {
    let binding=f.binding.clone();let ceiling=f.spec.config.turn_timeout_ms;
    f.store.transaction(&binding,|tx| {
        agentic_parallel_journal::require_idle_or_recover_in(tx,&binding)?;
        let capacity=dispatch_capacity_in(tx,&binding)?;
        let count=u64::try_from(keys.len()).map_err(|error|error.to_string())?;
        let window=capacity.wall_ms.checked_div(count).ok_or("empty wave")?.min(ceiling);
        let prepared=prepare_members(tx,&binding,(keys,window))?;
        agentic_parallel_journal::begin_in(tx,&binding,keys)?;
        Ok(prepared)
    })
}

fn prepare_members(tx:&rusqlite::Transaction<'_>, binding:&Binding, input:(&[StepKey],u64)) -> Result<Vec<Prepared>,String> {
    let mut result=Vec::new();
    for key in input.0 {
        let request=agentic_context::prepare_bounded_in(tx,binding,&agentic_context::ContextRequest { key,max_wall_ms:input.1 })?;
        let admission=prepare_model_in(tx,binding,&ModelIntent { key:key.clone(),request:&request,max_wall_ms:input.1 })?;
        let ModelAdmission::Fresh(permit)=admission else { return Err("fresh wave required".into()); };
        result.push(Prepared { key:key.clone(),request,permit });
    }
    Ok(result)
}

fn counts(f:&fixture::Pending) -> (u64,u64,u64) {
    let db=rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    db.query_row("SELECT (SELECT count(*) FROM agentic_models),(SELECT count(*) FROM protocol_agentic_contexts),
        (SELECT count(*) FROM rust_protocol_events)",[],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap()
}

fn burst(f:&fixture::Pending, prepared:Vec<Prepared>, reply:(bool,Value)) -> Vec<(StepKey,Result<ModelRecord,DispatchError>)> {
    let listener=f.listener.as_ref().unwrap().try_clone().unwrap();let counter=f.requests.clone();
    let server=std::thread::spawn(move ||serve_pair(listener,reply,counter));
    let mut threads=Vec::new();
    for entry in prepared {
        let path=f.directory.path().join("ledger.sqlite");let binding=f.binding.clone();
        threads.push(std::thread::spawn(move || {
            let mut store=Store::open(&path).unwrap();
            let outcome=dispatch_model(&mut store,&binding,ModelDispatch { permit:entry.permit,request:&entry.request });
            (entry.key,outcome)
        }));
    }
    let result=threads.into_iter().map(|thread|thread.join().unwrap()).collect();
    server.join().unwrap().unwrap();result
}

fn serve_pair(listener:std::net::TcpListener, reply:(bool,Value), counter:Arc<AtomicUsize>) -> Result<(),String> {
    let mut streams=Vec::new();
    for _ in 0..2 {
        let mut stream=fixture::accept(&listener)?;stream.set_nonblocking(false).map_err(|error|error.to_string())?;
        stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).map_err(|error|error.to_string())?;
        fixture::read_request(&mut stream)?;counter.fetch_add(1,Ordering::SeqCst);streams.push(stream);
    }
    // Both native requests must arrive before either receives a response.
    std::thread::sleep(std::time::Duration::from_millis(150));
    let bytes=serde_json::to_vec(&reply.1).map_err(|error|error.to_string())?;
    for (index,mut stream) in streams.into_iter().enumerate() {
        write_response(&mut stream,&bytes,reply.0 && index==1)?;
    }
    Ok(())
}

fn write_response(stream:&mut std::net::TcpStream, bytes:&[u8], incomplete:bool) -> Result<(),String> {
    let length=bytes.len()+if incomplete { 16 } else { 0 };
    let header=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n");
    stream.write_all(header.as_bytes()).map_err(|error|error.to_string())?;
    stream.write_all(bytes).map_err(|error|error.to_string())
}

#[test]
fn default_parallelism_is_one_and_explicit_limits_are_bound_to_the_config() {
    let f=parallel_fixture(50000);
    let mut wire=serde_json::to_value(&f.spec.config).unwrap();wire.as_object_mut().unwrap().remove("max_parallel_agents");
    let sequential:crate::mission_protocols::agentic_spec::AgenticConfig=serde_json::from_value(wire).unwrap();
    assert_eq!(sequential.max_parallel_agents,1);sequential.validate().unwrap();
    assert_ne!(digest(&sequential).unwrap(),digest(&f.spec.config).unwrap());
    for value in [0,4,5] {
        let mut config=f.spec.config.clone();config.max_parallel_agents=value;assert!(config.validate().is_err());
    }
}

#[test]
fn independent_branches_are_ready_but_a_missing_dependency_never_is() {
    let mut f=parallel_fixture(50000);let binding=f.binding.clone();
    f.store.transaction(&binding,|tx| {
        for key in keys() { agents::eligible(tx,&binding,&key)?; }
        assert!(agents::eligible(tx,&binding,&StepKey { agent_id:"author".into(),turn:0 }).is_err());Ok(())
    }).unwrap();
}

#[test]
fn second_member_budget_failure_rolls_back_contexts_intents_events_and_reservations() {
    let mut f=parallel_fixture(4000);let before=counts(&f);let pool=state(&mut f.store,&f.binding).unwrap();
    assert!(prepare_wave(&mut f,&keys()).err().unwrap().contains("BUDGET_UNAVAILABLE"));
    assert_eq!(counts(&f),before);assert_eq!(state(&mut f.store,&f.binding).unwrap(),pool);
    for key in keys() { assert!(known_model(&mut f.store,&f.binding,&key).unwrap().is_none()); }
    assert_eq!(f.requests.load(Ordering::SeqCst),0);
}

#[test]
fn parallel_native_observations_charge_the_shared_pool_once_and_reopen_as_known() {
    let mut f=parallel_fixture(50000);let prepared=prepare_wave(&mut f,&keys()).unwrap();
    let held=state(&mut f.store,&f.binding).unwrap().held;
    assert_eq!((held.tokens,held.model_calls,held.wall_ms),(4608,2,40000));
    for key in keys() { assert!(known_model(&mut f.store,&f.binding,&key).is_err()); }
    for (_,result) in burst(&f,prepared,(false,fixture::response(TEXT))) { result.unwrap(); }
    let pool=state(&mut f.store,&f.binding).unwrap();
    assert_eq!((pool.spent.tokens,pool.spent.model_calls),(80,2));assert!(pool.spent.wall_ms>=300);
    assert_eq!(pool.held,Amounts::default());assert_eq!(pool.unknown_operations,0);
    let mut restored=Store::open(&f.directory.path().join("ledger.sqlite")).unwrap();
    for key in keys() { assert!(known_model(&mut restored,&f.binding,&key).unwrap().is_some()); }
    assert_eq!(state(&mut restored,&f.binding).unwrap(),pool);assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

#[test]
fn a_parallel_unknown_keeps_its_full_exposure_while_its_known_sibling_is_accounted() {
    let mut f=parallel_fixture(50000);let prepared=prepare_wave(&mut f,&keys()).unwrap();
    let results=burst(&f,prepared,(true,fixture::response(TEXT)));
    assert_eq!(results.iter().filter(|(_,result)|result.is_ok()).count(),1);
    let pool=state(&mut f.store,&f.binding).unwrap();
    assert_eq!((pool.spent.tokens,pool.spent.model_calls,pool.unknown_operations),(80,2,1));
    assert_eq!((pool.held.tokens,pool.held.model_calls,pool.held.wall_ms),(2304,1,20000));
    let binding=f.binding.clone();assert!(f.store.transaction(&binding,|tx|dispatch_capacity_in(tx,&binding)).is_err());
    for (key,result) in results {
        assert_eq!(known_model(&mut f.store,&binding,&key).is_ok(),result.is_ok());
    }
    assert!(release(&mut f.store,&binding).is_err());assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

#[test]
fn known_native_usage_overrun_refuses_new_capacity_without_erasing_the_debt() {
    let mut f=parallel_fixture(50000);let prepared=prepare_wave(&mut f,&keys()).unwrap();
    let mut response=fixture::response(TEXT);response["prompt_eval_count"]=24000.into();
    for (_,result) in burst(&f,prepared,(false,response)) { result.unwrap(); }
    let pool=state(&mut f.store,&f.binding).unwrap();
    assert_eq!(pool.spent.tokens,48046);assert!(pool.overrun && pool.debt_tokens()>0);
    assert_eq!(pool.held,Amounts::default());let binding=f.binding.clone();
    assert!(f.store.transaction(&binding,|tx|dispatch_capacity_in(tx,&binding)).is_err());
    assert_eq!(state(&mut f.store,&binding).unwrap(),pool);assert_eq!(f.requests.load(Ordering::SeqCst),2);
}
