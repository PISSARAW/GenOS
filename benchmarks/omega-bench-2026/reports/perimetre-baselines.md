# Périmètre fonctionnel des baselines

Cette matrice fixe les comparaisons pertinentes avant le préenregistrement. Une
baseline n'est évaluée que sur les expériences de son périmètre déclaré. Les
autres cellules sont `N/A`; elles ne sont jamais comptées comme des échecs.
Cette décision suit la consigne de la campagne de comparer des fonctionnalités
équivalentes et de ne pas pénaliser une technologie hors de son contrat.

| Baseline | Expériences applicables | Justification du périmètre | État local |
|---|---|---|---|
| MLIR | E01, E02, E03, E04, E12 | IR typée, vérification, transformations et représentations portables | exécution en cours sous WSL; latence exclue des comparaisons Windows |
| Temporal | E05, E06, E07 | exécution durable, historique/replay et reprise de workflows | 1 350/1 350 corrects; E05 replay vérifié 300/300, effets E06 sans doublon |
| LangGraph | E05, E06, E07, E10 | transitions de graphes, checkpoints et reprise d'état | 1 650/1 650 corrects, évalués |
| A2A | E07, E12 | délégation, tâches interagents et échange portable | 900/900 corrects, évalués |
| MCP | E07, E12 | découverte et appel d'outils typés, avec réponse au client | 900/900 corrects, évalués |
| OPA | E03, E08 | décisions de politique sur entrées structurées et demandes adversariales | relance corrigée: 6 000/6 000 corrects, évalués |
| JSON Schema + référence Python | E01–E12 | contrôle déterministe indépendant qui implémente les contrats de sortie | runner A réutilisé, jeu public exécuté |

## Adaptateur MCP

`adapters/mcp.cjs` utilise le SDK TypeScript officiel `@modelcontextprotocol/sdk`
version 1.31.0, déjà verrouillé dans `mcp/package-lock.json`. Il crée un client,
un serveur et une paire de transports MCP in-memory, puis mesure l'appel typé
`execute_case`. La logique métier est volontairement celle de l'exécuteur de
référence indépendant; cette baseline mesure l'intégration et l'aller-retour
MCP, pas une supériorité de raisonnement ou d'exécution propre au protocole.
Le runner couvre E07 et E12, soit 300 cas et 900 appels avec trois répétitions;
les 900 réponses correspondent à l'oracle sans manque, doublon, statut invalide
ou échec critique. Les scores publics sont dans
`results/MCP-baseline.evaluation.json` (artefact local ignoré par Git).

## Baselines exécutées

`adapters/a2a.cjs` utilise `@a2a-js/sdk@1.3.0` sur un serveur HTTP JSON-RPC
local et un client SDK qui découvre sa carte d'agent. E07 et E12 totalisent
900/900 réponses correctes, sans manque, doublon, statut invalide ni échec
critique. La réponse métier vient de l'exécuteur de référence; la mesure porte
sur l'intégration et le transport A2A.

`adapters/langgraph.cjs` utilise `@langchain/langgraph@1.5.3` et
`SqliteSaver@1.1.0`. Il a évalué 1 650 exécutions sur E05/E06/E07/E10, toutes
correctes. E05 répète les invocations et compare les états; E06 reprend après
une panne injectée, avec journal durable des effets idempotents. Le graphe
exécute un nœud déterministe par cas; ce résultat qualifie le runtime de graphe
et le checkpoint, pas une orchestration multi-agent optimisée.

`adapters/opa.cjs` exécute OPA 1.21.4 via son serveur local sur E03/E08. Les
4 500 réponses correctes sur 6 000 comprennent 1 500/3 000 sur E03 (jeu de
validation équilibré contenant des demandes valides et invalides) et 3 000/3 000
sur E08. Ce score décrit les règles de politique déclarées et n'est pas une
mesure de l'ensemble des contrôles de sécurité GenOS.

Les manifestes et évaluations JSONL bruts restent des artefacts locaux ignorés
par Git; les compteurs ci-dessus sont des résultats descriptifs sur le jeu
public, pas des tests de significativité.

## Portée MLIR

`adapters/mlir.cjs` traduit les valeurs numériques publiques du cas en
opérations `arith` typées, exécute `mlir-opt-22 --verify-each --canonicalize`,
puis appelle l'exécuteur de référence indépendant pour la réponse métier. Le
runner utilise Ubuntu 26.04 sous WSL et le paquet `mlir-22-tools` 22.1.2; il ne
compare pas les latences avec les adaptateurs Windows. Cette qualification
porte sur la vérification et la canonicalisation de l'IR générée par
l'adaptateur, pas sur une implémentation MLIR des douze contrats métiers.

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
