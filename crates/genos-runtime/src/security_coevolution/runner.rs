use anyhow::bail;
use chrono::{Duration, Utc};
use genos_core::{LineageDag, LineageEdge, LineageRelation, SnapshotId};
use serde_json::json;

use super::simulation::{base_genome, matchup, spawn_candidates, SpawnContext};
use super::types::{
    CoevolutionGeneration, MutationCandidate, ObserverFinding, SecurityCoevolutionManifest,
    SecurityCoevolutionReport, SecurityPopulation, SecurityScenarioSpec, SecurityWorld,
};

pub fn run_security_coevolution(
    manifest: SecurityCoevolutionManifest,
) -> anyhow::Result<SecurityCoevolutionReport> {
    validate(&manifest)?;
    let root = SnapshotId(manifest.snapshot_ref.clone());
    let created_at = Utc::now();
    let mut world_lineage = LineageDag::default();
    let mut initial_worlds = Vec::new();

    for (index, scenario) in manifest.scenarios.iter().enumerate() {
        let world_id = format!("security-world-{}", scenario.id);
        let world_snapshot = SnapshotId(world_id.clone());
        world_lineage.edges.push(LineageEdge {
            parent_snapshot: root.clone(),
            child_snapshot: world_snapshot,
            relation: LineageRelation::Fork,
            created_at: created_at + Duration::milliseconds(index as i64),
            metadata: json!({
                "scenario": scenario.id,
                "attack_tactic": scenario.attack_tactic,
                "defense_tactic": scenario.defense_tactic,
                "isolated": true,
            }),
        });
        initial_worlds.push(SecurityWorld {
            world_id,
            parent_snapshot: root.clone(),
            scenario_id: scenario.id.clone(),
            red: base_genome(scenario, SecurityPopulation::Red),
            blue: base_genome(scenario, SecurityPopulation::Blue),
            observer: base_genome(scenario, SecurityPopulation::Observer),
        });
    }

    let mut final_worlds = initial_worlds.clone();
    let mut evolution = Vec::new();
    let mut total_genomes_evaluated = initial_worlds.len() * 3;

    for (scenario_index, scenario) in manifest.scenarios.iter().enumerate() {
        let world = &mut final_worlds[scenario_index];
        let mut previous_breach = matchup(scenario, &world.red.genes, &world.blue.genes);

        for generation in 1..=manifest.config.generations {
            let (red_candidates, selected_red) = evolve_red_population(
                scenario,
                world,
                generation,
                &manifest.config,
                manifest.config.seed ^ scenario_index as u64,
            );

            let (blue_candidates, selected_blue) = evolve_blue_population(
                scenario,
                world,
                &selected_red,
                generation,
                &manifest.config,
                manifest.config.seed ^ 0xB10E ^ scenario_index as u64,
            );

            let breach = matchup(scenario, &selected_red.genes, &selected_blue.genes);
            let false_positive_cost = (1.0 - selected_blue.genes.precision) * 0.2;
            let defense_utility = (1.0 - breach - false_positive_cost).clamp(0.0, 1.0);

            let observer_finding = ObserverFinding {
                scenario_id: scenario.id.clone(),
                world_id: world.world_id.clone(),
                generation,
                red_genome_id: selected_red.genome_id.clone(),
                blue_genome_id: selected_blue.genome_id.clone(),
                breach_probability: breach,
                defense_utility,
                false_positive_cost,
                arms_race_delta: breach - previous_breach,
                observation: if breach > previous_breach {
                    "red adaptation outpaced the current defense".to_string()
                } else {
                    "blue adaptation contained the current attack".to_string()
                },
            };

            previous_breach = breach;
            total_genomes_evaluated += red_candidates.len() + blue_candidates.len();
            evolution.push(CoevolutionGeneration {
                scenario_id: scenario.id.clone(),
                generation,
                selected_red: selected_red.genome_id.clone(),
                selected_blue: selected_blue.genome_id.clone(),
                red_candidates,
                blue_candidates,
                observer_finding,
            });

            world.red = selected_red;
            world.blue = selected_blue;
        }
    }

    let primitive_trace = build_security_trace(&manifest, &initial_worlds, &final_worlds, &evolution, &world_lineage, total_genomes_evaluated);

    Ok(SecurityCoevolutionReport {
        name: manifest.name,
        snapshot_ref: manifest.snapshot_ref,
        generations_requested: manifest.config.generations,
        initial_worlds,
        evolution,
        final_worlds,
        world_lineage,
        total_genomes_evaluated,
        primitive_trace,
    })
}

fn evolve_red_population(
    scenario: &SecurityScenarioSpec,
    world: &SecurityWorld,
    generation: u32,
    config: &super::types::SecurityCoevolutionConfig,
    seed: u64,
) -> (Vec<MutationCandidate>, super::types::SecurityGenome) {
    let mut red_candidates = spawn_candidates(
        scenario,
        &world.red,
        SpawnContext {
            generation,
            config,
            seed,
        },
    );
    for candidate in &mut red_candidates {
        candidate.fitness = matchup(scenario, &candidate.genome.genes, &world.blue.genes);
    }
    let selected_red_index = red_candidates
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| {
            left.fitness
                .total_cmp(&right.fitness)
                .then_with(|| right.genome.genome_id.0.cmp(&left.genome.genome_id.0))
        })
        .map(|(index, _)| index)
        .expect("validated non-empty mutations");
    red_candidates[selected_red_index].selected = true;
    let selected_red = red_candidates[selected_red_index].genome.clone();
    (red_candidates, selected_red)
}

fn evolve_blue_population(
    scenario: &SecurityScenarioSpec,
    world: &SecurityWorld,
    selected_red: &super::types::SecurityGenome,
    generation: u32,
    config: &super::types::SecurityCoevolutionConfig,
    seed: u64,
) -> (Vec<MutationCandidate>, super::types::SecurityGenome) {
    let mut blue_candidates = spawn_candidates(
        scenario,
        &world.blue,
        SpawnContext {
            generation,
            config,
            seed,
        },
    );
    for candidate in &mut blue_candidates {
        let breach = matchup(scenario, &selected_red.genes, &candidate.genome.genes);
        let false_positive_cost = (1.0 - candidate.genome.genes.precision) * 0.2;
        candidate.fitness = (1.0 - breach - false_positive_cost).clamp(0.0, 1.0);
    }
    let selected_blue_index = blue_candidates
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| {
            left.fitness
                .total_cmp(&right.fitness)
                .then_with(|| right.genome.genome_id.0.cmp(&left.genome.genome_id.0))
        })
        .map(|(index, _)| index)
        .expect("validated non-empty mutations");
    blue_candidates[selected_blue_index].selected = true;
    let selected_blue = blue_candidates[selected_blue_index].genome.clone();
    (blue_candidates, selected_blue)
}

fn build_security_trace(
    manifest: &SecurityCoevolutionManifest,
    initial_worlds: &[SecurityWorld],
    final_worlds: &[SecurityWorld],
    evolution: &[CoevolutionGeneration],
    world_lineage: &LineageDag,
    total_genomes_evaluated: usize,
) -> crate::AgentPrimitiveTrace {
    let mut primitive_trace = crate::AgentPrimitiveTrace::default();
    primitive_trace.completed(
        crate::AgentPrimitive::Snapshot,
        manifest.snapshot_ref.clone(),
        json!({ "population": "world-0" }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Fork,
        manifest.name.clone(),
        json!({ "isolated_worlds": initial_worlds.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Mutate,
        "red-blue-populations",
        json!({
            "red_mutations": evolution.iter().map(|item| item.red_candidates.len()).sum::<usize>(),
            "blue_mutations": evolution.iter().map(|item| item.blue_candidates.len()).sum::<usize>(),
        }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Run,
        "coevolution-matchups",
        json!({ "evaluated_genomes": total_genomes_evaluated, "observations": evolution.len() }),
    );
    for (scenario, final_world) in manifest.scenarios.iter().zip(final_worlds) {
        let initial_world = initial_worlds
            .iter()
            .find(|world| world.scenario_id == scenario.id)
            .expect("scenario world exists");
        primitive_trace.completed(
            crate::AgentPrimitive::Diff,
            scenario.id.clone(),
            json!({
                "initial_breach_probability": matchup(scenario, &initial_world.red.genes, &initial_world.blue.genes),
                "final_breach_probability": matchup(scenario, &final_world.red.genes, &final_world.blue.genes),
            }),
        );
    }
    primitive_trace.completed(
        crate::AgentPrimitive::Lineage,
        manifest.name.clone(),
        json!({ "world_edges": world_lineage.edges.len(), "generations": evolution.len() }),
    );
    primitive_trace
}

fn validate(manifest: &SecurityCoevolutionManifest) -> anyhow::Result<()> {
    if manifest.scenarios.is_empty()
        || manifest.config.generations == 0
        || manifest.config.mutations_per_parent == 0
        || !(0.0..=1.0).contains(&manifest.config.mutation_scale)
    {
        bail!("invalid security coevolution configuration");
    }
    for scenario in &manifest.scenarios {
        if !(0.0..=1.0).contains(&scenario.baseline_risk) {
            bail!("scenario {} has invalid baseline risk", scenario.id);
        }
        for value in [
            scenario.red_genes.effectiveness,
            scenario.red_genes.adaptability,
            scenario.red_genes.precision,
            scenario.blue_genes.effectiveness,
            scenario.blue_genes.adaptability,
            scenario.blue_genes.precision,
        ] {
            if !(0.0..=1.0).contains(&value) {
                bail!("scenario {} has a gene outside [0, 1]", scenario.id);
            }
        }
    }
    Ok(())
}
