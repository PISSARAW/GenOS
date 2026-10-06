# Runtime A-Team : exécution, preuves et reprise

- **Statut** : Partiel pour la conformité globale ; parcours canonique de clôture implémenté.
- **Portée** : backend Node, dispatch explicite et adaptateur autonome ; évaluateurs de variantes distincts.
- **Dernière revue** : 2026-10-06.
- **Décision** : [ADR 0329](../adr/0329-cloture-verifiable-runs-a-team.md).

## Parcours et autorité

Le dispatch explicite (`aTeamDispatchService`) et l'adaptateur autonome
(`aTeamAutonomousExecutionService`) utilisent le même `executeTeamRun`. Les identités
canoniques des workers sont fixées avant le WorkGraph. La clé d'idempotence et l'empreinte
du contrat empêchent de réutiliser une demande avec une formation modifiée : schémas,
critères, capacités, frontières et autorités font partie du contrat.

Un retour de dispatch ou un PID atteste un lancement, pas une intégration. Le runner
détaché est nécessaire aussi sans étage différé, pour observer les preuves et clôturer.
Les couches du DAG sont une projection du plan ; l'exécuteur attend les dépendances
propres à chaque membre, permettant aux branches indépendantes de continuer.

Les champs d'autorité organisationnelle ne créent aucun droit d'accès. Les contrôles de
lease MCP, d'outils, de garage et de sandbox restent ceux des chemins de lancement.
Une politique ou une évaluation de variante ne remplace pas ces contrôles.

## Trois niveaux d'état

| Objet | États et interprétation |
|---|---|
| Worker | `idle`, `running`, `completed` et états d'échec/timeout. `completed` ne suffit pas à promouvoir une contribution. |
| Nœud du WorkGraph | `READY`, `RUNNING`, `BLOCKED`, `SUCCEEDED`, `FAILED`, `TIMED_OUT`. Un consumer attend un producteur `SUCCEEDED` et un handoff disponible. |
| TeamRun finalisé | `COMPLETED` si graphe promu et gate passé ; sinon `FAILED` si un nœud est `FAILED`, ou `BLOCKED` pour les autres refus. Phase `INTEGRATION`, puis `DEBRIEF`. |

Un rapport rejeté pour preuve, schéma ou critère manquant laisse le nœud `BLOCKED`,
avec `blockedReason`. Un worker en échec donne `FAILED`. Le délai dépassé donne
`TIMED_OUT` aux nœuds dont les dépendances sont disponibles ; les descendants restent
`BLOCKED`. Le statut agrégé du graphe reste `RUNNING` jusqu'à sa promotion `SUCCEEDED` :
inspecter aussi les nœuds et le TeamRun pour comprendre un refus.

Le runner explicite émet `A_TEAM_STAGES_COMPLETED` uniquement si `accepted` est vrai ;
un refus finalisé émet `A_TEAM_STAGES_FAILED`. L'adaptateur autonome refuse une clôture
non acceptée et arrête les workers encore en cours en cas d'erreur ou d'annulation.
Inspecter stderr si le runner échoue avant un événement final.

## Rapport de contribution

Le dernier rapport du dossier doit avoir un `outcome` reconnu (`success`, `completed`,
`passed` ou `verified`), des preuves utilisables et les artefacts requis. La barrière
vérifie les contrats qu'elle connaît ; les références déclarées ne constituent pas une
validation universelle du contenu d'un fichier ou d'un résultat métier.

- Tous les tests déclarés doivent avoir `passed: true`.
- `output`, à défaut `result` ou le rapport, respecte `outputSchema` lorsqu'il est fourni.
- Chaque critère du membre possède une `acceptanceEvaluations` positive et sourcée.
- Chaque critère global du run est couvert par les évaluations de contributions promues.
- Les violations d'ownership ou d'interface de l'observateur invalident la contribution.

Les références utilisables viennent des `artifacts`, des preuves des `claims` et des
preuves/artefacts des tests réussis. Une évaluation cite des références non vides présentes
dans cet ensemble. Exemple de forme à remplir à partir d'observations réelles :

```json
{
  "outcome": "success",
  "output": { "value": 42 },
  "artifacts": ["api-contract"],
  "tests": [{ "name": "api-check", "passed": true, "evidence": ["process-output:api"] }],
  "integrationConstraints": [],
  "acceptanceEvaluations": [
    { "criterion": "tested", "passed": true, "evidenceRefs": ["process-output:api"] }
  ]
}
```

Cet exemple n'est pas une preuve d'exécution. Une liste de tests vide ne constitue pas un
test réussi ; un critère exigeant une validation reste non satisfait sans son évaluation.

## Handoffs versionnés

Une arête reçoit un handoff avec `handoffId`, `version`, `digest`, `available` et `accepted`.
Le digest SHA-256 porte sur le JSON canonique des références d'artefacts et de preuves,
du schéma d'interface, du schéma d'entrée du consumer, de ses critères et de la sortie du
rapport producteur. Il ne relit pas automatiquement les fichiers désignés par leurs URI.
Un changement de ces données incrémente la version et invalide l'accusé antérieur ;
sans changement du digest, la version reste stable lors des observations.

`available` indique que le contrat de transfert permet le lancement du consumer.
`accepted` exige en plus les deux nœuds `SUCCEEDED` et une évaluation du consumer
portant sur les trois identifiants exacts :

```json
{
  "handoffEvaluations": [{
    "handoffId": "edge-id:1",
    "version": 1,
    "digest": "digest-recu-du-runtime",
    "passed": true,
    "evidenceRefs": ["consumer-validation:edge-id:1"]
  }]
}
```

La référence doit également figurer dans les preuves utilisables du rapport consumer.
Cet extrait complète le rapport de contribution. Le reçu est `READY_FOR_REVIEW`,
`ACCEPTED` ou `REJECT` selon la disponibilité, l'accusé et l'état du consumer.
Un digest correct seul ne clôture pas le run.

## Couvertures observées et maturité

`execution.coverage` contient les mesures ci-dessous sous la forme
`{ numerator, denominator, ratio, source }`, avec
`source: persisted_work_graph_and_worker_evidence`. Un dénominateur nul donne `null`.

| Champ | Calcul de l'exécuteur | Limite |
|---|---|---|
| `missionCoverage` (MCC) | Capacités requises déclarées chez les membres / capacités requises. | Couverture de formation. |
| `staffedCoverage` (TSC) | Nœuds rattachés à un membre avec worker / nœuds. | Affectation, pas validation. |
| `runtimeToolCoverage` (RCA) | Workers `completed` / membres. | Achèvement ; ne prouve pas à lui seul la capacité effective des outils. |
| `verifiedCoverage` (VEC) | Capacités déclarées par les membres dont le rapport est promu / capacités requises. | Contribution de mission, pas expertise générale attestée par capacité. |

Le produit des ratios est publié, mais la clôture dépend aussi du gate, du graphe,
des handoffs et des critères globaux. Le [contrat normatif](../02-orchestration/topologies/a-team.md)
fixe des garanties de capacité dispatchable et d'expertise attestée encore partiellement couvertes.

## Persistance, bail et délai

`topology_sessions` conserve les sessions `a_team`, `a_team_work_graph` et `a_team_learning`.
Le run conserve identités, lien au graphe, révision CAS, `execution.runnerLease`,
`execution.deadlineAt`, résultats d'ordonnancement, couvertures, intégration et lien au debrief.

Le bail est acquis par CAS. L'exécuteur exige token courant, expiration valide et run
`RUNNING`, avant observation, lancement et finalisation. Un ancien runner ne peut pas
continuer après remplacement ou expiration du bail. Son renouvellement ne réinitialise
pas le délai de mission.

L'échéance est persistée au premier passage (`timeoutMs`, 15 minutes par défaut pour
l'exécuteur). Une reprise garde cette échéance et les workers déjà présents ; elle ne
relance pas arbitrairement les producteurs achevés ou les workers échoués. Les tests
peuvent injecter une horloge ou `Infinity` ; ce dernier choix désactive le délai fini
pour cet appel. La réparation est distincte, avec invalidation et reprise de branche.

Le debrief canonique est écrit en succès comme en refus finalisé, avec `objectiveMet`,
références promues, `completionRate` et `handoffAcceptanceRate`. Une interruption avant
finalisation ne garantit pas son écriture. Les leçons réutilisables exigent la provenance
validée par le service d'apprentissage.

## Diagnostic et vérification

| Code ou raison | Interprétation |
|---|---|
| `ATEAM_RUN_UNKNOWN`, `ATEAM_RUN_GRAPH_MISSING` | Run ou graphe canonique absent. |
| `ATEAM_RUN_LEASE_BUSY`, `ATEAM_RUN_LEASE_LOST` | Autre runner actif ; bail absent, expiré ou remplacé. |
| `ATEAM_DEADLINE_INVALID` | Échéance persistée non interprétable. |
| `dependency_not_promoted` | Producteur ou transfert non disponible. |
| `evidence_or_artifact_missing`, `test_not_passed`, `output_schema_invalid`, `acceptance_criteria_unverified` | Rapport refusé ; inspecter critères et références. |
| `ATEAM_INTEGRATION_REJECTED` | Refus de la clôture par l'adaptateur autonome. |

Depuis la racine :

```bash
node backend/tests/test_ateam_runtime.js
node backend/tests/test_ateam_dispatch_runtime.js
node backend/tests/test_ateam_execution_e2e.js
node backend/tests/test_ateam_variant_acceptance.js
```

Le test d'exécution utilise SQLite en mémoire et des sous-processus Node : promotion/refus,
progression indépendante, reçu périmé, reprise du délai et bail obsolète. Les 44 cas
d'acceptation des variantes portent sur leurs contrats isolés. Ils ne qualifient ni mission
LLM arbitraire, ni campagne de performance, ni sous-runs multiteam génériques.

## Sources

- [Exécuteur canonique](../../backend/src/services/aTeam/execution/teamExecutionService.js).
- [Projection du graphe](../../backend/src/services/aTeam/execution/workGraphExecutionService.js).
- [Validation et couvertures](../../backend/src/services/aTeam/execution/teamEvidenceService.js).
- [Accusés versionnés](../../backend/src/services/aTeam/execution/handoffReceiptService.js).
- [Adaptateur autonome](../../backend/src/services/aTeam/aTeamAutonomousExecutionService.js).
- [Runner détaché](../../backend/bin/genos-ateam-stage-runner.cjs).
- [Politiques](../02-orchestration/topologies/a-team-politiques-runtime.md), [réparations](../02-orchestration/topologies/a-team-reparation.md) et [apprentissage](../02-orchestration/topologies/a-team-apprentissage.md).
