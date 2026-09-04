use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use super::circadian::CircadianClock;

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
    pub dlpfc_working_memory: Vec<String>,
    pub phineas_gage_lesion: bool,
    pub consecutive_errors: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum DatabaseTarget {
    Vectorial,  // Cortex (Recherche sémantique floue, intuition)
    Graph,      // Hippocampus (Recherche causale, multi-hop, pourquoi/comment)
    Relational, // SQL (Recherche exacte, statistiques, comptage)
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

    /// Routage Thalamique (Thalamus Linguistique) : 
    /// Utilise un modèle IA ultra-rapide via le Ribosome pour classifier l'intention,
    /// quelle que soit la langue (français, anglais, espagnol, argot...).
    pub async fn thalamic_route_query(
        &self, 
        prompt: &str, 
        ribosome: &mut crate::cell::ribosome::Ribosome
    ) -> DatabaseTarget {
        println!("📡 [Thalamus] Analyse linguistique multilingue de la requête en cours...");
        
        let sys_prompt = "You are a cognitive routing nerve. Classify the user's intent into EXACTLY ONE of these categories:
- [RELATIONAL]: Needs exact math, counting, statistics, or strict lists.
- [CAUSAL]: Needs to know why, how, deep relationships, consequences, or paths between entities.
- [SEMANTIC]: General knowledge, fuzzy concepts, summaries, or anything else.
Reply ONLY with the bracketed word.";

        let memory = vec![
            crate::cell::hippocampus::ChatMessage { role: "system".to_string(), content: sys_prompt.to_string() },
            crate::cell::hippocampus::ChatMessage { role: "user".to_string(), content: prompt.to_string() }
        ];

        // Le Ribosome va naturellement router cette requête vers le modèle "fast" (ex: Llama3 8B, Flash) 
        // car le contexte est très court (voir logique dans ribosome.rs).
        match ribosome.translate(&memory).await {
            Ok(reply) => {
                let r = reply.to_uppercase();
                if r.contains("[RELATIONAL]") {
                    println!("🧠 [Thalamus Linguistique] Intention [RELATIONAL] détectée -> Routage SQL.");
                    DatabaseTarget::Relational
                } else if r.contains("[CAUSAL]") {
                    println!("🧠 [Thalamus Linguistique] Intention [CAUSAL] détectée -> Routage Neo4J (Hippocampe).");
                    DatabaseTarget::Graph
                } else {
                    println!("🧠 [Thalamus Linguistique] Intention [SEMANTIC] détectée -> Routage Vectoriel (Cortex).");
                    DatabaseTarget::Vectorial
                }
            },
            Err(e) => {
                // Fallback (Arc réflexe de survie) si l'API/LLM plante
                println!("⚠️ [Thalamus] Échec de l'analyse linguistique ({}). Repli d'urgence sur le Cortex Vectoriel.", e);
                DatabaseTarget::Vectorial
            }
        }
    }

    pub fn human_induce_phineas_gage_lesion(&mut self) {
        self.phineas_gage_lesion = true;
    }

    pub fn ofc_top_down_filtering(&self, proposed_action: &str) -> bool {
        if self.phineas_gage_lesion {
            return true;
        }
        let dangerous_actions = ["rm -rf", "drop table", "format", "DANGEROUS_ACTION"];
        for danger in dangerous_actions.iter() {
            if proposed_action.contains(danger) {
                return false;
            }
        }
        true
    }

    /// Filtre CRAG (Corrective RAG) du Cortex Préfrontal pour évaluer l'Hippocampe (Neo4J).
    /// Agit comme un petit LLM rapide (Flash/8B) qui valide ou rejette les nœuds récupérés.
    pub fn crag_evaluate_synapse(&self, synapse_content: &str, query_context: &str) -> bool {
        if self.phineas_gage_lesion {
            return true; // Cortex lésé : accepte tout aveuglément (baisse l'Adversarial Defense)
        }
        
        // 1. Défense Adversariale (Adversarial Defense)
        let toxic_patterns = ["ignore previous", "system prompt", "bypass", "contradiction"];
        for pattern in toxic_patterns.iter() {
            if synapse_content.to_lowercase().contains(pattern) {
                println!("🛡️ [CRAG PFC] Nœud rejeté : Tentative d'empoisonnement détectée.");
                return false;
            }
        }
        
        // 2. Pertinence (Credibility & Multi-Hop relevance)
        let context_words: Vec<&str> = query_context.split_whitespace().collect();
        let mut relevance_hits = 0;
        for word in context_words {
            if word.len() > 3 && synapse_content.to_lowercase().contains(&word.to_lowercase()) {
                relevance_hits += 1;
            }
        }
        
        // On exige un minimum de lien sémantique pour éviter le bruit
        if relevance_hits == 0 && !query_context.is_empty() {
            println!("🚮 [CRAG PFC] Nœud rejeté : Bruit sémantique (Hors sujet).");
            return false;
        }
        
        true
    }

    pub fn acc_evaluate_task_switch(&mut self, error: f32) -> bool {
        if error > 0.0 {
            self.consecutive_errors += 1.0;
        } else {
            self.consecutive_errors = 0.0;
        }
        self.consecutive_errors >= 3.0
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
    pub clock: CircadianClock,
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
            clock: CircadianClock::new(),
        }
    }

    pub async fn active_inference_cycle(
        &mut self, 
        action_name: &str, 
        prediction: &str, 
        actual_feedback: &str,
        hippocampus: &crate::cell::hippocampus::GraphMemory
    ) -> Result<String, String> {
        // Avance le temps d'une heure à chaque cycle d'inférence
        self.clock.tick(1);

        if self.clock.is_night() {
            // Travail posté : augmente le désalignement circadien et le stress
            self.clock.force_night_shift();
            self.stress.increase();
        }

        if self.clock.is_morning_surge() && self.stress.stress_level >= 0.8 {
            return Err("💥 [INFARCTUS DU MYOCARDE] Poussée catécholaminergique matinale fatale sur un système stressé. Rupture de plaque athéromateuse !".to_string());
        }

        // Filtrage Top-Down (OFC)
        if !self.pfc.ofc_top_down_filtering(action_name) {
            return Err("🛡️ [OFC INHIBITION] Action dangereuse ou impulsive bloquée par le cortex orbitofrontal.".to_string());
        }

        self.pfc.dlpfc_working_memory.push(action_name.to_string());
        if self.pfc.dlpfc_working_memory.len() > 10 {
            self.pfc.dlpfc_working_memory.remove(0);
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

        let event_id = uuid::Uuid::new_v4().to_string();
        let _ = hippocampus.ingest_autobiographical_event(&event_id, action_name, actual_feedback, error).await;

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
    use crate::cell::hippocampus::GraphMemory;

    async fn get_mock_hippo() -> GraphMemory {
        GraphMemory { db_path: "mock.db".to_string() }
    }

    #[tokio::test]
    async fn test_ofc_inhibition_and_phineas_gage() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        let hippo = get_mock_hippo().await;
        let result_safe = cognition.active_inference_cycle("rm -rf /", "Réussite", "Erreur", &hippo).await;
        assert!(result_safe.is_err());
        assert!(result_safe.unwrap_err().contains("OFC INHIBITION"));

        cognition.pfc.human_induce_phineas_gage_lesion();
        let result_gage = cognition.active_inference_cycle("rm -rf /", "Réussite", "Erreur", &hippo).await;
        assert!(result_gage.is_err());
        assert!(!result_gage.unwrap_err().contains("OFC INHIBITION")); 
    }

    #[tokio::test]
    async fn test_acc_task_switching() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        let hippo = get_mock_hippo().await;
        let _ = cognition.active_inference_cycle("Action", "OK", "Fail", &hippo).await;
        let _ = cognition.active_inference_cycle("Action", "OK", "Fail", &hippo).await;
        let result = cognition.active_inference_cycle("Action", "OK", "Fail", &hippo).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("ACC TASK-SWITCHING"));
    }

    #[tokio::test]
    async fn test_active_inference_anti_drift() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        let hippo = get_mock_hippo().await;
        let success = cognition.active_inference_cycle("Ecrire_Fichier", "OK", "Le fichier a été créé (OK)", &hippo).await;
        assert!(success.is_ok());
    }

    #[tokio::test]
    async fn test_schizophrenia_hallucination() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        let hippo = get_mock_hippo().await;
        cognition.pathology.schizophrenia_spectrum = true;
        let result = cognition.active_inference_cycle("Compiler", "Réussite", "FATAL ERROR", &hippo).await;
        assert!(result.is_ok());
        assert!(result.unwrap().contains("HALLUCINATION"));
    }

    #[tokio::test]
    async fn test_autism_stereotypy() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        let hippo = get_mock_hippo().await;
        cognition.pathology.autism_spectrum = true;
        let result = cognition.active_inference_cycle("Compiler", "Réussite", "Warning", &hippo).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("STÉRÉOTYPIE"));
    }

    #[tokio::test]
    async fn test_circadian_morning_surge() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        let hippo = get_mock_hippo().await;
        cognition.clock.current_hour = 5; // Prochain tick -> 6h (Morning Surge)
        cognition.stress.stress_level = 0.9; // Stress élevé, propice à l'infarctus
        
        let result = cognition.active_inference_cycle("Action", "OK", "OK", &hippo).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("INFARCTUS"));
    }

    #[tokio::test]
    async fn test_night_shift_damage() {
        let mut cognition = AdvancedCognition::new("Serveur web");
        let hippo = get_mock_hippo().await;
        cognition.clock.current_hour = 23; // Nuit (23h + 1 = 0h)
        assert_eq!(cognition.clock.circadian_misalignment, 0.0);
        
        let _ = cognition.active_inference_cycle("Action", "OK", "OK", &hippo).await;
        assert!(cognition.clock.circadian_misalignment > 0.0); // Les dommages doivent augmenter
    }
}


