# Régulation multi-boucles

## 1. Définition

GenOS ne traite pas le plan autonome comme le résultat d'un raisonnement central unique. Le plan est maintenant accompagné d'une trace de régulation multi-boucles : plusieurs régulateurs observent le même état, produisent des signaux standardisés, puis un arbitre calcule les corrections et veto applicables.

Le schéma opérationnel devient :

```text
percepts -> état -> régulateurs -> signaux de contrôle -> arbitrage -> plan -> feedback
```

La délibération reste possible, mais elle n'est qu'une boucle parmi d'autres. Les boucles rapides bloquent les dangers immédiats, les boucles lentes régulent le budget, la preuve, l'attention et le risque avant qu'une action soit promue.

## 2. Contrat implémenté

Le contrat est produit dans [backend/src/services/controlRegulationService.js](../../backend/src/services/controlRegulationService.js) et attaché à chaque plan créé par [backend/src/services/autonomousOrchestrationService.js](../../backend/src/services/autonomousOrchestrationService.js) sous `controlRegulation`.

Un signal suit cette forme :

```json
{
  "source": "immune",
  "target": "mutation",
  "direction": "require_evidence",
  "strength": 0.88,
  "reason": "high-risk or security work needs replayable evidence before mutation",
  "evidence": ["risk=high", "type=security"],
  "ttl": 1,
  "cost": 0
}
```

Directions autorisées :

- `allow`
- `inhibit`
- `amplify`
- `delay`
- `block`
- `require_evidence`

## 3. Boucles initiales

La première version garde un périmètre volontairement borné : elle rend les décisions observables sans remplacer les barrières existantes de preuve, de budget et de capacité.

| Boucle | Variable régulée | Effet principal |
| --- | --- | --- |
| `reflex` | veto de survie | bloque le fan-out si la dormance vitale est active |
| `homeostasis` | budget/tokens | inhibe le fan-out si la réserve ne finance pas les workers |
| `evidence` | dette de preuve | bloque la promotion si les phases d'évidence/replay sont absentes |
| `attention` | saillance | amplifie les diagnostics quand l'incertitude est forte |
| `immune` | blast radius | exige des preuves avant mutation en contexte risqué ou sécurité |

Ces boucles lisent l'état déjà calculé par le plan : profil de problème, survie, budget, phases omises, workers demandés et workers sélectionnés. Elles n'inventent pas un second état parallèle.

## 4. Arbitrage

L'arbitre applique une priorité stable :

```text
sécurité > preuve > budget > vitesse > exploration
```

Les signaux `block` sont des veto. Les signaux `require_evidence` ne bloquent pas toute exécution, mais gardent la promotion et la mutation sous contrainte explicite. Les signaux `allow` et `amplify` augmentent le score d'action ; `inhibit` et `delay` le diminuent.

La trace expose :

- `signals` : tous les signaux produits ;
- `regulators` : boucle, variable régulée et signaux associés ;
- `arbitration.vetoes` : veto effectifs ;
- `arbitration.requiredEvidence` : contraintes de preuve ;
- `arbitration.selectedCorrections` : corrections retenues ;
- `expectedFeedback` : observations attendues après action.

## 5. Télémétrie

Quand le plan de mission est assemblé, [backend/src/services/agentAutonomyPlanService.js](../../backend/src/services/agentAutonomyPlanService.js) émet `CONTROL_REGULATION_ARBITRATED`. L'événement porte la trace `controlRegulation` complète et suit le chemin standard de [backend/src/services/agentOrchestrationState.js](../../backend/src/services/agentOrchestrationState.js), donc ring buffer, SSE et persistance `telemetry_events`.

Cette trace remplace les explications opaques par une preuve exploitable : pourquoi une action est amplifiée, freinée, bloquée, ou rendue dépendante d'une preuve supplémentaire.

## 6. Limites

Cette version ne modifie pas encore les poids par apprentissage après outcome et ne remplace pas les gates existants. Elle ajoute la couche de mesure et d'arbitrage vérifiable qui permettra ensuite de renforcer les seuils, les habitudes de stratégie et les corrections apprises sans confondre transport réussi et décision valide.