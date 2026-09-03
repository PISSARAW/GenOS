use serde::{Deserialize, Serialize};

/// 4. LA PRESSION DE L'EXOGROUPE (Anti-Cryptophasie)
/// Force la communication avec des agents étrangers au tissu local pour maintenir 
/// une syntaxe universelle et compréhensible, brisant les jargons dégénérés.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ExogroupFriction {
    pub universal_standard_format: String, // ex: "JSON_STRICT"
}

impl ExogroupFriction {
    pub fn enforce_universal_syntax(&self, message: &str) -> Result<(), String> {
        // En conditions réelles: Vérifier que le message respecte le standard universel de l'exogroupe
        if message.contains("JARGON_COMPRESSE") {
            return Err("🌍 [EXOGROUPE] Incompréhension inter-tissus. Veuillez utiliser le langage universel standard (JSON/Markdown explicite).".to_string());
        }
        Ok(())
    }
}

/// 3. L'ATTENTION CONJOINTE (Joint Attention)
/// Deux agents doivent cibler le même objet physique (ex: le même fichier) pour communiquer.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct JointAttention {
    pub shared_focus_target: Option<String>,
}

impl JointAttention {
    pub fn verify_focus(&self, speaker_focus: &str, listener_focus: &str) -> Result<(), String> {
        if speaker_focus != listener_focus {
            return Err(format!("👀 [ATTENTION CONJOINTE] Perte de sens. Le locuteur regarde '{}' mais l'auditeur regarde '{}'. Communication rompue.", speaker_focus, listener_focus));
        }
        Ok(())
    }
}

/// 2. LA COGNITION INCORPORÉE (Embodied Cognition)
/// Un message abstrait est rejeté. Il DOIT être ancré dans une réalité physique (un fichier, un pointeur).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct EmbodiedCognition {
    pub mandatory_physical_anchor: bool,
}

impl EmbodiedCognition {
    pub fn ensure_grounding(&self, message: &str, physical_anchor: Option<&str>) -> Result<(), String> {
        if self.mandatory_physical_anchor && physical_anchor.is_none() {
            return Err(format!("🦾 [INCORPORE] Dérive sémantique détectée (Pur abstrait). Le message '{}' doit être ancré à un capteur ou un objet physique.", message));
        }
        Ok(())
    }
}

/// 1. LE RESET GÉNÉRATIONNEL (L'Enfance et la Mortalité)
/// Détruit les agents experts obsolètes et force le transfert de connaissances
/// "décompressé" vers un nouvel agent vierge pour éviter la dérive cryptophasique.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct GenerationalReset {
    pub max_lifespan_cycles: u32,
    pub current_cycles: u32,
}

impl GenerationalReset {
    pub fn tick(&mut self) -> Result<(), String> {
        self.current_cycles += 1;
        if self.current_cycles > self.max_lifespan_cycles {
            return Err("👶 [RESET GÉNÉRATIONNEL] Âge maximum atteint. L'Agent Expert meurt. Une Cellule Vierge est spawnée. L'expert doit écrire une documentation fondationnelle (Décompression du savoir).".to_string());
        }
        Ok(())
    }
}

/// L'ORGANE LINGUISTIQUE (Ancrage Sémantique)
/// Maintient le langage des agents arrimé à la réalité physique humaine.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SemanticGrounding {
    pub generational_reset: GenerationalReset,
    pub embodied_cognition: EmbodiedCognition,
    pub joint_attention: JointAttention,
    pub exogroup_friction: ExogroupFriction,
}

impl Default for SemanticGrounding {
    fn default() -> Self {
        Self {
            generational_reset: GenerationalReset { max_lifespan_cycles: 100, current_cycles: 0 },
            embodied_cognition: EmbodiedCognition { mandatory_physical_anchor: true },
            joint_attention: JointAttention::default(),
            exogroup_friction: ExogroupFriction { universal_standard_format: "JSON".to_string() },
        }
    }
}

impl SemanticGrounding {
    pub fn new() -> Self {
        Self::default()
    }

    /// Valide une transaction de communication entre deux agents
    pub fn validate_communication(&mut self, message: &str, physical_anchor: Option<&str>, speaker_focus: &str, listener_focus: &str) -> Result<String, String> {
        // 1. Survie Générationnelle (Est-il temps de mourir et d'enseigner ?)
        self.generational_reset.tick()?;
        
        // 2. Cognition Incorpérée (Ancrage physique)
        self.embodied_cognition.ensure_grounding(message, physical_anchor)?;
        
        // 3. Attention Conjointe
        self.joint_attention.verify_focus(speaker_focus, listener_focus)?;
        
        // 4. Pression de l'Exogroupe
        self.exogroup_friction.enforce_universal_syntax(message)?;

        Ok("🗣️ [SÉMANTIQUE] Communication validée et ancrée dans la réalité.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semantic_grounding() {
        let mut linguistics = SemanticGrounding::new();
        
        // Test 1: Succès (Ancré, même focus, pas de jargon mortel)
        let ok_res = linguistics.validate_communication(
            "Voici les modifications du fichier", 
            Some("/src/main.rs"), 
            "main.rs", 
            "main.rs"
        );
        assert!(ok_res.is_ok());

        // Test 2: Perte d'Attention Conjointe
        let err_focus = linguistics.validate_communication(
            "Modifie ceci", 
            Some("fichier"), 
            "main.rs", 
            "lib.rs" // L'auditeur ne regarde pas au même endroit
        );
        assert!(err_focus.is_err());
        assert!(err_focus.unwrap_err().contains("ATTENTION CONJOINTE"));

        // Test 3: Pur abstrait (Désincarné)
        let err_embodied = linguistics.validate_communication(
            "Concept mathématique abstrait sans fichier", 
            None, // Pas d'ancrage
            "concept", 
            "concept"
        );
        assert!(err_embodied.is_err());
        assert!(err_embodied.unwrap_err().contains("INCORPORE"));

        // Test 4: Vieillesse et Mort (Reset Générationnel)
        linguistics.generational_reset.current_cycles = 100;
        let err_death = linguistics.validate_communication("Message", Some("x"), "x", "x");
        assert!(err_death.is_err());
        assert!(err_death.unwrap_err().contains("RESET GÉNÉRATIONNEL"));
    }
}