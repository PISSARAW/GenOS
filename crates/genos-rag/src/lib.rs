use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{cmp::Ordering, collections::BTreeMap, sync::Arc};
use tokio::sync::RwLock;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub metadata: BTreeMap<String, Value>,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Chunk {
    pub id: String,
    pub document_id: String,
    pub text: String,
    pub ordinal: usize,
    pub metadata: BTreeMap<String, Value>,
    pub source: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EmbeddedChunk {
    pub chunk: Chunk,
    pub embedding: Vec<f32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SearchHit {
    pub chunk: Chunk,
    pub score: f32,
    pub lexical_score: f32,
    pub semantic_score: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Citation {
    pub document_id: String,
    pub chunk_id: String,
    pub source: Option<String>,
    pub ordinal: usize,
    pub score: f32,
}

#[async_trait]
pub trait EmbeddingModel: Send + Sync {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>>;
}

#[async_trait]
pub trait VectorStore: Send + Sync {
    async fn upsert(&self, chunks: Vec<EmbeddedChunk>) -> Result<()>;
    async fn search(
        &self,
        query: &[f32],
        text: &str,
        filter: Option<&MetadataFilter>,
        limit: usize,
    ) -> Result<Vec<SearchHit>>;
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MetadataFilter {
    pub equals: BTreeMap<String, Value>,
}

impl MetadataFilter {
    fn matches(&self, metadata: &BTreeMap<String, Value>) -> bool {
        self.equals
            .iter()
            .all(|(key, expected)| metadata.get(key) == Some(expected))
    }
}

#[derive(Default)]
pub struct InMemoryVectorStore {
    chunks: RwLock<Vec<EmbeddedChunk>>,
}

#[async_trait]
impl VectorStore for InMemoryVectorStore {
    async fn upsert(&self, chunks: Vec<EmbeddedChunk>) -> Result<()> {
        let mut existing = self.chunks.write().await;
        for chunk in chunks {
            if let Some(slot) = existing
                .iter_mut()
                .find(|item| item.chunk.id == chunk.chunk.id)
            {
                *slot = chunk;
            } else {
                existing.push(chunk);
            }
        }
        Ok(())
    }

    async fn search(
        &self,
        query: &[f32],
        text: &str,
        filter: Option<&MetadataFilter>,
        limit: usize,
    ) -> Result<Vec<SearchHit>> {
        let query_terms = terms(text);
        let mut hits = self
            .chunks
            .read()
            .await
            .iter()
            .filter(|item| filter.is_none_or(|f| f.matches(&item.chunk.metadata)))
            .map(|item| {
                let semantic = cosine(query, &item.embedding);
                let lexical = lexical_score(&query_terms, &item.chunk.text);
                SearchHit {
                    chunk: item.chunk.clone(),
                    score: 0.7 * semantic + 0.3 * lexical,
                    lexical_score: lexical,
                    semantic_score: semantic,
                }
            })
            .collect::<Vec<_>>();
        hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
        hits.truncate(limit);
        Ok(hits)
    }
}

pub struct RagPipeline {
    embeddings: Arc<dyn EmbeddingModel>,
    store: Arc<dyn VectorStore>,
    chunk_size: usize,
    overlap: usize,
}

impl RagPipeline {
    pub fn new(
        embeddings: Arc<dyn EmbeddingModel>,
        store: Arc<dyn VectorStore>,
        chunk_size: usize,
        overlap: usize,
    ) -> Result<Self> {
        if chunk_size == 0 || overlap >= chunk_size {
            anyhow::bail!("chunk size must be positive and larger than overlap");
        }
        Ok(Self {
            embeddings,
            store,
            chunk_size,
            overlap,
        })
    }
    pub fn chunk(&self, document: &Document) -> Vec<Chunk> {
        let words = document.text.split_whitespace().collect::<Vec<_>>();
        let mut chunks = Vec::new();
        let mut start = 0;
        while start < words.len() {
            let end = (start + self.chunk_size).min(words.len());
            let text = words[start..end].join(" ");
            let id = format!("{}-{}", document.id, chunks.len());
            chunks.push(Chunk {
                id,
                document_id: document.id.clone(),
                text,
                ordinal: chunks.len(),
                metadata: document.metadata.clone(),
                source: document.source.clone(),
            });
            if end == words.len() {
                break;
            }
            start = end - self.overlap;
        }
        chunks
    }
    pub async fn ingest(&self, documents: &[Document]) -> Result<usize> {
        let chunks = documents
            .iter()
            .flat_map(|doc| self.chunk(doc))
            .collect::<Vec<_>>();
        let texts = chunks
            .iter()
            .map(|chunk| chunk.text.clone())
            .collect::<Vec<_>>();
        let vectors = self.embeddings.embed(&texts).await?;
        if vectors.len() != chunks.len() {
            anyhow::bail!(
                "embedding model returned {} vectors for {} chunks",
                vectors.len(),
                chunks.len()
            );
        }
        self.store
            .upsert(
                chunks
                    .into_iter()
                    .zip(vectors)
                    .map(|(chunk, embedding)| EmbeddedChunk { chunk, embedding })
                    .collect(),
            )
            .await?;
        Ok(texts.len())
    }
    pub async fn retrieve(
        &self,
        query: &str,
        filter: Option<&MetadataFilter>,
        limit: usize,
    ) -> Result<Vec<SearchHit>> {
        let vector = self
            .embeddings
            .embed(&[query.to_string()])
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("embedding model returned no vector"))?;
        self.store.search(&vector, query, filter, limit).await
    }
    pub async fn citations(
        &self,
        query: &str,
        filter: Option<&MetadataFilter>,
        limit: usize,
    ) -> Result<Vec<Citation>> {
        Ok(self
            .retrieve(query, filter, limit)
            .await?
            .into_iter()
            .map(|hit| Citation {
                document_id: hit.chunk.document_id,
                chunk_id: hit.chunk.id,
                source: hit.chunk.source,
                ordinal: hit.chunk.ordinal,
                score: hit.score,
            })
            .collect())
    }
}

fn terms(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split_whitespace()
        .map(|term| {
            term.trim_matches(|c: char| !c.is_alphanumeric())
                .to_string()
        })
        .filter(|term| !term.is_empty())
        .collect()
}
fn lexical_score(query: &[String], text: &str) -> f32 {
    let body = terms(text);
    if query.is_empty() {
        return 0.0;
    }
    query.iter().filter(|term| body.contains(term)).count() as f32 / query.len() as f32
}
fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let (dot, aa, bb) = a
        .iter()
        .zip(b)
        .fold((0.0, 0.0, 0.0), |(dot, aa, bb), (x, y)| {
            (dot + x * y, aa + x * x, bb + y * y)
        });
    if aa == 0.0 || bb == 0.0 {
        0.0
    } else {
        dot / (aa.sqrt() * bb.sqrt())
    }
}
pub fn content_hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Embeddings;
    #[async_trait]
    impl EmbeddingModel for Embeddings {
        async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
            Ok(texts
                .iter()
                .map(|text| {
                    vec![
                        if text.to_lowercase().contains("rust") {
                            1.0
                        } else {
                            0.0
                        },
                        if text.to_lowercase().contains("memory") {
                            1.0
                        } else {
                            0.0
                        },
                    ]
                })
                .collect())
        }
    }
    #[tokio::test]
    async fn ingest_retrieve_and_filter_with_citations() {
        let store = Arc::new(InMemoryVectorStore::default());
        let pipeline = RagPipeline::new(Arc::new(Embeddings), store, 4, 1).unwrap();
        let mut metadata = BTreeMap::new();
        metadata.insert("team".into(), Value::String("runtime".into()));
        pipeline
            .ingest(&[Document {
                id: "doc-1".into(),
                text: "Rust memory safety".into(),
                metadata,
                source: Some("guide.md".into()),
            }])
            .await
            .unwrap();
        let citations = pipeline.citations("Rust memory", None, 1).await.unwrap();
        assert_eq!(citations[0].source.as_deref(), Some("guide.md"));
    }
    #[test]
    fn chunking_overlaps_words() {
        let pipeline = RagPipeline::new(
            Arc::new(Embeddings),
            Arc::new(InMemoryVectorStore::default()),
            3,
            1,
        )
        .unwrap();
        let chunks = pipeline.chunk(&Document {
            id: "d".into(),
            text: "a b c d e".into(),
            metadata: BTreeMap::new(),
            source: None,
        });
        assert_eq!(chunks.len(), 2);
        assert!(chunks[1].text.starts_with("c"));
    }
}
