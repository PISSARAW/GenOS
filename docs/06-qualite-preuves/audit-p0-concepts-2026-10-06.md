# Audit P0 des concepts GenOS

- **Statut** : P0 clôturé pour le périmètre convenu des lots B01 à B07.
- **Portée** : 649 références du programme de recherche ; contrats, chemins candidats,
  baseline de tests et conditions d'entrée du socle P1.
- **Dernière revue** : 2026-10-07.

## Statut consolidé au 2026-10-07

Les reprises consignées ci-dessous ferment les obligations P0. Les résultats
initiaux et les limites des passes intermédiaires sont conservés comme historique ;
leurs mentions « ouvert » ou « partiel » ne décrivent pas le statut consolidé.

| Lot | Statut | Preuve de clôture |
| --- | --- | --- |
| B01 | Clôturé | Dépendances verrouillées rétablies ; chaîne complète `npm test` exécutée avec code 0. |
| B02 | Clôturé | Gate global sans nouvelle violation ; baseline de dette non relâchée. |
| B03 | Clôturé | Cas positifs soutenus par preuves qualifiées ; raccourcis de provenance et reçus négatifs refusés. |
| B04 | Clôturé | MsgPack raccordé ; aller-retour, entrée corrompue, migration SQLite et idempotence vérifiés. |
| B05 | Clôturé, exploratoire | [Trois pilotes comparatifs](qualification-trois-pilotes-comparatifs-2026-10-07.md) : données versionnées, jeux réservés, baselines, ablations, budgets comparables et reproduction aveugle par un opérateur IA distinct sur le même hôte. |
| B06 | Clôturé au périmètre implémenté | [Consommateurs L01–L05 et L22](qualification-b06-reprise-et-holdout-2026-10-07.md) : provenance mémoire, promotions concurrentes, reprise, snapshot Windows et clients interactifs qualifiés. |
| B07 | Clôturé | Checkpoint créé et relu ; cinq contrôles de reprise exécutés avec succès. |

La validation finale consignée dans le rapport B05 donne **0 nouvelle violation**,
`npm test` avec code 0 et **673 tests Rust réussis** via `cargo test --workspace`.
La dette historique admise par la baseline demeure distincte des écarts P0 résorbés.

Cette clôture porte sur le socle technique et sa qualification bornée. Les fonctions
de recherche P1 et la démonstration d'un gain général en IA restent à réaliser.
Les limites des pilotes et des garanties de reprise restent celles de leurs rapports.

## Périmètre et méthode

L'[audit détaillé](https://chatgpt.com/space/page_631a0f45db2c8191aec6f1391eca8a15)
conserve les 649 références et leur affectation aux lots du
[programme](https://chatgpt.com/space/page_f582a574b6d4819182c266e9d429d922).
Elles correspondent à 617 clés canoniques distinctes ; 54 clés apparaissent
dans plusieurs contextes. Une même clé ne prouve pas l'équivalence des mécanismes.

La première collecte observe le checkout `474b345473f7add78539c8f2f82492500561bf7f`
avec des modifications locales préexistantes. Les empreintes de sources et journaux
restent dans le dossier local `p0-audit` associé à cette conversation ; ils ne sont
pas ajoutés au dépôt. La lecture n'est pas un snapshot atomique du checkout.

Le sondage de `canonicalConceptRegistry.resolveConceptReferences` utilise le
catalogue de capacités existant, sans exécuter les outils résolus. Les indicateurs
`available` et `executable` décrivent des contrats, pas les fonctionnalités de
recherche proposées. Les références littérales et imports fournissent des candidats
à lire ; leur présence ne prouve ni effet causal ni bénéfice empirique.

| État déclaré initial | Références |
| --- | ---: |
| Contrat exécutable | 287 |
| Contrat accessible | 190 |
| Conditionnel ou indisponible | 171 |
| Résolution absente | 1 |

L'entrée absente est MsgPack (`C576`). Le service
`backend/src/services/bioPolymerPersistenceService.js` utilise déjà `msgpackr` :
l'écart initial concerne le registre d'interfaces.

L'audit statique Node examine 2 484 services : 1 936 accessibles par imports
statiques, 261 classés `test-only`, 277 `unresolved` et 10 `dynamic-wiring`.
Ces catégories nécessitent une lecture des consommateurs avant toute décision
sur l'utilisation ou la suppression d'un module.

## Baseline exécutée

Environnement observé : Node 24.18.0, Rust et Cargo 1.97.1, Python embarqué 3.12.14.

| Commande | Résultat initial et limite |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | Échec : 5 236 fichiers contrôlés, 299 violations dont 153 nouvelles ; baseline inchangée. |
| `npm test` | 55 assertions backend passent, puis arrêt sur `@biscuit-auth/biscuit-wasm` absent ; suites suivantes non exécutées. |
| `cargo test --workspace` | Échec de lien PDB `LNK1318 LIMIT (12)` sur `token_bucket` et `topology_transition` ; C: presque saturé. |
| Contrôles ciblés | 14 commandes sur 16 passent ; assertions fonctionnelles, sans comparaison scientifique. |

Les deux échecs ciblés attendent des raccourcis de provenance : tampon système
à partir d'un identifiant `seed-*`, et promotion avec le seul booléen
`independentVerification`. Le code actuel exige des attributs de vérification
pour la mémoire et un reçu vérifié pour la promotion. Leur correction doit
conserver les cas de refus et ajouter des preuves au cas positif.

Après l'échec Rust, seuls les deux PDB incomplets et les symboles de treize exemples
créés pendant cette compilation ont été retirés, sous `target/debug`, avec contrôle
des chemins et dates. Environ 2 Go ont été récupérés. Aucun succès de test Rust
n'est déduit de la compilation partielle.

Le premier appel de checkpoint GenOS a expiré sans fichier. Lors de la reprise P0,
un nouvel appel a réussi et son fichier a été observé. La persistance GenOS des
décisions et expériences demeure distincte de la vérification et de la promotion.

## Qualification initialement à poursuivre (historique)

| Priorité | Travail | Critère observable |
| --- | --- | --- |
| B01 | Rétablir la dépendance Biscuit et exécuter la chaîne Node interrompue | Autorité et suites aval réellement exécutées. |
| B02 | Trier les 153 violations nouvelles sans relâcher la baseline | Corrections attribuables, puis gate sans nouvelle dette. |
| B03 | Aligner les deux tests de provenance | Raccourcis refusés, cas positif soutenu par preuve qualifiée. |
| B04 | Raccorder MsgPack et qualifier sa persistance | Référence résolue, aller-retour réel et entrée corrompue contrôlée. |
| B05 | Qualifier les pilotes code, mémoire et raisonnement vérifiable | Oracle réel, état initial épinglé, baseline et cas négatif. |
| B06 | Lire les consommateurs candidats, d'abord L01 à L05 et L22 | Parcours d'exécution identifié et effets relus. |
| B07 | Vérifier la reprise du checkpoint | Appel réussi et fichier relu ; acquis lors de la reprise. |

Les pilotes doivent séparer réussite fonctionnelle et amélioration comparative.
Un reçu signé garantit une provenance selon son contrat, pas la vérité de la tâche.
Le test de transfert GVX utilise un vérificateur injecté retournant `verified: true` ;
il qualifie le cycle sur fixture, pas un gain du receveur. Les campagnes GVX holdout
et les baselines MBH-like/Lipson-like restent à qualifier conformément au
[plan de puissance](../02-orchestration/plan-puissance-benchmark-gvx.md).

À cette passe initiale, P0 conserve sa couverture complète et ses écarts ouverts.
Sa clôture exige alors les consommateurs qualifiés et les trois pilotes ; aucun
gain de recherche ni passage à P1 n'est annoncé par la seule couverture du catalogue.
Ces obligations sont closes par les reprises ultérieures au périmètre consolidé
en tête de document.

## Reprise P0 après le commit documentaire

Le commit `8d2893d2` conserve la baseline ci-dessus. La reprise apporte des
corrections limitées et des qualifications exécutées, sans absorber les autres
changements du checkout.

### Provenance et promotion

Les deux tests anciens sont alignés sur les contrats actuels : un identifiant
`seed-*` seul reste non authentifié ; un booléen d'indépendance ne remplace pas
un reçu vérifié. Les cas positifs ont les attributs attendus et les cas négatifs
contrôlent absence de confiance et signature modifiée.

Un contre-exemple supplémentaire a révélé que le garde philosophique acceptait
des reçus indépendants correctement signés avec statut `refuted` ou `inconclusive`.
Le test échoue avant correction. `hasIndependentSupport` exige maintenant aussi
`status === 'verified'`. Les reçus négatifs du test passent leur validation HMAC
mais restent inéligibles ; le reçu positif reste éligible. Ce contrôle qualifie
le statut de support, pas une preuve d'expérience subjective ni une théorie.

### MsgPack et consommateurs

`msgpack` est ajouté à l'inventaire et raccordé à `bioPolymerPersistenceService`.
Le contrat reste `executable: false`. Le test
`test_ontogenesis_msgpack_interface.js` est découvert par la suite ontogenesis.
Les comptes d'inventaire attendus dans les tests sont ajustés de 704 à 705.

L'aller-retour du codec, l'entrée tronquée, la migration SQLite réelle des six
colonnes BLOB et son idempotence passent. Le consommateur
`biomimeticSignalingBus` est lu et sa suite passe sous `NODE_ENV=test` ;
`agentDnaStore` est identifié comme autre consommateur, sans qualification
supplémentaire de son cycle par cet audit. La sérialisation n'atteste pas à elle
seule l'intégrité cryptographique ou le bénéfice d'un transfert.

### Trois pilotes fonctionnels bornés

Les sondes utilisent `runTestAdapter`, `resolveSandboxTarget` et `runIsolated`.
Les capsules contiennent un script d'oracle épinglé, des données et un candidat.
Elles exécutent la commande autorisée `npm test` ; le premier essai direct
`node oracle.cjs` est refusé et conservé comme résultat inconclusif.

| Pilote | Baseline | Candidat | Oracle retiré |
| --- | --- | --- | --- |
| Code | Soustraction présentée comme addition : réfutée | Addition correcte sur cinq paires : vérifiée | Inconclusif |
| Mémoire | Préfixe seed sans attribut qualifié : réfuté | Attribut `systemSigned` fourni par la fixture de confiance : contrat de scoring vérifié | Inconclusif |
| Raisonnement | Parité impaire de n(n+1) : réfutée | Parité paire sur sept entiers : vérifiée | Inconclusif |

Les neuf contrôles passent et conservent IDs d'exécution, codes de sortie,
durées et empreintes des données, candidats et services. Les candidats sont
écrits à la main et les jeux synthétiques sont finis. Aucun modèle IA, holdout,
réplication ou apprentissage n'est mesuré. La parité n'est pas une preuve Lean
universelle ; l'authentification amont des attributs mémoire reste à qualifier.

### Environnement et dette restante

Biscuit 0.5.0 et treize paquets Sodium/OpenTelemetry manquants sont rétablis
depuis les versions verrouillées. Chaque archive est contrôlée contre son SHA-512
dans le lockfile ; ni manifeste ni lockfile ne sont modifiés par cette opération.
La commande complète `npm test` passe avec un code de sortie 0, après correction
du garde. Les suites aval capsules, OpenTelemetry, workers et Garage sont exécutées.

`cargo test -p genos-store --lib` passe ses 17 tests. Le dernier contrôle global
de qualité trouve 298 violations, dont 153 nouvelles réparties sur 97 fichiers.
La baseline n'est pas relâchée. Le résultat Rust ciblé ne valide pas le workspace
entier précédemment arrêté au lien PDB.

Le gate explicite `--staged` contrôle les huit fichiers sources de cette reprise :
une violation déjà admise par la baseline, aucune nouvelle. Le hook configuré
s'exécute également et accepte les huit fichiers sources. Il exige en outre un
bloc `Receipt:` énumérant exactement les fichiers du commit ; ce bloc est ajouté.

Les preuves de reprise, scripts de sondage et matrices actualisées restent dans
le sous-dossier local `p0-audit/continuation`. Les corrections ne ferment pas les
obligations de holdout, de qualification complète des consommateurs, de provenance
amont mémoire et de correction de la dette globale.

## Seconde reprise P0 : consommateurs des reçus et de l'ADN

La mise à jour des Pages audit et plan est autorisée explicitement par l'utilisateur
et réussit. Une relecture conserve les 649 références uniques ; C576 est accessible.

### Trois contre-exemples supplémentaires

Le sondage du gate général `require_independent_verification`, hors contexte
philosophique, accepte initialement trois reçus correctement signés : `verified`,
`refuted` et `inconclusive`. Il exige maintenant `independent === true` et le statut
`verified` ; les deux autres résultats restent signés mais sont inéligibles.

`validateReceipt` accepte initialement une chaîne contenant le digest attendu à
la place du tableau des vérificateurs approuvés. Il exige maintenant un tableau ;
chaîne, null, objet et Set sont refusés sans être assimilés à une liste de confiance.

Sur une vraie connexion SQLite en lecture seule (`PRAGMA query_only = ON`),
`claimVerifierNonce` retourne initialement null malgré l'échec d'écriture et
`applyPostPromotionPolicies` retourne success. La correction produit une violation
`receipt_nonce_storage` et bloque les opérations aval. Une insertion doit attester
exactement une ligne modifiée ; zéro signifie reçu rejoué, une réponse absente ou
non confirmée signifie stockage indisponible. Le test conserve le cas positif et
vérifie qu'un second appel ne crée aucune ligne supplémentaire.

Ces contrôles qualifient le gate général et son API d'application après promotion.
Le consommateur `strategyPromotionGate.applyPostPromotion` ne transmet pas de reçu
indépendant dans son contexte actuel ; sa clôture utilise une nouvelle assemblée
AEIS liée au run. La protection durable par nonce de cette voie complète n'est donc
pas déduite du test de l'API. Lier chaque reçu aux obligations et à la décision reste
un travail de qualification distinct.

### Consommateurs ADN et mémoire

`test_agent_dna.js` passe : décodage, expression de secours, sauvegarde et relecture
SQLite, sélection et import de 24 génomes. Le trajet `saveGenome → phenotype_blob
MsgPack → bestMatch → selectGenome` est lu ; les cas de sélection du test passent.
`test_agent_dna_integration_closure.js` passe ses neuf contrôles, notamment effet
de la méthylation sur le lease réel et propagation GRN. Ses mesures de fitness et
son attestation JSON locale sont synthétiques, sans gain IA ni preuve de confiance
cryptographique nouvelle.

`test_cognitive_epistemic_check.js` passe les contrôles de schéma et de reçus.
Ses commandes echo sont des fixtures de transport, pas des preuves SMT ou Lean.
La lecture de `vectorMemoryCorpus` confirme que les éléments hydratés depuis SQL
ne recopient pas les attributs de vérification libres dans le scoring.

Six sondes du `verificationKernel` passent : même affirmation, autre ID, autre
empreinte, réfutation, résultat inconclusif et vérificateur dépendant. Les reçus
étrangers restent non vérifiés ; aucune de ces évaluations ne donne directement
l'éligibilité à la promotion. Les reçus et profils sont des fixtures, sans oracle
de vérité exécuté par ce sondage.

La suite complète `npm test` passe à nouveau. Le gate staged accepte les quatre
fichiers sources de cette seconde reprise avec zéro violation. Les deux tests Rust
initialement bloqués au lien PDB, `token_bucket` et `topology_transition`, passent
lors de la relance ciblée : 12 et 1 tests réussis.

La relance `cargo test --workspace -j 1` échoue ensuite avec code 101 au lien de
l'exemple `mission_autopoiesis`, erreur LNK1201 d'écriture PDB. Le disque ne conserve
plus que 162 Mo libres. Aucune exécution des tests du workspace n'est annoncée.
Les 29 fichiers de symboles PDB générés pendant cette relance et la relance ciblée
sont retirés après contrôle des chemins, tailles et dates sous `target/debug/deps`
et `target/debug/examples` ; environ 2,11 Go sont récupérés. Les journaux restent
conservés et la validation Rust globale demeure ouverte.

Le contrôle global observe désormais 297 violations, dont 153 nouvelles, sans
modification de baseline. Les journaux et contre-exemples de cette reprise restent
dans `p0-audit/continuation/phase-2`.

## Troisième reprise P0 : consommer le lot avant la promotion réelle

Le contre-exemple du parcours `approveRun` échoue avant correction : le contrôle
placé devant le vrai pipeline ne trouve pas la table des nonces. Le reçu accepté
par les gates n'était donc pas consommé durablement avant les premiers effets.

La correction relit l'assemblée persistée et vérifie son sceau, son run propriétaire,
son périmètre issu de SQLite et son acceptation. Chaque reçu indépendant doit être
positif et lié à l'empreinte de son résultat. Tous les nonces sont ensuite consommés
dans une transaction avant le pipeline. Un rejet annule les insertions du lot.
La décision et ses limites figurent dans l'[ADR 0343](../adr/0343-consommation-des-recus-avant-promotion.md).

Le test du parcours réel utilise deux répliques indépendantes de vérification
exécutables et délègue au vrai pipeline. Il observe les nonces persistés avant
ses effets ; un trigger SQLite refusant leur insertion empêche tout appel au
pipeline et laisse le run en attente d'approbation. Les tests complémentaires
refusent un autre run, un autre périmètre, un résultat étranger, des reçus signés
négatifs et un nonce numérique. Ils vérifient le rollback d'un lot partiellement
rejoué, une connexion SQLite en lecture seule et le rejeu concurrent sur deux
connexions réelles : une seule consommation réussit. Les assemblées de ces tests
complémentaires sont des fixtures signées, sans oracle de vérité scientifique.

La suite complète `npm test` passe à la relance. Le premier essai échoue sur un
renommage de snapshot temporaire (`EPERM`) avant les tests de reçus ; les deux
journaux sont conservés. Le contrôle qualité final examine 5 260 fichiers sources :
297 violations, dont 153 nouvelles, sans modification de baseline. Le workspace
Rust n'est pas relancé après les échecs de lien PDB et la récupération de disque
documentés dans la seconde reprise ; sa validation reste ouverte.

La protection qualifiée concerne le rejeu du même lot et le refus avant les effets.
La transaction ne couvre pas les effets externes du pipeline. Elle ne garantit ni
une exécution exactement une fois après crash, ni la sérialisation d'approbations
produisant deux lots frais. Un échec aval conserve les nonces consommés. Les
holdouts, les comparaisons scientifiques et les autres consommateurs restent à
qualifier. Les preuves de cette reprise sont dans `p0-audit/continuation/phase-3`.

## Quatrième reprise P0 : B06 partiel — provenance mémoire et bornes de reprise/concurrence

Le mapping externe des lots L01 à L05 et L22 (programme de recherche, liens
`chatgpt.com/space`) n'existe pas dans le dépôt ; seul B06 les cite. Cette
reprise qualifie donc B06 par parcours fonctionnels, sans prétendre couvrir un
lot externe : provenance mémoire d'une part, reprise et concurrence des
promotions d'autre part. Aucune équivalence lot externe ↔ domaine interne
n'est inférée.

### Parcours mémoire réellement lu

`vectorMemoryService.searchMemory` → `vectorMemoryCorpus.fetchCorpus` →
hydratation SQL (`hydrateTrajectories`, `hydrateDecisions`, requêtes de repli)
→ `memoryScoring.scoreCorpusItem`. Les constructeurs hydratés
(`buildDecisionItem`, `buildFallbackDecisionItem`, `buildTrajectoryItem`,
`buildFallbackTrajectoryItem`) ne recopient que `id, title, category, status,
summary/content, tags, author, createdAt, synaptic_weight, vector, distance,
f_score, rrf_score`. Aucun attribut libre de vérification (`verified`,
`is_verified`, `internalSignature`, `systemSigned`) n'est recopié depuis SQL.
Le boost de crédibilité `×1.2` et le marqueur `[VERIFIED_SYSTEM_FACT]`
(`memoryScoring.isAuthenticSystemFact`) exigent un tel attribut déjà présent
sur l'item scoré ; un `id` en `seed-*` ou un `author` auto-déclaré seul ne
l'obtient pas. Vérifié : `seed-fake-001`/`memory_seed` sans attribut reste à
crédibilité `1.0`, sans marqueur ; le même item avec `systemSigned: true`
obtient le marqueur et le boost (écart mesuré `0.0053` contre `0.0158` sur
requête disjointe, avant clamp).

`graphRagService.fetchConnectedDecisions` ne sélectionne que les colonnes
sûres (`id, title, category, content, created_by, created_at,
synaptic_weight, embedding_blob`) ; aucune voie d'hydratation revue ne
transporte d'attribut de vérification libre vers le scoring.

`test_memory_quality_provenance_contamination.js` passe ses six contrôles :
vecteur 768-D normalisé, prompt préservé, isolation multi-tenant stricte
(`org_alpha` contre `org_beta`), refus du spoof (`author: system` et `id`
seed seul sans marqueur, `systemSigned` seul avec marqueur), rejet des
hallucinations dans `compileExecutionMemory` (`null` sur placeholder,
`Failure` sur échec), vésicules cloisonnées par destinataire.

Limites mémoire conservées : l'authentification amont de `systemSigned` /
`verified` (qui signe, avec quelle clé et quel contrôle à l'écriture) reste à
qualifier ; les `SEED_EXPERIENCES` en mémoire n'ont aucun attribut et ne sont
pas boostées. Écart relevé sans correction dans cette reprise :
`graphRagService` accepte les lignes globales via `OR ... IS NULL`
inconditionnel, alors que `vectorMemoryCorpus` exige `includeGlobal: true`
explicite ; l'incohérence de portée globale entre les deux chemins reste à
trancher. Aucun gain IA, holdout ou apprentissage n'est mesuré.

### Parcours promotion réellement relu

`strategyExecutionService.approveRun` : contexte de promotion → autorité →
rapport de preuve exigé → preuve d'approbation → confinement →
`evaluateAeisPromotion` → contexte de gate → contraintes du modèle de soi →
`assertPromotionGate` → `promotionVerifierNonceService.consume` (transaction :
périmètre propriétaire du run en `awaiting_approval`, relecture de l'assemblée
persistée, liaison run/scope, assemblée acceptée, reçus indépendants tous
positifs et liés à l'empreinte de leur résultat, consommation des nonces) →
`runPromotionPipeline` → mise à jour métriques → `applyPostPromotion` →
`finalizePromotion` (`markPromotionComplete`, `recordPromotionMemory`,
télémétrie). La consommation précède donc le pipeline ; un trigger refusant
l'insertion empêche tout appel au pipeline et laisse le run en attente.

`test_approve_run_deferred_promotion.js` passe : refus sans rapport, refus
sans reçus indépendants signés, acceptation avec deux reçus AEIS réels issus
de deux répliques exécutables (`npm test` sur fixtures), nonces observés
persistés avant les effets du pipeline, mémoire immunitaire résolue une fois,
rejeu du même run refusé, écriture nonce en échec bloquante, réfutation
comptée sans promotion.

`test_promotion_verifier_nonces.js` passe : liaison (autre run, autre scope,
`refuted`, `inconclusive`, résultat étranger, nonce numérique refusés avec
`PROMOTION_RECEIPT_BINDING`), rollback (lot partiellement rejoué annulé sans
résidu, lecture seule refusée), rejeu concurrent sur une connexion (un seul
succès) et sur deux connexions SQLite réelles (un seul succès,
`promotionNonceConcurrency.assertSeparateConnections`), run terminé refusé.

Limites de reprise et de concurrence confirmées par lecture, inchangées :
la transaction ne couvre que la consommation des nonces, pas les effets
externes du pipeline ; un échec aval conserve les nonces consommés sans
rejeu du même lot ; deux approbations produisant deux lots frais distincts
ne sont pas sérialisées ; un crash entre consommation et finalisation laisse
des nonces consommés pour un run non finalisé ; `applyPostPromotion`
(`strategyPromotionGate`) ne transmet pas de reçu indépendant dans son
contexte actuel, la protection durable de cette voie repose uniquement sur
le `consume` en amont. Aucune exécution exactement-une-fois après crash ni
bénéfice scientifique n'est annoncé.

B06 reste ouvert : autres consommateurs (holdouts, comparaisons, chemins hors
mémoire/promotion) et mapping L01-L05/L22 externe à fournir avant clôture P0.

## Cinquième reprise P0 : B02 résorbé et verrous mémoire entérinés

Le contrôle global `scripts/ci/check_code_quality.py` observe 5 323 fichiers :
112 violations, toutes admises par la baseline, **0 nouvelle**. Les 153
nouvelles violations de la baseline initiale sont résorbées sans relâchement
de la baseline. Le gate `--staged` reste vert sur les fichiers de ces reprises.

Deux verrous complètent B06 : la portée globale GraphRAG exige désormais un
flag explicite (`includeGlobal`/`allowGlobal`), comme le corpus
(`graphRagService.scopeFilter`) ; un test verrouille que `genome_decisions`
ne porte aucune colonne `verified`/`is_verified`/`internalSignature`/
`systemSigned`, que `storeMemory` les ignore et qu'un `id` en `seed-*` seul
reste sans marqueur (`test_memory_provenance_nonforgeable.js` : PASS).

## Sixième reprise P0 : validation Rust ciblée

`cargo test -p genos-store --lib` : 17/17 passent. `cargo test
-p genos-orchestrator --test token_bucket` : 12/12 passent.
`topology_transition` : 1/1 passe. Disque C: 5,62 Go libres au moment de
ces runs (contre 162 Mo lors de l'échec de lien PDB documenté). Le workspace
global (`cargo test --workspace`) n'est pas relancé dans cette reprise et sa
validation reste ouverte ; ces résultats ciblés ne la valident pas.

## Septième reprise P0 : pilotes sandbox et reprise checkpoint (B05/B07)

`test_aeis_sandbox.js` : 9/9 passent (`runIsolated` exécute `npm test`,
refus de `rm -rf /`, `exitCode != 0` détecté, `runTestAdapter` et
`runArtifactAdapter` réels, indépendance évaluée avant signature, reçus
d'indépendance valides). Les sondes pilotes B05 restent exécutables sur
fixtures, sans holdout ni gain IA mesuré.
`cargo test -p genos-orchestrator --test checkpoint_recovery` : 5/5 passent
(création, plan de reprise, checkpoints horodatés, restauration durable de
lignée et d'état de veille, reprise de tick de reçu sans réutilisation de
séquence). B07 reste acquis : appel réussi et fichier relu, reprise vérifiée.

## Huitième reprise P0 : consommateurs L01–L05 et L22

Le mapping externe a été retrouvé et relu dans la Page « Plan de réalisation
et de validation de GenOS » : 115 références couvrent ces six lots. La demande
historique de fournir ce mapping est levée. La qualification distingue les
parcours réellement exécutés, les tests de contrat et les interfaces non exercées.

Le [rapport de qualification](qualification-consommateurs-p0-2026-10-07.md)
et sa [matrice nominative](matrice-consommateurs-l01-l05-l22-2026-10-07.md)
consignent les preuves et frontières : mémoire relue dans un nouveau processus,
provenance de promotion rattachée au run et au tenant, état gRPC réel, anti-rejeu
durable après échec aval. Deux lots frais distincts peuvent encore être réservés
pour un même run ; aucune sérialisation ni exécution exactement une fois n’est
revendiquée. Le lien global CLI/IDE/Studio/TUI et les holdouts restent partiels.

B06 reste partiel pour ces garanties plus fortes et les autres consommateurs.
Les nouveaux chemins corrigés ne démontrent pas les fonctionnalités de recherche
P1 proposées, une vérité philosophique ni un gain empirique IA.

## Neuvième reprise P0 : clôture B06

Le [rapport B06](qualification-b06-reprise-et-holdout-2026-10-07.md) clôture
la qualification des parcours P0 implémentés. Il documente les promotions
concurrentes avec lots frais, les six frontières de reprise du journal scellé,
la publication Windows bornée, la provenance mémoire et un pilote IA réel.
Le Studio livré, le VSIX installé dans un hôte VS Code natif, le CLI `g` et
le TUI relisent le même run ; les refus de scope et de preuve restent actifs.
Les limites historiques ci-dessus sont conservées comme résultats des passes
antérieures. Les fonctionnalités scientifiques du plan restent à qualifier
séparément ; aucune généralisation du pilote synthétique n'est revendiquée.

## Dixième reprise P0 : trois pilotes comparatifs B05

Le [rapport B05](qualification-trois-pilotes-comparatifs-2026-10-07.md)
clôture les trois pilotes exploratoires code, mémoire et raisonnement avec
données versionnées, huit cas réservés par pilote, quatre bras, baselines,
ablations, budgets comparables et oracle distinct. Deux campagnes gelées de
96 résultats et 160 appels scorés chacune sont exécutées, la seconde par
un opérateur IA distinct via collaboration sans historique primaire.
Les reçus et coûts réels sont conservés ; 93 verdicts sur 96 concordent.

GenOS obtient 8/8 en code et mémoire dans chaque campagne, 0/8 puis 1/8
en raisonnement. Il égale les baselines code et raisonnement. Sans retrieval,
le pilote mémoire fait aussi 8/8 : aucun bénéfice du retrieval n'est démontré.
La première campagne Lean, invalidée pour une liaison multiligne défectueuse
avant lecture de ses scores réservés, reste conservée avec son amendement.
Aucune amélioration générale IA, promotion ou reproduction en laboratoire
externe n'est revendiquée.

Validation finale native : qualité 0 nouvelle violation, `npm test` code 0,
`cargo test --workspace` 673 tests réussis. Les résultats historiques des
reprises précédentes restent datés ; B05 est acquis pour ce périmètre borné.
