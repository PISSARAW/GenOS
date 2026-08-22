use genos_core::{AgentGenome, LamarckianMutation};

/// Run a single step of Lamarckian evolution.
/// Evaluates the agent, infers what needs to change, and proposes mutations for the child.
pub fn lamarckian_evolution_step(parent: &mut AgentGenome) -> Vec<LamarckianMutation> {
    let mut mutations = Vec::new();

    // 1. Evaluate parent
    // 2. Infer trait claims
    // 3. Propose mutations (simple heuristic for now)
    for claim in &parent.inferred_traits {
        // Example heuristic: if observations > 5 and estimate < 0.5, we want to mutate target_gene.
        if claim.estimate < 0.5 {
            mutations.push(LamarckianMutation {
                target_gene: claim.trait_name.clone(),
                epigenetic_marker: 0.1, // Positive mutation
            });
        }
    }
    mutations
}
