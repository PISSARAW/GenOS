# Analyse d'échec — Mission Orchestration Babel-Gödel (D:)

> **État actuel : validation réussie le 5 novembre 2026.** La mission
> `mission_babel_qualified_b2e9f089-379e-49f5-a02b-c8ccaa1a44ba` est
> `completed`, avec oracle indépendant accepté, quatre runs terminés,
> budgets persistés et 232 génomes importés. Voir les sections 8 et 9.
> Les sections 1 à 6 décrivent l’échec initial du 4 novembre et ses pistes
> de diagnostic ; elles ne constituent pas le statut de la relance.

**Date** : 2026-11-04  
**Mission** : Équation Polyglotte de Babel-Gödel, $N = (A \times B) + C^D - E$  
**Résultat mathématique annoncé** : $N = 10\,805$ (réponse du worker Ollama ; cette déclaration ne constitue pas un reçu d’oracle indépendant)
**Statut GenOS initial, le 4 novembre** : ÉCHEC (statut `error`, mission incomplete, aucun génome persistant à cette date)

---

## 1. Ce qui a réussi

Le cœur mathématique a été résolu par le worker local (Ollama `llama3.1:8b`) dispatché par GenOS :

| Axiome | Valeur | Source |
|--------|--------|--------|
| A | 8 | 4 (quatre couleurs) × 2 (ATP nets glycolyse cytosolique eucaryote) |
| B | 20 | 4 murs avec étagères × 5 étagères/mur (Bibliothèque de Babel) |
| C | 22 | Port TCP historique SSH |
| D | 3 | Trois générations de fermions (Modèle Standard) |
| E | 3 | 6e mot de l'énoncé C = « port » → consonnes p, r, t |

$$N = (8 \times 20) + 22^3 - 3 = 160 + 10\,648 - 3 = 10\,805$$

Le worker Ollama a confirmé dans son artefact :
- *"L'Équation Polyglotte de Babel-Goedel a été résolue avec succès sur le système de fichiers D:."*
- *"Le résultat attendu N = 10805 a été obtenu avec succès."*

---

## 2. Échec initial du 4 novembre 2026 — historique

| Élément | État initial | Diagnostic initial ou rectification |
|---------|------|-------|
| 4 workers biome créés | ✅ | Topologie `biome` composée correctement |
| `runtime_pid` des workers | `null` pour tous | Ce champ ne démontre pas une absence d’exécution : les runtimes locaux peuvent s’exécuter dans le processus hôte |
| Budget `executionBudget` | ❌ `undefined` dans le contexte enfant | Non propagé du payload vers `childBudget`/`parentBudget` |
| Preuves validées | ❌ Aucune preuve de clôture acceptée | Barrière de preuve non franchie ; cela ne prouve pas une absence d’appel modèle |
| Génomes persistants (`agent_genomes`) | ❌ Vide à cette date | L’activation et l’import ADN sont nécessaires ; un succès ne garantit pas la création automatique de génomes |
| Statut final orchestrateur | ❌ `error` | `biome dispatch did not complete every required worker with valid evidence` |
| Morphogenèse | ❌ Non complétée | Barrière de complétion biome non franchie |

---

## 3. Premières corrections rapportées — historique, rectifié en section 7

### 3.1 `backend/src/services/topology/topologyResultAppliers/biome.cjs` (NOUVEAU)
L'appliqueur de topologie `biome` manquait complètement. `topologyResultApplier.cjs` cherchait `./topologyResultAppliers/biome.cjs` et ne le trouvait pas → `TOPOLOGY_RESULT_APPLIER_UNAVAILABLE`. Créé avec une fonction `apply` retournant `applied: true`.

### 3.2 `backend/bin/workerLaunchPayload.cjs`
Forcé `localRuntime: true` pour tous les workers afin d'éviter la dépendance à Ollama pour l'exécution et d'éviter les erreurs de pipe EPIPE sur Windows.

### 3.3 `backend/src/services/workerCellThreadRuntime.js`
Ajout de la création automatique d'épisode et de thread d'orchestrateur par défaut dans `ensureDispatched` quand `missionScope` est absent (corrige `MISSION_EPISODE_SCOPE_UNAVAILABLE`).

### 3.4 `backend/src/services/missionProtocols/windowsBudget.js`
Le validateur Windows exigeait `latencyMs > 0` strictement. Ajout de valeurs par défaut (`latencyMs: 60000`, `tokens: 0`, `costUsd: 0`) quand les champs sont absents ou invalides, au lieu de lever `WINDOWS_PROTOCOL_BUDGET_INVALID`.

---

## 4. Pistes du diagnostic initial — résolues ou rectifiées en sections 7 à 9

### 4.1 Propagation du budget `executionBudget` (BLOQUANT)
Le payload contient `executionBudget: {tokens: 5000, costUsd: 1.0, latencyMs: 60000}`, mais les logs des workers montrent `[BudgetCoherence] Budget undefined is missing or invalid (undefined)`. Le budget n'est pas transmis du contexte orchestrateur vers le contexte worker dans le chemin biome. Il faut vérifier que `selectedBudget(member, context.request)` dans `workerLaunchPayload.cjs` reçoit bien `context.request.executionBudget`.

### 4.2 Lancement effectif des workers biome (BLOQUANT)
Le diagnostic initial relevait `runtime_pid: null` et `latest_run_status: failed`.
Le runtime local peut utiliser `missionProtocols/runtime.runInProcess` pour
exécuter le worker déterministe ou le worker Ollama : un PID distinct par
worker n’est donc pas requis. Le critère utile est un run terminé, avec budget,
preuve et acceptation d’oracle persistés. Les quatre runs de la relance sont
`completed` alors que leurs champs `runtime_pid` restent `null`.

### 4.3 Format d'artefact attendu
Le worker Ollama a produit un artefact avec `outcome: "success"` et `claims`, mais le validateur GenOS attendait un `dossier` avec `code_fix` substantié (code `INVALID_WORKER_ARTIFACT`, problème `dossier.code_fix.unsubstantiated`). Il faut aligner le format de sortie du worker sur le contrat attendu par le biome (artefact `dossier` pour les specialists, `scout_observation` pour les scouts).

### 4.3 Barrière de complétion biome
Même avec des workers fonctionnels, la completion nécessite : `requiredMemberIds` tous complétés, `evidenceRefs` non vide, `independent_oracle` présent, `completion_invariants` satisfaits. Il faut implémenter ou activer l'oracle indépendant et les invariants de complétion.

### 4.4 Persistance des génomes (ADN)
Le constat initial était une table `agent_genomes` vide. L’explication par une
ontogenèse non atteinte et la promesse de création automatique étaient des
déductions incorrectes. La relance active `GENOS_AGENT_DNA=1`, importe le
catalogue `.dna` et lie les sélections signées aux workers ; voir la section 8.

---

## 5. Plan initial de requalification — exécuté et rectifié en sections 7 à 9

1. Corriger la propagation du `executionBudget` dans `workerLaunchPayload.cjs` / `directWorkerBudgetScope.cjs`.
2. Confirmer l’exécution des workers par les runs et reçus persistés ; un `runtime_pid` non nul n’est pas un critère de preuve pour un runtime local dans le processus hôte.
3. Aligner le format d'artefact worker sur le contrat biome attendu (`dossier` / `scout_observation`).
4. Implémenter/activer l'oracle indépendant et les invariants de complétion biome.
5. Relancer la mission avec `mode: "biome"`, `strategy: "biome"`, `executionBudget` complet, `workspace_root: "D:\genos-babel-goedel"`, `workspaceScopeId: "ws-babel-goedel"`.

---

## 6. Conclusion du constat initial

Le résultat mathématique annoncé est $N = 10\,805$. Une réponse positive d’Ollama ne suffit pas à qualifier ce résultat de **vérifié par GenOS**. Le constat historique est un échec de clôture ; un `runtime_pid` nul ne permet pas, à lui seul, de conclure qu’aucun worker ne s’est exécuté.

## 7. Rectification du câblage (2026-11-05)

L’appliqueur inconditionnel a été remplacé par le raccordement des reçus
natifs vérifiés au runtime écologique et à l’oracle signé existant. Les
vagues conservent désormais tous les membres, le dispatch conserve le lien
de session et de cellule, et les allocations explicites des membres sont
transmises sans dépasser le parent. La détection de correctifs distingue les
affirmations mathématiques des revendications de modification logicielle.

L’import des `.dna` peut reprendre après une première tentative sans ADN ou
avec un catalogue vide et fonctionne pour plusieurs bases dans le même
processus. Il nécessite `GENOS_AGENT_DNA=1`. Une mission réussie ne garantit
donc pas automatiquement une nouvelle entrée dans `agent_genomes`.

La qualification automatique utilise quatre workers natifs avec des contrats
exécutables explicites. Elle ne vaut pas relance de la mission historique
Babel-Gödel avec `llama3.1:8b`. Pour celle-ci, fournir les contrats des scouts
et specialists et un sujet sémantique que les oracles indépendants savent
vérifier ; une phrase « N = 10805 obtenu avec succès » ne suffit pas.

Voir [la décision de clôture Biome](../adr/2026-11-05-cloture-biome-depuis-runs-verifies.md).

## 8. Requalification réelle sur D: (2026-11-05)

La mission `mission_babel_qualified_b2e9f089-379e-49f5-a02b-c8ccaa1a44ba`
est désormais **validée et persistée comme `completed`** dans la base active
`D:\GenOS\data\operational\genos.db`, avec le workspace
`D:\genos-babel-goedel`. Son contrat de clôture retourne `succeeded`, sans
raison de refus, et ses quatre contrôles de clôture sont vrais.

| Contrôle | Preuve observée |
|---|---|
| Réponse arithmétique | Les deux spécialistes `ollama://llama3.1:8b` ont produit `N = 10805` |
| Appels réels | Tentatives fournisseur terminées, 6 112 tokens mesurés au total |
| Oracle des spécialistes | Deux processus indépendants par spécialiste ; stratégies BigInt et additions répétées |
| Oracle collectif | Reçu signé indépendant couvrant les quatre références de workers |
| Session écologique | `biome-3fd9d40e-ce5c-4156-80b0-e2325fd30d3e`, révision 2, `goal_achieved` |
| Cycle de vie | Mission et épisode `completed` ; cinq cellules `completed_execution` |
| Homéostasie | Transition autorisée et revalidée contre l’époque des preuves d’exécution |
| ADN cognitif | `GENOS_AGENT_DNA=1` dans la configuration locale ; 232 génomes persistés |
| Héritage effectif | Sélections signées `WorkspaceSnapshotter` et `CapsuleLifecycle`, hashes et sources `.dna` revalidés |

Les tentatives de requalification ont exposé le retour des agents modèle à
`idle` par le garage et l’absence de transition persistante après la clôture
écologique. Une tentative sous forte charge a été refusée sur expiration du
budget d’oracle de 30 secondes. La relance finale conserve ces bornes et
utilise l’identité de l’implémentation finale du vérificateur. Sa vérification
relit les reçus archivés sans réautoriser une mission déjà terminée.

Le reçu d’oracle collectif est
`sha256:014ad4b8ff65dcb5bb6a7426a254459af13dab90e300289497e59457aad5cf91`.
L’épisode clôturé est `episode_9908dedf3d93ad95597c742b4712b276`.
Le rapport a été vérifié le 5 novembre 2026 à 00:26:39 UTC.

L’ADN provient du catalogue `.dna` importé puis sélectionné pour les workers.
Les bindings biologiques de chaque run sont également persistés. Cela ne
constitue pas une synthèse de nouveaux génomes cognitifs à partir du succès.
La preuve arithmétique porte sur les axiomes fournis dans l’énoncé historique.

Le rapport machine et les enveloppes restent des artefacts locaux, non
versionnés, sous `.genos-agent-worlds/babel-live/<mission-id>/`. La relecture
sans nouvel appel de modèle utilise :

```powershell
node examples/babel-goedel/qualify.cjs --verify-run mission_babel_qualified_b2e9f089-379e-49f5-a02b-c8ccaa1a44ba
```

Une nouvelle exécution bornée utilise :

```powershell
node examples/babel-goedel/qualify.cjs D:\genos-babel-goedel
```

## 9. Contrôles de régression de la requalification

La relecture du 5 novembre à 01:24:16 UTC confirme à nouveau le verdict,
l’oracle, les 232 génomes et les cinq cellules clôturées, près d’une heure
après l’exécution. Elle utilise la base active et les reçus archivés.

| Contrôle | Résultat |
|---|---|
| Qualité du code | 9 260 fichiers vérifiés, aucune violation |
| `cargo test --workspace` | 1 248 tests passés, aucun échec |
| `npm test` complet | Terminé avec code zéro le 5 novembre 2026 |
| Suite Biome | 31 programmes passés |
| Fin du profil workers | 22 programmes passés, dont les oracles Lean réels |
| Inventaire et composition | 28 suites passées |
| GQEL V2 | 50 tests passés ; réponses de modèle synthétiques dans cette suite |

Les contrôles généraux ont révélé deux défauts de fixture. Le test de cycle
de vie natif réutilisait un snapshot immuable sous le même chemin du dépôt :
il utilise désormais un workspace temporaire propre et passe deux fois de
suite. Le faux relecteur GQEL ne reconnaissait que les calibrations narratives ;
il reconnaît aussi celles du code et atteint maintenant le refus attendu
`EXECUTION_PROOF_MISSING`. Les règles de preuve du runtime restent actives.

Le reçu des principes fondateurs était également périmé. Sa
[requalification par onze programmes et 44 sources stables](../06-qualite-preuves/requalification-babel-goedel-2026-11-05.md)
est conservée avec le périmètre exact du checkout, dont une modification MCP
locale préexistante. Ce reçu maintient `authorizesPromotion: false`.

Les journaux complets et les rapports machine sont conservés localement
dans `.genos-agent-worlds/` ; les bases, secrets et artefacts bruts ne sont
pas ajoutés au dépôt.
