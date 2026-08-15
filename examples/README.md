# GenOS examples

The examples are executable proofs, integration scenarios, and research prototypes. Start with the isolation demos, then choose a workflow by topic.

## Start here

| Example | Demonstrates |
| --- | --- |
| [Counterfactual demo](counterfactual-demo/) | Clone without an LLM, distinct identities, isolated streams, and empty logical diffs |
| [Divergent writes](divergent-writes-demo/) | Independent branch state and memory after a common snapshot |
| [Divergent worlds](divergent-worlds-demo/) | Filesystem isolation between a parent world and two forks |
| [Snapshot restore](snapshot-restore-demo/) | Snapshot persistence and restoration |
| [Snapshot timeline](snapshot-timeline-demo/) | Ordered snapshot history and inspection |

These demos include Bash and PowerShell runners and are suitable for a first local verification.

## Counterfactual execution and evaluation

- [Calculator experiment](calculator-counterfactual-demo/) — compare code branches against tests
- [Branch hypotheses](branch-hypothesis-demo/) — retain the hypothesis behind each branch
- [Counterfactual evaluation](counterfactual-evaluation-demo/) — score branch outcomes
- [Multi-objective evaluation](multi-objective-evaluation-demo/) — preserve multiple objective scores
- [Pareto selection](pareto-selection-demo/) — identify dominated and non-dominated branches
- [Winner takes branch](winner-takes-branch-demo/) — explicit winner promotion
- [Cognitive merge](cognitive-merge-demo/) — reconcile evidence without unioning memories
- [Branch evolution](branch-evolution-demo/) — allocate budget and recursively split survivors

## Genome, phenotype, and heredity

- [Genome mutation](genome-mutation-demo/)
- [Reversible genome mutation](reversible-genome-mutation-demo/)
- [Genome and phenotype](genome-phenotype-demo/)
- [Nature vs experience](nature-vs-experience-demo/)
- [Integrated genome counterfactual cycle](genome-counterfactual-cycle/)

## Beliefs, memory, provenance, and lineage

- [Belief update](belief-update-demo/)
- [Belief contradiction](belief-contradiction-demo/)
- [Belief provenance](belief-provenance-demo/)
- [Recursive fork lineage](recursive-fork-lineage-demo/)
- [Nearest common ancestor](nearest-common-ancestor-demo/)
- [Causation chains](causation-chain-demo/)
- [Event correlation](event-correlation-demo/)

## Reproducibility and storage

- [Model reproducibility](model-reproducibility-demo/)
- [Snapshot deduplication](snapshot-deduplication-demo/)
- [Artifact deduplication](artifact-deduplication-demo/)
- [Personal causal replay](personal-causal-replay/)
- [Retroactive exploration](retroactive-exploration-demo/)

## Tools and permissions

- [Tool execution](tool-execution-demo/)
- [Tool failure](tool-failure-demo/)
- [Tool permissions](tool-permission-demo/)
- [Controlled permissions](controlled-permissions-demo/)

## End-to-end research scenarios

- [Adaptive incident search](adaptive-incident-search/)
- [Unknown-cause bug investigation](unknown-cause-bug/)
- [Extreme critical-system refactor](extreme-refactor-experiment/)
- [Temporal causal simulator](temporal-causal-simulator/)
- [Scientific compression research](scientific-compression-research/)
- [Security co-evolution](security-coevolution/)

Each example README states its goal and invocation. Examples may exercise experimental APIs that can change before `0.1.0`.
