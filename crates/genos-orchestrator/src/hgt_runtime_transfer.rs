use super::{HgtTransferContext, plasmid_digest};
use crate::GenosEcosystem;
use genos_biology::{HgtTransferReport, Plasmid, ProkaryoticAgent};

pub(super) fn restore_hgt_plasmid(
    recipient: &mut ProkaryoticAgent,
    plasmid: Plasmid,
) -> Result<(), String> {
    let present = recipient.plasmids.iter()
        .find(|item| item.plasmid_id == plasmid.plasmid_id);
    if present.is_some_and(|item| item != &plasmid) {
        return Err("Receveur possède un plasmide divergent pour ce lease".to_string());
    }
    if present.is_none() {
        recipient.plasmids.push(plasmid);
    }
    Ok(())
}

pub(super) fn hgt_identity_matches(
    ecosystem: &GenosEcosystem,
    transfer: &HgtTransferContext<'_>,
) -> bool {
    let request = &transfer.lease.request;
    let digest_matches = ecosystem.prokaryote.plasmids.iter()
        .find(|plasmid| plasmid.plasmid_id == request.plasmid_id)
        .and_then(|plasmid| plasmid_digest(plasmid).ok())
        .is_some_and(|digest| digest == request.plasmid_digest);
    digest_matches
        && ecosystem.mission_id == Some(request.mission_id)
        && ecosystem.prokaryote.id == request.donor_id
        && transfer.recipient.id == request.recipient_id
}

pub(super) fn authorized_conjugation(
    donor: &ProkaryoticAgent,
    recipient: &mut ProkaryoticAgent,
    plasmid_id: &str,
) -> Result<HgtTransferReport, String> {
    validate_transfer_pair(donor, recipient)?;
    let plasmid = donor.plasmids.iter().find(|item| item.plasmid_id == plasmid_id)
        .filter(|item| valid_transfer_plasmid(item))
        .ok_or_else(|| "Plasmide HGT absent chez le donneur".to_string())?;
    let already_present = recipient_has_plasmid(recipient, plasmid)?;
    if !already_present {
        recipient.plasmids.push(plasmid.clone());
    }
    Ok(HgtTransferReport {
        donor_id: donor.id.clone(),
        recipient_id: recipient.id.clone(),
        transferred_plasmid_id: plasmid_id.to_string(),
        pilus_connection_latency_ms: 0.0,
        horizontal_transfer_success: true,
        status: if already_present {
            "PLASMID_ALREADY_PRESENT"
        } else {
            "HGT_TRANSFER_SIMULATED"
        }.to_string(),
    })
}

fn validate_transfer_pair(donor: &ProkaryoticAgent, recipient: &ProkaryoticAgent) -> Result<(), String> {
    if donor.has_sex_pilus && donor.id != recipient.id {
        Ok(())
    } else {
        Err("Donneur ou receveur HGT invalide".to_string())
    }
}

fn valid_transfer_plasmid(plasmid: &Plasmid) -> bool {
    !plasmid.plasmid_id.trim().is_empty()
        && !plasmid.skill_name.trim().is_empty()
        && !plasmid.executable_payload.trim().is_empty()
        && plasmid.copy_number > 0
}

fn recipient_has_plasmid(recipient: &ProkaryoticAgent, plasmid: &Plasmid) -> Result<bool, String> {
    let existing = recipient.plasmids.iter().find(|item| item.plasmid_id == plasmid.plasmid_id);
    if existing.is_some_and(|item| item != plasmid) {
        return Err("Receveur possède un plasmide divergent".to_string());
    }
    Ok(existing.is_some())
}
