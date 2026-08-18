use genos_core::{AgentWorldCapsule, RestorableComponent, RestorationMode};

use super::types::{ComponentRestoreReport, ComponentRestoreStatus, ComponentRestorer};

pub fn default_capsule_components() -> Vec<RestorableComponent> {
    vec![
        RestorableComponent {
            name: "filesystem".to_string(),
            mode: RestorationMode::Snapshot,
            digest: None,
            manifest: None,
            nondeterminism: vec![],
        },
        RestorableComponent {
            name: "processes".to_string(),
            mode: RestorationMode::Reconstruct,
            digest: None,
            manifest: Some("process-manifest.json".to_string()),
            nondeterminism: vec![],
        },
        RestorableComponent {
            name: "external_services".to_string(),
            mode: RestorationMode::External,
            digest: None,
            manifest: None,
            nondeterminism: vec!["service_state".to_string()],
        },
    ]
}

pub async fn restore_capsule_components(
    capsule: &AgentWorldCapsule,
    restorer: &dyn ComponentRestorer,
) -> anyhow::Result<Vec<ComponentRestoreReport>> {
    let mut reports = Vec::new();
    for component in &capsule.components {
        let status = restore_single_component(component, restorer).await?;
        reports.push(ComponentRestoreReport {
            name: component.name.clone(),
            status,
        });
    }
    Ok(reports)
}

async fn restore_single_component(
    component: &RestorableComponent,
    restorer: &dyn ComponentRestorer,
) -> anyhow::Result<ComponentRestoreStatus> {
    match component.mode {
        RestorationMode::Snapshot => Ok(ComponentRestoreStatus::Restored),
        RestorationMode::Reconstruct => {
            if component.manifest.is_none() {
                anyhow::bail!(
                    "component {} has no reconstruction manifest",
                    component.name
                );
            }
            restorer.reconstruct(component).await?;
            Ok(ComponentRestoreStatus::Reconstructed)
        }
        RestorationMode::External => Ok(ComponentRestoreStatus::ExternalUncontrolled),
    }
}
