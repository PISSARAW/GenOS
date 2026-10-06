# Runtime Metapopulation

- **Statut** : runtime régional implémenté ; qualification produit expérimentale
- **Portée** : API Node, persistance SQLite, adaptateurs et reprise bornée
- **Dernière revue** : 2026-10-06
- **Version de référence** : commit `5b18c834`

## 1. Points d'entrée et prérequis

La façade [metapopulationCoordinationService.js](../../backend/src/services/metapopulationCoordinationService.js)
expose la composition, les sessions, patches, dèmes, corridors et opérations régionales.
`composeMetapopulation(mission, options)` compose les rôles et la politique ;
il ne démarre pas de boucle. `createMetapopulationSession(mission, { db, variant, ... })`
crée la session. Sans base, la composition reste en mémoire et ne donne pas
accès au runtime régional persistant.

Le [cerveau régional](../../backend/src/services/metapopulation/runtime/regionalBrainService.js)
fournit `runAutonomousRegionalRuntime(input, options)`, également exposé par la façade.
Il installe les cinq adaptateurs internes observe/diagnose/plan/execute/verify.
`options.db` et `input.metapopulationId` sont requis ; appliquer les
[migrations du runtime](../../backend/src/db/migrations/migrateMetapopulationRuntime.js)
avant l'appel. La connexion appartient à l'appelant.

Exemple d'appel depuis un module du backend, avec une connexion déjà ouverte :

```javascript
const api = require('./src/services/metapopulationCoordinationService');
const { migrateMetapopulationRuntime } =
  require('./src/db/migrations/migrateMetapopulationRuntime');

async function observeEmptyRegion(db) {
  await migrateMetapopulationRuntime(db);
  const session = await api.createMetapopulationSession(
    'Observer une région avant son peuplement.',
    { db, variant: 'classic_patch' }
  );
  return api.runAutonomousRegionalRuntime(
    { metapopulationId: session.sessionId, maxCycles: 1 },
    { db }
  );
}
```

Une région sans action planifiée retourne `NO_ACTION`. Ce résultat décrit
l'inactivité ; il ne constitue pas une réussite de mission.

## 2. Données réellement persistées

Les [contrats](../../backend/src/services/metapopulation/contracts/) et
[constantes](../../backend/src/services/metapopulation/constants.js) font foi.

| Objet | Champs structurants |
| --- | --- |
| Session | `metapopulationId`, `missionId`, `mission`, `organization`, `scope`, `patches`, `demes`, `migrationGraph: { corridors }`, `regionalMemory`, `generation`, `revision`, dates ISO |
| Patch | `patchId`, `environment`, `requirements`, `resources`, `carryingCapacity`, `quality`, `accessibility`, `status`, occupation courante |
| Dème | `demeId`, `patchId`, `members`, `localStrategies`, `localProcedures`, `lineage`, `fitness`, `diversity`, `status` |
| Profil d'îlot | `providerId`, `algorithmId`, `population`, `generation`, `fitnessContext` et données de souveraineté dans le profil JSON |
| Propagule proposé | `propaguleId`, source/cible distinctes, `type`, `payloadRef`, `migrationReason`, `lineageRefs`, `sourceEvidence`, `provenance`, `sourceFitness`, `novelty` |
| Migration | identité, corridor, quarantaine, décision locale, reçus et preuves rescue |
| Cycle | observations, diagnostic, plan, exécution, vérification, seed et numéro du dernier cycle vérifié |

La session renvoyée par la façade fournit aussi `sessionId` comme alias
de `metapopulationId`. Le runtime attend `metapopulationId`.

Scopes : `mission`, `workspace`, `project`, `persistent`.
Les statuts de session incluent `QUIESCENT` et `CLOSED`.
Un patch peut être `AVAILABLE`, `OCCUPIED`, `VACANT`, `QUARANTINED` ou
`UNAVAILABLE`. Un dème suit les transitions validées, notamment
`FOUNDING → ESTABLISHING → ACTIVE` ; `STRESSED` est un statut actuel,
`DECLINING` reste un terme du modèle conceptuel.

## 3. Cycle, résultats et reprise

Le [runtime régional](../../backend/src/services/metapopulation/runtime/regionalRuntimeService.js)
exécute `OBSERVE → DIAGNOSE → PLAN → EXECUTE → VERIFY → RECORD`.
PLAN lit et prépare les actions sans ouvrir d'essai ni modifier les populations.
VERIFY relit les états et reçus dans la session, le patch, le dème ou le daemon
visés. RECORD inscrit le journal et l'état du cycle vérifié dans une transaction.

| Résultat | Sens |
| --- | --- |
| `VERIFIED` | Actions du cycle exécutées et vérifiées ; ce n'est pas une certification de mission |
| `NO_ACTION` | Aucune action planifiée ; aucun cycle vérifié supplémentaire enregistré |
| `LIMIT_REACHED` | Nombre de cycles demandé atteint |
| `STOPPED` | Arrêt demandé, signal annulé, session inactive ou budget fourni épuisé |
| `BLOCKED` | Adaptateurs du runtime générique manquants |
| `HALTED` | Une issue non vérifiée a interrompu la boucle ; consulter `cycles` et `reason` |

`maxCycles` vaut 1 par défaut et est borné à 100 **par appel**.
La numérotation reprend après le dernier cycle vérifié enregistré.
`resume: true` réutilise aussi sa seed. L'entrée de l'appelant n'est pas mutée.
Les gates d'arrêt lisent le statut actuel en base ; un ancien statut fourni
par l'appelant ne réactive pas une session fermée.
Les effets externes doivent honorer leurs clés d'idempotence : le journal
SQLite seul ne rend pas une API externe transactionnelle.

## 4. Extinction et recolonisation

`input.extinctionReports` contient `demeId`, `evidence.workers`,
`evidence.localFunctions` et `provenance`.
Une extinction exige des workers observés tous indisponibles et aucune fonction
locale viable. Un worker actif ou une fonction viable donne `NOT_EXTINCT` ;
absence de workers mesurés, statut inconnu ou viabilité non mesurée donne `UNKNOWN`.
Le silence et BUSY ne prouvent pas une extinction.

Classic Patch sélectionne au moins deux lignées distinctes compatibles,
écarte les lignées ayant échoué sur ce patch et ouvre un essai.
`options.evaluateColonization` reçoit patch, fondateurs, seed,
`colonizationId` et `idempotencyKey`. Il retourne
`{ viable: boolean, fitness: number, provenance: object }`, avec une fitness
dans [0, 1], ou `{ pending: true }` pour différer la mesure.
Un résultat invalide n'accepte pas la colonie ; un résultat non viable
enregistre l'échec et laisse le patch vacant. Une acceptation crée le nouveau
dème actif et son occupation atomiquement. Un ancien dème effondré ne peut
pas libérer le patch désormais occupé par son successeur.

## 5. Migration, adaptation et rescue

Le cycle attend `enableMigration: true` et des `migrationRequests`
explicites avec trigger, candidats, cible, receveur et politique.
Les variants partagent les gardes de déclenchement, utilité, compatibilité,
corridor dirigé actif, capacité et adaptateur enregistré.
Le chemin fédéré ajoute les contrats, classifications, preuves de minimisation
et attestations requis ; émettre une obligation ne la satisfait pas.

Enregistrer un adaptateur par type dans
[migrationAdapterRegistry](../../backend/src/services/metapopulation/migration/migrationAdapterRegistry.js).
`validate` fournit la décision et ses preuves locales ; `assimilate`
retourne un reçu `{ receiptId, provenance }`.

| Décision du receveur | Effet |
| --- | --- |
| `ACCEPT` | Validation locale puis assimilation avec reçu |
| `REJECT` | Rejet persisté ; aucune assimilation |
| `REQUEST_MORE_EVIDENCE` | Demande persistée ; reste `QUARANTINED` |
| `ADAPT_AND_ACCEPT` | `adapt` avec reçu, revalidation locale, puis assimilation |

L'identité d'une migration est réutilisable pour la même offre.
Un payload, des extrémités, une provenance ou des preuves différents sous
cette identité provoquent un conflit. Les adaptateurs reçoivent cette identité
comme clé d'idempotence ; le rollback utilise `rollback:<migrationId>`.

Le rescue exige également `measureFitness` et `rollback`.
La mesure initiale est persistée avant assimilation ; l'évaluation après
assimilation est conservée avant rollback. Une reprise d'une migration déjà
acceptée ne l'assimile pas à nouveau. Après un rollback enregistré, la reprise
n'annule pas à nouveau ; elle termine la mesure et l'enregistrement.
La fitness finale et l'issue rescue sont enregistrées ensemble.

## 6. Îlots, résidents et réserves

| Mécanisme | Contrat et limite |
| --- | --- |
| Évolution | `evolutionRequests` et `options.rustEvolution` ; rapport d'îlot valide, génération non régressive, fitness bornées, population et résultats persistés |
| Recherche | `islandSearchRequests` et `options.solverSearch` ; `demeId`, `solverId`, `problemRef` ; état repris pour ce solveur et ce problème seulement |
| Fitness locale | `fitnessEvaluator` synchrone dans le contexte d'évaluation ; résultat `{ fitness, evidenceRef, provenance }` |
| Certification de génome | Preuve d'évaluation liée à `genomeHash` et à sa référence d'évidence |
| QD / spéciation | Helpers de diversité et analyse d'historiques ; un historique vide ne prouve pas une spéciation, un hash ne mesure pas la fitness |
| Réserve de fondateurs | Réserve et reçu relus dans le scope exact ; continuité de mémoire vérifiée |
| Résidents | Capsules réelles sous `.genos-agent-worlds/resident-demes` du répertoire de travail, identité liée au bail session/dème, reprise du bail inactif ou expiré |
| Mémoire | Références versionnées et facteur de décroissance persisté ; continuité lors d'une reprise de résident |
| Culture | Cultures versionnées, parents persistés, transferts soumis au receveur et à la compatibilité |

Le contrôleur gère ces résidents pendant ses appels bornés. Leur bail et leur
capsule ne lancent pas à eux seuls un processus de fond ou un ordonnanceur permanent.
Le confinement protège les écritures passant par l'API d'isolation ;
il ne constitue pas un sandbox système pour un processus externe.

## 7. Vérification et portée de la preuve

Depuis la racine :

```bash
npm --prefix backend run test:metapopulation
node backend/bin/metapopulation-benchmark.cjs 1
```

Le profil dédié contient dix suites : completion, durable execution,
cultural persistence, migration review, morphogenesis integration, regional brain,
variants runtime, variant gaps, variant selection et wiring.
Les [tests de complétion](../../backend/tests/test_metapopulation_completion.js)
et [d'exécution durable](../../backend/tests/test_metapopulation_durable_execution.js)
couvrent les effets sans mutation à PLAN, les preuves invalides, la recolonisation,
les décisions du receveur, la reprise après interruption rescue/rollback,
les états d'îlot, les résidents et les 16 profils.

La validation du 2026-10-06 associée au commit de référence a obtenu
**10/10 suites**, exécutées séparément dans trois processus, avec relecture des
empreintes des sources et reprise d'une fixture corrigée.
Cela ne constitue pas une validation globale du dépôt : les checks globaux
ont rencontré des échecs hors Metapopulation et la compilation Rust a manqué
d'espace disque. Les fixtures d'adaptateurs ne qualifient pas un moteur Rust,
un solveur, un provider ou une mission distribuée réelle.

Le benchmark mesure uniquement capacité et anti-synchronie sur des fixtures
synthétiques de 12, 24 et 48 dèmes. La supériorité entre topologies, la tolérance
à des pannes réelles et le bénéfice par token demandent un protocole comparatif.

Voir la [fiche de topologie](../02-orchestration/topologies/metapopulation.md)
et [ADR 0330](../adr/0330-effets-durables-metapopulation.md).
