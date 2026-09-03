use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// L'Hérédité et le Traçage Généalogique (Lineage)
/// Permet de savoir de quelle cellule cet agent est issu (Traçabilité),
/// et limite la récursion infinie d'agents grâce à la limite de Hayflick (Télomères).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Lineage {
    pub ancestor_id: Option<Uuid>,
    pub generation: u32,
    pub mutations_history: Vec<String>,
    pub telomere_length: u32, // Limite de Hayflick
}

impl Default for Lineage {
    fn default() -> Self {
        Self {
            ancestor_id: None,
            generation: 0,
            mutations_history: vec!["Cellule Souche Primordiale (Génération 0)".to_string()],
            telomere_length: 50, // Limite classique de reproduction
        }
    }
}

impl Lineage {
    pub fn new() -> Self {
        Self::default()
    }

    /// Lors d'une mitose, la cellule fille hérite et raccourcit ses télomères
    pub fn inherit_from(mother_id: Uuid, mother_gen: u32, mother_telomeres: u32, mutation_note: &str) -> Result<Self, String> {
        if mother_telomeres == 0 {
            return Err("Sénescence atteinte : Les télomères sont trop courts pour une nouvelle division (Limite de Hayflick atteinte). L'agent ne peut plus se cloner.".to_string());
        }

        Ok(Self {
            ancestor_id: Some(mother_id),
            generation: mother_gen + 1,
            mutations_history: vec![format!("Généré par mitose de l'Agent {} avec la mutation: {}", mother_id, mutation_note)],
            telomere_length: mother_telomeres - 1, // Raccourcissement à chaque division
        })
    }

    pub fn record_mutation(&mut self, description: &str) {
        self.mutations_history.push(description.to_string());
    }

    pub fn display_phylogeny(&self) -> String {
        format!(
            "🌳 [ARBRE PHYLOGÉNÉTIQUE] Génération: {} | Ancêtre: {:?} | Télomères restants: {} | Mutations: {}",
            self.generation, self.ancestor_id, self.telomere_length, self.mutations_history.join(" -> ")
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hayflick_limit() {
        let mother = Lineage {
            ancestor_id: None,
            generation: 50,
            mutations_history: vec![],
            telomere_length: 1, // Il ne reste qu'une division possible
        };

        // Première division OK
        let daughter = Lineage::inherit_from(Uuid::new_v4(), mother.generation, mother.telomere_length, "Test").unwrap();
        assert_eq!(daughter.telomere_length, 0);

        // Seconde division (Petite-fille) DOIT ÉCHOUER
        let grand_daughter = Lineage::inherit_from(Uuid::new_v4(), daughter.generation, daughter.telomere_length, "Test 2");
        assert!(grand_daughter.is_err());
        assert!(grand_daughter.unwrap_err().contains("Sénescence"));
    }
}