//! Contrôle des transferts horizontaux sous lease mission à usage unique.

use crate::GenosEcosystem;
use genos_biology::HgtTransferReport;
use serde::Serialize;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct HgtLeaseRequest {
    pub lease_id: String,
    pub mission_id: Uuid,
    pub donor_id: String,
    pub recipient_id: String,
    pub plasmid_id: String,
    pub expires_at_unix_ms: u128,
}

#[derive(Clone, Debug)]
pub struct HgtTransferLease {
    request: HgtLeaseRequest,
    active: bool,
}

#[derive(Serialize)]
struct HgtLeaseReceipt<'a> {
    schema: &'static str,
    mission_id: Uuid,
    lease_id: &'a str,
    donor_id: &'a str,
    recipient_id: &'a str,
    plasmid_id: &'a str,
    outcome: &'a str,
}

impl HgtTransferLease {
    pub fn grant(request: HgtLeaseRequest) -> Result<Self, String> {
        if request.lease_id.trim().is_empty()
            || request.donor_id.trim().is_empty()
            || request.recipient_id.trim().is_empty()
            || request.plasmid_id.trim().is_empty()
            || request.expires_at_unix_ms <= now_unix_ms()
        {
            return Err("Lease HGT incomplet ou déjà expiré".to_string());
        }
        Ok(Self {
            request,
            active: true,
        })
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
        _recipient: &mut genos_biology::ProkaryoticAgent,
        _plasmid_id: &str,
    ) -> Result<HgtTransferReport, String> {
        Err("Lease HGT mission requis".to_string())
    }

    /// Révoque un lease et conserve l'événement d'audit.
    pub fn revoke_hgt_lease(&mut self, lease: &mut HgtTransferLease) {
        lease.revoke();
        self.record_hgt_outcome(lease, "REVOKED");
    }

    /// Transfère un plasmide après validation du lease et consomme son usage.
    pub fn hgt_transfer_under_lease(
        &mut self,
        recipient: &mut genos_biology::ProkaryoticAgent,
        lease: &mut HgtTransferLease,
    ) -> Result<HgtTransferReport, String> {
        if !lease.is_active()
            || self.mission_id != Some(lease.request.mission_id)
            || self.prokaryote.id != lease.request.donor_id
            || recipient.id != lease.request.recipient_id
        {
            self.record_hgt_outcome(lease, "REFUSED");
            return Err("Lease HGT invalide, expiré ou hors de sa mission".to_string());
        }
        lease.revoke();
        let result = self
            .prokaryote
            .conjugate_transfer_plasmid(recipient, &lease.request.plasmid_id);
        self.record_hgt_outcome(
            lease,
            if result.is_ok() { "TRANSFERRED" } else { "TRANSFER_FAILED" },
        );
        result
    }

    fn record_hgt_outcome(&mut self, lease: &HgtTransferLease, outcome: &str) {
        let receipt = HgtLeaseReceipt {
            schema: "genos.hgt-lease-receipt/v1",
            mission_id: lease.request.mission_id,
            lease_id: &lease.request.lease_id,
            donor_id: &lease.request.donor_id,
            recipient_id: &lease.request.recipient_id,
            plasmid_id: &lease.request.plasmid_id,
            outcome,
        };
        self.record_event("HGT_LEASE_OUTCOME", json!(receipt));
    }
}

fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
