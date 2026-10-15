use crate::args::MetabolicPoolCmd;
use genos_orchestrator::metabolism::MissionMetabolicPoolDemand;
use genos_orchestrator::metabolism_durable::MissionMetabolicPoolCommand;
use genos_orchestrator::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Consume a durable cell pool after explicitly opting into the unauthenticated local path.
pub fn execute(cmd: MetabolicPoolCmd) -> Result<(), String> {
    if !cmd.experimental {
        return Err("metabolic-pool has no authenticated mission authority; pass --experimental to opt in".into());
    }
    validate_command(&cmd)?;
    let workspace = std::env::var_os("GENOS_STUDIO_ROOT")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(std::env::current_dir)
        .map_err(|error| format!("cannot resolve workspace root: {error}"))?;
    execute_in_workspace(cmd, &workspace)
}

fn validate_command(cmd: &MetabolicPoolCmd) -> Result<(), String> {
    if cmd.idempotency_key.trim().is_empty() || cmd.idempotency_key.len() > 256 {
        return Err("idempotency_key must contain between 1 and 256 bytes".into());
    }
    if cmd.operation.trim().is_empty() || cmd.operation.len() > 256 {
        return Err("operation must contain between 1 and 256 bytes".into());
    }
    if !cmd.amino_acids.is_finite() || cmd.amino_acids < 0.0 {
        return Err("amino_acids must be finite and non-negative".into());
    }
    Ok(())
}

fn execute_in_workspace(cmd: MetabolicPoolCmd, workspace: &Path) -> Result<(), String> {
    let (journal_path, lock_path) = mission_paths(workspace, cmd.mission_id)?;
    let _lock = genos_orchestrator::process_file_lock::ProcessFileLock::acquire(lock_path)?;
    let store = BiologicalReceiptStore::open(&journal_path);
    run_locked(cmd, &store)
}

fn run_locked(cmd: MetabolicPoolCmd, store: &BiologicalReceiptStore) -> Result<(), String> {
    let mut ecosystem = restored_ecosystem(cmd.mission_id, store)?;
    validate_tick(ecosystem.receipt_tick, cmd.tick)?;
    let receipt = consume_request(&mut ecosystem, store, cmd)?;
    print_receipt(receipt);
    Ok(())
}

fn restored_ecosystem(mission_id: Uuid, store: &BiologicalReceiptStore) -> Result<GenosEcosystem, String> {
    let mut ecosystem = GenosEcosystem::new("metabolic-pool-cli");
    ecosystem.set_mission_id(mission_id);
    ecosystem.restore_population(store)?;
    Ok(ecosystem)
}

fn validate_tick(restored_tick: u64, requested_tick: u64) -> Result<(), String> {
    if restored_tick == requested_tick {
        Ok(())
    } else {
        Err(format!("requested tick {requested_tick} does not match restored mission tick {restored_tick}"))
    }
}

fn consume_request(
    ecosystem: &mut GenosEcosystem,
    store: &BiologicalReceiptStore,
    cmd: MetabolicPoolCmd,
) -> Result<genos_orchestrator::metabolism::MissionMetabolicPoolReceipt, String> {
    ecosystem.consume_mission_metabolic_pool_durable(store, MissionMetabolicPoolCommand {
        idempotency_key: cmd.idempotency_key,
        tick: cmd.tick,
        demand: MissionMetabolicPoolDemand {
            cell_id: cmd.cell_id,
            operation: cmd.operation,
            amino_acids: cmd.amino_acids,
        },
    })
}

fn print_receipt(receipt: genos_orchestrator::metabolism::MissionMetabolicPoolReceipt) {
    let output = serde_json::json!({
        "success": true,
        "execution_mode": "experimental",
        "mission_authority": "unverified_cli_claim",
        "receipt": receipt,
    });
    println!("{output}");
}

fn mission_paths(workspace: &Path, mission_id: Uuid) -> Result<(PathBuf, PathBuf), String> {
    let workspace = workspace.canonicalize()
        .map_err(|error| format!("cannot canonicalize workspace root: {error}"))?;
    let journal_dir = ensure_receipt_directory(&workspace)?;
    let journal_path = journal_dir.join(format!("{mission_id}.jsonl"));
    validate_journal_path(&journal_path, &journal_dir)?;
    Ok((journal_path, journal_dir.join(format!("{mission_id}.lock"))))
}

fn ensure_receipt_directory(workspace: &Path) -> Result<PathBuf, String> {
    let path = workspace.join("biological-receipts");
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("receipt directory must be a real directory inside the workspace".into());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&path).map_err(|create_error| format!("cannot create receipt directory: {create_error}"))?;
        }
        Err(error) => return Err(format!("cannot inspect receipt directory: {error}")),
    }
    let journal_dir = path.canonicalize()
        .map_err(|error| format!("cannot canonicalize receipt directory: {error}"))?;
    if !journal_dir.starts_with(&workspace) {
        return Err("receipt directory resolves outside the workspace".into());
    }
    Ok(journal_dir)
}

fn validate_journal_path(journal_path: &Path, journal_dir: &Path) -> Result<(), String> {
    if let Ok(metadata) = fs::symlink_metadata(journal_path) {
        if metadata.file_type().is_symlink() || !metadata.is_file()
            || !journal_path.canonicalize().map_err(|error| error.to_string())?.starts_with(journal_dir)
        {
            return Err("mission receipt journal must be a regular file inside the workspace".into());
        }
    }
    Ok(())
}
