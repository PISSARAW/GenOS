# ADR 0445 — Refuser les champs non scellés du snapshot topologique

- **Statut** : accepté
- **Date** : 2026-10-12
- **Domaine** : snapshots topologiques, intégrité, frontière Morphogenèse

## Contexte

Le hash du manifeste topologique couvre ses six champs définis par le
contrat : version de schéma, version de politique, liaisons, frontière,
composants et hash. `verify` reconstruisait ce corps pour le contrôler,
mais acceptait des champs supplémentaires à la racine. Après capture,
ajouter `restorable: true` ou `commitAuthorized: true` ne changeait pas le
hash et le préflight acceptait encore le manifeste. Aucun code de production
observé n'utilisait ces ajouts pour appliquer une transition, mais ils
pouvaient donner une fausse apparence de preuve à un consommateur.

## Décision

La vérification refuse désormais les propriétés racine hors contrat avec
`TOPOLOGY_SNAPSHOT_INTEGRITY_FAILED`, y compris les propriétés non
énumérables et les symboles. Le test commun a été exécuté rouge avant
correction (`Missing expected rejection`), puis vert. Les six champs
existants restent compatibles.

## Limites

Le SHA-256 du manifeste détecte une modification sans authentifier son
émetteur. Le préflight ne restaure que le workspace de l'agent sous une
frontière collective inchangée ; son résultat conserve `restorable: false`
et `verify-only` pour la topologie. APPLY Morphogenèse reste fermé tant que
le principal, le snapshot collectif restaurable et le commit CAS avec reçu
durable ne sont pas vérifiés ensemble.
