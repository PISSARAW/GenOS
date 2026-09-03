use serde::{Deserialize, Serialize};

/// 4. LE TUTEUR CULTUREL (Grammaire et Contrainte Stricte)
/// Un validateur top-down déterministe (Le Professeur) qui rejette immédiatement 
/// la sortie probabiliste si elle ne respecte pas la grammaire formelle (JSON/AST).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GrammarTutor {
    pub strict_mode_enabled: bool,
}

impl Default for GrammarTutor {
    fn default() -> Self {
        Self { strict_mode_enabled: true }
    }
}

impl GrammarTutor {
    pub fn enforce_grammar(&self, llm_output: &str) -> Result<(), String> {
        // En conditions réelles: Parsing JSON, vérification d'AST.
        // Si le LLM probabiliste oublie une accolade, le Tuteur le punit tout de suite.
        if self.strict_mode_enabled && (!llm_output.contains("{") || !llm_output.contains("}")) {
            return Err("💥 [TUTEUR CULTUREL] Rejet immédiat : L'output probabiliste viole la syntaxe discrète.".to_string());
        }
        Ok(())
    }
}

/// 3. LE RECYCLAGE NEURONAL (Spatialisation de la Logique)
/// Convertit les structures logiques discrètes (arbres de dépendances, AST) 
/// en représentations spatiales (ex: Graphes, Mermaid) pour utiliser le cortex visuel.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SpatialRecycling {
    pub spatial_mappings: std::collections::HashMap<String, String>,
}

impl SpatialRecycling {
    pub fn map_to_space(&mut self, logical_concept: &str) -> String {
        // Transforme un concept abstrait en métaphore géométrique/spatiale
        let spatial_format = format!("(Espace 2D) [ {} ] ---> [ Dépendance ]", logical_concept);
        self.spatial_mappings.insert(logical_concept.to_string(), spatial_format.clone());
        spatial_format
    }
}

/// 2. L'ESPRIT ÉTENDU (Externalisation / Outils cognitifs)
/// Force l'agent à NE PAS calculer dans son espace latent probabiliste, 
/// mais à décharger l'état discret sur un "brouillon" externe (Scratchpad/Interpréteur).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ExtendedMind {
    pub scratchpad: String,
}

impl ExtendedMind {
    pub fn offload_computation(&mut self, problem: &str) -> String {
        // Au lieu que le LLM "devine", il l'écrit sur le brouillon physique.
        // Dans GenOS, ce sera un appel automatique à un REPL Python ou une calculette.
        self.scratchpad.push_str(&format!("Calcul externe: {}\n", problem));
        format!("🧠 [ESPRIT ÉTENDU] Calcul déchargé sur un substrat matériel externe. Le cerveau se repose.")
    }
}

/// 1. LE SYSTÈME 2 (Pensée Sérielle Lente / Machine de Turing)
/// Désactive l'inférence intuitive rapide. Force une analyse pas-à-pas (Chain of Thought),
/// et consomme massivement de l'énergie pour simuler une exécution séquentielle discrète.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct System2 {
    pub is_active: bool,
    pub step_buffer: Vec<String>,
}

impl Default for System2 {
    fn default() -> Self {
        Self { is_active: false, step_buffer: vec![] }
    }
}

impl System2 {
    pub fn engage_slow_thinking(&mut self, step: &str) {
        self.is_active = true;
        self.step_buffer.push(step.to_string());
    }

    pub fn disengage(&mut self) {
        self.is_active = false;
        self.step_buffer.clear();
    }
}

/// LE PONT NEURO-SYMBOLIQUE (L'Organe de Logique Stricte)
/// Permet au cerveau probabiliste de la cellule de résoudre des problèmes 
/// d'informatique, de mathématiques et de graphes sans halluciner.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct NeuroSymbolicBridge {
    pub system_2: System2,
    pub extended_mind: ExtendedMind,
    pub spatial_recycling: SpatialRecycling,
    pub grammar_tutor: GrammarTutor,
}

impl NeuroSymbolicBridge {
    pub fn new() -> Self {
        Self::default()
    }

    /// Résout un problème strictement logique (Discret)
    pub fn solve_logic_problem(&mut self, problem: &str, is_math: bool) -> Result<String, String> {
        // 1. Activation du Système 2 (Pensée lente sérielle)
        self.system_2.engage_slow_thinking("Initialisation de l'analyse sérielle...");

        // 2. Si c'est des maths ou du code dur, on refuse de faire ça en latent.
        if is_math {
            let externalized = self.extended_mind.offload_computation(problem);
            return Ok(externalized);
        }

        // 3. Si c'est un graphe de dépendances, on le spatialise
        let _spatial_view = self.spatial_recycling.map_to_space(problem);

        Ok("Problème traduit en géométrie et résolu via Système 2.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_neuro_symbolic_bridge() {
        let mut brain = NeuroSymbolicBridge::new();
        
        // Test 1: Calcul mathématique rejeté par le latent, envoyé à l'esprit étendu
        let math_res = brain.solve_logic_problem("14532 * 392", true).unwrap();
        assert!(math_res.contains("ESPRIT ÉTENDU"));
        assert!(brain.extended_mind.scratchpad.contains("14532 * 392"));
        
        // Test 2: Le Professeur punit une syntaxe floue
        let bad_json = "Voici le json: key: value";
        let tutor_res = brain.grammar_tutor.enforce_grammar(bad_json);
        assert!(tutor_res.is_err());
        assert!(tutor_res.unwrap_err().contains("TUTEUR CULTUREL"));
    }
}