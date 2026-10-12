# Qualification de l'issue d'une mission

- **Statut** : première tranche implémentée pour `strategy_execution_runs` avec `mission_outcome` explicite ; qualification transversale non acquise.
- **Portée** : distinction entre exécution conforme, obligations vérifiées et effet réel observé.
- **Date** : 2026-10-11.

## Question vérifiée

Une sortie valide, un run terminé et un dossier de preuves cohérent répondent-ils
au but fixé avant l'exécution ? La réponse exige un oracle du domaine. Le contrat
`mission_outcome` nomme le but et les obligations canoniques ; la clôture du run
reste bloquée si les attestations indépendantes validées ne couvrent pas toutes
les obligations. Le décompte vérifie aussi la signature, le digest de preuve,
les obligations couvertes, la confiance du vérificateur, deux nonces et deux
identités de vérification distincts. Voir
[ADR 0420](../adr/0420-contrat-issue-mission.md).

Le verdict `verified` porte uniquement sur ces obligations et sur le périmètre
des oracles exécutés. Il ne signifie ni absence de régression hors du domaine
testé, ni effet durable en production, ni réussite de toutes les missions libres.

## Protocole de qualification

| Niveau | Contrôle | Échec attendu |
| --- | --- | --- |
| C0 — contrat | But, obligations uniques, oracle et périmètre figés avant le run. | Contrat absent ou ambigu : but non mesuré. |
| C1 — exécution | Run, autorité, artefact et preuve terminale liés. | Sortie valide sans exécution : aucune réussite. |
| C2 — oracle | Chaque obligation requise est évaluée sur l'artefact du run par une méthode distincte du producteur. | Obligation manquante, reçus altérés ou issus d'un autre run : refus. |
| C3 — falsification | Soumettre des résultats faux mais bien formés, et des résultats corrects atypiques. | Toute fausse acceptation est un défaut bloquant. |
| C4 — effet | Observer la métrique prévue après application, avec horizon et environnement déclarés. | Sans mesure, conserver `unknown` ; ne pas extrapoler depuis C2. |

Pour C2, distinguer identité de processus, indépendance d'implémentation,
indépendance des données et indépendance du jugement. Deux processus exécutant
le même code ne suffisent pas à établir les quatre. L'oracle doit garder la
référence de sa version et de ses intrants, afin de détecter une preuve périmée.

## Campagne minimale de falsification

Pour chaque famille de missions qualifiée, conserver le manifeste, le commit,
le contrat, le run, les reçus bruts et les commandes de reproduction. Exécuter :

1. Le cas attendu et un cas limite correct.
2. Un artefact faux de forme valide, puis un artefact dont seule une postcondition est fausse.
3. Un reçu absent, modifié, expiré ou rattaché à un autre run ou contrat.
4. Une déclaration `verified` dans le payload sans attestation acceptée.
5. Une abstention, un rejet et un échec du vérificateur.
6. Le même cas après changement de dépendance, de version d'oracle ou d'environnement.

Rapporter séparément `false_accepts / invalid_cases`, `false_rejects /
valid_cases`, couverture des obligations requises, cas non mesurés, coûts et
durées. Aucun résultat `skipped`, `unmeasured` ou `inconclusive` ne vaut PASS.
Pour un domaine subjectif, remplacer l'oracle déterministe par une grille et
une évaluation humaine attribuée ; publier les désaccords, pas une certitude
fabriquée à partir d'un vote.

## État actuel et prochaines portes

Le test `node backend/tests/test_mission_outcome_contract.js` vérifie le contrat,
les quatre verdicts et le refus d'une clôture qui déclare le succès sans
attestation. Il ne constitue pas la campagne C3. Avant de qualifier le parcours
général, il faut :

- mesurer les fausses acceptations et les rejets abusifs sur des artefacts mutés ;
- qualifier séparément les autres topologies et chemins de clôture ;
- publier `unmeasured` pour les missions sans contrat de résultat, sans changer
  rétroactivement leur statut d'exécution ;
- distinguer la validation immédiate du résultat de l'effet observé après
  application, et invalider les preuves devenues périmées.

La [grille des workers](qualification-workers.md) donne déjà C0 à C4 pour des
tâches bornées. Ce protocole ajoute la couverture du but propre à chaque
mission et l'observation différée de son effet.

## Vérification du 2026-10-11

Sur le checkout de travail modifié, `node backend/tests/test_mission_outcome_contract.js`
et `npm test` ont terminé avec le code 0. `cargo test --workspace` a aussi
terminé avec le code 0. Les suites npm et Rust ont été relancées hors sandbox
après des refus `EPERM` de canonicalisation dans le sandbox Windows. La porte
`python scripts/ci/check_code_quality.py` a fini avec zéro nouvelle violation
et huit violations historiques du baseline. Ces résultats
ne qualifient pas les missions sans contrat de résultat ni les autres chemins
de clôture ; le test formel natif a été ignoré lorsque Lean était indisponible.
