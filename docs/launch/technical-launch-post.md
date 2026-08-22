# One bug, three futures: why coding agents need versioned state

Coding agents are usually asked to explore alternatives inside one mutable
working directory. A failed edit must be undone correctly, retries share
history, and the final patch often loses the evidence explaining why it won.

GenOS treats that workflow more like version control:

```text
broken world → snapshot → fork A / B / C → test each world
                                       → reject failures
                                       → restore snapshot
                                       → replay winner
                                       → merge only if gates pass
```

The distinction is not that GenOS makes a model smarter. It makes competing
executions explicit, inspectable, and replayable.

## A deliberately small proof

The repository includes a discount boundary bug and three candidate mutations.
One fails at fractional values, one applies the discount too early, and one
passes all five tests. A single command runs the entire lifecycle:

```bash
./examples/safe-debugging-demo/run-demo.sh
```

The result is intentionally modest and falsifiable. It proves directory-world
isolation, selection by an explicit gate, and replay equivalence for this
fixture. It does not prove better model reasoning, OS sandboxing, or production
merging.

## Why the evidence matters

Every operation has a structured result. The demo publishes its event stream,
branch exit codes, durations, snapshot identifiers, replay comparison, and
promotion decision. The matching Studio view reads the generated JSON rather
than rendering invented telemetry.

The repeated benchmark runs the fixture ten times and keeps every raw sample.
All ten GenOS runs replayed and passed the merge gate. It also reports that the
fixture used zero model calls, zero tokens, and $0.00—not as a cost claim, but
because no model participates in this mechanics test.

## What comes next

The next evidence step is an adapter-driven coding-agent benchmark using the
same bug set, provider usage records, and success criteria across one attempt,
sequential retry, and GenOS branching. Until that exists, the project will not
publish claims about model-quality or cost improvements.

GenOS is pre-alpha. Try the one-command proof, inspect the raw evidence, and
tell us which runtime boundary should become independently reproducible next.
