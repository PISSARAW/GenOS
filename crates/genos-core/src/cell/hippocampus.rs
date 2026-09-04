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
use std::sync::{Arc, OnceLock};

static SHARED_DB: OnceLock<Arc<Database>> = OnceLock::new();

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GraphMemory {
    pub db_path: String,
}

impl GraphMemory {
    fn get_db(&self) -> Result<Arc<Database>, String> {
        if let Some(db) = SHARED_DB.get() {
            Ok(db.clone())
        } else {
            // Lazy initialization fallback
            let db = Database::new(&self.db_path, SystemConfig::default()).map_err(|e| e.to_string())?;
            let db_arc = Arc::new(db);
            let _ = SHARED_DB.set(db_arc.clone());
            
            // Setup schema
            if let Some(db_ref) = SHARED_DB.get() {
                if let Ok(conn) = Connection::new(db_ref.as_ref()) {
                    let _ = conn.query("CREATE NODE TABLE MemoryChunk (id STRING, text STRING, speaker STRING, timestamp INT64, session_id STRING, embedding FLOAT[768], PRIMARY KEY(id))");
                    let _ = conn.query("CREATE NODE TABLE Entity (name STRING, type STRING, PRIMARY KEY(name))");
                    let _ = conn.query("CREATE REL TABLE MENTIONS (FROM MemoryChunk TO Entity)");
                    let _ = conn.query("CREATE REL TABLE RELATED_TO (FROM Entity TO Entity, type STRING)");
                }
            }
            Ok(db_arc)
        }
    }

    /// Initialise la connexion à l'Hippocampe (LadybugDB - Hybride)
    pub async fn connect(path: &str, _user: &str, _pass: &str) -> Result<Self, String> {
        let mem = Self { db_path: path.to_string() };
        let _ = mem.get_db()?; // Ensure DB is initialized and schema is created
        Ok(mem)
    }

    /// Ingestion Biomimétique (Consolidation)
    pub async fn ingest_memory_chunk(&self, id: &str, text: &str, speaker: &str, timestamp: i64, session_id: &str, vector: &[f32]) -> Result<(), String> {
        let db = self.get_db()?;
        let conn = Connection::new(db.as_ref()).map_err(|e| e.to_string())?;
        
        let vec_str = format!("{:?}", vector);
        let safe_text = text.replace("'", "\\'");
        
        let query = format!(
            "MERGE (m:MemoryChunk {{id: '{}'}}) ON CREATE SET m.text = '{}', m.speaker = '{}', m.timestamp = {}, m.session_id = '{}', m.embedding = {}", 
            id, safe_text, speaker, timestamp, session_id, vec_str
        );
        conn.query(&query).map_err(|e| e.to_string())?;
        
        println!("🧠 [Hippocampe] Chunk mémoire ingéré : {}...", &safe_text.chars().take(30).collect::<String>());
        Ok(())
    }

    pub async fn consolidate_synapse(&self, _entity_a: &str, _relationship: &str, _entity_b: &str, _vector_a: &[f32], _vector_b: &[f32]) -> Result<(), String> {
        Ok(())
    }

    pub async fn ingest_entity_relation(&self, chunk_id: &str, entity_a: &str, type_a: &str, rel: &str, entity_b: &str, type_b: &str) -> Result<(), String> {
        let db = self.get_db()?;
        let conn = Connection::new(db.as_ref()).map_err(|e| e.to_string())?;
        
        let safe_a = entity_a.replace("'", "\\'");
        let safe_b = entity_b.replace("'", "\\'");
        let safe_rel = rel.replace("'", "\\'");
        
        let query = format!(
            "MATCH (m:MemoryChunk {{id: '{}'}}) \
             MERGE (a:Entity {{name: '{}'}}) ON CREATE SET a.type = '{}' \
             MERGE (b:Entity {{name: '{}'}}) ON CREATE SET b.type = '{}' \
             MERGE (m)-[:MENTIONS]->(a) \
             MERGE (m)-[:MENTIONS]->(b) \
             MERGE (a)-[:RELATED_TO {{type: '{}'}}]->(b)", 
            chunk_id, safe_a, type_a, safe_b, type_b, safe_rel
        );
        conn.query(&query).map_err(|e| e.to_string())?;
        
        println!("🕸️ [Hippocampe] Relation extraite : {} --[{}]--> {}", safe_a, safe_rel, safe_b);
        Ok(())
    }

    /// Rappel Biomimétique (Spreading Activation / Multi-Hop) : 
    /// Récupère le sous-graphe sémantique autour d'un concept jusqu'à 'depth' degrés de séparation.
    pub async fn recall_spreading_activation(&self, concept: &str, depth: u8) -> Result<String, String> {
        let db = self.get_db()?;
        let conn = Connection::new(db.as_ref()).map_err(|e| e.to_string())?;

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

    /// Exécution directe d'une requête Cypher par le LLM (Tool Calling)
    pub async fn execute_raw_cypher(&self, query: &str) -> Result<String, String> {
        let db = self.get_db()?;
        let conn = Connection::new(db.as_ref()).map_err(|e| e.to_string())?;
        
        let mut result = conn.query(query).map_err(|e| format!("Erreur Cypher: {}", e))?;
        let mut output = String::new();
        output.push_str("Résultats de la requête Cypher :\n");
        
        let mut count = 0;
        while let Some(row) = result.next() {
            let cols: Vec<String> = row.iter().map(|v| v.to_string()).collect();
            output.push_str(&format!("- {}\n", cols.join(" | ")));
            count += 1;
            if count >= 50 {
                output.push_str("... (résultats tronqués à 50)\n");
                break;
            }
        }
        if count == 0 {
            output.push_str("(Aucun résultat)");
        }
        Ok(output)
    }

    /// Recherche Sémantique Vectorielle (Vector Cortex) :
    /// Retrouve les concepts sémantiquement les plus proches d'un vecteur d'intention.
    pub async fn recall_semantic_vector(&self, query_vector: &[f32], k: u8) -> Result<String, String> {
        let db = self.get_db()?;
        let conn = Connection::new(db.as_ref()).map_err(|e| e.to_string())?;
        
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
