use super::types::Binding;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct WorkerMember {
    pub actor_id: String,
    pub role: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct Roster {
    pub version: u64,
    pub run_id: String,
    pub members: Vec<WorkerMember>,
}

impl Roster {
    pub fn for_binding(binding: &Binding, version: u64) -> Self {
        let members = ["producer", "verifier_a", "verifier_b"]
            .into_iter()
            .map(|role| WorkerMember {
                actor_id: format!("{}:{role}", binding.run_id),
                role: role.to_owned(),
            })
            .collect();
        Self { version, run_id: binding.run_id.clone(), members }
    }

    pub fn validate(&self, binding: &Binding) -> Result<(), String> {
        if self.version == 0 || self.run_id != binding.run_id || self.members.len() != 3 {
            return Err("MORPH invalid roster version/run/member count".into());
        }
        let expected = Self::for_binding(binding, self.version);
        let supplied: BTreeSet<_> = self.members.iter().map(|m| (&m.role, &m.actor_id)).collect();
        let required: BTreeSet<_> = expected.members.iter().map(|m| (&m.role, &m.actor_id)).collect();
        if supplied != required {
            return Err("MORPH requires three distinct run-bound native workers".into());
        }
        Ok(())
    }

    pub fn member(&self, role: &str) -> Result<&WorkerMember, String> {
        self.members.iter().find(|member| member.role == role)
            .ok_or_else(|| format!("MORPH missing native worker role {role}"))
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct RosterPlan {
    pub transition_id: String,
    pub expected_version: u64,
    pub roster: Roster,
}

impl RosterPlan {
    pub fn validate(&self, binding: &Binding) -> Result<(), String> {
        self.roster.validate(binding)?;
        let next = self.expected_version.checked_add(1).ok_or("MORPH version exhausted")?;
        if self.transition_id.trim().is_empty() || self.roster.version != next {
            return Err("MORPH invalid transition/version increment".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct MorphReceipt {
    pub transition_id: String,
    pub plan_digest: String,
    pub source_digest: String,
    pub target_digest: String,
    pub status: String,
    pub roster: Roster,
    pub receipt_digest: String,
}
