# ADR 0261 — Détection des lacunes et buts d'apprentissage bornés

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, curriculum, curiosité, autorité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0247, ADR 0252, ADR 0259

## Contexte

Le curriculum GVX pouvait planifier des cibles fournies, mais ne calculait pas les lacunes
à partir des erreurs, échecs, progression d'apprentissage et distribution future.

## Décision

`gvxLearningGapDetector.detect` agrège ces sources par compétence et ne propose une lacune
que si elle apparaît dans au moins deux signaux et franchit le score minimal. Chaque but
indique ses références de source, son niveau épistémique, son rang et le statut
`proposed`. Ces buts peuvent être transmis au planificateur de curriculum existant, qui
applique ses propres vérifications de prérequis, d'autorité et de coût.

`proposeBackgroundGoals` exige explicitement un appel en arrière-plan et un adaptateur
d'autorité. L'autorité reçoit un budget maximal et un pas unique; les buts acceptés restent
des propositions nécessitant un dispatch externe. La détection ne lance aucun outil et ne
crée pas un objectif autonome persistant.

## Conséquences

- Le curriculum peut être alimenté par des signaux runtime au lieu d'exiger toutes ses
  cibles d'un appelant.
- Les poids et seuils sont initiaux et non calibrés; la proposition conserve les données
  qui ont contribué au classement.
- L'intégration des outcomes producteurs et l'orchestration de l'exécution restent à
  brancher.

## Alternatives

- Déduire un but d'une erreur unique : rejeté, car un incident transitoire pourrait imposer
  un curriculum inutile.
- Exécuter les objectifs d'apprentissage détectés sans contrôle : rejeté, car la détection
  ne confère ni autorité, ni budget de mission.
