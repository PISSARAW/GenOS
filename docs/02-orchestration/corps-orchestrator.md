# Corps fonctionnel de l'orchestrator

GenOS ne traite plus le demarrage d'une mission d'orchestrator comme une simple
decision abstraite. Le backend Node construit maintenant un corps minimal avant
la supervision runtime : des percepts types, un etat du monde, des contrats
d'actionneurs et des reflexes deterministes.

La boucle incarnee vise le cycle suivant :

```text
percevoir -> interpreter -> decider -> agir -> sentir les consequences -> apprendre
```

## Percepts types

`backend/src/services/orchestratorBodyService.js` expose une couche sensorielle
pure. Chaque capteur produit un objet commun :

```json
{
  "kind": "metabolic_budget",
  "source": "proprioception",
  "value": { "tokens": 800 },
  "confidence": 1,
  "cost": 0.01,
  "timestamp": "2026-09-16T00:00:00.000Z"
}
```

Les capteurs implementes couvrent l'intention de mission, le workspace, le
terminal, le budget, la memoire spatiale, l'etat social des workers, le bail
d'outils, la dette de preuve et le temps.

## WorldState

Les percepts sont condenses en `worldState` avant toute action couteuse :

```json
{
  "budget": 800,
  "stress": 0.82,
  "uncertain": true,
  "threat": false,
  "activeWorkers": 1,
  "recentFailures": 2,
  "availableTools": ["genos_snapshot", "genos_run"],
  "evidenceDebt": ["no_replay_yet"]
}
```

Ce n'est pas une preuve de reussite. C'est une photographie sensorielle qui
donne au Director une base causale plus stable que le prompt brut.

## Actionneurs bornes

Le corps declare huit familles d'actionneurs : fichiers, terminal, workers,
strategie, memoire, navigateur, Git et securite. Chaque contrat expose ses
preconditions, son cout, son risque, ses permissions, la preuve attendue et le
caractere reversible ou non de l'action.

Ces contrats sont declaratifs pour l'instant : ils documentent et transportent
les limites attendues, mais n'autorisent pas seuls une action. Les gates, leases
et validations existants restent l'autorite effective.

## Reflexes actifs

Le bootstrap de mission appelle `incarnateOrchestrator()` apres le calcul du
bail d'outils et du budget runtime. Les reflexes appliques sont volontairement
peu nombreux et deterministes :

- `block_destructive_actuator` : gele le demarrage si un bail contient un outil
  destructif ou recursif interdit.
- `budget_conservation` : active `network_silence` et desactive le dispatch de
  nouveaux workers lorsque le budget descend sous le seuil ATP minimal.
- `failure_inflammation` : signale qu'une reprise ou escalade est requise apres
  echecs repetes.
- `evidence_debt_gate` : marque la mission comme exigeant une preuve typee
  avant promotion.

L'etat corporel complet est attache a `normalizedMission.orchestratorBody` et
publie dans la telemetrie via `ORCHESTRATOR_BODY_STATE`.

## Limites actuelles

Le corps est branche au control plane Node. Il ne pretend pas importer les
garanties du kernel biomimetique Rust : les concepts Rust restent separes tant
qu'un recu type ou une entree de journal primitive ne les relie pas a l'execution
Node. Les reflexes actuels protegent le demarrage et le dispatch ; la mesure des
consequences apres patch, test, navigateur ou worker reste a etendre par des
percepts post-action.