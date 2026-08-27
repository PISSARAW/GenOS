//! Viral dynamics and virophage CLI commands.
//!
//! Cassettes persist at `<root>/cassettes.json` (genome → prophage locus) and
//! honeypot sessions at `<root>/honeypot.json`, so the workflows span
//! invocations like the rest of the `.genos` state.

use crate::args::{
    BurstArgs, CassetteInduceArgs, CassetteIntegrateArgs, TransduceArgs, ViralStatusArgs,
    VirophageDeployArgs, VirophageHarvestArgs, VirophageObserveArgs,
};
use anyhow::{Context, Result};
use genos_core::resilience::viral_dynamics::{
    ProphageLocus, SkillCassette, TransductionCapsule, ViralAction, ViralDynamicsEngine,
    ViralResponseController,
};
use genos_core::resilience::virophage::{AttackGene, HoneypotFactory};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

const NEGATIVE_SELECTION_GAMMA: f32 = 1.0;
const SELF_TOLERANCE_THETA: f32 = 0.9;
const EXCLUSION_THETA: f32 = 0.9;

#[derive(Default, serde::Serialize, serde::Deserialize)]
struct CassetteRegistry(BTreeMap<String, ProphageLocus>);

fn load_registry(root: &Path) -> Result<CassetteRegistry> {
    let path = root.join("cassettes.json");
    if !path.exists() {
        return Ok(CassetteRegistry::default());
    }
    let data = fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
    serde_json::from_str(&data).with_context(|| format!("parsing {}", path.display()))
}

fn save_registry(root: &Path, registry: &CassetteRegistry) -> Result<()> {
    let path = root.join("cassettes.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_string_pretty(registry)?)?;
    Ok(())
}

fn load_honeypots(root: &Path) -> Result<HoneypotFactory> {
    let path = root.join("honeypot.json");
    if !path.exists() {
        return Ok(HoneypotFactory::new());
    }
    let data = fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
    serde_json::from_str(&data).with_context(|| format!("parsing {}", path.display()))
}

fn save_honeypots(root: &Path, factory: &HoneypotFactory) -> Result<()> {
    let path = root.join("honeypot.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_string_pretty(factory)?)?;
    Ok(())
}

/// Activation check: reports which viral mechanism fires for the agent's
/// current stress level without mutating anything.
pub async fn cmd_resilience_viral_status(args: ViralStatusArgs) -> Result<()> {
    let controller = ViralResponseController::default();
    let registry = load_registry(&args.root).unwrap_or_default();
    let locus = registry.0.get(&args.agent_id).cloned().unwrap_or_default();
    match controller.evaluate(args.failures, args.progress, &locus) {
        ViralAction::Nominal { stress } => {
            println!("NOMINAL: stress {stress:.3} below induction threshold; no viral response")
        }
        ViralAction::InduceCassettes {
            stress,
            cassette_ids,
        } => println!(
            "INDUCE CASSETTES: stress {stress:.3}; dormant skills available: {}",
            cassette_ids.join(", ")
        ),
        ViralAction::LyticBurst {
            stress,
            recommended_clones,
        } => println!(
            "LYTIC BURST: stress {stress:.3}; no heritable answer to this failure \
             class; spawn {recommended_clones} divergent clones \
             (`genos resilience burst --genome-id {})`",
            args.agent_id
        ),
    }
    Ok(())
}

pub async fn cmd_resilience_burst(args: BurstArgs) -> Result<()> {
    let engine = ViralDynamicsEngine::default();
    let sigma_cap = engine
        .error_catastrophe_sigma(args.info_length, args.w_max, args.w_avg)
        .ok_or_else(|| {
            anyhow::anyhow!(
                "no admissible exploration: W_max must exceed W_avg with positive info length"
            )
        })?;
    let sigma = if args.sigma <= sigma_cap {
        args.sigma
    } else {
        println!(
            "Requested cloud width {:.3} exceeds error-catastrophe bound {sigma_cap:.3}; clamped.",
            args.sigma
        );
        sigma_cap
    };
    let planned = engine.plan_burst(&args.genome_id, args.clones, sigma, args.seed);
    println!(
        "Spawning {} clones around master sequence `{}` (cloud width {sigma:.3})",
        planned.len(),
        args.genome_id
    );
    for clone in planned {
        println!(
            "  {} | {:?} | offset {:.3} | {}",
            clone.clone_id, clone.operon, clone.mutation_offset, clone.prompt_variant
        );
    }
    Ok(())
}

pub async fn cmd_resilience_cassette_integrate(args: CassetteIntegrateArgs) -> Result<()> {
    let mut registry = load_registry(&args.root)?;
    let locus = registry.0.entry(args.genome_id.clone()).or_default();
    let total = match locus.integrate(
        SkillCassette {
            cassette_id: args.cassette_id.clone(),
            payload_delta: args.payload,
            failure_mode_signature: args.signature,
            state: genos_core::resilience::viral_dynamics::CassetteState::Dormant,
        },
        NEGATIVE_SELECTION_GAMMA,
        EXCLUSION_THETA,
    ) {
        Ok(_state) => locus.cassettes().len(),
        Err(e) => anyhow::bail!("{e:?}"),
    };
    save_registry(&args.root, &registry)?;
    println!(
        "Integrated cassette `{}` into prophage locus of `{}` (dormant; total {total})",
        args.cassette_id, args.genome_id
    );
    Ok(())
}

pub async fn cmd_resilience_cassette_induce(args: CassetteInduceArgs) -> Result<()> {
    let mut registry = load_registry(&args.root)?;
    let controller = ViralResponseController::default();
    let Some(locus) = registry.0.get_mut(&args.genome_id) else {
        anyhow::bail!("no prophage locus registered for genome {}", args.genome_id);
    };
    match controller.evaluate(args.failures, args.progress, locus) {
        ViralAction::Nominal { stress } => {
            println!(
                "NOMINAL: stress {stress:.3} below induction threshold; cassettes stay dormant"
            )
        }
        ViralAction::LyticBurst { stress, .. } => {
            println!("ESCALATION: stress {stress:.3} exceeds burst threshold; run `genos resilience burst")
        }
        ViralAction::InduceCassettes {
            stress,
            cassette_ids,
        } => {
            let induced = locus.induce_all();
            save_registry(&args.root, &registry)?;
            if induced.is_empty() {
                println!("No dormant cassettes left under stress {stress:.3}.");
            } else {
                println!(
                    "INDUCED under stress {stress:.3}: {}",
                    cassette_ids.join(", ")
                );
            }
        }
    }
    Ok(())
}

pub async fn cmd_resilience_transduce(args: TransduceArgs) -> Result<()> {
    let engine = ViralDynamicsEngine::default();
    let capsule = engine
        .assemble_capsule(
            &args.capsule_id,
            &args.from_genome,
            &args.payload,
            args.signature.clone(),
            &args.evaluation_proof_hash,
        )
        .map_err(|e| anyhow::anyhow!(e))?;
    if !engine.passes_negative_selection(
        &capsule.failure_mode_signature,
        &[args.self_signature],
        NEGATIVE_SELECTION_GAMMA,
        SELF_TOLERANCE_THETA,
    ) {
        anyhow::bail!(
            "capsule `{}` resonates with recipient self-corpus; rejected by negative selection",
            capsule.capsule_id
        );
    }
    let registry = load_registry(&args.root)?;
    // Superinfection exclusion is checked against every known lineage.
    let conflicts: Vec<String> = registry
        .0
        .iter()
        .filter(|(_, locus)| !excludes_all(&capsule, &locus.resident_signatures()))
        .map(|(genome, _)| genome.clone())
        .collect();
    if conflicts.is_empty() {
        println!(
            "Capsule `{}` assembled from `{}, passed negative selection, no superinjection conflict.",
            capsule.capsule_id, capsule.provenance_genome
        );
    } else {
        println!(
            "Capsule `{}` accepted after review gates; near-equivalent residents already at: {}",
            capsule.capsule_id,
            conflicts.join(", ")
        );
    }
    Ok(())
}

fn excludes_all(capsule: &TransductionCapsule, residents: &[Vec<f32>]) -> bool {
    use genos_core::resilience::viral_dynamics::rbf_affinity;
    residents.iter().all(|r| {
        rbf_affinity(r, &capsule.failure_mode_signature, NEGATIVE_SELECTION_GAMMA) < EXCLUSION_THETA
    })
}

pub async fn cmd_resilience_virophage_deploy(args: VirophageDeployArgs) -> Result<()> {
    let mut factory = load_honeypots(&args.root)?;
    let (id, source_sig, initial_yield) = {
        let session = factory.confirm_threat(&args.session_id, &args.source_signature);
        (
            session.session_id.clone(),
            session.source_signature.clone(),
            session.virophage.attacker_yield(),
        )
    };
    save_honeypots(&args.root, &factory)?;
    println!(
        "Antigen confirmed from `{source_sig}: virophage deployed in honeypot session `{id}.
Attacker yield starts at {initial_yield:.2} and decays per observed playbook iteration."
    );
    Ok(())
}

pub async fn cmd_resilience_virophage_observe(args: VirophageObserveArgs) -> Result<()> {
    let mut factory = load_honeypots(&args.root)?;
    let session = factory
        .sessions_mut()
        .iter_mut()
        .find(|s| s.session_id == args.session_id)
        .ok_or_else(|| anyhow::anyhow!("unknown honeypot session {}", args.session_id))?;
    let gene = AttackGene {
        signature_hash: args.gene_hash.clone(),
        embedding: args.embedding,
        playbook_variant_id: format!("pb-{}", args.gene_hash),
    };
    let sig = session.source_signature.clone();
    let yield_now = session
        .record_iteration(&gene)
        .map_err(|e| anyhow::anyhow!(e))?;
    let sterile = session.sterile();
    save_honeypots(&args.root, &factory)?;
    println!(
        "Iteration logged for `{sig}: attacker yield now {yield_now:.4}{}",
        if sterile { " — STERILE" } else { "" }
    );
    Ok(())
}

pub async fn cmd_resilience_virophage_harvest(args: VirophageHarvestArgs) -> Result<()> {
    let mut factory = load_honeypots(&args.root)?;
    let report = factory
        .sterilize_session(&args.session_id)
        .map_err(|e| anyhow::anyhow!(e))?;
    save_honeypots(&args.root, &factory)?;
    println!(
        "Session `{0} sterilized: {1} attack genes harvested for review; {2} forensic granules preserved to DLQ.",
        report.session_id,
        report.harvested_genes,
        report.forensics.len()
    );
    Ok(())
}
