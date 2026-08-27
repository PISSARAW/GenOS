use genos_core::{fork_snapshot_with_hypothesis, AgentWorldCapsule, CorrelationId};
use genos_store::CapsuleStore;
use genos_world::WorldProvider;
use serde::Serialize;

use super::{build_daughter_capsule, even_split, rollback, DivisionReport};

/// One internally-prepared branch of a schizogonic burst.
#[derive(Clone, Debug)]
pub struct SchizogonyBranchSpec {
    pub label: String,
    pub hypothesis: String,
}

/// Atomic mass release: every daughter shares one burst id and the parent's
/// remaining budget split evenly between them.
#[derive(Clone, Debug, Serialize)]
pub struct SchizogonyBurst {
    pub burst_id: String,
    pub daughters: Vec<AgentWorldCapsule>,
    pub steps_per_daughter: u64,
}

/// Release `specs.len()` speculative daughters in one atomic burst
/// (schizogonie / fission multiple).
///
/// Two phases, like the biology:
/// 1. **Internal nuclear divisions** — all daughter agents are derived and
///    validated in memory (unique labels, fundable budget) before any world
///    resource is created;
/// 2. **Release** — worlds are forked and capsules persisted only once every
///    division succeeded. Any failure during release tears down everything
///    created so far: a burst either fully happens or does not happen at all.
///
/// Priority use case: MCTS-style speculative exploration — expand N hypotheses
/// from one state simultaneously and let each daughter live or die on its own
/// evidence.
#[allow(clippy::too_many_arguments)]
pub async fn schizogonic_burst(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    parent: &AgentWorldCapsule,
    specs: &[SchizogonyBranchSpec],
) -> anyhow::Result<SchizogonyBurst> {
    if specs.is_empty() {
        anyhow::bail!("a schizogonic burst requires at least one branch");
    }
    let mut seen = std::collections::HashSet::new();
    for spec in specs {
        if spec.label.trim().is_empty() {
            anyhow::bail!("burst branch labels must not be empty");
        }
        if !seen.insert(spec.label.clone()) {
            anyhow::bail!("duplicate burst branch label `{}`", spec.label);
        }
    }
    // Phase 1: internal divisions — validated before any resource is spent.
    let steps_per_daughter = even_split(parent.budget.steps_remaining, specs.len() as u32)?;
    let prepared = specs
        .iter()
        .map(|spec| {
            let mut agent = fork_snapshot_with_hypothesis(
                &parent.agent_snapshot,
                format!("burst:{}", spec.label),
                spec.hypothesis.clone(),
            );
            agent.runtime_metadata.budget_steps_remaining = steps_per_daughter;
            agent
        })
        .collect::<Vec<_>>();

    // Phase 2: release — all-or-nothing.
    let burst_id = CorrelationId::new().0;
    let mut capsules = Vec::with_capacity(prepared.len());
    for mut agent in prepared {
        let world_id = match provider.fork(parent.world_snapshot_id.clone()).await {
            Ok(id) => id,
            Err(error) => {
                rollback(provider, store, &capsules).await;
                return Err(error);
            }
        };
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

    Ok(SchizogonyBurst {
        burst_id,
        steps_per_daughter,
        daughters: capsules,
    })
}

impl SchizogonyBurst {
    pub fn report(&self, parent_capsule_id: &str) -> DivisionReport {
        DivisionReport {
            mode: "schizogony",
            parent_capsule_id: parent_capsule_id.to_string(),
            daughter_capsule_ids: self
                .daughters
                .iter()
                .map(|capsule| capsule.capsule_id.0.clone())
                .collect(),
            steps_per_daughter: self.steps_per_daughter,
        }
    }
}
