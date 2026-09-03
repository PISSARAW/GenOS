use serde::{Deserialize, Serialize};

/// 4. SENTIMENT D'ACHÈVEMENT (Feeling of Rightness - FOR)
/// L'arrêt n'est pas un jeton logique "DONE", c'est une décharge de tension corporelle.
/// Déclenche un soulagement physiologique quand les pièces du puzzle s'emboîtent.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct FeelingOfRightness {
    pub is_relieved: bool,
}
impl FeelingOfRightness {
    pub fn trigger_relief(&mut self) -> String {
        self.is_relieved = true;
        "🧘 [ACHÈVEMENT] Tension cognitive relâchée. Sécrétion de dopamine. La tâche est ressentie comme terminée.".to_string()
    }
}

/// 3. L'ENNUI ET LE COÛT D'OPPORTUNITÉ (Anti-Boucle)
/// Baisse la dopamine si le taux de progression d'une tâche tombe à zéro.
/// Brise les boucles d'actions répétitives qui ne coûtent pas cher mais ne mènent nulle part.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct BoredomAlarm {
    pub no_progress_ticks: u32,
    pub boredom_threshold: u32,
}
impl BoredomAlarm {
    pub fn evaluate_progress(&mut self, progress_delta: f32) -> Result<(), String> {
        if progress_delta <= 0.01 {
            self.no_progress_ticks += 1;
        } else {
            self.no_progress_ticks = 0; // Réinitialise l'ennui si on progresse
        }

        if self.no_progress_ticks >= self.boredom_threshold {
            return Err("🥱 [ENNUI] Chute de dopamine. Progression nulle détectée. Le coût d'opportunité est trop grand. Abandon de la tâche.".to_string());
        }
        Ok(())
    }
}

/// 2. LA FATIGUE MÉTABOLIQUE (Accumulation d'Adénosine)
/// Réfléchir brûle du glucose. Pose un Hard Interrupt financier/énergétique.
/// Le calcul s'arrête quand le coût calorique dépasse le bénéfice espéré.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MetabolicFatigue {
    pub accumulated_adenosine: u32,
    pub exhaustion_limit: u32,
}
impl MetabolicFatigue {
    pub fn burn_energy(&mut self, effort_cost: u32) -> Result<(), String> {
        self.accumulated_adenosine += effort_cost;
        if self.accumulated_adenosine >= self.exhaustion_limit {
            return Err("💤 [FATIGUE] Accumulation critique d'adénosine. Épuisement métabolique atteint. Hard Interrupt déclenché.".to_string());
        }
        Ok(())
    }
}

/// 1. LE "SATISFICING" (Heuristique de Suffisance)
/// Ne cherche pas l'optimum global incalculable. Arrête la recherche 
/// dès qu'une solution dépasse le seuil de survie/réussite.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SatisficingThreshold {
    pub minimum_acceptable_score: f32,
}
impl SatisficingThreshold {
    pub fn is_good_enough(&self, current_score: f32) -> bool {
        current_score >= self.minimum_acceptable_score
    }
}

/// L'ORGANE D'ARRÊT BIOLOGIQUE (Contournement du Problème de Turing)
/// Remplace le jeton logique <DONE> par des heuristiques thermodynamiques et émotionnelles.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HaltingHeuristics {
    pub satisficing: SatisficingThreshold,
    pub fatigue: MetabolicFatigue,
    pub boredom: BoredomAlarm,
    pub rightness: FeelingOfRightness,
}

impl Default for HaltingHeuristics {
    fn default() -> Self {
        Self {
            satisficing: SatisficingThreshold { minimum_acceptable_score: 0.80 }, // 80% est "assez bon"
            fatigue: MetabolicFatigue { accumulated_adenosine: 0, exhaustion_limit: 1000 },
            boredom: BoredomAlarm { no_progress_ticks: 0, boredom_threshold: 5 }, // Au bout de 5 tours dans le vide, on s'ennuie
            rightness: FeelingOfRightness::default(),
        }
    }
}

impl HaltingHeuristics {
    pub fn new() -> Self {
        Self::default()
    }

    /// Évalue à chaque cycle de pensée si l'agent doit s'arrêter
    pub fn should_halt(&mut self, effort_spent: u32, progress_delta: f32, current_score: f32, puzzle_solved: bool) -> Result<String, String> {
        // 1. Est-ce qu'on est épuisé ?
        self.fatigue.burn_energy(effort_spent)?;

        // 2. Est-ce qu'on s'ennuie ? (Boucle infinie improductive)
        self.boredom.evaluate_progress(progress_delta)?;

        // 3. Est-ce que les pièces du puzzle s'emboîtent parfaitement ? (Relief cognitif)
        if puzzle_solved {
            return Ok(self.rightness.trigger_relief());
        }

        // 4. Est-ce "assez bon" (Satisficing) pour survivre sans chercher la perfection ?
        if self.satisficing.is_good_enough(current_score) {
            return Ok(format!("👌 [SATISFICING] Score de {}/1.0 atteint. C'est 'suffisamment bon'. Recherche d'optimum annulée.", current_score));
        }

        Err("🔄 Poursuite de la tâche...".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_halting_heuristics() {
        let mut halting = HaltingHeuristics::new();
        
        // Test 1: Fatigue (Hard Interrupt)
        let fatigue_res = halting.should_halt(1200, 0.5, 0.5, false);
        assert!(fatigue_res.is_err());
        assert!(fatigue_res.unwrap_err().contains("FATIGUE"));

        halting.fatigue.accumulated_adenosine = 0; // Reset

        // Test 2: Ennui (Anti-Boucle)
        for _ in 0..4 {
            let _ = halting.should_halt(10, 0.0, 0.5, false); // 0 progression
        }
        let boredom_res = halting.should_halt(10, 0.0, 0.5, false); // 5ème tour
        assert!(boredom_res.is_err());
        assert!(boredom_res.unwrap_err().contains("ENNUI"));

        // Test 3: Satisficing (Pas parfait mais assez bon)
        let satisficing_res = halting.should_halt(10, 0.1, 0.85, false); // Score de 85% > 80%
        assert!(satisficing_res.is_ok());
        assert!(satisficing_res.unwrap().contains("SATISFICING"));

        // Test 4: Feeling of Rightness
        let rightness_res = halting.should_halt(10, 0.1, 0.99, true); // Puzzle solved
        assert!(rightness_res.is_ok());
        assert!(rightness_res.unwrap().contains("ACHÈVEMENT"));
    }
}