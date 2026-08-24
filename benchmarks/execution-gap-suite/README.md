# Execution gap suite v0

Four tasks where difficulty is computationally irreducible: no amount of
reasoning effort substitutes for actually executing an algorithm.

| Task | Mental-only feasibility | With code execution |
| --- | --- | --- |
| t1-mod-chain | 8 chained modular exponentiations, 9-digit exponents | modpow, minutes |
| t2-dijkstra-grid | weighted 20x20 shortest path, 55 walls | Dijkstra, minutes |
| t3-path-count | exact monotone-path count, 26 obstacles | DP, minutes |
| t4-underdetermined | enumerate-all / unique / inconsistent trio; punishes premature commitment AND lazy abstention | enumeration |

## Two-mode protocol

- **mental**: the answering process may not execute code. Expected to
  struggle on t1-t3 regardless of prompt quality.
- **tooling**: the answering process may execute code (e.g. through a
  `genos agent run` capsule). Expected to solve t1-t3 deterministically.

The measured quantity is the mode gap, not model intelligence: it prices
what execution access is worth on irreducible computation.

Graders recompute every ground truth from the instance files; nothing is
hardcoded. `node self-check.cjs` must stay green before any run.
