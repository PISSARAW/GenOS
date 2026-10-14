use super::{HgtLeaseAuthority, HgtLeaseRequest, HgtReceiptMaterial, HgtTransferLease};
use ed25519_dalek::{Signature, Verifier};
use genos_biology::{HgtTransferReport, Plasmid};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

pub(super) fn build_hgt_receipt(material: HgtReceiptMaterial<'_>) -> Result<Value, String> {
    let lease = material.lease;
    Ok(json!({
        "schema": "genos.hgt-transfer-receipt/v1",
        "idempotency_key": idempotency_key(&lease.request),
        "lease": lease.request,
        "lease_signature": lease.signature,
        "mission_id": lease.request.mission_id,
        "lease_id": lease.request.lease_id,
        "issuer_id": lease.request.issuer_id,
        "donor_id": lease.request.donor_id,
        "recipient_id": lease.request.recipient_id,
        "plasmid_id": lease.request.plasmid_id,
        "report": material.report,
        "plasmid": material.plasmid,
        "outcome": "TRANSFERRED",
    }))
}

pub(super) fn verify_hgt_receipt(
    receipt: &Value,
    authority: &HgtLeaseAuthority,
    lease: &HgtTransferLease,
) -> Result<(), String> {
    verify_lease_signature(&lease.request, &lease.signature, authority)?;
    if receipt_identity_matches(receipt, lease) && receipt_effect_matches(receipt, lease) {
        Ok(())
    } else {
        Err("Reçu HGT absent ou divergent".to_string())
    }
}

fn receipt_identity_matches(receipt: &Value, lease: &HgtTransferLease) -> bool {
    let request = &lease.request;
    let expected = [
        ("schema", json!("genos.hgt-transfer-receipt/v1")),
        ("idempotency_key", json!(idempotency_key(request))),
        ("lease", json!(request)),
        ("lease_signature", json!(lease.signature)),
        ("mission_id", json!(request.mission_id.to_string())),
        ("lease_id", json!(request.lease_id)),
        ("issuer_id", json!(request.issuer_id)),
        ("donor_id", json!(request.donor_id)),
        ("recipient_id", json!(request.recipient_id)),
        ("plasmid_id", json!(request.plasmid_id)),
    ];
    expected.iter().all(|(field, value)| receipt[*field] == *value)
}

fn receipt_effect_matches(receipt: &Value, lease: &HgtTransferLease) -> bool {
    let request = &lease.request;
    let plasmid: Result<Plasmid, _> = serde_json::from_value(receipt["plasmid"].clone());
    let report: Result<HgtTransferReport, _> = serde_json::from_value(receipt["report"].clone());
    receipt["outcome"] == "TRANSFERRED"
        && receipt["plasmid"]["plasmid_id"] == request.plasmid_id
        && plasmid.ok().and_then(|value| plasmid_digest(&value).ok())
            == Some(request.plasmid_digest.clone())
        && report.ok().is_some_and(|value| {
            value.donor_id == request.donor_id
                && value.recipient_id == request.recipient_id
                && value.transferred_plasmid_id == request.plasmid_id
                && value.horizontal_transfer_success
                && value.pilus_connection_latency_ms.is_finite()
                && value.pilus_connection_latency_ms >= 0.0
                && ["HGT_TRANSFER_SIMULATED", "PLASMID_ALREADY_PRESENT"].contains(&value.status.as_str())
        })
}

pub(super) fn verify_lease_signature(
    request: &HgtLeaseRequest,
    signature_hex: &str,
    authority: &HgtLeaseAuthority,
) -> Result<(), String> {
    let key = authority.trusted_issuers.get(&request.issuer_id)
        .ok_or_else(|| "Émetteur HGT non approuvé".to_string())?;
    let signature_bytes = decode_hex(signature_hex)?;
    let signature = Signature::from_slice(&signature_bytes).map_err(|error| error.to_string())?;
    key.verify(&request.signing_bytes()?, &signature)
        .map_err(|_| "Signature du lease HGT invalide".to_string())
}

pub(super) fn idempotency_key(request: &HgtLeaseRequest) -> String {
    format!("{}:{}:{}", request.mission_id, request.issuer_id, request.nonce)
}

pub(super) fn validate_request(request: &HgtLeaseRequest) -> Result<(), String> {
    if request.lease_id.trim().is_empty()
        || request.issuer_id.trim().is_empty()
        || request.donor_id.trim().is_empty()
        || request.recipient_id.trim().is_empty()
        || request.plasmid_id.trim().is_empty()
        || request.plasmid_digest.trim().is_empty()
        || request.nonce.trim().is_empty()
    {
        return Err("Lease HGT incomplet".to_string());
    }
    Ok(())
}

pub fn plasmid_digest(plasmid: &Plasmid) -> Result<String, String> {
    let encoded = serde_json::to_vec(plasmid).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

pub(super) fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 {
        return Err("Hex Ed25519 HGT invalide".to_string());
    }
    (0..value.len()).step_by(2).map(|index| {
        u8::from_str_radix(&value[index..index + 2], 16).map_err(|error| error.to_string())
    }).collect()
}

pub(super) fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::{plasmid_digest, receipt_effect_matches};
    use crate::hgt_runtime::{HgtLeaseRequest, HgtTransferLease};
    use genos_biology::Plasmid;
    use serde_json::json;

    #[test]
    fn report_fields_are_validated_before_receipt_replay() {
        let plasmid = Plasmid {
            plasmid_id: "p-report".into(),
            skill_name: "signal-filter".into(),
            executable_payload: "DATA_ONLY".into(),
            resistance_marker: "test".into(),
            copy_number: 1,
        };
        let request = HgtLeaseRequest {
            lease_id: "lease-report".into(),
            issuer_id: "issuer-report".into(),
            mission_id: uuid::Uuid::new_v4(),
            donor_id: "donor-report".into(),
            recipient_id: "recipient-report".into(),
            plasmid_id: plasmid.plasmid_id.clone(),
            plasmid_digest: plasmid_digest(&plasmid).unwrap(),
            nonce: "nonce-report".into(),
            expires_at_unix_ms: u128::MAX,
        };
        let lease = HgtTransferLease { request, signature: String::new(), active: false };
        let receipt = json!({
            "outcome": "TRANSFERRED",
            "plasmid": plasmid,
            "report": {
                "donor_id": "donor-report",
                "recipient_id": "recipient-report",
                "transferred_plasmid_id": "p-report",
                "pilus_connection_latency_ms": 0.0,
                "horizontal_transfer_success": true,
                "status": "HGT_TRANSFER_SIMULATED"
            }
        });

        assert!(receipt_effect_matches(&receipt, &lease));
        for (field, forged) in [
            ("status", json!("UNVERIFIED_SUCCESS")),
            ("horizontal_transfer_success", json!(false)),
            ("pilus_connection_latency_ms", json!(-1.0)),
        ] {
            let mut tampered = receipt.clone();
            tampered["report"][field] = forged;
            assert!(!receipt_effect_matches(&tampered, &lease), "accepted altered {field}");
        }
    }
}
