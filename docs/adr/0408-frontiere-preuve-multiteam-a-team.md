# ADR 0408 — Frontière de preuve des sous-runs A-Team multiteam

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : A-Team, multiteam, autorité et preuves
- **Décideurs** : équipe GenOS
- **Lié à** : `docs/02-orchestration/topologies/a-team-politiques-runtime.md`

## Contexte

Le dispatch générique crée un TeamRun parent et lance ses workers. La politique
`multiteam` compose aussi un graphe de programme, mais aucun adaptateur ne crée
et n'exécute les TeamRuns enfants depuis ce dispatch. Le runner de programme
acceptait un retour `SUCCEEDED` fourni par l'appelant sans charger un sous-run
persisté ni vérifier ses membres, son autorité, son budget et ses preuves de clôture.

## Décision

Le dispatch générique refuse `multiteam` avant de créer le run ou de lancer des
workers. L'exécuteur commun refuse la clôture d'un TeamRun parent multiteam.
Le runner de programme refuse tout retour `SUCCEEDED` tant que le contrat de
preuve persistée des sous-runs n'est pas intégré. `WAITING` et `FAILED` restent
des observations possibles ; elles ne débloquent aucun successeur.

Pour lever ce refus, l'adaptateur devra créer des TeamRuns enfants liés à la
mission et au parent, affecter les membres et l'autorité déclarés, borner et
mesurer les budgets, puis produire les clôtures vérifiées et les preuves des
contrats inter-équipes. Le runner devra charger ces états persistés avant de
promouvoir une équipe ou le programme.

## Conséquences

- Le graphe de programme reste une planification, sans prétention de réussite.
- Les appels multiteam génériques échouent explicitement avec
  `ATEAM_MTS_EXECUTOR_REQUIRED` ; les faux reçus de succès échouent avec
  `ATEAM_MTS_SUBRUN_PROOF_REQUIRED`.
- Une intégration future doit fournir les preuves listées ci-dessus avant de
  réactiver la promotion ; cette décision ne les simule pas.

## Alternatives

- Accepter le `childRunId` et les références de preuve fournis par l'appelant :
  rejeté, car ils ne prouvent ni l'existence du run ni sa clôture valide.
- Assimiler la réussite du WorkGraph parent à celle des sous-équipes : rejeté,
  car aucun sous-run n'est exécuté par le dispatch générique.
