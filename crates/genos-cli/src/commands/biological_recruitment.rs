use crate::args::BiologicalCmd;
use serde_json::json;

pub(super) struct MissionRuntime<'a> {
    pub(super) command: &'a BiologicalCmd,
    pub(super) store: &'a genos_store::BiologicalReceiptStore,
    pub(super) tick: u64,
}

struct RecruitmentRuntime<'a> {
    command: &'a BiologicalCmd,
    store: &'a genos_store::BiologicalReceiptStore,
    tick: u64,
}

#[derive(serde::Deserialize)]
struct RecruitmentSpec {
    tissue: String,
    roles: Vec<String>,
    capabilities: Vec<String>,
    budget: f64,
    candidate_cost: f64,
}

pub(super) fn persist_mission_operations(
    ecosystem: &mut genos_orchestrator::GenosEcosystem,
    runtime: MissionRuntime<'_>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut receipts = Vec::new();
    receipts.extend(persist_division(ecosystem, &runtime)?);
    receipts.extend(persist_reproduction(ecosystem, runtime.command, runtime.store)?);
    receipts.extend(persist_choanocyte_stream(ecosystem, &runtime)?);
    receipts.extend(run_recruitment(ecosystem, RecruitmentRuntime {
        command: runtime.command,
        store: runtime.store,
        tick: runtime.tick,
    })?);
    Ok(receipts)
}

fn persist_division(
    ecosystem: &mut genos_orchestrator::GenosEcosystem,
    runtime: &MissionRuntime<'_>,
) -> Result<Option<serde_json::Value>, String> {
    if !runtime.command.divide { return Ok(None); }
    let receipt = ecosystem.divide_for_mission_with_snapshot(runtime.store, runtime.tick)
        .map_err(|error| format!("mission division receipt was not persisted: {error:?}"))?;
    serde_json::to_value(receipt).map(Some).map_err(|error| error.to_string())
}

fn persist_reproduction(
    ecosystem: &mut genos_orchestrator::GenosEcosystem,
    command: &BiologicalCmd,
    store: &genos_store::BiologicalReceiptStore,
) -> Result<Option<serde_json::Value>, String> {
    if !command.reproduce { return Ok(None); }
    let receipt = ecosystem.reproduce_and_archive_lineage(store)
        .map_err(|error| format!("mission reproduction lineage was not persisted: {error}"))?;
    serde_json::to_value(receipt).map(Some).map_err(|error| error.to_string())
}

fn persist_choanocyte_stream(
    ecosystem: &mut genos_orchestrator::GenosEcosystem,
    runtime: &MissionRuntime<'_>,
) -> Result<Option<serde_json::Value>, String> {
    let Some(path) = &runtime.command.choanocyte_stream else { return Ok(None); };
    let bytes = std::fs::read(path)
        .map_err(|error| format!("Choanocyte stream could not be read: {error}"))?;
    let stream: genos_orchestrator::choanocyte_receipt::MissionChoanocyteStream =
        serde_json::from_slice(&bytes)
            .map_err(|error| format!("Choanocyte stream is invalid: {error}"))?;
    ecosystem.filter_stream_and_persist(&stream, runtime.store).map(Some)
        .map_err(|error| format!("Choanocyte stream receipt was not persisted: {error}"))
}

fn run_recruitment(
    ecosystem: &mut genos_orchestrator::GenosEcosystem,
    runtime: RecruitmentRuntime<'_>,
) -> Result<Option<serde_json::Value>, String> {
    let (dna_path, spec_path) = match
        (&runtime.command.recruit_dna, &runtime.command.recruitment_spec)
    {
        (Some(dna_path), Some(spec_path)) => (dna_path, spec_path),
        (None, None) => return Ok(None),
        _ => return Err("DNA recruitment requires both --recruit-dna and --recruitment-spec".into()),
    };
    let dna_bytes = std::fs::read(dna_path)
        .map_err(|error| format!("candidate DNA could not be read: {error}"))?;
    let dna = genos_dna::validate::validate_bytes(&dna_bytes)?;
    let spec_bytes = std::fs::read(spec_path)
        .map_err(|error| format!("recruitment specification could not be read: {error}"))?;
    let spec: RecruitmentSpec = serde_json::from_slice(&spec_bytes)
        .map_err(|error| format!("recruitment specification is invalid: {error}"))?;
    validate_recruitment_spec(&spec)?;
    let demand = genos_orchestrator::Demand {
        roles: spec.roles,
        capabilities: spec.capabilities,
        budget: spec.budget,
    };
    let decision = ecosystem.recruit_dna_for_mission(
        genos_orchestrator::epigenetic_recruitment_recovery::EpigeneticRecruitmentRequest {
            store: runtime.store,
            tissue: &spec.tissue,
            demand: &demand,
            candidates: &[(&dna, spec.candidate_cost)],
            tick: runtime.tick,
        },
    )?;
    Ok(Some(json!({
        "operation": "epigenetic_dna_recruitment",
        "decision": {
            "feasible": decision.feasible,
            "spent": decision.spent,
            "selected": decision.selected.iter().map(|selection| json!({
                "key": selection.key,
                "candidate": selection.candidate,
                "role": selection.role,
                "cost": selection.cost,
            })).collect::<Vec<_>>(),
            "rejected": decision.rejected,
        },
    })))
}

fn validate_recruitment_spec(spec: &RecruitmentSpec) -> Result<(), String> {
    if spec.tissue.trim().is_empty() || (spec.roles.is_empty() && spec.capabilities.is_empty()) {
        return Err("recruitment specification needs a tissue and at least one demand key".into());
    }
    if !spec.budget.is_finite() || spec.budget < 0.0
        || !spec.candidate_cost.is_finite() || spec.candidate_cost < 0.0
    {
        return Err("recruitment budget and candidate_cost must be finite and non-negative".into());
    }
    Ok(())
}
