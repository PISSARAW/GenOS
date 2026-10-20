# Qualification Holobionte — contrats probants et campagne causale bornée

- **Statut** : qualification ciblée réussie sur le lot Holobionte ; portée générale non promue
- **Lot qualifié** : `f92a155eb9f24843d07ae999c9e08cf80a93557e`
- **Portée** : adaptateurs, dysbiose, isolation, session et harnais causal local
- **Date** : 2026-10-20

Ce dossier relie les cinq exigences de durcissement du runtime à des contrats
exécutables et à leurs contre-épreuves. Il ne certifie ni un fournisseur
externe, ni une isolation de production, ni un avantage causal général de la
topologie Holobionte.

## 1. Questions de qualification

| Axe | Question falsifiable | Critère |
| --- | --- | --- |
| adaptateurs | une mission peut-elle passer avec un rôle absent, non fonctionnel ou auto-vérifié ? | refus explicite et provenance conservée |
| santé | un score de dysbiose peut-il être présenté comme une mesure ou promouvoir seul ? | statut de chaque signal, agrégat heuristique, promotion interdite |
| isolation | un candidat peut-il être admis sans preuve liée à l'adaptateur d'essai ? | admission refusée |
| session | la fin d'un cycle et la disposition de l'hôte sont-elles ambiguës ? | `sessionStatus` et `sessionClosed` exposés, clôture déterministe |
| causalité | une comparaison peut-elle masquer le témoin, l'oracle ou les valeurs absentes ? | bras séparés, oracle distinct, `null` conservé, PASS/FAIL par cas |

La réussite de ces critères prouve la présence et l'exercice des barrières dans
le périmètre local. Elle ne prouve pas la qualité d'une capacité externe ni la
supériorité d'une organisation.

## 2. Artefacts inspectés

### Runtime

- `backend/src/services/holobionte/runtime/capabilityExecutionPolicy.js` ;
- `backend/src/services/holobionte/runtime/holobiontMissionService.js` ;
- `backend/src/services/holobionte/runtime/holobiontRuntime.js` ;
- `backend/src/services/holobionte/runtime/holobiontHealthLoop.js` ;
- `backend/src/services/holobionte/runtime/holobiontGovernanceLoop.js` ;
- `backend/src/services/holobionte/health/dysbiosisDetector.js` ;
- `backend/src/services/holobionte/symbionts/symbiontAdmissionService.js` ;
- `backend/src/services/holobionte/holobiontStore.js`.

### Campagne et exemples

- `benchmarks/holobiont-causal-campaign/` ;
- `backend/tests/test_holobiont_causal_campaign.js` ;
- `examples/holobionte/arithmetic-mission.cjs` ;
- `examples/holobionte/isolation-proof.cjs`.

### Documentation opposable

- [référence runtime](../03-reference/runtime-holobionte.md) ;
- [guide d'exploitation](../04-exploitation/operer-runtime-holobionte.md) ;
- [campagne causale](../06-benchmarks/campagne-causale-holobionte.md) ;
- [topologie](../02-orchestration/topologies/holobionte.md).

## 3. Protocole exécuté

Les contrôles ont été exécutés depuis la racine du dépôt sur le lot qualifié :

```powershell
npm --prefix backend run test:holobionte
node backend/tests/test_holobiont_causal_campaign.js
node examples/holobionte/run-mission.cjs
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

La suite agrégée Holobionte a exécuté 58 scripts. La campagne ciblée utilise
trois cas, deux répétitions dans le test, deux bras par répétition, soit douze
exécutions de bras. Les suites globales Node et Rust ont été exécutées après la
qualification ciblée. Sous le bac à sable Windows, un premier passage Cargo a
rencontré un refus d'accès sur un checkpoint ; la relance hors de cette
restriction a réussi. Cette distinction d'environnement est conservée au lieu
de transformer l'incident de transport en résultat produit.

## 4. Résultats

| Contrôle | Résultat observé | Portée de la preuve |
| --- | --- | --- |
| suite `test:holobionte` | `58/58` scripts réussis | contrats Holobionte couverts par les tests locaux |
| campagne causale ciblée | `PASS`, 3 cas × 2 répétitions × 2 bras | exactitude, séparation de processus et rapport borné |
| exemple arithmétique | somme `30`, mission `VERIFIED`, session `CLOSED` | chemin nominal local avec admission et vérification |
| qualité du code | zéro nouvelle violation observée | respect de la gate statique du dépôt |
| `npm test` | réussi | absence de régression Node détectée par la suite globale |
| `cargo test --workspace` | réussi après relance hors restriction du bac à sable | absence de régression Rust détectée dans cet environnement |

Les résultats sont attachés au commit indiqué en tête. Un HEAD ultérieur ou un
adaptateur différent exige une nouvelle exécution ; ce document n'est pas une
attestation flottante du checkout courant.

## 5. Adaptateurs et provenance

Le préflight et l'exécution refusent séparément :

- un exécuteur absent ou non fonctionnel ;
- un vérificateur absent ou non fonctionnel ;
- un exécuteur d'essai absent lorsqu'un candidat doit être admis ;
- un vérificateur identique à l'exécuteur par référence ou par empreinte
  d'implémentation.

Chaque rôle reçoit un dossier `genos.holobiont-adapter-provenance/v1` : rôle,
identifiant, version éventuelle, hash d'implémentation et hash du dossier. Le
reçu de mission expose les dossiers dans `adapterProvenance`; les reçus
d'exécution conservent les références du producteur et du vérificateur.

### Contre-épreuves couvertes

| Mutation | Verdict attendu |
| --- | --- |
| callback absent | code `*_REQUIRED` correspondant |
| valeur non fonctionnelle | refus au préflight |
| même fonction pour exécuter et vérifier | `HOLOBIONT_VERIFIER_NOT_INDEPENDENT` |
| wrapper divergeant de sa provenance liée | `HOLOBIONT_ADAPTER_PROVENANCE_INVALID` |
| résultat ou consommation modifié pendant la vérification | `HOLOBIONT_RESULT_CHANGED` ou `HOLOBIONT_USAGE_CHANGED` |

La provenance identifie le callback local appelé. Elle ne prouve pas seule
l'identité juridique d'un fournisseur, son déploiement ou son indépendance
organisationnelle.

## 6. Isolation d'admission

Le reçu d'essai n'est admissible que si `isolationProof` :

1. utilise `genos.holobiont-isolation-proof/v1` et porte `status: VERIFIED` ;
2. place exactement le `proofHash` du rôle `trial` dans `adapterProofHash` ;
3. porte un identifiant, un mécanisme et un horodatage valides ;
4. atteste `process: ISOLATED`, un workspace `EPHEMERAL` ou `READ_ONLY`, et un
   réseau `DENIED` ou `RESTRICTED` ;
5. voit toutes ses références reprises par le vérificateur indépendant.

Une absence, une liaison à un autre adaptateur, une frontière permissive ou
une référence non couverte produit `HOLOBIONT_ISOLATION_UNVERIFIED`. La mission
retourne alors `ADMISSION_REJECTED` lorsqu'elle agrège la décision d'admission.

Le runtime vérifie la structure et la corrélation de la preuve. La réalité de
la frontière physique dépend du processus, conteneur ou sandbox piloté par
l'intégrateur. Le helper d'exemple n'est donc pas une preuve de production.

## 7. Santé, signaux et non-promotion

Les six signaux sont conservés sous `{ value, status }`, avec un statut limité
à `measured` ou `heuristic`. Les signaux bruts non annotés et les dérivations du
registre deviennent heuristiques. Un statut inconnu ou une valeur hors de
`[0, 1]` est refusé.

Le détecteur produit :

- les signaux et leurs statuts ;
- les seuils effectivement utilisés ;
- `measurementStatus`, mesuré seulement si les six entrées le sont ;
- `status: heuristic` et `detectionStatus: heuristic` pour l'agrégat ;
- `promotionEligible: false` et une raison explicite.

La gouvernance ne rend automatiques que `WARN`, `THROTTLE`,
`REDUCE_RESOURCES` et `QUARANTINE`. Toute autre action exige une approbation.
Même appliquée, une sanction heuristique ne change pas rétroactivement le
verdict probant d'une capacité et ne devient pas une autorité de promotion.

### Contre-épreuves couvertes

| Mutation | Verdict attendu |
| --- | --- |
| signal numérique nu | classé `heuristic` |
| statut `estimated` ou inconnu | `HOLOBIONT_DYSBIOSIS_INVALID` |
| seuil hors intervalle | refus |
| `watchScore >= alertScore` | refus |
| six signaux mesurés | agrégat toujours heuristique et non promotable |
| action non bornée | `approvalRequired: true`, aucune action automatique |

## 8. Cycle, session et fermeture

`runCycle` ne ferme jamais l'hôte. Chaque chemin normal retourne cependant
`holobiontId`, `sessionRevision`, `sessionStatus` et `sessionClosed`. La couche
mission relit la session après la décision d'arrêt et expose les mêmes champs.

La disposition est déterministe :

| Scope | Mission vérifiée | Disposition | `sessionClosed` |
| --- | --- | --- | --- |
| `MISSION` | oui | `CLOSED` | `true` |
| `PERSISTENT` | oui, aucune condition bloquante | `QUIESCENT` | `false` |
| tout scope | non | session conservée pour diagnostic | selon état relu, normalement `false` |
| tout scope | arrêt refusé | `ACTIVE`, statut mission `STOP_BLOCKED` | `false` |

La quiescence atteste la frontière du runtime local, pas l'absence universelle
d'effets distants. Ceux-ci restent à réconcilier par leurs adaptateurs.

## 9. Campagne causale bornée

Le harnais exécute le témoin direct et le runtime Holobionte dans deux processus
distincts. L'oracle recalcule le résultat depuis les entrées sans lire le statut
Holobionte. Le rapport conserve :

- les hash SHA-256 des cas, de l'oracle et du worker ;
- les PID et le mode d'isolation de chaque bras ;
- le verdict `PASS` ou `FAIL` par répétition et par cas ;
- les preuves et métriques propres au bras Holobionte ;
- des `null` explicites lorsque le témoin ne possède pas une métrique.

Le test falsifie aussi l'oracle, les bornes et la séparation des PID. La CLI
écrit le rapport avec création exclusive afin de ne pas remplacer une preuve
existante.

Cette campagne démontre que le chemin de comparaison fonctionne sur trois
sommes déterministes. Elle ne mesure pas une taille d'effet, ne couvre pas une
mission métier et ne remplace pas le protocole longitudinal à douze bras.

## 10. Claims autorisés

À partir de ce dossier, il est permis d'affirmer que, sur le lot qualifié :

- les adaptateurs requis sont validés et leur provenance est reçue ;
- l'auto-vérification locale évidente est refusée ;
- l'admission lie sa preuve d'isolation à l'adaptateur d'essai ;
- les signaux de dysbiose distinguent mesure et heuristique ;
- un agrégat heuristique ne peut pas promouvoir seul ;
- la session expose sa fermeture et choisit `CLOSED` ou `QUIESCENT` selon le
  scope ;
- une campagne appariée locale et bornée produit un rapport falsifiable.

Il n'est pas permis d'affirmer que :

- l'exemple crée une sandbox système de production ;
- les fonctions distinctes sont nécessairement opérées par des autorités
  indépendantes ;
- la campagne prouve un gain causal, économique ou qualitatif ;
- les signaux heuristiques sont des mesures calibrées ;
- un statut `VERIFIED` dispense des gates métier aval ;
- le lot qualifie tous les variants, fournisseurs et environnements futurs.

## 11. Risques résiduels

| Risque | Conséquence | Prochaine preuve attendue |
| --- | --- | --- |
| attestation d'isolation mensongère | admission indûment acceptée malgré une structure valide | attestation signée par l'infrastructure et vérification hors processus |
| exécutant et vérificateur sous même contrôle | indépendance organisationnelle non démontrée | identités de service et autorités séparées |
| métriques contractuelles assimilées à des mesures fournisseur | comparaison de coût trompeuse | compteur fournisseur ou télémétrie système sourcée |
| seulement trois cas arithmétiques | faible validité externe | corpus métier versionné, seeds, puissance et répétitions |
| SQLite mémoire dans la campagne | persistance et reprise non éprouvées | campagne fichier, crash contrôlé et reprise |
| effets distants non annulés | session localement calme mais monde externe ambigu | idempotence, reçus d'effet et réconciliation |

## 12. Critères du niveau suivant

Une promotion au-delà de cette qualification ciblée exige cumulativement :

1. des adaptateurs externes versionnés et attestés ;
2. une isolation observée par une autorité séparée du candidat ;
3. un corpus métier avec baseline équitable, répétitions et plan de puissance ;
4. des mesures réelles de coût, durée, qualité et échecs, sans imputation des
   valeurs absentes ;
5. des campagnes sur stockage persistant avec crash et reprise ;
6. une reproduction indépendante du rapport et de ses artefacts ;
7. une décision de promotion distincte des scores de santé heuristiques.

## Références

- [Runtime Holobionte](../03-reference/runtime-holobionte.md)
- [Guide d'exploitation](../04-exploitation/operer-runtime-holobionte.md)
- [Campagne causale bornée](../06-benchmarks/campagne-causale-holobionte.md)
- [Benchmark longitudinal](../06-benchmarks/benchmark-longitudinal-holobionte.md)
- [ADR 0330 — missions contractuelles vérifiées](../adr/0330-holobionte-missions-contractuelles-verifiees.md)
- [ADR 0401 — preuve d'arrêt](../adr/0401-preuve-arret-mission-holobionte.md)
