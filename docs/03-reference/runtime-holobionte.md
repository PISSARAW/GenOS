# Runtime Holobionte : contrat d’exécution

- **Statut** : Implémenté pour les missions contractuelles décrites ici
- **Dernière revue** : 2026-10-06

Le point d’entrée est [holobionteService.js](../../backend/src/services/holobionteService.js), qui expose runHolobiontMission, openMissionHost, admitMissionSymbiont et preflightHolobiontMission. Le cycle de capacité reste accessible par holobiontRuntime.runCycle. Voir l’[ADR 0330](../adr/0330-holobionte-missions-contractuelles-verifiees.md).

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
| executeCapability | Callback requis, reçoit capacité, résident, contrat, allocation, session, requête et signal. |
| trialCapabilityExecutor | Callback requis pour un nouveau candidat, reçoit le contexte d’essai borné, le contrat et le signal. L’intégrateur fournit l’isolation physique. |
| verifyCapability | Callback requis et indépendant du producteur, reçoit résultat, empreinte, sortie, contrat et signal. |
| signal | Annulation externe propagée aux adaptateurs et vérifiée avant la persistance. |
| healthPolicy | automatic: false désactive les sanctions automatiques ; ratio règle les réductions bornées. |

Une sortie d’exécution contient result, resourcesConsumed (dont tokens), receiptId et les mesures de contribution. Une sortie d’essai contient result, resourcesConsumed, contributionScore et contractCompliant. Le vérificateur retourne status: VERIFIED, resultHash exactement égal à l’empreinte fournie, verifierId distinct du symbiote et evidenceRefs non vides. Un selfVerified: true est refusé. La preuve doit représenter une vérification réelle effectuée par l’adaptateur.

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

Les signaux de dysbiose dérivés du registre sont des heuristiques. Le vecteur de fitness conserve ses dimensions séparées. L’isolation physique, les consommations réelles et la vérification des artefacts dépendent des adaptateurs fournis. Les tests de contrat et l’exemple arithmétique ne prouvent aucun gain causal face à un agent isolé ni une campagne de 600 à 1 200 exécutions réelles. Le [benchmark longitudinal](../06-benchmarks/benchmark-longitudinal-holobionte.md) conserve ces limites.

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
