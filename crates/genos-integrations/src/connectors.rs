use crate::ApiClient;
use anyhow::Result;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone)]
pub struct SlackClient {
    api: ApiClient,
}
#[derive(Clone)]
pub struct GitHubClient {
    api: ApiClient,
}
#[derive(Clone)]
pub struct JiraClient {
    api: ApiClient,
}
#[derive(Clone)]
pub struct NotionClient {
    api: ApiClient,
}
#[derive(Clone)]
pub struct QdrantClient {
    api: ApiClient,
    collection: String,
}
#[derive(Clone)]
pub struct PineconeClient {
    api: ApiClient,
    index: String,
}

impl SlackClient {
    pub fn new(api: ApiClient) -> Self {
        Self { api }
    }
    pub async fn post_message(&self, channel: &str, text: &str) -> Result<SlackMessage> {
        self.api
            .request_json(
                Method::POST,
                "/api/chat.postMessage",
                Some(&json!({"channel":channel,"text":text})),
            )
            .await
    }
}
#[derive(Clone, Debug, Deserialize)]
pub struct SlackMessage {
    pub ok: bool,
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub ts: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

impl GitHubClient {
    pub fn new(api: ApiClient) -> Self {
        Self { api }
    }
    pub async fn repository(&self, owner: &str, repo: &str) -> Result<GitHubRepository> {
        self.api
            .request_json(Method::GET, &format!("/repos/{owner}/{repo}"), None)
            .await
    }
    pub async fn create_issue(
        &self,
        owner: &str,
        repo: &str,
        title: &str,
        body: Option<&str>,
    ) -> Result<GitHubIssue> {
        self.api
            .request_json(
                Method::POST,
                &format!("/repos/{owner}/{repo}/issues"),
                Some(&json!({"title":title,"body":body})),
            )
            .await
    }
}
#[derive(Clone, Debug, Deserialize)]
pub struct GitHubRepository {
    pub id: u64,
    pub full_name: String,
    pub html_url: String,
}
#[derive(Clone, Debug, Deserialize)]
pub struct GitHubIssue {
    pub number: u64,
    pub title: String,
    pub html_url: String,
}

impl JiraClient {
    pub fn new(api: ApiClient) -> Self {
        Self { api }
    }
    pub async fn create_issue(
        &self,
        project: &str,
        summary: &str,
        description: &str,
        issue_type: &str,
    ) -> Result<JiraIssue> {
        self.api.request_json(Method::POST, "/rest/api/3/issue", Some(&json!({"fields":{"project":{"key":project},"summary":summary,"description":{"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":description}]}]},"issuetype":{"name":issue_type}}}))).await
    }
}
impl NotionClient {
    pub fn new(api: ApiClient) -> Self { Self { api } }
    pub async fn search(&self, query: &str, page_size: usize) -> Result<NotionSearchResponse> {
        self.api.request_json(Method::POST, "/v1/search", Some(&json!({"query":query,"page_size":page_size}))).await
    }
    pub async fn create_page(&self, parent: Value, properties: Value, children: Option<Value>) -> Result<NotionPage> {
        self.api.request_json(Method::POST, "/v1/pages", Some(&json!({"parent":parent,"properties":properties,"children":children}))).await
    }
}
#[derive(Clone, Debug, Deserialize)]
pub struct NotionSearchResponse { pub results: Vec<NotionPage>, #[serde(default)] pub has_more: bool, #[serde(default)] pub next_cursor: Option<String> }
#[derive(Clone, Debug, Deserialize)]
pub struct NotionPage { pub id: String, #[serde(default)] pub url: Option<String>, #[serde(default)] pub object: Option<String> }
#[derive(Clone, Debug, Deserialize)]
pub struct JiraIssue {
    pub id: String,
    pub key: String,
    pub self_url: Option<String>,
}

impl QdrantClient {
    pub fn new(api: ApiClient, collection: impl Into<String>) -> Self {
        Self {
            api,
            collection: collection.into(),
        }
    }
    pub async fn upsert(&self, points: &[QdrantPoint]) -> Result<Value> {
        self.api
            .request_json(
                Method::PUT,
                &format!("/collections/{}/points", self.collection),
                Some(&json!({"points":points})),
            )
            .await
    }
    pub async fn search(
        &self,
        vector: &[f32],
        limit: usize,
        filter: Option<Value>,
    ) -> Result<Vec<QdrantHit>> {
        let response: QdrantSearchResponse = self
            .api
            .request_json(
                Method::POST,
                &format!("/collections/{}/points/search", self.collection),
                Some(&json!({"vector":vector,"limit":limit,"with_payload":true,"filter":filter})),
            )
            .await?;
        Ok(response.result)
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct QdrantPoint {
    pub id: Value,
    pub vector: Vec<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}
#[derive(Clone, Debug, Deserialize)]
struct QdrantSearchResponse {
    result: Vec<QdrantHit>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct QdrantHit {
    pub id: Value,
    pub score: f32,
    pub payload: Option<Value>,
}

impl PineconeClient {
    pub fn new(api: ApiClient, index: impl Into<String>) -> Self {
        Self {
            api,
            index: index.into(),
        }
    }
    pub async fn upsert(
        &self,
        vectors: &[PineconeVector],
        namespace: Option<&str>,
    ) -> Result<Value> {
        self.api
            .request_json(
                Method::POST,
                &format!("/vectors/upsert"),
                Some(&json!({"vectors":vectors,"namespace":namespace})),
            )
            .await
    }
    pub async fn query(
        &self,
        vector: &[f32],
        top_k: usize,
        namespace: Option<&str>,
    ) -> Result<PineconeQueryResponse> {
        self.api.request_json(Method::POST, "/query", Some(&json!({"vector":vector,"topK":top_k,"namespace":namespace,"includeMetadata":true}))).await
    }
    pub fn index(&self) -> &str {
        &self.index
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct PineconeVector {
    pub id: String,
    pub values: Vec<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct PineconeQueryResponse {
    pub matches: Vec<PineconeMatch>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct PineconeMatch {
    pub id: String,
    pub score: f32,
    pub metadata: Option<Value>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Auth;
    #[test]
    fn connector_clients_preserve_configuration() {
        let api = ApiClient::new("https://example.test", Auth::None, 10);
        let pinecone = PineconeClient::new(api, "agents");
        assert_eq!(pinecone.index(), "agents");
        let point = QdrantPoint {
            id: json!(1),
            vector: vec![1.0],
            payload: None,
        };
        assert_eq!(point.vector, vec![1.0]);
        let notion = NotionPage { id: "page".into(), url: None, object: Some("page".into()) };
        assert_eq!(notion.object.as_deref(), Some("page"));
    }
}
