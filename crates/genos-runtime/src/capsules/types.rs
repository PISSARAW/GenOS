use async_trait::async_trait;
use genos_core::RestorableComponent;

#[derive(Clone, Debug)]
pub struct CounterfactualBranchSpec {
    pub label: String,
    pub hypothesis: String,
}

#[derive(Clone, Debug)]
pub struct LineagedCounterfactualBranchSpec {
    pub branch_id: genos_core::BranchId,
    pub label: String,
    pub hypothesis: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ComponentRestoreStatus {
    Restored,
    Reconstructed,
    ExternalUncontrolled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ComponentRestoreReport {
    pub name: String,
    pub status: ComponentRestoreStatus,
}

#[async_trait]
pub trait ComponentRestorer: Send + Sync {
    async fn reconstruct(&self, component: &RestorableComponent) -> anyhow::Result<()>;
}
