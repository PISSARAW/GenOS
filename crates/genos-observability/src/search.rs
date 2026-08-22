use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    sync::{Arc, RwLock},
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CorrelatedTrace {
    pub trace_id: String,
    pub run_id: String,
    pub agent_id: String,
    pub node_id: Option<String>,
    pub tool_name: Option<String>,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub cost_usd: f64,
    #[serde(default)]
    pub attributes: BTreeMap<String, String>,
    pub message: String,
}

#[derive(Clone, Default)]
pub struct TraceSearchIndex {
    records: Arc<RwLock<Vec<CorrelatedTrace>>>,
}
impl TraceSearchIndex {
    pub fn insert(&self, trace: CorrelatedTrace) {
        self.records
            .write()
            .expect("trace index lock poisoned")
            .push(trace);
    }
    pub fn search(&self, text: &str) -> Vec<CorrelatedTrace> {
        let query = text.to_lowercase();
        self.records
            .read()
            .expect("trace index lock poisoned")
            .iter()
            .filter(|trace| searchable(trace).contains(&query))
            .cloned()
            .collect()
    }
    pub fn for_run(&self, run_id: &str) -> Vec<CorrelatedTrace> {
        self.records
            .read()
            .expect("trace index lock poisoned")
            .iter()
            .filter(|trace| trace.run_id == run_id)
            .cloned()
            .collect()
    }
    pub fn total_cost(&self, run_id: &str) -> f64 {
        self.for_run(run_id)
            .iter()
            .map(|trace| trace.cost_usd)
            .sum()
    }
    pub fn total_tokens(&self, run_id: &str) -> u64 {
        self.for_run(run_id)
            .iter()
            .map(|trace| trace.prompt_tokens + trace.completion_tokens)
            .sum()
    }
}
fn searchable(trace: &CorrelatedTrace) -> String {
    format!(
        "{} {} {} {} {} {}",
        trace.run_id,
        trace.agent_id,
        trace.node_id.as_deref().unwrap_or_default(),
        trace.tool_name.as_deref().unwrap_or_default(),
        trace.message,
        trace
            .attributes
            .values()
            .cloned()
            .collect::<Vec<_>>()
            .join(" ")
    )
    .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn indexes_text_and_aggregates_usage_by_run() {
        let index = TraceSearchIndex::default();
        index.insert(CorrelatedTrace {
            trace_id: "t".into(),
            run_id: "run".into(),
            agent_id: "agent".into(),
            node_id: Some("retrieve".into()),
            tool_name: Some("qdrant".into()),
            prompt_tokens: 12,
            completion_tokens: 3,
            cost_usd: 0.02,
            attributes: BTreeMap::new(),
            message: "retrieval succeeded".into(),
        });
        assert_eq!(index.search("qdrant").len(), 1);
        assert_eq!(index.total_tokens("run"), 15);
        assert_eq!(index.total_cost("run"), 0.02);
    }
}
