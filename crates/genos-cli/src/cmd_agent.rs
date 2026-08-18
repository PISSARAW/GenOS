use crate::args::{
    AgentBreedArgs, AgentCreateArgs, AgentForkFromSnapshotArgs, AgentInferTraitsArgs,
    AgentInspectArgs, AgentMutateArgs, AgentPromoteTraitArgs, OutputFormat,
};
use crate::output::{print_serialized, write_serialized, AgentForkOutput, ForkEntry};
use crate::resolve::{event_store_from, read_genome, resolve_snapshot_ref, snapshot_store_from};
use anyhow::{bail, Result};
use chrono::Utc;
use genos_core::{
    attach_inferred_trait, fork_first_event_sequence, fork_snapshot, infer_trait_claim,
    mutate_cognition, promote_inferred_trait, AgentEvent, AgentEventType, AgentGenome,
    AgentSnapshot, Capability, CognitionConfig, CorrelationId, EventId, GenomeId, GenomeVersion,
    Identity, MemoryPolicy, ModelPolicy, Objective, PhenotypeObservation, Policy, ToolPermission,
    ToolPolicy,
};
use genos_eval::{recombine_measured_trait, TraitEstimate};
use genos_runtime::{breed_genomes, BreedingTraitMapping};
use genos_store::{EventStore, LocalEventStore, LocalSnapshotStore, SnapshotStore};
use serde::Deserialize;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

pub fn cmd_init() -> Result<()> {
    for directory in [
        ".genos/agents",
        ".genos/snapshots",
        ".genos/worlds",
        ".genos/capsules",
        ".genos/events",
    ] {
        fs::create_dir_all(directory)?;
    }
    println!("initialized .genos workspace");
    Ok(())
}

pub fn cmd_agent_create(args: AgentCreateArgs) -> Result<()> {
    let genome = AgentGenome {
        id: GenomeId::new(),
        parent_genome: None,
        parent_genomes: vec![],
        mutation: None,
        version: GenomeVersion("0.1.0".to_string()),
        identity: Identity {
            name: args.name.clone(),
            role: args.role,
        },
        cognition: CognitionConfig {
            chromosomes: vec![
                genos_core::Chromosome {
                    name: "C1".to_string(),
                    loci: vec![
                        genos_core::Locus { gene_name: "exploration".to_string(), value: 0.7 },
                        genos_core::Locus { gene_name: "risk_tolerance".to_string(), value: 0.25 },
                        genos_core::Locus { gene_name: "verification_threshold".to_string(), value: 0.8 },
                    ],
                }
            ],
            planning_depth: 6,
            regulators: vec![],
        },
        objectives: vec![Objective {
            key: "tests_pass".to_string(),
            description: "Run tests before completion".to_string(),
        }],
        policies: vec![Policy {
            key: "evidence_before_claim".to_string(),
            description: "Claims require evidence".to_string(),
        }],
        capabilities: vec![Capability {
            name: "counterfactual_forking".to_string(),
            enabled: false,
        }],
        memory_policy: MemoryPolicy {
            working_max_items: 100,
            episodic_enabled: true,
            semantic_enabled: true,
        },
        model_policy: ModelPolicy {
            strategy: "provider-agnostic".to_string(),
            preferred_providers: vec![],
            allow_local: true,
        },
        tool_policy: ToolPolicy {
            permissions: vec![
                ToolPermission {
                    tool: "filesystem".to_string(),
                    scope: "workspace".to_string(),
                    enabled: true,
                },
                ToolPermission {
                    tool: "shell".to_string(),
                    scope: "sandboxed".to_string(),
                    enabled: true,
                },
                ToolPermission {
                    tool: "network".to_string(),
                    scope: "denied".to_string(),
                    enabled: false,
                },
            ],
        },
        inferred_traits: vec![],
        breeding: None,
    };

    let path = args
        .out
        .unwrap_or_else(|| PathBuf::from(format!(".genos/agents/{}.yaml", args.name)));
    write_serialized(&path, &genome, args.format)?;
    println!("agent genome written to {}", path.display());
    Ok(())
}

pub fn cmd_agent_inspect(args: AgentInspectArgs) -> Result<()> {
    let genome: AgentGenome = read_genome(&args.path)?;
    print_serialized(&genome, args.format)
}

pub fn cmd_agent_mutate(args: AgentMutateArgs) -> Result<()> {
    if args.drives.is_empty() {
        bail!("nothing to mutate: pass at least one --drive name=delta");
    }
    let parent: AgentGenome = read_genome(&args.path)?;
    let mut drive_changes = std::collections::BTreeMap::new();
    for (name, delta) in args.drives {
        let current = parent.cognition.get_drive(&name).unwrap_or(0.5);
        drive_changes.insert(name.clone(), bounded_delta(&name, current, delta)?);
    }
    let mut child = mutate_cognition(&parent, drive_changes);
    child.version = GenomeVersion(next_version(&parent.version.0));

    let path = args.out.unwrap_or_else(|| {
        let stem = args
            .path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("agent");
        args.path.with_file_name(format!("{stem}-v2.agent"))
    });
    write_serialized(&path, &child, args.format)?;
    println!("mutated agent genome written to {}", path.display());
    Ok(())
}

#[derive(Deserialize)]
struct BreedEvidenceManifest {
    child_name: String,
    traits: Vec<BreedTraitEvidence>,
}

#[derive(Deserialize)]
struct BreedTraitEvidence {
    genome_field: String,
    parent_a: TraitEstimate,
    parent_b: TraitEstimate,
    parent_a_weight: f64,
}

pub fn cmd_agent_breed(args: AgentBreedArgs) -> Result<()> {
    let alice = read_genome(&args.alice)?;
    let bob = read_genome(&args.bob)?;
    let raw = fs::read(&args.evidence)?;
    let manifest: BreedEvidenceManifest =
        match args.evidence.extension().and_then(|value| value.to_str()) {
            Some("yaml" | "yml") => serde_yaml::from_slice(&raw)?,
            _ => serde_json::from_slice(&raw)?,
        };
    let mappings = manifest
        .traits
        .into_iter()
        .map(|trait_evidence| {
            let target = recombine_measured_trait(
                trait_evidence.parent_a,
                trait_evidence.parent_b,
                trait_evidence.parent_a_weight,
            )
            .map_err(anyhow::Error::msg)?;
            Ok(BreedingTraitMapping {
                genome_field: trait_evidence.genome_field,
                target,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let child =
        breed_genomes(&alice, &bob, &manifest.child_name, &mappings, &genos_core::RecombinationStrategy::HomologousRecombination).map_err(anyhow::Error::msg)?;
    write_serialized(&args.out, &child, args.format)?;
    println!("bred agent genome written to {}", args.out.display());
    Ok(())
}

pub fn cmd_agent_infer_traits(args: AgentInferTraitsArgs) -> Result<()> {
    let mut genome = read_genome(&args.genome)?;
    let observations = args
        .phenotypes
        .iter()
        .map(|path| {
            let raw = fs::read(path)?;
            match path.extension().and_then(|value| value.to_str()) {
                Some("yaml" | "yml") => Ok(serde_yaml::from_slice::<PhenotypeObservation>(&raw)?),
                _ => Ok(serde_json::from_slice::<PhenotypeObservation>(&raw)?),
            }
        })
        .collect::<Result<Vec<_>>>()?;
    for trait_name in &args.traits {
        let claim = infer_trait_claim(&observations, trait_name)
            .ok_or_else(|| anyhow::anyhow!("no observations found for trait {trait_name}"))?;
        attach_inferred_trait(&mut genome, claim);
    }
    write_serialized(&args.out, &genome, args.format)?;
    println!(
        "genome with inferred traits written to {}",
        args.out.display()
    );
    Ok(())
}

pub fn cmd_agent_promote_trait(args: AgentPromoteTraitArgs) -> Result<()> {
    let genome = read_genome(&args.genome)?;
    let child = promote_inferred_trait(&genome, &args.trait_name, &args.field)
        .map_err(anyhow::Error::msg)?;
    write_serialized(&args.out, &child, args.format)?;
    println!("promoted trait genome written to {}", args.out.display());
    Ok(())
}

fn bounded_delta(field: &str, value: f32, delta: f32) -> Result<f32> {
    let next = value + delta;
    if !(0.0..=1.0).contains(&next) {
        bail!("{field} mutation produces {next}; expected a value between 0 and 1");
    }
    Ok(next)
}

fn next_version(version: &str) -> String {
    let Some((prefix, patch)) = version.rsplit_once('.') else {
        return format!("{version}+mutation");
    };
    patch
        .parse::<u64>()
        .map(|value| format!("{prefix}.{}", value + 1))
        .unwrap_or_else(|_| format!("{version}+mutation"))
}

pub async fn cmd_agent_fork_from_snapshot(args: AgentForkFromSnapshotArgs) -> Result<()> {
    if args.count == 0 {
        bail!("--count must be at least 1");
    }

    let snapshot_store = snapshot_store_from(args.snapshots, &args.root);
    let parent = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;

    let event_store = if args.emit_events {
        Some(event_store_from(args.events, &args.root))
    } else {
        None
    };

    // One correlation id ties the whole fan-out together across the sibling branches.
    let correlation_id = CorrelationId::new();
    let mut forks = Vec::with_capacity(args.count as usize);

    let out_dir = args.out_dir.clone();
    let out_prefix = args.out_prefix.clone();
    let save = args.save;
    for index in 1..=args.count {
        match build_fork_entry(
            index,
            &parent,
            out_dir.as_ref(),
            &out_prefix,
            save,
            &snapshot_store,
            event_store.as_ref(),
            &correlation_id,
        )
        .await
        {
            Ok(mut entry) => {
                entry.status = "success".to_string();
                forks.push(entry);
            }
            Err(error) => forks.push(ForkEntry {
                index,
                snapshot_id: String::new(),
                agent_id: String::new(),
                branch_id: String::new(),
                first_event_sequence: 0,
                path: None,
                fork_event_id: None,
                status: "failed".to_string(),
                error: Some(error.to_string()),
            }),
        }
    }

    let out = AgentForkOutput {
        parent_snapshot_id: parent.snapshot_id.0.clone(),
        parent_agent_id: parent.agent_id.0.clone(),
        parent_branch_id: parent.branch_id.0.clone(),
        count: forks.len(),
        saved_to_store: save,
        snapshot_store_path: save.then(|| snapshot_store.file_path().display().to_string()),
        event_store_path: event_store
            .as_ref()
            .map(|store| store.file_path().display().to_string()),
        forks,
    };

    print_serialized(&out, args.format)
}

// 8 parameters: kept inline because the alternative (a builder struct for one
// private helper) would obscure the per-fork flow more than it clarifies.
// The two store refs are shared across the whole fan-out and would not benefit
// from being merged with the per-fork data.
#[allow(clippy::too_many_arguments)]
async fn build_fork_entry(
    index: u32,
    parent: &AgentSnapshot,
    out_dir: Option<&std::path::PathBuf>,
    out_prefix: &str,
    save: bool,
    snapshot_store: &LocalSnapshotStore,
    event_store: Option<&LocalEventStore>,
    correlation_id: &CorrelationId,
) -> Result<ForkEntry> {
    let fork = fork_snapshot(parent);
    let first_event_sequence = fork_first_event_sequence(&fork);

    let path = match out_dir {
        Some(dir) => {
            let path = dir.join(format!("{out_prefix}-{index}.json"));
            write_serialized(&path, &fork, OutputFormat::Json)?;
            Some(path.display().to_string())
        }
        None => None,
    };

    let fork_event_id = match event_store {
        Some(store) => {
            let event = AgentEvent {
                event_id: EventId::new(),
                agent_id: fork.agent_id.clone(),
                branch_id: Some(fork.branch_id.clone()),
                sequence: first_event_sequence,
                timestamp: Utc::now(),
                event_type: AgentEventType::ForkCreated,
                payload: json!({
                    "parent_snapshot_id": parent.snapshot_id.0,
                    "parent_agent_id": parent.agent_id.0,
                    "parent_branch_id": parent.branch_id.0,
                    "fork_index": index,
                    "fork_snapshot_id": fork.snapshot_id.0,
                }),
                causation_id: None,
                correlation_id: Some(correlation_id.clone()),
            };
            let event_id = event.event_id.0.clone();
            store.append(event).await?;
            Some(event_id)
        }
        None => None,
    };

    if save {
        snapshot_store.save_snapshot(fork.clone()).await?;
    }

    Ok(ForkEntry {
        index,
        snapshot_id: fork.snapshot_id.0.clone(),
        agent_id: fork.agent_id.0.clone(),
        branch_id: fork.branch_id.0.clone(),
        first_event_sequence,
        path,
        fork_event_id,
        status: "success".to_string(),
        error: None,
    })
}
