# Qualification Metapopulation du 20 octobre 2026

- **Statut** : qualification locale des contrats runtime ; efficacité produit non qualifiée
- **Portée** : résultats workers, reprise, quiescence, idempotence, variants et compatibilité API
- **Date d'exécution** : 2026-10-20
- **Environnement** : Windows, Node.js et SQLite locaux ; tests Rust relancés hors sandbox pour les écritures de checkpoints

Ce rapport sépare les faits exécutés des conclusions non démontrées. Il ne
constitue ni une campagne comparative contre Trinity/Morphogenèse, ni une
qualification d'un provider, d'un solveur ou d'un adaptateur métier externe.

## 1. Changements qualifiés

| Lot | Commit | Objet |
| --- | --- | --- |
| Lecture uniforme | `32b54d0f6a1997dd6d4221e993fa6883850e96d0` | statut DB et dernier `EVIDENCE_REPORT` pour tous les modes biologiques ; sorties `results`/`answer` |
| Crash et reprise | `d0050db3d2082d91b9df70355880cd4328fd553a` | interruption pendant EXECUTE, reprise du numéro de cycle et snapshot quiescent |
| Idempotence | `eb7b0b1d1b4d8e6d232a42ec5fae4fb936a2b659` | clés obligatoires, persistance, index unique et refus des doublons |
| Registre des variants | `e97a60d41081b0e643dec3d5a58ccef2935ea8a4` | exécution et vérification consolidées ; ADR 0656 |
| Compatibilité API | `f851b506ea346cc9733858397765601c44547fd2` | dépréciation de `sessionId` et distinction des statuts |

Ces commits étaient tous ancêtres du checkout testé. Le checkout contenait
également des changements concurrents hors Metapopulation ; les validations
globales sont donc rapportées séparément et sans attribution abusive.

## 2. Questions de qualification

Le protocole cherchait à falsifier les affirmations suivantes :

1. un worker terminé sans réponse ou preuve peut-il être présenté comme valide ?
2. un crash après EXECUTE peut-il faire sauter un numéro de cycle ?
3. un snapshot peut-il être capturé pendant un effet en vol ?
4. deux actions ou cycles peuvent-ils réutiliser une clé d'idempotence ?
5. un adaptateur externe peut-il être invoqué sans clé ?
6. un variant peut-il être sélectionné sans runtime ou vérificateur associé ?
7. `accepted`, `started`, `completed` et `VERIFIED` sont-ils confondus ?

Une réponse « non » n'est retenue que lorsqu'un test exécutable ou une
contrainte persistée l'établit dans le scope indiqué.

## 3. Protocole

### 3.1 Profil Metapopulation

Commande :

```bash
npm --prefix backend run test:metapopulation
```

Le lanceur exécute treize scripts dans des processus Node distincts. La
revalidation documentaire a terminé avec **13/13 suites PASS** en 50,082
secondes. Une exécution précédente du même checkout avait terminé en 47,402
secondes ; ces durées sont descriptives et ne constituent pas un benchmark.

### 3.2 Gate de qualité

```bash
python scripts/ci/check_code_quality.py
```

Résultat observé lors de la revalidation documentaire : **7 057 fichiers
source, 0 violation, 0 nouvelle violation**.

### 3.3 Workspace Rust

```bash
cargo test --workspace
```

La première exécution confinée a échoué sur deux tests
`genos-cli/biological_crossover` avec une erreur Windows `Accès refusé` lors de
la persistance d'un checkpoint. Le test ciblé puis la workspace complète ont
été relancés hors sandbox ; ils ont terminé avec un code de sortie 0. Ce détour
qualifie le résultat du checkout sur l'hôte, pas son exécution dans le profil de
sandbox initial.

### 3.4 Suite npm globale

```bash
npm test
```

La suite globale n'a pas terminé :
`test_gqwf_trinity_mission_qualification.js` a reçu
`MISSION_CLOSURE_REJECTED` avec `required_member_evidence_invalid`,
`required_workers_incomplete`, `independent_oracle_missing` et
`required_evidence_missing`. Le chemin fautif traversait des changements
concurrents de clôture de mission hors des cinq lots Metapopulation. Ce rapport
ne transforme donc pas cet échec en succès et ne revendique pas une validation
globale du dépôt.

## 4. Matrice des treize suites

| Suite | Contrat principal | Résultat |
| --- | --- | --- |
| `test_metapopulation_completion.js` | cycle complet, statuts et effets des variants | PASS |
| `test_metapopulation_crash_recovery.js` | crash EXECUTE, reprise et quiescence | PASS |
| `test_metapopulation_idempotency.js` | clés, index unique et contrat adaptateur | PASS |
| `test_metapopulation_durable_execution.js` | états durables, migrations, rescue et résidents | PASS |
| `test_metapopulation_cultural_persistence.js` | cultures, transmissions et phylogénie | PASS |
| `test_metapopulation_migration_review.js` | quarantaine, décision locale et politiques | PASS |
| `test_metapopulation_morphogenesis_integration.js` | frontière Morphogenèse/Metapopulation | PASS |
| `test_metapopulation_regional_brain.js` | observation, planification et boucle régionale | PASS |
| `test_metapopulation_variants_runtime.js` | actions exécutables des variants | PASS |
| `test_metapopulation_variant_gaps.js` | absence de trous connus dans les contrats | PASS |
| `test_metapopulation_variant_selection.js` | sélection explicite, signaux et baseline | PASS |
| `test_metapopulation_wiring.js` | imports, façade et câblage | PASS |
| `test_metapopulation_external_adapter_qualification.js` | adaptateur externe minimal de colonisation | PASS |

## 5. Résultats par affirmation

### 5.1 Résultats workers

Le lecteur commun combine le statut de la table `agents` et le dernier
`EVIDENCE_REPORT`. Un worker déclaré `completed` sans réponse ou preuve est
projeté `unverified`, pas réussi. Le dispatch attend tous les membres requis
pour tous les modes biologiques. Cela prouve la garde de lecture locale ; cela
ne transforme pas un rapport auto-déclaré en preuve indépendante.

### 5.2 Reprise de cycle

La fixture établit un cycle 1 `VERIFIED`, interrompt le cycle 2 pendant
EXECUTE, vérifie que le dernier curseur durable reste 1, puis reprend avec
`runAutonomousRegionalRuntime({ resume: true })`. Le cycle repris porte le
numéro 2. Le crash ne saute donc pas un cycle vérifié dans ce scénario.

Le test ne simule pas la perte simultanée du disque, de la base et du système
externe. La garantie dépend d'une base SQLite durable et lisible.

### 5.3 Snapshot quiescent

Un cycle `RESUMED` synthétise un effet en vol. `quiesceForSnapshot` refuse avec
`METAPOPULATION_SNAPSHOT_IN_FLIGHT` et la transaction ne laisse pas la session
faussement quiescente. Après passage explicite de l'effet à `FAILED`, la
capture réussit avec `boundaryVerified: true` et `missionVerified: false`.

La preuve porte sur la cohérence de frontière, pas sur la validité du résultat
de mission ni sur une restauration des dèmes.

### 5.4 Idempotence

Les actions EXECUTE reçoivent une clé non vide. Les doublons dans un plan sont
refusés ; la clé de cycle est persistée ; l'index unique protège la paire
session/clé ; `adapt`, `assimilate` et `rollback` refusent une clé absente.

Cette qualification n'injecte pas de panne dans une vraie API tierce entre
l'effet et le stockage du reçu. Le contrat `RETURN_ORIGINAL_RECEIPT` reste une
obligation d'intégration à vérifier pour chaque adaptateur réel.

### 5.5 Registre des variants

Les seize identifiants partagent un registre d'exécution et un module de
vérification. La matrice de maturité les classe `implemented` lorsque politique,
planificateur, actions attendues et relecture sont présents. Les tests vérifient
sélection, trous, runtime et effets persistés sur fixtures.

Le statut n'établit pas la supériorité d'un variant, la calibration de ses
seuils, ni la qualité d'un moteur externe.

### 5.6 Statuts et compatibilité

Le runtime accepte encore `input.sessionId` uniquement comme alias de
compatibilité et émet `DEP_METAPOPULATION_SESSION_ID`. Les nouveaux appels
utilisent `metapopulationId`. La documentation et les tests distinguent :

- `accepted` : admission ;
- `started` : tentative lancée ;
- `completed` : unité terminée ;
- `VERIFIED` : vérificateur du cycle satisfait dans son scope.

Aucun de ces statuts ne prouve automatiquement la mission globale.

## 6. Invariants exercés

| Invariant | Mécanisme observé |
| --- | --- |
| pas de cycle vérifié sans relecture | `verification.valid === true` avant RECORD |
| pas d'action EXECUTE sans identité | génération/validation de `idempotencyKey` |
| pas de double cycle sous la même clé | contrôle préalable et index SQLite unique |
| pas de snapshot pendant un effet connu | refus des migrations, colonisations, cycles ou baux en vol |
| pas de reprise au-delà du dernier cycle vérifié | curseur lu dans `metapopulation_cycle_states` |
| pas de variant sans runtime résolu | résolution fail-closed du registre |
| pas de succès worker déduit du transport | statut DB et rapport de preuve requis |

## 7. Ce qui est prouvé

- les treize suites Metapopulation passent ensemble sur l'environnement local ;
- les cycles vérifiés, clés d'idempotence et effets des fixtures sont persistés ;
- la reprise ne saute pas le cycle interrompu exercé ;
- la capture refuse l'effet en vol exercé ;
- les seize variants possèdent le câblage attendu ;
- la dépréciation émet le warning documenté ;
- le gate de qualité ne détecte aucune violation.

## 8. Ce qui n'est pas prouvé

- la réussite d'une mission distribuée réelle après panne machine ou réseau ;
- l'exactly-once d'un service externe qui ignore la clé ;
- la qualité d'un solveur, provider ou moteur Rust externe ;
- la supériorité de Metapopulation sur Trinity, Morphogenèse ou une baseline ;
- la calibration scientifique des seuils de fitness, diversité ou quorum ;
- la sécurité d'un processus externe au-delà des écritures passant par les API
  de confinement ;
- la validation globale du dépôt, puisque `npm test` a rencontré un échec hors
  périmètre dans le checkout concurrent.

## 9. Prochain niveau de preuve

Pour promouvoir la qualification :

1. exécuter la campagne dans un checkout propre et figé ;
2. faire passer `npm test` et `cargo test --workspace` dans le même artefact CI ;
3. injecter des crashs entre effet externe et persistance du reçu ;
4. qualifier au moins un adaptateur réel avec rejeu du reçu original ;
5. tester perte de processus, indisponibilité SQLite et concurrence de runners ;
6. comparer les variants et une baseline à budget égal, sur tâches préenregistrées ;
7. publier résultats bruts, seeds, versions, exclusions et intervalles
   d'incertitude.

## 10. Reproduction minimale

```bash
npm ci
npm ci --prefix backend
npm --prefix backend run test:metapopulation
python scripts/ci/check_code_quality.py
cargo test --workspace
```

Sur Windows, si un test de checkpoint échoue par refus d'accès dans un sandbox,
relancer seulement après avoir établi que l'opération demandée est autorisée et
consigner l'écart d'environnement. Ne pas reclasser automatiquement l'échec en
flaky.

## Voir aussi

- [Fiche Metapopulation](../02-orchestration/topologies/metapopulation.md)
- [Runtime Metapopulation](../03-reference/runtime-metapopulation.md)
- [Variants Metapopulation](../03-reference/variants-metapopulation.md)
- [Runbook Metapopulation](../04-exploitation/runbook-metapopulation.md)
- [ADR 0656 — registre runtime des variants](../adr/0656-registre-runtime-variants-metapopulation.md)
