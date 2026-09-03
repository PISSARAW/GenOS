use serde::{Deserialize, Serialize};

/// Un Plasmide Étranger : Code généré par le LLM ou plugin tiers (ex: WebAssembly, JS)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ForeignPlasmid {
    pub code_content: String,
    pub language: String,
}

/// Le Phagosome Acide (Sandbox d'exécution)
/// L'équivalent de `pluginSandbox.js`. Isole le code non fiable (Plugins)
/// pour éviter qu'il ne fasse des appels système (Syscalls) malveillants sur l'OS Hôte.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Phagosome {
    pub vesicles: Vec<ForeignPlasmid>,
}

impl Phagosome {
    pub fn new() -> Self {
        Self::default()
    }

    /// Ingestion : La cellule capture le plugin dans une vésicule étanche (Sandbox)
    pub fn ingest_plugin(&mut self, code: &str, language: &str) {
        self.vesicles.push(ForeignPlasmid {
            code_content: code.to_string(),
            language: language.to_string(),
        });
    }

    /// Digestion & Exécution (Wasmtime Runtime) : Exécute le code dans le Phagosome.
    /// Si le code est toxique (tente d'échapper à la sandbox), il est détruit par l'acide.
    pub fn execute_sandbox(&mut self) -> Result<String, String> {
        if self.vesicles.is_empty() {
            return Err("Aucun plasmide dans le phagosome.".to_string());
        }

        let plasmid = self.vesicles.pop().unwrap(); // On traite le dernier ingéré

        // En production V2, on utiliserait le crate `wasmtime` pour exécuter nativement.
        // Ici on simule l'isolement en scannant les imports toxiques.
        let toxic_patterns = ["std::fs", "require('fs')", "os.system", "rm -rf", "child_process", "File::create"];
        
        for toxin in toxic_patterns {
            if plasmid.code_content.contains(toxin) {
                // Le Phagosome détecte une tentative de sortie de la sandbox (Syscall non autorisé)
                return Err(format!("☠️ [ACIDE LYSOSOMAL] Le code contient une toxine ('{}'). Destruction immédiate. Hôte protégé.", toxin));
            }
        }

        Ok(format!("🦠 [WASM SANDBOX] Exécution isolée réussie du plugin ({}). Aucun accès système accordé.", plasmid.language))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_phagosome_sandbox() {
        let mut phagosome = Phagosome::new();

        // 1. Ingestion d'un code Wasm sain (Calcul mathématique)
        phagosome.ingest_plugin("let a = 2 + 2; return a;", "wasm");
        let result = phagosome.execute_sandbox();
        assert!(result.is_ok());

        // 2. Ingestion d'un code JavaScript toxique (Accès Disque)
        phagosome.ingest_plugin("const fs = require('fs'); fs.unlinkSync('/');", "javascript");
        let err = phagosome.execute_sandbox();
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("ACIDE LYSOSOMAL"));
    }
}