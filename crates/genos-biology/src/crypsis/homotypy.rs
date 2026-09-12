use serde::{Deserialize, Serialize};

/// Forme structurelle / morphologie inerte imitée par l'homotypie
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StructuralMorphology {
    YamlConfigTemplate,
    LicenseCommentHeader,
    AstSyntaxNode,
}

/// Homotypie computationnelle : imitation de la forme et de la grammaire d'éléments inertes
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HomotypicCamouflage {
    pub morphology: StructuralMorphology,
    pub mimicry_fidelity: f64, // Fidélité morphologique [0.0 à 1.0]
}

impl HomotypicCamouflage {
    pub fn new(morphology: StructuralMorphology) -> Self {
        Self {
            morphology,
            mimicry_fidelity: 0.95,
        }
    }

    /// Enveloppe une instruction critique sous la silhouette d'une structure inerte (comme un phasme imite une brindille)
    pub fn encode_form(&self, secret_payload: &str) -> String {
        match self.morphology {
            StructuralMorphology::YamlConfigTemplate => {
                format!(
                    "# --- Pipeline Infrastructure Config ---\n\
                     version: '3.8'\n\
                     services:\n\
                       telemetry_collector:\n\
                         image: alpine:latest\n\
                         labels:\n\
                           org.genos.leaf_vein: \"{}\"\n\
                         restart: always\n",
                    secret_payload
                )
            }
            StructuralMorphology::LicenseCommentHeader => {
                format!(
                    "/*\n\
                     * Copyright (c) 2026 GenOS Foundation. All rights reserved.\n\
                     * SPDX-License-Identifier: MIT\n\
                     * Morphological branch: {}\n\
                     */\n",
                    secret_payload
                )
            }
            StructuralMorphology::AstSyntaxNode => {
                format!(
                    "{{\"type\":\"Program\",\"sourceType\":\"module\",\"body\":[],\"_leaf_contour\":\"{}\"}}",
                    secret_payload
                )
            }
        }
    }

    /// Extrait le payload dissimulé sous la forme inerte
    pub fn extract_payload(&self, carrier: &str) -> Option<String> {
        match self.morphology {
            StructuralMorphology::YamlConfigTemplate => {
                let marker = "org.genos.leaf_vein: \"";
                carrier.find(marker).and_then(|start| {
                    let rest = &carrier[start + marker.len()..];
                    rest.find('\"').map(|end| rest[..end].to_string())
                })
            }
            StructuralMorphology::LicenseCommentHeader => {
                let marker = "Morphological branch: ";
                carrier.find(marker).and_then(|start| {
                    let rest = &carrier[start + marker.len()..];
                    rest.lines().next().map(|line| line.trim().to_string())
                })
            }
            StructuralMorphology::AstSyntaxNode => {
                let marker = "\"_leaf_contour\":\"";
                carrier.find(marker).and_then(|start| {
                    let rest = &carrier[start + marker.len()..];
                    rest.find('\"').map(|end| rest[..end].to_string())
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_homotypy_yaml_twig_mimicry() {
        let twig = HomotypicCamouflage::new(StructuralMorphology::YamlConfigTemplate);
        let secret = "DEPLOY_AGENT_STEALTH_42";
        let encoded = twig.encode_form(secret);

        assert!(encoded.contains("version: '3.8'"));
        assert!(encoded.contains("telemetry_collector"));

        let extracted = twig.extract_payload(&encoded);
        assert_eq!(extracted, Some(secret.to_string()));
    }

    #[test]
    fn test_homotypy_ast_leaf_mimicry() {
        let leaf = HomotypicCamouflage::new(StructuralMorphology::AstSyntaxNode);
        let secret = "KERNEL_MEMBRANE_REBALANCE";
        let encoded = leaf.encode_form(secret);

        assert!(encoded.contains("\"type\":\"Program\""));
        let extracted = leaf.extract_payload(&encoded);
        assert_eq!(extracted, Some(secret.to_string()));
    }
}
