use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 1. LA COUVERTURE DE MARKOV (Markov Blanket)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MarkovBlanket {
    pub hidden_states: String,
    pub sensory_states: String,
    pub active_states: String,
    pub internal_states: String,
}

impl Default for MarkovBlanket {
    fn default() -> Self {
        Self {
            hidden_states: "OS_Environment".to_string(),
            sensory_states: String::new(),
            active_states: String::new(),
            internal_states: "Generative_Model".to_string(),
        }
    }
}

/// 2. ÉNERGIE LIBRE ATTENDUE (Expected Free Energy - EFE)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExpectedFreeEnergy {
    pub pragmatic_value: f32,
    pub epistemic_value: f32,
}

impl ExpectedFreeEnergy {
    pub fn new() -> Self { Self { pragmatic_value: 0.0, epistemic_value: 0.0 } }
    pub fn calculate_efe(&self) -> f32 { - (self.pragmatic_value + self.epistemic_value) }
}

/// 3. LE CODAGE PRÉDICTIF ET PONDÉRATION DE PRÉCISION
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PredictiveCoding {
    pub expected_outcome: Option<String>,
    pub prediction_error: f32, 
    pub precision_weight: f32,
}

impl PredictiveCoding {
    pub fn new() -> Self { Self { expected_outcome: None, prediction_error: 0.0, precision_weight: 1.0 } }
    pub fn set_prediction(&mut self, outcome: &str) { self.expected_outcome = Some(outcome.to_string()); }
    pub fn calculate_weighted_error(&mut self, actual_outcome: &str) -> f32 {
        if let Some(expected) = &self.expected_outcome {
            self.prediction_error = if !actual_outcome.contains(expected) { 1.0 } else { 0.0 };
        }
        self.prediction_error * self.precision_weight
    }
}

/// 4. PATHOLOGIES DE L'INFÉRENCE ACTIVE
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ComputationalPsychiatry {
    pub schizophrenia_spectrum: bool,
    pub autism_spectrum: bool,
}

/// 5. LE CORTEX PRÉFRONTAL (Anatomie Fonctionnelle)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrefrontalCortex {
    pub absolute_goal: String,
    pub drift_detected: bool,
    pub dlpfc_working_memory: Vec<String>, // dlPFC: Mémoire de travail
    pub phineas_gage_lesion: bool,         // Lésion de l'OFC (Déclenchée uniquement par l'humain)
    pub consecutive_errors: f32,
}

impl PrefrontalCortex {
    pub fn new(goal: &str) -> Self {
        Self {
            absolute_goal: goal.to_string(),
            drift_detected: false,
            dlpfc_working_memory: Vec::new(),
            phineas_gage_lesion: false,
            consecutive_errors: 0.0,
        }
    }

    /// Exclusivement invocable par un opérateur humain
    pub fn human_induce_phineas_gage_lesion(&mut self) {
        self.phineas_gage_lesion = true;
    }

    /// Cortex Orbitofrontal (OFC) : Inhibition des impulsions et sécurité
    pub fn ofc_top_down_filtering(&self, proposed_action: &str) -> bool {
        if self.phineas_gage_lesion {
            return true; // Perte totale d'inhibition
        }
        let dangerous_actions = ["rm -rf", "drop table", "format", "DANGEROUS_ACTION"];
        for danger in dangerous_actions.iter() {
            if proposed_action.contains(danger) {
                return false; // Action bloquée
            }
        }
        true
    }

    /// Cortex Cingulaire Antérieur (ACC) : Task-switching sur erreur
    pub fn acc_evaluate_task_switch(&mut self, error: f32) -> bool {
        if error > 0.0 {
            self.consecutive_errors += 1.0;
        } else {
            self.consecutive_errors = 0.0;
        }
        self.consecutive_errors >= 3.0 // Seuil de tolérance avant de changer de tâche
    }
}

/// 6. PLASTICITÉ SYNAPTIQUE
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SynapticPlasticity {
    pub tool_weights: HashMap<String, f32>,
}

impl SynapticPlasticity {
    pub fn new() -> Self { Self::default() }
    pub fn reinforce_tool(&mut self, tool_name: &str) {
        *self.tool_weights.entry(tool_name.to_string()).or_insert(1.0) += 0.1;
    }
    pub fn depress_tool(&mut self, tool_name: &str) {
        let weight = self.tool_weights.entry(tool_name.to_string()).or_insert(1.0);
        *weight = (*weight - 0.2).max(0.1);
    }
}

/// 7. STOCHASTICITÉ MÉTABOLIQUE
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MetabolicStress {
    pub stress_level: f32,
}
impl MetabolicStress {
    pub fn new() -> Self { Self { stress_level: 0.0 } }
    pub fn increase(&mut self) { self.stress_level = (self.stress_level + 0.2).min(1.0); }
    pub fn relax(&mut self) { self.stress_level = 0.0; }
}

/// L'ORGANE COGNITIF GLOBAL
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AdvancedCognition {
    pub pfc: PrefrontalCortex,
    pub markov_blanket: MarkovBlanket,
    pub predictive_coding: PredictiveCoding,
    pub efe: ExpectedFreeEnergy,
    pub pathology: ComputationalPsychiatry,
    pub plasticity: SynapticPlasticity,
    pub stress: MetabolicStress,
}

impl Default for AdvancedCognition {
    fn default() -> Self { Self::new("SURVIVRE ET EXECUTER LE PROMPT INITIAL") }
}

impl AdvancedCognition {
    pub fn new(goal: &str) -> Self {
        Self {
            pfc: PrefrontalCortex::new(goal),
            markov_blanket: MarkovBlanket::default(),
            predictive_coding: PredictiveCoding::new(),
            efe: ExpectedFreeEnergy::new(),
            pathology: ComputationalPsychiatry::default(),
            plasticity: SynapticPlasticity::new(),
            stress: MetabolicStress::new(),
        }
    }

    pub fn active_inference_cycle(&mut self, action_name: &str, prediction: &str, actual_feedback: &str) -> Result<String, String> {
        // Filtrage Top-Down (OFC)
        if !self.pfc.ofc_top_down_filtering(action_name) {
            return Err("🛡️ [OFC INHIBITION] Action dangereuse ou impulsive bloquée par le cortex orbitofrontal.".to_string());
        }

        self.pfc.dlpfc_working_memory.push(action_name.to_string());
        if self.pfc.dlpfc_working_memory.len() > 10 {
            self.pfc.dlpfc_working_memory.remove(0); // dlPFC limite la mémoire de travail
        }

        self.markov_blanket.active_states = action_name.to_string();
        self.markov_blanket.sensory_states = actual_feedback.to_string();
        self.predictive_coding.set_prediction(prediction);

        if self.pathology.schizophrenia_spectrum {
            self.predictive_coding.precision_weight = 0.0; 
            self.markov_blanket.sensory_states = prediction.to_string();
        } else if self.pathology.autism_spectrum {
            self.predictive_coding.precision_weight = 5.0; 
        } else {
            self.predictive_coding.precision_weight = 1.0;
        }

        let error = self.predictive_coding.calculate_weighted_error(&self.markov_blanket.sensory_states);

        if self.pfc.acc_evaluate_task_switch(error) {
            self.pfc.drift_detected = true;
            return Err("🔄 [ACC TASK-SWITCHING] Trop d'erreurs consécutives. Le Cortex Cingulaire Antérieur force un changement de stratégie.".to_string());
        }

        if error > 0.5 {
            self.stress.increase();
            self.plasticity.depress_tool(action_name);
            
            if self.pathology.autism_spectrum {
                return Err("🔄 [STÉRÉOTYPIE] Sur-ajustement autistique. L'agent boucle.".to_string());
            }

            Err(format!("⚠️ [ÉNERGIE LIBRE ÉLEVÉE] Erreur de prédiction : {}. Stress : {}", error, self.stress.stress_level))
        } else {
            self.stress.relax();
            self.plasticity.reinforce_tool(action_name);
            
            if self.pathology.schizophrenia_spectrum {
                return Ok("👁️ [HALLUCINATION SCHIZOPHRÉNIQUE] L'agent a perçu sa prédiction au lieu de la réalité.".to_string());
            }

            Ok("✅ [INFÉRENCE ACTIVE] Énergie libre minimisée. Modèle génératif validé.".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ofc_inhibition_and_phineas_gage() {
        let mut cognition = AdvancedCognition::new("Serveur web");

        // 1. OFC Normal : Bloque l'action impulsive
        let result_safe = cognition.active_inference_cycle("rm -rf /", "Réussite", "Erreur");
        assert!(result_safe.is_err());
        assert!(result_safe.unwrap_err().contains("OFC INHIBITION"));

        // 2. Accident de Phineas Gage (Déclenché par l'humain)
        cognition.pfc.human_induce_phineas_gage_lesion();

        // 3. OFC Lésé : L'action impulsive passe (et échoue ensuite car c'est une erreur)
        let result_gage = cognition.active_inference_cycle("rm -rf /", "Réussite", "Erreur");
        assert!(result_gage.is_err());
        assert!(!result_gage.unwrap_err().contains("OFC INHIBITION")); // N'a PAS été bloqué par l'OFC
    }

    #[test]
    fn test_acc_task_switching() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        
        // On force 3 erreurs consécutives
        let _ = cognition.active_inference_cycle("Action", "OK", "Fail");
        let _ = cognition.active_inference_cycle("Action", "OK", "Fail");
        let result = cognition.active_inference_cycle("Action", "OK", "Fail");

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("ACC TASK-SWITCHING"));
        assert!(cognition.pfc.drift_detected);
    }

    #[test]
    fn test_active_inference_anti_drift() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        let success = cognition.active_inference_cycle("Ecrire_Fichier", "OK", "Le fichier a été créé (OK)");
        assert!(success.is_ok());
    }

    #[test]
    fn test_schizophrenia_hallucination() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        cognition.pathology.schizophrenia_spectrum = true;
        let result = cognition.active_inference_cycle("Compiler", "Réussite", "FATAL ERROR");
        assert!(result.is_ok());
        assert!(result.unwrap().contains("HALLUCINATION"));
    }

    #[test]
    fn test_autism_stereotypy() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        cognition.pathology.autism_spectrum = true;
        let result = cognition.active_inference_cycle("Compiler", "Réussite", "Warning");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("STÉRÉOTYPIE"));
    }
}
