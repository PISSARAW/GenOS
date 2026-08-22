# Safe parallel debugging in one command

This is the shortest executable explanation of GenOS:

```bash
./examples/safe-debugging-demo/run-demo.sh
```

The demo reproduces a boundary bug, snapshots the failing world, forks three
candidate fixes, runs the same five tests inside each isolated world, restores
the baseline, replays the only winning mutation, and promotes it only when the
replay matches the winner exactly.

Evidence is written to [`artifacts/latest.json`](artifacts/latest.json) and the
append-only operation trace to [`artifacts/events.jsonl`](artifacts/events.jsonl).
The demo performs no model call, so its measured token use and model cost are
both exactly zero. It proves GenOS mechanics, not model quality.
