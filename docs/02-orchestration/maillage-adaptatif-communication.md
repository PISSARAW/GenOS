# Maillage adaptatif de communication

- **Statut** : Implémenté dans les cycles et checkpoints Node ; observation par défaut.
- **Portée** : réduction déterministe d'audience au sein d'une mission et d'une organisation.
- **Dernière revue** : 2026-11-04.

## Comportement

Le maillage transforme une proposition de communication en un ensemble borné
d'arêtes émetteur → destinataire. Il valide d'abord la mission, le projet,
l'organisation et les relations. Pour un signal facultatif ne contenant que
des références sémantiques, il conserve les destinataires encore concernés,
puis au plus trois destinataires par défaut. L'expertise courante, le nombre
de références inconnues et l'identifiant rendent le classement déterministe.

Il réutilise le Signal Plane. La réduction ne déclenche aucune génération de
texte, ne réinjecte pas de conversation et ne demande pas au modèle de choisir
ses voisins. Elle ne remplace pas le moteur qui décide initialement si une
communication est nécessaire.

## Activation

| Mode | Effet |
| --- | --- |
| `off` | Retour de la décision initiale sans lecture du contexte du maillage. |
| `shadow` | Audience livrée inchangée, proposition du maillage dans le reçu. Défaut. |
| `active` | Admission de mission et routage sélectif appliqués avant livraison. |

Configuration de processus :

```bash
GENOS_COMMUNICATION_MESH_MODE=shadow
# Passer à active après inspection des propositions sur les missions concernées.
```

Configuration explicite d'un cycle interne :

```js
const { runCycle } = require('./backend/src/services/communication/runCycleDriver');

const result = await runCycle({
  db,
  intent: {
    senderAgentId: 'worker-source',
    missionId: 'mission-persisted',
    purpose: 'inform',
    risk: 'low',
    urgency: 0.7,
    domain: 'proofs',
    requiresAction: false,
    independenceRequired: false,
    semanticRefs: ['proof:artifact:v3:sha256:...']
  },
  opts: {
    executionMode: 'live',
    mesh: { mode: 'active', maxFanout: 3 }
  }
});

const audit = result.decision.meta.adaptiveMesh;
```

Les identifiants de cet exemple doivent être remplacés par des identités déjà
attachées dans `missions` et `mission_agents`. Le propriétaire doit être un
orchestrateur ; les agents sont ce propriétaire ou ses enfants directs. Les
workspaces doivent partager la même organisation et le même projet.

L'absence de `requestedAudience` autorise la réduction facultative. Une liste
explicite décrit des destinataires à préserver et n'est pas tronquée au degré
facultatif. Une liste explicite vide ne permet aucune destination.

Un checkpoint reçoit les mêmes options dans `communication.mesh`, son identité
de mission dans `missionId` et ses références dans `evidence.semanticRefs`.
Le pont de fin de mission propage cette identité automatiquement. La présence
d'un artefact ou d'un résumé opaque empêche de conclure que tout le contenu
était déjà connu à partir des seules références.

## Ce qui reste protégé

Le maillage conserve les références et destinataires proposés pour les demandes
d'action, risques non faibles, urgences élevées, rétractations, contradictions,
invalidations, handoffs, transitions topologiques et audiences indépendantes.
Les quorums et les destinataires explicitement nommés gardent leur cardinalité.
Les règles d'admission restent obligatoires : si une audience obligatoire
contient une destination refusée, toute la livraison est bloquée et le motif
figure dans le reçu.

Le maillage ne permet pas de traverser les frontières d'un comité centralisé,
d'une organisation scellée ou d'une revue aveugle. Une relation amicale ou un
score d'expertise élevé ne crée aucune autorité.

Le grounding final conserve le niveau de preuve initial ou le renforce selon
le profil relationnel. Le coût du renforcement est ajouté avant la réservation
de budget du checkpoint. Un message publié n'est toujours pas un message
compris ou une action vérifiée.

Une revalidation immédiatement avant livraison refuse un plan dont les membres,
l'organisation, le périmètre ou les exigences relationnelles ont changé.
L'enveloppe transporte le périmètre canonique et le payload `communicationMesh`
porte mission, orchestrateur, organisation et version. Le digest existant
scelle aussi cette provenance. Cette vérification reste une lecture préalable,
sans transaction commune avec tous les adaptateurs possibles.

## Lire le reçu

`decision.meta.adaptiveMesh` expose :

| Champ | Sens |
| --- | --- |
| `schemaVersion` | `genos.adaptive-communication-mesh/v1`. |
| `mode`, `status` | `proposed` en shadow valide, `applied` en actif valide, `blocked` ou `skipped`. |
| `missionId`, `scope` | Identité de mission et périmètre persisté utilisés. |
| `orchestratorId` | Propriétaire canonique de la mission. |
| `organization`, `organizationVersion` | Organisation effective observée. |
| `intentFingerprint`, `planFingerprint` | Empreintes des champs structurels ; une intention ou un plan modifié est refusé avant livraison. |
| `proposedRecipients` | Audience proposée ; seule `decision.recipients` décrit l'audience finale. |
| `edges` | Arêtes dirigées, score d'expertise et références inconnues. |
| `excluded` | Destinataires exclus et motifs individuels. |
| `semanticRefs` | Union des références nécessaires aux destinataires retenus. |
| `protected` | Audience protégée contre la réduction facultative. |
| `originalRecipientCount`, `selectedRecipientCount` | Taille initiale et taille proposée, sans valeur probante sur les tokens. |
| `adaptation`, `learning` | `context_adaptive`, `none`. |
| `tokenSavingsVerified` | Toujours `false` ; le routage ne mesure pas une économie complète de modèle. |

Un contrôle ultérieur de variante, canal ou budget peut encore refuser un plan
`applied`. Il faut lire la décision finale et le résultat de livraison avec
ce plan ; le plan seul n'est pas une preuve de publication.

Les motifs `MESH_MISSION_REQUIRED`, `MESH_SCOPE_MISMATCH`,
`MESH_REQUIRED_RECIPIENT_DENIED` et `MESH_CONTEXT_UNAVAILABLE` expliquent un
refus. Les exclusions `MESH_COMMON_GROUND_LEDGER` désignent le registre de
connaissance ; `MESH_FANOUT_LIMIT` désigne la limite facultative. Elles ne
prétendent pas démontrer une perte ou un gain de qualité métier.

## Adaptation et limites

Le graphe change quand les expertises, membres, politiques ou connaissances
changent. Une connaissance `stale`, `revoked`, `contradicted` ou expirée ne
supprime plus la référence. Les domaines sont séparés, même si le même
identifiant de référence apparaît dans deux domaines.

Common Ground ne garantit pas la présence effective du contenu dans le contexte
d'un modèle. La visibilité et la matérialisation G-CIR gardent leur propre
contrat. Cette version n'apprend pas depuis les publications, accusés de
transport ou résultats simulés ; elle n'utilise pas les poids synaptiques
comme preuves d'utilité.

L'intégration est postérieure au premier calcul d'utilité : une décision déjà
silencieuse ne sera pas réactivée. Les coûts estimés restent conservateurs et
distincts des reçus réels d'usage modèle. Le transport natif peut attester zéro
appel modèle dans son périmètre de livraison, sans couvrir la génération en
amont ni la cognition ultérieure.

Ce maillage est local au contrôle Node. Il n'ajoute pas de routage multi-sauts,
de convergence multi-machine ou de persistance globale de graphe. Les appels
directs aux autres API de publication conservent leur propre contrat.

## Vérification

```bash
npm --prefix backend run test:communication-mesh
node backend/tests/test_communication_live_cycle.js
node backend/tests/test_communication_native_comparison.js
node backend/tests/test_communication_checkpoint_live_team.js
```

La suite dédiée utilise SQLite réel. Elle teste le confinement, le déterminisme,
le mode shadow, les obligations, le retour d'une référence révoquée et l'absence
d'apprentissage depuis la livraison. Son test d'intégration compare notamment
cinq destinataires proposés à deux réellement inscrits dans les livraisons
natives, puis contrôle les mêmes références dans le payload et l'enveloppe.
Il ne constitue pas un benchmark de qualité métier ou d'économie de tokens.
Les schémas JSON d'intention et de décision sont validés avec AJV2020 sur les
résultats runtime, y compris les refus de topologie, canal et budget.

## Sources de code

- [Admission de contexte](../../backend/src/services/communication/adaptiveMeshContext.js).
- [Planification déterministe](../../backend/src/services/communication/adaptiveMeshPlanner.js).
- [Application et audit](../../backend/src/services/communication/adaptiveCommunicationMesh.js).
- [Revalidation de livraison](../../backend/src/services/communication/adaptiveMeshDeliveryGuard.js).
- [Livraison effective](../../backend/src/services/communication/liveCycleExecution.js).
- [ADR 0787](../adr/0787-maillage-adaptatif-de-communication.md).
