# ADR 0294 — Reprise de campagne longitudinale Holobionte

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Holobionte, benchmark
- **Lié à** : ADR 0105, ADR 0293

## Contexte

Le service longitudinal agrégeait des résultats fournis par un appelant, sans
commande opérateur ni journal de reprise. Il ne lançait aucun des douze bras.

## Décision

Une commande charge un manifeste de 50 à 100 missions et un module adaptateur
explicitement désigné, dont le fichier est épinglé par SHA-256. L'adaptateur
fournit un exécuteur pour chacun des douze bras. Le runner impose leur ordre,
valide les résultats avant journalisation et transmet le budget restant. Il
écrit le rapport avant le marqueur de campagne terminée; un rapport déjà écrit
peut être reconnu lors d'une reprise si son contenu concorde.

## Limites

Le dépôt ne fournit pas encore les douze adaptateurs, le corpus longitudinal
ou ses oracles. Le hash du fichier adaptateur ne couvre pas ses dépendances.
Les coûts et tokens restent déclarés par l'adaptateur. Les références de preuve
et l'indépendance effective des vérificateurs ne sont pas établies par ce runner.
Un rapport complet ne prouve donc la réussite métier qu'après vérification des
artefacts et des oracles archivés.
