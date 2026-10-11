# ADR 0424 — Observation des sous-runs A-Team sans promotion

## Statut

Accepté le 11 octobre 2026.

## Contexte

Le runner de programme crée des TeamRuns enfants sous l'autorité du parent,
mais ne peut pas authentifier une clôture de programme. Accepter directement
le retour de `executeTeam` ou des callbacks `verifyBudget` et
`verifyContracts` confondrait des valeurs choisies par l'appelant avec une
preuve indépendante de consommation et d'acceptation des contrats.

## Décision

- Le runner relit le TeamRun enfant et son WorkGraph persistés. Le run doit
  garder le lien exact programme, équipe, parent, mission, orchestrateur, budget
  et membres ; il doit être `COMPLETED/DEBRIEF`, avec intégration acceptée et
  gate passé. Tous les nœuds doivent être `SUCCEEDED` avec références de preuve
  et les dépendances bloquantes acceptées.
- Si cette clôture persiste, le programme conserve `WAITING` et signale
  `childExecutionObserved: true`. Il ne copie pas la consommation ou les
  contrats annoncés par `executeTeam`, et n'émet pas `SUCCEEDED`.
- Une future promotion exige une autorité serveur contrôlant des reçus
  durables et authentifiés pour le budget et les contrats inter-équipes.
  Les callbacks injectables ne satisfont pas cette condition.
- Le dispatch générique reste fermé à `multiteam` ; ce chemin concerne le
  runner de programme et son adaptateur `executeTeam` explicite.

## Conséquences

Une préparation de sous-run ou un retour `SUCCEEDED` isolé ne débloque pas
les équipes suivantes. La clôture persistée est observable, mais elle ne
constitue pas une attestation indépendante de budget ou des contrats. Les
dépendants restent bloqués et le programme ne peut pas réussir par cette voie.
