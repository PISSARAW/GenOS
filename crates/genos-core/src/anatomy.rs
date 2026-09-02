use crate::cell::AgentCell;

/// NIVEAU 1 : Le Tissu (La Guilde de Spécialistes)
/// Regroupement d''agents ayant subi la même différenciation.
pub enum TissueType {
    /// Les Frontières (ex: API Gateway, UI, Parseurs de requêtes)
    Epithelial,
    /// Les Moteurs (ex: Workers lourds, LLMs d'inférence, calcul GPU)
    Muscular,
    /// Le Réseau (ex: Routeurs IA, Planificateurs, Contrôleurs)
    Nervous,
    /// Le Soutien et Transport (ex: Base de données, Event Bus, Cache)
    Connective,
}

pub struct Tissue {
    pub tissue_type: TissueType,
    pub cells: Vec<AgentCell>,
}

/// NIVEAU 2 : L''Organe (Le Microservice)
/// Assemblage de tissus pour une mission complexe (ex: "Service de Paiement" ou "Stomac")
pub struct Organ {
    pub name: String,
    pub tissues: Vec<Tissue>,
}

/// NIVEAU 3 : Les Systèmes d''Infrastructure
/// Orchestration macroscopique de la Mégalopole
pub struct AnatomySystem;

impl AnatomySystem {
    /// A. LA LOGISTIQUE ÉNERGÉTIQUE (Système Cardiovasculaire)
    /// Répartit le budget d''exécution (Sucre/Oxygène) à travers tous les organes
    pub fn cardiovascular_distribution(organs: &mut Vec<Organ>, global_budget: u64) {
        let budget_per_organ = global_budget / std::cmp::max(1, organs.len() as u64);
        
        for organ in organs.iter_mut() {
            for tissue in organ.tissues.iter_mut() {
                for cell in tissue.cells.iter_mut() {
                    // La mitochondrie absorbe les nutriments pour la Respiration Cellulaire
                    cell.metabolism.mitochondria.cellular_respiration(budget_per_organ, true);
                }
            }
        }
    }

    /// C. L''ENTRETIEN (Système Urinaire / Garbage Collector)
    /// Filtre les déchets toxiques (Radicaux libres / Halucinations de contexte)
    pub fn renal_filtration(organs: &mut Vec<Organ>) {
        for organ in organs.iter_mut() {
            for tissue in organ.tissues.iter_mut() {
                for cell in tissue.cells.iter_mut() {
                    // Les reins nettoient l'excès de stress oxydatif pour éviter le vieillissement de l'IA
                    if cell.metabolism.mitochondria.accumulated_free_radicals > 100 {
                        cell.metabolism.mitochondria.accumulated_free_radicals = 0; // "Flush" du contexte
                    }
                }
            }
        }
    }
}
