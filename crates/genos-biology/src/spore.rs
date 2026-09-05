use crate::cell::AgentCell;
use crate::genome::Genome;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SporeType {
    FungalReproductive,
    BacterialEndospore,
}

#[derive(Clone, Debug)]
pub struct Spore {
    pub spore_type: SporeType,
    pub genome: Genome,
    pub bunker_armor: u32,
}

impl Spore {
    pub fn new(spore_type: SporeType, genome: Genome, bunker_armor: u32) -> Self {
        Self {
            spore_type,
            genome,
            bunker_armor,
        }
    }

    pub fn germinate(self, warm_and_wet: bool, nutrients_available: bool) -> Result<AgentCell, String> {
        match self.spore_type {
            SporeType::FungalReproductive => {
                if !warm_and_wet {
                    return Err("Dry or cold air. Fungal spore remains dormant.".to_string());
                }
            }
            SporeType::BacterialEndospore => {
                if !nutrients_available {
                    return Err("Hostile environment. Bacterial endospore remains sealed.".to_string());
                }
            }
        }

        let mut new_cell = AgentCell::default();
        new_cell.role = match self.spore_type {
            SporeType::FungalReproductive => "Fungal Colony Cell".to_string(),
            SporeType::BacterialEndospore => "Bacterial Vegetative Cell".to_string(),
        };
        new_cell.conscience.current_budget = 10.0;
        Ok(new_cell)
    }

    pub fn create_fungal_spores(genome: &Genome, count: usize) -> Vec<Self> {
        (0..count)
            .map(|_| Self::new(SporeType::FungalReproductive, genome.clone(), 0))
            .collect()
    }

    pub fn create_bacterial_endospore(genome: &Genome) -> Self {
        Self::new(SporeType::BacterialEndospore, genome.clone(), 9999)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sporulation_strategies() {
        let genome = Genome::new("MOTHER_DNA");
        let fungal_spores = Spore::create_fungal_spores(&genome, 100);
        assert_eq!(fungal_spores.len(), 100);
        assert_eq!(fungal_spores[0].bunker_armor, 0);

        let dry_res = fungal_spores[0].clone().germinate(false, true);
        assert!(dry_res.is_err());
        let wet_res = fungal_spores[1].clone().germinate(true, true);
        assert!(wet_res.is_ok());

        let bunker = Spore::create_bacterial_endospore(&genome);
        assert_eq!(bunker.spore_type, SporeType::BacterialEndospore);
        assert_eq!(bunker.bunker_armor, 9999);

        let hostile_res = bunker.clone().germinate(true, false);
        assert!(hostile_res.is_err());

        let revived = bunker.germinate(true, true).unwrap();
        assert_eq!(revived.role, "Bacterial Vegetative Cell");
    }
}
