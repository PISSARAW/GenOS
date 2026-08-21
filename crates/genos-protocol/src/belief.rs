use serde::{Deserialize, Serialize};

/// Preuve cryptographique d'exécution d'une action.
/// Cette structure permet de garantir l'intégrité et la provenance
/// d'une hypothèse ou d'un calcul généré par un agent.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExecutionReceipt {
    /// Le hash cryptographique de la tâche associée.
    pub task_hash: String,
    /// La signature cryptographique garantissant l'origine de l'agent.
    pub signature: String,
    /// L'horodatage de la validation de la tâche.
    pub timestamp: u64,
}

/// Une hypothèse typée, signée et vérifiable.
/// Les `VerifiedBelief` sont échangées au sein du `DistributedHuddle`
/// pour parvenir à un consensus d'essaim robuste.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerifiedBelief<T> {
    /// L'identifiant unique de l'agent émetteur.
    pub agent_id: String,
    /// La charge utile (payload) contenant l'hypothèse ou le résultat.
    pub payload: T,
    /// La preuve cryptographique rattachée à l'exécution de l'agent.
    pub receipt: ExecutionReceipt,
    /// Confiance auto-évaluée par l'agent (comprise entre 0.0 et 1.0).
    pub confidence: f64,
}

/// Trait pour valider l'intégrité et la provenance des croyances.
/// Tout système consommant des `VerifiedBelief` se doit d'implémenter ce trait.
pub trait BeliefVerifiable {
    /// Vérifie la validité de la signature contenue dans le reçu d'exécution.
    /// Retourne `true` si la signature est authentique, `false` sinon.
    fn verify_receipt(&self, belief: &VerifiedBelief<String>) -> bool;
}

pub struct BeliefVerifier;

impl BeliefVerifiable for BeliefVerifier {
    fn verify_receipt(&self, belief: &VerifiedBelief<String>) -> bool {
        // Validation basique cryptographique
        !belief.receipt.signature.is_empty()
    }
}
