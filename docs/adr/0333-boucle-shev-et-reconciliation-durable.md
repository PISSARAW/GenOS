# ADR 0333 — Boucle SHEV et réconciliation durable

- Statut : Accepté
- Date : 2026-10-06
- Domaine : SHEV, Ontogenèse, surveillance, récupération, GVX, évaluation

## Contexte

Les protocoles SHEV existaient comme services appelables, sans raccordement
systématique de la perception, vérification post-intégration, surveillance et
exécution des jobs autorisés au tick. Une réussite de transport ou de tâche ne
doit jamais valoir preuve de bénéfice ni autoriser le rejeu d’un effet ambigu.

## Décision

Le tick Ontogenèse appelle le runtime SHEV sous son claim et son fence.
Les contrats de capteurs sont signés, immuables et liés à la version du mandat.
Les mesures, effets, surveillances et progrès restent append-only. Les jobs
persistés conservent leurs preuves pour une reprise bornée ; les états inchangés
ne produisent pas de missions et la responsabilité active interdit le backlog
générique de remplissage.

Les actions métier et expériences de développement utilisent un fournisseur
opérateur dont le module est épinglé par digest. Une approbation signée fixe
scope, budget et échéance. Un token protège la finalisation ; l’annulation est
transmise au fournisseur. Un résultat externe ambigu reste en exécution jusqu’à
une réconciliation signée et inspectée. Une récupération appliquée programme
une mesure neuve, sans déclarer elle-même la récupération vérifiée.

Le reçu de progrès GVX exige un manifeste d’entraînement et des contextes
réservés distincts ; il reste séparé du résultat du projet. Le quorum qualitatif
compte les identités distinctes. Une comparaison longitudinale exige un protocole
persisté avant les mesures, les mêmes conditions sur quatre bras et trois
références : généraliste, audit planifié et GenOS sans SHEV.

## Conséquences

La migration `114-shev-runtime` ajoute capteurs, jobs et protocoles, ainsi que
les champs de fencing des récupérations. Les anciens appels internes restent
compatibles ; le module monitoringService réexporte le nouveau service et les
récupérations. Les nouvelles exigences de manifeste et de préenregistrement
refusent les évaluations anciennes qui ne fournissent pas cette provenance.

La CLI locale expose les contrats administratifs. Elle ne remplace pas
l’authentification d’une application distante. Les dépendances et effets du
fournisseur restent sous contrôle opérateur. La qualification de terrain et
les comparaisons causales restent à mener ; les fixtures valident les contrats.

## Alternatives

- Appels manuels de chaque service : raccordement incomplet et reprise difficile.
- Retry automatique après erreur externe : risque d’appliquer deux fois un effet.
- Fournisseur choisi par une observation : accorderait une autorité à une donnée.
- Comparaison rétroactivement datée : permettrait la sélection après résultat.

## Vérification

Suites SHEV, audits web et Ontogenèse ; scénario Git/SQLite sur deux domaines,
pause, crash après application, réouverture et réconciliation. Tests des budgets
cumulés, annulations, jobs GVX, calibration et préenregistrement.
Voir [SHEV](../02-orchestration/shev.md) et
[exploitation](../03-reference/exploitation-shev.md).
