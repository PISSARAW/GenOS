# Périmètre fonctionnel des baselines

Cette matrice fixe les comparaisons pertinentes avant le préenregistrement. Une
baseline n'est évaluée que sur les expériences de son périmètre déclaré. Les
autres cellules sont `N/A`; elles ne sont jamais comptées comme des échecs.
Cette décision suit la consigne de la campagne de comparer des fonctionnalités
équivalentes et de ne pas pénaliser une technologie hors de son contrat.

| Baseline | Expériences applicables | Justification du périmètre | État local |
|---|---|---|---|
| MLIR | E01, E02, E03, E04, E12 | IR typée, vérification, transformations et représentations portables | adaptateur à réaliser |
| Temporal | E05, E06, E07 | exécution durable, historique/replay et reprise de workflows | adaptateur à réaliser |
| LangGraph | E05, E06, E07, E10 | transitions de graphes, checkpoints et reprise d'état | adaptateur à réaliser |
| A2A | E07, E12 | délégation, tâches interagents et échange portable | adaptateur à réaliser |
| MCP | E07, E12 | découverte et appel d'outils typés, avec réponse au client | adaptateur exécuté sur jeu public |
| OPA | E03, E08 | décisions de politique sur entrées structurées et demandes adversariales | adaptateur à réaliser |
| JSON Schema + référence Python | E01–E12 | contrôle déterministe indépendant qui implémente les contrats de sortie | runner A réutilisé, jeu public exécuté |

## Adaptateur MCP

`adapters/mcp.cjs` utilise le SDK TypeScript officiel `@modelcontextprotocol/sdk`
version 1.31.0, déjà verrouillé dans `mcp/package-lock.json`. Il crée un client,
un serveur et une paire de transports MCP in-memory, puis mesure l'appel typé
`execute_case`. La logique métier est volontairement celle de l'exécuteur de
référence indépendant; cette baseline mesure l'intégration et l'aller-retour
MCP, pas une supériorité de raisonnement ou d'exécution propre au protocole.
Le runner couvre E07 et E12, soit 300 cas et 900 appels avec trois répétitions.
Les scores publics sont dans `results/MCP-baseline.evaluation.json` (artefact
local ignoré par Git).

## Sources de contrat

- MLIR décrit une IR extensible composée de dialectes, opérations et types, et
  des passes de canonicalisation/optimisation :
  <https://mlir.llvm.org/docs/LangRef/> et <https://mlir.llvm.org/docs/Passes/>.
- Temporal reconstruit l'état des workflows depuis leur historique d'événements
  et le rejoue après interruption : <https://docs.temporal.io/workflows>.
- LangGraph décrit les checkpointers pour l'état de graphe par thread et la
  reprise : <https://docs.langchain.com/oss/python/langgraph/persistence>.
- A2A définit les messages, tâches, états, artefacts et interfaces d'agents :
  <https://a2a-protocol.org/latest/specification/>.
- MCP définit la découverte et les appels de tools avec des schémas d'entrée :
  <https://modelcontextprotocol.io/docs/concepts/tools>.
- OPA évalue des politiques sur des données d'entrée structurées :
  <https://www.openpolicyagent.org/docs>.

Les sources décrivent les contrats des systèmes; elles ne prouvent pas qu'un
adaptateur de cette campagne les implémente correctement. Chaque baseline
reste `pending` jusqu'à l'existence d'un runner versionné, d'une exécution
complète de son périmètre et d'une évaluation indépendante sans lignes
manquantes, doublons ou statuts invalides.
