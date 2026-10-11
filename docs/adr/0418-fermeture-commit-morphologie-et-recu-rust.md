# ADR 0418 — Fermer le commit morphologique déclaratif et conserver le refus Rust

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : morphogenèse, graphe versionné, décision Rust

## Contexte

Après l'ADR 0416, la proposition et le graphe préparé sont persistés et liés.
Le noyau Rust répond en lecture seule. Le magasin de graphes possédait pourtant
un chemin `commit` acceptant `kernelDecision.valid`, `decision: APPLY` et
`governance.allowed` comme simples booléens fournis par l'appelant. Ces champs
ne prouvent ni le principal, ni la décision Rust, ni un snapshot restaurable.
Le CAS de version empêchait un conflit concurrent mais pas une autorisation
inventée. Aucun appel de production du magasin `commit` n'a été trouvé ; son
usage identifié était un test avec des booléens fabriqués.

## Décision

`morphologyGraphStore.commit` refuse systématiquement avec le code
`MORPHOLOGY_COMMIT_PROOF_UNAVAILABLE`. `save` n'accepte que le statut
`proposed` et conserve la monotonie des versions. La table et les anciens
graphes `committed` restent lisibles ; aucun enregistrement existant n'est
réécrit. Les consommateurs du contrat historique de `commit` doivent traiter
ce refus et déposer une proposition ; la réouverture demandera une nouvelle
API qui vérifie toute la chaîne d'autorité et de transition.

La décision Rust consultative est enregistrée dans
`morphogenesis_read_only_decisions` avec l'identifiant de mission, la version
et le hash du graphe, la proposition persistée, le hash de la requête Rust et
le hash de la réponse. La relecture recalcule le contrat de requête, vérifie
le reçu Rust et la proposition/snapshot actuels. Des triggers SQLite refusent
`UPDATE` et `DELETE` de ces reçus. Si la décision ne peut être persistée et
relue, le diagnostic public devient `UNAVAILABLE`.

## Limites

Ce reçu est une trace durable et cohérente, **pas une preuve d'autorité** : le
SHA-256 n'est pas une signature et un administrateur de la base peut modifier
les données et les triggers. Le graphe préparé n'est pas un snapshot
restaurable du workspace, des workers, des baux et des budgets. La
`GovernancePlane` Rust reçoit encore une chaîne d'identité, sans principal
authentifié. Le CAS de commit n'est donc pas exposé. `APPLY` reste fermé
jusqu'à la vérification d'une autorité, d'un snapshot de transition
restaurable, d'une preuve liée à la proposition exacte, puis d'un commit CAS
avec reçu durable.
