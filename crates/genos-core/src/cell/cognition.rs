use serde::{Deserialize, Serialize};

/// 5. LE CORTEX PRÉFRONTAL (Maintien du But Hiérarchique)
/// Maintient l'Attracteur Téléologique (le but final). 
/// Empêche le contexte LLM de dériver et d'oublier la directive première.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrefrontalCortex {
    pub absolute_goal: String,
    pub drift_detected: bool,
}

impl PrefrontalCortex {
    pub fn new(goal: &str) -> Self {
        Self {
            absolute_goal: goal.to_string(),
            drift_detected: false,
        }
    }

    pub fn evaluate_drift(&mut self, current_trajectory: &str) -> bool {
        // Le PFC vérifie si la trajectoire courante s'écarte mortellement du but.
        self.drift_detected = current_trajectory.contains("erreur_en_cascade");
        self.drift_detected
    }
}

/// 4. LA STOCHASTICITÉ MÉTABOLIQUE (Bruit Régulateur)
/// Gère le "Bruit" du modèle. Si l'agent échoue et bloque, le stress monte,
/// augmentant dynamiquement la Température LLM pour forcer l'exploration (sortie de minimum local).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MetabolicStress {
    pub stress_level: f32, // 0.0 à 1.0
    pub base_temperature: f32,
}

impl MetabolicStress {
    pub fn new(base_temp: f32) -> Self {
        Self { stress_level: 0.0, base_temperature: base_temp }
    }

    pub fn get_current_temperature(&self) -> f32 {
        // Le bruit s'ajoute proportionnellement au stress
        self.base_temperature + (self.stress_level * 0.5)
    }

    pub fn increase_stress(&mut self) {
        self.stress_level = (self.stress_level + 0.2).min(1.0);
    }

    pub fn relax(&mut self) {
        self.stress_level = 0.0;
    }
}

/// 3. LE CODAGE PRÉDICTIF (Inférence Active / Thalamus)
/// L'agent ne fait pas qu'agir, il génère une attente de l'état futur.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PredictiveCoding {
    pub expected_outcome: Option<String>,
    pub prediction_error: f32, // 0.0 = Parfait, 1.0 = Surprise totale
}

impl PredictiveCoding {
    pub fn new() -> Self {
        Self { expected_outcome: None, prediction_error: 0.0 }
    }

    pub fn set_prediction(&mut self, outcome: &str) {
        self.expected_outcome = Some(outcome.to_string());
    }

    pub fn calculate_error(&mut self, actual_outcome: &str) -> f32 {
        if let Some(expected) = &self.expected_outcome {
            // Heuristique de surprise : si le résultat ne contient pas les mots clés attendus
            if !actual_outcome.contains(expected) {
                self.prediction_error = 1.0;
            } else {
                self.prediction_error = 0.0;
            }
        }
        self.prediction_error
    }
}

/// 2. LE CERVELET (Boucle Sensori-Motrice)
/// Valide systématiquement l'impact physique (stdout/stderr) de l'action.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cerebellum {
    pub last_action_valid: bool,
}

impl Cerebellum {
    pub fn new() -> Self {
        Self { last_action_valid: true }
    }

    pub fn validate_feedback(&mut self, sensory_feedback: &str) -> bool {
        // Erreurs de compilation ou plantages physiques = signal d'erreur immédiat
        self.last_action_valid = !sensory_feedback.to_lowercase().contains("error");
        self.last_action_valid
    }
}

/// 1. APPRENTISSAGE CONTINU (Plasticité Synaptique)
/// Ajuste les poids synaptiques (probabilité d'utiliser un outil) en temps réel
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SynapticPlasticity {
    pub tool_weights: std::collections::HashMap<String, f32>,
}

impl SynapticPlasticity {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reinforce_tool(&mut self, tool_name: &str) {
        let weight = self.tool_weights.entry(tool_name.to_string()).or_insert(1.0);
        *weight += 0.1; // Long-Term Potentiation (LTP)
    }

    pub fn depress_tool(&mut self, tool_name: &str) {
        let weight = self.tool_weights.entry(tool_name.to_string()).or_insert(1.0);
        *weight = (*weight - 0.2).max(0.1); // Long-Term Depression (LTD)
    }
}

/// L'ORGANE COGNITIF GLOBAL (Anti-Manifold Drift)
/// Intègre les 5 mécanismes neurobiologiques de correction de trajectoire.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AdvancedCognition {
    pub pfc: PrefrontalCortex,
    pub stress: MetabolicStress,
    pub predictive_coding: PredictiveCoding,
    pub cerebellum: Cerebellum,
    pub plasticity: SynapticPlasticity,
}

impl Default for AdvancedCognition {
    fn default() -> Self {
        Self::new("SURVIVRE ET EXECUTER LE PROMPT INITIAL")
    }
}

impl AdvancedCognition {
    pub fn new(goal: &str) -> Self {
        Self {
            pfc: PrefrontalCortex::new(goal),
            stress: MetabolicStress::new(0.2), // Température de base
            predictive_coding: PredictiveCoding::new(),
            cerebellum: Cerebellum::new(),
            plasticity: SynapticPlasticity::new(),
        }
    }

    /// Exécute un cycle complet d'Inférence Active pour empêcher la dérive
    pub fn active_inference_cycle(&mut self, action_name: &str, prediction: &str, actual_feedback: &str) -> Result<String, String> {
        // 1. Prédiction (Codage Prédictif)
        self.predictive_coding.set_prediction(prediction);

        // 2. Retour Sensori-moteur (Cervelet)
        let is_valid = self.cerebellum.validate_feedback(actual_feedback);

        // 3. Calcul de l'erreur (Thalamus)
        let error = self.predictive_coding.calculate_error(if is_valid { prediction } else { actual_feedback });

        if error > 0.5 || !is_valid {
            // ÉCHEC : Augmentation du bruit, LTD synaptique
            self.stress.increase_stress();
            self.plasticity.depress_tool(action_name);
            
            // 4. Évaluation de la dérive (Cortex Préfrontal)
            let trajectory = if error > 0.5 { "erreur_en_cascade" } else { "stable" };
            if self.pfc.evaluate_drift(trajectory) {
                return Err(format!("🚨 [DÉRIVE DÉTECTÉE] Le Cortex Préfrontal force un RESET du contexte pour revenir à l'attracteur : '{}'.", self.pfc.absolute_goal));
            }
            
            return Err(format!("⚠️ [ÉCHEC D'ACTION] Stress monté à {}. Bruit (Température) ajusté à {}.", self.stress.stress_level, self.stress.get_current_temperature()));
        } else {
            // SUCCÈS : Renforcement synaptique (LTP), relaxation
            self.stress.relax();
            self.plasticity.reinforce_tool(action_name);
            Ok(format!("✅ [INFÉRENCE ACTIVE] Prédiction validée. Poids du réseau mis à jour."))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_active_inference_anti_drift() {
        let mut cognition = AdvancedCognition::new("Construire un serveur web");

        // 1. Cycle réussi
        let success = cognition.active_inference_cycle("Ecrire_Fichier", "OK", "Le fichier a été créé (OK)");
        assert!(success.is_ok());
        assert_eq!(cognition.stress.stress_level, 0.0);
        assert_eq!(*cognition.plasticity.tool_weights.get("Ecrire_Fichier").unwrap(), 1.1); // LTP

        // 2. Cycle raté (Erreur de compilation = Drift)
        let failure = cognition.active_inference_cycle("Compiler", "Compilation réussie", "Error: missing semicolon");
        assert!(failure.is_err());
        assert!(failure.unwrap_err().contains("DÉRIVE DÉTECTÉE"));
        assert!(cognition.stress.stress_level > 0.0); // Stress augmenté
        assert_eq!(*cognition.plasticity.tool_weights.get("Compiler").unwrap(), 0.8); // LTD
    }
}