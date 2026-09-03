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

use lbug::{Database, Connection, SystemConfig};

#[derive(Clone, Debug)]
pub struct GraphMemory {
    pub db_path: String,
}

impl GraphMemory {
    /// Initialise la connexion à l'Hippocampe (LadybugDB - Hybride)
    pub async fn connect(path: &str, _user: &str, _pass: &str) -> Result<Self, String> {
        let db = Database::new(path, SystemConfig::default()).map_err(|e| e.to_string())?;
        let conn = Connection::new(&db).map_err(|e| e.to_string())?;
        
        // Setup schema with embedding for Hybrid RAG
        let _ = conn.query("CREATE NODE TABLE Concept (name STRING, embedding FLOAT[768], PRIMARY KEY (name))");
        let _ = conn.query("CREATE REL TABLE SYNAPSE (FROM Concept TO Concept, type STRING)");

        Ok(Self {
            db_path: path.to_string(),
        })
    }

    /// Ingestion Biomimétique (Consolidation)
    pub async fn consolidate_synapse(&self, entity_a: &str, relationship: &str, entity_b: &str, vector_a: &[f32], vector_b: &[f32]) -> Result<(), String> {
        let db = Database::new(&self.db_path, SystemConfig::default()).map_err(|e| e.to_string())?;
        let conn = Connection::new(&db).map_err(|e| e.to_string())?;
        
        // Convert f32 slice to string array for Cypher injection
        let vec_a_str = format!("{:?}", vector_a);
        let vec_b_str = format!("{:?}", vector_b);
        
        let query = format!(
            "MERGE (a:Concept {{name: '{}'}}) ON CREATE SET a.embedding = {} \
             MERGE (b:Concept {{name: '{}'}}) ON CREATE SET b.embedding = {} \
             MERGE (a)-[r:SYNAPSE {{type: '{}'}}]->(b)", 
            entity_a, vec_a_str, entity_b, vec_b_str, relationship
        );
        conn.query(&query).map_err(|e| e.to_string())?;
        
        println!("🧠 [Hippocampe] Synapse vectorisée : {} --[{}]--> {}", entity_a, relationship, entity_b);
        Ok(())
    }

    /// Rappel Biomimétique (Spreading Activation / Multi-Hop) : 
    /// Récupère le sous-graphe sémantique autour d'un concept jusqu'à 'depth' degrés de séparation.
    pub async fn recall_spreading_activation(&self, concept: &str, depth: u8) -> Result<String, String> {
        let db = Database::new(&self.db_path, SystemConfig::default()).map_err(|e| e.to_string())?;
        let conn = Connection::new(&db).map_err(|e| e.to_string())?;

        // Requête Cypher : Trouve tous les chemins autour du concept,
        // puis extrait toutes les synapses (relations) uniques de ce sous-graphe pour l'Agent.
        let query_str = format!(
            "MATCH (start:Concept {{name: '{}'}})-[rel:SYNAPSE*1..{}]-(related:Concept) \
             RETURN start.name AS source, rel.type AS relation, related.name AS target \
             LIMIT 100",
            concept, depth
        );
        
        let mut result = conn.query(&query_str).map_err(|e| e.to_string())?;
        let mut context_builder = String::new();
        context_builder.push_str(&format!("Réseau neuronal activé pour le concept '{}':\n", concept));
        
        let mut nodes_found = 0;
        while let Some(row) = result.next() {
            let source: String = row[0].to_string();
            let relation: String = row[1].to_string();
            let target: String = row[2].to_string();
            
            context_builder.push_str(&format!("- {} --[{}]--> {}\n", source, relation, target));
            nodes_found += 1;
        }

        if nodes_found == 0 {
            context_builder.push_str("(Aucun souvenir direct ou indirect trouvé dans le réseau)");
        }
        
        Ok(context_builder)
    }

    /// Recherche Sémantique Vectorielle (Vector Cortex) :
    /// Retrouve les concepts sémantiquement les plus proches d'un vecteur d'intention.
    pub async fn recall_semantic_vector(&self, query_vector: &[f32], k: u8) -> Result<String, String> {
        let db = Database::new(&self.db_path, SystemConfig::default()).map_err(|e| e.to_string())?;
        let conn = Connection::new(&db).map_err(|e| e.to_string())?;
        
        let vec_str = format!("{:?}", query_vector);
        
        let query_str = format!(
            "MATCH (c:Concept) \
             WITH c, array_cosine_similarity(c.embedding, {}) AS sim \
             ORDER BY sim DESC \
             LIMIT {} \
             MATCH (c)-[r:SYNAPSE]->(d:Concept) \
             RETURN c.name AS concept, d.name AS details, sim \
             LIMIT {}",
            vec_str, k, k * 3 // Allow returning multiple details for the top k concepts
        );
        
        let mut result = conn.query(&query_str).map_err(|e| e.to_string())?;
        let mut context_builder = String::new();
        context_builder.push_str("Cortex Vectoriel (Concepts proches par intuition avec contexte):\n");
        
        while let Some(row) = result.next() {
            let concept: String = row[0].to_string();
            let details: String = row[1].to_string();
            let sim: f32 = row[2].to_string().parse().unwrap_or(0.0);
            context_builder.push_str(&format!("- {} (Pertinence: {:.2}): {}\n", concept, sim, details));
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
