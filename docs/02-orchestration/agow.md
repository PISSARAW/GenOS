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
Signal Plane. Sauf `triggerCycle: false`, une admission valide déclenche un cycle. Un
rejet de transport retire le nouveau candidat et retourne un résultat explicite.
`cycle` renvoie le nombre de candidats, l'arbitrage, les reçus d'ignition, le frame,
le broadcast et, si une lacune est détectée, la requête active. `query` utilise
`modelControlledAttentionService.reallocate`; `execute` appelle les modules fournis
par l'appelant ou les handlers enregistrés par défaut. Les modules intégrés rappellent
la mémoire autobiographique, calibrent le soi et consultent le sensorium persistant.
Une réponse vérifie le seuil de preuves et entre dans le pool sans déclencher de cycle
récursif.

Les récepteurs s'enregistrent avec
`workspaceReceiverRegistry.register({ module, handle })`. Le handler reçoit une phase
`inspect`, puis une phase `apply`. Un reçu de broadcast distingue consommation,
hashes d'état avant/après et changement déclaré. Si le handler échoue, le reçu indique
`consumed: false`. La médiation est agrégée par paire source→cible, mais ces reçus ne
prouvent pas à eux seuls que la transformation a causé un résultat de tâche.

Le premier broadcast enregistre les récepteurs intégrés de mémoire, modèle du monde,
soi, interoception et métacognition. Les observations `PERCEPTION_OBSERVED`, les
résultats finaux worker et les conséquences d'action efférentes entrent dans le pool
quand `GENOS_AGOW_MODE` n'est pas `off`. Les cycles sans ignition ne remplacent pas le
frame courant. Les requêtes identiques sont limitées par une empreinte de lacune et
un délai de cinq minutes.

La boucle perceptive prend une observation avec `vector` et `items`. Elle combine le
posterior précédent, le feedback du frame, le binding récurrent et les prédictions aux
niveaux mission/situation/objet. Une erreur supérieure au seuil produit un candidat
`prediction_error` et passe par la hiérarchie prédictive persistée.

## État de maturité

| Domaine | État dans cette tranche |
| --- | --- |
| Contrats, validation, pool, déduplication, TTL, contradictions | Implémenté; état dans `adaptive_state`, isolé par agent |
| Arbitrage, contraintes, Pareto, compétition et ignition temporelle | Implémenté; réutilise l'ignition persistée existante |
| Frames, reçus, médiation et crédit | Implémenté et persisté dans `adaptive_state` |
| Broadcast Signal Plane et récepteurs intégrés | Enregistrés par défaut au premier broadcast; reçus durables |
| Active Query et crédit d'attention | Déclenchés sur lacune, bornés par politique, délai anti-répétition persistant |
| Perception récurrente et erreur hiérarchique | Branchées aux événements `PERCEPTION_OBSERVED` |
| Mission → AGOW | `bounded` prend le contrôle; modes d'observation gardent le chemin historique |
| Résultats worker et efférence | Candidats runtime; le récepteur efférence met à jour modèle du monde et soi |
| Interoception, allostase et méta | Récepteurs alimentent les politiques de budget et le seuil de preuve |
| Daemons et morphogenèse | Le broadcast mesure le territoire lié au workspace et applique un préflight morphogenèse en shadow; aucune transition morphologique n'est commise |
| Ablation et médiation contrôlée | Runner exécutable; requiert un adaptateur d'exécution et entrées fournies |
| Réplication holdout | Campagne exigeant au moins trois runs, seeds et corpus distincts; aucune promotion automatique |
| Workspace Rust et stockage partagé multi-processus | Hors de cette tranche; le prototype Rust n'est pas runtime autoritaire |

Les stores relisent et écrivent via `adaptive_state`; l'isolation multi-processus suit
la base backend configurée. Le runner `agowExperimentService.run` compare les bras
`full` et ablations ciblées; `runControlledMediation` supprime le broadcast pour le
bras témoin; `runReplicationCampaign` exige trois corpus et seeds distincts dans un
même manifeste d'environnement. Chaque reçu conserve les résultats par cas, les
empreintes et les agrégats de succès, erreurs, coût et latence. L'adaptateur fourni
par l'appelant doit réellement exécuter chaque condition et garantir le snapshot
initial. Les sorties restent descriptives (`promotionDecision: null`); aucun holdout
indépendant n'a encore été exécuté ni validé. Chaque runner exige un protocole
préenregistré (hypothèse, métrique primaire, plan d'analyse); une campagne vérifie
l'unicité des seeds et la disjonction des identifiants de cas.

Une preuve de réplication scientifique et le transfert d'autorité Rust demeurent hors
de cette tranche. Voir [ADR 0007](../adr/0007-agow-runtime-persistence-et-evaluation.md).

## Références d'implémentation

- `backend/src/services/agow/` — pool, sélection, frame, cycle, broadcast, query,
  crédit, médiation et boucle perceptive.
- `backend/src/services/globalWorkspaceService.js` — façade et soumission Signal Plane.
- `backend/src/services/agentRuntimeAdapter/missionPlanning.js` — intégration de mission
  par mode.
- [ADR 0006](../adr/0006-active-global-organism-workspace.md) — autorité et rollout.
