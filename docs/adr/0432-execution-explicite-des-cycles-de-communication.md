# ADR 0432 — Exécution explicite des cycles de communication

- **Statut** : Accepté pour le pilote de communication ; transport et économies globales à qualifier.
- **Date** : 2026-10-11.
- **Domaine** : Communication, grounding et comptabilité des tokens.
- **Lié à** : [ADR 0383](0383-economie-tokens-conditionnee-aux-preuves.md).

## Contexte

`runCycleDriver` décidait d'une communication puis construisait toujours une
issue simulée, y compris quand un reçu de tokens était fourni. Cette issue
ne prouvait ni publication, ni livraison, ni compréhension par le destinataire.
Les compteurs de tokens n'étaient pas reliés à l'exécution du cycle.

## Décision

`runCycle` exige maintenant `opts.executionMode`, égal à `live` ou `simulate`.
Le mode `simulate` reste disponible pour les expériences explicites. Le mode
`live` utilise `liveCycleExecution` : le silence et le mode shadow ne publient
rien ; `SIGNAL` appelle par défaut `signalingTransportService.publishSignal`
et lit les états de grounding persistés ; tout autre canal exige un adaptateur
`deliver` explicite. Un transport absent ou une réponse mal formée échoue.

Le reçu du cycle distingue `published` et `executed` (publication), les
accusés individuels, le niveau de grounding demandé, et `actionTaken` /
`recipientKnew`, qui restent inconnus sans observation distincte. Un accusé
de transport ne vaut pas preuve de compréhension ou de réussite. Les états
retournés par le transport natif sont indiqués comme `database_observed` ;
ceux d'un adaptateur injecté comme `adapter_reported`. Les identités des
destinataires, du signal et les niveaux cohérents avec leur statut sont
contrôlés. Aucun accusé n'est créé à partir de la seule publication.

Un reçu de tokens du fournisseur n'est compté que si son format, ses comptes
entiers positifs et son identifiant de cycle correspondent à l'exécution.
Sans reçu, le nombre utilisé reste `null` et le statut `unknown`. Une
projection séparée peut être conservée pour les canaux verbaux. Le cycle ne
déduit pas de réussite métier ni d'apprentissage d'une réponse de transport.

## Limites

Le test d'intégration exerce `runCycle` avec un adaptateur injecté ; les
campagnes de transport natif, les accusés différés et les coûts complets
d'une mission restent à qualifier. L'adaptateur peut rapporter un niveau de
grounding ; son autorité n'est pas certifiée par ce module. Le reçu de tokens
est attribué au fournisseur par l'adaptateur, sans vérification cryptographique.
La comptabilité persistante et l'idempotence inter-processus relèvent du
journal des tentatives de modèle, pas des compteurs en mémoire de ce module.

## Vérification locale

`node backend/tests/test_communication_live_cycle.js` couvre publication
sans grounding, accusé sémantique, reçu de tokens corrélé, refus des reçus
incohérents, shadow, absence de transport et branchement de `runCycle`.
Les tests de métriques, d'audience demandée et de checkpoint restent passants.
