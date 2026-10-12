# ADR 0441 — Oracle borné dans le contrat d'issue de mission

Statut : accepté pour les nouveaux contrats `mission_outcome` du parcours
`strategy_execution_runs` avec attestation native directe. Date : 2026-10-12.

## Contexte

L'ADR 0420 lie déjà les obligations à des reçus indépendants. Une simple
égalité de l'énoncé ne lie cependant ni la méthode de vérification choisie
avant l'exécution, ni son périmètre, ni l'intégrité du résultat formel.

## Décision

La construction d'un nouveau contrat produit `genos.mission-outcome/v2`.
Chaque obligation exige `oracle.domain`, `oracle.verifierDigest` et
`oracle.validityDomain` (énoncé et contraintes). Les doublons d'énoncé sont
refusés. Les contrats v1 déjà persistés restent lisibles.

Pour conclure `verified`, l'évaluateur v2 exige l'attestation native directe
acceptée, non expirée et liée au run clos. Il prend l'assemblage depuis cette
attestation, compare domaine et vérificateur au contrat, reconstruit le résultat
formel pour vérifier ses empreintes et son domaine, puis exige deux reçus signés
indépendants liés au même run. Une preuve déléguée, absente, périmée ou portant
sur un autre domaine reste `inconclusive` dans cette version.

## Conséquences et limites

Les nouveaux appelants doivent fournir l'oracle pour chaque obligation ; une
ancienne déclaration d'obligation sans oracle est refusée à la construction.
Une seule attestation native ne peut satisfaire simultanément des obligations
relevant de domaines différents. Les parcours délégués et autres topologies
nécessitent une qualification distincte. Le verdict décrit l'artefact borné
observé immédiatement, pas l'effet ultérieur en production.

La campagne `test_mission_outcome_falsification.js` mesure les mutations
structurelles avec fixtures signées et appelle directement deux stratégies
de l'oracle `subset_sum` sur des postconditions vraies et fausses. Elle ne
qualifie pas encore le parcours complet de promotion ni les autres domaines.
