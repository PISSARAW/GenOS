# Topologies d'orchestration

Les 8 modes de composition supportés par GenOS. Le contrat de capacités et le câblage
runtime sont décrits dans [../topologies-et-capacites.md](../topologies-et-capacites.md).

La [Morphogenèse](morphogenese.md) est le cadre transversal qui construit et compose
ces organisations ; elle n'est pas un neuvième mode.

[Garage Fabric](garage-fabric.md) est également transversal : il ordonne les
exécutions des workers sous les plafonds de capacité, sans choisir leur topologie
ni modifier leur contrat de mission.

- [trinity.md](trinity.md) — orchestration comparée, baseline à trois mondes et variants expérimentaux à fan-out contrôlé.
- [a-team.md](a-team.md) — équipe multidisciplinaire d'agents autonomes.
- [Contrat runtime A-Team](../../03-reference/runtime-a-team.md) — états, rapports, clôture et limites des variantes.
- [biome.md](biome.md) — orchestration par environnement et populations spécialisées.
- [biocenose.md](biocenose.md) — orchestration communautaire (coopération, compétition, validation).
- [holobionte.md](holobionte.md) — orchestration intégrée hôte-symbionte.
- [syncytium.md](syncytium.md) — modèle d'état partagé et runtime partiel à 13 variants ; campagne des 53 missions non attestée ; orchestration par état partagé causal et synchronisation continue.
- [runtime-syncytium.md](../../03-reference/runtime-syncytium.md) — contrat Node/MCP actuel et preuve de complétion.
- [protocole-missions-syncytium.md](protocole-missions-syncytium.md) — budgets, missions, workers, échanges, nosologie, télémétrie et preuves d’exécution.
- [rhizome.md](rhizome.md) — missions par capacités, croissance vérifiée et routage borné ; [contrat runtime](../../03-reference/runtime-rhizome.md).
- [metapopulation.md](metapopulation.md) — populations semi-indépendantes, recolonisation et cycles régionaux persistants ; [contrat runtime](../../03-reference/runtime-metapopulation.md).
- [variants-morphologiques.md](variants-morphologiques.md) — catalogue central, provenance et maturité des variants des topologies.
- [garage-fabric.md](garage-fabric.md) — douze politiques exécutables, file SQLite, baux clôturés et cycle snapshot/freeze/thaw vérifié.

## Voir aussi

- [../README.md](../README.md) — orchestration et exécution.
- [../../03-reference/plugins-topologies-morphogenese.md](../../03-reference/plugins-topologies-morphogenese.md) — câblage runtime des 8 topologies.
- [../../03-reference/outils-mcp.md](../../03-reference/outils-mcp.md) — leases et outils par capacité.
