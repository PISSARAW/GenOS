use crate::args::{
    BugInvestigationArgs, IncidentExperimentArgs, ScientificExperimentArgs,
    SecurityCoevolutionArgs, WorkspaceExperimentArgs,
};
use anyhow::{bail, Context};
use genos_runtime::{
    AgentPrimitive, AgentPrimitiveTrace, BranchEvolutionConfig, BranchExperience,
    BugInvestigationManifest, ClaimRelation, CognitiveClaim, CognitiveMergeApplication,
    CognitiveMergeConfig, CognitiveMergeReport, CohortControls, EvolutionBranchSpec,
    HeredityCohortMember, IncidentSearchManifest, PairedBehaviorTrial, ReproducibilityThresholds,
    ScientificExperimentManifest, SecurityCoevolutionManifest, SelectionCandidate,
    SelectionConstraints, WorkspaceExperimentManifest,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

#[derive(Serialize)]
pub struct ExperimentRunOutput<T> {
    pub report_path: String,
    pub report: T,
}

#[derive(Serialize)]
pub struct IncidentSummaryOutput {
    pub report_path: String,
    pub snapshot_ref: String,
    pub initial_universes: usize,
    pub partial_reproductions: usize,
    pub recursive_descendants: usize,
    pub perfect_reproductions: usize,
    pub perfect_branch_ids: Vec<String>,
    pub primitives: Vec<AgentPrimitive>,
}

#[derive(Serialize)]
pub struct ScientificSummaryOutput {
    pub report_path: String,
    pub question: String,
    pub hypotheses: usize,
    pub recursive_hypotheses: usize,
    pub critiques: usize,
    pub reproductions: usize,
    pub reproduction_mismatches: usize,
    pub rewinds: usize,
    pub artifacts: usize,
    pub primitives: Vec<AgentPrimitive>,
}

#[derive(Serialize)]
pub struct SecurityCoevolutionSummaryOutput {
    pub report_path: String,
    pub worlds: usize,
    pub generations_per_world: u32,
    pub recorded_generations: usize,
    pub red_mutations: usize,
    pub blue_mutations: usize,
    pub observer_findings: usize,
    pub total_genomes_evaluated: usize,
    pub final_breach_probabilities: Vec<(String, f64)>,
    pub primitives: Vec<AgentPrimitive>,
}

#[derive(Serialize)]
pub struct BugInvestigationSummaryOutput {
    pub report_path: String,
    pub bug: String,
    pub hypotheses: usize,
    pub supported: Vec<String>,
    pub rejected: Vec<String>,
    pub selected_fix: Option<String>,
    pub evidence_records: usize,
    pub selection_note: String,
    pub primitives: Vec<AgentPrimitive>,
}

#[derive(Deserialize)]
pub struct HeredityManifest {
    pub controls: CohortControls,
    pub members: Vec<HeredityCohortMember>,
}

#[derive(Deserialize)]
pub struct SelectionManifest {
    pub constraints: SelectionConstraints,
    pub candidates: Vec<SelectionCandidate>,
}

#[derive(Deserialize)]
pub struct ReproducibilityManifest {
    pub thresholds: ReproducibilityThresholds,
    pub trials: Vec<PairedBehaviorTrial>,
}

#[derive(Deserialize)]
pub struct CognitiveMergeManifest {
    #[serde(default)]
    pub claims: Vec<CognitiveClaim>,
    #[serde(default)]
    pub experiences: Vec<BranchExperience>,
    #[serde(default)]
    pub relations: Vec<ClaimRelation>,
    #[serde(default)]
    pub config: CognitiveMergeConfig,
    pub parent_snapshot: Option<genos_core::AgentSnapshot>,
}

#[derive(Deserialize)]
pub struct BranchEvolutionManifest {
    pub config: BranchEvolutionConfig,
    pub branches: Vec<EvolutionBranchSpec>,
}

#[derive(Serialize)]
pub struct CognitiveMergeOutput {
    pub report: CognitiveMergeReport,
    pub application: Option<CognitiveMergeApplication>,
}

pub fn primitive_sequence(trace: &AgentPrimitiveTrace) -> Vec<AgentPrimitive> {
    let mut sequence = Vec::new();
    for invocation in &trace.invocations {
        if !sequence.contains(&invocation.primitive) {
            sequence.push(invocation.primitive.clone());
        }
    }
    sequence
}

pub fn read_manifest<T: DeserializeOwned>(path: &Path) -> anyhow::Result<T> {
    let bytes = std::fs::read(path)
        .with_context(|| format!("reading experiment manifest {}", path.display()))?;
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("yaml" | "yml") => Ok(serde_yaml::from_slice(&bytes)?),
        _ => Ok(serde_json::from_slice(&bytes)?),
    }
}

pub fn read_value(path: &Path) -> anyhow::Result<Value> {
    read_manifest(path)
}

#[allow(clippy::too_many_arguments)]
pub fn set_object_field(
    value: &mut Value,
    field: &str,
    replacement: Value,
    source: &Path,
) -> anyhow::Result<()> {
    let object = value.as_object_mut().with_context(|| {
        format!(
            "direct experiment plan {} must be a YAML/JSON object",
            source.display()
        )
    })?;
    object.insert(field.to_string(), replacement);
    Ok(())
}

pub fn deserialize_plan<T: DeserializeOwned>(value: Value, source: &Path) -> anyhow::Result<T> {
    serde_json::from_value(value)
        .with_context(|| format!("validating direct experiment plan {}", source.display()))
}

pub fn path_value(path: &Path) -> Value {
    Value::String(path.to_string_lossy().into_owned())
}

pub fn nested_or_whole(mut value: Value, field: &str) -> Value {
    value
        .as_object_mut()
        .and_then(|object| object.remove(field))
        .unwrap_or(value)
}

pub fn read_dataset(path: &Path) -> anyhow::Result<Vec<String>> {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("yaml" | "yml" | "json") => read_manifest(path),
        _ => {
            let contents = std::fs::read_to_string(path)
                .with_context(|| format!("reading scientific dataset {}", path.display()))?;
            let records: Vec<_> = contents
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_owned)
                .collect();
            if records.is_empty() {
                bail!("scientific dataset {} contains no records", path.display());
            }
            Ok(records)
        }
    }
}

pub fn workspace_manifest(
    args: &WorkspaceExperimentArgs,
) -> anyhow::Result<WorkspaceExperimentManifest> {
    match (&args.manifest, &args.repo, &args.plan) {
        (Some(manifest_path), None, None) => {
            let mut manifest: WorkspaceExperimentManifest = read_manifest(manifest_path)?;
            if manifest.seed_dir.is_relative() {
                let base = manifest_path.parent().unwrap_or_else(|| Path::new("."));
                manifest.seed_dir = base.join(&manifest.seed_dir);
            }
            Ok(manifest)
        }
        (None, Some(repo), Some(plan_path)) => {
            let mut plan = read_value(plan_path)?;
            set_object_field(&mut plan, "seed_dir", path_value(repo), plan_path)?;
            deserialize_plan(plan, plan_path)
        }
        (Some(_), _, _) => bail!("MANIFEST cannot be combined with --repo or --plan"),
        _ => bail!("provide either MANIFEST or both --repo PATH and --plan PATH"),
    }
}

pub fn incident_manifest(args: &IncidentExperimentArgs) -> anyhow::Result<IncidentSearchManifest> {
    match (
        &args.manifest,
        &args.snapshot,
        &args.evidence,
        &args.search_plan,
    ) {
        (Some(manifest_path), None, None, None) => read_manifest(manifest_path),
        (None, Some(snapshot), Some(evidence_path), Some(plan_path)) => {
            let mut evidence = nested_or_whole(read_value(evidence_path)?, "evidence");
            set_object_field(
                &mut evidence,
                "snapshot_ref",
                Value::String(snapshot.clone()),
                evidence_path,
            )?;
            let mut plan = read_value(plan_path)?;
            set_object_field(&mut plan, "evidence", evidence, plan_path)?;
            deserialize_plan(plan, plan_path)
        }
        (Some(_), _, _, _) => {
            bail!("MANIFEST cannot be combined with --snapshot, --evidence, or --search-plan")
        }
        _ => bail!(
            "provide either MANIFEST or --snapshot REF, --evidence PATH, and --search-plan PATH"
        ),
    }
}

pub fn scientific_manifest(
    args: &ScientificExperimentArgs,
) -> anyhow::Result<ScientificExperimentManifest> {
    match (&args.manifest, &args.dataset, &args.research_plan) {
        (Some(manifest_path), None, None) => read_manifest(manifest_path),
        (None, Some(dataset_path), Some(plan_path)) => {
            let records = serde_json::to_value(read_dataset(dataset_path)?)?;
            let mut plan = read_value(plan_path)?;
            set_object_field(&mut plan, "records", records, plan_path)?;
            deserialize_plan(plan, plan_path)
        }
        (Some(_), _, _) => {
            bail!("MANIFEST cannot be combined with --dataset or --research-plan")
        }
        _ => bail!("provide either MANIFEST or both --dataset PATH and --research-plan PATH"),
    }
}

pub fn security_manifest(
    args: &SecurityCoevolutionArgs,
) -> anyhow::Result<SecurityCoevolutionManifest> {
    match (&args.manifest, &args.environment, &args.evolution_plan) {
        (Some(manifest_path), None, None) => read_manifest(manifest_path),
        (None, Some(environment_path), Some(plan_path)) => {
            let scenarios = nested_or_whole(read_value(environment_path)?, "scenarios");
            let mut plan = read_value(plan_path)?;
            set_object_field(&mut plan, "scenarios", scenarios, plan_path)?;
            deserialize_plan(plan, plan_path)
        }
        (Some(_), _, _) => {
            bail!("MANIFEST cannot be combined with --environment or --evolution-plan")
        }
        _ => bail!("provide either MANIFEST or both --environment PATH and --evolution-plan PATH"),
    }
}

pub fn bug_manifest(args: &BugInvestigationArgs) -> anyhow::Result<BugInvestigationManifest> {
    match (&args.manifest, &args.repo, &args.plan) {
        (Some(manifest_path), None, None) => {
            let mut manifest: BugInvestigationManifest = read_manifest(manifest_path)?;
            if manifest.seed_dir.is_relative() {
                let base = manifest_path.parent().unwrap_or_else(|| Path::new("."));
                manifest.seed_dir = base.join(&manifest.seed_dir);
            }
            Ok(manifest)
        }
        (None, Some(repo), Some(plan_path)) => {
            let mut plan = read_value(plan_path)?;
            set_object_field(&mut plan, "seed_dir", path_value(repo), plan_path)?;
            deserialize_plan(plan, plan_path)
        }
        (Some(_), _, _) => bail!("MANIFEST cannot be combined with --repo or --plan"),
        _ => bail!("provide either MANIFEST or both --repo PATH and --plan PATH"),
    }
}
