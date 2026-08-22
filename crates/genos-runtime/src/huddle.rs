use genos_protocol::belief::VerifiedBelief;
use std::collections::HashMap;

/// Contexte d'un comité distribué discutant d'un sujet donné.
/// Le `DistributedHuddle` regroupe un ensemble d'agents et leurs
/// hypothèses formelles signées (`VerifiedBelief`).
#[derive(Clone, Debug)]
pub struct DistributedHuddle {
    /// Le sujet ou la tâche en cours d'évaluation.
    pub topic: String,
    /// La liste des croyances vérifiées, apportées par chaque membre de l'essaim.
    pub beliefs: Vec<VerifiedBelief<String>>,
}

/// Trait implémentant le Consensus de Brier.
/// Ce mécanisme permet d'agréger les votes pondérés des agents
/// en fonction de leur fiabilité historique (erreur de calibration).
pub trait BrierConsensus {
    /// Récupère le poids d'un agent donné.
    /// Un poids élevé est attribué à un agent ayant un excellent score de Brier (faible erreur).
    fn compute_agent_weight(&self, agent_id: &str) -> f64;

    /// Agrège l'ensemble des croyances du `DistributedHuddle` pour dégager le consensus.
    /// Retourne la charge utile (payload) ayant obtenu le meilleur score consolidé.
    fn reach_consensus(&self, huddle: &DistributedHuddle) -> Option<String>;
}

/// Une implémentation standard du `BrierConsensus`.
/// Elle multiplie le poids historique de l'agent par la confiance déclarée
/// pour son hypothèse actuelle, puis additionne les scores par hypothèse unique.
pub struct StandardBrierConsensus;

impl BrierConsensus for StandardBrierConsensus {
    fn compute_agent_weight(&self, _agent_id: &str) -> f64 {
        // En vrai: va lire genos_store pour le Brier score historique
        1.0
    }

    fn reach_consensus(&self, huddle: &DistributedHuddle) -> Option<String> {
        let mut scores: HashMap<String, f64> = HashMap::new();

        for belief in &huddle.beliefs {
            let weight = self.compute_agent_weight(&belief.agent_id);
            let score = weight * belief.confidence;
            *scores.entry(belief.payload.clone()).or_insert(0.0) += score;
        }

        scores
            .into_iter()
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(payload, _)| payload)
    }
}
