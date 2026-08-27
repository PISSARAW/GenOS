use crate::capsule::CapsuleStore;
use crate::cas::CasStore;
use crate::event::EventStore;
use crate::snapshot::SnapshotStore;
use async_trait::async_trait;
use genos_core::ids::SnapshotId;
use genos_core::snapshot::CasHash;
use genos_core::{AgentEvent, AgentSnapshot, AgentWorldCapsule};
use sqlx::{sqlite::SqlitePool, Row};

/// SQLite-based unified store for capsules, CAS, events, and snapshots.
pub struct SqliteStore {
    pool: SqlitePool,
}

impl SqliteStore {
    /// Creates a new SqliteStore connected to the given URL (e.g. `sqlite::memory:`).
    pub async fn new(db_url: &str) -> anyhow::Result<Self> {
        let pool = SqlitePool::connect(db_url).await?;
        Self::init(&pool).await?;
        Ok(Self { pool })
    }

    /// Initializes table schemas for the store.
    async fn init(pool: &SqlitePool) -> anyhow::Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS capsules (
                id TEXT PRIMARY KEY,
                branch_id TEXT NOT NULL,
                json_data TEXT NOT NULL
            );",
        )
        .execute(pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS cas_store (
                hash TEXT PRIMARY KEY,
                data BLOB NOT NULL
            );",
        )
        .execute(pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                branch_id TEXT,
                json_data TEXT NOT NULL
            );",
        )
        .execute(pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS snapshots (
                id TEXT NOT NULL,
                json_data TEXT NOT NULL
            );",
        )
        .execute(pool)
        .await?;

        Ok(())
    }
}

#[async_trait]
impl CapsuleStore for SqliteStore {
    async fn save_capsule(&self, capsule: AgentWorldCapsule) -> anyhow::Result<()> {
        if !capsule.verify_integrity() {
            anyhow::bail!("refusing to store capsule with invalid integrity digest");
        }
        let json_data = serde_json::to_string(&capsule)?;
        sqlx::query("INSERT INTO capsules (id, branch_id, json_data) VALUES (?, ?, ?)")
            .bind(&capsule.capsule_id.0)
            .bind(&capsule.branch_id.0)
            .bind(json_data)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_capsule(&self, capsule_id: String) -> anyhow::Result<Option<AgentWorldCapsule>> {
        let row = sqlx::query("SELECT json_data FROM capsules WHERE id = ?")
            .bind(capsule_id)
            .fetch_optional(&self.pool)
            .await?;
        if let Some(r) = row {
            let json: String = r.try_get("json_data")?;
            Ok(Some(serde_json::from_str(&json)?))
        } else {
            Ok(None)
        }
    }

    async fn list_branch_capsules(
        &self,
        branch_id: String,
    ) -> anyhow::Result<Vec<AgentWorldCapsule>> {
        let rows = sqlx::query("SELECT json_data FROM capsules WHERE branch_id = ?")
            .bind(branch_id)
            .fetch_all(&self.pool)
            .await?;
        let mut res = Vec::new();
        for r in rows {
            let json: String = r.try_get("json_data")?;
            res.push(serde_json::from_str(&json)?);
        }
        Ok(res)
    }

    async fn list_all_capsules(&self) -> anyhow::Result<Vec<AgentWorldCapsule>> {
        let rows = sqlx::query("SELECT json_data FROM capsules")
            .fetch_all(&self.pool)
            .await?;
        let mut res = Vec::new();
        for r in rows {
            let json: String = r.try_get("json_data")?;
            res.push(serde_json::from_str(&json)?);
        }
        Ok(res)
    }
}

#[async_trait]
impl CasStore for SqliteStore {
    async fn put(&self, data: &[u8]) -> anyhow::Result<CasHash> {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(data);
        let hash = format!("{:x}", hasher.finalize());
        sqlx::query("INSERT OR IGNORE INTO cas_store (hash, data) VALUES (?, ?)")
            .bind(&hash)
            .bind(data)
            .execute(&self.pool)
            .await?;
        Ok(CasHash(hash))
    }

    async fn get(&self, hash: &CasHash) -> anyhow::Result<Option<Vec<u8>>> {
        let row = sqlx::query("SELECT data FROM cas_store WHERE hash = ?")
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
impl EventStore for SqliteStore {
    async fn append(&self, event: AgentEvent) -> anyhow::Result<()> {
        let branch_id = event.branch_id.as_ref().map(|b| b.0.clone());
        let json_data = serde_json::to_string(&event)?;
        sqlx::query("INSERT INTO events (branch_id, json_data) VALUES (?, ?)")
            .bind(branch_id)
            .bind(json_data)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn stream(&self, branch_id: Option<String>) -> anyhow::Result<Vec<AgentEvent>> {
        let rows = if let Some(b) = branch_id {
            sqlx::query("SELECT json_data FROM events WHERE branch_id = ? ORDER BY id ASC")
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
            let json: String = r.try_get("json_data")?;
            res.push(serde_json::from_str(&json)?);
        }
        Ok(res)
    }
}

#[async_trait]
impl SnapshotStore for SqliteStore {
    async fn load_snapshot(&self, id: &SnapshotId) -> anyhow::Result<Option<AgentSnapshot>> {
        let row =
            sqlx::query("SELECT json_data FROM snapshots WHERE id = ? ORDER BY rowid DESC LIMIT 1")
                .bind(&id.0)
                .fetch_optional(&self.pool)
                .await?;
        if let Some(r) = row {
            let json: String = r.try_get("json_data")?;
            Ok(Some(serde_json::from_str(&json)?))
        } else {
            Ok(None)
        }
    }

    async fn save_snapshot(&self, snapshot: &AgentSnapshot) -> anyhow::Result<()> {
        let json_data = serde_json::to_string(snapshot)?;
        sqlx::query("INSERT INTO snapshots (id, json_data) VALUES (?, ?)")
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

    #[tokio::test]
    async fn test_sqlite_cas() {
        let store = SqliteStore::new("sqlite::memory:").await.unwrap();
        let data = b"hello world";
        let hash = store.put(data).await.unwrap();
        let loaded = store.get(&hash).await.unwrap().unwrap();
        assert_eq!(loaded, data);
    }
}
