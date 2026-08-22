use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{path::{Path, PathBuf}, sync::Arc, time::{SystemTime, UNIX_EPOCH}};
use tokio::{fs, time::{sleep, Duration}};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DurableTask<T> {
    pub id: String,
    pub payload: T,
    pub attempts: u32,
    pub enqueued_at_ms: u128,
}

#[derive(Clone, Debug)]
pub struct PersistentTaskQueue {
    root: PathBuf,
}

impl PersistentTaskQueue {
    pub fn new(root: impl Into<PathBuf>) -> Self { Self { root: root.into() } }
    pub fn root(&self) -> &Path { &self.root }
    async fn ensure_dirs(&self) -> Result<()> {
        for name in ["pending", "processing", "completed", "failed"] { fs::create_dir_all(self.root.join(name)).await?; }
        Ok(())
    }
    pub async fn enqueue<T: Serialize>(&self, payload: T) -> Result<String> {
        self.ensure_dirs().await?;
        let id = Uuid::new_v4().to_string();
        let task = DurableTask { id: id.clone(), payload, attempts: 0, enqueued_at_ms: now_ms() };
        let temporary = self.root.join("pending").join(format!(".{id}.tmp"));
        let target = self.root.join("pending").join(format!("{id}.json"));
        fs::write(&temporary, serde_json::to_vec(&task)?).await?;
        fs::rename(temporary, target).await?;
        Ok(id)
    }
    pub async fn recover_expired<T: DeserializeOwned>(&self, lease_ms: u128) -> Result<usize> {
        self.ensure_dirs().await?;
        let mut count = 0;
        let mut entries = fs::read_dir(self.root.join("processing")).await?;
        while let Some(entry) = entries.next_entry().await? {
            let metadata = entry.metadata().await?;
            if metadata.modified().ok().and_then(|time| time.elapsed().ok()).map(|age| age.as_millis() >= lease_ms).unwrap_or(false) {
                let name = entry.file_name();
                let _ = fs::rename(entry.path(), self.root.join("pending").join(name)).await;
                count += 1;
            }
        }
        Ok(count)
    }
    pub async fn claim<T: DeserializeOwned + Serialize>(&self) -> Result<Option<DurableTask<T>>> {
        self.ensure_dirs().await?;
        let mut entries = fs::read_dir(self.root.join("pending")).await?;
        while let Some(entry) = entries.next_entry().await? {
            let name = entry.file_name();
            if !name.to_string_lossy().ends_with(".json") { continue; }
            let processing = self.root.join("processing").join(&name);
            if fs::rename(entry.path(), &processing).await.is_err() { continue; }
            let mut task: DurableTask<T> = serde_json::from_slice(&fs::read(&processing).await?).with_context(|| format!("decoding task {}", name.to_string_lossy()))?;
            task.attempts += 1;
            fs::write(&processing, serde_json::to_vec(&task)?).await?;
            return Ok(Some(task));
        }
        Ok(None)
    }
    pub async fn complete(&self, id: &str) -> Result<()> { self.move_task(id, "completed").await }
    pub async fn fail(&self, id: &str) -> Result<()> { self.move_task(id, "failed").await }
    async fn move_task(&self, id: &str, state: &str) -> Result<()> {
        let source = self.root.join("processing").join(format!("{id}.json"));
        let target = self.root.join(state).join(format!("{id}.json"));
        fs::rename(source, target).await?;
        Ok(())
    }
}

#[async_trait]
pub trait TaskWorker<T>: Send + Sync {
    async fn process(&self, task: DurableTask<T>) -> Result<()>;
}

pub struct WorkerPool<T, W> { queue: PersistentTaskQueue, worker: Arc<W>, poll_interval: Duration, _marker: std::marker::PhantomData<T> }
impl<T, W> WorkerPool<T, W> where T: DeserializeOwned + Serialize + Send + 'static, W: TaskWorker<T> + 'static {
    pub fn new(queue: PersistentTaskQueue, worker: Arc<W>, poll_interval: Duration) -> Self { Self { queue, worker, poll_interval, _marker: std::marker::PhantomData } }
    pub async fn run_once(&self) -> Result<bool> {
        let Some(task) = self.queue.claim().await? else { return Ok(false) };
        let id = task.id.clone();
        match self.worker.process(task).await { Ok(()) => self.queue.complete(&id).await?, Err(_) => self.queue.fail(&id).await? }
        Ok(true)
    }
    pub async fn run_until_idle(&self) -> Result<usize> { let mut processed = 0; while self.run_once().await? { processed += 1; } Ok(processed) }
    pub async fn run_forever(&self) -> Result<()> { loop { if !self.run_once().await? { sleep(self.poll_interval).await; } } }
}

fn now_ms() -> u128 { SystemTime::now().duration_since(UNIX_EPOCH).map(|value| value.as_millis()).unwrap_or_default() }

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    struct Worker;
    #[async_trait]
    impl TaskWorker<String> for Worker { async fn process(&self, task: DurableTask<String>) -> Result<()> { anyhow::ensure!(task.payload == "ok"); Ok(()) } }
    #[tokio::test]
    async fn queue_claim_is_atomic_and_persistent() {
        let dir = tempdir().unwrap();
        let queue = PersistentTaskQueue::new(dir.path());
        let id = queue.enqueue("ok").await.unwrap();
        let pool = WorkerPool::new(queue.clone(), Arc::new(Worker), Duration::from_millis(1));
        assert_eq!(pool.run_until_idle().await.unwrap(), 1);
        assert!(dir.path().join("completed").join(format!("{id}.json")).exists());
        assert!(queue.claim::<String>().await.unwrap().is_none());
    }
}
