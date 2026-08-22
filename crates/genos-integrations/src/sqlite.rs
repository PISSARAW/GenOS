//! Native SQLite connector for local and embedded GenOS deployments.
use anyhow::{Context, Result};
use rusqlite::{types::ValueRef, Connection, ToSql};
use serde_json::{Map, Value};
use std::path::Path;

pub struct SqliteClient {
    connection: Connection,
}

impl SqliteClient {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Ok(Self {
            connection: Connection::open(path).context("opening SQLite database")?,
        })
    }
    pub fn open_in_memory() -> Result<Self> {
        Ok(Self {
            connection: Connection::open_in_memory()?,
        })
    }
    pub fn execute(&self, sql: &str, parameters: &[&dyn ToSql]) -> Result<usize> {
        Ok(self
            .connection
            .execute(sql, parameters)
            .with_context(|| format!("executing SQL: {sql}"))?)
    }
    pub fn query(&self, sql: &str, parameters: &[&dyn ToSql]) -> Result<Vec<Value>> {
        let mut statement = self
            .connection
            .prepare(sql)
            .with_context(|| format!("preparing SQL: {sql}"))?;
        let names = statement
            .column_names()
            .iter()
            .map(|name| name.to_string())
            .collect::<Vec<_>>();
        let rows = statement.query_map(parameters, |row| {
            let mut object = Map::new();
            for (index, name) in names.iter().enumerate() {
                object.insert(name.clone(), value_to_json(row.get_ref(index)?));
            }
            Ok(Value::Object(object))
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .context("reading SQLite rows")
    }
    pub fn transaction<F, T>(&mut self, operation: F) -> Result<T>
    where
        F: FnOnce(&rusqlite::Transaction<'_>) -> Result<T>,
    {
        let transaction = self.connection.transaction()?;
        let value = operation(&transaction)?;
        transaction.commit()?;
        Ok(value)
    }
}

fn value_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => Value::from(value),
        ValueRef::Real(value) => Value::from(value),
        ValueRef::Text(value) => Value::String(String::from_utf8_lossy(value).into_owned()),
        ValueRef::Blob(value) => Value::String(format!("base64:{}", base64(value))),
    }
}
fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in bytes.chunks(3) {
        let value = ((chunk[0] as u32) << 16)
            | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8)
            | chunk.get(2).copied().unwrap_or(0) as u32;
        result.push(TABLE[((value >> 18) & 63) as usize] as char);
        result.push(TABLE[((value >> 12) & 63) as usize] as char);
        result.push(if chunk.len() > 1 {
            TABLE[((value >> 6) & 63) as usize] as char
        } else {
            '='
        });
        result.push(if chunk.len() > 2 {
            TABLE[(value & 63) as usize] as char
        } else {
            '='
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn executes_parameterized_queries_and_returns_json() {
        let client = SqliteClient::open_in_memory().unwrap();
        client
            .execute(
                "CREATE TABLE runs (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
                &[],
            )
            .unwrap();
        client
            .execute("INSERT INTO runs (name) VALUES (?1)", &[&"durable"])
            .unwrap();
        let rows = client
            .query("SELECT id, name FROM runs WHERE name = ?1", &[&"durable"])
            .unwrap();
        assert_eq!(rows[0]["name"], "durable");
        assert_eq!(rows[0]["id"], 1);
    }
}
