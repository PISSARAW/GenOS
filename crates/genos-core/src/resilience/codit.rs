use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompartmentState {
    Intact,
    Damaged,
    WalledOff,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CoditSystem {
    pub walls: Vec<CompartmentState>,
    pub energy_reserves: f32,
}

impl CoditSystem {
    pub fn new(size: usize, initial_energy: f32) -> Self {
        Self {
            walls: vec![CompartmentState::Intact; size],
            energy_reserves: initial_energy,
        }
    }

    /// Applique des dommages  un compartiment spcifique.
    pub fn take_damage(&mut self, index: usize) {
        if index < self.walls.len() && self.walls[index] == CompartmentState::Intact {
            self.walls[index] = CompartmentState::Damaged;
        }
    }

    /// Tente de compartimenter (wall off) les dgts (cicatrisation).
    pub fn compartmentalize(&mut self) -> usize {
        let cost_per_wall = 10.0;
        let mut walled = 0;

        for state in self.walls.iter_mut() {
            if *state == CompartmentState::Damaged && self.energy_reserves >= cost_per_wall {
                *state = CompartmentState::WalledOff;
                self.energy_reserves -= cost_per_wall;
                walled += 1;
            }
        }
        walled
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_codit_compartmentalization() {
        let mut codit = CoditSystem::new(5, 25.0);
        codit.take_damage(1);
        codit.take_damage(3);
        codit.take_damage(4);

        // Can only heal 2 (costs 20) with 25 energy.
        let healed = codit.compartmentalize();
        assert_eq!(healed, 2);
        assert_eq!(codit.walls[1], CompartmentState::WalledOff);
        assert_eq!(codit.walls[3], CompartmentState::WalledOff);
        assert_eq!(codit.walls[4], CompartmentState::Damaged);
        assert_eq!(codit.energy_reserves, 5.0);
    }
}

