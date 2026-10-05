use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

pub const SCHEMA: &str = "genos.gcir.omega/v1";
pub const SUPPORTED_VERSIONS: [u8; 1] = [1];
pub const READABLE_VERSIONS: [u8; 2] = [0, 1];
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
    if envelope.version == 0 || is_legacy_schema(&envelope.schema) {
        return migrate_legacy(envelope);
    }
    validate(&envelope)?;
    Ok(envelope)
}

fn is_legacy_schema(schema: &str) -> bool {
    schema == "genos.gcir.omega" || schema == "genos.gcir.omega/v0"
}

fn migrate_legacy(mut envelope: OmegaEnvelope) -> Result<OmegaEnvelope, String> {
    if !READABLE_VERSIONS.contains(&envelope.version)
        || (envelope.version != 0 && !is_legacy_schema(&envelope.schema))
    {
        return Err(ERROR_VERSION_UNSUPPORTED.into());
    }
    if envelope.version == 0 && envelope.schema != SCHEMA && !is_legacy_schema(&envelope.schema) {
        return Err(ERROR_SCHEMA_UNSUPPORTED.into());
    }
    envelope.schema = SCHEMA.into();
    envelope.version = 1;
    validate(&envelope)?;
    Ok(envelope)
}

pub fn read_compatible_json(bytes: &[u8]) -> Result<OmegaEnvelope, String> {
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| ERROR_ENVELOPE_INVALID.to_string())?;
    let version = value.get("version").and_then(Value::as_u64).unwrap_or(1) as u8;
    let schema = value
        .get("schema")
        .and_then(Value::as_str)
        .unwrap_or(SCHEMA);
    if version == 0 || is_legacy_schema(schema) {
        let operations = value
            .get("operations")
            .or_else(|| value.get("ops"))
            .and_then(Value::as_array)
            .ok_or(ERROR_ENVELOPE_INVALID)?
            .iter()
            .map(legacy_operation)
            .collect::<Result<Vec<_>, _>>()?;
        let policy = value
            .get("policy")
            .or_else(|| value.get("permissions"))
            .and_then(Value::as_object)
            .map(|items| {
                items
                    .iter()
                    .map(|(key, values)| {
                        let entries = values
                            .as_array()
                            .ok_or(ERROR_ENVELOPE_INVALID)?
                            .iter()
                            .map(|item| item.as_str().unwrap_or_default().to_string())
                            .collect();
                        Ok((key.clone(), entries))
                    })
                    .collect::<Result<Vec<_>, String>>()
            })
            .transpose()?
            .unwrap_or_default();
        let payload = value
            .get("payload")
            .cloned()
            .or_else(|| value.get("context").cloned());
        return migrate_legacy(OmegaEnvelope {
            schema: schema.into(),
            version,
            id: value
                .get("id")
                .or_else(|| value.get("runId"))
                .and_then(Value::as_str)
                .unwrap_or("omega-legacy")
                .into(),
            operations,
            policy,
            payload,
        });
    }
    let operations = value
        .get("operations")
        .and_then(Value::as_array)
        .ok_or(ERROR_ENVELOPE_INVALID)?
        .iter()
        .map(legacy_operation)
        .collect::<Result<Vec<_>, _>>()?;
    let policy = value
        .get("policy")
        .and_then(Value::as_object)
        .map(|items| {
            items
                .iter()
                .map(|(key, values)| {
                    Ok((
                        key.clone(),
                        values
                            .as_array()
                            .ok_or(ERROR_ENVELOPE_INVALID)?
                            .iter()
                            .filter_map(Value::as_str)
                            .map(String::from)
                            .collect(),
                    ))
                })
                .collect::<Result<Vec<_>, String>>()
        })
        .transpose()?
        .unwrap_or_default();
    let envelope = OmegaEnvelope {
        schema: schema.into(),
        version,
        id: value
            .get("id")
            .and_then(Value::as_str)
            .ok_or(ERROR_ENVELOPE_INVALID)?
            .into(),
        operations,
        policy,
        payload: value.get("payload").cloned(),
    };
    validate(&envelope)?;
    Ok(envelope)
}

fn legacy_operation(value: &Value) -> Result<OmegaOperation, String> {
    let text = |key: &str| value.get(key).and_then(Value::as_str).map(String::from);
    let id = text("id")
        .or_else(|| text("name"))
        .ok_or(ERROR_OPERATION_INVALID)?;
    let kind = text("kind")
        .or_else(|| text("type"))
        .ok_or(ERROR_OPERATION_INVALID)?;
    let reference = text("reference").or_else(|| text("ref"));
    let depends_on = value
        .get("dependsOn")
        .or_else(|| value.get("dependencies"))
        .or_else(|| value.get("deps"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    let state = text("state")
        .or_else(|| text("status"))
        .unwrap_or_else(|| "open".into());
    Ok(OmegaOperation(id, kind, reference, depends_on, state))
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
        decode, encode, read_compatible_json, validate, OmegaEnvelope, OmegaOperation,
        ERROR_FRAME_INVALID, ERROR_VERSION_UNSUPPORTED, SCHEMA,
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
        assert_eq!(matrix["readableVersions"][0], 0);
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
    fn legacy_json_is_migrated_to_v1() {
        let legacy = br#"{"version":0,"schema":"genos.gcir.omega/v0","id":"legacy","ops":[{"name":"read","type":"READ","ref":"repo","deps":[],"status":"open"}],"permissions":{"read":["repo"]}}"#;
        let value = read_compatible_json(legacy).expect("legacy envelope");
        assert_eq!(value.schema, SCHEMA);
        assert_eq!(value.version, 1);
        assert_eq!(value.operations[0].2.as_deref(), Some("repo"));
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
