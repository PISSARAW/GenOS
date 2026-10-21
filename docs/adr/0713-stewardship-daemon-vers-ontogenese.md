# ADR 0713 — Stewardship Daemon vers Ontogenèse

## Statut

Accepté — 2026-10-21.

## Contexte

L'ADR 0712 branche le Resident Daemon comme système sensoriel d'Ontogenèse. Ce
premier contrat est volontairement consultatif : les signaux réveillent le
contrôleur et orientent sa topologie, mais ne créent aucune responsabilité de
réparation. Cette frontière évite les faux positifs, au prix d'une boucle
incomplète : un finding `REPAIRABLE` peut rester durablement visible sans jamais
devenir du travail vérifiable.

## Décision

Un service de stewardship matérialise les findings éligibles en propositions
durables puis, selon la politique du projet, en tâches du backlog Ontogenèse.

- La politique par défaut accepte uniquement `REPAIRABLE`, exige un Daemon vivant
  et un index aligné sur le HEAD, et plafonne à trois tâches ouvertes.
- Les identifiants de proposition et de tâche sont déterministes sur le projet,
  le territoire, le finding et le HEAD. Les ticks répétés restent idempotents.
- La priorité combine la maturité du finding, la pression des phénotypes et les
  marqueurs stigmergiques du même périmètre.
- Une proposition encore en attente est bloquée et marquée `STALE` si le HEAD
  change ou si le finding quitte l'ensemble éligible.
- Un échec de tentative est observé sans fermer la proposition ; une intégration
  réussie la referme avec le SHA résultant. Ce retour mesure l'utilité du Daemon
  sans promouvoir le finding ni fabriquer de preuve.

Le service ne lance pas de worker, n'autorise pas une édition, ne valide aucun
check et ne pousse ni ne fusionne. La tâche générée traverse exactement les
barrières Ontogenèse existantes : enveloppe d'autorité, budget, revue, checks,
preuve de contenu et intégration locale.

## Configuration

`daemonStewardship` expose cinq réglages bornés : `enabled`, `autoEnqueue`,
`eligibleStatuses`, `maxOpenTasks` (0 à 20) et `requireLiveDaemon`. Les statuts
admissibles sont `REPAIRABLE`, `CAUSALLY_SUPPORTED` et `REPRODUCED`; seul le
premier est activé par défaut.

## Conséquences

Le Daemon devient un producteur autonome de responsabilités locales et reçoit
un retour durable sur leur intégration. La pression reste contrôlée, les
propositions obsolètes ne partent pas en exécution et le journal permet d'auditer
chaque transition. Un finding demeure une hypothèse d'entrée : seules les preuves
exécutées par Ontogenèse peuvent établir la réussite de la réparation.
