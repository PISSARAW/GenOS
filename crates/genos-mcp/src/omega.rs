use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

pub const SCHEMA: &str = "genos.gcir.omega/v1";
pub const SUPPORTED_VERSIONS: [u8; 1] = [1];
const KINDS: [&str; 6] = ["READ", "SELECT", "CALL", "INFER", "CHECK", "EMIT"];

pub const ERROR_SCHEMA_UNSUPPORTED: &str = "omega.schema_unsupported";
pub const ERROR_VERSION_UNSUPPORTED: &str = "omega.version_unsupported";
pub const ERROR_ENVELOPE_INVALID: &str = "omega.envelope_invalid";
pub const ERROR_OPERATION_INVALID: &str = "omega.operation_invalid";
pub const ERROR_DUPLICATE_OPERATION: &str = "omega.duplicate_operation";
pub const ERROR_FRAME_INVALID: &str = "omega.frame_invalid";
pub const ERROR_PAYLOAD_INVALID: &str = "omega.payload_invalid";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OmegaEnvelope {
    pub schema: String,
    pub version: u8,
    pub id: String,
    pub operations: Vec<OmegaOperation>,
    pub policy: Vec<(String, Vec<String>)>,
    pub payload: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OmegaOperation(
    pub String,
    pub String,
    pub Option<String>,
    pub Vec<String>,
    pub String,
);

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
struct OmegaWire(
    pub String,
    pub u8,
    pub String,
    pub Vec<OmegaOperation>,
    pub Vec<(String, Vec<String>)>,
    pub Option<String>,
);

pub fn validate(envelope: &OmegaEnvelope) -> Result<(), String> {
    if envelope.schema != SCHEMA {
        return Err(ERROR_SCHEMA_UNSUPPORTED.into());
    }
    if !SUPPORTED_VERSIONS.contains(&envelope.version) {
        return Err(ERROR_VERSION_UNSUPPORTED.into());
    }
    if envelope.id.is_empty() {
        return Err(ERROR_ENVELOPE_INVALID.into());
    }
    if envelope.operations.is_empty() || envelope.operations.len() > 64 {
        return Err(ERROR_ENVELOPE_INVALID.into());
    }
    let mut ids = HashSet::new();
    for operation in &envelope.operations {
        if operation.0.is_empty() || !KINDS.contains(&operation.1.as_str()) {
            return Err(ERROR_OPERATION_INVALID.into());
        }
        if !ids.insert(operation.0.clone()) {
            return Err(ERROR_DUPLICATE_OPERATION.into());
        }
    }
    Ok(())
}

pub fn decode(bytes: &[u8]) -> Result<OmegaEnvelope, String> {
    let wire: OmegaWire =
        rmp_serde::from_slice(bytes).map_err(|_| ERROR_FRAME_INVALID.to_string())?;
    let envelope = OmegaEnvelope {
        schema: wire.0,
        version: wire.1,
        id: wire.2,
        operations: wire.3,
        policy: wire.4,
        payload: wire
            .5
            .map(|value| serde_json::from_str(&value))
            .transpose()
            .map_err(|_| ERROR_PAYLOAD_INVALID.to_string())?,
    };
    validate(&envelope)?;
    Ok(envelope)
}

pub fn encode(envelope: &OmegaEnvelope) -> Result<Vec<u8>, String> {
    validate(envelope)?;
    let payload = envelope
        .payload
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| error.to_string())?;
    rmp_serde::to_vec(&OmegaWire(
        envelope.schema.clone(),
        envelope.version,
        envelope.id.clone(),
        envelope.operations.clone(),
        envelope.policy.clone(),
        payload,
    ))
    .map_err(|_| ERROR_FRAME_INVALID.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        decode, encode, validate, OmegaEnvelope, OmegaOperation, ERROR_FRAME_INVALID,
        ERROR_VERSION_UNSUPPORTED,
    };
    use serde_json::{json, Value};

    fn fixture() -> OmegaEnvelope {
        OmegaEnvelope {
            schema: super::SCHEMA.into(),
            version: 1,
            id: "vector-1".into(),
            operations: vec![
                OmegaOperation(
                    "read".into(),
                    "READ".into(),
                    Some("repo".into()),
                    vec![],
                    "satisfied".into(),
                ),
                OmegaOperation(
                    "check".into(),
                    "CHECK".into(),
                    Some("test".into()),
                    vec!["read".into()],
                    "open".into(),
                ),
            ],
            policy: vec![
                ("check".into(), vec!["test".into()]),
                ("read".into(), vec!["repo".into()]),
            ],
            payload: Some(json!({"domain": "interop", "n": 1})),
        }
    }

    #[test]
    fn shared_vector_decodes_and_round_trips() {
        let vectors: Value =
            serde_json::from_str(include_str!("../../../spec/g-cir-omega-vectors.json"))
                .expect("vectors json");
        let vector = vectors["vectors"][0]["messagePackHex"]
            .as_str()
            .expect("vector hex");
        let bytes = hex::decode(vector).expect("vector hex");
        let decoded = decode(&bytes).expect("canonical Omega vector");
        assert_eq!(decoded, fixture());
        assert_eq!(encode(&decoded).expect("re-encode"), bytes);
    }

    #[test]
    fn compatibility_matrix_and_error_codes_are_stable() {
        let matrix: Value =
            serde_json::from_str(include_str!("../../../spec/g-cir-omega-compatibility.json"))
                .expect("compatibility matrix");
        assert_eq!(matrix["supportedVersions"][0], 1);
        assert_eq!(
            validate(&OmegaEnvelope {
                version: 2,
                ..fixture()
            }),
            Err(ERROR_VERSION_UNSUPPORTED.into())
        );
        assert_eq!(decode(&[0]), Err(ERROR_FRAME_INVALID.into()));
        assert_eq!(
            decode(&[0xc6, 0, 0, 0, 1, 0]),
            Err(ERROR_FRAME_INVALID.into())
        );
    }

    #[test]
    fn bounded_mutations_never_panic() {
        let source = encode(&fixture()).expect("fixture encoding");
        for index in 0..256 {
            let mut mutated = source.clone();
            let offset = index % mutated.len();
            mutated[offset] ^= (index as u8).wrapping_mul(37).max(1);
            let _ = decode(&mutated);
        }
    }
}
