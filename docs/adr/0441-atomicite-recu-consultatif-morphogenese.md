# ADR 0441 — Atomicité du reçu consultatif Morphogenèse

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : morphogenèse, persistance des preuves, SQLite

## Contexte

Le reçu de décision Rust consultative est append-only. Son insertion
précédait la relecture de la proposition et du graphe préparé. Si cette
relecture échouait, l'appel signalait une erreur, mais conservait en base
une ligne de reçu impossible à supprimer par le parcours ordinaire. Une
référence de proposition absente suffisait à reproduire cet état orphelin.

## Décision

`recordReadOnlyDecision` insère et relit le reçu dans une même transaction
SQLite. La transaction est annulée si la vérification finale échoue. Le test
public fournit une décision structurellement valide liée à une référence de
proposition absente, vérifie le refus et constate que le nombre de reçus
append-only ne change pas. Le parcours nominal et la relecture après
réouverture de la base restent couverts.

## Limites

Cette transaction protège la cohérence locale d'un reçu consultatif. Le
SHA-256 du reçu n'authentifie ni le processus Rust, ni un principal ou une
gouvernance. Le graphe préparé n'est pas un snapshot restaurable du
workspace, des workers, des baux et des budgets. Le préflight topologique
reste `verify-only` avec `restorable: false`; le commit morphologique et le
CAS de production restent fermés. La réouverture d'APPLY exige ces preuves
et un reçu de transition durable portant la même identité et version.
