//! StorageEvolutionGate — utilitaires SQLite pour les benchmarks criterion.
//!
//! Le crate expose une façade minimale `StorageEngine` qui encapsule une
//! connexion SQLite en mémoire et fournit les helpers de setup utilisés par
//! `benches/storage_evolution.rs`. Les benchmarks criterion eux-mêmes
//! résident dans `benches/` (harness = false).

use rusqlite::{Connection, Result};

/// Moteur de stockage SQLite en mémoire, utilisé comme référence OLTP/OLAP
/// dans les benchmarks de promotion de capacité.
pub struct StorageEngine {
    conn: Connection,
}

impl StorageEngine {
    /// Ouvre une connexion SQLite en mémoire.
    pub fn open_in_memory() -> Result<Self> {
        Ok(Self { conn: Connection::open_in_memory()? })
    }

    /// Accès direct à la connexion sous-jacente.
    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    /// Crée la table `agents` et la remplit avec `count` lignes.
    pub fn setup_agents(&self, count: usize) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, status TEXT, tokens REAL)",
            [],
        )?;
        for i in 0..count {
            self.conn.execute(
                "INSERT INTO agents (id, name, status, tokens) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![format!("agent_{}", i), "test", "active", i as f64 * 100.0],
            )?;
        }
        Ok(())
    }

    /// Crée la table `telemetry` et la remplit avec `count` lignes.
    pub fn setup_telemetry(&self, count: usize) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE telemetry (id INTEGER PRIMARY KEY, agent_id TEXT, tokens REAL, cost REAL, created_at TEXT)",
            [],
        )?;
        for i in 0..count {
            self.conn.execute(
                "INSERT INTO telemetry (agent_id, tokens, cost, created_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![format!("agent_{}", i % 100), i as f64, i as f64 * 0.01, "2026-09-23"],
            )?;
        }
        Ok(())
    }

    /// Crée la table `edges` (graphe) et insère `count` arêtes linéaires.
    pub fn setup_graph(&self, count: usize) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE edges (source TEXT, target TEXT, weight REAL)",
            [],
        )?;
        for i in 0..count {
            self.conn.execute(
                "INSERT INTO edges (source, target, weight) VALUES (?1, ?2, ?3)",
                rusqlite::params![format!("node_{}", i), format!("node_{}", i + 1), 1.0],
            )?;
        }
        Ok(())
    }

    /// Crée la table `vectors` avec `count` vecteurs de dimension `dim` (f32).
    pub fn setup_vectors(&self, count: usize, dim: usize) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE vectors (id TEXT PRIMARY KEY, embedding BLOB)",
            [],
        )?;
        let vec: Vec<f32> = (0..dim).map(|i| i as f32 / dim as f32).collect();
        let blob = unsafe { std::slice::from_raw_parts(vec.as_ptr() as *const u8, vec.len() * 4) };
        for i in 0..count {
            self.conn.execute(
                "INSERT INTO vectors (id, embedding) VALUES (?1, ?2)",
                rusqlite::params![format!("vec_{}", i), blob],
            )?;
        }
        Ok(())
    }
}

impl Default for StorageEngine {
    fn default() -> Self {
        Self::open_in_memory().expect("in-memory SQLite connection")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_agents_inserts_rows() {
        let engine = StorageEngine::open_in_memory().unwrap();
        engine.setup_agents(10).unwrap();
        let count: i64 = engine
            .connection()
            .query_row("SELECT COUNT(*) FROM agents", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 10);
    }

    #[test]
    fn default_engine_is_usable() {
        let engine = StorageEngine::default();
        engine.setup_graph(5).unwrap();
        let count: i64 = engine
            .connection()
            .query_row("SELECT COUNT(*) FROM edges", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 5);
    }
}
