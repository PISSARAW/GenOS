use std::collections::HashMap;
use std::sync::RwLock;
use genos_common::traits::{MemoryEntry, MemoryRepository, SearchQuery};

/// Calcul de la similarité cosinus entre deux vecteurs f32
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let n = a.len().min(b.len());
    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;

    for i in 0..n {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    if norm_a <= 0.0 || norm_b <= 0.0 {
        return 0.0;
    }
    dot / (norm_a.sqrt() * norm_b.sqrt())
}

/// Dépôt mémoire vectoriel en mémoire pour les agents cellulaires
pub struct InMemoryVectorRepository {
    entries: RwLock<HashMap<String, MemoryEntry>>,
}

impl Default for InMemoryVectorRepository {
    fn default() -> Self {
        Self::new()
    }
}

impl InMemoryVectorRepository {
    pub fn new() -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
        }
    }

    pub fn count(&self) -> usize {
        self.entries.read().map(|m| m.len()).unwrap_or(0)
    }
}

impl MemoryRepository for InMemoryVectorRepository {
    fn store_memory(&self, entry: MemoryEntry) -> Result<(), String> {
        let mut map = self.entries.write().map_err(|e| e.to_string())?;
        map.insert(entry.id.clone(), entry);
        Ok(())
    }

    fn search(&self, query: SearchQuery) -> Result<Vec<MemoryEntry>, String> {
        let map = self.entries.read().map_err(|e| e.to_string())?;
        let limit = if query.limit == 0 { 5 } else { query.limit };

        let mut scored: Vec<(f32, MemoryEntry)> = Vec::new();

        for entry in map.values() {
            let mut score = 0.0f32;

            // Similarité vectorielle si vecteur de requête et d'entrée présents
            if let (Some(q_vec), Some(e_vec)) = (&query.vector, &entry.embedding) {
                let cos = cosine_similarity(q_vec, e_vec);
                score = score.max(cos);
            }

            // Correspondance textuelle lexicale
            if let Some(text) = &query.text {
                let q_lower = text.to_lowercase();
                let e_lower = entry.content.to_lowercase();
                if e_lower.contains(&q_lower) {
                    score += 0.3;
                }
                for token in q_lower.split_whitespace() {
                    if e_lower.contains(token) {
                        score += 0.1;
                    }
                }
            }

            if score > 0.0 || (query.vector.is_none() && query.text.is_none()) {
                scored.push((score, entry.clone()));
            }
        }

        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        let results = scored.into_iter().take(limit).map(|(_, entry)| entry).collect();
        Ok(results)
    }
}
