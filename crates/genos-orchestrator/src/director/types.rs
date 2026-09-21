/// Stratégies d'équipe, façon organisation biologique.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Strategy {
    Solo,
    ATeam,
    Biocenose,
    Biome,
    Trinity,
}

#[derive(Clone, Debug)]
pub struct Step {
    pub concept: Concept,
    pub utility: f64,
}

#[derive(Clone, Debug)]
pub struct Decision {
    pub strategy: Strategy,
    /// Organisation (topologie de communication) retenue par le directeur.
    pub organization: Organization,
    /// Forme d'organisation biologique retenue (holobionte, syncytium, ...).
    pub superorganism: Superorganism,
    pub steps: Vec<Step>,
    pub rationale: String,
    pub halt: Option<String>,
}

/// Index du niveau de stress dans le vecteur de contexte (`context_from_state`).
pub const STRESS_CONTEXT_INDEX: usize = 3;
/// Vitesse d'adaptation des paramètres organisationnels (plasticité).
pub const PLASTICITY_RATE: f64 = 0.02;
/// Coût à partir duquel un concept est considéré « coûteux » pour la plasticité.
pub const COSTLY_CONCEPT_THRESHOLD: f64 = 4.0;