use serde::{Deserialize, Serialize};

// ─── Niveau 1 : réalité machine mesurable ─────────────────────────────
// Ces variables se branchent sur de la télémétrie réelle (réserve de calcul,
// occupation du contexte, pression mémoire, latence, taux d'erreur, charge
// de contradiction, incertitude non résolue, profondeur de file, disponibilité
// réseau, intégrité sémantique). Voir backend machineInteroceptionService.js
// qui dérive les mêmes variables depuis telemetry_events / episodic_memories.
// Jamais fournies à la main par l'appelant : ressenties, pas déclarées.

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MachineInteroception {
    pub compute_reserve: f64,
    pub context_occupancy: f64,
    pub memory_pressure: f64,
    pub inference_latency: f64,
    pub error_rate: f64,
    pub contradiction_load: f64,
    pub unresolved_uncertainty: f64,
    pub queue_pressure: f64,
    pub network_availability: f64,
    pub semantic_integrity: f64,
}

impl Default for MachineInteroception {
    fn default() -> Self {
        Self {
            compute_reserve: 1.0,
            context_occupancy: 0.0,
            memory_pressure: 0.0,
            inference_latency: 0.0,
            error_rate: 0.0,
            contradiction_load: 0.0,
            unresolved_uncertainty: 0.5,
            queue_pressure: 0.0,
            network_availability: 1.0,
            semantic_integrity: 1.0,
        }
    }
}

// ─── Niveau 2 : analogie biomimétique DÉRIVÉE ─────────────────────────
// Direction causale imposée : machine → biologie. Jamais l'inverse.
// Ces « -like » sont des lectures interprétatives, pas des mesures.

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct BiologicalAnalogy {
    pub cortisol_like: f64,
    pub dopamine_like: f64,
    pub adenosine_like: f64,
}

impl BiologicalAnalogy {
    pub fn from_machine(machine: &MachineInteroception) -> Self {
        Self {
            cortisol_like: (machine.error_rate + machine.queue_pressure) * 0.5,
            dopamine_like: (machine.compute_reserve * machine.semantic_integrity).clamp(0.0, 1.0),
            adenosine_like: (machine.context_occupancy + machine.memory_pressure) * 0.5,
        }
    }
}

impl MachineInteroception {
    pub fn biological_analogy(&self) -> BiologicalAnalogy {
        BiologicalAnalogy::from_machine(self)
    }
}

// ─── Vue biomimétique historique (legacy) ─────────────────────────────
// Conservée pour compatibilité. Ne pas l'utiliser comme source de vérité :
// préférer MachineInteroception + BiologicalAnalogy ci-dessus.

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
