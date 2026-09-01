use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Représente l'Agent IA comme une Cellule Biologique stricte.
/// Chaque bloc possède sa propre méthode d'évaluation mathématique.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentCell {
    /// Bloc 1 : Métadonnées pures (Non-déterministe, ignoré pour les comparaisons)
    pub metadata: InstanceMetadata,

    /// Bloc 2 : Le milieu extracellulaire (Hachage strict SHA256)
    pub environment: EnvironmentContext,

    /// Bloc 3 : L'ADN immuable de l'agent (Hachage strict SHA256)
    pub genome: Genome,

    /// Bloc 4 : Plasmides et infections (Intersection d'ensembles)
    pub microbiome: Microbiome,

    /// Bloc 5 : Historique comportemental (Distance de Levenshtein)
    pub trace: ActionTrace,

    /// Bloc 6 : Cerveau et états épigénétiques (Embeddings Vectoriels & Similarité Cosinus)
    pub cognition: CognitiveState,
}

/* =====================================================================
   BLOC 1 : L'Enveloppe (Bruit d'exécution)
   ===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstanceMetadata {
    pub agent_id: Uuid,
    pub snapshot_id: Uuid,
    pub branch_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub budget_tokens_remaining: u64,
}

/* =====================================================================
   BLOC 2 : L'Environnement (Contexte)
   ===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct EnvironmentContext {
    pub world_id: Uuid,
    /// Identifiants des agents avec qui il peut communiquer (Topologie de l'essaim)
    pub peer_ids: Vec<Uuid>,
    /// Noms des outils mis à disposition par le système
    pub available_tools: Vec<String>,
}

pub use crate::genome::{Genome, Plasmid};

/* =====================================================================
   BLOC 4 : Le Microbiome (Mutations / Infections temporaires)
   ===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Microbiome {
    /// Plasmides échangés dynamiquement avec l'environnement
    pub active_plasmids: Vec<Plasmid>,
}

/* =====================================================================
   BLOC 5 : La Trajectoire (Phénotype Comportemental)
   ===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct ActionTrace {
    /// Séquence stricte des actions effectuées (sans timestamps ni IDs générés)
    /// Ex: ["read_file(main.rs)", "bash(ls -la)"]
    pub sequence: Vec<String>,
}

/* =====================================================================
   BLOC 6 : Le Cerveau (Cognition et Épigénétique)
   ===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct CognitiveState {
    /// Les "drives" actuels (ex: exploration: 0.8) - Modulateurs épigénétiques
    pub epigenetic_drives: HashMap<String, f64>,
    /// Mémoire de travail (Contexte immédiat)
    pub working_memory: Vec<String>,
    /// Souvenirs des événements passés (Épisodique)
    pub episodic_memory: Vec<String>,
    /// Faits déduits et invariants (Sémantique)
    pub semantic_memory: Vec<String>,
    /// Ce que l'agent tente de résoudre actuellement
    pub active_goals: Vec<String>,
}
