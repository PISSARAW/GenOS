use crate::args::BiologicalCmd;
use super::biological::save_checkpoint;
use super::biological_recruitment::{MissionRuntime, persist_mission_operations};

pub(super) struct MissionReplayContext<'a> {
    pub(super) command: &'a BiologicalCmd,
    pub(super) mission_id: uuid::Uuid,
    pub(super) ecosystem: &'a mut genos_orchestrator::GenosEcosystem,
    pub(super) store: &'a genos_store::BiologicalReceiptStore,
    pub(super) checkpoints: &'a mut genos_orchestrator::checkpoint::CheckpointManager,
}

pub(super) fn prepare_runtime_and_replay(context: MissionReplayContext<'_>) -> Result<bool, String> {
    super::biological::reconcile_receipt_tick(context.checkpoints, context.ecosystem, context.store)?;
    if replay_existing_crossover(MissionReplayContext {
        command: context.command,
        mission_id: context.mission_id,
        ecosystem: context.ecosystem,
        store: context.store,
        checkpoints: context.checkpoints,
    })? { return Ok(true); }
    genos_orchestrator::sensory_paf_bridge::prepare_next_synthetic_sensory_input(
        context.ecosystem,
        context.store,
    )?;
    Ok(false)
}

fn replay_existing_crossover(context: MissionReplayContext<'_>) -> Result<bool, String> {
    if !is_crossover_only(context.command) { return Ok(false); }
    let Some(key) = crossover_lookup_key(context.command, context.mission_id) else { return Ok(false); };
    let existing = context.store.find_idempotent_receipt(
        genos_orchestrator::mission_crossover::CROSSOVER_SCHEMA,
        &key,
    )?;
    if context.command.replay_crossover_key.is_some() && existing.is_none() {
        return Err("crossover receipt not found".into());
    }
    if existing.is_none() { return Ok(false); }
    persist_replayed_crossover(context)
}

fn persist_replayed_crossover(context: MissionReplayContext<'_>) -> Result<bool, String> {
    let tick = context.ecosystem.receipt_tick;
    let receipts = persist_mission_operations(context.ecosystem, MissionRuntime {
        command: context.command,
        store: context.store,
        tick,
    })?;
    save_checkpoint(context.checkpoints, context.ecosystem)?;
    println!("{}", serde_json::json!({
        "success": true,
        "operation": "biological_crossover_replay",
        "mission_id": context.mission_id,
        "tick": tick,
        "receipts": receipts
    }));
    Ok(true)
}

fn is_crossover_only(cmd: &BiologicalCmd) -> bool {
    let crossover = cmd.replay_crossover_key.is_some() || cmd.crossover_parent_a.is_some()
        || cmd.crossover_parent_b.is_some() || cmd.crossover_seed.is_some();
    crossover && !cmd.divide && !cmd.reproduce && cmd.choanocyte_stream.is_none()
        && cmd.recruit_dna.is_none() && cmd.recruitment_spec.is_none()
}

fn crossover_lookup_key(cmd: &BiologicalCmd, mission_id: uuid::Uuid) -> Option<String> {
    if let Some(key) = &cmd.replay_crossover_key { return Some(key.clone()); }
    let request = genos_orchestrator::mission_crossover::CrossoverRequest {
        parent_a_cell_id: cmd.crossover_parent_a?,
        parent_b_cell_id: cmd.crossover_parent_b?,
        seed: cmd.crossover_seed?,
    };
    Some(genos_orchestrator::mission_crossover::request_key(mission_id, &request))
}
