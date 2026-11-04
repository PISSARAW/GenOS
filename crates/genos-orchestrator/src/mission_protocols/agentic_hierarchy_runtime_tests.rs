use super::*;

fn hierarchical() -> fixture::Pending {
    fixture::with_config(|mut config| {
        config["max_parallel_agents"]=2.into();
        config["orchestration"]=json!({"coordinator":"reader","max_delegations":3,
            "hierarchy":{"parents":{"manager":"reader","leaf":"manager","spare":"reader"},"max_depth":3,"max_children":2}});
        config["agents"]=json!([
            {"id":"leaf","instruction":"Read the assigned task","tools":["read_source"],"max_turns":3},
            {"id":"manager","instruction":"Delegate to leaf only","tools":["delegate_task"],"max_turns":3},
            {"id":"spare","instruction":"Read the assigned task","tools":["read_source"],"max_turns":3},
            {"id":"reader","instruction":"Coordinate admitted children","tools":["delegate_task","write_artifact"],
                "artifact_names":["draft"],"max_turns":4}]);config
    })
}

#[test]
fn dormant_intermediates_cannot_activate_a_child_and_wrong_parent_is_denied() {
    let mut f=hierarchical();let binding=f.binding.clone();
    assert!(f.store.transaction(&binding,|tx|require_parent_active_in(tx,&binding,"manager")).is_err());
    assert!(agentic_context::prepare(&mut f.store,&binding,&StepKey { agent_id:"manager".into(),turn:0 }).is_err());
    run(&mut f,delegation("leaf"));
    let receipts=agentic_tools::execute(&mut f.store,&binding,&f.key).unwrap();
    assert_eq!(receipts[0].output()["error"]["code"],"AGENTIC_DELEGATION_PARENT_NOT_PERMITTED");
    f.store.transaction(&binding,|tx| { assert!(all_in(tx,&binding)?.is_empty());Ok(()) }).unwrap();
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn hierarchy_waits_for_direct_children_and_keeps_grandchildren_out_of_root_prefix() {
    let mut f=hierarchical();let root_key=f.key.clone();
    let original=genos_api::native_inference::tool_request_hash(&f.request).unwrap();
    run(&mut f,delegation("manager"));f.prepare_step("manager",0);
    run(&mut f,delegation("leaf"));let binding=f.binding.clone();
    f.store.transaction(&binding,|tx| {
        let root=StepKey { agent_id:"reader".into(),turn:1 };let manager=StepKey { agent_id:"manager".into(),turn:1 };
        assert_eq!(before_in(tx,&binding,&root)?.iter().map(|a|a.worker_id.as_str()).collect::<Vec<_>>(),vec!["manager"]);
        assert_eq!(before_in(tx,&binding,&manager)?.iter().map(|a|a.worker_id.as_str()).collect::<Vec<_>>(),vec!["leaf"]);
        assert!(!eligible_in(tx,&binding,&root)?);assert!(!eligible_in(tx,&binding,&manager)?);
        assert!(before_in(tx,&binding,&StepKey { agent_id:"leaf".into(),turn:0 })?.is_empty());Ok(())
    }).unwrap();
    let replay=agentic_context::prepare(&mut f.store,&binding,&root_key).unwrap();
    assert_eq!(genos_api::native_inference::tool_request_hash(&replay).unwrap(),original);
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

#[test]
fn hierarchical_delegation_requires_a_future_parent_turn_but_flat_remains_compatible() {
    let mut f=hierarchical();
    f.spec.config.agents.last_mut().unwrap().max_turns=1;
    assert!(!return_turn_available(&f.spec,&f.key).unwrap());
    f.spec.config.orchestration.as_mut().unwrap().hierarchy=None;
    assert!(return_turn_available(&f.spec,&f.key).unwrap());
    let mut last=fixture::with_config(|mut config| {
        config["max_parallel_agents"]=2.into();
        config["orchestration"]=json!({"coordinator":"reader","max_delegations":1,
            "hierarchy":{"parents":{"worker":"reader"},"max_depth":1,"max_children":1}});
        config["agents"]=json!([
            {"id":"worker","instruction":"Read","tools":["read_source"],"max_turns":2},
            {"id":"reader","instruction":"Delegate","tools":["delegate_task"],"max_turns":1}]);config
    });
    run(&mut last,delegation("worker"));let binding=last.binding.clone();
    let receipts=agentic_tools::execute(&mut last.store,&binding,&last.key).unwrap();
    assert_eq!(receipts[0].output()["error"]["code"],"AGENTIC_DELEGATION_RETURN_TURN_REQUIRED");
    last.store.transaction(&binding,|tx| { assert!(all_in(tx,&binding)?.is_empty());Ok(()) }).unwrap();
}
