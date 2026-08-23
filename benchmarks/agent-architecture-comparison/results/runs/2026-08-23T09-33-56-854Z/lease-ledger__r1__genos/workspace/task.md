# Lease ledger

Repair `ledger.mjs` without changing its public API.

`applyBatch(events)` must be atomic, exactly-once by event id, deterministic for
out-of-order input, and reject id collisions. Events have `id`, `account`,
`delta`, and a positive integer `version`. For each account, unseen events at or
below the committed version are stale and ignored. New events are applied in
version order. A batch that references an unknown account, contains invalid
data, collides with an existing id using a different payload, skips a version,
or makes a balance negative must leave all state unchanged. Replaying an
identical committed event is a no-op. Return the ids newly committed.

Run `node --test public.test.mjs`. Do not read files outside this task directory.
