use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

pub const SCHEMA: &str = "genos.gcir.omega/v1";
const KINDS: [&str; 6] = ["READ", "SELECT", "CALL", "INFER", "CHECK", "EMIT"];

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
    if envelope.schema != SCHEMA || envelope.version != 1 || envelope.id.is_empty() {
        return Err("invalid Omega schema, version or id".into());
    }
    if envelope.operations.is_empty() || envelope.operations.len() > 64 {
        return Err("Omega operation count is outside the canonical bounds".into());
    }
    let mut ids = HashSet::new();
    for operation in &envelope.operations {
        if operation.0.is_empty() || !KINDS.contains(&operation.1.as_str()) {
            return Err("invalid Omega operation".into());
        }
        if !ids.insert(operation.0.clone()) {
            return Err("duplicate Omega operation id".into());
        }
    }
    Ok(())
}

pub fn decode(bytes: &[u8]) -> Result<OmegaEnvelope, String> {
    let wire: OmegaWire = rmp_serde::from_slice(bytes).map_err(|error| error.to_string())?;
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
            .map_err(|error| error.to_string())?,
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
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{decode, encode, OmegaEnvelope, OmegaOperation};
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
}
