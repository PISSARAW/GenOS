# Runtime Rhizome : contrat opérationnel v1

- **Statut** : Implémenté
- **Dernière revue** : 2026-10-06
- **Portée** : exécution, admission, résultats, métriques, ressources et télémétrie

## Architecture

[rhizomeCoordinationService](../../backend/src/services/rhizomeCoordinationService.js) possède les sessions et leurs mutations. [rhizomeRuntime](../../backend/src/services/rhizome/runtime/rhizomeRuntime.js) compose les registres de providers et de vérificateurs avec le contrôleur. Le store SQLite existant conserve le graphe, les budgets, les besoins actifs et les résultats signés. Les callbacks externes ne remplacent ni l'autorité ni la sandbox de leur hôte.

Le plugin Rhizome de MorphologyRuntime conserve son contrôleur in-process simplifié. Il ne déclenche pas automatiquement ce runtime persistant ; ses compteurs et reçus locaux ne certifient pas une mission par capacités.

## Cycle de mission

1. Composer une session avec les nœuds et budgets connus, éventuellement une base SQLite.
2. Fournir un tableau explicite de besoins avec needId, capability, evidenceRequirements et constraints.
3. Enregistrer les providers et les vérificateurs indépendants de confiance.
4. Appeler runtime.run : chaque besoin est traité dans les bornes configurées.
5. Si une route existe, exécuter puis vérifier la sortie concrète. Sinon diagnostiquer le gap, proposer une croissance, démarrer et vérifier le provider, admettre atomiquement, puis réexécuter le besoin.
6. Évaluer les résultats et fermer les instances avec runtime.close lorsque leur vie opérationnelle se termine.

La stabilité de plusieurs routes ne dispense jamais de traiter les besoins restants. Deux contrats différents ne peuvent partager un needId. Une mission vide ne produit pas VERIFIED.

## API JavaScript

Les modules sont CommonJS. Les fonctions globales run et tick acceptent execute et verify explicitement. create relie aussi l'exécution aux providers enregistrés sur le nœud terminal du graphe.

```javascript
const rhizome = require('../../backend/src/services/rhizomeCoordinationService');
const runtimeFactory = require('../../backend/src/services/rhizome/runtime/rhizomeRuntime');

// start/probe/execute/stop et les vérificateurs sont les implémentations réelles de l'hôte.
const worker = runtimeFactory.create({
  trustedProviderIds: ['local-service'],
  trustedVerifierDigests: ['independent-verifier-v1'],
  registrations: [{
    providerId: 'local-service', kind: 'service', capabilities: ['answer'],
    start, probe, execute, stop
  }],
  verifiers: [{
    verifierId: 'independent-review', verifierDigest: 'independent-verifier-v1',
    capabilities: ['answer'], verifyCapability, verifyRoute
  }]
});
const session = await rhizome.composeRhizome('Mission explicite', {
  db, variant: 'persistent', budgets: { growth: 1 },
  growthLimits: { maxBranches: 8, maxDepth: 4, minBranchBudget: 0 }
});
const report = await worker.run({
  sessionId: session.sessionId, options: { db },
  needs: [{ needId: 'answer-1', capability: 'answer' }],
  candidates: ({ need, gap }) => candidatesFor(need, gap),
  maxTicks: 20, maxDurationMs: 60000, operationTimeoutMs: 30000
});
// report.status vaut VERIFIED ou INCOMPLETE ; consulter results et completion.
const closed = await worker.close({ sessionId: session.sessionId, options: { db } });
```

create conserve la compatibilité des anciens providers/adapters. Leur instanciation et leur libération restent sous la responsabilité de l'hôte s'ils ne fournissent pas dispose.

## Providers concrets

| kind | Nœud produit | Actions de croissance par défaut |
|---|---|---|
| agent | AGENT | SPAWN_WORKER, REUSE |
| daemon | DAEMON | WAKE_DORMANT, REUSE |
| tool | TOOL | ATTACH_SERVICE, REUSE |
| service | EXTERNAL_SERVICE | ATTACH_SERVICE, REUSE |
| human | HUMAN_GATEWAY | ATTACH_SERVICE, REUSE |
| runtime | PROCEDURE | ADAPT_PROCEDURE, REUSE |

start reçoit le candidat, le besoin, la session et un AbortSignal ; il retourne instanceId, éventuellement nodeId et edges. probe reçoit cette identité et retourne status: AVAILABLE, evidenceRefs non vides et une fiabilité. execute reçoit route, need, sessionId, instanceId et signal. stop reçoit instanceId. Les références de sonde servent au vérificateur indépendant : elles ne suffisent pas à l'admission.

Les échecs de sonde et d'admission déclenchent stop. close tente la libération des instances enregistrées ; en cas d'échec il retourne closed: false et conserve la session pour une reprise. Une fermeture logique directe du store ne remplace pas cette libération. Les callbacks doivent être idempotents et respecter signal ; l'échéance du runtime ne tue pas un processus externe à elle seule.

## Reçus et migration

GENOS_EPISTEMIC_RECEIPT_SECRET doit être configuré sur l’hôte de confiance qui signe et contrôle les reçus. Sans clé de signature valide, une affirmation de réussite ne peut pas être admise. Le secret reste hors du dépôt et des arguments MCP.

Le vérificateur de capacité reçoit node, candidate, need et edges. CAPABILITY_VERIFIED doit contenir candidateId, nodeId, capability, independent, evidenceId, verifierDigest, evidenceRefs et edgeContracts normalisés. Le reçu épistémique HMAC lie evidenceId à capabilityAdmissionService.evidenceDigest(node, proof). Cette empreinte inclut l'identité et la référence du provider, l'instance et les arêtes admises. Un ancien reçu doit être réémis selon ce contrat ; remplacer un provider après signature est refusé.

Le vérificateur de route reçoit route, need, une copie de result et executionDigest. Il doit vérifier la sortie indépendamment avant de retourner un RouteOutcome : chemin, besoin, capacité, SUCCESS ou FAILURE, executionDigest et verification contenant références non vides, identité indépendante et reçu signé. routeReceiptService.outcomeDigest(outcome) lie la signature au chemin, au verdict, aux références et à la sortie concrète. executionResultService.capture produit la représentation JSON triée et l'empreinte SHA-256 utilisées par le runtime.

Les reçus historiques sans empreinte restent lisibles pour la compatibilité du registre de routes ; ils ne permettent pas de certifier une nouvelle mission. Un nonce déjà consommé est idempotent et ne renforce ni conductivité, ni traces, ni couverture. Un nœud ou pont devenu indisponible invalide la route dans les métriques courantes. La quarantaine exige également une preuve indépendante signée, liée aux arêtes et à son motif.

## Budgets, routage et pruning

L'admission de croissance revalide le plan, le gap, graphVersion, le seuil, les providers, les reçus, les contrats d'arêtes et les limites de branches/profondeur. Elle débite creationCost + coordinationCost du budget growth, ou default. Tout refus conserve le graphe et le budget antérieurs.

Le routage est déterministe par défaut. options.routingPolicy (ou options.routing pour compatibilité) accepte selection: softmax, temperature, un random injectable, maxStates, maxWork et un maxHops plafonné à la variante. Les inspections d'arêtes et les états sont comptés réellement. Un budget épuisé retourne ROUTING_BUDGET_EXHAUSTED, sans conclure que la capacité manque. Les options ne peuvent affaiblir la politique privée.

La maintenance fait décroître les traces de matrice et d'arêtes, met à jour la conductivité et inspecte les baux et le pruning. Le plan combiné ne peut rendre inaccessible une capacité requise depuis les sources précédentes. Les suppressions et admissions périmées sont refusées. Les variantes private, persistent, cross_representation et procedural ne basculent pas automatiquement vers une politique qui perdrait leurs invariants.

## Complétion et coordination

missionMetrics dérive la couverture des besoins, la fitness des ponts utilisés, la provenance, les latences d'exécution, la fiabilité et la stabilité. La politique par défaut exige fitness ≥ 0,7, couverture ≥ 0,95, provenance = 1 et variance de latence ≤ 100 000 ms². Le contrôleur exige en outre zéro besoin non résolu pour VERIFIED. La stabilité est la fraction de besoins vérifiés, et non une estimation longitudinale.

Le bail calculé varie entre 1 000 et 60 000 ms selon cette stabilité. Un transfert de locus exige une cible avec fiabilité ≥ 0,7 par défaut. Sans exécution vérifiée le transfert utilise le bail minimal. canMerge exprime une gate Rhizome et ne dispense jamais des gates de promotion de niveau supérieur.

## MCP

Les catalogues canonique et Node exposent les opérations supplémentaires de topology session : mission_metrics, maintain, set_variant, prune_apply et admit_growth. Les paramètres comprennent needs, convergence_policy, expected_graph_version, variant_name, pruning_plan et growth_plan. L'admission reprend également node, edges et proof.

Les identités de confiance viennent de GENOS_RHIZOME_TRUSTED_PROVIDER_IDS et GENOS_RHIZOME_TRUSTED_VERIFIER_DIGESTS, listes séparées par des virgules configurées sur le serveur. Les arguments de l'appelant ne créent pas une autorité de confiance. Les leases et outils désactivés MCP restent appliqués par le serveur.

## CLI et télémétrie

```bash
cargo run -p genos-cli -- rhizome export --session-id SESSION_ID --database backend/genos.db --output artifacts/rhizome_graph.json
cargo run -p genos-cli -- rhizome serve --session-id SESSION_ID --database backend/genos.db --port 4790
cargo run -p genos-cli -- rhizome serve --simulate --port 4790
```

Les deux options de source live sont obligatoires ensemble et incompatibles avec --simulate. La base doit déjà exister, être régulière et confinée au workspace. Node et les dépendances backend sont requis. La lecture utilise une transaction SQLite en lecture seule. Le serveur écoute sur 127.0.0.1 ; /api/graph et /api/export retournent le contrat RhizomeLiveTelemetry/v1 avec source: backend. Le WebSocket publie des snapshots du même graphe. Une source inaccessible retourne une erreur, sans simulation de secours.

Les snapshots de démonstration portent source: simulation. Le dashboard live ne transforme pas un nombre de nœuds ou de résultats en score d'évidence.

## Vérification et limites

npm --prefix backend run test:rhizome rassemble les tests Rhizome et écrit les commandes, codes de sortie et durées dans un artefact ignoré .genos-agent-worlds/rhizome-verification/tests.json. Les scénarios couvrent la complétion de tous les besoins, les sorties modifiées, le rejeu, les budgets, les six lifecycles, les échéances, la confidentialité, le pruning combiné et la reprise SQLite avec télémétrie en lecture seule.

Le contrôle CLI réel se lance avec GENOS_RHIZOME_CLI pointant vers le binaire fraîchement compilé, puis node backend/tests/rhizome_cli_live_check.cjs. Il vérifie export, HTTP, WebSocket, marquage de simulation et refus des sessions fermées.

Le contrat runtime n'est pas une preuve d'équivalence biologique, de disponibilité permanente ou de supériorité statistique. Les modèles illustratifs, le cache LRU et la similarité cosinus décrits dans la fiche conceptuelle ne sont pas annoncés comme implémentations de ce contrat.
