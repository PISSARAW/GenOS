# GenOS Capability Inheritance (GCI)

**Statut : Partiel — contrats, export explicite, résolution et invocation Linked disponibles.**

GCI sépare la découverte d'une capacité de son export, de son adoption et de son exécution. Le graphe de capacités reste la source de connaissance interne; seuls des descripteurs publiés dans `gci_capability_exports` sont découvrables par un consommateur.

## Contrats

- `spec/gci/capability.schema.json` décrit une capacité exportable et son empreinte d'implémentation.
- `spec/gci/project.schema.json` décrit les capacités, modes et permissions demandés par un projet.
- `spec/gci/lockfile.schema.json` épingle le graphe résolu, les digests et l'autorité effective.

Le résolveur accepte les dépendances transitives exactes. Il refuse les exports absents, les cycles, les capacités seulement déclarées, les modes non publiés et toute permission demandée qui n'est pas à la fois déclarée par la capacité et accordée au projet. L'autorité effective d'une dépendance transitive est contrôlée de la même manière.

## Persistance et exécution

La migration `154-gci-capability-inheritance` crée les tables d'exports, de liaisons, d'installations et de journal d'événements. Les écritures d'installation exigent une révision attendue et lient les reçus au projet et au digest du graphe.

L'adaptateur Linked relit l'installation et l'export actif à chaque appel, vérifie l'empreinte et recalcule l'autorité du projet via le callback d'intégration, puis inscrit un reçu d'invocation. Il ne fournit pas de handler par défaut : seuls les handlers explicitement injectés par l'intégrateur peuvent s'exécuter.

La CLI Node expose `discover`, `inspect` et `validate`. Les commandes `link`, `plan`, `status`, `upgrade` et `revoke` avec une authentification tenant-aware restent à intégrer aux interfaces de contrôle backend. Les modes Embedded et Managed ainsi que la propagation d'évolution ne sont pas livrés.
