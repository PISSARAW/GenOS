# ADR 0446 — Refus des affectations orphelines en quiescence Métapopulation

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : Métapopulation, snapshots, quiescence

## Contexte

La frontière de snapshot Métapopulation vérifie les agents de la mission avant
d'inscrire `SESSION_QUIESCED`. Une jointure interne entre `mission_agents` et
`agents` supprimait silencieusement une affectation dont l'agent avait disparu.
Si un autre agent de la mission était au repos, la quiescence pouvait réussir
alors que l'état de tous les travailleurs n'était pas connu. Les seize variants
utilisent cette même frontière.

## Décision

La vérification conserve chaque affectation `mission_agents` par une jointure
externe. Elle refuse la quiescence si l'agent lié est absent, si un agent est en
cours d'exécution ou si un PID de runtime subsiste. Le refus intervient dans la
transaction existante : aucun événement `SESSION_QUIESCED` n'est enregistré et
la session ne devient pas `QUIESCENT`. Un lien orphelin doit être réparé dans les
données persistées avant une nouvelle tentative.

## Preuve

Le test `test_metapopulation_snapshot_lifecycle.js` ajoute une affectation de
travailleur sans ligne `agents` et exige `METAPOPULATION_QUIESCENCE_WORKERS_ACTIVE`.
Avant correction, il échouait avec `Missing expected rejection`. Après
correction, il passe ; la suite `test_topology_snapshot_metapopulation.js`
confirme la capture et le préflight des seize variants.

## Limites

Cette vérification prouve la présence des agents persistés, leurs statuts et
leurs PID dans SQLite au moment de la transaction. Elle ne prouve ni l'absence
de processus externes non enregistrés, ni l'achèvement de la mission. Le
snapshot reste une reprise du workspace avec état régional en lecture seule.
