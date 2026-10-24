# GenOS Capability Inheritance (GCI)

**Statut : MVP Linked implémenté — contrats, export explicite, résolution, persistance, API et CLI disponibles.** La qualification de bout en bout sur un projet pilote reste à faire.

GCI sépare la découverte d'une capacité de son export, de son adoption et de son exécution. Le graphe de capacités reste la source de connaissance interne; seuls des descripteurs publiés dans `gci_capability_exports` sont découvrables par un consommateur.

## Contrats

- `spec/gci/capability.schema.json` décrit une capacité exportable et son empreinte d'implémentation.
- `spec/gci/project.schema.json` décrit les capacités, modes et permissions demandés par un projet.
- `spec/gci/lockfile.schema.json` épingle le graphe résolu, les digests et l'autorité effective.

Le résolveur accepte les dépendances transitives exactes. Il refuse les exports absents, les cycles, les capacités seulement déclarées, les modes non publiés et toute permission demandée qui n'est pas à la fois déclarée par la capacité et accordée au projet. L'autorité effective d'une dépendance transitive est contrôlée de la même manière.

## Persistance et exécution

La migration `154-gci-capability-inheritance` crée les tables d'exports, de liaisons, d'installations et de journal d'événements. Les écritures d'installation exigent une révision attendue et lient les reçus au projet et au digest du graphe.

L'adaptateur Linked relit l'installation et l'export actif à chaque appel, vérifie l'empreinte et recalcule l'autorité du projet via le callback d'intégration, puis inscrit un reçu d'invocation. Il ne fournit pas de handler par défaut : seuls les handlers explicitement injectés par l'intégrateur peuvent s'exécuter.

L'API REST est montée sous `/api/gci/v1` : découverte et inspection des exports, liaison d'un projet, résolution, adoption transactionnelle, état et révocation. Les routes passent par les middlewares d'authentification, de portée tenant, de permission et de limitation de débit existants. Chaque mutation vérifie le projet et les révisions attendues; les révocations de dépendances transitives bloquent les prochains appels Linked.

La CLI Node expose `discover`, `inspect` et `validate` localement, ainsi que `link`, `plan`, `adopt`, `status` et `revoke` via l'API. Les commandes distantes exigent `GENOS_API_URL`, `GENOS_API_TOKEN`, `--organization` et `--project`. Elles utilisent les mêmes routes et contrôles d'autorité que les appels REST. Les modes Embedded et Managed, l'upgrade planifié, la propagation d'évolution et l'exposition MCP ne sont pas livrés.
