# genos-world

`genos-world` provides the on-disk substrate that backs every fork: world
providers that spin up isolated execution environments, snapshot them, diff
them, and merge deltas back into a branch.

## Responsibilities

- **World providers** — a small `WorldProvider` trait with four backends:
  `DirectoryWorldProvider` (plain directories), `GitWorktreeWorldProvider`
  (one git worktree per world), `HardlinkWorldProvider` (copy-on-write style
  hardlinks), and an `AutoWorldProvider` selector.
- **Snapshot, fork, diff, merge** — structural diffs (`WorldDiff`) and
  content-level three-way git merges that report remaining conflicts instead
  of failing silently (see `git_merge.rs`).
- **File-level isolation checks** — `check_file_isolation` and the
  `FileIsolationReport` types verify that sibling worlds cannot observe each
  other's writes.
- **OS sandboxing helpers** — `SandboxConfig` and `OsSandbox::command` build
  sandboxed child processes.

## Usage

The crate is consumed by `genos-core`, which requests worlds when forking or
replaying agents. The CLI exposes the providers through `genos world`
subcommands; see [the CLI reference](../../docs/4-interfaces/cli-reference.md).

## Tests

Isolation guarantees are enforced by an integration suite covering directory,
git-worktree, hardlink and file-isolation boundaries:

```bash
cargo test -p genos-world
```
