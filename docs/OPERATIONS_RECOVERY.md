# GenOS Operations and Recovery Runbook

This runbook describes the supported recovery boundaries of the current runtime. It does not turn a snapshot, replay receipt, or recovery decision into a guarantee that an arbitrary model action was reproduced.

## 1. Start and health checks

1. Set `GENOS_ADMIN_PASSWORD` or `GENOS_ADMIN_TOKEN` before the first backend start.
2. Start the backend from `backend/` with `npm start`.
3. Check HTTP liveness and readiness:

```text
GET http://127.0.0.1:4000/livez
GET http://127.0.0.1:4000/readyz
```

4. Check the gRPC bridge with the configured shared secret. Plaintext gRPC must remain on loopback; a non-loopback bind requires `GENOS_GRPC_TLS_KEY` and `GENOS_GRPC_TLS_CERT`.
5. Treat a failed readiness probe or unavailable Rust binary as an operational failure. Do not interpret a stored strategy result as proof that the runtime is healthy.

## 2. SQLite backup and migration

Before changing the backend version or running a migration:

1. Stop writers or put the instance in a maintenance window.
2. Copy the database and its WAL sidecars together, or use an SQLite backup-capable tool while the database is open. The default path is controlled by `GENOS_DB_PATH`.
3. Keep the backup outside the application data directory and record the commit, schema version, and timestamp.
4. Start the backend and inspect startup logs for migration failures. Migrations are applied by `backend/src/db/schema-migrations.js`.
5. Run an application validation suite after migration. A successful migration does not validate every public JSON manifest.

If migration fails, stop the service, preserve the failing database and logs, restore the pre-migration backup, and open an incident. Do not delete `-wal` or `-shm` files selectively.

## 3. Workspace restore and rollback

Workspace restore creates a pre-restore safety snapshot before materializing the target. Use the authenticated workspace restore or rollback route with the workspace and snapshot reference. Preview first when available.

A successful restore reports both the requested snapshot and the safety snapshot. Verify the materialized file hash and run the workspace's approved test command before reopening traffic. If restore fails, preserve the error and safety snapshot; do not retry destructive operations blindly.

Release rollback through the REST release controller is currently unavailable until a deployment adapter exists. The gRPC snapshot rollback path restores a workspace snapshot only; it is not a production traffic rollback.

## 4. Worker and job recovery

Worker recovery is bounded. Inspect the persisted mission, recovery history, retry count, and terminal telemetry before dispatching another worker. When the recovery budget is exhausted, the runtime escalates instead of claiming continuity.

For queued jobs, inspect `evaluation_jobs`, `model_jobs`, and their `error_json`, `attempts`, `max_attempts`, and `next_attempt_at` fields. A dead-letter event requires operator review; requeue only after identifying whether the failure was transient, deterministic, or caused by invalid input.

## 5. Replay and evidence interpretation

`genos replay basic` validates the snapshot structure and recomputes the SHA-256 hash chain for every recorded `working_memory` step. It verifies that the recorded causal trace was not altered, but it does not re-execute arbitrary model, filesystem, network, or provider work. Trace replay only reconstructs recorded spans and exposes a replay hash; its `replayVerified` value remains false.

Never use `RECONSTRUCTED`, `simulated`, or `unsupported` results as evidence of causal reproduction. A hash-chain `VERIFIED` result proves trace integrity, not correctness of the original work. Promotion gates must receive structured evidence and an explicit human approval receipt where required.

## 6. Incident record

For every recovery operation record:

- repository commit and runtime version;
- workspace, tenant, snapshot, and job identifiers;
- command or API request used;
- health probe results;
- database backup location and integrity result;
- test output after restore;
- whether the result was applied, reconstructed, simulated, deferred, or escalated.
