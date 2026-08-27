use async_trait::async_trait;
use sqlx::{postgres::PgPool, Row};
use genos_core::{AgentEvent, AgentWorldCapsule, AgentSnapshot};
use genos_core::ids::SnapshotId;
use genos_core::snapshot::CasHash;
use crate::cas::CasStore;
use crate::capsule::CapsuleStore;
use crate::event::EventStore;
use crate::snapshot::SnapshotStore;

/// Postgres-based unified store for capsules, CAS, events, and snapshots.
pub struct PostgresStore {
    pool: PgPool,
}

impl PostgresStore {
    /// Creates a new PostgresStore connected to the given URL.
    pub async fn new(db_url: &str) -> anyhow::Result<Self> {
        let pool = PgPool::connect(db_url).await?;
        Self::init(&pool).await?;
        Ok(Self { pool })
    }

    /// Initializes table schemas for the store.
    async fn init(pool: &PgPool) -> anyhow::Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS capsules (
                id TEXT PRIMARY KEY,
                branch_id TEXT NOT NULL,
                json_data JSONB NOT NULL
            );"
        ).execute(pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS cas_store (
                hash TEXT PRIMARY KEY,
                data BYTEA NOT NULL
            );"
        ).execute(pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                branch_id TEXT,
                json_data JSONB NOT NULL
            );"
        ).execute(pool).await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS snapshots (
                seq SERIAL PRIMARY KEY,
                id TEXT NOT NULL,
                json_data JSONB NOT NULL
            );"
        ).execute(pool).await?;

        Ok(())
    }
}

#[async_trait]
impl CapsuleStore for PostgresStore {
    async fn save_capsule(&self, capsule: AgentWorldCapsule) -> anyhow::Result<()> {
        if !capsule.verify_integrity() {
            anyhow::bail!("refusing to store capsule with invalid integrity digest");
        }
        let json_data = serde_json::to_value(&capsule)?;
        sqlx::query("INSERT INTO capsules (id, branch_id, json_data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING")
            .bind(&capsule.capsule_id.0)
            .bind(&capsule.branch_id.0)
            .bind(json_data)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_capsule(&self, capsule_id: String) -> anyhow::Result<Option<AgentWorldCapsule>> {
        let row = sqlx::query("SELECT json_data FROM capsules WHERE id = $1")
            .bind(capsule_id)
            .fetch_optional(&self.pool)
            .await?;
        if let Some(r) = row {
            let json: serde_json::Value = r.try_get("json_data")?;
            Ok(Some(serde_json::from_value(json)?))
        } else {
            Ok(None)
        }
    }

    async fn list_branch_capsules(&self, branch_id: String) -> anyhow::Result<Vec<AgentWorldCapsule>> {
        let rows = sqlx::query("SELECT json_data FROM capsules WHERE branch_id = $1")
            .bind(branch_id)
            .fetch_all(&self.pool)
            .await?;
        let mut res = Vec::new();
        for r in rows {
            let json: serde_json::Value = r.try_get("json_data")?;
            res.push(serde_json::from_value(json)?);
        }
        Ok(res)
    }

    async fn list_all_capsules(&self) -> anyhow::Result<Vec<AgentWorldCapsule>> {
        let rows = sqlx::query("SELECT json_data FROM capsules")
            .fetch_all(&self.pool)
            .await?;
        let mut res = Vec::new();
        for r in rows {
            let json: serde_json::Value = r.try_get("json_data")?;
            res.push(serde_json::from_value(json)?);
        }
        Ok(res)
    }
}

#[async_trait]
impl CasStore for PostgresStore {
    async fn put(&self, data: &[u8]) -> anyhow::Result<CasHash> {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(data);
        let hash = format!("{:x}", hasher.finalize());
        sqlx::query("INSERT INTO cas_store (hash, data) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING")
            .bind(&hash)
            .bind(data)
            .execute(&self.pool)
            .await?;
        Ok(CasHash(hash))
    }

    async fn get(&self, hash: &CasHash) -> anyhow::Result<Option<Vec<u8>>> {
        let row = sqlx::query("SELECT data FROM cas_store WHERE hash = $1")
            .bind(&hash.0)
            .fetch_optional(&self.pool)
            .await?;
        if let Some(r) = row {
            Ok(Some(r.try_get("data")?))
        } else {
            Ok(None)
        }
    }
}

#[async_trait]
impl EventStore for PostgresStore {
    async fn append(&self, event: AgentEvent) -> anyhow::Result<()> {
        let branch_id = event.branch_id.as_ref().map(|b| b.0.clone());
        let json_data = serde_json::to_value(&event)?;
        sqlx::query("INSERT INTO events (branch_id, json_data) VALUES ($1, $2)")
            .bind(branch_id)
            .bind(json_data)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn stream(&self, branch_id: Option<String>) -> anyhow::Result<Vec<AgentEvent>> {
        let rows = if let Some(b) = branch_id {
            sqlx::query("SELECT json_data FROM events WHERE branch_id = $1 ORDER BY id ASC")
                .bind(b)
                .fetch_all(&self.pool)
                .await?
        } else {
            sqlx::query("SELECT json_data FROM events ORDER BY id ASC")
                .fetch_all(&self.pool)
                .await?
        };
        let mut res = Vec::new();
        for r in rows {
            let json: serde_json::Value = r.try_get("json_data")?;
            res.push(serde_json::from_value(json)?);
        }
        Ok(res)
    }
}

#[async_trait]
impl SnapshotStore for PostgresStore {
    async fn load_snapshot(&self, id: &SnapshotId) -> anyhow::Result<Option<AgentSnapshot>> {
        let row = sqlx::query("SELECT json_data FROM snapshots WHERE id = $1 ORDER BY seq DESC LIMIT 1")
            .bind(&id.0)
            .fetch_optional(&self.pool)
            .await?;
        if let Some(r) = row {
            let json: serde_json::Value = r.try_get("json_data")?;
            Ok(Some(serde_json::from_value(json)?))
        } else {
            Ok(None)
        }
    }

    async fn save_snapshot(&self, snapshot: &AgentSnapshot) -> anyhow::Result<()> {
        let json_data = serde_json::to_value(snapshot)?;
        sqlx::query("INSERT INTO snapshots (id, json_data) VALUES ($1, $2)")
            .bind(&snapshot.snapshot_id.0)
            .bind(json_data)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn list_snapshot_ids(&self) -> anyhow::Result<Vec<String>> {
        let rows = sqlx::query("SELECT DISTINCT id FROM snapshots")
            .fetch_all(&self.pool)
            .await?;
        let mut res = Vec::new();
        for r in rows {
            res.push(r.try_get("id")?);
        }
        Ok(res)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Skip testing postgres locally if db url is not provided, since we can't reliably have a postgres instance.
    #[ignore]
    #[tokio::test]
    async fn test_postgres_cas() {
        let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://localhost/test".into());
        let store = PostgresStore::new(&db_url).await.unwrap();
        let data = b"hello pg";
        let hash = store.put(data).await.unwrap();
        let loaded = store.get(&hash).await.unwrap().unwrap();
        assert_eq!(loaded, data);
    }
}
