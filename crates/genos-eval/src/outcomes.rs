use crate::mcts::AgentSnapshot;

/// Résultat d'une tentative de résolution d'une étape par l'agent.
#[derive(Debug, Clone)]
pub enum StepOutcome {
    /// L'agent propose une suite valide.
    Proposal(AgentSnapshot),
    /// L'agent détecte une tâche impossible/paradoxale et s'abstient (US 2.4).
    ActiveRefusal(String), 
    /// Échec technique ou erreur de parsing.
    Error(String),
}
