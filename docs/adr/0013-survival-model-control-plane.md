# ADR 0013 — Modèle de survie dans le control plane

- **Statut** : Accepté
- **Date** : 2026-09-16
- **Domaine** : orchestration, budgets, sûreté, biomimétisme
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [architecture de survie](../02-orchestration/architecture-survie.md)

## Contexte

Le plan autonome optimisait la mission et son budget, tandis que les réflexes du
corps intervenaient après la construction du plan. Une composition ultérieure,
notamment Trinity ou A-Team, pouvait donc produire un fan-out incompatible avec
un état vital dégradé. Les métaphores biologiques ne formaient pas un contrat de
contrôle commun et mesurable.

## Décision

Introduire un modèle pur et déterministe entre les signaux du monde et le plan :

1. dériver un `SurvivalState` borné ;
2. détecter des pressions nommées ;
3. produire des actions et contraintes sans effet de bord ;
4. appliquer la limite de fan-out avant le plan et après toute recomposition ;
5. exposer le même diagnostic dans le corps de l'orchestrator ;
6. ne jamais assimiler intention, transport ou métaphore à une preuve d'action.

La reproduction reste interdite sans validation indépendante. La mutation est
bornée par un blast radius explicite. La menace doit être observée et ne peut pas
être déduite du seul niveau de risque contractuel.

## Conséquences

### Positives

- La consommation future devient un invariant du plan, pas un correctif tardif.
- Tous les modes de composition partagent la même limite de population.
- Le diagnostic et ses seuils sont sérialisables, testables et auditables.
- Les barrières de preuve existantes restent l'autorité de promotion.

### Négatives

- Les seuils statiques devront être calibrés avec de la télémétrie réelle.
- La dormance n'a pas encore de réveil persistant unifié.
- Plusieurs actions restent des intentions jusqu'à intégration avec un exécuteur
  capable de produire des reçus causaux.

## Alternatives

- **Réflexes uniquement après planification** : rejeté, car un plan invalide est
  déjà construit et peut être réélargi par une composition tardive.
- **Politique propre à chaque organisme** : rejeté à ce stade, car elle dupliquerait
  les invariants de budget, preuve et capacité porteuse.
- **Implémentation Rust uniquement** : rejetée pour cette étape, car le dispatch
  effectif des workers est décidé dans le control plane Node.