use crate::{DurableTask, PersistentTaskQueue, TaskWorker};
use anyhow::Result;
use serde::{de::DeserializeOwned, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::{task::JoinSet, time::sleep};

/// A cooperative scheduler: several processes or machines may share the same
/// durable queue root. Atomic rename in `claim` makes a task visible to only
/// one worker at a time.
pub struct DistributedScheduler<T, W> {
    queue: PersistentTaskQueue,
    worker: Arc<W>,
    workers: usize,
    idle_delay: Duration,
    _marker: std::marker::PhantomData<T>,
}

impl<T, W> DistributedScheduler<T, W>
where
    T: DeserializeOwned + Serialize + Send + 'static,
    W: TaskWorker<T> + 'static,
{
    pub fn new(
        queue: PersistentTaskQueue,
        worker: Arc<W>,
        workers: usize,
        idle_delay: Duration,
    ) -> Self {
        Self {
            queue,
            worker,
            workers: workers.max(1),
            idle_delay,
            _marker: std::marker::PhantomData,
        }
    }

    pub async fn run_until_idle(&self) -> Result<usize> {
        let mut set = JoinSet::new();
        for _ in 0..self.workers {
            let queue = self.queue.clone();
            let worker = Arc::clone(&self.worker);
            set.spawn(async move {
                let mut processed = 0;
                loop {
                    let Some(task): Option<DurableTask<T>> = queue.claim().await? else {
                        break;
                    };
                    let id = task.id.clone();
                    match worker.process(task).await {
                        Ok(()) => queue.complete(&id).await?,
                        Err(_) => queue.fail(&id).await?,
                    }
                    processed += 1;
                }
                Result::<usize>::Ok(processed)
            });
        }
        let mut processed = 0;
        while let Some(result) = set.join_next().await {
            processed += result??;
        }
        Ok(processed)
    }

    pub async fn run_forever(&self) -> Result<()> {
        loop {
            if self.run_until_idle().await? == 0 {
                sleep(self.idle_delay).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Result;
    use async_trait::async_trait;
    use tempfile::tempdir;
    struct Worker;
    #[async_trait]
    impl TaskWorker<u32> for Worker {
        async fn process(&self, _: DurableTask<u32>) -> Result<()> {
            Ok(())
        }
    }
    #[tokio::test]
    async fn scheduler_distributes_durable_tasks() {
        let root = tempdir().unwrap();
        let queue = PersistentTaskQueue::new(root.path());
        for item in 0..4 {
            queue.enqueue(item).await.unwrap();
        }
        let scheduler =
            DistributedScheduler::new(queue, Arc::new(Worker), 2, Duration::from_millis(1));
        assert_eq!(scheduler.run_until_idle().await.unwrap(), 4);
    }
}
