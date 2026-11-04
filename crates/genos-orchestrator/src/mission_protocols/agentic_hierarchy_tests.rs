use super::*;
use crate::mission_protocols::agentic_spec::{AgentConfig,HierarchyConfig,ToolKind};
use serde_json::json;

fn config() -> AgenticConfig {
    serde_json::from_value(json!({"schema":"genos.rust-agentic-config/v1",
        "provider":{"kind":"ollama","address":"127.0.0.1:11434","model":"fixture","generation":1},
        "generation":{"max_output_tokens":256,"temperature_milli":0},"max_parallel_agents":2,
        "agents":[
            {"id":"leaf","instruction":"Read","tools":["read_source"],"max_turns":3},
            {"id":"manager","instruction":"Delegate","tools":["delegate_task"],"max_turns":3},
            {"id":"spare","instruction":"Read","tools":["read_source"],"max_turns":3},
            {"id":"root","instruction":"Coordinate","tools":["delegate_task"],"max_turns":3}],
        "orchestration":{"coordinator":"root","max_delegations":3,
            "hierarchy":{"parents":{"leaf":"manager","manager":"root","spare":"root"},"max_depth":3,"max_children":2}},
        "contract":{"min_bytes":1,"max_bytes":8192,"required":[],"forbidden":[],"semantic_requirements":[]},
        "limits":{"tokens":100000,"model_calls":32,"tool_calls":32,"wall_ms":120000},
        "max_input_tokens":2048,"turn_timeout_ms":20000})).unwrap()
}

fn tree(config:&mut AgenticConfig) -> &mut HierarchyConfig {
    config.orchestration.as_mut().unwrap().hierarchy.as_mut().unwrap()
}

#[test]
fn fixed_tree_has_exact_parents_depths_and_delegation_grants() {
    let config=config();config.validate().unwrap();let mode=config.orchestration.unwrap();
    assert_eq!(mode.depth("root").unwrap(),0);assert_eq!(mode.depth("manager").unwrap(),1);
    assert_eq!(mode.depth("leaf").unwrap(),2);assert!(mode.depth("unknown").is_err());
    assert!(mode.permits("manager","leaf"));assert!(!mode.permits("root","leaf"));
    assert!(!mode.permits("leaf","root"));assert!(!mode.permits("root","root"));
    assert!(mode.can_delegate("root"));assert!(mode.can_delegate("manager"));assert!(!mode.can_delegate("leaf"));
}

#[test]
fn coverage_unknown_parent_cycles_and_disconnected_trees_are_rejected() {
    let base=config();
    let mut value=base.clone();tree(&mut value).parents.remove("leaf");assert!(value.validate().is_err());
    value=base.clone();tree(&mut value).parents.insert("outsider".into(),"root".into());assert!(value.validate().is_err());
    value=base.clone();tree(&mut value).parents.insert("leaf".into(),"outsider".into());assert!(value.validate().is_err());
    value=base.clone();tree(&mut value).parents.insert("manager".into(),"leaf".into());assert!(value.validate().is_err());
    value=base.clone();tree(&mut value).parents.insert("leaf".into(),"leaf".into());assert!(value.validate().is_err());
    value=base;tree(&mut value).parents.insert("root".into(),"manager".into());assert!(value.validate().is_err());
}

#[test]
fn depth_fanout_and_fixed_configuration_bounds_are_enforced() {
    let base=config();
    let mut value=base.clone();tree(&mut value).max_depth=1;assert!(value.validate().is_err());
    value=base.clone();tree(&mut value).max_children=1;assert!(value.validate().is_err());
    for invalid in [0,5] {
        value=base.clone();tree(&mut value).max_depth=invalid;assert!(value.validate().is_err());
        value=base.clone();tree(&mut value).max_children=invalid;assert!(value.validate().is_err());
    }
    value=base;value.agents[0].depends_on.push("manager".into());assert!(value.validate().is_err());
}

#[test]
fn grants_are_explicit_and_cannot_be_inherited_from_the_parent() {
    let base=config();
    let mut value=base.clone();value.agents[1].tools.clear();assert!(value.validate().is_err());
    value=base.clone();value.agents[0].tools.push(ToolKind::DelegateTask);assert!(value.validate().is_err());
    value=base;value.agents[3].tools.clear();assert!(value.validate().is_err());
}

#[test]
fn hierarchy_expands_only_the_preadmitted_pool_not_parallelism() {
    let mut value=config();
    for id in ["a","b","c","d"] {
        value.agents.insert(0,AgentConfig { id:id.into(),instruction:"Read".into(),depends_on:vec![],
            tools:vec![ToolKind::ReadSource],artifact_names:vec![],max_turns:2 });
        tree(&mut value).parents.insert(id.into(),"manager".into());
    }
    tree(&mut value).parents.insert("d".into(),"spare".into());
    value.agents.iter_mut().find(|agent|agent.id=="spare").unwrap().tools.push(ToolKind::DelegateTask);
    tree(&mut value).max_children=4;value.orchestration.as_mut().unwrap().max_delegations=7;
    value.max_parallel_agents=4;value.validate().unwrap();
    value.max_parallel_agents=5;assert!(value.validate().is_err());
    value.max_parallel_agents=4;value.orchestration.as_mut().unwrap().hierarchy=None;
    assert!(value.validate().is_err());
}

#[test]
fn omitted_hierarchy_preserves_the_existing_flat_wire_commitment() {
    let raw=json!({"coordinator":"root","max_delegations":2});
    let mode:OrchestrationConfig=serde_json::from_value(raw.clone()).unwrap();
    assert!(mode.hierarchy.is_none());assert_eq!(serde_json::to_value(&mode).unwrap(),raw);
    assert!(mode.can_delegate("root"));assert!(!mode.can_delegate("manager"));
    assert!(mode.permits("root","worker"));assert!(!mode.permits("manager","worker"));
}

fn flat_config() -> AgenticConfig {
    let mut config=config();config.orchestration.as_mut().unwrap().hierarchy=None;
    config.agents[1].tools=vec![ToolKind::ReadSource];config
}

fn static_config() -> AgenticConfig {
    let mut config=flat_config();config.orchestration=None;
    config.agents.last_mut().unwrap().tools=vec![ToolKind::ReadSource];
    for index in 1..config.agents.len() {
        config.agents[index].depends_on=vec![config.agents[index-1].id.clone()];
    }
    config
}

fn specification(config:AgenticConfig, timeout_ms:u64) -> crate::mission_protocols::agentic_spec::AgenticSpec {
    use crate::mission_protocols::{agentic_source::SourceData,agentic_spec::AgenticSpec,raw_hash};
    let source=SourceData { schema:"genos.rust-agentic-sources/v1".into(),config_path:"agentic.json".into(),
        config_hash:raw_hash(serde_json::to_string(&config).unwrap().as_bytes()),
        config_text:serde_json::to_string(&config).unwrap(),documents:vec![] };
    AgenticSpec { schema:crate::mission_protocols::agentic_spec::SCHEMA.into(),mission_id:uuid::Uuid::new_v4().to_string(),
        workspace:std::env::current_dir().unwrap(),mission:"Bounded structural contract".into(),config,
        source_hash:raw_hash(&serde_json::to_vec(&source).unwrap()),source,timeout_ms,env_hash:raw_hash(b"test-host") }
}

#[test]
fn hierarchical_mission_budget_and_lease_can_reach_six_hundred_seconds() {
    let mut config=config();config.limits.wall_ms=600000;config.turn_timeout_ms=180000;
    assert_eq!(config.max_mission_ms(),600000);config.validate().unwrap();
    config.validate_mission_timeout(600000).unwrap();specification(config,600000).validate().unwrap();
}

#[test]
fn hierarchy_rejects_budget_or_mission_duration_above_six_hundred_seconds() {
    let mut config=config();config.limits.wall_ms=600000;
    assert!(config.validate_mission_timeout(600001).is_err());
    assert!(specification(config.clone(),600001).validate().is_err());
    config.limits.wall_ms=600001;assert!(config.validate().is_err());
    assert!(specification(config,600000).validate().is_err());
}

#[test]
fn flat_and_static_missions_keep_their_original_one_hundred_eighty_second_bound() {
    for mut config in [flat_config(),static_config()] {
        assert_eq!(config.max_mission_ms(),180000);config.validate().unwrap();
        config.validate_mission_timeout(180000).unwrap();
        assert!(config.validate_mission_timeout(180001).is_err());
        assert!(specification(config.clone(),600000).validate().is_err());
        config.limits.wall_ms=180001;assert!(config.validate().is_err());
    }
}

#[test]
fn expanded_missions_never_expand_a_native_http_turn_past_one_hundred_eighty_seconds() {
    let mut config=config();config.limits.wall_ms=600000;
    config.turn_timeout_ms=180000;config.validate().unwrap();
    config.turn_timeout_ms=180001;assert!(config.validate().is_err());
    config.turn_timeout_ms=600000;assert!(specification(config,600000).validate().is_err());
}

#[test]
fn mission_duration_still_bounds_aggregate_wall_budget_and_the_minimum_lease() {
    let mut config=config();config.limits.wall_ms=500000;
    assert!(config.validate_mission_timeout(499999).is_err());
    assert!(specification(config.clone(),499999).validate().is_err());
    config.limits.wall_ms=0;assert!(config.validate_mission_timeout(999).is_err());
    assert!(specification(config,999).validate().is_err());
}
