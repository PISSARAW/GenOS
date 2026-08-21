use crate::mcts::AgentSnapshot;

/// Représente un score de viabilité d'une étape (généralement entre 0.0 et 1.0).
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub struct StepScore(pub f32);

/// Contexte d'évaluation pour éviter de multiplier les paramètres de fonction.
///
/// Cette structure encapsule toutes les variables environnementales nécessaires
/// à l'évaluation d'un nœud sans violer la règle des 3 paramètres maximum par fonction.
///
/// Elle intègre des variables classiques ainsi que des signaux bio-inspirés :
/// - `task_goal` : Le but courant de la tâche pour le prompt LLM.
/// - `pruning_threshold` : Le score minimal requis pour qu'une branche ne soit pas élaguée.
/// - `energy_charge` : Le ratio ATP/AMP fourni par l'automate AMPK (compris entre 0.0 et 1.0). Modifie la profondeur MCTS.
/// - `positional_gradient` : La concentration du morphogène (Gierer-Meinhardt) pour la différenciation (Wolpert).
#[derive(Debug, Clone)]
pub struct EvalContext {
    pub task_goal: String,
    pub pruning_threshold: f32,
    pub energy_charge: f32,
    pub positional_gradient: f32,
}

/// Le modèle PRM évalue la viabilité d'une étape de raisonnement intermédiaire.
pub trait ProcessRewardModel {
    /// Évalue un état donné et retourne son score de viabilité.
    /// Respect de la règle : exactement 3 paramètres (`&self`, `snapshot`, `context`).
    fn evaluate_step(&self, snapshot: &AgentSnapshot, context: &EvalContext) -> StepScore;

    /// Vérifie si le score est inférieur au seuil d'élagage (Early Pruning).
    fn should_prune(&self, score: &StepScore, context: &EvalContext) -> bool {
        score.0 < context.pruning_threshold
    }
}
