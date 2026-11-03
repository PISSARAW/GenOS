use super::super::agentic_ledger::StepKey;
use serde::{Deserialize,Serialize};

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct WaveMember {
    pub key:StepKey,pub request_hash:String,pub context_hash:String,pub actor_id:String,pub intent_hash:String,
}

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct WaveDescriptor {
    pub wave_id:String,pub binding_hash:String,pub opened_ms:u64,pub members:Vec<WaveMember>,pub descriptor_hash:String,
}

#[derive(Clone,Debug)]
pub struct WaveHandle { pub(super) descriptor:WaveDescriptor,pub(super) keys:Vec<StepKey> }
impl WaveHandle {
    pub fn wave_id(&self)->&str { &self.descriptor.wave_id }
    pub fn keys(&self)->&[StepKey] { &self.keys }
}

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct ClosedStep {
    pub key:StepKey,pub model_hash:String,pub tool_receipt_hashes:Vec<String>,pub completion_hash:Option<String>,
}

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct WaveReceipt {
    pub wave_id:String,pub binding_hash:String,pub descriptor_hash:String,pub revision:u64,pub status:String,
    pub observations:Vec<ClosedStep>,pub error:Option<String>,pub settled_ms:u64,
    pub previous_receipt_hash:Option<String>,pub receipt_hash:String,
}
impl WaveReceipt { pub fn is_joined(&self)->bool { self.status=="joined" } }

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct WaveProof { pub descriptor:WaveDescriptor,pub receipt:WaveReceipt,pub history:Vec<WaveReceipt> }

pub(super) fn handle(descriptor:WaveDescriptor)->WaveHandle {
    WaveHandle { keys:descriptor.members.iter().map(|member|member.key.clone()).collect(),descriptor }
}
