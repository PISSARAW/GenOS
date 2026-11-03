use genos_api::native_inference::{Finish, InferenceFailure, InferenceRequest, ModelObservation};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub struct InferenceIntent<'a> { pub request: &'a InferenceRequest, pub max_wall_ms: u64 }

#[derive(Debug)]
pub struct DispatchPermit { pub(super) request_hash: String, pub(super) binding_hash: String }

#[derive(Debug)]
pub enum DispatchAdmission { Fresh(DispatchPermit), Completed(ObservedArtifact), Unknown }

pub struct Dispatch<'a> { pub permit: DispatchPermit, pub request: &'a InferenceRequest }

#[derive(Debug)]
pub enum DispatchError { Guard(String), Transport(InferenceFailure) }

impl std::fmt::Display for DispatchError {
    fn fmt(&self, output: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self { Self::Guard(message) => output.write_str(message), Self::Transport(error) => error.fmt(output) }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ObservedArtifact {
    pub operation_id: String, pub binding_hash: String, pub context_hash: String, pub actor_id: String,
    pub input_hash: String, pub request_hash: String, pub provider_config_hash: String,
    pub response_hash: String, pub observation_hash: String, pub result_hash: String,
    pub output: Vec<u8>, #[serde(with="finish_value")] pub finish: Finish,
    pub elapsed_ms: u64, pub usage_known: bool, pub native_receipt: Value,
}

impl ObservedArtifact {
    pub(super) fn capture(observation: &ModelObservation) -> Result<Self,String> {
        Ok(Self { operation_id:observation.operation_id().into(),binding_hash:observation.binding_hash().into(),
            context_hash:observation.context_hash().into(),actor_id:observation.actor_id().into(),input_hash:observation.input_hash().into(),
            request_hash:observation.request_hash().into(),provider_config_hash:observation.provider_config_hash().into(),
            response_hash:observation.response_hash().into(),observation_hash:observation.receipt_hash().into(),
            result_hash:super::super::raw_hash(observation.output()),output:observation.output().to_vec(),finish:observation.finish(),
            elapsed_ms:observation.elapsed_ms(),usage_known:observation.usage().is_some(),
            native_receipt:serde_json::to_value(observation).map_err(|error| error.to_string())? })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(super) struct StoredIntent { pub descriptor: Value, pub request_hash: String, pub max_wall_ms: u64 }

mod finish_value {
    use super::Finish;
    use serde::{Deserialize, Serialize, Serializer, Deserializer, de::Error};
    pub fn serialize<S:Serializer>(value: &Finish, output:S) -> Result<S::Ok,S::Error> { value.serialize(output) }
    pub fn deserialize<'de,D:Deserializer<'de>>(input:D) -> Result<Finish,D::Error> {
        match String::deserialize(input)?.as_str() {
            "complete" => Ok(Finish::Complete), "truncated" => Ok(Finish::Truncated), "refused" => Ok(Finish::Refused),
            "tool_requested" => Ok(Finish::ToolRequested), "incomplete" => Ok(Finish::Incomplete),
            _ => Err(D::Error::custom("invalid persisted finish")),
        }
    }
}
