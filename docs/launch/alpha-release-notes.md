# GenOS v0.0.1-alpha.1

GenOS is an experimental runtime for Git-like branching and deterministic
replay of AI-agent state. This first alpha turns that idea into a downloadable,
auditable product proof.

## The 90-second story

A coding workflow encounters a boundary bug. GenOS captures the failing world,
forks three candidate fixes, runs the same tests in isolated directories,
rejects two candidates, restores the original snapshot, replays the winner,
and approves promotion only when the replay matches.

```bash
./examples/safe-debugging-demo/run-demo.sh
```

The raw events, measured durations, tokens, cost, replay result, and merge
decision are stored under `examples/safe-debugging-demo/artifacts/` and rendered
in Studio's **Safe Parallel Debugging** view.

## Included

- CLI binaries for Linux x86_64, macOS Intel, macOS Apple Silicon, and Windows
  x86_64;
- SHA-256 checksums and build provenance in every archive;
- snapshot, fork, isolated directory execution, diff, replay, and conditional
  promotion primitives;
- a local Docker Compose stack for the Studio frontend and backend;
- an authenticated local admin bootstrap with no compiled default secret;
- a ten-run deterministic benchmark with raw samples and explicit limitations.

## Verification

Download the archive and `SHA256SUMS.txt`, then verify the checksum before
extracting it. Every binary should print:

```text
genos 0.0.1
```

## Alpha limitations

- Interfaces may change before `0.1.0`.
- Directory worlds isolate relative files, not hostile processes, networks, or
  arbitrary absolute paths.
- The safe-debugging fixture invokes no language model; its measured token use
  and model cost are therefore zero and do not predict real-agent cost.
- macOS archives are not signed or notarized. Follow the documented Gatekeeper
  inspection steps before choosing whether to run an alpha binary.
- The Docker stack is for local evaluation, not multi-user production use.

Please open focused issues with the exact command, platform, raw output, and
expected result.
