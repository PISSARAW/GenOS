# Runtime Holobionte : contrat d’exécution

- **Statut** : Implémenté pour les missions contractuelles décrites ici
- **Dernière revue** : 2026-10-20

Le point d’entrée est [holobionteService.js](../../backend/src/services/holobionteService.js), qui expose runHolobiontMission, openMissionHost, admitMissionSymbiont et preflightHolobiontMission. Le cycle de capacité reste accessible par holobiontRuntime.runCycle. Voir l’[ADR 0330](../adr/0330-holobionte-missions-contractuelles-verifiees.md).

## Snapshot topologique

Un snapshot d'agent peut référencer une session Holobionte avec
`topologySnapshot`. L'adaptateur scelle les reçus, le journal, la mémoire et
les champs propres aux douze variants. La reprise attend un hôte quiescent ou
fermé ; elle ne rejoue pas les effets d'outil ou distants. Voir
[snapshots topologiques](snapshots-topologiques.md).

## Exécuter l’exemple

Depuis la racine, après installation des dépendances du backend :

~~~powershell
node examples/holobionte/run-mission.cjs
node backend/bin/genos-holobionte-mission.cjs examples/holobionte/arithmetic-mission.cjs --preflight
npm --prefix backend run test:holobionte
~~~

Le premier exemple ouvre SQLite en mémoire, admet le calculateur, calcule 17 + 4 + 9, compare le résultat à un second calcul indépendant, persiste la contribution et ferme la session. Son adaptateur comptabilise une unité contractuelle de budget par essai et par exécution sous la clé tokens ; ce calcul local ne mesure pas des jetons consommés par un modèle de langage. Le précontrôle vérifie la forme et les adaptateurs ; il n’exécute pas la mission et ne certifie pas ses preuves.

Pour une exécution persistée, la même CLI accepte le chemin relatif d’un module exportant createMissionInput. Elle utilise la base configurée du backend. Un résultat bloqué ou un précontrôle refusé produit un code de sortie non nul. Les chemins absolus, sorties de workspace et liens symboliques interdits restent rejetés par le contrôle de chemins existant.

## Entrées de mission

| Champ | Contrat |
| --- | --- |
| hostId, missionId | Identifiants non vides ; holobiontId permet de viser une session active existante du même hôte. |
| projectId, workspaceId | Périmètre de réutilisation de l’hôte persistant. |
| persistentHost | true conserve l’hôte en quiescence après la mission ; sinon la session est fermée. |
| constitution | Identité, objectifs, invariants et autorité centrale de l’hôte. |
| symbionts | Jusqu’à 32 candidats explicitement fournis avec id et contrat complet. Les résidents existants sont réutilisés. |
| steps | 1 à 32 étapes : capability, request et éventuellement allocation, toolName, dataClasses, changedInvariants. Une capability seule définit une étape. |
| allocation | Politique de ressources et capacité disponible, obligatoire pour chaque étape ou au niveau mission. |
| budget | tokens (10 000 par défaut), latencyMs (60 000), maxSteps (32), positifs. Les essais consomment ce budget. |
| executeCapability | Callback fonctionnel requis, reçoit capacité, résident, contrat, allocation, session, requête et signal. |
| trialCapabilityExecutor | Callback requis pour un nouveau candidat, reçoit le contexte d’essai borné, le contrat et le signal. L’intégrateur fournit l’isolation physique. |
| verifyCapability | Callback fonctionnel requis et indépendant du producteur, reçoit résultat, empreinte, sortie, contrat et signal. Une référence identique ou une implémentation de fonction identique à `executeCapability` est refusée. |
| signal | Annulation externe propagée aux adaptateurs et vérifiée avant la persistance. |
| healthPolicy | `automatic: false` désactive les sanctions automatiques ; `ratio` règle les réductions bornées ; `dysbiosisThresholds` surcharge les seuils documentés ci-dessous. |

Une sortie d’exécution contient result, resourcesConsumed (dont tokens), receiptId et les mesures de contribution. Une sortie d’essai contient result, resourcesConsumed, contributionScore et contractCompliant. Le vérificateur retourne status: VERIFIED, resultHash exactement égal à l’empreinte fournie, verifierId distinct du symbiote et evidenceRefs non vides. Un selfVerified: true est refusé. La preuve doit représenter une vérification réelle effectuée par l’adaptateur.

Le précontrôle refuse séparément un exécuteur, un vérificateur ou un exécuteur d’essai absent ou non fonctionnel. Il calcule pour chaque callback une provenance `genos.holobiont-adapter-provenance/v1` contenant le rôle, l’identifiant déclaré (`adapterId`) ou le nom de fonction, la version déclarée éventuelle, l’empreinte SHA-256 de l’implémentation et l’empreinte du dossier de preuve. Le reçu de mission expose ces dossiers dans `adapterProvenance`. Les reçus d’essai et d’exécution conservent aussi les références de provenance du producteur effectivement appelé et du vérificateur dans `evidenceRefs`; les wrappers de délai restent liés au dossier du callback original.

Cette provenance prouve quelle implémentation de callback le runtime local a liée au rôle. Elle ne certifie pas à elle seule l’identité d’un fournisseur externe, son environnement physique ni la validité du résultat : ces propriétés exigent les preuves propres à l’adaptateur et restent soumises aux gates de résultat et d’isolation.

L’admission finale exige aussi un objet `isolationProof` émis dans la sortie de `trialCapabilityExecutor`. Le runtime fournit à ce callback son dossier `adapterProvenance`; la preuve doit utiliser le schéma `genos.holobiont-isolation-proof/v1`, référencer exactement le `proofHash` du rôle `trial`, identifier l’isolation et son mécanisme, horodater l’observation, puis attester les frontières `process: ISOLATED`, `workspace: EPHEMERAL|READ_ONLY` et `network: DENIED|RESTRICTED`. Ses `evidenceRefs` doivent toutes être reprises par le vérificateur indépendant. Une preuve absente, non liée à l’adaptateur effectivement appelé ou non couverte par le reçu de vérification provoque `HOLOBIONT_ISOLATION_UNVERIFIED`; aucun symbiote n’est alors admis.

Le helper `examples/holobionte/isolation-proof.cjs` illustre uniquement la forme de ce contrat. Son attestation d’exemple ne crée aucune sandbox système et doit être remplacée en production par les références observables du conteneur, processus ou environnement isolé piloté par l’adaptateur.

## Ordre des gates

1. Validation des adaptateurs, du périmètre et des limites de mission.
2. Constitution et session de l’hôte, puis contrat et admission du candidat.
3. Sélection du résident, contrôle du contrat actif, de l’autorité, des baux et des classes de données.
4. Allocation bornée par le contrat, la disponibilité et les autres allocations.
5. Exécution puis vérification indépendante de la sortie concrète et de sa consommation.
6. Inspection immunitaire de la sortie réelle et décision de l’hôte.
7. Relecture du contrat et transaction atomique contribution, mémoire, événement CAPABILITY_USED.
8. Libération de l’allocation, mesure de santé et sanctions bornées.
9. Clôture de mission ou quiescence de l’hôte persistant, sous conditions d’arrêt.

Une sortie tardive après annulation, une révocation pendant l’exécution ou une panne de mémoire ne peut laisser une contribution promue seule. Une admission rejetée retourne ADMISSION_REJECTED. CAPABILITY_GAP, EXECUTION_REJECTED et STOP_BLOCKED restent distincts de VERIFIED. Les erreurs de contrat ou de preuve sont des erreurs explicites ; elles ne sont pas converties en succès.

## Résultats et limites

Le résultat expose schema: genos.holobiont-capability-mission/v1, les identifiants, admissions, completed, usage, budget, status, stopped et lifecycle. Les résultats vérifiés gardent la sortie, l’empreinte, les preuves, la décision de l’hôte, la mémoire et la santé. Les missions incomplètes ne ferment pas automatiquement l’hôte et doivent être diagnostiquées ou reprises sous son contrat.

Les six signaux de dysbiose sont `resourceConcentration`, `dependencyConcentration`, `harmfulActivity`, `conflictRate`, `immunePressure` et `functionalRedundancy`. Chaque valeur est exposée sous la forme `{ value, status }`, où `status` vaut exclusivement `measured` ou `heuristic`. Une valeur numérique nue et tout signal dérivé du registre sont classés `heuristic` ; un appelant ne peut revendiquer `measured` qu’en le déclarant explicitement sur le signal. Un statut inconnu est refusé.

Le score agrégé et les états `STABLE`, `WATCH`, `ALERT` restent toujours `heuristic`, même si les six entrées sont mesurées. Le reçu expose `measurementStatus: measured` seulement quand toutes les entrées le sont, ainsi que `promotionEligible: false`. Ce score peut orienter une revue ou une action de santé bornée ; il ne constitue jamais, seul, une preuve ni une autorité de promotion.

Les seuils par défaut sont `signalExtreme: 0.70`, `lowRedundancy: 0.25`, `watchScore: 0.35` et `alertScore: 0.60`. Ils acceptent une surcharge partielle dans `healthPolicy.dysbiosisThresholds`; chaque valeur doit être comprise entre 0 et 1 et `watchScore` doit rester strictement inférieur à `alertScore`. Le reçu restitue les seuils effectivement utilisés pour rendre la décision auditable.

Le vecteur de fitness conserve ses dimensions séparées. L’isolation physique, les consommations réelles et la vérification des artefacts dépendent des adaptateurs fournis. Les adaptateurs `executeCapability`, `trialCapabilityExecutor` et `verifyCapability` sont obligatoires ; `verifyCapability` doit être une fonction distincte de `executeCapability`. Les tests de contrat et l’exemple arithmétique ne prouvent aucun gain causal face à un agent isolé ni une campagne de 600 à 1 200 exécutions réelles. Le [benchmark longitudinal](../06-benchmarks/benchmark-longitudinal-holobionte.md) conserve ces limites.

## Validation observée le 2026-10-06

| Contrôle exécuté | Résultat observé |
| --- | --- |
| `npm --prefix backend run test:holobionte` | 51 scripts réussis, code 0. |
| `npm test` depuis la racine | Réussi, code 0. |
| Contrôle strict ciblé sur 49 fichiers du runtime et de ses frontières modifiées | Zéro violation. |
| Exemple CLI arithmétique | Somme 30, résultat `VERIFIED`, session `CLOSED`. |
| `python scripts/ci/check_code_quality.py` | Échec global : violations présentes ailleurs dans le dépôt. |
| `cargo test --workspace` | Échec initial sur le test de quarantaine nosocomiale ; ce test passe ensuite isolément après recompilation de changements concurrents. |
| `cargo test --workspace --no-fail-fast` | Compilation terminée en erreur ; aucun bilan complet des tests du workspace acquis. |

Ces observations couvrent l’état testé pendant des travaux concurrents dans le dépôt. Elles attestent les contrats exercés, sans certifier la totalité de GenOS ni des gains de performance. La dette globale n’a pas été masquée par une modification de la baseline.
