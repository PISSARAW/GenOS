# Référence : GQEL — GenOS Quality Elevation Loop

- **Statut** : Partiel ; boucle et heuristiques Node.js implémentées, garanties de qualité générale et raccords universels non qualifiés.
- **Portée** : contrats JavaScript, évaluateurs, sessions, décisions et contrôleur worker.
- **Dernière revue** : 2026-11-02

Voir le [concept](../01-concepts/gqel.md), le [guide d'intégration](../02-orchestration/gqel.md),
le [runbook](../04-exploitation/gqel.md) et les
[preuves datées](../06-qualite-preuves/qualification-gqel-2026-11-02.md).

## 1. Modules et surface d'appel

Les chemins ci-dessous sont relatifs à
[`backend/src/services/qualityElevation/`](../../backend/src/services/qualityElevation/).

| Module | Responsabilité et exports principaux |
| --- | --- |
| [qualityElevationService.js](../../backend/src/services/qualityElevation/qualityElevationService.js) | `compileQualityContract`, `createElevationSession`, `recordIterationVersion`, `decideContinuation`, `buildRepairPrompt`, `executeElevationLoop`, `POLICIES` |
| [qualityEvaluatorRegistry.js](../../backend/src/services/qualityElevation/qualityEvaluatorRegistry.js) | `getEvaluator`, `evaluateArtifact`, alias `evaluateContent`, `inferDomainFromMission` |
| [creativeWritingEvaluator.js](../../backend/src/services/qualityElevation/creativeWritingEvaluator.js) | Évaluation de marqueurs de scénario |
| [softwareEngineeringEvaluator.js](../../backend/src/services/qualityElevation/softwareEngineeringEvaluator.js) | Syntaxe JavaScript et heuristiques de code |
| [qualityComparisonService.js](../../backend/src/services/qualityElevation/qualityComparisonService.js) | Comparaison, défauts résolus/introduits, `evaluateDoubleBlindConsistency` |
| [qualityStagnationDetector.js](../../backend/src/services/qualityElevation/qualityStagnationDetector.js) | Empreintes et détection de répétition/régression |
| [workerQualityContractEnforcer.js](../../backend/src/services/qualityElevation/workerQualityContractEnforcer.js) | Extraction du contenu et `enforceQualityContract` |

[`backend/src/services/qualityElevationService.js`](../../backend/src/services/qualityElevationService.js)
réexporte le service principal. Aucune API GQEL REST, CLI ou MCP dédiée n'est
définie dans ces modules.

## 2. Contrat compilé

`compileQualityContract(input = {})` produit :

| Champ | Résolution / valeur par défaut | Utilisation dans la boucle |
| --- | --- | --- |
| `contractId`, `createdAt` | Identifiant aléatoire horodaté et date ISO | Métadonnées |
| `mission` | Chaîne fournie, sinon chaîne vide | Prompt initial, puis base des réparations |
| `domain` | Fourni, sinon inféré depuis la mission | Sélection d'évaluateur |
| `policy` | Fourni, sinon `balanced` | Nom conservé ; une politique inconnue utilise les valeurs `balanced` |
| `maxIterations` | Surcharge ou politique | Testé après conformité et stagnation |
| `minQualityScore`, `threshold` | Même valeur : `input.minQualityScore ?? input.threshold ?? défaut` | Seuil de décision locale via `threshold` |
| `critiques` | Surcharge ou politique | Déclaratif ; aucun critique supplémentaire lancé |
| `requireDoubleBlind` | Surcharge ou politique | Déclaratif ; aucun juge aveugle lancé |
| `criteria` | Tableau fourni, sinon `[]` | Conservé, sans compilation en contrôles |
| `budgetMaxTokens` | Valeur fournie ou `100000` | Conservé, sans mesure ni enforcement de consommation |

| Politique | `maxIterations` | Seuil | `critiques` déclaré | `requireDoubleBlind` déclaré |
| --- | --- | --- | --- | --- |
| `fast` | 2 | 70 | 1 | `false` |
| `balanced` | 3 | 80 | 2 | `false` |
| `critical` | 5 | 95 | 3 | `true` |

Les valeurs de politique ne sont pas des plafonds stricts : les surcharges sont
acceptées et la branche de mutation peut précéder le contrôle du nombre
d'itérations. Le compilateur ne valide pas exhaustivement types et bornes.

## 3. Évaluateurs et barèmes

`evaluateArtifact(domain, content, options)` et `evaluateContent` sont la même
fonction. Le résultat contient `domain`, `score`/`overallScore`, `passed`/`valid`,
`threshold`, `defects`, `metrics`, `evaluatedAt`. Un défaut possède `code`,
`severity`, `section` et `message`.

Le registre normalise le nom du domaine. Les alias `fiction`, `scenario`, `script`
désignent `creative_writing` ; `code` et `programming` désignent
`software_engineering`. Un nom inconnu utilise l'évaluateur générique.
L'inférence depuis une mission repose sur des mots-clés et, si fourni dans un
objet, `workerKind` ; elle ne constitue pas une classification sémantique.

### Écriture créative

| Rubrique | Points maximaux | Contrôle réel |
| --- | --- | --- |
| Prémisse | 15 | Présence de mots-clés de logline/prémisse |
| Personnages | 25 | Rubrique et deux marqueurs de fiches ; mots « secret » et « objectif » présents dans le texte |
| Séquencier | 20 | Marqueur de séquencier/scènes clés/actes **ou** au moins trois marqueurs reconnus de scènes ou actes numérotés, y compris en chiffres romains |
| Dialogues/didascalies | 25 | Marqueur de direction et au moins quatre lignes de dialogue reconnues |
| Dramaturgie | 15 | Marqueur de note et vocabulaire de conflit/tension |

L'évaluateur accepte un score au moins égal à `options.threshold || 70`, sans
défaut `major`. Les défauts mineurs peuvent subsister. Les expressions régulières
ne prouvent ni profondeur des personnages, ni cohérence causale, ni équilibre
des dialogues. Les critères de scénario ne sont pas adaptés à tout texte créatif.

### Ingénierie logicielle

| Rubrique | Points maximaux | Contrôle réel |
| --- | --- | --- |
| Syntaxe | 30 | Compilation par `new vm.Script(code)`, sans exécution |
| Sécurité | 25 | Expressions régulières sur certaines concaténations `exec` et certains secrets littéraux |
| Exports | 20 | Marqueurs d'exports ; `options.requiredExports` permet de chercher des symboles requis |
| Tests | 25 | Lecture de `options.testResults.failed`, sinon recherche de marqueurs tels que `assert`, `expect`, `describe`, `test(` ou `===` |

Le contenu est une chaîne, ou `content.code`, ou `content.candidate`. Le score
est borné entre 0 et 100 ; l'acceptation exige `score >= (options.threshold || 75)`
et aucun défaut `blocker`. Des défauts `major` ou `minor` peuvent donc subsister.
La syntaxe suit le mode script JavaScript de `vm.Script`, pas un compilateur
TypeScript ni un chargeur de modules ESM.

Les tests ne sont **pas exécutés** par cet évaluateur ; les résultats fournis
ne sont pas authentifiés ici. Un commentaire contenant `===` peut suffire pour
les points de tests. Les motifs de sécurité ne constituent pas un audit exhaustif.

### Générique

Une chaîne, ou la sérialisation JSON du contenu, de longueur nettoyée au moins
20 reçoit 80 et `passed: true` ; sinon 20 et le défaut bloquant
`EMPTY_OR_TRIVIAL_OUTPUT`. Le champ retourné `threshold` vaut
`options.threshold || 70`, mais n'est pas utilisé pour calculer `passed` générique.
Avec la boucle `critical`, le score générique de 80 ne satisfait donc pas 95.

## 4. Session, versions et comparaison

`createElevationSession(contract)` retourne un objet mutable contenant :
`sessionId`, `contract`, `versions: []`, `comparisons: []`, `bestVersionIndex: 0`,
`strategyMutations: 0`, `status: in_progress`, `createdAt`.

`recordIterationVersion(session, content, evaluation)` ajoute une version numérotée
à partir de 1 : contenu, SHA-256 `digest`, score, `passed`, défauts, signature de
défauts, métriques et date. La signature trie les triplets sévérité/code/section
en minuscules et conserve les 16 premiers caractères du SHA-256 ; sans défaut,
elle vaut `clean:0`.

`compareVersions` compare les défauts par couple `code`/`section`, calcule le delta
de score, les défauts résolus/introduits, `regressionFree` et un verdict :
`superior`, `superior_with_tradeoffs`, `regressive`, `inferior` ou `tied`.
La comparaison possède un digest incluant ses données et son horodatage ; ce
digest n'est pas une signature d'autorité.

L'index de meilleure version change seulement si le nouveau score dépasse celui
de la meilleure et si la comparaison avec la **version immédiatement précédente**
ne trouve aucun défaut introduit. L'égalité conserve l'ancienne version. Ce test
ne compare pas tous les défauts du candidat à ceux de la meilleure version.

L'historique n'est ni gelé ni persisté par ces fonctions. Aucun reçu de stockage,
scellement indépendant ou mécanisme de reprise transactionnelle n'est fourni.

## 5. Stagnation et ordre de décision

`detectStagnation` traite les cas dans cet ordre :

1. Moins de deux versions : continuer.
2. Digests identiques : `CONTENT_UNMODIFIED`, proposition `mutate_strategy`.
3. Score inférieur au précédent : `SCORE_REGRESSED`, proposition
   `restore_best_and_mutate`, avec `stagnated: false`.
4. Signature non vide répétée au moins deux fois :
   `DEFECT_SIGNATURE_PERSISTED_N` ; mutation à deux, `abort` à partir de trois.

Des contenus différents peuvent donc stagner sur les mêmes défauts. Un contenu
identique est détecté avant la répétition de signature. Le seuil de répétition
est configurable par `maxIdenticalFailures` ou un argument numérique.

`decideContinuation(session, stagnationCheck)` applique ensuite :

| Priorité | Condition | Action / statut |
| --- | --- | --- |
| 1 | Dernière version `passed` et score au seuil du contrat | `stop`, `promoted`, raison `QUALITY_CRITERIA_SATISFIED` |
| 2 | Stagnation avec mutation recommandée et moins de deux mutations consommées | `mutate_strategy`, `in_progress`, incrément du compteur |
| 3 | Autre stagnation | `stop`, `stagnated` |
| 4 | Nombre de versions au moins égal à `maxIterations` | `stop`, `partially_improved` si le dernier score dépasse V1, sinon `rejected` |
| 5 | Sinon | `continue_repair`, `in_progress`, raison `DEFECTS_PENDING` |

La mutation est décidée avant le plafond d'itérations ; celui-ci peut être dépassé.
La recommandation `restore_best_and_mutate` n'est pas exécutée comme restauration
par cette décision : une régression non stagnante rejoint le contrôle du plafond
ou la réparation ordinaire.

## 6. Boucle et résultat

`executeElevationLoop(input)` attend `input.generator` ; la forme
`executeElevationLoop(driver, options)` utilise `driver.generate`. Le contrat et
la session peuvent être fournis ; sinon ils sont créés. La boucle ne consomme
pas `initialContent` : sa première version provient du générateur.

À chaque tour, le générateur reçoit `{ iteration, prompt, repairPrompt }`.
L'évaluateur reçoit seulement `{ mission: contract.mission }` en options : les
critères, seuils spécialisés et résultats de tests du contrat ne sont pas
transmis comme options d'évaluation. Le seuil de boucle est contrôlé séparément.

La réparation utilise `buildRepairPrompt` : mission d'origine, score, liste des
défauts et au plus 4 000 caractères de la dernière version. Une mutation ajoute
une consigne de changement de perspective ; elle ne change ni modèle ni topologie.

| Champ de résultat | Sens |
| --- | --- |
| `promoted` | `session.status === 'promoted'`, acceptation locale de la dernière version |
| `contract`, `session` | Objets utilisés, avec historique |
| `finalStatus` | `promoted`, `stagnated`, `partially_improved` ou `rejected` après un arrêt normal |
| `bestVersion` | Version désignée par `bestVersionIndex`, pas nécessairement la dernière |
| `demonstratedGain` | Différence de score meilleure/V1, arrondie à deux décimales |
| `isImproved` | Gain strictement positif |
| `totalIterations`, `comparisons` | Nombre de versions et comparaisons adjacentes |

L'acceptation porte sur la dernière version, alors que `bestVersion` suit une
règle distincte. À score égal, une ancienne version peut être conservée malgré
une meilleure conformité de la dernière. L'appelant doit revérifier le contenu
qu'il remet à la mission. Les exceptions du générateur ne sont pas converties
en statut terminal par le service.

`evaluateDoubleBlindConsistency` vérifie la cohérence de deux préférences A/B
inversées fournies par l'appelant. Cette fonction n'appelle aucun juge et n'est
pas raccordée à la boucle.

## 7. Contrôle worker et obligation A-Team

[`workerArtifactContract.js`](../../backend/src/services/agents/workerArtifactContract.js)
appelle `enforceQualityContract` après la validation structurelle d'un artefact.
Le contrôleur lit `worker.workerContract.qualityElevation` : `domain` (défaut
`generic`), `options` pour l'évaluateur, et `minScore` pour le seuil additionnel.
Sans contrat, il retourne `null`.

Le contenu est extrait dans l'ordre : `artifact.content` chaîne, puis son champ
`candidate`, puis `code`, puis sa sérialisation ; à défaut, rapport chaîne,
`report.output`, ou chaîne vide.

| Code | Signification |
| --- | --- |
| `WORKER_QUALITY_ELEVATION_FAILED` | `evaluation.valid` faux ; exception avec évaluation et défauts |
| `WORKER_QUALITY_SCORE_DEFICIENT` | Évaluation valide mais score inférieur à `minScore` ; exception avec évaluation |

[`teamEvidenceService.js`](../../backend/src/services/aTeam/execution/teamEvidenceService.js)
refuse des critères non vérifiés avec `acceptance_criteria_unverified` et une
obligation `{ memberId, reason, unverifiedCriteria, suggestedAction,
status: 'pending_repair', createdAt }`. Les références de critères doivent être
étayées dans le rapport. Ce mécanisme n'exécute pas GQEL et ne constitue pas
une obligation AEIS scellée.

## 8. Frontières de preuve

Les tests de mécanisme sont dans
[`test_quality_elevation_loop.js`](../../backend/tests/test_quality_elevation_loop.js).
Le benchmark GQEL utilise des chaînes prédéfinies : ses scores ne prouvent pas
un gain avec un LLM réel. Aucun statut local, hash ou champ déclaratif ne remplace
un oracle indépendant, une preuve d'exécution ou une autorisation de promotion.
