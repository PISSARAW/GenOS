# Évolution et Biomimétisme (Génétique d'Agents)

Les prototypes de GenOS révèlent l'implémentation littérale de concepts génétiques, permettant d'orienter le comportement des agents par l'évolution de leurs traits, plutôt que par des instructions de prompt strictes.

## Mutation Phénotypique (`agent mutate`)

Au lieu de saturer le prompt (RAG) avec des instructions, GenOS altère les *drives* du génome de l'agent.
Par exemple, une mutation `risk_tolerance=-0.15` force l'agent à écrire des tests unitaires avant de toucher au code de production, tandis que `syntax_strictness=0.40` ajuste son respect d'un linter, sans aucun changement de prompt.

**CLI :**
```bash
genos agent mutate <agent_id> --trait <trait_name> --delta <value>
```

## Recombinaison/Élevage (`agent breed`)

GenOS peut fusionner les traits de deux génomes distincts (ex: un Expert Sécurité et un Expert Performance) pour produire un enfant-agent intrinsèquement capable de gérer les deux contraintes simultanément. Cela évite le "ping-pong" inefficace entre de multiples agents spécialisés.

**CLI :**
```bash
genos agent breed <agent1_id> <agent2_id>
```

## Budgeted Branch Evolution

Un planificateur limite les unités de calcul et alloue un budget proportionnel aux scores des branches "vivantes" à travers plusieurs générations de forks.

**CLI :**
```bash
genos experiment branch-evolution <manifest.yaml>
```
