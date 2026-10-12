# ADR 0398 — Oracle de `subset_sum` pour le worker procédural direct

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : workers natifs, preuve indépendante, promotion
- **Décideurs** : équipe GenOS
- **Lié à** : [qualification des workers](../06-qualite-preuves/qualification-workers.md)

## Contexte

L'oracle natif possédait deux vérificateurs indépendants pour `subset_sum`,
mais son sujet n'acceptait que la méthode `bounded_worker → scoped_procedure`.
`procedural_executor → subset_sum` publiait un reçu et un événement
`EVIDENCE_REPORT` liés au run, puis recevait `ORACLE_DOMAIN_UNAVAILABLE`.
Relancer le solveur comme oracle aurait réutilisé la même implémentation.

## Décision

Accepter aussi la méthode version 1 `subset_sum` directement liée à un
`procedural_executor`. Lire son résultat dans `procedureReceipt.result` de la
dernière observation appliquée du run courant. Exiger le type d'artefact
`dossier` et un reçu déclaré `subset_sum`. Conserver la vérification de portée,
de fraîcheur, de contrat, du hash d'observation, du budget et des deux
processus d'oracle existants. Les vérificateurs `subset_bitset` et
`subset_enumeration` recalculent les postconditions à partir des entrées
scellées ; la promotion n'est accordée que s'ils acceptent tous deux.

Les méthodes `lpt`, `formal_proof`, `check_arithmetic` et les autres résultats
natifs restent hors de ce domaine. Un reçu de solveur seul ne les promeut pas.

## Conséquences

- La mission procédurale bornée `subset_sum` peut atteindre C2 et C3 avec un
  reçu d'oracle lié à sa décision persistée.
- Les autres méthodes ne gagnent aucune autorité par analogie.
- La campagne de qualification doit compter séparément chaque méthode et
  conserver les refus `ORACLE_DOMAIN_UNAVAILABLE`.

## Alternatives

- Étendre l'oracle à tout reçu de procédure : rejeté, car les postconditions
  de `lpt` sont différentes et ne sont pas vérifiées par ces deux algorithmes.
- Ignorer l'oracle pour les méthodes natives : rejeté, car un transport réussi
  ou un artefact bien formé ne prouve pas la décision.
