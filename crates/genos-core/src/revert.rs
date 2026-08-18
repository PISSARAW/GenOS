use crate::causality::CausalBoundary;
use crate::entities::{check_intersection, EntityRef};

/// Représente une action exécutée par l'agent dans le graphe causal.
#[derive(Clone, Debug)]
pub struct CausalAction {
    pub step_index: usize,
    pub boundary_id: String,
    /// Liste des entités (ex: "file:src/main.rs") lues par cette action
    pub reads: Vec<EntityRef>,
    /// Liste des entités modifiées par cette action
    pub writes: Vec<EntityRef>,
}

/// Graphe acyclique dirigé (DAG) pour suivre les dépendances entre actions.
pub struct ActionDependencyGraph {
    pub actions: Vec<CausalAction>,
}

impl ActionDependencyGraph {
    pub fn new() -> Self {
        Self {
            actions: Vec::new(),
        }
    }

    pub fn record_action(&mut self, action: CausalAction) {
        self.actions.push(action);
    }

    /// Trouve l'index de la dernière action qui a modifié un état affectant (directement ou indirectement) l'erreur.
    /// Renvoie le Last Known Good State index.
    pub fn find_last_known_good_state(&self, error_step: usize, error_entities: &Vec<EntityRef>) -> Option<usize> {
        if self.actions.is_empty() {
            return None;
        }

        let mut tainted_entities = error_entities.clone();
        let mut root_cause_step = None;

        // On remonte le temps depuis l'erreur pour trouver toutes les actions impliquées
        for action in self.actions.iter().rev() {
            if action.step_index >= error_step {
                continue;
            }

            // Si cette action a écrit dans une entité corrompue, elle est fautive ou fait partie de la chaîne
            let action_tainted = check_intersection(action.writes.iter(), tainted_entities.iter());
            
            if action_tainted {
                // Les entités lues par cette action deviennent aussi suspectes (propagation de la faute)
                for read in &action.reads {
                    if !tainted_entities.contains(read) {
                        tainted_entities.push(read.clone());
                    }
                }
                root_cause_step = Some(action.step_index);
            }
        }

        // Le dernier état sain est juste avant la cause racine
        root_cause_step.map(|step| if step > 0 { step - 1 } else { 0 })
    }

    /// Identifie les actions postérieures au rollback qui peuvent être ré-appliquées (Cherry-pick).
    pub fn extract_cherry_pickable_actions(&self, lkgs_step: usize, error_step: usize, tainted_entities: &Vec<EntityRef>) -> Vec<CausalAction> {
        let mut cherry_pickable = Vec::new();

        for action in &self.actions {
            if action.step_index > lkgs_step && action.step_index < error_step {
                // Une action est cherry-pickable si elle n'a touché à aucune entité corrompue
                let reads_clean = !check_intersection(action.reads.iter(), tainted_entities.iter());
                let writes_clean = !check_intersection(action.writes.iter(), tainted_entities.iter());

                if reads_clean && writes_clean {
                    cherry_pickable.push(action.clone());
                }
            }
        }

        cherry_pickable
    }
}

pub struct SafestRevertSolver;

impl SafestRevertSolver {
    pub fn compute_safest_revert(
        graph: &ActionDependencyGraph,
        error_step: usize,
        error_entities: &Vec<EntityRef>,
        boundaries: &[CausalBoundary],
    ) -> Option<(CausalBoundary, Vec<CausalAction>)> {
        // 1. Trouver le LKGS
        let lkgs_step = graph.find_last_known_good_state(error_step, error_entities)?;

        // Récupérer la boundary correspondante (supposons que l'index de tableau == step_index)
        let safe_boundary = boundaries.get(lkgs_step)?.clone();

        // 2. Déterminer les entités corrompues (on refait l'analyse pour la pureté)
        let mut tainted_entities = error_entities.clone();
        for action in graph.actions.iter().rev() {
            if action.step_index < error_step && action.step_index >= lkgs_step {
                if check_intersection(action.writes.iter(), tainted_entities.iter()) {
                    for r in &action.reads {
                        if !tainted_entities.contains(r) { tainted_entities.push(r.clone()); }
                    }
                    for w in &action.writes {
                        if !tainted_entities.contains(w) { tainted_entities.push(w.clone()); }
                    }
                }
            }
        }

        // 3. Extraire le Cherry-picking
        let cherry_picks = graph.extract_cherry_pickable_actions(lkgs_step, error_step, &tainted_entities);

        Some((safe_boundary, cherry_picks))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_last_known_good_state_and_cherry_pick() {
        let mut graph = ActionDependencyGraph::new();

        // Etape 0: Init
        // Etape 1: Modifie A (Indépendant)
        graph.record_action(CausalAction {
            step_index: 1,
            boundary_id: "b1".to_string(),
            reads: vec![],
            writes: vec![EntityRef::File { path: "file_A".to_string() }],
        });

        // Etape 2: Modifie B (Cause racine de l'erreur)
        graph.record_action(CausalAction {
            step_index: 2,
            boundary_id: "b2".to_string(),
            reads: vec![],
            writes: vec![EntityRef::File { path: "file_B".to_string() }],
        });

        // Etape 3: Lit B, Modifie C (Erreur se propage)
        graph.record_action(CausalAction {
            step_index: 3,
            boundary_id: "b3".to_string(),
            reads: vec![EntityRef::File { path: "file_B".to_string() }],
            writes: vec![EntityRef::File { path: "file_C".to_string() }],
        });

        // Etape 4: Modifie D (Indépendant) - Doit être cherry-pickable
        graph.record_action(CausalAction {
            step_index: 4,
            boundary_id: "b4".to_string(),
            reads: vec![],
            writes: vec![EntityRef::File { path: "file_D".to_string() }],
        });

        // L'erreur est détectée sur file_C à l'étape 5
        let error_entities = vec![EntityRef::File { path: "file_C".to_string() }];

        let lkgs = graph.find_last_known_good_state(5, &error_entities);
        assert_eq!(lkgs, Some(1), "L'état sain devrait être 1");

        // Test Cherry-picking
        let tainted = vec![
            EntityRef::File { path: "file_C".to_string() },
            EntityRef::File { path: "file_B".to_string() }
        ];
        let cherry = graph.extract_cherry_pickable_actions(1, 5, &tainted);

        assert_eq!(cherry.len(), 1);
        assert_eq!(cherry[0].boundary_id, "b4", "L'action 4 sur D doit être récupérée");
    }
}
