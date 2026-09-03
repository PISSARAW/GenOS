use serde::{Deserialize, Serialize};

/// Un outil MCP (Model Context Protocol Tool)
/// En biologie, c'est une enzyme externe ou un plasmide que la cellule peut utiliser.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpToolEnzyme {
    pub name: String,
    pub description: String,
    /// Le schéma JSON attendu (Serrure/Input)
    pub receptor_schema: String, 
}

/// Un serveur MCP distant est vu comme un organe sensoriel ou un biome externe.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpServerConnection {
    pub server_name: String,
    pub uri: String,
    /// Outils exposés par le serveur
    pub available_enzymes: Vec<McpToolEnzyme>, 
}

/// Les Cils Vibratiles (Cilia) : Permettent à la cellule de s'interfacer avec l'écosystème externe (Serveurs MCP).
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Cilia {
    pub mcp_connections: Vec<McpServerConnection>,
}

impl Cilia {
    /// Connecte la cellule à un nouveau serveur MCP (Croissance d'un cil vers un biome)
    pub fn grow_connection(&mut self, name: &str, uri: &str, tools: Vec<McpToolEnzyme>) {
        self.mcp_connections.push(McpServerConnection {
            server_name: name.to_string(),
            uri: uri.to_string(),
            available_enzymes: tools,
        });
    }

    /// L'agent tente d'exécuter un outil externe via le protocole MCP
    pub fn activate_enzyme(&self, tool_name: &str, payload_json: &str) -> Result<String, String> {
        for conn in &self.mcp_connections {
            if conn.available_enzymes.iter().any(|t| t.name == tool_name) {
                // En production, le Ribosome fera l'appel HTTP/WebSocket RPC au serveur MCP.
                // Ici on simule l'activation de l'outil externe.
                return Ok(format!(
                    "🧬 [MCP] Enzyme externe '{}' activée via le cil vibratile vers {}. Payload: {}", 
                    tool_name, conn.server_name, payload_json
                ));
            }
        }
        Err(format!("Rejet Immunitaire : Enzyme externe '{}' inconnue (Pas de connexion MCP correspondante).", tool_name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_cilia_activation() {
        let mut cilia = Cilia::default();

        let tool = McpToolEnzyme {
            name: "fetch_github_issue".to_string(),
            description: "Récupère un ticket Github".to_string(),
            receptor_schema: "{\"type\": \"object\"}".to_string(),
        };

        // La cellule se connecte au serveur MCP Github
        cilia.grow_connection("github_mcp", "http://localhost:8080/mcp", vec![tool]);

        // Appel d'un outil existant
        let result = cilia.activate_enzyme("fetch_github_issue", "{\"issue\": 42}");
        assert!(result.is_ok());
        assert!(result.unwrap().contains("github_mcp"));

        // Appel d'un outil inexistant (Rejet)
        let err = cilia.activate_enzyme("deploy_missile", "{}");
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("Rejet Immunitaire"));
    }
}