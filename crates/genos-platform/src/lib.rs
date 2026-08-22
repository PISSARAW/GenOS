//! Stable, provider-neutral platform primitives for GenOS.
//!
//! The implementation is deliberately local and deterministic: applications can
//! replace the embedding and judge functions without changing document, prompt,
//! citation or dataset formats.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::Path};
use thiserror::Error;

const DIMENSIONS: usize = 64;

#[derive(Debug, Error)]
pub enum PlatformError {
    #[error("document has no usable text")]
    EmptyDocument,
    #[error("unsupported document format: {0}")]
    UnsupportedFormat(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Document {
    pub id: String,
    pub source: String,
    pub title: String,
    pub content: String,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Chunk {
    pub id: String,
    pub document_id: String,
    pub source: String,
    pub text: String,
    pub ordinal: usize,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SearchHit {
    pub chunk: Chunk,
    pub score: f32,
    pub lexical_score: f32,
    pub semantic_score: f32,
    pub rank: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ClaimCitation {
    pub claim: String,
    pub source_id: String,
    pub source: String,
    pub chunk_id: String,
    pub excerpt: String,
    pub support_score: f32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct HybridIndex {
    chunks: Vec<IndexedChunk>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct IndexedChunk {
    chunk: Chunk,
    vector: Vec<f32>,
}

impl HybridIndex {
    pub fn ingest(
        &mut self,
        document: Document,
        chunk_size: usize,
        overlap: usize,
    ) -> Result<usize, PlatformError> {
        let chunks = chunk_document(&document, chunk_size, overlap)?;
        let count = chunks.len();
        self.chunks
            .extend(chunks.into_iter().map(|chunk| IndexedChunk {
                vector: embed(&chunk.text),
                chunk,
            }));
        Ok(count)
    }

    pub fn ingest_path(
        &mut self,
        path: impl AsRef<Path>,
        chunk_size: usize,
        overlap: usize,
    ) -> Result<usize, PlatformError> {
        let path = path.as_ref();
        let content = fs::read_to_string(path)?;
        let extension = path.extension().and_then(|x| x.to_str()).unwrap_or("txt");
        if !matches!(
            extension,
            "txt" | "md" | "markdown" | "json" | "yaml" | "yml" | "html"
        ) {
            return Err(PlatformError::UnsupportedFormat(extension.to_string()));
        }
        let source = path.to_string_lossy().to_string();
        let id = stable_id(&source, &content);
        self.ingest(
            Document {
                id,
                title: path
                    .file_name()
                    .and_then(|x| x.to_str())
                    .unwrap_or("document")
                    .into(),
                source,
                content,
                metadata: BTreeMap::new(),
            },
            chunk_size,
            overlap,
        )
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchHit> {
        let query_terms = terms(query);
        let query_vector = embed(query);
        let mut hits: Vec<SearchHit> = self
            .chunks
            .iter()
            .map(|item| {
                let lexical = lexical_score(&query_terms, &item.chunk.text);
                let semantic = cosine(&query_vector, &item.vector);
                SearchHit {
                    chunk: item.chunk.clone(),
                    score: 0.0,
                    lexical_score: lexical,
                    semantic_score: semantic,
                    rank: 0,
                }
            })
            .collect();
        let mut lexical_order = hits.clone();
        lexical_order.sort_by(|a, b| b.lexical_score.total_cmp(&a.lexical_score));
        let mut semantic_order = hits.clone();
        semantic_order.sort_by(|a, b| b.semantic_score.total_cmp(&a.semantic_score));
        let total = hits.len();
        for hit in &mut hits {
            let lexical_rank = lexical_order
                .iter()
                .position(|x| x.chunk.id == hit.chunk.id)
                .unwrap_or(total)
                + 1;
            let semantic_rank = semantic_order
                .iter()
                .position(|x| x.chunk.id == hit.chunk.id)
                .unwrap_or(total)
                + 1;
            hit.score = 0.55 * hit.lexical_score
                + 0.45 * hit.semantic_score
                + 0.1 / (60.0 + lexical_rank as f32)
                + 0.1 / (60.0 + semantic_rank as f32);
        }
        hits.sort_by(|a, b| b.score.total_cmp(&a.score));
        hits.truncate(limit);
        for (rank, hit) in hits.iter_mut().enumerate() {
            hit.rank = rank + 1;
        }
        hits
    }

    pub fn cite_claims(&self, claims: &[String], limit_per_claim: usize) -> Vec<ClaimCitation> {
        claims
            .iter()
            .flat_map(|claim| {
                self.search(claim, limit_per_claim)
                    .into_iter()
                    .map(|hit| ClaimCitation {
                        claim: claim.clone(),
                        source_id: hit.chunk.document_id.clone(),
                        source: hit.chunk.source.clone(),
                        chunk_id: hit.chunk.id,
                        excerpt: hit.chunk.text,
                        support_score: hit.score,
                    })
            })
            .collect()
    }

    pub fn chunks(&self) -> impl Iterator<Item = &Chunk> {
        self.chunks.iter().map(|item| &item.chunk)
    }
}

pub fn chunk_document(
    document: &Document,
    chunk_size: usize,
    overlap: usize,
) -> Result<Vec<Chunk>, PlatformError> {
    if document.content.trim().is_empty() {
        return Err(PlatformError::EmptyDocument);
    }
    let size = chunk_size.max(1);
    let step = size.saturating_sub(overlap.min(size - 1)).max(1);
    let chars: Vec<char> = document.content.chars().collect();
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + size).min(chars.len());
        let text: String = chars[start..end].iter().collect();
        chunks.push(Chunk {
            id: stable_id(&document.id, &format!("{start}:{end}")),
            document_id: document.id.clone(),
            source: document.source.clone(),
            text,
            ordinal: chunks.len(),
            metadata: document.metadata.clone(),
        });
        if end == chars.len() {
            break;
        }
        start += step;
    }
    Ok(chunks)
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PromptVersion {
    pub name: String,
    pub version: u32,
    pub template: String,
    pub labels: Vec<String>,
    pub digest: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PromptRegistry {
    prompts: BTreeMap<String, Vec<PromptVersion>>,
}

impl PromptRegistry {
    pub fn publish(
        &mut self,
        name: impl Into<String>,
        template: impl Into<String>,
        labels: Vec<String>,
    ) -> &PromptVersion {
        let name = name.into();
        let template = template.into();
        let versions = self.prompts.entry(name.clone()).or_default();
        let version = versions.last().map(|x| x.version + 1).unwrap_or(1);
        let digest = stable_id(&name, &format!("{version}:{template}"));
        versions.push(PromptVersion {
            name,
            version,
            template,
            labels,
            digest,
        });
        versions.last().expect("pushed prompt version")
    }
    pub fn get(&self, name: &str, version: Option<u32>) -> Option<&PromptVersion> {
        self.prompts
            .get(name)?
            .iter()
            .rev()
            .find(|prompt| version.map(|v| v == prompt.version).unwrap_or(true))
    }
    pub fn render(
        &self,
        name: &str,
        version: Option<u32>,
        variables: &BTreeMap<String, String>,
    ) -> Option<String> {
        let prompt = self.get(name, version)?;
        Some(
            variables
                .iter()
                .fold(prompt.template.clone(), |text, (key, value)| {
                    text.replace(&format!("{{{{{key}}}}}"), value)
                }),
        )
    }
    pub fn all(&self) -> impl Iterator<Item = &PromptVersion> {
        self.prompts.values().flat_map(|versions| versions.iter())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EvalCase {
    pub id: String,
    pub input: String,
    pub expected: String,
    #[serde(default)]
    pub claims: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EvalDataset {
    pub name: String,
    pub version: u32,
    pub cases: Vec<EvalCase>,
    pub digest: String,
}

impl EvalDataset {
    pub fn new(name: impl Into<String>, version: u32, cases: Vec<EvalCase>) -> Self {
        let name = name.into();
        let digest = stable_id(&name, &serde_json::to_string(&cases).unwrap_or_default());
        Self {
            name,
            version,
            cases,
            digest,
        }
    }
    pub fn save_json(&self, path: impl AsRef<Path>) -> Result<(), PlatformError> {
        fs::write(path, serde_json::to_vec_pretty(self)?)?;
        Ok(())
    }
    pub fn load_json(path: impl AsRef<Path>) -> Result<Self, PlatformError> {
        Ok(serde_json::from_slice(&fs::read(path)?)?)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EvalScore {
    pub case_id: String,
    pub exact_match: f32,
    pub grounded: f32,
    pub abstained: bool,
}

pub fn evaluate_response(
    case: &EvalCase,
    response: &str,
    citations: &[ClaimCitation],
) -> EvalScore {
    let exact_match = if normalize(response) == normalize(&case.expected) {
        1.0
    } else {
        0.0
    };
    let grounded = if case.claims.is_empty() {
        1.0
    } else {
        case.claims
            .iter()
            .filter(|claim| {
                citations
                    .iter()
                    .any(|citation| citation.claim == **claim && citation.support_score > 0.05)
            })
            .count() as f32
            / case.claims.len() as f32
    };
    let abstained = [
        "je ne sais pas",
        "je ne peux pas",
        "i don't know",
        "insufficient evidence",
    ]
    .iter()
    .any(|marker| normalize(response).contains(marker));
    EvalScore {
        case_id: case.id.clone(),
        exact_match,
        grounded,
        abstained,
    }
}

fn terms(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|term| term.len() > 1)
        .map(str::to_lowercase)
        .collect()
}
fn lexical_score(query: &[String], text: &str) -> f32 {
    let document = terms(text);
    if query.is_empty() {
        return 0.0;
    }
    query.iter().filter(|term| document.contains(term)).count() as f32 / query.len() as f32
}
fn embed(text: &str) -> Vec<f32> {
    let mut vector = vec![0.0; DIMENSIONS];
    for term in terms(text) {
        let mut hash = Sha256::new();
        hash.update(term.as_bytes());
        let digest = hash.finalize();
        let index = u16::from_be_bytes([digest[0], digest[1]]) as usize % DIMENSIONS;
        vector[index] += 1.0;
    }
    vector
}
fn cosine(left: &[f32], right: &[f32]) -> f32 {
    let dot: f32 = left.iter().zip(right).map(|(a, b)| a * b).sum();
    let norm_left = left.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_right = right.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_left == 0.0 || norm_right == 0.0 {
        0.0
    } else {
        dot / (norm_left * norm_right)
    }
}
fn normalize(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
fn stable_id(namespace: &str, value: &str) -> String {
    let mut hash = Sha256::new();
    hash.update(namespace.as_bytes());
    hash.update([0]);
    hash.update(value.as_bytes());
    format!("sha256:{:x}", hash.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ingestion_search_and_claim_citations_are_deterministic() {
        let doc = Document {
            id: "doc-1".into(),
            source: "guide.md".into(),
            title: "Guide".into(),
            content: "GenOS supports durable workflow replay and claim-level citations.".into(),
            metadata: BTreeMap::new(),
        };
        let mut index = HybridIndex::default();
        assert_eq!(index.ingest(doc, 32, 4).unwrap(), 3);
        let hits = index.search("durable workflow", 2);
        assert!(!hits.is_empty());
        let citations = index.cite_claims(&["workflow replay".into()], 1);
        assert_eq!(citations[0].source, "guide.md");
    }
    #[test]
    fn prompt_versions_render_and_dataset_scores_grounding() {
        let mut registry = PromptRegistry::default();
        registry.publish("answer", "Answer {{question}}", vec!["prod".into()]);
        let mut vars = BTreeMap::new();
        vars.insert("question".into(), "why?".into());
        assert_eq!(
            registry.render("answer", None, &vars).unwrap(),
            "Answer why?"
        );
        let case = EvalCase {
            id: "1".into(),
            input: "q".into(),
            expected: "yes".into(),
            claims: vec!["fact".into()],
        };
        let citation = ClaimCitation {
            claim: "fact".into(),
            source_id: "d".into(),
            source: "a".into(),
            chunk_id: "c".into(),
            excerpt: "fact".into(),
            support_score: 0.5,
        };
        assert_eq!(evaluate_response(&case, "yes", &[citation]).grounded, 1.0);
    }
}
