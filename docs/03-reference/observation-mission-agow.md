# Observation des missions AGOW

- **Statut** : Implémenté pour le backend Node ; raccord natif subset_sum, autres vérificateurs fournis par l'hôte
- **Dernière revue** : 2026-11-02
- **Décision** : [ADR 0766](../adr/0766-observation-mission-agow.md)

## Parcours runtime

`missionPlanning.attachAgowWorkspace` conserve le `modeReceipt` du cycle de
planification. Après création du run, `createMissionExecutionRun` appelle le bridge
pour ouvrir l'observation. Il faut une mission identifiée, un candidat sélectionné,
un frame réel de cette mission et son reçu durable de décision. Une absence produit
une raison explicite et n'invente pas de liaison.

Le parcours supervisé Node passe les événements terminaux à
`agowRuntimeIngressService`. Le bridge cherche la liaison par agent/run avant
l'admission du candidat outcome. Il ne prend pas le frame courant comme décision
d'origine. `AGENT_STEP` avec action `VERIFY` reste intermédiaire.

Les parcours natifs hors du raccord `subset_sum` décrit ci-dessous doivent appeler
`observeMissionOutcome` explicitement. Le mode AGOW `off` conserve le parcours
historique ; un journal en attente peut être traité explicitement après reprise.

## API hôte

Les méthodes sont exposées par `globalWorkspaceService` :

| Méthode | Entrées | Résultat |
| --- | --- | --- |
| `startMissionObservation` | `db`, `agentId`, `missionId`, `runId`, `candidateId`, `frameId`, `decisionReceiptId`, `controlAuthority` | Liaison durable, après relecture du frame et du reçu |
| `observeMissionOutcome` | `db`, `agentId`, `runId`, `event` | Mesures vérifiées ou état d'attente |
| `listMissionObservations` | `db`, `agentId` | Journal de cet agent |

`startMissionObservation` accepte aussi un identifiant optionnel
`measurementContract`. Ce contrat est inclus dans le hash de liaison et ne peut
pas être changé à la reprise. Le raccord standard natif le déclare lui-même.

```javascript
const release = workspace.configureRuntime({
  db, agentId,
  missionOutcomeTimeoutMs: 5000,
  missionOutcomeVerifier: async ({ binding, event, eventIdentity, signal }) => {
    const measured = await independentOracle({ binding, event, signal });
    return {
      verified: true,
      verifierId: measured.verifierId,
      bindingHash: binding.bindingHash,
      eventDigest: eventIdentity.eventDigest,
      evidenceRefs: measured.evidenceRefs,
      metrics: measured.metrics
    };
  }
});
```

Ce callback doit être installé par du code hôte de confiance, jamais construit à
partir d'un payload ou d'une fonction fournie par le modèle. Il doit examiner les
artefacts autoritatifs, vérifier leur lien à l'exécution et mesurer la tâche. Le
simple renvoi de `event.payload.success` ne constitue pas un oracle indépendant.
Le callback est isolé par connexion/agent, reçoit des copies et doit être réinstallé
après redémarrage ou changement de connexion. Le timeout est un entier de 1 à
60 000 ms ; son défaut est 5 000 ms.

Le contenu canonique transmis comprend `eventType`, `payload`, `action`, `detail`
et `status`, ainsi que l'identifiant terminal. Les identités de run, mission et
agent fournies par l'événement doivent correspondre à la liaison. Le payload est
une déclaration à vérifier, pas une source d'autorité.

## Mesures

| Champ | Domaine |
| --- | --- |
| `realizedLoss` | Nombre fini ≥ 0 ; obligatoire, jamais inféré d'un événement |
| `goalProgress`, `resourceReserve`, `missionStability` | Nombre entre 0 et 1 ou `null` si inconnu |
| `blockageEvents`, `viabilityViolations` | Entier sûr ≥ 0 ou `null` si inconnu |

Les six champs sont explicites ; une dimension absente n'est pas remplacée par
zéro. Les références de preuve doivent être non vides. L'hôte définit les unités,
l'horizon et les règles de mesure avant une campagne. La validation structurelle
du raccord n'atteste pas, à elle seule, la sémantique des métriques.

### Oracle métier natif `subset_sum`

Le [raccord natif](../adr/0767-mesures-agow-depuis-oracle-natif.md) ajoute le contrat
`genos.agow.native-subset-outcome/v1` à la liaison avant exécution. Il est reconnu
pour `subset_sum` avec `procedural_executor`, ainsi que les enveloppes natives
`scoped_procedure`, `host_procedure` et `niche_procedure` de ce calcul. Un
vérificateur hôte explicite garde la priorité sur cet adaptateur standard.

Le runtime déterministe observe son événement terminal après l'application des
contrôles existants. L'adaptateur relit le run terminé, son identité de mission,
son reçu biologique, son budget et les observations canoniques appliquées. Il
recoupe l'acceptation native scellée, ses références et les deux preuves métier
indépendantes via `nativeOracleProof.assertCompletedEvidence`.

La métrique est binaire et bornée aux postconditions du résultat `subset_sum`
enregistré. Une acceptation revalidée donne perte 0 et progression 1. Les autres
dimensions restent `null`. L'absence ou le rejet d'une preuve produit un état
d'attente, jamais une perte synthétique. Le raccord ne change aucun verdict
natif et ne crédite aucune politique AGOW.

```powershell
node backend/tests/test_agow_native_mission.js
```

Cette qualification utilise la vraie délégation, les contrats, les autorités,
les snapshots et deux processus d'oracle. Son provisionnement est un environnement
local de test ; elle ne sollicite aucun LLM et ne qualifie pas le superviseur
de processus. Les autres domaines natifs exigent un adaptateur explicite.

## États et reprise

`awaiting_outcome → verification_pending → verified`

Une mesure peut être validée avec une perte élevée : `verified` qualifie les
mesures et ne remplace pas le verdict officiel de mission. Les reçus conservent
`promotionAllowed: false` et `policyUpdated: false` lorsqu'ils sont vérifiés.
La perte mesurée n'est pas créditée dans `observeCognitiveOutcome`.

Une absence de vérificateur donne `verifier_unavailable`, une expiration donne
`verifier_timeout`, un échec donne `verification_failed`. Le même événement peut
être resoumis après réparation. Un autre identifiant ou contenu terminal est un
conflit, pas un écrasement. Une mesure déjà vérifiée est retournée sans nouvel appel.
Les observations concurrentes passent par le contrôle de version SQLite existant.

La rétention conserve au plus 2 000 runs par agent ; le journal refuse les nouvelles
liaisons au plafond. Aucun endpoint MCP, changement de lease ou nouveau privilège
n'est ajouté.

## Exécution locale

```powershell
npm --prefix backend run test:agow:mission
node benchmarks/agow-mission/run.cjs
node benchmarks/agow-mission/verify.cjs <repertoire-retourne>
```

Voir le [démonstrateur](../../benchmarks/agow-mission/README.md). Les tests
d'intégration simulent le transport et la création du run pour contrôler le
raccord ; le démonstrateur exécute le vrai cycle et la livraison locale AGOW,
puis deux processus distincts. Aucun des deux ne qualifie un déploiement distribué.
