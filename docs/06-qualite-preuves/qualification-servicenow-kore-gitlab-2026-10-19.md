# Qualification ciblée — SHEV, réparation GVX et chaîne d'approvisionnement

- **Type** : preuve de qualification bornée.
- **Statut** : huit contrats ciblés réussis ; qualification globale du dépôt non établie.
- **Portée** : cycle de cicatrisation SHEV, réparation GVX guidée par traces et effet régi par identité d'artefact.
- **Date d'exécution** : 2026-10-19.
- **Dernière revue** : 2026-10-19.
- **Décisions** : [ADR 0650b](../adr/0650-cycle-cicatrisation-shev.md), [ADR 0651b](../adr/0651-admission-mhc-et-capacites-au-point-effet.md), [ADR 0652](../adr/0652-reparation-guidee-par-traces-gvx.md).

## 1. Objet et niveau de preuve

Cette fiche qualifie trois évolutions inspirées respectivement par des capacités
associées à ServiceNow, Kore.ai et GitLab. Elle vérifie des contrats locaux et
leurs refus structurants. Elle ne constitue ni un benchmark comparatif des
produits concurrents, ni une qualification terrain, ni une autorisation de
promotion.

Une commande terminée avec succès est une observation, pas une conclusion
générale. Le niveau atteint ici est :

```text
code présent
  + contrats positifs vérifiés
  + contre-cas critiques vérifiés
  + documentation reliée au code
  ≠ qualification globale du dépôt
  ≠ efficacité causale en production
  ≠ promotion automatique
```

## 2. Périmètre audité

| Axe | Commits fonctionnels | Contrat principal | Revendication autorisée |
| --- | --- | --- | --- |
| SHEV / ServiceNow | `d4da4396`, `b273d797`, `d3b9d92a` | épisode durable, réconciliation au tick, dossier vérifiable | le protocole local suit une trajectoire de cicatrisation fondée sur des faits persistés |
| GVX / Kore.ai | `d77294ae`, `7af2bf5`, `74deb511` | attribution trace→locus, mutation mono-locus, expérience appariée | un candidat peut devenir éligible à une revue externe après holdout scellé |
| Chaîne d'approvisionnement / GitLab | `d1a677ec`, `f1a43b12`, `320682e8` | identité d'artefact, admission, capacité à usage unique, effet régi | un effet peut être refusé avant ou au point d'exécution si ses liaisons ne sont pas exactes |

Les identifiants ci-dessus désignent les commits d'implémentation observés dans
la lignée V3. Ils ne remplacent pas les tests et ne garantissent pas que le
checkout reste identique après cette date.

## 3. Protocole commun

### 3.1 Environnement

- branche d'intégration : `v3` ;
- runtime ciblé : Node.js du dépôt ;
- persistance : SQLite via les migrations du backend lorsque le test l'exige ;
- fixtures : locales et déterministes ;
- réseau externe : non requis par les huit tests ciblés ;
- secrets : valeurs de test éphémères, sans secret de production.

### 3.2 Règles d'acceptation

Une verticale est déclarée **ciblée verte** uniquement si :

1. tous ses tests listés terminent avec un code nul ;
2. ses refus critiques font partie des assertions ;
3. aucun test ne transforme son succès en `promotionAllowed: true` ;
4. ses limites d'autorité sont documentées ;
5. les contrôles de qualité et d'index documentaire restent séparés de la
   qualification fonctionnelle.

L'échec d'une suite globale maintient la qualification globale en état non
établi, même si les tests ciblés sont verts.

## 4. Résultats SHEV — cycle de cicatrisation

### 4.1 Commandes

```bash
node backend/tests/test_shev_healing_contract.js
node backend/tests/test_shev_healing_integration.js
```

### 4.2 Résultat observé

| Test | Résultat au 2026-10-19 | Ce qu'il établit |
| --- | --- | --- |
| `test_shev_healing_contract.js` | réussi | transitions autorisées, identifiant déterministe, idempotence, phases terminales, continuité et limites du dossier |
| `test_shev_healing_integration.js` | réussi | migration réelle, ouverture depuis une dégradation, raccord au tick Ontogenèse et progression depuis les faits persistés |

### 4.3 Contre-preuves exercées

- transition absente de l'automate refusée ;
- modification d'une phase terminale refusée ;
- seconde ouverture pour la même observation sans second épisode ;
- dossier incohérent refusé ;
- guérison impossible sans deux fenêtres longitudinales confirmées ;
- attribution causale et qualification terrain laissées à `not_claimed` et
  `not_established`.

### 4.4 Limite de conclusion

Les tests démontrent le fonctionnement du protocole local et sa persistance. Ils
ne démontrent pas qu'une action SHEV cause une amélioration métier, qu'un capteur
représente fidèlement un système réel, ni qu'un fournisseur d'action est sûr en
production.

## 5. Résultats GVX — réparation guidée par traces

### 5.1 Commandes

```bash
node backend/tests/test_gvx_trace_locus_attribution.js
node backend/tests/test_gvx_affinity_mutation_planner.js
node backend/tests/test_gvx_trace_guided_repair.js
```

### 5.2 Résultat observé

| Test | Résultat au 2026-10-19 | Ce qu'il établit |
| --- | --- | --- |
| `test_gvx_trace_locus_attribution.js` | réussi | attribution bornée d'un échec à un locus avec preuve et vérificateur indépendants |
| `test_gvx_affinity_mutation_planner.js` | réussi | génération limitée à des mutations mono-locus allowlistées et liées au diagnostic |
| `test_gvx_trace_guided_repair.js` | réussi | séparation entraînement/holdout, comparaison appariée, garde de régression et journalisation des décisions |

### 5.3 Contre-preuves exercées

- trace sans statut d'échec pertinent rejetée ;
- preuve sans liaison exacte trace/hypothèse/locus rejetée ;
- vérificateur partageant l'acteur ou le workspace du producteur rejeté ;
- mutation multi-locus, valeur non allowlistée ou hash attendu absent rejeté ;
- recouvrement entraînement/holdout rejeté ;
- snapshot, branches ou conditions non appariés rejetés ;
- amélioration d'objectif avec dépassement d'une garde de régression rejetée ;
- candidat concluant seulement à `candidate_eligible_for_external_review`.

### 5.4 Limite de conclusion

La campagne établit que le pipeline protège le holdout et borne les mutations.
Elle ne démontre pas la supériorité générale d'un agent, la validité sémantique
de toutes les métriques, ni l'absence de surapprentissage hors du corpus réservé.
Le pipeline ne possède aucune autorité de promotion.

## 6. Résultats chaîne d'approvisionnement — admission et point d'effet

### 6.1 Commandes

```bash
node backend/tests/test_artifact_identity_admission.js
node backend/tests/test_point_of_effect_capability.js
node backend/tests/test_governed_supply_chain_effect.js
```

### 6.2 Résultat observé

| Test | Résultat au 2026-10-19 | Ce qu'il établit |
| --- | --- | --- |
| `test_artifact_identity_admission.js` | réussi | identité canonique, signature HMAC, liaison artefact/SBOM/scope/capacités et reçu d'admission non promotable |
| `test_point_of_effect_capability.js` | réussi | capacité opaque, courte, exacte, à usage unique et résolution du secret au point d'effet |
| `test_governed_supply_chain_effect.js` | réussi | ordre admission→capacité→effet et chaîne de reçus liée à la même identité |

### 6.3 Contre-preuves exercées

- manifeste ou SBOM altéré refusé ;
- scope demandé différent du scope signé refusé ;
- capacité absente, expirée, déjà consommée ou mal liée refusée ;
- consommation effectuée avant l'appel d'effet pour empêcher le double usage ;
- fuite du secret brut ou de sa représentation encodée dans la sortie refusée ;
- succès du transport sans admission valide insuffisant ;
- tous les reçus conservent `promotionAllowed: false`.

### 6.4 Limite de conclusion

La signature HMAC locale n'est pas une identité fédérée, un registre de
transparence ou une attestation matérielle. Le stockage mémoire des capacités ne
constitue pas une solution distribuée. Le contrôle de fuite couvre les formes
testées ; il ne prouve pas l'absence de tout canal auxiliaire.

## 7. Contrôles transversaux

Les contrôles suivants ont été exécutés séparément des huit tests fonctionnels :

```bash
python scripts/ci/check_code_quality.py
python scripts/ci/check_adr_index.py
```

Résultats observés lors de la campagne :

| Contrôle | Résultat | Interprétation |
| --- | --- | --- |
| qualité du code | réussi, `6904` fichiers inspectés, `0` nouvelle violation | les changements n'ajoutent pas de dette au regard du gate courant |
| index ADR | réussi, `767` entrées inspectées, `0` problème | les décisions référencées restent indexées et cohérentes |

Ces mesures doivent être relancées sur le checkout livré. Le nombre de fichiers
ou d'entrées est une observation datée, pas une constante du dépôt.

## 8. Vérifications globales et bloqueurs

La définition de fini du dépôt demande aussi :

```bash
npm test
cargo test --workspace
```

Ces deux portes ne sont pas déclarées vertes dans cette fiche.

### 8.1 Suite npm globale

La revalidation du 2026-10-20 sur le checkout de travail a franchi les sept cas
de la suite Biology et le test de liaison des workspaces, puis s'est arrêtée au
début de la suite backend : le processus de test n'a pas pu se reconnecter au
serveur qu'il venait d'ouvrir sur `::1:4099` ou `127.0.0.1:4099` (`EACCES`). Ce
refus du loopback empêche d'observer la suite complète dans ce bac à sable.

Indépendamment de ce blocage d'environnement, une exécution antérieure sur un
HEAD propre de référence reproduisait un échec préexistant dans
`test_gqwf_trinity_mission_qualification.js` :

```text
INVALID_WORKER_ARTIFACT
```

Le dossier attendu manque dans ce scénario. Des modifications locales non liées
peuvent masquer l'échec ; elles ne sont donc pas admises comme preuve que la
régression est résolue. Aucun des huit tests ciblés de cette fiche n'emprunte ce
parcours GQWF/Trinity.

### 8.2 Workspace Cargo

La revalidation du 2026-10-20 a atteint la compilation de `aws-lc-sys` après
deux avertissements dans `genos-common`, puis la session d'exécution a été
interrompue sans verdict. Une exécution antérieure dans le même environnement
avait échoué à cette étape : NASM indisponible, puis erreur de liaison Windows
`LNK1114` liée à l'accès au fichier. Ces observations ne permettent pas de
conclure à une régression Rust causée par les trois verticales, mais interdisent
de revendiquer un workspace globalement vert.

### 8.3 Conséquence

Le statut opposable reste :

```text
huit tests ciblés verts
+ contrôles documentaire et qualité verts au moment de la campagne
+ deux portes globales non établies
= qualification ciblée seulement
```

## 9. Matrice de traçabilité

| Exigence | Implémentation | Test | Documentation |
| --- | --- | --- | --- |
| épisode SHEV durable et idempotent | `healingEpisodeService.js`, migration 147 | contrat + intégration SHEV | [exploitation SHEV](../03-reference/exploitation-shev.md) |
| réconciliation fondée sur les faits | `healingReconciliationService.js`, tick Ontogenèse | intégration SHEV | [SHEV](../02-orchestration/shev.md) |
| dossier continu à revendications fermées | `healingDossierService.js` | contrat SHEV | [exploitation SHEV](../03-reference/exploitation-shev.md#contrat-du-dossier-de-cicatrisation) |
| attribution trace→locus indépendante | `gvxTraceLocusAttribution.js` | attribution GVX | [réparation GVX](../02-orchestration/reparation-guidee-par-traces-gvx.md) |
| mutation mono-locus bornée | `gvxAffinityMutationPlanner.js` | planner GVX | [réparation GVX](../02-orchestration/reparation-guidee-par-traces-gvx.md#planification-de-mutation) |
| holdout scellé et garde de régression | `gvxTraceGuidedRepair.js` | réparation GVX | [réparation GVX](../02-orchestration/reparation-guidee-par-traces-gvx.md#expérience-appariée-en-nurserie) |
| identité d'artefact admise | `artifactIdentityService.js` | admission | [gouvernance agent-native](../04-exploitation/gouvernance-supply-chain-agent-native.md) |
| secret résolu au point d'effet | `pointOfEffectCapabilityService.js` | capacité | [gouvernance agent-native](../04-exploitation/gouvernance-supply-chain-agent-native.md) |
| ordre admission→capacité→effet | `governedEffectService.js` | effet régi | [gouvernance agent-native](../04-exploitation/gouvernance-supply-chain-agent-native.md) |

Les ancres sont informatives et doivent être vérifiées par le contrôle de liens
du dépôt lorsque les titres évoluent.

## 10. Reproduction minimale

Depuis la racine du dépôt, exécuter les tests dans l'ordre pour limiter le bruit
de ressources et conserver le premier échec :

```bash
node backend/tests/test_shev_healing_contract.js
node backend/tests/test_shev_healing_integration.js
node backend/tests/test_gvx_trace_locus_attribution.js
node backend/tests/test_gvx_affinity_mutation_planner.js
node backend/tests/test_gvx_trace_guided_repair.js
node backend/tests/test_artifact_identity_admission.js
node backend/tests/test_point_of_effect_capability.js
node backend/tests/test_governed_supply_chain_effect.js
python scripts/ci/check_code_quality.py
python scripts/ci/check_adr_index.py
```

Conserver la sortie, le commit exact et les versions Node/Python avec le dossier
de campagne. Une reproduction sur un autre environnement doit être ajoutée
comme nouvelle observation, sans réécrire celle-ci.

## 11. Prochain niveau de preuve

La qualification supérieure exige au minimum :

1. corriger et requalifier la suite globale GQWF/Trinity sur un checkout propre ;
2. rendre le workspace Rust vert dans un environnement avec chaîne native
   complète ;
3. exécuter une campagne SHEV préenregistrée avec fournisseur réel, fenêtres
   longitudinales et vérificateur indépendant ;
4. comparer GVX sur un corpus réservé assez large pour mesurer faux positifs,
   faux négatifs et régressions ;
5. remplacer ou compléter les primitives locales de supply chain par une
   identité vérifiable, une persistance distribuée et des essais de concurrence ;
6. exécuter des tests adversariaux de relecture, altération, confusion de scope,
   fuite de secret et récupération après crash.

Tant que ces conditions ne sont pas satisfaites, la formulation correcte est
« contrats ciblés vérifiés », jamais « système qualifié en production ».
