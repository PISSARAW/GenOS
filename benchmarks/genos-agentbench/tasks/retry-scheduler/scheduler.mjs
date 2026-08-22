export function createScheduler({ now, leaseMs = 1000, maxAttempts = 3 }) {
  const jobs = new Map();
  let sequence = 0;
  return {
    enqueue(id, payload, priority = 0) {
      jobs.set(id, { id, payload, priority, sequence: sequence++, attempts: 0, status: 'queued' });
    },
    claim(worker, limit = 1) {
      return [...jobs.values()].filter((job) => job.status === 'queued').slice(0, limit).map((job) => {
        job.status = 'leased'; job.worker = worker; job.leaseUntil = now() + leaseMs; return job;
      });
    },
    complete(id) { jobs.get(id).status = 'completed'; },
    fail(id) { jobs.get(id).status = 'queued'; },
    snapshot() { return [...jobs.values()]; },
  };
}
