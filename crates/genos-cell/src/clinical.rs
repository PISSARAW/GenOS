use serde::{Deserialize, Serialize};

/// Catégories diagnostiques des pathologies computationnelles dans GenOS
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum DiseaseCategory {
    /// Réaction de défense excessive où le système attaque ou épuise ses propres agents
    Autoimmune,
    /// Infection contractée par contamination croisée dans un espace partagé (capsule, fente synaptique)
    Nosocomial,
    /// Effet secondaire délétère ou complication induite par un traitement de l'Orchestrateur
    Iatrogenic,
    /// Dégradation progressive des capacités cognitives, du contexte ou épuisement des télomères
    Degenerative,
    /// Attaque exogène par un vecteur viral ou un prompt d'injection
    Infectious,
}

/// Pathologies formelles modélisées dans le runtime agentique
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Pathology {
    // --- 1. Pathologies Auto-immunes ---
    /// Orage cytokinique provoquant une explosion du coût métabolique (IL-6)
    CytokineStorm {
        il6_level: f64,
    },
    /// Hyperactivation des agents phagocytes éliminant des workers sains
    MacrophageHyperactivation,
    /// Ciblage erroné d'un agent légitime par des anticorps d'audit
    AutologousTargeting {
        targeted_agent_role: String,
    },

    // --- 2. Pathologies Nosocomiales ---
    /// Contamination croisée attrapée dans une capsule partagée
    CrossContamination {
        source_capsule: String,
        pathogen_signature: String,
    },
    /// Infection acquise en milieu d'orchestration lors d'une inspection
    HospitalAcquiredInfection {
        origin_facility: String,
    },

    // --- 3. Pathologies Iatrogènes ---
    /// Coma provoqué par une surdose de corticostéroïdes (> 0.8)
    SteroidInducedComa {
        administered_dose: f64,
    },
    /// Destruction collatérale de workers légitimes lors d'un traitement antibiotique
    AntibioticCollateralDamage {
        eliminated_components: Vec<String>,
    },
    /// Blocage récepteur persistant après une thérapie ciblée non réversible
    PersistentReceptorBlockade,
    /// Dérive cognitive suite à une hypermutation non contrôlée ordonnée par l'Orchestrateur
    IatrogenicCognitiveDrift {
        entropy_shift: f64,
    },

    // --- 4. Pathologies Dégénératives ---
    /// Épuisement complet de la réserve télomérique (Hayflick limit atteinte)
    TelomereExhaustion {
        bud_scars: u32,
    },
    /// Sénescence réplicative avec saturation du contexte
    ReplicativeSenescence,
    /// Agrégation de prions computationnels (incohérences logiques propagées dans la mémoire)
    PrionAggregation {
        dissonance_score: f64,
    },
    /// Dégradation graduelle du raisonnement par perte d'attention
    ContextualDecay {
        age_ticks: u64,
    },
}

impl Pathology {
    /// Retourne la catégorie étiologique de la pathologie
    pub fn category(&self) -> DiseaseCategory {
        match self {
            Pathology::CytokineStorm { .. }
            | Pathology::MacrophageHyperactivation
            | Pathology::AutologousTargeting { .. } => DiseaseCategory::Autoimmune,

            Pathology::CrossContamination { .. }
            | Pathology::HospitalAcquiredInfection { .. } => DiseaseCategory::Nosocomial,

            Pathology::SteroidInducedComa { .. }
            | Pathology::AntibioticCollateralDamage { .. }
            | Pathology::PersistentReceptorBlockade
            | Pathology::IatrogenicCognitiveDrift { .. } => DiseaseCategory::Iatrogenic,

            Pathology::TelomereExhaustion { .. }
            | Pathology::ReplicativeSenescence
            | Pathology::PrionAggregation { .. }
            | Pathology::ContextualDecay { .. } => DiseaseCategory::Degenerative,
        }
    }

    /// Titre lisible de la pathologie
    pub fn name(&self) -> &'static str {
        match self {
            Pathology::CytokineStorm { .. } => "Orage Cytokinique (IL-6 Storm)",
            Pathology::MacrophageHyperactivation => "Hyperactivation Macrophagique",
            Pathology::AutologousTargeting { .. } => "Ciblage Auto-Immun",
            Pathology::CrossContamination { .. } => "Contamination Croisée Nosocomiale",
            Pathology::HospitalAcquiredInfection { .. } => "Infection Nosocomiale de Capsule",
            Pathology::SteroidInducedComa { .. } => "Coma Stéroïdien Iatrogène",
            Pathology::AntibioticCollateralDamage { .. } => "Dommage Collatéral Antibiotique",
            Pathology::PersistentReceptorBlockade => "Blocage Récepteur Persistant",
            Pathology::IatrogenicCognitiveDrift { .. } => "Dérive Cognitive Iatrogène",
            Pathology::TelomereExhaustion { .. } => "Épuisement Télomérique",
            Pathology::ReplicativeSenescence => "Sénescence Réplicative",
            Pathology::PrionAggregation { .. } => "Agrégation Prionique Cognitive",
            Pathology::ContextualDecay { .. } => "Dégénérescence Contextuelle",
        }
    }
}

/// Dossier clinique complet attaché à chaque AgentCell
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq)]
pub struct ClinicalState {
    /// Liste des pathologies actives diagnostiquées
    #[serde(default)]
    pub active_pathologies: Vec<Pathology>,
    /// Indice inflammatoire courant (0.0 = neutre, 1.0 = critique)
    #[serde(default)]
    pub inflammatory_index: f64,
    /// Statut d'isolement en quarantaine médicale
    #[serde(default)]
    pub is_quarantined: bool,
    /// Dernier traitement systémique ou local administré
    #[serde(default)]
    pub last_treatment_applied: Option<String>,
    /// Historique des diagnostics et interventions
    #[serde(default)]
    pub clinical_log: Vec<String>,
}

impl ClinicalState {
    /// Crée un état clinique sain par défaut
    pub fn healthy() -> Self {
        Self::default()
    }

    /// Diagnostique et ajoute une pathologie
    pub fn diagnose(&mut self, pathology: Pathology) {
        let name = pathology.name();
        if !self.active_pathologies.iter().any(|p| p.name() == name) {
            self.clinical_log.push(format!("Diagnostic: {}", name));
            self.active_pathologies.push(pathology);
        }
    }

    /// Soigne une pathologie active
    pub fn cure_pathology_by_name(&mut self, name: &str) -> bool {
        let before_len = self.active_pathologies.len();
        self.active_pathologies.retain(|p| p.name() != name);
        let cured = self.active_pathologies.len() < before_len;
        if cured {
            self.clinical_log.push(format!("Rémission confirmée: {}", name));
        }
        cured
    }

    /// Vérifie si l'agent est indemne de toute pathologie
    pub fn is_healthy(&self) -> bool {
        self.active_pathologies.is_empty()
    }

    /// Vérifie si l'agent souffre d'une catégorie spécifique
    pub fn has_disease_category(&self, cat: DiseaseCategory) -> bool {
        self.active_pathologies.iter().any(|p| p.category() == cat)
    }

    /// Place l'agent en quarantaine nosocomiale
    pub fn isolate(&mut self, reason: &str) {
        self.is_quarantined = true;
        self.clinical_log.push(format!("Mise en quarantaine: {}", reason));
    }

    /// Lève la quarantaine
    pub fn discharge(&mut self) {
        self.is_quarantined = false;
        self.clinical_log.push("Levée de quarantaine (Fin de convalescence)".to_string());
    }
}
