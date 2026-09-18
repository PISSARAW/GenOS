# Régulation multi-boucles

## 1. Définition

GenOS ne traite pas le plan autonome comme le résultat d'un raisonnement central unique. Le plan est maintenant accompagné d'une trace de régulation multi-boucles : plusieurs régulateurs observent le même état, produisent des signaux standardisés, puis un arbitre calcule les corrections et veto applicables.

Le schéma opérationnel devient :

```text
percepts -> état -> régulateurs -> signaux de contrôle -> arbitrage -> plan -> feedback
```

La délibération reste possible, mais elle n'est qu'une boucle parmi d'autres. Les boucles rapides bloquent les dangers immédiats, les boucles lentes régulent le budget, la preuve, l'attention et le risque avant qu'une action soit promue.

## 2. Contrat implémenté

Le contrat est produit dans [backend/src/services/controlRegulationService.js](../../backend/src/services/controlRegulationService.js) et attaché à chaque plan créé par [backend/src/services/autonomousOrchestrationService/index.js](../../backend/src/services/autonomousOrchestrationService/index.js) sous `controlRegulation`.

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
- `convergence` : neuf axes bornés, leur base d'observation et leurs preuves ;
- `arbitration.vetoes` : veto effectifs ;
- `arbitration.requiredEvidence` : contraintes de preuve ;
- `arbitration.selectedCorrections` : corrections retenues ;
- `expectedFeedback` : observations attendues après action.

## 5. Matrice de convergence

La matrice `genos.convergence-matrix/v1alpha1` mesure neuf propriétés : situation,
autobiographie, modèle de soi, incarnation, homéostasie, cognition sociale,
résilience écologique, ancrage physique et discipline de preuve. Chaque axe porte
un score borné, une `basis` (`proxy` ou `unobserved`) et les observations utilisées.
Un axe absent vaut zéro : le runtime ne transforme jamais une métaphore en capacité.

Le score agrégé sert à l'observabilité, jamais à déclarer une conscience ou à
lever une barrière. L'arbitre produit séparément un `actionMode` :

- `execute` : action ordinaire autorisée par les autres gates ;
- `probe` : incertitude ou risque élevé, donc action réversible sans édition ;
- `blocked` : un veto sur le plan d'action ou le fan-out empêche l'exécution.

Un veto ciblant seulement la promotion ne bloque pas les diagnostics : il garde
la mission en `probe` jusqu'à obtention des preuves attendues.

`humanReviewRequired` devient vrai quand risque et incertitude sont simultanément
élevés. Dans `probe`, la politique runtime force `allowFileEdits=false` et
`requiresEvidenceBeforePromotion=true`. Une réussite de transport ne change pas
ces contraintes.

## 6. Télémétrie

Quand le plan de mission est assemblé, [backend/src/services/agentAutonomyPlanService.js](../../backend/src/services/agentAutonomyPlanService.js) émet `CONTROL_REGULATION_ARBITRATED`. L'événement porte la trace `controlRegulation` complète et suit le chemin standard de [backend/src/services/agentOrchestrationState.js](../../backend/src/services/agentOrchestrationState.js), donc ring buffer, SSE et persistance `telemetry_events`.

Cette trace remplace les explications opaques par une preuve exploitable : pourquoi une action est amplifiée, freinée, bloquée, ou rendue dépendante d'une preuve supplémentaire.

## 7. Limites

Cette version ne modifie pas encore les poids par apprentissage après outcome et
ne remplace pas les gates existants. Plusieurs axes restent des proxys : le nombre
de workers ne prouve pas leur diversité, et risque plus budget ne constituent pas
une simulation physique complète. Le rappel autobiographique vaut explicitement
zéro tant qu'il n'est pas fourni au plan. La matrice décrit donc la couverture
opérationnelle observée, pas une personnalité, une émotion ou une conscience.
