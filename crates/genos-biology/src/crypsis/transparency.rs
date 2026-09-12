use serde::{Deserialize, Serialize};

/// Propriétés optiques et mémorielles de la cellule transparente (crevette de verre / méduse)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GlassNodeTransparency {
    pub refractive_index_delta: f64, // Écart d'indice par rapport à la mémoire hôte [0.0 = indiscernable]
    pub is_volatile_ram_only: bool, // Zéro écriture sur disque SQLite ou EventStore
    pub ticks_to_dissolution: u32,  // Durée de vie éphémère avant dématérialisation
    pub initial_ttl: u32,
}

/// Résultat d'exécution d'un Ghost Node transparent
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GhostExecutionYield {
    pub payload_result: String,
    pub persisted_to_disk: bool,
    pub scars_left: u32,
    pub is_dissolved: bool,
}

impl GlassNodeTransparency {
    pub fn new(ephemeral_ttl: u32) -> Self {
        Self {
            refractive_index_delta: 0.001, // Presque indiscernable de la RAM de fond
            is_volatile_ram_only: true,
            ticks_to_dissolution: ephemeral_ttl,
            initial_ttl: ephemeral_ttl,
        }
    }

    /// Avance d'un tick d'exécution éphémère
    pub fn tick(&mut self) -> bool {
        if self.ticks_to_dissolution > 0 {
            self.ticks_to_dissolution -= 1;
        }
        self.ticks_to_dissolution > 0
    }

    /// Exécute une tâche sous transparence totale
    pub fn execute_transparently<F>(&mut self, task: F) -> GhostExecutionYield
    where
        F: FnOnce() -> String,
    {
        let result = task();
        let is_alive = self.tick();

        GhostExecutionYield {
            payload_result: result,
            persisted_to_disk: false, // Invariant absolu de transparence
            scars_left: 0,
            is_dissolved: !is_alive,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_glass_node_zero_disk_trace_and_dissolution() {
        let mut glass = GlassNodeTransparency::new(2);

        // Premier tick : exécution transparente
        let yield1 = glass.execute_transparently(|| "TRANSITORY_TASK_A".to_string());
        assert_eq!(yield1.payload_result, "TRANSITORY_TASK_A");
        assert!(!yield1.persisted_to_disk);
        assert_eq!(yield1.scars_left, 0);
        assert!(!yield1.is_dissolved);

        // Deuxième tick : dissolution complète
        let yield2 = glass.execute_transparently(|| "TRANSITORY_TASK_B".to_string());
        assert!(yield2.is_dissolved);
        assert_eq!(glass.ticks_to_dissolution, 0);
    }
}
