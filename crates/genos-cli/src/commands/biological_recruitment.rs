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
    if runtime.command.divide {
        let division = ecosystem.divide_for_mission(runtime.store)
            .map_err(|error| format!("mission division receipt was not persisted: {error:?}"))?;
        receipts.push(serde_json::to_value(division).map_err(|error| error.to_string())?);
    }
    let recruitment = run_recruitment(ecosystem, RecruitmentRuntime {
        command: runtime.command,
        store: runtime.store,
        tick: runtime.tick,
    })?;
    if let Some(receipt) = recruitment {
        receipts.push(receipt);
    }
    Ok(receipts)
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
