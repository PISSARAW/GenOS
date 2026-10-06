# Contrats philosophiques et Ontogenèse — exécution, preuves et limites

- **Statut** : Partiel — 375 audits logiciels bornés exécutables ; validation des 375 concepts sur missions réelles non établie
- **Portée** : interprétations opérationnelles, état d’audit, sondes d’ablation et vérificateur Ontogenèse
- **Dernière revue** : 2026-10-06
- **Décisions** : [ADR 0318](../adr/0318-contrats-implementation-concepts.md), [ADR 0319](../adr/0319-raccord-contrats-philosophiques-ontogenese.md), [ADR 0326](../adr/0326-audits-philosophiques-executables-et-preuves.md)

## 1. Ce qui est implémenté et ce qui ne l’est pas

Le registre contient 375 identifiants. Chaque identifiant dispose désormais
d’un profil explicite : primitive partagée, variable d’entrée, prédicat et
interprétation opérationnelle. Aucun concept inconnu ne reçoit un profil
exécutable de secours.

Cette couverture signifie **375 audits bornés**, pas 375 théories réalisées,
375 solveurs spécialisés ni 375 fonctionnalités validées en production.
Une vérification d’un booléen déclaré ne démontre ni la proposition
philosophique ni la réalité externe de ce booléen.

| Dimension | Réalité logicielle |
| --- | --- |
| Catalogue | 375 profils explicites, normalisés et contrôlés |
| Mécanisme | calcul déterministe d’un critère déclaré et mise à jour d’un état d’audit |
| Effet | évaluation enregistrée ; tâche de vérification et réserve de réponse si critère absent ou violé |
| Falsification | cas satisfaisant, contre-exemple, donnée absente, ablation du mécanisme, répétition |
| Organisation | propagation simulée sur quatre graphes ; aucune mission multi-agents lancée par ces sondes |
| Ontogenèse | références scellées ; sources confinées ; replay d’audit avant intégration |
| Validation générale | non établie ; aucun succès de transport ne la remplace |

Le compilateur conserve par défaut `maturity: mechanism-linked`, y compris
pour les 21 anciens pilotes. Leur ancien niveau `tested` n’était pas attaché
à des reçus ; il ne pouvait donc pas constituer une preuve.
Exécuter une expérience retourne un reçu, sans modifier silencieusement le
registre ni ses statuts historiques.

La matrice exhaustive se trouve dans
[la matrice opérationnelle](matrice-operationnelle-philosophique.md).
Le profil source est [operationalProfiles.js](../../backend/src/philosophy/operationalProfiles.js).

## 2. Modèle formel

Pour un contrat (c), un ensemble d’observations déclarées (o), un état
(s) et un indicateur d’activation (a), le mécanisme calcule :

```text
value = o[c.execution.field], seulement si la clé appartient à o
verdict = unobserved | satisfied | violated
s' = a ? enregistrer(verdict, tâches, réserves, s) : copie(s)
```

Une absence reste `unobserved`, pas un succès. Un contre-exemple devient
`violated`. Le prédicat décrit une condition bornée sur une donnée typée ;
il ne décide pas de la vérité d’une théorie.

L’état retourné comporte :

| Champ | Sémantique |
| --- | --- |
| `assessments[id]` | critère évalué, statut et limites de vérité externe |
| `verificationTasks` | vérifications requises pour les critères non satisfaits |
| `responseCaveats` | réserves à remettre au planificateur de réponse |
| `activeUncertainties` | variables encore à vérifier |
| `promotionHeld` | barrière restrictive pour une exigence interne `core.*` non satisfaite |

Une nouvelle observation satisfaisante retire la tâche et la réserve de
ce contrat. Elle ne lève jamais une barrière de promotion préexistante.
L’entrée n’est pas mutée ; l’état de sortie est une copie.
Les observations et l'état sérialisés sont plafonnés à 128 Kio, y compris
l'état après ajout de l'audit. Un dépassement est refusé, sans troncature.
Ce plafond peut limiter une composition riche en réserves avant les 375
contrats : la borne de sélection n'est pas une garantie de capacité mémoire.

Ces réserves sont un état structuré, pas une garantie qu’un LLM les mentionnera
dans sa réponse. Le raccordement automatique de chaque réserve à chaque
générateur de réponse reste une validation distincte.

## 3. Primitives partagées et cibles

Les 375 entrées ne créent pas 375 modules. Elles alimentent onze primitives.

| Primitive | Mécanisme | Cibles |
| --- | --- | --- |
| `self` | FunctionalSelfModel | agent, réflexion |
| `world` | WorldObservationModel | monde, réflexion |
| `belief` | BeliefCheckScheduler | monde, réflexion, réponse |
| `evidence` | EvidenceBoundary | monde, réflexion, réponse |
| `causal` | InterventionComparator | monde, réflexion |
| `relations` | AccountabilityModel | relations, réflexion |
| `topology` | TopologyAudit | topologie, relations |
| `policy` | NormativeAudit | relations, réponse, réflexion |
| `creative` | CreativeCriteriaPlanner | réponse, réflexion |
| `interpretation` | SituatedInterpretation | monde, réponse, réflexion |
| `logic` | DeclaredLogicAudit | monde, réflexion, réponse |

Ces noms désignent les rôles de l’audit partagé. Par exemple,
`DeclaredLogicAudit` n’est pas un solveur complet du premier ordre :
il peut vérifier qu’un domaine ou un témoin a été fourni, mais cette seule
présence ne démontre pas la validité de la formule.

Les catégories restent `state`, `transformation`, `constraint`,
`organization` et `evaluation`. Le scénario et l’expérience sont construits
à partir de la catégorie effective du profil, pas d’un domaine de secours.

## 4. Prédicats réellement calculés

| Prédicat | Condition calculée |
| --- | --- |
| `present` | chaîne non vide après suppression des espaces périphériques |
| `recorded` | tableau non vide |
| `explicit` | booléen exactement égal à `true` |
| `equal` | paire de deux valeurs structurellement égales |
| `different` | paire de deux valeurs structurellement différentes |
| `positive` | nombre fini strictement positif |
| `zero` | nombre fini égal à zéro |
| `probability` | nombre fini dans l’intervalle fermé [0, 1] |
| `multiple` | au moins deux valeurs structurellement distinctes ; des objets JSON identiques ne comptent pas deux fois |
| `ordered` | suite d’au moins deux nombres finis non décroissants |

Ces conditions sont volontairement explicites. `recorded` ne vérifie pas
le contenu historique d’une source ; `multiple` ne certifie pas
l’indépendance de deux agents ; `probability` ne mesure pas une calibration.
Lorsqu’un invariant exige davantage, il faut ajouter un mécanisme spécialisé,
une mesure et des tests propres. La présence du profil ne dispense pas de ce travail.

Les rôles de grille d’analyse et de théorie spéculative restent distincts des
permissions. `runtimeAuthority: false` et `promotionEligible: false`
accompagnent les audits et leurs résultats.

## 5. Provenance, distinctions et tensions

Le compilateur normalise les définitions brutes et les définitions fournies
par le routeur de manière identique. Une référence Ontogenèse et un contrat
lu par MCP possèdent ainsi la même empreinte.

Les sources de l’interprétation sont les fichiers du dépôt. Le champ
`sourceStatus: repository-interpretation-not-scholarly-verification`
évite de présenter ces fichiers comme une vérification académique.
La confiance historique héritée du registre n’est pas une confiance mesurée
dans le mécanisme logiciel.

[operationalRelations.js](../../backend/src/philosophy/operationalRelations.js)
conserve des distinctions et des tensions de conception explicites :

- mondes possibles ontologiques / sémantique modale ;
- école deleuzienne / lentille / différence entre répétitions ;
- contrat social éthique / procédure collective politique ;
- formalisme artistique / musical / mathématique ;
- utilité / correspondance, déontologie / utilitarisme ;
- intention d’auteur / interprétation non exclusive.

Ces liens ne fusionnent pas les identifiants. Ils n’affirment pas non plus une
opposition historique absolue entre les traditions : leur statut est celui
de relations de conception opérationnelle.
Les conflits explicites des pilotes sont conservés lors de la compilation.

## 6. Architecture technique

```text
conceptDefinitions → conceptRegistry → implementationContracts
                              ↓
               operationalProfiles + operationalRelations
                              ↓
             contractOperationalization + contractValidation
                              ↓
                 contractRuntime → état d’audit
                       ↓                  ↓
             contractExperiments    observations de mission
                       ↓                  ↓
              scénario rejoué      vérificateur Ontogenèse
                       └──────── limites et gates séparées ────┘
```

| Fichier | Responsabilité |
| --- | --- |
| `operationalProfiles.js` | correspondance explicite des 375 identifiants |
| `contractOperationalization.js` | cibles, catégorie, limites et interprétation exécutable |
| `contractValidation.js` | schéma, cohérence des profils et conditions de préparation |
| `operationalPredicates.js` | calculs typés et exemples de frontière |
| `contractRuntime.js` | exécution isolée et composition de plusieurs audits |
| `contractExperiments.js` | contrôle, ablation, répétition, reçu et replay |
| `topologyAuditSimulation.js` | messages, convergence et panne d’un nœud dans les graphes simulés |
| `contractFingerprint.js` | sérialisation canonique et SHA-256 du contrat complet |
| `contractPromotion.js` | preuves reconnues, absences et portée de maturité |
| `philosophicalMissionContract.js` | références scellées et exigences de mission |
| `philosophicalObservationService.js` | lecture confinée, liaisons sources et replay |

Une modification d’une limite, d’un profil ou de la provenance change
l’empreinte du contrat. Un ancien reçu ne peut alors satisfaire l’évaluation
du nouveau contrat.

## 7. API et procédure locale

Les opérations passent par `genos_philosophy` et conservent son lease existant.

| Opération | Résultat |
| --- | --- |
| `getImplementationContract` | contrat complet, y compris `execution` |
| `listImplementationContracts` | page du catalogue, filtrable par cible |
| `implementationContractHealth` | couverture et erreurs du compilateur, sans contrats complets |
| `implementationReadiness` | préparation structurale, pas exécution |
| `executeImplementationContract` | état avant/après pour observations fournies |
| `runImplementationExperiment` | reçu de scénario pour un contrat |
| `implementationExperimentCoverage` | couverture et empreintes des reçus, sans exposer tous les cas |
| `assessContractPromotion` | éligibilité bornée, preuves manquantes et limites |

### Pagination et limites de transport

`listImplementationContracts` retourne `{ contracts, total, offset, limit,
nextOffset }`. `offset` est un entier positif ou nul ; `limit` est un entier
entre 1 et 100, avec 100 par défaut. Le filtre `target` est appliqué avant
pagination : `total` dénombre les contrats du résultat filtré. Une page au-delà
de ce total est vide, avec `nextOffset: null`.

Pour lire les 375 contrats, partir de `offset: 0`, puis reprendre le
`nextOffset` retourné jusqu'à `null`. Les offsets négatifs ou non entiers et
les limites hors bornes sont refusés. Le catalogue n'est pas renvoyé en bloc
dans la santé : sa sérialisation complète dépasse la limite de réponse MCP.
La pagination conserve cette limite et ne confère aucun droit supplémentaire.

La compilation conserve les sources, interdictions et plans de falsification
du contrat d'origine. Les sondes exécutables complètent ces plans ; elles ne
prouvent pas que chaque expérience spécialisée a été réalisée. Le schéma est
chargé une seule fois par compilation de registre et validé pour chacun des
375 contrats. Il est relu à la compilation suivante : aucun cache permanent
ne masque un schéma devenu indisponible ou illisible.

Exemple d’exécution bornée :

```json
{
  "operation": "executeImplementationContract",
  "arguments": {
    "conceptId": "epistemology.certainty-doubt",
    "observations": { "doubt.verificationScheduled": false },
    "state": {}
  }
}
```

Cette entrée produit une tâche de vérification et une réserve. Elle n’exécute
pas elle-même une recherche de source : le scheduler consommateur doit prendre
en charge la tâche, sous les autorisations existantes.

Une comparaison locale reproductible s’exécute sans provider ni mission distante :

```powershell
node backend/bin/genos-philosophy-audit.cjs --coverage
node backend/bin/genos-philosophy-audit.cjs --contract epistemology.certainty-doubt
```

Les reçus de scénario décrivent trois cas, quatre graphes et trois graines
(17, 42, 99), soit 36 observations par contrat, 13 500 pour le catalogue.
Le mécanisme est activé, désactivé, puis rejoué sur les mêmes entrées.
La réception du message est simulée dans chaque graphe ; le coût est un nombre
de messages, pas un coût monétaire ni une latence de provider.

Les quatre graphes ont des arêtes explicites. Une propagation calcule les
destinations atteintes, messages dupliqués et tours de convergence. La suppression
d’un nœud teste la portée restante. Le reçu indique toujours
`actualTopologyExecution: false` et `actualRuntimeDispatch: false`.

## 8. Raccord et vérification Ontogenèse

Le registre canonique attache une référence contenant notamment :

```text
id, contractHash, category, maturity, compilationState,
readiness, scenarioId, experimentId, evidenceRequired,
topologies, execution, observationFile, promotionEligible
```

Le plan déduplique les références et ajoute `requiredForMission` :

- les concepts explicitement résolus pour la mission deviennent des exigences ;
- les concepts sélectionnés automatiquement comme contexte restent consultatifs.

Une référence contextuelle n’accorde aucun droit et ne doit pas transformer
une mission ordinaire en demande implicite de validation des 375 concepts.

Le vérificateur utilise `.genos/philosophy-observations.json`, un artefact
généré à ne pas commiter. Son format est :

```json
{
  "missionId": "identifiant-reel-de-lexecution",
  "contractHashes": {
    "epistemology.knowledge": "empreinte-sha256-du-contrat-courant"
  },
  "bindings": {
    "knowledge.layerSeparation": {
      "file": ".genos/checks.json",
      "pointer": "/knowledge/layerSeparation"
    }
  }
}
```

Les identifiants et empreintes ci-dessus sont des emplacements d’exemple :
l’exécution doit employer les valeurs réelles du plan.
Le fichier de source doit exister après les vérifications configurées ; sa
valeur est extraite par pointeur JSON, pas copiée aveuglément depuis la requête.

Le vérificateur :

1. reconstruit les contrats connus et compare leurs empreintes ;
2. rejette les doublons et contrats inconnus ;
3. exige le bon identifiant de mission ;
4. lit l’artefact et ses sources sous confinement, sans traversée ni lien symbolique ;
5. extrait les observations par clés propres, sans accès au prototype ;
6. exécute les audits et refuse tout critère absent ou violé ;
7. conserve empreintes des sources, de l’artefact et des états obtenus ;
8. rejoue avant intégration pour détecter une modification ;
9. recontrôle les sources dans le workspace intégré après les checks configurés ;
10. répète le contrôle après fencing, après commit et lors de la récupération d'un commit.

L’artefact candidat n’est pas copié comme code à commiter. Les checks du
workspace intégré doivent produire leurs propres sources ; le vérificateur
relit les liaisons candidates pour les confronter à ces sources.

La capsule doit rester disponible pour récupérer une mission ayant des audits
requis. Retrouver un commit par son identifiant d'opération ne dispense pas du
replay. Si une preuve est modifiée pendant le fencing, aucun commit n'est effectué ;
si elle change pendant le commit, la mission n'est pas finalisée comme intégrée.

Le répertoire `.genos` n’est pas une autorisation d’écriture supplémentaire.
Si le lease ou le périmètre autorisé interdit la production de l’artefact,
la mission doit signaler cette absence et rester bloquée.

### Bornes et refus

| Condition | Refus |
| --- | --- |
| Contrat modifié | `contrat-philosophique-obsolete` |
| Empreinte portée par l’artefact différente | `empreinte-contrat-obsolete` |
| Autre mission | `observation-autre-mission` |
| Variable non liée | `liaison-observation-requise` |
| Pointeur absent | `observation-source-absente` |
| Critère non satisfait | `audit-philosophique-rejete` |
| Source secrète ou non JSON | `source-observation-interdite` |
| Fichier supérieur à 128 Kio | `observation-philosophique-trop-grande` |
| Plus de 32 sources | `budget-sources-philosophiques-depasse` |
| Replay différent avant commit | `audit-philosophique-obsolete` ou `audit-philosophique-integre-different` |

Un reçu runtime lie le calcul aux sources et au contenu vérifié. Il conserve
`sourceFactsVerified: false` et `independentValidation: false` :
une source produite par un worker n’est pas devenue une preuve indépendante
de son contenu du seul fait que son hash est correct.

## 9. Maturité et preuve admissible

`assessContractPromotion` ne reconnaît plus des noms de reçus sous forme de
chaînes comme preuves. Un reçu de scénario doit correspondre au contrat
courant, avoir une empreinte correcte et résister au replay exécuté par le
vérificateur. Recalculer le hash d’un résultat falsifié ne suffit pas.

| Cible | Exigence | Éligibilité actuelle |
| --- | --- | --- |
| `observable` | reçu de scénario rejoué | audit logiciel borné seulement |
| `tested` | reçu de scénario rejoué | audit logiciel borné seulement |
| `integrated` | scénario et reçu runtime reconnu | bloquée dans ce service de maturité |
| `validated` | précédents et vérification indépendante reconnue | bloquée |

Le vérificateur Ontogenèse possède son propre reçu runtime et sa gate
d’intégration. Il ne fournit pas encore une chaîne d’attestation reconnue
par le service de maturité pour promouvoir automatiquement tous les concepts.
Cette absence est explicite, pas remplacée par une auto-attestation.

Même un reçu de scénario admissible ne produit pas `promotionEligible: true`.
Le calcul d’éligibilité est distinct d’une autorisation de promotion.

## 10. Validation, diagnostic et critères de fin

```powershell
node backend/tests/test_philosophy_registry_health.js
node backend/tests/test_philosophy_executable_contracts.js
node backend/tests/test_philosophy_compilation_boundaries.js
node backend/tests/test_philosophy_contract_transport.js
node backend/tests/test_philosophy_observation_binding.js
node backend/tests/test_philosophy_ontogenesis_integration.js
node backend/tests/test_ontogenesis_concept_registry.js
node backend/tests/test_ontogenesis_resolution_snapshot.js
node backend/tests/test_ontogenesis_capability_plan.js
node backend/tests/test_ontogenesis_mission_context.js
npm --prefix backend run test:ontogenesis
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

Les tests de frontière doivent réfuter au minimum : moteur silencieux,
contre-exemple accepté, donnée manquante présentée comme succès, reçu d’un
autre contrat, reçu ancien, sortie falsifiée avec nouveau hash, mauvaise
mission, source extérieure et disparition des barrières existantes.

Le test d'intégration utilise les 375 audits, des checks exécutés et de vrais
commits dans des dépôts temporaires. Le worker est injecté : ce test démontre
les barrières et la reprise, pas l'utilité des concepts sur une mission autonome.

Pour annoncer **100 % du plan initial**, les sondes bornées ne suffisent pas.
Il reste nécessaire de produire, pour les interprétations retenues :

- des mécanismes spécialisés lorsque l’invariant dépasse le prédicat déclaré ;
- une validation de contenu des observations, pas seulement de leur transport ;
- des missions représentatives avec corrections, attribution, obligations et coûts réellement mesurés ;
- une composition de notions aux effets observables dans les consommateurs runtime ;
- des comparaisons d’organisations réellement exécutées avec mêmes tâches et budgets ;
- une attestation indépendante admise par la gouvernance de maturité.

Les questions métaphysiques, l’expérience subjective et les théorèmes hors du
périmètre d’un solveur ne sont pas des succès que le runtime peut fabriquer.
Une interprétation trop ambiguë reste une grille d’analyse bornée.

## Voir aussi

- [Registre philosophique](registre-philosophique.md)
- [Matrice opérationnelle exhaustive](matrice-operationnelle-philosophique.md)
- [Ontogenèse](../01-concepts/ontogenese.md)
- [Contrats stables Ontogenèse](ontogenese-contrats.md)
- [Morphogenèse](../02-orchestration/topologies/morphogenese.md)
- [Schéma des contrats](../../spec/implementation-contract.schema.json)
