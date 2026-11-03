use super::{AgenticSpec,Binding,Store};
use crate::mission_protocols::agentic_delegation;
use serde_json::{Value,json};

pub(super) fn collect(store:&Store,binding:&Binding,spec:&AgenticSpec)->Result<Option<Value>,String> {
    let Some(config)=&spec.config.orchestration else { return Ok(None); };
    let assignments=agentic_delegation::all_in(&store.connection,binding)?;
    let activated:Vec<&str>=assignments.iter().map(|assignment|assignment.worker_id.as_str()).collect();
    let dormant:Vec<&str>=spec.config.agents.iter().filter(|agent|agent.id!=config.coordinator)
        .map(|agent|agent.id.as_str()).filter(|id|!activated.contains(id)).collect();
    Ok(Some(json!({"schema":"genos.rust-agentic-orchestration-result/v1",
        "coordinator":config.coordinator,"max_delegations":config.max_delegations,
        "activated_workers":activated,"dormant_workers":dormant,"assignments":assignments,
        "worker_creation":"preadmitted_slots","recursive_delegation":false})))
}
