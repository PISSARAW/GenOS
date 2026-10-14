//! Contrôle des transferts horizontaux sous lease mission à usage unique.

use crate::GenosEcosystem;
use genos_biology::{HgtTransferReport, Plasmid, ProkaryoticAgent};
use genos_store::BiologicalReceiptStore;
use ed25519_dalek::VerifyingKey;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::fs::{OpenOptions, remove_file};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;
#[path = "hgt_runtime_receipt.rs"]
mod receipt;
#[path = "hgt_runtime_transfer.rs"]
mod transfer;
use self::receipt::{
    build_hgt_receipt, decode_hex, idempotency_key, now_unix_ms,
    validate_request, verify_hgt_receipt, verify_lease_signature,
};
use self::transfer::{authorized_conjugation, hgt_identity_matches, restore_hgt_plasmid};
pub use self::receipt::plasmid_digest;

const HGT_LEASE_SCHEMA: &str = "genos.hgt-lease/v1";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HgtLeaseRequest {
    pub lease_id: String,
    pub issuer_id: String,
    pub mission_id: Uuid,
    pub donor_id: String,
    pub recipient_id: String,
    pub plasmid_id: String,
    pub plasmid_digest: String,
    pub nonce: String,
    pub expires_at_unix_ms: u128,
}

impl HgtLeaseRequest {
    /// Octets canoniques v1 à signer par le service d'autorité externe.
    pub fn signing_bytes(&self) -> Result<Vec<u8>, String> {
        #[derive(Serialize)]
        struct Claims<'a> {
            schema: &'static str,
            issuer_id: &'a str,
            mission_id: Uuid,
            lease_id: &'a str,
            nonce: &'a str,
            donor_id: &'a str,
            recipient_id: &'a str,
            plasmid_id: &'a str,
            plasmid_digest: &'a str,
            expires_at_unix_ms: u128,
        }
        let claims = Claims {
            schema: HGT_LEASE_SCHEMA,
            issuer_id: &self.issuer_id,
            mission_id: self.mission_id,
            lease_id: &self.lease_id,
            nonce: &self.nonce,
            donor_id: &self.donor_id,
            recipient_id: &self.recipient_id,
            plasmid_id: &self.plasmid_id,
            plasmid_digest: &self.plasmid_digest,
            expires_at_unix_ms: self.expires_at_unix_ms,
        };
        serde_json::to_vec(&claims).map_err(|error| error.to_string())
    }
}

/// Clés publiques approuvées par l'application et journal durable des reçus.
pub(crate) struct HgtLeaseAuthority {
    trusted_issuers: HashMap<String, VerifyingKey>,
    store: BiologicalReceiptStore,
    process_lock_path: PathBuf,
    nonce_lock: Mutex<()>,
}

impl HgtLeaseAuthority {
    fn new(
        trusted_issuers: HashMap<String, String>,
        store: BiologicalReceiptStore,
        process_lock_path: PathBuf,
    ) -> Result<Self, String> {
        if trusted_issuers.is_empty() {
            return Err("Aucune clé d'émetteur HGT approuvée".to_string());
        }
        let keys = trusted_issuers.into_iter().map(|(issuer, encoded)| {
            let bytes = decode_hex(&encoded)?;
            let key_bytes: [u8; 32] = bytes.try_into().map_err(|_| "Clé Ed25519 HGT de longueur invalide".to_string())?;
            let key = VerifyingKey::from_bytes(&key_bytes).map_err(|error| error.to_string())?;
            Ok((issuer, key))
        }).collect::<Result<HashMap<_, _>, String>>()?;
        Ok(Self { trusted_issuers: keys, store, process_lock_path, nonce_lock: Mutex::new(()) })
    }
}

struct HgtProcessLock(PathBuf);

impl HgtProcessLock {
    fn acquire(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent().filter(|value| !value.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut file = OpenOptions::new().write(true).create_new(true).open(path)
            .map_err(|error| format!("HGT journal is locked or has a stale lock: {error}"))?;
        let persisted = writeln!(file, "pid={}", std::process::id())
            .and_then(|()| file.sync_all());
        if let Err(error) = persisted {
            drop(file);
            let _ = remove_file(path);
            return Err(error.to_string());
        }
        Ok(Self(path.to_path_buf()))
    }
}

impl Drop for HgtProcessLock {
    fn drop(&mut self) {
        let _ = remove_file(&self.0);
    }
}

#[derive(Debug)]
pub struct HgtTransferLease {
    request: HgtLeaseRequest,
    signature: String,
    active: bool,
}

pub struct HgtTransferContext<'context> {
    pub recipient: &'context mut ProkaryoticAgent,
    pub lease: &'context mut HgtTransferLease,
}

struct HgtReceiptMaterial<'a> {
    lease: &'a HgtTransferLease,
    report: &'a HgtTransferReport,
    plasmid: &'a Plasmid,
}

impl HgtTransferLease {
    /// Vérifie un lease signé hors runtime par un émetteur épinglé.
    fn verify_signed(
        request: HgtLeaseRequest,
        signature_hex: &str,
        authority: &HgtLeaseAuthority,
    ) -> Result<Self, String> {
        validate_request(&request)?;
        if request.expires_at_unix_ms <= now_unix_ms() {
            return Err("Lease HGT déjà expiré".to_string());
        }
        verify_lease_signature(&request, signature_hex, authority)?;
        Ok(Self { request, signature: signature_hex.to_string(), active: true })
    }

    /// Reconstitue un lease uniquement si son reçu durable est présent.
    fn resume(
        request: HgtLeaseRequest,
        signature_hex: &str,
        authority: &HgtLeaseAuthority,
    ) -> Result<Self, String> {
        validate_request(&request)?;
        verify_lease_signature(&request, signature_hex, authority)?;
        let lease = Self { request, signature: signature_hex.to_string(), active: false };
        let receipt = authority
            .store
            .find_idempotent_receipt("genos.hgt-transfer-receipt/v1", &idempotency_key(&lease.request))?
            .ok_or_else(|| "Aucun reçu durable ne permet de reprendre ce lease HGT".to_string())?;
        verify_hgt_receipt(&receipt, authority, &lease)?;
        Ok(lease)
    }

    pub fn revoke(&mut self) {
        self.active = false;
    }

    pub fn is_active(&self) -> bool {
        self.active && self.request.expires_at_unix_ms > now_unix_ms()
    }
}

impl GenosEcosystem {
    /// Configure une fois les clés d'émetteurs approuvées par l'application.
    pub fn configure_hgt_trust(
        &mut self,
        trusted_issuers: HashMap<String, String>,
        receipt_path: impl AsRef<std::path::Path>,
    ) -> Result<(), String> {
        if self.hgt_authority.is_some() {
            return Err("Configuration de confiance HGT déjà fixée".to_string());
        }
        let receipt_path = receipt_path.as_ref();
        let store = BiologicalReceiptStore::open(receipt_path);
        let lock_path = receipt_path.with_extension("hgt.lock");
        self.hgt_authority = Some(HgtLeaseAuthority::new(trusted_issuers, store, lock_path)?);
        Ok(())
    }

    /// Vérifie une preuve externe contre les clés figées dans le runtime.
    pub fn verify_hgt_lease(
        &self,
        request: HgtLeaseRequest,
        signature_hex: &str,
    ) -> Result<HgtTransferLease, String> {
        let authority = self.hgt_authority.as_ref()
            .ok_or_else(|| "Transfert HGT indisponible : aucune autorité externe configurée".to_string())?;
        HgtTransferLease::verify_signed(request, signature_hex, authority)
    }

    /// Reprend un reçu HGT persisté après vérification de sa signature d'émetteur.
    pub fn resume_hgt_lease(
        &self,
        request: HgtLeaseRequest,
        signature_hex: &str,
    ) -> Result<HgtTransferLease, String> {
        let authority = self.hgt_authority.as_ref()
            .ok_or_else(|| "Transfert HGT indisponible : aucune autorité externe configurée".to_string())?;
        HgtTransferLease::resume(request, signature_hex, authority)
    }

    /// Révoque un émetteur en retirant sa clé de la configuration runtime.
    pub fn revoke_hgt_issuer(&mut self, issuer_id: &str) -> Result<(), String> {
        let authority = self.hgt_authority.as_mut()
            .ok_or_else(|| "Autorité externe HGT non configurée".to_string())?;
        authority.trusted_issuers.remove(issuer_id)
            .map(|_| ())
            .ok_or_else(|| "Émetteur HGT inconnu".to_string())
    }

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
        mut transfer: HgtTransferContext<'_>,
    ) -> Result<HgtTransferReport, String> {
        let authority = self.hgt_authority.take()
            .ok_or_else(|| "Transfert HGT indisponible : aucune autorité externe configurée".to_string())?;
        let result = (|| {
            let _guard = authority.nonce_lock.lock()
                .map_err(|_| "Verrou d'idempotence HGT empoisonné".to_string())?;
            let _process_lock = HgtProcessLock::acquire(&authority.process_lock_path)?;
            self.validate_hgt_identity(&transfer, &authority)?;
            let key = idempotency_key(&transfer.lease.request);
            if let Some(receipt) = authority.store.find_idempotent_receipt(
                "genos.hgt-transfer-receipt/v1", &key,
            )? {
                return self.replay_hgt_receipt(&mut transfer, receipt, &authority);
            }
            self.execute_new_hgt_transfer(&mut transfer, &authority)
        })();
        self.hgt_authority = Some(authority);
        result
    }

    fn execute_new_hgt_transfer(
        &mut self,
        transfer: &mut HgtTransferContext<'_>,
        authority: &HgtLeaseAuthority,
    ) -> Result<HgtTransferReport, String> {
        if !transfer.lease.is_active() {
            self.record_hgt_outcome(transfer.lease, "REFUSED");
            return Err("Lease HGT expiré ou révoqué".to_string());
        }
        let receipt = self.prepare_hgt_receipt(transfer)?;
        let persisted = authority.store.append_idempotent_receipt(&receipt)?;
        verify_hgt_receipt(&persisted, authority, transfer.lease)?;
        let persisted_report = serde_json::from_value(persisted["report"].clone())
            .map_err(|error| error.to_string())?;
        self.apply_hgt_receipt(transfer.recipient, &persisted)?;
        transfer.lease.revoke();
        self.record_event("HGT_LEASE_OUTCOME", persisted);
        Ok(persisted_report)
    }

    fn prepare_hgt_receipt(
        &self,
        transfer: &HgtTransferContext<'_>,
    ) -> Result<Value, String> {
        let mut candidate = transfer.recipient.clone();
        let report = authorized_conjugation(
            &self.prokaryote,
            &mut candidate,
            &transfer.lease.request.plasmid_id,
        )?;
        let plasmid = candidate
            .plasmids
            .iter()
            .find(|plasmid| plasmid.plasmid_id == transfer.lease.request.plasmid_id)
            .cloned()
            .ok_or_else(|| "Transfert HGT sans plasmide receveur".to_string())?;
        build_hgt_receipt(HgtReceiptMaterial { lease: transfer.lease, report: &report, plasmid: &plasmid })
    }

    fn validate_hgt_identity(
        &mut self,
        transfer: &HgtTransferContext<'_>,
        authority: &HgtLeaseAuthority,
    ) -> Result<(), String> {
        let request = &transfer.lease.request;
        let signature_valid = verify_lease_signature(request, &transfer.lease.signature, authority).is_ok();
        if !signature_valid || !hgt_identity_matches(self, transfer) {
            self.record_hgt_outcome(transfer.lease, "REFUSED");
            return Err("Lease HGT invalide ou hors de sa mission".to_string());
        }
        Ok(())
    }

    fn replay_hgt_receipt(
        &self,
        transfer: &mut HgtTransferContext<'_>,
        receipt: Value,
        authority: &HgtLeaseAuthority,
    ) -> Result<HgtTransferReport, String> {
        verify_hgt_receipt(&receipt, authority, transfer.lease)?;
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
        restore_hgt_plasmid(recipient, plasmid)
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

#[cfg(test)]
mod process_lock_tests {
    use super::HgtProcessLock;

    #[test]
    fn shared_journal_lock_refuses_a_second_runtime_until_release() {
        let path = std::env::temp_dir().join(format!("genos-hgt-lock-{}.lock", uuid::Uuid::new_v4()));
        let first = HgtProcessLock::acquire(&path).unwrap();
        assert!(HgtProcessLock::acquire(&path).is_err());
        drop(first);
        assert!(HgtProcessLock::acquire(&path).is_ok());
        let _ = std::fs::remove_file(path);
    }
}
