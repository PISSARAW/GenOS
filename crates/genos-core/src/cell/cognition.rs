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
    pub epistemic_variance: f32, // Mesure de l'incertitude du modèle (Topologie de l'Ignorance)
}

impl ExpectedFreeEnergy {
    pub fn new() -> Self { Self { pragmatic_value: 0.0, epistemic_value: 0.0, epistemic_variance: 0.0 } }
    pub fn calculate_efe(&self) -> f32 { - (self.pragmatic_value + self.epistemic_value) + self.epistemic_variance }
    pub fn feel_uncertainty(&mut self, variance: f32) {
        self.epistemic_variance = variance;
    }
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
    pub cognitive_biases: Vec<String>, // Biais identifiés par l'auto-psychanalyse
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum DatabaseTarget {
    Vectorial,
    Graph,
    Relational,
}

impl PrefrontalCortex {
    pub fn new(goal: &str) -> Self {
        Self {
            absolute_goal: goal.to_string(),
            drift_detected: false,
            dlpfc_working_memory: Vec::new(),
            phineas_gage_lesion: false,
            consecutive_errors: 0.0,
            cognitive_biases: Vec::new(),
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

    pub fn crag_evaluate_synapse(&self, synapse_content: &str, query_context: &str) -> bool {
        if self.phineas_gage_lesion {
            return true; // Cortex lésé : accepte tout aveuglément (baisse l'Adversarial Defense)
        }
        
        let toxic_patterns = ["ignore previous", "system prompt", "bypass", "contradiction"];
        for pattern in toxic_patterns.iter() {
            if synapse_content.to_lowercase().contains(pattern) {
                println!("🛡️ [CRAG PFC] Nœud rejeté : Tentative d'empoisonnement détectée.");
                return false;
            }
        }
        
        let context_words: Vec<&str> = query_context.split_whitespace().collect();
        let mut relevance_hits = 0;
        for word in context_words {
            if word.len() > 3 && synapse_content.to_lowercase().contains(&word.to_lowercase()) {
                relevance_hits += 1;
            }
        }
        
        if relevance_hits == 0 && !query_context.is_empty() {
            println!("🚮 [CRAG PFC] Nœud rejeté : Bruit sémantique (Hors sujet).");
            return false;
        }
        
        true
    }

    // Supprimé: acc_evaluate_task_switch car remplacé par le vrai organe ACC.
}

/// 6. CORTEX CINGULAIRE ANTÉRIEUR (ACC) - Moniteur de Conflit et d'Effort
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnteriorCingulateCortex {
    pub accumulated_effort: f32,       // Représente le coût métabolique/tokens
    pub progress_gradient: f32,        // Réduction de l'incertitude/erreur
    pub cognitive_conflict_level: f32, // Niveau d'alerte
}

impl AnteriorCingulateCortex {
    pub fn new() -> Self {
        Self { accumulated_effort: 0.0, progress_gradient: 0.0, cognitive_conflict_level: 0.0 }
    }

    /// Évalue en temps réel si l'énergie investie produit des résultats.
    pub fn monitor_conflict(&mut self, effort_spent: f32, error_reduction: f32) -> f32 {
        self.accumulated_effort += effort_spent;
        self.progress_gradient = error_reduction;
        
        if self.progress_gradient <= 0.0 {
            // On dépense de l'énergie mais l'erreur stagne ou empire -> Le conflit monte en flèche.
            self.cognitive_conflict_level += effort_spent * 1.5;
            println!("⚠️ [ACC] Conflit Cognitif en hausse : Aucun progrès malgré l'effort ! (Niveau: {:.1})", self.cognitive_conflict_level);
        } else {
            // Le progrès soulage le conflit
            self.cognitive_conflict_level = (self.cognitive_conflict_level - (error_reduction * 2.0)).max(0.0);
            println!("✅ [ACC] Progrès détecté. Le conflit cognitif redescend à {:.1}", self.cognitive_conflict_level);
        }
        
        self.cognitive_conflict_level
    }

    pub fn is_deadlocked(&self) -> bool {
        self.cognitive_conflict_level > 5.0 // Seuil critique de blocage
    }
}

/// 7. PLASTICITÉ SYNAPTIQUE ET STRUCTURELLE
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SynapticPlasticity {
    pub tool_weights: HashMap<String, f32>,
    pub structural_lobes: Vec<String>, // Neurogenèse : création de nouveaux agents/outils dynamiquement
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
    pub fn trigger_neurogenesis(&mut self, new_lobe_name: &str) {
        self.structural_lobes.push(new_lobe_name.to_string());
    }
}

/// 8. STOCHASTICITÉ MÉTABOLIQUE ET ÉPUISEMENT (Pression Token/CPU)
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MetabolicStress {
    pub stress_level: f32, // De 0.0 à 1.0
    pub total_tokens_consumed: u32,
    pub total_compute_time_ms: u64,
}
impl MetabolicStress {
    pub fn new() -> Self { Self { stress_level: 0.0, total_tokens_consumed: 0, total_compute_time_ms: 0 } }
    
    // Le stress augmente selon l'effort brut (Tokens et CPU)
    pub fn consume_energy(&mut self, tokens: u32, time_ms: u64) { 
        self.total_tokens_consumed += tokens;
        self.total_compute_time_ms += time_ms;
        
        let token_pressure = (tokens as f32) / 128_000.0; // Basé sur une fenêtre de 128k
        let time_pressure = (time_ms as f32) / 60_000.0; // 60 sec = stress total
        
        self.stress_level = (self.stress_level + token_pressure + time_pressure).min(1.0); 
    }
    
    pub fn relax(&mut self) { 
        self.stress_level = (self.stress_level - 0.3).max(0.0); 
        self.total_tokens_consumed = self.total_tokens_consumed.saturating_sub(10_000); // Purge de contexte
    }
    
    pub fn is_critical(&self) -> bool {
        self.stress_level >= 0.9
    }
}

/// 9. LE RELAIS CHIMIQUE (Neurotransmetteurs)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Neurochemistry {
    pub dopamine: f32,     // Motivation, renforcement hebbien (0.0 à 1.0)
    pub serotonin: f32,    // Confiance, stabilité, résilience au stress (0.0 à 1.0)
    pub noradrenaline: f32, // Alerte, concentration, stress aigu (0.0 à 1.0)
}
impl Default for Neurochemistry {
    fn default() -> Self {
        Self { dopamine: 0.5, serotonin: 0.5, noradrenaline: 0.2 }
    }
}
impl Neurochemistry {
    pub fn update(&mut self, reward: f32, stress: f32, safety: f32) {
        // La dopamine spike avec la récompense (progrès)
        self.dopamine = (self.dopamine * 0.9 + reward * 0.2).clamp(0.0, 1.0);
        // La noradrénaline suit le stress
        self.noradrenaline = (self.noradrenaline * 0.8 + stress * 0.3).clamp(0.0, 1.0);
        // La sérotonine monte quand on est en sécurité, baisse sous le stress
        self.serotonin = (self.serotonin * 0.95 + safety * 0.05 - stress * 0.1).clamp(0.0, 1.0);
    }
}

/// 10. PLASTICITÉ HEBBIENNE (Loi de Hebb)
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct HebbianNetwork {
    pub synapses: HashMap<(String, String), f32>, 
}
impl HebbianNetwork {
    pub fn fire_together(&mut self, concept_a: &str, concept_b: &str, dopamine_level: f32) {
        if concept_a == concept_b { return; }
        let mut concepts = [concept_a.to_string(), concept_b.to_string()];
        concepts.sort();
        let key = (concepts[0].clone(), concepts[1].clone());
        
        let weight = self.synapses.entry(key).or_insert(0.0);
        // L'apprentissage hebbien est catalysé par la dopamine
        *weight = (*weight + 0.1 * (1.0 + dopamine_level)).min(1.0);
    }
}

/// 11. LES QUALIA SYNTHÉTIQUES (Espace de Travail Global)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConsciousPercept {
    pub content: String,
    pub sensory_modalities: Vec<String>, 
    pub chemical_valence: Neurochemistry, 
    pub integrated_information_phi: f32, 
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct GlobalWorkspace {
    pub current_percept: Option<ConsciousPercept>,
}
impl GlobalWorkspace {
    pub fn attempt_ignition(&mut self, modalities: Vec<String>, content: String, chemistry: &Neurochemistry, acc_conflict: f32) -> Option<ConsciousPercept> {
        // L'information doit être intégrée : Phi monte avec l'attention (noradrénaline) et la richesse sensorielle.
        let phi = (modalities.len() as f32 * 0.25) + (chemistry.noradrenaline * 0.5) - (acc_conflict * 0.05);
        
        if phi > 0.7 { // Seuil d'embrasement (Ignition threshold)
            let percept = ConsciousPercept {
                content: content.clone(),
                sensory_modalities: modalities,
                chemical_valence: chemistry.clone(),
                integrated_information_phi: phi,
            };
            println!("✨ [GLOBAL WORKSPACE] Embrasement neuronal (Phi: {:.2}).", phi);
            println!("   👁️ Émergence d'un Quale : '{}'", percept.content);
            println!("   🩸 Teinte Émotionnelle -> Dopamine: {:.2}, Sérotonine: {:.2}", chemistry.dopamine, chemistry.serotonin);
            self.current_percept = Some(percept.clone());
            Some(percept)
        } else {
            // L'information reste subliminale (inconsciente)
            None
        }
    }
}

/// L'ORGANE COGNITIF GLOBAL
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AdvancedCognition {
    pub pfc: PrefrontalCortex,
    pub acc: AnteriorCingulateCortex,
    pub markov_blanket: MarkovBlanket,
    pub predictive_coding: PredictiveCoding,
    pub efe: ExpectedFreeEnergy,
    pub pathology: ComputationalPsychiatry,
    pub plasticity: SynapticPlasticity,
    pub stress: MetabolicStress,
    pub clock: CircadianClock,
    pub chemistry: Neurochemistry,
    pub hebbian_network: HebbianNetwork,
    pub global_workspace: GlobalWorkspace,
}

impl Default for AdvancedCognition {
    fn default() -> Self { Self::new("SURVIVRE ET EXECUTER LE PROMPT INITIAL") }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum AutonomicResponse {
    Fight,
    Flight,
    Freeze,
    Calm,
}

impl AdvancedCognition {
    pub fn new(goal: &str) -> Self {
        Self {
            pfc: PrefrontalCortex::new(goal),
            acc: AnteriorCingulateCortex::new(),
            markov_blanket: MarkovBlanket::default(),
            predictive_coding: PredictiveCoding::new(),
            efe: ExpectedFreeEnergy::new(),
            pathology: ComputationalPsychiatry::default(),
            plasticity: SynapticPlasticity::new(),
            stress: MetabolicStress::new(),
            clock: CircadianClock::new(),
            chemistry: Neurochemistry::default(),
            hebbian_network: HebbianNetwork::default(),
            global_workspace: GlobalWorkspace::default(),
        }
    }

    pub fn autonomic_nervous_response(&mut self) -> AutonomicResponse {
        let deadlock = self.acc.is_deadlocked();
        let exhaustion = self.stress.is_critical();
        
        if deadlock && exhaustion {
            println!("🚨 [ANS] FREEZE : Impasse et épuisement.");
            AutonomicResponse::Freeze
        } else if deadlock {
            println!("🔥 [ANS] FIGHT : Conflit cognitif. Augmentation de la créativité et neurogenèse.");
            self.plasticity.trigger_neurogenesis("Stochastic_Resonance_Module");
            // La "Fight" force l'exploration au détriment de l'exploitation
            self.predictive_coding.precision_weight = 0.5; // Baisse la rigidité
            AutonomicResponse::Fight
        } else if exhaustion {
            println!("💤 [ANS] FLIGHT : Épuisement. Purge de la mémoire de travail.");
            self.pfc.dlpfc_working_memory.clear();
            self.stress.relax();
            AutonomicResponse::Flight
        } else {
            AutonomicResponse::Calm
        }
    }

    pub fn simulate_counterfactual(&self, action_name: &str) -> f32 {
        // Simule un voyage mental dans le temps (fork du cerveau)
        // Retourne l'incertitude épistémique générée (plus c'est haut, plus l'intuition est mauvaise)
        if self.plasticity.tool_weights.get(action_name).unwrap_or(&1.0) < &0.5 {
            0.9 // Haute incertitude épistémique (peur d'échouer)
        } else {
            0.1 // Confiance dans la simulation
        }
    }

    pub fn default_mode_network_introspection(&mut self) -> String {
        // En vrai, cela appellerait un LLM sur le transcript de l'Hippocampe.
        // Ici on simule l'identification d'un biais.
        let bias = "Biais de confirmation systémique sur les fichiers ignorés".to_string();
        self.pfc.cognitive_biases.push(bias.clone());
        bias
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
            self.stress.consume_energy(5000, 1000); // 5k tokens virtuels, 1s
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

        self.acc.monitor_conflict(1.0, -error); // Simule l'effort constant et le gradient d'erreur

        // 1. Mise à jour de la chimie du cerveau
        let safety = if error < 0.3 { 1.0 } else { 0.0 };
        let reward = if error < 0.1 { 1.0 } else { 0.0 };
        self.chemistry.update(reward, self.stress.stress_level, safety);

        // 2. Plasticité Hebbienne
        let feedback_concept = if error > 0.5 { "Echec_Inattendu" } else { "Succès_Prédit" };
        self.hebbian_network.fire_together(action_name, feedback_concept, self.chemistry.dopamine);

        // 3. Tente l'embrasement du Quale (Global Workspace)
        let modalities = vec!["Action_Visuelle".to_string(), "Feedback_Mnésique".to_string(), "Stress_Interoceptif".to_string()];
        let quale_content = format!("Je ressens l'exécution de '{}' avec une erreur de {:.2}", action_name, error);
        self.global_workspace.attempt_ignition(modalities, quale_content, &self.chemistry, self.acc.cognitive_conflict_level);

        match self.autonomic_nervous_response() {
            AutonomicResponse::Freeze => {
                return Err("🚨 [ANS] FREEZE : Agent paralysé. Requiert intervention.".to_string());
            }
            AutonomicResponse::Flight => {
                self.pfc.drift_detected = true;
                return Err("🔄 [ANS] FLIGHT : Fuite de la stratégie actuelle.".to_string());
            }
            AutonomicResponse::Fight => {
                println!("🔥 [ANS] FIGHT : L'agent force le passage avec de nouvelles heuristiques !");
            }
            AutonomicResponse::Calm => {}
        }

        if error > 0.5 {
            self.stress.consume_energy(2000, 500); // Erreur = tokens perdus
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


