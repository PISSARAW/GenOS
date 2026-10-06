# Contrat runtime AGOW

- **Statut** : implémenté dans le backend Node ; activation soumise aux policies.
- **Portée** : branchements hôte, modes, requêtes, reçus et récupération locale.
- **Dernière revue** : 2026-10-06.
- **Décision** : [ADR 0333](../adr/0333-cloture-runtime-agow.md).

La [fiche AGOW](../02-orchestration/agow.md) décrit l'architecture. Ce document
précise les contrats exécutables et les limites de leur validation.

## 1. Brancher un hôte

La façade est `backend/src/services/globalWorkspaceService.js`.
`configureRuntime` associe les options à un couple **objet connexion SQLite / agent**.
Un autre agent ou une autre connexion ne reçoit pas ces callbacks. Les callbacks
sont des fonctions de processus ; après redémarrage, l'hôte doit les enregistrer
de nouveau. Les états et reçus sont distincts de ces fonctions.

```javascript
const release = workspace.configureRuntime({
  agentId, db,
  queryHandlers: { verifier: verifyInSandbox },
  queryCosts: { verifier: 0.1 },
  counterfactualExecutor: executeIsolatedBranch,
  modeExecutors: { CONSOLIDATE: proposeValidatedProcedure },
  maxQueryCost: 0.1
});
// Les options explicites du cycle surchargent les bindings de cet agent.
const result = await workspace.cycle({ agentId, db });
release();
```

Le callback `verifier` reçoit `{ query, frame, db, signal,
counterfactualExecutor }`. Il doit respecter `signal` et le budget transmis.
Un handler peut renvoyer `{ summary, candidate, outcome, realizedLoss }`.
Le candidat doit appartenir à l'agent du frame et passer les gardes d'admission.
Les références de preuve sont requises selon la policy.

Les extensions globales du registre restent possibles via `register` et
`registerQuery`. Elles s'appliquent à tout le processus ; préférer les bindings
d'agent pour des adaptateurs métier distincts. L'enregistrement des defaults
préserve les extensions déjà présentes. Une ancienne fonction de libération ne
supprime pas un handler qui l'a remplacée.

## 2. Modes exécutables

La sélection minimise la perte estimée parmi les modes disponibles. Les coûts
fournis par l'hôte sont transmis à la sélection. Les priors initiaux sont
heuristiques ; la calibration exige un outcome numérique observé.

| Mode | Exécution | Condition |
| --- | --- | --- |
| `ACT` | diffusion aux récepteurs enregistrés | absence de demande de revue globale |
| `OBSERVE` | requête perception / hiérarchie prédictive | lacune et requêtes autorisées |
| `VERIFY` | requête verifier / mémoire / modèle du monde | lacune et requêtes autorisées |
| `RECALL` | requête mémoire | requêtes autorisées, même sans lacune |
| `SIMULATE` | workspace shadow | policy autorisée et exécuteur disponible |
| `CONSOLIDATE` | compilation de trajectoires, proposition durable | policy de procéduralisation active ou callback hôte |
| `REORGANIZE` | proposition de partition par module | policy des marchés active ou callback hôte |
| `ABSTAIN` | abstention explicite | toujours disponible |

Les defaults de consolidation et réorganisation ne promeuvent aucune procédure
et n'activent aucune topologie. Les autorités de rejeu, preuve et promotion
restent nécessaires. Un callback manquant, une exception, une requête non
planifiée ou une simulation non déclenchée ne sont pas annoncés exécutés.

Un `cycle` retourne notamment `modeReceipt`, `modeResult`, `broadcast`,
`activeQuery` et `shadow`. Les trois derniers champs contiennent le résultat
du service appelé, sans un second wrapper de mode.

## 3. Outcome et calibration

```javascript
await workspace.observeCognitiveOutcome({
  agentId, db, receiptId: result.modeReceipt.receiptId,
  realizedLoss: independentlyMeasuredLoss
});
```

`realizedLoss` doit être un nombre fini positif ou nul. `null`, une chaîne ou
une absence de valeur ne deviennent jamais une perte nulle. Le mode observé
doit correspondre au mode choisi. Répéter la même observation est idempotent ;
une seconde valeur différente est rejetée. Le reçu conserve la perte prédite,
la perte réalisée et l'erreur prédictive. La persistance de cette valeur ne
constitue pas une vérification indépendante de la mesure.

## 4. Requêtes bornées

Avant chaque appel, l'exécuteur réserve son coût estimé dans le budget partagé.
Les modules suivants sont ignorés si le budget restant est insuffisant.
Le coût déclaré après l'appel doit être fini, non négatif et inférieur ou égal
à la réservation. Un dépassement est rejeté et ne reçoit aucun crédit d'attention.
Les coûts sont des unités déclarées par les adaptateurs, pas une mesure
universelle de tokens ou de dépenses financières.

L'échéance absolue est appliquée par un timer et un `AbortController`.
Le frame et la requête transmis sont clonés. Une réponse tardive ne peut plus
être admise par ce chemin. Une fonction JavaScript arbitraire peut continuer
après l'abandon : l'hôte doit fournir l'annulation coopérative et l'isolation
des effets externes. Le timer ne peut ni tuer cette fonction ni récupérer une
ressource déjà consommée.

Le frame de la requête doit être celui de l'exécution. La réservation d'une
lacune est atomique ; deux appels concurrents ne planifient pas deux requêtes
sur le même fingerprint durant le cooldown. Une requête en échec peut être
replanifiée. Les reçus de réponse et de budget sont durables.

Les defaults couvrent les modules des capacités déclarées. Le verifier par
défaut contrôle la structure des candidats et annonce explicitement l'absence
de vérification sémantique. Un vérificateur métier indépendant doit être fourni
par l'hôte. Les retours sans outcome mesuré ne calibrent pas la perte du mode.

## 5. Voies directes et récupération

La sélection respecte la liste des cibles autorisées. Une voie doit être
consolidée, autorisée par la policy, compatible avec le contexte, sans revue,
avec confiance ≥ 0,9, incertitude ≤ 0,25, sans contradiction, irréversibilité
ou erreur prédictive élevée.

Un échec, une exception ou une réponse directe sans candidat admis déclenche
la mesure d'outcome et la décompilation : suspension, réadmission d'un candidat
de revue et fallback vers les autres modules. Le fallback utilise le budget
et l'échéance restants. Une voie suspendue ne peut pas être publiée directement.
Un transport réussi n'est pas compté comme un `directPathHit` sans admission.

## 6. Persistance

Les états utilisent `adaptive_state(scope, key)` avec la clé agent. Les reçus
de modes, reçus de requêtes et réservations de lacunes utilisent une mise à jour
optimiste par version SQL, avec retries bornés en cas de contention. Les
rétentions sont respectivement de 2 000 reçus, 1 000 reçus et 1 000 fingerprints.

Le test de clôture vérifie deux connexions concurrentes, deux processus
indépendants, huit écritures conservées, isolation entre agents et réouverture
de la base. Il ne constitue pas un essai de charge de tous les stores AGOW.
Les autres scopes conservent leurs contrats transactionnels existants ; ne pas
extrapoler l'atomicité de ces trois journaux à tout le backend.

## 7. Vérifier et exploiter

```powershell
npm --prefix backend run test:agow
node benchmarks/agow/run-completion-campaign.cjs
```

Le [rapport de campagne](../06-qualite-preuves/campagne-agow-cloture.md) donne le
protocole, les résultats et les limites. Les artefacts locaux sont ignorés par
Git. Les [gates de preuve](../01-concepts/epistemologie-et-evidence.md) restent
applicables à toute activation réelle.

En cas d'échec, inspecter `modeResult.reason`, les raisons des réponses de
requête et les reçus de décompilation. Réenregistrer les callbacks après
reconnexion ; vérifier les policies et les coûts avant de relancer. Un manque
d'exécuteur shadow est une indisponibilité explicite, jamais une simulation
réussie. Une campagne synthétique réussie n'autorise pas le mode `live`.
