use genos_core::{
    checkpoint_snapshot, AgentWorldCapsule, CapsuleLifecycle, CapsuleRelation,
};
use genos_store::CapsuleStore;
use genos_world::WorldProvider;

use crate::{
    apply_cognitive_merge, fork_lineaged_counterfactual_capsules, merge_experiences,
    terminate_capsule, ClaimRelation, CognitiveMergeConfig, LineagedCounterfactualBranchSpec,
};

use super::types::{
    AgentGenerationLineage, CounterfactualExperienceRunner, GenomeOsCycleReport,
    GenomeOsForkOutcome, GenomeOsForkPlan,
};

#[allow(clippy::too_many_arguments)]
pub async fn run_genome_os_cycle(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    parent: &AgentWorldCapsule,
    lineage: AgentGenerationLineage,
    plans: &[GenomeOsForkPlan],
    runner: &dyn CounterfactualExperienceRunner,
    relations: &[ClaimRelation],
    merge_config: &CognitiveMergeConfig,
) -> anyhow::Result<GenomeOsCycleReport> {
    if plans.is_empty() {
        anyhow::bail!("a Genome OS cycle requires at least one fork plan");
    }
    let parent_world = parent
        .live_world_id
        .clone()
        .ok_or_else(|| anyhow::anyhow!("parent capsule has no live world"))?;
    let world_snapshot = provider.snapshot(parent_world.clone()).await?;
    let agent_checkpoint = checkpoint_snapshot(&parent.agent_snapshot);
    let state_s0 = AgentWorldCapsule::new(
        agent_checkpoint.snapshot,
        world_snapshot,
        Some(parent_world.clone()),
        parent.components.clone(),
        Some(parent.capsule_id.clone()),
        CapsuleRelation::Checkpoint,
    );
    store.save_capsule(state_s0.clone()).await?;

    let fork_specs = plans
        .iter()
        .map(|plan| {
            Ok(LineagedCounterfactualBranchSpec {
                branch_id: lineage.fork_id(&plan.label)?,
                label: plan.label.clone(),
                hypothesis: plan.hypothesis.clone(),
            })
        })
        .collect::<Result<Vec<_>, String>>()
        .map_err(anyhow::Error::msg)?;
    let fork_capsules =
        fork_lineaged_counterfactual_capsules(provider, store, &state_s0, &fork_specs).await?;

    let (experiences, terminal_capsules) =
        execute_and_cleanup_forks(provider, store, &fork_capsules, runner).await?;

    let cognitive_merge = merge_experiences(&experiences, relations, merge_config)
        .map_err(anyhow::Error::msg)?;
    let merge_application = apply_cognitive_merge(&state_s0.agent_snapshot, &cognitive_merge);

    let s1_world_snapshot = provider.snapshot(parent_world.clone()).await?;
    let state_s1 = AgentWorldCapsule::new(
        merge_application.snapshot.clone(),
        s1_world_snapshot,
        Some(parent_world),
        parent.components.clone(),
        Some(state_s0.capsule_id.clone()),
        CapsuleRelation::Merge,
    );
    store.save_capsule(state_s1.clone()).await?;

    let forks = fork_capsules
        .into_iter()
        .zip(terminal_capsules)
        .zip(experiences)
        .map(
            |((initial_capsule, terminal_capsule), experience)| GenomeOsForkOutcome {
                lineage_id: initial_capsule.branch_id.clone(),
                initial_capsule,
                terminal_capsule,
                experience,
            },
        )
        .collect();

    Ok(GenomeOsCycleReport {
        lineage,
        state_s0,
        state_s0_checkpoint_event: agent_checkpoint.event,
        forks,
        cognitive_merge,
        merge_application,
        state_s1,
    })
}

async fn execute_and_cleanup_forks(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    fork_capsules: &[AgentWorldCapsule],
    runner: &dyn CounterfactualExperienceRunner,
) -> anyhow::Result<(Vec<crate::BranchExperience>, Vec<AgentWorldCapsule>)> {
    let mut experiences = Vec::with_capacity(fork_capsules.len());
    let mut run_error = None;
    for capsule in fork_capsules {
        match runner.run_experience(capsule).await {
            Ok(experience) if experience.branch_id == capsule.branch_id => {
                experiences.push(experience)
            }
            Ok(_) => {
                run_error = Some(anyhow::anyhow!(
                    "experience runner returned a mismatched branch id"
                ));
                break;
            }
            Err(error) => {
                run_error = Some(error);
                break;
            }
        }
    }

    let mut terminal_capsules = Vec::with_capacity(fork_capsules.len());
    let mut cleanup_error = None;
    for capsule in fork_capsules {
        match terminate_capsule(provider, store, capsule, CapsuleLifecycle::Cancelled).await {
            Ok(terminal) => terminal_capsules.push(terminal),
            Err(error) if cleanup_error.is_none() => cleanup_error = Some(error),
            Err(_) => {}
        }
    }
    if let Some(error) = run_error.or(cleanup_error) {
        return Err(error);
    }
    Ok((experiences, terminal_capsules))
}
