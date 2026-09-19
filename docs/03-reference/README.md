# 03 — Référence technique

Contrats et surfaces exposées par GenOS. Ces documents décrivent des interfaces
stables (REST, gRPC, MCP, CLI) et le modèle de données.

- [api-et-contrats.md](api-et-contrats.md) — REST, gRPC, MCP, CLI, compatibilité, erreurs.
- [outils-mcp.md](outils-mcp.md) — catalogue d'outils, leases, gating, permissions.
- [persistance-et-donnees.md](persistance-et-donnees.md) — SQLite, tables, intégrité, stockage.
- [modeles-et-providers.md](modeles-et-providers.md) — providers, routing, coûts, local/remote.
- [integrations-ide.md](integrations-ide.md) — contrat IDE `genos.ide/v1`.
- [preuves-produit-et-safe-debugging.md](preuves-produit-et-safe-debugging.md) — preuves backend et safe debugging.
- [contrat-produit-et-completude.md](contrat-produit-et-completude.md) — périmètre, statuts, preuves et plateformes de la version complète.
- [pont-rust-et-hallucinations.md](pont-rust-et-hallucinations.md) — bridge REST vers `genos-cli`, replay et hallucinations.
- [ecologie-et-systemes-vivants.md](ecologie-et-systemes-vivants.md) — bus zero-texte, primitives écologiques, HGT, stigmergie, électrocytes, organisations dynamiques.
- [registre-philosophique.md](registre-philosophique.md) — concepts, relations, mappings, maturité et garde-fous.
- [notifications-et-alertes.md](notifications-et-alertes.md) — préférences et alertes tenant-scoped.
- [qualite-code-et-complexite.md](qualite-code-et-complexite.md) — seuils, périmètre et audit strict de la qualité du code.

## Spécifications normatives

Les specs du format AgentDNA vivent hors de `docs/`, sous [`../../spec/`](../../spec) :

- [`spec/AGENT_DNA_SPEC.md`](../../spec/AGENT_DNA_SPEC.md) — format binaire héréditaire.
- [`spec/GENOME_SPEC.md`](../../spec/GENOME_SPEC.md) — manifeste portable `AgentGenome`.

## Voir aussi

- [../04-exploitation/README.md](../04-exploitation/README.md) — mise en œuvre opérationnelle.
- [../README.md](../README.md) — hub général.
