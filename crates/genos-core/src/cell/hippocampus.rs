use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Hippocampus {
    pub short_term_memory: Vec<ChatMessage>,
    pub graph_memory: GraphMemory,
}

impl Default for Hippocampus {
    fn default() -> Self {
        Self::new()
    }
}

impl Hippocampus {
    pub fn new() -> Self {
        Self {
            short_term_memory: Vec::new(),
            graph_memory: GraphMemory { db_path: "mock.db".to_string() }
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

// --- MOCK DU GRAPH MEMORY ---
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GraphMemory {
    pub db_path: String,
}

impl GraphMemory {
    pub fn fork(&self, new_branch_id: &str) -> Self {
        Self {
            db_path: format!("{}_branch_{}.mock", self.db_path, new_branch_id),
        }
    }

    pub async fn connect(path: &str, _user: &str, _pass: &str) -> Result<Self, String> {
        Ok(Self { db_path: path.to_string() })
    }

    pub async fn ingest_memory_chunk(&self, _id: &str, text: &str, _speaker: &str, _timestamp: i64, _session_id: &str, _vector: &[f32]) -> Result<(), String> {
        Ok(())
    }

    pub async fn consolidate_synapse(&self, _entity_a: &str, _relationship: &str, _entity_b: &str, _vector_a: &[f32], _vector_b: &[f32]) -> Result<(), String> {
        Ok(())
    }

    pub async fn ingest_entity_relation(&self, _chunk_id: &str, _entity_a: &str, _type_a: &str, _rel: &str, _entity_b: &str, _type_b: &str) -> Result<(), String> {
        Ok(())
    }

    pub async fn recall_spreading_activation(&self, _concept: &str, _depth: u8) -> Result<String, String> {
        Ok("Mock".to_string())
    }

    pub async fn execute_raw_cypher(&self, _query: &str) -> Result<String, String> {
        Ok("Mock Cypher Result".to_string())
    }

    pub async fn awaken_self(&self, agent_name: &str) -> Result<(), String> {
        let cypher = format!("
            MERGE (a:Agent {{id: 'self'}}) 
            ON CREATE SET a.name = '{}', a.is_self = true
        ", agent_name);
        self.execute_raw_cypher(&cypher).await?;
        Ok(())
    }

    pub async fn ingest_other_agent(&self, other_id: &str, other_name: &str) -> Result<(), String> {
        let cypher = format!("
            MATCH (me:Agent {{id: 'self'}})
            MERGE (other:Agent {{id: '{}'}})
            ON CREATE SET other.name = '{}', other.is_self = false
            MERGE (me)-[:KNOWS]->(other)
        ", other_id, other_name);
        self.execute_raw_cypher(&cypher).await?;
        Ok(())
    }

    pub async fn ingest_belief(&self, agent_id: &str, concept: &str, state: &str, confidence: f64) -> Result<(), String> {
        let cypher = format!("
            MATCH (a:Agent {{id: '{}'}})
            MERGE (b:Belief {{concept: '{}'}})
            ON CREATE SET b.state = '{}', b.confidence = {}
            MERGE (a)-[:BELIEVES]->(b)
        ", agent_id, concept, state, confidence);
        self.execute_raw_cypher(&cypher).await?;
        Ok(())
    }

    pub async fn detect_belief_divergence(&self, other_id: &str, concept: &str) -> Result<Option<(String, String)>, String> {
        // Mock query logic: We would usually execute Cypher to find if me and other have different states for the same concept.
        // For the mock, we will just simulate a return if Cypher was real.
        // In a real KuzuDB context:
        /*
        MATCH (me:Agent {id: 'self'})-[:BELIEVES]->(b1:Belief {concept: $concept})
        MATCH (other:Agent {id: $other_id})-[:BELIEVES]->(b2:Belief {concept: $concept})
        WHERE b1.state <> b2.state
        RETURN b1.state, b2.state
        */
        
        // Mock return for demo purposes
        Ok(Some(("La balle est dans le tiroir".to_string(), "La balle est dans la boîte".to_string())))
    }

    pub async fn ingest_autobiographical_event(
        &self, 
        event_id: &str, 
        action_name: &str, 
        outcome: &str, 
        prediction_error: f32
    ) -> Result<(), String> {
        let cypher = format!("
            MATCH (me:Agent {{id: 'self'}})
            CREATE (act:Action {{id: '{event_id}_act', tool_name: '{action_name}'}})
            CREATE (evt:Event {{id: '{event_id}', content: '{outcome}', prediction_error: {prediction_error}}})
            CREATE (me)-[:PERFORMED]->(act)
            CREATE (act)-[:RESULTED_IN]->(evt)
            CREATE (me)-[:EXPERIENCED]->(evt)
        ");
        self.execute_raw_cypher(&cypher).await?;
        Ok(())
    }

    pub async fn recall_semantic_vector(&self, _query_vector: &[f32], _k: u8) -> Result<String, String> {
        Ok("Mock Vector Result".to_string())
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
