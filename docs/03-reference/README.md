# 03 — Référence technique

- [Studio : contrat directeur de la cible](studio-contrat-directeur.md) — STUDIO-TARGET-V1, usages unifiés, zones Z00–Z20, couverture et critères de fin ; pas une certification de livraison.
- [Studio : parcours et acceptation](studio-parcours-et-acceptation.md) — huit lots, contrats et critères vérifiables.

Contrats et surfaces exposées par GenOS. Ces documents décrivent des interfaces
stables (REST, gRPC, MCP, CLI) et le modèle de données.

- [api-et-contrats.md](api-et-contrats.md) — REST, gRPC, MCP, CLI, compatibilité, erreurs.
- [exploitation-shev.md](exploitation-shev.md) — contrats signés, capteurs, actions métier, récupération et évaluation SHEV.
- [types-de-workers.md](types-de-workers.md) — catalogue des 19 types Rust et correspondance avec les profils Node.
- [types-de-daemons.md](types-de-daemons.md) — catalogue des daemons : archétype, organelles, 10 phénotypes et schémas par type.
- [outils-mcp.md](outils-mcp.md) — catalogue d'outils, leases, gating, permissions.
- [axolotl-regeneration.md](axolotl-regeneration.md) — primitives de régénération, contrats natifs, états, budgets, preuves et erreurs.
- [mcp-transport-config.md](mcp-transport-config.md) — transport MCP binaire, config profil, vérification.
- [modeles-providers-routage.md](modeles-providers-routage.md) — providers, modèles, routage codex/hermes/local.
- [mcp-solar-pro-hermes-nous-setup.md](mcp-solar-pro-hermes-nous-setup.md) — Solar Pro, MCP, Hermes, provider Nous : config, modèles, usage.
- [experiences-nce.md](experiences-nce.md) — cycles numériques natifs, transfert culturel, vecteurs phénotypiques et ablations exécutées.
- [persistance-et-donnees.md](persistance-et-donnees.md) — SQLite, tables, intégrité, stockage.
- [runtime-a-team.md](runtime-a-team.md) — exécution canonique, preuves, handoffs versionnés, couvertures et reprise A-Team.
- [runtime-metapopulation.md](runtime-metapopulation.md) — sessions, contrats d’adaptateurs, migrations et reprise régionale vérifiée.
- [plugins-topologies-morphogenese.md](plugins-topologies-morphogenese.md) — câblage des 8 topologies au runtime morphologique : contrats, matrice, SQLite, fail-closed.
- [runtime-syncytium.md](runtime-syncytium.md) — admission causale, réplication, persistance et clôture vérifiée de l’état partagé.

- [runtime-rhizome.md](runtime-rhizome.md) — exécution vérifiée, providers concrets, croissance et télémétrie Rhizome.
- [resultats-formels-messagepack.md](resultats-formels-messagepack.md) — contrat canonique, preuves, provenance et encodage binaire des résultats.
- [scheduler-epistemique.md](scheduler-epistemique.md) — ordonnancement par empreinte, nouveauté, dépendances, preuve et budget.
- [modeles-et-providers.md](modeles-et-providers.md) — providers, routing, coûts, local/remote.
- [integrations-ide.md](integrations-ide.md) — contrat IDE `genos.ide/v1`.
- [preuves-produit-et-safe-debugging.md](preuves-produit-et-safe-debugging.md) — preuves backend et safe debugging.
- [contrat-produit-et-completude.md](contrat-produit-et-completude.md) — périmètre, statuts, preuves et plateformes de la version complète.
- [pont-rust-et-hallucinations.md](pont-rust-et-hallucinations.md) — bridge REST vers `genos-cli`, replay et hallucinations.
- [ecologie-et-systemes-vivants.md](ecologie-et-systemes-vivants.md) — bus zero-texte, primitives écologiques, HGT, stigmergie, électrocytes, organisations dynamiques.
- [registre-philosophique.md](registre-philosophique.md) — concepts, relations, mappings, maturité et garde-fous.
- [categorisation-philosophique.md](categorisation-philosophique.md) — comparaison à l'instance, procédures graduées, métriques, contre-exemples et limites.
- [contrats-philosophiques-ontogenese.md](contrats-philosophiques-ontogenese.md) — compilation des 375 contrats dans le plan de mission et le runtime harness Ontogenèse.
- [runtime-holobionte.md](runtime-holobionte.md) — missions contractuelles, preuves indépendantes, quotas et clôture Holobionte.
- [matrice-operationnelle-philosophique.md](matrice-operationnelle-philosophique.md) — 375 profils d'audit, champs et prédicats ; limites de la couverture logicielle.
- [notifications-et-alertes.md](notifications-et-alertes.md) — préférences et alertes tenant-scoped.
- [qualite-code-et-complexite.md](qualite-code-et-complexite.md) — seuils, périmètre et audit strict de la qualité du code.
- [ontogenese-contrats.md](ontogenese-contrats.md) — contrats stables V1 de l'Ontogenèse : tables, config, états, claims, sélecteur, intégrateur, CLI.
- [verification-parcours-web.md](verification-parcours-web.md) — parcours Playwright, audits Lighthouse et axe-core, observations et effets SHEV.
- [delegation-biscuit.md](delegation-biscuit.md) — jetons attenués des sous-orchestrateurs et vérification du dispatch.
- [capsules-transport.md](capsules-transport.md) — flux secretstream pour capsules d'état transportables.
- [traces-otlp.md](traces-otlp.md) — spans filtrés vers OpenTelemetry Collector après persistance.

## Spécifications normatives

Les specs du format AgentDNA vivent hors de `docs/`, sous [`../../spec/`](../../spec) :

- [`spec/AGENT_DNA_SPEC.md`](../../spec/AGENT_DNA_SPEC.md) — format binaire héréditaire.
- [`spec/GENOME_SPEC.md`](../../spec/GENOME_SPEC.md) — manifeste portable `AgentGenome`.

## Voir aussi

- [../04-exploitation/README.md](../04-exploitation/README.md) — mise en œuvre opérationnelle.
- [../README.md](../README.md) — hub général.

- [runtime-agow.md](runtime-agow.md) — bindings hôte, modes, budgets, décompilation et reprise des reçus AGOW.
