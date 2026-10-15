use genos_biology::{Plasmid, ProkaryoticAgent};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use uuid::Uuid;

const HGT_SNAPSHOT_SCHEMA: &str = "genos.prokaryote-checkpoint/v1";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProkaryoteCheckpoint {
    pub schema: String,
    pub mission_id: Uuid,
    pub donor: ProkaryoticAgent,
    pub digest: String,
}

#[derive(Serialize)]
struct DigestMaterial<'a> {
    schema: &'a str,
    mission_id: Uuid,
    donor: &'a ProkaryoticAgent,
}

impl ProkaryoteCheckpoint {
    pub fn capture(mission_id: Uuid, donor: &ProkaryoticAgent) -> Result<Self, String> {
        validate_donor(donor)?;
        let digest = snapshot_digest(HGT_SNAPSHOT_SCHEMA, mission_id, donor)?;
        Ok(Self {
            schema: HGT_SNAPSHOT_SCHEMA.to_string(),
            mission_id,
            donor: donor.clone(),
            digest,
        })
    }

    pub fn restore(&self, requested_mission: Option<Uuid>) -> Result<ProkaryoticAgent, String> {
        if self.schema != HGT_SNAPSHOT_SCHEMA {
            return Err("mission HGT checkpoint schema is unsupported".to_string());
        }
        if requested_mission != Some(self.mission_id) {
            return Err("mission HGT checkpoint identity does not match the requested mission".to_string());
        }
        validate_donor(&self.donor)?;
        let expected = snapshot_digest(&self.schema, self.mission_id, &self.donor)?;
        if self.digest != expected {
            return Err("mission HGT checkpoint digest mismatch".to_string());
        }
        Ok(self.donor.clone())
    }
}

fn snapshot_digest(schema: &str, mission_id: Uuid, donor: &ProkaryoticAgent) -> Result<String, String> {
    let bytes = serde_json::to_vec(&DigestMaterial { schema, mission_id, donor })
        .map_err(|error| format!("mission HGT checkpoint could not be encoded: {error}"))?;
    let digest = Sha256::digest(bytes);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn validate_donor(donor: &ProkaryoticAgent) -> Result<(), String> {
    if donor.id.trim().is_empty() {
        return Err("mission HGT checkpoint donor identity is empty".to_string());
    }
    let mut plasmid_ids = HashSet::new();
    for plasmid in &donor.plasmids {
        if plasmid.plasmid_id.trim().is_empty() || !plasmid_ids.insert(plasmid.plasmid_id.as_str()) {
            return Err("mission HGT checkpoint contains an empty or duplicate plasmid identity".to_string());
        }
        validate_plasmid(plasmid)?;
    }
    Ok(())
}

fn validate_plasmid(plasmid: &Plasmid) -> Result<(), String> {
    if plasmid.skill_name.trim().is_empty()
        || plasmid.executable_payload.trim().is_empty()
        || plasmid.copy_number == 0
    {
        return Err("mission HGT checkpoint contains an invalid plasmid".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ProkaryoteCheckpoint;
    use genos_biology::{Plasmid, ProkaryoticAgent};
    use uuid::Uuid;

    fn donor() -> ProkaryoticAgent {
        ProkaryoticAgent::new("mission-donor").with_plasmid(Plasmid {
            plasmid_id: "p-stable".into(),
            skill_name: "SAFE_SKILL".into(),
            executable_payload: "data-only payload".into(),
            resistance_marker: "marker".into(),
            copy_number: 2,
        })
    }

    #[test]
    fn donor_and_plasmids_restore_only_for_their_mission() {
        let mission = Uuid::new_v4();
        let snapshot = ProkaryoteCheckpoint::capture(mission, &donor()).unwrap();
        let restored = snapshot.restore(Some(mission)).unwrap();
        assert_eq!(restored.id, "mission-donor");
        assert_eq!(restored.plasmids, donor().plasmids);
        assert!(snapshot.restore(Some(Uuid::new_v4())).unwrap_err().contains("identity"));
    }

    #[test]
    fn changed_state_and_unsupported_schema_fail_closed() {
        let mission = Uuid::new_v4();
        let mut snapshot = ProkaryoteCheckpoint::capture(mission, &donor()).unwrap();
        snapshot.donor.plasmids[0].executable_payload = "divergent payload".into();
        assert!(snapshot.restore(Some(mission)).unwrap_err().contains("digest"));
        snapshot.schema = "genos.prokaryote-checkpoint/v99".into();
        assert!(snapshot.restore(Some(mission)).unwrap_err().contains("schema"));
    }

    #[test]
    fn malformed_or_ambiguous_donor_state_is_rejected_before_capture() {
        let mission = Uuid::new_v4();
        let mut malformed = donor();
        malformed.plasmids.push(malformed.plasmids[0].clone());
        assert!(ProkaryoteCheckpoint::capture(mission, &malformed).unwrap_err().contains("duplicate"));
        let mut invalid = donor();
        invalid.plasmids[0].copy_number = 0;
        assert!(ProkaryoteCheckpoint::capture(mission, &invalid).unwrap_err().contains("invalid plasmid"));
    }
}
