use crate::cell::AgentCell;
use crate::genome::Genome;

#[derive(Clone, Debug, PartialEq)]
pub enum SporeType {
    /// Stratégie de l'essaim : dispersion massive par le vent, coque légère sans réserve.
    FungalReproductive,
    /// Stratégie du bunker : survie à l'apocalypse, triple coque blindée, mort de la mère.
    BacterialEndospore,
}

#[derive(Clone, Debug)]
pub struct Spore {
    pub spore_type: SporeType,
    pub genome: Genome,
    /// Niveau de résistance face aux radiations, vide spatial et ébullition
    pub bunker_armor: u32, 
}

impl Spore {
    /// La Germination (Résurrection ou Éclosion)
    /// La spore sort de stase si les signaux environnementaux sont au vert.
    pub fn germinate(self, warm_and_wet: bool, nutrients_available: bool) -> Result<AgentCell, String> {
        match self.spore_type {
            SporeType::FungalReproductive => {
                if !warm_and_wet {
                    return Err("L'air est sec ou trop froid. La spore fongique flotte et continue de dormir.".to_string());
                }
            },
            SporeType::BacterialEndospore => {
                if !nutrients_available {
                    return Err("Environnement toujours hostile. Le bunker bactérien reste hermétiquement verrouillé en stase absolue.".to_string());
                }
            }
        }

        // Le réveil : L'ADN redémarre une cellule
        let mut new_cell = AgentCell::default();
        new_cell.nucleus.genome = self.genome;
        new_cell.mitochondria.atp_budget = 10; // Redémarrage minimal du métabolisme
        
        // On s'assure que la bactérie recrée sa paroi
        if self.spore_type == SporeType::BacterialEndospore {
            new_cell.plasma_membrane.has_cell_wall = true;
        }

        Ok(new_cell)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sporulation_strategies() {
        let mut mother = AgentCell::default();
        
        // 1. Fongique (La Levure / Le Champignon)
        mother.mitochondria.atp_budget = 100;
        let fungal_spores = mother.fungal_sporulation().unwrap();
        assert_eq!(fungal_spores.len(), 100); // L'essaim massif
        assert_eq!(fungal_spores[0].bunker_armor, 0); // Léger, pas de blindage
        
        // Tentative de germination fongique (échec air sec, puis succès)
        let dry_result = fungal_spores[0].clone().germinate(false, true);
        assert!(dry_result.is_err());
        let wet_result = fungal_spores[1].clone().germinate(true, true);
        assert!(wet_result.is_ok());

        // 2. Bactérienne (L'apocalypse du Tétanos)
        let mut bacteria = AgentCell::default();
        bacteria.plasma_membrane.has_cell_wall = true; // C'est une bactérie
        
        let bunker = bacteria.bacterial_endosporulation().unwrap();
        assert_eq!(bunker.spore_type, SporeType::BacterialEndospore);
        assert_eq!(bunker.bunker_armor, 9999); // Quasi-indestructible
        
        // Tentative de résurrection bactérienne
        let hostile_result = bunker.clone().germinate(true, false);
        assert!(hostile_result.is_err()); // Reste verrouillé
        
        // Le bunker s'ouvre !
        let resurrected = bunker.germinate(true, true).unwrap();
        assert!(resurrected.plasma_membrane.has_cell_wall); // Elle redevient une bactérie
    }
}
