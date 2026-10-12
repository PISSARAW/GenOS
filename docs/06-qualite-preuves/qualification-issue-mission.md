# Qualification de l'issue d'une mission

- **Statut** : deux tranches implémentées pour `strategy_execution_runs` avec `mission_outcome` explicite ; qualification transversale non acquise.
- **Portée** : distinction entre exécution conforme, obligations vérifiées et effet réel observé.
- **Date** : 2026-10-12.

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

Depuis la deuxième tranche, un nouveau contrat `genos.mission-outcome/v2`
déclare pour chaque obligation le domaine de l'oracle natif, l'empreinte du
vérificateur et le domaine de validité du résultat. La clôture exige une
attestation native directe du même run, encore valide, puis reconstruit
l'identité et l'empreinte du résultat formel avant de compter les reçus.
Les contrats v1 persistés restent lisibles ; la construction de nouveaux
contrats exige v2. Voir [ADR 0441](../adr/0441-oracle-borne-issue-mission.md).

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
attestation. `node backend/tests/test_mission_outcome_falsification.js` mesure
les mutations structurelles v2 avec deux cas valides et douze cas invalides.
Elle appelle aussi directement les deux stratégies `subset_sum` sur quatre cas
valides et huit cas faux de postconditions, sans fausse acceptation ni rejet
abusif dans cet échantillon. Les reçus et l'attestation restent des fixtures ;
les oracles s'exécutent ici dans le processus de test, sans parcours complet de
promotion. Avant de qualifier le parcours général, il faut :

- élargir la vérité terrain indépendante et la campagne aux oracles réellement
  exécutés par le parcours complet ;
- qualifier séparément les autres topologies et chemins de clôture ;
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

## Vérification du 2026-10-12

Sur le checkout de travail, `node backend/tests/test_mission_outcome_contract.js`,
la campagne de falsification et `npm --prefix backend run test:p1-socle` ont fini
avec le code 0. La campagne mesure 0 fausse acceptation sur 12 mutations
structurelles et 8 verdicts sémantiques faux, et 0 rejet abusif sur 2 cas
structurels et 4 cas sémantiques valides. `cargo test --workspace` et `npm test`
ont fini avec le code 0 hors sandbox Windows. Le contrôle qualité a examiné
5 972 fichiers source : huit violations du baseline, zéro nouvelle. L'index
ADR est contrôlé par `python scripts/ci/check_adr_index.py`.

Les premières tentatives globales ont rencontré un refus `EPERM` du sandbox
et deux échecs intermittents de budget/réservation d'oracle dans des tests
workers et natifs. Ces tests ont passé seuls, puis dans la relance globale
séquentielle. Aucun de ces essais ne qualifie encore un effet différé après
application ni une clôture déléguée v2.
