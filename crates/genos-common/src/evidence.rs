//! Shared evidence lifecycle: provenance, promotion, signatures and replay.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

pub const EVIDENCE_SCHEMA: &str = "genos.evidence-envelope/v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EvidenceState {
    Synthetic,
    Observed,
    Verified,
    Rejected,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvidenceEnvelope {
    pub schema: String,
    pub evidence_id: Uuid,
    pub state: EvidenceState,
    pub source_id: String,
    pub capture_id: String,
    pub input: Value,
    pub output: Value,
    pub input_digest: String,
    pub output_digest: String,
    pub replay_key: String,
    pub created_at_epoch_ms: u64,
    pub signer_id: Option<String>,
    pub signature_hex: Option<String>,
    pub verification_ref: Option<String>,
    pub rejection_reason: Option<String>,
}

#[derive(Clone, Debug)]
pub struct EvidenceDraft {
    pub source_id: String,
    pub capture_id: String,
    pub input: Value,
    pub output: Value,
    pub state: EvidenceState,
    pub replay_key: String,
    pub created_at_epoch_ms: u64,
}

#[derive(Clone, Debug)]
pub struct EvidencePromotion {
    pub target: EvidenceState,
    pub verifier_id: Option<String>,
    pub verification_ref: Option<String>,
    pub rejection_reason: Option<String>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EvidenceError {
    #[error("evidence schema is invalid")]
    Schema,
    #[error("evidence field is empty or too long: {0}")]
    Field(String),
    #[error("evidence state transition is invalid")]
    Transition,
    #[error("evidence digest mismatch")]
    Digest,
    #[error("rejection reason is required")]
    RejectionReason,
    #[error("verification identity and reference are required")]
    Verification,
    #[error("signature is invalid")]
    Signature,
}

pub fn create_envelope(draft: EvidenceDraft) -> Result<EvidenceEnvelope, EvidenceError> {
    validate_text(&draft.source_id, "source_id", 256)?;
    validate_text(&draft.capture_id, "capture_id", 256)?;
    validate_text(&draft.replay_key, "replay_key", 512)?;
    if draft.created_at_epoch_ms == 0 {
        return Err(EvidenceError::Field("created_at_epoch_ms".into()));
    }
    let envelope = EvidenceEnvelope {
        schema: EVIDENCE_SCHEMA.into(),
        evidence_id: Uuid::new_v4(),
        state: draft.state,
        source_id: draft.source_id,
        capture_id: draft.capture_id,
        input_digest: digest_json(&draft.input),
        output_digest: digest_json(&draft.output),
        input: draft.input,
        output: draft.output,
        replay_key: draft.replay_key,
        created_at_epoch_ms: draft.created_at_epoch_ms,
        signer_id: None,
        signature_hex: None,
        verification_ref: None,
        rejection_reason: None,
    };
    validate_envelope(&envelope)?;
    Ok(envelope)
}

pub fn validate_envelope(envelope: &EvidenceEnvelope) -> Result<(), EvidenceError> {
    if envelope.schema != EVIDENCE_SCHEMA {
        return Err(EvidenceError::Schema);
    }
    validate_text(&envelope.source_id, "source_id", 256)?;
    validate_text(&envelope.capture_id, "capture_id", 256)?;
    validate_text(&envelope.replay_key, "replay_key", 512)?;
    if envelope.created_at_epoch_ms == 0
        || envelope.input_digest != digest_json(&envelope.input)
        || envelope.output_digest != digest_json(&envelope.output)
    {
        return Err(EvidenceError::Digest);
    }
    match envelope.state {
        EvidenceState::Rejected if envelope.rejection_reason.is_none() => {
            Err(EvidenceError::RejectionReason)
        }
        EvidenceState::Rejected => Ok(()),
        _ if envelope.rejection_reason.is_some() => Err(EvidenceError::RejectionReason),
        _ => Ok(()),
    }
}

pub fn promote(
    envelope: &EvidenceEnvelope,
    promotion: EvidencePromotion,
) -> Result<EvidenceEnvelope, EvidenceError> {
    validate_envelope(envelope)?;
    validate_transition(envelope.state, promotion.target)?;
    validate_promotion(&promotion)?;
    let mut promoted = envelope.clone();
    promoted.state = promotion.target;
    promoted.signer_id = promotion.verifier_id.or_else(|| envelope.signer_id.clone());
    promoted.verification_ref = promotion
        .verification_ref
        .or_else(|| envelope.verification_ref.clone());
    promoted.rejection_reason = rejection_reason(promotion.target, promotion.rejection_reason);
    validate_envelope(&promoted)?;
    Ok(promoted)
}

fn validate_transition(current: EvidenceState, target: EvidenceState) -> Result<(), EvidenceError> {
    let allowed = matches!(
        (current, target),
        (
            EvidenceState::Synthetic,
            EvidenceState::Observed | EvidenceState::Rejected
        ) | (
            EvidenceState::Observed,
            EvidenceState::Verified | EvidenceState::Rejected
        ) | (EvidenceState::Verified, EvidenceState::Rejected)
    );
    match allowed {
        true => Ok(()),
        false => Err(EvidenceError::Transition),
    }
}

fn validate_promotion(promotion: &EvidencePromotion) -> Result<(), EvidenceError> {
    if promotion.target == EvidenceState::Verified {
        validate_text(
            promotion.verifier_id.as_deref().unwrap_or_default(),
            "verifier_id",
            256,
        )?;
        validate_text(
            promotion.verification_ref.as_deref().unwrap_or_default(),
            "verification_ref",
            512,
        )?;
    }
    if promotion.target == EvidenceState::Rejected && promotion.rejection_reason.is_none() {
        return Err(EvidenceError::RejectionReason);
    }
    Ok(())
}

fn rejection_reason(target: EvidenceState, reason: Option<String>) -> Option<String> {
    if target == EvidenceState::Rejected {
        reason
    } else {
        None
    }
}

pub fn sign(
    envelope: &EvidenceEnvelope,
    signer_id: String,
    key: &SigningKey,
) -> Result<EvidenceEnvelope, EvidenceError> {
    validate_envelope(envelope)?;
    validate_text(&signer_id, "signer_id", 256)?;
    let mut signed = envelope.clone();
    signed.signer_id = Some(signer_id);
    signed.signature_hex = Some(hex_encode(&key.sign(&signing_bytes(&signed)).to_bytes()));
    Ok(signed)
}

pub fn verify_signature(
    envelope: &EvidenceEnvelope,
    key: &VerifyingKey,
) -> Result<(), EvidenceError> {
    validate_envelope(envelope)?;
    if envelope.signer_id.is_none() {
        return Err(EvidenceError::Signature);
    }
    let signature = envelope
        .signature_hex
        .as_deref()
        .ok_or(EvidenceError::Signature)?;
    let bytes = hex_decode(signature).ok_or(EvidenceError::Signature)?;
    let signature = Signature::from_slice(&bytes).map_err(|_| EvidenceError::Signature)?;
    key.verify(&signing_bytes(envelope), &signature)
        .map_err(|_| EvidenceError::Signature)
}

pub fn replay_matches(
    envelope: &EvidenceEnvelope,
    input: &Value,
    output: &Value,
) -> Result<bool, EvidenceError> {
    validate_envelope(envelope)?;
    Ok(
        envelope.input_digest == digest_json(input)
            && envelope.output_digest == digest_json(output),
    )
}

pub fn digest_json(value: &Value) -> String {
    format!(
        "sha256:{:x}",
        Sha256::digest(canonical_json(value).as_bytes())
    )
}

fn signing_bytes(envelope: &EvidenceEnvelope) -> Vec<u8> {
    let mut unsigned = envelope.clone();
    unsigned.signature_hex = None;
    canonical_json(&serde_json::to_value(unsigned).expect("evidence serialization is infallible"))
        .into_bytes()
}

fn canonical_json(value: &Value) -> String {
    match value {
        Value::Array(values) => format!(
            "[{}]",
            values
                .iter()
                .map(canonical_json)
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(map) => {
            let mut keys: Vec<_> = map.keys().collect();
            keys.sort();
            format!(
                "{{{}}}",
                keys.iter()
                    .map(|key| format!(
                        "{}:{}",
                        serde_json::to_string(key).unwrap(),
                        canonical_json(&map[*key])
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        _ => serde_json::to_string(value).expect("JSON scalar serialization is infallible"),
    }
}

fn validate_text(value: &str, field: &str, max: usize) -> Result<(), EvidenceError> {
    if value.is_empty() || value.len() > max {
        return Err(EvidenceError::Field(field.into()));
    }
    Ok(())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn hex_decode(value: &str) -> Option<Vec<u8>> {
    if value.len() % 2 != 0 {
        return None;
    }
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn envelope() -> EvidenceEnvelope {
        create_envelope(EvidenceDraft {
            source_id: "adapter".into(),
            capture_id: "capture".into(),
            input: json!({"b": 2, "a": 1}),
            output: json!({"ok": true}),
            state: EvidenceState::Synthetic,
            replay_key: "replay-1".into(),
            created_at_epoch_ms: 1,
        })
        .unwrap()
    }

    fn transition(target: EvidenceState) -> EvidencePromotion {
        EvidencePromotion {
            target,
            verifier_id: None,
            verification_ref: None,
            rejection_reason: None,
        }
    }

    #[test]
    fn lifecycle_rejects_unproven_promotion_and_accepts_verified_path() {
        let observed = promote(&envelope(), transition(EvidenceState::Observed)).unwrap();
        let verified = promote(
            &observed,
            EvidencePromotion {
                target: EvidenceState::Verified,
                verifier_id: Some("verifier".into()),
                verification_ref: Some("check-1".into()),
                rejection_reason: None,
            },
        )
        .unwrap();
        assert!(promote(&verified, transition(EvidenceState::Observed)).is_err());
        assert!(replay_matches(&verified, &verified.input, &verified.output).unwrap());
    }

    #[test]
    fn promotion_requires_verification_and_rejection_evidence() {
        let observed = promote(&envelope(), transition(EvidenceState::Observed)).unwrap();
        assert_eq!(
            promote(&observed, transition(EvidenceState::Verified)).unwrap_err(),
            EvidenceError::Field("verifier_id".into())
        );
        assert_eq!(
            promote(&observed, transition(EvidenceState::Rejected)).unwrap_err(),
            EvidenceError::RejectionReason
        );
    }

    #[test]
    fn signed_receipt_detects_tampering() {
        let key = SigningKey::from_bytes(&[7u8; 32]);
        let signed = sign(&envelope(), "signer".into(), &key).unwrap();
        assert!(verify_signature(&signed, &key.verifying_key()).is_ok());
        let mut tampered = signed.clone();
        tampered.output = json!({"ok": false});
        assert_eq!(
            verify_signature(&tampered, &key.verifying_key()),
            Err(EvidenceError::Digest)
        );
    }
}
