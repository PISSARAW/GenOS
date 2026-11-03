use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Limits { pub tokens: u64, pub model_calls: u64, pub wall_ms: u64 }

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Exposure {
    pub operation_id: String, pub request_hash: String, pub max_input_tokens: u64,
    pub max_output_tokens: u64, pub max_wall_ms: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct Amounts { pub tokens: u64, pub model_calls: u64, pub wall_ms: u64 }

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct State {
    pub limits: Limits, pub protected: Amounts, pub spent: Amounts, pub held: Amounts,
    pub overrun: bool, pub accounting_overflow: bool, pub released: bool, pub unknown_operations: u64,
}

impl State {
    pub fn debt_tokens(&self) -> u64 { self.spent.tokens.saturating_sub(self.limits.tokens.saturating_sub(self.protected.tokens)) }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(super) struct Exposed {
    pub mission_id: String, pub run_id: String, pub binding_hash: String, pub input: Exposure,
    pub status: String, pub observation_hash: Option<String>, pub accounted: bool,
}
