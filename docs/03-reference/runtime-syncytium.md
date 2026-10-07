# Runtime Syncytium : contrats et preuves

- **Statut** : Implémenté pour les contrats Node décrits ; garanties bornées à leur portée.
- **Portée** : admission, persistance, réplication et clôture du runtime Node Syncytium.
- **Dernière revue** : 2026-10-06.
- **Référence de validation** : commit `4c4d4f33`, [ADR 0331](../adr/0331-syncytium-rejeu-causal-et-preuve-de-completion.md).

Cette fiche décrit les services Node actuels. Le [modèle Syncytium](../02-orchestration/topologies/syncytium.md)
présente aussi une architecture cible ; le [protocole de missions](../02-orchestration/topologies/protocole-missions-syncytium.md)
définit les oracles et les campagnes à exécuter. Une réponse transport réussie
ne constitue pas une preuve de complétion.

## Services et activation

| Point d'entrée | Responsabilité |
| --- | --- |
| [syncytiumCoordinationService.js](../../backend/src/services/syncytiumCoordinationService.js) | Session, admission, transactions, snapshots, historique, réplication et branches. |
| [variantPolicyRegistry.js](../../backend/src/services/syncytium/variants/variantPolicyRegistry.js) | Sélection des 13 variants et création de la session de politique. |
| [syncytiumMissionCompletionService.js](../../backend/src/services/syncytiumMissionCompletionService.js) | Validation de l'état partagé et combinaison avec l'oracle des workers. |
| [topologySessionTools.js](../../backend/src/services/topologySessionTools.js) | Adaptation des opérations de session au dispatch MCP. |

Le dispatch biologique Syncytium active `configuration.useVariantRuntime: true`
par défaut. Une valeur explicite `false` conserve la session générique de politique.
Un appel Node direct à `createPolicySession` doit fournir `true` pour activer le
service spécialisé ; le défaut du dispatch ne s'applique pas à cet appel direct.
Les métadonnées publiées proviennent du schéma de la session réellement créée.

Les préconditions du variant restent obligatoires : `authorityMembers` pour Hard,
`regions` et `sharedContracts` pour Hierarchical, `nuclei` contenant au moins
un noyau de `kind: "human"` pour Human–AI. L'identité des principaux et noyaux
reste vérifiée par les opérations concernées. Une politique sélectionnée ne
prouve pas que ses opérations métier ont été exécutées.

## Admission, causalité et identité

Le rejeu suit les dépendances causales, sans dépendre de l'ordre des horloges
murales. Le voyage temporel retient une histoire causalement fermée. L'admission
publique refuse une dépendance manquante, un dot invalide ou un dot déjà utilisé.
Les registres multivaleurs distinguent concurrence et remplacement causal ;
les suppressions de séquence sont conservées même si l'insertion arrive ensuite.
Les registres LWW et les maps utilisent les estampilles causales du runtime.

Un `opId` connu ne peut pas être réutilisé avec un contenu incompatible :
l'identité canonique comprend l'acteur, le rôle, le domaine, la transaction et
l'opération typée. Un retry compatible est idempotent. La compaction conserve
les identités enregistrées et l'horloge Lamport. Un ancien checkpoint qui ne
contient pas ces empreintes ne permet pas de reconstruire une identité perdue.

Les mutations CRDT et ioniques sont préparées sur un candidat. Avec `options.db`,
la session, sa révision, l'opération estampillée et l'événement sont persistés
atomiquement ; un refus de commit restaure l'état en mémoire. Sans base injectée,
la session reste volatile. Voir [persistance et données](persistance-et-donnees.md).

## Réplicas et spéculation

Une partition conserve la frontière causale réellement observée par le réplica.
Les opérations hors ligne ne récupèrent pas rétroactivement les observations du
serveur. Leur admission vérifie l'acteur, les champs autorisés, les invariants,
le plafond et l'échéance ; une requête ne peut pas relâcher la politique du schéma.
La réconciliation précède l'accusé de réception des opérations en attente.
Un réplica retiré ne peut plus admettre de nouvelles opérations.

La promotion spéculative réévalue l'état principal et publie de nouveaux événements
causaux sur celui-ci. Elle conserve la provenance de branche au lieu de réutiliser
ses dots locaux. Les contrôles d'autorité et d'invariants du service de coordination
restent distincts des gates de preuve supplémentaires de la façade spécialisée.
L'opération MCP `promote` appelle le service de coordination ; elle ne fournit
pas à elle seule les preuves exigées par cette façade.

Les lectures Node qui acceptent `options.domainId` projettent les snapshots,
les snapshots historiques et l'historique ; les résultats de jonction et de
réconciliation suivent aussi leur domaine demandé. Les résultats sont des copies.
Cette projection ne constitue pas une authentification du consommateur.

## Surfaces MCP et Node

`genos_biological_mode` crée la session lors de la composition biologique.
`genos_topology_session` prend un `session_id` et une `operation` autorisés
par la lease. La topologie stockée de la session détermine le gestionnaire ;
un `mode` fourni par l'appelant ne change pas cette topologie.

| Opérations MCP Syncytium | Portée actuelle |
| --- | --- |
| `snapshot`, `schema`, `domains`, `history`, `replicas`, `health`, `events` | Inspection de la session entière dans l'adaptateur actuel. |
| `apply` | Opération `op` ou `transaction` ; `domain_id` est transmis à l'admission. |
| `explain`, `conflicts` | Explication et inspection des conflits. |
| `branch`, `promote` | Création et promotion via le service de coordination. |
| `invariants` | Définitions du schéma et contrôles manuels stockés. |
| `morphogenesis` | Conseil de transition ; aucune transition automatique. |

L'adaptateur MCP ne relaie pas `domain_id` aux inspections ci-dessus. Les reçus
d'exécution des prédicats se lisent dans `health.consistency.invariantReceipts`,
puis dans `stateValidation` lors de la clôture. La liste MCP `invariants` seule
n'atteste pas leur exécution. `createSnapshot`, `listSnapshots`,
`reconcileReplica`, `acknowledgeReplica` et `validateSession` sont des API Node,
pas des noms d'opération de cet adaptateur. Voir [outils MCP](outils-mcp.md).

## Preuve de complétion

Le chemin de clôture du dispatch biologique combine deux contrôles :

- `semanticValidation` : oracle de mission complet, couverture du nombre attendu
  de workers, chaque membre terminé et aucune défaillance de dispatch ;
- `stateValidation` : état autoritatif évalué côté serveur, de portée
  `verificationScope: "committed_shared_state"`.

`validateSession(sessionId, options)` produit ce second reçu :

| Condition de l'état | Motif de refus |
| --- | --- |
| Au moins une opération CRDT : `shared.totalOps > 0`. | `EMPTY_SHARED_STATE` |
| Cohérence des prédicats déclarés et des contrôles manuels d'invariants. | `FAILED_SHARED_INVARIANTS` |
| Snapshot matérialisé correspondant au `totalOps` courant. | `MATERIALIZATION_MISSING_OR_STALE` |
| Aucun réplica avec opération hors ligne en attente. | `OFFLINE_OPERATIONS_PENDING` |
| Session et éléments de preuve accessibles. | `SESSION_EVIDENCE_UNAVAILABLE` |

Le reçu contient `status` (`verified` ou `incomplete`), `reasons`,
`sessionId`, `stateVersion`, `snapshotId`, `causalFrontier`, `invariants`
et `failedInvariants`. En cas d'indisponibilité, il contient le motif et
`errorCode`, sans inventer les données d'état manquantes.

Des flux ioniques seuls ne satisfont pas le critère d'état CRDT non vide.
Un schéma sans prédicats ne fournit pas une preuve métier exhaustive. Le reçu
ne vérifie pas que chaque réplica est actif ou à la frontière courante ; il
n'atteste pas une convergence distribuée universelle. Il ne constitue pas une
attestation cryptographique, ni une preuve de durabilité SQLite sans base.
Créer un snapshot ne suffit pas à terminer les workers ou leur oracle.

Quand les contrôles de clôture échouent, la mission reste `partial` avec
`complete: false`. Le lanceur des six niveaux exige aussi la validation sémantique
complète et `stateValidation.status: "verified"` ; un niveau partiel produit
un code de sortie d'échec.

## Exemple Node minimal

Depuis la racine du dépôt, ce script vérifie l'état d'une session volatile.
Il illustre le reçu d'état, sans simuler une mission worker ni une persistance SQLite.

```javascript
const assert = require('node:assert/strict');
const syncytium = require('./backend/src/services/syncytiumCoordinationService');
const completion = require('./backend/src/services/syncytiumMissionCompletionService');

async function main() {
  const session = await syncytium.createSession('Rapport commun', {
    schema: {
      fields: { result: { dataType: 'LWW_REGISTER' } },
      invariants: [{ id: 'result-present', predicate: { op: 'present', path: 'result' } }]
    }
  });
  await syncytium.applyOperation(session.sessionId, {
    opId: 'rapport-1', actorId: 'redacteur',
    kind: { type: 'set_field', key: 'result', value: 'rapport' }
  });
  const pending = await completion.validateSession(session.sessionId);
  assert.ok(pending.reasons.includes('MATERIALIZATION_MISSING_OR_STALE'));
  await syncytium.createSnapshot(session.sessionId);
  const receipt = await completion.validateSession(session.sessionId);
  assert.equal(receipt.status, 'verified');
  assert.equal(receipt.verificationScope, 'committed_shared_state');
  assert.equal(receipt.stateVersion, 1);
  await syncytium.closeSession(session.sessionId);
  console.log('Syncytium : reçu d’état vérifié');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
```

## Refus à conserver dans les traces

| Code | Interprétation |
| --- | --- |
| `SYNCYTIUM_CAUSAL_GAP` | Dépendance causale absente à l'admission. |
| `SYNCYTIUM_CAUSAL_DOT_INVALID` / `SYNCYTIUM_CAUSAL_DOT_REUSED` | Dot invalide ou déjà attribué. |
| `SYNCYTIUM_OPERATION_ID_CONFLICT` | Retry dont le contenu contredit l'identité enregistrée. |
| `SYNCYTIUM_OFFLINE_POLICY_INVALID` / `SYNCYTIUM_OFFLINE_REJECTED` | Politique ou admission hors ligne refusée. |
| `SYNCYTIUM_OFFLINE_OPERATION_EXPIRED` | Échéance hors ligne dépassée. |
| `SYNCYTIUM_REPLICA_ACTOR_MISMATCH` / `SYNCYTIUM_REPLICA_RETIRED` | Acteur incompatible ou réplica retiré. |
| `SYNCYTIUM_RECONCILIATION_CAUSAL_GAP` | Contexte requis absent lors de la réconciliation. |
| `SYNCYTIUM_INVARIANT_VIOLATION` | Mutation qui viole un invariant. |
| `SYNCYTIUM_PERSISTENCE_FAILURE` | Échec de persistance ; aucune réussite de commit à annoncer. |

## Vérification et limites

Depuis la racine : `npm --prefix backend run test:syncytium` découvre les fichiers
`test_syncytium*.js`, puis lance chacun dans un processus isolé avec un timeout
de 120 secondes. Le `npm test` du backend inclut ce profil.

Au relevé du 6 octobre associé au commit `4c4d4f33`, **45 suites couvrant les
13 variants** et le `npm test` racine ont réussi. Ces résultats fonctionnels
ne mesurent pas un gain de coordination ou de performance. Les 48 fixtures de
routage sont déterministes ; les 52 missions LLM proposées dans le protocole
n'ont pas été certifiées par ce relevé. Le gate de qualité global était en échec
et `cargo test --workspace` n'a pas terminé, faute d'espace disque au linking.
Les limites et le périmètre du contrôle différentiel sont conservés dans le
[relevé des vérifications](../02-orchestration/topologies/protocole-missions-syncytium.md#relevé-local-des-vérifications).

Le watchdog persiste son journal, le journal fail-safe et la sortie sûre dans
une même transaction préconditionnée. L'ordonnanceur EDF reste logiciel : ni
WCET mesuré universel, ni temps réel dur, ni contrôleur matériel ne sont certifiés.
Les bundles d'anti-entropie ne fournissent pas un transport distribué ; les
éditions compensatoires ne révoquent pas les effets externes déjà exécutés.
