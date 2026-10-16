# ADR 0561 — Lier la mémoire négative au successeur planning-gap

- **Statut** : Accepté pour l’évaluation synthétique
- **Date** : 2026-10-16
- **Domaine** : Natural Search, planification, mémoire négative
- **Décideurs** : GenOS
- **Lié à** : ADR 0032, Natural Search Control Plane; ADR 0323, reprise atomique; ADR 0558, isolation du replay

## Contexte

Le contrôleur Natural Search et le solveur `planningGapPolicies` sont raccordés
uniquement pour le diagnostic de pression. Les trails produits par Phase 10 ne
changeaient aucun successeur; ils contiennent pourtant une assertion, un
environnement, des conditions, une portée, une preuve référencée et un TTL.
Un raccord limité peut être évalué lorsque la preuve identifie une transition
exacte comme strictement moins bonne que son alternative selon un oracle du
domaine. Une interdiction globale d’action ou une pénalité heuristique n'aurait pas la portée suffisante.

## Décision

1. Créer les trails par le point d’entrée de production
   `ActuatorModules.recordNegativeOutcome`, puis appliquer le contrat logiciel
   versionné `planning-gap-transition/v1`. Une
   assertion est l’identité exacte `(taskId, stateKey, action)`; son
   environnement est `planning-gap-task/v1:<taskId>`.
2. Le solveur ne saute un successeur que si la mémoire négative contient un
   trail actif du même agent, de portée `task`, avec cette identité exacte,
   condition `oracle-cost-dominated/v1`, référence `planning-gap-oracle/v1:`
   et confiance au moins `0,8`. Tout écart garde le successeur.
3. Conserver l’appel historique `genosPolicy(task, budget, agentTag)` et accepter
   un objet de contexte comme troisième argument pour l’évaluation appariée.
   L’option `useVerifiedNegativeMemory` désactive l’application sans retirer les
   trails, afin de comparer à entrées identiques.
4. Compter et retourner `prunedTransitions`. Un tie-break déterministe dérivé
   d’une graine de contexte ne départage que les nœuds déjà égaux sur coût et
   heuristique; les deux bras appariés reçoivent la même graine.
5. Utiliser une BFS indépendante du solveur pour attester, sur le corpus
   synthétique tenu à l’écart, les transitions dont le coût optimal après
   l’action est strictement supérieur au meilleur successeur. Vérifier ensuite
   les plans avec le vérificateur indépendant d’actions du corpus.

## Mesure de référence synthétique

La campagne `node backend/tests/search/test_natural_search_verified_negative_ablation.js`
crée chaque trail par `ActuatorModules.recordNegativeOutcome`, conserve les
identifiants retournés et vérifie leur présence dans la mémoire injectée au
solveur. Sur 8 labyrinthes synthétiques × 8 graines, au budget 240, les deux
bras réussissent 64/64 essais et sont optimaux 64/64 selon l’oracle BFS; le bras
avec application des trails consomme en moyenne 17,25 expansions contre 25,39
pour l’ablation, soit −8,14 expansions par essai. La réussite ne change pas.
L’artefact conservé est
`backend/tests/artifacts/natural-search-phase10-actuator-ablation.json`.
Cette mesure qualifie seulement l’effet sur ce corpus alimenté par des preuves
oracle privilégiées.

## Conséquences

### Positives

- Une preuve négative locale peut modifier une décision observable du frontier
  sans interdire le même geste dans un autre état ou une autre tâche.
- Bras complet et ablaté partagent le même objet mémoire, les mêmes tâches,
  graines et budgets; seule l’application du trail change.
- Le filtre fail-open conserve le successeur si le trail n’est pas exactement
  conforme au contrat.

### Négatives et limites

- Le contrat ne vérifie pas la signature ni l’authenticité de la référence
  d’oracle. C’est un contrat interne d’évaluation, pas une frontière de
  sécurité ni une preuve de production.
- Une BFS oracle peut produire une connaissance privilégiée du corpus; le
  résultat ne prouve pas un gain sur des tâches externes ni sur des agents qui
  n’ont pas reçu cette preuve.
- Ce raccord ne couvre que Phase 10. Les artefacts des Phases 6–9, 11 et 12
  restent sans mapping vers le planning-gap.

## Alternatives

- Réutiliser une assertion négative comme interdiction globale d’action : rejeté,
  car une action peut être mauvaise dans un état et optimale dans un autre.
- Ajouter une pénalité heuristique : rejeté pour cette expérience, car une
  transition certifiée strictement dominée fournit une intervention discrète et
  une hypothèse falsifiable sans poids arbitraire.
