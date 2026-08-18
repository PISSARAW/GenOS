# genos-store

`genos-store` manages the persistence and querying of all artifacts in GenOS.

## Responsibilities
- Event Sourcing: Saving and retrieving `Event` streams.
- Snapshot Storage: Checkpointing and loading snapshots from disk/database.
- Replay: Reconstructing state from the event log.
- Artifacts: Blob storage for files, tool outputs, and telemetry.
