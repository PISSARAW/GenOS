use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Organization {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Project {
    pub id: String,
    pub organization_id: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MembershipRole {
    Owner,
    Admin,
    Member,
    Viewer,
}

impl MembershipRole {
    pub fn can_write(&self) -> bool {
        matches!(self, Self::Owner | Self::Admin | Self::Member)
    }
    pub fn can_administer(&self) -> bool {
        matches!(self, Self::Owner | Self::Admin)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Membership {
    pub principal_id: String,
    pub organization_id: String,
    pub project_id: Option<String>,
    pub role: MembershipRole,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TenantScope {
    pub organization_id: String,
    pub project_id: Option<String>,
}

impl TenantScope {
    pub fn organization(id: impl Into<String>) -> Self {
        Self {
            organization_id: id.into(),
            project_id: None,
        }
    }
    pub fn project(organization_id: impl Into<String>, project_id: impl Into<String>) -> Self {
        Self {
            organization_id: organization_id.into(),
            project_id: Some(project_id.into()),
        }
    }
    pub fn contains(&self, organization_id: &str, project_id: Option<&str>) -> bool {
        self.organization_id == organization_id
            && (self.project_id.is_none() || self.project_id.as_deref() == project_id)
    }
}

#[derive(Clone, Debug, Default)]
pub struct AccessPolicy {
    memberships: Vec<Membership>,
}

impl AccessPolicy {
    pub fn with_memberships(memberships: impl IntoIterator<Item = Membership>) -> Self {
        Self {
            memberships: memberships.into_iter().collect(),
        }
    }
    pub fn authorize(&self, principal_id: &str, scope: &TenantScope, write: bool) -> bool {
        self.memberships.iter().any(|membership| {
            membership.principal_id == principal_id
                && membership.organization_id == scope.organization_id
                && (membership.project_id.is_none() || membership.project_id == scope.project_id)
                && (!write || membership.role.can_write())
        })
    }
    pub fn visible_project_ids(
        &self,
        principal_id: &str,
        organization_id: &str,
    ) -> BTreeSet<String> {
        self.memberships
            .iter()
            .filter_map(|membership| {
                (membership.principal_id == principal_id
                    && membership.organization_id == organization_id)
                    .then(|| membership.project_id.clone())
                    .flatten()
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn membership(project_id: Option<&str>, role: MembershipRole) -> Membership {
        Membership {
            principal_id: "user-1".into(),
            organization_id: "org-1".into(),
            project_id: project_id.map(str::to_owned),
            role,
        }
    }

    #[test]
    fn project_membership_isolation_and_write_policy_are_enforced() {
        let policy = AccessPolicy::with_memberships([
            membership(Some("project-a"), MembershipRole::Member),
            membership(Some("project-b"), MembershipRole::Viewer),
        ]);
        let project_a = TenantScope::project("org-1", "project-a");
        let project_b = TenantScope::project("org-1", "project-b");
        let other_org = TenantScope::project("org-2", "project-a");
        assert!(policy.authorize("user-1", &project_a, true));
        assert!(policy.authorize("user-1", &project_b, false));
        assert!(!policy.authorize("user-1", &project_b, true));
        assert!(!policy.authorize("user-1", &other_org, false));
        assert_eq!(policy.visible_project_ids("user-1", "org-1").len(), 2);
    }
}
