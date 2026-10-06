# Couverture des 24 dépôts étudiés

Cette matrice relie les 24 références initiales aux vingt lots livrés. « Couvert »
signifie qu'un adaptateur, une expérience ou un contrat vérifiable existe dans GenOS ;
cela ne signifie ni exécution complète du dépôt amont, ni preuve de performance ou de
sécurité en production. Les limites propres à chaque lot figurent dans sa documentation.

| Lot | Dépôt(s) | Artefact GenOS | Portée |
| --- | --- | --- | --- |
| 1 | fast-check | backend/tests/test_property_invariants.js | Invariants par propriétés |
| 2 | Inspect AI | benchmarks/inspect-ai/ | Protocole et banc de comparaison |
| 3 | Playwright | backend/src/services/webJourneyVerifier.js | Parcours web borné |
| 4 | Lighthouse, axe-core | backend/src/services/webAuditService.js | Audits indépendants |
| 5 | Cedar | backend/src/services/cedarAgentAuthority.js | Politique d'autorité |
| 6 | Biscuit | docs/03-reference/delegation-biscuit.md | Délégation restrictive |
| 7 | libsodium | backend/src/services/capsuleTransportService.js | Capsule authentifiée |
| 8 | Pyribs, ShinkaEvolve | integrations/quality_diversity/ | Recherche bornée |
| 9 | OpenTelemetry Collector | integrations/opentelemetry/ | Export OTLP après persistance |
| 10 | AgentDojo, BrowserGym | integrations/agent_benchmarks/ | Score et parcours borné |
| 11 | Wasmtime | integrations/wasmtime/ | Module avec limite de carburant |
| 12 | OpenHands SDK | integrations/openhands_sdk/ | Candidat sans promotion automatique |
| 13 | Temporal | integrations/temporal/ | Réconciliation sans serveur Temporal |
| 14 | Automerge | integrations/automerge/ | Fusion de notes sans autorité |
| 15 | Differential Dataflow | integrations/differential_dataflow/ | Deltas de dépendances |
| 16 | Cap'n Proto | integrations/capnproto/ | Sonde de sérialisation |
| 17 | DoWhy | integrations/dowhy/ | Effet synthétique et placebo |
| 18 | DGM | integrations/dgm_comparison/ | Lignées à budget égal |
| 19 | LeanDojo-v2, Dafny | integrations/formal_proofs/ | Traces non certifiantes ; obligations Dafny |
| 20 | XGrammar | integrations/xgrammar/ | Grammaire compilée ; autorité séparée |

Les bancs des lots 10, 12, 13, 18 et la recherche Lean du lot 19 ne démontrent
pas une exécution de bout en bout avec les services et modèles amont. La réussite
des tests ne franchit aucun gate de promotion GenOS.
