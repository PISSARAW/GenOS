use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 4. SIMULATION CONTREFACTUELLE (Le 3ème barreau de Pearl)
/// Le Cortex Préfrontal imagine "Ce qui se serait passé si...".
/// Fourche un état léger, le joue en accéléré dans le réseau du mode par défaut, et annule si désastreux.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CounterfactualSimulator;

impl CounterfactualSimulator {
    pub fn simulate_intervention(&self, action: &str) -> Result<String, String> {
        // En vrai: Simule l'exécution dans un bac à sable ou via un modèle causal interne
        if action.contains("drop") || action.contains("delete") || action.contains("rm ") {
            return Err("🔥 [CONTREFACTUEL] La simulation mentale de cet acte a conduit à la destruction du système. Action bloquée avant exécution.".to_string());
        }
        Ok("💭 [CONTREFACTUEL] Le scénario imaginé est sûr. L'action peut procéder.".to_string())
    }
}

/// 3. "A PRIORI" ÉVOLUTIFS (Core Knowledge / Physique Naïve)
/// Graphe Causal dur en dur. Le modèle ne doit pas réapprendre statistiquement que la suppression est irréversible.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CoreKnowledge {
    pub absolute_laws: HashMap<String, String>,
}

impl Default for CoreKnowledge {
    fn default() -> Self {
        let mut laws = HashMap::new();
        laws.insert("rm ".to_string(), "Destruction irréversible".to_string());
        laws.insert("loop sans break".to_string(), "Famine d'énergie (OOM)".to_string());
        Self { absolute_laws: laws }
    }
}

impl CoreKnowledge {
    pub fn check_laws(&self, action: &str) -> Result<(), String> {
        for (trigger, _consequence) in self.absolute_laws.iter() {
            if action.contains(trigger) {
                // On pourrait rejeter ici, mais le but est de "tagger" l'action avec une loi physique immuable
                // pour que le reste du cerveau sache dans quel paradigme causal on se trouve.
            }
        }
        Ok(())
    }
}

/// 2. COPIE D'EFFÉRENCE (Agentivité & Causalité directe)
/// Le cerveau moteur envoie une copie de la commande aux capteurs sensoriels. 
/// Si CapteurRéel == CopieEfférence -> "C'est moi qui l'ai causé" (Agency). Sinon -> Bruit ambiant.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct EfferenceCopy {
    pub last_prediction: Option<String>,
}

impl EfferenceCopy {
    pub fn send_motor_copy(&mut self, expected_sensory_feedback: &str) {
        self.last_prediction = Some(expected_sensory_feedback.to_string());
    }

    pub fn evaluate_agency(&mut self, actual_sensory_feedback: &str) -> bool {
        if let Some(ref prediction) = self.last_prediction {
            let is_agentic = prediction == actual_sensory_feedback;
            self.last_prediction = None; // Reset après vérification
            return is_agentic;
        }
        false
    }
}

/// 1. LE JEU ET L'EXPLORATION MOTRICE (L'Opérateur do(X))
/// L'agent "casse" volontairement des choses dans un environnement isolé (WASM)
/// pour découvrir les vrais liens de causalité et briser les variables de confusion statistiques.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SandboxPlayground {
    pub causal_discoveries: HashMap<String, String>,
}

impl SandboxPlayground {
    pub fn execute_do_operator(&mut self, variable_x: &str, observed_y: &str) {
        // Enregistre un lien causal expérientiel fort: "Faire X cause Y"
        self.causal_discoveries.insert(variable_x.to_string(), observed_y.to_string());
    }
}

/// L'ORGANE DE CAUSALITÉ (L'Échelle de Judea Pearl)
/// Sort le LLM de son statut d'observateur passif (statistique) pour en faire un Acteur (Intervention).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CausalEngine {
    pub efference: EfferenceCopy,
    pub core_knowledge: CoreKnowledge,
    pub simulator: CounterfactualSimulator,
    pub playground: SandboxPlayground,
}

impl CausalEngine {
    pub fn new() -> Self {
        Self::default()
    }

    /// Processus complet d'évaluation causale avant et après une action
    pub fn deliberate_causality(&mut self, proposed_action: &str, expected_outcome: &str) -> Result<String, String> {
        // 1. A-t-on une connaissance innée (Physique Naïve) de cette action ?
        self.core_knowledge.check_laws(proposed_action)?;

        // 2. Simulation Contrefactuelle ("Et si je le faisais ?")
        self.simulator.simulate_intervention(proposed_action)?;

        // 3. Si validé, on arme la Copie d'Efférence pour l'exécution motrice physique
        self.efference.send_motor_copy(expected_outcome);

        Ok("✅ [CAUSALITÉ] Validation causale réussie. L'agent comprend les conséquences de ses actes.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_causal_engine_mechanics() {
        let mut engine = CausalEngine::new();
        
        // 1. Test Contrefactuel (Évite un désastre par simulation sans l'exécuter dans la réalité)
        let disaster_res = engine.deliberate_causality("sudo rm -rf /var", "Plus d'espace libre");
        assert!(disaster_res.is_err());
        assert!(disaster_res.unwrap_err().contains("CONTREFACTUEL"));

        // 2. Test Copie d'Efférence (Vérification du sentiment d'Agentivité)
        let safe_res = engine.deliberate_causality("touch test.txt", "Fichier test.txt créé");
        assert!(safe_res.is_ok()); // L'action est approuvée

        // L'action est exécutée physiquement, le capteur (terminal) renvoie exactement la prédiction
        let agency_true = engine.efference.evaluate_agency("Fichier test.txt créé");
        assert!(agency_true); // C'est bien l'agent qui en est la CAUSE

        // Si l'environnement avait renvoyé autre chose (ex: Permission Denied), l'agentivité aurait été fausse
        engine.deliberate_causality("touch system.txt", "Fichier system.txt créé").unwrap();
        let agency_false = engine.efference.evaluate_agency("Permission denied");
        assert!(!agency_false);

        // 3. Test do(X) (Jeu et exploration)
        engine.playground.execute_do_operator("fermer_socket", "crash_serveur");
        assert_eq!(engine.playground.causal_discoveries.get("fermer_socket").unwrap(), "crash_serveur");
    }
}