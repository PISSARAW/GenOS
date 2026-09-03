use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum DaemonStatus {
    /// Le processus tourne activement en boucle
    Running,
    /// Le processus est en veille (attend un événement, ex: inotify)
    Sleeping,
    /// Le processus a été tué
    Terminated,
    /// Le processus a planté
    Failed(String),
}

/// Un "Ganglion" représente un Daemon (Processus en arrière-plan)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Ganglion {
    pub id: Uuid,
    pub name: String,
    pub status: DaemonStatus,
    pub task_type: String, // ex: "FILE_WATCHER", "WEB_SERVER"
}

/// Le Système Nerveux Autonome (SNA)
/// Gère les processus continus en tâche de fond (respiration, rythme cardiaque).
/// Cela permet à l'agent de spawner des Daemons (ex: watchers) sans bloquer
/// le thread principal de sa conscience.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AutonomicNervousSystem {
    pub active_ganglions: HashMap<Uuid, Ganglion>,
}

impl AutonomicNervousSystem {
    pub fn new() -> Self {
        Self::default()
    }

    /// Spawne un nouveau Daemon (Ganglion Autonome)
    pub fn spawn_daemon(&mut self, name: &str, task_type: &str) -> Uuid {
        let id = Uuid::new_v4();
        let ganglion = Ganglion {
            id,
            name: name.to_string(),
            status: DaemonStatus::Running,
            task_type: task_type.to_string(),
        };
        self.active_ganglions.insert(id, ganglion);
        
        // Note architecturale: En V2, l'exécuteur tokio se chargera de faire un `tokio::spawn(async move { ... })`
        // et lira cette structure pour monitorer les tâches de fond de l'agent.
        
        id
    }

    /// Vérifie l'état d'un Daemon
    pub fn check_status(&self, id: &Uuid) -> Option<&DaemonStatus> {
        self.active_ganglions.get(id).map(|g| &g.status)
    }

    /// Coupe un Daemon (Arrêt ciblé du processus)
    pub fn kill_daemon(&mut self, id: &Uuid) -> Result<(), String> {
        if let Some(ganglion) = self.active_ganglions.get_mut(id) {
            ganglion.status = DaemonStatus::Terminated;
            Ok(())
        } else {
            Err(format!("Aucun ganglion actif avec l'ID {}", id))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ans_daemons() {
        let mut ans = AutonomicNervousSystem::new();
        
        // Spawn d'un File Watcher
        let watcher_id = ans.spawn_daemon("Src_Watcher", "FILE_WATCHER");
        
        assert_eq!(ans.check_status(&watcher_id), Some(&DaemonStatus::Running));
        
        // Tuer le daemon
        assert!(ans.kill_daemon(&watcher_id).is_ok());
        assert_eq!(ans.check_status(&watcher_id), Some(&DaemonStatus::Terminated));
    }
}