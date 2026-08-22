//! Redis-backed durable task transport for workers running on separate hosts.
//!
//! Claims use `BRPOPLPUSH`, which moves an item from pending to processing
//! atomically. Acknowledgement and failure use a Lua transition, so a worker
//! cannot lose a task between removing and recording it.

use crate::{DurableTask, TaskWorker};
use anyhow::{Context, Result};
use redis::{AsyncCommands, Script};
use serde::{de::DeserializeOwned, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::time::sleep;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct RedisTaskQueue {
    client: redis::Client,
    namespace: String,
}

#[derive(Clone, Debug)]
pub struct RedisClaim<T> {
    pub task: DurableTask<T>,
    raw: String,
}

impl RedisTaskQueue {
    pub fn new(url: &str, namespace: impl Into<String>) -> Result<Self> {
        let namespace = namespace.into();
        anyhow::ensure!(!namespace.trim().is_empty(), "redis queue namespace is required");
        Ok(Self {
            client: redis::Client::open(url).context("opening Redis client")?,
            namespace,
        })
    }

    fn key(&self, state: &str) -> String {
        format!("{}:{state}", self.namespace)
    }

    async fn connection(&self) -> Result<redis::aio::MultiplexedConnection> {
        self.client
            .get_multiplexed_async_connection()
            .await
            .context("connecting to Redis")
    }

    pub async fn enqueue<T: Serialize>(&self, payload: T) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let task = DurableTask { id: id.clone(), payload, attempts: 0, enqueued_at_ms: now_ms() };
        let encoded = serde_json::to_string(&task)?;
        let mut connection = self.connection().await?;
        connection.lpush::<_, _, ()>(self.key("pending"), encoded).await.context("enqueueing Redis task")?;
        Ok(id)
    }

    pub async fn claim<T: DeserializeOwned + Serialize>(&self, timeout: Duration) -> Result<Option<RedisClaim<T>>> {
        let mut connection = self.connection().await?;
        let seconds = timeout.as_secs().clamp(1, usize::MAX as u64) as f64;
        let raw: Option<String> = redis::cmd("BRPOPLPUSH")
            .arg(self.key("pending"))
            .arg(self.key("processing"))
            .arg(seconds)
            .query_async(&mut connection)
            .await
            .context("claiming Redis task")?;
        let Some(raw) = raw else { return Ok(None); };
        let mut task: DurableTask<T> = serde_json::from_str(&raw).context("decoding Redis task")?;
        task.attempts += 1;
        Ok(Some(RedisClaim { task, raw }))
    }

    pub async fn acknowledge<T>(&self, claim: RedisClaim<T>) -> Result<()> { self.transition(&claim.raw, "completed").await }
    pub async fn fail<T>(&self, claim: RedisClaim<T>) -> Result<()> { self.transition(&claim.raw, "failed").await }

    async fn transition(&self, raw: &str, target: &str) -> Result<()> {
        let script = Script::new("local removed = redis.call('LREM', KEYS[1], 1, ARGV[1]); if removed > 0 then redis.call('LPUSH', KEYS[2], ARGV[1]); end; return removed");
        let mut connection = self.connection().await?;
        let removed: i64 = script.key(self.key("processing")).key(self.key(target)).arg(raw).invoke_async(&mut connection).await.context("transitioning Redis task")?;
        anyhow::ensure!(removed == 1, "Redis processing claim no longer exists");
        Ok(())
    }
}

pub struct RedisWorkerPool<T, W> {
    queue: RedisTaskQueue,
    worker: Arc<W>,
    poll_timeout: Duration,
    idle_delay: Duration,
    _marker: std::marker::PhantomData<T>,
}

impl<T, W> RedisWorkerPool<T, W>
where
    T: DeserializeOwned + Serialize + Send + 'static,
    W: TaskWorker<T> + 'static,
{
    pub fn new(queue: RedisTaskQueue, worker: Arc<W>, poll_timeout: Duration) -> Self {
        Self { queue, worker, poll_timeout, idle_delay: Duration::from_millis(100), _marker: std::marker::PhantomData }
    }

    pub async fn run_once(&self) -> Result<bool> {
        let Some(claim) = self.queue.claim::<T>(self.poll_timeout).await? else { return Ok(false); };
        let RedisClaim { task, raw } = claim;
        match self.worker.process(task).await {
            Ok(()) => self.queue.transition(&raw, "completed").await?,
            Err(_) => self.queue.transition(&raw, "failed").await?,
        }
        Ok(true)
    }

    pub async fn run_forever(&self) -> Result<()> {
        loop { if !self.run_once().await? { sleep(self.idle_delay).await; } }
    }
}

fn now_ms() -> u128 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|value| value.as_millis()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn redis_queue_requires_a_namespace_and_accepts_a_network_url() {
        assert!(RedisTaskQueue::new("redis://127.0.0.1:6379", "genos:workers").is_ok());
        assert!(RedisTaskQueue::new("redis://127.0.0.1:6379", "").is_err());
    }
}
