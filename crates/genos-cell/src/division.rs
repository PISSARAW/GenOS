use super::*;
use uuid::Uuid;

impl AgentCell {
    pub fn can_divide(&self) -> Result<(), String> {
        if self.conscience.is_apoptotic {
            return Err("Apoptotic cell cannot divide".to_string());
        }
        if self.is_senescent || self.bud_scars >= self.hayflick_limit {
            return Err("Hayflick limit reached: cell has reached replicative senescence".to_string());
        }
        Ok(())
    }

    pub fn remaining_divisions(&self) -> u32 {
        self.hayflick_limit.saturating_sub(self.bud_scars)
    }

    pub fn apply_telomerase(&mut self) {
        self.bud_scars = 0;
        self.bud_scar_ids.clear();
        self.is_senescent = false;
    }

    pub fn budding(&mut self, daughter_volume: f64) -> Result<AgentCell, String> {
        if daughter_volume <= 0.0 || daughter_volume >= 1.0 {
            return Err("Daughter volume must be between 0 and 1".to_string());
        }
        self.can_divide()?;

        let daughter_id = Uuid::new_v4();
        self.bud_scars += 1;
        self.bud_scar_ids.push(daughter_id);
        if self.bud_scars >= self.hayflick_limit {
            self.is_senescent = true;
        }

        let mother_budget = self.conscience.current_budget;
        let daughter_budget = (mother_budget * daughter_volume).max(0.0);
        self.conscience.current_budget = (mother_budget * (1.0 - daughter_volume)).max(0.0);

        let mut daughter = self.clone();
        daughter.cell_id = daughter_id;
        daughter.name = format!("{}_bud_{}", self.name, self.bud_scars);
        daughter.role = format!("Ephemeral Bud of {}", self.role);
        daughter.bud_scars = 0;
        daughter.bud_scar_ids.clear();
        daughter.is_senescent = false;
        daughter.is_ephemeral = true;
        daughter.ephemeral_ttl = Some(10);
        // Daughter inherits a constrained Hayflick limit to prevent recursive spawn storms
        daughter.hayflick_limit = (self.hayflick_limit / 2).max(1);
        daughter.conscience.current_budget = daughter_budget;
        daughter.conscience.baseline_budget = daughter_budget;
        daughter.regenerate_organelle_ids();

        Ok(daughter)
    }

    pub fn mitosis(&self) -> Result<(Self, Self), String> {
        self.can_divide()?;
        let current_budget = self.conscience.current_budget;
        let baseline_budget = self.conscience.baseline_budget;
        let divided_current_budget = (current_budget / 2.0).max(0.0);
        let divided_baseline_budget = (baseline_budget / 2.0).max(0.0);
        let mut parent = self.clone();
        parent.bud_scars += 1;
        if parent.bud_scars >= parent.hayflick_limit {
            parent.is_senescent = true;
        }
        parent.conscience.current_budget = divided_current_budget;
        parent.conscience.baseline_budget = divided_baseline_budget;

        let mut clone = self.clone();
        clone.cell_id = Uuid::new_v4();
        clone.bud_scars = parent.bud_scars;
        clone.is_senescent = parent.is_senescent;
        clone.conscience.current_budget = divided_current_budget;
        clone.conscience.baseline_budget = divided_baseline_budget;
        clone.regenerate_organelle_ids();
        Ok((parent, clone))
    }

    pub fn binary_fission(&self, mutation_rate: f64) -> Result<(Self, Self), String> {
        if !(0.0..=1.0).contains(&mutation_rate) {
            return Err("Mutation rate must be between 0 and 1".to_string());
        }
        self.can_divide()?;
        let half_budget = (self.conscience.current_budget / 2.0).max(0.0);

        let mut daughter_a = self.clone();
        daughter_a.conscience.current_budget = half_budget;
        daughter_a.bud_scars += 1;
        if daughter_a.bud_scars >= daughter_a.hayflick_limit {
            daughter_a.is_senescent = true;
        }

        let mut daughter_b = self.clone();
        daughter_b.cell_id = Uuid::new_v4();
        daughter_b.conscience.current_budget = half_budget;
        daughter_b.bud_scars = daughter_a.bud_scars;
        daughter_b.is_senescent = daughter_a.is_senescent;
        daughter_b.regenerate_organelle_ids();

        if mutation_rate > 0.0 {
            for organelle in &mut daughter_b.organelles {
                if let Organelle::Mitochondrion { efficiency, .. } = organelle {
                    *efficiency = (*efficiency * (1.0 + mutation_rate * 0.1)).clamp(0.1, 2.0);
                }
            }
            if mutation_rate >= 0.1 {
                daughter_b.role = format!("{} (mutant)", daughter_b.role);
            }
        }

        Ok((daughter_a, daughter_b))
    }

    pub fn schizogony(&mut self, merozoite_count: usize, mutation_rate: f64) -> Result<Vec<AgentCell>, String> {
        if merozoite_count < 2 || merozoite_count > 128 {
            return Err(format!(
                "Merozoite count must be between 2 and 128, got {}",
                merozoite_count
            ));
        }
        if !(0.0..=1.0).contains(&mutation_rate) {
            return Err("Mutation rate must be between 0 and 1".to_string());
        }
        self.can_divide()?;

        let per_merozoite_budget = (self.conscience.current_budget / merozoite_count as f64).max(0.0);
        let mut merozoites = Vec::with_capacity(merozoite_count);

        for idx in 0..merozoite_count {
            let mut merozoite = self.clone();
            merozoite.cell_id = Uuid::new_v4();
            let mutant_tag = if mutation_rate > 0.0 { format!(" [mutated:{:.2}]", mutation_rate) } else { "".to_string() };
            merozoite.name = format!("{}_merozoite_{}{}", self.name, idx + 1, mutant_tag);
            merozoite.role = format!("Merozoite Branch of {}{}", self.role, mutant_tag);
            merozoite.conscience.current_budget = per_merozoite_budget;
            merozoite.conscience.baseline_budget = per_merozoite_budget;
            merozoite.bud_scars = 0;
            merozoite.bud_scar_ids.clear();
            merozoite.is_senescent = false;
            merozoite.is_ephemeral = true;
            merozoite.ephemeral_ttl = Some(5);
            merozoite.hayflick_limit = (self.hayflick_limit / 2).max(1);
            merozoite.regenerate_organelle_ids();
            if mutation_rate > 0.0 {
                for organelle in &mut merozoite.organelles {
                    if let Organelle::Mitochondrion { efficiency, .. } = organelle {
                        *efficiency = (*efficiency * (1.0 + mutation_rate * 0.05 * (idx as f64 + 1.0))).clamp(0.1, 2.0);
                    }
                }
            }
            merozoites.push(merozoite);
        }

        // Biological schizont cycle: mother cell lyses upon releasing merozoites
        self.trigger_apoptosis();

        Ok(merozoites)
    }

    pub fn trigger_apoptosis(&mut self) {
        if self.conscience.is_apoptotic {
            return;
        }
        self.conscience.is_apoptotic = true;
        self.conscience.current_budget = 0.0;
    }
}
