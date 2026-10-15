# ADR 0552 — Lier les effets d’une époque au reçu morphogénétique

- **Statut** : Accepté pour l’exécution du backend
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, reprise, preuve
- **Décideurs** : GenOS
- **Lié à** : ADR 0546, 0549

## Contexte

L’admission vérifiait une recette et un graphe préparé, mais le reçu ne désignait pas
encore de façon intègre la cohorte réellement recrutée, les budgets affectés, les
continuations et le verdict de mission. Le dispatch externe et SQLite ne partagent pas
de transaction. Redémarrer après le début de l’effet mais avant son accusé de réception
peut donc être ambigu.

## Décision

Sceller un `transitionId` avec un digest du candidat admis, de la base et recette
d’admission, du graphe compilé, ainsi que des workers réellement persistés (identifiant,
kind, topologie, variant, budget alloué). Propager cet identifiant dans la continuation
et le résultat terminal. Rejeter une résolution si le reçu est altéré, si les travailleurs
attendus ne correspondent pas, ou si l’oracle indépendant ne lie pas un livrable valide
à la même transition. Conserver séparément les allocations, l’usage rapporté et le
verdict de vérification.

Avant `startMission`, revendiquer atomiquement la continuation avec le changement
`pending → dispatching`. Une continuation encore `dispatching` après redémarrage devient
`recovery_required`; elle n’est jamais relancée automatiquement. Le balayage expose son
temps écoulé `durationMs`.

## Conséquences

- Une transition ne peut être déclarée résolue sur la base de résultats issus d’un autre
  graphe, d’une autre cohorte ou d’un autre budget.
- Un arrêt après la revendication peut geler une tâche que l’effet externe n’a pas encore
  commencé. L’opérateur doit réconcilier l’état avant reprise; ce compromis évite un
  double dispatch quand l’effet a pu démarrer.
- `durationMs` mesure le balayage borné d’un boot, pas la latence exacte par mission ni
  des percentiles historiques.
- Les tokens consommés et le coût du worker restent des valeurs rapportées par le runtime;
  leur collecte n’est pas une preuve comptable indépendante. Sans reçu oracle valide,
  le statut demeure non promu.

## Alternatives

- Rejouer toutes les lignes non `dispatched` au démarrage : rejeté, car le statut durable
  peut être en retard sur l’effet externe.
- Promouvoir sur un reçu de worker quelconque : rejeté, car il ne prouve pas la continuité
  entre candidat, admission, exécution effective et livrable.
