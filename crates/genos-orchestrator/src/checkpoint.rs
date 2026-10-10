use crate::director::{Director, DirectorState};
use crate::ecosystem::GenosEcosystem;
use crate::metabolism::MetabolismCheckpoint;
use genos_store::{
    CheckpointEntries, CheckpointStore, ContinuationAppend, ContinuationEntry, ContinuationType,
    ContinuationWal, Event, InMemoryEventStore, OrchestrationCheckpoint,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrchestratorCheckpointState {
    #[serde(default)]
    pub mission_id: Option<Uuid>,
    pub director_state: DirectorState,
    pub organisms: HashMap<String, serde_json::Value>,
    pub active_cells: HashMap<Uuid, serde_json::Value>,
    pub tissues: HashMap<String, serde_json::Value>,
    pub dormant_spores: Vec<serde_json::Value>,
    pub genomes: HashMap<Uuid, serde_json::Value>,
    pub spore_tissue_map: HashMap<Uuid, String>,
    #[serde(default)]
    pub events: Vec<Event>,
    #[serde(default)]
    pub metabolism: Option<MetabolismCheckpoint>,
    #[serde(default)]
    pub receipt_tick: u64,
    /// Full-fidelity orchestrator snapshot (serde round-trip). Present for
    /// checkpoints taken after the fix; absent (`None`) for legacy ones.
    #[serde(default)]
    pub orchestrator: Option<serde_json::Value>,
    pub timestamp: String,
}

impl OrchestratorCheckpointState {
    pub fn new() -> Self {
        Self {
            mission_id: None,
            director_state: DirectorState::default(),
            organisms: HashMap::new(),
            active_cells: HashMap::new(),
            tissues: HashMap::new(),
            dormant_spores: Vec::new(),
            genomes: HashMap::new(),
            spore_tissue_map: HashMap::new(),
            events: Vec::new(),
            metabolism: None,
            receipt_tick: 0,
            orchestrator: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn from_ecosystem(ecosystem: &GenosEcosystem) -> Result<Self, String> {
        let orch = &ecosystem.orchestrator;
        let director = &ecosystem.director;
        let mut organisms = HashMap::new();
        for (id, org) in &orch.tissues {
            organisms.insert(id.clone(), serde_json::json!({
                "name": org.name,
                "function_role": org.function_role,
                "stem_cell_id": org.stem_cell_id.to_string(),
                "somatic_cells": org.somatic_cells.iter().map(|id| id.to_string()).collect::<Vec<_>>(),
            }));
        }

        let mut active_cells = HashMap::new();
        for (id, cell) in &orch.active_cells {
            active_cells.insert(
                *id,
                serde_json::json!({
                    "name": cell.name,
                    "role": cell.role,
                    "cell_type": cell.name_meaning,
                }),
            );
        }

        let mut tissues = HashMap::new();
        for (name, tissue) in &orch.tissues {
            tissues.insert(name.clone(), serde_json::json!({
                "stem_cell_id": tissue.stem_cell_id.to_string(),
                "somatic_cells": tissue.somatic_cells.iter().map(|id| id.to_string()).collect::<Vec<_>>(),
            }));
        }

        let dormant_spores: Vec<_> = orch
            .dormant_spores
            .iter()
            .map(|s| {
                serde_json::json!({
                    "parent_cell_id": s.parent_cell_id.to_string(),
                    "spore_type": format!("{:?}", s.spore_type),
                    "genome_id": s.genome.genome_id().to_string(),
                })
            })
            .collect();

        let mut genomes = HashMap::new();
        for (id, genome) in &orch.genomes {
            genomes.insert(
                *id,
                serde_json::json!({
                    "genome_id": genome.genome_id().to_string(),
                }),
            );
        }

        Ok(Self {
            mission_id: ecosystem.mission_id,
            director_state: director.export_state(),
            organisms,
            active_cells,
            tissues,
            dormant_spores,
            genomes,
            spore_tissue_map: orch.spore_tissue_map.clone(),
            events: ecosystem.events.snapshot(),
            metabolism: Some(orch.metabolism.checkpoint()),
            receipt_tick: ecosystem.receipt_tick,
            orchestrator: Some(serde_json::to_value(orch).map_err(|error| error.to_string())?),
            timestamp: chrono::Utc::now().to_rfc3339(),
        })
    }

    /// Restores a checkpoint into a live orchestrator. Returns `Ok(true)` on
    /// full-fidelity restore, `Ok(false)` for legacy checkpoints that only
    /// carry summaries (the live ecosystem stays untouched). Hard failures
    /// (corrupt snapshot) return `Err`.
    pub fn apply_to_ecosystem(&self, ecosystem: &mut GenosEcosystem) -> Result<bool, String> {
        match &self.orchestrator {
            Some(snapshot) => {
                let mut restored: crate::orchestrator::BiomimeticOrchestrator =
                    serde_json::from_value(snapshot.clone()).map_err(|e| e.to_string())?;
                if let Some(metabolism) = self.metabolism.clone() {
                    restored.metabolism.restore_checkpoint(metabolism)?;
                }
                let events = InMemoryEventStore::restore(self.events.clone())?;
                ecosystem.director.import_state(self.director_state.clone());
                ecosystem.orchestrator = restored;
                ecosystem.events = events;
                ecosystem.receipt_tick = self.receipt_tick;
                ecosystem.mission_id = self.mission_id;
                Ok(true)
            }
            None => Ok(false),
        }
    }
}

pub struct CheckpointManager {
    wal: ContinuationWal,
    checkpoint_store: CheckpointStore,
    checkpoint_interval: u64,
    last_checkpoint_seq: u64,
}

impl CheckpointManager {
    pub fn new(store_dir: impl Into<PathBuf>, checkpoint_interval: u64) -> std::io::Result<Self> {
        let store_dir = store_dir.into();
        let wal = ContinuationWal::new(&store_dir)?;
        let checkpoint_store = CheckpointStore::new(&store_dir)?;

        let mut manager = Self {
            wal,
            checkpoint_store,
            checkpoint_interval,
            last_checkpoint_seq: 0,
        };

        if let Some(checkpoint) = manager.checkpoint_store.load()? {
            manager.last_checkpoint_seq = checkpoint.seq_id;
        }

        Ok(manager)
    }

    pub fn record_barrier(
        &mut self,
        barrier_id: &str,
        state: &serde_json::Value,
    ) -> std::io::Result<u64> {
        self.wal.append(ContinuationAppend {
            entry_type: ContinuationType::Barrier,
            payload: serde_json::json!({
                "barrier_id": barrier_id,
                "state": state
            }),
            dependencies: vec![],
        })
    }

    pub fn record_promise(
        &mut self,
        promise_id: &str,
        status: &str,
        payload: &serde_json::Value,
    ) -> std::io::Result<u64> {
        self.wal.append(ContinuationAppend {
            entry_type: ContinuationType::Promise,
            payload: serde_json::json!({
                "promise_id": promise_id,
                "status": status,
                "payload": payload
            }),
            dependencies: vec![],
        })
    }

    pub fn record_active_process(
        &mut self,
        process_id: Uuid,
        state: &serde_json::Value,
    ) -> std::io::Result<u64> {
        self.wal.append(ContinuationAppend {
            entry_type: ContinuationType::ActiveProcess,
            payload: serde_json::json!({
                "process_id": process_id.to_string(),
                "state": state
            }),
            dependencies: vec![],
        })
    }

    pub fn maybe_checkpoint(
        &mut self,
        state: &OrchestratorCheckpointState,
    ) -> std::io::Result<bool> {
        let current_seq = self.wal.latest_seq();
        if current_seq >= self.last_checkpoint_seq + self.checkpoint_interval && current_seq > 0 {
            self.create_checkpoint(state)?;
            self.last_checkpoint_seq = current_seq;
            return Ok(true);
        }
        Ok(false)
    }

    pub fn create_checkpoint(
        &mut self,
        state: &OrchestratorCheckpointState,
    ) -> std::io::Result<()> {
        let current_seq = self.wal.latest_seq();
        let all_entries = self.wal.read_all();

        let barriers: Vec<_> = all_entries
            .iter()
            .filter(|e| matches!(e.entry_type, ContinuationType::Barrier))
            .map(|entry| (*entry).clone())
            .collect();
        let promises: Vec<_> = all_entries
            .iter()
            .filter(|e| matches!(e.entry_type, ContinuationType::Promise))
            .map(|entry| (*entry).clone())
            .collect();
        let processes: Vec<_> = all_entries
            .iter()
            .filter(|e| matches!(e.entry_type, ContinuationType::ActiveProcess))
            .map(|entry| (*entry).clone())
            .collect();

        let checkpoint = OrchestrationCheckpoint::new(current_seq, serde_json::to_value(state)?)
            .with_entries(CheckpointEntries {
                barriers,
                promises,
                processes,
            });

        self.checkpoint_store.save(&checkpoint)?;
        self.wal.append(ContinuationAppend {
            entry_type: ContinuationType::Checkpoint,
            payload: serde_json::json!({ "checkpoint_seq": current_seq }),
            dependencies: vec![],
        })?;

        Ok(())
    }

    pub fn load_latest_checkpoint(&self) -> std::io::Result<Option<OrchestrationCheckpoint>> {
        self.checkpoint_store.load()
    }

    pub fn get_wal(&self) -> &ContinuationWal {
        &self.wal
    }

    pub fn get_wal_mut(&mut self) -> &mut ContinuationWal {
        &mut self.wal
    }

    pub fn rehydrate_from_wal(&self, from_seq: u64) -> Vec<&ContinuationEntry> {
        self.wal.read_from(from_seq)
    }

    pub fn verify_integrity(&self) -> bool {
        self.wal.verify_integrity()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecoveryPlan {
    pub checkpoint_seq: u64,
    pub wal_entries_to_replay: u64,
    pub barriers_to_restore: Vec<ContinuationEntry>,
    pub promises_to_restore: Vec<ContinuationEntry>,
    pub processes_to_restore: Vec<ContinuationEntry>,
    pub estimated_recovery_time_ms: u64,
}

impl RecoveryPlan {
    pub fn from_checkpoint_and_wal(
        checkpoint: &OrchestrationCheckpoint,
        wal: &ContinuationWal,
    ) -> Self {
        let wal_entries = wal.read_from(checkpoint.seq_id + 1);
        let wal_entries_to_replay = wal_entries.len() as u64;

        Self {
            checkpoint_seq: checkpoint.seq_id,
            wal_entries_to_replay,
            barriers_to_restore: checkpoint.active_barriers.clone(),
            promises_to_restore: checkpoint.active_promises.clone(),
            processes_to_restore: checkpoint.active_processes.clone(),
            estimated_recovery_time_ms: wal_entries_to_replay * 10,
        }
    }
}
