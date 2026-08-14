# Divergent Worlds Demo

Scenario implemented in this demo:

```text
W0 holds hello.txt = "hello"
W0 -> snapshot S0 -> fork world A, world B
A: hello.txt = "bonjour"
B: hello.txt = "hola"
```

The invariant under test:

| World | Expected `hello.txt` |
| --- | --- |
| A | `bonjour` |
| B | `hola` |
| W0 (parent) | `hello`, its pre-fork contents |

This is the file-level twin of
[`../divergent-writes-demo`](../divergent-writes-demo): same shape, but the
diverging state lives in a world on disk instead of in the agent's working
memory. No LLM call is required for this flow.

## What the script does

1. Create the parent world W0 with `world create`.
2. Write `hello.txt = "hello"` into it with `world write-file`, then take
   snapshot S0 with `world snapshot`.
3. Fork S0 into worlds A and B with `world fork --count 2`.
4. Write `bonjour` in A and `hola` in B.
5. Assert with `world check-file --expect-isolated` that A holds `bonjour`, B
   holds `hola` and W0 still holds `hello`.
6. Fork S0 **again**, after both writes, and assert the fresh world still
   materializes `hello` — the snapshot the forks came from never absorbed
   either write. Then `world diff` confirms each pair differs by exactly one
   file.

Every step is a `genos` command: the demo never touches world files directly,
so the invariants it proves are the ones the CLI actually enforces.

### PowerShell (Windows)

```powershell
.\run-demo.ps1
```

### Bash (Linux/macOS)

```bash
./run-demo.sh
```

### What to expect

- The script stops immediately on any assertion failure: `--expect-isolated`
  exits non-zero and names every broken expectation.
- Final output prints `Demo OK: W0(hello) -> A(bonjour) | B(hola)` plus the ids
  of the parent world, the snapshot and the two forks.
- Worlds and snapshots are generated under
  `.genos/demo/divergent-worlds/world/`, one directory per world id.

The demo runs the `directory` provider, which forks by copying the snapshot.
The same invariant is covered for the `git-worktree` provider by
`git_worktree_forked_worlds_write_the_same_file_differently` in
[`crates/genos-world/src/lib.rs`](../../crates/genos-world/src/lib.rs), which
skips itself when git is unavailable.

## CLI commands behind the demo

### `world write-file` / `world read-file`

Read and write a world-relative file inside one world. Paths are resolved
against that world's root and may not escape it: absolute paths and `..`
components are rejected, so a world can never address a sibling.

```bash
genos world write-file --provider directory --root .genos/demo/divergent-worlds/world \
  --world-id <WORLD_ID> --path hello.txt --contents bonjour

genos world read-file --provider directory --root .genos/demo/divergent-worlds/world \
  --world-id <WORLD_ID> --path hello.txt
```

`write-file` reports the contents it replaced in `previous_contents`, and
`created: true` when the file did not exist in that world yet.

### `world check-file`

Checks the divergence directly: each `--branch` world must still hold what it
wrote, the parent must still hold its pre-fork contents, and no two branches may
have landed on the same contents.

```bash
genos world check-file --provider directory --root .genos/demo/divergent-worlds/world \
  --path hello.txt \
  --parent <PARENT_WORLD_ID> --expect-parent hello \
  --branch <WORLD_A> --expect bonjour \
  --branch <WORLD_B> --expect hola \
  --expect-isolated
```

`--expect` is positional against `--branch`: same count, same order. Omitting it
falls back to each world's current contents, which then only checks that the
worlds diverged from each other. `--expect-parent-absent` covers the case where
the file did not exist before the fork. The report names every broken
expectation in `violations`, and `--expect-isolated` turns them into a non-zero
exit.

## Continuous integration

`.github/workflows/ci.yml` runs this scenario on every push and pull request, on
both `ubuntu-latest` and `windows-latest`, and then re-asserts on the captured
output and the generated worlds so a silently gutted script cannot pass.
