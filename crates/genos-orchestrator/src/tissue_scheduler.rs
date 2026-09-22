//! Ordonnancement tissulaire : file des travaux par tissu, santé du pool,
//! décisions de schedulage basiques (ok / saturé / échec).

use std::collections::HashMap;

/// Config minimale pour un pool de travaux in-process.
#[derive(Clone, Debug, Default)]
pub struct InProcessPoolConfig {
    pub max_concurrent: usize,
    pub queue_capacity: usize,
}

/// Travail unitaire planifié in-process.
#[derive(Clone, Debug)]
pub struct InProcessTask {
    pub id: String,
    pub tissue: String,
    pub priority: u8,
}

/// Résultat renvoyé par un travaux in-process.
#[derive(Clone, Debug, Default)]
pub struct InProcessTaskResult {
    pub id: String,
    pub success: bool,
    pub output: Option<String>,
}

/// Worker budget simplifié.
#[derive(Clone, Debug, Default)]
pub struct WorkerBudget {
    pub remaining: f64,
}

/// Santé d'un pool.
#[derive(Clone, Debug, Default)]
pub struct PoolHealth {
    pub active: usize,
    pub queued: usize,
    pub healthy: bool,
}

/// Santé du scheduler.
#[derive(Clone, Debug, Default)]
pub struct SchedulerHealth {
    pub pools: Vec<PoolHealth>,
}

/// Tâche squad.
#[derive(Clone, Debug)]
pub struct SquadTask {
    pub id: String,
    pub squad: String,
    pub payload: String,
}

/// Résultat squad.
#[derive(Clone, Debug, Default)]
pub struct SquadTaskResult {
    pub id: String,
    pub ok: bool,
}

/// Santé du squad.
#[derive(Clone, Debug, Default)]
pub struct SquadHealth {
    pub active: usize,
    pub healthy: bool,
}

/// Budget squad.
#[derive(Clone, Debug, Default)]
pub struct SquadBudget {
    pub remaining: f64,
    pub limit: f64,
}

/// Budget tissu.
#[derive(Clone, Debug, Default)]
pub struct TissueBudget {
    pub remaining: f64,
    pub limit: f64,
    pub tissue: String,
}

/// Santé d'un tissu.
#[derive(Clone, Debug, Default)]
pub struct TissueHealth {
    pub active: usize,
    pub queued: usize,
    pub healthy: bool,
}

/// Scheduler tissulaire in-process.
#[derive(Clone, Debug)]
pub struct TissueScheduler {
    config: InProcessPoolConfig,
    tasks: HashMap<String, InProcessTask>,
    results: HashMap<String, InProcessTaskResult>,
    squad_tasks: HashMap<String, SquadTask>,
}

impl TissueScheduler {
    pub fn new(config: InProcessPoolConfig) -> Self {
        Self {
            config,
            tasks: HashMap::new(),
            results: HashMap::new(),
            squad_tasks: HashMap::new(),
        }
    }

    pub fn schedule(&mut self, task: InProcessTask) -> Result<(), &'static str> {
        if self.tasks.len() >= self.config.queue_capacity {
            return Err("queue full");
        }
        self.tasks.insert(task.id.clone(), task);
        Ok(())
    }

    pub fn complete(&mut self, id: &str, success: bool, output: Option<String>) {
        let _task = self.tasks.remove(id).unwrap_or_else(|| InProcessTask {
            id: id.to_string(),
            tissue: "unknown".into(),
            priority: 0,
        });
        self.results.insert(
            id.to_string(),
            InProcessTaskResult {
                id: id.to_string(),
                success,
                output,
            },
        );
    }

    pub fn health(&self, tissue: &str) -> TissueHealth {
        let active = self.tasks.values().filter(|t| t.tissue == tissue).count();
        let queued = self
            .results
            .keys()
            .filter(|id| {
                self.tasks
                    .get(id.as_str())
                    .map(|t| t.tissue == tissue)
                    .unwrap_or(false)
            })
            .count();
        TissueHealth {
            active,
            queued,
            healthy: active <= self.config.max_concurrent,
        }
    }

    pub fn schedule_squad(&mut self, task: SquadTask) -> Result<(), &'static str> {
        if self.squad_tasks.len() >= self.config.queue_capacity {
            return Err("squad queue full");
        }
        self.squad_tasks.insert(task.id.clone(), task);
        Ok(())
    }

    pub fn complete_squad(&mut self, id: &str, ok: bool) {
        self.squad_tasks.remove(id);
        self.results.insert(
            id.to_string(),
            InProcessTaskResult {
                id: id.to_string(),
                success: ok,
                output: None,
            },
        );
    }

    pub fn squad_health(&self, squad: &str) -> SquadHealth {
        let active = self
            .squad_tasks
            .values()
            .filter(|t| t.squad == squad)
            .count();
        SquadHealth {
            active,
            healthy: active > 0,
        }
    }
}

impl Default for TissueScheduler {
    fn default() -> Self {
        Self::new(InProcessPoolConfig::default())
    }
}

/// Config du scheduler tissulaire.
#[derive(Clone, Debug, Default)]
pub struct TissueSchedulerConfig {
    pub max_concurrent: usize,
    pub queue_capacity: usize,
}

impl From<InProcessPoolConfig> for TissueSchedulerConfig {
    fn from(cfg: InProcessPoolConfig) -> Self {
        Self {
            max_concurrent: cfg.max_concurrent,
            queue_capacity: cfg.queue_capacity,
        }
    }
}

/// Résultat worker.
#[derive(Clone, Debug, Default)]
pub struct WorkerBudgetResult {}

/// Worker pool in-process (placeholder compatible avec l'import existant).
#[derive(Clone, Debug, Default)]
pub struct InProcessWorkerPool {
    _config: InProcessPoolConfig,
}

impl InProcessWorkerPool {
    pub fn new(config: InProcessPoolConfig) -> Self {
        Self { _config: config }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tissue_scheduler_schedules_and_completes() {
        let mut scheduler = TissueScheduler::new(InProcessPoolConfig {
            max_concurrent: 2,
            queue_capacity: 4,
            ..Default::default()
        });
        let task = InProcessTask {
            id: "t1".into(),
            tissue: "Core".into(),
            priority: 1,
        };
        assert!(scheduler.schedule(task).is_ok());
        scheduler.complete("t1", true, Some("done".into()));
        let health = scheduler.health("Core");
        assert_eq!(health.active, 0);
        assert!(scheduler.results.contains_key("t1"));
    }

    #[test]
    fn tissue_scheduler_rejects_when_full() {
        let mut scheduler = TissueScheduler::new(InProcessPoolConfig {
            max_concurrent: 1,
            queue_capacity: 1,
            ..Default::default()
        });
        let task = InProcessTask {
            id: "t1".into(),
            tissue: "Core".into(),
            priority: 1,
        };
        assert!(scheduler.schedule(task).is_ok());
        let task2 = InProcessTask {
            id: "t2".into(),
            tissue: "Core".into(),
            priority: 1,
        };
        assert!(scheduler.schedule(task2).is_err());
    }
}
