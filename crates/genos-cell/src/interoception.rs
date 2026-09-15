use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CortisolAdrenalineAxis {
    pub cortisol_level: f64,
    pub adrenaline_level: f64,
}

impl Default for CortisolAdrenalineAxis {
    fn default() -> Self {
        Self {
            cortisol_level: 0.0,
            adrenaline_level: 0.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DopamineAcetylcholineAxis {
    pub dopamine_availability: f64,
    pub acetylcholine_availability: f64,
}

impl Default for DopamineAcetylcholineAxis {
    fn default() -> Self {
        Self {
            dopamine_availability: 1.0,
            acetylcholine_availability: 1.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct InteroceptionState {
    pub insular_cortex_integrity: f64,
    pub pro_inflammatory_cytokines: f64,
    pub adenosine_pressure: f64,
    pub blood_glucose: f64,
    pub stress_hormones: CortisolAdrenalineAxis,
    pub ghrelin_leptin_ratio: f64,
    pub osmolarity: f64,
    pub glutamate_saturation: f64,
    pub neurotransmitters: DopamineAcetylcholineAxis,
    pub autonomic_balance: f64,
    pub heart_rate_variability: f64,
}

impl Default for InteroceptionState {
    fn default() -> Self {
        Self {
            insular_cortex_integrity: 1.0,
            pro_inflammatory_cytokines: 0.0,
            adenosine_pressure: 0.0,
            blood_glucose: 1.0,
            stress_hormones: CortisolAdrenalineAxis::default(),
            ghrelin_leptin_ratio: 1.0,
            osmolarity: 0.5,
            glutamate_saturation: 0.0,
            neurotransmitters: DopamineAcetylcholineAxis::default(),
            autonomic_balance: 1.0,
            heart_rate_variability: 1.0,
        }
    }
}

impl InteroceptionState {
    pub fn evaluate_active_effects(&mut self) -> (f64, f64, bool) {
        let mut penalty = 0.0;
        let mut cost = 0.0;
        let mut incapacitated = false;

        if self.pro_inflammatory_cytokines > 0.7 {
            self.neurotransmitters.dopamine_availability *= 0.5;
            penalty += 10.0 * self.pro_inflammatory_cytokines;
        }

        if self.adenosine_pressure > 0.8 {
            incapacitated = true;
            penalty += 5.0;
        }

        if self.blood_glucose < 0.2 {
            self.stress_hormones.cortisol_level = (self.stress_hormones.cortisol_level + 0.3).min(1.0);
            cost += 15.0;
            if self.blood_glucose <= 0.0 {
                incapacitated = true;
            }
        }

        if self.glutamate_saturation > 0.7 {
            self.neurotransmitters.acetylcholine_availability *= 0.7;
            penalty += 8.0 * self.glutamate_saturation;
        }

        (penalty, cost, incapacitated)
    }

    pub fn exert_cognitive_effort(&mut self, intensity: f64) {
        self.adenosine_pressure = (self.adenosine_pressure + 0.1 * intensity).min(1.0);
        self.blood_glucose = (self.blood_glucose - 0.15 * intensity).max(0.0);
        self.glutamate_saturation = (self.glutamate_saturation + 0.12 * intensity).min(1.0);
    }

    pub fn rest(&mut self) {
        self.adenosine_pressure = 0.0;
        self.glutamate_saturation = 0.0;
        self.blood_glucose = 1.0;
        self.stress_hormones.cortisol_level *= 0.2;
        self.stress_hormones.adrenaline_level *= 0.1;
        self.heart_rate_variability = (self.heart_rate_variability + 0.2).min(1.0);
    }
}
