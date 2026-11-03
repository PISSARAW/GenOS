use super::super::agentic_ledger::{StepKey,ToolIntent};
use serde::{Deserialize,Serialize};
use serde_json::Value;

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct ObjectRef { pub store_id:String,pub hash:String }

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct ToolResult { pub call_id:String,pub name:String,pub content:String,pub receipt_hash:String }

#[derive(Clone,Debug,Serialize)]
pub struct ToolReceipt { pub(super) core:ToolBody }

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub(super) struct ToolBody {
    pub key:StepKey,pub binding_hash:String,pub actor_id:String,pub call_index:u32,pub call_id:String,pub name:String,
    pub parent_model_hash:String,pub context_hash:String,pub intent:ToolIntent,pub result_hash:String,pub output:Value,
    pub elapsed_ms:u64,pub objects:Vec<ObjectRef>,pub receipt_hash:String,
}

impl ToolReceipt {
    pub fn agent_id(&self)->&str { &self.core.key.agent_id }
    pub fn turn(&self)->u32 { self.core.key.turn }
    pub fn call_index(&self)->u32 { self.core.call_index }
    pub fn call_id(&self)->&str { &self.core.call_id }
    pub fn actor_id(&self)->&str { &self.core.actor_id }
    pub fn parent_model_hash(&self)->&str { &self.core.parent_model_hash }
    pub fn request_hash(&self)->&str { &self.core.intent.request_hash }
    pub fn result_hash(&self)->&str { &self.core.result_hash }
    pub fn output(&self)->&Value { &self.core.output }
    pub fn elapsed_ms(&self)->u64 { self.core.elapsed_ms }
    pub fn receipt_hash(&self)->&str { &self.core.receipt_hash }
    pub fn result(&self)->Result<ToolResult,String> {
        Ok(ToolResult { call_id:self.core.call_id.clone(),name:self.core.name.clone(),
            content:serde_json::to_string(&self.core.output).map_err(|error|error.to_string())?,receipt_hash:self.core.receipt_hash.clone() })
    }
}

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct ArtifactRecord {
    pub mission_id:String,pub agent_id:String,pub name:String,pub store_id:String,pub hash:String,
    pub bytes:u64,pub producer_operation:String,pub producer_receipt_hash:String,
}
