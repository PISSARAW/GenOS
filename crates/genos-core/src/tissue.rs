use uuid::Uuid;
use serde::{Deserialize, Serialize};

/// Un Tissu (Organogenèse) est l'équivalent biologique d'une 'Fleet' ou d'une 'Équipe' dynamique.
/// Il structure l'essaim chaotique en connectant physiquement plusieurs cellules autour d'une
/// fonction commune, dirigées par une Cellule Souche (Le Manager).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tissue {
    pub name: String,
    pub function_role: String,
    /// La Cellule Manager (Orchestrateur local du tissu)
    pub stem_cell_id: Uuid,
    /// Les Cellules Ouvrières (Ex: Développeurs, Testeurs, Chercheurs)
    pub somatic_cells: Vec<Uuid>,
}

impl Tissue {
    pub fn new(name: &str, function: &str, stem_cell_id: Uuid) -> Self {
        Self {
            name: name.to_string(),
            function_role: function.to_string(),
            stem_cell_id,
            somatic_cells: Vec::new(),
        }
    }

    /// Organogenèse : Intègre une nouvelle cellule spécialisée (Somatic) dans le tissu
    pub fn integrate_cell(&mut self, cell_id: Uuid) {
        if !self.somatic_cells.contains(&cell_id) {
            self.somatic_cells.push(cell_id);
        }
    }

    /// Délégation hiérarchique : La Cellule Souche donne une instruction formelle à une Cellule Somatique.
    /// Cela simule la transmission d'informations formelles via des Desmosomes (Ponts intercellulaires).
    pub fn delegate_task(&self, from_id: Uuid, to_id: Uuid, task: &str) -> Result<String, String> {
        if from_id != self.stem_cell_id {
            return Err("Rejet Immunitaire (Mutinerie) : Seule la Cellule Souche peut dicter l'activité du tissu.".to_string());
        }
        if !self.somatic_cells.contains(&to_id) {
            return Err("Erreur de Routage : Cette cellule n'appartient pas au tissu cible.".to_string());
        }

        // En pratique, l'orchestrateur injectera cette tâche dans la working_memory de l'agent `to_id`.
        Ok(format!("⚡ [Desmosome] Tissu '{}' -> Tâche déléguée avec succès par la Souche vers la somatique {}. Instruction : {}", self.name, to_id, task))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::AgentCell;

    #[test]
    fn test_tissue_organogenesis() {
        // 1. Création de nos cellules
        let manager_cell = AgentCell::default(); // Cellule Souche
        let dev_cell = AgentCell::default();     // Somatique
        let test_cell = AgentCell::default();    // Somatique
        let rogue_cell = AgentCell::default();   // Hors du tissu

        // 2. Formation du Tissu (Équipe)
        let mut frontend_tissue = Tissue::new(
            "Frontend_Organ",
            "Gérer l'interface utilisateur",
            manager_cell.cell_id,
        );

        frontend_tissue.integrate_cell(dev_cell.cell_id);
        frontend_tissue.integrate_cell(test_cell.cell_id);

        // 3. Succès : Le Manager délègue au Dev
        let delegation = frontend_tissue.delegate_task(
            manager_cell.cell_id,
            dev_cell.cell_id,
            "Implémenter le bouton de connexion",
        );
        assert!(delegation.is_ok());

        // 4. Échec : Le Manager tente de déléguer à une cellule inconnue
        let err_target = frontend_tissue.delegate_task(
            manager_cell.cell_id,
            rogue_cell.cell_id,
            "Fais ceci",
        );
        assert!(err_target.is_err());
        assert!(err_target.unwrap_err().contains("Routage"));

        // 5. Échec (Mutinerie) : Le Dev tente de donner un ordre au Testeur
        let err_mutiny = frontend_tissue.delegate_task(
            dev_cell.cell_id,
            test_cell.cell_id,
            "Écris mes tests",
        );
        assert!(err_mutiny.is_err());
        assert!(err_mutiny.unwrap_err().contains("Mutinerie"));
    }
}