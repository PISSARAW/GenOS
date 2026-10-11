# ADR 0412 — Pont Rust de décision morphogénétique en lecture seule

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : orchestrateur public, noyau Rust, gouvernance

## Contexte

Le parcours `genos-orchestrate` prépare une morphologie puis émet une
proposition après la mission. Il ne persiste ni proposition de resolver Rust,
ni gain marginal mesuré, ni mandat d'autorité pour une transition. La
`GovernancePlane` Rust valide actuellement une chaîne de nom de principal ;
elle ne vérifie pas un bail authentifié. Le CAS de graphe Node vérifie une
version, mais ses champs `kernelDecision.valid` et `governance.allowed` sont
des booléens fournis par l'appelant et ne lient pas un reçu Rust au graphe.

## Décision

La commande `genos morphogenesis-adjudicate <JSON>` exécute le vrai
`MorphogenesisPlanner` et la vraie `GovernancePlane` Rust. Son identité est
fixée dans le binaire à `post_mission_read_only`. Le résultat contient le
SHA-256 des octets de requête et un plan. Il ne peut retourner que
`NO_CHANGE` ou `REJECTED`, avec `commitAuthorized: false` et
`committed: false`. Les entrées invalides sont rejetées avant le plan.

Après la mission, Node appelle cette commande avec la topologie et le variant
préparés, mais un ensemble de propositions vide : aucun gain marginal ni
resolver persistant ne justifie une proposition Rust. Le backend vérifie le
digest et les invariants de réponse. Si le binaire manque ou échoue, le
diagnostic indique `UNAVAILABLE`. Une réponse incohérente empêche la
télémétrie. L'ancien résultat reste une proposition, jamais un commit.

## Limite de production

Ce pont prouve une décision Rust **en lecture seule**, pas une transition.
L'activation d'`APPLY` exige encore un principal ou bail authentifié,
une proposition et ses preuves persistées, la liaison cryptographique du plan
exact et du snapshot à la décision, puis un CAS de graphe qui vérifie cette
liaison avant de produire un reçu durable. Aucun booléen d'adaptateur ne
remplace ces preuves. Le SHA-256 du pont détecte une réponse discordante ;
il ne signe pas l'autorité et ne prouve pas l'identité du binaire.

## Vérification

Les tests du module Rust couvrent `NO_CHANGE`, le refus d'un changement
significatif et les entrées invalides. Le test Node couvre le contrat,
l'indisponibilité et le rejet d'une réponse qui prétend un commit.
