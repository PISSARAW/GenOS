use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Hippocampus {
    pub short_term_memory: Vec<ChatMessage>,
}

impl Hippocampus {
    pub fn new() -> Self {
        Self {
            short_term_memory: Vec::new(),
        }
    }

    pub fn memorize(&mut self, role: &str, content: &str) {
        self.short_term_memory.push(ChatMessage {
            role: role.to_string(),
            content: content.to_string(),
        });
    }

    pub fn clear(&mut self) {
        self.short_term_memory.clear();
    }
}

use std::sync::Arc;
// Note: Graph cannot be serialized directly, so we use it as a runtime component.
#[derive(Clone)]
pub struct GraphMemory {
    // We use Arc to share the connection pool safely across cells if needed
    pub client: Arc<neo4rs::Graph>,
}

impl GraphMemory {
    /// Initialise la connexion à l'Hippocampe (Neo4J)
    pub async fn connect(uri: &str, user: &str, pass: &str) -> Result<Self, neo4rs::Error> {
        let graph = neo4rs::Graph::new(uri, user, pass).await?;
        Ok(Self {
            client: Arc::new(graph),
        })
    }

    /// Ingestion Biomimétique (Consolidation) : Crée des synapses entre deux concepts
    pub async fn consolidate_synapse(&self, entity_a: &str, relationship: &str, entity_b: &str) -> Result<(), neo4rs::Error> {
        // Dans une cellule, la création d'une synapse nécessite de l'énergie (transaction)
        let mut txn = self.client.start_txn().await?;
        
        let q = neo4rs::query("MERGE (a:Concept {name: $name_a}) MERGE (b:Concept {name: $name_b}) MERGE (a)-[r:SYNAPSE {type: $rel}]->(b)")
            .param("name_a", entity_a.to_string())
            .param("name_b", entity_b.to_string())
            .param("rel", relationship.to_string());
            
        txn.run(q).await?;
        txn.commit().await?;
        
        println!("🧠 [Hippocampe] Synapse consolidée : {} --[{}]--> {}", entity_a, relationship, entity_b);
        Ok(())
    }

    /// Rappel Biomimétique (Spreading Activation / Multi-Hop) : 
    /// Récupère le sous-graphe sémantique autour d'un concept jusqu'à 'depth' degrés de séparation.
    pub async fn recall_spreading_activation(&self, concept: &str, depth: u8) -> Result<String, neo4rs::Error> {
        let mut txn = self.client.start_txn().await?;
        
        // Requête Cypher : Trouve tous les chemins autour du concept,
        // puis extrait toutes les synapses (relations) uniques de ce sous-graphe pour l'Agent.
        let query_str = format!(
            "MATCH p=(start:Concept {{name: $concept}})-[*1..{}]-(related) \
             UNWIND relationships(p) AS rel \
             WITH DISTINCT rel \
             MATCH (a)-[rel]->(b) \
             RETURN a.name AS source, type(rel) AS relation, b.name AS target \
             LIMIT 100",
            depth
        );
        
        let q = neo4rs::query(&query_str).param("concept", concept.to_string());
            
        let mut result = txn.execute(q).await?;
        let mut context_builder = String::new();
        context_builder.push_str(&format!("Réseau neuronal activé pour le concept '{}':\n", concept));
        
        let mut nodes_found = 0;
        while let Ok(Some(row)) = result.next().await {
            let source: String = row.get("source").unwrap_or_default();
            let relation: String = row.get("relation").unwrap_or_default();
            let target: String = row.get("target").unwrap_or_default();
            
            context_builder.push_str(&format!("- {} --[{}]--> {}\n", source, relation, target));
            nodes_found += 1;
        }
        
        txn.commit().await?;

        if nodes_found == 0 {
            context_builder.push_str("(Aucun souvenir direct ou indirect trouvé dans le réseau)");
        }
        
        Ok(context_builder)
    }
}

use std::collections::HashMap;
use std::time::{Instant, Duration};

/// Fente Synaptique (Working Memory Cache)
/// Permet de stocker les réponses exactes pour court-circuiter le réseau 
/// si l'agent a déjà résolu ce problème récemment (O(1) lookup).
#[derive(Clone, Debug)]
pub struct SynapticCleft {
    pub cache: HashMap<String, (String, Instant)>,
    pub memory_duration: Duration,
}

impl Default for SynapticCleft {
    fn default() -> Self {
        Self {
            cache: HashMap::new(),
            memory_duration: Duration::from_secs(3600), // Oubli métabolique après 1 heure
        }
    }
}

impl SynapticCleft {
    pub fn recall(&mut self, prompt: &str) -> Option<String> {
        self.prune(); // Mécanisme d'oubli biologique
        
        if let Some((response, _)) = self.cache.get(prompt) {
            println!("⚡ [Fente Synaptique] Cache Hit (1ms) ! Court-circuitage de Neo4J et du Ribosome.");
            return Some(response.clone());
        }
        None
    }

    pub fn memorize(&mut self, prompt: &str, response: &str) {
        self.cache.insert(prompt.to_string(), (response.to_string(), Instant::now()));
    }

    /// Oubli (Cache Invalidation) : Détruit les neurotransmetteurs périmés pour économiser la RAM
    fn prune(&mut self) {
        let now = Instant::now();
        self.cache.retain(|_, (_, timestamp)| now.duration_since(*timestamp) < self.memory_duration);
    }
}
