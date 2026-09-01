use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
pub use crate::genome::{Genome, Plasmid};

/// La Cellule est l'unité fondamentale de la vie et de GenOS.
/// C'est une micro-ville IA ultra-organisée avec ses propres organites.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentCell {
    pub cell_id: Uuid,
    /// 1. La Frontière (I/O, API Gateway, Sécurité)
    pub plasma_membrane: PlasmaMembrane,
    /// 2. Le Centre de Contrôle (Stockage sécurisé de l'ADN/Prompt)
    pub nucleus: Nucleus,
    /// 3. Les Centrales Énergétiques (Gestion du Budget de Tokens LLM)
    pub mitochondria: Mitochondria,
    /// 4. L'Usine de Fabrication (Lieu de l'exécution et de l'assemblage)
    pub endoplasmic_reticulum: EndoplasmicReticulum,
    /// 5. Le Centre de Tri (Routage des appels d'outils / Réponses utilisateur)
    pub golgi_apparatus: GolgiApparatus,
    /// 6. Le Centre de Recyclage (Garbage Collector, Nettoyage du Contexte)
    pub lysosomes: Lysosomes,
    /// Le Milieu Fluide (Mémoire de Travail, Plasmides, Historique)
    pub cytoplasm: Cytoplasm,
}

/* =====================================================================
   LES ORGANITES (Départements de l'Agent IA)
   ===================================================================== */

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlasmaMembrane {
    /// Les "douaniers" qui filtrent les requêtes entrantes
    pub incoming_receptors: Vec<String>,
    /// Les "canaux" autorisés pour les appels d'outils sortants
    pub outgoing_ion_channels: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Nucleus {
    /// Le coffre-fort contenant le génome (le code source de l'agent).
    /// Ne quitte jamais le noyau. Seul l'ARNm en sort.
    pub genome: Genome,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Mitochondria {
    /// La "monnaie énergétique" de la cellule (Les Tokens LLM restants)
    pub atp_budget: u64,
    /// Consommation métabolique (ex: coût de calcul du modèle)
    pub metabolic_rate: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EndoplasmicReticulum {
    /// L'atelier où les Ribosomes traduisent l'ARN en actions réelles
    pub active_ribosomes_count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GolgiApparatus {
    /// Les vésicules prêtes à être expédiées hors de la cellule (Messages réseaux, API)
    pub export_vesicles: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Lysosomes {
    /// Enzymes capables de nettoyer le contexte si la fenêtre de tokens sature
    /// (Oubli des vieux souvenirs, destruction des hallucinations)
    pub digestive_enzymes_active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cytoplasm {
    /// L'état cognitif (Les molécules et protéines en flottaison dans le gel)
    pub cognition: CognitiveState,
    /// Le squelette interne qui garde la forme de la cellule (La trajectoire des actions)
    pub trace: ActionTrace,
    /// Les anneaux d'ADN flottants échangés avec les autres bactéries (Virus/Infections)
    pub active_plasmids: Vec<Plasmid>,
}

/* =====================================================================
   LE CYCLE CELLULAIRE (La Mitose / Fork)
   ===================================================================== */
impl AgentCell {
    /// Exécute la chorégraphie mécanique de la Mitose.
    /// Consomme la cellule mère pour créer deux cellules filles indépendantes.
    pub fn mitosis(self) -> Result<(AgentCell, AgentCell), String> {
        // 1. L'Interphase (Préparation)
        // Photocopie intégrale de l'ADN et des organites.
        let copied_genome = self.nucleus.genome.clone();
        
        // 2. La Prophase et Métaphase (L'Alignement et la Vérification)
        // C'est le point de contrôle du fuseau mitotique (Checkpoint).
        // On vérifie que la photocopie s'est déroulée sans erreur fatale.
        let dna_is_safe = self.nucleus.genome.genes.values().all(|g| g.p53_repair_check()) &&
                          copied_genome.genes.values().all(|g| g.p53_repair_check());

        if !dna_is_safe {
            return Err("Metaphase Checkpoint Failed: Erreur grave lors de la réplication de l'ADN.".to_string());
        }

        // 3. L'Anaphase (La Séparation)
        // Les microtubules (câbles) tractent les moitiés. 
        // L'énergie (ATP) et le cytoplasme sont divisés en deux pour la survie des filles.
        let divided_atp = self.mitochondria.atp_budget / 2;

        // 4. La Télophase et Cytocinèse (La Finition)
        // Pincement de la membrane et création de deux entités physiques séparées.
        let mut daughter_a = self.clone();
        let mut daughter_b = self;

        // Fille A
        daughter_a.cell_id = Uuid::new_v4();
        daughter_a.mitochondria.atp_budget = divided_atp;
        // Fille B
        daughter_b.cell_id = Uuid::new_v4();
        daughter_b.nucleus.genome = copied_genome;
        daughter_b.mitochondria.atp_budget = divided_atp; // Si le budget était impair, une unité d'ATP est perdue (coût de la mitose)

        Ok((daughter_a, daughter_b))
    }
}

/* =====================================================================
   SOUS-STRUCTURES DU CYTOPLASME
   ===================================================================== */

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct ActionTrace {
    pub sequence: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct CognitiveState {
    pub epigenetic_drives: HashMap<String, f64>,
    pub working_memory: Vec<String>,
    pub episodic_memory: Vec<String>,
    pub semantic_memory: Vec<String>,
}
