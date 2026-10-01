# Active Global Organism Workspace (AGOW)

AGOW relie les candidats cognitifs, la sélection par compétition, un frame borné,
son broadcast, les requêtes ciblées et le cycle suivant. Il s'agit d'un circuit
logiciel instrumentable. Son implémentation ne constitue pas une preuve de conscience
ni de médiation causale généralisée.

## Autorité et mode d'exécution

[ADR 0006](../adr/0006-active-global-organism-workspace.md) désigne le runtime Node
comme autorité AGOW. Le prototype Rust reste un prototype de conformance. Le service
historique `globalWorkspaceService` expose l'API AGOW tout en conservant ses fonctions
antérieures pour compatibilité.

`GENOS_AGOW_MODE` vaut `off` par défaut. Les missions restent alors sur leur chemin
historique. Les autres modes sont `shadow`, `advisory`, `bounded`,
`morphogenesis-shadow`, `live` et `experimental`. Pour l'intégration aux missions,
seul `bounded` confie l'autorité au frame AGOW. Les autres modes calculent en parallèle
et laissent le workspace historique contrôler la mission. `live` porte le statut
`awaiting_causal_promotion`; il ne contourne pas les preuves d'ablation et de
réplication.

## Circuit implémenté

```text
observation / mission
        ↓
candidateAdapterService ou perceptualLoopService
        ↓
validation → pool TTL/déduplication/contradictions
        ↓
contraintes dures → rang épistémique → Pareto → compétition inhibitrice
        ↓
ignition à fuite et période réfractaire
        ↓
WorkspaceFrame borné et lié au frame précédent
        ↓
Signal Plane → récepteurs enregistrés → reçus de livraison et d'effet
        ↓
Active Query → attention contrôlée → réponse soumise comme candidat
```

Les candidats portent des références compactes, des preuves, des parents causaux et
des mesures. Les producteurs ne décident pas du gagnant. Les contraintes `blocked`
excluent un candidat; les cas `review`, les contradictions et l'incertitude sévère
reçoivent une priorité explicite avant la compétition. L'ignition réutilise
`ignitionService.charge()` et ne crée aucun scheduler.

Les cinq contrats sont sous [`shared/agow/`](../../shared/agow/). L'adaptateur
`candidateAdapterService` normalise les observations des familles perception, modèle
du monde, mémoire, soi, métacognition, interoception, épistémique, worker, daemon et
efference. La boucle perceptive appelle aussi directement les services de binding et
de prédiction générative.

## API runtime

```js
const workspace = require('./globalWorkspaceService');

workspace.getMode();
await workspace.submitCandidate({ candidate });
const result = await workspace.cycle({ agentId, db });
const frame = workspace.getCurrentFrame({ agentId });
const query = workspace.query({ frame, capability: 'verification' });
```

`submitCandidate` valide et stocke le candidat avant de publier sa référence via le
Signal Plane. Un rejet de transport retire le nouveau candidat et retourne un résultat
explicite. `cycle` renvoie le nombre de candidats, l'arbitrage, les reçus d'ignition, le frame
et le résultat du broadcast. `query` utilise
`modelControlledAttentionService.reallocate`; `execute` appelle les modules fournis
par l'appelant et renvoie toute réponse candidate au Signal Plane.

Les récepteurs s'enregistrent avec
`workspaceReceiverRegistry.register({ module, handle })`. Le handler reçoit une phase
`inspect`, puis une phase `apply`. Un reçu de broadcast distingue consommation,
hashes d'état avant/après et changement déclaré. Si le handler échoue, le reçu indique
`consumed: false`. La médiation est agrégée par paire source→cible, mais ces reçus ne
prouvent pas à eux seuls que la transformation a causé un résultat de tâche.

La boucle perceptive prend une observation avec `vector` et `items`. Elle combine le
posterior précédent, le feedback du frame, le binding récurrent et les prédictions aux
niveaux mission/situation/objet. Une erreur supérieure au seuil produit un candidat
`prediction_error` et passe par la hiérarchie prédictive persistée.

## État de maturité

| Domaine | État dans cette tranche |
| --- | --- |
| Contrats, validation, pool, déduplication, TTL, contradictions | Implémenté en mémoire de processus |
| Arbitrage, contraintes, Pareto, compétition et ignition temporelle | Implémenté; réutilise l'ignition persistée existante |
| Frames bornés et causalité entre cycles | Implémenté en mémoire de processus |
| Broadcast Signal Plane et reçus de récepteurs | Implémenté; aucun récepteur métier n'est enregistré par défaut |
| Active Query et crédit d'attention | Services appelables; aucune requête n'est déclenchée automatiquement par le cycle |
| Perception récurrente et erreur hiérarchique | Services connectés et callable; pas branchés à toutes les sources d'observation runtime |
| Mission → AGOW | `bounded` prend le contrôle; modes d'observation gardent le chemin historique |
| Adaptateurs mémoire, soi, méta, interoception, workers et daemons | Normalisation disponible, branchements producteurs à réaliser |
| Efference, allostase et effets sur les politiques | Non intégrés au cycle AGOW |
| Morphogenesis, expériences `do()`, ablations et réplications holdout | Non intégrés; indicateurs non promus |
| Workspace Rust et stockage partagé multi-processus | Hors de cette tranche; le prototype Rust n'est pas runtime autoritaire |

Le pool, les frames, les reçus de broadcast, les crédits d'attention et les reçus de
médiation utilisent actuellement des stores mémoire par processus. La rétention après
redémarrage et la coordination entre processus ne sont donc pas garanties. Les tâches
expérimentales doivent mesurer les résultats externes (erreurs détectées, récupération,
calibration, efficacité et ressources), ignorer les déclarations textuelles, contrôler
les environnements et publier des reçus reproductibles avant toute promotion.

## Références d'implémentation

- `backend/src/services/agow/` — pool, sélection, frame, cycle, broadcast, query,
  crédit, médiation et boucle perceptive.
- `backend/src/services/globalWorkspaceService.js` — façade et soumission Signal Plane.
- `backend/src/services/agentRuntimeAdapter/missionPlanning.js` — intégration de mission
  par mode.
- [ADR 0006](../adr/0006-active-global-organism-workspace.md) — autorité et rollout.
