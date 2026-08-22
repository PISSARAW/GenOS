use serde::{Deserialize, Serialize};

/// Garantit l'isolation contextuelle. L'agent ne voit QUE ce qui est dans ce sandbox.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContextSandbox {
    pub sandbox_id: String,

    /// Le prompt système strict (ex: "Tu es un extracteur JSON")
    pub role_instruction: String,

    /// Uniquement les chunks RAG autorisés pour cette tâche
    pub allowed_documents: Vec<String>,

    /// Historique de conversation tronqué/limité
    pub memory_window: Vec<serde_json::Value>,

    /// Mécanisme de sécurité : empêcher l'agent d'accéder au réseau extérieur
    pub network_access_allowed: bool,
}

impl ContextSandbox {
    pub fn new(sandbox_id: String, role_instruction: String) -> Self {
        Self {
            sandbox_id,
            role_instruction,
            allowed_documents: Vec::new(),
            memory_window: Vec::new(),
            network_access_allowed: false,
        }
    }

    /// Compile le contexte isolé de manière déterministe pour le LLM.
    pub fn render_prompt(&self) -> String {
        let docs = self.allowed_documents.join("\n");
        if docs.is_empty() {
            self.role_instruction.clone()
        } else {
            format!("{}\n\nContexte Autorisé:\n{}", self.role_instruction, docs)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_sandbox_renders_prompt_correctly() {
        let mut sandbox = ContextSandbox::new(
            "test_sandbox".to_string(),
            "Tu es un assistant de test.".to_string(),
        );

        // Without docs
        assert_eq!(sandbox.render_prompt(), "Tu es un assistant de test.");

        // With docs
        sandbox.allowed_documents.push("Doc 1".to_string());
        sandbox.allowed_documents.push("Doc 2".to_string());

        let expected = "Tu es un assistant de test.\n\nContexte Autorisé:\nDoc 1\nDoc 2";
        assert_eq!(sandbox.render_prompt(), expected);
    }
}
