//! Contrôle des transferts horizontaux sous lease mission à usage unique.

use crate::GenosEcosystem;
use genos_biology::{HgtTransferReport, Plasmid, ProkaryoticAgent};
use genos_store::BiologicalReceiptStore;
use sha2::{Digest, Sha256};
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct HgtLeaseRequest {
    pub lease_id: String,
    pub issuer_id: String,
    pub mission_id: Uuid,
    pub donor_id: String,
    pub recipient_id: String,
    pub plasmid_id: String,
    pub expires_at_unix_ms: u128,
}

/// Configuration d'autorité liée au store qui conserve les reçus HGT signés.
pub struct HgtLeaseAuthority<'a> {
    secret: String,
    store: &'a BiologicalReceiptStore,
}

impl<'a> HgtLeaseAuthority<'a> {
    pub fn new(secret: &str, store: &'a BiologicalReceiptStore) -> Result<Self, String> {
        if secret.trim().is_empty() {
            return Err("Secret d'autorité HGT absent".to_string());
        }
        Ok(Self {
            secret: secret.to_string(),
            store,
        })
    }
}

#[derive(Debug)]
pub struct HgtTransferLease {
    request: HgtLeaseRequest,
    signature: String,
    active: bool,
}

pub struct HgtTransferContext<'context, 'store> {
    pub recipient: &'context mut ProkaryoticAgent,
    pub lease: &'context mut HgtTransferLease,
    pub authority: &'context HgtLeaseAuthority<'store>,
}

struct HgtReceiptMaterial<'a> {
    lease: &'a HgtTransferLease,
    report: &'a HgtTransferReport,
    plasmid: &'a Plasmid,
}

impl HgtTransferLease {
    /// Émet un lease lié à l'identité de l'émetteur et au secret d'autorité configuré.
    pub fn grant(
        request: HgtLeaseRequest,
        authority: &HgtLeaseAuthority<'_>,
    ) -> Result<Self, String> {
        validate_request(&request)?;
        if request.expires_at_unix_ms <= now_unix_ms() {
            return Err("Lease HGT déjà expiré".to_string());
        }
        Ok(Self::from_request(request, authority, true))
    }

    /// Reconstitue un lease uniquement si un reçu durable signé existe déjà.
    pub fn resume(
        request: HgtLeaseRequest,
        authority: &HgtLeaseAuthority<'_>,
    ) -> Result<Self, String> {
        validate_request(&request)?;
        let lease = Self::from_request(request, authority, false);
        let receipt = authority
            .store
            .find_idempotent_receipt("genos.hgt-transfer-receipt/v1", &idempotency_key(&lease.request))?
            .ok_or_else(|| "Aucun reçu durable ne permet de reprendre ce lease HGT".to_string())?;
        verify_hgt_receipt(&receipt, &authority.secret, &lease)?;
        Ok(lease)
    }

    fn from_request(
        request: HgtLeaseRequest,
        authority: &HgtLeaseAuthority<'_>,
        active: bool,
    ) -> Self {
        let signature = lease_signature(&request, &authority.secret);
        Self { request, signature, active }
    }

    pub fn revoke(&mut self) {
        self.active = false;
    }

    pub fn is_active(&self) -> bool {
        self.active && self.request.expires_at_unix_ms > now_unix_ms()
    }
}

impl GenosEcosystem {
    /// Refuse explicitement l'ancien chemin non autorisé par lease.
    pub fn hgt_transfer(
        &self,
        _recipient: &mut ProkaryoticAgent,
        _plasmid_id: &str,
    ) -> Result<HgtTransferReport, String> {
        Err("Lease HGT mission requis".to_string())
    }

    /// Révoque un lease et conserve l'événement d'audit local.
    pub fn revoke_hgt_lease(&mut self, lease: &mut HgtTransferLease) {
        lease.revoke();
        self.record_hgt_outcome(lease, "REVOKED");
    }

    /// Transfère et persiste le résultat avant de modifier le receveur.
    /// Un lease déjà enregistré rejoue son reçu et réapplique le plasmide si besoin.
    pub fn hgt_transfer_under_lease(
        &mut self,
        mut transfer: HgtTransferContext<'_, '_>,
    ) -> Result<HgtTransferReport, String> {
        self.validate_hgt_identity(&transfer)?;
        let key = idempotency_key(&transfer.lease.request);
        if let Some(receipt) = transfer.authority.store.find_idempotent_receipt(
            "genos.hgt-transfer-receipt/v1", &key,
        )? {
            return self.replay_hgt_receipt(&mut transfer, receipt);
        }
        self.execute_new_hgt_transfer(&mut transfer)
    }

    fn execute_new_hgt_transfer(
        &mut self,
        transfer: &mut HgtTransferContext<'_, '_>,
    ) -> Result<HgtTransferReport, String> {
        if !transfer.lease.is_active() {
            self.record_hgt_outcome(transfer.lease, "REFUSED");
            return Err("Lease HGT expiré ou révoqué".to_string());
        }
        let receipt = self.prepare_hgt_receipt(transfer)?;
        let persisted = transfer.authority.store.append_idempotent_receipt(&receipt)?;
        verify_hgt_receipt(&persisted, &transfer.authority.secret, transfer.lease)?;
        let persisted_report = serde_json::from_value(persisted["report"].clone())
            .map_err(|error| error.to_string())?;
        self.apply_hgt_receipt(transfer.recipient, &persisted)?;
        transfer.lease.revoke();
        self.record_event("HGT_LEASE_OUTCOME", persisted);
        Ok(persisted_report)
    }

    fn prepare_hgt_receipt(
        &self,
        transfer: &HgtTransferContext<'_, '_>,
    ) -> Result<Value, String> {
        let mut candidate = transfer.recipient.clone();
        let report = self.prokaryote.conjugate_transfer_plasmid(
            &mut candidate,
            &transfer.lease.request.plasmid_id,
        )?;
        let plasmid = candidate
            .plasmids
            .iter()
            .find(|plasmid| plasmid.plasmid_id == transfer.lease.request.plasmid_id)
            .cloned()
            .ok_or_else(|| "Transfert HGT sans plasmide receveur".to_string())?;
        signed_hgt_receipt(
            HgtReceiptMaterial { lease: transfer.lease, report: &report, plasmid: &plasmid },
            &transfer.authority.secret,
        )
    }

    fn validate_hgt_identity(
        &mut self,
        transfer: &HgtTransferContext<'_, '_>,
    ) -> Result<(), String> {
        let request = &transfer.lease.request;
        let expected = lease_signature(request, &transfer.authority.secret);
        if !constant_time_eq(&transfer.lease.signature, &expected)
            || self.mission_id != Some(request.mission_id)
            || self.prokaryote.id != request.donor_id
            || transfer.recipient.id != request.recipient_id
        {
            self.record_hgt_outcome(transfer.lease, "REFUSED");
            return Err("Lease HGT invalide ou hors de sa mission".to_string());
        }
        Ok(())
    }

    fn replay_hgt_receipt(
        &self,
        transfer: &mut HgtTransferContext<'_, '_>,
        receipt: Value,
    ) -> Result<HgtTransferReport, String> {
        verify_hgt_receipt(&receipt, &transfer.authority.secret, transfer.lease)?;
        self.apply_hgt_receipt(transfer.recipient, &receipt)?;
        transfer.lease.revoke();
        serde_json::from_value(receipt["report"].clone()).map_err(|error| error.to_string())
    }

    fn apply_hgt_receipt(
        &self,
        recipient: &mut ProkaryoticAgent,
        receipt: &Value,
    ) -> Result<(), String> {
        let plasmid: Plasmid = serde_json::from_value(receipt["plasmid"].clone())
            .map_err(|error| error.to_string())?;
        match recipient
            .plasmids
            .iter()
            .find(|present| present.plasmid_id == plasmid.plasmid_id)
        {
            Some(present) if present != &plasmid => {
                Err("Receveur possède un plasmide divergent pour ce lease".to_string())
            }
            Some(_) => Ok(()),
            None => {
                recipient.plasmids.push(plasmid);
                Ok(())
            }
        }
    }

    fn record_hgt_outcome(&mut self, lease: &HgtTransferLease, outcome: &str) {
        self.record_event(
            "HGT_LEASE_OUTCOME",
            json!({
                "schema": "genos.hgt-lease-audit/v1",
                "mission_id": lease.request.mission_id,
                "lease_id": lease.request.lease_id,
                "issuer_id": lease.request.issuer_id,
                "donor_id": lease.request.donor_id,
                "recipient_id": lease.request.recipient_id,
                "plasmid_id": lease.request.plasmid_id,
                "outcome": outcome,
            }),
        );
    }
}

fn signed_hgt_receipt(material: HgtReceiptMaterial<'_>, secret: &str) -> Result<Value, String> {
    let lease = material.lease;
    let mut receipt = json!({
        "schema": "genos.hgt-transfer-receipt/v1",
        "idempotency_key": idempotency_key(&lease.request),
        "mission_id": lease.request.mission_id,
        "lease_id": lease.request.lease_id,
        "issuer_id": lease.request.issuer_id,
        "donor_id": lease.request.donor_id,
        "recipient_id": lease.request.recipient_id,
        "plasmid_id": lease.request.plasmid_id,
        "lease_signature": lease.signature,
        "report": material.report,
        "plasmid": material.plasmid,
        "outcome": "TRANSFERRED",
    });
    let signature = receipt_signature(&receipt, secret)?;
    receipt["receipt_signature"] = Value::String(signature);
    Ok(receipt)
}

fn verify_hgt_receipt(
    receipt: &Value,
    secret: &str,
    lease: &HgtTransferLease,
) -> Result<(), String> {
    let expected_signature = receipt_signature(receipt, secret)?;
    let signature_valid = receipt["receipt_signature"].as_str() == Some(&expected_signature);
    if receipt_identity_matches(receipt, lease)
        && receipt_effect_matches(receipt, lease)
        && signature_valid
    {
        Ok(())
    } else {
        Err("Reçu HGT absent, divergent ou signature invalide".to_string())
    }
}

fn receipt_identity_matches(receipt: &Value, lease: &HgtTransferLease) -> bool {
    let request = &lease.request;
    let expected = [
        ("schema", json!("genos.hgt-transfer-receipt/v1")),
        ("idempotency_key", json!(idempotency_key(request))),
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
    let report_fields = [
        ("donor_id", json!(request.donor_id)),
        ("recipient_id", json!(request.recipient_id)),
        ("transferred_plasmid_id", json!(request.plasmid_id)),
    ];
    receipt["outcome"] == "TRANSFERRED"
        && receipt["plasmid"]["plasmid_id"] == request.plasmid_id
        && report_fields
            .iter()
            .all(|(field, value)| receipt["report"][*field] == *value)
}

fn receipt_signature(receipt: &Value, secret: &str) -> Result<String, String> {
    let mut material = receipt.clone();
    material
        .as_object_mut()
        .ok_or_else(|| "Reçu HGT invalide".to_string())?
        .remove("receipt_signature");
    let encoded = serde_json::to_vec(&material).map_err(|error| error.to_string())?;
    Ok(hmac_sha256(secret.as_bytes(), &encoded))
}

fn idempotency_key(request: &HgtLeaseRequest) -> String {
    format!("{}:{}", request.mission_id, request.lease_id)
}

fn validate_request(request: &HgtLeaseRequest) -> Result<(), String> {
    if request.lease_id.trim().is_empty()
        || request.issuer_id.trim().is_empty()
        || request.donor_id.trim().is_empty()
        || request.recipient_id.trim().is_empty()
        || request.plasmid_id.trim().is_empty()
    {
        return Err("Lease HGT incomplet".to_string());
    }
    Ok(())
}

fn lease_signature(request: &HgtLeaseRequest, secret: &str) -> String {
    let fields = [
        request.lease_id.clone(),
        request.issuer_id.clone(),
        request.mission_id.to_string(),
        request.donor_id.clone(),
        request.recipient_id.clone(),
        request.plasmid_id.clone(),
        request.expires_at_unix_ms.to_string(),
    ];
    hmac_sha256(secret.as_bytes(), fields.join("\0").as_bytes())
}

fn hmac_sha256(secret: &[u8], message: &[u8]) -> String {
    let mut key = if secret.len() > 64 {
        Sha256::digest(secret).to_vec()
    } else {
        secret.to_vec()
    };
    key.resize(64, 0);
    let mut inner = Vec::with_capacity(64 + message.len());
    let mut outer = Vec::with_capacity(96);
    for byte in &key {
        inner.push(byte ^ 0x36);
        outer.push(byte ^ 0x5c);
    }
    inner.extend_from_slice(message);
    outer.extend_from_slice(&Sha256::digest(inner));
    format!("{:x}", Sha256::digest(outer))
}

fn constant_time_eq(left: &str, right: &str) -> bool {
    left.len() == right.len()
        && left
            .bytes()
            .zip(right.bytes())
            .fold(0u8, |difference, (a, b)| difference | (a ^ b))
            == 0
}

fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::hmac_sha256;

    #[test]
    fn hmac_sha256_matches_rfc_4231_test_case_one() {
        let key = [0x0b; 20];
        let digest = hmac_sha256(&key, b"Hi There");
        assert_eq!(
            digest,
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
    }
}
