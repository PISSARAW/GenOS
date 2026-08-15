---
name: coevolve-security-strategies
description: Co-evolve inheritable and mutable abstract Red Team and Blue Team genomes across isolated simulated worlds while a neutral observer measures outcomes. Use for defensive security research, controlled strategy simulation, and studying attack-defense adaptation without executing real payloads or targeting live systems.
---

# Coevolve Security Strategies

Use `genos_security_coevolution` from the GenOS MCP server.

## Workflow

1. Confirm that the environment is an authorized abstract simulation. Refuse to reinterpret this workflow as permission to attack a real system.
2. Define scenario worlds, initial Red and Blue genes, neutral metrics, seed, generation count, mutation count, mutation scale, and resource budget.
3. Use a complete `manifest`, or pass `environment` with `evolution_plan`.
4. Call `genos_security_coevolution`; use `summary` for large populations while retaining all generations in the report.
5. Inspect parent genomes, mutation metadata, observer findings, population totals, reproducibility by seed, and world/genetic lineage separation.
6. Report defensive lessons, tradeoffs, convergence or cycling, final metrics, uncertainty, and report path. Avoid operational attack instructions.

Keep observer measurements independent from Red and Blue fitness bookkeeping so the result remains auditable.
