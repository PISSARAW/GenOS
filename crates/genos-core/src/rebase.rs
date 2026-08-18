use crate::revert::{ActionDependencyGraph, CausalAction};
use std::collections::HashSet;

/// Résultat d'un calcul de Rebase temporel
#[derive(Debug, Clone)]
pub struct RebasePlan {
    /// Les actions indépendantes (totalement isolées de la mutation)
    /// Elles peuvent être réappliquées instantanément.
    pub cherry_picked_steps: Vec<CausalAction>,
    /// Les actions touchées par "l'effet papillon".
    /// Elles doivent être re-générées par le LLM.
    pub fast_forward_steps: Vec<CausalAction>,
}

pub struct TrajectoryRebaser;

impl TrajectoryRebaser {
    /// Calcule le plan de rebase causal (l'Effet Papillon).
    /// `graph`: Le graphe DAG des actions passées.
    /// `injection_step`: L'étape (ex: 5) à laquelle on modifie l'historique.
    /// `injected_writes`: Les entités modifiées par l'injection (ex: la variable d'env API_VERSION).
    pub fn compute_rebase_plan(
        graph: &ActionDependencyGraph,
        injection_step: usize,
        injected_writes: &HashSet<String>,
    ) -> RebasePlan {
        let mut cherry_picked_steps = Vec::new();
        let mut fast_forward_steps = Vec::new();
        
        // L'ensemble des variables/fichiers qui ont été corrompus par notre modification temporelle.
        let mut tainted_entities = injected_writes.clone();

        for action in &graph.actions {
            if action.step_index <= injection_step {
                // Les actions antérieures ou égales à l'injection restent intactes dans le passé.
                continue;
            }

            // Une action est corrompue (Tainted) si elle lit une entité qui a été
            // modifiée par l'injection ou par une action préalablement corrompue.
            let is_tainted_by_read = action.reads.intersection(&tainted_entities).next().is_some();
            
            // Une action est aussi corrompue si elle écrase une entité corrompue (conflit direct)
            let is_tainted_by_write = action.writes.intersection(&tainted_entities).next().is_some();

            if is_tainted_by_read || is_tainted_by_write {
                // L'Effet Papillon: cette action "malade" contamine les fichiers/entités qu'elle touche.
                tainted_entities.extend(action.writes.iter().cloned());
                fast_forward_steps.push(action.clone());
            } else {
                // Action totalement indépendante de la nouvelle réalité (ex: des tests sans rapport)
                cherry_picked_steps.push(action.clone());
            }
        }

        RebasePlan {
            cherry_picked_steps,
            fast_forward_steps,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_butterfly_effect_and_cherry_pick() {
        let mut graph = ActionDependencyGraph::new();

        // Étape 1: Init (Indépendant)
        graph.record_action(CausalAction {
            step_index: 1,
            boundary_id: "b1".to_string(),
            reads: HashSet::new(),
            writes: HashSet::from(["Init".to_string()]),
        });

        // Étape 2: Injection ciblera cette étape (Modifie Config)
        graph.record_action(CausalAction {
            step_index: 2,
            boundary_id: "b2".to_string(),
            reads: HashSet::new(),
            writes: HashSet::from(["Config".to_string()]),
        });

        // Étape 3: Lit Config, Modifie Database -> Doit être classée fast_forward car elle lit Config (Effet papillon)
        graph.record_action(CausalAction {
            step_index: 3,
            boundary_id: "b3".to_string(),
            reads: HashSet::from(["Config".to_string()]),
            writes: HashSet::from(["Database".to_string()]),
        });

        // Étape 4: Lit UI, Modifie CSS -> Doit être cherry_picked (Indépendant)
        graph.record_action(CausalAction {
            step_index: 4,
            boundary_id: "b4".to_string(),
            reads: HashSet::from(["UI".to_string()]),
            writes: HashSet::from(["CSS".to_string()]),
        });

        // Étape 5: Lit Database -> Doit être fast_forward car Database a été pollué par l'étape 3
        graph.record_action(CausalAction {
            step_index: 5,
            boundary_id: "b5".to_string(),
            reads: HashSet::from(["Database".to_string()]),
            writes: HashSet::from(["Logs".to_string()]),
        });

        // Simulation d'une injection à l'étape 2 (Modifie Config)
        let injection_step = 2;
        let injected_writes = HashSet::from(["Config".to_string()]);

        let plan = TrajectoryRebaser::compute_rebase_plan(&graph, injection_step, &injected_writes);

        // Vérifications
        assert_eq!(plan.cherry_picked_steps.len(), 1);
        assert_eq!(plan.cherry_picked_steps[0].step_index, 4, "L'étape 4 (CSS) est indépendante.");

        assert_eq!(plan.fast_forward_steps.len(), 2);
        assert_eq!(plan.fast_forward_steps[0].step_index, 3, "L'étape 3 lit Config directement muté.");
        assert_eq!(plan.fast_forward_steps[1].step_index, 5, "L'étape 5 lit Database, muté par l'étape 3.");
    }
}
