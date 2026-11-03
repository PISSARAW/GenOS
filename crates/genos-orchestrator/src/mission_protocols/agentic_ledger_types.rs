use super::super::{agentic_spec::AgenticLimits, Binding};
use genos_api::native_inference::{Finish, ToolCall, ToolInferenceRequest};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct StepKey { pub agent_id:String, pub turn:u32 }

impl StepKey {
    pub fn operation_id(&self) -> String { format!("agent/{}/turn/{}",self.agent_id,self.turn) }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct Amounts { pub tokens:u64, pub model_calls:u64, pub tool_calls:u64, pub wall_ms:u64 }

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct MissionState {
    pub limits:AgenticLimits, pub protected:Amounts, pub spent:Amounts, pub held:Amounts,
    pub unknown_operations:u64, pub overrun:bool, pub accounting_overflow:bool, pub released:bool,
}

impl MissionState {
    pub fn debt_tokens(&self) -> u64 {
        self.spent.tokens.saturating_sub(self.limits.tokens.saturating_sub(self.protected.tokens))
    }
}

pub struct ModelIntent<'a> { pub key:StepKey, pub request:&'a ToolInferenceRequest, pub max_wall_ms:u64 }

#[derive(Debug)]
pub struct ModelPermit {
    pub(super) key:StepKey, pub(super) binding_hash:String,
    pub(super) request_hash:String, pub(super) nonce:String,
}

#[derive(Debug)]
pub enum ModelAdmission { Fresh(ModelPermit), Known(ModelRecord), Unknown }

pub struct ModelDispatch<'a> { pub permit:ModelPermit, pub request:&'a ToolInferenceRequest }

#[derive(Debug)]
pub enum DispatchError { Guard(String), Transport(String) }

impl std::fmt::Display for DispatchError {
    fn fmt(&self, formatter:&mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self { Self::Guard(value)|Self::Transport(value)=>formatter.write_str(value) }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct ModelRecord {
    pub key:StepKey, pub binding_hash:String, pub actor_id:String,
    pub request_hash:String, pub context_hash:String, pub input_hash:String,
    pub provider_config_hash:String, pub observation_hash:String, pub result_hash:String,
    pub text:String, pub tool_calls:Vec<ToolCall>, pub finish:Finish, pub usage_known:bool,
    pub native_receipt:Value, pub model_hash:String, pub record_hash:String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct CompletedAgent {
    pub agent_id:String, pub last_turn:u32, pub text:String, pub observation_hash:String,
    pub result_hash:String, pub completion_hash:String, pub binding_hash:String,
}

pub struct AgentCompletion {
    pub agent_id:String, pub last_turn:u32, pub text:String, pub observation_hash:String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct ToolIntent {
    pub agent_id:String, pub turn:u32, pub call_index:u32, pub request_hash:String, pub max_wall_ms:u64,
}

impl ToolIntent {
    pub fn operation_id(&self) -> String { format!("tool/{}/{}/{}",self.agent_id,self.turn,self.call_index) }
}

pub enum ToolAdmission { Fresh, Known { receipt_hash:String }, Unknown }
pub struct ToolCost { pub intent:ToolIntent, pub receipt_hash:String, pub elapsed_ms:u64 }

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(super) struct StoredIntent {
    pub key:StepKey, pub binding_hash:String, pub request_hash:String,
    pub descriptor:Value, pub max_wall_ms:u64, pub nonce:String,
}

pub(super) fn binding_key(binding:&Binding) -> &str { &binding.run_id }
