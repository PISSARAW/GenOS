# ADR 0437 — Rendre append-only les sources du reçu Morphogenèse

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : morphogenèse, graphe préparé, décision consultative

## Contexte

La décision Rust consultative est enregistrée avec un reçu SQLite dont les
triggers interdisent `UPDATE` et `DELETE`. Sa relecture dépend pourtant d'une
version de graphe dans `morphology_graph_versions` et d'une proposition dans
`morphogenesis_read_only_proposals`. Ces deux tables autorisaient encore les
mutations et suppressions. Leurs hashes faisaient échouer une relecture
après corruption ordinaire, mais le reçu pouvait perdre ses sources et un
acteur ayant accès aux colonnes pouvait recalculer les hashes non signés.

## Décision

La migration du graphe et la création de la table des propositions installent
des triggers qui refusent `UPDATE` et `DELETE` sur les lignes existantes.
Les nouveaux graphes restent déposés par `save` comme nouvelles versions
`proposed`; les nouvelles propositions utilisent de nouveaux identifiants.
Le test du parcours public vérifie que graphe, proposition et décision restent
lisibles après tentative de mutation et de suppression. Un lien de snapshot
falsifié reste refusé à l'adjudication.

## Limites et suite

Les triggers ne protègent pas contre un administrateur SQLite capable de les
supprimer et ne constituent ni signature, ni authentification du principal.
Le graphe préparé capture une proposition de structure, pas les workspaces,
processus, baux ou budgets nécessaires à une restauration. APPLY demeure
fermé. Sa réouverture exige une décision Rust et une gouvernance liées à un
principal authentifié, un snapshot de transition restaurable, et un commit
CAS versionné avec reçu durable après vérification de toute cette chaîne.
