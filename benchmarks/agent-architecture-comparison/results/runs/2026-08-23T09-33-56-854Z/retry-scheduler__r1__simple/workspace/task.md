# Retry scheduler

Repair `scheduler.mjs` without changing its public API.

Jobs are ordered by descending priority, then enqueue sequence. `claim(worker,
limit)` leases eligible jobs for `leaseMs`; an expired lease may be reclaimed.
At most one live lease may exist per job. `complete(id, worker)` is idempotent
for the worker that completed it and must reject stale/foreign leases. `fail`
requeues with attempts incremented, or permanently dead-letters at
`maxAttempts`. Completing or failing an expired lease is forbidden. Duplicate
job ids are rejected without changing state. `snapshot()` must return detached
data that callers cannot mutate.

Run `node --test public.test.mjs`. Do not read files outside this task directory.
