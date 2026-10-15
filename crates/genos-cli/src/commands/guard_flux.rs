use crate::args::GuardFluxCmd;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::guard_cell_durable::MissionGuardFluxCommand;
use genos_orchestrator::GenosEcosystem;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

struct GuardFluxExecution<'a> {
    command: GuardFluxCmd,
    mission_id: Uuid,
    store: &'a BiologicalReceiptStore,
    authority: Option<super::cli_authority::VerifiedAuthority>,
}

/// Run one mission-scoped guard-cell backpressure operation and persist its receipt.
pub fn execute(cmd: GuardFluxCmd) -> Result<(), String> {
    let workspace = super::cli_authority::workspace_root()?;
    let authority = authorize(&cmd, &workspace)?;
    execute_in_workspace(cmd, &workspace, authority)
}

fn authorize(cmd: &GuardFluxCmd, workspace: &Path) -> Result<Option<super::cli_authority::VerifiedAuthority>, String> {
    let Some(reference) = cmd.authority_file.as_deref() else {
        return if cmd.experimental { Ok(None) }
            else { Err("guard-flux requires a signed backend capability; pass --experimental to opt in locally".into()) };
    };
    verify_authority(cmd, workspace, reference).map(Some)
}

fn verify_authority(cmd: &GuardFluxCmd, workspace: &Path, reference: &Path) -> Result<super::cli_authority::VerifiedAuthority, String> {
    let (mission_id, cell_id) = parse_authority_ids(cmd)?;
    super::cli_authority::verify(workspace, super::cli_authority::Expectation {
        authority_file: reference, mission_id, cell_id, operation: "guard_flux",
        detail: "guard_flux", value: cmd.requested_flux, tick: cmd.tick,
        idempotency_key: &cmd.idempotency_key,
    })
}

fn parse_authority_ids(cmd: &GuardFluxCmd) -> Result<(Uuid, Uuid), String> {
    Ok((parse_mission_id(&cmd.mission_id)?, parse_cell_id(cmd.cell_id.as_deref())?))
}

fn parse_mission_id(value: &str) -> Result<Uuid, String> {
    Uuid::parse_str(value).map_err(|error| format!("mission_id must be a UUID: {error}"))
}

fn parse_cell_id(value: Option<&str>) -> Result<Uuid, String> {
    let value = value.ok_or("signed guard-flux authority requires --cell-id")?;
    Uuid::parse_str(value).map_err(|error| format!("cell_id must be a UUID: {error}"))
}

fn execute_in_workspace(cmd: GuardFluxCmd, workspace: &Path, authority: Option<super::cli_authority::VerifiedAuthority>) -> Result<(), String> {
    let mission_id = Uuid::parse_str(&cmd.mission_id)
        .map_err(|error| format!("mission_id must be a UUID: {error}"))?;
    validate_idempotency_key(&cmd.idempotency_key)?;
    let (journal, lock) = mission_paths(workspace, mission_id)?;
    let _lock = super::biological_lock::MissionLock::acquire(lock)?;
    let store = BiologicalReceiptStore::open(journal);
    run_locked(GuardFluxExecution { command: cmd, mission_id, store: &store, authority })
}

fn run_locked(execution: GuardFluxExecution<'_>) -> Result<(), String> {
    let GuardFluxExecution { command: cmd, mission_id, store, authority } = execution;
    let mut ecosystem = GenosEcosystem::new("guard-flux-cli");
    ecosystem.set_mission_id(mission_id);
    restore_if_available(&mut ecosystem, store, mission_id)?;
    let cell_id = cmd.cell_id.as_deref().map(Uuid::parse_str).transpose()
        .map_err(|error| format!("cell_id must be a UUID: {error}"))?
        .unwrap_or(ecosystem.orchestrator.orchestrator_id);
    let receipt = ecosystem.throttle_flux_for_mission_durable(
        store,
        MissionGuardFluxCommand {
            cell_id,
            idempotency_key: cmd.idempotency_key,
            tick: cmd.tick,
            requested_flux: cmd.requested_flux,
        },
    )?;
    let output = serde_json::json!({
        "execution_mode": if authority.is_some() { "backend-authorized" } else { "experimental" },
        "mission_authority": if authority.is_some() { "authenticated_backend_capability" } else { "unverified_cli_claim" },
        "authority_scope": authority.map(|value| serde_json::json!({
            "organization_id": value.organization_id,
            "project_id": value.project_id,
            "mission_id": value.mission_id,
        })),
        "receipt": receipt,
    });
    println!("{}", serde_json::to_string(&output).map_err(|error| error.to_string())?);
    Ok(())
}

fn restore_if_available(
    ecosystem: &mut GenosEcosystem,
    store: &BiologicalReceiptStore,
    mission_id: Uuid,
) -> Result<(), String> {
    let receipts = store.read_all()?;
    let has_snapshot = receipts.iter().any(|item| {
        item["schema"] == "genos.population-state/v1"
            && item["mission_id"] == mission_id.to_string()
    });
    if !has_snapshot {
        return Ok(());
    }
    ecosystem.restore_population(store)?;
    let has_guard_state = receipts.iter().any(|item| {
        item["schema"] == "genos.population-state/v1"
            && item["mission_id"] == mission_id.to_string()
            && !item["guard_flux_operation"].is_null()
    });
    if has_guard_state {
        ecosystem.restore_guard_cell_state(store)?;
    }
    Ok(())
}

fn mission_paths(workspace: &Path, mission_id: Uuid) -> Result<(PathBuf, PathBuf), String> {
    let root = workspace.canonicalize()
        .map_err(|error| format!("cannot canonicalize workspace root: {error}"))?;
    let directory = ensure_receipt_directory(&root)?;
    let journal = directory.join(format!("{mission_id}.jsonl"));
    if let Ok(metadata) = fs::symlink_metadata(&journal) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("mission receipt journal must be a regular file inside the workspace".into());
        }
        let canonical = journal.canonicalize()
            .map_err(|error| format!("cannot canonicalize mission journal: {error}"))?;
        if !canonical.starts_with(&directory) {
            return Err("mission receipt journal resolves outside the workspace".into());
        }
    }
    Ok((journal, directory.join(format!("{mission_id}.lock"))))
}

fn ensure_receipt_directory(root: &Path) -> Result<PathBuf, String> {
    let path = root.join("biological-receipts");
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("receipt directory must be a real directory inside the workspace".into());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&path)
                .map_err(|create_error| format!("cannot create confined receipt directory: {create_error}"))?;
        }
        Err(error) => return Err(format!("cannot inspect receipt directory: {error}")),
    }
    let canonical = path.canonicalize()
        .map_err(|error| format!("cannot canonicalize receipt directory: {error}"))?;
    if !canonical.starts_with(root) {
        return Err("receipt directory resolves outside the workspace".into());
    }
    Ok(canonical)
}

fn validate_idempotency_key(key: &str) -> Result<(), String> {
    if key.trim().is_empty() || key.len() > 256 {
        return Err("idempotency_key must contain between 1 and 256 bytes".into());
    }
    Ok(())
}
