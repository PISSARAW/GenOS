use super::{AgentConfig, AgenticConfig, AgenticSpec, ToolKind};
use crate::mission_protocols::{digest, raw_hash};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn specification(spec:&AgenticSpec) -> Result<(),String> {
    uuid::Uuid::parse_str(&spec.mission_id).map_err(|_|"AGENTIC_MISSION_ID_INVALID")?;
    if spec.schema!=super::SCHEMA || spec.mission.trim().is_empty() || spec.mission.len()>16384 {
        return Err("AGENTIC_MISSION_INVALID".into());
    }
    spec.config.validate_mission_timeout(spec.timeout_ms)?;
    configuration(&spec.config)?;
    sources(spec)
}

fn sources(spec:&AgenticSpec) -> Result<(),String> {
    let data=&spec.source;
    if data.schema!="genos.rust-agentic-sources/v1" || data.config_text.len()>65536 {
        return Err("AGENTIC_SOURCE_CONFIGURATION_SIZE_INVALID".into());
    }
    if raw_hash(data.config_text.as_bytes())!=data.config_hash {
        return Err("AGENTIC_SOURCE_CONFIGURATION_HASH_INVALID".into());
    }
    crate::mission_protocols::agentic_source::selected(&data.config_path)?;
    validate_source_documents(spec, data)?;
    validate_source_hash(spec)
}

fn validate_source_documents(spec:&AgenticSpec, data:&crate::mission_protocols::agentic_source::SourceData) -> Result<(),String> {
    let config:AgenticConfig=serde_json::from_str(&data.config_text).map_err(error)?;
    if config!=spec.config || data.documents.len()!=config.documents.len() {
        return Err("AGENTIC_SOURCE_CONFIGURATION_CHANGED".into());
    }
    for (document,path) in data.documents.iter().zip(&config.documents) {
        if &document.path!=path || document.text.len()>65536 || raw_hash(document.text.as_bytes())!=document.hash {
            return Err("AGENTIC_SOURCE_DOCUMENT_CHANGED".into());
        }
    }
    Ok(())
}

fn validate_source_hash(spec:&AgenticSpec) -> Result<(),String> {
    let bytes=serde_json::to_vec(&spec.source).map_err(error)?;
    if bytes.len()>1_048_576 || raw_hash(&bytes)!=spec.source_hash || !hash(&spec.env_hash) {
        return Err("AGENTIC_SOURCE_OR_ENVIRONMENT_HASH_INVALID".into());
    }
    Ok(())
}

fn hash(value:&str) -> bool { value.len()==64 && value.bytes().all(|byte|byte.is_ascii_hexdigit()) }

pub(super) fn configuration(config:&AgenticConfig) -> Result<(),String> {
    if config.schema!=super::CONFIG_SCHEMA || !(2..=agent_limit(config)).contains(&config.agents.len()) || config.documents.len()>16 {
        return Err("AGENTIC_CONFIG_SCHEMA_OR_SIZE_INVALID".into());
    }
    genos_api::native_inference::validate_provider(&config.provider)?;
    config.generation.validate()?;
    config.contract.validate()?;
    parallelism(config)?;
    topology(config)?;
    documents(&config.documents)?;
    budgets(config)
}

fn parallelism(config:&AgenticConfig) -> Result<(),String> {
    if !(1..=4).contains(&config.max_parallel_agents) || config.max_parallel_agents as usize>config.agents.len() {
        return Err("AGENTIC_PARALLELISM_LIMIT_INVALID".into());
    }
    Ok(())
}

fn topology(config:&AgenticConfig) -> Result<(),String> {
    if let Some(orchestration)=&config.orchestration { return orchestration_graph(config,orchestration); }
    if config.agents.iter().any(|agent|agent.tools.contains(&ToolKind::DelegateTask)) {
        return Err("AGENTIC_DELEGATION_PROFILE_REQUIRED".into());
    }
    graph(&config.agents)
}

fn orchestration_graph(config:&AgenticConfig, mode:&super::OrchestrationConfig) -> Result<(),String> {
    orchestration_limits(config,mode)?;
    super::hierarchy::validate(config,mode)?;
    let mut ids=BTreeSet::new();
    for agent in &config.agents {
        agent_valid(agent)?;
        if !ids.insert(&agent.id) || !agent.depends_on.is_empty() {
            return Err("AGENTIC_ORCHESTRATION_GRAPH_INVALID".into());
        }
        delegation_grant(agent,mode)?;
    }
    Ok(())
}

fn orchestration_limits(config:&AgenticConfig, mode:&super::OrchestrationConfig) -> Result<(),String> {
    let coordinator=config.agents.last().ok_or("AGENTIC_COORDINATOR_REQUIRED")?;
    if config.max_parallel_agents<2 || coordinator.id!=mode.coordinator
        || mode.max_delegations==0 || mode.max_delegations as usize>=config.agents.len() {
        return Err("AGENTIC_ORCHESTRATION_LIMIT_INVALID".into());
    }
    Ok(())
}

fn delegation_grant(agent:&AgentConfig, mode:&super::OrchestrationConfig) -> Result<(),String> {
    if agent.tools.contains(&ToolKind::DelegateTask)!=mode.can_delegate(&agent.id) {
        return Err("AGENTIC_COORDINATOR_DELEGATION_PERMISSION_REQUIRED".into());
    }
    Ok(())
}

fn documents(paths:&[String]) -> Result<(),String> {
    let mut seen=BTreeSet::new();
    for path in paths {
        crate::mission_protocols::agentic_source::selected(path)?;
        let key=if cfg!(windows) { path.to_ascii_lowercase() } else { path.clone() };
        if !seen.insert(key) { return Err("AGENTIC_DUPLICATE_SOURCE".into()); }
    }
    Ok(())
}

fn graph(agents:&[AgentConfig]) -> Result<(),String> {
    let mut ancestors:BTreeMap<String,BTreeSet<String>>=BTreeMap::new();
    for agent in agents {
        agent_valid(agent)?;
        if ancestors.contains_key(&agent.id) { return Err("AGENTIC_DUPLICATE_AGENT".into()); }
        let parents=dependencies(agent,&ancestors)?;
        ancestors.insert(agent.id.clone(),parents);
    }
    let last=agents.last().ok_or("AGENTIC_AGENT_REQUIRED")?;
    if ancestors[&last.id].len()!=agents.len()-1 { return Err("AGENTIC_FINAL_AGENT_MUST_CONSUME_ALL_PREDECESSORS".into()); }
    Ok(())
}

fn dependencies(agent:&AgentConfig, known:&BTreeMap<String,BTreeSet<String>>) -> Result<BTreeSet<String>,String> {
    let mut parents=BTreeSet::new();
    let mut direct=BTreeSet::new();
    for dependency in &agent.depends_on {
        if !direct.insert(dependency) { return Err("AGENTIC_DUPLICATE_DEPENDENCY".into()); }
        parents.extend(known.get(dependency).ok_or("AGENTIC_DEPENDENCY_NOT_PREVIOUSLY_INSTALLED")?.iter().cloned());
        parents.insert(dependency.clone());
    }
    Ok(parents)
}

fn agent_valid(agent:&AgentConfig) -> Result<(),String> {
    if !super::valid_name(&agent.id) || agent.instruction.trim().is_empty() || agent.instruction.len()>8192 {
        return Err("AGENTIC_AGENT_ID_OR_INSTRUCTION_INVALID".into());
    }
    if !(1..=8).contains(&agent.max_turns) || agent.tools.len()>5 || agent.artifact_names.len()>16 {
        return Err("AGENTIC_AGENT_LIMIT_INVALID".into());
    }
    if agent.tools.iter().collect::<BTreeSet<_>>().len()!=agent.tools.len() {
        return Err("AGENTIC_DUPLICATE_TOOL".into());
    }
    artifact_grants(agent)
}

fn artifact_grants(agent:&AgentConfig) -> Result<(),String> {
    if !agent.artifact_names.is_empty() && !agent.tools.contains(&ToolKind::WriteArtifact) {
        return Err("AGENTIC_ARTIFACT_WRITE_PERMISSION_REQUIRED".into());
    }
    let mut names=BTreeSet::new();
    for name in &agent.artifact_names {
        if !super::valid_name(name) || !names.insert(name) { return Err("AGENTIC_ARTIFACT_NAME_INVALID".into()); }
    }
    Ok(())
}

fn budgets(config:&AgenticConfig) -> Result<(),String> {
    let limits=&config.limits;
    if limits.tokens>1_000_000_000 || limits.model_calls>64 || limits.tool_calls>256 || limits.wall_ms>config.max_mission_ms() {
        return Err("AGENTIC_BUDGET_TOO_LARGE".into());
    }
    if !(1..=1_000_000).contains(&config.max_input_tokens) || config.turn_timeout_ms<1000 || config.turn_timeout_ms>180000 {
        return Err("AGENTIC_REQUEST_LIMIT_INVALID".into());
    }
    sufficient(config)
}

fn sufficient(config:&AgenticConfig) -> Result<(),String> {
    let limits=&config.limits;
    let demand=config.max_input_tokens.checked_add(config.generation.max_output_tokens).ok_or("AGENTIC_DEMAND_OVERFLOW")?;
    if demand>ordinary(limits.tokens) || config.turn_timeout_ms>ordinary(limits.wall_ms) {
        return Err("AGENTIC_PROTECTED_RESERVE_UNAVAILABLE".into());
    }
    if ordinary(limits.model_calls)<config.agents.len() as u64 || ordinary(limits.tool_calls)<1 {
        return Err("AGENTIC_AGENT_OR_TOOL_QUOTA_TOO_SMALL".into());
    }
    let _=digest(config)?;
    Ok(())
}

fn ordinary(value:u64) -> u64 { value.saturating_sub(value.div_ceil(20)) }
fn error(error:impl std::fmt::Display) -> String { error.to_string() }

fn agent_limit(config:&AgenticConfig) -> usize {
    if config.orchestration.as_ref().is_some_and(|mode|mode.hierarchy.is_some()) { 8 } else { 4 }
}
