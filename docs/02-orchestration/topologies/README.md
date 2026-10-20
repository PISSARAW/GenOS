# Topologies d'orchestration

Les 8 modes de composition supportés par GenOS. Le contrat de capacités et le câblage
runtime sont décrits dans [../topologies-et-capacites.md](../topologies-et-capacites.md).
Le [contrat des snapshots topologiques](../../03-reference/snapshots-topologiques.md)
décrit la capture optionnelle et les préconditions de reprise propres à chacun
de leurs variants.

La [Morphogenèse](morphogenese.md) est le cadre transversal qui construit et compose
ces organisations ; elle n'est pas un neuvième mode. Son graphe pilote les feuilles du
dispatch principal et peut être recompilé à la frontière de continuation à partir des
preuves de la première vague.

[Garage Fabric](garage-fabric.md) est également transversal : il ordonne les
exécutions des workers sous les plafonds de capacité, sans choisir leur topologie
ni modifier leur contrat de mission.

La [clôture des missions biologiques](../cloture-missions-biologiques.md) décrit
la barrière commune, la relecture des reçus, l'oracle natif des sept modes
génériques et l'adaptateur spécialisé de Syncytium. Elle ne remplace pas les
gates propres aux runtimes canoniques ci-dessous.

- [trinity.md](trinity.md) — orchestration comparée, baseline à trois mondes et variants expérimentaux à fan-out contrôlé ; [contrat runtime](../../03-reference/runtime-trinity.md).
- [a-team.md](a-team.md) — équipe multidisciplinaire d'agents autonomes.
- [Contrat runtime A-Team](../../03-reference/runtime-a-team.md) — états, rapports, clôture et limites des variantes.
- [biome.md](biome.md) — orchestration par environnement et populations spécialisées ; [contrat runtime](../../03-reference/runtime-biome.md).
- [biocenose.md](biocenose.md) — orchestration communautaire (coopération, compétition, validation) ; [contrat runtime](../../03-reference/runtime-biocenose.md).
- [holobionte.md](holobionte.md) — orchestration intégrée hôte-symbionte, adaptateurs vérifiables, admission isolée, santé typée et cycle de session ; [contrat runtime](../../03-reference/runtime-holobionte.md) et [guide opérateur](../../04-exploitation/operer-runtime-holobionte.md).
- [syncytium.md](syncytium.md) — modèle d'état partagé, 13 variants et séparation entre cohérence topologique et verdict commun ; campagne des 53 missions non attestée.
- [runtime-syncytium.md](../../03-reference/runtime-syncytium.md) — contrat Node/MCP actuel, matérialisation, preuves workers et complétion commune.
- [protocole-missions-syncytium.md](protocole-missions-syncytium.md) — budgets, missions, workers, échanges, nosologie, télémétrie et preuves d’exécution.
- [cloture-missions.md](../../04-exploitation/cloture-missions.md) — triage des verdicts, inspection des reçus et reprise fail-closed.
- [rhizome.md](rhizome.md) — missions par capacités, croissance vérifiée et routage borné ; [contrat runtime](../../03-reference/runtime-rhizome.md).
- [metapopulation.md](metapopulation.md) — populations semi-indépendantes, recolonisation et cycles régionaux persistants ; [contrat runtime](../../03-reference/runtime-metapopulation.md), [registre des variants](../../03-reference/variants-metapopulation.md) et [runbook](../../04-exploitation/runbook-metapopulation.md).
- [variants-morphologiques.md](variants-morphologiques.md) — catalogue central, provenance, maturité et guide vers les cas d'usage des 95 variants canoniques.
- [garage-fabric.md](garage-fabric.md) — douze politiques exécutables, file SQLite, baux clôturés et cycle snapshot/freeze/thaw vérifié.

## Voir aussi

- [../README.md](../README.md) — orchestration et exécution.
- [../../03-reference/plugins-topologies-morphogenese.md](../../03-reference/plugins-topologies-morphogenese.md) — câblage runtime des 8 topologies.
- [../../03-reference/outils-mcp.md](../../03-reference/outils-mcp.md) — leases et outils par capacité.
