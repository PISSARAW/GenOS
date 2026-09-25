# Corps fonctionnel de l'orchestrator

- **Statut** : Partiel
- **Portée** : incarnation initiale et contraintes du control plane Node.js.
- **Dernière revue** : 2026-09-25

GenOS ne traite pas le démarrage d'une mission comme une simple décision
abstraite. Le backend Node construit un corps minimal avant la supervision
runtime : des percepts typés, un état du monde, des contrats d'actionneurs et
des réflexes déterministes. Ce document décrit ce qui est effectivement
branché au bootstrap d'une mission ; les boucles sensorielles continues et la
mesure systématique des conséquences restent hors périmètre.

La boucle incarnee vise le cycle suivant :

```text
percevoir -> interpreter -> decider -> agir -> sentir les consequences -> apprendre
```

## Percepts typés

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

## Actionneurs bornés

Le corps declare huit familles d'actionneurs : fichiers, terminal, workers,
strategie, memoire, navigateur, Git et securite. Chaque contrat expose ses
preconditions, son cout, son risque, ses permissions, la preuve attendue et le
caractere reversible ou non de l'action.

Ces contrats sont declaratifs pour l'instant : ils documentent et transportent
les limites attendues, mais n'autorisent pas seuls une action. Les gates, leases
et validations existants restent l'autorite effective.

## Réflexes actifs

Le bootstrap de mission appelle `incarnateOrchestrator()` après le calcul du
bail d'outils et du budget runtime. Les réflexes appliqués sont volontairement
peu nombreux et déterministes :

- `block_destructive_actuator` : gèle le démarrage si un bail contient un outil
  destructif ou recursif interdit.
- `budget_conservation` : active `network_silence` et désactive le dispatch de
  nouveaux workers lorsque le budget descend sous le seuil ATP minimal.
- `failure_inflammation` : signale qu'une reprise ou escalade est requise après
  échecs répétés.
- `evidence_debt_gate` : marque la mission comme exigeant une preuve typee
  avant promotion.

L'état corporel complet est attaché à `normalizedMission.orchestratorBody` et
publié dans la télémétrie via `ORCHESTRATOR_BODY_STATE`.

## Ordre de construction et effets

| Étape | Entrée | Résultat vérifiable | Autorité effective |
| --- | --- | --- | --- |
| Construire le contexte sensoriel | mission normalisée, budget, workspace, bail, état runtime | tableau de percepts typés et horodatés | `orchestratorBodyService` |
| Condenser le monde | percepts présents et signaux disponibles | `worldState` borné, avec provenance des signaux | `orchestratorBodyService` |
| Évaluer les réflexes | `worldState`, lease et seuils de budget | liste de réflexes et leurs raisons | `orchestratorBodyService` |
| Incarnation avant lancement | corps et plan d'autonomie | corps attaché à la mission et événement `ORCHESTRATOR_BODY_STATE` | `missionPlanning` |
| Appliquer les contraintes | réflexes de blocage, budget et preuve | gel ou ajustement du dispatch et exigence de preuve | `missionPlanning`, gates existants |

L'événement corporel atteste la construction du contexte. Il ne certifie ni
l'exécution d'un actionneur ni le résultat d'une action. Le journal d'action,
le reçu de preuve et la barrière de promotion restent les sources de décision.

## Invariants d'exploitation

- Un percept absent demeure absent ; le corps ne doit pas fabriquer un signal
  de succès ou une preuve à partir d'une valeur par défaut.
- Les contrats d'actionneurs décrivent le coût, le risque, les préconditions,
  les permissions et la preuve attendue ; ils ne créent pas ces permissions.
- Un bail destructif ou récursif interdit bloque le bootstrap concerné avant le
  dispatch des workers.
- Le budget faible peut réduire ou arrêter le dispatch ; il ne peut pas relever
  le plafond de tokens ni contourner le contrôle d'abordabilité.
- Les réflexes restent déterministes et explicables par leur identifiant et
  leur raison, pour que la décision soit vérifiable dans la télémétrie.

## Vérification

Le test ciblé est
[`backend/tests/test_orchestrator_body.js`](../../backend/tests/test_orchestrator_body.js).
Il couvre la construction du corps, des réflexes de preuve et d'interdiction,
ainsi que le chemin de dormance. Il ne démontre pas la perception post-action
sur un navigateur, un terminal ou un worker réel.

## Limites actuelles

Le corps est branché au control plane Node. Il ne prétend pas importer les
garanties du kernel biomimétique Rust : les concepts Rust restent séparés tant
qu'un reçu typé ou une entrée de journal primitive ne les relie pas à l'exécution
Node. Les réflexes actuels protègent le démarrage et le dispatch ; la mesure des
conséquences après patch, test, navigateur ou worker reste à étendre par des
percepts post-action.
