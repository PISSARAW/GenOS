use genos_core::{
    fork_snapshot_with_hypothesis, AgentSnapshot, AgentWorldCapsule, CapsuleLifecycle,
    CapsuleRelation,
};
use genos_store::CapsuleStore;
use genos_world::WorldProvider;
use serde::Serialize;

use super::DivisionReport;
use crate::capsules::{default_capsule_components, terminate_capsule};

/// Per-daughter mitotic fidelity record.
#[derive(Clone, Debug, Serialize)]
pub struct DaughterAttestation {
    pub branch_id: String,
    /// Daughter genome is byte-for-byte equal to the parent genome.
    pub genome_identical: bool,
    /// Every inherited logical state field matches the parent.
    pub logical_state_identical: bool,
    /// Capsule integrity seal verifies after persistence.
    pub integrity_verified: bool,
}

/// Attestation that a clonal fan-out reproduced the parent faithfully.
///
/// This is the mitotic-spindle analogue: replay determinism plus an explicit
/// comparison of every inherited field is what makes each daughter a
/// certified clone rather than an amitotic guess.
#[derive(Clone, Debug, Serialize)]
pub struct MitosisOutcome {
    pub daughters: Vec<AgentWorldCapsule>,
    pub attestations: Vec<DaughterAttestation>,
    pub all_clones_verified: bool,
}

/// Fork `count` attested clones of one parent capsule (mitosis).
///
/// Priority use case: redundant parallel execution — run identical copies and
/// compare outcomes (majority vote, flakiness detection) with proof that every
/// daughter started from exactly the same genome and logical state.
///
/// On any failure the already-created worlds are destroyed and their capsules
/// cancelled, leaving no partial tissue behind.
#[allow(clippy::too_many_arguments)]
pub async fn mitotic_fork_capsules(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    parent: &AgentWorldCapsule,
    count: u32,
) -> anyhow::Result<MitosisOutcome> {
    if count == 0 {
        anyhow::bail!("mitosis requires at least one daughter");
    }
    let mut capsules = Vec::with_capacity(count as usize);
    for index in 1..=count {
        let label = format!("mitosis-{index}");
        let world_id = match provider.fork(parent.world_snapshot_id.clone()).await {
            Ok(id) => id,
            Err(error) => {
                rollback(provider, store, &capsules).await;
                return Err(error);
            }
        };
        let mut agent = fork_snapshot_with_hypothesis(
            &parent.agent_snapshot,
            label.clone(),
            format!("attested clone {index} of {}", parent.branch_id.0),
        );
        agent.world_id = world_id.clone();
        agent.state.world_id = world_id.clone();

        match build_daughter_capsule(provider, store, parent, agent, world_id).await {
            Ok(capsule) => capsules.push(capsule),
            Err(error) => {
                rollback(provider, store, &capsules).await;
                return Err(error);
            }
        }
    }

    let attestations = capsules
        .iter()
        .map(|daughter| attest(&parent.agent_snapshot, daughter))
        .collect::<Vec<_>>();
    let all_clones_verified = attestations
        .iter()
        .all(|a| a.genome_identical && a.logical_state_identical && a.integrity_verified);

    Ok(MitosisOutcome {
        daughters: capsules,
        attestations,
        all_clones_verified,
    })
}

/// Compare a daughter against its parent on the fields a mitotic division must
/// preserve: the whole genome plus the inherited runtime context.
fn attest(parent: &AgentSnapshot, daughter: &AgentWorldCapsule) -> DaughterAttestation {
    let agent = &daughter.agent_snapshot;
    DaughterAttestation {
        branch_id: daughter.branch_id.0.clone(),
        genome_identical: agent.genome == parent.genome,
        logical_state_identical: agent.state.working_memory == parent.state.working_memory
            && agent.state.beliefs == parent.state.beliefs
            && agent.state.active_goals == parent.state.active_goals
            && agent.state.memories == parent.state.memories
            && agent.tool_state == parent.tool_state
            && agent.runtime_metadata.budget_steps_remaining
                == parent.runtime_metadata.budget_steps_remaining,
        integrity_verified: daughter.verify_integrity(),
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn build_daughter_capsule(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    parent: &AgentWorldCapsule,
    agent: AgentSnapshot,
    world_id: genos_core::WorldId,
) -> anyhow::Result<AgentWorldCapsule> {
    let world_snapshot = match provider.snapshot(world_id.clone()).await {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let _ = provider.destroy(world_id).await;
            return Err(error);
        }
    };
    let mut capsule = AgentWorldCapsule::new(
        agent,
        world_snapshot,
        Some(world_id.clone()),
        default_capsule_components(),
        Some(parent.capsule_id.clone()),
        CapsuleRelation::Fork,
    );
    if let Err(error) = capsule.transition(CapsuleLifecycle::Running) {
        let _ = provider.destroy(world_id).await;
        return Err(anyhow::Error::msg(error));
    }
    if let Err(error) = store.save_capsule(capsule.clone()).await {
        let _ = provider.destroy(world_id).await;
        return Err(error);
    }
    Ok(capsule)
}

pub(crate) async fn rollback(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    capsules: &[AgentWorldCapsule],
) {
    for capsule in capsules {
        let _ = terminate_capsule(provider, store, capsule, CapsuleLifecycle::Cancelled).await;
    }
}

impl MitosisOutcome {
    pub fn report(&self, parent_capsule_id: &str) -> DivisionReport {
        DivisionReport {
            mode: "mitosis",
            parent_capsule_id: parent_capsule_id.to_string(),
            daughter_capsule_ids: self
                .daughters
                .iter()
                .map(|capsule| capsule.capsule_id.0.clone())
                .collect(),
            steps_per_daughter: self
                .daughters
                .first()
                .map(|capsule| capsule.budget.steps_remaining)
                .unwrap_or(0),
        }
    }
}
