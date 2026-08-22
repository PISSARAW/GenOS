# Community launch copy

These drafts intentionally lead with one reproducible problem rather than the
number of internal modules.

## Hacker News

**Title:** Show HN: GenOS – Git-like branching and deterministic replay for AI-agent state

**Text:** Coding agents usually try alternative fixes in one mutable timeline.
GenOS snapshots a failing filesystem world, forks candidate fixes, runs the same
tests in isolation, replays the winner from the original snapshot, and promotes
it only when the replay matches. The repository includes a one-command fixture,
raw JSON/JSONL evidence, a Studio visualization, and a 10-run benchmark with
explicit limitations. It is Rust, Apache-2.0, and pre-alpha. I would especially
value criticism of the world-isolation and replay boundaries.

## Reddit

**Title:** I built a reproducible “three futures” debugging demo for coding agents

**Text:** One boundary bug, three isolated candidate fixes, one test winner. The
interesting part is that the winner is then restored from the original snapshot
and replayed before a merge gate approves it. Everything is local and the demo
uses no LLM key. Raw events, durations, tokens/cost, limitations, Docker Studio,
and the command are in the repo. This proves execution mechanics, not smarter AI;
feedback on what a fair model-backed comparison should measure is welcome.

## X / LinkedIn

One bug. Three futures. One verified fix.

GenOS now has a one-command coding-agent state demo: snapshot the broken world,
fork 3 fixes, test them in isolation, replay the winner, merge only if the gates
pass. Raw evidence + Studio + 10-run benchmark, with no inflated model claims.

## Response checklist

- answer installation failures with exact platform commands;
- turn reproducible defects into minimal issues within one day;
- link to raw evidence when a claim is questioned;
- label roadmap ideas separately from implemented behavior;
- publish follow-up fixes as small alpha releases rather than silent changes.
